import { History as HistoryIcon } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { OrderCard } from '@/components/shared/OrderCard';
import { myOrders } from '@/services/orders';
import { supabase, unwrap } from '@/lib/supabase';
import { addDays, fmtHours, mondayOf, todayMadrid } from '@/lib/format';
import type { OrderPart } from '@/types/db';

type MyPartRow = Pick<OrderPart, 'order_id' | 'hours' | 'submitted_at'> & {
  order?: { scheduled_date: string; status: string; archived_at: string | null } | null;
};

/**
 * Historial del trabajador: lo que ha hecho, con sus horas.
 * La base de datos solo le devuelve sus propias órdenes y sus propios partes.
 */
export default function WorkerHistory() {
  const { profile } = useAuth();
  const today = todayMadrid();
  const monthStart = `${today.slice(0, 7)}-01`;
  const weekStart = mondayOf(today);

  const orders = useAsync(() => myOrders({ from: addDays(today, -365), to: today }), [today]);

  // Mis partes con sus horas, unidos a la fecha de cada orden.
  const parts = useAsync(async () => {
    if (!profile) return [] as MyPartRow[];
    return unwrap(
      await supabase.from('work_order_workers')
        .select('order_id, hours, submitted_at, order:work_orders(scheduled_date, status, archived_at)')
        .eq('worker_id', profile.id),
    ) as unknown as MyPartRow[];
  }, [profile?.id]);

  if (orders.loading && !orders.data) return <Loading />;
  if (orders.error) return <ErrorBox message={orders.error} onRetry={orders.reload} />;

  const done = (orders.data ?? [])
    .filter((o) => o.status === 'validada' || o.status === 'realizada')
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date));

  const rows = (parts.data ?? []).filter((p) => p.order && !p.order.archived_at);
  const sum = (from: string) => rows
    .filter((p) => (p.order?.scheduled_date ?? '') >= from)
    .reduce((total, p) => total + Number(p.hours ?? 0), 0);

  return (
    <>
      <div className="w-greeting">
        <h1>Historial</h1>
      </div>

      <section className="w-section">
        <h2>Tus horas</h2>
        <div className="w-block">
          <div className="figure-row">
            <span className="figure"><b>{fmtHours(sum(weekStart))}</b><span>Esta semana</span></span>
            <span className="figure"><b>{fmtHours(sum(monthStart))}</b><span>Este mes</span></span>
            <span className="figure"><b>{fmtHours(sum('0000-01-01'))}</b><span>Último año</span></span>
          </div>
          <p className="hint" style={{ margin: '10px 0 0' }}>
            Solo se cuentan las horas que has apuntado tú.
          </p>
        </div>
      </section>

      <section className="w-section">
        <h2>Órdenes enviadas y validadas</h2>
        {done.length ? (
          <div className="stack">
            {done.map((o) => <OrderCard key={o.id} order={o} today={today} />)}
          </div>
        ) : (
          <div className="w-block">
            <Empty title="Todavía no has cerrado ninguna orden" icon={<HistoryIcon aria-hidden />}>
              Cuando envíes una orden a revisión aparecerá aquí.
            </Empty>
          </div>
        )}
      </section>
    </>
  );
}
