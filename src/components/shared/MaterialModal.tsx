import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Layout';
import { Alert } from '@/components/ui/Feedback';
import { SupplierPicker } from '@/components/shared/SupplierPicker';
import { parseDecimal } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';
import type { Material, MaterialOrigin } from '@/types/db';

export interface MaterialDraft {
  /**
   * De dónde sale el material:
   *
   *   · «pedido»  · hay que comprarlo. Es lo de siempre y lo que sale
   *     puesto, para que anotar un pedido se haga igual que ayer;
   *   · «almacen» · ya lo tenemos en el taller y solo se anota en qué
   *     proyecto se va a usar. No se le pide a nadie.
   */
  origin: MaterialOrigin;
  name: string;
  units: string;
  /** El proveedor EN TEXTO. Es lo que se guarda siempre. */
  supplier: string;
  /**
   * El proveedor de la lista, si se ha elegido uno. Puede faltar: se
   * sigue pudiendo escribir el nombre a mano, como siempre.
   */
  supplier_id: string | null;
  ordered_on: string;
  expected_on: string;
  notes: string;
}

/** Lo que sale del formulario: igual que el borrador, con las unidades ya en número. */
export interface MaterialValues extends Omit<MaterialDraft, 'units'> {
  units: number | null;
}

/**
 * MATERIAL DE TALLER: el que no es de ningún proyecto.
 *
 * Se elige a propósito en el mismo desplegable de los proyectos, en vez
 * de dejarlo vacío, porque «sin proyecto» tiene que ser una DECISIÓN y
 * no un despiste: si bastara con no elegir nada, el material de un
 * trabajo acabaría apuntado como consumible del taller.
 */
export const SIN_PROYECTO = 'taller';

export const emptyMaterial: MaterialDraft = {
  origin: 'pedido',
  name: '', units: '', supplier: '', supplier_id: null,
  ordered_on: '', expected_on: '', notes: '',
};

export function draftFrom(m: Material): MaterialDraft {
  return {
    origin: m.origin ?? 'pedido',
    name: m.name,
    units: m.units != null ? String(m.units).replace('.', ',') : '',
    supplier: m.supplier ?? '',
    supplier_id: m.supplier_id ?? null,
    ordered_on: m.ordered_on ?? '',
    expected_on: m.expected_on ?? '',
    notes: m.notes ?? '',
  };
}

/**
 * Alta y edición de material.
 * A propósito no hay precio, ni número de pedido, ni solicitante.
 */
export function MaterialModal({
  title, initial, projects, projectId, onProject, onClose, onSave, intro, allowOrigin = true,
}: {
  title: string;
  initial?: MaterialDraft;
  /**
   * Si se puede elegir de dónde sale el material.
   *
   * Al revisar un aviso del taller NO se ofrece: el aviso dice que FALTA
   * algo, así que es material que hay que pedir, y la función que lo
   * acepta no recibe ningún origen. Ofrecerlo ahí haría creer que se
   * guarda una elección que no se guarda.
   */
  allowOrigin?: boolean;
  projects?: { id: string; code: string; name: string }[];
  projectId?: string;
  onProject?: (id: string) => void;
  onClose: () => void;
  onSave: (draft: MaterialValues) => Promise<void>;
  intro?: React.ReactNode;
}) {
  const [form, setForm] = useState<MaterialDraft>(initial ?? emptyMaterial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (initial) setForm(initial); }, [initial]);

  const set = (patch: Partial<MaterialDraft>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    if (!form.name.trim()) { setError('Escribe qué material falta.'); return; }
    if (projects && !projectId) { setError('Elige el proyecto al que pertenece.'); return; }

    const units = form.units.trim() ? parseDecimal(form.units) : null;
    if (form.units.trim() && (units === null || units <= 0)) {
      setError('Las unidades no son válidas. Escríbelas así: 12 o 2,5');
      return;
    }
    if (form.ordered_on && form.expected_on && form.expected_on < form.ordered_on) {
      setError('La fecha prevista no puede ser anterior a la del pedido.');
      return;
    }

    setBusy(true);
    try { await onSave({ ...form, units }); }
    catch (e) { setError(toUserMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            <Save />{busy ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="stack">
        {intro}
        {error && <Alert kind="danger">{error}</Alert>}

        <div className="form-grid">
          {projects && (
            <Field label="Proyecto" htmlFor="mat-project" span>
              <select id="mat-project" className="select" value={projectId ?? ''}
                      onChange={(e) => onProject?.(e.target.value)}>
                <option value="">Elige un proyecto…</option>
                <option value={SIN_PROYECTO}>Sin proyecto · material de taller</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                ))}
              </select>
              {projectId === SIN_PROYECTO && (
                <span className="hint">
                  Consumibles del taller: discos, electrodos, guantes. No se cuentan en
                  ningún proyecto.
                </span>
              )}
            </Field>
          )}

          {allowOrigin && (
          <Field label="¿De dónde sale?" htmlFor="mat-origin" span>
            <div className="segmented" role="group" aria-label="De dónde sale el material">
              <button type="button" id="mat-origin" aria-pressed={form.origin === 'pedido'}
                      onClick={() => set({ origin: 'pedido' })}>
                Hay que pedirlo
              </button>
              <button type="button" id="mat-origin-almacen" aria-pressed={form.origin === 'almacen'}
                      onClick={() => set({
                        origin: 'almacen',
                        // Lo que ya tenemos no se le ha pedido a nadie:
                        // ni proveedor, ni fechas de pedido. Se limpian
                        // al cambiar para que no se guarde a medias.
                        supplier: '', supplier_id: null, ordered_on: '', expected_on: '',
                      })}>
                Ya lo tenemos en el almacén
              </button>
            </div>
            <span className="hint">
              {form.origin === 'almacen'
                ? 'Se anota en el proyecto para dejar constancia de que se usa ahí. '
                  + 'No genera ningún pedido ni ninguna petición al proveedor.'
                : 'Entra en la lista de material pendiente y avisa si se pasa la fecha prevista.'}
            </span>
          </Field>
          )}

          <Field label="Material" htmlFor="mat-name" span>
            <input id="mat-name" className="input" value={form.name}
                   placeholder="Pletina 40×8 mm"
                   onChange={(e) => set({ name: e.target.value })} />
          </Field>

          <Field label="Unidades" htmlFor="mat-units">
            <input id="mat-units" className="input" inputMode="decimal" value={form.units}
                   placeholder="12" onChange={(e) => set({ units: e.target.value })} />
          </Field>

          {/*
            Proveedor y fechas solo tienen sentido en lo que hay que
            pedir. En el material del almacén no se enseñan, y la base de
            datos tampoco los admite: no se le ha comprado a nadie.
          */}
          {form.origin === 'pedido' && (
            <>
              <Field label="Proveedor" htmlFor="mat-supplier">
                <SupplierPicker id="mat-supplier" materialName={form.name}
                                value={form.supplier} supplierId={form.supplier_id}
                                onChange={(v) => set(v)} />
              </Field>

              <Field label="Fecha de pedido" htmlFor="mat-ordered">
                <input id="mat-ordered" className="input" type="date" value={form.ordered_on}
                       onChange={(e) => set({ ordered_on: e.target.value })} />
              </Field>

              <Field label="Fecha prevista de llegada" htmlFor="mat-expected"
                     hint="Si se pasa esta fecha, la aplicación avisa.">
                <input id="mat-expected" className="input" type="date" value={form.expected_on}
                       onChange={(e) => set({ expected_on: e.target.value })} />
              </Field>
            </>
          )}

          <Field label="Comentarios" htmlFor="mat-notes" span>
            <textarea id="mat-notes" className="textarea" rows={2} value={form.notes}
                      onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>

        <p className="hint" style={{ margin: 0 }}>
          No se guarda el precio, ni el número de pedido, ni quién lo pidió.
        </p>
      </div>
    </Modal>
  );
}
