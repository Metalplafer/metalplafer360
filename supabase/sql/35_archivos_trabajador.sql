-- =====================================================================
-- METALPLAFER360 · FASE 2 · LOS ARCHIVOS DEL TRABAJADOR
--
-- El trabajador veía el botón de subir en la ficha del proyecto y
-- Supabase le decía que no. No era un fallo de la pantalla: faltaba el
-- permiso de verdad, en dos sitios y en el mismo sentido.
--
--   · «storage_can_upload» admitía «orders/<id>» y «reports/<id>», pero
--     NO «projects/<id>», que es la carpeta donde van los archivos de un
--     proyecto. Sin eso, el archivo no entra en el almacén.
--
--   · la política «documents_insert» tenía rama para la orden y para el
--     parte, pero tampoco para el proyecto. Y solo dejaba las categorías
--     «foto», «video» y «firma», así que un albarán o un PDF del cliente
--     tampoco pasaba.
--
-- Y al borrar faltaba lo contrario: «trash_document» solo contemplaba la
-- orden, de modo que el trabajador NO podía quitar ni sus propios
-- archivos de un proyecto o de un parte. Al mismo tiempo, la pantalla le
-- ofrecía el botón sobre los archivos de CUALQUIERA. Las dos cosas se
-- corrigen: solo los suyos, comprobado aquí y no solo en la pantalla.
--
-- QUÉ NO CAMBIA:
--   · la lectura. «storage_can_read» ya contemplaba «projects» y ya
--     descartaba la papelera y lo administrativo. No se toca.
--   · lo administrativo sigue siendo intocable para el trabajador: no lo
--     ve, no lo sube y no lo borra. Las ramas nuevas llevan todas
--     «scope = 'tecnica'».
--   · no se abre ningún permiso general ni se da acceso a todo el
--     almacén: se nombra la carpeta y se comprueba el proyecto.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) SUBIR AL ALMACÉN · se añade la carpeta del proyecto
--
-- Es la función que mira Supabase Storage antes de aceptar un archivo.
-- Se añade una rama, con el mismo patrón que las otras dos: la carpeta
-- dice de qué es, y una función del proyecto dice si esa persona llega.
--
-- «worker_can_see_project» ya exige que el perfil esté ACTIVO, así que
-- alguien desactivado no sube nada aunque le quede la sesión abierta.
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
          and public.worker_can_see_project(public.try_uuid(split_part(p_name, '/', 2))));
$$;

comment on function public.storage_can_upload(text) is
  'Quién puede dejar un archivo en el almacén. El trabajador, en las carpetas de sus órdenes, sus partes y sus proyectos. Nada más.';


-- ---------------------------------------------------------------------
-- 2) REGISTRAR EL ARCHIVO · se añade la rama del proyecto
--
-- Subir al almacén y registrar la fila son dos permisos distintos, y los
-- dos tienen que dar el sí. Aquí se añade el proyecto y se admite la
-- categoría «documento»: se pidió que el trabajador pueda subir fotos,
-- vídeos Y documentos.
--
-- Lo que NO cambia: sigue teniendo que ser él quien lo sube
-- («uploaded_by = auth.uid()») y sigue siendo técnico a la fuerza, así
-- que no puede colocar nada en la carpeta de administración.
-- ---------------------------------------------------------------------
-- LAS CATEGORÍAS VAN POR RAMA, a propósito.
--
-- En las órdenes y en los partes se queda EXACTAMENTE como estaba:
-- fotos, vídeos y firmas. Es una decisión que ya existía y que tiene su
-- prueba («No puede subir documentos administrativos a su orden»), y el
-- encargo de ahora no la cambia: habla de los PROYECTOS.
--
-- En el proyecto se añade «documento», que es donde se pidió poder subir
-- «fotos, vídeos y documentos» —el albarán que trae el cliente, un PDF
-- del fabricante—. Sigue siendo técnico, así que no se cuela nada en la
-- carpeta de administración.
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
        ))
  );

comment on policy documents_insert on public.documents is
  'El trabajador registra archivos TÉCNICOS en sus órdenes, sus partes y sus proyectos, y siempre a su nombre. Lo administrativo es solo de administración.';


-- ---------------------------------------------------------------------
-- 3) QUITAR UN ARCHIVO · solo los propios, y se comprueba aquí
--
-- La aplicación manda a la papelera (borrado reversible), no destruye.
-- Antes solo se podía hacer sobre un archivo de una ORDEN, y además la
-- pantalla ofrecía el botón sobre los archivos de todo el mundo.
--
-- Las reglas quedan así, en este orden:
--   · administración, cualquiera;
--   · el trabajador, SOLO los que ha subido él;
--   · nunca uno administrativo;
--   · y solo si todavía llega a su orden, su parte o su proyecto.
--
-- Se escriben por separado para poder decir en castellano QUÉ falla:
-- «no tienes permisos» cuando el archivo es de otra persona no explica
-- nada a quien lo está intentando.
-- ---------------------------------------------------------------------
create or replace function public.trash_document(p_doc uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.documents;
begin
  select * into d from public.documents where id = p_doc and deleted_at is null;
  if not found then
    raise exception 'El documento no existe o ya está en la papelera' using errcode = 'P0002';
  end if;

  if public.is_admin() or public.is_service_context() then
    null;                                    -- administración, sin más
  elsif d.uploaded_by is null or d.uploaded_by <> auth.uid() then
    raise exception 'Solo puedes quitar los archivos que has subido tú'
      using errcode = '42501';
  elsif d.scope = 'administrativa' then
    raise exception 'Este archivo es de administración: no se puede quitar desde aquí'
      using errcode = '42501';
  elsif not ((d.order_id   is not null and public.worker_can_edit_order(d.order_id))
          or (d.report_id  is not null and public.worker_can_edit_report(d.report_id))
          or (d.project_id is not null and public.worker_can_see_project(d.project_id))) then
    raise exception 'Ya no puedes cambiar los archivos de este trabajo'
      using errcode = '42501';
  end if;

  update public.documents
     set deleted_at = now(), deleted_by = auth.uid()
   where id = p_doc;
end $$;

comment on function public.trash_document(uuid) is
  'Manda un archivo a la papelera. Administración, cualquiera; el trabajador, solo los que ha subido él y solo si no son administrativos.';


-- ---------------------------------------------------------------------
-- 4) RECUPERAR DE LA PAPELERA · sigue siendo de administración
--
-- No se toca: se deja escrito aquí para que quede claro que es una
-- decisión y no un olvido. Quien se equivoca al quitar algo avisa, y
-- administración lo recupera; así la papelera tiene un solo responsable.
-- ---------------------------------------------------------------------
