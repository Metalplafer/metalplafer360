import { supabase, unwrap } from '@/lib/supabase';
import { PHASES } from '@/config/constants';
import type {
  BillingStatus, PhaseSuggestion, Project, ProjectPhase, ProjectProduct,
  ProjectProductDraft,
} from '@/types/db';

const SELECT =
  '*, client:clients(id, name, phone, kind, address), ' +
  'contact:client_contacts(id, name, phone), ' +
  'source:fichas!projects_source_ficha_id_fkey(id, code), ' +
  'substatuses:project_substatuses(phase, substatus), ' +
  // MEJORA 1 · El color viene con la obra: así la pastilla del código
  // se tiñe sola y cambiar el color de una obra se refleja en TODOS
  // sus proyectos sin tocarlos uno a uno.
  'work:works(id, code, name, color)';

export type ProjectInput = Partial<Pick<Project,
  'client_id' | 'contact_id' | 'name' | 'description' | 'measures' | 'finish' | 'location' |
  'address' | 'observations' | 'budget_amount' | 'advance_amount' |
  'budget_hours_fab' | 'budget_hours_mont' | 'no_assembly'>>;

function clean(o: ProjectInput) {
  return Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]),
  );
}

export interface ProjectFilters {
  phase?: ProjectPhase | 'activos';
  clientId?: string;
  search?: string;
  state?: 'activos' | 'archivados';
  /**
   * Un SUBESTADO concreto, por ejemplo «falta_material». Un proyecto
   * puede tener varios a la vez, así que esto pregunta «¿lo tiene?», no
   * «¿es el suyo?».
   */
  substatus?: string;
  page?: number;
  pageSize?: number;
}

export async function listProjects(f: ProjectFilters = {}) {
  const { page = 0, pageSize = 25 } = f;

  /**
   * EL FILTRO POR SUBESTADO, EN DOS PASOS.
   *
   * Los subestados viven en otra tabla («project_substatuses») y un
   * proyecto puede tener varios. Se podría intentar filtrar desde la
   * consulta del proyecto, pero filtrar por una tabla relacionada tiene
   * trampa: según cómo se escriba, devuelve el proyecto con los
   * subestados RECORTADOS en lugar de descartar el proyecto, y entonces
   * la pantalla enseñaría de menos sin avisar.
   *
   * Así que se pregunta primero QUÉ proyectos tienen ese subestado y
   * después se piden esos. Son dos viajes en lugar de uno, y a cambio se
   * sabe exactamente qué devuelve. La paginación y el total siguen
   * siendo correctos porque el segundo paso es una consulta normal.
   */
  let ids: string[] | null = null;
  if (f.substatus) {
    const marcados = unwrap(await supabase.from('project_substatuses')
      .select('project_id').eq('substatus', f.substatus)) as { project_id: string }[];
    ids = [...new Set(marcados.map((r) => r.project_id))];
    // Ninguno lo tiene: no hace falta el segundo viaje.
    if (!ids.length) return { rows: [] as Project[], count: 0 };
  }

  let q = supabase.from('projects').select(SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (ids) q = q.in('id', ids);

  if (f.state === 'archivados') q = q.not('archived_at', 'is', null);
  else q = q.is('archived_at', null);

  if (f.phase === 'activos') q = q.neq('phase', 'finalizado');
  else if (f.phase) q = q.eq('phase', f.phase);

  if (f.clientId) q = q.eq('client_id', f.clientId);

  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[,()*]/g, ' ');
    q = q.or(`code.ilike.%${s}%,name.ilike.%${s}%,address.ilike.%${s}%,description.ilike.%${s}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Project[], count: count ?? 0 };
}

export async function getProject(id: string) {
  return unwrap(await supabase.from('projects').select(SELECT).eq('id', id).single()) as unknown as Project;
}

export async function createProject(input: ProjectInput) {
  return unwrap(
    await supabase.from('projects').insert(clean(input)).select(SELECT).single(),
  ) as unknown as Project;
}

export async function updateProject(id: string, patch: ProjectInput & { archived_at?: string | null }) {
  return unwrap(
    await supabase.from('projects').update(clean(patch)).eq('id', id).select(SELECT).single(),
  ) as unknown as Project;
}

/** Cambia de fase. Las reglas las decide la base de datos. */
export async function changePhase(id: string, phase: ProjectPhase) {
  unwrap(await supabase.rpc('change_project_phase', { p_project: id, p_phase: phase }));
}

/** Varios subestados a la vez. Se envía la lista completa. */
export async function setSubstatuses(id: string, substatuses: string[]) {
  unwrap(await supabase.rpc('set_project_substatuses', { p_project: id, p_substatuses: substatuses }));
}

export async function setBillingStatus(id: string, status: BillingStatus) {
  unwrap(await supabase.rpc('set_billing_status', { p_project: id, p_status: status }));
}

export async function finalizeProject(id: string) {
  unwrap(await supabase.rpc('finalize_project', { p_project: id }));
}

export async function reopenProject(id: string) {
  unwrap(await supabase.rpc('reopen_project', { p_project: id }));
}

/** Convierte un presupuesto aceptado en proyecto y devuelve su id. */
export async function convertBudget(fichaId: string, name?: string): Promise<string> {
  return unwrap(
    await supabase.rpc('convert_budget_to_project', { p_ficha: fichaId, p_name: name ?? null }),
  ) as string;
}

/** Sugerencias de cambio de fase. Nunca se aplican solas. */
export async function phaseSuggestion(projectId: string) {
  const rows = unwrap(
    await supabase.from('v_phase_suggestions').select('*').eq('project_id', projectId),
  ) as PhaseSuggestion[];
  return rows[0] ?? null;
}

/** Cuántos proyectos hay en cada fase. */
export async function projectCounts() {
  // Se recorre PHASES y no una lista repetida aquí: así una fase nueva
  // entra en los contadores sin que nadie tenga que acordarse de este
  // archivo, que es justo lo que falló al añadir la visita técnica.
  const entries = await Promise.all(PHASES.map(async (phase) => {
    const { count, error } = await supabase.from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('phase', phase).is('archived_at', null);
    if (error) throw error;
    return [phase, count ?? 0] as const;
  }));
  return Object.fromEntries(entries) as Record<ProjectPhase, number>;
}

/** Proyectos de un cliente, para su ficha. */
export async function clientProjects(clientId: string) {
  return unwrap(
    await supabase.from('projects')
      .select('id, code, name, phase, billing_status, budget_amount, created_at, finished_at, archived_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
  ) as Pick<Project, 'id' | 'code' | 'name' | 'phase' | 'billing_status' | 'budget_amount' | 'created_at' | 'finished_at' | 'archived_at'>[];
}

/** El proyecto que salió de un presupuesto, si ya se convirtió. */
export async function projectFromFicha(fichaId: string) {
  return unwrap(
    await supabase.from('projects').select('id, code, name').eq('source_ficha_id', fichaId).maybeSingle(),
  ) as { id: string; code: string; name: string } | null;
}

/**
 * ELIMINAR un proyecto con sus documentos, órdenes y materiales.
 * La base de datos se niega si tiene cobros u horas ya validadas: eso es
 * dinero y producción de verdad, y no se borra en silencio.
 */
export async function deleteProject(id: string) {
  return unwrap(await supabase.rpc('delete_project', { p_project: id })) as unknown as {
    ok: boolean; code: string; documentos: number; ordenes: number; partes_desvinculados: number;
  };
}

// ---------------------------------------------------------------------
// LOS PRODUCTOS DE UN PROYECTO
//
// Un proyecto puede ser varias piezas. Dos cosas que conviene saber
// antes de tocar esto:
//
//   · la LECTURA lleva respaldo. Un proyecto que todavía no tenga
//     productos guardados devuelve UNO construido con sus columnas de
//     siempre, marcado «heredado». Así ningún proyecto se queda en
//     blanco mientras no se migre nada;
//   · el GUARDADO manda la lista COMPLETA, como en el resto de la
//     aplicación, y tiene que quedar al menos un producto. Además copia
//     el primero a las columnas del proyecto, porque el móvil del
//     trabajador y los informes leen por ahí.
// ---------------------------------------------------------------------

/** Los productos de un proyecto, en orden. Nunca devuelve una lista vacía. */
export async function projectProducts(projectId: string) {
  return unwrap(await supabase.from('project_product_list').select('*')
    .eq('project_id', projectId)
    .order('posicion')) as ProjectProduct[];
}

/**
 * Pone los productos de un proyecto. Se manda la lista completa.
 *
 * Los bloques que queden enteros en blanco los descarta la base de
 * datos, así que no hace falta limpiarlos aquí. Lo que no acepta es
 * quedarse sin ninguno.
 */
export async function saveProjectProducts(projectId: string, products: ProjectProductDraft[]) {
  return unwrap(await supabase.rpc('save_project_products', {
    p_project: projectId,
    p_products: products,
  })) as ProjectProduct[];
}

/** Los productos como los ve un trabajador asignado: sin nada económico. */
export async function workerProjectProducts(projectId: string) {
  return unwrap(await supabase.from('worker_project_products').select('*')
    .eq('project_id', projectId)
    .order('posicion')) as ProjectProduct[];
}

/**
 * CORREGIR EL CLIENTE de un proyecto.
 *
 * Como en las fichas: por su propia función, para que el historial lo
 * cuente con nombres y para que no se quede una persona de contacto de
 * otra empresa. El presupuesto del que venga el proyecto NO se toca.
 */
export async function setProjectClient(projectId: string, clientId: string) {
  unwrap(await supabase.rpc('set_project_client', {
    p_project: projectId, p_client: clientId,
  }));
}
