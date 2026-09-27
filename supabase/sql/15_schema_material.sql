-- =====================================================================
-- METALPLAFER360 · 15 · MATERIAL, SOLICITUDES Y COBROS (FASE 5)
--
-- Añade:
--   · material pendiente de cada proyecto
--   · lo que comunica un trabajador desde la obra («faltan 3 bisagras»),
--     que NO se convierte en material hasta que lo revisa administración
--   · los cobros parciales para el seguimiento de facturación
--
-- Ejecutar en Supabase > SQL Editor después de los archivos 01 a 14.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.request_status as enum ('pendiente', 'aceptada', 'descartada');
exception when duplicate_object then null; end $$;

-- Dos avisos internos nuevos. Se añaden aquí, en un archivo aparte de
-- donde se usan, porque PostgreSQL no permite usar un valor de un tipo
-- enumerado en la misma transacción en la que se añade.
alter type public.notification_kind add value if not exists 'material_solicitado';
alter type public.notification_kind add value if not exists 'material_retrasado';

-- ---------------------------------------------------------------------
-- MATERIAL PENDIENTE
--
-- Qué falta, cuántas unidades, a quién se pidió y cuándo debería llegar.
--
-- A propósito NO se guardan: precio, número de pedido ni persona
-- solicitante. Tampoco fecha ni usuario al marcar «recibido»: se marca
-- y punto. Quién lo hizo y cuándo queda en el historial general.
-- ---------------------------------------------------------------------
create table if not exists public.materials (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  -- Opcional: la orden de trabajo para la que hace falta.
  order_id     uuid references public.work_orders(id) on delete set null,

  name         text not null check (length(trim(name)) > 0),
  units        numeric(12,2) check (units is null or units > 0),
  supplier     text,
  ordered_on   date,
  expected_on  date,
  received     boolean not null default false,
  notes        text,

  -- Marca interna para no repetir el aviso de retraso el mismo día.
  late_notified_on date,

  archived_at  timestamptz,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.materials is
  'Material pendiente por proyecto. Sin precio, sin número de pedido y sin solicitante.';
comment on column public.materials.received is
  'Se marca a mano. No se guarda ni la fecha ni quién lo marcó: eso va al historial.';

create index if not exists materials_project_idx  on public.materials (project_id);
create index if not exists materials_pending_idx  on public.materials (expected_on)
  where not received and archived_at is null;
create index if not exists materials_supplier_idx on public.materials (lower(supplier));
create index if not exists materials_name_trgm    on public.materials
  using gin (lower(name) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- LO QUE COMUNICA EL TRABAJADOR
--
-- «Faltan 3 bisagras» NO crea material directamente: entra aquí y
-- administración decide si lo convierte en material pendiente.
-- ---------------------------------------------------------------------
create table if not exists public.material_requests (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  order_id    uuid references public.work_orders(id) on delete set null,
  worker_id   uuid not null references public.profiles(id) on delete cascade,

  body        text not null check (length(trim(body)) between 1 and 1000),
  status      public.request_status not null default 'pendiente',

  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  -- El material que salió de esta comunicación, si se aceptó.
  material_id uuid references public.materials(id) on delete set null,

  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),

  constraint requests_reviewed check (
    (status = 'pendiente') = (reviewed_at is null)
  )
);
comment on table public.material_requests is
  'Avisos de falta de material enviados por los trabajadores. Siempre pasan por revisión.';

create index if not exists requests_pending_idx on public.material_requests (created_at)
  where status = 'pendiente';
create index if not exists requests_worker_idx  on public.material_requests (worker_id);
create index if not exists requests_project_idx on public.material_requests (project_id);

-- ---------------------------------------------------------------------
-- COBROS
--
-- Seguimiento interno: total − cobrado = pendiente.
-- NO se guarda el número de factura: eso vive en el programa de
-- facturación de la empresa, no aquí.
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  amount     numeric(12,2) not null check (amount > 0),
  paid_on    date not null default public.today_madrid(),
  notes      text,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.payments is
  'Cobros parciales de un proyecto. Sin número de factura.';

create index if not exists payments_project_idx on public.payments (project_id, paid_on);

-- ---------------------------------------------------------------------
-- RESÚMENES
-- ---------------------------------------------------------------------

/** Total, cobrado y pendiente de cada proyecto. */
create or replace view public.project_billing with (security_invoker = true) as
  select p.id                                        as project_id,
         coalesce(p.budget_amount, 0)                as total,
         coalesce(sum(pay.amount), 0)                as cobrado,
         greatest(coalesce(p.budget_amount, 0) - coalesce(sum(pay.amount), 0), 0) as pendiente,
         count(pay.id)                               as cobros
    from public.projects p
    left join public.payments pay on pay.project_id = p.id
   group by p.id;

/** Material pendiente y retrasado de cada proyecto. */
create or replace view public.project_materials with (security_invoker = true) as
  select m.project_id,
         count(*)                                                  as total,
         count(*) filter (where not m.received)                    as pendientes,
         count(*) filter (where not m.received
                            and m.expected_on < public.today_madrid()) as retrasados
    from public.materials m
   where m.archived_at is null
   group by m.project_id;
