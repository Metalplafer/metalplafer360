import { TIMEZONE } from '@/config/env';

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Fecha de hoy en hora de Madrid, como 'YYYY-MM-DD'. */
export function todayMadrid(now: Date = new Date()): string {
  return isoFormatter.format(now);
}

/** Suma días a una fecha 'YYYY-MM-DD' sin errores de zona horaria. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' o fecha completa ISO → 'DD/MM/YYYY'. */
export function fmtDate(value?: string | null): string {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return DATE_FMT.format(dt);
}

const DATE_FMT = new Intl.DateTimeFormat('es-ES', {
  timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric',
});
const DATETIME_FMT = new Intl.DateTimeFormat('es-ES', {
  timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

/** Fecha y hora: 'DD/MM/YYYY HH:MM'. */
export function fmtDateTime(value?: string | null): string {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return DATETIME_FMT.format(dt);
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** 'Jueves 17 de septiembre' a partir de 'YYYY-MM-DD'. */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${d} de ${MONTHS[m - 1]}`;
}

/** 'Hoy', 'Mañana', 'Ayer' o la fecha larga. */
export function relativeDay(iso: string, today = todayMadrid()): string {
  if (iso === today) return 'Hoy';
  if (iso === addDays(today, 1)) return 'Mañana';
  if (iso === addDays(today, -1)) return 'Ayer';
  return longDate(iso);
}

/** Lunes de la semana de una fecha 'YYYY-MM-DD'. La semana empieza en lunes. */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(iso, -weekday);
}

/** Primer día del mes de una fecha 'YYYY-MM-DD'. */
export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Suma meses conservando el día 1: '2026-09-21' + 1 → '2026-10-01'. */
export function addMonths(iso: string, months: number): string {
  const [y, m] = iso.split('-').map(Number);
  const total = (y * 12) + (m - 1) + months;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

/** 'Septiembre de 2026'. */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const name = MONTHS[m - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

/** Último día del mes de una fecha. */
export function endOfMonth(iso: string): string {
  return addDays(addMonths(iso, 1), -1);
}

export type PeriodKey = 'semana' | 'mes' | 'trimestre' | 'ano' | 'personalizado';

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  semana: 'Esta semana',
  mes: 'Este mes',
  trimestre: 'Este trimestre',
  ano: 'Este año',
  personalizado: 'Otras fechas',
};

/**
 * Fechas de cada periodo. El de por defecto es «Este mes».
 * Siempre en hora de Madrid, como todo lo demás.
 */
export function periodRange(key: PeriodKey, today = todayMadrid()): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  if (key === 'semana') {
    const start = mondayOf(today);
    return { from: start, to: addDays(start, 6) };
  }
  if (key === 'trimestre') {
    const firstMonth = Math.floor((m - 1) / 3) * 3 + 1;
    const from = `${y}-${String(firstMonth).padStart(2, '0')}-01`;
    return { from, to: endOfMonth(addMonths(from, 2)) };
  }
  if (key === 'ano') return { from: `${y}-01-01`, to: `${y}-12-31` };
  const from = startOfMonth(today);
  return { from, to: endOfMonth(from) };
}

/** 'Del 01/09/2026 al 30/09/2026' */
export function periodLabel(from: string, to: string): string {
  return `Del ${fmtDate(from)} al ${fmtDate(to)}`;
}

/** Día de la semana abreviado: 'lun', 'mar'… */
export function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()].slice(0, 3);
}

/** Número de día del mes, sin ceros: '21'. */
export function dayNumber(iso: string): number {
  return Number(iso.slice(8, 10));
}

/**
 * Fecha para las órdenes: 'Hoy · 21/09/2026' o 'Jueves · 24/09/2026'.
 * Siempre incluye la fecha en DD/MM/YYYY, y añade el día de la semana
 * porque en el taller se trabaja pensando en «el jueves», no en el 24.
 */
export function dayLabel(iso: string, today = todayMadrid()): string {
  const rel = relativeDay(iso, today);
  if (rel === 'Hoy' || rel === 'Mañana' || rel === 'Ayer') return `${rel} · ${fmtDate(iso)}`;
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${fmtDate(iso)}`;
}

/** Saludo según la hora en Madrid. */
export function greeting(now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('es-ES', {
    timeZone: TIMEZONE, hour: '2-digit', hour12: false,
  }).format(now));
  if (hour < 6) return 'Buenas noches';
  if (hour < 14) return 'Buenos días';
  if (hour < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Lee números escritos a la española.
 *
 *   '7,5'        → 7.5      (la coma es el decimal)
 *   '2.400'      → 2400     (el punto separa los millares)
 *   '1.250,50 €' → 1250.5
 *   '7.5'        → 7.5      (un punto suelto que no forma millares es decimal)
 *
 * Devuelve null si el texto no es un número válido.
 */
export function parseDecimal(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;

  const clean = input.trim().replace(/\s*h(oras?)?$/i, '').replace(/€/g, '').replace(/\s/g, '');
  if (!clean) return null;

  let normalized: string;
  if (clean.includes(',')) {
    // Con coma, el punto solo puede ser separador de millares.
    normalized = clean.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(clean)) {
    // Grupos de tres cifras: 2.400 o 1.250.500 son millares, no decimales.
    normalized = clean.replace(/\./g, '');
  } else {
    normalized = clean;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/** Horas de trabajo: mayores que 0 y como máximo 24, con 2 decimales. */
export function parseHours(input: string | number): number | null {
  const n = parseDecimal(input);
  if (n === null || n <= 0 || n > 24) return null;
  return Math.round(n * 100) / 100;
}

// useGrouping: true fuerza el punto de los millares también en cifras de
// cuatro dígitos (5.000 €), como se espera en los importes de la empresa.
const numberFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: true });
const eurFmt = new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, useGrouping: true,
});

export function fmtNumber(n?: number | string | null): string {
  return n === null || n === undefined || n === '' ? '—' : numberFmt.format(Number(n));
}
export function fmtHours(n?: number | string | null): string {
  return n === null || n === undefined ? '—' : `${numberFmt.format(Number(n))} h`;
}
export function fmtEur(n?: number | string | null): string {
  return n === null || n === undefined || n === '' ? '—' : eurFmt.format(Number(n));
}
export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${numberFmt.format(Math.round(bytes / 102.4) / 10)} KB`;
  return `${numberFmt.format(Math.round(bytes / (1024 * 102.4)) / 10)} MB`;
}

/** Convierte un nombre de usuario en el correo interno de acceso. */
export function usernameToEmail(username: string, domain: string): string {
  const u = username.trim().toLowerCase();
  return u.includes('@') ? u : `${u}@${domain}`;
}

/** 'HH:MM:SS' → 'HH:MM'. */
export function fmtTimeShort(value?: string | null): string {
  return value ? value.slice(0, 5) : '';
}

/** Teléfonos españoles más legibles: 600111222 → 600 111 222. */
export function fmtPhone(value?: string | null): string {
  if (!value) return '—';
  const clean = value.trim();
  const digits = clean.replace(/\D/g, '');
  if (/^\+?34?\d{9}$/.test(clean.replace(/\s/g, '')) || digits.length === 9) {
    const nine = digits.slice(-9);
    const prefix = clean.trim().startsWith('+') ? '+34 ' : '';
    return `${prefix}${nine.slice(0, 3)} ${nine.slice(3, 6)} ${nine.slice(6)}`;
  }
  return clean;
}
