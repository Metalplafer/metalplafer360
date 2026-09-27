import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Euro, Plus, Trash2 } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Modal } from '@/components/ui/Modal';
import { Badge, Field, PageHeader, Stat } from '@/components/ui/Layout';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import {
  listBilling, listPayments, registerPayment, voidPayment, type BillingRow,
} from '@/services/billing';
import { setBillingStatus } from '@/services/projects';
import { BILLING_LABEL, BILLING_STATUSES, BILLING_TONE } from '@/config/constants';
import { fmtDate, fmtEur, parseDecimal, todayMadrid } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';
import type { BillingStatus } from '@/types/db';

type Filter = BillingStatus | 'pendientes' | 'todos';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pendientes', label: 'Sin cobrar del todo' },
  ...BILLING_STATUSES.map((s) => ({ key: s as Filter, label: BILLING_LABEL[s] })),
  { key: 'todos', label: 'Todos' },
];

/**
 * Facturación: seguimiento interno de cobros.
 * El pendiente no se escribe nunca a mano: es total − cobrado.
 * No se guarda el número de factura.
 */
export default function BillingPage() {
  const { toast, confirm } = useDialogs();
  const today = todayMadrid();

  const [filter, setFilter] = useState<Filter>('pendientes');
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState<BillingRow | null>(null);

  const rows = useAsync(() => listBilling(filter), [filter, reloadKey]);
  const list = rows.data ?? [];

  const totals = list.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      cobrado: acc.cobrado + r.cobrado,
      pendiente: acc.pendiente + r.pendiente,
    }),
    { total: 0, cobrado: 0, pendiente: 0 },
  );

  async function changeStatus(row: BillingRow, status: BillingStatus) {
    try {
      await setBillingStatus(row.project.id, status);
      toast.success(`Facturación: ${BILLING_LABEL[status]}`);
      setReloadKey((n) => n + 1);
    } catch (e) { toast.error(e); }
  }

  return (
    <>
      <PageHeader
        title="Facturación"
        sub="Seguimiento interno de cobros. No sustituye al programa de facturación de la empresa."
      />

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-body row" style={{ gap: 'var(--s6, 32px)', flexWrap: 'wrap' }}>
          <Stat value={fmtEur(totals.total)} label="Total de estos proyectos" />
          <Stat value={fmtEur(totals.cobrado)} label="Cobrado" />
          <Stat value={fmtEur(totals.pendiente)} label="Pendiente de cobro"
                tone={totals.pendiente > 0 ? 'attention' : undefined} />
        </div>
      </section>

      <section className="panel">
        <div className="toolbar">
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {FILTERS.map((f) => (
              <button key={f.key} className="chip" aria-pressed={filter === f.key}
                      onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
          </div>
        </div>

        <div className="panel-body tight">
          {rows.loading && !rows.data ? <Loading />
            : rows.error ? <div style={{ padding: 16 }}><ErrorBox message={rows.error} onRetry={rows.reload} /></div>
            : !list.length ? (
              <Empty title="No hay proyectos en esta situación" icon={<Euro aria-hidden />}>
                Los importes salen del presupuesto de cada proyecto.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Proyecto</th>
                      <th>Cliente</th>
                      <th>Estado</th>
                      <th className="right">Total</th>
                      <th className="right">Cobrado</th>
                      <th className="right">Pendiente</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.project.id}>
                        <td>
                          <span className="cell-main">
                            <Link to={`/admin/proyectos/${r.project.id}`}>
                              <strong>{r.project.code}</strong>
                            </Link>
                            <small>{r.project.name}</small>
                          </span>
                        </td>
                        <td>{r.project.client?.name ?? '—'}</td>
                        <td>
                          <Badge tone={BILLING_TONE[r.project.billing_status]}>
                            {BILLING_LABEL[r.project.billing_status]}
                          </Badge>
                        </td>
                        <td className="right num">{fmtEur(r.total)}</td>
                        <td className="right num">{fmtEur(r.cobrado)}</td>
                        <td className="right num">
                          {r.pendiente > 0 ? <strong>{fmtEur(r.pendiente)}</strong> : fmtEur(0)}
                        </td>
                        <td className="right nowrap">
                          <button className="btn btn-sm" onClick={() => setOpen(r)}>
                            <Plus />Cobro
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </section>

      {open && (
        <PaymentsModal
          row={open}
          today={today}
          onClose={() => { setOpen(null); setReloadKey((n) => n + 1); }}
          onStatus={changeStatus}
          confirm={confirm}
          toast={toast}
        />
      )}
    </>
  );
}

/** Cobros de un proyecto: apuntarlos, verlos y quitar los que se apuntaron mal. */
function PaymentsModal({ row, today, onClose, onStatus, confirm, toast }: {
  row: BillingRow;
  today: string;
  onClose: () => void;
  onStatus: (row: BillingRow, status: BillingStatus) => Promise<void>;
  confirm: ReturnType<typeof useDialogs>['confirm'];
  toast: ReturnType<typeof useDialogs>['toast'];
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const payments = useAsync(() => listPayments(row.project.id), [row.project.id, reloadKey]);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Los cobros anulados siguen viéndose, pero no suman.
  const cobrado = (payments.data ?? [])
    .filter((p) => !p.voided_at)
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const pendiente = Math.max(row.total - cobrado, 0);

  async function add() {
    setError(null);
    const value = parseDecimal(amount);
    if (value === null || value <= 0) {
      setError('Escribe el importe cobrado. Por ejemplo: 2.000 o 1.500,50');
      return;
    }
    setBusy(true);
    try {
      await registerPayment(row.project.id, value, paidOn || null, notes);
      toast.success(`Cobro de ${fmtEur(value)} apuntado`);
      setAmount(''); setNotes('');
      setReloadKey((n) => n + 1);
    } catch (e) { setError(toUserMessage(e)); }
    finally { setBusy(false); }
  }

  async function annul(id: string, value: number) {
    const ok = await confirm({
      title: 'Anular el cobro',
      message: <>
        Se anulará el cobro de {fmtEur(value)} y dejará de contar en el total.
        No se borra: se queda a la vista, tachado, y queda en el historial.
      </>,
      confirmLabel: 'Anular',
      danger: true,
    });
    if (!ok) return;
    try {
      await voidPayment(id);
      toast.success('Cobro anulado');
      setReloadKey((n) => n + 1);
    } catch (e) { toast.error(e); }
  }

  return (
    <Modal
      title={`Cobros de ${row.project.code}`}
      size="wide"
      onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Cerrar</button>}
    >
      <div className="stack">
        <div className="figure-row">
          <span className="figure"><b>{fmtEur(row.total)}</b><span>Total</span></span>
          <span className="figure"><b>{fmtEur(cobrado)}</b><span>Cobrado</span></span>
          <span className="figure"><b>{fmtEur(pendiente)}</b><span>Pendiente</span></span>
        </div>

        <div className="status-flow" role="group" aria-label="Estado de facturación">
          {BILLING_STATUSES.map((s) => (
            <button key={s} aria-current={s === row.project.billing_status}
                    onClick={() => onStatus(row, s)}>
              {BILLING_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <Field label="Importe cobrado" htmlFor="pay-amount">
            <input id="pay-amount" className="input" inputMode="decimal" value={amount}
                   placeholder="2.000" onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Fecha del cobro" htmlFor="pay-date">
            <input id="pay-date" className="input" type="date" value={paidOn}
                   onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
          <Field label="Nota (opcional)" htmlFor="pay-notes" span>
            <input id="pay-notes" className="input" value={notes}
                   placeholder="Anticipo, transferencia…"
                   onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        <div>
          <button className="btn btn-primary" onClick={add} disabled={busy}>
            <Plus />{busy ? 'Apuntando…' : 'Apuntar cobro'}
          </button>
          <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
            No se guarda el número de factura: esto es solo el seguimiento interno.
          </p>
        </div>

        {payments.loading && !payments.data ? <Loading />
          : !payments.data?.length ? (
            <Empty title="Todavía no hay cobros apuntados" icon={<Euro aria-hidden />} />
          ) : (
            <ul className="mini-list">
              {payments.data.map((p) => (
                <li key={p.id} className={p.voided_at ? 'is-voided' : undefined}>
                  <span className="cell-main" style={{ flex: 1 }}>
                    <strong className="num">{fmtEur(p.amount)}</strong>
                    <small>
                      {fmtDate(p.paid_on)}{p.notes ? ` · ${p.notes}` : ''}
                      {p.voided_at ? ` · anulado el ${fmtDate(p.voided_at)}` : ''}
                    </small>
                  </span>
                  {!p.voided_at && (
                    <button className="btn btn-ghost icon-btn" onClick={() => annul(p.id, Number(p.amount))}
                            aria-label={`Anular el cobro de ${fmtEur(p.amount)}`}>
                      <Trash2 />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
      </div>
    </Modal>
  );
}
