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
import {
  ADMIN, WORKER, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, stubSupabase,
} from './fake-supabase.mjs';

const PORT = 4179;

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

// Datos de partida: 1 cliente, 1 presupuesto sin asignar, 1 aviso y 2 proyectos en curso.
const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: null, address: 'Carrer de la Indústria, 12', city: 'Sabadell',
      postal_code: '08202', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-09-16T10:00:00Z', updated_at: '2026-09-16T10:00:00Z' },
  ],
  fichas: [
    { id: 'f1', code: 'PRES-2026-001', type: 'presupuesto', status: 'por_asignar', client_id: 'c1',
      contact_id: null, title: 'Barandilla', description: null, address: null, phone: null,
      scheduled_date: null, scheduled_time: null, assigned_to: null, amount: 6400,
      archived_at: null, is_demo: false, created_at: '2026-09-17T10:00:00Z', updated_at: '2026-09-17T10:00:00Z' },
    { id: 'f2', code: 'AVI-2026-001', type: 'aviso', status: 'asignado', client_id: 'c1',
      contact_id: null, title: 'Puerta de garaje', description: null, address: null, phone: '600111222',
      scheduled_date: null, scheduled_time: null, assigned_to: WORKER.id, amount: null,
      archived_at: null, is_demo: false, created_at: '2026-09-17T11:00:00Z', updated_at: '2026-09-17T11:00:00Z' },
  ],
  projects: [
    { id: 'p1', code: 'PROY-2026-001', client_id: 'c1', contact_id: null, source_ficha_id: null,
      name: 'Barandilla escalera', description: null, measures: null, finish: null, location: null,
      address: null, observations: null, budget_amount: 6400, advance_amount: null,
      budget_hours_fab: 0, budget_hours_mont: 0, phase: 'preparacion', no_assembly: false,
      billing_status: 'por_facturar', finished_at: null, archived_at: null, is_demo: false,
      created_at: '2026-09-17T12:00:00Z', updated_at: '2026-09-17T12:00:00Z' },
    { id: 'p2', code: 'PROY-2026-002', client_id: 'c1', contact_id: null, source_ficha_id: null,
      name: 'Rejas ventanas', description: null, measures: null, finish: null, location: null,
      address: null, observations: null, budget_amount: 2400, advance_amount: null,
      budget_hours_fab: 0, budget_hours_mont: 0, phase: 'fabricacion', no_assembly: false,
      billing_status: 'por_facturar', finished_at: null, archived_at: null, is_demo: false,
      created_at: '2026-09-17T13:00:00Z', updated_at: '2026-09-17T13:00:00Z' },
    { id: 'p3', code: 'PROY-2026-003', client_id: 'c1', contact_id: null, source_ficha_id: null,
      name: 'Puerta corredera', description: null, measures: null, finish: null, location: null,
      address: null, observations: null, budget_amount: 9800, advance_amount: null,
      budget_hours_fab: 0, budget_hours_mont: 0, phase: 'finalizado', no_assembly: false,
      billing_status: 'cobrado', finished_at: '2026-09-10T10:00:00Z', archived_at: null, is_demo: false,
      created_at: '2026-08-01T10:00:00Z', updated_at: '2026-09-10T10:00:00Z' },
  ],
  audit_log: [
    { id: 2, occurred_at: '2026-09-17T07:30:00Z', actor_id: ADMIN.id, actor_name: 'Salvi Plaza',
      action: 'insert', entity_type: 'fichas', entity_id: null, entity_code: 'PRES-2026-001',
      summary: 'Salvi Plaza creó la ficha de presupuesto PRES-2026-001', details: {} },
    { id: 1, occurred_at: '2026-09-16T10:00:00Z', actor_id: ADMIN.id, actor_name: 'Salvi Plaza',
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
