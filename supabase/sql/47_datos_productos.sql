-- =====================================================================
-- METALPLAFER360 · PASAR LOS PROYECTOS DE HOY A «PRODUCTOS»
--
--
-- ESTO ES OPCIONAL. Y conviene entender por qué antes de ejecutarlo.
--
-- La migración 44 dejó la lectura CON RESPALDO: un proyecto que no tiene
-- ninguna fila de producto enseña una construida con sus propias
-- columnas de siempre. Así que, sin ejecutar nada de este archivo, todos
-- los proyectos de hoy siguen enseñando exactamente lo que enseñaban.
--
-- Esto solo sirve para que esos proyectos tengan su producto GUARDADO en
-- lugar de heredado. La única diferencia visible es que la pantalla deja
-- de avisar de que «se creó cuando solo se podía anotar un producto».
--
--
-- EJECUTAR ESTE ARCHIVO NO CAMBIA NINGÚN DATO.
--
-- El archivo solo define funciones. Para que pase algo hay que llamarlas
-- a mano, en este orden:
--
--   1) select * from public.productos_simular();     -- qué haría
--   2) select * from public.productos_aplicar();     -- hacerlo
--   3) select * from public.productos_validar();     -- comprobarlo
--
-- Y si hiciera falta deshacerlo:
--
--   4) select * from public.productos_deshacer();
--
--
-- SOBRE DESHACERLO · lo que se puede prometer y lo que no
--
-- SÍ se puede deshacer, y de forma exacta, porque «productos_aplicar»
-- apunta en un diario qué filas ha creado y solo esas se borran. No se
-- borra ninguna fila que hayáis creado vosotros a mano.
--
-- Lo que NO se deshace es lo que hagáis DESPUÉS: si al aplicarlo editáis
-- los productos de un proyecto desde la pantalla, esas filas ya son
-- vuestras y «productos_deshacer» no las toca.
--
-- Y hay un detalle que conviene saber: al guardar los productos de un
-- proyecto desde la pantalla, las filas se borran y se vuelven a
-- insertar, así que sus IDENTIFICADORES CAMBIAN. La fila que creó la
-- migración desaparece y en su sitio hay una nueva, vuestra. El informe
-- de «productos_deshacer» las cuenta aparte, como «rehechos», para no
-- dar a entender que no había nada que conservar.
--
-- NO BORRA NI MODIFICA NINGUNA COLUMNA DE «projects». Las columnas
-- «description», «measures» y «finish» se quedan como están, porque son
-- las que leen el móvil del trabajador, los informes y las copias de
-- seguridad.
-- =====================================================================


-- ---------------------------------------------------------------------
-- EL DIARIO · qué filas ha creado esta migración
--
-- Sin esto, deshacerlo sería adivinar. Con esto es exacto.
-- ---------------------------------------------------------------------
create table if not exists public.migracion_productos (
  product_id uuid primary key,
  project_id uuid not null,
  aplicado_en timestamptz not null default now()
);

comment on table public.migracion_productos is
  'Qué filas de «project_products» creó la migración 47. Solo sirve para poder deshacerla con exactitud. Se puede borrar cuando la migración esté dada por buena.';

alter table public.migracion_productos enable row level security;
revoke all on public.migracion_productos from anon, authenticated;
grant  all on public.migracion_productos to service_role;


-- ---------------------------------------------------------------------
-- 1) SIMULAR · qué pasaría, sin que pase nada
-- ---------------------------------------------------------------------
-- Se suelta antes de crearla: PostgreSQL no deja cambiar el tipo de
-- retorno con «create or replace», así que sin esto el archivo dejaría
-- de poder reejecutarse en cuanto se añadiera una columna al informe.
drop function if exists public.productos_simular();
create or replace function public.productos_simular()
returns table (
  proyecto     text,
  nombre       text,
  descripcion  text,
  medidas      text,
  acabado      text,
  que_pasaria  text)
language sql stable security definer set search_path = public as $$
  select p.code, p.name,
         left(coalesce(p.description, '—'), 60),
         coalesce(p.measures, '—'),
         coalesce(p.finish, '—'),
         case
           when exists (select 1 from public.project_products x where x.project_id = p.id)
             then 'SE SALTA · ya tiene productos guardados'
           when coalesce(nullif(btrim(coalesce(p.description, '')), ''),
                         nullif(btrim(coalesce(p.measures, '')), ''),
                         nullif(btrim(coalesce(p.finish, '')), '')) is null
             then 'SE SALTA · no hay nada que guardar'
           else 'SE CREA un producto con estos datos'
         end
    from public.projects p
   order by p.code;
$$;

comment on function public.productos_simular() is
  'Qué haría la migración 47 en cada proyecto. No cambia nada.';


-- ---------------------------------------------------------------------
-- 2) APLICAR
--
-- Crea UN producto por proyecto, con lo que el proyecto ya tenía. No
-- toca los proyectos que ya tienen productos guardados ni los que no
-- tienen nada que guardar.
--
-- Se puede ejecutar varias veces: la segunda no hace nada, porque los
-- proyectos ya tendrán su producto.
-- ---------------------------------------------------------------------
-- Se suelta antes de crearla: PostgreSQL no deja cambiar el tipo de
-- retorno con «create or replace», así que sin esto el archivo dejaría
-- de poder reejecutarse en cuanto se añadiera una columna al informe.
drop function if exists public.productos_aplicar();
create or replace function public.productos_aplicar()
returns table (creados bigint, saltados bigint, detalle text)
language plpgsql security definer set search_path = public as $$
declare
  v_antes  bigint;
  v_creados bigint;
  v_total  bigint;
begin
  if not public.is_admin() then
    raise exception 'Solo administración puede aplicar esta migración'
      using errcode = '42501';
  end if;

  select count(*) into v_total from public.projects;
  select count(*) into v_antes from public.project_products;

  with candidatos as (
    select p.id, p.description, p.measures, p.finish, p.is_demo
      from public.projects p
     where not exists (select 1 from public.project_products x where x.project_id = p.id)
       and coalesce(nullif(btrim(coalesce(p.description, '')), ''),
                    nullif(btrim(coalesce(p.measures, '')), ''),
                    nullif(btrim(coalesce(p.finish, '')), '')) is not null
  ), nuevos as (
    insert into public.project_products
      (project_id, posicion, name, description, measures, finish, is_demo)
    select c.id, 1, null,
           nullif(btrim(coalesce(c.description, '')), ''),
           nullif(btrim(coalesce(c.measures, '')), ''),
           nullif(btrim(coalesce(c.finish, '')), ''),
           c.is_demo
      from candidatos c
    returning id, project_id
  ), diario as (
    insert into public.migracion_productos (product_id, project_id)
    select n.id, n.project_id from nuevos n
    on conflict (product_id) do nothing
    returning product_id
  )
  select count(*) into v_creados from diario;

  return query
    select v_creados,
           v_total - v_creados,
           format('De %s proyectos, se han creado %s productos. '
                  'Los demás ya tenían productos guardados o no tenían nada que guardar. '
                  'No se ha modificado ninguna columna de «projects».',
                  v_total, v_creados);
end $$;

comment on function public.productos_aplicar() is
  'Crea un producto por proyecto con lo que el proyecto ya tenía. Apunta en «migracion_productos» qué ha creado, para poder deshacerlo.';


-- ---------------------------------------------------------------------
-- 3) VALIDAR · que no se ha perdido nada
--
-- La comprobación que de verdad importa: lo que enseña la aplicación
-- después tiene que ser LO MISMO que enseñaba antes. Antes venía del
-- respaldo; ahora viene de la fila guardada, y el texto debe coincidir.
-- ---------------------------------------------------------------------
-- Se suelta antes de crearla: PostgreSQL no deja cambiar el tipo de
-- retorno con «create or replace», así que sin esto el archivo dejaría
-- de poder reejecutarse en cuanto se añadiera una columna al informe.
drop function if exists public.productos_validar();
create or replace function public.productos_validar()
returns table (comprobacion text, resultado text)
language sql stable security definer set search_path = public as $$
  select 'Proyectos en total',
         count(*)::text from public.projects
  union all
  select 'Proyectos con producto guardado',
         count(distinct project_id)::text from public.project_products
  union all
  select 'Productos creados por esta migración',
         count(*)::text from public.migracion_productos
  union all
  -- NINGÚN proyecto puede quedarse sin nada que enseñar.
  select 'Proyectos que no enseñarían ningún producto (debe ser 0)',
         count(*)::text
    from public.projects p
   where not exists (select 1 from public.project_product_list l where l.project_id = p.id)
  union all
  -- Y lo que se enseña tiene que ser lo mismo que había en el proyecto.
  select 'Productos creados cuyo texto NO coincide con su proyecto (debe ser 0)',
         count(*)::text
    from public.migracion_productos m
    join public.project_products pp on pp.id = m.product_id
    join public.projects p on p.id = m.project_id
   where coalesce(pp.description, '') is distinct from coalesce(nullif(btrim(coalesce(p.description, '')), ''), '')
      or coalesce(pp.measures, '')    is distinct from coalesce(nullif(btrim(coalesce(p.measures, '')), ''), '')
      or coalesce(pp.finish, '')      is distinct from coalesce(nullif(btrim(coalesce(p.finish, '')), ''), '')
  union all
  select 'Columnas de «projects» modificadas por esta migración',
         'ninguna · la migración no escribe en «projects»';
$$;

comment on function public.productos_validar() is
  'Comprueba que ningún proyecto se ha quedado sin producto y que el texto guardado coincide con el que tenía el proyecto.';


-- ---------------------------------------------------------------------
-- 4) DESHACER
--
-- Borra EXACTAMENTE las filas que creó «productos_aplicar», y solo si
-- nadie las ha editado después. Las que sí se hayan editado se dejan y
-- se dicen en el informe, porque borrarlas sí sería perder trabajo.
-- ---------------------------------------------------------------------
-- Se suelta antes de crearla: PostgreSQL no deja cambiar el tipo de
-- retorno con «create or replace», así que sin esto el archivo dejaría
-- de poder reejecutarse en cuanto se añadiera una columna al informe.
drop function if exists public.productos_deshacer();
create or replace function public.productos_deshacer()
returns table (borrados bigint, conservados bigint, rehechos bigint, detalle text)
language plpgsql security definer set search_path = public as $$
declare v_borrados bigint; v_conservados bigint; v_rehechos bigint;
begin
  if not public.is_admin() then
    raise exception 'Solo administración puede deshacer esta migración'
      using errcode = '42501';
  end if;

  -- Las que alguien ha tocado después de crearlas NO se borran.
  select count(*) into v_conservados
    from public.migracion_productos m
    join public.project_products pp on pp.id = m.product_id
   where pp.updated_at > m.aplicado_en + interval '1 second';

  -- Y LAS QUE YA NO EXISTEN CON ESE IDENTIFICADOR.
  --
  -- «save_project_products» borra y vuelve a insertar las filas de un
  -- proyecto, así que al editar sus productos desde la pantalla los
  -- identificadores CAMBIAN. La fila que creó la migración desapareció y
  -- en su sitio hay una nueva, que es trabajo vuestro.
  --
  -- Sin contarlas, el informe diría «0 conservados» y daría a entender
  -- que no había nada que conservar, cuando lo que pasa es justo lo
  -- contrario. Se cuentan y se dicen aparte.
  select count(*) into v_rehechos
    from public.migracion_productos m
   where not exists (select 1 from public.project_products pp where pp.id = m.product_id);

  with borrables as (
    select m.product_id
      from public.migracion_productos m
      join public.project_products pp on pp.id = m.product_id
     where pp.updated_at <= m.aplicado_en + interval '1 second'
  ), fuera as (
    delete from public.project_products
     where id in (select product_id from borrables)
    returning id
  )
  select count(*) into v_borrados from fuera;

  delete from public.migracion_productos
   where product_id not in (select id from public.project_products);

  return query
    select v_borrados, v_conservados, v_rehechos,
           format('Se han borrado %s productos de los que creó la migración. '
                  'Se han CONSERVADO %s porque alguien los editó después. '
                  'Y %s se habían rehecho desde la pantalla, así que la fila original '
                  'ya no existía: eso es trabajo vuestro y no se toca. '
                  'Los proyectos que se queden sin productos vuelven a enseñar sus '
                  'propias columnas, como antes.',
                  v_borrados, v_conservados, v_rehechos);
end $$;

comment on function public.productos_deshacer() is
  'Borra solo las filas que creó la migración 47 y que nadie ha editado después. Lo que se editó se conserva y se avisa.';


grant  execute on function public.productos_simular(), public.productos_aplicar(),
                           public.productos_validar(), public.productos_deshacer()
       to authenticated;
revoke execute on function public.productos_simular(), public.productos_aplicar(),
                           public.productos_validar(), public.productos_deshacer()
       from anon, public;


-- ---------------------------------------------------------------------
-- AL TERMINAR · cuando la migración esté dada por buena
--
-- Esto NO se ejecuta con el archivo: se ejecuta a mano, y solo cuando ya
-- no se vaya a deshacer nada.
--
--   drop function if exists public.productos_simular();
--   drop function if exists public.productos_aplicar();
--   drop function if exists public.productos_validar();
--   drop function if exists public.productos_deshacer();
--   drop table    if exists public.migracion_productos;
--
-- Mientras exista «migracion_productos», deshacerlo sigue siendo
-- posible. En cuanto se borre, ya no.
-- ---------------------------------------------------------------------
