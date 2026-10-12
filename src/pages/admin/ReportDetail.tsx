import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Boxes, CheckCircle2, FolderKanban, Undo2 } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { Badge, PageHeader, Panel } from '@/components/ui/Layout';
import { Modal } from '@/components/ui/Modal';
import { CommentsPanel } from '@/components/shared/CommentsPanel';
import { DocumentsPanel } from '@/components/shared/DocumentsPanel';
import { HistoryPanel } from '@/components/shared/HistoryPanel';
import {
  ORDER_TYPE_LABEL, REPORT_STATUS_LABEL, REPORT_STATUS_TONE,
} from '@/config/constants';
import { fmtDate, fmtDateTime, fmtHours } from '@/lib/format';
import {
  assignReportToProject, getReport, rejectReport, validateReport,
} from '@/services/partes';
import { listProjects } from '@/services/projects';

/**
 * REVISAR UN PARTE · administración.
 *
 * Lo que se decide aquí es si esas horas cuentan o no: hasta que no se
 * valida, el proyecto sigue sin sumarlas.
 *
 * Si el parte nació sin proyecto («Salvi me dijo que hiciera una faena»),
 * aquí se le asigna uno.
 */
export default function AdminReportDetail() {
  const { id = '' } = useParams();
  const { toast, confirm } = useDialogs();
  const [busy, setBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [proyectoElegido, setProyectoElegido] = useState('');

  const parte = useAsync(() => getReport(id), [id, historyKey]);
  const proyectos = useAsync(
    async () => (asignando ? listProjects({ state: 'activos', pageSize: 100 }) : null),
    [asignando],
  );

  if (parte.loading && !parte.data) return <Loading />;
  if (parte.error) return <ErrorBox message={parte.error} onRetry={parte.reload} />;
  if (!parte.data) return null;

  const r = parte.data;

  async function validar() {
    const ok = await confirm({
      title: 'Validar el parte',
      message: (
        <>Se darán por buenas <strong>{fmtHours(r.hours)}</strong> de
          {' '}{ORDER_TYPE_LABEL[r.work_type].toLowerCase()}. A partir de ese momento contarán
          como horas realizadas del proyecto y el trabajador ya no podrá modificarlo.</>
      ),
      confirmLabel: 'Validar',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await validateReport(r.id);
      toast.success('Parte validado');
      setHistoryKey((k) => k + 1);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function rechazar() {
    setBusy(true);
    try {
      await rejectReport(r.id, motivo);
      toast.success('Parte devuelto al trabajador');
      setRechazando(false);
      setMotivo('');
      setHistoryKey((k) => k + 1);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function asignar() {
    setBusy(true);
    try {
      await assignReportToProject(r.id, proyectoElegido || null);
      toast.success('Parte asignado al proyecto');
      setAsignando(false);
      setHistoryKey((k) => k + 1);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to="/admin/partes" style={{ marginBottom: 10 }}>
        <ArrowLeft />Partes de trabajo
      </Link>

      <PageHeader
        title={<>Parte {r.code}</>}
        sub={<>
          {r.worker?.full_name ?? 'Trabajador'} · {ORDER_TYPE_LABEL[r.work_type]} ·{' '}
          {fmtDate(r.work_date)}
        </>}
        actions={<Badge tone={REPORT_STATUS_TONE[r.status]}>{REPORT_STATUS_LABEL[r.status]}</Badge>}
      />

      <div className="stack" style={{ marginBottom: 16 }}>
        {r.status === 'enviado' && (
          <Alert kind="warn" action={
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary" disabled={busy} onClick={validar}>
                <CheckCircle2 />Validar
              </button>
              <button className="btn" disabled={busy} onClick={() => setRechazando(true)}>
                <Undo2 />Rechazar
              </button>
            </div>
          }>
            <strong>Pendiente de validación.</strong>
            <div style={{ marginTop: 2 }}>
              Enviado el {fmtDateTime(r.submitted_at)}. Estas {fmtHours(r.hours)} todavía
              no cuentan como realizadas.
            </div>
          </Alert>
        )}

        {r.status === 'validado' && (
          <Alert kind="ok" action={
            <button className="btn" disabled={busy} onClick={() => setRechazando(true)}>
              <Undo2 />Rechazar
            </button>
          }>
            Validado el {fmtDateTime(r.validated_at)}. Sus {fmtHours(r.hours)} cuentan como
            trabajo realizado.
          </Alert>
        )}

        {r.status === 'rechazado' && (
          <Alert kind="danger">
            <strong>Rechazado.</strong>
            <div style={{ marginTop: 2 }}>Motivo: {r.reject_reason}</div>
            <div style={{ marginTop: 2 }}>El trabajador puede corregirlo y volver a enviarlo.</div>
          </Alert>
        )}

        {r.status === 'borrador' && (
          <Alert kind="info">
            El trabajador lo tiene guardado pero todavía no lo ha enviado.
          </Alert>
        )}

        {!r.project_id && (
          <Alert kind="warn" action={
            <button className="btn" disabled={busy} onClick={() => setAsignando(true)}>
              <FolderKanban />Asignar a un proyecto
            </button>
          }>
            <strong>Este parte no tiene proyecto.</strong>
            <div style={{ marginTop: 2 }}>
              Lo creó el trabajador sin tenerlo asignado. Al ponerle proyecto pasará a su
              historial, y si lo validas sus horas contarán en la fase que corresponda.
            </div>
          </Alert>
        )}

        {r.needs_material && (
          <Alert kind="warn" action={
            <Link className="btn" to="/admin/material"><Boxes />Material pendiente</Link>
          }>
            El trabajador ha avisado de que falta material.
          </Alert>
        )}
      </div>

      <div className="two-col">
        <div className="stack">
          <Panel title="Lo que ha hecho">
            <dl className="kv">
              <dt>Trabajador</dt><dd>{r.worker?.full_name ?? '—'}</dd>
              <dt>Tipo de trabajo</dt><dd>{ORDER_TYPE_LABEL[r.work_type]}</dd>
              <dt>Día trabajado</dt><dd>{fmtDate(r.work_date)}</dd>
              <dt>Horas</dt><dd className="num">{r.hours != null ? fmtHours(r.hours) : '—'}</dd>
              <dt>Proyecto</dt>
              <dd>
                {r.project
                  ? <Link to={`/admin/proyectos/${r.project.id}`}>
                      {r.project.code} · {r.project.name}
                    </Link>
                  : 'Sin asignar'}
              </dd>
              {r.assigned_at && (
                <>
                  <dt>Asignado al proyecto</dt>
                  <dd>{fmtDateTime(r.assigned_at)}</dd>
                </>
              )}
            </dl>
            <p className="pre" style={{ marginTop: 14 }}>{r.work_done || 'Sin describir.'}</p>
            <p className="hint" style={{ marginBottom: 0 }}>
              Las horas de un parte son siempre las de esa persona. Si fueron dos, cada uno
              tiene su parte.
            </p>
          </Panel>

          <HistoryPanel entityCode={r.code} reloadKey={String(historyKey)} />
        </div>

        <div className="stack">
          <DocumentsPanel owner={{ reportId: r.id }} title="Fotografías y firma"
            onChange={() => setHistoryKey((k) => k + 1)} />
          <CommentsPanel owner={{ reportId: r.id }} reloadKey={String(historyKey)} />
        </div>
      </div>

      {rechazando && (
        <Modal title="Rechazar el parte" onClose={() => setRechazando(false)}>
          <p className="muted">
            El trabajador verá el motivo y podrá corregirlo. Explícaselo con claridad.
          </p>
          <div className="field">
            <label className="label" htmlFor="pt-motivo">Motivo</label>
            <textarea id="pt-motivo" className="input" rows={4} value={motivo}
                      placeholder="Por ejemplo: faltan las fotos del remate."
                      onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn" onClick={() => setRechazando(false)}>Cancelar</button>
            <button className="btn btn-danger" disabled={busy || !motivo.trim()} onClick={rechazar}>
              Rechazar el parte
            </button>
          </div>
        </Modal>
      )}

      {asignando && (
        <Modal title="Asignar a un proyecto" onClose={() => setAsignando(false)}>
          {proyectos.loading && !proyectos.data ? <Loading /> : (
            <div className="field">
              <label className="label" htmlFor="pt-proy">Proyecto</label>
              <select id="pt-proy" className="input" value={proyectoElegido}
                      onChange={(e) => setProyectoElegido(e.target.value)}>
                <option value="">Elige un proyecto…</option>
                {(proyectos.data?.rows ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn" onClick={() => setAsignando(false)}>Cancelar</button>
            <button className="btn btn-primary" disabled={busy || !proyectoElegido}
                    onClick={asignar}>Asignar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
