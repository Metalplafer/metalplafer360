-- =====================================================================
-- METALPLAFER360 · 12 · ÓRDENES DE TRABAJO (FASE 4)
--
-- Añade las órdenes de trabajo (fabricación y montaje), el parte de cada
-- trabajador (trabajo realizado y horas) y las notificaciones internas.
--
-- Ejecutar en Supabase > SQL Editor después de los archivos 01 a 04 y 06 a 11.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.order_type as enum ('fabricacion', 'montaje');
exception when duplicate_object then null; end $$;

-- «realizada» significa «Realizada · pendiente de revisión»:
-- el trabajo está hecho y espera a que administración lo revise.
do $$ begin
  create type public.order_status as enum
    ('pendiente', 'en_curso', 'realizada', 'validada', 'devuelta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_kind as enum
    ('orden_asignada', 'orden_enviada', 'devolucion', 'validacion', 'comentario');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- ÓRDENES DE TRABAJO
--
-- Las crea SIEMPRE administración. Llevan solo FECHA: no hay hora
-- prevista de inicio ni de fin, porque en el taller y en las obras el
-- horario real no se decide por adelantado.
--
-- Las horas previstas son de la orden entera. Las horas reales las
-- registra cada trabajador por su cuenta (tabla work_order_workers).
-- ---------------------------------------------------------------------
create table if not exists public.work_orders (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,                       -- OT-2026-001
  project_id      uuid not null references public.projects(id) on delete cascade,
  type            public.order_type not null,
  scheduled_date  date not null,

  -- Trabajo a realizar. Lo escribe administración y el trabajador NO
  -- puede modificarlo: él añade su «trabajo realizado» aparte.
  description     text not null check (length(trim(description)) > 0),
  planned_hours   numeric(8,2) not null default 0
                  check (planned_hours >= 0 and planned_hours <= 999),
  admin_notes     text,                                       -- comentarios de administración

  status          public.order_status not null default 'pendiente',

  submitted_at    timestamptz,                                -- cuando quedó pendiente de revisión
  validated_at    timestamptz,
  validated_by    uuid references public.profiles(id) on delete set null,
  returned_at     timestamptz,
  return_reason   text,                                       -- motivo de la última devolución

  archived_at     timestamptz,
  is_demo         boolean not null default false,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Una orden devuelta siempre lleva motivo escrito.
  constraint work_orders_return_reason check (
    status <> 'devuelta' or length(trim(coalesce(return_reason, ''))) > 0
  ),
  constraint work_orders_validated check (
    (status = 'validada') = (validated_at is not null)
  )
);
comment on table public.work_orders is
  'Órdenes de trabajo de fabricación y montaje. Solo las crea administración.';
comment on column public.work_orders.description is
  'Trabajo a realizar. El trabajador no puede modificarlo.';
comment on column public.work_orders.planned_hours is
  'Horas previstas para la orden completa, no por trabajador.';

create index if not exists work_orders_project_idx on public.work_orders (project_id);
create index if not exists work_orders_date_idx    on public.work_orders (scheduled_date)
  where archived_at is null;
create index if not exists work_orders_status_idx  on public.work_orders (status)
  where archived_at is null;
create index if not exists work_orders_code_idx    on public.work_orders (lower(code));

-- ---------------------------------------------------------------------
-- TRABAJADORES DE LA ORDEN · el parte de cada uno
--
-- Una orden puede tener varios trabajadores (Juan + Pedro + Marc) y
-- NO existe responsable principal: todos están al mismo nivel.
-- Cada fila guarda el parte de una persona: qué hizo y cuántas horas.
-- ---------------------------------------------------------------------
create table if not exists public.work_order_workers (
  order_id     uuid not null references public.work_orders(id) on delete cascade,
  worker_id    uuid not null references public.profiles(id) on delete cascade,

  work_done    text,                                          -- trabajo realizado (lo escribe él)
  hours        numeric(6,2) check (hours is null or (hours > 0 and hours <= 24)),
  submitted_at timestamptz,                                   -- cuando envió su parte

  assigned_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  is_demo      boolean not null default false,
  primary key (order_id, worker_id)
);
comment on table public.work_order_workers is
  'Trabajadores asignados a una orden y el parte de cada uno. Sin responsable principal.';
comment on column public.work_order_workers.hours is
  'Horas reales con decimales (7,5 = siete horas y media). Máximo 24 por orden y persona.';

create index if not exists wow_worker_idx on public.work_order_workers (worker_id);

-- ---------------------------------------------------------------------
-- DOCUMENTOS Y COMENTARIOS: ahora también de órdenes
-- (fotografías, firma del cliente y comentarios de la orden)
-- ---------------------------------------------------------------------
alter table public.documents add column if not exists order_id uuid
  references public.work_orders(id) on delete cascade;
alter table public.comments  add column if not exists order_id uuid
  references public.work_orders(id) on delete cascade;

alter table public.documents drop constraint if exists documents_one_owner;
alter table public.documents add constraint documents_one_owner
  check (num_nonnulls(ficha_id, project_id, order_id) = 1);

alter table public.comments drop constraint if exists comments_one_owner;
alter table public.comments add constraint comments_one_owner
  check (num_nonnulls(ficha_id, project_id, order_id) = 1);

create index if not exists documents_order_idx on public.documents (order_id) where deleted_at is null;
create index if not exists comments_order_idx  on public.comments (order_id, created_at);

-- ---------------------------------------------------------------------
-- NOTIFICACIONES INTERNAS
--
-- Solo dentro de la aplicación: NO se envía ningún correo electrónico.
-- Se avisa de: orden asignada, orden enviada a revisión, devolución,
-- validación y comentario nuevo.
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       public.notification_kind not null,
  title      text not null,
  body       text,
  order_id   uuid references public.work_orders(id) on delete cascade,
  read_at    timestamptz,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.notifications is
  'Avisos internos de la aplicación. Nunca se envían por correo electrónico.';

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------
-- RESUMEN DE ÓRDENES POR PROYECTO (para la pantalla del proyecto)
-- ---------------------------------------------------------------------
create or replace view public.project_orders with (security_invoker = true) as
  select o.project_id,
         count(*) filter (where o.archived_at is null)                      as total,
         count(*) filter (where o.archived_at is null and o.status = 'realizada') as por_revisar,
         count(*) filter (where o.archived_at is null and o.status = 'validada')  as validadas,
         coalesce(sum(o.planned_hours) filter (where o.archived_at is null), 0)   as horas_previstas
    from public.work_orders o
   group by o.project_id;

-- ---------------------------------------------------------------------
-- HORAS REALES POR ORDEN
-- ---------------------------------------------------------------------
create or replace view public.order_hours with (security_invoker = true) as
  select w.order_id,
         coalesce(sum(w.hours), 0)                     as horas_reales,
         count(*)                                      as trabajadores,
         count(*) filter (where w.submitted_at is not null) as partes_enviados
    from public.work_order_workers w
   group by w.order_id;
