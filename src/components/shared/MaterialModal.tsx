import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Layout';
import { Alert } from '@/components/ui/Feedback';
import { SupplierInput } from '@/components/shared/SupplierInput';
import { parseDecimal } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';
import type { Material } from '@/types/db';

export interface MaterialDraft {
  name: string;
  units: string;
  supplier: string;
  ordered_on: string;
  expected_on: string;
  notes: string;
}

/** Lo que sale del formulario: igual que el borrador, con las unidades ya en número. */
export interface MaterialValues extends Omit<MaterialDraft, 'units'> {
  units: number | null;
}

export const emptyMaterial: MaterialDraft = {
  name: '', units: '', supplier: '', ordered_on: '', expected_on: '', notes: '',
};

export function draftFrom(m: Material): MaterialDraft {
  return {
    name: m.name,
    units: m.units != null ? String(m.units).replace('.', ',') : '',
    supplier: m.supplier ?? '',
    ordered_on: m.ordered_on ?? '',
    expected_on: m.expected_on ?? '',
    notes: m.notes ?? '',
  };
}

/**
 * Alta y edición de material.
 * A propósito no hay precio, ni número de pedido, ni solicitante.
 */
export function MaterialModal({ title, initial, projects, projectId, onProject, onClose, onSave, intro }: {
  title: string;
  initial?: MaterialDraft;
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
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                ))}
              </select>
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

          <Field label="Proveedor" htmlFor="mat-supplier">
            <SupplierInput id="mat-supplier" value={form.supplier}
                           onChange={(v) => set({ supplier: v })} />
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
