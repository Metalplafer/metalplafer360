-- =====================================================================
-- METALPLAFER360 · DAR DE ALTA LOS PROVEEDORES QUE YA ESTÁN ESCRITOS
--
--
-- ESTO ES OPCIONAL, y por la misma razón que el archivo 47: la lectura
-- lleva respaldo. Un material que solo tiene el nombre del proveedor
-- escrito a mano se sigue viendo exactamente igual.
--
-- Esto sirve para que esos nombres pasen a ser proveedores DE VERDAD,
-- con su teléfono y sus notas, y para que los materiales queden atados a
-- ellos. A partir de ahí el filtro por proveedor y los habituales
-- funcionan sobre todo el histórico, no solo sobre lo nuevo.
--
--
-- EJECUTAR ESTE ARCHIVO NO CAMBIA NINGÚN DATO.
--
--   1) select * from public.proveedores_simular();   -- qué haría
--   2) select * from public.proveedores_aplicar();   -- hacerlo
--   3) select * from public.proveedores_validar();   -- comprobarlo
--   4) select * from public.proveedores_deshacer();  -- si hiciera falta
--
--
-- LO QUE NO HACE · esto es importante
--
-- NO BORRA NI VACÍA la columna «materials.supplier». El nombre en texto
-- se queda donde está, palabra por palabra. Lo único que se añade es el
-- vínculo «supplier_id», que antes era nulo.
--
-- Así, si algo no cuadrara, el dato original sigue entero y deshacerlo
-- es solo volver a poner el vínculo en nulo.
--
--
-- CÓMO AGRUPA LOS NOMBRES
--
-- Con la MISMA normalización que usa la importación de clientes:
-- «Aceros Vallès, S.L.», «ACEROS VALLES SL» y «aceros valles s.l.» son
-- el mismo proveedor, y se da de alta UNA vez con la forma más
-- frecuente. Si la simulación agrupa dos que vosotros consideráis
-- distintos, decídmelo ANTES de aplicarlo: se puede corregir a mano
-- después, pero es más limpio no mezclarlos.
-- =====================================================================


-- ---------------------------------------------------------------------
-- EL DIARIO · qué ha creado y qué ha atado esta migración
-- ---------------------------------------------------------------------
create table if not exists public.migracion_proveedores (
  supplier_id uuid primary key,
  nombre      text not null,
  aplicado_en timestamptz not null default now()
);

create table if not exists public.migracion_material_proveedor (
  material_id uuid primary key,
  supplier_id uuid not null,
  aplicado_en timestamptz not null default now()
);

comment on table public.migracion_proveedores is
  'Qué proveedores creó la migración 48. Solo sirve para poder deshacerla con exactitud.';
comment on table public.migracion_material_proveedor is
  'Qué materiales ató la migración 48 a un proveedor. El nombre en texto del material NO se tocó.';

alter table public.migracion_proveedores          enable row level security;
alter table public.migracion_material_proveedor   enable row level security;
revoke all on public.migracion_proveedores, public.migracion_material_proveedor
  from anon, authenticated;
grant  all on public.migracion_proveedores, public.migracion_material_proveedor
  to service_role;


-- ---------------------------------------------------------------------
-- 1) SIMULAR
--
-- Una fila por proveedor que saldría, con cuántos materiales lleva y con
-- las formas distintas en que está escrito hoy. Esa última columna es la
-- que hay que mirar: si agrupa dos que no son el mismo, se ve aquí.
-- ---------------------------------------------------------------------
-- Se suelta antes de crearla: PostgreSQL no deja cambiar el tipo de
-- retorno con «create or replace», así que sin esto el archivo dejaría
-- de poder reejecutarse en cuanto se añadiera una columna al informe.
drop function if exists public.proveedores_simular();
create or replace function public.proveedores_simular()
returns table (
  nombre_que_se_daria_de_alta text,
  materiales                  bigint,
  escrito_hoy_asi             text,
  que_pasaria                 text)
language sql stable security definer set search_path = public as $$
  with textos as (
    select m.supplier as escrito,
           public.norm_client_name(m.supplier) as clave,
           count(*) as cuantos
      from public.materials m
     where nullif(btrim(coalesce(m.supplier, '')), '') is not null
     group by 1, 2
  ), agrupados as (
    select clave,
           -- La forma más usada se queda como nombre.
           (array_agg(escrito order by cuantos desc, escrito))[1] as nombre,
           sum(cuantos) as materiales,
           string_agg(distinct escrito, ' | ' order by escrito) as formas
      from textos
     where clave is not null
     group by clave
  )
  select a.nombre, a.materiales, a.formas,
         case
           when exists (select 1 from public.suppliers s where s.name_norm = a.clave)
             then 'SE REUTILIZA · ya está dado de alta'
           else 'SE DA DE ALTA'
         end
    from agrupados a
   order by a.materiales desc, a.nombre;
$$;

comment on function public.proveedores_simular() is
  'Qué proveedores daría de alta la migración 48 y cuántos materiales ataría a cada uno. No cambia nada.';


-- ---------------------------------------------------------------------
-- 2) APLICAR
-- ---------------------------------------------------------------------
-- Se suelta antes de crearla: PostgreSQL no deja cambiar el tipo de
-- retorno con «create or replace», así que sin esto el archivo dejaría
-- de poder reejecutarse en cuanto se añadiera una columna al informe.
drop function if exists public.proveedores_aplicar();
create or replace function public.proveedores_aplicar()
returns table (creados bigint, atados bigint, detalle text)
language plpgsql security definer set search_path = public as $$
declare v_creados bigint; v_atados bigint; v_sin_atar bigint;
begin
  if not public.is_admin() then
    raise exception 'Solo administración puede aplicar esta migración'
      using errcode = '42501';
  end if;

  -- a) Los proveedores que falten.
  with textos as (
    select public.norm_client_name(m.supplier) as clave,
           m.supplier as escrito, count(*) as cuantos
      from public.materials m
     where nullif(btrim(coalesce(m.supplier, '')), '') is not null
     group by 1, 2
  ), agrupados as (
    select clave, (array_agg(escrito order by cuantos desc, escrito))[1] as nombre
      from textos where clave is not null group by clave
  ), nuevos as (
    insert into public.suppliers (name, created_by)
    select a.nombre, auth.uid()
      from agrupados a
     where not exists (select 1 from public.suppliers s where s.name_norm = a.clave)
    returning id, name
  ), diario as (
    insert into public.migracion_proveedores (supplier_id, nombre)
    select n.id, n.name from nuevos n
    on conflict (supplier_id) do nothing
    returning supplier_id
  )
  select count(*) into v_creados from diario;

  -- b) Atar los materiales que no tengan vínculo. El TEXTO no se toca.
  with atar as (
    select m.id as material_id, s.id as supplier_id
      from public.materials m
      join public.suppliers s
        on s.name_norm = public.norm_client_name(m.supplier)
     where m.supplier_id is null
       and nullif(btrim(coalesce(m.supplier, '')), '') is not null
  ), puestos as (
    update public.materials m
       set supplier_id = a.supplier_id, updated_at = now()
      from atar a
     where m.id = a.material_id
    returning m.id, a.supplier_id
  )
  insert into public.migracion_material_proveedor (material_id, supplier_id)
  select p.id, p.supplier_id from puestos p
  on conflict (material_id) do nothing;

  select count(*) into v_atados from public.migracion_material_proveedor;

  select count(*) into v_sin_atar
    from public.materials m
   where m.supplier_id is null
     and nullif(btrim(coalesce(m.supplier, '')), '') is not null;

  return query
    select v_creados, v_atados,
           format('Se han dado de alta %s proveedores y se han atado %s materiales. '
                  'Quedan %s materiales con proveedor en texto sin atar (deberían ser 0). '
                  'La columna «supplier» de los materiales NO se ha tocado.',
                  v_creados, v_atados, v_sin_atar);
end $$;

comment on function public.proveedores_aplicar() is
  'Da de alta los proveedores que ya estaban escritos a mano y ata los materiales a ellos, sin tocar el nombre en texto.';


-- ---------------------------------------------------------------------
-- 3) VALIDAR
-- ---------------------------------------------------------------------
-- Se suelta antes de crearla: PostgreSQL no deja cambiar el tipo de
-- retorno con «create or replace», así que sin esto el archivo dejaría
-- de poder reejecutarse en cuanto se añadiera una columna al informe.
drop function if exists public.proveedores_validar();
create or replace function public.proveedores_validar()
returns table (comprobacion text, resultado text)
language sql stable security definer set search_path = public as $$
  select 'Materiales con proveedor escrito', count(*)::text
    from public.materials
   where nullif(btrim(coalesce(supplier, '')), '') is not null
  union all
  select 'De esos, cuántos están atados a un proveedor', count(*)::text
    from public.materials
   where supplier_id is not null
     and nullif(btrim(coalesce(supplier, '')), '') is not null
  union all
  select 'Materiales con proveedor escrito y SIN atar (debe ser 0)', count(*)::text
    from public.materials
   where supplier_id is null
     and nullif(btrim(coalesce(supplier, '')), '') is not null
  union all
  -- LA COMPROBACIÓN QUE IMPORTA: no se ha perdido ningún nombre.
  select 'Materiales que han perdido su nombre en texto (debe ser 0)', count(*)::text
    from public.migracion_material_proveedor d
    join public.materials m on m.id = d.material_id
   where nullif(btrim(coalesce(m.supplier, '')), '') is null
  union all
  -- Y el material está atado a un proveedor que SE LLAMA igual.
  --
  -- OJO con el alcance: solo se mira lo que ATÓ ESTA MIGRACIÓN. Un
  -- material que ya tenía proveedor elegido a mano puede tener un texto
  -- distinto del nombre del proveedor —por ejemplo «Aceros Valles» en el
  -- texto y «Aceros Vallès, S.L.» en la ficha—, y eso es una decisión
  -- legítima de quien lo eligió, no un fallo. Culpar a la migración de
  -- eso sería dar una falsa alarma; se cuenta aparte, abajo.
  select 'Vínculos puestos por esta migración que no coinciden (debe ser 0)',
         count(*)::text
    from public.migracion_material_proveedor d
    join public.materials m on m.id = d.material_id
    join public.suppliers s on s.id = m.supplier_id
   where public.norm_client_name(m.supplier) is distinct from s.name_norm
  union all
  select 'Vínculos que YA existían con un nombre distinto (solo informativo)',
         count(*)::text
    from public.materials m
    join public.suppliers s on s.id = m.supplier_id
   where public.norm_client_name(m.supplier) is distinct from s.name_norm
     and not exists (select 1 from public.migracion_material_proveedor d
                      where d.material_id = m.id)
  union all
  select 'Proveedores creados por esta migración', count(*)::text
    from public.migracion_proveedores
  union all
  select 'Proveedores repetidos por nombre normalizado (debe ser 0)', count(*)::text
    from (select name_norm from public.suppliers
           group by name_norm having count(*) > 1) r;
$$;

comment on function public.proveedores_validar() is
  'Comprueba que ningún material ha perdido su nombre en texto y que cada vínculo apunta a un proveedor que se llama igual.';


-- ---------------------------------------------------------------------
-- 4) DESHACER
--
-- Suelta los vínculos que puso esta migración y borra los proveedores
-- que creó, SIEMPRE que no se hayan empezado a usar para otra cosa. Los
-- que sí, se conservan y se dicen.
-- ---------------------------------------------------------------------
-- Se suelta antes de crearla: PostgreSQL no deja cambiar el tipo de
-- retorno con «create or replace», así que sin esto el archivo dejaría
-- de poder reejecutarse en cuanto se añadiera una columna al informe.
drop function if exists public.proveedores_deshacer();
create or replace function public.proveedores_deshacer()
returns table (soltados bigint, borrados bigint, conservados bigint, detalle text)
language plpgsql security definer set search_path = public as $$
declare v_soltados bigint; v_borrados bigint; v_conservados bigint;
begin
  if not public.is_admin() then
    raise exception 'Solo administración puede deshacer esta migración'
      using errcode = '42501';
  end if;

  -- a) Soltar solo los vínculos que siguen siendo los que puso la
  -- migración. Si alguien ha cambiado el proveedor de un material a
  -- mano, ese no se toca.
  with sueltos as (
    update public.materials m
       set supplier_id = null, updated_at = now()
      from public.migracion_material_proveedor d
     where m.id = d.material_id and m.supplier_id = d.supplier_id
    returning m.id
  )
  select count(*) into v_soltados from sueltos;

  -- b) Los proveedores que creó, si ya no los usa nadie.
  select count(*) into v_conservados
    from public.migracion_proveedores g
   where exists (select 1 from public.materials m where m.supplier_id = g.supplier_id)
      or exists (select 1 from public.material_suppliers ms where ms.supplier_id = g.supplier_id);

  with fuera as (
    delete from public.suppliers s
     where s.id in (select supplier_id from public.migracion_proveedores)
       and not exists (select 1 from public.materials m where m.supplier_id = s.id)
       and not exists (select 1 from public.material_suppliers ms where ms.supplier_id = s.id)
    returning s.id
  )
  select count(*) into v_borrados from fuera;

  delete from public.migracion_material_proveedor
   where material_id not in (select id from public.materials where supplier_id is not null);
  delete from public.migracion_proveedores
   where supplier_id not in (select id from public.suppliers);

  return query
    select v_soltados, v_borrados, v_conservados,
           format('Se han soltado %s vínculos y se han borrado %s proveedores. '
                  'Se han CONSERVADO %s porque ya se están usando. '
                  'Ningún material ha perdido su nombre en texto: no se tocó nunca.',
                  v_soltados, v_borrados, v_conservados);
end $$;

comment on function public.proveedores_deshacer() is
  'Suelta los vínculos que puso la migración 48 y borra los proveedores que creó, si no se están usando.';


grant  execute on function public.proveedores_simular(), public.proveedores_aplicar(),
                           public.proveedores_validar(), public.proveedores_deshacer()
       to authenticated;
revoke execute on function public.proveedores_simular(), public.proveedores_aplicar(),
                           public.proveedores_validar(), public.proveedores_deshacer()
       from anon, public;


-- ---------------------------------------------------------------------
-- AL TERMINAR · cuando esté dada por buena
--
--   drop function if exists public.proveedores_simular();
--   drop function if exists public.proveedores_aplicar();
--   drop function if exists public.proveedores_validar();
--   drop function if exists public.proveedores_deshacer();
--   drop table    if exists public.migracion_material_proveedor;
--   drop table    if exists public.migracion_proveedores;
--
-- Mientras existan esas dos tablas, deshacerlo sigue siendo posible.
-- ---------------------------------------------------------------------
