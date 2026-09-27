import { supabase, unwrap } from '@/lib/supabase';
import { Aviso } from '@/lib/errors';
import type { Material, MaterialRequest, ProjectMaterials, RequestStatus } from '@/types/db';

const SELECT =
  '*, project:projects(id, code, name), order:work_orders(id, code)';

const REQUEST_SELECT =
  '*, worker:profiles!material_requests_worker_id_fkey(id, full_name), ' +
  'project:projects(id, code, name), order:work_orders(id, code)';

export type MaterialInput = Partial<Pick<Material,
  'project_id' | 'order_id' | 'name' | 'units' | 'supplier' |
  'ordered_on' | 'expected_on' | 'received' | 'notes'>>;

function clean(o: MaterialInput) {
  return Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]),
  );
}

export interface MaterialFilters {
  state?: 'pendiente' | 'retrasado' | 'recibido' | 'todos';
  projectId?: string;
  supplier?: string;
  search?: string;
  archived?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listMaterials(f: MaterialFilters = {}, today?: string) {
  const { page = 0, pageSize = 50 } = f;
  let q = supabase.from('materials').select(SELECT, { count: 'exact' })
    .order('received')
    .order('expected_on', { nullsFirst: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  q = f.archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);

  if (f.state === 'pendiente') q = q.eq('received', false);
  else if (f.state === 'recibido') q = q.eq('received', true);
  else if (f.state === 'retrasado' && today) q = q.eq('received', false).lt('expected_on', today);

  if (f.projectId) q = q.eq('project_id', f.projectId);
  if (f.supplier) q = q.eq('supplier', f.supplier);

  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[,()*]/g, ' ');
    q = q.or(`name.ilike.%${s}%,supplier.ilike.%${s}%,notes.ilike.%${s}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Material[], count: count ?? 0 };
}

export async function createMaterial(input: MaterialInput) {
  if (!input.name?.trim()) throw new Aviso('Escribe qué material falta.');
  if (!input.project_id) throw new Aviso('Elige el proyecto al que pertenece.');
  return unwrap(
    await supabase.from('materials').insert(clean(input)).select(SELECT).single(),
  ) as unknown as Material;
}

export async function updateMaterial(id: string, patch: MaterialInput & { archived_at?: string | null }) {
  return unwrap(
    await supabase.from('materials').update(clean(patch)).eq('id', id).select(SELECT).single(),
  ) as unknown as Material;
}

/**
 * Marcar recibido es solo eso: no se guarda ni la fecha ni quién lo marcó.
 * Eso queda en el historial general de la aplicación.
 */
export async function setReceived(id: string, received: boolean) {
  return updateMaterial(id, { received });
}

/** Proveedores ya utilizados, para sugerirlos mientras se escribe. */
export async function suggestSuppliers(query: string) {
  return unwrap(
    await supabase.rpc('suggest_suppliers', { p_query: query, p_limit: 8 }),
  ) as { supplier: string; veces: number }[];
}

export async function projectMaterialSummary(projectId: string) {
  const rows = unwrap(
    await supabase.from('project_materials').select('*').eq('project_id', projectId),
  ) as ProjectMaterials[];
  return rows[0] ?? null;
}

/** Avisa a administración del material que se ha retrasado (una vez al día). */
export async function checkLateMaterials() {
  return unwrap(await supabase.rpc('notify_late_materials')) as number;
}

// ---------------------------------------------------------------------
// Lo que comunican los trabajadores
// ---------------------------------------------------------------------

export async function listRequests(status?: RequestStatus) {
  let q = supabase.from('material_requests').select(REQUEST_SELECT)
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  return unwrap(await q) as unknown as MaterialRequest[];
}

export async function countPendingRequests() {
  const { count, error } = await supabase.from('material_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pendiente');
  if (error) throw error;
  return count ?? 0;
}

/** El trabajador comunica que falta material. No crea material. */
export async function submitRequest(orderId: string, body: string) {
  const text = body.trim();
  if (!text) throw new Aviso('Escribe qué material falta.');
  return unwrap(
    await supabase.rpc('submit_material_request', { p_order: orderId, p_body: text }),
  ) as MaterialRequest;
}

/** Administración la acepta: ahora sí se crea el material pendiente. */
export async function acceptRequest(requestId: string, material: {
  name: string; units?: number | null; supplier?: string | null;
  orderedOn?: string | null; expectedOn?: string | null; notes?: string | null;
}) {
  if (!material.name.trim()) throw new Aviso('Escribe el nombre del material.');
  return unwrap(await supabase.rpc('accept_material_request', {
    p_request: requestId,
    p_name: material.name.trim(),
    p_units: material.units ?? null,
    p_supplier: material.supplier ?? null,
    p_ordered_on: material.orderedOn ?? null,
    p_expected_on: material.expectedOn ?? null,
    p_notes: material.notes ?? null,
  })) as unknown as Material;
}

export async function discardRequest(requestId: string, note: string) {
  unwrap(await supabase.rpc('discard_material_request', {
    p_request: requestId, p_note: note.trim() || null,
  }));
}
