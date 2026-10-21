import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive, ArchiveRestore, ArrowLeft, Boxes, Building2, CheckCircle2,
  FileStack, FileText, HardHat, Lightbulb, MapPin, Pencil, RotateCcw, Trash2,
  Users, Wand2,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Badge, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { PhaseRail } from '@/components/ui/PhaseRail';
import { DocumentsPanel } from '@/components/shared/DocumentsPanel';
import { documentPaths, removeStoredFiles } from '@/services/documents';
import { CommentsPanel } from '@/components/shared/CommentsPanel';
import { HistoryPanel } from '@/components/shared/HistoryPanel';
import {
  changePhase, deleteProject, finalizeProject, getProject, phaseSuggestion,
  projectProducts, reopenProject, setBillingStatus, setSubstatuses, updateProject,
} from '@/services/projects';
import {
  BILLING_LABEL, BILLING_STATUSES, BILLING_TONE, PHASE_LABEL, PHASE_TONE, SUBSTATUSES,
} from '@/config/constants';
import { listOrders } from '@/services/orders';
import { listMaterials, setReceived } from '@/services/materials';
import { MaterialNeedButton } from '@/components/shared/MaterialNeedButton';
import { billing } from '@/services/billing';
import { listPeople } from '@/services/people';
import { assignProjectWorkers, listReports, projectHours, projectTeam } from '@/services/partes';
import { planProject, releasePhase, setPhaseDates, setPhaseWorkers } from '@/services/calendar';
import { RangoFechas } from '@/components/shared/RangoFechas';
import { REPORT_STATUS_SHORT, REPORT_STATUS_TONE } from '@/config/constants';
import { ORDER_STATUS_SHORT, ORDER_STATUS_TONE, ORDER_TYPE_LABEL } from '@/config/constants';
import { fmtDate, fmtDateTime, fmtEur, fmtHours, fmtNumber, todayMadrid } from '@/lib/format';
import type { BillingStatus, ProjectPhase } from '@/types/db';

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const { toast, confirm } = useDialogs();
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  // Se incrementa tras cada acción para volver a pedir los datos dependientes.
  const [historyKey, setHistoryKey] = useState(0);

  const project = useAsync(() => getProject(id), [id]);
  const suggestion = useAsync(() => phaseSuggestion(id), [id, project.data?.phase, project.data?.billing_status]);
  const orders = useAsync(() => listOrders({ projectId: id, pageSize: 50 }), [id, historyKey]);
  const materials = useAsync(() => listMaterials({ projectId: id, state: 'todos' }), [id, historyKey]);
  const money = useAsync(() => billing(id), [id, historyKey]);
  // Las piezas del proyecto. Depende de «project.data?.updated_at» para
  // que al guardar los productos la ficha los enseñe ya cambiados.
  const productos = useAsync(() => projectProducts(id), [id, project.data?.updated_at]);

  // BLOQUE 1 · trabajadores asignados, partes y horas realizadas.
  const equipo = useAsync(() => projectTeam(id), [id, historyKey]);
  const personas = useAsync(() => listPeople('worker'), []);
  const partes = useAsync(() => listReports({ projectId: id, pageSize: 50 }), [id, historyKey]);
  const horas = useAsync(() => projectHours(id), [id, historyKey]);
  const [asignados, setAsignados] = useState<string[]>([]);
  const [editandoEquipo, setEditandoEquipo] = useState(false);

  // FASE 1.1 · Las fechas de una fase, escritas a mano desde aquí.
  // Se edita UNA fase a la vez, y se guarda SOLO esa: tocar la
  // fabricación no puede mover el montaje.
  const [editandoFechas, setEditandoFechas] = useState<'fabricacion' | 'montaje' | null>(null);
  const [fechas, setFechas] = useState({ desde: '', hasta: '' });

  useEffect(() => {
    setAsignados((equipo.data ?? []).map((m) => m.worker_id));
  }, [equipo.data]);

  /** Buscar hueco en el calendario para este proyecto. */
  async function planificar() {
    setSaving(true);
    try {
      await planProject(id, 'ambas');
      toast.success('Proyecto planificado');
      setHistoryKey((k) => k + 1);
      await project.reload();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  /** Devolver una fase al cálculo automático y recolocarla. */
  async function soltar(fase: 'fabricacion' | 'montaje') {
    const ok = await confirm({
      title: 'Volver a la planificación automática',
      message: (
        <>
          Esta fase está fijada a mano. Al soltarla, el sistema le buscará hueco
          respetando lo que ya está programado, los festivos y el margen configurado.
        </>
      ),
      confirmLabel: 'Soltar y recolocar',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await releasePhase(id, fase);
      toast.success('Fase recolocada');
      setHistoryKey((k) => k + 1);
      await project.reload();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  /** Abrir el editor de fechas de una fase con lo que ya tiene puesto. */
  function abrirFechas(fase: 'fabricacion' | 'montaje') {
    const p = project.data;
    if (!p) return;
    const esFab = fase === 'fabricacion';
    setFechas({
      desde: (esFab ? p.fab_start : p.mont_start) ?? '',
      hasta: (esFab ? p.fab_end : p.mont_end) ?? '',
    });
    setEditandoFechas(fase);
  }

  /**
   * Guardar las fechas de UNA fase.
   *
   * Sin inicio se entiende «quítale la fecha», que además devuelve la
   * fase al cálculo automático. No se comprueba disponibilidad: la fecha
   * que se escriba es la que se guarda.
   */
  async function guardarFechas(fase: 'fabricacion' | 'montaje') {
    const desde = fechas.desde || null;
    const hasta = desde ? (fechas.hasta || null) : null;
    setSaving(true);
    try {
      await setPhaseDates(id, fase, desde, hasta);
      toast.success(desde
        ? `Fechas de ${fase === 'fabricacion' ? 'fabricación' : 'montaje'} guardadas`
        : `${fase === 'fabricacion' ? 'La fabricación' : 'El montaje'} se queda sin fecha`);
      setEditandoFechas(null);
      setHistoryKey((k) => k + 1);
      await project.reload();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  async function cambiarEquipoFase(fase: 'fabricacion' | 'montaje', n: number) {
    setSaving(true);
    try {
      await setPhaseWorkers(id, fase, n);
      setHistoryKey((k) => k + 1);
      await project.reload();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  async function guardarEquipo() {
    setSaving(true);
    try {
      await assignProjectWorkers(id, asignados);
      toast.success('Equipo del proyecto actualizado');
      setEditandoEquipo(false);
      setHistoryKey((k) => k + 1);
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

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

  /**
   * ELIMINAR el proyecto. La base de datos se niega si tiene cobros u
   * horas ya validadas: eso es dinero y producción de verdad, y
   * borrarlo cambiaría los informes sin que nadie se entere. En ese
   * caso dice exactamente qué tiene y se enseña tal cual.
   */
  async function eliminar() {
    const ok = await confirm({
      title: `¿Estás seguro de que quieres eliminar ${p.code}?`,
      message: (
        <>
          Se borrarán también sus documentos, órdenes de trabajo, materiales y comentarios.
          Esto no se puede deshacer.
          <div style={{ marginTop: 8 }}>
            Si solo quieres quitarlo de los listados, <strong>archívalo</strong>:
            se conserva todo.
          </div>
        </>
      ),
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      const rutas = await documentPaths({ projectId: p.id });
      await deleteProject(p.id);
      await removeStoredFiles(rutas).catch(() => undefined);
      toast.success(`${p.code} se ha eliminado`);
      navigate('/admin/proyectos');
    } catch (e) { toast.error(e); }
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
          <button className="btn btn-danger" onClick={eliminar}>
            <Trash2 />Eliminar
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

              {/*
                La descripción, las medidas y el acabado son de cada
                PRODUCTO: un proyecto puede ser varias piezas. Se enseñan
                en su propio panel, más abajo.
              */}
              <dt>Ubicación</dt><dd>{p.location ?? '—'}</dd>
              <dt>Observaciones</dt><dd className="pre">{p.observations ?? '—'}</dd>

              {/* BLOQUE 4: la obra que agrupa este proyecto, si la hay. */}
              {p.work && (
                <>
                  <dt><span className="row" style={{ gap: 6 }}><HardHat size={15} />Obra</span></dt>
                  <dd>
                    <Link to={`/admin/obras/${p.work.id}`}>{p.work.code}</Link>
                    <div className="faint">{p.work.name}</div>
                  </dd>
                </>
              )}

              {p.source && (
                <>
                  <dt><span className="row" style={{ gap: 6 }}><FileStack size={15} />Viene de</span></dt>
                  <dd><Link to={`/admin/fichas/${p.source.id}`}>{p.source.code}</Link></dd>
                </>
              )}

              <dt>Última modificación</dt><dd>{fmtDateTime(p.updated_at)}</dd>
            </dl>
          </Panel>

          {/* ------------------------------------- PLANIFICACIÓN ---- */}
          <Panel
            title="Planificación"
            actions={!locked && (
              <button className="btn btn-sm" disabled={saving} onClick={planificar}>
                <Wand2 />Buscar hueco
              </button>
            )}
          >
            {(['fabricacion', 'montaje'] as const)
              .filter((fase) => !(fase === 'montaje' && p.no_assembly))
              .map((fase) => {
                const esFab = fase === 'fabricacion';
                const desde = esFab ? p.fab_start : p.mont_start;
                const hasta = esFab ? p.fab_end : p.mont_end;
                const gente = esFab ? p.fab_workers : p.mont_workers;
                const aMano = esFab ? p.fab_manual : p.mont_manual;
                const horas = esFab ? p.budget_hours_fab : p.budget_hours_mont;
                return (
                  <div key={fase} className="plan-fase">
                    <div className="row-between" style={{ gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <strong>{esFab ? 'Fabricación' : 'Montaje'}</strong>
                        <div className="muted">
                          {desde
                            ? <>
                                {fmtDate(desde)}
                                {hasta && hasta !== desde ? ` → ${fmtDate(hasta)}` : ''}
                              </>
                            : 'Sin fecha todavía'}
                        </div>
                      </div>
                      {aMano && <Badge tone="amber">Fijado a mano</Badge>}
                    </div>

                    <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                      <label className="row" style={{ gap: 6 }}>
                        <span className="muted">Van</span>
                        <select className="input" style={{ width: 70 }} value={gente}
                                disabled={locked || saving}
                                onChange={(e) => cambiarEquipoFase(fase, Number(e.target.value))}>
                          {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <span className="muted">
                          {gente === 1 ? 'persona' : 'personas'}
                        </span>
                      </label>
                      <span className="muted">
                        {fmtHours(horas)} previstas ·{' '}
                        <strong>{Math.max(1, Math.ceil(Number(horas) / Math.max(gente, 1) / 8)) }</strong>
                        {' '}{Number(horas) > 0 ? 'día(s)' : ''}
                      </span>
                      {/* FASE 1.1 · Escribir las fechas aquí mismo. */}
                      {!locked && editandoFechas !== fase && (
                        <button className="btn btn-sm" disabled={saving}
                                onClick={() => abrirFechas(fase)}
                                aria-label={esFab
                                  ? 'Editar las fechas de fabricación'
                                  : 'Editar las fechas de montaje'}>
                          <Pencil />Editar fechas
                        </button>
                      )}
                      {aMano && !locked && (
                        <button className="btn btn-sm" disabled={saving}
                                onClick={() => soltar(fase)}>
                          <RotateCcw />Soltar
                        </button>
                      )}
                    </div>

                    {editandoFechas === fase && (
                      <RangoFechas
                        id={`plan-${fase}`}
                        desde={fechas.desde}
                        hasta={fechas.hasta}
                        onDesde={(v) => setFechas((f) => ({ ...f, desde: v }))}
                        onHasta={(v) => setFechas((f) => ({ ...f, hasta: v }))}
                        onGuardar={() => guardarFechas(fase)}
                        onCancelar={() => setEditandoFechas(null)}
                        guardando={saving}
                        etiquetaDesde="Empieza"
                        etiquetaHasta="Acaba"
                        ayuda={
                          <>
                            Se guarda lo que escribas, sin comprobar si hay otro trabajo esos
                            días. Si dejas «Acaba» en blanco se calcula con las horas y la
                            gente. Si dejas las dos en blanco, la fase se queda sin fecha y
                            vuelve a la planificación automática.
                          </>
                        }
                      />
                    )}
                  </div>
                );
              })}
            <p className="hint" style={{ marginBottom: 0 }}>
              Los días salen de las horas previstas y de cuánta gente va:
              horas ÷ personas ÷ 8. «Buscar hueco» respeta lo ya programado,
              los fines de semana, los festivos y el margen entre proyectos.
              Lo que escribas a mano aquí, o muevas a mano en el calendario, no se
              vuelve a tocar. La fabricación y el montaje se guardan por separado.
            </p>
          </Panel>

          {/*
            QUÉ SE FABRICA.
            Un proyecto puede ser varias piezas, cada una con sus medidas
            y su acabado. Un proyecto que todavía no tenga productos
            guardados enseña aquí lo que ya tenía en sus columnas de
            siempre, así que nunca sale en blanco.
          */}
          <Panel title="Qué se fabrica">
            {productos.loading && !productos.data ? <Loading />
              : productos.error
                ? <ErrorBox message={productos.error} onRetry={productos.reload} />
                : (
                  <div className="stack">
                    {(productos.data ?? []).map((pr, i) => (
                      <div key={pr.id ?? `heredado-${i}`}>
                        {(productos.data ?? []).length > 1 && (
                          <strong style={{ display: 'block', marginBottom: 4 }}>
                            {pr.name?.trim() || `Producto ${i + 1}`}
                          </strong>
                        )}
                        <dl className="kv">
                          {(productos.data ?? []).length === 1 && pr.name?.trim() && (
                            <>
                              <dt>Qué es</dt><dd>{pr.name}</dd>
                            </>
                          )}
                          <dt>Descripción</dt>
                          <dd className="pre">{pr.description ?? '—'}</dd>
                          <dt>Medidas</dt><dd>{pr.measures ?? '—'}</dd>
                          <dt>Acabado</dt><dd>{pr.finish ?? '—'}</dd>
                        </dl>
                      </div>
                    ))}
                    {(productos.data ?? []).some((pr) => pr.heredado) && (
                      <p className="hint" style={{ margin: 0 }}>
                        Este proyecto se creó cuando solo se podía anotar un producto.
                        Al editarlo podrás separarlo en varias piezas.
                      </p>
                    )}
                  </div>
                )}
          </Panel>

          <Panel title="Presupuesto y horas previstas">
            <div className="figure-row">
              <span className="figure"><b>{fmtEur(p.budget_amount)}</b><span>Presupuesto</span></span>
              <span className="figure"><b>{fmtEur(p.advance_amount)}</b><span>Anticipo</span></span>
              <span className="figure"><b>{fmtHours(p.budget_hours_fab)}</b><span>Fabricación prevista</span></span>
              <span className="figure"><b>{fmtHours(p.budget_hours_mont)}</b><span>Montaje previsto</span></span>
            </div>
            <div className="figure-row" style={{ marginTop: 12 }}>
              <span className="figure">
                <b>{fmtHours(horas.data?.realizadas_fab ?? 0)}</b>
                <span>Fabricación realizada</span>
              </span>
              <span className="figure">
                <b>{fmtHours(horas.data?.realizadas_mont ?? 0)}</b>
                <span>Montaje realizado</span>
              </span>
            </div>
            <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
              Cada persona apunta SUS horas en su parte de trabajo. Solo cuentan como realizadas
              cuando administración valida el parte.
            </p>
          </Panel>

          <HistoryPanel entityCode={p.code} reloadKey={String(historyKey)} />
        </div>

        <div className="stack">
          <DocumentsPanel owner={{ projectId: p.id }} title="Documentos, fotografías y vídeos"
            onChange={() => setHistoryKey((k) => k + 1)} />
          <CommentsPanel owner={{ projectId: p.id }} />

          <Panel
            title="Quién trabaja en este proyecto"
            actions={!locked && (
              <button className="btn btn-sm" onClick={() => setEditandoEquipo((v) => !v)}>
                <Users />{editandoEquipo ? 'Cancelar' : 'Asignar'}
              </button>
            )}
          >
            {editandoEquipo ? (
              <>
                {!personas.data?.length ? (
                  <p className="muted" style={{ margin: 0 }}>
                    Todavía no hay trabajadores dados de alta.
                  </p>
                ) : (
                  <>
                    <div className="substatus-grid">
                      {personas.data.map((w) => (
                        <label key={w.id} className="checkbox">
                          <input type="checkbox" checked={asignados.includes(w.id)}
                                 onChange={() => setAsignados((prev) => (prev.includes(w.id)
                                   ? prev.filter((x) => x !== w.id)
                                   : [...prev, w.id]))} />
                          {w.full_name}
                        </label>
                      ))}
                    </div>
                    <p className="hint" style={{ marginTop: 10 }}>
                      Quien esté marcado podrá entrar en el proyecto, ver la documentación y
                      rellenar partes. No verá importes ni facturación.
                    </p>
                    <button className="btn btn-primary" disabled={saving} onClick={guardarEquipo}>
                      <CheckCircle2 />Guardar el equipo
                    </button>
                  </>
                )}
              </>
            ) : equipo.data?.length ? (
              <ul className="team-list">
                {equipo.data.map((m) => <li key={m.worker_id}>{m.full_name}</li>)}
              </ul>
            ) : (
              <p className="muted row" style={{ margin: 0, gap: 8 }}>
                <Users size={17} aria-hidden />
                Nadie asignado todavía: ningún trabajador puede entrar en este proyecto.
              </p>
            )}
          </Panel>

          <Panel title="Partes de trabajo">
            {partes.loading && !partes.data ? <Loading />
              : !partes.data?.rows.length ? (
                <p className="muted row" style={{ margin: 0, gap: 8 }}>
                  <FileText size={17} aria-hidden />
                  Todavía no hay partes de trabajo en este proyecto.
                </p>
              ) : (
                <ul className="mini-list">
                  {partes.data.rows.map((r) => (
                    <li key={r.id}>
                      <Link to={`/admin/partes/${r.id}`}>
                        <span className="plate">{r.code}</span>
                        <span className="cell-main">
                          <strong>
                            {ORDER_TYPE_LABEL[r.work_type]} · {fmtDate(r.work_date)}
                            {r.hours != null ? ` · ${fmtHours(r.hours)}` : ''}
                          </strong>
                          <small>{r.worker?.full_name ?? ''}</small>
                        </span>
                      </Link>
                      <Badge tone={REPORT_STATUS_TONE[r.status]}>
                        {REPORT_STATUS_SHORT[r.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
          </Panel>

          {/* FASE 4 · Las órdenes de trabajo son HISTÓRICO.
              Ya no se crean —el trabajo se organiza con los partes— y no
              hay pantalla a la que ir, así que no se enlazan. Pero NO se
              esconden: si este proyecto tuvo órdenes, siguen aquí a la
              vista. Si no tuvo ninguna, el panel no aparece y deja de
              ocupar sitio hablando de algo que ya no se usa. */}
          {Boolean(orders.data?.rows.length) && (
            <Panel title="Órdenes de trabajo (histórico)">
              <ul className="mini-list">
                {orders.data?.rows.map((o) => (
                  <li key={o.id}>
                    <span className="plate">{o.code}</span>
                    <span className="cell-main">
                      <strong>{ORDER_TYPE_LABEL[o.type]} · {fmtDate(o.scheduled_date)}</strong>
                      <small>{o.description.slice(0, 60)}</small>
                    </span>
                    <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_SHORT[o.status]}</Badge>
                  </li>
                ))}
              </ul>
              <p className="hint" style={{ marginBottom: 0 }}>
                Son de antes de los partes de trabajo. Se conservan para poder consultarlas;
                no se crean nuevas.
              </p>
            </Panel>
          )}

          <Panel
            title="Material"
            actions={(
              <span className="row" style={{ gap: 8 }}>
                <MaterialNeedButton className="btn btn-sm"
                                    projectId={p.id} projectLabel={`${p.code} · ${p.name}`} />
                <Link className="btn btn-sm" to="/admin/material"><Boxes />Ver todo</Link>
              </span>
            )}
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
            {Number(money.data?.anticipo ?? 0) > 0 && (
              <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
                {Number(money.data?.anticipo_cobrado ?? 0) > 0
                  ? `Incluye el anticipo: ${fmtEur(money.data?.anticipo_cobrado)} cobrados `
                    + `de los ${fmtEur(money.data?.anticipo)} previstos.`
                  : `El anticipo de ${fmtEur(money.data?.anticipo)} todavía NO está cobrado. `
                    + 'Se apunta como cobro desde Facturación.'}
              </p>
            )}
            <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
              El pendiente se calcula solo: total − cobrado. Los cobros se apuntan en Facturación.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
