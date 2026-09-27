/**
 * METALPLAFER360 · Subida a Google Drive con una cuenta de servicio.
 *
 * LAS CREDENCIALES NO ESTÁN AQUÍ. Se leen de las variables de entorno de
 * Supabase (GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY), que nunca
 * salen del servidor ni se suben a GitHub.
 *
 * El acceso se consigue firmando un JWT con la clave privada y
 * cambiándolo por un token de una hora, que es el procedimiento estándar
 * de Google para cuentas de servicio.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64urlText = (text: string) => b64url(new TextEncoder().encode(text));

/** La clave privada llega con los saltos de línea escritos como \n. */
function pemToBytes(pem: string): Uint8Array {
  const clean = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const raw = atob(clean);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export interface DriveConfig {
  email: string;
  privateKey: string;
  /** Carpeta compartida con la cuenta de servicio (opcional). */
  folderId?: string;
  /** Unidad compartida, si se usa una. */
  driveId?: string;
}

/** Datos del JWT que Google pide para dar acceso. */
export function claimSet(email: string, now = Math.floor(Date.now() / 1000)) {
  return {
    iss: email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
}

export async function accessToken(config: DriveConfig): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = claimSet(config.email);
  const unsigned = `${b64urlText(JSON.stringify(header))}.${b64urlText(JSON.stringify(payload))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(config.privateKey) as unknown as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );
  const assertion = `${unsigned}.${b64url(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google no ha dado acceso (${response.status}). Revisa las credenciales.`);
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
    description: 'Copia de seguridad automática de METALPLAFER360',
    appProperties: { aplicacion: 'METALPLAFER360' },
  };
  if (config.folderId) metadata.parents = [config.folderId];

  const response = await fetch(
    `${UPLOAD_URL}?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true`,
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
    throw new Error(`Google Drive ha rechazado la subida (${response.status}): ${await response.text()}`);
  }
  const data = await response.json() as { id: string; name: string; webViewLink?: string };
  return { id: data.id, name: data.name, link: data.webViewLink };
}

export async function deleteFromDrive(config: DriveConfig, fileId: string): Promise<boolean> {
  const token = await accessToken(config);
  const response = await fetch(`${FILES_URL}/${fileId}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 significa que ya no estaba: se da por bueno.
  return response.ok || response.status === 404;
}
