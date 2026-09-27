/**
 * Los archivos que genera la aplicación se comprueban de verdad:
 * el ZIP con `unzip`, el Excel abriéndolo con openpyxl y el PDF
 * extrayendo su texto con pdftotext. Si no se abren, la prueba falla.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { makeZip, readZip, crc32 } from '../../src/lib/export/zip';
import { fromCsv, toCsv } from '../../src/lib/export/csv';
import { columnLetter, excelSerial, makeXlsx } from '../../src/lib/export/xlsx';
import { fit, makePdf, textWidth, winAnsi } from '../../src/lib/export/pdf';

const dir = mkdtempSync(join(tmpdir(), 'm360-'));
const write = (name: string, bytes: Uint8Array) => {
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
};

/** Ejecuta una herramienta y devuelve su salida; null si no está instalada. */
function run(cmd: string, args: string[]): string | null {
  try { return execFileSync(cmd, args, { encoding: 'utf8' }); }
  catch (e) {
    const err = e as { code?: string; stdout?: string };
    if (err.code === 'ENOENT') return null;
    throw e;
  }
}

describe('archivos ZIP', () => {
  it('escribe y vuelve a leer lo mismo', () => {
    const zip = makeZip([
      { name: 'tablas/clientes.csv', data: 'nombre;ciudad\r\nGarcía;Sabadell\r\n' },
      { name: 'metadatos.json', data: '{"version":1}' },
    ]);
    const back = readZip(zip);
    expect(back.map((e) => e.name)).toEqual(['tablas/clientes.csv', 'metadatos.json']);
    expect(back[0].text()).toContain('García');
    expect(JSON.parse(back[1].text()).version).toBe(1);
  });

  it('lo abre cualquier programa de descompresión', () => {
    const zip = makeZip([{ name: 'datos/prueba.txt', data: 'Ñandú con acentos: áéíóú' }]);
    const path = write('prueba.zip', zip);

    const test = run('unzip', ['-t', path]);
    if (test === null) return;                       // sin unzip instalado
    expect(test).toContain('No errors detected');

    const list = run('unzip', ['-l', path]) ?? '';
    expect(list).toContain('datos/prueba.txt');
  });

  it('calcula bien la suma de comprobación', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xCBF43926);
  });

  it('avisa en castellano si el archivo no es un ZIP', () => {
    expect(() => readZip(new Uint8Array([1, 2, 3]))).toThrow(/no es un ZIP/);
  });
});

describe('CSV de las copias de seguridad', () => {
  it('conserva los valores con punto y coma, comillas y saltos de línea', () => {
    const rows = [
      { id: '1', name: 'García; Construcciones', notes: 'Dijo "urgente"\nmañana', amount: 6400.5 },
      { id: '2', name: 'Laura Sanz', notes: null, amount: null },
    ];
    const csv = toCsv(rows as never, ['id', 'name', 'notes', 'amount']);
    const back = fromCsv(csv);

    expect(back).toHaveLength(2);
    expect(back[0].name).toBe('García; Construcciones');
    expect(back[0].notes).toBe('Dijo "urgente"\nmañana');
    expect(back[0].amount).toBe('6400.5');
    expect(back[1].notes).toBeNull();
  });

  it('una tabla vacía sigue teniendo cabecera', () => {
    expect(toCsv([], ['id', 'name'])).toBe('id;name\r\n');
    expect(fromCsv('id;name\r\n')).toEqual([]);
  });
});

describe('hojas de cálculo', () => {
  it('numera las columnas como Excel', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(27)).toBe('AB');
  });

  it('convierte las fechas al número de serie de Excel', () => {
    expect(excelSerial('2026-09-22')).toBe(46287);
    expect(excelSerial('1900-01-01')).toBe(2);
    expect(excelSerial('no es fecha')).toBeNull();
  });

  it('Excel abre el archivo y lee los valores y los formatos', () => {
    const bytes = makeXlsx([
      {
        name: 'Horas',
        title: 'Horas por trabajador',
        subtitle: 'Del 01/09/2026 al 30/09/2026',
        columns: [
          { key: 'worker', label: 'Trabajador', width: 26 },
          { key: 'hours', label: 'Horas', type: 'hours', width: 12 },
          { key: 'amount', label: 'Importe', type: 'eur', width: 14 },
          { key: 'day', label: 'Fecha', type: 'date', width: 14 },
        ],
        rows: [
          { worker: 'Juan Ortega', hours: 7.5, amount: 6400.5, day: '2026-09-22' },
          { worker: 'Pedro Navarro; "el rápido"', hours: 6, amount: 120, day: '2026-09-23' },
        ],
        totals: { worker: 'TOTAL', hours: 13.5, amount: 6520.5 },
      },
    ], { company: 'METALPLAFER S.L.', title: 'Informe de horas' });

    const path = write('informe.xlsx', bytes);
    const out = run('python3', ['-c', `
import openpyxl, json
wb = openpyxl.load_workbook(${JSON.stringify(path)})
ws = wb['Horas']
print(json.dumps({
  'hojas': wb.sheetnames,
  'titulo': ws['A1'].value,
  'subtitulo': ws['A2'].value,
  'cabecera': [ws.cell(row=4, column=c).value for c in range(1, 5)],
  'trabajador': ws['A5'].value,
  'horas': ws['B5'].value,
  'importe': ws['C5'].value,
  'fecha': str(ws['D5'].value),
  'comillas': ws['A6'].value,
  'total': ws['B7'].value,
  'formato_euro': ws['C5'].number_format,
  'negrita_cabecera': ws['A4'].font.bold,
  'inmovilizado': ws.freeze_panes,
  'ancho': ws.column_dimensions['A'].width,
}, ensure_ascii=False))
`]);
    if (out === null) return;                        // sin python/openpyxl

    const info = JSON.parse(out);
    expect(info.hojas).toEqual(['Horas']);
    expect(info.titulo).toBe('Horas por trabajador');
    expect(info.subtitulo).toContain('01/09/2026');
    expect(info.cabecera).toEqual(['Trabajador', 'Horas', 'Importe', 'Fecha']);
    expect(info.trabajador).toBe('Juan Ortega');
    expect(info.horas).toBe(7.5);
    expect(info.importe).toBe(6400.5);
    expect(info.fecha).toContain('2026-09-22');
    expect(info.comillas).toBe('Pedro Navarro; "el rápido"');
    expect(info.total).toBe(13.5);
    expect(info.formato_euro).toContain('€');
    expect(info.negrita_cabecera).toBe(true);
    expect(info.inmovilizado).toBe('A5');
    expect(Math.round(info.ancho)).toBe(26);
  });

  it('varias hojas en el mismo libro', () => {
    const bytes = makeXlsx([
      { name: 'Proyectos', columns: [{ key: 'a', label: 'A' }], rows: [{ a: '1' }] },
      { name: 'Material: pendiente/retrasado', columns: [{ key: 'a', label: 'A' }], rows: [] },
    ]);
    const path = write('dos-hojas.xlsx', bytes);
    const out = run('python3', ['-c',
      `import openpyxl,json;print(json.dumps(openpyxl.load_workbook(${JSON.stringify(path)}).sheetnames))`]);
    if (out === null) return;
    // El nombre de hoja no admite : ni /, y se limpian sin romper el archivo.
    expect(JSON.parse(out)).toEqual(['Proyectos', 'Material  pendiente retrasado']);
  });
});

describe('documentos PDF', () => {
  it('mide el texto y lo recorta para que quepa', () => {
    expect(textWidth('AAA', 10)).toBeCloseTo(20.01, 1);
    expect(fit('Barandilla escalera comunitaria', 40, 9)).toMatch(/…$/);
    expect(fit('Corto', 200, 9)).toBe('Corto');
  });

  it('escribe los acentos y el euro en la codificación del PDF', () => {
    expect(Array.from(winAnsi('á'))).toEqual([0xE1]);
    expect(Array.from(winAnsi('€'))).toEqual([0x80]);
    expect(Array.from(winAnsi('ñÑ'))).toEqual([0xF1, 0xD1]);
  });

  it('se abre como PDF y contiene el informe', () => {
    const bytes = makePdf({
      company: 'METALPLAFER S.L.',
      title: 'Informe de proyectos',
      subtitle: 'Del 01/09/2026 al 30/09/2026',
      summary: [
        { label: 'Proyectos creados', value: '12' },
        { label: 'Finalizados', value: '7' },
        { label: 'Facturado', value: '48.500,00 €' },
      ],
      tables: [
        {
          title: 'Proyectos por fase',
          columns: [
            { key: 'fase', label: 'Fase', width: 3 },
            { key: 'total', label: 'Proyectos', width: 1, align: 'right' },
          ],
          rows: [
            { fase: 'En preparación', total: '3' },
            { fase: 'Fabricación', total: '4' },
            { fase: 'Montaje', total: '2' },
          ],
          totals: { fase: 'TOTAL', total: '9' },
        },
      ],
      footer: 'Generado el 22/09/2026 · METALPLAFER360',
    });

    expect(new TextDecoder('latin1').decode(bytes.slice(0, 8))).toBe('%PDF-1.4');
    const path = write('informe.pdf', bytes);

    const text = run('pdftotext', ['-enc', 'UTF-8', path, '-']);
    if (text === null) return;                       // sin poppler instalado
    expect(text).toContain('METALPLAFER S.L.');
    expect(text).toContain('Informe de proyectos');
    expect(text).toContain('En preparación');
    expect(text).toContain('48.500,00 €');
    expect(text).toContain('Página 1 de 1');
  });

  it('reparte en varias páginas cuando hay muchas filas', () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ a: `Fila número ${i + 1}`, b: String(i) }));
    const bytes = makePdf({
      company: 'METALPLAFER S.L.',
      title: 'Listado largo',
      tables: [{
        columns: [{ key: 'a', label: 'Concepto', width: 4 }, { key: 'b', label: 'Valor', width: 1, align: 'right' }],
        rows,
      }],
    });
    const path = write('largo.pdf', bytes);
    const text = run('pdftotext', ['-enc', 'UTF-8', path, '-']);
    if (text === null) return;
    expect(text).toContain('Fila número 1');
    expect(text).toContain('Fila número 120');
    expect(text).toContain('Página 2 de');
    // La cabecera se repite en cada página
    expect(text.match(/Concepto/g)?.length ?? 0).toBeGreaterThan(1);
  });
});
