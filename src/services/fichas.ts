import { supabase, unwrap } from '@/lib/supabase';
import type { Ficha, FichaTeamRow, FichaType, Profile } from '@/types/db';

const SELECT =
  '*, client:clients(id, name, phone, kind), contact:client_contacts(id, name, phone), ' +
  'assignee:profiles!fichas_assigned_to_fkey(id, full_name)';

export type FichaInput = Partial<Pick<Ficha,
  'type' | 'client_id' | 'contact_id' | 'title' | 'description' | 'address' | 'phone' |
  'email' | 'hours' | 'scheduled_date' | 'scheduled_time' | 'assigned_to' |
  'amount' | 'status'>>;

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

/**
 * VISITAS sin asignar.
 *
 * Solo visitas: desde que los presupuestos y los avisos no tienen
 * responsable administrativo, son las únicas que nacen «Por asignar».
 * Contar las tres clases dejaría el contador encendido para siempre por
 * presupuestos antiguos que ya nadie va a asignar.
 */
export async function unassignedCount() {
  const { count, error } = await supabase.from('fichas')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'visita')
    .eq('status', 'por_asignar').is('archived_at', null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * ELIMINAR una ficha (presupuesto, visita o aviso) con todo lo suyo.
 * Los archivos del almacén se retiran antes, desde quien llama.
 * La base de datos se niega si de esta ficha salió un proyecto.
 */
export async function deleteFicha(id: string) {
  return unwrap(await supabase.rpc('delete_ficha', { p_ficha: id })) as unknown as {
    ok: boolean; code: string; documentos: number; comentarios: number;
  };
}

// ---------------------------------------------------------------------
// EL EQUIPO DE UN AVISO
//
// Un AVISO DE CLIENTE puede llevar varios trabajadores. Conviven dos
// cosas, y no es un descuido:
//
//   · «assigned_to», el RESPONSABLE, que es de siempre y sigue valiendo;
//   · «ficha_workers», el EQUIPO, que es lo que se añade.
//
// Se manda la lista COMPLETA, igual que en los proyectos y en las
// órdenes: quitar a alguien es volver a mandar la lista sin él.
//
// Una VISITA no se reparte: las lleva administración. La base de datos lo
// rechaza, así que esto no depende de que la pantalla esconda el botón.
// ---------------------------------------------------------------------

/** Quién va en un aviso: su responsable y su equipo. */
export async function fichaTeam(fichaId: string) {
  return unwrap(await supabase.from('ficha_team').select('*')
    .eq('ficha_id', fichaId)
    .order('es_responsable', { ascending: false })
    .order('full_name')) as FichaTeamRow[];
}

/** Pone el equipo de un aviso. Solo administración, y solo avisos. */
export async function assignFichaWorkers(fichaId: string, workerIds: string[]) {
  return unwrap(await supabase.rpc('assign_ficha_workers', {
    p_ficha: fichaId, p_workers: workerIds,
  })) as unknown as Profile[];
}

/**
 * CORREGIR EL CLIENTE de un presupuesto, una visita o un aviso.
 *
 * Va por su propia función de la base de datos y no por un «update»
 * suelto, porque hay dos cosas que tienen que pasar siempre: que el
 * cambio quede en el historial con los dos nombres, y que la persona de
 * contacto se quite si era del cliente anterior.
 *
 * NO crea clientes: el identificador que se manda es el de uno que ya
 * existe, elegido de la lista.
 */
export async function setFichaClient(fichaId: string, clientId: string | null) {
  unwrap(await supabase.rpc('set_ficha_client', {
    p_ficha: fichaId, p_client: clientId,
  }));
}
