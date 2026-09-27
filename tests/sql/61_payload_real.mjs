/**
 * METALPLAFER360 · Genera un payload de restauración DE VERDAD.
 *
 * No inventa el JSON a mano: coge unas filas como las que devuelve la base
 * de datos, las pasa por el mismo código que usa la aplicación para crear
 * el ZIP de la copia (CSV con «;» y BOM) y lo vuelve a leer como lo haría
 * la pantalla de restauración.
 *
 * Eso importa porque al leer un CSV TODOS los valores vuelven como texto:
 * el «false» de una casilla vuelve como la palabra «false», y el 40 como
 * «40». Si la base de datos no supiera convertirlos, restaurar una copia
 * real fallaría aunque las pruebas escritas a mano pasaran.
 *
 * Deja un archivo .sql con el payload para que lo use 62_tests_restauracion_real.sql.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const salida = process.argv[2];
if (!salida) {
  console.error('Uso: node 61_payload_real.mjs <archivo.sql de salida>');
  process.exit(1);
}

// El código de la copia está en TypeScript: se compila a un archivo suelto
// para poder usarlo aquí tal cual, sin reescribirlo.
const tmp = mkdtempSync(join(tmpdir(), 'm360-lib-'));
const bundle = join(tmp, 'backup.mjs');
execFileSync('npx', [
  'esbuild', join(ROOT, 'src/lib/export/backup.ts'),
  '--bundle', '--format=esm', '--platform=neutral', `--outfile=${bundle}`,
], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

const { buildBackupZip, readBackupZip } = await import(bundle);

// Filas como las que salen de PostgreSQL: con nulos, booleanos, números,
// fechas con zona horaria y una columna jsonb.
const CLIENTE = '00000000-0000-4000-8000-0000000000a1';
const PROYECTO = '00000000-0000-4000-8000-0000000000a2';
const ORDEN = '00000000-0000-4000-8000-0000000000a3';
const AHORA = '2026-09-01T09:00:00+00:00';

const tables = {
  clients: [{
    id: CLIENTE, kind: 'empresa', name: 'Cerrajería del Vallès, S.L.',
    tax_id: 'B66554433', phone: '937112233', email: null,
    address: 'Carrer Nou, 4', city: 'Sabadell', postal_code: '08201',
    notes: null, active: true, archived_at: null, is_demo: false,
    created_at: AHORA, updated_at: AHORA,
  }],
  projects: [{
    id: PROYECTO, code: 'PROY-9999-801', client_id: CLIENTE, contact_id: null,
    source_ficha_id: null, name: 'Escalera metálica "El Molí"',
    description: 'Con un punto y coma; y un salto\nde línea, a ver qué pasa.',
    measures: null, finish: null, location: null, address: null, observations: null,
    budget_amount: 12345.67, advance_amount: null,
    budget_hours_fab: 40, budget_hours_mont: 16,
    phase: 'fabricacion', no_assembly: false, billing_status: 'pendiente_cobro',
    finished_at: null, archived_at: null, is_demo: false,
    created_at: AHORA, updated_at: AHORA,
  }],
  work_orders: [{
    id: ORDEN, code: 'OT-9999-801', project_id: PROYECTO, type: 'fabricacion',
    scheduled_date: '2026-09-02', description: 'Cortar y soldar.',
    planned_hours: 8, admin_notes: null, status: 'pendiente',
    submitted_at: null, validated_at: null, validated_by: null,
    returned_at: null, return_reason: null, archived_at: null, is_demo: false,
    created_at: AHORA, updated_at: AHORA,
  }],
  audit_log: [{
    id: 900001, occurred_at: AHORA, actor_id: null, actor_name: 'Salvi Plaza',
    action: 'insert', entity_type: 'projects', entity_id: PROYECTO,
    entity_code: 'PROY-9999-801', summary: 'Prueba de restauración real',
    details: { origen: 'prueba', filas: 3 },
  }],
};

const { bytes } = buildBackupZip({ tables, files: [], company: 'Metalplafer', origin: 'prueba' });
const leido = readBackupZip(bytes);

// Comprobación de que esto prueba lo que dice: después del CSV, los
// valores tienen que haber vuelto como TEXTO.
const proyecto = leido.payload.projects[0];
if (typeof proyecto.no_assembly !== 'string' || typeof proyecto.budget_amount !== 'string') {
  console.error('La copia ya no devuelve texto: revisa esta prueba, porque ha dejado de probar lo que decía.');
  process.exit(1);
}

const json = JSON.stringify(leido.payload);
writeFileSync(salida, `-- Generado por 61_payload_real.mjs. No se edita a mano.
select test.setnote('payload_real', $payload$${json}$payload$);
`);
