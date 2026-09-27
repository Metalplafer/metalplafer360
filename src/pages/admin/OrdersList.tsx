import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { listOrders } from '@/services/orders';
import { Badge, PageHeader, Pagination, Tabs } from '@/components/ui/Layout';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, ORDER_TYPE_LABEL, ORDER_TYPES } from '@/config/constants';
import { fmtDate, fmtHours, relativeDay, todayMadrid } from '@/lib/format';
import type { OrderStatus, OrderType } from '@/types/db';

const PAGE_SIZE = 25;

type TabKey = 'abiertas' | 'revision' | 'validada' | 'todas';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'abiertas', label: 'Abiertas' },
  { key: 'revision', label: 'Pendientes de revisión' },
  { key: 'validada', label: 'Validadas' },
  { key: 'todas', label: 'Todas' },
];

/** Listado de órdenes de trabajo. Solo administración las crea. */
export default function OrdersList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('abiertas');
  const [type, setType] = useState<OrderType | ''>('');
  const [state, setState] = useState<'activas' | 'archivadas'>('activas');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const debounced = useDebounce(search, 300);
  const today = todayMadrid();

  const orders = useAsync(() => listOrders({
    status: tab === 'todas' ? undefined : tab === 'validada' ? ('validada' as OrderStatus) : tab,
    type: type || undefined,
    state,
    search: debounced,
    page,
    pageSize: PAGE_SIZE,
  }), [tab, type, state, debounced, page]);

  const pending = useAsync(() => listOrders({ status: 'revision', pageSize: 1 }), []);

  return (
    <>
      <PageHeader
        title="Órdenes de trabajo"
        sub="El trabajo que se manda al taller o a la obra. Las crea siempre administración."
        actions={<Link className="btn btn-primary" to="/admin/ordenes/nueva"><Plus />Nueva orden</Link>}
      />

      <section className="panel">
        <Tabs
          value={tab}
          onChange={(k) => { setTab(k); setPage(0); }}
          tabs={TABS.map((t) => (
            t.key === 'revision' ? { ...t, count: pending.data?.count } : t
          ))}
        />

        <div className="toolbar">
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 380 }}>
            <Search size={17} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--faint)' }} aria-hidden />
            <label htmlFor="ot-search" className="sr-only">Buscar órdenes</label>
            <input id="ot-search" className="input" style={{ paddingLeft: 36 }}
                   placeholder="Buscar por código o trabajo a realizar"
                   value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>

          <div className="field" style={{ minWidth: 170 }}>
            <label htmlFor="ot-type" className="sr-only">Tipo</label>
            <select id="ot-type" className="select" value={type}
                    onChange={(e) => { setType(e.target.value as OrderType | ''); setPage(0); }}>
              <option value="">Fabricación y montaje</option>
              {ORDER_TYPES.map((t) => <option key={t} value={t}>{ORDER_TYPE_LABEL[t]}</option>)}
            </select>
          </div>

          <div className="row" style={{ gap: 6 }}>
            {([['activas', 'Activas'], ['archivadas', 'Archivadas']] as const).map(([k, l]) => (
              <button key={k} className="chip" aria-pressed={state === k}
                      onClick={() => { setState(k); setPage(0); }}>{l}</button>
            ))}
          </div>
        </div>

        <div className="panel-body tight">
          {orders.loading && !orders.data ? <Loading />
            : orders.error ? <div style={{ padding: 16 }}><ErrorBox message={orders.error} onRetry={orders.reload} /></div>
            : !orders.data?.rows.length ? (
              <Empty title={debounced ? `Sin resultados para «${debounced}»` : 'No hay órdenes en esta lista'}>
                {!debounced && state === 'activas' &&
                  'Crea la primera con el botón «Nueva orden». Se numeran OT-2026-001.'}
              </Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Proyecto</th>
                        <th>Trabajo a realizar</th>
                        <th className="right">Previstas</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.data.rows.map((o) => (
                        <tr key={o.id} className="clickable" onClick={() => navigate(`/admin/ordenes/${o.id}`)}>
                          <td><span className="plate">{o.code}</span></td>
                          <td className="nowrap">
                            <span className="cell-main">
                              <strong>{fmtDate(o.scheduled_date)}</strong>
                              <small>{relativeDay(o.scheduled_date, today)}</small>
                            </span>
                          </td>
                          <td>{ORDER_TYPE_LABEL[o.type]}</td>
                          <td>
                            {o.project ? (
                              <span className="cell-main">
                                <strong>{o.project.code}</strong>
                                <small>{o.project.client?.name ?? o.project.name}</small>
                              </span>
                            ) : '—'}
                          </td>
                          <td>{o.description.length > 70 ? `${o.description.slice(0, 70)}…` : o.description}</td>
                          <td className="right num">{fmtHours(o.planned_hours)}</td>
                          <td><Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} pageSize={PAGE_SIZE} count={orders.data.count} onPage={setPage} />
              </>
            )}
        </div>
      </section>
    </>
  );
}
