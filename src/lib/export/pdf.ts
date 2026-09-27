/**
 * Generador de PDF con formato profesional, sin dependencias externas.
 *
 * Dibuja una portada de informe con la marca de la empresa, tablas con
 * cabecera repetida en cada página, filas alternas, fila de totales y pie
 * con la fecha y la numeración de páginas.
 *
 * Usa las tipografías estándar del PDF (Helvetica), así que el archivo
 * pesa muy poco y se abre igual en cualquier ordenador o móvil.
 */

// ---------------------------------------------------------------------
// Texto: el PDF usa la codificación WinAnsi, no UTF-8
// ---------------------------------------------------------------------
const WINANSI: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F,
};

/** Texto → bytes WinAnsi. Lo que no se puede representar se sustituye. */
export function winAnsi(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 63;
    if (WINANSI[ch] !== undefined) out.push(WINANSI[ch]);
    else if (code === 0x00A0) out.push(32);            // espacio duro
    else if (code === 0x00B7) out.push(0xB7);          // ·
    else if (code < 256) out.push(code);
    else out.push(63);                                  // ?
  }
  return Uint8Array.from(out);
}

const escapePdfText = (text: string) => text.replace(/([\\()])/g, '\\$1');

// Anchos de Helvetica en milésimas de punto (métricas estándar).
const W: Record<string, number> = {};
{
  const widths = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
  ];
  widths.forEach((w, i) => { W[String.fromCharCode(32 + i)] = w; });
}

/** Acentuadas: miden como su letra base. */
const BASE = 'ÁÀÂÄÃáàâäãÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÑñÇç';
const BASE_OF = 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc';

export function textWidth(text: string, size: number, bold = false): number {
  let total = 0;
  for (const ch of text) {
    const at = BASE.indexOf(ch);
    const key = at >= 0 ? BASE_OF[at] : ch;
    total += W[key] ?? (ch === '€' ? 556 : 556);
  }
  return (total / 1000) * size * (bold ? 1.06 : 1);
}

/** Recorta el texto con puntos suspensivos para que quepa en el ancho dado. */
export function fit(text: string, width: number, size: number, bold = false): string {
  if (textWidth(text, size, bold) <= width) return text;
  let out = text;
  while (out.length > 1 && textWidth(`${out}…`, size, bold) > width) out = out.slice(0, -1);
  return `${out}…`;
}

// ---------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------
export interface PdfColumn {
  key: string;
  label: string;
  /** Proporción del ancho disponible. */
  width: number;
  align?: 'left' | 'right';
}

export interface PdfTable {
  title?: string;
  columns: PdfColumn[];
  rows: Record<string, string>[];
  totals?: Record<string, string>;
  /** Texto que se muestra si la tabla no tiene filas. */
  empty?: string;
}

export interface PdfDocument {
  company: string;
  title: string;
  subtitle?: string;
  orientation?: 'portrait' | 'landscape';
  summary?: { label: string; value: string }[];
  tables: PdfTable[];
  footer?: string;
}

const COLORS = {
  ink: '0.10 0.14 0.20',
  muted: '0.36 0.40 0.47',
  brand: '0.11 0.31 0.57',
  line: '0.84 0.86 0.89',
  zebra: '0.97 0.98 0.99',
  headText: '1 1 1',
};

class Page {
  ops: string[] = [];
  constructor(public width: number, public height: number) {}

  text(x: number, y: number, value: string, size: number, bold = false, color = COLORS.ink) {
    this.ops.push(
      `BT /${bold ? 'FB' : 'FR'} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(value)}) Tj ET`,
    );
  }

  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ops.push(`${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  line(x1: number, y1: number, x2: number, y2: number, color = COLORS.line, width = 0.5) {
    this.ops.push(
      `${color} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    );
  }
}

export function makePdf(doc: PdfDocument): Uint8Array {
  const landscape = doc.orientation !== 'portrait';
  const pw = landscape ? 842 : 595;
  const ph = landscape ? 595 : 842;
  const margin = 40;
  const contentWidth = pw - margin * 2;
  const bottom = 56;

  const pages: Page[] = [];
  let page!: Page;
  let y = 0;

  const newPage = (first = false) => {
    page = new Page(pw, ph);
    pages.push(page);

    if (first) {
      // Banda de cabecera con la marca
      page.rect(0, ph - 78, pw, 78, COLORS.brand);
      page.text(margin, ph - 38, doc.company, 16, true, COLORS.headText);
      page.text(margin, ph - 58, doc.title, 11, false, '0.85 0.89 0.95');
      if (doc.subtitle) {
        const w = textWidth(doc.subtitle, 10);
        page.text(pw - margin - w, ph - 58, doc.subtitle, 10, false, '0.85 0.89 0.95');
      }
      y = ph - 78 - 28;
    } else {
      page.line(margin, ph - 34, pw - margin, ph - 34);
      page.text(margin, ph - 28, `${doc.company} · ${doc.title}`, 9, false, COLORS.muted);
      y = ph - 56;
    }
  };

  newPage(true);

  const ensure = (needed: number) => {
    if (y - needed < bottom) newPage();
  };

  // Resumen en cifras
  if (doc.summary?.length) {
    ensure(54);
    const boxWidth = contentWidth / Math.min(doc.summary.length, 4);
    doc.summary.forEach((item, i) => {
      const col = i % 4;
      if (col === 0 && i > 0) y -= 50;
      const x = margin + col * boxWidth;
      page.text(x, y - 16, fit(item.value, boxWidth - 10, 15, true), 15, true, COLORS.brand);
      page.text(x, y - 30, fit(item.label, boxWidth - 10, 9), 9, false, COLORS.muted);
    });
    y -= 50;
  }

  for (const table of doc.tables) {
    const total = table.columns.reduce((s, c) => s + c.width, 0) || 1;
    const widths = table.columns.map((c) => (c.width / total) * contentWidth);
    const xs: number[] = [];
    let at = margin;
    for (const w of widths) { xs.push(at); at += w; }

    const drawHead = () => {
      page.rect(margin, y - 18, contentWidth, 18, COLORS.brand);
      table.columns.forEach((c, i) => {
        const label = fit(c.label, widths[i] - 8, 8.5, true);
        const x = c.align === 'right'
          ? xs[i] + widths[i] - 4 - textWidth(label, 8.5, true)
          : xs[i] + 4;
        page.text(x, y - 12.5, label, 8.5, true, COLORS.headText);
      });
      y -= 18;
    };

    if (table.title) {
      ensure(40);
      page.text(margin, y - 12, table.title, 12, true);
      y -= 22;
    }

    ensure(40);
    drawHead();

    if (!table.rows.length) {
      page.text(margin + 4, y - 13, table.empty ?? 'Sin datos en este periodo.', 9, false, COLORS.muted);
      y -= 20;
    }

    table.rows.forEach((row, index) => {
      if (y - 15 < bottom) { newPage(); drawHead(); }
      if (index % 2 === 1) page.rect(margin, y - 15, contentWidth, 15, COLORS.zebra);
      table.columns.forEach((c, i) => {
        const value = fit(String(row[c.key] ?? ''), widths[i] - 8, 8.5);
        const x = c.align === 'right'
          ? xs[i] + widths[i] - 4 - textWidth(value, 8.5)
          : xs[i] + 4;
        page.text(x, y - 10.5, value, 8.5);
      });
      page.line(margin, y - 15, margin + contentWidth, y - 15);
      y -= 15;
    });

    if (table.totals) {
      if (y - 18 < bottom) { newPage(); drawHead(); }
      page.line(margin, y, margin + contentWidth, y, COLORS.brand, 1);
      table.columns.forEach((c, i) => {
        const value = String(table.totals?.[c.key] ?? '');
        if (!value) return;
        const shown = fit(value, widths[i] - 8, 9, true);
        const x = c.align === 'right'
          ? xs[i] + widths[i] - 4 - textWidth(shown, 9, true)
          : xs[i] + 4;
        page.text(x, y - 12, shown, 9, true);
      });
      y -= 20;
    }

    y -= 16;
  }

  // Pie de página
  const stamp = doc.footer ?? '';
  pages.forEach((p, i) => {
    p.line(margin, bottom - 12, pw - margin, bottom - 12);
    if (stamp) p.text(margin, bottom - 24, stamp, 8, false, COLORS.muted);
    const label = `Página ${i + 1} de ${pages.length}`;
    p.text(pw - margin - textWidth(label, 8), bottom - 24, label, 8, false, COLORS.muted);
  });

  return assemble(pages, pw, ph);
}

// ---------------------------------------------------------------------
// Estructura del archivo PDF
// ---------------------------------------------------------------------
function assemble(pages: Page[], pw: number, ph: number): Uint8Array {
  const parts: Uint8Array[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === 'string' ? winAnsi(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };

  // 1 catálogo · 2 páginas · 3 fuente normal · 4 fuente negrita
  // luego, por cada página: objeto de página y su contenido
  const firstPageObj = 5;
  const offsets: number[] = [];
  const objects: (Uint8Array | string)[] = [];

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Count ${pages.length} /Kids [${
      pages.map((_, i) => `${firstPageObj + i * 2} 0 R`).join(' ')
    }] >>`,
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  pages.forEach((p, i) => {
    const contentObj = firstPageObj + i * 2 + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] `
      + `/Resources << /Font << /FR 3 0 R /FB 4 0 R >> >> /Contents ${contentObj} 0 R >>`,
    );
    objects.push(p.ops.join('\n'));
  });

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  objects.forEach((body, i) => {
    const n = i + 1;
    offsets[n] = length;
    // Los objetos impares a partir del quinto son contenidos (streams).
    const isStream = n >= firstPageObj && (n - firstPageObj) % 2 === 1;
    if (isStream) {
      const data = winAnsi(String(body));
      push(`${n} 0 obj\n<< /Length ${data.length} >>\nstream\n`);
      push(data);
      push('\nendstream\nendobj\n');
    } else {
      push(`${n} 0 obj\n${body}\nendobj\n`);
    }
  });

  const xref = length;
  const count = objects.length + 1;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let atPos = 0;
  for (const part of parts) { out.set(part, atPos); atPos += part.length; }
  return out;
}
