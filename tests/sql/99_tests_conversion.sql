-- =====================================================================
-- METALPLAFER360 · CONVERTIR UN PRESUPUESTO SIN PERDER NADA
--
-- Las pruebas de la fase 3 ya comprueban que la conversión copia
-- cliente, importe, dirección y nombre, que deja constancia del origen y
-- que no se puede hacer dos veces. Lo que NO comprobaba nadie es lo
-- único que de verdad se perdía: LOS ARCHIVOS.
--
-- Lo que importa aquí:
--
--   · que las fotos y los documentos subidos al presupuesto se vean
--     desde el proyecto, y que se puedan abrir (misma ruta, mismo
--     contenedor);
--   · que NO se duplique ni un archivo: una fila en «documents» y una
--     ruta en el almacén, no dos;
--   · que se diga DE DÓNDE viene cada uno;
--   · que un error posterior no deje el proyecto a medio crear;
--   · que un segundo intento no cree un segundo proyecto ni duplique los
--     archivos;
--   · que los proyectos convertidos ANTES de esta mejora también vean
--     los archivos de su presupuesto, sin tocar ni una fila;
--   · y que los permisos NO cambien: la vista no deja ver a nadie nada
--     que no pudiera ver ya.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== CONVERSIÓN · LOS ARCHIVOS DEL PRESUPUESTO SE VEN DESDE EL PROYECTO'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

-- Un presupuesto nuevo, con sus papeles y sus fotos, como el que entra
-- de verdad: el plano que mandó el cliente y dos fotos de la medición.
with f as (
  insert into public.fichas (type, client_id, title, description, address, amount)
  values ('presupuesto', test.id('cli_laura'), 'Escalera metálica de caracol',
          'Escalera de caracol con peldaños de tramex.',
          'Carrer del Sol, 22 · Sabadell', 7400)
  returning id)
select test.put('cv_pres', (select id from f));

-- El estado inicial lo pone un disparador, así que se cambia después.
update public.fichas set status = 'aceptado' where id = test.id('cv_pres');

insert into public.documents (ficha_id, storage_path, file_name, size_bytes,
                              category, uploaded_by, scope)
values (test.id('cv_pres'),
        'fichas/' || test.id('cv_pres') || '/plano-escalera.pdf',
        'plano-escalera.pdf', 51200, 'documento', test.id('salvi'), 'tecnica'),
       (test.id('cv_pres'),
        'fichas/' || test.id('cv_pres') || '/medicion-1.jpg',
        'medicion-1.jpg', 820000, 'foto', test.id('salvi'), 'tecnica'),
       (test.id('cv_pres'),
        'fichas/' || test.id('cv_pres') || '/medicion-2.jpg',
        'medicion-2.jpg', 790000, 'foto', test.id('salvi'), 'tecnica');

-- Y un comentario, para comprobar que la ficha NO se vacía al convertir.
insert into public.comments (ficha_id, author_id, body)
values (test.id('cv_pres'), test.id('salvi'), 'El cliente acepta por teléfono.');

-- Uno en la papelera: no tiene que salir en el proyecto.
with d as (
  insert into public.documents (ficha_id, storage_path, file_name, size_bytes,
                                category, uploaded_by, scope)
  values (test.id('cv_pres'),
          'fichas/' || test.id('cv_pres') || '/version-antigua.pdf',
          'version-antigua.pdf', 4096, 'documento', test.id('salvi'), 'tecnica')
  returning id)
select test.put('cv_doc_papelera', (select id from d));
select public.trash_document(test.id('cv_doc_papelera'));

select test.setnote('cv_docs_antes',
  (select count(*)::text from public.documents where ficha_id = test.id('cv_pres')));

-- LA CONVERSIÓN.
select test.put('cv_proy', public.convert_budget_to_project(test.id('cv_pres')));

select test.ok('conv_datos', 'El proyecto nace con el cliente del presupuesto',
  (select p.client_id = f.client_id
     from public.projects p join public.fichas f on f.id = p.source_ficha_id
    where p.id = test.id('cv_proy')),
  (select format('proyecto %s · presupuesto %s',
                 (select client_id from public.projects where id = test.id('cv_proy')),
                 (select client_id from public.fichas where id = test.id('cv_pres')))));

select test.ok('conv_datos', 'Y con su importe, dirección y descripción',
  (select p.budget_amount = 7400
      and p.address = 'Carrer del Sol, 22 · Sabadell'
      and p.description like '%tramex%'
     from public.projects p where p.id = test.id('cv_proy')));

-- LA COMPROBACIÓN QUE IMPORTA: los archivos.
select test.ok('conv_archivos', 'Los tres archivos del presupuesto se ven desde el proyecto',
  (select count(*) = 3 from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('cv_proy')),
  (select coalesce(string_agg(file_name, ', '), '(ninguno)') from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('cv_proy')));

select test.ok('conv_archivos', 'Las dos fotos entre ellos: no se pierden las imágenes',
  (select count(*) = 2 from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('cv_proy') and category = 'foto'));

select test.ok('conv_archivos', 'El de la papelera NO sale',
  not exists (select 1 from public.related_documents
               where para_tipo = 'proyecto' and para_id = test.id('cv_proy')
                 and file_name = 'version-antigua.pdf'));

-- «Se pueden abrir» quiere decir esto: que llegan el contenedor y la
-- ruta exactos con los que se subieron. Con eso la pantalla pide el
-- enlace firmado igual que para un archivo propio.
select test.ok('conv_archivos', 'Llegan con su contenedor y su ruta, así que se pueden abrir',
  (select bool_and(r.bucket = d.bucket and r.storage_path = d.storage_path
                   and r.size_bytes = d.size_bytes and r.mime_type is not distinct from d.mime_type)
     from public.related_documents r
     join public.documents d on d.id = r.id
    where r.para_tipo = 'proyecto' and r.para_id = test.id('cv_proy')));

select test.ok('conv_archivos', 'Y diciendo de qué presupuesto vienen',
  (select bool_and(origen_tipo = 'presupuesto'
                   and origen_id = test.id('cv_pres')
                   and origen_code = (select code from public.fichas where id = test.id('cv_pres'))
                   and origen_fecha is not null)
     from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('cv_proy')));

-- NINGÚN ARCHIVO DUPLICADO. Es la razón de que esto sea una vista y no
-- una copia de filas.
select test.ok('conv_archivos', 'No se ha creado ni una fila más en «documents»',
  (select count(*)::text from public.documents where ficha_id = test.id('cv_pres'))
    = test.note('cv_docs_antes'),
  format('antes %s, ahora %s', test.note('cv_docs_antes'),
         (select count(*)::text from public.documents where ficha_id = test.id('cv_pres'))));

select test.ok('conv_archivos', 'Ni un solo archivo cuelga del proyecto: siguen siendo del presupuesto',
  (select count(*) = 0 from public.documents where project_id = test.id('cv_proy')));

-- No se busca si hay rutas repetidas: no puede haberlas, porque
-- «storage_path» es único. Se comprueba esa garantía, que es la razón de
-- que copiar filas para «llevarse» los archivos no fuera una opción.
select test.ok('conv_archivos', 'Y la base de datos no admitiría dos filas con la misma ruta',
  exists (select 1 from pg_constraint
           where conrelid = 'public.documents'::regclass and contype = 'u'
             and pg_get_constraintdef(oid) like '%storage_path%'),
  (select string_agg(conname, ', ') from pg_constraint
    where conrelid = 'public.documents'::regclass and contype = 'u'));

-- Y la ficha se conserva TAL CUAL, que es lo que se le promete a quien
-- convierte.
select test.ok('conv_datos', 'El presupuesto se conserva con sus archivos y sus comentarios',
  (select count(*) = 4 from public.documents where ficha_id = test.id('cv_pres'))
  and (select count(*) = 1 from public.comments where ficha_id = test.id('cv_pres')));

select test.ok('conv_datos', 'Y sigue siendo un presupuesto aceptado, sin archivar',
  (select status = 'aceptado' and archived_at is null and type = 'presupuesto'
     from public.fichas where id = test.id('cv_pres')));


\echo '== CONVERSIÓN · UN SEGUNDO INTENTO NO DUPLICA NADA'

select test.err('conv_repetir', 'El segundo intento se rechaza',
  $$select public.convert_budget_to_project(test.id('cv_pres'))$$, '23505');

select test.ok('conv_repetir', 'Y sigue habiendo UN solo proyecto para ese presupuesto',
  (select count(*) = 1 from public.projects where source_ficha_id = test.id('cv_pres')),
  (select count(*)::text from public.projects where source_ficha_id = test.id('cv_pres')));

select test.ok('conv_repetir', 'Los archivos tampoco se duplican al reintentarlo',
  (select count(*) = 3 from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('cv_proy')));

-- Con un nombre distinto tampoco: lo que lo impide es el presupuesto de
-- origen, no el nombre.
select test.err('conv_repetir', 'Ni cambiándole el nombre al proyecto',
  $$select public.convert_budget_to_project(test.id('cv_pres'), 'Otro nombre')$$, '23505');

select test.ok('conv_repetir', 'La restricción de la base de datos lo impide por su cuenta',
  (select count(*) = 1 from pg_constraint
    where conrelid = 'public.projects'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) like '%source_ficha_id%'),
  (select string_agg(conname || ' ' || pg_get_constraintdef(oid), ' | ')
     from pg_constraint where conrelid = 'public.projects'::regclass and contype = 'u'));


\echo '== CONVERSIÓN · UN ERROR NO DEJA NADA A MEDIAS'

-- Un presupuesto más, para provocar el fallo sobre él.
with f as (
  insert into public.fichas (type, client_id, title, amount)
  values ('presupuesto', test.id('cli_laura'), 'Barandilla que no llega a proyecto', 1500)
  returning id)
select test.put('cv_pres_fallo', (select id from f));
update public.fichas set status = 'aceptado' where id = test.id('cv_pres_fallo');

-- Se convierte y acto seguido algo falla. Lo que se comprueba es que el
-- proyecto NO se queda creado: la conversión entera se deshace.
--
-- El bloque de plpgsql tiene su propio punto de retorno, así que cuando
-- la excepción se captura se deshace todo lo que hizo dentro. Es el
-- mismo mecanismo que protege a la conversión de verdad si falla a mitad
-- de camino.
do $$
begin
  perform public.convert_budget_to_project(test.id('cv_pres_fallo'));
  raise exception 'se simula un error posterior a la conversión';
exception when others then
  null;
end $$;

select test.ok('conv_errores', 'Tras un error posterior no queda ningún proyecto creado',
  (select count(*) = 0 from public.projects where source_ficha_id = test.id('cv_pres_fallo')),
  (select string_agg(code, ', ') from public.projects
    where source_ficha_id = test.id('cv_pres_fallo')));

select test.ok('conv_errores', 'Y el presupuesto sigue intacto y convertible',
  (select status = 'aceptado' and archived_at is null
     from public.fichas where id = test.id('cv_pres_fallo')));

-- Y ahora sí: después del fallo se puede convertir con normalidad.
select test.put('cv_proy_fallo',
  public.convert_budget_to_project(test.id('cv_pres_fallo')));

select test.ok('conv_errores', 'Se convierte sin problemas en el siguiente intento',
  (select count(*) = 1 from public.projects where source_ficha_id = test.id('cv_pres_fallo')));


\echo '== CONVERSIÓN · LOS PROYECTOS DE ANTES'

-- «proy_conv» se convirtió en las pruebas de la fase 3, mucho antes de
-- esta mejora. Se le suben archivos AL PRESUPUESTO y tienen que verse
-- desde el proyecto igual: la mejora no necesita migrar ni una fila.
insert into public.documents (ficha_id, storage_path, file_name, size_bytes,
                              category, uploaded_by, scope)
values (test.id('pres1'),
        'fichas/' || test.id('pres1') || '/croquis-antiguo.pdf',
        'croquis-antiguo.pdf', 2048, 'documento', test.id('salvi'), 'tecnica');

select test.ok('conv_antiguos', 'Un proyecto convertido hace meses también los ve',
  (select count(*) >= 1 from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('proy_conv')
      and file_name = 'croquis-antiguo.pdf'));

select test.ok('conv_antiguos', 'Un proyecto que no viene de ningún presupuesto no hereda nada',
  (select count(*) = 0 from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('proy1')));

select test.ok('conv_antiguos', 'Y preguntarlo no da error ni para un proyecto que no existe',
  public.related_documents_count('proyecto', gen_random_uuid()) = 0);

select test.ok('conv_antiguos', 'El contador dice lo mismo que la lista',
  public.related_documents_count('proyecto', test.id('cv_proy')) = 3,
  public.related_documents_count('proyecto', test.id('cv_proy'))::text);


\echo '== CONVERSIÓN · LOS PERMISOS NO CAMBIAN'

-- LA REGLA: la vista se ejecuta con los permisos de quien pregunta, así
-- que no concede NADA que no estuviera concedido ya.
--
-- Y lo que hay concedido ya es esto, comprobado contra el catálogo y no
-- supuesto: la política «projects_select» es «is_admin()», así que un
-- trabajador no lee la tabla «projects» ni asignado a un proyecto —su
-- lista de proyectos le llega por otro camino, hecho para él—. Como la
-- vista pasa por «projects», a un trabajador le devuelve cero filas
-- SIEMPRE. Es decir: lo heredado es cosa de administración, que es
-- justo donde se pide.
--
-- Se asigna a Juan al proyecto a propósito, para que quede claro que ni
-- estando asignado se ve nada: no es que falte la asignación.
reset role; select test.as_server();
insert into public.project_workers (project_id, worker_id)
values (test.id('cv_proy'), test.id('juan'))
on conflict do nothing;

set role authenticated; select test.as_user(test.id('juan'));

select test.ok('conv_permisos', 'La política de proyectos es solo de administración',
  (select pg_get_expr(polqual, polrelid) = 'is_admin()'
     from pg_policy where polrelid = 'public.projects'::regclass
      and polname = 'projects_select'),
  (select pg_get_expr(polqual, polrelid) from pg_policy
    where polrelid = 'public.projects'::regclass and polname = 'projects_select'));

select test.ok('conv_permisos', 'Un trabajador asignado al proyecto no hereda nada por la vista',
  (select count(*) = 0 from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('cv_proy')),
  (select string_agg(file_name, ', ') from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('cv_proy')));

select test.ok('conv_permisos', 'Y tampoco puede leer los archivos del presupuesto por su cuenta',
  (select count(*) = 0 from public.documents where ficha_id = test.id('cv_pres')));

-- La segunda cerradura: que lo que lo impide sea la política y no la
-- vista. Se comprueba leyendo la vista SIN SESIÓN desde el servidor, que
-- es cuando las políticas no filtran: ahí sí tiene que haber filas, y
-- así se sabe que la vista funciona y que lo que la vacía para el
-- trabajador es el permiso.
reset role; select test.as_server();
select test.ok('conv_permisos', 'Sin políticas de por medio, la vista sí devuelve los archivos',
  (select count(*) = 3 from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('cv_proy')),
  (select count(*)::text from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('cv_proy')));

set role authenticated; select test.as_user(test.id('juan'));

set role anon; select test.as_anon();
select test.err('conv_permisos', 'Sin sesión no se ve nada de esto',
  'select count(*) from public.related_documents', '42501');

reset role; select test.as_server();
