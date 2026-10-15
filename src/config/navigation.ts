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
  // FASE 4 · Aquí estaban las «Órdenes de trabajo». El trabajo se
  // organiza con los PARTES, así que la sección antigua se retira de la
  // navegación y sus rutas de administración dejan de existir (ver
  // App.tsx). Las órdenes que haya en la base de datos NO se borran:
  // siguen saliendo, como histórico, en la ficha de su proyecto.
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
  // «Mis trabajos»: los proyectos Y los avisos de cliente asignados.
  { path: '/t/proyectos', label: 'Trabajos', icon: FolderKanban },
  { path: '/t/partes', label: 'Mis partes', icon: ClipboardList },
  { path: '/t/calendario', label: 'Calendario', icon: CalendarDays },
  { path: '/t/perfil', label: 'Perfil', icon: UserRound },
];
