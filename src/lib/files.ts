import type { DocCategory } from '@/types/db';

/** Decide si un archivo es una foto, un vídeo o un documento. */
export function categoryFor(mime: string | undefined, name: string): DocCategory {
  const m = (mime ?? '').toLowerCase();
  if (m.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(name)) return 'foto';
  if (m.startsWith('video/') || /\.(mp4|mov|webm|m4v|3gp|avi)$/i.test(name)) return 'video';
  return 'documento';
}

/**
 * Nombre seguro para guardar en el servidor (sin acentos ni espacios).
 * El nombre original se conserva aparte, que es el que ve la persona.
 */
export function safeStorageName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 60) || 'archivo';
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : '';
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `${stamp}-${base}${ext ? '.' + ext : ''}`;
}

export function validateFileSize(file: { size: number }, maxMb: number): string | null {
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > maxMb * 1024 * 1024) return `El archivo supera el máximo de ${maxMb} MB.`;
  return null;
}
