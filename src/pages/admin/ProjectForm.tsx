import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Field, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { ClientPicker, emptyClient, type ClientDraft } from '@/components/shared/ClientPicker';
import { createClient, getClient, listContacts } from '@/services/clients';
import { createProject, getProject, updateProject } from '@/services/projects';
import { parseDecimal } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';

const emptyForm = {
  name: '', description: '', measures: '', finish: '', location: '',
  address: '', observations: '', budget_amount: '', advance_amount: '',
  budget_hours_fab: '', budget_hours_mont: '', contact_id: '',
};

/** Alta y edición de un proyecto. */
export default function ProjectForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useDialogs();

  const editing = Boolean(id);
  const project = useAsync(async () => (id ? getProject(id) : null), [id]);

  const [client, setClient] = useState<ClientDraft>(emptyClient);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contacts = useAsync(
    async () => (client.id ? listContacts(client.id) : []),
    [client.id],
  );

  // Cliente indicado en la dirección (al crear desde su ficha)
  useEffect(() => {
    const clientId = params.get('cliente');
    if (!clientId || editing) return;
    getClient(clientId).then((c) => setClient({
      id: c.id, kind: c.kind, name: c.name, tax_id: c.tax_id ?? '', phone: c.phone ?? '',
      email: c.email ?? '', address: c.address ?? '', city: c.city ?? '', postal_code: c.postal_code ?? '',
    })).catch(() => undefined);
  }, [params, editing]);

  // Datos del proyecto que se edita
  useEffect(() => {
    const p = project.data;
    if (!p) return;
    setForm({
      name: p.name, description: p.description ?? '', measures: p.measures ?? '',
      finish: p.finish ?? '', location: p.location ?? '', address: p.address ?? '',
      observations: p.observations ?? '',
      budget_amount: p.budget_amount != null ? String(p.budget_amount).replace('.', ',') : '',
      advance_amount: p.advance_amount != null ? String(p.advance_amount).replace('.', ',') : '',
      budget_hours_fab: p.budget_hours_fab ? String(p.budget_hours_fab).replace('.', ',') : '',
      budget_hours_mont: p.budget_hours_mont ? String(p.budget_hours_mont).replace('.', ',') : '',
      contact_id: p.contact_id ?? '',
    });
    if (p.client) {
      setClient({
        id: p.client.id, kind: p.client.kind, name: p.client.name, tax_id: '',
        phone: p.client.phone ?? '', email: '', address: p.client.address ?? '',
        city: '', postal_code: '',
      });
    }
  }, [project.data]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  /** Lee un número escrito a la española; devuelve undefined si está vacío. */
  function num(value: string, label: string): number | null | undefined {
    if (!value.trim()) return null;
    const parsed = parseDecimal(value);
    if (parsed === null || parsed < 0) {
      setError(`${label} no es un número válido. Escríbelo así: 2400 o 2.400,50`);
      return undefined;
    }
    return parsed;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!client.id && !client.name.trim()) {
      setError('Un proyecto necesita siempre un cliente.');
      return;
    }
    if (!form.name.trim()) {
      setError('Ponle un nombre al proyecto: qué se fabrica o se monta.');
      return;
    }

    const budget = num(form.budget_amount, 'El presupuesto');
    const advance = num(form.advance_amount, 'El anticipo');
    const hoursFab = num(form.budget_hours_fab, 'Las horas de fabricación');
    const hoursMont = num(form.budget_hours_mont, 'Las horas de montaje');
    if (budget === undefined || advance === undefined || hoursFab === undefined || hoursMont === undefined) return;

    setBusy(true);
    try {
      // Cliente nuevo: se da de alta antes que el proyecto.
      let clientId = client.id;
      if (!clientId && client.name.trim()) {
        const created = await createClient({
          kind: client.kind, name: client.name, tax_id: client.tax_id, phone: client.phone,
          email: client.email, address: client.address, city: client.city,
          postal_code: client.postal_code, notes: null,
        });
        clientId = created.id;
      }

      const payload = {
        client_id: clientId!,
        contact_id: form.contact_id || null,
        name: form.name,
        description: form.description,
        measures: form.measures,
        finish: form.finish,
        location: form.location,
        address: form.address,
        observations: form.observations,
        budget_amount: budget,
        advance_amount: advance,
        budget_hours_fab: hoursFab ?? 0,
        budget_hours_mont: hoursMont ?? 0,
      };

      const saved = editing && id
        ? await updateProject(id, payload)
        : await createProject(payload);

      toast.success(editing ? 'Proyecto actualizado' : `Proyecto ${saved.code} creado`);
      navigate(`/admin/proyectos/${saved.id}`);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing && project.loading && !project.data) return <Loading />;
  if (editing && project.error) return <ErrorBox message={project.error} onRetry={project.reload} />;

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to="/admin/proyectos" style={{ marginBottom: 10 }}>
        <ArrowLeft />Proyectos
      </Link>

      <PageHeader
        title={editing ? `Editar proyecto ${project.data?.code ?? ''}` : 'Nuevo proyecto'}
        sub={editing ? undefined : `Se le asignará el código PROY-${new Date().getFullYear()}-###`}
      />

      <form onSubmit={submit} className="stack" style={{ maxWidth: 900 }} noValidate>
        {error && <Alert kind="danger">{error}</Alert>}

        <Panel title="Cliente">
          {editing ? (
            <p className="muted" style={{ margin: 0 }}>
              {client.name} · el cliente de un proyecto no se cambia una vez creado.
            </p>
          ) : (
            <ClientPicker value={client} onChange={setClient} required />
          )}

          {client.id && (contacts.data?.length ?? 0) > 0 && (
            <div className="field" style={{ marginTop: 14, maxWidth: 360 }}>
              <label htmlFor="p-contact">Persona de contacto</label>
              <select id="p-contact" className="select" value={form.contact_id}
                      onChange={(e) => set({ contact_id: e.target.value })}>
                <option value="">Sin especificar</option>
                {(contacts.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.role ? ` · ${c.role}` : ''}</option>
                ))}
              </select>
            </div>
          )}
        </Panel>

        <Panel title="El trabajo">
          <div className="form-grid">
            <Field label="Nombre o producto *" htmlFor="p-name" span
                   hint="Qué se fabrica. Por ejemplo: barandilla escalera comunitaria.">
              <input id="p-name" className="input" value={form.name} required
                     onChange={(e) => set({ name: e.target.value })} />
            </Field>

            <Field label="Descripción" htmlFor="p-desc" span>
              <textarea id="p-desc" className="textarea" rows={3} value={form.description}
                        onChange={(e) => set({ description: e.target.value })} />
            </Field>

            <Field label="Medidas" htmlFor="p-measures" hint="Por ejemplo: 6,00 × 4,50 m o 4 ud · 1,20 × 1,40 m">
              <input id="p-measures" className="input" value={form.measures}
                     onChange={(e) => set({ measures: e.target.value })} />
            </Field>

            <Field label="Acabado" htmlFor="p-finish" hint="Por ejemplo: galvanizado + lacado RAL 7016">
              <input id="p-finish" className="input" value={form.finish}
                     onChange={(e) => set({ finish: e.target.value })} />
            </Field>

            <Field label="Ubicación" htmlFor="p-location" hint="Dónde va colocado: fachada, escalera, terraza…">
              <input id="p-location" className="input" value={form.location}
                     onChange={(e) => set({ location: e.target.value })} />
            </Field>

            <Field label="Dirección del proyecto" htmlFor="p-address"
                   hint="Dónde se ejecuta. Puede ser distinta de la del cliente.">
              <input id="p-address" className="input" value={form.address}
                     onChange={(e) => set({ address: e.target.value })} />
            </Field>

            <Field label="Observaciones" htmlFor="p-observations" span
                   hint="Lo que hay que tener en cuenta: accesos, horarios, avisos del cliente…">
              <textarea id="p-observations" className="textarea" rows={3} value={form.observations}
                        onChange={(e) => set({ observations: e.target.value })} />
            </Field>
          </div>
        </Panel>

        <Panel title="Presupuesto y horas previstas">
          <div className="form-grid">
            <Field label="Presupuesto" htmlFor="p-budget" hint="Importe acordado con el cliente.">
              <input id="p-budget" className="input" inputMode="decimal" value={form.budget_amount}
                     onChange={(e) => set({ budget_amount: e.target.value })} />
            </Field>
            <Field label="Anticipo" htmlFor="p-advance" hint="Lo que se cobra al encargar el trabajo.">
              <input id="p-advance" className="input" inputMode="decimal" value={form.advance_amount}
                     onChange={(e) => set({ advance_amount: e.target.value })} />
            </Field>
            <Field label="Horas previstas de fabricación" htmlFor="p-hours-fab" hint="Por ejemplo: 34 o 7,5">
              <input id="p-hours-fab" className="input" inputMode="decimal" value={form.budget_hours_fab}
                     onChange={(e) => set({ budget_hours_fab: e.target.value })} />
            </Field>
            <Field label="Horas previstas de montaje" htmlFor="p-hours-mont">
              <input id="p-hours-mont" className="input" inputMode="decimal" value={form.budget_hours_mont}
                     onChange={(e) => set({ budget_hours_mont: e.target.value })} />
            </Field>
          </div>
        </Panel>

        <div className="row">
          <button className="btn btn-primary btn-lg" disabled={busy}>
            <Save />{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear proyecto'}
          </button>
          <button type="button" className="btn btn-lg" onClick={() => navigate(-1)} disabled={busy}>
            Cancelar
          </button>
        </div>
      </form>
    </>
  );
}
