import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, Check, Inbox, Pencil, Plus, Search, X } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { useDialogs } from '@/components/ui/Dialogs';
import { Modal } from '@/components/ui/Modal';
import { Badge, PageHeader, Panel, Tabs } from '@/components/ui/Layout';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { MaterialModal, draftFrom, emptyMaterial, type MaterialValues } from '@/components/shared/MaterialModal';
import {
  acceptRequest, createMaterial, discardRequest, listMaterials, listRequests,
  setReceived, updateMaterial,
} from '@/services/materials';
import { listProjects } from '@/services/projects';
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE } from '@/config/constants';
import { fmtDate, fmtDateTime, fmtNumber, todayMadrid } from '@/lib/format';
import type { Material, MaterialRequest } from '@/types/db';

type Tab = 'pendiente' | 'retrasado' | 'recibido' | 'todos' | 'avisos';

/**
 * Material pendiente.
 * Lo que comunican los trabajadores entra en la pestaña «Avisos del
 * taller» y no se convierte en material hasta que alguien lo revisa.
 */
export default function MaterialsList() {
  const { toast, confirm } = useDialogs();
  const today = todayMadrid();

  const [tab, setTab] = useState<Tab>('pendiente');
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [editing, setEditing] = useState<Material | null>(null);
  const [creating, setCreating] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [accepting, setAccepting] = useState<MaterialRequest | null>(null);
  const [discarding, setDiscarding] = useState<MaterialRequest | null>(null);
  const [note, setNote] = useState('');

  const debounced = useDebounce(search, 300);
  const projects = useAsync(() => listProjects({ phase: 'activos', pageSize: 200 }), []);

  const materials = useAsync(
    () => listMaterials({
      state: tab === 'avisos' ? 'todos' : tab,
      search: debounced,
      archived,
    }, today),
    [tab, debounced, archived, reloadKey],
  );

  const requests = useAsync(() => listRequests(), [reloadKey]);
  const pending = (requests.data ?? []).filter((r) => r.status === 'pendiente');

  const reload = () => setReloadKey((n) => n + 1);

  async function toggleReceived(m: Material) {
    try {
      await setReceived(m.id, !m.received);
      toast.success(m.received ? 'Vuelve a estar pendiente' : 'Marcado como recibido');
      reload();
    } catch (e) { toast.error(e); }
  }

  async function toggleArchive(m: Material) {
    const ok = await confirm({
      title: m.archived_at ? 'Recuperar material' : 'Archivar material',
      message: m.archived_at
        ? <>«{m.name}» volverá al listado.</>
        : <>«{m.name}» desaparecerá del listado, pero no se borra: conserva su historial.</>,
      confirmLabel: m.archived_at ? 'Recuperar' : 'Archivar',
      danger: !m.archived_at,
    });
    if (!ok) return;
    try {
      await updateMaterial(m.id, { archived_at: m.archived_at ? null : new Date().toISOString() });
      toast.success(m.archived_at ? 'Material recuperado' : 'Material archivado');
      reload();
    } catch (e) { toast.error(e); }
  }

  async function saveNew(draft: MaterialValues) {
    await createMaterial({
      project_id: projectId,
      name: draft.name.trim(),
      units: draft.units,
      supplier: draft.supplier,
      ordered_on: draft.ordered_on || null,
      expected_on: draft.expected_on || null,
      notes: draft.notes,
    });
    toast.success('Material anotado');
    setCreating(false);
    setProjectId('');
    reload();
  }

  async function saveEdit(draft: MaterialValues) {
    if (!editing) return;
    await updateMaterial(editing.id, {
      name: draft.name.trim(),
      units: draft.units,
      supplier: draft.supplier,
      ordered_on: draft.ordered_on || null,
      expected_on: draft.expected_on || null,
      notes: draft.notes,
    });
    toast.success('Material guardado');
    setEditing(null);
    reload();
  }

  async function accept(draft: MaterialValues) {
    if (!accepting) return;
    await acceptRequest(accepting.id, {
      name: draft.name.trim(),
      units: draft.units,
      supplier: draft.supplier || null,
      orderedOn: draft.ordered_on || null,
      expectedOn: draft.expected_on || null,
      notes: draft.notes || null,
    });
    toast.success('Material anotado a partir del aviso');
    setAccepting(null);
    reload();
  }

  async function discard() {
    if (!discarding) return;
    try {
      await discardRequest(discarding.id, note);
      toast.success('Aviso descartado');
      setDiscarding(null);
      setNote('');
      reload();
    } catch (e) { toast.error(e); }
  }

  const rows = materials.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="Material pendiente"
        sub="Qué falta, a quién se pidió y cuándo debería llegar."
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus />Nuevo material
          </button>
        }
      />

      <section className="panel">
        <Tabs
          value={tab}
          onChange={(k) => setTab(k)}
          tabs={[
            { key: 'pendiente' as const, label: 'Pendiente' },
            { key: 'retrasado' as const, label: 'Retrasado' },
            { key: 'recibido' as const, label: 'Recibido' },
            { key: 'todos' as const, label: 'Todos' },
            { key: 'avisos' as const, label: 'Avisos del taller', count: pending.length },
          ]}
        />

        {tab === 'avisos' ? (
          <div className="panel-body">
            <p className="hint" style={{ marginTop: 0 }}>
              Lo que comunican los trabajadores desde la obra. <strong>No se convierte en material
              hasta que lo revisas aquí</strong>: al aceptarlo se rellenan proveedor y fechas.
            </p>

            {requests.loading && !requests.data ? <Loading />
              : !requests.data?.length ? (
                <Empty title="Sin avisos del taller" icon={<Inbox aria-hidden />}>
                  Cuando un trabajador comunique que falta material, aparecerá aquí.
                </Empty>
              ) : (
                <ul className="request-list">
                  {requests.data.map((r) => (
                    <li key={r.id}>
                      <div className="request-head">
                        <strong>{r.worker?.full_name ?? 'Un trabajador'}</strong>
                        <Badge tone={REQUEST_STATUS_TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
                      </div>
                      <p className="pre" style={{ margin: '6px 0' }}>{r.body}</p>
                      <div className="faint">
                        {fmtDateTime(r.created_at)}
                        {r.order && <> · <Link to={`/admin/ordenes/${r.order.id}`}>{r.order.code}</Link></>}
                        {r.project && <> · <Link to={`/admin/proyectos/${r.project.id}`}>{r.project.code}</Link></>}
                      </div>
                      {r.review_note && <div className="faint">Motivo: {r.review_note}</div>}

                      {r.status === 'pendiente' && (
                        <div className="row" style={{ marginTop: 10 }}>
                          <button className="btn btn-sm btn-primary" onClick={() => setAccepting(r)}>
                            <Check />Anotar como material
                          </button>
                          <button className="btn btn-sm" onClick={() => { setDiscarding(r); setNote(''); }}>
                            <X />Descartar
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </div>
        ) : (
          <>
            <div className="toolbar">
              <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 380 }}>
                <Search size={17} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--faint)' }} aria-hidden />
                <label htmlFor="mat-search" className="sr-only">Buscar material</label>
                <input id="mat-search" className="input" style={{ paddingLeft: 36 }}
                       placeholder="Buscar por material, proveedor o comentario"
                       value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="chip" aria-pressed={archived} onClick={() => setArchived((v) => !v)}>
                Archivados
              </button>
            </div>

            <div className="panel-body tight">
              {materials.loading && !materials.data ? <Loading />
                : materials.error ? <div style={{ padding: 16 }}><ErrorBox message={materials.error} onRetry={materials.reload} /></div>
                : !rows.length ? (
                  <Empty title={debounced ? `Sin resultados para «${debounced}»` : 'No hay material en esta lista'}>
                    {!debounced && tab === 'pendiente' && 'Anota lo que falte con el botón «Nuevo material».'}
                  </Empty>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th className="right">Unidades</th>
                          <th>Proveedor</th>
                          <th>Proyecto</th>
                          <th>Pedido</th>
                          <th>Previsto</th>
                          <th>Recibido</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((m) => {
                          const late = !m.received && m.expected_on && m.expected_on < today;
                          return (
                            <tr key={m.id}>
                              <td>
                                <span className="cell-main">
                                  <strong>{m.name}</strong>
                                  {m.notes && <small>{m.notes}</small>}
                                </span>
                              </td>
                              <td className="right num">{m.units != null ? fmtNumber(m.units) : '—'}</td>
                              <td>{m.supplier ?? <span className="faint">Sin proveedor</span>}</td>
                              <td>
                                {m.project
                                  ? <Link to={`/admin/proyectos/${m.project.id}`}>{m.project.code}</Link>
                                  : '—'}
                              </td>
                              <td className="nowrap">{m.ordered_on ? fmtDate(m.ordered_on) : <span className="faint">—</span>}</td>
                              <td className="nowrap">
                                {m.expected_on ? (
                                  late
                                    ? <Badge tone="red">{fmtDate(m.expected_on)}</Badge>
                                    : fmtDate(m.expected_on)
                                ) : <span className="faint">Sin fecha</span>}
                              </td>
                              <td>
                                <label className="checkbox" style={{ margin: 0 }}>
                                  <input type="checkbox" checked={m.received}
                                         onChange={() => toggleReceived(m)}
                                         aria-label={`Marcar ${m.name} como recibido`} />
                                  <span className="sr-only">Recibido</span>
                                </label>
                              </td>
                              <td className="right nowrap">
                                <button className="btn btn-ghost icon-btn" onClick={() => setEditing(m)}
                                        aria-label={`Editar ${m.name}`}><Pencil /></button>
                                <button className="btn btn-ghost icon-btn" onClick={() => toggleArchive(m)}
                                        aria-label={`${m.archived_at ? 'Recuperar' : 'Archivar'} ${m.name}`}>
                                  {m.archived_at ? <ArchiveRestore /> : <Archive />}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </>
        )}
      </section>

      {creating && (
        <MaterialModal
          title="Nuevo material"
          projects={projects.data?.rows.map((p) => ({ id: p.id, code: p.code, name: p.name })) ?? []}
          projectId={projectId}
          onProject={setProjectId}
          onClose={() => { setCreating(false); setProjectId(''); }}
          onSave={saveNew}
        />
      )}

      {editing && (
        <MaterialModal
          title={`Editar ${editing.name}`}
          initial={draftFrom(editing)}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}

      {accepting && (
        <MaterialModal
          title="Anotar como material pendiente"
          initial={{ ...emptyMaterial, name: accepting.body }}
          onClose={() => setAccepting(null)}
          onSave={accept}
          intro={
            <Panel title="Lo que comunicó el taller" tight>
              <div style={{ padding: '10px 16px' }}>
                <strong>{accepting.worker?.full_name}</strong>
                <p className="pre" style={{ margin: '4px 0 0' }}>{accepting.body}</p>
              </div>
            </Panel>
          }
        />
      )}

      {discarding && (
        <Modal
          title="Descartar el aviso"
          onClose={() => setDiscarding(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDiscarding(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={discard}><X />Descartar</button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            «{discarding.body}» no se anotará como material. Puedes explicar por qué:
            el trabajador lo verá en su móvil.
          </p>
          <label htmlFor="req-note" className="label">Motivo (opcional)</label>
          <textarea id="req-note" className="textarea" rows={3} value={note}
                    placeholder="Por ejemplo: ya está pedido, llega el jueves."
                    onChange={(e) => setNote(e.target.value)} />
        </Modal>
      )}
    </>
  );
}
