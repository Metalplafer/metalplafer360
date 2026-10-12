import {
  BarChart3, Boxes, Building2, CalendarDays, ClipboardList, FileStack, FileText, FolderKanban,
  HardHat, Home, LayoutDashboard, Receipt, Settings, Siren, UserRound, Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Si está definido, el módulo todavía no está construido (fases siguientes). */
  pending?: { intro: string; points: string[] };
}

/**
 * MENÚ DE ADMINISTRACIÓN.
 * Las secciones con «pending» todavía no están construidas: muestran una
 * pantalla que explica qué contendrán. Se van completando por fases.
 */
export const ADMIN_NAV: NavItem[] = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { path: '/admin/fichas', label: 'Fichas', icon: FileStack },
  { path: '/admin/obras', label: 'Obras', icon: HardHat },
  { path: '/admin/proyectos', label: 'Proyectos', icon: FolderKanban },
  { path: '/admin/partes', label: 'Partes de trabajo', icon: FileText },
  { path: '/admin/ordenes', label: 'Órdenes de trabajo', icon: ClipboardList },
  { path: '/admin/material', label: 'Material pendiente', icon: Boxes },
  { path: '/admin/calendario', label: 'Calendario', icon: CalendarDays },
  { path: '/admin/avisos', label: 'Avisos', icon: Siren },
  { path: '/admin/clientes', label: 'Clientes', icon: Building2 },
  { path: '/admin/trabajadores', label: 'Trabajadores', icon: Users },
  { path: '/admin/facturacion', label: 'Facturación', icon: Receipt },
  { path: '/admin/informes', label: 'Informes', icon: BarChart3 },
  { path: '/admin/configuracion', label: 'Configuración', icon: Settings },
];

/**
 * MENÚ DEL TRABAJADOR · pensado para el móvil.
 */
export const WORKER_NAV: NavItem[] = [
  { path: '/t', label: 'Inicio', icon: Home, end: true },
  { path: '/t/proyectos', label: 'Proyectos', icon: FolderKanban },
  { path: '/t/partes', label: 'Mis partes', icon: ClipboardList },
  { path: '/t/calendario', label: 'Calendario', icon: CalendarDays },
  { path: '/t/perfil', label: 'Perfil', icon: UserRound },
];
