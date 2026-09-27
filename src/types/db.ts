/** Tipos que reflejan las tablas reales de la base de datos. */

export type UserRole = 'admin' | 'worker';

export interface Profile {
  id: string;
  full_name: string;
  username: string | null;
  email: string | null;
  role: UserRole;
  phone: string | null;
  active: boolean;
  preferences: Record<string, unknown>;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  id: number;
  company: Record<string, string>;
  max_file_mb: number;
  backup_retention_days: number;
  /** Ajustes del backup automático. Las credenciales de Google NO están aquí. */
  backup: Record<string, unknown>;
  updated_at: string;
}

export interface AuditRow {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_code: string | null;
  summary: string;
  details: Record<string, unknown>;
}

/** Lo que devuelve la función client_config() para cualquier usuario activo. */
export interface ClientConfig {
  max_file_mb?: number;
  company_name?: string;
}

// ---------------------------------------------------------------------
// FASE 2 · Clientes y fichas
// ---------------------------------------------------------------------

export type ClientKind = 'empresa' | 'particular';
export type FichaType = 'presupuesto' | 'visita' | 'aviso';
export type DocCategory = 'documento' | 'foto' | 'video' | 'firma';

export interface Client {
  id: string;
  kind: ClientKind;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  notes: string | null;
  active: boolean;
  archived_at: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientContact {
  id: string;
  /** Los contactos se archivan, nunca se borran. */
  archived_at?: string | null;
  client_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
}

/** Lo que devuelve la búsqueda de clientes parecidos: solo datos generales. */
export interface ClientSuggestion {
  id: string;
  name: string;
  tax_id: string | null;
  kind: ClientKind;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  score: number;
}

export interface ClientActivity {
  client_id: string;
  budgets: number;
  visits: number;
  notices: number;
  open_notices: number;
  last_activity: string | null;
}

export interface Ficha {
  id: string;
  code: string;
  type: FichaType;
  status: string;
  client_id: string | null;
  contact_id: string | null;
  title: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  assigned_to: string | null;
  amount: number | null;
  archived_at: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  client?: Pick<Client, 'id' | 'name' | 'phone' | 'kind'> | null;
  contact?: Pick<ClientContact, 'id' | 'name' | 'phone'> | null;
  assignee?: Pick<Profile, 'id' | 'full_name'> | null;
}

export interface DocumentRow {
  id: string;
  ficha_id: string | null;
  project_id?: string | null;
  order_id?: string | null;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  category: DocCategory;
  uploaded_by: string | null;
  deleted_at: string | null;
  created_at: string;
  uploader?: { full_name: string } | null;
}

export interface CommentRow {
  id: string;
  ficha_id: string | null;
  author_id: string | null;
  body: string;
  created_at: string;
  author?: { full_name: string; role: UserRole } | null;
}

// ---------------------------------------------------------------------
// FASE 3 · Proyectos
// ---------------------------------------------------------------------

export type ProjectPhase = 'preparacion' | 'fabricacion' | 'montaje' | 'facturacion' | 'finalizado';
export type BillingStatus = 'por_facturar' | 'pendiente_cobro' | 'cobrado_parcial' | 'cobrado';

export interface Project {
  id: string;
  code: string;
  client_id: string;
  contact_id: string | null;
  source_ficha_id: string | null;
  name: string;
  description: string | null;
  measures: string | null;
  finish: string | null;
  location: string | null;
  address: string | null;
  observations: string | null;
  budget_amount: number | null;
  advance_amount: number | null;
  budget_hours_fab: number;
  budget_hours_mont: number;
  phase: ProjectPhase;
  no_assembly: boolean;
  billing_status: BillingStatus;
  finished_at: string | null;
  archived_at: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  client?: Pick<Client, 'id' | 'name' | 'phone' | 'kind' | 'address'> | null;
  contact?: Pick<ClientContact, 'id' | 'name' | 'phone'> | null;
  source?: Pick<Ficha, 'id' | 'code'> | null;
  substatuses?: { phase: ProjectPhase; substatus: string }[];
}

export interface PhaseSuggestion {
  project_id: string;
  code: string;
  name: string;
  phase: ProjectPhase;
  suggested_phase: ProjectPhase;
  message: string;
}

export interface ClientProjects {
  client_id: string;
  total: number;
  en_curso: number;
  finalizados: number;
}

// ---------------------------------------------------------------------
// FASE 4 · Órdenes de trabajo y área del trabajador
// ---------------------------------------------------------------------

export type OrderType = 'fabricacion' | 'montaje';

/** «realizada» significa «Realizada · pendiente de revisión». */
export type OrderStatus = 'pendiente' | 'en_curso' | 'realizada' | 'validada' | 'devuelta';

export type NotificationKind =
  | 'orden_asignada' | 'orden_enviada' | 'devolucion' | 'validacion' | 'comentario'
  | 'material_solicitado' | 'material_retrasado';

export interface WorkOrder {
  id: string;
  code: string;
  project_id: string;
  type: OrderType;
  scheduled_date: string;
  description: string;
  planned_hours: number;
  admin_notes: string | null;
  status: OrderStatus;
  submitted_at: string | null;
  validated_at: string | null;
  validated_by: string | null;
  returned_at: string | null;
  return_reason: string | null;
  archived_at: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  project?: (Pick<Project, 'id' | 'code' | 'name' | 'address' | 'phase' | 'measures' | 'finish' | 'location'> & {
    client?: Pick<Client, 'id' | 'name' | 'phone'> | null;
  }) | null;
  validator?: { full_name: string } | null;
}

/** El parte de una persona: su trabajo realizado y sus horas. */
export interface OrderPart {
  order_id: string;
  worker_id: string;
  work_done: string | null;
  hours: number | null;
  submitted_at: string | null;
  assigned_at: string;
  updated_at: string;
  worker?: Pick<Profile, 'id' | 'full_name'> | null;
}

/** Nombres del equipo de una orden, sin las horas de cada uno. */
export interface OrderTeamRow {
  order_id: string;
  worker_id: string;
  full_name: string;
  submitted: boolean;
}

export interface OrderHours {
  order_id: string;
  horas_reales: number;
  trabajadores: number;
  partes_enviados: number;
}

export interface ProjectOrders {
  project_id: string;
  total: number;
  por_revisar: number;
  validadas: number;
  horas_previstas: number;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  order_id: string | null;
  read_at: string | null;
  created_at: string;
}


// ---------------------------------------------------------------------
// FASE 5 · Material, calendario y cobros
// ---------------------------------------------------------------------

export type RequestStatus = 'pendiente' | 'aceptada' | 'descartada';

export interface Material {
  id: string;
  project_id: string;
  order_id: string | null;
  name: string;
  units: number | null;
  supplier: string | null;
  ordered_on: string | null;
  expected_on: string | null;
  received: boolean;
  notes: string | null;
  archived_at: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  project?: Pick<Project, 'id' | 'code' | 'name'> | null;
  order?: Pick<WorkOrder, 'id' | 'code'> | null;
}

/** Lo que comunica un trabajador. Nunca se convierte solo en material. */
export interface MaterialRequest {
  id: string;
  project_id: string;
  order_id: string | null;
  worker_id: string;
  body: string;
  status: RequestStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  material_id: string | null;
  created_at: string;
  worker?: Pick<Profile, 'id' | 'full_name'> | null;
  project?: Pick<Project, 'id' | 'code' | 'name'> | null;
  order?: Pick<WorkOrder, 'id' | 'code'> | null;
}

export interface Payment {
  id: string;
  project_id: string;
  amount: number;
  paid_on: string;
  notes: string | null;
  created_at: string;
  /** Un cobro apuntado por error se anula: se queda a la vista, tachado. */
  voided_at: string | null;
  voided_by: string | null;
}

export interface ProjectBilling {
  project_id: string;
  total: number;
  cobrado: number;
  pendiente: number;
  cobros: number;
}

export interface ProjectMaterials {
  project_id: string;
  total: number;
  pendientes: number;
  retrasados: number;
}

/** Tipos de evento del calendario. El color lo da el tipo, no la persona. */
export type CalendarKind = 'fabricacion' | 'montaje' | 'material' | 'visita' | 'aviso';

export interface CalendarEvent {
  kind: CalendarKind;
  id: string;
  code: string | null;
  title: string;
  detail: string | null;
  date: string;
  status: string;
  project_id: string | null;
  project_code: string | null;
  client_name: string | null;
  assigned: string[];
  movable: boolean;
}
