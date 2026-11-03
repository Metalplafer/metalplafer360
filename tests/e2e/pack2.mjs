/**
 * METALPLAFER360 · PACK 2 · DOCUMENTOS, PARTES Y GESTIONES INTERNAS
 *
 * Comprueba, pulsando lo que pulsa una persona:
 *
 *   · MEJORA 1 · que un PDF llegado por correo tiene su ojo y se abre,
 *     igual que cualquier otro documento, y que se sigue descargando;
 *   · MEJORA 3 · que la fotografía de un parte se ve desde el proyecto
 *     y desde el aviso, diciendo de qué parte viene;
 *   · MEJORA 4 · que una nota larga, con saltos de línea y con una
 *     palabra kilométrica, NO pone el texto en vertical. Esto se mide
 *     en píxeles, que es la única manera de comprobarlo de verdad;
 *   · MEJORA 5 · que se adjuntan archivos a una tarjeta, que el tablero
 *     lo indica y que siguen ahí después de archivar y recuperar;
 *   · MEJORA 6 · que una tarjeta se elimina con confirmación, que deja
 *     de estar en los dos sitios y que no se lleva por delante ni el
 *     evento del calendario ni los archivos de otra tarjeta.
 */
import {
  ADMIN, WORKER, YEAR, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, stubSupabase,
} from './fake-supabase.mjs';

const PORT = 4209;
const HOY = new Date().toISOString().slice(0, 10);

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();
const limpio = (s) => s.replace(/ /g, ' ');
const panel = (p, titulo) => p.locator(`.panel:has(h2:text-is("${titulo}"))`);

const proyecto = (extra) => ({
  contact_id: null, source_ficha_id: null, description: null, measures: null, finish: null,
  location: null, address: null, observations: null, budget_amount: 6400,
  advance_amount: null, phase: 'fabricacion', no_assembly: false,
  billing_status: 'por_facturar', finished_at: null, archived_at: null, is_demo: false,
  invoiced_amount: null, invoiced_on: null, work_id: null, autoplan: false,
  created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z', ...extra,
});

const doc = (extra) => ({
  bucket: 'documentos', deleted_at: null, scope: 'tecnica',
  ficha_id: null, project_id: null, order_id: null, report_id: null,
  work_id: null, mail_request_id: null, internal_task_id: null,
  uploaded_by: ADMIN.id, created_at: '2026-11-03T09:00:00Z', ...extra,
});

/*
  LA NOTA QUE ROMPÍA EL TABLERO. Tiene las tres cosas que el encargo
  nombra: es larga, lleva saltos de línea y lleva una palabra sin
  espacios que no cabe en la columna.
*/
const NOTA_LARGA = 'Chaqueta, gorros y bragas\nPara los cuatro de montaje\n'
  + 'referencia RECAMBIOSINDUSTRIALESMETALPLAFER2026XLARGO';

const db = createDb({
  clients: [
    { id: 'c1', kind: 'particular', name: 'Duncan MCMath', tax_id: null,
      phone: '600111222', email: 'duncan@example.com', address: 'Carrer Gran, 4',
      city: 'Sabadell', postal_code: '08201', notes: null, active: true,
      archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  projects: [proyecto({ id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1',
                        name: 'Puerta de garaje' })],
  project_workers: [{ project_id: 'p1', worker_id: WORKER.id }],
  fichas: [
    { id: 'a1', code: `AVI-${YEAR}-001`, type: 'aviso', status: 'pendiente',
      client_id: 'c1', contact_id: null, title: 'Aviso DUNCAN', description: null,
      address: null, phone: null, scheduled_date: null, scheduled_time: null,
      assigned_to: WORKER.id, amount: null, archived_at: null, is_demo: false,
      created_by: ADMIN.id, review_status: null, billing_state: null,
      created_at: '2026-11-01T09:00:00Z', updated_at: '2026-11-01T09:00:00Z' },
  ],
  mail_requests: [
    { id: 's1', code: `SOL-${YEAR}-014`, status: 'vinculada',
      provider_message_id: 'MSG-0014@example.com',
      subject: 'Propuesta de planos', body_text: 'Os paso los planos.', body_html: null,
      sender_email: 'duncan@example.com', sender_name: 'Duncan MCMath',
      recipients: 'peticiones@metalplafer.com', received_at: '2026-11-03T12:57:00Z',
      forwarded: false, original_sender_email: null, original_sender_name: null,
      original_subject: null, sender_needs_review: false,
      client_id: 'c1', notes: null, reviewed_by: ADMIN.id, reviewed_at: HOY,
      target_ficha_id: 'a1', target_project_id: null, error_detail: null,
      is_demo: false, created_at: HOY, updated_at: HOY },
  ],
  work_reports: [
    { id: 'r1', code: 'PT-2026-050', worker_id: WORKER.id, project_id: 'p1', ficha_id: null,
      work_type: 'fabricacion', work_date: HOY, work_done: 'Soldadura', hours: 6,
      needs_material: false, status: 'validado', submitted_at: HOY, validated_at: HOY,
      validated_by: ADMIN.id, rejected_at: null, reject_reason: null,
      is_demo: false, created_at: HOY, updated_at: HOY },
    // Un parte SIN proyecto ni aviso: no debe romper nada.
    { id: 'r2', code: 'PT-2026-051', worker_id: WORKER.id, project_id: null, ficha_id: null,
      work_type: 'fabricacion', work_date: HOY, work_done: null, hours: null,
      needs_material: false, status: 'borrador', submitted_at: null, validated_at: null,
      validated_by: null, rejected_at: null, reject_reason: null,
      is_demo: false, created_at: HOY, updated_at: HOY },
  ],
  documents: [
    // El PDF del correo: el que no tenía ojo.
    doc({ id: 'd1', mail_request_id: 's1',
          storage_path: 'mail/s1/propuesta-planos.pdf',
          file_name: 'propuesta planos Heliswiss.pdf',
          mime_type: 'application/pdf', size_bytes: 426900, category: 'documento' }),
    // Y una imagen del mismo correo, que sí lo tenía.
    doc({ id: 'd2', mail_request_id: 's1',
          storage_path: 'mail/s1/logo.png', file_name: 'logo-iss.png',
          mime_type: 'image/png', size_bytes: 7000, category: 'foto' }),
    // La foto de un parte sobre el proyecto.
    doc({ id: 'd3', report_id: 'r1', uploaded_by: WORKER.id,
          storage_path: 'reports/r1/soldadura.jpg', file_name: 'soldadura.jpg',
          mime_type: 'image/jpeg', size_bytes: 700000, category: 'foto' }),
    // Y la de un parte suelto, que no debe aparecer en ningún sitio.
    doc({ id: 'd4', report_id: 'r2', uploaded_by: WORKER.id,
          storage_path: 'reports/r2/suelta.jpg', file_name: 'suelta.jpg',
          mime_type: 'image/jpeg', size_bytes: 120000, category: 'foto' }),
  ],
  internal_lists: [
    { id: 'l1', name: 'RRHH', position: 10, created_by: ADMIN.id,
      created_at: HOY, updated_at: HOY },
  ],
  internal_tasks: [
    { id: 't1', list_id: 'l1', title: 'PEDIR ROPA', notes: NOTA_LARGA,
      done: false, done_at: null, position: 10, archived_at: null,
      calendar_note_id: null, created_by: ADMIN.id, created_at: HOY, updated_at: HOY },
    { id: 't2', list_id: 'l1', title: 'PAGO ASEPEYO RIKI', notes: null,
      done: false, done_at: null, position: 20, archived_at: null,
      calendar_note_id: null, created_by: ADMIN.id, created_at: HOY, updated_at: HOY },
  ],
  internal_task_items: [],
});

// Un adjunto ya puesto en la segunda tarjeta: es el que NO se puede
// llevar por delante al eliminar la primera.
db.documents.push(doc({
  id: 'd5', internal_task_id: 't2',
  storage_path: 'internas/t2/recibo.pdf', file_name: 'recibo.pdf',
  mime_type: 'application/pdf', size_bytes: 8000, category: 'documento',
}));

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

  // ============ MEJORA 1 · EL OJO DE LOS PDF DE ORIGEN ============
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/a1`, { waitUntil: 'networkidle' });
  await panel(page, 'Documentos de origen').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);

  const origen = panel(page, 'Documentos de origen');
  check('El aviso enseña los dos archivos que mandó el cliente',
    (await origen.locator('.doc-list li').count()) === 2,
    limpio(await origen.innerText()).replace(/\n+/g, ' | ').slice(0, 140));

  const filaPdf = origen.locator('.doc-list li', { hasText: 'propuesta planos' });
  check('El PDF de origen TIENE el icono del ojo',
    (await filaPdf.locator('button[aria-label^="Ver "]').count()) === 1,
    limpio(await filaPdf.innerText()).replace(/\n+/g, ' · '));

  check('Y sigue teniendo el de descargar',
    (await filaPdf.locator('button[aria-label^="Descargar "]').count()) === 1);

  /*
    Y EL OJO ABRE DE VERDAD. No basta con que el icono esté: se
    comprueba que al pulsarlo se pide un enlace firmado y se abre una
    pestaña con él. Si no hubiera permiso, Supabase no firmaría y no se
    abriría nada.
  */
  const abierta = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
  await filaPdf.locator('button[aria-label^="Ver "]').click();
  const pestana = await abierta;
  check('Y al pulsarlo se abre el PDF, sin descargarlo antes',
    Boolean(pestana) && /propuesta-planos\.pdf/.test(pestana.url()),
    pestana ? pestana.url().slice(0, 90) : '(no se abrió nada)');
  if (pestana) await pestana.close();

  // La imagen del mismo panel sigue abriéndose en el visor de siempre.
  await origen.locator('.doc-list li', { hasText: 'logo-iss' })
    .locator('button[aria-label^="Ver "]').click();
  await page.waitForTimeout(600);
  check('Y una imagen del mismo panel sigue abriéndose en el visor de la aplicación',
    (await page.locator('.visor').count()) === 1
    && (await page.locator('.visor-nombre').innerText()).includes('logo-iss'),
    (await page.locator('.visor').count())
      ? limpio(await page.locator('.visor-nombre').innerText()) : '(no se abrió el visor)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ============ MEJORA 3 · LAS FOTOS DE UN PARTE ============
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const origenProy = panel(page, 'Documentos de origen');
  check('El proyecto ve la fotografía del parte hecho sobre él',
    (await origenProy.count()) === 1
    && (await origenProy.innerText()).includes('soldadura.jpg'),
    (await origenProy.count())
      ? limpio(await origenProy.innerText()).replace(/\n+/g, ' | ').slice(0, 160)
      : '(no hay panel)');

  check('Diciendo de qué parte viene',
    (await origenProy.innerText()).includes('PT-2026-050'));

  check('Y la foto de un parte SIN proyecto no se cuela en ningún sitio',
    !(await origenProy.innerText()).includes('suelta.jpg'));

  // ============ MEJORA 4 · EL TEXTO NO SE PONE EN VERTICAL ============
  await page.goto(`http://localhost:${PORT}/#/admin/internas`, { waitUntil: 'networkidle' });
  await page.locator('.kanban').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);

  /*
    SE MIDE EN PÍXELES, y es la única forma de comprobarlo.

    El fallo era que «.kanban-pies» —la línea de notas y checklist—
    estrujaba el título hasta dejarlo sin anchura, y el navegador partía
    la palabra letra a letra. Una comprobación de texto no lo habría
    visto: el texto estaba, solo que en columna.

    Un título estrujado mide unos 10-15 px de ancho. Uno sano ocupa casi
    toda la tarjeta. Se exige la mitad de la columna, que deja margen de
    sobra y sigue siendo imposible de cumplir si vuelve el fallo.
  */
  const tarjeta = page.locator('.kanban-card', { hasText: 'PEDIR ROPA' });
  const medidas = await tarjeta.evaluate((el) => {
    const t = el.querySelector('.kanban-title');
    return { titulo: t.getBoundingClientRect().width, tarjeta: el.getBoundingClientRect().width };
  });
  check('El título de una tarjeta CON nota ocupa el ancho de la tarjeta, no una columna',
    medidas.titulo > medidas.tarjeta * 0.5,
    `título ${Math.round(medidas.titulo)} px de ${Math.round(medidas.tarjeta)} px`);

  // Y no crece sin fin: cuatro líneas de techo.
  const alto = await tarjeta.evaluate((el) => el.getBoundingClientRect().height);
  check('Y la tarjeta no se vuelve altísima por una nota larga',
    alto < 220, `${Math.round(alto)} px de alto`);

  check('La tarjeta indica que tiene nota',
    (await tarjeta.locator('.kanban-pies').innerText()).includes('≡'));

  // ============ MEJORA 5 · ADJUNTOS EN UNA TARJETA ============
  check('El tablero indica los adjuntos de la otra tarjeta',
    (await page.locator('.kanban-card', { hasText: 'PAGO ASEPEYO' })
      .locator('.kanban-pies').innerText()).includes('1'),
    limpio(await page.locator('.kanban-card', { hasText: 'PAGO ASEPEYO' }).innerText()));

  await page.locator('.kanban-title:text-is("PAGO ASEPEYO RIKI")').click();
  await page.locator('.modal').waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);

  const adjuntos = page.locator('.modal .panel:has(h2:text-is("Archivos adjuntos"))');
  check('La tarjeta abierta tiene su sección de archivos adjuntos',
    (await adjuntos.count()) === 1);

  check('Con el archivo que ya tenía, y con su ojo y su descarga',
    (await adjuntos.innerText()).includes('recibo.pdf')
    && (await adjuntos.locator('button[aria-label^="Ver "]').count()) === 1
    && (await adjuntos.locator('button[aria-label^="Descargar "]').count()) === 1,
    limpio(await adjuntos.innerText()).replace(/\n+/g, ' | ').slice(0, 140));

  // Archivar y recuperar no se lleva los adjuntos.
  await page.locator('.modal button:has-text("Archivar la tarjeta")').click();
  await page.locator('.modal-foot button:has-text("Archivar")').click();
  await page.waitForTimeout(1200);

  await page.locator('.tabs button:has-text("Tareas archivadas")').click();
  await page.locator('.table').waitFor({ timeout: 10000 });
  await page.locator('.table tbody tr').first().locator('button:has-text("Devolver")').click();
  await page.waitForTimeout(1200);

  check('Archivar y recuperar la tarjeta NO se lleva sus adjuntos',
    db.documents.filter((d) => d.internal_task_id === 't2').length === 1);

  // ============ MEJORA 6 · ELIMINAR UNA TARJETA ============
  await page.locator('.tabs button:has-text("Tablero")').click();
  await page.locator('.kanban').waitFor({ timeout: 10000 });
  await page.waitForTimeout(700);

  // A la primera se le pone un evento, para ver que NO se borra.
  await page.locator('.kanban-title:text-is("PEDIR ROPA")').click();
  await page.locator('.modal').waitFor({ timeout: 10000 });
  await page.locator('button:has-text("Añadir al calendario")').first().click();
  await page.locator('#it-dia').fill(HOY);
  await page.locator('button:has-text("Añadir al calendario")').last().click();
  await page.waitForTimeout(1100);

  const notaId = db.internal_tasks.find((t) => t.id === 't1').calendar_note_id;
  check('La tarjeta que se va a eliminar tiene su evento en el calendario',
    Boolean(notaId));

  await page.locator('.modal button:has-text("Eliminar la tarjeta")').click();
  await page.locator('.modal-foot button:has-text("Eliminar para siempre")')
    .waitFor({ timeout: 10000 });

  const aviso = limpio(await page.locator('.modal').last().innerText());
  check('Eliminar pide confirmación y explica que NO es archivar',
    aviso.includes('para siempre') && aviso.toLowerCase().includes('archivar'),
    aviso.replace(/\n+/g, ' | ').slice(0, 180));

  check('Y avisa de que el evento del calendario se queda',
    aviso.toLowerCase().includes('no se borra'), aviso.replace(/\n+/g, ' | ').slice(0, 180));

  await page.locator('.modal-foot button:has-text("Eliminar para siempre")').click();
  await page.waitForTimeout(1400);

  check('La tarjeta se elimina',
    !db.internal_tasks.some((t) => t.id === 't1'),
    db.internal_tasks.map((t) => t.title).join(' · '));

  check('Y no está en el tablero',
    !(await page.locator('.kanban').innerText()).includes('PEDIR ROPA'),
    limpio(await page.locator('.kanban').innerText()).replace(/\n+/g, ' | ').slice(0, 120));

  await page.locator('.tabs button:has-text("Tareas archivadas")').click();
  await page.waitForTimeout(900);
  check('Ni en «Tareas archivadas»: eliminar no es archivar',
    !(await page.locator('main, .page').innerText()).includes('PEDIR ROPA'));

  /*
    Y LO QUE NO SE PUEDE LLEVAR POR DELANTE.
  */
  check('El evento del calendario NO se ha borrado',
    db.calendar_notes.some((n) => n.id === notaId),
    db.calendar_notes.map((n) => n.title).join(' · ') || '(ninguno)');

  check('Y el adjunto de la OTRA tarjeta sigue ahí',
    db.documents.some((d) => d.internal_task_id === 't2'));

  check('Ni un error de programación',
    errores.length === 0, errores.join(' | '));
  check('Ni un error en la consola',
    consola.length === 0, consola.join(' | '));

  report('PACK 2 · DOCUMENTOS, PARTES Y GESTIONES INTERNAS');
} finally {
  await browser.close();
  server.close();
}
