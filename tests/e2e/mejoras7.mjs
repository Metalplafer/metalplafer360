/**
 * METALPLAFER360 · LA FASE DE VISITA TÉCNICA Y EL TRASPASO DE SOLICITUDES
 *
 * Comprueba, pulsando lo que pulsa una persona:
 *
 *   · MEJORA 1 · que «Pendiente de visita técnica» es una fase más del
 *     recorrido, la primera; que un proyecto entra y sale de ella; que
 *     se guarda y aguanta una recarga; que los demás proyectos no se
 *     mueven; y que se puede filtrar por ella en el listado.
 *
 *   · MEJORA 2 · que al convertir una solicitud en aviso, el formulario
 *     llega con el ASUNTO en el título y las OBSERVACIONES INTERNAS en
 *     la descripción —no el cuerpo del correo—; que al guardar queda
 *     vinculada; y que desde la ficha se puede LEER el correo original,
 *     que es lo que antes no se podía.
 *
 * Lo que se mira en la base de datos de mentira es lo que habría quedado
 * guardado, no lo que pinta la pantalla: así una pantalla que enseñe algo
 * que no se ha guardado no pasa por buena.
 */
import {
  ADMIN, YEAR, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, stubSupabase,
} from './fake-supabase.mjs';

/** Un proyecto del juego de pruebas, con lo mínimo para que exista. */
const proyecto = (extra) => ({
  contact_id: null, source_ficha_id: null, description: null, measures: null, finish: null,
  location: null, address: null, observations: null, budget_amount: 6400,
  advance_amount: null, phase: 'preparacion', no_assembly: false,
  billing_status: 'por_facturar', finished_at: null, archived_at: null, is_demo: false,
  invoiced_amount: null, invoiced_on: null, work_id: null, autoplan: false,
  created_at: '2026-05-02T09:00:00Z', updated_at: '2026-05-02T09:00:00Z',
  ...extra,
});

const PORT = 4207;
const HOY = new Date().toISOString();

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();
const limpio = (s) => s.replace(/ /g, ' ');
const panel = (p, titulo) => p.locator(`.panel:has(h2:text-is("${titulo}"))`);

/*
  EL CORREO DEL CASO REAL que destapó el problema (SOL-2026-008). Las
  tres cosas que tienen que quedar separadas están aquí:

    · el ASUNTO        → «Aviso DUNCAN»
    · el CUERPO        → la queja del cliente, largo y en sus palabras
    · las OBSERVACIONES→ las instrucciones que escribió administración

  Si alguna acaba en el campo de otra, estas pruebas lo dicen.
*/
const CUERPO = 'Hola Salvi. Que tal? Tenemos que hablar sobre la puerta porque no va bien. '
  + 'Lo que son los acabados y materiales son preciosos y nos encanta. Pero el motor es fatal '
  + 'y mucho peor de lo que teníamos antes. Hoy con las lluvias ha vuelto a fallar y estoy '
  + 'empapado intentando salir de casa.';
const NOTAS = '-INSTALAR CABLE RADIO\n-REPASAR FOTOCELULA';

// Y el segundo caso, un REENVÍO: el asunto bueno es el original, no el
// «RV:» que puso administración al reenviarlo.
const CUERPO2 = 'Buenas, os paso lo que me pide el cliente: quiere presupuesto para la verja '
  + 'del jardín, unos 18 metros, y pregunta si se puede hacer en negro forja.';
const NOTAS2 = 'Medir el desnivel antes de presupuestar';

const db = createDb({
  clients: [
    { id: 'c1', kind: 'particular', name: 'Duncan MCMath', tax_id: null,
      phone: '600111222', email: 'duncan@example.com', address: 'Carrer Gran, 4', city: 'Sabadell',
      postal_code: '08201', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z' },
  ],
  projects: [
    proyecto({ id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1', name: 'Puerta de garaje' }),
    // El testigo: este NO se toca en ningún momento, y al final se
    // comprueba que sigue exactamente donde estaba.
    proyecto({ id: 'p2', code: `PROY-${YEAR}-002`, client_id: 'c1',
               name: 'Barandilla del porche', phase: 'fabricacion' }),
  ],
  mail_requests: [
    { id: 's1', code: `SOL-${YEAR}-008`, status: 'revisada',
      provider_message_id: 'MSG-0008@example.com',
      subject: 'Aviso DUNCAN', body_text: CUERPO, body_html: null,
      sender_email: 'duncan@example.com', sender_name: 'Duncan MCMath',
      recipients: 'peticiones@metalplafer.com', received_at: HOY,
      forwarded: false, original_sender_email: null, original_sender_name: null,
      original_subject: null, sender_needs_review: false,
      client_id: 'c1', notes: NOTAS, reviewed_by: ADMIN.id, reviewed_at: HOY,
      target_ficha_id: null, target_project_id: null, error_detail: null,
      is_demo: false, created_at: HOY, updated_at: HOY },

    // La segunda, para repetir lo mismo con un PRESUPUESTO: el encargo
    // pide expresamente no arreglar solo el caso de los avisos.
    { id: 's2', code: `SOL-${YEAR}-009`, status: 'revisada',
      provider_message_id: 'MSG-0009@example.com',
      subject: 'RV: presupuesto para la verja', body_text: CUERPO2, body_html: null,
      sender_email: 'administracion@metalplafer.com', sender_name: 'Administración',
      recipients: 'peticiones@metalplafer.com', received_at: HOY,
      forwarded: true, original_sender_email: 'duncan@example.com',
      original_sender_name: 'Duncan MCMath',
      original_subject: 'Presupuesto para la verja del jardín',
      sender_needs_review: false,
      client_id: 'c1', notes: NOTAS2, reviewed_by: ADMIN.id, reviewed_at: HOY,
      target_ficha_id: null, target_project_id: null, error_detail: null,
      is_demo: false, created_at: HOY, updated_at: HOY },
  ],
});

const browser = await launchBrowser();
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await stubSupabase(context, { db });
  const page = await context.newPage();

  const errores = [];
  const consola = [];
  page.on('pageerror', (e) => errores.push(`error de programación: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') consola.push(m.text()); });

  await signIn(page, PORT, ADMIN.username);

  // ==================== MEJORA 1 · LA FASE NUEVA ====================
  await page.goto(`http://localhost:${PORT}/#/admin/proyectos/p1`, { waitUntil: 'networkidle' });
  await page.locator('.rail').waitFor({ timeout: 15000 });

  check('El recorrido del proyecto tiene SEIS fases',
    (await page.locator('.rail-step').count()) === 6,
    limpio(await page.locator('.rail').innerText()).replace(/\n+/g, ' · '));

  check('Y la primera es «Pendiente de visita técnica»: se visita antes de preparar',
    (await page.locator('.rail-step').first().innerText()).includes('Pendiente de visita técnica'));

  check('El proyecto empieza en «En preparación»',
    db.projects.find((p) => p.id === 'p1').phase === 'preparacion');

  // Pasar a la fase nueva. El cambio de fase pide confirmación.
  await page.locator('.rail-step:has-text("Pendiente de visita técnica")').click();
  await page.locator('.modal').waitFor({ timeout: 10000 });
  await page.locator('.modal-foot button:has-text("Pasar a Pendiente de visita técnica")').click();
  await page.waitForTimeout(900);

  check('Un proyecto puede pasar a esperar visita técnica, y QUEDA GUARDADO',
    db.projects.find((p) => p.id === 'p1').phase === 'pendiente_visita_tecnica',
    db.projects.find((p) => p.id === 'p1').phase);

  check('El historial lo cuenta con las dos fases escritas en castellano',
    db.audit_log.some((a) => a.summary.includes('Pendiente de visita técnica')),
    db.audit_log.slice(-1)[0]?.summary ?? '(sin apuntes)');

  // LO QUE IMPORTA: que aguante una recarga. Una fase que solo vive en
  // la pantalla no sirve de nada.
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.rail').waitFor({ timeout: 15000 });
  check('Al recargar, el proyecto sigue en la fase nueva',
    (await page.locator('.rail-step[aria-current="true"]').innerText())
      .includes('Pendiente de visita técnica'),
    limpio(await page.locator('.rail-step[aria-current="true"]').innerText()));

  check('La fase nueva NO ofrece subestados',
    (await page.locator('.substatus-grid .chip').count()) === 0);

  // Y se sale a cualquier otra.
  await page.locator('.rail-step:has-text("Fabricación")').click();
  await page.locator('.modal').waitFor({ timeout: 10000 });
  await page.locator('.modal-foot button:has-text("Pasar a Fabricación")').click();
  await page.waitForTimeout(900);

  check('Y de la fase nueva se puede salir a otra',
    db.projects.find((p) => p.id === 'p1').phase === 'fabricacion',
    db.projects.find((p) => p.id === 'p1').phase);

  // EL TESTIGO: nadie ha tocado el otro proyecto.
  check('Ningún otro proyecto se ha movido de fase',
    db.projects.find((p) => p.id === 'p2').phase === 'fabricacion',
    db.projects.find((p) => p.id === 'p2').phase);

  // ---- El listado filtra por la fase nueva ----
  await page.locator('.rail-step:has-text("Pendiente de visita técnica")').click();
  await page.locator('.modal').waitFor({ timeout: 10000 });
  await page.locator('.modal-foot button:has-text("Pasar a Pendiente de visita técnica")').click();
  await page.waitForTimeout(900);

  await page.goto(`http://localhost:${PORT}/#/admin/proyectos`, { waitUntil: 'networkidle' });
  await page.locator('.table').waitFor({ timeout: 15000 });

  check('El listado ofrece filtrar por la fase nueva',
    (await page.locator('.chip:text-is("Pendiente de visita técnica")').count()) === 1);

  await page.locator('.chip:text-is("Pendiente de visita técnica")').click();
  await page.waitForTimeout(800);

  const filtrado = limpio(await page.locator('.table').innerText());
  check('Y al filtrar enseña el que espera visita y solo ese',
    filtrado.includes(`PROY-${YEAR}-001`) && !filtrado.includes(`PROY-${YEAR}-002`),
    filtrado.replace(/\n+/g, ' | ').slice(0, 160));

  // ---- El panel la cuenta ----
  await page.goto(`http://localhost:${PORT}/#/admin`, { waitUntil: 'networkidle' });
  await page.locator('.bar-list').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);

  const barra = page.locator('.bar-list .bar-row',
    { has: page.locator('.bar-label:text-is("Pendiente de visita técnica")') });
  check('El panel reparte los proyectos contando la fase nueva',
    (await barra.count()) === 1 && (await barra.locator('.bar-value').innerText()).trim() === '1',
    limpio(await page.locator('.bar-list').innerText()).replace(/\n+/g, ' | '));

  // ============ MEJORA 2 · EL TRASPASO DE LA SOLICITUD ============
  await page.goto(`http://localhost:${PORT}/#/admin/solicitudes/s1`, { waitUntil: 'networkidle' });
  await panel(page, 'Convertir en…').waitFor({ timeout: 15000 });

  // La solicitud enseña las tres cosas por separado, que es como están.
  const elCorreo = limpio(await panel(page, 'El correo').innerText());
  check('La solicitud enseña el cuerpo del correo del cliente',
    elCorreo.includes('estoy empapado intentando salir de casa'),
    elCorreo.replace(/\n+/g, ' ').slice(0, 120));

  await panel(page, 'Convertir en…').locator('button:has-text("Aviso")').click();
  await page.waitForTimeout(1200);

  check('Convertir lleva al formulario de siempre, con el tipo ya elegido',
    page.url().includes('/admin/fichas/nueva') && page.url().includes('tipo=aviso'),
    page.url());

  /*
    EL CORAZÓN DE LA MEJORA 2.

    Antes, este formulario llegaba EN BLANCO: había que volver a
    escribir a mano lo que el cliente ya había contado, y se copiaba
    con la vista. Las dos capturas del encargo lo enseñaban sin querer:
    el aviso ponía «INSTALARA CABLE RADIO» donde la solicitud decía
    «INSTALAR CABLE RADIO». Una copia de un programa no cambia una
    letra; una copia hecha a mano, sí.

    Ahora llega con cada cosa en su campo.
  */
  await page.locator('#f-title').waitFor({ timeout: 10000 });
  const titulo = await page.locator('#f-title').inputValue();
  const descripcion = await page.locator('#f-desc').inputValue();

  check('El título llega con el ASUNTO del correo',
    titulo === 'Aviso DUNCAN', titulo);

  check('La descripción llega con las OBSERVACIONES INTERNAS',
    descripcion.includes('INSTALAR CABLE RADIO')
    && descripcion.includes('REPASAR FOTOCELULA'), descripcion);

  // LO QUE NO TIENE QUE PASAR: que el cuerpo del correo se vuelque en
  // la descripción. Enterraría las instrucciones de trabajo.
  check('Y el CUERPO del correo NO se ha volcado en la descripción',
    !descripcion.includes('empapado') && !descripcion.includes('acabados y materiales'),
    descripcion);

  check('El cliente del correo viene puesto',
    limpio(await page.locator('form').innerText()).includes('Duncan MCMath'),
    limpio(await page.locator('form').innerText()).replace(/\n+/g, ' | ').slice(0, 160));

  check('Y avisa de que quedará vinculada a la solicitud',
    limpio(await page.locator('body').innerText()).includes('vinculada a la solicitud'));

  await page.locator('button:has-text("Crear aviso")').click();
  await page.waitForTimeout(1400);

  const aviso = db.fichas.find((f) => f.type === 'aviso' && f.title === 'Aviso DUNCAN');
  check('El aviso se guarda con el asunto como título',
    Boolean(aviso), db.fichas.map((f) => `${f.type}:${f.title}`).join(' | '));

  check('Y con las observaciones internas como descripción, sin el correo dentro',
    aviso?.description?.includes('INSTALAR CABLE RADIO')
    && !aviso?.description?.includes('empapado'), aviso?.description ?? '(vacía)');

  check('La solicitud queda vinculada al aviso',
    db.mail_requests[0].status === 'vinculada'
    && db.mail_requests[0].target_ficha_id === aviso?.id,
    `${db.mail_requests[0].status} · ${db.mail_requests[0].target_ficha_id}`);

  /*
    Y LA SOLICITUD NO SE TOCA. Es la prueba de que no se ha «arreglado»
    el problema moviendo texto de un sitio a otro: el correo original
    sigue donde estaba, entero, con sus tres campos separados.
  */
  check('El correo original sigue intacto en la solicitud',
    db.mail_requests[0].subject === 'Aviso DUNCAN'
    && db.mail_requests[0].body_text === CUERPO
    && db.mail_requests[0].notes === NOTAS);

  // ---- DESDE LA FICHA SE LLEGA AL CORREO ----
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/${aviso.id}`, { waitUntil: 'networkidle' });
  await page.locator('.page-head').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);

  const origen = panel(page, 'De dónde viene');
  check('El aviso dice de qué solicitud salió',
    (await origen.count()) === 1
    && (await origen.innerText()).includes(`SOL-${YEAR}-008`),
    (await origen.count()) ? limpio(await origen.innerText()).replace(/\n+/g, ' · ') : '(no hay panel)');

  check('Con el remitente y el asunto del correo',
    (await origen.innerText()).includes('duncan@example.com')
    && (await origen.innerText()).includes('Aviso DUNCAN'));

  // EL CUERPO, QUE ES LO QUE SE PERDÍA. Va plegado para no estorbar.
  check('El cuerpo del correo está, plegado',
    (await origen.locator('details summary').count()) === 1);

  await origen.locator('details summary').click();
  await page.waitForTimeout(400);
  check('Y al desplegarlo se lee entero, con las palabras del cliente',
    (await origen.locator('.correo-cuerpo').innerText()).includes('empapado intentando salir de casa'),
    limpio(await origen.locator('.correo-cuerpo').innerText()).slice(0, 100));

  check('Y se puede abrir la solicitud desde ahí',
    (await origen.locator(`a:has-text("SOL-${YEAR}-008")`).count()) === 1);

  // ============ MEJORA 2 · LO MISMO CON UN PRESUPUESTO ============
  /*
    El encargo pide expresamente no arreglar solo los avisos. El
    formulario es el mismo para los tres tipos, así que esto comprueba
    que el arreglo vale igual, y de paso un caso que el aviso no tenía:
    un REENVÍO, donde el asunto bueno es el original y no el «RV:».
  */
  await page.goto(`http://localhost:${PORT}/#/admin/solicitudes/s2`, { waitUntil: 'networkidle' });
  await panel(page, 'Convertir en…').waitFor({ timeout: 15000 });
  await panel(page, 'Convertir en…').locator('button:has-text("Presupuesto")').click();
  await page.locator('#f-title').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);

  const tituloPres = await page.locator('#f-title').inputValue();
  const descPres = await page.locator('#f-desc').inputValue();

  check('En un presupuesto el título llega con el asunto ORIGINAL, no con el «RV:»',
    tituloPres === 'Presupuesto para la verja del jardín', tituloPres);

  check('Y la descripción con las observaciones internas, sin el correo',
    descPres === 'Medir el desnivel antes de presupuestar', descPres);

  await page.locator('#f-amount').fill('3200');
  await page.locator('button:has-text("Crear presupuesto")').click();
  await page.waitForTimeout(1400);

  const pres = db.fichas.find((f) => f.type === 'presupuesto');
  check('El presupuesto se guarda y la solicitud queda vinculada a él',
    Boolean(pres) && db.mail_requests[1].target_ficha_id === pres?.id
    && db.mail_requests[1].status === 'vinculada',
    `${pres?.title ?? '(sin presupuesto)'} · ${db.mail_requests[1].status}`);

  check('Y su correo original tampoco se ha tocado',
    db.mail_requests[1].body_text === CUERPO2
    && db.mail_requests[1].notes === NOTAS2
    && db.mail_requests[1].original_subject === 'Presupuesto para la verja del jardín');

  await page.goto(`http://localhost:${PORT}/#/admin/fichas/${pres.id}`, { waitUntil: 'networkidle' });
  await page.locator('.page-head').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);

  const origenPres = panel(page, 'De dónde viene');
  check('Y el presupuesto también dice de qué correo salió',
    (await origenPres.count()) === 1
    && (await origenPres.innerText()).includes(`SOL-${YEAR}-009`));

  check('Diciendo quién lo mandó de verdad y quién lo reenvió',
    (await origenPres.innerText()).includes('duncan@example.com')
    && (await origenPres.innerText()).includes('administracion@metalplafer.com'),
    limpio(await origenPres.innerText()).replace(/\n+/g, ' · '));

  // ---- UNA FICHA HECHA A MANO NO ENSEÑA ESE PANEL ----
  await page.goto(`http://localhost:${PORT}/#/admin/fichas/nueva?tipo=aviso`,
    { waitUntil: 'networkidle' });
  await page.locator('#f-title').waitFor({ timeout: 10000 });

  check('Un aviso nuevo SIN solicitud llega en blanco, como siempre',
    (await page.locator('#f-title').inputValue()) === ''
    && (await page.locator('#f-desc').inputValue()) === '');

  check('Ni un error de programación en toda la sesión',
    errores.length === 0, errores.join(' | '));
  check('Ni un error en la consola del navegador',
    consola.length === 0, consola.join(' | '));

  report('FASE DE VISITA TÉCNICA Y TRASPASO DE SOLICITUDES');
} finally {
  await browser.close();
  server.close();
}
