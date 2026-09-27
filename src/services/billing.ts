import { supabase, unwrap } from '@/lib/supabase';
import { Aviso } from '@/lib/errors';
import type { BillingStatus, Payment, Project, ProjectBilling } from '@/types/db';

/**
 * Seguimiento interno de cobros.
 * El pendiente NO se guarda: se calcula siempre como total − cobrado.
 * No se guarda el número de factura: eso vive en el programa de
 * facturación de la empresa.
 */

export async function billing(projectId: string) {
  const rows = unwrap(
    await supabase.from('project_billing').select('*').eq('project_id', projectId),
  ) as ProjectBilling[];
  return rows[0] ?? null;
}

export async function listPayments(projectId: string) {
  return unwrap(
    await supabase.from('payments').select('*')
      .eq('project_id', projectId)
      .order('paid_on', { ascending: false }),
  ) as Payment[];
}

export async function registerPayment(
  projectId: string, amount: number, paidOn?: string | null, notes?: string | null,
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Aviso('El importe del cobro tiene que ser mayor que cero.');
  }
  return unwrap(await supabase.rpc('register_payment', {
    p_project: projectId,
    p_amount: amount,
    p_paid_on: paidOn ?? null,
    p_notes: notes?.trim() || null,
  })) as unknown as Payment;
}

/**
 * Anula un cobro apuntado por error. NO se borra: se queda a la vista,
 * tachado, porque los importes cuadran con el programa de facturación.
 */
export async function voidPayment(paymentId: string) {
  unwrap(await supabase.rpc('delete_payment', { p_payment: paymentId }));
}

export interface BillingRow {
  project: Pick<Project, 'id' | 'code' | 'name' | 'phase' | 'billing_status' | 'budget_amount' | 'finished_at'>
    & { client?: { id: string; name: string } | null };
  total: number;
  cobrado: number;
  pendiente: number;
  cobros: number;
}

/**
 * Los proyectos con su situación de cobro.
 * Se piden las dos listas y se cruzan aquí para no depender de una vista
 * con relaciones, que PostgREST no sabe enlazar por sí sola.
 */
export async function listBilling(
  filter: BillingStatus | 'pendientes' | 'todos' = 'pendientes',
  limit = 200,
) {
  let q = supabase.from('projects')
    .select('id, code, name, phase, billing_status, budget_amount, finished_at, client:clients(id, name)')
    .is('archived_at', null)
    .order('code', { ascending: false })
    // Con el filtro «Todos» y cientos de proyectos, el cruce de abajo
    // armaba una dirección web larguísima que el servidor rechazaba.
    .limit(limit);

  if (filter === 'pendientes') q = q.neq('billing_status', 'cobrado');
  else if (filter !== 'todos') q = q.eq('billing_status', filter);

  const projects = unwrap(await q) as unknown as BillingRow['project'][];
  if (!projects.length) return [] as BillingRow[];

  const amounts = unwrap(
    await supabase.from('project_billing').select('*')
      .in('project_id', projects.map((p) => p.id)),
  ) as ProjectBilling[];

  const byId = new Map(amounts.map((a) => [a.project_id, a]));
  return projects.map((project) => {
    const a = byId.get(project.id);
    return {
      project,
      total: Number(a?.total ?? project.budget_amount ?? 0),
      cobrado: Number(a?.cobrado ?? 0),
      pendiente: Number(a?.pendiente ?? project.budget_amount ?? 0),
      cobros: Number(a?.cobros ?? 0),
    };
  }) as BillingRow[];
}
