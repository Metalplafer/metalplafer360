-- =====================================================================
-- METALPLAFER360 · PRUEBAS DE BASE DE DATOS Y SEGURIDAD (FASE 1)
--
-- Cada bloque se ejecuta con el ROL REAL de PostgreSQL (anon,
-- authenticated o service_role), igual que haría el navegador a través
-- de la API de Supabase. No se simulan permisos: se comprueban.
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
reset role;

create schema if not exists test;
grant usage on schema test to anon, authenticated, service_role;
create table if not exists test.ids (name text primary key, id uuid);
create table if not exists test.results (n serial, area text, name text, ok boolean);
grant all on test.ids, test.results, test.results_n_seq to anon, authenticated, service_role;

create or replace function test.id(p text) returns uuid language sql stable as $$
  select id from test.ids where name = p $$;
create or replace function test.put(p text, v uuid) returns uuid language sql as $$
  insert into test.ids values (p, v) on conflict (name) do update set id = excluded.id returning id $$;

create or replace function test.ok(p_area text, p_name text, p_cond boolean) returns void
language plpgsql as $$
begin
  insert into test.results (area, name, ok) values (p_area, p_name, coalesce(p_cond, false));
  if not coalesce(p_cond, false) then raise exception 'FALLO [%] %', p_area, p_name; end if;
end $$;

-- Comprueba que una operación es RECHAZADA con el código de error esperado.
create or replace function test.err(p_area text, p_name text, p_sql text, p_state text) returns void
language plpgsql as $$
begin
  execute p_sql;
  perform test.ok(p_area, p_name || ' (se esperaba el error ' || p_state || ')', false);
exception when others then
  if sqlstate = 'P0001' and sqlerrm like 'FALLO%' then raise; end if;
  perform test.ok(p_area, p_name, sqlstate like p_state);
end $$;

create or replace function test.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', p, 'role', 'authenticated')::text, false) $$;
create or replace function test.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', false) $$;
create or replace function test.as_server() returns void language sql as $$
  select set_config('request.jwt.claims', '', false) $$;
grant execute on all functions in schema test to anon, authenticated, service_role;


\echo '== INSTALACIÓN'
select test.ok('instalacion', 'Las 4 tablas base existen',
  (select count(*) = 4 from pg_tables where schemaname = 'public'
    and tablename in ('profiles', 'app_settings', 'code_counters', 'audit_log')));
select test.ok('instalacion', 'RLS activado en todas las tablas de public',
  (select bool_and(rowsecurity) from pg_tables where schemaname = 'public'));
select test.ok('instalacion', 'Bucket «documentos» privado con límite de 100 MB',
  exists (select 1 from storage.buckets where id = 'documentos' and not public and file_size_limit = 104857600));
select test.ok('instalacion', 'Configuración inicial creada',
  (select count(*) = 1 from public.app_settings where id = 1));
select test.ok('instalacion', 'Zona horaria Europe/Madrid en today_madrid()',
  public.today_madrid() = (now() at time zone 'Europe/Madrid')::date);


\echo '== ALTA DE USUARIOS'
-- Así es exactamente como Supabase crea usuarios (panel o Edge Function):
-- se inserta en auth.users y el perfil aparece solo.
insert into auth.users (email, raw_user_meta_data)
values ('salvi@metalplafer.com', '{"full_name":"Salvi","username":"salvi"}');
select test.put('salvi', (select id from auth.users where email = 'salvi@metalplafer.com'));
select test.ok('usuarios', 'El primer usuario creado es ADMINISTRADOR',
  (select role = 'admin' and full_name = 'Salvi' and username = 'salvi' and active
     from public.profiles where id = test.id('salvi')));

insert into auth.users (email, raw_user_meta_data)
values ('juan@metalplafer.com', '{"full_name":"Juan Ortega","username":"juan"}');
select test.put('juan', (select id from auth.users where email = 'juan@metalplafer.com'));
select test.ok('usuarios', 'El segundo usuario nace como TRABAJADOR',
  (select role = 'worker' from public.profiles where id = test.id('juan')));

-- Intento de escalada de privilegios desde el propio registro:
insert into auth.users (email, raw_user_meta_data)
values ('pedro@metalplafer.com', '{"full_name":"Pedro Navarro","username":"pedro","role":"admin"}');
select test.put('pedro', (select id from auth.users where email = 'pedro@metalplafer.com'));
select test.ok('usuarios', 'Pedir rol «admin» al registrarse NO lo concede',
  (select role = 'worker' from public.profiles where id = test.id('pedro')));

insert into auth.users (email, raw_user_meta_data)
values ('montse@metalplafer.com', '{"full_name":"Montse Grau","username":"montse"}');
select test.put('montse', (select id from auth.users where email = 'montse@metalplafer.com'));
reset role;
update public.profiles set role = 'admin' where id = test.id('montse');   -- promoción desde el SQL Editor
select test.ok('usuarios', 'Un administrador técnico puede promover desde Supabase',
  (select role = 'admin' from public.profiles where id = test.id('montse')));

select test.ok('usuarios', 'Nombre de usuario duplicado no deja a nadie sin perfil',
  (select count(*) = 4 from public.profiles));


\echo '== SIN SESIÓN (rol anon)'
set role anon; select test.as_anon();
select test.err('anon', 'No puede leer los usuarios',      'select * from public.profiles',     '42501');
select test.err('anon', 'No puede leer la configuración',  'select * from public.app_settings', '42501');
select test.err('anon', 'No puede leer el historial',      'select * from public.audit_log',    '42501');
select test.err('anon', 'No puede consultar si es admin',  'select public.is_admin()',          '42501');
select test.err('anon', 'No puede generar códigos',        'select public.next_code(''PROY'')', '42501');
reset role;


\echo '== ADMINISTRACIÓN'
set role authenticated; select test.as_user(test.id('salvi'));
select test.ok('admin', 'is_admin() es cierto para Salvi', public.is_admin());
select test.ok('admin', 'Ve a los 4 usuarios', (select count(*) = 4 from public.profiles));
select test.ok('admin', 'Puede leer la configuración', (select count(*) = 1 from public.app_settings));
select test.ok('admin', 'Puede leer el historial completo', (select count(*) > 0 from public.audit_log));
update public.app_settings set max_file_mb = 100 where id = 1;
select test.ok('admin', 'Puede cambiar la configuración',
  (select max_file_mb = 100 from public.app_settings where id = 1));
update public.profiles set full_name = 'Juan Ortega Ruiz' where id = test.id('juan');
select test.ok('admin', 'Puede corregir los datos de un trabajador',
  (select full_name = 'Juan Ortega Ruiz' from public.profiles where id = test.id('juan')));
update public.profiles set active = false where id = test.id('pedro');
select test.ok('admin', 'Puede desactivar a un trabajador',
  (select not active from public.profiles where id = test.id('pedro')));
update public.profiles set active = true where id = test.id('pedro');

select test.err('admin', 'No puede borrar usuarios desde la aplicación',
  $$delete from public.profiles where id = test.id('pedro')$$, '42501');
select test.err('admin', 'No puede escribir en el historial',
  $$insert into public.audit_log (action, entity_type, summary) values ('x','x','x')$$, '42501');
select test.err('admin', 'No puede modificar el historial',
  $$update public.audit_log set summary = 'manipulado'$$, '42501');
select test.err('admin', 'No puede borrar el historial',
  $$delete from public.audit_log$$, '42501');
select test.err('admin', 'No puede exportar datos como si fuera el servidor',
  $$select public.next_code('PROY')$$, '42501');
select test.ok('admin', 'El historial registró el alta de usuarios',
  exists (select 1 from public.audit_log where summary like '%creó el usuario Salvi (administración)%'));
select test.ok('admin', 'El historial registró la desactivación',
  exists (select 1 from public.audit_log where summary like 'Salvi desactivó al usuario%'));


\echo '== TRABAJADOR (Juan)'
select test.as_user(test.id('juan'));
select test.ok('trabajador', 'is_admin() es falso', not public.is_admin());
select test.ok('trabajador', 'my_role() devuelve «worker»', public.my_role() = 'worker');
select test.ok('trabajador', 'Ve su ficha y la de los 2 administradores, no la de otros trabajadores',
  (select count(*) = 3 and bool_and(id = test.id('juan') or role = 'admin') from public.profiles));
select test.ok('trabajador', 'NO ve la ficha de Pedro (otro trabajador)',
  not exists (select 1 from public.profiles where id = test.id('pedro')));
select test.ok('trabajador', 'NO ve la configuración de la aplicación',
  (select count(*) = 0 from public.app_settings));
select test.ok('trabajador', 'NO ve la numeración interna',
  (select count(*) = 0 from public.code_counters));
select test.ok('trabajador', 'Conoce el límite de subida sin ver la configuración',
  (public.client_config() ->> 'max_file_mb')::int = 100);

-- Escaladas de privilegios
update public.profiles set role = 'admin' where id = test.id('juan');
select test.ok('seguridad', 'No puede ascenderse a administrador',
  (select role = 'worker' from public.profiles where id = test.id('juan')));
update public.profiles set active = false, username = 'otro' where id = test.id('juan');
select test.ok('seguridad', 'No puede cambiar su estado ni su nombre de usuario',
  (select active and username = 'juan' from public.profiles where id = test.id('juan')));
update public.profiles set full_name = 'HACKEADO' where id = test.id('salvi');
select test.ok('seguridad', 'No puede modificar la ficha de un administrador',
  (select full_name = 'Salvi' from public.profiles where id = test.id('salvi')));
update public.app_settings set max_file_mb = 500 where id = 1;
reset role; set role authenticated; select test.as_user(test.id('juan'));
select test.ok('seguridad', 'No puede cambiar la configuración',
  (select max_file_mb = 100 from public.app_settings where id = 1) is not false);
select test.err('seguridad', 'No puede crear usuarios',
  $$insert into public.profiles (id, full_name) values (gen_random_uuid(), 'Falso')$$, '42501');
select test.err('seguridad', 'No puede generar códigos internos',
  $$select public.next_code('OT')$$, '42501');
select test.ok('seguridad', 'Solo ve en el historial lo que ha hecho él',
  (select count(*) = 0 from public.audit_log where actor_id is distinct from test.id('juan')));

-- Cambios propios permitidos
update public.profiles set full_name = 'Juan Ortega', phone = '600111222',
       preferences = '{"vista":"lista"}'::jsonb where id = test.id('juan');
select test.ok('trabajador', 'Sí puede corregir su nombre, teléfono y preferencias',
  (select full_name = 'Juan Ortega' and phone = '600111222' from public.profiles where id = test.id('juan')));


\echo '== ALMACENAMIENTO DE ARCHIVOS'
select test.err('storage', 'Un trabajador no puede subir archivos todavía',
  $$insert into storage.objects (bucket_id, name) values ('documentos', 'projects/x/plano.pdf')$$, '42501');
select test.as_user(test.id('salvi'));
insert into storage.objects (bucket_id, name) values ('documentos', 'projects/x/plano.pdf');
select test.ok('storage', 'Administración sí puede subir archivos',
  (select count(*) = 1 from storage.objects));
select test.as_user(test.id('juan'));
select test.ok('storage', 'Un trabajador no ve archivos que no le corresponden',
  (select count(*) = 0 from storage.objects));
reset role;


\echo '== USUARIO DESACTIVADO'
select test.as_server();   -- igual que el SQL Editor de Supabase: sin sesión de navegador
update public.profiles set active = false where id = test.id('pedro');
set role authenticated; select test.as_user(test.id('pedro'));
select test.ok('desactivado', 'Un usuario desactivado no es usuario activo', not public.is_active_user());
select test.ok('desactivado', 'Un usuario desactivado no ve a nadie más que a sí mismo',
  (select count(*) = 1 from public.profiles));
select test.ok('desactivado', 'Un usuario desactivado no obtiene configuración',
  public.client_config() = '{}'::jsonb);
reset role; select test.as_server();
update public.profiles set active = true where id = test.id('pedro');


\echo '== PROTECCIÓN DE ADMINISTRADORES'
set role authenticated; select test.as_user(test.id('salvi'));
update public.profiles set role = 'worker' where id = test.id('montse');
select test.err('proteccion', 'No puede quedarse la empresa sin ningún administrador',
  $$update public.profiles set role = 'worker' where id = test.id('salvi')$$, '23514');
select test.err('proteccion', 'Tampoco desactivando al último administrador',
  $$update public.profiles set active = false where id = test.id('salvi')$$, '23514');
select test.ok('proteccion', 'Salvi sigue siendo administrador activo',
  (select role = 'admin' and active from public.profiles where id = test.id('salvi')));
reset role;


\echo '== NUMERACIÓN ANUAL'
select test.as_server();
select test.ok('numeracion', 'El primer código del año es PROY-AAAA-001',
  public.next_code('PROY') = 'PROY-' || extract(year from public.today_madrid())::int || '-001');
select test.ok('numeracion', 'El segundo es PROY-AAAA-002',
  public.next_code('PROY') = 'PROY-' || extract(year from public.today_madrid())::int || '-002');
select test.ok('numeracion', 'Cada prefijo lleva su propia serie',
  public.next_code('OT') = 'OT-' || extract(year from public.today_madrid())::int || '-001');
select test.ok('numeracion', 'Las series de 2027 empezarán de nuevo en 001',
  not exists (select 1 from public.code_counters
               where year <> extract(year from public.today_madrid())::int));
reset role;
