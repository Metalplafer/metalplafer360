-- =====================================================================
-- METALPLAFER360 · 13 · FUNCIONES DE LAS ÓRDENES DE TRABAJO (FASE 4)
--
-- Todas las reglas viven aquí, en la base de datos:
--   · quién puede tocar una orden y cuándo
--   · que una orden futura no se pueda rellenar antes de su fecha
--   · que una devolución lleve siempre un motivo escrito
--   · que el trabajador no pueda cambiar el trabajo a realizar
-- Ningún atajo desde el navegador puede saltárselas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Textos en castellano
--
-- Los estados de las órdenes tienen su propia función porque algunos
-- nombres coinciden con los de las fichas y significan cosas distintas
-- («Realizada» en una orden quiere decir «pendiente de revisión»).
-- ---------------------------------------------------------------------
create or replace function public.order_status_es(p public.order_status) returns text
language sql immutable as $$
  select case p
    when 'pendiente' then 'Pendiente'
    when 'en_curso'  then 'En curso'
    when 'realizada' then 'Realizada · pendiente de revisión'
    when 'validada'  then 'Validada'
    when 'devuelta'  then 'Devuelta'
  end;
$$;

create or replace function public.order_type_es(p public.order_type) returns text
language sql immutable as $$
  select case p when 'fabricacion' then 'Fabricación' else 'Montaje' end;
$$;

/** Horas con formato español y sin ceros de más: 7,5 h · 8 h */
create or replace function public.fmt_hours(n numeric) returns text
language sql immutable as $$
  select replace(
           trim(trailing '.' from trim(trailing '0' from to_char(coalesce(n, 0), 'FM999990.00'))),
           '.', ',') || ' h';
$$;

-- ---------------------------------------------------------------------
-- Código OT-AAAA-### y updated_at
-- ---------------------------------------------------------------------
drop trigger if exists assign_code on public.work_orders;
create trigger assign_code before insert on public.work_orders
  for each row execute function public.trg_assign_code();

drop trigger if exists touch_updated_at on public.work_orders;
create trigger touch_updated_at before update on public.work_orders
  for each row execute function public.trg_touch_updated_at();

drop trigger if exists touch_updated_at on public.work_order_workers;
create trigger touch_updated_at before update on public.work_order_workers
  for each row execute function public.trg_touch_updated_at();

-- ---------------------------------------------------------------------
-- PROTECCIÓN DEL ESTADO DE LA ORDEN
--
-- El estado solo cambia a través de las funciones de más abajo, que
-- comprueban las reglas. Una petición manual que intente escribir
-- «validada» directamente en la tabla se rechaza aquí.
-- ---------------------------------------------------------------------
create or replace function public.trg_work_orders_before() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;

  if TG_OP = 'INSERT' then
    -- Toda orden nueva nace Pendiente, se pida lo que se pida.
    new.status        := 'pendiente';
    new.submitted_at  := null;
    new.validated_at  := null;
    new.validated_by  := null;
    new.returned_at   := null;
    new.return_reason := null;
    return new;
  end if;

  if coalesce(current_setting('app.order_flow', true), '') <> 'on' then
    if new.status is distinct from old.status then
      raise exception 'El estado de la orden se cambia con los botones de revisión, no a mano'
        using errcode = '42501';
    end if;
    if new.submitted_at  is distinct from old.submitted_at
    or new.validated_at  is distinct from old.validated_at
    or new.validated_by  is distinct from old.validated_by
    or new.returned_at   is distinct from old.returned_at
    or new.return_reason is distinct from old.return_reason then
      raise exception 'La revisión de la orden se registra con sus botones, no a mano'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists work_orders_before on public.work_orders;
create trigger work_orders_before before insert or update on public.work_orders
  for each row execute function public.trg_work_orders_before();

-- ---------------------------------------------------------------------
-- ¿QUÉ VE Y QUÉ PUEDE TOCAR UN TRABAJADOR?
-- ---------------------------------------------------------------------

/** ¿Está esta orden asignada a quien pregunta? */
create or replace function public.worker_has_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.work_order_workers w
      join public.work_orders o on o.id = w.order_id
      join public.profiles pr    on pr.id = w.worker_id and pr.active
     where w.order_id = p_order
       and w.worker_id = auth.uid()
       and o.archived_at is null);
$$;

/**
 * ¿Puede rellenarla HOY?
 * Una orden futura se puede consultar, pero no se toca antes de su fecha.
 * Una orden ya validada tampoco se modifica.
 */
create or replace function public.worker_can_edit_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.work_order_workers w
      join public.work_orders o on o.id = w.order_id
      join public.profiles pr    on pr.id = w.worker_id and pr.active
     where w.order_id = p_order
       and w.worker_id = auth.uid()
       and o.archived_at is null
       and o.scheduled_date <= public.today_madrid()
       and o.status in ('pendiente', 'en_curso', 'devuelta'));
$$;

/**
 * Los trabajadores llegan a los proyectos a través de sus órdenes.
 * (En la fase 3 esta función devolvía siempre «false»: aquí se amplía.)
 */
create or replace function public.worker_can_see_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.work_orders o
      join public.work_order_workers w on w.order_id = o.id
      join public.profiles pr on pr.id = w.worker_id and pr.active
     where o.project_id = p_project
       and w.worker_id = auth.uid()
       and o.archived_at is null);
$$;

/** ¿Comparte alguna orden con esta persona? (para ver el nombre del compañero) */
create or replace function public.shares_order_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.work_order_workers a
      join public.work_order_workers b on b.order_id = a.order_id
     where a.worker_id = auth.uid()
       and b.worker_id = p_user);
$$;

/**
 * Un trabajador ve a un cliente si tiene una visita o un aviso suyo,
 * o si tiene una orden de un proyecto de ese cliente.
 */
create or replace function public.worker_can_see_client(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fichas f
                  where f.client_id = p_client and public.worker_has_ficha(f.id))
      or exists (select 1 from public.projects p
                  where p.client_id = p_client and public.worker_can_see_project(p.id));
$$;

-- ---------------------------------------------------------------------
-- EQUIPO DE LA ORDEN
--
-- Los nombres de quienes están asignados a una orden, SIN sus horas:
-- un trabajador sabe con quién va, pero no cuánto ficha su compañero.
-- La comprobación de permisos va dentro de la propia vista.
-- ---------------------------------------------------------------------
drop view if exists public.order_team;
create view public.order_team as
  select w.order_id,
         w.worker_id,
         p.full_name,
         (w.submitted_at is not null) as submitted
    from public.work_order_workers w
    join public.profiles p on p.id = w.worker_id
   where public.is_admin() or public.worker_has_order(w.order_id);

-- ---------------------------------------------------------------------
-- AVISOS INTERNOS (nunca por correo electrónico)
-- ---------------------------------------------------------------------
create or replace function public.notify_user(
  p_user uuid, p_kind public.notification_kind,
  p_title text, p_body text default null, p_order uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Nadie se avisa a sí mismo de lo que acaba de hacer.
  if p_user is null or p_user = auth.uid() then return; end if;

  insert into public.notifications (user_id, kind, title, body, order_id, is_demo)
  select p_user, p_kind, p_title, p_body, p_order,
         coalesce((select o.is_demo from public.work_orders o where o.id = p_order), false)
   where exists (select 1 from public.profiles where id = p_user and active);
end $$;

/** Avisa a todos los administradores activos. */
create or replace function public.notify_admins(
  p_kind public.notification_kind, p_title text,
  p_body text default null, p_order uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles where role = 'admin' and active loop
    perform public.notify_user(r.id, p_kind, p_title, p_body, p_order);
  end loop;
end $$;

/** Avisa a todos los trabajadores de una orden. */
create or replace function public.notify_order_workers(
  p_order uuid, p_kind public.notification_kind, p_title text, p_body text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select worker_id from public.work_order_workers where order_id = p_order loop
    perform public.notify_user(r.worker_id, p_kind, p_title, p_body, p_order);
  end loop;
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if auth.uid() is null then
    raise exception 'No tienes permisos para realizar esta acción' using errcode = '42501';
  end if;

  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_ids is null or id = any(p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Texto de apoyo para los avisos: «OT-2026-004 · Montaje · 12/05/2026»
-- ---------------------------------------------------------------------
create or replace function public.order_caption(p_order uuid) returns text
language sql stable security definer set search_path = public as $$
  select o.code || ' · ' || public.order_type_es(o.type) || ' · ' ||
         to_char(o.scheduled_date, 'DD/MM/YYYY') ||
         coalesce(' · ' || p.name, '')
    from public.work_orders o
    left join public.projects p on p.id = o.project_id
   where o.id = p_order;
$$;

-- ---------------------------------------------------------------------
-- RECALCULAR EL ESTADO SEGÚN LOS PARTES
--
--   · Todos los partes enviados  → Realizada · pendiente de revisión
--   · Falta alguno por enviar    → En curso
-- No existe «Iniciar orden»: una orden pasa a «En curso» cuando alguien
-- empieza a rellenar su parte, no por pulsar un botón ni por un reloj.
-- ---------------------------------------------------------------------
create or replace function public.recompute_order_status(p_order uuid) returns public.order_status
language plpgsql security definer set search_path = public as $$
declare
  v_status public.order_status;
  v_total int; v_sent int; v_touched int;
begin
  select status into v_status from public.work_orders where id = p_order for update;
  if not found then return null; end if;

  -- Los estados finales no se recalculan solos.
  if v_status = 'validada' then return v_status; end if;

  select count(*),
         count(*) filter (where submitted_at is not null),
         count(*) filter (where submitted_at is not null
                             or coalesce(hours, 0) > 0
                             or length(trim(coalesce(work_done, ''))) > 0)
    into v_total, v_sent, v_touched
    from public.work_order_workers where order_id = p_order;

  perform set_config('app.order_flow', 'on', true);

  if v_total > 0 and v_sent = v_total then
    update public.work_orders
       set status = 'realizada', submitted_at = coalesce(submitted_at, now())
     where id = p_order and status <> 'realizada';
    v_status := 'realizada';
  elsif v_touched > 0 then
    update public.work_orders
       set status = 'en_curso', submitted_at = null
     where id = p_order and status <> 'en_curso';
    v_status := 'en_curso';
  elsif v_status <> 'devuelta' then
    update public.work_orders
       set status = 'pendiente', submitted_at = null
     where id = p_order and status <> 'pendiente';
    v_status := 'pendiente';
  end if;

  perform set_config('app.order_flow', 'off', true);
  return v_status;
end $$;

-- ---------------------------------------------------------------------
-- ASIGNAR TRABAJADORES (solo administración)
--
-- Varios a la vez y sin responsable principal. No se puede quitar a
-- alguien que ya ha registrado horas: se perdería su trabajo.
-- ---------------------------------------------------------------------
create or replace function public.assign_order_workers(p_order uuid, p_workers uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.work_orders;
  v_list uuid[] := coalesce(p_workers, '{}');
  v_name text; r record;
begin
  perform public.assert_admin();

  select * into o from public.work_orders where id = p_order for update;
  if not found then raise exception 'No se encuentra la orden de trabajo' using errcode = 'P0002'; end if;
  if o.archived_at is not null then
    raise exception 'La orden está archivada' using errcode = '22023';
  end if;

  -- Todos deben ser trabajadores o administradores activos.
  for r in select unnest(v_list) as id loop
    if not exists (select 1 from public.profiles where id = r.id and active) then
      raise exception 'Una de las personas seleccionadas no existe o está desactivada'
        using errcode = '22023';
    end if;
  end loop;

  -- No se borra trabajo hecho.
  for r in select w.worker_id, p.full_name
             from public.work_order_workers w
             join public.profiles p on p.id = w.worker_id
            where w.order_id = p_order
              and not (w.worker_id = any(v_list))
              and (w.submitted_at is not null or coalesce(w.hours, 0) > 0
                   or length(trim(coalesce(w.work_done, ''))) > 0) loop
    raise exception '% ya ha registrado trabajo en esta orden: no se le puede quitar',
      r.full_name using errcode = '22023';
  end loop;

  delete from public.work_order_workers
   where order_id = p_order and not (worker_id = any(v_list));

  for r in select unnest(v_list) as id loop
    if not exists (select 1 from public.work_order_workers
                    where order_id = p_order and worker_id = r.id) then
      insert into public.work_order_workers (order_id, worker_id, is_demo)
      values (p_order, r.id, o.is_demo);

      perform public.notify_user(r.id, 'orden_asignada',
        'Nueva orden asignada', public.order_caption(p_order), p_order);
    end if;
  end loop;

  perform public.recompute_order_status(p_order);
end $$;

-- ---------------------------------------------------------------------
-- EL PARTE DEL TRABAJADOR
--
--   p_submit = false → guarda sin enviar (puede seguir corrigiendo)
--   p_submit = true  → envía: la orden queda pendiente de revisión
--
-- El trabajo a realizar (la descripción de administración) no se toca
-- desde aquí: solo se añade el trabajo realizado.
-- ---------------------------------------------------------------------
create or replace function public.save_order_part(
  p_order uuid, p_work_done text, p_hours numeric, p_submit boolean default false)
returns public.work_orders language plpgsql security definer set search_path = public as $$
declare
  o public.work_orders;
  w public.work_order_workers;
  v_hours numeric := round(coalesce(p_hours, 0)::numeric, 2);
  v_done  text    := nullif(trim(coalesce(p_work_done, '')), '');
begin
  select * into o from public.work_orders where id = p_order for update;
  if not found then raise exception 'No se encuentra la orden de trabajo' using errcode = 'P0002'; end if;

  select * into w from public.work_order_workers
   where order_id = p_order and worker_id = auth.uid();
  if not found then
    raise exception 'Esta orden no está asignada a ti' using errcode = '42501';
  end if;

  if o.archived_at is not null then
    raise exception 'La orden está archivada' using errcode = '22023';
  end if;

  if o.scheduled_date > public.today_madrid() then
    raise exception 'Esta orden es del % : todavía no se puede rellenar',
      to_char(o.scheduled_date, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  if o.status = 'validada' then
    raise exception 'La orden ya está validada: no se puede modificar' using errcode = '22023';
  end if;

  if o.status = 'realizada' then
    raise exception 'La orden ya está enviada y pendiente de revisión' using errcode = '22023';
  end if;

  if v_hours < 0 or v_hours > 24 then
    raise exception 'Las horas deben estar entre 0 y 24' using errcode = '22023';
  end if;

  if p_submit then
    if v_done is null then
      raise exception 'Escribe el trabajo realizado antes de enviar la orden' using errcode = '22023';
    end if;
    if v_hours <= 0 then
      raise exception 'Indica las horas trabajadas antes de enviar la orden' using errcode = '22023';
    end if;
  end if;

  update public.work_order_workers
     set work_done    = v_done,
         hours        = nullif(v_hours, 0),
         submitted_at = case when p_submit then now() else null end
   where order_id = p_order and worker_id = auth.uid();

  perform public.recompute_order_status(p_order);

  select * into o from public.work_orders where id = p_order;

  if p_submit and o.status = 'realizada' then
    perform public.notify_admins('orden_enviada', 'Orden pendiente de revisión',
      public.actor_name() || ' ha enviado ' || public.order_caption(p_order), p_order);
  end if;

  return o;
end $$;

-- ---------------------------------------------------------------------
-- REVISIÓN (solo administración)
-- ---------------------------------------------------------------------
create or replace function public.validate_order(p_order uuid)
returns public.work_orders language plpgsql security definer set search_path = public as $$
declare o public.work_orders;
begin
  perform public.assert_admin();

  select * into o from public.work_orders where id = p_order for update;
  if not found then raise exception 'No se encuentra la orden de trabajo' using errcode = 'P0002'; end if;

  if o.status <> 'realizada' then
    raise exception 'Solo se valida una orden que esté pendiente de revisión' using errcode = '22023';
  end if;

  perform set_config('app.order_flow', 'on', true);
  update public.work_orders
     set status = 'validada', validated_at = now(), validated_by = auth.uid()
   where id = p_order
  returning * into o;
  perform set_config('app.order_flow', 'off', true);

  perform public.notify_order_workers(p_order, 'validacion',
    'Orden validada', public.order_caption(p_order));

  return o;
end $$;

/**
 * DEVOLVER: siempre con motivo escrito.
 * El motivo se guarda en la orden y además se publica como comentario,
 * para que quede en el historial de la conversación.
 */
create or replace function public.return_order(p_order uuid, p_reason text)
returns public.work_orders language plpgsql security definer set search_path = public as $$
declare
  o public.work_orders;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.assert_admin();

  if v_reason is null then
    raise exception 'Escribe el motivo de la devolución' using errcode = '22023';
  end if;

  select * into o from public.work_orders where id = p_order for update;
  if not found then raise exception 'No se encuentra la orden de trabajo' using errcode = 'P0002'; end if;

  if o.status not in ('realizada', 'validada') then
    raise exception 'Solo se devuelve una orden que ya se haya enviado' using errcode = '22023';
  end if;

  perform set_config('app.order_flow', 'on', true);
  update public.work_orders
     set status = 'devuelta', returned_at = now(), return_reason = v_reason,
         submitted_at = null, validated_at = null, validated_by = null
   where id = p_order
  returning * into o;
  perform set_config('app.order_flow', 'off', true);

  -- Los partes vuelven a estar abiertos para corregirlos.
  update public.work_order_workers set submitted_at = null where order_id = p_order;

  insert into public.comments (order_id, author_id, body, is_demo)
  values (p_order, auth.uid(), 'Orden devuelta. Motivo: ' || v_reason, o.is_demo);

  perform public.notify_order_workers(p_order, 'devolucion',
    'Orden devuelta', v_reason);

  return o;
end $$;

-- ---------------------------------------------------------------------
-- PAPELERA DE DOCUMENTOS · se amplía para las fotos del trabajador
-- Un trabajador puede retirar una fotografía suya mientras la orden
-- siga abierta. Nada más.
-- ---------------------------------------------------------------------
create or replace function public.trash_document(p_doc uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.documents;
begin
  select * into d from public.documents where id = p_doc and deleted_at is null;
  if not found then
    raise exception 'El documento no existe o ya está en la papelera' using errcode = 'P0002';
  end if;

  if not (public.is_admin() or public.is_service_context()
          or (d.order_id is not null
              and d.uploaded_by = auth.uid()
              and public.worker_can_edit_order(d.order_id))) then
    raise exception 'No tienes permisos para realizar esta acción' using errcode = '42501';
  end if;

  update public.documents
     set deleted_at = now(), deleted_by = auth.uid()
   where id = p_doc;
end $$;

-- ---------------------------------------------------------------------
-- AVISOS AUTOMÁTICOS AL COMENTAR UNA ORDEN
-- ---------------------------------------------------------------------
create or replace function public.trg_comments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_body text;
begin
  if new.order_id is null then return new; end if;
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;

  v_title := 'Comentario en ' || coalesce((select code from public.work_orders where id = new.order_id), 'una orden');
  v_body  := public.actor_name() || ': ' || left(new.body, 160);

  if public.is_admin() then
    perform public.notify_order_workers(new.order_id, 'comentario', v_title, v_body);
  else
    perform public.notify_admins('comentario', v_title, v_body, new.order_id);
  end if;

  return new;
end $$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments
  for each row execute function public.trg_comments_notify();

-- ---------------------------------------------------------------------
-- SUGERENCIAS DE CAMBIO DE FASE · ahora miran también las órdenes
-- Solo SUGIEREN: nunca cambian nada por su cuenta.
-- ---------------------------------------------------------------------
create or replace view public.v_phase_suggestions with (security_invoker = true) as
  select p.id as project_id, p.code, p.name, p.phase,
         'finalizado'::public.project_phase as suggested_phase,
         'El proyecto está cobrado. Ya puedes finalizarlo.' as message
    from public.projects p
   where p.archived_at is null
     and p.phase = 'facturacion'
     and p.billing_status = 'cobrado'

  union all
  -- Fabricación terminada: todas sus órdenes de fabricación validadas.
  select p.id, p.code, p.name, p.phase,
         case when p.no_assembly then 'facturacion' else 'montaje' end::public.project_phase,
         'Todas las órdenes de fabricación están validadas. ' ||
         case when p.no_assembly then 'Ya puedes pasar a Facturación.'
              else 'Ya puedes pasar a Montaje.' end
    from public.projects p
   where p.archived_at is null
     and p.phase = 'fabricacion'
     and exists (select 1 from public.work_orders o
                  where o.project_id = p.id and o.type = 'fabricacion' and o.archived_at is null)
     and not exists (select 1 from public.work_orders o
                      where o.project_id = p.id and o.type = 'fabricacion'
                        and o.archived_at is null and o.status <> 'validada')

  union all
  -- Montaje terminado: todas sus órdenes de montaje validadas.
  select p.id, p.code, p.name, p.phase,
         'facturacion'::public.project_phase,
         'Todas las órdenes de montaje están validadas. Ya puedes pasar a Facturación.'
    from public.projects p
   where p.archived_at is null
     and p.phase = 'montaje'
     and exists (select 1 from public.work_orders o
                  where o.project_id = p.id and o.type = 'montaje' and o.archived_at is null)
     and not exists (select 1 from public.work_orders o
                      where o.project_id = p.id and o.type = 'montaje'
                        and o.archived_at is null and o.status <> 'validada');

-- ---------------------------------------------------------------------
-- HISTORIAL · se amplía con las órdenes y los partes
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
        null   -- la devolución ya se registra en la orden
      when 'hours' = any(v_changed) or 'work_done' = any(v_changed) then
        coalesce(v_tmp, 'Alguien') || ' guardó su parte de la orden ' || coalesce(v_code, '') ||
        ' (' || public.fmt_hours(new.hours) || ')'
      else null end;

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
  foreach t in array array['work_orders', 'work_order_workers'] loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I '
                   'for each row execute function public.trg_audit()', t);
  end loop;
end $$;
