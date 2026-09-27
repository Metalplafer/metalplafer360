/**
 * Enlace estándar de WhatsApp. Los teléfonos españoles sin prefijo
 * reciben el +34 automáticamente.
 */
export function whatsappLink(phone?: string | null, text?: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (/^[6789]\d{8}$/.test(digits)) digits = '34' + digits;
  digits = digits.replace(/\D/g, '');
  if (digits.length < 9) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Enlace para llamar por teléfono desde el móvil. */
export function telLink(phone?: string | null): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[^\d+]/g, '');
  return clean.length >= 9 ? `tel:${clean}` : null;
}
