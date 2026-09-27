-- =====================================================================
-- METALPLAFER360 · 17 · PERMISOS DE MATERIAL, CALENDARIO Y COBROS (FASE 5)
--
-- Regla de esta fase:
--   · Solo administración crea y modifica material, y solo ella ve los
--     cobros: el dinero no sale del despacho.
--   · Un trabajador puede COMUNICAR que falta material en sus órdenes y
--     ver el material pendiente de sus propios proyectos. Nada más.
--   · El calendario del trabajador solo trae lo suyo, porque la vista
--     respeta las políticas de cada tabla.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Permisos de tabla
-- ---------------------------------------------------------------------
grant select, insert, update on public.materials to authenticated;
grant select on public.material_requests, public.payments to authenticated;

grant all on public.materials, public.material_requests, public.payments to service_role;

grant select on public.project_billing, public.project_materials, public.v_calendar
  to authenticated, service_role;

grant execute on function
  public.submit_material_request(uuid, text),
  public.accept_material_request(uuid, text, numeric, text, date, date, text),
  public.discard_material_request(uuid, text),
  public.notify_late_materials(),
  public.register_payment(uuid, numeric, date, text),
  public.delete_payment(uuid),
  public.suggest_suppliers(text, int),
  public.request_status_es(public.request_status),
  public.fmt_units(numeric)
  to authenticated;

-- 1b) Funciones internas: solo desde dentro de la base de datos.
revoke execute on function public.recompute_billing(uuid) from authenticated;

-- 1c) Nadie sin sesión toca nada (Supabase concede permisos al rol
--     anónimo sobre cada tabla nueva de forma automática).
revoke all on public.materials, public.material_requests, public.payments,
              public.project_billing, public.project_materials, public.v_calendar
  from anon;

revoke execute on function
  public.submit_material_request(uuid, text),
  public.accept_material_request(uuid, text, numeric, text, date, date, text),
  public.discard_material_request(uuid, text),
  public.notify_late_materials(),
  public.register_payment(uuid, numeric, date, text),
  public.delete_payment(uuid),
  public.recompute_billing(uuid),
  public.suggest_suppliers(text, int),
  public.request_status_es(public.request_status),
  public.fmt_units(numeric)
  from anon, public;

-- ---------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------
alter table public.materials         enable row level security;
alter table public.material_requests enable row level security;
alter table public.payments          enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('materials', 'material_requests', 'payments') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- MATERIAL · el trabajador lo ve, pero no lo toca.
create policy materials_select on public.materials for select to authenticated
  using (public.is_admin() or public.worker_can_see_project(project_id));

create policy materials_insert on public.materials for insert to authenticated
  with check (public.is_admin());

create policy materials_update on public.materials for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- El material no se borra: se archiva.
revoke delete, truncate on public.materials from authenticated;

-- COMUNICACIONES · cada trabajador ve las suyas; se crean con la función.
create policy requests_select on public.material_requests for select to authenticated
  using (public.is_admin() or worker_id = auth.uid());

revoke insert, update, delete, truncate on public.material_requests from authenticated;

-- COBROS · solo administración. Un trabajador no ve ni un euro.
create policy payments_select on public.payments for select to authenticated
  using (public.is_admin());

revoke insert, update, delete, truncate on public.payments from authenticated;
