import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Archive, ArchiveRestore, ArrowLeft, Boxes, Building2, CheckCircle2, ClipboardList,
  FileStack, Lightbulb, MapPin, Pencil, Plus, RotateCcw,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Badge, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { PhaseRail } from '@/components/ui/PhaseRail';
import { DocumentsPanel } from '@/components/shared/DocumentsPanel';
import { CommentsPanel } from '@/components/shared/CommentsPanel';
import { HistoryPanel } from '@/components/shared/HistoryPanel';
import {
  changePhase, finalizeProject, getProject, phaseSuggestion, reopenProject,
  setBillingStatus, setSubstatuses, updateProject,
} from '@/services/projects';
import {
  BILLING_LABEL, BILLING_STATUSES, BILLING_TONE, PHASE_LABEL, PHASE_TONE, SUBSTATUSES,
} from '@/config/constants';
import { listOrders } from '@/services/orders';
import { listMaterials, setReceived } from '@/services/materials';
import { billing } from '@/services/billing';
import { ORDER_STATUS_SHORT, ORDER_STATUS_TONE, ORDER_TYPE_LABEL } from '@/config/constants';
import { fmtDate, fmtDateTime, fmtEur, fmtHours, fmtNumber, todayMadrid } from '@/lib/format';
import type { BillingStatus, ProjectPhase } from '@/types/db';

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const { toast, confirm } = useDialogs();

  const [saving, setSaving] = useState(false);
  // Se incrementa tras cada acción para volver a pedir los datos dependientes.
  const [historyKey, setHistoryKey] = useState(0);

  const project = useAsync(() => getProject(id), [id]);
  const suggestion = useAsync(() => phaseSuggestion(id), [id, project.data?.phase, project.data?.billing_status]);
  const orders = useAsync(() => listOrders({ projectId: id, pageSize: 50 }), [id, historyKey]);
  const materials = useAsync(() => listMaterials({ projectId: id, state: 'todos' }), [id, historyKey]);
  const money = useAsync(() => billing(id), [id, historyKey]);

  if (project.loading && !project.data) return <Loading />;
  if (project.error) return <ErrorBox message={project.error} onRetry={project.reload} />;
  if (!project.data) return null;

  const p = project.data;
  const archived = Boolean(p.archived_at);
  const finished = p.phase === 'finalizado';
  const locked = archived || finished;
  const active = new Set((p.substatuses ?? []).filter((s) => s.phase === p.phase).map((s) => s.substatus));

  async function reload() {
    await project.reload();
    await suggestion.reload();
    setHistoryKey((n) => n + 1);
  }

  async function toPhase(next: ProjectPhase) {
    const ok = await confirm({
      title: `Pasar a ${PHASE_LABEL[next]}`,
      message: <>El proyecto {p.code} pasará de <strong>{PHASE_LABEL[p.phase]}</strong> a{' '}
        <strong>{PHASE_LABEL[next]}</strong>. Los subestados de la fase actual se borrarán.</>,
      confirmLabel: `Pasar a ${PHASE_LABEL[next]}`,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await changePhase(p.id, next);
      toast.success(`Proyecto en ${PHASE_LABEL[next]}`);
      await reload();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  async function toggleSubstatus(key: string) {
    const next = active.has(key)
      ? [...active].filter((s) => s !== key)
      : [...active, key];
    setSaving(true);
    try {
      await setSubstatuses(p.id, next);
      await reload();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  async function toggleNoAssembly() {
    const next = !p.no_assembly;
    if (next) {
      const ok = await confirm({
        title: 'Marcar «Sin montaje»',
        message: <>Este proyecto no llevará montaje: de Fabricación pasará directamente a Facturación.</>,
        confirmLabel: 'Marcar sin montaje',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await updateProject(p.id, { no_assembly: next });
      toast.success(next ? 'Marcado como «Sin montaje»' : 'Vuelve a llevar montaje');
      await reload();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  async function changeBilling(status: BillingStatus) {
    setSaving(true);
    try {
      await setBillingStatus(p.id, status);
      toast.success(`Facturación: ${BILLING_LABEL[status]}`);
      await reload();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  async function finalize() {
    const ok = await confirm({
      title: 'Finalizar proyecto',
      message: <>El proyecto {p.code} quedará cerrado con la fecha de hoy. Se podrá reabrir si hiciera falta.</>,
      confirmLabel: 'Finalizar proyecto',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await finalizeProject(p.id);
      toast.success('Proyecto finalizado');
      await reload();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  async function reopen() {
    const ok = await confirm({
      title: 'Reabrir proyecto',
      message: <>El proyecto volverá a la fase de Facturación.</>,
      confirmLabel: 'Reabrir',
    });
    if (!ok) return;
    try { await reopenProject(p.id); toast.success('Proyecto reabierto'); await reload(); }
    catch (e) { toast.error(e); }
  }

  async function toggleArchive() {
    const ok = await confirm({
      title: archived ? 'Recuperar proyecto' : 'Archivar proyecto',
      message: archived
        ? <>El proyecto {p.code} volverá a los listados.</>
        : <>El proyecto {p.code} desaparecerá de los listados, pero no se borra: conserva documentos e historial.</>,
      confirmLabel: archived ? 'Recuperar' : 'Archivar',
      danger: !archived,
    });
    if (!ok) return;
    try {
      await updateProject(p.id, { archived_at: archived ? null : new Date().toISOString() });
      toast.success(archived ? 'Proyecto recuperado' : 'Proyecto archivado');
      await reload();
    } catch (e) { toast.error(e); }
  }

  const subs = SUBSTATUSES[p.phase];

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to="/admin/proyectos" style={{ marginBottom: 10 }}>
        <ArrowLeft />Proyectos
      </Link>

      <PageHeader
        title={
          <span className="ficha-head">
            <span className="plate plate-dark" style={{ fontSize: '1.2rem', padding: '5px 16px' }}>{p.code}</span>
            <span>{p.name}</span>
          </span>
        }
        sub={
          <span className="row" style={{ gap: 8 }}>
            <Badge tone={PHASE_TONE[p.phase]}>{PHASE_LABEL[p.phase]}</Badge>
            {(p.phase === 'facturacion' || finished) && (
              <Badge tone={BILLING_TONE[p.billing_status]}>{BILLING_LABEL[p.billing_status]}</Badge>
            )}
            {p.no_assembly && <Badge tone="neutral" plain>Sin montaje</Badge>}
            {archived && <Badge tone="steel">Archivado</Badge>}
            {p.client && <Link to={`/admin/clientes/${p.client.id}`}>{p.client.name}</Link>}
            <span className="faint">Creado el {fmtDate(p.created_at)}</span>
          </span>
        }
        actions={<>
          <Link className="btn" to={`/admin/proyectos/${p.id}/editar`}><Pencil />Editar</Link>
          <button className="btn" onClick={toggleArchive}>
            {archived ? <><ArchiveRestore />Recuperar</> : <><Archive />Archivar</>}
          </button>
        </>}
      />

      <div className="stack" style={{ marginBottom: 16 }}>
        {archived && (
          <Alert kind="warn">
            Este proyecto está archivado: no aparece en los listados y no se puede cambiar de fase.
            Todo su contenido se conserva.
          </Alert>
        )}

        {finished && (
          <Alert kind="ok" action={<button className="btn btn-sm" onClick={reopen}><RotateCcw />Reabrir</button>}>
            Proyecto finalizado el {fmtDate(p.finished_at)}.
          </Alert>
        )}

        {/* El botón de finalizar vive en el panel «Situación», uno solo:
            aquí el aviso solo cuenta lo que se puede hacer. */}
        {suggestion.data && !locked && (
          <Alert kind="warn">
            <span className="row" style={{ gap: 8 }}>
              <Lightbulb size={17} aria-hidden />{suggestion.data.message}
            </span>
          </Alert>
        )}
      </div>

      <div className="stack" style={{ marginBottom: 16 }}>
        <PhaseRail phase={p.phase} onChange={toPhase} disabled={saving || locked} />
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Panel title={`Situación · ${PHASE_LABEL[p.phase]}`}>
            <div className="stack">
              {subs.length > 0 ? (
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>
                    Subestados (puedes marcar varios a la vez)
                  </div>
                  <div className="substatus-grid">
                    {subs.map((s) => (
                      <button key={s.key} type="button" className="chip"
                              aria-pressed={active.has(s.key)} disabled={saving || locked}
                              onClick={() => toggleSubstatus(s.key)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : p.phase === 'facturacion' ? (
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Estado de facturación</div>
                  <div className="status-flow" role="group" aria-label="Estado de facturación">
                    {BILLING_STATUSES.map((b) => (
                      <button key={b} aria-current={b === p.billing_status} disabled={saving || locked}
                              onClick={() => changeBilling(b)}>
                        {BILLING_LABEL[b]}
                      </button>
                    ))}
                  </div>
                  <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
                    Los cobros parciales con importes llegarán con el módulo de Facturación.
                  </p>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Esta fase no tiene subestados.</p>
              )}

              {(p.phase === 'fabricacion' || p.phase === 'montaje' || p.no_assembly) && !locked && (
                <label className="checkbox">
                  <input type="checkbox" checked={p.no_assembly} disabled={saving}
                         onChange={toggleNoAssembly} />
                  Sin montaje · de Fabricación se pasa directamente a Facturación
                </label>
              )}

              {p.phase === 'facturacion' && !locked && (
                <div>
                  <button className="btn btn-primary" onClick={finalize}
                          disabled={saving || p.billing_status !== 'cobrado'}>
                    <CheckCircle2 />Finalizar proyecto
                  </button>
                  {p.billing_status !== 'cobrado' && (
                    <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
                      Se activa cuando el proyecto está cobrado. Nunca se finaliza solo.
                    </p>
                  )}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="El trabajo">
            <dl className="kv">
              <dt><span className="row" style={{ gap: 6 }}><Building2 size={15} />Cliente</span></dt>
              <dd>
                {p.client ? <Link to={`/admin/clientes/${p.client.id}`}>{p.client.name}</Link> : '—'}
                {p.contact && <div className="faint">Contacto: {p.contact.name}</div>}
              </dd>

              <dt><span className="row" style={{ gap: 6 }}><MapPin size={15} />Dirección del proyecto</span></dt>
              <dd>
                {p.address ?? '—'}
                {p.client?.address && p.address && p.address !== p.client.address && (
                  <div className="faint">Dirección del cliente: {p.client.address}</div>
                )}
              </dd>

              <dt>Descripción</dt><dd className="pre">{p.description ?? '—'}</dd>
              <dt>Medidas</dt><dd>{p.measures ?? '—'}</dd>
              <dt>Acabado</dt><dd>{p.finish ?? '—'}</dd>
              <dt>Ubicación</dt><dd>{p.location ?? '—'}</dd>
              <dt>Observaciones</dt><dd className="pre">{p.observations ?? '—'}</dd>

              {p.source && (
                <>
                  <dt><span className="row" style={{ gap: 6 }}><FileStack size={15} />Viene de</span></dt>
                  <dd><Link to={`/admin/fichas/${p.source.id}`}>{p.source.code}</Link></dd>
                </>
              )}

              <dt>Última modificación</dt><dd>{fmtDateTime(p.updated_at)}</dd>
            </dl>
          </Panel>

          <Panel title="Presupuesto y horas previstas">
            <div className="figure-row">
              <span className="figure"><b>{fmtEur(p.budget_amount)}</b><span>Presupuesto</span></span>
              <span className="figure"><b>{fmtEur(p.advance_amount)}</b><span>Anticipo</span></span>
              <span className="figure"><b>{fmtHours(p.budget_hours_fab)}</b><span>Fabricación prevista</span></span>
              <span className="figure"><b>{fmtHours(p.budget_hours_mont)}</b><span>Montaje previsto</span></span>
            </div>
            <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
              Las horas reales de cada persona se apuntan en las órdenes de trabajo.
            </p>
          </Panel>

          <HistoryPanel entityCode={p.code} reloadKey={String(historyKey)} />
        </div>

        <div className="stack">
          <DocumentsPanel owner={{ projectId: p.id }} title="Documentos, fotografías y vídeos" />
          <CommentsPanel owner={{ projectId: p.id }} />

          <Panel
            title="Órdenes de trabajo"
            actions={!locked && (
              <Link className="btn btn-sm" to={`/admin/ordenes/nueva?proyecto=${p.id}`}>
                <Plus />Nueva orden
              </Link>
            )}
          >
            {orders.loading && !orders.data ? <Loading />
              : !orders.data?.rows.length ? (
                <p className="muted row" style={{ margin: 0, gap: 8 }}>
                  <ClipboardList size={17} aria-hidden />
                  Este proyecto todavía no tiene órdenes de fabricación ni de montaje.
                </p>
              ) : (
                <ul className="mini-list">
                  {orders.data.rows.map((o) => (
                    <li key={o.id}>
                      <Link to={`/admin/ordenes/${o.id}`}>
                        <span className="plate">{o.code}</span>
                        <span className="cell-main">
                          <strong>{ORDER_TYPE_LABEL[o.type]} · {fmtDate(o.scheduled_date)}</strong>
                          <small>{o.description.slice(0, 60)}</small>
                        </span>
                      </Link>
                      <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_SHORT[o.status]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
          </Panel>

          <Panel
            title="Material"
            actions={<Link className="btn btn-sm" to="/admin/material"><Boxes />Ver todo</Link>}
          >
            {materials.loading && !materials.data ? <Loading />
              : !materials.data?.rows.length ? (
                <p className="muted row" style={{ margin: 0, gap: 8 }}>
                  <Boxes size={17} aria-hidden />
                  Este proyecto no tiene material anotado.
                </p>
              ) : (
                <ul className="mini-list">
                  {materials.data.rows.map((m) => {
                    const late = !m.received && m.expected_on && m.expected_on < todayMadrid();
                    return (
                      <li key={m.id}>
                        <label className="checkbox" style={{ margin: 0 }}>
                          <input type="checkbox" checked={m.received}
                                 aria-label={`Marcar ${m.name} como recibido`}
                                 onChange={async () => {
                                   try { await setReceived(m.id, !m.received); await reload(); }
                                   catch (e) { toast.error(e); }
                                 }} />
                        </label>
                        <span className="cell-main" style={{ flex: 1 }}>
                          <strong>{m.units != null ? `${fmtNumber(m.units)} · ` : ''}{m.name}</strong>
                          <small>
                            {m.supplier ?? 'Sin proveedor'}
                            {m.expected_on ? ` · previsto ${fmtDate(m.expected_on)}` : ''}
                          </small>
                        </span>
                        {m.received
                          ? <Badge tone="green">Recibido</Badge>
                          : late ? <Badge tone="red">Retrasado</Badge>
                          : <Badge tone="amber">Pendiente</Badge>}
                      </li>
                    );
                  })}
                </ul>
              )}
          </Panel>

          <Panel
            title="Cobros"
            actions={<Link className="btn btn-sm" to="/admin/facturacion">Facturación</Link>}
          >
            <div className="figure-row">
              <span className="figure"><b>{fmtEur(money.data?.total ?? p.budget_amount)}</b><span>Total</span></span>
              <span className="figure"><b>{fmtEur(money.data?.cobrado ?? 0)}</b><span>Cobrado</span></span>
              <span className="figure"><b>{fmtEur(money.data?.pendiente ?? p.budget_amount)}</b><span>Pendiente</span></span>
            </div>
            <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
              El pendiente se calcula solo: total − cobrado. Los cobros se apuntan en Facturación.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
