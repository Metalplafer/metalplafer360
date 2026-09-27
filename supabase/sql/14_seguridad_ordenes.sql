-- =====================================================================
-- METALPLAFER360 · 14 · PERMISOS DE LAS ÓRDENES DE TRABAJO (FASE 4)
--
-- Regla de esta fase:
--   · Solo administración crea, modifica, valida y devuelve órdenes.
--   · Un trabajador ve ÚNICAMENTE las órdenes que tiene asignadas y los
--     proyectos de esas órdenes. Nada más: ni clientes ajenos, ni fichas,
--     ni presupuestos, ni las horas de sus compañeros.
--   · Aunque alguien manipule una petición desde el móvil, la base de
--     datos no le devuelve ni una fila que no le corresponda.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Permisos de tabla
-- ---------------------------------------------------------------------
grant select, insert, update on public.work_orders to authenticated;

-- Los partes y los avisos NO se escriben directamente: solo a través de
-- las funciones, que comprueban las reglas.
grant select on public.work_order_workers, public.notifications to authenticated;

grant all on public.work_orders, public.work_order_workers, public.notifications
  to service_role;

grant select on public.project_orders, public.order_hours, public.order_team
  to authenticated, service_role;

grant execute on function
  public.assign_order_workers(uuid, uuid[]),
  public.save_order_part(uuid, text, numeric, boolean),
  public.validate_order(uuid),
  public.return_order(uuid, text),
  public.mark_notifications_read(uuid[]),
  public.worker_has_order(uuid),
  public.worker_can_edit_order(uuid),
  public.shares_order_with(uuid),
  public.order_status_es(public.order_status),
  public.order_type_es(public.order_type),
  public.order_caption(uuid),
  public.fmt_hours(numeric)
  to authenticated;

-- 1b) Funciones internas: solo desde dentro de la base de datos.
revoke execute on function
  public.notify_user(uuid, public.notification_kind, text, text, uuid),
  public.notify_admins(public.notification_kind, text, text, uuid),
  public.notify_order_workers(uuid, public.notification_kind, text, text),
  public.recompute_order_status(uuid)
  from authenticated;

-- 1c) Nadie sin sesión toca nada (Supabase concede permisos al rol
--     anónimo sobre cada tabla nueva de forma automática).
revoke all on public.work_orders, public.work_order_workers, public.notifications,
              public.project_orders, public.order_hours, public.order_team
  from anon;

revoke execute on function
  public.assign_order_workers(uuid, uuid[]),
  public.save_order_part(uuid, text, numeric, boolean),
  public.validate_order(uuid),
  public.return_order(uuid, text),
  public.mark_notifications_read(uuid[]),
  public.worker_has_order(uuid),
  public.worker_can_edit_order(uuid),
  public.shares_order_with(uuid),
  public.notify_user(uuid, public.notification_kind, text, text, uuid),
  public.notify_admins(public.notification_kind, text, text, uuid),
  public.notify_order_workers(uuid, public.notification_kind, text, text),
  public.recompute_order_status(uuid),
  public.order_status_es(public.order_status),
  public.order_type_es(public.order_type),
  public.order_caption(uuid),
  public.fmt_hours(numeric)
  from anon, public;

-- ---------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------
alter table public.work_orders        enable row level security;
alter table public.work_order_workers enable row level security;
alter table public.notifications      enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('work_orders', 'work_order_workers', 'notifications') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ÓRDENES · el trabajador solo ve las suyas
create policy orders_select on public.work_orders for select to authenticated
  using (public.is_admin() or public.worker_has_order(id));

create policy orders_insert on public.work_orders for insert to authenticated
  with check (public.is_admin());

create policy orders_update on public.work_orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Las órdenes no se borran: se archivan.
revoke delete, truncate on public.work_orders from authenticated;

-- PARTES · cada trabajador ve el suyo y nada más.
-- Los nombres de los compañeros se consultan en la vista order_team,
-- que no muestra las horas de los demás.
create policy order_workers_select on public.work_order_workers for select to authenticated
  using (public.is_admin() or worker_id = auth.uid());

revoke insert, update, delete, truncate on public.work_order_workers from authenticated;

-- AVISOS · cada persona ve los suyos
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete, truncate on public.notifications from authenticated;

-- ---------------------------------------------------------------------
-- 3) PERFILES · el trabajador ve a los compañeros de sus órdenes
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    public.is_admin()
    or id = auth.uid()
    or (public.is_active_user() and active and role = 'admin')
    or (public.is_active_user() and active and public.shares_order_with(id))
  );

-- ---------------------------------------------------------------------
-- 4) DOCUMENTOS Y COMENTARIOS · se rehacen incluyendo las órdenes
--
-- El trabajador puede subir FOTOGRAFÍAS y la FIRMA del cliente a sus
-- órdenes, pero solo el día de la orden o después, y solo mientras la
-- orden siga abierta. Documentos administrativos, ninguno.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public' and tablename in ('documents', 'comments') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy documents_select on public.documents for select to authenticated
  using (
    public.is_admin()
    or (deleted_at is null and (
          (ficha_id   is not null and public.worker_has_ficha(ficha_id))
       or (project_id is not null and public.worker_can_see_project(project_id))
       or (order_id   is not null and public.worker_has_order(order_id))))
  );

create policy documents_insert on public.documents for insert to authenticated
  with check (
    public.is_admin()
    or (order_id is not null
        and uploaded_by = auth.uid()
        and category in ('foto', 'video', 'firma')
        and deleted_at is null
        and public.worker_can_edit_order(order_id))
  );

create policy documents_update on public.documents for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Solo se elimina del todo lo que ya está en la papelera.
create policy documents_delete on public.documents for delete to authenticated
  using (public.is_admin() and deleted_at is not null);

create policy comments_select on public.comments for select to authenticated
  using (
    public.is_admin()
    or (ficha_id   is not null and public.worker_has_ficha(ficha_id))
    or (project_id is not null and public.worker_can_see_project(project_id))
    or (order_id   is not null and public.worker_has_order(order_id))
  );

create policy comments_insert on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and (public.is_admin()
      or (ficha_id   is not null and public.worker_has_ficha(ficha_id))
      or (project_id is not null and public.worker_can_see_project(project_id))
      or (order_id   is not null and public.worker_has_order(order_id)))
  );

-- ---------------------------------------------------------------------
-- 5) ALMACENAMIENTO
-- Rutas:  fichas/<id>/…   ·   projects/<id>/…   ·   orders/<id>/…
-- ---------------------------------------------------------------------
create or replace function public.storage_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (
        case split_part(p_name, '/', 1)
          when 'fichas'   then public.worker_has_ficha(public.try_uuid(split_part(p_name, '/', 2)))
          when 'projects' then public.worker_can_see_project(public.try_uuid(split_part(p_name, '/', 2)))
          when 'orders'   then public.worker_has_order(public.try_uuid(split_part(p_name, '/', 2)))
          else false
        end
        -- Lo que está en la papelera deja de verse.
        and not exists (
          select 1 from public.documents d
           where d.storage_path = p_name and d.deleted_at is not null)
      );
$$;

-- Los trabajadores solo suben archivos a la carpeta de una orden suya,
-- y solo mientras puedan trabajar en ella (su fecha ya ha llegado y
-- todavía no está validada).
create or replace function public.storage_can_upload(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (split_part(p_name, '/', 1) = 'orders'
          and public.worker_can_edit_order(public.try_uuid(split_part(p_name, '/', 2))));
$$;
