-- =====================================================================
-- METALPLAFER360 · 11 · PERMISOS DE PROYECTOS (FASE 3)
--
-- Solo administración crea, modifica y cambia de fase los proyectos.
-- La regla se aplica en la base de datos, no en los botones.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Permisos de tabla
-- ---------------------------------------------------------------------
grant select, insert, update on public.projects, public.project_substatuses to authenticated;
grant all on public.projects, public.project_substatuses to service_role;
grant select on public.client_projects, public.v_phase_suggestions to authenticated, service_role;

grant execute on function
  public.convert_budget_to_project(uuid, text),
  public.change_project_phase(uuid, public.project_phase),
  public.set_project_substatuses(uuid, text[]),
  public.set_billing_status(uuid, public.billing_status),
  public.finalize_project(uuid),
  public.reopen_project(uuid),
  public.fmt_eur(numeric)
  to authenticated;

-- Nadie sin sesión toca nada (Supabase concede permisos automáticamente
-- al rol anónimo sobre cada tabla nueva: aquí se los quitamos).
revoke all on public.projects, public.project_substatuses,
              public.client_projects, public.v_phase_suggestions
  from anon;

revoke execute on function
  public.convert_budget_to_project(uuid, text),
  public.change_project_phase(uuid, public.project_phase),
  public.set_project_substatuses(uuid, text[]),
  public.set_billing_status(uuid, public.billing_status),
  public.finalize_project(uuid),
  public.reopen_project(uuid),
  public.valid_substatus(public.project_phase, text),
  public.fmt_eur(numeric)
  from anon, public;

-- ---------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------
alter table public.projects           enable row level security;
alter table public.project_substatuses enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public' and tablename in ('projects', 'project_substatuses') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- ¿Puede un trabajador ver este proyecto?
-- En esta fase, no: los trabajadores llegarán a los proyectos a través de
-- sus órdenes de trabajo. La función queda preparada para ampliarla
-- entonces sin tocar las políticas.
-- ---------------------------------------------------------------------
create or replace function public.worker_can_see_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select false;
$$;
grant execute on function public.worker_can_see_project(uuid) to authenticated;
revoke execute on function public.worker_can_see_project(uuid) from anon, public;

create policy projects_select on public.projects for select to authenticated
  using (public.is_admin() or public.worker_can_see_project(id));

create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_admin());

create policy projects_update on public.projects for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy substatuses_select on public.project_substatuses for select to authenticated
  using (public.is_admin() or public.worker_can_see_project(project_id));

create policy substatuses_admin on public.project_substatuses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Los proyectos no se borran: se archivan.
revoke delete, truncate on public.projects from authenticated;

-- ---------------------------------------------------------------------
-- 3) DOCUMENTOS Y COMENTARIOS DE PROYECTOS
--    Se rehacen las políticas de la fase 2 incluyendo los proyectos.
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
       or (project_id is not null and public.worker_can_see_project(project_id))))
  );

create policy documents_insert on public.documents for insert to authenticated
  with check (public.is_admin());

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
  );

create policy comments_insert on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and (public.is_admin()
      or (ficha_id   is not null and public.worker_has_ficha(ficha_id))
      or (project_id is not null and public.worker_can_see_project(project_id)))
  );

-- ---------------------------------------------------------------------
-- 4) ALMACENAMIENTO
-- Rutas:  fichas/<id>/<archivo>   ·   projects/<id>/<archivo>
-- ---------------------------------------------------------------------
create or replace function public.storage_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (
        case split_part(p_name, '/', 1)
          when 'fichas'   then public.worker_has_ficha(public.try_uuid(split_part(p_name, '/', 2)))
          when 'projects' then public.worker_can_see_project(public.try_uuid(split_part(p_name, '/', 2)))
          else false
        end
        -- Lo que está en la papelera deja de verse.
        and not exists (
          select 1 from public.documents d
           where d.storage_path = p_name and d.deleted_at is not null)
      );
$$;
