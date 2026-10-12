import { CalendarDays } from 'lucide-react';
import { dayLabel, fmtDate, todayMadrid } from '@/lib/format';

export interface PlanDates {
  fab_start: string | null;
  fab_end: string | null;
  mont_start: string | null;
  mont_end: string | null;
  no_assembly?: boolean;
}

/** «Del 02/12 al 03/12», o un solo día si empieza y acaba igual. */
function tramo(desde: string | null, hasta: string | null) {
  if (!desde) return null;
  if (!hasta || hasta === desde) return fmtDate(desde);
  return `del ${fmtDate(desde)} al ${fmtDate(hasta)}`;
}

/**
 * CUÁNDO LE TOCA.
 *
 * Las fechas que administración ha planificado, tal como las ve el
 * trabajador: para consultar y priorizar. Desde aquí no se cambia nada;
 * la planificación la mueve administración.
 */
export function PlanLine({ plan, compact }: { plan: PlanDates; compact?: boolean }) {
  const fab = tramo(plan.fab_start, plan.fab_end);
  const mont = tramo(plan.mont_start, plan.mont_end);

  if (!fab && !mont) {
    return compact
      ? <span className="plan-compacta faint">Sin fecha todavía</span>
      : <p className="muted" style={{ margin: 0 }}>
          Administración todavía no le ha puesto fecha. Cuando la tenga, aparecerá aquí
          y en tu calendario.
        </p>;
  }

  if (compact) {
    return (
      <span className="plan-compacta">
        <CalendarDays size={15} aria-hidden />
        {fab ? `Fabricación ${fab}` : ''}
        {fab && mont ? ' · ' : ''}
        {mont ? `Montaje ${mont}` : ''}
      </span>
    );
  }

  const hoy = todayMadrid();
  return (
    <dl className="kv tight">
      {fab && (
        <>
          <dt>Fabricación</dt>
          <dd>
            {fab}
            {plan.fab_start && plan.fab_start >= hoy && (
              <div className="faint">Empieza: {dayLabel(plan.fab_start, hoy)}</div>
            )}
          </dd>
        </>
      )}
      {mont ? (
        <>
          <dt>Montaje</dt>
          <dd>
            {mont}
            {plan.mont_start && plan.mont_start >= hoy && (
              <div className="faint">Empieza: {dayLabel(plan.mont_start, hoy)}</div>
            )}
          </dd>
        </>
      ) : plan.no_assembly ? (
        <>
          <dt>Montaje</dt>
          <dd className="faint">Este proyecto no lleva montaje.</dd>
        </>
      ) : null}
    </dl>
  );
}
