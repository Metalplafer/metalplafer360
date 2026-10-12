import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, ClipboardList, FileText, MapPin, Plus, Users,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { ErrorBox, Loading } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Layout';
import { CommentsPanel } from '@/components/shared/CommentsPanel';
import { DocumentsPanel } from '@/components/shared/DocumentsPanel';
import { MaterialNeedButton } from '@/components/shared/MaterialNeedButton';
import { PlanLine } from '@/components/shared/PlanLine';
import {
  ORDER_TYPE_LABEL, PHASE_LABEL, PHASE_TONE, REPORT_STATUS_SHORT, REPORT_STATUS_TONE,
} from '@/config/constants';
import { fmtDate, fmtHours } from '@/lib/format';
import { listReports, projectTeam, workerProject } from '@/services/partes';

/**
 * EL PROYECTO EN EL MÓVIL DEL TRABAJADOR.
 *
 * Todo lo que se ve aquí sale de «worker_projects», que no tiene importe,
 * ni paga y señal, ni facturación. No es que la pantalla los esconda: no
 * llegan hasta aquí.
 */
export default function WorkerProjectDetail() {
  const { id = '' } = useParams();
  const { profile } = useAuth();

  const proyecto = useAsync(() => workerProject(id), [id]);
  const equipo = useAsync(() => projectTeam(id), [id]);
  const mios = useAsync(
    async () => (profile
      ? listReports({ projectId: id, workerId: profile.id, pageSize: 50 })
      : { rows: [], total: 0 }),
    [id, profile?.id],
  );

  if (proyecto.loading && !proyecto.data) return <Loading />;
  if (proyecto.error) return <ErrorBox message={proyecto.error} onRetry={proyecto.reload} />;
  if (!proyecto.data) return <ErrorBox message="Este proyecto no está asignado a ti." />;

  const p = proyecto.data;
  const partes = mios.data?.rows ?? [];
  const misHoras = partes
    .filter((r) => r.status === 'validado')
    .reduce((n, r) => n + (r.hours ?? 0), 0);

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to="/t/proyectos" style={{ marginBottom: 10 }}>
        <ArrowLeft />Mis proyectos
      </Link>

      <div className="w-greeting">
        <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <span className="plate">{p.code}</span>
            <h1 style={{ marginTop: 6 }}>{p.name}</h1>
            {p.client_name && <p className="muted">{p.client_name}</p>}
          </div>
          <Badge tone={PHASE_TONE[p.phase]}>{PHASE_LABEL[p.phase]}</Badge>
        </div>
      </div>

      <Link className="btn btn-lg btn-primary btn-block" to={`/t/partes/nuevo?proyecto=${p.id}`}
            style={{ marginBottom: 10 }}>
        <Plus />Parte de trabajo
      </Link>

      {/* BLOQUE 5: si falta material, se pide aquí mismo, sin esperar a
          rellenar ningún parte. */}
      <div style={{ marginBottom: 14 }}>
        <MaterialNeedButton projectId={p.id} projectLabel={`${p.code} · ${p.name}`} block />
      </div>

      {/* ------------------------------------------------- CUÁNDO LE TOCA */}
      <div className="w-block">
        <h3><CalendarDays aria-hidden />Cuándo le toca</h3>
        <PlanLine plan={p} />
        <p className="w-note" style={{ marginBottom: 0 }}>
          Las fechas las pone administración. Puedes consultarlas aquí y en tu{' '}
          <Link to="/t/calendario">calendario</Link>.
        </p>
      </div>

      {/* ------------------------------------------------------- EL TRABAJO */}
      <div className="w-block">
        <h3><ClipboardList aria-hidden />El trabajo</h3>
        <dl className="kv tight">
          {p.description && <><dt>Descripción</dt><dd className="pre">{p.description}</dd></>}
          {p.measures && <><dt>Medidas</dt><dd>{p.measures}</dd></>}
          {p.finish && <><dt>Acabado</dt><dd>{p.finish}</dd></>}
          {p.location && <><dt>Ubicación</dt><dd>{p.location}</dd></>}
          {p.address && (
            <>
              <dt><MapPin size={14} aria-hidden /> Dirección</dt>
              <dd>{p.address}</dd>
            </>
          )}
          {p.observations && <><dt>Observaciones</dt><dd className="pre">{p.observations}</dd></>}
          <dt>Horas previstas</dt>
          <dd>
            {fmtHours(p.budget_hours_fab)} de fabricación
            {p.no_assembly ? ' · sin montaje' : ` · ${fmtHours(p.budget_hours_mont)} de montaje`}
          </dd>
          <dt>Tus horas validadas</dt>
          <dd className="num">{fmtHours(misHoras)}</dd>
        </dl>
      </div>

      {/* ---------------------------------------------------------- EQUIPO */}
      <div className="w-block">
        <h3><Users aria-hidden />Quién trabaja aquí</h3>
        {equipo.data?.length
          ? (
            <ul className="team-list">
              {equipo.data.map((m) => (
                <li key={m.worker_id}>
                  {m.full_name}
                  {m.worker_id === profile?.id && <span className="faint"> · tú</span>}
                </li>
              ))}
            </ul>
          )
          : <p className="muted">Solo tú, de momento.</p>}
      </div>

      {/* ---------------------------------------------------- DOCUMENTACIÓN */}
      <div className="w-block">
        <DocumentsPanel owner={{ projectId: p.id }} title="Documentación del proyecto" />
      </div>

      {/* --------------------------------------------------------- MIS PARTES */}
      <div className="w-block">
        <h3><FileText aria-hidden />Mis partes de este proyecto</h3>
        {partes.length ? (
          <ul className="mini-list">
            {partes.map((r) => (
              <li key={r.id}>
                <Link to={`/t/partes/${r.id}`}>
                  <span className="mono">{r.code}</span>
                  <span>{ORDER_TYPE_LABEL[r.work_type]} · {fmtDate(r.work_date)}</span>
                  <span className="num">{r.hours != null ? fmtHours(r.hours) : '—'}</span>
                  <Badge tone={REPORT_STATUS_TONE[r.status]}>{REPORT_STATUS_SHORT[r.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Todavía no has rellenado ningún parte de este proyecto.</p>}
      </div>

      {/* ------------------------------------------------------ COMENTARIOS */}
      <div className="w-block">
        <CommentsPanel owner={{ projectId: p.id }} />
      </div>
    </>
  );
}
