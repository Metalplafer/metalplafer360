/**
 * METALPLAFER360 · BLOQUE 3 · Calendario y planificación.
 *
 *   npm run test:bloque3
 *
 * Comprueba en un navegador real lo que verá quien use la aplicación:
 * que un proyecto aparece en el calendario con su duración, que se puede
 * arrastrar a otro día y queda fijado a mano, que se pueden marcar
 * festivos, crear eventos «Otros» y cambiar el margen entre proyectos.
 *
 * El algoritmo se prueba contra PostgreSQL en
 * tests/sql/82_tests_planificacion.sql, con los diez casos del encargo.
 */
import {
  ADMIN, WORKER, YEAR, addDays, buildApp, createChecker, createDb, launchBrowser,
  mondayOf, serveApp, signIn, startOfMonth, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4190;
const HOY = today();

/** El primer lunes del mes que viene: una fecha laborable y estable. */
function lunesEstable() {
  const d = new Date(`${HOY}T12:00:00`);
  d.setMonth(d.getMonth() + 1, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
const LUNES = lunesEstable();
const MARTES = addDays(LUNES, 1);

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: null, phone: null,
      email: null, address: null, city: 'Sabadell', postal_code: null, notes: null,
      active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  projects: [
    // 32 h de fabricación con 2 personas = 2 días. 16 h de montaje = 1 día.
    { id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1', contact_id: null, source_ficha_id: null,
      name: 'Barandilla escalera', description: null, measures: null, finish: null,
      location: null, address: null, observations: null, budget_amount: 6400,
      advance_amount: null, budget_hours_fab: 32, budget_hours_mont: 16,
      phase: 'preparacion', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: false,
      fab_start: null, fab_end: null, mont_start: null, mont_end: null,
      fab_workers: 2, mont_workers: 2, fab_manual: false, mont_manual: false, autoplan: true,
      created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z' },
  ],
  project_workers: [
    { project_id: 'p1', worker_id: WORKER.id, assigned_at: '2026-05-05T09:00:00Z',
      assigned_by: ADMIN.id, is_demo: false },
  ],
  counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 1, OT: 0, PT: 0 },
});

const people = [ADMIN, WORKER];
const browser = await launchBrowser();

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db, getUser: () => ADMIN, people });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));

  await signIn(page, PORT, 'salvi');

  // ================== LA DURACIÓN SALE DE LAS HORAS ====================
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const plan = page.locator('.panel:has(h2:has-text("Planificación"))');
  check('El proyecto tiene un apartado de planificación', await plan.count() === 1);
  check('De entrada no tiene fecha', (await plan.innerText()).includes('Sin fecha todavía'));
  check('Dice que van 2 personas por defecto',
    await plan.locator('select').first().inputValue() === '2');
  check('Y que 32 h entre 2 son 2 días',
    (await plan.innerText()).includes('32 h previstas · 2'));

  // Con 1 sola persona, el doble de días.
  await plan.locator('select').first().selectOption('1');
  await page.waitForTimeout(800);
  check('Con 1 sola persona, las mismas 32 h son 4 días',
    (await plan.innerText()).includes('32 h previstas · 4'));
  await plan.locator('select').first().selectOption('2');
  await page.waitForTimeout(800);

  // ================== BUSCAR HUECO ====================================
  await plan.locator('button:has-text("Buscar hueco")').click();
  await page.waitForTimeout(1000);
  check('«Buscar hueco» coloca la fabricación en el calendario',
    Boolean(db.projects[0].fab_start), String(db.projects[0].fab_start));
  check('Con 2 días de duración, de lunes a martes o equivalente',
    db.projects[0].fab_end > db.projects[0].fab_start);
  check('Y coloca también el montaje, detrás de la fabricación',
    db.projects[0].mont_start > db.projects[0].fab_end,
    `${db.projects[0].fab_end} → ${db.projects[0].mont_start}`);
  check('Dejando el día de margen que está configurado',
    db.projects[0].mont_start > addDays(db.projects[0].fab_end, 1)
    || new Date(`${addDays(db.projects[0].fab_end, 1)}T12:00:00`).getDay() >= 5);

  // ================== EL CALENDARIO ====================================
  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);

  check('Las cuatro vistas siguen ahí',
    (await page.locator('.cal-toolbar').innerText()).includes('Mes')
    && (await page.locator('.cal-toolbar').innerText()).includes('Semana')
    && (await page.locator('.cal-toolbar').innerText()).includes('Día')
    && (await page.locator('.cal-toolbar').innerText()).includes('Agenda'));

  // BLOQUE 4: «Obras» entra como un tipo más de la leyenda.
  check('La leyenda tiene los siete tipos, con «Otros» y «Obras»',
    await page.locator('.cal-legend-item').count() === 7
    && (await page.locator('.cal-legend').innerText()).includes('Otros')
    && (await page.locator('.cal-legend').innerText()).includes('Obras'));

  check('El proyecto planificado aparece en el calendario',
    (await page.locator('.cal-grid').innerText()).includes(`PROY-${YEAR}-001`));

  // ESTO CAMBIÓ con el rediseño del calendario, y es justo lo que se
  // pidió: un tramo de dos días ya NO son dos pastillas sueltas con el
  // mismo nombre, sino UNA barra continua que ocupa dos columnas.
  const barraFab = page.locator(`.cal-event:has-text("PROY-${YEAR}-001")`).first();
  const columnasFab = await barraFab.evaluate(
    (el) => getComputedStyle(el).gridColumn || el.style.gridColumn);
  check('Un tramo de 2 días es UNA barra que ocupa 2 columnas, no dos pastillas',
    /span\s*2/.test(columnasFab), columnasFab);

  // ================== MOVER A MANO =====================================
  const antes = db.projects[0].fab_start;
  const inicioRejilla = mondayOf(startOfMonth(HOY));
  const destinoIdx = Math.round(
    (Date.parse(`${LUNES}T00:00:00Z`) - Date.parse(`${inicioRejilla}T00:00:00Z`)) / 86400000,
  );
  if (destinoIdx >= 0 && destinoIdx < 42) {
    const origen = page.locator(`.cal-event:has-text("PROY-${YEAR}-001")`).first();
    const destino = page.locator('.cal-grid .cal-day').nth(destinoIdx);
    await origen.dispatchEvent('dragstart');
    await destino.dispatchEvent('dragover');
    await destino.dispatchEvent('drop');
    await page.waitForTimeout(1200);

    check('Arrastrar una fase la mueve de día',
      db.projects[0].fab_start !== antes, `${antes} → ${db.projects[0].fab_start}`);
    check('Y queda fijada a mano', db.projects[0].fab_manual === true);
    check('La pantalla lo dice claramente',
      (await page.locator('.toast').last().innerText()).includes('fijada a mano'));
    // Y dice QUÉ fase ha movido, que es lo que antes no se distinguía.
    check('El aviso nombra la fase que se ha movido',
      (await page.locator('.toast').last().innerText()).includes('Fabricación'));
  }

  // Volver a planificar NO deshace lo que se ha puesto a mano.
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('El proyecto avisa de que esa fase está fijada a mano',
    (await page.locator('.panel:has(h2:has-text("Planificación"))').innerText())
      .includes('Fijado a mano'));

  const fijada = db.projects[0].fab_start;
  await page.locator('.panel:has(h2:has-text("Planificación")) button:has-text("Buscar hueco")').click();
  await page.waitForTimeout(1000);
  check('Volver a planificar NO mueve lo que se puso a mano',
    db.projects[0].fab_start === fijada, `${fijada} → ${db.projects[0].fab_start}`);

  // Y se puede soltar a propósito.
  await page.locator('.panel:has(h2:has-text("Planificación")) button:has-text("Soltar")').first().click();
  await page.waitForTimeout(500);
  await page.locator('.modal button:has-text("Soltar y recolocar")').click();
  await page.waitForTimeout(1000);
  check('Se puede devolver una fase al cálculo automático',
    db.projects[0].fab_manual === false);

  // ================== FESTIVOS =========================================
  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);

  const idxLunes = Math.round(
    (Date.parse(`${LUNES}T00:00:00Z`) - Date.parse(`${inicioRejilla}T00:00:00Z`)) / 86400000,
  );
  if (idxLunes >= 0 && idxLunes < 42) {
    const celda = page.locator('.cal-grid .cal-day').nth(idxLunes);
    await celda.locator('.cal-festivo').click();
    await page.waitForTimeout(500);
    check('Se pregunta antes de marcar un día como no laborable',
      (await page.locator('.modal').innerText()).includes('no laborable'));
    check('Y se explica qué implica',
      (await page.locator('.modal').innerText()).includes('se lo saltará'));
    await page.locator('.modal button:has-text("Marcar")').click();
    await page.waitForTimeout(900);

    check('El día queda marcado como no laborable',
      db.non_working_days.some((d) => d.day === LUNES));
    check('Y se ve apagado en el calendario',
      await page.locator('.cal-grid .cal-day.no-laborable').count() >= 1);
  }

  // ================== «OTROS» ==========================================
  await page.locator('button:has-text("Nuevo evento")').click();
  await page.waitForTimeout(500);
  await page.locator('#cal-dia').fill(MARTES);
  await page.locator('#cal-titulo').fill('Revisión de la plegadora');
  await page.locator('#cal-detalle').fill('Viene el técnico por la mañana');
  await page.locator('.modal button:has-text("Guardar")').click();
  await page.waitForTimeout(1000);

  check('Administración crea un evento «Otro» desde el calendario',
    db.calendar_notes.some((n) => n.title === 'Revisión de la plegadora' && n.day === MARTES));
  // Con el rediseño, «Otros» no está encendido al abrir: se enciende
  // para verlo, como cualquier categoría suelta.
  await page.locator('.cal-legend-item:has-text("Otros")').click();
  await page.waitForTimeout(700);
  check('Y aparece en la rejilla al encender «Otros»',
    (await page.locator('.cal-grid').innerText()).includes('Revisión de la plegadora'));

  // ================== EL MARGEN ========================================
  await page.goto(`http://localhost:${PORT}/#/admin/configuracion`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('.tabs button:has-text("Planificación")').click();
  await page.waitForTimeout(700);

  check('Hay una configuración para el margen entre proyectos',
    await page.locator('#st-gap').count() === 1);
  const panelPlan = page.locator('.panel:has(h2:has-text("Planificación"))');
  check('Y se explica qué significa cada valor, incluido el 0,5',
    (await panelPlan.innerText()).includes('medio día libre no existe'));

  await page.locator('#st-gap').fill('2');
  await page.locator('button:has-text("Guardar")').first().click();
  await page.waitForTimeout(900);
  check('El margen se guarda', Number(db.settings.gap_days) === 2);
  check('Y se avisa de que vale de aquí en adelante',
    (await panelPlan.innerText()).includes('de aquí en adelante'));

  // ================== EL TRABAJADOR ====================================
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(movil, { db, getUser: () => WORKER, people });
  const m = await movil.newPage();
  const erroresMovil = [];
  m.on('pageerror', (e) => erroresMovil.push(String(e)));

  await signIn(m, PORT, 'juan');
  await m.locator('.w-tabbar a:has-text("Calendario")').click();
  await m.waitForTimeout(1200);

  const calTrabajador = await m.locator('.w-content').innerText();
  check('El trabajador ve en su calendario el proyecto que tiene asignado',
    calTrabajador.includes(`PROY-${YEAR}-001`));
  check('Y así sabe qué va antes y qué va después',
    calTrabajador.includes('Fabricación') || calTrabajador.includes('Montaje'));
  check('Pero no puede arrastrar nada',
    await m.locator('.cal-event[draggable="true"]').count() === 0);
  check('Ni marcar festivos', await m.locator('.cal-festivo').count() === 0);

  check('Ninguna pantalla de administración ha dado un error de programación',
    errores.length === 0, errores[0]);
  check('Ninguna pantalla del móvil ha dado un error de programación',
    erroresMovil.length === 0, erroresMovil[0]);

  await movil.close();
  await ctx.close();
} finally {
  await browser.close();
}

server.close();
process.exit(report() ? 1 : 0);
