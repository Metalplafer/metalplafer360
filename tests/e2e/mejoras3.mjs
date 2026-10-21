/**
 * METALPLAFER360 · ÚLTIMA CONEXIÓN, MATERIAL DE ALMACÉN Y CALENDARIO
 *
 *   npm run test:mejoras3
 *
 * Comprueba, pulsando lo que pulsa una persona:
 *
 *   · N1 · que Trabajadores tiene la columna «Última conexión», que sale
 *     la fecha de quien ha entrado, que administración también aparece y
 *     que quien no ha entrado nunca lo dice con palabras en vez de
 *     enseñar una fecha inventada;
 *
 *   · N2 · que se puede anotar material que YA tenemos en el almacén
 *     contra un proyecto, sin pedirlo a nadie y sin proveedor, y que se
 *     distingue del que hay que comprar;
 *
 *   · N3 · que el calendario arranca con fabricación y montaje, que las
 *     demás categorías son excluyentes, que un tramo de varios días es
 *     UNA pastilla continua y que al arrastrarlo conserva su duración.
 *
 * Las reglas de verdad se prueban contra PostgreSQL en
 * tests/sql/99_tests_ultima_conexion.sql, 99_tests_material_almacen.sql
 * y 99_tests_calendario.sql. Aquí se comprueba la PANTALLA.
 */
import {
  ADMIN, WORKER, YEAR, buildApp, createChecker, createDb,
  launchBrowser, serveApp, signIn, stubSupabase,
} from './fake-supabase.mjs';

const PORT = 4200;

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();
const limpio = (s) => s.replace(/ /g, ' ');

/** Hace dos horas y hace nueve días, en el formato que devuelve Supabase. */
const haceHoras = (h) => new Date(Date.now() - h * 3600_000).toISOString();

// La gente del juego de pruebas: quien entró hace un rato, quien entró
// hace días y quien NO ha entrado nunca.
const PERSONAS = [
  { ...ADMIN, last_sign_in_at: haceHoras(2) },
  { ...WORKER, last_sign_in_at: haceHoras(24 * 9) },
  {
    ...WORKER, id: '33333333-3333-4333-8333-333333333333',
    full_name: 'Montse Grau Roca', username: 'montse', email: 'montse@metalplafer.com',
    phone: '600333444', last_sign_in_at: null,
  },
];

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: null, address: 'Carrer de la Indústria, 12', city: 'Sabadell',
      postal_code: '08202', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  projects: [
    { id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1', contact_id: null,
      source_ficha_id: null, name: 'Barandilla de la escalera',
      description: 'Tres tramos.', measures: '3 tramos', finish: 'Negro forja',
      location: 'Escalera', address: 'Rambla, 45', observations: null,
      budget_amount: 12000, advance_amount: null,
      budget_hours_fab: 16, budget_hours_mont: 16,
      phase: 'fabricacion', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: false,
      fab_start: null, fab_end: null, mont_start: null, mont_end: null,
      fab_workers: 1, mont_workers: 1, fab_manual: false, mont_manual: false, autoplan: true,
      work_id: null, invoiced_amount: null, invoiced_on: null,
      created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z' },
  ],
  calendar_notes: [
    { id: 'n1', day: null, title: 'Revisión de la plegadora', detail: null,
      project_id: null, created_at: '2026-05-02T09:00:00Z' },
  ],
  counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 1, OT: 0, PT: 0, OBRA: 0 },
});

/**
 * El calendario se prueba sobre un mes fijo, no sobre «hoy»: así las
 * cuentas de columnas y semanas no dependen del día que se ejecute.
 *
 * Noviembre de 2026 empieza en domingo, así que la rejilla arranca el
 * lunes 26 de octubre. El montaje va de lunes 2 a sábado 7 de noviembre:
 * SEIS días, de los que la estimación por horas daría dos.
 */
const MES = '2026-11-15';
const LUN2 = '2026-11-02';
const SAB7 = '2026-11-07';
db.projects[0].mont_start = LUN2;
db.projects[0].mont_end = SAB7;
db.projects[0].mont_manual = true;
db.projects[0].fab_start = '2026-11-03';
db.projects[0].fab_end = '2026-11-04';
db.projects[0].fab_manual = true;
// Una nota suelta, para comprobar que las categorías sueltas se excluyen.
db.calendar_notes[0].day = '2026-11-05';
db.projects.push({
  ...db.projects[0],
  id: 'p2', code: `PROY-${YEAR}-002`, name: 'Reja que cruza de mes',
  fab_start: null, fab_end: null,
  mont_start: '2026-10-29', mont_end: '2026-11-03', mont_manual: true,
});

const browser = await launchBrowser();
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 980 } });
  await stubSupabase(context, { db, people: PERSONAS });
  const page = await context.newPage();

  // Se separan a propósito: los fallos de programación (una excepción
  // sin recoger) son SIEMPRE un problema, mientras que un error de red
  // en la consola puede ser una respuesta que la prueba provoca a
  // posta, como la del guardado que falla al final.
  const errores = [];
  const consola = [];
  page.on('pageerror', (e) => errores.push(`error de programación: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') consola.push(m.text()); });

  await signIn(page, PORT, ADMIN.username);

  // ============ N1 · LA ÚLTIMA CONEXIÓN ============
  await page.goto(`http://localhost:${PORT}/#/admin/trabajadores`, { waitUntil: 'networkidle' });
  await page.locator('.table').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(700);

  const cabeceras = (await page.locator('.table thead th').allInnerTexts()).map((s) => s.trim());
  check('La tabla tiene la columna «Última conexión»',
    cabeceras.includes('Última conexión'), cabeceras.join(' | '));

  check('Y va junto a la fila de cada persona, no en otra pantalla',
    (await page.locator('.table tbody tr').count()) === PERSONAS.length,
    String(await page.locator('.table tbody tr').count()));

  const filaAdmin = limpio(await page.locator('tbody tr', { hasText: 'Salvi Plaza' }).innerText());
  check('Un administrador también sale con su última conexión',
    /\d{2}\/\d{2}\/\d{4}/.test(filaAdmin) && !filaAdmin.includes('Nunca'),
    filaAdmin.replace(/\n/g, ' | '));

  const filaJuan = limpio(await page.locator('tbody tr', { hasText: 'Juan Ortega' }).innerText());
  check('Un trabajador que entró hace días sale con su fecha y su hora',
    /\d{2}\/\d{2}\/\d{4}/.test(filaJuan) && /\d{1,2}:\d{2}/.test(filaJuan),
    filaJuan.replace(/\n/g, ' | '));

  // LO QUE IMPORTA: no inventarse una fecha para quien no ha entrado.
  const filaMontse = limpio(await page.locator('tbody tr', { hasText: 'Montse' }).innerText());
  check('Quien no ha entrado nunca lo dice, sin fecha inventada',
    filaMontse.includes('Nunca ha entrado'),
    filaMontse.replace(/\n/g, ' | '));

  check('Y no se le cuela la fecha de alta de su cuenta como si fuera una conexión',
    (filaMontse.match(/\d{2}\/\d{2}\/\d{4}/g) ?? []).length === 1,
    filaMontse.replace(/\n/g, ' | '));

  // Lo que ya había sigue estando.
  check('El listado conserva sus columnas y sus acciones',
    cabeceras.includes('Permisos') && cabeceras.includes('Estado') && cabeceras.includes('Alta')
    && (await page.locator('button[aria-label^="Cambiar la contraseña"]').count()) > 0
    && (await page.locator('button[aria-label^="Editar"]').count()) > 0,
    cabeceras.join(' | '));

  // ============ N2 · MATERIAL QUE YA TENEMOS EN EL ALMACÉN ============
  await page.goto(`http://localhost:${PORT}/#/admin/material`, { waitUntil: 'networkidle' });
  await page.locator('button:has-text("Nuevo material")').waitFor({ timeout: 15000 });
  await page.locator('button:has-text("Nuevo material")').click();
  await page.locator('#mat-project').waitFor({ timeout: 10000 });

  check('El formulario pregunta de dónde sale el material',
    (await page.locator('#mat-origin').count()) === 1
    && (await page.locator('#mat-origin-almacen').count()) === 1);

  check('Y arranca en «hay que pedirlo», como hasta ahora',
    (await page.locator('#mat-origin').getAttribute('aria-pressed')) === 'true'
    && (await page.locator('#mat-supplier').count()) === 1
    && (await page.locator('#mat-expected').count()) === 1);

  // Al decir que ya lo tenemos, proveedor y fechas desaparecen: no se le
  // ha pedido a nadie.
  await page.locator('#mat-origin-almacen').click();
  await page.waitForTimeout(400);

  check('Al marcar «ya lo tenemos» desaparecen el proveedor y las fechas de pedido',
    (await page.locator('#mat-supplier').count()) === 0
    && (await page.locator('#mat-ordered').count()) === 0
    && (await page.locator('#mat-expected').count()) === 0);

  check('Y se explica que no genera ningún pedido',
    limpio(await page.locator('.modal').innerText()).includes('No genera ningún pedido'),
    limpio(await page.locator('.modal').innerText()).replace(/\n/g, ' | ').slice(0, 260));

  await page.locator('#mat-project').selectOption('p1');
  await page.locator('#mat-name').fill('Discos de corte 125 mm');
  await page.locator('#mat-units').fill('10');
  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(1500);

  const almacen = db.materials.find((m) => m.name === 'Discos de corte 125 mm');
  check('El material queda anotado en el proyecto, como material de almacén',
    !!almacen && almacen.origin === 'almacen' && almacen.project_id === 'p1',
    JSON.stringify(almacen ?? null));

  check('Sin proveedor y sin fechas de pedido',
    !!almacen && !almacen.supplier && !almacen.supplier_id
    && !almacen.ordered_on && !almacen.expected_on,
    JSON.stringify(almacen ?? null));

  check('Y disponible: no está pendiente de que llegue',
    almacen?.received === true);

  // LO QUE NO TIENE QUE PASAR: pedirle nada a nadie.
  check('No se ha creado ninguna petición de material',
    db.material_requests.length === 0, String(db.material_requests.length));

  check('Ni se ha tocado ningún proveedor',
    db.suppliers.length === 0, String(db.suppliers.length));

  // Y no se mezcla con lo que hay que comprar.
  await page.locator('.tabs button:has-text("De almacén")').click();
  await page.waitForTimeout(900);
  const pestanaAlmacen = limpio(await page.locator('.table tbody').innerText());
  check('Tiene su propia pestaña, y ahí sale',
    pestanaAlmacen.includes('Discos de corte 125 mm') && pestanaAlmacen.includes('De almacén'),
    pestanaAlmacen.replace(/\n/g, ' | ').slice(0, 240));

  await page.locator('.tabs button:has-text("Pendiente")').click();
  await page.waitForTimeout(900);
  const pendiente = limpio(await page.locator('.panel-body').innerText());
  check('Y NO aparece en el material pendiente de comprar',
    !pendiente.includes('Discos de corte 125 mm'),
    pendiente.replace(/\n/g, ' | ').slice(0, 240));

  // «Recibido» es de un pedido: lo que ya tenemos no se marca ni se
  // desmarca, porque desmarcarlo lo contaría como pendiente.
  const filaAlmacen = page.locator('.table tbody tr', { hasText: 'Discos de corte 125 mm' });
  check('El material de almacén no tiene casilla de «recibido»',
    (await filaAlmacen.locator('input[type="checkbox"]').count()) === 0);

  // En la ficha del proyecto se ve, que es para lo que se anota.
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const panelMaterial = limpio(
    await page.locator('.panel').filter({ hasText: 'Discos de corte 125 mm' }).innerText());
  check('El proyecto lo enseña, y dice que lo teníamos',
    panelMaterial.includes('Discos de corte 125 mm')
    && panelMaterial.includes('De almacén')
    && !panelMaterial.includes('Sin proveedor'),
    panelMaterial.replace(/\n/g, ' | ').slice(0, 260));

  // ---- el informe lo separa ----
  await page.goto(`http://localhost:${PORT}/#/admin/informes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('.tabs button:has-text("Material")').click();
  await page.waitForTimeout(1200);
  const informe = limpio(await page.locator('main').innerText());
  check('El informe de material dice de dónde sale cada uno',
    informe.includes('Origen') && informe.includes('De almacén'),
    informe.replace(/\n/g, ' | ').slice(0, 300));

  // ============ N3 · EL CALENDARIO ============
  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.locator('.cal-grid').waitFor({ state: 'visible', timeout: 15000 });
  // Al mes de la prueba.
  while (!(await page.locator('.cal-title').innerText()).toLowerCase().includes('noviembre')) {
    await page.locator('.cal-toolbar button[aria-label="Siguiente"]').click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(700);

  // ---- 3.1 · categorías ----
  const encendidas = async () => (await page.locator('.cal-legend-item[aria-pressed="true"]')
    .allInnerTexts()).map((s) => s.trim());

  check('Al abrir, solo están encendidas fabricación y montaje',
    JSON.stringify(await encendidas()) === JSON.stringify(['Fabricación', 'Montaje']),
    (await encendidas()).join(' | '));

  check('Y la leyenda sigue ofreciendo las siete categorías',
    (await page.locator('.cal-legend-item').count()) === 7);

  // Colores distintos: el de fabricación y el de montaje no pueden ser
  // el mismo, o no se distinguen las dos fases de un vistazo.
  const colorDe = (texto) => page.locator(`.cal-event:has-text("${texto}")`).first()
    .evaluate((el) => getComputedStyle(el).borderLeftColor);
  check('Fabricación y montaje se pintan de colores distintos',
    (await page.locator('.cal-legend-item:has-text("Fabricación") .cal-dot')
      .evaluate((el) => getComputedStyle(el).backgroundColor))
    !== (await page.locator('.cal-legend-item:has-text("Montaje") .cal-dot')
      .evaluate((el) => getComputedStyle(el).backgroundColor)));

  // Una categoría suelta apaga todas las demás.
  await page.locator('.cal-legend-item:has-text("Otros")').click();
  await page.waitForTimeout(700);
  check('Al elegir «Otros» se apaga todo lo demás',
    JSON.stringify(await encendidas()) === JSON.stringify(['Otros']),
    (await encendidas()).join(' | '));
  check('Y en la rejilla solo queda la nota',
    (await page.locator('.cal-grid').innerText()).includes('Revisión de la plegadora')
    && !(await page.locator('.cal-grid').innerText()).includes(`PROY-${YEAR}-001`));

  await page.locator('.cal-legend-item:has-text("Aviso")').click();
  await page.waitForTimeout(700);
  check('Una categoría suelta sustituye a la anterior',
    JSON.stringify(await encendidas()) === JSON.stringify(['Aviso']),
    (await encendidas()).join(' | '));

  // Y volver a proyectos: las dos pueden estar a la vez.
  await page.locator('.cal-legend-item:has-text("Fabricación")').click();
  await page.waitForTimeout(600);
  check('Desde una suelta, pulsar fabricación deja solo fabricación',
    JSON.stringify(await encendidas()) === JSON.stringify(['Fabricación']),
    (await encendidas()).join(' | '));
  await page.locator('.cal-legend-item:has-text("Montaje")').click();
  await page.waitForTimeout(700);
  check('Fabricación y montaje pueden estar encendidas a la vez',
    JSON.stringify(await encendidas()) === JSON.stringify(['Fabricación', 'Montaje']),
    (await encendidas()).join(' | '));

  // ---- 3.3 · una sola barra continua por tramo ----
  const barras = page.locator(`.cal-event:has-text("PROY-${YEAR}-001")`);
  check('Un proyecto con dos fases da DOS barras, una por fase',
    (await barras.count()) === 2, String(await barras.count()));

  const columnasDe = (loc) => loc.evaluate(
    (el) => getComputedStyle(el).gridColumn || el.style.gridColumn);

  // Hay dos proyectos con montaje —el otro cruza de mes—, así que se
  // señala el de este proyecto por su código.
  const montajeDe = (codigo) => page.locator('.cal-event[title^="Montaje"]')
    .filter({ hasText: codigo });
  const barraMontaje = montajeDe(`PROY-${YEAR}-001`).first();
  check('El montaje de seis días es UNA barra de seis columnas, no seis pastillas',
    /span\s*6/.test(await columnasDe(barraMontaje)), await columnasDe(barraMontaje));

  const barraFab = page.locator('.cal-event[title^="Fabricación"]').first();
  check('Y la fabricación de dos días, una barra de dos',
    /span\s*2/.test(await columnasDe(barraFab)), await columnasDe(barraFab));

  // ---- un tramo que cruza de mes ----
  //
  // Del jueves 29 de octubre al martes 3 de noviembre. En la rejilla de
  // noviembre eso cae a caballo entre la primera fila (que empieza el
  // lunes 26 de octubre) y la segunda: tiene que verse como DOS trozos
  // de la misma barra, marcados por donde continúan, y no desaparecer
  // ni pintarse dos veces entero.
  const cruza = page.locator(`.cal-event:has-text("${`PROY-${YEAR}-002`}")`);
  check('Un tramo que cruza de mes se pinta en las dos semanas',
    (await cruza.count()) === 2, String(await cruza.count()));

  const clases = await cruza.evaluateAll((els) => els.map((e) => e.className));
  check('El primer trozo dice que continúa, y el segundo que viene de antes',
    clases[0].includes('sigue-despues') && clases[1].includes('sigue-antes'),
    clases.join(' | '));

  const colsCruza = await cruza.evaluateAll(
    (els) => els.map((e) => getComputedStyle(e).gridColumn));
  check('Y entre los dos trozos suman los seis días del tramo',
    colsCruza.join(' ').includes('span 4') && colsCruza.join(' ').includes('span 2'),
    colsCruza.join(' | '));

  // ---- 3.4 · arrastrar conserva la duración ----
  const casilla = (iso) => page.locator('.cal-grid .cal-day')
    .nth(Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse('2026-10-26T00:00:00Z')) / 86400000));

  await barraMontaje.dispatchEvent('dragstart');
  await casilla('2026-11-04').dispatchEvent('dragover');
  await casilla('2026-11-04').dispatchEvent('drop');
  await page.waitForTimeout(1500);

  const p = db.projects[0];
  check('Soltado en miércoles, el montaje empieza el miércoles',
    p.mont_start === '2026-11-04', p.mont_start);
  check('Y sigue durando SEIS días: acaba el lunes siguiente',
    p.mont_end === '2026-11-09', `${p.mont_start} → ${p.mont_end}`);
  check('Las horas no se han tocado',
    Number(p.budget_hours_mont) === 16 && Number(p.budget_hours_fab) === 16,
    `${p.budget_hours_fab} / ${p.budget_hours_mont}`);
  check('Y la fabricación se ha quedado donde estaba',
    p.fab_start === '2026-11-03' && p.fab_end === '2026-11-04',
    `${p.fab_start} → ${p.fab_end}`);

  check('La barra sigue siendo continua después de moverla',
    /span\s*[56]/.test(await columnasDe(montajeDe(`PROY-${YEAR}-001`).first())),
    await columnasDe(montajeDe(`PROY-${YEAR}-001`).first()));

  // Y persiste: se recarga la página y sigue donde se dejó.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  while (!(await page.locator('.cal-title').innerText()).toLowerCase().includes('noviembre')) {
    await page.locator('.cal-toolbar button[aria-label="Siguiente"]').click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(700);
  check('Al recargar, el montaje sigue en su periodo nuevo',
    /span\s*[56]/.test(await columnasDe(montajeDe(`PROY-${YEAR}-001`).first()))
    && db.projects[0].mont_start === '2026-11-04');

  // ---- si el guardado falla, la barra vuelve a su sitio ----
  await page.route('**/rest/v1/rpc/move_project_phase', (route) => route.fulfill({
    status: 400,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Fallo de prueba al guardar', code: '22023' }),
  }));

  const antesDelFallo = db.projects[0].mont_start;
  await montajeDe(`PROY-${YEAR}-001`).first().dispatchEvent('dragstart');
  await casilla('2026-11-11').dispatchEvent('dragover');
  await casilla('2026-11-11').dispatchEvent('drop');
  await page.waitForTimeout(1500);

  check('Si el guardado falla, no se guarda nada',
    db.projects[0].mont_start === antesDelFallo, db.projects[0].mont_start);
  check('Se avisa del error',
    (await page.locator('.toast.error').last().innerText()).length > 0,
    await page.locator('.toast.error').last().innerText().catch(() => 'sin aviso'));
  check('Y la barra vuelve a donde estaba, no se queda en el día nuevo',
    (await montajeDe(`PROY-${YEAR}-001`).first()
      .evaluate((el) => getComputedStyle(el).gridColumn)).includes('3'),
    await columnasDe(montajeDe(`PROY-${YEAR}-001`).first()));
  await page.unroute('**/rest/v1/rpc/move_project_phase');

  check('Ninguna pantalla ha dado un error de programación',
    errores.length === 0, errores.join(' · '));

  // Lo único que la consola tenía que lamentar es el fallo que se ha
  // provocado a posta para comprobar la vuelta atrás.
  check('Y en la consola no hay más errores que el provocado a posta',
    consola.every((e) => /400|Bad Request|Fallo de prueba/.test(e)),
    consola.join(' · '));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

process.exit(report() ? 1 : 0);
