import { useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, Film, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { useDialogs } from '@/components/ui/Dialogs';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { listDocuments, listTrashed, ownerKey, restoreDocument, signedUrl, signedUrls,
         trashDocument, uploadDocument, type DocOwner } from '@/services/documents';
import { fmtBytes, fmtDateTime } from '@/lib/format';
import type { DocumentRow } from '@/types/db';

/**
 * Documentos, fotografías y vídeos de una ficha o de un proyecto.
 * Una única lista, sin carpetas: el nombre del archivo lo identifica.
 * Los planos son documentos normales, sin versiones.
 */
export function DocumentsPanel({ owner, title = 'Documentos y fotografías' }: {
  owner: DocOwner; title?: string;
}) {
  const { profile, maxFileMb } = useAuth();
  const { toast, confirm } = useDialogs();
  const key = ownerKey(owner);
  const [reloadKey, setReloadKey] = useState(0);
  const [verPapelera, setVerPapelera] = useState(false);
  const docs = useAsync(() => listDocuments(owner), [key, reloadKey]);
  const papelera = useAsync(() => listTrashed(owner), [key, reloadKey]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recargar = () => setReloadKey((n) => n + 1);

  useEffect(() => {
    const photos = (docs.data ?? []).filter((d) => d.category === 'foto');
    if (!photos.length) { setThumbs({}); return; }
    signedUrls(photos.map((d) => d.storage_path)).then(setThumbs).catch(() => undefined);
  }, [docs.data]);

  async function onFiles(files: FileList | null) {
    if (!files?.length || !profile) return;
    let uploaded = 0;
    for (const file of Array.from(files)) {
      try {
        setUploading(file.name);
        await uploadDocument(owner, file, { userId: profile.id, maxMb: maxFileMb });
        uploaded++;
      } catch (e) {
        toast.error(e);
      }
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = '';
    if (uploaded) {
      toast.success(uploaded === 1 ? 'Archivo subido' : `${uploaded} archivos subidos`);
      recargar();
    }
  }

  async function open(doc: DocumentRow, download = false) {
    try {
      window.open(await signedUrl(doc.storage_path, download ? doc.file_name : undefined), '_blank', 'noopener');
    } catch (e) { toast.error(e); }
  }

  async function remove(doc: DocumentRow) {
    const ok = await confirm({
      title: 'Enviar a la papelera',
      message: <>«{doc.file_name}» irá a la papelera y dejará de verse en la ficha. Se podrá recuperar.</>,
      confirmLabel: 'Enviar a la papelera',
      danger: true,
    });
    if (!ok) return;
    try {
      await trashDocument(doc.id);
      toast.success('Enviado a la papelera');
      recargar();
    } catch (e) { toast.error(e); }
  }

  async function recuperar(doc: DocumentRow) {
    try {
      await restoreDocument(doc.id);
      toast.success(`«${doc.file_name}» vuelve a estar en la ficha`);
      recargar();
    } catch (e) { toast.error(e); }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="row" style={{ gap: 6 }}>
          {/* Aquí no se borra nada: lo retirado se queda en la papelera
              y se puede recuperar mientras no se vacíe a propósito. */}
          {Boolean(papelera.data?.length) && (
            <button className="btn btn-sm" aria-pressed={verPapelera}
                    onClick={() => setVerPapelera((v) => !v)}>
              <Trash2 />Papelera ({papelera.data?.length})
            </button>
          )}
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <button className="btn btn-sm" onClick={() => fileInput.current?.click()} disabled={Boolean(uploading)}>
            <Upload />{uploading ? 'Subiendo…' : 'Subir archivos'}
          </button>
        </span>
      </div>

      <div className="panel-body tight">
        {uploading && (
          <div style={{ padding: '10px 16px' }} className="muted">Subiendo {uploading}…</div>
        )}

        {verPapelera ? (
          !papelera.data?.length
            ? <Empty title="La papelera está vacía" />
            : (
              <ul className="doc-list">
                {papelera.data.map((doc) => (
                  <li key={doc.id}>
                    <span className="doc-icon"><Trash2 size={18} /></span>
                    <span className="doc-meta">
                      <strong title={doc.file_name}>{doc.file_name}</strong>
                      <span>
                        {fmtBytes(doc.size_bytes)} · en la papelera desde
                        el {fmtDateTime(doc.deleted_at)}
                      </span>
                    </span>
                    <button className="btn btn-sm" onClick={() => recuperar(doc)}>
                      <RotateCcw />Restaurar
                    </button>
                  </li>
                ))}
              </ul>
            )
        ) : docs.loading && !docs.data ? <Loading />
          : docs.error ? <div style={{ padding: 16 }}><ErrorBox message={docs.error} onRetry={docs.reload} /></div>
          : !docs.data?.length ? (
            <Empty title="Sin archivos">
              Fotografías, planos, presupuestos o vídeos, todo en la misma lista.
              Máximo {maxFileMb} MB por archivo.
            </Empty>
          ) : (
            <ul className="doc-list">
              {docs.data.map((doc) => (
                <li key={doc.id}>
                  <span className="doc-icon">
                    {doc.category === 'foto' && thumbs[doc.storage_path]
                      ? <img src={thumbs[doc.storage_path]} alt="" loading="lazy" />
                      : doc.category === 'video' ? <Film size={18} /> : <FileText size={18} />}
                  </span>
                  <span className="doc-meta">
                    <strong title={doc.file_name}>{doc.file_name}</strong>
                    <span>
                      {fmtBytes(doc.size_bytes)} · {fmtDateTime(doc.created_at)}
                      {doc.uploader ? ` · ${doc.uploader.full_name}` : ''}
                    </span>
                  </span>
                  <button className="btn btn-ghost icon-btn" onClick={() => open(doc)}
                          aria-label={`Ver ${doc.file_name}`}><Eye /></button>
                  <button className="btn btn-ghost icon-btn" onClick={() => open(doc, true)}
                          aria-label={`Descargar ${doc.file_name}`}><Download /></button>
                  <button className="btn btn-ghost icon-btn" onClick={() => remove(doc)}
                          aria-label={`Enviar ${doc.file_name} a la papelera`}><Trash2 /></button>
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  );
}
