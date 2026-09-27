import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { Tabs } from '@/components/ui/Layout';
import { OrderCard } from '@/components/shared/OrderCard';
import { myOrders } from '@/services/orders';
import { addDays, todayMadrid } from '@/lib/format';

type Tab = 'hoy' | 'proximas' | 'abiertas';

/** «Mis órdenes»: lo de hoy, lo que viene y lo que queda por cerrar. */
export default function MyOrders() {
  const today = todayMadrid();
  const [tab, setTab] = useState<Tab>('hoy');

  const orders = useAsync(
    () => myOrders({ from: addDays(today, -90), to: addDays(today, 60) }),
    [today],
  );

  if (orders.loading && !orders.data) return <Loading />;
  if (orders.error) return <ErrorBox message={orders.error} onRetry={orders.reload} />;

  const all = orders.data ?? [];
  const open = new Set(['pendiente', 'en_curso', 'devuelta']);

  const hoy = all.filter((o) => o.scheduled_date === today);
  const proximas = all.filter((o) => o.scheduled_date > today);
  const abiertas = all.filter((o) => o.scheduled_date <= today && open.has(o.status));

  const rows = tab === 'hoy' ? hoy : tab === 'proximas' ? proximas : abiertas;

  const EMPTY: Record<Tab, string> = {
    hoy: 'Hoy no tienes ninguna orden asignada.',
    proximas: 'No tienes órdenes programadas para los próximos días.',
    abiertas: 'No te queda ninguna orden por enviar. Buen trabajo.',
  };

  return (
    <>
      <div className="w-greeting">
        <h1>Mis órdenes</h1>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'hoy' as const, label: 'Hoy', count: hoy.length },
          { key: 'proximas' as const, label: 'Próximas', count: proximas.length },
          { key: 'abiertas' as const, label: 'Por enviar', count: abiertas.length },
        ]}
      />

      <div className="stack" style={{ marginTop: 14 }}>
        {rows.length
          ? rows.map((o) => <OrderCard key={o.id} order={o} today={today} />)
          : (
            <div className="w-block">
              <Empty title={EMPTY[tab]} icon={<ClipboardList aria-hidden />}>
                {tab === 'proximas' &&
                  'Las órdenes futuras se pueden consultar, pero no se rellenan hasta su fecha.'}
              </Empty>
            </div>
          )}
      </div>
    </>
  );
}
