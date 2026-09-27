-- =====================================================================
-- METALPLAFER360 · 09 · PROYECTOS (FASE 3)
--
-- Añade los proyectos, sus fases y sus subestados, y amplía documentos
-- y comentarios para que también funcionen con proyectos.
--
-- Ejecutar en Supabase > SQL Editor después de los archivos 01 a 04 y 06 a 08.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.project_phase as enum
    ('preparacion', 'fabricacion', 'montaje', 'facturacion', 'finalizado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.billing_status as enum
    ('por_facturar', 'pendiente_cobro', 'cobrado_parcial', 'cobrado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Subestados válidos de cada fase.
-- Facturación y Finalizado no llevan subestados: el estado de
-- facturación se guarda en la columna billing_status del proyecto.
-- ---------------------------------------------------------------------
create or replace function public.valid_substatus(p_phase public.project_phase, p_sub text)
returns boolean language sql immutable as $$
  select case p_phase
    when 'preparacion' then p_sub in
      ('pendiente_visita_tecnica', 'pendiente_planos', 'pendiente_material', 'por_empezar')
    when 'fabricacion' then p_sub in
      ('en_fabricacion', 'falta_material', 'por_finalizar')
    when 'montaje' then p_sub in
      ('en_montaje', 'falta_material', 'por_finalizar_montaje')
    else false
  end;
$$;

-- ---------------------------------------------------------------------
-- PROYECTOS
-- ---------------------------------------------------------------------
create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,                    -- PROY-2026-001
  client_id         uuid not null references public.clients(id),
  contact_id        uuid references public.client_contacts(id) on delete set null,
  -- Presupuesto del que nació. Único: un presupuesto se convierte una sola vez.
  source_ficha_id   uuid unique references public.fichas(id) on delete set null,

  name              text not null check (length(trim(name)) > 0),   -- nombre / producto
  description       text,
  measures          text,                                    -- medidas
  finish            text,                                    -- acabado
  location          text,                                    -- ubicación dentro del inmueble
  address           text,                                    -- dirección del proyecto (independiente del cliente)
  observations      text,

  budget_amount     numeric(12,2) check (budget_amount is null or budget_amount >= 0),
  advance_amount    numeric(12,2) check (advance_amount is null or advance_amount >= 0),
  budget_hours_fab  numeric(8,2) not null default 0 check (budget_hours_fab >= 0),
  budget_hours_mont numeric(8,2) not null default 0 check (budget_hours_mont >= 0),

  phase             public.project_phase not null default 'preparacion',
  -- «Sin montaje»: permite pasar de Fabricación directamente a Facturación.
  no_assembly       boolean not null default false,
  billing_status    public.billing_status not null default 'por_facturar',

  finished_at       timestamptz,
  archived_at       timestamptz,
  is_demo           boolean not null default false,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint projects_finished_phase check (
    (phase = 'finalizado') = (finished_at is not null)
  )
);
comment on table public.projects is 'Proyectos: el trabajo real, desde la preparación hasta el cobro.';
comment on column public.projects.address is 'Dirección donde se ejecuta. Es independiente de la dirección del cliente.';
comment on column public.projects.no_assembly is 'Si el proyecto no lleva montaje, de Fabricación se pasa a Facturación.';

create index if not exists projects_phase_idx  on public.projects (phase) where archived_at is null;
create index if not exists projects_client_idx on public.projects (client_id);
create index if not exists projects_name_trgm  on public.projects
  using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists projects_code_idx   on public.projects (lower(code));

-- ---------------------------------------------------------------------
-- SUBESTADOS
-- Tabla aparte porque un proyecto puede tener VARIOS a la vez
-- (por ejemplo: pendiente de planos + pendiente de material).
-- ---------------------------------------------------------------------
create table if not exists public.project_substatuses (
  project_id uuid not null references public.projects(id) on delete cascade,
  phase      public.project_phase not null,
  substatus  text not null,
  created_at timestamptz not null default now(),
  primary key (project_id, phase, substatus),
  constraint substatus_valid check (public.valid_substatus(phase, substatus))
);
comment on table public.project_substatuses is 'Varios subestados simultáneos por proyecto y fase.';

-- ---------------------------------------------------------------------
-- DOCUMENTOS Y COMENTARIOS: ahora también de proyectos
-- Una única lista por proyecto, sin carpetas. Los planos son documentos
-- normales: no hay versiones ni control de versiones.
-- ---------------------------------------------------------------------
alter table public.documents add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.comments  add column if not exists project_id uuid references public.projects(id) on delete cascade;

-- Cada documento y cada comentario pertenecen a UNA sola cosa.
alter table public.documents drop constraint if exists documents_one_owner;
alter table public.documents add constraint documents_one_owner
  check (num_nonnulls(ficha_id, project_id) = 1);

alter table public.comments drop constraint if exists comments_one_owner;
alter table public.comments add constraint comments_one_owner
  check (num_nonnulls(ficha_id, project_id) = 1);

create index if not exists documents_project_idx on public.documents (project_id) where deleted_at is null;
create index if not exists comments_project_idx  on public.comments (project_id, created_at);

-- ---------------------------------------------------------------------
-- Resumen de proyectos por cliente (para la ficha del cliente)
-- ---------------------------------------------------------------------
create or replace view public.client_projects with (security_invoker = true) as
  select p.client_id,
         count(*) filter (where p.archived_at is null)                          as total,
         count(*) filter (where p.archived_at is null and p.phase <> 'finalizado') as en_curso,
         count(*) filter (where p.phase = 'finalizado')                         as finalizados
    from public.projects p
   group by p.client_id;
