/**
 * METALPLAFER360 · A QUÉ SE VINCULA UNA VISITA TÉCNICA
 *
 * MEJORA 2 · El botón «Asignar visita técnica» de un presupuesto o de un
 * proyecto abre la ficha de visita DE SIEMPRE, y le dice por la
 * dirección a qué tiene que vincularse al guardar.
 *
 * El formato va aquí, con quien lo escribe y quien lo lee juntos: si
 * estuvieran en dos pantallas distintas, cambiar uno y olvidar el otro
 * dejaría visitas sin vincular sin que nada fallara.
 */

export const DESTINOS_VISITA = ['presupuesto', 'aviso', 'proyecto'] as const;

export type DestinoVisita = (typeof DESTINOS_VISITA)[number];

export interface Vinculo { tipo: DestinoVisita; id: string }

/**
 * El identificador se comprueba por su FORMA y no exigiendo un UUID: lo
 * único que hace falta es que no traiga nada raro, porque después va
 * dentro de una llamada a la base de datos y de una dirección. Si el
 * registro no existe, la base de datos responde que no lo encuentra, que
 * es su trabajo y no el de esta función.
 */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

/** «proyecto:<id>» → el destino, o null si lo que llega no vale. */
export function parseVincular(v: string | null | undefined): Vinculo | null {
  if (!v) return null;
  const [tipo, id, ...resto] = v.split(':');
  if (resto.length) return null;
  if (!DESTINOS_VISITA.includes(tipo as DestinoVisita)) return null;
  if (!ID_VALIDO.test(id ?? '')) return null;
  return { tipo: tipo as DestinoVisita, id };
}

/** El destino, escrito para la dirección. */
export function vincularParam(tipo: DestinoVisita, id: string) {
  return `${tipo}:${id}`;
}

/** A dónde se vuelve: la ficha de origen o el proyecto. */
export function rutaDestino(v: Vinculo) {
  return v.tipo === 'proyecto' ? `/admin/proyectos/${v.id}` : `/admin/fichas/${v.id}`;
}

/**
 * MEJORA 6 · DE QUÉ SOLICITUD VIENE UNA FICHA.
 *
 * La bandeja no crea presupuestos: lleva al formulario de fichas de
 * siempre con el tipo elegido y el identificador de la solicitud en la
 * dirección. Al guardar, el formulario vincula la ficha con la
 * solicitud.
 *
 * Es el mismo mecanismo que «vincular» para las visitas técnicas, y está
 * aquí al lado por el mismo motivo: que quien lo escribe y quien lo lee
 * se vean.
 */
export function desdeSolicitud(id: string) {
  return id;
}

/** El identificador de la solicitud que viene en la dirección, o null. */
export function parseSolicitud(v: string | null | undefined): string | null {
  if (!v) return null;
  return ID_VALIDO.test(v) ? v : null;
}
