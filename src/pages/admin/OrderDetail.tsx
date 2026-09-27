import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Archive, ArchiveRestore, ArrowLeft, Building2, CalendarDays, CheckCircle2,
  FolderKanban, MapPin, Pencil, Undo2, Users,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Modal } from '@/components/ui/Modal';
import { Badge, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { DocumentsPanel } from '@/components/shared/DocumentsPanel';
import { CommentsPanel } from '@/components/shared/CommentsPanel';
import { HistoryPanel } from '@/components/shared/HistoryPanel';
import { getOrder, listParts, returnOrder, updateOrder, validateOrder } from '@/services/orders';
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, ORDER_TYPE_LABEL } from '@/config/constants';
import { fmtDate, fmtDateTime, fmtHours, relativeDay } from '@/lib/format';

export default function OrderDetail() {
  const { id = '' } = useParams();
  const { toast, confirm } = useDialogs();

  const order = useAsync(() => getOrder(id), [id]);
  const parts = useAsync(() => listParts(id), [id]);
  const [historyKey, setHistoryKey] = useState(0);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (order.loading && !order.data) return <Loading />;
  if (order.error) return <ErrorBox message={order.error} onRetry={order.reload} />;
  if (!order.data) return null;

  const o = order.data;
  const archived = Boolean(o.archived_at);
  const rows = parts.data ?? [];
  const realHours = rows.reduce((sum, p) => sum + Number(p.hours ?? 0), 0);
  const sent = rows.filter((p) => p.submitted_at).length;

  async function reload() {
    await order.reload();
    await parts.reload();
    setHistoryKey((n) => n + 1);
  }

  async function validate() {
    const ok = await confirm({
      title: 'Validar la orden',
      message: <>La orden {o.code} quedará validada y los trabajadores recibirán el aviso.
        Después ya no podrán modificarla.</>,
      confirmLabel: 'Validar',
    });
    if (!ok) return;
    setBusy(true);
    try { await validateOrder(o.id); toast.success('Orden validada'); await reload(); }
    catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function doReturn() {
    setBusy(true);
    try {
      await returnOrder(o.id, reason);
      toast.success('Orden devuelta');
      setReturning(false);
      setReason('');
      await reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function toggleArchive() {
    const ok = await confirm({
      title: archived ? 'Recuperar orden' : 'Archivar orden',
      message: archived
        ? <>La orden {o.code} volverá a los listados.</>
        : <>La orden {o.code} desaparecerá de los listados y del móvil de los trabajadores,
            pero no se borra: conserva fotografías, horas e historial.</>,
      confirmLabel: archived ? 'Recuperar' : 'Archivar',
      danger: !archived,
    });
    if (!ok) return;
    try {
      await updateOrder(o.id, { archived_at: archived ? null : new Date().toISOString() });
      toast.success(archived ? 'Orden recuperada' : 'Orden archivada');
      await reload();
    } catch (e) { toast.error(e); }
  }

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to="/admin/ordenes" style={{ marginBottom: 10 }}>
        <ArrowLeft />Órdenes de trabajo
      </Link>

      <PageHeader
        title={
          <span className="ficha-head">
            <span className="plate plate-dark" style={{ fontSize: '1.2rem', padding: '5px 16px' }}>{o.code}</span>
            <span>{ORDER_TYPE_LABEL[o.type]}</span>
          </span>
        }
        sub={
          <span className="row" style={{ gap: 8 }}>
            <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
            {archived && <Badge tone="steel">Archivada</Badge>}
            <span className="row" style={{ gap: 5 }}>
              <CalendarDays size={15} aria-hidden />{fmtDate(o.scheduled_date)}
            </span>
            {o.project && <Link to={`/admin/proyectos/${o.project.id}`}>{o.project.code}</Link>}
            {o.project?.client && (
              <Link to={`/admin/clientes/${o.project.client.id}`}>{o.project.client.name}</Link>
            )}
          </span>
        }
        actions={<>
          <Link className="btn" to={`/admin/ordenes/${o.id}/editar`}><Pencil />Editar</Link>
          <button className="btn" onClick={toggleArchive}>
            {archived ? <><ArchiveRestore />Recuperar</> : <><Archive />Archivar</>}
          </button>
        </>}
      />

      <div className="stack" style={{ marginBottom: 16 }}>
        {archived && (
          <Alert kind="warn">
            Orden archivada: no aparece en los listados ni en el móvil. Todo su contenido se conserva.
          </Alert>
        )}

        {o.status === 'realizada' && !archived && (
          <Alert kind="warn" action={
            <div className="row">
              <button className="btn btn-sm" onClick={() => setReturning(true)} disabled={busy}>
                <Undo2 />Devolver
              </button>
              <button className="btn btn-sm btn-primary" onClick={validate} disabled={busy}>
                <CheckCircle2 />Validar
              </button>
            </div>
          }>
            <strong>Pendiente de revisión.</strong>{' '}
            {rows.length === 1
              ? 'El parte ya está enviado.'
              : `Los ${rows.length} partes ya están enviados.`}{' '}
            Revisa las horas y las fotografías antes de validar.
          </Alert>
        )}

        {o.status === 'devuelta' && (
          <Alert kind="danger">
            <strong>Devuelta el {fmtDateTime(o.returned_at)}.</strong>
            <div style={{ marginTop: 2 }}>Motivo: {o.return_reason}</div>
          </Alert>
        )}

        {o.status === 'validada' && (
          <Alert kind="ok" action={
            !archived && (
              <button className="btn btn-sm" onClick={() => setReturning(true)} disabled={busy}>
                <Undo2 />Devolver
              </button>
            )
          }>
            Validada el {fmtDateTime(o.validated_at)}
            {o.validator ? ` por ${o.validator.full_name}` : ''}.
          </Alert>
        )}
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Panel title="Trabajo a realizar">
            <p className="pre" style={{ marginTop: 0 }}>{o.description}</p>
            <dl className="kv">
              <dt><span className="row" style={{ gap: 6 }}><FolderKanban size={15} />Proyecto</span></dt>
              <dd>
                {o.project
                  ? <Link to={`/admin/proyectos/${o.project.id}`}>{o.project.code} · {o.project.name}</Link>
                  : '—'}
              </dd>

              <dt><span className="row" style={{ gap: 6 }}><Building2 size={15} />Cliente</span></dt>
              <dd>
                {o.project?.client
                  ? <Link to={`/admin/clientes/${o.project.client.id}`}>{o.project.client.name}</Link>
                  : '—'}
              </dd>

              <dt><span className="row" style={{ gap: 6 }}><MapPin size={15} />Dirección</span></dt>
              <dd>{o.project?.address ?? '—'}</dd>

              <dt>Fecha</dt>
              <dd>{fmtDate(o.scheduled_date)} <span className="faint">· {relativeDay(o.scheduled_date)}</span></dd>

              <dt>Horas previstas</dt><dd className="num">{fmtHours(o.planned_hours)}</dd>
              <dt>Comentarios de administración</dt><dd className="pre">{o.admin_notes ?? '—'}</dd>
              <dt>Última modificación</dt><dd>{fmtDateTime(o.updated_at)}</dd>
            </dl>
          </Panel>

          <Panel title={<span className="row" style={{ gap: 7 }}><Users size={17} />Partes de trabajo</span>}>
            {parts.loading && !parts.data ? <Loading />
              : !rows.length ? (
                <Empty title="Sin trabajadores asignados">
                  Asigna a quien tenga que hacerla desde «Editar».
                </Empty>
              ) : (
                <>
                  <div className="figure-row" style={{ marginBottom: 14 }}>
                    <span className="figure"><b>{fmtHours(o.planned_hours)}</b><span>Previstas</span></span>
                    <span className="figure"><b>{fmtHours(realHours)}</b><span>Reales</span></span>
                    <span className="figure"><b>{sent} de {rows.length}</b><span>Partes enviados</span></span>
                  </div>

                  <ul className="part-list">
                    {rows.map((p) => (
                      <li key={p.worker_id}>
                        <div className="part-head">
                          <strong>{p.worker?.full_name ?? 'Trabajador'}</strong>
                          <span className="row" style={{ gap: 8 }}>
                            <span className="num">{p.hours != null ? fmtHours(p.hours) : '—'}</span>
                            {p.submitted_at
                              ? <Badge tone="green">Enviado</Badge>
                              : <Badge tone="neutral">Pendiente</Badge>}
                          </span>
                        </div>
                        <p className="pre" style={{ margin: '6px 0 0' }}>
                          {p.work_done ?? <span className="faint">Todavía no ha escrito el trabajo realizado.</span>}
                        </p>
                        {p.submitted_at && (
                          <div className="faint" style={{ marginTop: 4 }}>
                            Enviado el {fmtDateTime(p.submitted_at)}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
          </Panel>

          <HistoryPanel entityCode={o.code} reloadKey={String(historyKey)} />
        </div>

        <div className="stack">
          <DocumentsPanel owner={{ orderId: o.id }} title="Fotografías, firma y documentos" />
          <CommentsPanel owner={{ orderId: o.id }} reloadKey={String(historyKey)} />
        </div>
      </div>

      {returning && (
        <Modal
          title="Devolver la orden"
          onClose={() => setReturning(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setReturning(false)} disabled={busy}>Cancelar</button>
              <button className="btn btn-primary" onClick={doReturn} disabled={busy || !reason.trim()}>
                <Undo2 />{busy ? 'Devolviendo…' : 'Devolver'}
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            La orden {o.code} volverá al móvil de los trabajadores para que la corrijan.
            El motivo es obligatorio: lo verán ellos y queda en el historial.
          </p>
          <label htmlFor="ot-reason" className="label">Motivo de la devolución</label>
          <textarea id="ot-reason" className="textarea" rows={3} value={reason}
                    placeholder="Por ejemplo: faltan las fotografías de los marcos soldados."
                    onChange={(e) => setReason(e.target.value)} />
        </Modal>
      )}
    </>
  );
}
