import { useEffect, useState } from 'react';
import { Archive, CalendarPlus, Check, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Layout';
import { useDialogs } from '@/components/ui/Dialogs';
import { fmtDate, todayMadrid } from '@/lib/format';
import {
  addTaskItem, archiveInternalTask, clearTaskEvent, deleteTaskItem, listTaskItems,
  moveInternalTask, setInternalTaskDone, setTaskEvent, updateInternalTask, updateTaskItem,
} from '@/services/internas';
import type { InternalCard, InternalList, InternalTaskItem } from '@/types/db';

/**
 * LA TARJETA ABIERTA.
 *
 * Todo lo que se hace con una gestión interna cabe aquí: escribirla,
 * repasar su checklist, moverla de lista, ponerle fecha en el
 * calendario y retirarla del tablero.
 *
 * NO ES UNA PÁGINA, es una ventana. Abrir una tarjeta no debería hacer
 * perder de vista el tablero: se mira, se toca algo y se cierra. Es lo
 * que se pidió con «evita formularios innecesariamente complejos».
 *
 * CADA CAMBIO SE GUARDA AL MOMENTO. No hay botón de guardar porque no
 * hay nada que confirmar: marcar una casilla es marcar una casilla. El
 * título y las notas se guardan al salir del campo, para no mandar una
 * petición por cada tecla.
 */
export function InternalTaskModal({ card, lists, onClose, onChange }: {
  card: InternalCard;
  lists: InternalList[];
  onClose: () => void;
  /** Para que el tablero se entere de lo que ha pasado aquí dentro. */
  onChange: () => void;
}) {
  const { toast, confirm } = useDialogs();
  const [title, setTitle] = useState(card.title);
  const [notes, setNotes] = useState(card.notes ?? '');
  const [items, setItems] = useState<InternalTaskItem[]>([]);
  const [nuevo, setNuevo] = useState('');
  const [busy, setBusy] = useState(false);

  // El evento: se escribe aparte y se guarda a propósito, porque poner
  // una fecha en el calendario de todos no es un cambio que deba
  // escaparse por teclear.
  const [verEvento, setVerEvento] = useState(false);
  const [dia, setDia] = useState(card.event_day ?? todayMadrid());
  const [detalle, setDetalle] = useState('');

  useEffect(() => {
    listTaskItems(card.id).then(setItems).catch(() => undefined);
  }, [card.id]);

  const hechos = items.filter((i) => i.done).length;

  async function intentar(accion: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await accion();
      if (ok) toast.success(ok);
      onChange();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function recargarItems() {
    setItems(await listTaskItems(card.id));
    onChange();
  }

  async function anadirItem() {
    const texto = nuevo.trim();
    if (!texto) return;
    setNuevo('');
    try {
      await addTaskItem(card.id, texto);
      await recargarItems();
    } catch (e) { toast.error(e); setNuevo(texto); }
  }

  async function archivar() {
    const ok = await confirm({
      title: 'Archivar la tarjeta',
      message: <>«{card.title}» saldrá del tablero. <strong>No se borra nada</strong>: se
        conserva entera, con su checklist y su estado, en «Tareas archivadas», y se puede
        devolver al tablero cuando haga falta.</>,
      confirmLabel: 'Archivar',
    });
    if (!ok) return;
    await intentar(() => archiveInternalTask(card.id), 'Tarjeta archivada');
    onClose();
  }

  return (
    <Modal title={card.title} onClose={onClose} size="wide">
      <div className="stack">
        <Field label="Título" htmlFor="it-title">
          <input id="it-title" className="input" value={title} maxLength={200}
                 onChange={(e) => setTitle(e.target.value)}
                 onBlur={() => title.trim() && title !== card.title
                   && intentar(() => updateInternalTask(card.id, { title }))} />
        </Field>

        <Field label="Notas" htmlFor="it-notes"
               hint="Lo que haga falta recordar: a quién hay que llamar, qué falta, qué se acordó.">
          <textarea id="it-notes" className="textarea" rows={4} value={notes} maxLength={4000}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={() => notes !== (card.notes ?? '')
                      && intentar(() => updateInternalTask(card.id, { notes }))} />
        </Field>

        <div className="form-grid">
          <Field label="Lista" htmlFor="it-list">
            <select id="it-list" className="select" value={card.list_id} disabled={busy}
                    onChange={(e) => intentar(
                      () => moveInternalTask(card.id, e.target.value), 'Tarjeta movida')}>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>

          <Field label="Estado">
            <button type="button" className={`btn ${card.done ? 'btn-ghost' : ''}`} disabled={busy}
                    onClick={() => intentar(() => setInternalTaskDone(card.id, !card.done))}>
              <Check size={15} />{card.done ? 'Marcada como realizada' : 'Marcar como realizada'}
            </button>
          </Field>
        </div>

        {/* ---------------- EL CHECKLIST ---------------- */}
        <section className="panel" style={{ margin: 0 }}>
          <div className="panel-head">
            <h2>Checklist</h2>
            {items.length > 0 && (
              <span className="badge tone-steel">{hechos} de {items.length}</span>
            )}
          </div>
          <div className="panel-body">
            {items.length > 0 && (
              <div className="check-barra" aria-hidden>
                <span style={{ width: `${(hechos / items.length) * 100}%` }} />
              </div>
            )}

            <ul className="check-list">
              {items.map((it) => (
                <li key={it.id} className={it.done ? 'hecho' : ''}>
                  <label>
                    <input type="checkbox" checked={it.done}
                           onChange={async () => {
                             try {
                               await updateTaskItem(it.id, { done: !it.done });
                               await recargarItems();
                             } catch (e) { toast.error(e); }
                           }} />
                    <span>{it.text}</span>
                  </label>
                  <button type="button" className="btn btn-sm btn-ghost"
                          aria-label={`Quitar «${it.text}»`}
                          onClick={async () => {
                            try {
                              await deleteTaskItem(it.id);
                              await recargarItems();
                            } catch (e) { toast.error(e); }
                          }}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>

            <div className="check-nuevo">
              <input className="input" placeholder="Añadir al checklist…" value={nuevo}
                     maxLength={200}
                     onChange={(e) => setNuevo(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); anadirItem(); } }} />
              <button type="button" className="btn btn-sm" onClick={anadirItem} disabled={!nuevo.trim()}>
                <Plus size={14} />Añadir
              </button>
            </div>
          </div>
        </section>

        {/* ---------------- EL CALENDARIO ---------------- */}
        <section className="panel" style={{ margin: 0 }}>
          <div className="panel-head"><h2>Calendario</h2></div>
          <div className="panel-body">
            {card.event_day ? (
              <p className="hint" style={{ marginTop: 0 }}>
                Esta tarjeta está en el calendario el <strong>{fmtDate(card.event_day)}</strong>
                {card.event_title ? <> como «{card.event_title}»</> : null}, como evento de «Otros».
              </p>
            ) : (
              <p className="hint" style={{ marginTop: 0 }}>
                Sin fecha en el calendario. Si la pones, saldrá en el calendario general
                como un evento de «Otros», igual que los que se crean a mano.
              </p>
            )}

            {verEvento || card.event_day ? (
              <>
                <div className="form-grid">
                  <Field label="Día" htmlFor="it-dia">
                    <input id="it-dia" className="input" type="date" value={dia}
                           onChange={(e) => setDia(e.target.value)} />
                  </Field>
                  <Field label="Detalle" htmlFor="it-detalle" hint="Opcional.">
                    <input id="it-detalle" className="input" value={detalle} maxLength={500}
                           onChange={(e) => setDetalle(e.target.value)} />
                  </Field>
                </div>
                <div className="row">
                  <button type="button" className="btn btn-primary" disabled={busy || !dia}
                          onClick={() => intentar(
                            () => setTaskEvent(card.id, { day: dia, title: title, detail: detalle }),
                            card.event_day ? 'Evento actualizado' : 'Evento añadido al calendario')}>
                    <CalendarPlus size={15} />
                    {card.event_day ? 'Actualizar el evento' : 'Añadir al calendario'}
                  </button>
                  {card.event_day && (
                    <button type="button" className="btn btn-ghost" disabled={busy}
                            onClick={() => intentar(() => clearTaskEvent(card.id),
                              'La tarjeta ya no tiene evento')}>
                      Quitar de esta tarjeta
                    </button>
                  )}
                </div>
                {card.event_day && (
                  <p className="hint">
                    «Quitar de esta tarjeta» solo deshace el vínculo. <strong>El evento sigue
                    en el calendario</strong>: borrarlo de ahí se hace desde el calendario.
                  </p>
                )}
              </>
            ) : (
              <button type="button" className="btn" onClick={() => setVerEvento(true)}>
                <CalendarPlus size={15} />Añadir al calendario
              </button>
            )}
          </div>
        </section>

        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={archivar} disabled={busy}>
            <Archive size={15} />Archivar la tarjeta
          </button>
        </div>
      </div>
    </Modal>
  );
}
