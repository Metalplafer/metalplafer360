-- =====================================================================
-- METALPLAFER360 · PRUEBAS DE LA FASE 7 (auditoría final)
--
-- Cada prueba de aquí corresponde a un fallo que la auditoría encontró
-- de verdad y que se corrigió. Están para que no vuelva a pasar.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== SEGURIDAD · BORRADOS MASIVOS'

-- Lo más grave que encontró la auditoría: TRUNCATE vacía una tabla de
-- golpe y NO pasa por las políticas de seguridad. Un trabajador con
-- sesión podía borrar todos los documentos de la empresa.
set role authenticated;
select test.as_user(test.id('juan'));

select test.err('borrados', 'Un trabajador NO puede vaciar los documentos',
  $$truncate public.documents$$, '42501');

select test.err('borrados', 'Ni los subestados de los proyectos',
  $$truncate public.project_substatuses$$, '42501');

select test.err('borrados', 'Ni los contactos de los clientes',
  $$truncate public.client_contacts$$, '42501');

-- Borrar fila a fila SÍ pasa por las políticas de seguridad, así que
-- ahí la RLS ya hacía su trabajo: la orden se ejecuta y no borra nada.
select test.setnote('docs_antes', (select count(*)::text from public.documents));
delete from public.documents;
select test.ok('borrados', 'Un trabajador tampoco puede borrar documentos fila a fila',
  (select count(*)::text from public.documents) = test.note('docs_antes'));

select test.ok('borrados', 'Nadie con sesión puede vaciar una tabla de golpe',
  not exists (select 1 from information_schema.role_table_grants
               where grantee in ('authenticated', 'anon') and table_schema = 'public'
                 and privilege_type = 'TRUNCATE'));

select test.ok('borrados', 'Y el único borrado que queda abierto es el de la papelera',
  (select array_agg(distinct table_name::text order by table_name::text)
     from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public'
      and privilege_type = 'DELETE') = array['documents']);

reset role; select test.as_server();
select test.err('borrados', 'El historial no se puede vaciar ni desde el servidor',
  $$set local role service_role; truncate public.audit_log$$, '42501');

\echo '== SEGURIDAD · LAS HORAS TRABAJADAS NO SE PUEDEN PERDER'

-- Antes, borrar a alguien en Supabase > Authentication arrastraba en
-- cascada sus partes de trabajo, con las horas ya facturadas dentro.
select test.err('personas', 'Borrar a alguien con horas apuntadas se rechaza',
  format('delete from auth.users where id = %L', test.id('juan')), '23503');

select test.ok('personas', 'Y sus horas siguen ahí',
  (select count(*) > 0 from public.work_order_workers where worker_id = test.id('juan')));

select test.ok('personas', 'A la gente se la desactiva, no se la borra',
  (select active from public.profiles where id = test.id('juan')) is not null);

\echo '== INTEGRIDAD · LOS CÓDIGOS SON PARA SIEMPRE'

set role authenticated; select test.as_user(test.id('salvi'));

select test.err('codigos', 'Administración no puede reescribir el código de una ficha',
  $$update public.fichas set code = 'INVENTADO-1'
     where id = (select id from public.fichas limit 1)$$, '42501');

select test.err('codigos', 'Ni el de un proyecto',
  $$update public.projects set code = 'INVENTADO-2'
     where id = (select id from public.projects limit 1)$$, '42501');

select test.err('codigos', 'Ni el de una orden de trabajo',
  $$update public.work_orders set code = 'INVENTADO-3'
     where id = (select id from public.work_orders limit 1)$$, '42501');

\echo '== ARCHIVOS · EL LÍMITE HACE CASO AL AJUSTE'

reset role; select test.as_server();
select test.setnote('mb_antes', (select max_file_mb::text from public.app_settings where id = 1));
update public.app_settings set max_file_mb = 10 where id = 1;

select test.err('archivos', 'Un archivo más grande que el ajuste se rechaza',
  $$insert into public.documents (project_id, bucket, storage_path, file_name, category,
                                  size_bytes, mime_type)
    values ((select id from public.projects limit 1), 'documentos', 'x/grande.pdf',
            'grande.pdf', 'documento', 20971520, 'application/pdf')$$, '22023');

insert into public.documents (project_id, bucket, storage_path, file_name, category,
                              size_bytes, mime_type)
values ((select id from public.projects limit 1), 'documentos', 'x/cabe.pdf',
        'cabe.pdf', 'documento', 1048576, 'application/pdf');

select test.ok('archivos', 'Y uno que cabe entra sin problema',
  exists (select 1 from public.documents where file_name = 'cabe.pdf'));

update public.app_settings set max_file_mb = test.note('mb_antes')::int where id = 1;

\echo '== COBROS · SE ANULAN, NO SE BORRAN'

set role authenticated; select test.as_user(test.id('salvi'));
select test.setnote('cobros_antes', (select count(*)::text from public.payments));
select test.setnote('cobro', (select id::text from public.payments where voided_at is null limit 1));

select public.delete_payment(test.note('cobro')::uuid);

select test.ok('cobros', 'El cobro anulado NO desaparece de la base de datos',
  (select count(*)::text from public.payments) = test.note('cobros_antes'));

select test.ok('cobros', 'Queda marcado como anulado, con quién y cuándo',
  (select voided_at is not null and voided_by is not null
     from public.payments where id = test.note('cobro')::uuid));

select test.ok('cobros', 'Y deja de contar en el total cobrado',
  (select cobrado = 0 from public.project_billing
    where project_id = (select project_id from public.payments
                         where id = test.note('cobro')::uuid)));

select test.ok('cobros', 'El historial dice que se anuló, no que se modificó',
  exists (select 1 from public.audit_log where summary like '%anuló un cobro%'));

select test.err('cobros', 'Anular dos veces el mismo cobro avisa',
  format('select public.delete_payment(%L)', test.note('cobro')), '22023');

\echo '== CONTACTOS · SE ARCHIVAN'

insert into public.client_contacts (client_id, name, role)
values ((select id from public.clients limit 1), 'Contacto de prueba', 'Obra');

select public.archive_contact(
  (select id from public.client_contacts where name = 'Contacto de prueba'));

select test.ok('contactos', 'Un contacto se archiva y deja de estar a la vista',
  (select archived_at is not null from public.client_contacts
    where name = 'Contacto de prueba'));

select test.ok('contactos', 'Y sigue estando, para no perder el historial',
  exists (select 1 from public.client_contacts where name = 'Contacto de prueba'));

\echo '== RESTAURAR · LA NUMERACIÓN QUEDA LISTA'

reset role; select test.as_server();
update public.code_counters set last_value = 0;
set role authenticated; select test.as_user(test.id('salvi'));

select public.restore_data(jsonb_build_object('clients', jsonb_build_array(jsonb_build_object(
  'id', '00000000-0000-4000-8000-0000000000d1', 'kind', 'empresa',
  'name', 'Cliente de la copia', 'active', 'true',
  'created_at', now()::text, 'updated_at', now()::text))), array['clientes']);

select test.ok('restaurar', 'Tras restaurar, cada contador queda por encima del código más alto',
  not exists (
    select 1 from public.code_counters c
     where c.last_value < coalesce((
       select max(split_part(code, '-', 3)::int) from (
         select code from public.fichas      where code like c.prefix || '-' || c.year || '-%'
         union all
         select code from public.projects    where code like c.prefix || '-' || c.year || '-%'
         union all
         select code from public.work_orders where code like c.prefix || '-' || c.year || '-%'
       ) t), 0)));

select test.err('restaurar', 'Una copia que choca con un código existente se explica en castellano',
  $$select public.restore_data(jsonb_build_object('fichas', jsonb_build_array(jsonb_build_object(
      'id', '00000000-0000-4000-8000-0000000000d9',
      'code', (select code from public.fichas limit 1),
      'type', 'presupuesto',
      'client_id', (select id from public.clients limit 1)::text,
      'title', 'Choca', 'status', 'por_asignar',
      'created_at', now()::text, 'updated_at', now()::text))), array['fichas'])$$, '22023');

\echo '== DATOS DE EJEMPLO'

select test.setnote('reales_antes', (
  select (count(*) filter (where not is_demo))::text from public.clients));

select test.setnote('demo', public.seed_demo()::text);

select test.ok('demo', 'El ejemplo trae 10 clientes',
  (test.note('demo')::jsonb ->> 'clientes')::int = 10);
select test.ok('demo', 'Y 15 fichas',
  (test.note('demo')::jsonb ->> 'fichas')::int = 15);
select test.ok('demo', 'Y 8 proyectos',
  (test.note('demo')::jsonb ->> 'proyectos')::int = 8);
select test.ok('demo', 'Y 6 trabajadores',
  (test.note('demo')::jsonb ->> 'trabajadores')::int = 6);
select test.ok('demo', 'Y 20 órdenes de trabajo',
  (test.note('demo')::jsonb ->> 'ordenes')::int = 20);
select test.ok('demo', 'Y material y documentos',
  (test.note('demo')::jsonb ->> 'materiales')::int > 0
  and (test.note('demo')::jsonb ->> 'documentos')::int > 0);

select test.ok('demo', 'Las órdenes de ejemplo llevan sus partes y sus horas',
  (select count(*) > 0 from public.work_order_workers w
     join public.work_orders o on o.id = w.order_id
    where o.is_demo and w.hours > 0));

select test.ok('demo', 'Hay proyectos de ejemplo en todas las fases',
  (select count(distinct phase) >= 4 from public.projects where is_demo));

select test.err('demo', 'No se puede poner el ejemplo dos veces sin limpiarlo',
  $$select public.seed_demo()$$, '22023');

-- Lo que de verdad importa: limpiar el ejemplo NO puede tocar lo real.
select test.setnote('reales_medio', (
  select (count(*) filter (where not is_demo))::text from public.clients));

select test.setnote('limpieza', public.clear_demo()::text);

select test.ok('demo', 'Limpiar el ejemplo borra todo lo de ejemplo',
  not exists (select 1 from public.clients where is_demo)
  and not exists (select 1 from public.projects where is_demo)
  and not exists (select 1 from public.work_orders where is_demo)
  and not exists (select 1 from public.profiles where is_demo)
  and not exists (select 1 from public.materials where is_demo)
  and not exists (select 1 from public.payments where is_demo));

select test.ok('demo', 'Y NO toca ni un solo dato de verdad',
  (select (count(*) filter (where not is_demo))::text from public.clients)
    = test.note('reales_antes'));

select test.ok('demo', 'La limpieza dice cuántos registros se llevó',
  (test.note('limpieza')::jsonb ->> 'total')::int > 100);

select test.ok('demo', 'Y queda anotada en el historial',
  exists (select 1 from public.audit_log where summary like '%limpió los datos de ejemplo%'));

\echo '== ÍNDICES QUE FALTABAN'

select test.ok('indices', 'Toda columna de clave foránea tiene su índice',
  not exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where c.contype = 'f' and n.nspname = 'public'
       and not exists (
         select 1 from pg_index i
          where i.indrelid = c.conrelid
            and i.indpred is null
            and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey)));

reset role;
