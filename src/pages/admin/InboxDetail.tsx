import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, FileStack, FolderKanban, Mail, RotateCcw, Save, Siren, Trash2, TriangleAlert,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Badge, Field, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { DocumentsPanel } from '@/components/shared/DocumentsPanel';
import { HistoryPanel } from '@/components/shared/HistoryPanel';
import { ClientPicker, emptyClient, type ClientDraft } from '@/components/shared/ClientPicker';
import {
  discardMailRequest, getMailRequest, restoreMailRequest, reviewMailRequest,
} from '@/services/mail';
import { MAIL_STATUS_LABEL, MAIL_STATUS_TONE } from '@/config/constants';
import { fmtDateTime } from '@/lib/format';
import { desdeSolicitud } from '@/lib/vinculos';
import type { FichaType, MailRequest } from '@/types/db';

/**
 * UNA SOLICITUD, PARA REVISARLA.
 *
 * MEJORA 6 · Aquí se ve el correo tal como llegó —quién lo mandó, qué
 * pedía y qué adjuntó—, se completa lo que falta y, SOLO ENTONCES y SOLO
 * a mano, se convierte en un presupuesto, una visita o un aviso.
 *
 * La conversión no la hace esta pantalla: lleva al formulario de fichas
 * DE SIEMPRE, con el tipo ya elegido, y al guardar allí la ficha queda
 * vinculada a esta solicitud. Así no hay dos maneras de crear un
 * presupuesto, que es lo que se pidió evitar.
 *
 * La ficha provisional no se borra nunca: queda como prueba de lo que
 * pidió el cliente y con qué archivos lo pidió.
 */
export default function InboxDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useDialogs();

  const solicitud = useAsync(() => getMailRequest(id), [id]);
  const [historyKey, setHistoryKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [client, setClient] = useState<ClientDraft>(emptyClient);
  const [notes, setNotes] = useState('');
  const [remitente, setRemitente] = useState({ email: '', nombre: '' });

  const m = solicitud.data;

  useEffect(() => {
    if (!m) return;
    setNotes(m.notes ?? '');
    setRemitente({
      email: m.original_sender_email ?? '',
      nombre: m.original_sender_name ?? '',
    });
    setClient(m.client
      ? {
        ...emptyClient, id: m.client.id, name: m.client.name,
        kind: m.client.kind, phone: m.client.phone ?? '',
      }
      : emptyClient);
  }, [m?.id, m?.updated_at]);

  if (solicitud.loading && !solicitud.data) return <Loading />;
  if (solicitud.error) return <ErrorBox message={solicitud.error} onRetry={solicitud.reload} />;
  if (!m) return null;

  /*
    La misma solicitud, en una constante ya comprobada. Hace falta porque
    las funciones declaradas con «function» se izan, y TypeScript no da
    por buena ahí la comprobación de arriba.
  */
  const sol: MailRequest = m;

  const recargar = async () => { await solicitud.reload(); setHistoryKey((k) => k + 1); };

  async function guardar() {
    setSaving(true);
    try {
      await reviewMailRequest(sol.id, {
        clientId: client.id || null,
        notes,
        originalSenderEmail: remitente.email.trim() || null,
        originalSenderName: remitente.nombre.trim() || null,
      });
      toast.success('Solicitud revisada');
      await recargar();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }

  /** Crear el registro definitivo: va al formulario de siempre. */
  function convertir(tipo: FichaType) {
    const params = new URLSearchParams({ tipo, solicitud: desdeSolicitud(sol.id) });
    if (client.id) params.set('cliente', client.id);
    navigate(`/admin/fichas/nueva?${params.toString()}`);
  }

  async function descartar() {
    const ok = await confirm({
      title: 'Descartar la solicitud',
      message: <>{sol.code} dejará de salir en la bandeja. El correo y sus archivos se conservan,
        y se puede recuperar.</>,
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
    try {
      await discardMailRequest(sol.id);
      toast.success('Solicitud descartada');
      await recargar();
    } catch (e) { toast.error(e); }
  }

  async function recuperar() {
    try {
      await restoreMailRequest(sol.id);
      toast.success('Solicitud recuperada');
      await recargar();
    } catch (e) { toast.error(e); }
  }

  const vinculada = m.status === 'vinculada';
  const destino = m.target_ficha
    ? { to: `/admin/fichas/${m.target_ficha.id}`, code: m.target_ficha.code }
    : m.target_project
      ? { to: `/admin/proyectos/${m.target_project.id}`, code: m.target_project.code }
      : null;

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to="/admin/solicitudes" style={{ marginBottom: 10 }}>
        <ArrowLeft />Solicitudes
      </Link>

      <PageHeader
        title={
          <span className="ficha-head">
            <span className="plate plate-dark" style={{ fontSize: '1.2rem', padding: '5px 16px' }}>
              {m.code}
            </span>
            <span>{m.original_subject ?? m.subject ?? '(sin asunto)'}</span>
          </span>
        }
        sub={
          <span className="row" style={{ gap: 8 }}>
            <Badge tone={MAIL_STATUS_TONE[m.status]}>{MAIL_STATUS_LABEL[m.status]}</Badge>
            {m.forwarded && <Badge tone="neutral" plain>Reenviado</Badge>}
            <span className="faint">Recibida el {fmtDateTime(m.received_at)}</span>
            {destino && <Link to={destino.to}>Ya es {destino.code}</Link>}
          </span>
        }
        actions={m.status === 'descartada'
          ? <button className="btn" onClick={recuperar}><RotateCcw />Recuperar</button>
          : !vinculada
            ? <button className="btn btn-danger" onClick={descartar}><Trash2 />Descartar</button>
            : undefined}
      />

      <div className="stack" style={{ marginBottom: 16 }}>
        {/*
          LO PRIMERO QUE SE LEE: esto todavía no es nada. La pantalla no
          puede dar a entender que un correo recibido ya es un trabajo.
        */}
        {!vinculada && m.status !== 'descartada' && (
          <Alert kind="info">
            Esta es una <strong>ficha provisional</strong>: el correo tal como llegó. No es un
            presupuesto, ni una visita, ni un aviso. Revísala y, cuando sepas qué es, créalo
            desde los botones de abajo.
          </Alert>
        )}

        {m.status === 'error' && m.error_detail && (
          <Alert kind="danger">
            <strong>No se ha podido guardar todo.</strong> {m.error_detail}
            {' '}El correo está completo; lo que falta son archivos. Pídeselos al cliente o
            búscalos en el correo original.
          </Alert>
        )}

        {m.sender_needs_review && (
          <Alert kind="warn">
            <span className="row" style={{ gap: 8 }}>
              <TriangleAlert size={17} aria-hidden />
              Parece un correo <strong>reenviado</strong> y no se ha podido saber con seguridad
              quién lo mandó originalmente. No se ha inventado: escríbelo abajo si lo sabes.
            </span>
          </Alert>
        )}

        {m.status === 'descartada' && (
          <Alert kind="warn">
            Esta solicitud está descartada. Se conserva entera; recupérala si hacía falta.
          </Alert>
        )}
      </div>

      <div className="grid-2 proy-detalle" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Panel title="El correo">
            <dl className="kv">
              <dt>De</dt>
              <dd>
                {m.original_sender_email ?? m.sender_email ?? '—'}
                {m.original_sender_name && ` · ${m.original_sender_name}`}
              </dd>

              {m.forwarded && (
                <>
                  <dt>Reenviado por</dt>
                  <dd>
                    <Mail size={13} aria-hidden style={{ verticalAlign: '-2px' }} />{' '}
                    {m.sender_email ?? '—'}
                    {m.sender_name && ` · ${m.sender_name}`}
                  </dd>
                </>
              )}

              <dt>Para</dt>
              <dd>{m.recipients ?? '—'}</dd>

              <dt>Asunto</dt>
              <dd>
                {m.original_subject ?? m.subject ?? '—'}
                {m.original_subject && m.subject && m.original_subject !== m.subject && (
                  <> <span className="faint">(llegó como «{m.subject}»)</span></>
                )}
              </dd>

              <dt>Recibida</dt>
              <dd>{fmtDateTime(m.received_at)}</dd>
            </dl>

            {/*
              EL CUERPO, TAL CUAL. Se enseña el texto plano y no el HTML:
              pintar el HTML de un correo de fuera dentro de la aplicación
              es meter el código de un desconocido en la pantalla. El
              original se conserva en la base de datos por si hace falta.
            */}
            <div className="correo-cuerpo pre">
              {m.body_text?.trim()
                || (m.body_html ? '(el correo venía solo en formato HTML)' : '(sin texto)')}
            </div>
            <p className="hint" style={{ marginBottom: 0 }}>
              Se enseña el texto del correo. El mensaje original se conserva completo.
            </p>
          </Panel>

          <HistoryPanel entityCode={m.code} reloadKey={String(historyKey)} />
        </div>

        <div className="stack">
          {/* Los adjuntos, con EL MISMO panel que los demás archivos. */}
          <DocumentsPanel owner={{ mailRequestId: m.id }} title="Archivos del correo"
                          onChange={() => setHistoryKey((k) => k + 1)} />

          <Panel title="Revisión">
            <div className="stack">
              <Field label="Cliente" htmlFor="sol-client"
                     hint="Si el remitente coincidía con un cliente, viene propuesto.">
                <ClientPicker value={client} onChange={setClient} existingOnly />
              </Field>

              {m.sender_needs_review && (
                <div className="form-grid">
                  <Field label="Quién lo mandó (correo)" htmlFor="sol-remitente">
                    <input id="sol-remitente" className="input" type="email"
                           placeholder="cliente@ejemplo.com"
                           value={remitente.email}
                           onChange={(e) => setRemitente((r) => ({ ...r, email: e.target.value }))} />
                  </Field>
                  <Field label="Su nombre" htmlFor="sol-remitente-nombre">
                    <input id="sol-remitente-nombre" className="input"
                           value={remitente.nombre}
                           onChange={(e) => setRemitente((r) => ({ ...r, nombre: e.target.value }))} />
                  </Field>
                </div>
              )}

              <Field label="Observaciones internas" htmlFor="sol-notes"
                     hint="Lo que haga falta recordar: llamadas, acuerdos, dudas.">
                <textarea id="sol-notes" className="textarea" rows={3} value={notes}
                          onChange={(e) => setNotes(e.target.value)} />
              </Field>

              <div className="row">
                <button className="btn btn-primary" onClick={guardar}
                        disabled={saving || m.status === 'descartada'}>
                  <Save />{saving ? 'Guardando…' : 'Guardar la revisión'}
                </button>
              </div>

              {m.reviewed_by && m.reviewed_at && (
                <p className="hint" style={{ margin: 0 }}>
                  Revisada por {m.reviewer?.full_name ?? 'administración'} el{' '}
                  {fmtDateTime(m.reviewed_at)}.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Convertir en…">
            {vinculada && destino ? (
              <div className="stack">
                <p style={{ margin: 0 }}>
                  Esta solicitud ya es <Link to={destino.to}><strong>{destino.code}</strong></Link>.
                  Sus archivos se ven desde allí sin haberse copiado.
                </p>
                <p className="hint" style={{ margin: 0 }}>
                  Si se vinculó por error, crea el registro correcto y vuelve a convertirla: se
                  guardará el cambio en el historial.
                </p>
              </div>
            ) : (
              <div className="stack">
                <p className="hint" style={{ margin: 0 }}>
                  Se abrirá la ficha de siempre con el tipo elegido. Al guardarla, quedará
                  vinculada a {m.code} y los archivos del correo se verán desde ella.
                </p>
                <div className="row">
                  <button className="btn" onClick={() => convertir('presupuesto')}
                          disabled={m.status === 'descartada'}>
                    <FileStack />Presupuesto
                  </button>
                  <button className="btn" onClick={() => convertir('visita')}
                          disabled={m.status === 'descartada'}>
                    <FolderKanban />Visita técnica
                  </button>
                  <button className="btn" onClick={() => convertir('aviso')}
                          disabled={m.status === 'descartada'}>
                    <Siren />Aviso
                  </button>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
