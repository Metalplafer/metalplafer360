import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive, ArchiveRestore, ArrowLeft, Building2, CalendarClock, FolderKanban, MapPin,
  MessageCircle, Pencil, Phone, UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Badge, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { DocumentsPanel } from '@/components/shared/DocumentsPanel';
import { CommentsPanel } from '@/components/shared/CommentsPanel';
import { HistoryPanel } from '@/components/shared/HistoryPanel';
import { getFicha, updateFicha } from '@/services/fichas';
import { convertBudget, projectFromFicha } from '@/services/projects';
import { listPeople } from '@/services/people';
import { FICHA_STATUSES, FICHA_TYPE_LABEL, fichaStatus } from '@/config/constants';
import { fmtDate, fmtDateTime, fmtEur, fmtPhone, fmtTimeShort } from '@/lib/format';
import { telLink, whatsappLink } from '@/lib/whatsapp';

/** Detalle de un presupuesto, una visita o un aviso. */
export default function FichaDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useDialogs();

  const ficha = useAsync(() => getFicha(id), [id]);
  const people = useAsync(() => listPeople(), []);
  // Si este presupuesto ya se convirtió, aquí está su proyecto.
  const project = useAsync(() => projectFromFicha(id), [id, ficha.data?.status]);
  const [saving, setSaving] = useState(false);
  // Se incrementa tras cada acción para volver a pedir el historial.
  const [historyKey, setHistoryKey] = useState(0);

  if (ficha.loading && !ficha.data) return <Loading />;
  if (ficha.error) return <ErrorBox message={ficha.error} onRetry={ficha.reload} />;
  if (!ficha.data) return null;

  const f = ficha.data;
  const status = fichaStatus(f.type, f.status);
  const archived = Boolean(f.archived_at);

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
                  {f.type === 'presupuesto' ? 'Quién lo prepara' : 'Trabajador responsable'}
                </label>
                <select id="assign" className="select" value={f.assigned_to ?? ''} disabled={saving || archived}
                        onChange={(e) => assign(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {(people.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}{p.role === 'admin' ? ' (administración)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Panel>

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

              {f.type === 'presupuesto' && (<><dt>Importe</dt><dd className="num">{fmtEur(f.amount)}</dd></>)}

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
          <DocumentsPanel owner={{ fichaId: f.id }} />
          <CommentsPanel owner={{ fichaId: f.id }} />
        </div>
      </div>
    </>
  );
}
