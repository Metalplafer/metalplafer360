-- =====================================================================
-- METALPLAFER360 · EL CALENDARIO: TRAMOS ENTEROS Y ARRASTRE QUE NO
-- ENCOGE
--
-- N3 · Dos cosas, las dos de la base de datos:
--
--   1) ARRASTRAR UN PROYECTO LE CAMBIABA LA DURACIÓN. Es un fallo de
--      verdad y está localizado.
--   2) El calendario necesita los TRAMOS, no un día por fila.
--
-- MIGRACIÓN ESTRUCTURAL: una función nueva, otra corregida y una vista
-- nueva. No toca ninguna tabla y no modifica ni un dato: ningún proyecto
-- cambia de fechas al aplicarla.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- =====================================================================
-- 1) ARRASTRAR CONSERVA LA DURACIÓN
--
--
-- QUÉ PASABA, EXACTAMENTE
--
-- «move_project_phase» no movía el tramo: lo volvía a calcular desde
-- cero con las horas presupuestadas.
--
--     v_dias := greatest(plan_days(budget_hours_mont, mont_workers), 1);
--     v_end  := working_span_end(p_start, v_dias);
--
-- Y «plan_days» es horas ÷ gente ÷ 8. Así que un montaje de 16 horas con
-- una persona son DOS días, haga lo que haga la fecha de final que
-- hubiera puesta a mano. Un tramo de seis días, de lunes a sábado, al
-- arrastrarlo se quedaba en dos. Eso es lo que se ve como «se encoge».
--
-- Las horas NO son la duración: son el trabajo que hay dentro. Seis días
-- de montaje con 16 horas es una obra con desplazamientos, esperas o
-- jornadas cortas, y esa decisión la toma quien planifica, no una
-- división.
--
--
-- LA REGLA NUEVA, DICHA SIN RODEOS
--
-- El tramo conserva su LONGITUD EN DÍAS DE CALENDARIO:
--
--     final nuevo = inicio nuevo + (final viejo − inicio viejo)
--
-- Un tramo de lunes a sábado son seis días. Soltado en miércoles, va de
-- miércoles al lunes siguiente: seis días. Fines de semana incluidos,
-- porque el tramo de lunes a sábado YA los incluía.
--
-- Se dice en días de calendario y no en días laborables a propósito. Si
-- se contaran laborables, ese mismo tramo (que incluye un sábado) se
-- estiraría o se encogería al cruzar un fin de semana, y quien lo puso
-- de lunes a sábado vería cambiar el final sin haberlo tocado.
--
-- Lo que NO cambia:
--   · las horas presupuestadas ni las registradas, que no se tocan;
--   · la otra fase, que se queda donde está;
--   · que mover a mano fija la fase («manual»), como hasta ahora;
--   · ni el cálculo automático de una fase que todavía NO tiene fechas:
--     esa sigue estimándose con las horas, que es lo único que hay.
-- =====================================================================

create or replace function public.moved_span_end(
  p_old_start date, p_old_end date, p_new_start date,
  p_hours numeric, p_workers int) returns date
language sql immutable as $$
  select case
    -- Lo normal: el tramo ya tenía principio y final, así que conserva
    -- su longitud. Esta es la corrección.
    when p_old_start is not null and p_old_end is not null and p_old_end >= p_old_start
      then p_new_start + (p_old_end - p_old_start)
    -- Una fase que todavía no estaba puesta en el calendario no tiene
    -- longitud que conservar: ahí sí se estima con las horas, que es lo
    -- que se hacía antes y lo único de lo que se dispone.
    else public.working_span_end(p_new_start, greatest(public.plan_days(p_hours, p_workers), 1))
  end;
$$;

comment on function public.moved_span_end(date, date, date, numeric, int) is
  'El final de un tramo movido: conserva su longitud en días. Solo estima con las horas si la fase no tenía fechas.';


-- ---------------------------------------------------------------------
-- La función de mover, generada a partir de la del archivo 30 cambiando
-- SOLO el cálculo del final. El resto —permisos, comprobaciones, qué
-- fase se mueve, la marca de «a mano» y la línea del historial— queda
-- letra por letra como estaba.
-- ---------------------------------------------------------------------
create or replace function public.move_project_phase(
  p_project uuid, p_phase text, p_start date)
returns public.projects language plpgsql security definer set search_path = public as $$
declare
  p public.projects;
  v_end date; v_antes date;
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
    v_end   := public.moved_span_end(p.fab_start, p.fab_end, p_start,
                                     p.budget_hours_fab, p.fab_workers);
    update public.projects
       set fab_start = p_start, fab_end = v_end, fab_manual = true, updated_at = now()
     where id = p_project;
  else
    v_antes := p.mont_start;
    v_end   := public.moved_span_end(p.mont_start, p.mont_end, p_start,
                                     p.budget_hours_mont, p.mont_workers);
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


-- =====================================================================
-- 2) EL CALENDARIO, POR TRAMOS
--
-- «v_calendar» devuelve UNA FILA POR DÍA: un tramo de seis días son seis
-- filas. Por eso la pantalla pinta seis pastillas sueltas con el mismo
-- nombre en vez de una barra que cruza la semana.
--
-- Esta vista devuelve lo mismo, pero con «starts» y «ends»: una fila por
-- tramo. Lo que hay detrás es exactamente lo mismo y con los mismos
-- permisos —«planned_spans», «worker_fichas», «worker_projects» y
-- «works»—, así que lo que ve cada persona no cambia.
--
-- «v_calendar» SE QUEDA como está, y a propósito: lo que haya que mirar
-- día a día se sigue mirando ahí, y sus pruebas siguen valiendo. Esta es
-- otra manera de leer lo mismo, no un sustituto.
--
-- Las fechas sueltas (una visita, un aviso, material, una nota) son
-- tramos de un día: «starts» y «ends» valen lo mismo. Así la pantalla
-- trata todo igual y no necesita dos caminos.
-- =====================================================================
create or replace view public.v_calendar_spans with (security_invoker = true) as
  select s.phase                              as kind,
         s.project_id                         as id,
         s.code,
         s.name                               as title,
         null::text                           as detail,
         s.starts,
         s.ends,
         case when s.manual then 'Colocado a mano' else 'Planificado' end as status,
         s.project_id,
         s.code                               as project_code,
         s.client_name,
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

  union all

  select 'material', m.id, null, m.name, m.notes, m.expected_on, m.expected_on,
         case when m.received then 'Recibido' else 'Pendiente' end,
         m.project_id, wp.code, wp.client_name, '{}'::uuid[], false
    from public.materials m
    left join public.worker_projects wp on wp.id = m.project_id
   where m.archived_at is null and m.expected_on is not null
     and (wp.id is not null
          or (m.project_id is null and public.is_admin()))

  union all

  select f.type::text, f.id, f.code,
         coalesce(nullif(trim(f.title), ''), left(coalesce(f.description, ''), 60)),
         f.address, f.scheduled_date, f.scheduled_date, public.label_es(f.status),
         null, null, f.client_name,
         case when f.assigned_to is null then '{}'::uuid[] else array[f.assigned_to] end,
         false
    from public.worker_fichas f
   where f.archived_at is null
     and f.scheduled_date is not null
     and f.type in ('visita', 'aviso')

  union all

  select 'otro', n.id, null, n.title, n.detail, n.day, n.day, 'Evento',
         n.project_id, wp.code, wp.client_name, '{}'::uuid[], true
    from public.calendar_notes n
    left join public.worker_projects wp on wp.id = n.project_id

  union all

  -- La obra va de la primera fecha planificada de sus proyectos a la
  -- última, igual que en «v_calendar». No se arrastra: lo que se mueve
  -- son los proyectos.
  select 'obra', w.id, w.code, w.name,
         s.proyectos || ' proyecto(s)',
         s.desde, s.hasta,
         'Obra',
         null, w.code,
         c.name,
         '{}'::uuid[],
         false
    from public.works w
    left join public.clients c on c.id = w.client_id
    join public.work_summary s on s.work_id = w.id
   where w.archived_at is null
     and s.desde is not null and s.hasta is not null;

comment on view public.v_calendar_spans is
  'Lo mismo que «v_calendar», pero una fila por TRAMO (con «starts» y «ends») en lugar de una por día. Mismos permisos.';

grant  select on public.v_calendar_spans to authenticated, service_role;
revoke all    on public.v_calendar_spans from anon;
