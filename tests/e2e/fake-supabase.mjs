/**
 * METALPLAFER360 · Supabase de mentira para las pruebas de navegador.
 *
 * Imita lo justo de la API de Supabase (acceso, consultas, altas y
 * cambios) para poder recorrer la aplicación con datos en memoria.
 * Reproduce a propósito algunas reglas de la base de datos —los códigos
 * y los estados iniciales— para que las pantallas se comporten igual.
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
// Construir y servir la aplicación
// ---------------------------------------------------------------------
export function buildApp() {
  console.log('   Construyendo la aplicación para la prueba…');
  execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], {
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
    console.log(`   ${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` → ${detail}`}`);
  };
  const report = () => {
    const failed = results.filter((r) => !r.ok);
    console.log('   ──────────────────────────────');
    console.log(`   TOTAL: ${results.length - failed.length} de ${results.length} comprobaciones correctas`);
    return failed.length;
  };
  return { check, report };
}

// ---------------------------------------------------------------------
// Base de datos en memoria
// ---------------------------------------------------------------------
export const norm = (s) =>
  (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function createDb(seed = {}) {
  return {
    clients: [], client_contacts: [], fichas: [], projects: [], project_substatuses: [],
    work_orders: [], work_order_workers: [], notifications: [],
    materials: [], material_requests: [], payments: [],
    documents: [], comments: [], audit_log: [], backups: [],
    counters: { PRES: 0, VIS: 0, AVI: 0, PROY: 0, OT: 0 },
    code_counters: [
      { prefix: 'PRES', year: YEAR, last_value: 0 }, { prefix: 'VIS', year: YEAR, last_value: 0 },
      { prefix: 'AVI', year: YEAR, last_value: 0 }, { prefix: 'PROY', year: YEAR, last_value: 0 },
      { prefix: 'OT', year: YEAR, last_value: 0 },
    ],
    settings: {
      id: 1,
      company: {
        name: 'METALPLAFER S.L.', tax_id: 'B12345678', phone: '937 000 000',
        address: 'Carrer del Ferro, 3', city: 'Sabadell', postal_code: '08203',
        email: 'taller@metalplafer.com',
      },
      max_file_mb: 100,
      backup_retention_days: 30,
      backup: { enabled: true, hour: 2, folder: 'METALPLAFER360 · Copias de seguridad' },
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

export function mondayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return addDays(iso, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7));
}

/** Filtros de PostgREST que usa la aplicación. */
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

/** Imagen mínima para imitar las fotografías guardadas. */
const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const ORDER_STATUS_ES = {
  pendiente: 'Pendiente', en_curso: 'En curso',
  realizada: 'Realizada · pendiente de revisión', validada: 'Validada', devuelta: 'Devuelta',
};

const FICHA_STATUS_ES = {
  por_asignar: 'Por asignar', pendiente: 'Pendiente', avanzado: 'Presupuesto avanzado',
  por_revisar: 'Presupuesto por revisar', enviado: 'Presupuesto enviado',
  aceptado: 'Presupuesto aceptado', cancelado: 'Presupuesto cancelado',
  asignada: 'Asignada', realizada: 'Realizada', cancelada: 'Cancelada',
  asignado: 'Asignado', en_curso: 'En curso', realizado: 'Realizado', cerrado: 'Cerrado',
};

/** Apartados que se pueden restaurar por separado (igual que en la aplicación). */
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
 * de datos los convierte al tipo de cada columna; aquí se imita mirando
 * qué tipo tiene ese mismo dato en una fila que ya existe.
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

/** Los informes enseñan los estados en castellano, como label_es() en la base. */
const BILLING_LABEL = {
  por_facturar: 'Por facturar', pendiente_cobro: 'Pendiente de cobro',
  cobrado_parcial: 'Cobrado parcialmente', cobrado: 'Cobrado',
};

/** Tablas que se vacían al limpiar los datos de ejemplo, en orden. */
const DEMO_TABLES = [
  'comments', 'documents', 'payments', 'material_requests', 'materials',
  'work_order_workers', 'work_orders', 'project_substatuses', 'projects',
  'fichas', 'client_contacts', 'clients', 'notifications', 'audit_log',
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
 * Un ejemplo reducido: aquí solo hace falta comprobar que se pone, que
 * se ve y que al limpiarlo NO se lleva por delante lo de verdad. Los
 * volúmenes exactos (10 clientes, 15 fichas…) se prueban contra
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
  preparacion: 'En preparación', fabricacion: 'Fabricación', montaje: 'Montaje',
  facturacion: 'Facturación', finalizado: 'Finalizado',
};

/**
 * Instala el Supabase de mentira en un contexto del navegador.
 * `getUser` decide quién ha iniciado sesión (o null para fallar el acceso).
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
    return `${order.code} · ${order.type === 'montaje' ? 'Montaje' : 'Fabricación'} · `
      + `${order.scheduled_date.split('-').reverse().join('/')}`
      + (project ? ` · ${project.name}` : '');
  };

  /** Mismo recálculo del estado de cobro que hace la base de datos. */
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

  /** Mismo recálculo que hace la base de datos con los partes. */
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
      };
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
  // órdenes, sus partes, sus avisos y los proyectos de esas órdenes.
  // (Las reglas de verdad se prueban contra PostgreSQL en tests/sql.)
  // -------------------------------------------------------------------
  const myOrderIds = (user) => new Set(
    db.work_order_workers.filter((w) => w.worker_id === user.id).map((w) => w.order_id),
  );

  const visible = (table, rows) => {
    const user = getUser();
    if (!user || user.role === 'admin') return rows;
    const mine = myOrderIds(user);
    const myProjects = new Set(
      db.work_orders.filter((o) => mine.has(o.id) && !o.archived_at).map((o) => o.project_id),
    );
    if (table === 'work_orders') return rows.filter((r) => mine.has(r.id) && !r.archived_at);
    if (table === 'work_order_workers') return rows.filter((r) => r.worker_id === user.id);
    if (table === 'notifications') return rows.filter((r) => r.user_id === user.id);
    if (table === 'projects') return rows.filter((r) => myProjects.has(r.id));
    if (table === 'clients') {
      const ids = new Set(db.projects.filter((p) => myProjects.has(p.id)).map((p) => p.client_id));
      return rows.filter((r) => ids.has(r.id));
    }
    if (table === 'fichas') return rows.filter((r) => r.assigned_to === user.id);
    if (table === 'documents' || table === 'comments') {
      return rows.filter((r) => (r.order_id && mine.has(r.order_id))
        || (r.project_id && myProjects.has(r.project_id)));
    }
    if (table === 'audit_log') return rows.filter((r) => r.actor_id === user.id);
    if (table === 'materials') return rows.filter((r) => myProjects.has(r.project_id));
    if (table === 'material_requests') return rows.filter((r) => r.worker_id === user.id);
    // Económico y administración: un trabajador no ve nada de esto, aunque
    // pida la tabla a mano. (En Supabase lo impiden las políticas RLS.)
    if (table === 'payments' || table === 'backups' || table === 'code_counters') return [];
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

    /** Casi todo lo de administración se comprueba así. */
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
      // que el navegador pueda pintarla igual que lo haría Supabase.
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

    if (path === '/rest/v1/rpc/trash_document') {
      if (soloAdmin()) return fail('No se encuentra el documento', 'P0002');
      const doc = db.documents.find((d) => d.id === body()?.p_doc);
      if (doc) doc.deleted_at = new Date().toISOString();
      registrar(`${actorName()} envió a la papelera «${doc?.file_name}»`, null, 'documents');
      return json(null);
    }

    if (path === '/rest/v1/rpc/restore_document') {
      if (soloAdmin()) return fail('No se encuentra el documento', 'P0002');
      const doc = db.documents.find((d) => d.id === body()?.p_doc);
      if (doc) doc.deleted_at = null;
      registrar(`${actorName()} restauró de la papelera «${doc?.file_name}»`, null, 'documents');
      return json(null);
    }

    // Los contactos se archivan: si se borrasen, los presupuestos antiguos
    // perderían con quién se habló.
    if (path === '/rest/v1/rpc/archive_contact') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acción.', '42501');
      const c = db.client_contacts.find((k) => k.id === body()?.p_contact);
      if (!c) return fail('No se encuentra ese contacto.', '22023');
      c.archived_at = body()?.p_archive === false ? null : new Date().toISOString();
      registrar(`${actorName()} archivó el contacto ${c.name}`, null, 'client_contacts');
      return json(null);
    }

    // ---------------- Datos de ejemplo ----------------
    if (path === '/rest/v1/rpc/demo_status') {
      if (soloAdmin()) return json(null);
      return json(demoResumen(db, people));
    }

    if (path === '/rest/v1/rpc/seed_demo') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acción.', '42501');
      if (db.clients.some((c) => c.is_demo)) {
        return fail('Los datos de ejemplo ya están puestos. Si quieres volver a '
          + 'empezar, usa antes «Limpiar datos demo».', '22023');
      }
      sembrarDemo(db, people);
      registrar(`${actorName()} puso los datos de ejemplo`, null, 'app_settings');
      const { hay_datos: _, ...resumen } = demoResumen(db, people);
      return json(resumen);
    }

    if (path === '/rest/v1/rpc/clear_demo') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acción.', '42501');
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
      registrar(`${actorName()} limpió los datos de ejemplo (${total} registros)`, null, 'app_settings');
      return json({ total, borradas });
    }

    if (path === '/rest/v1/rpc/convert_budget_to_project') {
      const ficha = db.fichas.find((f) => f.id === body()?.p_ficha);
      if (!ficha || ficha.status !== 'aceptado') {
        return fail('Solo los presupuestos aceptados pueden convertirse en proyecto');
      }
      if (db.projects.some((p) => p.source_ficha_id === ficha.id)) {
        return fail('Este presupuesto ya se convirtió en un proyecto', '23505');
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
      registrar(`Salvi Plaza creó el proyecto ${project.code} · ${project.name} (desde el presupuesto ${ficha.code})`, project.code, 'projects');
      return json(project.id);
    }

    if (path === '/rest/v1/rpc/change_project_phase') {
      const project = db.projects.find((p) => p.id === body()?.p_project);
      const next = body()?.p_phase;
      if (!project) return fail('No se encuentra el proyecto', 'P0002');
      if (project.archived_at) return fail('El proyecto está archivado');
      if (next === 'finalizado') return fail('Para cerrar el proyecto usa el botón «Finalizar proyecto»');
      if (next === 'montaje' && project.no_assembly) {
        return fail('El proyecto está marcado como «Sin montaje». Quita esa marca para pasar a Montaje');
      }
      if (project.phase === 'fabricacion' && next === 'facturacion' && !project.no_assembly) {
        return fail('De Fabricación se pasa a Montaje. Si este proyecto no lleva montaje, márcalo como «Sin montaje»');
      }
      registrar(`Salvi Plaza cambió el proyecto ${project.code} de ${PHASE_LABEL[project.phase]} → ${PHASE_LABEL[next]}`, project.code, 'projects');
      project.phase = next;
      project.finished_at = null;
      project.updated_at = new Date().toISOString();
      db.project_substatuses = db.project_substatuses.filter(
        (s) => s.project_id !== project.id || s.phase === next,
      );
      return json(project);
    }

    if (path === '/rest/v1/rpc/set_project_substatuses') {
      const project = db.projects.find((p) => p.id === body()?.p_project);
      const list = body()?.p_substatuses ?? [];
      if (!project) return fail('No se encuentra el proyecto', 'P0002');
      db.project_substatuses = db.project_substatuses.filter((s) => s.project_id !== project.id);
      list.forEach((substatus) => {
        db.project_substatuses.push({ project_id: project.id, phase: project.phase, substatus });
        registrar(`Salvi Plaza añadió el subestado «${substatus}» en ${project.code}`, project.code, 'project_substatuses');
      });
      return json(null);
    }

    if (path === '/rest/v1/rpc/set_billing_status') {
      const project = db.projects.find((p) => p.id === body()?.p_project);
      if (!project) return fail('No se encuentra el proyecto', 'P0002');
      project.billing_status = body()?.p_status;
      project.updated_at = new Date().toISOString();
      registrar(`Salvi Plaza cambió la facturación de ${project.code}`, project.code, 'projects');
      return json(null);
    }

    if (path === '/rest/v1/rpc/finalize_project') {
      const project = db.projects.find((p) => p.id === body()?.p_project);
      if (!project) return fail('No se encuentra el proyecto', 'P0002');
      if (project.phase !== 'facturacion' || project.billing_status !== 'cobrado') {
        return fail('Solo se puede finalizar un proyecto que esté en Facturación y cobrado');
      }
      project.phase = 'finalizado';
      project.finished_at = new Date().toISOString();
      project.updated_at = project.finished_at;
      db.project_substatuses = db.project_substatuses.filter((s) => s.project_id !== project.id);
      registrar(`Salvi Plaza finalizó el proyecto ${project.code}`, project.code, 'projects');
      return json(project);
    }

    if (path === '/rest/v1/rpc/reopen_project') {
      const project = db.projects.find((p) => p.id === body()?.p_project);
      if (!project || project.phase !== 'finalizado') return fail('El proyecto no está finalizado');
      project.phase = 'facturacion';
      project.finished_at = null;
      registrar(`Salvi Plaza reabrió el proyecto ${project.code}`, project.code, 'projects');
      return json(null);
    }

    // ---------------- Órdenes de trabajo (fase 4) ----------------
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
          `${actorName()} asignó la orden ${order.code} a ${people.find((p) => p.id === workerId)?.full_name ?? ''}`,
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
      if (!part) return fail('Esta orden no está asignada a ti', '42501');
      if (order.archived_at) return fail('La orden está archivada');
      if (order.scheduled_date > today()) {
        return fail(`Esta orden es del ${order.scheduled_date.split('-').reverse().join('/')} : todavía no se puede rellenar`);
      }
      if (order.status === 'validada') return fail('La orden ya está validada: no se puede modificar');
      if (order.status === 'realizada') return fail('La orden ya está enviada y pendiente de revisión');

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
          ? `${actorName()} envió su parte de la orden ${order.code}`
          : `${actorName()} guardó su parte de la orden ${order.code}`,
        order.code, 'work_order_workers',
      );

      recompute(order);
      if (submit && order.status === 'realizada') {
        people.filter((p) => p.role === 'admin').forEach((adm) => avisar(
          adm.id, 'orden_enviada', 'Orden pendiente de revisión',
          `${actorName()} ha enviado ${orderCaption(order)}`, order.id,
        ));
        registrar(`${actorName()} envió la orden ${order.code} a revisión`, order.code, 'work_orders');
      }
      return json(order);
    }

    if (path === '/rest/v1/rpc/validate_order') {
      const order = db.work_orders.find((o) => o.id === body()?.p_order);
      if (!order) return fail('No se encuentra la orden de trabajo', 'P0002');
      if (order.status !== 'realizada') return fail('Solo se valida una orden que esté pendiente de revisión');
      order.status = 'validada';
      order.validated_at = new Date().toISOString();
      order.validated_by = actor().id;
      order.updated_at = order.validated_at;
      db.work_order_workers.filter((w) => w.order_id === order.id).forEach(
        (w) => avisar(w.worker_id, 'validacion', 'Orden validada', orderCaption(order), order.id),
      );
      registrar(`${actorName()} validó la orden ${order.code}`, order.code, 'work_orders');
      return json(order);
    }

    if (path === '/rest/v1/rpc/return_order') {
      const order = db.work_orders.find((o) => o.id === body()?.p_order);
      const reason = (body()?.p_reason ?? '').trim();
      if (!order) return fail('No se encuentra la orden de trabajo', 'P0002');
      if (!reason) return fail('Escribe el motivo de la devolución');
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
      registrar(`${actorName()} devolvió la orden ${order.code}. Motivo: ${reason}`, order.code, 'work_orders');
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
      if (!texto) return fail('Escribe qué material falta');
      if (!order) return fail('No se encuentra la orden de trabajo', 'P0002');
      const mine = db.work_order_workers.some(
        (w) => w.order_id === order.id && w.worker_id === actor().id,
      );
      if (!mine && actor().role !== 'admin') return fail('Esta orden no está asignada a ti', '42501');

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
        `${actorName()} · ${order.code}: ${texto}`, order.id,
      ));
      registrar(`${actorName()} comunicó falta de material en ${order.code}: ${texto}`,
        order.code, 'material_requests');
      return json(request);
    }

    if (path === '/rest/v1/rpc/accept_material_request') {
      const request = db.material_requests.find((r) => r.id === body()?.p_request);
      const nombre = (body()?.p_name ?? '').trim();
      if (!request) return fail('No se encuentra la comunicación', 'P0002');
      if (request.status !== 'pendiente') return fail('Esta comunicación ya está revisada');
      if (!nombre) return fail('Escribe el nombre del material');

      const material = {
        id: `mat-${Math.random().toString(36).slice(2, 8)}`,
        project_id: request.project_id, order_id: request.order_id,
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
      avisar(request.worker_id, 'material_solicitado', 'Material anotado',
        `Se ha añadido «${nombre}» al material pendiente.`, request.order_id);
      registrar(`${actorName()} anotó material pendiente: ${nombre}`, null, 'materials');
      return json(material);
    }

    if (path === '/rest/v1/rpc/discard_material_request') {
      const request = db.material_requests.find((r) => r.id === body()?.p_request);
      if (!request) return fail('No se encuentra la comunicación', 'P0002');
      if (request.status !== 'pendiente') return fail('Esta comunicación ya está revisada');
      request.status = 'descartada';
      request.reviewed_at = new Date().toISOString();
      request.reviewed_by = actor().id;
      request.review_note = (body()?.p_note ?? '') || null;
      avisar(request.worker_id, 'material_solicitado', 'Material revisado',
        request.review_note ?? 'Administración ha revisado tu aviso de material.', request.order_id);
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
              body: `${m.name} · ${project?.code ?? ''} · estaba previsto para el `
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
      registrar(`${actorName()} apuntó un cobro en ${project.code}`, project.code, 'payments');
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
      registrar(`${actorName()} anuló un cobro de ${pay.amount} €`, null, 'payments');
      return json(null);
    }

    if (path === '/rest/v1/project_billing') {
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

    if (path === '/rest/v1/v_calendar') {
      const user = getUser();
      const esAdmin = !user || user.role === 'admin';
      const mine = user && !esAdmin ? myOrderIds(user) : null;
      const rows = [];

      visible('work_orders', db.work_orders).filter((o) => !o.archived_at).forEach((o) => {
        const p = db.projects.find((x) => x.id === o.project_id);
        const c = p ? db.clients.find((x) => x.id === p.client_id) : null;
        rows.push({
          kind: o.type, id: o.id, code: o.code, title: p?.name ?? '', detail: o.description,
          date: o.scheduled_date, status: ORDER_STATUS_ES[o.status],
          project_id: o.project_id, project_code: p?.code ?? null, client_name: c?.name ?? null,
          assigned: db.work_order_workers.filter((w) => w.order_id === o.id).map((w) => w.worker_id),
          movable: true,
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

      visible('fichas', db.fichas)
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

      if (mine) { /* ya filtrado por visible() */ }
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
            message: 'El proyecto está cobrado. Ya puedes finalizarlo.',
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
          message: `Todas las órdenes de ${tipo === 'montaje' ? 'montaje' : 'fabricación'} están validadas. `
            + `Ya puedes pasar a ${next === 'montaje' ? 'Montaje' : 'Facturación'}.`,
        });
      });
      return json(applyFilters(rows, url));
    }

    // ================= FASE 6 · PANEL, INFORMES Y COPIAS =================
    // Los números los calcula la base de datos; aquí se repite el mismo
    // cálculo para que las pantallas enseñen algo coherente. Las fórmulas
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
        // A propósito NO hay alerta de exceso de horas.
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
      }));  // salen las cinco fases, aunque alguna esté a cero
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
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acción.', '42501');
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
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acción.', '42501');
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
      registrar(`${actorName()} generó una copia de seguridad`, null, 'backups');
      return json(fila);
    }

    if (path === '/rest/v1/rpc/restore_data') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acción.', '42501');
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
          // convierte al tipo de cada columna; aquí se hace lo mismo
          // mirando cómo es ese dato en la fila que ya hay.
          const limpia = convertirFila(fila, existente ?? db[tabla][0]);
          if (existente) Object.assign(existente, limpia);  // se actualiza
          else db[tabla].push({ ...limpia });               // se añade, nunca se borra
        }
        filas[tabla] = entrantes.length;
        total += entrantes.length;
      }

      registrar(
        `${actorName()} restauró una copia de seguridad (${total} registros)`, null, 'backups');
      return json({ filas, total, apartados: scope });
    }

    // ---------------- Ajustes ----------------
    if (path === '/rest/v1/rpc/set_company') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acción.', '42501');
      db.settings.company = { ...db.settings.company, ...(body()?.p_company ?? {}) };
      db.settings.updated_at = new Date().toISOString();
      registrar(`${actorName()} cambió los datos de la empresa`, null, 'app_settings');
      return json(db.settings);
    }

    if (path === '/rest/v1/rpc/set_backup_settings') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acción.', '42501');
      const b = body() ?? {};
      db.settings.backup = { ...db.settings.backup, ...(b.p_backup ?? {}) };
      if (b.p_retention_days != null) {
        const dias = Number(b.p_retention_days);
        if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
          return fail('Los días que se guardan las copias deben estar entre 1 y 365.');
        }
        db.settings.backup_retention_days = dias;
      }
      registrar(`${actorName()} cambió los ajustes de las copias`, null, 'app_settings');
      return json(db.settings);
    }

    if (path === '/rest/v1/rpc/set_max_file_mb') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acción.', '42501');
      const mb = Number(body()?.p_mb);
      if (!Number.isFinite(mb) || mb < 1 || mb > 500) {
        return fail('El tamaño máximo debe estar entre 1 y 500 MB.');
      }
      db.settings.max_file_mb = mb;
      return json(db.settings);
    }

    if (path === '/rest/v1/rpc/set_counter') {
      if (soloAdmin()) return fail('No tienes permisos para realizar esta acción.', '42501');
      const b = body() ?? {};
      const valor = Number(b.p_value);
      if (!Number.isFinite(valor) || valor < 0) return fail('El número debe ser cero o mayor.');
      const fila = db.code_counters.find((c) => c.prefix === b.p_prefix && c.year === b.p_year);
      if (fila) fila.last_value = valor;
      else db.code_counters.push({ prefix: b.p_prefix, year: b.p_year, last_value: valor });
      registrar(`${actorName()} ajustó la numeración de ${b.p_prefix}`, null, 'code_counters');
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
      const NOMBRE = { foto: 'Fotografías', video: 'Vídeos', firma: 'Firmas' };
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

    // ---------------- Funciones del servidor ----------------
    // Aquí no hay ninguna credencial: se imita lo que responde Supabase.
    if (path.startsWith('/functions/v1/')) {
      const fn = path.replace('/functions/v1/', '');
      if (soloAdmin()) {
        return route.fulfill({
          status: 403, headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ok: false, message: 'No tienes permisos para realizar esta acción.' }),
        });
      }

      if (fn === 'backup-drive') {
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
        registrar(`${actorName()} subió una copia a Google Drive`, null, 'backups');
        return json({
          ok: true, file_name: nombre,
          link: 'https://drive.google.com/file/d/drive-1/view', size: 24_576, removed: 0,
        });
      }

      if (fn === 'admin-users') {
        const b = body() ?? {};
        if (b.action === 'create') {
          if (people.some((p) => p.username === b.username)) {
            return route.fulfill({
              status: 400, headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ ok: false, message: `Ya existe un usuario llamado «${b.username}».` }),
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
          registrar(`${actorName()} cambió una contraseña`, null, 'profiles');
          return json({ ok: true });
        }
        return route.fulfill({
          status: 400, headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ok: false, message: 'Acción desconocida.' }),
        });
      }
      return json({ ok: true });
    }

    // ---------------- Personas y ajustes ----------------
    if (path === '/rest/v1/profiles') {
      // La ficha de quien ha iniciado sesión refleja lo que devuelva
      // getUser (por ejemplo, un usuario desactivado).
      const actual = getUser();
      const rows = people.map((p) => (actual && p.id === actual.id ? actual : p));

      if (method === 'PATCH') {
        // Cambiar el papel o desactivar a alguien es cosa de administración.
        if (soloAdmin()) return fail('No tienes permisos para realizar esta acción.', '42501');
        const afectadas = applyFilters(people, url);
        const patch = body() ?? {};
        afectadas.forEach((persona) => {
          Object.assign(persona, patch, { updated_at: new Date().toISOString() });
          if ('role' in patch) {
            registrar(
              `${actorName()} puso a ${persona.full_name} como `
              + `${patch.role === 'admin' ? 'administración' : 'trabajador'}`, null, 'profiles');
          }
          if ('active' in patch) {
            registrar(
              `${actorName()} ${patch.active ? 'reactivó' : 'desactivó'} a ${persona.full_name}`,
              null, 'profiles');
          }
        });
        return json(wantsObject ? afectadas[0] ?? null : afectadas);
      }

      if (url.searchParams.get('select') === 'id') return count(applyFilters(rows, url).length);
      const filtered = applyFilters(rows, url);
      return json(wantsObject ? filtered[0] ?? null : filtered);
    }

    if (path === '/rest/v1/app_settings') {
      // Todo el mundo necesita saber el tamaño máximo de archivo; el resto
      // de los ajustes solo los ve administración.
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
          registrar(`Salvi Plaza creó la ficha de ${row.type} ${row.code}`, row.code, 'fichas');
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
          registrar(`Salvi Plaza creó el proyecto ${row.code} · ${row.name}`, row.code, 'projects');
        }

        if (table === 'work_orders') {
          db.counters.OT += 1;
          row.code = `OT-${YEAR}-${String(db.counters.OT).padStart(3, '0')}`;
          row.status = 'pendiente';
          row.submitted_at = null; row.validated_at = null; row.validated_by = null;
          row.returned_at = null; row.return_reason = null;
          row.planned_hours = row.planned_hours ?? 0;
          registrar(
            `${actorName()} creó la orden de ${row.type === 'montaje' ? 'montaje' : 'fabricación'} ${row.code}`,
            row.code, 'work_orders',
          );
        }

        if (table === 'materials') {
          row.received = row.received ?? false;
          row.late_notified_on = null;
          registrar(`${actorName()} anotó material pendiente: ${row.name}`, null, 'materials');
        }

        if (table === 'clients') registrar(`Salvi Plaza creó el cliente ${row.name}`, row.name, 'clients');

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
          registrar(`Salvi Plaza cambió la ficha ${row.code}`, row.code, 'fichas');
        }
        if (table === 'projects' && 'no_assembly' in patch) {
          registrar(
            patch.no_assembly
              ? `Salvi Plaza marcó «Sin montaje» en ${row.code}`
              : `Salvi Plaza quitó «Sin montaje» de ${row.code}`,
            row.code, 'projects',
          );
        }
        if (table === 'materials' && 'received' in patch) {
          if (patch.received) row.late_notified_on = null;
          registrar(
            patch.received
              ? `${actorName()} marcó como recibido «${row.name}»`
              : `${actorName()} volvió a marcar como pendiente «${row.name}»`,
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
              ? `Salvi Plaza archivó ${label} ${name}`
              : `Salvi Plaza recuperó ${label} archivado ${name}`,
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

/** Entra en la aplicación con un usuario. */
export async function signIn(page, port, username, password = 'contrasena-de-prueba') {
  await page.goto(`http://localhost:${port}/#/login`, { waitUntil: 'networkidle' });
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('button:has-text("Entrar")').click();
  await page.waitForTimeout(700);
}

export { PHASES, PHASE_LABEL };
