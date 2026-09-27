-- =====================================================================
-- METALPLAFER360 · 10 · FUNCIONES DE PROYECTOS (FASE 3)
--
-- Las reglas de las fases viven aquí, en la base de datos, no en la
-- pantalla: ningún atajo desde el navegador puede saltárselas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Traducción al castellano (amplía la de la fase 2)
-- ---------------------------------------------------------------------
create or replace function public.label_es(p text) returns text
language sql immutable as $$
  select coalesce(case p
    -- Fichas · presupuestos
    when 'por_asignar' then 'Por asignar'
    when 'pendiente'   then 'Pendiente'
    when 'avanzado'    then 'Presupuesto avanzado'
    when 'por_revisar' then 'Presupuesto por revisar'
    when 'enviado'     then 'Presupuesto enviado'
    when 'aceptado'    then 'Presupuesto aceptado'
    when 'cancelado'   then 'Presupuesto cancelado'
    -- Fichas · visitas
    when 'asignada'    then 'Asignada'
    when 'realizada'   then 'Realizada'
    when 'cancelada'   then 'Cancelada'
    -- Fichas · avisos
    when 'asignado'    then 'Asignado'
    when 'en_curso'    then 'En curso'
    when 'realizado'   then 'Realizado'
    when 'cerrado'     then 'Cerrado'
    -- Tipos de ficha
    when 'presupuesto' then 'presupuesto'
    when 'visita'      then 'visita'
    when 'aviso'       then 'aviso'
    -- Fases del proyecto
    when 'preparacion' then 'En preparación'
    when 'fabricacion' then 'Fabricación'
    when 'montaje'     then 'Montaje'
    when 'facturacion' then 'Facturación'
    when 'finalizado'  then 'Finalizado'
    -- Subestados
    when 'pendiente_visita_tecnica' then 'Pendiente visita técnica'
    when 'pendiente_planos'         then 'Pendiente planos'
    when 'pendiente_material'       then 'Pendiente material'
    when 'por_empezar'              then 'Por empezar'
    when 'en_fabricacion'           then 'En fabricación'
    when 'falta_material'           then 'Falta material'
    when 'por_finalizar'            then 'Por finalizar'
    when 'en_montaje'               then 'En montaje'
    when 'por_finalizar_montaje'    then 'Por finalizar montaje'
    -- Estados de facturación
    when 'por_facturar'    then 'Por facturar'
    when 'pendiente_cobro' then 'Pendiente de cobro'
    when 'cobrado_parcial' then 'Cobrado parcialmente'
    when 'cobrado'         then 'Cobrado'
  end, p);
$$;

/** Importes con formato español: 6.400,50 € */
create or replace function public.fmt_eur(n numeric) returns text
language sql immutable as $$
  select translate(to_char(coalesce(n, 0), 'FM999G999G990D00'), ',.', '.,') || ' €'
$$;

-- ---------------------------------------------------------------------
-- Código PROY-AAAA-### y updated_at
-- ---------------------------------------------------------------------
drop trigger if exists assign_code on public.projects;
create trigger assign_code before insert on public.projects
  for each row execute function public.trg_assign_code();

drop trigger if exists touch_updated_at on public.projects;
create trigger touch_updated_at before update on public.projects
  for each row execute function public.trg_touch_updated_at();

-- ---------------------------------------------------------------------
-- CONVERTIR UN PRESUPUESTO ACEPTADO EN PROYECTO
-- Copia los datos del presupuesto una sola vez. Si ya se convirtió,
-- avisa indicando el proyecto que salió de él.
-- ---------------------------------------------------------------------
create or replace function public.convert_budget_to_project(p_ficha uuid, p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare f public.fichas; v_id uuid; v_code text;
begin
  perform public.assert_admin();

  select * into f from public.fichas where id = p_ficha for update;
  if not found or f.type <> 'presupuesto' then
    raise exception 'No se encuentra el presupuesto' using errcode = 'P0002';
  end if;

  if f.status <> 'aceptado' then
    raise exception 'Solo los presupuestos aceptados pueden convertirse en proyecto'
      using errcode = '22023';
  end if;

  select code into v_code from public.projects where source_ficha_id = p_ficha;
  if v_code is not null then
    raise exception 'Este presupuesto ya se convirtió en el proyecto %', v_code
      using errcode = '23505';
  end if;

  insert into public.projects (client_id, contact_id, source_ficha_id, name, description,
                               address, budget_amount, created_by, is_demo)
  values (f.client_id, f.contact_id, f.id,
          coalesce(nullif(trim(p_name), ''), nullif(trim(f.title), ''), 'Proyecto de ' || f.code),
          f.description, f.address, f.amount, auth.uid(), f.is_demo)
  returning id into v_id;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- CAMBIAR DE FASE
-- Solo administración. Nunca lleva a «Finalizado»: para eso hay un botón
-- aparte que debe pulsar una persona.
-- ---------------------------------------------------------------------
create or replace function public.change_project_phase(p_project uuid, p_phase public.project_phase)
returns public.projects language plpgsql security definer set search_path = public as $$
declare p public.projects;
begin
  perform public.assert_admin();

  select * into p from public.projects where id = p_project for update;
  if not found then raise exception 'No se encuentra el proyecto' using errcode = 'P0002'; end if;
  if p.archived_at is not null then
    raise exception 'El proyecto está archivado' using errcode = '22023';
  end if;
  if p_phase = p.phase then return p; end if;

  if p_phase = 'finalizado' then
    raise exception 'Para cerrar el proyecto usa el botón «Finalizar proyecto»' using errcode = '22023';
  end if;

  if p_phase = 'montaje' and p.no_assembly then
    raise exception 'El proyecto está marcado como «Sin montaje». Quita esa marca para pasar a Montaje'
      using errcode = '22023';
  end if;

  if p.phase = 'fabricacion' and p_phase = 'facturacion' and not p.no_assembly then
    raise exception 'De Fabricación se pasa a Montaje. Si este proyecto no lleva montaje, márcalo como «Sin montaje»'
      using errcode = '22023';
  end if;

  update public.projects
     set phase = p_phase, finished_at = null
   where id = p_project
  returning * into p;

  -- Los subestados son propios de cada fase.
  delete from public.project_substatuses where project_id = p_project and phase <> p_phase;

  return p;
end $$;

-- ---------------------------------------------------------------------
-- SUBESTADOS (varios a la vez)
-- ---------------------------------------------------------------------
create or replace function public.set_project_substatuses(p_project uuid, p_substatuses text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_phase public.project_phase; s text;
begin
  perform public.assert_admin();

  select phase into v_phase from public.projects where id = p_project for update;
  if not found then raise exception 'No se encuentra el proyecto' using errcode = 'P0002'; end if;

  foreach s in array coalesce(p_substatuses, '{}') loop
    if not public.valid_substatus(v_phase, s) then
      raise exception 'El subestado «%» no corresponde a la fase %',
        public.label_es(s), public.label_es(v_phase::text) using errcode = '22023';
    end if;
  end loop;

  delete from public.project_substatuses
   where project_id = p_project
     and (phase <> v_phase or not (substatus = any(coalesce(p_substatuses, '{}'))));

  insert into public.project_substatuses (project_id, phase, substatus)
  select p_project, v_phase, unnest(coalesce(p_substatuses, '{}'))
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------
-- ESTADO DE FACTURACIÓN
-- ---------------------------------------------------------------------
create or replace function public.set_billing_status(p_project uuid, p_status public.billing_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.projects set billing_status = p_status where id = p_project;
  if not found then raise exception 'No se encuentra el proyecto' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------------
-- FINALIZAR PROYECTO (siempre a mano)
-- ---------------------------------------------------------------------
create or replace function public.finalize_project(p_project uuid)
returns public.projects language plpgsql security definer set search_path = public as $$
declare p public.projects;
begin
  perform public.assert_admin();

  select * into p from public.projects where id = p_project for update;
  if not found then raise exception 'No se encuentra el proyecto' using errcode = 'P0002'; end if;

  if p.phase <> 'facturacion' or p.billing_status <> 'cobrado' then
    raise exception 'Solo se puede finalizar un proyecto que esté en Facturación y cobrado'
      using errcode = '22023';
  end if;

  update public.projects
     set phase = 'finalizado', finished_at = now()
   where id = p_project
  returning * into p;

  delete from public.project_substatuses where project_id = p_project;
  return p;
end $$;

-- Reabrir un proyecto finalizado (por si se cerró por error).
create or replace function public.reopen_project(p_project uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.projects
     set phase = 'facturacion', finished_at = null
   where id = p_project and phase = 'finalizado';
  if not found then raise exception 'El proyecto no está finalizado' using errcode = '22023'; end if;
end $$;

-- ---------------------------------------------------------------------
-- SUGERENCIAS DE CAMBIO DE FASE
-- Solo SUGIEREN: nunca cambian nada por su cuenta.
-- En esta fase la única condición que se puede comprobar es el cobro;
-- cuando existan las órdenes de trabajo se añadirán las suyas.
-- ---------------------------------------------------------------------
create or replace view public.v_phase_suggestions with (security_invoker = true) as
  select p.id as project_id, p.code, p.name, p.phase,
         'finalizado'::public.project_phase as suggested_phase,
         'El proyecto está cobrado. Ya puedes finalizarlo.' as message
    from public.projects p
   where p.archived_at is null
     and p.phase = 'facturacion'
     and p.billing_status = 'cobrado';

-- ---------------------------------------------------------------------
-- HISTORIAL · se amplía con proyectos y subestados
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
        coalesce((select ' a ' || f.code from public.fichas f where f.id = (v_row ->> 'ficha_id')::uuid), '')
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
    v_summary := v_name || ' comentó en ' || coalesce(v_code, 'una ficha') ||
                 ': ' || left(v_row ->> 'body', 120);

  else
    v_summary := v_name || ' ' || lower(TG_OP) || ' ' || TG_TABLE_NAME;
  end case;

  if v_summary is null then return new; end if;

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
  foreach t in array array['projects', 'project_substatuses'] loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I '
                   'for each row execute function public.trg_audit()', t);
  end loop;
end $$;
