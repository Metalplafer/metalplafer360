-- =====================================================================
-- METALPLAFER360 · 27 · FUNCIONES DE PROYECTOS, TRABAJADORES Y PARTES
--
-- Ejecutar después del archivo 26.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) ETIQUETAS EN CASTELLANO
-- ---------------------------------------------------------------------
create or replace function public.report_status_es(p public.report_status) returns text
language sql immutable as $$
  select case p
    when 'borrador'  then 'Sin enviar'
    when 'enviado'   then 'Pendiente de validación'
    when 'validado'  then 'Validado'
    when 'rechazado' then 'Rechazado'
  end $$;


-- ---------------------------------------------------------------------
-- 2) ¿QUIÉN PUEDE VER QUÉ?
--
-- Esta función ya existía y es la que usan los permisos de documentos,
-- comentarios, subestados y el almacenamiento. Solo le cambiamos el
-- cuerpo: ahora el acceso lo da la ASIGNACIÓN AL PROYECTO.
--
-- Se mantiene además el camino antiguo (tener una orden del proyecto)
-- para no romper lo que ya está funcionando mientras las órdenes sigan
-- existiendo.
-- ---------------------------------------------------------------------
create or replace function public.worker_can_see_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    -- Vía nueva: asignado al proyecto.
    select 1
      from public.project_workers pw
      join public.profiles pr on pr.id = pw.worker_id and pr.active
     where pw.project_id = p_project
       and pw.worker_id = auth.uid())
  or exists (
    -- Vía anterior: tiene una orden de ese proyecto.
    select 1
      from public.work_orders o
      join public.work_order_workers w on w.order_id = o.id
      join public.profiles pr on pr.id = w.worker_id and pr.active
     where o.project_id = p_project
       and w.worker_id = auth.uid()
       and o.archived_at is null);
$$;

/** ¿Comparte algún proyecto con esta persona? (para ver su nombre) */
create or replace function public.shares_project_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.project_workers a
      join public.project_workers b on b.project_id = a.project_id
     where a.worker_id = auth.uid()
       and b.worker_id = p_user);
$$;

-- ---------------------------------------------------------------------
-- AVISOS DE UN PARTE
--
-- Son los hermanos de «notify_user» y «notify_admins», que solo saben
-- colgar el aviso de una orden. Estos lo cuelgan de un parte. Se añaden
-- aparte para no cambiarle la firma a los que ya existen, que están
-- nombrados uno a uno en los permisos del archivo 14.
-- ---------------------------------------------------------------------
create or replace function public.notify_user_report(
  p_user uuid, p_kind public.notification_kind,
  p_title text, p_body text default null, p_report uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Nadie se avisa a sí mismo de lo que acaba de hacer.
  if p_user is null or p_user = auth.uid() then return; end if;

  insert into public.notifications (user_id, kind, title, body, report_id, is_demo)
  select p_user, p_kind, p_title, p_body, p_report,
         coalesce((select r.is_demo from public.work_reports r where r.id = p_report), false)
   where exists (select 1 from public.profiles where id = p_user and active);
end $$;

create or replace function public.notify_admins_report(
  p_kind public.notification_kind, p_title text,
  p_body text default null, p_report uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles where role = 'admin' and active loop
    perform public.notify_user_report(r.id, p_kind, p_title, p_body, p_report);
  end loop;
end $$;


/** ¿Es un parte mío? */
create or replace function public.owns_report(p_report uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.work_reports
                  where id = p_report and worker_id = auth.uid());
$$;

/**
 * ¿Puedo todavía tocar este parte?
 * Sí mientras no esté validado. Una vez validado queda bloqueado.
 */
create or replace function public.worker_can_edit_report(p_report uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.work_reports r
      join public.profiles pr on pr.id = r.worker_id and pr.active
     where r.id = p_report
       and r.worker_id = auth.uid()
       and r.status <> 'validado');
$$;


-- ---------------------------------------------------------------------
-- 3) ASIGNAR TRABAJADORES A UN PROYECTO (solo administración)
--
-- Se manda la lista COMPLETA de quién debe estar: se añaden los que
-- faltan y se quitan los que sobran, como ya se hace con las órdenes.
-- ---------------------------------------------------------------------
create or replace function public.assign_project_workers(p_project uuid, p_workers uuid[])
returns setof public.profiles language plpgsql security definer set search_path = public as $$
declare
  v_project public.projects;
  v_ids uuid[] := coalesce(p_workers, '{}');
  v_nuevos uuid[];
  w uuid;
begin
  perform public.assert_admin();

  select * into v_project from public.projects where id = p_project;
  if not found then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;

  -- Solo personas activas con perfil de trabajador o de administración.
  if exists (select 1 from unnest(v_ids) u(id)
              where not exists (select 1 from public.profiles pr
                                 where pr.id = u.id and pr.active)) then
    raise exception 'Alguna de las personas no existe o está desactivada' using errcode = '22023';
  end if;

  -- Quién entra nuevo (para avisarle solo a él).
  select coalesce(array_agg(u.id), '{}') into v_nuevos
    from unnest(v_ids) u(id)
   where not exists (select 1 from public.project_workers pw
                      where pw.project_id = p_project and pw.worker_id = u.id);

  delete from public.project_workers
   where project_id = p_project and worker_id <> all(v_ids);

  insert into public.project_workers (project_id, worker_id, assigned_by, is_demo)
  select p_project, u.id, auth.uid(), v_project.is_demo
    from unnest(v_ids) u(id)
  on conflict (project_id, worker_id) do nothing;

  foreach w in array v_nuevos loop
    perform public.notify_user(w, 'proyecto_asignado', 'Proyecto asignado',
      v_project.code || ' · ' || v_project.name, null);
  end loop;

  return query
    select pr.* from public.profiles pr
     where pr.id = any(v_ids)
     order by pr.full_name;
end $$;


-- ---------------------------------------------------------------------
-- 4) GUARDAR UN PARTE (lo hace el trabajador)
--
-- Un solo punto de entrada: si no se pasa identificador, se crea; si se
-- pasa, se modifica. Con «p_submit» se envía a validar.
--
-- LAS HORAS SON SIEMPRE LAS DE QUIEN RELLENA EL PARTE.
-- ---------------------------------------------------------------------
create or replace function public.save_work_report(
  p_report        uuid    default null,
  p_project       uuid    default null,
  p_work_type     public.order_type default 'fabricacion',
  p_work_date     date    default null,
  p_work_done     text    default null,
  p_hours         numeric default null,
  p_needs_material boolean default false,
  p_submit        boolean default false)
returns public.work_reports language plpgsql security definer set search_path = public as $$
declare
  r public.work_reports;
  v_hours numeric := case when p_hours is null then null else round(p_hours::numeric, 2) end;
  v_done  text    := nullif(trim(coalesce(p_work_done, '')), '');
  v_date  date    := coalesce(p_work_date, public.today_madrid());
  v_estado public.report_status;
begin
  if auth.uid() is null then
    raise exception 'Hace falta tener la sesión iniciada' using errcode = '42501';
  end if;

  if v_hours is not null and (v_hours <= 0 or v_hours > 24) then
    raise exception 'Las horas deben estar entre 0 y 24' using errcode = '22023';
  end if;

  if v_date > public.today_madrid() then
    raise exception 'No se puede rellenar un parte de un día que todavía no ha llegado'
      using errcode = '22023';
  end if;

  -- El proyecto, si se indica, tiene que ser uno al que se tenga acceso.
  if p_project is not null and not (public.is_admin() or public.worker_can_see_project(p_project)) then
    raise exception 'Ese proyecto no está asignado a ti' using errcode = '42501';
  end if;

  if p_submit then
    if v_done is null then
      raise exception 'Escribe qué trabajo has hecho antes de enviar el parte' using errcode = '22023';
    end if;
    if v_hours is null or v_hours <= 0 then
      raise exception 'Indica las horas que has trabajado antes de enviar el parte' using errcode = '22023';
    end if;
  end if;

  v_estado := case when p_submit then 'enviado'::public.report_status
                   else 'borrador'::public.report_status end;

  -- ---------------- Parte nuevo ----------------
  if p_report is null then
    insert into public.work_reports
      (code, worker_id, project_id, work_type, work_date, work_done, hours,
       needs_material, status, submitted_at, is_demo)
    values (public.next_code('PT'), auth.uid(), p_project, p_work_type, v_date,
            v_done, v_hours, coalesce(p_needs_material, false), v_estado,
            case when p_submit then now() else null end,
            coalesce((select is_demo from public.profiles where id = auth.uid()), false))
    returning * into r;

  -- ---------------- Parte que ya existía ----------------
  else
    select * into r from public.work_reports where id = p_report for update;
    if not found then
      raise exception 'No se encuentra el parte de trabajo' using errcode = 'P0002';
    end if;

    if r.worker_id <> auth.uid() then
      raise exception 'Ese parte no es tuyo' using errcode = '42501';
    end if;

    if r.status = 'validado' then
      raise exception 'El parte ya está validado: no se puede modificar' using errcode = '22023';
    end if;

    update public.work_reports
       set project_id     = coalesce(p_project, project_id),
           work_type      = p_work_type,
           work_date      = v_date,
           work_done      = v_done,
           hours          = v_hours,
           needs_material = coalesce(p_needs_material, false),
           status         = v_estado,
           submitted_at   = case when p_submit then now() else null end,
           -- Al corregir y reenviar, el rechazo anterior deja de aplicar.
           rejected_at    = case when p_submit then null else rejected_at end,
           reject_reason  = case when p_submit then null else reject_reason end,
           updated_at     = now()
     where id = p_report
    returning * into r;
  end if;

  if p_submit then
    perform public.notify_admins_report('parte_enviado', 'Parte pendiente de validación',
      public.actor_name() || ' ha enviado el parte ' || r.code ||
      ' (' || public.fmt_hours(r.hours) || ')', r.id);
  end if;

  return r;
end $$;


-- ---------------------------------------------------------------------
-- 5) REVISIÓN (solo administración)
-- ---------------------------------------------------------------------
create or replace function public.validate_work_report(p_report uuid)
returns public.work_reports language plpgsql security definer set search_path = public as $$
declare r public.work_reports;
begin
  perform public.assert_admin();

  select * into r from public.work_reports where id = p_report for update;
  if not found then
    raise exception 'No se encuentra el parte de trabajo' using errcode = 'P0002';
  end if;

  if r.status <> 'enviado' then
    raise exception 'Solo se valida un parte que esté pendiente de validación'
      using errcode = '22023';
  end if;

  update public.work_reports
     set status = 'validado', validated_at = now(), validated_by = auth.uid(),
         rejected_at = null, reject_reason = null, updated_at = now()
   where id = p_report
  returning * into r;

  perform public.notify_user_report(r.worker_id, 'parte_validado', 'Parte validado',
    r.code || ' · ' || public.fmt_hours(r.hours), r.id);

  return r;
end $$;

/**
 * RECHAZAR: siempre con motivo escrito.
 * El motivo se guarda en el parte y además se publica como comentario,
 * para que quede dentro de la conversación y no solo en el historial.
 */
create or replace function public.reject_work_report(p_report uuid, p_reason text)
returns public.work_reports language plpgsql security definer set search_path = public as $$
declare
  r public.work_reports;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.assert_admin();

  if v_reason is null then
    raise exception 'Escribe el motivo del rechazo' using errcode = '22023';
  end if;

  select * into r from public.work_reports where id = p_report for update;
  if not found then
    raise exception 'No se encuentra el parte de trabajo' using errcode = 'P0002';
  end if;

  if r.status not in ('enviado', 'validado') then
    raise exception 'Solo se rechaza un parte que ya se haya enviado' using errcode = '22023';
  end if;

  update public.work_reports
     set status = 'rechazado', rejected_at = now(), reject_reason = v_reason,
         validated_at = null, validated_by = null, updated_at = now()
   where id = p_report
  returning * into r;

  insert into public.comments (report_id, author_id, body, target_worker_id, is_demo)
  values (p_report, auth.uid(), 'Parte rechazado. Motivo: ' || v_reason, r.worker_id, r.is_demo);

  perform public.notify_user_report(r.worker_id, 'parte_rechazado', 'Parte rechazado',
    v_reason, r.id);

  return r;
end $$;

/**
 * ASIGNAR UN PARTE A UN PROYECTO.
 * Para los partes que nacieron sin proyecto. A partir de ese momento
 * forman parte del historial del proyecto, y si se validan, sus horas
 * cuentan en la fase que corresponda.
 */
create or replace function public.assign_report_to_project(p_report uuid, p_project uuid)
returns public.work_reports language plpgsql security definer set search_path = public as $$
declare r public.work_reports; v_project public.projects;
begin
  perform public.assert_admin();

  select * into r from public.work_reports where id = p_report for update;
  if not found then
    raise exception 'No se encuentra el parte de trabajo' using errcode = 'P0002';
  end if;

  if p_project is not null then
    select * into v_project from public.projects where id = p_project;
    if not found then
      raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
    end if;
  end if;

  update public.work_reports
     set project_id  = p_project,
         assigned_at = case when p_project is null then null else now() end,
         assigned_by = case when p_project is null then null else auth.uid() end,
         updated_at  = now()
   where id = p_report
  returning * into r;

  return r;
end $$;


-- ---------------------------------------------------------------------
-- 6) HORAS: SOLO CUENTAN LAS VALIDADAS
--
-- Antes, las horas se sumaban en cuanto el trabajador las enviaba. Ahora
-- no: hasta que administración no valida, el proyecto sigue a cero.
--
-- Esta vista reúne las dos procedencias (partes y las órdenes que
-- todavía existen) aplicando la misma regla a las dos. Cuando se retiren
-- las órdenes, basta con quitar la segunda mitad.
-- ---------------------------------------------------------------------
create or replace view public.hours_worked with (security_invoker = true) as
  select r.id          as source_id,
         'parte'::text as origen,
         r.worker_id,
         r.project_id,
         r.work_type,
         r.work_date,
         r.hours
    from public.work_reports r
   where r.status = 'validado' and r.hours is not null
  union all
  select o.id, 'orden', w.worker_id, o.project_id, o.type, o.scheduled_date, w.hours
    from public.work_orders o
    join public.work_order_workers w on w.order_id = o.id
   where o.status = 'validada' and o.archived_at is null and w.hours is not null;

comment on view public.hours_worked is
  'Horas realmente trabajadas: SOLO las validadas por administración.';

/** Previstas contra realizadas, por proyecto. */
create or replace view public.project_hours with (security_invoker = true) as
  select p.id as project_id,
         p.budget_hours_fab  as previstas_fab,
         p.budget_hours_mont as previstas_mont,
         p.budget_hours_fab + p.budget_hours_mont as previstas_total,
         coalesce(sum(h.hours) filter (where h.work_type = 'fabricacion'), 0) as realizadas_fab,
         coalesce(sum(h.hours) filter (where h.work_type = 'montaje'), 0)     as realizadas_mont,
         coalesce(sum(h.hours), 0)                                           as realizadas_total
    from public.projects p
    left join public.hours_worked h on h.project_id = p.id
   group by p.id, p.budget_hours_fab, p.budget_hours_mont;

/** Resumen de partes de un proyecto, para la pantalla del proyecto. */
create or replace view public.project_reports with (security_invoker = true) as
  select r.project_id,
         count(*)                                         as total,
         count(*) filter (where r.status = 'enviado')     as por_validar,
         count(*) filter (where r.status = 'validado')    as validados,
         count(*) filter (where r.status = 'rechazado')   as rechazados,
         coalesce(sum(r.hours) filter (where r.status = 'validado'), 0) as horas_validadas
    from public.work_reports r
   where r.project_id is not null
   group by r.project_id;


-- ---------------------------------------------------------------------
-- 7) LO QUE VE EL TRABAJADOR DE UN PROYECTO
--
-- Esta vista existe por una razón de seguridad, no de comodidad.
--
-- RLS filtra FILAS, no columnas: si al trabajador se le deja ver la fila
-- del proyecto, puede pedir cualquier columna, incluido el importe y la
-- paga y señal. Así que el trabajador NO lee «projects» (el archivo 28
-- se lo cierra) y lee esta vista, que sencillamente no tiene esas
-- columnas. No es que no se le enseñen: es que no existen aquí.
--
-- La vista se ejecuta con los permisos de su dueño (no lleva
-- «security_invoker»), y el filtro de quién ve qué está dentro.
-- «security_barrier» impide que una condición astuta se cuele antes.
-- ---------------------------------------------------------------------
create or replace view public.worker_projects with (security_barrier = true) as
  select p.id,
         p.code,
         p.name,
         p.description,
         p.measures,
         p.finish,
         p.location,
         p.address,
         p.observations,
         p.phase,
         p.no_assembly,
         p.budget_hours_fab,
         p.budget_hours_mont,
         p.client_id,
         c.name as client_name,
         p.archived_at,
         p.finished_at,
         p.created_at,
         p.updated_at
    from public.projects p
    left join public.clients c on c.id = p.client_id
   where public.is_admin() or public.worker_can_see_project(p.id);

comment on view public.worker_projects is
  'El proyecto tal como lo ve un trabajador: sin importe, sin paga y señal y sin facturación.';

/** Los compañeros asignados a un proyecto (nombres, nada más). */
create or replace view public.project_team with (security_barrier = true) as
  select pw.project_id, pr.id as worker_id, pr.full_name, pr.role
    from public.project_workers pw
    join public.profiles pr on pr.id = pw.worker_id
   where pr.active
     and (public.is_admin() or public.worker_can_see_project(pw.project_id));


-- ---------------------------------------------------------------------
-- 8) NÚMERO Y COHERENCIA DE CADA PARTE
-- ---------------------------------------------------------------------
create or replace function public.trg_work_reports_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if new.code is null or trim(new.code) = '' then
      new.code := public.next_code('PT');
    end if;
  else
    -- El número identifica el parte para siempre.
    if new.code is distinct from old.code
       and coalesce(current_setting('app.restoring', true), '') <> 'on' then
      raise exception 'El número de un parte no se puede cambiar' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;

  -- Coherencia de las marcas de tiempo con el estado.
  if new.status <> 'validado' then
    new.validated_at := null; new.validated_by := null;
  end if;
  if new.status <> 'rechazado' then
    new.rejected_at := null; new.reject_reason := null;
  end if;
  if new.status = 'borrador' then
    new.submitted_at := null;
  end if;

  return new;
end $$;

drop trigger if exists work_reports_before on public.work_reports;
create trigger work_reports_before before insert or update on public.work_reports
  for each row execute function public.trg_work_reports_before();


-- ---------------------------------------------------------------------
-- 9) AVISOS DE UN COMENTARIO
--
-- Se rehace para que entienda también los comentarios de un PROYECTO y
-- de un PARTE, y sobre todo los comentarios DIRIGIDOS a una persona:
-- los lee todo el mundo, pero el aviso le llega solo a ella.
-- ---------------------------------------------------------------------
create or replace function public.trg_comments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_body text; v_donde text;
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;

  v_body := public.actor_name() || ': ' || left(new.body, 160);

  -- Dirigido a una persona concreta: solo ella recibe el aviso.
  if new.target_worker_id is not null then
    if new.target_worker_id <> auth.uid() then
      select coalesce(
        (select code from public.projects    where id = new.project_id),
        (select code from public.work_reports where id = new.report_id),
        (select code from public.work_orders  where id = new.order_id),
        (select code from public.fichas       where id = new.ficha_id))
        into v_donde;
      if new.report_id is not null then
        perform public.notify_user_report(new.target_worker_id, 'comentario',
          'Comentario para ti en ' || coalesce(v_donde, 'un proyecto'), v_body, new.report_id);
      else
        perform public.notify_user(new.target_worker_id, 'comentario',
          'Comentario para ti en ' || coalesce(v_donde, 'un proyecto'), v_body, new.order_id);
      end if;
    end if;
    return new;
  end if;

  -- Comentario en un PARTE.
  if new.report_id is not null then
    v_title := 'Comentario en ' ||
      coalesce((select code from public.work_reports where id = new.report_id), 'un parte');
    if public.is_admin() then
      perform public.notify_user_report(
        (select worker_id from public.work_reports where id = new.report_id),
        'comentario', v_title, v_body, new.report_id);
    else
      perform public.notify_admins_report('comentario', v_title, v_body, new.report_id);
    end if;
    return new;
  end if;

  -- Comentario en un PROYECTO: a todos los asignados menos a quien escribe.
  if new.project_id is not null then
    v_title := 'Comentario en ' ||
      coalesce((select code from public.projects where id = new.project_id), 'un proyecto');
    if public.is_admin() then
      perform public.notify_user(pw.worker_id, 'comentario', v_title, v_body, null)
        from public.project_workers pw
       where pw.project_id = new.project_id and pw.worker_id <> auth.uid();
    else
      perform public.notify_admins('comentario', v_title, v_body, null);
    end if;
    return new;
  end if;

  -- Comentario en una ORDEN: como hasta ahora.
  if new.order_id is not null then
    v_title := 'Comentario en ' ||
      coalesce((select code from public.work_orders where id = new.order_id), 'una orden');
    if public.is_admin() then
      perform public.notify_order_workers(new.order_id, 'comentario', v_title, v_body);
    else
      perform public.notify_admins('comentario', v_title, v_body, new.order_id);
    end if;
  end if;

  return new;
end $$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments
  for each row execute function public.trg_comments_notify();


-- ---------------------------------------------------------------------
-- 10) HISTORIAL
--
-- Cada fase del proyecto amplía «trg_audit» con sus propias frases, y
-- esta hace lo mismo: se parte de la versión del archivo 16 y se le
-- añaden las ramas de los partes y de las asignaciones. Sin esto, el
-- historial escribiría «Juan insert work_reports», que no le dice nada
-- a nadie.
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

-- Las dos tablas nuevas pasan a quedar anotadas en el historial.
do $$
declare t text;
begin
  foreach t in array array['work_reports', 'project_workers'] loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I '
                   'for each row execute function public.trg_audit()', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 11) «FALTA MATERIAL» DESDE UN PARTE
--
-- NO se crea un sistema de avisos nuevo: entra por el MISMO sitio que el
-- aviso de una orden (la tabla «material_requests» y la pantalla de
-- Material pendiente que ya existe). Lo único que cambia es de dónde
-- viene: de un parte en vez de una orden.
--
-- Hace falta que el parte tenga proyecto, porque el aviso de material va
-- siempre contra un proyecto. Si el parte todavía no lo tiene, queda la
-- marca «needs_material» y administración lo ve al asignarlo.
-- ---------------------------------------------------------------------
create or replace function public.submit_material_request_report(p_report uuid, p_body text)
returns public.material_requests
language plpgsql security definer set search_path = public as $$
declare
  r public.work_reports;
  q public.material_requests;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
begin
  if v_body is null then
    raise exception 'Escribe qué material falta' using errcode = '22023';
  end if;

  select * into r from public.work_reports where id = p_report;
  if not found then
    raise exception 'No se encuentra el parte de trabajo' using errcode = 'P0002';
  end if;

  if not (public.owns_report(p_report) or public.is_admin()) then
    raise exception 'Ese parte no es tuyo' using errcode = '42501';
  end if;

  if r.project_id is null then
    raise exception 'Este parte todavía no tiene proyecto: el aviso de material va contra un proyecto'
      using errcode = '22023';
  end if;

  insert into public.material_requests (project_id, order_id, worker_id, body, is_demo)
  values (r.project_id, null, auth.uid(), v_body, r.is_demo)
  returning * into q;

  update public.work_reports set needs_material = true where id = p_report;

  perform public.notify_admins('material_solicitado', 'Falta material',
    public.actor_name() || ' · ' || r.code || ': ' || left(v_body, 160), null);

  return q;
end $$;
