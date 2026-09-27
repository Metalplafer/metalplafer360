/**
 * METALPLAFER360 · Material, calendario, avisos y facturación.
 *
 *   npm run test:fase5
 *
 * Recorre en un navegador real lo que hará la empresa: anotar material
 * con su proveedor, marcarlo recibido, recibir el aviso de un retraso,
 * revisar lo que comunica un trabajador desde la obra, mover una orden
 * en el calendario arrastrándola y apuntar cobros parciales.
 *
 * Las reglas de seguridad de verdad se prueban contra PostgreSQL
 * en tests/sql/50_tests_fase5.sql.
 */
import {
  ADMIN, WORKER, YEAR, addDays, buildApp, createChecker, createDb, launchBrowser,
  mondayOf, serveApp, signIn, startOfMonth, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4183;
const HOY = today();
const AYER = addDays(HOY, -3);
const PROXIMO = addDays(HOY, 4);
const MANANA = addDays(HOY, 1);

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: null, address: 'Carrer de la Indústria, 12', city: 'Sabadell',
      postal_code: '08202', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  projects: [
    { id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1', contact_id: null, source_ficha_id: null,
      name: 'Barandilla escalera comunitaria',
      description: 'Barandilla de acero para escalera de 4 plantas.',
      measures: '4 tramos · 3,20 m', finish: 'Negro forja', location: 'Escalera principal',
      address: 'Rambla, 45 · Sabadell', observations: null,
      budget_amount: 5000, advance_amount: null, budget_hours_fab: 40, budget_hours_mont: 16,
      phase: 'fabricacion', no_assembly: false, billing_status: 'pendiente_cobro',
      finished_at: null, archived_at: null, is_demo: false,
      created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z' },
  ],
  work_orders: [
    { id: 'o1', code: `OT-${YEAR}-001`, project_id: 'p1', type: 'fabricacion', scheduled_date: HOY,
      description: 'Cortar pletina y soldar los marcos.', planned_hours: 18, admin_notes: null,
      status: 'en_curso', submitted_at: null, validated_at: null, validated_by: null,
      returned_at: null, return_reason: null, archived_at: null, is_demo: false,
      created_at: '2026-05-10T09:00:00Z', updated_at: '2026-05-10T09:00:00Z' },
  ],
  work_order_workers: [
    { order_id: 'o1', worker_id: WORKER.id, work_done: null, hours: null, submitted_at: null,
      assigned_at: '2026-05-10T09:00:00Z', updated_at: '2026-05-10T09:00:00Z', is_demo: false },
  ],
  materials: [
    { id: 'm1', project_id: 'p1', order_id: null, name: 'Pletina 40×8 mm', units: 12,
      supplier: 'Aceros Vallès', ordered_on: addDays(HOY, -10), expected_on: AYER,
      received: false, notes: 'Cortada a 3 metros.', late_notified_on: null,
      archived_at: null, is_demo: false,
      created_at: '2026-05-11T09:00:00Z', updated_at: '2026-05-11T09:00:00Z' },
  ],
  counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 1, OT: 1 },
});

const people = [ADMIN, WORKER];
const browser = await launchBrowser();

try {
  // ===================== MATERIAL =====================
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db, getUser: () => ADMIN, people });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await signIn(page, PORT, 'salvi');

  await page.locator('.sidebar nav a:has-text("Material pendiente")').click();
  await page.waitForTimeout(800);
  check('El menú ya no marca el material como pendiente de construir',
    await page.locator('.sidebar nav a:has-text("Material pendiente") .soon').count() === 0);
  check('Se abre el material pendiente', page.url().includes('#/admin/material'));
  check('Muestra el material con su proveedor y sus fechas',
    (await page.locator('tbody').innerText()).includes('Aceros Vallès'));
  check('El material con la fecha pasada se marca como retrasado',
    await page.locator('tbody .badge.tone-red').count() === 1);

  await page.locator('button:has-text("Nuevo material")').click();
  await page.waitForTimeout(500);
  check('El formulario recuerda lo que NO se guarda',
    (await page.locator('.modal').innerText()).includes('No se guarda el precio'));
  check('No pide precio', await page.locator('.modal input#mat-price, .modal input[name="price"]').count() === 0);
  check('Ni número de pedido',
    !(await page.locator('.modal').innerText()).toLowerCase().includes('número de pedido:'));

  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(400);
  check('Un material sin nombre avisa',
    (await page.locator('.modal .alert-danger').innerText()).includes('qué material falta'));

  await page.locator('#mat-name').fill('Bisagras inoxidables');
  await page.locator('#mat-units').fill('6');
  await page.locator('#mat-supplier').click();
  await page.waitForTimeout(600);
  check('Al escribir el proveedor propone los ya utilizados',
    await page.locator('.suggest-box button:has-text("Aceros Vallès")').count() === 1);
  await page.locator('.suggest-box button:has-text("Aceros Vallès")').click();
  check('Al elegirlo se rellena el campo',
    (await page.locator('#mat-supplier').inputValue()) === 'Aceros Vallès');

  await page.locator('#mat-supplier').fill('Ferretería Sabadell');
  await page.locator('#mat-project').selectOption('p1');
  await page.locator('#mat-expected').fill(PROXIMO);
  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(900);
  check('El material nuevo aparece en el listado',
    (await page.locator('tbody').innerText()).includes('Bisagras inoxidables'));
  check('Un proveedor nuevo se escribe libremente',
    (await page.locator('tbody').innerText()).includes('Ferretería Sabadell'));

  // Marcar recibido
  const fila = page.locator('tbody tr:has-text("Bisagras inoxidables")');
  await fila.locator('input[type="checkbox"]').click();
  await page.waitForTimeout(900);
  check('Marcar recibido no pide ni fecha ni firma: se marca y ya está',
    await page.locator('.modal').count() === 0);
  check('Lo confirma con un aviso',
    (await page.locator('.toast.success').last().innerText()).includes('recibido'));

  await page.locator('.tabs button:has-text("Pendiente")').first().click();
  await page.waitForTimeout(700);
  check('El material recibido sale de la lista de pendientes',
    !(await page.locator('tbody').innerText()).includes('Bisagras inoxidables'));

  await page.locator('.tabs button:has-text("Retrasado")').click();
  await page.waitForTimeout(700);
  check('La pestaña de retrasados muestra solo lo que llega tarde',
    (await page.locator('tbody').innerText()).includes('Pletina')
    && await page.locator('tbody tr').count() === 1);

  // ===================== AVISO DE RETRASO =====================
  await page.locator('.topbar .bell-wrap button').click();
  await page.waitForTimeout(900);
  check('La campana avisa del material retrasado',
    (await page.locator('.bell-panel').innerText()).includes('Material retrasado'));
  check('Y dice para cuándo estaba previsto',
    (await page.locator('.bell-panel').innerText()).includes('estaba previsto para el'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  check('No hay errores de JavaScript en el material', errors.length === 0, errors[0]);

  // ===================== EL TRABAJADOR COMUNICA QUE FALTA MATERIAL =====================
  await ctx.close();
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(movil, { db, getUser: () => WORKER, people });
  const m = await movil.newPage();
  const merrors = [];
  m.on('pageerror', (e) => merrors.push(String(e)));

  await signIn(m, PORT, 'juan');
  await m.goto(`http://localhost:${PORT}/#/t/ordenes/o1`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(1000);

  check('El trabajador tiene un botón para avisar de que falta material',
    await m.locator('button:has-text("Avisar de que falta material")').count() === 1);
  await m.locator('button:has-text("Avisar de que falta material")').click();
  await m.waitForTimeout(500);
  check('Se le explica que lo revisa administración',
    (await m.locator('.modal').innerText()).includes('Administración'));
  await m.locator('#mat-req').fill('Faltan 3 bisagras');
  await m.locator('.modal-foot button:has-text("Enviar aviso")').click();
  await m.waitForTimeout(1000);
  check('El aviso se envía',
    (await m.locator('.toast.success').last().innerText()).includes('Aviso enviado'));
  check('Y NO se crea material automáticamente',
    db.materials.filter((x) => x.name.includes('bisagras')).length === 0);

  // El trabajador tiene calendario, pero solo de lo suyo
  await m.locator('.w-tabbar a:has-text("Calendario")').click();
  await m.waitForTimeout(1000);
  const calTrabajador = await m.locator('.w-content').innerText();
  check('El trabajador tiene su calendario', calTrabajador.includes('Calendario'));
  check('Con su orden de hoy', calTrabajador.includes(`OT-${YEAR}-001`));
  check('No puede arrastrar nada',
    await m.locator('.cal-event[draggable="true"]').count() === 0);
  check('No ve el filtro por trabajador', await m.locator('#cal-worker').count() === 0);
  check('No hay errores de JavaScript en el móvil', merrors.length === 0, merrors[0]);
  await movil.close();

  // ===================== REVISAR EL AVISO DEL TALLER =====================
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'es-ES' });
  await stubSupabase(ctx2, { db, getUser: () => ADMIN, people });
  const a = await ctx2.newPage();
  const aerrors = [];
  a.on('pageerror', (e) => aerrors.push(String(e)));

  await signIn(a, PORT, 'salvi');
  await a.goto(`http://localhost:${PORT}/#/admin/material`, { waitUntil: 'networkidle' });
  await a.waitForTimeout(900);

  check('La pestaña de avisos del taller lleva la cuenta',
    (await a.locator('.tabs button:has-text("Avisos del taller")').innerText()).includes('1'));
  await a.locator('.tabs button:has-text("Avisos del taller")').click();
  await a.waitForTimeout(700);
  const avisos = await a.locator('.request-list').innerText();
  check('Se ve lo que comunicó el trabajador', avisos.includes('Faltan 3 bisagras'));
  check('Y quién lo comunicó', avisos.includes('Juan Ortega'));
  check('Se dice claramente que no se convierte solo en material',
    (await a.locator('.panel-body').first().innerText()).includes('No se convierte en material'));

  await a.locator('.request-list button:has-text("Anotar como material")').click();
  await a.waitForTimeout(600);
  check('Al aceptarlo se abre el formulario con lo que dijo el trabajador',
    (await a.locator('#mat-name').inputValue()) === 'Faltan 3 bisagras');
  await a.locator('#mat-name').fill('Bisagras inox 40 mm');
  await a.locator('#mat-units').fill('3');
  await a.locator('#mat-supplier').fill('Ferretería Sabadell');
  await a.locator('#mat-expected').fill(PROXIMO);
  await a.locator('.modal-foot button:has-text("Guardar")').click();
  await a.waitForTimeout(1000);
  check('Ahora sí se crea el material, con los datos de administración',
    db.materials.some((x) => x.name === 'Bisagras inox 40 mm' && x.units === 3));
  check('El aviso queda aceptado',
    db.material_requests[0].status === 'aceptada');
  check('Y enlazado con el material que salió de él',
    db.material_requests[0].material_id === db.materials.find((x) => x.name === 'Bisagras inox 40 mm').id);

  // ===================== CALENDARIO =====================
  await a.locator('.sidebar nav a:has-text("Calendario")').click();
  await a.waitForTimeout(1100);
  check('Se abre el calendario', a.url().includes('#/admin/calendario'));
  check('Empieza en la vista de mes',
    await a.locator('.cal-grid').count() === 1);
  check('Tiene las cuatro vistas',
    (await a.locator('.cal-toolbar').innerText()).includes('Mes')
    && (await a.locator('.cal-toolbar').innerText()).includes('Semana')
    && (await a.locator('.cal-toolbar').innerText()).includes('Día')
    && (await a.locator('.cal-toolbar').innerText()).includes('Agenda'));
  check('La leyenda tiene los cinco tipos de evento',
    await a.locator('.cal-legend-item').count() === 5);
  check('Y ninguna leyenda por trabajador',
    !(await a.locator('.cal-legend').innerText()).includes('Juan Ortega'));
  check('Hay filtro por trabajador', await a.locator('#cal-worker').count() === 1);

  check('La orden de hoy aparece en el calendario',
    (await a.locator('.cal-grid').innerText()).includes(`OT-${YEAR}-001`));
  check('Y el material en su fecha prevista',
    (await a.locator('.cal-grid').innerText()).includes('Bisagras inox 40 mm'));

  check('Solo las órdenes se pueden arrastrar',
    await a.locator('.cal-event[draggable="true"]').count() === 1);

  // Apagar un tipo de evento
  await a.locator('.cal-legend-item:has-text("Material")').click();
  await a.waitForTimeout(400);
  check('Se puede apagar un tipo de evento',
    !(await a.locator('.cal-grid').innerText()).includes('Bisagras inox 40 mm'));
  await a.locator('.cal-legend-item:has-text("Material")').click();
  await a.waitForTimeout(400);

  // Arrastrar la orden a otro día.
  // Se lanzan los eventos de arrastre del navegador (dragstart · dragover ·
  // drop), que es exactamente lo que ocurre al arrastrar con el ratón.
  const antesAvisos = db.notifications.length;
  const inicioRejilla = mondayOf(startOfMonth(HOY));
  const indiceManana = Math.round(
    (Date.parse(`${MANANA}T00:00:00Z`) - Date.parse(`${inicioRejilla}T00:00:00Z`)) / 86400000,
  );
  const origen = a.locator('.cal-event[draggable="true"]').first();
  const destino = a.locator('.cal-grid .cal-day').nth(indiceManana);

  await origen.dispatchEvent('dragstart');
  await destino.dispatchEvent('dragover');
  await destino.dispatchEvent('drop');
  await a.waitForTimeout(1200);

  check('Arrastrar una orden le cambia la fecha',
    db.work_orders[0].scheduled_date === MANANA, db.work_orders[0].scheduled_date);
  check('El cambio de fecha NO avisa al trabajador',
    db.notifications.length === antesAvisos);
  check('Lo confirma en pantalla',
    (await a.locator('.toast.success').last().innerText()).includes('pasa al'));
  check('Y se recuerda que no se avisa a nadie',
    (await a.locator('.panel-body').first().innerText()).includes('no se avisa al trabajador'));

  // Otras vistas
  await a.locator('.cal-toolbar .chip:has-text("Semana")').click();
  await a.waitForTimeout(700);
  check('La vista de semana funciona', await a.locator('.cal-week').count() === 1);
  await a.locator('.cal-toolbar .chip:has-text("Día")').click();
  await a.waitForTimeout(700);
  check('La vista de día funciona', await a.locator('.cal-day-single').count() === 1);
  await a.locator('.cal-toolbar .chip:has-text("Agenda")').click();
  await a.waitForTimeout(700);
  check('La agenda lista lo que viene por días',
    await a.locator('.cal-agenda-day').count() >= 1);

  // ===================== FACTURACIÓN =====================
  await a.locator('.sidebar nav a:has-text("Facturación")').click();
  await a.waitForTimeout(1000);
  check('Se abre la facturación', a.url().includes('#/admin/facturacion'));
  check('Deja claro que no sustituye al programa de facturación',
    (await a.locator('.page-head .sub').innerText()).includes('No sustituye'));

  const fila5000 = await a.locator('tbody tr').first().innerText();
  check('El total sale del presupuesto del proyecto', fila5000.includes('5.000,00'));
  check('Y de momento no hay nada cobrado', fila5000.includes('0,00'));

  await a.locator('tbody button:has-text("Cobro")').first().click();
  await a.waitForTimeout(600);
  check('No se pide el número de factura',
    (await a.locator('.modal').innerText()).includes('No se guarda el número de factura'));

  await a.locator('#pay-amount').fill('2.000');
  await a.locator('#pay-notes').fill('Anticipo');
  await a.locator('.modal button:has-text("Apuntar cobro")').click();
  await a.waitForTimeout(1100);
  const modal = await a.locator('.modal').innerText();
  check('Total 5.000 − cobrado 2.000 = pendiente 3.000',
    modal.includes('5.000,00') && modal.includes('2.000,00') && modal.includes('3.000,00'));
  check('El cobro queda apuntado con su fecha', modal.includes('Anticipo'));
  check('El estado pasa solo a Cobrado parcialmente',
    db.projects[0].billing_status === 'cobrado_parcial');

  await a.locator('#pay-amount').fill('3000');
  await a.locator('.modal button:has-text("Apuntar cobro")').click();
  await a.waitForTimeout(1100);
  check('Al cobrarlo todo el estado pasa solo a Cobrado',
    db.projects[0].billing_status === 'cobrado');

  await a.locator('.modal .mini-list button').first().click();
  await a.waitForTimeout(400);
  await a.locator('.modal-foot button:has-text("Anular")').click();
  await a.waitForTimeout(1100);
  check('Anular un cobro devuelve el proyecto a Cobrado parcialmente',
    db.projects[0].billing_status === 'cobrado_parcial');
  check('El cobro anulado NO se borra: se queda tachado',
    db.payments.length === 2 && db.payments.some((p) => p.voided_at)
    && (await a.locator('.modal .mini-list li.is-voided').count()) === 1);

  await a.locator('.modal-foot button:has-text("Cerrar")').click();
  await a.waitForTimeout(800);
  check('El listado refleja el pendiente',
    (await a.locator('tbody tr').first().innerText()).includes('3.000,00'));

  check('No hay errores de JavaScript en el recorrido', aerrors.length === 0, aerrors[0]);

  // ===================== EL PROYECTO REÚNE TODO =====================
  await a.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await a.waitForTimeout(1100);
  check('El proyecto muestra su material',
    (await a.locator('.panel:has(h2:has-text("Material"))').innerText()).includes('Pletina'));
  check('Y sus cobros',
    (await a.locator('.panel:has(h2:has-text("Cobros"))').innerText()).includes('2.000,00'));

  // ===================== PERMISOS =====================
  await ctx2.close();
  const movil2 = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(movil2, { db, getUser: () => WORKER, people });
  const m2 = await movil2.newPage();
  await signIn(m2, PORT, 'juan');
  await m2.goto(`http://localhost:${PORT}/#/admin/facturacion`, { waitUntil: 'networkidle' });
  await m2.waitForTimeout(900);
  check('Un trabajador que escribe la dirección de facturación vuelve a su zona',
    m2.url().includes('#/t'));
  await m2.goto(`http://localhost:${PORT}/#/admin/material`, { waitUntil: 'networkidle' });
  await m2.waitForTimeout(900);
  check('Tampoco entra en el material',
    m2.url().includes('#/t'));

  const overflow = await m2.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('En el móvil no hay desplazamiento horizontal', overflow <= 0, `sobran ${overflow}px`);
  await movil2.close();
} finally {
  await browser.close();
}

server.close();
process.exit(report() ? 1 : 0);
