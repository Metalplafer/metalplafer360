-- =====================================================================
-- METALPLAFER360 · REVISIÓN TRANSVERSAL · dos fugas que quedaban
--
-- Las encontró una revisión que, en lugar de repasar una lista escrita a
-- mano, recorre el catálogo de PostgreSQL preguntando qué alcanza de
-- verdad un trabajador. Las dos son del mismo tipo que las de los
-- BLOQUES 1 y 5: una política que filtra FILAS sobre una tabla que tiene
-- columnas que no son de quien la lee.
--
--   1) PERFILES. Un trabajador necesita saber con quién comparte
--      proyecto (y así se decidió en el BLOQUE 1), así que la política
--      le devuelve la fila de sus compañeros. Pero en esa fila van
--      también el TELÉFONO, el CORREO, el usuario de acceso y las
--      preferencias. Comprobado: Juan leía el teléfono y el correo de
--      Pedro, y las preferencias de administración.
--
--      Aquí no sirve el truco de las vistas: los nombres de los
--      compañeros se leen por relación desde los comentarios, los partes
--      y los equipos de las órdenes, y cerrar la tabla los dejaría en
--      blanco. Lo que se usa es lo que PostgreSQL tiene para esto
--      exactamente: PERMISOS POR COLUMNA. El nombre y el rol siguen
--      siendo legibles (es lo que hace falta); el teléfono, el correo,
--      el usuario y las preferencias, no.
--
--      Quien sí tiene que ver esos datos los lee por «profiles_full»:
--      cada persona los suyos, y administración los de todos.
--
--   2) «order_caption». Era «security definer» y no comprobaba nada, así
--      que devolvía el código, el tipo, la fecha y EL NOMBRE DEL
--      PROYECTO de cualquier orden, incluidas las que no son del
--      trabajador — mientras la tabla, correctamente, le devolvía cero
--      filas. Es una función interna que solo usan los avisos: se deja
--      de conceder a quien tiene sesión, como las demás internas.
--
-- No se desactiva ninguna política ni ningún RLS para arreglar nada.
-- =====================================================================

\set ON_ERROR_STOP on


-- ---------------------------------------------------------------------
-- 1) PERFILES · PERMISOS POR COLUMNA
--
-- El permiso de tabla se retira y se concede columna a columna. Es
-- importante hacerlo en este orden: un permiso de TABLA cubre todas las
-- columnas, así que «revoke select (columna)» sobre quien tiene el
-- permiso de tabla no quita nada.
--
-- Lo que queda legible para cualquiera con sesión es lo que la
-- aplicación necesita para escribir «lo subió Juan» o «va contigo
-- Pedro»: el identificador, el nombre y el rol.
-- ---------------------------------------------------------------------
revoke select on public.profiles from authenticated;

grant select (id, full_name, role, active, is_demo, created_at, updated_at)
  on public.profiles to authenticated;

comment on column public.profiles.phone is
  'Dato personal. No se concede a «authenticated»: se lee por «profiles_full» (el propio, o cualquiera si es administración).';
comment on column public.profiles.email is
  'Dato personal. No se concede a «authenticated»: se lee por «profiles_full».';
comment on column public.profiles.preferences is
  'Ajustes de cada persona. No se concede a «authenticated»: se leen por «profiles_full».';
comment on column public.profiles.username is
  'Usuario de acceso. No se concede a «authenticated»: es media credencial de otra persona.';


/**
 * EL PERFIL COMPLETO, para quien le corresponde.
 *
 * Cada persona el suyo; administración, todos. Lleva «security_barrier»
 * y filtra ella misma, igual que «worker_projects» y «worker_fichas»:
 * así puede leer las columnas que la tabla ya no concede.
 */
create or replace view public.profiles_full with (security_barrier = true) as
  select p.*
    from public.profiles p
   where p.id = auth.uid() or public.is_admin();

comment on view public.profiles_full is
  'El perfil con sus datos personales: el propio, o todos si quien pregunta es administración.';

grant select on public.profiles_full to authenticated, service_role;
revoke all on public.profiles_full from anon;


-- ---------------------------------------------------------------------
-- 2) «order_caption» VUELVE A SER INTERNA
--
-- La usan «notify_*», que son «security definer» y se ejecutan desde
-- dentro de la base de datos: no necesitan que nadie con sesión pueda
-- llamarla. El frontend no la usa (se comprobó).
-- ---------------------------------------------------------------------
revoke execute on function public.order_caption(uuid) from authenticated, anon, public;


-- ---------------------------------------------------------------------
-- 3) EL AVISO DEL ALMACÉN SIN FILA EN «documents»
--
-- «storage_can_read» descarta lo administrativo y la papelera mirando la
-- fila de «documents» que corresponde a esa ruta. Si un archivo quedara
-- en el almacén SIN su fila (una subida a medias), esa comprobación no
-- encontraría nada que descartar y el archivo se leería.
--
-- Se le da la vuelta: para leer un archivo tiene que EXISTIR su fila, no
-- estar en la papelera y no ser administrativa. Lo que no está
-- registrado no se sirve.
-- ---------------------------------------------------------------------
create or replace function public.storage_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (
        case split_part(p_name, '/', 1)
          when 'fichas'   then public.worker_has_ficha(public.try_uuid(split_part(p_name, '/', 2)))
          when 'projects' then public.worker_can_see_project(public.try_uuid(split_part(p_name, '/', 2)))
          when 'orders'   then public.worker_has_order(public.try_uuid(split_part(p_name, '/', 2)))
          when 'reports'  then public.owns_report(public.try_uuid(split_part(p_name, '/', 2)))
          else false
        end
        -- Tiene que estar registrado, fuera de la papelera y no ser
        -- administrativo. Un archivo huérfano en el almacén no se sirve.
        and exists (
          select 1 from public.documents d
           where d.storage_path = p_name
             and d.deleted_at is null
             and d.scope <> 'administrativa')
      );
$$;


-- ---------------------------------------------------------------------
-- 4) UN USUARIO DESACTIVADO NO DEBE VER NADA
--
-- Al desactivar a alguien deja de entrar (la aplicación lo echa) y deja
-- de ver sus proyectos y sus fichas, porque «worker_can_see_project» y
-- «worker_has_ficha» exigen que el perfil esté activo.
--
-- Pero los festivos y los eventos sueltos del calendario tenían la
-- política «true»: cualquiera con sesión los leía, activo o no. Se
-- comprobó: un trabajador desactivado seguía recibiendo 3 filas del
-- calendario.
--
-- Se mantiene la decisión del BLOQUE 3 —los festivos y los eventos del
-- taller los ve TODO EL MUNDO, porque el trabajador necesita saberlos—
-- y se le añade lo único que faltaba: estar activo.
-- ---------------------------------------------------------------------
drop policy if exists non_working_select on public.non_working_days;
create policy non_working_select on public.non_working_days for select to authenticated
  using (public.is_admin() or public.is_active_user());

drop policy if exists notes_select on public.calendar_notes;
create policy notes_select on public.calendar_notes for select to authenticated
  using (public.is_admin() or public.is_active_user());

comment on policy non_working_select on public.non_working_days is
  'Los festivos los ve cualquiera que esté activo: el trabajador necesita saber qué días no se abre.';
comment on policy notes_select on public.calendar_notes is
  'Los eventos del taller los ve cualquiera que esté activo. Quien está desactivado no ve nada.';
