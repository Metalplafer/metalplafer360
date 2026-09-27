import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Field, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { ClientPicker, emptyClient, type ClientDraft } from '@/components/shared/ClientPicker';
import { createClient, getClient } from '@/services/clients';
import { createFicha, getFicha, updateFicha } from '@/services/fichas';
import { listPeople } from '@/services/people';
import { FICHA_CODE_PREFIX, FICHA_NEW_TITLE, FICHA_TYPE_LABEL } from '@/config/constants';
import { parseDecimal } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';
import type { FichaType } from '@/types/db';

const TYPES: FichaType[] = ['presupuesto', 'visita', 'aviso'];
const isType = (v: string | null): v is FichaType => TYPES.includes(v as FichaType);

/** Alta y edición de presupuestos, visitas y avisos. */
export default function FichaForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useDialogs();

  const editing = Boolean(id);
  const ficha = useAsync(async () => (id ? getFicha(id) : null), [id]);
  const people = useAsync(() => listPeople(), []);

  const [type, setType] = useState<FichaType>(isType(params.get('tipo')) ? params.get('tipo') as FichaType : 'presupuesto');
  const [client, setClient] = useState<ClientDraft>(emptyClient);
  const [form, setForm] = useState({
    title: '', description: '', address: '', phone: '',
    scheduled_date: '', scheduled_time: '', assigned_to: '', amount: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cliente indicado en la dirección (al crear desde la ficha de un cliente)
  useEffect(() => {
    const clientId = params.get('cliente');
    if (!clientId || editing) return;
    getClient(clientId).then((c) => setClient({
      id: c.id, kind: c.kind, name: c.name, tax_id: c.tax_id ?? '', phone: c.phone ?? '',
      email: c.email ?? '', address: c.address ?? '', city: c.city ?? '', postal_code: c.postal_code ?? '',
    })).catch(() => undefined);
  }, [params, editing]);

  // Datos de la ficha que se está editando
  useEffect(() => {
    const f = ficha.data;
    if (!f) return;
    setType(f.type);
    setForm({
      title: f.title ?? '', description: f.description ?? '', address: f.address ?? '',
      phone: f.phone ?? '', scheduled_date: f.scheduled_date ?? '', scheduled_time: f.scheduled_time?.slice(0, 5) ?? '',
      assigned_to: f.assigned_to ?? '', amount: f.amount != null ? String(f.amount).replace('.', ',') : '',
    });
    if (f.client) {
      setClient({
        id: f.client.id, kind: f.client.kind, name: f.client.name, tax_id: '',
        phone: f.client.phone ?? '', email: '', address: '', city: '', postal_code: '',
      });
    }
  }, [ficha.data]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Reglas mínimas antes de enviar
    if (type !== 'visita' && !client.id && !client.name.trim()) {
      setError('Un presupuesto o un aviso necesitan siempre un cliente.');
      return;
    }
    if (!form.description.trim() && !form.title.trim()) {
      setError('Describe brevemente de qué se trata.');
      return;
    }
    const amount = form.amount.trim() ? parseDecimal(form.amount) : null;
    if (form.amount.trim() && (amount === null || amount < 0)) {
      setError('El importe no es válido. Escríbelo así: 6400 o 6.400,50');
      return;
    }

    setBusy(true);
    try {
      // Si el cliente es nuevo, se da de alta primero.
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
        type,
        client_id: clientId,
        title: form.title,
        description: form.description,
        address: form.address,
        phone: form.phone,
        scheduled_date: form.scheduled_date || null,
        scheduled_time: form.scheduled_time || null,
        assigned_to: form.assigned_to || null,
        amount,
      };

      const saved = editing && id ? await updateFicha(id, payload) : await createFicha(payload);
      toast.success(editing ? 'Ficha actualizada' : `Ficha ${saved.code} creada`);
      navigate(`/admin/fichas/${saved.id}`);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing && ficha.loading && !ficha.data) return <Loading />;
  if (editing && ficha.error) return <ErrorBox message={ficha.error} onRetry={ficha.reload} />;

  const label = FICHA_TYPE_LABEL[type];

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to="/admin/fichas" style={{ marginBottom: 10 }}>
        <ArrowLeft />Fichas
      </Link>

      <PageHeader
        title={editing ? `Editar ${label.toLowerCase()} ${ficha.data?.code ?? ''}` : FICHA_NEW_TITLE[type]}
        sub={editing ? undefined : `Se le asignará el código ${FICHA_CODE_PREFIX[type]}-${new Date().getFullYear()}-###`}
      />

      <form onSubmit={submit} className="stack" style={{ maxWidth: 860 }} noValidate>
        {error && <Alert kind="danger">{error}</Alert>}

        {!editing && (
          <Panel title="Tipo de ficha">
            <div className="segmented" role="group" aria-label="Tipo de ficha">
              {TYPES.map((t) => (
                <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
                  {FICHA_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
              {type === 'presupuesto' && 'Un presupuesto aceptado se podrá convertir en proyecto.'}
              {type === 'visita' && 'Una visita puede ser de alguien que todavía no es cliente.'}
              {type === 'aviso' && 'Un aviso es una incidencia o reparación. No se convierte en proyecto por sí solo.'}
            </p>
          </Panel>
        )}

        <Panel title={type === 'visita' ? 'Cliente (opcional)' : 'Cliente'}>
          {editing ? (
            <p className="muted" style={{ margin: 0 }}>
              {client.name || 'Sin cliente'} · el cliente de una ficha no se cambia una vez creada.
            </p>
          ) : (
            <ClientPicker value={client} onChange={setClient} required={type !== 'visita'} />
          )}
        </Panel>

        <Panel title="Datos del trabajo">
          <div className="form-grid">
            <Field label={type === 'presupuesto' ? 'Asunto del presupuesto' : 'Asunto'} htmlFor="f-title" span
                   hint="Una línea que identifique el trabajo. Por ejemplo: barandilla escalera comunitaria.">
              <input id="f-title" className="input" value={form.title}
                     onChange={(e) => set({ title: e.target.value })} />
            </Field>

            <Field label="Descripción" htmlFor="f-desc" span>
              <textarea id="f-desc" className="textarea" rows={4} value={form.description}
                        onChange={(e) => set({ description: e.target.value })} />
            </Field>

            <Field label="Dirección del trabajo" htmlFor="f-address" span
                   hint="Dónde se hace. Puede ser distinta de la dirección del cliente.">
              <input id="f-address" className="input" value={form.address}
                     onChange={(e) => set({ address: e.target.value })} />
            </Field>

            {type === 'aviso' && (
              <Field label="Teléfono de contacto" htmlFor="f-phone"
                     hint="A quién llamar para este aviso.">
                <input id="f-phone" className="input" inputMode="tel" value={form.phone}
                       onChange={(e) => set({ phone: e.target.value })} />
              </Field>
            )}

            {type === 'presupuesto' && (
              <Field label="Importe" htmlFor="f-amount" hint="Opcional. Por ejemplo: 6400 o 6.400,50">
                <input id="f-amount" className="input" inputMode="decimal" value={form.amount}
                       onChange={(e) => set({ amount: e.target.value })} />
              </Field>
            )}

            {type !== 'presupuesto' && (
              <>
                <Field label={type === 'visita' ? 'Fecha de la visita' : 'Fecha prevista'} htmlFor="f-date">
                  <input id="f-date" className="input" type="date" value={form.scheduled_date}
                         onChange={(e) => set({ scheduled_date: e.target.value })} />
                </Field>
                <Field label={type === 'visita' ? 'Hora' : 'Hora prevista'} htmlFor="f-time">
                  <input id="f-time" className="input" type="time" value={form.scheduled_time}
                         onChange={(e) => set({ scheduled_time: e.target.value })} />
                </Field>
              </>
            )}

            <Field
              label={type === 'presupuesto' ? 'Quién lo prepara' : 'Trabajador responsable'}
              htmlFor="f-assigned" span
              hint="Si lo dejas sin asignar, la ficha queda «Por asignar».">
              <select id="f-assigned" className="select" value={form.assigned_to}
                      onChange={(e) => set({ assigned_to: e.target.value })}>
                <option value="">Sin asignar</option>
                {(people.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}{p.role === 'admin' ? ' (administración)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>

        <div className="row">
          <button className="btn btn-primary btn-lg" disabled={busy}>
            <Save />{busy ? 'Guardando…' : editing ? 'Guardar cambios' : `Crear ${label.toLowerCase()}`}
          </button>
          <button type="button" className="btn btn-lg" onClick={() => navigate(-1)} disabled={busy}>
            Cancelar
          </button>
        </div>
      </form>
    </>
  );
}
