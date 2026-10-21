-- =====================================================================
-- METALPLAFER360 · IMPORTAR LOS CLIENTES DE HOLDED · UNA SOLA VEZ
--
--
-- QUÉ ES ESTO Y QUÉ NO ES
--
-- Es un procedimiento para traer los clientes que ya están en Holded,
-- UNA VEZ, sin crear ninguna pantalla nueva en METALPLAFER360. No hay
-- integración, no hay sincronización y no hay nada que se quede
-- funcionando después: cuando termine, el último paso es borrar la tabla
-- de paso y aquí no queda rastro.
--
-- NO SE EJECUTA NADA DE ESTO POR LAS BUENAS. El orden es:
--
--   1) se carga la exportación en una tabla de paso;
--   2) se mira el INFORME, que no cambia ni una fila;
--   3) solo si el informe cuadra, se importa;
--   4) se borra la tabla de paso.
--
-- Se puede ejecutar el paso 3 dos veces por error y NO duplica nada:
-- está explicado abajo, en «si se ejecuta dos veces».
--
--
-- LO QUE NUNCA HACE
--
--   · No sobrescribe ningún cliente que ya exista. Si el CIF ya está,
--     ese cliente se SALTA y se dice en el informe. Si en Holded hay un
--     teléfono mejor, se cambia a mano: un volcado automático podría
--     pisar un dato corregido aquí a conciencia.
--   · No borra ni archiva nada.
--   · No inventa columnas: escribe en las que tiene «public.clients» y
--     en ninguna más.
--   · No toca los clientes de ejemplo ni los marca de otra manera.
--
--
-- EL CSV QUE SE ESPERA
--
-- Holded exporta los contactos con nombres de columna en inglés o en
-- castellano según el idioma de la cuenta, así que la tabla de paso
-- acepta las dos formas y además deja las columnas que no se usan. Lo
-- único IMPRESCINDIBLE es el nombre.
--
--   Holded                          →  clients
--   ------------------------------     -----------------------------
--   name / nombre                   →  name          (obligatorio)
--   vatnumber / cif / nif           →  tax_id        (puede ir vacío)
--   phone / telefono / tel          →  phone
--   email / correo                  →  email
--   address / direccion             →  address
--   city / ciudad / poblacion       →  city
--   postalcode / cp / codigopostal  →  postal_code
--   type / tipo                     →  kind          (ver más abajo)
--   notes / notas                   →  notes
--
-- «kind» solo admite «empresa» o «particular». Si en el CSV no viene, o
-- viene algo que no se entiende, se decide por el CIF/NIF: los que
-- empiezan por letra (A, B, G…) son de empresa y los que empiezan por
-- número son de particular. Si no hay CIF, se queda «empresa», que es lo
-- que había por omisión en METALPLAFER360, y queda dicho en el informe
-- para repasarlo.
--
-- Las columnas del CSV que no estén en esa lista se ignoran sin dar
-- error: en Holded hay muchas más y no estorban.
--
--
-- CÓMO SE CARGA EL CSV
--
-- Lo más cómodo, sin instalar nada: en Supabase, «Table Editor» →
-- «holded_import» → «Insert» → «Import data from CSV». La tabla de paso
-- tiene TODAS las columnas de tipo texto justamente para que no falle
-- ninguna fila por el formato de un número o de una fecha.
--
-- Si se prefiere la línea de órdenes:
--   \copy public.holded_import (name, tax_id, phone, email, address,
--                               city, postal_code, kind, notes)
--     from 'contactos-holded.csv' with (format csv, header true);
--
--
-- SI SE EJECUTA DOS VECES
--
-- «holded_import_run()» solo crea los clientes cuyo CIF normalizado no
-- esté ya en «clients» y, si no tienen CIF, cuyo nombre normalizado no
-- esté ya. Ejecutarla otra vez con la misma tabla de paso no crea nada:
-- en la segunda pasada todos esos clientes ya existen. Además hay un
-- índice único sobre el CIF normalizado que lo impediría de todas formas.
--
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LA TABLA DE PASO
--
-- Todo texto, a propósito. Si una celda de Holded trae «1.234,00» o una
-- fecha en un formato raro, aquí entra sin romper nada; ya se mira
-- después.
-- ---------------------------------------------------------------------
create table if not exists public.holded_import (
  linea       bigserial primary key,
  name        text,
  tax_id      text,
  phone       text,
  email       text,
  address     text,
  city        text,
  postal_code text,
  kind        text,
  notes       text
);

comment on table public.holded_import is
  'TABLA DE PASO para importar los clientes de Holded una sola vez. Se borra al terminar: no forma parte de la aplicación.';

alter table public.holded_import enable row level security;
revoke all on public.holded_import from anon, authenticated;
grant all on public.holded_import to service_role;
grant all on sequence public.holded_import_linea_seq to service_role;


-- ---------------------------------------------------------------------
-- 2) LAS DOS NORMALIZACIONES QUE DECIDEN SI ALGO ESTÁ REPETIDO
--
-- Son las que manda la base de datos, no unas nuevas: «norm_tax_id» es
-- exactamente la expresión del índice único «clients_tax_id_uniq», así
-- que lo que esta función considere repetido es lo mismo que el índice
-- rechazaría.
-- ---------------------------------------------------------------------
create or replace function public.norm_tax_id(p text) returns text
language sql immutable as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

comment on function public.norm_tax_id(text) is
  'El CIF/NIF sin guiones, sin espacios y en mayúsculas. La MISMA expresión del índice único de clientes.';

/**
 * El nombre reducido a lo comparable: sin acentos, sin signos, sin la
 * forma jurídica y sin dobles espacios.
 *
 * «García Construcciones, S.L.» y «GARCIA CONSTRUCCIONES SL» son el
 * mismo cliente escrito de dos maneras, y en una exportación de
 * contabilidad eso pasa constantemente.
 */
create or replace function public.norm_client_name(p text) returns text
language sql stable set search_path = public, extensions as $$
  -- Se apoya en «public.norm», que ya pasa a minúsculas y quita los
  -- acentos con «unaccent». Lo que se añade aquí es quitar los signos.
  --
  -- Y NO todos los signos valen lo mismo, que es el detalle que importa:
  --
  --   · el PUNTO y el apóstrofo son marcas de abreviatura y NO separan
  --     palabras, así que se quitan sin dejar hueco: «S.L.» → «sl», que
  --     es lo que hace falta para que case con «SL»;
  --   · la coma, el guion, la barra y los paréntesis SÍ separan, así que
  --     se cambian por un espacio: «Metalls-Vallès» → «metalls valles»,
  --     y no «metallsvalles», que no casaría con «Metalls Vallès».
  --
  -- Lo descubrió una prueba: juntándolo todo en el mismo saco,
  -- «Construccions Moles i Fills, S.L.» quedaba en «... s l» y no
  -- reconocía a «CONSTRUCCIONS MOLES I FILLS SL».
  --
  -- La forma jurídica NO se quita: «Talleres Ribera SL» y «Talleres
  -- Ribera» se quedan distintos a propósito. Quitarla haría que un
  -- cliente nuevo pareciera uno que ya está, y lo que esto decide es
  -- justamente a quién NO crear.
  select nullif(
    btrim(regexp_replace(
      regexp_replace(
        translate(public.norm(p), '.''´`·', ''),
        '[^a-z0-9ñ ]', ' ', 'g'),
      '\s+', ' ', 'g')), '');
$$;

comment on function public.norm_client_name(text) is
  'El nombre comparable: en minúsculas, sin acentos y sin signos. Para avisar de posibles repetidos cuando no hay CIF.';


-- ---------------------------------------------------------------------
-- 3) QUÉ SE VA A HACER CON CADA LÍNEA · la vista que decide
--
-- Una sola vista con el veredicto de cada línea. El informe y la
-- importación leen de AQUÍ, así que no pueden decir cosas distintas: lo
-- que anuncia el informe es, línea por línea, lo que va a pasar.
-- ---------------------------------------------------------------------
create or replace view public.holded_plan as
with limpio as (
  select h.linea,
         btrim(coalesce(h.name, ''))                     as name,
         public.norm_tax_id(h.tax_id)                    as tax_norm,
         nullif(btrim(coalesce(h.tax_id, '')), '')       as tax_id,
         public.norm_client_name(h.name)                 as name_norm,
         nullif(btrim(coalesce(h.phone, '')), '')        as phone,
         nullif(btrim(lower(coalesce(h.email, ''))), '') as email,
         nullif(btrim(coalesce(h.address, '')), '')      as address,
         nullif(btrim(coalesce(h.city, '')), '')         as city,
         nullif(btrim(coalesce(h.postal_code, '')), '')  as postal_code,
         nullif(btrim(coalesce(h.notes, '')), '')        as notes,
         lower(btrim(coalesce(h.kind, '')))              as kind_csv
    from public.holded_import h
),
decidido as (
  select l.*,
         -- EL TIPO. Si el CSV no lo dice, lo dice el CIF: letra inicial
         -- es empresa, número inicial es particular.
         case
           when l.kind_csv in ('empresa', 'company', 'business') then 'empresa'
           when l.kind_csv in ('particular', 'person', 'individual') then 'particular'
           when l.tax_norm ~ '^[A-Z]' then 'empresa'
           when l.tax_norm ~ '^[0-9]' then 'particular'
           else 'empresa'
         end::public.client_kind as kind,
         -- Y si el tipo es una suposición nuestra, se dice.
         (l.kind_csv not in ('empresa', 'company', 'business',
                             'particular', 'person', 'individual')) as kind_supuesto,
         -- ¿Ya está por CIF? Es la comprobación FIABLE.
         (select c.id from public.clients c
           where l.tax_norm is not null
             and public.norm_tax_id(c.tax_id) = l.tax_norm
           limit 1) as choca_cif,
         -- ¿Y un nombre idéntico ya normalizado? Fiable también.
         (select c.id from public.clients c
           where l.name_norm is not null
             and public.norm_client_name(c.name) = l.name_norm
           limit 1) as choca_nombre,
         -- ¿Dos líneas del PROPIO CSV con el mismo CIF o el mismo
         -- nombre? Se queda la primera y las demás se dicen.
         (select min(o.linea) from limpio o
           where o.linea < l.linea
             and ((l.tax_norm is not null and o.tax_norm = l.tax_norm)
               or (l.tax_norm is null and l.name_norm is not null
                   and o.name_norm = l.name_norm))) as repetida_en_csv
    from limpio l
)
select d.linea, d.name, d.tax_id, d.tax_norm, d.name_norm, d.kind, d.kind_supuesto,
       d.phone, d.email, d.address, d.city, d.postal_code, d.notes,
       d.choca_cif, d.choca_nombre, d.repetida_en_csv,
       -- EL VEREDICTO. El orden importa: lo que descarta va antes.
       case
         when d.name is null or d.name = ''      then 'sin_nombre'
         when d.repetida_en_csv is not null      then 'repetida_en_csv'
         when d.choca_cif is not null            then 'ya_existe_por_cif'
         when d.choca_nombre is not null         then 'ya_existe_por_nombre'
         when d.tax_norm is null                 then 'crear_sin_cif'
         else                                         'crear'
       end as veredicto,
       -- Lo que falta, para repasarlo después con calma. No impide crear.
       nullif(concat_ws(', ',
         case when d.tax_norm is null    then 'sin CIF/NIF' end,
         case when d.phone is null       then 'sin teléfono' end,
         case when d.email is null       then 'sin correo' end,
         case when d.address is null     then 'sin dirección' end,
         case when d.city is null        then 'sin población' end,
         case when d.kind_supuesto       then 'tipo supuesto' end), '') as incompleto
  from decidido d;

comment on view public.holded_plan is
  'El veredicto de cada línea de la exportación. El informe y la importación leen de aquí, así que dicen lo mismo.';

revoke all on public.holded_plan from anon, authenticated;
grant select on public.holded_plan to service_role;


-- ---------------------------------------------------------------------
-- 4) EL INFORME · NO CAMBIA NADA
--
--   select * from public.holded_simulate();
--
-- Primero el resumen, y debajo el detalle de todo lo que NO se va a
-- crear, con el motivo y con el cliente de METALPLAFER360 con el que
-- choca. Es lo que hay que leer antes de importar.
-- ---------------------------------------------------------------------
create or replace function public.holded_simulate()
returns table (bloque text, detalle text, cuantas bigint)
language sql stable security definer set search_path = public, extensions as $$
  -- RESUMEN
  select 'RESUMEN', 'Líneas en la exportación', count(*) from public.holded_plan
  union all
  select 'RESUMEN', 'Se van a CREAR (con CIF)', count(*)
    from public.holded_plan where veredicto = 'crear'
  union all
  select 'RESUMEN', 'Se van a CREAR (sin CIF: repásalos después)', count(*)
    from public.holded_plan where veredicto = 'crear_sin_cif'
  union all
  select 'RESUMEN', 'Ya existen por CIF: se SALTAN', count(*)
    from public.holded_plan where veredicto = 'ya_existe_por_cif'
  union all
  select 'RESUMEN', 'Ya existen por nombre: se SALTAN', count(*)
    from public.holded_plan where veredicto = 'ya_existe_por_nombre'
  union all
  select 'RESUMEN', 'Repetidas dentro del propio CSV: se SALTAN', count(*)
    from public.holded_plan where veredicto = 'repetida_en_csv'
  union all
  select 'RESUMEN', 'Sin nombre: no se pueden crear', count(*)
    from public.holded_plan where veredicto = 'sin_nombre'
  union all
  select 'RESUMEN', 'Con algún dato incompleto', count(*)
    from public.holded_plan where incompleto is not null

  -- DETALLE de lo que NO se crea
  union all
  select 'YA EXISTE POR CIF',
         'Línea ' || p.linea || ' · ' || p.name || ' (' || coalesce(p.tax_id, '—') || ')'
         || ' → ya está como «' || c.name || '»', 1
    from public.holded_plan p join public.clients c on c.id = p.choca_cif
   where p.veredicto = 'ya_existe_por_cif'
  union all
  select 'YA EXISTE POR NOMBRE',
         'Línea ' || p.linea || ' · ' || p.name || ' → ya está como «' || c.name || '»'
         || case when p.tax_norm is null then ' · OJO: ninguno de los dos tiene CIF, compruébalo'
                 else '' end, 1
    from public.holded_plan p join public.clients c on c.id = p.choca_nombre
   where p.veredicto = 'ya_existe_por_nombre'
  union all
  select 'REPETIDA EN EL CSV',
         'Línea ' || p.linea || ' · ' || p.name || ' → repite la línea ' || p.repetida_en_csv, 1
    from public.holded_plan p where p.veredicto = 'repetida_en_csv'
  union all
  select 'SIN NOMBRE', 'Línea ' || p.linea || ' · no tiene nombre, no se puede crear', 1
    from public.holded_plan p where p.veredicto = 'sin_nombre'

  -- DUDOSOS · se van a crear, pero conviene mirarlos
  union all
  select 'DUDOSO · SE PARECE A UNO QUE YA ESTÁ',
         'Línea ' || p.linea || ' · ' || p.name || ' se parece a «' || c.name || '»'
         || ' (' || round(similarity(p.name_norm,
                                     public.norm_client_name(c.name)) * 100) || ' %)'
         || ' · se CREARÁ de todas formas: míralo', 1
    from public.holded_plan p
    join public.clients c
      on public.norm_client_name(c.name) % p.name_norm
     and public.norm_client_name(c.name) <> p.name_norm
     and similarity(p.name_norm, public.norm_client_name(c.name)) >= 0.55
   where p.veredicto in ('crear', 'crear_sin_cif')
  union all
  select 'DUDOSO · DATOS INCOMPLETOS',
         'Línea ' || p.linea || ' · ' || p.name || ' → ' || p.incompleto, 1
    from public.holded_plan p
   where p.veredicto in ('crear', 'crear_sin_cif') and p.incompleto is not null
  order by 1, 2;
$$;

comment on function public.holded_simulate() is
  'EL INFORME PREVIO. No cambia ni una fila: dice qué se crearía, qué se saltaría y qué conviene mirar a mano.';

revoke execute on function public.holded_simulate() from anon, authenticated, public;


-- ---------------------------------------------------------------------
-- 5) LA IMPORTACIÓN
--
--   select * from public.holded_import_run();
--
-- Crea SOLO lo que el informe ha dicho que crearía. Devuelve lo que ha
-- hecho, para poder comparar con el informe.
--
-- Se puede ejecutar dos veces sin duplicar: en la segunda pasada esos
-- clientes ya existen y el veredicto pasa a «ya_existe_por_cif» o
-- «ya_existe_por_nombre».
-- ---------------------------------------------------------------------
create or replace function public.holded_import_run()
returns table (resultado text, cuantos bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_creados bigint;
  v_antes   jsonb;
begin
  -- LA FOTO DEL PLAN, ANTES DE TOCAR NADA.
  --
  -- Hay que tomarla aquí: «holded_plan» mira «clients» cada vez que se
  -- consulta, así que en cuanto se hayan creado los clientes dirá que
  -- «ya existen», y el recuento del historial diría que se saltaron seis
  -- cuando en realidad se crearon seis. Lo cazó una prueba.
  select jsonb_build_object(
           'lineas',              count(*),
           'creados_previstos',   count(*) filter (where veredicto in ('crear', 'crear_sin_cif')),
           'saltados_por_cif',    count(*) filter (where veredicto = 'ya_existe_por_cif'),
           'saltados_por_nombre', count(*) filter (where veredicto = 'ya_existe_por_nombre'),
           'repetidos_en_csv',    count(*) filter (where veredicto = 'repetida_en_csv'),
           'sin_nombre',          count(*) filter (where veredicto = 'sin_nombre'))
    into v_antes
    from public.holded_plan;

  -- El historial de cada cliente lo escribe su disparador. Para una
  -- importación serían cientos de líneas de ruido, así que se silencia y
  -- se deja UNA anotación al final que diga lo que se ha hecho.
  perform set_config('app.skip_audit', 'on', true);

  with nuevos as (
    insert into public.clients
      (kind, name, tax_id, phone, email, address, city, postal_code, notes, is_demo)
    select p.kind, p.name, p.tax_id, p.phone, p.email, p.address, p.city, p.postal_code,
           -- Queda dicho de dónde salió, que dentro de un año no se
           -- acuerda nadie.
           nullif(concat_ws(E'\n', p.notes, 'Importado de Holded.'), '') ,
           false
      from public.holded_plan p
     where p.veredicto in ('crear', 'crear_sin_cif')
    returning 1)
  select count(*) into v_creados from nuevos;

  perform set_config('app.skip_audit', '', true);

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_code,
                                summary, details)
  values (auth.uid(), public.actor_name(), 'importar_clientes', 'clients', null,
          'Importación de clientes de Holded: ' || v_creados || ' creados',
          v_antes || jsonb_build_object('creados', v_creados));

  -- Todo de la FOTO, no de «holded_plan»: después de crear, la vista ya
  -- cuenta a los recién creados como «ya existentes».
  return query
    select 'Clientes creados', v_creados
    union all
    select 'Saltados porque ya estaban (CIF)', (v_antes ->> 'saltados_por_cif')::bigint
    union all
    select 'Saltados porque ya estaban (nombre)', (v_antes ->> 'saltados_por_nombre')::bigint
    union all
    select 'Saltados por repetirse en el CSV', (v_antes ->> 'repetidos_en_csv')::bigint
    union all
    select 'No creados por no tener nombre', (v_antes ->> 'sin_nombre')::bigint;
end $$;

comment on function public.holded_import_run() is
  'Crea los clientes que el informe ha dicho. Idempotente: ejecutarla dos veces no duplica nada.';

revoke execute on function public.holded_import_run() from anon, authenticated, public;


-- ---------------------------------------------------------------------
-- 6) AL TERMINAR · se retira la tabla de paso
--
-- Esto NO se ejecuta con el resto del archivo: se ejecuta a mano cuando
-- la importación está revisada y dada por buena.
--
--   drop view  if exists public.holded_plan;
--   drop table if exists public.holded_import;
--   drop function if exists public.holded_simulate();
--   drop function if exists public.holded_import_run();
--
-- «norm_tax_id» y «norm_client_name» se pueden dejar: son dos funciones
-- de texto, sin estado, y vienen bien para buscar clientes repetidos
-- cualquier otro día.
-- ---------------------------------------------------------------------
