-- =====================================================================
-- METALPLAFER360 · 29 · DOCUMENTACIÓN POR CATEGORÍAS Y BORRADO REAL
--
-- Dos cosas distintas en un mismo archivo porque las dos tocan permisos:
--
-- A) La documentación pasa a tener DOS categorías y solo dos:
--      · técnica / operativa  → la ve el trabajador asignado
--      · administrativa       → solo administración
--    Y no es que se le oculte: la base de datos no se la devuelve, y el
--    almacén no le firma el enlace.
--
-- B) Administración puede ELIMINAR de verdad trabajadores, presupuestos,
--    avisos y proyectos. Con una condición: no se destruye en silencio
--    el registro de producción ni el de dinero.
--
-- Ejecutar después del archivo 28.
-- =====================================================================


-- =====================================================================
-- A · LAS DOS CATEGORÍAS DE DOCUMENTACIÓN
-- =====================================================================

-- OJO: «category» ya existía y dice QUÉ ES el archivo (documento, foto,
-- vídeo, firma). Esto es otra cosa: dice QUIÉN PUEDE VERLO. Son dos ejes
-- distintos, por eso es una columna nueva y no un cambio de la anterior.
do $$ begin
  create type public.doc_scope as enum ('tecnica', 'administrativa');
exception when duplicate_object then null; end $$;

alter table public.documents
  add column if not exists scope public.doc_scope not null default 'tecnica';

comment on column public.documents.scope is
  'Quién puede verlo: «tecnica» el trabajador asignado, «administrativa» solo administración.';
comment on column public.documents.category is
  'Qué ES el archivo (documento, foto, vídeo, firma). No confundir con «scope».';

-- Se consulta en cada lectura de documentos y en cada firma de enlace.
create index if not exists documents_scope_idx on public.documents (scope);


-- ---------------------------------------------------------------------
-- MOVER UN DOCUMENTO DE CATEGORÍA
--
-- Sin descargar, sin borrar y sin volver a subir: el archivo no se
-- toca, solo cambia de categoría.
--
-- Se apaga el historial automático y se escribe una sola anotación
-- clara, igual que ya se hace al anular un cobro: si no, el historial
-- diría «modificó el archivo», que no cuenta lo que ha pasado.
-- ---------------------------------------------------------------------
create or replace function public.move_document_scope(p_doc uuid, p_scope public.doc_scope)
returns public.documents language plpgsql security definer set search_path = public as $$
declare d public.documents; v_donde text; v_antes public.doc_scope;
begin
  perform public.assert_admin();

  select * into d from public.documents where id = p_doc for update;
  if not found then
    raise exception 'No se encuentra el documento' using errcode = 'P0002';
  end if;

  if d.scope = p_scope then
    return d;   -- ya estaba ahí: no se toca nada ni se anota nada
  end if;
  v_antes := d.scope;

  perform set_config('app.skip_audit', 'on', true);
  update public.documents set scope = p_scope where id = p_doc returning * into d;
  perform set_config('app.skip_audit', 'off', true);

  -- A qué pertenece, para que el historial se lea del tirón.
  select coalesce(
    (select code from public.projects     where id = d.project_id),
    (select code from public.fichas       where id = d.ficha_id),
    (select code from public.work_orders  where id = d.order_id),
    (select code from public.work_reports where id = d.report_id))
    into v_donde;

  -- Se escribe directamente en el historial, y no con «log_event», para
  -- poder poner el CÓDIGO del proyecto: la pantalla del proyecto filtra
  -- su historial por ese código, y sin él el movimiento no aparecería
  -- donde el usuario lo va a buscar.
  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'mover_documento', 'documents', d.id, v_donde,
          public.actor_name() || ' movió «' || d.file_name || '» de ' ||
          public.doc_scope_es(v_antes) || ' a ' || public.doc_scope_es(p_scope) ||
          coalesce(' en ' || v_donde, ''),
          jsonb_build_object('documento', d.id, 'archivo', d.file_name,
                             'antes', v_antes, 'despues', p_scope, 'donde', v_donde),
          d.is_demo);

  return d;
end $$;

create or replace function public.doc_scope_es(p public.doc_scope) returns text
language sql immutable as $$
  select case p
    when 'tecnica'        then 'documentación técnica'
    when 'administrativa' then 'documentación administrativa'
  end $$;


-- ---------------------------------------------------------------------
-- PERMISOS DE LECTURA · se rehacen incluyendo la categoría
--
-- El único cambio respecto al archivo 28 es «and scope = 'tecnica'» en
-- la rama del trabajador. Todo lo demás se mantiene igual.
-- ---------------------------------------------------------------------
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (
    public.is_admin()
    or (deleted_at is null
        and scope = 'tecnica'
        and (
          (ficha_id   is not null and public.worker_has_ficha(ficha_id))
       or (project_id is not null and public.worker_can_see_project(project_id))
       or (order_id   is not null and public.worker_has_order(order_id))
       or (report_id  is not null and public.owns_report(report_id))))
  );

-- Lo que sube un trabajador (fotos del trabajo y firmas) es SIEMPRE
-- técnico: no puede colocar nada en la carpeta de administración.
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (
    public.is_admin()
    or (uploaded_by = auth.uid()
        and deleted_at is null
        and scope = 'tecnica'
        and category in ('foto', 'video', 'firma')
        and ((order_id  is not null and public.worker_can_edit_order(order_id))
          or (report_id is not null and public.worker_can_edit_report(report_id))))
  );


-- ---------------------------------------------------------------------
-- ALMACENAMIENTO · la categoría manda también aquí
--
-- Esto es lo que impide de verdad el acceso. El enlace a un archivo lo
-- firma Supabase comprobando antes esta función: si devuelve «false», no
-- hay enlace que firmar, y sin enlace no hay descarga ni URL que valga.
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
        -- Ni lo que está en la papelera, ni lo administrativo.
        and not exists (
          select 1 from public.documents d
           where d.storage_path = p_name
             and (d.deleted_at is not null or d.scope = 'administrativa'))
      );
$$;


-- =====================================================================
-- B · BORRADO REAL
--
-- Qué se protege y por qué:
--
--   · Las HORAS VALIDADAS son el registro de producción de la empresa.
--     Borrarlas cambiaría los totales de los proyectos y de los informes
--     sin que nadie se entere.
--   · Los COBROS son dinero cobrado de verdad.
--
-- Cuando no hay nada de eso, se borra y desaparece. Cuando lo hay, la
-- función se niega y DICE QUÉ es lo que hay, para que se pueda decidir.
--
-- El historial sobrevive siempre: «audit_log» no depende de nadie.
-- Cada borrado deja UNA anotación con el retrato de lo que se llevó, en
-- lugar de cincuenta anotaciones de las filas en cascada.
-- =====================================================================

-- "voided_by" se quedó en NO ACTION mientras que todas las demás
-- columnas de «quién hizo esto» están en SET NULL. Se corrige: si no,
-- bloquearía borrados sin ningún motivo.
alter table public.payments drop constraint if exists payments_voided_by_fkey;
alter table public.payments
  add constraint payments_voided_by_fkey foreign key (voided_by)
  references public.profiles(id) on delete set null;


-- ---------------------------------------------------------------------
-- ELIMINAR UN TRABAJADOR
-- ---------------------------------------------------------------------
create or replace function public.delete_worker(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_partes int; v_ordenes int; v_material int; v_horas numeric;
  v_borrador int;
begin
  perform public.assert_admin();

  select * into v from public.profiles where id = p_user;
  if not found then
    raise exception 'No se encuentra esa persona' using errcode = 'P0002';
  end if;

  if p_user = auth.uid() then
    raise exception 'No puedes eliminarte a ti mismo' using errcode = '22023';
  end if;

  if v.role = 'admin'
     and (select count(*) from public.profiles where role = 'admin' and active) <= 1 then
    raise exception 'No se puede eliminar al único administrador que queda' using errcode = '22023';
  end if;

  -- ¿Tiene trabajo registrado? Los borradores no cuentan: son suyos y
  -- no han entrado en ningún proyecto.
  select count(*) into v_partes
    from public.work_reports where worker_id = p_user and status <> 'borrador';
  select count(*) into v_borrador
    from public.work_reports where worker_id = p_user and status = 'borrador';
  select count(*) into v_ordenes
    from public.work_order_workers where worker_id = p_user;
  select count(*) into v_material
    from public.material_requests where worker_id = p_user;
  select coalesce(sum(hours), 0) into v_horas
    from public.work_reports where worker_id = p_user and status = 'validado';

  if v_partes > 0 or v_ordenes > 0 or v_material > 0 then
    raise exception
      'No se puede eliminar a % porque tiene trabajo registrado: % partes, % órdenes y % avisos de material (% validadas). Desactívalo en lugar de eliminarlo: dejará de entrar y su trabajo se conserva.',
      v.full_name, v_partes, v_ordenes, v_material, public.fmt_hours(v_horas)
      using errcode = '23503';
  end if;

  -- Una sola anotación, con el retrato de quién era.
  perform set_config('app.skip_audit', 'on', true);

  delete from public.work_reports where worker_id = p_user;   -- solo borradores
  delete from public.profiles where id = p_user;
  delete from auth.users where id = p_user;

  perform set_config('app.skip_audit', 'off', true);

  perform public.log_event('eliminar_trabajador', 'profiles',
    public.actor_name() || ' eliminó al trabajador ' || v.full_name ||
    ' (' || v.username || ')',
    jsonb_build_object('registro', to_jsonb(v), 'borradores_eliminados', v_borrador));

  return jsonb_build_object('ok', true, 'nombre', v.full_name,
                            'borradores_eliminados', v_borrador);
end $$;


-- ---------------------------------------------------------------------
-- ELIMINAR UN PRESUPUESTO, UNA VISITA O UN AVISO
--
-- Se lleva por delante sus comentarios y sus documentos (en cascada).
-- Los ARCHIVOS del almacén los retira antes la aplicación.
-- ---------------------------------------------------------------------
create or replace function public.delete_ficha(p_ficha uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f public.fichas;
  v_docs int; v_coment int; v_proyecto text;
begin
  perform public.assert_admin();

  select * into f from public.fichas where id = p_ficha;
  if not found then
    raise exception 'No se encuentra la ficha' using errcode = 'P0002';
  end if;

  select code into v_proyecto from public.projects where source_ficha_id = p_ficha limit 1;
  if v_proyecto is not null then
    raise exception
      'No se puede eliminar % porque de aquí salió el proyecto %. Archívala en lugar de eliminarla.',
      f.code, v_proyecto using errcode = '23503';
  end if;

  select count(*) into v_docs   from public.documents where ficha_id = p_ficha;
  select count(*) into v_coment from public.comments  where ficha_id = p_ficha;

  perform set_config('app.skip_audit', 'on', true);
  delete from public.fichas where id = p_ficha;
  perform set_config('app.skip_audit', 'off', true);

  perform public.log_event('eliminar_ficha', 'fichas',
    public.actor_name() || ' eliminó la ficha de ' || public.label_es(f.type::text) || ' ' || f.code ||
    case when v_docs > 0 then ' con ' || v_docs || ' archivo(s)' else '' end,
    jsonb_build_object('registro', to_jsonb(f), 'documentos', v_docs, 'comentarios', v_coment));

  return jsonb_build_object('ok', true, 'code', f.code,
                            'documentos', v_docs, 'comentarios', v_coment);
end $$;


-- ---------------------------------------------------------------------
-- ELIMINAR UN PROYECTO
--
-- En cascada se irían documentos, comentarios, materiales, COBROS,
-- órdenes y subestados, y los partes quedarían sueltos. Por eso se mira
-- antes si hay dinero cobrado u horas validadas: eso no se borra sin
-- que alguien lo decida a sabiendas.
-- ---------------------------------------------------------------------
create or replace function public.delete_project(p_project uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.projects;
  v_cobros int; v_horas numeric; v_partes int;
  v_docs int; v_ordenes int; v_material int;
begin
  perform public.assert_admin();

  select * into p from public.projects where id = p_project;
  if not found then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;

  select count(*) into v_cobros from public.payments
   where project_id = p_project and voided_at is null;

  select coalesce(sum(h.hours), 0) into v_horas
    from public.hours_worked h where h.project_id = p_project;

  if v_cobros > 0 or v_horas > 0 then
    raise exception
      'No se puede eliminar % porque tiene % cobro(s) y % de trabajo ya validado. Archívalo en lugar de eliminarlo: desaparece de los listados y no se pierde nada.',
      p.code, v_cobros, public.fmt_hours(v_horas) using errcode = '23503';
  end if;

  select count(*) into v_docs    from public.documents      where project_id = p_project;
  select count(*) into v_ordenes from public.work_orders    where project_id = p_project;
  select count(*) into v_material from public.materials     where project_id = p_project;
  select count(*) into v_partes  from public.work_reports   where project_id = p_project;

  perform set_config('app.skip_audit', 'on', true);
  delete from public.projects where id = p_project;
  perform set_config('app.skip_audit', 'off', true);

  perform public.log_event('eliminar_proyecto', 'projects',
    public.actor_name() || ' eliminó el proyecto ' || p.code || ' · ' || p.name ||
    ' (' || v_docs || ' archivos, ' || v_ordenes || ' órdenes, ' || v_material || ' materiales)',
    jsonb_build_object('registro', to_jsonb(p), 'documentos', v_docs,
                       'ordenes', v_ordenes, 'materiales', v_material,
                       'partes_desvinculados', v_partes));

  return jsonb_build_object('ok', true, 'code', p.code, 'documentos', v_docs,
                            'ordenes', v_ordenes, 'partes_desvinculados', v_partes);
end $$;


-- ---------------------------------------------------------------------
-- PERMISOS
-- ---------------------------------------------------------------------
grant execute on function
  public.move_document_scope(uuid, public.doc_scope),
  public.doc_scope_es(public.doc_scope),
  public.delete_worker(uuid),
  public.delete_ficha(uuid),
  public.delete_project(uuid)
  to authenticated;

revoke execute on function
  public.move_document_scope(uuid, public.doc_scope),
  public.doc_scope_es(public.doc_scope),
  public.delete_worker(uuid),
  public.delete_ficha(uuid),
  public.delete_project(uuid)
  from anon, public;
