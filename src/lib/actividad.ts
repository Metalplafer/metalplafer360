/**
 * METALPLAFER360 · ÚLTIMA ACTIVIDAD · LAS REGLAS
 *
 * Qué cuenta como «usar la aplicación» y cada cuánto se apunta. Son
 * funciones puras —no tocan la red, ni la base de datos, ni el reloj— y
 * por eso se pueden probar una por una en «tests/unit/actividad.test.ts».
 *
 * La parte que sí habla con el servidor vive en «lib/supabase.ts», que
 * es donde está el cliente. Separarlas no es manía: si estas reglas
 * importaran el cliente y el cliente importara las reglas, tendríamos
 * una dependencia circular.
 *
 *
 * QUÉ CUENTA Y QUÉ NO
 *
 * Cuenta lo que hace una persona: cambiar de pantalla, abrir un
 * proyecto, crear, editar, borrar o cambiar un estado.
 *
 * NO cuenta lo que hace el programa solo:
 *
 *   · renovar el testigo de la sesión, que va a «/auth/v1/» y ocurre
 *     cada hora tenga la pestaña delante quien sea o no;
 *   · leer datos, que son peticiones GET. Leer sin haber navegado es lo
 *     que hace un refresco automático, no una persona. La navegación ya
 *     se apunta por su cuenta desde los «layouts»;
 *   · la propia llamada que apunta la actividad, que si no se excluyera
 *     se estaría llamando a sí misma.
 */

/** Cada cuánto, como mucho, se apunta la actividad de una persona. */
export const MINUTOS_ACTIVIDAD = 5;

/**
 * ¿Toca apuntar?
 *
 * El freno del navegador. Hay otro igual DENTRO de la base de datos, y
 * los dos hacen falta: este ahorra la llamada, y el de allí es el que no
 * se puede saltar abriendo otra pestaña, porque cada pestaña tiene su
 * propio «ultimo» y no sabe nada de las demás.
 */
export function tocaMarcar(
  ultimo: number | null, ahora: number, minutos = MINUTOS_ACTIVIDAD,
): boolean {
  if (!Number.isFinite(ahora)) return false;
  if (ultimo === null) return true;
  // Un reloj que va hacia atrás —cambio de hora, puesta en hora del
  // sistema— no debe dejar la actividad congelada hasta que se alcance
  // la marca anterior.
  if (ahora < ultimo) return true;
  return ahora - ultimo >= minutos * 60_000;
}

/** Los métodos con los que una persona cambia algo. */
const ESCRITURAS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function esEscritura(metodo: string | null | undefined): boolean {
  return ESCRITURAS.has((metodo ?? 'GET').toUpperCase());
}

/**
 * ¿Es una petición de datos de la aplicación?
 *
 * Solo «/rest/v1/», que es por donde van las tablas y las funciones de
 * la base de datos. Queda fuera «/auth/v1/» —la sesión, que se renueva
 * sola— y queda fuera «touch_activity», que es esta misma función
 * apuntando.
 */
export function esRutaDeDatos(url: string | null | undefined): boolean {
  const u = url ?? '';
  if (!u.includes('/rest/v1/')) return false;
  if (u.includes('touch_activity')) return false;
  return true;
}

/**
 * ¿Esta petición cuenta como actividad?
 *
 * Las dos reglas juntas, que es como se usan desde el cliente.
 */
export function cuentaComoActividad(
  url: string | null | undefined, metodo: string | null | undefined,
): boolean {
  return esRutaDeDatos(url) && esEscritura(metodo);
}
