-- =====================================================================
-- METALPLAFER360 · MOVER LAS FICHAS ANTIGUAS DE «POR ASIGNAR»
--
--
-- ESTO ES OPCIONAL, y tiene menos ganancia que las otras dos.
--
-- Desde la migración 43, un presupuesto y un aviso nacen en «Pendiente»:
-- ya no llevan responsable administrativo, así que nacen donde empieza su
-- trabajo de verdad. Pero los que ya estaban siguen en «Por asignar», y
-- ahí se quedan: funcionan, se pueden editar, y si alguien les pone
-- responsable avanzan como antes. Eso está probado.
--
-- Lo único que molesta es que convivan DOS formas de estar pendiente. Si
-- preferís que no, esto las unifica.
--
-- LAS VISITAS NO SE TOCAN. Siguen naciendo «Por asignar» y siguen
-- asignándose a administración: ahí el estado significa algo.
--
--
-- EJECUTAR ESTE ARCHIVO NO CAMBIA NINGÚN DATO.
--
--   1) select * from public.por_asignar_simular();   -- qué haría
--   2) select * from public.por_asignar_aplicar();   -- hacerlo
--   3) select * from public.por_asignar_validar();   -- comprobarlo
--   4) select * from public.por_asignar_deshacer();  -- si hiciera falta
--
--
-- A QUÉ ESTADO PASA CADA UNA · y por qué no a uno cualquiera
--
-- Se usa la MISMA regla que el disparador aplica hoy cuando alguien le
-- pone responsable a una ficha antigua, para que el resultado sea el
-- mismo que si lo hubierais hecho a mano una por una:
--
--   · un PRESUPUESTO pasa a «Pendiente»;
--   · un AVISO pasa a «Asignado» si YA tiene operarios repartidos, y a
--     «Pendiente» si no tiene a nadie.
--
-- Esa distinción del aviso importa: un aviso con tres operarios dentro
-- está asignado de verdad, y dejarlo en «Pendiente» sería decir algo
-- falso sobre el trabajo.
--
--
-- LO QUE NO HACE
--
-- NO toca el responsable («assigned_to»), ni el equipo, ni las fechas,
-- ni los importes, ni los comentarios, ni el histórico. Solo la columna
-- «status», y solo en las fichas que estén EXACTAMENTE en «Por asignar».
--
-- NO toca ninguna ficha archivada: si alguien la archivó en ese estado,
-- ahí se queda, porque ya no se trabaja con ella.
-- =====================================================================


-- ---------------------------------------------------------------------
-- EL DIARIO · qué ficha estaba en qué estado
--
-- Guarda el estado ANTERIOR de cada ficha que se mueve. Sin esto,
-- deshacerlo sería adivinar.
-- ---------------------------------------------------------------------
create table if not exists public.migracion_por_asignar (
  ficha_id    uuid primary key,
  estado_antes text not null,
  estado_despues text not null,
  -- Se guarda para poder COMPROBAR que la migración no lo ha tocado.
  responsable_antes uuid,
  aplicado_en timestamptz not null default now()
);

comment on table public.migracion_por_asignar is
  'Qué fichas movió la migración 49 y de qué estado venían. Solo sirve para poder deshacerla con exactitud.';

alter table public.migracion_por_asignar enable row level security;
revoke all on public.migracion_por_asignar from anon, authenticated;
grant  all on public.migracion_por_asignar to service_role;


-- ---------------------------------------------------------------------
-- 1) SIMULAR
--
-- Una fila por ficha que se movería, con el estado de ahora y el que
-- tendría. Mira la columna «operarios»: es lo que decide a dónde va un
-- aviso.
-- ---------------------------------------------------------------------
-- Se suelta antes de crearla: PostgreSQL no deja cambiar el tipo de
-- retorno con «create or replace», así que sin esto el archivo dejaría
-- de poder reejecutarse en cuanto se añadiera una columna al informe.
drop function if exists public.por_asignar_simular();
create or replace function public.por_asignar_simular()
returns table (
  ficha        text,
  tipo         text,
  titulo       text,
  operarios    bigint,
  responsable  text,
  estado_ahora text,
  pasaria_a    text)
language sql stable security definer set search_path = public as $$
  select f.code, f.type::text, coalesce(f.title, '—'),
         (select count(*) from public.ficha_workers w where w.ficha_id = f.id),
         coalesce((select p.full_name from public.profiles p where p.id = f.assigned_to), '—'),
         f.status,
         case f.type
           when 'presupuesto' then 'pendiente'
           when 'aviso' then
             case when exists (select 1 from public.ficha_workers w where w.ficha_id = f.id)
                  then 'asignado' else 'pendiente' end
           else 'NO SE TOCA · es una visita'
         end
    from public.fichas f
   where f.status = 'por_asignar'
     and f.archived_at is null
   order by f.type, f.code;
$$;

comment on function public.por_asignar_simular() is
  'Qué fichas movería la migración 49 y a qué estado. No cambia nada. Las visitas salen marcadas como intocables.';


-- ---------------------------------------------------------------------
-- 2) APLICAR
--
-- Solo presupuestos y avisos, solo si están en «Por asignar», y solo si
-- no están archivados.
--
-- NO se usa «app.restoring», y es a propósito. El disparador de estados
-- solo decide el estado al CREAR una ficha, y solo la hace avanzar
-- cuando cambia el responsable. Aquí no se crea nada y no se toca el
-- responsable, así que no hay nada que esquivar.
--
-- Y si se pusiera, se saltaría también el registro en el histórico, que
-- es justo lo que queréis conservar: así cada cambio queda escrito con
-- su fecha, como cualquier otro.
-- ---------------------------------------------------------------------
-- Se suelta antes de crearla: PostgreSQL no deja cambiar el tipo de
-- retorno con «create or replace», así que sin esto el archivo dejaría
-- de poder reejecutarse en cuanto se añadiera una columna al informe.
drop function if exists public.por_asignar_aplicar();
create or replace function public.por_asignar_aplicar()
returns table (movidas bigint, visitas_intactas bigint, detalle text)
language plpgsql security definer set search_path = public as $$
declare v_movidas bigint; v_visitas bigint;
begin
  if not public.is_admin() then
    raise exception 'Solo administración puede aplicar esta migración'
      using errcode = '42501';
  end if;

  select count(*) into v_visitas
    from public.fichas
   where status = 'por_asignar' and type = 'visita';

  with destino as (
    select f.id, f.status as antes,
           case f.type
             when 'presupuesto' then 'pendiente'
             else case when exists (select 1 from public.ficha_workers w
                                     where w.ficha_id = f.id)
                       then 'asignado' else 'pendiente' end
           end as despues
      from public.fichas f
     where f.status = 'por_asignar'
       and f.archived_at is null
       and f.type in ('presupuesto', 'aviso')
  ), movidas as (
    update public.fichas f
       set status = d.despues, updated_at = now()
      from destino d
     where f.id = d.id
    returning f.id, d.antes, d.despues, f.assigned_to as responsable
  )
  insert into public.migracion_por_asignar
    (ficha_id, estado_antes, estado_despues, responsable_antes)
  select m.id, m.antes, m.despues, m.responsable from movidas m
  on conflict (ficha_id) do nothing;

  select count(*) into v_movidas from public.migracion_por_asignar;

  return query
    select v_movidas, v_visitas,
           format('Se han movido %s fichas de «Por asignar». '
                  'Las %s VISITAS en ese estado NO se han tocado: ahí el estado '
                  'significa algo. No se ha cambiado ningún responsable, ni equipo, '
                  'ni fecha, ni importe, ni comentario.',
                  v_movidas, v_visitas);
end $$;

comment on function public.por_asignar_aplicar() is
  'Mueve los presupuestos y avisos antiguos de «Por asignar» al estado que les tocaría hoy. No toca las visitas ni nada más que la columna «status».';


-- ---------------------------------------------------------------------
-- 3) VALIDAR
-- ---------------------------------------------------------------------
-- Se suelta antes de crearla: PostgreSQL no deja cambiar el tipo de
-- retorno con «create or replace», así que sin esto el archivo dejaría
-- de poder reejecutarse en cuanto se añadiera una columna al informe.
drop function if exists public.por_asignar_validar();
create or replace function public.por_asignar_validar()
returns table (comprobacion text, resultado text)
language sql stable security definer set search_path = public as $$
  select 'Fichas movidas por esta migración', count(*)::text
    from public.migracion_por_asignar
  union all
  select 'Presupuestos o avisos que quedan en «Por asignar» sin archivar (debe ser 0)',
         count(*)::text
    from public.fichas
   where status = 'por_asignar' and archived_at is null
     and type in ('presupuesto', 'aviso')
  union all
  -- LAS VISITAS SIGUEN COMO ESTABAN. Si esta cifra bajara, habríamos
  -- tocado algo que no se debía tocar.
  select 'Visitas en «Por asignar» (no se han tocado)', count(*)::text
    from public.fichas
   where status = 'por_asignar' and type = 'visita'
  union all
  select 'Fichas movidas cuyo estado nuevo no es el previsto (debe ser 0)', count(*)::text
    from public.migracion_por_asignar m
    join public.fichas f on f.id = m.ficha_id
   where f.status is distinct from m.estado_despues
  union all
  -- NADA MÁS HA CAMBIADO: el responsable de cada ficha movida sigue
  -- siendo EXACTAMENTE el que era. Se compara con el que se guardó en el
  -- diario, así que esto lo comprueba de verdad en lugar de suponerlo.
  select 'Fichas movidas a las que ha cambiado el responsable (debe ser 0)', count(*)::text
    from public.migracion_por_asignar m
    join public.fichas f on f.id = m.ficha_id
   where f.assigned_to is distinct from m.responsable_antes
  union all
  select 'Avisos movidos a «Asignado» que no tienen operarios (debe ser 0)', count(*)::text
    from public.migracion_por_asignar m
    join public.fichas f on f.id = m.ficha_id
   where m.estado_despues = 'asignado'
     and not exists (select 1 from public.ficha_workers w where w.ficha_id = f.id);
$$;

comment on function public.por_asignar_validar() is
  'Comprueba que no queda ningún presupuesto ni aviso en «Por asignar», que las visitas no se han tocado y que no se ha cambiado ningún responsable.';


-- ---------------------------------------------------------------------
-- 4) DESHACER
--
-- Devuelve cada ficha al estado del que venía, pero SOLO si sigue en el
-- estado al que la dejó la migración. Si alguien la ha movido después,
-- se deja como está: volver a ponerla en «Por asignar» sería deshacer
-- trabajo de verdad.
-- ---------------------------------------------------------------------
-- Se suelta antes de crearla: PostgreSQL no deja cambiar el tipo de
-- retorno con «create or replace», así que sin esto el archivo dejaría
-- de poder reejecutarse en cuanto se añadiera una columna al informe.
drop function if exists public.por_asignar_deshacer();
create or replace function public.por_asignar_deshacer()
returns table (devueltas bigint, conservadas bigint, detalle text)
language plpgsql security definer set search_path = public as $$
declare v_devueltas bigint; v_conservadas bigint;
begin
  if not public.is_admin() then
    raise exception 'Solo administración puede deshacer esta migración'
      using errcode = '42501';
  end if;

  select count(*) into v_conservadas
    from public.migracion_por_asignar m
    join public.fichas f on f.id = m.ficha_id
   where f.status is distinct from m.estado_despues;

  with vuelta as (
    update public.fichas f
       set status = m.estado_antes, updated_at = now()
      from public.migracion_por_asignar m
     where f.id = m.ficha_id and f.status = m.estado_despues
    returning f.id
  )
  select count(*) into v_devueltas from vuelta;

  delete from public.migracion_por_asignar m
   using public.fichas f
   where f.id = m.ficha_id and f.status = m.estado_antes;

  return query
    select v_devueltas, v_conservadas,
           format('Se han devuelto %s fichas a «Por asignar». '
                  'Se han CONSERVADO %s porque alguien las movió después: devolverlas '
                  'sería deshacer trabajo de verdad.',
                  v_devueltas, v_conservadas);
end $$;

comment on function public.por_asignar_deshacer() is
  'Devuelve a «Por asignar» solo las fichas que movió la migración 49 y que nadie ha tocado después.';


grant  execute on function public.por_asignar_simular(), public.por_asignar_aplicar(),
                           public.por_asignar_validar(), public.por_asignar_deshacer()
       to authenticated;
revoke execute on function public.por_asignar_simular(), public.por_asignar_aplicar(),
                           public.por_asignar_validar(), public.por_asignar_deshacer()
       from anon, public;


-- ---------------------------------------------------------------------
-- AL TERMINAR · cuando esté dada por buena
--
--   drop function if exists public.por_asignar_simular();
--   drop function if exists public.por_asignar_aplicar();
--   drop function if exists public.por_asignar_validar();
--   drop function if exists public.por_asignar_deshacer();
--   drop table    if exists public.migracion_por_asignar;
--
-- Mientras exista «migracion_por_asignar», deshacerlo sigue siendo
-- posible. En cuanto se borre, ya no.
-- ---------------------------------------------------------------------
