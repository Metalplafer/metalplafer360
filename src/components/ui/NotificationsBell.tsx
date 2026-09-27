import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle2 } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { Empty, Loading } from '@/components/ui/Feedback';
import { listNotifications, markRead } from '@/services/notifications';
import { checkLateMaterials } from '@/services/materials';
import { fmtDateTime } from '@/lib/format';

/**
 * Avisos internos de la aplicación.
 * No se envía ningún correo: todo ocurre dentro de METALPLAFER360.
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // Al abrir la aplicación se comprueba si algún material se ha retrasado.
  // La base de datos solo avisa una vez al día de cada uno.
  const notices = useAsync(
    () => checkLateMaterials().catch(() => 0).then(() => listNotifications(15)),
    [reloadKey],
  );
  const unread = (notices.data ?? []).filter((n) => !n.read_at);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function readAll() {
    try { await markRead(); setReloadKey((n) => n + 1); } catch { /* sin conexión */ }
  }

  return (
    <div className="bell-wrap" ref={box}>
      <button className="btn btn-ghost icon-btn" aria-label={`Avisos${unread.length ? ` (${unread.length} sin leer)` : ''}`}
              aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Bell />
        {unread.length > 0 && <span className="bell-dot">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Avisos">
          <div className="bell-head">
            <strong>Avisos</strong>
            {unread.length > 0 && (
              <button className="btn btn-sm btn-ghost" onClick={readAll}>
                <CheckCircle2 />Marcar leídos
              </button>
            )}
          </div>

          {notices.loading && !notices.data ? <Loading />
            : !notices.data?.length ? (
              <Empty title="Sin avisos" icon={<Bell aria-hidden />}>
                Aquí llegan las órdenes enviadas a revisión y los comentarios de los trabajadores.
              </Empty>
            ) : (
              <ul className="notice-list">
                {notices.data.map((n) => (
                  <li key={n.id} className={n.read_at ? '' : 'unread'}>
                    {n.order_id ? (
                      <Link to={`/admin/ordenes/${n.order_id}`} onClick={() => setOpen(false)}>
                        <strong>{n.title}</strong>
                      </Link>
                    ) : <strong>{n.title}</strong>}
                    {n.body && <span>{n.body}</span>}
                    <small>{fmtDateTime(n.created_at)}</small>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}
