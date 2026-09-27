-- =====================================================================
-- METALPLAFER360 · 19 · INFORMES, COPIAS Y RESTAURACIÓN (FASE 6)
--
-- Los números de los informes se calculan aquí, en la base de datos:
-- así salen siempre iguales los vea quien los vea, y nadie puede pedir
-- datos que no le corresponden.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PANEL DE INICIO
--
-- Un único viaje al servidor con todo lo que enseña el panel: producción,
-- proyectos, órdenes, alertas, material y la parte económica.
-- El periodo por defecto lo decide la pantalla (este mes).
--
-- A propósito NO hay ninguna alerta de exceso de horas.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_summary(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_today date := public.today_madrid();
begin
  perform public.assert_admin();

  select jsonb_build_object(

    'periodo', jsonb_build_object('desde', p_from, 'hasta', p_to),

    -- PRODUCCIÓN: lo que se ha trabajado en el periodo
    'produccion', (
      select jsonb_build_object(
        'horas_fabricacion', coalesce(sum(w.hours) filter (where o.type = 'fabricacion'), 0),
        'horas_montaje',     coalesce(sum(w.hours) filter (where o.type = 'montaje'), 0),
        'horas_totales',     coalesce(sum(w.hours), 0),
        'ordenes_validadas', count(distinct o.id) filter (where o.status = 'validada'),
        'trabajadores',      count(distinct w.worker_id) filter (where w.hours is not null))
        from public.work_orders o
        left join public.work_order_workers w on w.order_id = o.id
       where o.archived_at is null and o.scheduled_date between p_from and p_to),

    -- PROYECTOS
    'proyectos', (
      select jsonb_build_object(
        'activos',     count(*) filter (where archived_at is null and phase <> 'finalizado'),
        'creados',     count(*) filter (where created_at::date between p_from and p_to),
        'finalizados', count(*) filter (where finished_at::date between p_from and p_to),
        'dias_medio',  coalesce(round(avg(extract(epoch from (finished_at - created_at)) / 86400)
                                      filter (where finished_at::date between p_from and p_to))::int, 0),
        'por_fase',    (select jsonb_object_agg(phase, n) from (
                          select phase::text as phase, count(*) as n
                            from public.projects where archived_at is null and phase <> 'finalizado'
                           group by phase) f))
        from public.projects),

    -- ÓRDENES DE TRABAJO
    'ordenes', (
      select jsonb_build_object(
        'hoy',        count(*) filter (where scheduled_date = v_today),
        'pendientes', count(*) filter (where status = 'pendiente'),
        'en_curso',   count(*) filter (where status = 'en_curso'),
        'por_revisar', count(*) filter (where status = 'realizada'),
        'devueltas',  count(*) filter (where status = 'devuelta'))
        from public.work_orders where archived_at is null),

    -- MATERIAL
    'material', (
      select jsonb_build_object(
        'pendientes', count(*) filter (where not received),
        'retrasados', count(*) filter (where not received and expected_on < v_today),
        'recibidos',  count(*) filter (where received and updated_at::date between p_from and p_to))
        from public.materials where archived_at is null),

    -- ALERTAS (sin ninguna de exceso de horas)
    'alertas', jsonb_build_object(
      'ordenes_atrasadas', (select count(*) from public.work_orders
                             where archived_at is null and scheduled_date < v_today
                               and status in ('pendiente', 'en_curso', 'devuelta')),
      'ordenes_por_revisar', (select count(*) from public.work_orders
                               where archived_at is null and status = 'realizada'),
      'material_retrasado', (select count(*) from public.materials
                              where archived_at is null and not received and expected_on < v_today),
      'avisos_taller',     (select count(*) from public.material_requests where status = 'pendiente'),
      'fichas_por_asignar', (select count(*) from public.fichas
                              where archived_at is null and status = 'por_asignar'),
      'presupuestos_enviados', (select count(*) from public.fichas
                                 where archived_at is null and type = 'presupuesto' and status = 'enviado')),

    -- ECONÓMICO
    'economico', (
      select jsonb_build_object(
        'presupuestado', coalesce(sum(b.total), 0),
        'cobrado',       coalesce(sum(b.cobrado), 0),
        'pendiente',     coalesce(sum(b.pendiente), 0),
        'por_facturar',  coalesce(sum(b.total) filter (where p.billing_status = 'por_facturar'), 0))
        from public.projects p
        join public.project_billing b on b.project_id = p.id
       where p.archived_at is null),

    'cobrado_periodo', (select coalesce(sum(amount), 0) from public.payments
                         where paid_on between p_from and p_to)

  ) into v;

  return v;
end $$;

-- ---------------------------------------------------------------------
-- INFORMES · PROYECTOS
-- ---------------------------------------------------------------------
create or replace function public.report_projects(p_from date, p_to date)
returns table (
  code text, name text, cliente text, fase text, estado_cobro text,
  creado date, finalizado date, dias integer,
  presupuesto numeric, cobrado numeric, pendiente numeric,
  horas_previstas numeric, horas_reales numeric
)
language sql stable security definer set search_path = public as $$
  select p.code, p.name, c.name,
         public.label_es(p.phase::text),
         public.label_es(p.billing_status::text),
         p.created_at::date,
         p.finished_at::date,
         case when p.finished_at is null then null
              else (p.finished_at::date - p.created_at::date) end,
         coalesce(b.total, 0), coalesce(b.cobrado, 0), coalesce(b.pendiente, 0),
         p.budget_hours_fab + p.budget_hours_mont,
         coalesce((select sum(w.hours) from public.work_orders o
                     join public.work_order_workers w on w.order_id = o.id
                    where o.project_id = p.id and o.archived_at is null), 0)
    from public.projects p
    join public.clients c on c.id = p.client_id
    left join public.project_billing b on b.project_id = p.id
   where public.is_admin()
     and p.archived_at is null
     and (p.created_at::date between p_from and p_to
          or p.finished_at::date between p_from and p_to
          or (p.finished_at is null and p.created_at::date <= p_to))
   order by p.code desc;
$$;

create or replace function public.report_projects_by_phase(p_from date, p_to date)
returns table (fase text, proyectos bigint, presupuesto numeric, horas_reales numeric)
language sql stable security definer set search_path = public as $$
  with base as (
    select p.phase, p.id, coalesce(p.budget_amount, 0) as importe,
           coalesce((select sum(w.hours) from public.work_orders o
                       join public.work_order_workers w on w.order_id = o.id
                      where o.project_id = p.id and o.archived_at is null), 0) as horas
      from public.projects p
     where public.is_admin()
       and p.archived_at is null
       and p.created_at::date <= p_to
       and (p.finished_at is null or p.finished_at::date >= p_from)
  )
  select public.label_es(f.phase::text), count(b.id),
         coalesce(sum(b.importe), 0), coalesce(sum(b.horas), 0)
    from (select unnest(enum_range(null::public.project_phase)) as phase) f
    left join base b on b.phase = f.phase
   group by f.phase
   order by array_position(enum_range(null::public.project_phase), f.phase);
$$;

-- ---------------------------------------------------------------------
-- INFORMES · HORAS
-- ---------------------------------------------------------------------
create or replace function public.report_hours_by_worker(p_from date, p_to date)
returns table (trabajador text, fabricacion numeric, montaje numeric, total numeric, ordenes bigint)
language sql stable security definer set search_path = public as $$
  select pr.full_name,
         coalesce(sum(w.hours) filter (where o.type = 'fabricacion'), 0),
         coalesce(sum(w.hours) filter (where o.type = 'montaje'), 0),
         coalesce(sum(w.hours), 0),
         count(distinct o.id) filter (where w.hours is not null)
    from public.work_order_workers w
    join public.work_orders o on o.id = w.order_id
    join public.profiles pr    on pr.id = w.worker_id
   where public.is_admin()
     and o.archived_at is null
     and o.scheduled_date between p_from and p_to
   group by pr.full_name
   order by coalesce(sum(w.hours), 0) desc, pr.full_name;
$$;

create or replace function public.report_hours_by_project(p_from date, p_to date)
returns table (
  code text, name text, cliente text,
  previstas numeric, fabricacion numeric, montaje numeric, total numeric, desvio numeric
)
language sql stable security definer set search_path = public as $$
  select p.code, p.name, c.name,
         p.budget_hours_fab + p.budget_hours_mont,
         coalesce(sum(w.hours) filter (where o.type = 'fabricacion'), 0),
         coalesce(sum(w.hours) filter (where o.type = 'montaje'), 0),
         coalesce(sum(w.hours), 0),
         coalesce(sum(w.hours), 0) - (p.budget_hours_fab + p.budget_hours_mont)
    from public.projects p
    join public.clients c      on c.id = p.client_id
    join public.work_orders o  on o.project_id = p.id and o.archived_at is null
    left join public.work_order_workers w on w.order_id = o.id
   where public.is_admin()
     and o.scheduled_date between p_from and p_to
   group by p.id, c.name
   order by coalesce(sum(w.hours), 0) desc, p.code;
$$;

-- ---------------------------------------------------------------------
-- INFORMES · MATERIAL
-- ---------------------------------------------------------------------
create or replace function public.report_materials(p_from date, p_to date)
returns table (
  material text, unidades numeric, proveedor text, proyecto text,
  pedido date, previsto date, recibido boolean, dias_retraso integer
)
language sql stable security definer set search_path = public as $$
  select m.name, m.units, coalesce(m.supplier, '—'), p.code,
         m.ordered_on, m.expected_on, m.received,
         case when m.received or m.expected_on is null or m.expected_on >= public.today_madrid()
              then 0 else public.today_madrid() - m.expected_on end
    from public.materials m
    join public.projects p on p.id = m.project_id
   where public.is_admin()
     and m.archived_at is null
     and (not m.received
          or coalesce(m.ordered_on, m.created_at::date) between p_from and p_to
          or m.updated_at::date between p_from and p_to)
   order by m.received, m.expected_on nulls last;
$$;

create or replace function public.report_suppliers(p_from date, p_to date)
returns table (
  proveedor text, pedidos bigint, pendientes bigint, retrasados bigint, retraso_medio numeric
)
language sql stable security definer set search_path = public as $$
  select coalesce(m.supplier, '—'),
         count(*),
         count(*) filter (where not m.received),
         count(*) filter (where not m.received and m.expected_on < public.today_madrid()),
         coalesce(round(avg(public.today_madrid() - m.expected_on)
                        filter (where not m.received and m.expected_on < public.today_madrid()), 1), 0)
    from public.materials m
   where public.is_admin()
     and m.archived_at is null
     and coalesce(m.ordered_on, m.created_at::date) <= p_to
   group by coalesce(m.supplier, '—')
   order by count(*) desc, 1;
$$;

-- ---------------------------------------------------------------------
-- CONFIGURACIÓN
-- ---------------------------------------------------------------------
create or replace function public.set_company(p_company jsonb)
returns public.app_settings language plpgsql security definer set search_path = public as $$
declare s public.app_settings;
begin
  perform public.assert_admin();
  update public.app_settings
     set company = coalesce(company, '{}'::jsonb) || coalesce(p_company, '{}'::jsonb)
   where id = 1 returning * into s;
  return s;
end $$;

create or replace function public.set_backup_settings(p_backup jsonb, p_retention_days int default null)
returns public.app_settings language plpgsql security definer set search_path = public as $$
declare s public.app_settings;
begin
  perform public.assert_admin();
  if p_retention_days is not null and (p_retention_days < 1 or p_retention_days > 365) then
    raise exception 'Los días de retención deben estar entre 1 y 365' using errcode = '22023';
  end if;

  update public.app_settings
     set backup = coalesce(backup, '{}'::jsonb) || coalesce(p_backup, '{}'::jsonb),
         backup_retention_days = coalesce(p_retention_days, backup_retention_days)
   where id = 1 returning * into s;
  return s;
end $$;

create or replace function public.set_max_file_mb(p_mb integer)
returns public.app_settings language plpgsql security definer set search_path = public as $$
declare s public.app_settings;
begin
  perform public.assert_admin();
  if p_mb < 1 or p_mb > 100 then
    raise exception 'El tamaño máximo por archivo debe estar entre 1 y 100 MB' using errcode = '22023';
  end if;
  update public.app_settings set max_file_mb = p_mb where id = 1 returning * into s;
  return s;
end $$;

/** Cada persona guarda sus propias preferencias de pantalla. */
create or replace function public.set_preferences(p_prefs jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if auth.uid() is null then
    raise exception 'No tienes permisos para realizar esta acción' using errcode = '42501';
  end if;
  update public.profiles
     set preferences = coalesce(preferences, '{}'::jsonb) || coalesce(p_prefs, '{}'::jsonb)
   where id = auth.uid()
  returning preferences into v;
  return v;
end $$;

/** Corregir la numeración de una serie (por ejemplo, tras una migración). */
create or replace function public.set_counter(p_prefix text, p_year int, p_value int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if p_value < 0 then
    raise exception 'El número no puede ser negativo' using errcode = '22023';
  end if;
  insert into public.code_counters (prefix, year, last_value)
  values (upper(trim(p_prefix)), p_year, p_value)
  on conflict (prefix, year) do update set last_value = excluded.last_value;
end $$;

-- ---------------------------------------------------------------------
-- COPIAS DE SEGURIDAD
-- ---------------------------------------------------------------------

/** Qué tablas entran en una copia y en qué orden se restauran. */
create or replace function public.backup_tables() returns text[]
language sql immutable as $$
  select array[
    'app_settings', 'code_counters', 'profiles',
    'clients', 'client_contacts', 'fichas',
    'projects', 'project_substatuses',
    'work_orders', 'work_order_workers',
    'materials', 'material_requests', 'payments',
    'documents', 'comments', 'audit_log'
  ];
$$;

/** Cuántas filas tiene cada tabla ahora mismo: se guarda en la copia. */
create or replace function public.backup_counts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t text; n bigint; v jsonb := '{}'::jsonb;
begin
  perform public.assert_admin();
  foreach t in array public.backup_tables() loop
    execute format('select count(*) from public.%I', t) into n;
    v := v || jsonb_build_object(t, n);
  end loop;
  return v;
end $$;

create or replace function public.start_backup(p_kind public.backup_kind, p_destination text)
returns public.backups language plpgsql security definer set search_path = public as $$
declare b public.backups;
begin
  perform public.assert_admin();
  insert into public.backups (kind, destination, created_by)
  values (p_kind, coalesce(nullif(trim(p_destination), ''), 'descarga'), auth.uid())
  returning * into b;
  return b;
end $$;

create or replace function public.finish_backup(
  p_backup uuid, p_file_name text, p_size bigint, p_tables jsonb,
  p_documents int default 0, p_drive_file_id text default null,
  p_drive_link text default null, p_error text default null)
returns public.backups language plpgsql security definer set search_path = public as $$
declare b public.backups;
begin
  perform public.assert_admin();

  update public.backups
     set status = (case when p_error is null then 'completado' else 'error' end)::public.backup_status,
         file_name = p_file_name, size_bytes = p_size,
         tables = coalesce(p_tables, '{}'::jsonb), documents_count = coalesce(p_documents, 0),
         drive_file_id = p_drive_file_id, drive_link = p_drive_link,
         error = p_error, finished_at = now()
   where id = p_backup
  returning * into b;

  if not found then raise exception 'No se encuentra la copia de seguridad' using errcode = 'P0002'; end if;

  perform public.log_event(
    case when p_error is null then 'backup' else 'backup_error' end,
    'backups',
    case when p_error is null
         then public.actor_name() || ' generó una copia de seguridad (' || coalesce(p_file_name, '') || ')'
         else public.actor_name() || ' intentó generar una copia y falló: ' || p_error end,
    jsonb_build_object('backup', p_backup, 'tablas', p_tables));

  return b;
end $$;

/** Retirada de copias antiguas: devuelve las que hay que borrar de Drive. */
create or replace function public.expired_backups()
returns table (id uuid, drive_file_id text, file_name text)
language plpgsql security definer set search_path = public as $$
declare v_days int;
begin
  perform public.assert_admin();
  select s.backup_retention_days into v_days from public.app_settings s where s.id = 1;

  return query
    select b.id, b.drive_file_id, b.file_name
      from public.backups b
     where b.kind = 'automatico'
       and b.drive_file_id is not null
       and b.started_at < now() - make_interval(days => coalesce(v_days, 30));
end $$;

create or replace function public.forget_backup(p_backup uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  delete from public.backups b where b.id = p_backup;
end $$;

-- ---------------------------------------------------------------------
-- RESTAURACIÓN
--
-- Vuelca las filas de una copia de seguridad sobre la base de datos.
--   · Respeta el orden de las relaciones (clientes antes que fichas…).
--   · Nunca borra lo que ya hay: actualiza lo que coincide y añade lo que falta.
--   · Se puede restaurar todo o solo una parte.
--   · Queda registrado en el historial.
-- ---------------------------------------------------------------------

/** Columnas de la clave primaria de una tabla. */
create or replace function public.primary_key_of(p_table text) returns text
language sql stable set search_path = public as $$
  select string_agg(quote_ident(a.attname), ', ' order by k.ord)
    from pg_index i
    join lateral unnest(i.indkey) with ordinality as k(attnum, ord) on true
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
   where i.indrelid = format('public.%I', p_table)::regclass
     and i.indisprimary;
$$;

/**
 * Vuelca las filas de UNA tabla. Solo lo usa restore_data.
 *
 * Se copian únicamente las columnas que trae la copia: así, si un día la
 * aplicación añade una columna nueva, una copia antigua sigue pudiendo
 * restaurarse y la columna nueva se queda con su valor por defecto.
 */
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

/** Qué tablas entran en cada apartado que se puede restaurar por separado. */
create or replace function public.restore_scope_tables(p_scope text) returns text[]
language sql immutable as $$
  select case p_scope
    when 'configuracion' then array['app_settings', 'code_counters']
    when 'usuarios'      then array['profiles']
    when 'clientes'      then array['clients', 'client_contacts']
    when 'fichas'        then array['fichas']
    when 'proyectos'     then array['projects', 'project_substatuses']
    when 'ordenes'       then array['work_orders', 'work_order_workers']
    when 'material'      then array['materials', 'material_requests']
    when 'cobros'        then array['payments']
    when 'documentos'    then array['documents', 'comments']
    when 'historial'     then array['audit_log']
    else array[]::text[] end;
$$;

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
    v_n := public.restore_table(t, p_payload -> t);
    if v_n > 0 then
      v_result := v_result || jsonb_build_object(t, v_n);
      v_total := v_total + v_n;
    end if;
  end loop;

  -- La numeración automática continúa por donde toca.
  perform setval('public.audit_log_id_seq',
                 greatest(coalesce((select max(id) from public.audit_log), 0), 1));

  perform set_config('app.restoring', 'off', true);

  perform public.log_event(
    'restauracion', 'backups',
    public.actor_name() || ' restauró una copia de seguridad (' ||
    array_to_string(v_scope, ', ') || '): ' || v_total || ' registros',
    jsonb_build_object('apartados', to_jsonb(v_scope), 'filas', v_result));

  return jsonb_build_object('filas', v_result, 'total', v_total,
                            'apartados', to_jsonb(v_scope));
end $$;
