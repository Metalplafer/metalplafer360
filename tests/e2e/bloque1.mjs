/**
 * METALPLAFER360 · BLOQUE 1 · Proyectos, trabajadores y partes de trabajo.
 *
 *   npm run test:bloque1
 *
 * Recorre en un navegador real lo que va a pasar en la empresa:
 * administración da de alta a dos personas en un proyecto, el trabajador
 * entra desde el móvil, rellena su parte con SUS horas y lo envía;
 * administración lo rechaza con motivo, él lo corrige, se valida y
 * entonces —y solo entonces— las horas aparecen en el proyecto.
 *
 * Y lo que más importa: se comprueba que el trabajador NO ve el dinero.
 * Las reglas de verdad se prueban contra PostgreSQL en
 * tests/sql/80_tests_partes.sql; aquí se comprueba la pantalla.
 */
import {
  ADMIN, WORKER, YEAR, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4186;
const HOY = today();

const PEDRO = {
  ...WORKER, id: '33333333-3333-4333-8333-333333333333',
  full_name: 'Pedro Navarro', username: 'pedro', email: 'pedro@metalplafer.com',
};

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: 'obras@garcia.es', address: 'Carrer de la Indústria, 12',
      city: 'Sabadell', postal_code: '08202', notes: null, active: true, archived_at: null,
      is_demo: false, created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  projects: [
    { id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1', contact_id: null, source_ficha_id: null,
      name: 'Barandilla escalera comunitaria',
      description: 'Barandilla de acero para escalera de 4 plantas.',
      measures: '4 tramos · 3,20 m', finish: 'Negro forja', location: 'Escalera principal',
      address: 'Rambla, 45 · Sabadell', observations: null,
      budget_amount: 6400.5, advance_amount: 2000, budget_hours_fab: 32, budget_hours_mont: 16,
      phase: 'fabricacion', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: false,
      created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z' },
  ],
  counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 1, OT: 0, PT: 0 },
});

const people = [ADMIN, WORKER, PEDRO];
const browser = await launchBrowser();

try {
  // ================ ADMINISTRACIÓN: ASIGNAR EL EQUIPO ===================
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db, getUser: () => ADMIN, people });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));

  await signIn(page, PORT, 'salvi');
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const panelEquipo = page.locator('.panel:has(h2:has-text("Quién trabaja en este proyecto"))');
  check('El proyecto tiene un apartado para asignar personas',
    await panelEquipo.count() === 1);
  check('De entrada no hay nadie y se avisa de lo que eso significa',
    (await panelEquipo.innerText()).includes('ningún trabajador puede entrar'));

  await panelEquipo.locator('button:has-text("Asignar")').click();
  await page.waitForTimeout(400);
  const casillas = panelEquipo.locator('.checkbox');
  check('Se pueden asignar varias personas a la vez', await casillas.count() === 2);
  check('Se avisa de que no verán importes',
    (await panelEquipo.innerText()).includes('No verá importes ni facturación'));

  await casillas.nth(0).locator('input').check();
  await casillas.nth(1).locator('input').check();
  await panelEquipo.locator('button:has-text("Guardar el equipo")').click();
  await page.waitForTimeout(800);
  check('Quedan los dos asignados',
    (await panelEquipo.innerText()).includes('Juan Ortega')
    && (await panelEquipo.innerText()).includes('Pedro Navarro'));

  const horas = page.locator('.panel:has(h2:has-text("Presupuesto y horas previstas"))');
  check('El proyecto arranca con 0 h realizadas',
    (await horas.innerText()).includes('0 h'));
  check('Y explica que solo cuentan las validadas',
    (await horas.innerText()).includes('cuando administración valida el parte'));

  // ============ EL TRABAJADOR: ENTRAR Y RELLENAR SU PARTE ===============
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(movil, { db, getUser: () => WORKER, people });
  const m = await movil.newPage();
  const erroresMovil = [];
  m.on('pageerror', (e) => erroresMovil.push(String(e)));

  await signIn(m, PORT, 'juan');
  await m.waitForTimeout(800);

  check('El inicio del trabajador enseña sus proyectos',
    (await m.locator('.w-content').innerText()).includes('Barandilla escalera comunitaria'));
  check('Y tiene el botón de parte de trabajo a mano',
    await m.locator('a:has-text("Parte de trabajo")').count() > 0);

  await m.locator('.w-tabbar a:has-text("Trabajos")').click();
  await m.waitForTimeout(700);
  check('«Mis proyectos» enseña el proyecto asignado',
    (await m.locator('.w-content').innerText()).includes(`PROY-${YEAR}-001`));

  // LO MÁS IMPORTANTE: el dinero no llega hasta aquí.
  const textoProyectos = await m.locator('.w-content').innerText();
  check('NO se ve el importe del proyecto en el listado',
    !textoProyectos.includes('6.400') && !textoProyectos.includes('6400'));

  await m.locator('.ot-card').first().click();
  await m.waitForTimeout(800);
  const ficha = await m.locator('.w-content').innerText();
  check('El trabajador ve el trabajo: medidas, acabado y dirección',
    ficha.includes('4 tramos') && ficha.includes('Negro forja') && ficha.includes('Rambla, 45'));
  check('Ve las horas previstas', ficha.includes('32 h'));
  check('Ve con quién comparte el proyecto', ficha.includes('Pedro Navarro'));
  check('NO ve el importe del proyecto', !ficha.includes('6.400') && !ficha.includes('6400'));
  check('NO ve la paga y señal', !ficha.includes('2.000') && !ficha.includes('Anticipo'));
  check('NO ve nada de facturación', !ficha.toLowerCase().includes('facturar'));

  await m.locator('a:has-text("Parte de trabajo")').click();
  await m.waitForTimeout(800);
  check('Se abre el parte en blanco', m.url().includes('#/t/partes/nuevo'));
  check('Se dice expresamente que las horas son suyas',
    (await m.locator('.w-content').innerText()).includes('Si habéis ido dos, cada uno'));

  await m.locator('button:has-text("Enviar")').click();
  await m.waitForTimeout(500);
  check('No se envía un parte sin escribir el trabajo',
    (await m.locator('.toast, .alert-danger').first().innerText()).includes('qué trabajo'));

  await m.locator('#pt-done').fill('Corte de pletina y soldadura de los cuatro marcos.');
  await m.locator('#pt-hours').fill('5,5');
  await m.locator('button:has-text("Enviar")').click();
  await m.waitForTimeout(400);
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(900);

  check('El parte queda enviado y pendiente de validación',
    (await m.locator('.w-content').innerText()).includes('Pendiente de validación'));
  check('Y se avisa de que las horas todavía no cuentan',
    (await m.locator('.alert-info').innerText()).includes('no cuentan en el proyecto'));
  check('Lleva su número PT',
    (await m.locator('.w-greeting h1').innerText()).includes(`PT-${YEAR}-001`));

  // =============== ADMINISTRACIÓN: RECHAZAR Y VALIDAR ===================
  await page.goto(`http://localhost:${PORT}/#/admin/partes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('Administración ve el parte esperando',
    (await page.locator('.table').innerText()).includes(`PT-${YEAR}-001`));
  check('Y sabe de quién es',
    (await page.locator('.table').innerText()).includes('Juan Ortega'));

  await page.locator(`.table a:has-text("PT-${YEAR}-001")`).click();
  await page.waitForTimeout(800);
  check('Se ve lo que ha hecho y sus horas',
    (await page.locator('.two-col').innerText()).includes('5,5 h'));

  await page.locator('button:has-text("Rechazar")').first().click();
  await page.waitForTimeout(400);
  check('No se puede rechazar sin escribir el motivo',
    await page.locator('.modal button:has-text("Rechazar el parte")').isDisabled());

  await page.locator('#pt-motivo').fill('Faltan las fotos de los marcos soldados.');
  await page.locator('.modal button:has-text("Rechazar el parte")').click();
  await page.waitForTimeout(900);
  check('El parte queda rechazado con su motivo',
    (await page.locator('.alert-danger').innerText()).includes('Faltan las fotos'));

  // =============== EL TRABAJADOR LO CORRIGE Y REENVÍA ===================
  await m.reload({ waitUntil: 'networkidle' });
  await m.waitForTimeout(900);
  check('El trabajador ve que se lo han devuelto, y por qué',
    (await m.locator('.alert-danger').innerText()).includes('Faltan las fotos'));

  await m.locator('#pt-done').fill('Corte de pletina y soldadura de los cuatro marcos. Fotos añadidas.');
  await m.locator('button:has-text("Volver a enviar")').click();
  await m.waitForTimeout(400);
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(900);
  check('Al corregirlo vuelve a quedar pendiente',
    (await m.locator('.w-content').innerText()).includes('Pendiente de validación'));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('button:has-text("Validar")').click();
  await page.waitForTimeout(400);
  await page.locator('.modal button:has-text("Validar")').click();
  await page.waitForTimeout(900);
  check('Administración lo valida',
    (await page.locator('.alert-ok').innerText()).includes('Validado'));

  // ============ AHORA SÍ: LAS HORAS APARECEN EN EL PROYECTO =============
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const horas2 = await page.locator('.panel:has(h2:has-text("Presupuesto y horas previstas"))').innerText();
  check('Las 5,5 h validadas cuentan ya como fabricación realizada', horas2.includes('5,5 h'));

  const panelPartes = page.locator('.panel:has(h2:has-text("Partes de trabajo"))');
  check('El proyecto lista el parte', (await panelPartes.innerText()).includes(`PT-${YEAR}-001`));

  // ================ UN PARTE SIN PROYECTO ===============================
  await m.goto(`http://localhost:${PORT}/#/t/partes/nuevo`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(800);
  // BLOQUE 5: el formulario trae ahora un selector de proyecto, y
  // «Sin proyecto» es la opción de entrada.
  check('Se puede abrir un parte sin proyecto',
    (await m.locator('.w-greeting').innerText()).includes('Sin proyecto'));
  check('Y el proyecto se elige en el propio formulario',
    await m.locator('#pt-origen').count() === 1
    && await m.locator('#pt-origen').inputValue() === '');

  await m.locator('button:has-text("Montaje")').click();
  await m.locator('#pt-done').fill('Faena que me dijo Salvi, todavía sin proyecto en la aplicación.');
  await m.locator('#pt-hours').fill('3');
  await m.locator('button:has-text("Enviar")').click();
  await m.waitForTimeout(400);
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(900);
  check('Un parte sin proyecto se envía igual',
    (await m.locator('.w-content').innerText()).includes('Pendiente de validación'));

  await page.goto(`http://localhost:${PORT}/#/admin/partes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.locator('.tabs button:has-text("Sin proyecto")').click();
  await page.waitForTimeout(700);
  check('Administración los encuentra en su propia pestaña',
    (await page.locator('.table').innerText()).includes(`PT-${YEAR}-002`));

  await page.locator(`.table a:has-text("PT-${YEAR}-002")`).click();
  await page.waitForTimeout(800);
  // Hay dos avisos amarillos a la vez (pendiente de validar y sin
  // proyecto): se mira el que nos interesa, no «el primero».
  check('Se avisa de que no tiene proyecto',
    await page.locator('.alert-warn:has-text("no tiene proyecto")').count() === 1);

  await page.locator('button:has-text("Asignar a un proyecto")').click();
  await page.waitForTimeout(600);
  await page.locator('#pt-proy').selectOption('p1');
  await page.locator('.modal button:has-text("Asignar")').click();
  await page.waitForTimeout(900);
  check('Queda asignado al proyecto',
    (await page.locator('.kv').innerText()).includes(`PROY-${YEAR}-001`));

  await page.locator('button:has-text("Validar")').click();
  await page.waitForTimeout(400);
  await page.locator('.modal button:has-text("Validar")').click();
  await page.waitForTimeout(900);

  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const horas3 = await page.locator('.panel:has(h2:has-text("Presupuesto y horas previstas"))').innerText();
  check('Sus 3 h entran en montaje, no en fabricación', horas3.includes('3 h'));

  // ================ CADA UNO VE LO SUYO =================================
  const movilPedro = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(movilPedro, { db, getUser: () => PEDRO, people });
  const mp = await movilPedro.newPage();
  await signIn(mp, PORT, 'pedro');
  await mp.goto(`http://localhost:${PORT}/#/t/partes`, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(900);
  check('Pedro NO ve los partes de Juan',
    !(await mp.locator('.w-content').innerText()).includes(`PT-${YEAR}-001`));

  await mp.goto(`http://localhost:${PORT}/#/t/proyectos/p1`, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(900);
  const fichaPedro = await mp.locator('.w-content').innerText();
  check('Pero sí entra en el proyecto que comparten',
    fichaPedro.includes('Barandilla escalera comunitaria'));
  check('Y tampoco él ve el dinero',
    !fichaPedro.includes('6.400') && !fichaPedro.includes('2.000'));

  check('Ninguna pantalla del móvil ha dado un error de programación',
    erroresMovil.length === 0, erroresMovil[0]);
  check('Ninguna pantalla de administración ha dado un error de programación',
    errores.length === 0, errores[0]);

  await movilPedro.close();
  await movil.close();
  await ctx.close();
} finally {
  await browser.close();
}

server.close();
process.exit(report() ? 1 : 0);
