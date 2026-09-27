import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive, ArchiveRestore, ArrowLeft, Building2, Mail, MessageCircle, Pencil,
  Phone, Plus, Trash2, User, UserPlus,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Badge, PageHeader, Panel, Tabs } from '@/components/ui/Layout';
import { Alert, Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { HistoryPanel } from '@/components/shared/HistoryPanel';
import { ClientForm } from './ClientForm';
import {
  archiveContact, clientFichas, getClient, listContacts, saveContact, updateClient,
} from '@/services/clients';
import { clientProjects } from '@/services/projects';
import {
  BILLING_LABEL, BILLING_TONE, CLIENT_KIND_LABEL, FICHA_TYPE_LABEL, fichaStatus,
  PHASE_LABEL, PHASE_TONE,
} from '@/config/constants';
import { fmtDate, fmtEur, fmtPhone } from '@/lib/format';
import { telLink, whatsappLink } from '@/lib/whatsapp';
import type { Client, ClientContact, Ficha, FichaType } from '@/types/db';

type TabKey = 'presupuesto' | 'visita' | 'aviso';

/** Formulario de contacto dentro de una ventana emergente. */
function ContactForm({ clientId, contact, onClose, onSaved }: {
  clientId: string;
  contact?: ClientContact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useDialogs();
  const [form, setForm] = useState({
    name: contact?.name ?? '', role: contact?.role ?? '',
    phone: contact?.phone ?? '', email: contact?.email ?? '',
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.name.trim()) { toast.error('El contacto necesita un nombre.'); return; }
    setBusy(true);
    try {
      await saveContact({ id: contact?.id, client_id: clientId, ...form });
      toast.success(contact ? 'Contacto actualizado' : 'Contacto añadido');
      onSaved();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  return (
    <Modal title={contact ? 'Editar contacto' : 'Nuevo contacto'} size="narrow" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>Guardar</button>
      </>}>
      <div className="stack">
        <div className="field">
          <label htmlFor="ct-name">Nombre *</label>
          <input id="ct-name" className="input" value={form.name}
                 onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ct-role">Cargo</label>
          <input id="ct-role" className="input" value={form.role} placeholder="Gerente, administración…"
                 onChange={(e) => setForm({ ...form, role: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ct-phone">Teléfono</label>
          <input id="ct-phone" className="input" inputMode="tel" value={form.phone}
                 onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ct-email">Email</label>
          <input id="ct-email" className="input" type="email" value={form.email}
                 onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}

export default function ClientDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useDialogs();

  const client = useAsync(() => getClient(id), [id]);
  const contacts = useAsync(() => listContacts(id), [id]);
  const fichas = useAsync(() => clientFichas(id), [id]);
  const projects = useAsync(() => clientProjects(id), [id]);

  const [editing, setEditing] = useState(false);
  const [contactForm, setContactForm] = useState<{ open: boolean; contact?: ClientContact | null }>({ open: false });
  const [tab, setTab] = useState<TabKey>('presupuesto');

  if (client.loading && !client.data) return <Loading />;
  if (client.error) return <ErrorBox message={client.error} onRetry={client.reload} />;
  if (!client.data) return null;

  const c: Client = client.data;
  const rows = (fichas.data ?? []).filter((f) => f.type === tab);
  const countOf = (t: FichaType) => (fichas.data ?? []).filter((f) => f.type === t).length;

  async function toggleActive() {
    const ok = await confirm({
      title: c.active ? 'Desactivar cliente' : 'Reactivar cliente',
      message: c.active
        ? <>«{c.name}» dejará de aparecer para fichas nuevas. Su historial se conserva.</>
        : <>«{c.name}» volverá a estar disponible.</>,
      confirmLabel: c.active ? 'Desactivar' : 'Reactivar',
      danger: c.active,
    });
    if (!ok) return;
    try {
      await updateClient(c.id, { active: !c.active });
      toast.success(c.active ? 'Cliente desactivado' : 'Cliente reactivado');
      await client.reload();
    } catch (e) { toast.error(e); }
  }

  async function toggleArchive() {
    const archived = Boolean(c.archived_at);
    const ok = await confirm({
      title: archived ? 'Recuperar cliente' : 'Archivar cliente',
      message: archived
        ? <>«{c.name}» volverá a los listados.</>
        : <>«{c.name}» desaparecerá de los listados y de las sugerencias, pero no se borra: su historial se conserva y se puede recuperar.</>,
      confirmLabel: archived ? 'Recuperar' : 'Archivar',
      danger: !archived,
    });
    if (!ok) return;
    try {
      await updateClient(c.id, { archived_at: archived ? null : new Date().toISOString() });
      toast.success(archived ? 'Cliente recuperado' : 'Cliente archivado');
      await client.reload();
    } catch (e) { toast.error(e); }
  }

  async function removeContact(contact: ClientContact) {
    const ok = await confirm({
      title: 'Archivar contacto',
      message: <>
        «{contact.name}» dejará de aparecer al elegir contacto, pero seguirá
        en los presupuestos y proyectos donde ya se usó. Aquí no se borra nada.
      </>,
      confirmLabel: 'Archivar', danger: true,
    });
    if (!ok) return;
    try {
      await archiveContact(contact.id);
      toast.success('Contacto archivado');
      await contacts.reload();
    } catch (e) { toast.error(e); }
  }

  const wa = whatsappLink(c.phone, `Hola ${c.name}, te escribimos de Metalplafer.`);
  const tel = telLink(c.phone);

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to="/admin/clientes" style={{ marginBottom: 10 }}>
        <ArrowLeft />Clientes
      </Link>

      <PageHeader
        title={
          <span className="row" style={{ gap: 10 }}>
            {c.kind === 'empresa' ? <Building2 aria-hidden /> : <User aria-hidden />}
            {c.name}
          </span>
        }
        sub={
          <span className="row" style={{ gap: 8 }}>
            <Badge tone="neutral" plain>{CLIENT_KIND_LABEL[c.kind]}</Badge>
            {c.archived_at ? <Badge tone="steel">Archivado</Badge>
              : !c.active ? <Badge tone="amber">Desactivado</Badge>
              : <Badge tone="green">Activo</Badge>}
            <span className="faint">Alta: {fmtDate(c.created_at)}</span>
          </span>
        }
        actions={<>
          <button className="btn" onClick={() => setEditing(true)}><Pencil />Editar</button>
          <button className="btn" onClick={toggleActive}>{c.active ? 'Desactivar' : 'Reactivar'}</button>
          <button className="btn" onClick={toggleArchive}>
            {c.archived_at ? <><ArchiveRestore />Recuperar</> : <><Archive />Archivar</>}
          </button>
        </>}
      />

      {c.archived_at && (
        <div style={{ marginBottom: 16 }}>
          <Alert kind="warn">
            Este cliente está archivado: no aparece en los listados ni se propone al crear fichas.
            Su historial se conserva íntegro.
          </Alert>
        </div>
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Panel title="Datos del cliente" actions={
            <div className="row" style={{ gap: 6 }}>
              {tel && <a className="btn btn-sm" href={tel}><Phone />Llamar</a>}
              {wa && (
                <a className="btn btn-sm" href={wa} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />WhatsApp
                </a>
              )}
              {c.email && <a className="btn btn-sm" href={`mailto:${c.email}`}><Mail />Email</a>}
            </div>
          }>
            <dl className="kv">
              <dt>CIF/NIF</dt><dd>{c.tax_id ?? '—'}</dd>
              <dt>Teléfono</dt><dd className="num">{fmtPhone(c.phone)}</dd>
              <dt>Email</dt><dd>{c.email ?? '—'}</dd>
              <dt>Dirección</dt><dd>{c.address ?? '—'}</dd>
              <dt>Población</dt><dd>{[c.postal_code, c.city].filter(Boolean).join(' ') || '—'}</dd>
              <dt>Notas internas</dt><dd className="pre">{c.notes ?? '—'}</dd>
            </dl>
          </Panel>

          <section className="panel">
            <div className="panel-head">
              <h2>Contactos</h2>
              <button className="btn btn-sm" onClick={() => setContactForm({ open: true })}>
                <UserPlus />Añadir contacto
              </button>
            </div>
            <div className="panel-body tight">
              {contacts.loading && !contacts.data ? <Loading />
                : !contacts.data?.length ? (
                  <Empty title="Sin contactos">
                    Añade las personas con las que tratáis en este cliente.
                  </Empty>
                ) : (
                  <ul className="doc-list">
                    {contacts.data.map((ct) => (
                      <li key={ct.id}>
                        <span className="doc-icon"><User size={18} /></span>
                        <span className="doc-meta">
                          <strong>{ct.name}</strong>
                          <span>{[ct.role, ct.phone, ct.email].filter(Boolean).join(' · ') || 'Sin datos'}</span>
                        </span>
                        {whatsappLink(ct.phone) && (
                          <a className="btn btn-ghost icon-btn" href={whatsappLink(ct.phone)!}
                             target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${ct.name}`}>
                            <MessageCircle />
                          </a>
                        )}
                        <button className="btn btn-ghost icon-btn" aria-label={`Editar ${ct.name}`}
                                onClick={() => setContactForm({ open: true, contact: ct })}><Pencil /></button>
                        <button className="btn btn-ghost icon-btn" aria-label={`Archivar ${ct.name}`}
                                onClick={() => removeContact(ct)}><Trash2 /></button>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Historial del cliente</h2>
              <Link className="btn btn-sm btn-primary" to={`/admin/fichas/nueva?cliente=${c.id}&tipo=${tab}`}>
                <Plus />Nueva ficha
              </Link>
            </div>
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { key: 'presupuesto', label: 'Presupuestos', count: countOf('presupuesto') },
                { key: 'visita', label: 'Visitas', count: countOf('visita') },
                { key: 'aviso', label: 'Avisos', count: countOf('aviso') },
              ]}
            />
            <div className="panel-body tight">
              {fichas.loading && !fichas.data ? <Loading />
                : !rows.length ? (
                  <Empty title={`Sin ${FICHA_TYPE_LABEL[tab].toLowerCase()}s todavía`} />
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Código</th><th>Asunto</th><th>Fecha</th><th>Estado</th>
                          {tab === 'presupuesto' && <th className="right">Importe</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((f: Ficha) => {
                          const s = fichaStatus(f.type, f.status);
                          return (
                            <tr key={f.id} className="clickable" onClick={() => navigate(`/admin/fichas/${f.id}`)}>
                              <td><span className="plate">{f.code}</span></td>
                              <td>
                                <span className="cell-main">
                                  <strong>{f.title ?? f.description?.slice(0, 60) ?? '—'}</strong>
                                  {f.assignee && <small>{f.assignee.full_name}</small>}
                                </span>
                              </td>
                              <td className="nowrap">{fmtDate(f.scheduled_date ?? f.created_at)}</td>
                              <td><Badge tone={s.tone}>{s.label}</Badge></td>
                              {tab === 'presupuesto' && <td className="right num">{fmtEur(f.amount)}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Proyectos</h2>
              <Link className="btn btn-sm" to={`/admin/proyectos/nuevo?cliente=${c.id}`}>
                <Plus />Nuevo proyecto
              </Link>
            </div>
            <div className="panel-body tight">
              {projects.loading && !projects.data ? <Loading />
                : !projects.data?.length ? <Empty title="Sin proyectos todavía" />
                : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr><th>Código</th><th>Proyecto</th><th>Fase</th><th>Creado</th></tr>
                      </thead>
                      <tbody>
                        {projects.data.map((pr) => (
                          <tr key={pr.id} className="clickable" onClick={() => navigate(`/admin/proyectos/${pr.id}`)}>
                            <td><span className="plate">{pr.code}</span></td>
                            <td><strong>{pr.name}</strong></td>
                            <td>
                              {pr.phase === 'finalizado' || pr.phase === 'facturacion'
                                ? <Badge tone={BILLING_TONE[pr.billing_status]}>{BILLING_LABEL[pr.billing_status]}</Badge>
                                : <Badge tone={PHASE_TONE[pr.phase]}>{PHASE_LABEL[pr.phase]}</Badge>}
                            </td>
                            <td className="nowrap">{fmtDate(pr.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </section>

          <HistoryPanel entityCode={c.name} title="Historial de cambios" reloadKey={c.updated_at} />
        </div>
      </div>

      {editing && (
        <ClientForm client={c} onClose={() => setEditing(false)}
                    onSaved={() => { setEditing(false); void client.reload(); }} />
      )}
      {contactForm.open && (
        <ContactForm clientId={c.id} contact={contactForm.contact}
                     onClose={() => setContactForm({ open: false })}
                     onSaved={() => { setContactForm({ open: false }); void contacts.reload(); }} />
      )}
    </>
  );
}
