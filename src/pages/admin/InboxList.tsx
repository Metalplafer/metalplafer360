import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Mail, Paperclip, Search } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { Badge, PageHeader, Panel, Tabs } from '@/components/ui/Layout';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { listMailRequests, type MailFilters } from '@/services/mail';
import { MAIL_STATUS_LABEL, MAIL_STATUS_TONE, MAIL_STATUSES } from '@/config/constants';
import { fmtDateTime } from '@/lib/format';
import type { MailRequest, MailStatus } from '@/types/db';

type Pestana = 'activas' | MailStatus;

/**
 * LA BANDEJA DE ENTRADA.
 *
 * MEJORA 6 · Lo que entra por «peticiones@metalplafer.com» aparece aquí
 * como una ficha PROVISIONAL. No es un presupuesto todavía, y la
 * pantalla lo dice en todo momento: el aviso de arriba, el estado de
 * cada fila y el botón que hay que pulsar para convertirla.
 *
 * Se abre por «Sin revisar»: es lo que hay que mirar por la mañana. Las
 * descartadas tienen su propia pestaña, como los archivados, porque no
 * se borran.
 */
export default function InboxList() {
  const [tab, setTab] = useState<Pestana>('activas');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtros: MailFilters = {
    page,
    search: search.trim() || undefined,
    ...(tab === 'activas' ? { state: 'activas' as const } : { status: tab, state: 'todas' as const }),
  };
  const lista = useAsync(() => listMailRequests(filtros), [tab, search, page]);
  const rows = lista.data?.rows ?? [];

  const remitente = (m: MailRequest) =>
    m.original_sender_email ?? m.sender_email ?? 'Remitente desconocido';

  return (
    <>
      <PageHeader
        title="Solicitudes recibidas"
        sub="Lo que entra por correo, antes de ser nada. Se revisa a mano y se convierte cuando toca."
      />

      <section className="panel" style={{ marginBottom: 16 }}>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'activas' as const, label: 'En curso' },
            ...MAIL_STATUSES.map((s) => ({ key: s, label: MAIL_STATUS_LABEL[s] })),
          ]}
        />
      </section>

      <Panel
        title="Bandeja"
        actions={(
          <div style={{ position: 'relative', minWidth: 230 }}>
            <Search size={17} aria-hidden
                    style={{ position: 'absolute', left: 11, top: 11, color: 'var(--faint)' }} />
            <label htmlFor="sol-search" className="sr-only">Buscar solicitudes</label>
            <input id="sol-search" className="input" style={{ paddingLeft: 36 }}
                   placeholder="Asunto, remitente, texto…"
                   value={search}
                   onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
        )}
      >
        {lista.loading && !lista.data ? <Loading />
          : lista.error ? <ErrorBox message={lista.error} onRetry={lista.reload} />
          : !rows.length ? (
            <Empty title="No hay solicitudes aquí" icon={<Inbox aria-hidden />}>
              {tab === 'activas'
                ? <>Cuando un cliente escriba a la dirección de peticiones, su correo aparecerá
                    en esta lista con sus fotos y sus planos.</>
                : <>No hay ninguna solicitud en este estado.</>}
            </Empty>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Solicitud</th>
                      <th>Remitente</th>
                      <th>Asunto</th>
                      <th>Recibida</th>
                      <th>Estado</th>
                      <th>Destino</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <Link to={`/admin/solicitudes/${m.id}`} className="plate">{m.code}</Link>
                        </td>
                        <td>
                          <span className="cell-main">
                            <strong>{m.original_sender_name ?? m.sender_name ?? remitente(m)}</strong>
                            <small>{remitente(m)}</small>
                            {m.forwarded && (
                              <small>
                                <Mail size={11} aria-hidden style={{ verticalAlign: '-1px' }} />{' '}
                                {m.sender_needs_review
                                  ? 'Reenviado · falta saber de quién'
                                  : `Reenviado por ${m.sender_name ?? m.sender_email ?? 'administración'}`}
                              </small>
                            )}
                          </span>
                        </td>
                        <td>
                          <Link to={`/admin/solicitudes/${m.id}`} className="cell-main">
                            <strong>{m.original_subject ?? m.subject ?? '(sin asunto)'}</strong>
                            {m.client && <small>{m.client.name}</small>}
                          </Link>
                        </td>
                        <td className="nowrap">{fmtDateTime(m.received_at)}</td>
                        <td>
                          <Badge tone={MAIL_STATUS_TONE[m.status]}>
                            {MAIL_STATUS_LABEL[m.status]}
                          </Badge>
                          {m.sender_needs_review && m.status !== 'vinculada' && (
                            <> <Badge tone="amber" plain>Revisar remitente</Badge></>
                          )}
                        </td>
                        <td>
                          {m.target_ficha
                            ? <Link to={`/admin/fichas/${m.target_ficha.id}`}>{m.target_ficha.code}</Link>
                            : m.target_project
                              ? <Link to={`/admin/proyectos/${m.target_project.id}`}>{m.target_project.code}</Link>
                              : <span className="faint">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="hint" style={{ marginBottom: 0 }}>
                <Paperclip size={13} aria-hidden style={{ verticalAlign: '-2px' }} />{' '}
                {lista.data?.count === 1
                  ? '1 solicitud'
                  : `${lista.data?.count ?? 0} solicitudes`}. Ninguna se convierte en presupuesto,
                visita o aviso por sí sola: hay que abrirla y decidirlo.
              </p>

              {(lista.data?.count ?? 0) > rows.length && (
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn btn-sm" disabled={page === 0}
                          onClick={() => setPage((n) => Math.max(0, n - 1))}>Anteriores</button>
                  <button className="btn btn-sm"
                          disabled={(page + 1) * 25 >= (lista.data?.count ?? 0)}
                          onClick={() => setPage((n) => n + 1)}>Siguientes</button>
                </div>
              )}
            </>
          )}
      </Panel>
    </>
  );
}
