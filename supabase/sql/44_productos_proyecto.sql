-- =====================================================================
-- METALPLAFER360 · VARIOS PRODUCTOS EN UN MISMO PROYECTO
--
--
-- EL PROBLEMA
--
-- Un proyecto se presupuesta como un trabajo, pero muchas veces son
-- varias piezas distintas: una barandilla de escalera Y dos rejas, cada
-- cosa con sus medidas y su acabado. Hoy el proyecto tiene una sola
-- descripción, unas solas medidas y un solo acabado, así que todo eso se
-- acaba metiendo a la fuerza en un mismo campo de texto.
--
--
-- QUÉ ES DEL PRODUCTO Y QUÉ ES DEL PROYECTO
--
-- Por producto:  nombre (opcional), descripción, medidas, acabado.
-- Del proyecto:  el nombre del proyecto, la ubicación, la dirección, el
--                presupuesto, el anticipo y las horas previstas.
--
-- «projects.name» NO se mueve, y es una decisión importante: es el
-- título del proyecto, es «not null», está en un índice de similitud
-- para el buscador, y lo usan todas las pantallas, los informes, las
-- copias de seguridad y el móvil del trabajador. Lo que pasa a ser por
-- producto es lo que se pedía: descripción, medidas y acabado.
--
--
-- NADA DEPENDE DE MIGRAR LOS DATOS · esto es lo importante
--
-- Los proyectos de hoy tienen su descripción, sus medidas y su acabado
-- en columnas del propio proyecto. En lugar de convertirlos, la lectura
-- lleva RESPALDO: si un proyecto no tiene ninguna fila de producto, la
-- vista «project_product_list» le devuelve UN producto construido con
-- esas columnas.
--
-- Así que al aplicar este archivo todos los proyectos siguen enseñando
-- exactamente lo que enseñaban, sin haber tocado un solo registro, y la
-- conversión del histórico pasa a ser una limpieza OPCIONAL (archivo 47,
-- pendiente de aprobación) en lugar de un requisito.
--
--
-- Y POR QUÉ SE SINCRONIZAN LAS COLUMNAS VIEJAS
--
-- «worker_projects» —la vista por la que el trabajador ve su proyecto en
-- el móvil— lee «description», «measures» y «finish» DEL PROYECTO. Y lo
-- mismo hacen los informes y las copias de seguridad.
--
-- Si los productos se guardaran aparte y esas columnas se quedaran como
-- estaban, administración vería los productos nuevos y el trabajador
-- seguiría viendo los datos viejos. Eso es peor que no hacer nada.
--
-- Por eso «save_project_products» copia el PRIMER producto a esas tres
-- columnas. No es una migración automática: pasa solo cuando
-- administración edita los productos de ese proyecto a propósito, y
-- mantiene correcto a todo el que siga leyendo por el camino de antes.
--
--
-- MIGRACIÓN ESTRUCTURAL. Crea una tabla, una vista y dos funciones. NO
-- borra ni modifica ningún registro existente.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LOS PRODUCTOS DE UN PROYECTO
-- ---------------------------------------------------------------------
create table if not exists public.project_products (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  -- El orden en que se enseñan. No es único a propósito: así reordenar
  -- no obliga a pasar por valores temporales para no chocar.
  posicion    int  not null default 1 check (posicion > 0),
  name        text,
  description text,
  measures    text,
  finish      text,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Un producto sin NADA no es un producto: es un bloque vacío que
  -- alguien dejó sin rellenar.
  constraint project_products_algo check (
    coalesce(nullif(btrim(coalesce(name, '')), ''),
             nullif(btrim(coalesce(description, '')), ''),
             nullif(btrim(coalesce(measures, '')), ''),
             nullif(btrim(coalesce(finish, '')), '')) is not null)
);

comment on table public.project_products is
  'Las piezas de un proyecto, cada una con sus medidas y su acabado. Un proyecto sin filas aquí enseña sus propias columnas como un único producto.';
comment on column public.project_products.posicion is
  'El orden en que se enseñan los bloques. No tiene por qué ser consecutivo.';

create index if not exists project_products_proyecto_idx
  on public.project_products (project_id, posicion);


-- ---------------------------------------------------------------------
-- 2) LOS PRODUCTOS, CON RESPALDO
--
-- Es por aquí por donde lee la aplicación. Un proyecto SIN filas propias
-- devuelve un producto hecho con sus columnas, marcado «heredado», para
-- que la pantalla pueda decir de dónde viene.
-- ---------------------------------------------------------------------
create or replace view public.project_product_list with (security_invoker = true) as
  select pp.id, pp.project_id, pp.posicion,
         pp.name, pp.description, pp.measures, pp.finish,
         false as heredado
    from public.project_products pp
  union all
  select null::uuid, p.id, 1,
         p.name, p.description, p.measures, p.finish,
         true
    from public.projects p
   where not exists (select 1 from public.project_products x where x.project_id = p.id);

comment on view public.project_product_list is
  'Los productos de cada proyecto. Si no tiene ninguno guardado, devuelve uno construido con sus propias columnas y lo marca como heredado.';

grant select on public.project_product_list to authenticated, service_role;
revoke all on public.project_product_list from anon;

grant select on public.project_products to authenticated, service_role;
grant all    on public.project_products to service_role;
revoke all   on public.project_products from anon;

alter table public.project_products enable row level security;

-- Quien ve el proyecto ve sus productos: es la descripción del trabajo,
-- no dinero. Un trabajador asignado necesita saber qué tiene que hacer.
drop policy if exists project_products_select on public.project_products;
create policy project_products_select on public.project_products for select to authenticated
  using (public.is_admin() or public.worker_can_see_project(project_id));

comment on policy project_products_select on public.project_products is
  'Los productos los ve administración y quien está asignado al proyecto: es el trabajo que hay que hacer.';

-- No se escriben a pelo: se escriben con «save_project_products», que
-- comprueba que quede al menos un producto.
revoke insert, update, delete, truncate on public.project_products from authenticated;


-- ---------------------------------------------------------------------
-- 3) GUARDAR LOS PRODUCTOS
--
-- Se manda la lista COMPLETA, como en el resto de la aplicación: quitar
-- un producto es volver a mandarla sin él.
--
-- «p_products» es una lista de objetos:
--   [{"name": "...", "description": "...", "measures": "...", "finish": "..."}, ...]
--
-- SIEMPRE tiene que quedar al menos uno. Un proyecto sin ningún producto
-- no se sabe qué es.
-- ---------------------------------------------------------------------
create or replace function public.save_project_products(p_project uuid, p_products jsonb)
returns setof public.project_products
language plpgsql security definer set search_path = public as $$
declare
  p public.projects;
  v_utiles jsonb;
  v_primero jsonb;
begin
  perform public.assert_admin();

  select * into p from public.projects where id = p_project for update;
  if not found then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;

  -- Los bloques que alguien dejó enteros en blanco no son productos: se
  -- descartan antes de contar, para no obligar a nadie a borrarlos a
  -- mano.
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_utiles
    from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) x
   where coalesce(nullif(btrim(coalesce(x ->> 'name', '')), ''),
                  nullif(btrim(coalesce(x ->> 'description', '')), ''),
                  nullif(btrim(coalesce(x ->> 'measures', '')), ''),
                  nullif(btrim(coalesce(x ->> 'finish', '')), '')) is not null;

  if jsonb_array_length(v_utiles) = 0 then
    raise exception 'Un proyecto tiene que tener al menos un producto. Rellena el primero antes de guardar.'
      using errcode = '22023';
  end if;

  delete from public.project_products where project_id = p_project;

  insert into public.project_products
    (project_id, posicion, name, description, measures, finish, is_demo)
  select p_project, i,
         nullif(btrim(coalesce(x ->> 'name', '')), ''),
         nullif(btrim(coalesce(x ->> 'description', '')), ''),
         nullif(btrim(coalesce(x ->> 'measures', '')), ''),
         nullif(btrim(coalesce(x ->> 'finish', '')), ''),
         p.is_demo
    from jsonb_array_elements(v_utiles) with ordinality as t(x, i);

  -- EL PRIMER PRODUCTO SE COPIA AL PROYECTO.
  --
  -- No es capricho: «worker_projects», los informes y las copias de
  -- seguridad leen «description», «measures» y «finish» DEL PROYECTO. Si
  -- no se copiara, administración vería los productos nuevos y el
  -- trabajador seguiría viendo los viejos en su móvil.
  --
  -- El NOMBRE del proyecto NO se toca: es su título y es otra cosa.
  v_primero := v_utiles -> 0;
  update public.projects
     set description = nullif(btrim(coalesce(v_primero ->> 'description', '')), ''),
         measures    = nullif(btrim(coalesce(v_primero ->> 'measures', '')), ''),
         finish      = nullif(btrim(coalesce(v_primero ->> 'finish', '')), ''),
         updated_at  = now()
   where id = p_project;

  return query
    select * from public.project_products
     where project_id = p_project
     order by posicion;
end $$;

comment on function public.save_project_products(uuid, jsonb) is
  'Pone los productos de un proyecto. Se manda la lista completa y tiene que quedar al menos uno. El primero se copia a las columnas del proyecto, que es por donde leen el móvil y los informes.';

grant  execute on function public.save_project_products(uuid, jsonb) to authenticated;
revoke execute on function public.save_project_products(uuid, jsonb) from anon, public;


-- ---------------------------------------------------------------------
-- 4) LOS PRODUCTOS EN EL MÓVIL DEL TRABAJADOR
--
-- «worker_projects» se queda como está: sigue trayendo las columnas del
-- proyecto, que es lo que leen las pantallas de hoy, y eso ya no se
-- queda viejo porque el punto 3 las mantiene al día.
--
-- Lo que se añade es una vista para ENSEÑAR TODOS los productos a quien
-- tiene el proyecto asignado. Sin ella, un trabajador con un proyecto de
-- tres piezas solo vería la primera.
--
-- No lleva dinero, igual que el resto de lo que ve un trabajador.
-- ---------------------------------------------------------------------
create or replace view public.worker_project_products with (security_barrier = true) as
  select l.project_id, l.posicion, l.name, l.description, l.measures, l.finish, l.heredado
    from public.project_product_list l
   where public.is_admin() or public.worker_can_see_project(l.project_id);

comment on view public.worker_project_products is
  'Los productos de un proyecto para quien lo tiene asignado. Sin importe ni nada económico.';

grant select on public.worker_project_products to authenticated, service_role;
revoke all on public.worker_project_products from anon;
