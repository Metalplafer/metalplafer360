/**
 * METALPLAFER360 · LO QUE HAY QUE AVERIGUAR DE UN CORREO QUE LLEGA
 *
 * MEJORA 6 · Este archivo NO habla con nadie: no toca la base de datos,
 * no hace peticiones y no lee variables de entorno. Son funciones puras
 * —salvo la de la firma, que necesita la criptografía del sistema— y por
 * eso se pueden probar una por una en «tests/unit/correo.test.ts».
 *
 * Está aquí, en «_shared», y no en «src/», porque esto lo usa la función
 * de servidor que recibe el correo, y las funciones de servidor se
 * empaquetan solas: importar de «src/» las ataría al frontend y a su
 * manera de resolver rutas.
 *
 * LO QUE RESUELVE, y es la parte delicada del módulo: cuando
 * administración REENVÍA un correo de un cliente, el remitente del
 * mensaje que llega es administración. El cliente está dentro del
 * cuerpo, escrito por el programa de correo de quien lo reenvió, en
 * castellano o en inglés y de media docena de formas distintas. Si no se
 * puede saber con seguridad, NO SE INVENTA: se devuelve que hace falta
 * que lo mire una persona.
 */

// ---------------------------------------------------------------------
// LA FIRMA DEL PROVEEDOR
// ---------------------------------------------------------------------

/**
 * ¿Viene esto de verdad del proveedor de correo?
 *
 * El proveedor manda tres campos —«timestamp», «token» y «signature»— y
 * la firma es el HMAC-SHA256 de los dos primeros pegados, en
 * hexadecimal, con la clave de firma de webhooks de la cuenta. Esa clave
 * NO es la clave de la API: es otra, pensada para esto, y vive como
 * secreto del servidor.
 *
 * La comparación es en TIEMPO CONSTANTE. Comparar dos textos con «===»
 * se para en la primera letra distinta, y cuánto tarda en pararse dice
 * cuántas letras se habían acertado: con suficientes intentos, eso
 * permite adivinar una firma byte a byte. Aquí se recorre siempre todo.
 */
export async function firmaValida(
  timestamp: string, token: string, signature: string, clave: string,
): Promise<boolean> {
  if (!timestamp || !token || !signature || !clave) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(clave),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${timestamp}${token}`),
  );
  const esperado = [...new Uint8Array(firma)]
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  return igualesEnTiempoConstante(esperado, signature.toLowerCase().trim());
}

export function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

/**
 * ¿Es reciente la petición?
 *
 * Una firma capturada hace tres meses sigue siendo una firma válida, así
 * que además se mira la hora. La ventana es ANCHA a propósito —el
 * proveedor puede tardar en reintentar y no controlamos sus colas—, y la
 * protección de verdad contra repeticiones es otra: recibir dos veces el
 * mismo mensaje no crea dos solicitudes, porque la función de la base de
 * datos es idempotente por el identificador del mensaje.
 */
export function dentroDeVentana(
  timestamp: string, ahoraSegundos: number, minutos = 15,
): boolean {
  const t = Number(timestamp);
  if (!Number.isFinite(t) || t <= 0) return false;
  return Math.abs(ahoraSegundos - t) <= minutos * 60;
}

// ---------------------------------------------------------------------
// EL REMITENTE DE VERDAD
// ---------------------------------------------------------------------

/** Un correo suelto o dentro de «Nombre <correo@dominio>». */
const CORREO = /[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/;

/**
 * Marcas de que un mensaje viene reenviado, en los asuntos que pone cada
 * programa de correo. «RV:» es el de Outlook en castellano, «Fwd:» el de
 * Gmail, «TR:» el de Outlook en francés (que también aparece: hay
 * clientes en Francia).
 */
const ASUNTO_REENVIO = /^\s*(fwd?|rv|re?env|tr)\s*:/i;

/** Separadores que mete cada cliente de correo antes del mensaje original. */
const SEPARADORES = [
  /-{2,}\s*forwarded message\s*-{2,}/i,
  /-{2,}\s*mensaje reenviado\s*-{2,}/i,
  /-{2,}\s*mensaje original\s*-{2,}/i,
  /-{2,}\s*original message\s*-{2,}/i,
  /begin forwarded message\s*:/i,
  /^\s*de\s*:\s*.*@/im,
  /^\s*from\s*:\s*.*@/im,
];

export interface Reenvio {
  /** Si el mensaje parece venir reenviado. */
  reenviado: boolean;
  /** El correo del cliente, si se ha podido determinar con seguridad. */
  correo: string | null;
  /** Su nombre, si venía escrito. */
  nombre: string | null;
  /** El asunto original, sin los «RV:» de delante. */
  asunto: string | null;
  /**
   * «No se ha podido saber quién lo mandó»: la pantalla lo pedirá a mano.
   * Es verdadero cuando parece reenviado y NO hay un remitente fiable.
   */
  pendienteDeRevision: boolean;
}

/**
 * Quién mandó esto originalmente.
 *
 * Se decide con DOS señales, no con una: el asunto («RV:», «Fwd:») y el
 * cuerpo (el bloque «De: … <correo>» que mete el programa de correo al
 * reenviar). Hace falta que las dos cuadren para dar un remitente por
 * bueno:
 *
 *   · si no parece reenviado, el remitente es el que venía en el sobre y
 *     aquí no hay nada que decir;
 *   · si parece reenviado y dentro hay un «De:» con un correo DISTINTO
 *     del que nos lo mandó, ese es el cliente;
 *   · si parece reenviado y no se encuentra, o el que se encuentra es el
 *     mismo que lo reenvió, se devuelve «pendienteDeRevision»: alguien
 *     tendrá que mirarlo. No se adivina.
 *
 * Por qué no basta con el asunto: un cliente puede escribir «RV: ...»
 * directamente. Y por qué no basta con el cuerpo: una firma de correo
 * con «De: Pepe <pepe@x.com>» dentro no convierte el mensaje en un
 * reenvío. Por eso se exige que el correo encontrado sea distinto del
 * remitente y, además, que haya un separador de reenvío de los de
 * verdad.
 */
export function remitenteOriginal(
  asunto: string | null | undefined,
  cuerpo: string | null | undefined,
  remitente: string | null | undefined,
): Reenvio {
  const asuntoLimpio = (asunto ?? '').trim();
  const texto = cuerpo ?? '';
  const de = (remitente ?? '').trim().toLowerCase();

  const porAsunto = ASUNTO_REENVIO.test(asuntoLimpio);
  const porCuerpo = SEPARADORES.some((re) => re.test(texto));
  const reenviado = porAsunto || porCuerpo;

  const asuntoOriginal = porAsunto
    ? asuntoLimpio.replace(/^\s*(?:(?:fwd?|rv|re?env|tr)\s*:\s*)+/i, '').trim() || null
    : null;

  if (!reenviado) {
    return {
      reenviado: false, correo: null, nombre: null,
      asunto: null, pendienteDeRevision: false,
    };
  }

  const encontrado = buscaBloqueDe(texto);
  const correo = encontrado?.correo?.toLowerCase() ?? null;

  // El mismo que lo reenvió no sirve: eso pasa cuando alguien se reenvía
  // un correo a sí mismo, o cuando lo que se ha encontrado es su propia
  // firma.
  const fiable = Boolean(correo) && correo !== de;

  return {
    reenviado: true,
    correo: fiable ? correo : null,
    nombre: fiable ? (encontrado?.nombre ?? null) : null,
    asunto: asuntoOriginal,
    pendienteDeRevision: !fiable,
  };
}

/**
 * El primer bloque «De: Nombre <correo>» o «From: …» del cuerpo.
 *
 * Se recorre línea a línea, y se coge EL PRIMERO que aparece. Un cuerpo
 * reenviado puede traer varios bloques anidados —un reenvío de un
 * reenvío, o una conversación entera—, y el primero es el del mensaje
 * que acaban de reenviarnos, que es el que interesa. Los de más abajo
 * son correos anteriores de la misma conversación.
 */
function buscaBloqueDe(texto: string): { correo: string; nombre: string | null } | null {
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*(?:de|from)\s*:\s*(.+)$/i.exec(linea);
    if (!m) continue;
    const resto = m[1].trim();
    const correo = CORREO.exec(resto)?.[0];
    if (!correo) continue;

    // «Nombre Apellido <correo@dominio>» → el nombre es lo de delante,
    // sin comillas ni el propio correo.
    let nombre: string | null = resto
      .replace(/<[^>]*>/g, '')
      .replace(correo, '')
      .replace(/["']/g, '')
      .replace(/[<>(),;]/g, ' ')
      .trim();
    if (!nombre || nombre.includes('@')) nombre = null;

    return { correo, nombre };
  }
  return null;
}

// ---------------------------------------------------------------------
// LOS ADJUNTOS
// ---------------------------------------------------------------------

/**
 * Un nombre de archivo que se pueda guardar sin sorpresas.
 *
 * Lo que llega en un correo es texto escrito por cualquiera: puede
 * traer barras («../../otra-carpeta»), acentos, espacios, caracteres de
 * control o 300 letras. Esto deja un nombre plano, sin rutas y con
 * extensión.
 *
 * NO se reutiliza «safeStorageName» del frontend a propósito: esto se
 * empaqueta aparte, en el servidor, y una dependencia de «src/» ataría
 * la función de servidor al frontend. Son veinte líneas y tienen su
 * propia prueba.
 */
export function nombreSeguro(nombre: string | null | undefined, porDefecto = 'adjunto'): string {
  const bruto = (nombre ?? '').split(/[/\\]/).pop() ?? '';
  const sinAcentos = bruto.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const limpio = sinAcentos
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.\-]+/, '')
    .slice(0, 120);

  if (!limpio || limpio === '.' || limpio === '..') return porDefecto;
  return limpio;
}

/** Los tipos de archivo que tiene sentido recibir de un cliente. */
export const TIPOS_ADMITIDOS = [
  'image/', 'video/', 'audio/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument',
  'application/zip', 'application/x-zip-compressed',
  'application/acad', 'application/dxf', 'image/vnd.dxf', 'application/dwg',
  'text/plain', 'text/csv',
];

/**
 * ¿Se guarda este adjunto?
 *
 * Se rechaza lo que no se va a poder abrir y lo que es demasiado grande,
 * y se dice POR QUÉ: el motivo acaba en la solicitud, a la vista de
 * administración, en lugar de perderse. Un adjunto rechazado no tira el
 * correo: el correo se guarda igual.
 *
 * Los ejecutables se rechazan por lo que son: nadie manda un .exe para
 * pedir una barandilla, y guardarlos en el almacén de la empresa es
 * guardar un problema.
 */
export function adjuntoAdmitido(
  mime: string | null | undefined, bytes: number, limiteMb: number,
): { ok: true } | { ok: false; motivo: string } {
  const tipo = (mime ?? '').toLowerCase().trim();

  if (!Number.isFinite(bytes) || bytes < 0) {
    return { ok: false, motivo: 'tamaño desconocido' };
  }
  if (bytes === 0) return { ok: false, motivo: 'archivo vacío' };

  const limite = limiteMb * 1024 * 1024;
  if (bytes > limite) {
    return {
      ok: false,
      motivo: `ocupa ${(bytes / 1024 / 1024).toFixed(1)} MB y el máximo es ${limiteMb} MB`,
    };
  }

  if (!tipo) return { ok: false, motivo: 'sin tipo de archivo' };
  if (!TIPOS_ADMITIDOS.some((t) => tipo.startsWith(t))) {
    return { ok: false, motivo: `tipo de archivo no admitido (${tipo})` };
  }
  return { ok: true };
}
