-- =====================================================================
-- METALPLAFER360 · BANDEJA DE ENTRADA DE SOLICITUDES POR CORREO
--
-- MEJORA 6 · Los clientes mandan por correo peticiones, fotos, planos y
-- vídeos, y administración los vuelve a escribir a mano en la
-- aplicación. Lo que se hace aquí es que cada correo entre como una
-- FICHA PROVISIONAL editable, que se revisa SIEMPRE a mano y que solo se
-- convierte en presupuesto, visita o aviso cuando alguien lo decide.
--
--
-- LO QUE ESTO NO HACE, Y ES PARTE DEL ENCARGO
--
--   · No clasifica nada. Un correo no se convierte solo en presupuesto
--     porque diga «presupuesto»;
--   · no crea ningún registro definitivo por el hecho de llegar;
--   · no hay inteligencia artificial de por medio. Queda fuera del
--     alcance a propósito.
--
-- Recibir un correo CREA UNA FILA EN ESTA TABLA Y NADA MÁS.
--
--
-- LOS ADJUNTOS VAN DONDE VAN TODOS LOS ARCHIVOS
--
-- No se crea un segundo sistema de documentos: se añade a «documents»
-- una columna más de dueño, «mail_request_id», exactamente como se hizo
-- con los proyectos (archivo 09), las órdenes (12), los partes (26) y
-- las obras (36). Así los adjuntos de un correo son archivos normales:
-- tienen su categoría, su papelera, su cuota de almacenamiento y sus
-- permisos, y cuando la solicitud se convierte en un presupuesto se ven
-- desde ese presupuesto SIN COPIARSE, por la vista «related_documents»
-- del archivo 57.
--
-- Eso es lo que pedía el punto 9 del encargo: que las visitas, los
-- documentos y las solicitudes no acaben siendo tres sistemas de
-- archivos distintos.
--
--
-- UN SOLO DESTINO, Y POR QUÉ
--
-- El encargo dice: «si una solicitud puede originar varios registros, no
-- impongas una relación uno a uno sin analizar el proceso real». Se ha
-- analizado, y el proceso real es una CADENA, no un abanico:
--
--   el correo → un presupuesto → un proyecto («source_ficha_id»)
--   el correo → una visita → el presupuesto por el que se hizo
--               («linked_ficha_id», archivo 58)
--
-- Cada paso tiene UN padre y la trazabilidad llega hasta el final sin
-- ninguna relación de muchos a muchos. Por eso la solicitud guarda UN
-- destino —una ficha o un proyecto, nunca los dos— y se puede cambiar si
-- se vinculó mal, dejándolo dicho en el historial. Una tabla de enlaces
-- añadiría una tabla, sus permisos y sus índices para guardar algo que
-- el modelo ya sabe contar.
--
--
-- EL REMITENTE DE UN REENVÍO
--
-- Cuando administración reenvía un correo de un cliente, el remitente
-- del mensaje que llega es administración, NO el cliente. Se guardan los
-- dos por separado:
--
--   · «sender_email» · quién mandó el mensaje que hemos recibido;
--   · «original_sender_email» · el cliente, cuando se puede saber con
--     seguridad.
--
-- Y cuando NO se puede saber, no se inventa: se marca
-- «sender_needs_review» y la pantalla pide que lo complete una persona.
-- Es lo que pedía el encargo con estas palabras: «si no puede
-- determinarse con seguridad, deja el dato pendiente de revisión manual
-- en lugar de inventarlo».
--
--
-- LOS PERMISOS
--
-- La bandeja es de ADMINISTRACIÓN, como los presupuestos y los avisos.
-- Se comprobó contra el catálogo, no se supone: «fichas» y «projects»
-- tienen políticas «is_admin()» para leer, así que esta tabla las
-- imita.
--
-- Y los adjuntos quedan a salvo SIN TOCAR NADA: la función
-- «storage_can_read» (definición viva en el archivo 39) decide por la
-- primera carpeta de la ruta y cae en «else false» para cualquier
-- carpeta que no conozca. Los adjuntos van a «mail/<id>/…», que no
-- conoce, así que solo administración los lee. Se verificó leyendo la
-- función; no se ha modificado.
--
-- Quien ESCRIBE aquí es el servidor, con la clave «service_role», que no
-- pasa por las políticas. Por eso las funciones de recepción están
-- concedidas SOLO a «service_role», igual que las del token de Google
-- Drive (archivo 24): si estuvieran abiertas a «authenticated»,
-- cualquiera con sesión podría fabricar solicitudes.
--
-- MIGRACIÓN ESTRUCTURAL: una tabla nueva, una columna más en
-- «documents», sus restricciones, sus índices, sus políticas y las
-- funciones de recepción, revisión y vinculación. No se reescribe
-- ninguna fila existente.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LOS ESTADOS QUE HACEN FALTA, Y NI UNO MÁS
--
-- El encargo pide no inventar un flujo complejo: solo recepción,
-- revisión, error y vinculación. Son estos cinco:
--
--   · «pendiente»  · ha llegado y nadie la ha mirado;
--   · «revisada»   · alguien la ha mirado y completado, y todavía no se
--     ha convertido en nada;
--   · «vinculada»  · ya tiene su presupuesto, visita, aviso o proyecto;
--   · «error»      · algo falló al guardarla o al guardar un adjunto. NO
--     desaparece: se queda a la vista para que administración actúe;
--   · «descartada» · no era una solicitud (publicidad, correo basura).
--     Hace falta: sin ella, la bandeja se llena de ruido y deja de
--     usarse, que es la manera de que una bandeja no sirva para nada.
--
-- Inmutable porque la usa una restricción «check», igual que
-- «valid_ficha_status» (archivo 06).
-- ---------------------------------------------------------------------
create or replace function public.valid_mail_status(p_status text)
returns boolean language sql immutable as $$
  select p_status in ('pendiente', 'revisada', 'vinculada', 'error', 'descartada');
$$;

comment on function public.valid_mail_status(text) is
  'Los estados de una solicitud de correo: recepción, revisión, vinculación, error y descarte. Ni uno más.';


-- ---------------------------------------------------------------------
-- 2) LA FICHA PROVISIONAL
-- ---------------------------------------------------------------------
create table if not exists public.mail_requests (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,            -- SOL-2026-001
  status             text not null default 'pendiente',

  -- ---- EL CORREO, TAL COMO LLEGÓ ----
  /**
   * El identificador del mensaje en el proveedor. ES LA CLAVE DE LA
   * DEDUPLICACIÓN: si el proveedor reintenta —y reintenta, por diseño,
   * cuando no le respondemos a tiempo—, el segundo intento encuentra
   * esta fila y no crea otra.
   */
  provider_message_id text not null unique,
  subject            text,
  body_text          text,
  body_html          text,
  /** Quién mandó EL MENSAJE QUE HEMOS RECIBIDO. En un reenvío, administración. */
  sender_email       text,
  sender_name        text,
  /** A quién iba dirigido, tal cual, para poder ver si venía en copia. */
  recipients         text,
  received_at        timestamptz not null default now(),

  -- ---- SI ERA UN REENVÍO ----
  forwarded          boolean not null default false,
  /** EL CLIENTE, cuando se puede saber con seguridad. Si no, en blanco. */
  original_sender_email text,
  original_sender_name  text,
  original_subject      text,
  /**
   * «No se ha podido determinar quién lo mandó originalmente». La
   * pantalla lo enseña y pide completarlo; nadie inventa un remitente.
   */
  sender_needs_review boolean not null default false,

  -- ---- LO QUE AÑADE ADMINISTRACIÓN AL REVISARLA ----
  client_id          uuid references public.clients(id),
  notes              text,
  reviewed_by        uuid references public.profiles(id) on delete set null,
  reviewed_at        timestamptz,

  -- ---- EL DESTINO, CUANDO SE CONVIERTE ----
  target_ficha_id    uuid references public.fichas(id)   on delete set null,
  target_project_id  uuid references public.projects(id) on delete set null,

  /** Qué falló, cuando el estado es «error». Sin secretos ni cabeceras completas. */
  error_detail       text,

  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint mail_requests_status_valid check (public.valid_mail_status(status)),
  -- Una solicitud se vincula a UNA cosa: una ficha o un proyecto.
  constraint mail_requests_un_destino check (
    num_nonnulls(target_ficha_id, target_project_id) <= 1),
  -- «vinculada» quiere decir que hay destino, y tener destino quiere
  -- decir «vinculada». Así no puede quedar un estado que miente.
  constraint mail_requests_vinculada_coherente check (
    (status = 'vinculada') = (num_nonnulls(target_ficha_id, target_project_id) = 1))
);

comment on table public.mail_requests is
  'Bandeja de entrada: cada correo recibido es una ficha provisional editable. Se revisa SIEMPRE a mano antes de convertirse en un registro definitivo.';

-- Lo que la pantalla pregunta: las pendientes primero, y buscar por
-- cliente o por destino.
create index if not exists mail_requests_status_idx
  on public.mail_requests (status, received_at desc);
create index if not exists mail_requests_client_idx
  on public.mail_requests (client_id);
create index if not exists mail_requests_target_ficha_idx
  on public.mail_requests (target_ficha_id);
create index if not exists mail_requests_target_project_idx
  on public.mail_requests (target_project_id);
create index if not exists mail_requests_reviewed_by_idx
  on public.mail_requests (reviewed_by);

drop trigger if exists touch_updated_at on public.mail_requests;
create trigger touch_updated_at before update on public.mail_requests
  for each row execute function public.trg_touch_updated_at();

/**
 * EL HISTORIAL SE ESCRIBE A MANO, Y NO CON EL DISPARADOR GENERAL.
 *
 * «trg_audit» sabe redactar en castellano lo que pasa en las tablas que
 * conoce, y para las que no conoce cae en un apunte genérico: «Salvi
 * update mail_requests». Un historial así no se lee.
 *
 * Caben dos salidas: añadirle una rama a «trg_audit» —que obliga a
 * regenerar una función de 300 líneas que tocan todas las tablas— o
 * escribir aquí los apuntes de las cuatro cosas que de verdad pasan con
 * una solicitud: que llega, que se revisa, que se vincula y que se
 * descarta. Se hace lo segundo: son mejores apuntes y no se toca una
 * función compartida por media aplicación.
 */


-- ---------------------------------------------------------------------
-- 3) LOS ADJUNTOS SON ARCHIVOS NORMALES
--
-- Una columna de dueño más, y la restricción de siempre: UN solo dueño
-- por archivo. Se vuelve a declarar con las seis columnas porque es
-- como se ha hecho cada vez que se añadió una (archivos 09, 12, 26, 36).
-- ---------------------------------------------------------------------
alter table public.documents add column if not exists mail_request_id uuid
  references public.mail_requests(id) on delete cascade;

alter table public.documents drop constraint if exists documents_one_owner;
alter table public.documents add constraint documents_one_owner
  check (num_nonnulls(ficha_id, project_id, order_id, report_id, work_id, mail_request_id) = 1);

create index if not exists documents_mail_request_idx
  on public.documents (mail_request_id, created_at);

comment on column public.documents.mail_request_id is
  'La solicitud de correo de la que vino este archivo. Un archivo tiene un solo dueño: lo impone «documents_one_owner».';


-- ---------------------------------------------------------------------
-- 4) RECIBIR UN CORREO · SOLO EL SERVIDOR
--
-- Es idempotente a propósito, y esto es lo más importante de todo el
-- archivo: los proveedores de correo entrante REINTENTAN cuando no se
-- les responde a tiempo, así que esta función se va a llamar dos veces
-- con el mismo mensaje tarde o temprano. Si creara dos solicitudes,
-- administración vería el mismo correo del cliente dos veces y acabaría
-- haciendo dos presupuestos.
--
-- Por eso: si ya existe una solicitud con ese «provider_message_id», NO
-- crea nada y devuelve la que hay. El que llama no tiene que saber si
-- era la primera vez.
--
-- Devuelve la fila entera para que el servidor sepa el id al que colgar
-- los adjuntos y si ya los había subido antes.
-- ---------------------------------------------------------------------
create or replace function public.receive_mail_request(
  p_provider_message_id text,
  p_subject             text default null,
  p_body_text           text default null,
  p_body_html           text default null,
  p_sender_email        text default null,
  p_sender_name         text default null,
  p_recipients          text default null,
  p_received_at         timestamptz default null,
  p_forwarded           boolean default false,
  p_original_sender_email text default null,
  p_original_sender_name  text default null,
  p_original_subject      text default null,
  p_sender_needs_review   boolean default false)
returns public.mail_requests language plpgsql security definer set search_path = public as $$
declare r public.mail_requests; v_cliente uuid; v_correo text;
begin
  if coalesce(trim(p_provider_message_id), '') = '' then
    raise exception 'Falta el identificador del mensaje: sin él no se puede evitar duplicarlo'
      using errcode = '22023';
  end if;

  -- ¿Ya estaba? Entonces esto es un reintento del proveedor.
  select * into r from public.mail_requests
   where provider_message_id = p_provider_message_id;
  if found then
    return r;
  end if;

  v_correo := coalesce(
    lower(nullif(trim(coalesce(p_original_sender_email, '')), '')),
    lower(nullif(trim(coalesce(p_sender_email, '')), '')));

  -- Si ese correo es de un cliente que ya tenemos, se APUNTA como
  -- sugerencia. Ojo: esto NO es clasificar la solicitud. Sugerir el
  -- cliente ahorra una búsqueda a quien la revise; la solicitud se queda
  -- «pendiente» y la revisión sigue siendo manual, que es lo acordado.
  --
  -- Se mira primero el remitente ORIGINAL, que en un reenvío es el
  -- cliente de verdad y no la cuenta de administración.
  if v_correo is not null then
    select id into v_cliente from public.clients
     where archived_at is null and email is not null and lower(email) = v_correo
     limit 1;
  end if;

  insert into public.mail_requests (
    code, provider_message_id, subject, body_text, body_html,
    sender_email, sender_name, recipients, received_at,
    forwarded, original_sender_email, original_sender_name, original_subject,
    sender_needs_review, client_id)
  values (
    public.next_code('SOL'), p_provider_message_id,
    nullif(trim(coalesce(p_subject, '')), ''),
    p_body_text, p_body_html,
    lower(nullif(trim(coalesce(p_sender_email, '')), '')),
    nullif(trim(coalesce(p_sender_name, '')), ''),
    nullif(trim(coalesce(p_recipients, '')), ''),
    coalesce(p_received_at, now()),
    coalesce(p_forwarded, false),
    lower(nullif(trim(coalesce(p_original_sender_email, '')), '')),
    nullif(trim(coalesce(p_original_sender_name, '')), ''),
    nullif(trim(coalesce(p_original_subject, '')), ''),
    coalesce(p_sender_needs_review, false), v_cliente)
  returning * into r;

  -- Que ha entrado un correo, dicho para que se entienda. El autor es
  -- «Sistema»: lo ha traído el servidor, no una persona.
  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (null, public.actor_name(), 'correo_recibido', 'mail_requests', r.id, r.code,
          'Entró una solicitud por correo (' || r.code || ')'
          || case when v_correo is not null then ' de ' || v_correo else '' end
          || case when r.subject is not null then ': ' || left(r.subject, 120) else '' end,
          jsonb_build_object('reenviado', r.forwarded,
                             'cliente_sugerido', v_cliente is not null), false);

  return r;
end $$;

comment on function public.receive_mail_request(text, text, text, text, text, text, text, timestamptz, boolean, text, text, text, boolean) is
  'Registra un correo recibido como solicitud provisional. IDEMPOTENTE: con el mismo identificador de mensaje devuelve la solicitud que ya existía, sin crear otra.';


-- ---------------------------------------------------------------------
-- 5) COLGAR UN ADJUNTO · SOLO EL SERVIDOR
--
-- El servidor sube el archivo al almacén y después lo registra aquí.
-- También es idempotente: si ese archivo ya estaba registrado para esa
-- solicitud —porque el proveedor reintentó— no se duplica la fila.
-- «storage_path» es único en la tabla, así que la base de datos lo
-- impediría igualmente; lo que se evita es el error.
-- ---------------------------------------------------------------------
create or replace function public.attach_mail_document(
  p_request      uuid,
  p_storage_path text,
  p_file_name    text,
  p_size_bytes   bigint,
  p_mime_type    text default null)
returns public.documents language plpgsql security definer set search_path = public as $$
declare d public.documents;
begin
  if not exists (select 1 from public.mail_requests where id = p_request) then
    raise exception 'No se encuentra la solicitud' using errcode = 'P0002';
  end if;

  select * into d from public.documents where storage_path = p_storage_path;
  if found then
    return d;
  end if;

  insert into public.documents (mail_request_id, bucket, storage_path, file_name,
                                mime_type, size_bytes, category, scope)
  values (p_request, 'documentos', p_storage_path, p_file_name,
          p_mime_type, p_size_bytes,
          -- La categoría se decide por el tipo de archivo, con el mismo
          -- criterio que usa la aplicación al subir a mano.
          case
            when p_mime_type like 'image/%' then 'foto'::public.doc_category
            when p_mime_type like 'video/%' then 'video'::public.doc_category
            else 'documento'::public.doc_category
          end,
          'tecnica')
  returning * into d;

  return d;
end $$;

comment on function public.attach_mail_document(uuid, text, text, bigint, text) is
  'Registra un adjunto ya subido al almacén como documento de una solicitud. Idempotente por la ruta del archivo.';


-- ---------------------------------------------------------------------
-- 6) UN ADJUNTO QUE FALLA NO HACE DESAPARECER EL CORREO
--
-- Lo pide el encargo con estas palabras: «si un adjunto falla, la
-- solicitud no debe desaparecer silenciosamente; debe quedar un estado
-- de error o una indicación visible».
--
-- Así que el servidor guarda PRIMERO la solicitud y después los
-- adjuntos, y si alguno falla llama aquí: la solicitud se queda, con su
-- cuerpo y su remitente, marcada en «error» y diciendo qué pasó. Lo que
-- no se pierde nunca es el correo.
--
-- No pisa una solicitud que ya está revisada o vinculada: si
-- administración ya ha trabajado con ella, un reintento del proveedor no
-- la devuelve a «error».
-- ---------------------------------------------------------------------
create or replace function public.mark_mail_request_error(
  p_request uuid, p_detail text)
returns public.mail_requests language plpgsql security definer set search_path = public as $$
declare r public.mail_requests;
begin
  update public.mail_requests
     set status = case when status in ('pendiente', 'error') then 'error' else status end,
         -- El detalle se recorta: en los registros no se guardan
         -- cabeceras completas ni nada que pueda traer datos de más.
         error_detail = left(coalesce(p_detail, 'Error al guardar la solicitud'), 500)
   where id = p_request
  returning * into r;

  if not found then
    raise exception 'No se encuentra la solicitud' using errcode = 'P0002';
  end if;
  return r;
end $$;

comment on function public.mark_mail_request_error(uuid, text) is
  'Marca una solicitud con un error visible sin perder el correo. No toca las que ya están revisadas o vinculadas.';


-- ---------------------------------------------------------------------
-- 7) REVISAR A MANO · ADMINISTRACIÓN
--
-- Completar lo que falta: el cliente, el remitente original que no se
-- pudo determinar y las observaciones internas. Marca la solicitud como
-- revisada, que quiere decir «una persona la ha mirado», y nada más: no
-- crea ningún registro.
-- ---------------------------------------------------------------------
create or replace function public.review_mail_request(
  p_request uuid,
  p_client  uuid default null,
  p_notes   text default null,
  p_original_sender_email text default null,
  p_original_sender_name  text default null)
returns public.mail_requests language plpgsql security definer set search_path = public as $$
declare r public.mail_requests; v_antes text;
begin
  perform public.assert_admin();

  select status into v_antes from public.mail_requests where id = p_request;
  if v_antes is null then
    raise exception 'No se encuentra la solicitud' using errcode = 'P0002';
  end if;
  if v_antes = 'descartada' then
    raise exception 'Esta solicitud está descartada. Recupérala antes de revisarla.'
      using errcode = '22023';
  end if;

  if p_client is not null
     and not exists (select 1 from public.clients where id = p_client and archived_at is null) then
    raise exception 'No se encuentra el cliente, o está archivado' using errcode = 'P0002';
  end if;

  update public.mail_requests
     set client_id = p_client,
         notes = nullif(trim(coalesce(p_notes, '')), ''),
         original_sender_email = coalesce(
           lower(nullif(trim(coalesce(p_original_sender_email, '')), '')), original_sender_email),
         original_sender_name = coalesce(
           nullif(trim(coalesce(p_original_sender_name, '')), ''), original_sender_name),
         -- Si alguien escribe el remitente que faltaba, deja de estar
         -- pendiente de revisar.
         sender_needs_review = case
           when nullif(trim(coalesce(p_original_sender_email, '')), '') is not null then false
           else sender_needs_review end,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         -- Una solicitud ya vinculada sigue vinculada: revisarla otra vez
         -- no la devuelve atrás.
         status = case when status = 'vinculada' then 'vinculada' else 'revisada' end,
         error_detail = case when status = 'error' then null else error_detail end
   where id = p_request
  returning * into r;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'revisar_solicitud', 'mail_requests', r.id, r.code,
          public.actor_name() || ' revisó la solicitud ' || r.code
          || case when r.client_id is not null
                  then ' · cliente: ' || coalesce(
                         (select name from public.clients where id = r.client_id), '—')
                  else '' end,
          jsonb_build_object('cliente', r.client_id), r.is_demo);

  return r;
end $$;

comment on function public.review_mail_request(uuid, uuid, text, text, text) is
  'Administración completa la solicitud y la marca como revisada. No crea ningún registro definitivo.';

grant  execute on function public.review_mail_request(uuid, uuid, text, text, text) to authenticated;
revoke execute on function public.review_mail_request(uuid, uuid, text, text, text) from anon, public;


-- ---------------------------------------------------------------------
-- 8) VINCULAR LA SOLICITUD A SU DESTINO · ADMINISTRACIÓN
--
-- La conversión es manual y explícita: la pantalla crea el presupuesto,
-- la visita o el aviso CON SU FORMULARIO DE SIEMPRE y después llama
-- aquí. Esta función no crea fichas: eso haría falta reescribir el alta
-- de fichas aquí dentro, que es justo lo que se pidió no hacer.
--
-- La ficha provisional NO se borra nunca, y el correo original se
-- conserva: es la prueba de lo que pidió el cliente.
--
-- Vincular dos veces al mismo destino no hace nada (ni un apunte de
-- más). Vincular a OTRO destino se permite —una vinculación equivocada
-- hay que poder corregirla— y queda en el historial con los dos.
-- ---------------------------------------------------------------------
create or replace function public.link_mail_request(
  p_request uuid, p_ficha uuid default null, p_project uuid default null)
returns public.mail_requests language plpgsql security definer set search_path = public as $$
declare r public.mail_requests; v_destino text; v_antes text;
begin
  perform public.assert_admin();

  select * into r from public.mail_requests where id = p_request for update;
  if not found then
    raise exception 'No se encuentra la solicitud' using errcode = 'P0002';
  end if;
  if p_ficha is not null and p_project is not null then
    raise exception 'Una solicitud se vincula a una ficha o a un proyecto, no a los dos'
      using errcode = '22023';
  end if;

  if p_ficha is not null then
    select code into v_destino from public.fichas where id = p_ficha;
    if v_destino is null then
      raise exception 'No se encuentra la ficha a la que vincular la solicitud'
        using errcode = 'P0002';
    end if;
  elsif p_project is not null then
    select code into v_destino from public.projects where id = p_project;
    if v_destino is null then
      raise exception 'No se encuentra el proyecto al que vincular la solicitud'
        using errcode = 'P0002';
    end if;
  else
    raise exception 'Di a qué se vincula la solicitud' using errcode = '22023';
  end if;

  -- Ya estaba vinculada ahí: no se toca nada.
  if r.target_ficha_id is not distinct from p_ficha
     and r.target_project_id is not distinct from p_project then
    return r;
  end if;

  select coalesce(f.code, p.code) into v_antes
    from public.mail_requests m
    left join public.fichas f   on f.id = m.target_ficha_id
    left join public.projects p on p.id = m.target_project_id
   where m.id = p_request;

  perform set_config('app.skip_audit', 'on', true);
  update public.mail_requests
     set target_ficha_id = p_ficha,
         target_project_id = p_project,
         status = 'vinculada',
         reviewed_by = coalesce(reviewed_by, auth.uid()),
         reviewed_at = coalesce(reviewed_at, now()),
         updated_at = now()
   where id = p_request
  returning * into r;
  perform set_config('app.skip_audit', 'off', true);

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'vincular_solicitud', 'mail_requests',
          r.id, r.code,
          public.actor_name() || ' vinculó la solicitud ' || r.code || ' a ' || v_destino
          || case when v_antes is not null then ' (antes estaba en ' || v_antes || ')' else '' end,
          jsonb_build_object('ficha', p_ficha, 'project', p_project), r.is_demo);

  return r;
end $$;

comment on function public.link_mail_request(uuid, uuid, uuid) is
  'Vincula una solicitud con el presupuesto, visita, aviso o proyecto que se ha creado a partir de ella. No crea el registro: lo crea el formulario de siempre.';

grant  execute on function public.link_mail_request(uuid, uuid, uuid) to authenticated;
revoke execute on function public.link_mail_request(uuid, uuid, uuid) from anon, public;


-- ---------------------------------------------------------------------
-- 9) DESCARTAR Y RECUPERAR · ADMINISTRACIÓN
--
-- Descartar NO borra: el correo se conserva. Es lo que permite que la
-- bandeja siga siendo útil cuando llega publicidad.
-- ---------------------------------------------------------------------
create or replace function public.discard_mail_request(
  p_request uuid, p_note text default null)
returns public.mail_requests language plpgsql security definer set search_path = public as $$
declare r public.mail_requests;
begin
  perform public.assert_admin();

  select * into r from public.mail_requests where id = p_request;
  if not found then
    raise exception 'No se encuentra la solicitud' using errcode = 'P0002';
  end if;
  if r.status = 'vinculada' then
    raise exception 'Esta solicitud ya es %. Desvincúlala antes de descartarla.',
                    coalesce((select code from public.fichas where id = r.target_ficha_id),
                             (select code from public.projects where id = r.target_project_id))
      using errcode = '22023';
  end if;

  update public.mail_requests
     set status = 'descartada',
         notes = coalesce(nullif(trim(coalesce(p_note, '')), ''), notes),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_request
  returning * into r;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'descartar_solicitud', 'mail_requests', r.id, r.code,
          public.actor_name() || ' descartó la solicitud ' || r.code
          || case when r.notes is not null then ': ' || left(r.notes, 120) else '' end,
          '{}'::jsonb, r.is_demo);
  return r;
end $$;

create or replace function public.restore_mail_request(p_request uuid)
returns public.mail_requests language plpgsql security definer set search_path = public as $$
declare r public.mail_requests;
begin
  perform public.assert_admin();
  update public.mail_requests
     set status = 'pendiente'
   where id = p_request and status = 'descartada'
  returning * into r;
  if not found then
    raise exception 'Solo se recuperan las solicitudes descartadas' using errcode = '22023';
  end if;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'recuperar_solicitud', 'mail_requests', r.id, r.code,
          public.actor_name() || ' recuperó la solicitud ' || r.code
          || ', que estaba descartada', '{}'::jsonb, r.is_demo);
  return r;
end $$;

comment on function public.discard_mail_request(uuid, text) is
  'Descarta una solicitud que no era una petición. No borra el correo: se puede recuperar.';

grant  execute on function public.discard_mail_request(uuid, text) to authenticated;
revoke execute on function public.discard_mail_request(uuid, text) from anon, public;
grant  execute on function public.restore_mail_request(uuid) to authenticated;
revoke execute on function public.restore_mail_request(uuid) from anon, public;


-- ---------------------------------------------------------------------
-- 10) LAS FUNCIONES DE RECEPCIÓN, SOLO PARA EL SERVIDOR
--
-- Igual que las del token de Google Drive (archivo 24). Si estuvieran
-- abiertas a «authenticated», cualquiera con una sesión podría fabricar
-- solicitudes que parecieran venir de un cliente.
-- ---------------------------------------------------------------------
revoke all on function public.receive_mail_request(text, text, text, text, text, text, text, timestamptz, boolean, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.attach_mail_document(uuid, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.mark_mail_request_error(uuid, text) from public, anon, authenticated;

grant execute on function public.receive_mail_request(text, text, text, text, text, text, text, timestamptz, boolean, text, text, text, boolean) to service_role;
grant execute on function public.attach_mail_document(uuid, text, text, bigint, text) to service_role;
grant execute on function public.mark_mail_request_error(uuid, text) to service_role;


-- ---------------------------------------------------------------------
-- 11) PERMISOS DE LA TABLA
--
-- Leer y corregir: administración. Crear y borrar: nadie desde la
-- aplicación —las solicitudes las crea el servidor y no se borran—.
-- ---------------------------------------------------------------------
alter table public.mail_requests enable row level security;

grant all on public.mail_requests to service_role;
grant select, update on public.mail_requests to authenticated;
revoke insert, delete, truncate on public.mail_requests from authenticated;

/**
 * Y A «anon», NADA. Esto no es por si acaso.
 *
 * Supabase deja configurados «default privileges» que conceden TODO
 * sobre cada tabla nueva del esquema a «anon», «authenticated» y
 * «service_role». El archivo 03 revoca lo de «anon» en bloque, pero eso
 * solo alcanza a las tablas que existían entonces: una tabla creada
 * ahora nace concedida a la clave pública del navegador.
 *
 * Con las políticas de aquí, «anon» no vería ninguna fila —no hay
 * política que se lo permita—, pero tendría el permiso de la tabla y una
 * consulta suya devolvería una lista vacía en lugar de un «no tienes
 * permiso». La diferencia importa el día que alguien añada una política
 * nueva sin mirar quién tiene concedida la tabla.
 *
 * Lo cazó la prueba «Sin sesión no se ve la bandeja», que esperaba un
 * 42501 y recibía cero filas.
 */
revoke all on public.mail_requests from anon;

drop policy if exists mail_requests_select on public.mail_requests;
create policy mail_requests_select on public.mail_requests for select to authenticated
  using (public.is_admin());

drop policy if exists mail_requests_update on public.mail_requests;
create policy mail_requests_update on public.mail_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------
-- 12) LOS ARCHIVOS DEL CORREO, VISTOS DESDE EL PRESUPUESTO
--
-- La vista de los archivos 57 y 58, con una rama más: lo que un
-- presupuesto, un aviso o un proyecto ve de las solicitudes de correo
-- vinculadas a él. MISMAS COLUMNAS y en el mismo orden.
--
-- Esto es el punto 9 del encargo: los archivos de un correo que acaba
-- siendo una visita se consultan desde la visita, y desde el presupuesto
-- que salga de ella, sin copiar ni un archivo y sin una segunda
-- arquitectura documental.
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
    left join public.profiles pf on pf.id = d.uploaded_by;

comment on view public.related_documents is
  'Los archivos que una ficha o un proyecto VE sin ser suyos: los del presupuesto del que nació, los de las visitas técnicas vinculadas y los del correo del que salió la solicitud. No se copia ningún archivo; «origen_tipo» y «origen_code» dicen de dónde viene cada uno.';

grant select on public.related_documents to authenticated, service_role;
revoke all   on public.related_documents from anon;
