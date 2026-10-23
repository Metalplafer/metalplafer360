/**
 * METALPLAFER360 · BANDEJA DE ENTRADA DE SOLICITUDES POR CORREO
 *
 *   npm run test:mejoras5
 *
 * Comprueba, pulsando lo que pulsa una persona:
 *
 *   · que la bandeja enseña lo que ha entrado por correo con su
 *     remitente, su asunto y sus archivos;
 *   · que una solicitud se ve como lo que es —UNA FICHA PROVISIONAL— y
 *     que la pantalla lo dice;
 *   · que un correo REENVIADO distingue a quién lo mandó y a quién lo
 *     reenvió, y que cuando no se sabe lo pide en vez de inventarlo;
 *   · que un adjunto que falló deja el correo a la vista, con el motivo;
 *   · que se revisa a mano: cliente, remitente y observaciones;
 *   · que convertirla lleva al formulario DE SIEMPRE y que, al guardar,
 *     la ficha queda vinculada y los archivos del correo se ven desde
 *     ella SIN COPIARSE;
 *   · que la ficha provisional no se borra;
 *   · y que descartar y recuperar funcionan.
 *
 * Las reglas de verdad se prueban contra PostgreSQL en
 * tests/sql/99_tests_solicitudes.sql, y lo que hay que averiguar de un
 * correo, en tests/unit/correo.test.ts. Aquí se comprueba LA PANTALLA.
 */
import {
  ADMIN, WORKER, YEAR, buildApp, createChecker, createDb,
  launchBrowser, serveApp, signIn, stubSupabase,
} from './fake-supabase.mjs';

const PORT = 4205;

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();
const limpio = (s) => s.replace(/ /g, ' ');
const panel = (p, titulo) => p.locator(`.panel:has(h2:text-is("${titulo}"))`);

const AYER = new Date(Date.now() - 86_400_000).toISOString();
const HOY = new Date().toISOString();

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'Construcciones Soler SL', tax_id: 'B61234567',
      phone: '600111222', email: 'laura@construccionessoler.es',
      address: 'Carrer de la Indústria, 12', city: 'Sabadell',
      postal_code: '08202', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  // Las solicitudes las habría creado el servidor al recibir los
  // correos: aquí se siembran como si ya hubieran entrado.
  mail_requests: [
    // 1 · Un correo directo del cliente, con adjuntos.
    { id: 's1', code: `SOL-${YEAR}-001`, status: 'pendiente',
      provider_message_id: 'MSG-0001@construccionessoler.es',
      subject: 'Presupuesto barandilla escalera',
      body_text: 'Buenos días,\n\nNecesitaríamos presupuesto para una barandilla de 12 metros '
        + 'en la escalera de la nave. Adjunto fotos y el plano.\n\nGracias,\nLaura',
      body_html: null,
      sender_email: 'laura@construccionessoler.es', sender_name: 'Laura Soler',
      recipients: 'peticiones@metalplafer.com', received_at: AYER,
      forwarded: false, original_sender_email: null, original_sender_name: null,
      original_subject: null, sender_needs_review: false,
      client_id: 'c1', notes: null, reviewed_by: null, reviewed_at: null,
      target_ficha_id: null, target_project_id: null, error_detail: null,
      is_demo: false, created_at: AYER, updated_at: AYER },

    // 2 · Un reenvío en el que NO se ha podido saber quién lo mandó.
    { id: 's2', code: `SOL-${YEAR}-002`, status: 'pendiente',
      provider_message_id: 'MSG-0002@metalplafer.com',
      subject: 'RV: una cosa', body_text: 'Mira esto que me han mandado.', body_html: null,
      sender_email: 'administracion@metalplafer.com', sender_name: 'Administración',
      recipients: 'peticiones@metalplafer.com', received_at: HOY,
      forwarded: true, original_sender_email: null, original_sender_name: null,
      original_subject: null, sender_needs_review: true,
      client_id: null, notes: null, reviewed_by: null, reviewed_at: null,
      target_ficha_id: null, target_project_id: null, error_detail: null,
      is_demo: false, created_at: HOY, updated_at: HOY },

    // 3 · Un reenvío correcto Y con un adjunto que falló.
    { id: 's3', code: `SOL-${YEAR}-003`, status: 'error',
      provider_message_id: 'MSG-0003@metalplafer.com',
      subject: 'RV: Puerta de garaje',
      body_text: '-----Mensaje original-----\nDe: Marta Ribas <marta@ribasobres.cat>\n\nBuenos días…',
      body_html: null,
      sender_email: 'administracion@metalplafer.com', sender_name: 'Administración',
      recipients: 'peticiones@metalplafer.com', received_at: HOY,
      forwarded: true, original_sender_email: 'marta@ribasobres.cat',
      original_sender_name: 'Marta Ribas', original_subject: 'Puerta de garaje',
      sender_needs_review: false,
      client_id: null, notes: null, reviewed_by: null, reviewed_at: null,
      target_ficha_id: null, target_project_id: null,
      error_detail: 'No se han podido guardar 1 adjunto(s): «obra.mp4»: ocupa 41,3 MB '
        + 'y el máximo es 25 MB',
      is_demo: false, created_at: HOY, updated_at: HOY },
  ],
  documents: [
    { id: 'd1', ficha_id: null, project_id: null, order_id: null, report_id: null,
      work_id: null, mail_request_id: 's1', bucket: 'documentos',
      storage_path: 'mail/s1/plano-barandilla.pdf', file_name: 'plano-barandilla.pdf',
      mime_type: 'application/pdf', size_bytes: 51200, category: 'documento',
      scope: 'tecnica', uploaded_by: null, deleted_at: null, is_demo: false,
      created_at: AYER },
    { id: 'd2', ficha_id: null, project_id: null, order_id: null, report_id: null,
      work_id: null, mail_request_id: 's1', bucket: 'documentos',
      storage_path: 'mail/s1/escalera.jpg', file_name: 'escalera.jpg',
      mime_type: 'image/jpeg', size_bytes: 820000, category: 'foto',
      scope: 'tecnica', uploaded_by: null, deleted_at: null, is_demo: false,
      created_at: AYER },
  ],
  counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 0, OT: 0, PT: 0, OBRA: 0, SOL: 3 },
});

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

  // ============ LA BANDEJA ============
  check('«Solicitudes» está en el menú de administración',
    (await page.locator('a[href="#/admin/solicitudes"]').count()) >= 1);

  await page.goto(`http://localhost:${PORT}/#/admin/solicitudes`, { waitUntil: 'networkidle' });
  await page.locator('.table').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);

  const tabla = limpio(await page.locator('.table').innerText());
  check('La bandeja enseña lo que ha entrado por correo',
    tabla.includes(`SOL-${YEAR}-001`) && tabla.includes('Presupuesto barandilla escalera'),
    tabla.replace(/\n/g, ' | ').slice(0, 220));

  check('Con el remitente de cada uno',
    tabla.includes('laura@construccionessoler.es') && tabla.includes('Laura Soler'));

  check('Y los correos reenviados se ven como reenviados',
    tabla.includes('Reenviado'), tabla.replace(/\n/g, ' | ').slice(0, 300));

  check('El que no se sabe de quién es lo avisa en la lista',
    tabla.includes('falta saber de quién') || tabla.includes('Revisar remitente'),
    tabla.replace(/\n/g, ' | '));

  check('Y el que tuvo un problema sale «Con error»',
    tabla.includes('Con error'), tabla.replace(/\n/g, ' | '));

  check('Ninguna tiene destino todavía',
    (await page.locator('.table tbody tr').count()) === 3
    && !tabla.includes(`PRES-${YEAR}`),
    tabla.replace(/\n/g, ' | ').slice(0, 200));

  check('La bandeja dice que nada se convierte solo',
    limpio(await page.locator('.panel-body').first().innerText())
      .includes('Ninguna se convierte en presupuesto'),
    '');

  // ============ UNA SOLICITUD ES UNA FICHA PROVISIONAL ============
  await page.goto(`http://localhost:${PORT}/#/admin/solicitudes/s1`, { waitUntil: 'networkidle' });
  await panel(page, 'El correo').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);

  const cuerpoPagina = limpio(await page.locator('body').innerText());
  check('Lo primero que se lee es que esto todavía no es nada',
    cuerpoPagina.includes('ficha provisional')
    && cuerpoPagina.includes('No es un presupuesto'),
    cuerpoPagina.split('\n').filter((l) => l.includes('provisional')).join(' | '));

  const elCorreo = limpio(await panel(page, 'El correo').innerText());
  check('Se ve el correo entero: de quién, para quién, asunto y cuerpo',
    elCorreo.includes('laura@construccionessoler.es')
    && elCorreo.includes('peticiones@metalplafer.com')
    && elCorreo.includes('Presupuesto barandilla escalera')
    && elCorreo.includes('barandilla de 12 metros'),
    elCorreo.replace(/\n/g, ' | ').slice(0, 300));

  check('Y los archivos que mandó el cliente, con el panel de siempre',
    limpio(await panel(page, 'Archivos del correo').innerText())
      .includes('plano-barandilla.pdf'),
    limpio(await panel(page, 'Archivos del correo').innerText()).replace(/\n/g, ' | '));

  /*
    Con un cliente ya elegido, el selector de clientes de la aplicación
    no enseña un campo de texto: enseña el cliente y un botón para
    cambiarlo. Es lo que hace en todas las pantallas y aquí se comprueba
    igual.
  */
  check('El cliente viene propuesto, porque el correo coincidía',
    limpio(await panel(page, 'Revisión').innerText()).includes('Construcciones Soler')
    && (await panel(page, 'Revisión').locator('button:has-text("Cambiar")').count()) === 1,
    limpio(await panel(page, 'Revisión').innerText()).replace(/\n/g, ' | '));

  // ============ REVISAR A MANO ============
  await page.locator('#sol-notes').fill('Llamada el martes: quiere acabado negro forja.');
  await panel(page, 'Revisión').locator('button:has-text("Guardar la revisión")').click();
  await page.waitForTimeout(900);

  check('Al guardar la revisión queda revisada y con sus observaciones',
    db.mail_requests[0].status === 'revisada'
    && db.mail_requests[0].notes.includes('negro forja'),
    `${db.mail_requests[0].status} · ${db.mail_requests[0].notes}`);

  check('Revisar NO ha creado ningún presupuesto ni proyecto',
    db.fichas.length === 0 && db.projects.length === 0,
    `${db.fichas.length} fichas · ${db.projects.length} proyectos`);

  check('Y la pantalla dice quién la revisó y cuándo',
    limpio(await panel(page, 'Revisión').innerText()).includes('Revisada por'),
    limpio(await panel(page, 'Revisión').innerText()).replace(/\n/g, ' | '));

  // ============ EL REENVÍO SIN REMITENTE ============
  await page.goto(`http://localhost:${PORT}/#/admin/solicitudes/s2`, { waitUntil: 'networkidle' });
  await panel(page, 'El correo').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);

  const avisoRv = limpio(await page.locator('body').innerText());
  check('Un reenvío sin remitente fiable lo dice, y no se inventa nada',
    avisoRv.includes('no se ha podido saber con seguridad')
    && avisoRv.includes('No se ha inventado'),
    avisoRv.split('\n').filter((l) => l.includes('reenviado') || l.includes('inventado')).join(' | '));

  check('Y ofrece escribirlo a mano',
    (await page.locator('#sol-remitente').count()) === 1);

  await page.locator('#sol-remitente').fill('ana@obrescat.cat');
  await page.locator('#sol-remitente-nombre').fill('Ana Puig');
  await panel(page, 'Revisión').locator('button:has-text("Guardar la revisión")').click();
  await page.waitForTimeout(900);

  check('Al escribirlo, se guarda y deja de pedirlo',
    db.mail_requests[1].original_sender_email === 'ana@obrescat.cat'
    && db.mail_requests[1].sender_needs_review === false,
    JSON.stringify({
      correo: db.mail_requests[1].original_sender_email,
      pendiente: db.mail_requests[1].sender_needs_review,
    }));

  await page.reload({ waitUntil: 'networkidle' });
  await panel(page, 'El correo').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);
  check('Y el aviso desaparece de la pantalla',
    !limpio(await page.locator('body').innerText()).includes('No se ha inventado'));

  // ============ EL ADJUNTO QUE FALLÓ ============
  await page.goto(`http://localhost:${PORT}/#/admin/solicitudes/s3`, { waitUntil: 'networkidle' });
  await panel(page, 'El correo').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);

  const conError = limpio(await page.locator('body').innerText());
  check('Un adjunto que falló NO hace desaparecer el correo',
    conError.includes('Puerta de garaje') && conError.includes('Buenos días'),
    conError.replace(/\n/g, ' | ').slice(0, 200));

  check('Y se dice qué falló, con el motivo',
    conError.includes('No se ha podido guardar todo')
    && conError.includes('41,3 MB'),
    conError.split('\n').filter((l) => l.includes('MB')).join(' | '));

  check('En un reenvío bien leído se ven los DOS remitentes',
    limpio(await panel(page, 'El correo').innerText()).includes('marta@ribasobres.cat')
    && limpio(await panel(page, 'El correo').innerText()).includes('Reenviado por')
    && limpio(await panel(page, 'El correo').innerText()).includes('administracion@metalplafer.com'),
    limpio(await panel(page, 'El correo').innerText()).replace(/\n/g, ' | '));

  // ============ CONVERTIRLA: MANUAL Y CON EL FORMULARIO DE SIEMPRE ============
  await page.goto(`http://localhost:${PORT}/#/admin/solicitudes/s1`, { waitUntil: 'networkidle' });
  await panel(page, 'Convertir en…').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);

  const panelConvertir = panel(page, 'Convertir en…');
  check('Hay que elegir en qué se convierte: no lo decide la aplicación',
    (await panelConvertir.locator('button:has-text("Presupuesto")').count()) === 1
    && (await panelConvertir.locator('button:has-text("Visita técnica")').count()) === 1
    && (await panelConvertir.locator('button:has-text("Aviso")').count()) === 1);

  await panelConvertir.locator('button:has-text("Presupuesto")').click();
  await page.waitForURL(/#\/admin\/fichas\/nueva/, { timeout: 15000 });
  await page.locator('#f-title').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);

  check('Se abre la ficha de presupuesto DE SIEMPRE',
    (await page.locator('#f-amount').count()) === 1
    && (await page.locator('#f-title').count()) === 1,
    page.url());

  const textoForm = limpio(await page.locator('body').innerText());
  check('Y avisa de que quedará vinculada a la solicitud',
    textoForm.includes('vinculada a la solicitud'),
    textoForm.split('\n').filter((l) => l.includes('vinculada')).join(' | '));

  check('Con un botón para volver a la solicitud',
    (await page.locator('a:has-text("Volver a la solicitud")').count()) === 1);

  check('El cliente de la solicitud viene puesto',
    limpio(await page.locator('form').innerText()).includes('Construcciones Soler'),
    limpio(await page.locator('form').innerText()).replace(/\n/g, ' | ').slice(0, 200));

  await page.locator('#f-title').fill('Barandilla de 12 metros');
  await page.locator('#f-amount').fill('4200');
  await page.locator('button:has-text("Crear presupuesto")').click();

  // Vuelve A LA SOLICITUD, que es de donde se salió.
  await page.waitForURL(/#\/admin\/solicitudes\/s1$/, { timeout: 15000 });
  await panel(page, 'Convertir en…').waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);

  check('Al guardar, el presupuesto se crea y la solicitud queda vinculada',
    db.fichas.length === 1 && db.mail_requests[0].status === 'vinculada'
    && db.mail_requests[0].target_ficha_id === db.fichas[0].id,
    JSON.stringify({ fichas: db.fichas.length, estado: db.mail_requests[0].status }));

  const yaEs = limpio(await panel(page, 'Convertir en…').innerText());
  check('Y la pantalla dice en qué se ha convertido',
    yaEs.includes('ya es') && yaEs.includes(`PRES-${YEAR}-001`),
    yaEs.replace(/\n/g, ' | '));

  check('La ficha provisional NO se ha borrado',
    db.mail_requests.length === 3
    && db.mail_requests[0].body_text.includes('12 metros'),
    String(db.mail_requests.length));

  // LO QUE IMPORTA: los archivos del correo, desde el presupuesto.
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/${db.fichas[0].id}`,
    { waitUntil: 'networkidle' });
  await page.locator('.ficha-head').waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);

  const origen = panel(page, 'Documentos de origen');
  await origen.waitFor({ timeout: 10000 });
  const textoOrigen = limpio(await origen.innerText());

  check('El presupuesto ve los archivos que mandó el cliente por correo',
    textoOrigen.includes('plano-barandilla.pdf') && textoOrigen.includes('escalera.jpg'),
    textoOrigen.replace(/\n/g, ' | '));

  check('Diciendo que los mandó el cliente por correo, con su solicitud',
    textoOrigen.includes('Lo mandó el cliente por correo')
    && textoOrigen.includes(`SOL-${YEAR}-001`),
    textoOrigen.replace(/\n/g, ' | '));

  check('Y sin copiar ni un archivo',
    db.documents.filter((d) => d.mail_request_id === 's1').length === 2
    && db.documents.every((d) => !d.ficha_id),
    `${db.documents.length} archivos en total`);

  // ============ DESCARTAR Y RECUPERAR ============
  await page.goto(`http://localhost:${PORT}/#/admin/solicitudes/s2`, { waitUntil: 'networkidle' });
  await panel(page, 'El correo').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);

  await page.locator('button:has-text("Descartar")').first().click();
  await page.locator('.modal button:has-text("Descartar")').click();
  await page.waitForTimeout(900);

  check('Lo que no era una solicitud se descarta',
    db.mail_requests[1].status === 'descartada', db.mail_requests[1].status);

  check('Pero el correo se conserva, y se puede recuperar',
    db.mail_requests[1].body_text === 'Mira esto que me han mandado.'
    && (await page.locator('button:has-text("Recuperar")').count()) === 1);

  await page.locator('button:has-text("Recuperar")').click();
  await page.waitForTimeout(900);
  check('Y recuperarla la devuelve a la bandeja',
    db.mail_requests[1].status === 'pendiente', db.mail_requests[1].status);

  // Una solicitud ya vinculada no se descarta por error.
  await page.goto(`http://localhost:${PORT}/#/admin/solicitudes/s1`, { waitUntil: 'networkidle' });
  await panel(page, 'El correo').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  check('Una solicitud ya vinculada no ofrece descartarse',
    (await page.locator('button:has-text("Descartar")').count()) === 0);

  // ============ UN TRABAJADOR NO VE NADA DE ESTO ============
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(movil, { db, getUser: () => WORKER });
  const obrero = await movil.newPage();
  const erroresObrero = [];
  obrero.on('pageerror', (e) => erroresObrero.push(String(e)));
  await signIn(obrero, PORT, WORKER.username);

  check('Un trabajador no tiene «Solicitudes» en su menú',
    (await obrero.locator('a[href="#/admin/solicitudes"]').count()) === 0);

  await obrero.goto(`http://localhost:${PORT}/#/admin/solicitudes`, { waitUntil: 'networkidle' });
  await obrero.waitForTimeout(1200);
  check('Y si escribe la dirección a mano, no entra en la bandeja',
    !obrero.url().includes('/admin/solicitudes'),
    obrero.url());

  check('Ni una pantalla rota por el camino',
    erroresObrero.length === 0, erroresObrero.join(' | '));

  // ============ NADA SE HA ROTO ============
  check('Ni un error de programación en toda la prueba',
    errores.length === 0, errores.join(' | '));
  check('Ni un error en la consola del navegador',
    consola.length === 0, consola.join(' | '));

  report('MEJORAS · BANDEJA DE ENTRADA DE SOLICITUDES');
} finally {
  await browser.close();
  server.close();
}
