import { supabase, unwrap } from '@/lib/supabase';
import type { BillingStatus, PhaseSuggestion, Project, ProjectPhase } from '@/types/db';

const SELECT =
  '*, client:clients(id, name, phone, kind, address), ' +
  'contact:client_contacts(id, name, phone), ' +
  'source:fichas!projects_source_ficha_id_fkey(id, code), ' +
  'substatuses:project_substatuses(phase, substatus)';

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
  page?: number;
  pageSize?: number;
}

export async function listProjects(f: ProjectFilters = {}) {
  const { page = 0, pageSize = 25 } = f;
  let q = supabase.from('projects').select(SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

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
  const phases: ProjectPhase[] = ['preparacion', 'fabricacion', 'montaje', 'facturacion', 'finalizado'];
  const entries = await Promise.all(phases.map(async (phase) => {
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
