-- =====================================================================
-- METALPLAFER360 · 18 · COPIAS DE SEGURIDAD Y CONFIGURACIÓN (FASE 6)
--
-- Añade el registro de copias de seguridad y los ajustes que faltaban
-- (hora del backup automático, carpeta de Google Drive y preferencias
-- de cada persona para su panel de inicio).
--
-- Ejecutar en Supabase > SQL Editor después de los archivos 01 a 17.
-- =====================================================================

do $$ begin
  create type public.backup_kind as enum ('manual', 'automatico');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.backup_status as enum ('en_curso', 'completado', 'error');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- REGISTRO DE COPIAS DE SEGURIDAD
--
-- Cada copia deja constancia aquí: cuándo se hizo, cuánto ocupa, qué
-- tablas lleva y dónde está. El archivo en sí vive en Google Drive (o lo
-- descarga la persona); aquí solo se guarda la ficha.
-- ---------------------------------------------------------------------
create table if not exists public.backups (
  id              uuid primary key default gen_random_uuid(),
  kind            public.backup_kind not null default 'manual',
  status          public.backup_status not null default 'en_curso',
  -- 'drive' (subida a Google Drive) o 'descarga' (la guarda la persona).
  destination     text not null default 'descarga',
  file_name       text,
  drive_file_id   text,
  drive_link      text,
  size_bytes      bigint check (size_bytes is null or size_bytes >= 0),
  -- Cuántas filas lleva de cada tabla: {"clients": 24, "projects": 11…}
  tables          jsonb not null default '{}'::jsonb,
  documents_count integer not null default 0,
  error           text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  is_demo         boolean not null default false
);
comment on table public.backups is
  'Ficha de cada copia de seguridad. El archivo va a Google Drive; aquí queda el registro.';

create index if not exists backups_recent_idx on public.backups (started_at desc);

-- ---------------------------------------------------------------------
-- AJUSTES QUE FALTABAN
-- ---------------------------------------------------------------------
alter table public.app_settings add column if not exists backup jsonb not null
  default '{"enabled": true, "hour": 2, "folder": "METALPLAFER360 · Copias de seguridad"}'::jsonb;

comment on column public.app_settings.backup is
  'Ajustes del backup automático. Las credenciales de Google NO están aquí: viven en el servidor.';
comment on column public.app_settings.backup_retention_days is
  'Días que se conservan las copias automáticas en Google Drive.';
comment on column public.profiles.preferences is
  'Preferencias de pantalla de cada persona, como las tarjetas de su panel de inicio.';

-- ---------------------------------------------------------------------
-- USO DEL ALMACENAMIENTO
-- Cuánto ocupan los archivos subidos, por tipo y contando la papelera.
-- ---------------------------------------------------------------------
create or replace view public.storage_usage with (security_invoker = true) as
  select case d.category::text
           when 'foto'  then 'Fotografías'
           when 'video' then 'Vídeos'
           when 'firma' then 'Firmas'
           else              'Documentos' end                      as tipo,
         count(*) filter (where d.deleted_at is null)              as archivos,
         coalesce(sum(d.size_bytes) filter (where d.deleted_at is null), 0) as bytes,
         count(*) filter (where d.deleted_at is not null)          as en_papelera,
         coalesce(sum(d.size_bytes) filter (where d.deleted_at is not null), 0) as bytes_papelera
    from public.documents d
   group by 1;
