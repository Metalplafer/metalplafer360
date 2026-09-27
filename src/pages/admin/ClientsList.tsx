import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Plus, Search, User } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { listClients, type ClientFilters } from '@/services/clients';
import { PageHeader, Pagination } from '@/components/ui/Layout';
import { Badge } from '@/components/ui/Layout';
import { fmtPhone } from '@/lib/format';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { ClientForm } from './ClientForm';
import type { ClientActivity } from '@/types/db';

const PAGE_SIZE = 25;

const STATES: { key: NonNullable<ClientFilters['state']>; label: string }[] = [
  { key: 'activos', label: 'Activos' },
  { key: 'desactivados', label: 'Desactivados' },
  { key: 'archivados', label: 'Archivados' },
  { key: 'todos', label: 'Todos' },
];

function activityOf(value: ClientActivity[] | ClientActivity | null | undefined): ClientActivity | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default function ClientsList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [state, setState] = useState<NonNullable<ClientFilters['state']>>('activos');
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);

  const debounced = useDebounce(search, 300);
  const clients = useAsync(
    () => listClients({ search: debounced, state, page, pageSize: PAGE_SIZE }),
    [debounced, state, page],
  );

  return (
    <>
      <PageHeader
        title="Clientes"
        sub="Empresas y particulares. Los clientes no se borran: se desactivan o se archivan."
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus />Nuevo cliente</button>}
      />

      <section className="panel">
        <div className="toolbar">
          <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 420 }}>
            <Search size={17} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--faint)' }} aria-hidden />
            <label htmlFor="client-search" className="sr-only">Buscar clientes</label>
            <input id="client-search" className="input" style={{ paddingLeft: 36 }}
                   placeholder="Buscar por nombre, CIF/NIF, teléfono o población"
                   value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <div className="row" style={{ gap: 6 }}>
            {STATES.map((s) => (
              <button key={s.key} className="chip" aria-pressed={state === s.key}
                      onClick={() => { setState(s.key); setPage(0); }}>{s.label}</button>
            ))}
          </div>
        </div>

        <div className="panel-body tight">
          {clients.loading && !clients.data ? <Loading />
            : clients.error ? <div style={{ padding: 16 }}><ErrorBox message={clients.error} onRetry={clients.reload} /></div>
            : !clients.data?.rows.length ? (
              <Empty title={debounced ? `Sin resultados para «${debounced}»` : 'Todavía no hay clientes'}>
                {!debounced && 'Crea el primero con el botón «Nuevo cliente».'}
              </Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>CIF/NIF</th>
                        <th>Teléfono</th>
                        <th>Población</th>
                        <th>Actividad</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.data.rows.map((c) => {
                        const activity = activityOf(c.activity);
                        return (
                          <tr key={c.id} className="clickable" onClick={() => navigate(`/admin/clientes/${c.id}`)}>
                            <td>
                              <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                                {c.kind === 'empresa'
                                  ? <Building2 size={16} color="var(--steel-600)" aria-label="Empresa" />
                                  : <User size={16} color="var(--steel-600)" aria-label="Particular" />}
                                <span className="cell-main">
                                  <strong>{c.name}</strong>
                                  {c.email && <small>{c.email}</small>}
                                </span>
                              </span>
                            </td>
                            <td className="num">{c.tax_id ?? '—'}</td>
                            <td className="num nowrap">{fmtPhone(c.phone)}</td>
                            <td>{c.city ?? '—'}</td>
                            <td className="nowrap">
                              {activity && (activity.budgets + activity.visits + activity.notices) > 0
                                ? [
                                    activity.budgets
                                      ? `${activity.budgets} presupuesto${activity.budgets === 1 ? '' : 's'}` : null,
                                    activity.visits
                                      ? `${activity.visits} visita${activity.visits === 1 ? '' : 's'}` : null,
                                    activity.notices
                                      ? `${activity.notices} aviso${activity.notices === 1 ? '' : 's'}` : null,
                                  ].filter(Boolean).join(' · ')
                                : <span className="faint">Sin fichas</span>}
                            </td>
                            <td>
                              {c.archived_at ? <Badge tone="steel">Archivado</Badge>
                                : !c.active ? <Badge tone="amber">Desactivado</Badge>
                                : <Badge tone="green">Activo</Badge>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} pageSize={PAGE_SIZE} count={clients.data.count} onPage={setPage} />
              </>
            )}
        </div>
      </section>

      {creating && (
        <ClientForm
          onClose={() => setCreating(false)}
          onSaved={(c) => { setCreating(false); navigate(`/admin/clientes/${c.id}`); }}
        />
      )}

      <p className="hint faint" style={{ marginTop: 12 }}>
        ¿Buscas un presupuesto o un aviso concreto? Están en <Link to="/admin/fichas">Fichas</Link>.
      </p>
    </>
  );
}
