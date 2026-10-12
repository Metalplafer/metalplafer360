-- =====================================================================
-- METALPLAFER360 · 26 · PROYECTOS, TRABAJADORES Y PARTES DE TRABAJO
--
-- QUÉ CAMBIA
-- Hasta ahora el trabajador llegaba a un proyecto porque tenía una ORDEN
-- de ese proyecto. A partir de ahora se le asigna al PROYECTO, y dentro
-- del proyecto rellena PARTES DE TRABAJO con las horas que él
-- personalmente ha hecho.
--
-- QUÉ SE REUTILIZA (no se inventa nada que ya exista)
--   · public.order_type        → fabricación / montaje, tal cual
--   · projects.budget_hours_*  → las horas previstas ya estaban
--   · documents / comments     → se amplían con el parte, igual que ya
--                                se ampliaron con proyectos y órdenes
--   · notifications            → los mismos avisos internos
--   · next_code('PT')          → numeración PT-2026-001, como OT y PRES
--
-- LAS ÓRDENES DE TRABAJO SIGUEN EXISTIENDO. El calendario, la
-- facturación y los informes dependen de ellas. Se retirarán cuando el
-- calendario se rehaga, no ahora.
--
-- Ejecutar en Supabase > SQL Editor después del archivo 25.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) TRABAJADORES ASIGNADOS A UN PROYECTO
--
-- Es la puerta de entrada del trabajador: si está aquí, ve el proyecto.
-- Administración puede poner a varios.
-- ---------------------------------------------------------------------
create table if not exists public.project_workers (
  project_id  uuid not null references public.projects(id) on delete cascade,
  worker_id   uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  is_demo     boolean not null default false,
  primary key (project_id, worker_id)
);
comment on table public.project_workers is
  'Quién puede entrar en cada proyecto. Es lo que decide el acceso del trabajador.';

create index if not exists project_workers_worker_idx on public.project_workers (worker_id);


-- ---------------------------------------------------------------------
-- 2) ESTADOS DE UN PARTE
--
--   borrador  → lo está escribiendo, solo lo ve él (y administración)
--   enviado   → pendiente de validación
--   validado  → administración lo dio por bueno. AHORA cuentan las horas
--   rechazado → devuelto con un motivo escrito; se puede corregir
-- ---------------------------------------------------------------------
do $$ begin
  create type public.report_status as enum
    ('borrador', 'enviado', 'validado', 'rechazado');
exception when duplicate_object then null; end $$;

-- Avisos internos nuevos. Van en este archivo, aparte de donde se usan,
-- porque PostgreSQL no deja usar un valor de un enumerado en la misma
-- transacción en la que se añade.
alter type public.notification_kind add value if not exists 'parte_enviado';
alter type public.notification_kind add value if not exists 'parte_validado';
alter type public.notification_kind add value if not exists 'parte_rechazado';
alter type public.notification_kind add value if not exists 'proyecto_asignado';


-- ---------------------------------------------------------------------
-- 3) PARTES DE TRABAJO
--
-- Un parte es de UNA persona: las horas son las que ESA persona ha
-- trabajado. No son horas de pareja ni del proyecto entero.
--
-- El proyecto puede faltar: «Salvi me ha dicho que haga una faena pero
-- todavía no me ha asignado el proyecto». Administración se lo asigna
-- después.
-- ---------------------------------------------------------------------
create table if not exists public.work_reports (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,                      -- PT-2026-001

  worker_id     uuid not null references public.profiles(id) on delete restrict,
  project_id    uuid references public.projects(id) on delete set null,

  -- Fabricación o montaje: el mismo tipo que ya usan las órdenes.
  work_type     public.order_type not null,
  work_date     date not null,

  work_done     text,
  hours         numeric(6,2) check (hours is null or (hours > 0 and hours <= 24)),
  needs_material boolean not null default false,

  status        public.report_status not null default 'borrador',
  submitted_at  timestamptz,
  validated_at  timestamptz,
  validated_by  uuid references public.profiles(id) on delete set null,
  rejected_at   timestamptz,
  reject_reason text,

  -- Cuándo pasó a formar parte de un proyecto (si nació sin él).
  assigned_at   timestamptz,
  assigned_by   uuid references public.profiles(id) on delete set null,

  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Un parte rechazado lleva SIEMPRE el motivo escrito.
  constraint work_reports_reject_reason check (
    status <> 'rechazado' or length(trim(coalesce(reject_reason, ''))) > 0
  ),
  -- Validado y fecha de validación van juntos, o no van.
  constraint work_reports_validated check (
    (status = 'validado') = (validated_at is not null)
  ),
  -- Para enviarlo hace falta haber escrito el trabajo y las horas.
  constraint work_reports_enviable check (
    status = 'borrador'
    or (length(trim(coalesce(work_done, ''))) > 0 and hours is not null and hours > 0)
  )
);
comment on table public.work_reports is
  'Partes de trabajo. Cada uno es de una sola persona y lleva SUS horas.';
comment on column public.work_reports.hours is
  'Horas que esa persona ha trabajado, con decimales (7,5 = siete y media). Nunca de pareja.';
comment on column public.work_reports.project_id is
  'Puede estar vacío: administración asigna el parte a un proyecto más tarde.';

create index if not exists work_reports_worker_idx  on public.work_reports (worker_id, work_date desc);
create index if not exists work_reports_project_idx on public.work_reports (project_id);
create index if not exists work_reports_status_idx  on public.work_reports (status);
create index if not exists work_reports_pending_idx on public.work_reports (submitted_at) where status = 'enviado';
create index if not exists work_reports_validated_by_idx on public.work_reports (validated_by);
create index if not exists work_reports_assigned_by_idx  on public.work_reports (assigned_by);
create index if not exists project_workers_assigned_by_idx on public.project_workers (assigned_by);


-- ---------------------------------------------------------------------
-- 4) DOCUMENTOS Y COMENTARIOS: ahora también de un parte
--
-- Mismo patrón que ya se usó para proyectos y órdenes: una columna más y
-- la regla de «un solo dueño». Así las fotos y la firma del parte
-- heredan la papelera, el almacenamiento y los permisos que ya existen.
-- ---------------------------------------------------------------------
alter table public.documents add column if not exists report_id uuid
  references public.work_reports(id) on delete cascade;
alter table public.comments  add column if not exists report_id uuid
  references public.work_reports(id) on delete cascade;

alter table public.documents drop constraint if exists documents_one_owner;
alter table public.documents add constraint documents_one_owner
  check (num_nonnulls(ficha_id, project_id, order_id, report_id) = 1);

alter table public.comments drop constraint if exists comments_one_owner;
alter table public.comments add constraint comments_one_owner
  check (num_nonnulls(ficha_id, project_id, order_id, report_id) = 1);

create index if not exists documents_report_idx on public.documents (report_id);
create index if not exists comments_report_idx  on public.comments (report_id, created_at);


-- ---------------------------------------------------------------------
-- 5) COMENTARIO DIRIGIDO A UN TRABAJADOR
--
-- Lo piden así: un comentario puede ir dirigido a una persona concreta.
-- Lo LEEN todos los que tienen acceso al proyecto —no es un mensaje
-- privado—, pero el aviso le llega SOLO a ella. Por eso basta una
-- columna: no hace falta un sistema de permisos aparte.
-- ---------------------------------------------------------------------
alter table public.comments add column if not exists target_worker_id uuid
  references public.profiles(id) on delete set null;
comment on column public.comments.target_worker_id is
  'A quién va dirigido. Lo leen todos; el aviso le llega solo a esa persona.';

create index if not exists comments_target_idx on public.comments (target_worker_id);


-- ---------------------------------------------------------------------
-- 6) AVISOS INTERNOS DE UN PARTE
-- ---------------------------------------------------------------------
alter table public.notifications add column if not exists report_id uuid
  references public.work_reports(id) on delete cascade;

create index if not exists notifications_report_idx on public.notifications (report_id);
