import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { PageHeader } from '@/components/ui/Layout';
import { Modal } from '@/components/ui/Modal';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import {
  clearNonWorkingDay, deleteCalendarNote, listCalendarSpans, listNonWorkingDays,
  moveCalendarItem, saveCalendarNote, setNonWorkingDay, spanUid,
} from '@/services/calendar';
import { listPeople } from '@/services/people';
import {
  CALENDAR_COLOR, CALENDAR_DEFECTO, CALENDAR_KINDS, CALENDAR_LABEL, CALENDAR_VIEWS,
  WORKER_CALENDAR_KINDS, siguienteSeleccion, type CalendarView,
} from '@/config/constants';
import { SemanaCalendario, tramosDelDia } from '@/components/shared/CalendarWeek';
import { diasEntre, masDias, semanasDeLaRejilla } from '@/lib/calendario';
import {
  addDays, addMonths, fmtDate, longDate, mondayOf, monthLabel,
  relativeDay, startOfMonth, todayMadrid,
} from '@/lib/format';
import type { CalendarKind, CalendarSpan } from '@/types/db';

const WEEKDAY_HEADS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Rango de fechas que hace falta pedir para cada vista. */
function rangeFor(view: CalendarView, anchor: string) {
  if (view === 'dia') return { from: anchor, to: anchor };
  if (view === 'semana') {
    const start = mondayOf(anchor);
    return { from: start, to: addDays(start, 6) };
  }
  if (view === 'agenda') return { from: anchor, to: addDays(anchor, 30) };
  const first = startOfMonth(anchor);
  const start = mondayOf(first);
  return { from: start, to: addDays(start, 41) };
}

/**
 * Calendario de la empresa: mes, semana, día y agenda.
 *
 * El color lo da el TIPO de trabajo (fabricación, montaje, material,
 * visita, aviso), nunca la persona. Las órdenes se pueden arrastrar a
 * otro día; ese cambio NO avisa a nadie, solo queda en el historial.
 */

/**
 * EL CALENDARIO SE PINTA POR TRAMOS, NO POR DÍAS.
 *
 * Antes cada día traía su propia etiqueta, así que un proyecto de seis
 * días salía seis veces con el mismo nombre. Ahora cada periodo es UNA
 * barra que recorre sus días, y de eso se encarga «SemanaCalendario».
 */

export default function CalendarPage({ worker }: { worker?: boolean }) {
  const navigate = useNavigate();
  const { toast, confirm } = useDialogs();
  const today = todayMadrid();

  const [view, setView] = useState<CalendarView>(worker ? 'agenda' : 'mes');
  const [anchor, setAnchor] = useState(today);
  // Las categorías de ESTA pantalla. Un trabajador ve su trabajo:
  // fabricación, montaje y sus avisos. Administración las ve todas.
  const disponibles = worker ? WORKER_CALENDAR_KINDS : CALENDAR_KINDS;
  /**
   * AL ABRIR, SOLO FABRICACIÓN Y MONTAJE.
   *
   * Es lo que dice cómo de cargadas están las semanas de taller y de
   * obra, que es para lo que se mira el calendario. Lo demás se enciende
   * a mano. El trabajador abre con lo suyo, como hasta ahora.
   */
  const [kinds, setKinds] = useState<CalendarKind[]>(
    worker ? [...WORKER_CALENDAR_KINDS] : [...CALENDAR_DEFECTO],
  );
  const [workerId, setWorkerId] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // BLOQUE 3: eventos sueltos («Otros») y días no laborables.
  const [editandoNota, setEditandoNota] = useState<CalendarSpan | 'nuevo' | null>(null);
  const [nota, setNota] = useState({ day: today, title: '', detail: '' });

  const { from, to } = rangeFor(view, anchor);
  const people = useAsync(() => (worker ? Promise.resolve([]) : listPeople('worker')), [worker]);
  const events = useAsync(
    () => listCalendarSpans(from, to, { workerId: workerId || undefined }),
    [from, to, workerId, reloadKey],
  );

  /**
   * LO QUE SE ACABA DE ARRASTRAR, MIENTRAS SE GUARDA.
   *
   * La barra se pinta ya en el día nuevo para que se vea que ha ido
   * donde se soltó. Si el guardado falla, esto se deshace y la barra
   * vuelve a donde estaba: lo que no puede pasar es que la pantalla
   * enseñe una fecha que la base de datos no tiene.
   */
  const [movidos, setMovidos] = useState<Record<string, { starts: string; ends: string }>>({});
  // Los días que no se trabaja se pintan apagados: así se ve de un
  // vistazo por qué la planificación automática los ha saltado.
  const festivos = useAsync(() => listNonWorkingDays(from, to), [from, to, reloadKey]);
  const noLaborables = useMemo(
    () => new Set((festivos.data ?? []).map((d) => d.day)),
    [festivos.data],
  );

  /**
   * LO QUE SE PINTA.
   *
   * Un solo filtro, y a propósito: «kinds» ARRANCA valiendo
   * «disponibles» y solo puede cambiar pulsando la leyenda, que no
   * ofrece otra cosa. Así que filtrar dos veces no añadiría nada que
   * esto no haga ya, y un camino que ninguna prueba puede recorrer es
   * un camino que nadie vigila.
   *
   * Esto es lo que mantiene una visita FUERA del calendario de un
   * trabajador: si tuviera una asignada de antes, la base de datos se
   * la sigue mandando (y hace bien: es un trabajo que tiene entre
   * manos), pero su calendario no la pinta. Está probado en
   * tests/e2e/avisos.mjs con una visita heredada.
   */
  const shown = useMemo(
    () => (events.data ?? [])
      .filter((e) => kinds.includes(e.kind))
      // Lo que se acaba de arrastrar se pinta donde se ha soltado.
      .map((e) => {
        const movido = movidos[spanUid(e)];
        return movido ? { ...e, ...movido } : e;
      }),
    [events.data, kinds, movidos],
  );

  /**
   * Las categorías se encienden con una regla, no a capricho:
   * fabricación y montaje van juntas; las demás, de una en una. Está en
   * «siguienteSeleccion», con sus pruebas.
   */
  function toggleKind(kind: CalendarKind) {
    setKinds((list) => siguienteSeleccion(list, kind));
  }

  function step(direction: number) {
    if (view === 'mes') setAnchor(addMonths(anchor, direction));
    else if (view === 'semana') setAnchor(addDays(anchor, direction * 7));
    else setAnchor(addDays(anchor, direction));
  }

  function openEvent(e: CalendarSpan) {
    if (worker) {
      // BLOQUE 3: fabricación y montaje son ya el PROYECTO, no la orden.
      if (e.kind === 'fabricacion' || e.kind === 'montaje') navigate(`/t/proyectos/${e.id}`);
      return;
    }
    if (e.kind === 'fabricacion' || e.kind === 'montaje') navigate(`/admin/proyectos/${e.id}`);
    // BLOQUE 4: la obra es un elemento más del calendario; abre su pantalla.
    else if (e.kind === 'obra') navigate(`/admin/obras/${e.id}`);
    else if (e.kind === 'material') navigate('/admin/material');
    else if (e.kind === 'otro') {
      setNota({ day: e.starts, title: e.title, detail: e.detail ?? '' });
      setEditandoNota(e);
    }
    else navigate(`/admin/fichas/${e.id}`);
  }

  async function drop(date: string) {
    const uid = dragging;
    setDragging(null);
    setOver(null);
    if (!uid) return;
    // Se busca por la identidad completa. Buscar por «id» devolvía el
    // PRIMER tramo con ese identificador, que podía ser la otra fase del
    // mismo proyecto.
    const event = shown.find((e) => spanUid(e) === uid);
    if (!event) return;
    // Un evento que no se puede mover no se mueve ni arrastrándolo: el
    // atributo «draggable» es del navegador y no es una garantía.
    if (!event.movable) return;
    if (event.starts === date) return;

    // SE PINTA YA EN EL DÍA NUEVO, conservando la duración: la barra de
    // seis días sigue siendo de seis días mientras se guarda. Si falla,
    // esto se deshace unas líneas más abajo.
    const dura = diasEntre(event.starts, event.ends);
    setMovidos((m) => ({ ...m, [uid]: { starts: date, ends: masDias(date, dura) } }));

    try {
      await moveCalendarItem(event, date);
      // Mover a mano una fase la saca del cálculo automático: desde
      // ahora manda la persona, y ningún recálculo se la vuelve a tocar.
      //
      // Se NOMBRA la fase que se ha movido. Así, de un vistazo, se ve que
      // se ha movido la que se arrastró y no la otra, que es justo lo que
      // antes no se podía distinguir.
      const fijado = event.kind === 'fabricacion' ? '. Queda fijada a mano.'
        : event.kind === 'montaje' ? '. Queda fijado a mano.'
        : '';
      toast.success(`${CALENDAR_LABEL[event.kind]} de ${event.code ?? event.title}`
        + ` pasa al ${fmtDate(date)}${fijado}`);
      // Se vuelve a leer de la base de datos y se suelta lo pintado a
      // mano: a partir de aquí manda lo que esté guardado.
      setMovidos((m) => { const { [uid]: _, ...resto } = m; return resto; });
      setReloadKey((n) => n + 1);
    } catch (err) {
      // NO SE HA GUARDADO: la barra vuelve a donde estaba. Dejarla en el
      // día nuevo haría creer que el taller tiene otra fecha.
      setMovidos((m) => { const { [uid]: _, ...resto } = m; return resto; });
      toast.error(err);
    }
  }

  async function guardarNota() {
    try {
      await saveCalendarNote({
        id: editandoNota === 'nuevo' ? null : editandoNota?.id,
        day: nota.day,
        title: nota.title,
        detail: nota.detail || null,
      });
      toast.success(editandoNota === 'nuevo' ? 'Evento creado' : 'Evento guardado');
      setEditandoNota(null);
      setReloadKey((n) => n + 1);
    } catch (e) { toast.error(e); }
  }

  async function borrarNota() {
    if (editandoNota === 'nuevo' || !editandoNota) return;
    const ok = await confirm({
      title: 'Quitar el evento',
      message: <>«{editandoNota.title}» desaparecerá del calendario.</>,
      confirmLabel: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCalendarNote(editandoNota.id);
      toast.success('Evento quitado');
      setEditandoNota(null);
      setReloadKey((n) => n + 1);
    } catch (e) { toast.error(e); }
  }

  /** Marcar o desmarcar un día como no laborable. */
  async function alternarFestivo(day: string) {
    const esFestivo = noLaborables.has(day);
    const ok = await confirm({
      title: esFestivo ? 'Volver a trabajar este día' : 'Marcar como no laborable',
      message: esFestivo
        ? <>El {fmtDate(day)} volverá a contar como día de trabajo en la planificación.</>
        : (
          <>
            El {fmtDate(day)} dejará de contar como día de trabajo: la planificación
            automática se lo saltará. Lo que ya esté colocado no se mueve.
          </>
        ),
      confirmLabel: esFestivo ? 'Volver a trabajar' : 'Marcar',
    });
    if (!ok) return;
    try {
      if (esFestivo) await clearNonWorkingDay(day);
      else await setNonWorkingDay(day, '');
      setReloadKey((n) => n + 1);
    } catch (e) { toast.error(e); }
  }

  const canDrag = !worker;

  /** Lo que necesita cada semana para pintarse. */
  const semanaProps = {
    tramos: shown,
    hoy: today,
    noLaborables,
    canDrag,
    dragging,
    over,
    uid: spanUid,
    onDragStart: setDragging,
    onOver: setOver,
    onDrop: drop,
    onOpen: openEvent,
    onFestivo: worker ? undefined : alternarFestivo,
    onVerDia: (d: string) => { setAnchor(d); setView('dia'); },
  };

  const semanas = useMemo(
    () => semanasDeLaRejilla(mondayOf(startOfMonth(anchor))),
    [anchor],
  );

  /**
   * Los días de la agenda: los que toca algún tramo, no solo los que
   * empiezan en ellos. Un montaje que empezó el jueves pasado y sigue
   * hoy tiene que salir en la agenda de hoy.
   */
  const agendaDays = useMemo(() => {
    const dias = new Set<string>();
    shown.forEach((e) => {
      for (let d = e.starts > from ? e.starts : from; d <= e.ends && d <= to; d = masDias(d, 1)) {
        dias.add(d);
      }
    });
    return [...dias].sort();
  }, [shown, from, to]);

  const title = view === 'mes' ? monthLabel(anchor)
    : view === 'semana' ? `Semana del ${fmtDate(mondayOf(anchor))}`
    : view === 'dia' ? longDate(anchor)
    : 'Próximos 30 días';

  const body = (
    <>
      <div className="cal-toolbar">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-sm icon-btn" onClick={() => step(-1)} aria-label="Anterior">
            <ChevronLeft />
          </button>
          <button className="btn btn-sm" onClick={() => setAnchor(today)}>Hoy</button>
          <button className="btn btn-sm icon-btn" onClick={() => step(1)} aria-label="Siguiente">
            <ChevronRight />
          </button>
          <strong className="cal-title">{title}</strong>
        </div>

        <div className="row" style={{ gap: 6 }}>
          {CALENDAR_VIEWS.map((v) => (
            <button key={v.key} className="chip" aria-pressed={view === v.key}
                    onClick={() => setView(v.key)}>{v.label}</button>
          ))}
        </div>
      </div>

      <div className="cal-filters">
        {/* El color es siempre del TIPO de trabajo, nunca de la persona. */}
        <div className="cal-legend" aria-label="Tipos de evento">
          {disponibles.map((k) => (
            <button key={k} type="button" className="cal-legend-item" aria-pressed={kinds.includes(k)}
                    onClick={() => toggleKind(k)}>
              <span className="cal-dot" style={{ ['--ev' as string]: CALENDAR_COLOR[k] }} aria-hidden />
              {CALENDAR_LABEL[k]}
            </button>
          ))}
        </div>

        {!worker && (
          <div className="row cal-worker" style={{ gap: 8 }}>
            <label htmlFor="cal-worker" className="label" style={{ margin: 0 }}>Trabajador</label>
            <select id="cal-worker" className="select" style={{ minWidth: 180 }}
                    value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">Todos</option>
              {people.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
        )}
      </div>

      {events.loading && !events.data ? <Loading />
        : events.error ? <ErrorBox message={events.error} onRetry={events.reload} />
        : (
          <>
            {view === 'mes' && (
              <div className="cal-grid">
                {WEEKDAY_HEADS.map((d) => <div key={d} className="cal-head">{d}</div>)}
                {semanas.map((lunes) => (
                  <SemanaCalendario key={lunes} lunes={lunes} mes={anchor} {...semanaProps} />
                ))}
              </div>
            )}

            {view === 'semana' && (
              // Conserva «cal-week»: es la clase que le da a esta vista
              // sus casillas altas y la que ya tenía su hoja de estilos.
              <div className="cal-grid cal-week">
                {WEEKDAY_HEADS.map((d) => <div key={d} className="cal-head">{d}</div>)}
                <SemanaCalendario lunes={mondayOf(anchor)} altoDia={220} mostrarDiaSemana
                                  carriles={10} {...semanaProps} />
              </div>
            )}

            {view === 'dia' && (
              <div className="cal-day-single">
                <div className="cal-agenda-date" style={{ marginBottom: 10 }}>
                  <strong>{relativeDay(anchor, today)}</strong>
                  <span className="faint">{longDate(anchor)}</span>
                </div>
                {tramosDelDia(shown, anchor).length ? (
                  <div className="stack" style={{ gap: 6 }}>
                    {tramosDelDia(shown, anchor).map((e) => (
                      <button key={spanUid(e)} type="button" className="cal-row"
                              style={{ ['--ev' as string]: CALENDAR_COLOR[e.kind] }}
                              onClick={() => openEvent(e)}>
                        <span className="cal-dot" aria-hidden />
                        <span className="cal-row-main">
                          <strong>{e.code ? `${e.code} · ` : ''}{e.title}</strong>
                          <small>
                            {CALENDAR_LABEL[e.kind]}
                            {e.starts !== e.ends
                              ? ` · del ${fmtDate(e.starts)} al ${fmtDate(e.ends)}` : ''}
                            {e.client_name ? ` · ${e.client_name}` : ''}
                            {` · ${e.status}`}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty title="Nada programado" icon={<CalendarDays aria-hidden />}>
                    Este día no tiene nada con los filtros elegidos.
                  </Empty>
                )}
              </div>
            )}

            {view === 'agenda' && (
              agendaDays.length ? (
                <div className="cal-agenda">
                  {agendaDays.map((d) => (
                    <div key={d} className="cal-agenda-day">
                      <div className="cal-agenda-date">
                        <strong>{relativeDay(d, today)}</strong>
                        <span className="faint">{fmtDate(d)}</span>
                      </div>
                      <div className="stack" style={{ gap: 6 }}>
                        {tramosDelDia(shown, d).map((e) => (
                          <button key={spanUid(e)} type="button" className="cal-row"
                                  style={{ ['--ev' as string]: CALENDAR_COLOR[e.kind] }}
                                  onClick={() => openEvent(e)}>
                            <span className="cal-dot" aria-hidden />
                            <span className="cal-row-main">
                              <strong>{e.code ? `${e.code} · ` : ''}{e.title}</strong>
                              <small>
                                {CALENDAR_LABEL[e.kind]}
                                {e.starts !== e.ends
                                  ? ` · del ${fmtDate(e.starts)} al ${fmtDate(e.ends)}` : ''}
                                {e.project_code ? ` · ${e.project_code}` : ''}
                                {e.client_name ? ` · ${e.client_name}` : ''}
                                {` · ${e.status}`}
                              </small>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="Nada programado" icon={<CalendarDays aria-hidden />}>
                  No hay nada en los próximos 30 días con los filtros elegidos.
                </Empty>
              )
            )}
          </>
        )}

      {!worker && (
        <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
          Arrastra una fabricación o un montaje a otro día para cambiarle la fecha. Se mueve
          exactamente la etiqueta que arrastras: mover la fabricación no toca el montaje.
          El cambio queda en el historial y <strong>no se avisa al trabajador</strong>.
        </p>
      )}
    </>
  );

  if (worker) {
    return (
      <>
        <div className="w-greeting"><h1>Calendario</h1></div>
        <div className="cal-wrap worker">{body}</div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Calendario"
        sub="La planificación de fabricación y montaje, el material, las visitas y los avisos."
        actions={!worker && (
          <button className="btn btn-sm" onClick={() => {
            setNota({ day: anchor, title: '', detail: '' });
            setEditandoNota('nuevo');
          }}>
            <Plus />Nuevo evento
          </button>
        )}
      />
      <section className="panel">
        <div className="panel-body">{body}</div>
      </section>

      {/* «Otros»: eventos sueltos que crea administración desde aquí.
          Nada complicado: un día, un texto y, si hace falta, un detalle. */}
      {editandoNota && (
        <Modal
          title={editandoNota === 'nuevo' ? 'Nuevo evento' : 'Evento del calendario'}
          onClose={() => setEditandoNota(null)}
        >
          <div className="field">
            <label className="label" htmlFor="cal-dia">Día</label>
            <input id="cal-dia" className="input" type="date" value={nota.day}
                   onChange={(e) => setNota((n) => ({ ...n, day: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label" htmlFor="cal-titulo">¿De qué se trata?</label>
            <input id="cal-titulo" className="input" value={nota.title} maxLength={120}
                   placeholder="Por ejemplo: revisión de la plegadora"
                   onChange={(e) => setNota((n) => ({ ...n, title: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label" htmlFor="cal-detalle">Detalle (opcional)</label>
            <textarea id="cal-detalle" className="input" rows={3} value={nota.detail} maxLength={500}
                      onChange={(e) => setNota((n) => ({ ...n, detail: e.target.value }))} />
          </div>
          <div className="row-between">
            <span>
              {editandoNota !== 'nuevo' && (
                <button className="btn btn-danger" onClick={borrarNota}><Trash2 />Quitar</button>
              )}
            </span>
            <span className="row" style={{ gap: 10 }}>
              <button className="btn" onClick={() => setEditandoNota(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!nota.title.trim()}
                      onClick={guardarNota}>Guardar</button>
            </span>
          </div>
        </Modal>
      )}
    </>
  );
}
