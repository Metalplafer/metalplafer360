import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive, ArchiveRestore, ArrowLeft, Boxes, Building2, Check, FolderKanban, MapPin,
  Pencil, Plus, Trash2,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Badge, Field, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { CommentsPanel } from '@/components/shared/CommentsPanel';
import { HistoryPanel } from '@/components/shared/HistoryPanel';
import { BILLING_LABEL, BILLING_TONE, PHASE_LABEL, PHASE_TONE } from '@/config/constants';
import { estiloDeObra, normalizaHex } from '@/lib/colores';
import { fmtDate, fmtEur } from '@/lib/format';
import { RangoFechas } from '@/components/shared/RangoFechas';
import { WorkDocumentsPanel } from '@/components/shared/WorkDocumentsPanel';
import {
  archiveWork, deleteWork, deleteWorkExtra, getWork, listWorkExtras, saveWorkExtra,
  setProjectInvoiced, setProjectWork, setWorkColor, setWorkDates, setWorkExtraInvoiced,
  workProjects, workSummary,
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
  // FASE 1.3 · El periodo propio de la obra en el calendario.
  const [editandoPeriodo, setEditandoPeriodo] = useState(false);
  const [periodo, setPeriodo] = useState({ desde: '', hasta: '' });

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

  /**
   * FASE 1.3 · Abrir el editor del periodo.
   *
   * Si la obra no tiene fechas propias, se parte de las que está usando
   * ahora —las de sus proyectos—, que es el punto de partida razonable
   * para ajustarlas.
   */
  function abrirPeriodo() {
    setPeriodo({
      desde: o.cal_start ?? c?.desde ?? '',
      hasta: o.cal_end ?? c?.hasta ?? '',
    });
    setEditandoPeriodo(true);
  }

  /** Guardar el periodo, o quitarlo si se dejan las dos fechas en blanco. */
  async function guardarPeriodo() {
    const desde = periodo.desde || null;
    const hasta = periodo.hasta || null;
    if ((desde === null) !== (hasta === null)) {
      toast.error(new Error('Escribe las dos fechas, o deja las dos en blanco para que '
        + 'la obra siga a sus proyectos.'));
      return;
    }
    setSaving(true);
    try {
      await setWorkDates(id, desde, hasta);
      toast.success(desde
        ? 'Periodo de la obra guardado'
        : 'La obra vuelve a seguir las fechas de sus proyectos');
      setEditandoPeriodo(false);
      recargar();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  /**
   * FASE 3.4 · Marcar o desmarcar un coste extra como facturado.
   *
   * Desmarcar se avisa, porque resta del total facturado de la obra y
   * eso cambia una cifra que alguien puede estar usando.
   */
  async function alternarExtraFacturado(x: WorkExtra) {
    if (x.invoiced) {
      const ok = await confirm({
        title: 'Quitar la marca de facturado',
        message: (
          <>
            «{x.concept}» ({fmtEur(x.amount)}) dejará de contar como facturado y volverá
            a sumar al pendiente de facturar de la obra.
          </>
        ),
        confirmLabel: 'Quitar la marca',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await setWorkExtraInvoiced(x.id, !x.invoiced);
      toast.success(x.invoiced
        ? `«${x.concept}» vuelve a estar pendiente de facturar`
        : `«${x.concept}» queda facturado`);
      recargar();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

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

  /*
    MEJORA 1 · EL COLOR DE LA OBRA.

    Se guarda en cuanto se suelta el selector, sin botón de guardar: es
    un solo campo y el resultado se ve al momento en la pastilla de al
    lado. Si falla, se avisa y se recarga para que la pantalla no se
    quede enseñando un color que no se ha guardado.
  */
  async function cambiarColor(color: string | null) {
    try {
      await setWorkColor(o.id, color);
      recargar();
    } catch (e) { toast.error(e); recargar(); }
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
        title={<><span className="plate" style={estiloDeObra(o.color)}>{o.code}</span> {o.name}</>}
        sub={<>
          {o.client?.name ?? 'Sin cliente'}
          {o.address ? <> · <MapPin size={13} aria-hidden /> {o.address}</> : null}
        </>}
        actions={
          <span className="row" style={{ gap: 8 }}>
            {/*
              MEJORA 1 · El color de la obra, con el mismo selector que
              los colores del calendario en Configuración: el del
              navegador más el texto, para quien prefiera escribirlo.
              «Quitar» lo deja sin color y sus proyectos vuelven a la
              pastilla de siempre.
            */}
            <span className="row" style={{ gap: 6, alignItems: 'center' }}>
              <label className="sr-only" htmlFor="obra-color">Color de la obra</label>
              <input id="obra-color" type="color" className="color-input"
                     value={normalizaHex(o.color ?? '') ?? '#1a2433'}
                     aria-label={`Color de la obra ${o.code}`}
                     onChange={(e) => cambiarColor(e.target.value)} />
              {o.color && (
                <button className="btn btn-sm btn-ghost" onClick={() => cambiarColor(null)}>
                  Quitar color
                </button>
              )}
            </span>
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

      {/* ============ FASE 1.3 · EL PERIODO EN EL CALENDARIO ============ */}
      <Panel
        title="Periodo en el calendario"
        actions={!archivada && !editandoPeriodo && (
          <button className="btn btn-sm" disabled={saving} onClick={abrirPeriodo}
                  aria-label="Editar el periodo de la obra en el calendario">
            <Pencil />Editar periodo
          </button>
        )}
      >
        <dl className="kv tight">
          <dt>Ocupa</dt>
          <dd>
            {c?.desde
              ? <>
                  {fmtDate(c.desde)}
                  {c.hasta && c.hasta !== c.desde ? ` → ${fmtDate(c.hasta)}` : ''}
                  {' '}
                  {o.cal_start
                    ? <Badge tone="amber">Puesto a mano</Badge>
                    : <Badge tone="neutral">Según sus proyectos</Badge>}
                </>
              : <span className="muted">
                  Todavía no ocupa nada: ni la obra tiene fechas propias ni sus proyectos
                  están planificados.
                </span>}
          </dd>
        </dl>

        {editandoPeriodo ? (
          <RangoFechas
            id="obra-periodo"
            desde={periodo.desde}
            hasta={periodo.hasta}
            onDesde={(v) => setPeriodo((p) => ({ ...p, desde: v }))}
            onHasta={(v) => setPeriodo((p) => ({ ...p, hasta: v }))}
            onGuardar={guardarPeriodo}
            onCancelar={() => setEditandoPeriodo(false)}
            guardando={saving}
            etiquetaDesde="Empieza"
            etiquetaHasta="Acaba"
            ayuda={
              <>
                Se guarda lo que escribas, sin comprobar si hay otras obras esos días.
                Deja las dos en blanco para que la obra vuelva a ocupar del primer al
                último día de sus proyectos.
              </>
            }
          />
        ) : (
          <p className="hint" style={{ marginBottom: 0 }}>
            Es la barra que se ve en el calendario. Si no le pones fechas propias, va del
            primer día al último de sus proyectos. Los proyectos no se mueven: cada uno
            mantiene su fabricación y su montaje.
          </p>
        )}
      </Panel>

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
              a mano: los proyectos en la tabla de abajo y los costes extra uno a uno.
              {Number(c?.extras ?? 0) > 0 && (
                <> De los {fmtEur(c?.extras ?? 0)} de costes extra,{' '}
                  <strong>{fmtEur(c?.extras_facturados ?? 0)}</strong> ya están facturados
                  {Number(c?.extras_pendientes ?? 0) > 0
                    ? <> y quedan {fmtEur(c?.extras_pendientes ?? 0)} por facturar.</>
                    : <>.</>}
                </>
              )}
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
                      {x.invoiced && x.invoiced_on && (
                        <small>Facturado el {fmtDate(x.invoiced_on)}</small>
                      )}
                    </span>
                    <span className="num">{fmtEur(x.amount)}</span>
                    {/* FASE 3.4 · Se marca a mano, y se puede desmarcar.
                        Solo lo marcado suma al facturado de la obra. */}
                    <button className="btn btn-sm"
                            disabled={saving || archivada}
                            aria-pressed={x.invoiced}
                            onClick={() => alternarExtraFacturado(x)}
                            title={x.invoiced
                              ? 'Está facturado. Pulsa para quitarle la marca.'
                              : 'Marcar como facturado para que sume al total facturado'}>
                      {x.invoiced
                        ? <><Check />Facturado</>
                        : <>Por facturar</>}
                    </button>
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

          {/* FASE 3.5 · La documentación de la obra: la suya y la de sus
              proyectos, en una sola lista y sin duplicar archivos. */}
          <WorkDocumentsPanel workId={o.id} onChange={recargar} />

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
