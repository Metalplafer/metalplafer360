-- =====================================================================
-- METALPLAFER360 · 01 · ESQUEMA BASE (FASE 1)
--
-- Contiene únicamente los cimientos: usuarios/perfiles, configuración de
-- la aplicación e historial de acciones. Las tablas de clientes, fichas,
-- proyectos, órdenes, materiales, etc. se añadirán en las fases siguientes
-- sobre esta misma base, sin tener que rehacer nada.
--
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar > Run.
-- Es idempotente: puede ejecutarse varias veces sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensiones (en su propio esquema, como recomienda Supabase)
-- ---------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pg_trgm  with schema extensions;  -- búsquedas por similitud (fases siguientes)
create extension if not exists unaccent with schema extensions;  -- búsquedas sin acentos
grant usage on schema extensions to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Zona horaria: España peninsular
-- ---------------------------------------------------------------------
do $$
begin
  execute format('alter database %I set timezone = %L', current_database(), 'Europe/Madrid');
exception when insufficient_privilege then
  raise notice 'Sin permiso para fijar la zona horaria de la base de datos; se usa Europe/Madrid en las funciones.';
end $$;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin', 'worker');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- PERFILES
-- Un perfil por cada usuario de Supabase Auth. Es la tabla que define
-- QUIÉN es cada persona y QUÉ rol tiene. Toda la seguridad se apoya aquí.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) > 0),
  username    text unique,
  email       text,
  role        public.user_role not null default 'worker',
  phone       text,
  active      boolean not null default true,
  preferences jsonb not null default '{}'::jsonb,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table  public.profiles is 'Usuarios de METALPLAFER360 (administración y trabajadores).';
comment on column public.profiles.active is 'Los usuarios no se borran: se desactivan. Un usuario inactivo no puede usar la aplicación.';

create index if not exists profiles_role_idx on public.profiles (role) where active;
create index if not exists profiles_name_idx on public.profiles (full_name);

-- ---------------------------------------------------------------------
-- CONFIGURACIÓN DE LA APLICACIÓN (fila única)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  id                    int primary key default 1 check (id = 1),
  company               jsonb not null default jsonb_build_object(
                          'name', 'METALPLAFER S.L.', 'tax_id', '',
                          'address', 'Carrer de Sant Sebastià, 140', 'city', 'Sabadell',
                          'postal_code', '08203', 'phone', '', 'email', ''),
  max_file_mb           int not null default 100 check (max_file_mb between 1 and 500),
  backup_retention_days int not null default 30  check (backup_retention_days between 1 and 365),
  updated_at            timestamptz not null default now()
);
comment on table public.app_settings is 'Ajustes generales. Siempre contiene una única fila (id = 1).';

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- CONTADORES DE NUMERACIÓN ANUAL
-- Base para los códigos PRES-2026-001, PROY-2026-001, OT-2026-001...
-- (se empiezan a usar en la fase de fichas/proyectos; se crea ya aquí
--  para que la numeración sea segura desde el primer día).
-- ---------------------------------------------------------------------
create table if not exists public.code_counters (
  prefix     text not null,
  year       int  not null,
  last_value int  not null default 0 check (last_value >= 0),
  primary key (prefix, year)
);
comment on table public.code_counters is 'Último número usado por prefijo y año. Garantiza códigos únicos sin duplicados.';

-- ---------------------------------------------------------------------
-- HISTORIAL / AUDITORÍA
-- Registro inmutable de las acciones importantes. No se puede modificar
-- ni borrar desde la aplicación.
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigint generated by default as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text not null default 'Sistema',
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  entity_code text,
  summary     text not null,
  details     jsonb not null default '{}'::jsonb,
  is_demo     boolean not null default false
);
comment on table public.audit_log is 'Historial de acciones. Solo se añade: nunca se modifica ni se elimina.';

create index if not exists audit_occurred_idx on public.audit_log (occurred_at desc);
create index if not exists audit_entity_idx   on public.audit_log (entity_type, entity_id);
create index if not exists audit_actor_idx    on public.audit_log (actor_id, occurred_at desc);
