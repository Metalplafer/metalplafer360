/**
 * METALPLAFER360 · BLOQUE 2 · Documentación, visor móvil y borrado.
 *
 *   npm run test:bloque2
 *
 * Comprueba en un navegador real:
 *   · que administración elige categoría al subir y puede mover un
 *     documento de una a otra, con su confirmación;
 *   · que el trabajador NO ve la documentación administrativa;
 *   · que las fotos y los vídeos se miran DENTRO de la aplicación, sin
 *     descargar nada, también desde el móvil;
 *   · que se puede eliminar de verdad, y que no se puede cuando hay
 *     trabajo o dinero de por medio.
 *
 * Las reglas de verdad se prueban contra PostgreSQL en
 * tests/sql/81_tests_documentos_borrado.sql.
 */
import {
  ADMIN, WORKER, YEAR, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4188;
const HOY = today();

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: null, address: 'Carrer de la Indústria, 12',
      city: 'Sabadell', postal_code: '08202', notes: null, active: true, archived_at: null,
      is_demo: false, created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  projects: [
    { id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1', contact_id: null, source_ficha_id: null,
      name: 'Barandilla escalera comunitaria', description: 'Barandilla de acero.',
      measures: '4 tramos', finish: 'Negro forja', location: 'Escalera', address: 'Rambla, 45',
      observations: null, budget_amount: 6400, advance_amount: 2000,
      budget_hours_fab: 32, budget_hours_mont: 16, phase: 'fabricacion', no_assembly: false,
      billing_status: 'por_facturar', finished_at: null, archived_at: null, is_demo: false,
      created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z' },
    { id: 'p2', code: `PROY-${YEAR}-002`, client_id: 'c1', contact_id: null, source_ficha_id: null,
      name: 'Puerta corredera almacén', description: null, measures: null, finish: null,
      location: null, address: null, observations: null, budget_amount: 1200,
      advance_amount: null, budget_hours_fab: 8, budget_hours_mont: 4, phase: 'preparacion',
      no_assembly: false, billing_status: 'por_facturar', finished_at: null, archived_at: null,
      is_demo: false, created_at: '2026-05-04T09:00:00Z', updated_at: '2026-05-04T09:00:00Z' },
  ],
  project_workers: [
    { project_id: 'p1', worker_id: WORKER.id, assigned_at: '2026-05-05T09:00:00Z',
      assigned_by: ADMIN.id, is_demo: false },
  ],
  documents: [
    { id: 'd1', project_id: 'p1', ficha_id: null, order_id: null, report_id: null,
      bucket: 'documentos', storage_path: 'projects/p1/plano-barandilla.pdf',
      file_name: 'plano-barandilla.pdf', mime_type: 'application/pdf', size_bytes: 20480,
      category: 'documento', scope: 'tecnica', uploaded_by: ADMIN.id, deleted_at: null,
      is_demo: false, created_at: '2026-05-06T09:00:00Z' },
    { id: 'd2', project_id: 'p1', ficha_id: null, order_id: null, report_id: null,
      bucket: 'documentos', storage_path: 'projects/p1/factura-acero.pdf',
      file_name: 'factura-acero.pdf', mime_type: 'application/pdf', size_bytes: 30720,
      category: 'documento', scope: 'administrativa', uploaded_by: ADMIN.id, deleted_at: null,
      is_demo: false, created_at: '2026-05-06T10:00:00Z' },
    { id: 'd3', project_id: 'p1', ficha_id: null, order_id: null, report_id: null,
      bucket: 'documentos', storage_path: 'projects/p1/montaje.jpg',
      file_name: 'montaje.jpg', mime_type: 'image/jpeg', size_bytes: 102400,
      category: 'foto', scope: 'tecnica', uploaded_by: ADMIN.id, deleted_at: null,
      is_demo: false, created_at: '2026-05-07T09:00:00Z' },
    { id: 'd4', project_id: 'p1', ficha_id: null, order_id: null, report_id: null,
      bucket: 'documentos', storage_path: 'projects/p1/soldadura.mp4',
      file_name: 'soldadura.mp4', mime_type: 'video/mp4', size_bytes: 512000,
      category: 'video', scope: 'tecnica', uploaded_by: ADMIN.id, deleted_at: null,
      is_demo: false, created_at: '2026-05-07T10:00:00Z' },
  ],
  counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 2, OT: 0, PT: 0 },
});

const people = [ADMIN, WORKER];
const browser = await launchBrowser();

try {
  // ============== ADMINISTRACIÓN: LAS DOS CATEGORÍAS ====================
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db, getUser: () => ADMIN, people });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));

  await signIn(page, PORT, 'salvi');
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const panel = page.locator('.panel:has(h2:has-text("Documentos, fotografías y vídeos"))');
  check('Hay exactamente dos categorías, ni una más',
    await panel.locator('.tabs button').count() === 2);
  check('Y son las dos que se pidieron',
    (await panel.locator('.tabs').innerText()).includes('Técnica')
    && (await panel.locator('.tabs').innerText()).includes('Administrativa'));

  check('La técnica enseña el plano, la foto y el vídeo',
    (await panel.innerText()).includes('plano-barandilla.pdf')
    && (await panel.innerText()).includes('montaje.jpg')
    && (await panel.innerText()).includes('soldadura.mp4'));
  check('Y la factura NO está en la técnica',
    !(await panel.innerText()).includes('factura-acero.pdf'));

  await panel.locator('.tabs button:has-text("Administrativa")').click();
  await page.waitForTimeout(500);
  check('En administrativa sí está la factura',
    (await panel.innerText()).includes('factura-acero.pdf'));
  check('Se explica para qué es cada categoría',
    (await panel.innerText()).includes('Albaranes, escandallos'));

  // ============== MOVER UN DOCUMENTO DE CATEGORÍA ======================
  await panel.locator('button[aria-label*="factura-acero.pdf" i][aria-label*="categoría"]').click();
  await page.waitForTimeout(400);
  check('Pregunta antes de mover, con las palabras pedidas',
    (await page.locator('.modal').innerText())
      .includes('¿Estás seguro de que quieres cambiar este documento de categoría?'));
  check('Y avisa de la consecuencia',
    (await page.locator('.modal').innerText()).includes('podrán verlo'));

  await page.locator('.modal button:has-text("Cambiar de categoría")').click();
  await page.waitForTimeout(900);
  check('La factura ya no está en administrativa',
    !(await panel.innerText()).includes('factura-acero.pdf'));

  await panel.locator('.tabs button:has-text("Técnica")').click();
  await page.waitForTimeout(500);
  check('Ahora está en técnica', (await panel.innerText()).includes('factura-acero.pdf'));

  const historial = page.locator('.panel:has(h2:has-text("Historial"))');
  check('El movimiento queda en el historial del proyecto, con el antes y el después',
    (await historial.innerText()).includes('movió «factura-acero.pdf»'));

  // Se devuelve a administrativa para el resto de la prueba.
  await panel.locator('button[aria-label*="factura-acero.pdf" i][aria-label*="categoría"]').click();
  await page.waitForTimeout(400);
  await page.locator('.modal button:has-text("Cambiar de categoría")').click();
  await page.waitForTimeout(900);

  // ============== EL TRABAJADOR NO LLEGA A LO ADMINISTRATIVO ===========
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(movil, { db, getUser: () => WORKER, people });
  const m = await movil.newPage();
  const erroresMovil = [];
  m.on('pageerror', (e) => erroresMovil.push(String(e)));

  await signIn(m, PORT, 'juan');
  await m.goto(`http://localhost:${PORT}/#/t/proyectos/p1`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(1000);

  const docsMovil = await m.locator('.panel:has-text("Documentación del proyecto")').innerText();
  check('El trabajador ve la documentación técnica', docsMovil.includes('plano-barandilla.pdf'));
  check('NO ve la factura', !docsMovil.includes('factura-acero.pdf'));
  check('Y no se le ofrece ninguna categoría que elegir',
    await m.locator('.panel:has-text("Documentación del proyecto") .tabs').count() === 0);
  check('Ni el botón de mover de categoría',
    await m.locator('[aria-label*="categoría"]').count() === 0);

  // ============== EL VISOR DE FOTOS Y VÍDEOS ===========================
  await m.locator('[aria-label="Ver montaje.jpg"]').click();
  await m.waitForTimeout(700);
  check('La foto se abre DENTRO de la aplicación, sin descargarla',
    await m.locator('.visor').isVisible());
  check('Se ve la imagen a tamaño completo',
    await m.locator('.visor-imagen').isVisible());
  check('Y dice el nombre del archivo',
    (await m.locator('.visor-barra').innerText()).includes('montaje.jpg'));
  check('Avisa de que se puede ampliar tocándola',
    (await m.locator('.visor-pie').innerText()).includes('ampliar'));

  await m.locator('.visor-imagen').click();
  await m.waitForTimeout(300);
  check('Al tocarla se amplía',
    (await m.locator('.visor-imagen').getAttribute('class')).includes('ampliada'));

  check('Hay flechas para pasar al siguiente, porque hay más de uno',
    await m.locator('.visor-flecha').count() === 2);
  await m.locator('.visor-flecha.derecha').click();
  await m.waitForTimeout(600);
  check('Se pasa al vídeo, con su reproductor y sus controles',
    await m.locator('.visor-video').isVisible()
    && (await m.locator('.visor-video').getAttribute('controls')) !== null);
  check('El vídeo se reproduce en la propia página en el móvil',
    (await m.locator('.visor-video').getAttribute('playsinline')) !== null);

  await m.locator('.visor-barra button[aria-label="Cerrar"]').click();
  await m.waitForTimeout(400);
  check('Se cierra con un toque', await m.locator('.visor').count() === 0);

  await m.locator('[aria-label="Ver montaje.jpg"]').click();
  await m.waitForTimeout(500);
  await m.keyboard.press('Escape');
  await m.waitForTimeout(400);
  check('Y también con Escape', await m.locator('.visor').count() === 0);

  check('En el móvil no hay desplazamiento horizontal', await m.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0);

  // ============== ELIMINAR DE VERDAD ===================================
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p2`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('Un proyecto ofrece archivar Y eliminar, las dos cosas',
    await page.locator('button:has-text("Archivar")').count() === 1
    && await page.locator('button:has-text("Eliminar")').count() === 1);

  await page.locator('button:has-text("Eliminar")').click();
  await page.waitForTimeout(400);
  check('Pregunta antes de eliminar un proyecto',
    (await page.locator('.modal').innerText()).includes('¿Estás seguro de que quieres eliminar'));
  check('Y recuerda que archivar conserva todo',
    (await page.locator('.modal').innerText()).includes('archívalo'));

  await page.locator('.modal button:has-text("Eliminar")').click();
  await page.waitForTimeout(1000);
  check('El proyecto se elimina y se vuelve al listado',
    page.url().includes('#/admin/proyectos'));
  // Se mira la TABLA, no el cuerpo entero: el aviso de «se ha eliminado»
  // lleva el código dentro y daría un falso positivo.
  const tabla = await page.locator('.table, .empty').first().innerText();
  check('Y ya no aparece en el listado', !tabla.includes(`PROY-${YEAR}-002`), tabla.slice(0, 120));

  // Un proyecto con horas validadas NO se puede eliminar.
  db.work_reports.push({
    id: 'pt-x', code: `PT-${YEAR}-001`, worker_id: WORKER.id, project_id: 'p1',
    work_type: 'fabricacion', work_date: HOY, work_done: 'Corte', hours: 6,
    needs_material: false, status: 'validado', submitted_at: null,
    validated_at: new Date().toISOString(), validated_by: ADMIN.id, rejected_at: null,
    reject_reason: null, assigned_at: null, assigned_by: null, is_demo: false,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });

  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('button:has-text("Eliminar")').click();
  await page.waitForTimeout(400);
  await page.locator('.modal button:has-text("Eliminar")').click();
  await page.waitForTimeout(1000);
  const avisos = await page.locator('.toast').allInnerTexts();
  const aviso = avisos[avisos.length - 1] ?? '';
  check('Un proyecto con horas validadas NO se elimina', page.url().includes('proyectos/p1'));
  check('Y se explica por qué, con los números delante',
    aviso.includes('trabajo ya validado') && aviso.includes('Archívalo'));

  // ============== ELIMINAR UN TRABAJADOR ===============================
  await page.goto(`http://localhost:${PORT}/#/admin/trabajadores`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('Cada trabajador se puede desactivar Y eliminar',
    await page.locator('[aria-label^="Desactivar a"]').count() >= 1
    && await page.locator('[aria-label^="Eliminar a"]').count() >= 1);

  await page.locator('[aria-label="Eliminar a Juan Ortega"]').click();
  await page.waitForTimeout(400);
  check('Pregunta con las palabras pedidas',
    (await page.locator('.modal').innerText())
      .includes('¿Estás seguro de que quieres eliminar este trabajador?'));
  check('Y ofrece desactivarlo como alternativa',
    (await page.locator('.modal').innerText()).includes('desactívalo'));

  await page.locator('.modal button:has-text("Eliminar")').click();
  await page.waitForTimeout(900);
  const avisosT = await page.locator('.toast').allInnerTexts();
  const avisoT = avisosT[avisosT.length - 1] ?? '';
  check('No se elimina a quien tiene trabajo registrado',
    avisoT.includes('trabajo registrado'));
  check('Y se dice qué tiene, no un «no se puede» a secas',
    avisoT.includes('partes') && avisoT.includes('Desactívalo'));

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
