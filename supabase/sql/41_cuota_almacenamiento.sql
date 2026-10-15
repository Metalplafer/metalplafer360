-- =====================================================================
-- METALPLAFER360 · CUÁNTO ESPACIO QUEDA
--
--
-- EL PROBLEMA
--
-- «Configuración → Almacenamiento» dice cuánto ocupan los archivos, pero
-- no dice CUÁNTO CABE. Sin eso, el número no sirve para decidir nada: 4
-- GB puede ser poquísimo o estar al borde, según el plan contratado.
--
--
-- POR QUÉ LA CUOTA SE ESCRIBE A MANO
--
-- Porque NO se puede consultar desde la base de datos. El límite del
-- plan vive en la facturación de Supabase, no en PostgreSQL: no hay
-- ninguna tabla ni función que lo diga. Así que se pregunta, se escribe
-- una vez y queda claro en pantalla que es UN DATO DECLARADO, con la
-- fecha en que se comprobó. Lo que no se hace es inventarse una cifra y
-- pintar una barra que parezca medir algo cuando no mide nada.
--
-- Mientras no se declare, la pantalla dice «sin declarar» y explica
-- dónde mirarlo. No hay ningún valor por omisión: NULL significa «no lo
-- sabemos», y eso es más honrado que un número inventado.
--
--
-- LAS TRES COSAS QUE OCUPAN, SEPARADAS
--
--   · ARCHIVOS · las fotografías, los vídeos, las firmas y los
--     documentos. Van al contenedor de Supabase Storage.
--   · BASE DE DATOS · las filas. Esto SÍ se puede medir de verdad, con
--     «pg_database_size».
--   · COPIAS DE SEGURIDAD · las que hace la aplicación y sube a Drive.
--     Ocupan en Drive, NO en Supabase, así que se cuentan aparte y no
--     entran en la cuota de Supabase. Decirlo importa: sumarlas daría un
--     porcentaje falso.
--
-- Tienen cuotas distintas y NO se suman en una sola barra.
--
--
-- ARCHIVOS REGISTRADOS Y ARCHIVOS DE VERDAD
--
-- «storage_usage» suma lo que hay en la tabla «documents», que es lo que
-- la aplicación conoce. Si alguna vez se subió algo y su fila se perdió,
-- ese archivo sigue ocupando y no aparecía por ningún lado.
--
-- Aquí se miden LAS DOS COSAS y se enseña la diferencia: lo registrado y
-- lo que hay de verdad en el contenedor. Si no cuadran, se ve.
--
--
-- LOS AVISOS
--
-- Por debajo del 70 % no se dice nada. Del 70 al 90 % se avisa. Por
-- encima del 90 % se avisa en rojo. Son los umbrales que usa la
-- pantalla, están aquí escritos y se pueden cambiar en un sitio.
--
--
-- TODO ES ADITIVO: cuatro columnas nuevas que empiezan vacías y una
-- función de lectura. No se toca ninguna fila ni ningún cálculo que ya
-- existiera, y «storage_usage» se queda tal cual.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LA CUOTA DECLARADA
--
-- Nace VACÍA. Vacío quiere decir «no lo sabemos», no «sin límite».
-- ---------------------------------------------------------------------
alter table public.app_settings
  add column if not exists storage_quota_mb      bigint,
  add column if not exists db_quota_mb           bigint,
  add column if not exists quota_checked_on      date,
  add column if not exists quota_note            text;

comment on column public.app_settings.storage_quota_mb is
  'Cuánto cabe en el almacén de archivos, en MB. DECLARADO A MANO: el plan no se puede consultar desde aquí. Vacío = sin declarar.';
comment on column public.app_settings.db_quota_mb is
  'Cuánto cabe en la base de datos, en MB. DECLARADO A MANO. Vacío = sin declarar.';
comment on column public.app_settings.quota_checked_on is
  'El día en que se comprobaron esas cifras en Supabase. Sirve para saber si están viejas.';
comment on column public.app_settings.quota_note is
  'De dónde salieron: el plan contratado, quién lo miró, lo que haga falta recordar.';

-- Una cuota de cero o negativa no significa nada: o hay cifra o no hay.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_settings_cuotas_positivas') then
    alter table public.app_settings add constraint app_settings_cuotas_positivas
      check ((storage_quota_mb is null or storage_quota_mb > 0)
         and (db_quota_mb is null or db_quota_mb > 0));
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2) LOS UMBRALES, EN UN SOLO SITIO
--
-- La pantalla no decide los colores por su cuenta: pregunta aquí. Así no
-- hay dos umbrales distintos diciendo cosas distintas.
-- ---------------------------------------------------------------------
create or replace function public.quota_level(p_usado bigint, p_cuota bigint) returns text
language sql immutable as $$
  select case
           when p_cuota is null or p_cuota <= 0 then 'sin_cuota'
           when p_usado::numeric / p_cuota >= 0.90 then 'critico'
           when p_usado::numeric / p_cuota >= 0.70 then 'atencion'
           else 'bien'
         end;
$$;

comment on function public.quota_level(bigint, bigint) is
  'Cómo va de espacio: bien (<70 %), atencion (70-90 %), critico (>=90 %) o sin_cuota si no se ha declarado.';


-- ---------------------------------------------------------------------
-- 3) EL RESUMEN
--
-- Una fila por cosa que ocupa, con lo usado, lo que cabe, lo que queda y
-- el aviso. Solo administración.
--
-- Es barato: «documents» se agrupa (ya hay índice), «pg_database_size»
-- es una lectura del catálogo y el recuento del contenedor es un
-- «sum» sobre «storage.objects». Nada recorre archivos.
-- ---------------------------------------------------------------------
create or replace function public.storage_summary()
returns table (
  concepto     text,
  usado_bytes  bigint,
  cuota_bytes  bigint,
  libre_bytes  bigint,
  porcentaje   numeric,
  nivel        text,
  medido       boolean,      -- ¿lo hemos medido o nos lo han dicho?
  detalle      text
)
language plpgsql stable security definer set search_path = public as $$
declare
  s                public.app_settings;
  v_archivos       bigint;
  v_papelera       bigint;
  v_contenedor     bigint;
  v_db             bigint;
  v_copias         bigint;
  v_cuota_archivos bigint;
  v_cuota_db       bigint;
begin
  perform public.assert_admin();

  select * into s from public.app_settings where id = 1;
  v_cuota_archivos := s.storage_quota_mb * 1024 * 1024;
  v_cuota_db       := s.db_quota_mb * 1024 * 1024;

  -- LO REGISTRADO: lo que la aplicación conoce.
  select coalesce(sum(size_bytes) filter (where deleted_at is null), 0),
         coalesce(sum(size_bytes) filter (where deleted_at is not null), 0)
    into v_archivos, v_papelera
    from public.documents;

  -- LO QUE HAY DE VERDAD en el contenedor. Si por lo que sea no se puede
  -- mirar, se deja en nulo y se dice: mejor un hueco que una cifra falsa.
  begin
    -- TODOS los contenedores, no solo el de la aplicación: lo que ocupa
    -- en Supabase es todo lo que hay ahí, y si algún día se añade otro
    -- contenedor también cuenta para la cuota.
    select coalesce(sum((metadata ->> 'size')::bigint), 0) into v_contenedor
      from storage.objects;
  exception when others then
    v_contenedor := null;
  end;

  -- LA BASE DE DATOS: esto sí se mide.
  begin
    select pg_database_size(current_database()) into v_db;
  exception when others then
    v_db := null;
  end;

  -- LAS COPIAS: ocupan en Drive, no en Supabase.
  begin
    select coalesce(sum(size_bytes), 0) into v_copias from public.backups;
  exception when others then
    v_copias := null;
  end;

  return query
    -- 1) ARCHIVOS · con su cuota declarada
    select 'Archivos'::text,
           v_archivos + v_papelera,
           v_cuota_archivos,
           case when v_cuota_archivos is null then null
                else greatest(v_cuota_archivos - (v_archivos + v_papelera), 0) end,
           case when v_cuota_archivos is null then null
                else round((v_archivos + v_papelera)::numeric * 100 / v_cuota_archivos, 1) end,
           public.quota_level(v_archivos + v_papelera, v_cuota_archivos),
           true,
           'Fotografías, vídeos, firmas y documentos, incluida la papelera.'
    union all
    -- 2) LA PAPELERA · dentro de los archivos, pero se puede recuperar
    select 'De eso, en la papelera', v_papelera, null::bigint, null::bigint,
           case when v_archivos + v_papelera = 0 then 0
                else round(v_papelera::numeric * 100 / (v_archivos + v_papelera), 1) end,
           'bien', true,
           'Sigue ocupando hasta que se elimina del todo. Es el espacio más fácil de recuperar.'
    union all
    -- 3) EL CONTENEDOR DE VERDAD · para ver si cuadra con lo registrado
    select 'Medido en el contenedor', v_contenedor, v_cuota_archivos,
           case when v_cuota_archivos is null or v_contenedor is null then null
                else greatest(v_cuota_archivos - v_contenedor, 0) end,
           case when v_cuota_archivos is null or v_contenedor is null then null
                else round(v_contenedor::numeric * 100 / v_cuota_archivos, 1) end,
           public.quota_level(v_contenedor, v_cuota_archivos),
           v_contenedor is not null,
           case
             when v_contenedor is null then
               'No se ha podido mirar el contenedor. La cifra de arriba es la que conoce la aplicación.'
             when v_contenedor > v_archivos + v_papelera then
               'Hay ' || pg_size_pretty(v_contenedor - (v_archivos + v_papelera))
               || ' más en el contenedor que en la aplicación: algún archivo perdió su ficha.'
             when v_contenedor < v_archivos + v_papelera then
               'La aplicación cuenta ' || pg_size_pretty((v_archivos + v_papelera) - v_contenedor)
               || ' más de lo que hay en el contenedor: alguna ficha quedó sin archivo.'
             else 'Cuadra con lo que conoce la aplicación.'
           end
    union all
    -- 4) LA BASE DE DATOS · con su propia cuota
    select 'Base de datos', v_db, v_cuota_db,
           case when v_cuota_db is null or v_db is null then null
                else greatest(v_cuota_db - v_db, 0) end,
           case when v_cuota_db is null or v_db is null then null
                else round(v_db::numeric * 100 / v_cuota_db, 1) end,
           public.quota_level(v_db, v_cuota_db),
           v_db is not null,
           'Las filas: clientes, proyectos, partes, historial. Nada que ver con los archivos.'
    union all
    -- 5) LAS COPIAS · en Drive, fuera de la cuota de Supabase
    select 'Copias de seguridad', v_copias, null::bigint, null::bigint, null::numeric,
           'sin_cuota', v_copias is not null,
           'Se suben a Google Drive, así que ocupan ALLÍ y no cuentan en la cuota de Supabase.';
end $$;

comment on function public.storage_summary() is
  'Cuánto ocupa cada cosa y cuánto cabe. Las cuotas son DECLARADAS A MANO: el plan no se puede consultar desde la base de datos.';

grant  execute on function public.storage_summary() to authenticated;
revoke execute on function public.storage_summary() from anon, public;
grant  execute on function public.quota_level(bigint, bigint) to authenticated;
revoke execute on function public.quota_level(bigint, bigint) from anon, public;


-- ---------------------------------------------------------------------
-- 4) GUARDAR LA CUOTA
--
-- Solo administración, y pasando por aquí: así queda en el historial
-- quién la declaró y cuándo, que es justo lo que hace falta saber dentro
-- de seis meses para no fiarse de una cifra vieja.
--
-- Mandar nulo BORRA la cuota a propósito: es la manera de decir «ya no
-- me fío de este dato», y es mejor que dejar una cifra que nadie ha
-- comprobado.
-- ---------------------------------------------------------------------
create or replace function public.save_storage_quota(
  p_storage_mb bigint default null,
  p_db_mb      bigint default null,
  p_nota       text    default null)
returns public.app_settings
language plpgsql security definer set search_path = public as $$
declare s public.app_settings;
begin
  perform public.assert_admin();

  if p_storage_mb is not null and p_storage_mb <= 0 then
    raise exception 'La capacidad de los archivos tiene que ser mayor que cero. Si no la sabes, déjala en blanco.'
      using errcode = '22023';
  end if;
  if p_db_mb is not null and p_db_mb <= 0 then
    raise exception 'La capacidad de la base de datos tiene que ser mayor que cero. Si no la sabes, déjala en blanco.'
      using errcode = '22023';
  end if;

  update public.app_settings
     set storage_quota_mb = p_storage_mb,
         db_quota_mb      = p_db_mb,
         quota_note       = nullif(btrim(coalesce(p_nota, '')), ''),
         -- Solo se fecha si hay algo declarado. Borrarlo todo borra
         -- también la fecha: no hay nada que fechar.
         quota_checked_on = case when p_storage_mb is null and p_db_mb is null
                                 then null else public.today_madrid() end,
         updated_at       = now()
   where id = 1
  returning * into s;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, summary, details)
  values (auth.uid(), public.actor_name(), 'cuota_almacenamiento', 'app_settings',
          case when p_storage_mb is null and p_db_mb is null
               then public.actor_name() || ' retiró la capacidad declarada del almacenamiento'
               else public.actor_name() || ' declaró la capacidad del almacenamiento: '
                    || coalesce(p_storage_mb || ' MB de archivos', 'archivos sin declarar')
                    || ' y ' || coalesce(p_db_mb || ' MB de base de datos', 'base de datos sin declarar')
          end,
          jsonb_build_object('storage_quota_mb', p_storage_mb,
                             'db_quota_mb', p_db_mb,
                             'nota', s.quota_note));
  return s;
end $$;

comment on function public.save_storage_quota(bigint, bigint, text) is
  'Declara a mano cuánto espacio hay contratado. Queda en el historial quién lo declaró y cuándo.';

grant  execute on function public.save_storage_quota(bigint, bigint, text) to authenticated;
revoke execute on function public.save_storage_quota(bigint, bigint, text) from anon, public;
