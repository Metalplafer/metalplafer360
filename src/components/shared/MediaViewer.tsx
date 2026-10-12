import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import type { DocumentRow } from '@/types/db';

/**
 * VISOR DE FOTOGRAFÍAS Y VÍDEOS.
 *
 * Hasta ahora, «ver» abría el archivo en otra pestaña del navegador. En
 * el móvil eso muchas veces acaba en una descarga, y el trabajador que
 * está en la obra no puede mirar una foto sin bajársela.
 *
 * Esto lo enseña DENTRO de la aplicación:
 *   · la foto, a pantalla completa, y se puede ampliar tocándola;
 *   · el vídeo, con su reproductor y sus controles, sin salir;
 *   · se cierra con la X, con Escape o tocando fuera;
 *   · si hay varios, se pasa de uno a otro con las flechas o el dedo.
 *
 * Lo que no sea foto ni vídeo (un PDF, un plano) no se intenta mostrar
 * aquí: para eso está el botón de descargar, que es lo que espera
 * cualquiera con un documento.
 */

type Reconocible = { category: DocumentRow['category']; mime_type?: string | null };

export function isImage(doc: Reconocible) {
  return doc.category === 'foto' || doc.category === 'firma'
    || Boolean(doc.mime_type?.startsWith('image/'));
}

export function isVideo(doc: Reconocible) {
  return doc.category === 'video' || Boolean(doc.mime_type?.startsWith('video/'));
}

export function isViewable(doc: Reconocible) {
  return isImage(doc) || isVideo(doc);
}

export interface MediaItem {
  id: string;
  file_name: string;
  url: string;
  category: DocumentRow['category'];
  mime_type?: string | null;
}

export function MediaViewer({ items, index, onClose, onDownload }: {
  items: MediaItem[];
  index: number;
  onClose: () => void;
  onDownload?: (item: MediaItem) => void;
}) {
  const [actual, setActual] = useState(index);
  const [ampliada, setAmpliada] = useState(false);
  const [tocado, setTocado] = useState<number | null>(null);

  const total = items.length;
  const item = items[actual];

  const ir = useCallback((paso: number) => {
    setAmpliada(false);
    setActual((i) => (i + paso + total) % total);
  }, [total]);

  useEffect(() => { setActual(index); setAmpliada(false); }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && total > 1) ir(1);
      if (e.key === 'ArrowLeft' && total > 1) ir(-1);
    };
    document.addEventListener('keydown', onKey);
    // Mientras se mira una foto, la página de detrás no se mueve.
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = antes;
    };
  }, [onClose, ir, total]);

  if (!item) return null;

  // Pasar de una foto a otra con el dedo, como en cualquier galería.
  function onTouchStart(e: React.TouchEvent) { setTocado(e.touches[0].clientX); }
  function onTouchEnd(e: React.TouchEvent) {
    if (tocado == null || total < 2 || ampliada) { setTocado(null); return; }
    const recorrido = e.changedTouches[0].clientX - tocado;
    if (Math.abs(recorrido) > 60) ir(recorrido < 0 ? 1 : -1);
    setTocado(null);
  }

  return createPortal(
    <div className="visor" role="dialog" aria-modal="true" aria-label={item.file_name}
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="visor-barra">
        <span className="visor-nombre" title={item.file_name}>
          {item.file_name}
          {total > 1 && <small> · {actual + 1} de {total}</small>}
        </span>
        {onDownload && (
          <button className="btn btn-ghost icon-btn" onClick={() => onDownload(item)}
                  aria-label={`Descargar ${item.file_name}`}><Download /></button>
        )}
        <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar"><X /></button>
      </div>

      <div className="visor-cuerpo" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {isVideo(item) ? (
          <video
            key={item.id}
            className="visor-video"
            src={item.url}
            controls
            playsInline
            preload="metadata"
          >
            Tu navegador no puede reproducir este vídeo.
          </video>
        ) : (
          <img
            key={item.id}
            className={`visor-imagen${ampliada ? ' ampliada' : ''}`}
            src={item.url}
            alt={item.file_name}
            onClick={() => setAmpliada((v) => !v)}
          />
        )}
      </div>

      {total > 1 && (
        <>
          <button className="visor-flecha izquierda" onClick={() => ir(-1)}
                  aria-label="Anterior"><ChevronLeft /></button>
          <button className="visor-flecha derecha" onClick={() => ir(1)}
                  aria-label="Siguiente"><ChevronRight /></button>
        </>
      )}

      {!isVideo(item) && (
        <p className="visor-pie">{ampliada ? 'Toca para ajustar' : 'Toca la imagen para ampliar'}</p>
      )}
    </div>,
    document.body,
  );
}
