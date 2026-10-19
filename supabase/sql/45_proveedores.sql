-- =====================================================================
-- METALPLAFER360 · PROVEEDORES DE VERDAD
--
--
-- CÓMO ESTÁ HOY
--
-- «materials.supplier» es TEXTO LIBRE. Funciona, y hay una función
-- («suggest_suppliers») que propone los nombres ya escritos para que no
-- se tecleen de nuevo. Pero con texto libre no se puede:
--
--   · filtrar por proveedor con garantías («Aceros Vallès» y «Aceros
--     Valles» son dos proveedores distintos para la base de datos);
--   · tener los datos del proveedor en un sitio (teléfono, correo);
--   · decir qué proveedores SUELEN servir un material.
--
--
-- QUÉ SE AÑADE
--
--   · «suppliers» · los proveedores, con lo mínimo imprescindible.
--   · «materials.supplier_id» · opcional, CONVIVIENDO con el texto.
--   · «material_suppliers» · qué proveedores suele servir un material.
--     Es de varios a varios a propósito: un tubo lo sirven tres sitios y
--     se pide a quien lo tenga.
--
--
-- EL TEXTO NO SE BORRA, Y NADA DEPENDE DE CONVERTIRLO
--
-- «materials.supplier» se queda con su valor. La lectura lleva RESPALDO:
-- si un material no tiene «supplier_id», se enseña su texto. Así los
-- materiales de hoy siguen enseñando su proveedor sin haber tocado un
-- solo registro, y convertir el histórico es una limpieza OPCIONAL
-- (archivo 48, pendiente de aprobación).
--
-- Al elegir un proveedor de la lista se guardan LOS DOS: el vínculo y el
-- nombre en el texto. Así todo lo que ya leía el texto —los informes,
-- las copias de seguridad, «suggest_suppliers»— sigue funcionando sin
-- cambiar una línea.
--
--
-- NOMBRES REPETIDOS
--
-- Un índice único sobre el nombre normalizado (sin acentos, sin signos,
-- en minúsculas) con la MISMA función que usa la importación de
-- clientes. «Aceros Vallès, S.L.» y «ACEROS VALLES SL» no se pueden dar
-- de alta dos veces.
--
-- DEPENDE DE: «public.norm_client_name», que la crea el archivo 40.
-- APLICAR DESPUÉS DEL 40. (El 40 solo define funciones y una tabla de
-- paso; no hace falta haber ejecutado la importación.)
--
--
-- MIGRACIÓN ESTRUCTURAL. No borra ni modifica ningún registro.
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LOS PROVEEDORES
--
-- Lo mínimo: el nombre y cómo llamarles. Nada obligatorio salvo el
-- nombre, porque de muchos proveedores solo se sabe eso.
-- ---------------------------------------------------------------------
create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  -- El nombre reducido a lo comparable. Lo mantiene un disparador.
  name_norm   text not null default '',
  phone       text,
  email       text,
  notes       text,
  active      boolean not null default true,
  is_demo     boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.suppliers is
  'Proveedores. No se borran: se desactivan, para no romper los materiales que ya les apuntan.';
comment on column public.suppliers.name_norm is
  'El nombre sin acentos, sin signos y en minúsculas. Lo calcula un disparador y es lo que impide dar de alta dos veces el mismo proveedor.';


/**
 * EL NOMBRE COMPARABLE, AL GUARDAR.
 *
 * ¿Por qué una columna y un disparador, en lugar de un índice sobre la
 * función directamente? Porque PostgreSQL solo indexa expresiones
 * «immutable», y «norm_client_name» no lo es: por debajo usa «unaccent»,
 * que depende de un diccionario y por eso es «stable».
 *
 * Se intentó con el índice directo y la base de datos lo rechazó
 * («functions in index expression must be marked IMMUTABLE»). Marcar la
 * función como immutable mintiendo habría funcionado hasta el día en que
 * cambiara el diccionario y el índice quedara corrupto en silencio.
 *
 * Así que se calcula al guardar y se indexa la columna, que sí es un
 * valor fijo. Es la forma correcta de indexar una normalización que
 * depende de un diccionario.
 */
create or replace function public.trg_supplier_norm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.name_norm := coalesce(public.norm_client_name(new.name), '');
  return new;
end $$;

drop trigger if exists supplier_norm on public.suppliers;
create trigger supplier_norm before insert or update of name on public.suppliers
  for each row execute function public.trg_supplier_norm();

-- El mismo proveedor no se da de alta dos veces aunque se escriba de
-- otra manera: «Aceros Vallès, S.L.» y «ACEROS VALLES SL» chocan aquí.
create unique index if not exists suppliers_nombre_uniq
  on public.suppliers (name_norm);

create index if not exists suppliers_activos_idx on public.suppliers (name) where active;
create index if not exists suppliers_created_by_idx on public.suppliers (created_by);


-- ---------------------------------------------------------------------
-- 2) EL PROVEEDOR DE UN MATERIAL · opcional, junto al texto
-- ---------------------------------------------------------------------
alter table public.materials add column if not exists supplier_id uuid
  references public.suppliers(id) on delete set null;

comment on column public.materials.supplier_id is
  'El proveedor, cuando se elige de la lista. La columna «supplier» conserva el nombre en texto y sigue siendo la que leen los informes.';

-- CUIDADO con el nombre: ya hay un «materials_supplier_idx» de antes,
-- sobre lower(supplier), el nombre en texto. Si se reutiliza el nombre,
-- el «if not exists» se lo salta sin decir nada y la columna nueva se
-- queda sin índice. Pasó, y lo cazó la prueba de claves foráneas.
create index if not exists materials_supplier_id_idx on public.materials (supplier_id);


-- ---------------------------------------------------------------------
-- 3) QUÉ PROVEEDORES SUELEN SERVIR UN MATERIAL
--
-- De varios a varios: un material lo pueden servir tres proveedores y se
-- pide a quien lo tenga.
--
-- El material se identifica por su NOMBRE NORMALIZADO, no por su fila:
-- «materials» tiene una fila por cada vez que se pide algo en un
-- proyecto, así que apuntar a una de esas filas no serviría de nada. Lo
-- que se quiere recordar es «el tubo de 30×30 lo sirven estos».
-- ---------------------------------------------------------------------
create table if not exists public.material_suppliers (
  material_norm text not null,
  supplier_id   uuid not null references public.suppliers(id) on delete cascade,
  -- El nombre tal como se escribió la primera vez, para enseñarlo.
  material_name text not null,
  added_at      timestamptz not null default now(),
  added_by      uuid references public.profiles(id) on delete set null,
  primary key (material_norm, supplier_id)
);

comment on table public.material_suppliers is
  'Qué proveedores suele servir cada material, por su nombre normalizado. Un material puede tener varios.';
comment on column public.material_suppliers.material_norm is
  'El nombre del material sin acentos ni signos, para que «Tubo 30x30» y «tubo 30×30» sean el mismo.';

create index if not exists material_suppliers_proveedor_idx
  on public.material_suppliers (supplier_id);
create index if not exists material_suppliers_added_by_idx
  on public.material_suppliers (added_by);


-- ---------------------------------------------------------------------
-- 4) GUARDAR UN PROVEEDOR
--
-- Si ya existe uno con el mismo nombre normalizado, NO se crea otro: se
-- devuelve el que hay. Así pulsar dos veces, o escribirlo con otra
-- puntuación, no llena la lista de duplicados.
-- ---------------------------------------------------------------------
create or replace function public.save_supplier(
  p_id     uuid default null,
  p_name   text default null,
  p_phone  text default null,
  p_email  text default null,
  p_notes  text default null)
returns public.suppliers
language plpgsql security definer set search_path = public as $$
declare
  s public.suppliers;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  perform public.assert_admin();

  if v_name is null then
    raise exception 'El proveedor necesita un nombre' using errcode = '22023';
  end if;

  -- ¿Ya está, escrito de otra manera?
  select * into s from public.suppliers
   where name_norm = coalesce(public.norm_client_name(v_name), '')
     and (p_id is null or id <> p_id)
   limit 1;

  if found and p_id is null then
    -- No se crea un duplicado y no se pisan sus datos: se devuelve el
    -- que hay. Si hay que corregirlo, se edita desde su ficha.
    return s;
  end if;
  if found and p_id is not null then
    raise exception 'Ya existe otro proveedor que se llama igual: %', s.name
      using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.suppliers (name, phone, email, notes, created_by)
    values (v_name,
            nullif(btrim(coalesce(p_phone, '')), ''),
            nullif(btrim(lower(coalesce(p_email, ''))), ''),
            nullif(btrim(coalesce(p_notes, '')), ''),
            auth.uid())
    returning * into s;
  else
    update public.suppliers
       set name  = v_name,
           phone = nullif(btrim(coalesce(p_phone, '')), ''),
           email = nullif(btrim(lower(coalesce(p_email, ''))), ''),
           notes = nullif(btrim(coalesce(p_notes, '')), ''),
           updated_at = now()
     where id = p_id
    returning * into s;
    if not found then
      raise exception 'No se encuentra el proveedor' using errcode = 'P0002';
    end if;
  end if;

  return s;
end $$;

comment on function public.save_supplier(uuid, text, text, text, text) is
  'Crea o corrige un proveedor. Si ya existe uno con el mismo nombre normalizado, devuelve ese en lugar de duplicarlo.';


/** Desactivar o reactivar. NO se borra: hay materiales que le apuntan. */
create or replace function public.set_supplier_active(p_supplier uuid, p_active boolean)
returns public.suppliers
language plpgsql security definer set search_path = public as $$
declare s public.suppliers;
begin
  perform public.assert_admin();
  update public.suppliers set active = coalesce(p_active, true), updated_at = now()
   where id = p_supplier returning * into s;
  if not found then
    raise exception 'No se encuentra el proveedor' using errcode = 'P0002';
  end if;
  return s;
end $$;


-- ---------------------------------------------------------------------
-- 5) ATAR UN MATERIAL A SUS PROVEEDORES HABITUALES
--
-- Se manda la lista COMPLETA de proveedores de ese material, como en el
-- resto de la aplicación. Vacía deja el material sin proveedores
-- habituales.
-- ---------------------------------------------------------------------
create or replace function public.save_material_suppliers(
  p_material_name text, p_suppliers uuid[])
returns setof public.suppliers
language plpgsql security definer set search_path = public as $$
declare
  v_norm text := public.norm_client_name(p_material_name);
  v_ids uuid[] := coalesce(p_suppliers, '{}');
begin
  perform public.assert_admin();

  if v_norm is null then
    raise exception 'Hace falta el nombre del material' using errcode = '22023';
  end if;

  -- No se admite un proveedor inventado ni uno desactivado. Con una
  -- excepción a propósito: si YA era habitual de este material y luego
  -- se desactivó, se le deja seguir en la lista. Si no, desactivar un
  -- proveedor dejaría bloqueada la lista de todos sus materiales: la
  -- pantalla manda la lista completa y el guardado fallaría entero.
  if exists (
    select 1 from unnest(v_ids) u(id)
     where not exists (select 1 from public.suppliers s where s.id = u.id)
        or (not exists (select 1 from public.suppliers s
                         where s.id = u.id and s.active)
            and not exists (select 1 from public.material_suppliers ms
                             where ms.supplier_id = u.id
                               and ms.material_norm = v_norm))) then
    raise exception 'Alguno de los proveedores no existe o está desactivado'
      using errcode = '22023';
  end if;

  delete from public.material_suppliers
   where material_norm = v_norm and supplier_id <> all(v_ids);

  insert into public.material_suppliers (material_norm, material_name, supplier_id, added_by)
  select v_norm, btrim(p_material_name), u.id, auth.uid()
    from unnest(v_ids) u(id)
  on conflict (material_norm, supplier_id) do nothing;

  return query
    select s.* from public.suppliers s
     join public.material_suppliers ms on ms.supplier_id = s.id
    where ms.material_norm = v_norm
    order by s.name;
end $$;

comment on function public.save_material_suppliers(text, uuid[]) is
  'Pone los proveedores habituales de un material, por su nombre. Se manda la lista completa.';


/**
 * QUÉ PROVEEDORES PROPONER PARA UN MATERIAL.
 *
 * Primero los que ya están atados a ese material. Si no hay ninguno, los
 * que más veces se han usado, que es lo que hacía «suggest_suppliers» y
 * sigue siendo mejor que una lista en blanco.
 */
create or replace function public.suppliers_for_material(p_material_name text)
returns table (id uuid, name text, phone text, habitual boolean, veces bigint)
language sql stable security definer set search_path = public, extensions as $$
  with norm as (select public.norm_client_name(p_material_name) as n)
  select s.id, s.name, s.phone, true,
         (select count(*) from public.materials m where m.supplier_id = s.id)
    from public.suppliers s
    join public.material_suppliers ms on ms.supplier_id = s.id
    cross join norm
   where public.is_admin() and s.active and ms.material_norm = norm.n
  union all
  select s.id, s.name, s.phone, false,
         (select count(*) from public.materials m where m.supplier_id = s.id)
    from public.suppliers s
    cross join norm
   where public.is_admin() and s.active
     and not exists (select 1 from public.material_suppliers ms
                      where ms.supplier_id = s.id and ms.material_norm = norm.n)
     and not exists (select 1 from public.material_suppliers ms2
                      where ms2.material_norm = norm.n)
   order by 4 desc, 5 desc, 2;
$$;

comment on function public.suppliers_for_material(text) is
  'Los proveedores que proponer para un material: primero los suyos; si no tiene ninguno, los más usados.';


-- ---------------------------------------------------------------------
-- 6) EL PROVEEDOR DE UN MATERIAL, CON RESPALDO
--
-- Es por aquí por donde leen las pantallas. Si el material no tiene
-- proveedor de la lista, devuelve el texto que ya tenía.
-- ---------------------------------------------------------------------
create or replace view public.material_supplier_view with (security_invoker = true) as
  select m.id as material_id,
         m.supplier_id,
         coalesce(s.name, m.supplier) as supplier_name,
         m.supplier_id is null and m.supplier is not null as solo_texto,
         s.phone as supplier_phone
    from public.materials m
    left join public.suppliers s on s.id = m.supplier_id;

comment on view public.material_supplier_view is
  'El proveedor de cada material: el de la lista si lo tiene, y si no el nombre en texto de siempre.';


-- ---------------------------------------------------------------------
-- 7) PERMISOS
--
-- Los proveedores son cosa de administración: ahí hay teléfonos, correos
-- y condiciones de compra. Un trabajador NO los ve, igual que no ve los
-- importes.
--
-- Lo que el trabajador sí sigue viendo es el material de su proyecto, por
-- donde lo veía antes, que no cambia.
-- ---------------------------------------------------------------------
grant select on public.suppliers, public.material_suppliers,
                public.material_supplier_view to authenticated, service_role;
grant all    on public.suppliers, public.material_suppliers to service_role;
revoke all   on public.suppliers, public.material_suppliers,
                public.material_supplier_view from anon;

alter table public.suppliers          enable row level security;
alter table public.material_suppliers enable row level security;

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select to authenticated
  using (public.is_admin());

drop policy if exists material_suppliers_select on public.material_suppliers;
create policy material_suppliers_select on public.material_suppliers for select to authenticated
  using (public.is_admin());

comment on policy suppliers_select on public.suppliers is
  'Los proveedores son de administración: llevan teléfonos y condiciones de compra.';

-- Se escriben solo por las funciones, que comprueban los duplicados.
revoke insert, update, delete, truncate on public.suppliers          from authenticated;
revoke insert, update, delete, truncate on public.material_suppliers from authenticated;

grant  execute on function public.save_supplier(uuid, text, text, text, text),
                           public.set_supplier_active(uuid, boolean),
                           public.save_material_suppliers(text, uuid[]),
                           public.suppliers_for_material(text) to authenticated;
revoke execute on function public.save_supplier(uuid, text, text, text, text),
                           public.set_supplier_active(uuid, boolean),
                           public.save_material_suppliers(text, uuid[]),
                           public.suppliers_for_material(text) from anon, public;
