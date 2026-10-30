import { supabase, unwrap } from '@/lib/supabase';

/**
 * Los informes los calcula la base de datos, no la pantalla: así los
 * números salen siempre iguales y nadie puede pedir lo que no le toca.
 */

export interface DashboardData {
  periodo: { desde: string; hasta: string };
  produccion: {
    horas_fabricacion: number; horas_montaje: number; horas_totales: number;
    /**
     * Trabajos con horas en el periodo: partes Y órdenes.
     *
     * Antes se llamaba «ordenes_validadas» y contaba solo órdenes. En
     * cuanto los partes fueron la vía normal, el nombre decía una cosa
     * y la cifra significaba otra (migración 39).
     */
    trabajos_validados: number; trabajadores: number;
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
    avisos_taller: number;
    /** Solo VISITAS: son las únicas que nacen «Por asignar». */
    fichas_por_asignar: number;
    /** MEJORA 4 · Las tres categorías nuevas del bloque de atención. */
    presupuestos_por_revisar: number;
    presupuestos_pendientes: number;
    avisos_por_facturar: number;
    /** Aceptados por el cliente y SIN cobrar la señal: lo que más se olvida. */
    presupuestos_pendientes_senal: number;
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
  trabajador: string; fabricacion: number; montaje: number; total: number;
  /** Cuántos trabajos: partes y órdenes. Antes era «ordenes» (migración 39). */
  trabajos: number;
}

export interface ProjectHoursRow {
  code: string; name: string; cliente: string;
  previstas: number; fabricacion: number; montaje: number; total: number; desvio: number;
}

export interface MaterialReportRow {
  material: string; unidades: number | null; proveedor: string; proyecto: string;
  pedido: string | null; previsto: string | null; recibido: boolean; dias_retraso: number;
  /** «Pedido» o «De almacén»: lo que se compró y lo que ya teníamos. */
  origen: string;
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
