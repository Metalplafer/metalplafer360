import { normalizaHex } from '@/lib/colores';
import type { ClientKind, FichaType, MailStatus, ReportStatus } from '@/types/db';

export type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'steel' | 'signal';

export const CLIENT_KIND_LABEL: Record<ClientKind, string> = {
  empresa: 'Empresa',
  particular: 'Particular',
};

export const FICHA_TYPE_LABEL: Record<FichaType, string> = {
  presupuesto: 'Presupuesto',
  visita: 'Visita',
  aviso: 'Aviso',
};

export const FICHA_TYPE_PLURAL: Record<FichaType, string> = {
  presupuesto: 'Presupuestos',
  visita: 'Visitas',
  aviso: 'Avisos',
};

/** Con el artículo correcto: «Nuevo presupuesto», «Nueva visita». */
export const FICHA_NEW_LABEL: Record<FichaType, string> = {
  presupuesto: 'Nuevo presupuesto',
  visita: 'Nueva visita',
  aviso: 'Nuevo aviso',
};

export const FICHA_NEW_TITLE: Record<FichaType, string> = {
  presupuesto: 'Nuevo presupuesto',
  visita: 'Nueva visita',
  aviso: 'Nuevo aviso',
};

export const FICHA_CODE_PREFIX: Record<FichaType, string> = {
  presupuesto: 'PRES',
  visita: 'VIS',
  aviso: 'AVI',
};

/** Color del tipo de ficha en el calendario y en los listados. */
export const FICHA_TYPE_COLOR: Record<FichaType, string> = {
  presupuesto: 'var(--blue)',
  visita: 'var(--ev-visita)',
  aviso: 'var(--ev-aviso)',
};

export interface StatusDef { key: string; label: string; tone: Tone }

/**
 * Estados de cada tipo de ficha, en el orden en que ocurren.
 * Debe coincidir con la función valid_ficha_status de la base de datos.
 */
export const FICHA_STATUSES: Record<FichaType, StatusDef[]> = {
  presupuesto: [
    { key: 'por_asignar', label: 'Por asignar',             tone: 'neutral' },
    { key: 'pendiente',   label: 'Presupuesto pendiente',   tone: 'amber' },
    { key: 'avanzado',    label: 'Presupuesto avanzado',    tone: 'blue' },
    { key: 'por_revisar', label: 'Presupuesto por revisar', tone: 'signal' },
    { key: 'enviado',     label: 'Presupuesto enviado',     tone: 'violet' },
    // El cliente ya ha dicho sí, pero la paga y señal no está cobrada,
    // así que el trabajo NO empieza: este estado no se puede convertir
    // en proyecto. Lo impide la base de datos, no la pantalla.
    { key: 'pendiente_senal', label: 'Pendiente de paga y señal', tone: 'signal' },
    { key: 'aceptado',    label: 'Presupuesto aceptado',    tone: 'green' },
    { key: 'cancelado',   label: 'Presupuesto cancelado',   tone: 'steel' },
  ],
  visita: [
    { key: 'por_asignar', label: 'Por asignar', tone: 'neutral' },
    { key: 'asignada',    label: 'Asignada',    tone: 'blue' },
    { key: 'realizada',   label: 'Realizada',   tone: 'green' },
    { key: 'cancelada',   label: 'Cancelada',   tone: 'steel' },
  ],
  aviso: [
    { key: 'por_asignar', label: 'Por asignar', tone: 'neutral' },
    { key: 'pendiente',   label: 'Pendiente',   tone: 'amber' },
    { key: 'asignado',    label: 'Asignado',    tone: 'blue' },
    { key: 'en_curso',    label: 'En curso',    tone: 'violet' },
    { key: 'realizado',   label: 'Realizado',   tone: 'green' },
    { key: 'cerrado',     label: 'Cerrado',     tone: 'steel' },
  ],
};

export function fichaStatus(type: FichaType, key: string): StatusDef {
  return FICHA_STATUSES[type].find((s) => s.key === key) ?? { key, label: key, tone: 'neutral' };
}

/**
 * MEJORA 3 · LAS TRES SUBFASES DE UN PRESUPUESTO POR REVISAR.
 *
 * NO son estados del presupuesto: son en qué punto está SU REVISIÓN
 * mientras el estado es «por_revisar». Fuera de ese estado la subfase va
 * vacía, y de eso se encarga la base de datos.
 *
 * El color no es la única señal: cada etiqueta lleva su texto, para
 * quien no distinga el verde del rojo y para quien lea la pantalla en
 * voz alta.
 */
export const FICHA_REVIEWS = ['por_revisar', 'ok', 'denegado'] as const;
export type FichaReview = (typeof FICHA_REVIEWS)[number];

export const FICHA_REVIEW_LABEL: Record<FichaReview, string> = {
  por_revisar: 'Por revisar',
  ok: 'OK',
  denegado: 'Denegado',
};

export const FICHA_REVIEW_TONE: Record<FichaReview, Tone> = {
  por_revisar: 'steel',
  ok: 'green',
  denegado: 'red',
};

/**
 * MEJORA 7 · CÓMO TERMINA UN AVISO.
 *
 * No todos los avisos se facturan, así que al darlos por hechos hay que
 * decir cuál de las dos cosas es. Y después, cuando se factura, se marca.
 *
 * OJO con lo que significa «facturado» aquí: METALPLAFER360 NO emite
 * facturas ni habla con ningún programa de contabilidad. Marcarlo deja
 * constancia dentro de la aplicación y lo saca de la lista de lo que
 * falta por facturar. Nada más, y nada menos.
 */
export const AVISO_BILLINGS = ['pendiente', 'facturado', 'sin_facturacion'] as const;
export type AvisoBilling = (typeof AVISO_BILLINGS)[number];

export const AVISO_BILLING_LABEL: Record<AvisoBilling, string> = {
  pendiente: 'Pendiente de facturar',
  facturado: 'Facturado',
  sin_facturacion: 'Finalizado sin facturar',
};

export const AVISO_BILLING_TONE: Record<AvisoBilling, Tone> = {
  pendiente: 'amber',
  facturado: 'green',
  sin_facturacion: 'steel',
};

/** Estados que significan «ya no hay nada que hacer aquí». */
export const CLOSED_STATUSES = new Set(['aceptado', 'cancelado', 'realizada', 'cancelada', 'realizado', 'cerrado']);

// ---------------------------------------------------------------------
// FASE 3 · Proyectos
// ---------------------------------------------------------------------
import type { BillingStatus, ProjectPhase } from '@/types/db';

/**
 * El orden de aquí manda en toda la aplicación: el recorrido de fases
 * del proyecto, las barras del panel, los filtros del listado y el
 * indicador reducido de los listados se dibujan recorriendo esta lista.
 * Por eso «Pendiente de visita técnica» entra la PRIMERA y no hace
 * falta tocar ninguno de esos sitios.
 */
export const PHASES: ProjectPhase[] = ['pendiente_visita_tecnica', 'preparacion',
  'fabricacion', 'montaje', 'facturacion', 'finalizado'];

export const PHASE_LABEL: Record<ProjectPhase, string> = {
  pendiente_visita_tecnica: 'Pendiente de visita técnica',
  preparacion: 'En preparación',
  fabricacion: 'Fabricación',
  montaje: 'Montaje',
  facturacion: 'Facturación',
  finalizado: 'Finalizado',
};

export const PHASE_TONE: Record<ProjectPhase, Tone> = {
  // «signal» es el color que la aplicación usa para lo que espera a
  // alguien: presupuestos por revisar, pendientes de paga y señal. Un
  // proyecto esperando visita es eso mismo.
  pendiente_visita_tecnica: 'signal',
  preparacion: 'amber',
  fabricacion: 'blue',
  montaje: 'green',
  facturacion: 'violet',
  finalizado: 'steel',
};

/**
 * Subestados de cada fase. Se pueden marcar VARIOS a la vez.
 * Facturación y Finalizado no tienen: el estado de facturación va aparte.
 */
export const SUBSTATUSES: Record<ProjectPhase, { key: string; label: string }[]> = {
  // La fase de visita técnica no lleva subestados: o se ha ido a ver, o
  // no. En el servidor sale solo, porque «valid_substatus» termina en
  // «else false» para cualquier fase que no enumere.
  pendiente_visita_tecnica: [],
  preparacion: [
    // «Pendiente visita técnica» ya NO está aquí: es una fase propia
    // (migración 69). Dejarlo en los dos sitios daría dos maneras de
    // apuntar lo mismo.
    { key: 'pendiente_planos',         label: 'Pendiente planos' },
    { key: 'pendiente_material',       label: 'Pendiente material' },
    { key: 'por_empezar',              label: 'Por empezar' },
  ],
  fabricacion: [
    { key: 'en_fabricacion', label: 'En fabricación' },
    { key: 'falta_material', label: 'Falta material' },
    { key: 'lacado_zincado', label: 'Lacado-Zincado' },
    { key: 'por_finalizar',  label: 'Por finalizar' },
  ],
  montaje: [
    // «Pendiente de montaje» primero y «Pendiente de rematar» último: es
    // el recorrido real del trabajo, de lo que espera para montarse a lo
    // que ya está montado y le faltan remates.
    { key: 'pendiente_montaje',     label: 'Pendiente de montaje' },
    { key: 'en_montaje',            label: 'En montaje' },
    { key: 'falta_material',        label: 'Falta material' },
    { key: 'por_finalizar_montaje', label: 'Por finalizar montaje' },
    { key: 'pendiente_rematar',     label: 'Pendiente de rematar' },
  ],
  facturacion: [],
  finalizado: [],
};

/**
 * SUBESTADOS RETIRADOS · los que ya no se ofrecen pero pueden seguir
 * guardados en proyectos antiguos.
 *
 * «pendiente_visita_tecnica» dejó de ser un subestado para ser una fase
 * (migraciones 68 y 69). Si alguien ejecuta la 68 y decide no ejecutar
 * la 69, los proyectos que ya lo tenían siguen teniéndolo, y sin esta
 * lista la pantalla enseñaría la clave técnica en crudo:
 * «pendiente_visita_tecnica» en vez de «Pendiente visita técnica».
 *
 * No se ofrece para marcar: solo se sabe leer lo que ya estaba escrito.
 */
const SUBSTATUSES_RETIRADOS: Record<string, string> = {
  pendiente_visita_tecnica: 'Pendiente visita técnica',
};

export function substatusLabel(phase: ProjectPhase, key: string): string {
  return SUBSTATUSES[phase].find((s) => s.key === key)?.label
    ?? SUBSTATUSES_RETIRADOS[key]
    ?? key;
}

export const BILLING_STATUSES: BillingStatus[] = ['por_facturar', 'pendiente_cobro', 'cobrado_parcial', 'cobrado'];

export const BILLING_LABEL: Record<BillingStatus, string> = {
  por_facturar: 'Por facturar',
  pendiente_cobro: 'Pendiente de cobro',
  cobrado_parcial: 'Cobrado parcialmente',
  cobrado: 'Cobrado',
};

export const BILLING_TONE: Record<BillingStatus, Tone> = {
  por_facturar: 'amber',
  pendiente_cobro: 'blue',
  cobrado_parcial: 'violet',
  cobrado: 'green',
};

// ---------------------------------------------------------------------
// FASE 4 · Órdenes de trabajo
// ---------------------------------------------------------------------
import type { OrderStatus, OrderType } from '@/types/db';

export const ORDER_TYPES: OrderType[] = ['fabricacion', 'montaje'];

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  fabricacion: 'Fabricación',
  montaje: 'Montaje',
};

/** Con el artículo correcto: «Nueva orden de fabricación». */
export const ORDER_TYPE_OF: Record<OrderType, string> = {
  fabricacion: 'de fabricación',
  montaje: 'de montaje',
};

export const ORDER_STATUSES: OrderStatus[] = ['pendiente', 'en_curso', 'realizada', 'validada', 'devuelta'];

/** Debe coincidir con la función order_status_es de la base de datos. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  realizada: 'Realizada · pendiente de revisión',
  validada: 'Validada',
  devuelta: 'Devuelta',
};

/** Versión corta para las listas estrechas del móvil. */
export const ORDER_STATUS_SHORT: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  realizada: 'Pendiente de revisión',
  validada: 'Validada',
  devuelta: 'Devuelta',
};

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  pendiente: 'neutral',
  en_curso: 'blue',
  realizada: 'signal',
  validada: 'green',
  devuelta: 'red',
};

/** Estados en los que el trabajador todavía puede rellenar su parte. */
export const ORDER_OPEN_STATUSES = new Set<OrderStatus>(['pendiente', 'en_curso', 'devuelta']);

// ---------------------------------------------------------------------
// BLOQUE 1 · Partes de trabajo
// ---------------------------------------------------------------------

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  borrador: 'Sin enviar',
  enviado: 'Pendiente de validación',
  validado: 'Validado',
  rechazado: 'Rechazado',
};

/** Versión corta para las listas estrechas del móvil. */
export const REPORT_STATUS_SHORT: Record<ReportStatus, string> = {
  borrador: 'Sin enviar',
  enviado: 'Pendiente',
  validado: 'Validado',
  rechazado: 'Rechazado',
};

export const REPORT_STATUS_TONE: Record<ReportStatus, Tone> = {
  borrador: 'neutral',
  enviado: 'signal',
  validado: 'green',
  rechazado: 'red',
};

/** Estados en los que el trabajador todavía puede corregir su parte. */
export const REPORT_OPEN_STATUSES = new Set<ReportStatus>(['borrador', 'enviado', 'rechazado']);

// ---------------------------------------------------------------------
// FASE 5 · Material, calendario y cobros
// ---------------------------------------------------------------------
import type { CalendarKind, RequestStatus } from '@/types/db';

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pendiente: 'Pendiente de revisar',
  aceptada: 'Aceptada',
  descartada: 'Descartada',
};

export const REQUEST_STATUS_TONE: Record<RequestStatus, Tone> = {
  pendiente: 'signal',
  aceptada: 'green',
  descartada: 'steel',
};

/**
 * Tipos de evento del calendario.
 * El color lo da SIEMPRE el tipo de trabajo, nunca la persona asignada:
 * así se lee de un vistazo qué clase de día tiene la empresa.
 */
export const CALENDAR_KINDS: CalendarKind[] = [
  'obra', 'fabricacion', 'montaje', 'material', 'visita', 'aviso', 'otro',
];

/**
 * LO QUE VE UN TRABAJADOR EN SU CALENDARIO.
 *
 * Su trabajo y nada más: lo que fabrica, lo que monta y los avisos de
 * cliente que tiene asignados.
 *
 * Fuera quedan las VISITAS (son de administración), el MATERIAL y las
 * OBRAS (planificación y compras, que son de administración) y los
 * «OTROS» (las notas internas de administración).
 *
 * Esto es lo que se PINTA. Lo que le LLEGA ya lo decide la base de datos
 * con «v_calendar», que filtra por lo que tiene asignado: esta lista no
 * es la que guarda el secreto, solo evita enseñarle categorías que no son
 * suyas y que además le saldrían siempre vacías.
 */
export const WORKER_CALENDAR_KINDS: CalendarKind[] = ['fabricacion', 'montaje', 'aviso'];

export const CALENDAR_LABEL: Record<CalendarKind, string> = {
  fabricacion: 'Fabricación',
  montaje: 'Montaje',
  material: 'Material',
  visita: 'Visita',
  aviso: 'Aviso',
  otro: 'Otros',
  obra: 'Obras',
};

/**
 * EL COLOR DE CADA CATEGORÍA, de serie.
 *
 * MEJORA 4 · Antes esto era una lista de «var(--ev-*)», y bastaba porque
 * el color solo pintaba una rayita de 3 píxeles. Ahora se colorea la
 * PASTILLA ENTERA y hay que calcular el color del texto a partir del
 * fondo, y para eso hace falta el color de verdad y no el nombre de una
 * variable: el navegador no deja mirar dentro de un «var()» desde el
 * código sin pedirle el estilo calculado a un elemento.
 *
 * Son los MISMOS valores que las variables «--ev-*» de tokens.css, y hay
 * una prueba que lee ese archivo y comprueba que siguen coincidiendo
 * («tests/unit/colores.test.ts»): si alguien cambia la paleta en un
 * sitio y se olvida del otro, la prueba lo dice.
 *
 * Y son los de SERIE: lo que se elige en Configuración los sustituye.
 */
/*
  EN MINÚSCULAS, y no es un detalle de estilo: el selector de color del
  navegador («input type=color») devuelve siempre minúsculas, y la
  pantalla de Configuración compara el color elegido con el de serie para
  saber qué ha cambiado. Con «#1D4F91» aquí y «#1d4f91» viniendo del
  selector, esa comparación decía que los siete colores estaban
  cambiados sin haber tocado ninguno, y guardaba los siete. Lo cazó la
  prueba «De entrada están los colores de siempre».
*/
export const CALENDAR_COLOR: Record<CalendarKind, string> = {
  fabricacion: '#1d4f91',
  montaje: '#2e7d5b',
  material: '#a8660a',
  visita: '#6a4fa3',
  aviso: '#b23a2a',
  otro: '#5b6778',
  obra: '#0e7490',
};

/**
 * EL COLOR QUE DE VERDAD SE PINTA.
 *
 * MEJORA 4.2 · Los colores elegidos en Configuración llegan de la base
 * de datos («app_settings.calendar_colors»), que solo guarda los que
 * alguien ha cambiado: lo que falta son los de serie. Esta función junta
 * las dos cosas.
 *
 * Se descarta en silencio lo que no sea un color válido o una categoría
 * que exista. No es por desconfiar de la base de datos —tiene su propia
 * restricción—, es porque esto también se usa con lo que todavía se está
 * escribiendo en la pantalla de Configuración, donde un color a medio
 * teclear es lo normal.
 */
export function coloresCalendario(
  elegidos?: Record<string, string> | null,
): Record<CalendarKind, string> {
  const salida = { ...CALENDAR_COLOR };
  if (!elegidos) return salida;
  CALENDAR_KINDS.forEach((k) => {
    const v = elegidos[k];
    const hex = typeof v === 'string' ? normalizaHex(v) : null;
    if (hex) salida[k] = hex;
  });
  return salida;
}

/**
 * LAS DOS CATEGORÍAS DE PROYECTO.
 *
 * Fabricación y montaje son las dos fases del mismo trabajo, y verlas a
 * la vez es lo que dice cómo está de cargada una semana. Por eso son las
 * que salen al abrir el calendario.
 */
export const CALENDAR_PROYECTOS: CalendarKind[] = ['fabricacion', 'montaje'];

/** Lo que se ve al abrir el calendario, sin tocar nada. */
export const CALENDAR_DEFECTO: CalendarKind[] = [...CALENDAR_PROYECTOS];

/**
 * ENCENDER Y APAGAR UNA CATEGORÍA.
 *
 * MEJORA 4.3 · Antes esto era otra cosa: fabricación y montaje eran un
 * modo combinado y las demás categorías eran vistas sueltas que apagaban
 * todo lo demás. Se pidió quitarlo con estas palabras: «el usuario podrá
 * activar materiales sin desactivar fabricación… no conviertas los
 * filtros en un selector de opción única».
 *
 * Así que ahora la regla es la que se espera de una casilla:
 *
 *   · pulsar una categoría apagada la ENCIENDE;
 *   · pulsar una encendida la APAGA;
 *   · y no toca ninguna otra, nunca.
 *
 * El resultado sale SIEMPRE en el orden del calendario y no en el orden
 * en que se fueron pulsando: así la leyenda y las pastillas se leen
 * igual por la mañana y por la tarde.
 *
 * APAGARLAS TODAS SE PERMITE. Es la consecuencia de que desmarcar
 * cualquiera funcione siempre, y es reversible: el calendario explica
 * entonces que no hay ninguna categoría seleccionada y ofrece volver a
 * fabricación y montaje. Antes, la última pulsación no hacía nada, y una
 * casilla que no responde parece estropeada.
 */
export function alternarCategoria(
  actual: CalendarKind[], pulsada: CalendarKind,
): CalendarKind[] {
  const siguiente = actual.includes(pulsada)
    ? actual.filter((k) => k !== pulsada)
    : [...actual, pulsada];
  return CALENDAR_KINDS.filter((k) => siguiente.includes(k));
}

export type CalendarView = 'mes' | 'semana' | 'dia' | 'agenda';

export const CALENDAR_VIEWS: { key: CalendarView; label: string }[] = [
  { key: 'mes', label: 'Mes' },
  { key: 'semana', label: 'Semana' },
  { key: 'dia', label: 'Día' },
  { key: 'agenda', label: 'Agenda' },
];

/**
 * MEJORA 6 · LOS ESTADOS DE UNA SOLICITUD DE CORREO.
 *
 * Son los cinco que hay en la base de datos («valid_mail_status») y no
 * uno más: recepción, revisión, vinculación, error y descarte. Si
 * alguien añade uno allí sin añadirlo aquí, la pantalla lo enseñaría con
 * su nombre interno, y por eso hay una prueba que compara las dos
 * listas.
 */
export const MAIL_STATUS_LABEL: Record<MailStatus, string> = {
  pendiente: 'Sin revisar',
  revisada: 'Revisada',
  vinculada: 'Vinculada',
  error: 'Con error',
  descartada: 'Descartada',
};

export const MAIL_STATUS_TONE: Record<MailStatus, Tone> = {
  pendiente: 'signal',
  revisada: 'blue',
  vinculada: 'green',
  error: 'red',
  descartada: 'steel',
};

/** En el orden en que se miran: lo que falta por hacer, primero. */
export const MAIL_STATUSES: MailStatus[] = [
  'pendiente', 'error', 'revisada', 'vinculada', 'descartada',
];

/**
 * LO QUE ESTÁ «EN CURSO», que es lo que se enseña al abrir la bandeja.
 *
 * Son las solicitudes en las que queda algo por hacer:
 *
 *   · «pendiente»  nadie la ha mirado todavía;
 *   · «error»      llegó con algún adjunto que no se pudo guardar;
 *   · «revisada»   alguien la ha completado pero aún no la ha convertido
 *                  en presupuesto, visita o aviso.
 *
 * Y NO están las otras dos, cada una por su motivo:
 *
 *   · «vinculada»  ya se convirtió en algo: su trabajo está hecho y lo
 *                  que haya que seguir haciendo se hace en el
 *                  presupuesto o el proyecto, no aquí. Antes salía en
 *                  «En curso» y daba la sensación de que quedaba trabajo
 *                  pendiente que ya estaba hecho;
 *   · «descartada» se decidió que no era una petición.
 *
 * Las dos siguen teniendo su propia pestaña, así que no se pierde nada
 * de vista: solo dejan de contar como trabajo por hacer.
 */
export const MAIL_STATUSES_EN_CURSO: MailStatus[] = ['pendiente', 'error', 'revisada'];
