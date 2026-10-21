-- =====================================================================
-- METALPLAFER360 · MATERIAL QUE YA TENEMOS EN EL ALMACÉN
--
-- N2 · Hasta ahora, todo lo que se anota en «materials» es material que
-- hay que PEDIR: tiene fecha de pedido, fecha prevista y un «recibido»
-- que se marca cuando llega. Pero a veces no hay que comprar nada: los
-- discos, las siliconas o el utillaje ya están en el taller y lo único
-- que se quiere es dejar constancia de que van a ese proyecto.
--
-- Hoy eso solo se puede hacer apuntándolo como si fuera un pedido, y
-- entonces sale en las listas de pendiente de comprar y en los avisos de
-- retraso, que es justo lo que no queremos.
--
--
-- EL CAMBIO MÍNIMO QUE LO SEPARA: UNA COLUMNA
--
-- Se mira primero si el modelo ya lo distinguía de alguna forma, y NO:
--
--   · «received» dice si ha llegado, no de dónde sale. Marcar como
--     recibido el material del almacén lo mezclaría con las compras que
--     ya han llegado, y el informe de material lo contaría como una
--     compra más;
--   · «supplier» puede estar vacío en los dos casos, así que tampoco
--     sirve para distinguirlos;
--   · «order_id» ata el material a una orden de trabajo, que es otra
--     cosa.
--
-- Así que hace falta decir expresamente de dónde sale cada material. Una
-- columna, con dos valores:
--
--   · «pedido»  · hay que comprarlo (todo lo que existe hoy);
--   · «almacen» · ya lo tenemos.
--
--
-- POR QUÉ UN TEXTO CON «CHECK» Y NO UN TIPO ENUMERADO
--
-- Porque el inventario que viene después va a añadir casos (por ejemplo,
-- material que salga de una referencia del catálogo), y ampliar la lista
-- será entonces redefinir el «check», que es una línea. Con un tipo
-- enumerado habría que tocar el tipo, que es más incómodo de revertir.
-- La aplicación ya usa texto con «check» en otros sitios.
--
--
-- CÓMO ESTO PREPARA EL INVENTARIO SIN IMPLEMENTARLO
--
-- Lo que se hace AHORA es solo separar las dos cosas. Pero se hace de
-- forma que el inventario de después no obligue a rehacerlo:
--
--   · el material de almacén es una fila de «materials» como las demás,
--     con su proyecto, su nombre y sus unidades. Cuando exista el
--     catálogo de referencias, bastará con AÑADIR una columna que apunte
--     a la referencia; las filas de hoy se quedarán con esa columna
--     vacía y seguirán siendo válidas;
--   · el NOMBRE del material NO se usa como identificador de nada. Es
--     texto que escribe una persona y dos personas escribirán «Disco de
--     corte 125» de tres maneras. La referencia del futuro catálogo será
--     otra cosa, con su propio identificador;
--   · NO se crea ninguna tabla de inventario vacía, ni existencias, ni
--     movimientos, ni se descuenta nada de ningún sitio. Hoy no hay
--     stock que descontar, y una tabla vacía «para más adelante» es una
--     invitación a que alguien la rellene a mano;
--   · «origin» distingue el origen, que es la pregunta que el inventario
--     también tendrá que responder.
--
-- MIGRACIÓN ESTRUCTURAL: una columna con valor por defecto y una
-- restricción. Las filas que ya existen NO se reescriben: añadir una
-- columna con valor por defecto es un cambio de catálogo, no de datos, y
-- todas quedan como lo que son, material pedido.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) DE DÓNDE SALE EL MATERIAL
--
-- «pedido» por defecto: todo lo que hay hoy en la base de datos es
-- material que se pidió o que hay que pedir, y así queda, sin tocar ni
-- una fila.
-- ---------------------------------------------------------------------
alter table public.materials
  add column if not exists origin text not null default 'pedido';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'materials_origin_valid') then
    alter table public.materials
      add constraint materials_origin_valid check (origin in ('pedido', 'almacen'));
  end if;
end $$;

comment on column public.materials.origin is
  'De dónde sale: «pedido» (hay que comprarlo) o «almacen» (ya lo tenemos). El nombre del material NO es una referencia de inventario.';


-- ---------------------------------------------------------------------
-- 2) EL MATERIAL DE ALMACÉN NO TIENE FECHAS DE PEDIDO
--
-- Esto no es una regla inventada: es lo que evita que el material que ya
-- tenemos se cuele en «Retrasado» y en los avisos de material que no
-- llega. Las dos cosas miran «expected_on», así que si el material de
-- almacén no la tiene, no aparece por ninguna de las dos, sin tocar ni
-- una consulta más.
--
-- Las filas que ya existen la cumplen todas: son de origen «pedido», y
-- la restricción solo les exige algo a las de almacén.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'materials_almacen_sin_pedido') then
    alter table public.materials
      add constraint materials_almacen_sin_pedido
      check (origin <> 'almacen' or (ordered_on is null and expected_on is null));
  end if;
end $$;

comment on constraint materials_almacen_sin_pedido on public.materials is
  'El material que ya tenemos no tiene fecha de pedido ni fecha prevista: no se ha pedido a nadie. Así no puede salir como retrasado.';


-- ---------------------------------------------------------------------
-- 3) BUSCARLO POR SU ORIGEN
--
-- Para la pestaña del almacén, que pregunta siempre por lo mismo.
-- ---------------------------------------------------------------------
create index if not exists materials_origin_idx
  on public.materials (origin) where archived_at is null;


-- ---------------------------------------------------------------------
-- 4) EL INFORME DE MATERIAL DICE DE DÓNDE SALE CADA UNO
--
-- Sin esto, el material del almacén aparecería en el informe de compras
-- mezclado con lo comprado y nadie sabría cuál es cuál. Es lo que pide
-- expresamente el encargo: que el material existente no se confunda con
-- el pendiente de comprar.
--
-- «create or replace function» NO puede cambiar las columnas que
-- devuelve una función, así que hay que borrarla y volver a crearla. Y
-- al borrarla se pierden sus permisos, por eso se vuelven a conceder
-- abajo, igual que los tenía (archivo 20).
--
-- El resto de la función es la del archivo 53, letra por letra: mismos
-- filtros, mismo orden y mismo «Taller» para el material sin proyecto.
-- ---------------------------------------------------------------------
drop function if exists public.report_materials(date, date);

create or replace function public.report_materials(p_from date, p_to date)
returns table (
  material text, unidades numeric, proveedor text, proyecto text,
  pedido date, previsto date, recibido boolean, dias_retraso integer,
  origen text
)
language sql stable security definer set search_path = public as $$
  select m.name, m.units, coalesce(m.supplier, '—'), coalesce(p.code, 'Taller'),
         m.ordered_on, m.expected_on, m.received,
         case when m.received or m.expected_on is null or m.expected_on >= public.today_madrid()
              then 0 else public.today_madrid() - m.expected_on end,
         case m.origin when 'almacen' then 'De almacén' else 'Pedido' end
    from public.materials m
    left join public.projects p on p.id = m.project_id
   where public.is_admin()
     and m.archived_at is null
     and (not m.received
          or coalesce(m.ordered_on, m.created_at::date) between p_from and p_to
          or m.updated_at::date between p_from and p_to)
   order by m.received, m.expected_on nulls last;
$$;

comment on function public.report_materials(date, date) is
  'Informe de material. «origen» separa lo que se compró de lo que ya teníamos en el almacén.';

revoke all     on function public.report_materials(date, date) from public, anon;
grant  execute on function public.report_materials(date, date) to authenticated;


-- ---------------------------------------------------------------------
-- 5) EL INFORME POR PROVEEDOR CUENTA SOLO LO QUE SE COMPRA
--
-- Es un informe de PROVEEDORES: el material del almacén no se le ha
-- comprado a nadie, así que contarlo ahí falsearía los pedidos de cada
-- proveedor. Generada a partir de la del archivo 19 con una condición
-- más; lo demás queda igual.
-- ---------------------------------------------------------------------
create or replace function public.report_suppliers(p_from date, p_to date)
returns table (
  proveedor text, pedidos bigint, pendientes bigint, retrasados bigint, retraso_medio numeric
)
language sql stable security definer set search_path = public as $$
  select coalesce(m.supplier, '—'),
         count(*),
         count(*) filter (where not m.received),
         count(*) filter (where not m.received and m.expected_on < public.today_madrid()),
         coalesce(round(avg(public.today_madrid() - m.expected_on)
                        filter (where not m.received and m.expected_on < public.today_madrid()), 1), 0)
    from public.materials m
   where public.is_admin()
     and m.archived_at is null
     and m.origin = 'pedido'
     and coalesce(m.ordered_on, m.created_at::date) <= p_to
   group by coalesce(m.supplier, '—')
   order by count(*) desc, 1;
$$;

comment on function public.report_suppliers(date, date) is
  'Pedidos por proveedor. Solo material de origen «pedido»: lo que ya teníamos en el almacén no se le compró a nadie.';
