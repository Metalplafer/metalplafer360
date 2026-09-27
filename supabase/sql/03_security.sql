-- =====================================================================
-- METALPLAFER360 · 03 · SEGURIDAD: RLS Y POLÍTICAS (FASE 1)
--
-- La seguridad NO depende de ocultar botones en la pantalla.
-- Aunque alguien manipule una petición desde el navegador, la base de
-- datos decide fila por fila qué puede ver y qué puede cambiar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Nadie sin iniciar sesión (rol "anon") accede a ningún dato
-- ---------------------------------------------------------------------
revoke all       on all tables    in schema public from anon;
revoke all       on all sequences in schema public from anon;
revoke execute   on all functions in schema public from anon, public;

-- ---------------------------------------------------------------------
-- 2) Usuarios con sesión iniciada: permisos de tabla.
--    Qué filas ve realmente lo decide RLS (apartado 4).
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- 2b) El servidor (Edge Functions con service_role) conserva acceso completo.
--     Es el único camino para altas de usuarios, backups y restauraciones.
grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ---------------------------------------------------------------------
-- 3) Funciones internas: solo servidor (service_role / SQL Editor)
-- ---------------------------------------------------------------------
revoke execute on function public.next_code(text)                       from authenticated;
revoke execute on function public.log_event(text, text, text, jsonb, uuid) from authenticated;
revoke execute on function public.handle_new_user()                     from authenticated;

-- ---------------------------------------------------------------------
-- 4) Activar RLS en TODAS las tablas del esquema public
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Borrar políticas anteriores (permite reinstalar sin errores)
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- PERFILES
--   · Administración: ve y gestiona a todos.
--   · Trabajador: ve su propia ficha y la de los administradores
--     (para saber con quién contactar). No ve a los demás trabajadores.
--   · Nadie se crea ni se borra a sí mismo: las altas y bajas se hacen
--     desde el servidor (panel de Supabase o Edge Function).
-- ---------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (
    public.is_admin()
    or id = auth.uid()
    or (public.is_active_user() and active and role = 'admin')
  );

create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_active_user())
  with check (id = auth.uid());

create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- CONFIGURACIÓN DE LA APLICACIÓN · solo administración
-- (los trabajadores obtienen lo imprescindible con public.client_config())
-- ---------------------------------------------------------------------
create policy app_settings_select on public.app_settings for select to authenticated
  using (public.is_admin());
create policy app_settings_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- CONTADORES DE NUMERACIÓN · lectura para administración
-- (se modifican únicamente mediante public.next_code)
-- ---------------------------------------------------------------------
create policy code_counters_select on public.code_counters for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- HISTORIAL
--   · Administración lo ve entero.
--   · Cada trabajador ve solo lo que ha hecho él.
--   · Nadie escribe, modifica ni borra el historial desde la aplicación.
-- ---------------------------------------------------------------------
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_admin() or (public.is_active_user() and actor_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 5) Retirada explícita de permisos peligrosos
-- ---------------------------------------------------------------------
revoke insert, update, delete, truncate on public.audit_log     from authenticated;
revoke insert, update, delete, truncate on public.code_counters from authenticated;
revoke insert, delete, truncate         on public.app_settings  from authenticated;
revoke insert, delete, truncate         on public.profiles      from authenticated;
