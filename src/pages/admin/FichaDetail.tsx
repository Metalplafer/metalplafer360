import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive, ArchiveRestore, ArrowLeft, Building2, CalendarClock, Check, Clock, FolderKanban, Mail,
  MapPin, MessageCircle, Pencil, Phone, Trash2, UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Badge, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { DocumentsPanel } from '@/components/shared/DocumentsPanel';
import { documentPaths, removeStoredFiles } from '@/services/documents';
import { CommentsPanel } from '@/components/shared/CommentsPanel';
import { HistoryPanel } from '@/components/shared/HistoryPanel';
import { RelatedDocsPanel } from '@/components/shared/RelatedDocsPanel';
import { VisitasPanel } from '@/components/shared/VisitasPanel';
import {
  assignFichaWorkers, deleteFicha, fichaTeam, getFicha, setAvisoBilling, updateFicha,
  visitTargetInfo,
} from '@/services/fichas';
import { convertBudget, projectFromFicha } from '@/services/projects';
import { listPeople } from '@/services/people';
import {
  AVISO_BILLINGS, AVISO_BILLING_LABEL, AVISO_BILLING_TONE,
  FICHA_REVIEWS, FICHA_REVIEW_LABEL, FICHA_REVIEW_TONE, FICHA_STATUSES,
  FICHA_TYPE_LABEL, fichaStatus, type AvisoBilling, type FichaReview,
} from '@/config/constants';
import { fmtDate, fmtDateTime, fmtEur, fmtHours, fmtPhone, fmtTimeShort } from '@/lib/format';
import { telLink, whatsappLink } from '@/lib/whatsapp';

/** ¿Lo que trae el aviso es una de las tres situaciones conocidas? */
const esFacturacion = (v: string | null): v is AvisoBilling =>
  v !== null && (AVISO_BILLINGS as readonly string[]).includes(v);

/** ¿Lo que trae la ficha es una de las tres subfases conocidas? */
const esRevision = (v: string | null): v is FichaReview =>
  v !== null && (FICHA_REVIEWS as readonly string[]).includes(v);

/** Detalle de un presupuesto, una visita o un aviso. */
export default function FichaDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useDialogs();

  const ficha = useAsync(() => getFicha(id), [id]);
  const people = useAsync(() => listPeople(), []);
  // Solo se pide el equipo cuando la ficha es un AVISO: una visita o un
  // presupuesto no lo tienen.
  const equipo = useAsync(
    async () => (ficha.data?.type === 'aviso' ? fichaTeam(id) : []),
    [id, ficha.data?.type],
  );
  // Si este presupuesto ya se convirtió, aquí está su proyecto.
  const project = useAsync(() => projectFromFicha(id), [id, ficha.data?.status]);
  /**
   * MEJORA 2 · DE DÓNDE VIENE UNA VISITA.
   *
   * Si esta ficha es una visita vinculada, se pide el código de su
   * destino para poder volver allí con un enlace. Solo el código y el
   * cliente: no hace falta traerse el proyecto entero.
   */
  const origen = useAsync(async () => {
    const f = ficha.data;
    if (!f || f.type !== 'visita') return null;
    if (f.linked_ficha_id) {
      const d = await visitTargetInfo('presupuesto', f.linked_ficha_id);
      return d && { tipo: 'ficha' as const, id: d.id, code: d.code };
    }
    if (f.linked_project_id) {
      const d = await visitTargetInfo('proyecto', f.linked_project_id);
      return d && { tipo: 'proyecto' as const, id: d.id, code: d.code };
    }
    return null;
  }, [ficha.data?.id, ficha.data?.linked_ficha_id, ficha.data?.linked_project_id]);
  const [saving, setSaving] = useState(false);
  // Se incrementa tras cada acción para volver a pedir el historial.
  const [historyKey, setHistoryKey] = useState(0);
  /**
   * EL EQUIPO DEL AVISO, EN LA PANTALLA.
   *
   * Se guarda aparte de «equipo.data» para que la casilla se mueva EN EL
   * ACTO al pulsarla. Si se pintara directamente de lo que ha devuelto
   * la base de datos, la casilla no se movería hasta que terminara la
   * ida y vuelta, y una casilla que no reacciona al dedo parece rota.
   * Si la base de datos dice no, se deshace y se explica.
   *
   * El RESPONSABLE no entra aquí: sale también en «ficha_team», pero es
   * otra cosa (se elige en el desplegable de arriba). Si se marcara su
   * casilla, desmarcarla no haría nada.
   */
  const [enElAviso, setEnElAviso] = useState<string[]>([]);
  useEffect(() => {
    setEnElAviso((equipo.data ?? [])
      .filter((x) => !x.es_responsable).map((x) => x.worker_id));
  }, [equipo.data]);

  if (ficha.loading && !ficha.data) return <Loading />;
  if (ficha.error) return <ErrorBox message={ficha.error} onRetry={ficha.reload} />;
  if (!ficha.data) return null;

  const f = ficha.data;
  const status = fichaStatus(f.type, f.status);
  const archived = Boolean(f.archived_at);

  const candidatos = (people.data ?? []).filter((p) => p.role === 'worker');

  async function changeStatus(next: string) {
    if (next === f.status) return;
    const label = fichaStatus(f.type, next).label;
    const needsConfirm = ['cancelado', 'cancelada', 'aceptado', 'cerrado',
                          'pendiente_senal'].includes(next);
    if (needsConfirm) {
      const ok = await confirm({
        title: `Cambiar a «${label}»`,
        message: next === 'aceptado'
          ? <>El presupuesto quedará como aceptado. Después podrá convertirse en proyecto.</>
          : next === 'pendiente_senal'
          ? (
            <>El cliente ha aceptado el presupuesto pero todavía no ha pagado la paga y
              señal. Mientras esté así <strong>no se podrá convertir en proyecto</strong>:
              cuando cobréis la señal, pásalo a «Presupuesto aceptado».</>
          )
          : <>La ficha {f.code} pasará a «{label}».</>,
        confirmLabel: 'Cambiar estado',
        danger: next.startsWith('cancel'),
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await updateFicha(f.id, { status: next });
      toast.success(`Estado cambiado a «${label}»`);
      await ficha.reload();
      setHistoryKey((n) => n + 1);
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  /*
    MEJORA 3 · LA SUBFASE DE LA REVISIÓN.

    Pasa por el mismo sitio que el estado —«updateFicha»— porque es una
    columna más de la ficha y las políticas que la protegen son las
    mismas. No hace falta una función aparte.
  */
  async function changeReview(next: FichaReview) {
    setSaving(true);
    try {
      await updateFicha(f.id, { review_status: next });
      toast.success(`Revisión: ${FICHA_REVIEW_LABEL[next]}`);
      await ficha.reload();
      setHistoryKey((n) => n + 1);
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  /*
    MEJORA 7 · TERMINAR EL AVISO, CON O SIN FACTURA.

    Pasa por «setAvisoBilling» y no por «updateFicha» porque mueve DOS
    cosas a la vez —el estado y la situación de facturación— y tienen que
    ir juntas o no ir.
  */
  async function terminarAviso(state: AvisoBilling | null) {
    setSaving(true);
    try {
      await setAvisoBilling(f.id, state);
      toast.success(state ? AVISO_BILLING_LABEL[state] : 'Aviso devuelto a «En curso»');
      await ficha.reload();
      setHistoryKey((n) => n + 1);
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  async function assign(personId: string) {
    setSaving(true);
    try {
      await updateFicha(f.id, { assigned_to: personId || null });
      toast.success(personId ? 'Responsable asignado' : 'Responsable retirado');
      await ficha.reload();
      setHistoryKey((n) => n + 1);
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  /**
   * PONER O QUITAR A ALGUIEN DEL EQUIPO DEL AVISO.
   *
   * Se manda la lista COMPLETA, igual que en los proyectos y en las
   * órdenes: quitar a alguien es volver a mandarla sin él. Así no hay dos
   * caminos distintos para añadir y para quitar.
   */
  async function toggleEquipo(personId: string) {
    const estaba = enElAviso.includes(personId);
    const antes = enElAviso;
    const siguiente = estaba
      ? enElAviso.filter((x) => x !== personId)
      : [...enElAviso, personId];
    setEnElAviso(siguiente);   // la casilla se mueve ya
    setSaving(true);
    try {
      await assignFichaWorkers(f.id, siguiente);
      toast.success(estaba
        ? 'Trabajador retirado del aviso'
        : 'Trabajador asignado al aviso');
      await equipo.reload();
      setHistoryKey((n) => n + 1);
    } catch (e) {
      setEnElAviso(antes);     // no ha podido ser: se deshace
      toast.error(e);
    } finally { setSaving(false); }
  }

  async function toggleArchive() {
    const ok = await confirm({
      title: archived ? 'Recuperar ficha' : 'Archivar ficha',
      message: archived
        ? <>La ficha {f.code} volverá a los listados.</>
        : <>La ficha {f.code} desaparecerá de los listados, pero no se borra: conserva documentos e historial.</>,
      confirmLabel: archived ? 'Recuperar' : 'Archivar',
      danger: !archived,
    });
    if (!ok) return;
    try {
      await updateFicha(f.id, { archived_at: archived ? null : new Date().toISOString() });
      toast.success(archived ? 'Ficha recuperada' : 'Ficha archivada');
      await ficha.reload();
      setHistoryKey((n) => n + 1);
    } catch (e) { toast.error(e); }
  }

  /**
   * ELIMINAR la ficha. Archivar y eliminar conviven a propósito:
   * archivar la quita de los listados y lo conserva todo; eliminar la
   * borra de verdad, con sus comentarios y sus archivos.
   *
   * Los archivos del almacén se retiran ANTES: al borrar la ficha, sus
   * documentos se van en cascada y los archivos se quedarían huérfanos
   * ocupando sitio para siempre.
   */
  async function eliminar() {
    const ok = await confirm({
      title: `¿Estás seguro de que quieres eliminar ${f.code}?`,
      message: (
        <>
          Se borrarán también sus comentarios y sus archivos. Esto no se puede deshacer.
          <div style={{ marginTop: 8 }}>
            Si solo quieres quitarla de los listados, <strong>archívala</strong>:
            se conserva todo.
          </div>
        </>
      ),
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      const rutas = await documentPaths({ fichaId: f.id });
      await deleteFicha(f.id);
      await removeStoredFiles(rutas).catch(() => undefined);
      toast.success(`${f.code} se ha eliminado`);
      navigate('/admin/fichas');
    } catch (e) { toast.error(e); }
  }

  async function convert() {
    const ok = await confirm({
      title: 'Convertir en proyecto',
      message: (
        <>
          Se creará un proyecto con los datos de {f.code}. El presupuesto se conserva tal
          cual, y sus archivos se verán desde el proyecto sin copiarse.
        </>
      ),
      confirmLabel: 'Crear el proyecto',
    });
    if (!ok) return;
    setSaving(true);
    try {
      const projectId = await convertBudget(f.id, f.title ?? undefined);
      toast.success('Proyecto creado a partir del presupuesto');
      navigate(`/admin/proyectos/${projectId}`);
    } catch (e) {
      /**
       * MEJORA 1 · DOS INTENTOS, UN SOLO PROYECTO.
       *
       * La base de datos ya impide crear un segundo proyecto del mismo
       * presupuesto: «source_ficha_id» es único y la función lo
       * comprueba antes. Pero si alguien pulsa dos veces —o lo intenta
       * desde dos pestañas—, lo que veía era un error crudo y se
       * quedaba sin saber qué había pasado.
       *
       * Así que se mira si YA existe el proyecto y se lleva a él. No se
       * crea nada: solo se lee para poder explicarlo.
       */
      try {
        const ya = await projectFromFicha(f.id);
        if (ya) {
          toast.success(`Este presupuesto ya es el proyecto ${ya.code}`);
          navigate(`/admin/proyectos/${ya.id}`);
          return;
        }
      } catch { /* si tampoco se puede consultar, manda el error original */ }
      toast.error(e);
    } finally { setSaving(false); }
  }

  const phone = f.phone ?? f.client?.phone ?? null;
  const wa = whatsappLink(phone, `Hola, te escribimos de Metalplafer por la ficha ${f.code}.`);
  const tel = telLink(phone);

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to={f.type === 'aviso' ? '/admin/avisos' : '/admin/fichas'}
            style={{ marginBottom: 10 }}>
        <ArrowLeft />{f.type === 'aviso' ? 'Avisos' : 'Presupuestos'}
      </Link>

      <PageHeader
        title={
          <span className="ficha-head">
            <span className="plate plate-dark" style={{ fontSize: '1.2rem', padding: '5px 16px' }}>{f.code}</span>
            <span>{f.title ?? FICHA_TYPE_LABEL[f.type]}</span>
          </span>
        }
        sub={
          <span className="row" style={{ gap: 8 }}>
            <Badge tone="neutral" plain>{FICHA_TYPE_LABEL[f.type]}</Badge>
            <Badge tone={status.tone}>{status.label}</Badge>
            {f.type === 'aviso' && esFacturacion(f.billing_state) && (
              <Badge tone={AVISO_BILLING_TONE[f.billing_state]}>
                {AVISO_BILLING_LABEL[f.billing_state]}
              </Badge>
            )}
            {f.type === 'presupuesto' && esRevision(f.review_status) && (
              <Badge tone={FICHA_REVIEW_TONE[f.review_status]}>
                {FICHA_REVIEW_LABEL[f.review_status]}
              </Badge>
            )}
            {archived && <Badge tone="steel">Archivada</Badge>}
            {/*
              MEJORA 2 · VOLVER AL PRESUPUESTO O AL PROYECTO DE ORIGEN.
              Se pedía una navegación clara en los dos sentidos: desde la
              ficha de origen se ve la visita, y desde la visita se
              vuelve con un enlace que dice a qué pertenece.
            */}
            {origen.data && (
              <Link to={origen.data.tipo === 'proyecto'
                ? `/admin/proyectos/${origen.data.id}`
                : `/admin/fichas/${origen.data.id}`}>
                Visita técnica de {origen.data.code}
              </Link>
            )}
            <span className="faint">Creada el {fmtDate(f.created_at)}</span>
          </span>
        }
        actions={<>
          <Link className="btn" to={`/admin/fichas/${f.id}/editar`}><Pencil />Editar</Link>
          <button className="btn" onClick={toggleArchive}>
            {archived ? <><ArchiveRestore />Recuperar</> : <><Archive />Archivar</>}
          </button>
          <button className="btn btn-danger" onClick={eliminar}>
            <Trash2 />Eliminar
          </button>
        </>}
      />

      {archived && (
        <div style={{ marginBottom: 16 }}>
          <Alert kind="warn">Esta ficha está archivada. Se conserva todo, pero no aparece en los listados.</Alert>
        </div>
      )}

      {/* Pendiente de paga y señal: se dice que falta cobrar y NO se
          ofrece el botón. Si alguien forzara la llamada, la base de datos
          la rechaza igual con el mismo motivo. */}
      {f.type === 'presupuesto' && f.status === 'pendiente_senal' && !archived && (
        <div style={{ marginBottom: 16 }}>
          <Alert kind="warn">
            <strong>Falta cobrar la paga y señal.</strong>
            <div style={{ marginTop: 2 }}>
              El cliente ya ha aceptado el presupuesto, así que el trabajo está dado por
              bueno, pero todavía no se puede convertir en proyecto. Cuando entre la
              señal, pásalo a «Presupuesto aceptado».
            </div>
          </Alert>
        </div>
      )}

      {f.type === 'presupuesto' && f.status === 'aceptado' && !archived && (
        <div style={{ marginBottom: 16 }}>
          {project.data ? (
            <Alert kind="ok" action={
              <Link className="btn btn-sm" to={`/admin/proyectos/${project.data.id}`}>Ver proyecto</Link>
            }>
              Este presupuesto ya es el proyecto <strong>{project.data.code}</strong>.
            </Alert>
          ) : (
            <Alert kind="ok" action={
              <button className="btn btn-sm btn-primary" onClick={convert} disabled={saving}>
                <FolderKanban />Convertir en proyecto
              </button>
            }>
              Presupuesto aceptado. Ya puede convertirse en proyecto.
            </Alert>
          )}
        </div>
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Panel title="Estado">
            <div className="stack">
              {/* «Por asignar» ya no se ofrece en presupuestos ni avisos:
                  no nacen ahí. Pero SÍ se pinta si la ficha lo tiene,
                  porque hay fichas antiguas en ese estado y esconderlo
                  dejaría su propia situación fuera del recorrido. */}
              <div className="status-flow" role="group" aria-label="Cambiar estado">
                {FICHA_STATUSES[f.type]
                  .filter((s) => s.key !== 'por_asignar'
                    || f.type === 'visita' || f.status === 'por_asignar')
                  .map((s) => (
                  <button key={s.key} aria-current={s.key === f.status}
                          disabled={saving || archived || s.key === 'por_asignar'}
                          onClick={() => changeStatus(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="hint" style={{ margin: 0 }}>
                {f.type === 'visita'
                  ? '«Por asignar» se deja atrás automáticamente al elegir quién la hace.'
                  : f.type === 'aviso'
                  ? 'Un aviso pasa a «Asignado» al repartirlo entre operarios, ahí abajo.'
                  : 'El presupuesto empieza en «Pendiente» y avanza desde aquí.'}
              </p>

              {/*
                MEJORA 7 · CÓMO TERMINA UN AVISO.

                No se factura todo, así que al darlo por hecho hay que
                decir cuál de las dos cosas es. Y una vez pendiente, el
                tic de facturado.

                Se enseña desde que el aviso está en marcha: antes de eso
                no hay nada que terminar.
              */}
              {f.type === 'aviso' && f.status !== 'por_asignar' && (
                <div className="stack" style={{ gap: 6 }}>
                  <span className="label">Al terminarlo</span>
                  <div className="status-flow" role="group" aria-label="Cómo termina el aviso">
                    <button aria-current={f.billing_state === 'pendiente'}
                            disabled={saving || archived}
                            onClick={() => terminarAviso('pendiente')}>
                      Realizado, pendiente de facturar
                    </button>
                    <button aria-current={f.billing_state === 'sin_facturacion'}
                            disabled={saving || archived}
                            onClick={() => terminarAviso('sin_facturacion')}>
                      Realizado y finalizado
                    </button>
                  </div>

                  {f.billing_state === 'pendiente' && (
                    <button className="btn btn-primary" disabled={saving || archived}
                            onClick={() => terminarAviso('facturado')}>
                      <Check />Marcar como facturado
                    </button>
                  )}

                  {f.billing_state === 'facturado' && (
                    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <Badge tone="green">Facturado</Badge>
                      <button className="btn btn-sm btn-ghost" disabled={saving || archived}
                              onClick={() => terminarAviso('pendiente')}>
                        Deshacer
                      </button>
                    </div>
                  )}

                  <p className="hint" style={{ margin: 0 }}>
                    Marcar como facturado deja constancia aquí y lo saca del panel.
                    METALPLAFER360 no emite ninguna factura ni habla con la contabilidad.
                  </p>
                </div>
              )}

              {/*
                MEJORA 3 · LAS TRES SUBFASES DE LA REVISIÓN.

                Solo aparece mientras el presupuesto está «por revisar»:
                fuera de ese estado la subfase no existe y la base de
                datos la vacía sola, así que enseñarla sería enseñar algo
                que no se puede cambiar.

                Desde «Denegado» se puede volver a «Por revisar», que es
                lo que pasa cuando se rehace y vuelve a mirarse.
              */}
              {f.type === 'presupuesto' && f.status === 'por_revisar' && (
                <div className="stack" style={{ gap: 6 }}>
                  <span className="label">Revisión</span>
                  <div className="status-flow" role="group" aria-label="Subfase de la revisión">
                    {FICHA_REVIEWS.map((r) => (
                      <button key={r} aria-current={r === f.review_status}
                              disabled={saving || archived}
                              onClick={() => changeReview(r)}>
                        {FICHA_REVIEW_LABEL[r]}
                      </button>
                    ))}
                  </div>
                  <p className="hint" style={{ margin: 0 }}>
                    Al salir de «Por revisar», esta marca se borra sola: pertenece a la
                    revisión, no al presupuesto.
                  </p>
                </div>
              )}

              {/* EL RESPONSABLE SOLO EXISTE EN LAS VISITAS.
                  Un presupuesto lo prepara quien lo prepare, y eso es
                  gestión interna. Un aviso necesita OPERARIOS, que se
                  reparten en el panel de abajo.
                  «fichas.assigned_to» no se borra: las visitas la usan y
                  las fichas antiguas conservan su valor. */}
              {f.type === 'visita' && (
                <div className="field" style={{ maxWidth: 340 }}>
                  <label htmlFor="assign">Quién la hace</label>
                  {/* UNA VISITA ES DE ADMINISTRACIÓN. Aquí solo se ofrecen
                      perfiles de administración; la base de datos rechaza
                      cualquier otro, así que la regla NO depende de que esta
                      lista esté bien hecha. */}
                  <select id="assign" className="select" value={f.assigned_to ?? ''} disabled={saving || archived}
                          onChange={(e) => assign(e.target.value)}>
                    <option value="">Sin asignar</option>
                    {(people.data ?? [])
                      .filter((p) => p.role === 'admin')
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}{p.role === 'admin' ? ' (administración)' : ''}
                        </option>
                      ))}
                  </select>
                  <p className="hint" style={{ marginBottom: 0 }}>
                    Las visitas las lleva administración. Si el trabajo lo tiene que hacer
                    un trabajador, créalo como aviso.
                  </p>
                </div>
              )}
            </div>
          </Panel>

          {/* ---------------------------------------------------------------
              EL EQUIPO DEL AVISO

              Solo para los AVISOS. Un aviso lo puede atender más de una
              persona, y cada una apunta sus propias horas en su parte. El
              responsable de arriba sigue siendo el responsable: esto es su
              equipo, no un sustituto.

              Las visitas y los presupuestos no tienen equipo: los lleva
              administración. La base de datos rechaza repartir una visita,
              así que esto no se sostiene solo en no pintar el panel.
              --------------------------------------------------------------- */}
          {f.type === 'aviso' && (
            <Panel title="Trabajadores del aviso">
              {equipo.loading && !equipo.data ? <Loading /> : (
                <div className="stack">
                  {!candidatos.length ? (
                    <p className="muted" style={{ margin: 0 }}>
                      Todavía no hay trabajadores dados de alta.
                    </p>
                  ) : (
                    <div className="substatus-grid">
                      {candidatos.map((p) => (
                        <label key={p.id} className="checkbox">
                          <input type="checkbox" checked={enElAviso.includes(p.id)}
                                 disabled={saving || archived}
                                 onChange={() => toggleEquipo(p.id)} />
                          {p.full_name}
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="hint" style={{ margin: 0 }}>
                    Puedes asignar varios. Cada uno verá el aviso en sus trabajos y
                    apuntará sus propias horas en su parte.
                  </p>
                </div>
              )}
            </Panel>
          )}

          <Panel title="Datos" actions={
            <div className="row" style={{ gap: 6 }}>
              {tel && <a className="btn btn-sm" href={tel}><Phone />Llamar</a>}
              {wa && <a className="btn btn-sm" href={wa} target="_blank" rel="noopener noreferrer">
                <MessageCircle />WhatsApp
              </a>}
            </div>
          }>
            <dl className="kv">
              <dt><span className="row" style={{ gap: 6 }}><Building2 size={15} />Cliente</span></dt>
              <dd>
                {f.client
                  ? <Link to={`/admin/clientes/${f.client.id}`}>{f.client.name}</Link>
                  : <span className="faint">Sin cliente todavía</span>}
              </dd>

              {f.contact && (<><dt>Contacto</dt><dd>{f.contact.name}</dd></>)}

              <dt><span className="row" style={{ gap: 6 }}><Phone size={15} />Teléfono</span></dt>
              <dd className="num">{fmtPhone(phone)}</dd>

              <dt><span className="row" style={{ gap: 6 }}><MapPin size={15} />Dirección del trabajo</span></dt>
              <dd>{f.address ?? '—'}</dd>

              {f.type !== 'presupuesto' && (
                <>
                  <dt><span className="row" style={{ gap: 6 }}><CalendarClock size={15} />
                    {f.type === 'visita' ? 'Fecha y hora' : 'Prevista para'}</span></dt>
                  <dd>
                    {f.scheduled_date
                      ? `${fmtDate(f.scheduled_date)}${f.scheduled_time ? ` a las ${fmtTimeShort(f.scheduled_time)}` : ''}`
                      : '—'}
                  </dd>
                </>
              )}

              {/* BLOQUE 5: el correo y las horas, que es lo que le faltaba al
                  aviso para poder facturarlo. */}
              {f.type === 'aviso' && f.email && (
                <>
                  <dt><span className="row" style={{ gap: 6 }}><Mail size={15} />Correo</span></dt>
                  <dd>{f.email}</dd>
                </>
              )}

              {f.type === 'aviso' && (
                <>
                  <dt><span className="row" style={{ gap: 6 }}><Clock size={15} />Horas dedicadas</span></dt>
                  <dd className="num">
                    {f.hours != null ? fmtHours(f.hours) : <span className="faint">Sin anotar</span>}
                  </dd>
                </>
              )}

              {f.type !== 'visita' && (
                <>
                  <dt>Importe</dt>
                  <dd className="num">
                    {f.amount != null ? fmtEur(f.amount) : <span className="faint">Sin importe</span>}
                  </dd>
                </>
              )}

              <dt><span className="row" style={{ gap: 6 }}><UserRound size={15} />Responsable</span></dt>
              <dd>{f.assignee?.full_name ?? <span className="faint">Sin asignar</span>}</dd>

              <dt>Descripción</dt>
              <dd className="pre">{f.description ?? '—'}</dd>

              <dt>Última modificación</dt>
              <dd>{fmtDateTime(f.updated_at)}</dd>
            </dl>
          </Panel>

          <HistoryPanel entityCode={f.code} reloadKey={String(historyKey)} />
        </div>

        <div className="stack">
          <DocumentsPanel owner={{ fichaId: f.id }}
            onChange={() => setHistoryKey((k) => k + 1)} />
          {/*
            MEJORA 2 · Los planos y las fotos de las visitas técnicas
            vinculadas a esta ficha, sin copiar ningún archivo.
          */}
          {f.type !== 'visita' && (
            <RelatedDocsPanel paraTipo={f.type === 'aviso' ? 'aviso' : 'presupuesto'}
                              paraId={f.id} reloadKey={String(historyKey)} />
          )}
          {/*
            Las visitas se asignan a un presupuesto o a un aviso. Una
            visita no tiene visitas: ahí el panel no se enseña.
          */}
          {f.type !== 'visita' && (
            <VisitasPanel paraTipo={f.type === 'aviso' ? 'aviso' : 'presupuesto'}
                          paraId={f.id} codigo={f.code} clientId={f.client_id}
                          onChange={() => setHistoryKey((k) => k + 1)} />
          )}
          <CommentsPanel owner={{ fichaId: f.id }} />
        </div>
      </div>
    </>
  );
}
