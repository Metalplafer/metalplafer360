/**
 * METALPLAFER360 · GESTIONES INTERNAS
 *
 * El tablero que sustituye al Trello interno, probado pulsando lo que
 * pulsa una persona:
 *
 *   · que administración entra y un trabajador NO, ni por el menú ni
 *     escribiendo la dirección;
 *   · que se crean y se renombran listas, y que una lista con tarjetas
 *     dentro NO se puede borrar;
 *   · que se crean tarjetas, se editan, se mueven de lista y se marcan
 *     y desmarcan como realizadas;
 *   · que el checklist se añade, se completa, se descompleta y se quita,
 *     y que el progreso se ve desde el tablero sin abrir la tarjeta;
 *   · que archivar NO borra: la tarjeta aparece en su repositorio con su
 *     lista, su estado y su checklist, y vuelve al tablero;
 *   · y que el evento va al calendario DE VERDAD, el que mira todo el
 *     mundo, y que editarlo NO crea un segundo.
 *
 * Lo que se mira en la base de datos de mentira es lo que habría quedado
 * guardado, no lo que pinta la pantalla.
 */
import {
  ADMIN, WORKER, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, stubSupabase,
} from './fake-supabase.mjs';

const PORT = 4208;
const HOY = new Date().toISOString().slice(0, 10);

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();
const limpio = (s) => s.replace(/ /g, ' ');
const col = (p, nombre) => p.locator('.kanban-col', {
  has: p.locator(`.kanban-nombre:text-is("${nombre}")`),
});

const db = createDb({
  internal_lists: [
    { id: 'l1', name: 'RRHH', position: 10, created_by: ADMIN.id,
      created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T09:00:00Z' },
    { id: 'l2', name: 'MULTAS', position: 20, created_by: ADMIN.id,
      created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T09:00:00Z' },
  ],
  internal_tasks: [
    { id: 't1', list_id: 'l1', title: 'PEDIR ROPA', notes: null,
      done: false, done_at: null, position: 10, archived_at: null,
      calendar_note_id: null, created_by: ADMIN.id,
      created_at: '2026-10-02T09:00:00Z', updated_at: '2026-10-02T09:00:00Z' },
    { id: 't2', list_id: 'l1', title: 'PAGO ASEPEYO', notes: null,
      done: false, done_at: null, position: 20, archived_at: null,
      calendar_note_id: null, created_by: ADMIN.id,
      created_at: '2026-10-02T09:00:00Z', updated_at: '2026-10-02T09:00:00Z' },
  ],
  internal_task_items: [],
});

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

  // ==================== EL ACCESO ====================
  check('«Gestiones internas» está en el menú de administración',
    (await page.locator('a[href="#/admin/internas"]').count()) >= 1);

  // Donde se pidió: debajo de Informes y antes de Configuración.
  const menu = (await page.locator('.sidebar a, nav a').allInnerTexts()).map((s) => s.trim());
  const iInformes = menu.findIndex((x) => x === 'Informes');
  const iInternas = menu.findIndex((x) => x === 'Gestiones internas');
  const iConfig = menu.findIndex((x) => x === 'Configuración');
  check('Y va justo entre «Informes» y «Configuración»',
    iInformes >= 0 && iInternas === iInformes + 1 && iConfig === iInternas + 1,
    menu.filter(Boolean).join(' · '));

  await page.goto(`http://localhost:${PORT}/#/admin/internas`, { waitUntil: 'networkidle' });
  await page.locator('.kanban').waitFor({ timeout: 15000 });

  check('El tablero enseña las listas una al lado de otra',
    (await page.locator('.kanban-col:not(.kanban-nueva-lista)').count()) === 2);

  check('Con sus nombres',
    (await page.locator('.kanban-nombre').allInnerTexts()).join(' · ') === 'RRHH · MULTAS');

  check('Y las tarjetas dentro de su lista',
    (await col(page, 'RRHH').locator('.kanban-card').count()) === 2
    && (await col(page, 'MULTAS').locator('.kanban-card').count()) === 0);

  // ==================== LAS LISTAS ====================
  await page.locator('.kanban-nueva-lista').click();
  await page.locator('.kanban-nueva-lista .input').fill('COMPRAS');
  await page.locator('.kanban-nueva-lista .btn-primary').click();
  await page.waitForTimeout(900);

  check('Se puede crear una lista nueva, con el nombre que se quiera',
    db.internal_lists.some((l) => l.name === 'COMPRAS'),
    db.internal_lists.map((l) => l.name).join(' · '));

  /*
    Renombrar: se escribe en el sitio, como en Trello.

    OJO con el localizador: al pulsar el nombre, el botón SE SUSTITUYE
    por un campo de texto, así que la columna ya no se puede encontrar
    por su nombre. La primera versión de esta prueba lo hacía y se
    quedaba esperando treinta segundos a un elemento que acababa de
    desaparecer. Se coge por su posición, que no cambia.
  */
  const laDeMultas = page.locator('.kanban-col:not(.kanban-nueva-lista)').nth(1);
  await laDeMultas.locator('.kanban-nombre').click();
  await laDeMultas.locator('.input').fill('MULTAS Y TASAS');
  await laDeMultas.locator('.input').press('Enter');
  await page.waitForTimeout(900);

  check('Y renombrar una existente',
    db.internal_lists.find((l) => l.id === 'l2').name === 'MULTAS Y TASAS',
    db.internal_lists.find((l) => l.id === 'l2').name);

  // ==================== LAS TARJETAS ====================
  await col(page, 'MULTAS Y TASAS').locator('.kanban-add').click();
  await col(page, 'MULTAS Y TASAS').locator('.textarea').fill('MULTA SBD-BCN');
  await col(page, 'MULTAS Y TASAS').locator('.btn-primary').click();
  await page.waitForTimeout(900);

  const nueva = db.internal_tasks.find((t) => t.title === 'MULTA SBD-BCN');
  check('Se crea una tarjeta en su lista', Boolean(nueva) && nueva.list_id === 'l2',
    db.internal_tasks.map((t) => `${t.title}@${t.list_id}`).join(' · '));

  // Marcar como realizada: la tarjeta SE QUEDA donde está.
  /*
    «click» y no «check»: el cuadro lo manda React y solo cambia cuando
    el servidor ha respondido. «check» exige que cambie en el acto y
    falla con «Clicking the checkbox did not change its state» aunque
    todo funcione.
  */
  await col(page, 'RRHH').locator('.kanban-card', { hasText: 'PEDIR ROPA' })
    .locator('input[type="checkbox"]').click();
  await page.waitForTimeout(900);

  check('Marcar como realizada se guarda',
    db.internal_tasks.find((t) => t.id === 't1').done === true);

  check('Y la tarjeta NO se va del tablero: sigue en su lista',
    db.internal_tasks.find((t) => t.id === 't1').archived_at === null
    && (await col(page, 'RRHH').locator('.kanban-card').count()) === 2);

  check('Se ve que está hecha',
    (await col(page, 'RRHH').locator('.kanban-card.hecha').count()) === 1);

  await col(page, 'RRHH').locator('.kanban-card.hecha input[type="checkbox"]').click();
  await page.waitForTimeout(900);
  check('Y se puede desmarcar',
    db.internal_tasks.find((t) => t.id === 't1').done === false);

  // ==================== LA TARJETA ABIERTA ====================
  await col(page, 'RRHH').locator('.kanban-title:text-is("PEDIR ROPA")').click();
  await page.locator('.modal').waitFor({ timeout: 10000 });

  await page.locator('#it-notes').fill('Tallas: 2 M y 1 L');
  await page.locator('#it-title').click();
  await page.waitForTimeout(900);
  check('Las notas de la tarjeta se guardan',
    db.internal_tasks.find((t) => t.id === 't1').notes === 'Tallas: 2 M y 1 L',
    db.internal_tasks.find((t) => t.id === 't1').notes ?? '(vacías)');

  // ---- EL CHECKLIST ----
  for (const texto of ['Pedir tallas', 'Confirmar pedido']) {
    await page.locator('.check-nuevo .input').fill(texto);
    await page.locator('.check-nuevo .btn').click();
    await page.waitForTimeout(700);
  }
  check('Se añaden elementos al checklist',
    db.internal_task_items.filter((i) => i.task_id === 't1').length === 2);

  await page.locator('.check-list li').first().locator('input[type="checkbox"]').click();
  await page.waitForTimeout(800);
  check('Se marca uno como completado',
    db.internal_task_items.filter((i) => i.task_id === 't1' && i.done).length === 1);

  check('Y el progreso se ve en la propia tarjeta',
    limpio(await page.locator('.panel:has(h2:text-is("Checklist")) .badge').innerText())
      .includes('1 de 2'));

  await page.locator('.check-list li').first().locator('input[type="checkbox"]').click();
  await page.waitForTimeout(800);
  check('Y se puede descompletar',
    db.internal_task_items.filter((i) => i.task_id === 't1' && i.done).length === 0);

  // ---- MOVER DE LISTA, desde la tarjeta ----
  /*
    Este desplegable NO es un premio de consolación por no haber hecho
    el arrastre: el arrastre nativo del navegador no funciona con el
    dedo, así que en el móvil este es el único camino. Por eso se
    prueba este y no el arrastre.
  */
  await page.locator('#it-list').selectOption('l2');
  await page.waitForTimeout(1000);
  check('Una tarjeta se mueve de lista desde la propia tarjeta',
    db.internal_tasks.find((t) => t.id === 't1').list_id === 'l2',
    db.internal_tasks.find((t) => t.id === 't1').list_id);

  // ---- EL CALENDARIO ----
  const notasAntes = db.calendar_notes.length;
  await page.locator('button:has-text("Añadir al calendario")').first().click();
  await page.locator('#it-dia').fill(HOY);
  await page.locator('button:has-text("Añadir al calendario")').last().click();
  await page.waitForTimeout(1100);

  const conEvento = db.internal_tasks.find((t) => t.id === 't1');
  check('Se le pone fecha en el calendario a una tarjeta',
    Boolean(conEvento.calendar_note_id),
    conEvento.calendar_note_id ?? '(sin evento)');

  check('Y lo que se crea es un evento normal de «Otros», no un invento aparte',
    db.calendar_notes.length === notasAntes + 1
    && db.calendar_notes.some((n) => n.id === conEvento.calendar_note_id && n.day === HOY),
    `${db.calendar_notes.length} notas, antes ${notasAntes}`);

  // LO QUE IMPORTA: editar NO duplica.
  await page.locator('#it-detalle').fill('En el almacén');
  await page.locator('button:has-text("Actualizar el evento")').click();
  await page.waitForTimeout(1100);

  check('Editar el evento NO crea un segundo',
    db.calendar_notes.length === notasAntes + 1,
    `${db.calendar_notes.length} notas, antes ${notasAntes}`);

  check('Y el que hay se ha actualizado',
    db.calendar_notes.find((n) => n.id === conEvento.calendar_note_id).detail === 'En el almacén');

  // ---- ARCHIVAR ----
  await page.locator('button:has-text("Archivar la tarjeta")').click();
  await page.locator('.modal-foot button:has-text("Archivar")').click();
  await page.waitForTimeout(1200);

  check('Archivar saca la tarjeta del tablero',
    Boolean(db.internal_tasks.find((t) => t.id === 't1').archived_at));

  check('Pero NO borra nada: sigue entera, con su checklist',
    db.internal_tasks.some((t) => t.id === 't1')
    && db.internal_task_items.filter((i) => i.task_id === 't1').length === 2);

  check('Y su evento del calendario tampoco se borra',
    db.calendar_notes.some((n) => n.id === conEvento.calendar_note_id));

  /*
    Y DESAPARECE DEL TABLERO. Esta comprobación faltaba, y lo demostró
    una mutación: quitando el filtro de archivadas del tablero, TODAS
    las pruebas seguían pasando mientras la tarjeta archivada seguía
    colgada en su lista. Mirar la base de datos no bastaba: hay que
    mirar lo que queda en la pantalla.
  */
  await page.locator('.kanban').waitFor({ timeout: 10000 });
  await page.waitForTimeout(700);
  check('Y desaparece del tablero activo',
    !(await page.locator('.kanban').innerText()).includes('PEDIR ROPA'),
    limpio(await page.locator('.kanban').innerText()).replace(/\n+/g, ' | ').slice(0, 140));

  // ==================== EL REPOSITORIO DE ARCHIVADAS ====================
  await page.locator('.tabs button:has-text("Tareas archivadas")').click();
  await page.locator('.table').waitFor({ timeout: 10000 });
  await page.waitForTimeout(700);

  const fila = limpio(await page.locator('.table tbody tr').first().innerText());
  check('La tarjeta archivada sale en su repositorio',
    fila.includes('PEDIR ROPA'), fila.replace(/\n+/g, ' | '));

  check('Diciendo de qué lista venía, si estaba hecha y cuánto checklist llevaba',
    fila.includes('MULTAS Y TASAS') && fila.includes('Pendiente') && fila.includes('0/2'),
    fila.replace(/\n+/g, ' | '));

  // Se devuelve a OTRA lista, que es lo que hace falta si la suya ya no sirve.
  await page.locator('.table tbody tr').first().locator('select').selectOption('l1');
  await page.locator('.table tbody tr').first().locator('button:has-text("Devolver")').click();
  await page.waitForTimeout(1200);

  check('Se recupera y vuelve al tablero, a la lista que se elija',
    db.internal_tasks.find((t) => t.id === 't1').archived_at === null
    && db.internal_tasks.find((t) => t.id === 't1').list_id === 'l1');

  check('Y vuelve con su checklist intacto',
    db.internal_task_items.filter((i) => i.task_id === 't1').length === 2);

  // ==================== BORRAR LISTAS, CON CUIDADO ====================
  await page.locator('.tabs button:has-text("Tablero")').click();
  await page.locator('.kanban').waitFor({ timeout: 10000 });
  await page.waitForTimeout(700);

  await col(page, 'RRHH').locator('.kanban-head .btn-ghost').click();
  await page.locator('.modal').waitFor({ timeout: 10000 });
  await page.locator('.modal-foot button:has-text("Borrar")').click();
  await page.waitForTimeout(1000);

  check('Una lista CON tarjetas no se borra',
    db.internal_lists.some((l) => l.id === 'l1'),
    db.internal_lists.map((l) => l.name).join(' · '));

  // Y SE LE DICE POR QUÉ. Un rechazo silencioso deja a quien lo intenta
  // pensando que la aplicación no va. Esta comprobación faltaba: la
  // añadió el 400 que apareció en la consola al escribir la prueba.
  const aviso = limpio(await page.locator('.toasts').innerText());
  check('Y se le explica por qué, con el camino para conseguirlo',
    aviso.toLowerCase().includes('muévelas'), aviso.replace(/\n+/g, ' | ') || '(sin aviso)');

  check('Y ninguna tarjeta se ha perdido por el intento',
    db.internal_tasks.filter((t) => t.list_id === 'l1').length >= 1);

  // Una vacía sí.
  await col(page, 'COMPRAS').locator('.kanban-head .btn-ghost').click();
  await page.locator('.modal').waitFor({ timeout: 10000 });
  await page.locator('.modal-foot button:has-text("Borrar")').click();
  await page.waitForTimeout(1000);

  check('Una lista vacía sí se borra',
    !db.internal_lists.some((l) => l.name === 'COMPRAS'),
    db.internal_lists.map((l) => l.name).join(' · '));

  // ==================== LOS DATOS AGUANTAN UNA RECARGA ====================
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.kanban').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);

  check('Al recargar, el tablero sigue como estaba',
    (await page.locator('.kanban-nombre').allInnerTexts()).join(' · ') === 'RRHH · MULTAS Y TASAS',
    (await page.locator('.kanban-nombre').allInnerTexts()).join(' · '));

  check('Y la tarjeta recuperada sigue en su sitio, con su checklist a la vista',
    (await col(page, 'RRHH').innerText()).includes('PEDIR ROPA')
    && (await col(page, 'RRHH').innerText()).includes('0/2'),
    limpio(await col(page, 'RRHH').innerText()).replace(/\n+/g, ' | '));

  check('Ni un error de programación en administración',
    errores.length === 0, errores.join(' | '));
  /*
    LA CONSOLA, CON UNA EXCEPCIÓN QUE HAY QUE NOMBRAR.

    Esta prueba borra a propósito una lista que tiene tarjetas, y el
    servidor la rechaza con un 400. El navegador apunta TODA respuesta
    400 en la consola, la pida quien la pida, así que ese apunte es
    inevitable y no es un fallo: es el rechazo funcionando, y arriba se
    comprueba que además se le explica a quien lo intentó.

    Lo que sí sería un fallo es cualquier OTRO error, así que se
    descuentan solo los de recursos y se exige que no quede ninguno.
  */
  const inesperados = consola.filter((c) => !/Failed to load resource/i.test(c));
  check('Ni un error en la consola, fuera del rechazo que esta prueba provoca',
    inesperados.length === 0, inesperados.join(' | ') || consola.join(' | '));

  check('Y el único rechazo del servidor es el de la lista con tarjetas',
    consola.filter((c) => /Failed to load resource/i.test(c)).length === 1,
    consola.join(' | '));

  // ==================== Y UN TRABAJADOR, NADA ====================
  const movil = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await stubSupabase(movil, { db, getUser: () => WORKER });
  const suya = await movil.newPage();
  const erroresW = [];
  suya.on('pageerror', (e) => erroresW.push(e.message));

  await signIn(suya, PORT, WORKER.username);

  check('Un trabajador no ve «Gestiones internas» en su menú',
    (await suya.locator('a[href="#/admin/internas"]').count()) === 0);

  // Y escribiendo la dirección a mano tampoco entra.
  await suya.goto(`http://localhost:${PORT}/#/admin/internas`, { waitUntil: 'networkidle' });
  await suya.waitForTimeout(1200);

  check('Y escribiendo la dirección es devuelto a su zona',
    !suya.url().includes('/admin'), suya.url());

  check('Sin que la aplicación se rompa por el camino',
    erroresW.length === 0, erroresW.join(' | '));

  await movil.close();

  report('GESTIONES INTERNAS · EL TABLERO');
} finally {
  await browser.close();
  server.close();
}
