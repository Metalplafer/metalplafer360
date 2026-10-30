/**
 * METALPLAFER360 · CONVERSIÓN SIN PÉRDIDAS Y VISITAS TÉCNICAS VINCULADAS
 *
 *   npm run test:mejoras4
 *
 * Comprueba, pulsando lo que pulsa una persona:
 *
 *   · MEJORA 1 · que al convertir un presupuesto en proyecto los
 *     documentos y las fotografías NO se quedan atrás: se ven desde el
 *     proyecto, se pueden abrir, siguen siendo del presupuesto (no hay
 *     copias) y se dice de dónde vienen. Y que desde el proyecto se
 *     vuelve al presupuesto de origen;
 *
 *   · MEJORA 2 · que se puede asignar una visita técnica desde un
 *     presupuesto y desde un proyecto reutilizando la ficha de visita de
 *     siempre, que se ven las vinculadas con su estado y su fecha, que
 *     sus planos se consultan desde el presupuesto y desde el proyecto
 *     indicando que «proceden de la visita técnica del [fecha]», que al
 *     convertir el presupuesto la visita sigue a mano, y que quitar una
 *     asignación equivocada no borra nada.
 *
 * Las reglas de verdad se prueban contra PostgreSQL en
 * tests/sql/99_tests_conversion.sql y tests/sql/99_tests_visitas.sql.
 * Aquí se comprueba LA PANTALLA.
 */
import {
  ADMIN, YEAR, addDays, buildApp, createChecker, createDb, diaLaborable,
  launchBrowser, serveApp, signIn, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4204;

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();
const limpio = (s) => s.replace(/ /g, ' ');

/**
 * EL PANEL POR SU TÍTULO EXACTO.
 *
 * Con «:has-text» no basta: el panel de documentos heredados explica en
 * su propio texto que los archivos vienen de «las visitas técnicas», así
 * que buscar «Visitas técnicas» devolvía los dos paneles y Playwright se
 * negaba. Se busca por el encabezado y con texto exacto.
 */
const panel = (p, titulo) => p.locator(`.panel:has(h2:text-is("${titulo}"))`);

/**
 * Algunos paneles llevan un icono DENTRO del encabezado, y entonces
 * «text-is» no cuaja porque el texto del h2 no es solo el título. Para
 * esos se busca por contenido.
 */
const panelCon = (p, titulo) => p.locator(`.panel:has(h2:has-text("${titulo}"))`);

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: null, address: 'Carrer de la Indústria, 12', city: 'Sabadell',
      postal_code: '08202', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  fichas: [
    // El presupuesto que se va a convertir, CON SUS ARCHIVOS.
    { id: 'f1', code: `PRES-${YEAR}-001`, type: 'presupuesto', status: 'aceptado',
      client_id: 'c1', contact_id: null, title: 'Escalera metálica de caracol',
      description: 'Escalera de caracol con peldaños de tramex.',
      address: 'Carrer del Sol, 22 · Sabadell', phone: null, email: null, hours: null,
      scheduled_date: null, scheduled_time: null, assigned_to: ADMIN.id, amount: 7400,
      linked_ficha_id: null, linked_project_id: null,
      archived_at: null, is_demo: false,
      created_at: '2026-04-10T09:00:00Z', updated_at: '2026-04-10T09:00:00Z' },
    // Una visita que YA existe, sin vincular: se apuntó antes de que
    // hubiera presupuesto, que es el caso que obliga a poder vincular
    // una visita existente en lugar de crear otra.
    { id: 'v1', code: `VIS-${YEAR}-001`, type: 'visita', status: 'realizada',
      client_id: 'c1', contact_id: null, title: 'Medir el hueco de la escalera',
      description: 'Medición con el cliente delante.',
      address: 'Carrer del Sol, 22 · Sabadell', phone: null, email: null, hours: null,
      scheduled_date: '2026-04-08', scheduled_time: '10:00', assigned_to: ADMIN.id,
      amount: null, linked_ficha_id: null, linked_project_id: null,
      archived_at: null, is_demo: false,
      created_at: '2026-04-07T09:00:00Z', updated_at: '2026-04-08T12:00:00Z' },
  ],
  documents: [
    { id: 'd1', ficha_id: 'f1', project_id: null, order_id: null, report_id: null,
      work_id: null, bucket: 'documentos', storage_path: 'fichas/f1/plano-escalera.pdf',
      file_name: 'plano-escalera.pdf', mime_type: 'application/pdf', size_bytes: 51200,
      category: 'documento', scope: 'tecnica', uploaded_by: ADMIN.id,
      deleted_at: null, is_demo: false, created_at: '2026-04-10T10:00:00Z' },
    { id: 'd2', ficha_id: 'f1', project_id: null, order_id: null, report_id: null,
      work_id: null, bucket: 'documentos', storage_path: 'fichas/f1/medicion.jpg',
      file_name: 'medicion.jpg', mime_type: 'image/jpeg', size_bytes: 820000,
      category: 'foto', scope: 'tecnica', uploaded_by: ADMIN.id,
      deleted_at: null, is_demo: false, created_at: '2026-04-10T10:05:00Z' },
    // Uno en la papelera: no tiene que salir en el proyecto.
    { id: 'd3', ficha_id: 'f1', project_id: null, order_id: null, report_id: null,
      work_id: null, bucket: 'documentos', storage_path: 'fichas/f1/version-antigua.pdf',
      file_name: 'version-antigua.pdf', mime_type: 'application/pdf', size_bytes: 4096,
      category: 'documento', scope: 'tecnica', uploaded_by: ADMIN.id,
      deleted_at: '2026-04-11T08:00:00Z', is_demo: false, created_at: '2026-04-09T10:00:00Z' },
    // Los de la visita técnica.
    { id: 'd4', ficha_id: 'v1', project_id: null, order_id: null, report_id: null,
      work_id: null, bucket: 'documentos', storage_path: 'fichas/v1/croquis-visita.pdf',
      file_name: 'croquis-visita.pdf', mime_type: 'application/pdf', size_bytes: 20480,
      category: 'documento', scope: 'tecnica', uploaded_by: ADMIN.id,
      deleted_at: null, is_demo: false, created_at: '2026-04-08T13:00:00Z' },
    { id: 'd5', ficha_id: 'v1', project_id: null, order_id: null, report_id: null,
      work_id: null, bucket: 'documentos', storage_path: 'fichas/v1/hueco.jpg',
      file_name: 'hueco.jpg', mime_type: 'image/jpeg', size_bytes: 500000,
      category: 'foto', scope: 'tecnica', uploaded_by: ADMIN.id,
      deleted_at: null, is_demo: false, created_at: '2026-04-08T13:05:00Z' },
  ],
  comments: [
    { id: 'cm1', ficha_id: 'f1', project_id: null, author_id: ADMIN.id,
      body: 'El cliente acepta por teléfono.', is_demo: false,
      created_at: '2026-04-10T11:00:00Z' },
  ],
  // Un proyecto aparte para el material: así su estado es el que la
  // prueba pone y no depende de la conversión de más arriba.
  projects: [
    { id: 'pm', code: `PROY-${YEAR}-009`, client_id: 'c1', contact_id: null,
      source_ficha_id: null, name: 'Pérgola de la azotea',
      description: null, measures: null, finish: null, location: null,
      address: 'Rambla, 45', observations: null,
      budget_amount: 8800, advance_amount: null,
      budget_hours_fab: 16, budget_hours_mont: 8,
      phase: 'fabricacion', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: false,
      fab_start: null, fab_end: null, mont_start: null, mont_end: null,
      fab_workers: 1, mont_workers: 1, fab_manual: false, mont_manual: false, autoplan: false,
      work_id: null, invoiced_amount: null, invoiced_on: null,
      created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z' },
  ],
  materials: [
    // De almacén, CON COMENTARIO: es donde se vio el fallo.
    { id: 'm1', project_id: 'pm', order_id: null, name: 'Tramex 30×30', units: 4,
      supplier: null, supplier_id: null, ordered_on: null, expected_on: null,
      received: true, origin: 'almacen', prepared: false,
      notes: 'Estantería 3, pasillo B. Quedan 6 planchas.',
      late_notified_on: null, archived_at: null, is_demo: false,
      created_at: '2026-05-02T10:00:00Z', updated_at: '2026-05-02T10:00:00Z' },
    // Pedido y recibido: se puede cargar.
    { id: 'm2', project_id: 'pm', order_id: null, name: 'Tubo 60×40', units: 12,
      supplier: 'Aceros del Vallès', supplier_id: null,
      ordered_on: '2026-04-20', expected_on: '2026-04-27',
      received: true, origin: 'pedido', prepared: false,
      notes: 'Pedido con el albarán 4471.',
      late_notified_on: null, archived_at: null, is_demo: false,
      created_at: '2026-04-20T10:00:00Z', updated_at: '2026-04-27T10:00:00Z' },
    // Pedido y SIN recibir: no se puede cargar.
    { id: 'm3', project_id: 'pm', order_id: null, name: 'Chapa perforada', units: 2,
      supplier: 'Aceros del Vallès', supplier_id: null,
      ordered_on: '2026-05-01', expected_on: '2026-05-20',
      received: false, origin: 'pedido', prepared: false,
      notes: 'Lo confirman para la semana que viene.',
      late_notified_on: null, archived_at: null, is_demo: false,
      created_at: '2026-05-01T10:00:00Z', updated_at: '2026-05-01T10:00:00Z' },
  ],
  counters: { PRES: 1, VIS: 1, AVI: 0, PROY: 9, OT: 0, PT: 0, OBRA: 0 },
});

/**
 * MEJORA 4 y 5.2 · El calendario se prueba sobre el MES EN CURSO, que es
 * el que abre la pantalla. Se colocan el proyecto, una nota y el
 * material dentro de los días visibles para tener TRES categorías a la
 * vez: es lo que hace falta para comprobar que los filtros ya no se
 * excluyen y que las pastillas no se solapan.
 */
const HOY = diaLaborable(today());
db.projects[0].fab_start = HOY;
db.projects[0].fab_end = HOY;
db.projects[0].fab_manual = true;
db.projects[0].mont_start = addDays(HOY, 1);
db.projects[0].mont_end = addDays(HOY, 2);
db.projects[0].mont_manual = true;
db.materials[2].expected_on = addDays(HOY, 3);
db.calendar_notes = [
  { id: 'n1', day: HOY, title: 'Revisión de la plegadora', detail: null,
    project_id: null, created_at: '2026-05-02T09:00:00Z' },
];

const browser = await launchBrowser();
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 980 } });
  await stubSupabase(context, { db });
  const page = await context.newPage();

  const errores = [];
  const consola = [];
  page.on('pageerror', (e) => errores.push(`error de programación: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') consola.push(m.text()); });

  await signIn(page, PORT, ADMIN.username);

  // ============ MEJORA 2 · VINCULAR UNA VISITA QUE YA EXISTE ============
  // Se hace ANTES de convertir, que es como pasa de verdad: se mide, se
  // apunta la visita y después el presupuesto se acepta.
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/f1`, { waitUntil: 'networkidle' });
  await panel(page, 'Visitas técnicas').waitFor({ timeout: 15000 });

  const panelVisitas = panel(page, 'Visitas técnicas');
  check('El presupuesto tiene un panel de visitas técnicas con su botón',
    (await panelVisitas.locator('button:has-text("Asignar visita técnica")').count()) === 1,
    limpio(await panelVisitas.innerText()).replace(/\n/g, ' | '));

  /*
    Se ESPERA al estado vacío en lugar de leer el panel al instante.

    Leerlo de golpe es una carrera con la carga: si la consulta de las
    visitas todavía no ha vuelto, el panel enseña el indicador de carga y
    la comprobación falla sin que haya nada roto. Se comprueba lo mismo,
    pero esperando a que el panel haya terminado de cargar.
  */
  await panelVisitas.locator('text=Sin visitas técnicas')
    .waitFor({ timeout: 15000 }).catch(() => undefined);
  check('Y de entrada dice que no hay ninguna',
    limpio(await panelVisitas.innerText()).includes('Sin visitas técnicas'),
    limpio(await panelVisitas.innerText()).replace(/\n/g, ' | ').slice(0, 160));

  check('Mientras no haya visitas vinculadas, no hay documentos de origen',
    (await panel(page, 'Documentos de origen').count()) === 0);

  await panelVisitas.locator('button:has-text("Vincular existente")').click();
  await panelVisitas.locator('select').waitFor({ timeout: 10000 });

  const opciones = await panelVisitas.locator('select option').allInnerTexts();
  check('Ofrece la visita que ya existía, con su código y su fecha',
    opciones.some((o) => o.includes(`VIS-${YEAR}-001`) && o.includes('08/04/2026')),
    opciones.join(' | '));

  await panelVisitas.locator('select').selectOption('v1');
  await panelVisitas.locator('button:has-text("Vincular")').click();
  await page.waitForTimeout(900);

  const visitasTexto = limpio(await panelVisitas.innerText());
  check('La visita queda vinculada y se ve con su estado, su fecha y su responsable',
    visitasTexto.includes(`VIS-${YEAR}-001`) && visitasTexto.includes('Realizada')
    && visitasTexto.includes('08/04/2026') && visitasTexto.includes('Salvi'),
    visitasTexto.replace(/\n/g, ' | '));

  check('Y dice cuántos archivos tiene, para saber si merece la pena abrirla',
    visitasTexto.includes('2 archivos'), visitasTexto.replace(/\n/g, ' | '));

  // LO QUE SE PEDÍA: sus planos, desde el presupuesto, diciendo de dónde
  // vienen.
  const origenPres = panel(page, 'Documentos de origen');
  await origenPres.waitFor({ timeout: 10000 });
  const textoOrigenPres = limpio(await origenPres.innerText());

  check('Los archivos de la visita se ven desde el presupuesto',
    textoOrigenPres.includes('croquis-visita.pdf') && textoOrigenPres.includes('hueco.jpg'),
    textoOrigenPres.replace(/\n/g, ' | '));

  check('Y dicen que proceden de la visita técnica, con su fecha',
    textoOrigenPres.includes('Procede de la visita técnica del 08/04/2026'),
    textoOrigenPres.replace(/\n/g, ' | '));

  check('Con un enlace a la visita de origen',
    (await origenPres.locator(`a:has-text("VIS-${YEAR}-001")`).count()) >= 1);

  check('Y se pueden abrir y descargar desde aquí',
    (await origenPres.locator('button[aria-label^="Descargar croquis-visita"]').count()) === 1,
    String(await origenPres.locator('button[aria-label^="Descargar"]').count()));

  // NO se sube ni se borra desde el panel de lo heredado: el archivo es
  // de la visita.
  check('El panel de lo heredado no ofrece subir ni enviar a la papelera',
    (await origenPres.locator('input[type="file"]').count()) === 0
    && (await origenPres.locator('button[aria-label^="Enviar"]').count()) === 0);

  check('Dice expresamente que no se copian',
    textoOrigenPres.includes('no se copian'), textoOrigenPres.replace(/\n/g, ' | '));

  // Y los archivos del presupuesto siguen siendo del presupuesto: su
  // propio panel no ha cambiado.
  const propios = panel(page, 'Documentos y fotografías');
  check('El panel propio del presupuesto sigue con sus dos archivos',
    limpio(await propios.innerText()).includes('plano-escalera.pdf'),
    limpio(await propios.innerText()).replace(/\n/g, ' | ').slice(0, 300));

  // Desde la visita se vuelve a la ficha de origen.
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/v1`, { waitUntil: 'networkidle' });
  await page.locator('.ficha-head').waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  check('Desde la visita se vuelve al presupuesto con un enlace que lo dice',
    (await page.locator(`a:has-text("Visita técnica de PRES-${YEAR}-001")`).count()) === 1,
    limpio(await page.locator('.page-head, header').first().innerText()).replace(/\n/g, ' | '));

  check('Una visita no tiene panel de visitas técnicas',
    (await panel(page, 'Visitas técnicas').count()) === 0);

  // ============ MEJORA 1 · CONVERTIR SIN PERDER NADA ============
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/f1`, { waitUntil: 'networkidle' });
  await page.locator('button:has-text("Convertir en proyecto")').waitFor({ timeout: 15000 });

  const docsAntes = db.documents.length;
  await page.locator('button:has-text("Convertir en proyecto")').click();
  const dialogo = page.locator('.modal, [role="dialog"]').first();
  await dialogo.waitFor({ timeout: 10000 });
  check('Al convertir se avisa de que los archivos se verán desde el proyecto',
    limpio(await dialogo.innerText()).includes('sin copiarse'),
    limpio(await dialogo.innerText()).replace(/\n/g, ' | '));

  await page.locator('button:has-text("Crear el proyecto")').click();
  await page.waitForURL(/#\/admin\/proyectos\/[^/]+$/, { timeout: 15000 });
  await page.locator('.ficha-head').waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);

  check('Se llega al proyecto recién creado',
    (await page.locator('.plate').first().innerText()).startsWith(`PROY-${YEAR}`),
    await page.locator('.plate').first().innerText());

  check('El proyecto dice de qué presupuesto procede, con enlace para volver',
    (await page.locator(`a:has-text("Procede de PRES-${YEAR}-001")`).count()) === 1,
    limpio(await page.locator('.ficha-head').first().innerText()));

  // LA COMPROBACIÓN QUE IMPORTA: los archivos del presupuesto, aquí.
  const origen = panel(page, 'Documentos de origen');
  await origen.waitFor({ timeout: 10000 });
  const textoOrigen = limpio(await origen.innerText());

  check('Los dos archivos del presupuesto se ven desde el proyecto',
    textoOrigen.includes('plano-escalera.pdf') && textoOrigen.includes('medicion.jpg'),
    textoOrigen.replace(/\n/g, ' | '));

  check('Diciendo que proceden del presupuesto',
    textoOrigen.includes(`Procede del presupuesto PRES-${YEAR}-001`),
    textoOrigen.replace(/\n/g, ' | '));

  check('El que estaba en la papelera NO sale',
    !textoOrigen.includes('version-antigua.pdf'), textoOrigen.replace(/\n/g, ' | '));

  check('Y los de la visita del presupuesto también están aquí',
    textoOrigen.includes('croquis-visita.pdf')
    && textoOrigen.includes('Procede de la visita técnica del 08/04/2026'),
    textoOrigen.replace(/\n/g, ' | '));

  check('No se ha creado ni una copia de ningún archivo',
    db.documents.length === docsAntes, `antes ${docsAntes}, ahora ${db.documents.length}`);

  check('Y ninguno ha cambiado de dueño: siguen siendo del presupuesto y de la visita',
    db.documents.every((d) => !d.project_id),
    db.documents.filter((d) => d.project_id).map((d) => d.file_name).join(', ') || 'ninguno');

  // El panel propio del proyecto está vacío, y eso es correcto: lo
  // heredado se ve aparte y no se mezcla con lo que se suba aquí.
  const propiosProy = panel(page, 'Documentos, fotografías y vídeos');
  check('El panel de documentos del proyecto está vacío, sin archivos copiados',
    limpio(await propiosProy.innerText()).includes('Sin archivos'),
    limpio(await propiosProy.innerText()).replace(/\n/g, ' | ').slice(0, 300));

  // La visita del presupuesto se ve desde el proyecto, marcada.
  const visitasProy = panel(page, 'Visitas técnicas');
  const textoVisitasProy = limpio(await visitasProy.innerText());
  check('La visita del presupuesto se ve desde el proyecto, marcada «Del presupuesto»',
    textoVisitasProy.includes(`VIS-${YEAR}-001`) && textoVisitasProy.includes('Del presupuesto'),
    textoVisitasProy.replace(/\n/g, ' | '));

  check('Y no se ofrece quitarla desde aquí: cuelga del presupuesto',
    (await visitasProy.locator(`button[aria-label="Quitar la visita VIS-${YEAR}-001"]`).count()) === 0);

  const proyectoUrl = page.url();
  const proyectoId = proyectoUrl.split('/').pop();
  // El código se LEE, no se supone: depende de cuántos proyectos haya en
  // el juego de pruebas y no de un número escrito a mano.
  const proyectoCode = (await page.locator('.plate').first().innerText()).trim();

  // El presupuesto se conserva tal cual.
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/f1`, { waitUntil: 'networkidle' });
  await page.locator('.ficha-head').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);
  const textoPres = limpio(await page.locator('body').innerText());

  check('El presupuesto conserva sus archivos y su comentario',
    textoPres.includes('plano-escalera.pdf') && textoPres.includes('El cliente acepta por teléfono'),
    '');

  check('Y ya no ofrece convertir: dice que es el proyecto que se creó',
    (await page.locator('button:has-text("Convertir en proyecto")').count()) === 0
    && textoPres.includes('ya es el proyecto'),
    textoPres.split('\n').filter((l) => l.includes('proyecto')).join(' | '));

  // ============ MEJORA 2 · ASIGNAR UNA VISITA DESDE EL PROYECTO ============
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/${proyectoId}`, { waitUntil: 'networkidle' });
  await panel(page, 'Visitas técnicas').waitFor({ timeout: 15000 });
  await panel(page, 'Visitas técnicas').locator('button:has-text("Asignar visita técnica")').click();

  await page.waitForURL(/#\/admin\/fichas\/nueva/, { timeout: 15000 });
  await page.locator('#f-date').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);

  check('Se abre la ficha de visita DE SIEMPRE, con sus campos',
    (await page.locator('#f-date').count()) === 1 && (await page.locator('#f-time').count()) === 1,
    page.url());

  const textoForm = limpio(await page.locator('body').innerText());
  check('Dice a qué va a quedar vinculada antes de guardar',
    textoForm.includes('quedará vinculada') && textoForm.includes(proyectoCode),
    textoForm.split('\n').filter((l) => l.includes('vinculada')).join(' | '));

  check('Y el botón de volver lleva al proyecto, no al listado de fichas',
    (await page.locator(`a:has-text("Volver a ${proyectoCode}")`).count()) === 1);

  check('La dirección del proyecto viene puesta: la visita es en el mismo sitio',
    (await page.locator('#f-address').inputValue()) === 'Carrer del Sol, 22 · Sabadell',
    await page.locator('#f-address').inputValue());

  await page.locator('#f-title').fill('Comprobar el replanteo en obra');
  await page.locator('#f-date').fill('2026-12-01');
  await page.locator('button:has-text("Crear visita")').click();

  // Vuelve AL PROYECTO, no a la ficha nueva: es de donde se salió.
  await page.waitForURL(new RegExp(`#/admin/proyectos/${proyectoId}$`), { timeout: 15000 });
  await panel(page, 'Visitas técnicas').waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);

  const visitasProy2 = panel(page, 'Visitas técnicas');
  const texto2 = limpio(await visitasProy2.innerText());
  check('Al guardar vuelve al proyecto con la visita nueva ya vinculada',
    texto2.includes('Comprobar el replanteo en obra') && texto2.includes(`VIS-${YEAR}-002`),
    texto2.replace(/\n/g, ' | '));

  check('La visita nueva NO sale como heredada: es de este proyecto',
    (await visitasProy2.locator('li', { hasText: `VIS-${YEAR}-002` })
      .locator('text=Del presupuesto').count()) === 0);

  check('Y esa sí se puede quitar desde aquí',
    (await visitasProy2.locator(`button[aria-label="Quitar la visita VIS-${YEAR}-002"]`).count()) === 1);

  // Quitar una asignación equivocada no borra la visita.
  await visitasProy2.locator(`button[aria-label="Quitar la visita VIS-${YEAR}-002"]`).click();
  await page.locator('button:has-text("Quitar")').last().click();
  await page.waitForTimeout(900);

  check('Al quitarla deja de verse desde el proyecto',
    !limpio(await visitasProy2.innerText()).includes(`VIS-${YEAR}-002`),
    limpio(await visitasProy2.innerText()).replace(/\n/g, ' | '));

  check('Pero la visita sigue existiendo: no se ha borrado nada',
    db.fichas.some((f) => f.code === `VIS-${YEAR}-002`),
    db.fichas.map((f) => f.code).join(', '));

  check('Y la del presupuesto sigue ahí',
    limpio(await visitasProy2.innerText()).includes(`VIS-${YEAR}-001`));

  // ============ MEJORA 3 · COMENTARIO Y «PREPARADO / CARGADO» ============
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/pm`, { waitUntil: 'networkidle' });
  await panel(page, 'Material').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);

  const panelMat = panel(page, 'Material');
  const textoMat = limpio(await panelMat.innerText());

  // 3.1 · EL FALLO QUE SE VENÍA A CORREGIR.
  check('El comentario del material de almacén se ve en el proyecto',
    textoMat.includes('Estantería 3, pasillo B. Quedan 6 planchas.'),
    textoMat.replace(/\n/g, ' | '));

  check('Y el de los demás materiales también',
    textoMat.includes('Pedido con el albarán 4471.')
    && textoMat.includes('Lo confirman para la semana que viene.'),
    textoMat.replace(/\n/g, ' | '));

  // 3.2 y 3.3 · EL CONTROL Y CUÁNDO SE PUEDE USAR.
  const cargado = (nombre) =>
    panelMat.locator(`input[aria-label="Marcar ${nombre} como preparado y cargado"]`);

  check('Cada material tiene su control de «Cargado»',
    (await panelMat.locator('input[aria-label*="preparado y cargado"]').count()) === 3,
    String(await panelMat.locator('input[aria-label*="preparado y cargado"]').count()));

  check('Ninguno empieza marcado',
    !(await cargado('Tramex 30×30').isChecked())
    && !(await cargado('Tubo 60×40').isChecked())
    && !(await cargado('Chapa perforada').isChecked()));

  check('El de almacén se puede marcar: ya lo tenemos',
    await cargado('Tramex 30×30').isEnabled());

  check('El pedido que ya llegó, también',
    await cargado('Tubo 60×40').isEnabled());

  // LA REGLA QUE IMPORTA.
  check('El que está pedido y sin recibir está APAGADO',
    await cargado('Chapa perforada').isDisabled());

  const fila = panelMat.locator('li', { hasText: 'Chapa perforada' });
  check('Y se dice por qué, al pasar por encima',
    (await fila.locator('label.mat-cargado').getAttribute('title'))
      === 'Todavía no ha llegado: no se puede preparar',
    await fila.locator('label.mat-cargado').getAttribute('title'));

  await cargado('Tramex 30×30').click();
  await page.waitForTimeout(800);

  check('Al marcarlo queda guardado en la base de datos',
    db.materials.find((m) => m.id === 'm1').prepared === true,
    String(db.materials.find((m) => m.id === 'm1').prepared));

  check('Y no ha tocado el estado del pedido ni el proveedor',
    db.materials.find((m) => m.id === 'm1').received === true
    && db.materials.find((m) => m.id === 'm1').supplier === null
    && db.materials.find((m) => m.id === 'm1').origin === 'almacen');

  // 3.4 · PERSISTENCIA: se recarga la página y sigue marcado.
  await page.reload({ waitUntil: 'networkidle' });
  await panel(page, 'Material').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);
  check('Sigue marcado después de recargar la pantalla',
    await panel(page, 'Material')
      .locator('input[aria-label="Marcar Tramex 30×30 como preparado y cargado"]').isChecked());

  const textoMat2 = limpio(await panel(page, 'Material').innerText());
  check('El panel cuenta lo cargado y lo que queda',
    textoMat2.includes('1 material cargado') && textoMat2.includes('1 listo para cargar')
    && textoMat2.includes('1 pendiente de llegar'),
    textoMat2.split('\n').filter((l) => l.includes('cargad')).join(' | '));

  // Y se puede desmarcar.
  await panel(page, 'Material')
    .locator('input[aria-label="Marcar Tramex 30×30 como preparado y cargado"]').click();
  await page.waitForTimeout(800);
  check('Se puede desmarcar, y el material sigue entero',
    db.materials.find((m) => m.id === 'm1').prepared === false
    && db.materials.find((m) => m.id === 'm1').notes.includes('Estantería 3'),
    String(db.materials.find((m) => m.id === 'm1').prepared));

  // LA CORRECCIÓN: desmarcar «recibido» de algo preparado.
  await panel(page, 'Material')
    .locator('input[aria-label="Marcar Tubo 60×40 como preparado y cargado"]').click();
  await page.waitForTimeout(800);
  check('Se marca el pedido que ya llegó',
    db.materials.find((m) => m.id === 'm2').prepared === true);

  await panel(page, 'Material')
    .locator('input[aria-label="Marcar Tubo 60×40 como recibido"]').click();
  await page.waitForTimeout(900);
  check('Al desmarcar «recibido», la marca de cargado se limpia sola',
    db.materials.find((m) => m.id === 'm2').prepared === false
    && db.materials.find((m) => m.id === 'm2').received === false,
    `preparado=${db.materials.find((m) => m.id === 'm2').prepared} `
    + `recibido=${db.materials.find((m) => m.id === 'm2').received}`);

  check('Y la casilla de cargado queda apagada, porque vuelve a estar de camino',
    await panel(page, 'Material')
      .locator('input[aria-label="Marcar Tubo 60×40 como preparado y cargado"]').isDisabled());

  // 3.1 · CORREGIR EL COMENTARIO SIN SALIR DEL PROYECTO.
  await panel(page, 'Material').locator('button[aria-label="Editar Tramex 30×30"]').click();
  await page.locator('#mat-notes').waitFor({ timeout: 10000 });

  check('Se abre el formulario de siempre con el comentario puesto',
    (await page.locator('#mat-notes').inputValue()).includes('Quedan 6 planchas'),
    await page.locator('#mat-notes').inputValue());

  check('Y no deja cambiar de dónde sale el material desde aquí',
    (await page.locator('#mat-origin').count()) === 0);

  await page.locator('#mat-notes').fill('Estantería 3, pasillo B. Quedan 2 planchas.');
  await page.locator('button:has-text("Guardar")').last().click();
  await page.waitForTimeout(900);

  check('El comentario corregido se guarda y se ve en el panel',
    limpio(await panel(page, 'Material').innerText()).includes('Quedan 2 planchas.'),
    limpio(await panel(page, 'Material').innerText()).replace(/\n/g, ' | '));

  check('Y no se ha tocado nada más del material',
    db.materials.find((m) => m.id === 'm1').origin === 'almacen'
    && db.materials.find((m) => m.id === 'm1').units === 4
    && db.materials.find((m) => m.id === 'm1').received === true);

  // ============ MEJORA 4.1 · LA PASTILLA, ENTERA DE SU COLOR ============
  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.locator('.cal-grid').waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);

  const fondoDe = (sel) => page.locator(sel).first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const textoDe = (sel) => page.locator(sel).first()
    .evaluate((el) => getComputedStyle(el).color);

  const pastillaFab = '.cal-grid .cal-event[title^="Fabricación"]';
  const pastillaMont = '.cal-grid .cal-event[title^="Montaje"]';

  check('Hay pastillas de fabricación y de montaje en el mes',
    (await page.locator(pastillaFab).count()) >= 1
    && (await page.locator(pastillaMont).count()) >= 1,
    `fab ${await page.locator(pastillaFab).count()} · mont ${await page.locator(pastillaMont).count()}`);

  const fondoFab = await fondoDe(pastillaFab);
  const fondoMont = await fondoDe(pastillaMont);

  // El azul de fabricación es #1D4F91 → rgb(29, 79, 145).
  check('La pastilla entera se pinta del color de su categoría, no en gris',
    fondoFab === 'rgb(29, 79, 145)', fondoFab);

  check('Y montaje se pinta de otro color: se distinguen de un vistazo',
    fondoMont !== fondoFab && fondoMont === 'rgb(46, 125, 91)',
    `fab ${fondoFab} · mont ${fondoMont}`);

  check('El color de la pastilla es el mismo que el de su punto en la leyenda',
    fondoFab === await fondoDe('.cal-legend-item:has-text("Fabricación") .cal-dot'),
    `${fondoFab} · ${await fondoDe('.cal-legend-item:has-text("Fabricación") .cal-dot')}`);

  check('Sobre un fondo oscuro, el texto va en blanco',
    await textoDe(pastillaFab) === 'rgb(255, 255, 255)', await textoDe(pastillaFab));

  // No depende SOLO del color: la categoría va dicha en el «title» y en
  // un texto que leen los lectores de pantalla.
  check('La categoría va escrita, no solo pintada',
    (await page.locator(pastillaFab).first().getAttribute('title')).startsWith('Fabricación')
    && (await page.locator(`${pastillaFab} .sr-only`).first().innerText()).includes('Fabricación'),
    await page.locator(pastillaFab).first().getAttribute('title'));

  // ============ MEJORA 4.3 · FILTROS MÚLTIPLES ============
  const encendidas = async () => (await page.locator('.cal-legend-item[aria-pressed="true"]')
    .allInnerTexts()).map((t) => t.trim());

  check('Al abrir, fabricación y montaje están seleccionados',
    JSON.stringify(await encendidas()) === JSON.stringify(['Fabricación', 'Montaje']),
    (await encendidas()).join(' | '));

  // LO QUE SE PIDIÓ CON ESTAS PALABRAS: activar materiales sin
  // desactivar fabricación.
  await page.locator('.cal-legend-item:has-text("Material")').click();
  await page.waitForTimeout(700);
  check('Activar «Material» NO desactiva fabricación ni montaje',
    JSON.stringify(await encendidas()) === JSON.stringify(['Fabricación', 'Montaje', 'Material']),
    (await encendidas()).join(' | '));

  const rejilla = async () => page.locator('.cal-grid').innerText();
  check('Y se ven a la vez los eventos de las tres categorías',
    (await rejilla()).includes(`PROY-${YEAR}-009`)
    && (await rejilla()).includes('Chapa perforada'),
    (await rejilla()).replace(/\n/g, ' | ').slice(0, 220));

  await page.locator('.cal-legend-item:has-text("Otros")').click();
  await page.locator('.cal-legend-item:has-text("Visita")').click();
  await page.waitForTimeout(700);
  check('Se pueden activar varias más, simultáneamente',
    JSON.stringify(await encendidas())
      === JSON.stringify(['Fabricación', 'Montaje', 'Material', 'Visita', 'Otros']),
    (await encendidas()).join(' | '));

  check('Y la nota suelta aparece sin que desaparezca el proyecto',
    (await rejilla()).includes('Revisión de la plegadora')
    && (await rejilla()).includes(`PROY-${YEAR}-009`));

  // Ningún evento se duplica al combinar categorías.
  const codigos = await page.locator(`.cal-grid .cal-event[title^="Fabricación"]`).allInnerTexts();
  check('Ningún evento se duplica al combinar categorías',
    new Set(codigos).size === codigos.length, codigos.join(' | '));

  // Desmarcar una no modifica las demás.
  await page.locator('.cal-legend-item:has-text("Fabricación")').click();
  await page.waitForTimeout(700);
  check('Desmarcar fabricación no toca a las demás',
    JSON.stringify(await encendidas())
      === JSON.stringify(['Montaje', 'Material', 'Visita', 'Otros']),
    (await encendidas()).join(' | '));

  check('Y su pastilla desaparece, pero las otras siguen',
    (await page.locator(pastillaFab).count()) === 0
    && (await page.locator(pastillaMont).count()) >= 1);

  // Se puede dejar una sola.
  for (const k of ['Montaje', 'Material', 'Visita']) {
    await page.locator(`.cal-legend-item:has-text("${k}")`).click();
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(500);
  check('Se puede dejar una sola categoría seleccionada',
    JSON.stringify(await encendidas()) === JSON.stringify(['Otros']),
    (await encendidas()).join(' | '));

  // Y apagarlas todas: se explica, y hay botón para volver.
  await page.locator('.cal-legend-item:has-text("Otros")').click();
  await page.waitForTimeout(600);
  check('Apagarlas todas se permite y se explica, en vez de no responder',
    (await encendidas()).length === 0
    && (await page.locator('.cal-vacio').innerText()).includes('ninguna categoría'),
    (await page.locator('.cal-vacio').count()) ? await page.locator('.cal-vacio').innerText() : 'sin aviso');

  await page.locator('.cal-vacio button').click();
  await page.waitForTimeout(700);
  check('Y el botón devuelve fabricación y montaje',
    JSON.stringify(await encendidas()) === JSON.stringify(['Fabricación', 'Montaje']),
    (await encendidas()).join(' | '));

  // Los filtros se conservan al cambiar de fecha y de vista.
  await page.locator('.cal-legend-item:has-text("Material")').click();
  await page.waitForTimeout(400);
  await page.locator('.cal-toolbar button[aria-label="Siguiente"]').click();
  await page.waitForTimeout(700);
  check('Los filtros se mantienen al cambiar de mes',
    JSON.stringify(await encendidas()) === JSON.stringify(['Fabricación', 'Montaje', 'Material']),
    (await encendidas()).join(' | '));
  await page.locator('.chip:has-text("Semana")').click();
  await page.waitForTimeout(700);
  check('Y al cambiar de vista',
    JSON.stringify(await encendidas()) === JSON.stringify(['Fabricación', 'Montaje', 'Material']),
    (await encendidas()).join(' | '));

  // ============ MEJORA 4.2 · ELEGIR LOS COLORES ============
  await page.goto(`http://localhost:${PORT}/#/admin/configuracion`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('.tabs button:has-text("Planificación")').click();
  await page.waitForTimeout(800);

  const panelColores = panelCon(page, 'Colores del calendario');
  check('Configuración tiene una sección para los colores del calendario',
    (await panelColores.count()) === 1);

  check('Con las siete categorías que existen de verdad',
    (await panelColores.locator('input[type="color"]').count()) === 7,
    String(await panelColores.locator('input[type="color"]').count()));

  const textoColores = limpio(await panelColores.innerText());
  check('Y están las que pedía el encargo, con sus nombres',
    ['Fabricación', 'Montaje', 'Material', 'Obras', 'Visita', 'Aviso', 'Otros']
      .every((n) => textoColores.includes(n)),
    textoColores.replace(/\n/g, ' | '));

  check('De entrada están los colores de siempre',
    textoColores.includes('los colores de siempre'), textoColores.replace(/\n/g, ' | '));

  // Se cambia fabricación a un AMARILLO: el caso que obliga a calcular
  // el color del texto, porque encima de un amarillo el blanco no se lee.
  await panelColores.locator('input[aria-label="Color de Fabricación en texto"]')
    .fill('#ffd400');
  await page.waitForTimeout(400);

  const muestra = panelColores.locator('.color-item', { has: page.locator('label:text-is("Fabricación")') })
    .locator('.color-muestra');
  check('La muestra se pinta del color elegido',
    (await muestra.evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(255, 212, 0)',
    await muestra.evaluate((el) => getComputedStyle(el).backgroundColor));

  check('Y con un amarillo el texto pasa a oscuro, no se queda en blanco',
    (await muestra.evaluate((el) => getComputedStyle(el).color)) === 'rgb(26, 36, 51)',
    await muestra.evaluate((el) => getComputedStyle(el).color));

  await panelColores.locator('button:has-text("Guardar los colores")').click();
  await page.waitForTimeout(900);

  check('Se guarda en la configuración compartida, no en el navegador',
    db.settings.calendar_colors.fabricacion === '#ffd400',
    JSON.stringify(db.settings.calendar_colors));

  check('Y solo se guarda lo cambiado: los demás siguen siendo los de serie',
    Object.keys(db.settings.calendar_colors).length === 1,
    JSON.stringify(db.settings.calendar_colors));

  // Y ahora el calendario lo usa. Se vuelve a entrar para que la
  // configuración llegue como llega de verdad: con la sesión.
  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.cal-grid').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1000);

  check('El calendario pinta la fabricación con el color elegido',
    (await fondoDe(pastillaFab)) === 'rgb(255, 212, 0)', await fondoDe(pastillaFab));

  check('Con el texto oscuro, que es el que se lee encima del amarillo',
    (await textoDe(pastillaFab)) === 'rgb(26, 36, 51)', await textoDe(pastillaFab));

  check('Y montaje sigue con el suyo: solo cambió el que se cambió',
    (await fondoDe(pastillaMont)) === 'rgb(46, 125, 91)', await fondoDe(pastillaMont));

  // Un color ilegible se avisa, sin impedirlo.
  await page.goto(`http://localhost:${PORT}/#/admin/configuracion`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('.tabs button:has-text("Planificación")').click();
  await page.waitForTimeout(800);
  await panelCon(page, 'Colores del calendario')
    .locator('input[aria-label="Color de Montaje en texto"]').fill('#808080');
  await page.waitForTimeout(400);
  check('Avisa de un color con el que el texto no se leerá bien',
    limpio(await panelCon(page, 'Colores del calendario').innerText())
      .includes('se lee con dificultad'),
    limpio(await panelCon(page, 'Colores del calendario').innerText()).replace(/\n/g, ' | '));

  // Y se puede volver a los de siempre.
  await panelCon(page, 'Colores del calendario')
    .locator('button:has-text("Volver a los de siempre")').click();
  await page.waitForTimeout(400);
  await panelCon(page, 'Colores del calendario')
    .locator('button:has-text("Guardar los colores")').click();
  await page.waitForTimeout(900);
  check('Se puede volver a los colores de siempre',
    Object.keys(db.settings.calendar_colors).length === 0,
    JSON.stringify(db.settings.calendar_colors));

  // ============ MEJORA 5.2 + CALENDARIO MÓVIL · TRES ANCHOS ============
  //
  // Antes esto se comprobaba solo a 390 px. Ahora se repite a 320, 360 y
  // 390, que son el móvil pequeño de verdad, el corriente y el grande,
  // porque el arreglo del nombre visible depende del ancho de la columna
  // y a 320 una columna del mes mide unos 45 píxeles.
  //
  // Lo que se mide en cada ancho es lo mismo: que el nombre SE LEA, que
  // no haya solapamientos, que ninguna pastilla se salga de su semana y
  // que no aparezca barra horizontal. Todo en píxeles, no a ojo.
  const erroresMovil = [];
  let chico = null;

  for (const ancho of [320, 360, 390]) {
    const movil = await browser.newContext({
      viewport: { width: ancho, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
    });
    await stubSupabase(movil, { db });
    const pag = await movil.newPage();
    pag.on('pageerror', (e) => erroresMovil.push(`error de programación (${ancho}px): ${e.message}`));
    await signIn(pag, PORT, ADMIN.username);

    await pag.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
    await pag.locator('.cal-grid').waitFor({ timeout: 15000 });
    // Se encienden TODAS las categorías: es el caso que se solapaba, con
    // varios carriles en la misma semana.
    for (const k of ['Material', 'Visita', 'Aviso', 'Otros', 'Obras']) {
      await pag.locator(`.cal-legend-item:has-text("${k}")`).click();
      await pag.waitForTimeout(150);
    }
    await pag.waitForTimeout(900);

    /*
      LO QUE SE VENÍA A ARREGLAR: la barra se veía de color pero no decía
      de qué era. Se mide que el texto está PINTADO —no solo en el
      HTML— y que ocupa alto de verdad: un «display: none» da cero.
    */
    const textos = await pag.locator('.cal-grid .cal-event-text').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { texto: (el.textContent ?? '').trim(), alto: r.height, ancho: r.width,
                 oculto: cs.display === 'none' || cs.visibility === 'hidden' };
      }));

    check(`A ${ancho}px el nombre del evento se PINTA en el calendario del mes`,
      textos.length > 0 && textos.every((t) => !t.oculto && t.alto > 0 && t.ancho > 0),
      `${textos.length} pastillas · ocultas: ${textos.filter((t) => t.oculto).length}`
      + ` · sin alto: ${textos.filter((t) => t.alto <= 0).length}`);

    check(`A ${ancho}px el nombre dice algo, no es una barra vacía`,
      textos.length > 0 && textos.every((t) => t.texto.length > 0),
      textos.slice(0, 3).map((t) => `«${t.texto}»`).join(' · '));

    // Y el nombre completo sigue estando donde siempre, para cuando el
    // ancho no dé para enseñarlo entero.
    check(`A ${ancho}px el nombre completo sigue en el «title» de la pastilla`,
      (await pag.locator('.cal-grid .cal-event[title]').count())
        === (await pag.locator('.cal-grid .cal-event').count()));

    const desborda = await pag.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check(`A ${ancho}px el calendario no saca barra de desplazamiento horizontal`,
      !desborda,
      `scrollWidth ${await pag.evaluate(() => document.documentElement.scrollWidth)} · `
      + `clientWidth ${await pag.evaluate(() => document.documentElement.clientWidth)}`);

    /*
      NINGUNA pastilla se monta encima de otra. Dos pastillas de la misma
      semana están en carriles distintos o en columnas distintas, así que
      cualquier intersección real es un solapamiento.
    */
    const solapes = await pag.locator('.cal-grid .cal-event').evaluateAll((els) => {
      const cajas = els.map((el) => {
        const r = el.getBoundingClientRect();
        return { t: el.getAttribute('title') ?? '', x: r.x, y: r.y, r: r.right, b: r.bottom };
      }).filter((c) => c.r > c.x && c.b > c.y);
      const malos = [];
      for (let i = 0; i < cajas.length; i++) {
        for (let j = i + 1; j < cajas.length; j++) {
          const a = cajas[i];
          const b = cajas[j];
          // Se deja 1 px de tolerancia: los bordes pueden compartir línea.
          const cruzaX = Math.min(a.r, b.r) - Math.max(a.x, b.x) > 1;
          const cruzaY = Math.min(a.b, b.b) - Math.max(a.y, b.y) > 1;
          if (cruzaX && cruzaY) malos.push(`${a.t} ↔ ${b.t}`);
        }
      }
      return malos;
    });
    check(`A ${ancho}px ninguna pastilla se solapa con otra, medido en píxeles`,
      solapes.length === 0, solapes.slice(0, 4).join(' | '));

    // Las pastillas tampoco se salen de su semana, que es por donde se
    // colaban encima de los números de los días de la semana siguiente.
    const fugadas = await pag.evaluate(() => {
      const malas = [];
      document.querySelectorAll('.cal-semana').forEach((sem) => {
        const caja = sem.getBoundingClientRect();
        sem.querySelectorAll('.cal-event').forEach((ev) => {
          const r = ev.getBoundingClientRect();
          if (r.top < caja.top - 1 || r.bottom > caja.bottom + 1) {
            malas.push(`${ev.getAttribute('title') ?? ''} (${Math.round(r.top)}–${Math.round(r.bottom)} fuera de ${Math.round(caja.top)}–${Math.round(caja.bottom)})`);
          }
        });
      });
      return malas;
    });
    check(`A ${ancho}px ninguna se sale de la semana a la que pertenece`,
      fugadas.length === 0, fugadas.slice(0, 3).join(' | '));

    // Un tramo de varios días sigue siendo UNA barra que cruza columnas,
    // no una pastilla por día.
    const anchoPastilla = await pag.locator('.cal-grid .cal-event[title^="Montaje"]').first()
      .evaluate((el) => el.getBoundingClientRect().width);
    const anchoColumna = await pag.locator('.cal-grid .cal-day').first()
      .evaluate((el) => el.getBoundingClientRect().width);
    check(`A ${ancho}px un evento de varios días sigue siendo UNA barra larga`,
      anchoPastilla > anchoColumna * 1.5,
      `pastilla ${Math.round(anchoPastilla)}px · columna ${Math.round(anchoColumna)}px`);

    check(`A ${ancho}px los colores por categoría se mantienen`,
      (await pag.locator('.cal-grid .cal-event[title^="Montaje"]').first()
        .evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(46, 125, 91)');

    if (ancho === 390) {
      // La vista de día también enseña los títulos, y es la que se usa
      // para leer el nombre entero de un vistazo.
      await pag.locator('.chip:has-text("Día")').click();
      await pag.waitForTimeout(800);
      check('En la vista de día del móvil se leen los títulos',
        (await pag.locator('.cal-day-single').innerText()).includes(`PROY-${YEAR}-009`),
        limpio(await pag.locator('.cal-day-single').innerText()).replace(/\n/g, ' | ').slice(0, 160));
      // Esta página se reutiliza para la prueba del historial de abajo.
      chico = pag;
    } else {
      await movil.close();
    }
  }
  // ============ MEJORA 5.1 · EL HISTORIAL, AL FINAL EN EL MÓVIL ============
  await chico.goto(`http://localhost:${PORT}/#/admin/proyectos/pm`, { waitUntil: 'networkidle' });
  await chico.locator('.panel-historial').waitFor({ timeout: 15000 });
  await chico.waitForTimeout(900);

  const posiciones = await chico.evaluate(() => {
    const y = (sel) => {
      const el = document.querySelector(sel);
      return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : -1;
    };
    const porTitulo = (titulo) => {
      const h = [...document.querySelectorAll('.panel .panel-head h2')]
        .find((x) => x.textContent.trim() === titulo);
      return h ? Math.round(h.closest('.panel').getBoundingClientRect().top + window.scrollY) : -1;
    };
    return {
      historial: y('.panel-historial'),
      material: porTitulo('Material'),
      cobros: porTitulo('Cobros'),
      situacion: porTitulo('Situación · Fabricación'),
      alto: document.body.scrollHeight,
    };
  });

  check('En el móvil el historial queda DESPUÉS del material y de los cobros',
    posiciones.historial > posiciones.material && posiciones.historial > posiciones.cobros,
    JSON.stringify(posiciones));

  check('Y la información operativa del proyecto sigue estando primero',
    posiciones.situacion < posiciones.material,
    JSON.stringify(posiciones));

  check('El historial sigue completo, no se ha escondido',
    (await chico.locator('.panel-historial').innerText()).length > 40
    && await chico.locator('.panel-historial').isVisible());

  const desbordaProy = await chico.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check('Y la ficha del proyecto tampoco saca barra horizontal en el móvil',
    !desbordaProy,
    `scrollWidth ${await chico.evaluate(() => document.documentElement.scrollWidth)}`);

  // En escritorio NO cambia: el historial sigue en su columna, antes de
  // los cobros, que es lo que se pidió no tocar.
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/pm`, { waitUntil: 'networkidle' });
  await page.locator('.panel-historial').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const dosColumnas = await page.evaluate(() => {
    const h = document.querySelector('.panel-historial').getBoundingClientRect();
    const titulos = [...document.querySelectorAll('.panel .panel-head h2')];
    const cobros = titulos.find((x) => x.textContent.trim() === 'Cobros');
    const c = cobros.closest('.panel').getBoundingClientRect();
    // En dos columnas, el historial está a la IZQUIERDA de los cobros.
    return { izquierda: h.left < c.left, hist: Math.round(h.left), cobros: Math.round(c.left) };
  });
  check('En escritorio el historial sigue en su columna, como siempre',
    dosColumnas.izquierda, JSON.stringify(dosColumnas));

  check('Ni un error de programación en las pantallas del móvil',
    erroresMovil.length === 0, erroresMovil.join(' | '));

  // ============ NADA SE HA ROTO ============
  check('Ni un error de programación en toda la prueba',
    errores.length === 0, errores.join(' | '));
  check('Ni un error en la consola del navegador',
    consola.length === 0, consola.join(' | '));

  report('MEJORAS · CONVERSIÓN Y VISITAS TÉCNICAS');
} finally {
  await browser.close();
  server.close();
}
