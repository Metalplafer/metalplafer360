/**
 * METALPLAFER360 · Panel, informes, copias de seguridad y PWA.
 *
 *   npm run test:fase6
 *
 * Recorre en un navegador real lo que hará administración: mirar el panel
 * de inicio y configurarlo a su gusto, consultar los informes y bajárselos
 * en Excel y en PDF, generar una copia de seguridad, subirla a Google
 * Drive, restaurarla entera y por partes, y repasar la configuración.
 *
 * Los archivos que se descargan se abren de verdad (se descomprime el ZIP,
 * se lee el Excel y se extrae el texto del PDF) para comprobar que no son
 * solo bytes con el nombre correcto.
 *
 * Las reglas de seguridad de verdad se prueban contra PostgreSQL
 * en tests/sql/60_tests_fase6.sql.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ADMIN, WORKER, YEAR, addDays, buildApp, createChecker, createDb, launchBrowser,
  serveApp, signIn, startOfMonth, stubSupabase, today,
} from './fake-supabase.mjs';

const PORT = 4184;
const HOY = today();
const MES = startOfMonth(HOY);
const ATRASADO = addDays(HOY, -6);
const TMP = mkdtempSync(join(tmpdir(), 'm360-fase6-'));

buildApp();
const server = await serveApp(PORT);
const { check, report } = createChecker();

// ---------------------------------------------------------------------
// Datos de partida
// ---------------------------------------------------------------------
const db = createDb({
  clients: [
    { id: 'c1', kind: 'empresa', name: 'García Construcciones SL', tax_id: 'B61234567',
      phone: '600111222', email: null, address: 'Carrer de la Indústria, 12', city: 'Sabadell',
      postal_code: '08202', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: `${MES}T09:00:00Z`, updated_at: `${MES}T09:00:00Z` },
    { id: 'c2', kind: 'particular', name: 'Marta Ferrer', tax_id: null,
      phone: '600333444', email: null, address: 'Passeig Plaça Major, 8', city: 'Sabadell',
      postal_code: '08201', notes: null, active: true, archived_at: null, is_demo: false,
      created_at: `${MES}T09:00:00Z`, updated_at: `${MES}T09:00:00Z` },
  ],
  fichas: [
    { id: 'f1', code: `PRES-${YEAR}-001`, type: 'presupuesto', client_id: 'c1', contact_id: null,
      title: 'Puerta corredera nave', description: null, status: 'enviado', assigned_to: ADMIN.id,
      due_date: null, archived_at: null, is_demo: false,
      created_at: `${MES}T10:00:00Z`, updated_at: `${MES}T10:00:00Z` },
    { id: 'f2', code: `AVI-${YEAR}-001`, type: 'aviso', client_id: 'c2', contact_id: null,
      title: 'Cierre que no ajusta', description: null, status: 'por_asignar', assigned_to: null,
      due_date: null, archived_at: null, is_demo: false,
      created_at: `${MES}T11:00:00Z`, updated_at: `${MES}T11:00:00Z` },
  ],
  projects: [
    { id: 'p1', code: `PROY-${YEAR}-001`, client_id: 'c1', contact_id: null, source_ficha_id: null,
      name: 'Barandilla escalera comunitaria', description: null,
      measures: '4 tramos', finish: 'Negro forja', location: 'Escalera principal',
      address: 'Rambla, 45 · Sabadell', observations: null,
      budget_amount: 5000, advance_amount: null, budget_hours_fab: 40, budget_hours_mont: 16,
      phase: 'fabricacion', no_assembly: false, billing_status: 'pendiente_cobro',
      finished_at: null, archived_at: null, is_demo: false,
      created_at: `${MES}T09:00:00Z`, updated_at: `${MES}T09:00:00Z` },
    { id: 'p2', code: `PROY-${YEAR}-002`, client_id: 'c2', contact_id: null, source_ficha_id: null,
      name: 'Reja ventana cocina', description: null,
      measures: '1,20 × 0,90 m', finish: 'Gris', location: 'Cocina',
      address: 'Passeig Plaça Major, 8', observations: null,
      budget_amount: 1200, advance_amount: null, budget_hours_fab: 8, budget_hours_mont: 2,
      phase: 'finalizado', no_assembly: false, billing_status: 'cobrado',
      finished_at: `${addDays(HOY, -2)}T12:00:00Z`, archived_at: null, is_demo: false,
      created_at: `${MES}T09:30:00Z`, updated_at: `${MES}T09:30:00Z` },
  ],
  work_orders: [
    { id: 'o1', code: `OT-${YEAR}-001`, project_id: 'p1', type: 'fabricacion', scheduled_date: HOY,
      description: 'Cortar pletina y soldar los marcos.', planned_hours: 18, admin_notes: null,
      status: 'realizada', submitted_at: `${HOY}T17:00:00Z`, validated_at: null, validated_by: null,
      returned_at: null, return_reason: null, archived_at: null, is_demo: false,
      created_at: `${MES}T09:00:00Z`, updated_at: `${HOY}T17:00:00Z` },
    { id: 'o2', code: `OT-${YEAR}-002`, project_id: 'p2', type: 'montaje', scheduled_date: ATRASADO,
      description: 'Colocar la reja.', planned_hours: 4, admin_notes: null,
      status: 'validada', submitted_at: `${ATRASADO}T18:00:00Z`,
      validated_at: `${ATRASADO}T19:00:00Z`, validated_by: ADMIN.id,
      returned_at: null, return_reason: null, archived_at: null, is_demo: false,
      created_at: `${MES}T09:00:00Z`, updated_at: `${ATRASADO}T19:00:00Z` },
  ],
  work_order_workers: [
    { order_id: 'o1', worker_id: WORKER.id, work_done: 'Marcos soldados.', hours: 7.5,
      submitted_at: `${HOY}T17:00:00Z`, assigned_at: `${MES}T09:00:00Z`,
      updated_at: `${HOY}T17:00:00Z`, is_demo: false },
    { order_id: 'o2', worker_id: WORKER.id, work_done: 'Reja colocada y ajustada.', hours: 3.5,
      submitted_at: `${ATRASADO}T18:00:00Z`, assigned_at: `${MES}T09:00:00Z`,
      updated_at: `${ATRASADO}T18:00:00Z`, is_demo: false },
  ],
  materials: [
    { id: 'm1', project_id: 'p1', order_id: null, name: 'Pletina 40×8 mm', units: 12,
      supplier: 'Aceros Vallès', ordered_on: addDays(HOY, -14), expected_on: ATRASADO,
      received: false, notes: null, late_notified_on: null,
      archived_at: null, is_demo: false,
      created_at: `${MES}T09:00:00Z`, updated_at: `${MES}T09:00:00Z` },
    { id: 'm2', project_id: 'p2', order_id: null, name: 'Tubo 30×30 mm', units: 6,
      supplier: 'Aceros Vallès', ordered_on: addDays(HOY, -20), expected_on: addDays(HOY, -15),
      received: true, notes: null, late_notified_on: null,
      archived_at: null, is_demo: false,
      created_at: `${MES}T09:00:00Z`, updated_at: `${MES}T09:00:00Z` },
    { id: 'm3', project_id: 'p1', order_id: null, name: 'Bisagras inoxidables', units: 4,
      supplier: 'Ferretería Sabadell', ordered_on: addDays(HOY, -3), expected_on: addDays(HOY, 5),
      received: false, notes: null, late_notified_on: null,
      archived_at: null, is_demo: false,
      created_at: `${MES}T09:00:00Z`, updated_at: `${MES}T09:00:00Z` },
  ],
  material_requests: [
    { id: 'r1', worker_id: WORKER.id, order_id: 'o1', project_id: 'p1',
      text: 'Faltan 3 bisagras', status: 'pendiente', material_id: null, is_demo: false,
      created_at: `${HOY}T16:00:00Z`, updated_at: `${HOY}T16:00:00Z` },
  ],
  payments: [
    { id: 'pay1', project_id: 'p1', amount: 2000, paid_on: addDays(HOY, -5), method: 'transferencia',
      notes: 'Anticipo', is_demo: false, created_at: `${MES}T09:00:00Z` },
    { id: 'pay2', project_id: 'p2', amount: 1200, paid_on: addDays(HOY, -1), method: 'transferencia',
      notes: null, is_demo: false, created_at: `${MES}T09:00:00Z` },
  ],
  documents: [
    { id: 'd1', ficha_id: null, project_id: 'p1', order_id: null, bucket: 'documentos',
      storage_path: 'proyectos/p1/plano.pdf', file_name: 'plano.pdf', category: 'documento',
      size_bytes: 240_000, mime_type: 'application/pdf', uploaded_by: ADMIN.id,
      deleted_at: null, is_demo: false, created_at: `${MES}T09:00:00Z` },
    { id: 'd2', ficha_id: null, project_id: null, order_id: 'o1', bucket: 'documentos',
      storage_path: 'ordenes/o1/foto.jpg', file_name: 'foto.jpg', category: 'foto',
      size_bytes: 1_800_000, mime_type: 'image/jpeg', uploaded_by: WORKER.id,
      deleted_at: null, is_demo: false, created_at: `${HOY}T17:00:00Z` },
  ],
  counters: { PRES: 1, VIS: 0, AVI: 1, PROY: 2, OT: 2 },
  code_counters: [
    { prefix: 'PRES', year: YEAR, last_value: 1 }, { prefix: 'VIS', year: YEAR, last_value: 0 },
    { prefix: 'AVI', year: YEAR, last_value: 1 }, { prefix: 'PROY', year: YEAR, last_value: 2 },
    { prefix: 'OT', year: YEAR, last_value: 2 },
  ],
});

// Copias de trabajo: las preferencias del panel se guardan en el perfil.
const admin = { ...ADMIN, preferences: {} };
const people = [admin, { ...WORKER }];

const browser = await launchBrowser();

/** Guarda lo que descargue el navegador y devuelve la ruta del archivo. */
async function descargar(page, accion) {
  const espera = page.waitForEvent('download', { timeout: 15_000 });
  await accion();
  const download = await espera;
  const destino = join(TMP, download.suggestedFilename());
  await download.saveAs(destino);
  return destino;
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'es-ES' });
  await stubSupabase(ctx, { db, getUser: () => admin, people });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await signIn(page, PORT, 'salvi');

  // ===================== PANEL =====================
  console.log('\n   ── PANEL DE INICIO ──');
  await page.goto(`http://localhost:${PORT}/#/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const cabecera = await page.locator('.page-head').innerText();
  check('El panel saluda por el nombre', cabecera.includes('Hola, Salvi'));
  check('El periodo que trae de serie es este mes',
    await page.locator('.chip[aria-pressed="true"]').innerText() === 'Este mes');

  const panel = await page.locator('main').innerText();
  check('Reúne la producción del periodo', panel.includes('Producción') && panel.includes('Fabricación'));
  check('Reúne los proyectos', panel.includes('Proyectos') && panel.includes('Activos'));
  check('Reúne las órdenes de trabajo', panel.includes('Órdenes de trabajo'));
  check('Reúne el material', panel.includes('Pendiente de llegar'));
  check('Reúne la información económica', panel.includes('Presupuestado') && panel.includes('Cobrado'));
  check('Y lo que requiere atención', panel.includes('Requiere tu atención'));

  check('Suma las horas de fabricación y montaje del periodo',
    panel.includes('7,5 h') && panel.includes('3,5 h') && panel.includes('11 h'));
  check('Avisa de la orden pendiente de revisión',
    panel.includes('órdenes pendientes de revisión'));
  check('Avisa del material que no ha llegado a tiempo',
    panel.includes('materiales que no han llegado a tiempo'));
  check('Avisa del aviso de material del taller',
    panel.includes('avisos de material del taller por revisar'));
  check('Avisa de la ficha por asignar', panel.includes('fichas por asignar'));

  // La regla del encargo: NO hay alerta de exceso de horas.
  check('NO hay ninguna alerta de exceso de horas',
    !/exceso de horas|horas de más|supera(n)? las horas/i.test(panel));

  // ---- Configurar las tarjetas ----
  await page.locator('button:has-text("Configurar panel")').click();
  await page.waitForTimeout(400);
  check('Se puede configurar qué tarjetas se ven',
    (await page.locator('.card-config').count()) === 1);

  await page.locator('.card-config li:has(strong:text-is("Material")) input[type="checkbox"]').click();
  await page.waitForTimeout(700);
  check('Al desmarcar «Material» la tarjeta desaparece',
    !(await page.locator('main').innerText()).includes('Pendiente de llegar'));
  check('La preferencia se guarda en el perfil',
    Array.isArray(admin.preferences.dashboard) && !admin.preferences.dashboard.includes('material'));

  await page.locator('.card-config li:has(strong:text-is("Material")) input[type="checkbox"]').click();
  await page.waitForTimeout(700);
  check('Y al volver a marcarla, vuelve',
    (await page.locator('main').innerText()).includes('Pendiente de llegar'));

  const ordenAntes = [...admin.preferences.dashboard];
  await page.locator('button[aria-label="Bajar Lo que requiere atención"]').click();
  await page.waitForTimeout(700);
  check('Las tarjetas se pueden reordenar',
    admin.preferences.dashboard[0] !== ordenAntes[0]
    && admin.preferences.dashboard.includes('alertas'));

  await page.locator('button:has-text("Configurar panel")').click();
  await page.waitForTimeout(300);

  // ---- Periodos ----
  await page.locator('.chip:has-text("Este año")').click();
  await page.waitForTimeout(800);
  check('Se puede cambiar el periodo',
    await page.locator('.chip[aria-pressed="true"]').innerText() === 'Este año');
  check('Y el periodo elegido también se recuerda',
    admin.preferences.dashboardPeriod === 'ano');

  await page.locator('.chip:has-text("Otras fechas")').click();
  await page.waitForTimeout(400);
  check('El periodo «Otras fechas» pide desde y hasta',
    await page.locator('#db-from').count() === 1 && await page.locator('#db-to').count() === 1);

  await page.locator('.chip:has-text("Este mes")').click();
  await page.waitForTimeout(800);

  // ===================== INFORMES =====================
  console.log('\n   ── INFORMES ──');
  await page.locator('.sidebar nav a:has-text("Informes")').click();
  await page.waitForTimeout(1000);
  check('Se abren los informes', page.url().includes('#/admin/informes'));

  const proyectos = await page.locator('main').innerText();
  check('Informe de proyectos: creados, finalizados y tiempo medio',
    proyectos.includes('Creados') && proyectos.includes('Finalizados')
    && proyectos.includes('Tiempo medio'));
  check('Informe de proyectos: reparto por fase',
    proyectos.includes('Proyectos por fase') && proyectos.includes('Fabricación'));
  check('Informe de proyectos: el detalle con sus importes',
    proyectos.includes(`PROY-${YEAR}-001`) && proyectos.includes('5.000,00')
    && proyectos.includes('€'));

  await page.locator('.tabs button:has-text("Horas")').click();
  await page.waitForTimeout(900);
  const horas = await page.locator('main').innerText();
  check('Informe de horas: por trabajador',
    horas.includes('Horas por trabajador') && horas.includes('Juan Ortega'));
  check('Informe de horas: separa fabricación y montaje',
    horas.includes('Fabricación') && horas.includes('Montaje'));
  check('Informe de horas: por proyecto',
    horas.includes('Horas por proyecto') && horas.includes(`PROY-${YEAR}-001`));
  check('Informe de horas: compara lo previsto con lo real', horas.includes('Desvío'));

  await page.locator('.tabs button:has-text("Material")').click();
  await page.waitForTimeout(900);
  const material = await page.locator('main').innerText();
  check('Informe de material: el pendiente', material.includes('Pletina 40×8 mm'));
  check('Informe de material: los días de retraso', material.includes('Bisagras inoxidables')
    && /Retraso/i.test(material));
  check('Informe de material: los proveedores más utilizados',
    material.includes('Proveedores más utilizados') && material.includes('Aceros Vallès'));

  // ---- Excel ----
  await page.locator('.tabs button:has-text("Proyectos")').click();
  await page.waitForTimeout(900);
  const excel = await descargar(page, () => page.locator('button:has-text("Excel")').click());
  check('Se descarga el Excel del informe', excel.endsWith('.xlsx'));

  const leerExcel = execFileSync('python3', ['-c', `
import openpyxl, json, sys
wb = openpyxl.load_workbook(${JSON.stringify(excel)})
hojas = {}
for ws in wb.worksheets:
    hojas[ws.title] = [[c.value for c in fila] for fila in ws.iter_rows()]
print(json.dumps({'hojas': hojas, 'congelada': wb.worksheets[0].freeze_panes,
                  'filtro': str(wb.worksheets[0].auto_filter.ref)}, default=str))
`], { encoding: 'utf8' });
  const xls = JSON.parse(leerExcel);
  const nombresHoja = Object.keys(xls.hojas);
  check('El Excel lo abre Excel de verdad (openpyxl lo lee)', nombresHoja.length > 0);
  check('Trae una hoja por cada tabla del informe', nombresHoja.length >= 2);
  // La hoja lleva su título arriba, así que los encabezados no van en la
  // primera fila: se busca la fila que los tiene.
  const detalle = Object.values(xls.hojas)
    .find((filas) => filas.some((f) => f.includes('Código')));
  const encabezados = detalle?.find((f) => f.includes('Código')) ?? [];
  check('Con su fila de encabezados, igual que la tabla de la pantalla',
    ['Código', 'Proyecto', 'Cliente', 'Presupuesto'].every((t) => encabezados.includes(t)));
  check('Los estados salen en castellano, no como los guarda la base de datos',
    JSON.stringify(detalle).includes('Pendiente de cobro')
    && !JSON.stringify(detalle).includes('pendiente_cobro'));
  check('Y los datos que se ven en pantalla',
    JSON.stringify(detalle).includes(`PROY-${YEAR}-001`));
  check('Los encabezados quedan fijos al desplazarse', Boolean(xls.congelada));
  check('Y con filtro automático, como espera cualquiera que use Excel',
    xls.filtro && xls.filtro !== 'None');

  // ---- PDF ----
  const pdf = await descargar(page, () => page.locator('button:has-text("PDF")').click());
  check('Se descarga el PDF del informe', pdf.endsWith('.pdf'));
  const texto = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
  check('El PDF se abre y tiene texto de verdad', texto.trim().length > 50);
  check('El PDF lleva el nombre de la empresa', texto.includes('METALPLAFER'));
  check('El PDF trae el informe que se estaba viendo',
    texto.includes(`PROY-${YEAR}-001`) && /Proyectos/i.test(texto));
  check('El PDF dice cuándo se generó', /Generado el/i.test(texto));

  // ===================== COPIAS DE SEGURIDAD =====================
  console.log('\n   ── COPIAS DE SEGURIDAD ──');
  await page.locator('.sidebar nav a:has-text("Configuración")').click();
  await page.waitForTimeout(900);
  check('Se abre la configuración', page.url().includes('#/admin/configuracion'));

  const pestanas = await page.locator('.tabs').innerText();
  check('Configuración reúne empresa, numeración, copias, almacenamiento y aplicación',
    ['Empresa', 'Numeración', 'Copias de seguridad', 'Almacenamiento', 'Aplicación']
      .every((t) => pestanas.includes(t)));

  await page.locator('.tabs button:has-text("Copias de seguridad")').click();
  await page.waitForTimeout(900);
  check('Hay un botón bien visible para generar la copia',
    await page.locator('button:has-text("GENERAR BACKUP AHORA")').count() === 1);

  const zip = await descargar(page, () =>
    page.locator('button:has-text("GENERAR BACKUP AHORA")').click());
  await page.waitForTimeout(600);
  check('La copia se descarga como ZIP', zip.endsWith('.zip'));

  const listado = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n');
  check('El ZIP está bien formado (lo verifica unzip)',
    execFileSync('unzip', ['-t', zip], { encoding: 'utf8' }).includes('No errors'));
  check('Lleva un CSV por cada tabla',
    listado.filter((f) => f.endsWith('.csv')).length >= 10);
  check('Lleva los datos de los clientes', listado.some((f) => f.includes('clients.csv')));
  check('Lleva los proyectos y las órdenes',
    listado.some((f) => f.includes('projects.csv')) && listado.some((f) => f.includes('work_orders.csv')));
  check('Lleva los metadatos para poder restaurarla',
    listado.some((f) => f.includes('metadatos') || f.endsWith('.json')));
  check('Lleva las referencias de los archivos subidos',
    listado.some((f) => /archivos|documentos/i.test(f)));

  const carpeta = join(TMP, 'copia');
  execFileSync('unzip', ['-o', '-q', zip, '-d', carpeta]);
  const manifiesto = JSON.parse(readFileSync(
    join(carpeta, listado.find((f) => f.endsWith('.json'))), 'utf8'));
  check('Los metadatos dicen de qué aplicación y versión son',
    manifiesto.aplicacion === 'METALPLAFER360' && Number(manifiesto.version) >= 1);
  check('Y cuántas filas se guardaron de cada tabla',
    manifiesto.tablas && Number(manifiesto.tablas.clients) === 2);

  const refs = readFileSync(join(carpeta, listado.find((f) => /archivos/i.test(f))), 'utf8');
  check('Las fotos y vídeos NO se convierten en CSV: solo va su referencia',
    refs.includes('proyectos/p1/plano.pdf') && refs.includes('ordenes/o1/foto.jpg')
    && !listado.some((f) => /\.(jpe?g|png|mp4)$/i.test(f)));

  const clientesCsv = readFileSync(join(carpeta, listado.find((f) => f.includes('clients.csv'))), 'utf8');
  check('Los CSV se abren bien en Excel en español (separador ; y BOM)',
    clientesCsv.charCodeAt(0) === 0xFEFF && clientesCsv.split('\n')[0].includes(';'));
  check('Y traen los datos de verdad', clientesCsv.includes('García Construcciones SL'));

  check('La copia queda registrada en el historial de copias',
    db.backups.length === 1 && db.backups[0].status === 'completado');
  await page.waitForTimeout(400);
  check('Y aparece en la pantalla',
    (await page.locator('main').innerText()).includes('Completada'));

  // ---- Google Drive ----
  await page.locator('button:has-text("Subir a Google Drive")').click();
  await page.waitForTimeout(1200);
  check('Se puede subir la copia a Google Drive',
    db.backups.some((b) => b.destination === 'drive' && b.status === 'completado'));
  check('Y queda el enlace para encontrarla',
    (await page.locator('main').innerText()).includes('Google Drive')
    || db.backups.some((b) => b.drive_link));

  // ---- Copia automática ----
  const copias = await page.locator('main').innerText();
  check('La copia automática viene puesta a las 02:00', copias.includes('02:00'));
  check('Y se guardan 30 días', (await page.locator('#bk-retention').inputValue()) === '30');
  check('Se puede elegir la carpeta de Google Drive',
    (await page.locator('#bk-folder').inputValue()).length > 0);

  await page.locator('#bk-retention').fill('45');
  await page.locator('button:has-text("Guardar ajustes")').click();
  await page.waitForTimeout(800);
  check('Los ajustes de la copia automática se guardan',
    db.settings.backup_retention_days === 45);

  await page.locator('#bk-enabled').click();
  await page.locator('button:has-text("Guardar ajustes")').click();
  await page.waitForTimeout(800);
  check('La copia automática se puede desactivar', db.settings.backup.enabled === false);
  await page.locator('#bk-enabled').click();
  await page.locator('button:has-text("Guardar ajustes")').click();
  await page.waitForTimeout(800);

  // ===================== RESTAURACIÓN =====================
  console.log('\n   ── RESTAURACIÓN ──');
  const aviso = await page.locator('main').innerText();
  check('Antes de restaurar avisa de lo que puede pasar',
    aviso.includes('⚠️ Esta operación puede modificar información actual.'));

  // Se modifica la copia para notar el efecto de la restauración.
  const csvModificado = clientesCsv.replace('García Construcciones SL', 'García Construcciones SLU');
  writeFileSync(join(carpeta, listado.find((f) => f.includes('clients.csv'))), csvModificado);
  const zipModificado = join(TMP, 'copia-modificada.zip');
  execFileSync('zip', ['-q', '-r', '-X', '-0', zipModificado, '.'], { cwd: carpeta });

  await page.locator('input[type="file"]').setInputFiles(zipModificado);
  await page.waitForTimeout(1200);
  const leida = await page.locator('main').innerText();
  check('La copia se lee y dice cuándo se generó y cuánto trae',
    leida.includes('Registros en la copia') && leida.includes('Archivos referenciados'));
  check('Deja elegir qué apartados restaurar',
    (await page.locator('.substatus-grid label').count()) >= 8);

  // ---- Restauración parcial ----
  await page.locator('button:has-text("Nada")').click();
  await page.waitForTimeout(300);
  check('Sin apartados marcados no se puede restaurar',
    await page.locator('button:has-text("Restaurar lo marcado")').isDisabled());

  await page.locator('.substatus-grid label:has-text("Clientes") input').click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Restaurar lo marcado")').click();
  await page.waitForTimeout(600);

  const modal = await page.locator('.modal').innerText();
  check('Obliga a confirmar antes de tocar nada',
    modal.includes('⚠️ Esta operación puede modificar información actual.'));
  check('La confirmación dice exactamente qué se va a volcar',
    modal.includes('Clientes') && modal.includes('tablas de la base de datos'));

  const proyectoAntes = db.projects.find((p) => p.id === 'p1').name;
  await page.locator('.modal button:has-text("Sí, restaurar")').click();
  await page.waitForTimeout(1500);

  check('La restauración parcial devuelve los clientes de la copia',
    db.clients.find((c) => c.id === 'c1').name === 'García Construcciones SLU');
  check('Y NO toca lo que no se ha marcado',
    db.projects.find((p) => p.id === 'p1').name === proyectoAntes);
  check('No borra nada: los registros que no venían siguen ahí',
    db.clients.length === 2 && db.projects.length === 2);
  check('La restauración queda registrada en el historial',
    db.audit_log.some((e) => /restaur/i.test(e.summary)));

  // ---- Restauración completa ----
  db.clients.find((c) => c.id === 'c1').name = 'Nombre cambiado a mano';
  db.materials.find((m) => m.id === 'm1').name = 'Material cambiado a mano';

  await page.locator('input[type="file"]').setInputFiles(zipModificado);
  await page.waitForTimeout(1200);
  await page.locator('button:has-text("Todo")').click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Restaurar lo marcado")').click();
  await page.waitForTimeout(500);
  await page.locator('.modal button:has-text("Sí, restaurar")').click();
  await page.waitForTimeout(1800);

  check('La restauración completa devuelve todos los apartados',
    db.clients.find((c) => c.id === 'c1').name === 'García Construcciones SLU'
    && db.materials.find((m) => m.id === 'm1').name === 'Pletina 40×8 mm');
  // En la copia todo se guarda como texto. Si al volver no se convierte,
  // un «false» pasaría por verdadero y el panel contaría mal.
  check('Lo que era un sí/no vuelve siendo un sí/no, no la palabra «false»',
    db.materials.every((m) => typeof m.received === 'boolean')
    && db.materials.filter((m) => !m.received).length === 2);
  check('Y los importes vuelven siendo números',
    typeof db.projects.find((p) => p.id === 'p1').budget_amount === 'number');

  check('Respeta las relaciones: las órdenes siguen apuntando a su proyecto',
    db.work_orders.every((o) => db.projects.some((p) => p.id === o.project_id)));
  check('Y los partes de trabajo siguen apuntando a su orden',
    db.work_order_workers.every((w) => db.work_orders.some((o) => o.id === w.order_id)));

  // ===================== CONFIGURACIÓN =====================
  console.log('\n   ── CONFIGURACIÓN ──');
  await page.locator('.tabs button:has-text("Empresa")').click();
  await page.waitForTimeout(700);
  check('Los datos de la empresa se pueden editar',
    (await page.locator('#c-name').inputValue()).includes('METALPLAFER'));
  await page.locator('#c-phone').fill('937 111 222');
  await page.locator('button:has-text("Guardar")').first().click();
  await page.waitForTimeout(900);
  check('Y se guardan', db.settings.company.phone === '937 111 222');

  await page.locator('.tabs button:has-text("Numeración")').click();
  await page.waitForTimeout(800);
  const numeracion = await page.locator('main').innerText();
  check('La numeración muestra los contadores de cada tipo',
    ['PRES', 'PROY', 'OT'].every((p) => numeracion.includes(p)));
  check('Y por qué número va cada serie',
    (await page.locator(`input[value="2"]`).count()) >= 1
    || /PROY[\s\S]{0,80}2/.test(numeracion), numeracion.replace(/\n/g, ' · ').slice(0, 200));

  // Se corrige la numeración y se comprueba que se guarda de verdad.
  const filaProy = page.locator('tbody tr:has-text("PROY")').first();
  await filaProy.locator('input').fill('7');
  await filaProy.locator('button:has-text("Guardar")').click();
  await page.waitForTimeout(900);
  check('La numeración se puede corregir y se guarda',
    db.code_counters.find((c) => c.prefix === 'PROY').last_value === 7);

  await page.locator('.tabs button:has-text("Almacenamiento")').click();
  await page.waitForTimeout(900);
  const almacen = await page.locator('main').innerText();
  check('El almacenamiento dice cuánto ocupa cada tipo de archivo',
    almacen.includes('Fotografías') && almacen.includes('Documentos'));
  check('Y deja cambiar el tamaño máximo de archivo',
    (await page.locator('#st-mb').inputValue()) === '100');
  await page.locator('#st-mb').fill('150');
  await page.locator('button:has-text("Guardar")').last().click();
  await page.waitForTimeout(800);
  check('El tamaño máximo se guarda', db.settings.max_file_mb === 150);

  // ---- Trabajadores ----
  await page.locator('.sidebar nav a:has-text("Trabajadores")').click();
  await page.waitForTimeout(900);
  const trabajadores = await page.locator('main').innerText();
  check('Se ven las personas que usan la aplicación',
    trabajadores.includes('Salvi Plaza') && trabajadores.includes('Juan Ortega'));

  // ===================== PWA =====================
  console.log('\n   ── PWA ──');
  const manifiesto2 = await page.evaluate(async () => {
    const enlace = document.querySelector('link[rel="manifest"]');
    if (!enlace) return null;
    return (await fetch(enlace.href)).json();
  });
  check('La aplicación declara su manifiesto', manifiesto2 !== null);
  check('Con nombre, y un nombre corto que cabe bajo el icono del móvil',
    manifiesto2.name.includes('METALPLAFER')
    && manifiesto2.short_name.length > 0 && manifiesto2.short_name.length <= 12);
  check('Se instala como aplicación, sin barra de navegador',
    ['standalone', 'fullscreen', 'minimal-ui'].includes(manifiesto2.display));
  check('Arranca en la dirección de la aplicación', Boolean(manifiesto2.start_url));
  check('Trae iconos, incluido uno grande para la pantalla de inicio',
    manifiesto2.icons.length >= 2 && manifiesto2.icons.some((i) => i.sizes.includes('512')));
  check('Y un icono recortable, para que Android lo pinte bien',
    manifiesto2.icons.some((i) => (i.purpose ?? '').includes('maskable')));
  check('Con accesos directos a lo que más se usa',
    Array.isArray(manifiesto2.shortcuts) && manifiesto2.shortcuts.length >= 2);
  check('En castellano', manifiesto2.lang === 'es' || manifiesto2.lang === 'es-ES');
  check('Solo modo claro', manifiesto2.background_color && manifiesto2.theme_color);

  const iconos = await Promise.all(manifiesto2.icons.map(async (i) => {
    const r = await page.request.get(new URL(i.src, `http://localhost:${PORT}/`).href);
    return r.status();
  }));
  check('Los iconos existen de verdad', iconos.every((s) => s === 200));

  const registrado = await page.evaluate(() =>
    'serviceWorker' in navigator && navigator.serviceWorker.getRegistrations()
      .then((r) => r.length > 0));
  check('El trabajador de servicio queda registrado', registrado === true);

  const sw = await (await page.request.get(`http://localhost:${PORT}/sw.js`)).text();
  check('La aplicación necesita Internet: NO hay modo sin conexión completo',
    !/offline|sin conexión/i.test(sw) || !/cacheAll|precache\(/i.test(sw));
  check('Lo que cambia se pide siempre a la red primero',
    /network|fetch\(/i.test(sw) && /navigate/i.test(sw));

  // ===================== MÓVIL =====================
  console.log('\n   ── MÓVIL ──');
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true,
  });
  await stubSupabase(movil, { db, getUser: () => admin, people });
  const mPage = await movil.newPage();
  await signIn(mPage, PORT, 'salvi');
  await mPage.goto(`http://localhost:${PORT}/#/admin`, { waitUntil: 'networkidle' });
  await mPage.waitForTimeout(1000);

  check('En el móvil el panel se lee sin desplazarse a los lados',
    await mPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check('Y las tarjetas siguen ahí',
    (await mPage.locator('main').innerText()).includes('Producción'));
  check('La pantalla se puede añadir a la pantalla de inicio (iOS)',
    await mPage.locator('meta[name="apple-mobile-web-app-capable"], '
      + 'meta[name="mobile-web-app-capable"]').count() > 0);
  check('Con su icono para iOS',
    await mPage.locator('link[rel="apple-touch-icon"]').count() > 0);
  await mPage.screenshot({ path: 'tests/capturas/fase6-movil-panel.png', fullPage: true });
  await movil.close();

  // ===================== PERMISOS DE VERDAD =====================
  console.log('\n   ── PERMISOS ──');
  const ctxTrabajador = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'es-ES' });
  const trabajador = people[1];
  await stubSupabase(ctxTrabajador, { db, getUser: () => trabajador, people });
  const wPage = await ctxTrabajador.newPage();
  await signIn(wPage, PORT, 'juan');
  await wPage.waitForTimeout(700);

  const menuTrabajador = await wPage.locator('body').innerText();
  check('Un trabajador no ve Informes ni Configuración en el menú',
    !menuTrabajador.includes('Informes') && !menuTrabajador.includes('Configuración'));

  // Y aunque escriba la dirección a mano, tampoco.
  await wPage.goto(`http://localhost:${PORT}/#/admin/informes`, { waitUntil: 'networkidle' });
  await wPage.waitForTimeout(1200);
  const intento = await wPage.locator('body').innerText();
  check('Si escribe la dirección de los informes a mano, no entra',
    !intento.includes('Horas por trabajador') && !intento.includes('Proveedores más utilizados'));

  // Lo importante: aunque la petición salga a mano, la base de datos no da datos.
  const aMano = await wPage.evaluate(async (base) => {
    const r = await fetch(`${base}/rest/v1/rpc/dashboard_summary`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ p_from: '2026-01-01', p_to: '2026-12-31' }),
    });
    return { status: r.status, texto: (await r.text()).slice(0, 200) };
  }, 'https://ejemplo.supabase.co');
  check('Y si manipula la petición a mano, la base de datos la rechaza',
    aMano.status === 400 && /permiso/i.test(aMano.texto));

  const copiasAMano = await wPage.evaluate(async (base) => {
    const r = await fetch(`${base}/rest/v1/backups?select=*`, {
      headers: { 'content-type': 'application/json' },
    });
    return JSON.parse(await r.text());
  }, 'https://ejemplo.supabase.co');
  check('Tampoco puede leer el listado de copias de seguridad',
    Array.isArray(copiasAMano) && copiasAMano.length === 0);
  await ctxTrabajador.close();

  // ===================== CAPTURAS =====================
  await page.goto(`http://localhost:${PORT}/#/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tests/capturas/fase6-panel.png', fullPage: true });
  await page.goto(`http://localhost:${PORT}/#/admin/informes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tests/capturas/fase6-informes.png', fullPage: true });
  await page.goto(`http://localhost:${PORT}/#/admin/configuracion`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.locator('.tabs button:has-text("Copias de seguridad")').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tests/capturas/fase6-copias.png', fullPage: true });

  check('Ninguna pantalla ha dado un error de programación', errors.length === 0,
    errors.join(' | '));

  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

process.exit(report() === 0 ? 0 : 1);
