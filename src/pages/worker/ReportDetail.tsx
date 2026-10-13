import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Boxes, Camera, CheckCircle2, Clock, Film, Images, PenLine, Save, Send, Trash2,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { useDialogs } from '@/components/ui/Dialogs';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Layout';
import { Modal } from '@/components/ui/Modal';
import { CommentsPanel } from '@/components/shared/CommentsPanel';
import { SignaturePad } from '@/components/shared/SignaturePad';
import { MediaViewer, isVideo, isViewable, type MediaItem } from '@/components/shared/MediaViewer';
import { getReport, myProjects, saveReport, workerProject } from '@/services/partes';
import { submitRequestFromReport } from '@/services/materials';
import { listDocuments, signedUrls, trashDocument, uploadDocument } from '@/services/documents';
import {
  ORDER_TYPE_LABEL, REPORT_OPEN_STATUSES, REPORT_STATUS_LABEL, REPORT_STATUS_TONE,
} from '@/config/constants';
import { fmtDateTime, fmtHours, parseHours, todayMadrid } from '@/lib/format';
import { Aviso } from '@/lib/errors';
import type { DocumentRow, OrderType } from '@/types/db';

/**
 * EL PARTE DE TRABAJO EN EL MÓVIL.
 *
 * Las horas que se escriben aquí son las de QUIEN LO RELLENA: ni de la
 * pareja, ni del proyecto entero.
 *
 * Reglas que se ven en la pantalla y que además impone la base de datos:
 *   · mientras no esté validado se puede corregir;
 *   · una vez validado queda cerrado;
 *   · las horas no cuentan en el proyecto hasta que administración valida.
 *
 * Con la dirección «/t/partes/nuevo» se abre un parte en blanco; se puede
 * venir de un proyecto («?proyecto=…») o sin proyecto ninguno.
 */
export default function WorkerReportDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const nuevo = id === 'nuevo';
  const navigate = useNavigate();
  const { profile, maxFileMb } = useAuth();
  const { toast, confirm } = useDialogs();
  const today = todayMadrid();

  const report = useAsync(async () => (nuevo ? null : getReport(id)), [id, nuevo]);
  const proyectoPrevio = params.get('proyecto');
  // Se ha entrado por la opción «Parte sin proyecto» a propósito.
  const sinProyecto = params.get('sin-proyecto') === '1';
  const files = useAsync(async () => (nuevo ? [] : listDocuments({ reportId: id })), [id, nuevo]);

  const [workType, setWorkType] = useState<OrderType>('fabricacion');
  const [workDone, setWorkDone] = useState('');
  const [hours, setHours] = useState('');
  const [workDate, setWorkDate] = useState(today);
  // BLOQUE 5: el proyecto se elige AQUÍ, en el mismo formulario. «» es
  // «sin proyecto», que es una opción legítima y no un olvido.
  const [projectChoice, setProjectChoice] = useState<string>(proyectoPrevio ?? '');
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [askingMaterial, setAskingMaterial] = useState(false);
  const [materialText, setMaterialText] = useState('');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [viendo, setViendo] = useState<number | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const projectId = report.data?.project_id ?? projectChoice ?? null;
  const proyecto = useAsync(
    async () => (projectId ? workerProject(projectId) : null),
    [projectId],
  );
  // Solo hace falta la lista mientras el parte se pueda cambiar.
  const mios = useAsync(() => myProjects(), []);

  useEffect(() => {
    const r = report.data;
    if (r) {
      setWorkType(r.work_type);
      setWorkDone(r.work_done ?? '');
      setHours(r.hours != null ? String(r.hours).replace('.', ',') : '');
      setWorkDate(r.work_date);
      setProjectChoice(r.project_id ?? '');
      return;
    }
    // Parte NUEVO. Hay que vaciar el formulario a mano: «/t/partes/:id» y
    // «/t/partes/nuevo» son la misma ruta, así que React reaprovecha la
    // pantalla y se quedaría dentro lo del parte anterior. Sin esto, abrir
    // un parte nuevo desde otro arrastraba su proyecto y sus horas.
    if (!nuevo) return;
    setWorkType('fabricacion');
    setWorkDone('');
    setHours('');
    setWorkDate(today);
    setProjectChoice(proyectoPrevio ?? '');
  }, [report.data, nuevo, id, proyectoPrevio, today]);

  /**
   * LOS ENLACES PARA VER LOS ARCHIVOS, VÍDEOS INCLUIDOS.
   *
   * Antes aquí se pedían enlaces solo para «foto» y «firma». Los vídeos
   * se quedaban fuera, y más abajo el visor exige tener el enlace para
   * poder abrir algo: por eso un vídeo subido a un parte se veía en la
   * cuadrícula pero al tocarlo no pasaba nada. Los de los proyectos sí
   * funcionaban porque su panel pide los enlaces con «isViewable», que
   * es lo que se usa ahora también aquí.
   */
  useEffect(() => {
    const media = (files.data ?? []).filter(isViewable);
    if (!media.length) { setThumbs({}); return; }
    signedUrls(media.map((d) => d.storage_path)).then(setThumbs).catch(() => undefined);
  }, [files.data]);

  if (report.loading && !report.data && !nuevo) return <Loading />;
  if (report.error) return <ErrorBox message={report.error} onRetry={report.reload} />;

  const r = report.data;
  const validado = r?.status === 'validado';
  const editable = nuevo || (r != null && REPORT_OPEN_STATUSES.has(r.status));

  async function guardar(submit: boolean) {
    const parsed = parseHours(hours);
    if (submit) {
      if (!workDone.trim()) { toast.error(new Aviso('Escribe qué trabajo has hecho.')); return; }
      if (!parsed) { toast.error(new Aviso('Indica las horas que has trabajado.')); return; }
      const ok = await confirm({
        title: 'Enviar el parte',
        message: (
          <>Se enviará a administración con <strong>{fmtHours(parsed)}</strong>. Podrás
            corregirlo mientras no esté validado.</>
        ),
        confirmLabel: 'Enviar',
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      const guardado = await saveReport({
        id: r?.id ?? null,
        projectId: projectChoice || null,
        workType,
        workDate,
        workDone,
        hours: parsed,
        submit,
      });
      toast.success(submit ? 'Parte enviado' : 'Parte guardado');
      if (nuevo) navigate(`/t/partes/${guardado.id}`, { replace: true });
      else await report.reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function onFiles(list: FileList | null, input: HTMLInputElement | null) {
    if (!list?.length || !profile || !r) return;
    setBusy(true);
    let added = 0;
    for (const file of Array.from(list)) {
      try {
        await uploadDocument({ reportId: r.id }, file, { userId: profile.id, maxMb: maxFileMb });
        added++;
      } catch (e) { toast.error(e); }
    }
    if (input) input.value = '';
    setBusy(false);
    if (added) {
      toast.success(added === 1 ? 'Fotografía añadida' : `${added} fotografías añadidas`);
      await files.reload();
    }
  }

  async function saveSignature(file: File) {
    if (!profile || !r) return;
    setBusy(true);
    try {
      await uploadDocument({ reportId: r.id }, file, {
        userId: profile.id, maxMb: maxFileMb, category: 'firma',
      });
      toast.success('Firma guardada');
      setSigning(false);
      await files.reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  /** Falta material: entra como aviso y lo revisa administración. */
  async function sendMaterial() {
    if (!r) return;
    setBusy(true);
    try {
      await submitRequestFromReport(r.id, materialText);
      toast.success('Aviso enviado a administración');
      setAskingMaterial(false);
      setMaterialText('');
      await report.reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function removeFile(doc: DocumentRow) {
    const ok = await confirm({
      title: 'Quitar el archivo',
      message: <>«{doc.file_name}» dejará de verse en el parte.</>,
      confirmLabel: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    try { await trashDocument(doc.id); await files.reload(); }
    catch (e) { toast.error(e); }
  }

  const p = proyecto.data;
  const fotos = (files.data ?? []).filter((d) => d.category !== 'documento');
  // Lo que se puede mirar dentro de la aplicación, sin descargar nada.
  const verlos: MediaItem[] = fotos
    .filter((d) => isViewable(d) && thumbs[d.storage_path])
    .map((d) => ({
      id: d.id, file_name: d.file_name, url: thumbs[d.storage_path],
      category: d.category, mime_type: d.mime_type,
    }));

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to="/t/partes" style={{ marginBottom: 10 }}>
        <ArrowLeft />Mis partes
      </Link>

      <div className="w-greeting">
        <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h1>
              {nuevo
                ? (sinProyecto && !projectChoice ? 'Parte sin proyecto' : 'Nuevo parte de trabajo')
                : `Parte ${r?.code}`}
            </h1>
            <p className="muted">
              {p ? `${p.code} · ${p.name}` : 'Sin proyecto'}
            </p>
          </div>
          {r && (
            <Badge tone={REPORT_STATUS_TONE[r.status]}>{REPORT_STATUS_LABEL[r.status]}</Badge>
          )}
        </div>
      </div>

      {nuevo && sinProyecto && !projectChoice && (
        <Alert kind="info">
          <strong>Es el mismo parte de siempre, sin proyecto.</strong>
          <div style={{ marginTop: 2 }}>
            Para un trabajo de taller, un apaño suelto o algo que todavía no tiene
            proyecto. Rellénalo igual y envíalo: administración lo asignará a un
            proyecto si corresponde. Si ya sabes de qué proyecto es, elígelo abajo.
          </div>
        </Alert>
      )}

      {r?.status === 'rechazado' && (
        <Alert kind="danger">
          <strong>Administración te ha devuelto el parte.</strong>
          <div style={{ marginTop: 2 }}>Motivo: {r.reject_reason}</div>
          <div style={{ marginTop: 2 }}>Corrige lo que haga falta y vuelve a enviarlo.</div>
        </Alert>
      )}

      {validado && (
        <Alert kind="ok">
          Parte validado el {fmtDateTime(r.validated_at)}. Ya no se puede modificar: sus
          {' '}{fmtHours(r.hours)} cuentan como trabajo realizado.
        </Alert>
      )}

      {r?.status === 'enviado' && (
        <Alert kind="info">
          Enviado el {fmtDateTime(r.submitted_at)}. Puedes corregirlo mientras administración no
          lo valide. <strong>Las horas no cuentan en el proyecto hasta que lo valide.</strong>
        </Alert>
      )}

      {/* ------------------------------------------------- EL TRABAJO */}
      <div className="w-block">
        <h3><Clock aria-hidden />El trabajo</h3>

        {/* BLOQUE 5: «Sin proyecto» es una opción de verdad. Un trabajo de
            taller o un apaño suelto no tiene proyecto, y no hay que
            esperar a que administración cree uno para apuntar las horas. */}
        <div className="field">
          <label className="label" htmlFor="pt-proyecto">Proyecto</label>
          <select id="pt-proyecto" className="select" value={projectChoice} disabled={!editable}
                  onChange={(e) => setProjectChoice(e.target.value)}>
            <option value="">Sin proyecto</option>
            {(mios.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>{x.code} · {x.name}</option>
            ))}
          </select>
          {!projectChoice && (
            <p className="hint" style={{ marginBottom: 0 }}>
              Parte sin proyecto. Administración lo asignará a uno después, si corresponde.
            </p>
          )}
        </div>

        <div className="field">
          <span className="label">¿Qué has hecho?</span>
          <div className="row" role="group" aria-label="Tipo de trabajo" style={{ gap: 10 }}>
            {(['fabricacion', 'montaje'] as OrderType[]).map((t) => (
              <button key={t} type="button"
                      className={`btn btn-lg${workType === t ? ' btn-primary' : ''}`}
                      disabled={!editable}
                      onClick={() => setWorkType(t)}>
                {ORDER_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="pt-fecha">Día trabajado</label>
          <input id="pt-fecha" className="input" type="date" value={workDate} max={today}
                 disabled={!editable} onChange={(e) => setWorkDate(e.target.value)} />
        </div>

        <div className="field">
          <label className="label" htmlFor="pt-done">Trabajo realizado</label>
          <textarea id="pt-done" className="input" rows={4} value={workDone} disabled={!editable}
                    placeholder="Explica brevemente lo que has hecho."
                    onChange={(e) => setWorkDone(e.target.value)} />
        </div>

        <div className="field">
          <label className="label" htmlFor="pt-hours">Tus horas</label>
          <input id="pt-hours" className="input big" inputMode="decimal" value={hours}
                 disabled={!editable} placeholder="7,5"
                 onChange={(e) => setHours(e.target.value)} />
          <small className="muted">
            Solo las horas que <strong>tú</strong> has trabajado. Si habéis ido dos, cada uno
            pone las suyas.
          </small>
        </div>

        {/* Las fotografías, la firma, el aviso de material y los
            comentarios cuelgan del parte, así que no existen hasta que
            el parte existe. Sin este aviso, el trabajador los busca y no
            los encuentra. */}
        {nuevo && (
          <p className="hint" style={{ marginTop: 0 }}>
            Guarda el parte y podrás añadirle <strong>fotografías</strong>, la{' '}
            <strong>firma</strong> del cliente, <strong>avisar de material</strong> y
            escribir comentarios. Podrás seguir corrigiéndolo hasta que lo valide
            administración.
          </p>
        )}

        {editable && (
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-lg" disabled={busy} onClick={() => guardar(false)}>
              <Save />Guardar
            </button>
            <button className="btn btn-lg btn-primary" disabled={busy} onClick={() => guardar(true)}>
              <Send />{r?.status === 'rechazado' ? 'Volver a enviar' : 'Enviar'}
            </button>
          </div>
        )}
      </div>

      {/* --------------------------------------- FOTOS, FIRMA, MATERIAL */}
      {!nuevo && r && (
        <>
          <div className="w-block">
            <h3><Camera aria-hidden />Fotografías y firma</h3>

            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden
                   onChange={(e) => onFiles(e.target.files, cameraInput.current)} />
            <input ref={galleryInput} type="file" accept="image/*,video/*" multiple hidden
                   onChange={(e) => onFiles(e.target.files, galleryInput.current)} />

            {editable && (
              <div className="row" style={{ gap: 10, marginBottom: 12 }}>
                <button className="btn btn-lg" disabled={busy}
                        onClick={() => cameraInput.current?.click()}>
                  <Camera />Hacer foto
                </button>
                <button className="btn btn-lg" disabled={busy}
                        onClick={() => galleryInput.current?.click()}>
                  <Images />Galería
                </button>
                <button className="btn btn-lg" disabled={busy} onClick={() => setSigning(true)}>
                  <PenLine />Firma
                </button>
              </div>
            )}

            {fotos.length ? (
              <ul className="photo-grid">
                {fotos.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="photo-open"
                            onClick={() => {
                              const i = verlos.findIndex((x) => x.id === d.id);
                              if (i >= 0) setViendo(i);
                            }}
                            aria-label={isVideo(d) ? `Ver el vídeo ${d.file_name}` : `Ver ${d.file_name}`}>
                      {/* Un vídeo no tiene miniatura: se marca como vídeo
                          para que se sepa que al tocarlo se reproduce. */}
                      {isVideo(d)
                        ? <span className="photo-video"><Film size={22} aria-hidden /><small>Vídeo</small></span>
                        : thumbs[d.storage_path]
                          ? <img src={thumbs[d.storage_path]} alt={d.file_name} loading="lazy" />
                          : <span className="photo-placeholder">{d.file_name}</span>}
                    </button>
                    {editable && (
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

          <div className="w-block">
            <h3><Boxes aria-hidden />Material</h3>
            {r.needs_material
              ? <Alert kind="warn">
                  <strong>Has avisado de que falta material.</strong>
                  <div style={{ marginTop: 2 }}>Administración lo verá en «Material pendiente».</div>
                </Alert>
              : <p className="muted">Si te falta algo para seguir, avisa y administración lo gestiona.</p>}
            {editable && (
              <button className="btn btn-lg" disabled={busy} onClick={() => setAskingMaterial(true)}>
                <Boxes />Avisar de que falta material
              </button>
            )}
            {!r.project_id && (
              <small className="muted" style={{ display: 'block', marginTop: 8 }}>
                Este parte todavía no tiene proyecto, así que el aviso no puede ir contra uno.
                Si necesitas material igualmente, usa <strong>«Solicitar material»</strong> en la
                pantalla de inicio: llega a administración igual.
              </small>
            )}
          </div>

          <div className="w-block">
            <CommentsPanel owner={{ reportId: r.id }} />
          </div>

          {r.validated_at && (
            <p className="muted" style={{ textAlign: 'center' }}>
              <CheckCircle2 size={14} aria-hidden /> Validado el {fmtDateTime(r.validated_at)}
            </p>
          )}
        </>
      )}

      {viendo != null && verlos[viendo] && (
        <MediaViewer items={verlos} index={viendo} onClose={() => setViendo(null)} />
      )}

      {signing && (
        <Modal title="Firma" onClose={() => setSigning(false)}>
          <SignaturePad onConfirm={saveSignature} onCancel={() => setSigning(false)} busy={busy} />
        </Modal>
      )}

      {askingMaterial && (
        <Modal title="Falta material" onClose={() => setAskingMaterial(false)}>
          <div className="field">
            <label className="label" htmlFor="mat-req">¿Qué falta?</label>
            <textarea id="mat-req" className="input" rows={4} value={materialText}
                      placeholder="Por ejemplo: faltan 3 bisagras de 100 mm."
                      onChange={(e) => setMaterialText(e.target.value)} />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn" onClick={() => setAskingMaterial(false)}>Cancelar</button>
            <button className="btn btn-primary" disabled={busy || !materialText.trim()}
                    onClick={sendMaterial}>Enviar aviso</button>
          </div>
        </Modal>
      )}
    </>
  );
}
