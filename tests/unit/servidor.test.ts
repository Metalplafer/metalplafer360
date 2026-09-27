/**
 * Las piezas que corren en el servidor (Supabase Edge Functions) se
 * comprueban aquí sin tocar Google: se firma un JWT de verdad y se
 * revisa con la clave pública, y se simulan las respuestas de Drive.
 *
 * También se comprueba que en el repositorio no hay ninguna credencial.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  accessToken, claimSet, deleteFromDrive, multipartBody, uploadToDrive,
} from '../../supabase/functions/_shared/drive.ts';

const ROOT = join(__dirname, '../..');

/**
 * Todo lo que acabaría en GitHub: se recorre de verdad el proyecto, para que
 * un archivo nuevo quede vigilado sin tener que acordarse de añadirlo aquí.
 */
function publicados(base = ''): string[] {
  const fuera = new Set(['node_modules', 'dist', '.git', '.env', 'coverage', 'test-results']);
  const binarios = /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|zip|pdf|xlsx)$/i;
  const salida: string[] = [];

  for (const entrada of readdirSync(join(ROOT, base), { withFileTypes: true })) {
    if (fuera.has(entrada.name)) continue;
    const ruta = base ? `${base}/${entrada.name}` : entrada.name;
    if (entrada.isDirectory()) salida.push(...publicados(ruta));
    else if (!binarios.test(entrada.name)) salida.push(ruta);
  }
  return salida;
}

// ---------------------------------------------------------------------
// Una clave de usar y tirar para firmar en la prueba
// ---------------------------------------------------------------------
async function testKey() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const base64 = Buffer.from(pkcs8).toString('base64').match(/.{1,64}/g)!.join('\\n');
  return {
    pem: `-----BEGIN PRIVATE KEY-----\\n${base64}\\n-----END PRIVATE KEY-----\\n`,
    publicKey: pair.publicKey,
  };
}

const fromB64Url = (text: string) =>
  Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

afterEach(() => { vi.unstubAllGlobals(); });

describe('acceso a Google Drive', () => {
  it('pide exactamente el permiso que necesita y por una hora', () => {
    const now = 1_800_000_000;
    const claims = claimSet('copias@metalplafer.iam.gserviceaccount.com', now);
    expect(claims.iss).toBe('copias@metalplafer.iam.gserviceaccount.com');
    expect(claims.scope).toBe('https://www.googleapis.com/auth/drive.file');
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
    expect(claims.exp - claims.iat).toBe(3600);
  });

  it('firma el JWT con la clave privada y la firma es válida', async () => {
    const { pem, publicKey } = await testKey();
    let enviado: { url: string; body: URLSearchParams } | null = null;

    vi.stubGlobal('fetch', async (url: string, init: { body: URLSearchParams }) => {
      enviado = { url, body: init.body };
      return { ok: true, json: async () => ({ access_token: 'token-de-prueba' }) };
    });

    const token = await accessToken({ email: 'copias@metalplafer.iam.gserviceaccount.com', privateKey: pem });
    expect(token).toBe('token-de-prueba');
    expect(enviado!.url).toBe('https://oauth2.googleapis.com/token');
    expect(enviado!.body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');

    const assertion = enviado!.body.get('assertion')!;
    const [head, payload, signature] = assertion.split('.');
    expect(JSON.parse(fromB64Url(head).toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(fromB64Url(payload).toString()).iss)
      .toBe('copias@metalplafer.iam.gserviceaccount.com');

    const valida = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', publicKey,
      fromB64Url(signature),
      new TextEncoder().encode(`${head}.${payload}`),
    );
    expect(valida).toBe(true);
  });

  it('avisa en castellano si Google rechaza las credenciales', async () => {
    const { pem } = await testKey();
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 401 }));
    await expect(accessToken({ email: 'x@y.z', privateKey: pem }))
      .rejects.toThrow(/Google no ha dado acceso/);
  });
});

describe('subida del archivo', () => {
  it('arma el envío con los metadatos y el ZIP', () => {
    const file = new Uint8Array([80, 75, 3, 4, 9, 9]);
    const body = multipartBody({ name: 'copia.zip' }, file, 'LIMITE');
    const text = Buffer.from(body).toString('latin1');

    expect(text).toContain('--LIMITE');
    expect(text).toContain('application/json');
    expect(text).toContain('"name":"copia.zip"');
    expect(text).toContain('application/zip');
    expect(text).toContain('--LIMITE--');
    // El contenido del ZIP viaja tal cual, sin tocar ni un byte.
    expect(Array.from(body).join(',')).toContain('80,75,3,4,9,9');
  });

  it('sube a la carpeta indicada y devuelve el enlace', async () => {
    const { pem } = await testKey();
    const llamadas: string[] = [];

    vi.stubGlobal('fetch', async (url: string) => {
      llamadas.push(url);
      if (url.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 't' }) };
      return {
        ok: true,
        json: async () => ({ id: 'archivo-1', name: 'copia.zip', webViewLink: 'https://drive/1' }),
      };
    });

    const subido = await uploadToDrive(
      { email: 'a@b.c', privateKey: pem, folderId: 'carpeta-123' },
      'copia.zip', new Uint8Array([1, 2, 3]),
    );

    expect(subido).toEqual({ id: 'archivo-1', name: 'copia.zip', link: 'https://drive/1' });
    expect(llamadas[1]).toContain('uploadType=multipart');
  });

  it('borrar una copia que ya no está se da por hecho', async () => {
    const { pem } = await testKey();
    vi.stubGlobal('fetch', async (url: string) => (url.includes('oauth2')
      ? { ok: true, json: async () => ({ access_token: 't' }) }
      : { ok: false, status: 404 }));

    expect(await deleteFromDrive({ email: 'a@b.c', privateKey: pem }, 'ya-no-esta')).toBe(true);
  });
});

describe('seguridad del repositorio', () => {
  const archivos = [
    'supabase/functions/admin-users/index.ts',
    'supabase/functions/backup-drive/index.ts',
    'supabase/functions/_shared/drive.ts',
    'supabase/sql/21_backup_automatico.sql',
    '.env.example',
  ];

  it('las funciones leen los secretos del entorno, nunca del código', () => {
    for (const archivo of archivos) {
      const texto = readFileSync(join(ROOT, archivo), 'utf8');
      // Nada que parezca una clave privada, un token o una contraseña escrita.
      // (La cabecera «-----BEGIN PRIVATE KEY-----» sí aparece suelta en el
      // código, porque hay que quitarla de la clave que llega del entorno;
      // lo que no puede haber es contenido de clave detrás de ella.)
      expect(texto).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\\n]*[A-Za-z0-9+/]{40,}/);
      expect(texto).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);          // JWT escrito a mano
      expect(texto).not.toMatch(/sbp_[A-Za-z0-9]{20,}/);             // token de Supabase
      expect(texto).not.toMatch(/"private_key"\s*:\s*"[^"]{40,}/);   // JSON de Google
    }
  });

  it('la clave de servidor solo se usa desde las variables de entorno', () => {
    const backup = readFileSync(join(ROOT, 'supabase/functions/backup-drive/index.ts'), 'utf8');
    const users = readFileSync(join(ROOT, 'supabase/functions/admin-users/index.ts'), 'utf8');
    for (const texto of [backup, users]) {
      expect(texto).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
      // Y siempre se comprueba quién llama antes de usarla.
      expect(texto).toMatch(/role !== 'admin'/);
    }
  });

  it('en el código de la aplicación no hay ninguna clave de servidor', () => {
    const encontrados = publicados()
      .filter((f) => f.startsWith('src/'))
      .filter((f) => /service_role_key|SUPABASE_SERVICE_ROLE/.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(encontrados).toEqual([]);
  });

  it('en todo lo que se publica no hay ninguna credencial de verdad', () => {
    // Se lee el archivo entero, no línea a línea: una clave de verdad ocupa
    // varias líneas y una búsqueda por líneas no la vería.
    const prohibido: Array<[string, RegExp]> = [
      ['una clave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s]*[A-Za-z0-9+/=\s]{100,}-----END/],
      ['el JSON de Google', /"private_key"\s*:\s*"[^"]{40,}"/],
      ['un token de Supabase', /sbp_[A-Za-z0-9]{20,}/],
      ['un token JWT', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
    ];

    const fugas: string[] = [];
    for (const archivo of publicados()) {
      const texto = readFileSync(join(ROOT, archivo), 'utf8');
      for (const [que, patron] of prohibido) {
        if (patron.test(texto)) fugas.push(`${archivo}: parece contener ${que}`);
      }
    }
    expect(fugas).toEqual([]);
  });

  it('el .env de ejemplo no lleva valores, solo los nombres', () => {
    const ejemplo = readFileSync(join(ROOT, '.env.example'), 'utf8');
    for (const linea of ejemplo.split('\n')) {
      if (!linea.includes('=') || linea.trim().startsWith('#')) continue;
      const valor = linea.slice(linea.indexOf('=') + 1).trim();
      // Vacío o un texto de relleno evidente, nunca algo con pinta de clave.
      expect(valor).not.toMatch(/^eyJ/);
      expect(valor.length, `El valor de «${linea.split('=')[0]}» parece real`)
        .toBeLessThan(60);
    }
  });
});

describe('las funciones del servidor son código válido', () => {
  it('se compilan sin errores de sintaxis', () => {
    for (const archivo of ['supabase/functions/admin-users/index.ts',
                           'supabase/functions/backup-drive/index.ts',
                           'supabase/functions/_shared/drive.ts']) {
      const salida = execFileSync('npx', [
        'esbuild', archivo, '--bundle', '--format=esm', '--platform=neutral',
        '--external:https://*', '--outfile=/dev/null',
      ], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      expect(salida).not.toContain('error');
    }
  });
});
