import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isConfigured } from '@/config/env';
import { cuentaComoActividad, tocaMarcar } from '@/lib/actividad';

/**
 * ÚLTIMA ACTIVIDAD · DÓNDE SE ENGANCHA
 *
 * Aquí, y no en cada pantalla. Toda escritura de la aplicación pasa por
 * este cliente —«insert», «update», «delete» y las funciones de la base
 * de datos—, así que envolviendo su «fetch» se apuntan TODAS sin tocar
 * ni un componente ni ningún servicio. Las reglas de qué cuenta están en
 * «lib/actividad.ts».
 *
 * La navegación se apunta aparte, desde los dos «layouts», porque leer
 * no es actividad por sí solo: un refresco automático también lee.
 */
let ultimaActividad: number | null = null;
let marcando = false;

/**
 * Apunta que quien usa la aplicación sigue ahí.
 *
 * No espera a nadie y no devuelve nada: si falla, se traga el error. Que
 * no se pueda apuntar la actividad NO puede estropear lo que la persona
 * estaba haciendo, y el último valor bien guardado se queda como estaba,
 * porque una escritura que no ocurre no borra la anterior.
 */
export function registraActividad(ahora: number = Date.now()): void {
  if (marcando || !tocaMarcar(ultimaActividad, ahora)) return;
  // Se apunta ANTES de llamar: si la llamada falla, no se reintenta en
  // bucle contra un servidor que ya ha dicho que no.
  ultimaActividad = ahora;
  marcando = true;
  void (async () => {
    try {
      await supabase.rpc('touch_activity');
    } catch {
      /* Que no se pueda apuntar no es asunto de quien está usando la
         aplicación: se calla y se sigue. */
    } finally {
      marcando = false;
    }
  })();
}

/** Al cerrar sesión: la siguiente persona que entre empieza de cero. */
export function olvidaActividad(): void {
  ultimaActividad = null;
}

/**
 * El «fetch» del cliente, con el apunte de actividad encima.
 *
 * La petición sale igual pase lo que pase: el apunte va en un «try» y
 * después de lanzarla, nunca antes y nunca bloqueándola.
 */
const fetchConActividad: typeof fetch = (input, init) => {
  const respuesta = fetch(input, init);
  try {
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : (input as Request).url;
    const metodo = init?.method ?? (input as Request)?.method;
    if (cuentaComoActividad(url, metodo)) registraActividad();
  } catch { /* el apunte nunca estorba a la petición */ }
  return respuesta;
};

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
    global: { fetch: fetchConActividad },
  },
);

/** Lanza el error si lo hay y devuelve los datos ya tipados. */
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
