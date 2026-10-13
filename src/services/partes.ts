import { supabase, unwrap } from '@/lib/supabase';
import { Aviso } from '@/lib/errors';
import type {
  OrderType, ProjectHours, ProjectReports, ProjectTeamRow, ReportStatus, WorkReport, WorkerProject,
} from '@/types/db';

/**
 * PARTES DE TRABAJO.
 *
 * Un parte es de UNA persona y lleva SUS horas: ni de la pareja, ni del
 * proyecto entero. Las horas no cuentan como realizadas hasta que
 * administración las valida.
 *
 * Nada de esto se escribe directamente contra la tabla: todo pasa por
 * las funciones de la base de datos, que son las que comprueban las
 * reglas. Aunque alguien manipule una petición, no se las salta.
 */

const SELECT =
  '*, worker:profiles!work_reports_worker_id_fkey(id, full_name), '
  + 'project:projects(id, code, name)';

// ---------------------------------------------------------------------
// LO QUE VE EL TRABAJADOR
// ---------------------------------------------------------------------

/**
 * Los proyectos en los que puede entrar.
 *
 * Se lee de «worker_projects», no de «projects»: esa vista no tiene el
 * importe, ni la paga y señal, ni la facturación. No es que se oculten
 * en la pantalla; es que no existen ahí.
 */
/**
 * Mis proyectos, ORDENADOS POR LO QUE TOCA ANTES.
 *
 * «proximo» es la primera fecha planificada del proyecto (fabricación o
 * montaje, la que caiga antes). Los que todavía no tienen fecha van al
 * final: no se sabe cuándo son, no pueden adelantar a lo que sí.
 */
export async function myProjects() {
  return unwrap(await supabase.from('worker_projects')
    .select('*')
    .is('archived_at', null)
    .order('proximo', { ascending: true, nullsFirst: false })
    .order('code', { ascending: false })) as WorkerProject[];
}

export async function workerProject(id: string) {
  return unwrap(await supabase.from('worker_projects')
    .select('*').eq('id', id).maybeSingle()) as WorkerProject | null;
}

/** Con quién comparte el trabajo. Solo nombres. */
export async function projectTeam(projectId: string) {
  return unwrap(await supabase.from('project_team')
    .select('*').eq('project_id', projectId)
    .order('full_name')) as ProjectTeamRow[];
}

// ---------------------------------------------------------------------
// PARTES
// ---------------------------------------------------------------------

export interface ReportFilters {
  status?: ReportStatus | 'pendientes' | 'mios_abiertos';
  projectId?: string;
  workerId?: string;
  withoutProject?: boolean;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listReports(f: ReportFilters = {}) {
  const page = f.page ?? 1;
  const size = f.pageSize ?? 25;
  let q = supabase.from('work_reports').select(SELECT, { count: 'exact' });

  if (f.status === 'pendientes') q = q.eq('status', 'enviado');
  else if (f.status === 'mios_abiertos') q = q.in('status', ['borrador', 'rechazado']);
  else if (f.status) q = q.eq('status', f.status);

  if (f.projectId) q = q.eq('project_id', f.projectId);
  if (f.workerId) q = q.eq('worker_id', f.workerId);
  if (f.withoutProject) q = q.is('project_id', null);
  if (f.from) q = q.gte('work_date', f.from);
  if (f.to) q = q.lte('work_date', f.to);

  const { data, count } = await q
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * size, page * size - 1)
    .throwOnError();

  return { rows: (data ?? []) as unknown as WorkReport[], total: count ?? 0 };
}

export async function getReport(id: string) {
  return unwrap(await supabase.from('work_reports')
    .select(SELECT).eq('id', id).single()) as unknown as WorkReport;
}

export interface SaveReportInput {
  id?: string | null;
  projectId?: string | null;
  workType: OrderType;
  workDate?: string | null;
  workDone?: string | null;
  hours?: number | null;
  needsMaterial?: boolean;
  submit?: boolean;
}

/** Guardar (sin enviar) o enviar a validar. Lo usa el trabajador. */
export async function saveReport(input: SaveReportInput) {
  return unwrap(await supabase.rpc('save_work_report', {
    p_report: input.id ?? null,
    p_project: input.projectId ?? null,
    p_work_type: input.workType,
    p_work_date: input.workDate ?? null,
    p_work_done: input.workDone ?? null,
    p_hours: input.hours ?? null,
    p_needs_material: input.needsMaterial ?? false,
    p_submit: input.submit ?? false,
  })) as unknown as WorkReport;
}

// ---------------------------------------------------------------------
// REVISIÓN (administración)
// ---------------------------------------------------------------------

export async function validateReport(id: string) {
  return unwrap(await supabase.rpc('validate_work_report', { p_report: id })) as unknown as WorkReport;
}

export async function rejectReport(id: string, reason: string) {
  return unwrap(await supabase.rpc('reject_work_report', {
    p_report: id, p_reason: reason,
  })) as unknown as WorkReport;
}

export async function assignReportToProject(id: string, projectId: string | null) {
  return unwrap(await supabase.rpc('assign_report_to_project', {
    p_report: id, p_project: projectId,
  })) as unknown as WorkReport;
}

/**
 * ELIMINAR UN PARTE DE TRABAJO · solo administración.
 *
 * Para los creados por error o durante las pruebas. La comprobación de
 * quién puede hacerlo está en la base de datos, no aquí: «work_reports»
 * tiene retirado el permiso de borrar para quien tiene sesión, y la
 * función empieza por «assert_admin». Un trabajador que llame a este
 * servicio a mano recibe un «no tienes permisos».
 *
 * Un parte VALIDADO no se elimina: sus horas cuentan como trabajo
 * realizado. La base de datos lo rechaza y explica que hay que
 * rechazarlo primero.
 *
 * Devuelve el recuento de lo que se ha ido con él, para poder decírselo
 * a quien lo ha borrado.
 */
export interface ReportDeletion {
  ok: boolean;
  code: string;
  documentos: number;
  firmas: number;
  comentarios: number;
  avisos: number;
  proyecto: string | null;
}

export async function deleteReport(id: string) {
  const r = unwrap(
    await supabase.rpc('delete_work_report', { p_report: id }),
  ) as unknown as ReportDeletion | null;

  // Se confirma contra lo que ha devuelto la base de datos antes de
  // decirle a nadie que el parte ya no está.
  if (!r?.ok) {
    throw new Aviso('El parte no se ha eliminado. Vuelve a cargar la pantalla '
      + 'y compruébalo antes de darlo por bueno.');
  }
  return r;
}

/** Asignar trabajadores a un proyecto. Se manda la lista completa. */
export async function assignProjectWorkers(projectId: string, workerIds: string[]) {
  return unwrap(await supabase.rpc('assign_project_workers', {
    p_project: projectId, p_workers: workerIds,
  }));
}

// ---------------------------------------------------------------------
// HORAS
// ---------------------------------------------------------------------

/** Previstas contra realizadas. Solo cuenta lo validado. */
export async function projectHours(projectId: string) {
  return unwrap(await supabase.from('project_hours')
    .select('*').eq('project_id', projectId).maybeSingle()) as ProjectHours | null;
}

export async function projectReportSummary(projectId: string) {
  return unwrap(await supabase.from('project_reports')
    .select('*').eq('project_id', projectId).maybeSingle()) as ProjectReports | null;
}
