import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Modal } from './Modal';
import { toUserMessage } from '@/lib/errors';

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; text: string }

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface DialogsApi {
  toast: { success: (t: string) => void; error: (e: unknown) => void; info: (t: string) => void };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<DialogsApi | null>(null);

/** Avisos flotantes y confirmaciones para acciones importantes. */
export function DialogsProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, kind, text }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })),
    [],
  );

  const close = (value: boolean) => { confirmState?.resolve(value); setConfirmState(null); };

  const api: DialogsApi = {
    toast: {
      success: (t) => push('success', t),
      error: (e) => push('error', toUserMessage(e)),
      info: (t) => push('info', t),
    },
    confirm,
  };

  return (
    <Ctx.Provider value={api}>
      {children}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span>{t.text}</span>
            <button aria-label="Cerrar aviso" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {confirmState && (
        <Modal title={confirmState.title} size="narrow" onClose={() => close(false)}
          footer={<>
            <button className="btn" onClick={() => close(false)}>Cancelar</button>
            <button className={`btn ${confirmState.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
              {confirmState.confirmLabel ?? 'Confirmar'}
            </button>
          </>}>
          <div>{confirmState.message}</div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export function useDialogs(): DialogsApi {
  const value = useContext(Ctx);
  if (!value) throw new Error('useDialogs se ha usado fuera de DialogsProvider');
  return value;
}
