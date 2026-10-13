-- =====================================================================
-- METALPLAFER360 · FASE 2 · LOS ARCHIVOS DEL TRABAJADOR
--
-- Lo que importa aquí:
--   · que el trabajador pueda subir fotos, vídeos Y documentos a los
--     proyectos a los que está asignado, en el almacén y en la tabla
--     —son dos permisos distintos y los dos tienen que decir sí—;
--   · que NO pueda en un proyecto que no es suyo;
--   · que siga sin poder tocar nada administrativo;
--   · que pueda quitar LO SUYO y nada más, comprobado en la base de
--     datos y no solo en la pantalla;
--   · que las órdenes y los partes sigan funcionando como antes.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== FASE 2 · PREPARACIÓN'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

-- Un proyecto de Juan y otro que no es suyo.
with a as (insert into public.projects (client_id, name, budget_amount, budget_hours_fab)
           values (test.id('cli_laura'), 'Proyecto de Juan', 3000, 8) returning id)
select test.put('f2_mio', (select id from a));
with b as (insert into public.projects (client_id, name, budget_amount, budget_hours_fab)
           values (test.id('cli_laura'), 'Proyecto de otros', 3000, 8) returning id)
select test.put('f2_ajeno', (select id from b));

select public.assign_project_workers(test.id('f2_mio'), array[test.id('juan')]::uuid[]);

-- Un archivo administrativo y otro técnico, subidos por administración.
insert into public.documents (project_id, storage_path, file_name, mime_type, size_bytes,
                              category, scope, uploaded_by)
values (test.id('f2_mio'), 'projects/' || test.id('f2_mio') || '/factura.pdf',
        'factura.pdf', 'application/pdf', 1000, 'documento', 'administrativa', test.id('salvi'));
insert into public.documents (project_id, storage_path, file_name, mime_type, size_bytes,
                              category, scope, uploaded_by)
values (test.id('f2_mio'), 'projects/' || test.id('f2_mio') || '/plano.pdf',
        'plano.pdf', 'application/pdf', 1000, 'documento', 'tecnica', test.id('salvi'));


\echo '== FASE 2.2 · EL ALMACÉN ACEPTA LA CARPETA DEL PROYECTO'

reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.ok('f2_subir', 'El trabajador puede subir a la carpeta de SU proyecto',
  public.storage_can_upload('projects/' || test.id('f2_mio') || '/foto.jpg'));

select test.ok('f2_subir', 'Pero NO a la de un proyecto que no es suyo',
  not public.storage_can_upload('projects/' || test.id('f2_ajeno') || '/foto.jpg'));

select test.ok('f2_subir', 'Ni a una carpeta que no existe',
  not public.storage_can_upload('facturas/2026/enero.pdf')
  and not public.storage_can_upload('projects/no-es-un-id/foto.jpg'));

select test.ok('f2_subir', 'Y sigue pudiendo leer los archivos técnicos de su proyecto',
  public.storage_can_read('projects/' || test.id('f2_mio') || '/plano.pdf'));

select test.ok('f2_subir', 'Pero NO los administrativos',
  not public.storage_can_read('projects/' || test.id('f2_mio') || '/factura.pdf'));


\echo '== FASE 2.2 · LA TABLA REGISTRA EL ARCHIVO DEL PROYECTO'

-- Una foto, un vídeo y un documento: las tres cosas que se pidieron.
insert into public.documents (project_id, storage_path, file_name, mime_type, size_bytes,
                              category, scope, uploaded_by)
values (test.id('f2_mio'), 'projects/' || test.id('f2_mio') || '/obra-1.jpg',
        'obra-1.jpg', 'image/jpeg', 2000, 'foto', 'tecnica', test.id('juan'));
insert into public.documents (project_id, storage_path, file_name, mime_type, size_bytes,
                              category, scope, uploaded_by)
values (test.id('f2_mio'), 'projects/' || test.id('f2_mio') || '/obra-1.mp4',
        'obra-1.mp4', 'video/mp4', 3000, 'video', 'tecnica', test.id('juan'));
insert into public.documents (project_id, storage_path, file_name, mime_type, size_bytes,
                              category, scope, uploaded_by)
values (test.id('f2_mio'), 'projects/' || test.id('f2_mio') || '/albaran.pdf',
        'albaran.pdf', 'application/pdf', 4000, 'documento', 'tecnica', test.id('juan'));

select test.ok('f2_registro', 'Se registran la foto, el vídeo y el documento',
  (select count(*) from public.documents
    where project_id = test.id('f2_mio') and uploaded_by = test.id('juan')) = 3);

select test.err('f2_registro', 'No puede registrarlo como administrativo',
  format($$insert into public.documents (project_id, storage_path, file_name, size_bytes,
                                         category, scope, uploaded_by)
           values (%L, 'projects/x/trampa.pdf', 'trampa.pdf', 10,
                   'documento', 'administrativa', %L)$$,
         test.id('f2_mio'), test.id('juan')), '42501');

select test.err('f2_registro', 'Ni en un proyecto que no es suyo',
  format($$insert into public.documents (project_id, storage_path, file_name, size_bytes,
                                         category, scope, uploaded_by)
           values (%L, 'projects/y/trampa.jpg', 'trampa.jpg', 10,
                   'foto', 'tecnica', %L)$$,
         test.id('f2_ajeno'), test.id('juan')), '42501');

select test.err('f2_registro', 'Ni a nombre de otra persona',
  format($$insert into public.documents (project_id, storage_path, file_name, size_bytes,
                                         category, scope, uploaded_by)
           values (%L, 'projects/z/trampa.jpg', 'trampa.jpg', 10,
                   'foto', 'tecnica', %L)$$,
         test.id('f2_mio'), test.id('salvi')), '42501');

select test.ok('f2_registro', 'Y sigue sin ver la documentación administrativa',
  (select count(*) from public.documents
    where project_id = test.id('f2_mio') and scope = 'administrativa') = 0);


\echo '== FASE 2.2 · QUITAR: SOLO LO PROPIO'

select test.put('f2_doc_juan', (select id from public.documents
  where project_id = test.id('f2_mio') and file_name = 'obra-1.jpg'));
select test.put('f2_doc_admin', (select id from public.documents
  where project_id = test.id('f2_mio') and file_name = 'plano.pdf'));

-- «trash_document» no devuelve nada, así que se llama y después se mira
-- el estado. Mezclar la llamada con la comprobación en una sola
-- expresión no funciona: «void is null» no es ni verdadero ni falso.
select public.trash_document(test.id('f2_doc_juan'));

-- OJO: desde el trabajador, un archivo en la papelera YA NO SE VE —la
-- política exige «deleted_at is null»—, así que preguntar por él aquí
-- devuelve cero filas, no «falso». Lo que se comprueba desde su sesión
-- es justo eso: que ha desaparecido de su vista.
select test.ok('f2_quitar', 'El trabajador puede quitar un archivo suyo del proyecto',
  not exists (select 1 from public.documents where id = test.id('f2_doc_juan')));

reset role; set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('f2_quitar', 'Y en la base de datos queda en la papelera, no destruido',
  (select deleted_at is not null from public.documents where id = test.id('f2_doc_juan')));

select test.ok('f2_quitar', 'Con el nombre de quien lo ha quitado',
  (select deleted_by = test.id('juan') from public.documents where id = test.id('f2_doc_juan')));

reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.err('f2_quitar', 'Pero NO uno que ha subido otra persona',
  format($$select public.trash_document(%L)$$, test.id('f2_doc_admin')), '42501');

select test.ok('f2_quitar', 'Y ese archivo sigue estando',
  (select deleted_at is null from public.documents where id = test.id('f2_doc_admin')));

-- El mensaje tiene que explicar POR QUÉ, no un «no tienes permisos» seco.
do $$
declare v_msg text;
begin
  begin
    perform public.trash_document(test.id('f2_doc_admin'));
    v_msg := '(no ha fallado)';
  exception when others then v_msg := sqlerrm;
  end;
  perform test.ok('f2_quitar', 'Y el motivo se dice en castellano y es el correcto',
    v_msg like '%los archivos que has subido tú%', v_msg);
end $$;


\echo '== FASE 2.2 · ADMINISTRACIÓN SIGUE PUDIENDO CON TODO'

reset role; set role authenticated; select test.as_user(test.id('salvi'));

select public.trash_document(test.id('f2_doc_admin'));
select test.ok('f2_admin', 'Administración quita cualquier archivo',
  (select deleted_at is not null from public.documents where id = test.id('f2_doc_admin')));

select public.restore_document(test.id('f2_doc_admin'));
select test.ok('f2_admin', 'Y recupera de la papelera',
  (select deleted_at is null from public.documents where id = test.id('f2_doc_admin')));


\echo '== FASE 2.2 · LAS ÓRDENES Y LOS PARTES SIGUEN IGUAL'

-- Lo que ya funcionaba tiene que seguir funcionando: es la mitad del
-- encargo («conserva las funcionalidades que actualmente funcionan»).
reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.put('f2_parte', (select id from public.save_work_report(
  null, test.id('f2_mio'), 'fabricacion', current_date,
  'Montaje de la barandilla', 4, false, false)));

select test.ok('f2_otros', 'El trabajador sigue pudiendo subir a SU parte',
  public.storage_can_upload('reports/' || test.id('f2_parte') || '/foto.jpg'));

insert into public.documents (report_id, storage_path, file_name, mime_type, size_bytes,
                              category, scope, uploaded_by)
values (test.id('f2_parte'), 'reports/' || test.id('f2_parte') || '/parte-1.mp4',
        'parte-1.mp4', 'video/mp4', 5000, 'video', 'tecnica', test.id('juan'));

select test.ok('f2_otros', 'Y registrar un vídeo en su parte',
  (select count(*) from public.documents
    where report_id = test.id('f2_parte') and category = 'video') = 1);

select test.ok('f2_otros', 'Y leerlo después, que es lo que fallaba en el móvil',
  public.storage_can_read('reports/' || test.id('f2_parte') || '/parte-1.mp4'));

reset role; select test.as_server();
