import { supabase, unwrap } from '@/lib/supabase';
import { STORAGE_BUCKET } from '@/config/env';
import { categoryFor, safeStorageName, validateFileSize } from '@/lib/files';
import type { DocumentRow } from '@/types/db';

const SELECT = '*, uploader:profiles!documents_uploaded_by_fkey(full_name)';

/** Los documentos cuelgan de una ficha, de un proyecto o de una orden. */
export type DocOwner = { fichaId: string } | { projectId: string } | { orderId: string };

function ownerColumn(owner: DocOwner) {
  if ('fichaId' in owner) return { column: 'ficha_id', id: owner.fichaId, folder: `fichas/${owner.fichaId}` };
  if ('projectId' in owner) return { column: 'project_id', id: owner.projectId, folder: `projects/${owner.projectId}` };
  return { column: 'order_id', id: owner.orderId, folder: `orders/${owner.orderId}` };
}

export function ownerKey(owner: DocOwner) {
  const { column, id } = ownerColumn(owner);
  return `${column}:${id}`;
}

export async function listDocuments(owner: DocOwner, only?: DocumentRow['category'][]) {
  const { column, id } = ownerColumn(owner);
  let q = supabase.from('documents').select(SELECT)
    .eq(column, id).is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (only?.length) q = q.in('category', only);
  return unwrap(await q) as DocumentRow[];
}

/** Lo que está en la papelera de esta ficha, proyecto u orden. */
export async function listTrashed(owner: DocOwner) {
  const { column, id } = ownerColumn(owner);
  return unwrap(
    await supabase.from('documents').select(SELECT)
      .eq(column, id).not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
  ) as DocumentRow[];
}

/**
 * Sube un archivo y lo registra. Si el registro falla, se borra el
 * archivo para no dejar basura en el almacenamiento.
 */
export async function uploadDocument(
  owner: DocOwner,
  file: File,
  opts: { userId: string; maxMb: number; category?: DocumentRow['category'] },
) {
  const sizeError = validateFileSize(file, opts.maxMb);
  if (sizeError) throw new Error(sizeError);

  const { column, id, folder } = ownerColumn(owner);
  const path = `${folder}/${safeStorageName(file.name)}`;
  const contentType = file.type || 'application/octet-stream';

  const upload = await supabase.storage.from(STORAGE_BUCKET)
    .upload(path, file, { contentType, upsert: false });
  if (upload.error) throw upload.error;

  const { data, error } = await supabase.from('documents').insert({
    [column]: id,
    bucket: STORAGE_BUCKET,
    storage_path: path,
    file_name: file.name,
    mime_type: contentType,
    size_bytes: file.size,
    category: opts.category ?? categoryFor(contentType, file.name),
    uploaded_by: opts.userId,
  }).select(SELECT).single();

  if (error) {
    await supabase.storage.from(STORAGE_BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }
  return data as DocumentRow;
}

/** Enlace temporal (1 hora) para ver o descargar un archivo privado. */
export async function signedUrl(path: string, downloadAs?: string) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET)
    .createSignedUrl(path, 3600, downloadAs ? { download: downloadAs } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

/** Miniaturas de varias fotos de una vez. */
export async function signedUrls(paths: string[]) {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(paths, 3600);
  const map: Record<string, string> = {};
  data?.forEach((r) => { if (r.signedUrl && r.path) map[r.path] = r.signedUrl; });
  return map;
}

export async function trashDocument(id: string) {
  unwrap(await supabase.rpc('trash_document', { p_doc: id }));
}

export async function restoreDocument(id: string) {
  unwrap(await supabase.rpc('restore_document', { p_doc: id }));
}
