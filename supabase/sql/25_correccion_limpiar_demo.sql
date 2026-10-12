-- =====================================================================
-- METALPLAFER360 · 25 · CORRECCIÓN DE «LIMPIAR DATOS DEMO»
--
-- EL PROBLEMA
-- «Limpiar datos demo» fallaba con «No tienes permisos para realizar
-- esta acción», incluso siendo administración.
--
-- No era un problema de permisos. En cuanto alguien USA la aplicación
-- con los datos de ejemplo (marca un material recibido, valida una
-- orden…), el historial anota lo ocurrido y esa anotación hereda la
-- marca de ejemplo de la fila que se tocó. Al limpiar, se intentaban
-- borrar esas anotaciones y saltaba la protección que hace que el
-- historial sea inmutable. Su aviso usa el mismo código de error que
-- «sin permisos», y por eso la pantalla decía lo que no era.
--
-- LA CORRECCIÓN
-- El historial sigue siendo inmutable. Lo único que se permite ahora es
-- borrar las anotaciones MARCADAS COMO EJEMPLO, y solo mientras se está
-- limpiando el ejemplo. Una anotación de trabajo de verdad no se puede
-- borrar de ninguna manera, ni siquiera durante la limpieza.
--
-- Este archivo se ejecuta UNA VEZ, después del 24. No borra ni cambia
-- ningún dato: solo corrige dos funciones.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) EL HISTORIAL SIGUE SIENDO INMUTABLE, CON UNA SOLA EXCEPCIÓN
--
-- La excepción es estrecha a propósito y pide DOS cosas a la vez:
--   · que se esté limpiando el ejemplo (lo marca «clear_demo»), y
--   · que la fila esté marcada como de ejemplo.
-- Si falta cualquiera de las dos, se rechaza como siempre.
-- ---------------------------------------------------------------------
create or replace function public.trg_audit_immutable() returns trigger
language plpgsql as $$
begin
  -- Mantenimiento desde el servidor (como hasta ahora).
  if coalesce(current_setting('app.audit_maintenance', true), '') = 'on'
     and public.is_service_context() then
    return coalesce(new, old);
  end if;

  -- Limpieza de los datos de ejemplo: SOLO borrar, y SOLO lo que está
  -- marcado como ejemplo.
  if TG_OP = 'DELETE'
     and coalesce(current_setting('app.demo_cleanup', true), '') = 'on'
     and coalesce(old.is_demo, false) then
    return old;
  end if;

  raise exception 'El historial no se puede modificar ni eliminar' using errcode = '42501';
end $$;


-- ---------------------------------------------------------------------
-- 2) LIMPIAR LOS DATOS DE EJEMPLO
--
-- Borra EXACTAMENTE las filas marcadas como ejemplo y nada más. Se
-- recorren las tablas de la más dependiente a la menos, para no dejar
-- referencias colgando.
--
-- Lo que NO se borra, a propósito:
--   · Las anotaciones del historial que cuentan que alguien puso o
--     limpió el ejemplo: son acciones de verdad de una persona de verdad.
--   · Absolutamente nada que no lleve la marca de ejemplo.
-- ---------------------------------------------------------------------
create or replace function public.clear_demo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t text; v_n int; v_borradas jsonb := '{}'::jsonb; v_total int := 0;
  v_users uuid[];
begin
  perform public.assert_admin();

  -- El historial de cada borrado sería ruido: se deja una sola anotación.
  perform set_config('app.skip_audit', 'on', true);
  -- Y se abre la puerta estrecha para poder retirar las anotaciones que
  -- son del propio ejemplo. Dura solo esta operación.
  perform set_config('app.demo_cleanup', 'on', true);

  foreach t in array array[
    'comments', 'documents', 'payments', 'material_requests', 'materials',
    'work_order_workers', 'work_orders', 'project_substatuses', 'projects',
    'fichas', 'client_contacts', 'clients', 'notifications', 'audit_log'
  ] loop
    execute format('delete from public.%I where is_demo', t);
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_borradas := v_borradas || jsonb_build_object(t, v_n);
      v_total := v_total + v_n;
    end if;
  end loop;

  -- Los trabajadores de ejemplo, al final: ya no les queda trabajo atado.
  select array_agg(id) into v_users from public.profiles where is_demo;
  if v_users is not null then
    delete from auth.users where id = any(v_users);
    -- Si la instalación no borra el perfil en cascada, se quita a mano.
    delete from public.profiles where id = any(v_users);
    v_borradas := v_borradas || jsonb_build_object('profiles', array_length(v_users, 1));
    v_total := v_total + array_length(v_users, 1);
  end if;

  perform set_config('app.demo_cleanup', 'off', true);
  perform set_config('app.skip_audit', 'off', true);

  perform public.log_event('limpiar_demo', 'app_settings',
    public.actor_name() || ' limpió los datos de ejemplo (' || v_total || ' registros)',
    jsonb_build_object('borradas', v_borradas, 'total', v_total));

  return jsonb_build_object('borradas', v_borradas, 'total', v_total);
end $$;

revoke all on function public.clear_demo() from public, anon;
grant execute on function public.clear_demo() to authenticated;
