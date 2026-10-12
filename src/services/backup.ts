import { supabase, unwrap } from '@/lib/supabase';
import { Aviso } from '@/lib/errors';
import {
  BACKUP_TABLES, buildBackupZip, readBackupZip, type BackupContents, type FileReference,
} from '@/lib/export/backup';
import type { AppSettings } from '@/types/db';

export interface BackupRow {
  id: string;
  kind: 'manual' | 'automatico';
  status: 'en_curso' | 'completado' | 'error';
  destination: string;
  file_name: string | null;
  drive_file_id: string | null;
  drive_link: string | null;
  size_bytes: number | null;
  tables: Record<string, number>;
  documents_count: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

/**
 * Por dónde se lee cada tabla. «profiles» no concede el teléfono, el
 * correo ni las preferencias sobre la tabla (REVISIÓN), así que la copia
 * se lee por la vista, que a administración le devuelve todo. Sin esto,
 * la copia de seguridad saldría incompleta sin avisar.
 */
const LEER_POR: Record<string, string> = { profiles: 'profiles_full' };

/** Trae una tabla entera, de mil en mil (es el máximo que devuelve Supabase). */
async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const page = 1000;
  const rows: Record<string, unknown>[] = [];
  const origen = LEER_POR[table] ?? table;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(origen).select('*').range(from, from + page - 1);
    if (error) throw error;
    rows.push(...(data ?? []) as Record<string, unknown>[]);
    if (!data || data.length < page) break;
  }
  return rows;
}

export async function listBackups(limit = 30) {
  return unwrap(
    await supabase.from('backups').select('*').order('started_at', { ascending: false }).limit(limit),
  ) as BackupRow[];
}

/**
 * Genera la copia de seguridad completa en el navegador.
 *
 * Se leen todas las tablas con la sesión de quien lo pide: si no es
 * administración, la base de datos no le devuelve nada y la copia sale
 * vacía. Los archivos (fotos, vídeos, firmas) NO se meten en el ZIP:
 * se guarda su referencia.
 */
export async function generateBackup(opts: { company?: string } = {}) {
  const started = unwrap(
    await supabase.rpc('start_backup', { p_kind: 'manual', p_destination: 'descarga' }),
  ) as unknown as BackupRow;

  try {
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const table of BACKUP_TABLES) {
      tables[table] = await fetchAll(table);
    }

    const files: FileReference[] = (tables.documents ?? []).map((d) => ({
      id: String(d.id ?? ''),
      bucket: String(d.bucket ?? 'documentos'),
      ruta: String(d.storage_path ?? ''),
      nombre: String(d.file_name ?? ''),
      tipo: String(d.category ?? ''),
      bytes: Number(d.size_bytes ?? 0),
      pertenece_a: d.ficha_id ? `ficha:${d.ficha_id}`
        : d.project_id ? `proyecto:${d.project_id}`
        : d.order_id ? `orden:${d.order_id}` : '',
      en_papelera: d.deleted_at ? 'sí' : 'no',
    }));

    const { bytes, manifest, fileName } = buildBackupZip({
      tables, files, company: opts.company, origin: 'aplicación',
    });

    await supabase.rpc('finish_backup', {
      p_backup: started.id,
      p_file_name: fileName,
      p_size: bytes.length,
      p_tables: manifest.tablas,
      p_documents: files.length,
      p_drive_file_id: null,
      p_drive_link: null,
      p_error: null,
    });

    return { bytes, fileName, manifest };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      await supabase.rpc('finish_backup', {
        p_backup: started.id, p_file_name: null, p_size: null, p_tables: {},
        p_documents: 0, p_drive_file_id: null, p_drive_link: null, p_error: message.slice(0, 500),
      });
    } catch { /* si tampoco se puede registrar el fallo, se avisa igualmente abajo */ }
    throw e;
  }
}

/**
 * Pide al servidor que genere la copia y la suba a Google Drive.
 * Las credenciales de Google viven solo en el servidor: aquí no hay
 * ninguna, ni la aplicación las puede ver.
 */
export async function backupToDrive() {
  const { data, error } = await supabase.functions.invoke('backup-drive', { body: {} });
  if (error) {
    throw new Aviso(
      'No se ha podido hablar con el servidor de copias. Revisa en Configuración '
      + 'que la copia automática esté puesta en marcha en Supabase.',
    );
  }
  return data as { ok: boolean; file_name?: string; link?: string; message?: string };
}

/** Lee un archivo de copia elegido por la persona. */
export async function readBackupFile(file: File): Promise<BackupContents> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return readBackupZip(bytes);
}

/** Vuelca los datos de una copia. La base de datos respeta las relaciones. */
export async function restoreBackup(contents: BackupContents, scopes: string[]) {
  if (!scopes.length) throw new Aviso('Elige al menos un apartado para restaurar.');
  return unwrap(await supabase.rpc('restore_data', {
    p_payload: contents.payload,
    p_scope: scopes,
  })) as { filas: Record<string, number>; total: number; apartados: string[] };
}

// ---------------------------------------------------------------------
// CONEXIÓN CON GOOGLE DRIVE
//
// La aplicación NO ve ninguna credencial de Google: solo pregunta cómo
// está la conexión y, para conectarla, pide al servidor una dirección a
// la que mandar a la persona. El permiso que devuelve Google se queda en
// el servidor y jamás pasa por el navegador.
// ---------------------------------------------------------------------
export interface DriveStatus {
  estado: 'sin_conectar' | 'conectado' | 'error';
  conectado: boolean;
  cuenta: string | null;
  carpeta: string | null;
  carpeta_id: string | null;
  conectado_el: string | null;
  ultima_copia: string | null;
  error: string | null;
}

export async function driveStatus() {
  return unwrap(await supabase.rpc('drive_status')) as unknown as DriveStatus;
}

/** Devuelve la dirección de Google a la que hay que ir para autorizar. */
export async function driveAuthUrl() {
  const { data, error } = await supabase.functions.invoke('google-oauth', {
    body: { action: 'start' },
  });
  if (error || !(data as { url?: string })?.url) {
    throw new Aviso(
      'No se ha podido preparar la conexión con Google. Revisa en Supabase que la función '
      + '«google-oauth» esté publicada y que tenga sus dos secretos.',
    );
  }
  return (data as { url: string }).url;
}

export async function driveDisconnect() {
  const { error } = await supabase.functions.invoke('google-oauth', {
    body: { action: 'disconnect' },
  });
  if (error) throw new Aviso('No se ha podido desconectar Google Drive.');
}

export async function backupSettings() {
  return unwrap(
    await supabase.from('app_settings').select('*').eq('id', 1).single(),
  ) as AppSettings;
}
