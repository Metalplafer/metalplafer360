import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Info, XCircle } from 'lucide-react';

export function Loading({ full, label = 'Cargando…' }: { full?: boolean; label?: string }) {
  return (
    <div className="loading-block" style={full ? { minHeight: '100dvh' } : undefined} role="status" aria-live="polite">
      <div className="spinner" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox aria-hidden />}
      <strong>{title}</strong>
      {children}
    </div>
  );
}

const ICONS = { info: Info, warn: AlertTriangle, danger: XCircle, ok: CheckCircle2 } as const;

export function Alert({ kind = 'info', children, action }: {
  kind?: keyof typeof ICONS; children: ReactNode; action?: ReactNode;
}) {
  const Icon = ICONS[kind];
  return (
    <div className={`alert alert-${kind}`} role={kind === 'danger' ? 'alert' : 'status'}>
      <Icon aria-hidden />
      <div style={{ flex: 1 }}>{children}</div>
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert kind="danger" action={onRetry && <button className="btn btn-sm" onClick={onRetry}>Reintentar</button>}>
      {message}
    </Alert>
  );
}
