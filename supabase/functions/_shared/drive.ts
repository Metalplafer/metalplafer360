/**
 * METALPLAFER360 · Subida de las copias a Google Drive.
 *
 * LAS CREDENCIALES NO ESTÁN AQUÍ. El identificador y el secreto del
 * cliente de Google son secretos de Supabase, y el permiso duradero vive
 * en la bóveda: nada de eso sale del servidor ni se sube a GitHub.
 *
 * CÓMO SE CONSIGUE EL ACCESO
 * La empresa autoriza su cuenta una vez (ver la función «google-oauth»)
 * y Google entrega un permiso duradero. Con ese permiso se pide, cada
 * vez que hace falta, un acceso de una hora. Por eso la copia de las
 * 02:00 funciona sin que nadie tenga la aplicación abierta.
 *
 * Antes se usaba una cuenta de servicio, pero Google no le da
 * almacenamiento propio («Service Accounts do not have storage quota»),
 * así que no podía guardar nada en «Mi unidad» de una cuenta Gmail.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

export interface DriveConfig {
  /** Identificador del cliente OAuth de Google. */
  clientId: string;
  /** Secreto del cliente OAuth. Solo existe en el servidor. */
  clientSecret: string;
  /** Permiso duradero de la cuenta de la empresa, leído de la bóveda. */
  refreshToken: string;
  /** Carpeta creada por la aplicación en «Mi unidad». */
  folderId?: string;
}

/** Cuando hay que volver a autorizar, se distingue del resto de fallos. */
export class DriveNoAutorizado extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveNoAutorizado';
  }
}

/**
 * Cambia el permiso duradero por un acceso de una hora.
 * Si Google responde «invalid_grant» es que la empresa retiró el permiso
 * o caducó, y hay que volver a conectar desde Configuración.
 */
export async function accessToken(config: DriveConfig): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    let detalle = '';
    try { detalle = ((await response.json()) as { error?: string }).error ?? ''; } catch { /* da igual */ }

    if (response.status === 400 || response.status === 401 || detalle === 'invalid_grant') {
      throw new DriveNoAutorizado(
        'Google ya no acepta el permiso guardado. Entra en Configuración → Copias de '
        + 'seguridad y vuelve a conectar Google Drive.',
      );
    }
    throw new Error(`Google no ha dado acceso (${response.status}). Inténtalo más tarde.`);
  }

  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error('Google no ha devuelto ningún token de acceso.');
  return data.access_token;
}

/** Cuerpo multipart con los metadatos y el archivo, como pide Drive. */
export function multipartBody(metadata: Record<string, unknown>, file: Uint8Array, boundary: string) {
  const head = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`
    + `${JSON.stringify(metadata)}\r\n`
    + `--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
  );
  const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);

  const body = new Uint8Array(head.length + file.length + tail.length);
  body.set(head, 0);
  body.set(file, head.length);
  body.set(tail, head.length + file.length);
  return body;
}

export interface UploadedFile { id: string; name: string; link?: string }

export async function uploadToDrive(
  config: DriveConfig, fileName: string, bytes: Uint8Array,
): Promise<UploadedFile> {
  const token = await accessToken(config);
  const boundary = `m360-${crypto.randomUUID()}`;

  const metadata: Record<string, unknown> = {
    name: fileName,
    mimeType: 'application/zip',
    description: 'Copia de seguridad de METALPLAFER360',
    appProperties: { aplicacion: 'METALPLAFER360' },
  };
  if (config.folderId) metadata.parents = [config.folderId];

  const response = await fetch(
    `${UPLOAD_URL}?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody(metadata, bytes, boundary) as unknown as BodyInit,
    },
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        'No se encuentra la carpeta de las copias en Google Drive. Si la has borrado o '
        + 'movido a la papelera, vuelve a conectar Google Drive desde Configuración.',
      );
    }
    if (response.status === 403) {
      throw new Error(
        'Google Drive no ha dejado guardar el archivo. Lo más habitual es que la cuenta '
        + 'no tenga espacio libre.',
      );
    }
    throw new Error(`Google Drive ha rechazado la subida (${response.status}).`);
  }

  const data = await response.json() as { id: string; name: string; webViewLink?: string };
  return { id: data.id, name: data.name, link: data.webViewLink };
}

export async function deleteFromDrive(config: DriveConfig, fileId: string): Promise<boolean> {
  const token = await accessToken(config);
  const response = await fetch(`${FILES_URL}/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 significa que ya no estaba: se da por bueno.
  return response.ok || response.status === 404;
}
