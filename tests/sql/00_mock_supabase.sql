-- =====================================================================
-- Reproduce localmente lo mínimo de Supabase (roles, esquema auth y
-- storage) para poder probar el SQL real con PostgreSQL 16.
-- ESTE ARCHIVO NO SE EJECUTA NUNCA EN SUPABASE.
-- =====================================================================
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login noinherit;
grant anon, authenticated, service_role to authenticator;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  -- La mantiene el propio Supabase Auth cada vez que alguien inicia
  -- sesión. Vacía mientras esa cuenta no haya entrado nunca. Aquí se
  -- reproduce para poder probar la última conexión sin Supabase.
  last_sign_in_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- ---------------------------------------------------------------------
-- La BÓVEDA de Supabase (Vault), lo justo para poder probar el mismo
-- camino que en producción. Aquí NO cifra nada: es una base de pruebas
-- que se crea y se tira en cada ejecución.
-- ---------------------------------------------------------------------
create schema vault;
create table vault.secrets (
  id          uuid primary key default gen_random_uuid(),
  name        text unique,
  description text default '',
  secret      text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now());

create view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, created_at, updated_at
    from vault.secrets;

create function vault.create_secret(
  new_secret text, new_name text default null, new_description text default '')
returns uuid language sql as $$
  insert into vault.secrets (secret, name, description)
  values (new_secret, new_name, new_description) returning id;
$$;

create function vault.update_secret(
  secret_id uuid, new_secret text default null, new_name text default null,
  new_description text default null)
returns void language sql as $$
  update vault.secrets
     set secret = coalesce(new_secret, secret),
         name = coalesce(new_name, name),
         description = coalesce(new_description, description),
         updated_at = now()
   where id = secret_id;
$$;

-- Como en Supabase: la bóveda no se expone a los usuarios de la aplicación.
revoke all on schema vault from public;
grant usage on schema vault to service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now(),
  unique (bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, service_role;
grant all on storage.objects, storage.buckets to authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
