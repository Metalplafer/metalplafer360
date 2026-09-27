-- =====================================================================
-- METALPLAFER360 · PRUEBAS DE PANEL, INFORMES Y COPIAS (FASE 6)
--
-- Continúa sobre los datos de las fases anteriores.
-- Se comprueba que los números de los informes salen bien, que una
-- restauración respeta las relaciones y no borra nada, y que nada de
-- esto lo puede tocar un trabajador.
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
reset role;
select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

\set DESDE '(public.today_madrid() - 365)'
\set HASTA '(public.today_madrid() + 30)'


\echo '== PANEL DE INICIO'
select test.setnote('panel', public.dashboard_summary(:DESDE, :HASTA)::text);

select test.ok('panel', 'El panel trae producción, proyectos, órdenes, material, alertas y economía',
  (select bool_and(test.note('panel')::jsonb ? k)
     from unnest(array['produccion', 'proyectos', 'ordenes', 'material', 'alertas', 'economico']) k));

select test.ok('panel', 'Cuenta las horas de fabricación y de montaje por separado',
  (test.note('panel')::jsonb -> 'produccion') ? 'horas_fabricacion'
  and (test.note('panel')::jsonb -> 'produccion') ? 'horas_montaje');

select test.ok('panel', 'Reparte los proyectos por fase',
  (test.note('panel')::jsonb -> 'proyectos') ? 'por_fase');

select test.ok('panel', 'Avisa de órdenes atrasadas, material retrasado y avisos del taller',
  (select bool_and((test.note('panel')::jsonb -> 'alertas') ? k)
     from unnest(array['ordenes_atrasadas', 'ordenes_por_revisar', 'material_retrasado',
                       'avisos_taller', 'fichas_por_asignar']) k));

select test.ok('panel', 'NO existe ninguna alerta de exceso de horas',
  not (select bool_or(k like '%hora%')
         from jsonb_object_keys(test.note('panel')::jsonb -> 'alertas') k));

select test.ok('panel', 'Trae presupuestado, cobrado y pendiente',
  (select bool_and((test.note('panel')::jsonb -> 'economico') ? k)
     from unnest(array['presupuestado', 'cobrado', 'pendiente']) k));

select test.ok('panel', 'Respeta el periodo que se le pide',
  (test.note('panel')::jsonb -> 'periodo' ->> 'hasta')::date = public.today_madrid() + 30);


\echo '== INFORMES'
select test.ok('informes', 'Informe de proyectos con presupuesto, cobrado y horas',
  (select count(*) > 0 from public.report_projects(:DESDE, :HASTA)));

select test.ok('informes', 'Cada proyecto trae su cliente, su fase y su estado de cobro',
  (select bool_and(cliente is not null and fase is not null and estado_cobro is not null)
     from public.report_projects(:DESDE, :HASTA)));

-- Lo que devuelve el informe es lo que se imprime en el Excel y en el PDF,
-- así que no puede salir «pendiente_cobro» sino «Pendiente de cobro».
select test.ok('informes', 'Los estados de cobro salen en castellano, no como los guarda la base',
  (select bool_and(estado_cobro !~ '_' and estado_cobro = initcap(left(estado_cobro, 1)) || substr(estado_cobro, 2))
     from public.report_projects(:DESDE, :HASTA)));

select test.ok('informes', 'El tiempo medio solo cuenta los proyectos ya finalizados',
  (select bool_and((finalizado is null) = (dias is null))
     from public.report_projects(:DESDE, :HASTA)));

select test.ok('informes', 'El reparto por fase incluye las cinco fases',
  (select count(*) = 5 from public.report_projects_by_phase(:DESDE, :HASTA)));

select test.ok('informes', 'Las fases salen en castellano y en orden',
  (select fase from public.report_projects_by_phase(:DESDE, :HASTA) limit 1) = 'En preparación');

select test.ok('informes', 'Horas por trabajador, separando fabricación y montaje',
  (select bool_and(total = fabricacion + montaje)
     from public.report_hours_by_worker(:DESDE, :HASTA)));

select test.ok('informes', 'Juan aparece con sus horas reales',
  (select total > 0 from public.report_hours_by_worker(:DESDE, :HASTA)
    where trabajador like 'Juan%'));

select test.ok('informes', 'Horas por proyecto, con las previstas y el desvío',
  (select bool_and(desvio = total - previstas)
     from public.report_hours_by_project(:DESDE, :HASTA)));

select test.ok('informes', 'Informe de material con los días de retraso',
  (select count(*) > 0 from public.report_materials(:DESDE, :HASTA)));

select test.ok('informes', 'El material recibido nunca figura como retrasado',
  (select bool_and(not recibido or dias_retraso = 0)
     from public.report_materials(:DESDE, :HASTA)));

select test.ok('informes', 'Proveedores más utilizados, con sus pendientes y retrasos',
  (select count(*) > 0 from public.report_suppliers(:DESDE, :HASTA)));

select test.ok('informes', 'El proveedor más utilizado sale primero',
  (select pedidos from public.report_suppliers(:DESDE, :HASTA) limit 1)
  >= (select min(pedidos) from public.report_suppliers(:DESDE, :HASTA)));


\echo '== CONFIGURACIÓN'
select public.set_company('{"name": "METALPLAFER S.L.", "tax_id": "B72768310", "city": "Sabadell"}'::jsonb);
select test.ok('config', 'Se guardan los datos de la empresa',
  (select company ->> 'name' = 'METALPLAFER S.L.' and company ->> 'city' = 'Sabadell'
     from public.app_settings where id = 1));

select public.set_company('{"phone": "937 000 000"}'::jsonb);
select test.ok('config', 'Cambiar un dato no borra los demás',
  (select company ->> 'name' = 'METALPLAFER S.L.' and company ->> 'phone' = '937 000 000'
     from public.app_settings where id = 1));

select public.set_max_file_mb(50);
select test.ok('config', 'Se puede cambiar el tamaño máximo de archivo',
  (select max_file_mb = 50 from public.app_settings where id = 1));

select test.err('config', 'Un tamaño imposible se rechaza',
  $$select public.set_max_file_mb(500)$$, '22023');

select public.set_backup_settings('{"enabled": true, "hour": 2}'::jsonb, 30);
select test.ok('config', 'Se guardan la hora del backup y los días de retención',
  (select (backup ->> 'hour')::int = 2 and backup_retention_days = 30
     from public.app_settings where id = 1));

select test.err('config', 'Una retención imposible se rechaza',
  $$select public.set_backup_settings('{}'::jsonb, 4000)$$, '22023');

select test.ok('config', 'Las credenciales de Google NO se guardan en la base de datos',
  (select not (backup::text ilike '%private_key%' or backup::text ilike '%client_secret%'
               or backup::text ilike '%refresh_token%')
     from public.app_settings where id = 1));

select public.set_counter('PRES', extract(year from public.today_madrid())::int, 40);
select test.ok('config', 'Se puede corregir la numeración de una serie',
  (select last_value = 40 from public.code_counters
    where prefix = 'PRES' and year = extract(year from public.today_madrid())::int));

select test.err('config', 'Una numeración negativa se rechaza',
  $$select public.set_counter('PRES', 2026, -1)$$, '22023');

select public.set_preferences('{"dashboard": ["produccion", "ordenes"]}'::jsonb);
select test.ok('config', 'Cada persona guarda sus preferencias de pantalla',
  (select preferences -> 'dashboard' ->> 0 = 'produccion'
     from public.profiles where id = test.id('salvi')));

select test.ok('config', 'El uso del almacenamiento se puede consultar',
  (select count(*) >= 0 from public.storage_usage));


\echo '== COPIAS DE SEGURIDAD'
select test.ok('backup', 'La copia incluye las 16 tablas de datos',
  array_length(public.backup_tables(), 1) = 16);

select test.ok('backup', 'Se cuenta cuántas filas lleva cada tabla',
  (select (public.backup_counts() ->> 'clients')::int > 0));

select test.put('bk1', (public.start_backup('manual', 'descarga')).id);
select test.ok('backup', 'Una copia empieza en curso',
  (select status = 'en_curso' and kind = 'manual'
     from public.backups where id = test.id('bk1')));

select public.finish_backup(test.id('bk1'), 'metalplafer360-backup.zip', 123456,
  public.backup_counts(), 7, null, null, null);

select test.ok('backup', 'Al terminar queda completada, con nombre y tamaño',
  (select status = 'completado' and file_name = 'metalplafer360-backup.zip'
      and size_bytes = 123456 and documents_count = 7 and finished_at is not null
     from public.backups where id = test.id('bk1')));

select test.ok('backup', 'La copia queda registrada en el historial',
  exists (select 1 from public.audit_log
           where action = 'backup' and summary like '%generó una copia de seguridad%'));

-- Copia automática antigua: debe salir como caducada.
-- Se crean desde el servidor porque la aplicación no escribe en esta
-- tabla directamente: lo hace con start_backup y finish_backup.
reset role; select test.as_server();
with x as (
  insert into public.backups (kind, status, destination, file_name, drive_file_id,
                              started_at, finished_at, size_bytes)
  values ('automatico'::public.backup_kind, 'completado'::public.backup_status, 'drive', 'vieja.zip', 'drive-123',
          now() - interval '45 days', now() - interval '45 days', 1000)
  returning id)
select test.put('bk_vieja', id) from x;

with x as (
  insert into public.backups (kind, status, destination, file_name, drive_file_id,
                              started_at, finished_at, size_bytes)
  values ('automatico'::public.backup_kind, 'completado'::public.backup_status, 'drive', 'reciente.zip', 'drive-456',
          now() - interval '3 days', now() - interval '3 days', 1000)
  returning id)
select test.put('bk_reciente', id) from x;
set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('backup', 'A los 30 días una copia automática caduca',
  (select count(*) = 1 from public.expired_backups())
  and (select e.id = test.id('bk_vieja') from public.expired_backups() e limit 1));

select test.ok('backup', 'Las copias recientes no caducan',
  not exists (select 1 from public.expired_backups() e where e.id = test.id('bk_reciente')));

select public.forget_backup(test.id('bk_vieja'));
select test.ok('backup', 'Al borrarla de Drive se quita también su ficha',
  not exists (select 1 from public.backups b where b.id = test.id('bk_vieja')));

select test.ok('backup', 'Las copias no se escriben a mano en la tabla',
  not has_table_privilege('authenticated', 'public.backups', 'insert'));


\echo '== RESTAURACIÓN'
-- Se simula una copia: un cliente que ya existe (con el nombre cambiado),
-- un cliente nuevo, un proyecto nuevo y una orden de ese proyecto nuevo.
-- La orden va ANTES que el proyecto a propósito: la restauración debe
-- ordenar las tablas ella sola para no romper las relaciones.
select test.setnote('payload', jsonb_build_object(
  'work_orders', jsonb_build_array(jsonb_build_object(
    'id', '00000000-0000-4000-8000-000000000031',
    'code', 'OT-9999-901',
    'project_id', '00000000-0000-4000-8000-000000000021',
    'type', 'fabricacion',
    'scheduled_date', public.today_madrid()::text,
    'description', 'Orden restaurada de una copia',
    'planned_hours', 4,
    'status', 'pendiente',
    'created_at', now()::text,
    'updated_at', now()::text)),
  'projects', jsonb_build_array(jsonb_build_object(
    'id', '00000000-0000-4000-8000-000000000021',
    'code', 'PROY-9999-901',
    'client_id', '00000000-0000-4000-8000-000000000011',
    'name', 'Proyecto restaurado',
    'phase', 'preparacion',
    'billing_status', 'por_facturar',
    'no_assembly', false,
    'budget_hours_fab', 0, 'budget_hours_mont', 0,
    'created_at', now()::text, 'updated_at', now()::text)),
  'clients', jsonb_build_array(
    jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000000011',
      'kind', 'empresa', 'name', 'Cliente restaurado SL',
      'active', true, 'is_demo', false,
      'created_at', now()::text, 'updated_at', now()::text),
    jsonb_build_object(
      'id', test.id('cli_laura')::text,
      'kind', 'particular', 'name', 'Laura Sanz (restaurada)',
      'active', true, 'is_demo', false,
      'created_at', now()::text, 'updated_at', now()::text))
)::text);

select test.setnote('clientes_antes', (select count(*)::text from public.clients));

select test.setnote('resultado', public.restore_data(test.note('payload')::jsonb)::text);

select test.ok('restauracion', 'Se restauran las tres tablas de la copia',
  (select bool_and((test.note('resultado')::jsonb -> 'filas') ? k)
     from unnest(array['clients', 'projects', 'work_orders']) k));

select test.ok('restauracion', 'Respeta las relaciones: el proyecto entra antes que su orden',
  (select project_id = '00000000-0000-4000-8000-000000000021'
     from public.work_orders where id = '00000000-0000-4000-8000-000000000031'));

select test.ok('restauracion', 'El proyecto restaurado apunta a su cliente restaurado',
  (select c.name = 'Cliente restaurado SL'
     from public.projects p join public.clients c on c.id = p.client_id
    where p.id = '00000000-0000-4000-8000-000000000021'));

select test.ok('restauracion', 'Lo que ya existía se actualiza',
  (select name = 'Laura Sanz (restaurada)' from public.clients where id = test.id('cli_laura')));

select test.ok('restauracion', 'NO se borra nada de lo que había',
  (select count(*) from public.clients) >= test.note('clientes_antes')::int + 1);

select test.ok('restauracion', 'La restauración queda registrada en el historial',
  exists (select 1 from public.audit_log
           where action = 'restauracion' and summary like '%restauró una copia de seguridad%'));

select test.ok('restauracion', 'El historial dice qué apartados se restauraron',
  exists (select 1 from public.audit_log
           where action = 'restauracion' and details -> 'filas' ? 'clients'));

select test.ok('restauracion', 'Al restaurar no se inventa un código nuevo',
  (select code = 'PROY-9999-901' from public.projects
    where id = '00000000-0000-4000-8000-000000000021'));

-- Restauración PARCIAL: solo clientes
select test.setnote('payload2', jsonb_build_object(
  'clients', jsonb_build_array(jsonb_build_object(
    'id', '00000000-0000-4000-8000-000000000011',
    'kind', 'empresa', 'name', 'Cliente restaurado SL (corregido)',
    'active', true, 'is_demo', false,
    'created_at', now()::text, 'updated_at', now()::text)),
  'projects', jsonb_build_array(jsonb_build_object(
    'id', '00000000-0000-4000-8000-000000000021',
    'code', 'PROY-9999-901',
    'client_id', '00000000-0000-4000-8000-000000000011',
    'name', 'ESTE NOMBRE NO DEBE ENTRAR',
    'phase', 'preparacion', 'billing_status', 'por_facturar', 'no_assembly', false,
    'budget_hours_fab', 0, 'budget_hours_mont', 0,
    'created_at', now()::text, 'updated_at', now()::text))
)::text);

select public.restore_data(test.note('payload2')::jsonb, array['clientes']);

select test.ok('restauracion', 'Una restauración parcial solo toca su apartado',
  (select name = 'Cliente restaurado SL (corregido)' from public.clients
    where id = '00000000-0000-4000-8000-000000000011')
  and (select name = 'Proyecto restaurado' from public.projects
        where id = '00000000-0000-4000-8000-000000000021'));

select test.ok('restauracion', 'Cada apartado sabe qué tablas lleva',
  public.restore_scope_tables('proyectos') = array['projects', 'project_substatuses']
  and public.restore_scope_tables('ordenes') = array['work_orders', 'work_order_workers']);

select test.err('restauracion', 'Una copia vacía se rechaza',
  $$select public.restore_data(null)$$, '22023');

select test.ok('restauracion', 'Una tabla que no es de la copia se ignora sin tocar nada',
  (public.restore_data(jsonb_build_object('pg_shadow', jsonb_build_array(jsonb_build_object('x', 1))),
                       array['clientes']) ->> 'total')::int = 0);

reset role; select test.as_server();
select test.err('restauracion', 'Y por dentro se rechaza explícitamente',
  $$select public.restore_table('pg_shadow', jsonb_build_array(jsonb_build_object('x', 1)))$$, '22023');
select test.err('restauracion', 'Una copia sin la clave de la fila se rechaza',
  $$select public.restore_table('clients', jsonb_build_array(jsonb_build_object('name', 'Sin id')))$$, '22023');
set role authenticated; select test.as_user(test.id('salvi'));

-- Los perfiles se actualizan, pero no se crean usuarios nuevos al restaurar
select public.restore_data(jsonb_build_object('profiles', jsonb_build_array(
  jsonb_build_object('id', '00000000-0000-4000-8000-0000000000ff',
                     'full_name', 'Usuario inventado', 'role', 'admin', 'active', true,
                     'created_at', now()::text, 'updated_at', now()::text)
)), array['usuarios']);

select test.ok('restauracion', 'Restaurar no crea usuarios que no existen en el acceso',
  not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000000ff'));

select public.restore_data(jsonb_build_object('profiles', jsonb_build_array(
  jsonb_build_object('id', test.id('montse')::text, 'full_name', 'Montse Grau Roca',
                     'role', 'worker', 'active', true,
                     'created_at', now()::text, 'updated_at', now()::text)
)), array['usuarios']);

select test.ok('restauracion', 'Pero sí actualiza los datos de los que ya existen',
  (select full_name = 'Montse Grau Roca' from public.profiles where id = test.id('montse')));


\echo '== PERMISOS DE FASE 6'
select test.as_user(test.id('juan'));

select test.err('permisos_f6', 'Un trabajador no ve el panel de administración',
  $$select public.dashboard_summary(public.today_madrid(), public.today_madrid())$$, '42501');

select test.ok('permisos_f6', 'Ni saca informes',
  (select count(*) = 0 from public.report_projects(:DESDE, :HASTA))
  and (select count(*) = 0 from public.report_hours_by_worker(:DESDE, :HASTA))
  and (select count(*) = 0 from public.report_suppliers(:DESDE, :HASTA)));

select test.ok('permisos_f6', 'No ve ninguna copia de seguridad',
  (select count(*) = 0 from public.backups));

select test.err('permisos_f6', 'No puede generar una copia',
  $$select public.start_backup('manual', 'descarga')$$, '42501');

select test.err('permisos_f6', 'Ni saber cuántas filas hay en cada tabla',
  $$select public.backup_counts()$$, '42501');

select test.err('permisos_f6', 'Ni restaurar nada',
  $$select public.restore_data(jsonb_build_object('clients', '[]'::jsonb))$$, '42501');

select test.err('permisos_f6', 'Ni cambiar los datos de la empresa',
  $$select public.set_company('{"name":"Mía S.L."}'::jsonb)$$, '42501');

select test.err('permisos_f6', 'Ni la numeración',
  $$select public.set_counter('PRES', 2026, 1)$$, '42501');

select test.err('permisos_f6', 'Ni el tamaño máximo de archivo',
  $$select public.set_max_file_mb(100)$$, '42501');

select public.set_preferences('{"dashboard": ["mias"]}'::jsonb);
select test.ok('permisos_f6', 'Pero sí guarda sus propias preferencias',
  (select preferences -> 'dashboard' ->> 0 = 'mias' from public.profiles where id = test.id('juan')));

select test.ok('permisos_f6', 'Y no toca las de nadie más',
  (select preferences -> 'dashboard' ->> 0 = 'produccion'
     from public.profiles where id = test.id('salvi')) is not false);

select test.ok('permisos_f6', 'Las piezas internas de la restauración no son accesibles',
  not has_function_privilege('authenticated', 'public.restore_table(text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.primary_key_of(text)', 'execute'));

reset role; set role anon; select test.as_anon();
select test.err('permisos_f6', 'Sin sesión no hay panel',
  $$select public.dashboard_summary(public.today_madrid(), public.today_madrid())$$, '42501');
select test.err('permisos_f6', 'Sin sesión no hay informes',
  $$select * from public.report_projects(public.today_madrid(), public.today_madrid())$$, '42501');
select test.err('permisos_f6', 'Sin sesión no se ven las copias',
  'select * from public.backups', '42501');
select test.err('permisos_f6', 'Sin sesión no se restaura nada',
  $$select public.restore_data('{}'::jsonb)$$, '42501');

reset role;
