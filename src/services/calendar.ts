import { supabase, unwrap } from '@/lib/supabase';
import { Aviso } from '@/lib/errors';
import type { CalendarEvent, CalendarKind, CalendarSpan } from '@/types/db';

/**
 * EL CALENDARIO, POR TRAMOS: una fila por periodo, con su principio y su
 * final, en lugar de una fila por día.
 *
 * La vista «v_calendar» —una fila por día— sigue existiendo en la base
 * de datos y con sus pruebas, pero la aplicación ya no la lee: desde que
 * el calendario pinta barras continuas, leerla era pedir seis filas para
 * dibujar una sola cosa.
 *
 * El filtro de fechas es de SOLAPAMIENTO, no de igualdad: un tramo que
 * empezó el mes pasado y sigue dentro de lo que se está mirando tiene
 * que salir. Pidiendo por el día —como hace «listCalendar»— eso se
 * resolvía solo, porque cada día era una fila; aquí hay que decirlo.
 */
export async function listCalendarSpans(from: string, to: string, opts: {
  kinds?: CalendarKind[];
  workerId?: string;
} = {}) {
  let q = supabase.from('v_calendar_spans').select('*')
    .lte('starts', to).gte('ends', from)
    .order('starts');

  if (opts.kinds?.length) q = q.in('kind', opts.kinds);
  if (opts.workerId) q = q.contains('assigned', [opts.workerId]);

  return unwrap(await q) as CalendarSpan[];
}

/**
 * La identidad de un TRAMO. Como la de un evento, pero con el día de
 * inicio: un proyecto tiene fabricación y montaje, y los dos llevan el
 * identificador del proyecto.
 */
export function spanUid(s: Pick<CalendarSpan, 'kind' | 'id' | 'starts'>) {
  return `${s.kind}|${s.id}|${s.starts}`;
}

/**
 * Lo que se le dice a quien ha arrastrado algo y no ha cuajado.
 *
 * Importa que la pantalla NO cante «guardado» cuando la base de datos no
 * ha cambiado nada: una fecha de taller que se cree movida y no lo está
 * manda a alguien a una obra el día que no toca.
 */
const NO_GUARDADO = 'El cambio no se ha guardado. Vuelve a cargar el calendario '
  + 'y comprueba la fecha antes de darla por buena.';

/**
 * Arrastrar una orden a otro día.
 * A propósito NO se avisa a nadie: el cambio queda en el historial y se
 * habla con el trabajador como se hable siempre.
 */
export async function moveOrder(orderId: string, date: string) {
  // «update» sin filas que tocar NO es un error para PostgREST: devuelve
  // una lista vacía y ningún error. Si RLS ha descartado la fila, hay que
  // enterarse aquí y no dejar que la pantalla diga que se ha guardado.
  const filas = unwrap(
    await supabase.from('work_orders').update({ scheduled_date: date }).eq('id', orderId)
      .select('id, scheduled_date'),
  ) as { id: string; scheduled_date: string | null }[] | null;

  if (!filas?.length || filas[0].scheduled_date !== date) throw new Aviso(NO_GUARDADO);
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
export async function moveCalendarItem(
  e: Pick<CalendarEvent, 'kind' | 'id' | 'project_id' | 'title' | 'detail'>, date: string,
) {
  if (e.kind === 'fabricacion' || e.kind === 'montaje') {
    if (!e.project_id) throw new Aviso('Este evento no está ligado a un proyecto.');

    // LA FASE QUE SE MUEVE ES «e.kind», no la que caiga. Se manda la del
    // evento que se ha arrastrado de verdad, y después se comprueba que
    // la fecha que ha quedado guardada es ESA fase y ESE día.
    const p = unwrap(await supabase.rpc('move_project_phase', {
      p_project: e.project_id, p_phase: e.kind, p_start: date,
    })) as { fab_start: string | null; mont_start: string | null } | null;

    const guardado = e.kind === 'fabricacion' ? p?.fab_start : p?.mont_start;
    if (!p || guardado !== date) throw new Aviso(NO_GUARDADO);
    return;
  }
  if (e.kind === 'otro') {
    const n = unwrap(await supabase.rpc('save_calendar_note', {
      p_id: e.id, p_day: date, p_title: e.title, p_detail: e.detail, p_project: e.project_id,
    })) as { day: string | null } | null;

    if (!n || n.day !== date) throw new Aviso(NO_GUARDADO);
    return;
  }
  // Lo que queda del sistema anterior: las órdenes de trabajo.
  await moveOrder(e.id, date);
}

/** Planificar un proyecto: buscar el primer hueco libre. */
export async function planProject(projectId: string, phase: 'fabricacion' | 'montaje' | 'ambas' = 'ambas') {
  return unwrap(await supabase.rpc('plan_project', { p_project: projectId, p_phase: phase }));
}

/**
 * FASE 1.1 · ESCRIBIR A MANO LAS FECHAS DE UNA FASE.
 *
 * Lo que se escriba se guarda tal cual. NO se comprueba disponibilidad ni
 * se bloquea por solaparse con otro proyecto: eso se pidió así.
 *
 *   · con inicio y final  → los dos tal cual, y la fase queda fijada;
 *   · solo con inicio     → el final lo calcula la base de datos con las
 *                           horas y la gente, igual que al arrastrar;
 *   · sin inicio          → la fase se queda sin fecha y vuelve al
 *                           cálculo automático.
 */
export async function setPhaseDates(
  projectId: string, phase: 'fabricacion' | 'montaje',
  start: string | null, end: string | null = null,
) {
  const p = unwrap(await supabase.rpc('set_phase_dates', {
    p_project: projectId, p_phase: phase, p_start: start, p_end: end,
  })) as { fab_start: string | null; mont_start: string | null } | null;

  // Se comprueba contra lo que ha devuelto la base de datos, no contra lo
  // que se ha enviado: así la pantalla no puede decir «guardado» sobre un
  // cambio que no ha cuajado.
  const guardado = phase === 'fabricacion' ? p?.fab_start : p?.mont_start;
  if (!p || guardado !== start) throw new Aviso(NO_GUARDADO);
  return p;
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
