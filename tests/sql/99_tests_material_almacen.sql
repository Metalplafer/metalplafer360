-- =====================================================================
-- METALPLAFER360 · MATERIAL QUE YA TENEMOS EN EL ALMACÉN
--
-- Lo que importa aquí:
--
--   · que se pueda anotar en un proyecto material que ya tenemos, SIN
--     proveedor y sin pedirle nada a nadie;
--   · que NO genere ninguna petición de material ni ningún pedido;
--   · que todo lo que ya existía siga siendo «pedido» y funcione igual;
--   · que el material del almacén NO salga como pendiente de comprar, ni
--     como retrasado, ni en el aviso de material que no llega;
--   · que el informe de material diga de dónde sale cada uno, y que el
--     informe por proveedor NO cuente lo que no se le compró a nadie;
--   · que no exista ningún descuento de existencias en ninguna parte,
--     porque todavía no hay inventario;
--   · y que el nombre del material NO se use como si fuera una
--     referencia: dos materiales pueden llamarse igual.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== ALMACÉN · LO QUE YA HABÍA NO SE TOCA'

reset role; select test.as_server();

select test.ok('alm_antes', 'Todo el material que ya existía es material pedido',
  (select count(*) = 0 from public.materials where origin <> 'pedido'),
  (select string_agg(name || ' (' || origin || ')', ' | ')
     from public.materials where origin <> 'pedido'));

select test.ok('alm_antes', 'La columna nace en «pedido» y es obligatoria',
  (select is_nullable = 'NO' and column_default like '%pedido%'
     from information_schema.columns
    where table_schema = 'public' and table_name = 'materials' and column_name = 'origin'),
  (select coalesce(column_default, 'sin valor por defecto') from information_schema.columns
    where table_schema = 'public' and table_name = 'materials' and column_name = 'origin'));

-- Que no haya inventario es parte del encargo: nada de existencias.
select test.ok('alm_antes', 'No se ha creado ninguna tabla de inventario ni de existencias',
  (select count(*) = 0 from pg_tables
    where schemaname = 'public'
      and (tablename like '%inventar%' or tablename like '%stock%'
           or tablename like '%existencia%' or tablename like '%movimiento%')),
  (select string_agg(tablename, ', ') from pg_tables
    where schemaname = 'public'
      and (tablename like '%inventar%' or tablename like '%stock%')));


\echo '== ALMACÉN · ANOTAR MATERIAL QUE YA TENEMOS'

set role authenticated; select test.as_user(test.id('salvi'));

with p as (
  insert into public.projects (client_id, name, budget_amount, phase)
  values (test.id('cli_laura'), 'Puerta metálica del almacén', 2600, 'fabricacion')
  returning id)
select test.put('al_proy', (select id from p));

-- Lo que ya tenemos: sin proveedor, sin fechas, y disponible de entrada.
with m as (
  insert into public.materials (project_id, name, units, origin, received)
  values (test.id('al_proy'), 'Discos de corte 125 mm', 10, 'almacen', true)
  returning id)
select test.put('al_mat', (select id from m));

select test.ok('alm_alta', 'Se anota en el proyecto, sin proveedor y sin fechas de pedido',
  (select project_id = test.id('al_proy') and origin = 'almacen' and units = 10
          and supplier is null and supplier_id is null
          and ordered_on is null and expected_on is null
     from public.materials where id = test.id('al_mat')));

select test.ok('alm_alta', 'Y queda disponible, no pendiente de que llegue',
  (select received from public.materials where id = test.id('al_mat')));

-- LO QUE NO TIENE QUE PASAR: que anotar lo que ya tenemos pida algo a
-- alguien.
select test.ok('alm_alta', 'No se ha creado ninguna petición de material',
  (select count(*) = 0 from public.material_requests
    where material_id = test.id('al_mat')
       or (project_id = test.id('al_proy'))),
  (select string_agg(body, ' | ') from public.material_requests
    where project_id = test.id('al_proy')));

select test.ok('alm_alta', 'Ni ninguna orden de trabajo',
  (select order_id is null from public.materials where id = test.id('al_mat')));

select test.ok('alm_alta', 'El historial lo apunta como material del proyecto',
  exists (select 1 from public.audit_log
           where entity_type = 'materials'
             and summary like '%Discos de corte 125 mm%'
             and summary like '%' ||
                 (select code from public.projects where id = test.id('al_proy')) || '%'));

-- Y se puede consultar desde el proyecto, que es para lo que se anota.
select test.ok('alm_alta', 'Se consulta desde el proyecto',
  (select count(*) = 1 from public.materials
    where project_id = test.id('al_proy') and origin = 'almacen'));


\echo '== ALMACÉN · NO SE CONFUNDE CON LO QUE HAY QUE COMPRAR'

-- Un material de los de siempre en el MISMO proyecto: así se ve que la
-- diferencia es real y no que el proyecto no tiene de lo otro.
with m as (
  insert into public.materials (project_id, name, units, supplier, expected_on)
  values (test.id('al_proy'), 'Tubo 40×40', 6, 'Aceros del Vallès',
          public.today_madrid() - 2)
  returning id)
select test.put('al_pedido', (select id from m));

select test.ok('alm_mezcla', 'El pendiente de comprar sigue siendo pendiente',
  (select origin = 'pedido' and not received and expected_on is not null
     from public.materials where id = test.id('al_pedido')));

select test.ok('alm_mezcla', 'Los contadores del proyecto NO cuentan el de almacén como pendiente',
  (select total = 2 and pendientes = 1 and retrasados = 1
     from public.project_materials where project_id = test.id('al_proy')),
  (select format('total=%s pendientes=%s retrasados=%s', total, pendientes, retrasados)
     from public.project_materials where project_id = test.id('al_proy')));

-- El aviso de material que no llega mira «expected_on», y el de almacén
-- no la tiene: no puede colarse por ahí.
reset role; select test.as_server();
update public.materials set late_notified_on = null where id = test.id('al_pedido');
set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('alm_mezcla', 'El aviso de retrasos avisa del pedido',
  public.notify_late_materials() >= 1);

reset role; select test.as_server();
select test.ok('alm_mezcla', 'Y NO avisa de lo que ya tenemos en el almacén',
  not exists (select 1 from public.notifications
               where kind = 'material_retrasado' and body like '%Discos de corte 125 mm%'
                 and created_at > now() - interval '1 minute'),
  (select string_agg(body, ' | ') from public.notifications
    where kind = 'material_retrasado' and created_at > now() - interval '1 minute'));


\echo '== ALMACÉN · LO QUE LA BASE DE DATOS NO ADMITE'

set role authenticated; select test.as_user(test.id('salvi'));

select test.err('alm_reglas', 'Un origen inventado se rechaza',
  format($$insert into public.materials (project_id, name, origin)
           values (%L, 'Lo que sea', 'regalo')$$, test.id('al_proy')), '23514');

-- Esta es la que evita que el material del almacén salga como retrasado.
select test.err('alm_reglas', 'El material del almacén no puede llevar fecha prevista',
  format($$insert into public.materials (project_id, name, origin, expected_on)
           values (%L, 'Mal puesto', 'almacen', current_date + 5)$$, test.id('al_proy')), '23514');

select test.err('alm_reglas', 'Ni fecha de pedido',
  format($$insert into public.materials (project_id, name, origin, ordered_on)
           values (%L, 'Mal puesto', 'almacen', current_date)$$, test.id('al_proy')), '23514');

select test.err('alm_reglas', 'Y uno de los de siempre tampoco puede pasarse a almacén dejando las fechas',
  format($$update public.materials set origin = 'almacen' where id = %L$$,
         test.id('al_pedido')), '23514');

-- Dos materiales pueden llamarse igual: el nombre NO es una referencia.
insert into public.materials (project_id, name, units, origin, received)
values (test.id('al_proy'), 'Discos de corte 125 mm', 4, 'almacen', true);

select test.ok('alm_reglas', 'Dos materiales pueden llamarse igual: el nombre no identifica nada',
  (select count(*) = 2 from public.materials
    where project_id = test.id('al_proy') and name = 'Discos de corte 125 mm'));


\echo '== ALMACÉN · LOS INFORMES LO SEPARAN'

select test.ok('alm_informe', 'El informe de material dice de dónde sale cada uno',
  (select count(*) filter (where origen = 'De almacén') = 2
      and count(*) filter (where origen = 'Pedido') >= 1
     from public.report_materials(public.today_madrid() - 30, public.today_madrid())
    where material in ('Discos de corte 125 mm', 'Tubo 40×40')),
  (select string_agg(material || '=' || origen, ' | ')
     from public.report_materials(public.today_madrid() - 30, public.today_madrid())
    where material in ('Discos de corte 125 mm', 'Tubo 40×40')));

select test.ok('alm_informe', 'Y el de almacén no sale como retrasado en el informe',
  (select bool_and(dias_retraso = 0)
     from public.report_materials(public.today_madrid() - 30, public.today_madrid())
    where origen = 'De almacén'));

-- El informe por proveedor es de COMPRAS: lo que ya teníamos no se le
-- compró a nadie y no puede sumar a ningún proveedor.
--
-- Para que esto compruebe algo DE VERDAD hace falta material de almacén
-- CON proveedor apuntado —que la base de datos admite: a veces se sabe
-- de dónde salió aunque no se esté comprando ahora—. Sin eso, la
-- comprobación pasaba sola: se vio rompiendo la regla a propósito y
-- ninguna prueba se enteró.
select test.setnote('alm_pedidos_antes',
  (select coalesce(pedidos, 0)::text
     from public.report_suppliers(public.today_madrid() - 400, public.today_madrid())
    where proveedor = 'Aceros del Vallès'));

insert into public.materials (project_id, name, units, origin, received, supplier)
values (test.id('al_proy'), 'Silicona neutra (del almacén)', 3, 'almacen', true,
        'Aceros del Vallès');

select test.ok('alm_informe', 'El informe por proveedor no cuenta el material de almacén',
  (select coalesce(pedidos, 0)::text
     from public.report_suppliers(public.today_madrid() - 400, public.today_madrid())
    where proveedor = 'Aceros del Vallès')
    = test.note('alm_pedidos_antes'),
  format('antes %s, ahora %s', test.note('alm_pedidos_antes'),
         (select coalesce(pedidos, 0)::text
            from public.report_suppliers(public.today_madrid() - 400, public.today_madrid())
           where proveedor = 'Aceros del Vallès')));

select test.ok('alm_informe', 'Pero sí sale en el informe de material, con su origen',
  exists (select 1 from public.report_materials(
                        public.today_madrid() - 30, public.today_madrid())
           where material = 'Silicona neutra (del almacén)' and origen = 'De almacén'
             and proveedor = 'Aceros del Vallès'));

select test.ok('alm_informe', 'Los pedidos de verdad siguen contando igual',
  (select pedidos >= 1 from public.report_suppliers(
                              public.today_madrid() - 400, public.today_madrid())
    where proveedor = 'Aceros del Vallès'));


\echo '== ALMACÉN · NADA DE EXISTENCIAS'

reset role; select test.as_server();

-- No hay stock que descontar, así que no puede haber nada que lo
-- descuente. Si alguien añade un disparador de inventario sin el módulo,
-- esto lo caza.
select test.ok('alm_stock', 'Ningún disparador nuevo sobre el material',
  (select array_agg(tgname::text order by tgname)
     from pg_trigger where tgrelid = 'public.materials'::regclass and not tgisinternal)
  = array['materials_before', 'touch_updated_at', 'zz_audit'],
  (select string_agg(tgname::text, ', ' order by tgname)
     from pg_trigger where tgrelid = 'public.materials'::regclass and not tgisinternal));

select test.ok('alm_stock', 'Y ninguna función de existencias',
  (select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like '%stock%' or p.proname like '%existenc%'
           or p.proname like '%inventar%')),
  (select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like '%stock%' or p.proname like '%inventar%')));
