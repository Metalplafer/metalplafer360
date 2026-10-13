import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'narrow' | 'wide';
}

/**
 * Ventana emergente. Se cierra con Escape o pulsando fuera.
 *
 * EL FOCO SE PONE UNA SOLA VEZ, AL ABRIRSE.
 *
 * Antes todo esto vivía en un efecto que dependía de «onClose». Quien
 * abre una ventana le pasa casi siempre una función escrita en el sitio
 * —«onClose={() => setX(null)}»—, y eso es una función NUEVA en cada
 * render. Así que a cada letra que se escribía: se volvía a renderizar,
 * el efecto se consideraba caducado y se ejecutaba otra vez, y lo
 * primero que hace es poner el foco en el primer campo.
 *
 * El resultado era el que se vio en los costes extra de una obra:
 * escribir el importe o las notas devolvía el cursor a «¿De qué es?»
 * letra a letra. Le pasaba a TODAS las ventanas de la aplicación, no
 * solo a esa; no se había notado porque las pruebas rellenan los campos
 * de golpe y no tecla a tecla, como hace una persona.
 *
 * Ahora son dos efectos, los dos de montaje:
 *   · el foco y el bloqueo del fondo, que son cosas de «al abrirse»;
 *   · el escuchador de Escape, que lee la última «onClose» de una
 *     referencia en lugar de volver a colgarse en cada render.
 */
export function Modal({ title, onClose, children, footer, size }: Props) {
  const box = useRef<HTMLDivElement>(null);

  // La última «onClose», sin que el escuchador dependa de ella.
  const cerrar = useRef(onClose);
  cerrar.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal="true"
           aria-label={typeof title === 'string' ? title : undefined} ref={box}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar" data-close><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
