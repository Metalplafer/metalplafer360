import { supabase, unwrap } from '@/lib/supabase';
import { Aviso } from '@/lib/errors';
import type {
  OrderHours, OrderPart, OrderStatus, OrderTeamRow, OrderType, ProjectOrders, WorkOrder,
} from '@/types/db';

const SELECT =
  '*, project:projects(id, code, name, address, phase, measures, finish, location, ' +
  'client:clients(id, name, phone)), ' +
  'validator:profiles!work_orders_validated_by_fkey(full_name)';

export type OrderInput = Partial<Pick<WorkOrder,
  'project_id' | 'type' | 'scheduled_date' | 'description' | 'planned_hours' | 'admin_notes'>>;

function clean(o: OrderInput) {
  return Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]),
  );
}

export interface OrderFilters {
  status?: OrderStatus | 'abiertas' | 'revision';
  type?: OrderType;
  projectId?: string;
  workerId?: string;
  from?: string;
  to?: string;
  search?: string;
  state?: 'activas' | 'archivadas';
  page?: number;
  pageSize?: number;
}

export async function listOrders(f: OrderFilters = {}) {
  const { page = 0, pageSize = 25 } = f;
  let q = supabase.from('work_orders').select(SELECT, { count: 'exact' })
    .order('scheduled_date', { ascending: false })
    .order('code', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (f.state === 'archivadas') q = q.not('archived_at', 'is', null);
  else q = q.is('archived_at', null);

  if (f.status === 'abiertas') q = q.in('status', ['pendiente', 'en_curso', 'devuelta']);
  else if (f.status === 'revision') q = q.eq('status', 'realizada');
  else if (f.status) q = q.eq('status', f.status);

  if (f.type) q = q.eq('type', f.type);
  if (f.projectId) q = q.eq('project_id', f.projectId);
  if (f.from) q = q.gte('scheduled_date', f.from);
  if (f.to) q = q.lte('scheduled_date', f.to);

  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[,()*]/g, ' ');
    q = q.or(`code.ilike.%${s}%,description.ilike.%${s}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as WorkOrder[], count: count ?? 0 };
}

export async function getOrder(id: string) {
  return unwrap(
    await supabase.from('work_orders').select(SELECT).eq('id', id).single(),
  ) as unknown as WorkOrder;
}

export async function createOrder(input: OrderInput) {
  return unwrap(
    await supabase.from('work_orders').insert(clean(input)).select(SELECT).single(),
  ) as unknown as WorkOrder;
}

export async function updateOrder(id: string, patch: OrderInput & { archived_at?: string | null }) {
  return unwrap(
    await supabase.from('work_orders').update(clean(patch)).eq('id', id).select(SELECT).single(),
  ) as unknown as WorkOrder;
}

/** Varios trabajadores a la vez. Se envía siempre la lista completa. */
export async function assignWorkers(orderId: string, workerIds: string[]) {
  unwrap(await supabase.rpc('assign_order_workers', { p_order: orderId, p_workers: workerIds }));
}

/** Los partes de una orden, con las horas de cada persona (administración). */
export async function listParts(orderId: string) {
  return unwrap(
    await supabase.from('work_order_workers')
      .select('*, worker:profiles!work_order_workers_worker_id_fkey(id, full_name)')
      .eq('order_id', orderId)
      .order('assigned_at'),
  ) as unknown as OrderPart[];
}

/** Solo los nombres del equipo: no muestra las horas de los compañeros. */
export async function orderTeam(orderId: string) {
  return unwrap(
    await supabase.from('order_team').select('*').eq('order_id', orderId).order('full_name'),
  ) as OrderTeamRow[];
}

export async function orderHours(orderId: string) {
  const rows = unwrap(
    await supabase.from('order_hours').select('*').eq('order_id', orderId),
  ) as OrderHours[];
  return rows[0] ?? null;
}

export async function projectOrderSummary(projectId: string) {
  const rows = unwrap(
    await supabase.from('project_orders').select('*').eq('project_id', projectId),
  ) as ProjectOrders[];
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------
// Revisión (solo administración)
// ---------------------------------------------------------------------

export async function validateOrder(id: string) {
  unwrap(await supabase.rpc('validate_order', { p_order: id }));
}

/** Devolver exige siempre un motivo escrito. */
export async function returnOrder(id: string, reason: string) {
  const text = reason.trim();
  if (!text) throw new Aviso('Escribe el motivo de la devolución.');
  unwrap(await supabase.rpc('return_order', { p_order: id, p_reason: text }));
}

// ---------------------------------------------------------------------
// Área del trabajador
// ---------------------------------------------------------------------

/** Mis órdenes, ya filtradas por la base de datos: solo llegan las mías. */
export async function myOrders(opts: { from?: string; to?: string; statuses?: OrderStatus[] } = {}) {
  let q = supabase.from('work_orders').select(SELECT)
    .is('archived_at', null)
    .order('scheduled_date');

  if (opts.from) q = q.gte('scheduled_date', opts.from);
  if (opts.to) q = q.lte('scheduled_date', opts.to);
  if (opts.statuses?.length) q = q.in('status', opts.statuses);

  return unwrap(await q) as unknown as WorkOrder[];
}

/** Mi parte de una orden. La base de datos no devuelve el de los demás. */
export async function myPart(orderId: string, workerId: string) {
  return unwrap(
    await supabase.from('work_order_workers').select('*')
      .eq('order_id', orderId).eq('worker_id', workerId).maybeSingle(),
  ) as OrderPart | null;
}

/**
 * Guarda el parte. Con `submit` la orden se envía a revisión.
 * Las reglas (fecha, estado, horas) las comprueba la base de datos.
 */
export async function saveOrderPart(
  orderId: string, workDone: string, hours: number | null, submit = false,
) {
  unwrap(await supabase.rpc('save_order_part', {
    p_order: orderId,
    p_work_done: workDone,
    p_hours: hours ?? 0,
    p_submit: submit,
  }));
}
