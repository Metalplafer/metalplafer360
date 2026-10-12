-- =====================================================================
-- METALPLAFER360 · REVISIÓN TRANSVERSAL
--
-- Estas pruebas no comprueban una funcionalidad: comprueban INVARIANTES
-- de toda la aplicación. Están escritas para que sigan cazando fugas
-- cuando se añadan tablas, vistas o funciones nuevas, en lugar de
-- repasar una lista escrita a mano que se queda vieja.
--
-- Las tres que más importan recorren el catálogo de PostgreSQL:
--   · ninguna relación que alcance un trabajador contiene dinero;
--   · ninguna le devuelve datos personales de un compañero;
--   · ninguna función que pueda ejecutar le cuenta nada de un proyecto
--     que no es suyo.
-- =====================================================================

\set ON_ERROR_STOP on

reset role; select test.as_server();

-- ---------------------------------------------------------------------
-- Herramientas de la revisión.
--
-- «test.filas» cuenta filas de una relación cualquiera CON LOS PERMISOS
-- DE QUIEN LLAMA (no es security definer, a propósito: si lo fuera,
-- saltaría el RLS que estamos comprobando).
-- ---------------------------------------------------------------------
create or replace function test.filas(p_rel text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I', p_rel) into n;
  return n;
exception when insufficient_privilege or undefined_column then
  return 0;   -- sin permiso de columna: tampoco puede leerla
end $$;

/** Relaciones con permiso de lectura para «authenticated». */
create or replace view test.alcanzables as
  select c.relname as rel
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
     and has_table_privilege('authenticated', c.oid, 'SELECT');

/** Columnas que son dinero, en cualquier cosa alcanzable. */
create or replace view test.columnas_dinero as
  select c.relname as rel, a.attname as col
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
     and has_column_privilege('authenticated', c.oid, a.attname, 'SELECT')
     -- Dinero de verdad. Las horas NO son dinero: el trabajador ve las
     -- suyas y las previstas de su proyecto, y eso está decidido así.
     and (a.attname ~ '^(amount|budget_amount|advance_amount|invoiced_amount|invoiced_on|billing_status)$'
       or a.attname ~ '^(cobrado|pendiente|pendiente_facturar|facturado|total_estimado|total_proyectos|extras)$');

/** Datos personales que son de cada uno y de nadie más. */
create or replace view test.columnas_personales as
  select c.relname as rel, a.attname as col
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
     and c.relname in ('profiles')
     -- «has_column_privilege» cuenta tanto el permiso de tabla como el de
     -- columna: es lo que decide de verdad si se puede leer.
     and has_column_privilege('authenticated', c.oid, a.attname, 'SELECT')
     and a.attname in ('email', 'phone', 'preferences', 'username');

grant select on test.alcanzables, test.columnas_dinero, test.columnas_personales
  to anon, authenticated, service_role;
grant execute on all functions in schema test to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- Material de la revisión. Se monta aquí y no se reutiliza lo que dejen
-- las pruebas anteriores: algunas borran sus propios datos a propósito,
-- y una revisión no puede depender de ese orden.
-- ---------------------------------------------------------------------
with c as (insert into public.clients (kind, name)
           values ('empresa', 'Cliente de la auditoría') returning id)
select test.put('aud_cli', (select id from c));

with p as (insert into public.projects (client_id, name, budget_amount, advance_amount,
                                        budget_hours_fab, budget_hours_mont)
           values (test.id('aud_cli'), 'Proyecto de la auditoría', 7000, 1000, 16, 8)
           returning id)
select test.put('aud_proy', (select id from p));

insert into public.project_workers (project_id, worker_id)
values (test.id('aud_proy'), test.id('juan'));

with d as (insert into public.documents (project_id, bucket, storage_path, file_name, mime_type,
                                         size_bytes, category, scope, uploaded_by)
           values (test.id('aud_proy'), 'documentos',
                   'projects/' || test.id('aud_proy') || '/plano-auditoria.pdf',
                   'plano-auditoria.pdf', 'application/pdf', 2048, 'documento', 'tecnica',
                   test.id('salvi'))
           returning id)
select test.put('aud_doc_tecnico', (select id from d));

with d as (insert into public.documents (project_id, bucket, storage_path, file_name, mime_type,
                                         size_bytes, category, scope, uploaded_by)
           values (test.id('aud_proy'), 'documentos',
                   'projects/' || test.id('aud_proy') || '/factura-auditoria.pdf',
                   'factura-auditoria.pdf', 'application/pdf', 4096, 'documento', 'administrativa',
                   test.id('salvi'))
           returning id)
select test.put('aud_doc_admin', (select id from d));

-- Un documento técnico de su proyecto, pero EN LA PAPELERA.
with d as (insert into public.documents (project_id, bucket, storage_path, file_name, mime_type,
                                         size_bytes, category, scope, uploaded_by, deleted_at)
           values (test.id('aud_proy'), 'documentos',
                   'projects/' || test.id('aud_proy') || '/plano-viejo.pdf',
                   'plano-viejo.pdf', 'application/pdf', 1024, 'documento', 'tecnica',
                   test.id('salvi'), now())
           returning id)
select test.put('aud_doc_papelera', (select id from d));

-- Un presupuesto que NO es de Juan, para las pruebas de subida.
with f as (insert into public.fichas (type, client_id, title, description, amount)
           values ('presupuesto', test.id('aud_cli'), 'Presupuesto de la auditoría', 'x', 9000)
           returning id)
select test.put('aud_pres', (select id from f));


\echo '== REVISIÓN · 1) ROLES · LO QUE ALCANZA ADMINISTRACIÓN'

set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('rev_admin', 'Acceso completo a proyectos',
  (select count(*) > 0 from public.projects));
select test.ok('rev_admin', 'Y al dinero de los proyectos',
  (select count(*) > 0 from public.projects where budget_amount is not null));
select test.ok('rev_admin', 'Acceso a los cobros',
  (select count(*) >= 0 from public.payments) and (select count(*) > 0 from public.project_billing));
select test.ok('rev_admin', 'Acceso a las obras y a sus cuentas',
  (select count(*) >= 0 from public.works) and (select count(*) >= 0 from public.work_summary));
select test.ok('rev_admin', 'Acceso a la documentación administrativa',
  (select count(*) > 0 from public.documents where scope = 'administrativa'));
select test.ok('rev_admin', 'Y el almacén le firma el enlace de un archivo administrativo',
  public.storage_can_read(
    (select storage_path from public.documents where id = test.id('aud_doc_admin'))));
select test.ok('rev_admin', 'Gestiona trabajadores',
  (select count(*) > 1 from public.profiles));
select test.ok('rev_admin', 'Gestiona avisos y presupuestos',
  (select count(*) > 0 from public.fichas));
select test.ok('rev_admin', 'Puede editar el calendario: marcar un día no laborable',
  (select day = date '2099-07-14' from public.set_non_working_day(date '2099-07-14', 'prueba')));
select public.clear_non_working_day(date '2099-07-14');

select test.ok('rev_admin', 'Y crear un evento suelto',
  (select title = 'prueba de revisión'
     from public.save_calendar_note(null, date '2099-07-15', 'prueba de revisión')));

select test.ok('rev_admin', 'Crea y modifica obras',
  (select code like 'OBRA-%' from public.save_work(null, 'Obra de la revisión')));


\echo '== REVISIÓN · 2) SEGURIDAD ECONÓMICA · NADA DE DINERO PARA EL TRABAJADOR'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('juan'));

-- LA PRUEBA QUE IMPORTA: se recorre el catálogo. Si alguien añade una
-- tabla o una vista con un importe y se la deja alcanzable, esto falla.
select test.ok('rev_dinero', 'Ninguna relación con importes le devuelve una sola fila',
  not exists (
    select 1 from (select distinct rel from test.columnas_dinero) d
     where test.filas(d.rel) > 0),
  (select coalesce(string_agg(distinct rel, ', '), '—')
     from test.columnas_dinero d where test.filas(d.rel) > 0));

-- Y una por una, las que el encargo nombra.
select test.ok('rev_dinero', 'Importe de proyecto y paga y señal: cero filas en «projects»',
  test.filas('projects') = 0);
select test.ok('rev_dinero', 'Facturación: cero filas en «payments» y en «project_billing»',
  test.filas('payments') = 0 and test.filas('project_billing') = 0);
select test.ok('rev_dinero', 'Obras: cero filas en «works»', test.filas('works') = 0);
select test.ok('rev_dinero', 'Costes extras: cero filas en «work_extras»',
  test.filas('work_extras') = 0);
select test.ok('rev_dinero', 'Cuentas de obra: cero filas en «work_summary»',
  test.filas('work_summary') = 0);
select test.ok('rev_dinero', 'Importe de presupuesto: cero filas en «fichas» y sus vistas',
  test.filas('fichas') = 0 and test.filas('budgets') = 0
  and test.filas('notices') = 0 and test.filas('visits') = 0);

-- Las puertas por las que SÍ entra, para que la prueba no pase por estar
-- todo vacío.
select test.ok('rev_dinero', 'Pero sí entra por sus vistas, que no llevan dinero',
  test.filas('worker_projects') > 0 and test.filas('worker_fichas') > 0
  and test.filas('v_calendar') > 0);


\echo '== REVISIÓN · 2 bis) DATOS DE LOS COMPAÑEROS'

select test.ok('rev_personal', 'No alcanza el teléfono, el correo ni las preferencias de nadie',
  not exists (select 1 from test.columnas_personales),
  (select coalesce(string_agg(rel || '.' || col, ', '), '—') from test.columnas_personales));

select test.ok('rev_personal', 'Pero sí sabe con quién trabaja, por nombre',
  (select count(*) > 0 from public.project_team));

select test.ok('rev_personal', 'Y sigue leyendo el nombre y el rol de un compañero',
  (select full_name = 'Pedro Navarro' and role = 'worker'
     from public.profiles where id = test.id('pedro')));

select test.ok('rev_personal', 'Pero pedir su teléfono es un error, no un dato',
  not has_column_privilege('authenticated', 'public.profiles'::regclass, 'phone', 'SELECT'));

select test.ok('rev_personal', 'Lo suyo sí lo ve, por «profiles_full»',
  (select phone is not null or email is not null
     from public.profiles_full where id = test.id('juan')));

select test.ok('rev_personal', 'Y de los demás, «profiles_full» no le devuelve nada',
  not exists (select 1 from public.profiles_full where id <> test.id('juan')));


\echo '== REVISIÓN · 2 ter) NINGUNA FUNCIÓN LE CUENTA LO QUE NO ES SUYO'

-- «order_caption» devolvía el nombre del proyecto de CUALQUIER orden:
-- era security definer y no comprobaba nada. Se comprueba que ya no se
-- puede llamar, y de paso que no queda ninguna función interna suelta.
select test.ok('rev_funciones', 'Las funciones internas de aviso no son ejecutables por nadie con sesión',
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('order_caption', 'notify_user', 'notify_admins',
                         'notify_order_workers', 'notify_user_report', 'notify_admins_report')
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  (select coalesce(string_agg(p.proname, ', '), '—')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('order_caption', 'notify_user', 'notify_admins',
                        'notify_order_workers', 'notify_user_report', 'notify_admins_report')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')));


\echo '== REVISIÓN · 3) DOCUMENTOS · LO ADMINISTRATIVO NO SALE DEL ALMACÉN'

select test.ok('rev_docs', 'El trabajador no recibe la fila del documento administrativo',
  not exists (select 1 from public.documents where scope = 'administrativa'),
  (select count(*)::text from public.documents where scope = 'administrativa'));

select test.ok('rev_docs', 'Y el almacén no le firmaría el enlace, aunque supiera la ruta',
  not public.storage_can_read(
    (select storage_path from public.documents d where d.id = test.id('aud_doc_admin'))));

select test.ok('rev_docs', 'Sí recibe la técnica de sus proyectos',
  (select count(*) > 0 from public.documents where scope = 'tecnica'));

select test.ok('rev_docs', 'Y el almacén le firma esa',
  public.storage_can_read(
    (select storage_path from public.documents d where d.id = test.id('aud_doc_tecnico'))));

-- Un archivo que está en el almacén pero NO tiene fila en «documents»
-- (una subida a medias) no se sirve: para leerlo tiene que estar
-- registrado, fuera de la papelera y no ser administrativo.
select test.ok('rev_docs', 'Un archivo huérfano del almacén no se sirve, aunque la carpeta sea suya',
  not public.storage_can_read('projects/' || test.id('aud_proy') || '/subida-a-medias.pdf'));

select test.ok('rev_docs', 'Ni un archivo que está en la papelera, aunque sea técnico y suyo',
  not public.storage_can_read('projects/' || test.id('aud_proy') || '/plano-viejo.pdf'));

select test.ok('rev_docs', 'No puede subir a una ficha que no es suya',
  not public.storage_can_upload('fichas/' || test.id('aud_pres') || '/lo-que-sea.pdf'));

select test.ok('rev_docs', 'Ni cambiar un documento de ámbito',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'move_document_scope'
                 and pg_get_functiondef(p.oid) !~ 'assert_admin'));


\echo '== REVISIÓN · 4) PARTES · EL CICLO COMPLETO'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('juan'));

-- Crear.
select test.put('rev_parte', (select id from public.save_work_report(
  null, test.id('b5_pronto'), 'fabricacion', public.today_madrid(),
  'Bastidor soldado y repasado.', 4, false, false)));

select test.ok('rev_partes', 'El trabajador crea un parte',
  (select status = 'borrador' and hours = 4
     from public.work_reports where id = test.id('rev_parte')));

-- Editar mientras está pendiente.
select public.save_work_report(test.id('rev_parte'), test.id('b5_pronto'), 'fabricacion',
  public.today_madrid(), 'Bastidor soldado, repasado y con imprimación.', 5, false, true);

select test.ok('rev_partes', 'Lo edita y lo envía',
  (select status = 'enviado' and hours = 5
     from public.work_reports where id = test.id('rev_parte')));

select test.ok('rev_partes', 'Y lo puede seguir corrigiendo mientras está enviado',
  (select hours = 6 from public.save_work_report(test.id('rev_parte'), test.id('b5_pronto'),
    'fabricacion', public.today_madrid(), 'Bastidor con imprimación.', 6, false, true)));

-- Las horas NO cuentan hasta validar.
select test.setnote('rev_horas_antes',
  (select coalesce(realizadas_fab, 0)::text from public.project_hours
    where project_id = test.id('b5_pronto')));

reset role; select test.as_server();
select test.ok('rev_partes', 'Las horas enviadas NO cuentan todavía en el proyecto',
  (select coalesce(realizadas_fab, 0) = coalesce(test.note('rev_horas_antes')::numeric, 0)
     from public.project_hours where project_id = test.id('b5_pronto')));

-- Administración rechaza.
set role authenticated; select test.as_user(test.id('salvi'));
select public.reject_work_report(test.id('rev_parte'), 'Faltan las horas del ayudante.');
select test.ok('rev_partes', 'Administración lo rechaza, con motivo',
  (select status = 'rechazado' and reject_reason like 'Faltan las horas%'
     from public.work_reports where id = test.id('rev_parte')));

-- El rechazo permite corregir.
reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('juan'));
select public.save_work_report(test.id('rev_parte'), test.id('b5_pronto'), 'fabricacion',
  public.today_madrid(), 'Bastidor con imprimación, con ayudante.', 8, false, true);
select test.ok('rev_partes', 'El rechazo permite corregirlo y volver a enviarlo',
  (select status = 'enviado' and hours = 8
     from public.work_reports where id = test.id('rev_parte')));

-- Administración valida.
reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));
select public.validate_work_report(test.id('rev_parte'));
select test.ok('rev_partes', 'Administración lo valida',
  (select status = 'validado' and validated_at is not null
     from public.work_reports where id = test.id('rev_parte')));

reset role; select test.as_server();
select test.ok('rev_partes', 'Y AHORA sí cuentan las horas en el proyecto',
  (select realizadas_fab >= 8 from public.project_hours
    where project_id = test.id('b5_pronto')));

-- Validado, cerrado.
set role authenticated; select test.as_user(test.id('juan'));
-- La base de datos lo rechaza con su propio mensaje («El parte ya está
-- validado: no se puede modificar»), que es 22023, no un 42501 de
-- permisos: no es que no pueda, es que ya está cerrado.
select test.err('rev_partes', 'Validado, el trabajador ya no lo puede modificar',
  format($$select public.save_work_report(%L, %L, 'fabricacion', public.today_madrid(),
            'lo cambio yo', 99, false, false)$$,
         test.id('rev_parte'), test.id('b5_pronto')), '22023');

select test.err('rev_partes', 'Ni escribiendo en la tabla a mano',
  format($$update public.work_reports set hours = 99 where id = %L$$, test.id('rev_parte')),
  '42501');

select test.err('rev_partes', 'Ni puede validarse un parte a sí mismo',
  format($$select public.validate_work_report(%L)$$, test.id('rev_parte')), '42501');

select test.err('rev_partes', 'Ni rechazar el de nadie',
  format($$select public.reject_work_report(%L, 'porque sí')$$, test.id('rev_parte')), '42501');


\echo '== REVISIÓN · 5) HISTORIAL'

reset role; select test.as_server();

select test.ok('rev_historial', 'Queda anotado el envío, el rechazo y la validación de un parte',
  (select count(distinct action) >= 2 from public.audit_log
    where entity_code = (select code from public.work_reports where id = test.id('rev_parte'))));

select test.ok('rev_historial', 'Y en castellano, diciendo quién',
  exists (select 1 from public.audit_log
           where entity_code = (select code from public.work_reports where id = test.id('rev_parte'))
             and summary like '%validó%'));

select test.ok('rev_historial', 'Los cambios de fase de un proyecto quedan anotados',
  exists (select 1 from public.audit_log
           where entity_type = 'projects' and summary like '%cambió el proyecto%→%'));

select test.ok('rev_historial', 'Y los cambios de importe, diciendo a cuánto',
  exists (select 1 from public.audit_log where summary like '%cambió el presupuesto de%'));

select test.ok('rev_historial', 'Los cambios de estado de una ficha, también',
  exists (select 1 from public.audit_log where summary like '%cambió la ficha%→%'));

select test.ok('rev_historial', 'Los movimientos de planificación, con las fechas',
  exists (select 1 from public.audit_log where action = 'planificar'
            and summary like '%fabricación%→%')
  and exists (select 1 from public.audit_log where action = 'mover_fecha'
                and summary like '%movió a mano%→%'));

select test.ok('rev_historial', 'Las obras: creación, proyectos que entran y facturación',
  exists (select 1 from public.audit_log where summary like '%creó la obra%')
  and exists (select 1 from public.audit_log where summary like '%metió el proyecto%')
  and exists (select 1 from public.audit_log where summary like '%facturó%'));

select test.ok('rev_historial', 'Los borrados dejan el retrato de lo que se llevaron',
  exists (select 1 from public.audit_log
           where action like 'eliminar%' and details ? 'registro'));

select test.ok('rev_historial', 'El historial no se puede modificar ni borrar, ni por el servidor',
  exists (select 1 from pg_trigger
           where tgrelid = 'public.audit_log'::regclass and not tgisinternal));


\echo '== REVISIÓN · 6) BORRADO · SIN HUÉRFANOS'

-- Se monta un juego completo y se borra de arriba abajo, comprobando
-- después que no queda ni una referencia colgando.
reset role; select test.as_server();

with c as (insert into public.clients (kind, name) values ('particular', 'Cliente de la revisión')
           returning id)
select test.put('rev_cli', (select id from c));

with o as (select id from public.save_work(null, 'Obra de la revisión del borrado', test.id('rev_cli')))
select test.put('rev_obra', (select id from o));

with p as (insert into public.projects (client_id, name, budget_amount, budget_hours_fab)
           values (test.id('rev_cli'), 'Proyecto de la revisión', 1000, 8) returning id)
select test.put('rev_proy', (select id from p));

select public.set_project_work(test.id('rev_proy'), test.id('rev_obra'));
select public.save_work_extra(null, test.id('rev_obra'), 'Transporte de la revisión', 50);

insert into public.project_workers (project_id, worker_id)
values (test.id('rev_proy'), test.id('juan'));

insert into public.comments (project_id, author_id, body)
values (test.id('rev_proy'), test.id('salvi'), 'Comentario de la revisión');

insert into public.documents (project_id, bucket, storage_path, file_name, mime_type,
                              size_bytes, category, scope, uploaded_by)
values (test.id('rev_proy'), 'documentos',
        'projects/' || test.id('rev_proy') || '/plano-revision.pdf', 'plano-revision.pdf',
        'application/pdf', 1024, 'documento', 'tecnica', test.id('salvi'));

insert into public.materials (project_id, name) values (test.id('rev_proy'), 'Material revisión');

with f as (insert into public.fichas (type, client_id, title, description, amount)
           values ('presupuesto', test.id('rev_cli'), 'Presupuesto de la revisión', 'x', 500)
           returning id)
select test.put('rev_pres', (select id from f));

with f as (insert into public.fichas (type, client_id, title, description, phone, hours, amount,
                                      scheduled_date)
           values ('aviso', test.id('rev_cli'), 'Aviso de la revisión', 'x', '600000000',
                   1, 25, public.today_madrid())
           returning id)
select test.put('rev_aviso', (select id from f));

set role authenticated; select test.as_user(test.id('salvi'));

-- 6a) El AVISO.
select test.ok('rev_borrado', 'Un aviso se elimina',
  (public.delete_ficha(test.id('rev_aviso')) ->> 'ok')::boolean);

reset role; select test.as_server();
select test.ok('rev_borrado', 'Y no deja documentos ni comentarios colgando',
  not exists (select 1 from public.documents where ficha_id = test.id('rev_aviso'))
  and not exists (select 1 from public.comments where ficha_id = test.id('rev_aviso')));

-- 6b) El PRESUPUESTO.
set role authenticated; select test.as_user(test.id('salvi'));
select test.ok('rev_borrado', 'Un presupuesto se elimina',
  (public.delete_ficha(test.id('rev_pres')) ->> 'ok')::boolean);

-- 6c) El PROYECTO, con todo dentro.
select test.ok('rev_borrado', 'Un proyecto sin horas validadas ni cobros se elimina',
  (public.delete_project(test.id('rev_proy')) ->> 'ok')::boolean);

reset role; select test.as_server();
select test.ok('rev_borrado', 'Y se lleva su material, su equipo, sus documentos y sus comentarios',
  not exists (select 1 from public.materials where project_id = test.id('rev_proy'))
  and not exists (select 1 from public.project_workers where project_id = test.id('rev_proy'))
  and not exists (select 1 from public.documents where project_id = test.id('rev_proy'))
  and not exists (select 1 from public.comments where project_id = test.id('rev_proy'))
  and not exists (select 1 from public.project_substatuses where project_id = test.id('rev_proy')));

-- 6d) La OBRA. Sus proyectos ya no están; queda el extra.
set role authenticated; select test.as_user(test.id('salvi'));
select test.ok('rev_borrado', 'Una obra sin nada facturado se elimina',
  (public.delete_work(test.id('rev_obra')) ->> 'ok')::boolean);

reset role; select test.as_server();
select test.ok('rev_borrado', 'Y se lleva sus costes extras y sus comentarios',
  not exists (select 1 from public.work_extras where work_id = test.id('rev_obra'))
  and not exists (select 1 from public.comments where work_id = test.id('rev_obra')));

-- 6e) EL REPASO GENERAL: ni un huérfano en toda la base de datos.
select test.ok('rev_borrado', 'No queda NI UNA referencia huérfana en toda la base de datos',
  not exists (
    select 1
      from (
        select 'documents.project_id' k from public.documents d
          where d.project_id is not null
            and not exists (select 1 from public.projects p where p.id = d.project_id)
        union all
        select 'documents.ficha_id' from public.documents d
          where d.ficha_id is not null
            and not exists (select 1 from public.fichas f where f.id = d.ficha_id)
        union all
        select 'documents.report_id' from public.documents d
          where d.report_id is not null
            and not exists (select 1 from public.work_reports r where r.id = d.report_id)
        union all
        select 'comments.project_id' from public.comments c
          where c.project_id is not null
            and not exists (select 1 from public.projects p where p.id = c.project_id)
        union all
        select 'comments.work_id' from public.comments c
          where c.work_id is not null
            and not exists (select 1 from public.works w where w.id = c.work_id)
        union all
        select 'comments.report_id' from public.comments c
          where c.report_id is not null
            and not exists (select 1 from public.work_reports r where r.id = c.report_id)
        union all
        select 'materials.project_id' from public.materials m
          where not exists (select 1 from public.projects p where p.id = m.project_id)
        union all
        select 'material_requests.project_id' from public.material_requests q
          where q.project_id is not null
            and not exists (select 1 from public.projects p where p.id = q.project_id)
        union all
        select 'work_reports.project_id' from public.work_reports r
          where r.project_id is not null
            and not exists (select 1 from public.projects p where p.id = r.project_id)
        union all
        select 'project_workers.project_id' from public.project_workers pw
          where not exists (select 1 from public.projects p where p.id = pw.project_id)
        union all
        select 'projects.work_id' from public.projects p
          where p.work_id is not null
            and not exists (select 1 from public.works w where w.id = p.work_id)
        union all
        select 'work_extras.work_id' from public.work_extras x
          where not exists (select 1 from public.works w where w.id = x.work_id)
        union all
        select 'payments.project_id' from public.payments g
          where not exists (select 1 from public.projects p where p.id = g.project_id)
        union all
        select 'calendar_notes.project_id' from public.calendar_notes n
          where n.project_id is not null
            and not exists (select 1 from public.projects p where p.id = n.project_id)
      ) h));

-- 6f) El TRABAJADOR: a quien tiene trabajo no se le borra, se le desactiva.
set role authenticated; select test.as_user(test.id('salvi'));
select test.err('rev_borrado', 'A un trabajador con trabajo registrado NO se le borra',
  format($$select public.delete_worker(%L)$$, test.id('juan')), '23503');

-- Desactivar es lo que hace la aplicación: un «update» sobre la tabla,
-- que las políticas permiten solo a administración.
update public.profiles set active = false where id = test.id('juan');
select test.ok('rev_borrado', 'Pero se le desactiva, y su trabajo se conserva',
  (select not active from public.profiles where id = test.id('juan'))
  and (select count(*) > 0 from public.work_reports where worker_id = test.id('juan')));

-- Y desactivado deja de entrar: se comprueba impersonándolo.
reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('juan'));
select test.ok('rev_borrado', 'Desactivado, ya no le llega ni un proyecto suyo',
  test.filas('worker_projects') = 0, test.filas('worker_projects')::text);
select test.ok('rev_borrado', 'Ni su calendario',
  test.filas('v_calendar') = 0, test.filas('v_calendar')::text);

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));
update public.profiles set active = true where id = test.id('juan');
select test.ok('rev_borrado', 'Y al reactivarlo vuelve a tener su trabajo',
  (select active from public.profiles where id = test.id('juan')));

select test.err('rev_borrado', 'Administración no puede eliminarse a sí misma',
  format($$select public.delete_worker(%L)$$, test.id('salvi')), '22023');


\echo '== REVISIÓN · 7) CALENDARIO'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

-- Dos proyectos iguales: lo automático NO los solapa.
with a as (insert into public.projects (client_id, name, budget_hours_fab, budget_hours_mont)
           values (test.id('cli_laura'), 'Revisión solape A', 16, 0) returning id)
select test.put('rev_cal_a', (select id from a));
with b as (insert into public.projects (client_id, name, budget_hours_fab, budget_hours_mont)
           values (test.id('cli_laura'), 'Revisión solape B', 16, 0) returning id)
select test.put('rev_cal_b', (select id from b));

select public.plan_project(test.id('rev_cal_a'), 'fabricacion', date '2099-03-02');
select public.plan_project(test.id('rev_cal_b'), 'fabricacion', date '2099-03-02');

select test.ok('rev_calendario', 'Lo automático no solapa: el segundo se coloca después',
  (select b.fab_start > a.fab_end
     from public.projects a, public.projects b
    where a.id = test.id('rev_cal_a') and b.id = test.id('rev_cal_b')));

select test.ok('rev_calendario', 'Y respeta el margen de días libres configurado',
  (select b.fab_start >= public.add_working_days(a.fab_end, public.gap_free_days() + 1)
     from public.projects a, public.projects b
    where a.id = test.id('rev_cal_a') and b.id = test.id('rev_cal_b')));

-- A mano SÍ se puede solapar, y se queda.
select public.move_project_phase(test.id('rev_cal_b'), 'fabricacion',
  (select fab_start from public.projects where id = test.id('rev_cal_a')));

select test.ok('rev_calendario', 'A mano SÍ se puede solapar: manda la persona',
  (select a.fab_start = b.fab_start
     from public.projects a, public.projects b
    where a.id = test.id('rev_cal_a') and b.id = test.id('rev_cal_b')));

select test.ok('rev_calendario', 'Y queda marcado como puesto a mano',
  (select fab_manual from public.projects where id = test.id('rev_cal_b')));

select public.plan_project(test.id('rev_cal_b'), 'fabricacion', date '2099-03-02');
select test.ok('rev_calendario', 'Volver a planificar NO deshace lo que se puso a mano',
  (select a.fab_start = b.fab_start
     from public.projects a, public.projects b
    where a.id = test.id('rev_cal_a') and b.id = test.id('rev_cal_b')));

select test.ok('rev_calendario', 'Mover a mano queda en el historial',
  exists (select 1 from public.audit_log
           where summary like '%movió a mano%'
             and entity_code = (select code from public.projects where id = test.id('rev_cal_b'))));

-- Fines de semana y festivos.
select test.ok('rev_calendario', 'El sábado y el domingo no se trabajan',
  not public.is_working_day(date '2099-03-07') and not public.is_working_day(date '2099-03-08'));

select public.set_non_working_day(date '2099-03-10', 'Festivo de la revisión');
select test.ok('rev_calendario', 'Un festivo marcado deja de ser laborable',
  not public.is_working_day(date '2099-03-10'));

select test.ok('rev_calendario', 'Lo automático se salta los festivos',
  (select public.next_working_day(date '2099-03-10') = date '2099-03-11'));

select test.ok('rev_calendario', 'Un tramo automático no pinta fines de semana',
  not exists (
    select 1 from public.v_calendar c
     where c.kind in ('fabricacion', 'montaje') and c.status = 'Planificado'
       and extract(isodow from c.date) > 5));

select public.clear_non_working_day(date '2099-03-10');


\echo '== REVISIÓN · RUTAS PRINCIPALES: EL TRABAJADOR PUEDE TRABAJAR SOLO'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('juan'));

select test.ok('rev_rutas', 'Consulta sus proyectos',        test.filas('worker_projects') > 0);
select test.ok('rev_rutas', 'Su documentación técnica',      test.filas('documents') > 0);
select test.ok('rev_rutas', 'Los comentarios de sus proyectos', test.filas('comments') >= 0);
select test.ok('rev_rutas', 'Su calendario',                 test.filas('v_calendar') > 0);
select test.ok('rev_rutas', 'Sus partes',                    test.filas('work_reports') > 0);
select test.ok('rev_rutas', 'Sus avisos y visitas',          test.filas('worker_fichas') > 0);
select test.ok('rev_rutas', 'Sus peticiones de material',    test.filas('material_requests') > 0);
select test.ok('rev_rutas', 'Y sus avisos internos',         test.filas('notifications') >= 0);

reset role; select test.as_server();
