/**
 * METALPLAFER360 · BLOQUE 5 · El día a día del trabajador.
 *
 *   npm run test:bloque5
 *
 * Comprueba en un navegador real:
 *   · que un trabajo de mostrador se registra con la pantalla de AVISOS
 *     que ya existía, y que recoge cliente, trabajo, teléfono, correo,
 *     horas e importe para que administración lo facture;
 *   · que el trabajador ve sus proyectos ORDENADOS por lo que toca
 *     antes, con sus fechas, y entra en ellos desde el calendario;
 *   · que el calendario del trabajador es de consulta: no arrastra nada;
 *   · que existe la opción «Parte sin proyecto», con el mismo
 *     formulario, y que administración lo asigna después;
 *   · que cualquiera puede «Solicitar material» sin esperar a un parte;
 *   · que el trabajador NO ve ni un euro, ni aunque pida los datos a
 *     mano.
 *
 * Las reglas de verdad se prueban contra PostgreSQL en
 * tests/sql/84_tests_bloque5.sql.
 */
import {
  ADMIN, WORKER, YEAR, addDays, buildApp, createChecker, createDb, diaLaborable,
  launchBrowser, serveApp, signIn, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4192;
const HOY = today();
const LABORABLE = diaLaborable(HOY);

/** Dos días laborables distintos, para poder comprobar el orden. */
const PRONTO = LABORABLE;
const TARDE = (() => {
  let d = addDays(LABORABLE, 7);
  return diaLaborable(d);
})();

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

const proyecto = (id, n, nombre, importe, extra = {}) => ({
  id, code: `PROY-${YEAR}-${String(n).padStart(3, '0')}`, client_id: 'c1', contact_id: null,
  source_ficha_id: null, name: nombre, description: `Descripción de ${nombre}.`,
  measures: '3 tramos', finish: 'Negro forja', location: 'Escalera', address: 'Rambla, 45',
  observations: null, budget_amount: importe, advance_amount: 500,
  budget_hours_fab: 16, budget_hours_mont: 0,
  phase: 'fabricacion', no_assembly: true, billing_status: 'por_facturar',
  finished_at: null, archived_at: null, is_demo: false,
  fab_start: null, fab_end: null, mont_start: null, mont_end: null,
  fab_workers: 2, mont_workers: 2, fab_manual: true, mont_manual: false, autoplan: true,
  work_id: null, invoiced_amount: null, invoiced_on: null,
  created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z', ...extra,
});

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: null, address: 'Carrer de la Indústria, 12', city: 'Sabadell',
      postal_code: '08202', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  projects: [
    // A PROPÓSITO, el orden por fecha NO coincide con ningún orden fácil:
    //   · por fecha:        PROY-001 (pronto) → PROY-002 (tarde)
    //   · por código desc.: PROY-002 → PROY-001
    //   · como vienen aquí: PROY-002 → PROY-001
    // Así, si la pantalla dejara de ordenar por fecha, la prueba falla.
    proyecto('p-tarde', 2, 'Barandilla del tercero', 4000,
      { fab_start: TARDE, fab_end: TARDE }),
    proyecto('p-pronto', 1, 'Puerta del garaje', 2500,
      { fab_start: PRONTO, fab_end: PRONTO }),
    proyecto('p-ajeno', 3, 'Proyecto de otro', 9999),
  ],
  project_workers: [
    { project_id: 'p-tarde', worker_id: WORKER.id, assigned_at: '2026-05-05T09:00:00Z',
      assigned_by: ADMIN.id, is_demo: false },
    { project_id: 'p-pronto', worker_id: WORKER.id, assigned_at: '2026-05-05T09:00:00Z',
      assigned_by: ADMIN.id, is_demo: false },
  ],
  counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 3, OT: 0, PT: 0, OBRA: 0 },
});

const people = [ADMIN, WORKER];
const browser = await launchBrowser();

try {
  // ===================================================================
  // ADMINISTRACIÓN · el aviso de taller que se factura
  // ===================================================================
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db, getUser: () => ADMIN, people });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));

  await signIn(page, PORT, 'salvi');

  await page.goto(`http://localhost:${PORT}/#/admin/fichas/nueva?tipo=aviso`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  check('El trabajo de mostrador se registra en la pantalla de avisos de siempre',
    (await page.locator('h1').first().innerText()).includes('Nuevo aviso'));
  check('Y no hay ninguna pantalla nueva de «trabajos de taller»',
    !(await page.locator('.sidebar nav').innerText()).toLowerCase().includes('taller'));
  const tipos = page.locator('.panel:has(h2:has-text("Tipo de ficha")) .segmented');
  check('Sigue teniendo los tres tipos de ficha de siempre',
    (await tipos.innerText()).includes('Presupuesto')
    && (await tipos.innerText()).includes('Visita')
    && (await tipos.innerText()).includes('Aviso'),
    (await tipos.innerText()).replace(/\n/g, ' | '));

  // Los campos que pedía el encargo, en el mismo formulario.
  check('Recoge el teléfono', await page.locator('#f-phone').count() === 1);
  check('Y el correo electrónico', await page.locator('#f-email').count() === 1);
  check('Y las horas dedicadas', await page.locator('#f-hours').count() === 1);
  check('Y el importe, que antes solo salía en los presupuestos',
    await page.locator('#f-amount').count() === 1);

  await page.locator('#cp-name').fill('Rosa Martí');
  await page.locator('#f-title').fill('Cortar y plegar una pletina');
  await page.locator('#f-desc').fill('Viene al taller con una pletina de 2 m. Cortar a 1,20 y plegar a 90°.');
  await page.locator('#f-phone').fill('644555666');
  await page.locator('#f-email').fill('rosa.marti@ejemplo.es');
  await page.locator('#f-hours').fill('0,75');
  await page.locator('#f-amount').fill('35');
  await page.locator('#f-date').fill(HOY);
  await page.locator('#f-assigned').selectOption(WORKER.id);
  await page.locator('button:has-text("Crear aviso")').click();
  await page.waitForTimeout(1400);

  const aviso = db.fichas[0];
  check('El aviso se crea con el código AVI de siempre',
    aviso?.code === `AVI-${YEAR}-001`, aviso?.code);
  check('Guarda el teléfono y el correo',
    aviso?.phone === '644555666' && aviso?.email === 'rosa.marti@ejemplo.es');
  check('Y las horas y el importe, que es lo que hacía falta para facturar',
    Number(aviso?.hours) === 0.75 && Number(aviso?.amount) === 35,
    `${aviso?.hours} h · ${aviso?.amount} €`);
  check('Al asignarlo a alguien pasa a «Asignado», como siempre',
    aviso?.status === 'asignado', aviso?.status);

  const ficha = await page.locator('main').innerText();
  // El teléfono se muestra con espacios («644 555 666»), como en el resto
  // de la aplicación.
  check('La ficha del aviso muestra lo que hace falta para facturarlo',
    ficha.includes('644 555 666') && ficha.includes('rosa.marti@ejemplo.es')
    && ficha.includes('0,75 h') && ficha.includes('35,00'),
    ficha.replace(/\n/g, ' · ').slice(0, 320));
  check('Con sus rótulos, para que se entienda qué es cada cosa',
    ficha.includes('Correo') && ficha.includes('Horas dedicadas') && ficha.includes('Importe'));

  // ===================================================================
  // EL TRABAJADOR
  // ===================================================================
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(movil, { db, getUser: () => WORKER, people });
  const m = await movil.newPage();
  const erroresMovil = [];
  m.on('pageerror', (e) => erroresMovil.push(String(e)));

  await signIn(m, PORT, 'juan');

  // ---------------- SUS PROYECTOS, ORDENADOS -------------------------
  await m.locator('.w-tabbar a:has-text("Proyectos")').click();
  await m.waitForTimeout(1200);

  const tarjetas = await m.locator('.ot-card .plate').allInnerTexts();
  check('Ve los proyectos a los que está asignado, y solo esos',
    tarjetas.length === 2, tarjetas.join(' | '));
  check('Ordenados por lo que toca antes, no por código ni como vengan',
    tarjetas[0] === `PROY-${YEAR}-001` && tarjetas[1] === `PROY-${YEAR}-002`,
    tarjetas.join(' | '));
  check('La pantalla dice que están ordenados así',
    (await m.locator('.w-greeting').innerText()).includes('toca antes'));

  const listado = await m.locator('.w-content').innerText();
  check('Cada proyecto lleva su fecha de fabricación',
    listado.includes('Fabricación'), listado.replace(/\n/g, ' · ').slice(0, 240));
  check('Y no se ve ni un importe en el listado',
    !listado.includes('4.000') && !listado.includes('2.500') && !listado.includes('€'),
    listado.replace(/\n/g, ' · ').slice(0, 240));

  // ---------------- DENTRO DEL PROYECTO ------------------------------
  await m.locator(`.ot-card:has-text("PROY-${YEAR}-001")`).click();
  await m.waitForTimeout(1200);

  const dentro = await m.locator('.w-content').innerText();
  check('Dentro del proyecto ve la información del trabajo',
    dentro.includes('Medidas') && dentro.includes('Negro forja'));
  check('Y cuándo le toca', dentro.includes('Cuándo le toca'));
  check('Y su documentación técnica', dentro.includes('Documentación del proyecto'));
  check('Y los comentarios', dentro.includes('Comentarios'));
  check('Y sus partes de este proyecto', dentro.includes('Mis partes de este proyecto'));
  check('Con un enlace a su calendario', await m.locator('a[href="#/t/calendario"]').count() >= 1);
  check('Pero NI UN EURO: ni importe, ni paga y señal, ni facturación',
    !dentro.includes('2.500') && !dentro.includes('500') && !dentro.includes('€')
    && !dentro.toLowerCase().includes('presupuesto ')
    && !dentro.toLowerCase().includes('paga y señal')
    && !dentro.toLowerCase().includes('facturación'),
    dentro.replace(/\n/g, ' · ').slice(0, 400));

  // ---------------- SOLICITAR MATERIAL, CON PROYECTO -----------------
  check('Dentro del proyecto puede pedir material',
    await m.locator('button:has-text("Solicitar material")').count() === 1);

  await m.locator('button:has-text("Solicitar material")').click();
  await m.waitForTimeout(500);
  check('Se dice a qué proyecto se va a asociar',
    (await m.locator('.modal').innerText()).includes(`PROY-${YEAR}-001`));
  await m.locator('#mn-texto').fill('Faltan 3 bisagras de 80 para acabar la hoja.');
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(1200);

  const conProyecto = db.material_requests.find((r) => r.body.includes('bisagras'));
  check('La petición queda asociada al proyecto',
    conProyecto?.project_id === 'p-pronto', String(conProyecto?.project_id));
  check('Y la abre él, sin pasar por ningún parte',
    conProyecto?.worker_id === WORKER.id && conProyecto?.order_id === null
    && conProyecto?.status === 'pendiente');

  // ---------------- SU CALENDARIO: SOLO CONSULTA ---------------------
  await m.locator('.w-tabbar a:has-text("Calendario")').click();
  await m.waitForTimeout(1400);

  const cal = await m.locator('.w-content').innerText();
  check('En su calendario ve la fabricación de sus proyectos',
    cal.includes(`PROY-${YEAR}-001`) || cal.includes(`PROY-${YEAR}-002`),
    cal.replace(/\n/g, ' · ').slice(0, 260));
  check('Y también su aviso de taller',
    cal.includes(`AVI-${YEAR}-001`) || cal.includes('Cortar y plegar'),
    cal.replace(/\n/g, ' · ').slice(0, 260));
  check('Su calendario abre en agenda, que es lo que se consulta en obra',
    await m.locator('.cal-agenda').count() === 1
    && await m.locator('.cal-row').count() > 0,
    String(await m.locator('.cal-row').count()));

  // Para que «no puede arrastrar» signifique algo, se mira la vista de
  // mes, que es donde se arrastra: hay eventos, y ninguno es arrastrable.
  await m.locator('.cal-toolbar button:has-text("Mes")').click();
  await m.waitForTimeout(900);
  check('En la vista de mes ve sus eventos',
    await m.locator('.cal-event').count() > 0,
    String(await m.locator('.cal-event').count()));
  check('Pero NINGUNO se puede arrastrar: la planificación no se toca desde aquí',
    await m.locator('.cal-event[draggable="true"]').count() === 0);
  check('Ni marcar días no laborables', await m.locator('.cal-festivo').count() === 0);
  check('Ni crear eventos', await m.locator('button:has-text("Nuevo evento")').count() === 0);
  check('Ni filtrar por trabajador: solo tiene lo suyo',
    await m.locator('#cal-worker').count() === 0);
  check('Y su calendario tampoco trae ningún importe',
    !cal.includes('€') && !cal.includes('4.000') && !cal.includes('2.500'),
    cal.replace(/\n/g, ' · ').slice(0, 260));

  // Y desde el calendario entra en el proyecto.
  const evento = m.locator(`.cal-event:has-text("PROY-${YEAR}-001")`).first();
  check('El proyecto que toca antes está en su calendario', await evento.count() > 0);
  await evento.click();
  await m.waitForTimeout(1300);
  check('Desde el calendario entra en el proyecto',
    m.url().includes('#/t/proyectos/p-pronto'), m.url());

  // ---------------- PARTE SIN PROYECTO ------------------------------
  await m.locator('.w-tabbar a:has-text("Mis partes")').click();
  await m.waitForTimeout(1100);

  check('La opción «Parte sin proyecto» está a la vista y con su nombre',
    await m.locator('a:has-text("Parte sin proyecto")').count() === 1);

  await m.locator('a:has-text("Parte sin proyecto")').click();
  await m.waitForTimeout(1100);

  check('Se abre con ese título',
    (await m.locator('.w-greeting').innerText()).includes('Parte sin proyecto'));
  check('Y se explica que es el mismo parte de siempre',
    (await m.locator('.alert-info').first().innerText()).includes('el mismo parte de siempre'));
  check('Es EL MISMO formulario: tipo de trabajo, día, trabajo y horas',
    await m.locator('#pt-fecha').count() === 1
    && await m.locator('#pt-done').count() === 1
    && await m.locator('#pt-hours').count() === 1
    && await m.locator('button:has-text("Fabricación")').count() === 1);
  check('Con el proyecto en «Sin proyecto», que es una opción de verdad',
    await m.locator('#pt-proyecto').inputValue() === '');
  check('Y se puede elegir un proyecto si resulta que sí lo tiene',
    (await m.locator('#pt-proyecto').innerText()).includes(`PROY-${YEAR}-001`));

  await m.locator('button:has-text("Montaje")').click();
  await m.locator('#pt-done').fill('Corte y plegado de una pletina para una persona del mostrador.');
  await m.locator('#pt-hours').fill('0,75');
  await m.locator('button:has-text("Enviar")').click();
  await m.waitForTimeout(500);
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(1300);

  const suelto = db.work_reports.find((r) => r.work_done?.includes('mostrador'));
  check('El parte se envía sin proyecto',
    suelto != null && suelto.project_id === null && suelto.status === 'enviado',
    `${suelto?.project_id} · ${suelto?.status}`);
  check('Y con las horas y el trabajo que se escribieron',
    Number(suelto?.hours) === 0.75 && suelto?.work_type === 'montaje');

  // El fallo que encontró la prueba del BLOQUE 1: abrir un parte nuevo
  // desde otro NO debe arrastrar el proyecto del anterior.
  await m.goto(`http://localhost:${PORT}/#/t/partes/nuevo?proyecto=p-pronto`,
    { waitUntil: 'networkidle' });
  await m.waitForTimeout(1000);
  check('Viniendo de un proyecto, el parte se abre con ese proyecto puesto',
    await m.locator('#pt-proyecto').inputValue() === 'p-pronto');

  await m.goto(`http://localhost:${PORT}/#/t/partes/nuevo`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(1000);
  check('Y un parte nuevo NO se queda con el proyecto del anterior',
    await m.locator('#pt-proyecto').inputValue() === '',
    await m.locator('#pt-proyecto').inputValue());

  // ---------------- SOLICITAR MATERIAL, SIN PROYECTO -----------------
  await m.locator('.w-tabbar a:has-text("Inicio")').click();
  await m.waitForTimeout(1300);

  check('Desde el inicio puede pedir material sin más',
    await m.locator('button:has-text("Solicitar material")').count() === 1);
  check('Y tiene a la vista «Parte sin proyecto»',
    await m.locator('a:has-text("Parte sin proyecto")').count() === 1);

  await m.locator('button:has-text("Solicitar material")').click();
  await m.waitForTimeout(500);
  check('Se avisa de que va sin proyecto',
    (await m.locator('.modal').innerText()).includes('sin proyecto'));
  await m.locator('#mn-texto').fill('Se han acabado los discos de corte de 125.');
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(1300);

  const sinProyecto = db.material_requests.find((r) => r.body.includes('discos'));
  check('Se puede pedir material sin proyecto y sin parte',
    sinProyecto != null && sinProyecto.project_id === null
    && sinProyecto.order_id === null && sinProyecto.status === 'pendiente');
  check('Y entra en la MISMA lista, no en otra tabla',
    db.material_requests.length === 2, String(db.material_requests.length));

  // ---------------- NI UN EURO, NI PIDIÉNDOLO A MANO ----------------
  const pedido = await m.evaluate(async (base) => {
    const traer = async (ruta) => {
      const r = await fetch(`${base}/rest/v1/${ruta}`,
        { headers: { 'content-type': 'application/json' } });
      try { return JSON.parse(await r.text()); } catch { return null; }
    };
    return {
      fichas: await traer('fichas?select=*'),
      suyas: await traer('worker_fichas?select=*'),
      proyectos: await traer('projects?select=*'),
      mios: await traer('worker_projects?select=*'),
      cobros: await traer('payments?select=*'),
      cuentas: await traer('project_billing?select=*'),
      obras: await traer('works?select=*'),
    };
  }, 'https://ejemplo.supabase.co');

  const vacio = (x) => Array.isArray(x) && x.length === 0;
  check('Pidiendo «fichas» a mano no recibe ninguna fila: ahí está el importe',
    vacio(pedido.fichas), JSON.stringify(pedido.fichas).slice(0, 160));
  check('Pero sí ve su aviso por «worker_fichas»',
    Array.isArray(pedido.suyas) && pedido.suyas.length === 1
    && pedido.suyas[0].code === `AVI-${YEAR}-001`,
    JSON.stringify(pedido.suyas).slice(0, 160));
  check('Y esa vista no trae el importe por ningún lado',
    Array.isArray(pedido.suyas) && pedido.suyas.every((f) => !('amount' in f)),
    JSON.stringify(pedido.suyas?.[0] ?? {}).slice(0, 200));
  check('Con el teléfono, el correo y las horas, que sí son suyos',
    pedido.suyas?.[0]?.phone === '644555666'
    && pedido.suyas?.[0]?.email === 'rosa.marti@ejemplo.es'
    && Number(pedido.suyas?.[0]?.hours) === 0.75);
  check('Pidiendo «projects» a mano tampoco recibe nada',
    vacio(pedido.proyectos), JSON.stringify(pedido.proyectos).slice(0, 160));
  check('Y «worker_projects» no trae importe, ni paga y señal, ni facturación',
    Array.isArray(pedido.mios) && pedido.mios.every((p) => !('budget_amount' in p)
      && !('advance_amount' in p) && !('invoiced_amount' in p) && !('billing_status' in p)),
    JSON.stringify(pedido.mios?.[0] ?? {}).slice(0, 220));
  check('Pero sí las fechas, que es lo que necesita para priorizar',
    Array.isArray(pedido.mios) && pedido.mios.every((p) => 'fab_start' in p && 'proximo' in p));
  check('Ni cobros, ni cuentas de proyecto, ni obras',
    vacio(pedido.cobros) && vacio(pedido.cuentas) && vacio(pedido.obras));

  // ===================================================================
  // ADMINISTRACIÓN · revisa lo que ha llegado
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/material`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);

  check('Administración también tiene «Solicitar material»',
    await page.locator('button:has-text("Solicitar material")').count() === 1);

  await page.locator('.tabs button:has-text("Avisos del taller")').click();
  await page.waitForTimeout(900);

  const peticiones = await page.locator('.request-list').innerText();
  check('Las dos peticiones están en la lista de revisión de siempre',
    peticiones.includes('bisagras') && peticiones.includes('discos'),
    peticiones.replace(/\n/g, ' · ').slice(0, 280));
  check('Y se ve cuál llegó sin proyecto', peticiones.includes('sin proyecto'));

  // Aceptar la que NO trae proyecto: hay que decir a cuál va.
  const sinProy = page.locator('.request-list li', { hasText: 'discos' });
  await sinProy.locator('button:has-text("Anotar como material")').click();
  await page.waitForTimeout(700);
  check('Al aceptar una petición sin proyecto se pide el proyecto',
    (await page.locator('.modal').innerText()).includes('Elige abajo a cuál va')
    && await page.locator('.modal select').count() >= 1);

  await page.locator('.modal button:has-text("Guardar")').click();
  await page.waitForTimeout(700);
  check('Y no se deja aceptar a ciegas',
    (await page.locator('.modal').innerText()).includes('Elige el proyecto'),
    (await page.locator('.modal').innerText()).replace(/\n/g, ' · ').slice(0, 200));

  await page.locator('.modal select').first().selectOption('p-tarde');
  await page.locator('.modal button:has-text("Guardar")').click();
  await page.waitForTimeout(1400);

  const material = db.materials.find((x) => x.name.includes('discos'));
  check('Aceptada, se convierte en material pendiente del proyecto elegido',
    material != null && material.project_id === 'p-tarde' && material.received === false,
    `${material?.project_id}`);
  check('El material pendiente sigue siendo SIEMPRE de un proyecto',
    db.materials.every((x) => x.project_id));
  check('Y la petición queda marcada como aceptada',
    db.material_requests.find((r) => r.body.includes('discos'))?.status === 'aceptada');

  // ---------------- EL PARTE SUELTO, ASIGNADO DESPUÉS ---------------
  await page.goto(`http://localhost:${PORT}/#/admin/partes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('.tabs button:has-text("Sin proyecto")').click();
  await page.waitForTimeout(900);
  check('Administración encuentra los partes sin proyecto en su pestaña',
    (await page.locator('.table').innerText()).includes(suelto.code),
    suelto.code);

  await page.locator(`.table a:has-text("${suelto.code}")`).click();
  await page.waitForTimeout(1000);
  check('Y se le avisa de que ese parte no tiene proyecto',
    await page.locator('.alert-warn:has-text("no tiene proyecto")').count() === 1);
  await page.locator('button:has-text("Asignar a un proyecto")').click();
  await page.waitForTimeout(700);
  await page.locator('#pt-proy').selectOption('p-pronto');
  await page.locator('.modal button:has-text("Asignar")').click();
  await page.waitForTimeout(1300);
  check('Y lo asigna a un proyecto después, como pedía el encargo',
    db.work_reports.find((r) => r.id === suelto.id)?.project_id === 'p-pronto');

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
