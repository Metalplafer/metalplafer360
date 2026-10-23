-- =====================================================================
-- METALPLAFER360 · BANDEJA DE ENTRADA DE SOLICITUDES POR CORREO
--
-- Lo que importa aquí:
--
--   · que recibir un correo cree UNA ficha provisional y NADA MÁS: ni
--     presupuesto, ni visita, ni aviso;
--   · que el mismo correo recibido dos veces no cree dos solicitudes,
--     porque el proveedor reintenta;
--   · que los adjuntos sean archivos normales, con un solo dueño;
--   · que un adjunto que falla NO haga desaparecer el correo;
--   · que el remitente original se conserve y que, cuando no se sabe,
--     quede dicho que hay que revisarlo;
--   · que la conversión sea manual y conserve la solicitud y el correo;
--   · que los archivos del correo se vean desde el presupuesto que sale
--     de él, sin copiarse;
--   · y que solo el SERVIDOR pueda meter solicitudes, y solo
--     administración revisarlas.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== SOLICITUDES · RECIBIR UN CORREO'

reset role; select test.as_server();

-- Se cuenta lo que hay ANTES de recibir nada. No se puede usar «creado
-- en los últimos cinco segundos»: la batería entera se ejecuta en unos
-- segundos y eso cuenta las fichas de todas las pruebas anteriores.
select test.setnote('sol_fichas_antes', (select count(*)::text from public.fichas));
select test.setnote('sol_proy_antes',   (select count(*)::text from public.projects));

select test.put('sol_1', (public.receive_mail_request(
  'MSG-0001@correo-cliente.com',
  'Presupuesto para una barandilla',
  'Buenos días, necesitaría presupuesto para una barandilla de 12 metros.',
  '<p>Buenos días…</p>',
  'laura@construccionessoler.es', 'Laura Soler',
  'peticiones@metalplafer.com',
  now(), false, null, null, null, false)).id);

select test.ok('sol_recibir', 'El correo entra como solicitud, con su código',
  (select code ~ ('^SOL-' || extract(year from public.today_madrid())::int || '-[0-9]{3}$')
     from public.mail_requests where id = test.id('sol_1')),
  (select code from public.mail_requests where id = test.id('sol_1')));

select test.ok('sol_recibir', 'Y nace PENDIENTE de revisión',
  (select status = 'pendiente' from public.mail_requests where id = test.id('sol_1')));

select test.ok('sol_recibir', 'Se guarda el asunto, el cuerpo y el remitente',
  (select subject = 'Presupuesto para una barandilla'
      and body_text like '%12 metros%'
      and body_html like '%Buenos días%'
      and sender_email = 'laura@construccionessoler.es'
      and sender_name = 'Laura Soler'
      and recipients = 'peticiones@metalplafer.com'
     from public.mail_requests where id = test.id('sol_1')));

-- LO QUE NO TIENE QUE PASAR: que recibir un correo cree registros.
select test.ok('sol_recibir', 'NO se ha creado ningún presupuesto, visita ni aviso',
  (select count(*)::text from public.fichas) = test.note('sol_fichas_antes'),
  format('antes %s, ahora %s', test.note('sol_fichas_antes'),
         (select count(*)::text from public.fichas)));

select test.ok('sol_recibir', 'Ni ningún proyecto',
  (select count(*)::text from public.projects) = test.note('sol_proy_antes'),
  format('antes %s, ahora %s', test.note('sol_proy_antes'),
         (select count(*)::text from public.projects)));

select test.ok('sol_recibir', 'El historial dice que entró un correo',
  exists (select 1 from public.audit_log
           where action = 'correo_recibido'
             and entity_code = (select code from public.mail_requests where id = test.id('sol_1'))
             and summary like '%Entró una solicitud por correo%'),
  (select summary from public.audit_log where action = 'correo_recibido'
    order by id desc limit 1));

-- El cliente se SUGIERE si el correo coincide, pero no se revisa solo.
reset role; select test.as_server();
update public.clients set email = 'pepe@tallerespepe.es'
 where id = test.id('cli_laura');

select test.put('sol_cli', (public.receive_mail_request(
  'MSG-0002@tallerespepe.es', 'Reja', 'Hola', null,
  'pepe@tallerespepe.es', 'Pepe', 'peticiones@metalplafer.com',
  now(), false, null, null, null, false)).id);

select test.ok('sol_recibir', 'Si el remitente es un cliente que ya tenemos, se sugiere',
  (select client_id = test.id('cli_laura')
     from public.mail_requests where id = test.id('sol_cli')));

select test.ok('sol_recibir', 'Pero la solicitud sigue PENDIENTE: sugerir no es clasificar',
  (select status = 'pendiente' from public.mail_requests where id = test.id('sol_cli')));


\echo '== SOLICITUDES · EL MISMO CORREO DOS VECES'

select test.setnote('sol_antes', (select count(*)::text from public.mail_requests));

-- El proveedor reintenta: la misma llamada, otra vez.
select test.put('sol_1_bis', (public.receive_mail_request(
  'MSG-0001@correo-cliente.com', 'Presupuesto para una barandilla',
  'Buenos días…', null, 'laura@construccionessoler.es', 'Laura Soler',
  'peticiones@metalplafer.com', now(), false, null, null, null, false)).id);

select test.ok('sol_dedup', 'Un reintento devuelve LA MISMA solicitud',
  test.id('sol_1_bis') = test.id('sol_1'));

select test.ok('sol_dedup', 'Y no crea ninguna fila más',
  (select count(*)::text from public.mail_requests) = test.note('sol_antes'),
  format('antes %s, ahora %s', test.note('sol_antes'),
         (select count(*)::text from public.mail_requests)));

select test.ok('sol_dedup', 'El identificador del mensaje es único: la base de datos lo impone',
  exists (select 1 from pg_constraint
           where conrelid = 'public.mail_requests'::regclass and contype = 'u'
             and pg_get_constraintdef(oid) like '%provider_message_id%'));

select test.err('sol_dedup', 'Un correo sin identificador se rechaza',
  $$select public.receive_mail_request('   ', 'Sin id', 'Hola')$$, '22023');


\echo '== SOLICITUDES · UN CORREO REENVIADO'

select test.put('sol_rv', (public.receive_mail_request(
  'MSG-0003@metalplafer.com',
  'RV: Puerta de garaje',
  '-----Mensaje original-----' || chr(10) ||
  'De: Marta Ribas <marta@ribasobres.cat>' || chr(10) ||
  'Asunto: Puerta de garaje' || chr(10) || chr(10) || 'Buenos días…',
  null,
  'administracion@metalplafer.com', 'Administración',
  'peticiones@metalplafer.com',
  now(), true, 'marta@ribasobres.cat', 'Marta Ribas', 'Puerta de garaje', false)).id);

select test.ok('sol_recibir', 'En un reenvío se guardan los DOS remitentes',
  (select forwarded
      and sender_email = 'administracion@metalplafer.com'
      and original_sender_email = 'marta@ribasobres.cat'
      and original_sender_name = 'Marta Ribas'
      and original_subject = 'Puerta de garaje'
     from public.mail_requests where id = test.id('sol_rv')));

-- Y cuando no se puede saber, se dice.
select test.put('sol_rv2', (public.receive_mail_request(
  'MSG-0004@metalplafer.com', 'RV: una cosa', 'Mira esto.', null,
  'administracion@metalplafer.com', 'Administración', 'peticiones@metalplafer.com',
  now(), true, null, null, null, true)).id);

select test.ok('sol_recibir', 'Si no se sabe quién lo mandó, queda pendiente de revisar',
  (select sender_needs_review and original_sender_email is null
     from public.mail_requests where id = test.id('sol_rv2')));


\echo '== SOLICITUDES · LOS ADJUNTOS SON ARCHIVOS NORMALES'

select test.put('sol_doc', (public.attach_mail_document(
  test.id('sol_1'),
  'mail/' || test.id('sol_1') || '/plano-barandilla.pdf',
  'plano barandilla.pdf', 51200, 'application/pdf')).id);

select test.ok('sol_adjuntos', 'El adjunto queda registrado como documento de la solicitud',
  (select mail_request_id = test.id('sol_1') and bucket = 'documentos'
      and file_name = 'plano barandilla.pdf' and size_bytes = 51200
      and category = 'documento' and scope = 'tecnica'
     from public.documents where id = test.id('sol_doc')));

select test.ok('sol_adjuntos', 'Y cuelga SOLO de la solicitud: un archivo tiene un dueño',
  (select ficha_id is null and project_id is null and order_id is null
      and report_id is null and work_id is null
     from public.documents where id = test.id('sol_doc')));

-- Una foto se guarda como foto, para que salga en la galería.
select public.attach_mail_document(
  test.id('sol_1'), 'mail/' || test.id('sol_1') || '/medicion.jpg',
  'medicion.jpg', 820000, 'image/jpeg');

select test.ok('sol_adjuntos', 'Una imagen se guarda con categoría de foto',
  (select category = 'foto' from public.documents
    where storage_path = 'mail/' || test.id('sol_1') || '/medicion.jpg'));

-- En dos pasos: acceder a un campo del resultado de una función
-- compuesta dentro de un «where» la hace evaluar de maneras que no
-- conviene dar por supuestas.
select public.attach_mail_document(
  test.id('sol_1'), 'mail/' || test.id('sol_1') || '/obra.mp4',
  'obra.mp4', 9000000, 'video/mp4');

select test.ok('sol_adjuntos', 'Y un vídeo, de vídeo',
  (select category = 'video' from public.documents
    where storage_path = 'mail/' || test.id('sol_1') || '/obra.mp4'),
  (select category::text from public.documents
    where storage_path = 'mail/' || test.id('sol_1') || '/obra.mp4'));

-- Idempotente: el reintento del proveedor no duplica el archivo.
select test.setnote('sol_docs_antes',
  (select count(*)::text from public.documents where mail_request_id = test.id('sol_1')));
select public.attach_mail_document(
  test.id('sol_1'), 'mail/' || test.id('sol_1') || '/plano-barandilla.pdf',
  'plano barandilla.pdf', 51200, 'application/pdf');
select test.ok('sol_adjuntos', 'Registrar el mismo archivo dos veces no lo duplica',
  (select count(*)::text from public.documents where mail_request_id = test.id('sol_1'))
    = test.note('sol_docs_antes'));

select test.err('sol_adjuntos', 'Un adjunto de una solicitud que no existe se rechaza',
  format($$select public.attach_mail_document(%L, 'mail/x/y.pdf', 'y.pdf', 10, 'application/pdf')$$,
         gen_random_uuid()), 'P0002');

-- La restricción de siempre, con la columna nueva dentro.
select test.err('sol_adjuntos', 'Un archivo no puede ser de una solicitud Y de un proyecto',
  format($$insert into public.documents (mail_request_id, project_id, storage_path,
                                         file_name, size_bytes, category)
           values (%L, %L, 'mail/dos-duenos.pdf', 'dos.pdf', 10, 'documento')$$,
         test.id('sol_1'), test.id('proy1')), '23514');

select test.ok('sol_adjuntos', 'La restricción de un solo dueño cuenta las seis columnas',
  (select pg_get_constraintdef(oid) like '%mail_request_id%'
     from pg_constraint where conname = 'documents_one_owner'),
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'documents_one_owner'));


\echo '== SOLICITUDES · UN ADJUNTO QUE FALLA NO PIERDE EL CORREO'

select public.mark_mail_request_error(test.id('sol_rv2'),
  'No se han podido guardar 1 adjunto(s): «video.mp4»: ocupa 40,0 MB y el máximo es 25 MB');

select test.ok('sol_error', 'La solicitud se queda, marcada en error y diciendo qué pasó',
  (select status = 'error' and error_detail like '%40,0 MB%'
      and body_text = 'Mira esto.'
     from public.mail_requests where id = test.id('sol_rv2')),
  (select format('%s · %s', status, error_detail)
     from public.mail_requests where id = test.id('sol_rv2')));

select public.mark_mail_request_error(test.id('sol_rv2'), repeat('x', 900));
select test.ok('sol_error', 'El detalle se recorta: en los registros no cabe un correo entero',
  (select length(error_detail) <= 500 from public.mail_requests
    where id = test.id('sol_rv2')),
  (select length(error_detail)::text from public.mail_requests
    where id = test.id('sol_rv2')));

select public.mark_mail_request_error(test.id('sol_rv2'), 'otro intento igual de mal');
select test.ok('sol_error', 'Un reintento que vuelve a fallar no cambia el estado',
  (select status = 'error' from public.mail_requests where id = test.id('sol_rv2')));


\echo '== SOLICITUDES · REVISAR A MANO'

set role authenticated; select test.as_user(test.id('salvi'));

select public.review_mail_request(test.id('sol_1'), test.id('cli_garcia'),
  'Llamada el martes: quiere acabado negro forja.');

select test.ok('sol_revisar', 'Queda revisada, con su cliente y sus observaciones',
  (select status = 'revisada' and client_id = test.id('cli_garcia')
      and notes like '%negro forja%'
      and reviewed_by = test.id('salvi') and reviewed_at is not null
     from public.mail_requests where id = test.id('sol_1')));

select test.ok('sol_revisar', 'Revisar NO crea ningún registro definitivo',
  (select target_ficha_id is null and target_project_id is null
     from public.mail_requests where id = test.id('sol_1')));

select test.ok('sol_revisar', 'Y el historial lo cuenta con el nombre del cliente',
  exists (select 1 from public.audit_log
           where action = 'revisar_solicitud' and summary like '%revisó la solicitud SOL-%cliente:%'),
  (select summary from public.audit_log where action = 'revisar_solicitud'
    order by id desc limit 1));

-- Escribir el remitente que faltaba quita el aviso.
select public.review_mail_request(test.id('sol_rv2'), null, null,
  'ana@obrescat.cat', 'Ana Puig');

select test.ok('sol_revisar', 'Escribir a mano el remitente que faltaba quita el aviso',
  (select not sender_needs_review and original_sender_email = 'ana@obrescat.cat'
      and original_sender_name = 'Ana Puig'
     from public.mail_requests where id = test.id('sol_rv2')));

select test.ok('sol_revisar', 'Y al revisarla deja de estar en error',
  (select status = 'revisada' and error_detail is null
     from public.mail_requests where id = test.id('sol_rv2')));

select test.err('sol_revisar', 'No se puede poner un cliente que no existe',
  format($$select public.review_mail_request(%L, %L)$$,
         test.id('sol_1'), gen_random_uuid()), 'P0002');

select test.err('sol_revisar', 'Ni una solicitud que no existe',
  format($$select public.review_mail_request(%L)$$, gen_random_uuid()), 'P0002');


\echo '== SOLICITUDES · CONVERTIRLA ES MANUAL'

-- La pantalla crea el presupuesto con el formulario de siempre…
with f as (
  insert into public.fichas (type, client_id, title, description, amount)
  values ('presupuesto', test.id('cli_garcia'), 'Barandilla de 12 metros',
          'Del correo de Laura.', 4200)
  returning id)
select test.put('sol_pres', (select id from f));

-- …y después se vincula.
select public.link_mail_request(test.id('sol_1'), test.id('sol_pres'), null);

select test.ok('sol_vincular', 'La solicitud queda vinculada a su presupuesto',
  (select status = 'vinculada' and target_ficha_id = test.id('sol_pres')
      and target_project_id is null
     from public.mail_requests where id = test.id('sol_1')));

select test.ok('sol_vincular', 'La ficha provisional NO se borra',
  (select count(*) = 1 from public.mail_requests where id = test.id('sol_1')));

select test.ok('sol_vincular', 'Y el correo original se conserva entero',
  (select body_text like '%12 metros%' and subject is not null
      and sender_email = 'laura@construccionessoler.es'
     from public.mail_requests where id = test.id('sol_1')));

select test.ok('sol_vincular', 'El historial dice a qué se vinculó',
  exists (select 1 from public.audit_log
           where action = 'vincular_solicitud'
             and summary like '%vinculó la solicitud SOL-%a PRES-%'),
  (select summary from public.audit_log where action = 'vincular_solicitud'
    order by id desc limit 1));

-- Repetir la misma vinculación no hace nada.
select test.setnote('sol_apuntes',
  (select count(*)::text from public.audit_log where action = 'vincular_solicitud'));
select public.link_mail_request(test.id('sol_1'), test.id('sol_pres'), null);
select test.ok('sol_vincular', 'Vincularla otra vez al mismo sitio no repite el apunte',
  (select count(*)::text from public.audit_log where action = 'vincular_solicitud')
    = test.note('sol_apuntes'));

select test.err('sol_vincular', 'No se vincula a una ficha y a un proyecto a la vez',
  format($$select public.link_mail_request(%L, %L, %L)$$,
         test.id('sol_cli'), test.id('sol_pres'), test.id('proy1')), '22023');

select test.err('sol_vincular', 'Ni a un destino que no existe',
  format($$select public.link_mail_request(%L, %L, null)$$,
         test.id('sol_cli'), gen_random_uuid()), 'P0002');

select test.err('sol_vincular', 'Ni sin decir a qué',
  format($$select public.link_mail_request(%L)$$, test.id('sol_cli')), '22023');

-- Corregir una vinculación equivocada SÍ se puede, y queda dicho.
select public.link_mail_request(test.id('sol_1'), null, test.id('proy1'));
select test.ok('sol_vincular', 'Se puede corregir una vinculación equivocada',
  (select target_project_id = test.id('proy1') and target_ficha_id is null
     from public.mail_requests where id = test.id('sol_1')));

select test.ok('sol_vincular', 'Y el historial dice dónde estaba antes',
  exists (select 1 from public.audit_log
           where action = 'vincular_solicitud' and summary like '%antes estaba en PRES-%'),
  (select summary from public.audit_log where action = 'vincular_solicitud'
    order by id desc limit 1));

select public.link_mail_request(test.id('sol_1'), test.id('sol_pres'), null);

-- Y el estado no puede mentir: la base de datos no admite «vinculada»
-- sin destino, ni destino sin «vinculada».
reset role; select test.as_server();
select test.err('sol_vincular', 'No puede quedar «vinculada» sin destino',
  format($$update public.mail_requests set target_ficha_id = null where id = %L$$,
         test.id('sol_1')), '23514');

select test.err('sol_vincular', 'Ni con destino y otro estado',
  format($$update public.mail_requests set status = 'pendiente' where id = %L$$,
         test.id('sol_1')), '23514');

select test.err('sol_vincular', 'Ni con los dos destinos puestos a pelo',
  format($$update public.mail_requests
              set target_ficha_id = %L, target_project_id = %L where id = %L$$,
         test.id('sol_pres'), test.id('proy1'), test.id('sol_1')), '23514');

select test.err('sol_vincular', 'Y un estado inventado se rechaza',
  format($$update public.mail_requests set status = 'en_tramite' where id = %L$$,
         test.id('sol_cli')), '23514');


\echo '== SOLICITUDES · LOS ARCHIVOS DEL CORREO, DESDE EL PRESUPUESTO'

-- ESTO es el punto 9 del encargo: no hay dos sistemas de documentos.
select test.ok('sol_docs', 'El presupuesto ve los archivos que mandó el cliente por correo',
  (select count(*) = 3 from public.related_documents
    where para_tipo = 'presupuesto' and para_id = test.id('sol_pres')
      and origen_tipo = 'correo'),
  (select coalesce(string_agg(file_name, ', '), '(ninguno)')
     from public.related_documents
    where para_tipo = 'presupuesto' and para_id = test.id('sol_pres')));

select test.ok('sol_docs', 'Diciendo que vienen del correo, con el código de la solicitud',
  (select bool_and(origen_code = (select code from public.mail_requests where id = test.id('sol_1'))
                   and origen_fecha is not null)
     from public.related_documents
    where para_tipo = 'presupuesto' and para_id = test.id('sol_pres')
      and origen_tipo = 'correo'));

select test.ok('sol_docs', 'Sin copiar ni un archivo: siguen siendo de la solicitud',
  (select count(*) = 3 from public.documents where mail_request_id = test.id('sol_1'))
  and (select count(*) = 0 from public.documents where ficha_id = test.id('sol_pres')));

-- Y al convertir el presupuesto en proyecto, llegan hasta el proyecto.
set role authenticated; select test.as_user(test.id('salvi'));
update public.fichas set status = 'aceptado' where id = test.id('sol_pres');
select test.put('sol_proy', public.convert_budget_to_project(test.id('sol_pres')));

select test.ok('sol_docs', 'Y el proyecto que sale de ese presupuesto también los ve',
  (select count(*) = 3 from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('sol_proy')
      and origen_tipo = 'correo'),
  (select coalesce(string_agg(file_name || ' (' || origen_tipo || ')', ', '), '(ninguno)')
     from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('sol_proy')));

select test.ok('sol_docs', 'Y no se duplican por llegar por dos caminos',
  (select count(*) = count(distinct id) from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('sol_proy')));


\echo '== SOLICITUDES · DESCARTAR Y RECUPERAR'

select public.discard_mail_request(test.id('sol_rv'), 'Publicidad.');

select test.ok('sol_descartar', 'Una solicitud que no era una petición se descarta',
  (select status = 'descartada' and notes = 'Publicidad.'
     from public.mail_requests where id = test.id('sol_rv')));

select test.ok('sol_descartar', 'Pero NO se borra: el correo se conserva',
  (select body_text is not null and subject is not null
     from public.mail_requests where id = test.id('sol_rv')));

select test.err('sol_descartar', 'Una solicitud ya vinculada no se descarta',
  format($$select public.discard_mail_request(%L)$$, test.id('sol_1')), '22023');

select test.err('sol_descartar', 'Y una descartada no se revisa sin recuperarla antes',
  format($$select public.review_mail_request(%L)$$, test.id('sol_rv')), '22023');

select public.restore_mail_request(test.id('sol_rv'));
select test.ok('sol_descartar', 'Recuperarla la devuelve a pendiente',
  (select status = 'pendiente' from public.mail_requests where id = test.id('sol_rv')));

select test.err('sol_descartar', 'Solo se recuperan las descartadas',
  format($$select public.restore_mail_request(%L)$$, test.id('sol_1')), '22023');


\echo '== SOLICITUDES · LOS PERMISOS'

-- LO MÁS IMPORTANTE DE TODO: meter solicitudes es cosa del servidor. Si
-- cualquiera con sesión pudiera llamar a «receive_mail_request», podría
-- fabricar correos que parecieran de un cliente.
select test.err('sol_permisos', 'Con sesión de administración NO se pueden fabricar solicitudes',
  $$select public.receive_mail_request('MSG-FALSO@x.com', 'Falso', 'Hola')$$, '42501');

select test.err('sol_permisos', 'Ni colgar adjuntos a mano',
  format($$select public.attach_mail_document(%L, 'mail/x.pdf', 'x.pdf', 10, 'application/pdf')$$,
         test.id('sol_1')), '42501');

select test.err('sol_permisos', 'Ni marcar errores',
  format($$select public.mark_mail_request_error(%L, 'nada')$$, test.id('sol_1')), '42501');

select test.err('sol_permisos', 'Ni insertar en la tabla directamente',
  $$insert into public.mail_requests (code, provider_message_id)
    values ('SOL-9999-999', 'MSG-A-MANO')$$, '42501');

-- Un trabajador no ve la bandeja: es de administración, como las fichas.
set role authenticated; select test.as_user(test.id('juan'));

select test.ok('sol_permisos', 'Un trabajador no ve ninguna solicitud',
  (select count(*) = 0 from public.mail_requests),
  (select count(*)::text from public.mail_requests));

select test.err('sol_permisos', 'Ni puede revisarlas',
  format($$select public.review_mail_request(%L)$$, test.id('sol_1')), '42501');

select test.err('sol_permisos', 'Ni vincularlas',
  format($$select public.link_mail_request(%L, %L, null)$$,
         test.id('sol_cli'), test.id('sol_pres')), '42501');

select test.err('sol_permisos', 'Ni descartarlas',
  format($$select public.discard_mail_request(%L)$$, test.id('sol_cli')), '42501');

select test.ok('sol_permisos', 'Ni ve los adjuntos del correo',
  (select count(*) = 0 from public.documents where mail_request_id is not null),
  (select count(*)::text from public.documents where mail_request_id is not null));

-- Y los archivos del correo están en una carpeta que la función de
-- permisos del almacén NO conoce, así que solo administración los lee.
-- Se comprueba la función, no se supone.
select test.ok('sol_permisos', 'La carpeta «mail/» del almacén es solo de administración',
  not public.storage_can_read('mail/' || test.id('sol_1') || '/plano-barandilla.pdf'),
  'storage_can_read ha dicho que sí a un trabajador');

set role anon; select test.as_anon();
select test.err('sol_permisos', 'Sin sesión no se ve la bandeja',
  'select count(*) from public.mail_requests', '42501');
select test.err('sol_permisos', 'Ni se puede meter nada por la puerta de atrás',
  $$select public.receive_mail_request('MSG-ANON@x.com', 'x', 'y')$$, '42501');

reset role; select test.as_server();

select test.ok('sol_permisos', 'Administración sí ve la bandeja entera',
  (select count(*) >= 4 from public.mail_requests),
  (select count(*)::text from public.mail_requests));
