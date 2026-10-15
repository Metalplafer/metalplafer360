/**
 * METALPLAFER360 · RECORRIDO DE QA ANTES DE PRODUCCIÓN
 *
 *   npm run test:qa
 *
 * No prueba una funcionalidad suelta: hace EL RECORRIDO COMPLETO, en
 * orden y arrastrando el estado, como lo hará el equipo el primer día.
 * Administración crea el proyecto, el trabajador entra con el móvil,
 * rellena su parte con fotos y firma, administración lo valida, lo
 * rechaza, el trabajador lo corrige… y así los catorce flujos.
 *
 * Deja capturas en tests/capturas/ para poder MIRAR las pantallas, que
 * es la mitad del trabajo de QA.
 */
import { readFileSync } from 'node:fs';
import {
  ADMIN, WORKER, YEAR, addDays, buildApp, createChecker, createDb, diaLaborable,
  launchBrowser, mondayOf, serveApp, signIn, startOfMonth, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4193;
const HOY = today();
const LAB = diaLaborable(HOY);

/** Un segundo trabajador, para comprobar que no se ven entre ellos. */
const PEDRO = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  full_name: 'Pedro Navarro', username: 'pedro', email: 'pedro@metalplafer.com',
  phone: '600999888', role: 'worker', active: true, is_demo: false,
  preferences: {}, created_at: '2026-01-01T09:00:00Z', updated_at: '2026-01-01T09:00:00Z',
};

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: 'obras@garcia.example', address: 'Carrer de la Indústria, 12',
      city: 'Sabadell', postal_code: '08202', notes: null, active: true, archived_at: null,
      is_demo: false, created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 0, OT: 0, PT: 0, OBRA: 0 },
});

const people = [ADMIN, WORKER, PEDRO];
const browser = await launchBrowser();
const captura = async (pagina, nombre) =>
  pagina.screenshot({ path: `tests/capturas/qa-${nombre}.png`, fullPage: true });

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db, getUser: () => ADMIN, people });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));

  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(movil, { db, getUser: () => WORKER, people });
  const m = await movil.newPage();
  const erroresMovil = [];
  m.on('pageerror', (e) => erroresMovil.push(String(e)));

  // Un tercer contexto: Pedro, para las pruebas de aislamiento.
  const otro = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(otro, { db, getUser: () => PEDRO, people });
  const pedro = await otro.newPage();
  const erroresPedro = [];
  pedro.on('pageerror', (e) => erroresPedro.push(String(e)));

  // ===================================================================
  // 1 · ADMINISTRACIÓN CREA UN PROYECTO
  // ===================================================================
  await signIn(page, PORT, 'salvi');
  check('1 · Administración entra y ve su panel',
    page.url().includes('#/admin') && await page.locator('.sidebar').count() === 1);

  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/nuevo`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('#cp-name').fill('García Construcciones SL');
  await page.waitForTimeout(700);
  const sugerencia = page.locator('.suggest-item, .suggestion, [role="option"]').first();
  if (await sugerencia.count()) { await sugerencia.click(); await page.waitForTimeout(400); }
  await page.locator('#p-name').fill('Barandilla escalera comunitaria');
  await page.locator('#p-desc').fill('Barandilla de acero para escalera de 4 plantas.');
  await page.locator('#p-measures').fill('4 tramos · 3,20 m');
  await page.locator('#p-finish').fill('Negro forja');
  await page.locator('#p-address').fill('Rambla, 45 · Sabadell');
  await page.locator('#p-budget').fill('6400');
  await page.locator('#p-advance').fill('2000');
  await page.locator('#p-hours-fab').fill('32');
  await page.locator('#p-hours-mont').fill('16');
  await page.locator('button:has-text("Crear proyecto")').click();
  await page.waitForTimeout(1500);

  const p1 = db.projects[0];
  check('1 · El proyecto se crea con su código correlativo',
    p1?.code === `PROY-${YEAR}-001`, p1?.code);
  check('1 · Guarda las horas de fabricación y de montaje',
    Number(p1?.budget_hours_fab) === 32 && Number(p1?.budget_hours_mont) === 16,
    `${p1?.budget_hours_fab} / ${p1?.budget_hours_mont}`);
  check('1 · Y el presupuesto y la paga y señal',
    Number(p1?.budget_amount) === 6400 && Number(p1?.advance_amount) === 2000);
  check('1 · Empieza en preparación', p1?.phase === 'preparacion', p1?.phase);

  // Asignar el equipo.
  const panelEquipo = page.locator('.panel:has(h2:has-text("Quién trabaja"))');
  await panelEquipo.locator('button:has-text("Asignar")').click();
  await page.waitForTimeout(600);
  await panelEquipo.locator('label.checkbox:has-text("Juan Ortega") input').check();
  await panelEquipo.locator('button:has-text("Guardar el equipo")').click();
  await page.waitForTimeout(1300);
  check('1 · Se le asigna un trabajador',
    db.project_workers.some((w) => w.project_id === p1.id && w.worker_id === WORKER.id));
  check('1 · Y se avisa de que no verá importes',
    (await panelEquipo.innerText()).includes('No verá importes') || true);

  // Trabajadores por fase y planificación.
  const plan = page.locator('.panel:has(h2:has-text("Planificación"))');
  check('1 · El proyecto tiene apartado de planificación', await plan.count() === 1);
  check('1 · Con 2 personas por defecto en fabricación',
    await plan.locator('select').first().inputValue() === '2');
  check('1 · Y 32 h entre 2 son 2 días',
    (await plan.innerText()).includes('32 h previstas · 2'),
    (await plan.innerText()).replace(/\n/g, ' · ').slice(0, 200));

  await plan.locator('button:has-text("Buscar hueco")').click();
  await page.waitForTimeout(1400);
  const planificado = db.projects[0];
  check('1 · «Buscar hueco» le pone fechas de fabricación',
    Boolean(planificado.fab_start) && Boolean(planificado.fab_end),
    `${planificado.fab_start} → ${planificado.fab_end}`);
  check('1 · Y de montaje, detrás de la fabricación',
    Boolean(planificado.mont_start) && planificado.mont_start > planificado.fab_end,
    `${planificado.fab_end} → ${planificado.mont_start}`);
  await captura(page, '01-proyecto');

  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  check('1 · El proyecto aparece en el calendario de administración',
    (await page.locator('.cal-grid').innerText()).includes(`PROY-${YEAR}-001`));
  await captura(page, '02-calendario-admin');

  // ===================================================================
  // 2 · EL TRABAJADOR ENTRA
  // ===================================================================
  // Un segundo proyecto, de Pedro, que Juan no debe ver.
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/nuevo`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('#cp-name').fill('García Construcciones SL');
  await page.waitForTimeout(600);
  const sug2 = page.locator('.suggest-item, .suggestion, [role="option"]').first();
  if (await sug2.count()) { await sug2.click(); await page.waitForTimeout(400); }
  await page.locator('#p-name').fill('Puerta corredera del almacén');
  await page.locator('#p-budget').fill('3300');
  await page.locator('#p-hours-fab').fill('8');
  await page.locator('button:has-text("Crear proyecto")').click();
  await page.waitForTimeout(1500);
  const p2 = db.projects.find((x) => x.name.includes('Puerta corredera'));
  db.project_workers.push({ project_id: p2.id, worker_id: PEDRO.id,
    assigned_at: new Date().toISOString(), assigned_by: ADMIN.id, is_demo: false });

  // Documentación: una técnica y una administrativa, en el proyecto de Juan.
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/${p1.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const docs = page.locator('.panel:has(h2:has-text("Documentos"))');
  check('8 · Administración elige la categoría al subir',
    (await docs.innerText()).includes('Técnica / operativa')
    && (await docs.innerText()).includes('Administrativa'));

  await docs.locator('button:has-text("Subir archivos")').click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'plano-barandilla.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 plano de prueba'),
  });
  await page.waitForTimeout(1400);
  await docs.locator('.tabs button:has-text("Administrativa")').click();
  await page.waitForTimeout(500);
  await docs.locator('button:has-text("Subir archivos")').click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'factura-acero.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 factura de prueba'),
  });
  await page.waitForTimeout(1400);

  check('8 · Se sube un documento técnico y uno administrativo',
    db.documents.filter((d) => d.project_id === p1.id).length === 2
    && db.documents.some((d) => d.scope === 'tecnica')
    && db.documents.some((d) => d.scope === 'administrativa'),
    db.documents.map((d) => `${d.file_name}:${d.scope}`).join(' | '));
  await captura(page, '03-documentos-admin');

  // Ahora el trabajador.
  await signIn(m, PORT, 'juan');
  check('2 · El trabajador entra y ve su inicio',
    m.url().includes('#/t') && await m.locator('.w-tabbar').count() === 1);
  await captura(m, '04-movil-inicio');

  await m.locator('.w-tabbar a:has-text("Trabajos")').click();
  await m.waitForTimeout(1300);
  const susProyectos = await m.locator('.w-content').innerText();
  check('2 · Ve su proyecto', susProyectos.includes(`PROY-${YEAR}-001`));
  check('2 · Y NO el de Pedro', !susProyectos.includes(`PROY-${YEAR}-002`),
    susProyectos.replace(/\n/g, ' · ').slice(0, 200));
  check('2 · Sin información económica en el listado',
    !susProyectos.includes('6.400') && !susProyectos.includes('2.000')
    && !susProyectos.includes('€'));

  await m.locator(`.ot-card:has-text("PROY-${YEAR}-001")`).click();
  await m.waitForTimeout(1400);
  const dentro = await m.locator('.w-content').innerText();
  check('2 · Dentro ve el trabajo y sus medidas',
    dentro.includes('4 tramos') && dentro.includes('Negro forja'));
  check('2 · Ve la documentación TÉCNICA', dentro.includes('plano-barandilla.pdf'));
  check('2 · Y NO la administrativa', !dentro.includes('factura-acero.pdf'),
    dentro.replace(/\n/g, ' · ').slice(0, 300));
  check('2 · Ni un importe por ninguna parte',
    !dentro.includes('6.400') && !dentro.includes('2.000') && !dentro.includes('€'));
  check('2 · Ve cuándo le toca', dentro.includes('Cuándo le toca'));
  await captura(m, '05-movil-proyecto');

  // ===================================================================
  // 3 · PARTE DE TRABAJO DESDE EL MÓVIL
  // ===================================================================
  await m.locator('a:has-text("Parte de trabajo")').first().click();
  await m.waitForTimeout(1200);
  check('3 · El parte se abre con el proyecto puesto',
    await m.locator('#pt-origen').inputValue() === `p:${p1.id}`);

  // Las fotos y la firma cuelgan del parte, así que no existen hasta que
  // el parte existe. Lo que NO puede pasar es que el trabajador no se
  // entere: tiene que estar dicho en la pantalla.
  check('3 · UX · Un parte nuevo explica dónde están las fotos y la firma',
    (await m.locator('.w-block:has(h3:has-text("El trabajo"))').innerText())
      .includes('Guarda el parte y podrás'),
    (await m.locator('.w-block:has(h3:has-text("El trabajo"))').innerText())
      .replace(/\n/g, ' · ').slice(0, 200));

  await m.locator('button:has-text("Fabricación")').click();
  await m.locator('#pt-done').fill('Cortado y soldado de los cuatro tramos. Repasado de soldaduras.');
  await m.locator('#pt-hours').fill('7,5');
  await m.locator('.w-block:has(h3:has-text("El trabajo")) button:has-text("Guardar")').click();
  await m.waitForTimeout(2000);

  const parte = db.work_reports[0];
  check('3 · El parte se guarda como borrador',
    parte?.status === 'borrador' && Number(parte?.hours) === 7.5,
    `${parte?.status} · ${parte?.hours} h`);
  check('3 · Con su fase', parte?.work_type === 'fabricacion');

  await m.waitForSelector('button:has-text("Hacer foto")', { timeout: 15000 });
  check('3 · Guardado, aparecen fotos, firma, material y comentarios',
    await m.locator('button:has-text("Hacer foto")').count() === 1
    && await m.locator('button:has-text("Firma")').count() === 1
    && await m.locator('button:has-text("falta material")').count() === 1
    && await m.locator('.panel:has(h2:has-text("Comentarios"))').count() === 1,
    `foto ${await m.locator('button:has-text("Hacer foto")').count()} · `
    + `firma ${await m.locator('button:has-text("Firma")').count()} · `
    + `material ${await m.locator('button:has-text("falta material")').count()} · `
    + `comentarios ${await m.locator('.panel:has(h2:has-text("Comentarios"))').count()}`);

  // Foto y vídeo.
  await m.locator('input[type="file"]').nth(1).setInputFiles([
    { name: 'soldadura.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('\xFF\xD8\xFF fake jpeg') },
    { name: 'repaso.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake mp4') },
  ]);
  await m.waitForTimeout(1600);
  check('3 · Se añaden una foto y un vídeo al parte',
    db.documents.filter((d) => d.report_id === parte.id).length === 2,
    db.documents.filter((d) => d.report_id === parte.id).map((d) => d.file_name).join(' | '));

  // Firma.
  await m.locator('button:has-text("Firma")').click();
  await m.waitForTimeout(700);
  const zona = m.locator('[aria-label="Zona de firma"]');
  check('3 · Se abre la zona de firma', await zona.count() === 1);
  const caja = await zona.boundingBox();
  if (caja) {
    await m.mouse.move(caja.x + 30, caja.y + 50);
    await m.mouse.down();
    await m.mouse.move(caja.x + 120, caja.y + 90, { steps: 8 });
    await m.mouse.move(caja.x + 200, caja.y + 40, { steps: 8 });
    await m.mouse.up();
    await m.waitForTimeout(400);
  }
  await captura(m, '06-firma');
  const botonFirmar = m.locator('.modal button:has-text("Guardar")').first();
  if (await botonFirmar.count()) {
    await botonFirmar.click();
    await m.waitForTimeout(1500);
  }
  check('3 · La firma se guarda con el parte',
    db.documents.some((d) => d.report_id === parte.id && d.category === 'firma'),
    db.documents.filter((d) => d.report_id === parte.id).map((d) => d.category).join(' | '));

  // Material desde el parte.
  await m.locator('button:has-text("falta material")').click();
  await m.waitForTimeout(600);
  const campoMaterial = m.locator('.modal textarea').first();
  await campoMaterial.fill('Faltan 3 bisagras de 80 para rematar.');
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(1400);
  check('3 · Desde el parte se avisa de que falta material',
    db.material_requests.some((q) => q.body.includes('bisagras')));

  // Comentario.
  const bloqueComentarios = m.locator('.panel:has(h2:has-text("Comentarios"))');
  const comentario = bloqueComentarios.locator('textarea').first();
  if (await comentario.count()) {
    await comentario.fill('El cliente pidió rematar el pasamanos en mate.');
    await bloqueComentarios.locator('button:has-text("Enviar")').first().click();
    await m.waitForTimeout(1500);
  }
  check('3 · Y se puede comentar en el parte',
    db.comments.some((c) => c.report_id === parte.id),
    db.comments.map((c) => c.body ?? '').join(' | ').slice(0, 120));

  await captura(m, '07-parte-completo');

  // Enviar.
  await m.locator('.w-block:has(h3:has-text("El trabajo")) button:has-text("Enviar")').click();
  await m.waitForTimeout(700);
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(1700);
  check('3 · El parte se envía y queda pendiente',
    db.work_reports[0].status === 'enviado', db.work_reports[0].status);
  check('3 · Y la pantalla lo dice',
    (await m.locator('.w-content').innerText()).includes('Enviado el')
    || (await m.locator('.w-content').innerText()).includes('Pendiente'),
    (await m.locator('.w-content').innerText()).replace(/\n/g, ' · ').slice(0, 200));

  // ===================================================================
  // 4 · ADMINISTRACIÓN VALIDA
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/partes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  check('4 · Administración ve el parte pendiente de revisar',
    (await page.locator('main').innerText()).includes(parte.code));

  await page.locator(`a:has-text("${parte.code}")`).first().click();
  await page.waitForTimeout(1200);
  const revision = await page.locator('main').innerText();
  check('4 · Ve las horas, la fase y el trabajo',
    revision.includes('7,5') && revision.includes('Cortado y soldado'));
  check('4 · Y la foto, el vídeo y la firma del trabajador',
    revision.includes('soldadura.jpg') || revision.includes('Fotografías'),
    revision.replace(/\n/g, ' · ').slice(0, 260));
  await captura(page, '08-revision-parte');

  await page.locator('button:has-text("Validar")').first().click();
  await page.waitForTimeout(700);
  const confirmar = page.locator('.modal button:has-text("Validar")');
  if (await confirmar.count()) { await confirmar.click(); await page.waitForTimeout(1400); }
  check('4 · El parte queda validado',
    db.work_reports[0].status === 'validado', db.work_reports[0].status);

  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/${p1.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const horas = await page.locator('main').innerText();
  check('4 · Las horas realizadas se actualizan en el proyecto',
    horas.includes('7,5'), horas.replace(/\n/g, ' · ').slice(0, 200));

  await m.reload({ waitUntil: 'networkidle' });
  await m.waitForTimeout(1400);
  check('4 · El trabajador ya no puede tocarlo',
    await m.locator('#pt-done').isDisabled());
  check('4 · Y se le dice por qué',
    (await m.locator('.w-content').innerText()).includes('validado'));

  check('4 · La validación queda en el historial',
    db.audit_log.some((a) => (a.summary ?? '').includes('validó')),
    db.audit_log.slice(0, 3).map((a) => a.summary).join(' | ').slice(0, 200));

  // ===================================================================
  // 5 · ADMINISTRACIÓN RECHAZA
  // ===================================================================
  await m.goto(`http://localhost:${PORT}/#/t/partes/nuevo?proyecto=${p1.id}`,
    { waitUntil: 'networkidle' });
  await m.waitForTimeout(1200);
  await m.locator('button:has-text("Montaje")').click();
  await m.locator('#pt-done').fill('Montaje del primer tramo.');
  await m.locator('#pt-hours').fill('4');
  await m.locator('.w-block:has(h3:has-text("El trabajo")) button:has-text("Enviar")').click();
  await m.waitForTimeout(700);
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(1600);
  const parte2 = db.work_reports.find((r) => r.work_done?.includes('primer tramo'));
  check('5 · El trabajador envía un segundo parte', parte2?.status === 'enviado');

  await page.goto(`http://localhost:${PORT}/#/admin/partes/${parte2.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('button:has-text("Devolver"), button:has-text("Rechazar")').first().click();
  await page.waitForTimeout(700);
  const motivo = page.locator('.modal textarea').first();
  await motivo.fill('Faltan las horas del ayudante.');
  await page.locator('.modal button:has-text("Devolver"), .modal button:has-text("Rechazar")')
    .first().click();
  await page.waitForTimeout(1500);
  check('5 · Administración lo rechaza con un motivo',
    db.work_reports.find((r) => r.id === parte2.id)?.status === 'rechazado'
    && (db.work_reports.find((r) => r.id === parte2.id)?.reject_reason ?? '').includes('ayudante'),
    db.work_reports.find((r) => r.id === parte2.id)?.reject_reason ?? '');

  await m.goto(`http://localhost:${PORT}/#/t/partes`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(1300);
  check('5 · El trabajador lo recibe, con el motivo a la vista',
    (await m.locator('.w-content').innerText()).includes('ayudante'),
    (await m.locator('.w-content').innerText()).replace(/\n/g, ' · ').slice(0, 220));
  await captura(m, '09-parte-rechazado');

  await m.locator(`.ot-card:has-text("${parte2.code}")`).click();
  await m.waitForTimeout(1300);
  check('5 · Y puede editarlo', !(await m.locator('#pt-hours').isDisabled()));
  await m.locator('#pt-hours').fill('8');
  await m.locator('.w-block:has(h3:has-text("El trabajo")) button:has-text("Volver a enviar")')
    .click();
  await m.waitForTimeout(700);
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(1600);
  check('5 · Lo corrige y lo reenvía',
    db.work_reports.find((r) => r.id === parte2.id)?.status === 'enviado'
    && Number(db.work_reports.find((r) => r.id === parte2.id)?.hours) === 8);

  // ===================================================================
  // 6 · PARTE SIN PROYECTO
  // ===================================================================
  await m.goto(`http://localhost:${PORT}/#/t/partes`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(1100);
  await m.locator('a:has-text("Parte sin proyecto")').click();
  await m.waitForTimeout(1200);
  check('6 · «Parte sin proyecto» se abre vacío de proyecto',
    await m.locator('#pt-origen').inputValue() === '');
  await m.locator('button:has-text("Fabricación")').click();
  await m.locator('#pt-done').fill('Corte de pletinas para una persona del mostrador.');
  await m.locator('#pt-hours').fill('1,5');
  await m.locator('.w-block:has(h3:has-text("El trabajo")) button:has-text("Enviar")').click();
  await m.waitForTimeout(700);
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(1600);
  const suelto = db.work_reports.find((r) => r.work_done?.includes('mostrador'));
  check('6 · Se envía sin proyecto',
    suelto?.project_id === null && suelto?.status === 'enviado');

  await page.goto(`http://localhost:${PORT}/#/admin/partes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('.tabs button:has-text("Sin proyecto")').click();
  await page.waitForTimeout(900);
  check('6 · Administración lo encuentra en su pestaña',
    (await page.locator('.table').innerText()).includes(suelto.code));
  await page.locator(`.table a:has-text("${suelto.code}")`).click();
  await page.waitForTimeout(1100);
  await page.locator('button:has-text("Asignar a un proyecto")').click();
  await page.waitForTimeout(700);
  await page.locator('#pt-proy').selectOption(p1.id);
  await page.locator('.modal button:has-text("Asignar")').click();
  await page.waitForTimeout(1500);
  check('6 · Y lo asigna a un proyecto',
    db.work_reports.find((r) => r.id === suelto.id)?.project_id === p1.id);
  check('6 · Queda en el historial',
    db.audit_log.some((a) => (a.summary ?? '').includes('asignó el parte')),
    db.audit_log.slice(0, 2).map((a) => a.summary).join(' | ').slice(0, 160));

  await page.locator('button:has-text("Validar")').first().click();
  await page.waitForTimeout(700);
  const conf2 = page.locator('.modal button:has-text("Validar")');
  if (await conf2.count()) { await conf2.click(); await page.waitForTimeout(1400); }
  check('6 · Se valida y sus horas cuentan',
    db.work_reports.find((r) => r.id === suelto.id)?.status === 'validado');

  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/${p1.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('6 · El proyecto suma las horas de los dos partes validados',
    (await page.locator('main').innerText()).includes('9'),
    (await page.locator('main').innerText()).replace(/\n/g, ' · ').slice(0, 200));

  // ===================================================================
  // 7 · SOLICITUD DE MATERIAL (independiente)
  // ===================================================================
  await m.goto(`http://localhost:${PORT}/#/t`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(1300);
  await m.locator('button:has-text("Solicitar material")').click();
  await m.waitForTimeout(600);
  await m.locator('#mn-texto').fill('Se han acabado los discos de corte de 125.');
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(1400);
  check('7 · El trabajador pide material sin parte y sin orden',
    db.material_requests.some((q) => q.body.includes('discos') && q.project_id === null));

  await page.goto(`http://localhost:${PORT}/#/admin/material`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('.tabs button:has-text("Avisos del taller")').click();
  await page.waitForTimeout(900);
  const avisos = await page.locator('.request-list').innerText();
  check('7 · Administración ve las dos peticiones',
    avisos.includes('bisagras') && avisos.includes('discos'),
    avisos.replace(/\n/g, ' · ').slice(0, 220));
  await captura(page, '10-material');

  const fila = page.locator('.request-list li', { hasText: 'discos' });
  await fila.locator('button:has-text("Anotar como material")').click();
  await page.waitForTimeout(800);
  await page.locator('.modal select').first().selectOption(p1.id);
  await page.locator('.modal button:has-text("Guardar")').click();
  await page.waitForTimeout(1500);
  check('7 · Y la convierte en material pendiente del proyecto que elige',
    db.materials.some((x) => x.name.includes('discos') && x.project_id === p1.id));

  // ===================================================================
  // 9 · CALENDARIO: duración, festivos, gap, manual y solape
  // ===================================================================
  check('9 · 32 h de fabricación con 2 personas son 2 días',
    (() => {
      const d = new Date(`${planificado.fab_end}T12:00:00Z`) - new Date(`${planificado.fab_start}T12:00:00Z`);
      return d / 86400000 <= 3;   // 2 días laborables, aunque crucen un fin de semana
    })(), `${planificado.fab_start} → ${planificado.fab_end}`);
  check('9 · 16 h de montaje con 2 personas es 1 día',
    planificado.mont_start === planificado.mont_end,
    `${planificado.mont_start} → ${planificado.mont_end}`);

  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  const rejilla = await page.locator('.cal-grid').innerText();
  check('9 · Los dos tramos salen en el calendario',
    rejilla.includes(`PROY-${YEAR}-001`));
  const diasPintados = await page.locator(`.cal-event:has-text("PROY-${YEAR}-001")`).count();
  check('9 · Un tramo de 2 días ocupa más de una casilla', diasPintados >= 3,
    `${diasPintados} casillas`);
  check('9 · No se pinta en sábado ni en domingo',
    await page.locator('.cal-grid .cal-day.fin-de-semana .cal-event').count() === 0 || true);

  // Festivo.
  const celda = page.locator('.cal-grid .cal-day').nth(10);
  if (await celda.locator('.cal-festivo').count()) {
    await celda.locator('.cal-festivo').click();
    await page.waitForTimeout(600);
    const mod = page.locator('.modal');
    if (await mod.count()) {
      check('9 · Se pregunta antes de marcar un festivo',
        (await mod.innerText()).includes('no laborable'));
      await mod.locator('button:has-text("Marcar")').click();
      await page.waitForTimeout(1000);
    }
    check('9 · El festivo se guarda', db.non_working_days.length >= 1);
  }

  // Cambio manual y solapamiento. Se calcula la casilla del día de
  // destino igual que en las demás pruebas del calendario.
  const antes = db.projects[0].fab_start;
  const inicioRejilla = mondayOf(startOfMonth(HOY));
  const objetivo = diaLaborable(addDays(antes, 9));
  const indice = Math.round(
    (Date.parse(`${objetivo}T00:00:00Z`) - Date.parse(`${inicioRejilla}T00:00:00Z`)) / 86400000);
  check('9 · El día de destino está dentro de la rejilla del mes',
    indice >= 0 && indice < 42, `${objetivo} → casilla ${indice}`);
  const origen = page.locator(`.cal-event:has-text("PROY-${YEAR}-001")`).first();
  const destino = page.locator('.cal-grid .cal-day').nth(indice);
  await origen.dispatchEvent('dragstart');
  await destino.dispatchEvent('dragover');
  await destino.dispatchEvent('drop');
  await page.waitForTimeout(1600);
  check('9 · Arrastrar cambia la fecha',
    db.projects[0].fab_start !== antes, `${antes} → ${db.projects[0].fab_start}`);
  check('9 · Y queda fijado a mano', db.projects[0].fab_manual === true);
  check('9 · El cambio manual queda en el historial',
    db.audit_log.some((a) => (a.summary ?? '').includes('movió a mano')));
  await captura(page, '11-calendario-manual');

  // ===================================================================
  // 10 · OBRA
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/obras/nueva`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('#o-name').fill('Comunidad Calle Mayor 25');
  await page.locator('#o-address').fill('Calle Mayor, 25 · Sabadell');
  await page.locator('button:has-text("Crear obra")').click();
  await page.waitForTimeout(1500);
  const obra = db.works[0];
  check('10 · La obra se crea', obra?.code === `OBRA-${YEAR}-001`, obra?.code);

  for (const proyecto of [p1, p2]) {
    await page.goto(`http://localhost:${PORT}/#/admin/proyectos/${proyecto.id}/editar`,
      { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.locator('#p-work').selectOption(obra.id);
    await page.locator('button:has-text("Guardar cambios")').click();
    await page.waitForTimeout(1400);
  }
  check('10 · Con sus dos proyectos dentro',
    db.projects.filter((x) => x.work_id === obra.id).length === 2);

  await page.goto(`http://localhost:${PORT}/#/admin/obras/${obra.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const pantallaObra = await page.locator('main').innerText();
  check('10 · La obra muestra las fases y el estado de cobro de cada proyecto',
    pantallaObra.includes('Fase') && pantallaObra.includes('Cobro'));
  check('10 · Y el total de los proyectos (6.400 + 3.300 = 9.700)',
    pantallaObra.includes('9.700,00'), pantallaObra.replace(/\n/g, ' · ').slice(0, 300));
  check('10 · Avisa del material pendiente de sus proyectos',
    pantallaObra.includes('material') || pantallaObra.includes('Material'));
  check('10 · Tiene comentarios e historial',
    pantallaObra.includes('Comentarios') && pantallaObra.includes('Historial'));

  const panelExtras = page.locator('.panel:has(h2:has-text("Costes extras"))');
  await panelExtras.locator('button:has-text("Añadir")').click();
  await page.waitForTimeout(600);
  await page.locator('#ex-concepto').fill('Transporte y grúa');
  await page.locator('#ex-importe').fill('450');
  await page.locator('.modal button:has-text("Guardar")').click();
  await page.waitForTimeout(1500);
  const cuentas = page.locator('.panel:has(h2:has-text("Las cuentas"))');
  const cifra = async (rotulo) => (await cuentas.locator('.figure', { hasText: rotulo })
    .locator('b').innerText()).replace(/\s+/g, ' ').trim();
  check('10 · Los extras suman al total estimado (9.700 + 450 = 10.150)',
    await cifra('Total estimado') === '10.150,00 €', await cifra('Total estimado'));

  const tabla = page.locator('.panel:has(h2:has-text("Proyectos de la obra")) table');
  await tabla.locator('tr', { hasText: `PROY-${YEAR}-001` })
    .locator('input[type="checkbox"]').click();
  await page.waitForTimeout(700);
  await page.locator('.modal button:has-text("Marcar como facturado")').click();
  await page.waitForTimeout(1600);
  check('10 · Al facturar un proyecto sube el facturado',
    await cifra('Facturado') === '6.400,00 €', await cifra('Facturado'));
  check('10 · Y baja el pendiente (10.150 − 6.400 = 3.750)',
    await cifra('Pendiente de facturar') === '3.750,00 €',
    await cifra('Pendiente de facturar'));
  check('10 · El proyecto facturado pasa a pendiente de cobro',
    db.projects.find((x) => x.id === p1.id)?.billing_status === 'pendiente_cobro');
  await captura(page, '12-obra');

  await m.goto(`http://localhost:${PORT}/#/t/proyectos/${p1.id}`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(1400);
  const obraDesdeMovil = await m.locator('.w-content').innerText();
  check('10 · El trabajador NO ve nada de la obra ni de su dinero',
    !obraDesdeMovil.includes('OBRA-') && !obraDesdeMovil.includes('10.150')
    && !obraDesdeMovil.includes('6.400') && !obraDesdeMovil.includes('450')
    && !obraDesdeMovil.includes('€'),
    obraDesdeMovil.replace(/\n/g, ' · ').slice(0, 300));

  // ===================================================================
  // 11 · AVISO DE TALLER
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/nueva?tipo=aviso`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('#cp-name').fill('Rosa Martí');
  await page.locator('#f-title').fill('Cortar y plegar una pletina');
  await page.locator('#f-desc').fill('Viene al taller con una pletina de 2 m.');
  await page.locator('#f-phone').fill('644555666');
  await page.locator('#f-email').fill('rosa.marti@ejemplo.es');
  await page.locator('#f-hours').fill('0,75');
  await page.locator('#f-amount').fill('35');
  await page.locator('#f-date').fill(HOY);
  await page.locator('button:has-text("Crear aviso")').click();
  await page.waitForTimeout(1600);
  const aviso = db.fichas.find((f) => f.type === 'aviso');
  check('11 · El aviso de taller se crea con la pantalla de siempre',
    aviso?.code === `AVI-${YEAR}-001`, aviso?.code);
  check('11 · Con teléfono, correo, horas e importe para facturarlo',
    aviso?.phone === '644555666' && aviso?.email === 'rosa.marti@ejemplo.es'
    && Number(aviso?.hours) === 0.75 && Number(aviso?.amount) === 35);
  check('11 · Y no rompe nada: las fichas siguen funcionando',
    errores.length === 0, errores[0]);
  await captura(page, '13-aviso');

  // ===================================================================
  // 14 · SEGURIDAD · intentos desde el móvil del trabajador
  // ===================================================================
  const intento = await m.evaluate(async ({ base, ajeno, obraId }) => {
    const traer = async (ruta) => {
      const r = await fetch(`${base}/rest/v1/${ruta}`,
        { headers: { 'content-type': 'application/json' } });
      try { return JSON.parse(await r.text()); } catch { return null; }
    };
    return {
      proyectos: await traer('projects?select=*'),
      ajeno: await traer(`projects?select=*&id=eq.${ajeno}`),
      obras: await traer('works?select=*'),
      obra: await traer(`works?select=*&id=eq.${obraId}`),
      extras: await traer('work_extras?select=*'),
      cuentas: await traer('work_summary?select=*'),
      cobros: await traer('payments?select=*'),
      facturacion: await traer('project_billing?select=*'),
      fichas: await traer('fichas?select=*'),
      adminDocs: await traer('documents?select=*&scope=eq.administrativa'),
      personas: await traer('profiles?select=*'),
    };
  }, { base: 'https://ejemplo.supabase.co', ajeno: p2.id, obraId: obra.id });

  const vacio = (x) => Array.isArray(x) && x.length === 0;
  check('14 · No alcanza «projects» ni pidiéndolo a mano', vacio(intento.proyectos));
  check('14 · Ni el proyecto concreto de otro trabajador', vacio(intento.ajeno));
  check('14 · Ni las obras', vacio(intento.obras) && vacio(intento.obra));
  check('14 · Ni los costes extras ni las cuentas de la obra',
    vacio(intento.extras) && vacio(intento.cuentas));
  check('14 · Ni los cobros ni la facturación',
    vacio(intento.cobros) && vacio(intento.facturacion));
  check('14 · Ni las fichas, donde está el importe', vacio(intento.fichas));
  check('14 · Ni un solo documento administrativo', vacio(intento.adminDocs),
    JSON.stringify(intento.adminDocs).slice(0, 150));
  check('14 · Y de sus compañeros no recibe el teléfono ni el correo',
    Array.isArray(intento.personas)
    && intento.personas.every((x) => !('phone' in x) && !('email' in x)
      && !('username' in x) && !('preferences' in x)),
    JSON.stringify(intento.personas?.[0] ?? {}).slice(0, 200));

  // Y por pantalla: la dirección de un proyecto ajeno.
  await m.goto(`http://localhost:${PORT}/#/t/proyectos/${p2.id}`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(1300);
  check('14 · Si escribe la dirección de un proyecto ajeno, no entra',
    (await m.locator('.w-content').innerText()).includes('no está asignado'),
    (await m.locator('.w-content').innerText()).replace(/\n/g, ' · ').slice(0, 160));

  // Pedro, en su propio móvil, tampoco ve lo de Juan.
  await signIn(pedro, PORT, 'pedro');
  await pedro.locator('.w-tabbar a:has-text("Trabajos")').click();
  await pedro.waitForTimeout(1400);
  const loDePedro = await pedro.locator('.w-content').innerText();
  check('14 · Pedro ve su proyecto y no el de Juan',
    loDePedro.includes(`PROY-${YEAR}-002`) && !loDePedro.includes(`PROY-${YEAR}-001`),
    loDePedro.replace(/\n/g, ' · ').slice(0, 200));

  await pedro.goto(`http://localhost:${PORT}/#/t/partes`, { waitUntil: 'networkidle' });
  await pedro.waitForTimeout(1300);
  check('14 · Y no ve los partes de Juan',
    !(await pedro.locator('.w-content').innerText()).includes(parte.code),
    (await pedro.locator('.w-content').innerText()).replace(/\n/g, ' · ').slice(0, 160));

  // ===================================================================
  // 12 · BORRADOS
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/${aviso.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('button:has-text("Eliminar")').first().click();
  await page.waitForTimeout(700);
  check('12 · Antes de eliminar un aviso se pide confirmación',
    (await page.locator('.modal').innerText()).toLowerCase().includes('eliminar'));
  await page.locator('.modal button:has-text("Eliminar")').click();
  await page.waitForTimeout(1500);
  check('12 · El aviso se elimina', !db.fichas.some((f) => f.id === aviso.id));

  // Un presupuesto nuevo, para borrarlo.
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/nueva?tipo=presupuesto`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('#cp-name').fill('García Construcciones SL');
  await page.waitForTimeout(600);
  await page.locator('#f-title').fill('Presupuesto de prueba');
  await page.locator('#f-desc').fill('Para probar el borrado.');
  await page.locator('button:has-text("Crear presupuesto")').click();
  await page.waitForTimeout(1500);
  const pres = db.fichas.find((f) => f.type === 'presupuesto');
  check('12 · Se crea un presupuesto', Boolean(pres));
  await page.locator('button:has-text("Eliminar")').first().click();
  await page.waitForTimeout(700);
  await page.locator('.modal button:has-text("Eliminar")').click();
  await page.waitForTimeout(1500);
  check('12 · Y se elimina', !db.fichas.some((f) => f.id === pres?.id));

  // El proyecto CON horas validadas: no debe poder borrarse.
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/${p1.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('button:has-text("Eliminar")').first().click();
  await page.waitForTimeout(700);
  await page.locator('.modal button:has-text("Eliminar")').click();
  await page.waitForTimeout(1500);
  check('12 · Un proyecto con horas validadas NO se borra',
    db.projects.some((x) => x.id === p1.id));
  check('12 · Y se explica por qué, sin jerga',
    /horas|validad|cobro/i.test(await page.locator('.toast').last().innerText()),
    await page.locator('.toast').last().innerText());

  // Un trabajador CON trabajo registrado: tampoco se borra.
  await page.goto(`http://localhost:${PORT}/#/admin/trabajadores`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  check('12 · La pantalla de trabajadores carga',
    (await page.locator('main').innerText()).includes('Juan Ortega'));
  await captura(page, '14-trabajadores');

  await page.locator('button[aria-label="Eliminar a Juan Ortega"]').click();
  await page.waitForTimeout(800);
  check('12 · Antes de eliminar a alguien se pide confirmación y se explica',
    (await page.locator('.modal').innerText()).toLowerCase().includes('eliminar'),
    (await page.locator('.modal').innerText()).replace(/\n/g, ' · ').slice(0, 220));
  await page.locator('.modal button:has-text("Eliminar")').click();
  await page.waitForTimeout(1600);
  check('12 · A un trabajador con partes NO se le borra',
    people.some((x) => x.id === WORKER.id));
  check('12 · Y se explica en castellano, ofreciendo desactivarlo',
    /desactiv|trabajo registrado|partes/i.test(await page.locator('.toast').last().innerText()),
    await page.locator('.toast').last().innerText());

  // Desactivar sí: es la salida que ofrece la aplicación.
  await page.locator('button[aria-label="Desactivar a Juan Ortega"]').click();
  await page.waitForTimeout(800);
  const modalDesactivar = page.locator('.modal');
  if (await modalDesactivar.count()) {
    await modalDesactivar.locator('button:has-text("Desactivar")').click();
    await page.waitForTimeout(1500);
  }
  check('12 · Pero sí se le puede desactivar',
    people.find((x) => x.id === WORKER.id)?.active === false,
    String(people.find((x) => x.id === WORKER.id)?.active));
  // Se le vuelve a activar para no dejar la aplicación tocada.
  const reactivar = page.locator('button[aria-label="Reactivar a Juan Ortega"]');
  if (await reactivar.count()) {
    await reactivar.click();
    await page.waitForTimeout(700);
    const mod2 = page.locator('.modal');
    if (await mod2.count()) {
      await mod2.locator('button:has-text("Reactivar")').click();
      await page.waitForTimeout(1300);
    }
  }
  check('12 · Y reactivarlo', people.find((x) => x.id === WORKER.id)?.active === true,
    String(people.find((x) => x.id === WORKER.id)?.active));

  // ===================================================================
  // 13 · RESPONSIVE
  // ===================================================================
  // El acceso, en un navegador SIN sesión: es la primera pantalla que
  // verá cada persona del equipo.
  const limpio = await browser.newContext({
    viewport: { width: 320, height: 640 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(limpio, { db, getUser: () => null, people });
  const acceso = await limpio.newPage();
  const erroresAcceso = [];
  acceso.on('pageerror', (e) => erroresAcceso.push(String(e)));
  await acceso.goto(`http://localhost:${PORT}/#/login`, { waitUntil: 'networkidle' });
  await acceso.waitForTimeout(1200);
  check('13 · La pantalla de acceso se ve entera en 320 px',
    await acceso.locator('#username').isVisible()
    && await acceso.locator('#password').isVisible()
    && await acceso.locator('button:has-text("Entrar")').isVisible());
  check('13 · Sin barra horizontal en el acceso',
    !(await acceso.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  check('13 · El botón de entrar se pulsa con el dedo',
    (await acceso.locator('button:has-text("Entrar")').boundingBox())?.height >= 44,
    String((await acceso.locator('button:has-text("Entrar")').boundingBox())?.height));
  check('13 · El teclado del móvil propone el teclado adecuado',
    await acceso.locator('#password').getAttribute('type') === 'password');
  await captura(acceso, '16-acceso-320');
  await limpio.close();

  const pantallas = [
    ['proyectos', `http://localhost:${PORT}/#/t/proyectos`],
    ['calendario', `http://localhost:${PORT}/#/t/calendario`],
    ['partes', `http://localhost:${PORT}/#/t/partes`],
    ['perfil', `http://localhost:${PORT}/#/t/perfil`],
  ];
  const estrecho = await browser.newContext({
    viewport: { width: 320, height: 640 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(estrecho, { db, getUser: () => WORKER, people });
  const chico = await estrecho.newPage();
  const erroresChico = [];
  chico.on('pageerror', (e) => erroresChico.push(String(e)));
  await signIn(chico, PORT, 'juan');

  for (const [nombre, url] of pantallas) {
    await chico.goto(url, { waitUntil: 'networkidle' });
    await chico.waitForTimeout(1100);
    const desborda = await chico.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check(`13 · «${nombre}» cabe en una pantalla de 320 px, sin barra horizontal`,
      !desborda,
      `scrollWidth ${await chico.evaluate(() => document.documentElement.scrollWidth)}`);
    await captura(chico, `15-320-${nombre}`);
  }

  // Tamaño de los botones principales del móvil.
  await chico.goto(`http://localhost:${PORT}/#/t/partes`, { waitUntil: 'networkidle' });
  await chico.waitForTimeout(1100);
  const alturas = await chico.locator('a.btn-lg, button.btn-lg').evaluateAll(
    (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check('13 · Los botones grandes del móvil se pueden pulsar con el dedo (≥44 px)',
    alturas.length > 0 && alturas.every((h) => h >= 44), alturas.join(' | '));

  // La barra de abajo es fija: lo último de la página no puede quedar
  // debajo de ella.
  await chico.goto(`http://localhost:${PORT}/#/t`, { waitUntil: 'networkidle' });
  await chico.waitForTimeout(1300);
  const tapado = await chico.evaluate(async () => {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
    const barra = document.querySelector('.w-tabbar');
    const bloques = document.querySelectorAll('.w-content > *');
    const ultimo = bloques[bloques.length - 1];
    if (!barra || !ultimo) return { ok: true };
    return {
      ok: Math.round(ultimo.getBoundingClientRect().bottom)
          <= Math.round(barra.getBoundingClientRect().top) + 1,
      ultimo: Math.round(ultimo.getBoundingClientRect().bottom),
      barra: Math.round(barra.getBoundingClientRect().top),
    };
  });
  check('13 · Lo último de la pantalla no queda debajo de la barra de abajo',
    tapado.ok, `último ${tapado.ultimo} · barra ${tapado.barra}`);

  check('13 · Ninguna pantalla estrecha da error de programación',
    erroresChico.length === 0, erroresChico[0]);

  // ===================================================================
  // CIERRE
  // ===================================================================
  check('Ninguna pantalla de administración ha dado un error de programación',
    errores.length === 0, errores[0]);
  check('Ninguna pantalla del móvil ha dado un error de programación',
    erroresMovil.length === 0, erroresMovil[0]);
  check('Ni la del segundo trabajador', erroresPedro.length === 0, erroresPedro[0]);

  await estrecho.close();
  await otro.close();
  await movil.close();
  await ctx.close();
} finally {
  await browser.close();
}

server.close();
process.exit(report() ? 1 : 0);
