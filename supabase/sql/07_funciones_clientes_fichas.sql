-- =====================================================================
-- METALPLAFER360 · 07 · FUNCIONES DE CLIENTES Y FICHAS (FASE 2)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Traducción de estados y tipos a castellano, para el historial.
-- ---------------------------------------------------------------------
create or replace function public.label_es(p text) returns text
language sql immutable as $$
  select coalesce(case p
    -- Presupuestos
    when 'por_asignar' then 'Por asignar'
    when 'pendiente'   then 'Pendiente'
    when 'avanzado'    then 'Presupuesto avanzado'
    when 'por_revisar' then 'Presupuesto por revisar'
    when 'enviado'     then 'Presupuesto enviado'
    when 'aceptado'    then 'Presupuesto aceptado'
    when 'cancelado'   then 'Presupuesto cancelado'
    -- Visitas
    when 'asignada'    then 'Asignada'
    when 'realizada'   then 'Realizada'
    when 'cancelada'   then 'Cancelada'
    -- Avisos
    when 'asignado'    then 'Asignado'
    when 'en_curso'    then 'En curso'
    when 'realizado'   then 'Realizado'
    when 'cerrado'     then 'Cerrado'
    -- Tipos
    when 'presupuesto' then 'presupuesto'
    when 'visita'      then 'visita'
    when 'aviso'       then 'aviso'
  end, p);
$$;

-- ---------------------------------------------------------------------
-- CÓDIGO AUTOMÁTICO DE LA FICHA
-- PRES-2026-001 · VIS-2026-001 · AVI-2026-001
-- Series independientes por tipo y año, seguras ante concurrencia.
-- ---------------------------------------------------------------------
create or replace function public.trg_assign_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prefix text;
begin
  -- Durante una restauración de copia de seguridad se conserva el código original.
  if coalesce(current_setting('app.restoring', true), '') = 'on' and new.code is not null then
    return new;
  end if;

  -- Se separan las ramas con IF (y no con un CASE en una sola expresión)
  -- porque «new.type» solo existe en la tabla de fichas.
  if TG_TABLE_NAME = 'fichas' then
    v_prefix := case new.type
                  when 'presupuesto' then 'PRES'
                  when 'visita'      then 'VIS'
                  else                    'AVI' end;
  elsif TG_TABLE_NAME = 'projects' then
    v_prefix := 'PROY';
  elsif TG_TABLE_NAME = 'work_orders' then
    v_prefix := 'OT';
  else
    raise exception 'No hay serie de códigos definida para %', TG_TABLE_NAME;
  end if;

  new.code := public.next_code(v_prefix);
  return new;
end $$;

drop trigger if exists assign_code on public.fichas;
create trigger assign_code before insert on public.fichas
  for each row execute function public.trg_assign_code();

-- ---------------------------------------------------------------------
-- REGLAS DE ESTADO DE LAS FICHAS
--   · Toda ficha nueva nace en «Por asignar», se pida lo que se pida.
--   · Al asignar un responsable, deja de estar «Por asignar» sola.
-- ---------------------------------------------------------------------
create or replace function public.trg_fichas_before() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;

  if TG_OP = 'INSERT' then
    new.status := 'por_asignar';
  end if;

  if new.status = 'por_asignar' and new.assigned_to is not null
     and (TG_OP = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    new.status := case new.type
                    when 'presupuesto' then 'pendiente'
                    when 'visita'      then 'asignada'
                    else                    'asignado' end;
  end if;

  return new;
end $$;

drop trigger if exists fichas_before on public.fichas;
create trigger fichas_before before insert or update on public.fichas
  for each row execute function public.trg_fichas_before();

-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------
drop trigger if exists touch_updated_at on public.clients;
create trigger touch_updated_at before update on public.clients
  for each row execute function public.trg_touch_updated_at();

drop trigger if exists touch_updated_at on public.fichas;
create trigger touch_updated_at before update on public.fichas
  for each row execute function public.trg_touch_updated_at();

-- ---------------------------------------------------------------------
-- BÚSQUEDA DE CLIENTES PARECIDOS
--
-- Al escribir «GARCÍA CONSTRUCCIONES» propone «García Construcciones SL»
-- y «García y Asociados». Ignora mayúsculas, acentos y guiones.
-- Devuelve únicamente DATOS GENERALES del cliente: nunca información de
-- proyectos anteriores.
-- ---------------------------------------------------------------------
create or replace function public.norm(p text) returns text
language sql stable set search_path = public, extensions as $$
  select lower(unaccent(coalesce(trim(p), '')))
$$;

create or replace function public.suggest_clients(p_query text, p_limit int default 6)
returns table (
  id uuid, name text, tax_id text, kind public.client_kind,
  phone text, email text, address text, city text, postal_code text, score real
)
language sql stable security invoker set search_path = public, extensions as $$
  with q as (
    select public.norm(p_query) as texto,
           upper(regexp_replace(coalesce(p_query, ''), '[^A-Za-z0-9]', '', 'g')) as cif
  ),
  -- Palabras de tres letras o más de lo que se está escribiendo.
  -- Así «GARCÍA CONSTRUCCIONES» encuentra también «García y Asociados»:
  -- basta con que comparta una palabra.
  palabras as (
    select w from q, regexp_split_to_table(q.texto, '\s+') w where length(w) >= 3
  ),
  candidatos as (
    select c.*,
           greatest(
             similarity(public.norm(c.name), q.texto),
             coalesce((select max(word_similarity(w, public.norm(c.name))) from palabras), 0),
             case when length(q.cif) >= 3
                   and upper(regexp_replace(coalesce(c.tax_id, ''), '[^A-Za-z0-9]', '', 'g'))
                       like q.cif || '%'
                  then 1 else 0 end
           )::real as score
      from public.clients c, q
     where public.is_admin()
       and c.archived_at is null
       and length(q.texto) >= 2
  )
  select c.id, c.name, c.tax_id, c.kind, c.phone, c.email,
         c.address, c.city, c.postal_code, c.score
    from candidatos c
   where c.score > 0.45
   order by c.score desc, c.name
   limit greatest(1, least(p_limit, 20));
$$;

-- ---------------------------------------------------------------------
-- RESUMEN DE ACTIVIDAD POR CLIENTE
-- Lo que se ve al entrar en la ficha de un cliente.
-- ---------------------------------------------------------------------
create or replace view public.client_activity with (security_invoker = true) as
  select c.id as client_id,
         count(*) filter (where f.type = 'presupuesto' and f.archived_at is null) as budgets,
         count(*) filter (where f.type = 'visita'      and f.archived_at is null) as visits,
         count(*) filter (where f.type = 'aviso'       and f.archived_at is null) as notices,
         count(*) filter (where f.type = 'aviso' and f.archived_at is null
                            and f.status not in ('realizado', 'cerrado'))         as open_notices,
         max(f.created_at) as last_activity
    from public.clients c
    left join public.fichas f on f.client_id = c.id
   group by c.id;

-- ---------------------------------------------------------------------
-- ¿Es una ficha asignada a este trabajador?
-- Se usa en los permisos. En esta fase los trabajadores no entran en el
-- módulo administrativo, pero la regla ya deja preparadas sus visitas y
-- avisos para la fase del área de trabajador.
-- ---------------------------------------------------------------------
create or replace function public.worker_has_ficha(p_ficha uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.fichas f
      join public.profiles pr on pr.id = f.assigned_to and pr.active
     where f.id = p_ficha
       and f.assigned_to = auth.uid()
       and f.type in ('visita', 'aviso')
       and f.archived_at is null);
$$;

-- ¿Puede un trabajador ver a este cliente? Solo si tiene alguna visita o
-- aviso suyo asignado.
create or replace function public.worker_can_see_client(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.fichas f
     where f.client_id = p_client and public.worker_has_ficha(f.id));
$$;

-- ---------------------------------------------------------------------
-- PAPELERA DE DOCUMENTOS
-- ---------------------------------------------------------------------
create or replace function public.trash_document(p_doc uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.documents
     set deleted_at = now(), deleted_by = auth.uid()
   where id = p_doc and deleted_at is null;
  if not found then
    raise exception 'El documento no existe o ya está en la papelera' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.restore_document(p_doc uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.documents
     set deleted_at = null, deleted_by = null
   where id = p_doc and deleted_at is not null;
  if not found then
    raise exception 'El documento no está en la papelera' using errcode = 'P0002';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- HISTORIAL AUTOMÁTICO
-- Se reescribe la función de la fase 1 añadiendo las tablas nuevas.
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

  when 'documents' then
    v_code := v_row ->> 'file_name';
    v_summary := case
      when TG_OP = 'INSERT' then v_name || ' subió ' ||
        case (v_row ->> 'category')
          when 'foto'  then 'una fotografía'
          when 'video' then 'un vídeo'
          when 'firma' then 'una firma'
          else 'un documento' end || ' «' || v_code || '»'
      when TG_OP = 'DELETE' then v_name || ' eliminó definitivamente «' || v_code || '»'
      when 'deleted_at' = any(v_changed) and new.deleted_at is not null
           then v_name || ' envió a la papelera «' || v_code || '»'
      when 'deleted_at' = any(v_changed)
           then v_name || ' restauró de la papelera «' || v_code || '»'
      else v_name || ' modificó «' || v_code || '»' end;

  when 'comments' then
    select code into v_code from public.fichas where id = (v_row ->> 'ficha_id')::uuid;
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
  foreach t in array array['clients', 'client_contacts', 'fichas', 'documents', 'comments'] loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I '
                   'for each row execute function public.trg_audit()', t);
  end loop;
end $$;
