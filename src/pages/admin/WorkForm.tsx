import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Field, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { ClientPicker, emptyClient, type ClientDraft } from '@/components/shared/ClientPicker';
import { createClient } from '@/services/clients';
import { getWork, saveWork } from '@/services/works';
import { toUserMessage } from '@/lib/errors';

const vacio = { name: '', address: '', description: '', observations: '' };

/**
 * ALTA Y EDICIÓN DE UNA OBRA.
 *
 * Una obra es el sitio: «Comunidad Calle Mayor 25». Dentro van sus
 * proyectos, que se meten desde el formulario de cada proyecto.
 *
 * Solo administración. La base de datos rechaza la llamada si quien la
 * hace no es administrador, aunque llegue sin pasar por esta pantalla.
 */
export default function WorkForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useDialogs();

  const editando = Boolean(id);
  const obra = useAsync(async () => (id ? getWork(id) : null), [id]);

  const [client, setClient] = useState<ClientDraft>(emptyClient);
  const [form, setForm] = useState(vacio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const o = obra.data;
    if (!o) return;
    setForm({
      name: o.name,
      address: o.address ?? '',
      description: o.description ?? '',
      observations: o.observations ?? '',
    });
    if (o.client) setClient({ ...emptyClient, id: o.client.id, name: o.client.name });
  }, [obra.data]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError('Ponle un nombre a la obra: normalmente el sitio o la comunidad.');
      return;
    }

    setBusy(true);
    try {
      // Cliente nuevo escrito a mano: se da de alta antes que la obra.
      let clientId = client.id;
      if (!clientId && client.name.trim()) {
        const creado = await createClient({
          kind: client.kind, name: client.name, tax_id: client.tax_id, phone: client.phone,
          email: client.email, address: client.address, city: client.city,
          postal_code: client.postal_code, notes: null,
        });
        clientId = creado.id;
      }

      const guardada = await saveWork({
        id: id ?? null,
        name: form.name,
        clientId,
        address: form.address || null,
        description: form.description || null,
        observations: form.observations || null,
      });

      toast.success(editando ? 'Obra actualizada' : `Obra ${guardada.code} creada`);
      navigate(`/admin/obras/${guardada.id}`);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (editando && obra.loading && !obra.data) return <Loading />;
  if (editando && obra.error) return <ErrorBox message={obra.error} onRetry={obra.reload} />;

  return (
    <>
      <Link className="btn btn-sm btn-ghost"
            to={editando && id ? `/admin/obras/${id}` : '/admin/obras'}
            style={{ marginBottom: 10 }}>
        <ArrowLeft />{editando ? 'Volver a la obra' : 'Obras'}
      </Link>

      <PageHeader
        title={editando ? `Editar obra ${obra.data?.code ?? ''}` : 'Nueva obra'}
        sub={editando
          ? 'Los proyectos se meten y se sacan desde la pantalla de la obra y desde cada proyecto.'
          : `Se le asignará el código OBRA-${new Date().getFullYear()}-###`}
      />

      <form onSubmit={submit} className="stack" style={{ maxWidth: 900 }} noValidate>
        {error && <Alert kind="danger">{error}</Alert>}

        <Panel title="Cliente" >
          <ClientPicker value={client} onChange={setClient} />
          <p className="hint" style={{ marginBottom: 0 }}>
            Opcional. Cada proyecto sigue teniendo su propio cliente; el de la obra es
            solo para localizarla.
          </p>
        </Panel>

        <Panel title="La obra">
          <div className="form-grid">
            <Field label="Nombre *" htmlFor="o-name" span
                   hint="El sitio. Por ejemplo: Comunidad Calle Mayor 25.">
              <input id="o-name" className="input" value={form.name} required maxLength={160}
                     onChange={(e) => set({ name: e.target.value })} />
            </Field>

            <Field label="Dirección" htmlFor="o-address" span
                   hint="Dónde está la obra. Sirve para buscarla en el listado.">
              <input id="o-address" className="input" value={form.address}
                     onChange={(e) => set({ address: e.target.value })} />
            </Field>

            <Field label="Descripción" htmlFor="o-desc" span
                   hint="Qué se hace en esta obra, en general.">
              <textarea id="o-desc" className="textarea" rows={3} value={form.description}
                        onChange={(e) => set({ description: e.target.value })} />
            </Field>

            <Field label="Observaciones" htmlFor="o-obs" span
                   hint="Lo que hay que tener en cuenta de todo el conjunto: accesos, horarios, contacto en obra…">
              <textarea id="o-obs" className="textarea" rows={3} value={form.observations}
                        onChange={(e) => set({ observations: e.target.value })} />
            </Field>
          </div>
        </Panel>

        <div className="row">
          <button className="btn btn-primary btn-lg" disabled={busy}>
            <Save />{busy ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear obra'}
          </button>
          <button type="button" className="btn btn-lg" onClick={() => navigate(-1)} disabled={busy}>
            Cancelar
          </button>
        </div>
      </form>
    </>
  );
}
