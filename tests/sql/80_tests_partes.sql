-- =====================================================================
-- METALPLAFER360 · PRUEBAS DEL BLOQUE 1
-- Proyectos, trabajadores asignados y partes de trabajo.
--
-- Lo que se comprueba aquí es lo que de verdad importa:
--   · que el trabajador entre SOLO en sus proyectos;
--   · que NO pueda sacar el dinero ni pidiéndolo a mano;
--   · que las horas no cuenten hasta que administración valida;
--   · que un parte ajeno no se pueda tocar.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== BLOQUE 1 · PREPARAR EL TERRENO'

-- Un proyecto limpio para estas pruebas, con horas previstas conocidas.
reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

with nuevo as (
  insert into public.projects
    (client_id, name, description, budget_amount, advance_amount,
     budget_hours_fab, budget_hours_mont)
  values (test.id('cli_laura'), 'Barandilla escalera principal',
          'Barandilla de acero con pasamanos de madera.', 7400, 2000, 32, 16)
  returning id)
select test.put('proy_b1', (select id from nuevo));

-- Un proyecto que NO será suyo, para comprobar que no puede imputarle horas.
select test.put('proy_ajeno',
  (select id from public.projects where id <> test.id('proy_b1') limit 1));

select test.ok('b1_base', 'Se crea el proyecto de pruebas con 32 h de fabricación previstas',
  (select budget_hours_fab from public.projects where id = test.id('proy_b1')) = 32);


\echo '== BLOQUE 1 · ASIGNAR TRABAJADORES AL PROYECTO'

-- Antes de asignar a nadie, el trabajador no ve nada de este proyecto.
set role authenticated; select test.as_user(test.id('pedro'));

select test.ok('b1_acceso', 'Sin asignar, el trabajador no ve el proyecto',
  not exists (select 1 from public.worker_projects where id = test.id('proy_b1')));

set role authenticated; select test.as_user(test.id('salvi'));
select public.assign_project_workers(test.id('proy_b1'),
                                     array[test.id('juan'), test.id('pedro')]);

set role authenticated; select test.as_user(test.id('pedro'));
select test.ok('b1_acceso', 'Una vez asignado, el trabajador sí lo ve',
  exists (select 1 from public.worker_projects where id = test.id('proy_b1')));

select test.ok('b1_acceso', 'Y ve con quién comparte el trabajo',
  (select count(*) from public.project_team where project_id = test.id('proy_b1')) = 2);

-- Un trabajador no se asigna a sí mismo a ningún sitio.
select test.err('b1_acceso', 'Un trabajador no puede asignarse a un proyecto',
  format($$select public.assign_project_workers(%L, array[%L]::uuid[])$$,
         test.id('proy_b1'), test.id('pedro')), '42501');

set role authenticated; select test.as_user(test.id('salvi'));
select public.assign_project_workers(test.id('proy_b1'), array[test.id('juan')]);

set role authenticated; select test.as_user(test.id('pedro'));
select test.ok('b1_acceso', 'Al quitarle la asignación, deja de verlo',
  not exists (select 1 from public.worker_projects where id = test.id('proy_b1')));

set role authenticated; select test.as_user(test.id('salvi'));
select public.assign_project_workers(test.id('proy_b1'),
                                     array[test.id('juan'), test.id('pedro')]);


\echo '== BLOQUE 1 · EL DINERO NO SALE DE ADMINISTRACIÓN'

-- Esto es lo más importante del bloque. La pantalla no enseña el
-- importe, pero eso no basta: hay que comprobar que la BASE DE DATOS no
-- lo entrega aunque se pida la columna a mano, que es lo que haría
-- alguien manipulando una petición.
set role authenticated; select test.as_user(test.id('juan'));

select test.ok('b1_dinero', 'Un trabajador NO saca ni una fila de «projects»',
  (select count(*) from public.projects) = 0);

select test.ok('b1_dinero', 'Aunque pida el importe directamente, no hay nada',
  (select count(*) from public.projects where budget_amount is not null) = 0);

select test.ok('b1_dinero', 'Tampoco ve la facturación',
  (select count(*) from public.project_billing) = 0);

select test.ok('b1_dinero', 'Ni los cobros',
  (select count(*) from public.payments) = 0);

select test.ok('b1_dinero', 'Ni los presupuestos',
  (select count(*) from public.budgets) = 0);

-- Y la vista por la que sí entra no tiene esas columnas: no es que se
-- le oculten, es que no existen ahí.
reset role;
select test.ok('b1_dinero', 'La vista del trabajador no tiene ninguna columna de dinero',
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'worker_projects'
       and column_name in ('budget_amount', 'advance_amount', 'billing_status')));

set role authenticated; select test.as_user(test.id('juan'));
select test.ok('b1_dinero', 'Pero sí ve el trabajo: medidas, acabado y horas previstas',
  (select budget_hours_fab from public.worker_projects where id = test.id('proy_b1')) = 32);


\echo '== BLOQUE 1 · EL PARTE DE TRABAJO'

set role authenticated; select test.as_user(test.id('juan'));

-- Guardar sin enviar: queda como borrador y NO avisa a nadie.
select test.put('parte_juan', (
  select id from public.save_work_report(
    null, test.id('proy_b1'), 'fabricacion', public.today_madrid(),
    'Replanteo y corte de los montantes', 4, false, false)));

select test.ok('b1_parte', 'Un parte guardado sin enviar queda sin enviar',
  (select status from public.work_reports where id = test.id('parte_juan')) = 'borrador');

select test.ok('b1_parte', 'Y lleva su número PT',
  (select code from public.work_reports where id = test.id('parte_juan')) like 'PT-%');

select test.ok('b1_parte', 'Las horas son suyas, no de la pareja',
  (select hours from public.work_reports where id = test.id('parte_juan')) = 4
  and (select worker_id from public.work_reports where id = test.id('parte_juan')) = test.id('juan'));

-- No se puede enviar un parte a medias.
select test.err('b1_parte', 'No se envía un parte sin escribir el trabajo',
  format($$select public.save_work_report(%L, null, 'fabricacion', null, '', 4, false, true)$$,
         test.id('parte_juan')), '22023');

select test.err('b1_parte', 'Ni sin indicar las horas',
  format($$select public.save_work_report(%L, null, 'fabricacion', null, 'Algo', null, false, true)$$,
         test.id('parte_juan')), '22023');

select test.err('b1_parte', 'Ni con horas imposibles',
  format($$select public.save_work_report(%L, null, 'fabricacion', null, 'Algo', 30, false, true)$$,
         test.id('parte_juan')), '22023');

select test.err('b1_parte', 'Ni de un día que todavía no ha llegado',
  format($$select public.save_work_report(%L, null, 'fabricacion', (public.today_madrid() + 1),
                                          'Algo', 4, false, false)$$,
         test.id('parte_juan')), '22023');

-- Un proyecto que no es suyo tampoco vale.
select test.err('b1_parte', 'No se puede imputar trabajo a un proyecto ajeno',
  format($$select public.save_work_report(null, %L, 'fabricacion', null, 'Algo', 2, false, false)$$,
         test.id('proy_ajeno')), '42501');


\echo '== BLOQUE 1 · LAS HORAS NO CUENTAN HASTA QUE SE VALIDAN'

set role authenticated; select test.as_user(test.id('juan'));
select public.save_work_report(test.id('parte_juan'), null, 'fabricacion', null,
                               'Replanteo y corte de los montantes', 5, false, true);

select test.ok('b1_horas', 'Al enviarlo queda pendiente de validación',
  (select status from public.work_reports where id = test.id('parte_juan')) = 'enviado');

set role authenticated; select test.as_user(test.id('salvi'));
select test.ok('b1_horas', 'Y el proyecto sigue con 0 h realizadas',
  (select realizadas_fab from public.project_hours where project_id = test.id('proy_b1')) = 0);

select test.ok('b1_horas', 'Administración lo ve en la lista de pendientes',
  exists (select 1 from public.work_reports
           where id = test.id('parte_juan') and status = 'enviado'));

select public.validate_work_report(test.id('parte_juan'));

select test.ok('b1_horas', 'Al validar, las 5 h pasan a fabricación',
  (select realizadas_fab from public.project_hours where project_id = test.id('proy_b1')) = 5);

select test.ok('b1_horas', 'Y no se cuelan en montaje',
  (select realizadas_mont from public.project_hours where project_id = test.id('proy_b1')) = 0);

select test.ok('b1_horas', 'Las previstas siguen siendo las del proyecto',
  (select previstas_fab from public.project_hours where project_id = test.id('proy_b1')) = 32);

-- Validado = cerrado para el trabajador.
set role authenticated; select test.as_user(test.id('juan'));
select test.err('b1_horas', 'Un parte validado ya no lo puede tocar el trabajador',
  format($$select public.save_work_report(%L, null, 'fabricacion', null, 'Cambio', 9, false, false)$$,
         test.id('parte_juan')), '22023');


\echo '== BLOQUE 1 · RECHAZO Y CORRECCIÓN'

set role authenticated; select test.as_user(test.id('pedro'));
select test.put('parte_pedro', (
  select id from public.save_work_report(
    null, test.id('proy_b1'), 'montaje', public.today_madrid(),
    'Montaje del tramo de abajo', 6, false, true)));

set role authenticated; select test.as_user(test.id('salvi'));

select test.err('b1_rechazo', 'No se rechaza un parte sin escribir el motivo',
  format($$select public.reject_work_report(%L, '  ')$$, test.id('parte_pedro')), '22023');

select public.reject_work_report(test.id('parte_pedro'), 'Faltan las fotos del remate');

select test.ok('b1_rechazo', 'El parte queda rechazado con su motivo',
  (select status from public.work_reports where id = test.id('parte_pedro')) = 'rechazado'
  and (select reject_reason from public.work_reports where id = test.id('parte_pedro'))
      = 'Faltan las fotos del remate');

select test.ok('b1_rechazo', 'Las horas rechazadas NO cuentan',
  (select realizadas_mont from public.project_hours where project_id = test.id('proy_b1')) = 0);

set role authenticated; select test.as_user(test.id('pedro'));

select test.ok('b1_rechazo', 'El trabajador ve el motivo del rechazo',
  (select reject_reason from public.work_reports where id = test.id('parte_pedro'))
    = 'Faltan las fotos del remate');

select test.ok('b1_rechazo', 'Y le llega el aviso',
  exists (select 1 from public.notifications
           where user_id = test.id('pedro') and kind = 'parte_rechazado'));

select test.ok('b1_rechazo', 'El motivo queda además como comentario del parte',
  exists (select 1 from public.comments
           where report_id = test.id('parte_pedro') and body like '%Faltan las fotos%'));

-- Corregir y reenviar.
select public.save_work_report(test.id('parte_pedro'), null, 'montaje', null,
                               'Montaje del tramo de abajo. Fotos añadidas.', 6, false, true);

select test.ok('b1_rechazo', 'Al corregirlo vuelve a quedar pendiente y sin motivo de rechazo',
  (select status from public.work_reports where id = test.id('parte_pedro')) = 'enviado'
  and (select reject_reason from public.work_reports where id = test.id('parte_pedro')) is null);

set role authenticated; select test.as_user(test.id('salvi'));
select public.validate_work_report(test.id('parte_pedro'));

select test.ok('b1_rechazo', 'Y al validarlo, las 6 h entran en montaje',
  (select realizadas_mont from public.project_hours where project_id = test.id('proy_b1')) = 6);


\echo '== BLOQUE 1 · PARTE SIN PROYECTO'

set role authenticated; select test.as_user(test.id('juan'));
select test.put('parte_suelto', (
  select id from public.save_work_report(
    null, null, 'montaje', public.today_madrid(),
    'Faena que me dijo Salvi, todavía sin proyecto', 3, true, true)));

select test.ok('b1_suelto', 'Un trabajador puede enviar un parte sin proyecto',
  (select project_id from public.work_reports where id = test.id('parte_suelto')) is null
  and (select status from public.work_reports where id = test.id('parte_suelto')) = 'enviado');

select test.ok('b1_suelto', 'Y puede avisar de que falta material',
  (select needs_material from public.work_reports where id = test.id('parte_suelto')));

set role authenticated; select test.as_user(test.id('salvi'));
select public.assign_report_to_project(test.id('parte_suelto'), test.id('proy_b1'));

select test.ok('b1_suelto', 'Administración lo asigna después a un proyecto',
  (select project_id from public.work_reports where id = test.id('parte_suelto')) = test.id('proy_b1')
  and (select assigned_at from public.work_reports where id = test.id('parte_suelto')) is not null);

select test.ok('b1_suelto', 'Asignarlo todavía NO suma horas: falta validarlo',
  (select realizadas_mont from public.project_hours where project_id = test.id('proy_b1')) = 6);

select public.validate_work_report(test.id('parte_suelto'));

select test.ok('b1_suelto', 'Al validarlo, sus 3 h entran en el proyecto',
  (select realizadas_mont from public.project_hours where project_id = test.id('proy_b1')) = 9);


\echo '== BLOQUE 1 · CADA UNO VE LO SUYO'

set role authenticated; select test.as_user(test.id('pedro'));

select test.ok('b1_privacidad', 'Un trabajador NO ve los partes de sus compañeros',
  not exists (select 1 from public.work_reports where worker_id <> test.id('pedro')));

select test.ok('b1_privacidad', 'Pero sí ve los suyos',
  exists (select 1 from public.work_reports where worker_id = test.id('pedro')));

select test.err('b1_privacidad', 'No puede validarse un parte a sí mismo',
  format($$select public.validate_work_report(%L)$$, test.id('parte_pedro')), '42501');

select test.err('b1_privacidad', 'Ni rechazar el de otro',
  format($$select public.reject_work_report(%L, 'porque sí')$$, test.id('parte_juan')), '42501');

select test.err('b1_privacidad', 'Ni asignar partes a proyectos',
  format($$select public.assign_report_to_project(%L, %L)$$,
         test.id('parte_pedro'), test.id('proy_b1')), '42501');

select test.err('b1_privacidad', 'Ni escribir en la tabla de partes a pelo',
  $$update public.work_reports set hours = 24$$, '42501');

select test.err('b1_privacidad', 'Ni vaciarla de golpe',
  $$truncate public.work_reports$$, '42501');

select test.err('b1_privacidad', 'Ni asignarse a un proyecto por su cuenta',
  format($$insert into public.project_workers (project_id, worker_id)
           values (%L, %L)$$, test.id('proy_b1'), test.id('pedro')), '42501');


\echo '== BLOQUE 1 · COMENTARIO DIRIGIDO A UN TRABAJADOR'

set role authenticated; select test.as_user(test.id('salvi'));
insert into public.comments (project_id, author_id, body, target_worker_id)
values (test.id('proy_b1'), test.id('salvi'),
        'Juan, acuérdate de dejar el pasamanos sin taladrar.', test.id('juan'));

-- Los avisos se miran desde el servidor: cada persona solo ve los suyos,
-- así que desde la sesión de administración no se verían los de Juan.
reset role; select test.as_server();

select test.ok('b1_comentario', 'El aviso le llega a quien va dirigido',
  exists (select 1 from public.notifications
           where user_id = test.id('juan') and kind = 'comentario'
             and title like 'Comentario para ti%'));

select test.ok('b1_comentario', 'Y NO les llega a los demás',
  not exists (select 1 from public.notifications
               where user_id = test.id('pedro') and body like '%pasamanos sin taladrar%'));

set role authenticated; select test.as_user(test.id('pedro'));
select test.ok('b1_comentario', 'Pero los demás SÍ pueden leerlo: no es un mensaje privado',
  exists (select 1 from public.comments
           where project_id = test.id('proy_b1') and body like '%pasamanos sin taladrar%'));


\echo '== BLOQUE 1 · EL HISTORIAL LO CUENTA TODO'

reset role; select test.as_server();

select test.ok('b1_historial', 'Queda anotado quién asignó a quién',
  exists (select 1 from public.audit_log
           where summary like '%asignó a Juan Ortega al proyecto%'));

select test.ok('b1_historial', 'Y el envío del parte, con sus horas',
  exists (select 1 from public.audit_log where summary like '%envió el parte PT-%a validar%'));

select test.ok('b1_historial', 'Y la validación, con quién la hizo',
  exists (select 1 from public.audit_log where summary like 'Salvi validó el parte PT-%'));

select test.ok('b1_historial', 'Y el rechazo, con el motivo escrito',
  exists (select 1 from public.audit_log
           where summary like '%rechazó el parte PT-%Faltan las fotos del remate%'));

select test.ok('b1_historial', 'Y la asignación posterior a un proyecto',
  exists (select 1 from public.audit_log
           where summary like '%asignó el parte PT-%al proyecto%'));

select test.ok('b1_historial', 'El historial sigue sin poder tocarse',
  not exists (select 1 from information_schema.role_table_grants
               where grantee in ('authenticated', 'anon')
                 and table_name = 'audit_log' and privilege_type in ('UPDATE', 'DELETE')));
