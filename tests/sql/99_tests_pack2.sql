-- =====================================================================
-- METALPLAFER360 · PACK 2 · ARCHIVOS DE TRABAJADOR, PARTES Y TAREAS
--
-- Lo que importa aquí:
--
--   · MEJORA 2 · que un trabajador ASIGNADO pueda subir archivos a su
--     aviso, y que uno NO asignado no pueda, ni en la tabla ni en el
--     almacén, que son dos puertas distintas;
--   · que los comentarios sigan funcionando como ya funcionaban;
--   · MEJORA 3 · que las fotos de un parte se vean desde su proyecto y
--     desde su aviso, SIN copiarse, conservando de qué parte vienen, y
--     que un parte sin proyecto ni aviso no rompa nada;
--   · MEJORA 5 · que los adjuntos de una tarjeta sean archivos normales
--     y que solo administración llegue a ellos;
--   · MEJORA 6 · que eliminar una tarjeta se lleve su checklist y sus
--     adjuntos y NO se lleve su evento del calendario ni archivos de
--     otros.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== PACK 2 · LA COLUMNA NUEVA Y LA RESTRICCIÓN DE UN SOLO DUEÑO'

reset role; select test.as_server();

select test.ok('p2_base', 'Un documento puede ser de una tarjeta de Gestiones internas',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'documents'
             and column_name = 'internal_task_id'));

-- LO QUE IMPORTA: la restricción cuenta las SIETE columnas de dueño. Si
-- se hubiera olvidado la nueva, ningún adjunto de tarjeta entraría.
select test.ok('p2_base', 'Y la restricción de «un solo dueño» cuenta las siete',
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'documents_one_owner') like '%internal_task_id%',
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'documents_one_owner'));

\echo '== MEJORA 2 · EL TRABAJADOR SUBE A SU AVISO'

/*
  Se monta un aviso asignado a Juan y otro que NO es suyo. Las dos
  puertas se comprueban por separado, porque son dos:

    · «documents_insert» · la fila en la tabla;
    · «storage_can_upload» · el archivo en el almacén.

  Abrir solo una no sirve de nada, y es el fallo típico.
*/
reset role; select test.as_server();

insert into public.fichas (id, type, status, client_id, title, assigned_to)
values ('d1111111-1111-1111-1111-111111111111', 'aviso', 'pendiente',
        (select id from public.clients limit 1), 'Aviso de Juan', test.id('juan'))
on conflict (id) do nothing;

insert into public.fichas (id, type, status, client_id, title)
values ('d2222222-2222-2222-2222-222222222222', 'aviso', 'pendiente',
        (select id from public.clients limit 1), 'Aviso de nadie')
on conflict (id) do nothing;

set role authenticated; select test.as_user(test.id('juan'));

select test.ok('p2_subir', 'El almacén le deja escribir en la carpeta de SU aviso',
  public.storage_can_upload('fichas/d1111111-1111-1111-1111-111111111111/foto.jpg'));

select test.ok('p2_subir', 'Y NO en la de un aviso que no es suyo',
  not public.storage_can_upload('fichas/d2222222-2222-2222-2222-222222222222/foto.jpg'));

insert into storage.objects (bucket_id, name)
values ('documentos', 'fichas/d1111111-1111-1111-1111-111111111111/foto.jpg')
on conflict do nothing;

insert into public.documents (ficha_id, bucket, storage_path, file_name, mime_type,
                              size_bytes, category, scope, uploaded_by)
values ('d1111111-1111-1111-1111-111111111111', 'documentos',
        'fichas/d1111111-1111-1111-1111-111111111111/foto.jpg',
        'puerta.jpg', 'image/jpeg', 540000, 'foto', 'tecnica', test.id('juan'));

select test.ok('p2_subir', 'Y registra la fotografía en su aviso',
  (select count(*) = 1 from public.documents
    where ficha_id = 'd1111111-1111-1111-1111-111111111111'));

-- Un documento, no solo fotos y vídeos: se pidió expresamente.
insert into storage.objects (bucket_id, name)
values ('documentos', 'fichas/d1111111-1111-1111-1111-111111111111/albaran.pdf')
on conflict do nothing;

insert into public.documents (ficha_id, bucket, storage_path, file_name, mime_type,
                              size_bytes, category, scope, uploaded_by)
values ('d1111111-1111-1111-1111-111111111111', 'documentos',
        'fichas/d1111111-1111-1111-1111-111111111111/albaran.pdf',
        'albaran.pdf', 'application/pdf', 90000, 'documento', 'tecnica', test.id('juan'));

select test.ok('p2_subir', 'También un documento y un vídeo, no solo fotos',
  (select count(*) = 2 from public.documents
    where ficha_id = 'd1111111-1111-1111-1111-111111111111'));

\echo '== MEJORA 2 · Y EL QUE NO ESTÁ ASIGNADO, NO'

select test.err('p2_permisos', 'No registra archivos en un aviso que no es suyo',
  $$ insert into public.documents (ficha_id, bucket, storage_path, file_name, mime_type,
                                   size_bytes, category, scope, uploaded_by)
     values ('d2222222-2222-2222-2222-222222222222', 'documentos',
             'fichas/d2222222-2222-2222-2222-222222222222/x.jpg',
             'x.jpg', 'image/jpeg', 1000, 'foto', 'tecnica', test.id('juan')) $$, '42501');

-- Ni a nombre de otro, ni en la carpeta administrativa: lo de siempre,
-- que no se ha relajado al abrir la rama nueva.
select test.err('p2_permisos', 'Ni a nombre de otra persona',
  $$ insert into public.documents (ficha_id, bucket, storage_path, file_name, mime_type,
                                   size_bytes, category, scope, uploaded_by)
     values ('d1111111-1111-1111-1111-111111111111', 'documentos',
             'fichas/d1111111-1111-1111-1111-111111111111/y.jpg',
             'y.jpg', 'image/jpeg', 1000, 'foto', 'tecnica', test.id('salvi')) $$, '42501');

select test.err('p2_permisos', 'Ni en la carpeta administrativa',
  $$ insert into public.documents (ficha_id, bucket, storage_path, file_name, mime_type,
                                   size_bytes, category, scope, uploaded_by)
     values ('d1111111-1111-1111-1111-111111111111', 'documentos',
             'fichas/d1111111-1111-1111-1111-111111111111/z.pdf',
             'z.pdf', 'application/pdf', 1000, 'documento', 'administrativa', test.id('juan')) $$,
  '42501');

\echo '== MEJORA 2 · LOS COMENTARIOS YA FUNCIONABAN'

/*
  Esto NO es un cambio de este pack: la política «comments_insert» del
  archivo 39 ya admitía «worker_has_ficha». Se comprueba igualmente,
  porque el encargo lo pedía y porque así queda fijado que sigue
  funcionando después de tocar las políticas de al lado.
*/
insert into public.comments (ficha_id, author_id, body)
values ('d1111111-1111-1111-1111-111111111111', test.id('juan'),
        'He pasado por la obra: la puerta está dañada.');

select test.ok('p2_comentarios', 'Un trabajador asignado comenta en su aviso',
  (select count(*) = 1 from public.comments
    where ficha_id = 'd1111111-1111-1111-1111-111111111111'));

select test.err('p2_comentarios', 'Y en uno que no es suyo, no',
  $$ insert into public.comments (ficha_id, author_id, body)
     values ('d2222222-2222-2222-2222-222222222222', test.id('juan'), 'Hola') $$, '42501');

-- Y administración lo ve, que es para lo que sirve.
reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('p2_comentarios', 'Administración ve el comentario y quién lo escribió',
  (select body like '%puerta está dañada%' from public.comments
    where ficha_id = 'd1111111-1111-1111-1111-111111111111'));

select test.ok('p2_comentarios', 'Y ve los archivos que subió el trabajador',
  (select count(*) = 2 from public.documents
    where ficha_id = 'd1111111-1111-1111-1111-111111111111'));

\echo '== MEJORA 3 · LAS FOTOS DE UN PARTE, DESDE EL PROYECTO Y EL AVISO'

reset role; select test.as_server();

-- Un parte sobre un PROYECTO, con una foto.
-- Un parte «validado» exige trabajo descrito y horas: lo pide la
-- restricción «work_reports_enviable» del archivo 26.
insert into public.work_reports (id, code, worker_id, project_id, work_type, work_date,
                                 work_done, hours, status, validated_at)
values ('e1111111-1111-1111-1111-111111111111', 'PT-TEST-001', test.id('juan'),
        test.id('proy1'), 'fabricacion', public.today_madrid(),
        'Soldadura de los tramos', 6, 'validado', now())
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name)
values ('documentos', 'reports/e1111111-1111-1111-1111-111111111111/soldadura.jpg')
on conflict do nothing;

insert into public.documents (report_id, bucket, storage_path, file_name, mime_type,
                              size_bytes, category, scope, uploaded_by)
values ('e1111111-1111-1111-1111-111111111111', 'documentos',
        'reports/e1111111-1111-1111-1111-111111111111/soldadura.jpg',
        'soldadura.jpg', 'image/jpeg', 700000, 'foto', 'tecnica', test.id('juan'))
on conflict do nothing;

set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('p2_partes', 'El proyecto ve la fotografía del parte hecho sobre él',
  exists (select 1 from public.related_documents
           where para_tipo = 'proyecto' and para_id = test.id('proy1')
             and origen_tipo = 'parte' and file_name = 'soldadura.jpg'),
  (select coalesce(string_agg(file_name || ' (' || origen_tipo || ')', ', '), '(ninguno)')
     from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('proy1')));

-- LO QUE IMPORTA: se sabe de QUÉ parte viene.
select test.ok('p2_partes', 'Diciendo de qué parte viene, con su código y su fecha',
  (select origen_code = 'PT-TEST-001' and origen_fecha is not null
     from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('proy1')
      and origen_tipo = 'parte' and file_name = 'soldadura.jpg'));

-- Y NO SE DUPLICA: el archivo sigue siendo del parte y solo del parte.
select test.ok('p2_partes', 'Sin copiar nada: el archivo sigue siendo del parte',
  (select count(*) = 1 from public.documents
    where storage_path = 'reports/e1111111-1111-1111-1111-111111111111/soldadura.jpg')
  and (select project_id is null and report_id is not null from public.documents
        where storage_path = 'reports/e1111111-1111-1111-1111-111111111111/soldadura.jpg'));

-- Un parte sobre un AVISO.
reset role; select test.as_server();

insert into public.work_reports (id, code, worker_id, ficha_id, work_type, work_date,
                                 work_done, hours, status, validated_at)
values ('e2222222-2222-2222-2222-222222222222', 'PT-TEST-002', test.id('juan'),
        'd1111111-1111-1111-1111-111111111111', 'montaje', public.today_madrid(),
        'Revisión del motor', 3, 'validado', now())
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name)
values ('documentos', 'reports/e2222222-2222-2222-2222-222222222222/motor.jpg')
on conflict do nothing;

insert into public.documents (report_id, bucket, storage_path, file_name, mime_type,
                              size_bytes, category, scope, uploaded_by)
values ('e2222222-2222-2222-2222-222222222222', 'documentos',
        'reports/e2222222-2222-2222-2222-222222222222/motor.jpg',
        'motor.jpg', 'image/jpeg', 620000, 'foto', 'tecnica', test.id('juan'))
on conflict do nothing;

set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('p2_partes', 'Y el AVISO ve la fotografía del parte hecho sobre él',
  exists (select 1 from public.related_documents
           where para_tipo = 'aviso' and para_id = 'd1111111-1111-1111-1111-111111111111'
             and origen_tipo = 'parte' and file_name = 'motor.jpg'),
  (select coalesce(string_agg(file_name || ' (' || origen_tipo || ')', ', '), '(ninguno)')
     from public.related_documents
    where para_tipo = 'aviso' and para_id = 'd1111111-1111-1111-1111-111111111111'));

/*
  UN PARTE SIN PROYECTO NI AVISO.

  Se pidió comprobar que no rompe nada. No rompe: la vista no lo
  empareja con nada y simplemente no aparece. Ni error, ni fila con el
  destino en nulo, que sería peor porque se colaría en cualquier
  consulta.
*/
reset role; select test.as_server();

insert into public.work_reports (id, code, worker_id, work_type, work_date, status)
values ('e3333333-3333-3333-3333-333333333333', 'PT-TEST-003', test.id('juan'),
        'fabricacion', public.today_madrid(), 'borrador')
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name)
values ('documentos', 'reports/e3333333-3333-3333-3333-333333333333/suelta.jpg')
on conflict do nothing;

insert into public.documents (report_id, bucket, storage_path, file_name, mime_type,
                              size_bytes, category, scope, uploaded_by)
values ('e3333333-3333-3333-3333-333333333333', 'documentos',
        'reports/e3333333-3333-3333-3333-333333333333/suelta.jpg',
        'suelta.jpg', 'image/jpeg', 300000, 'foto', 'tecnica', test.id('juan'))
on conflict do nothing;

set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('p2_partes', 'Un parte sin proyecto ni aviso no rompe nada: no sale, y ya',
  not exists (select 1 from public.related_documents where file_name = 'suelta.jpg'),
  (select coalesce(string_agg(para_tipo, ', '), '(no sale, correcto)')
     from public.related_documents where file_name = 'suelta.jpg'));

select test.ok('p2_partes', 'Y su archivo sigue existiendo, en su parte',
  (select count(*) = 1 from public.documents where file_name = 'suelta.jpg'));

-- Ni una fila repetida por llegar por dos caminos.
select test.ok('p2_partes', 'Nada se duplica en la vista',
  (select count(*) = count(distinct id) from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('proy1')));

\echo '== MEJORA 5 · LOS ADJUNTOS DE UNA TARJETA'

reset role; select test.as_server();

insert into public.internal_lists (id, name, position)
values ('f1111111-1111-1111-1111-111111111111', 'MULTAS P2', 90)
on conflict (id) do nothing;

insert into public.internal_tasks (id, list_id, title, position)
values ('f2222222-2222-2222-2222-222222222222',
        'f1111111-1111-1111-1111-111111111111', 'MULTA SBD-BCN', 10)
on conflict (id) do nothing;

set role authenticated; select test.as_user(test.id('salvi'));

insert into storage.objects (bucket_id, name)
values ('documentos', 'internas/f2222222-2222-2222-2222-222222222222/multa.pdf')
on conflict do nothing;

insert into public.documents (internal_task_id, bucket, storage_path, file_name, mime_type,
                              size_bytes, category, scope, uploaded_by)
values ('f2222222-2222-2222-2222-222222222222', 'documentos',
        'internas/f2222222-2222-2222-2222-222222222222/multa.pdf',
        'multa.pdf', 'application/pdf', 120000, 'documento', 'tecnica', test.id('salvi'));

select test.ok('p2_adjuntos', 'Administración adjunta un archivo a una tarjeta',
  (select count(*) = 1 from public.documents
    where internal_task_id = 'f2222222-2222-2222-2222-222222222222'));

select test.ok('p2_adjuntos', 'Y el tablero lo cuenta, sin preguntar archivo por archivo',
  (select adjuntos = 1 from public.internal_board
    where id = 'f2222222-2222-2222-2222-222222222222'),
  (select adjuntos::text from public.internal_board
    where id = 'f2222222-2222-2222-2222-222222222222'));

-- Archivar y recuperar no se lleva los adjuntos por delante.
select public.archive_internal_task('f2222222-2222-2222-2222-222222222222');
select public.restore_internal_task('f2222222-2222-2222-2222-222222222222');

select test.ok('p2_adjuntos', 'Archivar y recuperar la tarjeta conserva sus adjuntos',
  (select adjuntos = 1 from public.internal_board
    where id = 'f2222222-2222-2222-2222-222222222222'));

-- La carpeta «internas/» no la conoce la función de permisos del
-- almacén, así que un trabajador no llega. Se comprueba la función.
set role authenticated; select test.as_user(test.id('juan'));

select test.ok('p2_adjuntos', 'Un trabajador NO puede leer los adjuntos de una tarjeta',
  not public.storage_can_read('internas/f2222222-2222-2222-2222-222222222222/multa.pdf'));

select test.ok('p2_adjuntos', 'Ni subir nada a esa carpeta',
  not public.storage_can_upload('internas/f2222222-2222-2222-2222-222222222222/otro.pdf'));

select test.ok('p2_adjuntos', 'Ni ve la fila del documento',
  (select count(*) = 0 from public.documents
    where internal_task_id = 'f2222222-2222-2222-2222-222222222222'));

\echo '== MEJORA 6 · ELIMINAR UNA TARJETA'

set role authenticated; select test.as_user(test.id('juan'));

select test.err('p2_eliminar', 'Un trabajador no elimina tarjetas',
  $$ select public.delete_internal_task('f2222222-2222-2222-2222-222222222222') $$, '42501');

set role authenticated; select test.as_user(test.id('salvi'));

-- Se le pone checklist y evento, para ver qué se lleva y qué no.
insert into public.internal_task_items (task_id, text, position)
values ('f2222222-2222-2222-2222-222222222222', 'Pagar la multa', 10)
on conflict do nothing;

select public.set_internal_task_event('f2222222-2222-2222-2222-222222222222',
  public.today_madrid(), 'Vence la multa', null);

select test.setnote('p2_nota',
  (select calendar_note_id::text from public.internal_tasks
    where id = 'f2222222-2222-2222-2222-222222222222'));

-- Y un archivo de OTRA tarjeta, que NO se puede llevar por delante.
insert into public.internal_tasks (id, list_id, title, position)
values ('f3333333-3333-3333-3333-333333333333',
        'f1111111-1111-1111-1111-111111111111', 'OTRA TARJETA', 20)
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name)
values ('documentos', 'internas/f3333333-3333-3333-3333-333333333333/otra.pdf')
on conflict do nothing;

insert into public.documents (internal_task_id, bucket, storage_path, file_name, mime_type,
                              size_bytes, category, scope, uploaded_by)
values ('f3333333-3333-3333-3333-333333333333', 'documentos',
        'internas/f3333333-3333-3333-3333-333333333333/otra.pdf',
        'otra.pdf', 'application/pdf', 5000, 'documento', 'tecnica', test.id('salvi'))
on conflict do nothing;

-- LO QUE IMPORTA: la función devuelve SOLO las rutas de esta tarjeta.
select test.setnote('p2_rutas',
  array_to_string(public.delete_internal_task('f2222222-2222-2222-2222-222222222222'), ','));

select test.ok('p2_eliminar', 'Devuelve SOLO las rutas de la tarjeta que se elimina',
  test.note('p2_rutas') = 'internas/f2222222-2222-2222-2222-222222222222/multa.pdf',
  test.note('p2_rutas'));

select test.ok('p2_eliminar', 'La tarjeta deja de existir',
  not exists (select 1 from public.internal_tasks
               where id = 'f2222222-2222-2222-2222-222222222222'));

select test.ok('p2_eliminar', 'Y no está ni en el tablero ni en las archivadas',
  not exists (select 1 from public.internal_board
               where id = 'f2222222-2222-2222-2222-222222222222'));

select test.ok('p2_eliminar', 'Su checklist se va con ella',
  not exists (select 1 from public.internal_task_items
               where task_id = 'f2222222-2222-2222-2222-222222222222'));

select test.ok('p2_eliminar', 'Y sus adjuntos también',
  not exists (select 1 from public.documents
               where internal_task_id = 'f2222222-2222-2222-2222-222222222222'));

/*
  Y LO QUE **NO** SE LLEVA, que es la parte que hay que vigilar.
*/
select test.ok('p2_eliminar', 'El evento del calendario NO se borra: sigue en el calendario',
  exists (select 1 from public.calendar_notes where id = test.note('p2_nota')::uuid),
  'el evento ha desaparecido del calendario');

select test.ok('p2_eliminar', 'Y sigue saliendo en el calendario de todos',
  exists (select 1 from public.v_calendar
           where id = test.note('p2_nota')::uuid and kind = 'otro'));

select test.ok('p2_eliminar', 'El archivo de OTRA tarjeta no se ha tocado',
  exists (select 1 from public.documents
           where internal_task_id = 'f3333333-3333-3333-3333-333333333333'));

select test.err('p2_eliminar', 'Eliminar algo que ya no está lo dice, no calla',
  $$ select public.delete_internal_task('f2222222-2222-2222-2222-222222222222') $$, 'P0002');

\echo '== MEJORA 5 · QUITAR UN ADJUNTO, Y SOLO DE UNA TARJETA'

select test.setnote('p2_doc_otra',
  (select id::text from public.documents
    where internal_task_id = 'f3333333-3333-3333-3333-333333333333'));

select public.delete_internal_task_file(test.note('p2_doc_otra')::uuid);

select test.ok('p2_adjuntos', 'Se quita un adjunto de una tarjeta',
  not exists (select 1 from public.documents
               where internal_task_id = 'f3333333-3333-3333-3333-333333333333'));

/*
  LA COMPROBACIÓN QUE IMPIDE EL DESASTRE.

  Esta función borra de «documents» de verdad, saltándose la papelera.
  Sin la condición de que el documento sea de una tarjeta, valdría para
  borrar el plano de cualquier obra. Se comprueba con un documento que
  NO es de una tarjeta.
*/
select test.err('p2_adjuntos', 'Pero NO sirve para borrar un documento de otra cosa',
  format($$ select public.delete_internal_task_file(%L) $$,
    (select id from public.documents
      where ficha_id = 'd1111111-1111-1111-1111-111111111111' limit 1)), '22023');

select test.ok('p2_adjuntos', 'Y ese documento sigue donde estaba',
  (select count(*) = 2 from public.documents
    where ficha_id = 'd1111111-1111-1111-1111-111111111111'));

set role authenticated; select test.as_user(test.id('juan'));
select test.err('p2_adjuntos', 'Un trabajador tampoco puede usarla',
  format($$ select public.delete_internal_task_file(%L) $$,
    (select id from public.documents
      where ficha_id = 'd1111111-1111-1111-1111-111111111111' limit 1)), '42501');

reset role; select test.as_server();
