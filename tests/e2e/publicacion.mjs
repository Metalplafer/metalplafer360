/**
 * METALPLAFER360 · LA PUBLICACIÓN SE ABRE EN LA RAÍZ DE UN DOMINIO
 *
 *   npm run test:publicacion
 *
 * Esta prueba existe por un fallo concreto: al poner el dominio propio
 * (360.metalplafer.com), la aplicación se quedaba EN BLANCO. El workflow
 * construía con «base = /metalplafer360/», que es la carpeta en la que
 * vive la aplicación dentro de metalplafer.github.io. En un dominio que
 * sirve en la RAÍZ, esa carpeta no existe: todos los JavaScript y los
 * estilos devolvían 404 y no se pintaba nada.
 *
 * Así que esto no comprueba el código: comprueba LA PUBLICACIÓN. Se
 * construye como lo hace el workflow, se sirve en la raíz igual que el
 * dominio, se abre en un navegador de verdad y se exige:
 *
 *   · que NINGUNA petición devuelva 404;
 *   · que no haya errores de JavaScript;
 *   · que la interfaz se pinte de verdad (no una pantalla en blanco).
 *
 * Y de paso se comprueba que la publicación anterior —dentro de una
 * carpeta— sigue funcionando si se define VITE_BASE_PATH, que es la
 * forma de volver atrás sin tocar código.
 */
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
// «launchBrowser» ya sabe dónde está el Chromium de este equipo.
import { createChecker, launchBrowser } from './fake-supabase.mjs';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const DIST = join(RAIZ, 'dist');
const PUERTO = 4197;
const { check, report } = createChecker();

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

/**
 * Un servidor que se comporta como GitHub Pages: sirve los archivos que
 * existen y devuelve 404 para los que no. SIN red de seguridad: si la
 * aplicación pide algo que no está, se tiene que ver.
 *
 * «prefijo» imita la carpeta del repositorio, para poder probar también
 * la publicación anterior.
 */
function servir(prefijo = '') {
  return createServer(async (pet, res) => {
    let ruta = decodeURIComponent(new URL(pet.url, 'http://x').pathname);
    if (prefijo) {
      if (!ruta.startsWith(prefijo)) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('404 · fuera de la carpeta publicada');
        return;
      }
      ruta = ruta.slice(prefijo.length - 1);
    }
    const archivo = join(DIST, normalize(ruta.endsWith('/') ? `${ruta}index.html` : ruta));
    try {
      const cuerpo = await readFile(archivo);
      res.writeHead(200, { 'content-type': TIPOS[extname(archivo)] ?? 'application/octet-stream' });
      res.end(cuerpo);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('404');
    }
  });
}

/** Construye como el workflow y abre la aplicación donde se le diga. */
async function probar(navegador, { etiqueta, basePath, prefijo, direccion }) {
  console.log(`\n   ── ${etiqueta} ──`);

  const entorno = basePath === null
    // Sin la variable: es lo que hace el workflow por omisión ahora.
    ? Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'VITE_BASE_PATH'))
    : { ...process.env, VITE_BASE_PATH: basePath };

  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], {
    cwd: RAIZ,
    stdio: 'ignore',
    env: entorno,
  });

  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
    cwd: RAIZ,
    stdio: 'ignore',
    env: entorno,
  });


  const servidor = servir(prefijo);
  await new Promise((r) => servidor.listen(PUERTO, r));

  const pagina = await navegador.newPage();
  const fallos = [];
  const erroresJs = [];
  pagina.on('response', (r) => {
    if (r.status() >= 400) fallos.push({ estado: r.status(), ruta: new URL(r.url()).pathname });
  });
  pagina.on('requestfailed', (r) => {
    // Un aborto lo provoca el CLIENTE (la página se cierra con una
    // tipografía aún en vuelo, por ejemplo). No es que el servidor no
    // tenga el archivo, así que no cuenta como fallo de publicación.
    if (r.failure()?.errorText?.includes('ABORTED')) return;
    fallos.push({ estado: 0, ruta: new URL(r.url()).pathname });
  });
  pagina.on('pageerror', (e) => erroresJs.push(String(e)));

  await pagina.goto(`http://localhost:${PUERTO}${direccion}`, { waitUntil: 'networkidle' });
  // Se espera a que las tipografías terminen: si no, se cierran a medias
  // y aparecen como peticiones abortadas.
  await pagina.evaluate(() => document.fonts.ready).catch(() => undefined);
  await pagina.waitForTimeout(1200);

  const pintado = await pagina.evaluate(() => ({
    hijos: document.getElementById('root')?.children.length ?? -1,
    alto: document.body.scrollHeight,
  }));
  const texto = (await pagina.locator('body').innerText()).trim();

  // LO QUE DE VERDAD ROMPÍA LA PUBLICACIÓN: los archivos que genera el
  // build (JavaScript, estilos, tipografías) y la página.
  const delBuild = fallos.filter((f) => /\/assets\/|\.js$|\.css$|\.woff2?$|\.webmanifest$/
    .test(f.ruta) || f.ruta.endsWith('/') || f.ruta.endsWith('.html'));
  // Y aparte, lo que falta por otro motivo. Se nombra, no se esconde.
  const otros = fallos.filter((f) => !delBuild.includes(f));
  const texto404 = (lista) => lista.map((f) => `${f.estado || 'sin respuesta'} ${f.ruta}`).join(' · ');

  check(`${etiqueta} · el JavaScript, los estilos y las tipografías NO dan 404`,
    delBuild.length === 0, texto404(delBuild));

  // Los dos archivos del logo no están en el repositorio: nunca se
  // añadieron. Da 404 igual en las dos direcciones, así que NO es un
  // problema de rutas; se comprueba aquí para que quede a la vista y
  // para que, si algún día aparece otro 404 distinto, salte.
  // La ruta se compara SIN la carpeta del repositorio, para que la
  // comprobación valga igual en las dos direcciones.
  const sinPrefijo = (ruta) => (prefijo && ruta.startsWith(prefijo)
    ? ruta.slice(prefijo.length - 1) : ruta);
  const esperados = otros.every(
    (f) => /^\/brand\/logo-(blanco|azul)\.png$/.test(sinPrefijo(f.ruta)));
  check(`${etiqueta} · y lo único que falta son los logos, que no están en el repositorio`,
    esperados, texto404(otros));
  check(`${etiqueta} · sin errores de JavaScript`,
    erroresJs.length === 0, erroresJs.join(' · '));
  check(`${etiqueta} · la interfaz se pinta, no se queda en blanco`,
    pintado.hijos > 0 && pintado.alto > 200,
    `${pintado.hijos} elemento(s) en #root, ${pintado.alto}px de alto`);
  check(`${etiqueta} · y se lee el nombre de la aplicación`,
    texto.toUpperCase().includes('METALPLAFER'), texto.slice(0, 100));

  await pagina.screenshot({
    path: join(RAIZ, 'tests/capturas', `publicacion-${prefijo ? 'carpeta' : 'raiz'}.png`),
  });
  await pagina.close();
  await new Promise((r) => servidor.close(r));
}

console.log('   Construyendo la aplicación y sirviéndola como lo hará el dominio…');
const navegador = await launchBrowser();

try {
  // 1) EL CASO DEL FALLO: dominio propio, la aplicación en la raíz.
  //    Es lo que hace el workflow ahora, sin definir la variable.
  await probar(navegador, {
    etiqueta: 'Dominio propio (raíz)',
    basePath: null,
    prefijo: '',
    direccion: '/',
  });

  // 2) LA PUBLICACIÓN ANTERIOR: dentro de la carpeta del repositorio.
  //    Tiene que seguir funcionando definiendo la variable, que es la
  //    forma de volver atrás sin tocar código.
  await probar(navegador, {
    etiqueta: 'Dirección de GitHub (carpeta)',
    basePath: '/metalplafer360/',
    prefijo: '/metalplafer360/',
    direccion: '/metalplafer360/',
  });
} finally {
  await navegador.close();
}

// Se deja construido lo que se publica de verdad: la raíz.

const entorno = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => k !== 'VITE_BASE_PATH')
);

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], {
  cwd: RAIZ,
  stdio: 'ignore',
  env: entorno,
});

execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  cwd: RAIZ,
  stdio: 'ignore',
  env: entorno,
});


process.exit(report() ? 1 : 0);
