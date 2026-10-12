-- =====================================================================
-- METALPLAFER360 · PRUEBAS DE LA CONEXIÓN CON GOOGLE DRIVE (OAuth)
--
-- Lo importante aquí no es que funcione: es que NADIE pueda llegar al
-- permiso de Google desde la aplicación, por mucho que manipule la
-- petición. El token vive en la bóveda y solo lo lee el servidor.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== GOOGLE DRIVE · EL TOKEN NO SE PUEDE ALCANZAR'

set role authenticated;
select test.as_user(test.id('juan'));          -- un trabajador

select test.err('drive', 'Un trabajador no puede leer el permiso de Google',
  $$select public.drive_get_token()$$, '42501');

select test.err('drive', 'Ni guardar uno nuevo',
  $$select public.drive_put_token('token-robado')$$, '42501');

select test.err('drive', 'Ni borrarlo',
  $$select public.drive_forget_token()$$, '42501');

select test.err('drive', 'Ni dar por conectada una cuenta suya',
  $$select public.drive_mark_connected('ladron@example.com', 'x', 'x')$$, '42501');

select test.err('drive', 'Ni desconectar Google Drive',
  $$select public.drive_disconnect()$$, '42501');

select test.err('drive', 'Ni siquiera mirar cómo está la conexión',
  $$select public.drive_status()$$, '42501');

\echo '== ADMINISTRACIÓN TAMPOCO TOCA EL TOKEN'

reset role; set role authenticated;
select test.as_user(test.id('salvi'));         -- administración

-- Administración manda en la aplicación, pero el permiso de Google es
-- cosa del servidor: ni siquiera quien manda puede sacarlo de la bóveda.
select test.err('drive', 'Administración tampoco puede leer el permiso de Google',
  $$select public.drive_get_token()$$, '42501');

select test.err('drive', 'Ni escribir uno a mano',
  $$select public.drive_put_token('token-inventado')$$, '42501');

select test.ok('drive', 'Pero sí puede ver cómo está la conexión',
  (public.drive_status() ->> 'estado') = 'sin_conectar');

\echo '== LAS TABLAS NO ENSEÑAN NADA DE MÁS'

select test.err('drive', 'El «state» de la autorización ni siquiera se puede consultar',
  $$select count(*) from public.google_oauth_state$$, '42501');

select test.err('drive', 'Ni escribir en él para colarse en la vuelta de Google',
  $$insert into public.google_oauth_state (state) values ('inventado')$$, '42501');

select test.err('drive', 'La conexión no se puede falsear a mano',
  $$update public.google_drive_connection set connected = true where id = 1$$, '42501');

reset role; set role authenticated;
select test.as_user(test.id('juan'));
select test.ok('drive', 'Un trabajador no ve ni la fila del estado',
  (select count(*) = 0 from public.google_drive_connection));

\echo '== EL CAMINO DE VERDAD, COMO LO HACE EL SERVIDOR'

reset role; select test.as_server();

select public.drive_put_token('permiso-duradero-de-prueba');

select test.ok('drive', 'El servidor guarda el permiso y lo vuelve a leer',
  public.drive_get_token() = 'permiso-duradero-de-prueba');

select test.ok('drive', 'Y queda en la bóveda, no en una tabla de la aplicación',
  exists (select 1 from vault.secrets where name = 'm360_google_refresh_token'));

-- Volver a conectar sustituye el permiso, no acumula uno nuevo.
select public.drive_put_token('permiso-renovado');
select test.ok('drive', 'Reconectar sustituye el permiso anterior',
  public.drive_get_token() = 'permiso-renovado'
  and (select count(*) = 1 from vault.secrets where name = 'm360_google_refresh_token'));

select public.drive_mark_connected('metalplafer@gmail.com',
  'carpeta-123', 'METALPLAFER360 · Copias de seguridad', test.id('salvi'));

set role authenticated; select test.as_user(test.id('salvi'));
select test.setnote('estado', public.drive_status()::text);

select test.ok('drive', 'La pantalla ve que está conectado, y con qué cuenta',
  (test.note('estado')::jsonb ->> 'estado') = 'conectado'
  and (test.note('estado')::jsonb ->> 'cuenta') = 'metalplafer@gmail.com');

select test.ok('drive', 'Y en qué carpeta se guardan las copias',
  (test.note('estado')::jsonb ->> 'carpeta') = 'METALPLAFER360 · Copias de seguridad');

select test.ok('drive', 'Lo que ve la pantalla NO incluye el permiso de Google',
  test.note('estado') not like '%permiso-renovado%'
  and not (test.note('estado')::jsonb ? 'refresh_token')
  and not (test.note('estado')::jsonb ? 'token'));

select test.ok('drive', 'Conectar queda registrado en el historial',
  exists (select 1 from public.audit_log where summary like '%conectó Google Drive%'));

\echo '== CUANDO ALGO FALLA'

reset role; select test.as_server();
select public.drive_mark_error('Google ya no acepta el permiso guardado.');

set role authenticated; select test.as_user(test.id('salvi'));
select test.ok('drive', 'Un fallo se ve en la pantalla como «error de conexión»',
  (public.drive_status() ->> 'estado') = 'error'
  and (public.drive_status() ->> 'error') like '%ya no acepta%');

reset role; select test.as_server();
select public.drive_mark_ok();

set role authenticated; select test.as_user(test.id('salvi'));
select test.ok('drive', 'Y una subida correcta lo deja otra vez en verde',
  (public.drive_status() ->> 'estado') = 'conectado'
  and (public.drive_status() ->> 'ultima_copia') is not null);

\echo '== DESCONECTAR'

reset role; select test.as_server();
select public.drive_disconnect(test.id('salvi'));

select test.ok('drive', 'Desconectar borra el permiso de la bóveda',
  public.drive_get_token() is null
  and not exists (select 1 from vault.secrets where name = 'm360_google_refresh_token'));

set role authenticated; select test.as_user(test.id('salvi'));
select test.ok('drive', 'Y la pantalla vuelve a decir «no conectado»',
  (public.drive_status() ->> 'estado') = 'sin_conectar');

select test.ok('drive', 'Desconectar también queda en el historial',
  exists (select 1 from public.audit_log where summary like '%desconectó Google Drive%'));

reset role;
