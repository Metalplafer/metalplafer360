import { useMemo, useRef, useState } from 'react';
import { AtSign, Send } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { useDialogs } from '@/components/ui/Dialogs';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import {
  addComment, commentOwnerKey, listComments, mentionCandidates, type CommentOwner,
} from '@/services/comments';
import { fmtDateTime } from '@/lib/format';
import type { MentionCandidate } from '@/types/db';

/**
 * Comentarios de una ficha, un proyecto, una orden, un parte o una obra.
 * Solo texto. `reloadKey` permite volver a pedirlos cuando algo los
 * cambia desde fuera (por ejemplo, el motivo de una devolución).
 *
 *
 * MENCIONAR A ALGUIEN CON @
 *
 * Escribiendo «@» se ofrece a quién se puede mencionar, y al elegirlo se
 * escribe su nombre tal cual dentro del texto: «@Juan Ortega». El texto
 * se queda legible, y el vínculo con la persona se manda aparte para que
 * el servidor sepa a quién avisar sin tener que adivinarlo del texto.
 *
 * A quién se puede mencionar NO lo decide esta pantalla: lo decide la
 * base de datos, que solo ofrece a quien ya puede ver el comentario y
 * rechaza cualquier otro al guardar.
 */
export function CommentsPanel({ owner, reloadKey }: { owner: CommentOwner; reloadKey?: string | null }) {
  const { profile } = useAuth();
  const { toast } = useDialogs();
  const key = commentOwnerKey(owner);
  const comments = useAsync(() => listComments(owner), [key, reloadKey]);
  const candidatos = useAsync(() => mentionCandidates(owner), [key]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * EL «@…» QUE SE ESTÁ ESCRIBIENDO.
   *
   * Hay que guardar las dos posiciones y el trozo escrito, no solo dónde
   * empieza la arroba: si solo se guardara el inicio, habría que leer
   * «hasta el final del texto» para saber qué se está buscando, y
   * entonces mencionar a alguien EN MEDIO de una frase no ofrecería a
   * nadie, porque el resto de la frase no coincide con ningún nombre.
   */
  const [mencion, setMencion] = useState<{
    inicio: number; fin: number; trozo: string;
  } | null>(null);
  const caja = useRef<HTMLTextAreaElement>(null);

  const gente = candidatos.data ?? [];

  /**
   * QUIÉN ESTÁ MENCIONADO en lo que se ha escrito.
   *
   * Se busca el nombre completo dentro del texto, que es lo que se
   * escribió al elegirlo de la lista. Si alguien lo borra a mano, deja
   * de estar mencionado, que es lo que cabe esperar.
   */
  const mencionados = useMemo(
    () => gente.filter((p) => text.includes(`@${p.full_name}`)),
    [gente, text],
  );

  const sugeridos = mencion === null ? []
    : gente.filter((p) => p.full_name.toLowerCase()
        .includes(mencion.trozo.trim().toLowerCase())).slice(0, 6);

  function alEscribir(valor: string, cursor: number) {
    setText(valor);
    // Se mira hacia ATRÁS desde el cursor, hasta la última «@». Si
    // entremedio hay un salto de línea, ya no se está escribiendo una
    // mención; y si lo escrito es muy largo, tampoco.
    const antes = valor.slice(0, cursor);
    const i = antes.lastIndexOf('@');
    const trozo = i < 0 ? '' : antes.slice(i + 1);
    setMencion(i >= 0 && !trozo.includes('\n') && trozo.length <= 40
      ? { inicio: i, fin: cursor, trozo }
      : null);
  }

  function elegir(p: MentionCandidate) {
    if (mencion === null) return;
    // Se sustituye EXACTAMENTE el trozo «@lo-que-se-escribió», dejando
    // intacto lo que hubiera después. Así se puede mencionar a alguien en
    // medio de una frase ya escrita.
    const siguiente = `${text.slice(0, mencion.inicio)}@${p.full_name} ${text.slice(mencion.fin)}`;
    setText(siguiente);
    setMencion(null);
    caja.current?.focus();
  }

  async function send() {
    if (!profile || !text.trim()) return;
    setBusy(true);
    try {
      const added = await addComment(owner, profile.id, text, mencionados.map((p) => p.id));
      comments.setData([...(comments.data ?? []), added]);
      setText('');
      setMencion(null);
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
          <div className="suggest">
            <textarea id="comment-box" className="textarea" rows={3} maxLength={4000}
                      ref={caja} value={text}
                      placeholder="Escribe un comentario… Con @ avisas a alguien."
                      onChange={(e) => alEscribir(e.target.value, e.target.selectionStart ?? 0)}
                      onBlur={() => window.setTimeout(() => setMencion(null), 150)} />
            {mencion !== null && sugeridos.length > 0 && (
              <div className="suggest-box" role="listbox" aria-label="A quién avisar">
                <div className="title">A quién avisar</div>
                {sugeridos.map((p) => (
                  <button key={p.id} type="button" onClick={() => elegir(p)}>
                    <strong>{p.full_name}</strong>
                    <small>{p.role === 'admin' ? 'Administración' : 'Trabajador'}</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          {mencionados.length > 0 && (
            <p className="hint" style={{ marginBottom: 0 }}>
              <AtSign size={13} aria-hidden /> Se avisará a{' '}
              <strong>{mencionados.map((p) => p.full_name).join(', ')}</strong>.
            </p>
          )}

          <div className="row-between">
            <span className="hint">
              Solo texto. Las fotos y documentos se suben en el apartado de arriba.
              {gente.length > 0 && ' Escribe @ para avisar a alguien.'}
            </span>
            <button className="btn btn-primary" onClick={send} disabled={busy || !text.trim()}>
              <Send />Enviar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
