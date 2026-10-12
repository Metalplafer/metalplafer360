import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FileOutput, FileText, Plus } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { Badge, Tabs } from '@/components/ui/Layout';
import {
  ORDER_TYPE_LABEL, REPORT_STATUS_SHORT, REPORT_STATUS_TONE,
} from '@/config/constants';
import { fmtDate, fmtHours } from '@/lib/format';
import { listReports } from '@/services/partes';

type Tab = 'abiertos' | 'pendientes' | 'validados';

/**
 * «Mis partes»: lo que tengo por corregir, lo que espera a administración
 * y lo que ya está cerrado.
 */
export default function MyReports() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('abiertos');

  const partes = useAsync(
    async () => (profile
      ? listReports({ workerId: profile.id, pageSize: 100 })
      : { rows: [], total: 0 }),
    [profile?.id],
  );

  if (partes.loading && !partes.data) return <Loading />;
  if (partes.error) return <ErrorBox message={partes.error} onRetry={partes.reload} />;

  const all = partes.data?.rows ?? [];
  const abiertos = all.filter((r) => r.status === 'borrador' || r.status === 'rechazado');
  const pendientes = all.filter((r) => r.status === 'enviado');
  const validados = all.filter((r) => r.status === 'validado');

  const rows = tab === 'abiertos' ? abiertos : tab === 'pendientes' ? pendientes : validados;

  const EMPTY: Record<Tab, string> = {
    abiertos: 'No tienes ningún parte por corregir ni a medias.',
    pendientes: 'No tienes partes esperando a administración.',
    validados: 'Todavía no tienes ningún parte validado.',
  };

  return (
    <>
      <div className="w-greeting">
        <h1>Mis partes</h1>
      </div>

      <Link className="btn btn-lg btn-primary btn-block" to="/t/partes/nuevo"
            style={{ marginBottom: 8 }}>
        <Plus />Nuevo parte de trabajo
      </Link>

      {/* BLOQUE 5: la opción está a la vista y con su nombre. Es el mismo
          formulario; lo único que cambia es que entra sin proyecto. */}
      <Link className="btn btn-lg btn-block" to="/t/partes/nuevo?sin-proyecto=1"
            style={{ marginBottom: 14 }}>
        <FileOutput />Parte sin proyecto
      </Link>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'abiertos' as const, label: 'Por enviar', count: abiertos.length },
          { key: 'pendientes' as const, label: 'Enviados', count: pendientes.length },
          { key: 'validados' as const, label: 'Validados', count: validados.length },
        ]}
      />

      <div className="stack" style={{ marginTop: 14 }}>
        {rows.length ? rows.map((r) => (
          <Link key={r.id} className="ot-card" to={`/t/partes/${r.id}`}>
            <div className="ot-card-top">
              <span className="plate">{r.code}</span>
              <Badge tone={REPORT_STATUS_TONE[r.status]}>{REPORT_STATUS_SHORT[r.status]}</Badge>
            </div>

            <strong className="ot-card-title">
              {ORDER_TYPE_LABEL[r.work_type]}
              {r.project ? ` · ${r.project.name}` : ' · sin proyecto'}
            </strong>

            {r.work_done && <p className="ot-card-desc">{r.work_done}</p>}

            <div className="ot-card-meta">
              <span>{fmtDate(r.work_date)}</span>
              {r.hours != null && <span className="num">{fmtHours(r.hours)}</span>}
              {r.status === 'rechazado' && r.reject_reason && (
                <span>Motivo: {r.reject_reason}</span>
              )}
            </div>

            <ChevronRight className="ot-card-go" aria-hidden />
          </Link>
        )) : (
          <div className="w-block">
            <Empty title={EMPTY[tab]} icon={<FileText aria-hidden />}>
              {tab === 'abiertos'
                && 'Puedes rellenar un parte aunque no tengas ningún proyecto asignado: '
                 + 'usa «Parte sin proyecto» y administración lo colocará después.'}
            </Empty>
          </div>
        )}
      </div>
    </>
  );
}
