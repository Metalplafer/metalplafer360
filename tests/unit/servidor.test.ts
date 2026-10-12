/**
 * Las piezas que corren en el servidor (Supabase Edge Functions) se
 * comprueban aquí sin tocar Google: se firma un JWT de verdad y se
 * revisa con la clave pública, y se simulan las respuestas de Drive.
 *
 * También se comprueba que en el repositorio no hay ninguna credencial.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DriveNoAutorizado, accessToken, deleteFromDrive, multipartBody, uploadToDrive,
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

afterEach(() => { vi.unstubAllGlobals(); });

/** Una configuración de Drive cualquiera, con credenciales inventadas. */
const CONFIG = {
  clientId: 'cliente-de-prueba.apps.googleusercontent.com',
  clientSecret: 'secreto-de-prueba',
  refreshToken: 'permiso-duradero-de-prueba',
  folderId: 'carpeta-de-las-copias',
};

describe('acceso a Google Drive con la cuenta de la empresa', () => {
  it('cambia el permiso duradero por un acceso de una hora', async () => {
    let enviado: { url: string; body: URLSearchParams } | null = null;

    vi.stubGlobal('fetch', async (url: string, init: { body: URLSearchParams }) => {
      enviado = { url, body: init.body };
      return { ok: true, json: async () => ({ access_token: 'acceso-de-una-hora' }) };
    });

    expect(await accessToken(CONFIG)).toBe('acceso-de-una-hora');
    expect(enviado!.url).toBe('https://oauth2.googleapis.com/token');
    expect(enviado!.body.get('grant_type')).toBe('refresh_token');
    expect(enviado!.body.get('refresh_token')).toBe(CONFIG.refreshToken);
    // El secreto del cliente viaja al servidor de Google, nunca al navegador.
    expect(enviado!.body.get('client_secret')).toBe(CONFIG.clientSecret);
  });

  it('si Google ya no acepta el permiso, pide volver a conectar', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }),
    }));

    await expect(accessToken(CONFIG)).rejects.toBeInstanceOf(DriveNoAutorizado);
    await expect(accessToken(CONFIG)).rejects.toThrow(/vuelve a conectar Google Drive/i);
  });

  it('un fallo pasajero de Google NO se confunde con tener que reautorizar', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503, json: async () => ({}) }));

    await expect(accessToken(CONFIG)).rejects.not.toBeInstanceOf(DriveNoAutorizado);
    await expect(accessToken(CONFIG)).rejects.toThrow(/más tarde/i);
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

  it('sube a la carpeta de la empresa y devuelve el enlace', async () => {
    const llamadas: string[] = [];

    vi.stubGlobal('fetch', async (url: string, init: { body?: unknown }) => {
      llamadas.push(url);
      if (url.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 't' }) };
      const cuerpo = Buffer.from(init!.body as Uint8Array).toString('latin1');
      expect(cuerpo).toContain('"parents":["carpeta-de-las-copias"]');
      return {
        ok: true,
        json: async () => ({ id: 'archivo-1', name: 'copia.zip', webViewLink: 'https://drive/1' }),
      };
    });

    const subido = await uploadToDrive(CONFIG, 'copia.zip', new Uint8Array([1, 2, 3]));
    expect(subido).toEqual({ id: 'archivo-1', name: 'copia.zip', link: 'https://drive/1' });
    expect(llamadas[1]).toContain('uploadType=multipart');
  });

  it('si la carpeta ya no existe, lo explica en castellano', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url.includes('oauth2')
      ? { ok: true, json: async () => ({ access_token: 't' }) }
      : { ok: false, status: 404, text: async () => 'File not found' }));

    await expect(uploadToDrive(CONFIG, 'copia.zip', new Uint8Array([1])))
      .rejects.toThrow(/No se encuentra la carpeta de las copias/i);
  });

  it('si la cuenta de Google no tiene espacio, también', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url.includes('oauth2')
      ? { ok: true, json: async () => ({ access_token: 't' }) }
      : { ok: false, status: 403, text: async () => 'quota' }));

    await expect(uploadToDrive(CONFIG, 'copia.zip', new Uint8Array([1])))
      .rejects.toThrow(/no tenga espacio libre/i);
  });

  it('borrar una copia que ya no está se da por hecho', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url.includes('oauth2')
      ? { ok: true, json: async () => ({ access_token: 't' }) }
      : { ok: false, status: 404 }));

    expect(await deleteFromDrive(CONFIG, 'ya-no-esta')).toBe(true);
  });
});

describe('seguridad del repositorio', () => {
  const archivos = [
    'supabase/functions/admin-users/index.ts',
    'supabase/functions/backup-drive/index.ts',
    'supabase/functions/google-oauth/index.ts',
    'supabase/functions/_shared/drive.ts',
    'supabase/sql/21_backup_automatico.sql',
    'supabase/sql/24_google_oauth.sql',
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

  it('la aplicación no toca NINGUNA credencial de Google', () => {
    // El navegador solo pregunta el estado y pide una dirección a la que
    // ir. El secreto del cliente y el permiso duradero se quedan en el
    // servidor; aquí no puede aparecer ni el nombre de la variable.
    const prohibido = [
      /GOOGLE_OAUTH_CLIENT_SECRET/,
      /GOOGLE_PRIVATE_KEY/,
      /GOOGLE_SERVICE_ACCOUNT/,
      /refresh_token/,
      /drive_get_token/,
      /drive_put_token/,
      /client_secret/,
    ];
    const fugas: string[] = [];
    for (const archivo of publicados().filter((f) => f.startsWith('src/'))) {
      const texto = readFileSync(join(ROOT, archivo), 'utf8');
      for (const patron of prohibido) {
        if (patron.test(texto)) fugas.push(`${archivo}: ${patron.source}`);
      }
    }
    expect(fugas).toEqual([]);
  });

  it('ninguna credencial de Google viaja en una variable VITE_', () => {
    const ejemplo = readFileSync(join(ROOT, '.env.example'), 'utf8');
    expect(ejemplo).not.toMatch(/VITE_[A-Z_]*GOOGLE/);
    expect(ejemplo).not.toMatch(/VITE_[A-Z_]*SECRET/);
    expect(ejemplo).not.toMatch(/VITE_[A-Z_]*TOKEN/);

    // Y lo que de verdad se publica: ninguna VITE_ con pinta de secreto.
    const usadas = new Set<string>();
    for (const archivo of publicados().filter((f) => f.startsWith('src/'))) {
      for (const m of readFileSync(join(ROOT, archivo), 'utf8').matchAll(/VITE_[A-Z0-9_]+/g)) {
        usadas.add(m[0]);
      }
    }
    // VITE_BASE_PATH solo lo usa la construcción (vite.config.ts), no el
    // código de la aplicación.
    expect([...usadas].sort()).toEqual(
      ['VITE_LOGIN_DOMAIN', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL'],
    );
  });

  it('las dos funciones sin sesión comprueban ellas mismas quién llama', () => {
    // backup-drive y google-oauth se publican con --no-verify-jwt porque
    // ni el cron ni la vuelta de Google traen sesión. Eso solo es seguro
    // si la comprobación la hacen ellas, así que se exige aquí.
    const backup = readFileSync(join(ROOT, 'supabase/functions/backup-drive/index.ts'), 'utf8');
    expect(backup).toMatch(/role !== 'admin'/);
    expect(backup).toMatch(/BACKUP_CRON_SECRET/);

    const oauth = readFileSync(join(ROOT, 'supabase/functions/google-oauth/index.ts'), 'utf8');
    expect(oauth).toMatch(/role !== 'admin'/);
    // La vuelta de Google se acepta solo con un «state» que se gasta.
    expect(oauth).toMatch(/google_oauth_state/);
    expect(oauth).toMatch(/\.delete\(\)\.eq\('state', state\)/);

    const config = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8');
    expect(config).toMatch(/\[functions\.backup-drive\][\s\S]*?verify_jwt = false/);
    expect(config).toMatch(/\[functions\.google-oauth\][\s\S]*?verify_jwt = false/);
    // admin-users se queda con la comprobación de Supabase puesta.
    expect(config).not.toMatch(/\[functions\.admin-users\]/);
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
  /**
   * Se compilan con esbuild llamándolo COMO BIBLIOTECA, no como programa.
   *
   * Antes se lanzaba esbuild como PROGRAMA externo a través del lanzador
   * de npm, y eso daba dos problemas en Windows:
   *   · ese lanzador allí es un archivo .cmd, y «execFileSync» sin shell
   *     no lo encuentra (termina en ENOENT);
   *   · la salida se mandaba al dispositivo nulo de Unix, que en Windows
   *     no existe: esbuild habría intentado escribir un archivo de verdad
   *     con ese nombre.
   *
   * Usando la API de esbuild no se lanza ningún proceso externo, así que
   * funciona igual en Windows, macOS y Linux, y además no escribe nada
   * («write: false»): se compila en memoria.
   *
   * La comprobación es MÁS estricta que antes: antes se miraba que la
   * salida de texto no dijera «error» —y si esbuild fallaba de verdad,
   * «execFileSync» lanzaba la excepción antes de llegar a mirarla—.
   * Ahora se exige que la lista de errores esté vacía, y se enseñan.
   */
  it('se compilan sin errores de sintaxis', async () => {
    const { buildSync } = await import('esbuild');

    for (const archivo of ['supabase/functions/admin-users/index.ts',
                           'supabase/functions/backup-drive/index.ts',
                           'supabase/functions/google-oauth/index.ts',
                           'supabase/functions/_shared/drive.ts']) {
      const resultado = buildSync({
        entryPoints: [join(ROOT, archivo)],
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        external: ['https://*'],
        write: false,            // nada en el disco: se compila en memoria
        logLevel: 'silent',      // los errores se leen del resultado, no de la consola
      });

      expect(resultado.errors.map((e) => `${archivo}: ${e.text}`)).toEqual([]);
      expect(resultado.outputFiles?.length, `${archivo} no ha generado nada`)
        .toBeGreaterThan(0);
    }
  });
});
