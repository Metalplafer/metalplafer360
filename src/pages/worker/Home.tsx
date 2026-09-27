import { Link } from 'react-router-dom';
import { Bell, CalendarDays, CheckCircle2, ClipboardList, Info, TriangleAlert } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { OrderCard } from '@/components/shared/OrderCard';
import { myOrders } from '@/services/orders';
import { listNotifications, markRead } from '@/services/notifications';
import { addDays, fmtDateTime, greeting, longDate, todayMadrid } from '@/lib/format';

/**
 * Inicio del trabajador: lo de hoy, lo que viene y lo que requiere atención.
 * Pensado para leerse de un vistazo con el móvil en la mano.
 */
export default function WorkerHome() {
  const { profile } = useAuth();
  const today = todayMadrid();

  // Se piden de una vez las órdenes abiertas hasta dentro de 21 días,
  // y las atrasadas de los 60 anteriores.
  const orders = useAsync(
    () => myOrders({ from: addDays(today, -60), to: addDays(today, 21) }),
    [today],
  );
  const notices = useAsync(() => listNotifications(10), []);

  if (orders.loading && !orders.data) return <Loading />;
  if (orders.error) return <ErrorBox message={orders.error} onRetry={orders.reload} />;

  const all = orders.data ?? [];
  const open = new Set(['pendiente', 'en_curso', 'devuelta']);

  const hoy = all.filter((o) => o.scheduled_date === today);
  const proximas = all.filter((o) => o.scheduled_date > today).slice(0, 5);
  const alertas = all.filter((o) =>
    (o.status === 'devuelta') || (o.scheduled_date < today && open.has(o.status)));

  const unread = (notices.data ?? []).filter((n) => !n.read_at);

  async function readAll() {
    try { await markRead(); await notices.reload(); } catch { /* sin conexión */ }
  }

  return (
    <>
      <div className="w-greeting">
        <span className="muted">{longDate(today)}</span>
        <h1>{greeting()}, {profile?.full_name.split(' ')[0]}</h1>
      </div>

      {alertas.length > 0 && (
        <section className="w-section">
          <h2><TriangleAlert size={17} aria-hidden />Requieren tu atención</h2>
          <div className="stack">
            {alertas.map((o) => (
              <div key={o.id} className="stack" style={{ gap: 4 }}>
                <OrderCard order={o} today={today} />
                <p className="w-note">
                  {o.status === 'devuelta'
                    ? <>Devuelta por administración. Motivo: {o.return_reason}</>
                    : <>Era del {o.scheduled_date.split('-').reverse().join('/')} y sigue sin enviar.</>}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="w-section">
        <h2><ClipboardList size={17} aria-hidden />Órdenes de hoy</h2>
        {hoy.length ? (
          <div className="stack">
            {hoy.map((o) => <OrderCard key={o.id} order={o} today={today} />)}
          </div>
        ) : (
          <div className="w-block">
            <p className="muted" style={{ margin: 0 }}>
              Hoy no tienes ninguna orden asignada. Cuando administración te asigne una,
              aparecerá aquí con el trabajo a realizar, el lugar y los compañeros.
            </p>
          </div>
        )}
      </section>

      <section className="w-section">
        <h2><CalendarDays size={17} aria-hidden />Próximas</h2>
        {proximas.length ? (
          <div className="stack">
            {proximas.map((o) => <OrderCard key={o.id} order={o} today={today} />)}
            <p className="w-note">
              Las órdenes de días futuros se pueden consultar, pero no se rellenan hasta su fecha.
            </p>
          </div>
        ) : (
          <div className="w-block">
            <p className="muted" style={{ margin: 0 }}>No tienes nada programado para los próximos días.</p>
          </div>
        )}
      </section>

      <section className="w-section">
        <h2><Bell size={17} aria-hidden />Avisos</h2>
        <div className="w-block">
          {notices.loading && !notices.data ? <Loading />
            : !notices.data?.length ? (
              <Empty title="Sin avisos" icon={<Bell aria-hidden />}>
                Aquí aparecen las órdenes que se te asignan, las devoluciones,
                las validaciones y los comentarios.
              </Empty>
            ) : (
              <>
                <ul className="notice-list">
                  {notices.data.map((n) => (
                    <li key={n.id} className={n.read_at ? '' : 'unread'}>
                      <strong>{n.title}</strong>
                      {n.body && <span>{n.body}</span>}
                      <small>{fmtDateTime(n.created_at)}</small>
                    </li>
                  ))}
                </ul>
                {unread.length > 0 && (
                  <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={readAll}>
                    <CheckCircle2 />Marcar como leídos
                  </button>
                )}
              </>
            )}
        </div>
      </section>

      <section className="w-section">
        <h2>Accesos rápidos</h2>
        <div className="w-big-actions">
          <Link className="btn" to="/t/ordenes"><ClipboardList aria-hidden />Mis órdenes</Link>
          <Link className="btn" to="/t/historial"><CheckCircle2 aria-hidden />Historial</Link>
        </div>
      </section>

      <div className="alert alert-info">
        <Info aria-hidden />
        <div>
          <strong>Puedes instalar la aplicación en el móvil.</strong>
          <div style={{ marginTop: 2 }}>
            En Android, menú del navegador → «Añadir a pantalla de inicio».
            En iPhone, botón Compartir → «Añadir a pantalla de inicio».
          </div>
        </div>
      </div>
    </>
  );
}
