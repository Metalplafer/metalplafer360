-- =====================================================================
-- METALPLAFER360 · PACK 2 · ARCHIVOS DE TRABAJADOR, PARTES Y TAREAS
--
-- Cuatro cosas, y cada una con el cambio más pequeño que la resuelve:
--
--   · MEJORA 2 · un trabajador asignado puede subir archivos a su AVISO,
--     no solo a su proyecto;
--   · MEJORA 3 · las fotos de un parte se ven también desde el proyecto
--     o el aviso al que pertenece ese parte, SIN copiar ni un archivo;
--   · MEJORA 5 · las tarjetas de Gestiones internas admiten adjuntos;
--   · MEJORA 6 · una tarjeta se puede eliminar, y no es lo mismo que
--     archivarla.
--
--
-- LO QUE **NO** HACE FALTA TOCAR, Y ES LA MITAD DEL TRABAJO
--
-- Antes de escribir nada se leyó qué permiten ya las políticas vivas, y
-- resulta que casi todo estaba hecho:
--
--   · LOS COMENTARIOS DE UN TRABAJADOR YA ESTÁN PERMITIDOS. La política
--     «comments_insert» (archivo 39) ya admite «worker_has_ficha» y
--     «worker_can_see_project». Un trabajador asignado puede comentar en
--     su aviso y en su proyecto desde que existe esa política: lo que
--     faltaba era la pantalla, no el permiso. Aquí NO se toca.
--
--   · SUBIR AL PROYECTO YA ESTABA PERMITIDO. «documents_insert» (archivo
--     35) y «storage_can_upload» (el mismo) ya dejan al trabajador
--     asignado subir fotos, vídeos y documentos a «projects/<id>».
--
--   · LEER YA ESTABA PERMITIDO. «documents_select» y «storage_can_read»
--     (archivo 39) ya contemplan «fichas/<id>» con «worker_has_ficha».
--     Es decir: el trabajador PODÍA leer los archivos de su aviso pero
--     NO subirlos. Esa asimetría es justo el agujero de la mejora 2.
--
--   · LOS ADJUNTOS DE GESTIONES INTERNAS NO NECESITAN TOCAR STORAGE.
--     Las dos funciones del almacén empiezan por «is_admin()», así que
--     administración ya puede leer y escribir en cualquier carpeta. Los
--     adjuntos van a «internas/<tarea>/…», una carpeta que la función
--     no conoce, y ahí cae en «else false»: ningún trabajador llega.
--
-- Así que lo que se cambia de verdad es: una rama en «documents_insert»,
-- una rama en «storage_can_upload», dos ramas en la vista
-- «related_documents», una columna más en «documents» y dos funciones
-- nuevas. Nada más.
--
-- MIGRACIÓN ESTRUCTURAL: una columna, una restricción regenerada, dos
-- índices, dos funciones reemplazadas, una vista ampliada y dos
-- funciones nuevas. NI UNA FILA EXISTENTE SE MODIFICA NI SE BORRA.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) MEJORA 5 · LOS ADJUNTOS DE UNA TARJETA SON ARCHIVOS NORMALES
--
-- Una columna de dueño más en «documents», exactamente como se hizo con
-- los proyectos (09), las órdenes (12), los partes (26), las obras (36)
-- y las solicitudes de correo (61). No se crea un segundo sistema de
-- archivos: los adjuntos de una tarjeta tienen su categoría, su
-- papelera, su cuota y sus permisos como cualquier otro.
--
-- «on delete cascade»: si la tarjeta se elimina —mejora 6—, sus fichas
-- de documento se van con ella. Los archivos del almacén NO: de eso se
-- encarga la función de borrado, que los deja identificados para que no
-- queden colgados sin que nadie se entere.
-- ---------------------------------------------------------------------
alter table public.documents add column if not exists internal_task_id uuid
  references public.internal_tasks(id) on delete cascade;

comment on column public.documents.internal_task_id is
  'La tarjeta de Gestiones internas a la que se adjuntó este archivo. Un archivo tiene un solo dueño: lo impone «documents_one_owner».';

-- La restricción se vuelve a declarar con las SIETE columnas, porque es
-- como se ha hecho cada vez que se añadió una. Sin esto, un adjunto de
-- tarjeta no entraría: «num_nonnulls» no contaría la columna nueva y
-- daría cero dueños.
alter table public.documents drop constraint if exists documents_one_owner;
alter table public.documents add constraint documents_one_owner
  check (num_nonnulls(ficha_id, project_id, order_id, report_id, work_id,
                      mail_request_id, internal_task_id) = 1);

create index if not exists documents_internal_task_idx
  on public.documents (internal_task_id, created_at);


-- ---------------------------------------------------------------------
-- 2) MEJORA 2 · EL TRABAJADOR SUBE ARCHIVOS A SU AVISO
--
-- La MISMA política del archivo 35 —su definición viva— con una rama
-- más. Se dice exactamente qué cambia:
--
--   ANTES · administración todo; el trabajador, fotos y vídeos en sus
--           órdenes y partes, y además documentos en sus PROYECTOS.
--   AHORA · lo mismo, y además fotos, vídeos y documentos en los AVISOS
--           Y VISITAS en los que está asignado («worker_has_ficha»).
--
-- Quién gana permiso: solo el trabajador que ya estaba asignado a ese
-- aviso, que es el mismo que YA PODÍA LEER sus archivos. No se abre
-- nada a trabajadores no asignados, ni a otros tipos de ficha por la
-- puerta de atrás: «worker_has_ficha» exige «type in ('visita','aviso')»
-- y que la ficha no esté archivada.
--
-- Lo que NO cambia: sigue exigiéndose «uploaded_by = auth.uid()»,
-- «deleted_at is null» y «scope = 'tecnica'». Un trabajador no puede
-- subir nada a la carpeta administrativa, ni a nombre de otro.
-- ---------------------------------------------------------------------
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (
    public.is_admin()
    or (uploaded_by = auth.uid()
        and deleted_at is null
        and scope = 'tecnica'
        and (
          (category in ('foto', 'video', 'firma')
           and ((order_id  is not null and public.worker_can_edit_order(order_id))
             or (report_id is not null and public.worker_can_edit_report(report_id))))
       or (category in ('foto', 'video', 'firma', 'documento')
           and project_id is not null and public.worker_can_see_project(project_id))
       -- PACK 2 · MEJORA 2 · y en los avisos y visitas que tiene asignados.
       or (category in ('foto', 'video', 'firma', 'documento')
           and ficha_id is not null and public.worker_has_ficha(ficha_id))
        ))
  );

comment on policy documents_insert on public.documents is
  'El trabajador registra archivos TÉCNICOS en sus órdenes, sus partes, sus proyectos y sus avisos, y siempre a su nombre. Lo administrativo es solo de administración.';


-- ---------------------------------------------------------------------
-- 3) MEJORA 2 · Y EL ALMACÉN TIENE QUE DEJARLE ESCRIBIR
--
-- De nada sirve la política de arriba si Supabase no le deja poner el
-- archivo: son dos puertas distintas y hay que abrir las dos.
--
-- La MISMA función del archivo 35 con una rama más:
--
--   ANTES · «orders/<id>», «reports/<id>» y «projects/<id>».
--   AHORA · lo mismo y «fichas/<id>» para quien tenga ese aviso.
--
-- Se usa «worker_has_ficha», la misma función con la que YA se le
-- dejaba LEER esa carpeta en «storage_can_read» (archivo 39). Así las
-- dos puertas usan la misma llave y no pueden desajustarse.
-- ---------------------------------------------------------------------
create or replace function public.storage_can_upload(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (split_part(p_name, '/', 1) = 'orders'
          and public.worker_can_edit_order(public.try_uuid(split_part(p_name, '/', 2))))
      or (split_part(p_name, '/', 1) = 'reports'
          and public.worker_can_edit_report(public.try_uuid(split_part(p_name, '/', 2))))
      -- FASE 2.2 · los archivos de un proyecto al que está asignado.
      or (split_part(p_name, '/', 1) = 'projects'
          and public.worker_can_see_project(public.try_uuid(split_part(p_name, '/', 2))))
      -- PACK 2 · MEJORA 2 · y los de un aviso o visita que tiene asignado.
      or (split_part(p_name, '/', 1) = 'fichas'
          and public.worker_has_ficha(public.try_uuid(split_part(p_name, '/', 2))));
$$;


-- ---------------------------------------------------------------------
-- 4) MEJORA 3 · LAS FOTOS DE UN PARTE, VISTAS DESDE SU PROYECTO O AVISO
--
-- Se pidió que NO se dupliquen archivos. Y no se duplican: no se copia
-- ni se mueve nada. Se mira donde están, que es exactamente lo que ya
-- hacía esta vista con los presupuestos, las visitas y los correos.
--
-- La MISMA vista del archivo 61 —su definición viva, con sus seis
-- ramas— con DOS más al final:
--
--   7) lo que un PROYECTO ve de los partes hechos sobre él;
--   8) lo que un AVISO o VISITA ve de los partes hechos sobre él.
--
-- MISMAS COLUMNAS y en el mismo orden, porque una vista solo admite
-- añadir columnas al final y aquí no se añade ninguna.
--
-- Un parte SIN proyecto ni aviso simplemente no aparece: el «join» no
-- encuentra con qué emparejarlo. No hay error ni fila rara que tratar,
-- que era lo que se pedía comprobar.
--
-- Y el archivo sigue siendo del parte: su dueño en «documents» no se
-- toca, así que retirarlo se sigue haciendo desde el parte y los
-- permisos siguen siendo los del parte.
-- ---------------------------------------------------------------------
create or replace view public.related_documents with (security_invoker = true) as
  -- 1) Lo que un PROYECTO hereda de su presupuesto de origen.
  select 'proyecto'::text                         as para_tipo,
         p.id                                     as para_id,
         'presupuesto'::text                      as origen_tipo,
         f.id                                     as origen_id,
         f.code                                   as origen_code,
         coalesce(f.scheduled_date, f.created_at::date) as origen_fecha,
         d.id,
         d.bucket,
         d.storage_path,
         d.file_name,
         d.mime_type,
         d.size_bytes,
         d.category,
         d.scope,
         d.uploaded_by,
         pf.full_name                             as uploader_name,
         d.created_at
    from public.projects p
    join public.fichas f    on f.id = p.source_ficha_id
    join public.documents d on d.ficha_id = f.id and d.deleted_at is null
    left join public.profiles pf on pf.id = d.uploaded_by

  union all
  -- 2) Lo que un PROYECTO ve de las visitas vinculadas a él.
  select 'proyecto'::text, p.id,
         'visita'::text, v.id, v.code,
         coalesce(v.scheduled_date, v.created_at::date),
         d.id, d.bucket, d.storage_path, d.file_name, d.mime_type, d.size_bytes,
         d.category, d.scope, d.uploaded_by, pf.full_name, d.created_at
    from public.projects p
    join public.fichas v    on v.linked_project_id = p.id and v.type = 'visita'
    join public.documents d on d.ficha_id = v.id and d.deleted_at is null
    left join public.profiles pf on pf.id = d.uploaded_by

  union all
  -- 3) Y de las visitas que se vincularon a su PRESUPUESTO de origen.
  select 'proyecto'::text, p.id,
         'visita'::text, v.id, v.code,
         coalesce(v.scheduled_date, v.created_at::date),
         d.id, d.bucket, d.storage_path, d.file_name, d.mime_type, d.size_bytes,
         d.category, d.scope, d.uploaded_by, pf.full_name, d.created_at
    from public.projects p
    join public.fichas v    on v.linked_ficha_id = p.source_ficha_id and v.type = 'visita'
    join public.documents d on d.ficha_id = v.id and d.deleted_at is null
    left join public.profiles pf on pf.id = d.uploaded_by

  union all
  -- 4) Lo que un PRESUPUESTO o un AVISO ve de sus visitas vinculadas.
  select case when o.type = 'aviso' then 'aviso' else 'presupuesto' end,
         o.id,
         'visita'::text, v.id, v.code,
         coalesce(v.scheduled_date, v.created_at::date),
         d.id, d.bucket, d.storage_path, d.file_name, d.mime_type, d.size_bytes,
         d.category, d.scope, d.uploaded_by, pf.full_name, d.created_at
    from public.fichas o
    join public.fichas v    on v.linked_ficha_id = o.id and v.type = 'visita'
    join public.documents d on d.ficha_id = v.id and d.deleted_at is null
    left join public.profiles pf on pf.id = d.uploaded_by

  union all
  -- 5) MEJORA 6 · Lo que una FICHA ve de la solicitud de correo de la
  --    que nació: las fotos y los planos que mandó el cliente.
  select case when o.type = 'aviso' then 'aviso' else 'presupuesto' end,
         o.id,
         'correo'::text, m.id, m.code,
         m.received_at::date,
         d.id, d.bucket, d.storage_path, d.file_name, d.mime_type, d.size_bytes,
         d.category, d.scope, d.uploaded_by, pf.full_name, d.created_at
    from public.fichas o
    join public.mail_requests m on m.target_ficha_id = o.id
    join public.documents d on d.mail_request_id = m.id and d.deleted_at is null
    left join public.profiles pf on pf.id = d.uploaded_by

  union all
  -- 6) Y lo que ve un PROYECTO: de la solicitud vinculada directamente a
  --    él, y de la que dio origen a su presupuesto. Así los archivos del
  --    correo del cliente llegan hasta el proyecto sin copiarse.
  select 'proyecto'::text, p.id,
         'correo'::text, m.id, m.code,
         m.received_at::date,
         d.id, d.bucket, d.storage_path, d.file_name, d.mime_type, d.size_bytes,
         d.category, d.scope, d.uploaded_by, pf.full_name, d.created_at
    from public.projects p
    join public.mail_requests m
      on m.target_project_id = p.id
      or (m.target_ficha_id is not null and m.target_ficha_id = p.source_ficha_id)
    join public.documents d on d.mail_request_id = m.id and d.deleted_at is null
    left join public.profiles pf on pf.id = d.uploaded_by

  union all
  -- 7) PACK 2 · MEJORA 3 · lo que un PROYECTO ve de los partes de
  --    trabajo hechos sobre él. Las fotos que sube el trabajador al
  --    rellenar un parte dejan de quedarse dentro del parte.
  select 'proyecto'::text, p.id,
         'parte'::text, r.id, r.code,
         r.work_date,
         d.id, d.bucket, d.storage_path, d.file_name, d.mime_type, d.size_bytes,
         d.category, d.scope, d.uploaded_by, pf.full_name, d.created_at
    from public.projects p
    join public.work_reports r on r.project_id = p.id
    join public.documents d on d.report_id = r.id and d.deleted_at is null
    left join public.profiles pf on pf.id = d.uploaded_by

  union all
  -- 8) PACK 2 · MEJORA 3 · y lo mismo para un AVISO o una VISITA: los
  --    partes también se hacen sobre avisos (archivo 38).
  select case when o.type = 'aviso' then 'aviso' else 'presupuesto' end,
         o.id,
         'parte'::text, r.id, r.code,
         r.work_date,
         d.id, d.bucket, d.storage_path, d.file_name, d.mime_type, d.size_bytes,
         d.category, d.scope, d.uploaded_by, pf.full_name, d.created_at
    from public.fichas o
    join public.work_reports r on r.ficha_id = o.id
    join public.documents d on d.report_id = r.id and d.deleted_at is null
    left join public.profiles pf on pf.id = d.uploaded_by;

comment on view public.related_documents is
  'Los archivos que una ficha, un proyecto o una obra VE sin que sean suyos: de su presupuesto, de sus visitas, del correo del que nació y de los partes hechos sobre él. No se copia ni un archivo.';

grant select on public.related_documents to authenticated, service_role;
revoke all   on public.related_documents from anon;


-- ---------------------------------------------------------------------
-- 4 bis) MEJORA 5 · EL TABLERO SABE SI UNA TARJETA LLEVA ADJUNTOS
--
-- La MISMA vista del archivo 70 con UNA columna más al final. Al final
-- y no en medio porque «create or replace view» solo admite AÑADIR
-- columnas por el final: cambiarlas de orden obliga a tirar la vista, y
-- tirarla se lleva los permisos que tiene concedidos.
--
-- Se cuenta aquí y no en la pantalla para no pedir los archivos de cada
-- tarjeta por separado: el tablero se pinta con una sola consulta, y
-- eso es lo que hace que no parpadee.
-- ---------------------------------------------------------------------
create or replace view public.internal_board with (security_invoker = true) as
  select t.id,
         t.list_id,
         l.name                                   as list_name,
         l.position                               as list_position,
         t.title,
         t.notes,
         t.done,
         t.done_at,
         t.position,
         t.archived_at,
         t.calendar_note_id,
         n.day                                    as event_day,
         n.title                                  as event_title,
         coalesce(i.total, 0)                     as checklist_total,
         coalesce(i.hechos, 0)                    as checklist_hechos,
         t.created_at,
         t.updated_at,
         coalesce(f.adjuntos, 0)                  as adjuntos
    from public.internal_tasks t
    join public.internal_lists l on l.id = t.list_id
    left join public.calendar_notes n on n.id = t.calendar_note_id
    left join lateral (
      select count(*) as total, count(*) filter (where done) as hechos
        from public.internal_task_items it where it.task_id = t.id) i on true
    left join lateral (
      select count(*) as adjuntos
        from public.documents d
       where d.internal_task_id = t.id and d.deleted_at is null) f on true;

comment on view public.internal_board is
  'Gestiones internas · las tarjetas con su lista, su progreso de checklist, su evento y cuántos adjuntos llevan. Una sola consulta para pintar el tablero.';

grant select on public.internal_board to authenticated, service_role;
revoke all   on public.internal_board from anon;


-- ---------------------------------------------------------------------
-- 5) MEJORA 6 · ELIMINAR UNA TARJETA
--
-- Archivar y eliminar son cosas distintas y se pidió que se notara:
--
--   · ARCHIVAR · sale del tablero, sigue en «Tareas archivadas», se
--     recupera entera con su checklist y sus adjuntos;
--   · ELIMINAR · deja de existir en los dos sitios.
--
-- QUÉ SE LLEVA POR DELANTE, DICHO UNO A UNO:
--
--   · el CHECKLIST · se va, y debe irse: no existe sin su tarjeta. Lo
--     hace la clave ajena, que ya era «on delete cascade» (archivo 70);
--   · los ADJUNTOS · sus fichas de «documents» se van por la clave ajena
--     nueva de este archivo. Los archivos del ALMACÉN no se tocan desde
--     aquí: esta función devuelve sus rutas para que quien la llame los
--     retire, y así no se borra a ciegas nada;
--   · el EVENTO DEL CALENDARIO · **NO SE BORRA**. Y es a propósito. Una
--     tarjeta apunta a una nota de «calendar_notes» que es un evento
--     normal: puede haberse mirado, comentado o contado con él. Borrar
--     la tarjeta no es decir que la reunión no existe. Se queda en el
--     calendario, y de ahí se quita desde el calendario.
--
-- Devuelve las rutas de los archivos que quedan sueltos, para que la
-- pantalla pueda retirarlos del almacén. Si la retirada fallara, lo
-- peor que pasa es que quede un archivo sin dueño en el almacén; lo que
-- NO puede pasar es borrar un archivo de otro.
-- ---------------------------------------------------------------------
create or replace function public.delete_internal_task(p_task uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare v_rutas text[]; v_titulo text;
begin
  perform public.assert_admin();

  select title into v_titulo from public.internal_tasks where id = p_task;
  if v_titulo is null then
    raise exception 'No se encuentra la tarea' using errcode = 'P0002';
  end if;

  -- SOLO los archivos de ESTA tarjeta. La condición sobre
  -- «internal_task_id» es lo que impide que una ruta de otro dueño se
  -- cuele en la lista que se va a retirar del almacén.
  select coalesce(array_agg(storage_path), '{}')
    into v_rutas
    from public.documents
   where internal_task_id = p_task;

  -- El checklist y las fichas de documento se van con ella, por sus
  -- claves ajenas. El evento del calendario, no.
  delete from public.internal_tasks where id = p_task;

  return v_rutas;
end $$;

comment on function public.delete_internal_task(uuid) is
  'Elimina una tarjeta de Gestiones internas con su checklist y sus adjuntos. NO borra su evento del calendario. Devuelve las rutas de almacén que quedan por retirar.';

grant  execute on function public.delete_internal_task(uuid) to authenticated;
revoke execute on function public.delete_internal_task(uuid) from anon, public;


-- ---------------------------------------------------------------------
-- 6) MEJORA 5 · QUITAR UN ADJUNTO DE UNA TARJETA
--
-- Los adjuntos de una tarjeta NO van a la papelera. La papelera
-- («deleted_at») existe para los documentos de obra, que tienen plazos
-- y responsabilidades detrás; una foto de una multa no necesita ese
-- ceremonial.
--
-- Va por función y no por «delete» directo porque «documents» no tiene
-- el borrado concedido a nadie salvo para la papelera, y esa regla se
-- respeta: la comprueba la prueba «borrados» del archivo
-- 70_tests_fase7.
-- ---------------------------------------------------------------------
create or replace function public.delete_internal_task_file(p_document uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_ruta text; v_tarea uuid;
begin
  perform public.assert_admin();

  select storage_path, internal_task_id into v_ruta, v_tarea
    from public.documents where id = p_document;

  if v_ruta is null then
    raise exception 'No se encuentra el archivo' using errcode = 'P0002';
  end if;

  -- LO IMPORTANTE: esta función solo vale para los adjuntos de una
  -- tarjeta. Sin esta comprobación serviría para borrar el documento de
  -- cualquier obra saltándose la papelera.
  if v_tarea is null then
    raise exception 'Este archivo no es de una tarjeta de Gestiones internas'
      using errcode = '22023';
  end if;

  delete from public.documents where id = p_document;
  return v_ruta;
end $$;

comment on function public.delete_internal_task_file(uuid) is
  'Quita un adjunto de una tarjeta de Gestiones internas. Solo vale para esos: no sirve para saltarse la papelera de los demás documentos.';

grant  execute on function public.delete_internal_task_file(uuid) to authenticated;
revoke execute on function public.delete_internal_task_file(uuid) from anon, public;


-- ---------------------------------------------------------------------
-- 7) COMPROBAR QUE QUEDÓ BIEN
-- ---------------------------------------------------------------------
-- La columna nueva y la restricción con sus siete dueños:
-- select pg_get_constraintdef(oid) from pg_constraint
--  where conname = 'documents_one_owner';
--
-- Que un trabajador asignado puede subir a su aviso (debe dar «t»):
-- select public.storage_can_upload('fichas/<id-de-un-aviso-suyo>/foto.jpg');
--
-- Las ocho ramas de la vista, contando de dónde viene cada archivo:
-- select origen_tipo, count(*) from public.related_documents group by origen_tipo;
--
-- Y que a «anon» no se le ha concedido nada nuevo (sin filas):
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_name = 'documents' and grantee = 'anon';
