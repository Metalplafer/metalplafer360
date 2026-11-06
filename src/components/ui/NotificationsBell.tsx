import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2 } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { Empty, Loading } from '@/components/ui/Feedback';
import { listNotifications, markRead } from '@/services/notifications';
import { checkLateMaterials } from '@/services/materials';
import { fmtDateTime } from '@/lib/format';
import { rutaDelAviso } from '@/lib/avisos';

/**
 * Avisos internos de la aplicación.
 * No se envía ningún correo: todo ocurre dentro de METALPLAFER360.
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
                {notices.data.map((n) => {
                  const ruta = rutaDelAviso(n);
                  /*
                    PACK 3 · EL AVISO LLEVA A SU ELEMENTO.

                    Solo se vuelve pulsable si de verdad hay a dónde ir.
                    Los avisos antiguos de órdenes de trabajo —módulo
                    retirado en la fase 4— siguen leyéndose sin enlace,
                    porque mandar a alguien a una pantalla que no existe
                    es peor que no ofrecerle nada.

                    Y PULSAR NO MARCA COMO LEÍDO, a propósito: el
                    encargo pide que las dos cosas sigan separadas, y
                    «Marcar leídos» sigue siendo el único que lo hace.
                  */
                  const contenido = (
                    <>
                      <strong>{n.title}</strong>
                      {n.body && <span>{n.body}</span>}
                      <small>{fmtDateTime(n.created_at)}</small>
                    </>
                  );
                  return (
                    <li key={n.id} className={n.read_at ? '' : 'unread'}>
                      {ruta ? (
                        <button type="button" className="notice-link"
                                onClick={() => { setOpen(false); navigate(ruta); }}>
                          {contenido}
                        </button>
                      ) : contenido}
                    </li>
                  );
                })}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}
