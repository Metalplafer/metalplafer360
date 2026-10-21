-- =====================================================================
-- METALPLAFER360 · PRUEBAS DEL BLOQUE 5
-- El día a día del trabajador, y el aviso de taller que se factura.
--
-- Lo que importa aquí:
--   · que un trabajo de mostrador se registre con el sistema de AVISOS
--     que ya existía, y que recoja lo que hace falta para facturarlo;
--   · que el IMPORTE de una ficha no le llegue al trabajador, ni aunque
--     pida la tabla a mano;
--   · que cualquiera pueda pedir material sin orden y sin parte, por el
--     mismo circuito de revisión que ya había;
--   · que el trabajador pueda hacer su trabajo solo: proyectos con
--     fechas, partes, partes sin proyecto y material.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== BLOQUE 5 · EL AVISO DE TALLER SE PUEDE FACTURAR'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

-- Una persona entra al taller a que le corten una pieza. Se registra
-- con el sistema de avisos de siempre: mismo tipo, mismo código.
with a as (
  -- Sin «code»: el código lo pone el disparador de siempre.
  insert into public.fichas (type, client_id, title, description, address,
                             phone, email, hours, amount, scheduled_date)
  values ('aviso', test.id('cli_laura'),
          'Cortar y plegar una pieza',
          'Viene con una pletina de 2 m. Cortar a 1,20 y plegar a 90°.',
          'En el taller', '644555666', 'laura.puig@ejemplo.es',
          0.75, 35, public.today_madrid())
  returning id)
select test.put('b5_aviso', (select id from a));

select test.ok('b5_aviso', 'El trabajo de mostrador es un AVISO, no una tabla nueva',
  (select type = 'aviso' and code like 'AVI-%'
     from public.fichas where id = test.id('b5_aviso')));

-- Nace en «Pendiente», no en «Por asignar» (archivo 43): un aviso ya no
-- tiene responsable administrativo a quien asignárselo, y lo que importa
-- es qué operarios van a hacerlo.
select test.ok('b5_aviso', 'Empieza en «Pendiente», que es donde empieza su trabajo',
  (select status = 'pendiente' from public.fichas where id = test.id('b5_aviso')));

select test.ok('b5_aviso', 'Recoge cliente, trabajo, teléfono y correo',
  (select client_id = test.id('cli_laura')
      and title like 'Cortar y plegar%'
      and phone = '644555666'
      and email = 'laura.puig@ejemplo.es'
     from public.fichas where id = test.id('b5_aviso')));

select test.ok('b5_aviso', 'Y las horas y el importe, que es lo que hacía falta para facturar',
  (select hours = 0.75 and amount = 35
     from public.fichas where id = test.id('b5_aviso')));

select test.ok('b5_aviso', 'Las horas de un aviso no pueden ser cero ni negativas',
  (select count(*) = 0 from public.fichas where id = test.id('b5_aviso') and hours <= 0));

select test.err('b5_aviso', 'Unas horas imposibles se rechazan',
  format($$update public.fichas set hours = -3 where id = %L$$, test.id('b5_aviso')), '23514');

-- Sigue recorriendo sus estados de siempre. Lo que cambia (archivo 43)
-- es que lo que lo pone «Asignado» es repartirlo entre operarios, no
-- elegir un responsable administrativo que ya no existe.
select public.assign_ficha_workers(test.id('b5_aviso'), array[test.id('juan')]::uuid[]);
select test.ok('b5_aviso', 'Al repartirlo entre operarios pasa a «Asignado»',
  (select status = 'asignado' from public.fichas where id = test.id('b5_aviso')));

update public.fichas set status = 'realizado' where id = test.id('b5_aviso');
update public.fichas set status = 'cerrado'  where id = test.id('b5_aviso');
select test.ok('b5_aviso', 'Y se cierra por el mismo camino',
  (select status = 'cerrado' from public.fichas where id = test.id('b5_aviso')));

select test.ok('b5_aviso', 'Un aviso sigue sin poder convertirse en proyecto',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname like '%aviso%project%'));

-- Y administración tiene a mano lo que necesita para facturarlo.
select test.ok('b5_aviso', 'Administración lo tiene todo junto para facturar',
  (select hours is not null and amount is not null
      and (phone is not null or email is not null) and client_id is not null
     from public.fichas where id = test.id('b5_aviso')));


\echo '== BLOQUE 5 · EL IMPORTE DE LA FICHA NO LE LLEGA AL TRABAJADOR'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('juan'));

select test.ok('b5_dinero', 'El trabajador no lee NI UNA FILA de «fichas»',
  not exists (select 1 from public.fichas));

select test.ok('b5_dinero', 'Ni la del aviso que tiene asignado',
  not exists (select 1 from public.fichas where id = test.id('b5_aviso')));

select test.ok('b5_dinero', 'Pero sí la ve por «worker_fichas», que es su puerta',
  exists (select 1 from public.worker_fichas where id = test.id('b5_aviso')));

select test.ok('b5_dinero', 'Con el trabajo, el teléfono, el correo y las horas',
  (select title is not null and phone = '644555666'
      and email = 'laura.puig@ejemplo.es' and hours = 0.75
     from public.worker_fichas where id = test.id('b5_aviso')));

select test.ok('b5_dinero', 'Y «worker_fichas» no tiene columna de importe',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'worker_fichas'
                 and column_name = 'amount'));

select test.err('b5_dinero', 'Si pide el importe a mano, la consulta no existe siquiera',
  $$select amount from public.worker_fichas limit 1$$, '42703');

-- Dos, no tres: el aviso de la fase 2 y el de mostrador. La visita que
-- antes contaba aquí es ahora de administración (archivo 38).
select test.ok('b5_dinero', 'Tampoco ve fichas de otros',
  (select count(*) = 2 from public.worker_fichas));

-- El calendario NO se rompió al cerrar la tabla: sigue viendo lo suyo.
select test.ok('b5_dinero', 'Su aviso sigue saliendo en su calendario',
  exists (select 1 from public.v_calendar
           where kind = 'aviso' and id = test.id('b5_aviso')));

select test.ok('b5_dinero', 'Y el calendario tampoco trae ningún importe',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'v_calendar'
                 and column_name in ('amount', 'budget_amount', 'advance_amount',
                                     'invoiced_amount')));

-- El repaso completo de lo económico que pide el encargo.
select test.ok('b5_dinero', 'Ni importe de proyecto ni paga y señal: «projects» es de administración',
  not exists (select 1 from public.projects));

select test.ok('b5_dinero', 'Ni facturación: no llega ni una fila de cobros',
  not exists (select 1 from public.payments));

select test.ok('b5_dinero', 'Ni las cuentas de un proyecto',
  not exists (select 1 from public.project_billing));

select test.ok('b5_dinero', 'Ni nada de las obras',
  not exists (select 1 from public.works)
  and not exists (select 1 from public.work_extras)
  and not exists (select 1 from public.work_summary));

select test.ok('b5_dinero', 'Y «worker_projects» tampoco tiene ninguna columna de dinero',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'worker_projects'
                 and column_name in ('budget_amount', 'advance_amount',
                                     'invoiced_amount', 'billing_status')));


\echo '== BLOQUE 5 · SUS PROYECTOS, ORDENADOS POR LO QUE TOCA ANTES'

reset role; select test.as_server();

-- Dos proyectos suyos con fechas distintas, y uno ajeno.
with a as (insert into public.projects (client_id, name, budget_amount, budget_hours_fab,
                                        fab_start, fab_end)
           values (test.id('cli_laura'), 'Barandilla del tercero', 4000, 16,
                   date '2026-11-16', date '2026-11-16') returning id)
select test.put('b5_tarde', (select id from a));

with b as (insert into public.projects (client_id, name, budget_amount, budget_hours_fab,
                                        fab_start, fab_end, mont_start, mont_end)
           values (test.id('cli_laura'), 'Puerta del garaje', 2500, 16,
                   date '2026-11-02', date '2026-11-02',
                   date '2026-11-05', date '2026-11-05') returning id)
select test.put('b5_pronto', (select id from b));

with c as (insert into public.projects (client_id, name, budget_amount, budget_hours_fab)
           values (test.id('cli_laura'), 'Proyecto de otro', 999, 8) returning id)
select test.put('b5_ajeno', (select id from c));

insert into public.project_workers (project_id, worker_id)
values (test.id('b5_tarde'), test.id('juan')),
       (test.id('b5_pronto'), test.id('juan'));

set role authenticated; select test.as_user(test.id('juan'));

select test.ok('b5_proyectos', 'Ve los proyectos a los que está asignado',
  (select count(*) = 2 from public.worker_projects
    where id in (test.id('b5_tarde'), test.id('b5_pronto'))));

select test.ok('b5_proyectos', 'Y no el que no es suyo',
  not exists (select 1 from public.worker_projects where id = test.id('b5_ajeno')));

select test.ok('b5_proyectos', 'Le llegan las fechas de fabricación y de montaje',
  (select fab_start = date '2026-11-02' and mont_start = date '2026-11-05'
     from public.worker_projects where id = test.id('b5_pronto')));

select test.ok('b5_proyectos', '«proximo» es la primera fecha que le afecta',
  (select proximo = date '2026-11-02'
     from public.worker_projects where id = test.id('b5_pronto'))
  and (select proximo = date '2026-11-16'
         from public.worker_projects where id = test.id('b5_tarde')));

select test.ok('b5_proyectos', 'Así se pueden ordenar por lo que toca antes',
  (select array_agg(id order by proximo) = array[test.id('b5_pronto'), test.id('b5_tarde')]
     from public.worker_projects
    where id in (test.id('b5_tarde'), test.id('b5_pronto'))));

select test.ok('b5_proyectos', 'Y ve en el calendario los días de sus dos proyectos',
  (select count(distinct id) = 2 from public.v_calendar
    where kind in ('fabricacion', 'montaje')
      and id in (test.id('b5_tarde'), test.id('b5_pronto'))));

select test.ok('b5_proyectos', 'Pero NO puede tocar la planificación',
  (select count(*) = 0 from public.projects where id = test.id('b5_pronto')));

select test.err('b5_proyectos', 'Mover una fase a mano se le rechaza',
  format($$select public.move_project_phase(%L, 'fabricacion', date '2026-11-09')$$,
         test.id('b5_pronto')), '42501');

select test.err('b5_proyectos', 'Y replanificar, también',
  format($$select public.plan_project(%L)$$, test.id('b5_pronto')), '42501');

select test.err('b5_proyectos', 'Ni puede marcar un día como no laborable',
  $$select public.set_non_working_day(date '2026-11-03', 'me lo tomo libre')$$, '42501');


\echo '== BLOQUE 5 · PARTE SIN PROYECTO'

select test.put('b5_parte_suelto', (select id from public.save_work_report(
  null, null, 'fabricacion', public.today_madrid(),
  'Corte y plegado de una pletina para una persona que vino al taller.',
  0.75, false, true)));

select test.ok('b5_parte', 'El trabajador crea un parte SIN proyecto',
  (select project_id is null and status = 'enviado'
     from public.work_reports where id = test.id('b5_parte_suelto')));

select test.ok('b5_parte', 'Con el mismo formulario: tipo, fecha, trabajo y horas',
  (select work_type = 'fabricacion' and hours = 0.75
      and work_done like 'Corte y plegado%' and work_date = public.today_madrid()
     from public.work_reports where id = test.id('b5_parte_suelto')));

select test.ok('b5_parte', 'Y se numera como todos los demás',
  (select code like 'PT-%' from public.work_reports where id = test.id('b5_parte_suelto')));

-- Un parte CON proyecto, para comprobar que ambos caminos siguen vivos.
select test.put('b5_parte_proy', (select id from public.save_work_report(
  null, test.id('b5_pronto'), 'fabricacion', public.today_madrid(),
  'Montaje del bastidor.', 4, false, true)));

select test.ok('b5_parte', 'Y el parte con proyecto sigue funcionando igual',
  (select project_id = test.id('b5_pronto')
     from public.work_reports where id = test.id('b5_parte_proy')));

select test.err('b5_parte', 'No puede hacer un parte de un proyecto que no es suyo',
  format($$select public.save_work_report(null, %L, 'fabricacion',
            public.today_madrid(), 'trampa', 2, false, true)$$,
         test.id('b5_ajeno')), '42501');

-- Administración lo asigna después, que es la otra mitad del encargo.
reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

select public.assign_report_to_project(test.id('b5_parte_suelto'), test.id('b5_pronto'));
select test.ok('b5_parte', 'Administración puede asignarlo después a un proyecto',
  (select project_id = test.id('b5_pronto')
     from public.work_reports where id = test.id('b5_parte_suelto')));

select test.ok('b5_parte', 'Y queda en el historial',
  exists (select 1 from public.audit_log
           where summary like '%asignó el parte%' or summary like '%parte%proyecto%'));


\echo '== BLOQUE 5 · SOLICITAR MATERIAL SIN ORDEN Y SIN PARTE'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('juan'));

-- Sin proyecto: material de taller, o todavía no se sabe de qué es.
select test.put('b5_sol_suelta',
  (select id from public.submit_material_need(null, 'Se han acabado los discos de corte de 125.')));

select test.ok('b5_material', 'Cualquiera puede pedir material sin orden y sin parte',
  (select project_id is null and order_id is null and status = 'pendiente'
     from public.material_requests where id = test.id('b5_sol_suelta')));

select test.ok('b5_material', 'Queda a nombre de quien la abre',
  (select worker_id = test.id('juan')
     from public.material_requests where id = test.id('b5_sol_suelta')));

select test.ok('b5_material', 'Y entra en la MISMA lista de siempre, no en otra tabla',
  (select count(*) = 1 from public.material_requests
    where id = test.id('b5_sol_suelta') and status = 'pendiente'));

-- Con proyecto, cuando se sabe.
select test.put('b5_sol_proy',
  (select id from public.submit_material_need(test.id('b5_pronto'), 'Faltan 3 bisagras.')));

select test.ok('b5_material', 'Se puede asociar al proyecto cuando corresponde',
  (select project_id = test.id('b5_pronto')
     from public.material_requests where id = test.id('b5_sol_proy')));

select test.err('b5_material', 'Pero no a un proyecto que no es suyo',
  format($$select public.submit_material_need(%L, 'trampa')$$, test.id('b5_ajeno')), '42501');

select test.err('b5_material', 'Y hay que escribir qué falta',
  $$select public.submit_material_need(null, '   ')$$, '22023');

select test.ok('b5_material', 'Ve las suyas',
  (select count(*) >= 2 from public.material_requests where worker_id = test.id('juan')));

-- Administración también puede abrir una: es «cualquier usuario».
reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

select test.put('b5_sol_admin',
  (select id from public.submit_material_need(test.id('b5_pronto'), 'Pedir perfil de 40x40.')));

select test.ok('b5_material', 'Administración también puede registrar un pedido de material',
  (select worker_id = test.id('salvi') and status = 'pendiente'
     from public.material_requests where id = test.id('b5_sol_admin')));

-- Y la revisión es la que ya existía: aceptar o descartar.
select test.put('b5_mat_nuevo', (select id from public.accept_material_request(
  test.id('b5_sol_proy'), 'Bisagras 80 mm', 3, 'Suministros Vallès',
  null, date '2026-11-04', null)));

select test.ok('b5_material', 'Aceptar una petición crea el material pendiente de siempre',
  (select name = 'Bisagras 80 mm' and units = 3 and project_id = test.id('b5_pronto')
      and not received
     from public.materials where id = test.id('b5_mat_nuevo')));

select test.ok('b5_material', 'Y la petición queda marcada como aceptada, con su material',
  (select status = 'aceptada' and material_id = test.id('b5_mat_nuevo')
      and reviewed_by = test.id('salvi')
     from public.material_requests where id = test.id('b5_sol_proy')));

-- Una petición SIN proyecto se puede aceptar de DOS maneras: diciendo a
-- qué proyecto va, o dejándola sin proyecto porque es material de
-- taller (consumibles que no son de ningún trabajo).
--
-- ESTA COMPROBACIÓN CAMBIÓ con el bloque de mejoras. Antes exigía un
-- proyecto a la fuerza y aceptarla sin él daba error 22023; eso es justo
-- lo que impedía anotar los consumibles del taller. Lo que no puede
-- pasar —que se quede sin proyecto por despiste— ya no lo guarda este
-- error, sino el formulario, que obliga a elegir una de las dos cosas y
-- no trae ninguna puesta: se comprueba en el navegador, en
-- tests/e2e/mejoras2.mjs.
select test.put('b5_sol_taller',
  (public.submit_material_need(null, 'Guantes de soldador')).id);

select test.put('b5_mat_consumible', (select id from public.accept_material_request(
  test.id('b5_sol_taller'), 'Guantes de soldador', 6)));

select test.ok('b5_material', 'Una petición sin proyecto se acepta como material de taller',
  (select project_id is null and name = 'Guantes de soldador' and units = 6
     from public.materials where id = test.id('b5_mat_consumible')));

select test.put('b5_mat_taller', (select id from public.accept_material_request(
  test.id('b5_sol_suelta'), 'Discos de corte 125', 10, null, null, null, null,
  test.id('b5_tarde'))));

select test.ok('b5_material', 'Diciendo el proyecto al aceptarla, sí',
  (select project_id = test.id('b5_tarde') and name = 'Discos de corte 125'
     from public.materials where id = test.id('b5_mat_taller')));

select test.ok('b5_material', 'Y la petición se queda con ese proyecto apuntado',
  (select project_id = test.id('b5_tarde') and status = 'aceptada'
     from public.material_requests where id = test.id('b5_sol_suelta')));

select public.discard_material_request(test.id('b5_sol_admin'), 'Ya estaba pedido.');
select test.ok('b5_material', 'Descartar sigue funcionando igual',
  (select status = 'descartada' and review_note = 'Ya estaba pedido.'
     from public.material_requests where id = test.id('b5_sol_admin')));

-- También cambió: antes el material era SIEMPRE de un proyecto. Ahora
-- hay una excepción, y solo una: el material de taller, y únicamente
-- cuando alguien lo pide así a propósito.
select test.ok('b5_material', 'Lo único que va sin proyecto es el material de taller',
  not exists (select 1 from public.materials
               where project_id is null and id <> test.id('b5_mat_consumible')),
  (select string_agg(name, ' | ') from public.materials
    where project_id is null and id <> test.id('b5_mat_consumible')));

-- Y el trabajador no puede escribir material por su cuenta ni revisar.
reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('juan'));

select test.err('b5_material', 'El trabajador no crea material pendiente directamente',
  format($$insert into public.materials (project_id, name)
           values (%L, 'me lo apunto yo')$$, test.id('b5_pronto')), '42501');

select test.err('b5_material', 'Ni acepta su propia petición',
  format($$select public.accept_material_request(%L, 'lo que yo diga')$$,
         test.id('b5_sol_admin')), '42501');

select test.ok('b5_material', 'Ni ve las peticiones de los demás',
  not exists (select 1 from public.material_requests where worker_id <> test.id('juan')));


\echo '== BLOQUE 5 · PUEDE HACER SU TRABAJO SIN DEPENDER DE ADMINISTRACIÓN'

-- El resumen del encargo, comprobado de una vez.
select test.ok('b5_autonomia', 'Consultar sus proyectos',
  (select count(*) >= 2 from public.worker_projects));

select test.ok('b5_autonomia', 'Consultar su documentación técnica',
  (select count(*) >= 0 from public.documents));

select test.ok('b5_autonomia', 'Consultar su calendario',
  (select count(*) > 0 from public.v_calendar));

select test.ok('b5_autonomia', 'Hacer partes, con proyecto y sin proyecto',
  (select count(*) >= 2 from public.work_reports where worker_id = test.id('juan')));

select test.ok('b5_autonomia', 'Pedir material',
  (select count(*) >= 2 from public.material_requests where worker_id = test.id('juan')));

select test.ok('b5_autonomia', 'Consultar sus partes anteriores',
  exists (select 1 from public.work_reports
           where worker_id = test.id('juan') and status <> 'borrador'));

-- Corregir un parte rechazado.
reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));
select public.reject_work_report(test.id('b5_parte_proy'), 'Faltan las horas del ayudante.');

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('juan'));

select test.ok('b5_autonomia', 'Ve por qué le han devuelto un parte',
  (select status = 'rechazado' and reject_reason like 'Faltan las horas%'
     from public.work_reports where id = test.id('b5_parte_proy')));

select public.save_work_report(test.id('b5_parte_proy'), test.id('b5_pronto'),
  'fabricacion', public.today_madrid(), 'Montaje del bastidor, con ayudante.', 8, false, true);

select test.ok('b5_autonomia', 'Y lo corrige y lo vuelve a enviar él solo',
  (select status = 'enviado' and hours = 8
     from public.work_reports where id = test.id('b5_parte_proy')));

reset role; select test.as_server();
