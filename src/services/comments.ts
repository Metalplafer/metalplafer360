import { supabase, unwrap } from '@/lib/supabase';
import { Aviso } from '@/lib/errors';
import type { CommentRow, MentionCandidate } from '@/types/db';

/**
 * DE QUÉ AUTOR SE HABLA, DICHO POR SU NOMBRE EXACTO.
 *
 * «comments» tiene DOS caminos hacia «profiles»:
 *   · comments_author_id_fkey         (author_id · quién escribió)
 *   · comments_target_worker_id_fkey  (target_worker_id · a quién va)
 *
 * El segundo lo añadió el módulo de partes. Desde entonces, pedir
 * «author:profiles(...)» sin decir POR CUÁL de los dos caminos dejaba a
 * PostgREST sin saber qué hacer: respondía PGRST201 («más de una
 * relación») y la pantalla, que no sabía traducir ese código, enseñaba
 * «Ha ocurrido un error inesperado». Por eso no se podía comentar, ni
 * como administración ni como trabajador.
 *
 * Se nombra la clave, igual que ya hace «documents» —que tiene el mismo
 * caso de dos caminos (uploaded_by y deleted_by)— y por eso sí funciona.
 *
 * SI SE AÑADE OTRA COLUMNA DE «comments» HACIA «profiles», esto sigue
 * valiendo: lo que no vale es quitarle el nombre de la clave. Hay una
 * prueba que lo vigila en tests/unit/consultas.test.ts.
 */
const AUTOR = 'author:profiles!comments_author_id_fkey(full_name, role)';

/**
 * Los comentarios cuelgan de una ficha, de un proyecto, de una orden, de
 * un parte de trabajo o de una obra.
 */
export type CommentOwner =
  { fichaId: string } | { projectId: string } | { orderId: string }
  | { reportId: string } | { workId: string };

const column = (owner: CommentOwner) =>
  ('fichaId' in owner ? 'ficha_id'
    : 'projectId' in owner ? 'project_id'
      : 'reportId' in owner ? 'report_id'
        : 'workId' in owner ? 'work_id' : 'order_id');
const ownerId = (owner: CommentOwner) =>
  ('fichaId' in owner ? owner.fichaId
    : 'projectId' in owner ? owner.projectId
      : 'reportId' in owner ? owner.reportId
        : 'workId' in owner ? owner.workId : owner.orderId);

export function commentOwnerKey(owner: CommentOwner) {
  return `${column(owner)}:${ownerId(owner)}`;
}

export async function listComments(owner: CommentOwner) {
  return unwrap(
    await supabase.from('comments')
      .select(`*, ${AUTOR}`)
      .eq(column(owner), ownerId(owner))
      .order('created_at'),
  ) as CommentRow[];
}

/**
 * GUARDAR UN COMENTARIO, con o sin menciones.
 *
 * Pasa por «post_comment» y no por una inserción directa, y es a
 * propósito: el comentario y sus menciones tienen que guardarse en el
 * mismo momento. Si fueran dos viajes y el segundo fallara, quedaría un
 * comentario que menciona a alguien en el texto y no avisa a nadie.
 *
 * El «authorId» ya no se manda: lo pone el servidor con quien de verdad
 * ha entrado. Se deja en la firma porque lo pasan varias pantallas y
 * quitarlo de todas no aportaría nada.
 */
export async function addComment(
  owner: CommentOwner, _authorId: string, body: string, mentions: string[] = [],
) {
  const text = body.trim();
  if (!text) throw new Aviso('Escribe un comentario antes de enviarlo.');
  if (text.length > 4000) throw new Aviso('El comentario es demasiado largo (máximo 4.000 caracteres).');

  const col = column(owner);
  const creado = unwrap(await supabase.rpc('post_comment', {
    p_body: text,
    p_ficha: col === 'ficha_id' ? ownerId(owner) : null,
    p_project: col === 'project_id' ? ownerId(owner) : null,
    p_order: col === 'order_id' ? ownerId(owner) : null,
    p_report: col === 'report_id' ? ownerId(owner) : null,
    p_work: col === 'work_id' ? ownerId(owner) : null,
    p_mentions: mentions,
  })) as unknown as CommentRow;

  // «post_comment» devuelve la fila de «comments» tal cual, sin el autor
  // acompañado. Se vuelve a pedir con su nombre para poder enseñarlo sin
  // esperar a recargar la lista entera.
  return unwrap(
    await supabase.from('comments').select(`*, ${AUTOR}`).eq('id', creado.id).single(),
  ) as CommentRow;
}

/**
 * A QUIÉN SE PUEDE MENCIONAR aquí.
 *
 * Lo decide el servidor. Si quien pregunta no tiene nada que ver con
 * este sitio, recibe la lista vacía, así que esto tampoco sirve para
 * enumerar a la plantilla.
 */
export async function mentionCandidates(owner: CommentOwner) {
  const col = column(owner);
  return unwrap(await supabase.rpc('comment_mention_candidates', {
    p_ficha: col === 'ficha_id' ? ownerId(owner) : null,
    p_project: col === 'project_id' ? ownerId(owner) : null,
    p_order: col === 'order_id' ? ownerId(owner) : null,
    p_report: col === 'report_id' ? ownerId(owner) : null,
    p_work: col === 'work_id' ? ownerId(owner) : null,
  })) as MentionCandidate[];
}
