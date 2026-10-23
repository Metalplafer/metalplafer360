/**
 * METALPLAFER360 · RECEPCIÓN DE CORREO → BANDEJA DE SOLICITUDES
 *
 * MEJORA 6 · Esto es lo que el proveedor de correo entrante llama cuando
 * llega un mensaje a «peticiones@metalplafer.com». Guarda el correo como
 * una solicitud provisional y sus adjuntos en el almacén, y NO crea
 * ningún presupuesto, ninguna visita ni ningún aviso: eso lo decide
 * administración a mano, desde la bandeja.
 *
 * Publicar:
 *   supabase functions deploy mail-inbound --no-verify-jwt
 *
 * EL «--no-verify-jwt» ES IMPRESCINDIBLE y conviene entender por qué: el
 * proveedor de correo no tiene sesión en METALPLAFER360 ni puede
 * firmar un token de Supabase. Si se publica sin esa opción, Supabase
 * rechaza la petición antes de que este código se ejecute y los correos
 * no entran nunca. Lo que autentica la petición es LA FIRMA DEL
 * PROVEEDOR, que se comprueba aquí abajo antes de tocar nada.
 *
 * SECRETOS (en Supabase → Edge Functions → Secrets; NUNCA en el
 * repositorio ni en variables «VITE_*», que son públicas):
 *
 *   MAIL_SIGNING_KEY   · clave de firma de webhooks del proveedor
 *   MAIL_API_KEY       · clave de la API del proveedor, para descargar
 *                        los adjuntos
 *   MAIL_MAX_MB        · tamaño máximo por adjunto (opcional, 25 por omisión)
 *
 * Y las que Supabase pone solo: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 *
 *
 * EL ORDEN IMPORTA: PRIMERO EL CORREO, DESPUÉS LOS ADJUNTOS
 *
 * Se guarda la solicitud ANTES de bajar un solo archivo. Así, si un
 * adjunto falla —el proveedor no responde, el archivo es enorme, el
 * almacén está lleno—, lo que NO se pierde es la petición del cliente:
 * queda en la bandeja marcada en «error», con su cuerpo y su remitente,
 * y administración puede llamar al cliente igualmente.
 *
 *
 * REINTENTOS
 *
 * El proveedor reintenta cuando no se le responde a tiempo. Las dos
 * funciones de la base de datos que se usan aquí son idempotentes
 * —«receive_mail_request» por el identificador del mensaje y
 * «attach_mail_document» por la ruta del archivo—, así que un reintento
 * no crea una segunda solicitud ni vuelve a subir lo que ya estaba.
 *
 * Y la regla de qué se responde:
 *
 *   · si NO se ha podido guardar la solicitud → 500, para que el
 *     proveedor reintente: no se ha guardado nada y se puede perder el
 *     correo;
 *   · si la solicitud YA está guardada → 200 aunque algún adjunto haya
 *     fallado. Reintentar no arreglaría el adjunto y el correo ya está a
 *     salvo; el fallo se ve en la bandeja.
 *
 *
 * LOS REGISTROS NO LLEVAN DATOS DE NADIE
 *
 * En los «console.log» de esta función no van direcciones de correo,
 * cuerpos, asuntos ni nada del cliente: solo el código de la solicitud y
 * qué ha fallado. Un registro de errores que copia los correos de los
 * clientes es una copia de los datos de los clientes en otro sitio.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  adjuntoAdmitido, dentroDeVentana, firmaValida, nombreSeguro, remitenteOriginal,
} from '../_shared/correo.ts';

const BUCKET = 'documentos';
const MAX_MB_POR_OMISION = 25;

/** Nada de CORS: a esto no llama ningún navegador, llama un servidor. */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

interface AdjuntoProveedor {
  url: string;
  name: string;
  contentType: string | null;
  size: number;
}

/**
 * ---------------------------------------------------------------------
 * LO ÚNICO QUE DEPENDE DEL PROVEEDOR
 *
 * Todo lo que sabe cómo viene la petición está en esta función y en la
 * de la firma. Cambiar de proveedor es cambiar esto, no el resto.
 *
 * Mailgun manda la notificación de una ruta con «store()» como
 * formulario, con estos campos: «sender» (el sobre), «from» (la cabecera
 * «De:»), «subject», «body-plain», «body-html», «recipient», «To»,
 * «Message-Id», «attachments» (una lista JSON con la URL de cada
 * adjunto) y los tres de la firma: «timestamp», «token» y «signature».
 * ---------------------------------------------------------------------
 */
function leeDelProveedor(form: FormData) {
  const t = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' && v.trim() !== '' ? v : null;
  };

  let adjuntos: AdjuntoProveedor[] = [];
  const bruto = t('attachments');
  if (bruto) {
    try {
      const lista = JSON.parse(bruto) as Record<string, unknown>[];
      adjuntos = (Array.isArray(lista) ? lista : [])
        .map((a) => ({
          url: String(a.url ?? ''),
          name: String(a.name ?? ''),
          contentType: a['content-type'] ? String(a['content-type']) : null,
          size: Number(a.size ?? 0),
        }))
        .filter((a) => a.url);
    } catch {
      // Una lista de adjuntos ilegible no tira el correo: se guarda el
      // correo y se marca el error.
      adjuntos = [];
    }
  }

  return {
    firma: {
      timestamp: t('timestamp') ?? '',
      token: t('token') ?? '',
      signature: t('signature') ?? '',
    },
    /**
     * El identificador del mensaje. Es LA CLAVE de que no se dupliquen
     * las solicitudes, así que si el proveedor no lo manda se usa su
     * «token», que es único por petición: peor para deduplicar
     * reintentos, pero nunca vacío.
     */
    messageId: t('Message-Id') ?? t('message-id') ?? t('token') ?? '',
    /** Quién nos lo manda: la cabecera «De:», y si no, el sobre. */
    remitente: primerCorreo(t('from')) ?? primerCorreo(t('sender')),
    remitenteNombre: nombreDe(t('from')),
    destinatarios: t('To') ?? t('recipient'),
    asunto: t('subject'),
    cuerpoTexto: t('body-plain') ?? t('stripped-text'),
    cuerpoHtml: t('body-html'),
    adjuntos,
    /** Para descargar los adjuntos hace falta la clave de la API. */
    descargaConApi: true,
  };
}

const CORREO = /[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/;

function primerCorreo(v: string | null): string | null {
  if (!v) return null;
  return CORREO.exec(v)?.[0]?.toLowerCase() ?? null;
}

function nombreDe(v: string | null): string | null {
  if (!v) return null;
  const nombre = v.replace(/<[^>]*>/g, '').replace(CORREO, '').replace(/["']/g, '').trim();
  return nombre && !nombre.includes('@') ? nombre : null;
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ ok: false, message: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const signingKey = Deno.env.get('MAIL_SIGNING_KEY');
  const apiKey = Deno.env.get('MAIL_API_KEY');
  const maxMb = Number(Deno.env.get('MAIL_MAX_MB') ?? MAX_MB_POR_OMISION) || MAX_MB_POR_OMISION;

  if (!url || !serviceKey) {
    console.error('mail-inbound: faltan las variables de Supabase');
    return json({ ok: false, message: 'Función mal configurada' }, 500);
  }
  if (!signingKey) {
    // Sin clave de firma NO se acepta nada. Es el único modo de saber
    // que un correo viene del proveedor y no de cualquiera que haya
    // encontrado la dirección de la función.
    console.error('mail-inbound: falta MAIL_SIGNING_KEY');
    return json({ ok: false, message: 'Función mal configurada' }, 500);
  }

  // ---------- ¿Qué ha llegado? ----------
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, message: 'Petición no válida' }, 400);
  }
  const correo = leeDelProveedor(form);

  // ---------- ¿Viene del proveedor? ----------
  const { timestamp, token, signature } = correo.firma;
  if (!await firmaValida(timestamp, token, signature, signingKey)) {
    console.warn('mail-inbound: firma no válida');
    return json({ ok: false, message: 'Firma no válida' }, 401);
  }
  if (!dentroDeVentana(timestamp, Math.floor(Date.now() / 1000))) {
    console.warn('mail-inbound: petición fuera de hora');
    return json({ ok: false, message: 'Petición caducada' }, 401);
  }
  if (!correo.messageId) {
    console.warn('mail-inbound: sin identificador de mensaje');
    return json({ ok: false, message: 'Mensaje sin identificador' }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ---------- ¿Era un reenvío? ----------
  const reenvio = remitenteOriginal(correo.asunto, correo.cuerpoTexto, correo.remitente);

  // ---------- 1) EL CORREO, ANTES QUE NADA ----------
  const { data: solicitud, error: errorSolicitud } = await admin.rpc('receive_mail_request', {
    p_provider_message_id: correo.messageId,
    p_subject: correo.asunto,
    p_body_text: correo.cuerpoTexto,
    p_body_html: correo.cuerpoHtml,
    p_sender_email: correo.remitente,
    p_sender_name: correo.remitenteNombre,
    p_recipients: correo.destinatarios,
    p_received_at: new Date().toISOString(),
    p_forwarded: reenvio.reenviado,
    p_original_sender_email: reenvio.correo,
    p_original_sender_name: reenvio.nombre,
    p_original_subject: reenvio.asunto,
    p_sender_needs_review: reenvio.pendienteDeRevision,
  });

  if (errorSolicitud || !solicitud) {
    // No se ha guardado NADA: que el proveedor reintente.
    console.error('mail-inbound: no se ha podido registrar la solicitud', errorSolicitud?.code);
    return json({ ok: false, message: 'No se ha podido registrar la solicitud' }, 500);
  }

  const fila = solicitud as { id: string; code: string };
  const problemas: string[] = [];

  // ---------- 2) LOS ADJUNTOS, UNO A UNO ----------
  //
  // De uno en uno y no todos a la vez: la función tiene 256 MB de
  // memoria, y bajarse en paralelo cinco fotos de 20 MB es la manera de
  // quedarse sin ella a mitad del trabajo.
  for (const adjunto of correo.adjuntos) {
    const nombre = nombreSeguro(adjunto.name);
    const ruta = `mail/${fila.id}/${nombre}`;

    const admitido = adjuntoAdmitido(adjunto.contentType, adjunto.size, maxMb);
    if (!admitido.ok) {
      problemas.push(`«${nombre}»: ${admitido.motivo}`);
      continue;
    }

    try {
      const respuesta = await fetch(adjunto.url, {
        headers: correo.descargaConApi && apiKey
          ? { Authorization: `Basic ${btoa(`api:${apiKey}`)}` }
          : {},
      });
      if (!respuesta.ok) {
        problemas.push(`«${nombre}»: el proveedor devolvió ${respuesta.status} al descargarlo`);
        continue;
      }

      const bytes = new Uint8Array(await respuesta.arrayBuffer());

      // El tamaño que DICE el proveedor y el que trae de verdad pueden
      // no coincidir. Se comprueba otra vez con el de verdad: es el que
      // va a ocupar en el almacén.
      const real = adjuntoAdmitido(
        adjunto.contentType ?? respuesta.headers.get('content-type'), bytes.byteLength, maxMb,
      );
      if (!real.ok) {
        problemas.push(`«${nombre}»: ${real.motivo}`);
        continue;
      }

      const subida = await admin.storage.from(BUCKET).upload(ruta, bytes, {
        contentType: adjunto.contentType ?? 'application/octet-stream',
        upsert: true,
      });
      if (subida.error) {
        problemas.push(`«${nombre}»: no se ha podido guardar en el almacén`);
        continue;
      }

      const { error: errorDoc } = await admin.rpc('attach_mail_document', {
        p_request: fila.id,
        p_storage_path: ruta,
        p_file_name: adjunto.name || nombre,
        p_size_bytes: bytes.byteLength,
        p_mime_type: adjunto.contentType,
      });
      if (errorDoc) {
        // El archivo está en el almacén pero no registrado: se retira
        // para no dejar basura que nadie va a ver nunca.
        await admin.storage.from(BUCKET).remove([ruta]).catch(() => undefined);
        problemas.push(`«${nombre}»: no se ha podido registrar`);
      }
    } catch (e) {
      problemas.push(`«${nombre}»: ${e instanceof Error ? e.name : 'error al descargarlo'}`);
    }
  }

  // ---------- 3) SI ALGO FALLÓ, QUE SE VEA ----------
  if (problemas.length) {
    console.error(`mail-inbound: ${fila.code} con ${problemas.length} adjunto(s) con problemas`);
    await admin.rpc('mark_mail_request_error', {
      p_request: fila.id,
      p_detail: `No se han podido guardar ${problemas.length} adjunto(s): ${problemas.join('; ')}`,
    });
  }

  // La solicitud está guardada: 200 aunque haya adjuntos con problemas.
  // Reintentar no los arreglaría, y el correo ya no se puede perder.
  return json({
    ok: true,
    code: fila.code,
    adjuntos: correo.adjuntos.length - problemas.length,
    con_problemas: problemas.length,
  });
});
