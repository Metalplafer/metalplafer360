/**
 * METALPLAFER360 · Comprobación de que la aplicación arranca de verdad.
 *
 * Abre la aplicación ya construida en un navegador real (escritorio y
 * móvil) y verifica lo básico: que carga sin errores, que se ve la
 * pantalla de acceso, que las rutas protegidas no se pueden abrir sin
 * iniciar sesión y que en el móvil no aparecen barras de desplazamiento
 * horizontales.
 *
 *   npm run test:e2e
 *
 * La prueba construye la aplicación con unos datos de Supabase de ejemplo
 * (no son reales y no se conectan a ningún sitio) para poder comprobar
 * también el formulario y los mensajes de error.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIST = join(ROOT, 'dist');
const PORT = 4178;

console.log('   Construyendo la aplicación para la prueba…');
execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_SUPABASE_URL: 'https://ejemplo.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'clave-de-ejemplo-solo-para-la-prueba',
    VITE_LOGIN_DOMAIN: 'metalplafer.com',
  },
});

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let file = join(DIST, normalize(decodeURIComponent(url.pathname)));
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
    const info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) file = join(DIST, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('no encontrado');
  }
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`   ${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` → ${detail}`}`);
};

await new Promise((resolve) => server.listen(PORT, resolve));
// En algunos entornos Chromium ya viene instalado en el sistema; si es así
// se usa ese, para no tener que descargarlo.
const SYSTEM_CHROME = ['/opt/pw-browsers/chromium', process.env.CHROME_PATH]
  .filter(Boolean).find((p) => existsSync(p));
const browser = await chromium.launch({
  args: ['--no-sandbox'],
  ...(SYSTEM_CHROME ? { executablePath: SYSTEM_CHROME } : {}),
});

try {
  // ---------------- ESCRITORIO ----------------
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' });
  const page = await desktop.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  check('La aplicación arranca sin errores de JavaScript', errors.length === 0, errors[0]);
  check('Redirige a la pantalla de acceso', page.url().includes('#/login'));
  check('Se ve el título METALPLAFER360', (await page.locator('.login-art h1').innerText()).includes('METALPLAFER'));
  check('El formulario pide usuario y contraseña',
    await page.locator('#username').isVisible() && await page.locator('#password').isVisible());
  check('Los campos tienen etiqueta asociada (accesibilidad)',
    (await page.locator('label[for="username"]').count()) === 1 &&
    (await page.locator('label[for="password"]').count()) === 1);
  check('El botón de entrar está activo cuando hay configuración',
    await page.locator('button:has-text("Entrar")').isEnabled());
  check('No se muestra el aviso de configuración pendiente',
    (await page.locator('.alert-warn').count()) === 0);

  // Aviso al enviar el formulario vacío
  await page.locator('button:has-text("Entrar")').click();
  await page.waitForTimeout(200);
  const emptyMsg = await page.locator('.alert-danger').first().innerText().catch(() => '');
  check('Avisa si faltan datos, con un mensaje claro', emptyMsg.includes('Introduce tu usuario'), emptyMsg);

  // Intento de acceso con un usuario que no existe: el mensaje debe estar
  // en castellano y no contener jerga técnica.
  await page.locator('#username').fill('usuario.inexistente');
  await page.locator('#password').fill('contrasena-incorrecta');
  await page.locator('button:has-text("Entrar")').click();
  await page.waitForTimeout(2500);
  const failMsg = await page.locator('.alert-danger').first().innerText().catch(() => '');
  check('Un acceso fallido muestra un mensaje claro en castellano',
    /No se ha podido conectar|Usuario o contraseña incorrectos|Sin conexión/.test(failMsg), failMsg);
  check('El mensaje de error no contiene jerga técnica',
    !/fetch|undefined|TypeError|401|supabase/i.test(failMsg), failMsg);

  // Rutas protegidas
  for (const route of ['#/admin', '#/admin/proyectos', '#/t', '#/t/ordenes']) {
    await page.goto(`http://localhost:${PORT}/${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(120);
    check(`Sin sesión, ${route} no se puede abrir`, page.url().includes('#/login'));
  }

  // Mostrar/ocultar contraseña
  await page.goto(`http://localhost:${PORT}/#/login`, { waitUntil: 'networkidle' });
  await page.locator('#password').fill('secreto');
  check('La contraseña se oculta por defecto', await page.locator('#password').getAttribute('type') === 'password');
  await page.locator('button[aria-label="Mostrar contraseña"]').click();
  check('Se puede mostrar la contraseña', await page.locator('#password').getAttribute('type') === 'text');

  // Recursos de la aplicación instalable
  const manifest = await page.request.get(`http://localhost:${PORT}/manifest.webmanifest`);
  const manifestJson = await manifest.json();
  check('Existe el manifiesto de la aplicación instalable',
    manifest.ok() && manifestJson.name === 'METALPLAFER360' && manifestJson.icons.length >= 3);
  const icon = await page.request.get(`http://localhost:${PORT}/icons/icon-512.png`);
  check('Existen los iconos de la aplicación', icon.ok());
  const sw = await page.request.get(`http://localhost:${PORT}/sw.js`);
  check('Existe el service worker', sw.ok());

  // Ningún secreto en el código publicado
  const bundle = await (await page.request.get(`http://localhost:${PORT}/index.html`)).text();
  const assets = [...bundle.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
  let code = '';
  for (const a of assets) code += await (await page.request.get(`http://localhost:${PORT}/${a.replace(/^\//, '')}`)).text();
  check('El código publicado no contiene claves de servidor',
    !/service_role/.test(code) && !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(code));

  await desktop.close();

  // ---------------- MÓVIL ----------------
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  const mpage = await mobile.newPage();
  await mpage.goto(`http://localhost:${PORT}/#/login`, { waitUntil: 'networkidle' });

  const overflow = await mpage.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('En móvil no hay desplazamiento horizontal', overflow <= 0, `sobran ${overflow}px`);

  const box = await mpage.locator('button:has-text("Entrar")').boundingBox();
  check('El botón de entrar es grande y cómodo de pulsar', box.height >= 44, `${box?.height}px de alto`);

  const inputBox = await mpage.locator('#username').boundingBox();
  check('Los campos son grandes en el móvil', inputBox.height >= 44, `${inputBox?.height}px de alto`);
  check('El formulario ocupa el ancho del móvil', inputBox.width > 250 && inputBox.width <= 390);

  await mobile.close();
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`   ──────────────────────────────`);
console.log(`   TOTAL: ${results.length - failed.length} de ${results.length} comprobaciones correctas`);
process.exit(failed.length ? 1 : 0);
