import { supabase, unwrap } from '@/lib/supabase';
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
