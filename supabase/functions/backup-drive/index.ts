/**
 * METALPLAFER360 · Copia de seguridad a Google Drive.
 *
 * La llama:
 *   · la aplicación, cuando administración pulsa «Subir a Google Drive»;
 *   · la base de datos, todos los días a las 02:00 (hora de Madrid).
 *
 * LAS CREDENCIALES DE GOOGLE Y LA CLAVE DE SERVIDOR NO ESTÁN EN EL
 * REPOSITORIO: se leen de las variables de entorno de Supabase.
 *
 * Publicar:  supabase functions deploy backup-drive
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildBackupZip, BACKUP_TABLES, type FileReference }
  from '../../../src/lib/export/backup.ts';
import { deleteFromDrive, uploadToDrive, type DriveConfig } from '../_shared/drive.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });

const fail = (message: string, status = 400) => json({ ok: false, message }, status);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return fail('Método no permitido', 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const cronSecret = Deno.env.get('BACKUP_CRON_SECRET');
  const drive: DriveConfig = {
    email: Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL') ?? '',
    privateKey: Deno.env.get('GOOGLE_PRIVATE_KEY') ?? '',
    folderId: Deno.env.get('GOOGLE_DRIVE_FOLDER_ID') ?? undefined,
  };

  if (!url || !serviceKey || !anonKey) {
    return fail('Faltan las variables de entorno de Supabase en la función.', 500);
  }
  if (!drive.email || !drive.privateKey) {
    return fail(
      'Falta configurar Google Drive. Añade GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY '
      + 'a los secretos de Supabase (está explicado en la guía de puesta en marcha).', 400,
    );
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ---------- ¿Quién lo pide? ----------
  // O una persona con sesión de administración, o la tarea programada con
  // su secreto. Cualquier otra cosa se rechaza.
  let kind: 'manual' | 'automatico' = 'automatico';
  let actor: string | null = null;

  const authorization = request.headers.get('Authorization') ?? '';
  const secret = request.headers.get('x-backup-secret') ?? '';

  if (cronSecret && secret && secret === cronSecret) {
    kind = 'automatico';
  } else if (authorization.startsWith('Bearer ')) {
    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: me } = await asUser.auth.getUser();
    if (!me?.user) return fail('Hace falta iniciar sesión.', 401);

    const { data: profile } = await asUser
      .from('profiles').select('role, active').eq('id', me.user.id).maybeSingle();
    if (!profile || profile.role !== 'admin' || !profile.active) {
      return fail('No tienes permisos para realizar esta acción.', 403);
    }
    kind = 'manual';
    actor = me.user.id;
  } else {
    return fail('Hace falta iniciar sesión.', 401);
  }

  // ---------- Ajustes ----------
  const { data: settings } = await admin
    .from('app_settings').select('company, backup, backup_retention_days').eq('id', 1).maybeSingle();

  const backupSettings = (settings?.backup ?? {}) as { enabled?: boolean; folder?: string };
  if (kind === 'automatico' && backupSettings.enabled === false) {
    return json({ ok: true, message: 'La copia automática está desactivada.' });
  }

  const company = (settings?.company as Record<string, string> | null)?.name ?? 'Metalplafer';
  const retention = Number(settings?.backup_retention_days ?? 30);

  // ---------- Se deja constancia de que empieza ----------
  const { data: record, error: startError } = await admin
    .from('backups')
    .insert({ kind, destination: 'drive', created_by: actor })
    .select('id').single();

  if (startError || !record) return fail(`No se ha podido registrar la copia: ${startError?.message}`, 500);

  try {
    // ---------- Se leen todas las tablas ----------
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const table of BACKUP_TABLES) {
      const rows: Record<string, unknown>[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await admin.from(table).select('*').range(from, from + page - 1);
        if (error) throw new Error(`Leyendo ${table}: ${error.message}`);
        rows.push(...(data ?? []));
        if (!data || data.length < page) break;
      }
      tables[table] = rows;
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
      tables, files, company, origin: kind === 'manual' ? 'manual' : 'automática',
    });

    // ---------- A Google Drive ----------
    const uploaded = await uploadToDrive(drive, fileName, bytes);

    await admin.from('backups').update({
      status: 'completado',
      file_name: uploaded.name,
      drive_file_id: uploaded.id,
      drive_link: uploaded.link ?? null,
      size_bytes: bytes.length,
      tables: manifest.tablas,
      documents_count: files.length,
      finished_at: new Date().toISOString(),
    }).eq('id', record.id);

    // ---------- Retirada de las copias antiguas ----------
    const limit = new Date(Date.now() - retention * 86400000).toISOString();
    const { data: expired } = await admin
      .from('backups')
      .select('id, drive_file_id')
      .eq('kind', 'automatico')
      .not('drive_file_id', 'is', null)
      .lt('started_at', limit);

    let removed = 0;
    for (const old of expired ?? []) {
      try {
        if (await deleteFromDrive(drive, old.drive_file_id as string)) {
          await admin.from('backups').delete().eq('id', old.id);
          removed++;
        }
      } catch { /* si una no se puede borrar, se intentará mañana */ }
    }

    await admin.rpc('log_event', {
      p_action: 'backup',
      p_entity_type: 'backups',
      p_summary: `Copia de seguridad ${kind === 'manual' ? 'manual' : 'automática'} subida a `
        + `Google Drive (${uploaded.name})`,
      p_details: { tablas: manifest.tablas, retiradas: removed },
      p_actor: actor,
    });

    return json({
      ok: true,
      file_name: uploaded.name,
      link: uploaded.link ?? null,
      size: bytes.length,
      removed,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from('backups').update({
      status: 'error', error: message.slice(0, 500), finished_at: new Date().toISOString(),
    }).eq('id', record.id);
    return fail(`No se ha podido completar la copia: ${message}`, 500);
  }
});
