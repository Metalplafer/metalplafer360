-- =====================================================================
-- METALPLAFER360 · FASE 1 · EDITAR LAS FECHAS A MANO
--
-- Dos cosas que las pruebas reales han dejado claras:
--
--   1) LAS FECHAS DEL PROYECTO. Hasta ahora la planificación solo se
--      podía cambiar arrastrando en el calendario o cambiando cuánta
--      gente va. Desde la ficha del proyecto se veían, pero no se
--      tocaban. Se añade «set_phase_dates», que pone el inicio y el
--      final de una fase tal como se los den.
--
--      A PROPÓSITO NO COMPRUEBA DISPONIBILIDAD: no mira si hay otro
--      proyecto esos días ni si se solapa con nada. Quien manda es quien
--      lo escribe. Lo único que se rechaza es un final anterior al
--      inicio, que no es una regla de taller sino una fecha imposible.
--
--   2) EL PERIODO DE LA OBRA. La obra no tenía fechas propias: su barra
--      del calendario salía de la primera y la última fecha de sus
--      proyectos («work_summary.desde» y «.hasta»). Por eso no había nada
--      que editar. Se le añaden dos fechas propias, OPCIONALES, que
--      manda sobre lo calculado cuando están puestas. Si se dejan en
--      blanco, la obra vuelve a seguir a sus proyectos, como hasta hoy.
--
-- Nada de esto desactiva ninguna política ni ningún RLS. Las dos
-- funciones son «security definer» y empiezan por «assert_admin», igual
-- que las que ya existen.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LAS FECHAS DE UNA FASE DEL PROYECTO, A MANO
--
-- Qué hace con lo que se le da:
--
--   · inicio y final    → los dos tal cual, y la fase queda fijada a mano;
--   · solo el inicio    → el final se calcula como siempre (horas ÷
--                         personas ÷ 8, saltando fines de semana y
--                         festivos), igual que al arrastrar;
--   · inicio en blanco  → la fase se queda SIN fecha y vuelve al cálculo
--                         automático, para que «Buscar hueco» la coloque.
--
-- «fijada a mano» es lo que ya significaba: ningún recálculo la vuelve a
-- tocar. Es la misma marca que usa «move_project_phase».
-- ---------------------------------------------------------------------
create or replace function public.set_phase_dates(
  p_project uuid, p_phase text, p_start date, p_end date default null)
returns public.projects language plpgsql security definer set search_path = public as $$
declare
  p public.projects;
  v_end date; v_dias int;
  v_antes_start date; v_antes_end date;
begin
  perform public.assert_admin();

  if p_phase not in ('fabricacion', 'montaje') then
    raise exception 'Fase desconocida: %', p_phase using errcode = '22023';
  end if;

  select * into p from public.projects where id = p_project for update;
  if not found then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;

  if p_phase = 'fabricacion' then
    v_antes_start := p.fab_start; v_antes_end := p.fab_end;
  else
    v_antes_start := p.mont_start; v_antes_end := p.mont_end;
  end if;

  -- Una fecha imposible sí se rechaza. No es una comprobación de
  -- disponibilidad: es que el final no puede ir antes del inicio.
  if p_start is not null and p_end is not null and p_end < p_start then
    raise exception 'El final no puede ser anterior al inicio' using errcode = '22023';
  end if;

  if p_start is null then
    -- Se quita la fecha y la fase vuelve al cálculo automático.
    if p_phase = 'fabricacion' then
      update public.projects
         set fab_start = null, fab_end = null, fab_manual = false, updated_at = now()
       where id = p_project;
    else
      update public.projects
         set mont_start = null, mont_end = null, mont_manual = false, updated_at = now()
       where id = p_project;
    end if;
  else
    -- Si no dan final, se calcula con la duración de siempre.
    if p_end is null then
      v_dias := greatest(public.plan_days(
        case when p_phase = 'fabricacion' then p.budget_hours_fab else p.budget_hours_mont end,
        case when p_phase = 'fabricacion' then p.fab_workers      else p.mont_workers      end), 1);
      v_end := public.working_span_end(p_start, v_dias);
    else
      v_end := p_end;
    end if;

    if p_phase = 'fabricacion' then
      update public.projects
         set fab_start = p_start, fab_end = v_end, fab_manual = true, updated_at = now()
       where id = p_project;
    else
      update public.projects
         set mont_start = p_start, mont_end = v_end, mont_manual = true, updated_at = now()
       where id = p_project;
    end if;
  end if;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'editar_fechas', 'projects', p.id, p.code,
          public.actor_name() || ' cambió a mano las fechas de ' ||
          case p_phase when 'fabricacion' then 'la fabricación' else 'el montaje' end ||
          ' de ' || p.code || ': ' ||
          coalesce(to_char(v_antes_start, 'DD/MM/YYYY'), 'sin fecha') ||
          case when v_antes_end is not null and v_antes_end <> v_antes_start
               then ' → ' || to_char(v_antes_end, 'DD/MM/YYYY') else '' end ||
          ' ⟶ ' ||
          coalesce(to_char(p_start, 'DD/MM/YYYY'), 'sin fecha') ||
          case when v_end is not null and v_end <> p_start
               then ' → ' || to_char(v_end, 'DD/MM/YYYY') else '' end,
          jsonb_build_object('fase', p_phase,
                             'antes_inicio', v_antes_start, 'antes_fin', v_antes_end,
                             'inicio', p_start, 'fin', v_end,
                             'a_mano', p_start is not null),
          p.is_demo);

  select * into p from public.projects where id = p_project;
  return p;
end $$;

comment on function public.set_phase_dates(uuid, text, date, date) is
  'Pone a mano el inicio y el final de una fase. NO comprueba disponibilidad ni solapamientos: manda quien lo escribe.';

grant execute on function public.set_phase_dates(uuid, text, date, date) to authenticated;
revoke execute on function public.set_phase_dates(uuid, text, date, date) from anon, public;


-- ---------------------------------------------------------------------
-- 2) EL PERIODO DE LA OBRA EN EL CALENDARIO
--
-- Dos fechas propias y OPCIONALES. Mientras estén en blanco, la obra se
-- comporta exactamente como hasta ahora: ocupa del primer día al último
-- de sus proyectos. En cuanto se escriben, mandan ellas.
-- ---------------------------------------------------------------------
alter table public.works add column if not exists cal_start date;
alter table public.works add column if not exists cal_end   date;

comment on column public.works.cal_start is
  'Inicio del periodo de la obra en el calendario. En blanco = lo marcan sus proyectos.';
comment on column public.works.cal_end is
  'Final del periodo de la obra en el calendario. En blanco = lo marcan sus proyectos.';


/**
 * «work_summary» con las fechas propias por delante.
 *
 * Se rehace la vista cambiando SOLO la expresión de «desde» y «hasta».
 * El nombre, el tipo y el orden de todas las columnas se quedan igual,
 * que es lo único que «create or replace view» permite cambiar sin
 * borrarla; y borrarla arrastraría a «v_calendar», que la usa.
 */
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
         -- Lo que la obra tenga escrito manda; si no, sus proyectos.
         coalesce(w.cal_start, p.desde)  as desde,
         coalesce(w.cal_end, p.hasta)    as hasta
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
  'Las cuentas y el periodo de cada obra. Solo las ve administración: lee «projects», que es suya. «desde» y «hasta» son las fechas propias de la obra si las tiene, y si no las de sus proyectos.';


/**
 * Poner o quitar el periodo de la obra.
 *
 * Igual que con las fases: NO se comprueba disponibilidad. Las dos en
 * blanco devuelven la obra a seguir a sus proyectos.
 */
create or replace function public.set_work_dates(
  p_work uuid, p_start date default null, p_end date default null)
returns public.works language plpgsql security definer set search_path = public as $$
declare w public.works; v_antes_start date; v_antes_end date;
begin
  perform public.assert_admin();

  select * into w from public.works where id = p_work for update;
  if not found then
    raise exception 'No se encuentra la obra' using errcode = 'P0002';
  end if;

  if p_start is not null and p_end is not null and p_end < p_start then
    raise exception 'El final no puede ser anterior al inicio' using errcode = '22023';
  end if;

  -- Una sola de las dos no sirve: la barra del calendario necesita
  -- principio y fin. Se dice en castellano y se explica la alternativa.
  if (p_start is null) <> (p_end is null) then
    raise exception 'Escribe las dos fechas, o deja las dos en blanco para que la obra siga a sus proyectos'
      using errcode = '22023';
  end if;

  v_antes_start := w.cal_start; v_antes_end := w.cal_end;

  update public.works
     set cal_start = p_start, cal_end = p_end, updated_at = now()
   where id = p_work
  returning * into w;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'editar_fechas', 'works', w.id, w.code,
          public.actor_name() ||
          case when p_start is null
               then ' quitó las fechas propias de ' || w.code ||
                    ': vuelve a seguir a sus proyectos'
               else ' puso el periodo de ' || w.code || ': ' ||
                    to_char(p_start, 'DD/MM/YYYY') || ' → ' || to_char(p_end, 'DD/MM/YYYY')
          end,
          jsonb_build_object('antes_inicio', v_antes_start, 'antes_fin', v_antes_end,
                             'inicio', p_start, 'fin', p_end),
          w.is_demo);

  return w;
end $$;

comment on function public.set_work_dates(uuid, date, date) is
  'Pone o quita el periodo propio de la obra en el calendario. NO comprueba disponibilidad.';

grant execute on function public.set_work_dates(uuid, date, date) to authenticated;
revoke execute on function public.set_work_dates(uuid, date, date) from anon, public;
