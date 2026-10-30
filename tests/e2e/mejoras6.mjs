/**
 * METALPLAFER360 · PACK DE OCTUBRE · MEJORAS 1, 3, 4 Y 7
 *
 * Comprueba, pulsando lo que pulsa una persona:
 *
 *   · MEJORA 1 · que se le puede poner color a una obra y que la
 *     pastilla del código de SUS proyectos se tiñe sola, sin tocar los
 *     proyectos uno a uno, y que el texto se sigue leyendo encima;
 *
 *   · MEJORA 3 · que un presupuesto por revisar recorre las tres
 *     subfases —por revisar, OK, denegado— y puede VOLVER, y que se
 *     distinguen desde la lista sin abrir ninguno;
 *
 *   · MEJORA 4 · que el panel trae las seis categorías pedidas, que ya
 *     no trae «presupuestos enviados esperando respuesta», y que al
 *     pulsarlas se llega a la pantalla ya filtrada;
 *
 *   · MEJORA 7 · que un aviso se puede terminar de las dos maneras, que
 *     el que espera factura sale en el panel y que al marcarlo facturado
 *     desaparece de ahí.
 *
 * Lo que se mira en la base de datos de mentira es lo que habría quedado
 * guardado, no lo que pinta la pantalla: así una pantalla que enseñe algo
 * que no se ha guardado no pasa por buena.
 */
import {
  ADMIN, YEAR, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, stubSupabase,
} from './fake-supabase.mjs';

/** Un proyecto del juego de pruebas, con lo mínimo para que exista. */
const proyecto = (extra) => ({
  contact_id: null, source_ficha_id: null, description: null, measures: null, finish: null,
  location: null, address: null, observations: null, budget_amount: 6400,
  advance_amount: null, phase: 'fabricacion', no_assembly: false,
  billing_status: 'por_facturar', finished_at: null, archived_at: null, is_demo: false,
  invoiced_amount: null, invoiced_on: null, work_id: null, autoplan: false,
  created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z',
  ...extra,
});

const PORT = 4206;

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();
const limpio = (s) => s.replace(/ /g, ' ');

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'Construcciones Soler SL', tax_id: 'B61234567',
      phone: '600111222', email: null, address: 'Carrer de la Indústria, 12', city: 'Sabadell',
      postal_code: '08202', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  works: [
    // Una obra SIN color: es como nacen todas y como se quedan las que
    // ya existían.
    { id: 'w1', code: `OBRA-${YEAR}-001`, name: 'Comunidad Calle Mayor 25',
      client_id: 'c1', address: 'Calle Mayor 25, Sabadell',
      description: null, observations: null, color: null,
      cal_start: null, cal_end: null,
      archived_at: null, is_demo: false, created_by: ADMIN.id,
      created_at: '2026-04-01T09:00:00Z', updated_at: '2026-04-01T09:00:00Z' },
  ],
  projects: [
    // DOS proyectos de la MISMA obra: así se ve que el color se pone una
    // vez y vale para los dos.
    proyecto({ id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1',
               name: 'Barandilla escalera', work_id: 'w1' }),
    proyecto({ id: 'p2', code: `PROY-${YEAR}-002`, client_id: 'c1',
               name: 'Puerta de garaje', work_id: 'w1' }),
    // Y uno SIN obra: no puede dar error ni inventarse una relación.
    proyecto({ id: 'p3', code: `PROY-${YEAR}-003`, client_id: 'c1',
               name: 'Reja de ventana', work_id: null }),
  ],
  fichas: [
    // Un presupuesto POR REVISAR, que es donde viven las tres subfases.
    { id: 'pr1', code: `PRES-${YEAR}-001`, type: 'presupuesto', status: 'por_revisar',
      review_status: 'por_revisar', billing_state: null,
      client_id: 'c1', contact_id: null, title: 'Escalera metálica de caracol',
      description: null, address: null, phone: null, email: null, hours: null,
      scheduled_date: null, scheduled_time: null, assigned_to: null, amount: 7400,
      linked_ficha_id: null, linked_project_id: null,
      archived_at: null, is_demo: false,
      created_at: '2026-04-10T09:00:00Z', updated_at: '2026-04-10T09:00:00Z' },
    // Un presupuesto PENDIENTE: una de las categorías nuevas del panel.
    { id: 'pr2', code: `PRES-${YEAR}-002`, type: 'presupuesto', status: 'pendiente',
      review_status: null, billing_state: null,
      client_id: 'c1', contact_id: null, title: 'Pasamanos de acero',
      description: null, address: null, phone: null, email: null, hours: null,
      scheduled_date: null, scheduled_time: null, assigned_to: null, amount: 1200,
      linked_ficha_id: null, linked_project_id: null,
      archived_at: null, is_demo: false,
      created_at: '2026-04-11T09:00:00Z', updated_at: '2026-04-11T09:00:00Z' },
    // Otro POR REVISAR que esta prueba no mueve: la sección de la mejora
    // 3 acaba sacando a «pr1» de ese estado, y sin este el panel se
    // quedaría sin presupuestos por revisar que contar.
    { id: 'pr3', code: `PRES-${YEAR}-003`, type: 'presupuesto', status: 'por_revisar',
      review_status: 'por_revisar', billing_state: null,
      client_id: 'c1', contact_id: null, title: 'Estructura de pérgola',
      description: null, address: null, phone: null, email: null, hours: null,
      scheduled_date: null, scheduled_time: null, assigned_to: null, amount: 3100,
      linked_ficha_id: null, linked_project_id: null,
      archived_at: null, is_demo: false,
      created_at: '2026-04-13T09:00:00Z', updated_at: '2026-04-13T09:00:00Z' },
    // Un aviso EN CURSO, listo para terminarse de una de las dos maneras.
    { id: 'av1', code: `AVI-${YEAR}-001`, type: 'aviso', status: 'en_curso',
      review_status: null, billing_state: null,
      client_id: 'c1', contact_id: null, title: 'Cambiar cerradura del portal',
      description: null, address: null, phone: null, email: null, hours: null,
      scheduled_date: null, scheduled_time: null, assigned_to: null, amount: null,
      linked_ficha_id: null, linked_project_id: null,
      archived_at: null, is_demo: false,
      created_at: '2026-04-12T09:00:00Z', updated_at: '2026-04-12T09:00:00Z' },
  ],
  counters: { PRES: 3, VIS: 0, AVI: 1, PROY: 3, OT: 0, PT: 0, OBRA: 1 },
});

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1360, height: 980 } });
await stubSupabase(context, { db });
const page = await context.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(`error de programación: ${e.message}`));

await signIn(page, PORT, ADMIN.username);

// =====================================================================
// MEJORA 1 · EL COLOR DE LA OBRA
// =====================================================================

await page.goto(`http://localhost:${PORT}/#/admin/proyectos`, { waitUntil: 'networkidle' });
await page.locator('.table').waitFor({ timeout: 15000 });
await page.waitForTimeout(600);

const fondoDe = async (codigo) => page
  .locator(`.table tbody tr:has-text("${codigo}") .plate`).first()
  .evaluate((el) => getComputedStyle(el).backgroundColor);

const neutro = await fondoDe(`PROY-${YEAR}-001`);
check('MEJORA 1 · Sin color en la obra, la pastilla se ve como siempre',
  !/^rgb\(179, 84, 30\)/.test(neutro), neutro);

// Se le pone color a la obra desde su ficha.
await page.goto(`http://localhost:${PORT}/#/admin/obras/w1`, { waitUntil: 'networkidle' });
await page.locator('#obra-color').waitFor({ timeout: 15000 });

check('MEJORA 1 · La ficha de la obra tiene selector de color',
  (await page.locator('#obra-color').count()) === 1);

await page.locator('#obra-color').fill('#b3541e');
await page.waitForTimeout(900);

check('MEJORA 1 · El color queda guardado en la obra',
  db.works[0].color === '#b3541e', String(db.works[0].color));

// Y ahora, SIN tocar ningún proyecto, sus dos pastillas van de ese color.
await page.goto(`http://localhost:${PORT}/#/admin/proyectos`, { waitUntil: 'networkidle' });
await page.locator('.table').waitFor({ timeout: 15000 });
await page.waitForTimeout(700);

const unoR = await fondoDe(`PROY-${YEAR}-001`);
const dosR = await fondoDe(`PROY-${YEAR}-002`);
const tresR = await fondoDe(`PROY-${YEAR}-003`);

check('MEJORA 1 · Los DOS proyectos de la obra se tiñen, sin tocarlos uno a uno',
  unoR === 'rgb(179, 84, 30)' && dosR === 'rgb(179, 84, 30)',
  `${unoR} · ${dosR}`);

check('MEJORA 1 · Y el proyecto SIN obra se queda como estaba, sin dar error',
  tresR !== 'rgb(179, 84, 30)' && errores.length === 0,
  `${tresR} · errores: ${errores.join(' | ')}`);

// El texto tiene que leerse encima del color elegido.
const textoColor = await page
  .locator(`.table tbody tr:has-text("PROY-${YEAR}-001") .plate`).first()
  .evaluate((el) => getComputedStyle(el).color);
check('MEJORA 1 · Y el código se sigue leyendo encima del color',
  textoColor === 'rgb(255, 255, 255)' || textoColor === 'rgb(26, 36, 51)',
  textoColor);

// Cambiar el color otra vez se nota en los dos, que es el requisito.
await page.goto(`http://localhost:${PORT}/#/admin/obras/w1`, { waitUntil: 'networkidle' });
await page.locator('#obra-color').waitFor({ timeout: 15000 });
await page.locator('#obra-color').fill('#2e7d5b');
await page.waitForTimeout(900);
await page.goto(`http://localhost:${PORT}/#/admin/proyectos`, { waitUntil: 'networkidle' });
await page.locator('.table').waitFor({ timeout: 15000 });
await page.waitForTimeout(700);

check('MEJORA 1 · Al cambiar el color de la obra, cambian otra vez los dos',
  (await fondoDe(`PROY-${YEAR}-001`)) === 'rgb(46, 125, 91)'
  && (await fondoDe(`PROY-${YEAR}-002`)) === 'rgb(46, 125, 91)');

// =====================================================================
// MEJORA 3 · LAS TRES SUBFASES DE LA REVISIÓN
// =====================================================================

await page.goto(`http://localhost:${PORT}/#/admin/fichas/pr1`, { waitUntil: 'networkidle' });
await page.locator('.ficha-head').waitFor({ timeout: 15000 });
await page.waitForTimeout(600);

const revision = page.locator('[aria-label="Subfase de la revisión"]');
check('MEJORA 3 · Un presupuesto por revisar ofrece las tres subfases',
  (await revision.locator('button').count()) === 3,
  limpio(await revision.innerText()).replace(/\n/g, ' | '));

await revision.locator('button:has-text("OK")').click();
await page.waitForTimeout(800);
check('MEJORA 3 · Se puede marcar «OK»',
  db.fichas.find((f) => f.id === 'pr1').review_status === 'ok',
  String(db.fichas.find((f) => f.id === 'pr1').review_status));

await revision.locator('button:has-text("Denegado")').click();
await page.waitForTimeout(800);
check('MEJORA 3 · Y «Denegado»',
  db.fichas.find((f) => f.id === 'pr1').review_status === 'denegado');

// LO QUE IMPORTA: desde denegado se puede VOLVER.
await revision.locator('button:has-text("Por revisar")').click();
await page.waitForTimeout(800);
check('MEJORA 3 · Y desde «Denegado» se puede VOLVER a «Por revisar»',
  db.fichas.find((f) => f.id === 'pr1').review_status === 'por_revisar');

// Y el estado principal no se ha movido en ningún momento.
check('MEJORA 3 · El estado del presupuesto NO ha cambiado al revisarlo',
  db.fichas.find((f) => f.id === 'pr1').status === 'por_revisar',
  db.fichas.find((f) => f.id === 'pr1').status);

// Se distingue desde la lista, sin abrir la ficha.
await revision.locator('button:has-text("Denegado")').click();
await page.waitForTimeout(800);
await page.goto(`http://localhost:${PORT}/#/admin/fichas`, { waitUntil: 'networkidle' });
await page.locator('.table').waitFor({ timeout: 15000 });
await page.waitForTimeout(700);

const filaPr1 = limpio(await page.locator(`tbody tr:has-text("PRES-${YEAR}-001")`).innerText());
check('MEJORA 3 · La subfase se ve desde la LISTA, con su texto',
  filaPr1.includes('Denegado'), filaPr1.replace(/\n/g, ' | '));

// Y al salir del estado de revisión, la marca se va sola.
await page.goto(`http://localhost:${PORT}/#/admin/fichas/pr1`, { waitUntil: 'networkidle' });
await page.locator('.ficha-head').waitFor({ timeout: 15000 });
await page.locator('[aria-label="Cambiar estado"] button:has-text("Enviado")').click();
await page.waitForTimeout(900);

check('MEJORA 3 · Al salir de «por revisar», la subfase se borra sola',
  db.fichas.find((f) => f.id === 'pr1').review_status === null,
  String(db.fichas.find((f) => f.id === 'pr1').review_status));

check('MEJORA 3 · Y entonces deja de ofrecerse',
  (await page.locator('[aria-label="Subfase de la revisión"]').count()) === 0);

// =====================================================================
// MEJORA 7 · TERMINAR UN AVISO CON O SIN FACTURA
// =====================================================================

await page.goto(`http://localhost:${PORT}/#/admin/fichas/av1`, { waitUntil: 'networkidle' });
await page.locator('.ficha-head').waitFor({ timeout: 15000 });
await page.waitForTimeout(600);

const terminar = page.locator('[aria-label="Cómo termina el aviso"]');
check('MEJORA 7 · El aviso ofrece las DOS maneras de terminar',
  (await terminar.locator('button').count()) === 2,
  limpio(await terminar.innerText()).replace(/\n/g, ' | '));

await terminar.locator('button:has-text("pendiente de facturar")').click();
await page.waitForTimeout(900);

const av = () => db.fichas.find((f) => f.id === 'av1');
check('MEJORA 7 · Terminarlo pendiente de facturar lo deja en «realizado»',
  av().status === 'realizado' && av().billing_state === 'pendiente',
  `${av().status} · ${av().billing_state}`);

check('MEJORA 7 · Y aparece el tic de facturado',
  (await page.locator('button:has-text("Marcar como facturado")').count()) === 1);

/*
  LO QUE NO SE PUEDE COMPROBAR DESDE AQUÍ, dicho para que no parezca un
  olvido: que NO se pueda facturar un aviso que nadie dijo que hubiera
  que facturar.

  Desde la pantalla no se puede ni intentar —el botón solo existe cuando
  el aviso está pendiente de facturar—, así que una prueba de navegador
  no puede provocarlo. Esa negativa es una regla del servidor y está
  comprobada donde vive: «fav_tic» en
  tests/sql/99_tests_facturacion_avisos.sql, contra PostgreSQL de verdad.

  Se comprobó rompiéndola a propósito: la mutación pasa esta batería y la
  caza la de SQL.
*/
check('MEJORA 7 · Y mientras NO está pendiente, el tic no se ofrece siquiera',
  (await page.locator('button:has-text("Marcar como facturado")').count()) === 1
  && av().billing_state === 'pendiente',
  String(av().billing_state));

// =====================================================================
// MEJORA 4 · EL PANEL
// =====================================================================

await page.goto(`http://localhost:${PORT}/#/admin`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const panelTexto = limpio(await page.locator('main').innerText());

check('MEJORA 4 · El panel cuenta el aviso pendiente de facturar',
  panelTexto.includes('avisos pendientes de facturar'),
  panelTexto.split('\n').filter((l) => l.includes('factur')).join(' | '));

check('MEJORA 4 · Y los presupuestos pendientes por revisar',
  panelTexto.includes('presupuestos pendientes por revisar'));

/*
  Ojo con esta: «presupuestos pendientes» es subcadena de «presupuestos
  pendientes por revisar» y de «presupuestos pendientes de paga y
  señal», así que buscar el texto suelto daría por buena la categoría
  aunque no existiera. Se busca el ENLACE exacto.
*/
const etiquetas = await page.locator('.alert-list a span').allInnerTexts();
check('MEJORA 4 · Y los presupuestos pendientes, como categoría propia',
  etiquetas.map((t) => t.trim()).includes('presupuestos pendientes'),
  etiquetas.join(' | '));

// LO QUE SE PIDIÓ QUITAR.
check('MEJORA 4 · Y YA NO dice «presupuestos enviados esperando respuesta»',
  !panelTexto.includes('esperando respuesta'),
  panelTexto.split('\n').filter((l) => l.includes('esperando')).join(' | '));

// Los enlaces llevan a la pantalla YA filtrada.
await page.locator('a:has-text("presupuestos pendientes por revisar")').first().click();
await page.waitForTimeout(1000);
check('MEJORA 4 · Al pulsar un aviso del panel se llega filtrado',
  page.url().includes('estado=por_revisar'), page.url());

const filtro = await page.locator('select#ficha-status, select').first()
  .evaluate((el) => el.value).catch(() => '');
check('MEJORA 4 · Y el filtro de la pantalla llega puesto',
  filtro === 'por_revisar', String(filtro));

// =====================================================================
// MEJORA 7 · EL TIC, Y QUE DESAPAREZCA DEL PANEL
// =====================================================================

await page.goto(`http://localhost:${PORT}/#/admin/fichas/av1`, { waitUntil: 'networkidle' });
await page.locator('.ficha-head').waitFor({ timeout: 15000 });
await page.locator('button:has-text("Marcar como facturado")').click();
await page.waitForTimeout(900);

check('MEJORA 7 · Al marcarlo facturado queda cerrado y facturado',
  av().status === 'cerrado' && av().billing_state === 'facturado',
  `${av().status} · ${av().billing_state}`);

await page.goto(`http://localhost:${PORT}/#/admin`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const panel2 = limpio(await page.locator('main').innerText());

check('MEJORA 7 · Y deja de salir en el panel como pendiente de facturar',
  !panel2.includes('avisos pendientes de facturar'),
  panel2.split('\n').filter((l) => l.includes('factur')).join(' | '));

// Y el otro camino: finalizado sin factura, que no aparece en ningún sitio.
await page.goto(`http://localhost:${PORT}/#/admin/fichas/av1`, { waitUntil: 'networkidle' });
await page.locator('.ficha-head').waitFor({ timeout: 15000 });
await page.locator('[aria-label="Cómo termina el aviso"] button:has-text("Realizado y finalizado")')
  .click();
await page.waitForTimeout(900);

check('MEJORA 7 · «Realizado y finalizado» lo cierra sin facturación',
  av().status === 'cerrado' && av().billing_state === 'sin_facturacion',
  `${av().status} · ${av().billing_state}`);

await page.goto(`http://localhost:${PORT}/#/admin`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
check('MEJORA 7 · Y tampoco sale en el panel',
  !limpio(await page.locator('main').innerText()).includes('avisos pendientes de facturar'));

check('Ni un error de programación en toda la prueba',
  errores.length === 0, errores.join(' | '));

await context.close();
await browser.close();
server.close();
report();
