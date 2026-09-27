import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Field, PageHeader, Panel } from '@/components/ui/Layout';
import { Alert, ErrorBox, Loading } from '@/components/ui/Feedback';
import { assignWorkers, createOrder, getOrder, orderTeam, updateOrder } from '@/services/orders';
import { listProjects } from '@/services/projects';
import { listPeople } from '@/services/people';
import { ORDER_TYPE_LABEL, ORDER_TYPES } from '@/config/constants';
import { parseDecimal, todayMadrid } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';
import type { OrderType } from '@/types/db';

const isType = (v: string | null): v is OrderType => ORDER_TYPES.includes(v as OrderType);

/**
 * Alta y edición de órdenes de trabajo.
 * Solo lleva FECHA: no hay hora prevista de inicio ni de fin.
 */
export default function OrderForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useDialogs();

  const editing = Boolean(id);
  const order = useAsync(async () => (id ? getOrder(id) : null), [id]);
  const team = useAsync(async () => (id ? orderTeam(id) : []), [id]);
  const projects = useAsync(() => listProjects({ phase: 'activos', pageSize: 200 }), []);
  const people = useAsync(() => listPeople('worker'), []);

  const [form, setForm] = useState({
    project_id: params.get('proyecto') ?? '',
    type: (isType(params.get('tipo')) ? params.get('tipo') : 'fabricacion') as OrderType,
    scheduled_date: params.get('fecha') ?? todayMadrid(),
    description: '',
    planned_hours: '',
    admin_notes: '',
  });
  const [workers, setWorkers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const o = order.data;
    if (!o) return;
    setForm({
      project_id: o.project_id,
      type: o.type,
      scheduled_date: o.scheduled_date,
      description: o.description,
      planned_hours: o.planned_hours ? String(o.planned_hours).replace('.', ',') : '',
      admin_notes: o.admin_notes ?? '',
    });
  }, [order.data]);

  useEffect(() => {
    if (team.data) setWorkers(team.data.map((t) => t.worker_id));
  }, [team.data]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  function toggleWorker(workerId: string) {
    setWorkers((list) => (list.includes(workerId) ? list.filter((w) => w !== workerId) : [...list, workerId]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.project_id) { setError('Elige el proyecto al que pertenece la orden.'); return; }
    if (!form.scheduled_date) { setError('Indica la fecha de la orden.'); return; }
    if (!form.description.trim()) { setError('Escribe el trabajo a realizar.'); return; }

    const hours = form.planned_hours.trim() ? parseDecimal(form.planned_hours) : 0;
    if (hours === null || hours < 0) {
      setError('Las horas previstas no son válidas. Escríbelas así: 18 o 7,5');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        project_id: form.project_id,
        type: form.type,
        scheduled_date: form.scheduled_date,
        description: form.description.trim(),
        planned_hours: hours,
        admin_notes: form.admin_notes,
      };
      const saved = editing && id
        ? await updateOrder(id, payload)
        : await createOrder(payload);

      await assignWorkers(saved.id, workers);
      toast.success(editing ? 'Orden guardada' : `Orden ${saved.code} creada`);
      navigate(`/admin/ordenes/${saved.id}`, { replace: true });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing && order.loading && !order.data) return <Loading />;
  if (order.error) return <ErrorBox message={order.error} onRetry={order.reload} />;

  const locked = order.data?.status === 'validada';

  return (
    <>
      <Link className="btn btn-sm btn-ghost" to={editing && id ? `/admin/ordenes/${id}` : '/admin/ordenes'}
            style={{ marginBottom: 10 }}>
        <ArrowLeft />{editing ? 'Volver a la orden' : 'Órdenes de trabajo'}
      </Link>

      <PageHeader
        title={editing ? `Editar ${order.data?.code ?? 'orden'}` : 'Nueva orden de trabajo'}
        sub="La orden lleva solo fecha: el horario real lo decide el taller."
      />

      <form onSubmit={submit} className="stack" style={{ maxWidth: 820 }}>
        {error && <Alert kind="danger">{error}</Alert>}
        {locked && (
          <Alert kind="warn">
            Esta orden ya está validada. Puedes corregir sus datos, pero no vuelve a abrirse:
            para eso hay que devolverla desde la pantalla de la orden.
          </Alert>
        )}

        <Panel title="El trabajo">
          <div className="form-grid">
            <Field label="Proyecto" htmlFor="ot-project" span>
              {projects.loading && !projects.data ? <Loading /> : (
                <select id="ot-project" className="select" value={form.project_id}
                        onChange={(e) => set({ project_id: e.target.value })}>
                  <option value="">Elige un proyecto…</option>
                  {projects.data?.rows.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}{p.client ? ` · ${p.client.name}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Tipo de orden" htmlFor="ot-type">
              <select id="ot-type" className="select" value={form.type}
                      onChange={(e) => set({ type: e.target.value as OrderType })}>
                {ORDER_TYPES.map((t) => <option key={t} value={t}>{ORDER_TYPE_LABEL[t]}</option>)}
              </select>
            </Field>

            <Field label="Fecha" htmlFor="ot-date" hint="Sin hora de inicio ni de fin.">
              <input id="ot-date" className="input" type="date"
                     value={form.scheduled_date} onChange={(e) => set({ scheduled_date: e.target.value })} />
            </Field>

            <Field label="Trabajo a realizar" htmlFor="ot-desc" span
                   hint="Lo que lee el trabajador. Él no puede modificarlo: escribe su parte aparte.">
              <textarea id="ot-desc" className="textarea" rows={4}
                        value={form.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>

            <Field label="Horas previstas" htmlFor="ot-hours"
                   hint="De la orden completa, no de cada trabajador.">
              <input id="ot-hours" className="input" inputMode="decimal" placeholder="18"
                     value={form.planned_hours} onChange={(e) => set({ planned_hours: e.target.value })} />
            </Field>

            <Field label="Comentarios de administración" htmlFor="ot-notes" span>
              <textarea id="ot-notes" className="textarea" rows={2}
                        value={form.admin_notes} onChange={(e) => set({ admin_notes: e.target.value })} />
            </Field>
          </div>
        </Panel>

        <Panel title="Trabajadores asignados">
          {people.loading && !people.data ? <Loading /> : !people.data?.length ? (
            <p className="muted" style={{ margin: 0 }}>
              Todavía no hay trabajadores dados de alta.
            </p>
          ) : (
            <>
              <div className="substatus-grid">
                {people.data.map((p) => (
                  <label key={p.id} className="checkbox">
                    <input type="checkbox" checked={workers.includes(p.id)}
                           onChange={() => toggleWorker(p.id)} />
                    {p.full_name}
                  </label>
                ))}
              </div>
              <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
                Puedes asignar varios. No hay responsable principal: cada uno apunta sus propias horas.
              </p>
            </>
          )}
        </Panel>

        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            <Save />{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear orden'}
          </button>
          <Link className="btn btn-ghost" to={editing && id ? `/admin/ordenes/${id}` : '/admin/ordenes'}>
            Cancelar
          </Link>
        </div>
      </form>
    </>
  );
}
