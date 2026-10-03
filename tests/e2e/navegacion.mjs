/**
 * METALPLAFER360 · Comprobación del acceso, los roles y la navegación.
 *
 *   npm run test:nav
 *
 * Usa el Supabase de mentira de fake-supabase.mjs para recorrer la
 * aplicación como si hubiéramos entrado: comprueba que el administrador
 * ve su zona, el trabajador la suya, la sesión se mantiene y la
 * navegación funciona en ordenador y en móvil.
 *
 * Los PERMISOS de verdad se prueban contra PostgreSQL en tests/sql.
 */
import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN, WORKER, addDays, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, startOfMonth, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4179;

buildApp();

/**
 * Para medir la cabecera del menú lateral hace falta que haya un archivo
 * de logo. Los logos oficiales de Metalplafer NO están en el repositorio
 * (los copia la empresa en public/brand/), así que si no están se deja
 * un rectángulo liso de 600×120 en la copia construida, solo para poder
 * medir. No es un logo, no se parece a ninguno y nunca sale de aquí: si
 * el archivo oficial está puesto, se mide ese y no se toca nada.
 */
function rectanguloDePrueba(ruta, ancho, alto) {
  if (existsSync(ruta)) return 'el archivo oficial';
  const crc = (buf) => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (tipo, datos) => {
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const suma = Buffer.alloc(4); suma.writeUInt32BE(crc(cuerpo));
    return Buffer.concat([largo, cuerpo, suma]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits por canal, RGBA
  const filas = Buffer.alloc(alto * (ancho * 4 + 1));
  for (let y = 0; y < alto; y++) {
    const base = y * (ancho * 4 + 1);
    for (let x = 0; x < ancho; x++) {
      const p = base + 1 + x * 4;
      filas[p] = 255; filas[p + 1] = 255; filas[p + 2] = 255; filas[p + 3] = 255;
    }
  }
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(filas)), chunk('IEND', Buffer.alloc(0)),
  ]));
  return 'un rectángulo de prueba';
}

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUE_LOGO = rectanguloDePrueba(join(RAIZ, 'dist', 'brand', 'logo-blanco.png'), 600, 120);
const server = await serveApp(PORT);
const { check, report } = createChecker();

// El panel de inicio mira «Este mes», así que los datos de prueba se
// anclan al mes en curso. Con fechas fijas, la prueba fallaba los primeros
// días de cada mes porque los proyectos caían en el mes anterior.
const HOY = today();
const MES = startOfMonth(HOY);
/** Un día de este mes, sin salirse por abajo ni pasar de hoy. */
const esteMes = (dia) => {
  const d = addDays(MES, dia - 1);
  return d > HOY ? HOY : d;
};

// Datos de partida: 1 cliente, 1 presupuesto sin asignar, 1 aviso y 2 proyectos en curso.
const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: null, address: 'Carrer de la Indústria, 12', city: 'Sabadell',
      postal_code: '08202', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: `${esteMes(1)}T10:00:00Z`, updated_at: `${esteMes(1)}T10:00:00Z` },
  ],
  fichas: [
    { id: 'f1', code: 'PRES-2026-001', type: 'presupuesto', status: 'por_asignar', client_id: 'c1',
      contact_id: null, title: 'Barandilla', description: null, address: null, phone: null,
      scheduled_date: null, scheduled_time: null, assigned_to: null, amount: 6400,
      archived_at: null, is_demo: false, created_at: `${esteMes(2)}T10:00:00Z`, updated_at: `${esteMes(2)}T10:00:00Z` },
    { id: 'f2', code: 'AVI-2026-001', type: 'aviso', status: 'asignado', client_id: 'c1',
      contact_id: null, title: 'Puerta de garaje', description: null, address: null, phone: '600111222',
      scheduled_date: null, scheduled_time: null, assigned_to: WORKER.id, amount: null,
      archived_at: null, is_demo: false, created_at: `${esteMes(2)}T11:00:00Z`, updated_at: `${esteMes(2)}T11:00:00Z` },
  ],
  projects: [
    { id: 'p1', code: 'PROY-2026-001', client_id: 'c1', contact_id: null, source_ficha_id: null,
      name: 'Barandilla escalera', description: null, measures: null, finish: null, location: null,
      address: null, observations: null, budget_amount: 6400, advance_amount: null,
      budget_hours_fab: 0, budget_hours_mont: 0, phase: 'preparacion', no_assembly: false,
      billing_status: 'por_facturar', finished_at: null, archived_at: null, is_demo: false,
      created_at: `${esteMes(2)}T12:00:00Z`, updated_at: `${esteMes(2)}T12:00:00Z` },
    { id: 'p2', code: 'PROY-2026-002', client_id: 'c1', contact_id: null, source_ficha_id: null,
      name: 'Rejas ventanas', description: null, measures: null, finish: null, location: null,
      address: null, observations: null, budget_amount: 2400, advance_amount: null,
      budget_hours_fab: 0, budget_hours_mont: 0, phase: 'fabricacion', no_assembly: false,
      billing_status: 'por_facturar', finished_at: null, archived_at: null, is_demo: false,
      created_at: `${esteMes(2)}T13:00:00Z`, updated_at: `${esteMes(2)}T13:00:00Z` },
    { id: 'p3', code: 'PROY-2026-003', client_id: 'c1', contact_id: null, source_ficha_id: null,
      name: 'Puerta corredera', description: null, measures: null, finish: null, location: null,
      address: null, observations: null, budget_amount: 9800, advance_amount: null,
      budget_hours_fab: 0, budget_hours_mont: 0, phase: 'finalizado', no_assembly: false,
      billing_status: 'cobrado', finished_at: `${esteMes(3)}T10:00:00Z`, archived_at: null, is_demo: false,
      created_at: `${esteMes(1)}T10:00:00Z`, updated_at: `${esteMes(3)}T10:00:00Z` },
  ],
  audit_log: [
    { id: 2, occurred_at: `${esteMes(2)}T07:30:00Z`, actor_id: ADMIN.id, actor_name: 'Salvi Plaza',
      action: 'insert', entity_type: 'fichas', entity_id: null, entity_code: 'PRES-2026-001',
      summary: 'Salvi Plaza creó la ficha de presupuesto PRES-2026-001', details: {} },
    { id: 1, occurred_at: `${esteMes(1)}T10:00:00Z`, actor_id: ADMIN.id, actor_name: 'Salvi Plaza',
      action: 'insert', entity_type: 'clients', entity_id: null, entity_code: 'García Construcciones SL',
      summary: 'Salvi Plaza creó el cliente García Construcciones SL', details: {} },
  ],
});

const browser = await launchBrowser();

try {
  // =================== ADMINISTRADOR ===================
  let currentUser = ADMIN;
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' });
  await stubSupabase(adminCtx, { db, getUser: () => currentUser });
  const page = await adminCtx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await signIn(page, PORT, 'salvi');
  check('El administrador entra y llega a su panel', page.url().includes('#/admin'));
  check('Se le saluda por su nombre',
    (await page.locator('h1').first().innerText()).includes('Salvi'));
  check('El menú de administración tiene las 12 secciones',
    (await page.locator('.sidebar nav a').count()) === 12);

  // ---------------------------------------------------------------------
  // La cabecera del menú lateral: [icono 360] [logo Metalplafer].
  //
  // Dos ARCHIVOS, uno al lado del otro. Antes se componía a mano: un
  // «360» dibujado con SVG, el nombre en texto pequeño y otro «360»
  // amarillo debajo. Estas comprobaciones impiden que vuelva.
  // ---------------------------------------------------------------------
  const cabecera = page.locator('.sidebar-brand');
  const icono = cabecera.locator('img').first();
  const marca = cabecera.locator('img').nth(1);

  check(`La cabecera son dos imágenes: el icono y el logo (midiendo ${QUE_LOGO})`,
    (await cabecera.locator('img').count()) === 2
    && (await icono.getAttribute('src')).endsWith('icons/icon-192.png')
    && (await marca.getAttribute('src')).endsWith('brand/logo-blanco.png'),
    await cabecera.innerHTML());

  check('El icono del 360 va delante del logo y mide entre 36 y 40 px',
    await cabecera.evaluate((el) => {
      const [i, l] = [...el.querySelectorAll('img')];
      const ri = i.getBoundingClientRect(); const rl = l.getBoundingClientRect();
      return ri.height >= 36 && ri.height <= 40 && ri.width === ri.height && ri.left < rl.left;
    }));

  check('El icono y el logo van en la misma línea, centrados entre sí',
    await cabecera.evaluate((el) => {
      const [i, l] = [...el.querySelectorAll('img')];
      const ri = i.getBoundingClientRect(); const rl = l.getBoundingClientRect();
      return Math.abs((ri.top + ri.height / 2) - (rl.top + rl.height / 2)) < 2;
    }));

  // Presencia del logo: es el elemento principal, así que ocupa todo el
  // ancho que le queda o llega a su altura máxima. Se comprueba así, y no
  // con una medida fija, porque depende de la forma del archivo oficial,
  // que puede ser alargado o cuadrado.
  check('El logo sigue siendo el elemento principal',
    await cabecera.evaluate((el) => {
      const [i, l] = [...el.querySelectorAll('img')];
      const cs = getComputedStyle(el);
      const util = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const libre = util - i.getBoundingClientRect().width - 10;
      const r = l.getBoundingClientRect();
      return r.width > i.getBoundingClientRect().width
        && (r.width >= libre * 0.9 || r.height >= 44);
    }));

  check('La cabecera no lleva ningún texto suelto, ni un «360»',
    (await cabecera.innerText()).trim() === '',
    await cabecera.innerText());

  // Los únicos SVG que puede haber aquí son los del icono del botón de
  // cerrar el menú. Ninguno puede formar parte de la marca.
  check('La cabecera no dibuja ningún logo con SVG',
    await page.locator('.sidebar-brand').evaluate((el) => [...el.querySelectorAll('svg')]
      .every((svg) => svg.closest('button') !== null)));

  check('Nada se sale de la cabecera, y el logo no se deforma',
    await cabecera.evaluate((el) => {
      const cs = getComputedStyle(el);
      const borde = el.getBoundingClientRect().right - parseFloat(cs.paddingRight);
      const logo = el.querySelectorAll('img')[1];
      return [...el.querySelectorAll('img')]
        .every((img) => img.getBoundingClientRect().right <= borde + 1)
        && getComputedStyle(logo).objectFit === 'contain';
    }));

  // En tablet y móvil aparece el botón de cerrar el menú DENTRO de esta
  // misma cabecera. Ni se solapa con la marca ni baja a otra línea.
  await page.setViewportSize({ width: 820, height: 900 });
  await page.locator('.topbar button[aria-label="Abrir menú"]').click();
  await page.waitForTimeout(350);
  check('En tablet, el botón de cerrar no se solapa con la marca ni baja de línea',
    await cabecera.evaluate((el) => {
      const [i, l] = [...el.querySelectorAll('img')];
      const b = el.querySelector('button').getBoundingClientRect();
      const rl = l.getBoundingClientRect(); const ri = i.getBoundingClientRect();
      return rl.right <= b.left + 1
        && Math.abs((ri.top + ri.height / 2) - (b.top + b.height / 2)) < 4
        && b.right <= el.getBoundingClientRect().right + 1
        && b.width >= 30;
    }), await cabecera.evaluate((el) => {
      const b = el.querySelector('button').getBoundingClientRect();
      return `botón ${Math.round(b.width)}×${Math.round(b.height)} en x=${Math.round(b.left)}`;
    }));
  await page.locator('.sidebar-brand button').click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);

  const menu = await page.locator('.sidebar nav a').allInnerTexts();
  const expected = ['Dashboard', 'Fichas', 'Proyectos', 'Órdenes de trabajo', 'Material pendiente',
    'Calendario', 'Avisos', 'Clientes', 'Trabajadores', 'Facturación', 'Informes', 'Configuración'];
  check('Las secciones son exactamente las previstas',
    expected.every((label, i) => menu[i].includes(label)), menu.join(' | '));

  // El panel de inicio reúne producción, proyectos, órdenes, material,
  // alertas y economía (se prueba a fondo en fase6.mjs).
  const proyectos = await page.locator('.panel:has-text("Proyectos") .figure b').allInnerTexts();
  check('El panel cuenta los proyectos activos y los finalizados',
    proyectos[0] === '2' && proyectos[2] === '1', proyectos.join(' | '));

  const porFase = await page.locator('.bar-list .bar-value').allInnerTexts();
  check('Y reparte los proyectos por fase',
    porFase.slice(0, 4).join(' ') === '1 1 0 0', porFase.join(' '));

  const alertas = await page.locator('.alert-list').innerText();
  check('Avisa de las fichas que están sin asignar',
    alertas.includes('fichas por asignar'), alertas.replace(/\n/g, ' · '));

  const panel = await page.locator('main').innerText();
  check('Reúne en un mismo sitio producción, órdenes, material y economía',
    ['Producción', 'Órdenes de trabajo', 'Material', 'Economía']
      .every((t) => panel.includes(t)));

  // Navegación entre secciones
  await page.locator('.sidebar nav a:has-text("Proyectos")').click();
  await page.waitForTimeout(500);
  check('La navegación lleva a la sección de Proyectos',
    page.url().includes('#/admin/proyectos') &&
    (await page.locator('h1').first().innerText()) === 'Proyectos');
  check('La sección activa se marca en el menú',
    (await page.locator('.sidebar nav a.active').innerText()).includes('Proyectos'));

  await page.locator('.sidebar nav a:has-text("Material pendiente")').click();
  await page.waitForTimeout(400);
  check('El material pendiente ya está construido',
    page.url().includes('#/admin/material')
    && (await page.locator('h1').first().innerText()) === 'Material pendiente');

  await page.locator('.sidebar nav a:has-text("Calendario")').click();
  await page.waitForTimeout(400);
  check('Se puede cambiar de sección otra vez', page.url().includes('#/admin/calendario'));

  // Ya no queda ningún apartado por construir: se entra en todos y se
  // comprueba que ninguno enseña el cartel de «en construcción».
  const sinConstruir = [];
  for (const etiqueta of expected) {
    await page.locator(`.sidebar nav a:has-text("${etiqueta}")`).first().click();
    await page.waitForTimeout(700);
    if (await page.locator('.pending-module').count() > 0
        || await page.locator('h1').first().count() === 0) {
      sinConstruir.push(etiqueta);
    }
  }
  check('Todos los apartados del menú están construidos',
    sinConstruir.length === 0, sinConstruir.join(', '));

  await page.locator('.sidebar nav a:has-text("Dashboard")').click();
  await page.waitForTimeout(500);
  check('Se vuelve al inicio desde cualquier apartado', page.url().endsWith('#/admin'));

  // Sesión persistente
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  check('La sesión se mantiene al recargar la página', page.url().includes('#/admin'));

  // Un administrador no entra en la zona del trabajador
  await page.goto(`http://localhost:${PORT}/#/t`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  check('El administrador no entra en la zona del trabajador', page.url().includes('#/admin'));

  // Dirección inventada dentro de administración
  await page.goto(`http://localhost:${PORT}/#/admin/inventado`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  check('Una dirección que no existe vuelve al panel', page.url().endsWith('#/admin'));

  check('No hay errores de JavaScript en administración', errors.length === 0, errors[0]);

  // Cerrar sesión
  await page.locator('.sidebar-foot button:has-text("Cerrar sesión")').click();
  await page.waitForTimeout(500);
  check('Cerrar sesión devuelve a la pantalla de acceso', page.url().includes('#/login'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  check('Tras cerrar sesión ya no se puede volver atrás', page.url().includes('#/login'));

  await adminCtx.close();

  // =================== TRABAJADOR (móvil) ===================
  currentUser = WORKER;
  const workerCtx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(workerCtx, { db, getUser: () => currentUser });
  const wpage = await workerCtx.newPage();
  const werrors = [];
  wpage.on('pageerror', (e) => werrors.push(String(e)));

  await signIn(wpage, PORT, 'juan');
  check('El trabajador entra y llega a su inicio', wpage.url().includes('#/t'));
  check('No ve la zona de administración', !wpage.url().includes('#/admin'));
  check('Se le saluda por su nombre',
    (await wpage.locator('.w-greeting h1').innerText()).includes('Juan'));

  check('La barra inferior tiene las 5 secciones',
    (await wpage.locator('.w-tabbar a').count()) === 5);
  const tabs = await wpage.locator('.w-tabbar a').allInnerTexts();
  check('Las secciones del móvil son las previstas',
    ['Inicio', 'Calendario', 'Mis órdenes', 'Historial', 'Perfil']
      .every((t, i) => tabs[i].includes(t)), tabs.join(' | '));

  const tabBox = await wpage.locator('.w-tabbar a').first().boundingBox();
  check('Los botones de la barra son cómodos de pulsar con el dedo', tabBox.height >= 48,
    `${tabBox?.height}px de alto`);

  await wpage.locator('.w-tabbar a:has-text("Mis órdenes")').click();
  await wpage.waitForTimeout(350);
  check('La navegación del móvil funciona', wpage.url().includes('#/t/ordenes'));

  await wpage.locator('.w-tabbar a:has-text("Perfil")').click();
  await wpage.waitForTimeout(350);
  check('El perfil muestra los datos del trabajador',
    (await wpage.locator('.w-block').first().innerText()).includes('Juan Ortega'));
  check('El perfil permite cambiar la contraseña',
    await wpage.locator('#new-password').isVisible());

  const overflow = await wpage.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('En el móvil no hay desplazamiento horizontal', overflow <= 0, `sobran ${overflow}px`);

  // Intento de entrar en administración escribiendo la dirección a mano
  for (const route of ['#/admin', '#/admin/configuracion', '#/admin/informes']) {
    await wpage.goto(`http://localhost:${PORT}/${route}`, { waitUntil: 'networkidle' });
    await wpage.waitForTimeout(400);
    check(`Un trabajador que escribe ${route} es devuelto a su zona`, wpage.url().includes('#/t'));
  }

  check('No hay errores de JavaScript en la zona del trabajador', werrors.length === 0, werrors[0]);
  await workerCtx.close();

  // =================== CASOS DE ACCESO DENEGADO ===================
  // Cada caso usa una ventana nueva, igual que si alguien abriera la
  // aplicación por primera vez.

  // Usuario desactivado por administración
  currentUser = { ...WORKER, active: false };
  const blockedCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' });
  await stubSupabase(blockedCtx, { db, getUser: () => currentUser });
  const bpage = await blockedCtx.newPage();
  await signIn(bpage, PORT, 'juan');
  await bpage.waitForTimeout(600);
  const blocked = await bpage.locator('.alert-danger').first().innerText().catch(() => '');
  check('Un usuario desactivado no puede entrar y se le explica por qué',
    bpage.url().includes('#/login') && blocked.includes('desactivado'), blocked);
  await blockedCtx.close();

  // Contraseña incorrecta
  currentUser = null;
  const badCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-ES' });
  await stubSupabase(badCtx, { db, getUser: () => currentUser });
  const badPage = await badCtx.newPage();
  await signIn(badPage, PORT, 'juan', 'contrasena-mala');
  const badLogin = await badPage.locator('.alert-danger').first().innerText().catch(() => '');
  check('Una contraseña incorrecta se explica con claridad',
    badPage.url().includes('#/login') && badLogin.includes('Usuario o contraseña incorrectos'), badLogin);
  await badCtx.close();
} finally {
  await browser.close();
}


server.close();
process.exit(report() ? 1 : 0);
