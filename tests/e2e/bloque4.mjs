/**
 * METALPLAFER360 · BLOQUE 4 · Obras.
 *
 *   npm run test:bloque4
 *
 * Comprueba en un navegador real lo que verá quien use la aplicación:
 *   · que administración crea una obra y le mete proyectos;
 *   · que las cuentas cuadran: proyectos + extras = total estimado, y el
 *     pendiente baja al marcar una factura;
 *   · que la facturación se marca A MANO, proyecto a proyecto, y que usa
 *     el estado de cobro que ya existía en lugar de inventar otro;
 *   · que el historial de la obra cuenta lo que ha pasado;
 *   · que la obra sale en el calendario como un elemento más;
 *   · que un trabajador NO ve ni la sección, ni la obra, ni sus cuentas,
 *     ni sus extras, aunque pida los datos a mano;
 *   · que eliminar una obra deja los proyectos sueltos, y que no se puede
 *     eliminar si hay algo facturado.
 *
 * Las reglas de verdad se prueban contra PostgreSQL en
 * tests/sql/83_tests_obras.sql.
 */
import {
  ADMIN, WORKER, YEAR, addDays, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4191;
const HOY = today();

/** El primer lunes del mes que viene: fecha laborable y estable. */
function lunesEstable() {
  const d = new Date(`${HOY}T12:00:00`);
  d.setMonth(d.getMonth() + 1, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
const LUNES = lunesEstable();

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

const proyecto = (id, n, nombre, importe, horasFab, extra = {}) => ({
  id, code: `PROY-${YEAR}-${String(n).padStart(3, '0')}`, client_id: 'c1', contact_id: null,
  source_ficha_id: null, name: nombre, description: null, measures: null, finish: null,
  location: null, address: null, observations: null, budget_amount: importe,
  advance_amount: null, budget_hours_fab: horasFab, budget_hours_mont: 0,
  phase: 'preparacion', no_assembly: true, billing_status: 'por_facturar',
  finished_at: null, archived_at: null, is_demo: false,
  fab_start: null, fab_end: null, mont_start: null, mont_end: null,
  fab_workers: 2, mont_workers: 2, fab_manual: false, mont_manual: false, autoplan: true,
  work_id: null, invoiced_amount: null, invoiced_on: null,
  created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z', ...extra,
});

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'Comunidad Calle Mayor 25', tax_id: 'H61234567',
      phone: '600111222', email: null, address: 'Calle Mayor, 25', city: 'Sabadell',
      postal_code: '08201', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  projects: [
    // 16 h entre 2 personas = 1 día, colocado a mano el lunes.
    proyecto('p1', 1, 'Puerta de entrada', 5000, 16,
      { fab_start: LUNES, fab_end: LUNES, fab_manual: true }),
    // 16 h = 1 día, el martes siguiente.
    proyecto('p2', 2, 'Barandilla escalera', 2400, 16,
      { fab_start: addDays(LUNES, 1), fab_end: addDays(LUNES, 1), fab_manual: true }),
    // Un tercero que se queda fuera de la obra, para comprobar que no cuenta.
    proyecto('p3', 3, 'Reja ventana suelta', 900, 8),
  ],
  project_workers: [
    { project_id: 'p1', worker_id: WORKER.id, assigned_at: '2026-05-05T09:00:00Z',
      assigned_by: ADMIN.id, is_demo: false },
  ],
  counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 3, OT: 0, PT: 0, OBRA: 0 },
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

  // ================== LA SECCIÓN ========================================
  check('Administración tiene una sección de Obras en el menú',
    await page.locator('.sidebar nav a:has-text("Obras")').count() === 1);

  await page.locator('.sidebar nav a:has-text("Obras")').click();
  await page.waitForTimeout(900);
  check('Y lleva al listado de obras',
    page.url().includes('#/admin/obras')
    && (await page.locator('h1').first().innerText()) === 'Obras');
  check('De entrada no hay ninguna',
    (await page.locator('main').innerText()).includes('Todavía no hay ninguna obra'));

  // ================== CREAR LA OBRA =====================================
  await page.locator('a:has-text("Nueva obra")').click();
  await page.waitForTimeout(800);
  await page.locator('#o-name').fill('Comunidad Calle Mayor 25');
  await page.locator('#o-address').fill('Calle Mayor, 25 · Sabadell');
  await page.locator('#o-obs').fill('El portero abre a las 8. Ascensor pequeño.');
  await page.locator('button:has-text("Crear obra")').click();
  await page.waitForTimeout(1200);

  const obra = db.works[0];
  check('La obra se crea con su número correlativo',
    obra?.code === `OBRA-${YEAR}-001`, obra?.code);
  check('Y se guardan las observaciones de la obra',
    obra?.observations?.includes('El portero abre a las 8'));
  check('Después de crearla se abre su pantalla',
    page.url().includes(`#/admin/obras/${obra.id}`));

  // ================== METER PROYECTOS ===================================
  check('La obra avisa de que todavía no tiene proyectos',
    (await page.locator('main').innerText()).includes('todavía no tiene proyectos'));

  for (const id of ['p1', 'p2']) {
    await page.goto(`http://localhost:${PORT}/#/admin/proyectos/${id}/editar`,
      { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    check(`El proyecto ${id} puede asociarse a una obra desde su formulario`,
      await page.locator('#p-work').count() === 1);
    await page.locator('#p-work').selectOption(obra.id);
    await page.locator('button:has-text("Guardar cambios")').click();
    await page.waitForTimeout(1200);
  }

  check('Los dos proyectos quedan metidos en la obra',
    db.projects.filter((p) => p.work_id === obra.id).length === 2);
  check('Y el tercero se queda fuera', db.projects[2].work_id === null);

  check('El proyecto dice a qué obra pertenece',
    (await page.locator('main').innerText()).includes(`OBRA-${YEAR}-001`));

  // ================== LAS CUENTAS =======================================
  await page.goto(`http://localhost:${PORT}/#/admin/obras/${obra.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);

  const cuentas = page.locator('.panel:has(h2:has-text("Las cuentas"))');
  /** Una cifra concreta de las cuentas, leída por su rótulo. */
  const cifra = async (rotulo) =>
    (await cuentas.locator('.figure', { hasText: rotulo }).locator('b').innerText())
      .replace(/\s+/g, ' ').trim();

  check('La obra suma el importe de sus proyectos y no el del que está fuera',
    await cifra('Total de proyectos') === '7.400,00 €', await cifra('Total de proyectos'));

  // Un coste extra.
  const panelExtras = page.locator('.panel:has(h2:has-text("Costes extras"))');
  await panelExtras.locator('button:has-text("Añadir")').click();
  await page.waitForTimeout(600);
  await page.locator('#ex-concepto').fill('Transporte y grúa');
  await page.locator('#ex-importe').fill('450');
  await page.locator('.modal button:has-text("Guardar")').click();
  await page.waitForTimeout(1200);

  check('Se puede añadir un coste extra a la obra',
    db.work_extras.some((x) => x.concept === 'Transporte y grúa' && Number(x.amount) === 450));
  check('Los extras salen en la pantalla con su importe',
    (await panelExtras.innerText()).includes('Transporte y grúa')
    && (await panelExtras.innerText()).includes('450,00'));

  check('Los extras se suman aparte', await cifra('Costes extras') === '450,00 €',
    await cifra('Costes extras'));
  check('Proyectos + extras = total estimado (7.400 + 450 = 7.850)',
    await cifra('Total estimado') === '7.850,00 €', await cifra('Total estimado'));
  check('De entrada no hay nada facturado',
    await cifra('Facturado') === '0,00 €', await cifra('Facturado'));
  check('Y está pendiente de facturar todo el total estimado',
    await cifra('Pendiente de facturar') === '7.850,00 €',
    await cifra('Pendiente de facturar'));

  // ================== FACTURAR A MANO ===================================
  const tablaProyectos = page.locator('.panel:has(h2:has-text("Proyectos de la obra")) table');
  check('Cada proyecto tiene su casilla de facturado',
    await tablaProyectos.locator('input[type="checkbox"]').count() === 2);

  await tablaProyectos.locator('tr', { hasText: `PROY-${YEAR}-001` })
    .locator('input[type="checkbox"]').click();
  await page.waitForTimeout(600);
  check('Se pregunta antes de dar un proyecto por facturado',
    (await page.locator('.modal').innerText()).includes('facturado'));
  check('Y se dice por cuánto se va a facturar',
    (await page.locator('.modal').innerText()).includes('5.000,00'));
  await page.locator('.modal button:has-text("Marcar como facturado")').click();
  await page.waitForTimeout(1300);

  const p1 = db.projects.find((p) => p.id === 'p1');
  check('El proyecto queda marcado como facturado por su presupuesto',
    Number(p1.invoiced_amount) === 5000, String(p1.invoiced_amount));
  check('Con la fecha de hoy', p1.invoiced_on === HOY, String(p1.invoiced_on));
  check('Y pasa al estado de cobro que ya existía, sin inventar otro',
    p1.billing_status === 'pendiente_cobro', p1.billing_status);

  check('La obra dice que se han facturado 5.000',
    await cifra('Facturado') === '5.000,00 €', await cifra('Facturado'));
  check('Y que quedan 2.850 por facturar (7.850 − 5.000)',
    await cifra('Pendiente de facturar') === '2.850,00 €',
    await cifra('Pendiente de facturar'));
  check('El total estimado no se mueve al facturar',
    await cifra('Total estimado') === '7.850,00 €', await cifra('Total estimado'));

  // El importe facturado se puede corregir: la factura no siempre es el presupuesto.
  const campoImporte = tablaProyectos.locator('tr', { hasText: `PROY-${YEAR}-001` })
    .locator('input.input');
  await campoImporte.fill('4800');
  await campoImporte.blur();
  await page.waitForTimeout(1200);
  check('El importe facturado se puede corregir a mano',
    Number(db.projects.find((p) => p.id === 'p1').invoiced_amount) === 4800,
    String(db.projects.find((p) => p.id === 'p1').invoiced_amount));
  check('Y el pendiente se recalcula (7.850 − 4.800 = 3.050)',
    await cifra('Pendiente de facturar') === '3.050,00 €',
    await cifra('Pendiente de facturar'));

  // ================== EL HISTORIAL ======================================
  const historial = page.locator('.panel:has(h2:has-text("Historial"))');
  check('La obra tiene historial', await historial.count() === 1);
  const textoHistorial = await historial.innerText();
  check('El historial cuenta que entraron los proyectos',
    textoHistorial.includes(`PROY-${YEAR}-001`) && textoHistorial.includes('obra'),
    textoHistorial.replace(/\n/g, ' · ').slice(0, 300));
  check('Y que se facturó',
    textoHistorial.includes('facturó') || textoHistorial.includes('Facturación'),
    textoHistorial.replace(/\n/g, ' · ').slice(0, 300));
  check('Y que se añadió el coste extra',
    textoHistorial.includes('Transporte y grúa'));

  // ================== COMENTARIOS Y OBSERVACIONES =======================
  check('La obra tiene comentarios',
    await page.locator('.panel:has(h2:has-text("Comentarios"))').count() === 1);
  check('Y se ven sus observaciones',
    (await page.locator('main').innerText()).includes('El portero abre a las 8'));

  // ================== EL CALENDARIO =====================================
  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  check('«Obras» es un tipo más de la leyenda del calendario',
    (await page.locator('.cal-legend').innerText()).includes('Obras'));
  // ESTO CAMBIÓ con el rediseño: el calendario abre con fabricación y
  // montaje, y «Obras» se enciende a mano.
  await page.locator('.cal-legend-item:has-text("Obras")').click();
  await page.waitForTimeout(700);

  check('La obra aparece en el calendario como un elemento más',
    (await page.locator('.cal-grid').innerText()).includes(`OBRA-${YEAR}-001`));

  // Y ESTO TAMBIÉN: antes eran varias pastillas sueltas, una por día.
  // Ahora es UNA barra continua que ocupa los días de sus proyectos, que
  // es lo que se pidió. Se mira cuántas columnas ocupa, no cuántas
  // pastillas hay.
  const barraObra = page.locator(`.cal-event:has-text("OBRA-${YEAR}-001")`).first();
  const columnas = await barraObra.evaluate(
    (el) => getComputedStyle(el).gridColumn || el.style.gridColumn);
  check('Y es UNA barra continua que ocupa varios días, no una por día',
    /span\s*([2-9]|\d\d)/.test(columnas), columnas);
  check('La obra no se arrastra: lo que se mueve son los proyectos',
    await page.locator(`.cal-event[draggable="true"]:has-text("OBRA-${YEAR}-001")`).count() === 0);

  await page.locator(`.cal-event:has-text("OBRA-${YEAR}-001")`).first().click();
  await page.waitForTimeout(1000);
  check('Y al pulsarla se abre la pantalla de la obra',
    page.url().includes(`#/admin/obras/${obra.id}`), page.url());

  // El filtro «Obras» va y viene: es un tipo como los demás. Con el
  // rediseño, al abrir el calendario está APAGADO —solo están
  // fabricación y montaje—, así que se comprueba el camino entero.
  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  check('Al abrir el calendario, «Obras» está apagado',
    !(await page.locator('.cal-grid').innerText()).includes(`OBRA-${YEAR}-001`));

  await page.locator('.cal-legend-item:has-text("Obras")').click();
  await page.waitForTimeout(800);
  check('Al encenderlo, la obra entra en la rejilla',
    (await page.locator('.cal-grid').innerText()).includes(`OBRA-${YEAR}-001`));

  await page.locator('.cal-legend-item:has-text("Obras")').click();
  await page.waitForTimeout(800);
  check('Y al apagarlo desaparece de la rejilla',
    !(await page.locator('.cal-grid').innerText()).includes(`OBRA-${YEAR}-001`));

  // ================== SACAR UN PROYECTO =================================
  await page.goto(`http://localhost:${PORT}/#/admin/obras/${obra.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);

  await page.locator(`button[aria-label="Sacar PROY-${YEAR}-002 de la obra"]`).click();
  await page.waitForTimeout(600);
  check('Se avisa de que sacar un proyecto NO lo borra',
    (await page.locator('.modal').innerText()).includes('NO se borra'));
  await page.locator('.modal button:has-text("Sacar de la obra")').click();
  await page.waitForTimeout(1300);

  check('El proyecto sale de la obra', db.projects.find((p) => p.id === 'p2').work_id === null);
  check('Pero sigue existiendo como proyecto',
    db.projects.some((p) => p.id === 'p2' && p.code === `PROY-${YEAR}-002`));
  check('Y la obra recalcula sus cuentas (5.000 + 450 = 5.450)',
    await cifra('Total estimado') === '5.450,00 €', await cifra('Total estimado'));

  // ================== NO SE BORRA LO FACTURADO ==========================
  await page.locator('button:has-text("Eliminar")').first().click();
  await page.waitForTimeout(600);
  check('Antes de eliminar se explica que los proyectos no se borran',
    (await page.locator('.modal').innerText()).includes('Los proyectos NO se'));
  await page.locator('.modal button:has-text("Eliminar")').click();
  await page.waitForTimeout(1300);

  check('La obra con algo facturado NO se puede eliminar',
    db.works.length === 1, `quedan ${db.works.length}`);
  check('Y se dice por qué, con el importe',
    (await page.locator('.toast').last().innerText()).includes('facturados'),
    await page.locator('.toast').last().innerText());

  // Quitando la marca de facturado, ya se puede.
  await page.goto(`http://localhost:${PORT}/#/admin/obras/${obra.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  await page.locator('.panel:has(h2:has-text("Proyectos de la obra")) input[type="checkbox"]')
    .first().click();
  await page.waitForTimeout(600);
  await page.locator('.modal button:has-text("Quitar")').click();
  await page.waitForTimeout(1200);
  check('Se puede quitar la marca de facturado',
    db.projects.find((p) => p.id === 'p1').invoiced_amount === null);

  // ================== ARCHIVAR ==========================================
  await page.locator('button:has-text("Archivar")').click();
  await page.waitForTimeout(1200);
  check('La obra se puede archivar', Boolean(db.works[0].archived_at));
  check('Y se avisa de que sus proyectos siguen funcionando',
    (await page.locator('main').innerText()).includes('siguen funcionando'));

  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  check('Una obra archivada ya no sale en el calendario',
    !(await page.locator('.cal-grid').innerText()).includes(`OBRA-${YEAR}-001`));

  await page.goto(`http://localhost:${PORT}/#/admin/obras/${obra.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('button:has-text("Recuperar")').click();
  await page.waitForTimeout(1200);
  check('Y se puede recuperar', db.works[0].archived_at === null);

  // ================== ELIMINAR DE VERDAD ================================
  await page.locator('button:has-text("Eliminar")').first().click();
  await page.waitForTimeout(600);
  await page.locator('.modal button:has-text("Eliminar")').click();
  await page.waitForTimeout(1400);

  check('Sin nada facturado, la obra se elimina de verdad', db.works.length === 0);
  check('Sus costes extras se van con ella', db.work_extras.length === 0);
  check('Pero los proyectos se quedan sueltos, no se borran',
    db.projects.length === 3 && db.projects.every((p) => p.work_id === null),
    `${db.projects.length} proyectos`);
  check('Y se vuelve al listado de obras', page.url().includes('#/admin/obras'));

  // ================== EL TRABAJADOR =====================================
  // Se vuelve a crear una obra con dinero dentro, para comprobar que el
  // trabajador no ve NADA de todo esto.
  db.works.push({
    id: 'w9', code: `OBRA-${YEAR}-002`, name: 'Comunidad Calle Mayor 25',
    client_id: 'c1', address: 'Calle Mayor, 25', description: null,
    observations: null, archived_at: null, is_demo: false, created_by: ADMIN.id,
    created_at: '2026-05-10T09:00:00Z', updated_at: '2026-05-10T09:00:00Z',
  });
  db.work_extras.push({
    id: 'x9', work_id: 'w9', concept: 'Transporte y grúa', amount: 450, notes: null,
    created_by: ADMIN.id, is_demo: false,
    created_at: '2026-05-10T10:00:00Z', updated_at: '2026-05-10T10:00:00Z',
  });
  const suyo = db.projects.find((p) => p.id === 'p1');
  suyo.work_id = 'w9';
  suyo.invoiced_amount = 5000;
  suyo.invoiced_on = HOY;

  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(movil, { db, getUser: () => WORKER, people });
  const m = await movil.newPage();
  const erroresMovil = [];
  m.on('pageerror', (e) => erroresMovil.push(String(e)));

  await signIn(m, PORT, 'juan');
  const tabbar = await m.locator('.w-tabbar').innerText();
  check('El trabajador no tiene ninguna sección de Obras',
    !tabbar.includes('Obras'), tabbar.replace(/\n/g, ' · '));

  // Y si pide los datos a mano, la base de datos no le devuelve ni una fila.
  const pedido = await m.evaluate(async (base) => {
    const traer = async (ruta) => {
      const r = await fetch(`${base}/rest/v1/${ruta}`,
        { headers: { 'content-type': 'application/json' } });
      try { return JSON.parse(await r.text()); } catch { return null; }
    };
    return {
      obras: await traer('works?select=*'),
      extras: await traer('work_extras?select=*'),
      cuentas: await traer('work_summary?select=*'),
      calendario: await traer('v_calendar?select=*&kind=eq.obra'),
    };
  }, 'https://ejemplo.supabase.co');

  const vacio = (x) => Array.isArray(x) && x.length === 0;
  check('Pidiendo «works» a mano, el trabajador no recibe ninguna obra',
    vacio(pedido.obras), JSON.stringify(pedido.obras).slice(0, 160));
  check('Ni ningún coste extra', vacio(pedido.extras), JSON.stringify(pedido.extras).slice(0, 160));
  check('Ni las cuentas de ninguna obra',
    vacio(pedido.cuentas), JSON.stringify(pedido.cuentas).slice(0, 160));
  check('Ni las obras del calendario',
    vacio(pedido.calendario), JSON.stringify(pedido.calendario).slice(0, 160));

  // Lo que sí ve: su proyecto, y sin una sola cifra de dinero.
  await m.locator('.w-tabbar a:has-text("Trabajos")').click();
  await m.waitForTimeout(1200);
  const suProyecto = await m.locator('.w-content').innerText();
  check('El trabajador sigue viendo el proyecto que tiene asignado',
    suProyecto.includes(`PROY-${YEAR}-001`), suProyecto.replace(/\n/g, ' · ').slice(0, 200));
  check('Pero sin el importe de la obra, ni lo facturado, ni los extras',
    !suProyecto.includes('5.000') && !suProyecto.includes('450')
    && !suProyecto.includes('OBRA-'), suProyecto.replace(/\n/g, ' · ').slice(0, 300));

  await m.locator('.w-tabbar a:has-text("Calendario")').click();
  await m.waitForTimeout(1300);
  check('Y en su calendario no aparece ninguna obra',
    !(await m.locator('.w-content').innerText()).includes('OBRA-'));

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
