import { supabase, unwrap } from '@/lib/supabase';
import type { SearchHit } from '@/types/db';

/**
 * EL BUSCADOR DE ADMINISTRACIÓN.
 *
 * Una sola llamada que devuelve proyectos, presupuestos y avisos ya
 * mezclados y ordenados por relevancia. El cruce con el cliente lo hace
 * la base de datos: desde aquí serían tres consultas, tres viajes y la
 * ordenación hecha a mano.
 *
 * NO filtra lo que hay en pantalla: busca en todo lo que administración
 * puede ver.
 *
 * Y la puerta está en el servidor: «search_admin» empieza por
 * «assert_admin()», así que un trabajador no saca nada aunque llame a
 * la API por su cuenta. Esconder la caja de búsqueda no protege nada.
 */
export async function buscar(texto: string, limite = 20) {
  const t = texto.trim();
  // Con menos de dos letras ni se pregunta: el servidor tampoco
  // respondería, y así se evita el viaje.
  if (t.length < 2) return [] as SearchHit[];
  return unwrap(
    await supabase.rpc('search_admin', { p_text: t, p_limit: limite }),
  ) as SearchHit[];
}

/** A dónde lleva cada resultado. */
export function rutaDelResultado(h: SearchHit): string {
  if (h.tipo === 'proyecto') return `/admin/proyectos/${h.id}`;
  // Los presupuestos y los avisos son fichas: misma pantalla.
  return `/admin/fichas/${h.id}`;
}
