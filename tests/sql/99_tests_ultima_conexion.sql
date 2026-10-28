-- =====================================================================
-- METALPLAFER360 · LA ÚLTIMA CONEXIÓN
--
-- Lo que importa aquí:
--
--   · que la fecha sea la de VERDAD, la que mantiene Supabase Auth, y no
--     una copia nuestra que pueda quedarse vieja;
--   · que quien no ha entrado nunca salga VACÍO, y no con la fecha de
--     alta de su cuenta disfrazada de conexión;
--   · que administración vea a todo el mundo, incluidos los otros
--     administradores;
--   · que un trabajador solo se vea a sí mismo;
--   · que «auth.users» siga sin poder leerse, que es lo que de verdad
--     hay que proteger: ahí están las contraseñas cifradas y los tokens;
--   · que la vista no arrastre ni una columna más de las tres que hacen
--     falta;
--   · y que entrar actualice la fecha SIN que nosotros escribamos nada.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== ÚLTIMA CONEXIÓN · DE DÓNDE SALE'

reset role; select test.as_server();

select test.ok('uc_vista', 'La vista existe y no es de las que se ejecutan con permisos de quien pregunta',
  exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'user_last_sign_in' and c.relkind = 'v')
  and not exists (select 1 from pg_class
                   where relname = 'user_last_sign_in'
                     and reloptions @> array['security_invoker=true']),
  (select array_to_string(reloptions, ', ') from pg_class where relname = 'user_last_sign_in'));

-- Si se ejecutara con los permisos de quien pregunta no podría leer
-- «auth.users» y devolvería un error en vez de la fecha. Es justo lo que
-- la hace funcionar, así que se deja fijado.

-- Esta prueba exigía TRES columnas. Ahora son CUATRO: el archivo 62
-- añadió «last_activity_at» al final para la última actividad. No se ha
-- relajado nada —se sigue exigiendo la lista exacta y en orden—, lo que
-- ha cambiado es cuál es la lista correcta.
--
-- Y el orden importa de verdad, no es manía: «create or replace view»
-- solo deja AÑADIR columnas al final. Si alguien colara la nueva en
-- medio, la migración fallaría en vuestra base de datos con una vista ya
-- creada. Que las tres de siempre sigan donde estaban es justo lo que
-- esta prueba protege.
select test.ok('uc_vista', 'Devuelve exactamente cuatro columnas, en orden, y ninguna es un secreto',
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'user_last_sign_in')
  = array['user_id', 'last_sign_in_at', 'account_created_at', 'last_activity_at'],
  (select string_agg(column_name, ', ' order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'user_last_sign_in'));

-- El juego de pruebas: una conexión de hace un rato, otra de hace días y
-- alguien que no ha entrado nunca.
update auth.users set last_sign_in_at = now() - interval '2 hours'
 where id = test.id('salvi');
update auth.users set last_sign_in_at = now() - interval '9 days'
 where id = test.id('juan');
update auth.users set last_sign_in_at = null
 where id = test.id('montse');


\echo '== ÚLTIMA CONEXIÓN · LO QUE VE ADMINISTRACIÓN'

set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('uc_admin', 'Administración ve una fila por persona, ni una más ni una menos',
  (select count(*) from public.user_last_sign_in)
    = (select count(*) from public.profiles),
  (select format('%s filas para %s perfiles',
                 (select count(*) from public.user_last_sign_in),
                 (select count(*) from public.profiles))));

-- Se compara en dos pasos a propósito: administración NO puede leer
-- «auth.users» —y así tiene que ser—, así que se apunta lo que devuelve
-- la vista y se contrasta con el dato de verdad desde el servidor.
select test.setnote('uc_juan_vista',
  (select last_sign_in_at::text from public.user_last_sign_in
    where user_id = test.id('juan')));

reset role; select test.as_server();
select test.ok('uc_admin', 'La fecha es EXACTAMENTE la que guarda Supabase Auth',
  (select last_sign_in_at::text from auth.users where id = test.id('juan'))
    = test.note('uc_juan_vista'),
  format('auth %s · vista %s',
         (select last_sign_in_at::text from auth.users where id = test.id('juan')),
         test.note('uc_juan_vista')));
set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('uc_admin', 'Los administradores también salen, con la suya',
  (select last_sign_in_at is not null and last_sign_in_at > now() - interval '3 hours'
     from public.user_last_sign_in where user_id = test.id('salvi')));

-- LA COMPROBACIÓN QUE IMPORTA: quien no ha entrado nunca no se inventa.
select test.ok('uc_admin', 'Quien no ha entrado nunca sale VACÍO',
  (select last_sign_in_at is null
     from public.user_last_sign_in where user_id = test.id('montse')));

select test.ok('uc_admin', 'Y no se le cuela la fecha de alta de la cuenta como si fuera una conexión',
  (select last_sign_in_at is null and account_created_at is not null
     from public.user_last_sign_in where user_id = test.id('montse')));

select test.ok('uc_admin', 'Las dos fechas son cosas distintas y no se confunden',
  (select s.last_sign_in_at is distinct from s.account_created_at
     from public.user_last_sign_in s where s.user_id = test.id('juan')));


\echo '== ÚLTIMA CONEXIÓN · ENTRAR LA ACTUALIZA, SIN QUE ESCRIBAMOS NADA'

-- Se reproduce lo que hace Supabase Auth al iniciar sesión: actualiza su
-- propia columna. Nosotros no apuntamos nada en ningún sitio.
select test.setnote('uc_perfil_antes',
  (select updated_at::text from public.profiles where id = test.id('juan')));

reset role; select test.as_server();
update auth.users set last_sign_in_at = now() where id = test.id('juan');
set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('uc_entrar', 'Al entrar, la última conexión pasa a ser ahora',
  (select last_sign_in_at > now() - interval '1 minute'
     from public.user_last_sign_in where user_id = test.id('juan')));

select test.ok('uc_entrar', 'Y el perfil NO se ha tocado: no guardamos nada por nuestra cuenta',
  (select updated_at::text from public.profiles where id = test.id('juan'))
    = test.note('uc_perfil_antes'),
  format('antes %s, ahora %s', test.note('uc_perfil_antes'),
         (select updated_at::text from public.profiles where id = test.id('juan'))));

select test.ok('uc_entrar', 'No existe ninguna columna de última conexión en «profiles»',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles'
                 and column_name like '%sign_in%' or column_name like '%last_seen%'),
  (select string_agg(column_name, ', ') from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'));


\echo '== ÚLTIMA CONEXIÓN · QUIÉN PUEDE VERLA'

select test.as_user(test.id('juan'));

select test.ok('uc_permisos', 'Un trabajador solo se ve a sí mismo',
  (select count(*) = 1 from public.user_last_sign_in)
  and (select user_id = test.id('juan') from public.user_last_sign_in),
  (select count(*)::text || ' filas' from public.user_last_sign_in));

select test.ok('uc_permisos', 'Y no ve la de nadie más, ni la de administración',
  not exists (select 1 from public.user_last_sign_in where user_id = test.id('salvi')));

-- LO QUE DE VERDAD HAY QUE PROTEGER: el esquema de autenticación entero.
select test.err('uc_permisos', 'Un trabajador no puede leer «auth.users»',
  'select count(*) from auth.users', '42501');

set role anon; select test.as_anon();
select test.err('uc_permisos', 'Y sin sesión no se ve ni la vista',
  'select count(*) from public.user_last_sign_in', '42501');

select test.err('uc_permisos', 'Ni «auth.users»',
  'select count(*) from auth.users', '42501');

reset role; select test.as_server();
