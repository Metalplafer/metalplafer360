import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isConfigured } from '@/config/env';

/**
 * Cliente único de Supabase.
 * persistSession + autoRefreshToken mantienen la sesión iniciada aunque
 * se cierre el navegador, que es lo que necesitan los trabajadores.
 */
export const supabase: SupabaseClient = createClient(
  isConfigured ? env.supabaseUrl : 'https://no-configurado.supabase.co',
  isConfigured ? env.supabaseAnonKey : 'clave-no-configurada',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'm360-auth',
    },
  },
);

/** Lanza el error si lo hay y devuelve los datos ya tipados. */
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
