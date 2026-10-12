import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { Badge, PageHeader, Pagination, Panel, Tabs } from '@/components/ui/Layout';
import {
  ORDER_TYPE_LABEL, REPORT_STATUS_SHORT, REPORT_STATUS_TONE,
} from '@/config/constants';
import { fmtDate, fmtHours } from '@/lib/format';
import { listReports } from '@/services/partes';

type Tab = 'pendientes' | 'sin_proyecto' | 'validados' | 'rechazados' | 'todos';

/**
 * PARTES DE TRABAJO · administración.
 *
 * La pestaña que importa es la primera: lo que está esperando a que
 * alguien lo valide. Hasta que no se valida, esas horas NO cuentan como
 * realizadas en el proyecto.
 */
export default function ReportsList() {
  const [tab, setTab] = useState<Tab>('pendientes');
  const [page, setPage] = useState(1);

  const partes = useAsync(() => listReports({
    status: tab === 'pendientes' ? 'enviado'
      : tab === 'validados' ? 'validado'
        : tab === 'rechazados' ? 'rechazado' : undefined,
    withoutProject: tab === 'sin_proyecto' || undefined,
    page,
    pageSize: 25,
  }), [tab, page]);

  // El contador de pendientes se pide aparte para que se vea siempre,
  // esté uno en la pestaña que esté.
  const pendientes = useAsync(() => listReports({ status: 'enviado', pageSize: 1 }), [tab]);

  function cambiarTab(t: Tab) { setTab(t); setPage(1); }

  const rows = partes.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="Partes de trabajo"
        sub="Las horas de cada persona. Solo cuentan en el proyecto cuando se validan."
      />

      <Tabs
        value={tab}
        onChange={cambiarTab}
        tabs={[
          { key: 'pendientes' as const, label: 'Por validar', count: pendientes.data?.total ?? 0 },
          { key: 'sin_proyecto' as const, label: 'Sin proyecto' },
          { key: 'validados' as const, label: 'Validados' },
          { key: 'rechazados' as const, label: 'Rechazados' },
          { key: 'todos' as const, label: 'Todos' },
        ]}
      />

      <Panel>
        {partes.loading && !partes.data ? <Loading />
          : partes.error ? <ErrorBox message={partes.error} onRetry={partes.reload} />
            : !rows.length ? (
              <Empty title="No hay partes que mostrar aquí." icon={<FileText aria-hidden />}>
                {tab === 'pendientes' && 'Todo revisado. No queda ningún parte esperando.'}
                {tab === 'sin_proyecto'
                  && 'Los partes que un trabajador crea sin proyecto aparecen aquí para que les asignes uno.'}
              </Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Parte</th>
                        <th>Trabajador</th>
                        <th>Trabajo</th>
                        <th>Proyecto</th>
                        <th className="num">Horas</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <Link to={`/admin/partes/${r.id}`} className="plate">{r.code}</Link>
                          </td>
                          <td>{r.worker?.full_name ?? '—'}</td>
                          <td>
                            {ORDER_TYPE_LABEL[r.work_type]}
                            <small className="muted" style={{ display: 'block' }}>
                              {fmtDate(r.work_date)}
                            </small>
                          </td>
                          <td>
                            {r.project
                              ? <Link to={`/admin/proyectos/${r.project.id}`}>{r.project.code}</Link>
                              : <span className="muted">Sin asignar</span>}
                          </td>
                          <td className="num">{r.hours != null ? fmtHours(r.hours) : '—'}</td>
                          <td>
                            <Badge tone={REPORT_STATUS_TONE[r.status]}>
                              {REPORT_STATUS_SHORT[r.status]}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination page={page} count={partes.data?.total ?? 0} pageSize={25}
                            onPage={setPage} />
              </>
            )}
      </Panel>
    </>
  );
}
