-- =====================================================================
-- METALPLAFER360 · ÚLTIMA ACTIVIDAD
--
-- La pantalla de Trabajadores enseñaba «Última conexión», que es
-- «auth.users.last_sign_in_at»: la última vez que esa persona ESCRIBIÓ SU
-- CONTRASEÑA. Con sesiones que duran semanas, eso no dice nada útil:
-- alguien que entró el lunes y lleva toda la semana usando la aplicación
-- sigue marcando el lunes, y alguien que dejó la sesión abierta sin
-- tocarla, también.
--
-- Lo que hace falta es cuándo USÓ la aplicación por última vez. Eso no
-- existe en ningún sitio, así que hay que guardarlo.
--
--
-- POR QUÉ UNA TABLA Y NO UNA COLUMNA EN «profiles»
--
-- La auditoría proponía una columna en «profiles». Al ir a escribirla se
-- comprobaron los disparadores que tiene esa tabla, y hay dos que lo
-- desaconsejan:
--
--   · «zz_audit» (archivo 02, línea 257) registra en el historial CADA
--     cambio de un perfil. Una columna de actividad escribiría una
--     entrada de auditoría cada vez que alguien abre una pantalla, y el
--     encargo dice justo lo contrario: «no crees un historial completo
--     de acciones». Se podría silenciar con «app.skip_audit», pero
--     quedaría una trampa para el siguiente que toque la tabla;
--
--   · «touch_updated_at» (archivo 02, línea 159) pone «updated_at» a
--     «now()» en cada UPDATE. La actividad convertiría «cuándo se editó
--     este usuario» en «cuándo se movió por la aplicación», que es otra
--     cosa y nadie lo esperaría.
--
-- Una tabla aparte no toca NINGÚN disparador, NINGUNA función y NINGUNA
-- política de las que ya existen, que es lo que pedía el encargo. Y
-- además hace estructural la promesa de que esto no es un historial:
-- UNA FILA POR PERSONA, sin sitio donde acumular nada.
--
--
-- UNA SOLA FILA POR PERSONA, Y GLOBAL
--
-- La clave primaria es la persona. No hay fila por sesión, por pestaña
-- ni por dispositivo: todos escriben en la misma, así que la fecha es la
-- misma se mire desde donde se mire. Eso resuelve de un plumazo lo de
-- «debe existir una única última actividad por usuario, compartida entre
-- pestañas y dispositivos».
--
--
-- EL FRENO DE LOS CINCO MINUTOS
--
-- Sin freno, cada clic sería una escritura. El freno está EN LA BASE DE
-- DATOS, no solo en el navegador, porque el del navegador se salta
-- abriendo otra pestaña y este no. Con cinco minutos, cada persona
-- genera como mucho doce escrituras por hora aunque no pare quieta.
--
-- MIGRACIÓN ESTRUCTURAL: una tabla nueva, una función nueva y una
-- columna añadida AL FINAL de una vista. No cambia ni un dato existente.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) DÓNDE SE GUARDA
-- ---------------------------------------------------------------------
create table if not exists public.user_activity (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  last_activity_at timestamptz not null default now()
);

comment on table public.user_activity is
  'Cuándo usó cada persona la aplicación por última vez. Una fila por persona: no es un historial de acciones.';
comment on column public.user_activity.last_activity_at is
  'Última actividad real: navegar, consultar o escribir. NO se actualiza por tener la sesión abierta ni por refrescos automáticos.';

-- La clave foránea es también la clave primaria, así que ya tiene su
-- índice no parcial, que es lo que exige la regla de la casa
-- («70_tests_fase7.sql»: toda columna de clave foránea tiene su índice).


-- ---------------------------------------------------------------------
-- 2) MARCAR LA ACTIVIDAD
--
-- No acepta ningún parámetro, y eso es lo que impide falsearla: escribe
-- «now()» en la fila de QUIEN LLAMA y en ninguna otra. No hay manera de
-- poner otra fecha ni de tocar la de otra persona, ni manipulando la
-- petición ni llamando a la función a mano desde la consola.
--
-- El «insert ... select ... from profiles» en lugar de un «values» no es
-- adorno: si quien llama no tuviera perfil, el «values» fallaría contra
-- la clave foránea y la función devolvería un error. Así, simplemente no
-- escribe nada.
--
-- Y el «where» del «on conflict» es el freno: si la última actividad es
-- de hace menos de cinco minutos, no se actualiza. No es un error, no
-- devuelve nada distinto; simplemente no escribe.
-- ---------------------------------------------------------------------
create or replace function public.touch_activity() returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid := auth.uid();
begin
  if v_id is null then return; end if;

  insert into public.user_activity as a (user_id, last_activity_at)
  select p.id, now() from public.profiles p where p.id = v_id
     on conflict (user_id) do update
        set last_activity_at = now()
      where a.last_activity_at < now() - interval '5 minutes';
end $$;

comment on function public.touch_activity() is
  'Marca que quien llama ha usado la aplicación. No acepta parámetros: solo puede marcar la suya, y como mucho una vez cada cinco minutos.';


-- ---------------------------------------------------------------------
-- 3) QUIÉN PUEDE QUÉ
--
-- Escribir, solo la función. La tabla no se toca a mano desde la
-- aplicación: ni «insert», ni «update», ni «delete» para nadie que no
-- sea el servidor.
--
-- Leer, la misma regla que ya tenía la última conexión: administración
-- ve a todo el mundo y cada cual ve lo suyo.
--
-- Y el «revoke» a «anon» va explícito: Supabase concede permisos por
-- omisión sobre las tablas nuevas, así que sin esta línea una tabla
-- recién creada queda alcanzable sin sesión.
-- ---------------------------------------------------------------------
alter table public.user_activity enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'user_activity' loop
    execute format('drop policy if exists %I on public.user_activity', r.policyname);
  end loop;
end $$;

create policy user_activity_select on public.user_activity for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

revoke all    on public.user_activity from anon;
revoke insert, update, delete, truncate on public.user_activity from authenticated;
grant  select on public.user_activity to authenticated;
grant  all    on public.user_activity to service_role;

revoke all    on function public.touch_activity() from anon, public;
grant  execute on function public.touch_activity() to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 4) LA VISTA QUE LEE LA PANTALLA
--
-- Se amplía la que ya existe (archivo 54) con UNA columna más AL FINAL,
-- que es lo único que «create or replace view» permite: no deja quitar
-- columnas, ni reordenarlas, ni cambiarles el tipo. Las tres de siempre
-- se quedan donde estaban y con el mismo nombre, así que nada de lo que
-- ya consultaba esta vista se entera del cambio.
--
-- El «left join» es a propósito: quien no ha usado nunca la aplicación
-- no tiene fila, y entonces sale vacío. Vacío significa «no ha hecho
-- nada», y es distinto de cualquier fecha. No se rellena con el alta ni
-- con la última conexión.
--
-- La condición de quién ve qué se conserva letra por letra.
-- ---------------------------------------------------------------------
create or replace view public.user_last_sign_in with (security_barrier = true) as
  select p.id             as user_id,
         u.last_sign_in_at,
         u.created_at     as account_created_at,
         a.last_activity_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_activity a on a.user_id = p.id
   where public.is_admin() or p.id = auth.uid();

comment on view public.user_last_sign_in is
  'Por persona: cuándo inició sesión por última vez, cuándo se creó su cuenta y cuándo usó la aplicación por última vez. Administración ve a todos; cada cual, lo suyo.';

comment on column public.user_last_sign_in.last_activity_at is
  'Última vez que usó la aplicación de verdad. Vacío = todavía no ha hecho nada. Es lo que enseña la pantalla de Trabajadores.';

grant  select on public.user_last_sign_in to authenticated, service_role;
revoke all    on public.user_last_sign_in from anon;


-- ---------------------------------------------------------------------
-- 5) COMPROBAR QUE QUEDÓ BIEN
-- ---------------------------------------------------------------------
-- select user_id, last_sign_in_at, last_activity_at from public.user_last_sign_in;
-- select count(*) from public.user_activity;
