/**
 * Configuración leída de las variables de entorno (ver .env.example).
 * Estas variables son públicas por diseño: la seguridad la aplican las
 * políticas RLS de la base de datos, no el navegador.
 */
export const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  loginDomain: (import.meta.env.VITE_LOGIN_DOMAIN ?? 'metalplafer.com').trim(),
};

/** ¿Están rellenadas las variables de Supabase? */
export const isConfigured =
  Boolean(env.supabaseUrl && env.supabaseAnonKey) &&
  !env.supabaseUrl.includes('TU-PROYECTO') &&
  !env.supabaseAnonKey.startsWith('PEGA');

export const TIMEZONE = 'Europe/Madrid';
export const STORAGE_BUCKET = 'documentos';
export const DEFAULT_MAX_FILE_MB = 100;
