-- =====================================================================
-- METALPLAFER360 · FASE 3 · CLIENTES, COSTES EXTRA Y DOCUMENTACIÓN
--
-- Lo que importa aquí son LAS CUENTAS. Un importe mal sumado no se nota
-- al mirarlo: se nota cuando se reclama a un cliente algo que no se le
-- ha facturado. Así que se monta un escenario con números elegidos a
-- mano y se comprueba cada una de las cinco cifras.
--
-- Y además:
--   · que un coste extra no cuente como facturado hasta que se marque;
--   · que lo archivado no entre en ninguna cifra;
--   · que un trabajador no reciba NI UNA FILA de nada de esto;
--   · que la documentación de la obra vea la de sus proyectos sin
--     duplicar ningún archivo.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== FASE 3 · EL ESCENARIO'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

-- Un cliente nuevo, para que las cifras no se mezclen con las de otras
-- pruebas que hayan pasado antes por aquí.
with c as (insert into public.clients (kind, name, city)
           values ('empresa', 'Cuentas Claras SL', 'Sabadell') returning id)
select test.put('f3_cli', (select id from c));

-- Dos proyectos: 1.000 € facturados del todo, y 2.000 € sin facturar.
with a as (insert into public.projects (client_id, name, budget_amount, budget_hours_fab)
           values (test.id('f3_cli'), 'Barandilla del patio', 1000, 8) returning id)
select test.put('f3_p1', (select id from a));
with b as (insert into public.projects (client_id, name, budget_amount, budget_hours_fab)
           values (test.id('f3_cli'), 'Cerramiento del almacén', 2000, 16) returning id)
select test.put('f3_p2', (select id from b));

select public.set_project_invoiced(test.id('f3_p1'), true, 1000, current_date);

-- Cobros: 600 € que valen y 100 € que se anulan. Los anulados NO cuentan.
select public.register_payment(test.id('f3_p1'), 600, current_date, 'Transferencia');
select test.put('f3_cobro_malo',
  (select id from public.register_payment(test.id('f3_p1'), 100, current_date, 'Se equivocó')));
select public.delete_payment(test.id('f3_cobro_malo'));

-- Una obra del mismo cliente, con dos costes extra: 300 € y 200 €.
select test.put('f3_obra', (select id from public.save_work(
  null, 'Obra de Cuentas Claras', test.id('f3_cli'), 'Calle del Sol 1', null, null)));

select test.put('f3_ex1', (select id from public.save_work_extra(
  null, test.id('f3_obra'), 'Transporte y grúa', 300, 'Dos portes')));
select test.put('f3_ex2', (select id from public.save_work_extra(
  null, test.id('f3_obra'), 'Trabajos añadidos', 200, null)));


\echo '== FASE 3.4 · UN COSTE EXTRA NACE SIN FACTURAR'

select test.ok('f3_extra', 'Guardar un coste extra NO lo factura',
  (select not invoiced and invoiced_on is null
     from public.work_extras where id = test.id('f3_ex1')));

select test.ok('f3_extra', 'Y la obra lo cuenta en el estimado, no en el facturado',
  (select extras = 500 and extras_facturados = 0 and extras_pendientes = 500
     from public.work_summary where work_id = test.id('f3_obra')),
  (select format('extras=%s facturados=%s', extras, extras_facturados)
     from public.work_summary where work_id = test.id('f3_obra')));

-- Se marca uno de los dos.
select public.set_work_extra_invoiced(test.id('f3_ex1'), true);

select test.ok('f3_extra', 'Al marcarlo queda facturado y con fecha de hoy',
  (select invoiced and invoiced_on = public.today_madrid()
     from public.work_extras where id = test.id('f3_ex1')));

select test.ok('f3_extra', 'Y la obra suma SOLO el marcado al facturado',
  (select extras_facturados = 300 and extras_pendientes = 200
     from public.work_summary where work_id = test.id('f3_obra')),
  (select format('facturados=%s pendientes=%s', extras_facturados, extras_pendientes)
     from public.work_summary where work_id = test.id('f3_obra')));

select test.ok('f3_extra', 'El pendiente de facturar de la obra baja en esos 300',
  -- 2.000 (el proyecto de la obra no existe: 0) + 500 de extras − 300 = 200
  (select pendiente_facturar = 200
     from public.work_summary where work_id = test.id('f3_obra')),
  (select pendiente_facturar::text
     from public.work_summary where work_id = test.id('f3_obra')));

-- Desmarcarlo quita la fecha: un coste sin facturar no tiene factura.
select public.set_work_extra_invoiced(test.id('f3_ex1'), false);
select test.ok('f3_extra', 'Al desmarcarlo se va también la fecha de factura',
  (select not invoiced and invoiced_on is null
     from public.work_extras where id = test.id('f3_ex1')));

-- Y se vuelve a marcar, que es el estado con el que siguen las cuentas.
select public.set_work_extra_invoiced(test.id('f3_ex1'), true, current_date);

select test.err('f3_extra', 'Un coste extra que no existe no se marca',
  $$select public.set_work_extra_invoiced('00000000-0000-4000-8000-000000000000', true)$$,
  'P0002');

select test.ok('f3_extra', 'Y queda en el historial de la obra',
  exists (select 1 from public.audit_log
           where action = 'facturar_extra' and entity_code =
                 (select code from public.works where id = test.id('f3_obra'))));


\echo '== FASE 3.2 · LAS CINCO CIFRAS DEL CLIENTE'

-- presupuestado  = 1000 + 2000 + 300 + 200 = 3500
-- facturado      = 1000 (proyecto) + 300 (extra marcado) = 1300
-- cobrado        = 600 (el de 100 está anulado)
-- por facturar   = 3500 − 1300 = 2200
-- por cobrar     = 1300 − 600  = 700
select test.ok('f3_cliente', 'Presupuestado = proyectos + costes extra',
  (select presupuestado = 3500 from public.client_overview where id = test.id('f3_cli')),
  (select presupuestado::text from public.client_overview where id = test.id('f3_cli')));

select test.ok('f3_cliente', 'Facturado = lo facturado de verdad, proyectos y extras marcados',
  (select facturado = 1300 from public.client_overview where id = test.id('f3_cli')),
  (select facturado::text from public.client_overview where id = test.id('f3_cli')));

select test.ok('f3_cliente', 'Cobrado NO cuenta los cobros anulados',
  (select cobrado = 600 from public.client_overview where id = test.id('f3_cli')),
  (select cobrado::text from public.client_overview where id = test.id('f3_cli')));

select test.ok('f3_cliente', 'Pendiente de facturar = presupuestado − facturado',
  (select pendiente_facturar = 2200 from public.client_overview where id = test.id('f3_cli')),
  (select pendiente_facturar::text from public.client_overview where id = test.id('f3_cli')));

select test.ok('f3_cliente', 'Pendiente de cobrar = facturado − cobrado',
  (select pendiente_cobrar = 700 from public.client_overview where id = test.id('f3_cli')),
  (select pendiente_cobrar::text from public.client_overview where id = test.id('f3_cli')));

-- NO se suman los presupuestos sin convertir: si se sumaran, este
-- presupuesto de 9.000 € dispararía el total.
insert into public.fichas (type, status, client_id, title, amount)
values ('presupuesto', 'enviado', test.id('f3_cli'), 'Presupuesto aparte', 9000);

select test.ok('f3_cliente', 'Un presupuesto sin convertir NO entra en el presupuestado',
  (select presupuestado = 3500 from public.client_overview where id = test.id('f3_cli')),
  (select presupuestado::text from public.client_overview where id = test.id('f3_cli')));

select test.ok('f3_cliente', 'Pero sí sale en el recuento de actividad',
  (select budgets = 1 from public.client_overview where id = test.id('f3_cli')));

-- Lo ARCHIVADO deja de contar. Es la decisión que se tomó y conviene
-- que esté escrita en una prueba, porque no es obvia.
update public.projects set archived_at = now() where id = test.id('f3_p2');

select test.ok('f3_cliente', 'Al archivar un proyecto, su presupuesto deja de contar',
  (select presupuestado = 1500 from public.client_overview where id = test.id('f3_cli')),
  (select presupuestado::text from public.client_overview where id = test.id('f3_cli')));

select test.ok('f3_cliente', 'Y el pendiente de facturar se recalcula solo',
  (select pendiente_facturar = 200 from public.client_overview where id = test.id('f3_cli')),
  (select pendiente_facturar::text from public.client_overview where id = test.id('f3_cli')));

update public.projects set archived_at = null where id = test.id('f3_p2');


\echo '== FASE 3.5 · LA DOCUMENTACIÓN DE LA OBRA'

select public.set_project_work(test.id('f3_p1'), test.id('f3_obra'));

-- Un archivo de la obra y otro de su proyecto.
insert into public.documents (work_id, storage_path, file_name, mime_type, size_bytes,
                              category, scope, uploaded_by)
values (test.id('f3_obra'), 'works/' || test.id('f3_obra') || '/contrato.pdf',
        'contrato.pdf', 'application/pdf', 1000, 'documento', 'administrativa', test.id('salvi'));
insert into public.documents (project_id, storage_path, file_name, mime_type, size_bytes,
                              category, scope, uploaded_by)
values (test.id('f3_p1'), 'projects/' || test.id('f3_p1') || '/plano.pdf',
        'plano.pdf', 'application/pdf', 1000, 'documento', 'tecnica', test.id('salvi'));

select test.ok('f3_docs', 'La obra ve su archivo y el de su proyecto',
  (select count(*) from public.work_documents where work_id = test.id('f3_obra')) = 2,
  (select count(*)::text from public.work_documents where work_id = test.id('f3_obra')));

select test.ok('f3_docs', 'Y dice de qué proyecto viene cada uno',
  (select origen_code is null from public.work_documents
    where work_id = test.id('f3_obra') and file_name = 'contrato.pdf')
  and (select origen_code = (select code from public.projects where id = test.id('f3_p1'))
         from public.work_documents
        where work_id = test.id('f3_obra') and file_name = 'plano.pdf'));

select test.ok('f3_docs', 'Sin duplicar el archivo: sigue habiendo una sola fila',
  (select count(*) from public.documents where file_name = 'plano.pdf'
     and project_id = test.id('f3_p1')) = 1);

select test.ok('f3_docs', 'Un archivo de la obra tiene UN solo dueño',
  (select num_nonnulls(ficha_id, project_id, order_id, report_id, work_id) = 1
     from public.documents where file_name = 'contrato.pdf'));


\echo '== FASE 3 · UN TRABAJADOR NO VE NADA DE ESTO'

reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.ok('f3_permisos', 'El trabajador no recibe ni una fila de las cuentas de clientes',
  (select count(*) from public.client_overview) = 0);

select test.ok('f3_permisos', 'Ni de la documentación de las obras',
  (select count(*) from public.work_documents) = 0);

select test.ok('f3_permisos', 'Ni de las cuentas de las obras',
  (select count(*) from public.work_summary) = 0);

select test.err('f3_permisos', 'Y no puede marcar un coste extra como facturado',
  format($$select public.set_work_extra_invoiced(%L, true)$$, test.id('f3_ex2')), '42501');

reset role; select test.as_server();

select test.ok('f3_permisos', 'Comprobado desde el servidor: el extra sigue sin facturar',
  (select not invoiced from public.work_extras where id = test.id('f3_ex2')));
