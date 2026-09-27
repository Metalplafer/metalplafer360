import { supabase, unwrap } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types/db';

/** Personas a las que se puede asignar una ficha. */
export async function listPeople(role?: UserRole) {
  let q = supabase.from('profiles').select('id, full_name, role').eq('active', true).order('full_name');
  if (role) q = q.eq('role', role);
  return unwrap(await q) as Pick<Profile, 'id' | 'full_name' | 'role'>[];
}
