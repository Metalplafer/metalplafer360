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
  /** Días laborables libres entre proyectos en la planificación. */
  gap_days: number;
  /**
   * CUÁNTO ESPACIO HAY CONTRATADO · declarado A MANO.
   *
   * El límite del plan vive en la facturación de Supabase y no se puede
   * consultar desde la base de datos, así que se escribe una vez y se
   * deja claro en pantalla que es un dato declarado.
   *
   * «null» significa SIN DECLARAR, no «sin límite»: mientras lo esté, no
   * se pinta ningún porcentaje ni ninguna barra.
   */
  storage_quota_mb: number | null;
  db_quota_mb: number | null;
  /** El día en que se comprobaron esas cifras, para saber si están viejas. */
  quota_checked_on: string | null;
  /** De dónde salieron: el plan, quién lo miró, lo que haga falta recordar. */
  quota_note: string | null;
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

/**
 * FASE 3.2 · EL CLIENTE CON SU ACTIVIDAD Y SUS CUENTAS.
 *
 * Es la vista «client_overview», que lo trae todo junto para que la
 * pantalla no tenga que incrustar nada ni hacer cuentas.
 *
 * Qué es cada importe (lo define la vista, no la pantalla):
 *   · presupuestado      presupuestos de sus proyectos + costes extra
 *                        de sus obras. NO incluye los importes de los
 *                        presupuestos sin convertir, para no contar lo
 *                        mismo dos veces.
 *   · facturado          lo facturado de verdad, marcado a mano.
 *   · cobrado            los cobros no anulados.
 *   · pendiente_facturar presupuestado − facturado.
 *   · pendiente_cobrar   facturado − cobrado (lo facturado que aún no
 *                        ha entrado).
 *
 * Lo ARCHIVADO no cuenta en ninguno de los cinco.
 */
export interface ClientOverview extends Omit<Client, 'created_by'> {
  budgets: number;
  visits: number;
  notices: number;
  open_notices: number;
  last_activity: string | null;
  presupuestado: number;
  facturado: number;
  cobrado: number;
  pendiente_facturar: number;
  pendiente_cobrar: number;
  proyectos: number;
  proyectos_activos: number;
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
  /** BLOQUE 5 · correo de contacto del aviso. La aplicación no envía correos. */
  email: string | null;
  /** BLOQUE 5 · horas dedicadas al aviso, para que administración lo facture. */
  hours: number | null;
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

/**
 * Las dos únicas categorías de documentación.
 * «tecnica» la ve el trabajador asignado; «administrativa», solo
 * administración, y lo impide la base de datos, no la pantalla.
 */
export type DocScope = 'tecnica' | 'administrativa';

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
  /** Quién puede verlo. Ver DocScope. */
  scope: DocScope;
  report_id?: string | null;
  /** FASE 3.5 · La obra también puede ser dueña de un archivo. */
  work_id?: string | null;
  uploaded_by: string | null;
  deleted_at: string | null;
  created_at: string;
  uploader?: { full_name: string } | null;
}

/**
 * FASE 3.5 · UN ARCHIVO VISTO DESDE UNA OBRA.
 *
 * Es la vista «work_documents»: los archivos propios de la obra y los de
 * sus proyectos, sin duplicar ninguno. «origen_code» y «origen_name»
 * dicen de qué proyecto viene; van en blanco si el archivo es de la obra.
 */
export interface WorkDocument {
  id: string;
  work_id: string;
  project_id: string | null;
  origen_code: string | null;
  origen_name: string | null;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  category: DocCategory;
  scope: DocScope;
  uploaded_by: string | null;
  uploader_name: string | null;
  deleted_at: string | null;
  created_at: string;
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

/**
 * UN PRODUCTO DE UN PROYECTO.
 *
 * Un proyecto puede ser varias piezas: una barandilla Y dos rejas, cada
 * una con sus medidas y su acabado. Por producto va la descripción, las
 * medidas y el acabado; el nombre del proyecto, el presupuesto y las
 * horas siguen siendo del proyecto.
 */
export interface ProjectProduct {
  /** Falta cuando el producto es heredado: no existe como fila. */
  id: string | null;
  project_id: string;
  posicion: number;
  name: string | null;
  description: string | null;
  measures: string | null;
  finish: string | null;
  /**
   * TRUE cuando el proyecto no tiene productos guardados y lo que se
   * enseña viene de sus propias columnas de siempre. No es un error: es
   * lo que permite que nada dependa de migrar los datos viejos.
   */
  heredado: boolean;
}

/** Lo que se manda al guardar. Sin «id»: la lista se manda completa. */
export interface ProjectProductDraft {
  name: string;
  description: string;
  measures: string;
  finish: string;
}

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
  // BLOQUE 3 · planificación
  fab_start: string | null;
  fab_end: string | null;
  mont_start: string | null;
  mont_end: string | null;
  fab_workers: number;
  mont_workers: number;
  fab_manual: boolean;
  mont_manual: boolean;
  autoplan: boolean;
  // BLOQUE 4 · obra y facturación manual
  work_id: string | null;
  invoiced_amount: number | null;
  invoiced_on: string | null;
  work?: { id: string; code: string; name: string } | null;
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
  /**
   * El proveedor EN TEXTO. Sigue siendo la columna de siempre y la que
   * leen los informes. No se retira: hay material real que solo tiene
   * esto.
   */
  supplier: string | null;
  /** El proveedor de la lista, cuando se ha elegido uno. Puede faltar. */
  supplier_id: string | null;
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

/**
 * UN PROVEEDOR.
 *
 * No se borran: se desactivan, porque hay materiales que les apuntan y
 * borrarlos dejaría el histórico sin explicación.
 */
export interface Supplier {
  id: string;
  name: string;
  /** El nombre reducido a lo comparable. Lo calcula la base de datos. */
  name_norm: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Un proveedor propuesto para un material concreto. */
export interface SupplierSuggestion {
  id: string;
  name: string;
  phone: string | null;
  /** Si es uno de los habituales de ESE material o una propuesta general. */
  habitual: boolean;
  /** En cuántos materiales se ha usado. */
  veces: number;
}

/**
 * A QUIÉN SE PUEDE MENCIONAR en un comentario.
 *
 * La lista la decide el servidor: la administración y quien está
 * asignado a ese proyecto, aviso, orden o parte. No es la pantalla la
 * que esconde nombres.
 */
export interface MentionCandidate {
  id: string;
  full_name: string;
  role: 'admin' | 'worker';
}

/** Lo que comunica un trabajador. Nunca se convierte solo en material. */
export interface MaterialRequest {
  id: string;
  /** BLOQUE 5 · puede no haberlo: material de taller, o todavía no se sabe. */
  project_id: string | null;
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
export type CalendarKind =
  'fabricacion' | 'montaje' | 'material' | 'visita' | 'aviso' | 'otro' | 'obra';

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

// =====================================================================
// BLOQUE 1 · Proyectos, trabajadores asignados y partes de trabajo
// =====================================================================

/** Lo que ve un trabajador de un proyecto: sin importes ni facturación. */
export interface WorkerProject {
  id: string;
  code: string;
  name: string;
  description: string | null;
  measures: string | null;
  finish: string | null;
  location: string | null;
  address: string | null;
  observations: string | null;
  phase: ProjectPhase;
  no_assembly: boolean;
  budget_hours_fab: number;
  budget_hours_mont: number;
  client_id: string | null;
  client_name: string | null;
  archived_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  // BLOQUE 5 · las fechas planificadas. Son fechas, no dinero: así el
  // trabajador sabe qué le toca antes.
  fab_start: string | null;
  fab_end: string | null;
  mont_start: string | null;
  mont_end: string | null;
  fab_workers: number;
  mont_workers: number;
  /** La primera fecha que le afecta. Sirve para ordenar. */
  proximo: string | null;
}

export interface ProjectTeamRow {
  project_id: string;
  worker_id: string;
  full_name: string;
  role: UserRole;
}

/**
 * UN AVISO DE CLIENTE TAL COMO LO VE SU TRABAJADOR.
 *
 * Sale de la vista «worker_avisos», que es el equivalente de
 * «worker_projects» para los avisos: trae el trabajo y el contacto, y NO
 * trae el importe. El dinero del aviso es de administración.
 */
export interface WorkerAviso {
  id: string;
  code: string;
  status: string;
  title: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  client_id: string | null;
  client_name: string | null;
  assigned_to: string | null;
  /** Cuántos partes he rellenado yo de este aviso. */
  mis_partes: number;
  created_at: string;
  updated_at: string;
}

/** Quién va en un aviso. Sin teléfono ni correo: solo el nombre y el rol. */
export interface FichaTeamRow {
  ficha_id: string;
  worker_id: string;
  full_name: string;
  role: UserRole;
  assigned_at: string;
  /** El responsable de la ficha («assigned_to»), frente a su equipo. */
  es_responsable: boolean;
}

/**
 * UN ACOMPAÑANTE EN EL TRABAJO DE UN PARTE.
 *
 * Son LOS DEMÁS, no el autor: el autor está en «work_reports» con sus
 * horas, y la base de datos impide que esté también aquí. Así sus horas
 * no se pueden contar dos veces.
 */
export interface WorkReportWorker {
  report_id: string;
  worker_id: string;
  /** Las horas reales de ESTA persona en este trabajo. */
  hours: number;
  added_at: string;
  added_by: string | null;
  is_demo: boolean;
}

/** Quién estuvo en el trabajo de un parte y cuántas horas puso cada uno. */
export interface ReportTeamRow {
  report_id: string;
  worker_id: string;
  full_name: string;
  hours: number | null;
  /** Quien rellenó el parte, frente a quienes le acompañaron. */
  es_autor: boolean;
  added_at: string;
}

export type ReportStatus = 'borrador' | 'enviado' | 'validado' | 'rechazado';

/** Un parte de trabajo. Las horas son SIEMPRE de quien lo firma. */
export interface WorkReport {
  id: string;
  code: string;
  worker_id: string;
  project_id: string | null;
  /**
   * El AVISO DE CLIENTE del que es este parte, si lo es. Un parte cuelga
   * de un proyecto, de un aviso o de nada: nunca de los dos a la vez, y
   * eso lo impone la base de datos.
   */
  ficha_id: string | null;
  work_type: OrderType;
  work_date: string;
  work_done: string | null;
  hours: number | null;
  needs_material: boolean;
  status: ReportStatus;
  submitted_at: string | null;
  validated_at: string | null;
  validated_by: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  worker?: Pick<Profile, 'id' | 'full_name'> | null;
  project?: Pick<Project, 'id' | 'code' | 'name'> | null;
  ficha?: Pick<Ficha, 'id' | 'code' | 'title' | 'type'> | null;
}

/** Previstas contra realizadas. Solo cuentan las horas ya validadas. */
export interface ProjectHours {
  project_id: string;
  previstas_fab: number;
  previstas_mont: number;
  previstas_total: number;
  realizadas_fab: number;
  realizadas_mont: number;
  realizadas_total: number;
}

export interface ProjectReports {
  project_id: string;
  total: number;
  por_validar: number;
  validados: number;
  rechazados: number;
  horas_validadas: number;
}

// =====================================================================
// BLOQUE 5 · La visita o el aviso tal como los ve un trabajador
// =====================================================================

/** Como «Ficha», pero SIN importe: el dinero es de administración. */
export interface WorkerFicha {
  id: string;
  code: string;
  type: FichaType;
  status: string;
  title: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  hours: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  assigned_to: string | null;
  client_id: string | null;
  client_name: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

// =====================================================================
// BLOQUE 4 · Obras
// =====================================================================

/** Una obra agrupa varios proyectos. Su dinero es de administración. */
export interface Work {
  id: string;
  code: string;
  name: string;
  client_id: string | null;
  address: string | null;
  description: string | null;
  observations: string | null;
  /**
   * FASE 1.3 · El periodo propio de la obra en el calendario.
   * En blanco, la obra ocupa del primer día al último de sus proyectos,
   * que es como funcionaba antes de tener estas dos fechas.
   */
  cal_start: string | null;
  cal_end: string | null;
  archived_at: string | null;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  client?: Pick<Client, 'id' | 'name'> | null;
}

/** Un coste extra de la obra: transporte, trabajos añadidos, etc. */
export interface WorkExtra {
  id: string;
  work_id: string;
  concept: string;
  amount: number;
  notes: string | null;
  /**
   * FASE 3.4 · Si ya está facturado. Se marca a mano: guardar el coste
   * NO lo factura. Solo los marcados entran en el facturado de la obra.
   */
  invoiced: boolean;
  invoiced_on: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Las cuentas de la obra: proyectos + extras, facturado y pendiente.
 * «facturado» incluye los costes extra marcados como facturados, y solo
 * esos; «extras_facturados» y «extras_pendientes» los desglosan.
 */
export interface WorkSummary {
  work_id: string;
  code: string;
  name: string;
  proyectos: number;
  proyectos_activos: number;
  proyectos_finalizados: number;
  total_proyectos: number;
  extras: number;
  total_estimado: number;
  facturado: number;
  pendiente_facturar: number;
  cobrado: number;
  material_pendiente: number;
  desde: string | null;
  hasta: string | null;
  extras_facturados: number;
  extras_pendientes: number;
}
