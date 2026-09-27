import { supabase, unwrap } from '@/lib/supabase';

/**
 * Los informes los calcula la base de datos, no la pantalla: así los
 * números salen siempre iguales y nadie puede pedir lo que no le toca.
 */

export interface DashboardData {
  periodo: { desde: string; hasta: string };
  produccion: {
    horas_fabricacion: number; horas_montaje: number; horas_totales: number;
    ordenes_validadas: number; trabajadores: number;
  };
  proyectos: {
    activos: number; creados: number; finalizados: number; dias_medio: number;
    por_fase: Record<string, number> | null;
  };
  ordenes: {
    hoy: number; pendientes: number; en_curso: number; por_revisar: number; devueltas: number;
  };
  material: { pendientes: number; retrasados: number; recibidos: number };
  alertas: {
    ordenes_atrasadas: number; ordenes_por_revisar: number; material_retrasado: number;
    avisos_taller: number; fichas_por_asignar: number; presupuestos_enviados: number;
  };
  economico: { presupuestado: number; cobrado: number; pendiente: number; por_facturar: number };
  cobrado_periodo: number;
}

export async function dashboardSummary(from: string, to: string) {
  return unwrap(
    await supabase.rpc('dashboard_summary', { p_from: from, p_to: to }),
  ) as unknown as DashboardData;
}

export interface ProjectReportRow {
  code: string; name: string; cliente: string; fase: string; estado_cobro: string;
  creado: string; finalizado: string | null; dias: number | null;
  presupuesto: number; cobrado: number; pendiente: number;
  horas_previstas: number; horas_reales: number;
}

export interface PhaseReportRow {
  fase: string; proyectos: number; presupuesto: number; horas_reales: number;
}

export interface WorkerHoursRow {
  trabajador: string; fabricacion: number; montaje: number; total: number; ordenes: number;
}

export interface ProjectHoursRow {
  code: string; name: string; cliente: string;
  previstas: number; fabricacion: number; montaje: number; total: number; desvio: number;
}

export interface MaterialReportRow {
  material: string; unidades: number | null; proveedor: string; proyecto: string;
  pedido: string | null; previsto: string | null; recibido: boolean; dias_retraso: number;
}

export interface SupplierReportRow {
  proveedor: string; pedidos: number; pendientes: number; retrasados: number; retraso_medio: number;
}

const call = async <T>(fn: string, from: string, to: string) =>
  unwrap(await supabase.rpc(fn, { p_from: from, p_to: to })) as unknown as T[];

export const reportProjects = (from: string, to: string) =>
  call<ProjectReportRow>('report_projects', from, to);

export const reportProjectsByPhase = (from: string, to: string) =>
  call<PhaseReportRow>('report_projects_by_phase', from, to);

export const reportHoursByWorker = (from: string, to: string) =>
  call<WorkerHoursRow>('report_hours_by_worker', from, to);

export const reportHoursByProject = (from: string, to: string) =>
  call<ProjectHoursRow>('report_hours_by_project', from, to);

export const reportMaterials = (from: string, to: string) =>
  call<MaterialReportRow>('report_materials', from, to);

export const reportSuppliers = (from: string, to: string) =>
  call<SupplierReportRow>('report_suppliers', from, to);
