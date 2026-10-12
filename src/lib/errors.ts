/**
 * Traduce los errores técnicos (Supabase, red, permisos) a mensajes
 * claros en castellano. El usuario final nunca debe ver jerga técnica.
 */
interface ErrLike {
  message?: string;
  code?: string;
  status?: number;
  statusCode?: string | number;
  name?: string;
}

/** Códigos que ya vienen con un mensaje nuestro redactado en castellano. */
const OWN_CODES = new Set(['22023', 'P0002', '23502']);

/**
 * Aviso escrito por nosotros antes de llegar al servidor (por ejemplo,
 * «Apunta las horas antes de enviar»). Se muestra tal cual.
 */
export class Aviso extends Error {
  readonly code = 'AVISO';
  constructor(message: string) {
    super(message);
    this.name = 'Aviso';
  }
}

export function toUserMessage(err: unknown): string {
  if (!err) return 'Ha ocurrido un error inesperado.';
  if (typeof err === 'string') return err;

  const e = err as ErrLike;
  const msg = (e.message ?? '').toString();
  const low = msg.toLowerCase();

  // Aviso nuestro: ya está redactado para la persona que lo va a leer.
  if (e.code === 'AVISO' && msg) return msg;

  // Conexión
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Sin conexión a Internet. Revisa la conexión y vuelve a intentarlo.';
  }
  if (low.includes('failed to fetch') || low.includes('networkerror') ||
      low.includes('load failed') || e.name === 'AuthRetryableFetchError') {
    return 'No se ha podido conectar con el servidor. Revisa la conexión y vuelve a intentarlo.';
  }

  // Acceso
  if (low.includes('invalid login credentials')) return 'Usuario o contraseña incorrectos.';
  if (low.includes('email not confirmed')) return 'Este usuario todavía no está confirmado. Contacta con administración.';
  if (low.includes('user is banned')) return 'Este usuario está desactivado. Contacta con administración.';
  if (low.includes('jwt expired') || low.includes('invalid jwt') ||
      e.code === 'PGRST301' || low.includes('refresh token')) {
    return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
  }
  if (low.includes('too many requests') || e.status === 429) {
    return 'Demasiados intentos seguidos. Espera un momento y vuelve a probar.';
  }

  // Archivos
  if (low.includes('exceeded the maximum allowed size') || e.status === 413 ||
      e.statusCode === '413' || low.includes('payload too large')) {
    return 'El archivo supera el tamaño máximo permitido.';
  }

  // Base de datos
  if (e.code && OWN_CODES.has(e.code) && msg) return msg;
  if (e.code === '42501' || low.includes('row-level security') ||
      low.includes('permission denied') || low.includes('no tienes permisos')) {
    // La base de datos usa este mismo código para dos cosas distintas:
    //   · sus propios rechazos, en inglés («permission denied for table …»),
    //     que no le dicen nada a nadie y se sustituyen;
    //   · nuestros avisos, escritos en castellano, que explican el motivo
    //     de verdad («El historial no se puede modificar ni eliminar»).
    // Tapar los segundos hacía que la pantalla dijese «no tienes permisos»
    // cuando el problema era otro, y despistaba a quien lo estaba usando.
    const esDePostgres = low.includes('permission denied')
      || low.includes('must be owner')
      || low.includes('row-level security')
      || low.includes('insufficient privilege');
    return msg && !esDePostgres ? msg : 'No tienes permisos para realizar esta acción.';
  }
  if (e.code === '23505') {
    if (low.includes('profiles_username_key')) return 'Ya existe un usuario con ese nombre.';
    return 'Ya existe un registro con esos datos.';
  }
  if (e.code === '23503') {
    // Igual que con el 42501: este código lo usan DOS cosas distintas.
    //   · PostgreSQL, en inglés, cuando una clave foránea no cuadra;
    //   · nosotros, en castellano, cuando nos negamos a borrar algo y
    //     explicamos exactamente por qué («tiene 12 partes y 40 h»).
    // Tapar el segundo dejaba al usuario sin saber qué le pasa.
    const esDePostgres = low.includes('violates foreign key constraint')
      || low.includes('is still referenced')
      || low.includes('insert or update on table');
    return msg && !esDePostgres
      ? msg
      : 'No se puede completar: hay datos relacionados que faltan o están en uso.';
  }
  if (e.code === '23514') {
    if (low.includes('administrador')) return msg;
    return 'Algún dato no es válido. Revisa el formulario.';
  }
  if (e.code === '22P02') return 'Algún dato tiene un formato no válido.';
  if (low.includes('password should be') || low.includes('password is too short')) {
    return 'La contraseña debe tener al menos 8 caracteres.';
  }

  // Mensaje ya redactado en castellano por nosotros
  if (msg && /[áéíóúñ¿]|^(el|la|los|las|no|solo|ya|falta|debe|para|hay|tu)\b/i.test(msg)) return msg;

  console.error('[METALPLAFER360]', err);
  return 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';
}
