import { supabase, unwrap } from '@/lib/supabase';
import type { NotificationRow } from '@/types/db';

/**
 * Avisos internos de la aplicación.
 * No se envía ningún correo electrónico: todo ocurre dentro de METALPLAFER360.
 * La base de datos solo devuelve los avisos de quien pregunta.
 */
export async function listNotifications(limit = 30) {
  return unwrap(
    await supabase.from('notifications').select('*')
      .order('created_at', { ascending: false })
      .limit(limit),
  ) as NotificationRow[];
}

export async function unreadCount() {
  const { count, error } = await supabase.from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

/** Sin lista, marca todos los míos como leídos. */
export async function markRead(ids?: string[]) {
  return unwrap(
    await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null }),
  ) as number;
}
