/**
 * METALPLAFER360 · Órdenes de trabajo y área móvil del trabajador.
 *
 *   npm run test:fase4
 *
 * Recorre de verdad, en un navegador real, lo que hará la empresa:
 * administración crea una orden con varios trabajadores, el trabajador
 * la abre desde el móvil, escribe el trabajo realizado, apunta sus horas,
 * añade una fotografía, firma con el dedo y la envía. Administración la
 * devuelve con motivo, el trabajador la corrige y se valida.
 *
 * Las reglas de seguridad de verdad se prueban contra PostgreSQL
 * en tests/sql/40_tests_fase4.sql.
 */
import {
  ADMIN, WORKER, YEAR, addDays, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4182;
const HOY = today();
const MANANA = addDays(HOY, 7);

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
    { id: 'c2', kind: 'particular', name: 'Laura Sanz', tax_id: null, phone: '699888777',
      email: null, address: 'Carrer de Calders, 9', city: 'Castellar del Vallès',
      postal_code: '08211', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-02T09:00:00Z', updated_at: '2026-03-02T09:00:00Z' },
  ],
  projects: [
    { id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1', contact_id: null, source_ficha_id: null,
      name: 'Barandilla escalera comunitaria',
      description: 'Barandilla de acero para escalera de 4 plantas.',
      measures: '4 tramos · 3,20 m', finish: 'Negro forja', location: 'Escalera principal',
      address: 'Rambla, 45 · Sabadell', observations: null,
      budget_amount: 6400.5, advance_amount: 2000, budget_hours_fab: 40, budget_hours_mont: 16,
      phase: 'fabricacion', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: false,
      created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z' },
    { id: 'p2', code: `PROY-${YEAR}-002`, client_id: 'c2', contact_id: null, source_ficha_id: null,
      name: 'Rejas ventanas planta baja', description: null,
      measures: null, finish: null, location: null,
      address: 'Carrer de Calders, 9', observations: null,
      budget_amount: 2400, advance_amount: null, budget_hours_fab: 18, budget_hours_mont: 6,
      phase: 'preparacion', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: false,
      created_at: '2026-05-04T09:00:00Z', updated_at: '2026-05-04T09:00:00Z' },
  ],
  counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 2, OT: 0 },
});

const people = [ADMIN, WORKER, PEDRO];
const browser = await launchBrowser();

try {
  // ===================== ADMINISTRACIÓN: CREAR LA ORDEN =====================
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db, getUser: () => ADMIN, people });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await signIn(page, PORT, 'salvi');

  await page.locator('.sidebar nav a:has-text("Órdenes de trabajo")').click();
  await page.waitForTimeout(600);
  check('El menú ya no marca las órdenes como pendientes',
    await page.locator('.sidebar nav a:has-text("Órdenes de trabajo") .soon').count() === 0);
  check('Se abre el listado de órdenes', page.url().includes('#/admin/ordenes'));
  check('Sin órdenes explica cómo se numeran',
    (await page.locator('.empty').innerText()).includes('OT-2026-001'));

  await page.locator('a:has-text("Nueva orden")').click();
  await page.waitForTimeout(600);
  check('El formulario recuerda que la orden lleva solo fecha',
    (await page.locator('.page-head .sub').innerText()).includes('solo fecha'));
  check('No se pide hora de inicio ni de fin',
    await page.locator('input[type="time"]').count() === 0);
  check('No existe ningún botón de «Iniciar orden»',
    await page.locator('button:has-text("Iniciar")').count() === 0);

  await page.locator('button:has-text("Crear orden")').click();
  await page.waitForTimeout(400);
  check('Una orden sin proyecto avisa de que hay que elegirlo',
    (await page.locator('.alert-danger').innerText()).includes('Elige el proyecto'));

  await page.locator('#ot-project').selectOption('p1');
  await page.locator('button:has-text("Crear orden")').click();
  await page.waitForTimeout(400);
  check('Una orden sin trabajo a realizar tampoco se crea',
    (await page.locator('.alert-danger').innerText()).includes('trabajo a realizar'));

  await page.locator('#ot-date').fill(HOY);
  await page.locator('#ot-desc').fill('Cortar pletina, soldar los cuatro marcos y preparar barrotes.');
  await page.locator('#ot-hours').fill('18');
  await page.locator('#ot-notes').fill('El material llegó ayer al taller.');

  const casillas = page.locator('.panel:has-text("Trabajadores asignados") .checkbox');
  check('Se pueden asignar varios trabajadores a la vez', await casillas.count() === 2);
  check('Se dice expresamente que no hay responsable principal',
    (await page.locator('.panel:has(h2:has-text("Trabajadores asignados")) .hint').innerText())
      .includes('No hay responsable principal'));
  await casillas.nth(0).locator('input').check();
  await casillas.nth(1).locator('input').check();

  await page.locator('button:has-text("Crear orden")').click();
  await page.waitForTimeout(900);

  const codigo = (await page.locator('.plate-dark').first().innerText()).trim();
  check('La orden recibe el código OT-AAAA-###',
    new RegExp(`^OT-${YEAR}-\\d{3}$`).test(codigo), codigo);
  check('Nace en estado Pendiente',
    (await page.locator('.page-head .sub').innerText()).includes('Pendiente'));
  check('Muestra el proyecto y el cliente de la orden',
    (await page.locator('.page-head .sub').innerText()).includes(`PROY-${YEAR}-001`));
  check('Los dos trabajadores aparecen con su parte vacío',
    await page.locator('.part-list li').count() === 2);
  check('Todavía no hay horas reales apuntadas',
    (await page.locator('.panel:has(h2:has-text("Partes de trabajo"))').innerText()).includes('0 de 2'));

  const orderId = page.url().split('/ordenes/')[1];

  // Segunda orden, para dentro de una semana: el trabajador podrá verla,
  // pero no tocarla.
  await page.goto(`http://localhost:${PORT}/#/admin/ordenes/nueva`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('#ot-project').selectOption('p1');
  await page.locator('#ot-type').selectOption('montaje');
  await page.locator('#ot-date').fill(MANANA);
  await page.locator('#ot-desc').fill('Montar la barandilla con tacos químicos.');
  await page.locator('#ot-hours').fill('6');
  await page.locator('.panel:has-text("Trabajadores asignados") .checkbox input').first().check();
  await page.locator('button:has-text("Crear orden")').click();
  await page.waitForTimeout(900);
  check('La numeración avanza de una en una',
    (await page.locator('.plate-dark').first().innerText()).endsWith('002'));

  // Orden de otro proyecto, sin Juan: no debe verla nunca
  await page.goto(`http://localhost:${PORT}/#/admin/ordenes/nueva`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('#ot-project').selectOption('p2');
  await page.locator('#ot-date').fill(HOY);
  await page.locator('#ot-desc').fill('Orden de otro proyecto, ajena a Juan.');
  await page.locator('.panel:has-text("Trabajadores asignados") .checkbox').nth(1).locator('input').check();
  await page.locator('button:has-text("Crear orden")').click();
  await page.waitForTimeout(900);

  await page.goto(`http://localhost:${PORT}/#/admin/ordenes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  check('El listado muestra las tres órdenes', await page.locator('tbody tr').count() === 3);

  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('El proyecto muestra sus órdenes de trabajo',
    await page.locator('.panel:has(h2:has-text("Órdenes de trabajo")) .mini-list li').count() === 2);

  check('No hay errores de JavaScript en administración', errors.length === 0, errors[0]);
  await ctx.close();

  // ===================== EL TRABAJADOR, EN EL MÓVIL =====================
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(movil, { db, getUser: () => WORKER, people });
  const m = await movil.newPage();
  const merrors = [];
  m.on('pageerror', (e) => merrors.push(String(e)));

  await signIn(m, PORT, 'juan');
  await m.waitForTimeout(800);
  check('El trabajador entra en su zona', m.url().includes('#/t'));

  const inicio = await m.locator('.w-content').innerText();
  check('El inicio muestra las órdenes de hoy', inicio.includes('Órdenes de hoy'));
  check('Y las próximas', inicio.includes('Próximas'));
  check('Y el apartado de avisos', inicio.includes('Avisos'));
  check('Le ha llegado el aviso de la orden asignada', inicio.includes('Nueva orden asignada'));
  check('Solo ve una orden para hoy',
    await m.locator('.w-section:has(h2:has-text("Órdenes de hoy")) .ot-card').count() === 1);
  check('No ve la orden del otro proyecto',
    !inicio.includes('Orden de otro proyecto'));
  check('Avisa de que las futuras no se rellenan antes de tiempo',
    inicio.includes('no se rellenan hasta su fecha'));

  const sinScroll = await m.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('En el móvil no hay desplazamiento horizontal', sinScroll <= 0, `sobran ${sinScroll}px`);

  // --- La orden futura se consulta, pero no se toca
  await m.locator('.w-tabbar a:has-text("Mis órdenes")').click();
  await m.waitForTimeout(700);
  check('«Mis órdenes» separa Hoy, Próximas y Por enviar',
    (await m.locator('.tabs').innerText()).includes('Por enviar'));
  await m.locator('.tabs button:has-text("Próximas")').click();
  await m.waitForTimeout(400);
  await m.locator('.ot-card').first().click();
  await m.waitForTimeout(800);
  const futura = await m.locator('.w-content').innerText();
  check('La orden futura se puede consultar', futura.includes('Trabajo a realizar'));
  check('Y avisa de que todavía no se rellena', futura.includes('no se rellena hasta ese día'));
  check('No ofrece escribir el trabajo realizado', await m.locator('#ot-done').count() === 0);
  check('Ni apuntar horas', await m.locator('#ot-hours').count() === 0);
  check('Ni firmar', await m.locator('button:has-text("Firmar")').count() === 0);
  check('Ni enviarla', await m.locator('button:has-text("Enviar a revisión")').count() === 0);

  // --- La orden de hoy
  await m.goto(`http://localhost:${PORT}/#/t`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(800);
  await m.locator('.w-section:has(h2:has-text("Órdenes de hoy")) .ot-card').first().click();
  await m.waitForTimeout(800);

  const detalle = await m.locator('.w-content').innerText();
  check('La orden de hoy muestra el trabajo a realizar', detalle.includes('Cortar pletina'));
  check('Y la dirección del trabajo', detalle.includes('Rambla, 45'));
  check('Y el cliente', detalle.includes('García Construcciones SL'));
  check('Y las horas previstas de la orden', detalle.includes('18 h'));
  check('Y con quién va', detalle.includes('Pedro Navarro'));
  check('El trabajo a realizar no se puede modificar',
    await m.locator('textarea[readonly], #ot-description').count() === 0);
  check('No hay botón de iniciar la orden',
    await m.locator('button:has-text("Iniciar")').count() === 0);

  // Enviar sin escribir nada
  await m.locator('button:has-text("Enviar a revisión")').click();
  await m.waitForTimeout(500);
  check('No deja enviar sin escribir el trabajo realizado',
    (await m.locator('.toast.error').last().innerText()).includes('trabajo realizado'));
  await m.waitForTimeout(400);

  await m.locator('#ot-done').fill('Cortada la pletina y soldados los cuatro marcos.');
  await m.locator('button:has-text("Enviar a revisión")').click();
  await m.waitForTimeout(600);
  check('Ni sin apuntar las horas',
    (await m.locator('.toast.error').last().innerText()).includes('horas'));

  await m.locator('#ot-hours').fill('30');
  await m.locator('button:has-text("Enviar a revisión")').click();
  await m.waitForTimeout(600);
  check('Una jornada de 30 horas se rechaza',
    (await m.locator('.toast.error').last().innerText()).includes('entre 0 y 24'));

  // Guardar sin enviar: la orden pasa sola a En curso
  await m.locator('#ot-hours').fill('7,5');
  await m.locator('button:has-text("Guardar")').first().click();
  await m.waitForTimeout(900);
  check('Al guardar, la orden pasa sola a En curso, sin pulsar «iniciar»',
    (await m.locator('.badge').first().innerText()).includes('En curso'));
  check('Las horas admiten decimales a la española',
    (await m.locator('#ot-hours').inputValue()).replace('.', ',') === '7,5');

  // Fotografía desde la galería
  await m.locator('input[type="file"]').nth(1).setInputFiles({
    name: 'marco-soldado.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('foto-de-prueba'),
  });
  await m.waitForTimeout(1200);
  check('La fotografía se añade a la orden',
    await m.locator('.photo-grid li').count() === 1);
  check('Se puede hacer la foto con la cámara',
    await m.locator('input[capture="environment"]').count() === 1);

  // Firma con el dedo
  await m.locator('button:has-text("Firmar con el dedo")').click();
  await m.waitForTimeout(400);
  check('Aparece el recuadro para firmar', await m.locator('.sign-canvas').count() === 1);
  check('La firma se puede borrar antes de guardarla',
    await m.locator('.sign-actions button:has-text("Borrar")').count() === 1);

  await m.locator('.sign-canvas').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await m.waitForTimeout(400);
  const caja = await m.locator('.sign-canvas').boundingBox();
  await m.mouse.move(caja.x + 30, caja.y + 60);
  await m.mouse.down();
  await m.mouse.move(caja.x + 90, caja.y + 30, { steps: 8 });
  await m.mouse.move(caja.x + 160, caja.y + 70, { steps: 8 });
  await m.mouse.up();
  await m.waitForTimeout(300);
  await m.locator('.sign-actions button:has-text("Guardar firma")').click();
  await m.waitForTimeout(1400);
  check('La firma queda guardada en la orden',
    await m.locator('.sign-preview').count() === 1);

  // Enviar
  await m.locator('button:has-text("Enviar a revisión")').click();
  await m.waitForTimeout(400);
  check('Antes de enviar avisa de que ya no podrá modificarla',
    (await m.locator('.modal').innerText()).includes('ya no podrás modificarla'));
  await m.locator('.modal-foot button:has-text("Enviar")').click();
  await m.waitForTimeout(1200);

  check('Con un compañero sin enviar, la orden sigue En curso',
    (await m.locator('.badge').first().innerText()).includes('En curso'));
  check('Enviado su parte, Juan lo ve cerrado y esperando a su compañero',
    (await m.locator('.alert-ok').innerText()).includes('Falta que lo envíen tus compañeros'));
  check('Aunque puede corregirlo mientras no esté en revisión',
    await m.locator('.alert-ok button:has-text("Corregir")').count() === 1);
  check('No hay errores de JavaScript en el móvil', merrors.length === 0, merrors[0]);
  await movil.close();

  // --- Pedro envía su parte y la orden queda pendiente de revisión
  const movilPedro = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(movilPedro, { db, getUser: () => PEDRO, people });
  const mp = await movilPedro.newPage();
  await signIn(mp, PORT, 'pedro');
  await mp.goto(`http://localhost:${PORT}/#/t/ordenes/${orderId}`, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(900);
  check('Pedro empieza con su parte en blanco: no ve el de Juan',
    (await mp.locator('#ot-done').inputValue()) === ''
    && (await mp.locator('#ot-hours').inputValue()) === '');
  await mp.locator('#ot-done').fill('Preparados y repasados los barrotes.');
  await mp.locator('#ot-hours').fill('6');
  await mp.locator('button:has-text("Enviar a revisión")').click();
  await mp.waitForTimeout(400);
  await mp.locator('.modal-foot button:has-text("Enviar")').click();
  await mp.waitForTimeout(1200);
  check('Enviados los dos partes, la orden queda pendiente de revisión',
    (await mp.locator('.badge').first().innerText()).includes('Pendiente de revisión')
    || (await mp.locator('.alert-warn').innerText()).includes('pendiente de revisión'));
  await movilPedro.close();

  // ===================== REVISIÓN: DEVOLVER Y VALIDAR =====================
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'es-ES' });
  await stubSupabase(ctx2, { db, getUser: () => ADMIN, people });
  const a = await ctx2.newPage();
  const aerrors = [];
  a.on('pageerror', (e) => aerrors.push(String(e)));

  await signIn(a, PORT, 'salvi');
  await a.waitForTimeout(600);
  await a.locator('.topbar .bell-wrap button').click();
  await a.waitForTimeout(600);
  check('Administración recibe el aviso de la orden enviada',
    (await a.locator('.bell-panel').innerText()).includes('pendiente de revisión'));
  await a.keyboard.press('Escape');

  await a.goto(`http://localhost:${PORT}/#/admin/ordenes/${orderId}`, { waitUntil: 'networkidle' });
  await a.waitForTimeout(900);
  const revision = await a.locator('.w-content, .content').innerText();
  check('La orden muestra el trabajo realizado de cada persona',
    revision.includes('Cortada la pletina') && revision.includes('barrotes'));
  check('Y las horas de cada uno', revision.includes('7,5 h') && revision.includes('6 h'));
  check('Y el total real frente a las previstas', revision.includes('13,5 h'));

  await a.locator('.alert button:has-text("Devolver")').click();
  await a.waitForTimeout(500);
  check('La devolución exige un motivo escrito',
    await a.locator('.modal-foot button:has-text("Devolver")').isDisabled());
  await a.locator('#ot-reason').fill('Faltan las fotografías de los marcos soldados.');
  await a.locator('.modal-foot button:has-text("Devolver")').click();
  await a.waitForTimeout(1200);
  check('La orden queda Devuelta con su motivo',
    (await a.locator('.alert-danger').innerText()).includes('Faltan las fotografías'));
  check('El motivo queda también como comentario',
    (await a.locator('.panel:has(h2:has-text("Comentarios"))').innerText()).includes('Orden devuelta. Motivo'));
  await ctx2.close();

  // --- El trabajador ve la devolución y la corrige
  const movil2 = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(movil2, { db, getUser: () => WORKER, people });
  const m2 = await movil2.newPage();
  await signIn(m2, PORT, 'juan');
  await m2.waitForTimeout(900);
  const aviso = await m2.locator('.w-content').innerText();
  check('El trabajador ve la devolución en «Requieren tu atención»',
    aviso.includes('Requieren tu atención') && aviso.includes('Faltan las fotografías'));

  await m2.goto(`http://localhost:${PORT}/#/t/ordenes/${orderId}`, { waitUntil: 'networkidle' });
  await m2.waitForTimeout(900);
  check('Devuelta, vuelve a poder escribir el trabajo realizado',
    await m2.locator('#ot-done').count() === 1);
  check('Conserva lo que ya había escrito',
    (await m2.locator('#ot-done').inputValue()).includes('Cortada la pletina'));
  await m2.locator('#ot-done').fill('Cortada la pletina, soldados los marcos. Añadidas las fotografías.');
  await m2.locator('#ot-hours').fill('8');
  await m2.locator('button:has-text("Enviar a revisión")').click();
  await m2.waitForTimeout(400);
  await m2.locator('.modal-foot button:has-text("Enviar")').click();
  await m2.waitForTimeout(1200);
  await movil2.close();

  const movilPedro2 = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(movilPedro2, { db, getUser: () => PEDRO, people });
  const mp2 = await movilPedro2.newPage();
  await signIn(mp2, PORT, 'pedro');
  await mp2.goto(`http://localhost:${PORT}/#/t/ordenes/${orderId}`, { waitUntil: 'networkidle' });
  await mp2.waitForTimeout(900);
  await mp2.locator('#ot-done').fill('Barrotes preparados y repasados.');
  await mp2.locator('#ot-hours').fill('6');
  await mp2.locator('button:has-text("Enviar a revisión")').click();
  await mp2.waitForTimeout(400);
  await mp2.locator('.modal-foot button:has-text("Enviar")').click();
  await mp2.waitForTimeout(1200);
  await movilPedro2.close();

  // --- Validar
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'es-ES' });
  await stubSupabase(ctx3, { db, getUser: () => ADMIN, people });
  const v = await ctx3.newPage();
  v.on('pageerror', (e) => aerrors.push(String(e)));
  await signIn(v, PORT, 'salvi');
  await v.goto(`http://localhost:${PORT}/#/admin/ordenes/${orderId}`, { waitUntil: 'networkidle' });
  await v.waitForTimeout(900);
  await v.locator('.alert button:has-text("Validar")').click();
  await v.waitForTimeout(400);
  check('Validar avisa de que después no se podrá modificar',
    (await v.locator('.modal').innerText()).includes('ya no podrán modificarla'));
  await v.locator('.modal-foot button:has-text("Validar")').click();
  await v.waitForTimeout(1200);
  check('La orden queda Validada con su fecha',
    (await v.locator('.alert-ok').innerText()).includes('Validada el'));
  check('El historial recoge todo el recorrido de la orden',
    (await v.locator('.panel:has(h2:has-text("Historial"))').innerText()).includes('validó la orden'));

  check('No hay errores de JavaScript en la revisión', aerrors.length === 0, aerrors[0]);
  await ctx3.close();

  // --- El trabajador lo ve validado y en su historial
  const movil3 = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(movil3, { db, getUser: () => WORKER, people });
  const m3 = await movil3.newPage();
  const m3errors = [];
  m3.on('pageerror', (e) => m3errors.push(String(e)));
  await signIn(m3, PORT, 'juan');
  await m3.goto(`http://localhost:${PORT}/#/t/ordenes/${orderId}`, { waitUntil: 'networkidle' });
  await m3.waitForTimeout(900);
  check('El trabajador ve la orden validada',
    (await m3.locator('.alert-ok').innerText()).includes('Orden validada'));
  check('Validada, ya no puede modificar nada', await m3.locator('#ot-done').count() === 0);

  await m3.locator('.w-tabbar a:has-text("Historial")').click();
  await m3.waitForTimeout(900);
  const historial = await m3.locator('.w-content').innerText();
  check('El historial suma sus horas de la semana', historial.includes('Esta semana'));
  check('Y muestra la orden ya cerrada', historial.includes('Validada'));
  check('Solo cuenta sus propias horas (8 h, no las de Pedro)', historial.includes('8 h'));

  await m3.goto(`http://localhost:${PORT}/#/t/ordenes`, { waitUntil: 'networkidle' });
  await m3.waitForTimeout(800);
  await m3.locator('.tabs button:has-text("Por enviar")').click();
  await m3.waitForTimeout(400);
  check('Ya no le queda ninguna orden por enviar',
    (await m3.locator('.empty').innerText()).includes('Buen trabajo'));

  check('No hay errores de JavaScript en el cierre', m3errors.length === 0, m3errors[0]);
  await movil3.close();

  // ===================== PERMISOS DESDE LA PANTALLA =====================
  const movil4 = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(movil4, { db, getUser: () => WORKER, people });
  const m4 = await movil4.newPage();
  await signIn(m4, PORT, 'juan');

  await m4.goto(`http://localhost:${PORT}/#/admin/ordenes`, { waitUntil: 'networkidle' });
  await m4.waitForTimeout(900);
  check('Un trabajador que escribe la dirección de administración es devuelto a su zona',
    m4.url().includes('#/t'));

  const ajena = db.work_orders.find((o) => o.project_id === 'p2');
  await m4.goto(`http://localhost:${PORT}/#/t/ordenes/${ajena.id}`, { waitUntil: 'networkidle' });
  await m4.waitForTimeout(1000);
  check('Una orden que no es suya no se abre, aunque escriba su dirección',
    !(await m4.locator('body').innerText()).includes('Orden de otro proyecto'));
  await movil4.close();
} finally {
  await browser.close();
}

server.close();
process.exit(report() ? 1 : 0);
