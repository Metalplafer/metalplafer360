import { memo, type CSSProperties } from 'react';
import { CALENDAR_LABEL } from '@/config/constants';
import { dayNumber, weekdayShort } from '@/lib/format';
import {
  cubre, escondidosPorDia, masDias, repartirSemana, type Segmento,
} from '@/lib/calendario';
import type { CalendarSpan } from '@/types/db';

/**
 * UNA SEMANA DEL CALENDARIO, CON SUS BARRAS.
 *
 * Siete columnas y, encima, las pastillas colocadas en carriles. Un
 * tramo de varios días es UNA barra que recorre sus columnas, no una
 * pastilla por día: eso es lo que deja ver de un vistazo cómo de cargada
 * está la semana.
 *
 * Las casillas de los días van DEBAJO y son las que reciben lo que se
 * suelta encima. Mientras se arrastra, las pastillas dejan de recibir el
 * ratón —lo hace la hoja de estilos con la clase «arrastrando»— para que
 * soltar sobre una barra cuente como soltar en el día que hay detrás.
 */
export interface SemanaProps {
  lunes: string;
  tramos: CalendarSpan[];
  hoy: string;
  /**
   * MEJORA 4.1 · El color de la categoría y el del texto que se lee
   * encima, ya calculados por quien sabe qué colores ha elegido la
   * empresa. La semana solo los pone.
   */
  estiloDe: (k: CalendarSpan['kind']) => CSSProperties;
  /** El mes que se está mirando, para apagar los días de los otros. */
  mes?: string;
  noLaborables: Set<string>;
  canDrag: boolean;
  dragging: string | null;
  over: string | null;
  carriles?: number;
  altoDia?: number;
  mostrarDiaSemana?: boolean;
  uid: (s: CalendarSpan) => string;
  onDragStart: (uid: string | null) => void;
  onOver: (dia: string | null) => void;
  onDrop: (dia: string) => void;
  onOpen: (s: CalendarSpan) => void;
  onFestivo?: (dia: string) => void;
  onVerDia?: (dia: string) => void;
}

/** Cuántos carriles se pintan antes de empezar a resumir en «+N». */
const CARRILES = 4;

function Pastilla({ s, uid, dragging, canDrag, estiloDe, onDragStart, onOpen }: {
  s: Segmento<CalendarSpan & { uid: string }>;
  uid: string;
  dragging: string | null;
  canDrag: boolean;
  estiloDe: (k: CalendarSpan['kind']) => CSSProperties;
  onDragStart: (uid: string | null) => void;
  onOpen: (s: CalendarSpan) => void;
}) {
  const e = s.item;
  const dias = s.span;
  return (
    <button
      type="button"
      className={[
        'cal-event',
        dragging === uid ? 'dragging' : '',
        s.continuaAntes ? 'sigue-antes' : '',
        s.continuaDespues ? 'sigue-despues' : '',
      ].filter(Boolean).join(' ')}
      style={{
        ...estiloDe(e.kind),
        gridColumn: `${s.col + 1} / span ${dias}`,
        gridRow: s.lane + 1,
      }}
      draggable={canDrag && e.movable}
      onDragStart={() => onDragStart(uid)}
      onDragEnd={() => onDragStart(null)}
      onClick={() => onOpen(e)}
      title={`${CALENDAR_LABEL[e.kind]} · ${e.title}`
        + `${e.client_name ? ` · ${e.client_name}` : ''}`
        + `${e.starts !== e.ends ? ` · del ${e.starts} al ${e.ends}` : ''}`}
    >
      <span className="cal-dot" aria-hidden />
      {/*
        MEJORA 4.1 · La categoría, DICHA y no solo coloreada. No se ve en
        pantalla —no cabe en una pastilla de 20 píxeles— pero la leen los
        lectores de pantalla y está en el «title» al pasar por encima,
        para que la información no dependa solo del color.
      */}
      <span className="sr-only">{CALENDAR_LABEL[e.kind]}: </span>
      <span className="cal-event-text">
        {s.continuaAntes ? '◂ ' : ''}
        {e.code ? <strong>{e.code}</strong> : null} {e.title}
        {s.continuaDespues ? ' ▸' : ''}
      </span>
    </button>
  );
}

export const SemanaCalendario = memo(function SemanaCalendario({
  lunes, tramos, hoy, mes, noLaborables, canDrag, dragging, over, estiloDe,
  carriles = CARRILES, altoDia = 104, mostrarDiaSemana, uid,
  onDragStart, onOver, onDrop, onOpen, onFestivo, onVerDia,
}: SemanaProps) {
  const dias = Array.from({ length: 7 }, (_, i) => masDias(lunes, i));
  const conUid = tramos.map((t) => ({ ...t, uid: uid(t) }));
  const segmentos = repartirSemana(conUid, lunes);
  const visibles = segmentos.filter((s) => s.lane < carriles);
  const escondidos = escondidosPorDia(segmentos, lunes, carriles);
  const usados = Math.min(
    carriles,
    segmentos.reduce((max, s) => Math.max(max, s.lane + 1), 0),
  );

  return (
    <div
      className={`cal-semana${dragging ? ' arrastrando' : ''}`}
      /*
        MEJORA 5.2 · El alto NO se calcula aquí. Se dicen las dos cosas
        que el CSS no puede saber —cuántos carriles hacen falta y cuánto
        mide una casilla de día en esta vista— y el alto sale de ahí con
        las medidas de carril que use cada tamaño de pantalla. Antes se
        multiplicaba por 22 a mano, y en el móvil los carriles medían 16:
        la capa de pastillas se salía y se montaba sobre la semana
        siguiente.
      */
      style={{
        ['--carriles' as string]: usados,
        ['--alto-dia' as string]: `${altoDia}px`,
      }}
    >
      <div className="cal-dias">
        {dias.map((d) => (
          <div
            key={d}
            className={[
              'cal-day',
              mes && d.slice(0, 7) !== mes.slice(0, 7) ? 'outside' : '',
              d === hoy ? 'today' : '',
              over === d ? 'over' : '',
              noLaborables.has(d) ? 'no-laborable' : '',
            ].filter(Boolean).join(' ')}
            onDragOver={canDrag ? (ev) => { ev.preventDefault(); onOver(d); } : undefined}
            onDragLeave={canDrag ? () => onOver(null) : undefined}
            onDrop={canDrag ? () => onDrop(d) : undefined}
          >
            <div className="cal-day-head">
              <span className="num">{dayNumber(d)}</span>
              {mostrarDiaSemana && <span className="faint">{weekdayShort(d)}</span>}
              {onFestivo && (
                <button type="button" className="cal-festivo"
                        aria-pressed={noLaborables.has(d)}
                        title={noLaborables.has(d)
                          ? 'Día no laborable. Pulsa para volver a trabajarlo.'
                          : 'Marcar como no laborable'}
                        onClick={() => onFestivo(d)}>
                  {noLaborables.has(d) ? '◦' : '·'}
                </button>
              )}
            </div>
            {escondidos.get(d) ? (
              <button type="button" className="cal-mas"
                      onClick={() => onVerDia?.(d)}>
                +{escondidos.get(d)} más
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="cal-pastillas">
        {visibles.map((s) => (
          <Pastilla key={s.item.uid} s={s} uid={s.item.uid} dragging={dragging}
                    canDrag={canDrag} estiloDe={estiloDe}
                    onDragStart={onDragStart} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
});

/** Los tramos que tocan un día, para la vista de día y la agenda. */
export function tramosDelDia(tramos: CalendarSpan[], dia: string) {
  return tramos.filter((t) => cubre({ uid: '', starts: t.starts, ends: t.ends }, dia));
}
