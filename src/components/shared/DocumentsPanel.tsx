import { useEffect, useRef, useState } from 'react';
import {
  Download, Eye, FileText, Film, FolderInput, Lock, RotateCcw, Trash2, Upload,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { useDialogs } from '@/components/ui/Dialogs';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { Tabs } from '@/components/ui/Layout';
import {
  listDocuments, listTrashed, moveDocumentScope, ownerKey, restoreDocument, signedUrl,
  signedUrls, trashDocument, uploadDocument, type DocOwner,
} from '@/services/documents';
import { MediaViewer, isVideo, isViewable, type MediaItem } from '@/components/shared/MediaViewer';
import { fmtBytes, fmtDateTime } from '@/lib/format';
import type { DocScope, DocumentRow } from '@/types/db';

/**
 * Documentos, fotografías y vídeos de una ficha, un proyecto, una orden
 * o un parte.
 *
 * DOS CATEGORÍAS, y solo dos:
 *   · técnica / operativa  → planos, fotos, vídeos, instrucciones.
 *                            La ve el trabajador asignado.
 *   · administrativa       → albaranes, escandallos, facturas.
 *                            Solo administración.
 *
 * La separación la impone la base de datos y el almacén: al trabajador
 * no se le devuelve la fila, y Supabase no le firma el enlace del
 * archivo. Aquí solo se refleja.
 */

const SCOPE_LABEL: Record<DocScope, string> = {
  tecnica: 'Técnica / operativa',
  administrativa: 'Administrativa',
};

export function DocumentsPanel({ owner, title = 'Documentos y fotografías', onChange }: {
  owner: DocOwner;
  title?: string;
  /** Se llama cuando algo cambia aquí dentro, para que quien lo contiene
   *  pueda refrescar su historial: mover un documento de categoría se
   *  anota, y si no se avisa, la anotación no se vería hasta recargar. */
  onChange?: () => void;
}) {
  const { profile, maxFileMb } = useAuth();
  const { toast, confirm } = useDialogs();
  const esAdmin = profile?.role === 'admin';
  const key = ownerKey(owner);

  const [reloadKey, setReloadKey] = useState(0);
  const [verPapelera, setVerPapelera] = useState(false);
  const [categoria, setCategoria] = useState<DocScope>('tecnica');
  const [subiendoEn, setSubiendoEn] = useState<DocScope>('tecnica');
  const [uploading, setUploading] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [viendo, setViendo] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const docs = useAsync(() => listDocuments(owner), [key, reloadKey]);
  const papelera = useAsync(() => listTrashed(owner), [key, reloadKey]);
  const recargar = () => { setReloadKey((n) => n + 1); onChange?.(); };

  // El trabajador solo recibe documentación técnica, así que no se le
  // enseñan pestañas que no llevarían a ninguna parte.
  const todos = docs.data ?? [];
  const tecnicos = todos.filter((d) => d.scope !== 'administrativa');
  const administrativos = todos.filter((d) => d.scope === 'administrativa');
  const lista = esAdmin ? (categoria === 'tecnica' ? tecnicos : administrativos) : tecnicos;

  // Miniaturas y enlaces para ver: se piden de una vez.
  useEffect(() => {
    const media = lista.filter(isViewable);
    if (!media.length) { setThumbs({}); return; }
    signedUrls(media.map((d) => d.storage_path)).then(setThumbs).catch(() => undefined);
  }, [docs.data, categoria, esAdmin]);

  const verlos: MediaItem[] = lista
    .filter((d) => isViewable(d) && thumbs[d.storage_path])
    .map((d) => ({
      id: d.id, file_name: d.file_name, url: thumbs[d.storage_path],
      category: d.category, mime_type: d.mime_type,
    }));

  async function onFiles(files: FileList | null) {
    if (!files?.length || !profile) return;
    let subidos = 0;
    for (const file of Array.from(files)) {
      try {
        setUploading(file.name);
        await uploadDocument(owner, file, {
          userId: profile.id, maxMb: maxFileMb,
          scope: esAdmin ? subiendoEn : 'tecnica',
        });
        subidos++;
      } catch (e) { toast.error(e); }
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = '';
    if (subidos) {
      toast.success(subidos === 1 ? 'Archivo subido' : `${subidos} archivos subidos`);
      if (esAdmin) setCategoria(subiendoEn);
      recargar();
    }
  }

  /** Abrir lo que no es foto ni vídeo (un PDF, un plano…). */
  async function abrirFuera(doc: DocumentRow, descargar = false) {
    try {
      window.open(
        await signedUrl(doc.storage_path, descargar ? doc.file_name : undefined),
        '_blank', 'noopener',
      );
    } catch (e) { toast.error(e); }
  }

  function ver(doc: DocumentRow) {
    const i = verlos.findIndex((m) => m.id === doc.id);
    if (i >= 0) setViendo(i); else abrirFuera(doc);
  }

  async function mover(doc: DocumentRow) {
    const destino: DocScope = doc.scope === 'administrativa' ? 'tecnica' : 'administrativa';
    const ok = await confirm({
      title: '¿Estás seguro de que quieres cambiar este documento de categoría?',
      message: (
        <>
          «{doc.file_name}» pasará a <strong>{SCOPE_LABEL[destino].toLowerCase()}</strong>.
          {destino === 'tecnica'
            ? ' Los trabajadores asignados al proyecto podrán verlo.'
            : ' Dejará de estar al alcance de los trabajadores.'}
        </>
      ),
      confirmLabel: 'Cambiar de categoría',
    });
    if (!ok) return;
    try {
      await moveDocumentScope(doc.id, destino);
      toast.success(`«${doc.file_name}» ahora es ${SCOPE_LABEL[destino].toLowerCase()}`);
      recargar();
    } catch (e) { toast.error(e); }
  }

  async function aPapelera(doc: DocumentRow) {
    const ok = await confirm({
      title: 'Enviar a la papelera',
      message: <>«{doc.file_name}» irá a la papelera y dejará de verse. Se podrá recuperar.</>,
      confirmLabel: 'Enviar a la papelera',
      danger: true,
    });
    if (!ok) return;
    try { await trashDocument(doc.id); toast.success('Enviado a la papelera'); recargar(); }
    catch (e) { toast.error(e); }
  }

  async function recuperar(doc: DocumentRow) {
    try {
      await restoreDocument(doc.id);
      toast.success(`«${doc.file_name}» vuelve a estar disponible`);
      recargar();
    } catch (e) { toast.error(e); }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="row" style={{ gap: 6 }}>
          {Boolean(papelera.data?.length) && (
            <button className="btn btn-sm" aria-pressed={verPapelera}
                    onClick={() => setVerPapelera((v) => !v)}>
              <Trash2 />Papelera ({papelera.data?.length})
            </button>
          )}
          <input ref={fileInput} type="file" multiple hidden
                 onChange={(e) => onFiles(e.target.files)} />
          <button className="btn btn-sm" disabled={Boolean(uploading)}
                  onClick={() => { setSubiendoEn(categoria); fileInput.current?.click(); }}>
            <Upload />{uploading ? 'Subiendo…' : 'Subir archivos'}
          </button>
        </span>
      </div>

      {/* Solo administración elige categoría: el trabajador no tiene
          ninguna a la que cambiar. */}
      {esAdmin && !verPapelera && (
        <div style={{ padding: '10px 16px 0' }}>
          <Tabs
            value={categoria}
            onChange={setCategoria}
            tabs={[
              { key: 'tecnica' as const, label: 'Técnica / operativa', count: tecnicos.length },
              { key: 'administrativa' as const, label: 'Administrativa', count: administrativos.length },
            ]}
          />
          <p className="hint" style={{ margin: '8px 0 0' }}>
            {categoria === 'tecnica'
              ? 'Planos, fotografías, vídeos e instrucciones. Los ven los trabajadores asignados al proyecto.'
              : 'Albaranes, escandallos, facturas y documentación económica. Solo administración.'}
            {' '}Lo que subas ahora entrará en esta categoría.
          </p>
        </div>
      )}

      <div className="panel-body tight">
        {uploading && <div style={{ padding: '10px 16px' }} className="muted">Subiendo {uploading}…</div>}

        {verPapelera ? (
          !papelera.data?.length ? <Empty title="La papelera está vacía" /> : (
            <ul className="doc-list">
              {papelera.data.map((doc) => (
                <li key={doc.id}>
                  <span className="doc-icon"><Trash2 size={18} /></span>
                  <span className="doc-meta">
                    <strong title={doc.file_name}>{doc.file_name}</strong>
                    <span>
                      {fmtBytes(doc.size_bytes)} · en la papelera desde el {fmtDateTime(doc.deleted_at)}
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
          : docs.error
            ? <div style={{ padding: 16 }}><ErrorBox message={docs.error} onRetry={docs.reload} /></div>
            : !lista.length ? (
              <Empty title={esAdmin && categoria === 'administrativa'
                ? 'Sin documentación administrativa'
                : 'Sin archivos'}>
                {esAdmin && categoria === 'administrativa'
                  ? <>Albaranes, escandallos y facturas. Los trabajadores no los verán nunca.</>
                  : <>Fotografías, planos, vídeos e instrucciones.
                      Máximo {maxFileMb} MB por archivo.</>}
              </Empty>
            ) : (
              <ul className="doc-list">
                {lista.map((doc) => (
                  <li key={doc.id}>
                    <span className="doc-icon">
                      {thumbs[doc.storage_path] && !isVideo(doc)
                        ? <img src={thumbs[doc.storage_path]} alt="" loading="lazy" />
                        : isVideo(doc) ? <Film size={18} /> : <FileText size={18} />}
                    </span>
                    <span className="doc-meta">
                      <strong title={doc.file_name}>
                        {doc.file_name}
                        {doc.scope === 'administrativa' && (
                          <Lock size={13} aria-label="Solo administración"
                                style={{ marginLeft: 6, verticalAlign: '-2px' }} />
                        )}
                      </strong>
                      <span>
                        {fmtBytes(doc.size_bytes)} · {fmtDateTime(doc.created_at)}
                        {doc.uploader ? ` · ${doc.uploader.full_name}` : ''}
                      </span>
                    </span>
                    <button className="btn btn-ghost icon-btn" onClick={() => ver(doc)}
                            aria-label={`Ver ${doc.file_name}`}><Eye /></button>
                    <button className="btn btn-ghost icon-btn" onClick={() => abrirFuera(doc, true)}
                            aria-label={`Descargar ${doc.file_name}`}><Download /></button>
                    {esAdmin && (
                      <button className="btn btn-ghost icon-btn" onClick={() => mover(doc)}
                              aria-label={`Cambiar «${doc.file_name}» de categoría`}>
                        <FolderInput />
                      </button>
                    )}
                    {/* FASE 2.2 · El trabajador solo quita LO SUYO. Antes
                        el botón salía sobre los archivos de cualquiera y
                        al pulsarlo la base de datos lo rechazaba, que es
                        la peor forma de decir que no. La comprobación de
                        verdad está en «trash_document»; esto es para no
                        ofrecer algo que no se puede hacer. */}
                    {(esAdmin || doc.uploaded_by === profile?.id) && (
                      <button className="btn btn-ghost icon-btn" onClick={() => aPapelera(doc)}
                              aria-label={`Enviar ${doc.file_name} a la papelera`}><Trash2 /></button>
                    )}
                  </li>
                ))}
              </ul>
            )}
      </div>

      {viendo != null && verlos[viendo] && (
        <MediaViewer
          items={verlos}
          index={viendo}
          onClose={() => setViendo(null)}
          onDownload={(m) => {
            const doc = lista.find((d) => d.id === m.id);
            if (doc) abrirFuera(doc, true);
          }}
        />
      )}
    </section>
  );
}
