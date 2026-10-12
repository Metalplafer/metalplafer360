-- =====================================================================
-- METALPLAFER360 · 28 · PERMISOS DE PROYECTOS, PARTES Y DINERO
--
-- Las reglas de esta fase:
--
--   · Un trabajador entra en un proyecto porque está ASIGNADO a él.
--   · Un trabajador NO ve el dinero. Ni el importe, ni la paga y señal,
--     ni la facturación. Y no es que no se le enseñe en la pantalla: la
--     base de datos no se lo devuelve aunque pida la columna a mano.
--   · Un parte es de quien lo escribe. Lo ve él y administración.
--   · Validar y rechazar es solo de administración.
--
-- Ejecutar después del archivo 27.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) PERMISOS DE TABLA Y DE VISTA
-- ---------------------------------------------------------------------
-- Ni los partes ni las asignaciones se escriben a pelo: se pasa siempre
-- por las funciones, que son las que comprueban las reglas.
grant select on public.work_reports, public.project_workers to authenticated;
grant all    on public.work_reports, public.project_workers to service_role;

grant select on public.worker_projects, public.project_team, public.project_hours,
                public.project_reports, public.hours_worked
  to authenticated, service_role;

grant execute on function
  public.assign_project_workers(uuid, uuid[]),
  public.save_work_report(uuid, uuid, public.order_type, date, text, numeric, boolean, boolean),
  public.validate_work_report(uuid),
  public.reject_work_report(uuid, text),
  public.assign_report_to_project(uuid, uuid),
  public.worker_can_edit_report(uuid),
  public.owns_report(uuid),
  public.shares_project_with(uuid),
  public.report_status_es(public.report_status)
  to authenticated;

-- Funciones internas: solo desde dentro de la base de datos.
revoke execute on function
  public.notify_user_report(uuid, public.notification_kind, text, text, uuid),
  public.notify_admins_report(public.notification_kind, text, text, uuid)
  from authenticated;

-- Nadie sin sesión toca nada. Supabase da permisos al rol anónimo sobre
-- cada tabla nueva de forma automática: aquí se los quitamos.
revoke all on public.work_reports, public.project_workers,
              public.worker_projects, public.project_team, public.project_hours,
              public.project_reports, public.hours_worked
  from anon;

revoke execute on function
  public.assign_project_workers(uuid, uuid[]),
  public.save_work_report(uuid, uuid, public.order_type, date, text, numeric, boolean, boolean),
  public.validate_work_report(uuid),
  public.reject_work_report(uuid, text),
  public.assign_report_to_project(uuid, uuid),
  public.worker_can_edit_report(uuid),
  public.owns_report(uuid),
  public.shares_project_with(uuid),
  public.report_status_es(public.report_status),
  public.notify_user_report(uuid, public.notification_kind, text, text, uuid),
  public.notify_admins_report(public.notification_kind, text, text, uuid)
  from anon, public;


-- ---------------------------------------------------------------------
-- 2) EL DINERO DEL PROYECTO DEJA DE ESTAR AL ALCANCE DEL TRABAJADOR
--
-- POR QUÉ ESTE CAMBIO
-- RLS filtra FILAS, no COLUMNAS. Mientras al trabajador se le dejara ver
-- la fila del proyecto, podía pedir «budget_amount» y «advance_amount»
-- con una petición hecha a mano y la base de datos se los daba. La
-- pantalla no los enseñaba, pero estaban ahí.
--
-- CÓMO SE CIERRA
-- «projects» pasa a ser de administración y punto. El trabajador lee la
-- vista «worker_projects», que sencillamente no tiene esas columnas.
--
-- Lo que cuelga de ahí se arregla solo: «project_billing» se ejecuta con
-- los permisos de quien pregunta, así que al cerrarle «projects» al
-- trabajador deja de devolverle también la facturación.
-- ---------------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (public.is_admin());


-- ---------------------------------------------------------------------
-- 3) RLS DE LAS TABLAS NUEVAS
-- ---------------------------------------------------------------------
alter table public.project_workers enable row level security;
alter table public.work_reports    enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('project_workers', 'work_reports') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ASIGNACIONES · el trabajador ve las de los proyectos a los que entra
-- (necesita saber con quién comparte el trabajo). Escribir, solo
-- administración, y solo a través de «assign_project_workers».
create policy project_workers_select on public.project_workers for select to authenticated
  using (public.is_admin() or public.worker_can_see_project(project_id));

revoke insert, update, delete, truncate on public.project_workers from authenticated;

-- PARTES · cada trabajador ve LOS SUYOS y nada más. Ni las horas de sus
-- compañeros, ni sus partes. Administración los ve todos.
create policy reports_select on public.work_reports for select to authenticated
  using (public.is_admin() or worker_id = auth.uid());

-- No se escriben directamente: «save_work_report» comprueba las reglas
-- (que el parte sea tuyo, que no esté validado, que el proyecto sea
-- tuyo, que las horas estén entre 0 y 24).
revoke insert, update, delete, truncate on public.work_reports from authenticated;


-- ---------------------------------------------------------------------
-- 4) PERFILES · el trabajador ve a los compañeros de SUS PROYECTOS
--
-- Se rehace la política entera para añadir el camino nuevo sin perder
-- los que ya había.
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    public.is_admin()
    or id = auth.uid()
    or (public.is_active_user() and active and role = 'admin')
    or (public.is_active_user() and active and public.shares_order_with(id))
    or (public.is_active_user() and active and public.shares_project_with(id))
  );


-- ---------------------------------------------------------------------
-- 5) DOCUMENTOS Y COMENTARIOS · ahora también los del parte
--
-- Se rehacen incluyendo el parte, manteniendo exactamente lo que ya
-- había para fichas, proyectos y órdenes.
--
-- El trabajador sube fotografías y la firma a SU parte, mientras el
-- parte siga abierto. Documentos administrativos, ninguno.
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
       or (order_id   is not null and public.worker_has_order(order_id))
       or (report_id  is not null and public.owns_report(report_id))))
  );

create policy documents_insert on public.documents for insert to authenticated
  with check (
    public.is_admin()
    or (uploaded_by = auth.uid()
        and deleted_at is null
        and category in ('foto', 'video', 'firma')
        and ((order_id  is not null and public.worker_can_edit_order(order_id))
          or (report_id is not null and public.worker_can_edit_report(report_id))))
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
    or (report_id  is not null and public.owns_report(report_id))
  );

-- Un comentario dirigido a alguien lo LEEN todos los que tienen acceso:
-- no es un mensaje privado, solo cambia a quién le llega el aviso. Por
-- eso «target_worker_id» no aparece en la política de lectura.
create policy comments_insert on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and (public.is_admin()
      or (ficha_id   is not null and public.worker_has_ficha(ficha_id))
      or (project_id is not null and public.worker_can_see_project(project_id))
      or (order_id   is not null and public.worker_has_order(order_id))
      or (report_id  is not null and public.owns_report(report_id)))
  );


-- ---------------------------------------------------------------------
-- 6) ALMACENAMIENTO
-- Rutas: fichas/<id>/… · projects/<id>/… · orders/<id>/… · reports/<id>/…
-- ---------------------------------------------------------------------
create or replace function public.storage_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (
        case split_part(p_name, '/', 1)
          when 'fichas'   then public.worker_has_ficha(public.try_uuid(split_part(p_name, '/', 2)))
          when 'projects' then public.worker_can_see_project(public.try_uuid(split_part(p_name, '/', 2)))
          when 'orders'   then public.worker_has_order(public.try_uuid(split_part(p_name, '/', 2)))
          when 'reports'  then public.owns_report(public.try_uuid(split_part(p_name, '/', 2)))
          else false
        end
        -- Lo que está en la papelera deja de verse.
        and not exists (
          select 1 from public.documents d
           where d.storage_path = p_name and d.deleted_at is not null)
      );
$$;

-- El trabajador solo sube archivos a una orden suya o a un parte suyo, y
-- solo mientras pueda trabajar en ellos.
create or replace function public.storage_can_upload(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (split_part(p_name, '/', 1) = 'orders'
          and public.worker_can_edit_order(public.try_uuid(split_part(p_name, '/', 2))))
      or (split_part(p_name, '/', 1) = 'reports'
          and public.worker_can_edit_report(public.try_uuid(split_part(p_name, '/', 2))));
$$;


-- El aviso de «falta material» desde un parte entra por la misma puerta
-- que el de una orden.
grant execute on function public.submit_material_request_report(uuid, text) to authenticated;
revoke execute on function public.submit_material_request_report(uuid, text) from anon, public;
