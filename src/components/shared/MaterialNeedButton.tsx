import { useState } from 'react';
import { Boxes } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Layout';
import { useDialogs } from '@/components/ui/Dialogs';
import { submitMaterialNeed } from '@/services/materials';

/**
 * SOLICITAR MATERIAL.
 *
 * El botón que faltaba: hasta ahora solo se podía avisar de que falta
 * material desde una orden o desde un parte de trabajo, así que había
 * que esperar a tener uno. Esto se puede pulsar en cuanto se ve el hueco
 * en la estantería.
 *
 * Lo puede usar cualquiera, trabajador o administración, y va a la MISMA
 * lista de revisión que ya existía. El proyecto es opcional: hay
 * material que es de taller, y a veces no se sabe para qué es.
 */
export function MaterialNeedButton({ projectId, projectLabel, className, block }: {
  projectId?: string | null;
  /** Para que se vea a qué proyecto se va a asociar. */
  projectLabel?: string | null;
  className?: string;
  block?: boolean;
}) {
  const { toast } = useDialogs();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);

  async function enviar() {
    if (!texto.trim()) return;
    setBusy(true);
    try {
      await submitMaterialNeed(projectId ?? null, texto);
      toast.success('Pedido de material enviado a administración');
      setAbierto(false);
      setTexto('');
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  return (
    <>
      <button type="button"
              className={className ?? `btn${block ? ' btn-lg btn-block' : ''}`}
              onClick={() => setAbierto(true)}>
        <Boxes aria-hidden />Solicitar material
      </button>

      {abierto && (
        <Modal title="Solicitar material" onClose={() => setAbierto(false)}>
          <p className="hint" style={{ marginTop: 0 }}>
            {projectLabel
              ? <>Se enviará a administración para el proyecto <strong>{projectLabel}</strong>.</>
              : <>Se enviará a administración sin proyecto. Si es para un proyecto concreto,
                  pídelo desde ese proyecto y queda asociado.</>}
          </p>

          <Field label="¿Qué falta?" htmlFor="mn-texto"
                 hint="Escríbelo como lo dirías: «se han acabado los discos de corte de 125».">
            <textarea id="mn-texto" className="textarea" rows={4} value={texto} maxLength={1000}
                      onChange={(e) => setTexto(e.target.value)} />
          </Field>

          <p className="hint">
            Administración lo revisa y, si lo acepta, pasa al material pendiente. No se
            pide nada por tu cuenta.
          </p>

          <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn" onClick={() => setAbierto(false)} disabled={busy}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={enviar} disabled={busy || !texto.trim()}>
              {busy ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
