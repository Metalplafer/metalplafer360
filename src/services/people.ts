import { supabase, unwrap } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types/db';

/** Personas a las que se puede asignar una ficha. */
export async function listPeople(role?: UserRole) {
  let q = supabase.from('profiles').select('id, full_name, role').eq('active', true).order('full_name');
  if (role) q = q.eq('role', role);
  return unwrap(await q) as Pick<Profile, 'id' | 'full_name' | 'role'>[];
}

/**
 * ELIMINAR a un trabajador de verdad.
 *
 * La base de datos se niega si tiene trabajo registrado (partes, horas u
 * órdenes) y explica qué tiene: ese trabajo es el registro de producción
 * de la empresa y borrarlo cambiaría los totales sin que nadie se entere.
 * En ese caso la salida correcta es desactivarlo.
 */
export async function deleteWorker(id: string) {
  return unwrap(await supabase.rpc('delete_worker', { p_user: id })) as unknown as {
    ok: boolean; nombre: string; borradores_eliminados: number;
  };
}
