-- =====================================================================
-- METALPLAFER360 · 24 · CONEXIÓN CON GOOGLE DRIVE (OAuth 2.0)
--
-- Sustituye la cuenta de servicio por una autorización de la cuenta de
-- Google de la empresa. El motivo: una cuenta de servicio NO tiene cuota
-- de almacenamiento propia, así que no puede guardar archivos en «Mi
-- unidad» de una cuenta Gmail personal (Google responde «Service
-- Accounts do not have storage quota»).
--
-- DÓNDE VIVE CADA COSA
--   · El «refresh token» de Google  → en la BÓVEDA de Supabase (Vault),
--     cifrado, y solo lo puede leer el servidor. Ni la aplicación ni
--     GitHub ni el navegador lo ven jamás.
--   · El identificador y el secreto del cliente de Google → secretos de
--     Edge Functions, nunca en la base de datos ni en el repositorio.
--   · El ESTADO de la conexión (conectada o no, con qué cuenta, en qué
--     carpeta) → en una tabla normal, que solo puede leer administración.
--     Ahí no hay ningún secreto.
--
-- Este archivo se ejecuta UNA VEZ, después del 23.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) ESTADO DE LA CONEXIÓN  (aquí no hay secretos)
-- ---------------------------------------------------------------------
create table if not exists public.google_drive_connection (
  id            int primary key default 1 check (id = 1),
  connected     boolean not null default false,
  -- Con qué cuenta de Google se autorizó (para que administración lo vea).
  account_email text,
  -- La carpeta la crea la propia aplicación en «Mi unidad» al conectar.
  folder_id     text,
  folder_name   text,
  connected_at  timestamptz,
  connected_by  uuid references public.profiles(id) on delete set null,
  -- Última subida correcta y último fallo, para poder enseñar el estado.
  last_ok_at    timestamptz,
  last_error    text,
  updated_at    timestamptz not null default now()
);

insert into public.google_drive_connection (id) values (1) on conflict (id) do nothing;

comment on table public.google_drive_connection is
  'Estado de la conexión con Google Drive. El token vive en la bóveda, aquí NO.';


-- ---------------------------------------------------------------------
-- 2) EL «STATE» DE LA AUTORIZACIÓN
--
-- Un número aleatorio de un solo uso que demuestra que la vuelta de
-- Google corresponde a una autorización que empezó administración, y no
-- a alguien que ha dado con la dirección del callback.
-- ---------------------------------------------------------------------
create table if not exists public.google_oauth_state (
  state      text primary key,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 3) LA BÓVEDA
--
-- El token se guarda con vault.create_secret / vault.update_secret, que
-- lo cifran. Estas funciones son el ÚNICO camino hacia él, y solo las
-- puede ejecutar el servidor (service_role): ni «authenticated» ni
-- «anon» tienen permiso, así que desde el navegador no hay forma de
-- llegar al token ni manipulando la petición.
-- ---------------------------------------------------------------------
create or replace function public.drive_put_token(p_refresh text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_refresh is null or length(trim(p_refresh)) = 0 then
    raise exception 'Google no ha devuelto ningún permiso duradero.' using errcode = '22023';
  end if;

  select id into v_id from vault.secrets where name = 'm360_google_refresh_token';

  if v_id is null then
    perform vault.create_secret(
      p_refresh, 'm360_google_refresh_token',
      'METALPLAFER360 · permiso duradero de Google Drive. No se comparte nunca.');
  else
    perform vault.update_secret(v_id, p_refresh);
  end if;
end $$;

create or replace function public.drive_get_token() returns text
language sql security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets
   where name = 'm360_google_refresh_token';
$$;

create or replace function public.drive_forget_token() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from vault.secrets where name = 'm360_google_refresh_token';
end $$;


-- ---------------------------------------------------------------------
-- 4) APUNTAR CÓMO HA IDO
-- ---------------------------------------------------------------------
create or replace function public.drive_mark_connected(
  p_email text, p_folder_id text, p_folder_name text, p_actor uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.google_drive_connection
     set connected = true, account_email = p_email,
         folder_id = p_folder_id, folder_name = p_folder_name,
         connected_at = now(), connected_by = p_actor,
         last_error = null, updated_at = now()
   where id = 1;

  perform public.log_event('drive_conectado', 'backups',
    coalesce((select full_name from public.profiles where id = p_actor), 'El servidor')
    || ' conectó Google Drive (' || coalesce(p_email, 'cuenta de Google') || ')',
    jsonb_build_object('carpeta', p_folder_name));
end $$;

create or replace function public.drive_mark_ok() returns void
language sql security definer set search_path = public as $$
  update public.google_drive_connection
     set last_ok_at = now(), last_error = null, updated_at = now()
   where id = 1;
$$;

create or replace function public.drive_mark_error(p_error text) returns void
language sql security definer set search_path = public as $$
  update public.google_drive_connection
     set last_error = left(coalesce(p_error, 'Error desconocido'), 300), updated_at = now()
   where id = 1;
$$;

create or replace function public.drive_disconnect(p_actor uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.drive_forget_token();

  update public.google_drive_connection
     set connected = false, account_email = null, folder_id = null, folder_name = null,
         connected_at = null, connected_by = null, last_error = null, updated_at = now()
   where id = 1;

  perform public.log_event('drive_desconectado', 'backups',
    coalesce((select full_name from public.profiles where id = p_actor), 'El servidor')
    || ' desconectó Google Drive', '{}'::jsonb);
end $$;


-- ---------------------------------------------------------------------
-- 5) LO QUE VE LA PANTALLA
--
-- Solo administración, y SOLO datos que no son secretos: si está
-- conectado, con qué cuenta, en qué carpeta y cuándo fue la última
-- subida correcta. El token no sale por aquí de ninguna manera.
-- ---------------------------------------------------------------------
create or replace function public.drive_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.assert_admin();

  select jsonb_build_object(
    'estado', case when c.last_error is not null then 'error'
                   when c.connected then 'conectado'
                   else 'sin_conectar' end,
    'conectado',    c.connected,
    'cuenta',       c.account_email,
    'carpeta',      c.folder_name,
    'carpeta_id',   c.folder_id,
    'conectado_el', c.connected_at,
    'ultima_copia', c.last_ok_at,
    'error',        c.last_error)
    into v
    from public.google_drive_connection c where c.id = 1;

  return coalesce(v, jsonb_build_object('estado', 'sin_conectar', 'conectado', false));
end $$;


-- Índices de las claves foráneas, como el resto del proyecto.
create index if not exists drive_connection_by_idx on public.google_drive_connection (connected_by);
create index if not exists oauth_state_by_idx      on public.google_oauth_state (created_by);
create index if not exists oauth_state_time_idx    on public.google_oauth_state (created_at);


-- ---------------------------------------------------------------------
-- 6) PERMISOS
--
-- La regla: el token solo lo tocan funciones que ejecuta el servidor.
-- Administración únicamente puede MIRAR el estado.
-- ---------------------------------------------------------------------
alter table public.google_drive_connection enable row level security;
alter table public.google_oauth_state      enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('google_drive_connection', 'google_oauth_state') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Administración puede ver el estado (la tabla no guarda ningún secreto).
create policy drive_connection_select on public.google_drive_connection
  for select to authenticated using (public.is_admin());

-- El «state» de la autorización no lo lee nadie desde el navegador:
-- a propósito NO tiene ninguna política.

grant select on public.google_drive_connection to authenticated;
revoke insert, update, delete, truncate on public.google_drive_connection from authenticated, anon;
revoke all on public.google_oauth_state from authenticated, anon;
grant all on public.google_drive_connection, public.google_oauth_state to service_role;

-- Las funciones que tocan el token: SOLO el servidor.
revoke all on function public.drive_put_token(text)                  from public, anon, authenticated;
revoke all on function public.drive_get_token()                      from public, anon, authenticated;
revoke all on function public.drive_forget_token()                   from public, anon, authenticated;
revoke all on function public.drive_mark_connected(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.drive_mark_ok()                        from public, anon, authenticated;
revoke all on function public.drive_mark_error(text)                 from public, anon, authenticated;
revoke all on function public.drive_disconnect(uuid)                 from public, anon, authenticated;

grant execute on function public.drive_put_token(text)                  to service_role;
grant execute on function public.drive_get_token()                      to service_role;
grant execute on function public.drive_forget_token()                   to service_role;
grant execute on function public.drive_mark_connected(text, text, text, uuid) to service_role;
grant execute on function public.drive_mark_ok()                        to service_role;
grant execute on function public.drive_mark_error(text)                 to service_role;
grant execute on function public.drive_disconnect(uuid)                 to service_role;

-- Mirar el estado sí puede hacerlo administración (la función comprueba
-- por dentro que quien pregunta es administración).
revoke all on function public.drive_status() from public, anon;
grant execute on function public.drive_status() to authenticated, service_role;
