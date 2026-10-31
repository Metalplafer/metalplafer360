import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Field, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { ClientPicker, emptyClient, type ClientDraft } from '@/components/shared/ClientPicker';
import { createClient, getClient } from '@/services/clients';
import {
  createFicha, getFicha, linkVisit, setFichaClient, updateFicha, visitTargetInfo,
} from '@/services/fichas';
import { listPeople } from '@/services/people';
import { FICHA_CODE_PREFIX, FICHA_NEW_TITLE, FICHA_TYPE_LABEL } from '@/config/constants';
import { parseDecimal, parseHours } from '@/lib/format';
import { parseSolicitud, parseVincular, rutaDestino } from '@/lib/vinculos';
import { getMailRequest, linkMailRequest } from '@/services/mail';
import { toUserMessage } from '@/lib/errors';
import type { FichaType } from '@/types/db';

const TYPES: FichaType[] = ['presupuesto', 'visita', 'aviso'];
const isType = (v: string | null): v is FichaType => TYPES.includes(v as FichaType);

/**
 * MEJORA 2 · «proyecto:<id>» o «presupuesto:<id>» → a qué se vincula.
 *
 * Se valida la forma en lugar de confiarse: lo que llega por la
 * dirección lo puede escribir cualquiera, y con un texto raro el
 * formulario tiene que seguir funcionando como si no hubiera nada.
 */
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

  /**
   * MEJORA 2 · A QUÉ SE VA A VINCULAR ESTA VISITA.
   *
   * Llega en la dirección como «proyecto:<id>» o «presupuesto:<id>»,
   * puesto por el botón «Asignar visita técnica» del presupuesto o del
   * proyecto. Si no viene, el formulario funciona exactamente como
   * siempre.
   */
  const vincular = parseVincular(params.get('vincular'));
  /**
   * MEJORA 6 · LA SOLICITUD DE LA QUE SALE ESTA FICHA.
   *
   * La bandeja de entrada no crea presupuestos por su cuenta: trae aquí,
   * al formulario de siempre, con el tipo elegido y el identificador de
   * la solicitud. Al guardar, la ficha queda vinculada a ella.
   */
  const solicitud = parseSolicitud(params.get('solicitud'));
  const destino = useAsync(
    async () => (vincular && !editing ? visitTargetInfo(vincular.tipo, vincular.id) : null),
    [vincular?.tipo, vincular?.id, editing],
  );
  const [client, setClient] = useState<ClientDraft>(emptyClient);
  /**
   * El cliente con el que se abrió la ficha. Hace falta para dos cosas:
   * para saber si de verdad se ha cambiado —y no escribir en el
   * historial un cambio que no ha pasado— y para poder volver a dejarlo
   * como estaba si quien lo abrió se arrepiente.
   */
  const [clienteOriginal, setClienteOriginal] = useState<ClientDraft | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', address: '', phone: '', email: '',
    scheduled_date: '', scheduled_time: '', assigned_to: '', amount: '', hours: '',
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

  /**
   * LO QUE SE TRAE DE LA SOLICITUD, Y LO QUE NO.
   *
   * Hasta ahora no se traía NADA: la bandeja abría este formulario en
   * blanco y había que volver a escribir a mano lo que el cliente ya
   * había contado. Se copiaba con la vista, con sus erratas, y el
   * correo original se quedaba atrás.
   *
   * Se traen dos cosas, y cada una va al campo que le corresponde:
   *
   *   · el ASUNTO del correo → el título de la ficha. Es el nombre que
   *     le puso quien escribió; si era un reenvío, el asunto original,
   *     porque el del reenvío suele ser «RV: …»;
   *   · las OBSERVACIONES INTERNAS → la descripción. Son las notas que
   *     administración escribió al revisar la solicitud: «instalar cable
   *     radio», «repasar fotocélula». Eso es exactamente lo que el
   *     trabajador necesita leer, y la descripción es el único campo de
   *     la ficha que sirve para decirlo.
   *
   * Y NO SE TRAE EL CUERPO DEL CORREO. A propósito. Un correo de cliente
   * es una conversación entera —saludos, quejas, historia del motor— y
   * volcarlo en la descripción enterraría las instrucciones de trabajo
   * en medio de un texto largo. El cuerpo se queda donde ya estaba, en
   * la solicitud, íntegro, y ahora se lee DESDE la ficha gracias al
   * panel «De dónde viene» del detalle. Nada se pierde y nada se mezcla.
   *
   * Solo rellena campos VACÍOS: si alguien ya ha escrito algo, no se le
   * pisa. Y si la solicitud no se puede leer, el formulario se queda en
   * blanco y funciona igual que siempre.
   */
  useEffect(() => {
    if (!solicitud || editing) return;
    let vigente = true;
    getMailRequest(solicitud).then((m) => {
      if (!vigente) return;
      const asunto = (m.original_subject ?? m.subject ?? '').trim();
      const notas = (m.notes ?? '').trim();
      setForm((f) => ({
        ...f,
        title: f.title.trim() ? f.title : asunto,
        description: f.description.trim() ? f.description : notas,
      }));
    }).catch(() => undefined);
    return () => { vigente = false; };
  }, [solicitud, editing]);

  /**
   * MEJORA 2 · La visita se hace EN EL MISMO SITIO que el trabajo, así
   * que la dirección del presupuesto o del proyecto se trae puesta. Solo
   * si el campo está vacío: si alguien ya ha escrito otra, no se le pisa.
   */
  useEffect(() => {
    const dir = destino.data?.address;
    if (!dir || editing) return;
    setForm((f) => (f.address.trim() ? f : { ...f, address: dir }));
  }, [destino.data?.address, editing]);

  // Datos de la ficha que se está editando
  useEffect(() => {
    const f = ficha.data;
    if (!f) return;
    setType(f.type);
    setForm({
      title: f.title ?? '', description: f.description ?? '', address: f.address ?? '',
      phone: f.phone ?? '', email: f.email ?? '',
      scheduled_date: f.scheduled_date ?? '', scheduled_time: f.scheduled_time?.slice(0, 5) ?? '',
      assigned_to: f.assigned_to ?? '',
      amount: f.amount != null ? String(f.amount).replace('.', ',') : '',
      hours: f.hours != null ? String(f.hours).replace('.', ',') : '',
    });
    if (f.client) {
      const actual: ClientDraft = {
        id: f.client.id, kind: f.client.kind, name: f.client.name, tax_id: '',
        phone: f.client.phone ?? '', email: '', address: '', city: '', postal_code: '',
      };
      setClient(actual);
      setClienteOriginal(actual);
    } else {
      setClienteOriginal({ ...emptyClient });
    }
  }, [ficha.data]);

  /**
   * ¿Se ha cambiado el cliente?
   *
   * Solo cuenta haber ELEGIDO otro de la lista. Dejar el buscador vacío
   * no es «quitar el cliente»: eso borraría un dato que nadie ha pedido
   * borrar, así que no se toca.
   */
  const clienteCambiado = editing
    && Boolean(client.id) && client.id !== (clienteOriginal?.id ?? null);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  /**
   * CAMBIAR EL TIPO DE FICHA.
   *
   * Si se pasa a VISITA y había elegido un trabajador, se deja «Sin
   * asignar»: una visita solo se puede asignar a administración, y dejar
   * dentro un responsable que la lista ya no ofrece haría que el
   * formulario pareciera correcto y lo rechazara la base de datos al
   * guardar. Mejor que se vea aquí.
   */
  function cambiarTipo(t: FichaType) {
    setType(t);
    // El responsable solo existe en las visitas, así que al salir de
    // visita se limpia: si no, un presupuesto se guardaría con un
    // responsable que su formulario ya no enseña.
    if (t !== 'visita') { set({ assigned_to: '' }); return; }
    if (!form.assigned_to) return;
    const elegido = (people.data ?? []).find((p) => p.id === form.assigned_to);
    if (elegido && elegido.role !== 'admin') set({ assigned_to: '' });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Reglas mínimas antes de enviar
    if (type !== 'visita' && !client.id && !client.name.trim()) {
      setError('Un presupuesto o un aviso necesitan siempre un cliente.');
      return;
    }
    // Al EDITAR solo se elige entre los que ya existen. Si se ha escrito
    // un nombre sin elegir de la lista, se para aquí: guardar sin más
    // dejaría el cliente de antes y haría creer que se ha cambiado.
    if (editing && !client.id && client.name.trim()) {
      setError('Elige el cliente de la lista que sale al escribir. Si todavía no existe, '
               + 'dalo de alta en Clientes y vuelve aquí.');
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
    const hours = form.hours.trim() ? parseHours(form.hours) : null;
    if (form.hours.trim() && !hours) {
      setError('Las horas no son válidas. Escríbelas así: 2 o 1,5');
      return;
    }

    setBusy(true);
    try {
      // Si el cliente es nuevo, se da de alta primero. Solo al CREAR:
      // corrigiendo una ficha nunca se crea un cliente.
      let clientId = client.id;
      if (!editing && !clientId && client.name.trim()) {
        const created = await createClient({
          kind: client.kind, name: client.name, tax_id: client.tax_id, phone: client.phone,
          email: client.email, address: client.address, city: client.city,
          postal_code: client.postal_code, notes: null,
        });
        clientId = created.id;
      }

      const payload = {
        type,
        title: form.title,
        description: form.description,
        address: form.address,
        phone: form.phone,
        email: form.email,
        scheduled_date: form.scheduled_date || null,
        scheduled_time: form.scheduled_time || null,
        assigned_to: form.assigned_to || null,
        amount,
        hours,
      };

      // El cliente va por su propia función: así el historial lo cuenta
      // con los dos nombres y la persona de contacto del cliente
      // anterior no se queda puesta.
      //
      // Son DOS pasos, no uno: en cuanto responde, el cliente ya está
      // cambiado, aunque el guardado de abajo fallara.
      if (editing && id && clienteCambiado) await setFichaClient(id, client.id);

      const saved = editing && id
        ? await updateFicha(id, payload)
        : await createFicha({ ...payload, client_id: clientId });

      /**
       * MEJORA 2 · LA VISITA NACE VINCULADA.
       *
       * Son dos pasos y no uno, a propósito: la ficha se crea por donde
       * se han creado siempre —el mismo formulario, las mismas
       * validaciones, el mismo código VIS-AAAA-###— y después se
       * vincula. Meter las dos cosas en una función de la base de datos
       * obligaría a reescribir el alta de fichas ahí dentro, que es
       * justo lo que se pidió no hacer.
       *
       * Si el segundo paso falla, la visita YA está creada y se dice con
       * esas palabras: se queda sin vincular y se puede vincular a mano
       * desde el presupuesto o el proyecto con «Vincular existente». Lo
       * que no pasa es que se pierda la visita.
       */
      if (!editing && vincular && saved.type === 'visita') {
        try {
          await linkVisit(saved.id, vincular.tipo === 'proyecto'
            ? { projectId: vincular.id }
            : { fichaId: vincular.id });
          toast.success(`Visita ${saved.code} creada y vinculada`);
          navigate(rutaDestino(vincular));
          return;
        } catch (err) {
          toast.error(`La visita ${saved.code} se ha creado, pero no se ha podido vincular: `
            + `${toUserMessage(err)} Puedes vincularla desde la ficha de origen.`);
          navigate(`/admin/fichas/${saved.id}`);
          return;
        }
      }

      /**
       * MEJORA 6 · LA FICHA QUEDA ATADA A SU SOLICITUD.
       *
       * Dos pasos, como con las visitas, y por lo mismo: la ficha se
       * crea por donde se han creado siempre y después se vincula.
       * Meter las dos cosas en una función de la base de datos obligaría
       * a reescribir el alta de fichas ahí dentro.
       *
       * Si el segundo paso falla, la ficha YA está creada y se dice con
       * esas palabras: la solicitud se queda sin vincular y se puede
       * vincular a mano. Lo que no pasa es que se pierda el trabajo.
       */
      if (!editing && solicitud) {
        try {
          await linkMailRequest(solicitud, { fichaId: saved.id });
          toast.success(`${saved.code} creada desde la solicitud`);
          navigate(`/admin/solicitudes/${solicitud}`);
          return;
        } catch (err) {
          toast.error(`${saved.code} se ha creado, pero no se ha podido vincular con la `
            + `solicitud: ${toUserMessage(err)} Vincúlala desde la bandeja.`);
          navigate(`/admin/fichas/${saved.id}`);
          return;
        }
      }

      toast.success(editing
        ? (clienteCambiado ? `Ficha actualizada · cliente: ${client.name}` : 'Ficha actualizada')
        : `Ficha ${saved.code} creada`);
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
      {/*
        MEJORA 2 · Si se ha entrado desde un presupuesto o un proyecto,
        el botón de volver lleva ALLÍ y no al listado de fichas: se pedía
        una navegación clara en los dos sentidos.
      */}
      {solicitud && !editing ? (
        <Link className="btn btn-sm btn-ghost" style={{ marginBottom: 10 }}
              to={`/admin/solicitudes/${solicitud}`}>
          <ArrowLeft />Volver a la solicitud
        </Link>
      ) : vincular && !editing ? (
        <Link className="btn btn-sm btn-ghost" style={{ marginBottom: 10 }}
              to={rutaDestino(vincular)}>
          <ArrowLeft />Volver a {destino.data?.code ?? (vincular.tipo === 'proyecto' ? 'el proyecto' : 'la ficha')}
        </Link>
      ) : (
        <Link className="btn btn-sm btn-ghost" to="/admin/fichas" style={{ marginBottom: 10 }}>
          <ArrowLeft />Fichas
        </Link>
      )}

      <PageHeader
        title={editing ? `Editar ${label.toLowerCase()} ${ficha.data?.code ?? ''}` : FICHA_NEW_TITLE[type]}
        sub={editing ? undefined : `Se le asignará el código ${FICHA_CODE_PREFIX[type]}-${new Date().getFullYear()}-###`}
      />

      <form onSubmit={submit} className="stack" style={{ maxWidth: 860 }} noValidate>
        {error && <Alert kind="danger">{error}</Alert>}

        {/* De qué solicitud sale esta ficha, dicho antes de guardar. */}
        {solicitud && !editing && (
          <Alert kind="info">
            Esta ficha quedará <strong>vinculada a la solicitud</strong> de la que sale, y los
            archivos que mandó el cliente por correo se verán desde ella sin copiarse.
          </Alert>
        )}

        {/* A qué va a quedar vinculada esta visita, dicho antes de guardar. */}
        {vincular && !editing && type === 'visita' && (
          <Alert kind="info">
            Esta visita técnica quedará vinculada a{' '}
            <strong>{destino.data?.code ?? (vincular.tipo === 'proyecto' ? 'el proyecto' : 'la ficha')}</strong>.
            Sus documentos y fotografías se verán también desde allí, sin copiarse.
          </Alert>
        )}
        {vincular && !editing && type !== 'visita' && (
          <Alert kind="warn">
            Solo las visitas técnicas se vinculan a un presupuesto o a un proyecto. Como has
            cambiado el tipo, esta ficha se creará sin vincular.
          </Alert>
        )}

        {!editing && (
          <Panel title="Tipo de ficha">
            <div className="segmented" role="group" aria-label="Tipo de ficha">
              {TYPES.map((t) => (
                <button key={t} type="button" aria-pressed={type === t}
                        onClick={() => cambiarTipo(t)}>
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
          <ClientPicker value={client} onChange={setClient}
                        required={type !== 'visita'} existingOnly={editing} />

          {editing && !client.id && clienteOriginal?.id && (
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-sm" id="f-client-keep"
                      onClick={() => setClient(clienteOriginal)}>
                Dejar «{clienteOriginal.name}»
              </button>
            </div>
          )}

          {editing && (
            <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
              Cambiar el cliente aquí NO cambia el de nada más: si este presupuesto ya se
              convirtió en proyecto, el proyecto se queda con el suyo y hay que cambiarlo
              allí también.
            </p>
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
              <>
                <Field label="Teléfono de contacto" htmlFor="f-phone"
                       hint="A quién llamar para este aviso.">
                  <input id="f-phone" className="input" inputMode="tel" value={form.phone}
                         onChange={(e) => set({ phone: e.target.value })} />
                </Field>

                <Field label="Correo electrónico" htmlFor="f-email"
                       hint="Opcional. Para tener el dato al facturar; la aplicación no envía correos.">
                  <input id="f-email" className="input" type="email" value={form.email}
                         onChange={(e) => set({ email: e.target.value })} />
                </Field>
              </>
            )}

            {/* El importe es para presupuestos y para avisos: un trabajo de
                mostrador también se cobra. */}
            {type !== 'visita' && (
              <Field label="Importe" htmlFor="f-amount"
                     hint={type === 'aviso'
                       ? 'Lo que se cobra por el trabajo. Opcional.'
                       : 'Opcional. Por ejemplo: 6400 o 6.400,50'}>
                <input id="f-amount" className="input" inputMode="decimal" value={form.amount}
                       onChange={(e) => set({ amount: e.target.value })} />
              </Field>
            )}

            {type === 'aviso' && (
              <Field label="Horas dedicadas" htmlFor="f-hours"
                     hint="Las que ha llevado el trabajo. Por ejemplo: 0,75 o 2">
                <input id="f-hours" className="input" inputMode="decimal" value={form.hours}
                       onChange={(e) => set({ hours: e.target.value })} />
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

            {/* EL RESPONSABLE SOLO EXISTE EN LAS VISITAS.
                Un presupuesto lo prepara quien lo prepare y eso es
                gestión interna, no un dato de la ficha. Un aviso lo que
                necesita es saber qué OPERARIOS van, y eso se reparte
                desde la propia ficha una vez creada.
                Y una visita es de administración: la lista solo ofrece
                perfiles de administración, y la base de datos rechaza
                cualquier otro, así que la regla no depende de que esta
                lista esté bien filtrada. */}
            {type === 'visita' && (
              <Field label="Quién la hace" htmlFor="f-assigned" span
                     hint="Las visitas las lleva administración. Si el trabajo lo tiene que
                           hacer un trabajador, créalo como aviso.">
                <select id="f-assigned" className="select" value={form.assigned_to}
                        onChange={(e) => set({ assigned_to: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {(people.data ?? [])
                    .filter((p) => p.role === 'admin')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} (administración)
                      </option>
                    ))}
                </select>
              </Field>
            )}
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
