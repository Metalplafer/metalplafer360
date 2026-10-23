-- =====================================================================
-- METALPLAFER360 · MATERIAL PREPARADO Y CARGADO, Y SU COMENTARIO
--
-- Lo que importa aquí:
--
--   · que se pueda marcar como preparado el material DE ALMACÉN y el
--     PEDIDO QUE YA LLEGÓ;
--   · que NO se pueda marcar el que está pedido y pendiente de recibir,
--     y que eso lo impida la BASE DE DATOS y no solo la pantalla;
--   · que marcar preparado no toque «recibido» ni el pedido;
--   · que si alguien desmarca «recibido», la marca de preparado se
--     limpie en lugar de dejar un estado imposible;
--   · que se pueda desmarcar;
--   · que los contadores del proyecto lo cuenten;
--   · que el COMENTARIO del material se guarde y se recupere, también en
--     el material de almacén, que es donde se vio el fallo;
--   · y que no haya aparecido ningún inventario por el camino.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== PREPARADO · LO QUE ESTÁ EN EL TALLER SE PUEDE PREPARAR'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

with p as (
  insert into public.projects (client_id, name, budget_amount, phase)
  values (test.id('cli_laura'), 'Pérgola de la azotea', 8800, 'fabricacion')
  returning id)
select test.put('pr_proy', (select id from p));

-- 1) Material de almacén: ya lo tenemos, así que se puede cargar.
with m as (
  insert into public.materials (project_id, name, units, origin, received, notes)
  values (test.id('pr_proy'), 'Tramex 30×30', 4, 'almacen', true,
          'Estantería 3, pasillo B. Quedan 6 planchas.')
  returning id)
select test.put('pr_almacen', (select id from m));

-- 2) Material pedido que YA llegó.
with m as (
  insert into public.materials (project_id, name, units, supplier, ordered_on,
                                expected_on, received, notes)
  values (test.id('pr_proy'), 'Tubo 60×40', 12, 'Aceros del Vallès',
          public.today_madrid() - 10, public.today_madrid() - 3, true,
          'Pedido con el albarán 4471.')
  returning id)
select test.put('pr_recibido', (select id from m));

-- 3) Material pedido que TODAVÍA NO ha llegado.
with m as (
  insert into public.materials (project_id, name, units, supplier, ordered_on,
                                expected_on, received, notes)
  values (test.id('pr_proy'), 'Chapa perforada', 2, 'Aceros del Vallès',
          public.today_madrid() - 1, public.today_madrid() + 7, false,
          'Lo confirman para la semana que viene.')
  returning id)
select test.put('pr_camino', (select id from m));

select test.ok('prep_marcar', 'Nada nace preparado',
  (select count(*) = 0 from public.materials
    where project_id = test.id('pr_proy') and prepared));

update public.materials set prepared = true where id = test.id('pr_almacen');
select test.ok('prep_marcar', 'El material de almacén se puede marcar como preparado',
  (select prepared from public.materials where id = test.id('pr_almacen')));

update public.materials set prepared = true where id = test.id('pr_recibido');
select test.ok('prep_marcar', 'Y el pedido que ya ha llegado, también',
  (select prepared from public.materials where id = test.id('pr_recibido')));

-- LO QUE NO PUEDE PASAR, y lo impide la base de datos.
select test.err('prep_reglas', 'El que está de camino NO se puede marcar',
  format($$update public.materials set prepared = true where id = %L$$,
         test.id('pr_camino')), '23514');

select test.ok('prep_reglas', 'Y sigue sin estar preparado después del intento',
  (select not prepared from public.materials where id = test.id('pr_camino')));

select test.err('prep_reglas', 'Ni naciendo marcado',
  format($$insert into public.materials (project_id, name, received, prepared)
           values (%L, 'Perfil que no ha llegado', false, true)$$,
         test.id('pr_proy')), '23514');

select test.ok('prep_reglas', 'La regla está en una restricción, no solo en la pantalla',
  exists (select 1 from pg_constraint
           where conname = 'materials_preparado_valido'
             and conrelid = 'public.materials'::regclass),
  (select string_agg(conname, ', ') from pg_constraint
    where conrelid = 'public.materials'::regclass and contype = 'c'));


\echo '== PREPARADO · NO TOCA EL PEDIDO NI LA RECEPCIÓN'

select test.ok('prep_pedido', 'Marcar preparado no cambia «recibido» ni el proveedor ni las fechas',
  (select received and supplier = 'Aceros del Vallès'
      and ordered_on = public.today_madrid() - 10
      and expected_on = public.today_madrid() - 3
     from public.materials where id = test.id('pr_recibido')));

select test.ok('prep_pedido', 'Ni crea ninguna petición de material',
  (select count(*) = 0 from public.material_requests
    where project_id = test.id('pr_proy')));

-- Desmarcar funciona y no arrastra nada.
update public.materials set prepared = false where id = test.id('pr_recibido');
select test.ok('prep_pedido', 'Se puede desmarcar, y lo demás queda como estaba',
  (select not prepared and received and supplier = 'Aceros del Vallès'
     from public.materials where id = test.id('pr_recibido')));
update public.materials set prepared = true where id = test.id('pr_recibido');

-- LA CORRECCIÓN QUE NO PUEDE ROMPERSE: desmarcar «recibido» de algo que
-- ya estaba preparado. No falla, y el estado imposible no se queda.
update public.materials set received = false where id = test.id('pr_recibido');

select test.ok('prep_pedido', 'Al desmarcar «recibido», la marca de preparado se limpia sola',
  (select not prepared and not received
     from public.materials where id = test.id('pr_recibido')),
  (select format('preparado=%s recibido=%s', prepared, received)
     from public.materials where id = test.id('pr_recibido')));

select test.ok('prep_pedido', 'Y el material vuelve a contarse como pendiente de llegar',
  (select pendientes = 2 from public.project_materials
    where project_id = test.id('pr_proy')),
  (select format('total=%s pendientes=%s', total, pendientes)
     from public.project_materials where project_id = test.id('pr_proy')));

-- Se vuelve a dejar como estaba para los contadores de abajo.
update public.materials set received = true where id = test.id('pr_recibido');
update public.materials set prepared = true where id = test.id('pr_recibido');

-- Y el material de ALMACÉN no se ve afectado por nada de esto: no
-- depende de «received» para poder estar preparado.
reset role; select test.as_server();
update public.materials set received = false where id = test.id('pr_almacen');
set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('prep_pedido', 'El de almacén sigue preparado aunque «recibido» esté en falso',
  (select prepared from public.materials where id = test.id('pr_almacen')),
  (select format('preparado=%s recibido=%s origen=%s', prepared, received, origin)
     from public.materials where id = test.id('pr_almacen')));

reset role; select test.as_server();
update public.materials set received = true where id = test.id('pr_almacen');
set role authenticated; select test.as_user(test.id('salvi'));


\echo '== PREPARADO · LOS CONTADORES DEL PROYECTO'

select test.ok('prep_cuentas', 'El proyecto cuenta dos preparados y uno pendiente de llegar',
  (select total = 3 and preparados = 2 and pendientes = 1
     from public.project_materials where project_id = test.id('pr_proy')),
  (select format('total=%s preparados=%s por_preparar=%s pendientes=%s',
                 total, preparados, por_preparar, pendientes)
     from public.project_materials where project_id = test.id('pr_proy')));

select test.ok('prep_cuentas', 'Y nada por preparar: lo que se podía cargar ya está cargado',
  (select por_preparar = 0 from public.project_materials
    where project_id = test.id('pr_proy')),
  (select por_preparar::text from public.project_materials
    where project_id = test.id('pr_proy')));

update public.materials set prepared = false where id = test.id('pr_almacen');
select test.ok('prep_cuentas', 'Al desmarcar uno, pasa a estar «por preparar»',
  (select preparados = 1 and por_preparar = 1 from public.project_materials
    where project_id = test.id('pr_proy')),
  (select format('preparados=%s por_preparar=%s', preparados, por_preparar)
     from public.project_materials where project_id = test.id('pr_proy')));

-- El que está de camino NO cuenta como «por preparar»: no se puede
-- preparar todavía.
select test.ok('prep_cuentas', 'Lo que está de camino no se cuenta como por preparar',
  (select por_preparar = 1 from public.project_materials
    where project_id = test.id('pr_proy')));

-- Las columnas de siempre siguen en su sitio y en su orden: la pantalla
-- las lee por nombre, pero añadir una columna en medio habría cambiado
-- lo que ve quien pida «*».
select test.ok('prep_cuentas', 'Las columnas de siempre siguen primero y en el mismo orden',
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'project_materials'
      and ordinal_position <= 4)
  = array['project_id', 'total', 'pendientes', 'retrasados'],
  (select string_agg(column_name::text, ', ' order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'project_materials'));


\echo '== PREPARADO · EL COMENTARIO DEL MATERIAL'

-- Esto es lo que se pedía investigar: el recorrido completo del dato. Se
-- comprueba que la base de datos lo guarda y lo devuelve, también en el
-- material de almacén, para dejar dicho que el fallo no estaba aquí.
select test.ok('prep_notas', 'El comentario del material de almacén se guarda tal cual',
  (select notes = 'Estantería 3, pasillo B. Quedan 6 planchas.'
     from public.materials where id = test.id('pr_almacen')),
  (select coalesce(notes, '(vacío)') from public.materials where id = test.id('pr_almacen')));

select test.ok('prep_notas', 'Y el del material pedido, igual',
  (select notes = 'Pedido con el albarán 4471.'
     from public.materials where id = test.id('pr_recibido')));

update public.materials
   set notes = 'Estantería 3, pasillo B. Quedan 2 planchas.'
 where id = test.id('pr_almacen');

select test.ok('prep_notas', 'Se puede corregir después',
  (select notes like '%Quedan 2 planchas.%'
     from public.materials where id = test.id('pr_almacen')));

update public.materials set notes = null where id = test.id('pr_almacen');
select test.ok('prep_notas', 'Vaciar el comentario lo deja vacío',
  (select notes is null from public.materials where id = test.id('pr_almacen')));

select test.ok('prep_notas', 'Cambiar el comentario no toca nada más',
  (select origin = 'almacen' and received and units = 4
      and supplier is null and ordered_on is null and expected_on is null
     from public.materials where id = test.id('pr_almacen')));

-- La columna existía desde el principio: no se ha añadido ninguna.
select test.ok('prep_notas', 'El comentario vive en «notes», que ya existía: no hay columna nueva',
  (select count(*) = 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'materials' and column_name = 'notes')
  and (select count(*) = 0 from information_schema.columns
        where table_schema = 'public' and table_name = 'materials'
          and column_name in ('comment', 'comentario', 'comments', 'observaciones')),
  (select string_agg(column_name::text, ', ') from information_schema.columns
    where table_schema = 'public' and table_name = 'materials'
      and column_name in ('notes', 'comment', 'comentario', 'comments', 'observaciones')));


\echo '== PREPARADO · SIGUE SIN HABER INVENTARIO'

reset role; select test.as_server();

select test.ok('prep_stock', 'Ningún disparador nuevo sobre el material',
  (select array_agg(tgname::text order by tgname)
     from pg_trigger where tgrelid = 'public.materials'::regclass and not tgisinternal)
  = array['materials_before', 'touch_updated_at', 'zz_audit'],
  (select string_agg(tgname::text, ', ' order by tgname)
     from pg_trigger where tgrelid = 'public.materials'::regclass and not tgisinternal));

select test.ok('prep_stock', 'Y ninguna tabla ni función de existencias',
  (select count(*) = 0 from pg_tables
    where schemaname = 'public'
      and (tablename like '%inventar%' or tablename like '%stock%'
           or tablename like '%existencia%'))
  and (select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (p.proname like '%stock%' or p.proname like '%existenc%'
               or p.proname like '%inventar%')));


\echo '== PREPARADO · LOS PERMISOS'

set role authenticated; select test.as_user(test.id('juan'));

-- La política «materials_update» es «is_admin()» y NO se ha tocado: un
-- trabajador no escribe en «materials». Marcar preparado es, hoy, cosa
-- de administración. Si se quiere que lo marquen los operarios desde su
-- móvil hace falta una función con permiso propio Y una pantalla donde
-- vean el material, y eso se deja propuesto en la entrega en lugar de
-- ampliar permisos por iniciativa propia.
select test.ok('prep_permisos', 'La política de escritura del material sigue siendo de administración',
  (select pg_get_expr(polqual, polrelid) = 'is_admin()'
     from pg_policy where polrelid = 'public.materials'::regclass
      and polname = 'materials_update'),
  (select pg_get_expr(polqual, polrelid) from pg_policy
    where polrelid = 'public.materials'::regclass and polname = 'materials_update'));

reset role; select test.as_server();
insert into public.project_workers (project_id, worker_id)
values (test.id('pr_proy'), test.id('juan')) on conflict do nothing;
set role authenticated; select test.as_user(test.id('juan'));

select test.ok('prep_permisos', 'Un trabajador asignado ve el material de su proyecto',
  (select count(*) = 3 from public.materials where project_id = test.id('pr_proy')),
  (select count(*)::text from public.materials where project_id = test.id('pr_proy')));

-- Intentar escribir no da error: la política simplemente no le deja ver
-- ninguna fila que actualizar, así que no cambia nada. Es como se
-- comportan las demás actualizaciones de la aplicación.
--
-- Se prueban LOS DOS SENTIDOS, y sobre materiales que están en el estado
-- contrario al que se intenta poner: si no, una prueba pasaría sola.
update public.materials set prepared = true  where id = test.id('pr_almacen');
update public.materials set prepared = false where id = test.id('pr_recibido');

select test.ok('prep_permisos', 'Un trabajador no puede marcar como preparado',
  (select not prepared from public.materials where id = test.id('pr_almacen')),
  (select prepared::text from public.materials where id = test.id('pr_almacen')));

select test.ok('prep_permisos', 'Ni desmarcar lo que administración marcó',
  (select prepared from public.materials where id = test.id('pr_recibido')),
  (select prepared::text from public.materials where id = test.id('pr_recibido')));

set role anon; select test.as_anon();
select test.err('prep_permisos', 'Sin sesión no se ve ni el material',
  'select count(*) from public.materials', '42501');

reset role; select test.as_server();
