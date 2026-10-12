import { supabase, unwrap } from '@/lib/supabase';
import { Aviso } from '@/lib/errors';
import type { CalendarEvent, CalendarKind } from '@/types/db';

/**
 * Todo lo que tiene fecha, en una sola consulta.
 * La vista de la base de datos ya aplica los permisos: un trabajador
 * solo recibe lo suyo, sin que la pantalla tenga que filtrar nada.
 */
export async function listCalendar(from: string, to: string, opts: {
  kinds?: CalendarKind[];
  workerId?: string;
} = {}) {
  let q = supabase.from('v_calendar').select('*')
    .gte('date', from).lte('date', to)
    .order('date');

  if (opts.kinds?.length) q = q.in('kind', opts.kinds);
  if (opts.workerId) q = q.contains('assigned', [opts.workerId]);

  return unwrap(await q) as CalendarEvent[];
}

/**
 * Arrastrar una orden a otro día.
 * A propósito NO se avisa a nadie: el cambio queda en el historial y se
 * habla con el trabajador como se hable siempre.
 */
export async function moveOrder(orderId: string, date: string) {
  unwrap(
    await supabase.from('work_orders').update({ scheduled_date: date }).eq('id', orderId).select('id'),
  );
}

// =====================================================================
// BLOQUE 3 · Planificación
// =====================================================================

/**
 * Mover algo del calendario a otro día.
 *
 * Según lo que sea, va por un camino u otro. Mover a mano una fase de un
 * proyecto la marca como «puesta a mano»: desde ese momento ningún
 * cálculo automático se la vuelve a tocar. Es a propósito.
 */
export async function moveCalendarItem(e: CalendarEvent, date: string) {
  if (e.kind === 'fabricacion' || e.kind === 'montaje') {
    if (!e.project_id) throw new Aviso('Este evento no está ligado a un proyecto.');
    unwrap(await supabase.rpc('move_project_phase', {
      p_project: e.project_id, p_phase: e.kind, p_start: date,
    }));
    return;
  }
  if (e.kind === 'otro') {
    unwrap(await supabase.rpc('save_calendar_note', {
      p_id: e.id, p_day: date, p_title: e.title, p_detail: e.detail, p_project: e.project_id,
    }));
    return;
  }
  // Lo que queda del sistema anterior: las órdenes de trabajo.
  await moveOrder(e.id, date);
}

/** Planificar un proyecto: buscar el primer hueco libre. */
export async function planProject(projectId: string, phase: 'fabricacion' | 'montaje' | 'ambas' = 'ambas') {
  return unwrap(await supabase.rpc('plan_project', { p_project: projectId, p_phase: phase }));
}

/** Devolver una fase al cálculo automático y recolocarla. */
export async function releasePhase(projectId: string, phase: 'fabricacion' | 'montaje') {
  return unwrap(await supabase.rpc('release_project_phase', {
    p_project: projectId, p_phase: phase,
  }));
}

/** Cuánta gente va en una fase. Cambia la duración. */
export async function setPhaseWorkers(
  projectId: string, phase: 'fabricacion' | 'montaje', workers: number,
) {
  return unwrap(await supabase.rpc('set_phase_workers', {
    p_project: projectId, p_phase: phase, p_workers: workers,
  }));
}

// ---------------------------------------------------------------------
// Días no laborables
// ---------------------------------------------------------------------

export interface NonWorkingDay { day: string; reason: string; created_at: string }

export async function listNonWorkingDays(from: string, to: string) {
  return unwrap(await supabase.from('non_working_days').select('*')
    .gte('day', from).lte('day', to).order('day')) as NonWorkingDay[];
}

export async function setNonWorkingDay(day: string, reason = '') {
  return unwrap(await supabase.rpc('set_non_working_day', { p_day: day, p_reason: reason }));
}

export async function clearNonWorkingDay(day: string) {
  return unwrap(await supabase.rpc('clear_non_working_day', { p_day: day }));
}

// ---------------------------------------------------------------------
// «Otros»: eventos sueltos del calendario
// ---------------------------------------------------------------------

export async function saveCalendarNote(input: {
  id?: string | null; day: string; title: string; detail?: string | null;
  projectId?: string | null;
}) {
  return unwrap(await supabase.rpc('save_calendar_note', {
    p_id: input.id ?? null,
    p_day: input.day,
    p_title: input.title,
    p_detail: input.detail ?? null,
    p_project: input.projectId ?? null,
  }));
}

export async function deleteCalendarNote(id: string) {
  return unwrap(await supabase.rpc('delete_calendar_note', { p_id: id }));
}
