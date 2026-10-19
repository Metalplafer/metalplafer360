/**
 * METALPLAFER360 · AVISOS PARA VARIOS TRABAJADORES · EN NAVEGADOR REAL
 *
 *   npm run test:avisos
 *
 * Comprueba en un navegador de verdad, pulsando lo que pulsa una persona:
 *
 *   · que administración reparte un AVISO DE CLIENTE entre VARIOS
 *     trabajadores, y que quitar a uno es volver a mandar la lista;
 *   · que un aviso asignado por el camino de SIEMPRE («assigned_to»,
 *     sin fila en la tabla nueva) sigue llegándole a su trabajador: es
 *     el requisito de compatibilidad;
 *   · que el trabajador ve sus avisos JUNTO CON sus proyectos, entra en
 *     uno y rellena un parte desde él, con sus horas reales;
 *   · que ese parte NO sale como «parte suelto» en administración, y que
 *     no se le puede poner un proyecto encima;
 *   · que una VISITA no se puede dar a un trabajador por ningún camino
 *     de la pantalla, y que se dice por qué;
 *   · que el calendario del trabajador se queda en fabricación, montaje
 *     y avisos, y que el de administración NO pierde ninguna categoría.
 *
 * Las reglas de verdad se prueban contra PostgreSQL en
 * tests/sql/90_tests_avisos.sql. Aquí se comprueba la PANTALLA.
 */
import {
  ADMIN, WORKER, YEAR, buildApp, createChecker, createDb, proximoLaborable,
  launchBrowser, serveApp, signIn, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4198;
const HOY = today();
// El próximo día laborable, HACIA DELANTE. La agenda del trabajador va de
// hoy en adelante, así que lo programado tiene que caer hoy o después:
// con «diaLaborable», que camina hacia atrás, estas pruebas fallaban los
// sábados y los domingos sin que hubiera nada roto.
const LABORABLE = proximoLaborable(HOY);

/** Un segundo trabajador, para poder repartir un aviso entre dos. */
const WORKER2 = {
  ...WORKER, id: '33333333-3333-4333-8333-333333333333',
  full_name: 'Pedro Navarro', username: 'pedro', email: 'pedro@metalplafer.com',
  phone: '600333444',
};

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

const ficha = (id, tipo, n, titulo, extra = {}) => ({
  id,
  code: `${{ presupuesto: 'PRES', visita: 'VIS', aviso: 'AVI' }[tipo]}-${YEAR}-${String(n).padStart(3, '0')}`,
  type: tipo, status: 'por_asignar', client_id: 'c1', contact_id: null,
  title: titulo, description: `Qué pasa: ${titulo.toLowerCase()}.`,
  address: 'Carrer de Sant Pau, 14', phone: '644555666', email: null,
  hours: null, scheduled_date: LABORABLE, scheduled_time: '08:30',
  assigned_to: null, amount: null, archived_at: null, is_demo: false,
  created_by: ADMIN.id,
  created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z', ...extra,
});

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: null, address: 'Carrer de la Indústria, 12', city: 'Sabadell',
      postal_code: '08202', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  fichas: [
    // El que se va a repartir entre dos.
    ficha('f-aviso', 'aviso', 1, 'Persiana metálica atascada'),
    // ASIGNADO POR EL CAMINO DE SIEMPRE: «assigned_to» y NINGUNA fila en
    // la tabla nueva. Tiene que seguir funcionando sin migrar nada.
    ficha('f-viejo', 'aviso', 2, 'Cierre que no ajusta',
      { assigned_to: WORKER.id, status: 'asignado' }),
    // Uno que NO es de nadie, para comprobar que no se asoma.
    ficha('f-ajeno', 'aviso', 3, 'Reja suelta en el patio'),
    // Y una visita, que es lo que no se reparte.
    ficha('f-visita', 'visita', 1, 'Medir el hueco del montacargas'),
    // UNA VISITA HEREDADA, asignada a un trabajador por el camino de
    // siempre. En producción puede haberlas, y el archivo 38 NO las
    // toca: su trabajador la sigue teniendo. Lo que NO puede pasar es
    // que se le pinte en el calendario, que es de administración.
    ficha('f-vis-vieja', 'visita', 2, 'Visita antigua de Juan',
      { assigned_to: WORKER.id, status: 'asignada' }),
  ],
  projects: [
    { id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1', contact_id: null,
      source_ficha_id: null, name: 'Barandilla de la escalera',
      description: 'Tres tramos.', measures: '3 tramos', finish: 'Negro forja',
      location: 'Escalera', address: 'Rambla, 45', observations: null,
      budget_amount: 6400, advance_amount: null,
      budget_hours_fab: 30, budget_hours_mont: 20,
      phase: 'fabricacion', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: false,
      fab_start: LABORABLE, fab_end: LABORABLE, mont_start: null, mont_end: null,
      fab_workers: 2, mont_workers: 2, fab_manual: true, mont_manual: false, autoplan: true,
      work_id: null, invoiced_amount: null, invoiced_on: null,
      created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z' },
  ],
  project_workers: [
    { project_id: 'p1', worker_id: WORKER.id, assigned_at: '2026-05-05T09:00:00Z',
      assigned_by: ADMIN.id, is_demo: false },
  ],
  counters: { PRES: 0, VIS: 2, AVI: 3, PROY: 1, OT: 0, PT: 0, OBRA: 0 },
});

const people = [ADMIN, WORKER, WORKER2];
const browser = await launchBrowser();
const limpio = (s) => s.replace(/ /g, ' ');

try {
  // ===================================================================
  // ADMINISTRACIÓN · repartir un aviso entre dos
  // ===================================================================
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db, getUser: () => ADMIN, people });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));

  await signIn(page, PORT, 'salvi');
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/f-aviso`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const panelEquipo = page.locator('.panel:has(h2:has-text("Trabajadores del aviso"))');
  check('Un aviso tiene su panel de trabajadores',
    await panelEquipo.count() === 1);
  check('Y ofrece a los trabajadores, no a administración',
    (await panelEquipo.innerText()).includes('Juan Ortega')
    && (await panelEquipo.innerText()).includes('Pedro Navarro')
    && !(await panelEquipo.innerText()).includes('Salvi Plaza'),
    (await panelEquipo.innerText()).replace(/\n/g, ' | '));
  check('Explica que cada uno apunta sus propias horas',
    (await panelEquipo.innerText()).includes('sus propias horas'));

  await panelEquipo.locator('label:has-text("Juan Ortega") input').check();
  await page.waitForTimeout(900);
  await panelEquipo.locator('label:has-text("Pedro Navarro") input').check();
  await page.waitForTimeout(900);

  check('Se reparte entre los dos',
    db.ficha_workers.filter((x) => x.ficha_id === 'f-aviso').length === 2,
    JSON.stringify(db.ficha_workers.map((x) => x.worker_id)));
  check('Y a cada uno le llega su aviso en la campana',
    db.notifications.filter((n) => n.kind === 'aviso_asignado'
      && [WORKER.id, WORKER2.id].includes(n.user_id)).length === 2);

  // Quitar a uno es volver a mandar la lista sin él.
  await panelEquipo.locator('label:has-text("Pedro Navarro") input').uncheck();
  await page.waitForTimeout(900);
  check('Quitando la casilla, ese trabajador sale del aviso',
    db.ficha_workers.filter((x) => x.ficha_id === 'f-aviso').length === 1
    && db.ficha_workers[0].worker_id === WORKER.id);

  // Y se vuelve a poner, que es como se queda para el resto de la prueba.
  await panelEquipo.locator('label:has-text("Pedro Navarro") input').check();
  await page.waitForTimeout(900);
  check('Y volviéndola a marcar, vuelve a entrar',
    db.ficha_workers.filter((x) => x.ficha_id === 'f-aviso').length === 2);

  // ---------------- UNA VISITA NO SE REPARTE -------------------------
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/f-visita`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  check('Una visita NO tiene panel de trabajadores: la lleva administración',
    await page.locator('.panel:has(h2:has-text("Trabajadores del aviso"))').count() === 0);

  const opcionesVisita = await page.locator('#assign option').allInnerTexts();
  check('Y su responsable solo puede ser administración',
    !opcionesVisita.some((o) => o.includes('Juan Ortega'))
    && opcionesVisita.some((o) => o.includes('Salvi Plaza')),
    opcionesVisita.join(' | '));
  check('Se explica por qué, y qué hacer en su lugar',
    (await page.locator('.field:has(#assign)').innerText()).includes('créalo como aviso'));

  // ---------------- AL CREAR UNA VISITA, TAMPOCO ---------------------
  // La regla tiene que estar en los DOS sitios donde se asigna: la ficha
  // ya creada (arriba) y el formulario de ficha nueva (aquí).
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/nueva?tipo=visita`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);

  const nuevaVisita = await page.locator('#f-assigned option').allInnerTexts();
  check('Al crear una visita tampoco se ofrece ningún trabajador',
    !nuevaVisita.some((o) => o.includes('Juan Ortega'))
    && nuevaVisita.some((o) => o.includes('Salvi Plaza')),
    nuevaVisita.join(' | '));

  // CAMBIAR DE TIPO NO ARRASTRA EL RESPONSABLE.
  //
  // M2: el responsable solo existe en las VISITAS, así que al cambiar a
  // aviso el campo desaparece. Lo que hay que comprobar es que, además,
  // se LIMPIA: si no, la ficha se guardaría con un responsable que su
  // propio formulario ya no enseña, y nadie podría quitarlo.
  //
  // Antes esto se probaba al revés —poner un trabajador en un aviso y
  // pasar a visita—, pero eso ya no se puede hacer: el aviso no tiene
  // ese campo.
  await page.locator('#f-assigned').selectOption({ label: 'Salvi Plaza (administración)' });
  await page.waitForTimeout(400);
  check('En una visita se puede poner responsable de administración',
    (await page.locator('#f-assigned').inputValue()) !== '',
    await page.locator('#f-assigned').inputValue());

  await page.locator('.segmented button:has-text("Aviso")').click();
  await page.waitForTimeout(500);
  check('Al cambiar a aviso, el campo de responsable desaparece',
    (await page.locator('#f-assigned').count()) === 0);

  await page.locator('.segmented button:has-text("Visita")').click();
  await page.waitForTimeout(500);
  check('Y al volver a visita está sin asignar: el responsable se limpió',
    (await page.locator('#f-assigned').inputValue()) === '',
    await page.locator('#f-assigned').inputValue());

  // ---------------- EL CALENDARIO DE ADMINISTRACIÓN NO PIERDE NADA ---
  await page.goto(`http://localhost:${PORT}/#/admin/calendario`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);

  const leyendaAdmin = await page.locator('.cal-legend .cal-legend-item').allInnerTexts();
  check('El calendario de administración conserva sus siete categorías',
    leyendaAdmin.length === 7, leyendaAdmin.join(' | '));
  check('Incluidas las visitas, el material, las obras y los otros',
    ['Obras', 'Fabricación', 'Montaje', 'Material', 'Visita', 'Aviso', 'Otros']
      .every((x) => leyendaAdmin.some((l) => l.includes(x))),
    leyendaAdmin.join(' | '));

  // ===================================================================
  // EL TRABAJADOR · sus avisos junto con sus proyectos
  // ===================================================================
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(mctx, { db, getUser: () => WORKER, people });
  const m = await mctx.newPage();
  m.on('pageerror', (e) => errores.push(String(e)));

  await signIn(m, PORT, 'juan');
  await m.locator('.w-tabbar a:has-text("Trabajos")').click();
  await m.waitForTimeout(1400);

  const listado = limpio(await m.locator('.w-content').innerText());
  check('La pantalla se llama «Mis trabajos», no solo «Mis proyectos»',
    listado.includes('Mis trabajos'), listado.split('\n')[0]);
  check('Trae sus avisos y sus proyectos, cada cosa con su titular',
    listado.includes('Avisos de cliente') && listado.includes('Proyectos'));

  const avisosVistos = await m
    .locator('section.w-section:has(h2:has-text("Avisos")) .ot-card .plate')
    .allInnerTexts();
  check('Ve el aviso que le han repartido y el que tenía de antes',
    avisosVistos.length === 2
    && avisosVistos.includes(`AVI-${YEAR}-001`)
    && avisosVistos.includes(`AVI-${YEAR}-002`),
    avisosVistos.join(' | '));
  check('Y el de antes le llega sin tener fila en la tabla nueva: compatibilidad',
    !db.ficha_workers.some((x) => x.ficha_id === 'f-viejo'));
  check('No ve el aviso que no es suyo',
    !avisosVistos.includes(`AVI-${YEAR}-003`), avisosVistos.join(' | '));
  check('Ni ninguna visita',
    !listado.includes(`VIS-${YEAR}-001`) && !listado.includes('montacargas'));
  check('Y no se le escapa ningún importe en el listado',
    !listado.includes('€'), listado.replace(/\n/g, ' · ').slice(0, 200));

  // ---------------- DENTRO DEL AVISO ---------------------------------
  await m.locator(`.ot-card:has-text("AVI-${YEAR}-001")`).click();
  await m.waitForTimeout(1400);

  const dentro = limpio(await m.locator('.w-content').innerText());
  check('Dentro del aviso ve qué pasa y dónde',
    dentro.includes('Persiana metálica atascada') && dentro.includes('Sant Pau'));
  check('Y cuándo le toca', dentro.includes('Cuándo y dónde'));
  check('Ve con quién va',
    dentro.includes('Quién va a este aviso') && dentro.includes('Pedro Navarro'));
  check('Se le recuerda que apunte SUS horas',
    dentro.includes('tus') && dentro.includes('horas'));
  check('Tiene las fotografías y los comentarios del aviso',
    dentro.includes('Fotografías y documentos') && dentro.includes('Comentarios'));
  check('Y no ve ni un euro del aviso',
    !dentro.includes('€'), dentro.replace(/\n/g, ' · ').slice(0, 200));

  // ---------------- UN PARTE DESDE EL AVISO --------------------------
  await m.locator('a:has-text("Parte de trabajo")').click();
  await m.waitForTimeout(1400);

  check('El parte entra ya atado al aviso, sin elegirlo en ninguna lista',
    (await m.locator('#pt-origen').inputValue()) === 'a:f-aviso',
    await m.locator('#pt-origen').inputValue());
  const origen = limpio(await m.locator('.field:has(#pt-origen)').innerText());
  check('Y el selector pregunta de qué trabajo es, con sus dos grupos',
    origen.includes('De qué trabajo es'));
  const grupos = await m.locator('#pt-origen optgroup').evaluateAll(
    (ns) => ns.map((n) => n.getAttribute('label')));
  check('Un grupo para los proyectos y otro para los avisos',
    grupos.includes('Proyectos') && grupos.includes('Avisos de cliente'),
    grupos.join(' | '));

  await m.locator('button:has-text("Montaje")').click();
  await m.locator('#pt-done').fill('Desmontado el eje y cambiado el rodamiento.');
  await m.locator('#pt-hours').fill('3,5');
  await m.locator('button:has-text("Enviar")').click();
  await m.waitForTimeout(600);
  await m.locator('.modal button:has-text("Enviar")').click();
  await m.waitForTimeout(1400);

  const parte = db.work_reports[0];
  check('El parte se guarda colgado del aviso',
    parte?.ficha_id === 'f-aviso', `ficha_id=${parte?.ficha_id}`);
  check('Y sin proyecto: es de un aviso, no de los dos',
    parte?.project_id == null, `project_id=${parte?.project_id}`);
  check('Con sus horas reales y su tipo de trabajo',
    Number(parte?.hours) === 3.5 && parte?.work_type === 'montaje' && parte?.status === 'enviado',
    `${parte?.hours} h · ${parte?.work_type} · ${parte?.status}`);

  // ---------------- EL CALENDARIO DEL TRABAJADOR ---------------------
  await m.locator('.w-tabbar a:has-text("Calendario")').click();
  await m.waitForTimeout(1600);

  const leyenda = await m.locator('.cal-legend .cal-legend-item').allInnerTexts();
  check('Su calendario se queda en fabricación, montaje y avisos',
    leyenda.length === 3, leyenda.join(' | '));
  check('Y son esos tres, no otros',
    ['Fabricación', 'Montaje', 'Aviso'].every((x) => leyenda.some((l) => l.includes(x))),
    leyenda.join(' | '));
  check('No se le ofrecen las visitas, que son de administración',
    !leyenda.some((l) => l.includes('Visita')), leyenda.join(' | '));
  check('Ni el material, ni las obras, ni los otros',
    !leyenda.some((l) => /Material|Obras|Otros/.test(l)), leyenda.join(' | '));

  // Y lo que importa de verdad: que una visita que TIENE asignada de
  // antes no se le pinta. Esto vigila el filtro de los EVENTOS, no el de
  // la leyenda: son dos cosas distintas y las dos tienen que estar.
  const calendario = limpio(await m.locator('.w-content').innerText());
  check('Una visita que tiene asignada de antes NO se le pinta en el calendario',
    !calendario.includes(`VIS-${YEAR}-002`) && !calendario.includes('Visita antigua'),
    calendario.replace(/\n/g, ' · ').slice(0, 260));
  check('Pero su aviso sí sale, que es su trabajo',
    calendario.includes(`AVI-${YEAR}-001`) || calendario.includes('Persiana'),
    calendario.replace(/\n/g, ' · ').slice(0, 260));

  // ===================================================================
  // ADMINISTRACIÓN · el parte del aviso no es un parte suelto
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/partes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await page.locator('.tabs button:has-text("Sin proyecto")').click();
  await page.waitForTimeout(1200);

  const sinProyecto = limpio(await page.locator('.page-body, main').first().innerText());
  check('El parte de un aviso NO sale como «parte suelto»: ya tiene dueño',
    !sinProyecto.includes(parte.code), sinProyecto.replace(/\n/g, ' · ').slice(0, 220));

  await page.goto(`http://localhost:${PORT}/#/admin/partes/${parte.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);

  const ficheDetalle = limpio(await page.locator('main').innerText());
  check('Administración ve de qué aviso es el parte',
    ficheDetalle.includes('Aviso de cliente') && ficheDetalle.includes(`AVI-${YEAR}-001`),
    ficheDetalle.replace(/\n/g, ' · ').slice(0, 240));
  check('Y no se le pide ponerle un proyecto, porque ya tiene dueño',
    !ficheDetalle.includes('Este parte no tiene proyecto'));

  check('Ninguna pantalla ha dado un error de programación',
    errores.length === 0, errores.join(' · '));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

process.exit(report() ? 1 : 0);
