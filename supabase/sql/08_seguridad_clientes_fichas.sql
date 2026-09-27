-- =====================================================================
-- METALPLAFER360 · 08 · PERMISOS DE CLIENTES Y FICHAS (FASE 2)
--
-- Regla de esta fase: SOLO administración crea y modifica clientes y
-- fichas. Un trabajador no ve nada de este módulo, salvo las visitas y
-- avisos que se le asignen (se usará en la fase del área de trabajador).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Permisos de tabla (RLS decide después qué filas)
-- ---------------------------------------------------------------------
grant select, insert, update, delete on
  public.clients, public.client_contacts, public.fichas,
  public.documents, public.comments
  to authenticated;

grant all on
  public.clients, public.client_contacts, public.fichas,
  public.documents, public.comments
  to service_role;

grant select on public.budgets, public.visits, public.notices, public.client_activity
  to authenticated, service_role;

grant execute on function
  public.suggest_clients(text, int),
  public.worker_has_ficha(uuid),
  public.worker_can_see_client(uuid),
  public.trash_document(uuid),
  public.restore_document(uuid),
  public.label_es(text),
  public.norm(text)
  to authenticated;

-- 1b) Nadie sin iniciar sesión toca nada.
--     IMPORTANTE: Supabase concede permisos al rol «anon» sobre cada tabla
--     nueva de forma automática. Aunque RLS ya impediría ver datos, aquí
--     se retira el permiso del todo: dos cerraduras en vez de una.
revoke all on
  public.clients, public.client_contacts, public.fichas,
  public.documents, public.comments,
  public.budgets, public.visits, public.notices, public.client_activity
  from anon;

revoke execute on function
  public.suggest_clients(text, int),
  public.worker_has_ficha(uuid),
  public.worker_can_see_client(uuid),
  public.trash_document(uuid),
  public.restore_document(uuid),
  public.valid_ficha_status(public.ficha_type, text),
  public.label_es(text),
  public.norm(text)
  from anon, public;

-- ---------------------------------------------------------------------
-- 2) Activar RLS y limpiar políticas anteriores de estas tablas
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clients', 'client_contacts', 'fichas', 'documents', 'comments'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('clients', 'client_contacts', 'fichas', 'documents', 'comments') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- CLIENTES · no se borran nunca desde la aplicación
-- ---------------------------------------------------------------------
create policy clients_select on public.clients for select to authenticated
  using (public.is_admin() or (public.is_active_user() and public.worker_can_see_client(id)));

create policy clients_insert on public.clients for insert to authenticated
  with check (public.is_admin());

create policy clients_update on public.clients for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- CONTACTOS
-- ---------------------------------------------------------------------
create policy contacts_select on public.client_contacts for select to authenticated
  using (public.is_admin() or (public.is_active_user() and public.worker_can_see_client(client_id)));

create policy contacts_insert on public.client_contacts for insert to authenticated
  with check (public.is_admin());

create policy contacts_update on public.client_contacts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy contacts_delete on public.client_contacts for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- FICHAS · un trabajador solo ve las visitas y avisos que tiene asignados
-- ---------------------------------------------------------------------
create policy fichas_select on public.fichas for select to authenticated
  using (public.is_admin() or public.worker_has_ficha(id));

create policy fichas_insert on public.fichas for insert to authenticated
  with check (public.is_admin());

create policy fichas_update on public.fichas for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- DOCUMENTOS · la papelera solo la ve administración
-- ---------------------------------------------------------------------
create policy documents_select on public.documents for select to authenticated
  using (
    public.is_admin()
    or (deleted_at is null and ficha_id is not null and public.worker_has_ficha(ficha_id))
  );

create policy documents_insert on public.documents for insert to authenticated
  with check (public.is_admin());

create policy documents_update on public.documents for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Solo se puede borrar del todo lo que ya está en la papelera.
create policy documents_delete on public.documents for delete to authenticated
  using (public.is_admin() and deleted_at is not null);

-- ---------------------------------------------------------------------
-- COMENTARIOS · no se editan ni se borran: son un registro de lo dicho
-- ---------------------------------------------------------------------
create policy comments_select on public.comments for select to authenticated
  using (public.is_admin() or (ficha_id is not null and public.worker_has_ficha(ficha_id)));

create policy comments_insert on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and (public.is_admin() or (ficha_id is not null and public.worker_has_ficha(ficha_id)))
  );

-- ---------------------------------------------------------------------
-- 3) Retirada explícita de permisos peligrosos
-- ---------------------------------------------------------------------
revoke delete, truncate on public.clients, public.fichas from authenticated;
revoke update, delete, truncate on public.comments from authenticated;

-- ---------------------------------------------------------------------
-- 4) ALMACENAMIENTO DE ARCHIVOS
-- Ruta de los archivos de una ficha:  fichas/<id-de-la-ficha>/<archivo>
-- ---------------------------------------------------------------------
create or replace function public.storage_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (
        split_part(p_name, '/', 1) = 'fichas'
        and public.worker_has_ficha(public.try_uuid(split_part(p_name, '/', 2)))
        -- Lo que está en la papelera deja de verse.
        and not exists (
          select 1 from public.documents d
           where d.storage_path = p_name and d.deleted_at is not null)
      );
$$;

-- En esta fase solo administración sube archivos. Los trabajadores
-- subirán fotos y firmas en la fase de órdenes de trabajo.
create or replace function public.storage_can_upload(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin();
$$;
