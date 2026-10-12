-- =====================================================================
-- METALPLAFER360 · 30 · CALENDARIO Y PLANIFICACIÓN AUTOMÁTICA
--
-- DE DÓNDE VENIMOS
-- Hasta ahora el calendario pintaba ÓRDENES DE TRABAJO, y una orden
-- tiene una fecha suelta, sin duración. Con eso no se puede planificar:
-- no hay forma de decir «esta fabricación ocupa del 21 al 22».
--
-- A DÓNDE VAMOS
-- La planificación pasa a vivir en el PROYECTO: cuándo empieza y cuándo
-- acaba su fabricación, y cuándo su montaje. La duración se calcula a
-- partir de las horas previstas y de cuánta gente va.
--
--     días = techo( horas previstas / trabajadores / 8 )
--
-- Las horas previstas son del EQUIPO, no de una persona:
--     32 h de fabricación con 2 personas → 32/2 = 16 h cada una
--                                        → 16/8 = 2 días.
--
-- LA REGLA QUE MANDA
-- Lo automático NUNCA solapa. Administración SÍ puede solapar a mano, y
-- lo que decide a mano NO se lo deshace después ningún cálculo.
--
-- Ejecutar después del archivo 29.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LA PLANIFICACIÓN, EN EL PROYECTO
-- ---------------------------------------------------------------------
alter table public.projects
  add column if not exists fab_start   date,
  add column if not exists fab_end     date,
  add column if not exists mont_start  date,
  add column if not exists mont_end    date,
  add column if not exists fab_workers  smallint not null default 2,
  add column if not exists mont_workers smallint not null default 2,
  -- «Lo puso una persona a mano»: lo automático no lo toca jamás.
  add column if not exists fab_manual  boolean not null default false,
  add column if not exists mont_manual boolean not null default false;

alter table public.projects drop constraint if exists projects_fab_workers_check;
alter table public.projects add constraint projects_fab_workers_check
  check (fab_workers between 1 and 20);
alter table public.projects drop constraint if exists projects_mont_workers_check;
alter table public.projects add constraint projects_mont_workers_check
  check (mont_workers between 1 and 20);

-- Un tramo o está entero o no está, y no acaba antes de empezar.
alter table public.projects drop constraint if exists projects_fab_span;
alter table public.projects add constraint projects_fab_span
  check (num_nonnulls(fab_start, fab_end) <> 1 and (fab_end is null or fab_end >= fab_start));
alter table public.projects drop constraint if exists projects_mont_span;
alter table public.projects add constraint projects_mont_span
  check (num_nonnulls(mont_start, mont_end) <> 1 and (mont_end is null or mont_end >= mont_start));

comment on column public.projects.fab_workers is
  'Cuánta gente va a fabricar. Por defecto 2 (la pareja). Cambia la duración.';
comment on column public.projects.fab_manual is
  'Lo colocó una persona a mano. La planificación automática no lo mueve.';

create index if not exists projects_fab_span_idx  on public.projects (fab_start, fab_end);
create index if not exists projects_mont_span_idx on public.projects (mont_start, mont_end);


-- ---------------------------------------------------------------------
-- 2) DÍAS NO LABORABLES
--
-- Festivos nacionales, locales, o cualquier día que el taller no abra.
-- Sábados y domingos NO se guardan aquí: se saben solos.
-- ---------------------------------------------------------------------
create table if not exists public.non_working_days (
  day        date primary key,
  reason     text not null default '' check (length(reason) <= 120),
  created_by uuid references public.profiles(id) on delete set null,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.non_working_days is
  'Días en los que no se trabaja. Los respeta la planificación automática.';

create index if not exists non_working_created_by_idx on public.non_working_days (created_by);


-- ---------------------------------------------------------------------
-- 3) «OTROS»: notas y eventos sueltos del calendario
--
-- Lo que no es ni proyecto, ni material, ni visita, ni aviso: una
-- entrega, una reunión, una revisión de la máquina. Nada complicado.
-- ---------------------------------------------------------------------
create table if not exists public.calendar_notes (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  title      text not null check (length(trim(title)) between 1 and 120),
  detail     text check (length(coalesce(detail, '')) <= 500),
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.calendar_notes is
  'Eventos sueltos del calendario («Otros»). Los crea administración.';

create index if not exists calendar_notes_day_idx        on public.calendar_notes (day);
create index if not exists calendar_notes_project_idx    on public.calendar_notes (project_id);
create index if not exists calendar_notes_created_by_idx on public.calendar_notes (created_by);


-- ---------------------------------------------------------------------
-- 4) EL MARGEN ENTRE PROYECTOS (gap)
--
-- Cuántos días laborables se dejan entre un proyecto y el siguiente.
--
-- El valor son los DÍAS LABORABLES LIBRES que se dejan en medio:
--
--   0    → el siguiente empieza el día laborable siguiente (0 libres)
--   0,5  → igual que 0 (ver abajo)
--   1    → se deja 1 día laborable libre  (acaba lunes → empieza miércoles)
--   2    → se dejan 2 días laborables libres
--
-- SOBRE EL 0,5: la planificación va por días completos, así que medio
-- día libre no existe, y se redondea hacia abajo. Y «empezar el mismo
-- día que acaba el anterior» tampoco vale como interpretación: eso sería
-- un solape, y lo automático no solapa nunca. Si hace falta de verdad
-- trabajar con medias jornadas, hay que planificar por horas, que es
-- otra cosa.
-- ---------------------------------------------------------------------
alter table public.app_settings
  add column if not exists gap_days numeric(3,1) not null default 1;

alter table public.app_settings drop constraint if exists app_settings_gap_check;
alter table public.app_settings add constraint app_settings_gap_check
  check (gap_days >= 0 and gap_days <= 30);

comment on column public.app_settings.gap_days is
  'Días laborables de separación entre proyectos en la planificación automática.';


-- ---------------------------------------------------------------------
-- 5) DÍAS LABORABLES
-- ---------------------------------------------------------------------

/** ¿Se trabaja este día? Lunes a viernes y que no sea festivo. */
create or replace function public.is_working_day(p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from p_day) < 6
     and not exists (select 1 from public.non_working_days where day = p_day);
$$;

/** El primer día laborable a partir de este (incluido). */
create or replace function public.next_working_day(p_day date) returns date
language plpgsql stable security definer set search_path = public as $$
declare d date := p_day; n int := 0;
begin
  while not public.is_working_day(d) loop
    d := d + 1; n := n + 1;
    -- Red de seguridad: si alguien marcara un año entero como festivo.
    if n > 400 then
      raise exception 'No se encuentra ningún día laborable a partir del %',
        to_char(p_day, 'DD/MM/YYYY') using errcode = '22023';
    end if;
  end loop;
  return d;
end $$;

/**
 * Avanzar N días LABORABLES desde uno dado.
 *   add_working_days(viernes, 1) = lunes
 *   add_working_days(d, 0)       = d (si d es laborable)
 */
create or replace function public.add_working_days(p_day date, p_n int) returns date
language plpgsql stable security definer set search_path = public as $$
declare d date := public.next_working_day(p_day); i int := 0;
begin
  while i < p_n loop
    d := public.next_working_day(d + 1);
    i := i + 1;
  end loop;
  return d;
end $$;

/** El último día de un tramo que empieza en «p_start» y dura «p_days». */
create or replace function public.working_span_end(p_start date, p_days int) returns date
language sql stable security definer set search_path = public as $$
  select public.add_working_days(p_start, greatest(p_days, 1) - 1);
$$;

/**
 * DURACIÓN EN DÍAS a partir de las horas previstas del equipo.
 *   techo( horas / trabajadores / 8 )
 * 32 h con 2 personas → 2 días. 32 h con 1 persona → 4 días.
 */
create or replace function public.plan_days(p_hours numeric, p_workers int) returns int
language sql immutable as $$
  select case
    when coalesce(p_hours, 0) <= 0 then 0
    else greatest(1, ceil(p_hours / greatest(coalesce(p_workers, 2), 1) / 8.0)::int)
  end;
$$;

/**
 * Los días laborables LIBRES que se dejan entre un proyecto y el
 * siguiente. Se redondea hacia abajo: con días enteros, medio día libre
 * no se puede dejar.
 */
create or replace function public.gap_free_days() returns int
language sql stable security definer set search_path = public as $$
  select greatest(
    floor(coalesce((select gap_days from public.app_settings where id = 1), 1))::int, 0);
$$;


-- ---------------------------------------------------------------------
-- 6) LOS TRAMOS YA OCUPADOS
--
-- Fabricación y montaje son dos recursos distintos: la pareja del taller
-- y la pareja que sale a montar. Cada uno tiene su propia agenda.
--
-- Cuenta TODO lo que está colocado, lo haya puesto el cálculo o una
-- persona: lo automático tiene que esquivarlo igual.
-- ---------------------------------------------------------------------
create or replace view public.planned_spans with (security_invoker = true) as
  select p.id as project_id, p.code, p.name, 'fabricacion'::text as phase,
         p.fab_start as starts, p.fab_end as ends, p.fab_manual as manual
    from public.projects p
   where p.archived_at is null and p.fab_start is not null
  union all
  select p.id, p.code, p.name, 'montaje', p.mont_start, p.mont_end, p.mont_manual
    from public.projects p
   where p.archived_at is null and p.mont_start is not null;


/**
 * EL PRIMER HUECO LIBRE para un trabajo de «p_days» días laborables.
 *
 * Se empieza a mirar en «p_from» y se avanza: si el tramo chocaría con
 * algo ya colocado, se salta al final de eso más el margen, y se vuelve
 * a mirar. Se para en cuanto cabe.
 */
create or replace function public.find_free_slot(
  p_phase text, p_days int, p_from date, p_skip_project uuid default null)
returns date language plpgsql stable security definer set search_path = public as $$
declare
  v_start date := public.next_working_day(p_from);
  v_end   date;
  v_choque record;
  v_vueltas int := 0;
begin
  if p_days <= 0 then return v_start; end if;

  loop
    v_end := public.working_span_end(v_start, p_days);

    -- ¿Pisa algo que ya está colocado en esta misma agenda?
    select * into v_choque
      from public.planned_spans s
     where s.phase = p_phase
       and (p_skip_project is null or s.project_id <> p_skip_project)
       and s.starts <= v_end
       and s.ends   >= v_start
     order by s.ends desc
     limit 1;

    exit when not found;

    -- Choca: se vuelve a intentar después de eso, dejando el margen.
    v_start := public.add_working_days(v_choque.ends + 1, public.gap_free_days());

    v_vueltas := v_vueltas + 1;
    if v_vueltas > 500 then
      raise exception 'No se encuentra hueco en el calendario de %', p_phase using errcode = '22023';
    end if;
  end loop;

  return v_start;
end $$;


-- ---------------------------------------------------------------------
-- 7) PLANIFICAR UN PROYECTO
--
-- Lo que una persona haya colocado a mano NO se toca. Nunca.
-- ---------------------------------------------------------------------
create or replace function public.plan_project(
  p_project uuid, p_phase text default 'ambas', p_from date default null)
returns public.projects language plpgsql security definer set search_path = public as $$
declare
  p public.projects;
  v_dias int; v_start date; v_end date;
  v_desde date;
  v_cambios text[] := '{}';
begin
  perform public.assert_admin();

  select * into p from public.projects where id = p_project for update;
  if not found then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;
  if p.archived_at is not null then
    raise exception 'El proyecto está archivado' using errcode = '22023';
  end if;

  -- ---------------- FABRICACIÓN ----------------
  if p_phase in ('fabricacion', 'ambas') then
    if p.fab_manual then
      -- Lo colocó una persona: se respeta y punto.
      null;
    else
      v_dias := public.plan_days(p.budget_hours_fab, p.fab_workers);
      if v_dias > 0 then
        v_desde := coalesce(p_from, greatest(public.today_madrid(), coalesce(p.fab_start, public.today_madrid())));
        if p_from is not null then v_desde := p_from; else v_desde := public.today_madrid(); end if;
        v_start := public.find_free_slot('fabricacion', v_dias, v_desde, p.id);
        v_end   := public.working_span_end(v_start, v_dias);
        update public.projects
           set fab_start = v_start, fab_end = v_end, updated_at = now()
         where id = p_project;
        p.fab_start := v_start; p.fab_end := v_end;
        v_cambios := v_cambios || ('fabricación ' || to_char(v_start, 'DD/MM/YYYY') ||
                                   ' → ' || to_char(v_end, 'DD/MM/YYYY'));
      end if;
    end if;
  end if;

  -- ---------------- MONTAJE ----------------
  -- Va SIEMPRE después de la fabricación, con el mismo margen.
  if p_phase in ('montaje', 'ambas') and not p.no_assembly then
    if p.mont_manual then
      null;
    else
      v_dias := public.plan_days(p.budget_hours_mont, p.mont_workers);
      if v_dias > 0 then
        v_desde := case
          when p.fab_end is not null
            then public.add_working_days(p.fab_end + 1, public.gap_free_days())
          else coalesce(p_from, public.today_madrid()) end;
        v_start := public.find_free_slot('montaje', v_dias, v_desde, p.id);
        v_end   := public.working_span_end(v_start, v_dias);
        update public.projects
           set mont_start = v_start, mont_end = v_end, updated_at = now()
         where id = p_project;
        p.mont_start := v_start; p.mont_end := v_end;
        v_cambios := v_cambios || ('montaje ' || to_char(v_start, 'DD/MM/YYYY') ||
                                   ' → ' || to_char(v_end, 'DD/MM/YYYY'));
      end if;
    end if;
  end if;

  if array_length(v_cambios, 1) > 0 then
    insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                  entity_code, summary, details, is_demo)
    values (auth.uid(), public.actor_name(), 'planificar', 'projects', p.id, p.code,
            public.actor_name() || ' planificó ' || p.code || ': ' ||
            array_to_string(v_cambios, ' · '),
            jsonb_build_object('fase', p_phase, 'cambios', v_cambios,
                               'margen_dias', (select gap_days from public.app_settings where id = 1)),
            p.is_demo);
  end if;

  select * into p from public.projects where id = p_project;
  return p;
end $$;


/**
 * MOVER A MANO una fase desde el calendario.
 *
 * Esto es lo que hace administración arrastrando. Vale todo: fines de
 * semana, festivos, solaparse con otro proyecto. Es a propósito.
 *
 * Al moverlo queda marcado como «a mano», y desde ese momento ningún
 * cálculo automático se lo vuelve a tocar.
 */
create or replace function public.move_project_phase(
  p_project uuid, p_phase text, p_start date)
returns public.projects language plpgsql security definer set search_path = public as $$
declare
  p public.projects;
  v_dias int; v_end date; v_antes date;
begin
  perform public.assert_admin();

  if p_phase not in ('fabricacion', 'montaje') then
    raise exception 'Fase desconocida: %', p_phase using errcode = '22023';
  end if;
  if p_start is null then
    raise exception 'Hace falta una fecha' using errcode = '22023';
  end if;

  select * into p from public.projects where id = p_project for update;
  if not found then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;

  if p_phase = 'fabricacion' then
    v_antes := p.fab_start;
    v_dias  := greatest(public.plan_days(p.budget_hours_fab, p.fab_workers), 1);
    v_end   := public.working_span_end(p_start, v_dias);
    update public.projects
       set fab_start = p_start, fab_end = v_end, fab_manual = true, updated_at = now()
     where id = p_project;
  else
    v_antes := p.mont_start;
    v_dias  := greatest(public.plan_days(p.budget_hours_mont, p.mont_workers), 1);
    v_end   := public.working_span_end(p_start, v_dias);
    update public.projects
       set mont_start = p_start, mont_end = v_end, mont_manual = true, updated_at = now()
     where id = p_project;
  end if;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'mover_fecha', 'projects', p.id, p.code,
          public.actor_name() || ' movió a mano ' ||
          case p_phase when 'fabricacion' then 'la fabricación' else 'el montaje' end ||
          ' de ' || p.code || ': ' ||
          coalesce(to_char(v_antes, 'DD/MM/YYYY'), 'sin fecha') || ' → ' ||
          to_char(p_start, 'DD/MM/YYYY') ||
          case when v_end > p_start then ' (hasta el ' || to_char(v_end, 'DD/MM/YYYY') || ')' else '' end,
          jsonb_build_object('fase', p_phase, 'antes', v_antes, 'despues', p_start,
                             'hasta', v_end, 'a_mano', true),
          p.is_demo);

  select * into p from public.projects where id = p_project;
  return p;
end $$;


/** Devolver una fase al cálculo automático. */
create or replace function public.release_project_phase(p_project uuid, p_phase text)
returns public.projects language plpgsql security definer set search_path = public as $$
declare p public.projects;
begin
  perform public.assert_admin();

  if p_phase = 'fabricacion' then
    update public.projects set fab_manual = false, updated_at = now() where id = p_project;
  elsif p_phase = 'montaje' then
    update public.projects set mont_manual = false, updated_at = now() where id = p_project;
  else
    raise exception 'Fase desconocida: %', p_phase using errcode = '22023';
  end if;

  select * into p from public.projects where id = p_project;
  if not found then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;
  return public.plan_project(p_project, p_phase);
end $$;


/** Cuánta gente va en cada fase. Cambiarlo cambia la duración. */
create or replace function public.set_phase_workers(p_project uuid, p_phase text, p_workers int)
returns public.projects language plpgsql security definer set search_path = public as $$
declare p public.projects; v_dias int;
begin
  perform public.assert_admin();

  if p_workers is null or p_workers < 1 or p_workers > 20 then
    raise exception 'El número de trabajadores tiene que estar entre 1 y 20' using errcode = '22023';
  end if;

  select * into p from public.projects where id = p_project for update;
  if not found then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;

  if p_phase = 'fabricacion' then
    update public.projects set fab_workers = p_workers, updated_at = now() where id = p_project;
    -- Si ya estaba colocado, se reajusta el final sin moverle el inicio.
    if p.fab_start is not null then
      v_dias := greatest(public.plan_days(p.budget_hours_fab, p_workers), 1);
      update public.projects
         set fab_end = public.working_span_end(p.fab_start, v_dias) where id = p_project;
    end if;
  elsif p_phase = 'montaje' then
    update public.projects set mont_workers = p_workers, updated_at = now() where id = p_project;
    if p.mont_start is not null then
      v_dias := greatest(public.plan_days(p.budget_hours_mont, p_workers), 1);
      update public.projects
         set mont_end = public.working_span_end(p.mont_start, v_dias) where id = p_project;
    end if;
  else
    raise exception 'Fase desconocida: %', p_phase using errcode = '22023';
  end if;

  select * into p from public.projects where id = p_project;
  return p;
end $$;


-- ---------------------------------------------------------------------
-- 8) DÍAS NO LABORABLES · alta y baja
-- ---------------------------------------------------------------------
create or replace function public.set_non_working_day(p_day date, p_reason text default '')
returns public.non_working_days language plpgsql security definer set search_path = public as $$
declare d public.non_working_days;
begin
  perform public.assert_admin();
  if p_day is null then
    raise exception 'Hace falta una fecha' using errcode = '22023';
  end if;

  insert into public.non_working_days (day, reason, created_by)
  values (p_day, coalesce(trim(p_reason), ''), auth.uid())
  on conflict (day) do update set reason = excluded.reason
  returning * into d;

  return d;
end $$;

create or replace function public.clear_non_working_day(p_day date)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  delete from public.non_working_days where day = p_day;
end $$;


-- ---------------------------------------------------------------------
-- 9) «OTROS» · crear, cambiar y quitar
-- ---------------------------------------------------------------------
create or replace function public.save_calendar_note(
  p_id uuid default null, p_day date default null, p_title text default null,
  p_detail text default null, p_project uuid default null)
returns public.calendar_notes language plpgsql security definer set search_path = public as $$
declare n public.calendar_notes; v_title text := nullif(trim(coalesce(p_title, '')), '');
begin
  perform public.assert_admin();

  if v_title is null then
    raise exception 'Escribe de qué se trata' using errcode = '22023';
  end if;
  if p_day is null then
    raise exception 'Hace falta una fecha' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.calendar_notes (day, title, detail, project_id, created_by)
    values (p_day, v_title, nullif(trim(coalesce(p_detail, '')), ''), p_project, auth.uid())
    returning * into n;
  else
    update public.calendar_notes
       set day = p_day, title = v_title,
           detail = nullif(trim(coalesce(p_detail, '')), ''),
           project_id = p_project, updated_at = now()
     where id = p_id
    returning * into n;
    if not found then
      raise exception 'No se encuentra el evento' using errcode = 'P0002';
    end if;
  end if;

  return n;
end $$;

create or replace function public.delete_calendar_note(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  delete from public.calendar_notes where id = p_id;
end $$;


-- ---------------------------------------------------------------------
-- 10) EL CALENDARIO
--
-- Se rehace para que «Fabricación» y «Montaje» salgan de la
-- planificación del proyecto, con su duración.
--
-- UN TRAMO SE DESPLIEGA EN UNA FILA POR DÍA. Así las cuatro vistas que
-- ya existen (día, semana, mes, agenda) siguen funcionando sin tocarlas,
-- y cada día sabe que es «el 1 de 2».
--
-- Los sábados, domingos y festivos de dentro de un tramo NO se pintan:
-- esos días no se trabaja. Si administración ha colocado el tramo a mano
-- en fin de semana, entonces sí, porque para eso lo ha hecho.
-- ---------------------------------------------------------------------
create or replace view public.v_calendar with (security_invoker = true) as
  -- FABRICACIÓN y MONTAJE: la planificación del proyecto, día a día.
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
         -- Quién trabaja en esto: los asignados al proyecto (BLOQUE 1) y,
         -- mientras las órdenes sigan existiendo, los de sus órdenes
         -- vivas. Si no, quien esté asignado solo por orden desaparecería
         -- del calendario y no podría filtrar por lo suyo.
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

  -- MATERIAL: igual que antes.
  select 'material', m.id, null, m.name, m.notes, m.expected_on,
         case when m.received then 'Recibido' else 'Pendiente' end,
         m.project_id, p.code, c.name, '{}'::uuid[], false
    from public.materials m
    join public.projects p on p.id = m.project_id
    left join public.clients c on c.id = p.client_id
   where m.archived_at is null and m.expected_on is not null

  union all

  -- VISITAS y AVISOS: igual que antes.
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

  -- OTROS: lo que crea administración a mano desde el calendario.
  select 'otro', n.id, null, n.title, n.detail, n.day, 'Evento',
         n.project_id, p.code, c.name, '{}'::uuid[], true
    from public.calendar_notes n
    left join public.projects p on p.id = n.project_id
    left join public.clients c on c.id = p.client_id;


-- ---------------------------------------------------------------------
-- 11) PERMISOS
-- ---------------------------------------------------------------------
grant select on public.non_working_days, public.calendar_notes,
                public.planned_spans, public.v_calendar
  to authenticated, service_role;
grant all on public.non_working_days, public.calendar_notes to service_role;

alter table public.non_working_days enable row level security;
alter table public.calendar_notes   enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('non_working_days', 'calendar_notes') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Los festivos los ve todo el mundo (el trabajador también necesita
-- saber qué día no se trabaja); los cambia solo administración, y a
-- través de las funciones.
create policy non_working_select on public.non_working_days for select to authenticated
  using (true);
revoke insert, update, delete, truncate on public.non_working_days from authenticated;

create policy notes_select on public.calendar_notes for select to authenticated
  using (true);
revoke insert, update, delete, truncate on public.calendar_notes from authenticated;

revoke all on public.non_working_days, public.calendar_notes,
               public.planned_spans from anon;

grant execute on function
  public.is_working_day(date),
  public.next_working_day(date),
  public.add_working_days(date, int),
  public.working_span_end(date, int),
  public.plan_days(numeric, int),
  public.gap_free_days(),
  public.find_free_slot(text, int, date, uuid),
  public.plan_project(uuid, text, date),
  public.move_project_phase(uuid, text, date),
  public.release_project_phase(uuid, text),
  public.set_phase_workers(uuid, text, int),
  public.set_non_working_day(date, text),
  public.clear_non_working_day(date),
  public.save_calendar_note(uuid, date, text, text, uuid),
  public.delete_calendar_note(uuid)
  to authenticated;

revoke execute on function
  public.is_working_day(date),
  public.next_working_day(date),
  public.add_working_days(date, int),
  public.working_span_end(date, int),
  public.plan_days(numeric, int),
  public.gap_free_days(),
  public.find_free_slot(text, int, date, uuid),
  public.plan_project(uuid, text, date),
  public.move_project_phase(uuid, text, date),
  public.release_project_phase(uuid, text),
  public.set_phase_workers(uuid, text, int),
  public.set_non_working_day(date, text),
  public.clear_non_working_day(date),
  public.save_calendar_note(uuid, date, text, text, uuid),
  public.delete_calendar_note(uuid)
  from anon, public;


-- ---------------------------------------------------------------------
-- 12) AL PASAR UN PROYECTO A FABRICACIÓN, SE PLANIFICA SOLO
--
-- Se envuelve la función que ya existía en lugar de reescribirla: hace
-- lo mismo que antes y, además, busca hueco.
-- ---------------------------------------------------------------------
alter table public.projects add column if not exists autoplan boolean not null default true;
comment on column public.projects.autoplan is
  'Si está puesto, al pasar a fabricación el proyecto busca hueco solo.';

create or replace function public.trg_projects_autoplan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;
  if not new.autoplan then return new; end if;

  -- Solo al ENTRAR en fabricación, y solo si no estaba ya colocado.
  if new.phase = 'fabricacion' and old.phase is distinct from new.phase
     and new.fab_start is null and not new.fab_manual then
    perform public.plan_project(new.id, 'ambas');
  end if;

  return new;
end $$;

drop trigger if exists zzz_projects_autoplan on public.projects;
create trigger zzz_projects_autoplan after update of phase on public.projects
  for each row execute function public.trg_projects_autoplan();


-- ---------------------------------------------------------------------
-- 13) EL MARGEN, DESDE CONFIGURACIÓN
-- ---------------------------------------------------------------------
create or replace function public.set_gap_days(p_days numeric)
returns public.app_settings language plpgsql security definer set search_path = public as $$
declare s public.app_settings; v_antes numeric;
begin
  perform public.assert_admin();

  if p_days is null or p_days < 0 or p_days > 30 then
    raise exception 'El margen entre proyectos tiene que estar entre 0 y 30 días'
      using errcode = '22023';
  end if;

  select gap_days into v_antes from public.app_settings where id = 1;
  update public.app_settings set gap_days = p_days, updated_at = now()
   where id = 1 returning * into s;

  -- A propósito NO se replanifica nada: el margen nuevo vale de aquí en
  -- adelante. Mover por su cuenta lo que ya está colocado sería una
  -- sorpresa desagradable para quien tenga el taller organizado.
  perform public.log_event('margen_planificacion', 'app_settings',
    public.actor_name() || ' cambió el margen entre proyectos de ' ||
    trim(to_char(v_antes, 'FM999990.0')) || ' a ' || trim(to_char(p_days, 'FM999990.0')) ||
    ' días laborables',
    jsonb_build_object('antes', v_antes, 'despues', p_days));

  return s;
end $$;

grant execute on function public.set_gap_days(numeric) to authenticated;
revoke execute on function public.set_gap_days(numeric) from anon, public;
