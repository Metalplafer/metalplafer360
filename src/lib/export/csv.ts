/**
 * CSV de ida y vuelta, en el formato que espera Excel en español.
 *
 * Se usa punto y coma como separador porque es lo que Excel abre bien con
 * la configuración regional española, y se escribe el BOM para que los
 * acentos se vean correctamente al abrirlo con doble clic.
 *
 * Para las copias de seguridad los valores se guardan tal cual vienen de
 * la base de datos (sin formatear), para que al restaurar vuelvan a entrar
 * exactamente igual.
 */

export const CSV_SEPARATOR = ';';
export const BOM = '﻿';

function escape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Filas de objetos → texto CSV. Las columnas salen en el orden indicado. */
export function toCsv(rows: Record<string, unknown>[], columns?: string[], withBom = false): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [cols.map(escape).join(CSV_SEPARATOR)];
  for (const row of rows) lines.push(cols.map((c) => escape(row[c])).join(CSV_SEPARATOR));
  return (withBom ? BOM : '') + lines.join('\r\n') + '\r\n';
}

/** Texto CSV → filas de objetos. Entiende comillas, saltos de línea y «» vacíos. */
export function fromCsv(text: string): Record<string, string | null>[] {
  const clean = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];

    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }

    if (c === '"' && field === '') { quoted = true; started = true; continue; }
    if (c === CSV_SEPARATOR) { row.push(field); field = ''; started = false; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; started = false; continue; }
    field += c;
    started = true;
  }
  if (field !== '' || started || row.length) { row.push(field); rows.push(row); }

  const [head, ...body] = rows.filter((r) => r.length > 1 || (r[0] ?? '') !== '');
  if (!head) return [];

  return body.map((cells) => {
    const out: Record<string, string | null> = {};
    head.forEach((name, i) => { out[name] = cells[i] === undefined || cells[i] === '' ? null : cells[i]; });
    return out;
  });
}
