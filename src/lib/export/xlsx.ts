/**
 * Generador de hojas de cálculo .xlsx, sin dependencias externas.
 *
 * Produce un libro de Excel de verdad (OOXML dentro de un ZIP), con
 * título, cabeceras fijas, filtros, anchos de columna, formatos de número
 * españoles y fila de totales. Lo abre Excel, LibreOffice y Google Sheets.
 */
import { makeZip } from './zip.ts';

export type ColumnType = 'text' | 'number' | 'int' | 'eur' | 'hours' | 'date';

export interface XlsxColumn {
  key: string;
  label: string;
  /** Ancho aproximado en caracteres. */
  width?: number;
  type?: ColumnType;
}

/** Una fila es cualquier objeto: se leen las columnas que pide la hoja. */
export type XlsxRow = Record<string, unknown>;

export interface XlsxSheet {
  name: string;
  title?: string;
  subtitle?: string;
  columns: XlsxColumn[];
  rows: readonly object[];
  /** Fila final de totales: {columna: valor}. */
  totals?: Record<string, unknown>;
}

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  // Excel rechaza los caracteres de control.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** A, B, … Z, AA, AB… */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Fecha 'YYYY-MM-DD' → número de serie de Excel (días desde el 30/12/1899). */
export function excelSerial(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const days = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000;
  return days + 25569;
}

/** Nombre de hoja admitido por Excel: 31 caracteres y sin : \ / ? * [ ] */
function sheetName(name: string, index: number): string {
  const clean = name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31);
  return clean || `Hoja${index + 1}`;
}

// Estilos: el índice es el que se usa en el atributo s="" de cada celda.
const STYLE = {
  default: 0, title: 1, subtitle: 2, header: 3,
  text: 4, number: 5, int: 6, eur: 7, hours: 8, date: 9,
  totalText: 10, totalNumber: 11, totalInt: 12, totalEur: 13, totalHours: 14,
};

const TYPE_STYLE: Record<ColumnType, number> = {
  text: STYLE.text, number: STYLE.number, int: STYLE.int,
  eur: STYLE.eur, hours: STYLE.hours, date: STYLE.date,
};

const TOTAL_STYLE: Record<ColumnType, number> = {
  text: STYLE.totalText, number: STYLE.totalNumber, int: STYLE.totalInt,
  eur: STYLE.totalEur, hours: STYLE.totalHours, date: STYLE.totalText,
};

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4">
<numFmt numFmtId="164" formatCode="#,##0.00"/>
<numFmt numFmtId="165" formatCode="#,##0"/>
<numFmt numFmtId="166" formatCode="#,##0.00\\ &quot;€&quot;"/>
<numFmt numFmtId="167" formatCode="#,##0.00\\ &quot;h&quot;"/>
</numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="15"/><color rgb="FF14243A"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF5B6778"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF14243A"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1D4F91"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFD6DCE3"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF1D4F91"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="4" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="165" fontId="4" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="166" fontId="4" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="167" fontId="4" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cell(ref: string, value: unknown, type: ColumnType, style: number): string {
  if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${style}"/>`;

  if (type === 'date') {
    const serial = typeof value === 'string' ? excelSerial(value) : null;
    if (serial === null) return `<c r="${ref}" s="${STYLE.text}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
    return `<c r="${ref}" s="${style}"><v>${serial}</v></c>`;
  }

  if (type !== 'text') {
    const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    if (Number.isFinite(n)) return `<c r="${ref}" s="${style}"><v>${n}</v></c>`;
  }

  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const cols = sheet.columns;
  const last = columnLetter(cols.length - 1);
  const lines: string[] = [];

  let r = 1;
  if (sheet.title) {
    lines.push(`<row r="${r}" ht="21" customHeight="1"><c r="A${r}" s="${STYLE.title}" t="inlineStr"><is><t>${esc(sheet.title)}</t></is></c></row>`);
    r++;
  }
  if (sheet.subtitle) {
    lines.push(`<row r="${r}"><c r="A${r}" s="${STYLE.subtitle}" t="inlineStr"><is><t>${esc(sheet.subtitle)}</t></is></c></row>`);
    r++;
  }
  if (sheet.title || sheet.subtitle) { lines.push(`<row r="${r}"/>`); r++; }

  const headerRow = r;
  lines.push(`<row r="${r}" ht="24" customHeight="1">${
    cols.map((c, i) => `<c r="${columnLetter(i)}${r}" s="${STYLE.header}" t="inlineStr"><is><t>${esc(c.label)}</t></is></c>`).join('')
  }</row>`);
  r++;

  for (const raw of sheet.rows) {
    const row = raw as XlsxRow;
    lines.push(`<row r="${r}">${
      cols.map((c, i) => cell(`${columnLetter(i)}${r}`, row[c.key], c.type ?? 'text', TYPE_STYLE[c.type ?? 'text'])).join('')
    }</row>`);
    r++;
  }

  if (sheet.totals) {
    lines.push(`<row r="${r}">${
      cols.map((c, i) => cell(
        `${columnLetter(i)}${r}`,
        sheet.totals?.[c.key] ?? '',
        c.type ?? 'text',
        TOTAL_STYLE[c.type ?? 'text'],
      )).join('')
    }</row>`);
    r++;
  }

  const merges = [];
  if (sheet.title) merges.push(`<mergeCell ref="A1:${last}1"/>`);
  if (sheet.subtitle) merges.push(`<mergeCell ref="A2:${last}2"/>`);

  const dataLast = headerRow + sheet.rows.length;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 18}" customWidth="1"/>`).join('')}</cols>
<sheetData>${lines.join('')}</sheetData>
${merges.length ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>` : ''}
${sheet.rows.length ? `<autoFilter ref="A${headerRow}:${last}${dataLast}"/>` : ''}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

/** Crea el archivo .xlsx completo. */
export function makeXlsx(sheets: XlsxSheet[], meta: { company?: string; title?: string } = {}): Uint8Array {
  const names = sheets.map((s, i) => sheetName(s.name, i));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(meta.title ?? 'Informe')}</dc:title>
<dc:creator>${esc(meta.company ?? 'METALPLAFER360')}</dc:creator>
<cp:lastModifiedBy>${esc(meta.company ?? 'METALPLAFER360')}</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>
</cp:coreProperties>`;

  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>METALPLAFER360</Application>
<Company>${esc(meta.company ?? 'Metalplafer')}</Company>
</Properties>`;

  return makeZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'docProps/core.xml', data: core },
    { name: 'docProps/app.xml', data: app },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/styles.xml', data: STYLES_XML },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ]);
}
