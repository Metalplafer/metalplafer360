-- =====================================================================
-- METALPLAFER360 · LA ÚLTIMA ACTIVIDAD
--
-- Lo que importa aquí, y es casi todo seguridad:
--
--   · que nadie pueda escribir la actividad de OTRA persona;
--   · que nadie pueda escribir una fecha inventada ni siquiera la suya
--     —la función no acepta parámetros, y esa es toda la defensa—;
--   · que el freno de los cinco minutos esté EN LA BASE DE DATOS, que es
--     donde no se puede saltar abriendo otra pestaña;
--   · que administración vea a todo el mundo y cada cual vea lo suyo,
--     igual que ya pasaba con la última conexión;
--   · que sin sesión no se vea nada ni se pueda llamar a nada;
--   · y que la tabla no acumule un historial: UNA fila por persona.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== ÚLTIMA ACTIVIDAD · LA ESTRUCTURA'

reset role; select test.as_server();

select test.ok('act_base', 'La tabla existe y tiene una sola fila por persona',
  exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'user_activity' and c.relkind = 'r')
  and exists (select 1 from pg_constraint
               where conrelid = 'public.user_activity'::regclass and contype = 'p'
                 and array_length(conkey, 1) = 1),
  'la clave primaria es la persona');

select test.ok('act_base', 'La columna de la fecha no admite vacío',
  (select not is_nullable::boolean is null and is_nullable = 'NO'
     from information_schema.columns
    where table_schema = 'public' and table_name = 'user_activity'
      and column_name = 'last_activity_at'));

-- La regla de la casa: toda columna de clave foránea tiene su índice no
-- parcial. Aquí la foránea ES la primaria, así que ya lo tiene, pero se
-- comprueba en vez de darlo por hecho.
select test.ok('act_base', 'La clave foránea tiene su índice',
  exists (select 1 from pg_index i
           where i.indrelid = 'public.user_activity'::regclass
             and i.indpred is null
             and (select attname from pg_attribute
                   where attrelid = i.indrelid and attnum = i.indkey[0]) = 'user_id'));

select test.ok('act_base', 'La vista enseña la actividad en su cuarta columna',
  (select column_name::text from information_schema.columns
    where table_schema = 'public' and table_name = 'user_last_sign_in'
      and ordinal_position = 4) = 'last_activity_at');


\echo '== ÚLTIMA ACTIVIDAD · APUNTAR'

set role authenticated; select test.as_user(test.id('juan'));

select test.ok('act_apunta', 'Antes de hacer nada, no hay actividad',
  not exists (select 1 from public.user_activity where user_id = test.id('juan')));

select public.touch_activity();

select test.ok('act_apunta', 'Usar la aplicación deja la fecha apuntada',
  exists (select 1 from public.user_activity
           where user_id = test.id('juan')
             and last_activity_at > now() - interval '1 minute'));

-- EL FRENO. Se apunta una fecha vieja a mano (como servidor) y se mira
-- qué hace la función en los dos casos.
reset role; select test.as_server();
update public.user_activity set last_activity_at = now() - interval '1 minute'
 where user_id = test.id('juan');

set role authenticated; select test.as_user(test.id('juan'));
select public.touch_activity();

select test.ok('act_freno', 'Antes de cinco minutos NO se vuelve a escribir',
  (select last_activity_at < now() - interval '30 seconds'
     from public.user_activity where user_id = test.id('juan')));

reset role; select test.as_server();
update public.user_activity set last_activity_at = now() - interval '6 minutes'
 where user_id = test.id('juan');

set role authenticated; select test.as_user(test.id('juan'));
select public.touch_activity();

select test.ok('act_freno', 'Pasados los cinco minutos, sí',
  (select last_activity_at > now() - interval '30 seconds'
     from public.user_activity where user_id = test.id('juan')));

-- Llamarla cien veces seguidas no escribe cien veces: es el caso de
-- alguien pulsando sin parar.
select public.touch_activity() from generate_series(1, 100);

select test.ok('act_freno', 'Cien llamadas seguidas siguen siendo UNA fila',
  (select count(*) from public.user_activity where user_id = test.id('juan')) = 1);


\echo '== ÚLTIMA ACTIVIDAD · NADIE TOCA LA DE OTRO'

select test.ok('act_seguridad', 'Apuntar la mía no toca la de nadie más',
  not exists (select 1 from public.user_activity where user_id = test.id('salvi')));

-- La defensa de verdad: la función NO ACEPTA PARÁMETROS. No hay forma de
-- pedirle que escriba otra fila ni otra fecha, ni manipulando la
-- petición ni llamándola a mano.
select test.ok('act_seguridad', 'La función no acepta ningún parámetro',
  (select coalesce(pronargs, -1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'touch_activity') = 0);

select test.err('act_seguridad', 'Y no se la puede llamar con uno',
  $$ select public.touch_activity(now()) $$, '42883');

-- Escribir a mano en la tabla, ni de broma.
select test.err('act_seguridad', 'Un trabajador no puede escribir su actividad a mano',
  $$ update public.user_activity set last_activity_at = now() + interval '1 year'
      where user_id = test.id('juan') $$, '42501');

select test.err('act_seguridad', 'Ni la de otra persona',
  $$ insert into public.user_activity (user_id, last_activity_at)
     values (test.id('salvi'), now()) $$, '42501');

select test.err('act_seguridad', 'Ni borrarla para disimular',
  $$ delete from public.user_activity where user_id = test.id('juan') $$, '42501');


\echo '== ÚLTIMA ACTIVIDAD · QUIÉN VE QUÉ'

-- Que salvi tenga también actividad, para poder comparar.
reset role; select test.as_server();
insert into public.user_activity (user_id, last_activity_at)
values (test.id('salvi'), now() - interval '3 hours')
on conflict (user_id) do update set last_activity_at = excluded.last_activity_at;

set role authenticated; select test.as_user(test.id('juan'));

select test.ok('act_permisos', 'Un trabajador solo se ve a sí mismo',
  (select count(*) from public.user_activity) = 1
  and exists (select 1 from public.user_activity where user_id = test.id('juan')));

select test.ok('act_permisos', 'Y en la vista, lo mismo',
  (select count(*) from public.user_last_sign_in) = 1);

set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('act_permisos', 'Administración ve la actividad de todo el mundo',
  (select count(*) from public.user_activity) >= 2);

select test.ok('act_permisos', 'Y en la vista ve a quien todavía no ha hecho nada, con la fecha vacía',
  exists (select 1 from public.user_last_sign_in
           where user_id = test.id('montse') and last_activity_at is null));

-- Sin sesión, nada de nada.
reset role; set role anon;

select test.err('act_permisos', 'Sin sesión no se puede leer la tabla',
  $$ select count(*) from public.user_activity $$, '42501');

select test.err('act_permisos', 'Sin sesión no se puede apuntar actividad',
  $$ select public.touch_activity() $$, '42501');

reset role; select test.as_server();
