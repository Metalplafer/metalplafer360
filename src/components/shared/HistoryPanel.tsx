import { useAsync } from '@/hooks/useAsync';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { listHistory } from '@/services/history';
import { fmtDateTime } from '@/lib/format';

/**
 * Historial de una ficha, un proyecto o un cliente. No se puede modificar.
 *
 * «reloadKey» sirve para volver a pedir el historial cuando algo cambia
 * (por ejemplo, tras un cambio de fase): basta con pasar la fecha de
 * última modificación de la entidad.
 */
export function HistoryPanel({ entityId, entityCode, title = 'Historial', reloadKey }: {
  entityId?: string; entityCode?: string; title?: string; reloadKey?: string | null;
}) {
  const history = useAsync(
    () => listHistory({ entityId, entityCode }),
    [entityId, entityCode, reloadKey],
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="hint faint">No se puede modificar</span>
      </div>
      <div className="panel-body tight">
        {history.loading && !history.data ? <Loading />
          : history.error ? <div style={{ padding: 16 }}><ErrorBox message={history.error} onRetry={history.reload} /></div>
          : !history.data?.length ? <Empty title="Sin actividad registrada" />
          : (
            <ul className="feed">
              {history.data.map((row) => (
                <li key={row.id}>
                  {row.summary}
                  <time dateTime={row.occurred_at}>{fmtDateTime(row.occurred_at)}</time>
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  );
}
