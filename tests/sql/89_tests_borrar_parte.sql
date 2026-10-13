-- =====================================================================
-- METALPLAFER360 · ELIMINAR UN PARTE DE TRABAJO
--
-- Lo que importa aquí:
--   · que administración pueda eliminar un parte creado por error;
--   · que se vayan con él SUS archivos, comentarios y avisos, y NADA más;
--   · que un parte VALIDADO no se pueda eliminar, porque sus horas
--     cuentan como trabajo realizado, y que rechazarlo abra la puerta;
--   · que un trabajador NO pueda eliminar partes ni llamando a la
--     función ni escribiendo en la tabla;
--   · que los demás partes y el aviso de material sigan intactos;
--   · que quede constancia en el historial, con el registro dentro.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== BORRAR PARTE · PREPARACIÓN'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

with a as (insert into public.projects (client_id, name, budget_amount, budget_hours_fab)
           values (test.id('cli_laura'), 'Proyecto de los partes', 4000, 40) returning id)
select test.put('bp_proy', (select id from a));
select public.assign_project_workers(test.id('bp_proy'), array[test.id('juan')]::uuid[]);

-- Tres partes de Juan: uno que se va a borrar, uno validado y otro que
-- tiene que quedarse intacto para comprobar que no se lo lleva por delante.
reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.put('bp_malo', (select id from public.save_work_report(
  null, test.id('bp_proy'), 'fabricacion', current_date,
  'Parte creado por error durante las pruebas.', 3, true, true)));

select test.put('bp_bueno', (select id from public.save_work_report(
  null, test.id('bp_proy'), 'fabricacion', current_date - 1,
  'Este parte es de verdad y no se toca.', 8, false, true)));

select test.put('bp_validado', (select id from public.save_work_report(
  null, test.id('bp_proy'), 'montaje', current_date - 2,
  'Montaje terminado.', 6, false, true)));

-- Al parte que se va a borrar se le ponen una fotografía y una firma,
-- que es lo que de verdad cuelga de un parte.
insert into public.documents (report_id, storage_path, file_name, mime_type, size_bytes,
                              category, scope, uploaded_by)
values (test.id('bp_malo'), 'reports/' || test.id('bp_malo') || '/foto.jpg',
        'foto.jpg', 'image/jpeg', 2000, 'foto', 'tecnica', test.id('juan'));
insert into public.documents (report_id, storage_path, file_name, mime_type, size_bytes,
                              category, scope, uploaded_by)
values (test.id('bp_malo'), 'reports/' || test.id('bp_malo') || '/firma.png',
        'firma.png', 'image/png', 1000, 'firma', 'tecnica', test.id('juan'));
-- Y al bueno, otra, para comprobar que no se la lleva.
insert into public.documents (report_id, storage_path, file_name, mime_type, size_bytes,
                              category, scope, uploaded_by)
values (test.id('bp_bueno'), 'reports/' || test.id('bp_bueno') || '/foto-buena.jpg',
        'foto-buena.jpg', 'image/jpeg', 2000, 'foto', 'tecnica', test.id('juan'));

insert into public.comments (report_id, author_id, body)
values (test.id('bp_malo'), test.id('juan'), 'Comentario del parte equivocado');
insert into public.comments (report_id, author_id, body)
values (test.id('bp_bueno'), test.id('juan'), 'Comentario del parte bueno');

-- El parte malo avisó de que faltaba material: ese aviso cuelga del
-- PROYECTO, no del parte, y tiene que sobrevivir al borrado.
select test.put('bp_aviso', (select id from public.submit_material_need(
  test.id('bp_proy'), 'Faltan tornillos del 8')));

reset role; set role authenticated; select test.as_user(test.id('salvi'));
select public.validate_work_report(test.id('bp_validado'));

select test.ok('bp_previo', 'El escenario está montado: tres partes de Juan',
  (select count(*) from public.work_reports where project_id = test.id('bp_proy')) = 3);

select test.ok('bp_previo', 'Uno de ellos validado, y sus horas ya cuentan',
  (select coalesce(sum(hours), 0) from public.hours_worked
    where project_id = test.id('bp_proy')) = 6,
  (select coalesce(sum(hours), 0)::text from public.hours_worked
    where project_id = test.id('bp_proy')));


\echo '== BORRAR PARTE · UN PARTE VALIDADO NO SE BORRA'

select test.err('bp_validado', 'Un parte validado no se puede eliminar',
  format($$select public.delete_work_report(%L)$$, test.id('bp_validado')), '23503');

select test.ok('bp_validado', 'Y sigue estando, con sus horas contando',
  exists (select 1 from public.work_reports where id = test.id('bp_validado'))
  and (select coalesce(sum(hours), 0) from public.hours_worked
        where project_id = test.id('bp_proy')) = 6);

-- El mensaje tiene que decir QUÉ hacer, no solo que no se puede.
do $$
declare v_msg text;
begin
  begin
    perform public.delete_work_report(test.id('bp_validado'));
    v_msg := '(no ha fallado)';
  exception when others then v_msg := sqlerrm;
  end;
  perform test.ok('bp_validado', 'Y el mensaje explica que hay que rechazarlo primero',
    v_msg like '%Recházalo primero%', v_msg);
end $$;

-- Rechazarlo abre la puerta: deja de contar y entonces sí se elimina.
select public.reject_work_report(test.id('bp_validado'), 'Era una prueba.');

select test.ok('bp_validado', 'Al rechazarlo, sus horas dejan de contar',
  (select coalesce(sum(hours), 0) from public.hours_worked
    where project_id = test.id('bp_proy')) = 0);

select test.ok('bp_validado', 'Y ahora sí se puede eliminar',
  (public.delete_work_report(test.id('bp_validado')) ->> 'ok') = 'true');

select test.ok('bp_validado', 'Y ya no está',
  not exists (select 1 from public.work_reports where id = test.id('bp_validado')));


\echo '== BORRAR PARTE · ADMINISTRACIÓN ELIMINA EL PARTE EQUIVOCADO'


select test.ok('bp_borrado', 'Antes de borrar, el parte tiene 2 archivos y 1 comentario',
  (select count(*) from public.documents where report_id = test.id('bp_malo')) = 2
  and (select count(*) from public.comments where report_id = test.id('bp_malo')) = 1);

select test.setnote('bp_resultado',
  public.delete_work_report(test.id('bp_malo'))::text);

select test.ok('bp_borrado', 'El parte se elimina',
  not exists (select 1 from public.work_reports where id = test.id('bp_malo')));

select test.ok('bp_borrado', 'Y dice cuántos archivos y comentarios se han ido con él',
  (test.note('bp_resultado')::jsonb ->> 'documentos') = '2'
  and (test.note('bp_resultado')::jsonb ->> 'firmas') = '1'
  and (test.note('bp_resultado')::jsonb ->> 'comentarios') = '1',
  test.note('bp_resultado'));

select test.ok('bp_borrado', 'Sus archivos se han ido de verdad',
  not exists (select 1 from public.documents where report_id = test.id('bp_malo')));

select test.ok('bp_borrado', 'Y sus comentarios también',
  not exists (select 1 from public.comments where report_id = test.id('bp_malo')));

select test.ok('bp_borrado', 'Y sus avisos internos',
  not exists (select 1 from public.notifications where report_id = test.id('bp_malo')));


\echo '== BORRAR PARTE · LO QUE NO SE TOCA'

select test.ok('bp_intacto', 'El otro parte sigue entero',
  exists (select 1 from public.work_reports where id = test.id('bp_bueno')));

select test.ok('bp_intacto', 'Con su fotografía',
  (select count(*) from public.documents where report_id = test.id('bp_bueno')) = 1);

select test.ok('bp_intacto', 'Y con su comentario',
  (select count(*) from public.comments where report_id = test.id('bp_bueno')) = 1);

select test.ok('bp_intacto', 'El proyecto sigue estando',
  exists (select 1 from public.projects where id = test.id('bp_proy')));

select test.ok('bp_intacto', 'Y el trabajador sigue asignado a él',
  exists (select 1 from public.project_workers
           where project_id = test.id('bp_proy') and worker_id = test.id('juan')));

-- Este es el que más importa: el aviso de material cuelga del PROYECTO,
-- no del parte, así que el material sigue faltando.
select test.ok('bp_intacto', 'El aviso de material sobrevive al borrado del parte',
  exists (select 1 from public.material_requests where id = test.id('bp_aviso')),
  'el aviso de material se ha perdido al borrar el parte');


\echo '== BORRAR PARTE · EL HISTORIAL'

select test.ok('bp_historial', 'Queda una anotación del borrado',
  exists (select 1 from public.audit_log
           where action = 'eliminar_parte' and entity_id = test.id('bp_malo')));

select test.ok('bp_historial', 'Con el registro completo del parte dentro',
  exists (select 1 from public.audit_log
           where action = 'eliminar_parte' and entity_id = test.id('bp_malo')
             and details -> 'registro' ->> 'work_done' like '%por error%'));

select test.ok('bp_historial', 'Y contando lo que se fue con él',
  exists (select 1 from public.audit_log
           where action = 'eliminar_parte' and entity_id = test.id('bp_malo')
             and (details ->> 'documentos') = '2'
             and (details ->> 'firmas') = '1'));

select test.ok('bp_historial', 'El resumen dice quién, qué parte y de qué proyecto',
  exists (select 1 from public.audit_log
           where action = 'eliminar_parte' and entity_id = test.id('bp_malo')
             and summary like '%eliminó el parte%'
             and summary like '%Juan%'
             and summary like '%del proyecto%'));

-- El estado se traduce con el diccionario de los PARTES, no con el
-- genérico: «enviado» es «Pendiente de validación», no «Presupuesto
-- enviado».
select test.ok('bp_historial', 'Y el estado se dice en el idioma de los partes',
  exists (select 1 from public.audit_log
           where action = 'eliminar_parte' and entity_id = test.id('bp_malo')
             and summary like '%Pendiente de validación%')
  and not exists (select 1 from public.audit_log
                   where action = 'eliminar_parte' and entity_id = test.id('bp_malo')
                     and summary like '%Presupuesto%'),
  (select summary from public.audit_log
    where action = 'eliminar_parte' and entity_id = test.id('bp_malo')));

select test.ok('bp_historial', 'Y el borrado en cascada NO ha ensuciado el historial',
  (select count(*) from public.audit_log
    where entity_type = 'documents'
      and (details -> 'registro' ->> 'report_id') = test.id('bp_malo')::text) = 0);


\echo '== BORRAR PARTE · UN TRABAJADOR NO PUEDE'

reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.err('bp_permisos', 'El trabajador no puede eliminar su propio parte',
  format($$select public.delete_work_report(%L)$$, test.id('bp_bueno')), '42501');

select test.ok('bp_permisos', 'Y el parte sigue ahí',
  exists (select 1 from public.work_reports where id = test.id('bp_bueno')));

-- Tampoco escribiendo directamente en la tabla: el permiso de borrar
-- está retirado para quien tiene sesión, no solo oculto en la pantalla.
select test.err('bp_permisos', 'Ni borrando directamente en la tabla',
  format($$delete from public.work_reports where id = %L$$, test.id('bp_bueno')), '42501');

select test.ok('bp_permisos', 'Después de los dos intentos, sigue entero con su foto',
  exists (select 1 from public.work_reports where id = test.id('bp_bueno'))
  and (select count(*) from public.documents where report_id = test.id('bp_bueno')) = 1);


\echo '== BORRAR PARTE · LO QUE NO EXISTE'

reset role; set role authenticated; select test.as_user(test.id('salvi'));

select test.err('bp_limites', 'Un parte que no existe no se elimina',
  $$select public.delete_work_report('00000000-0000-4000-8000-000000000000')$$, 'P0002');

reset role; select test.as_server();
