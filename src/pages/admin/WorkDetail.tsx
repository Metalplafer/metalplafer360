import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive, ArchiveRestore, ArrowLeft, Boxes, Building2, FolderKanban, MapPin, Pencil,
  Plus, Trash2,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Badge, Field, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { CommentsPanel } from '@/components/shared/CommentsPanel';
import { HistoryPanel } from '@/components/shared/HistoryPanel';
import { BILLING_LABEL, BILLING_TONE, PHASE_LABEL, PHASE_TONE } from '@/config/constants';
import { fmtDate, fmtEur } from '@/lib/format';
import {
  archiveWork, deleteWork, deleteWorkExtra, getWork, listWorkExtras, saveWorkExtra,
  setProjectInvoiced, setProjectWork, workProjects, workSummary,
} from '@/services/works';
import type { WorkExtra } from '@/types/db';

/**
 * LA PANTALLA DE LA OBRA.
 *
 * Aquí se ve de un vistazo en qué está cada proyecto y qué se ha
 * facturado. Las cuentas son las que se pidieron y ninguna más:
 *
 *     total de proyectos  +  extras  =  total estimado
 *     facturado    →  lo que se ha facturado de verdad
 *     pendiente    →  total estimado − facturado
 *
 * La facturación es MANUAL: la marca administración proyecto a proyecto.
 */
export default function WorkDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useDialogs();

  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [extraEditando, setExtraEditando] = useState<WorkExtra | 'nuevo' | null>(null);
  const [extra, setExtra] = useState({ concept: '', amount: '', notes: '' });

  const obra = useAsync(() => getWork(id), [id, reloadKey]);
  const cuentas = useAsync(() => workSummary(id), [id, reloadKey]);
  const proyectos = useAsync(() => workProjects(id), [id, reloadKey]);
  const extras = useAsync(() => listWorkExtras(id), [id, reloadKey]);
  const recargar = () => setReloadKey((n) => n + 1);

  if (obra.loading && !obra.data) return <Loading />;
  if (obra.error) return <ErrorBox message={obra.error} onRetry={obra.reload} />;
  if (!obra.data) return null;

  const o = obra.data;
  const c = cuentas.data;
  const archivada = Boolean(o.archived_at);

  async function guardarExtra() {
    const importe = Number(extra.amount.replace(',', '.'));
    if (!extra.concept.trim()) { toast.error(new Error('Escribe de qué es el coste extra.')); return; }
    if (Number.isNaN(importe)) { toast.error(new Error('El importe no es un número.')); return; }
    setSaving(true);
    try {
      await saveWorkExtra({
        id: extraEditando === 'nuevo' ? null : extraEditando?.id,
        workId: id,
        concept: extra.concept,
        amount: importe,
        notes: extra.notes || null,
      });
      toast.success(extraEditando === 'nuevo' ? 'Coste extra añadido' : 'Coste extra guardado');
      setExtraEditando(null);
      recargar();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  async function quitarExtra(x: WorkExtra) {
    const ok = await confirm({
      title: 'Quitar el coste extra',
      message: <>«{x.concept}» de {fmtEur(x.amount)} dejará de contar en el total de la obra.</>,
      confirmLabel: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    try { await deleteWorkExtra(x.id); toast.success('Coste extra quitado'); recargar(); }
    catch (e) { toast.error(e); }
  }

  /** Marcar o desmarcar un proyecto como facturado. */
  async function alternarFacturado(proyecto: { id: string; code: string;
    budget_amount: number | null; invoiced_amount: number | null }) {
    const facturado = proyecto.invoiced_amount != null;
    const ok = await confirm({
      title: facturado ? 'Quitar la marca de facturado' : 'Marcar como facturado',
      message: facturado
        ? <>{proyecto.code} volverá a contar como pendiente de facturar.</>
        : (
          <>
            Se dará {proyecto.code} por facturado por <strong>{fmtEur(proyecto.budget_amount)}</strong>,
            que es su presupuesto. Puedes cambiar el importe después si la factura fue otra.
          </>
        ),
      confirmLabel: facturado ? 'Quitar' : 'Marcar como facturado',
    });
    if (!ok) return;
    try {
      await setProjectInvoiced(proyecto.id, !facturado);
      toast.success(facturado ? 'Marca quitada' : 'Marcado como facturado');
      recargar();
    } catch (e) { toast.error(e); }
  }

  async function cambiarImporte(proyecto: { id: string; code: string }, valor: string) {
    const importe = Number(valor.replace(',', '.'));
    if (Number.isNaN(importe)) return;
    try {
      await setProjectInvoiced(proyecto.id, true, importe);
      recargar();
    } catch (e) { toast.error(e); }
  }

  async function sacarProyecto(proyecto: { id: string; code: string }) {
    const ok = await confirm({
      title: 'Sacar el proyecto de la obra',
      message: <>{proyecto.code} dejará de contar en esta obra, pero NO se borra: seguirá en
        el listado de proyectos como uno más.</>,
      confirmLabel: 'Sacar de la obra',
    });
    if (!ok) return;
    try { await setProjectWork(proyecto.id, null); toast.success('Proyecto fuera de la obra'); recargar(); }
    catch (e) { toast.error(e); }
  }

  async function alternarArchivo() {
    try {
      await archiveWork(o.id, !archivada);
      toast.success(archivada ? 'Obra recuperada' : 'Obra archivada');
      recargar();
    } catch (e) { toast.error(e); }
  }

  async function eliminar() {
    const ok = await confirm({
      title: `¿Estás seguro de que quieres eliminar ${o.code}?`,
      message: (
        <>
          Se borrarán sus costes extras y sus comentarios. <strong>Los proyectos NO se
          borran</strong>: se quedan sueltos en el listado de proyectos.
          <div style={{ marginTop: 8 }}>
            Si solo quieres quitarla de los listados, <strong>archívala</strong>.
          </div>
        </>
      ),
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await deleteWork(o.id);
      toast.success(`${r.code} eliminada · ${r.proyectos_sueltos} proyecto(s) quedan sueltos`);
      navigate('/admin/obras');
    } catch (e) { toast.error(e); }
  }

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to="/admin/obras" style={{ marginBottom: 10 }}>
        <ArrowLeft />Obras
      </Link>

      <PageHeader
        title={<><span className="plate">{o.code}</span> {o.name}</>}
        sub={<>
          {o.client?.name ?? 'Sin cliente'}
          {o.address ? <> · <MapPin size={13} aria-hidden /> {o.address}</> : null}
        </>}
        actions={
          <span className="row" style={{ gap: 8 }}>
            <Link className="btn" to={`/admin/obras/${o.id}/editar`}><Pencil />Editar</Link>
            <button className="btn" onClick={alternarArchivo}>
              {archivada ? <><ArchiveRestore />Recuperar</> : <><Archive />Archivar</>}
            </button>
            <button className="btn btn-danger" onClick={eliminar}><Trash2 />Eliminar</button>
          </span>
        }
      />

      {archivada && (
        <Alert kind="warn">
          Esta obra está archivada. Sus proyectos siguen funcionando con normalidad.
        </Alert>
      )}

      {/* ===================== LAS CUENTAS ===================== */}
      <Panel title="Las cuentas de la obra">
        {cuentas.loading && !c ? <Loading /> : (
          <>
            <div className="figure-row">
              <span className="figure">
                <b>{fmtEur(c?.total_proyectos ?? 0)}</b>
                <span>Total de proyectos</span>
              </span>
              <span className="figure">
                <b>{fmtEur(c?.extras ?? 0)}</b>
                <span>Costes extras</span>
              </span>
              <span className="figure destacada">
                <b>{fmtEur(c?.total_estimado ?? 0)}</b>
                <span>Total estimado</span>
              </span>
              <span className="figure">
                <b>{fmtEur(c?.facturado ?? 0)}</b>
                <span>Facturado</span>
              </span>
              <span className="figure">
                <b>{fmtEur(c?.pendiente_facturar ?? 0)}</b>
                <span>Pendiente de facturar</span>
              </span>
            </div>
            <p className="hint" style={{ marginBottom: 0 }}>
              Total de proyectos + costes extras = total estimado. La facturación se marca
              a mano, proyecto a proyecto, en la tabla de abajo.
              {Number(c?.cobrado ?? 0) > 0 && <> Cobrado hasta ahora: {fmtEur(c?.cobrado ?? 0)}.</>}
            </p>
          </>
        )}
      </Panel>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          {/* ================= PROYECTOS ================= */}
          <Panel
            title="Proyectos de la obra"
            actions={(
              <span className="row" style={{ gap: 8 }}>
                <Link className="btn btn-sm" to={`/admin/proyectos/nuevo?obra=${o.id}`}>
                  <Plus />Nuevo proyecto
                </Link>
                <Link className="btn btn-sm" to="/admin/proyectos"><FolderKanban />Ver todos</Link>
              </span>
            )}
          >
            {proyectos.loading && !proyectos.data ? <Loading />
              : !proyectos.data?.length ? (
                <Empty title="Esta obra todavía no tiene proyectos">
                  Crea uno aquí mismo, o abre un proyecto que ya exista y elige esta obra
                  en su formulario.
                </Empty>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Proyecto</th><th>Fase</th><th>Cobro</th>
                        <th className="right">Importe</th>
                        <th>Facturado</th><th className="right">Facturado por</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {proyectos.data.map((p) => {
                        const facturado = p.invoiced_amount != null;
                        return (
                          <tr key={p.id}>
                            <td>
                              <Link to={`/admin/proyectos/${p.id}`}>
                                <span className="mono">{p.code}</span>
                              </Link>
                              <div className="muted">{p.name}</div>
                            </td>
                            <td><Badge tone={PHASE_TONE[p.phase]}>{PHASE_LABEL[p.phase]}</Badge></td>
                            <td>
                              <Badge tone={BILLING_TONE[p.billing_status]}>
                                {BILLING_LABEL[p.billing_status]}
                              </Badge>
                            </td>
                            <td className="right num">{fmtEur(p.budget_amount)}</td>
                            <td>
                              <label className="checkbox">
                                <input type="checkbox" checked={facturado}
                                       onChange={() => alternarFacturado(p)} />
                                {facturado ? 'Sí' : 'No'}
                              </label>
                            </td>
                            <td className="right num">
                              {facturado ? (
                                <input className="input" style={{ width: 110, textAlign: 'right' }}
                                       defaultValue={String(p.invoiced_amount).replace('.', ',')}
                                       onBlur={(e) => cambiarImporte(p, e.target.value)}
                                       aria-label={`Importe facturado de ${p.code}`} />
                              ) : '—'}
                              {p.invoiced_on && (
                                <div className="faint">{fmtDate(p.invoiced_on)}</div>
                              )}
                            </td>
                            <td className="right">
                              <button className="btn btn-ghost icon-btn"
                                      onClick={() => sacarProyecto(p)}
                                      aria-label={`Sacar ${p.code} de la obra`}>
                                <Trash2 />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

            {Number(c?.material_pendiente ?? 0) > 0 && (
              <p className="hint" style={{ marginBottom: 0 }}>
                <Boxes size={14} aria-hidden /> {c?.material_pendiente} material(es) pendiente(s)
                en los proyectos de esta obra. <Link to="/admin/material">Ver material</Link>
              </p>
            )}
          </Panel>

          {/* ================= EXTRAS ================= */}
          <Panel
            title="Costes extras"
            actions={(
              <button className="btn btn-sm" onClick={() => {
                setExtra({ concept: '', amount: '', notes: '' });
                setExtraEditando('nuevo');
              }}><Plus />Añadir</button>
            )}
          >
            {!extras.data?.length ? (
              <Empty title="Sin costes extras">
                Transporte, trabajos añadidos, material extraordinario… Lo que no merece un
                proyecto propio pero hay que cobrar.
              </Empty>
            ) : (
              <ul className="mini-list">
                {extras.data.map((x) => (
                  <li key={x.id}>
                    <span className="cell-main">
                      <strong>{x.concept}</strong>
                      {x.notes && <small>{x.notes}</small>}
                    </span>
                    <span className="num">{fmtEur(x.amount)}</span>
                    <button className="btn btn-ghost icon-btn"
                            onClick={() => {
                              setExtra({
                                concept: x.concept,
                                amount: String(x.amount).replace('.', ','),
                                notes: x.notes ?? '',
                              });
                              setExtraEditando(x);
                            }}
                            aria-label={`Editar ${x.concept}`}><Pencil /></button>
                    <button className="btn btn-ghost icon-btn" onClick={() => quitarExtra(x)}
                            aria-label={`Quitar ${x.concept}`}><Trash2 /></button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <HistoryPanel entityCode={o.code} reloadKey={String(reloadKey)} />
        </div>

        <div className="stack">
          <Panel title="La obra">
            <dl className="kv">
              <dt><Building2 size={14} aria-hidden /> Cliente</dt>
              <dd>{o.client?.name ?? '—'}</dd>
              <dt>Dirección</dt><dd>{o.address ?? '—'}</dd>
              {o.description && <><dt>Descripción</dt><dd className="pre">{o.description}</dd></>}
              {o.observations && (
                <><dt>Observaciones</dt><dd className="pre">{o.observations}</dd></>
              )}
              <dt>Proyectos</dt>
              <dd>
                {c?.proyectos ?? 0} en total · {c?.proyectos_activos ?? 0} en marcha ·{' '}
                {c?.proyectos_finalizados ?? 0} finalizados
              </dd>
              {c?.desde && (
                <>
                  <dt>En el calendario</dt>
                  <dd>Del {fmtDate(c.desde)} al {fmtDate(c.hasta)}</dd>
                </>
              )}
            </dl>
          </Panel>

          <CommentsPanel owner={{ workId: o.id }} reloadKey={String(reloadKey)} />
        </div>
      </div>

      {extraEditando && (
        <Modal
          title={extraEditando === 'nuevo' ? 'Nuevo coste extra' : 'Coste extra'}
          onClose={() => setExtraEditando(null)}
        >
          <Field label="¿De qué es?" htmlFor="ex-concepto">
            <input id="ex-concepto" className="input" value={extra.concept} maxLength={160}
                   placeholder="Por ejemplo: transporte y grúa"
                   onChange={(e) => setExtra((x) => ({ ...x, concept: e.target.value }))} />
          </Field>
          <Field label="Importe (€)" htmlFor="ex-importe">
            <input id="ex-importe" className="input" inputMode="decimal" value={extra.amount}
                   onChange={(e) => setExtra((x) => ({ ...x, amount: e.target.value }))} />
          </Field>
          <Field label="Notas (opcional)" htmlFor="ex-notas">
            <textarea id="ex-notas" className="input" rows={2} value={extra.notes}
                      onChange={(e) => setExtra((x) => ({ ...x, notes: e.target.value }))} />
          </Field>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn" onClick={() => setExtraEditando(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving || !extra.concept.trim()}
                    onClick={guardarExtra}>Guardar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
