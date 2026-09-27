import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenLine } from 'lucide-react';

/**
 * Firma del cliente dibujada con el dedo.
 * Tres pasos: dibujar · borrar · confirmar. No se guarda nada hasta que
 * la persona pulsa «Guardar firma».
 */
export function SignaturePad({ onConfirm, onCancel, busy }: {
  onConfirm: (file: File) => Promise<void> | void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // El lienzo se dibuja a la resolución real de la pantalla para que la
  // firma no salga pixelada en el móvil.
  const prepare = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  }, []);

  useEffect(() => {
    prepare();
    window.addEventListener('resize', prepare);
    return () => window.removeEventListener('resize', prepare);
  }, [prepare]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(e);
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Un toque suelto también deja marca.
    ctx.lineTo(x + 0.1, y);
    ctx.stroke();
    setHasInk(true);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  const end = () => { drawing.current = false; };

  function clear() {
    prepare();
    setHasInk(false);
  }

  async function confirm() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const stamp = new Date().toISOString().slice(0, 10).split('-').reverse().join('-');
    await onConfirm(new File([blob], `firma-${stamp}.png`, { type: 'image/png' }));
  }

  return (
    <div className="sign-pad">
      <p className="hint" style={{ marginTop: 0 }}>
        Firma del cliente. Dibuja con el dedo dentro del recuadro.
      </p>
      <canvas
        ref={canvasRef}
        className="sign-canvas"
        aria-label="Zona de firma"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
      />
      <div className="sign-actions">
        <button type="button" className="btn" onClick={clear} disabled={!hasInk || busy}>
          <Eraser />Borrar
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={confirm} disabled={!hasInk || busy}>
          <PenLine />{busy ? 'Guardando…' : 'Guardar firma'}
        </button>
      </div>
    </div>
  );
}
