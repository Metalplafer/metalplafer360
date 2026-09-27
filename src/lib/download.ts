/** Entrega un archivo generado en el navegador a la persona que lo pidió. */
export function downloadBytes(bytes: Uint8Array, fileName: string, mime: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Se libera un momento después para que al navegador le dé tiempo a empezar.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const MIME = {
  zip: 'application/zip',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  csv: 'text/csv;charset=utf-8',
} as const;

/** Nombre de archivo sin acentos ni caracteres raros. */
export function safeFileName(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_. ]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'metalplafer360';
}
