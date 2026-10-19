/**
 * METALPLAFER360 · PRODUCTOS DEL PROYECTO Y PROVEEDORES · EN NAVEGADOR REAL
 *
 *   npm run test:mejoras
 *
 * Comprueba, pulsando lo que pulsa una persona:
 *
 *   · que un proyecto puede tener VARIAS piezas, cada una con sus
 *     medidas y su acabado, y que se pueden añadir, reordenar y quitar;
 *   · que NO se puede quedar sin ninguna;
 *   · que un proyecto ANTIGUO —de los que solo tenían un producto— sale
 *     relleno con lo que ya tenía y lo dice, en lugar de en blanco;
 *   · que el trabajador ve TODAS las piezas en su móvil, no solo la
 *     primera;
 *   · que un proveedor no se da de alta dos veces aunque se escriba con
 *     otra puntuación, y que la pantalla lo explica;
 *   · que los proveedores se dan de BAJA, no se borran;
 *   · que al pedir material se proponen los proveedores habituales de
 *     ESE material, y que se sigue pudiendo escribir uno a mano;
 *   · que un trabajador NO llega a la pantalla de proveedores.
 *
 * Las reglas de verdad se prueban contra PostgreSQL en
 * tests/sql/96_tests_proveedores.sql. Aquí se comprueba la PANTALLA.
 */
import {
  ADMIN, WORKER, YEAR, buildApp, createChecker, createDb,
  launchBrowser, serveApp, signIn, stubSupabase,
} from './fake-supabase.mjs';

const PORT = 4198;

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();
const limpio = (s) => s.replace(/ /g, ' ');

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: null, address: 'Carrer de la Indústria, 12', city: 'Sabadell',
      postal_code: '08202', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  projects: [
    // UN PROYECTO ANTIGUO: tiene su descripción, sus medidas y su
    // acabado en sus propias columnas, y NINGUNA fila de producto. Es
    // exactamente lo que hay hoy en producción.
    { id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1', contact_id: null,
      source_ficha_id: null, name: 'Barandilla de la escalera',
      description: 'Tres tramos de barandilla.', measures: '3 tramos · 3,20 m',
      finish: 'Negro forja',
      location: 'Escalera', address: 'Rambla, 45', observations: null,
      budget_amount: 12000, advance_amount: null,
      budget_hours_fab: 20, budget_hours_mont: 10,
      phase: 'fabricacion', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: false,
      fab_start: null, fab_end: null, mont_start: null, mont_end: null,
      fab_workers: 1, mont_workers: 1, fab_manual: false, mont_manual: false, autoplan: true,
      work_id: null, invoiced_amount: null, invoiced_on: null,
      created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z' },
    // UN SEGUNDO PROYECTO, en la misma fase y SIN el subestado por el que
    // se va a filtrar. Es lo que hace que el filtro signifique algo: con
    // un solo proyecto, filtrar y no filtrar darían lo mismo y la prueba
    // pasaría sin comprobar nada.
    { id: 'p2', code: `PROY-${YEAR}-002`, client_id: 'c1', contact_id: null,
      source_ficha_id: null, name: 'Reja del patio',
      description: 'Una reja.', measures: '1 ud', finish: 'Galvanizado',
      location: 'Patio', address: 'Rambla, 45', observations: null,
      budget_amount: 900, advance_amount: null,
      budget_hours_fab: 6, budget_hours_mont: 2,
      phase: 'fabricacion', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: false,
      fab_start: null, fab_end: null, mont_start: null, mont_end: null,
      fab_workers: 1, mont_workers: 1, fab_manual: false, mont_manual: false, autoplan: true,
      work_id: null, invoiced_amount: null, invoiced_on: null,
      created_at: '2026-05-03T09:00:00Z', updated_at: '2026-05-03T09:00:00Z' },
    // UN TERCERO, en MONTAJE. Sin él, cambiar de fase a Montaje daría
    // cero proyectos con filtro y sin filtro, y la comprobación de que
    // el subestado se suelta pasaría sin comprobar nada.
    { id: 'p3', code: `PROY-${YEAR}-003`, client_id: 'c1', contact_id: null,
      source_ficha_id: null, name: 'Puerta del garaje',
      description: 'Una puerta.', measures: '1 ud', finish: 'Lacado blanco',
      location: 'Garaje', address: 'Rambla, 45', observations: null,
      budget_amount: 1500, advance_amount: null,
      budget_hours_fab: 8, budget_hours_mont: 4,
      phase: 'montaje', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: false,
      fab_start: null, fab_end: null, mont_start: null, mont_end: null,
      fab_workers: 1, mont_workers: 1, fab_manual: false, mont_manual: false, autoplan: true,
      work_id: null, invoiced_amount: null, invoiced_on: null,
      created_at: '2026-05-04T09:00:00Z', updated_at: '2026-05-04T09:00:00Z' },
  ],
  project_workers: [
    { project_id: 'p1', worker_id: WORKER.id, assigned_at: '2026-05-05T09:00:00Z',
      assigned_by: ADMIN.id, is_demo: false },
  ],
  counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 3, OT: 0, PT: 0, OBRA: 0 },
});

/** Ana no está asignada a nada: es la que NO debe salir al mencionar. */
const ANA = {
  ...WORKER, id: '44444444-4444-4444-8444-444444444444',
  full_name: 'Ana Ferrer', username: 'ana', email: 'ana@metalplafer.com',
};

const people = [ADMIN, WORKER, ANA];
const browser = await launchBrowser();

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db, getUser: () => ADMIN, people });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));

  await signIn(page, PORT, 'salvi');

  // ===================================================================
  // EL PANEL AVISA DE LO QUE ESTÁ PENDIENTE DE PAGA Y SEÑAL
  //
  // Un presupuesto aceptado por el cliente y sin cobrar la señal no sale
  // en «esperando respuesta» y todavía no es un proyecto. Sin este aviso
  // no saldría por ningún lado y se quedaría olvidado.
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const panelAntes = limpio(await page.locator('main').innerText());
  check('Sin ninguno pendiente de señal, el panel no lo menciona',
    !panelAntes.includes('pendientes de paga y señal'),
    panelAntes.split('\n').filter((l) => l.includes('señal')).join(' | ') || 'no sale');

  db.fichas.push({
    id: 'fps', code: `PRES-${YEAR}-900`, type: 'presupuesto', client_id: 'c1',
    contact_id: null, title: 'Presupuesto cobrado a medias', description: null,
    status: 'pendiente_senal', assigned_to: null, amount: 3200,
    address: null, phone: null, email: null, hours: null,
    scheduled_date: null, scheduled_time: null,
    archived_at: null, is_demo: false,
    created_at: '2026-05-05T09:00:00Z', updated_at: '2026-05-05T09:00:00Z',
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const panelDespues = limpio(await page.locator('main').innerText());
  check('Con uno pendiente de señal, el panel lo avisa',
    panelDespues.includes('pendientes de paga y señal'),
    panelDespues.split('\n').filter((l) => l.includes('señal')).join(' | ') || 'no sale');
  check('Y NO lo cuenta como «enviado esperando respuesta»',
    !/1\s+presupuestos enviados/.test(panelDespues.replace(/\s+/g, ' '))
    || panelDespues.includes('pendientes de paga y señal'),
    panelDespues.replace(/\s+/g, ' ').match(/\d+ presupuestos [a-zé ]+/g)?.join(' | ') ?? '');

  // ===================================================================
  // UN PROYECTO ANTIGUO SALE RELLENO, NO EN BLANCO
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const fabrica = limpio(await page.locator('.panel:has-text("Qué se fabrica")').innerText());
  check('Un proyecto antiguo enseña lo que ya tenía como un producto',
    fabrica.includes('3 tramos · 3,20 m') && fabrica.includes('Negro forja'),
    fabrica.replace(/\n/g, ' | '));
  check('Y dice que se creó cuando solo se podía anotar uno',
    fabrica.includes('solo se podía anotar un producto'), fabrica.replace(/\n/g, ' | '));

  // ===================================================================
  // VARIAS PIEZAS EN UN MISMO PROYECTO
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1/editar`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  check('Al editarlo, el producto sale con lo que ya tenía',
    (await page.locator('#pp-measures-0').inputValue()) === '3 tramos · 3,20 m',
    await page.locator('#pp-measures-0').inputValue());

  check('Con un solo producto no se ofrece quitarlo',
    (await page.locator('button[aria-label="Quitar el producto 1"]').count()) === 0);

  await page.locator('button:has-text("Añadir otro producto")').click();
  await page.waitForTimeout(300);

  check('Se puede añadir una segunda pieza',
    (await page.locator('#pp-name-1').count()) === 1);
  check('Y entonces sí se puede quitar cualquiera de las dos',
    (await page.locator('button[aria-label="Quitar el producto 1"]').count()) === 1
    && (await page.locator('button[aria-label="Quitar el producto 2"]').count()) === 1);

  await page.locator('#pp-name-0').fill('Barandilla de escalera');
  await page.locator('#pp-name-1').fill('Rejas de ventana');
  await page.locator('#pp-measures-1').fill('4 ud · 1,20 × 1,40 m');
  await page.locator('#pp-finish-1').fill('Galvanizado');

  await page.locator('button:has-text("Guardar")').first().click();
  await page.waitForTimeout(1500);

  check('Las dos piezas se guardan',
    db.project_products.filter((x) => x.project_id === 'p1').length === 2,
    JSON.stringify(db.project_products.map((x) => x.name)));

  check('Y en el orden en que se pusieron',
    db.project_products.find((x) => x.posicion === 1)?.name === 'Barandilla de escalera'
    && db.project_products.find((x) => x.posicion === 2)?.name === 'Rejas de ventana',
    JSON.stringify(db.project_products.map((x) => `${x.posicion}:${x.name}`)));

  // LO QUE IMPORTA DE VERDAD: el proyecto se queda con los datos del
  // PRIMER producto, porque es por donde lee el móvil del trabajador.
  const pr = db.projects.find((x) => x.id === 'p1');
  check('El proyecto conserva los datos de la primera pieza',
    pr.measures === '3 tramos · 3,20 m' && pr.finish === 'Negro forja',
    `${pr.measures} · ${pr.finish}`);
  check('Y su nombre NO se toca: es el título del proyecto',
    pr.name === 'Barandilla de la escalera', pr.name);

  const dos = limpio(await page.locator('.panel:has-text("Qué se fabrica")').innerText());
  check('La ficha enseña las dos piezas con su nombre',
    dos.includes('Barandilla de escalera') && dos.includes('Rejas de ventana'),
    dos.replace(/\n/g, ' | '));
  check('Y ya no dice que venga de cuando solo había un producto',
    !dos.includes('solo se podía anotar un producto'), dos.replace(/\n/g, ' | '));

  // ------------- REORDENAR CAMBIA LO QUE VE EL TRABAJADOR -------------
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1/editar`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('button[aria-label="Subir el producto 2"]').click();
  await page.waitForTimeout(300);

  check('Subir una pieza la pone primera en el formulario',
    (await page.locator('#pp-name-0').inputValue()) === 'Rejas de ventana',
    await page.locator('#pp-name-0').inputValue());

  await page.locator('button:has-text("Guardar")').first().click();
  await page.waitForTimeout(1500);

  const pr2 = db.projects.find((x) => x.id === 'p1');
  check('Y al guardar, el proyecto pasa a llevar los datos de la nueva primera',
    pr2.measures === '4 ud · 1,20 × 1,40 m' && pr2.finish === 'Galvanizado',
    `${pr2.measures} · ${pr2.finish}`);

  // ------------- NO SE PUEDE QUEDAR SIN NINGUNA -------------
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1/editar`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('button[aria-label="Quitar el producto 2"]').click();
  await page.waitForTimeout(200);
  await page.locator('#pp-name-0').fill('');
  await page.locator('#pp-desc-0').fill('');
  await page.locator('#pp-measures-0').fill('');
  await page.locator('#pp-finish-0').fill('');
  await page.locator('button:has-text("Guardar")').first().click();
  await page.waitForTimeout(800);

  check('Vaciar los productos de un proyecto que ya los tiene no se guarda, y se explica',
    limpio(await page.locator('.alert-danger').innerText())
      .includes('ya tiene productos guardados'),
    await page.locator('.alert-danger').innerText());
  check('Y las piezas que había siguen guardadas',
    db.project_products.filter((x) => x.project_id === 'p1').length === 2,
    JSON.stringify(db.project_products.map((x) => x.name)));

  // LO QUE DE VERDAD PROTEGE EL AVISO DE LA PANTALLA: que no se guarde
  // el proyecto antes de que fallen los productos. Si se enviara, el
  // proyecto se quedaría CON LAS MEDIDAS BORRADAS y los productos
  // intactos: administración vería una cosa y el trabajador otra.
  const prTrasFallo = db.projects.find((x) => x.id === 'p1');
  check('Y el proyecto no se queda con los datos borrados a medias',
    prTrasFallo.measures === '4 ud · 1,20 × 1,40 m'
    && prTrasFallo.finish === 'Galvanizado',
    `${prTrasFallo.measures} · ${prTrasFallo.finish}`);

  // ===================================================================
  // UN PROYECTO NUEVO SIN PRODUCTOS SE SIGUE PUDIENDO CREAR
  //
  // Es lo que se podía hacer antes de que existieran los productos: a
  // veces solo se sabe el nombre del trabajo. Si esto fallara, habríamos
  // puesto una traba donde no la había.
  // ===================================================================
  // Se RECARGA a propósito. Viniendo de la pantalla de edición, el
  // formulario conserva el cliente del proyecto anterior y entonces el
  // buscador de clientes no se enseña, porque ya hay uno elegido.
  // Recargando se empieza de cero, que es lo que hace una persona.
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/nuevo`,
    { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('#p-name').fill('Trabajo del que solo sabemos el nombre');
  await page.locator('#cp-name').fill('García');
  await page.waitForTimeout(900);
  await page.locator('.suggest-box button:has-text("García Construcciones SL")').click();
  await page.waitForTimeout(500);
  const proyectosAntes = db.projects.length;
  await page.locator('button:has-text("Crear proyecto")').click();
  await page.waitForTimeout(1500);

  check('Un proyecto nuevo sin productos se sigue pudiendo crear',
    db.projects.length === proyectosAntes + 1,
    `${proyectosAntes} → ${db.projects.length} · `
      + (await page.locator('.alert-danger').count()
        ? await page.locator('.alert-danger').innerText() : 'sin error'));

  check('Y no se le guarda ningún producto: enseñará sus propias columnas',
    db.project_products.filter((x) => x.project_id === db.projects.at(-1).id).length === 0,
    JSON.stringify(db.project_products.map((x) => x.project_id)));

  // ===================================================================
  // FILTRAR PROYECTOS POR SUBESTADO
  //
  // Es la pregunta de todos los días: «¿qué hay esperando material?».
  // Antes había que abrir los proyectos uno a uno.
  // ===================================================================
  db.project_substatuses.push(
    { project_id: 'p1', phase: 'fabricacion', substatus: 'falta_material' });

  await page.goto(`http://localhost:${PORT}/#/admin/proyectos`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Los tres del juego de pruebas más el que se acaba de crear.
  check('Sin filtrar se ven los cuatro proyectos',
    (await page.locator('.table tbody tr').count()) === 4,
    String(await page.locator('.table tbody tr').count()));

  await page.locator('#project-substatus').selectOption('falta_material');
  await page.waitForTimeout(1200);
  // LO QUE IMPORTA: que DESCARTE el otro. Que salga uno no basta: con un
  // solo proyecto saldría uno igualmente sin filtrar nada.
  check('Filtrar por «Falta material» deja solo el proyecto que lo tiene',
    (await page.locator('.table tbody tr').count()) === 1,
    String(await page.locator('.table tbody tr').count()));
  check('Y es el que lo tiene, no el otro',
    limpio(await page.locator('.table tbody').innerText()).includes('Barandilla')
    && !limpio(await page.locator('.table tbody').innerText()).includes('Reja del patio'),
    limpio(await page.locator('.table tbody').innerText()).replace(/\n/g, ' | '));

  await page.locator('#project-substatus').selectOption('lacado_zincado');
  await page.waitForTimeout(1200);
  check('Y por un subestado que nadie tiene no devuelve nada, y lo explica',
    limpio(await page.locator('.empty').innerText()).includes('Lacado-Zincado'),
    await page.locator('.empty').innerText());

  // «Falta material» está en Fabricación Y en Montaje. Viendo todas las
  // fases tiene que ofrecerse UNA sola vez: si se listara por fase
  // aparecería dos veces con el mismo valor.
  check('Un subestado que está en dos fases se ofrece una sola vez',
    (await page.locator('#project-substatus option[value="falta_material"]').count()) === 1,
    String(await page.locator('#project-substatus option[value="falta_material"]').count()));
  check('Y se dice de qué dos fases es',
    limpio(await page.locator('#project-substatus option[value="falta_material"]').innerText())
      .includes('Fabricación y Montaje'),
    await page.locator('#project-substatus option[value="falta_material"]').innerText());

  // LO QUE NO PUEDE PASAR: que cambiar de fase deje puesto un subestado
  // que esa fase NO tiene. La lista saldría vacía y nadie sabría por qué.
  // «Lacado-Zincado» es solo de Fabricación, así que al pasar a Montaje
  // tiene que soltarse.
  await page.locator('#project-substatus').selectOption('lacado_zincado');
  await page.waitForTimeout(800);
  await page.locator('.chip:has-text("Montaje")').first().click();
  await page.waitForTimeout(1200);
  check('Y el selector ya solo ofrece los subestados de esa fase',
    (await page.locator('#project-substatus option[value="lacado_zincado"]').count()) === 0
    && (await page.locator('#project-substatus option[value="en_montaje"]').count()) === 1);
  // LO QUE DE VERDAD HACE DAÑO: que el filtro SIGA aplicándose con un
  // subestado que el selector ya no enseña. La lista saldría recortada y
  // nadie sabría por qué, porque el filtro estaría invisible. Se
  // comprueba enseñando que el proyecto de Montaje SÍ sale.
  check('Y el filtro ya no se aplica con un subestado que no se ve',
    (await page.locator('.table tbody tr').count()) === 1
    && limpio(await page.locator('.table tbody').innerText()).includes('Puerta del garaje'),
    `${await page.locator('.table tbody tr').count()} filas · `
      + limpio(await page.locator('.panel-body').last().innerText())
        .slice(0, 120).replace(/\n/g, ' | '));

  // Pero uno que la fase nueva SÍ tiene se queda puesto: es una pregunta
  // legítima, y perderlo obligaría a volver a elegirlo.
  await page.locator('.chip:has-text("Fabricación")').first().click();
  await page.waitForTimeout(800);
  await page.locator('#project-substatus').selectOption('falta_material');
  await page.waitForTimeout(800);
  await page.locator('.chip:has-text("Montaje")').first().click();
  await page.waitForTimeout(1200);
  check('Un subestado que la fase nueva sí tiene se conserva',
    (await page.locator('#project-substatus').inputValue()) === 'falta_material',
    await page.locator('#project-substatus').inputValue());

  await page.locator('.chip:has-text("En curso")').first().click();
  await page.waitForTimeout(800);

  // ===================================================================
  // PROVEEDORES
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/proveedores`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  check('La pantalla de proveedores explica que no se borran',
    limpio(await page.locator('.alert').first().innerText()).includes('se dan de baja'));

  await page.locator('button:has-text("Nuevo proveedor")').click();
  await page.waitForTimeout(400);
  await page.locator('#pv-name').fill('Aceros Vallès, S.L.');
  await page.locator('#pv-phone').fill('937112233');
  await page.locator('#pv-email').fill('Compras@AcerosValles.com');
  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(1200);

  check('El proveedor se da de alta', db.suppliers.length === 1,
    JSON.stringify(db.suppliers.map((s) => s.name)));
  check('Y el correo se guarda en minúsculas',
    db.suppliers[0]?.email === 'compras@acerosvalles.com', String(db.suppliers[0]?.email));

  // LA COMPROBACIÓN QUE IMPORTA: el mismo escrito de otra manera.
  await page.locator('button:has-text("Nuevo proveedor")').click();
  await page.waitForTimeout(400);
  await page.locator('#pv-name').fill('ACEROS VALLES SL');
  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(1200);

  check('Escrito de otra manera NO se duplica', db.suppliers.length === 1,
    JSON.stringify(db.suppliers.map((s) => s.name)));
  check('Y la pantalla lo dice en lugar de fingir que lo ha creado',
    limpio(await page.locator('.toast').last().innerText()).includes('Ya estaba en la lista'),
    (await page.locator('.toast').allInnerTexts()).join(' | '));

  // ------------- DE BAJA, NO BORRADO -------------
  await page.locator('button[aria-label^="Dar de baja"]').first().click();
  await page.waitForTimeout(400);
  await page.locator('.modal-foot button:has-text("Dar de baja")').click();
  await page.waitForTimeout(1000);

  check('Dar de baja no borra el proveedor', db.suppliers.length === 1);
  check('Solo lo deja inactivo', db.suppliers[0]?.active === false,
    String(db.suppliers[0]?.active));

  await page.locator('button:has-text("Ver el dado de baja")').click();
  await page.waitForTimeout(400);
  const baja = limpio(await page.locator('.table').innerText());
  check('Y se puede volver a ver, marcado como de baja',
    baja.includes('De baja') && baja.includes('Aceros Vallès'), baja.replace(/\n/g, ' | '));

  await page.locator('button[aria-label^="Reactivar"]').first().click();
  await page.waitForTimeout(400);
  await page.locator('.modal-foot button:has-text("Reactivar")').click();
  await page.waitForTimeout(1000);
  check('Se puede reactivar', db.suppliers[0]?.active === true);

  // ===================================================================
  // EL PROVEEDOR AL PEDIR MATERIAL
  // ===================================================================
  db.material_suppliers.push({
    material_norm: 'tubo 30x30 e2', material_name: 'Tubo 30x30 e2',
    supplier_id: db.suppliers[0].id, added_at: new Date().toISOString(), added_by: ADMIN.id,
  });

  await page.goto(`http://localhost:${PORT}/#/admin/material`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('button:has-text("Nuevo material")').first().click();
  await page.waitForTimeout(500);

  // El material siempre es de un proyecto: en la pantalla global hay
  // que decir de cuál.
  await page.locator('#mat-project').selectOption('p1');
  await page.locator('#mat-name').fill('Tubo 30x30 e2');
  await page.waitForTimeout(700);
  await page.locator('#mat-supplier').click();
  await page.waitForTimeout(700);

  check('Al pedir material se abre la caja de proveedores',
    (await page.locator('.suggest-box').count()) === 1);
  // El GRUPO de habituales tiene que existir: si el selector dejara de
  // distinguirlos, el proveedor saldría en la lista general y la
  // sugerencia perdería todo su valor.
  check('Y trae un grupo de habituales de ESE material',
    (await page.locator('.suggest-box .title:has-text("Habituales de")').count()) === 1,
    (await page.locator('.suggest-box .title').allInnerTexts()).join(' | '));
  const caja = limpio(await page.locator('.suggest-box').innerText());
  check('Con el proveedor habitual dentro',
    caja.includes('Aceros Vallès'), caja.replace(/\n/g, ' | '));

  await page.locator('.suggest-box button:has-text("Aceros Vallès")').click();
  await page.waitForTimeout(400);
  check('Al elegirlo, la pantalla dice que viene de la lista',
    limpio(await page.locator('.suggest').innerText()).includes('De la lista de proveedores'),
    await page.locator('.suggest').innerText());

  // Y se sigue pudiendo escribir uno a mano, que es lo de siempre.
  await page.locator('#mat-supplier').fill('Un proveedor de paso');
  await page.waitForTimeout(400);
  check('Escribir a mano suelta el vínculo con la lista',
    (await page.locator('.suggest:has-text("De la lista de proveedores")').count()) === 0);

  // Y se vuelve a ELEGIR de la lista, no a teclear: teclear deja solo el
  // texto, que es lo que se acaba de comprobar.
  await page.locator('#mat-supplier').fill('');
  await page.waitForTimeout(600);
  await page.locator('.suggest-box button:has-text("Aceros Vallès")').click();
  await page.waitForTimeout(400);
  check('Volver a elegirlo de la lista restablece el vínculo',
    limpio(await page.locator('.suggest').innerText()).includes('De la lista de proveedores'),
    await page.locator('.suggest').innerText());

  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(1200);

  check('El material se guarda con su proveedor en texto',
    db.materials.some((m) => m.supplier === 'Aceros Vallès, S.L.'),
    JSON.stringify(db.materials.map((m) => m.supplier)));
  // Y CON EL VÍNCULO. Solo el texto dejaría el material sin proveedor de
  // la lista, que es justo lo que se estaba añadiendo.
  check('Y con el vínculo al proveedor de la lista',
    db.materials.some((m) => m.supplier_id === db.suppliers[0].id),
    JSON.stringify(db.materials.map((m) => m.supplier_id)));

  // ===================================================================
  // MENCIONAR A ALGUIEN CON @
  // ===================================================================
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const comentarios = page.locator('.panel:has(h2:has-text("Comentarios"))');
  await comentarios.locator('#comment-box').fill('Hola @');
  await page.waitForTimeout(700);

  check('Escribir @ ofrece a quién avisar',
    (await page.locator('.suggest-box[aria-label="A quién avisar"]').count()) === 1,
    await comentarios.innerText());

  const ofrecidos = limpio(await page.locator('.suggest-box[aria-label="A quién avisar"]').innerText());
  check('Y ofrece a quien está asignado al proyecto',
    ofrecidos.includes('Juan Ortega'), ofrecidos.replace(/\n/g, ' | '));
  check('Pero no a quien no tiene nada que ver con el proyecto',
    !ofrecidos.includes('Ana Ferrer'), ofrecidos.replace(/\n/g, ' | '));

  await page.locator('.suggest-box[aria-label="A quién avisar"] button:has-text("Juan Ortega")')
    .click();
  await page.waitForTimeout(400);

  check('Al elegirlo se escribe su nombre en el texto, legible',
    (await comentarios.locator('#comment-box').inputValue()).includes('@Juan Ortega'),
    await comentarios.locator('#comment-box').inputValue());
  check('Y la pantalla dice a quién se va a avisar',
    limpio(await comentarios.innerText()).includes('Se avisará a'),
    limpio(await comentarios.innerText()).replace(/\n/g, ' | '));

  await comentarios.locator('#comment-box').fill(
    (await comentarios.locator('#comment-box').inputValue())
    + ' ¿puedes mirar las medidas del tramo de arriba?');
  await comentarios.locator('button:has-text("Enviar")').click();
  await page.waitForTimeout(1500);

  const guardado = db.comments.at(-1);
  check('El comentario se guarda con el @ dentro del texto',
    guardado?.body?.includes('@Juan Ortega'), String(guardado?.body));
  check('Y la mención se guarda aparte, para saber a quién avisar',
    db.comment_mentions.some(
      (m) => m.comment_id === guardado.id && m.user_id === WORKER.id),
    JSON.stringify(db.comment_mentions));
  check('Al mencionado le llega un aviso que dice quién le ha mencionado',
    db.notifications.some(
      (n) => n.user_id === WORKER.id && n.title.includes('te ha mencionado')),
    JSON.stringify(db.notifications.filter((n) => n.user_id === WORKER.id).map((n) => n.title)));

  // MENCIONAR EN MEDIO DE UNA FRASE YA ESCRITA.
  //
  // Es el caso que falla si el buscador del «@» mira hasta el final del
  // texto en lugar de hasta el cursor: el resto de la frase no coincide
  // con ningún nombre y no se ofrece a nadie. Pasaba, y por eso está
  // aquí esta prueba.
  await comentarios.locator('#comment-box').fill('Antes de empezar, que lo mire , por favor.');
  await page.waitForTimeout(300);
  // El cursor se coloca justo antes de « , por favor.» y se escribe el @.
  await comentarios.locator('#comment-box').click();
  await page.evaluate(() => {
    const c = document.querySelector('#comment-box');
    const i = c.value.indexOf(' , por favor.');
    c.setSelectionRange(i, i);
  });
  await comentarios.locator('#comment-box').type('@Juan');
  await page.waitForTimeout(800);

  check('Escribiendo @ EN MEDIO de una frase también se ofrece a quién avisar',
    (await page.locator('.suggest-box[aria-label="A quién avisar"]').count()) === 1,
    await comentarios.locator('#comment-box').inputValue());

  await page.locator('.suggest-box[aria-label="A quién avisar"] button:has-text("Juan Ortega")')
    .click();
  await page.waitForTimeout(400);
  const enMedio = await comentarios.locator('#comment-box').inputValue();
  check('Y al elegirlo se respeta lo que había escrito después',
    enMedio.includes('@Juan Ortega') && enMedio.includes('por favor.')
    && !enMedio.includes('@Juan,'),
    enMedio);

  // Un comentario SIN mención no guarda ninguna: el camino de siempre.
  const mencionesAntes = db.comment_mentions.length;
  await comentarios.locator('#comment-box').fill('Un comentario normal, sin avisar a nadie.');
  await page.waitForTimeout(400);
  check('Sin @, la pantalla no dice que vaya a avisar a nadie',
    !limpio(await comentarios.innerText()).includes('Se avisará a'));
  await comentarios.locator('button:has-text("Enviar")').click();
  await page.waitForTimeout(1500);
  check('Y no guarda ninguna mención',
    db.comment_mentions.length === mencionesAntes, String(db.comment_mentions.length));
  check('Pero el comentario sí se guarda',
    db.comments.at(-1)?.body === 'Un comentario normal, sin avisar a nadie.',
    String(db.comments.at(-1)?.body));

  // ===================================================================
  // UN TRABAJADOR
  // ===================================================================
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(mctx, { db, getUser: () => WORKER, people });
  const m = await mctx.newPage();
  const erroresM = [];
  m.on('pageerror', (e) => erroresM.push(String(e)));

  await signIn(m, PORT, 'juan');
  await m.goto(`http://localhost:${PORT}/#/t/proyectos/p1`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(1200);

  const trabajo = limpio(await m.locator('.w-block:has(h3:has-text("El trabajo"))').innerText());
  check('El trabajador ve TODAS las piezas, no solo la primera',
    trabajo.includes('Rejas de ventana') && trabajo.includes('Barandilla de escalera'),
    trabajo.replace(/\n/g, ' | '));
  check('Y se le dice cuántas son',
    trabajo.includes('2 piezas'), trabajo.replace(/\n/g, ' | '));

  // NO ve los proveedores. No es que la pantalla lo esconda: la vista y
  // las políticas no le dan nada. Se prueba contra PostgreSQL en el
  // archivo 96; aquí se comprueba que no hay puerta de entrada.
  await m.goto(`http://localhost:${PORT}/#/admin/proveedores`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(900);
  check('Un trabajador no entra en la pantalla de proveedores',
    !m.url().includes('/admin/proveedores'), m.url());

  const menu = limpio(await m.locator('body').innerText());
  check('Ni le aparece en el menú', !menu.includes('Proveedores'),
    menu.slice(0, 160).replace(/\n/g, ' | '));

  check('Ninguna pantalla ha dado un error de programación',
    errores.length === 0 && erroresM.length === 0,
    [...errores, ...erroresM].join(' · '));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

process.exit(report() ? 1 : 0);
