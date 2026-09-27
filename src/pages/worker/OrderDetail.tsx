import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Boxes, Camera, CheckCircle2, Clock, Images, MapPin, PenLine, Save, Send, Trash2, Users,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { useDialogs } from '@/components/ui/Dialogs';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Layout';
import { CommentsPanel } from '@/components/shared/CommentsPanel';
import { SignaturePad } from '@/components/shared/SignaturePad';
import { getOrder, myPart, orderTeam, saveOrderPart } from '@/services/orders';
import { submitRequest } from '@/services/materials';
import { Modal } from '@/components/ui/Modal';
import { listDocuments, signedUrls, trashDocument, uploadDocument } from '@/services/documents';
import {
  ORDER_OPEN_STATUSES, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, ORDER_TYPE_LABEL,
} from '@/config/constants';
import { dayLabel, fmtDate, fmtDateTime, fmtHours, parseHours, todayMadrid } from '@/lib/format';
import { Aviso } from '@/lib/errors';
import type { DocumentRow } from '@/types/db';

/**
 * La orden en el móvil del trabajador.
 *
 * Reglas que se ven aquí y que además impone la base de datos:
 *   · el trabajo a realizar no se toca: se escribe el trabajo REALIZADO
 *   · una orden futura se consulta, pero no se rellena
 *   · no hay botón de «iniciar»: la orden pasa a En curso al guardar
 */
export default function WorkerOrderDetail() {
  const { id = '' } = useParams();
  const { profile, maxFileMb } = useAuth();
  const { toast, confirm } = useDialogs();
  const today = todayMadrid();

  const order = useAsync(() => getOrder(id), [id]);
  const part = useAsync(async () => (profile ? myPart(id, profile.id) : null), [id, profile?.id]);
  const team = useAsync(() => orderTeam(id), [id]);
  const files = useAsync(() => listDocuments({ orderId: id }), [id]);

  const [workDone, setWorkDone] = useState('');
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [askingMaterial, setAskingMaterial] = useState(false);
  const [materialText, setMaterialText] = useState('');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!part.data) return;
    setWorkDone(part.data.work_done ?? '');
    setHours(part.data.hours != null ? String(part.data.hours).replace('.', ',') : '');
  }, [part.data]);

  useEffect(() => {
    const images = (files.data ?? []).filter((d) => d.category === 'foto' || d.category === 'firma');
    if (!images.length) { setThumbs({}); return; }
    signedUrls(images.map((d) => d.storage_path)).then(setThumbs).catch(() => undefined);
  }, [files.data]);

  if (order.loading && !order.data) return <Loading />;
  if (order.error) return <ErrorBox message={order.error} onRetry={order.reload} />;
  if (!order.data) return null;

  const o = order.data;
  const future = o.scheduled_date > today;
  const abierta = !future && ORDER_OPEN_STATUSES.has(o.status) && !o.archived_at;
  // Con varios trabajadores, quien ya ha enviado su parte lo ve cerrado,
  // pero puede corregirlo mientras la orden no esté en revisión.
  const yaEnviado = Boolean(part.data?.submitted_at);
  const editable = abierta && (!yaEnviado || correcting);
  const pendienteDeCompaneros = abierta && yaEnviado;
  const photos = (files.data ?? []).filter((d) => d.category === 'foto' || d.category === 'video');
  const signature = (files.data ?? []).find((d) => d.category === 'firma') ?? null;

  async function reload() {
    await order.reload();
    await part.reload();
    await files.reload();
  }

  async function save(submit: boolean) {
    const text = workDone.trim();
    const parsed = hours.trim() ? parseHours(hours) : null;

    if (hours.trim() && parsed === null) {
      toast.error(new Aviso('Las horas no son válidas. Escríbelas así: 7,5 (entre 0 y 24).'));
      return;
    }
    if (submit) {
      if (!text) { toast.error(new Aviso('Escribe el trabajo realizado antes de enviar.')); return; }
      if (!parsed) { toast.error(new Aviso('Apunta las horas antes de enviar.')); return; }
      const ok = await confirm({
        title: 'Enviar la orden',
        message: <>La orden {o.code} pasará a revisión de administración.
          Después ya no podrás modificarla, salvo que te la devuelvan.</>,
        confirmLabel: 'Enviar',
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      await saveOrderPart(o.id, text, parsed, submit);
      toast.success(submit ? 'Parte enviado' : 'Parte guardado');
      setCorrecting(false);
      await reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function onFiles(list: FileList | null, input: HTMLInputElement | null) {
    if (!list?.length || !profile) return;
    setBusy(true);
    let added = 0;
    for (const file of Array.from(list)) {
      try {
        await uploadDocument({ orderId: o.id }, file, { userId: profile.id, maxMb: maxFileMb });
        added++;
      } catch (e) { toast.error(e); }
    }
    if (input) input.value = '';
    setBusy(false);
    if (added) { toast.success(added === 1 ? 'Fotografía añadida' : `${added} fotografías añadidas`); await files.reload(); }
  }

  async function saveSignature(file: File) {
    if (!profile) return;
    setBusy(true);
    try {
      await uploadDocument({ orderId: o.id }, file, {
        userId: profile.id, maxMb: maxFileMb, category: 'firma',
      });
      toast.success('Firma guardada');
      setSigning(false);
      await files.reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  /**
   * Comunicar que falta material.
   * No crea material: entra como aviso y lo revisa administración.
   */
  async function sendMaterial() {
    setBusy(true);
    try {
      await submitRequest(o.id, materialText);
      toast.success('Aviso enviado a administración');
      setAskingMaterial(false);
      setMaterialText('');
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function removeFile(doc: DocumentRow) {
    const ok = await confirm({
      title: 'Quitar el archivo',
      message: <>«{doc.file_name}» dejará de verse en la orden.</>,
      confirmLabel: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    try { await trashDocument(doc.id); await files.reload(); }
    catch (e) { toast.error(e); }
  }

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to="/t/ordenes" style={{ marginBottom: 10 }}>
        <ArrowLeft />Mis órdenes
      </Link>

      <div className="ot-head">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="plate plate-dark">{o.code}</span>
          <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
        </div>
        <h1>{ORDER_TYPE_LABEL[o.type]}{o.project ? ` · ${o.project.name}` : ''}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {dayLabel(o.scheduled_date, today)}
        </p>
      </div>

      <div className="stack" style={{ marginBottom: 16 }}>
        {future && (
          <Alert kind="info">
            Esta orden es del <strong>{fmtDate(o.scheduled_date)}</strong>. Puedes consultarla,
            pero no se rellena hasta ese día.
          </Alert>
        )}
        {o.status === 'devuelta' && (
          <Alert kind="danger">
            <strong>Administración te ha devuelto la orden.</strong>
            <div style={{ marginTop: 2 }}>Motivo: {o.return_reason}</div>
          </Alert>
        )}
        {o.status === 'realizada' && (
          <Alert kind="warn">
            Enviada el {fmtDateTime(o.submitted_at)}. Está pendiente de revisión:
            no se puede modificar hasta que administración la revise.
          </Alert>
        )}
        {o.status === 'validada' && (
          <Alert kind="ok">Orden validada el {fmtDateTime(o.validated_at)}. Trabajo cerrado.</Alert>
        )}
      </div>

      <section className="w-section">
        <h2>Trabajo a realizar</h2>
        <div className="w-block">
          <p className="pre" style={{ margin: 0 }}>{o.description}</p>
        </div>

        <div className="w-block">
          <dl className="kv tight">
            {o.project?.client && <><dt>Cliente</dt><dd>{o.project.client.name}</dd></>}
            {o.project?.address && (
              <>
                <dt><span className="row" style={{ gap: 5 }}><MapPin size={14} />Dirección</span></dt>
                <dd>{o.project.address}</dd>
              </>
            )}
            {o.project?.location && <><dt>Ubicación</dt><dd>{o.project.location}</dd></>}
            {o.project?.measures && <><dt>Medidas</dt><dd>{o.project.measures}</dd></>}
            {o.project?.finish && <><dt>Acabado</dt><dd>{o.project.finish}</dd></>}
            <dt><span className="row" style={{ gap: 5 }}><Clock size={14} />Horas previstas</span></dt>
            <dd className="num">{fmtHours(o.planned_hours)}</dd>
            {o.admin_notes && <><dt>Notas</dt><dd className="pre">{o.admin_notes}</dd></>}
          </dl>
        </div>

        {(team.data?.length ?? 0) > 1 && (
          <div className="w-block">
            <h3><Users aria-hidden />En esta orden vais</h3>
            <ul className="team-list">
              {team.data?.map((t) => (
                <li key={t.worker_id}>
                  {t.full_name}
                  {t.worker_id === profile?.id && <span className="faint"> · tú</span>}
                  {t.submitted && <Badge tone="green">Enviado</Badge>}
                </li>
              ))}
            </ul>
            <p className="hint" style={{ margin: '8px 0 0' }}>
              Cada uno apunta sus propias horas. La orden se envía cuando todos hayáis enviado el parte.
            </p>
          </div>
        )}
      </section>

      <section className="w-section">
        <h2>Trabajo realizado</h2>
        {pendienteDeCompaneros && !correcting && (
          <div className="stack" style={{ marginBottom: 10 }}>
            <Alert kind="ok" action={
              <button className="btn btn-sm" onClick={() => setCorrecting(true)}>Corregir</button>
            }>
              Tu parte ya está enviado. Falta que lo envíen tus compañeros para que la orden
              pase a revisión.
            </Alert>
          </div>
        )}
        <div className="w-block">
          {editable ? (
            <>
              <label className="label" htmlFor="ot-done">Qué has hecho</label>
              <textarea id="ot-done" className="textarea" rows={5} value={workDone}
                        placeholder="Describe el trabajo que has hecho hoy."
                        onChange={(e) => setWorkDone(e.target.value)} />

              <label className="label" htmlFor="ot-hours" style={{ marginTop: 12 }}>Tus horas</label>
              <input id="ot-hours" className="input big" inputMode="decimal" value={hours}
                     placeholder="7,5" onChange={(e) => setHours(e.target.value)} />
              <span className="hint">Con decimales: 7,5 son siete horas y media. Máximo 24.</span>
            </>
          ) : (
            <>
              <p className="pre" style={{ marginTop: 0 }}>
                {part.data?.work_done ?? <span className="faint">Todavía no has escrito nada.</span>}
              </p>
              <p className="num" style={{ margin: 0 }}>
                {part.data?.hours != null ? fmtHours(part.data.hours) : 'Sin horas apuntadas'}
              </p>
            </>
          )}
        </div>
      </section>

      <section className="w-section">
        <h2>Fotografías</h2>
        <div className="w-block">
          {editable && (
            <>
              <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden
                     onChange={(e) => onFiles(e.target.files, cameraInput.current)} />
              <input ref={galleryInput} type="file" accept="image/*,video/*" multiple hidden
                     onChange={(e) => onFiles(e.target.files, galleryInput.current)} />
              <div className="w-big-actions" style={{ marginBottom: photos.length ? 14 : 0 }}>
                <button className="btn" onClick={() => cameraInput.current?.click()} disabled={busy}>
                  <Camera aria-hidden />Hacer foto
                </button>
                <button className="btn" onClick={() => galleryInput.current?.click()} disabled={busy}>
                  <Images aria-hidden />Galería
                </button>
              </div>
            </>
          )}

          {photos.length ? (
            <ul className="photo-grid">
              {photos.map((d) => (
                <li key={d.id}>
                  {thumbs[d.storage_path]
                    ? <img src={thumbs[d.storage_path]} alt={d.file_name} loading="lazy" />
                    : <span className="photo-placeholder">{d.file_name}</span>}
                  {editable && d.uploaded_by === profile?.id && (
                    <button className="photo-remove" onClick={() => removeFile(d)}
                            aria-label={`Quitar ${d.file_name}`}><Trash2 size={15} /></button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {editable ? 'Todavía no has añadido ninguna fotografía.' : 'Sin fotografías.'}
            </p>
          )}
        </div>
      </section>

      <section className="w-section">
        <h2>Firma del cliente</h2>
        <div className="w-block">
          {signature ? (
            <div className="sign-preview">
              {thumbs[signature.storage_path]
                ? <img src={thumbs[signature.storage_path]} alt="Firma del cliente" />
                : <span className="muted">Firma guardada</span>}
              <div className="faint">Guardada el {fmtDateTime(signature.created_at)}</div>
              {editable && (
                <button className="btn btn-sm" onClick={() => removeFile(signature)} disabled={busy}>
                  <Trash2 />Quitar y volver a firmar
                </button>
              )}
            </div>
          ) : signing ? (
            <SignaturePad onConfirm={saveSignature} onCancel={() => setSigning(false)} busy={busy} />
          ) : editable ? (
            <button className="btn" onClick={() => setSigning(true)} disabled={busy}>
              <PenLine aria-hidden />Firmar con el dedo
            </button>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Sin firma.</p>
          )}
        </div>
      </section>

      {editable && (
        <div className="w-actions">
          <button className="btn" onClick={() => save(false)} disabled={busy}>
            <Save aria-hidden />Guardar
          </button>
          <button className="btn btn-primary" onClick={() => save(true)} disabled={busy}>
            <Send aria-hidden />Enviar a revisión
          </button>
        </div>
      )}

      {!editable && o.status === 'realizada' && (
        <div className="w-block row" style={{ gap: 8 }}>
          <CheckCircle2 size={18} aria-hidden />
          <span>Ya lo has enviado. Administración lo revisará.</span>
        </div>
      )}

      <section className="w-section">
        <h2>¿Falta material?</h2>
        <div className="w-block">
          <p className="muted" style={{ marginTop: 0 }}>
            Dilo y administración lo revisa. No se pide nada automáticamente.
          </p>
          <button className="btn" onClick={() => setAskingMaterial(true)} disabled={busy}>
            <Boxes aria-hidden />Avisar de que falta material
          </button>
        </div>
      </section>

      <section className="w-section">
        <CommentsPanel owner={{ orderId: o.id }} />
      </section>

      {askingMaterial && (
        <Modal
          title="Falta material"
          onClose={() => setAskingMaterial(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setAskingMaterial(false)} disabled={busy}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={sendMaterial}
                      disabled={busy || !materialText.trim()}>
                <Send />{busy ? 'Enviando…' : 'Enviar aviso'}
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            Escribe qué falta, como se lo dirías a un compañero. Administración
            lo revisará y decidirá qué se pide.
          </p>
          <label htmlFor="mat-req" className="label">Qué falta</label>
          <textarea id="mat-req" className="textarea" rows={3} value={materialText}
                    placeholder="Faltan 3 bisagras"
                    onChange={(e) => setMaterialText(e.target.value)} />
        </Modal>
      )}
    </>
  );
}
