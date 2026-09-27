/**
 * Lector y escritor de archivos ZIP, sin dependencias externas.
 *
 * Se escribe sin comprimir («stored»): un backup son CSV de texto que
 * cualquier ordenador debe poder abrir dentro de diez años sin depender
 * de ninguna librería que a lo mejor ya no existe. Lo abre Windows, macOS,
 * Linux, Excel y cualquier herramienta estándar.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export interface ZipEntry {
  /** Ruta dentro del ZIP, con barras normales: 'tablas/clientes.csv'. */
  name: string;
  data: Uint8Array | string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytesOf = (v: Uint8Array | string) => (typeof v === 'string' ? encoder.encode(v) : v);

/** Fecha y hora en el formato de MS-DOS que usa el ZIP. */
function dosDateTime(date: Date) {
  const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() / 2) & 31);
  const day = (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
  return { time, day };
}

class Writer {
  private parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array) { this.parts.push(bytes); this.length += bytes.length; }

  u16(n: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); this.push(b); }
  u32(n: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); this.push(b); }

  join(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) { out.set(part, at); at += part.length; }
    return out;
  }
}

/** Crea un ZIP con los archivos indicados. */
export function makeZip(entries: ZipEntry[], now: Date = new Date()): Uint8Array {
  const { time, day } = dosDateTime(now);
  const out = new Writer();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = bytesOf(entry.data);
    const crc = crc32(data);
    const offset = out.length;

    out.u32(0x04034B50);          // firma de cabecera local
    out.u16(20);                  // versión necesaria
    out.u16(0x0800);              // nombres en UTF-8
    out.u16(0);                   // método: sin comprimir
    out.u16(time); out.u16(day);
    out.u32(crc);
    out.u32(data.length); out.u32(data.length);
    out.u16(name.length); out.u16(0);
    out.push(name);
    out.push(data);

    central.push({ name, crc, size: data.length, offset });
  }

  const dirStart = out.length;
  for (const e of central) {
    out.u32(0x02014B50);          // firma del directorio central
    out.u16(20); out.u16(20);
    out.u16(0x0800); out.u16(0);
    out.u16(time); out.u16(day);
    out.u32(e.crc);
    out.u32(e.size); out.u32(e.size);
    out.u16(e.name.length); out.u16(0); out.u16(0);
    out.u16(0); out.u16(0); out.u32(0);
    out.u32(e.offset);
    out.push(e.name);
  }
  const dirSize = out.length - dirStart;

  out.u32(0x06054B50);            // fin del directorio central
  out.u16(0); out.u16(0);
  out.u16(central.length); out.u16(central.length);
  out.u32(dirSize); out.u32(dirStart);
  out.u16(0);

  return out.join();
}

export interface ReadEntry { name: string; data: Uint8Array; text: () => string }

/**
 * Lee un ZIP creado por esta misma aplicación.
 * Si alguien lo ha vuelto a comprimir con otra herramienta, se avisa en
 * castellano en vez de fallar con un error técnico.
 */
export function readZip(bytes: Uint8Array): ReadEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 65558; i--) {
    if (view.getUint32(i, true) === 0x06054B50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no es un ZIP válido.');

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const entries: ReadEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014B50) throw new Error('El ZIP está dañado.');
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));

    if (method !== 0) {
      throw new Error(
        `«${name}» está comprimido. Sube el archivo de copia de seguridad tal como lo generó la aplicación, sin volver a comprimirlo.`,
      );
    }

    const localNameLen = view.getUint16(offset + 26, true);
    const localExtraLen = view.getUint16(offset + 28, true);
    const start = offset + 30 + localNameLen + localExtraLen;
    const data = bytes.subarray(start, start + size);

    entries.push({ name, data, text: () => decoder.decode(data) });
    at += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}
