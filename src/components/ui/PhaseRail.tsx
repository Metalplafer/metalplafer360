import { PHASES, PHASE_LABEL } from '@/config/constants';
import type { ProjectPhase } from '@/types/db';

/** Las cinco fases del proyecto, como una línea de producción. */
export function PhaseRail({ phase, onChange, disabled }: {
  phase: ProjectPhase;
  onChange?: (p: ProjectPhase) => void;
  disabled?: boolean;
}) {
  const current = PHASES.indexOf(phase);

  return (
    <div className="rail" role="group" aria-label="Fase del proyecto">
      {PHASES.map((p, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : '';
        // A «Finalizado» no se llega pulsando: hay un botón aparte.
        const canClick = Boolean(onChange) && !disabled && p !== 'finalizado' && p !== phase;
        return (
          <button
            key={p}
            type="button"
            className={`rail-step ${state}${canClick ? ' clickable' : ''}`}
            disabled={!canClick}
            aria-current={i === current}
            onClick={canClick ? () => onChange?.(p) : undefined}
            title={canClick ? `Pasar a ${PHASE_LABEL[p]}` : PHASE_LABEL[p]}
          >
            <span className="n">Fase {i + 1}</span>
            {PHASE_LABEL[p]}
          </button>
        );
      })}
    </div>
  );
}

/** Versión reducida para los listados. */
export function PhaseMini({ phase }: { phase: ProjectPhase }) {
  const current = PHASES.indexOf(phase);
  return (
    <span className="rail-mini" aria-label={`Fase: ${PHASE_LABEL[phase]}`} title={PHASE_LABEL[phase]}>
      {PHASES.map((p, i) => <i key={p} className={i < current ? 'on' : i === current ? 'cur' : ''} />)}
    </span>
  );
}
