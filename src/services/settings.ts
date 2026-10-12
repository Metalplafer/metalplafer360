import { supabase, unwrap } from '@/lib/supabase';
import { Aviso } from '@/lib/errors';
import type { AppSettings, Profile, UserRole } from '@/types/db';

export interface Counter { prefix: string; year: number; last_value: number }
export interface StorageUsage {
  tipo: string; archivos: number; bytes: number; en_papelera: number; bytes_papelera: number;
}

export async function getSettings() {
  return unwrap(
    await supabase.from('app_settings').select('*').eq('id', 1).single(),
  ) as AppSettings;
}

export async function setCompany(company: Record<string, string>) {
  return unwrap(await supabase.rpc('set_company', { p_company: company })) as unknown as AppSettings;
}

export async function setBackupSettings(backup: Record<string, unknown>, retentionDays?: number) {
  return unwrap(await supabase.rpc('set_backup_settings', {
    p_backup: backup, p_retention_days: retentionDays ?? null,
  })) as unknown as AppSettings;
}

export async function setMaxFileMb(mb: number) {
  return unwrap(await supabase.rpc('set_max_file_mb', { p_mb: mb })) as unknown as AppSettings;
}

/** Preferencias de pantalla de quien ha iniciado sesión. */
export async function setPreferences(prefs: Record<string, unknown>) {
  return unwrap(await supabase.rpc('set_preferences', { p_prefs: prefs })) as Record<string, unknown>;
}

// ---------------------------------------------------------------------
// Numeración
// ---------------------------------------------------------------------

export async function listCounters() {
  return unwrap(
    await supabase.from('code_counters').select('*')
      .order('year', { ascending: false }).order('prefix'),
  ) as Counter[];
}

export async function setCounter(prefix: string, year: number, value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Aviso('El número tiene que ser un entero mayor o igual que cero.');
  }
  unwrap(await supabase.rpc('set_counter', { p_prefix: prefix, p_year: year, p_value: value }));
}

// ---------------------------------------------------------------------
// Almacenamiento
// ---------------------------------------------------------------------

export async function storageUsage() {
  return unwrap(await supabase.from('storage_usage').select('*').order('tipo')) as StorageUsage[];
}

// ---------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------

/**
 * Las personas, con sus datos de contacto. Se lee por «profiles_full»:
 * el teléfono, el correo y las preferencias no se conceden sobre la
 * tabla, y esta vista los devuelve a quien le corresponde (cada uno los
 * suyos, administración los de todos).
 */
export async function listAllPeople() {
  return unwrap(
    await supabase.from('profiles_full').select('*').order('role').order('full_name'),
  ) as Profile[];
}

/** Vuelve a leer la ficha completa después de cambiarla. */
async function readPerson(id: string) {
  return unwrap(
    await supabase.from('profiles_full').select('*').eq('id', id).single(),
  ) as Profile;
}

/** Cambiar el rol o desactivar a alguien: lo permiten las políticas de la base de datos. */
export async function setRole(id: string, role: UserRole) {
  unwrap(await supabase.from('profiles').update({ role }).eq('id', id).select('id').single());
  return readPerson(id);
}

export async function setActive(id: string, active: boolean) {
  unwrap(await supabase.from('profiles').update({ active }).eq('id', id).select('id').single());
  return readPerson(id);
}

export async function renamePerson(id: string, fullName: string, phone: string | null) {
  const name = fullName.trim();
  if (!name) throw new Aviso('El nombre no puede quedar vacío.');
  unwrap(await supabase.from('profiles')
    .update({ full_name: name, phone }).eq('id', id).select('id').single());
  return readPerson(id);
}

/**
 * Alta de un trabajador y cambio de contraseña.
 *
 * Esto NO se puede hacer desde el navegador: hace falta la clave de
 * servidor de Supabase, que jamás sale de allí. La aplicación se lo pide
 * a una función del servidor, que comprueba que quien lo pide es
 * administración antes de hacer nada.
 */
export interface NewUser {
  full_name: string;
  username: string;
  password: string;
  phone?: string;
  role?: UserRole;
}

async function callAdminUsers(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action, ...payload },
  });
  if (error) {
    throw new Aviso(
      'No se ha podido crear el usuario desde aquí. Hace falta tener publicada la función '
      + '«admin-users» en Supabase (está explicado en la guía de puesta en marcha). '
      + 'Mientras tanto, los usuarios se crean desde el panel de Supabase.',
    );
  }
  const result = data as { ok?: boolean; message?: string };
  if (result && result.ok === false) throw new Aviso(result.message ?? 'No se ha podido completar.');
  return result;
}

export async function createWorker(user: NewUser) {
  if (!user.full_name.trim()) throw new Aviso('Escribe el nombre de la persona.');
  if (!/^[a-z0-9._-]{3,30}$/i.test(user.username.trim())) {
    throw new Aviso('El usuario solo puede tener letras, números, puntos o guiones (mínimo 3).');
  }
  if (user.password.length < 8) throw new Aviso('La contraseña debe tener al menos 8 caracteres.');
  return callAdminUsers('create', {
    full_name: user.full_name.trim(),
    username: user.username.trim().toLowerCase(),
    password: user.password,
    phone: user.phone?.trim() || null,
    role: user.role ?? 'worker',
  });
}

export async function resetPassword(id: string, password: string) {
  if (password.length < 8) throw new Aviso('La contraseña debe tener al menos 8 caracteres.');
  return callAdminUsers('password', { id, password });
}

/**
 * El margen entre proyectos, en días laborables libres.
 * Vale de aquí en adelante: no mueve lo que ya esté colocado.
 */
export async function setGapDays(days: number) {
  return unwrap(await supabase.rpc('set_gap_days', { p_days: days })) as unknown as AppSettings;
}
