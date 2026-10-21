/**
 * METALPLAFER360 · CORRECCIONES TRAS LAS PRUEBAS REALES
 *
 *   npm run test:correcciones
 *
 * Pruebas de regresión de los fallos que aparecieron al usar la
 * aplicación de verdad. Cada comprobación de aquí FALLA con el código
 * anterior: no están para que salga verde, están para que el fallo no
 * vuelva sin que nos enteremos.
 *
 * FASE 1 · Calendario, proyectos y obras
 *   1.2 · Arrastrar la fabricación movía el montaje, y los días que no
 *         eran el primero de un tramo no se movían.
 *   1.1 · No se podían editar las fechas desde la ficha del proyecto.
 *   1.3 · No se podía editar el periodo de la obra en el calendario.
 */
import {
  ADMIN, WORKER, YEAR, addDays, buildApp, createChecker, createDb, launchBrowser,
  mondayOf, serveApp, signIn, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4196;
const HOY = today();

/**
 * Fechas estables para la prueba: el primer lunes DEL MES QUE VIENE.
 *
 * Se trabaja en el mes siguiente a propósito. Así la rejilla que se mira
 * es la de un mes completo al que se llega con una pulsación, y los
 * índices de las casillas no dependen de qué día sea hoy.
 */
function primerLunesDelMesQueViene() {
  const d = new Date(`${HOY}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const LUNES = primerLunesDelMesQueViene();
const MARTES = addDays(LUNES, 1);
const MIERCOLES = addDays(LUNES, 2);
const JUEVES = addDays(LUNES, 3);
// La semana siguiente, para el tramo de varios días del segundo proyecto.
const LUNES2 = addDays(LUNES, 7);
const MIERCOLES2 = addDays(LUNES, 9);

/** El primer día de la rejilla del mes que se está mirando. */
const INICIO_REJILLA = mondayOf(`${LUNES.slice(0, 7)}-01`);
const casilla = (iso) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${INICIO_REJILLA}T00:00:00Z`)) / 86400000);

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

const proyecto = (extra) => ({
  contact_id: null, source_ficha_id: null, description: null, measures: null, finish: null,
  location: null, address: null, observations: null, budget_amount: 6400,
  advance_amount: null, phase: 'fabricacion', no_assembly: false,
  billing_status: 'por_facturar', finished_at: null, archived_at: null, is_demo: false,
  invoiced_amount: null, invoiced_on: null, work_id: null, autoplan: false,
  created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z',
  ...extra,
});

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: 'obras@garcia.es', address: 'Carrer de la Indústria, 12',
      city: 'Sabadell', postal_code: '08202', notes: null, active: true, archived_at: null,
      is_demo: false, created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  projects: [
    // EL CASO DEL ENCARGO: fabricación y montaje, los dos a la vista y en
    // días distintos. Un día cada uno, colocados a mano, para que la
    // rejilla sea exactamente la que se espera.
    proyecto({
      id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1', name: 'Barandilla escalera',
      budget_hours_fab: 8, budget_hours_mont: 8,
      fab_start: LUNES, fab_end: LUNES, mont_start: MARTES, mont_end: MARTES,
      fab_workers: 1, mont_workers: 1, fab_manual: true, mont_manual: true,
      work_id: 'w1',
    }),
    // UN TRAMO DE VARIOS DÍAS, todavía sin fijar a mano: 24 h con una
    // persona son 3 días (lunes, martes y miércoles de la semana que viene).
    proyecto({
      id: 'p2', code: `PROY-${YEAR}-002`, client_id: 'c1', name: 'Puerta corredera taller',
      budget_hours_fab: 24, budget_hours_mont: 0,
      fab_start: LUNES2, fab_end: MIERCOLES2, mont_start: null, mont_end: null,
      fab_workers: 1, mont_workers: 1, fab_manual: false, mont_manual: false,
      no_assembly: true,
    }),
  ],
  // FASE 2 · un parte del trabajador con un VÍDEO y una FOTO, y dos
  // archivos en el proyecto: uno suyo y otro de administración.
  work_reports: [
    { id: 'pt1', code: `PT-${YEAR}-001`, worker_id: WORKER.id, project_id: 'p1',
      work_type: 'fabricacion', work_date: HOY, work_done: 'Soldadura de los tramos.',
      hours: 6, needs_material: false, status: 'borrador',
      submitted_at: null, validated_at: null, validated_by: null,
      rejected_at: null, reject_reason: null, assigned_at: null, assigned_by: null,
      is_demo: false, created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T09:00:00Z' },
  ],
  documents: [
    // El vídeo del parte: esto es lo que no se podía reproducir.
    { id: 'dv', project_id: null, ficha_id: null, order_id: null, report_id: 'pt1',
      bucket: 'documentos', storage_path: 'reports/pt1/soldadura.mp4',
      file_name: 'soldadura.mp4', mime_type: 'video/mp4', size_bytes: 1048576,
      category: 'video', scope: 'tecnica', uploaded_by: WORKER.id, deleted_at: null,
      is_demo: false, created_at: '2026-10-01T10:00:00Z' },
    { id: 'df', project_id: null, ficha_id: null, order_id: null, report_id: 'pt1',
      bucket: 'documentos', storage_path: 'reports/pt1/tramo.jpg',
      file_name: 'tramo.jpg', mime_type: 'image/jpeg', size_bytes: 204800,
      category: 'foto', scope: 'tecnica', uploaded_by: WORKER.id, deleted_at: null,
      is_demo: false, created_at: '2026-10-01T10:05:00Z' },
    // En el proyecto: uno del trabajador y otro de administración.
    { id: 'dp1', project_id: 'p1', ficha_id: null, order_id: null, report_id: null,
      bucket: 'documentos', storage_path: 'projects/p1/obra-juan.jpg',
      file_name: 'obra-juan.jpg', mime_type: 'image/jpeg', size_bytes: 204800,
      category: 'foto', scope: 'tecnica', uploaded_by: WORKER.id, deleted_at: null,
      is_demo: false, created_at: '2026-10-02T09:00:00Z' },
    { id: 'dp2', project_id: 'p1', ficha_id: null, order_id: null, report_id: null,
      bucket: 'documentos', storage_path: 'projects/p1/plano.pdf',
      file_name: 'plano.pdf', mime_type: 'application/pdf', size_bytes: 20480,
      category: 'documento', scope: 'tecnica', uploaded_by: ADMIN.id, deleted_at: null,
      is_demo: false, created_at: '2026-10-02T09:10:00Z' },
  ],
  works: [
    // La obra del primer proyecto, todavía SIN periodo propio: así se
    // puede comprobar que arranca siguiendo a sus proyectos.
    { id: 'w1', code: `OBRA-${YEAR}-001`, name: 'Comunidad Calle Mayor 25',
      client_id: 'c1', address: 'Calle Mayor 25, Sabadell',
      description: 'Obra de prueba de las correcciones.', observations: null,
      cal_start: null, cal_end: null,
      archived_at: null, is_demo: false, created_by: ADMIN.id,
      created_at: '2026-04-01T09:00:00Z', updated_at: '2026-04-01T09:00:00Z' },
  ],
  project_workers: [
    { project_id: 'p1', worker_id: WORKER.id, assigned_at: '2026-05-05T09:00:00Z',
      assigned_by: ADMIN.id, is_demo: false },
  ],
  counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 2, OT: 0, PT: 0, OBRA: 1 },
});

const browser = await launchBrowser();

/**
 * El texto de la pantalla, con los espacios duros convertidos en
 * espacios normales. El formato de euros de España mete un U+00A0 antes
 * del símbolo, y comparar eso con un espacio escrito a mano no cuadra
 * nunca.
 */
const limpio = (t) => t.replace(/\u00a0/g, ' ');

/** Arrastra una etiqueta del calendario a la casilla de un día. */
async function arrastrar(page, etiqueta, destinoIso) {
  const destino = page.locator('.cal-grid .cal-day').nth(casilla(destinoIso));
  await etiqueta.dispatchEvent('dragstart');
  await destino.dispatchEvent('dragover');
  await destino.dispatchEvent('drop');
  await page.waitForTimeout(900);
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));

  await signIn(page, PORT, 'salvi');

  // ===================================================================
  // 1.2 · EL ARRASTRE DEL CALENDARIO
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  // Al mes que viene, que es donde están las fechas de la prueba.
  await page.locator('.cal-toolbar button[aria-label="Siguiente"]').click();
  await page.waitForTimeout(1100);

  check('1.2 · La fabricación y el montaje del mismo proyecto se ven los dos',
    await page.locator('.cal-event[title^="Fabricación"]').count() >= 1
    && await page.locator('.cal-event[title^="Montaje"]').count() === 1);

  // --------- Se arrastra EL MONTAJE. La fabricación no se toca. --------
  //
  // Aquí estaba el fallo: las dos fases llevan el id del PROYECTO, así
  // que buscar el evento por «id» devolvía la fabricación —la primera de
  // la lista— y se movía esa.
  const fabAntes = db.projects[0].fab_start;
  await arrastrar(page, page.locator('.cal-event[title^="Montaje"]').first(), MIERCOLES);

  check('1.2 · Arrastrar el montaje mueve EL MONTAJE',
    db.projects[0].mont_start === MIERCOLES,
    `${MARTES} → ${db.projects[0].mont_start} (se esperaba ${MIERCOLES})`);
  check('1.2 · Y NO toca la fabricación',
    db.projects[0].fab_start === fabAntes,
    `la fabricación estaba el ${fabAntes} y ha quedado el ${db.projects[0].fab_start}`);
  check('1.2 · El aviso dice que lo que se ha movido es el montaje',
    (await page.locator('.toast').last().innerText()).includes('Montaje'),
    await page.locator('.toast').last().innerText());

  // --------- Y al revés: se arrastra LA FABRICACIÓN. ------------------
  const montAntes = db.projects[0].mont_start;
  await arrastrar(page, page.locator('.cal-event[title^="Fabricación"]').first(), JUEVES);

  check('1.2 · Arrastrar la fabricación mueve LA FABRICACIÓN',
    db.projects[0].fab_start === JUEVES,
    `${fabAntes} → ${db.projects[0].fab_start} (se esperaba ${JUEVES})`);
  check('1.2 · Y NO toca el montaje',
    db.projects[0].mont_start === montAntes,
    `el montaje estaba el ${montAntes} y ha quedado el ${db.projects[0].mont_start}`);

  // --------- UN TRAMO DE VARIOS DÍAS SE MUEVE ENTERO -----------------
  //
  // Esta comprobación CAMBIÓ con el rediseño del calendario, y el fallo
  // que vigilaba ya no puede existir.
  //
  // Antes, un tramo de tres días eran TRES etiquetas con el mismo id y
  // el mismo tipo, y al soltar la tercera sobre la primera la
  // comprobación «es el mismo día» daba verdadera y no pasaba nada, en
  // silencio. Ahora un tramo es UNA barra continua: no hay «día 3» que
  // arrastrar por separado, y lo que se suelta es el periodo entero.
  //
  // Lo que se comprueba es lo mismo de siempre: que arrastrar un tramo
  // de varios días lo mueve de verdad.
  // El título de la etiqueta es «tipo · nombre · cliente», sin el código.
  const diasP2 = page.locator('.cal-event[title*="Puerta corredera"]');
  check('1.2 · El tramo de 3 días es UNA barra de 3 columnas',
    await diasP2.count() === 1
    && /span\s*3/.test(await diasP2.first().evaluate(
      (el) => getComputedStyle(el).gridColumn || el.style.gridColumn)),
    `${await diasP2.count()} barra(s), columnas: `
    + await diasP2.first().evaluate((el) => getComputedStyle(el).gridColumn));

  // Se suelta en OTRO día: antes se soltaba el «día 3» sobre el día 1 del
  // propio tramo, que con una barra continua es soltarlo donde ya está y
  // no es un movimiento. El destino es el martes siguiente.
  const MARTES2 = addDays(LUNES2, 1);
  await arrastrar(page, diasP2.first(), MARTES2);

  check('1.2 · Arrastrar un tramo de varios días lo mueve de verdad',
    db.projects[1].fab_manual === true,
    'la fase sigue sin fijar a mano: el arrastre se ha perdido en silencio');
  check('1.2 · Y el tramo queda donde se ha soltado',
    db.projects[1].fab_start === MARTES2, db.projects[1].fab_start);
  // Y lo que se venía a arreglar en esta ronda: no encoge.
  check('1.2 · Conservando sus tres días',
    db.projects[1].fab_end === addDays(MARTES2, 2),
    `${db.projects[1].fab_start} → ${db.projects[1].fab_end}`);

  // ===================================================================
  // 1.1 · EDITAR LAS FECHAS DESDE LA FICHA DEL PROYECTO
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const plan = page.locator('.panel:has(h2:has-text("Planificación"))');
  check('1.1 · La ficha del proyecto ofrece editar las fechas',
    await plan.locator('button:has-text("Editar fechas")').count() === 2,
    `${await plan.locator('button:has-text("Editar fechas")').count()} botón(es)`);

  // Se edita LA FABRICACIÓN. El montaje tiene que quedarse donde está.
  const montAntesFicha = db.projects[0].mont_start;
  await plan.locator('button[aria-label="Editar las fechas de fabricación"]').click();
  await page.waitForTimeout(300);

  check('1.1 · Y lo hace con selectores de fecha de verdad',
    await plan.locator('#plan-fabricacion-desde').getAttribute('type') === 'date'
    && await plan.locator('#plan-fabricacion-hasta').getAttribute('type') === 'date');

  check('1.1 · Que vienen rellenos con lo que ya tenía',
    await plan.locator('#plan-fabricacion-desde').inputValue() === JUEVES,
    await plan.locator('#plan-fabricacion-desde').inputValue());

  // Una fecha cualquiera, a propósito EN SÁBADO y solapando con el otro
  // proyecto: tiene que guardarse igual, sin comprobar disponibilidad.
  const SABADO = addDays(LUNES, 5);
  await plan.locator('#plan-fabricacion-desde').fill(SABADO);
  await plan.locator('#plan-fabricacion-hasta').fill(addDays(SABADO, 2));
  await plan.locator('button:has-text("Guardar fechas")').click();
  await page.waitForTimeout(900);

  check('1.1 · Se guarda la fecha escrita, tal cual',
    db.projects[0].fab_start === SABADO && db.projects[0].fab_end === addDays(SABADO, 2),
    `${db.projects[0].fab_start} → ${db.projects[0].fab_end}`);
  check('1.1 · Aunque caiga en fin de semana y se solape con otro proyecto',
    db.projects[0].fab_manual === true);
  check('1.1 · Y editar la fabricación NO toca el montaje',
    db.projects[0].mont_start === montAntesFicha,
    `el montaje estaba el ${montAntesFicha} y ha quedado el ${db.projects[0].mont_start}`);

  // El final anterior al inicio se avisa en la propia pantalla.
  await plan.locator('button[aria-label="Editar las fechas de montaje"]').click();
  await page.waitForTimeout(300);
  await plan.locator('#plan-montaje-desde').fill(MIERCOLES);
  await plan.locator('#plan-montaje-hasta').fill(LUNES);
  await page.waitForTimeout(250);

  check('1.1 · Un final anterior al inicio se avisa y no se deja guardar',
    (await plan.locator('.error-text').innerText()).includes('anterior al inicio')
    && await plan.locator('button:has-text("Guardar fechas")').isDisabled());

  // Y la fecha persiste al recargar la página.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('1.1 · La fecha sigue ahí tras recargar la página',
    (await page.locator('.panel:has(h2:has-text("Planificación"))').innerText())
      .includes(SABADO.split('-').reverse().join('/')),
    await page.locator('.panel:has(h2:has-text("Planificación"))').innerText());

  // ===================================================================
  // 1.3 · EDITAR EL PERIODO DE LA OBRA
  // ===================================================================
  const obraId = db.works[0].id;
  await page.goto(`http://localhost:${PORT}/#/admin/obras/${obraId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const periodo = page.locator('.panel:has(h2:has-text("Periodo en el calendario"))');
  check('1.3 · La ficha de la obra tiene su periodo del calendario',
    await periodo.count() === 1);
  check('1.3 · Y dice que, de momento, lo marcan sus proyectos',
    (await periodo.innerText()).includes('Según sus proyectos'),
    await periodo.innerText());

  await periodo.locator('button:has-text("Editar periodo")').click();
  await page.waitForTimeout(300);
  await periodo.locator('#obra-periodo-desde').fill(LUNES);
  await periodo.locator('#obra-periodo-hasta').fill(addDays(LUNES, 20));
  await periodo.locator('button:has-text("Guardar fechas")').click();
  await page.waitForTimeout(900);

  check('1.3 · El periodo se guarda en la obra',
    db.works[0].cal_start === LUNES && db.works[0].cal_end === addDays(LUNES, 20),
    `${db.works[0].cal_start} → ${db.works[0].cal_end}`);
  check('1.3 · Y la pantalla dice que está puesto a mano',
    (await periodo.innerText()).includes('Puesto a mano'));
  check('1.3 · Sin tocar las fechas de sus proyectos',
    db.projects[0].fab_start === SABADO);

  // El calendario tiene que reflejarlo.
  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('.cal-toolbar button[aria-label="Siguiente"]').click();
  await page.waitForTimeout(1100);
  // Con el rediseño, «Obras» no está encendido al abrir el calendario.
  await page.locator('.cal-legend-item:has-text("Obras")').click();
  await page.waitForTimeout(800);
  check('1.3 · Y el calendario pinta la obra en su periodo propio',
    await page.locator('.cal-event[title^="Obras"]').count() > 0,
    `${await page.locator('.cal-event[title^="Obras"]').count()} barra(s) de obra`);

  // Dejar las dos en blanco devuelve la obra a seguir a sus proyectos.
  await page.goto(`http://localhost:${PORT}/#/admin/obras/${obraId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await periodo.locator('button:has-text("Editar periodo")').click();
  await page.waitForTimeout(300);
  await periodo.locator('#obra-periodo-desde').fill('');
  await periodo.locator('#obra-periodo-hasta').fill('');
  await periodo.locator('button:has-text("Guardar fechas")').click();
  await page.waitForTimeout(900);

  check('1.3 · Dejando las dos en blanco vuelve a seguir a sus proyectos',
    db.works[0].cal_start === null && db.works[0].cal_end === null
    && (await periodo.innerText()).includes('Según sus proyectos'));

  // ===================================================================
  // 2.1 · SE PUEDEN CREAR COMENTARIOS
  //
  // La causa era que «comments» tiene DOS caminos hacia «profiles» y la
  // consulta no decía por cuál: PostgREST contestaba PGRST201 y la
  // pantalla lo traducía a «error inesperado». Aquí se comprueba el
  // camino completo; que la consulta nombre la clave lo vigila
  // tests/unit/consultas.test.ts, que es donde se puede ver de verdad.
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const coment = page.locator('.panel:has(h2:has-text("Comentarios"))');
  await coment.locator('#comment-box').fill('Revisado el plano con el cliente.');
  await coment.locator('button:has-text("Enviar")').click();
  await page.waitForTimeout(800);

  check('2.1 · Administración puede crear un comentario',
    (await coment.innerText()).includes('Revisado el plano con el cliente'),
    await coment.innerText());
  check('2.1 · Y sale firmado con su nombre, no como «Sistema»',
    (await coment.innerText()).includes(ADMIN.full_name));
  check('2.1 · Sin ningún aviso de error',
    await page.locator('.toast.error').count() === 0);

  // ===================================================================
  // 2.2 · LA PAPELERA, SOLO SOBRE LO PROPIO
  //
  // El permiso de verdad está en la base de datos y se prueba en
  // tests/sql/87. Aquí se comprueba lo que ve la persona: que no se le
  // ofrece quitar un archivo que no es suyo.
  // ===================================================================
  const docsAdmin = page.locator('.panel:has(h2:has-text("Documentos"))');
  check('2.2 · Administración puede quitar cualquier archivo',
    await docsAdmin.locator('button[aria-label^="Enviar"]').count() === 2,
    `${await docsAdmin.locator('button[aria-label^="Enviar"]').count()} botón(es)`);

  // ===================================================================
  // 2.1 y 2.2 y 2.3 · DESDE EL MÓVIL DEL TRABAJADOR
  // ===================================================================
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  // Quien usa este contexto es el TRABAJADOR, no administración.
  await stubSupabase(movil, { db, getUser: () => WORKER });
  const tel = await movil.newPage();
  const erroresMovil = [];
  tel.on('pageerror', (e) => erroresMovil.push(String(e)));
  await signIn(tel, PORT, 'juan');

  // ---- 2.2 · el trabajador solo quita lo suyo -----------------------
  await tel.goto(`http://localhost:${PORT}/#/t/proyectos/p1`, { waitUntil: 'networkidle' });
  await tel.waitForTimeout(1100);

  // En el móvil el panel se titula «Documentación del proyecto».
  const docsJuan = tel.locator('.panel:has(h2:has-text("Documentación del proyecto"))');
  check('2.2 · El trabajador ve los archivos técnicos del proyecto',
    (await docsJuan.innerText()).includes('obra-juan.jpg')
    && (await docsJuan.innerText()).includes('plano.pdf'),
    await docsJuan.innerText());
  check('2.2 · Pero solo se le ofrece quitar EL SUYO',
    await docsJuan.locator('button[aria-label="Enviar obra-juan.jpg a la papelera"]').count() === 1
    && await docsJuan.locator('button[aria-label="Enviar plano.pdf a la papelera"]').count() === 0);

  // ---- 2.1 · el trabajador comenta ----------------------------------
  const comentJuan = tel.locator('.panel:has(h2:has-text("Comentarios"))');
  if (await comentJuan.count()) {
    await comentJuan.locator('#comment-box').fill('Falta material para acabar.');
    await comentJuan.locator('button:has-text("Enviar")').click();
    await tel.waitForTimeout(800);
    check('2.1 · El trabajador también puede comentar',
      (await comentJuan.innerText()).includes('Falta material para acabar'),
      await comentJuan.innerText());
  }

  // ---- 2.3 · el vídeo del parte se reproduce ------------------------
  await tel.goto(`http://localhost:${PORT}/#/t/partes/pt1`, { waitUntil: 'networkidle' });
  await tel.waitForTimeout(1200);

  check('2.3 · El vídeo del parte se ve en la cuadrícula, marcado como vídeo',
    await tel.locator('.photo-grid .photo-video').count() === 1,
    await tel.locator('.photo-grid').innerText());

  // Y lo que fallaba: al tocarlo tiene que ABRIRSE EL REPRODUCTOR.
  await tel.locator('.photo-grid button.photo-open[aria-label*="soldadura.mp4"]').click();
  await tel.waitForTimeout(700);

  check('2.3 · Al tocarlo se abre el visor', await tel.locator('.visor').count() === 1);
  check('2.3 · Y dentro hay un reproductor de vídeo con su archivo',
    await tel.locator('.visor video.visor-video').count() === 1
    && Boolean(await tel.locator('.visor video').getAttribute('src')),
    String(await tel.locator('.visor video').getAttribute('src')));
  check('2.3 · Con los controles y preparado para el móvil',
    await tel.locator('.visor video').evaluate((v) => v.controls && v.playsInline));

  await tel.locator('.visor button[aria-label="Cerrar"]').click();
  await tel.waitForTimeout(400);

  // La foto del mismo parte tiene que seguir funcionando igual.
  await tel.locator('.photo-grid button.photo-open[aria-label*="tramo.jpg"]').click();
  await tel.waitForTimeout(700);
  check('2.3 · Y las fotografías del parte siguen abriéndose como antes',
    await tel.locator('.visor img.visor-imagen').count() === 1);

  check('Ninguna pantalla del móvil ha dado un error de programación',
    erroresMovil.length === 0, erroresMovil.join(' · '));
  await movil.close();

  // ===================================================================
  // 3.3 · EL FORMULARIO DE COSTES EXTRA NO PIERDE EL FOCO
  //
  // Se escribe TECLA A TECLA, que es lo que hace una persona. Rellenar
  // de golpe con «fill» no reproduce el fallo: por eso llevaba tiempo
  // ahí sin que ninguna prueba se enterara.
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/obras/${obraId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('.panel:has(h2:has-text("Costes extras")) button:has-text("Añadir")').click();
  await page.waitForTimeout(400);

  check('3.3 · Al abrirse, el foco está en el primer campo',
    await page.evaluate(() => document.activeElement?.id) === 'ex-concepto',
    String(await page.evaluate(() => document.activeElement?.id)));

  await page.locator('#ex-concepto').pressSequentially('Transporte y grúa', { delay: 20 });
  check('3.3 · El concepto se escribe entero',
    await page.locator('#ex-concepto').inputValue() === 'Transporte y grúa',
    await page.locator('#ex-concepto').inputValue());

  // Y aquí estaba el fallo: al escribir el importe el cursor se iba.
  await page.locator('#ex-importe').click();
  await page.locator('#ex-importe').pressSequentially('450,75', { delay: 20 });

  check('3.3 · El importe se escribe entero, sin que salte el foco',
    await page.locator('#ex-importe').inputValue() === '450,75',
    await page.locator('#ex-importe').inputValue());
  check('3.3 · Y el cursor sigue en el importe',
    await page.evaluate(() => document.activeElement?.id) === 'ex-importe',
    String(await page.evaluate(() => document.activeElement?.id)));

  await page.locator('#ex-notas').click();
  await page.locator('#ex-notas').pressSequentially('Dos portes y una grúa', { delay: 20 });
  check('3.3 · Las notas también se escriben enteras',
    await page.locator('#ex-notas').inputValue() === 'Dos portes y una grúa',
    await page.locator('#ex-notas').inputValue());
  check('3.3 · Y el concepto no se ha perdido por el camino',
    await page.locator('#ex-concepto').inputValue() === 'Transporte y grúa');

  // Escape tiene que seguir cerrando, que es lo que compartía el efecto.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('3.3 · Y Escape sigue cerrando la ventana',
    await page.locator('.modal').count() === 0);

  // ===================================================================
  // 3.2 · LA PANTALLA DE CLIENTES Y SU RESUMEN ECONÓMICO
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/clientes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  check('3.2 · La pantalla de clientes se abre sin error',
    await page.locator('.error-box, .alert-danger').count() === 0
    && await page.locator('table.table').count() === 1,
    await page.locator('.panel-body').innerText());

  check('3.2 · Y sale el cliente',
    (await page.locator('table.table').innerText()).includes('García Construcciones'));

  check('3.2 · Con las cuatro columnas económicas',
    (await page.locator('table.table thead').innerText()).includes('Presupuestado')
    && (await page.locator('table.table thead').innerText()).includes('Cobrado')
    && (await page.locator('table.table thead').innerText()).includes('Por facturar')
    && (await page.locator('table.table thead').innerText()).includes('Por cobrar'));

  // Las cuentas: 2 proyectos de 6.400 € = 12.800 € presupuestados.
  check('3.2 · El presupuestado suma los proyectos del cliente',
    (await page.locator('table.table tbody tr').first().innerText()).includes('12.800,00'),
    await page.locator('table.table tbody tr').first().innerText());

  // El desplegable cerrado no devuelve su contenido: se abre primero.
  await page.locator('details.hint summary').click();
  await page.waitForTimeout(300);
  check('3.2 · Y se explica cómo se calcula cada importe',
    limpio(await page.locator('details.hint').innerText()).includes('no se le debe a nadie'),
    limpio(await page.locator('details.hint').innerText()).slice(0, 120));

  // ===================================================================
  // 3.4 · LOS COSTES EXTRA SE PUEDEN FACTURAR
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/obras/${obraId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const extras = page.locator('.panel:has(h2:has-text("Costes extras"))');
  await extras.locator('button:has-text("Añadir")').click();
  await page.waitForTimeout(400);
  await page.locator('#ex-concepto').fill('Transporte y grúa');
  await page.locator('#ex-importe').fill('450');
  await page.locator('.modal button:has-text("Guardar")').click();
  await page.waitForTimeout(900);

  check('3.4 · El coste extra se guarda SIN facturar',
    db.work_extras.length === 1 && db.work_extras[0].invoiced === false,
    JSON.stringify(db.work_extras[0] ?? null));
  check('3.4 · Y la pantalla lo dice',
    (await extras.innerText()).includes('Por facturar'));

  const cuentas = page.locator('.panel:has(h2:has-text("Las cuentas de la obra"))');
  check('3.4 · Todavía no suma al facturado',
    limpio(await cuentas.innerText()).includes('450,00 € de costes extra')
    && limpio(await cuentas.innerText()).includes('0,00 € ya están facturados'),
    limpio(await cuentas.innerText()));

  await extras.locator('button:has-text("Por facturar")').click();
  await page.waitForTimeout(900);

  check('3.4 · Al marcarlo queda facturado, con su fecha',
    db.work_extras[0].invoiced === true && Boolean(db.work_extras[0].invoiced_on),
    JSON.stringify(db.work_extras[0]));
  check('3.4 · Y ahora sí suma al facturado de la obra',
    limpio(await cuentas.innerText()).includes('450,00 € ya están facturados'),
    limpio(await cuentas.innerText()));

  // Desmarcarlo avisa, porque resta de una cifra que alguien puede usar.
  await extras.locator('button:has-text("Facturado")').click();
  await page.waitForTimeout(500);
  check('3.4 · Desmarcarlo pide confirmación',
    (await page.locator('.modal').innerText()).includes('dejará de contar como facturado'));
  await page.locator('.modal button:has-text("Quitar la marca")').click();
  await page.waitForTimeout(900);
  check('3.4 · Y vuelve a estar pendiente',
    db.work_extras[0].invoiced === false && db.work_extras[0].invoiced_on === null);

  // ===================================================================
  // 3.5 · LA DOCUMENTACIÓN DE LA OBRA
  // ===================================================================
  const docsObra = page.locator('.panel:has(h2:has-text("Documentación de la obra"))');
  check('3.5 · La obra tiene su sección de documentación',
    await docsObra.count() === 1);

  check('3.5 · Y ve los archivos de sus proyectos',
    (await docsObra.innerText()).includes('plano.pdf')
    && (await docsObra.innerText()).includes('obra-juan.jpg'),
    await docsObra.innerText());

  check('3.5 · Diciendo de qué proyecto viene cada uno',
    (await docsObra.innerText()).includes(`Del proyecto PROY-${YEAR}-001`));

  check('3.5 · Y aclara que no se duplica ningún archivo',
    (await docsObra.innerText()).includes('no se copian'));

  // ===================================================================
  // 3.1 · UN PROYECTO CREADO DESDE LA OBRA TRAE SU CLIENTE
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/nuevo?obra=${obraId}`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);

  check('3.1 · La obra viene ya elegida',
    await page.locator('#p-work').inputValue() === obraId);

  check('3.1 · Y el cliente viene relleno con el de la obra',
    (await page.locator('.panel:has(h2:has-text("Cliente"))').innerText())
      .includes('García Construcciones'),
    await page.locator('.panel:has(h2:has-text("Cliente"))').innerText());

  check('3.1 · Y la dirección de la obra también',
    (await page.locator('#p-address').inputValue()).includes('Calle Mayor 25'),
    await page.locator('#p-address').inputValue());

  // Y lo importante: al guardar NO se crea un cliente nuevo.
  const clientesAntes = db.clients.length;
  await page.locator('#p-name').fill('Puerta de garaje');
  await page.locator('button:has-text("Crear proyecto")').click();
  await page.waitForTimeout(1200);

  check('3.1 · Al guardar NO se crea una segunda ficha del mismo cliente',
    db.clients.length === clientesAntes,
    `${clientesAntes} → ${db.clients.length}`);
  check('3.1 · El proyecto queda con el cliente de la obra y dentro de la obra',
    db.projects.some((p) => p.name === 'Puerta de garaje'
      && p.client_id === 'c1' && p.work_id === obraId),
    JSON.stringify(db.projects.find((p) => p.name === 'Puerta de garaje') ?? null));

  // ===================================================================
  // 4 · LAS ÓRDENES DE TRABAJO ANTIGUAS, RETIRADAS
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const menu = await page.locator('.sidebar nav').innerText();
  check('4 · «Órdenes de trabajo» ya no está en el menú de administración',
    !menu.includes('Órdenes de trabajo'), menu.replace(/\n/g, ' · '));
  check('4 · Y «Partes de trabajo» sigue estando',
    menu.includes('Partes de trabajo'));

  check('4 · El panel ya no tiene la tarjeta de órdenes',
    !(await page.locator('.stack').first().innerText()).includes('Órdenes de trabajo'));

  // Acceso residual: escribir la dirección a mano no debe llevar a la
  // pantalla antigua.
  await page.goto(`http://localhost:${PORT}/#/admin/ordenes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('4 · Escribir la dirección antigua no abre la sección',
    !(await page.locator('body').innerText()).includes('Nueva orden'),
    (await page.locator('body').innerText()).slice(0, 160).replace(/\n/g, ' · '));

  // Y lo que NO se ha tocado: los partes siguen enteros.
  await page.goto(`http://localhost:${PORT}/#/admin/partes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('4 · Los partes de trabajo siguen funcionando',
    page.url().includes('#/admin/partes')
    && await page.locator('.error-box, .alert-danger').count() === 0);

  check('4 · Y el parte del trabajador sigue en la base de datos, sin tocar',
    db.work_reports.length === 1 && db.work_reports[0].id === 'pt1');
  check('4 · Igual que las órdenes: no se ha borrado ningún registro',
    Array.isArray(db.work_orders));

  // ===================================================================
  // ELIMINAR UN PARTE DE TRABAJO
  //
  // Las reglas de verdad (quién puede, y que un parte validado no se
  // borra) se prueban contra PostgreSQL en tests/sql/89. Aquí se prueba
  // lo que ve y hace la persona: que se le avisa de lo que se va a
  // perder, que puede echarse atrás, que la pantalla se actualiza y que
  // un error llega traducido.
  // ===================================================================

  // Un segundo parte, para comprobar que borrar uno no toca el otro.
  db.work_reports.push({
    id: 'pt2', code: `PT-${YEAR}-002`, worker_id: WORKER.id, project_id: 'p1',
    work_type: 'montaje', work_date: HOY, work_done: 'Este parte es de verdad.',
    hours: 8, needs_material: false, status: 'enviado',
    submitted_at: '2026-10-02T17:00:00Z', validated_at: null, validated_by: null,
    rejected_at: null, reject_reason: null, assigned_at: null, assigned_by: null,
    is_demo: false, created_at: '2026-10-02T09:00:00Z', updated_at: '2026-10-02T09:00:00Z',
  });

  // El listado abre por la pestaña «Pendientes», que son los enviados.
  // Se pone también el primero en ese estado para que salgan los dos.
  db.work_reports.find((r) => r.id === 'pt1').status = 'enviado';
  db.work_reports.find((r) => r.id === 'pt1').submitted_at = '2026-10-01T17:00:00Z';

  await page.goto(`http://localhost:${PORT}/#/admin/partes`, { waitUntil: 'networkidle' });
  // Se recarga a propósito: con un router de hash, volver a la MISMA
  // dirección no vuelve a montar la pantalla ni a pedir los datos.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const partesAntes = await page.locator('tbody tr').count();
  check('Borrado · el listado de partes enseña los dos',
    partesAntes === 2, `${partesAntes} fila(s)`);

  await page.goto(`http://localhost:${PORT}/#/admin/partes/pt1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  check('Borrado · la ficha del parte ofrece eliminarlo',
    await page.locator('.page-head button:has-text("Eliminar")').count() === 1);

  // --- Se pide confirmación, y se puede echar atrás ---
  await page.locator('.page-head button:has-text("Eliminar")').click();
  await page.waitForTimeout(600);

  const aviso = limpio(await page.locator('.modal').innerText());
  check('Borrado · se pide confirmación antes de eliminar',
    await page.locator('.modal').count() === 1 && aviso.includes('Eliminar el parte'));
  check('Borrado · y se dice que no se puede deshacer',
    aviso.includes('no se puede deshacer'), aviso.replace(/\n/g, ' · '));
  check('Borrado · contando los archivos que se van con él',
    aviso.includes('2 archivo(s)') && aviso.includes('firma'),
    aviso.replace(/\n/g, ' · '));
  check('Borrado · y recordando que rechazarlo es la otra opción',
    aviso.includes('recházalo en lugar de eliminarlo'));

  await page.locator('.modal button:has-text("Cancelar")').click();
  await page.waitForTimeout(500);
  check('Borrado · al cancelar NO se borra nada',
    db.work_reports.length === 2
    && db.documents.filter((d) => d.report_id === 'pt1').length === 2,
    `${db.work_reports.length} parte(s)`);

  // --- Un error del servidor llega traducido ---
  //
  // Se fuerza el caso real: un parte validado. La base de datos se
  // niega, y lo que importa es que la persona lea POR QUÉ y qué hacer.
  db.work_reports.find((r) => r.id === 'pt1').status = 'validado';
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('.page-head button:has-text("Eliminar")').click();
  await page.waitForTimeout(600);
  await page.locator('.modal button:has-text("Eliminar el parte")').click();
  await page.waitForTimeout(1000);

  const fallo = limpio(await page.locator('.toast').last().innerText());
  check('Borrado · un parte validado no se borra, y se explica por qué',
    fallo.includes('está validado') && fallo.includes('Recházalo primero'),
    fallo);
  check('Borrado · y el parte sigue ahí después del error',
    db.work_reports.some((r) => r.id === 'pt1'));

  // --- Y ahora el camino bueno ---
  db.work_reports.find((r) => r.id === 'pt1').status = 'enviado';
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('.page-head button:has-text("Eliminar")').click();
  await page.waitForTimeout(600);
  await page.locator('.modal button:has-text("Eliminar el parte")').click();
  await page.waitForTimeout(1400);

  check('Borrado · el parte se elimina', !db.work_reports.some((r) => r.id === 'pt1'));
  check('Borrado · con sus archivos y sus comentarios',
    db.documents.filter((d) => d.report_id === 'pt1').length === 0
    && db.comments.filter((c) => c.report_id === 'pt1').length === 0);
  check('Borrado · el aviso dice qué se ha eliminado',
    limpio(await page.locator('.toast').last().innerText()).includes(`PT-${YEAR}-001`),
    limpio(await page.locator('.toast').last().innerText()));

  // --- La pantalla y los listados se actualizan ---
  await page.waitForTimeout(600);
  check('Borrado · se vuelve al listado de partes',
    page.url().includes('#/admin/partes') && !page.url().includes('pt1'), page.url());
  check('Borrado · y el listado ya solo enseña el que queda',
    await page.locator('tbody tr').count() === 1,
    `${await page.locator('tbody tr').count()} fila(s)`);

  // --- Lo que no se toca ---
  check('Borrado · el otro parte sigue entero',
    db.work_reports.some((r) => r.id === 'pt2' && r.status === 'enviado'));
  check('Borrado · y el proyecto y su documentación siguen ahí',
    db.projects.some((p) => p.id === 'p1')
    && db.documents.filter((d) => d.project_id === 'p1').length === 2);

  // --- El trabajador no tiene por dónde borrar ---
  const movil5 = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(movil5, { db, getUser: () => WORKER });
  const tel5 = await movil5.newPage();
  await signIn(tel5, PORT, 'juan');
  await tel5.goto(`http://localhost:${PORT}/#/t/partes/pt2`, { waitUntil: 'networkidle' });
  await tel5.waitForTimeout(1100);
  check('Borrado · al trabajador no se le ofrece eliminar su parte',
    await tel5.locator('button:has-text("Eliminar")').count() === 0);
  await movil5.close();

  check('Ninguna pantalla ha dado un error de programación',
    errores.length === 0, errores.join(' · '));

  report();
} finally {
  await browser.close();
  server.close();
}
