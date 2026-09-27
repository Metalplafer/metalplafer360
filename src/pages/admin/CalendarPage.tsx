import { memo, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { PageHeader } from '@/components/ui/Layout';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { listCalendar, moveOrder } from '@/services/calendar';
import { listPeople } from '@/services/people';
import {
  CALENDAR_COLOR, CALENDAR_KINDS, CALENDAR_LABEL, CALENDAR_VIEWS, type CalendarView,
} from '@/config/constants';
import {
  addDays, addMonths, dayNumber, fmtDate, longDate, mondayOf, monthLabel,
  relativeDay, startOfMonth, todayMadrid, weekdayShort,
} from '@/lib/format';
import type { CalendarEvent, CalendarKind } from '@/types/db';

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
 * Una etiqueta de evento dentro de un día.
 *
 * Va fuera del componente de la página y memorizada A PROPÓSITO: si se
 * declara dentro, en cada render es una función distinta y React
 * desmonta y vuelve a montar todas las etiquetas del mes. Al arrastrar
 * una orden eso ocurría varias veces por segundo.
 */
const Chip = memo(function Chip({ e, dragging, canDrag, setDragging, setOver, openEvent }: {
  e: CalendarEvent;
  dragging: string | null;
  canDrag: boolean;
  setDragging: (id: string | null) => void;
  setOver: (d: string | null) => void;
  openEvent: (e: CalendarEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`cal-event${dragging === e.id ? ' dragging' : ''}`}
      style={{ ['--ev' as string]: CALENDAR_COLOR[e.kind] }}
      draggable={canDrag && e.movable}
      onDragStart={() => setDragging(e.id)}
      onDragEnd={() => { setDragging(null); setOver(null); }}
      onClick={() => openEvent(e)}
      title={`${CALENDAR_LABEL[e.kind]} · ${e.title}${e.client_name ? ` · ${e.client_name}` : ''}`}
    >
      <span className="cal-dot" aria-hidden />
      <span className="cal-event-text">
        {e.code ? <strong>{e.code}</strong> : null} {e.title}
      </span>
    </button>
  );
});

const Day = memo(function Day({
  date, outside, list, today, over, view, canDrag, setOver, drop, chipProps,
}: {
  date: string; outside?: boolean; list: CalendarEvent[];
  today: string; over: string | null; view: string; canDrag: boolean;
  setOver: (fn: string | null | ((d: string | null) => string | null)) => void;
  drop: (date: string) => void;
  chipProps: Omit<Parameters<typeof Chip>[0], 'e'>;
}) {
  return (
    <div
      className={[
        'cal-day',
        outside ? 'outside' : '',
        date === today ? 'today' : '',
        over === date ? 'over' : '',
      ].filter(Boolean).join(' ')}
      onDragOver={canDrag ? (ev) => { ev.preventDefault(); setOver(date); } : undefined}
      onDragLeave={canDrag ? () => setOver((d) => (d === date ? null : d)) : undefined}
      onDrop={canDrag ? () => drop(date) : undefined}
    >
      <div className="cal-day-head">
        <span className="num">{dayNumber(date)}</span>
        {view === 'semana' && <span className="faint">{weekdayShort(date)}</span>}
      </div>
      <div className="cal-day-body">
        {list.map((e) => <Chip key={`${e.kind}-${e.id}`} e={e} {...chipProps} />)}
      </div>
    </div>
  );
});

export default function CalendarPage({ worker }: { worker?: boolean }) {
  const navigate = useNavigate();
  const { toast } = useDialogs();
  const today = todayMadrid();

  const [view, setView] = useState<CalendarView>(worker ? 'agenda' : 'mes');
  const [anchor, setAnchor] = useState(today);
  const [kinds, setKinds] = useState<CalendarKind[]>([...CALENDAR_KINDS]);
  const [workerId, setWorkerId] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const { from, to } = rangeFor(view, anchor);
  const people = useAsync(() => (worker ? Promise.resolve([]) : listPeople('worker')), [worker]);
  const events = useAsync(
    () => listCalendar(from, to, { workerId: workerId || undefined }),
    [from, to, workerId, reloadKey],
  );

  const shown = useMemo(
    () => (events.data ?? []).filter((e) => kinds.includes(e.kind)),
    [events.data, kinds],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    shown.forEach((e) => {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    });
    return map;
  }, [shown]);

  function toggleKind(kind: CalendarKind) {
    setKinds((list) => (list.includes(kind) ? list.filter((k) => k !== kind) : [...list, kind]));
  }

  function step(direction: number) {
    if (view === 'mes') setAnchor(addMonths(anchor, direction));
    else if (view === 'semana') setAnchor(addDays(anchor, direction * 7));
    else setAnchor(addDays(anchor, direction));
  }

  function openEvent(e: CalendarEvent) {
    if (worker) {
      if (e.kind === 'fabricacion' || e.kind === 'montaje') navigate(`/t/ordenes/${e.id}`);
      return;
    }
    if (e.kind === 'fabricacion' || e.kind === 'montaje') navigate(`/admin/ordenes/${e.id}`);
    else if (e.kind === 'material') navigate('/admin/material');
    else navigate(`/admin/fichas/${e.id}`);
  }

  async function drop(date: string) {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (!id) return;
    const event = shown.find((e) => e.id === id);
    if (!event || event.date === date) return;
    try {
      await moveOrder(id, date);
      toast.success(`${event.code} pasa al ${fmtDate(date)}`);
      setReloadKey((n) => n + 1);
    } catch (err) { toast.error(err); }
  }

  const canDrag = !worker;

  const chipProps = { dragging, canDrag, setDragging, setOver, openEvent };

  const monthDays = useMemo(() => {
    const start = mondayOf(startOfMonth(anchor));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const weekDays = useMemo(() => {
    const start = mondayOf(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const agendaDays = useMemo(() => {
    const days = [...byDay.keys()].sort();
    return days.filter((d) => d >= from && d <= to);
  }, [byDay, from, to]);

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
          {CALENDAR_KINDS.map((k) => (
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
                {monthDays.map((d) => (
                  <Day key={d} date={d} outside={d.slice(0, 7) !== anchor.slice(0, 7)} list={byDay.get(d) ?? []} today={today} over={over} view={view}
                       canDrag={canDrag} setOver={setOver} drop={drop} chipProps={chipProps} />
                ))}
              </div>
            )}

            {view === 'semana' && (
              <div className="cal-week">
                {weekDays.map((d) => (
                  <Day key={d} date={d} list={byDay.get(d) ?? []} today={today} over={over} view={view}
                       canDrag={canDrag} setOver={setOver} drop={drop} chipProps={chipProps} />
                ))}
              </div>
            )}

            {view === 'dia' && (
              <div className="cal-day-single">
                <Day date={anchor} list={byDay.get(anchor) ?? []} today={today} over={over} view={view}
                     canDrag={canDrag} setOver={setOver} drop={drop} chipProps={chipProps} />
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
                        {(byDay.get(d) ?? []).map((e) => (
                          <button key={`${e.kind}-${e.id}`} type="button" className="cal-row"
                                  style={{ ['--ev' as string]: CALENDAR_COLOR[e.kind] }}
                                  onClick={() => openEvent(e)}>
                            <span className="cal-dot" aria-hidden />
                            <span className="cal-row-main">
                              <strong>{e.code ? `${e.code} · ` : ''}{e.title}</strong>
                              <small>
                                {CALENDAR_LABEL[e.kind]}
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
          Arrastra una orden de fabricación o de montaje a otro día para cambiarle la fecha.
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
        sub="Todo lo que tiene fecha: órdenes de trabajo, material, visitas y avisos."
      />
      <section className="panel">
        <div className="panel-body">{body}</div>
      </section>
    </>
  );
}
