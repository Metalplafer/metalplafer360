-- =====================================================================
-- METALPLAFER360 · 06 · CLIENTES Y FICHAS (FASE 2)
--
-- Añade sobre la base de la fase 1:
--   · clientes (empresas y particulares) y sus contactos
--   · fichas: presupuestos, visitas y avisos
--   · documentos y comentarios de las fichas
--
-- Ejecutar en Supabase > SQL Editor después de los archivos 01 a 04.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.client_kind as enum ('empresa', 'particular');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ficha_type as enum ('presupuesto', 'visita', 'aviso');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.doc_category as enum ('documento', 'foto', 'video', 'firma');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Estados válidos de cada tipo de ficha.
-- Se valida en la base de datos: un estado que no exista se rechaza,
-- venga de donde venga.
-- ---------------------------------------------------------------------
create or replace function public.valid_ficha_status(p_type public.ficha_type, p_status text)
returns boolean language sql immutable as $$
  select case p_type
    when 'presupuesto' then p_status in
      ('por_asignar', 'pendiente', 'avanzado', 'por_revisar', 'enviado', 'aceptado', 'cancelado')
    when 'visita' then p_status in
      ('por_asignar', 'asignada', 'realizada', 'cancelada')
    when 'aviso' then p_status in
      ('por_asignar', 'pendiente', 'asignado', 'en_curso', 'realizado', 'cerrado')
  end;
$$;

-- ---------------------------------------------------------------------
-- CLIENTES
-- No se borran nunca: se desactivan (no se usan en fichas nuevas) o se
-- archivan (desaparecen de los listados, pero conservan su historial).
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  kind        public.client_kind not null default 'empresa',
  name        text not null check (length(trim(name)) > 0),
  tax_id      text,                       -- CIF/NIF: opcional
  phone       text,
  email       text,
  address     text,
  city        text,
  postal_code text,
  notes       text,
  active      boolean not null default true,
  archived_at timestamptz,
  is_demo     boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.clients is 'Clientes: empresas y particulares. No se eliminan, se archivan o desactivan.';

-- El mismo CIF/NIF no puede repetirse aunque se escriba con guiones o
-- en minúsculas: B-61234567 y b61234567 son el mismo.
create unique index if not exists clients_tax_id_uniq
  on public.clients (upper(regexp_replace(tax_id, '[^A-Za-z0-9]', '', 'g')))
  where tax_id is not null and length(trim(tax_id)) > 0;

create index if not exists clients_name_trgm on public.clients
  using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists clients_active_idx on public.clients (name) where archived_at is null;

-- ---------------------------------------------------------------------
-- CONTACTOS DEL CLIENTE
-- Un cliente puede tener varios (por ejemplo, gerente y administración).
-- ---------------------------------------------------------------------
create table if not exists public.client_contacts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  role       text,
  phone      text,
  email      text,
  notes      text,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists client_contacts_client_idx on public.client_contacts (client_id);

-- ---------------------------------------------------------------------
-- FICHAS · presupuestos, visitas y avisos
--
-- Van en una única tabla porque comparten casi todos los campos y el
-- mismo ciclo de vida. El campo «type» decide el código, los estados
-- válidos y qué se muestra en pantalla. Se ofrecen tres vistas
-- (budgets, visits, notices) para consultarlas por separado.
-- ---------------------------------------------------------------------
create table if not exists public.fichas (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,               -- PRES-2026-001, VIS-2026-001, AVI-2026-001
  type           public.ficha_type not null,
  status         text not null default 'por_asignar',
  client_id      uuid references public.clients(id),
  contact_id     uuid references public.client_contacts(id) on delete set null,
  title          text,
  description    text,
  address        text,                               -- dirección del trabajo
  phone          text,                               -- teléfono de contacto del aviso
  scheduled_date date,
  scheduled_time time,
  assigned_to    uuid references public.profiles(id) on delete set null,
  amount         numeric(12,2) check (amount is null or amount >= 0),
  archived_at    timestamptz,
  is_demo        boolean not null default false,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint fichas_status_valid check (public.valid_ficha_status(type, status)),
  -- Los presupuestos y los avisos son siempre de un cliente.
  -- Una visita puede ser de alguien que todavía no es cliente.
  constraint fichas_client_required check (type = 'visita' or client_id is not null)
);
comment on table public.fichas is 'Presupuestos, visitas y avisos. Toda ficha nueva empieza en «Por asignar».';

create index if not exists fichas_type_status_idx on public.fichas (type, status) where archived_at is null;
create index if not exists fichas_client_idx   on public.fichas (client_id);
create index if not exists fichas_assigned_idx on public.fichas (assigned_to);
create index if not exists fichas_date_idx     on public.fichas (scheduled_date);
create index if not exists fichas_code_idx     on public.fichas (lower(code));

-- Vistas de conveniencia. Respetan los permisos de quien consulta.
create or replace view public.budgets with (security_invoker = true) as
  select * from public.fichas where type = 'presupuesto';
create or replace view public.visits with (security_invoker = true) as
  select * from public.fichas where type = 'visita';
create or replace view public.notices with (security_invoker = true) as
  select * from public.fichas where type = 'aviso';

-- ---------------------------------------------------------------------
-- DOCUMENTOS
-- Una única lista por ficha (PDF, fotos, vídeos…). Sin carpetas: el
-- nombre del archivo identifica el contenido.
-- Al eliminar se marca deleted_at (papelera), no se borra de golpe.
--
-- En las fases siguientes se añadirán las columnas project_id y order_id
-- para los documentos de proyectos y de órdenes de trabajo.
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  ficha_id     uuid references public.fichas(id) on delete cascade,
  bucket       text not null default 'documentos',
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint not null check (size_bytes >= 0 and size_bytes <= 104857600),  -- 100 MB
  category     public.doc_category not null default 'documento',
  uploaded_by  uuid references public.profiles(id) on delete set null,
  deleted_at   timestamptz,
  deleted_by   uuid references public.profiles(id) on delete set null,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists documents_ficha_idx on public.documents (ficha_id) where deleted_at is null;
create index if not exists documents_trash_idx on public.documents (deleted_at) where deleted_at is not null;

-- ---------------------------------------------------------------------
-- COMENTARIOS · solo texto, sin archivos adjuntos
-- ---------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  ficha_id   uuid references public.fichas(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null check (length(trim(body)) between 1 and 4000),
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists comments_ficha_idx on public.comments (ficha_id, created_at);
