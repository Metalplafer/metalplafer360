import { supabase, unwrap } from '@/lib/supabase';
import { Aviso } from '@/lib/errors';
import type { Material, MaterialRequest, ProjectMaterials, RequestStatus } from '@/types/db';

const SELECT =
  '*, project:projects(id, code, name), order:work_orders(id, code)';

const REQUEST_SELECT =
  '*, worker:profiles!material_requests_worker_id_fkey(id, full_name), ' +
  'project:projects(id, code, name), order:work_orders(id, code)';

export type MaterialInput = Partial<Pick<Material,
  'project_id' | 'order_id' | 'name' | 'units' | 'supplier' | 'supplier_id' |
  'ordered_on' | 'expected_on' | 'received' | 'notes' | 'origin' | 'prepared'>>;

/**
 * MEJORA 3 · ¿SE PUEDE PREPARAR ESTE MATERIAL?
 *
 * La misma regla que la restricción «materials_preparado_valido» de la
 * base de datos, dicha una sola vez para que la pantalla no la repita de
 * tres maneras distintas:
 *
 *   · lo de almacén ya está en el taller;
 *   · lo pedido, solo cuando ha llegado.
 *
 * La pantalla la usa para APAGAR la casilla; la base de datos la usa
 * para RECHAZAR la escritura. Las dos, no una.
 */
export function sePuedePreparar(m: Pick<Material, 'origin' | 'received'>) {
  return m.origin === 'almacen' || m.received;
}

function clean(o: MaterialInput) {
  return Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]),
  );
}

export interface MaterialFilters {
  state?: 'pendiente' | 'retrasado' | 'recibido' | 'almacen' | 'todos';
  projectId?: string;
  /**
   * El proveedor EN TEXTO, exacto. Sigue valiendo: hay material que solo
   * tiene el nombre escrito a mano.
   */
  supplier?: string;
  /** El proveedor de la lista. */
  supplierId?: string;
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

  // El material del almacén NO es material pendiente de comprar: se
  // saca de «Pendiente», de «Retrasado» y de «Recibido», que son los
  // estados de un pedido, y tiene su propia pestaña.
  if (f.state === 'pendiente') q = q.eq('received', false).eq('origin', 'pedido');
  else if (f.state === 'recibido') q = q.eq('received', true).eq('origin', 'pedido');
  else if (f.state === 'retrasado' && today) {
    q = q.eq('received', false).eq('origin', 'pedido').lt('expected_on', today);
  } else if (f.state === 'almacen') q = q.eq('origin', 'almacen');

  if (f.projectId) q = q.eq('project_id', f.projectId);

  // Los dos filtros de proveedor son EXCLUYENTES y cada uno mira una
  // columna distinta. No se combinan en un «o» a propósito: apilar dos
  // condiciones «or» en PostgREST junto con la búsqueda de texto no se
  // puede comprobar aquí, y preferimos un filtro que se entienda a uno
  // que a lo mejor devuelve de más. El selector de la pantalla ofrece
  // las dos cosas por separado, así que no se pierde ningún material.
  if (f.supplierId) q = q.eq('supplier_id', f.supplierId);
  else if (f.supplier) q = q.eq('supplier', f.supplier);

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
  // El material que YA tenemos no se le ha pedido a nadie: ni proveedor
  // ni fechas de pedido, y está disponible desde el primer momento. La
  // base de datos lo exige también, pero aquí se deja dicho para que no
  // viaje nada que luego rechace.
  if (input.origin === 'almacen') {
    input = {
      ...input,
      supplier: null, supplier_id: null, ordered_on: null, expected_on: null,
      received: true,
    };
  }
  // El proyecto puede ir VACÍO —material de taller—, pero tiene que
  // venir decidido: «null» es una respuesta, no haberlo puesto no.
  if (input.project_id === undefined) {
    throw new Aviso('Di a qué proyecto va el material, o márcalo como material de taller.');
  }
  return unwrap(
    await supabase.from('materials').insert(clean(input)).select(SELECT).single(),
  ) as unknown as Material;
}

export async function updateMaterial(id: string, patch: MaterialInput & { archived_at?: string | null }) {
  if (patch.origin === 'almacen') {
    patch = {
      ...patch,
      supplier: null, supplier_id: null, ordered_on: null, expected_on: null, received: true,
    };
  }
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

/**
 * MEJORA 3 · MARCAR EL MATERIAL COMO PREPARADO Y CARGADO.
 *
 * Igual que «recibido»: solo la marca. Ni fecha ni autor, que quedan en
 * el historial general, y sin tocar el estado del pedido.
 *
 * Si el material está pedido y todavía no ha llegado, la base de datos
 * lo RECHAZA con la restricción «materials_preparado_valido». La
 * pantalla ya apaga la casilla en ese caso, pero la comprobación de
 * verdad está allí: apagar un control no es una validación.
 */
export async function setPrepared(id: string, prepared: boolean) {
  return updateMaterial(id, { prepared });
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

/**
 * Administración la acepta: ahora sí se crea el material pendiente.
 *
 * El proveedor DE LA LISTA se pone en un segundo paso, a propósito: la
 * función «accept_material_request» es de las que ya estaban y recibe el
 * proveedor en texto. Añadirle un parámetro crearía una sobrecarga y
 * PostgREST dejaría de saber a cuál llamar, así que se crea el material
 * como siempre y se le ata el proveedor después. Si ese segundo paso
 * fallara, el material YA está anotado con su proveedor en texto, que es
 * lo que de verdad importa.
 */
export async function acceptRequest(requestId: string, material: {
  name: string; units?: number | null; supplier?: string | null;
  supplierId?: string | null;
  orderedOn?: string | null; expectedOn?: string | null; notes?: string | null;
  /** Obligatorio solo si la petición llegó sin proyecto. */
  projectId?: string | null;
}) {
  if (!material.name.trim()) throw new Aviso('Escribe el nombre del material.');
  const creado = unwrap(await supabase.rpc('accept_material_request', {
    p_request: requestId,
    p_name: material.name.trim(),
    p_units: material.units ?? null,
    p_supplier: material.supplier ?? null,
    p_ordered_on: material.orderedOn ?? null,
    p_expected_on: material.expectedOn ?? null,
    p_notes: material.notes ?? null,
    p_project: material.projectId ?? null,
  })) as unknown as Material;

  if (material.supplierId && creado?.id) {
    return await updateMaterial(creado.id, { supplier_id: material.supplierId });
  }
  return creado;
}

export async function discardRequest(requestId: string, note: string) {
  unwrap(await supabase.rpc('discard_material_request', {
    p_request: requestId, p_note: note.trim() || null,
  }));
}

/**
 * «Falta material» desde un PARTE de trabajo.
 *
 * Entra por el mismo sitio que el aviso de una orden y aparece en la
 * misma pantalla de Material pendiente: no hay un segundo sistema de
 * avisos. El parte tiene que tener proyecto, porque el aviso va siempre
 * contra un proyecto.
 */
/**
 * SOLICITAR MATERIAL, sin esperar a nada.
 *
 * No hace falta una orden ni un parte: cualquiera (trabajador o
 * administración) puede abrir la petición en cuanto ve que falta algo.
 * El proyecto es opcional, porque no siempre se sabe de qué proyecto es.
 *
 * Entra en la MISMA lista y pasa por la MISMA revisión que las que
 * llegan desde una orden o un parte. No hay un segundo sistema.
 */
export async function submitMaterialNeed(projectId: string | null, body: string) {
  const text = body.trim();
  if (!text) throw new Aviso('Escribe qué material falta.');
  return unwrap(await supabase.rpc('submit_material_need', {
    p_project: projectId, p_body: text,
  })) as unknown as MaterialRequest;
}

export async function submitRequestFromReport(reportId: string, body: string) {
  return unwrap(await supabase.rpc('submit_material_request_report', {
    p_report: reportId, p_body: body,
  })) as unknown as MaterialRequest;
}
