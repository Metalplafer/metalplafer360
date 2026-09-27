import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Layout';
import { Alert } from '@/components/ui/Feedback';
import { useDialogs } from '@/components/ui/Dialogs';
import { createClient, updateClient, type ClientInput } from '@/services/clients';
import { toUserMessage } from '@/lib/errors';
import type { Client } from '@/types/db';

const empty: ClientInput = {
  kind: 'empresa', name: '', tax_id: '', phone: '', email: '',
  address: '', city: '', postal_code: '', notes: '',
};

/** Alta y edición de un cliente. */
export function ClientForm({ client, onClose, onSaved }: {
  client?: Client | null;
  onClose: () => void;
  onSaved: (c: Client) => void;
}) {
  const { toast } = useDialogs();
  const [form, setForm] = useState<ClientInput>(client ? {
    kind: client.kind, name: client.name, tax_id: client.tax_id ?? '', phone: client.phone ?? '',
    email: client.email ?? '', address: client.address ?? '', city: client.city ?? '',
    postal_code: client.postal_code ?? '', notes: client.notes ?? '',
  } : empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<ClientInput>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('El cliente necesita un nombre.'); return; }
    setBusy(true); setError(null);
    try {
      const saved = client ? await updateClient(client.id, form) : await createClient(form);
      toast.success(client ? 'Cliente actualizado' : `Cliente «${saved.name}» creado`);
      onSaved(saved);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={client ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar cliente'}
        </button>
      </>}>
      <form onSubmit={submit} className="stack" noValidate>
        {error && <Alert kind="danger">{error}</Alert>}

        <div className="field">
          <span className="label">Tipo de cliente</span>
          <div className="segmented" role="group" aria-label="Tipo de cliente">
            <button type="button" aria-pressed={form.kind === 'empresa'} onClick={() => set({ kind: 'empresa' })}>
              Empresa
            </button>
            <button type="button" aria-pressed={form.kind === 'particular'} onClick={() => set({ kind: 'particular' })}>
              Particular
            </button>
          </div>
        </div>

        <div className="form-grid">
          <Field label="Nombre *" htmlFor="cf-name" span>
            <input id="cf-name" className="input" value={form.name} required
                   onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="CIF/NIF" htmlFor="cf-tax" hint="Opcional">
            <input id="cf-tax" className="input" value={form.tax_id ?? ''}
                   onChange={(e) => set({ tax_id: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Teléfono" htmlFor="cf-phone">
            <input id="cf-phone" className="input" inputMode="tel" value={form.phone ?? ''}
                   onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="cf-email" span>
            <input id="cf-email" className="input" type="email" value={form.email ?? ''}
                   onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Dirección" htmlFor="cf-address" span>
            <input id="cf-address" className="input" value={form.address ?? ''}
                   onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <Field label="Población" htmlFor="cf-city">
            <input id="cf-city" className="input" value={form.city ?? ''}
                   onChange={(e) => set({ city: e.target.value })} />
          </Field>
          <Field label="Código postal" htmlFor="cf-cp">
            <input id="cf-cp" className="input" inputMode="numeric" value={form.postal_code ?? ''}
                   onChange={(e) => set({ postal_code: e.target.value })} />
          </Field>
          <Field label="Notas internas" htmlFor="cf-notes" span>
            <textarea id="cf-notes" className="textarea" rows={3} value={form.notes ?? ''}
                      onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
