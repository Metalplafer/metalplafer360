import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, ClipboardList, FileText, MapPin, Phone, Plus, Users,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { ErrorBox, Loading } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Layout';
import { CommentsPanel } from '@/components/shared/CommentsPanel';
import { DocumentsPanel } from '@/components/shared/DocumentsPanel';
import {
  ORDER_TYPE_LABEL, REPORT_STATUS_SHORT, REPORT_STATUS_TONE, fichaStatus,
} from '@/config/constants';
import { fmtDate, fmtHours, fmtPhone, fmtTimeShort } from '@/lib/format';
import { telLink, whatsappLink } from '@/lib/whatsapp';
import { fichaTeam } from '@/services/fichas';
import { listReports, myAviso } from '@/services/partes';

/**
 * UN AVISO DE CLIENTE EN EL MÓVIL DEL TRABAJADOR.
 *
 * Un aviso es una incidencia o una reparación en casa del cliente: un
 * cierre que no ajusta, una persiana atascada. Administración lo asigna a
 * una o a varias personas, y cada una apunta SUS horas en SU parte.
 *
 * Todo lo que se ve aquí sale de «worker_avisos», que NO trae el importe.
 * No es que la pantalla lo esconda: no llega hasta aquí. El dinero del
 * aviso es de administración.
 *
 * Esto no es la campana (las notificaciones internas) ni un aviso de
 * material: son tres cosas distintas y esta es la del cliente.
 */
export default function WorkerAvisoDetail() {
  const { id = '' } = useParams();
  const { profile } = useAuth();

  const aviso = useAsync(() => myAviso(id), [id]);
  const equipo = useAsync(() => fichaTeam(id), [id]);
  const mios = useAsync(
    async () => (profile
      ? listReports({ fichaId: id, workerId: profile.id, pageSize: 50 })
      : { rows: [], total: 0 }),
    [id, profile?.id],
  );

  if (aviso.loading && !aviso.data) return <Loading />;
  if (aviso.error) return <ErrorBox message={aviso.error} onRetry={aviso.reload} />;
  if (!aviso.data) return <ErrorBox message="Este aviso no está asignado a ti." />;

  const a = aviso.data;
  const estado = fichaStatus('aviso', a.status);
  const partes = mios.data?.rows ?? [];
  const misHoras = partes
    .filter((r) => r.status === 'validado')
    .reduce((n, r) => n + (r.hours ?? 0), 0);

  const tel = telLink(a.phone);
  const wa = whatsappLink(a.phone);
  // El responsable sale aparte: es quien se lo queda, no uno más del equipo.
  const compañeros = (equipo.data ?? []).filter((m) => !m.es_responsable);
  const responsable = (equipo.data ?? []).find((m) => m.es_responsable);

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to="/t/proyectos" style={{ marginBottom: 10 }}>
        <ArrowLeft />Mis trabajos
      </Link>

      <div className="w-greeting">
        <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <span className="plate">{a.code}</span>
            <h1 style={{ marginTop: 6 }}>{a.title ?? 'Aviso'}</h1>
            {a.client_name && <p className="muted">{a.client_name}</p>}
          </div>
          <Badge tone={estado.tone}>{estado.label}</Badge>
        </div>
      </div>

      {/* El parte entra ya atado a este aviso: así las horas van a donde
          toca sin que nadie tenga que elegirlo en una lista. */}
      <Link className="btn btn-lg btn-primary btn-block" to={`/t/partes/nuevo?aviso=${a.id}`}
            style={{ marginBottom: 10 }}>
        <Plus />Parte de trabajo
      </Link>

      {(tel || wa) && (
        <div className="row" style={{ gap: 8, marginBottom: 14 }}>
          {tel && <a className="btn btn-lg" href={tel}><Phone />Llamar</a>}
          {wa && (
            <a className="btn btn-lg" href={wa} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          )}
        </div>
      )}

      {/* --------------------------------------------------- CUÁNDO Y DÓNDE */}
      <div className="w-block">
        <h3><CalendarDays aria-hidden />Cuándo y dónde</h3>
        <dl className="kv tight">
          <dt>Fecha prevista</dt>
          <dd>
            {a.scheduled_date
              ? `${fmtDate(a.scheduled_date)}${a.scheduled_time ? ` · ${fmtTimeShort(a.scheduled_time)}` : ''}`
              : 'Sin fecha. Habla con administración.'}
          </dd>
          {a.address && (
            <>
              <dt><MapPin size={14} aria-hidden /> Dirección</dt>
              <dd>{a.address}</dd>
            </>
          )}
          {a.phone && <><dt>Teléfono</dt><dd>{fmtPhone(a.phone)}</dd></>}
        </dl>
      </div>

      {/* ------------------------------------------------------- EL TRABAJO */}
      <div className="w-block">
        <h3><ClipboardList aria-hidden />El trabajo</h3>
        <dl className="kv tight">
          {a.description
            ? <><dt>Qué pasa</dt><dd className="pre">{a.description}</dd></>
            : <><dt>Qué pasa</dt><dd className="muted">Sin descripción.</dd></>}
          <dt>Tus horas validadas</dt>
          <dd className="num">{fmtHours(misHoras)}</dd>
        </dl>
        <p className="w-note" style={{ marginBottom: 0 }}>
          Apunta <strong>tus</strong> horas, no las de la pareja. Cada uno rellena su parte.
        </p>
      </div>

      {/* ---------------------------------------------------------- EQUIPO */}
      <div className="w-block">
        <h3><Users aria-hidden />Quién va a este aviso</h3>
        {compañeros.length ? (
          <ul className="team-list">
            {compañeros.map((m) => (
              <li key={m.worker_id}>
                {m.full_name}
                {m.worker_id === profile?.id && <span className="faint"> · tú</span>}
              </li>
            ))}
          </ul>
        ) : <p className="muted">Solo tú, de momento.</p>}
        {responsable && responsable.worker_id !== profile?.id && (
          <p className="w-note" style={{ marginBottom: 0 }}>
            Responsable del aviso: {responsable.full_name}.
          </p>
        )}
      </div>

      {/* ---------------------------------------------------- DOCUMENTACIÓN */}
      <div className="w-block">
        <DocumentsPanel owner={{ fichaId: a.id }} title="Fotografías y documentos" />
      </div>

      {/* ------------------------------------------------------- MIS PARTES */}
      <div className="w-block">
        <h3><FileText aria-hidden />Mis partes de este aviso</h3>
        {partes.length ? (
          <ul className="mini-list">
            {partes.map((r) => (
              <li key={r.id}>
                <Link to={`/t/partes/${r.id}`}>
                  <span className="mono">{r.code}</span>
                  <span>{ORDER_TYPE_LABEL[r.work_type]} · {fmtDate(r.work_date)}</span>
                  <span className="num">{r.hours != null ? fmtHours(r.hours) : '—'}</span>
                  <Badge tone={REPORT_STATUS_TONE[r.status]}>{REPORT_STATUS_SHORT[r.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Todavía no has rellenado ningún parte de este aviso.</p>}
      </div>

      {/* ------------------------------------------------------ COMENTARIOS */}
      <div className="w-block">
        <CommentsPanel owner={{ fichaId: a.id }} />
      </div>
    </>
  );
}
