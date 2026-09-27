-- =====================================================================
-- METALPLAFER360 · PRUEBAS DE CLIENTES Y FICHAS (FASE 2)
--
-- Continúa sobre los usuarios creados en 10_tests.sql:
--   salvi  → administración
--   juan   → trabajador
--   pedro  → trabajador
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
reset role;
select test.as_server();


\echo '== CLIENTES'
set role authenticated; select test.as_user(test.id('salvi'));

with x as (
  insert into public.clients (kind, name, tax_id, phone, email, address, city, postal_code)
  values ('empresa', 'García Construcciones SL', 'B61234567', '600111222',
          'obras@garciaconstrucciones.es', 'Carrer de la Indústria, 12', 'Sabadell', '08202')
  returning id)
select test.put('cli_garcia', id) from x;

with x as (insert into public.clients (kind, name) values ('empresa', 'García y Asociados') returning id)
select test.put('cli_garcia2', id) from x;

with x as (
  insert into public.clients (kind, name, phone, address, city)
  values ('particular', 'Laura Puig Serra', '644555666', 'Carrer de Sant Pau, 21', 'Terrassa')
  returning id)
select test.put('cli_laura', id) from x;

with x as (insert into public.clients (kind, name) values ('empresa', 'Supermercats Bonprix SL') returning id)
select test.put('cli_bonprix', id) from x;

select test.ok('clientes', 'Se crea un cliente de tipo EMPRESA con CIF',
  (select kind = 'empresa' and tax_id = 'B61234567' and active and archived_at is null
     from public.clients where id = test.id('cli_garcia')));

select test.ok('clientes', 'Se crea un cliente PARTICULAR sin CIF/NIF (es opcional)',
  (select kind = 'particular' and tax_id is null from public.clients where id = test.id('cli_laura')));

select test.ok('clientes', 'Varios clientes pueden no tener CIF/NIF a la vez',
  (select count(*) = 3 from public.clients where tax_id is null));

select test.err('clientes', 'El mismo CIF con otro formato (b-61234567) se rechaza',
  $$insert into public.clients (name, tax_id) values ('Copia', 'b-61234567')$$, '23505');

select test.err('clientes', 'Un cliente sin nombre se rechaza',
  $$insert into public.clients (name) values ('   ')$$, '23514');

-- Contactos
insert into public.client_contacts (client_id, name, role, phone) values
  (test.id('cli_garcia'), 'Jordi García', 'Gerente', '600111223'),
  (test.id('cli_garcia'), 'Marta García', 'Administración', '600111224');
with x as (select id from public.client_contacts where name = 'Jordi García')
select test.put('contacto_jordi', id) from x;

select test.ok('clientes', 'Un cliente puede tener varios contactos',
  (select count(*) = 2 from public.client_contacts where client_id = test.id('cli_garcia')));

update public.client_contacts set phone = '600111999' where id = test.id('contacto_jordi');
select test.ok('clientes', 'Se puede corregir un contacto',
  (select phone = '600111999' from public.client_contacts where id = test.id('contacto_jordi')));

-- Los contactos se archivan: si se borrasen, los presupuestos antiguos
-- perderían con quién se habló.
select public.archive_contact((select id from public.client_contacts where name = 'Marta García'));
select test.ok('clientes', 'Un contacto se archiva y deja de estar a la vista',
  (select count(*) = 1 from public.client_contacts
    where client_id = test.id('cli_garcia') and archived_at is null));
select test.ok('clientes', 'Pero sigue estando, para no perder el historial',
  (select count(*) = 2 from public.client_contacts where client_id = test.id('cli_garcia')));


\echo '== BÚSQUEDA Y SUGERENCIAS'
select test.ok('busqueda', 'Buscar «garcia» encuentra los dos clientes García',
  (select count(*) = 2 from public.clients where name ilike '%garcia%' or public.norm(name) like '%garcia%'));

select test.ok('sugerencias', '«GARCÍA CONSTRUCCIONES» propone García Construcciones SL',
  exists (select 1 from public.suggest_clients('GARCÍA CONSTRUCCIONES') where name = 'García Construcciones SL'));

select test.ok('sugerencias', '…y también propone García y Asociados',
  exists (select 1 from public.suggest_clients('GARCÍA CONSTRUCCIONES') where name = 'García y Asociados'));

select test.ok('sugerencias', 'No propone clientes que no se parecen',
  not exists (select 1 from public.suggest_clients('GARCÍA CONSTRUCCIONES') where name like 'Supermercats%'));

select test.ok('sugerencias', 'Funciona sin acentos: «garcia construcciones»',
  exists (select 1 from public.suggest_clients('garcia construcciones') where name = 'García Construcciones SL'));

select test.ok('sugerencias', 'Funciona escribiendo parte del CIF: «B6123»',
  exists (select 1 from public.suggest_clients('B6123') where name = 'García Construcciones SL'));

select test.ok('sugerencias', 'Funciona con el CIF escrito con guion: «B-61234567»',
  exists (select 1 from public.suggest_clients('B-61234567') where name = 'García Construcciones SL'));

select test.ok('sugerencias', 'Con una sola letra no propone nada (evita ruido)',
  (select count(*) = 0 from public.suggest_clients('G')));

select test.ok('sugerencias', 'Solo devuelve datos generales del cliente, nunca de proyectos',
  (select p.proargnames @> array['id','name','tax_id','kind','phone','email','address','city','postal_code','score']
      and array_length(p.proargnames, 1) = 12   -- 2 parámetros de entrada + 10 columnas
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'suggest_clients'));

\echo '== ARCHIVAR Y DESACTIVAR (los clientes no se borran)'
select test.err('clientes', 'Un cliente no se puede borrar físicamente',
  $$delete from public.clients where id = test.id('cli_bonprix')$$, '42501');

update public.clients set active = false where id = test.id('cli_bonprix');
select test.ok('clientes', 'Se puede desactivar un cliente',
  (select not active from public.clients where id = test.id('cli_bonprix')));

update public.clients set archived_at = now() where id = test.id('cli_garcia2');
select test.ok('clientes', 'Se puede archivar un cliente',
  (select archived_at is not null from public.clients where id = test.id('cli_garcia2')));

select test.ok('clientes', 'Un cliente archivado deja de proponerse como sugerencia',
  not exists (select 1 from public.suggest_clients('García') where name = 'García y Asociados'));

select test.ok('clientes', 'El cliente archivado sigue existiendo, con su historial',
  exists (select 1 from public.clients where id = test.id('cli_garcia2')));

update public.clients set archived_at = null where id = test.id('cli_garcia2');
select test.ok('clientes', 'Se puede recuperar un cliente archivado',
  (select archived_at is null from public.clients where id = test.id('cli_garcia2')));

select test.ok('clientes', 'El historial recoge el archivado y la recuperación',
  exists (select 1 from public.audit_log where summary = 'Salvi archivó el cliente García y Asociados')
  and exists (select 1 from public.audit_log where summary like '%recuperó el cliente archivado García y Asociados'));


\echo '== FICHAS · NUMERACIÓN Y ESTADO INICIAL'
with x as (
  insert into public.fichas (type, client_id, title, description, amount, status)
  values ('presupuesto', test.id('cli_garcia'), 'Barandilla escalera',
          'Barandilla de acero para escalera de 4 plantas.', 6400, 'aceptado')
  returning id, code, status)
select test.put('pres1', id),
       test.ok('fichas', 'El primer presupuesto del año es PRES-AAAA-001',
         code = 'PRES-' || extract(year from public.today_madrid())::int || '-001') ,
       test.ok('fichas', 'Aunque se pida otro estado, la ficha nace en «Por asignar»',
         status = 'por_asignar')
  from x;

with x as (
  insert into public.fichas (type, client_id, title, amount)
  values ('presupuesto', test.id('cli_laura'), 'Escalera interior dúplex', 5600)
  returning id, code)
select test.put('pres2', id),
       test.ok('fichas', 'El segundo presupuesto es PRES-AAAA-002', code like 'PRES-%-002')
  from x;

with x as (
  insert into public.fichas (type, title, description, address, scheduled_date, scheduled_time)
  values ('visita', 'Toma de medidas', 'Medir huecos de fachada.',
          'Carrer Major, 12 · Matadepera', public.today_madrid() + 1, '09:30')
  returning id, code)
select test.put('vis1', id),
       test.ok('fichas', 'Las visitas llevan su propia serie: VIS-AAAA-001', code like 'VIS-%-001')
  from x;

with x as (
  insert into public.fichas (type, client_id, phone, address, description, scheduled_date, scheduled_time)
  values ('aviso', test.id('cli_laura'), '644555666', 'Carrer de Sant Pau, 21 · Terrassa',
          'La puerta del garaje no cierra.', public.today_madrid(), '10:00')
  returning id, code)
select test.put('avi1', id),
       test.ok('fichas', 'Los avisos llevan su propia serie: AVI-AAAA-001', code like 'AVI-%-001')
  from x;

select test.ok('fichas', 'Las tres series son independientes entre sí',
  (select count(*) = 3 from public.code_counters
    where prefix in ('PRES', 'VIS', 'AVI')
      and year = extract(year from public.today_madrid())::int
      and last_value in (1, 2)));

select test.ok('fichas', 'Cada serie reinicia en 001 cada año',
  (select count(*) = 0 from public.code_counters
    where prefix in ('PRES', 'VIS', 'AVI')
      and year <> extract(year from public.today_madrid())::int));

select test.ok('fichas', 'Una visita puede no tener cliente todavía',
  (select client_id is null from public.fichas where id = test.id('vis1')));

select test.err('fichas', 'Un aviso sin cliente se rechaza',
  $$insert into public.fichas (type, description) values ('aviso', 'sin cliente')$$, '23514');

select test.err('fichas', 'Un presupuesto sin cliente se rechaza',
  $$insert into public.fichas (type, title) values ('presupuesto', 'sin cliente')$$, '23514');


\echo '== PRESUPUESTOS · ESTADOS'
update public.fichas set assigned_to = test.id('salvi') where id = test.id('pres1');
select test.ok('presupuestos', 'Al asignar responsable pasa a «Presupuesto pendiente»',
  (select status = 'pendiente' from public.fichas where id = test.id('pres1')));

update public.fichas set status = 'avanzado'    where id = test.id('pres1');
update public.fichas set status = 'por_revisar' where id = test.id('pres1');
update public.fichas set status = 'enviado'     where id = test.id('pres1');
update public.fichas set status = 'aceptado'    where id = test.id('pres1');
select test.ok('presupuestos', 'Recorre pendiente → avanzado → por revisar → enviado → aceptado',
  (select status = 'aceptado' from public.fichas where id = test.id('pres1')));

update public.fichas set status = 'cancelado' where id = test.id('pres2');
select test.ok('presupuestos', 'Un presupuesto se puede cancelar',
  (select status = 'cancelado' from public.fichas where id = test.id('pres2')));

select test.err('presupuestos', 'No existe el estado «rechazado»',
  $$update public.fichas set status = 'rechazado' where id = test.id('pres2')$$, '23514');

select test.err('presupuestos', 'No existe el estado «perdido»',
  $$update public.fichas set status = 'perdido' where id = test.id('pres2')$$, '23514');

select test.err('presupuestos', 'Un presupuesto no puede tomar un estado de aviso',
  $$update public.fichas set status = 'en_curso' where id = test.id('pres1')$$, '23514');

select test.ok('presupuestos', 'El historial explica el cambio en castellano',
  exists (select 1 from public.audit_log
           where summary like '%cambió la ficha PRES-%Presupuesto enviado → Presupuesto aceptado'));


\echo '== VISITAS'
update public.fichas set assigned_to = test.id('juan') where id = test.id('vis1');
select test.ok('visitas', 'Al asignar trabajador la visita pasa a «Asignada»',
  (select status = 'asignada' from public.fichas where id = test.id('vis1')));

select test.ok('visitas', 'Guarda fecha, hora, dirección y descripción',
  (select scheduled_date = public.today_madrid() + 1 and scheduled_time = '09:30'
      and address like 'Carrer Major%' and description is not null
     from public.fichas where id = test.id('vis1')));

update public.fichas set status = 'realizada' where id = test.id('vis1');
select test.ok('visitas', 'Una visita se marca como realizada',
  (select status = 'realizada' from public.fichas where id = test.id('vis1')));

select test.err('visitas', 'Una visita no puede tomar estados de presupuesto',
  $$update public.fichas set status = 'enviado' where id = test.id('vis1')$$, '23514');


\echo '== AVISOS'
select test.ok('avisos', 'Guarda cliente, teléfono, dirección, fecha y hora previstas',
  (select client_id = test.id('cli_laura') and phone = '644555666'
      and address like '%Sant Pau%' and scheduled_date = public.today_madrid()
      and scheduled_time = '10:00'
     from public.fichas where id = test.id('avi1')));

update public.fichas set assigned_to = test.id('juan') where id = test.id('avi1');
select test.ok('avisos', 'Al asignar trabajador el aviso pasa a «Asignado»',
  (select status = 'asignado' from public.fichas where id = test.id('avi1')));

update public.fichas set status = 'en_curso' where id = test.id('avi1');
update public.fichas set status = 'realizado' where id = test.id('avi1');
update public.fichas set status = 'cerrado'  where id = test.id('avi1');
select test.ok('avisos', 'Recorre asignado → en curso → realizado → cerrado',
  (select status = 'cerrado' from public.fichas where id = test.id('avi1')));

select test.err('avisos', 'Un aviso no puede tomar estados de presupuesto',
  $$update public.fichas set status = 'aceptado' where id = test.id('avi1')$$, '23514');

-- Un aviso NO se convierte en proyecto: no existe ninguna función para ello.
select test.ok('avisos', 'No existe ninguna forma de convertir un aviso en proyecto',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname like '%aviso%project%'));


\echo '== ARCHIVAR FICHAS'
select test.err('fichas', 'Una ficha no se puede borrar físicamente',
  $$delete from public.fichas where id = test.id('pres2')$$, '42501');

update public.fichas set archived_at = now() where id = test.id('pres2');
select test.ok('fichas', 'Una ficha se archiva y conserva su historial',
  (select archived_at is not null from public.fichas where id = test.id('pres2'))
  and exists (select 1 from public.audit_log where summary like '%archivó la ficha PRES-%'));


\echo '== DOCUMENTOS Y COMENTARIOS DE LA FICHA'
insert into storage.objects (bucket_id, name)
values ('documentos', 'fichas/' || test.id('avi1') || '/foto-puerta.jpg');

with x as (
  insert into public.documents (ficha_id, storage_path, file_name, mime_type, size_bytes, category, uploaded_by)
  values (test.id('avi1'), 'fichas/' || test.id('avi1') || '/foto-puerta.jpg',
          'Puerta del garaje.jpg', 'image/jpeg', 850000, 'foto', test.id('salvi'))
  returning id)
select test.put('doc1', id) from x;

select test.ok('documentos', 'Administración sube una fotografía a la ficha',
  (select category = 'foto' from public.documents where id = test.id('doc1')));

select test.err('documentos', 'Un archivo más grande que el límite configurado se rechaza',
  $$insert into public.documents (ficha_id, storage_path, file_name, size_bytes)
    values (test.id('avi1'), 'fichas/x/grande.mp4', 'grande.mp4', 104857601)$$, '22023');

-- La política de borrado filtra la fila: la orden se ejecuta pero no
-- borra nada mientras el documento no esté en la papelera.
delete from public.documents where id = test.id('doc1');
select test.ok('documentos', 'No se puede borrar un documento sin pasar por la papelera',
  exists (select 1 from public.documents where id = test.id('doc1')));

select public.trash_document(test.id('doc1'));
select test.ok('documentos', 'Enviar a la papelera no borra el documento',
  (select deleted_at is not null and deleted_by = test.id('salvi')
     from public.documents where id = test.id('doc1')));

select public.restore_document(test.id('doc1'));
select test.ok('documentos', 'Se puede recuperar de la papelera',
  (select deleted_at is null from public.documents where id = test.id('doc1')));

select public.trash_document(test.id('doc1'));
delete from public.documents where id = test.id('doc1');
select test.ok('documentos', 'Desde la papelera sí se puede eliminar definitivamente',
  not exists (select 1 from public.documents where id = test.id('doc1')));

insert into public.comments (ficha_id, author_id, body)
values (test.id('avi1'), test.id('salvi'), 'Hablado con la clienta: pasamos el lunes por la mañana.');
select test.ok('comentarios', 'Se puede comentar en una ficha',
  (select count(*) = 1 from public.comments where ficha_id = test.id('avi1')));

select test.err('comentarios', 'Un comentario vacío se rechaza',
  $$insert into public.comments (ficha_id, author_id, body)
    values (test.id('avi1'), test.id('salvi'), '   ')$$, '23514');

select test.err('comentarios', 'Los comentarios no se editan',
  $$update public.comments set body = 'cambiado' where ficha_id = test.id('avi1')$$, '42501');

select test.err('comentarios', 'Los comentarios no se borran',
  $$delete from public.comments where ficha_id = test.id('avi1')$$, '42501');

select test.ok('comentarios', 'El comentario sigue ahí',
  (select count(*) = 1 from public.comments where ficha_id = test.id('avi1')));


\echo '== RESUMEN DE ACTIVIDAD DEL CLIENTE'
select test.ok('cliente_historial', 'La ficha del cliente cuenta sus presupuestos',
  (select budgets = 1 and visits = 0 and notices = 0
     from public.client_activity where client_id = test.id('cli_garcia')));

select test.ok('cliente_historial', 'Y cuenta sus avisos',
  (select notices = 1 from public.client_activity where client_id = test.id('cli_laura')));

select test.ok('cliente_historial', 'Las fichas archivadas no se cuentan',
  (select budgets = 0 from public.client_activity where client_id = test.id('cli_laura')));

select test.ok('cliente_historial', 'Los avisos cerrados no cuentan como abiertos',
  (select open_notices = 0 from public.client_activity where client_id = test.id('cli_laura')));


\echo '== PERMISOS · TRABAJADOR'
select test.as_user(test.id('juan'));

select test.ok('permisos', 'Ve solo la visita y el aviso que tiene asignados',
  (select count(*) = 2 and bool_and(id in (test.id('vis1'), test.id('avi1'))) from public.fichas));

select test.ok('permisos', 'No ve los presupuestos',
  not exists (select 1 from public.fichas where type = 'presupuesto'));

select test.ok('permisos', 'Ve al cliente del aviso que tiene asignado',
  exists (select 1 from public.clients where id = test.id('cli_laura')));

select test.ok('permisos', 'No ve al resto de clientes',
  (select count(*) = 1 from public.clients));

select test.ok('permisos', 'No ve los contactos de clientes que no le corresponden',
  (select count(*) = 0 from public.client_contacts));

select test.err('permisos', 'No puede crear clientes',
  $$insert into public.clients (name) values ('Cliente falso')$$, '42501');

select test.err('permisos', 'No puede crear fichas',
  $$insert into public.fichas (type, client_id, description)
    values ('aviso', test.id('cli_laura'), 'falso')$$, '42501');

update public.clients set name = 'HACKEADO' where id = test.id('cli_laura');
select test.ok('permisos', 'No puede modificar los datos de un cliente',
  (select name = 'Laura Puig Serra' from public.clients where id = test.id('cli_laura')));

update public.fichas set status = 'cerrado', description = 'HACKEADO' where id = test.id('vis1');
select test.ok('permisos', 'No puede cambiar el estado de sus fichas por su cuenta',
  (select status = 'realizada' and description <> 'HACKEADO' from public.fichas where id = test.id('vis1')));

select test.ok('permisos', 'No puede usar el buscador de clientes de administración',
  (select count(*) = 0 from public.suggest_clients('García')));

select test.ok('permisos', 'No ve los documentos en la papelera',
  (select count(*) = 0 from public.documents where deleted_at is not null));

select test.as_user(test.id('pedro'));
select test.ok('permisos', 'Otro trabajador sin asignaciones no ve ninguna ficha',
  (select count(*) = 0 from public.fichas));
select test.ok('permisos', 'Otro trabajador sin asignaciones no ve ningún cliente',
  (select count(*) = 0 from public.clients));
select test.ok('permisos', 'Ni los comentarios de fichas ajenas',
  (select count(*) = 0 from public.comments));

reset role;
set role anon; select test.as_anon();
select test.err('permisos', 'Sin sesión no se pueden leer los clientes',
  'select * from public.clients', '42501');
select test.err('permisos', 'Sin sesión no se pueden leer las fichas',
  'select * from public.fichas', '42501');
select test.err('permisos', 'Sin sesión no funcionan las sugerencias',
  $$select * from public.suggest_clients('García')$$, '42501');
reset role;
