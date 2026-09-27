-- =====================================================================
-- METALPLAFER360 · 22 · CORRECCIONES DE LA AUDITORÍA (FASE 7)
--
-- Este archivo arregla lo que encontró la auditoría final. Se puede
-- ejecutar sobre una base de datos que ya esté funcionando: no borra
-- nada y se puede volver a ejecutar sin problema.
--
-- QUÉ ARREGLA
--   1. Un trabajador con sesión podía VACIAR tablas enteras con TRUNCATE,
--      saltándose todos los permisos. (Lo más grave de la auditoría.)
--   2. El historial se podía vaciar desde el servidor.
--   3. Borrar un usuario en Supabase destruía sus horas trabajadas.
--   4. Se podía reescribir el código de una ficha, proyecto u orden.
--   5. El límite de tamaño de archivo no hacía caso al ajuste.
--   6. Los cobros se borraban de verdad, en vez de anularse.
--   7. Al borrar un contacto se perdía de los presupuestos antiguos.
--   8. Faltaban índices en columnas por las que se busca a diario.
--   9. Restaurar una copia podía dejar la numeración rota.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) NADIE BORRA TABLAS ENTERAS
--
-- TRUNCATE vacía una tabla de golpe y NO pasa por las políticas de
-- seguridad: da igual lo que diga la RLS. Supabase concede permisos de
-- sobra a las tablas nuevas, así que aquí se cierran de raíz y se
-- deja abierto solo lo que la aplicación necesita de verdad.
--
-- Todas las funciones que borran algo (subestados, partes, cobros,
-- copias) son «security definer»: se ejecutan con permisos propios y
-- siguen funcionando igual después de esto.
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  -- Tablas y vistas: en las vistas el permiso no sirve de nada, pero
  -- tenerlo concedido confunde a cualquiera que audite los permisos.
  for t in
    select table_name from information_schema.tables where table_schema = 'public'
  loop
    execute format('revoke delete, truncate on public.%I from authenticated, anon', t.table_name);
  end loop;
end $$;

-- Vaciar la papelera SÍ es una función de verdad: administración puede
-- borrar para siempre un documento que ya está en la papelera. Eso pasa
-- por la política «documents_delete», que comprueba las dos cosas. Se le
-- devuelve ese permiso, y solo ese: TRUNCATE sigue prohibido, porque es
-- el que se salta la seguridad.
grant delete on public.documents to authenticated;

-- El historial y los documentos no se vacían nunca de golpe, ni siquiera
-- desde el servidor (las funciones de la copia solo leen).
revoke truncate on public.audit_log from service_role;
revoke truncate on public.documents from service_role;

-- Y las tablas que se creen en el futuro nacen ya cerradas.
alter default privileges in schema public
  revoke delete, truncate on tables from authenticated, anon;


-- ---------------------------------------------------------------------
-- 2) EL HISTORIAL ES INMUTABLE, TAMBIÉN FRENTE A TRUNCATE
--
-- El disparador que protege el historial solo salta al modificar o
-- borrar filas; TRUNCATE no es ninguna de las dos cosas y se colaba.
-- ---------------------------------------------------------------------
create or replace function public.trg_no_truncate() returns trigger
language plpgsql as $$
begin
  raise exception 'La tabla «%» no se puede vaciar: aquí no se borra nada.',
    tg_table_name using errcode = '42501';
end $$;

drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.trg_no_truncate();

drop trigger if exists documents_no_truncate on public.documents;
create trigger documents_no_truncate before truncate on public.documents
  for each statement execute function public.trg_no_truncate();


-- ---------------------------------------------------------------------
-- 3) BORRAR UN USUARIO NO PUEDE DESTRUIR SUS HORAS
--
-- Antes, borrar a alguien en Supabase > Authentication arrastraba en
-- cascada sus partes de trabajo: horas ya trabajadas y facturadas
-- desaparecían sin avisar. Ahora la base de datos se niega.
--
-- A la gente no se le borra: se le DESACTIVA desde Configuración, y
-- conserva todo su historial.
-- ---------------------------------------------------------------------
alter table public.work_order_workers
  drop constraint if exists work_order_workers_worker_id_fkey;
alter table public.work_order_workers
  add constraint work_order_workers_worker_id_fkey
  foreign key (worker_id) references public.profiles(id) on delete restrict;

alter table public.material_requests
  drop constraint if exists material_requests_worker_id_fkey;
alter table public.material_requests
  add constraint material_requests_worker_id_fkey
  foreign key (worker_id) references public.profiles(id) on delete restrict;


-- ---------------------------------------------------------------------
-- 4) UN CÓDIGO EMITIDO NO SE CAMBIA
--
-- PRES-2026-001 o PROY-2026-014 son la referencia que la empresa usa en
-- presupuestos y facturas de papel. Si se pudiera reescribir, se perdería
-- la trazabilidad. Al restaurar una copia sí se permite, porque entonces
-- se está devolviendo el código que ya tenía.
-- ---------------------------------------------------------------------
create or replace function public.trg_code_is_forever() returns trigger
language plpgsql as $$
begin
  if new.code is distinct from old.code
     and coalesce(current_setting('app.restoring', true), '') <> 'on' then
    raise exception 'El código «%» no se puede cambiar: identifica el expediente '
                    'en presupuestos y facturas.', old.code using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists fichas_code_is_forever on public.fichas;
create trigger fichas_code_is_forever before update of code on public.fichas
  for each row execute function public.trg_code_is_forever();

drop trigger if exists projects_code_is_forever on public.projects;
create trigger projects_code_is_forever before update of code on public.projects
  for each row execute function public.trg_code_is_forever();

drop trigger if exists orders_code_is_forever on public.work_orders;
create trigger orders_code_is_forever before update of code on public.work_orders
  for each row execute function public.trg_code_is_forever();


-- ---------------------------------------------------------------------
-- 5) EL LÍMITE DE TAMAÑO HACE CASO AL AJUSTE
--
-- Había un tope fijo de 100 MB escrito en la tabla, mientras que en
-- Configuración se podía poner otro número que no servía para nada.
-- Ahora manda el ajuste, y el tope de 500 MB solo queda como red de
-- seguridad frente a un valor absurdo.
-- ---------------------------------------------------------------------
alter table public.documents drop constraint if exists documents_size_bytes_check;
alter table public.documents
  add constraint documents_size_bytes_check
  check (size_bytes >= 0 and size_bytes <= 524288000);

create or replace function public.trg_document_size_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max bigint;
begin
  select coalesce(max_file_mb, 100)::bigint * 1024 * 1024
    into v_max from public.app_settings where id = 1;

  if new.size_bytes is not null and v_max is not null and new.size_bytes > v_max then
    raise exception 'El archivo ocupa % MB y el máximo permitido son % MB.',
      round(new.size_bytes / 1048576.0, 1), round(v_max / 1048576.0)
      using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists documents_size_limit on public.documents;
create trigger documents_size_limit before insert or update of size_bytes on public.documents
  for each row execute function public.trg_document_size_limit();


-- ---------------------------------------------------------------------
-- 6) LOS COBROS SE ANULAN, NO SE BORRAN
--
-- Un cobro apuntado por error tiene que quedar anulado y visible, porque
-- los importes cuadran con el programa de facturación. Antes desaparecía.
-- ---------------------------------------------------------------------
alter table public.payments add column if not exists voided_at  timestamptz;
alter table public.payments add column if not exists voided_by  uuid references public.profiles(id);
alter table public.payments add column if not exists void_reason text;

create or replace function public.delete_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_amount numeric; v_code text;
begin
  perform public.assert_admin();

  -- El historial de este cambio se escribe a mano un poco más abajo, para
  -- que diga «anuló» y no «modificó».
  perform set_config('app.skip_audit', 'on', true);

  update public.payments
     set voided_at = now(), voided_by = auth.uid()
   where id = p_payment and voided_at is null
   returning project_id, amount into v_project, v_amount;

  perform set_config('app.skip_audit', 'off', true);

  if v_project is null then
    raise exception 'Ese cobro no existe o ya estaba anulado.' using errcode = '22023';
  end if;

  select code into v_code from public.projects where id = v_project;
  perform public.recompute_billing(v_project);

  perform public.log_event('anular_cobro', 'payments',
    format('%s anuló un cobro de %s de %s',
           public.actor_name(), public.fmt_eur(v_amount), coalesce(v_code, 'un proyecto')),
    jsonb_build_object('importe', v_amount, 'cobro', p_payment));
end $$;

-- Los cobros anulados dejan de contar en el total cobrado. Se conservan
-- las mismas columnas de antes para no romper nada de lo que ya funciona.
create or replace view public.project_billing with (security_invoker = true) as
  select p.id                                                             as project_id,
         coalesce(p.budget_amount, 0)                                     as total,
         coalesce(sum(pay.amount) filter (where pay.voided_at is null), 0) as cobrado,
         greatest(coalesce(p.budget_amount, 0)
                  - coalesce(sum(pay.amount) filter (where pay.voided_at is null), 0), 0) as pendiente,
         count(pay.id) filter (where pay.voided_at is null)                as cobros
    from public.projects p
    left join public.payments pay on pay.project_id = p.id
   group by p.id, p.budget_amount;


-- ---------------------------------------------------------------------
-- 7) LOS CONTACTOS SE ARCHIVAN
--
-- Al borrar un contacto se perdía de los presupuestos y proyectos
-- antiguos («¿con quién hablamos entonces?»). Ahora se archiva: deja de
-- aparecer al elegir, pero sigue estando donde ya se usó.
-- ---------------------------------------------------------------------
alter table public.client_contacts add column if not exists archived_at timestamptz;

create or replace function public.archive_contact(p_contact uuid, p_archive boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_client uuid;
begin
  if not public.is_admin() then
    raise exception 'No tienes permisos para realizar esta acción.' using errcode = '42501';
  end if;

  update public.client_contacts
     set archived_at = case when p_archive then now() else null end
   where id = p_contact
   returning name, client_id into v_name, v_client;

  if v_name is null then
    raise exception 'No se encuentra ese contacto.' using errcode = '22023';
  end if;

  perform public.log_event(
    case when p_archive then 'archivar' else 'recuperar' end, 'client_contacts',
    format('%s %s el contacto %s', public.actor_name(),
           case when p_archive then 'archivó' else 'recuperó' end, v_name),
    jsonb_build_object('cliente', v_client));
end $$;

revoke all on function public.archive_contact(uuid, boolean) from public, anon;
grant execute on function public.archive_contact(uuid, boolean) to authenticated;

drop policy if exists contacts_delete on public.client_contacts;


-- ---------------------------------------------------------------------
-- 8) ÍNDICES QUE FALTABAN
--
-- Sin ellos, PostgreSQL recorría tablas enteras para responder a cosas
-- que se hacen todos los días. Con pocos datos no se nota; con tres años
-- de trabajo, sí.
-- ---------------------------------------------------------------------
create index if not exists documents_ficha_all_idx    on public.documents (ficha_id);
create index if not exists documents_project_all_idx  on public.documents (project_id);
create index if not exists documents_order_all_idx    on public.documents (order_id);
create index if not exists documents_uploaded_by_idx  on public.documents (uploaded_by);
create index if not exists notifications_order_idx    on public.notifications (order_id);
create index if not exists comments_author_idx        on public.comments (author_id);
create index if not exists fichas_contact_idx         on public.fichas (contact_id);
create index if not exists projects_contact_idx       on public.projects (contact_id);
create index if not exists orders_validated_by_idx    on public.work_orders (validated_by);
create index if not exists materials_order_idx        on public.materials (order_id);
create index if not exists requests_order_idx         on public.material_requests (order_id);
create index if not exists requests_material_idx      on public.material_requests (material_id);
create index if not exists requests_reviewed_by_idx   on public.material_requests (reviewed_by);
create index if not exists backups_created_by_idx     on public.backups (created_by);
create index if not exists payments_voided_idx        on public.payments (project_id) where voided_at is null;
create index if not exists payments_voided_by_idx     on public.payments (voided_by);
create index if not exists clients_created_by_idx     on public.clients (created_by);
create index if not exists fichas_created_by_idx      on public.fichas (created_by);
create index if not exists projects_created_by_idx    on public.projects (created_by);
create index if not exists orders_created_by_idx      on public.work_orders (created_by);
create index if not exists documents_deleted_by_idx   on public.documents (deleted_by);

-- Buscar el historial de un expediente concreto («¿qué pasó con PROY-2026-001?»)
create index if not exists audit_code_idx on public.audit_log (entity_code, occurred_at desc)
  where entity_code is not null;
create index if not exists audit_type_time_idx on public.audit_log (entity_type, occurred_at desc);

-- Ver lo archivado dejaba de ser instantáneo al crecer las tablas.
create index if not exists projects_archived_idx on public.projects (archived_at desc) where archived_at is not null;
create index if not exists fichas_archived_idx   on public.fichas (archived_at desc)   where archived_at is not null;
create index if not exists orders_archived_idx   on public.work_orders (archived_at desc) where archived_at is not null;


-- ---------------------------------------------------------------------
-- 9) RESTAURAR NO DEJA LA NUMERACIÓN ROTA
--
-- Dos problemas reales al restaurar una copia:
--
--   a) Si se restauraba solo «fichas» o solo «proyectos», la numeración
--      se quedaba como estaba y el siguiente presupuesto intentaba usar
--      un código YA EXISTENTE: la aplicación daba un error y no dejaba
--      crear nada más.
--   b) Si la copia traía un código que ya estaba en otra fila distinta,
--      la restauración entera se paraba con un error de PostgreSQL en
--      crudo, incomprensible para quien lo estaba usando.
-- ---------------------------------------------------------------------
create or replace function public.reseed_counters() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.code_counters (prefix, year, last_value)
  select split_part(code, '-', 1),
         split_part(code, '-', 2)::int,
         max(split_part(code, '-', 3)::int)
    from (
      select code from public.fichas      where code ~ '^[A-Z]+-[0-9]{4}-[0-9]+$'
      union all
      select code from public.projects    where code ~ '^[A-Z]+-[0-9]{4}-[0-9]+$'
      union all
      select code from public.work_orders where code ~ '^[A-Z]+-[0-9]{4}-[0-9]+$'
    ) c
   group by 1, 2
      on conflict (prefix, year) do update
     set last_value = greatest(public.code_counters.last_value, excluded.last_value);
end $$;

revoke all on function public.reseed_counters() from public, anon, authenticated;

comment on function public.reseed_counters() is
  'Pone cada contador anual por encima del código más alto que exista. Se llama al restaurar.';


-- Restauración corregida: avisa en castellano si la copia choca con algo
-- que ya existe, y deja la numeración lista para seguir trabajando.
create or replace function public.restore_data(p_payload jsonb, p_scope text[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tables text[];
  t text; s text;
  v_n int; v_result jsonb := '{}'::jsonb; v_total int := 0;
  v_scope text[] := coalesce(p_scope, array['configuracion', 'usuarios', 'clientes', 'fichas',
                                            'proyectos', 'ordenes', 'material', 'cobros',
                                            'documentos', 'historial']);
begin
  perform public.assert_admin();

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'La copia de seguridad no contiene datos' using errcode = '22023';
  end if;

  -- Se marca la sesión como «restaurando»: los códigos automáticos y el
  -- historial por filas se quedan quietos para no ensuciar los datos.
  perform set_config('app.restoring', 'on', true);

  -- El orden importa: primero aquello de lo que dependen los demás.
  v_tables := array[]::text[];
  foreach t in array public.backup_tables() loop
    foreach s in array v_scope loop
      if t = any(public.restore_scope_tables(s)) then
        v_tables := v_tables || t;
        exit;
      end if;
    end loop;
  end loop;

  foreach t in array v_tables loop
    begin
      v_n := public.restore_table(t, p_payload -> t);
    exception
      -- Un código o un CIF repetido paraba la restauración con un error
      -- de PostgreSQL en crudo. Ahora se explica qué ha pasado.
      when unique_violation then
        raise exception
          'La copia choca con datos que ya existen en «%»: hay un código o un '
          'identificador repetido (%). Restaura sobre una base de datos vacía, '
          'o elige menos apartados.', t, replace(sqlerrm, '%', '%%')
          using errcode = '22023';
      when foreign_key_violation then
        raise exception
          'La copia de «%» apunta a datos que no están: marca también los '
          'apartados de los que depende (por ejemplo, Clientes antes que Proyectos).', t
          using errcode = '22023';
    end;
    if v_n > 0 then
      v_result := v_result || jsonb_build_object(t, v_n);
      v_total := v_total + v_n;
    end if;
  end loop;

  -- La numeración automática continúa por donde toca.
  perform setval('public.audit_log_id_seq',
                 greatest(coalesce((select max(id) from public.audit_log), 0), 1));

  -- Y los códigos anuales siguen por encima del más alto restaurado, para
  -- que el siguiente presupuesto no intente repetir uno que ya existe.
  perform public.reseed_counters();

  perform set_config('app.restoring', 'off', true);

  perform public.log_event(
    'restauracion', 'backups',
    public.actor_name() || ' restauró una copia de seguridad (' ||
    array_to_string(v_scope, ', ') || '): ' || v_total || ' registros',
    jsonb_build_object('apartados', to_jsonb(v_scope), 'filas', v_result));

  return jsonb_build_object('filas', v_result, 'total', v_total,
                            'apartados', to_jsonb(v_scope));
end $$;

revoke all on function public.restore_data(jsonb, text[]) from public, anon;
grant execute on function public.restore_data(jsonb, text[]) to authenticated;

-- El estado de cobro tampoco puede contar los cobros anulados.
create or replace function public.recompute_billing(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_paid numeric; v_status public.billing_status; v_next public.billing_status;
begin
  select coalesce(budget_amount, 0), billing_status into v_total, v_status
    from public.projects where id = p_project;
  if not found then return; end if;

  select coalesce(sum(amount), 0) into v_paid
    from public.payments where project_id = p_project and voided_at is null;

  v_next := case
    when v_paid > 0 and v_total > 0 and v_paid >= v_total then 'cobrado'
    when v_paid > 0                                       then 'cobrado_parcial'
    when v_status in ('cobrado', 'cobrado_parcial')       then 'pendiente_cobro'
    else v_status end;

  if v_next is distinct from v_status then
    update public.projects set billing_status = v_next where id = p_project;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 10) LOS SUBESTADOS TAMBIÉN SE PUEDEN MARCAR COMO EJEMPLO
--
-- Todas las tablas de datos llevan la marca «is_demo» para poder
-- limpiar los datos de ejemplo sin tocar los de verdad. A los subestados
-- de proyecto se les había pasado.
-- ---------------------------------------------------------------------
alter table public.project_substatuses
  add column if not exists is_demo boolean not null default false;


-- ---------------------------------------------------------------------
-- 11) UNA CASILLA VACÍA DE EXCEL NO BORRA UN DATO
--
-- Si alguien abre el CSV de una copia con Excel y lo vuelve a guardar,
-- las casillas vacías pueden llegar como texto vacío. En una fecha o en
-- un número eso paraba la restauración con un error de PostgreSQL en
-- crudo. Ahora esa casilla simplemente se ignora.
-- ---------------------------------------------------------------------
create or replace function public.restore_table(p_table text, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_keys text[]; v_cols text; v_set text; v_pk text; v_pk_cols text[];
  v_sql text; v_count int := 0; c text;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;
  if not (p_table = any(public.backup_tables())) then
    raise exception 'La tabla «%» no forma parte de las copias de seguridad', p_table using errcode = '22023';
  end if;

  v_pk := public.primary_key_of(p_table);
  if v_pk is null then
    raise exception 'La tabla «%» no se puede restaurar', p_table using errcode = '22023';
  end if;
  v_pk_cols := string_to_array(replace(v_pk, '"', ''), ', ');

  -- Los CSV se pueden abrir y volver a guardar con Excel, y entonces una
  -- casilla vacía puede llegar como «» en vez de como nada. En una fecha,
  -- un número o un sí/no eso reventaría con un error incomprensible, así
  -- que esa casilla se IGNORA: el valor se queda como estaba, o toma el
  -- que la tabla tenga por defecto. Vaciar un dato a propósito se hace
  -- desde la aplicación, no retocando el CSV de una copia.
  select coalesce(jsonb_agg(coalesce(limpia, '{}'::jsonb)), '[]'::jsonb) into p_rows
    from (
      select jsonb_object_agg(par.clave, par.valor) filter (
               where par.valor <> '""'::jsonb
                  or coalesce(col.data_type, 'text') in
                     ('text', 'character varying', 'character', 'USER-DEFINED')
             ) as limpia
        from jsonb_array_elements(p_rows) with ordinality as fila(dato, n),
             lateral jsonb_each(fila.dato) as par(clave, valor)
        left join information_schema.columns col
               on col.table_schema = 'public' and col.table_name = p_table
              and col.column_name = par.clave
       group by fila.n
       order by fila.n
    ) limpias;

  -- Columnas que trae la copia y que existen de verdad en la tabla.
  select array_agg(distinct k) into v_keys
    from jsonb_array_elements(p_rows) e, jsonb_object_keys(e) k;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(format('%1$I = excluded.%1$I', column_name), ', ' order by ordinal_position)
           filter (where not (column_name = any(v_pk_cols)))
    into v_cols, v_set
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table
     and column_name = any(v_keys);

  if v_cols is null then
    raise exception 'La copia no trae ninguna columna reconocible de «%»', p_table using errcode = '22023';
  end if;

  foreach c in array v_pk_cols loop
    if not (c = any(v_keys)) then
      raise exception 'La copia de «%» no trae la columna «%», que hace falta para saber qué fila es',
        p_table, c using errcode = '22023';
    end if;
  end loop;

  -- Los perfiles no se crean al restaurar: un usuario nuevo se da de alta
  -- desde Configuración, porque necesita su acceso en Supabase.
  if p_table = 'profiles' then
    if v_set is null then return 0; end if;
    v_sql := format(
      'update public.profiles p set %s from jsonb_populate_recordset(null::public.profiles, $1) as excluded '
      || 'where p.id = excluded.id', v_set);
  elsif v_set is null then
    -- La copia solo trae la clave: no hay nada que actualizar.
    v_sql := format(
      'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) '
      || 'on conflict (%3$s) do nothing', p_table, v_cols, v_pk);
  else
    v_sql := format(
      'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) '
      || 'on conflict (%3$s) do update set %4$s', p_table, v_cols, v_pk, v_set);
  end if;

  execute v_sql using p_rows;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
