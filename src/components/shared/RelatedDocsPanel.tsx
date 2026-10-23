import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Eye, FileText, Film, Paperclip } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Badge } from '@/components/ui/Layout';
import { ErrorBox } from '@/components/ui/Feedback';
import { MediaViewer, isVideo, isViewable, type MediaItem } from '@/components/shared/MediaViewer';
import { listRelatedDocuments, signedUrl, signedUrls } from '@/services/documents';
import { fmtBytes, fmtDate, fmtDateTime } from '@/lib/format';
import type { RelatedDocument } from '@/types/db';

/**
 * LOS ARCHIVOS QUE NO SON DE AQUÍ PERO SE VEN DESDE AQUÍ.
 *
 * MEJORA 1 · Al convertir un presupuesto en proyecto, las fotos y los
 * documentos se quedaban en el presupuesto y desde el proyecto no había
 * manera de verlos. No se podían «mover» (el archivo tiene UN dueño, lo
 * impone la base de datos) ni copiar (habría dos archivos de 80 MB en el
 * almacén en lugar de uno). Así que se miran donde están.
 *
 * MEJORA 2 · Lo mismo con los planos y las fotos de las visitas técnicas
 * vinculadas a este presupuesto o a este proyecto.
 *
 * ES DE SOLO LECTURA, a propósito:
 *
 *   · se puede ver y descargar, que es para lo que se pedía;
 *   · NO se sube nada aquí: lo que se sube al proyecto es del proyecto y
 *     va en su panel de siempre, justo encima;
 *   · NO se envía a la papelera desde aquí: el archivo es de la visita o
 *     del presupuesto, y se retira desde su ficha. Borrar desde aquí lo
 *     haría desaparecer de un sitio en el que nadie estaba mirando.
 *
 * Si no hay nada heredado, el panel NO se dibuja: un panel vacío en cada
 * proyecto sería ruido en todos los que no vienen de un presupuesto.
 */
export function RelatedDocsPanel({ paraTipo, paraId, reloadKey }: {
  paraTipo: RelatedDocument['para_tipo'];
  paraId: string;
  /** Cambia para volver a pedir la lista tras vincular una visita. */
  reloadKey?: string;
}) {
  const { toast } = useDialogs();
  const [enlaces, setEnlaces] = useState<Record<string, string>>({});
  const [viendo, setViendo] = useState<number | null>(null);

  const docs = useAsync(() => listRelatedDocuments(paraTipo, paraId), [paraTipo, paraId, reloadKey]);
  const lista = docs.data ?? [];

  // Miniaturas y vídeos, con el mismo criterio que los demás paneles.
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

  async function abrir(d: RelatedDocument, descargar = false) {
    try {
      window.open(
        await signedUrl(d.storage_path, descargar ? d.file_name : undefined),
        '_blank', 'noopener',
      );
    } catch (e) { toast.error(e); }
  }

  // Mientras carga por primera vez no se enseña nada: si al final no hay
  // nada heredado, habría aparecido y desaparecido un panel vacío.
  if (docs.loading && !docs.data) return null;
  if (docs.error) {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Documentos de origen</h2></div>
        <div className="panel-body">
          <ErrorBox message={docs.error} onRetry={docs.reload} />
        </div>
      </section>
    );
  }
  if (!lista.length) return null;

  const dePresupuesto = lista.filter((d) => d.origen_tipo === 'presupuesto').length;
  const deVisitas = lista.filter((d) => d.origen_tipo === 'visita').length;
  const deCorreo = lista.filter((d) => d.origen_tipo === 'correo').length;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Documentos de origen</h2>
        <Badge tone="steel" plain>{lista.length}</Badge>
      </div>

      <div className="panel-body">
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
                {/*
                  DE DÓNDE VIENE. Es lo que se pidió con estas palabras:
                  «Procede de la visita técnica del [fecha]».
                */}
                <span>
                  <Paperclip size={12} aria-hidden style={{ verticalAlign: '-2px' }} />{' '}
                  {d.origen_tipo === 'visita'
                    ? <>Procede de la visita técnica{d.origen_fecha ? ` del ${fmtDate(d.origen_fecha)}` : ''}{' '}</>
                    : d.origen_tipo === 'correo'
                      ? <>Lo mandó el cliente por correo{d.origen_fecha ? ` el ${fmtDate(d.origen_fecha)}` : ''}{' '}</>
                      : <>Procede del presupuesto{' '}</>}
                  <Link to={d.origen_tipo === 'correo'
                    ? `/admin/solicitudes/${d.origen_id}`
                    : `/admin/fichas/${d.origen_id}`}
                        onClick={(e) => e.stopPropagation()}>
                    {d.origen_code}
                  </Link>
                </span>
              </span>
              {isViewable(d) && enlaces[d.storage_path] && (
                <button className="btn btn-ghost icon-btn"
                        onClick={() => setViendo(verlos.findIndex((v) => v.id === d.id))}
                        aria-label={`Ver ${d.file_name}`}><Eye /></button>
              )}
              <button className="btn btn-ghost icon-btn" onClick={() => abrir(d, true)}
                      aria-label={`Descargar ${d.file_name}`}><Download /></button>
            </li>
          ))}
        </ul>

        <p className="hint" style={{ marginBottom: 0 }}>
          {dePresupuesto > 0 && (
            <>{dePresupuesto === 1 ? '1 archivo del presupuesto de origen'
              : `${dePresupuesto} archivos del presupuesto de origen`}</>
          )}
          {dePresupuesto > 0 && (deVisitas > 0 || deCorreo > 0) && ', '}
          {deVisitas > 0 && (
            <>{deVisitas === 1 ? '1 de una visita técnica'
              : `${deVisitas} de las visitas técnicas`}</>
          )}
          {deVisitas > 0 && deCorreo > 0 && ' y '}
          {deCorreo > 0 && (
            <>{deCorreo === 1 ? '1 que mandó el cliente por correo'
              : `${deCorreo} que mandó el cliente por correo`}</>
          )}
          . Se ven desde aquí, no se copian: hay un solo archivo. Para quitarlos o subir
          más, entra en el sitio de origen.
        </p>
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
