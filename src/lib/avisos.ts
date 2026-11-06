import type { NotificationRow } from '@/types/db';

/**
 * A DÓNDE LLEVA UN AVISO.
 *
 * Un aviso guarda a qué apunta en una de sus columnas de destino. Esto
 * traduce eso a una dirección de la aplicación, y solo cuando de verdad
 * hay una pantalla a la que ir.
 *
 * DEVUELVE «null» MÁS VECES DE LAS QUE PARECE, y es a propósito:
 *
 *   · «order_id» · las órdenes de trabajo se retiraron en la fase 4 y
 *     su pantalla ya no existe. Los avisos antiguos que apuntan ahí se
 *     siguen leyendo, pero sin enlace: mandar a alguien a una pantalla
 *     que no existe es peor que no ofrecerle nada;
 *   · el material retrasado del TALLER no tiene proyecto, así que no
 *     hay a dónde ir. No es un caso raro: es una columna vacía;
 *   · y si el elemento se borró, la clave ajena se llevó el aviso por
 *     delante, así que no queda nada que enlazar.
 *
 * El orden de las comprobaciones es el de lo más concreto a lo menos:
 * si un aviso llevara parte y proyecto, el parte es lo que lo generó.
 */
export function rutaDelAviso(n: NotificationRow): string | null {
  if (n.report_id) return `/admin/partes/${n.report_id}`;
  if (n.ficha_id) return `/admin/fichas/${n.ficha_id}`;
  if (n.project_id) return `/admin/proyectos/${n.project_id}`;
  return null;
}

/**
 * Lo mismo para la zona del trabajador, que tiene sus propias
 * pantallas. Un trabajador solo recibe avisos de sus partes.
 *
 * Esto NO es lo que decide si puede entrar: de eso se encargan las
 * políticas de la base de datos y el guardián de la ruta. Esto decide
 * si se le ofrece el enlace, que es otra cosa: no se enseña un camino
 * que va a acabar en un «no tienes permiso».
 */
export function rutaDelAvisoTrabajador(n: NotificationRow): string | null {
  if (n.report_id) return `/t/partes/${n.report_id}`;
  return null;
}
