/**
 * METALPLAFER360 Â· Supabase de mentira para las pruebas de navegador.
 *
 * Imita lo justo de la API de Supabase (acceso, consultas, altas y
 * cambios) para poder recorrer la aplicaciÃ³n con datos en memoria.
 * Reproduce a propÃ³sito algunas reglas de la base de datos â€”los cÃ³digos
 * y los estados inicialesâ€” para que las pantallas se comporten igual.
 *
 * Las reglas de verdad se prueban contra PostgreSQL en tests/sql.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SUPABASE = 'https://ejemplo.supabase.co';
export const YEAR = new Date().getFullYear();

export const ADMIN = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Salvi Plaza', username: 'salvi', email: 'salvi@metalplafer.com',
  role: 'admin', phone: null, active: true, preferences: {}, is_demo: false,
  created_at: '2026-01-15T09:00:00Z', updated_at: '2026-01-15T09:00:00Z',
};

export const WORKER = {
  ...ADMIN, id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Juan Ortega', username: 'juan', email: 'juan@metalplafer.com',
  role: 'worker', phone: '600111222',
};

// ---------------------------------------------------------------------
// Construir y servir la aplicaciÃ³n
// ---------------------------------------------------------------------
export function buildApp() {
  console.log('   Construyendo la aplicaciÃ³n para la pruebaâ€¦');
  execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'error'], {
    cwd: ROOT, stdio: 'inherit',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: SUPABASE,
      VITE_SUPABASE_ANON_KEY: 'clave-de-ejemplo-solo-para-la-prueba',
      VITE_LOGIN_DOMAIN: 'metalplafer.com',
    },
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

export async function serveApp(port) {
  const dist = join(ROOT, 'dist');
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${port}`);
      let file = join(dist, normalize(decodeURIComponent(url.pathname)));
      if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
      const info = await stat(file).catch(() => null);
      if (!info || info.isDirectory()) file = join(dist, 'index.html');
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
         .end(await readFile(file));
    } catch { res.writeHead(404).end('no encontrado'); }
  });
  await new Promise((resolve) => server.listen(port, resolve));
  return server;
}

export async function launchBrowser() {
  const systemChrome = ['/opt/pw-browsers/chromium', process.env.CHROME_PATH]
    .filter(Boolean).find((p) => existsSync(p));
  return chromium.launch({
    args: ['--no-sandbox'],
    ...(systemChrome ? { executablePath: systemChrome } : {}),
  });
}

// ---------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------
export function createChecker() {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`   ${ok ? 'âœ“' : 'âœ—'} ${name}${ok || !detail ? '' : ` â†’ ${detail}`}`);
  };
  const report = () => {
    const failed = results.filter((r) => !r.ok);
    console.log('   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€');
    console.log(`   TOTAL: ${results.length - failed.length} de ${results.length} comprobaciones correctas`);
    return failed.length;
  };
  return { check, report };
}

// ---------------------------------------------------------------------
// Base de datos en memoria
// ---------------------------------------------------------------------
export const norm = (s) =>
  (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function createDb(seed = {}) {
  return {
    clients: [], client_contacts: [], fichas: [], projects: [], project_substatuses: [],
    work_orders: [], work_order_workers: [], notifications: [],
    project_workers: [], work_reports: [],
    non_working_days: [], calendar_notes: [],
    works: [], work_extras: [],
    materials: [], material_requests: [], payments: [],
    documents: [], comments: [], audit_log: [], backups: [],
    counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 0, OT: 0, PT: 0, OBRA: 0 },
    code_counters: [
      { prefix: 'PRES', year: YEAR, last_value: 0 }, { prefix: 'VIS', year: YEAR, last_value: 0 },
      { prefix: 'AVI', year: YEAR, last_value: 0 }, { prefix: 'PROY', year: YEAR, last_value: 0 },
      { prefix: 'OT', year: YEAR, last_value: 0 },
      { prefix: 'PT', year: YEAR, last_value: 0 },
      { prefix: 'OBRA', year: YEAR, last_value: 0 },
    ],
    drive: {
      connected: false, account_email: null, folder_id: null, folder_name: null,
      connected_at: null, last_ok_at: null, last_error: null,
    },
    settings: {
      id: 1,
      company: {
        name: 'METALPLAFER S.L.', tax_id: 'B12345678', phone: '937 000 000',
        address: 'Carrer del Ferro, 3', city: 'Sabadell', postal_code: '08203',
        email: 'taller@metalplafer.com',
      },
      max_file_mb: 100,
      gap_days: 1,
      backup_retention_days: 30,
      backup: { enabled: true, hour: 2, folder: 'METALPLAFER360 Â· Copias de seguridad' },
      updated_at: '2026-01-15T09:00:00Z',
    },
    ...seed,
  };
}

/** Fecha de hoy en Madrid, como 'YYYY-MM-DD'. */
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export const startOfMonth = (iso) => `${iso.slice(0, 7)}-01`;

/**
 * El dÃ­a laborable mÃ¡s cercano, mirando hacia atrÃ¡s (hoy, si se trabaja).
 *
 * Las pruebas de calendario necesitan una fecha que se PINTE: un tramo
 * planificado que cae en sÃ¡bado o domingo no se dibuja (asÃ­ se decidiÃ³ en
 * el BLOQUE 3), y la prueba fallarÃ­a solo por ejecutarse en fin de
 * semana. Se mira hacia atrÃ¡s para no salirse de la semana visible.
 */
export function diaLaborable(iso = today()) {
  let d = iso;
  for (let i = 0; i < 7; i++) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();   // 0 domingo, 6 sÃ¡bado
    if (dow !== 0 && dow !== 6) return d;
    d = addDays(d, -1);
  }
  return iso;
}

export function mondayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return addDays(iso, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7));
}

/**
 * El Â«orderÂ» de PostgREST. La base de datos de verdad ordena, asÃ­ que las
 * vistas de mentira tambiÃ©n: si no, una prueba de orden pasarÃ­a sola.
 */
function applyOrder(rows, url) {
  const order = url.searchParams.get('order');
  if (!order) return rows;
  const keys = order.split(',').map((part) => {
    const [col, ...rest] = part.split('.');
    return {
      col,
      sign: rest.includes('desc') ? -1 : 1,
      nullsLast: !rest.includes('nullsfirst'),
    };
  });
  return [...rows].sort((a, b) => {
    for (const { col, sign, nullsLast } of keys) {
      const x = a[col]; const y = b[col];
      const vacioX = x === null || x === undefined || x === '';
      const vacioY = y === null || y === undefined || y === '';
      if (vacioX && vacioY) continue;
      if (vacioX) return nullsLast ? 1 : -1;
      if (vacioY) return nullsLast ? -1 : 1;
      const diff = String(x).localeCompare(String(y)) * sign;
      if (diff) return diff;
    }
    return 0;
  });
}

/** Filtros de PostgREST que usa la aplicaciÃ³n. */
function applyFilters(rows, url) {
  let out = rows;
  for (const [key, raw] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) continue;

    if (key === 'or') {
      const terms = raw.replace(/^\(|\)$/g, '').split(',');
      out = out.filter((r) => terms.some((t) => {
        const col = t.split('.')[0];
        const value = t.split('.').slice(2).join('.');
        return norm(r[col]).includes(norm(value.replace(/%/g, '')));
      }));
      continue;
    }

    const [op, ...rest] = raw.split('.');
    const value = rest.join('.');
    out = out.filter((r) => {
      const cell = r[key];
      if (op === 'eq') {
        return String(cell) === value
          || (value === 'true' && cell === true) || (value === 'false' && cell === false);
      }
      if (op === 'neq') return String(cell) !== value;
      if (op === 'is') return value === 'null' ? cell === null || cell === undefined : Boolean(cell) === (value === 'true');
      if (op === 'not') {
        const [innerOp, ...innerRest] = value.split('.');
        const innerValue = innerRest.join('.');
        if (innerOp === 'is') return innerValue === 'null' ? cell !== null && cell !== undefined : true;
        if (innerOp === 'in') return !innerValue.replace(/^\(|\)$/g, '').split(',').includes(String(cell));
        return true;
      }
      if (op === 'in') return value.replace(/^\(|\)$/g, '').split(',').includes(String(cell));
      if (op === 'ilike') return norm(cell).includes(norm(value.replace(/%/g, '')));
      if (op === 'lt')  return String(cell) < value;
      if (op === 'lte') return String(cell) <= value;
      if (op === 'gt')  return String(cell) > value;
      if (op === 'gte') return String(cell) >= value;
      if (op === 'cs') {
        const wanted = value.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
        return Array.isArray(cell) && wanted.every((w) => cell.includes(w));
      }
      return true;
    });
  }
  return out;
}

/** Imagen mÃ­nima para imitar las fotografÃ­as guardadas. */
const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const ORDER_STATUS_ES = {
  pendiente: 'Pendiente', en_curso: 'En curso',
  realizada: 'Realizada Â· pendiente de revisiÃ³n', validada: 'Validada', devuelta: 'Devuelta',
};

const FICHA_STATUS_ES = {
  por_asignar: 'Por asignar', pendiente: 'Pendiente', avanzado: 'Presupuesto avanzado',
  por_revisar: 'Presupuesto por revisar', enviado: 'Presupuesto enviado',
  aceptado: 'Presupuesto aceptado', cancelado: 'Presupuesto cancelado',
  asignada: 'Asignada', realizada: 'Realizada', cancelada: 'Cancelada',
  asignado: 'Asignado', en_curso: 'En curso', realizado: 'Realizado', cerrado: 'Cerrado',
};

/** Apartados que se pueden restaurar por separado (igual que en la aplicaciÃ³n). */
const RESTORE_SCOPES = {
  clientes: ['clients', 'client_contacts'],
  fichas: ['fichas'],
  proyectos: ['projects', 'project_substatuses'],
  ordenes: ['work_orders', 'work_order_workers'],
  material: ['materials', 'material_requests'],
  cobros: ['payments'],
  documentos: ['documents', 'comments'],
  usuarios: ['profiles'],
  configuracion: ['app_settings', 'code_counters'],
  historial: ['audit_log'],
};

/**
 * Al restaurar, los valores llegan como texto (vienen de un CSV). La base
 * de datos los convierte al tipo de cada columna; aquÃ­ se imita mirando
 * quÃ© tipo tiene ese mismo dato en una fila que ya existe.
 */
function convertirFila(fila, referencia) {
  const salida = {};
  for (const [clave, valor] of Object.entries(fila)) {
    if (valor === null || valor === undefined) { salida[clave] = null; continue; }
    if (typeof valor !== 'string') { salida[clave] = valor; continue; }

    const modelo = referencia?.[clave];
    if (typeof modelo === 'boolean' || valor === 'true' || valor === 'false') {
      salida[clave] = valor === '' ? null : valor === 'true';
    } else if (typeof modelo === 'number') {
      salida[clave] = valor === '' ? null : Number(valor);
    } else if (valor === '' && modelo !== '') {
      salida[clave] = null;
    } else {
      salida[clave] = valor;
    }
  }
  return salida;
}

/** Orden de dependencia: primero lo que otros necesitan. */
const BACKUP_ORDER = [
  'app_settings', 'code_counters', 'profiles', 'clients', 'client_contacts', 'fichas',
  'projects', 'project_substatuses', 'work_orders', 'work_order_workers',
  'materials', 'material_requests', 'payments', 'documents', 'comments', 'audit_log',
];

/** Los informes enseÃ±an los estados en castellano, como label_es() en la base. */
const BILLING_LABEL = {
  por_facturar: 'Por facturar', pendiente_cobro: 'Pendiente de cobro',
  cobrado_parcial: 'Cobrado parcialmente', cobrado: 'Cobrado',
};

/** Tablas que se vacÃ­an al limpiar los datos de ejemplo, en orden. */
// La misma lista que Â«clear_demoÂ» en 31_obras.sql, en el mismo orden:
// de la tabla mÃ¡s dependiente a la menos.
const DEMO_TABLES = [
  'comments', 'documents', 'payments', 'material_requests', 'materials',
  'work_reports', 'project_workers',
  'work_order_workers', 'work_orders', 'project_substatuses',
  'calendar_notes', 'work_extras', 'projects', 'works',
  'fichas', 'client_contacts', 'clients',
  'non_working_days', 'notifications', 'audit_log',
];

const cuentaDemo = (filas) => (Array.isArray(filas) ? filas.filter((r) => r.is_demo).length : 0);

function demoResumen(db, people = []) {
  return {
    hay_datos: db.clients.some((c) => c.is_demo),
    clientes: cuentaDemo(db.clients),
    fichas: cuentaDemo(db.fichas),
    proyectos: cuentaDemo(db.projects),
    trabajadores: people.filter((p) => p.is_demo).length,
    ordenes: cuentaDemo(db.work_orders),
    materiales: cuentaDemo(db.materials),
    documentos: cuentaDemo(db.documents),
    cobros: cuentaDemo(db.payments),
  };
}

/**
 * Un ejemplo reducido: aquÃ­ solo hace falta comprobar que se pone, que
 * se ve y que al limpiarlo NO se lleva por delante lo de verdad. Los
 * volÃºmenes exactos (10 clientes, 15 fichasâ€¦) se prueban contra
 * PostgreSQL en tests/sql/70_tests_fase7.sql.
 */
function sembrarDemo(db, people) {
  const hoy = today();
  for (let i = 1; i <= 3; i++) {
    db.clients.push({
      id: `demo-c${i}`, kind: 'empresa', name: `Cliente de ejemplo ${i}`,
      tax_id: `B9900000${i}`, phone: '937 000 00' + i, email: null,
      address: 'Carrer de Prova, ' + i, city: 'Sabadell', postal_code: '08201',
      notes: null, active: true, archived_at: null, is_demo: true,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    db.projects.push({
      id: `demo-p${i}`, code: `PROY-${YEAR}-90${i}`, client_id: `demo-c${i}`, contact_id: null,
      source_ficha_id: null, name: `Proyecto de ejemplo ${i}`, description: null,
      measures: null, finish: null, location: null, address: null, observations: null,
      budget_amount: 1000 * i, advance_amount: null, budget_hours_fab: 8, budget_hours_mont: 4,
      phase: 'fabricacion', no_assembly: false, billing_status: 'por_facturar',
      finished_at: null, archived_at: null, is_demo: true,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    db.work_orders.push({
      id: `demo-o${i}`, code: `OT-${YEAR}-90${i}`, project_id: `demo-p${i}`,
      type: 'fabricacion', scheduled_date: hoy, description: 'Trabajo de ejemplo',
      planned_hours: 8, admin_notes: null, status: 'pendiente', submitted_at: null,
      validated_at: null, validated_by: null, returned_at: null, return_reason: null,
      archived_at: null, is_demo: true,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    db.materials.push({
      id: `demo-m${i}`, project_id: `demo-p${i}`, order_id: null,
      name: `Material de ejemplo ${i}`, units: 5, supplier: 'Proveedor de ejemplo',
      ordered_on: hoy, expected_on: hoy, received: false, notes: null,
      late_notified_on: null, archived_at: null, is_demo: true,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
  }
  people.push({
    id: 'demo-u1', full_name: 'Jordi Pujol Camps', username: 'demo.jordi',
    email: 'demo.jordi@demo.metalplafer', role: 'worker', phone: '600 111 002',
    active: true, preferences: {}, is_demo: true,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
}

const PREFIX = { presupuesto: 'PRES', visita: 'VIS', aviso: 'AVI' };
const NEXT_WHEN_ASSIGNED = { presupuesto: 'pendiente', visita: 'asignada', aviso: 'asignado' };
const PHASES = ['preparacion', 'fabricacion', 'montaje', 'facturacion', 'finalizado'];
const PHASE_LABEL = {
  preparacion: 'En preparaciÃ³n', fabricacion: 'FabricaciÃ³n', montaje: 'Montaje',
  facturacion: 'FacturaciÃ³n', finalizado: 'Finalizado',
};

/**
 * Instala el Supabase de mentira en un contexto del navegador.
 * `getUser` decide quiÃ©n ha iniciado sesiÃ³n (o null para fallar el acceso).
 */
export async function stubSupabase(context, {
  db, getUser = () => ADMIN, people = [ADMIN, WORKER], driveConfigured = true,
} = {}) {
  const actor = () => getUser() ?? ADMIN;
  const actorName = () => actor().full_name;

  const registrar = (summary, entityCode, entityType = 'x') => {
    db.audit_log.unshift({
      id: db.audit_log.length + 1, occurred_at: new Date().toISOString(),
      actor_id: actor().id, actor_name: actorName(), action: 'insert',
      entity_type: entityType, entity_id: null, entity_code: entityCode, summary, details: {},
    });
  };

  const avisar = (userId, kind, title, body, orderId) => {
    if (!userId || userId === actor().id) return;
    db.notifications.unshift({
      id: `noti-${Math.random().toString(36).slice(2, 8)}`,
      user_id: userId, kind, title, body: body ?? null, order_id: orderId ?? null,
      read_at: null, is_demo: false, created_at: new Date().toISOString(),
    });
  };

  const orderCaption = (order) => {
    const project = db.projects.find((p) => p.id === order.project_id);
    return `${order.code} Â· ${order.type === 'montaje' ? 'Montaje' : 'FabricaciÃ³n'} Â· `
      + `${order.scheduled_date.split('-').reverse().join('/')}`
      + (project ? ` Â· ${project.name}` : '');
  };

  /** Mismo recÃ¡lculo del estado de cobro que hace la base de datos. */
  const recomputeBilling = (project) => {
    const total = Number(project.budget_amount ?? 0);
    const cobrado = db.payments.filter((p) => p.project_id === project.id && !p.voided_at)
      .reduce((t, p) => t + Number(p.amount), 0);
    const antes = project.billing_status;
    if (cobrado > 0 && total > 0 && cobrado >= total) project.billing_status = 'cobrado';
    else if (cobrado > 0) project.billing_status = 'cobrado_parcial';
    else if (['cobrado', 'cobrado_parcial'].includes(antes)) project.billing_status = 'pendiente_cobro';
    project.updated_at = new Date().toISOString();
  };

  /** Mismo recÃ¡lculo que hace la base de datos con los partes. */
  const recompute = (order) => {
    if (order.status === 'validada') return;
    const parts = db.work_order_workers.filter((w) => w.order_id === order.id);
    const sent = parts.filter((w) => w.submitted_at).length;
    const touched = parts.filter((w) => w.submitted_at || Number(w.hours ?? 0) > 0
      || (w.work_done ?? '').trim()).length;
    if (parts.length > 0 && sent === parts.length) {
      order.status = 'realizada';
      order.submitted_at = order.submitted_at ?? new Date().toISOString();
    } else if (touched > 0) {
      order.status = 'en_curso';
      order.submitted_at = null;
    } else if (order.status !== 'devuelta') {
      order.status = 'pendiente';
      order.submitted_at = null;
    }
    order.updated_at = new Date().toISOString();
  };

  const embed = (table, row) => {
    if (table === 'clients') {
      const fichas = db.fichas.filter((f) => f.client_id === row.id && !f.archived_at);
      return {
        ...row,
        activity: {
          client_id: row.id,
          budgets: fichas.filter((f) => f.type === 'presupuesto').length,
          visits: fichas.filter((f) => f.type === 'visita').length,
          notices: fichas.filter((f) => f.type === 'aviso').length,
          open_notices: fichas.filter((f) => f.type === 'aviso' && !['realizado', 'cerrado'].includes(f.status)).length,
          last_activity: fichas[0]?.created_at ?? null,
        },
      };
    }
    if (table === 'fichas') {
      const client = db.clients.find((c) => c.id === row.client_id) ?? null;
      const person = people.find((p) => p.id === row.assigned_to) ?? null;
      return {
        ...row,
        client: client ? { id: client.id, name: client.name, phone: client.phone, kind: client.kind } : null,
        contact: null,
        assignee: person ? { id: person.id, full_name: person.full_name } : null,
      };
    }
    if (table === 'projects') {
      const client = db.clients.find((c) => c.id === row.client_id) ?? null;
      const source = db.fichas.find((f) => f.id === row.source_ficha_id) ?? null;
      const contact = db.client_contacts.find((k) => k.id === row.contact_id) ?? null;
      return {
        ...row,
        client: client
          ? { id: client.id, name: client.name, phone: client.phone, kind: client.kind, address: client.address }
          : null,
        contact: contact ? { id: contact.id, name: contact.name, phone: contact.phone } : null,
        source: source ? { id: source.id, code: source.code } : null,
        substatuses: db.project_substatuses
          .filter((s) => s.project_id === row.id)
          .map((s) => ({ phase: s.phase, substatus: s.substatus })),
        // BLOQUE 4: la obra que lo agrupa, si pertenece a alguna.
        work: (() => {
          const w = (db.works ?? []).find((x) => x.id === row.work_id);
          return w ? { id: w.id, code: w.code, name: w.name } : null;
        })(),
      };
    }
    if (table === 'works') {
      const client = db.clients.find((c) => c.id === row.client_id) ?? null;
      return { ...row, client: client ? { id: client.id, name: client.name } : null };
    }
    if (table === 'work_orders') {
      const project = db.projects.find((p) => p.id === row.project_id) ?? null;
      const client = project ? db.clients.find((c) => c.id === project.client_id) ?? null : null;
      const validator = people.find((p) => p.id === row.validated_by) ?? null;
      return {
        ...row,
        project: project ? {
          id: project.id, code: project.code, name: project.name, address: project.address,
          phase: project.phase, measures: project.measures, finish: project.finish,
          location: project.location,
          client: client ? { id: client.id, name: client.name, phone: client.phone } : null,
        } : null,
        validator: validator ? { full_name: validator.full_name } : null,
      };
    }
    if (table === 'work_order_workers') {
      const worker = people.find((p) => p.id === row.worker_id) ?? null;
      const order = db.work_orders.find((o) => o.id === row.order_id) ?? null;
      return {
        ...row,
        worker: worker ? { id: worker.id, full_name: worker.full_name } : null,
        order: order
          ? { scheduled_date: order.scheduled_date, status: order.status, archived_at: order.archived_at }
          : null,
      };
    }
    if (table === 'materials') {
      const project = db.projects.find((p) => p.id === row.project_id) ?? null;
      const order = db.work_orders.find((o) => o.id === row.order_id) ?? null;
      return {
        ...row,
        project: project ? { id: project.id, code: project.code, name: project.name } : null,
        order: order ? { id: order.id, code: order.code } : null,
      };
    }
    if (table === 'work_reports') {
      const worker = people.find((x) => x.id === row.worker_id) ?? null;
      const project = db.projects.find((x) => x.id === row.project_id) ?? null;
      return {
        ...row,
        worker: worker ? { id: worker.id, full_name: worker.full_name } : null,
        project: project ? { id: project.id, code: project.code, name: project.name } : null,
      };
    }
    if (table === 'material_requests') {
      const worker = people.find((p) => p.id === row.worker_id) ?? null;
      const project = db.projects.find((p) => p.id === row.project_id) ?? null;
      const order = db.work_orders.find((o) => o.id === row.order_id) ?? null;
      return {
        ...row,
        worker: worker ? { id: worker.id, full_name: worker.full_name } : null,
        project: project ? { id: project.id, code: project.code, name: project.name } : null,
        order: order ? { id: order.id, code: order.code } : null,
      };
    }
    if (table === 'comments') {
      const author = people.find((p) => p.id === row.author_id) ?? ADMIN;
      return { ...row, author: { full_name: author.full_name, role: author.role } };
    }
    if (table === 'documents') {
      const uploader = people.find((p) => p.id === row.uploaded_by) ?? ADMIN;
      return { ...row, uploader: { full_name: uploader.full_name } };
    }
    return row;
  };

  // -------------------------------------------------------------------
  // Se imitan los permisos de la base de datos: un trabajador solo ve sus
  // Ã³rdenes, sus partes, sus avisos y los proyectos de esas Ã³rdenes.
  // (Las reglas de verdad se prueban contra PostgreSQL en tests/sql.)
  // -------------------------------------------------------------------
  const myOrderIds = (user) => new Set(
    db.work_order_workers.filter((w) => w.worker_id === user.id).map((w) => w.order_id),
  );

  /**
   * A quÃ© proyectos entra una persona: por estar asignada (BLOQUE 1) o,
   * mientras las Ã³rdenes sigan existiendo, por tener una orden viva.
   */
  const assignedProjects = (user) => {
    const mine = myOrderIds(user);
    const ids = new Set(
      db.work_orders.filter((o) => mine.has(o.id) && !o.archived_at).map((o) => o.project_id),
    );
    (db.project_workers ?? [])
      .filter((pw) => pw.worker_id === user.id)
      .forEach((pw) => ids.add(pw.project_id));
    return ids;
  };

  /** Â¿Se trabaja ese dÃ­a? Lunes a viernes y que no sea festivo. */
  const esLaborable = (day) => {
    const d = new Date(`${day}T12:00:00`);
    const dow = d.getDay();            // 0 domingo, 6 sÃ¡bado
    if (dow === 0 || dow === 6) return false;
    return !(db.non_working_days ?? []).some((x) => x.day === day);
  };
  const sumarDias = (day, n) => {
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const siguienteLaborable = (day) => {
    let d = day;
    for (let i = 0; i < 400 && !esLaborable(d); i++) d = sumarDias(d, 1);
    return d;
  };
  const sumarLaborables = (day, n) => {
    let d = siguienteLaborable(day);
    for (let i = 0; i < n; i++) d = siguienteLaborable(sumarDias(d, 1));
    return d;
  };
  const finDeTramo = (desde, dias) => sumarLaborables(desde, Math.max(dias, 1) - 1);
  const diasDeTrabajo = (horas, gente) => (Number(horas) > 0
    ? Math.max(1, Math.ceil(Number(horas) / Math.max(Number(gente) || 2, 1) / 8))
    : 0);
  const margenLibre = () => Math.max(Math.floor(Number(db.settings.gap_days ?? 1)), 0);

  /** Los dÃ­as que ocupa un tramo (los no laborables no se pintan). */
  const diasDelTramo = (desde, hasta, aMano) => {
    const out = [];
    let d = desde;
    for (let i = 0; i < 400 && d <= hasta; i++) {
      if (aMano || esLaborable(d)) out.push(d);
      d = sumarDias(d, 1);
    }
    return out;
  };

  const visible = (table, rows) => {
    const user = getUser();
    if (!user || user.role === 'admin') return rows;
    const mine = myOrderIds(user);
    const myProjects = assignedProjects(user);
    if (table === 'work_orders') return rows.filter((r) => mine.has(r.id) && !r.archived_at);
    if (table === 'work_order_workers') return rows.filter((r) => r.worker_id === user.id);
    if (table === 'notifications') return rows.filter((r) => r.user_id === user.id);
    // BLOQUE 1: Â«projectsÂ» es de administraciÃ³n. AhÃ­ estÃ¡n el importe y la
    // paga y seÃ±al, y RLS filtra filas, no columnas: el trabajador no saca
    // ni una. Entra por la vista Â«worker_projectsÂ», que no las tiene.
    if (table === 'projects') return [];
    if (table === 'work_reports') return rows.filter((r) => r.worker_id === user.id);
    if (table === 'project_workers') {
      return rows.filter((r) => assignedProjects(user).has(r.project_id));
    }
    if (table === 'clients') {
      const ids = new Set(db.projects.filter((p) => myProjects.has(p.id)).map((p) => p.client_id));
      return rows.filter((r) => ids.has(r.id));
    }
    // BLOQUE 5: Â«fichasÂ» guarda el IMPORTE y RLS filtra filas, no
    // columnas. La tabla es de administraciÃ³n; el trabajador entra por
    // Â«worker_fichasÂ», que se construye sin la columna del dinero.
    if (table === 'fichas') return [];
    if (table === 'documents' || table === 'comments') {
      const misPartes = new Set(db.work_reports.filter((x) => x.worker_id === user.id)
        .map((x) => x.id));
      const suyo = (r) => (r.order_id && mine.has(r.order_id))
        || (r.project_id && myProjects.has(r.project_id))
        || (r.report_id && misPartes.has(r.report_id));
      // BLOQUE 2: la documentaciÃ³n administrativa no se le devuelve, y
      // el almacÃ©n tampoco le firmarÃ­a el enlace del archivo.
      if (table === 'documents') {
        return rows.filter((r) => suyo(r) && r.scope !== 'administrativa');
      }
      return rows.filter(suyo);
    }
    if (table === 'audit_log') return rows.filter((r) => r.actor_id === user.id);
    if (table === 'materials') return rows.filter((r) => myProjects.has(r.project_id));
    if (table === 'material_requests') return rows.filter((r) => r.worker_id === user.id);
    // EconÃ³mico y administraciÃ³n: un trabajador no ve nada de esto, aunque
    // pida la tabla a mano. (En Supabase lo impiden las polÃ­ticas RLS.)
    // BLOQUE 4: las obras, sus extras y sus cuentas, lo mismo.
    if (table === 'payments' || table === 'backups' || table === 'code_counters'
        || table === 'works' || table === 'work_extras') return [];
    return rows;
  };

  await context.route(`${SUPABASE}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const wantsObject = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object+json');
    const wantsCount = (request.headers()['prefer'] ?? '').includes('count=exact');
    const body = () => { try { return request.postDataJSON(); } catch { return null; } };

    /** Casi todo lo de administraciÃ³n se comprueba asÃ­. */
    const soloAdmin = () => (getUser()?.role !== 'admin');

    const json = (data, extraHeaders = {}) => route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-expose-headers': 'content-range',
        ...extraHeaders,
      },
      body: JSON.stringify(data),
    });

    const count = (total) => route.fulfill({
      status: 206,
      headers: {
        'content-type': 'application/json',
        'content-range': `0-0/${total}`,
        'access-control-expose-headers': 'content-range',
      },
      body: '[]',
    });

    const fail = (message, code = '22023') => route.fulfill({
      status: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, code }),
    });

    // ---------------- Almacenamiento de archivos ----------------
    if (path.startsWith('/storage/v1/')) {
      const rest = path.replace('/storage/v1/', '');

      // Miniaturas y enlaces temporales: se devuelve una imagen real para
      // que el navegador pueda pintarla igual que lo harÃ­a Supabase.
      if (method === 'GET') {
        return route.fulfill({
          status: 200, headers: { 'content-type': 'image/png' },
          body: Buffer.from(PIXEL_PNG, 'base64'),
        });
      }

      if (method === 'POST' && rest.startsWith('object/sign/documentos')) {
        const paths = body()?.paths;
        if (Array.isArray(paths)) {
          return json(paths.map((p) => ({
            path: p, error: null, signedURL: `/object/sign/documentos/${p}?token=prueba`,
          })));
        }
        const single = rest.replace('object/sign/documentos/', '');
        return json({ signedURL: `/object/sign/documentos/${single}?token=prueba` });
      }

      if (method === 'POST' || method === 'PUT') {
        return json({ Key: rest.replace('object/', '') });
      }
      return json({ message: 'ok' });
    }

    // ---------------- Acceso ----------------
    if (path.startsWith('/auth/v1/token')) {
      const user = getUser();
      if (!user) {
        return route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
        });
      }
      return json({
        access_token: 'token-de-prueba', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresco',
        user: {
          id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated',
          app_metadata: {}, user_metadata: {}, created_at: user.created_at,
        },
      });
    }
    if (path.startsWith('/auth/v1/')) return route.fulfill({ status: 204, body: '' });

    // ---------------- Funciones ----------------
    if (path === '/rest/v1/rpc/client_config') {
      return json({ max_file_mb: 100, company_name: 'METALPLAFER S.L.' });
    }

    if (path === '/rest/v1/rpc/suggest_clients') {
      const query = norm(body()?.p_query ?? '');
      const words = query.split(/\s+/).filter((w) => w.length >= 3);
      const cif = (body()?.p_query ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const hits = db.clients.filter((c) => !c.archived_at && (
        norm(c.name).includes(query)
        || words.some((w) => norm(c.name).includes(w))
        || (cif.length >= 3 && (c.tax_id ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().startsWith(cif))
      ));
      return json(hits.slice(0, 6).map((c) => ({ ...c, score: 1 })));
    }

    // ---- BLOQUE 1 Â· asignar trabajadores y mover partes --------------

    if (path === '/rest/v1/rpc/assign_project_workers') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const { p_project: proyecto, p_workers: ids = [] } = body() ?? {};
      const antes = new Set(db.project_workers
        .filter((pw) => pw.project_id === proyecto).map((pw) => pw.worker_id));
      db.project_workers = db.project_workers.filter((pw) => pw.project_id !== proyecto
        || ids.includes(pw.worker_id));
      ids.filter((id) => !antes.has(id)).forEach((id) => {
        db.project_workers.push({
          project_id: proyecto, worker_id: id,
          assigned_at: new Date().toISOString(), assigned_by: actor().id, is_demo: false,
        });
        const persona = people.find((x) => x.id === id);
        const pr = db.projects.find((x) => x.id === proyecto);
        registrar(`${actorName()} asignÃ³ a ${persona?.full_name ?? ''} al proyecto ${pr?.code ?? ''}`,
          pr?.code ?? null, 'project_workers');
        avisar(id, 'proyecto_asignado', 'Proyecto asignado', `${pr?.code} Â· ${pr?.name}`, null);
      });
      return json(ids.map((id) => people.find((x) => x.id === id)).filter(Boolean));
    }

    if (path === '/rest/v1/rpc/save_work_report') {
      const user = getUser();
      if (!user) return fail('Hace falta tener la sesiÃ³n iniciada', '42501');
      const b = body() ?? {};
      const horas = b.p_hours == null ? null : Math.round(Number(b.p_hours) * 100) / 100;
      const hecho = (b.p_work_done ?? '').trim() || null;
      const dia = b.p_work_date ?? today();

      if (horas != null && (horas <= 0 || horas > 24)) {
        return fail('Las horas deben estar entre 0 y 24');
      }
      if (dia > today()) {
        return fail('No se puede rellenar un parte de un dÃ­a que todavÃ­a no ha llegado');
      }
      if (b.p_submit && !hecho) return fail('Escribe quÃ© trabajo has hecho antes de enviar el parte');
      if (b.p_submit && !horas) return fail('Indica las horas que has trabajado antes de enviar el parte');

      let parte = b.p_report ? db.work_reports.find((r) => r.id === b.p_report) : null;
      if (b.p_report && !parte) return fail('No se encuentra el parte de trabajo', 'P0002');
      if (parte && parte.worker_id !== user.id) return fail('Ese parte no es tuyo', '42501');
      if (parte && parte.status === 'validado') {
        return fail('El parte ya estÃ¡ validado: no se puede modificar');
      }

      const estado = b.p_submit ? 'enviado' : 'borrador';
      if (!parte) {
        db.counters.PT += 1;
        parte = {
          id: `pt-${Math.random().toString(36).slice(2, 10)}`,
          code: `PT-${YEAR}-${String(db.counters.PT).padStart(3, '0')}`,
          worker_id: user.id, project_id: b.p_project ?? null,
          work_type: b.p_work_type ?? 'fabricacion', work_date: dia,
          work_done: hecho, hours: horas, needs_material: Boolean(b.p_needs_material),
          status: estado, submitted_at: b.p_submit ? new Date().toISOString() : null,
          validated_at: null, validated_by: null, rejected_at: null, reject_reason: null,
          assigned_at: null, assigned_by: null, is_demo: false,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        db.work_reports.unshift(parte);
      } else {
        Object.assign(parte, {
          project_id: b.p_project ?? parte.project_id,
          work_type: b.p_work_type ?? parte.work_type, work_date: dia,
          work_done: hecho, hours: horas, needs_material: Boolean(b.p_needs_material),
          status: estado, submitted_at: b.p_submit ? new Date().toISOString() : null,
          rejected_at: b.p_submit ? null : parte.rejected_at,
          reject_reason: b.p_submit ? null : parte.reject_reason,
          updated_at: new Date().toISOString(),
        });
      }

      if (b.p_submit) {
        registrar(`${actorName()} enviÃ³ el parte ${parte.code} (${horas} h) a validar`,
          parte.code, 'work_reports');
        people.filter((x) => x.role === 'admin')
          .forEach((a) => avisar(a.id, 'parte_enviado', 'Parte pendiente de validaciÃ³n',
            `${actorName()} ha enviado el parte ${parte.code}`, null));
      }
      return json(parte);
    }

    if (path === '/rest/v1/rpc/validate_work_report') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const parte = db.work_reports.find((r) => r.id === body()?.p_report);
      if (!parte) return fail('No se encuentra el parte de trabajo', 'P0002');
      if (parte.status !== 'enviado') {
        return fail('Solo se valida un parte que estÃ© pendiente de validaciÃ³n');
      }
      Object.assign(parte, {
        status: 'validado', validated_at: new Date().toISOString(), validated_by: actor().id,
        rejected_at: null, reject_reason: null, updated_at: new Date().toISOString(),
      });
      registrar(`${actorName()} validÃ³ el parte ${parte.code} Â· ${parte.hours} h`,
        parte.code, 'work_reports');
      avisar(parte.worker_id, 'parte_validado', 'Parte validado', parte.code, null);
      return json(parte);
    }

    if (path === '/rest/v1/rpc/reject_work_report') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const motivo = (body()?.p_reason ?? '').trim();
      if (!motivo) return fail('Escribe el motivo del rechazo');
      const parte = db.work_reports.find((r) => r.id === body()?.p_report);
      if (!parte) return fail('No se encuentra el parte de trabajo', 'P0002');
      if (!['enviado', 'validado'].includes(parte.status)) {
        return fail('Solo se rechaza un parte que ya se haya enviado');
      }
      Object.assign(parte, {
        status: 'rechazado', rejected_at: new Date().toISOString(), reject_reason: motivo,
        validated_at: null, validated_by: null, updated_at: new Date().toISOString(),
      });
      db.comments.unshift({
        id: `c-${Math.random().toString(36).slice(2, 8)}`, report_id: parte.id,
        ficha_id: null, project_id: null, order_id: null,
        author_id: actor().id, target_worker_id: parte.worker_id,
        body: `Parte rechazado. Motivo: ${motivo}`,
        created_at: new Date().toISOString(),
        author: { full_name: actorName(), role: 'admin' },
      });
      registrar(`${actorName()} rechazÃ³ el parte ${parte.code}. Motivo: ${motivo}`,
        parte.code, 'work_reports');
      avisar(parte.worker_id, 'parte_rechazado', 'Parte rechazado', motivo, null);
      return json(parte);
    }

    if (path === '/rest/v1/rpc/assign_report_to_project') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const parte = db.work_reports.find((r) => r.id === body()?.p_report);
      if (!parte) return fail('No se encuentra el parte de trabajo', 'P0002');
      const proyecto = body()?.p_project ?? null;
      Object.assign(parte, {
        project_id: proyecto,
        assigned_at: proyecto ? new Date().toISOString() : null,
        assigned_by: proyecto ? actor().id : null,
        updated_at: new Date().toISOString(),
      });
      const pr = db.projects.find((x) => x.id === proyecto);
      registrar(`${actorName()} asignÃ³ el parte ${parte.code} al proyecto ${pr?.code ?? ''}`,
        parte.code, 'work_reports');
      return json(parte);
    }

    if (path === '/rest/v1/rpc/submit_material_request_report') {
      const parte = db.work_reports.find((r) => r.id === body()?.p_report);
      if (!parte) return fail('No se encuentra el parte de trabajo', 'P0002');
      const texto = (body()?.p_body ?? '').trim();
      if (!texto) return fail('Escribe quÃ© material falta');
      if (!parte.project_id) {
        return fail('Este parte todavÃ­a no tiene proyecto: el aviso de material va contra un proyecto');
      }
      const peticion = {
        id: `mr-${Math.random().toString(36).slice(2, 8)}`,
        project_id: parte.project_id, order_id: null, worker_id: actor().id,
        body: texto, status: 'pendiente', reviewed_at: null, reviewed_by: null,
        review_note: null, material_id: null, is_demo: false,
        created_at: new Date().toISOString(),
      };
      db.material_requests.unshift(peticion);
      parte.needs_material = true;
      return json(peticion);
    }

    // ---- BLOQUE 2 Â· categorÃ­as de documentaciÃ³n y borrado ------------

    if (path === '/rest/v1/rpc/move_document_scope') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const doc = db.documents.find((d) => d.id === body()?.p_doc);
      if (!doc) return fail('No se encuentra el documento', 'P0002');
      const destino = body()?.p_scope;
      if (doc.scope === destino) return json(doc);
      const antes = doc.scope ?? 'tecnica';
      doc.scope = destino;
      const nombres = { tecnica: 'documentaciÃ³n tÃ©cnica', administrativa: 'documentaciÃ³n administrativa' };
      const donde = db.projects.find((x) => x.id === doc.project_id)?.code
        ?? db.fichas.find((x) => x.id === doc.ficha_id)?.code ?? null;
      registrar(`${actorName()} moviÃ³ Â«${doc.file_name}Â» de ${nombres[antes]} a ${nombres[destino]}`
        + (donde ? ` en ${donde}` : ''), donde, 'documents');
      return json(doc);
    }

    if (path === '/rest/v1/rpc/delete_worker') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const id = body()?.p_user;
      const persona = people.find((x) => x.id === id);
      if (!persona) return fail('No se encuentra esa persona', 'P0002');
      if (id === actor().id) return fail('No puedes eliminarte a ti mismo');
      const partes = db.work_reports.filter((r) => r.worker_id === id && r.status !== 'borrador').length;
      const ordenes = db.work_order_workers.filter((w) => w.worker_id === id).length;
      const material = db.material_requests.filter((m) => m.worker_id === id).length;
      if (partes || ordenes || material) {
        return fail(
          `No se puede eliminar a ${persona.full_name} porque tiene trabajo registrado: `
          + `${partes} partes, ${ordenes} Ã³rdenes y ${material} avisos de material. `
          + 'DesactÃ­valo en lugar de eliminarlo: dejarÃ¡ de entrar y su trabajo se conserva.',
          '23503');
      }
      db.work_reports = db.work_reports.filter((r) => r.worker_id !== id);
      db.project_workers = db.project_workers.filter((pw) => pw.worker_id !== id);
      const i = people.findIndex((x) => x.id === id);
      if (i >= 0) people.splice(i, 1);
      registrar(`${actorName()} eliminÃ³ al trabajador ${persona.full_name} (${persona.username})`,
        null, 'profiles');
      return json({ ok: true, nombre: persona.full_name, borradores_eliminados: 0 });
    }

    if (path === '/rest/v1/rpc/delete_ficha') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const id = body()?.p_ficha;
      const f = db.fichas.find((x) => x.id === id);
      if (!f) return fail('No se encuentra la ficha', 'P0002');
      const origen = db.projects.find((x) => x.source_ficha_id === id);
      if (origen) {
        return fail(`No se puede eliminar ${f.code} porque de aquÃ­ saliÃ³ el proyecto `
          + `${origen.code}. ArchÃ­vala en lugar de eliminarla.`, '23503');
      }
      const docs = db.documents.filter((d) => d.ficha_id === id).length;
      const coment = db.comments.filter((c) => c.ficha_id === id).length;
      db.documents = db.documents.filter((d) => d.ficha_id !== id);
      db.comments = db.comments.filter((c) => c.ficha_id !== id);
      db.fichas = db.fichas.filter((x) => x.id !== id);
      registrar(`${actorName()} eliminÃ³ la ficha ${f.code}`, f.code, 'fichas');
      return json({ ok: true, code: f.code, documentos: docs, comentarios: coment });
    }

    if (path === '/rest/v1/rpc/delete_project') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const id = body()?.p_project;
      const pr = db.projects.find((x) => x.id === id);
      if (!pr) return fail('No se encuentra el proyecto', 'P0002');
      const cobros = db.payments.filter((x) => x.project_id === id && !x.voided_at).length;
      const horas = db.work_reports
        .filter((r) => r.project_id === id && r.status === 'validado')
        .reduce((n, r) => n + Number(r.hours ?? 0), 0)
        + db.work_orders.filter((o) => o.project_id === id && o.status === 'validada')
          .flatMap((o) => db.work_order_workers.filter((w) => w.order_id === o.id))
          .reduce((n, w) => n + Number(w.hours ?? 0), 0);
      if (cobros > 0 || horas > 0) {
        return fail(`No se puede eliminar ${pr.code} porque tiene ${cobros} cobro(s) y `
          + `${horas} h de trabajo ya validado. ArchÃ­valo en lugar de eliminarlo: `
          + 'desaparece de los listados y no se pierde nada.', '23503');
      }
      const docs = db.documents.filter((d) => d.project_id === id).length;
      const ordenes = db.work_orders.filter((o) => o.project_id === id).length;
      db.documents = db.documents.filter((d) => d.project_id !== id);
      db.comments = db.comments.filter((c) => c.project_id !== id);
      db.materials = db.materials.filter((m) => m.project_id !== id);
      db.material_requests = db.material_requests.filter((m) => m.project_id !== id);
      db.payments = db.payments.filter((x) => x.project_id !== id);
      db.work_orders = db.work_orders.filter((o) => o.project_id !== id);
      db.project_workers = db.project_workers.filter((pw) => pw.project_id !== id);
      db.work_reports.forEach((r) => { if (r.project_id === id) r.project_id = null; });
      db.projects = db.projects.filter((x) => x.id !== id);
      registrar(`${actorName()} eliminÃ³ el proyecto ${pr.code} Â· ${pr.name} `
        + `(${docs} archivos, ${ordenes} Ã³rdenes, 0 materiales)`, pr.code, 'projects');
      return json({ ok: true, code: pr.code, documentos: docs, ordenes, partes_desvinculados: 0 });
    }

    // ---- BLOQUE 3 Â· planificaciÃ³n y calendario -----------------------

    if (path === '/rest/v1/rpc/plan_project') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const pr = db.projects.find((x) => x.id === body()?.p_project);
      if (!pr) return fail('No se encuentra el proyecto', 'P0002');
      const fase = body()?.p_phase ?? 'ambas';
      const desde = body()?.p_from ?? today();

      /** El primer hueco libre de esa agenda, esquivando lo ya colocado. */
      const buscarHueco = (agenda, dias, from) => {
        let inicio = siguienteLaborable(from);
        for (let i = 0; i < 500; i++) {
          const fin = finDeTramo(inicio, dias);
          const choque = db.projects
            .filter((x) => x.id !== pr.id && !x.archived_at)
            .map((x) => (agenda === 'fabricacion'
              ? { s: x.fab_start, e: x.fab_end } : { s: x.mont_start, e: x.mont_end }))
            .filter((x) => x.s && x.s <= fin && x.e >= inicio)
            .sort((a, b) => (a.e < b.e ? 1 : -1))[0];
          if (!choque) return inicio;
          inicio = sumarLaborables(sumarDias(choque.e, 1), margenLibre());
        }
        return inicio;
      };

      if ((fase === 'fabricacion' || fase === 'ambas') && !pr.fab_manual) {
        const dias = diasDeTrabajo(pr.budget_hours_fab, pr.fab_workers ?? 2);
        if (dias > 0) {
          pr.fab_start = buscarHueco('fabricacion', dias, desde);
          pr.fab_end = finDeTramo(pr.fab_start, dias);
        }
      }
      if ((fase === 'montaje' || fase === 'ambas') && !pr.mont_manual && !pr.no_assembly) {
        const dias = diasDeTrabajo(pr.budget_hours_mont, pr.mont_workers ?? 2);
        if (dias > 0) {
          const from = pr.fab_end
            ? sumarLaborables(sumarDias(pr.fab_end, 1), margenLibre()) : desde;
          pr.mont_start = buscarHueco('montaje', dias, from);
          pr.mont_end = finDeTramo(pr.mont_start, dias);
        }
      }
      registrar(`${actorName()} planificÃ³ ${pr.code}`, pr.code, 'projects');
      return json(pr);
    }

    if (path === '/rest/v1/rpc/move_project_phase') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const pr = db.projects.find((x) => x.id === body()?.p_project);
      if (!pr) return fail('No se encuentra el proyecto', 'P0002');
      const fase = body()?.p_phase;
      const inicio = body()?.p_start;
      if (!inicio) return fail('Hace falta una fecha');
      const esFab = fase === 'fabricacion';
      const antes = esFab ? pr.fab_start : pr.mont_start;
      const dias = Math.max(diasDeTrabajo(
        esFab ? pr.budget_hours_fab : pr.budget_hours_mont,
        esFab ? pr.fab_workers : pr.mont_workers), 1);
      const fin = finDeTramo(inicio, dias);
      if (esFab) { pr.fab_start = inicio; pr.fab_end = fin; pr.fab_manual = true; }
      else { pr.mont_start = inicio; pr.mont_end = fin; pr.mont_manual = true; }
      registrar(`${actorName()} moviÃ³ a mano ${esFab ? 'la fabricaciÃ³n' : 'el montaje'} `
        + `de ${pr.code}: ${antes ?? 'sin fecha'} â†’ ${inicio}`, pr.code, 'projects');
      return json(pr);
    }

    // FASE 1.1 Â· Las fechas de una fase, escritas a mano. Hace lo mismo
    // que Â«set_phase_datesÂ» en la base de datos: guarda lo que le den,
    // SIN comprobar disponibilidad, y toca SOLO la fase que le dicen.
    if (path === '/rest/v1/rpc/set_phase_dates') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const fase = body()?.p_phase;
      if (fase !== 'fabricacion' && fase !== 'montaje') {
        return fail(`Fase desconocida: ${fase}`);
      }
      const pr = db.projects.find((x) => x.id === body()?.p_project);
      if (!pr) return fail('No se encuentra el proyecto', 'P0002');

      const inicio = body()?.p_start ?? null;
      const fin = body()?.p_end ?? null;
      if (inicio && fin && fin < inicio) {
        return fail('El final no puede ser anterior al inicio');
      }
      const esFab = fase === 'fabricacion';
      const antes = esFab ? pr.fab_start : pr.mont_start;

      if (!inicio) {
        // Sin fecha: la fase vuelve al cÃ¡lculo automÃ¡tico.
        if (esFab) { pr.fab_start = null; pr.fab_end = null; pr.fab_manual = false; }
        else { pr.mont_start = null; pr.mont_end = null; pr.mont_manual = false; }
      } else {
        const dias = Math.max(diasDeTrabajo(
          esFab ? pr.budget_hours_fab : pr.budget_hours_mont,
          esFab ? pr.fab_workers : pr.mont_workers), 1);
        const hasta = fin ?? finDeTramo(inicio, dias);
        if (esFab) { pr.fab_start = inicio; pr.fab_end = hasta; pr.fab_manual = true; }
        else { pr.mont_start = inicio; pr.mont_end = hasta; pr.mont_manual = true; }
      }
      pr.updated_at = new Date().toISOString();
      registrar(`${actorName()} cambiÃ³ a mano las fechas de `
        + `${esFab ? 'la fabricaciÃ³n' : 'el montaje'} de ${pr.code}: `
        + `${antes ?? 'sin fecha'} âŸ¶ ${inicio ?? 'sin fecha'}`, pr.code, 'projects');
      return json(pr);
    }

    // FASE 1.3 Â· El periodo propio de la obra en el calendario.
    if (path === '/rest/v1/rpc/set_work_dates') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const obra = db.works.find((x) => x.id === body()?.p_work);
      if (!obra) return fail('No se encuentra la obra', 'P0002');

      const inicio = body()?.p_start ?? null;
      const fin = body()?.p_end ?? null;
      if (inicio && fin && fin < inicio) {
        return fail('El final no puede ser anterior al inicio');
      }
      if ((inicio === null) !== (fin === null)) {
        return fail('Escribe las dos fechas, o deja las dos en blanco para que la obra '
          + 'siga a sus proyectos');
      }
      obra.cal_start = inicio;
      obra.cal_end = fin;
      obra.updated_at = new Date().toISOString();
      registrar(inicio
        ? `${actorName()} puso el periodo de ${obra.code}: ${inicio} â†’ ${fin}`
        : `${actorName()} quitÃ³ las fechas propias de ${obra.code}: vuelve a seguir a sus proyectos`,
        obra.code, 'works');
      return json(embed('works', obra));
    }

    if (path === '/rest/v1/rpc/release_project_phase') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const pr = db.projects.find((x) => x.id === body()?.p_project);
      if (!pr) return fail('No se encuentra el proyecto', 'P0002');
      if (body()?.p_phase === 'fabricacion') pr.fab_manual = false; else pr.mont_manual = false;
      return json(pr);
    }

    if (path === '/rest/v1/rpc/set_phase_workers') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const pr = db.projects.find((x) => x.id === body()?.p_project);
      if (!pr) return fail('No se encuentra el proyecto', 'P0002');
      const n = Number(body()?.p_workers);
      if (!n || n < 1 || n > 20) return fail('El nÃºmero de trabajadores tiene que estar entre 1 y 20');
      if (body()?.p_phase === 'fabricacion') {
        pr.fab_workers = n;
        if (pr.fab_start) {
          pr.fab_end = finDeTramo(pr.fab_start,
            Math.max(diasDeTrabajo(pr.budget_hours_fab, n), 1));
        }
      } else {
        pr.mont_workers = n;
        if (pr.mont_start) {
          pr.mont_end = finDeTramo(pr.mont_start,
            Math.max(diasDeTrabajo(pr.budget_hours_mont, n), 1));
        }
      }
      return json(pr);
    }

    if (path === '/rest/v1/rpc/set_non_working_day') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const day = body()?.p_day;
      if (!day) return fail('Hace falta una fecha');
      const ya = db.non_working_days.find((x) => x.day === day);
      if (ya) ya.reason = body()?.p_reason ?? '';
      else {
        db.non_working_days.push({
          day, reason: body()?.p_reason ?? '', created_by: actor().id,
          is_demo: false, created_at: new Date().toISOString(),
        });
      }
      return json(db.non_working_days.find((x) => x.day === day));
    }

    if (path === '/rest/v1/rpc/clear_non_working_day') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      db.non_working_days = db.non_working_days.filter((x) => x.day !== body()?.p_day);
      return json(null);
    }

    if (path === '/rest/v1/rpc/save_calendar_note') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const titulo = (body()?.p_title ?? '').trim();
      if (!titulo) return fail('Escribe de quÃ© se trata');
      if (!body()?.p_day) return fail('Hace falta una fecha');
      let nota = body()?.p_id ? db.calendar_notes.find((x) => x.id === body().p_id) : null;
      if (body()?.p_id && !nota) return fail('No se encuentra el evento', 'P0002');
      if (!nota) {
        nota = {
          id: `cn-${Math.random().toString(36).slice(2, 8)}`,
          day: body().p_day, title: titulo, detail: body()?.p_detail ?? null,
          project_id: body()?.p_project ?? null, created_by: actor().id, is_demo: false,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        db.calendar_notes.unshift(nota);
      } else {
        Object.assign(nota, {
          day: body().p_day, title: titulo, detail: body()?.p_detail ?? null,
          project_id: body()?.p_project ?? null, updated_at: new Date().toISOString(),
        });
      }
      return json(nota);
    }

    if (path === '/rest/v1/rpc/delete_calendar_note') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      db.calendar_notes = db.calendar_notes.filter((x) => x.id !== body()?.p_id);
      return json(null);
    }

    // ---- BLOQUE 4 Â· obras -------------------------------------------

    const eur = (n) => `${Number(n ?? 0).toLocaleString('es-ES', {
      minimumFractionDigits: 2, maximumFractionDigits: 2 })} â‚¬`;

    if (path === '/rest/v1/rpc/save_work') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const nombre = (body()?.p_name ?? '').trim();
      if (!nombre) return fail('Escribe el nombre de la obra');
      const campos = {
        name: nombre,
        client_id: body()?.p_client ?? null,
        address: (body()?.p_address ?? '').trim() || null,
        description: (body()?.p_description ?? '').trim() || null,
        observations: (body()?.p_observations ?? '').trim() || null,
        updated_at: new Date().toISOString(),
      };
      let obra = body()?.p_id ? db.works.find((x) => x.id === body().p_id) : null;
      if (body()?.p_id && !obra) return fail('No se encuentra la obra', 'P0002');
      if (!obra) {
        db.counters.OBRA += 1;
        obra = {
          id: `works-${Math.random().toString(36).slice(2, 8)}`,
          code: `OBRA-${YEAR}-${String(db.counters.OBRA).padStart(3, '0')}`,
          // Igual que en la tabla: nacen sin periodo propio, asÃ­ la obra
          // sigue a sus proyectos hasta que alguien escriba las fechas.
          cal_start: null, cal_end: null,
          archived_at: null, is_demo: false, created_by: actor().id,
          created_at: new Date().toISOString(), ...campos,
        };
        db.works.unshift(obra);
        registrar(`${actorName()} creÃ³ la obra ${obra.code} Â· ${obra.name}`, obra.code, 'works');
      } else {
        Object.assign(obra, campos);
        registrar(`${actorName()} cambiÃ³ la obra ${obra.code}`, obra.code, 'works');
      }
      return json(embed('works', obra));
    }

    if (path === '/rest/v1/rpc/set_project_work') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const pr = db.projects.find((x) => x.id === body()?.p_project);
      if (!pr) return fail('No se encuentra el proyecto', 'P0002');
      const destino = body()?.p_work ?? null;
      if (destino && !db.works.find((x) => x.id === destino)) {
        return fail('No se encuentra la obra', 'P0002');
      }
      if ((pr.work_id ?? null) === destino) return json(embed('projects', pr));
      const antes = db.works.find((x) => x.id === pr.work_id);
      const ahora = db.works.find((x) => x.id === destino);
      pr.work_id = destino;
      pr.updated_at = new Date().toISOString();
      // La anotaciÃ³n va al historial del proyecto Y al de la obra.
      registrar(destino
        ? `${actorName()} metiÃ³ ${pr.code} en la obra ${ahora.code} Â· ${ahora.name}`
        : `${actorName()} sacÃ³ ${pr.code} de la obra ${antes?.code ?? 'anterior'}`,
        pr.code, 'projects');
      if (ahora) {
        registrar(`${actorName()} metiÃ³ el proyecto ${pr.code} Â· ${pr.name} en la obra`,
          ahora.code, 'works');
      }
      if (antes) {
        registrar(`${actorName()} sacÃ³ el proyecto ${pr.code} de la obra`, antes.code, 'works');
      }
      return json(embed('projects', pr));
    }

    if (path === '/rest/v1/rpc/archive_work') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const obra = db.works.find((x) => x.id === body()?.p_work);
      if (!obra) return fail('No se encuentra la obra', 'P0002');
      const archivar = body()?.p_archive !== false;
      obra.archived_at = archivar ? new Date().toISOString() : null;
      obra.updated_at = new Date().toISOString();
      registrar(archivar
        ? `${actorName()} archivÃ³ la obra ${obra.code}`
        : `${actorName()} recuperÃ³ la obra archivada ${obra.code}`, obra.code, 'works');
      return json(embed('works', obra));
    }

    if (path === '/rest/v1/rpc/delete_work') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const obra = db.works.find((x) => x.id === body()?.p_work);
      if (!obra) return fail('No se encuentra la obra', 'P0002');
      const proyectos = db.projects.filter((x) => x.work_id === obra.id);
      const facturado = proyectos.reduce((t, x) => t + Number(x.invoiced_amount ?? 0), 0);
      const extras = (db.work_extras ?? []).filter((x) => x.work_id === obra.id);
      if (facturado > 0) {
        return fail(`No se puede eliminar ${obra.code}: tiene ${eur(facturado)} facturados. `
          + 'ArchÃ­vala en lugar de eliminarla.', '23503');
      }
      // Los proyectos NO se borran: se quedan sueltos.
      proyectos.forEach((x) => { x.work_id = null; });
      db.work_extras = (db.work_extras ?? []).filter((x) => x.work_id !== obra.id);
      db.comments = db.comments.filter((x) => x.work_id !== obra.id);
      db.works = db.works.filter((x) => x.id !== obra.id);
      registrar(`${actorName()} eliminÃ³ la obra ${obra.code} Â· ${obra.name} `
        + `(${proyectos.length} proyectos quedan sueltos, ${extras.length} extras eliminados)`,
        null, 'works');
      return json({ ok: true, code: obra.code,
        proyectos_sueltos: proyectos.length, extras: extras.length });
    }

    if (path === '/rest/v1/rpc/save_work_extra') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const concepto = (body()?.p_concept ?? '').trim();
      if (!concepto) return fail('Escribe de quÃ© es el coste extra');
      if (body()?.p_amount === null || body()?.p_amount === undefined) {
        return fail('Escribe el importe');
      }
      const importe = Math.round(Number(body().p_amount) * 100) / 100;
      let x = body()?.p_id ? (db.work_extras ?? []).find((e) => e.id === body().p_id) : null;
      if (body()?.p_id && !x) return fail('No se encuentra el coste extra', 'P0002');
      if (!x) {
        const obra = db.works.find((w) => w.id === body()?.p_work);
        if (!obra) return fail('No se encuentra la obra', 'P0002');
        x = {
          id: `work_extras-${Math.random().toString(36).slice(2, 8)}`,
          work_id: obra.id, concept: concepto, amount: importe,
          notes: (body()?.p_notes ?? '').trim() || null,
          // FASE 3.4 Â· nacen sin facturar: guardar NO factura.
          invoiced: false, invoiced_on: null,
          created_by: actor().id, is_demo: obra.is_demo ?? false,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        db.work_extras.push(x);
        registrar(`${actorName()} aÃ±adiÃ³ el extra Â«${concepto}Â» de ${eur(importe)} `
          + `a la obra ${obra.code}`, obra.code, 'work_extras');
      } else {
        const antes = x.amount;
        const obra = db.works.find((w) => w.id === x.work_id);
        Object.assign(x, {
          concept: concepto, amount: importe,
          notes: (body()?.p_notes ?? '').trim() || null,
          updated_at: new Date().toISOString(),
        });
        registrar(`${actorName()} cambiÃ³ el extra Â«${concepto}Â» de ${eur(antes)} `
          + `a ${eur(importe)} en la obra ${obra?.code ?? ''}`, obra?.code ?? null, 'work_extras');
      }
      return json(x);
    }

    // FASE 3.4 Â· marcar o desmarcar un coste extra como facturado.
    if (path === '/rest/v1/rpc/set_work_extra_invoiced') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const x = (db.work_extras ?? []).find((e) => e.id === body()?.p_extra);
      if (!x) return fail('No se encuentra el coste extra', 'P0002');
      const obra = db.works.find((w) => w.id === x.work_id);
      x.invoiced = Boolean(body()?.p_invoiced);
      x.invoiced_on = x.invoiced ? (body()?.p_on ?? today()) : null;
      x.updated_at = new Date().toISOString();
      registrar(x.invoiced
        ? `${actorName()} marcÃ³ como facturado el coste extra Â«${x.concept}Â» `
          + `(${eur(x.amount)}) de ${obra?.code ?? 'una obra'}`
        : `${actorName()} quitÃ³ la marca de facturado del coste extra Â«${x.concept}Â» `
          + `de ${obra?.code ?? 'una obra'}`,
        obra?.code ?? null, 'work_extras');
      return json(x);
    }

    if (path === '/rest/v1/rpc/delete_work_extra') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const x = (db.work_extras ?? []).find((e) => e.id === body()?.p_id);
      if (!x) return fail('No se encuentra el coste extra', 'P0002');
      const obra = db.works.find((w) => w.id === x.work_id);
      db.work_extras = db.work_extras.filter((e) => e.id !== x.id);
      registrar(`${actorName()} quitÃ³ el extra Â«${x.concept}Â» de ${eur(x.amount)} `
        + `de la obra ${obra?.code ?? ''}`, obra?.code ?? null, 'work_extras');
      return json(null);
    }

    if (path === '/rest/v1/rpc/set_project_invoiced') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const pr = db.projects.find((x) => x.id === body()?.p_project);
      if (!pr) return fail('No se encuentra el proyecto', 'P0002');
      const facturar = Boolean(body()?.p_invoiced);
      let importe = null;
      if (facturar) {
        importe = Math.round(Number(body()?.p_amount ?? pr.budget_amount ?? 0) * 100) / 100;
        if (importe < 0) return fail('El importe facturado no puede ser negativo');
        pr.invoiced_amount = importe;
        pr.invoiced_on = body()?.p_on ?? today();
        // El estado de cobro que ya existÃ­a: no se crea otro sistema.
        if (pr.billing_status === 'por_facturar') pr.billing_status = 'pendiente_cobro';
      } else {
        pr.invoiced_amount = null;
        pr.invoiced_on = null;
      }
      pr.updated_at = new Date().toISOString();
      registrar(facturar
        ? `${actorName()} marcÃ³ ${pr.code} como facturado por ${eur(importe)}`
        : `${actorName()} quitÃ³ la marca de facturado de ${pr.code}`, pr.code, 'projects');
      const obra = db.works.find((w) => w.id === pr.work_id);
      if (obra) {
        registrar(facturar
          ? `${actorName()} facturÃ³ ${pr.code} por ${eur(importe)}`
          : `${actorName()} quitÃ³ la facturaciÃ³n de ${pr.code}`, obra.code, 'works');
      }
      return json(embed('projects', pr));
    }

    if (path === '/rest/v1/rpc/set_gap_days') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const n = Number(body()?.p_days);
      if (Number.isNaN(n) || n < 0 || n > 30) {
        return fail('El margen entre proyectos tiene que estar entre 0 y 30 dÃ­as');
      }
      db.settings.gap_days = n;
      return json(db.settings);
    }

    if (path === '/rest/v1/non_working_days') {
      return json(applyFilters(db.non_working_days, url));
    }

    if (path === '/rest/v1/rpc/trash_document') {
      if (soloAdmin()) return fail('No se encuentra el documento', 'P0002');
      const doc = db.documents.find((d) => d.id === body()?.p_doc);
      if (doc) doc.deleted_at = new Date().toISOString();
      registrar(`${actorName()} enviÃ³ a la papelera Â«${doc?.file_name}Â»`, null, 'documents');
      return json(null);
    }

    if (path === '/rest/v1/rpc/restore_document') {
      if (soloAdmin()) return fail('No se encuentra el documento', 'P0002');
      const doc = db.documents.find((d) => d.id === body()?.p_doc);
      if (doc) doc.deleted_at = null;
      registrar(`${actorName()} restaurÃ³ de la papelera Â«${doc?.file_name}Â»`, null, 'documents');
      return json(null);
    }

    // Los contactos se archivan: si se borrasen, los presupuestos antiguos
    // perderÃ­an con quiÃ©n se hablÃ³.
    if (path === '/rest/v1/rpc/archive_contact') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const c = db.client_contacts.find((k) => k.id === body()?.p_contact);
      if (!c) return fail('No se encuentra ese contacto.', '22023');
      c.archived_at = body()?.p_archive === false ? null : new Date().toISOString();
      registrar(`${actorName()} archivÃ³ el contacto ${c.name}`, null, 'client_contacts');
      return json(null);
    }

    // ---------------- Datos de ejemplo ----------------
    if (path === '/rest/v1/rpc/demo_status') {
      if (soloAdmin()) return json(null);
      return json(demoResumen(db, people));
    }

    if (path === '/rest/v1/rpc/seed_demo') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      if (db.clients.some((c) => c.is_demo)) {
        return fail('Los datos de ejemplo ya estÃ¡n puestos. Si quieres volver a '
          + 'empezar, usa antes Â«Limpiar datos demoÂ».', '22023');
      }
      sembrarDemo(db, people);
      registrar(`${actorName()} puso los datos de ejemplo`, null, 'app_settings');
      const { hay_datos: _, ...resumen } = demoResumen(db, people);
      return json(resumen);
    }

    if (path === '/rest/v1/rpc/clear_demo') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      let total = 0;
      const borradas = {};
      for (const tabla of DEMO_TABLES) {
        if (!Array.isArray(db[tabla])) continue;
        const antes = db[tabla].length;
        db[tabla] = db[tabla].filter((r) => !r.is_demo);
        const n = antes - db[tabla].length;
        if (n > 0) { borradas[tabla] = n; total += n; }
      }
      const fuera = people.filter((p) => p.is_demo).length;
      for (let i = people.length - 1; i >= 0; i--) if (people[i].is_demo) people.splice(i, 1);
      if (fuera) { borradas.profiles = fuera; total += fuera; }
      registrar(`${actorName()} limpiÃ³ los datos de ejemplo (${total} registros)`, null, 'app_settings');
      return json({ total, borradas });
    }

    if (path === '/rest/v1/rpc/convert_budget_to_project') {
      const ficha = db.fichas.find((f) => f.id === body()?.p_ficha);
      if (!ficha || ficha.status !== 'aceptado') {
        return fail('Solo los presupuestos aceptados pueden convertirse en proyecto');
      }
      if (db.projects.some((p) => p.source_ficha_id === ficha.id)) {
        return fail('Este presupuesto ya se convirtiÃ³ en un proyecto', '23505');
      }
      db.counters.PROY += 1;
      const project = {
        id: `proj-${Math.random().toString(36).slice(2, 8)}`,
        code: `PROY-${YEAR}-${String(db.counters.PROY).padStart(3, '0')}`,
        client_id: ficha.client_id, contact_id: null, source_ficha_id: ficha.id,
        name: body()?.p_name ?? ficha.title ?? `Proyecto de ${ficha.code}`,
        description: ficha.description, measures: null, finish: null, location: null,
        address: ficha.address, observations: null,
        budget_amount: ficha.amount, advance_amount: null,
        budget_hours_fab: 0, budget_hours_mont: 0,
        phase: 'preparacion', no_assembly: false, billing_status: 'por_facturar',
        finished_at: null, archived_at: null, is_demo: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      db.projects.push(project);
      registrar(`Salvi Plaza creÃ³ el proyecto ${project.code} Â· ${project.name} (desde el presupuesto ${ficha.code})`, project.code, 'projects');
      return json(project.id);
    }

    if (path === '/rest/v1/rpc/change_project_phase') {
      const project = db.projects.find((p) => p.id === body()?.p_project);
      const next = body()?.p_phase;
      if (!project) return fail('No se encuentra el proyecto', 'P0002');
      if (project.archived_at) return fail('El proyecto estÃ¡ archivado');
      if (next === 'finalizado') return fail('Para cerrar el proyecto usa el botÃ³n Â«Finalizar proyectoÂ»');
      if (next === 'montaje' && project.no_assembly) {
        return fail('El proyecto estÃ¡ marcado como Â«Sin montajeÂ». Quita esa marca para pasar a Montaje');
      }
      if (project.phase === 'fabricacion' && next === 'facturacion' && !project.no_assembly) {
        return fail('De FabricaciÃ³n se pasa a Montaje. Si este proyecto no lleva montaje, mÃ¡rcalo como Â«Sin montajeÂ»');
      }
      registrar(`Salvi Plaza cambiÃ³ el proyecto ${project.code} de ${PHASE_LABEL[project.phase]} â†’ ${PHASE_LABEL[next]}`, project.code, 'projects');
      project.phase = next;
      project.finished_at = null;
      project.updated_at = new Date().toISOString();
      db.project_substatuses = db.project_substatuses.filter(
        (s) => s.project_id !== project.id || s.phase === next,
      );

      // BLOQUE 3: al ENTRAR en fabricaciÃ³n, el proyecto busca hueco solo,
      // igual que hace el disparador de la base de datos.
      if (next === 'fabricacion' && project.autoplan !== false
          && !project.fab_start && !project.fab_manual) {
        const dias = diasDeTrabajo(project.budget_hours_fab, project.fab_workers ?? 2);
        if (dias > 0) {
          project.fab_start = siguienteLaborable(today());
          project.fab_end = finDeTramo(project.fab_start, dias);
        }
        const diasM = diasDeTrabajo(project.budget_hours_mont, project.mont_workers ?? 2);
        if (diasM > 0 && !project.no_assembly && !project.mont_manual) {
          project.mont_start = project.fab_end
            ? sumarLaborables(sumarDias(project.fab_end, 1), margenLibre())
            : siguienteLaborable(today());
          project.mont_end = finDeTramo(project.mont_start, diasM);
        }
        registrar(`${actorName()} planificÃ³ ${project.code}`, project.code, 'projects');
      }

      return json(project);
    }

    if (path === '/rest/v1/rpc/set_project_substatuses') {
      const project = db.projects.find((p) => p.id === body()?.p_project);
      const list = body()?.p_substatuses ?? [];
      if (!project) return fail('No se encuentra el proyecto', 'P0002');
      db.project_substatuses = db.project_substatuses.filter((s) => s.project_id !== project.id);
      list.forEach((substatus) => {
        db.project_substatuses.push({ project_id: project.id, phase: project.phase, substatus });
        registrar(`Salvi Plaza aÃ±adiÃ³ el subestado Â«${substatus}Â» en ${project.code}`, project.code, 'project_substatuses');
      });
      return json(null);
    }

    if (path === '/rest/v1/rpc/set_billing_status') {
      const project = db.projects.find((p) => p.id === body()?.p_project);
      if (!project) return fail('No se encuentra el proyecto', 'P0002');
      project.billing_status = body()?.p_status;
      project.updated_at = new Date().toISOString();
      registrar(`Salvi Plaza cambiÃ³ la facturaciÃ³n de ${project.code}`, project.code, 'projects');
      return json(null);
    }

    if (path === '/rest/v1/rpc/finalize_project') {
      const project = db.projects.find((p) => p.id === body()?.p_project);
      if (!project) return fail('No se encuentra el proyecto', 'P0002');
      if (project.phase !== 'facturacion' || project.billing_status !== 'cobrado') {
        return fail('Solo se puede finalizar un proyecto que estÃ© en FacturaciÃ³n y cobrado');
      }
      project.phase = 'finalizado';
      project.finished_at = new Date().toISOString();
      project.updated_at = project.finished_at;
      db.project_substatuses = db.project_substatuses.filter((s) => s.project_id !== project.id);
      registrar(`Salvi Plaza finalizÃ³ el proyecto ${project.code}`, project.code, 'projects');
      return json(project);
    }

    if (path === '/rest/v1/rpc/reopen_project') {
      const project = db.projects.find((p) => p.id === body()?.p_project);
      if (!project || project.phase !== 'finalizado') return fail('El proyecto no estÃ¡ finalizado');
      project.phase = 'facturacion';
      project.finished_at = null;
      registrar(`Salvi Plaza reabriÃ³ el proyecto ${project.code}`, project.code, 'projects');
      return json(null);
    }

    // ---------------- Ã“rdenes de trabajo (fase 4) ----------------
    if (path === '/rest/v1/rpc/assign_order_workers') {
      const order = db.work_orders.find((o) => o.id === body()?.p_order);
      const list = body()?.p_workers ?? [];
      if (!order) return fail('No se encuentra la orden de trabajo', 'P0002');

      const bloqueado = db.work_order_workers.find((w) => w.order_id === order.id
        && !list.includes(w.worker_id)
        && (w.submitted_at || Number(w.hours ?? 0) > 0 || (w.work_done ?? '').trim()));
      if (bloqueado) {
        const quien = people.find((p) => p.id === bloqueado.worker_id)?.full_name ?? 'Esa persona';
        return fail(`${quien} ya ha registrado trabajo en esta orden: no se le puede quitar`);
      }

      db.work_order_workers = db.work_order_workers.filter(
        (w) => w.order_id !== order.id || list.includes(w.worker_id),
      );
      list.forEach((workerId) => {
        if (db.work_order_workers.some((w) => w.order_id === order.id && w.worker_id === workerId)) return;
        db.work_order_workers.push({
          order_id: order.id, worker_id: workerId, work_done: null, hours: null,
          submitted_at: null, assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(), is_demo: false,
        });
        avisar(workerId, 'orden_asignada', 'Nueva orden asignada', orderCaption(order), order.id);
        registrar(
          `${actorName()} asignÃ³ la orden ${order.code} a ${people.find((p) => p.id === workerId)?.full_name ?? ''}`,
          order.code, 'work_order_workers',
        );
      });
      recompute(order);
      return json(null);
    }

    if (path === '/rest/v1/rpc/save_order_part') {
      const order = db.work_orders.find((o) => o.id === body()?.p_order);
      if (!order) return fail('No se encuentra la orden de trabajo', 'P0002');
      const part = db.work_order_workers.find(
        (w) => w.order_id === order.id && w.worker_id === actor().id,
      );
      if (!part) return fail('Esta orden no estÃ¡ asignada a ti', '42501');
      if (order.archived_at) return fail('La orden estÃ¡ archivada');
      if (order.scheduled_date > today()) {
        return fail(`Esta orden es del ${order.scheduled_date.split('-').reverse().join('/')} : todavÃ­a no se puede rellenar`);
      }
      if (order.status === 'validada') return fail('La orden ya estÃ¡ validada: no se puede modificar');
      if (order.status === 'realizada') return fail('La orden ya estÃ¡ enviada y pendiente de revisiÃ³n');

      const hours = Number(body()?.p_hours ?? 0);
      const done = (body()?.p_work_done ?? '').trim();
      const submit = Boolean(body()?.p_submit);
      if (hours < 0 || hours > 24) return fail('Las horas deben estar entre 0 y 24');
      if (submit && !done) return fail('Escribe el trabajo realizado antes de enviar la orden');
      if (submit && hours <= 0) return fail('Indica las horas trabajadas antes de enviar la orden');

      part.work_done = done || null;
      part.hours = hours || null;
      part.submitted_at = submit ? new Date().toISOString() : null;
      part.updated_at = new Date().toISOString();

      registrar(
        submit
          ? `${actorName()} enviÃ³ su parte de la orden ${order.code}`
          : `${actorName()} guardÃ³ su parte de la orden ${order.code}`,
        order.code, 'work_order_workers',
      );

      recompute(order);
      if (submit && order.status === 'realizada') {
        people.filter((p) => p.role === 'admin').forEach((adm) => avisar(
          adm.id, 'orden_enviada', 'Orden pendiente de revisiÃ³n',
          `${actorName()} ha enviado ${orderCaption(order)}`, order.id,
        ));
        registrar(`${actorName()} enviÃ³ la orden ${order.code} a revisiÃ³n`, order.code, 'work_orders');
      }
      return json(order);
    }

    if (path === '/rest/v1/rpc/validate_order') {
      const order = db.work_orders.find((o) => o.id === body()?.p_order);
      if (!order) return fail('No se encuentra la orden de trabajo', 'P0002');
      if (order.status !== 'realizada') return fail('Solo se valida una orden que estÃ© pendiente de revisiÃ³n');
      order.status = 'validada';
      order.validated_at = new Date().toISOString();
      order.validated_by = actor().id;
      order.updated_at = order.validated_at;
      db.work_order_workers.filter((w) => w.order_id === order.id).forEach(
        (w) => avisar(w.worker_id, 'validacion', 'Orden validada', orderCaption(order), order.id),
      );
      registrar(`${actorName()} validÃ³ la orden ${order.code}`, order.code, 'work_orders');
      return json(order);
    }

    if (path === '/rest/v1/rpc/return_order') {
      const order = db.work_orders.find((o) => o.id === body()?.p_order);
      const reason = (body()?.p_reason ?? '').trim();
      if (!order) return fail('No se encuentra la orden de trabajo', 'P0002');
      if (!reason) return fail('Escribe el motivo de la devoluciÃ³n');
      if (!['realizada', 'validada'].includes(order.status)) {
        return fail('Solo se devuelve una orden que ya se haya enviado');
      }
      order.status = 'devuelta';
      order.returned_at = new Date().toISOString();
      order.return_reason = reason;
      order.submitted_at = null;
      order.validated_at = null;
      order.validated_by = null;
      order.updated_at = order.returned_at;
      db.work_order_workers.filter((w) => w.order_id === order.id).forEach((w) => {
        w.submitted_at = null;
        avisar(w.worker_id, 'devolucion', 'Orden devuelta', reason, order.id);
      });
      db.comments.push({
        id: `comment-${Math.random().toString(36).slice(2, 8)}`,
        ficha_id: null, project_id: null, order_id: order.id, author_id: actor().id,
        body: `Orden devuelta. Motivo: ${reason}`, created_at: new Date().toISOString(),
      });
      registrar(`${actorName()} devolviÃ³ la orden ${order.code}. Motivo: ${reason}`, order.code, 'work_orders');
      return json(order);
    }

    if (path === '/rest/v1/rpc/mark_notifications_read') {
      let changed = 0;
      db.notifications.filter((n) => n.user_id === actor().id && !n.read_at).forEach((n) => {
        n.read_at = new Date().toISOString();
        changed++;
      });
      return json(changed);
    }

    // ---------------- Material, cobros y calendario (fase 5) ----------------
    if (path === '/rest/v1/rpc/suggest_suppliers') {
      const query = norm(body()?.p_query ?? '');
      const cuenta = new Map();
      db.materials.forEach((m) => {
        if (!m.supplier) return;
        if (query && !norm(m.supplier).includes(query)) return;
        cuenta.set(m.supplier, (cuenta.get(m.supplier) ?? 0) + 1);
      });
      return json([...cuenta.entries()]
        .map(([supplier, veces]) => ({ supplier, veces }))
        .sort((a, b) => b.veces - a.veces || a.supplier.localeCompare(b.supplier))
        .slice(0, 8));
    }

    if (path === '/rest/v1/rpc/submit_material_request') {
      const order = db.work_orders.find((o) => o.id === body()?.p_order);
      const texto = (body()?.p_body ?? '').trim();
      if (!texto) return fail('Escribe quÃ© material falta');
      if (!order) return fail('No se encuentra la orden de trabajo', 'P0002');
      const mine = db.work_order_workers.some(
        (w) => w.order_id === order.id && w.worker_id === actor().id,
      );
      if (!mine && actor().role !== 'admin') return fail('Esta orden no estÃ¡ asignada a ti', '42501');

      const request = {
        id: `req-${Math.random().toString(36).slice(2, 8)}`,
        project_id: order.project_id, order_id: order.id, worker_id: actor().id,
        body: texto, status: 'pendiente', reviewed_at: null, reviewed_by: null,
        review_note: null, material_id: null, is_demo: false,
        created_at: new Date().toISOString(),
      };
      db.material_requests.unshift(request);
      people.filter((p) => p.role === 'admin').forEach((adm) => avisar(
        adm.id, 'material_solicitado', 'Falta material',
        `${actorName()} Â· ${order.code}: ${texto}`, order.id,
      ));
      registrar(`${actorName()} comunicÃ³ falta de material en ${order.code}: ${texto}`,
        order.code, 'material_requests');
      return json(request);
    }

    // BLOQUE 5 Â· pedir material sin esperar a una orden ni a un parte.
    // Entra en la MISMA lista y pasa por la MISMA revisiÃ³n.
    if (path === '/rest/v1/rpc/submit_material_need') {
      if (!getUser()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const texto = (body()?.p_body ?? '').trim();
      if (!texto) return fail('Escribe quÃ© material falta');
      const proyecto = body()?.p_project ?? null;
      if (proyecto) {
        const pr = db.projects.find((x) => x.id === proyecto);
        if (!pr) return fail('No se encuentra el proyecto', 'P0002');
        if (actor().role !== 'admin' && !assignedProjects(actor()).has(proyecto)) {
          return fail('Este proyecto no estÃ¡ asignado a ti', '42501');
        }
      }
      const peticion = {
        id: `mr-${Math.random().toString(36).slice(2, 8)}`,
        project_id: proyecto, order_id: null, worker_id: actor().id,
        body: texto, status: 'pendiente', reviewed_at: null, reviewed_by: null,
        review_note: null, material_id: null, is_demo: false,
        created_at: new Date().toISOString(),
      };
      db.material_requests.unshift(peticion);
      return json(peticion);
    }

    if (path === '/rest/v1/rpc/accept_material_request') {
      const request = db.material_requests.find((r) => r.id === body()?.p_request);
      const nombre = (body()?.p_name ?? '').trim();
      if (!request) return fail('No se encuentra la comunicaciÃ³n', 'P0002');
      if (request.status !== 'pendiente') return fail('Esta comunicaciÃ³n ya estÃ¡ revisada');
      if (!nombre) return fail('Escribe el nombre del material');

      // BLOQUE 5: la peticiÃ³n puede venir sin proyecto; el material
      // pendiente siempre es de uno, asÃ­ que se dice al aceptarla.
      const destino = request.project_id ?? body()?.p_project ?? null;
      if (!destino) {
        return fail('Esta peticiÃ³n no trae proyecto. Elige a quÃ© proyecto va el material '
          + 'antes de aceptarla');
      }

      const material = {
        id: `mat-${Math.random().toString(36).slice(2, 8)}`,
        project_id: destino, order_id: request.order_id,
        name: nombre, units: body()?.p_units ?? null, supplier: body()?.p_supplier ?? null,
        ordered_on: body()?.p_ordered_on ?? null, expected_on: body()?.p_expected_on ?? null,
        received: false, notes: body()?.p_notes ?? null, late_notified_on: null,
        archived_at: null, is_demo: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      db.materials.push(material);
      request.status = 'aceptada';
      request.reviewed_at = new Date().toISOString();
      request.reviewed_by = actor().id;
      request.material_id = material.id;
      request.project_id = destino;
      avisar(request.worker_id, 'material_solicitado', 'Material anotado',
        `Se ha aÃ±adido Â«${nombre}Â» al material pendiente.`, request.order_id);
      registrar(`${actorName()} anotÃ³ material pendiente: ${nombre}`, null, 'materials');
      return json(material);
    }

    if (path === '/rest/v1/rpc/discard_material_request') {
      const request = db.material_requests.find((r) => r.id === body()?.p_request);
      if (!request) return fail('No se encuentra la comunicaciÃ³n', 'P0002');
      if (request.status !== 'pendiente') return fail('Esta comunicaciÃ³n ya estÃ¡ revisada');
      request.status = 'descartada';
      request.reviewed_at = new Date().toISOString();
      request.reviewed_by = actor().id;
      request.review_note = (body()?.p_note ?? '') || null;
      avisar(request.worker_id, 'material_solicitado', 'Material revisado',
        request.review_note ?? 'AdministraciÃ³n ha revisado tu aviso de material.', request.order_id);
      return json(null);
    }

    if (path === '/rest/v1/rpc/notify_late_materials') {
      if (actor().role !== 'admin') return json(0);
      let n = 0;
      db.materials
        .filter((m) => !m.archived_at && !m.received && m.expected_on
          && m.expected_on < today() && m.late_notified_on !== today())
        .forEach((m) => {
          const project = db.projects.find((p) => p.id === m.project_id);
          people.filter((p) => p.role === 'admin').forEach((adm) => {
            db.notifications.unshift({
              id: `noti-${Math.random().toString(36).slice(2, 8)}`,
              user_id: adm.id, kind: 'material_retrasado', title: 'Material retrasado',
              body: `${m.name} Â· ${project?.code ?? ''} Â· estaba previsto para el `
                + `${m.expected_on.split('-').reverse().join('/')}`,
              order_id: null, read_at: null, is_demo: false,
              created_at: new Date().toISOString(),
            });
          });
          m.late_notified_on = today();
          n++;
        });
      return json(n);
    }

    if (path === '/rest/v1/rpc/register_payment') {
      const project = db.projects.find((p) => p.id === body()?.p_project);
      const amount = Number(body()?.p_amount ?? 0);
      if (!project) return fail('No se encuentra el proyecto', 'P0002');
      if (!(amount > 0)) return fail('El importe del cobro debe ser mayor que cero');
      const pay = {
        id: `pay-${Math.random().toString(36).slice(2, 8)}`,
        project_id: project.id, amount, paid_on: body()?.p_paid_on ?? today(),
        notes: body()?.p_notes ?? null, is_demo: false, created_at: new Date().toISOString(),
      };
      db.payments.push(pay);
      recomputeBilling(project);
      registrar(`${actorName()} apuntÃ³ un cobro en ${project.code}`, project.code, 'payments');
      return json(pay);
    }

    if (path === '/rest/v1/rpc/delete_payment') {
      // Anular, no borrar: el cobro se queda a la vista y deja de contar.
      const pay = db.payments.find((p) => p.id === body()?.p_payment && !p.voided_at);
      if (!pay) return fail('Ese cobro no existe o ya estaba anulado.', '22023');
      pay.voided_at = new Date().toISOString();
      pay.voided_by = actor().id;
      const project = db.projects.find((p) => p.id === pay.project_id);
      if (project) recomputeBilling(project);
      registrar(`${actorName()} anulÃ³ un cobro de ${pay.amount} â‚¬`, null, 'payments');
      return json(null);
    }

    if (path === '/rest/v1/project_billing') {
      // Lee Â«projectsÂ», que es de administraciÃ³n desde el BLOQUE 1: a un
      // trabajador no le llega ni una fila.
      if (soloAdmin()) return json([]);
      const rows = db.projects.map((p) => {
        const cobrado = db.payments.filter((x) => x.project_id === p.id && !x.voided_at)
          .reduce((t, x) => t + Number(x.amount), 0);
        const total = Number(p.budget_amount ?? 0);
        return {
          project_id: p.id, total, cobrado,
          pendiente: Math.max(total - cobrado, 0),
          cobros: db.payments.filter((x) => x.project_id === p.id).length,
        };
      });
      return json(applyFilters(rows, url));
    }

    if (path === '/rest/v1/project_materials') {
      const rows = db.projects.map((p) => {
        const list = db.materials.filter((m) => m.project_id === p.id && !m.archived_at);
        return {
          project_id: p.id, total: list.length,
          pendientes: list.filter((m) => !m.received).length,
          retrasados: list.filter((m) => !m.received && m.expected_on && m.expected_on < today()).length,
        };
      });
      return json(applyFilters(rows, url));
    }


    /**
     * BLOQUE 4 Â· las cuentas de una obra, igual que la vista
     * Â«work_summaryÂ»: proyectos + extras = total estimado.
     */
    const cuentasDeObra = (w) => {
      const proyectos = db.projects.filter((x) => x.work_id === w.id);
      const suma = (f) => proyectos.reduce((t, x) => t + Number(f(x) ?? 0), 0);
      const totalProyectos = suma((x) => x.budget_amount);
      const extrasDeLaObra = (db.work_extras ?? []).filter((x) => x.work_id === w.id);
      const extras = extrasDeLaObra.reduce((t, x) => t + Number(x.amount ?? 0), 0);
      // FASE 3.4 Â· solo los extras MARCADOS como facturados cuentan.
      const extrasFacturados = extrasDeLaObra
        .filter((x) => x.invoiced)
        .reduce((t, x) => t + Number(x.amount ?? 0), 0);
      const facturado = suma((x) => x.invoiced_amount) + extrasFacturados;
      const cobrado = db.payments
        .filter((pg) => !pg.voided_at && proyectos.some((x) => x.id === pg.project_id))
        .reduce((t, pg) => t + Number(pg.amount ?? 0), 0);
      const fechas = (campos) => proyectos
        .flatMap((x) => campos.map((c) => x[c])).filter(Boolean).sort();
      const desde = fechas(['fab_start', 'mont_start'])[0] ?? null;
      const hastaLista = fechas(['fab_end', 'mont_end']);
      return {
        work_id: w.id, code: w.code, name: w.name,
        proyectos: proyectos.length,
        proyectos_activos: proyectos.filter((x) => x.phase !== 'finalizado' && !x.archived_at).length,
        proyectos_finalizados: proyectos.filter((x) => x.phase === 'finalizado').length,
        total_proyectos: totalProyectos,
        extras,
        total_estimado: totalProyectos + extras,
        facturado,
        pendiente_facturar: totalProyectos + extras - facturado,
        cobrado,
        material_pendiente: db.materials.filter((m) => !m.received && !m.archived_at
          && proyectos.some((x) => x.id === m.project_id)).length,
        extras_facturados: extrasFacturados,
        extras_pendientes: extras - extrasFacturados,
        // FASE 1.3 Â· Lo que la obra tenga escrito manda; si no, sus
        // proyectos. Es el mismo Â«coalesceÂ» que hace la vista de verdad.
        desde: w.cal_start ?? desde,
        hasta: w.cal_end ?? (hastaLista[hastaLista.length - 1] ?? null),
      };
    };

    // FASE 3.2 Â· Â«client_overviewÂ»: el cliente con su actividad y sus
    // cuatro magnitudes. Mismas definiciones que la vista de verdad.
    if (path === '/rest/v1/client_overview') {
      const user = getUser();
      // Solo administraciÃ³n: la vista filtra ella misma.
      if (user && user.role !== 'admin') return json(applyFilters([], url));

      const rows = (db.clients ?? []).map((c) => {
        const fichas = db.fichas.filter((f) => f.client_id === c.id);
        const viva = (f) => !f.archived_at;
        const proyectos = db.projects.filter((p) => p.client_id === c.id && !p.archived_at);
        const sum = (lista, f) => lista.reduce((t, x) => t + Number(f(x) ?? 0), 0);

        const obras = (db.works ?? []).filter((w) => w.client_id === c.id && !w.archived_at);
        const extras = (db.work_extras ?? []).filter((x) => obras.some((w) => w.id === x.work_id));

        const presupuestado = sum(proyectos, (p) => p.budget_amount) + sum(extras, (x) => x.amount);
        const facturado = sum(proyectos, (p) => p.invoiced_amount)
          + sum(extras.filter((x) => x.invoiced), (x) => x.amount);
        const cobrado = db.payments
          .filter((pg) => !pg.voided_at && proyectos.some((p) => p.id === pg.project_id))
          .reduce((t, pg) => t + Number(pg.amount ?? 0), 0);

        return {
          ...c,
          budgets: fichas.filter((f) => f.type === 'presupuesto' && viva(f)).length,
          visits: fichas.filter((f) => f.type === 'visita' && viva(f)).length,
          notices: fichas.filter((f) => f.type === 'aviso' && viva(f)).length,
          open_notices: fichas.filter((f) => f.type === 'aviso' && viva(f)
            && !['realizado', 'cerrado'].includes(f.status)).length,
          last_activity: fichas.map((f) => f.created_at).sort().pop() ?? null,
          presupuestado,
          facturado,
          cobrado,
          pendiente_facturar: presupuestado - facturado,
          pendiente_cobrar: facturado - cobrado,
          proyectos: proyectos.length,
          proyectos_activos: proyectos.filter((p) => p.phase !== 'finalizado').length,
        };
      });
      return json(applyFilters(rows, url));
    }

    // FASE 3.5 Â· Â«work_documentsÂ»: los archivos de la obra Y los de sus
    // proyectos, sin duplicar ninguno, con el proyecto de origen.
    if (path === '/rest/v1/work_documents') {
      const user = getUser();
      if (user && user.role !== 'admin') return json(applyFilters([], url));

      const rows = [];
      (db.works ?? []).forEach((w) => {
        const suyos = db.documents.filter((d) => d.work_id === w.id);
        const deProyectos = db.documents.filter((d) => d.project_id
          && db.projects.some((p) => p.id === d.project_id && p.work_id === w.id));
        [...suyos, ...deProyectos].forEach((d) => {
          const pr = db.projects.find((p) => p.id === d.project_id) ?? null;
          const quien = people.find((x) => x.id === d.uploaded_by) ?? null;
          rows.push({
            id: d.id, work_id: w.id, project_id: d.project_id ?? null,
            origen_code: pr?.code ?? null, origen_name: pr?.name ?? null,
            bucket: d.bucket, storage_path: d.storage_path, file_name: d.file_name,
            mime_type: d.mime_type, size_bytes: d.size_bytes, category: d.category,
            scope: d.scope, uploaded_by: d.uploaded_by ?? null,
            uploader_name: quien?.full_name ?? null,
            deleted_at: d.deleted_at ?? null, created_at: d.created_at,
          });
        });
      });
      return json(applyFilters(rows, url));
    }

    if (path === '/rest/v1/work_summary') {
      const rows = visible('works', db.works ?? []).map(cuentasDeObra);
      return json(applyFilters(rows, url));
    }

    if (path === '/rest/v1/v_calendar') {
      const user = getUser();
      const esAdmin = !user || user.role === 'admin';
      const mine = user && !esAdmin ? myOrderIds(user) : null;
      const rows = [];

      // BLOQUE 3: Â«fabricaciÃ³nÂ» y Â«montajeÂ» son ya la PLANIFICACIÃ“N del
      // proyecto, con duraciÃ³n. Cada tramo se despliega en una fila por
      // dÃ­a laborable, igual que hace la vista de verdad.
      visible('projects', db.projects.filter((x) => !x.archived_at)).forEach(() => {});
      const proyectosVisibles = esAdmin
        ? db.projects.filter((x) => !x.archived_at)
        : db.projects.filter((x) => !x.archived_at && assignedProjects(user).has(x.id));

      proyectosVisibles.forEach((p) => {
        const c = db.clients.find((x) => x.id === p.client_id);
        [['fabricacion', p.fab_start, p.fab_end, p.fab_manual],
         ['montaje', p.mont_start, p.mont_end, p.mont_manual]].forEach(([fase, desde, hasta, aMano]) => {
          if (!desde) return;
          const dias = diasDelTramo(desde, hasta ?? desde, Boolean(aMano));
          dias.forEach((day, i) => {
            rows.push({
              kind: fase, id: p.id, code: p.code, title: p.name,
              detail: dias.length > 1 ? `DÃ­a ${i + 1} de ${dias.length}` : null,
              date: day, status: aMano ? 'Colocado a mano' : 'Planificado',
              project_id: p.id, project_code: p.code, client_name: c?.name ?? null,
              assigned: [
                ...new Set([
                  ...db.project_workers.filter((pw) => pw.project_id === p.id).map((pw) => pw.worker_id),
                  ...db.work_orders.filter((o) => o.project_id === p.id && !o.archived_at
                      && o.type === fase)
                    .flatMap((o) => db.work_order_workers.filter((w) => w.order_id === o.id)
                      .map((w) => w.worker_id)),
                ]),
              ],
              movable: true,
            });
          });
        });
      });

      visible('materials', db.materials)
        .filter((m) => !m.archived_at && m.expected_on).forEach((m) => {
          const p = db.projects.find((x) => x.id === m.project_id);
          const c = p ? db.clients.find((x) => x.id === p.client_id) : null;
          rows.push({
            kind: 'material', id: m.id, code: null, title: m.name, detail: m.notes,
            date: m.expected_on, status: m.received ? 'Recibido' : 'Pendiente',
            project_id: m.project_id, project_code: p?.code ?? null, client_name: c?.name ?? null,
            assigned: [], movable: false,
          });
        });

      // BLOQUE 5: por Â«worker_fichasÂ», no por la tabla: asÃ­ el trabajador
      // sigue viendo sus visitas y sus avisos, pero no el importe.
      const fichasVisibles = esAdmin
        ? db.fichas
        : db.fichas.filter((f) => f.assigned_to === user.id
            && ['visita', 'aviso'].includes(f.type) && !f.archived_at);
      fichasVisibles
        .filter((f) => !f.archived_at && f.scheduled_date && ['visita', 'aviso'].includes(f.type))
        .forEach((f) => {
          const c = db.clients.find((x) => x.id === f.client_id);
          rows.push({
            kind: f.type, id: f.id, code: f.code,
            title: f.title ?? (f.description ?? '').slice(0, 60), detail: f.address,
            date: f.scheduled_date, status: FICHA_STATUS_ES[f.status] ?? f.status,
            project_id: null, project_code: null, client_name: c?.name ?? null,
            assigned: f.assigned_to ? [f.assigned_to] : [], movable: false,
          });
        });

      (db.calendar_notes ?? []).forEach((n) => {
        const p = db.projects.find((x) => x.id === n.project_id);
        rows.push({
          kind: 'otro', id: n.id, code: null, title: n.title, detail: n.detail,
          date: n.day, status: 'Evento', project_id: n.project_id ?? null,
          project_code: p?.code ?? null, client_name: null, assigned: [], movable: true,
        });
      });

      // BLOQUE 4: la obra es un elemento mÃ¡s del calendario. No tiene
      // fechas propias: van de la primera a la Ãºltima de sus proyectos.
      // Solo administraciÃ³n: Â«worksÂ» no se le devuelve al trabajador.
      visible('works', (db.works ?? []).filter((w) => !w.archived_at)).forEach((w) => {
        const c = cuentasDeObra(w);
        if (!c.desde || !c.hasta) return;
        const cliente = db.clients.find((x) => x.id === w.client_id);
        let d = c.desde;
        for (let i = 0; i < 400 && d <= c.hasta; i++) {
          if (esLaborable(d)) {
            rows.push({
              kind: 'obra', id: w.id, code: w.code, title: w.name,
              detail: `${c.proyectos} proyecto(s)`, date: d, status: 'Obra',
              project_id: null, project_code: w.code,
              client_name: cliente?.name ?? null, assigned: [], movable: false,
            });
          }
          d = sumarDias(d, 1);
        }
      });

      if (mine) { /* ya filtrado por visible() */ }
      return json(applyFilters(rows, url));
    }

    // ------------- BLOQUE 1 Â· proyectos, equipo y partes -------------

    /**
     * Â«worker_projectsÂ»: el proyecto tal como lo ve el trabajador.
     * Se construye a propÃ³sito SIN las columnas de dinero, igual que la
     * vista de verdad: asÃ­ la prueba comprueba lo mismo que la base de
     * datos, y no que la pantalla lo esconda.
     */
    /**
     * Â«worker_fichasÂ»: la visita o el aviso tal como los ve un
     * trabajador. Se construye a propÃ³sito SIN Â«amountÂ», igual que la
     * vista de verdad.
     */
    if (path === '/rest/v1/worker_fichas') {
      const user = getUser() ?? ADMIN;
      const suyas = user.role === 'admin'
        ? db.fichas
        : db.fichas.filter((f) => f.assigned_to === user.id
            && ['visita', 'aviso'].includes(f.type) && !f.archived_at);
      const rows = suyas.map((f) => ({
        id: f.id, code: f.code, type: f.type, status: f.status,
        title: f.title ?? null, description: f.description ?? null,
        address: f.address ?? null, phone: f.phone ?? null,
        email: f.email ?? null, hours: f.hours ?? null,
        scheduled_date: f.scheduled_date ?? null, scheduled_time: f.scheduled_time ?? null,
        assigned_to: f.assigned_to ?? null, client_id: f.client_id ?? null,
        client_name: db.clients.find((c) => c.id === f.client_id)?.name ?? null,
        archived_at: f.archived_at ?? null,
        created_at: f.created_at ?? null, updated_at: f.updated_at ?? null,
      }));
      return json(applyOrder(applyFilters(rows, url), url));
    }

    if (path === '/rest/v1/worker_projects') {
      const user = getUser() ?? ADMIN;
      const ids = user.role === 'admin'
        ? new Set(db.projects.map((x) => x.id))
        : assignedProjects(user);
      const rows = db.projects.filter((x) => ids.has(x.id)).map((x) => ({
        id: x.id, code: x.code, name: x.name, description: x.description ?? null,
        measures: x.measures ?? null, finish: x.finish ?? null, location: x.location ?? null,
        address: x.address ?? null, observations: x.observations ?? null,
        phase: x.phase, no_assembly: Boolean(x.no_assembly),
        budget_hours_fab: Number(x.budget_hours_fab ?? 0),
        budget_hours_mont: Number(x.budget_hours_mont ?? 0),
        client_id: x.client_id ?? null,
        client_name: db.clients.find((c) => c.id === x.client_id)?.name ?? null,
        archived_at: x.archived_at ?? null, finished_at: x.finished_at ?? null,
        created_at: x.created_at ?? null, updated_at: x.updated_at ?? null,
        // BLOQUE 5: las fechas planificadas. Son fechas, no dinero.
        fab_start: x.fab_start ?? null, fab_end: x.fab_end ?? null,
        mont_start: x.mont_start ?? null, mont_end: x.mont_end ?? null,
        fab_workers: x.fab_workers ?? 2, mont_workers: x.mont_workers ?? 2,
        proximo: [x.fab_start, x.mont_start].filter(Boolean).sort()[0] ?? null,
      }));
      return json(applyOrder(applyFilters(rows, url), url));
    }

    if (path === '/rest/v1/project_team') {
      const user = getUser() ?? ADMIN;
      const ids = user.role === 'admin'
        ? new Set(db.projects.map((x) => x.id))
        : assignedProjects(user);
      const rows = db.project_workers
        .filter((pw) => ids.has(pw.project_id))
        .map((pw) => {
          const persona = people.find((x) => x.id === pw.worker_id);
          return {
            project_id: pw.project_id, worker_id: pw.worker_id,
            full_name: persona?.full_name ?? '', role: persona?.role ?? 'worker',
          };
        });
      return json(applyFilters(rows, url));
    }

    /** Horas previstas contra realizadas. SOLO cuentan las validadas. */
    if (path === '/rest/v1/project_hours') {
      const rows = db.projects.map((x) => {
        const validados = db.work_reports
          .filter((r) => r.project_id === x.id && r.status === 'validado');
        const suma = (tipo) => validados
          .filter((r) => r.work_type === tipo)
          .reduce((n, r) => n + Number(r.hours ?? 0), 0);
        const fab = suma('fabricacion');
        const mont = suma('montaje');
        return {
          project_id: x.id,
          previstas_fab: Number(x.budget_hours_fab ?? 0),
          previstas_mont: Number(x.budget_hours_mont ?? 0),
          previstas_total: Number(x.budget_hours_fab ?? 0) + Number(x.budget_hours_mont ?? 0),
          realizadas_fab: fab, realizadas_mont: mont, realizadas_total: fab + mont,
        };
      });
      return json(applyFilters(rows, url));
    }

    if (path === '/rest/v1/project_reports') {
      const rows = db.projects.map((x) => {
        const list = db.work_reports.filter((r) => r.project_id === x.id);
        return {
          project_id: x.id, total: list.length,
          por_validar: list.filter((r) => r.status === 'enviado').length,
          validados: list.filter((r) => r.status === 'validado').length,
          rechazados: list.filter((r) => r.status === 'rechazado').length,
          horas_validadas: list.filter((r) => r.status === 'validado')
            .reduce((n, r) => n + Number(r.hours ?? 0), 0),
        };
      });
      return json(applyFilters(rows, url));
    }

    // ---------------- Vistas ----------------
    if (path === '/rest/v1/order_team') {
      const rows = visible('work_orders', db.work_orders).map((o) => o.id);
      const team = db.work_order_workers
        .filter((w) => rows.includes(w.order_id))
        .map((w) => ({
          order_id: w.order_id, worker_id: w.worker_id,
          full_name: people.find((p) => p.id === w.worker_id)?.full_name ?? '',
          submitted: Boolean(w.submitted_at),
        }));
      return json(applyFilters(team, url));
    }

    if (path === '/rest/v1/order_hours') {
      const rows = db.work_orders.map((o) => {
        const parts = db.work_order_workers.filter((w) => w.order_id === o.id);
        return {
          order_id: o.id,
          horas_reales: parts.reduce((t, w) => t + Number(w.hours ?? 0), 0),
          trabajadores: parts.length,
          partes_enviados: parts.filter((w) => w.submitted_at).length,
        };
      });
      return json(applyFilters(rows, url));
    }

    if (path === '/rest/v1/project_orders') {
      const rows = db.projects.map((p) => {
        const list = db.work_orders.filter((o) => o.project_id === p.id && !o.archived_at);
        return {
          project_id: p.id, total: list.length,
          por_revisar: list.filter((o) => o.status === 'realizada').length,
          validadas: list.filter((o) => o.status === 'validada').length,
          horas_previstas: list.reduce((t, o) => t + Number(o.planned_hours ?? 0), 0),
        };
      });
      return json(applyFilters(rows, url));
    }

    if (path === '/rest/v1/v_phase_suggestions') {
      const rows = [];
      db.projects.filter((p) => !p.archived_at).forEach((p) => {
        if (p.phase === 'facturacion' && p.billing_status === 'cobrado') {
          rows.push({
            project_id: p.id, code: p.code, name: p.name, phase: p.phase,
            suggested_phase: 'finalizado',
            message: 'El proyecto estÃ¡ cobrado. Ya puedes finalizarlo.',
          });
          return;
        }
        const tipo = p.phase === 'fabricacion' ? 'fabricacion' : p.phase === 'montaje' ? 'montaje' : null;
        if (!tipo) return;
        const list = db.work_orders.filter(
          (o) => o.project_id === p.id && o.type === tipo && !o.archived_at,
        );
        if (!list.length || list.some((o) => o.status !== 'validada')) return;
        const next = tipo === 'montaje' ? 'facturacion' : p.no_assembly ? 'facturacion' : 'montaje';
        rows.push({
          project_id: p.id, code: p.code, name: p.name, phase: p.phase,
          suggested_phase: next,
          message: `Todas las Ã³rdenes de ${tipo === 'montaje' ? 'montaje' : 'fabricaciÃ³n'} estÃ¡n validadas. `
            + `Ya puedes pasar a ${next === 'montaje' ? 'Montaje' : 'FacturaciÃ³n'}.`,
        });
      });
      return json(applyFilters(rows, url));
    }

    // ================= FASE 6 Â· PANEL, INFORMES Y COPIAS =================
    // Los nÃºmeros los calcula la base de datos; aquÃ­ se repite el mismo
    // cÃ¡lculo para que las pantallas enseÃ±en algo coherente. Las fÃ³rmulas
    // de verdad se comprueban en tests/sql/60_tests_fase6.sql.

    const rango = () => {
      const b = body() ?? {};
      return { desde: b.p_from ?? today(), hasta: b.p_to ?? today() };
    };

    const nombreProyecto = (id) => db.projects.find((p) => p.id === id)?.name ?? '';
    const codigoProyecto = (id) => db.projects.find((p) => p.id === id)?.code ?? '';
    const clienteDe = (proyecto) =>
      db.clients.find((c) => c.id === proyecto?.client_id)?.name ?? '';

    const horasDe = (filtro) => db.work_order_workers
      .filter((w) => { const o = db.work_orders.find((x) => x.id === w.order_id); return o && filtro(o, w); })
      .reduce((t, w) => t + Number(w.hours ?? 0), 0);

    const cobradoDe = (projectId) => db.payments
      .filter((p) => p.project_id === projectId && !p.voided_at)
      .reduce((t, p) => t + Number(p.amount), 0);

    const retrasoDe = (m) => {
      if (m.received || !m.expected_on || m.expected_on >= today()) return 0;
      return Math.round((Date.parse(today()) - Date.parse(m.expected_on)) / 86400000);
    };

    if (path === '/rest/v1/rpc/dashboard_summary') {
      if (soloAdmin()) return fail('No tienes permisos para ver esto.', '42501');
      const { desde, hasta } = rango();
      const enPeriodo = (o) => o.scheduled_date >= desde && o.scheduled_date <= hasta;
      const validadas = db.work_orders.filter((o) => !o.archived_at && o.status === 'validada' && enPeriodo(o));
      const activos = db.projects.filter((p) => !p.archived_at && p.phase !== 'finalizado');
      const finalizados = db.projects.filter(
        (p) => p.finished_at && p.finished_at.slice(0, 10) >= desde && p.finished_at.slice(0, 10) <= hasta);

      const dias = finalizados.map((p) => Math.round(
        (Date.parse(p.finished_at) - Date.parse(p.created_at)) / 86400000));

      const porFase = {};
      for (const fase of PHASES) porFase[fase] = activos.filter((p) => p.phase === fase).length;

      const hFab = horasDe((o, w) => o.type === 'fabricacion' && enPeriodo(o) && w.submitted_at);
      const hMont = horasDe((o, w) => o.type === 'montaje' && enPeriodo(o) && w.submitted_at);

      const personas = new Set(db.work_order_workers
        .filter((w) => { const o = db.work_orders.find((x) => x.id === w.order_id); return o && enPeriodo(o) && Number(w.hours ?? 0) > 0; })
        .map((w) => w.worker_id));

      const vivas = db.work_orders.filter((o) => !o.archived_at);
      const presupuestado = activos.reduce((t, p) => t + Number(p.budget_amount ?? 0), 0);
      const cobrado = activos.reduce((t, p) => t + cobradoDe(p.id), 0);

      return json({
        periodo: { desde, hasta },
        produccion: {
          horas_fabricacion: hFab, horas_montaje: hMont, horas_totales: hFab + hMont,
          ordenes_validadas: validadas.length, trabajadores: personas.size,
        },
        proyectos: {
          activos: activos.length,
          creados: db.projects.filter((p) => p.created_at.slice(0, 10) >= desde
            && p.created_at.slice(0, 10) <= hasta).length,
          finalizados: finalizados.length,
          dias_medio: dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : 0,
          por_fase: porFase,
        },
        ordenes: {
          hoy: vivas.filter((o) => o.scheduled_date === today()).length,
          pendientes: vivas.filter((o) => o.status === 'pendiente').length,
          en_curso: vivas.filter((o) => o.status === 'en_curso').length,
          por_revisar: vivas.filter((o) => o.status === 'realizada').length,
          devueltas: vivas.filter((o) => o.status === 'devuelta').length,
        },
        material: {
          pendientes: db.materials.filter((m) => !m.archived_at && !m.received).length,
          retrasados: db.materials.filter((m) => !m.archived_at && retrasoDe(m) > 0).length,
          recibidos: db.materials.filter((m) => !m.archived_at && m.received).length,
        },
        // A propÃ³sito NO hay alerta de exceso de horas.
        alertas: {
          ordenes_atrasadas: vivas.filter((o) => o.scheduled_date < today()
            && ['pendiente', 'en_curso'].includes(o.status)).length,
          ordenes_por_revisar: vivas.filter((o) => o.status === 'realizada').length,
          material_retrasado: db.materials.filter((m) => !m.archived_at && retrasoDe(m) > 0).length,
          avisos_taller: db.material_requests.filter((r) => r.status === 'pendiente').length,
          fichas_por_asignar: db.fichas.filter((f) => !f.archived_at && f.status === 'por_asignar').length,
          presupuestos_enviados: db.fichas.filter((f) => !f.archived_at && f.status === 'enviado').length,
        },
        economico: {
          presupuestado, cobrado, pendiente: Math.max(0, presupuestado - cobrado),
          por_facturar: activos.filter((p) => p.billing_status === 'por_facturar').length,
        },
        cobrado_periodo: db.payments
          .filter((p) => !p.voided_at && p.paid_on >= desde && p.paid_on <= hasta)
          .reduce((t, p) => t + Number(p.amount), 0),
      });
    }

    if (path === '/rest/v1/rpc/report_projects') {
      if (soloAdmin()) return fail('No tienes permisos para ver esto.', '42501');
      const { desde, hasta } = rango();
      const dentroDelPeriodo = (p) => {
        const creado = p.created_at.slice(0, 10);
        const fin = p.finished_at ? p.finished_at.slice(0, 10) : null;
        return (creado >= desde && creado <= hasta)
          || (fin && fin >= desde && fin <= hasta)
          || (!fin && creado <= hasta);
      };
      return json(db.projects.filter((p) => !p.archived_at && dentroDelPeriodo(p)).map((p) => {
        const cobrado = cobradoDe(p.id);
        const reales = horasDe((o, w) => o.project_id === p.id && w.submitted_at);
        return {
          code: p.code, name: p.name, cliente: clienteDe(p),
          fase: PHASE_LABEL[p.phase] ?? p.phase,
          estado_cobro: BILLING_LABEL[p.billing_status] ?? p.billing_status,
          creado: p.created_at.slice(0, 10),
          finalizado: p.finished_at ? p.finished_at.slice(0, 10) : null,
          dias: p.finished_at
            ? Math.round((Date.parse(p.finished_at) - Date.parse(p.created_at)) / 86400000) : null,
          presupuesto: Number(p.budget_amount ?? 0), cobrado,
          pendiente: Math.max(0, Number(p.budget_amount ?? 0) - cobrado),
          horas_previstas: Number(p.budget_hours_fab ?? 0) + Number(p.budget_hours_mont ?? 0),
          horas_reales: reales,
        };
      }));
    }

    if (path === '/rest/v1/rpc/report_projects_by_phase') {
      if (soloAdmin()) return fail('No tienes permisos para ver esto.', '42501');
      return json(PHASES.map((fase) => {
        const grupo = db.projects.filter((p) => !p.archived_at && p.phase === fase);
        return {
          fase: PHASE_LABEL[fase] ?? fase, proyectos: grupo.length,
          presupuesto: grupo.reduce((t, p) => t + Number(p.budget_amount ?? 0), 0),
          horas_reales: grupo.reduce(
            (t, p) => t + horasDe((o, w) => o.project_id === p.id && w.submitted_at), 0),
        };
      }));  // salen las cinco fases, aunque alguna estÃ© a cero
    }

    if (path === '/rest/v1/rpc/report_hours_by_worker') {
      if (soloAdmin()) return fail('No tienes permisos para ver esto.', '42501');
      const { desde, hasta } = rango();
      const dentro = (o) => o.scheduled_date >= desde && o.scheduled_date <= hasta;
      return json(people.map((persona) => {
        const partes = db.work_order_workers.filter((w) => w.worker_id === persona.id && w.submitted_at);
        const suma = (tipo) => partes.reduce((t, w) => {
          const o = db.work_orders.find((x) => x.id === w.order_id);
          return o && o.type === tipo && dentro(o) ? t + Number(w.hours ?? 0) : t;
        }, 0);
        const fab = suma('fabricacion');
        const mont = suma('montaje');
        return {
          trabajador: persona.full_name, fabricacion: fab, montaje: mont, total: fab + mont,
          ordenes: partes.filter((w) => {
            const o = db.work_orders.find((x) => x.id === w.order_id);
            return o && dentro(o);
          }).length,
        };
      }).filter((r) => r.total > 0 || r.ordenes > 0));
    }

    if (path === '/rest/v1/rpc/report_hours_by_project') {
      if (soloAdmin()) return fail('No tienes permisos para ver esto.', '42501');
      return json(db.projects.filter((p) => !p.archived_at).map((p) => {
        const fab = horasDe((o, w) => o.project_id === p.id && o.type === 'fabricacion' && w.submitted_at);
        const mont = horasDe((o, w) => o.project_id === p.id && o.type === 'montaje' && w.submitted_at);
        const previstas = Number(p.budget_hours_fab ?? 0) + Number(p.budget_hours_mont ?? 0);
        return {
          code: p.code, name: p.name, cliente: clienteDe(p),
          previstas, fabricacion: fab, montaje: mont, total: fab + mont,
          desvio: Number((fab + mont - previstas).toFixed(2)),
        };
      }).filter((r) => r.total > 0 || r.previstas > 0));
    }

    if (path === '/rest/v1/rpc/report_materials') {
      if (soloAdmin()) return fail('No tienes permisos para ver esto.', '42501');
      return json(db.materials.filter((m) => !m.archived_at).map((m) => ({
        material: m.name, unidades: m.units ?? null, proveedor: m.supplier ?? '',
        proyecto: codigoProyecto(m.project_id) || nombreProyecto(m.project_id),
        pedido: m.ordered_on ?? null, previsto: m.expected_on ?? null,
        recibido: Boolean(m.received), dias_retraso: retrasoDe(m),
      })));
    }

    if (path === '/rest/v1/rpc/report_suppliers') {
      if (soloAdmin()) return fail('No tienes permisos para ver esto.', '42501');
      const porProveedor = new Map();
      for (const m of db.materials.filter((x) => !x.archived_at && x.supplier)) {
        const fila = porProveedor.get(m.supplier)
          ?? { proveedor: m.supplier, pedidos: 0, pendientes: 0, retrasados: 0, dias: [] };
        fila.pedidos += 1;
        if (!m.received) fila.pendientes += 1;
        const retraso = retrasoDe(m);
        if (retraso > 0) { fila.retrasados += 1; fila.dias.push(retraso); }
        porProveedor.set(m.supplier, fila);
      }
      return json([...porProveedor.values()]
        .map(({ dias, ...f }) => ({
          ...f,
          retraso_medio: dias.length
            ? Number((dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.pedidos - a.pedidos));
    }

    // ---------------- Copias de seguridad ----------------
    if (path === '/rest/v1/rpc/start_backup') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const fila = {
        id: `bk-${Math.random().toString(36).slice(2, 8)}`,
        kind: body()?.p_kind ?? 'manual', status: 'en_curso',
        destination: body()?.p_destination ?? 'descarga',
        file_name: null, drive_file_id: null, drive_link: null, size_bytes: null,
        tables: {}, documents_count: 0, error: null,
        started_at: new Date().toISOString(), finished_at: null, created_by: actor().id,
      };
      db.backups.unshift(fila);
      return json(fila);
    }

    if (path === '/rest/v1/rpc/finish_backup') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const b = body() ?? {};
      const fila = db.backups.find((x) => x.id === b.p_backup);
      if (!fila) return fail('No se encuentra esa copia.');
      Object.assign(fila, {
        status: b.p_error ? 'error' : 'completado',
        file_name: b.p_file_name ?? null, size_bytes: b.p_size ?? null,
        tables: b.p_tables ?? {}, documents_count: b.p_documents ?? 0,
        drive_file_id: b.p_drive_file_id ?? null, drive_link: b.p_drive_link ?? null,
        error: b.p_error ?? null, finished_at: new Date().toISOString(),
      });
      registrar(`${actorName()} generÃ³ una copia de seguridad`, null, 'backups');
      return json(fila);
    }

    if (path === '/rest/v1/rpc/restore_data') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const { p_payload: payload = {}, p_scope: scope = [] } = body() ?? {};
      if (!scope.length) return fail('Elige al menos un apartado para restaurar.');

      const permitidas = new Set();
      for (const key of scope) {
        for (const t of (RESTORE_SCOPES[key] ?? [])) permitidas.add(t);
      }

      const filas = {};
      let total = 0;
      // Se recorren en el orden de dependencia, como hace la base de datos.
      for (const tabla of BACKUP_ORDER) {
        if (!permitidas.has(tabla)) continue;
        const entrantes = payload[tabla] ?? [];
        if (!entrantes.length) continue;

        if (tabla === 'profiles') {
          // Solo se actualiza lo que ya existe: nunca se crean accesos.
          let tocadas = 0;
          for (const fila of entrantes) {
            const actual = people.find((p) => p.id === fila.id);
            if (actual) { Object.assign(actual, fila); tocadas += 1; }
          }
          if (tocadas) { filas[tabla] = tocadas; total += tocadas; }
          continue;
        }

        if (!Array.isArray(db[tabla])) continue;
        for (const fila of entrantes) {
          const clave = fila.id ?? `${fila.order_id}|${fila.worker_id}`;
          const existente = db[tabla].find(
            (r) => (r.id ?? `${r.order_id}|${r.worker_id}`) === clave);
          // Al leer un CSV todo vuelve como texto. La base de datos lo
          // convierte al tipo de cada columna; aquÃ­ se hace lo mismo
          // mirando cÃ³mo es ese dato en la fila que ya hay.
          const limpia = convertirFila(fila, existente ?? db[tabla][0]);
          if (existente) Object.assign(existente, limpia);  // se actualiza
          else db[tabla].push({ ...limpia });               // se aÃ±ade, nunca se borra
        }
        filas[tabla] = entrantes.length;
        total += entrantes.length;
      }

      registrar(
        `${actorName()} restaurÃ³ una copia de seguridad (${total} registros)`, null, 'backups');
      return json({ filas, total, apartados: scope });
    }

    // ---------------- Ajustes ----------------
    if (path === '/rest/v1/rpc/set_company') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      db.settings.company = { ...db.settings.company, ...(body()?.p_company ?? {}) };
      db.settings.updated_at = new Date().toISOString();
      registrar(`${actorName()} cambiÃ³ los datos de la empresa`, null, 'app_settings');
      return json(db.settings);
    }

    if (path === '/rest/v1/rpc/set_backup_settings') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const b = body() ?? {};
      db.settings.backup = { ...db.settings.backup, ...(b.p_backup ?? {}) };
      if (b.p_retention_days != null) {
        const dias = Number(b.p_retention_days);
        if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
          return fail('Los dÃ­as que se guardan las copias deben estar entre 1 y 365.');
        }
        db.settings.backup_retention_days = dias;
      }
      registrar(`${actorName()} cambiÃ³ los ajustes de las copias`, null, 'app_settings');
      return json(db.settings);
    }

    if (path === '/rest/v1/rpc/set_max_file_mb') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const mb = Number(body()?.p_mb);
      if (!Number.isFinite(mb) || mb < 1 || mb > 500) {
        return fail('El tamaÃ±o mÃ¡ximo debe estar entre 1 y 500 MB.');
      }
      db.settings.max_file_mb = mb;
      return json(db.settings);
    }

    if (path === '/rest/v1/rpc/set_counter') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
      const b = body() ?? {};
      const valor = Number(b.p_value);
      if (!Number.isFinite(valor) || valor < 0) return fail('El nÃºmero debe ser cero o mayor.');
      const fila = db.code_counters.find((c) => c.prefix === b.p_prefix && c.year === b.p_year);
      if (fila) fila.last_value = valor;
      else db.code_counters.push({ prefix: b.p_prefix, year: b.p_year, last_value: valor });
      registrar(`${actorName()} ajustÃ³ la numeraciÃ³n de ${b.p_prefix}`, null, 'code_counters');
      return json(null);
    }

    // Las preferencias son de cada persona: no hacen falta permisos.
    if (path === '/rest/v1/rpc/set_preferences') {
      const quien = actor();
      quien.preferences = { ...(quien.preferences ?? {}), ...(body()?.p_prefs ?? {}) };
      return json(quien.preferences);
    }

    if (path === '/rest/v1/storage_usage') {
      if (soloAdmin()) return json([]);
      const NOMBRE = { foto: 'FotografÃ­as', video: 'VÃ­deos', firma: 'Firmas' };
      const porTipo = new Map();
      for (const d of db.documents) {
        const tipo = NOMBRE[d.category] ?? 'Documentos';
        const fila = porTipo.get(tipo)
          ?? { tipo, archivos: 0, bytes: 0, en_papelera: 0, bytes_papelera: 0 };
        if (d.deleted_at) {
          fila.en_papelera += 1; fila.bytes_papelera += Number(d.size_bytes ?? 0);
        } else {
          fila.archivos += 1; fila.bytes += Number(d.size_bytes ?? 0);
        }
        porTipo.set(tipo, fila);
      }
      return json([...porTipo.values()].sort((a, b) => a.tipo.localeCompare(b.tipo)));
    }

    // ---------------- ConexiÃ³n con Google Drive ----------------
    if (path === '/rest/v1/rpc/drive_status') {
      if (soloAdmin()) return fail('No tienes permisos para ver esto.', '42501');
      const d = db.drive;
      return json({
        estado: d.last_error ? 'error' : d.connected ? 'conectado' : 'sin_conectar',
        conectado: d.connected,
        cuenta: d.account_email,
        carpeta: d.folder_name,
        carpeta_id: d.folder_id,
        conectado_el: d.connected_at,
        ultima_copia: d.last_ok_at,
        error: d.last_error,
      });
    }

    // El permiso de Google NO se puede alcanzar desde el navegador: estas
    // funciones solo las puede ejecutar el servidor.
    if (['drive_get_token', 'drive_put_token', 'drive_forget_token',
         'drive_mark_connected', 'drive_disconnect'].some((f) => path.endsWith(`/rpc/${f}`))) {
      return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
    }

    // ---------------- Funciones del servidor ----------------
    // AquÃ­ no hay ninguna credencial: se imita lo que responde Supabase.
    if (path.startsWith('/functions/v1/')) {
      const fn = path.replace('/functions/v1/', '');
      if (soloAdmin()) {
        return route.fulfill({
          status: 403, headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ok: false, message: 'No tienes permisos para realizar esta acciÃ³n.' }),
        });
      }

      if (fn === 'backup-drive') {
        if (!db.drive.connected) {
          return route.fulfill({
            status: 400, headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              ok: false,
              message: 'Google Drive todavÃ­a no estÃ¡ conectado. Entra en ConfiguraciÃ³n â†’ '
                + 'Copias de seguridad y pulsa Â«Conectar Google DriveÂ».',
            }),
          });
        }
        if (!driveConfigured) {
          return route.fulfill({
            status: 400, headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ok: false, message: 'Falta configurar Google Drive.' }),
          });
        }
        const nombre = `metalplafer360-${new Date().toISOString().slice(0, 10)}.zip`;
        db.backups.unshift({
          id: `bk-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'manual', status: 'completado', destination: 'drive',
          file_name: nombre, drive_file_id: 'drive-1',
          drive_link: 'https://drive.google.com/file/d/drive-1/view',
          size_bytes: 24_576, tables: { clients: db.clients.length, projects: db.projects.length },
          documents_count: db.documents.length, error: null,
          started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
          created_by: actor().id,
        });
        db.drive.last_ok_at = new Date().toISOString();
        db.drive.last_error = null;
        registrar(`${actorName()} subiÃ³ una copia a Google Drive`, null, 'backups');
        return json({
          ok: true, file_name: nombre,
          link: 'https://drive.google.com/file/d/drive-1/view', size: 24_576, removed: 0,
        });
      }

      if (fn === 'google-oauth') {
        const b = body() ?? {};
        if (b.action === 'disconnect') {
          Object.assign(db.drive, {
            connected: false, account_email: null, folder_id: null, folder_name: null,
            connected_at: null, last_error: null,
          });
          registrar(`${actorName()} desconectÃ³ Google Drive`, null, 'backups');
          return json({ ok: true });
        }
        if (!driveConfigured) {
          return route.fulfill({
            status: 400, headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ok: false, message: 'Falta configurar la conexiÃ³n con Google.' }),
          });
        }
        // La autorizaciÃ³n ocurre en Google; aquÃ­ solo se devuelve a dÃ³nde ir.
        return json({
          ok: true,
          url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=prueba'
             + '&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file'
             + '&access_type=offline&prompt=consent&state=prueba',
        });
      }

      if (fn === 'admin-users') {
        const b = body() ?? {};
        if (b.action === 'create') {
          if (people.some((p) => p.username === b.username)) {
            return route.fulfill({
              status: 400, headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ ok: false, message: `Ya existe un usuario llamado Â«${b.username}Â».` }),
            });
          }
          const nuevo = {
            id: `u-${Math.random().toString(36).slice(2, 8)}`,
            full_name: b.full_name, username: b.username,
            email: `${b.username}@metalplafer.com`, role: 'worker', phone: b.phone ?? null,
            active: true, preferences: {}, is_demo: false,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          };
          people.push(nuevo);
          registrar(`${actorName()} dio de alta al trabajador ${b.full_name}`, null, 'profiles');
          return json({ ok: true, id: nuevo.id, username: b.username });
        }
        if (b.action === 'password') {
          registrar(`${actorName()} cambiÃ³ una contraseÃ±a`, null, 'profiles');
          return json({ ok: true });
        }
        return route.fulfill({
          status: 400, headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ok: false, message: 'AcciÃ³n desconocida.' }),
        });
      }
      return json({ ok: true });
    }

    // ---------------- Personas y ajustes ----------------
    if (path === '/rest/v1/profiles') {
      // La ficha de quien ha iniciado sesiÃ³n refleja lo que devuelva
      // getUser (por ejemplo, un usuario desactivado).
      const actual = getUser();
      const rows = people.map((p) => (actual && p.id === actual.id ? actual : p));

      if (method === 'PATCH') {
        // Cambiar el papel o desactivar a alguien es cosa de administraciÃ³n.
        if (soloAdmin()) return fail('No tienes permisos para realizar esta acciÃ³n.', '42501');
        const afectadas = applyFilters(people, url);
        const patch = body() ?? {};
        afectadas.forEach((persona) => {
          Object.assign(persona, patch, { updated_at: new Date().toISOString() });
          if ('role' in patch) {
            registrar(
              `${actorName()} puso a ${persona.full_name} como `
              + `${patch.role === 'admin' ? 'administraciÃ³n' : 'trabajador'}`, null, 'profiles');
          }
          if ('active' in patch) {
            registrar(
              `${actorName()} ${patch.active ? 'reactivÃ³' : 'desactivÃ³'} a ${persona.full_name}`,
              null, 'profiles');
          }
        });
        return json(wantsObject ? afectadas[0] ?? null : afectadas);
      }

      if (url.searchParams.get('select') === 'id') return count(applyFilters(rows, url).length);
      // REVISIÃ“N: el telÃ©fono, el correo, el usuario de acceso y las
      // preferencias NO se conceden sobre esta tabla (son permisos por
      // columna). La tabla devuelve el resto; esos cuatro se leen por
      // Â«profiles_fullÂ», y aquÃ­ se quitan igual que allÃ­.
      const filtered = applyFilters(rows, url).map((p) => {
        const { email, phone, preferences, username, ...resto } = p;
        return resto;
      });
      return json(wantsObject ? filtered[0] ?? null : filtered);
    }

    /**
     * Â«profiles_fullÂ»: la ficha completa, con los datos personales.
     * Cada persona la suya; administraciÃ³n, todas.
     */
    if (path === '/rest/v1/profiles_full') {
      const actual = getUser();
      const todas = people.map((p) => (actual && p.id === actual.id ? actual : p));
      const rows = soloAdmin()
        ? todas.filter((p) => actual && p.id === actual.id)
        : todas;
      const filtered = applyOrder(applyFilters(rows, url), url);
      return json(wantsObject ? filtered[0] ?? null : filtered);
    }

    if (path === '/rest/v1/app_settings') {
      // Todo el mundo necesita saber el tamaÃ±o mÃ¡ximo de archivo; el resto
      // de los ajustes solo los ve administraciÃ³n.
      const row = soloAdmin()
        ? { id: 1, max_file_mb: db.settings.max_file_mb }
        : db.settings;
      return json(wantsObject ? row : [row]);
    }

    // ---------------- Tablas ----------------
    const table = path.replace('/rest/v1/', '');
    if (!(table in db)) return json([]);

    if (method === 'GET' || method === 'HEAD') {
      let rows = applyFilters(visible(table, db[table]), url);

      if (url.searchParams.get('select') === 'id') return count(rows.length);

      const order = url.searchParams.get('order');
      if (order) {
        const keys = order.split(',').map((part) => {
          const [col, dir] = part.split('.');
          return { col, sign: dir === 'desc' ? -1 : 1 };
        });
        rows = [...rows].sort((a, b) => {
          for (const { col, sign } of keys) {
            const diff = String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * sign;
            if (diff) return diff;
          }
          return 0;
        });
      }

      const limit = Number(url.searchParams.get('limit'));
      if (limit > 0) rows = rows.slice(0, limit);

      const total = rows.length;
      const range = request.headers()['range'];
      if (range) {
        const [from, to] = range.split('-').map(Number);
        rows = rows.slice(from, to + 1);
      }

      const payload = rows.map((r) => embed(table, r));
      const headers = wantsCount
        ? { 'content-range': `0-${Math.max(0, payload.length - 1)}/${total}` }
        : {};

      if (method === 'HEAD') {
        return route.fulfill({
          status: 206,
          headers: { 'content-type': 'application/json', 'access-control-expose-headers': 'content-range', ...headers },
          body: '',
        });
      }
      return json(wantsObject ? payload[0] ?? null : payload, headers);
    }

    if (method === 'POST') {
      const payload = Array.isArray(body()) ? body() : [body()];
      const created = payload.map((item) => {
        const row = {
          id: `${table}-${Math.random().toString(36).slice(2, 8)}`,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          archived_at: null, active: true, ...item,
        };

        if (table === 'fichas') {
          const prefix = PREFIX[row.type];
          db.counters[prefix] += 1;
          row.code = `${prefix}-${YEAR}-${String(db.counters[prefix]).padStart(3, '0')}`;
          row.status = row.assigned_to ? NEXT_WHEN_ASSIGNED[row.type] : 'por_asignar';
          registrar(`Salvi Plaza creÃ³ la ficha de ${row.type} ${row.code}`, row.code, 'fichas');
        }

        if (table === 'projects') {
          db.counters.PROY += 1;
          row.code = `PROY-${YEAR}-${String(db.counters.PROY).padStart(3, '0')}`;
          row.phase = 'preparacion';
          row.billing_status = 'por_facturar';
          row.no_assembly = row.no_assembly ?? false;
          row.finished_at = null;
          row.budget_hours_fab = row.budget_hours_fab ?? 0;
          row.budget_hours_mont = row.budget_hours_mont ?? 0;
          // Los valores por defecto de la tabla de verdad (Â«not null
          // default 2Â» y demÃ¡s). Sin esto, la pantalla recibÃ­a undefined
          // y pintaba Â«NaN dÃ­a(s)Â», que en producciÃ³n no puede pasar.
          row.fab_workers = row.fab_workers ?? 2;
          row.mont_workers = row.mont_workers ?? 2;
          row.fab_manual = row.fab_manual ?? false;
          row.mont_manual = row.mont_manual ?? false;
          row.autoplan = row.autoplan ?? true;
          row.fab_start = row.fab_start ?? null;
          row.fab_end = row.fab_end ?? null;
          row.mont_start = row.mont_start ?? null;
          row.mont_end = row.mont_end ?? null;
          row.work_id = row.work_id ?? null;
          row.invoiced_amount = row.invoiced_amount ?? null;
          row.invoiced_on = row.invoiced_on ?? null;
          registrar(`Salvi Plaza creÃ³ el proyecto ${row.code} Â· ${row.name}`, row.code, 'projects');
        }

        if (table === 'work_orders') {
          db.counters.OT += 1;
          row.code = `OT-${YEAR}-${String(db.counters.OT).padStart(3, '0')}`;
          row.status = 'pendiente';
          row.submitted_at = null; row.validated_at = null; row.validated_by = null;
          row.returned_at = null; row.return_reason = null;
          row.planned_hours = row.planned_hours ?? 0;
          registrar(
            `${actorName()} creÃ³ la orden de ${row.type === 'montaje' ? 'montaje' : 'fabricaciÃ³n'} ${row.code}`,
            row.code, 'work_orders',
          );
        }

        if (table === 'materials') {
          row.received = row.received ?? false;
          row.late_notified_on = null;
          registrar(`${actorName()} anotÃ³ material pendiente: ${row.name}`, null, 'materials');
        }

        if (table === 'clients') registrar(`Salvi Plaza creÃ³ el cliente ${row.name}`, row.name, 'clients');

        db[table].push(row);
        return embed(table, row);
      });
      return json(wantsObject ? created[0] : created);
    }

    if (method === 'PATCH') {
      const rows = applyFilters(db[table], url);
      const patch = body() ?? {};
      rows.forEach((row) => {
        const before = { ...row };
        Object.assign(row, patch, { updated_at: new Date().toISOString() });

        if (table === 'fichas' && patch.assigned_to && before.status === 'por_asignar') {
          row.status = NEXT_WHEN_ASSIGNED[row.type];
        }
        if (table === 'fichas' && patch.status) {
          registrar(`Salvi Plaza cambiÃ³ la ficha ${row.code}`, row.code, 'fichas');
        }
        if (table === 'projects' && 'no_assembly' in patch) {
          registrar(
            patch.no_assembly
              ? `Salvi Plaza marcÃ³ Â«Sin montajeÂ» en ${row.code}`
              : `Salvi Plaza quitÃ³ Â«Sin montajeÂ» de ${row.code}`,
            row.code, 'projects',
          );
        }
        if (table === 'materials' && 'received' in patch) {
          if (patch.received) row.late_notified_on = null;
          registrar(
            patch.received
              ? `${actorName()} marcÃ³ como recibido Â«${row.name}Â»`
              : `${actorName()} volviÃ³ a marcar como pendiente Â«${row.name}Â»`,
            null, 'materials',
          );
        }
        if (table === 'materials' && 'expected_on' in patch) row.late_notified_on = null;

        if (table === 'projects' && 'budget_amount' in patch) recomputeBilling(row);

        if ('archived_at' in patch) {
          const label = table === 'projects' ? 'el proyecto' : table === 'fichas' ? 'la ficha' : 'el cliente';
          const name = row.code ?? row.name;
          registrar(
            patch.archived_at
              ? `Salvi Plaza archivÃ³ ${label} ${name}`
              : `Salvi Plaza recuperÃ³ ${label} archivado ${name}`,
            name, table,
          );
        }
      });
      const updated = rows.map((r) => embed(table, r));
      return json(wantsObject ? updated[0] ?? null : updated);
    }

    if (method === 'DELETE') {
      const rows = applyFilters(db[table], url);
      db[table] = db[table].filter((r) => !rows.includes(r));
      return json([]);
    }

    return json([]);
  });
}

/** Entra en la aplicaciÃ³n con un usuario. */
export async function signIn(page, port, username, password = 'contrasena-de-prueba') {
  await page.goto(`http://localhost:${port}/#/login`, { waitUntil: 'networkidle' });
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('button:has-text("Entrar")').click();
  await page.waitForTimeout(700);
}

export { PHASES, PHASE_LABEL };


