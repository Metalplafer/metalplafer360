import { supabase, unwrap } from '@/lib/supabase';
import { Aviso } from '@/lib/errors';
import type { CommentRow } from '@/types/db';

/** Los comentarios cuelgan de una ficha, de un proyecto o de una orden. */
export type CommentOwner = { fichaId: string } | { projectId: string } | { orderId: string };

const column = (owner: CommentOwner) =>
  ('fichaId' in owner ? 'ficha_id' : 'projectId' in owner ? 'project_id' : 'order_id');
const ownerId = (owner: CommentOwner) =>
  ('fichaId' in owner ? owner.fichaId : 'projectId' in owner ? owner.projectId : owner.orderId);

export function commentOwnerKey(owner: CommentOwner) {
  return `${column(owner)}:${ownerId(owner)}`;
}

export async function listComments(owner: CommentOwner) {
  return unwrap(
    await supabase.from('comments')
      .select('*, author:profiles(full_name, role)')
      .eq(column(owner), ownerId(owner))
      .order('created_at'),
  ) as CommentRow[];
}

export async function addComment(owner: CommentOwner, authorId: string, body: string) {
  const text = body.trim();
  if (!text) throw new Aviso('Escribe un comentario antes de enviarlo.');
  if (text.length > 4000) throw new Aviso('El comentario es demasiado largo (máximo 4.000 caracteres).');
  return unwrap(
    await supabase.from('comments')
      .insert({ [column(owner)]: ownerId(owner), author_id: authorId, body: text })
      .select('*, author:profiles(full_name, role)').single(),
  ) as CommentRow;
}
