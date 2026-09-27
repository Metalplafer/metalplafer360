-- =====================================================================
-- METALPLAFER360 · 16 · FUNCIONES DE MATERIAL, CALENDARIO Y COBROS (FASE 5)
--
-- Reglas que viven aquí, en la base de datos:
--   · lo que comunica un trabajador NUNCA se convierte solo en material
--   · al marcar «recibido» no se guarda ni fecha ni usuario
--   · el pendiente de cobro se calcula: total − cobrado
--   · cambiar la fecha de una orden NO avisa a nadie
-- =====================================================================

-- ---------------------------------------------------------------------
-- Textos en castellano
-- ---------------------------------------------------------------------
create or replace function public.request_status_es(p public.request_status) returns text
language sql immutable as $$
  select case p
    when 'pendiente'  then 'Pendiente de revisar'
    when 'aceptada'   then 'Aceptada'
    when 'descartada' then 'Descartada'
  end;
$$;

/** Unidades sin ceros de más: 3 · 12,5 */
create or replace function public.fmt_units(n numeric) returns text
language sql immutable as $$
  select case when n is null then '—'
              else replace(trim(trailing '.' from
                     trim(trailing '0' from to_char(n, 'FM999999990.00'))), '.', ',')
         end;
$$;

-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------
drop trigger if exists touch_updated_at on public.materials;
create trigger touch_updated_at before update on public.materials
  for each row execute function public.trg_touch_updated_at();

-- ---------------------------------------------------------------------
-- AL MARCAR «RECIBIDO» NO SE GUARDA NADA MÁS
--
-- Si el material vuelve a quedar pendiente, se limpia la marca del aviso
-- de retraso para que pueda volver a avisar.
-- ---------------------------------------------------------------------
create or replace function public.trg_materials_before() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;

  if TG_OP = 'INSERT' then
    new.late_notified_on := null;
    return new;
  end if;

  if new.received and not old.received then
    -- Recibido: deja de estar pendiente y deja de avisar.
    new.late_notified_on := null;
  end if;

  if new.expected_on is distinct from old.expected_on then
    new.late_notified_on := null;
  end if;

  return new;
end $$;

drop trigger if exists materials_before on public.materials;
create trigger materials_before before insert or update on public.materials
  for each row execute function public.trg_materials_before();

-- ---------------------------------------------------------------------
-- PROVEEDORES YA UTILIZADOS
-- Sugerencias mientras se escribe. Solo administración.
-- ---------------------------------------------------------------------
create or replace function public.suggest_suppliers(p_query text, p_limit int default 8)
returns table (supplier text, veces bigint)
language sql stable security invoker set search_path = public, extensions as $$
  select m.supplier, count(*) as veces
    from public.materials m
   where public.is_admin()
     and m.supplier is not null
     and length(trim(m.supplier)) > 0
     and (coalesce(trim(p_query), '') = ''
          or public.norm(m.supplier) like '%' || public.norm(p_query) || '%')
   group by m.supplier
   order by count(*) desc, m.supplier
   limit greatest(1, least(p_limit, 25));
$$;

-- ---------------------------------------------------------------------
-- LO QUE COMUNICA EL TRABAJADOR
--
-- Entra como AVISO, no como material. Administración decide.
-- ---------------------------------------------------------------------
create or replace function public.submit_material_request(p_order uuid, p_body text)
returns public.material_requests
language plpgsql security definer set search_path = public as $$
declare
  o public.work_orders;
  r public.material_requests;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
begin
  if v_body is null then
    raise exception 'Escribe qué material falta' using errcode = '22023';
  end if;

  select * into o from public.work_orders where id = p_order;
  if not found then raise exception 'No se encuentra la orden de trabajo' using errcode = 'P0002'; end if;

  if not (public.worker_has_order(p_order) or public.is_admin()) then
    raise exception 'Esta orden no está asignada a ti' using errcode = '42501';
  end if;

  insert into public.material_requests (project_id, order_id, worker_id, body, is_demo)
  values (o.project_id, o.id, auth.uid(), v_body, o.is_demo)
  returning * into r;

  perform public.notify_admins('material_solicitado', 'Falta material',
    public.actor_name() || ' · ' || o.code || ': ' || left(v_body, 160), o.id);

  return r;
end $$;

/**
 * ACEPTAR una comunicación: se crea el material pendiente de verdad.
 * Solo administración, y rellenando los datos que el trabajador no tiene
 * por qué saber (proveedor, fechas…).
 */
create or replace function public.accept_material_request(
  p_request uuid, p_name text, p_units numeric default null,
  p_supplier text default null, p_ordered_on date default null,
  p_expected_on date default null, p_notes text default null)
returns public.materials
language plpgsql security definer set search_path = public as $$
declare
  r public.material_requests;
  m public.materials;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
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

  insert into public.materials (project_id, order_id, name, units, supplier,
                                ordered_on, expected_on, notes, is_demo)
  values (r.project_id, r.order_id, v_name, p_units, nullif(trim(coalesce(p_supplier, '')), ''),
          p_ordered_on, p_expected_on, nullif(trim(coalesce(p_notes, '')), ''), r.is_demo)
  returning * into m;

  update public.material_requests
     set status = 'aceptada', reviewed_at = now(), reviewed_by = auth.uid(), material_id = m.id
   where id = p_request;

  perform public.notify_user(r.worker_id, 'material_solicitado',
    'Material anotado', 'Se ha añadido «' || v_name || '» al material pendiente.', r.order_id);

  return m;
end $$;

/** DESCARTAR una comunicación (por ejemplo, porque ya estaba pedido). */
create or replace function public.discard_material_request(p_request uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.material_requests;
begin
  perform public.assert_admin();

  select * into r from public.material_requests where id = p_request for update;
  if not found then raise exception 'No se encuentra la comunicación' using errcode = 'P0002'; end if;
  if r.status <> 'pendiente' then
    raise exception 'Esta comunicación ya está revisada' using errcode = '22023';
  end if;

  update public.material_requests
     set status = 'descartada', reviewed_at = now(), reviewed_by = auth.uid(),
         review_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request;

  perform public.notify_user(r.worker_id, 'material_solicitado',
    'Material revisado',
    coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Administración ha revisado tu aviso de material.'),
    r.order_id);
end $$;

-- ---------------------------------------------------------------------
-- AVISO DE MATERIAL RETRASADO
--
-- No hay tareas programadas en esta fase: lo comprueba la aplicación al
-- abrirse. La marca «late_notified_on» evita repetir el aviso el mismo día.
-- ---------------------------------------------------------------------
create or replace function public.notify_late_materials()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer := 0; m record;
begin
  if not public.is_admin() then return 0; end if;

  for m in
    select mm.id, mm.name, mm.expected_on, mm.supplier, p.code as project_code
      from public.materials mm
      join public.projects p on p.id = mm.project_id
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
-- COBROS PARCIALES
--
-- El estado de facturación se recalcula solo:
--   cobrado = 0            → se respeta lo que haya puesto administración
--   0 < cobrado < total    → Cobrado parcialmente
--   cobrado >= total       → Cobrado
-- ---------------------------------------------------------------------
create or replace function public.recompute_billing(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_paid numeric; v_status public.billing_status; v_next public.billing_status;
begin
  select coalesce(budget_amount, 0), billing_status into v_total, v_status
    from public.projects where id = p_project;
  if not found then return; end if;

  select coalesce(sum(amount), 0) into v_paid from public.payments where project_id = p_project;

  v_next := case
    when v_paid > 0 and v_total > 0 and v_paid >= v_total then 'cobrado'
    when v_paid > 0                                       then 'cobrado_parcial'
    when v_status in ('cobrado', 'cobrado_parcial')       then 'pendiente_cobro'
    else v_status end;

  if v_next is distinct from v_status then
    update public.projects set billing_status = v_next where id = p_project;
  end if;
end $$;

create or replace function public.register_payment(
  p_project uuid, p_amount numeric, p_paid_on date default null, p_notes text default null)
returns public.payments
language plpgsql security definer set search_path = public as $$
declare pay public.payments; v_amount numeric := round(coalesce(p_amount, 0)::numeric, 2);
begin
  perform public.assert_admin();

  if not exists (select 1 from public.projects where id = p_project) then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;
  if v_amount <= 0 then
    raise exception 'El importe del cobro debe ser mayor que cero' using errcode = '22023';
  end if;

  insert into public.payments (project_id, amount, paid_on, notes, is_demo)
  select p_project, v_amount, coalesce(p_paid_on, public.today_madrid()),
         nullif(trim(coalesce(p_notes, '')), ''), p.is_demo
    from public.projects p where p.id = p_project
  returning * into pay;

  perform public.recompute_billing(p_project);
  return pay;
end $$;

/** Quitar un cobro apuntado por error. Queda registrado en el historial. */
create or replace function public.delete_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  perform public.assert_admin();

  delete from public.payments where id = p_payment returning project_id into v_project;
  if v_project is null then
    raise exception 'No se encuentra el cobro' using errcode = 'P0002';
  end if;

  perform public.recompute_billing(v_project);
end $$;

-- Si cambia el importe del proyecto, el estado de cobro se revisa.
create or replace function public.trg_projects_billing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;
  if new.budget_amount is distinct from old.budget_amount then
    perform public.recompute_billing(new.id);
  end if;
  return new;
end $$;

drop trigger if exists projects_billing on public.projects;
create trigger projects_billing after update on public.projects
  for each row execute function public.trg_projects_billing();

-- ---------------------------------------------------------------------
-- CALENDARIO
--
-- Todo lo que tiene fecha, en una sola consulta: órdenes de fabricación
-- y de montaje, material previsto, visitas y avisos.
-- El color lo da el TIPO de evento, nunca el trabajador.
--
-- La vista respeta los permisos de quien pregunta: un trabajador solo ve
-- lo suyo, sin que la pantalla tenga que filtrar nada.
-- ---------------------------------------------------------------------
create or replace view public.v_calendar with (security_invoker = true) as
  select o.type::text                       as kind,
         o.id,
         o.code,
         coalesce(p.name, '')               as title,
         o.description                      as detail,
         o.scheduled_date                   as date,
         public.order_status_es(o.status)   as status,
         o.project_id,
         p.code                             as project_code,
         c.name                             as client_name,
         coalesce((select array_agg(w.worker_id)
                     from public.work_order_workers w where w.order_id = o.id), '{}'::uuid[]) as assigned,
         true                               as movable
    from public.work_orders o
    join public.projects p on p.id = o.project_id
    left join public.clients c on c.id = p.client_id
   where o.archived_at is null

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
     and f.type in ('visita', 'aviso');

-- ---------------------------------------------------------------------
-- HISTORIAL · se amplía con material, comunicaciones y cobros
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
        coalesce(' (' || new.supplier || ')', '') || ' en ' || coalesce(v_code, 'un proyecto')
      when TG_OP = 'DELETE' then v_name || ' eliminó el material «' || v_tmp || '»'
      when 'received' = any(v_changed) and new.received then
        v_name || ' marcó como recibido «' || v_tmp || '» de ' || coalesce(v_code, 'un proyecto')
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
    v_summary := v_name || ' comentó en ' || coalesce(v_code, 'una ficha') ||
                 ': ' || left(v_row ->> 'body', 120);

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

do $$
declare t text;
begin
  foreach t in array array['materials', 'material_requests', 'payments'] loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I '
                   'for each row execute function public.trg_audit()', t);
  end loop;
end $$;
