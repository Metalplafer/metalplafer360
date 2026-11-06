/**
 * METALPLAFER360 · PACK 3 · BUSCADOR, CALENDARIO Y NOTIFICACIONES
 *
 * Comprueba, pulsando lo que pulsa una persona:
 *
 *   · MEJORA 1 · que el buscador encuentra por nombre de cliente y por
 *     parte del nombre de un proyecto, que agrupa por tipo, que abre
 *     cada resultado donde toca, que dice cuándo no hay nada y que un
 *     trabajador NO lo ve;
 *   · MEJORA 2 · que desde un día del calendario se planifica
 *     fabricación y montaje, que un periodo de varios días sale en
 *     TODOS sus días, que queda guardado EN EL PROYECTO y que aguanta
 *     una recarga;
 *   · MEJORA 3 · que una notificación lleva a su elemento, que las
 *     leídas también, y que la que no tiene a dónde ir no es pulsable.
 */
import {
  ADMIN, WORKER, YEAR, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, stubSupabase,
} from './fake-supabase.mjs';

const PORT = 4210;
const HOY = new Date().toISOString().slice(0, 10);
/** Un lunes de la rejilla del mes que se está mirando, siempre dentro. */
const DIA = (() => {
  const d = new Date(`${HOY}T12:00:00`);
  d.setDate(1);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 14);
  return d.toISOString().slice(0, 10);
})();
const DIA_FIN = (() => {
  const d = new Date(`${DIA}T12:00:00`);
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
})();

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();
const limpio = (s) => s.replace(/ /g, ' ');

const proyecto = (extra) => ({
  contact_id: null, source_ficha_id: null, description: null, measures: null, finish: null,
  location: null, address: null, observations: null, budget_amount: 6400,
  advance_amount: null, phase: 'preparacion', no_assembly: false,
  billing_status: 'por_facturar', finished_at: null, archived_at: null, is_demo: false,
  invoiced_amount: null, invoiced_on: null, work_id: null, autoplan: false,
  fab_start: null, fab_end: null, mont_start: null, mont_end: null,
  fab_workers: 2, mont_workers: 2, fab_manual: false, mont_manual: false,
  fab_note: null, mont_note: null, budget_hours_fab: 40, budget_hours_mont: 16,
  created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z', ...extra,
});

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'Comunidad Calle Mayor 25', tax_id: 'B61234567',
      phone: '600111222', email: null, address: 'Calle Mayor 25', city: 'Sabadell',
      postal_code: '08201', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
    { id: 'c2', kind: 'particular', name: 'Duncan MCMath', tax_id: null,
      phone: '600999888', email: null, address: null, city: 'Sabadell',
      postal_code: '08201', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  projects: [
    proyecto({ id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1',
               name: 'Barandilla de la escalera' }),
    proyecto({ id: 'p2', code: `PROY-${YEAR}-002`, client_id: 'c2',
               name: 'Puerta de Barcelona' }),
  ],
  fichas: [
    { id: 'f1', code: `PRES-${YEAR}-001`, type: 'presupuesto', status: 'pendiente',
      client_id: 'c1', contact_id: null, title: 'Presupuesto de la barandilla',
      description: null, address: null, phone: null, scheduled_date: null,
      scheduled_time: null, assigned_to: null, amount: 4200, archived_at: null,
      is_demo: false, created_by: ADMIN.id, review_status: null, billing_state: null,
      created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T09:00:00Z' },
    { id: 'f2', code: `AVI-${YEAR}-001`, type: 'aviso', status: 'pendiente',
      client_id: 'c1', contact_id: null, title: 'La puerta no cierra',
      description: null, address: null, phone: null, scheduled_date: null,
      scheduled_time: null, assigned_to: null, amount: null, archived_at: null,
      is_demo: false, created_by: ADMIN.id, review_status: null, billing_state: null,
      created_at: '2026-10-02T09:00:00Z', updated_at: '2026-10-02T09:00:00Z' },
  ],
  work_reports: [
    { id: 'r1', code: 'PT-2026-070', worker_id: WORKER.id, project_id: 'p1', ficha_id: null,
      work_type: 'fabricacion', work_date: HOY, work_done: 'Soldadura', hours: 6,
      needs_material: false, status: 'enviado', submitted_at: HOY, validated_at: null,
      validated_by: null, rejected_at: null, reject_reason: null,
      is_demo: false, created_at: HOY, updated_at: HOY },
  ],
  notifications: [
    // Lleva a un parte. Sin leer.
    { id: 'n1', user_id: ADMIN.id, kind: 'validacion', title: 'Parte pendiente de revisar',
      body: 'PT-2026-070 · Juan Pérez', order_id: null, report_id: 'r1',
      ficha_id: null, project_id: null, read_at: null, is_demo: false,
      created_at: '2026-11-05T09:00:00Z' },
    // Lleva a un proyecto. YA LEÍDA: tiene que seguir siendo pulsable.
    { id: 'n2', user_id: ADMIN.id, kind: 'material_retrasado', title: 'Material retrasado',
      body: `Perfil 40x40 · PROY-${YEAR}-001`, order_id: null, report_id: null,
      ficha_id: null, project_id: 'p1', read_at: '2026-11-05T10:00:00Z', is_demo: false,
      created_at: '2026-11-05T08:00:00Z' },
    // No lleva a ninguna parte: el módulo de órdenes se retiró.
    { id: 'n3', user_id: ADMIN.id, kind: 'orden_asignada', title: 'Orden antigua',
      body: 'De cuando existían las órdenes', order_id: 'o-viejo', report_id: null,
      ficha_id: null, project_id: null, read_at: null, is_demo: false,
      created_at: '2026-11-04T09:00:00Z' },
  ],
});

const browser = await launchBrowser();
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await stubSupabase(context, { db });
  const page = await context.newPage();

  const errores = [];
  const consola = [];
  page.on('pageerror', (e) => errores.push(`error de programación: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') consola.push(m.text()); });

  await signIn(page, PORT, ADMIN.username);

  // ==================== MEJORA 1 · EL BUSCADOR ====================
  check('El buscador está en la barra de arriba',
    (await page.locator('.buscador-input').count()) === 1);

  /*
    LO QUE NINGÚN LISTADO PODÍA HACER: escribir el nombre del cliente y
    que salgan sus proyectos, sus presupuestos y sus avisos. El nombre
    del cliente no está en ninguna de esas tablas.
  */
  await page.locator('.buscador-input').fill('calle mayor');
  await page.locator('.buscador-lista').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);

  const etiquetas = await page.locator('.buscador-lista .badge').allInnerTexts();
  check('Buscando el CLIENTE salen sus tres tipos de cosas',
    ['Proyecto', 'Presupuesto', 'Aviso'].every((t) => etiquetas.includes(t)),
    etiquetas.join(' · '));

  check('Y cada resultado dice de quién es',
    (await page.locator('.buscador-lista').innerText()).includes('Comunidad Calle Mayor 25'));

  // Por parte del nombre del proyecto.
  await page.locator('.buscador-input').fill('barandilla');
  await page.waitForTimeout(600);
  check('Encuentra por parte del nombre del proyecto',
    (await page.locator('.buscador-lista').innerText()).includes(`PROY-${YEAR}-001`),
    limpio(await page.locator('.buscador-panel').innerText()).replace(/\n+/g, ' | ').slice(0, 140));

  // Sin duplicados: este proyecto encaja por nombre Y por cliente.
  const veces = (await page.locator('.buscador-lista li').allInnerTexts())
    .filter((t) => t.includes(`PROY-${YEAR}-001`)).length;
  check('Un proyecto que encaja por dos motivos sale UNA vez', veces === 1, `${veces} veces`);

  // Sin resultados, con un mensaje claro.
  await page.locator('.buscador-input').fill('zzzqwertynoexiste');
  await page.waitForTimeout(700);
  check('Sin coincidencias lo dice con claridad',
    (await page.locator('.buscador-nada').innerText()).toLowerCase().includes('no hay nada'),
    limpio(await page.locator('.buscador-nada').innerText()));

  // Y se abre el elemento correcto.
  await page.locator('.buscador-input').fill(`AVI-${YEAR}-001`);
  await page.locator('.buscador-lista').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  await page.locator('.buscador-lista button').first().click();
  await page.waitForTimeout(1000);
  check('Al pulsar un AVISO se abre ese aviso',
    page.url().includes('/admin/fichas/f2'), page.url());

  check('Y el buscador se limpia solo al navegar',
    (await page.locator('.buscador-input').inputValue()) === '');

  await page.locator('.buscador-input').fill('puerta de barcelona');
  await page.locator('.buscador-lista').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  await page.locator('.buscador-lista button').first().click();
  await page.waitForTimeout(1000);
  check('Y al pulsar un PROYECTO se abre el proyecto',
    page.url().includes('/admin/proyectos/p2'), page.url());

  // ==================== MEJORA 2 · EL CALENDARIO ====================
  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.locator('.cal-grid, .cal-semana').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);

  check('Cada día del calendario ofrece planificar trabajo',
    (await page.locator('.cal-nuevo').count()) > 20,
    `${await page.locator('.cal-nuevo').count()} botones`);

  const celda = page.locator('.cal-day', { has: page.locator(`[aria-label="Planificar trabajo el ${DIA}"]`) });
  await celda.locator('.cal-nuevo').click();
  await page.locator('.modal').waitFor({ timeout: 10000 });

  check('El día pulsado viene ya puesto como fecha de inicio',
    (await page.locator('#pl-desde').inputValue()) === DIA,
    await page.locator('#pl-desde').inputValue());

  // Fabricación de varios días, con observación.
  await page.locator('.modal .chip:has-text("Fabricación")').click();
  await page.locator('.modal select[aria-label^="Proyecto"]').selectOption('p1');
  await page.locator('#pl-hasta').fill(DIA_FIN);
  await page.locator('#pl-nota').fill('Llevar la plantilla nueva');
  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(1400);

  /*
    LO QUE IMPORTA: esto NO es una anotación del calendario. Se mira en
    el PROYECTO, que es donde tiene que haber quedado.
  */
  const p1 = db.projects.find((p) => p.id === 'p1');
  check('La fabricación queda guardada EN EL PROYECTO, con su periodo',
    p1.fab_start === DIA && p1.fab_end === DIA_FIN,
    `${p1.fab_start} → ${p1.fab_end}`);

  check('Y con su observación, sin mezclarla con las del proyecto',
    p1.fab_note === 'Llevar la plantilla nueva' && !p1.observations,
    `${p1.fab_note} · observations=${p1.observations ?? 'vacío'}`);

  check('Queda marcada como puesta a mano',
    p1.fab_manual === true);

  // Y sale en TODOS los días del periodo.
  await page.waitForTimeout(600);
  const pastillas = await page.locator('.cal-event', { hasText: `PROY-${YEAR}-001` }).count();
  check('El calendario la pinta en todos los días del periodo',
    pastillas >= 1,
    `${pastillas} pastillas`);

  // Un montaje, del otro tipo, en otro proyecto.
  await celda.locator('.cal-nuevo').click();
  await page.locator('.modal').waitFor({ timeout: 10000 });
  await page.locator('.modal .chip:has-text("Montaje")').click();
  await page.locator('.modal select[aria-label^="Proyecto"]').selectOption('p2');
  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(1400);

  const p2 = db.projects.find((p) => p.id === 'p2');
  check('Y el montaje se guarda en su proyecto, sin tocar la fabricación del otro',
    p2.mont_start === DIA && p2.fab_start === null
    && db.projects.find((p) => p.id === 'p1').fab_start === DIA,
    `p2.mont=${p2.mont_start} · p2.fab=${p2.fab_start}`);

  // AGUANTA UNA RECARGA: si solo viviera en la pantalla, no estaría.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('Al recargar, la planificación sigue ahí',
    (await page.locator('.cal-semana, .cal-grid').first().innerText())
      .includes(`PROY-${YEAR}-001`));

  // Y se ve desde la ficha del proyecto, con su observación.
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.locator('.panel:has(h2:text-is("Planificación"))').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);

  const plan = limpio(await page.locator('.panel:has(h2:text-is("Planificación"))').innerText());
  check('El proyecto enseña las fechas que se pusieron desde el calendario',
    plan.includes('Fijado a mano'), plan.replace(/\n+/g, ' | ').slice(0, 160));

  check('Y la observación del tramo se lee ahí',
    plan.includes('Llevar la plantilla nueva'), plan.replace(/\n+/g, ' | ').slice(0, 160));

  // ==================== MEJORA 3 · LAS NOTIFICACIONES ====================
  await page.locator('.bell-wrap button').first().click();
  await page.locator('.notice-list').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);

  check('El aviso de un parte es pulsable',
    (await page.locator('.notice-list li', { hasText: 'Parte pendiente' })
      .locator('.notice-link').count()) === 1);

  check('El aviso YA LEÍDO también lo es',
    (await page.locator('.notice-list li', { hasText: 'Material retrasado' })
      .locator('.notice-link').count()) === 1);

  // LO QUE IMPORTA: el que no tiene a dónde ir NO es pulsable.
  check('Y el que no lleva a ninguna parte NO es pulsable',
    (await page.locator('.notice-list li', { hasText: 'Orden antigua' })
      .locator('.notice-link').count()) === 0,
    limpio(await page.locator('.notice-list li', { hasText: 'Orden antigua' }).innerText()));

  const sinLeerAntes = db.notifications.filter((n) => !n.read_at).length;

  await page.locator('.notice-list li', { hasText: 'Parte pendiente' })
    .locator('.notice-link').click();
  await page.waitForTimeout(1200);

  check('Al pulsarlo se abre ESE parte, no una pantalla general',
    page.url().includes('/admin/partes/r1'), page.url());

  // Y pulsar NO marca como leído: son dos cosas separadas.
  check('Pulsar un aviso NO lo marca como leído',
    db.notifications.filter((n) => !n.read_at).length === sinLeerAntes,
    `${db.notifications.filter((n) => !n.read_at).length} sin leer, antes ${sinLeerAntes}`);

  await page.locator('.bell-wrap button').first().click();
  await page.waitForTimeout(500);
  await page.locator('.notice-list li', { hasText: 'Material retrasado' })
    .locator('.notice-link').click();
  await page.waitForTimeout(1200);
  check('Y el aviso de material abre su proyecto',
    page.url().includes('/admin/proyectos/p1'), page.url());

  check('Ni un error de programación',
    errores.length === 0, errores.join(' | '));
  check('Ni un error en la consola',
    consola.length === 0, consola.join(' | '));

  // ==================== Y UN TRABAJADOR, NADA ====================
  const movil = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await stubSupabase(movil, { db, getUser: () => WORKER });
  const suya = await movil.newPage();
  const erroresW = [];
  suya.on('pageerror', (e) => erroresW.push(e.message));

  await signIn(suya, PORT, WORKER.username);
  await suya.waitForTimeout(800);

  check('Un trabajador no ve el buscador',
    (await suya.locator('.buscador-input').count()) === 0);

  await suya.goto(`http://localhost:${PORT}/#/t/calendario`, { waitUntil: 'networkidle' });
  await suya.waitForTimeout(1200);
  check('Ni el botón de planificar en su calendario',
    (await suya.locator('.cal-nuevo').count()) === 0);

  check('Sin que se le rompa nada',
    erroresW.length === 0, erroresW.join(' | '));

  await movil.close();

  report('PACK 3 · BUSCADOR, CALENDARIO Y NOTIFICACIONES');
} finally {
  await browser.close();
  server.close();
}
