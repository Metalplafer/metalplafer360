import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Field, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { ClientPicker, emptyClient, type ClientDraft } from '@/components/shared/ClientPicker';
import { createClient, getClient, listContacts } from '@/services/clients';
import {
  createProject, getProject, projectProducts, saveProjectProducts, setProjectClient,
  updateProject,
} from '@/services/projects';
import {
  ProductBlocks, emptyProduct, productoVacio,
} from '@/components/shared/ProductBlocks';
import type { ProjectProductDraft } from '@/types/db';
import { getWork, setProjectWork, worksForPicker } from '@/services/works';
import { parseDecimal } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';

/**
 * La descripción, las medidas y el acabado YA NO están aquí: son de cada
 * PRODUCTO, porque un proyecto puede ser varias piezas. El nombre del
 * proyecto sí se queda: es su título, no una pieza.
 */
const emptyForm = {
  name: '', location: '',
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
  /**
   * El cliente con el que se abrió el proyecto: para saber si de verdad
   * se ha cambiado y para poder dejarlo como estaba.
   */
  const [clienteOriginal, setClienteOriginal] = useState<ClientDraft | null>(null);
  const [form, setForm] = useState(emptyForm);
  /** Siempre hay al menos un bloque, también al crear un proyecto nuevo. */
  const [products, setProducts] = useState<ProjectProductDraft[]>([{ ...emptyProduct }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contacts = useAsync(
    async () => (client.id ? listContacts(client.id) : []),
    [client.id],
  );

  /**
   * Los productos del proyecto que se edita.
   *
   * Si el proyecto todavía no tiene productos guardados, la vista
   * devuelve UNO construido con sus columnas de siempre, así que el
   * formulario sale relleno con lo que ya había y nadie pierde nada.
   */
  const guardados = useAsync(async () => (id ? projectProducts(id) : []), [id]);

  useEffect(() => {
    const rows = guardados.data;
    if (!rows?.length) return;
    setProducts(rows.map((r) => ({
      name: r.name ?? '',
      description: r.description ?? '',
      measures: r.measures ?? '',
      finish: r.finish ?? '',
    })));
  }, [guardados.data]);

  // BLOQUE 4: la obra que agrupa este proyecto. Opcional.
  const obras = useAsync(() => worksForPicker(), []);
  const [workId, setWorkId] = useState('');

  /**
   * FASE 3.1 · LOS DATOS DEL CLIENTE SALEN DE LA OBRA.
   *
   * Antes, venir desde una obra solo dejaba la obra elegida en el
   * desplegable: el cliente había que volver a escribirlo, teniéndolo la
   * obra ya guardado. Y escribirlo a mano acababa creando una SEGUNDA
   * ficha del mismo cliente, porque al guardar se crea un cliente nuevo
   * cuando no hay uno elegido.
   *
   * Ahora se trae el cliente de la obra CON SU IDENTIFICADOR, así que al
   * guardar se reutiliza el que ya existe y no se crea ninguno.
   *
   * NO SE SOBRESCRIBE NADA: solo rellena si el cliente está vacío. Si
   * quien lo está creando ya ha elegido o escrito un cliente, se queda
   * el suyo. Y todos los campos siguen siendo editables.
   */
  const precargarDesdeObra = useCallback(async (obraId: string) => {
    try {
      const obra = await getWork(obraId);
      if (!obra?.client_id) return;
      const c = await getClient(obra.client_id);
      setClient((actual) => (actual.id || actual.name.trim() ? actual : {
        id: c.id, kind: c.kind, name: c.name, tax_id: c.tax_id ?? '', phone: c.phone ?? '',
        email: c.email ?? '', address: c.address ?? '', city: c.city ?? '',
        postal_code: c.postal_code ?? '',
      }));
      // La dirección de la obra, si el proyecto todavía no tiene una:
      // es el mismo sitio y no hay que volver a escribirla.
      if (obra.address) {
        setForm((f) => (f.address.trim() ? f : { ...f, address: obra.address ?? '' }));
      }
    } catch { /* si la obra no se puede leer, se deja todo como está */ }
  }, []);

  // Obra indicada en la dirección (al crear un proyecto desde su obra)
  useEffect(() => {
    const obra = params.get('obra');
    if (!obra || editing) return;
    setWorkId(obra);
    // Si además se ha indicado un cliente, manda ese y no se toca.
    if (!params.get('cliente')) precargarDesdeObra(obra);
  }, [params, editing, precargarDesdeObra]);

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
      name: p.name, location: p.location ?? '', address: p.address ?? '',
      observations: p.observations ?? '',
      budget_amount: p.budget_amount != null ? String(p.budget_amount).replace('.', ',') : '',
      advance_amount: p.advance_amount != null ? String(p.advance_amount).replace('.', ',') : '',
      budget_hours_fab: p.budget_hours_fab ? String(p.budget_hours_fab).replace('.', ',') : '',
      budget_hours_mont: p.budget_hours_mont ? String(p.budget_hours_mont).replace('.', ',') : '',
      contact_id: p.contact_id ?? '',
    });
    setWorkId(p.work_id ?? '');
    if (p.client) {
      const actual: ClientDraft = {
        id: p.client.id, kind: p.client.kind, name: p.client.name, tax_id: '',
        phone: p.client.phone ?? '', email: '', address: p.client.address ?? '',
        city: '', postal_code: '',
      };
      setClient(actual);
      setClienteOriginal(actual);
    }
  }, [project.data]);

  /**
   * ¿Se ha cambiado el cliente? Solo cuenta haber ELEGIDO otro de la
   * lista: dejar el buscador vacío no es quitar el cliente.
   */
  const clienteCambiado = editing
    && Boolean(client.id) && client.id !== (clienteOriginal?.id ?? null);

  /**
   * Elegir cliente SUELTA la persona de contacto.
   *
   * Un contacto es de un cliente concreto. Si se cambia de cliente y el
   * contacto se queda puesto, el proyecto enseñaría el teléfono de
   * alguien de otra empresa. La base de datos también lo quita, pero si
   * el formulario no lo soltara volvería a mandarlo al guardar y lo
   * dejaría otra vez puesto.
   */
  function elegirCliente(siguiente: ClientDraft) {
    if ((siguiente.id ?? null) !== (client.id ?? null)) set({ contact_id: '' });
    setClient(siguiente);
  }

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
    // Al EDITAR solo se elige entre los que ya existen.
    if (editing && !client.id && client.name.trim()) {
      setError('Elige el cliente de la lista que sale al escribir. Si todavía no existe, '
               + 'dalo de alta en Clientes y vuelve aquí.');
      return;
    }
    if (!form.name.trim()) {
      setError('Ponle un nombre al proyecto: cómo se llama el trabajo entero.');
      return;
    }
    /**
     * DEJAR LOS PRODUCTOS EN BLANCO.
     *
     * Solo se rechaza si el proyecto YA tiene productos guardados: ahí,
     * vaciarlos sería BORRARLOS, y además la base de datos se negaría a
     * mitad del guardado dejando el proyecto con las medidas en blanco y
     * los productos intactos.
     *
     * En un proyecto NUEVO —o en uno antiguo que todavía no tiene
     * productos propios— dejarlo en blanco se permite, porque es lo que
     * se podía hacer antes de que existieran los productos: a veces solo
     * se sabe el nombre del trabajo. Entonces no se guarda ningún
     * producto y el proyecto sigue enseñando sus columnas, como siempre.
     */
    const hayGuardados = (guardados.data ?? []).some((r) => !r.heredado);
    if (products.every(productoVacio) && hayGuardados) {
      setError('Este proyecto ya tiene productos guardados. Rellena al menos uno, '
        + 'o quita los que no quieras y deja el que sí.');
      return;
    }

    const budget = num(form.budget_amount, 'El presupuesto');
    const advance = num(form.advance_amount, 'El anticipo');
    const hoursFab = num(form.budget_hours_fab, 'Las horas de fabricación');
    const hoursMont = num(form.budget_hours_mont, 'Las horas de montaje');
    if (budget === undefined || advance === undefined || hoursFab === undefined || hoursMont === undefined) return;

    setBusy(true);
    try {
      // Cliente nuevo: se da de alta antes que el proyecto. Solo al
      // CREAR: corrigiendo un proyecto nunca se crea un cliente.
      let clientId = client.id;
      if (!editing && !clientId && client.name.trim()) {
        const created = await createClient({
          kind: client.kind, name: client.name, tax_id: client.tax_id, phone: client.phone,
          email: client.email, address: client.address, city: client.city,
          postal_code: client.postal_code, notes: null,
        });
        clientId = created.id;
      }

      // Las columnas del proyecto se rellenan con el PRIMER producto.
      // No es duplicar datos por gusto: el móvil del trabajador, los
      // informes y las copias de seguridad leen por ahí, y
      // «save_project_products» las mantiene al día después. Así, si el
      // guardado de los productos fallara, el proyecto ya tendría los
      // datos del primero y ninguna pantalla se quedaría en blanco.
      const primero = products.find((x) => !productoVacio(x)) ?? products[0];

      const payload = {
        contact_id: form.contact_id || null,
        name: form.name,
        description: primero.description,
        measures: primero.measures,
        finish: primero.finish,
        location: form.location,
        address: form.address,
        observations: form.observations,
        budget_amount: budget,
        advance_amount: advance,
        budget_hours_fab: hoursFab ?? 0,
        budget_hours_mont: hoursMont ?? 0,
      };

      // El cliente va por su propia función —como la obra, unas líneas más
      // abajo—, para que el historial lo cuente con los dos nombres y para
      // que no se quede una persona de contacto de la otra empresa.
      //
      // Son DOS pasos, no uno: en cuanto esta función responde, el cliente
      // ya está cambiado, aunque lo de abajo fallara. Se ha puesto delante
      // porque es el cambio que la persona ha pedido explícitamente; el
      // resto de los campos los tiene todavía en pantalla para reintentar.
      if (editing && id && clienteCambiado) await setProjectClient(id, client.id!);

      const saved = editing && id
        ? await updateProject(id, payload)
        : await createProject({ ...payload, client_id: clientId! });

      // Los productos van DESPUÉS, con su propia función, que descarta
      // los bloques en blanco y comprueba que quede al menos uno. Si no
      // se ha escrito ninguno, no se llama: el proyecto se queda como
      // los de antes y la lectura con respaldo hace el resto.
      if (!products.every(productoVacio)) {
        await saveProjectProducts(saved.id, products);
      }

      // La obra se cambia con su propia función: así queda escrito en el
      // historial del proyecto Y en el de la obra.
      if ((project.data?.work_id ?? '') !== workId) {
        await setProjectWork(saved.id, workId || null);
      }

      toast.success(editing
        ? (clienteCambiado ? `Proyecto actualizado · cliente: ${client.name}` : 'Proyecto actualizado')
        : `Proyecto ${saved.code} creado`);
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
          <ClientPicker value={client} onChange={elegirCliente} required existingOnly={editing} />

          {editing && !client.id && clienteOriginal?.id && (
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-sm" id="p-client-keep"
                      onClick={() => elegirCliente(clienteOriginal)}>
                Dejar «{clienteOriginal.name}»
              </button>
            </div>
          )}

          {editing && (
            <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
              Cambiar el cliente aquí NO cambia el del presupuesto del que venga el
              proyecto, ni el de la obra: cada uno se cambia en su sitio.
            </p>
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

        <Panel title="Obra" >
          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="p-work">Obra a la que pertenece</label>
            <select id="p-work" className="select" value={workId}
                    onChange={(e) => {
                      setWorkId(e.target.value);
                      // Elegir una obra aquí precarga su cliente igual que
                      // venir desde la obra. Si ya hay cliente, no se toca.
                      if (e.target.value && !editing) precargarDesdeObra(e.target.value);
                    }}>
              <option value="">Proyecto suelto, sin obra</option>
              {(obras.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.code} · {o.name}</option>
              ))}
            </select>
            <p className="hint" style={{ marginBottom: 0 }}>
              Opcional. Una obra agrupa los proyectos de un mismo sitio. El proyecto
              sigue funcionando igual: se planifica, se factura y se trabaja como siempre.
            </p>
          </div>
        </Panel>

        <Panel title="El trabajo">
          <div className="form-grid">
            <Field label="Nombre del proyecto *" htmlFor="p-name" span
                   hint="Cómo se llama el trabajo entero. Por ejemplo: barandillas comunidad Rambla 42.">
              <input id="p-name" className="input" value={form.name} required
                     onChange={(e) => set({ name: e.target.value })} />
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

        <Panel title="Qué se fabrica">
          {guardados.data?.some((r) => r.heredado) && (
            <Alert kind="info">
              Este proyecto se creó cuando solo se podía anotar un producto. Aquí
              está lo que tenía. Si en realidad son varias piezas, añádelas y se
              guardarán por separado.
            </Alert>
          )}
          <ProductBlocks products={products} onChange={setProducts} />
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
