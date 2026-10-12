-- =====================================================================
-- METALPLAFER360 · PRUEBAS DEL BLOQUE 2
-- Categorías de documentación y borrado real.
--
-- Lo que se comprueba:
--   · que la documentación administrativa NO llegue al trabajador, ni
--     por consulta ni por enlace del almacén;
--   · que mover un documento de categoría quede anotado;
--   · que el borrado funcione de verdad cuando no hay nada que
--     proteger, y que se niegue —explicando qué pasa— cuando lo hay.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== BLOQUE 2 · DOS CATEGORÍAS DE DOCUMENTACIÓN'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

-- Proyecto propio de estas pruebas, con Pedro dentro.
with nuevo as (
  insert into public.projects (client_id, name, description, budget_amount,
                               budget_hours_fab, budget_hours_mont)
  values (test.id('cli_laura'), 'Puerta corredera del almacén',
          'Puerta corredera motorizada.', 5200, 20, 10)
  returning id)
select test.put('proy_b2', (select id from nuevo));

select public.assign_project_workers(test.id('proy_b2'), array[test.id('pedro')]);

with docs as (
  insert into public.documents (project_id, storage_path, file_name, size_bytes,
                                category, uploaded_by, scope)
  values (test.id('proy_b2'),
          'projects/' || test.id('proy_b2') || '/plano.pdf', 'plano-puerta.pdf', 2048,
          'documento', test.id('salvi'), 'tecnica'),
         (test.id('proy_b2'),
          'projects/' || test.id('proy_b2') || '/factura.pdf', 'factura-motor.pdf', 4096,
          'documento', test.id('salvi'), 'administrativa')
  returning id, scope)
select test.put('doc_tecnico', (select id from docs where scope = 'tecnica')),
       test.put('doc_admin',   (select id from docs where scope = 'administrativa'));

select test.ok('b2_docs', 'Un documento nace como técnico si no se dice otra cosa',
  (select scope from public.documents where id = test.id('doc_tecnico')) = 'tecnica');

select test.ok('b2_docs', 'Administración ve los dos',
  (select count(*) from public.documents where project_id = test.id('proy_b2')) = 2);


\echo '== BLOQUE 2 · EL TRABAJADOR NO ALCANZA LO ADMINISTRATIVO'

set role authenticated; select test.as_user(test.id('pedro'));

select test.ok('b2_seguridad', 'El trabajador ve la documentación técnica de su proyecto',
  exists (select 1 from public.documents where id = test.id('doc_tecnico')));

-- Lo que de verdad importa: no es que no se le enseñe, es que no se le
-- devuelve aunque lo pida expresamente.
select test.ok('b2_seguridad', 'NO ve el documento administrativo',
  not exists (select 1 from public.documents where id = test.id('doc_admin')));

select test.ok('b2_seguridad', 'Ni pidiendo expresamente los administrativos',
  (select count(*) from public.documents where scope = 'administrativa') = 0);

-- Y el almacén: sin este permiso, Supabase no firma el enlace, y sin
-- enlace no hay URL que valga ni descarga posible.
select test.ok('b2_seguridad', 'El almacén SÍ le firma el enlace del plano',
  public.storage_can_read('projects/' || test.id('proy_b2') || '/plano.pdf'));

select test.ok('b2_seguridad', 'Y NO le firma el de la factura',
  not public.storage_can_read('projects/' || test.id('proy_b2') || '/factura.pdf'));

select test.err('b2_seguridad', 'Un trabajador no puede mover nada de categoría',
  format($$select public.move_document_scope(%L, 'tecnica')$$, test.id('doc_admin')), '42501');

-- Escribir en la tabla no da error: la política sencillamente no le deja
-- tocar ninguna fila. Lo que importa es que NADA cambie.
update public.documents set scope = 'tecnica';
reset role; select test.as_server();
select test.ok('b2_seguridad', 'Ni cambiar la categoría escribiendo en la tabla',
  (select scope from public.documents where id = test.id('doc_admin')) = 'administrativa');
set role authenticated; select test.as_user(test.id('pedro'));

-- Tampoco puede subir nada marcándolo como administrativo.
select test.err('b2_seguridad', 'Ni subir un documento a la carpeta de administración',
  format($$insert into public.documents
             (project_id, storage_path, file_name, size_bytes, category, uploaded_by, scope)
           values (%L, 'projects/' || %L || '/colado.pdf', 'colado.pdf', 10, 'foto', %L, 'administrativa')$$,
         test.id('proy_b2'), test.id('proy_b2'), test.id('pedro')), '42501');


\echo '== BLOQUE 2 · MOVER UN DOCUMENTO DE CATEGORÍA'

set role authenticated; select test.as_user(test.id('salvi'));

select public.move_document_scope(test.id('doc_admin'), 'tecnica');

select test.ok('b2_mover', 'Administración mueve el documento a técnica',
  (select scope from public.documents where id = test.id('doc_admin')) = 'tecnica');

select test.ok('b2_mover', 'Y queda anotado en el historial, con el antes y el después',
  exists (select 1 from public.audit_log
           where summary like '%movió «factura-motor.pdf» de documentación administrativa a documentación técnica%'));

-- No basta con que esté en el historial: tiene que estar en el historial
-- DEL PROYECTO, que es donde lo va a buscar quien lo necesite. Esa
-- pantalla filtra por el código, así que la anotación tiene que llevarlo.
select test.ok('b2_mover', 'Y aparece en el historial del proyecto, no suelto',
  exists (select 1 from public.audit_log a
           join public.projects p on p.code = a.entity_code
          where p.id = test.id('proy_b2')
            and a.summary like '%movió «factura-motor.pdf»%'));

set role authenticated; select test.as_user(test.id('pedro'));
select test.ok('b2_mover', 'Ahora el trabajador SÍ lo ve',
  exists (select 1 from public.documents where id = test.id('doc_admin')));
select test.ok('b2_mover', 'Y el almacén ya le firma su enlace',
  public.storage_can_read('projects/' || test.id('proy_b2') || '/factura.pdf'));

set role authenticated; select test.as_user(test.id('salvi'));
select public.move_document_scope(test.id('doc_admin'), 'administrativa');

set role authenticated; select test.as_user(test.id('pedro'));
select test.ok('b2_mover', 'Al devolverlo a administrativa, vuelve a desaparecer',
  not exists (select 1 from public.documents where id = test.id('doc_admin'))
  and not public.storage_can_read('projects/' || test.id('proy_b2') || '/factura.pdf'));


\echo '== BLOQUE 2 · ELIMINAR UN TRABAJADOR'

reset role; select test.as_server();
insert into auth.users (id, email)
values ('aaaa1111-1111-4111-8111-111111111111', 'temporal@metalplafer.com')
  on conflict do nothing;
insert into public.profiles (id, username, full_name, role, active)
values ('aaaa1111-1111-4111-8111-111111111111', 'temporal', 'Alguien Temporal', 'worker', true)
  on conflict (id) do update set full_name = excluded.full_name, active = true;

set role authenticated; select test.as_user(test.id('pedro'));
select test.err('b2_borrar', 'Un trabajador no puede eliminar a nadie',
  $$select public.delete_worker('aaaa1111-1111-4111-8111-111111111111')$$, '42501');

set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('b2_borrar', 'Alguien sin trabajo registrado SE ELIMINA de verdad',
  (public.delete_worker('aaaa1111-1111-4111-8111-111111111111') ->> 'ok')::boolean);

reset role; select test.as_server();
select test.ok('b2_borrar', 'Y desaparece de la base de datos, no se queda desactivado',
  not exists (select 1 from public.profiles where username = 'temporal'));

select test.ok('b2_borrar', 'También se le retira el acceso',
  not exists (select 1 from auth.users where id = 'aaaa1111-1111-4111-8111-111111111111'));

select test.ok('b2_borrar', 'Pero el historial lo recuerda',
  exists (select 1 from public.audit_log where summary like '%eliminó al trabajador%'));

-- Y lo que NO se puede hacer.
set role authenticated; select test.as_user(test.id('salvi'));

select test.err('b2_borrar', 'No se elimina a quien tiene trabajo registrado',
  format($$select public.delete_worker(%L)$$, test.id('juan')), '23503');

select test.err('b2_borrar', 'Ni uno mismo',
  format($$select public.delete_worker(%L)$$, test.id('salvi')), '22023');

reset role; select test.as_server();
select test.ok('b2_borrar', 'Y quien tiene trabajo sigue ahí, con sus horas intactas',
  exists (select 1 from public.profiles where id = test.id('juan'))
  and (select count(*) from public.work_reports where worker_id = test.id('juan')) > 0);


\echo '== BLOQUE 2 · ELIMINAR FICHAS Y PROYECTOS'

set role authenticated; select test.as_user(test.id('salvi'));

-- Una ficha suelta: se borra con sus comentarios y documentos.
with f as (
  insert into public.fichas (type, status, client_id, title, description)
  values ('visita', 'pendiente', test.id('cli_laura'), 'Visita de medición', 'Tomar medidas.')
  returning id)
select test.put('ficha_b2', (select id from f));

insert into public.comments (ficha_id, author_id, body)
values (test.id('ficha_b2'), test.id('salvi'), 'Llamar antes de ir.');

select test.ok('b2_borrar', 'Una ficha sin proyecto detrás se elimina',
  (public.delete_ficha(test.id('ficha_b2')) ->> 'ok')::boolean);

select test.ok('b2_borrar', 'Y se lleva sus comentarios',
  not exists (select 1 from public.comments where ficha_id = test.id('ficha_b2')));

-- Una ficha que se convirtió en proyecto: NO.
select test.err('b2_borrar', 'Una ficha de la que salió un proyecto no se elimina',
  format($$select public.delete_ficha(
    (select source_ficha_id from public.projects
      where source_ficha_id is not null limit 1))$$), '23503');

-- Un proyecto limpio: se borra con todo lo suyo.
select test.ok('b2_borrar', 'Un proyecto sin cobros ni horas validadas se elimina',
  (public.delete_project(test.id('proy_b2')) ->> 'ok')::boolean);

reset role; select test.as_server();
select test.ok('b2_borrar', 'Y se lleva sus documentos y sus asignaciones',
  not exists (select 1 from public.documents where project_id = test.id('proy_b2'))
  and not exists (select 1 from public.project_workers where project_id = test.id('proy_b2')));

select test.ok('b2_borrar', 'El historial cuenta qué se llevó por delante',
  exists (select 1 from public.audit_log
           where summary like '%eliminó el proyecto%archivos%órdenes%'));

-- Un proyecto con horas validadas: NO, y se dice por qué.
set role authenticated; select test.as_user(test.id('salvi'));
select test.err('b2_borrar', 'Un proyecto con horas validadas NO se elimina',
  format($$select public.delete_project(%L)$$, test.id('proy_b1')), '23503');

reset role; select test.as_server();
select test.ok('b2_borrar', 'Ese proyecto sigue entero, con sus horas',
  exists (select 1 from public.projects where id = test.id('proy_b1'))
  and (select realizadas_total from public.project_hours
        where project_id = test.id('proy_b1')) > 0);

select test.ok('b2_borrar', 'El historial sigue sin poder modificarse ni borrarse',
  not exists (select 1 from information_schema.role_table_grants
               where grantee in ('authenticated', 'anon')
                 and table_name = 'audit_log' and privilege_type in ('UPDATE', 'DELETE')));
