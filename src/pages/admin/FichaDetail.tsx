import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive, ArchiveRestore, ArrowLeft, Building2, CalendarClock, Clock, FolderKanban, Mail,
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
import { assignFichaWorkers, deleteFicha, fichaTeam, getFicha, updateFicha } from '@/services/fichas';
import { convertBudget, projectFromFicha } from '@/services/projects';
import { listPeople } from '@/services/people';
import { FICHA_STATUSES, FICHA_TYPE_LABEL, fichaStatus } from '@/config/constants';
import { fmtDate, fmtDateTime, fmtEur, fmtHours, fmtPhone, fmtTimeShort } from '@/lib/format';
import { telLink, whatsappLink } from '@/lib/whatsapp';

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
    const needsConfirm = ['cancelado', 'cancelada', 'aceptado', 'cerrado'].includes(next);
    if (needsConfirm) {
      const ok = await confirm({
        title: `Cambiar a «${label}»`,
        message: next === 'aceptado'
          ? <>El presupuesto quedará como aceptado. Después podrá convertirse en proyecto.</>
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
      message: <>Se creará un proyecto con los datos de {f.code}. El presupuesto se conserva tal cual.</>,
      confirmLabel: 'Crear el proyecto',
    });
    if (!ok) return;
    setSaving(true);
    try {
      const projectId = await convertBudget(f.id, f.title ?? undefined);
      toast.success('Proyecto creado a partir del presupuesto');
      navigate(`/admin/proyectos/${projectId}`);
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  const phone = f.phone ?? f.client?.phone ?? null;
  const wa = whatsappLink(phone, `Hola, te escribimos de Metalplafer por la ficha ${f.code}.`);
  const tel = telLink(phone);

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to={f.type === 'aviso' ? '/admin/avisos' : '/admin/fichas'}
            style={{ marginBottom: 10 }}>
        <ArrowLeft />{f.type === 'aviso' ? 'Avisos' : 'Fichas'}
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
            {archived && <Badge tone="steel">Archivada</Badge>}
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
              <div className="status-flow" role="group" aria-label="Cambiar estado">
                {FICHA_STATUSES[f.type].map((s) => (
                  <button key={s.key} aria-current={s.key === f.status}
                          disabled={saving || archived || s.key === 'por_asignar'}
                          onClick={() => changeStatus(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="hint" style={{ margin: 0 }}>
                «Por asignar» se deja atrás automáticamente al elegir responsable.
              </p>

              <div className="field" style={{ maxWidth: 340 }}>
                <label htmlFor="assign">
                  {f.type === 'presupuesto' ? 'Quién lo prepara'
                    : f.type === 'visita' ? 'Quién la hace'
                    : 'Trabajador responsable'}
                </label>
                {/* UNA VISITA ES DE ADMINISTRACIÓN. Aquí solo se ofrecen
                    perfiles de administración; la base de datos rechaza
                    cualquier otro, así que la regla NO depende de que esta
                    lista esté bien hecha. */}
                <select id="assign" className="select" value={f.assigned_to ?? ''} disabled={saving || archived}
                        onChange={(e) => assign(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {(people.data ?? [])
                    .filter((p) => f.type !== 'visita' || p.role === 'admin')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}{p.role === 'admin' ? ' (administración)' : ''}
                      </option>
                    ))}
                </select>
                {f.type === 'visita' && (
                  <p className="hint" style={{ marginBottom: 0 }}>
                    Las visitas las lleva administración. Si el trabajo lo tiene que hacer
                    un trabajador, créalo como aviso.
                  </p>
                )}
              </div>
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
          <CommentsPanel owner={{ fichaId: f.id }} />
        </div>
      </div>
    </>
  );
}
