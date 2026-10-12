import { Link } from 'react-router-dom';
import {
  Bell, CalendarDays, CheckCircle2, ClipboardList, FileOutput, FolderKanban, Info, Plus,
  TriangleAlert,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { OrderCard } from '@/components/shared/OrderCard';
import { myOrders } from '@/services/orders';
import { listNotifications, markRead } from '@/services/notifications';
import { listReports, myProjects } from '@/services/partes';
import { MaterialNeedButton } from '@/components/shared/MaterialNeedButton';
import { PlanLine } from '@/components/shared/PlanLine';
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
  const proyectos = useAsync(() => myProjects(), []);
  const partes = useAsync(
    async () => (profile
      ? listReports({ workerId: profile.id, pageSize: 50 })
      : { rows: [], total: 0 }),
    [profile?.id],
  );

  if (orders.loading && !orders.data) return <Loading />;
  if (orders.error) return <ErrorBox message={orders.error} onRetry={orders.reload} />;

  const all = orders.data ?? [];
  const open = new Set(['pendiente', 'en_curso', 'devuelta']);

  const hoy = all.filter((o) => o.scheduled_date === today);
  const proximas = all.filter((o) => o.scheduled_date > today).slice(0, 5);
  const alertas = all.filter((o) =>
    (o.status === 'devuelta') || (o.scheduled_date < today && open.has(o.status)));

  const unread = (notices.data ?? []).filter((n) => !n.read_at);
  const misProyectos = proyectos.data ?? [];
  const porCorregir = (partes.data?.rows ?? [])
    .filter((r) => r.status === 'rechazado' || r.status === 'borrador');

  async function readAll() {
    try { await markRead(); await notices.reload(); } catch { /* sin conexión */ }
  }

  return (
    <>
      <div className="w-greeting">
        <span className="muted">{longDate(today)}</span>
        <h1>{greeting()}, {profile?.full_name.split(' ')[0]}</h1>
      </div>

      {porCorregir.length > 0 && (
        <section className="w-section">
          <h2><TriangleAlert size={17} aria-hidden />Partes por terminar</h2>
          <div className="stack">
            {porCorregir.map((r) => (
              <Link key={r.id} className="ot-card" to={`/t/partes/${r.id}`}>
                <div className="ot-card-top">
                  <span className="plate">{r.code}</span>
                </div>
                <strong className="ot-card-title">
                  {r.project ? r.project.name : 'Sin proyecto'}
                </strong>
                <p className="ot-card-desc">
                  {r.status === 'rechazado'
                    ? `Devuelto por administración. Motivo: ${r.reject_reason ?? ''}`
                    : 'Lo tienes guardado sin enviar.'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="w-section">
        <h2><FolderKanban size={17} aria-hidden />Mis proyectos</h2>
        <div className="w-block">
          {misProyectos.length ? (
            <ul className="mini-list">
              {misProyectos.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Link to={`/t/proyectos/${p.id}`}>
                    <span className="mono">{p.code}</span>
                    <span>{p.name}</span>
                    <PlanLine plan={p} compact />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Todavía no tienes proyectos asignados. Puedes rellenar un parte igualmente
              con «Parte sin proyecto»: administración lo asignará después.
            </p>
          )}
        </div>
      </section>

      <div className="stack" style={{ marginBottom: 16, gap: 8 }}>
        <Link className="btn btn-lg btn-primary btn-block" to="/t/partes/nuevo">
          <Plus />Parte de trabajo
        </Link>
        {/* BLOQUE 5: las dos cosas que antes había que pedir a
            administración, ahora a un toque. */}
        <Link className="btn btn-lg btn-block" to="/t/partes/nuevo?sin-proyecto=1">
          <FileOutput />Parte sin proyecto
        </Link>
        <MaterialNeedButton block />
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
          <Link className="btn" to="/t/proyectos"><FolderKanban aria-hidden />Mis proyectos</Link>
          <Link className="btn" to="/t/partes"><ClipboardList aria-hidden />Mis partes</Link>
          <Link className="btn" to="/t/calendario"><CalendarDays aria-hidden />Calendario</Link>
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
