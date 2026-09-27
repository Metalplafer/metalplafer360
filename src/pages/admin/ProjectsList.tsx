import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { listProjects, projectCounts, type ProjectFilters } from '@/services/projects';
import { Badge, PageHeader, Pagination } from '@/components/ui/Layout';
import { PhaseMini } from '@/components/ui/PhaseRail';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import {
  BILLING_LABEL, BILLING_TONE, PHASES, PHASE_LABEL, PHASE_TONE, substatusLabel,
} from '@/config/constants';
import { fmtDate, fmtEur } from '@/lib/format';
import type { ProjectPhase } from '@/types/db';

const PAGE_SIZE = 25;

export default function ProjectsList() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<ProjectPhase | 'activos'>('activos');
  const [state, setState] = useState<NonNullable<ProjectFilters['state']>>('activos');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const debounced = useDebounce(search, 300);
  const counts = useAsync(projectCounts, []);
  const projects = useAsync(
    () => listProjects({ phase, state, search: debounced, page, pageSize: PAGE_SIZE }),
    [phase, state, debounced, page],
  );

  const total = Object.values(counts.data ?? {}).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Proyectos"
        sub="El trabajo real, desde la preparación hasta el cobro."
        actions={<Link className="btn btn-primary" to="/admin/proyectos/nuevo"><Plus />Nuevo proyecto</Link>}
      />

      <section className="panel">
        <div className="toolbar">
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 380 }}>
            <Search size={17} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--faint)' }} aria-hidden />
            <label htmlFor="project-search" className="sr-only">Buscar proyectos</label>
            <input id="project-search" className="input" style={{ paddingLeft: 36 }}
                   placeholder="Buscar por código, nombre o dirección"
                   value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>

          <div className="row" style={{ gap: 6 }}>
            <button className="chip" aria-pressed={phase === 'activos'}
                    onClick={() => { setPhase('activos'); setPage(0); }}>
              En curso {total > 0 && <span className="cond">{total - (counts.data?.finalizado ?? 0)}</span>}
            </button>
            {PHASES.map((p) => (
              <button key={p} className="chip" aria-pressed={phase === p}
                      onClick={() => { setPhase(p); setPage(0); }}>
                {PHASE_LABEL[p]} {counts.data && <span className="cond">{counts.data[p]}</span>}
              </button>
            ))}
          </div>

          <div className="row" style={{ gap: 6, marginLeft: 'auto' }}>
            <button className="chip" aria-pressed={state === 'archivados'}
                    onClick={() => { setState(state === 'archivados' ? 'activos' : 'archivados'); setPage(0); }}>
              Archivados
            </button>
          </div>
        </div>

        <div className="panel-body tight">
          {projects.loading && !projects.data ? <Loading />
            : projects.error ? <div style={{ padding: 16 }}><ErrorBox message={projects.error} onRetry={projects.reload} /></div>
            : !projects.data?.rows.length ? (
              <Empty title={debounced ? `Sin resultados para «${debounced}»` : 'No hay proyectos aquí'}>
                {!debounced && state !== 'archivados' &&
                  'Crea uno con «Nuevo proyecto», o convierte un presupuesto aceptado desde su ficha.'}
              </Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Proyecto</th>
                        <th>Cliente</th>
                        <th>Fase</th>
                        <th>Situación</th>
                        <th>Creado</th>
                        <th className="right">Presupuesto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.data.rows.map((p) => {
                        const subs = (p.substatuses ?? []).filter((s) => s.phase === p.phase);
                        return (
                          <tr key={p.id} className="clickable" onClick={() => navigate(`/admin/proyectos/${p.id}`)}>
                            <td><span className="plate">{p.code}</span></td>
                            <td>
                              <span className="cell-main">
                                <strong>{p.name}</strong>
                                {p.address && <small>{p.address}</small>}
                              </span>
                            </td>
                            <td>{p.client?.name ?? '—'}</td>
                            <td className="nowrap">
                              <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                                <PhaseMini phase={p.phase} />
                                <Badge tone={PHASE_TONE[p.phase]}>{PHASE_LABEL[p.phase]}</Badge>
                              </span>
                            </td>
                            <td>
                              {p.phase === 'facturacion' || p.phase === 'finalizado' ? (
                                <Badge tone={BILLING_TONE[p.billing_status]}>{BILLING_LABEL[p.billing_status]}</Badge>
                              ) : subs.length ? (
                                <span className="cell-main">
                                  {subs.map((s) => (
                                    <small key={s.substatus}>{substatusLabel(p.phase, s.substatus)}</small>
                                  ))}
                                </span>
                              ) : p.no_assembly ? <span className="faint">Sin montaje</span>
                                : <span className="faint">—</span>}
                            </td>
                            <td className="nowrap">{fmtDate(p.created_at)}</td>
                            <td className="right num">{fmtEur(p.budget_amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} pageSize={PAGE_SIZE} count={projects.data.count} onPage={setPage} />
              </>
            )}
        </div>
      </section>
    </>
  );
}
