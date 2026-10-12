-- =====================================================================
-- METALPLAFER360 · 31 · OBRAS
--
-- QUÉ ES UNA OBRA
-- Un cajón por encima de los proyectos. «Comunidad Calle Mayor 25» es
-- una obra; dentro van la puerta de entrada, la barandilla, la puerta
-- del garaje y el cerramiento, cada uno su proyecto.
--
-- Los proyectos NO cambian: siguen funcionando igual, siguen saliendo en
-- su listado y conservan sus fases, su material y su planificación. La
-- obra solo los agrupa y suma.
--
-- LO QUE SE REUTILIZA (no se inventa nada que ya exista)
--   · projects.budget_amount      → el importe de cada proyecto
--   · billing_status              → el estado de cobro que ya había
--   · payments / project_billing  → los cobros, tal cual
--   · materials                   → el material pendiente, tal cual
--   · comments                    → los comentarios, con una columna más
--   · next_code('OBRA')           → la numeración, como PRES, PROY y PT
--   · trg_audit / audit_log       → el historial
--
-- LO QUE ES NUEVO: la obra, sus extras y la facturación manual.
--
-- EL DINERO DE LA OBRA ES DE ADMINISTRACIÓN. Un trabajador no lee la
-- tabla, ni los extras, ni los totales. Como con los proyectos: no es
-- que no se le enseñe, es que la base de datos no se lo devuelve.
--
-- Ejecutar después del archivo 30.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LA OBRA
--
-- Los campos son los mismos que ya usa un proyecto para lo equivalente:
-- cliente, dirección, descripción y observaciones. Ni uno más.
-- ---------------------------------------------------------------------
create table if not exists public.works (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                 -- OBRA-2026-001
  name        text not null check (length(trim(name)) between 1 and 160),
  client_id   uuid references public.clients(id) on delete set null,
  address     text,
  description text,
  observations text,

  archived_at timestamptz,
  is_demo     boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.works is
  'Obras: agrupan varios proyectos. El dinero de la obra es de administración.';

create index if not exists works_client_idx     on public.works (client_id);
create index if not exists works_created_by_idx on public.works (created_by);
create index if not exists works_activas_idx    on public.works (archived_at) where archived_at is null;


-- ---------------------------------------------------------------------
-- 2) UN PROYECTO PUEDE PERTENECER A UNA OBRA
--
-- Al borrar la obra, los proyectos NO se van con ella: se quedan
-- sueltos, como estaban antes. Por eso «set null» y no «cascade».
-- ---------------------------------------------------------------------
alter table public.projects
  add column if not exists work_id uuid references public.works(id) on delete set null;

create index if not exists projects_work_idx on public.projects (work_id);


-- ---------------------------------------------------------------------
-- 3) FACTURACIÓN MANUAL, POR PROYECTO
--
-- Hasta ahora «billing_status» mezclaba dos cosas: si está facturado y
-- cómo va el cobro. Se deja como estaba —lo usan la pantalla de
-- facturación y los informes— y se añade al lado lo que faltaba: el
-- importe REALMENTE facturado y cuándo.
--
--   facturado  =  invoiced_on is not null
-- ---------------------------------------------------------------------
alter table public.projects
  add column if not exists invoiced_amount numeric(12,2),
  add column if not exists invoiced_on     date;

alter table public.projects drop constraint if exists projects_invoiced_check;
alter table public.projects add constraint projects_invoiced_check
  check (invoiced_amount is null or invoiced_amount >= 0);

comment on column public.projects.invoiced_amount is
  'Importe realmente facturado de este proyecto. Lo pone administración a mano.';


-- ---------------------------------------------------------------------
-- 4) COSTES EXTRAS DE LA OBRA
--
-- Transporte, trabajos añadidos, material extraordinario… Lo que no
-- merece un proyecto propio pero hay que cobrar.
-- ---------------------------------------------------------------------
create table if not exists public.work_extras (
  id         uuid primary key default gen_random_uuid(),
  work_id    uuid not null references public.works(id) on delete cascade,
  concept    text not null check (length(trim(concept)) between 1 and 160),
  amount     numeric(12,2) not null,
  notes      text,
  created_by uuid references public.profiles(id) on delete set null,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.work_extras is
  'Costes e importes extra de una obra, aparte de los proyectos.';

create index if not exists work_extras_work_idx    on public.work_extras (work_id);
create index if not exists work_extras_created_by_idx on public.work_extras (created_by);


-- ---------------------------------------------------------------------
-- 5) COMENTARIOS DE LA OBRA
--
-- Mismo patrón de siempre: una columna más y la regla de «un solo
-- dueño». Así heredan permisos, historial y la pantalla que ya existe.
-- ---------------------------------------------------------------------
alter table public.comments add column if not exists work_id uuid
  references public.works(id) on delete cascade;

alter table public.comments drop constraint if exists comments_one_owner;
alter table public.comments add constraint comments_one_owner
  check (num_nonnulls(ficha_id, project_id, order_id, report_id, work_id) = 1);

create index if not exists comments_work_idx on public.comments (work_id, created_at);


-- ---------------------------------------------------------------------
-- 6) LAS CUENTAS DE LA OBRA
--
--     total de proyectos  +  extras  =  total estimado
--     facturado           →  lo que se ha facturado de verdad
--     pendiente           →  total estimado − facturado
--
-- Nada más complicado que eso, que es lo que se pidió.
-- ---------------------------------------------------------------------
create or replace view public.work_summary with (security_invoker = true) as
  select w.id as work_id,
         w.code,
         w.name,
         coalesce(p.proyectos, 0)        as proyectos,
         coalesce(p.activos, 0)          as proyectos_activos,
         coalesce(p.finalizados, 0)      as proyectos_finalizados,
         coalesce(p.total_proyectos, 0)  as total_proyectos,
         coalesce(e.extras, 0)           as extras,
         coalesce(p.total_proyectos, 0) + coalesce(e.extras, 0) as total_estimado,
         coalesce(p.facturado, 0)        as facturado,
         coalesce(p.total_proyectos, 0) + coalesce(e.extras, 0)
           - coalesce(p.facturado, 0)    as pendiente_facturar,
         coalesce(p.cobrado, 0)          as cobrado,
         coalesce(p.material_pendiente, 0) as material_pendiente,
         p.desde,
         p.hasta
    from public.works w
    left join lateral (
      select count(*)                                                   as proyectos,
             count(*) filter (where pr.phase <> 'finalizado'
                                and pr.archived_at is null)              as activos,
             count(*) filter (where pr.phase = 'finalizado')             as finalizados,
             coalesce(sum(pr.budget_amount), 0)                          as total_proyectos,
             coalesce(sum(pr.invoiced_amount), 0)                        as facturado,
             coalesce(sum((select b.cobrado from public.project_billing b
                            where b.project_id = pr.id)), 0)             as cobrado,
             coalesce(sum((select count(*) from public.materials m
                            where m.project_id = pr.id
                              and not m.received and m.archived_at is null)), 0) as material_pendiente,
             min(least(pr.fab_start, pr.mont_start))                     as desde,
             max(greatest(pr.fab_end, pr.mont_end))                      as hasta
        from public.projects pr
       where pr.work_id = w.id
    ) p on true
    left join lateral (
      select coalesce(sum(x.amount), 0) as extras
        from public.work_extras x where x.work_id = w.id
    ) e on true;

comment on view public.work_summary is
  'Las cuentas de cada obra. Solo las ve administración: lee «projects», que es suya.';


-- ---------------------------------------------------------------------
-- 7) CREAR Y CAMBIAR UNA OBRA
-- ---------------------------------------------------------------------
create or replace function public.save_work(
  p_id uuid default null, p_name text default null, p_client uuid default null,
  p_address text default null, p_description text default null,
  p_observations text default null)
returns public.works language plpgsql security definer set search_path = public as $$
declare w public.works; v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  perform public.assert_admin();

  if v_name is null then
    raise exception 'Escribe el nombre de la obra' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.works (code, name, client_id, address, description, observations, created_by)
    values (public.next_code('OBRA'), v_name, p_client,
            nullif(trim(coalesce(p_address, '')), ''),
            nullif(trim(coalesce(p_description, '')), ''),
            nullif(trim(coalesce(p_observations, '')), ''),
            auth.uid())
    returning * into w;
  else
    update public.works
       set name = v_name, client_id = p_client,
           address = nullif(trim(coalesce(p_address, '')), ''),
           description = nullif(trim(coalesce(p_description, '')), ''),
           observations = nullif(trim(coalesce(p_observations, '')), ''),
           updated_at = now()
     where id = p_id
    returning * into w;
    if not found then
      raise exception 'No se encuentra la obra' using errcode = 'P0002';
    end if;
  end if;

  return w;
end $$;


/** Meter o sacar un proyecto de una obra. */
create or replace function public.set_project_work(p_project uuid, p_work uuid)
returns public.projects language plpgsql security definer set search_path = public as $$
declare p public.projects; v_antes text; v_ahora text;
begin
  perform public.assert_admin();

  select * into p from public.projects where id = p_project for update;
  if not found then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;

  if p_work is not null and not exists (select 1 from public.works where id = p_work) then
    raise exception 'No se encuentra la obra' using errcode = 'P0002';
  end if;

  if p.work_id is not distinct from p_work then return p; end if;

  select code || ' · ' || name into v_antes from public.works where id = p.work_id;
  select code || ' · ' || name into v_ahora from public.works where id = p_work;

  perform set_config('app.skip_audit', 'on', true);
  update public.projects set work_id = p_work, updated_at = now() where id = p_project;
  perform set_config('app.skip_audit', 'off', true);

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'obra_proyecto', 'projects', p.id, p.code,
          public.actor_name() ||
          case when p_work is null
               then ' sacó ' || p.code || ' de la obra ' || coalesce(v_antes, 'anterior')
               else ' metió ' || p.code || ' en la obra ' || v_ahora end,
          jsonb_build_object('antes', p.work_id, 'despues', p_work), p.is_demo);

  -- Y la misma anotación en el historial de la obra, que es donde se
  -- mira «qué proyectos entraron y cuándo».
  if p_work is not null then
    insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                  entity_code, summary, details, is_demo)
    select auth.uid(), public.actor_name(), 'obra_proyecto', 'works', w.id, w.code,
           public.actor_name() || ' metió el proyecto ' || p.code || ' · ' || p.name ||
           ' en la obra', jsonb_build_object('proyecto', p.id), w.is_demo
      from public.works w where w.id = p_work;
  end if;
  if p.work_id is not null then
    insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                  entity_code, summary, details, is_demo)
    select auth.uid(), public.actor_name(), 'obra_proyecto', 'works', w.id, w.code,
           public.actor_name() || ' sacó el proyecto ' || p.code || ' de la obra',
           jsonb_build_object('proyecto', p.id), w.is_demo
      from public.works w where w.id = p.work_id;
  end if;

  select * into p from public.projects where id = p_project;
  return p;
end $$;


/** Archivar o recuperar una obra. Los proyectos no se tocan. */
create or replace function public.archive_work(p_work uuid, p_archive boolean default true)
returns public.works language plpgsql security definer set search_path = public as $$
declare w public.works;
begin
  perform public.assert_admin();
  update public.works
     set archived_at = case when p_archive then now() else null end, updated_at = now()
   where id = p_work
  returning * into w;
  if not found then
    raise exception 'No se encuentra la obra' using errcode = 'P0002';
  end if;
  return w;
end $$;


/**
 * ELIMINAR una obra.
 * Los proyectos NO se borran: se quedan sueltos. Lo que se va son sus
 * extras y sus comentarios. Si hay algo facturado, se niega: eso es
 * dinero de verdad y no se borra de un clic.
 */
create or replace function public.delete_work(p_work uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w public.works; v_proy int; v_extras int; v_facturado numeric;
begin
  perform public.assert_admin();

  select * into w from public.works where id = p_work;
  if not found then
    raise exception 'No se encuentra la obra' using errcode = 'P0002';
  end if;

  select count(*), coalesce(sum(invoiced_amount), 0) into v_proy, v_facturado
    from public.projects where work_id = p_work;
  select count(*) into v_extras from public.work_extras where work_id = p_work;

  if v_facturado > 0 then
    raise exception
      'No se puede eliminar %: tiene % facturados. Archívala en lugar de eliminarla.',
      w.code, public.fmt_eur(v_facturado) using errcode = '23503';
  end if;

  perform set_config('app.skip_audit', 'on', true);
  delete from public.works where id = p_work;   -- los proyectos quedan sueltos
  perform set_config('app.skip_audit', 'off', true);

  perform public.log_event('eliminar_obra', 'works',
    public.actor_name() || ' eliminó la obra ' || w.code || ' · ' || w.name ||
    ' (' || v_proy || ' proyectos quedan sueltos, ' || v_extras || ' extras eliminados)',
    jsonb_build_object('registro', to_jsonb(w), 'proyectos', v_proy, 'extras', v_extras));

  return jsonb_build_object('ok', true, 'code', w.code,
                            'proyectos_sueltos', v_proy, 'extras', v_extras);
end $$;


-- ---------------------------------------------------------------------
-- 8) LOS EXTRAS
-- ---------------------------------------------------------------------
create or replace function public.save_work_extra(
  p_id uuid default null, p_work uuid default null, p_concept text default null,
  p_amount numeric default null, p_notes text default null)
returns public.work_extras language plpgsql security definer set search_path = public as $$
declare
  x public.work_extras; w public.works;
  v_concept text := nullif(trim(coalesce(p_concept, '')), '');
  v_antes numeric;
begin
  perform public.assert_admin();

  if v_concept is null then
    raise exception 'Escribe de qué es el coste extra' using errcode = '22023';
  end if;
  if p_amount is null then
    raise exception 'Escribe el importe' using errcode = '22023';
  end if;

  if p_id is null then
    select * into w from public.works where id = p_work;
    if not found then
      raise exception 'No se encuentra la obra' using errcode = 'P0002';
    end if;
    insert into public.work_extras (work_id, concept, amount, notes, created_by, is_demo)
    values (p_work, v_concept, round(p_amount, 2),
            nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), w.is_demo)
    returning * into x;

    insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                  entity_code, summary, details, is_demo)
    values (auth.uid(), public.actor_name(), 'extra_obra', 'work_extras', x.id, w.code,
            public.actor_name() || ' añadió el extra «' || v_concept || '» de ' ||
            public.fmt_eur(x.amount) || ' a la obra ' || w.code,
            jsonb_build_object('importe', x.amount), w.is_demo);
  else
    select amount into v_antes from public.work_extras where id = p_id;
    update public.work_extras
       set concept = v_concept, amount = round(p_amount, 2),
           notes = nullif(trim(coalesce(p_notes, '')), ''), updated_at = now()
     where id = p_id
    returning * into x;
    if not found then
      raise exception 'No se encuentra el coste extra' using errcode = 'P0002';
    end if;
    select * into w from public.works where id = x.work_id;

    insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                  entity_code, summary, details, is_demo)
    values (auth.uid(), public.actor_name(), 'extra_obra', 'work_extras', x.id, w.code,
            public.actor_name() || ' cambió el extra «' || v_concept || '» de ' ||
            public.fmt_eur(v_antes) || ' a ' || public.fmt_eur(x.amount) ||
            ' en la obra ' || w.code,
            jsonb_build_object('antes', v_antes, 'despues', x.amount), w.is_demo);
  end if;

  return x;
end $$;

create or replace function public.delete_work_extra(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare x public.work_extras; w public.works;
begin
  perform public.assert_admin();

  select * into x from public.work_extras where id = p_id;
  if not found then
    raise exception 'No se encuentra el coste extra' using errcode = 'P0002';
  end if;
  select * into w from public.works where id = x.work_id;

  delete from public.work_extras where id = p_id;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'extra_obra', 'work_extras', x.id, w.code,
          public.actor_name() || ' quitó el extra «' || x.concept || '» de ' ||
          public.fmt_eur(x.amount) || ' de la obra ' || w.code,
          jsonb_build_object('registro', to_jsonb(x)), w.is_demo);
end $$;


-- ---------------------------------------------------------------------
-- 9) FACTURAR UN PROYECTO, A MANO
--
-- No hay integración con nada: lo marca administración.
-- Si se marca como facturado y el proyecto seguía «Por facturar», se
-- pasa a «Pendiente de cobro», que es el estado que ya existía para eso.
-- Así no hay dos sistemas diciendo cosas distintas.
-- ---------------------------------------------------------------------
create or replace function public.set_project_invoiced(
  p_project uuid, p_invoiced boolean, p_amount numeric default null, p_on date default null)
returns public.projects language plpgsql security definer set search_path = public as $$
declare p public.projects; v_antes numeric; v_importe numeric;
begin
  perform public.assert_admin();

  select * into p from public.projects where id = p_project for update;
  if not found then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;

  v_antes := p.invoiced_amount;

  if p_invoiced then
    -- Si no se dice importe, se factura lo presupuestado.
    v_importe := round(coalesce(p_amount, p.budget_amount, 0), 2);
    if v_importe < 0 then
      raise exception 'El importe facturado no puede ser negativo' using errcode = '22023';
    end if;

    perform set_config('app.skip_audit', 'on', true);
    update public.projects
       set invoiced_amount = v_importe,
           invoiced_on = coalesce(p_on, public.today_madrid()),
           billing_status = case when billing_status = 'por_facturar'
                                 then 'pendiente_cobro'::public.billing_status
                                 else billing_status end,
           updated_at = now()
     where id = p_project;
    perform set_config('app.skip_audit', 'off', true);
  else
    perform set_config('app.skip_audit', 'on', true);
    update public.projects
       set invoiced_amount = null, invoiced_on = null, updated_at = now()
     where id = p_project;
    perform set_config('app.skip_audit', 'off', true);
  end if;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'facturacion', 'projects', p.id, p.code,
          public.actor_name() ||
          case when p_invoiced
               then ' marcó ' || p.code || ' como facturado por ' || public.fmt_eur(v_importe)
               else ' quitó la marca de facturado de ' || p.code end,
          jsonb_build_object('antes', v_antes, 'despues', case when p_invoiced then v_importe end),
          p.is_demo);

  -- Y en el historial de la obra, si pertenece a una.
  if p.work_id is not null then
    insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                  entity_code, summary, details, is_demo)
    select auth.uid(), public.actor_name(), 'facturacion', 'works', w.id, w.code,
           public.actor_name() ||
           case when p_invoiced
                then ' facturó ' || p.code || ' por ' || public.fmt_eur(v_importe)
                else ' quitó la facturación de ' || p.code end,
           jsonb_build_object('proyecto', p.id), w.is_demo
      from public.works w where w.id = p.work_id;
  end if;

  select * into p from public.projects where id = p_project;
  return p;
end $$;


-- ---------------------------------------------------------------------
-- 10) LA OBRA EN EL CALENDARIO
--
-- Una obra no tiene fechas propias: las toma de sus proyectos, desde el
-- primer día planificado hasta el último. Así no hay que inventar nada
-- ni mantener dos sitios con fechas.
--
-- Solo la ve administración: la vista lee «works», que es suya.
-- ---------------------------------------------------------------------
create or replace view public.v_calendar with (security_invoker = true) as
  select s.phase                              as kind,
         s.project_id                         as id,
         s.code,
         s.name                               as title,
         case when s.ends > s.starts
              then 'Día ' || d.n || ' de ' || (s.ends - s.starts + 1)
              else null end                   as detail,
         d.day                                as date,
         case when s.manual then 'Colocado a mano' else 'Planificado' end as status,
         s.project_id,
         s.code                               as project_code,
         c.name                               as client_name,
         coalesce((select array_agg(distinct w)
                     from (
                       select pw.worker_id as w from public.project_workers pw
                        where pw.project_id = s.project_id
                       union
                       select ow.worker_id from public.work_order_workers ow
                        join public.work_orders o on o.id = ow.order_id
                        where o.project_id = s.project_id and o.archived_at is null
                          and o.type::text = s.phase
                     ) q), '{}'::uuid[]) as assigned,
         true                                 as movable
    from public.planned_spans s
    join public.projects p on p.id = s.project_id
    left join public.clients c on c.id = p.client_id
    cross join lateral (
      select g::date as day, row_number() over (order by g) as n
        from generate_series(s.starts, s.ends, interval '1 day') g
       where s.manual or public.is_working_day(g::date)
    ) d

  union all

  select 'material', m.id, null, m.name, m.notes, m.expected_on,
         case when m.received then 'Recibido' else 'Pendiente' end,
         m.project_id, p.code, c.name, '{}'::uuid[], false
    from public.materials m
    join public.projects p on p.id = m.project_id
    left join public.clients c on c.id = p.client_id
   where m.archived_at is null and m.expected_on is not null

  union all

  select f.type::text, f.id, f.code,
         coalesce(nullif(trim(f.title), ''), left(coalesce(f.description, ''), 60)),
         f.address, f.scheduled_date, public.label_es(f.status),
         null, null, c.name,
         case when f.assigned_to is null then '{}'::uuid[] else array[f.assigned_to] end,
         false
    from public.fichas f
    left join public.clients c on c.id = f.client_id
   where f.archived_at is null
     and f.scheduled_date is not null
     and f.type in ('visita', 'aviso')

  union all

  select 'otro', n.id, null, n.title, n.detail, n.day, 'Evento',
         n.project_id, p.code, c.name, '{}'::uuid[], true
    from public.calendar_notes n
    left join public.projects p on p.id = n.project_id
    left join public.clients c on c.id = p.client_id

  union all

  -- LA OBRA: de la primera fecha planificada de sus proyectos a la
  -- última. No se puede arrastrar: lo que se mueve son los proyectos.
  select 'obra', w.id, w.code, w.name,
         s.proyectos || ' proyecto(s)',
         g::date,
         'Obra',
         null, w.code,
         c.name,
         '{}'::uuid[],
         false
    from public.works w
    left join public.clients c on c.id = w.client_id
    join public.work_summary s on s.work_id = w.id
    cross join lateral generate_series(s.desde, s.hasta, interval '1 day') g
   where w.archived_at is null
     and s.desde is not null and s.hasta is not null
     and public.is_working_day(g::date);


-- ---------------------------------------------------------------------
-- 11) PERMISOS
--
-- Obras y extras son de administración y punto. Un trabajador no lee ni
-- la obra, ni sus extras, ni sus cuentas: la vista «work_summary» se
-- ejecuta con los permisos de quien pregunta y lee «projects», que ya es
-- de administración desde el BLOQUE 1.
-- ---------------------------------------------------------------------
grant select, insert, update on public.works, public.work_extras to authenticated;
grant all on public.works, public.work_extras to service_role;
grant select on public.work_summary to authenticated, service_role;

alter table public.works       enable row level security;
alter table public.work_extras enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public' and tablename in ('works', 'work_extras') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy works_select on public.works for select to authenticated
  using (public.is_admin());
create policy works_write on public.works for insert to authenticated
  with check (public.is_admin());
create policy works_update on public.works for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy extras_select on public.work_extras for select to authenticated
  using (public.is_admin());
create policy extras_write on public.work_extras for insert to authenticated
  with check (public.is_admin());
create policy extras_update on public.work_extras for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke delete, truncate on public.works, public.work_extras from authenticated;
revoke all on public.works, public.work_extras, public.work_summary from anon;

-- Los comentarios de una obra: solo administración.
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (
    public.is_admin()
    or (ficha_id   is not null and public.worker_has_ficha(ficha_id))
    or (project_id is not null and public.worker_can_see_project(project_id))
    or (order_id   is not null and public.worker_has_order(order_id))
    or (report_id  is not null and public.owns_report(report_id))
  );

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and (public.is_admin()
      or (ficha_id   is not null and public.worker_has_ficha(ficha_id))
      or (project_id is not null and public.worker_can_see_project(project_id))
      or (order_id   is not null and public.worker_has_order(order_id))
      or (report_id  is not null and public.owns_report(report_id)))
  );

grant execute on function
  public.save_work(uuid, text, uuid, text, text, text),
  public.set_project_work(uuid, uuid),
  public.archive_work(uuid, boolean),
  public.delete_work(uuid),
  public.save_work_extra(uuid, uuid, text, numeric, text),
  public.delete_work_extra(uuid),
  public.set_project_invoiced(uuid, boolean, numeric, date)
  to authenticated;

revoke execute on function
  public.save_work(uuid, text, uuid, text, text, text),
  public.set_project_work(uuid, uuid),
  public.archive_work(uuid, boolean),
  public.delete_work(uuid),
  public.save_work_extra(uuid, uuid, text, numeric, text),
  public.delete_work_extra(uuid),
  public.set_project_invoiced(uuid, boolean, numeric, date)
  from anon, public;


-- ---------------------------------------------------------------------
-- 12) HISTORIAL DE LA OBRA
-- ---------------------------------------------------------------------
create or replace function public.trg_audit_works() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text := public.actor_name(); v_row jsonb;
begin
  if coalesce(current_setting('app.skip_audit', true), '') = 'on'
     or coalesce(current_setting('app.restoring', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  v_row := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), v_name, lower(TG_OP), 'works',
          public.try_uuid(v_row ->> 'id'), v_row ->> 'code',
          v_name || case TG_OP
            when 'INSERT' then ' creó la obra '
            when 'DELETE' then ' eliminó la obra '
            else case when TG_OP = 'UPDATE' and new.archived_at is distinct from old.archived_at
                      then case when new.archived_at is not null
                                then ' archivó la obra ' else ' recuperó la obra ' end
                      else ' modificó la obra ' end
          end || (v_row ->> 'code') || ' · ' || (v_row ->> 'name'),
          '{}'::jsonb, coalesce((v_row ->> 'is_demo')::boolean, false));

  return coalesce(new, old);
end $$;

drop trigger if exists zz_audit on public.works;
create trigger zz_audit after insert or update or delete on public.works
  for each row execute function public.trg_audit_works();


-- ---------------------------------------------------------------------
-- 13) «LIMPIAR DATOS DEMO» TIENE QUE CONOCER LAS TABLAS NUEVAS
--
-- Desde el BLOQUE 1 se han ido añadiendo tablas con marca de ejemplo
-- (`is_demo`) que la limpieza no recorría: los trabajadores asignados,
-- los partes, los festivos, los eventos del calendario y, ahora, las
-- obras y sus extras. Si alguna llevara datos de ejemplo, se quedarían
-- dentro para siempre.
--
-- Se rehace la función con la lista completa. El cuerpo es EL MISMO que
-- en `25_correccion_limpiar_demo.sql`: lo único que cambia es la lista
-- de tablas. Sigue borrando solo lo marcado como ejemplo y nada más.
--
-- El orden va de la tabla más dependiente a la menos, para no dejar
-- referencias colgando. `work_extras` antes que `works`; `work_reports`
-- después de los comentarios y documentos, que apuntan a ellos.
-- ---------------------------------------------------------------------
create or replace function public.clear_demo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t text; v_n int; v_borradas jsonb := '{}'::jsonb; v_total int := 0;
  v_users uuid[];
begin
  perform public.assert_admin();

  -- El historial de cada borrado sería ruido: se deja una sola anotación.
  perform set_config('app.skip_audit', 'on', true);
  -- Y se abre la puerta estrecha para poder retirar las anotaciones que
  -- son del propio ejemplo. Dura solo esta operación.
  perform set_config('app.demo_cleanup', 'on', true);

  foreach t in array array[
    'comments', 'documents', 'payments', 'material_requests', 'materials',
    'work_reports', 'project_workers',
    'work_order_workers', 'work_orders', 'project_substatuses',
    'calendar_notes', 'work_extras', 'projects', 'works',
    'fichas', 'client_contacts', 'clients',
    'non_working_days', 'notifications', 'audit_log'
  ] loop
    execute format('delete from public.%I where is_demo', t);
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_borradas := v_borradas || jsonb_build_object(t, v_n);
      v_total := v_total + v_n;
    end if;
  end loop;

  -- Los trabajadores de ejemplo, al final: ya no les queda trabajo atado.
  select array_agg(id) into v_users from public.profiles where is_demo;
  if v_users is not null then
    delete from auth.users where id = any(v_users);
    -- Si la instalación no borra el perfil en cascada, se quita a mano.
    delete from public.profiles where id = any(v_users);
    v_borradas := v_borradas || jsonb_build_object('profiles', array_length(v_users, 1));
    v_total := v_total + array_length(v_users, 1);
  end if;

  perform set_config('app.demo_cleanup', 'off', true);
  perform set_config('app.skip_audit', 'off', true);

  perform public.log_event('limpiar_demo', 'app_settings',
    public.actor_name() || ' limpió los datos de ejemplo (' || v_total || ' registros)',
    jsonb_build_object('borradas', v_borradas, 'total', v_total));

  return jsonb_build_object('borradas', v_borradas, 'total', v_total);
end $$;

revoke all on function public.clear_demo() from public, anon;
grant execute on function public.clear_demo() to authenticated;
