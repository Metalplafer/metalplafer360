/**
 * METALPLAFER360 · Recorrido de clientes y fichas en un navegador real.
 *
 *   npm run test:fase2
 *
 * Usa el Supabase de mentira de fake-supabase.mjs: comprueba que las
 * PANTALLAS funcionan de principio a fin (crear un cliente, verlo en el
 * listado, crear fichas con sugerencia de cliente, cambiar estados…).
 *
 * Las reglas de verdad se prueban contra PostgreSQL en tests/sql.
 */
import {
  ADMIN, YEAR, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, stubSupabase,
} from './fake-supabase.mjs';

const PORT = 4180;

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: 'obras@garcia.es', address: 'Carrer de la Indústria, 12',
      city: 'Sabadell', postal_code: '08202', notes: null, active: true, archived_at: null,
      is_demo: false, created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
    { id: 'c2', kind: 'empresa', name: 'García y Asociados', tax_id: null,
      phone: null, email: null, address: null, city: 'Terrassa', postal_code: null, notes: null,
      active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-02T09:00:00Z', updated_at: '2026-03-02T09:00:00Z' },
  ],
});

const browser = await launchBrowser();

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await signIn(page, PORT, 'salvi');

  // ---------------- CLIENTES ----------------
  await page.locator('.sidebar nav a:has-text("Clientes")').click();
  await page.waitForTimeout(500);
  check('Se abre el listado de clientes', page.url().includes('#/admin/clientes'));
  check('Muestra los clientes existentes', (await page.locator('tbody tr').count()) === 2);

  await page.locator('#client-search').fill('bonprix');
  await page.waitForTimeout(500);
  check('La búsqueda sin resultados lo dice con claridad',
    (await page.locator('.empty').innerText()).includes('Sin resultados'));

  await page.locator('#client-search').fill('garcía');
  await page.waitForTimeout(500);
  check('La búsqueda encuentra por nombre, aunque se escriba con acento',
    (await page.locator('tbody tr').count()) === 2);
  await page.locator('#client-search').fill('');
  await page.waitForTimeout(400);

  // Alta de cliente particular
  await page.locator('button:has-text("Nuevo cliente")').click();
  await page.waitForTimeout(300);
  await page.locator('.modal button:has-text("Particular")').click();
  await page.locator('#cf-name').fill('Laura Puig Serra');
  await page.locator('#cf-phone').fill('644555666');
  await page.locator('#cf-city').fill('Terrassa');
  await page.locator('.modal-foot button:has-text("Guardar cliente")').click();
  await page.waitForTimeout(700);

  check('Al crear un cliente se abre su ficha', /#\/admin\/clientes\/[^/]+$/.test(page.url()));
  check('Es un cliente particular y sin CIF/NIF obligatorio',
    (await page.locator('.page-head').innerText()).includes('Particular')
    && (await page.locator('.kv').first().innerText()).includes('—'));
  check('Aparece el nombre del cliente', (await page.locator('h1').innerText()).includes('Laura Puig Serra'));
  check('Ofrece contactar por WhatsApp cuando hay teléfono',
    await page.locator('a:has-text("WhatsApp")').first().isVisible());

  // Contactos
  await page.locator('button:has-text("Añadir contacto")').click();
  await page.waitForTimeout(300);
  await page.locator('#ct-name').fill('Jordi García');
  await page.locator('#ct-role').fill('Gerente');
  await page.locator('#ct-phone').fill('600111223');
  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(600);

  await page.locator('button:has-text("Añadir contacto")').click();
  await page.waitForTimeout(300);
  await page.locator('#ct-name').fill('Marta García');
  await page.locator('#ct-role').fill('Administración');
  await page.locator('.modal-foot button:has-text("Guardar")').click();
  await page.waitForTimeout(600);

  check('Un cliente puede tener varios contactos',
    (await page.locator('.doc-list li').count()) === 2);

  // Archivar y recuperar
  await page.locator('.page-head button:has-text("Archivar")').click();
  await page.waitForTimeout(300);
  await page.locator('.modal-foot button:has-text("Archivar")').click();
  await page.waitForTimeout(600);
  check('Al archivar se avisa de que no se borra nada',
    (await page.locator('.alert-warn').innerText()).includes('historial se conserva'));
  check('El cliente queda marcado como archivado',
    (await page.locator('.page-head').innerText()).includes('Archivado'));

  await page.locator('.page-head button:has-text("Recuperar")').click();
  await page.waitForTimeout(300);
  await page.locator('.modal-foot button:has-text("Recuperar")').click();
  await page.waitForTimeout(600);
  check('Se puede recuperar un cliente archivado',
    (await page.locator('.page-head').innerText()).includes('Activo'));

  // ---------------- FICHAS ----------------
  await page.locator('.sidebar nav a:has-text("Fichas")').click();
  await page.waitForTimeout(500);
  check('Se abre el listado de fichas', page.url().includes('#/admin/fichas'));
  check('Tiene las tres pestañas: presupuestos, visitas y avisos',
    (await page.locator('.tabs button').count()) === 3);

  // Presupuesto con sugerencia de cliente
  check('El botón de alta usa el artículo correcto',
    await page.locator('a.btn-primary:has-text("Nuevo presupuesto")').isVisible());
  await page.locator('a.btn-primary:has-text("Nuevo presupuesto")').click();
  await page.waitForTimeout(500);
  check('El formulario anuncia el código que se asignará',
    (await page.locator('.page-head .sub').innerText()).includes(`PRES-${YEAR}-###`));

  await page.locator('#cp-name').fill('GARCÍA CONSTRUCCIONES');
  await page.waitForTimeout(700);
  const box = page.locator('.suggest-box');
  check('Al escribir el nombre pregunta si es un cliente ya existente',
    (await box.locator('.title').innerText()).includes('¿Es alguno de estos clientes?'));
  const opciones = await box.locator('button strong').allInnerTexts();
  check('Propone los dos clientes parecidos',
    opciones.includes('García Construcciones SL') && opciones.includes('García y Asociados'),
    opciones.join(' | '));
  check('Y deja decir que es un cliente nuevo',
    (await box.innerText()).includes('No, es un cliente nuevo'));

  await box.locator('button:has-text("García Construcciones SL")').click();
  await page.waitForTimeout(400);
  const elegido = await page.locator('.alert-ok').innerText();
  check('Al elegirlo se rellenan solo sus datos generales',
    elegido.includes('García Construcciones SL') && elegido.includes('B61234567') && elegido.includes('Sabadell'),
    elegido.replace(/\n/g, ' '));

  await page.locator('#f-title').fill('Barandilla escalera comunitaria');
  await page.locator('#f-desc').fill('Barandilla de acero para escalera de 4 plantas, pasamanos redondo.');
  await page.locator('#f-address').fill('Rambla, 45 · Sabadell');
  await page.locator('#f-amount').fill('6.400,50');
  await page.locator('button:has-text("Crear presupuesto")').click();
  await page.waitForTimeout(800);

  check('El presupuesto se crea con el código PRES-AAAA-001',
    (await page.locator('.plate').first().innerText()) === `PRES-${YEAR}-001`);
  check('Nace en estado «Por asignar»',
    (await page.locator('.page-head').innerText()).includes('Por asignar'));
  check('Muestra el importe en formato español',
    (await page.locator('.kv').innerText()).includes('6.400,50'));

  // Asignar responsable → deja de estar «Por asignar»
  await page.locator('#assign').selectOption({ label: 'Salvi Plaza (administración)' });
  await page.waitForTimeout(700);
  check('Al asignar responsable pasa a «Presupuesto pendiente»',
    (await page.locator('.page-head').innerText()).includes('Presupuesto pendiente'));

  // Recorrer estados hasta aceptado
  for (const estado of ['Presupuesto avanzado', 'Presupuesto por revisar', 'Presupuesto enviado']) {
    await page.locator(`.status-flow button:has-text("${estado}")`).click();
    await page.waitForTimeout(450);
  }
  check('Se recorren los estados del presupuesto',
    (await page.locator('.page-head').innerText()).includes('Presupuesto enviado'));

  await page.locator('.status-flow button:has-text("Presupuesto aceptado")').click();
  await page.waitForTimeout(300);
  check('Aceptar un presupuesto pide confirmación',
    (await page.locator('.modal').innerText()).includes('convertirse en proyecto'));
  await page.locator('.modal-foot button:has-text("Cambiar estado")').click();
  await page.waitForTimeout(700);
  check('El presupuesto queda aceptado',
    (await page.locator('.page-head').innerText()).includes('Presupuesto aceptado'));
  check('Y ofrece convertirlo en proyecto',
    await page.locator('button:has-text("Convertir en proyecto")').isVisible());

  // Comentario (solo texto)
  await page.locator('#comment-box').fill('Enviado por email a Jordi el martes.');
  await page.locator('button:has-text("Enviar")').click();
  await page.waitForTimeout(600);
  check('Se puede comentar en la ficha',
    (await page.locator('.comment').innerText()).includes('Enviado por email'));
  check('Los comentarios avisan de que son solo texto',
    (await page.locator('.field .hint').last().innerText()).includes('Solo texto'));

  // Historial
  check('El historial de la ficha muestra lo ocurrido',
    (await page.locator('.feed').innerText()).includes('creó la ficha'));

  // ---------------- VISITA ----------------
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/nueva?tipo=visita`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('Una visita indica que el cliente es opcional',
    (await page.locator('.panel-head:has-text("Cliente")').innerText()).includes('opcional'));
  await page.locator('#f-desc').fill('Medir huecos de fachada y revisar anclajes.');
  await page.locator('#f-address').fill('Carrer Major, 12 · Matadepera');
  await page.locator('#f-date').fill(`${YEAR}-06-15`);
  await page.locator('#f-time').fill('09:30');
  await page.locator('#f-assigned').selectOption({ label: 'Juan Ortega' });
  await page.locator('button:has-text("Crear visita")').click();
  await page.waitForTimeout(800);

  check('La visita tiene su propia serie: VIS-AAAA-001',
    (await page.locator('.plate').first().innerText()) === `VIS-${YEAR}-001`);
  check('Al crearse ya asignada aparece como «Asignada»',
    (await page.locator('.page-head').innerText()).includes('Asignada'));
  check('Guarda fecha y hora de la visita',
    (await page.locator('.kv').innerText()).includes('15/06/') &&
    (await page.locator('.kv').innerText()).includes('09:30'));

  // ---------------- AVISO ----------------
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/nueva?tipo=aviso`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('Un aviso explica que no se convierte en proyecto',
    (await page.locator('.panel').first().innerText()).includes('No se convierte en proyecto'));

  await page.locator('button:has-text("Crear aviso")').click();
  await page.waitForTimeout(400);
  check('Un aviso sin cliente avisa de que hace falta uno',
    (await page.locator('.alert-danger').innerText()).includes('necesitan siempre un cliente'));

  await page.locator('#cp-name').fill('Laura');
  await page.waitForTimeout(700);
  await page.locator('.suggest-box button:has-text("Laura Puig Serra")').click();
  await page.waitForTimeout(300);
  await page.locator('#f-desc').fill('La puerta del garaje no cierra del todo.');
  await page.locator('#f-phone').fill('644555666');
  await page.locator('#f-address').fill('Carrer de Sant Pau, 21 · Terrassa');
  await page.locator('#f-date').fill(`${YEAR}-06-16`);
  await page.locator('button:has-text("Crear aviso")').click();
  await page.waitForTimeout(800);

  check('El aviso tiene su propia serie: AVI-AAAA-001',
    (await page.locator('.plate').first().innerText()) === `AVI-${YEAR}-001`);
  const estadosAviso = await page.locator('.status-flow button').allInnerTexts();
  check('Los estados del aviso son los previstos',
    ['Por asignar', 'Pendiente', 'Asignado', 'En curso', 'Realizado', 'Cerrado']
      .every((e, i) => estadosAviso[i] === e), estadosAviso.join(' | '));
  check('Un aviso no ofrece convertirse en proyecto',
    (await page.locator('body').innerText()).includes('convertirse en proyecto') === false);

  await page.locator('.status-flow button:has-text("En curso")').click();
  await page.waitForTimeout(600);
  check('Se puede pasar el aviso a «En curso»',
    (await page.locator('.page-head').innerText()).includes('En curso'));

  // ---------------- LISTADOS Y AVISOS ----------------
  await page.locator('.sidebar nav a:has-text("Avisos")').click();
  await page.waitForTimeout(600);
  check('La sección Avisos muestra solo los avisos',
    (await page.locator('tbody tr').count()) === 1 &&
    (await page.locator('tbody').innerText()).includes(`AVI-${YEAR}-001`));
  check('La sección Avisos no tiene pestañas de tipo',
    (await page.locator('.tabs').count()) === 0);

  await page.locator('.sidebar nav a:has-text("Fichas")').click();
  await page.waitForTimeout(600);
  await page.locator('.tabs button:has-text("Visitas")').click();
  await page.waitForTimeout(600);
  check('La pestaña de visitas muestra la visita creada',
    (await page.locator('tbody').innerText()).includes(`VIS-${YEAR}-001`));

  await page.locator('.tabs button:has-text("Presupuestos")').click();
  await page.waitForTimeout(600);
  check('Los presupuestos aceptados no salen en «Pendientes»',
    (await page.locator('.empty').count()) === 1);
  await page.locator('.chip:has-text("Todas")').click();
  await page.waitForTimeout(600);
  check('…pero sí al mirar «Todas»',
    (await page.locator('tbody').innerText()).includes(`PRES-${YEAR}-001`));

  // ---------------- HISTORIAL DEL CLIENTE ----------------
  await page.locator('.sidebar nav a:has-text("Clientes")').click();
  await page.waitForTimeout(600);
  await page.locator('tbody tr:has-text("García Construcciones SL")').click();
  await page.waitForTimeout(700);
  check('La ficha del cliente muestra su presupuesto',
    (await page.locator('.panel:has-text("Historial del cliente")').innerText()).includes(`PRES-${YEAR}-001`));

  const pestañas = await page.locator('.panel:has-text("Historial del cliente") .tabs button').allInnerTexts();
  check('Y separa presupuestos, visitas y avisos',
    pestañas.length === 3 && pestañas[0].includes('Presupuestos'), pestañas.join(' | '));

  check('No hay errores de JavaScript en todo el recorrido', errors.length === 0, errors[0]);

  // ---------------- MÓVIL ----------------
  await ctx.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' });
  await stubSupabase(mobile, { db });
  const mpage = await mobile.newPage();
  await signIn(mpage, PORT, 'salvi');
  await mpage.goto(`http://localhost:${PORT}/#/admin/clientes`, { waitUntil: 'networkidle' });
  await mpage.waitForTimeout(600);
  const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('En tablet o móvil el listado no desborda la pantalla', overflow <= 0, `sobran ${overflow}px`);
  await mobile.close();
} finally {
  await browser.close();
}


server.close();
process.exit(report() ? 1 : 0);
