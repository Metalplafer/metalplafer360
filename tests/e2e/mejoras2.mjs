/**
 * METALPLAFER360 · BLOQUE DE MEJORAS · EN NAVEGADOR REAL
 *
 *   npm run test:mejoras2
 *
 * Comprueba, pulsando lo que pulsa una persona:
 *
 *   · M1 · que el cliente de un presupuesto se puede CORREGIR desde la
 *     edición, eligiendo uno que ya existe; que se guarda el
 *     identificador del elegido; que el formulario no ofrece dar de alta
 *     uno nuevo; que se puede dejar el de antes; y que el proyecto que
 *     salió de ese presupuesto NO cambia de cliente por su cuenta;
 *   · M2 · que se puede anotar material de TALLER, sin proyecto, y que
 *     «sin proyecto» hay que elegirlo a mano: el desplegable no trae
 *     ninguna opción puesta;
 *   · M3 · que el montaje ofrece los cinco subestados en el orden
 *     acordado, que los dos nuevos se guardan de verdad y que se puede
 *     filtrar la lista de proyectos por ellos;
 *   · M4 · que un anticipo PREVISTO se ve como «sin cobrar» y no suma;
 *          que al apuntarlo sube el total cobrado UNA vez;
 *          que entonces el botón desaparece, para no repetirlo;
 *          que el cobro queda marcado como anticipo en la lista;
 *          y que al anularlo vuelve a quedar sin cobrar, sin borrar nada.
 *
 * Las reglas de verdad se prueban contra PostgreSQL en
 * tests/sql/98_tests_montaje_anticipo.sql. Aquí se comprueba la PANTALLA.
 */
import {
  ADMIN, WORKER, YEAR, buildApp, createChecker, createDb,
  launchBrowser, serveApp, signIn, stubSupabase,
} from './fake-supabase.mjs';

const PORT = 4199;

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();
const limpio = (s) => s.replace(/\u00a0/g, ' ');

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: null, address: 'Carrer de la Indústria, 12', city: 'Sabadell',
      postal_code: '08202', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
    // EL CLIENTE BUENO, con un nombre que se parece al otro: es el error
    // que M1 viene a poder corregir.
    { id: 'c2', kind: 'empresa', name: 'Garcia Reformes i Obres SL', tax_id: 'B69999999',
      phone: '600333444', email: null, address: 'Carrer Major, 3', city: 'Terrassa',
      postal_code: '08221', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-02T09:00:00Z', updated_at: '2026-03-02T09:00:00Z' },
  ],
  client_contacts: [
    { id: 'k1', client_id: 'c1', name: 'Jordi del cliente equivocado', phone: '600000001',
      email: null, role: 'Jefe de obra', archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z' },
  ],
  fichas: [
    // Un presupuesto abierto al cliente EQUIVOCADO, con su contacto.
    { id: 'f1', code: `PRES-${YEAR}-001`, type: 'presupuesto', client_id: 'c1', contact_id: 'k1',
      title: 'Barandilla del rellano', description: 'Dos tramos.', address: 'Rambla, 45',
      phone: null, email: null, status: 'enviado', assigned_to: null,
      scheduled_date: null, scheduled_time: null, amount: 3400, hours: null,
      archived_at: null, is_demo: false,
      created_at: '2026-05-01T09:00:00Z', updated_at: '2026-05-01T09:00:00Z' },
  ],
  material_requests: [
    // Una petición del taller que NO es de ningún trabajo: hasta ahora
    // había que colgarla de un proyecto cualquiera para poder aceptarla.
    { id: 'r1', worker_id: WORKER.id, order_id: null, project_id: null,
      body: 'Se han acabado los discos de corte de 125', status: 'pendiente',
      reviewed_at: null, reviewed_by: null, review_note: null, material_id: null,
      is_demo: false, created_at: '2026-05-10T08:00:00Z' },
  ],
  projects: [
    // EN MONTAJE y con un anticipo acordado de 1.500 €: es el caso de
    // las dos mejoras a la vez.
    { id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1', contact_id: null,
      source_ficha_id: null, name: 'Barandilla de la escalera',
      description: 'Tres tramos de barandilla.', measures: '3 tramos · 3,20 m',
      finish: 'Negro forja', location: 'Escalera', address: 'Rambla, 45', observations: null,
      budget_amount: 5000, advance_amount: 1500,
      budget_hours_fab: 20, budget_hours_mont: 10,
      phase: 'montaje', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: false,
      fab_start: null, fab_end: null, mont_start: null, mont_end: null,
      fab_workers: 1, mont_workers: 1, fab_manual: false, mont_manual: false, autoplan: true,
      work_id: null, invoiced_amount: null, invoiced_on: null,
      created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z' },
    // UN SEGUNDO PROYECTO en montaje y SIN los subestados nuevos: es lo
    // que hace que filtrar signifique algo. Con uno solo, filtrar y no
    // filtrar darían lo mismo y la prueba pasaría sin comprobar nada.
    { id: 'p2', code: `PROY-${YEAR}-002`, client_id: 'c1', contact_id: null,
      source_ficha_id: null, name: 'Reja del patio',
      description: 'Una reja.', measures: '1 ud', finish: 'Galvanizado',
      location: 'Patio', address: 'Rambla, 45', observations: null,
      budget_amount: 900, advance_amount: null,
      budget_hours_fab: 6, budget_hours_mont: 2,
      phase: 'montaje', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: false,
      fab_start: null, fab_end: null, mont_start: null, mont_end: null,
      fab_workers: 1, mont_workers: 1, fab_manual: false, mont_manual: false, autoplan: true,
      work_id: null, invoiced_amount: null, invoiced_on: null,
      created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z' },
  ],
  project_substatuses: [
    { project_id: 'p1', phase: 'montaje', substatus: 'en_montaje', is_demo: false,
      created_at: '2026-05-02T09:00:00Z' },
  ],
  counters: { PRES: 1, VIS: 0, AVI: 0, PROY: 2, OT: 0, PT: 0, OBRA: 0 },
});

const browser = await launchBrowser();
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 980 } });
  await stubSupabase(context, { db });
  const page = await context.newPage();

  const errores = [];
  page.on('pageerror', (e) => errores.push(`error de programación: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

  await signIn(page, PORT, ADMIN.username);

  // ============ M3 · LOS SUBESTADOS DE MONTAJE ============
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.locator('.substatus-grid').waitFor({ state: 'visible', timeout: 15000 });

  const chips = await page.locator('.substatus-grid .chip').allInnerTexts();
  check('El montaje ofrece los cinco subestados en el orden acordado',
    JSON.stringify(chips.map((c) => c.trim())) === JSON.stringify([
      'Pendiente de montaje', 'En montaje', 'Falta material',
      'Por finalizar montaje', 'Pendiente de rematar',
    ]), chips.join(' | '));

  check('El que ya tenía sigue marcado',
    (await page.locator('.substatus-grid .chip[aria-pressed="true"]').innerText()).trim()
      === 'En montaje');

  // Se marcan los dos nuevos SIN desmarcar el que había: se pueden tener
  // varios a la vez, y ese es el sentido de la pantalla.
  await page.locator('.substatus-grid .chip', { hasText: 'Pendiente de montaje' }).click();
  await page.waitForTimeout(600);
  await page.locator('.substatus-grid .chip', { hasText: 'Pendiente de rematar' }).click();
  await page.waitForTimeout(600);

  const guardados = db.project_substatuses
    .filter((s) => s.project_id === 'p1').map((s) => s.substatus).sort();
  check('Los dos subestados nuevos se guardan, y el anterior se conserva',
    JSON.stringify(guardados) === JSON.stringify(
      ['en_montaje', 'pendiente_montaje', 'pendiente_rematar']),
    guardados.join(', '));

  check('Y se guardan en la fase montaje, no en otra',
    db.project_substatuses.filter((s) => s.project_id === 'p1')
      .every((s) => s.phase === 'montaje'));

  check('El historial lo escribe en castellano, no con la clave técnica',
    db.audit_log.some((a) => a.summary?.includes('Pendiente de rematar'))
    && !db.audit_log.some((a) => a.summary?.includes('pendiente_rematar')),
    db.audit_log.slice(-2).map((a) => a.summary).join(' | '));

  // Desmarcar vuelve a dejarlo como estaba: añadir no rompe quitar.
  await page.locator('.substatus-grid .chip', { hasText: 'Pendiente de montaje' }).click();
  await page.waitForTimeout(600);
  check('Y se pueden desmarcar',
    !db.project_substatuses.some((s) => s.project_id === 'p1' && s.substatus === 'pendiente_montaje'),
    db.project_substatuses.filter((s) => s.project_id === 'p1').map((s) => s.substatus).join(', '));

  // ------------ FILTRAR LA LISTA POR UN SUBESTADO NUEVO ------------
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos`, { waitUntil: 'networkidle' });
  await page.locator('.table').waitFor({ state: 'visible', timeout: 15000 });

  const sinFiltro = limpio(await page.locator('.table tbody').innerText());
  check('Sin filtrar se ven los dos proyectos en montaje',
    sinFiltro.includes(`PROY-${YEAR}-001`) && sinFiltro.includes(`PROY-${YEAR}-002`));

  check('Los dos subestados nuevos se ofrecen en el filtro',
    (await page.locator('#project-substatus option[value="pendiente_montaje"]').count()) === 1
    && (await page.locator('#project-substatus option[value="pendiente_rematar"]').count()) === 1);

  await page.locator('#project-substatus').selectOption('pendiente_rematar');
  await page.waitForTimeout(1200);

  // LO QUE IMPORTA: que DESCARTE el otro. Que salga uno no basta: con un
  // solo proyecto saldría uno igualmente sin filtrar nada.
  const conFiltro = limpio(await page.locator('.table tbody').innerText());
  check('Filtrando por «Pendiente de rematar» solo queda el que lo tiene',
    (await page.locator('.table tbody tr').count()) === 1
    && conFiltro.includes(`PROY-${YEAR}-001`) && !conFiltro.includes(`PROY-${YEAR}-002`),
    conFiltro.replace(/\n/g, ' | '));

  await page.locator('#project-substatus').selectOption('pendiente_montaje');
  await page.waitForTimeout(1200);
  check('Y por el que se acaba de desmarcar no devuelve nada, y lo explica',
    limpio(await page.locator('.empty').innerText()).includes('Pendiente de montaje'),
    await page.locator('.empty').innerText());

  // ============ M4 · EL ANTICIPO COMO COBRO ============
  await page.goto(`http://localhost:${PORT}/#/admin/facturacion`, { waitUntil: 'networkidle' });
  await page.locator('.table').waitFor({ state: 'visible', timeout: 15000 });

  await page.locator(`tr:has-text("PROY-${YEAR}-001") button:has-text("Cobro")`).click();
  // Por el título: al confirmar una anulación hay DOS modales abiertos.
  const cobros = page.locator('.modal').filter({ hasText: 'Cobros de' });
  await cobros.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(700);

  const antes = limpio(await cobros.innerText());
  check('El anticipo previsto se ve, y dice que NO está cobrado',
    antes.includes('1.500,00 €') && antes.includes('Anticipo · sin cobrar'),
    antes.replace(/\n/g, ' | ').slice(0, 300));

  check('Y el total cobrado sigue en cero: previsto no es cobrado',
    antes.includes('0,00 €') && antes.includes('5.000,00 €'),
    antes.replace(/\n/g, ' | ').slice(0, 300));

  check('Se explica con palabras por qué no cuenta todavía',
    antes.includes('previsto no es cobrado'),
    antes.replace(/\n/g, ' | '));

  // EL BOTÓN. Apunta el anticipo como el cobro que es.
  await page.locator('#pay-advance').click();
  await page.waitForTimeout(1200);

  const apuntados = db.payments.filter((p) => p.project_id === 'p1' && !p.voided_at);
  check('Se apunta UN cobro, por el importe previsto, marcado como anticipo',
    apuntados.length === 1 && Number(apuntados[0].amount) === 1500
    && apuntados[0].is_advance === true,
    JSON.stringify(apuntados.map((c) => ({ a: c.amount, ant: c.is_advance }))));

  const despues = limpio(await cobros.innerText());
  check('El total cobrado sube UNA vez: 1.500 cobrados y 3.500 pendientes',
    despues.includes('1.500,00 €') && despues.includes('3.500,00 €')
    && !despues.includes('3.000,00 €'),
    despues.replace(/\n/g, ' | ').slice(0, 320));

  check('El anticipo pasa a decir que está cobrado',
    despues.includes('Anticipo · cobrado'),
    despues.replace(/\n/g, ' | ').slice(0, 320));

  check('Y el cobro aparece en la lista marcado como anticipo',
    (await page.locator('.mini-list li:has-text("1.500,00") .badge').innerText()).trim()
      === 'Anticipo');

  // NO DOS VECES: el botón ya no está, así que no hay forma de repetirlo
  // desde la pantalla.
  check('El botón de apuntar el anticipo desaparece, para no repetirlo',
    (await page.locator('#pay-advance').count()) === 0);

  check('El estado de facturación se recalcula como con cualquier cobro',
    db.projects.find((p) => p.id === 'p1').billing_status === 'cobrado_parcial',
    db.projects.find((p) => p.id === 'p1').billing_status);

  // ------------ ANULARLO LO DEJA COMO ESTABA, SIN BORRAR NADA ------------
  await page.locator('.mini-list li:has-text("1.500,00") button[aria-label^="Anular"]').click();
  await page.locator('.modal-foot button:has-text("Anular")').waitFor({ timeout: 10000 });
  check('Anular avisa de que el cobro no se borra',
    limpio(await page.locator('.modal').filter({ hasText: 'Anular el cobro' }).innerText())
      .includes('No se borra'));
  await page.locator('.modal-foot button:has-text("Anular")').click();
  await page.waitForTimeout(1200);

  const anulado = db.payments.find((p) => p.project_id === 'p1' && p.is_advance);
  check('El cobro del anticipo NO se borra: se queda anulado y a la vista',
    !!anulado && !!anulado.voided_at && Number(anulado.amount) === 1500,
    JSON.stringify(anulado));

  check('Y el anticipo previsto del proyecto sigue intacto',
    Number(db.projects.find((p) => p.id === 'p1').advance_amount) === 1500);

  const tras = limpio(await cobros.innerText());
  check('Vuelve a decir que el anticipo está sin cobrar',
    tras.includes('Anticipo · sin cobrar'), tras.replace(/\n/g, ' | ').slice(0, 320));

  check('Y se puede volver a apuntar, porque el error se arregla',
    (await page.locator('#pay-advance').count()) === 1);

  // ============ M1 · CORREGIR EL CLIENTE ============
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/f1/editar`, { waitUntil: 'networkidle' });
  await page.locator('.panel:has(h2:has-text("Cliente"))').first()
    .waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(600);

  const panelCliente = page.locator('.panel').filter({ hasText: 'García Construcciones SL' }).first();
  check('El presupuesto se abre con su cliente a la vista',
    (await panelCliente.count()) === 1);

  check('Y ya NO dice que el cliente no se puede cambiar',
    !limpio(await page.locator('form').innerText()).includes('no se cambia una vez creada'),
    limpio(await page.locator('form').innerText()).slice(0, 200).replace(/\n/g, ' | '));

  await page.locator('button:has-text("Cambiar")').click();
  await page.waitForTimeout(400);

  // LO QUE NO PUEDE OFRECER: dar de alta un cliente nuevo. Corregir el
  // cliente equivocado creando otro dejaría dos registros del mismo.
  check('Al cambiarlo solo se puede BUSCAR, no dar de alta uno nuevo',
    (await page.locator('#cp-search').count()) === 1
    && (await page.locator('#cp-tax').count()) === 0
    && (await page.locator('#cp-phone').count()) === 0);

  check('Y se explica qué hacer si el cliente todavía no existe',
    limpio(await page.locator('.panel').filter({ hasText: 'Buscar el cliente' }).innerText())
      .includes('dalo de alta en Clientes'));

  // Se puede volver a dejar el que estaba: equivocarse al corregir no
  // puede costar el dato.
  check('Se ofrece dejar el cliente de antes',
    (await page.locator('#f-client-keep').count()) === 1);
  await page.locator('#f-client-keep').click();
  await page.waitForTimeout(300);
  check('Y al pulsarlo vuelve el de antes',
    (await page.locator('.panel').filter({ hasText: 'García Construcciones SL' }).count()) >= 1);

  // Ahora sí: se corrige.
  await page.locator('button:has-text("Cambiar")').click();
  await page.waitForTimeout(300);
  await page.locator('#cp-search').fill('Garcia Reformes');
  await page.waitForTimeout(900);
  await page.locator('.suggest-box button:has-text("Garcia Reformes i Obres SL")').click();
  await page.waitForTimeout(400);

  check('Escribiendo el nombre se propone el cliente que ya existe, y se elige',
    (await page.locator('.panel').filter({ hasText: 'Garcia Reformes i Obres SL' }).count()) >= 1);

  await page.locator('button:has-text("Guardar")').first().click();
  await page.waitForTimeout(1500);

  const ficha = db.fichas.find((x) => x.id === 'f1');
  check('Se guarda el IDENTIFICADOR del cliente elegido, no su nombre',
    ficha.client_id === 'c2', String(ficha.client_id));

  check('Y se suelta la persona de contacto, que era del cliente anterior',
    ficha.contact_id === null, String(ficha.contact_id));

  check('El presupuesto conserva todo lo demás',
    ficha.code === `PRES-${YEAR}-001` && ficha.status === 'enviado'
    && Number(ficha.amount) === 3400 && ficha.title === 'Barandilla del rellano',
    JSON.stringify({ c: ficha.code, s: ficha.status, a: ficha.amount }));

  check('El cliente anterior sigue entero',
    db.clients.find((c) => c.id === 'c1')?.name === 'García Construcciones SL'
    && !db.clients.find((c) => c.id === 'c1')?.archived_at);

  check('Y no se ha creado ningún cliente nuevo',
    db.clients.length === 2, String(db.clients.length));

  check('El historial lo cuenta con los dos nombres',
    db.audit_log.some((a) => a.summary?.includes('cambió el cliente de')
      && a.summary.includes('García Construcciones SL → Garcia Reformes i Obres SL')),
    db.audit_log.slice(-2).map((a) => a.summary).join(' | '));

  check('Y dice que se ha quitado el contacto',
    db.audit_log.some((a) => a.summary?.includes('Se quitó la persona de contacto')));

  // SIN CASCADA: el proyecto es otro registro y se cambia aparte.
  check('Los proyectos no cambian de cliente por su cuenta',
    db.projects.every((p) => p.client_id === 'c1'),
    db.projects.map((p) => `${p.code}:${p.client_id}`).join(' | '));

  // ============ M2 · MATERIAL DE TALLER ============
  await page.goto(`http://localhost:${PORT}/#/admin/material`, { waitUntil: 'networkidle' });
  await page.locator('button:has-text("Nuevo material")').waitFor({ timeout: 15000 });
  await page.locator('button:has-text("Nuevo material")').click();
  await page.locator('#mat-project').waitFor({ timeout: 10000 });

  check('El desplegable no trae ninguna opción puesta: hay que elegir',
    (await page.locator('#mat-project').inputValue()) === '');

  check('Y entre las opciones está «sin proyecto · material de taller»',
    (await page.locator('#mat-project option[value="taller"]').count()) === 1,
    (await page.locator('#mat-project').allInnerTexts()).join(' | '));

  // Guardar sin elegir nada tiene que pararse: «sin proyecto» es una
  // decisión, no un despiste.
  await page.locator('#mat-name').fill('Discos de corte 125 mm');
  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(600);
  check('Sin elegir nada no se guarda, y se dice por qué',
    limpio(await page.locator('.modal .alert-danger').innerText()).includes('Elige el proyecto'),
    await page.locator('.modal .alert-danger').innerText().catch(() => 'sin aviso'));

  await page.locator('#mat-project').selectOption('taller');
  await page.waitForTimeout(300);
  check('Al elegirlo se explica qué es material de taller',
    limpio(await page.locator('.modal').innerText()).includes('Consumibles del taller'));

  await page.locator('#mat-units').fill('50');
  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(1500);

  const taller = db.materials.find((m) => m.name === 'Discos de corte 125 mm');
  check('El material se anota SIN proyecto',
    !!taller && taller.project_id === null, JSON.stringify(taller ?? null));

  check('Y no se ha creado ningún proyecto para colgarlo',
    db.projects.length === 2, String(db.projects.length));

  const tabla = limpio(await page.locator('.table tbody').innerText());
  check('En el listado se ve que es del taller, no un hueco',
    tabla.includes('Discos de corte 125 mm') && tabla.includes('Taller'),
    tabla.replace(/\n/g, ' | ').slice(0, 300));

  // ------------ ACEPTAR UN AVISO DEL TALLER SIN INVENTARLE PROYECTO ------------
  await page.locator('.tabs').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('button:has-text("Avisos del taller")').click();
  await page.waitForTimeout(900);

  const aviso = limpio(await page.locator('.request-list').innerText());
  check('El aviso del taller llegó sin proyecto, y se dice',
    aviso.includes('discos de corte de 125') && aviso.includes('sin proyecto'),
    aviso.replace(/\n/g, ' | '));

  await page.locator('button:has-text("Anotar como material")').click();
  await page.locator('#mat-project').waitFor({ timeout: 10000 });

  check('Al anotarlo se ofrece elegir proyecto O marcarlo como material de taller',
    (await page.locator('#mat-project option[value="taller"]').count()) === 1
    && limpio(await page.locator('.modal').innerText()).includes('márcalo como material'),
    limpio(await page.locator('.modal').innerText()).replace(/\n/g, ' | ').slice(0, 260));

  await page.locator('#mat-project').selectOption('taller');
  await page.locator('#mat-name').fill('Discos de corte 125 mm (del aviso)');
  await page.locator('#mat-units').fill('25');
  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(1500);

  const delAviso = db.materials.find((m) => m.name === 'Discos de corte 125 mm (del aviso)');
  check('El aviso se acepta como material de taller, sin proyecto',
    !!delAviso && delAviso.project_id === null, JSON.stringify(delAviso ?? null));

  check('Y el aviso queda aceptado y atado a ese material',
    db.material_requests[0].status === 'aceptada'
    && db.material_requests[0].material_id === delAviso?.id
    && db.material_requests[0].project_id === null,
    JSON.stringify(db.material_requests[0]));

  check('Sigue sin haberse creado ningún proyecto',
    db.projects.length === 2, String(db.projects.length));

  check('Ninguna pantalla ha dado un error de programación',
    errores.length === 0, errores.join(' · '));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

process.exit(report() ? 1 : 0);
