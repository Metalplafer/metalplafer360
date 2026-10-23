-- =====================================================================
-- METALPLAFER360 · LO QUE EL PROYECTO HEREDA DE SU PRESUPUESTO
--
-- MEJORA 1 · Al convertir un presupuesto en proyecto se pierde
-- información. Esto dice EXACTAMENTE qué se pierde y lo arregla sin
-- copiar ni un archivo.
--
--
-- QUÉ SE CONSERVA HOY Y QUÉ NO
--
-- «convert_budget_to_project» (definición viva en el archivo 42) crea el
-- proyecto con: cliente, contacto, nombre, descripción, dirección,
-- importe, la marca de ejemplo y «source_ficha_id», que es el enlace al
-- presupuesto de origen. Todo eso ya está bien y no se toca.
--
-- Se ha mirado UNA POR UNA cada tabla que apunta a «fichas», que es la
-- única manera de saber qué queda atrás:
--
--   · «projects.source_ficha_id» · el enlace de origen. Existe.
--   · «documents.ficha_id»       · LOS ARCHIVOS. Se quedan atrás.
--   · «comments.ficha_id»        · los comentarios. Se quedan atrás.
--   · «ficha_workers.ficha_id»   · a quién se le asigna un AVISO. Un
--     presupuesto no se asigna a trabajadores, así que no aplica.
--   · «work_reports.ficha_id»    · el parte de un AVISO. Tampoco.
--
-- Y de los campos de la ficha, los que no se copian es porque el
-- proyecto no tiene dónde ponerlos: «phone» (el teléfono del aviso),
-- «scheduled_date/time» (la fecha de la visita) y «assigned_to» (el
-- responsable de la ficha; en un proyecto el equipo es otra tabla). No
-- se inventa ninguna columna para alojarlos: siguen estando en la ficha,
-- que se conserva intacta y a la que ahora se llega desde el proyecto.
--
-- Conclusión: lo que de verdad se pierde son LOS ARCHIVOS. Es lo que se
-- arregla aquí.
--
--
-- POR QUÉ NO SE PUEDEN «MOVER» NI COPIAR
--
-- La tabla «documents» tiene una restricción, «documents_one_owner», que
-- obliga a que cada archivo tenga UN SOLO dueño: una ficha, un proyecto,
-- una orden, un parte o una obra. Así que:
--
--   · cambiar «ficha_id» por «project_id» ROMPERÍA el presupuesto: sus
--     archivos desaparecerían de la ficha, que es donde se subieron;
--   · insertar una segunda fila apuntando al proyecto viola la
--     restricción, y además «storage_path» es único: harían falta DOS
--     copias del archivo en el almacén. Un vídeo de obra de 80 MB
--     pasaría a ocupar 160.
--
-- La casa ya resolvió esto una vez: la vista «work_documents» del
-- archivo 36 enseña en una obra los archivos de sus proyectos, sin
-- copiar ninguno y diciendo de dónde viene cada uno. Se hace lo mismo.
--
--
-- UNA SOLA VISTA PARA LO HEREDADO
--
-- «related_documents» responde a una pregunta: ¿qué archivos VE esta
-- ficha o este proyecto que NO son suyos? Solo lo heredado: lo propio ya
-- lo enseña el panel de documentos de siempre, y sacarlo también por
-- aquí lo pintaría dos veces.
--
-- Hoy tiene una sola rama —el proyecto y su presupuesto— y el archivo 58
-- le añade las visitas técnicas. Por eso las columnas ya vienen con
-- «origen_tipo» y «origen_fecha»: para que ampliarla sea añadir ramas y
-- no cambiar la forma. «create or replace view» solo deja AÑADIR
-- columnas al final, nunca cambiarlas de sitio.
--
--
-- LOS PERMISOS NO CAMBIAN, Y ESTO ES LO IMPORTANTE
--
-- La vista es «security_invoker = true»: se ejecuta con los permisos de
-- QUIEN PREGUNTA, así que las políticas de «documents», «projects» y
-- «fichas» siguen decidiendo igual que si se consultaran a mano. No
-- concede ni un acceso nuevo a nadie.
--
-- Es a propósito lo contrario que «work_documents», que es de las que se
-- ejecutan como su dueño y filtra ella misma con «is_admin()». Aquí no
-- se quiere eso: por esta vista pasan archivos de PROYECTOS, que los
-- trabajadores sí pueden ver según lo que tengan asignado, y una vista
-- que se ejecutara como su dueño tendría que recalcular ese permiso a
-- mano. Recalcularlo es la manera de equivocarse: se deja que lo decida
-- la política que ya existe.
--
-- MIGRACIÓN SOLO DE LECTURA: crea una vista. No añade columnas, no toca
-- ninguna fila y no cambia ninguna función ni política.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LOS ARCHIVOS QUE SE VEN DESDE OTRO SITIO
--
-- «para_tipo» y «para_id» dicen DESDE DÓNDE se está mirando;
-- «origen_tipo», «origen_id», «origen_code» y «origen_fecha», de dónde
-- sale el archivo. Con eso la pantalla puede escribir «Procede del
-- presupuesto PRES-2026-001» sin consultar nada más.
--
-- Los archivos en la papelera no salen: se filtran aquí dentro. La
-- papelera se gestiona desde el panel de quien es dueño del archivo.
-- ---------------------------------------------------------------------
create or replace view public.related_documents with (security_invoker = true) as
  -- LO QUE UN PROYECTO HEREDA DE SU PRESUPUESTO.
  --
  -- El enlace es «projects.source_ficha_id», que ya existe y es único:
  -- un presupuesto se convierte en un solo proyecto. Esto vale también
  -- para los proyectos convertidos hace meses, sin tocarlos.
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
    left join public.profiles pf on pf.id = d.uploaded_by;

comment on view public.related_documents is
  'Los archivos que una ficha o un proyecto VE sin ser suyos: hoy, los del presupuesto del que nació. No se copia ningún archivo; «origen_code» dice de dónde viene cada uno. Se ejecuta con los permisos de quien pregunta.';

grant select on public.related_documents to authenticated, service_role;
revoke all   on public.related_documents from anon;


-- ---------------------------------------------------------------------
-- 2) CUÁNTOS HEREDA, PARA PODER ANUNCIARLO
--
-- La pantalla del proyecto necesita saber si hay algo heredado ANTES de
-- pedir la lista, para no enseñar un panel vacío. Contar filas de la
-- vista desde el navegador obligaría a traérselas todas.
--
-- Es una función «stable» y de lectura: no cambia nada.
-- ---------------------------------------------------------------------
create or replace function public.related_documents_count(p_tipo text, p_id uuid)
returns bigint language sql stable security invoker set search_path = public as $$
  select count(*) from public.related_documents
   where para_tipo = p_tipo and para_id = p_id;
$$;

comment on function public.related_documents_count(text, uuid) is
  'Cuántos archivos hereda un proyecto o una ficha. Con los permisos de quien pregunta, igual que la vista.';

grant  execute on function public.related_documents_count(text, uuid) to authenticated, service_role;
revoke execute on function public.related_documents_count(text, uuid) from anon, public;
