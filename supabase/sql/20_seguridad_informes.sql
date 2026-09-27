-- =====================================================================
-- METALPLAFER360 · 20 · PERMISOS DE INFORMES Y COPIAS (FASE 6)
--
-- Los informes, las copias de seguridad y la restauración son cosa de
-- administración. Un trabajador no puede ni consultarlos ni provocarlos,
-- manipule lo que manipule desde el navegador.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Permisos de tabla
-- ---------------------------------------------------------------------
grant select on public.backups to authenticated;
grant all    on public.backups to service_role;
grant select on public.storage_usage to authenticated, service_role;

grant execute on function
  public.dashboard_summary(date, date),
  public.report_projects(date, date),
  public.report_projects_by_phase(date, date),
  public.report_hours_by_worker(date, date),
  public.report_hours_by_project(date, date),
  public.report_materials(date, date),
  public.report_suppliers(date, date),
  public.set_company(jsonb),
  public.set_backup_settings(jsonb, int),
  public.set_max_file_mb(integer),
  public.set_preferences(jsonb),
  public.set_counter(text, int, int),
  public.backup_tables(),
  public.backup_counts(),
  public.start_backup(public.backup_kind, text),
  public.finish_backup(uuid, text, bigint, jsonb, int, text, text, text),
  public.expired_backups(),
  public.forget_backup(uuid),
  public.restore_data(jsonb, text[]),
  public.restore_scope_tables(text)
  to authenticated;

-- 1b) Piezas internas de la restauración: solo desde dentro de la base de datos.
revoke execute on function
  public.restore_table(text, jsonb),
  public.primary_key_of(text)
  from authenticated;

-- 1c) Nadie sin sesión.
revoke all on public.backups, public.storage_usage from anon;

revoke execute on function
  public.dashboard_summary(date, date),
  public.report_projects(date, date),
  public.report_projects_by_phase(date, date),
  public.report_hours_by_worker(date, date),
  public.report_hours_by_project(date, date),
  public.report_materials(date, date),
  public.report_suppliers(date, date),
  public.set_company(jsonb),
  public.set_backup_settings(jsonb, int),
  public.set_max_file_mb(integer),
  public.set_preferences(jsonb),
  public.set_counter(text, int, int),
  public.backup_tables(),
  public.backup_counts(),
  public.start_backup(public.backup_kind, text),
  public.finish_backup(uuid, text, bigint, jsonb, int, text, text, text),
  public.expired_backups(),
  public.forget_backup(uuid),
  public.restore_data(jsonb, text[]),
  public.restore_table(text, jsonb),
  public.restore_scope_tables(text),
  public.primary_key_of(text)
  from anon, public;

-- ---------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------
alter table public.backups enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'backups' loop
    execute format('drop policy if exists %I on public.backups', r.policyname);
  end loop;
end $$;

create policy backups_select on public.backups for select to authenticated
  using (public.is_admin());

-- Las copias se registran con las funciones, nunca escribiendo a mano.
revoke insert, update, delete, truncate on public.backups from authenticated;

-- ---------------------------------------------------------------------
-- 3) LECTURA COMPLETA PARA LAS COPIAS
--
-- Para poder generar una copia, administración necesita leer el historial
-- entero y la numeración. Ya podía: aquí solo se deja constancia de que
-- es intencionado y de que un trabajador sigue sin poder.
-- ---------------------------------------------------------------------
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_admin() or (public.is_active_user() and actor_id = auth.uid()));

drop policy if exists code_counters_select on public.code_counters;
create policy code_counters_select on public.code_counters for select to authenticated
  using (public.is_admin());
