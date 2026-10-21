-- =====================================================================
-- METALPLAFER360 · PEDIR MATERIAL QUE NO ES DE NINGÚN PROYECTO
--
-- M2 · En el taller se gastan cosas que no son de ningún trabajo: discos
-- de corte, electrodos, brocas, guantes, sprays. Hasta ahora el material
-- pendiente tenía que ir contra un proyecto, así que para anotar una caja
-- de discos había que colgarla de un proyecto cualquiera. Eso ensucia el
-- material de ese proyecto y, con el tiempo, nadie sabe qué se compró
-- para qué.
--
--
-- LO PRIMERO QUE SE COMPROBÓ: ¿hacía falta tocar el modelo de datos?
--
-- Sí, y solo en un sitio. Comprobado contra la base de datos:
--
--   · «material_requests.project_id» YA admitía nulos, y
--     «submit_material_need(p_project, p_body)» ya acepta que no se diga
--     el proyecto: un trabajador puede pedir algo sin saber de qué obra
--     es. Eso no se toca.
--   · «materials.project_id» era «not null». Ahí se cortaba: al aceptar
--     la petición había que elegir un proyecto a la fuerza, y la propia
--     función lo decía: «Esta petición no trae proyecto. Elige a qué
--     proyecto va el material antes de aceptarla».
--
-- Así que se quita ESA obligación y nada más.
--
--
-- LO QUE HABÍA QUE REVISAR, Y SE HA REVISADO UNO POR UNO
--
-- Una columna que pasa a admitir nulos rompe en silencio todo lo que la
-- daba por supuesta. Se ha repasado TODO lo que lee «materials»:
--
--   · el historial decía «anotó material pendiente: … en un proyecto».
--     Para el material de taller eso sería mentira: ahora dice «en el
--     taller»;
--   · el aviso de material retrasado hacía «join projects». El material
--     de taller que se retrasara NO habría avisado a nadie. Pasa a
--     «left join» y en el aviso pone «Taller»;
--   · el informe de material hacía «join projects». El de taller no
--     habría salido en ningún informe. Mismo arreglo;
--   · el calendario hacía «join worker_projects». El material de taller
--     con fecha prevista habría desaparecido del calendario. Pasa a
--     «left join», y SOLO administración lo ve: la condición nueva
--     conserva exactamente el filtro de permisos que había;
--   · «project_materials» (los contadores por proyecto) agrupa por
--     proyecto y se consulta por un proyecto concreto, así que el grupo
--     sin proyecto no estorba. No se toca;
--   · las políticas de RLS de «materials» no se tocan: «materials_select»
--     es «is_admin() or worker_can_see_project(project_id)», y
--     «worker_can_see_project(null)» devuelve FALSO —comprobado—, así
--     que el material de taller es de administración y un trabajador no
--     lo ve. Es lo que se quiere: no es de su trabajo.
--
--
-- LO QUE NO SE HACE
--
--   · NO se crea ningún proyecto «Taller», ni «Varios», ni ninguno de
--     mentira. El material de taller no tiene proyecto, y eso es un dato
--     de verdad, no un hueco.
--   · NO se convierte NI UN pedido de los que ya existen. Todos siguen
--     con su proyecto, y ninguno pasa a ser de taller.
--   · NO se asigna un proyecto por defecto a nada.
--
-- MIGRACIÓN ESTRUCTURAL. Quita una obligación de una columna y vuelve a
-- definir cuatro funciones y una vista, SIN tocar ningún dato.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) EL PROYECTO DEL MATERIAL PASA A SER OPCIONAL
--
-- Quitar un «not null» NO cambia ninguna fila: las que ya hay siguen con
-- su proyecto. Y es reversible mientras no haya material de taller:
-- «alter table public.materials alter column project_id set not null».
-- ---------------------------------------------------------------------
alter table public.materials alter column project_id drop not null;

comment on column public.materials.project_id is
  'El proyecto al que va el material. VACÍO = material de taller: consumibles que no son de ningún trabajo.';


-- ---------------------------------------------------------------------
-- 2) ACEPTAR UNA PETICIÓN QUE NO TRAE PROYECTO
--
-- Generada a partir de la del archivo 32 quitando la comprobación que lo
-- impedía. Lo demás queda igual: sigue siendo solo para administración,
-- sigue exigiendo el nombre del material, sigue negándose si la petición
-- ya estaba revisada, sigue heredando «is_demo» de la petición y sigue
-- avisando al trabajador que la pidió.
--
-- Si la petición SÍ trae proyecto, manda el de la petición: no se puede
-- aceptar como material de taller algo que se pidió para un trabajo.
-- ---------------------------------------------------------------------
create or replace function public.accept_material_request(
  p_request uuid, p_name text, p_units numeric default null,
  p_supplier text default null, p_ordered_on date default null,
  p_expected_on date default null, p_notes text default null,
  p_project uuid default null)
returns public.materials
language plpgsql security definer set search_path = public as $$
declare
  r public.material_requests;
  m public.materials;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_project uuid;
begin
  perform public.assert_admin();

  select * into r from public.material_requests where id = p_request for update;
  if not found then raise exception 'No se encuentra la comunicación' using errcode = 'P0002'; end if;
  if r.status <> 'pendiente' then
    raise exception 'Esta comunicación ya está revisada' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'Escribe el nombre del material' using errcode = '22023';
  end if;

  -- El proyecto: el de la petición, o el que diga administración ahora.
  -- Y puede quedarse en NADA: entonces es material de taller, de los que
  -- no son de ningún trabajo (discos de corte, electrodos, guantes).
  v_project := coalesce(r.project_id, p_project);
  if v_project is not null
     and not exists (select 1 from public.projects where id = v_project) then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;

  insert into public.materials (project_id, order_id, name, units, supplier,
                                ordered_on, expected_on, notes, is_demo)
  values (v_project, r.order_id, v_name, p_units, nullif(trim(coalesce(p_supplier, '')), ''),
          p_ordered_on, p_expected_on, nullif(trim(coalesce(p_notes, '')), ''), r.is_demo)
  returning * into m;

  update public.material_requests
     set status = 'aceptada', reviewed_at = now(), reviewed_by = auth.uid(),
         material_id = m.id, project_id = v_project
   where id = p_request;

  perform public.notify_user(r.worker_id, 'material_solicitado',
    'Material anotado', 'Se ha añadido «' || v_name || '» al material pendiente.', r.order_id);

  return m;
end $$;


-- ---------------------------------------------------------------------
-- 3) EL AVISO DE MATERIAL RETRASADO
--
-- Generada a partir de la del archivo 16 con «left join» y una palabra:
-- el material de taller que se retrase avisa como cualquier otro, y en
-- el aviso pone «Taller» donde los demás llevan el código del proyecto.
--
-- Esto era un agujero de verdad: sin el cambio, el material de taller
-- nunca habría avisado a nadie de que llega tarde, que es justo para lo
-- que sirve esta pantalla.
-- ---------------------------------------------------------------------
create or replace function public.notify_late_materials()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer := 0; m record;
begin
  if not public.is_admin() then return 0; end if;

  for m in
    select mm.id, mm.name, mm.expected_on, mm.supplier,
           coalesce(p.code, 'Taller') as project_code
      from public.materials mm
      left join public.projects p on p.id = mm.project_id
     where mm.archived_at is null
       and not mm.received
       and mm.expected_on is not null
       and mm.expected_on < public.today_madrid()
       and (mm.late_notified_on is null or mm.late_notified_on < public.today_madrid())
     for update of mm
  loop
    insert into public.notifications (user_id, kind, title, body)
    select pr.id, 'material_retrasado', 'Material retrasado',
           m.name || ' · ' || m.project_code ||
           ' · estaba previsto para el ' || to_char(m.expected_on, 'DD/MM/YYYY') ||
           coalesce(' (' || m.supplier || ')', '')
      from public.profiles pr where pr.role = 'admin' and pr.active;

    update public.materials set late_notified_on = public.today_madrid() where id = m.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;


-- ---------------------------------------------------------------------
-- 4) EL INFORME DE MATERIAL
--
-- Igual: el de taller sale en el informe, con «Taller» en la columna del
-- proyecto. Antes se habría quedado fuera sin que nadie lo notara.
-- ---------------------------------------------------------------------
create or replace function public.report_materials(p_from date, p_to date)
returns table (
  material text, unidades numeric, proveedor text, proyecto text,
  pedido date, previsto date, recibido boolean, dias_retraso integer
)
language sql stable security definer set search_path = public as $$
  select m.name, m.units, coalesce(m.supplier, '—'), coalesce(p.code, 'Taller'),
         m.ordered_on, m.expected_on, m.received,
         case when m.received or m.expected_on is null or m.expected_on >= public.today_madrid()
              then 0 else public.today_madrid() - m.expected_on end
    from public.materials m
    left join public.projects p on p.id = m.project_id
   where public.is_admin()
     and m.archived_at is null
     and (not m.received
          or coalesce(m.ordered_on, m.created_at::date) between p_from and p_to
          or m.updated_at::date between p_from and p_to)
   order by m.received, m.expected_on nulls last;
$$;


-- ---------------------------------------------------------------------
-- 5) EL CALENDARIO
--
-- Generada a partir de la del archivo 32 cambiando SOLO la rama del
-- material. El «join» pasa a «left join», y la condición nueva hace dos
-- cosas:
--
--   · «wp.id is not null» conserva EXACTAMENTE el filtro de permisos que
--     hacía el «join»: si el proyecto del material no se puede ver, la
--     fila no sale. Esto es importante: un «left join» a secas habría
--     enseñado a cada trabajador el material de proyectos que no son
--     suyos;
--   · y el material SIN proyecto sale solo para administración.
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
    cross join lateral (
      select g::date as day, row_number() over (order by g) as n
        from generate_series(s.starts, s.ends, interval '1 day') g
       where s.manual or public.is_working_day(g::date)
    ) d

  union all

  select 'material', m.id, null, m.name, m.notes, m.expected_on,
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
         f.address, f.scheduled_date, public.label_es(f.status),
         null, null, f.client_name,
         case when f.assigned_to is null then '{}'::uuid[] else array[f.assigned_to] end,
         false
    from public.worker_fichas f
   where f.archived_at is null
     and f.scheduled_date is not null
     and f.type in ('visita', 'aviso')

  union all

  select 'otro', n.id, null, n.title, n.detail, n.day, 'Evento',
         n.project_id, wp.code, wp.client_name, '{}'::uuid[], true
    from public.calendar_notes n
    left join public.worker_projects wp on wp.id = n.project_id

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
-- 6) EL HISTORIAL DEL MATERIAL DE TALLER
--
-- Generada a partir de la del archivo 27 —que es la que está viva, no la
-- del 16— cambiando DOS palabras en la rama del material: donde no hay
-- proyecto, el historial dice «el taller» en lugar de «un proyecto».
--
-- Las demás ramas (fichas, proyectos, órdenes, partes, cobros, obras…)
-- quedan letra por letra como estaban.
-- ---------------------------------------------------------------------
create or replace function public.trg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb; v_old jsonb; v_changed text[]; v_details jsonb := '{}'::jsonb;
  v_name text := public.actor_name(); v_summary text; v_code text; v_entity uuid; v_tmp text;
begin
  if coalesce(current_setting('app.skip_audit', true), '') = 'on'
     or coalesce(current_setting('app.restoring', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  v_row := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if TG_OP = 'UPDATE' then
    v_old := to_jsonb(old);
    select array_agg(key) into v_changed
      from jsonb_each(v_row) e
     where e.key <> 'updated_at' and e.value is distinct from v_old -> e.key;
    if v_changed is null then return new; end if;
    select jsonb_build_object('cambios',
             jsonb_object_agg(k, jsonb_build_object('antes', v_old -> k, 'despues', v_row -> k)))
      into v_details from unnest(v_changed) k;
  end if;

  v_entity := public.try_uuid(v_row ->> 'id');
  v_code   := v_row ->> 'code';

  case TG_TABLE_NAME
  when 'profiles' then
    v_code := v_row ->> 'full_name';
    v_summary := case
      when TG_OP = 'INSERT' then v_name || ' creó el usuario ' || v_code ||
           ' (' || case (v_row ->> 'role') when 'admin' then 'administración' else 'trabajador' end || ')'
      when TG_OP = 'DELETE' then v_name || ' eliminó al usuario ' || v_code
      when 'active' = any(v_changed) then v_name ||
           case when new.active then ' reactivó' else ' desactivó' end || ' al usuario ' || v_code
      when 'role' = any(v_changed) then v_name || ' cambió el rol de ' || v_code || ' a ' ||
           case new.role when 'admin' then 'administración' else 'trabajador' end
      when v_changed <@ array['preferences'] then null
      else v_name || ' modificó el usuario ' || v_code end;

  when 'app_settings' then
    v_summary := v_name || ' modificó la configuración de la aplicación';

  when 'clients' then
    v_code := v_row ->> 'name';
    v_summary := case
      when TG_OP = 'INSERT' then v_name || ' creó el cliente ' || v_code
      when 'archived_at' = any(v_changed) and new.archived_at is not null
           then v_name || ' archivó el cliente ' || v_code
      when 'archived_at' = any(v_changed)
           then v_name || ' recuperó el cliente archivado ' || v_code
      when 'active' = any(v_changed) then v_name ||
           case when new.active then ' reactivó' else ' desactivó' end || ' el cliente ' || v_code
      else v_name || ' modificó el cliente ' || v_code end;

  when 'client_contacts' then
    select name into v_tmp from public.clients where id = (v_row ->> 'client_id')::uuid;
    v_code := v_row ->> 'name';
    v_summary := v_name || case TG_OP
                   when 'INSERT' then ' añadió el contacto '
                   when 'DELETE' then ' eliminó el contacto '
                   else ' modificó el contacto ' end
                 || v_code || ' de ' || coalesce(v_tmp, 'un cliente');

  when 'fichas' then
    v_summary := case
      when TG_OP = 'INSERT' then
        v_name || ' creó la ficha de ' || public.label_es(new.type::text) || ' ' || v_code
      when 'status' = any(v_changed) then
        v_name || ' cambió la ficha ' || v_code || ' de ' ||
        public.label_es(old.status) || ' → ' || public.label_es(new.status)
      when 'assigned_to' = any(v_changed) then
        v_name || ' asignó la ficha ' || v_code || ' a ' ||
        coalesce((select full_name from public.profiles where id = new.assigned_to), 'nadie')
      when 'archived_at' = any(v_changed) and new.archived_at is not null then
        v_name || ' archivó la ficha ' || v_code
      when 'archived_at' = any(v_changed) then
        v_name || ' recuperó la ficha archivada ' || v_code
      when 'scheduled_date' = any(v_changed) then
        v_name || ' cambió la fecha de ' || v_code || ' a ' ||
        coalesce(to_char(new.scheduled_date, 'DD/MM/YYYY'), 'sin fecha')
      else v_name || ' modificó la ficha ' || v_code end;

  when 'projects' then
    v_summary := case
      when TG_OP = 'INSERT' then
        v_name || ' creó el proyecto ' || v_code || ' · ' || new.name ||
        coalesce((select ' (desde el presupuesto ' || f.code || ')'
                    from public.fichas f where f.id = new.source_ficha_id), '')
      when 'phase' = any(v_changed) and new.phase = 'finalizado' then
        v_name || ' finalizó el proyecto ' || v_code
      when 'phase' = any(v_changed) and old.phase = 'finalizado' then
        v_name || ' reabrió el proyecto ' || v_code
      when 'phase' = any(v_changed) then
        v_name || ' cambió el proyecto ' || v_code || ' de ' ||
        public.label_es(old.phase::text) || ' → ' || public.label_es(new.phase::text)
      when 'billing_status' = any(v_changed) then
        v_name || ' cambió la facturación de ' || v_code || ' de ' ||
        public.label_es(old.billing_status::text) || ' → ' || public.label_es(new.billing_status::text)
      when 'no_assembly' = any(v_changed) then
        v_name || case when new.no_assembly then ' marcó «Sin montaje» en ' else ' quitó «Sin montaje» de ' end || v_code
      when 'archived_at' = any(v_changed) and new.archived_at is not null then
        v_name || ' archivó el proyecto ' || v_code
      when 'archived_at' = any(v_changed) then
        v_name || ' recuperó el proyecto archivado ' || v_code
      when 'budget_amount' = any(v_changed) then
        v_name || ' cambió el presupuesto de ' || v_code || ' a ' || public.fmt_eur(new.budget_amount)
      else v_name || ' modificó el proyecto ' || v_code end;

  when 'project_substatuses' then
    select code into v_code from public.projects where id = (v_row ->> 'project_id')::uuid;
    v_summary := v_name ||
      case TG_OP when 'INSERT' then ' añadió el subestado «' else ' quitó el subestado «' end ||
      public.label_es(v_row ->> 'substatus') || '» en ' || coalesce(v_code, 'un proyecto');

  when 'work_orders' then
    select code into v_tmp from public.projects where id = (v_row ->> 'project_id')::uuid;
    v_summary := case
      when TG_OP = 'INSERT' then
        v_name || ' creó la orden de ' || lower(public.order_type_es(new.type)) || ' ' || v_code ||
        ' de ' || coalesce(v_tmp, 'un proyecto') ||
        ' para el ' || to_char(new.scheduled_date, 'DD/MM/YYYY')
      when 'status' = any(v_changed) and new.status = 'realizada' then
        v_name || ' envió la orden ' || v_code || ' a revisión'
      when 'status' = any(v_changed) and new.status = 'validada' then
        v_name || ' validó la orden ' || v_code
      when 'status' = any(v_changed) and new.status = 'devuelta' then
        v_name || ' devolvió la orden ' || v_code || '. Motivo: ' || coalesce(new.return_reason, '—')
      when 'status' = any(v_changed) then
        v_name || ' cambió la orden ' || v_code || ' de ' ||
        public.order_status_es(old.status) || ' → ' || public.order_status_es(new.status)
      when 'scheduled_date' = any(v_changed) then
        v_name || ' cambió la fecha de la orden ' || v_code || ' a ' ||
        to_char(new.scheduled_date, 'DD/MM/YYYY')
      when 'archived_at' = any(v_changed) and new.archived_at is not null then
        v_name || ' archivó la orden ' || v_code
      when 'archived_at' = any(v_changed) then
        v_name || ' recuperó la orden archivada ' || v_code
      else v_name || ' modificó la orden ' || v_code end;

  when 'work_order_workers' then
    select code into v_code from public.work_orders where id = (v_row ->> 'order_id')::uuid;
    select full_name into v_tmp from public.profiles where id = (v_row ->> 'worker_id')::uuid;
    v_entity := public.try_uuid(v_row ->> 'order_id');
    v_summary := case
      when TG_OP = 'INSERT' then v_name || ' asignó la orden ' || coalesce(v_code, '') ||
                                ' a ' || coalesce(v_tmp, 'alguien')
      when TG_OP = 'DELETE' then v_name || ' quitó a ' || coalesce(v_tmp, 'alguien') ||
                                ' de la orden ' || coalesce(v_code, '')
      when 'submitted_at' = any(v_changed) and new.submitted_at is not null then
        coalesce(v_tmp, 'Alguien') || ' envió su parte de la orden ' || coalesce(v_code, '') ||
        ' (' || public.fmt_hours(new.hours) || ')'
      when 'submitted_at' = any(v_changed) and new.submitted_at is null and old.submitted_at is not null then
        null
      when 'hours' = any(v_changed) or 'work_done' = any(v_changed) then
        coalesce(v_tmp, 'Alguien') || ' guardó su parte de la orden ' || coalesce(v_code, '') ||
        ' (' || public.fmt_hours(new.hours) || ')'
      else null end;

  when 'materials' then
    select code into v_code from public.projects where id = (v_row ->> 'project_id')::uuid;
    v_tmp := (v_row ->> 'name');
    v_summary := case
      when TG_OP = 'INSERT' then
        v_name || ' anotó material pendiente: ' || public.fmt_units(new.units) || ' · ' || v_tmp ||
        coalesce(' (' || new.supplier || ')', '') || ' en ' || coalesce(v_code, 'el taller')
      when TG_OP = 'DELETE' then v_name || ' eliminó el material «' || v_tmp || '»'
      when 'received' = any(v_changed) and new.received then
        v_name || ' marcó como recibido «' || v_tmp || '» de ' || coalesce(v_code, 'el taller')
      when 'received' = any(v_changed) then
        v_name || ' volvió a marcar como pendiente «' || v_tmp || '»'
      when 'expected_on' = any(v_changed) then
        v_name || ' cambió la fecha prevista de «' || v_tmp || '» a ' ||
        coalesce(to_char(new.expected_on, 'DD/MM/YYYY'), 'sin fecha')
      when 'archived_at' = any(v_changed) and new.archived_at is not null then
        v_name || ' archivó el material «' || v_tmp || '»'
      when 'archived_at' = any(v_changed) then
        v_name || ' recuperó el material archivado «' || v_tmp || '»'
      when v_changed <@ array['late_notified_on'] then null
      else v_name || ' modificó el material «' || v_tmp || '»' end;

  when 'material_requests' then
    select code into v_code from public.work_orders where id = (v_row ->> 'order_id')::uuid;
    if v_code is null then
      select code into v_code from public.projects where id = (v_row ->> 'project_id')::uuid;
    end if;
    select full_name into v_tmp from public.profiles where id = (v_row ->> 'worker_id')::uuid;
    v_summary := case
      when TG_OP = 'INSERT' then
        coalesce(v_tmp, 'Un trabajador') || ' comunicó falta de material en ' ||
        coalesce(v_code, 'un proyecto') || ': ' || left(new.body, 120)
      when 'status' = any(v_changed) and new.status = 'aceptada' then
        v_name || ' aceptó la comunicación de material de ' || coalesce(v_tmp, 'un trabajador')
      when 'status' = any(v_changed) and new.status = 'descartada' then
        v_name || ' descartó la comunicación de material de ' || coalesce(v_tmp, 'un trabajador') ||
        coalesce('. Motivo: ' || new.review_note, '')
      else null end;

  when 'payments' then
    select code into v_code from public.projects where id = (v_row ->> 'project_id')::uuid;
    v_summary := case
      when TG_OP = 'INSERT' then
        v_name || ' apuntó un cobro de ' || public.fmt_eur(new.amount) ||
        ' en ' || coalesce(v_code, 'un proyecto') ||
        ' (' || to_char(new.paid_on, 'DD/MM/YYYY') || ')'
      when TG_OP = 'DELETE' then
        v_name || ' quitó un cobro de ' || public.fmt_eur(old.amount) ||
        ' de ' || coalesce(v_code, 'un proyecto')
      else v_name || ' modificó un cobro de ' || coalesce(v_code, 'un proyecto') end;

  when 'documents' then
    v_code := v_row ->> 'file_name';
    v_summary := case
      when TG_OP = 'INSERT' then v_name || ' subió ' ||
        case (v_row ->> 'category')
          when 'foto'  then 'una fotografía'
          when 'video' then 'un vídeo'
          when 'firma' then 'una firma'
          else 'un documento' end || ' «' || v_code || '»' ||
        coalesce((select ' a ' || p.code from public.projects p where p.id = (v_row ->> 'project_id')::uuid), '') ||
        coalesce((select ' a ' || f.code from public.fichas f where f.id = (v_row ->> 'ficha_id')::uuid), '') ||
        coalesce((select ' a ' || o.code from public.work_orders o where o.id = (v_row ->> 'order_id')::uuid), '')
      when TG_OP = 'DELETE' then v_name || ' eliminó definitivamente «' || v_code || '»'
      when 'deleted_at' = any(v_changed) and new.deleted_at is not null
           then v_name || ' envió a la papelera «' || v_code || '»'
      when 'deleted_at' = any(v_changed)
           then v_name || ' restauró de la papelera «' || v_code || '»'
      else v_name || ' modificó «' || v_code || '»' end;

  when 'comments' then
    select code into v_code from public.fichas   where id = (v_row ->> 'ficha_id')::uuid;
    if v_code is null then
      select code into v_code from public.projects where id = (v_row ->> 'project_id')::uuid;
    end if;
    if v_code is null then
      select code into v_code from public.work_orders where id = (v_row ->> 'order_id')::uuid;
    end if;
    if v_code is null then
      select code into v_code from public.work_reports where id = (v_row ->> 'report_id')::uuid;
    end if;
    select full_name into v_tmp from public.profiles
     where id = (v_row ->> 'target_worker_id')::uuid;
    v_summary := v_name || ' comentó en ' || coalesce(v_code, 'una ficha') ||
                 coalesce(' para ' || v_tmp, '') ||
                 ': ' || left(v_row ->> 'body', 120);

  when 'work_reports' then
    select full_name into v_tmp from public.profiles where id = (v_row ->> 'worker_id')::uuid;
    v_summary := case
      when TG_OP = 'INSERT' and new.status = 'enviado' then
        v_name || ' envió el parte ' || v_code || ' (' || public.fmt_hours(new.hours) || ') a validar'
      when TG_OP = 'INSERT' then
        v_name || ' empezó el parte ' || v_code ||
        case when new.worker_id = auth.uid() then '' else ' de ' || coalesce(v_tmp, 'un trabajador') end
      when TG_OP = 'DELETE' then
        v_name || ' eliminó el parte ' || v_code
      when 'status' = any(v_changed) and new.status = 'enviado' then
        v_name || ' envió el parte ' || v_code ||
        ' (' || public.fmt_hours(new.hours) || ') a validar'
      when 'status' = any(v_changed) and new.status = 'validado' then
        v_name || ' validó el parte ' || v_code || ' · ' || public.fmt_hours(new.hours) ||
        case when new.worker_id = auth.uid() then '' else ' de ' || coalesce(v_tmp, 'un trabajador') end
      when 'status' = any(v_changed) and new.status = 'rechazado' then
        v_name || ' rechazó el parte ' || v_code || '. Motivo: ' ||
        coalesce(new.reject_reason, 'sin indicar')
      when 'project_id' = any(v_changed) and new.project_id is not null then
        v_name || ' asignó el parte ' || v_code || ' al proyecto ' ||
        coalesce((select code from public.projects where id = new.project_id), 'desconocido')
      when 'project_id' = any(v_changed) then
        v_name || ' quitó el parte ' || v_code || ' de su proyecto'
      when 'hours' = any(v_changed) then
        v_name || ' cambió las horas del parte ' || v_code || ': ' ||
        public.fmt_hours(old.hours) || ' → ' || public.fmt_hours(new.hours)
      else v_name || ' modificó el parte ' || v_code end;

  when 'project_workers' then
    select code into v_code from public.projects where id = (v_row ->> 'project_id')::uuid;
    select full_name into v_tmp from public.profiles where id = (v_row ->> 'worker_id')::uuid;
    v_summary := v_name || case TG_OP
                   when 'INSERT' then ' asignó a '
                   when 'DELETE' then ' quitó a ' end
                 || coalesce(v_tmp, 'un trabajador') || ' '
                 || case TG_OP when 'INSERT' then 'al' else 'del' end || ' proyecto '
                 || coalesce(v_code, 'desconocido');
    v_entity := public.try_uuid(v_row ->> 'project_id');

  else
    v_summary := v_name || ' ' || lower(TG_OP) || ' ' || TG_TABLE_NAME;
  end case;

  if v_summary is null then return coalesce(new, old); end if;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), v_name, lower(TG_OP), TG_TABLE_NAME, v_entity, v_code, v_summary,
          v_details || case when TG_OP = 'DELETE'
                            then jsonb_build_object('registro', v_row) else '{}'::jsonb end,
          coalesce((v_row ->> 'is_demo')::boolean, false));

  return coalesce(new, old);
end $$;
