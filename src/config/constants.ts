import type { ClientKind, FichaType } from '@/types/db';

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

/** Estados que significan «ya no hay nada que hacer aquí». */
export const CLOSED_STATUSES = new Set(['aceptado', 'cancelado', 'realizada', 'cancelada', 'realizado', 'cerrado']);

// ---------------------------------------------------------------------
// FASE 3 · Proyectos
// ---------------------------------------------------------------------
import type { BillingStatus, ProjectPhase } from '@/types/db';

export const PHASES: ProjectPhase[] = ['preparacion', 'fabricacion', 'montaje', 'facturacion', 'finalizado'];

export const PHASE_LABEL: Record<ProjectPhase, string> = {
  preparacion: 'En preparación',
  fabricacion: 'Fabricación',
  montaje: 'Montaje',
  facturacion: 'Facturación',
  finalizado: 'Finalizado',
};

export const PHASE_TONE: Record<ProjectPhase, Tone> = {
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
  preparacion: [
    { key: 'pendiente_visita_tecnica', label: 'Pendiente visita técnica' },
    { key: 'pendiente_planos',         label: 'Pendiente planos' },
    { key: 'pendiente_material',       label: 'Pendiente material' },
    { key: 'por_empezar',              label: 'Por empezar' },
  ],
  fabricacion: [
    { key: 'en_fabricacion', label: 'En fabricación' },
    { key: 'falta_material', label: 'Falta material' },
    { key: 'por_finalizar',  label: 'Por finalizar' },
  ],
  montaje: [
    { key: 'en_montaje',            label: 'En montaje' },
    { key: 'falta_material',        label: 'Falta material' },
    { key: 'por_finalizar_montaje', label: 'Por finalizar montaje' },
  ],
  facturacion: [],
  finalizado: [],
};

export function substatusLabel(phase: ProjectPhase, key: string): string {
  return SUBSTATUSES[phase].find((s) => s.key === key)?.label ?? key;
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
export const CALENDAR_KINDS: CalendarKind[] = ['fabricacion', 'montaje', 'material', 'visita', 'aviso'];

export const CALENDAR_LABEL: Record<CalendarKind, string> = {
  fabricacion: 'Fabricación',
  montaje: 'Montaje',
  material: 'Material',
  visita: 'Visita',
  aviso: 'Aviso',
};

/** Se corresponden con las variables --ev-* de tokens.css. */
export const CALENDAR_COLOR: Record<CalendarKind, string> = {
  fabricacion: 'var(--ev-fabricacion)',
  montaje: 'var(--ev-montaje)',
  material: 'var(--ev-material)',
  visita: 'var(--ev-visita)',
  aviso: 'var(--ev-aviso)',
};

export type CalendarView = 'mes' | 'semana' | 'dia' | 'agenda';

export const CALENDAR_VIEWS: { key: CalendarView; label: string }[] = [
  { key: 'mes', label: 'Mes' },
  { key: 'semana', label: 'Semana' },
  { key: 'dia', label: 'Día' },
  { key: 'agenda', label: 'Agenda' },
];
