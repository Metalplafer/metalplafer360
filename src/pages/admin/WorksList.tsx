import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building, Plus } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { Badge, PageHeader, Pagination, Panel, Tabs } from '@/components/ui/Layout';
import { fmtDate } from '@/lib/format';
import { listWorks } from '@/services/works';

/**
 * LAS OBRAS.
 *
 * Una obra agrupa varios proyectos de un mismo sitio: «Comunidad Calle
 * Mayor 25» con su puerta, su barandilla y su cerramiento.
 */
export default function WorksList() {
  const [state, setState] = useState<'activas' | 'archivadas'>('activas');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const buscado = useDebounce(search, 300);

  const obras = useAsync(
    () => listWorks({ state, search: buscado, page, pageSize: 25 }),
    [state, buscado, page],
  );

  const rows = obras.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="Obras"
        sub="Agrupan varios proyectos del mismo sitio. Los proyectos siguen funcionando igual."
        actions={<Link className="btn btn-primary" to="/admin/obras/nueva"><Plus />Nueva obra</Link>}
      />

      <section className="panel">
        <Tabs
          value={state}
          onChange={(v) => { setState(v); setPage(1); }}
          tabs={[
            { key: 'activas' as const, label: 'Activas' },
            { key: 'archivadas' as const, label: 'Archivadas' },
          ]}
        />
      </section>

      <Panel>
        <div className="row" style={{ marginBottom: 12 }}>
          <input className="input" placeholder="Buscar por nombre, número o dirección"
                 value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>

        {obras.loading && !obras.data ? <Loading />
          : obras.error ? <ErrorBox message={obras.error} onRetry={obras.reload} />
            : !rows.length ? (
              <Empty title="Todavía no hay ninguna obra" icon={<Building aria-hidden />}>
                Una obra agrupa los proyectos de un mismo sitio. Se numeran solas:
                OBRA-{new Date().getFullYear()}-001.
              </Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Obra</th><th>Cliente</th><th>Dirección</th>
                        <th className="right">Creada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((o) => (
                        <tr key={o.id}>
                          <td>
                            <Link to={`/admin/obras/${o.id}`} className="cell-main">
                              <span className="plate">{o.code}</span>
                              <strong style={{ marginLeft: 8 }}>{o.name}</strong>
                            </Link>
                          </td>
                          <td>{o.client?.name ?? '—'}</td>
                          <td>{o.address ?? '—'}</td>
                          <td className="right nowrap">
                            {o.archived_at
                              ? <Badge tone="steel">Archivada</Badge>
                              : fmtDate(o.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} count={obras.data?.total ?? 0} pageSize={25}
                            onPage={setPage} />
              </>
            )}
      </Panel>
    </>
  );
}
