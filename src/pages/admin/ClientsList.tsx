import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Plus, Search, User } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { listClients, type ClientFilters } from '@/services/clients';
import { PageHeader, Pagination } from '@/components/ui/Layout';
import { Badge } from '@/components/ui/Layout';
import { fmtEur, fmtPhone } from '@/lib/format';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { ClientForm } from './ClientForm';
import type { ClientOverview } from '@/types/db';

const PAGE_SIZE = 25;

const STATES: { key: NonNullable<ClientFilters['state']>; label: string }[] = [
  { key: 'activos', label: 'Activos' },
  { key: 'desactivados', label: 'Desactivados' },
  { key: 'archivados', label: 'Archivados' },
  { key: 'todos', label: 'Todos' },
];

/** Un importe, o una raya si es cero: así la tabla no se llena de ceros. */
function importe(valor: number) {
  return Number(valor) ? fmtEur(valor) : <span className="faint">—</span>;
}

/** «3 presupuestos · 1 visita · 2 avisos», o nada si no hay fichas. */
function actividadDe(c: ClientOverview) {
  const partes = [
    c.budgets ? `${c.budgets} presupuesto${c.budgets === 1 ? '' : 's'}` : null,
    c.visits ? `${c.visits} visita${c.visits === 1 ? '' : 's'}` : null,
    c.notices ? `${c.notices} aviso${c.notices === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : null;
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
                        <th>Actividad</th>
                        {/* FASE 3.2 · El resumen económico por cliente. */}
                        <th className="num">Presupuestado</th>
                        <th className="num">Cobrado</th>
                        <th className="num">Por facturar</th>
                        <th className="num">Por cobrar</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.data.rows.map((c) => {
                        const actividad = actividadDe(c);
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
                            <td className="nowrap">
                              {actividad ?? <span className="faint">Sin fichas</span>}
                            </td>
                            {/* Los cuatro importes. El cero se apaga para
                                que la vista no se llene de «0,00 €». */}
                            <td className="num nowrap">{importe(c.presupuestado)}</td>
                            <td className="num nowrap">{importe(c.cobrado)}</td>
                            <td className="num nowrap">{importe(c.pendiente_facturar)}</td>
                            <td className="num nowrap">{importe(c.pendiente_cobrar)}</td>
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

      {/* Qué significa cada columna. Importa dejarlo escrito: una cifra
          económica mal entendida se convierte en una llamada al cliente
          reclamando algo que no se le ha facturado todavía. */}
      <details className="hint" style={{ marginTop: 12 }}>
        <summary>Cómo se calculan los cuatro importes</summary>
        <dl className="kv tight" style={{ marginTop: 8 }}>
          <dt>Presupuestado</dt>
          <dd>
            El presupuesto de sus proyectos más los costes extra de sus obras. No se suman
            los presupuestos que todavía no se han convertido en proyecto, para no contar
            lo mismo dos veces.
          </dd>
          <dt>Cobrado</dt>
          <dd>Los cobros registrados que no están anulados.</dd>
          <dt>Por facturar</dt>
          <dd>Presupuestado menos facturado. Facturado es lo que se ha marcado como
            facturado a mano, proyecto a proyecto y coste a coste.</dd>
          <dt>Por cobrar</dt>
          <dd>Facturado menos cobrado: lo que ya se ha facturado y aún no ha entrado.
            Lo que no está facturado todavía no se le debe a nadie y no sale aquí.</dd>
        </dl>
        <p style={{ margin: 0 }}>
          Los proyectos y las obras <strong>archivados no cuentan</strong> en ninguno de
          los cuatro.
        </p>
      </details>

      <p className="hint faint" style={{ marginTop: 12 }}>
        ¿Buscas un presupuesto concreto? Está en <Link to="/admin/fichas">Presupuestos</Link>. Los avisos, en <Link to="/admin/avisos">Avisos</Link>.
      </p>
    </>
  );
}
