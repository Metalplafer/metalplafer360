import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Boxes, Camera, CheckCircle2, Clock, Film, Images, PenLine, Save, Send, Trash2,
  Users,
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
import {
  getReport, myAvisos, myProjects, reportCandidates, reportTeam, saveReport,
  saveReportWorkers, workerProject,
} from '@/services/partes';
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
  // Se ha entrado desde un AVISO DE CLIENTE asignado.
  const avisoPrevio = params.get('aviso');
  // Se ha entrado por la opción «Parte sin proyecto» a propósito.
  const sinProyecto = params.get('sin-proyecto') === '1';
  const files = useAsync(async () => (nuevo ? [] : listDocuments({ reportId: id })), [id, nuevo]);

  const [workType, setWorkType] = useState<OrderType>('fabricacion');
  const [workDone, setWorkDone] = useState('');
  const [hours, setHours] = useState('');
  const [workDate, setWorkDate] = useState(today);
  // BLOQUE 5: el proyecto se elige AQUÍ, en el mismo formulario. «» es
  // «sin proyecto», que es una opción legítima y no un olvido.
  /**
   * DE DÓNDE ES EL PARTE · un solo selector para las dos cosas.
   *
   * Se guarda con prefijo («p:» un proyecto, «a:» un aviso, «» nada)
   * porque son EXCLUYENTES: un parte cuelga de un proyecto, de un aviso
   * o de nada. Con dos estados separados se podrían contradecir, y la
   * base de datos rechazaría el parte al guardarlo.
   */
  const [origen, setOrigen] = useState<string>(
    proyectoPrevio ? `p:${proyectoPrevio}` : avisoPrevio ? `a:${avisoPrevio}` : '',
  );
  const projectChoice = origen.startsWith('p:') ? origen.slice(2) : '';
  const avisoChoice = origen.startsWith('a:') ? origen.slice(2) : '';
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
  const misAvisos = useAsync(() => myAvisos(), []);
  // Con quién se puede compartir y con quién se comparte ya. Las dos
  // cosas vienen de la base de datos: la lista de candidatos la decide
  // ella, no esta pantalla.
  const candidatos = useAsync(
    async () => (nuevo ? [] : reportCandidates(id)), [id, nuevo, report.data?.project_id,
      report.data?.ficha_id]);
  const equipo = useAsync(async () => (nuevo ? [] : reportTeam(id)), [id, nuevo]);
  /**
   * LOS ACOMPAÑANTES EN LA PANTALLA · identificador → horas, en texto.
   *
   * En texto y no en número porque se escribe con coma («3,5») y, a
   * medio escribir, «3,» no es ningún número. Se convierte al guardar.
   */
  const [companeros, setCompaneros] = useState<Record<string, string>>({});

  useEffect(() => {
    const r = report.data;
    if (r) {
      setWorkType(r.work_type);
      setWorkDone(r.work_done ?? '');
      setHours(r.hours != null ? String(r.hours).replace('.', ',') : '');
      setWorkDate(r.work_date);
      setOrigen(r.project_id ? `p:${r.project_id}` : r.ficha_id ? `a:${r.ficha_id}` : '');
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
    setOrigen(proyectoPrevio ? `p:${proyectoPrevio}` : avisoPrevio ? `a:${avisoPrevio}` : '');
  }, [report.data, nuevo, id, proyectoPrevio, avisoPrevio, today]);

  // Lo guardado manda: cada vez que llega el equipo del parte se vuelve
  // a pintar desde él. El autor no entra aquí: sus horas son las del
  // parte, y la base de datos no le deja estar en los dos sitios.
  useEffect(() => {
    const filas = (equipo.data ?? []).filter((x) => !x.es_autor);
    setCompaneros(Object.fromEntries(filas.map(
      (x) => [x.worker_id, String(x.hours ?? '').replace('.', ',')])));
  }, [equipo.data]);

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
  /**
   * ¿ES MÍO ESTE PARTE?
   *
   * Puedo ESTAR en un parte compartido sin ser quien lo rellenó. En ese
   * caso lo veo entero —es el mismo trabajo y las mismas fotografías—
   * pero no lo corrijo: lo corrige su autor. La base de datos lo
   * rechazaría de todas formas, así que enseñar los botones sería
   * enseñar algo que no funciona.
   */
  const esMio = nuevo || (r != null && r.worker_id === profile?.id);
  const editable = esMio && (nuevo || (r != null && REPORT_OPEN_STATUSES.has(r.status)));

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
        fichaId: avisoChoice || null,
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

  /** Poner o quitar a alguien. Al ponerlo, se le proponen MIS horas. */
  function toggleCompanero(workerId: string) {
    setCompaneros((m) => {
      if (workerId in m) {
        const { [workerId]: _fuera, ...resto } = m;
        return resto;
      }
      return { ...m, [workerId]: hours || '' };
    });
  }

  /**
   * GUARDAR CON QUIÉN SE HA HECHO EL TRABAJO.
   *
   * Se manda la lista completa: quitar a alguien es mandarla sin él. Las
   * horas de cada uno se comprueban antes de salir, para decirlo aquí en
   * lugar de que lo diga la base de datos con otras palabras.
   */
  async function guardarCompaneros() {
    const filas: { workerId: string; hours: number }[] = [];
    for (const [workerId, texto] of Object.entries(companeros)) {
      const h = parseHours(texto);
      if (!h) {
        const quien = candidatos.data?.find((c) => c.id === workerId)?.full_name ?? 'esa persona';
        toast.error(new Aviso(`Pon las horas que ha trabajado ${quien}.`));
        return;
      }
      filas.push({ workerId, hours: h });
    }
    setBusy(true);
    try {
      await saveReportWorkers(r!.id, filas);
      toast.success(filas.length ? 'Guardado quién ha venido' : 'El parte vuelve a ser solo tuyo');
      await equipo.reload();
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
  // El AVISO del que es el parte, si lo es. Se busca en MIS avisos, que es
  // justo el alcance que toca: si no está entre ellos, no es mío.
  const avisoId = report.data?.ficha_id ?? avisoChoice ?? null;
  const av = (misAvisos.data ?? []).find((x) => x.id === avisoId) ?? null;
  /**
   * LAS HORAS-PERSONA DEL TRABAJO.
   *
   * Si el parte es mío se calcula sobre lo que hay EN PANTALLA, para
   * que la cifra acompañe a lo que estoy escribiendo. Si es de otro no
   * hay nada escribiéndose: se suma lo guardado.
   */
  const horasPersona = esMio
    ? (parseHours(hours) ?? 0)
      + Object.values(companeros).reduce((n, x) => n + (parseHours(x) ?? 0), 0)
    : (equipo.data ?? []).reduce((n, x) => n + (x.hours ?? 0), 0);
  const quienLoRelleno = (equipo.data ?? []).find((x) => x.es_autor)?.full_name ?? null;
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
                ? (sinProyecto && !origen ? 'Parte sin proyecto' : 'Nuevo parte de trabajo')
                : `Parte ${r?.code}`}
            </h1>
            <p className="muted">
              {p ? `${p.code} · ${p.name}`
                : av ? `${av.code} · ${av.title ?? 'Aviso'}`
                : 'Sin proyecto'}
            </p>
          </div>
          {r && (
            <Badge tone={REPORT_STATUS_TONE[r.status]}>{REPORT_STATUS_LABEL[r.status]}</Badge>
          )}
        </div>
      </div>

      {nuevo && sinProyecto && !origen && (
        <Alert kind="info">
          <strong>Es el mismo parte de siempre, sin proyecto.</strong>
          <div style={{ marginTop: 2 }}>
            Para un trabajo de taller, un apaño suelto o algo que todavía no tiene
            proyecto. Rellénalo igual y envíalo: administración lo asignará a un
            proyecto si corresponde. Si ya sabes de qué proyecto es, elígelo abajo.
          </div>
        </Alert>
      )}

      {/* Estoy aquí porque hice el trabajo con él, no porque sea mío. */}
      {r && !esMio && (
        <Alert kind="info">
          <strong>Este parte lo rellenó {quienLoRelleno ?? 'otro compañero'}.</strong>
          <div style={{ marginTop: 2 }}>
            Lo ves porque hiciste el trabajo con él: es un solo trabajo, con un solo
            juego de fotografías. Tus horas están ahí abajo, en «Quién estuvo».
            Si hay que corregir algo, lo corrige quien lo rellenó.
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
          <label className="label" htmlFor="pt-origen">¿De qué trabajo es?</label>
          <select id="pt-origen" className="select" value={origen} disabled={!editable}
                  onChange={(e) => setOrigen(e.target.value)}>
            <option value="">Sin proyecto</option>
            {(mios.data ?? []).length > 0 && (
              <optgroup label="Proyectos">
                {(mios.data ?? []).map((x) => (
                  <option key={x.id} value={`p:${x.id}`}>{x.code} · {x.name}</option>
                ))}
              </optgroup>
            )}
            {(misAvisos.data ?? []).length > 0 && (
              <optgroup label="Avisos de cliente">
                {(misAvisos.data ?? []).map((x) => (
                  <option key={x.id} value={`a:${x.id}`}>
                    {x.code} · {x.title ?? 'Aviso'}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {!origen && (
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
          {esMio ? (
            <>
              <label className="label" htmlFor="pt-done">Trabajo realizado</label>
              <textarea id="pt-done" className="input" rows={4} value={workDone}
                        disabled={!editable}
                        placeholder="Explica brevemente lo que has hecho."
                        onChange={(e) => setWorkDone(e.target.value)} />
            </>
          ) : (
            <>
              <span className="label">Trabajo realizado</span>
              <p className="pre" style={{ margin: 0 }}>{workDone || '—'}</p>
            </>
          )}
        </div>

        <div className="field">
          <label className="label" htmlFor="pt-hours">
            {esMio ? 'Tus horas' : 'Sus horas'}
          </label>
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

      {/* ------------------------------------------ CON QUIÉN LO HE HECHO
          Un parte puede ser de uno o de varios. Si fueron dos, es UN
          trabajo —una descripción, un tipo de actividad, un juego de
          fotografías— y lo que es de cada uno son SUS horas.

          Solo se puede elegir a quien está asignado al MISMO proyecto o
          al MISMO aviso. La lista viene de la base de datos, de la misma
          función que luego comprueba el guardado: así el selector no
          puede ofrecer a nadie que después se rechace. Y si alguien
          manipula la petición, la base de datos la para igual.

          No aparece en un parte nuevo: hasta que el parte existe no hay
          nada que compartir. */}
      {!nuevo && r && (
        <div className="w-block">
          <h3>
            <Users aria-hidden />
            {esMio ? '¿Con quién lo has hecho?' : 'Quién estuvo'}
          </h3>

          {/* Si el parte NO es mío, no hay nada que elegir: se enseña
              quién estuvo y cuántas horas puso cada uno, y ya está. El
              reparto lo cambia su autor. */}
          {!esMio ? (
            <>
              <ul className="team-list">
                {(equipo.data ?? []).map((x) => (
                  <li key={x.worker_id}>
                    {x.full_name}
                    {x.es_autor && <span className="faint"> · rellenó el parte</span>}
                    {x.worker_id === profile?.id && <span className="faint"> · tú</span>}
                    <span className="num" style={{ marginLeft: 'auto' }}>
                      {x.hours != null ? fmtHours(x.hours) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="w-note" style={{ marginBottom: 0 }}>
                Es un solo trabajo. Entre todos lleva{' '}
                <strong>{fmtHours(horasPersona)}</strong>.
              </p>
            </>
          ) : !r.project_id && !r.ficha_id ? (
            <p className="muted" style={{ margin: 0 }}>
              Este parte todavía no tiene proyecto ni aviso, así que no hay con quién
              compartirlo. Elige uno arriba y guarda, o pídele a administración que lo
              asigne.
            </p>
          ) : !candidatos.data?.length ? (
            <p className="muted" style={{ margin: 0 }}>
              No hay nadie más asignado a este trabajo. Si fuisteis dos, dile a
              administración que dé de alta al otro y después repártelo.
            </p>
          ) : (
            <div className="stack">
              {candidatos.data.map((c) => {
                const puesto = c.id in companeros;
                return (
                  <div key={c.id} className="row-between" style={{ gap: 10, alignItems: 'center' }}>
                    <label className="checkbox" style={{ minWidth: 0 }}>
                      <input type="checkbox" checked={puesto} disabled={!editable || busy}
                             onChange={() => toggleCompanero(c.id)} />
                      {c.full_name}
                    </label>
                    {puesto && (
                      <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                        <input className="input" inputMode="decimal" aria-label={`Horas de ${c.full_name}`}
                               style={{ width: 86, textAlign: 'right' }}
                               value={companeros[c.id]} disabled={!editable || busy}
                               placeholder="3,5"
                               onChange={(e) => setCompaneros(
                                 (m) => ({ ...m, [c.id]: e.target.value }))} />
                        <span className="muted">h</span>
                      </span>
                    )}
                  </div>
                );
              })}

              <p className="w-note" style={{ margin: 0 }}>
                Cada uno pone <strong>sus</strong> horas. En total, este trabajo lleva{' '}
                <strong>{fmtHours(horasPersona)}</strong> entre todos.
              </p>

              {editable && (
                <button className="btn btn-lg" disabled={busy} onClick={guardarCompaneros}>
                  <Save />Guardar quién ha venido
                </button>
              )}
              {!editable && (
                <p className="hint" style={{ margin: 0 }}>
                  El parte está validado: ya no se puede cambiar con quién se hizo.
                </p>
              )}
            </div>
          )}
        </div>
      )}

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
