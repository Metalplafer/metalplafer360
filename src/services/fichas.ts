import { supabase, unwrap } from '@/lib/supabase';
import type { Ficha, FichaType } from '@/types/db';

const SELECT =
  '*, client:clients(id, name, phone, kind), contact:client_contacts(id, name, phone), ' +
  'assignee:profiles!fichas_assigned_to_fkey(id, full_name)';

export type FichaInput = Partial<Pick<Ficha,
  'type' | 'client_id' | 'contact_id' | 'title' | 'description' | 'address' | 'phone' |
  'scheduled_date' | 'scheduled_time' | 'assigned_to' | 'amount' | 'status'>>;

function clean(o: FichaInput) {
  return Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]),
  );
}

export interface FichaFilters {
  type?: FichaType;
  status?: string;
  clientId?: string;
  assignedTo?: string;
  search?: string;
  state?: 'abiertas' | 'todas' | 'archivadas';
  page?: number;
  pageSize?: number;
}

/** Estados en los que una ficha ya no requiere acción. */
const CLOSED: Record<FichaType, string[]> = {
  presupuesto: ['aceptado', 'cancelado'],
  visita: ['realizada', 'cancelada'],
  aviso: ['realizado', 'cerrado'],
};

export async function listFichas(f: FichaFilters) {
  const { page = 0, pageSize = 25 } = f;
  let q = supabase.from('fichas').select(SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (f.type) q = q.eq('type', f.type);
  if (f.status) q = q.eq('status', f.status);
  if (f.clientId) q = q.eq('client_id', f.clientId);
  if (f.assignedTo) q = q.eq('assigned_to', f.assignedTo);

  if (f.state === 'archivadas') q = q.not('archived_at', 'is', null);
  else {
    q = q.is('archived_at', null);
    if (f.state === 'abiertas' && f.type) q = q.not('status', 'in', `(${CLOSED[f.type].join(',')})`);
  }

  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[,()*]/g, ' ');
    q = q.or(`code.ilike.%${s}%,title.ilike.%${s}%,description.ilike.%${s}%,address.ilike.%${s}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Ficha[], count: count ?? 0 };
}

export async function getFicha(id: string) {
  return unwrap(await supabase.from('fichas').select(SELECT).eq('id', id).single()) as unknown as Ficha;
}

export async function createFicha(input: FichaInput) {
  return unwrap(
    await supabase.from('fichas').insert(clean(input)).select(SELECT).single(),
  ) as unknown as Ficha;
}

export async function updateFicha(id: string, patch: FichaInput & { archived_at?: string | null }) {
  return unwrap(
    await supabase.from('fichas').update(clean(patch)).eq('id', id).select(SELECT).single(),
  ) as unknown as Ficha;
}

/** Cuántas fichas hay de cada tipo pendientes de atención. */
export async function fichaCounts() {
  const types: FichaType[] = ['presupuesto', 'visita', 'aviso'];
  const results = await Promise.all(types.map(async (type) => {
    const { count, error } = await supabase.from('fichas')
      .select('id', { count: 'exact', head: true })
      .eq('type', type).is('archived_at', null)
      .not('status', 'in', `(${CLOSED[type].join(',')})`);
    if (error) throw error;
    return [type, count ?? 0] as const;
  }));
  return Object.fromEntries(results) as Record<FichaType, number>;
}

/** Fichas sin responsable asignado. */
export async function unassignedCount() {
  const { count, error } = await supabase.from('fichas')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'por_asignar').is('archived_at', null);
  if (error) throw error;
  return count ?? 0;
}
