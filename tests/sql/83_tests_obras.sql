-- =====================================================================
-- METALPLAFER360 · PRUEBAS DEL BLOQUE 4 · OBRAS
--
-- Lo que importa aquí:
--   · que la obra agrupe sin cambiar cómo funciona un proyecto;
--   · que las cuentas salgan: proyectos + extras = total estimado,
--     y que el pendiente de facturar sea el que es;
--   · que un trabajador NO vea nada del dinero de la obra;
--   · que todo quede en el historial.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== BLOQUE 4 · CREAR UNA OBRA Y METERLE PROYECTOS'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

select test.put('b4_obra', (select id from public.save_work(
  null, 'Comunidad Calle Mayor 25', test.id('cli_laura'),
  'Calle Mayor 25, Sabadell', 'Cuatro trabajos para la comunidad.',
  'Hablar siempre con el presidente.')));

select test.ok('b4_obra', 'La obra se numera como todo lo demás',
  (select code from public.works where id = test.id('b4_obra')) like 'OBRA-%');

select test.ok('b4_obra', 'Y guarda cliente, dirección y observaciones',
  (select client_id = test.id('cli_laura')
      and address = 'Calle Mayor 25, Sabadell'
      and observations like 'Hablar siempre%'
     from public.works where id = test.id('b4_obra')));

select test.err('b4_obra', 'Una obra sin nombre no se crea',
  $$select public.save_work(null, '   ')$$, '22023');

-- Dos proyectos dentro de la obra, y uno fuera.
with a as (insert into public.projects (client_id, name, budget_amount, budget_hours_fab)
           values (test.id('cli_laura'), 'Puerta de entrada', 3200, 16) returning id)
select test.put('b4_p1', (select id from a));
with b as (insert into public.projects (client_id, name, budget_amount, budget_hours_fab)
           values (test.id('cli_laura'), 'Barandilla de la obra', 1800, 8) returning id)
select test.put('b4_p2', (select id from b));
with c as (insert into public.projects (client_id, name, budget_amount, budget_hours_fab)
           values (test.id('cli_laura'), 'Proyecto suelto', 900, 8) returning id)
select test.put('b4_suelto', (select id from c));

select public.set_project_work(test.id('b4_p1'), test.id('b4_obra'));
select public.set_project_work(test.id('b4_p2'), test.id('b4_obra'));

select test.ok('b4_obra', 'Los proyectos quedan dentro de la obra',
  (select count(*) from public.projects where work_id = test.id('b4_obra')) = 2);

select test.ok('b4_obra', 'Y siguen saliendo en el listado general de proyectos',
  exists (select 1 from public.projects where id = test.id('b4_p1'))
  and exists (select 1 from public.projects where id = test.id('b4_suelto')));

select test.ok('b4_obra', 'Un proyecto puede no tener obra: eso no cambia',
  (select work_id is null from public.projects where id = test.id('b4_suelto')));

select test.err('b4_obra', 'No se mete un proyecto en una obra que no existe',
  format($$select public.set_project_work(%L, '00000000-0000-4000-8000-000000000000')$$,
         test.id('b4_p1')), 'P0002');


\echo '== BLOQUE 4 · LAS CUENTAS'

select public.save_work_extra(null, test.id('b4_obra'), 'Transporte y grúa', 450, 'Dos portes');
select public.save_work_extra(null, test.id('b4_obra'), 'Trabajos adicionales', 300, null);

select test.ok('b4_cuentas', 'Los extras se guardan identificados',
  (select count(*) from public.work_extras where work_id = test.id('b4_obra')) = 2);

select test.err('b4_cuentas', 'Un extra sin concepto no se guarda',
  format($$select public.save_work_extra(null, %L, '  ', 100)$$, test.id('b4_obra')), '22023');

select test.err('b4_cuentas', 'Ni sin importe',
  format($$select public.save_work_extra(null, %L, 'Algo', null)$$, test.id('b4_obra')), '22023');

select test.ok('b4_cuentas', 'El total de proyectos es la suma de sus presupuestos',
  (select total_proyectos from public.work_summary where work_id = test.id('b4_obra')) = 5000);

select test.ok('b4_cuentas', 'Los extras suman 750',
  (select extras from public.work_summary where work_id = test.id('b4_obra')) = 750);

select test.ok('b4_cuentas', 'Y el total estimado es proyectos + extras',
  (select total_estimado from public.work_summary where work_id = test.id('b4_obra')) = 5750);

select test.ok('b4_cuentas', 'Sin facturar nada, el pendiente es todo',
  (select facturado = 0 and pendiente_facturar = 5750
     from public.work_summary where work_id = test.id('b4_obra')));


\echo '== BLOQUE 4 · FACTURACIÓN MANUAL'

select public.set_project_invoiced(test.id('b4_p1'), true, 3200);

select test.ok('b4_factura', 'Un proyecto se marca como facturado, con su importe',
  (select invoiced_amount = 3200 and invoiced_on is not null
     from public.projects where id = test.id('b4_p1')));

select test.ok('b4_factura', 'Y pasa del estado «Por facturar» al de cobro, sin inventar otro sistema',
  (select billing_status = 'pendiente_cobro' from public.projects where id = test.id('b4_p1')));

select test.ok('b4_factura', 'La obra ya sabe que hay 3.200 facturados',
  (select facturado from public.work_summary where work_id = test.id('b4_obra')) = 3200);

select test.ok('b4_factura', 'Y que quedan 2.550 por facturar',
  (select pendiente_facturar from public.work_summary where work_id = test.id('b4_obra')) = 2550);

-- Si no se dice importe, se factura lo presupuestado.
select public.set_project_invoiced(test.id('b4_p2'), true);
select test.ok('b4_factura', 'Si no se dice importe, se factura lo presupuestado',
  (select invoiced_amount from public.projects where id = test.id('b4_p2')) = 1800);

select test.ok('b4_factura', 'Ahora están facturados los dos proyectos: 5.000',
  (select facturado from public.work_summary where work_id = test.id('b4_obra')) = 5000);

select test.ok('b4_factura', 'Y lo que queda por facturar son los extras: 750',
  (select pendiente_facturar from public.work_summary where work_id = test.id('b4_obra')) = 750);

-- Y se puede desmarcar.
select public.set_project_invoiced(test.id('b4_p2'), false);
select test.ok('b4_factura', 'Se puede quitar la marca de facturado',
  (select invoiced_amount is null and invoiced_on is null
     from public.projects where id = test.id('b4_p2')));

select test.ok('b4_factura', 'Y las cuentas se recalculan solas',
  (select facturado = 3200 and pendiente_facturar = 2550
     from public.work_summary where work_id = test.id('b4_obra')));


\echo '== BLOQUE 4 · LO QUE LA OBRA TRAE DE SUS PROYECTOS'

select test.ok('b4_resumen', 'La obra cuenta sus proyectos y cuántos están en marcha',
  (select proyectos = 2 and proyectos_activos = 2
     from public.work_summary where work_id = test.id('b4_obra')));

-- Material pendiente de uno de sus proyectos.
insert into public.materials (project_id, name, units, supplier, expected_on)
values (test.id('b4_p1'), 'Perfil 40x40', 12, 'Aceros Vallès', public.today_madrid() + 3);

select test.ok('b4_resumen', 'Y sabe cuánto material tiene pendiente',
  (select material_pendiente from public.work_summary where work_id = test.id('b4_obra')) = 1);

-- Comentarios de la obra.
insert into public.comments (work_id, author_id, body)
values (test.id('b4_obra'), test.id('salvi'), 'El presidente pide empezar por la barandilla.');

select test.ok('b4_resumen', 'La obra tiene sus propios comentarios',
  exists (select 1 from public.comments where work_id = test.id('b4_obra')));


\echo '== BLOQUE 4 · LA OBRA EN EL CALENDARIO'

select public.plan_project(test.id('b4_p1'), 'fabricacion', date '2026-12-07');
select public.plan_project(test.id('b4_p2'), 'fabricacion', date '2026-12-07');

select test.ok('b4_calendario', 'La obra aparece en el calendario como un elemento más',
  exists (select 1 from public.v_calendar
           where kind = 'obra'
             and code = (select code from public.works where id = test.id('b4_obra'))));

select test.ok('b4_calendario', 'Va de la primera fecha de sus proyectos a la última',
  (select min(date) from public.v_calendar where kind = 'obra') = date '2026-12-07'
  and (select max(date) from public.v_calendar where kind = 'obra') >= date '2026-12-08');

select test.ok('b4_calendario', 'Dice cuántos proyectos lleva',
  exists (select 1 from public.v_calendar where kind = 'obra' and detail like '%proyecto(s)%'));

select test.ok('b4_calendario', 'La obra NO se arrastra: lo que se mueve son los proyectos',
  not exists (select 1 from public.v_calendar where kind = 'obra' and movable));

select test.ok('b4_calendario', 'Y los proyectos siguen saliendo por su cuenta',
  exists (select 1 from public.v_calendar
           where kind = 'fabricacion' and project_id = test.id('b4_p1')));


\echo '== BLOQUE 4 · EL DINERO DE LA OBRA ES DE ADMINISTRACIÓN'

set role authenticated; select test.as_user(test.id('juan'));

select test.ok('b4_permisos', 'Un trabajador NO ve ni una obra',
  (select count(*) from public.works) = 0);

select test.ok('b4_permisos', 'Ni los costes extras',
  (select count(*) from public.work_extras) = 0);

select test.ok('b4_permisos', 'Ni las cuentas de la obra',
  (select count(*) from public.work_summary) = 0);

select test.ok('b4_permisos', 'Ni la obra en el calendario',
  (select count(*) from public.v_calendar where kind = 'obra') = 0);

select test.ok('b4_permisos', 'Ni los comentarios de la obra',
  not exists (select 1 from public.comments where work_id is not null));

select test.err('b4_permisos', 'No puede crear obras',
  $$select public.save_work(null, 'La mía')$$, '42501');

select test.err('b4_permisos', 'Ni meter proyectos en una obra',
  format($$select public.set_project_work(%L, %L)$$, test.id('b4_p1'), test.id('b4_obra')), '42501');

select test.err('b4_permisos', 'Ni añadir extras',
  format($$select public.save_work_extra(null, %L, 'Algo', 100)$$, test.id('b4_obra')), '42501');

select test.err('b4_permisos', 'Ni marcar nada como facturado',
  format($$select public.set_project_invoiced(%L, true, 1)$$, test.id('b4_p1')), '42501');

-- Escribir en la tabla no da error: la política sencillamente no le deja
-- tocar ninguna fila. Lo que importa es que nada cambie.
update public.works set name = 'Cambiada';
reset role; select test.as_server();
select test.ok('b4_permisos', 'Ni cambiar la obra escribiendo en la tabla',
  (select name from public.works where id = test.id('b4_obra')) = 'Comunidad Calle Mayor 25');


\echo '== BLOQUE 4 · HISTORIAL'

reset role; select test.as_server();

select test.ok('b4_historial', 'Queda anotada la creación de la obra',
  exists (select 1 from public.audit_log where summary like '%creó la obra OBRA-%'));

select test.ok('b4_historial', 'Y que se metió cada proyecto',
  exists (select 1 from public.audit_log where summary like '%metió el proyecto%en la obra%'));

select test.ok('b4_historial', 'Y el extra, con su importe',
  exists (select 1 from public.audit_log where summary like '%añadió el extra «Transporte y grúa»%'));

select test.ok('b4_historial', 'Y la facturación, con el importe',
  exists (select 1 from public.audit_log where summary like '%facturó PROY-%por%'));

select test.ok('b4_historial', 'Y quitar la facturación también',
  exists (select 1 from public.audit_log where summary like '%quitó la facturación de%'));

select test.ok('b4_historial', 'Todo eso está en el historial DE LA OBRA, no suelto',
  (select count(*) from public.audit_log a
     join public.works w on w.code = a.entity_code
    where w.id = test.id('b4_obra')) >= 4);


\echo '== BLOQUE 4 · ARCHIVAR Y ELIMINAR'

set role authenticated; select test.as_user(test.id('salvi'));

select test.err('b4_borrar', 'Una obra con algo facturado NO se elimina',
  format($$select public.delete_work(%L)$$, test.id('b4_obra')), '23503');

-- Sin facturación, sí.
select public.set_project_invoiced(test.id('b4_p1'), false);
select test.ok('b4_borrar', 'Sin nada facturado, la obra se elimina',
  (public.delete_work(test.id('b4_obra')) ->> 'ok')::boolean);

reset role; select test.as_server();
select test.ok('b4_borrar', 'Y sus proyectos NO se borran: se quedan sueltos',
  exists (select 1 from public.projects where id = test.id('b4_p1'))
  and (select work_id is null from public.projects where id = test.id('b4_p1')));

select test.ok('b4_borrar', 'Pero sus extras sí se van con ella',
  not exists (select 1 from public.work_extras where work_id = test.id('b4_obra')));

select test.ok('b4_borrar', 'Y el historial cuenta qué pasó con los proyectos',
  exists (select 1 from public.audit_log where summary like '%eliminó la obra%quedan sueltos%'));


\echo '== BLOQUE 4 · LIMPIAR DATOS DEMO ALCANZA LAS TABLAS NUEVAS'

-- Desde el BLOQUE 1 se han añadido tablas con marca de ejemplo que la
-- limpieza no recorría. Se monta un ejemplo a mano en TODAS ellas y se
-- comprueba dos cosas: que la limpieza se lo lleva, y que no roza nada
-- que no esté marcado como ejemplo.
reset role; select test.as_server();

-- Datos de verdad, para comprobar que sobreviven.
select test.put('b4d_obra_real', (select id from public.save_work(
  null, 'Obra de verdad', null, null, null, null)));

-- Y el mismo juego, marcado como ejemplo.
with o as (insert into public.works (code, name, is_demo)
           values ('OBRA-9999-001', 'Obra de ejemplo', true) returning id)
select test.put('b4d_obra', (select id from o));

with x as (insert into public.work_extras (work_id, concept, amount, is_demo)
           values (test.id('b4d_obra'), 'Extra de ejemplo', 100, true) returning id)
select test.put('b4d_extra', (select id from x));

with p as (insert into public.projects (client_id, name, budget_amount, is_demo)
           values (test.id('cli_laura'), 'Proyecto de ejemplo', 500, true) returning id)
select test.put('b4d_proy', (select id from p));

insert into public.project_workers (project_id, worker_id, is_demo)
values (test.id('b4d_proy'), test.id('juan'), true);

with r as (insert into public.work_reports (code, worker_id, project_id, work_type,
                                            work_date, is_demo)
           values ('PT-9999-001', test.id('juan'), test.id('b4d_proy'), 'fabricacion',
                   '2099-12-22', true)
           returning id)
select test.put('b4d_parte', (select id from r));

insert into public.non_working_days (day, reason, is_demo)
values ('2099-12-24', 'Festivo de ejemplo', true);

insert into public.calendar_notes (day, title, is_demo)
values ('2099-12-23', 'Evento de ejemplo', true);

-- Un festivo y un evento de VERDAD, para la comprobación de al lado.
insert into public.non_working_days (day, reason, is_demo)
values ('2099-12-25', 'Navidad', false);
insert into public.calendar_notes (day, title, is_demo)
values ('2099-12-26', 'Revisión de la plegadora', false);

set role authenticated; select test.as_user(test.id('salvi'));
select test.setnote('b4d_limpieza', public.clear_demo()::text);
reset role; select test.as_server();

select test.ok('b4_demo', 'La limpieza se lleva la obra de ejemplo y sus extras',
  not exists (select 1 from public.works where is_demo)
  and not exists (select 1 from public.work_extras where is_demo));

select test.ok('b4_demo', 'Y los partes y las asignaciones de ejemplo',
  not exists (select 1 from public.work_reports where is_demo)
  and not exists (select 1 from public.project_workers where is_demo));

select test.ok('b4_demo', 'Y los festivos y los eventos de ejemplo del calendario',
  not exists (select 1 from public.non_working_days where is_demo)
  and not exists (select 1 from public.calendar_notes where is_demo));

select test.ok('b4_demo', 'Lo dice en el recuento, tabla por tabla',
  (test.note('b4d_limpieza')::jsonb -> 'borradas' ->> 'works') = '1'
  and (test.note('b4d_limpieza')::jsonb -> 'borradas' ->> 'work_extras') = '1'
  and (test.note('b4d_limpieza')::jsonb -> 'borradas' ->> 'work_reports') = '1'
  and (test.note('b4d_limpieza')::jsonb -> 'borradas' ->> 'non_working_days') = '1'
  and (test.note('b4d_limpieza')::jsonb -> 'borradas' ->> 'calendar_notes') = '1');

select test.ok('b4_demo', 'Y NO toca la obra de verdad',
  exists (select 1 from public.works where id = test.id('b4d_obra_real')));

select test.ok('b4_demo', 'Ni el festivo ni el evento de verdad',
  exists (select 1 from public.non_working_days where day = '2099-12-25')
  and exists (select 1 from public.calendar_notes where day = '2099-12-26'));
