import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Truck, UserCheck, UserX } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Modal } from '@/components/ui/Modal';
import { Badge, Field, PageHeader } from '@/components/ui/Layout';
import { Alert, Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { listSuppliers, saveSupplier, setSupplierActive } from '@/services/suppliers';
import { fmtPhone } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';
import type { Supplier } from '@/types/db';

/**
 * PROVEEDORES.
 *
 * Hasta ahora el proveedor de un material era texto libre, así que el
 * mismo proveedor aparecía escrito de cuatro maneras y no había dónde
 * guardar su teléfono. Esta pantalla es la lista de verdad.
 *
 * Dos cosas que no son un descuido:
 *
 *   · NO hay botón de borrar. Un proveedor desaparecido dejaría
 *     materiales apuntando al vacío y el histórico de compras sin
 *     explicación. Se da de baja, deja de proponerse, y lo que ya se le
 *     compró sigue en su sitio.
 *   · El texto de siempre NO se retira. Hay material real que solo tiene
 *     el nombre escrito a mano, y se sigue viendo igual.
 */
export default function SuppliersPage() {
  const { toast, confirm } = useDialogs();

  const [reloadKey, setReloadKey] = useState(0);
  const suppliers = useAsync(() => listSuppliers(true), [reloadKey]);
  const reload = () => setReloadKey((n) => n + 1);

  const [editing, setEditing] = useState<Supplier | 'nuevo' | null>(null);
  const [search, setSearch] = useState('');
  const [verBajas, setVerBajas] = useState(false);

  const rows = useMemo(() => {
    const all = suppliers.data ?? [];
    const s = search.trim().toLowerCase();
    return all
      .filter((p) => verBajas || p.active)
      .filter((p) => !s
        || p.name.toLowerCase().includes(s)
        || (p.phone ?? '').toLowerCase().includes(s)
        || (p.email ?? '').toLowerCase().includes(s));
  }, [suppliers.data, search, verBajas]);

  const bajas = (suppliers.data ?? []).filter((p) => !p.active).length;

  async function toggle(p: Supplier) {
    const ok = await confirm({
      title: p.active ? 'Dar de baja el proveedor' : 'Reactivar el proveedor',
      message: p.active
        ? (
          <>
            <strong>{p.name}</strong> dejará de proponerse al pedir material.
            No se borra nada: el material que ya se le compró sigue en su sitio
            y se le puede reactivar cuando quieras.
          </>
        )
        : <><strong>{p.name}</strong> volverá a proponerse al pedir material.</>,
      confirmLabel: p.active ? 'Dar de baja' : 'Reactivar',
      danger: p.active,
    });
    if (!ok) return;
    try {
      await setSupplierActive(p.id, !p.active);
      toast.success(p.active ? 'Proveedor dado de baja' : 'Proveedor reactivado');
      reload();
    } catch (e) { toast.error(e); }
  }

  return (
    <>
      <PageHeader
        title="Proveedores"
        sub="A quién le compráis el material, con su teléfono a mano."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('nuevo')}>
            <Plus />Nuevo proveedor
          </button>
        }
      />

      <div className="stack" style={{ marginBottom: 16 }}>
        <Alert kind="info">
          Los proveedores no se borran: se dan de baja. Así dejan de proponerse al
          pedir material, pero lo que ya se les compró sigue en su sitio.
        </Alert>
      </div>

      <section className="panel">
        <div className="toolbar">
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 380 }}>
            <Search size={17} aria-hidden
                     style={{ position: 'absolute', left: 11, top: 11, color: 'var(--faint)' }} />
            <label htmlFor="pv-search" className="sr-only">Buscar proveedor</label>
            <input id="pv-search" className="input" style={{ paddingLeft: 36 }}
                   placeholder="Buscar por nombre, teléfono o correo"
                   value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {bajas > 0 && (
            <button className="chip" aria-pressed={verBajas}
                    onClick={() => setVerBajas((v) => !v)}>
              {bajas === 1 ? 'Ver el dado de baja' : `Ver los ${bajas} dados de baja`}
            </button>
          )}
        </div>

        <div className="panel-body tight">
          {suppliers.loading && !suppliers.data ? <Loading />
            : suppliers.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBox message={suppliers.error} onRetry={suppliers.reload} />
              </div>
            )
            : !rows.length ? (
              <Empty
                icon={<Truck aria-hidden />}
                title={search.trim() ? `Sin resultados para «${search.trim()}»`
                  : 'Todavía no hay proveedores'}
              >
                {!search.trim() && (
                  <span>Dalos de alta y aparecerán al pedir material.</span>
                )}
              </Empty>
            )
            : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Proveedor</th><th>Teléfono</th><th>Correo</th>
                      <th>Notas</th><th>Estado</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <span className="cell-main">
                            <strong>{p.name}</strong>
                            {!p.active && <small>Ya no se propone</small>}
                          </span>
                        </td>
                        <td className="nowrap num">{fmtPhone(p.phone)}</td>
                        <td>{p.email ?? <span className="faint">—</span>}</td>
                        <td>{p.notes ?? <span className="faint">—</span>}</td>
                        <td>
                          {p.active
                            ? <Badge tone="green">Activo</Badge>
                            : <Badge tone="steel">De baja</Badge>}
                        </td>
                        <td className="right nowrap">
                          <button className="btn btn-ghost icon-btn" onClick={() => setEditing(p)}
                                  aria-label={`Editar ${p.name}`}><Pencil /></button>
                          <button className="btn btn-ghost icon-btn" onClick={() => toggle(p)}
                                  aria-label={`${p.active ? 'Dar de baja' : 'Reactivar'} ${p.name}`}>
                            {p.active ? <UserX /> : <UserCheck />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </section>

      {editing && (
        <SupplierModal
          supplier={editing === 'nuevo' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); reload(); toast.success(msg); }}
        />
      )}
    </>
  );
}

/**
 * Alta y corrección de un proveedor.
 *
 * Si al crear uno resulta que ya existía —escrito de otra manera, con
 * acentos o con otra puntuación— la base de datos devuelve el que hay en
 * lugar de crear un duplicado. Aquí se dice, porque si no el usuario
 * creería que ha creado algo nuevo.
 */
function SupplierModal({ supplier, onClose, onSaved }: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    notes: supplier?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const saved = await saveSupplier({
        id: supplier?.id ?? null,
        name: form.name,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      });
      if (!supplier) {
        onSaved(saved.name === form.name.trim()
          ? 'Proveedor dado de alta'
          : `Ya estaba en la lista como «${saved.name}». No se ha duplicado.`);
      } else {
        onSaved('Proveedor guardado');
      }
    } catch (e) { setError(toUserMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      title={supplier ? `Editar ${supplier.name}` : 'Nuevo proveedor'}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" onClick={save}
                disabled={busy || !form.name.trim()}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </>}
    >
      <div className="stack">
        {error && <Alert kind="danger">{error}</Alert>}
        <div className="form-grid">
          <Field label="Nombre" htmlFor="pv-name" span>
            <input id="pv-name" className="input" value={form.name} autoComplete="off"
                   placeholder="Aceros Vallès, S.L."
                   onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Teléfono" htmlFor="pv-phone">
            <input id="pv-phone" className="input" value={form.phone} inputMode="tel"
                   placeholder="937 11 22 33"
                   onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Correo" htmlFor="pv-email">
            <input id="pv-email" className="input" value={form.email} autoComplete="off"
                   placeholder="pedidos@proveedor.com"
                   onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Notas" htmlFor="pv-notes" span
                 hint="Plazos de entrega, portes, condiciones… lo que convenga tener a mano.">
            <textarea id="pv-notes" className="input" rows={3} value={form.notes}
                      onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
        {!supplier && (
          <p className="hint" style={{ margin: 0 }}>
            Si este proveedor ya estuviera en la lista escrito de otra manera, no se
            creará dos veces: se usará el que ya hay.
          </p>
        )}
      </div>
    </Modal>
  );
}
