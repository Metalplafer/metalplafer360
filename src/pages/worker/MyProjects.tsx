import { ChevronRight, FolderKanban, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Layout';
import { PlanLine } from '@/components/shared/PlanLine';
import { PHASE_LABEL, PHASE_TONE } from '@/config/constants';
import { fmtHours } from '@/lib/format';
import { myProjects } from '@/services/partes';

/**
 * «Mis proyectos»: aquellos en los que administración me ha dado de alta.
 *
 * Lo que se lee aquí viene de una vista que NO tiene el importe ni la
 * paga y señal: el dinero es de administración, y no está ni oculto ni
 * a mano, sencillamente no llega hasta aquí.
 *
 * Salen ORDENADOS por lo que toca antes (BLOQUE 5): primero los que
 * tienen fecha más cercana, y al final los que todavía no la tienen.
 */
export default function MyProjects() {
  const proyectos = useAsync(() => myProjects(), []);

  if (proyectos.loading && !proyectos.data) return <Loading />;
  if (proyectos.error) return <ErrorBox message={proyectos.error} onRetry={proyectos.reload} />;

  const rows = proyectos.data ?? [];

  return (
    <>
      <div className="w-greeting">
        <h1>Mis proyectos</h1>
        {rows.length > 1 && (
          <span className="muted">Ordenados por lo que toca antes.</span>
        )}
      </div>

      <div className="stack">
        {rows.length ? rows.map((p) => (
          <Link key={p.id} className="ot-card" to={`/t/proyectos/${p.id}`}>
            <div className="ot-card-top">
              <span className="plate">{p.code}</span>
              <Badge tone={PHASE_TONE[p.phase]}>{PHASE_LABEL[p.phase]}</Badge>
            </div>

            <strong className="ot-card-title">{p.name}</strong>
            {p.description && <p className="ot-card-desc">{p.description}</p>}

            <div className="ot-card-meta">
              {p.client_name && <span>{p.client_name}</span>}
              {p.address && <span><MapPin size={15} aria-hidden />{p.address}</span>}
              <PlanLine plan={p} compact />
              <span className="num">
                {fmtHours(p.budget_hours_fab)} fabricación · {fmtHours(p.budget_hours_mont)} montaje
              </span>
            </div>

            <ChevronRight className="ot-card-go" aria-hidden />
          </Link>
        )) : (
          <div className="w-block">
            <Empty title="Todavía no tienes ningún proyecto asignado."
                   icon={<FolderKanban aria-hidden />}>
              Administración te dará de alta en los proyectos en los que vayas a trabajar.
              Mientras tanto puedes rellenar un parte sin proyecto desde «Mis partes».
            </Empty>
          </div>
        )}
      </div>
    </>
  );
}
