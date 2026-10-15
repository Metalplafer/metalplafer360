/**
 * METALPLAFER360 · PARTES COMPARTIDOS · EN NAVEGADOR REAL
 *
 *   npm run test:compartidos
 *
 * Comprueba en un navegador de verdad, pulsando lo que pulsa una persona:
 *
 *   · que un parte puede ser de uno o de VARIOS, y que si es de varios
 *     sigue siendo UN trabajo con las horas de cada uno;
 *   · que el selector SOLO ofrece a quien está asignado al mismo
 *     proyecto, y que el autor no se ofrece a sí mismo;
 *   · que las horas-persona del trabajo se ven mientras se escriben;
 *   · que quien estuvo en el trabajo puede ABRIR el parte y ver sus
 *     fotografías, y que quien no estuvo no lo ve siquiera;
 *   · que quien estuvo NO puede editar el parte: eso sigue siendo del
 *     autor;
 *   · que un parte suelto dice por qué todavía no se puede compartir;
 *   · que administración ve el reparto y el total al validar;
 *   · que un parte validado ya no cambia de reparto;
 *   · que el panel y los informes cuentan las horas de TODOS.
 *
 * Las reglas de verdad se prueban contra PostgreSQL en
 * tests/sql/91_tests_horas.sql. Aquí se comprueba la PANTALLA.
 */
import {
  ADMIN, WORKER, YEAR, buildApp, createChecker, createDb, diaLaborable,
  launchBrowser, serveApp, signIn, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4196;
const HOY = today();
const LABORABLE = diaLaborable(HOY);

/** Pedro va al mismo proyecto que Juan. Ana no: es la que no debe salir. */
const PEDRO = {
  ...WORKER, id: '33333333-3333-4333-8333-333333333333',
  full_name: 'Pedro Navarro', username: 'pedro', email: 'pedro@metalplafer.com',
};
const ANA = {
  ...WORKER, id: '44444444-4444-4444-8444-444444444444',
  full_name: 'Ana Ferrer', username: 'ana', email: 'ana@metalplafer.com',
};

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();
const limpio = (s) => s.replace(/ /g, ' ');

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
      // LAS HORAS PRESUPUESTADAS. Las pone administración y no las toca
      // nadie más: se comprueba abajo que registrar horas reales no las
      // mueve.
      budget_hours_fab: 20, budget_hours_mont: 10,
      phase: 'montaje', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: false,
      fab_start: LABORABLE, fab_end: LABORABLE, mont_start: LABORABLE, mont_end: LABORABLE,
      fab_workers: 2, mont_workers: 2, fab_manual: true, mont_manual: false, autoplan: true,
      work_id: null, invoiced_amount: null, invoiced_on: null,
      created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z' },
  ],
  project_workers: [
    { project_id: 'p1', worker_id: WORKER.id, assigned_at: '2026-05-05T09:00:00Z',
      assigned_by: ADMIN.id, is_demo: false },
    { project_id: 'p1', worker_id: PEDRO.id, assigned_at: '2026-05-05T09:00:00Z',
      assigned_by: ADMIN.id, is_demo: false },
  ],
  counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 1, OT: 0, PT: 0, OBRA: 0 },
});

const people = [ADMIN, WORKER, PEDRO, ANA];
const browser = await launchBrowser();

try {
  // ===================================================================
  // JUAN · rellena el parte y dice con quién ha ido
  // ===================================================================
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(mctx, { db, getUser: () => WORKER, people });
  const m = await mctx.newPage();
  const errores = [];
  m.on('pageerror', (e) => errores.push(String(e)));

  await signIn(m, PORT, 'juan');
  await m.goto(`http://localhost:${PORT}/#/t/partes/nuevo?proyecto=p1`,
    { waitUntil: 'networkidle' });
  await m.waitForTimeout(1200);

  check('En un parte nuevo todavía no se pregunta con quién se ha hecho',
    await m.locator('h3:has-text("¿Con quién lo has hecho?")').count() === 0);

  await m.locator('button:has-text("Montaje")').click();
  await m.locator('#pt-done').fill('Montaje de los tres tramos. Fuimos Pedro y yo.');
  await m.locator('#pt-hours').fill('3');
  await m.locator('button:has-text("Guardar")').first().click();
  await m.waitForTimeout(1600);

  const parte = db.work_reports[0];
  check('El parte se guarda con las horas del autor', Number(parte?.hours) === 3,
    String(parte?.hours));

  // ---------------- CON QUIÉN ----------------
  const panel = m.locator('.w-block:has(h3:has-text("¿Con quién lo has hecho?"))');
  check('Ya guardado, la pantalla pregunta con quién se ha hecho',
    await panel.count() === 1);

  const ofrecidos = limpio(await panel.innerText());
  check('Ofrece a quien está en el mismo proyecto',
    ofrecidos.includes('Pedro Navarro'), ofrecidos.replace(/\n/g, ' | '));
  check('NO ofrece a quien no está asignado al proyecto',
    !ofrecidos.includes('Ana Ferrer'), ofrecidos.replace(/\n/g, ' | '));
  check('Ni al propio autor, que ya cuenta con sus horas',
    !ofrecidos.includes('Juan Ortega'), ofrecidos.replace(/\n/g, ' | '));

  await panel.locator('label:has-text("Pedro Navarro") input[type="checkbox"]').check();
  await m.waitForTimeout(500);

  const horasPedro = panel.locator('input[aria-label="Horas de Pedro Navarro"]');
  check('Al marcarlo aparece su casilla de horas, con las mías propuestas',
    (await horasPedro.inputValue()) === '3', await horasPedro.inputValue());

  // SIN HORAS NO SE GUARDA. Un acompañante sin horas no es un
  // acompañante: es un nombre marcado por error. Se dice aquí, con su
  // nombre, en lugar de dejar que lo rechace la base de datos con otras
  // palabras.
  await horasPedro.fill('');
  await panel.locator('button:has-text("Guardar quién ha venido")').click();
  await m.waitForTimeout(900);
  check('No se guarda un acompañante sin horas, y se dice de quién',
    (await m.locator('.toast').last().innerText()).includes('Pedro Navarro'),
    await m.locator('.toast').last().innerText());
  check('Y no se ha guardado nada al intentarlo',
    db.work_report_workers.length === 0, JSON.stringify(db.work_report_workers));

  await horasPedro.fill('3');
  await m.waitForTimeout(400);
  check('Y se ve el total de horas-persona del trabajo: 6 h',
    limpio(await panel.innerText()).includes('6 h'),
    limpio(await panel.innerText()).replace(/\n/g, ' | '));

  await panel.locator('button:has-text("Guardar quién ha venido")').click();
  await m.waitForTimeout(1600);

  check('Se guarda UN solo parte, no dos',
    db.work_reports.length === 1, String(db.work_reports.length));
  check('Con Pedro y sus 3 horas, aparte de las del autor',
    db.work_report_workers.length === 1
    && db.work_report_workers[0].worker_id === PEDRO.id
    && Number(db.work_report_workers[0].hours) === 3,
    JSON.stringify(db.work_report_workers));
  check('Y las horas del autor siguen en el parte, sin duplicarse',
    Number(db.work_reports[0].hours) === 3
    && !db.work_report_workers.some((w) => w.worker_id === WORKER.id));

  // Una fotografía del trabajo, que es lo que el otro tiene que poder ver.
  db.documents.push({
    id: 'd1', report_id: parte.id, ficha_id: null, project_id: null, order_id: null,
    storage_path: `reports/${parte.id}/tramo.jpg`, file_name: 'tramo.jpg',
    mime_type: 'image/jpeg', size_bytes: 2500, category: 'foto', scope: 'tecnica',
    uploaded_by: WORKER.id, deleted_at: null, deleted_by: null,
    created_at: `${HOY}T18:00:00Z`, updated_at: `${HOY}T18:00:00Z`, is_demo: false,
  });

  // Y se envía a validar.
  await m.locator('.w-block:has(h3:has-text("El trabajo")) button:has-text("Enviar")')
    .click();
  await m.waitForTimeout(600);
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(1600);
  check('El parte se envía a validar con el reparto puesto',
    db.work_reports[0].status === 'enviado');

  // ===================================================================
  // PEDRO · estuvo en el trabajo, así que lo puede LEER
  // ===================================================================
  const pctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(pctx, { db, getUser: () => PEDRO, people });
  const pp = await pctx.newPage();
  pp.on('pageerror', (e) => errores.push(String(e)));

  await signIn(pp, PORT, 'pedro');
  await pp.goto(`http://localhost:${PORT}/#/t/partes/${parte.id}`, { waitUntil: 'networkidle' });
  await pp.waitForTimeout(1600);

  const vistaPedro = limpio(await pp.locator('.w-content').innerText());
  check('Pedro, que estuvo en el trabajo, abre el parte',
    vistaPedro.includes(parte.code), vistaPedro.replace(/\n/g, ' · ').slice(0, 200));
  check('Y ve la descripción del trabajo',
    vistaPedro.includes('Montaje de los tres tramos'));
  check('Se le dice que el parte lo rellenó su compañero',
    vistaPedro.includes('Este parte lo rellenó Juan Ortega'),
    vistaPedro.replace(/\n/g, ' · ').slice(0, 220));
  check('Ve quién estuvo y las horas de cada uno',
    vistaPedro.includes('Quién estuvo') && vistaPedro.includes('rellenó el parte')
    && vistaPedro.includes('6 h'),
    vistaPedro.replace(/\n/g, ' · ').slice(0, 260));
  check('Pero NO se le ofrece cambiar el reparto: eso es del autor',
    await pp.locator('button:has-text("Guardar quién ha venido")').count() === 0);
  check('Ni guardar ni reenviar el parte de otro',
    await pp.locator('.w-block:has(h3:has-text("El trabajo")) button:has-text("Enviar")')
      .count() === 0);

  // ===================================================================
  // ANA · no estuvo, así que no lo ve
  // ===================================================================
  const actx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(actx, { db, getUser: () => ANA, people });
  const aa = await actx.newPage();
  aa.on('pageerror', (e) => errores.push(String(e)));

  await signIn(aa, PORT, 'ana');
  await aa.goto(`http://localhost:${PORT}/#/t/partes/${parte.id}`, { waitUntil: 'networkidle' });
  await aa.waitForTimeout(1600);

  const vistaAna = limpio(await aa.locator('.w-content').innerText());
  check('Quien no estuvo en el trabajo NO ve el parte',
    !vistaAna.includes('Montaje de los tres tramos'),
    vistaAna.replace(/\n/g, ' · ').slice(0, 200));

  await aa.locator('.w-tabbar a:has-text("Mis partes")').click();
  await aa.waitForTimeout(1400);
  check('Ni le aparece en su listado de partes',
    !limpio(await aa.locator('.w-content').innerText()).includes(parte.code));

  // ===================================================================
  // ADMINISTRACIÓN · ve el reparto y valida con criterio
  // ===================================================================
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db, getUser: () => ADMIN, people });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(String(e)));

  await signIn(page, PORT, 'salvi');
  await page.goto(`http://localhost:${PORT}/#/admin/partes/${parte.id}`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);

  const reparto = page.locator('.panel:has(h2:has-text("Quién estuvo en este trabajo"))');
  check('Administración ve quién estuvo en el trabajo',
    await reparto.count() === 1);
  check('Con las horas de cada uno y quién rellenó el parte',
    limpio(await reparto.innerText()).includes('Juan Ortega')
    && limpio(await reparto.innerText()).includes('Pedro Navarro')
    && limpio(await reparto.innerText()).includes('rellenó el parte'),
    limpio(await reparto.innerText()).replace(/\n/g, ' | '));
  check('Y el total del trabajo: 6 h entre los dos',
    limpio(await reparto.innerText()).includes('6 h'),
    limpio(await reparto.innerText()).replace(/\n/g, ' | '));

  const datos = limpio(await page.locator('.panel:has(h2:has-text("Lo que ha hecho"))').innerText());
  check('En los datos se distingue «Sus horas» del total del trabajo',
    datos.includes('Sus horas') && datos.includes('Total del trabajo'),
    datos.replace(/\n/g, ' | '));

  await page.locator('button:has-text("Validar")').click();
  await page.waitForTimeout(700);
  await page.locator('.modal button:has-text("Validar")').click();
  await page.waitForTimeout(1600);
  check('Se valida el parte una sola vez, para los dos',
    db.work_reports[0].status === 'validado');

  // ---------------- LAS HORAS CUADRAN EN TODAS LAS PANTALLAS ---------
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);

  const fichaProy = limpio(await page.locator('main').innerText());
  const panelHoras = limpio(
    await page.locator('.panel:has(h2:has-text("Presupuesto y horas previstas"))').innerText());
  check('La ficha del proyecto cuenta las 6 horas, no solo las 3 del autor',
    panelHoras.includes('6 h') && panelHoras.includes('Montaje realizado'),
    panelHoras.replace(/\n/g, ' | '));
  check('Y las horas PRESUPUESTADAS siguen siendo las de administración: 20 y 10',
    panelHoras.includes('20 h') && panelHoras.includes('Fabricación prevista')
    && panelHoras.includes('10 h') && panelHoras.includes('Montaje previsto'),
    panelHoras.replace(/\n/g, ' | '));
  check('Registrar horas reales no ha tocado las presupuestadas',
    Number(db.projects[0].budget_hours_fab) === 20
    && Number(db.projects[0].budget_hours_mont) === 10);

  await page.goto(`http://localhost:${PORT}/#/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const panelInicio = limpio(await page.locator('main').innerText());
  check('El panel cuenta las 6 horas del parte compartido',
    panelInicio.includes('6 h'), panelInicio.replace(/\n/g, ' · ').slice(0, 300));
  check('Y dice «Trabajos validados», no «Órdenes validadas»',
    panelInicio.includes('Trabajos validados') && !panelInicio.includes('Órdenes validadas'),
    panelInicio.replace(/\n/g, ' · ').slice(0, 300));

  // ===================================================================
  // UN PARTE VALIDADO YA NO CAMBIA DE REPARTO
  // ===================================================================
  // Juan ya estaba en esta misma dirección, y con el enrutador por hash
  // ir a la misma dirección NO vuelve a pedir los datos: se recarga.
  await m.goto(`http://localhost:${PORT}/#/t/partes/${parte.id}`, { waitUntil: 'networkidle' });
  await m.reload({ waitUntil: 'networkidle' });
  await m.waitForTimeout(1600);
  const yaValidado = limpio(await m.locator('.w-content').innerText());
  check('Validado, al autor se le dice que ya no puede cambiar el reparto',
    yaValidado.includes('ya no se puede cambiar con quién se hizo'),
    yaValidado.replace(/\n/g, ' · ').slice(0, 260));
  check('Y no hay botón para guardarlo',
    await m.locator('button:has-text("Guardar quién ha venido")').count() === 0);

  // ===================================================================
  // UN PARTE SUELTO DICE POR QUÉ NO SE PUEDE COMPARTIR
  // ===================================================================
  await m.goto(`http://localhost:${PORT}/#/t/partes/nuevo?sin-proyecto=1`,
    { waitUntil: 'networkidle' });
  await m.waitForTimeout(1200);
  await m.locator('#pt-done').fill('Faena suelta de taller.');
  await m.locator('#pt-hours').fill('2');
  await m.locator('button:has-text("Guardar")').first().click();
  await m.waitForTimeout(1600);

  const suelto = limpio(
    await m.locator('.w-block:has(h3:has-text("¿Con quién lo has hecho?"))').innerText());
  check('Un parte sin proyecto ni aviso explica por qué todavía no se comparte',
    suelto.includes('no hay con quién compartirlo'), suelto.replace(/\n/g, ' | '));
  check('Y no se le ofrece a nadie',
    await m.locator('.w-block:has(h3:has-text("¿Con quién lo has hecho?")) input[type="checkbox"]')
      .count() === 0);

  check('Ninguna pantalla ha dado un error de programación',
    errores.length === 0, errores.join(' · '));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

process.exit(report() ? 1 : 0);
