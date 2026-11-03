import { useMemo, useState } from 'react';
import {
  Archive, CalendarDays, CheckSquare, ListChecks, Paperclip, Plus, Undo2, X,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Badge, PageHeader, Tabs } from '@/components/ui/Layout';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { InternalTaskModal } from '@/components/shared/InternalTaskModal';
import {
  createInternalList, createInternalTask, deleteInternalList, listArchivedCards,
  listBoardCards, listInternalLists, moveInternalTask, renameInternalList,
  restoreInternalTask, setInternalTaskDone,
} from '@/services/internas';
import { fmtDate } from '@/lib/format';
import type { InternalCard, InternalList } from '@/types/db';

type Vista = 'tablero' | 'archivadas';

/**
 * GESTIONES INTERNAS · el tablero que sustituye al Trello interno.
 *
 * RRHH, multas, papeleo: lo que no es una obra ni un presupuesto pero
 * hay que hacer igual. Listas en horizontal, tarjetas dentro, y nada
 * más. La gracia está en que se pueda usar sin pensar.
 *
 * SOLO ADMINISTRACIÓN. No porque esta pantalla lo compruebe —que lo
 * hace la ruta, bajo «RequireRole»— sino porque las tres tablas exigen
 * «is_admin()» en sus políticas. Un trabajador que escriba la dirección
 * a mano no llega, y si llamara a la API tampoco vería una fila.
 *
 * MOVER TARJETAS, DE DOS MANERAS, Y LAS DOS HACEN FALTA:
 *
 *   · ARRASTRANDO, como en Trello. Es el gesto natural, y se hace con
 *     el mismo arrastre nativo que ya usa el calendario (CalendarWeek),
 *     sin añadir ninguna biblioteca.
 *   · CON EL DESPLEGABLE «Lista» de la tarjeta abierta. Esto NO es un
 *     premio de consolación: el arrastre nativo del navegador NO
 *     funciona con el dedo en una pantalla táctil, así que en el móvil
 *     el desplegable es el único camino. Por eso están los dos.
 */
export default function InternasPage() {
  const { toast, confirm } = useDialogs();
  const [vista, setVista] = useState<Vista>('tablero');
  const [recarga, setRecarga] = useState(0);
  const refrescar = () => setRecarga((n) => n + 1);

  const listas = useAsync(listInternalLists, [recarga]);
  const tarjetas = useAsync(listBoardCards, [recarga]);
  const archivadas = useAsync(
    () => (vista === 'archivadas' ? listArchivedCards() : Promise.resolve([])), [vista, recarga]);

  const [abierta, setAbierta] = useState<string | null>(null);
  const [nuevaEn, setNuevaEn] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [encima, setEncima] = useState<string | null>(null);
  /*
    CREAR Y RENOMBRAR SE ESCRIBEN EN EL SITIO, no en una ventana.

    No es un capricho de estilo: «useDialogs» ofrece avisos y
    confirmaciones, pero no una ventana para pedir un texto, y añadirle
    una sería tocar un componente del que depende media aplicación por
    una pantalla nueva. Escribir donde va el nombre es además lo que
    hace Trello, y se tarda menos.
  */
  const [creandoLista, setCreandoLista] = useState(false);
  const [nombreLista, setNombreLista] = useState('');
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');

  const porLista = useMemo(() => {
    const mapa = new Map<string, InternalCard[]>();
    for (const c of tarjetas.data ?? []) {
      mapa.set(c.list_id, [...(mapa.get(c.list_id) ?? []), c]);
    }
    return mapa;
  }, [tarjetas.data]);

  const laAbierta = (tarjetas.data ?? []).find((c) => c.id === abierta) ?? null;

  async function intentar(accion: () => Promise<unknown>, ok?: string) {
    try {
      await accion();
      if (ok) toast.success(ok);
      refrescar();
    } catch (e) { toast.error(e); }
  }

  async function crearLista() {
    const nombre = nombreLista.trim();
    if (!nombre) return;
    setNombreLista('');
    setCreandoLista(false);
    await intentar(() => createInternalList(nombre), 'Lista creada');
  }

  async function guardarNombre(l: InternalList) {
    const nombre = nombreEdit.trim();
    setRenombrando(null);
    if (!nombre || nombre === l.name) return;
    await intentar(() => renameInternalList(l.id, nombre), 'Lista renombrada');
  }

  async function borrarLista(l: InternalList) {
    const dentro = (porLista.get(l.id) ?? []).length;
    const ok = await confirm({
      title: `Borrar «${l.name}»`,
      message: dentro > 0
        ? <>Esta lista todavía tiene <strong>{dentro} tarjeta(s)</strong> a la vista. Una lista
            solo se puede borrar vacía, para que no se pierda nada: muévelas a otra lista
            primero. Las archivadas de esta lista también cuentan.</>
        : <>La lista «{l.name}» desaparecerá del tablero. Si tuviera tarjetas archivadas,
            no se dejará borrar.</>,
      confirmLabel: 'Borrar la lista', danger: true,
    });
    if (!ok) return;
    await intentar(() => deleteInternalList(l.id), 'Lista borrada');
  }

  async function crearTarjeta(listId: string) {
    const t = texto.trim();
    if (!t) return;
    setTexto('');
    setNuevaEn(null);
    await intentar(() => createInternalTask(listId, t));
  }

  async function soltarEn(listId: string) {
    const id = arrastrando;
    setArrastrando(null);
    setEncima(null);
    if (!id) return;
    const card = (tarjetas.data ?? []).find((c) => c.id === id);
    if (!card || card.list_id === listId) return;
    await intentar(() => moveInternalTask(id, listId), 'Tarjeta movida');
  }

  if (listas.loading && !listas.data) return <Loading full />;
  if (listas.error) return <ErrorBox message={listas.error} onRetry={listas.reload} />;

  const lista = listas.data ?? [];

  return (
    <>
      <PageHeader
        title="Gestiones internas"
        sub="RRHH, multas, compras y todo el papeleo que no es una obra."
        actions={vista === 'tablero' && lista.length > 0 ? (
          <button className="btn btn-primary"
                  onClick={() => { setCreandoLista(true); setNombreLista(''); }}>
            <Plus size={16} />Nueva lista
          </button>
        ) : undefined}
      />

      <Tabs value={vista} onChange={setVista} tabs={[
        { key: 'tablero', label: 'Tablero' },
        { key: 'archivadas', label: 'Tareas archivadas' },
      ]} />

      {vista === 'tablero' ? (
        lista.length === 0 ? (
          <Empty title="El tablero está vacío" icon={<ListChecks size={30} />}>
            Crea la primera lista y empieza a colgar tarjetas. Las que usáis en Trello
            —RRHH, TAREAS, MULTAS— son un buen punto de partida, pero las decides tú.
            <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
              {creandoLista ? (
                <>
                  <input className="input" autoFocus value={nombreLista} maxLength={60}
                         placeholder="RRHH, MULTAS, COMPRAS…"
                         aria-label="Nombre de la lista"
                         onChange={(e) => setNombreLista(e.target.value)}
                         onKeyDown={(e) => {
                           if (e.key === 'Enter') { e.preventDefault(); crearLista(); }
                           if (e.key === 'Escape') setCreandoLista(false);
                         }} />
                  <button className="btn btn-primary" onClick={crearLista}
                          disabled={!nombreLista.trim()}>Crear</button>
                </>
              ) : (
                <button className="btn btn-primary"
                        onClick={() => { setCreandoLista(true); setNombreLista(''); }}>
                  <Plus size={16} />Crear la primera lista
                </button>
              )}
            </div>
          </Empty>
        ) : (
          <div className="kanban" role="list" aria-label="Listas del tablero">
            {lista.map((l) => {
              const cards = porLista.get(l.id) ?? [];
              return (
                <section
                  key={l.id}
                  className={`kanban-col${encima === l.id ? ' encima' : ''}`}
                  role="listitem"
                  onDragOver={(e) => { e.preventDefault(); setEncima(l.id); }}
                  onDragLeave={() => setEncima((v) => (v === l.id ? null : v))}
                  onDrop={() => soltarEn(l.id)}
                >
                  <header className="kanban-head">
                    {renombrando === l.id ? (
                      <input className="input" autoFocus value={nombreEdit} maxLength={60}
                             aria-label={`Nombre de ${l.name}`}
                             onChange={(e) => setNombreEdit(e.target.value)}
                             onBlur={() => guardarNombre(l)}
                             onKeyDown={(e) => {
                               if (e.key === 'Enter') { e.preventDefault(); guardarNombre(l); }
                               if (e.key === 'Escape') setRenombrando(null);
                             }} />
                    ) : (
                      <>
                        <button type="button" className="kanban-nombre" title="Renombrar la lista"
                                onClick={() => { setRenombrando(l.id); setNombreEdit(l.name); }}>
                          {l.name}
                        </button>
                        <span className="kanban-n">{cards.length}</span>
                        <button className="btn btn-sm btn-ghost" onClick={() => borrarLista(l)}
                                aria-label={`Borrar la lista ${l.name}`}><X size={14} /></button>
                      </>
                    )}
                  </header>

                  <div className="kanban-cards">
                    {cards.map((c) => (
                      <article
                        key={c.id}
                        className={`kanban-card${c.done ? ' hecha' : ''}${arrastrando === c.id ? ' moviendo' : ''}`}
                        draggable
                        onDragStart={() => setArrastrando(c.id)}
                        onDragEnd={() => { setArrastrando(null); setEncima(null); }}
                      >
                        {/*
                          Sin «label» alrededor: envolver el cuadro en una
                          etiqueta hace que el clic llegue dos veces —al
                          cuadro y a la etiqueta, que lo reenvía—, y se
                          marcaba y desmarcaba en el mismo gesto.
                        */}
                        <input type="checkbox" className="kanban-tick" checked={c.done}
                               aria-label={`Marcar «${c.title}» como realizada`}
                               onChange={() => intentar(() => setInternalTaskDone(c.id, !c.done))} />
                        {/*
                          El «title» completo, porque la tarjeta recorta
                          a cuatro líneas: así se lee entero al pasar el
                          ratón sin tener que abrirla.
                        */}
                        <button type="button" className="kanban-title" title={c.title}
                                onClick={() => setAbierta(c.id)}>
                          {c.title}
                        </button>
                        {(c.checklist_total > 0 || c.event_day || c.notes || c.adjuntos > 0) && (
                          <div className="kanban-pies">
                            {c.notes && <span title="Tiene notas" aria-label="Tiene notas">≡</span>}
                            {c.checklist_total > 0 && (
                              <span className={c.checklist_hechos === c.checklist_total ? 'ok' : ''}
                                    title="Checklist">
                                <CheckSquare size={12} />{c.checklist_hechos}/{c.checklist_total}
                              </span>
                            )}
                            {c.event_day && (
                              <span title={`En el calendario el ${fmtDate(c.event_day)}`}>
                                <CalendarDays size={12} />{fmtDate(c.event_day)}
                              </span>
                            )}
                            {/* Discreto: el clip y el número, nada más. */}
                            {c.adjuntos > 0 && (
                              <span title={`${c.adjuntos} archivo(s) adjunto(s)`}>
                                <Paperclip size={12} />{c.adjuntos}
                              </span>
                            )}
                          </div>
                        )}
                      </article>
                    ))}

                    {nuevaEn === l.id ? (
                      <div className="kanban-nueva">
                        <textarea className="textarea" rows={2} autoFocus value={texto}
                                  maxLength={200} placeholder="¿Qué hay que hacer?"
                                  onChange={(e) => setTexto(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault(); crearTarjeta(l.id);
                                    }
                                    if (e.key === 'Escape') { setNuevaEn(null); setTexto(''); }
                                  }} />
                        <div className="row">
                          <button className="btn btn-sm btn-primary" onClick={() => crearTarjeta(l.id)}
                                  disabled={!texto.trim()}>Añadir</button>
                          <button className="btn btn-sm btn-ghost"
                                  onClick={() => { setNuevaEn(null); setTexto(''); }}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button className="kanban-add"
                              onClick={() => { setNuevaEn(l.id); setTexto(''); }}>
                        <Plus size={14} />Añade una tarjeta
                      </button>
                    )}
                  </div>
                </section>
              );
            })}

            {creandoLista ? (
              <div className="kanban-col kanban-nueva-lista">
                <input className="input" autoFocus value={nombreLista} maxLength={60}
                       placeholder="Nombre de la lista" aria-label="Nombre de la lista"
                       onChange={(e) => setNombreLista(e.target.value)}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter') { e.preventDefault(); crearLista(); }
                         if (e.key === 'Escape') setCreandoLista(false);
                       }} />
                <div className="row">
                  <button className="btn btn-sm btn-primary" onClick={crearLista}
                          disabled={!nombreLista.trim()}>Crear</button>
                  <button className="btn btn-sm btn-ghost"
                          onClick={() => setCreandoLista(false)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button className="kanban-col kanban-nueva-lista"
                      onClick={() => { setCreandoLista(true); setNombreLista(''); }}>
                <Plus size={16} />Añade otra lista
              </button>
            )}
          </div>
        )
      ) : (
        <ArchivadasView cards={archivadas.data ?? []} loading={archivadas.loading}
                        error={archivadas.error} onRetry={archivadas.reload}
                        listas={lista} onChange={refrescar} />
      )}

      {laAbierta && (
        <InternalTaskModal card={laAbierta} lists={lista}
                           onClose={() => setAbierta(null)} onChange={refrescar} />
      )}
    </>
  );
}

/**
 * EL HISTÓRICO · lo que salió del tablero pero no se ha perdido.
 *
 * Se enseña de qué lista venía, si estaba hecha o no, y cuánto
 * checklist llevaba, porque eso es lo que permite decidir si hay que
 * devolverla. Y se puede devolver a OTRA lista, no solo a la suya.
 */
function ArchivadasView({ cards, loading, error, onRetry, listas, onChange }: {
  cards: InternalCard[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  listas: InternalList[];
  onChange: () => void;
}) {
  const { toast } = useDialogs();
  const [destino, setDestino] = useState<Record<string, string>>({});

  if (loading && !cards.length) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={onRetry} />;
  if (!cards.length) {
    return (
      <Empty title="No hay tareas archivadas" icon={<Archive size={30} />}>
        Cuando archives una tarjeta del tablero aparecerá aquí, entera y con su checklist.
      </Empty>
    );
  }

  async function devolver(c: InternalCard) {
    try {
      await restoreInternalTask(c.id, destino[c.id] ?? c.list_id);
      toast.success('Tarjeta devuelta al tablero');
      onChange();
    } catch (e) { toast.error(e); }
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Tarjeta</th><th>Lista</th><th>Estado</th><th>Checklist</th>
            <th>Archivada</th><th>Devolver a</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.id}>
              <td>
                <strong>{c.title}</strong>
                {c.notes && <div className="faint pre">{c.notes}</div>}
              </td>
              <td>{c.list_name}</td>
              <td>
                <Badge tone={c.done ? 'green' : 'steel'}>
                  {c.done ? 'Realizada' : 'Pendiente'}
                </Badge>
              </td>
              <td className="num">
                {c.checklist_total > 0 ? `${c.checklist_hechos}/${c.checklist_total}` : '—'}
              </td>
              <td>{fmtDate(c.archived_at)}</td>
              <td>
                <div className="row">
                  <select className="select" value={destino[c.id] ?? c.list_id}
                          aria-label={`Lista a la que devolver «${c.title}»`}
                          onChange={(e) => setDestino((d) => ({ ...d, [c.id]: e.target.value }))}>
                    {listas.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <button className="btn btn-sm" onClick={() => devolver(c)}>
                    <Undo2 size={14} />Devolver
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
