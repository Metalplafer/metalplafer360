-- =====================================================================
-- METALPLAFER360 · 02 · FUNCIONES Y TRIGGERS (FASE 1)
--
-- Aquí vive la lógica que NO debe depender del navegador:
--   · quién es administrador y quién trabajador
--   · creación automática del perfil al crear un usuario
--   · numeración anual segura ante concurrencia
--   · historial automático
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------

-- Fecha de hoy en hora de Madrid (evita errores de zona horaria).
create or replace function public.today_madrid() returns date
language sql stable as $$ select (now() at time zone 'Europe/Madrid')::date $$;

-- Convierte texto a uuid sin lanzar error (devuelve null si no es válido).
create or replace function public.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin return p::uuid; exception when others then return null; end $$;

-- ¿La llamada viene del servidor (Edge Function con service_role, SQL Editor
-- o tarea programada) y no de un navegador?
-- OJO: no se usa current_user porque dentro de SECURITY DEFINER es el
-- propietario de la función y se podría confundir con el servidor.
create or replace function public.is_service_context() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or (session_user in ('postgres', 'supabase_admin')
          and coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = '');
$$;

-- ---------------------------------------------------------------------
-- Identidad y permisos
-- SECURITY DEFINER para poder consultarse dentro de las políticas RLS
-- sin provocar recursión infinita sobre la propia tabla profiles.
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin' and active);
$$;
comment on function public.is_admin() is 'TRUE si quien hace la petición es un administrador activo.';

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active;
$$;

create or replace function public.actor_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select full_name from public.profiles where id = auth.uid()), 'Sistema');
$$;

-- Corta la operación si quien la pide no es administrador.
create or replace function public.assert_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_service_context()) then
    raise exception 'No tienes permisos para realizar esta acción' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Configuración visible para cualquier usuario activo
-- (los trabajadores no pueden leer app_settings, pero sí necesitan saber
--  el límite de tamaño de archivo)
-- ---------------------------------------------------------------------
create or replace function public.client_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_active_user()
              then jsonb_build_object('max_file_mb', s.max_file_mb, 'company_name', s.company ->> 'name')
              else '{}'::jsonb end
    from public.app_settings s where s.id = 1;
$$;

-- ---------------------------------------------------------------------
-- ALTA AUTOMÁTICA DE PERFIL
-- Al crear un usuario en Supabase (panel o Edge Function) se crea su
-- perfil automáticamente.
--
-- REGLA DE SEGURIDAD: el rol NUNCA se toma de datos que pueda manipular
-- quien se registra. El PRIMER usuario del sistema es el administrador
-- (Salvi); todos los demás nacen como TRABAJADOR y solo un administrador
-- puede cambiarles el rol después.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_username text := lower(coalesce(nullif(trim(v_meta ->> 'username'), ''), split_part(new.email, '@', 1)));
  v_name     text := coalesce(nullif(trim(v_meta ->> 'full_name'), ''), initcap(v_username));
  v_role     public.user_role;
begin
  select case when exists (select 1 from public.profiles where role = 'admin')
              then 'worker' else 'admin' end into v_role;

  insert into public.profiles (id, full_name, username, email, role, phone)
  values (new.id, v_name, v_username, new.email, v_role, nullif(trim(v_meta ->> 'phone'), ''))
  on conflict (id) do nothing;

  return new;
exception when unique_violation then
  -- Nombre de usuario repetido: se crea igualmente el perfil sin username
  -- para no dejar un usuario de Auth huérfano y sin acceso.
  insert into public.profiles (id, full_name, email, role)
  values (new.id, v_name, new.email, v_role)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- PROTECCIONES SOBRE PERFILES
--   · Siempre debe quedar al menos un administrador activo.
--   · Nadie puede cambiar el identificador de un usuario.
-- ---------------------------------------------------------------------
create or replace function public.trg_profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and new.id <> old.id then
    raise exception 'No se puede cambiar el identificador de un usuario' using errcode = '42501';
  end if;

  if old.role = 'admin' and old.active
     and (TG_OP = 'DELETE' or new.role <> 'admin' or not new.active)
     and not exists (select 1 from public.profiles
                      where role = 'admin' and active and id <> old.id) then
    raise exception 'Debe existir al menos un administrador activo' using errcode = '23514';
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update or delete on public.profiles
  for each row execute function public.trg_profiles_guard();

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.trg_touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists touch_updated_at on public.profiles;
create trigger touch_updated_at before update on public.profiles
  for each row execute function public.trg_touch_updated_at();

drop trigger if exists touch_updated_at on public.app_settings;
create trigger touch_updated_at before update on public.app_settings
  for each row execute function public.trg_touch_updated_at();

-- ---------------------------------------------------------------------
-- NUMERACIÓN ANUAL SEGURA ANTE CONCURRENCIA
-- INSERT ... ON CONFLICT DO UPDATE bloquea la fila del contador, así que
-- dos personas que creen un registro a la vez nunca obtienen el mismo código.
-- Devuelve, por ejemplo: PROY-2026-001
-- ---------------------------------------------------------------------
create or replace function public.next_code(p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from (now() at time zone 'Europe/Madrid'))::int;
  v_val  int;
begin
  insert into public.code_counters (prefix, year, last_value)
  values (p_prefix, v_year, 1)
  on conflict (prefix, year)
    do update set last_value = public.code_counters.last_value + 1
  returning last_value into v_val;

  return p_prefix || '-' || v_year || '-' || lpad(v_val::text, greatest(3, length(v_val::text)), '0');
end $$;

-- ---------------------------------------------------------------------
-- HISTORIAL
-- ---------------------------------------------------------------------

-- Registro manual desde funciones de negocio.
create or replace function public.log_event(
  p_action text, p_entity_type text, p_summary text,
  p_details jsonb default '{}'::jsonb, p_actor uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := coalesce(p_actor, auth.uid());
begin
  insert into public.audit_log (actor_id, actor_name, action, entity_type, summary, details)
  values (v_actor,
          coalesce((select full_name from public.profiles where id = v_actor), 'Sistema'),
          p_action, p_entity_type, p_summary, coalesce(p_details, '{}'::jsonb));
end $$;

-- Registro automático de altas, cambios y bajas.
create or replace function public.trg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb; v_old jsonb; v_changed text[]; v_details jsonb := '{}'::jsonb;
  v_name text := public.actor_name(); v_summary text; v_code text; v_entity uuid;
begin
  if coalesce(current_setting('app.skip_audit', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  v_row := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if TG_OP = 'UPDATE' then
    v_old := to_jsonb(old);
    select array_agg(key) into v_changed
      from jsonb_each(v_row) e
     where e.key <> 'updated_at' and e.value is distinct from v_old -> e.key;
    if v_changed is null then return new; end if;
    select jsonb_build_object('cambios', jsonb_object_agg(k, jsonb_build_object('antes', v_old -> k, 'despues', v_row -> k)))
      into v_details from unnest(v_changed) k;
  end if;

  v_entity := public.try_uuid(v_row ->> 'id');

  if TG_TABLE_NAME = 'profiles' then
    v_code := v_row ->> 'full_name';
    v_summary := case
      when TG_OP = 'INSERT' then v_name || ' creó el usuario ' || v_code ||
           ' (' || case (v_row ->> 'role') when 'admin' then 'administración' else 'trabajador' end || ')'
      when TG_OP = 'DELETE' then v_name || ' eliminó al usuario ' || v_code
      when 'active' = any(v_changed) then v_name ||
           case when new.active then ' reactivó' else ' desactivó' end || ' al usuario ' || v_code
      when 'role' = any(v_changed) then v_name || ' cambió el rol de ' || v_code || ' a ' ||
           case new.role when 'admin' then 'administración' else 'trabajador' end
      when v_changed <@ array['preferences'] then null   -- preferencias de pantalla: no ensucian el historial
      else v_name || ' modificó el usuario ' || v_code end;
    if v_summary is null then return new; end if;
  elsif TG_TABLE_NAME = 'app_settings' then
    v_summary := v_name || ' modificó la configuración de la aplicación';
  else
    v_summary := v_name || ' ' || lower(TG_OP) || ' ' || TG_TABLE_NAME;
  end if;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_code, summary, details, is_demo)
  values (auth.uid(), v_name, lower(TG_OP), TG_TABLE_NAME, v_entity, v_code, v_summary,
          v_details || case when TG_OP = 'DELETE' then jsonb_build_object('registro', v_row) else '{}'::jsonb end,
          coalesce((v_row ->> 'is_demo')::boolean, false));

  return coalesce(new, old);
end $$;

drop trigger if exists zz_audit on public.profiles;
create trigger zz_audit after insert or update or delete on public.profiles
  for each row execute function public.trg_audit();

drop trigger if exists zz_audit on public.app_settings;
create trigger zz_audit after insert or update or delete on public.app_settings
  for each row execute function public.trg_audit();

-- El historial es inmutable. La única excepción es el mantenimiento desde
-- el servidor (limpieza de datos demo y restauración, fases posteriores).
create or replace function public.trg_audit_immutable() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.audit_maintenance', true), '') = 'on'
     and public.is_service_context() then
    return coalesce(new, old);
  end if;
  raise exception 'El historial no se puede modificar ni eliminar' using errcode = '42501';
end $$;

drop trigger if exists audit_immutable on public.audit_log;
create trigger audit_immutable before update or delete on public.audit_log
  for each row execute function public.trg_audit_immutable();

-- ---------------------------------------------------------------------
-- PROTECCIÓN DE COLUMNAS SENSIBLES DEL PERFIL
-- Un usuario puede editar su nombre, teléfono y preferencias, pero NUNCA
-- su rol, su estado activo ni su nombre de usuario. Aunque alguien
-- manipule la petición, estos campos se revierten aquí, en la base de datos.
-- ---------------------------------------------------------------------
create or replace function public.trg_profiles_protect_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or public.is_service_context() then
    return new;
  end if;
  new.role     := old.role;
  new.active   := old.active;
  new.username := old.username;
  new.email    := old.email;
  new.is_demo  := old.is_demo;
  return new;
end $$;

-- El nombre empieza por «aa_» para que se ejecute ANTES que profiles_guard
-- (PostgreSQL dispara los triggers por orden alfabético).
drop trigger if exists profiles_aa_protect_columns on public.profiles;
create trigger profiles_aa_protect_columns before update on public.profiles
  for each row execute function public.trg_profiles_protect_columns();
