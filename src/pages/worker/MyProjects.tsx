import { ChevronRight, FolderKanban, MapPin, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Layout';
import { PlanLine } from '@/components/shared/PlanLine';
import { PHASE_LABEL, PHASE_TONE, fichaStatus } from '@/config/constants';
import { fmtDate, fmtHours, fmtTimeShort } from '@/lib/format';
import { myAvisos, myProjects } from '@/services/partes';

/**
 * «Mis trabajos»: los proyectos y los AVISOS DE CLIENTE en los que
 * administración me ha dado de alta.
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
  const avisos = useAsync(() => myAvisos(), []);

  if (proyectos.loading && !proyectos.data) return <Loading />;
  if (proyectos.error) return <ErrorBox message={proyectos.error} onRetry={proyectos.reload} />;

  const rows = proyectos.data ?? [];
  const misAvisos = avisos.data ?? [];

  return (
    <>
      <div className="w-greeting">
        <h1>Mis trabajos</h1>
        {rows.length + misAvisos.length > 1 && (
          <span className="muted">Ordenados por lo que toca antes.</span>
        )}
      </div>

      {/* -------------------------------------------------------------
          LOS AVISOS DE CLIENTE

          Van primero porque casi siempre son para hoy o para mañana: un
          cierre que no ajusta no espera a que acabe un proyecto.

          Son los AVISOS DE CLIENTE («fichas» de tipo aviso), no las
          notificaciones de la campana ni los avisos de material.

          Si no hay ninguno, no se pinta nada: un apartado vacío en el
          móvil solo quita sitio.
          ------------------------------------------------------------- */}
      {misAvisos.length > 0 && (
        <section className="w-section">
          <h2><TriangleAlert size={17} aria-hidden />Avisos de cliente</h2>
          <div className="stack">
          {misAvisos.map((a) => (
            <Link key={a.id} className="ot-card" to={`/t/avisos/${a.id}`}>
              <div className="ot-card-top">
                <span className="plate">{a.code}</span>
                <Badge tone={fichaStatus('aviso', a.status).tone}>
                  {fichaStatus('aviso', a.status).label}
                </Badge>
              </div>

              <strong className="ot-card-title">{a.title ?? 'Aviso'}</strong>
              {a.description && <p className="ot-card-desc">{a.description}</p>}

              <div className="ot-card-meta">
                {a.client_name && <span>{a.client_name}</span>}
                {a.address && <span><MapPin size={15} aria-hidden />{a.address}</span>}
                {a.scheduled_date && (
                  <span>
                    {fmtDate(a.scheduled_date)}
                    {a.scheduled_time ? ` · ${fmtTimeShort(a.scheduled_time)}` : ''}
                  </span>
                )}
                {a.mis_partes > 0 && (
                  <span className="num">
                    {a.mis_partes === 1 ? '1 parte tuyo' : `${a.mis_partes} partes tuyos`}
                  </span>
                )}
              </div>

              <ChevronRight className="ot-card-go" aria-hidden />
            </Link>
          ))}
          </div>
        </section>
      )}

      <section className="w-section">
        {/* El titular solo hace falta si arriba hay avisos: si no, el
            título de la pantalla ya dice lo que es. */}
        {misAvisos.length > 0 && rows.length > 0 && (
          <h2><FolderKanban size={17} aria-hidden />Proyectos</h2>
        )}
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
        )) : misAvisos.length ? null : (
          <div className="w-block">
            <Empty title="Todavía no tienes ningún trabajo asignado."
                   icon={<FolderKanban aria-hidden />}>
              Administración te dará de alta en los proyectos y en los avisos en los que
              vayas a trabajar. Mientras tanto puedes rellenar un parte sin proyecto desde
              «Mis partes».
            </Empty>
          </div>
        )}
        </div>
      </section>
    </>
  );
}
