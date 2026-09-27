/**
 * METALPLAFER360 · Recorrido de proyectos en un navegador real.
 *
 *   npm run test:fase3
 *
 * Comprueba que las PANTALLAS de proyectos funcionan de principio a fin:
 * crear un proyecto, convertir un presupuesto aceptado, recorrer las
 * fases, marcar varios subestados a la vez, «Sin montaje», documentos,
 * papelera, comentarios, historial y finalización a mano.
 *
 * Las reglas de verdad se prueban contra PostgreSQL en tests/sql.
 */
import {
  YEAR, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, stubSupabase,
} from './fake-supabase.mjs';

const PORT = 4181;

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: 'obras@garcia.es', address: 'Carrer de la Indústria, 12',
      city: 'Sabadell', postal_code: '08202', notes: null, active: true, archived_at: null,
      is_demo: false, created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  fichas: [
    { id: 'f1', code: `PRES-${YEAR}-001`, type: 'presupuesto', status: 'aceptado',
      client_id: 'c1', contact_id: null, title: 'Barandilla escalera comunitaria',
      description: 'Barandilla de acero para escalera de 4 plantas.',
      address: 'Rambla, 45 · Sabadell', phone: null, scheduled_date: null, scheduled_time: null,
      assigned_to: null, amount: 6400.5, archived_at: null, is_demo: false,
      created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-20T09:00:00Z' },
    { id: 'f2', code: `PRES-${YEAR}-002`, type: 'presupuesto', status: 'enviado',
      client_id: 'c1', contact_id: null, title: 'Reja ventana',
      description: null, address: null, phone: null, scheduled_date: null, scheduled_time: null,
      assigned_to: null, amount: 900, archived_at: null, is_demo: false,
      created_at: '2026-05-10T09:00:00Z', updated_at: '2026-05-10T09:00:00Z' },
  ],
  counters: { PRES: 2, VIS: 0, AVI: 0, PROY: 0 },
});

const browser = await launchBrowser();

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await signIn(page, PORT, 'salvi');

  // ================= CREAR UN PROYECTO DIRECTAMENTE =================
  await page.locator('.sidebar nav a:has-text("Proyectos")').click();
  await page.waitForTimeout(600);
  check('Se abre el listado de proyectos', page.url().includes('#/admin/proyectos'));
  check('Cuando no hay proyectos lo explica y dice cómo crear uno',
    (await page.locator('.empty').innerText()).includes('Nuevo proyecto'));

  await page.locator('a:has-text("Nuevo proyecto")').click();
  await page.waitForTimeout(500);
  check('El formulario anuncia el código que se asignará',
    (await page.locator('.page-head .sub').innerText()).includes(`PROY-${YEAR}-###`));

  await page.locator('button:has-text("Crear proyecto")').click();
  await page.waitForTimeout(400);
  check('Un proyecto sin cliente avisa de que hace falta uno',
    (await page.locator('.alert-danger').innerText()).includes('necesita siempre un cliente'));

  await page.locator('#cp-name').fill('García');
  await page.waitForTimeout(700);
  await page.locator('.suggest-box button:has-text("García Construcciones SL")').click();
  await page.waitForTimeout(400);

  await page.locator('button:has-text("Crear proyecto")').click();
  await page.waitForTimeout(400);
  check('Un proyecto sin nombre avisa de qué falta',
    (await page.locator('.alert-danger').innerText()).includes('Ponle un nombre'));

  await page.locator('#p-name').fill('Rejas ventanas planta baja');
  await page.locator('#p-desc').fill('Rejas fijas de pletina con barrotes cuadrados.');
  await page.locator('#p-measures').fill('4 ud · 1,20 × 1,40 m');
  await page.locator('#p-finish').fill('Negro forja');
  await page.locator('#p-location').fill('Fachada principal');
  await page.locator('#p-address').fill('Carrer de Calders, 9 · Castellar del Vallès');
  await page.locator('#p-observations').fill('No taladrar la piedra del zócalo.');
  await page.locator('#p-budget').fill('2.400');
  await page.locator('#p-advance').fill('800');
  await page.locator('#p-hours-fab').fill('18');
  await page.locator('#p-hours-mont').fill('6');

  await page.locator('#p-budget').fill('dos mil');
  await page.locator('button:has-text("Crear proyecto")').click();
  await page.waitForTimeout(400);
  check('Un importe mal escrito se explica con un ejemplo',
    (await page.locator('.alert-danger').innerText()).includes('2.400,50'));
  await page.locator('#p-budget').fill('2.400');

  await page.locator('button:has-text("Crear proyecto")').click();
  await page.waitForTimeout(800);

  check('El proyecto se crea con el código PROY-AAAA-001',
    (await page.locator('.plate').first().innerText()) === `PROY-${YEAR}-001`);
  check('Empieza en la fase «En preparación»',
    (await page.locator('.page-head').innerText()).includes('En preparación'));

  const datos = await page.locator('.panel:has-text("El trabajo")').innerText();
  check('Guarda producto, medidas, acabado, ubicación y observaciones',
    datos.includes('4 ud · 1,20 × 1,40 m') && datos.includes('Negro forja')
    && datos.includes('Fachada principal') && datos.includes('No taladrar'), datos.replace(/\n/g, ' · '));

  check('La dirección del proyecto se muestra junto a la del cliente, y son distintas',
    datos.includes('Carrer de Calders, 9') && datos.includes('Dirección del cliente: Carrer de la Indústria, 12'));

  const cifras = await page.locator('.panel:has-text("Presupuesto y horas")').innerText();
  check('Muestra presupuesto, anticipo y horas previstas en formato español',
    cifras.includes('2.400,00') && cifras.includes('800,00')
    && cifras.includes('18 h') && cifras.includes('6 h'), cifras.replace(/\n/g, ' · '));

  // ================= SUBESTADOS SIMULTÁNEOS =================
  check('La fase En preparación ofrece sus cuatro subestados',
    (await page.locator('.substatus-grid .chip').count()) === 4);
  check('Y dice que se pueden marcar varios',
    (await page.locator('.panel:has-text("Situación")').innerText()).includes('varios a la vez'));

  await page.locator('.substatus-grid .chip:has-text("Pendiente planos")').click();
  await page.waitForTimeout(500);
  await page.locator('.substatus-grid .chip:has-text("Pendiente material")').click();
  await page.waitForTimeout(600);
  check('Se pueden marcar dos subestados a la vez',
    (await page.locator('.substatus-grid .chip[aria-pressed="true"]').count()) === 2);

  await page.locator('.substatus-grid .chip:has-text("Pendiente planos")').click();
  await page.waitForTimeout(600);
  check('Y se pueden desmarcar',
    (await page.locator('.substatus-grid .chip[aria-pressed="true"]').count()) === 1);

  // ================= FASES =================
  check('La línea de fases muestra las cinco',
    (await page.locator('.rail-step').count()) === 5);
  check('«Finalizado» no se puede pulsar desde la línea de fases',
    await page.locator('.rail-step:has-text("Finalizado")').isDisabled());

  await page.locator('.rail-step:has-text("Fabricación")').click();
  await page.waitForTimeout(300);
  check('Cambiar de fase pide confirmación y avisa de los subestados',
    (await page.locator('.modal').innerText()).includes('subestados de la fase actual se borrarán'));
  await page.locator('.modal-foot button:has-text("Pasar a Fabricación")').click();
  await page.waitForTimeout(800);

  check('El proyecto pasa a Fabricación',
    (await page.locator('.page-head').innerText()).includes('Fabricación'));
  check('Los subestados de la fase anterior se limpian',
    (await page.locator('.substatus-grid .chip[aria-pressed="true"]').count()) === 0);
  check('Fabricación ofrece sus propios subestados',
    (await page.locator('.substatus-grid .chip').count()) === 3);

  // Sin montaje: no se puede saltar a Facturación sin marcarlo
  await page.locator('.rail-step:has-text("Facturación")').click();
  await page.waitForTimeout(300);
  await page.locator('.modal-foot button:has-text("Pasar a Facturación")').click();
  await page.waitForTimeout(700);
  const avisoSalto = await page.locator('.toast.error').innerText().catch(() => '');
  check('De Fabricación no se salta a Facturación sin «Sin montaje»',
    avisoSalto.includes('Sin montaje'), avisoSalto);
  check('Y el proyecto se queda donde estaba',
    (await page.locator('.page-head').innerText()).includes('Fabricación'));

  await page.locator('.rail-step:has-text("Montaje")').click();
  await page.waitForTimeout(300);
  await page.locator('.modal-foot button:has-text("Pasar a Montaje")').click();
  await page.waitForTimeout(800);
  check('De Fabricación se pasa a Montaje',
    (await page.locator('.page-head').innerText()).includes('Montaje'));
  check('Montaje ofrece sus tres subestados',
    (await page.locator('.substatus-grid .chip').count()) === 3);

  await page.locator('.rail-step:has-text("Facturación")').click();
  await page.waitForTimeout(300);
  await page.locator('.modal-foot button:has-text("Pasar a Facturación")').click();
  await page.waitForTimeout(800);
  check('De Montaje se pasa a Facturación',
    (await page.locator('.page-head').innerText()).includes('Facturación'));

  // ================= FACTURACIÓN Y FINALIZACIÓN =================
  const facturacion = await page.locator('.panel:has-text("Situación")').innerText();
  check('Facturación muestra sus cuatro estados',
    ['Por facturar', 'Pendiente de cobro', 'Cobrado parcialmente', 'Cobrado']
      .every((e) => facturacion.includes(e)), facturacion.replace(/\n/g, ' · '));

  check('El botón de finalizar está desactivado mientras no esté cobrado',
    await page.locator('button:has-text("Finalizar proyecto")').isDisabled());
  check('Y se explica por qué',
    facturacion.includes('Nunca se finaliza solo'));

  await page.locator('.status-flow button:has-text("Cobrado parcialmente")').click();
  await page.waitForTimeout(700);
  check('Se puede marcar «Cobrado parcialmente»',
    (await page.locator('.page-head').innerText()).includes('Cobrado parcialmente'));

  await page.locator('.status-flow button:has-text("Cobrado")').last().click();
  await page.waitForTimeout(800);
  check('Estar cobrado NO finaliza el proyecto solo',
    (await page.locator('.page-head').innerText()).includes('Facturación'));
  check('El sistema lo sugiere, sin hacerlo por su cuenta',
    (await page.locator('.alert-warn').innerText()).includes('Ya puedes finalizarlo'));

  await page.locator('.panel:has-text("Situación") button:has-text("Finalizar proyecto")').click();
  await page.waitForTimeout(300);
  check('Finalizar pide confirmación', (await page.locator('.modal').count()) === 1);
  await page.locator('.modal-foot button:has-text("Finalizar proyecto")').click();
  await page.waitForTimeout(800);

  check('El proyecto queda finalizado, con su fecha',
    (await page.locator('.alert-ok').innerText()).includes('Proyecto finalizado el'));
  check('Y ofrece reabrirlo por si fue un error',
    await page.locator('button:has-text("Reabrir")').isVisible());

  // ================= DOCUMENTOS Y COMENTARIOS =================
  check('El proyecto tiene su lista única de documentos',
    (await page.locator('.panel:has-text("Documentos, fotografías y vídeos")').innerText())
      .includes('todo en la misma lista'));
  check('No hay carpetas de documentos',
    (await page.locator('body').innerText()).toLowerCase().includes('carpeta') === false);

  await page.locator('#comment-box').fill('Acabado confirmado con el cliente: negro microtexturado.');
  await page.locator('button:has-text("Enviar")').click();
  await page.waitForTimeout(700);
  check('Se puede comentar en el proyecto',
    (await page.locator('.comment').innerText()).includes('negro microtexturado'));

  // ================= HISTORIAL =================
  const historial = await page.locator('.panel:has-text("Historial")').innerText();
  check('El historial recoge la creación del proyecto',
    historial.includes('creó el proyecto'), historial.split('\n')[2]);
  check('Y los cambios de fase, en castellano',
    historial.includes('de Fabricación → Montaje'));
  check('Y la finalización, con quién la hizo',
    historial.includes('Salvi Plaza finalizó el proyecto'));
  check('El historial avisa de que no se puede modificar',
    historial.includes('No se puede modificar'));

  // ================= CONVERTIR UN PRESUPUESTO =================
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/f2`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  check('Un presupuesto que no está aceptado no ofrece convertirse',
    (await page.locator('button:has-text("Convertir en proyecto")').count()) === 0);

  await page.goto(`http://localhost:${PORT}/#/admin/fichas/f1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  check('Un presupuesto aceptado ofrece convertirse en proyecto',
    await page.locator('button:has-text("Convertir en proyecto")').isVisible());

  await page.locator('button:has-text("Convertir en proyecto")').click();
  await page.waitForTimeout(300);
  check('La conversión pide confirmación y aclara que el presupuesto se conserva',
    (await page.locator('.modal').innerText()).includes('El presupuesto se conserva'));
  await page.locator('.modal-foot button:has-text("Crear el proyecto")').click();
  await page.waitForTimeout(900);

  check('Se abre el proyecto recién creado con el código siguiente',
    (await page.locator('.plate').first().innerText()) === `PROY-${YEAR}-002`);
  const convertido = await page.locator('.page-head').innerText();
  check('Hereda el nombre y el cliente del presupuesto',
    convertido.includes('Barandilla escalera comunitaria') && convertido.includes('García Construcciones SL'),
    convertido.replace(/\n/g, ' · '));
  const trabajo = await page.locator('.panel:has-text("El trabajo")').innerText();
  check('Deja constancia del presupuesto de origen',
    trabajo.includes('Viene de') && trabajo.includes(`PRES-${YEAR}-001`));
  check('Hereda el importe del presupuesto',
    (await page.locator('.panel:has-text("Presupuesto y horas")').innerText()).includes('6.400,50'));

  await page.goto(`http://localhost:${PORT}/#/admin/fichas/f1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('El presupuesto ya convertido muestra su proyecto en vez del botón',
    (await page.locator('.alert-ok').innerText()).includes(`ya es el proyecto PROY-${YEAR}-002`));
  check('Y no deja convertirlo otra vez',
    (await page.locator('button:has-text("Convertir en proyecto")').count()) === 0);

  // ================= SIN MONTAJE =================
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.locator('tbody tr:has-text("Barandilla escalera comunitaria")').click();
  await page.waitForTimeout(700);

  await page.locator('.rail-step:has-text("Fabricación")').click();
  await page.waitForTimeout(300);
  await page.locator('.modal-foot button:has-text("Pasar a Fabricación")').click();
  await page.waitForTimeout(800);

  // Se usa click (y no check) porque la casilla solo cambia tras confirmar.
  await page.locator('.checkbox:has-text("Sin montaje") input').click();
  await page.waitForTimeout(300);
  await page.locator('.modal-foot button:has-text("Marcar sin montaje")').click();
  await page.waitForTimeout(800);
  check('Se puede marcar un proyecto como «Sin montaje»',
    (await page.locator('.page-head').innerText()).includes('Sin montaje'));

  await page.locator('.rail-step:has-text("Montaje")').click();
  await page.waitForTimeout(300);
  await page.locator('.modal-foot button:has-text("Pasar a Montaje")').click();
  await page.waitForTimeout(700);
  check('Un proyecto «Sin montaje» no puede pasar a Montaje',
    (await page.locator('.toast.error').innerText()).includes('Sin montaje'));

  await page.locator('.rail-step:has-text("Facturación")').click();
  await page.waitForTimeout(300);
  await page.locator('.modal-foot button:has-text("Pasar a Facturación")').click();
  await page.waitForTimeout(800);
  check('…pero sí directamente a Facturación',
    (await page.locator('.page-head').innerText()).includes('Facturación'));

  // ================= LISTADO Y FICHA DEL CLIENTE =================
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  check('«En curso» deja fuera los proyectos finalizados',
    (await page.locator('tbody tr').count()) === 1 &&
    (await page.locator('tbody').innerText()).includes('Barandilla escalera comunitaria'));
  check('Con su fase y su situación',
    (await page.locator('tbody').innerText()).includes('Facturación'));

  await page.locator('.chip:has-text("Finalizado")').click();
  await page.waitForTimeout(700);
  check('Se puede filtrar por fase para ver los finalizados',
    (await page.locator('tbody tr').count()) === 1 &&
    (await page.locator('tbody').innerText()).includes('Rejas ventanas'));

  await page.goto(`http://localhost:${PORT}/#/admin/clientes/c1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const panelProyectos = await page.locator('.panel:has-text("Proyectos")').first().innerText();
  check('La ficha del cliente lista sus proyectos',
    panelProyectos.includes(`PROY-${YEAR}-001`) && panelProyectos.includes(`PROY-${YEAR}-002`),
    panelProyectos.replace(/\n/g, ' · '));

  // ================= ARCHIVAR =================
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.locator('tbody tr').first().click();
  await page.waitForTimeout(700);
  await page.locator('.page-head button:has-text("Archivar")').click();
  await page.waitForTimeout(300);
  check('Archivar avisa de que no se borra nada',
    (await page.locator('.modal').innerText()).includes('conserva documentos e historial'));
  await page.locator('.modal-foot button:has-text("Archivar")').click();
  await page.waitForTimeout(800);
  check('El proyecto archivado lo indica y bloquea los cambios de fase',
    (await page.locator('.alert-warn').innerText()).includes('no se puede cambiar de fase'));

  check('No hay errores de JavaScript en todo el recorrido', errors.length === 0, errors[0]);

  // ================= MÓVIL =================
  await ctx.close();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
  });
  await stubSupabase(mobile, { db });
  const mpage = await mobile.newPage();
  await signIn(mpage, PORT, 'salvi');
  await mpage.goto(`http://localhost:${PORT}/#/admin/proyectos`, { waitUntil: 'networkidle' });
  await mpage.waitForTimeout(700);
  const overflow = await mpage.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('En pantalla pequeña el listado no desborda', overflow <= 0, `sobran ${overflow}px`);
  await mobile.close();
} finally {
  await browser.close();
}

server.close();
process.exit(report() ? 1 : 0);
