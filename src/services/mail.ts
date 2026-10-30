import { MAIL_STATUSES_EN_CURSO } from '@/config/constants';
import { supabase, unwrap } from '@/lib/supabase';
import type { MailRequest, MailStatus } from '@/types/db';

/**
 * MEJORA 6 · LA BANDEJA DE ENTRADA DE SOLICITUDES.
 *
 * Aquí NO hay nada que cree solicitudes: las crea el servidor cuando
 * llega un correo, con una función que solo él puede llamar. Desde el
 * navegador se leen, se revisan y se vinculan, y nada más.
 */

const SELECT =
  '*, client:clients(id, name, phone, kind), '
  + 'reviewer:profiles!mail_requests_reviewed_by_fkey(id, full_name), '
  + 'target_ficha:fichas(id, code, type), '
  + 'target_project:projects(id, code, name)';

export interface MailFilters {
  /** «pendiente», «revisada»… o nada para las que están en curso. */
  status?: MailStatus;
  /**
   * Lo que se enseña al abrir: las que están EN CURSO, es decir, las que
   * tienen algo pendiente de hacer. Ver «MAIL_STATUSES_EN_CURSO».
   *
   * Las vinculadas y las descartadas se piden a propósito, por su
   * pestaña, igual que los archivados.
   */
  state?: 'activas' | 'descartadas' | 'todas';
  clientId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listMailRequests(f: MailFilters = {}) {
  const { page = 0, pageSize = 25 } = f;
  let q = supabase.from('mail_requests').select(SELECT, { count: 'exact' })
    .order('received_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (f.status) q = q.eq('status', f.status);
  else if (f.state === 'descartadas') q = q.eq('status', 'descartada');
  // «En curso» es una lista EXPLÍCITA de estados, no «todo lo que no
  // está descartado». Antes era lo segundo, y por eso las solicitudes ya
  // vinculadas —que son las que ya están resueltas— seguían saliendo
  // como si quedara trabajo por hacer.
  else if (f.state !== 'todas') q = q.in('status', MAIL_STATUSES_EN_CURSO);

  if (f.clientId) q = q.eq('client_id', f.clientId);

  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[,()*]/g, ' ');
    q = q.or(
      `code.ilike.%${s}%,subject.ilike.%${s}%,sender_email.ilike.%${s}%,`
      + `original_sender_email.ilike.%${s}%,body_text.ilike.%${s}%`,
    );
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as MailRequest[], count: count ?? 0 };
}

export async function getMailRequest(id: string) {
  return unwrap(
    await supabase.from('mail_requests').select(SELECT).eq('id', id).single(),
  ) as unknown as MailRequest;
}

/** Cuántas hay sin revisar, para el aviso de la navegación. */
export async function countPendingMailRequests() {
  const { count, error } = await supabase.from('mail_requests')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pendiente', 'error']);
  if (error) throw error;
  return count ?? 0;
}

/**
 * REVISAR: completar el cliente, el remitente que no se pudo averiguar y
 * las observaciones. No crea ningún registro definitivo.
 */
export async function reviewMailRequest(id: string, datos: {
  clientId?: string | null;
  notes?: string | null;
  originalSenderEmail?: string | null;
  originalSenderName?: string | null;
}) {
  return unwrap(await supabase.rpc('review_mail_request', {
    p_request: id,
    p_client: datos.clientId ?? null,
    p_notes: datos.notes ?? null,
    p_original_sender_email: datos.originalSenderEmail ?? null,
    p_original_sender_name: datos.originalSenderName ?? null,
  })) as unknown as MailRequest;
}

/**
 * VINCULAR la solicitud con el presupuesto, la visita, el aviso o el
 * proyecto que se ha creado a partir de ella.
 *
 * La ficha se crea ANTES, con el formulario de siempre; esto solo guarda
 * la relación. Son dos pasos a propósito: meter el alta de fichas dentro
 * de una función de la base de datos obligaría a reescribirla ahí.
 */
export async function linkMailRequest(
  id: string, destino: { fichaId: string } | { projectId: string },
) {
  return unwrap(await supabase.rpc('link_mail_request', {
    p_request: id,
    p_ficha: 'fichaId' in destino ? destino.fichaId : null,
    p_project: 'projectId' in destino ? destino.projectId : null,
  })) as unknown as MailRequest;
}

/** Descartar lo que no era una solicitud. NO borra el correo. */
export async function discardMailRequest(id: string, note?: string | null) {
  return unwrap(await supabase.rpc('discard_mail_request', {
    p_request: id, p_note: note ?? null,
  })) as unknown as MailRequest;
}

export async function restoreMailRequest(id: string) {
  return unwrap(await supabase.rpc('restore_mail_request', {
    p_request: id,
  })) as unknown as MailRequest;
}
