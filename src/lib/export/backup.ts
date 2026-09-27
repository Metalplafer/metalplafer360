/**
 * Formato de las copias de seguridad de METALPLAFER360.
 *
 * Una copia es un ZIP con:
 *   · tablas/<tabla>.csv ....... todos los datos, tal cual están
 *   · archivos/INDICE.csv ...... referencias de fotos, vídeos y documentos
 *   · metadatos.json ........... versión, fecha, recuento de filas
 *   · LEEME.txt ................ qué es esto y cómo se restaura
 *
 * Los archivos multimedia NO se convierten en CSV: siguen en el
 * almacenamiento de Supabase y aquí se guarda su referencia, que es lo
 * que hace falta para volver a enlazarlos.
 *
 * Este módulo no depende de React ni de Supabase: lo usan igual la
 * aplicación y la función del servidor que sube la copia a Google Drive.
 */
import { fromCsv, toCsv } from './csv.ts';
import { makeZip, readZip, type ReadEntry } from './zip.ts';

export const BACKUP_VERSION = 1;

/**
 * Orden en el que se guardan y se restauran las tablas.
 * Primero aquello de lo que dependen las demás: si se cambia este orden,
 * una restauración puede fallar por las relaciones.
 */
export const BACKUP_TABLES = [
  'app_settings', 'code_counters', 'profiles',
  'clients', 'client_contacts', 'fichas',
  'projects', 'project_substatuses',
  'work_orders', 'work_order_workers',
  'materials', 'material_requests', 'payments',
  'documents', 'comments', 'audit_log',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/**
 * Columnas que guardan un objeto (JSON). En el CSV se escriben como texto
 * y al restaurar hay que volver a convertirlas, o entrarían como una
 * cadena en vez de como el objeto que eran.
 */
export const JSON_COLUMNS: Partial<Record<BackupTable, string[]>> = {
  app_settings: ['company', 'backup'],
  profiles: ['preferences'],
  audit_log: ['details'],
};

export interface RestoreScope {
  key: string;
  label: string;
  hint: string;
  tables: BackupTable[];
}

/** Apartados que se pueden restaurar por separado. */
export const RESTORE_SCOPES: RestoreScope[] = [
  { key: 'clientes', label: 'Clientes', hint: 'Clientes y sus contactos',
    tables: ['clients', 'client_contacts'] },
  { key: 'fichas', label: 'Fichas', hint: 'Presupuestos, visitas y avisos',
    tables: ['fichas'] },
  { key: 'proyectos', label: 'Proyectos', hint: 'Proyectos, fases y subestados',
    tables: ['projects', 'project_substatuses'] },
  { key: 'ordenes', label: 'Órdenes de trabajo', hint: 'Órdenes y partes de trabajo',
    tables: ['work_orders', 'work_order_workers'] },
  { key: 'material', label: 'Material', hint: 'Material pendiente y avisos del taller',
    tables: ['materials', 'material_requests'] },
  { key: 'cobros', label: 'Cobros', hint: 'Cobros parciales de facturación',
    tables: ['payments'] },
  { key: 'documentos', label: 'Documentos y comentarios', hint: 'Referencias de archivos y comentarios',
    tables: ['documents', 'comments'] },
  { key: 'usuarios', label: 'Usuarios', hint: 'Nombres y roles (no crea accesos nuevos)',
    tables: ['profiles'] },
  { key: 'configuracion', label: 'Configuración', hint: 'Datos de empresa y numeración',
    tables: ['app_settings', 'code_counters'] },
  { key: 'historial', label: 'Historial', hint: 'Registro de todo lo ocurrido',
    tables: ['audit_log'] },
];

export interface BackupManifest {
  aplicacion: 'METALPLAFER360';
  version: number;
  generado: string;
  empresa?: string;
  origen?: string;
  tablas: Record<string, number>;
  archivos: { total: number; bytes: number };
}

export interface FileReference {
  id: string;
  bucket: string;
  ruta: string;
  nombre: string;
  tipo: string;
  bytes: number;
  pertenece_a: string;
  en_papelera: string;
}

const LEEME = (manifest: BackupManifest) => `COPIA DE SEGURIDAD DE METALPLAFER360
====================================

Generada el ${manifest.generado}
${manifest.empresa ? `Empresa: ${manifest.empresa}\n` : ''}
QUÉ HAY EN ESTE ARCHIVO
-----------------------
tablas/          Un CSV por cada tabla, con TODOS los datos.
                 Se abren con Excel (separador: punto y coma).
archivos/        INDICE.csv con la referencia de cada fotografía,
                 vídeo, firma y documento subido.
metadatos.json   Versión del formato y cuántas filas lleva cada tabla.

LAS FOTOGRAFÍAS Y LOS VÍDEOS NO ESTÁN AQUÍ
------------------------------------------
Los archivos siguen guardados en Supabase (contenedor «documentos»),
porque meterlos en un CSV no tendría ningún sentido. En archivos/INDICE.csv
está la ruta exacta de cada uno para poder volver a enlazarlos.

CÓMO SE RESTAURA
----------------
En la aplicación: Configuración → Copias de seguridad → Restaurar,
y se elige este archivo. Se puede restaurar todo o solo una parte
(clientes, proyectos, órdenes, material…).

La restauración NO borra lo que ya hay: actualiza lo que coincide y
añade lo que falta.

NO cambies los CSV a mano si no sabes lo que haces: los identificadores
son los que enlazan unas tablas con otras.
`;

/** Arma el ZIP de la copia. */
export function buildBackupZip(input: {
  tables: Record<string, Record<string, unknown>[]>;
  files: FileReference[];
  company?: string;
  origin?: string;
  now?: Date;
}): { bytes: Uint8Array; manifest: BackupManifest; fileName: string } {
  const now = input.now ?? new Date();
  const tablas: Record<string, number> = {};
  const entries = [];

  for (const table of BACKUP_TABLES) {
    const rows = input.tables[table] ?? [];
    tablas[table] = rows.length;
    const columns = rows.length
      ? [...new Set(rows.flatMap((r) => Object.keys(r)))]
      : [];
    entries.push({ name: `tablas/${table}.csv`, data: toCsv(rows, columns, true) });
  }

  const manifest: BackupManifest = {
    aplicacion: 'METALPLAFER360',
    version: BACKUP_VERSION,
    generado: now.toISOString(),
    empresa: input.company,
    origen: input.origin,
    tablas,
    archivos: {
      total: input.files.length,
      bytes: input.files.reduce((sum, f) => sum + Number(f.bytes || 0), 0),
    },
  };

  entries.push({
    name: 'archivos/INDICE.csv',
    data: toCsv(input.files as unknown as Record<string, unknown>[],
      ['id', 'bucket', 'ruta', 'nombre', 'tipo', 'bytes', 'pertenece_a', 'en_papelera'], true),
  });
  entries.push({ name: 'metadatos.json', data: JSON.stringify(manifest, null, 2) });
  entries.push({ name: 'LEEME.txt', data: LEEME(manifest) });

  const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return { bytes: makeZip(entries, now), manifest, fileName: `metalplafer360-${stamp}.zip` };
}

export interface BackupContents {
  manifest: BackupManifest | null;
  payload: Record<string, Record<string, unknown>[]>;
  files: number;
}

/**
 * Lee una copia de seguridad y la deja lista para restaurar.
 * Comprueba que sea de esta aplicación antes de tocar nada.
 */
export function readBackupZip(bytes: Uint8Array): BackupContents {
  const entries: ReadEntry[] = readZip(bytes);
  const byName = new Map(entries.map((e) => [e.name, e]));

  const metaEntry = byName.get('metadatos.json');
  let manifest: BackupManifest | null = null;
  if (metaEntry) {
    try { manifest = JSON.parse(metaEntry.text()) as BackupManifest; }
    catch { manifest = null; }
  }

  if (manifest && manifest.aplicacion !== 'METALPLAFER360') {
    throw new Error('Este archivo no es una copia de seguridad de METALPLAFER360.');
  }
  if (manifest && manifest.version > BACKUP_VERSION) {
    throw new Error('Esta copia se hizo con una versión más nueva de la aplicación.');
  }

  const payload: Record<string, Record<string, unknown>[]> = {};
  let found = 0;

  for (const table of BACKUP_TABLES) {
    const entry = byName.get(`tablas/${table}.csv`);
    if (!entry) continue;
    found++;
    const rows = fromCsv(entry.text());
    const jsonCols = JSON_COLUMNS[table] ?? [];
    payload[table] = rows.map((row) => {
      const out: Record<string, unknown> = { ...row };
      for (const col of jsonCols) {
        const value = row[col];
        if (typeof value === 'string') {
          try { out[col] = JSON.parse(value); } catch { out[col] = null; }
        }
      }
      return out;
    });
  }

  if (!found) {
    throw new Error('El archivo no contiene ninguna tabla: ¿seguro que es una copia de seguridad?');
  }

  const index = byName.get('archivos/INDICE.csv');
  return { manifest, payload, files: index ? fromCsv(index.text()).length : 0 };
}

/** Tablas de los apartados elegidos, para avisar de qué se va a tocar. */
export function tablesForScopes(scopes: string[]): BackupTable[] {
  const set = new Set<BackupTable>();
  for (const scope of scopes) {
    RESTORE_SCOPES.find((s) => s.key === scope)?.tables.forEach((t) => set.add(t));
  }
  return BACKUP_TABLES.filter((t) => set.has(t));
}
