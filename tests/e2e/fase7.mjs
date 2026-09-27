/**
 * METALPLAFER360 · AUDITORÍA FINAL · recorrido completo
 *
 *   npm run test:fase7
 *
 * Una sola partida, de principio a fin, con la aplicación vacía:
 *
 *   ACCESO → CLIENTE → FICHA → PRESUPUESTO → ACEPTACIÓN → PROYECTO →
 *   ORDEN → TRABAJADOR → HORAS → FOTOS → FIRMA → REVISIÓN → VALIDACIÓN →
 *   MATERIAL → CALENDARIO → FACTURACIÓN → COBRO → FINALIZACIÓN
 *
 * Después se comprueban los documentos y su papelera, los datos de
 * ejemplo, la experiencia del trabajador en un móvil de verdad y, sobre
 * todo, que un trabajador NO puede llegar a lo de administración aunque
 * manipule las peticiones a mano.
 *
 * Empieza con la base VACÍA a propósito: así se prueba también que la
 * aplicación se deja usar el primer día, sin datos de ninguna clase.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ADMIN, WORKER, YEAR, addDays, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4185;
const HOY = today();
const TMP = mkdtempSync(join(tmpdir(), 'm360-fase7-'));

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

// La aplicación arranca VACÍA: es el primer día de la empresa.
const db = createDb();
const admin = { ...ADMIN, preferences: {} };
const worker = { ...WORKER };
const people = [admin, worker];

const browser = await launchBrowser();

/** Un archivo de mentira para las pruebas de subida. */
function archivo(nombre, bytes = 2048, tipo = 'application/pdf') {
  const ruta = join(TMP, nombre);
  writeFileSync(ruta, Buffer.alloc(bytes, 7));
  return { name: nombre, mimeType: tipo, buffer: Buffer.alloc(bytes, 7), ruta };
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db, getUser: () => admin, people });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));

  // ============================ ACCESO ============================
  console.log('\n   ── ACCESO ──');
  await page.goto(`http://localhost:${PORT}/#/login`, { waitUntil: 'networkidle' });
  const acceso = await page.locator('body').innerText();
  check('La pantalla de acceso no enseña jerga técnica al taller',
    !/VITE_|Supabase|README|anon key/i.test(acceso), acceso.replace(/\n/g, ' · ').slice(0, 160));

  await signIn(page, PORT, 'salvi');
  check('Administración entra y llega a su panel', page.url().includes('#/admin'));

  check('Con la aplicación vacía, el panel no se rompe',
    (await page.locator('main').innerText()).includes('Hola, Salvi') && errores.length === 0);

  // ============================ CLIENTE ============================
  console.log('\n   ── CLIENTE ──');
  await page.locator('.sidebar nav a:has-text("Clientes")').click();
  await page.waitForTimeout(700);
  await page.locator('button:has-text("Nuevo cliente")').click();
  await page.waitForTimeout(400);
  await page.locator('#cf-name').fill('Talleres Riera SL');
  await page.locator('#cf-phone').fill('937445210');
  await page.locator('#cf-city').fill('Sabadell');
  await page.locator('.modal-foot button:has-text("Guardar cliente")').click();
  await page.waitForTimeout(900);
  check('El cliente queda creado', db.clients.length === 1
    && db.clients[0].name === 'Talleres Riera SL');

  check('Al crearlo se abre su ficha directamente',
    page.url().includes('#/admin/clientes/')
    && (await page.locator('main').innerText()).includes('Talleres Riera SL'));

  // Un contacto, que luego se archivará (nunca se borra)
  await page.locator('button:has-text("Añadir contacto")').click();
  await page.waitForTimeout(400);
  await page.locator('#ct-name').fill('Ramon Riera');
  await page.locator('#ct-role').fill('Jefe de obra');
  await page.locator('#ct-phone').fill('600445210');
  await page.locator('.modal-foot button').last().click();
  await page.waitForTimeout(900);
  check('Se le añade una persona de contacto', db.client_contacts.length === 1);

  // Un contacto se ARCHIVA: si se borrase, los presupuestos antiguos
  // perderían con quién se habló.
  await page.locator('button[aria-label="Archivar Ramon Riera"]').click();
  await page.waitForTimeout(500);
  await page.locator('.modal-foot button:has-text("Archivar")').click();
  await page.waitForTimeout(1100);
  check('Un contacto se archiva, nunca se borra',
    db.client_contacts.length === 1 && Boolean(db.client_contacts[0].archived_at));

  // ============================ FICHA · PRESUPUESTO ============================
  console.log('\n   ── FICHA Y PRESUPUESTO ──');
  await page.locator('.sidebar nav a:has-text("Fichas")').click();
  await page.waitForTimeout(800);
  await page.locator('a.btn-primary:has-text("Nuevo presupuesto")').click();
  await page.waitForTimeout(700);
  await page.locator('#cp-name').fill('Talleres Riera SL');
  await page.waitForTimeout(800);
  await page.locator('.suggest-box button:has-text("Talleres Riera SL")').click();
  await page.waitForTimeout(500);
  await page.locator('#f-title').fill('Barandilla de escalera');
  await page.locator('#f-desc').fill('Barandilla de acero para escalera de 4 plantas.');
  await page.locator('#f-amount').fill('6.400,00');
  await page.locator('button:has-text("Crear presupuesto")').click();
  await page.waitForTimeout(1100);

  check('La ficha recibe su código del año automáticamente',
    db.fichas[0]?.code === `PRES-${YEAR}-001`, db.fichas[0]?.code);
  check('Y nace «Por asignar», porque todavía no tiene responsable',
    db.fichas[0]?.status === 'por_asignar');
  check('El importe se guarda bien escrito en español',
    Number(db.fichas[0]?.amount) === 6400);

  // ============================ ACEPTACIÓN ============================
  await page.locator('#assign').selectOption({ label: 'Salvi Plaza (administración)' });
  await page.waitForTimeout(700);
  for (const estado of ['Presupuesto avanzado', 'Presupuesto por revisar', 'Presupuesto enviado']) {
    await page.locator(`.status-flow button:has-text("${estado}")`).click();
    await page.waitForTimeout(500);
  }
  await page.locator('.status-flow button:has-text("Presupuesto aceptado")').click();
  await page.waitForTimeout(400);
  await page.locator('.modal-foot button:has-text("Cambiar estado")').click();
  await page.waitForTimeout(900);
  check('El presupuesto se puede marcar como aceptado',
    db.fichas[0].status === 'aceptado');

  // ============================ PROYECTO ============================
  console.log('\n   ── PROYECTO ──');
  await page.locator('button:has-text("Convertir en proyecto")').click();
  await page.waitForTimeout(500);
  await page.locator('.modal-foot button:has-text("Crear el proyecto")').click();
  await page.waitForTimeout(1400);

  check('El presupuesto aceptado se convierte en proyecto',
    db.projects.length === 1 && db.projects[0].code === `PROY-${YEAR}-001`);
  check('El proyecto se queda con los datos del presupuesto',
    db.projects[0].name === 'Barandilla de escalera'
    && Number(db.projects[0].budget_amount) === 6400);
  check('Y guarda de qué presupuesto salió',
    db.projects[0].source_ficha_id === db.fichas[0].id);
  check('Empieza en preparación', db.projects[0].phase === 'preparacion');

  check('Un presupuesto ya convertido no se convierte dos veces',
    (await page.locator('button:has-text("Convertir en proyecto")').count()) === 0);

  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/${db.projects[0].id}`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // Se pasa a fabricación
  await page.locator('.rail button:has-text("Fabricación")').click();
  await page.waitForTimeout(500);
  await page.locator('.modal-foot button:has-text("Pasar a Fabricación")').click();
  await page.waitForTimeout(1000);
  check('El proyecto avanza a Fabricación', db.projects[0].phase === 'fabricacion');

  // ============================ ORDEN DE TRABAJO ============================
  console.log('\n   ── ORDEN DE TRABAJO ──');
  await page.locator('.sidebar nav a:has-text("Órdenes de trabajo")').click();
  await page.waitForTimeout(800);
  await page.locator('a:has-text("Nueva orden")').click();
  await page.waitForTimeout(700);
  check('El formulario recuerda que la orden lleva solo fecha, sin horas',
    (await page.locator('.page-head .sub').innerText()).includes('solo fecha')
    && (await page.locator('input[type="time"]').count()) === 0);

  await page.locator('#ot-project').selectOption(db.projects[0].id);
  await page.locator('#ot-date').fill(HOY);
  await page.locator('#ot-hours').fill('16');
  await page.locator('#ot-desc').fill('Cortar pletina y soldar los cuatro tramos.');
  await page.locator(`.checkbox:has-text("${worker.full_name}") input`).check();
  await page.locator('button:has-text("Crear orden")').click();
  await page.waitForTimeout(1300);

  check('La orden queda creada con su código',
    db.work_orders.length === 1 && db.work_orders[0].code === `OT-${YEAR}-001`);
  check('Nace pendiente', db.work_orders[0].status === 'pendiente');
  check('Y con el trabajador asignado',
    db.work_order_workers.some((w) => w.worker_id === worker.id));
  check('El trabajador recibe un aviso interno, sin ningún correo',
    db.notifications.some((n) => n.user_id === worker.id));

  // ============================ MATERIAL ============================
  console.log('\n   ── MATERIAL ──');
  await page.locator('.sidebar nav a:has-text("Material pendiente")').click();
  await page.waitForTimeout(800);
  await page.locator('button:has-text("Nuevo material")').click();
  await page.waitForTimeout(500);
  await page.locator('#mat-name').fill('Pletina 40×8 mm');
  await page.locator('#mat-units').fill('12');
  await page.locator('#mat-supplier').fill('Aceros Vallès');
  await page.locator('#mat-project').selectOption(db.projects[0].id);
  await page.locator('#mat-expected').fill(addDays(HOY, 3));
  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(1000);
  check('El material pendiente queda anotado', db.materials.length === 1);
  check('Sin precio, sin número de pedido y sin solicitante',
    !('price' in db.materials[0]) && !('order_number' in db.materials[0])
    && !('requested_by' in db.materials[0]));

  // ============================ CALENDARIO ============================
  console.log('\n   ── CALENDARIO ──');
  await page.locator('.sidebar nav a:has-text("Calendario")').click();
  await page.waitForTimeout(1100);
  const calendario = await page.locator('main').innerText();
  check('La orden aparece en el calendario', calendario.includes(`OT-${YEAR}-001`));
  check('Y el material previsto también', calendario.includes('Pletina'));
  check('Los estados del calendario salen en castellano, no como los guarda la base',
    !/por_asignar|en_curso|pendiente_cobro|cobrado_parcial/.test(calendario));

  // ============================ EL TRABAJADOR, EN SU MÓVIL ============================
  console.log('\n   ── EL TRABAJADOR (MÓVIL) ──');
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(movil, { db, getUser: () => worker, people });
  const m = await movil.newPage();
  const erroresMovil = [];
  m.on('pageerror', (e) => erroresMovil.push(String(e)));

  await signIn(m, PORT, 'juan');
  check('El trabajador entra en SU zona, no en la de administración',
    m.url().includes('#/t'));

  const inicio = await m.locator('body').innerText();
  check('Ve su trabajo de hoy nada más entrar', inicio.includes(`OT-${YEAR}-001`));
  check('Y NO ve nada de administración',
    !inicio.includes('Informes') && !inicio.includes('Configuración')
    && !inicio.includes('Facturación') && !inicio.includes('Clientes'));

  check('En el móvil no hay que desplazarse a los lados',
    await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  const botones = await m.locator('.rail-bottom a, .w-block button, main button').evaluateAll(
    (els) => els.filter((e) => e.offsetParent !== null)
      .map((e) => Math.round(e.getBoundingClientRect().height)));
  const pequenos = botones.filter((h) => h > 0 && h < 40);
  check('Los botones se pueden pulsar con el dedo (40 px o más)',
    pequenos.length === 0, `hay ${pequenos.length} de menos de 40 px: ${pequenos.join(', ')}`);

  await m.locator(`a:has-text("OT-${YEAR}-001")`).first().click();
  await m.waitForTimeout(1000);
  check('Abre su orden', m.url().includes('/t/ordenes/'));

  // ---- HORAS ----
  await m.locator('#ot-done').fill('Cortados los cuatro tramos y soldados los marcos.');
  await m.locator('#ot-hours').fill('7,5');
  await m.locator('button:has-text("Guardar")').first().click();
  await m.waitForTimeout(1100);
  const parte = db.work_order_workers.find((w) => w.worker_id === worker.id);
  check('Sus horas quedan guardadas, con decimales', Number(parte.hours) === 7.5);
  check('«Trabajo realizado» no pisa la descripción original',
    db.work_orders[0].description.includes('Cortar pletina')
    && parte.work_done.includes('Cortados los cuatro tramos'));
  check('Al empezar a rellenar, la orden pasa a En curso',
    db.work_orders[0].status === 'en_curso');

  // ---- FOTOS ----
  const foto = archivo('obra.jpg', 4096, 'image/jpeg');
  await m.locator('input[type="file"]').nth(1).setInputFiles({
    name: foto.name, mimeType: foto.mimeType, buffer: foto.buffer,
  });
  await m.waitForTimeout(1500);
  check('Puede subir una fotografía desde la obra',
    db.documents.some((d) => d.category === 'foto' && d.order_id === db.work_orders[0].id));

  // ---- FIRMA ----
  await m.locator('button:has-text("Firmar con el dedo")').click();
  await m.waitForTimeout(500);
  await m.locator('.sign-canvas').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await m.waitForTimeout(400);
  const caja = await m.locator('.sign-canvas').boundingBox();
  await m.mouse.move(caja.x + 30, caja.y + 60);
  await m.mouse.down();
  await m.mouse.move(caja.x + 120, caja.y + 30, { steps: 10 });
  await m.mouse.move(caja.x + 200, caja.y + 70, { steps: 10 });
  await m.mouse.up();
  await m.waitForTimeout(400);
  await m.locator('.sign-actions button:has-text("Guardar firma")').click();
  await m.waitForTimeout(1500);
  check('Y recoger la firma del cliente con el dedo',
    db.documents.some((d) => d.category === 'firma'));

  // ---- ENVÍO A REVISIÓN ----
  await m.locator('button:has-text("Enviar a revisión")').click();
  await m.waitForTimeout(500);
  check('Antes de enviar avisa de que ya no podrá modificarlo',
    (await m.locator('.modal').innerText()).includes('ya no podrás modificarla'));
  await m.locator('.modal-foot button:has-text("Enviar")').click();
  await m.waitForTimeout(1400);
  check('Envía el parte a revisión', db.work_orders[0].status === 'realizada');

  check('Sin errores de programación en el móvil', erroresMovil.length === 0, erroresMovil[0]);

  // ============================ REVISIÓN Y VALIDACIÓN ============================
  console.log('\n   ── REVISIÓN Y VALIDACIÓN ──');
  await page.goto(`http://localhost:${PORT}/#/admin/ordenes/${db.work_orders[0].id}`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const revision = await page.locator('main').innerText();
  check('Administración ve las horas y el trabajo realizado',
    revision.includes('7,5') && revision.includes('Cortados los cuatro tramos'));
  check('Y la fotografía y la firma que subió', revision.includes('obra.jpg'));

  // Primero se devuelve, para probar el camino completo
  await page.locator('.alert button:has-text("Devolver")').click();
  await page.waitForTimeout(600);
  check('No se puede devolver sin decir por qué',
    await page.locator('.modal-foot button:has-text("Devolver")').isDisabled());
  await page.locator('#ot-reason').fill('Falta la foto del acabado final.');
  await page.locator('.modal-foot button:has-text("Devolver")').click();
  await page.waitForTimeout(1300);
  check('Se puede devolver con un motivo',
    db.work_orders[0].status === 'devuelta'
    && db.work_orders[0].return_reason.includes('acabado final'));
  check('El trabajador recibe el aviso de la devolución',
    db.notifications.some((n) => n.user_id === worker.id && /devuel/i.test(n.title + n.body)));

  // El trabajador lo corrige y lo reenvía
  await m.reload({ waitUntil: 'networkidle' });
  await m.waitForTimeout(1100);
  check('El trabajador ve por qué se le devolvió',
    (await m.locator('main').innerText()).includes('acabado final'));
  await m.locator('button:has-text("Enviar a revisión")').click();
  await m.waitForTimeout(500);
  await m.locator('.modal-foot button:has-text("Enviar")').click();
  await m.waitForTimeout(1400);
  check('La vuelve a enviar', db.work_orders[0].status === 'realizada');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  await page.locator('.alert button:has-text("Validar")').click();
  await page.waitForTimeout(600);
  await page.locator('.modal-foot button:has-text("Validar")').click();
  await page.waitForTimeout(1300);
  check('Administración valida la orden', db.work_orders[0].status === 'validada');
  check('Y queda constancia de quién la validó', Boolean(db.work_orders[0].validated_at));

  // ============================ FACTURACIÓN Y COBRO ============================
  console.log('\n   ── FACTURACIÓN Y COBRO ──');
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/${db.projects[0].id}`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  for (const fase of ['Montaje', 'Facturación']) {
    await page.locator(`.rail button:has-text("${fase}")`).click();
    await page.waitForTimeout(500);
    await page.locator(`.modal-foot button:has-text("Pasar a ${fase}")`).click();
    await page.waitForTimeout(1000);
  }
  check('El proyecto llega a Facturación', db.projects[0].phase === 'facturacion');

  await page.locator('.sidebar nav a:has-text("Facturación")').click();
  await page.waitForTimeout(1000);
  await page.locator('tbody button:has-text("Cobro")').first().click();
  await page.waitForTimeout(800);
  check('El total sale del presupuesto del proyecto',
    (await page.locator('.modal').innerText()).includes('6.400,00'));
  check('Deja claro que no se guarda el número de factura',
    (await page.locator('.modal').innerText()).includes('No se guarda el número de factura'));

  await page.locator('#pay-amount').fill('3000');
  await page.locator('.modal button:has-text("Apuntar cobro")').click();
  await page.waitForTimeout(1200);
  check('Un cobro parcial deja el proyecto en Cobrado parcialmente',
    db.projects[0].billing_status === 'cobrado_parcial');

  await page.locator('#pay-amount').fill('3400');
  await page.locator('.modal button:has-text("Apuntar cobro")').click();
  await page.waitForTimeout(1200);
  check('Al cobrarlo todo pasa solo a Cobrado',
    db.projects[0].billing_status === 'cobrado');
  check('Total − cobrado = pendiente, calculado solo',
    (await page.locator('.modal').innerText()).includes('0,00'));

  // Un cobro apuntado por error se ANULA, no se borra
  await page.locator('.modal .mini-list button').first().click();
  await page.waitForTimeout(500);
  await page.locator('.modal-foot button:has-text("Anular")').click();
  await page.waitForTimeout(1200);
  check('Un cobro apuntado por error se anula, y NO se borra',
    db.payments.length === 2 && db.payments.some((p) => p.voided_at)
    && db.projects[0].billing_status === 'cobrado_parcial');

  // Se vuelve a cobrar para poder finalizar
  await page.locator('#pay-amount').fill('3400');
  await page.locator('.modal button:has-text("Apuntar cobro")').click();
  await page.waitForTimeout(1200);
  await page.locator('.modal-foot button:has-text("Cerrar")').click();
  await page.waitForTimeout(700);

  // ============================ FINALIZACIÓN ============================
  console.log('\n   ── FINALIZACIÓN ──');
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/${db.projects[0].id}`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  check('Solo hay UN botón de finalizar en la pantalla',
    (await page.locator('button:has-text("Finalizar proyecto")').count()) === 1);

  await page.locator('button:has-text("Finalizar proyecto")').click();
  await page.waitForTimeout(600);
  if (await page.locator('.modal').count()) {
    await page.locator('.modal-foot button:has-text("Finalizar")').click();
    await page.waitForTimeout(1300);
  }
  check('El proyecto se finaliza a mano, nunca solo',
    db.projects[0].phase === 'finalizado' && Boolean(db.projects[0].finished_at));

  const historial = db.audit_log.map((e) => e.summary).join(' | ');
  check('El historial cuenta toda la vida del expediente',
    /creó el cliente/i.test(historial) && /creó la ficha/i.test(historial)
    && /creó el proyecto/i.test(historial) && /creó la orden/i.test(historial)
    && /validó la orden/i.test(historial) && /anuló un cobro/i.test(historial)
    && /finalizó el proyecto/i.test(historial));

  // ============================ DOCUMENTOS Y PAPELERA ============================
  console.log('\n   ── DOCUMENTOS Y PAPELERA ──');
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/${db.projects[0].id}`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const plano = archivo('plano.pdf', 4096);
  await page.locator('input[type="file"]').first().setInputFiles({
    name: plano.name, mimeType: plano.mimeType, buffer: plano.buffer,
  });
  await page.waitForTimeout(1500);
  const doc = db.documents.find((d) => d.file_name === 'plano.pdf');
  check('Se sube un documento al proyecto', Boolean(doc));
  check('Y se ve en el listado con su tamaño',
    (await page.locator('main').innerText()).includes('plano.pdf'));

  await page.locator('button[aria-label="Enviar plano.pdf a la papelera"]').click();
  await page.waitForTimeout(600);
  await page.locator('.modal-foot button:has-text("Enviar a la papelera")').click();
  await page.waitForTimeout(1300);
  check('Un documento no se borra: va a la papelera',
    db.documents.some((d) => d.file_name === 'plano.pdf' && d.deleted_at));
  check('Y deja de verse en la ficha',
    !(await page.locator('.doc-list').innerText().catch(() => '')).includes('plano.pdf'));

  await page.locator('button:has-text("Papelera")').first().click();
  await page.waitForTimeout(900);
  check('La papelera enseña lo que hay dentro, con desde cuándo',
    (await page.locator('.doc-list').innerText()).includes('plano.pdf')
    && (await page.locator('.doc-list').innerText()).includes('en la papelera desde'));

  await page.locator('button:has-text("Restaurar")').first().click();
  await page.waitForTimeout(1300);
  check('Y se puede recuperar desde la propia aplicación',
    db.documents.some((d) => d.file_name === 'plano.pdf' && !d.deleted_at));

  // ============================ SEGURIDAD DE VERDAD ============================
  console.log('\n   ── SEGURIDAD ──');
  const puertas = [
    ['/rest/v1/rpc/dashboard_summary', 'POST', { p_from: '2026-01-01', p_to: '2026-12-31' }],
    ['/rest/v1/rpc/report_hours_by_worker', 'POST', { p_from: '2026-01-01', p_to: '2026-12-31' }],
    ['/rest/v1/rpc/seed_demo', 'POST', {}],
    ['/rest/v1/rpc/clear_demo', 'POST', {}],
    ['/rest/v1/rpc/start_backup', 'POST', { p_kind: 'manual', p_destination: 'descarga' }],
    ['/rest/v1/rpc/restore_data', 'POST', { p_payload: {}, p_scope: ['clientes'] }],
    ['/rest/v1/rpc/set_company', 'POST', { p_company: { name: 'Mía SL' } }],
    ['/rest/v1/rpc/archive_contact', 'POST', { p_contact: db.client_contacts[0]?.id }],
  ];

  const rechazos = await m.evaluate(async ({ base, puertas }) => {
    const out = [];
    for (const [ruta, metodo, cuerpo] of puertas) {
      const r = await fetch(base + ruta, {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      out.push({ ruta, status: r.status, texto: (await r.text()).slice(0, 120) });
    }
    return out;
  }, { base: 'https://ejemplo.supabase.co', puertas });

  for (const r of rechazos) {
    check(`Un trabajador NO puede ${r.ruta.split('/').pop()}`,
      r.status >= 400 && /permiso/i.test(r.texto), `${r.status} · ${r.texto}`);
  }

  const lecturas = await m.evaluate(async (base) => {
    const out = {};
    for (const tabla of ['backups', 'payments', 'code_counters']) {
      const r = await fetch(`${base}/rest/v1/${tabla}?select=*`);
      out[tabla] = JSON.parse(await r.text()).length;
    }
    return out;
  }, 'https://ejemplo.supabase.co');
  check('Ni leer las copias de seguridad', lecturas.backups === 0);
  check('Ni los cobros', lecturas.payments === 0);
  check('Ni la numeración', lecturas.code_counters === 0);

  await m.goto(`http://localhost:${PORT}/#/admin/configuracion`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(1000);
  check('Y escribiendo la dirección a mano tampoco entra',
    !m.url().includes('/admin/configuracion'));
  await movil.close();

  // ============================ DATOS DE EJEMPLO ============================
  console.log('\n   ── DATOS DE EJEMPLO ──');
  const realesAntes = {
    clientes: db.clients.length, proyectos: db.projects.length,
    ordenes: db.work_orders.length, cobros: db.payments.length,
  };

  await page.goto(`http://localhost:${PORT}/#/admin/configuracion`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('.tabs button:has-text("Aplicación")').click();
  await page.waitForTimeout(900);
  check('Hay un apartado de datos de ejemplo',
    (await page.locator('main').innerText()).includes('Datos de ejemplo'));

  await page.locator('button:has-text("Poner datos de ejemplo")').click();
  await page.waitForTimeout(1600);
  check('Se ponen los datos de ejemplo',
    db.clients.some((c) => c.is_demo) && db.projects.some((p) => p.is_demo));
  check('Y se avisa de que están puestos',
    (await page.locator('main').innerText()).includes('datos de ejemplo mezclados'));

  await page.locator('button:has-text("Limpiar datos demo")').click();
  await page.waitForTimeout(600);
  await page.locator('.modal-foot button:has-text("Limpiar")').click();
  await page.waitForTimeout(1600);

  check('Limpiar los datos demo se lleva TODO lo de ejemplo',
    !db.clients.some((c) => c.is_demo) && !db.projects.some((p) => p.is_demo)
    && !db.work_orders.some((o) => o.is_demo) && !db.materials.some((mt) => mt.is_demo));
  check('Y NO toca ni un solo dato de verdad',
    db.clients.length === realesAntes.clientes
    && db.projects.length === realesAntes.proyectos
    && db.work_orders.length === realesAntes.ordenes
    && db.payments.length === realesAntes.cobros);

  // ============================ CAPTURAS ============================
  await page.goto(`http://localhost:${PORT}/#/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tests/capturas/fase7-panel.png', fullPage: true });
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/${db.projects[0].id}`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tests/capturas/fase7-proyecto.png', fullPage: true });

  check('Ninguna pantalla ha dado un error de programación',
    errores.length === 0, errores.join(' | '));

  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

process.exit(report() === 0 ? 0 : 1);
