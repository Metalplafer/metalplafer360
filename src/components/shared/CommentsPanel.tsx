import { useState } from 'react';
import { Send } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { useDialogs } from '@/components/ui/Dialogs';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { addComment, commentOwnerKey, listComments, type CommentOwner } from '@/services/comments';
import { fmtDateTime } from '@/lib/format';

/**
 * Comentarios de una ficha, un proyecto o una orden. Solo texto.
 * `reloadKey` permite volver a pedirlos cuando algo los cambia desde
 * fuera (por ejemplo, el motivo de una devolución).
 */
export function CommentsPanel({ owner, reloadKey }: { owner: CommentOwner; reloadKey?: string | null }) {
  const { profile } = useAuth();
  const { toast } = useDialogs();
  const key = commentOwnerKey(owner);
  const comments = useAsync(() => listComments(owner), [key, reloadKey]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!profile || !text.trim()) return;
    setBusy(true);
    try {
      const added = await addComment(owner, profile.id, text);
      comments.setData([...(comments.data ?? []), added]);
      setText('');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>Comentarios</h2></div>
      <div className="panel-body stack">
        {comments.loading && !comments.data ? <Loading />
          : comments.error ? <ErrorBox message={comments.error} onRetry={comments.reload} />
          : !comments.data?.length ? <Empty title="Sin comentarios" />
          : (
            <div className="stack" style={{ gap: 8 }}>
              {comments.data.map((c) => (
                <article key={c.id} className={`comment${c.author?.role === 'admin' ? ' admin' : ''}`}>
                  <header>
                    <strong>{c.author?.full_name ?? 'Sistema'}</strong>
                    <time dateTime={c.created_at}>{fmtDateTime(c.created_at)}</time>
                  </header>
                  <div className="pre">{c.body}</div>
                </article>
              ))}
            </div>
          )}

        <div className="field">
          <label htmlFor="comment-box" className="sr-only">Nuevo comentario</label>
          <textarea id="comment-box" className="textarea" rows={3} maxLength={4000} value={text}
                    placeholder="Escribe un comentario…" onChange={(e) => setText(e.target.value)} />
          <div className="row-between">
            <span className="hint">Solo texto. Las fotos y documentos se suben en el apartado de arriba.</span>
            <button className="btn btn-primary" onClick={send} disabled={busy || !text.trim()}>
              <Send />Enviar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
