import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Eye, FileText, Film, FolderKanban, Trash2, Upload } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { useDialogs } from '@/components/ui/Dialogs';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { MediaViewer, isVideo, isViewable, type MediaItem } from '@/components/shared/MediaViewer';
import {
  listWorkDocuments, signedUrl, signedUrls, trashDocument, uploadDocument,
} from '@/services/documents';
import { fmtBytes, fmtDateTime } from '@/lib/format';
import type { WorkDocument } from '@/types/db';

/**
 * LA DOCUMENTACIÓN DE UNA OBRA.
 *
 * Junta dos cosas en una sola lista y SIN DUPLICAR NI UN ARCHIVO:
 *
 *   · lo que se sube aquí, a la obra (un contrato, un acta, el permiso
 *     del ayuntamiento: papeles que son de la obra y no de un proyecto);
 *   · lo que ya está subido a sus proyectos, que se ve desde aquí tal
 *     como está, con una etiqueta que dice de qué proyecto viene.
 *
 * El archivo sigue existiendo UNA VEZ: en el almacén y en la tabla. Lo
 * que hace la vista «work_documents» es mirarlo desde los dos sitios.
 *
 * Todo esto es de administración. Un trabajador no ve obras, así que
 * tampoco ve esta pantalla; la vista lo filtra por su cuenta y no se
 * confía en que la pantalla lo esconda.
 */
export function WorkDocumentsPanel({ workId, onChange }: {
  workId: string;
  onChange?: () => void;
}) {
  const { profile } = useAuth();
  const { toast, confirm } = useDialogs();
  const [subiendo, setSubiendo] = useState(false);
  const [enlaces, setEnlaces] = useState<Record<string, string>>({});
  const [viendo, setViendo] = useState<number | null>(null);

  const docs = useAsync(() => listWorkDocuments(workId), [workId]);
  const lista = docs.data ?? [];

  // Enlaces para TODO lo que se puede mirar, vídeos incluidos: es el
  // mismo criterio que usan el panel de proyectos y el de los partes.
  useEffect(() => {
    const media = lista.filter(isViewable);
    if (!media.length) { setEnlaces({}); return; }
    signedUrls(media.map((d) => d.storage_path)).then(setEnlaces).catch(() => undefined);
  }, [docs.data]);

  const verlos: MediaItem[] = lista
    .filter((d) => isViewable(d) && enlaces[d.storage_path])
    .map((d) => ({
      id: d.id, file_name: d.file_name, url: enlaces[d.storage_path],
      category: d.category, mime_type: d.mime_type,
    }));

  async function onFiles(files: FileList | null) {
    if (!files?.length || !profile) return;
    setSubiendo(true);
    let hechos = 0;
    try {
      for (const file of Array.from(files)) {
        // A la OBRA, no a un proyecto: el dueño es la obra.
        await uploadDocument({ workId }, file, { userId: profile.id, maxMb: 100 });
        hechos += 1;
      }
      toast.success(hechos === 1 ? 'Archivo añadido a la obra'
        : `${hechos} archivos añadidos a la obra`);
      docs.reload();
      onChange?.();
    } catch (e) { toast.error(e); } finally { setSubiendo(false); }
  }

  /** Abrir o descargar. Igual que en el panel de proyectos. */
  async function abrir(d: WorkDocument, descargar = false) {
    try {
      window.open(
        await signedUrl(d.storage_path, descargar ? d.file_name : undefined),
        '_blank', 'noopener',
      );
    } catch (e) { toast.error(e); }
  }

  async function aPapelera(d: WorkDocument) {
    const ok = await confirm({
      title: 'Enviar a la papelera',
      message: (
        <>
          «{d.file_name}» irá a la papelera y dejará de verse
          {d.origen_code ? <> también en el proyecto {d.origen_code}</> : null}. Se podrá
          recuperar.
        </>
      ),
      confirmLabel: 'Enviar a la papelera',
      danger: true,
    });
    if (!ok) return;
    try {
      await trashDocument(d.id);
      toast.success('Enviado a la papelera');
      docs.reload();
      onChange?.();
    } catch (e) { toast.error(e); }
  }

  const propios = lista.filter((d) => !d.project_id).length;
  const deProyectos = lista.length - propios;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Documentación de la obra</h2>
        <label className="btn btn-sm">
          <Upload />{subiendo ? 'Subiendo…' : 'Subir'}
          <input type="file" multiple hidden disabled={subiendo}
                 onChange={(e) => { onFiles(e.target.files); e.currentTarget.value = ''; }} />
        </label>
      </div>

      <div className="panel-body">
        {docs.loading && !docs.data ? <Loading />
          : docs.error ? <ErrorBox message={docs.error} onRetry={docs.reload} />
          : !lista.length ? (
            <Empty title="Sin documentación" icon={<FileText aria-hidden />}>
              Sube aquí los papeles que son de la obra entera: el contrato, el acta, los
              permisos. Lo que subas a sus proyectos aparecerá también en esta lista.
            </Empty>
          ) : (
            <>
              <ul className="doc-list">
                {lista.map((d) => (
                  <li key={d.id}>
                    <span className="doc-icon">
                      {enlaces[d.storage_path] && !isVideo(d)
                        ? <img src={enlaces[d.storage_path]} alt="" loading="lazy" />
                        : isVideo(d) ? <Film size={18} /> : <FileText size={18} />}
                    </span>
                    <span className="doc-meta">
                      <strong title={d.file_name}>{d.file_name}</strong>
                      <span>
                        {fmtBytes(d.size_bytes)} · {fmtDateTime(d.created_at)}
                        {d.uploader_name ? ` · ${d.uploader_name}` : ''}
                      </span>
                      {/* De dónde viene. Es lo que se pidió poder ver. */}
                      {d.origen_code ? (
                        <span>
                          <FolderKanban size={12} aria-hidden style={{ verticalAlign: '-2px' }} />{' '}
                          Del proyecto{' '}
                          <Link to={`/admin/proyectos/${d.project_id}`}
                                onClick={(e) => e.stopPropagation()}>
                            {d.origen_code}
                          </Link>
                        </span>
                      ) : (
                        <span className="faint">De la obra</span>
                      )}
                    </span>
                    {isViewable(d) && enlaces[d.storage_path] && (
                      <button className="btn btn-ghost icon-btn"
                              onClick={() => setViendo(verlos.findIndex((v) => v.id === d.id))}
                              aria-label={`Ver ${d.file_name}`}><Eye /></button>
                    )}
                    <button className="btn btn-ghost icon-btn" onClick={() => abrir(d, true)}
                            aria-label={`Descargar ${d.file_name}`}><Download /></button>
                    <button className="btn btn-ghost icon-btn" onClick={() => aPapelera(d)}
                            aria-label={`Enviar ${d.file_name} a la papelera`}><Trash2 /></button>
                  </li>
                ))}
              </ul>

              <p className="hint" style={{ marginBottom: 0 }}>
                {propios === 1 ? '1 archivo de la obra' : `${propios} archivos de la obra`}
                {deProyectos > 0 && (
                  <> y {deProyectos === 1 ? '1 de sus proyectos' : `${deProyectos} de sus proyectos`}</>
                )}
                . Los de los proyectos se ven desde aquí, no se copian: hay un solo archivo.
              </p>
            </>
          )}
      </div>

      {viendo != null && viendo >= 0 && verlos[viendo] && (
        <MediaViewer
          items={verlos}
          index={viendo}
          onClose={() => setViendo(null)}
          onDownload={(m) => {
            const d = lista.find((x) => x.id === m.id);
            if (d) abrir(d, true);
          }}
        />
      )}
    </section>
  );
}
