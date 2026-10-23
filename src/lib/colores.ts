/**
 * METALPLAFER360 · COLORES QUE SE PUEDEN LEER
 *
 * MEJORA 4.1 · La pastilla del calendario se colorea ENTERA según su
 * categoría, y el color lo elige una persona en Configuración. Eso
 * significa que el color del texto NO se puede escribir a mano en la
 * hoja de estilos: con un amarillo claro hace falta texto oscuro y con
 * un azul marino hace falta texto blanco. Si se deja fijo, la mitad de
 * las paletas quedan ilegibles.
 *
 * Así que se calcula, con la fórmula de contraste de las pautas de
 * accesibilidad (WCAG 2.1): se mide el contraste del fondo contra el
 * blanco y contra el gris oscuro de la aplicación, y gana el mayor.
 */

/** El gris oscuro del texto de la aplicación (--ink en tokens.css). */
export const TINTA = '#1A2433';
export const BLANCO = '#FFFFFF';

/** «#rrggbb», que es lo que admiten la base de datos y el navegador. */
const HEX = /^#[0-9a-fA-F]{6}$/;

export const esHex = (v: string): boolean => HEX.test(v.trim());

/**
 * Deja un color en «#rrggbb» minúsculas, o devuelve null si no lo es.
 *
 * Acepta la forma corta «#abc» porque es lo que a veces se escribe a
 * mano, y la expande: en la base de datos solo entra la forma larga.
 */
export function normalizaHex(v: string): string | null {
  const s = v.trim();
  if (HEX.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const [, r, g, b] = s;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

/** Los tres canales de un «#rrggbb», de 0 a 255. */
function canales(hex: string): [number, number, number] {
  const s = normalizaHex(hex) ?? '#000000';
  return [
    parseInt(s.slice(1, 3), 16),
    parseInt(s.slice(3, 5), 16),
    parseInt(s.slice(5, 7), 16),
  ];
}

/**
 * Luminancia relativa (WCAG 2.1, 1.4.3): cuánta luz emite el color para
 * el ojo humano. El verde pesa mucho más que el azul, y de ahí que un
 * azul oscuro y un verde del mismo «brillo» aparente necesiten colores
 * de texto distintos.
 */
export function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste entre dos colores: de 1 (iguales) a 21 (negro sobre blanco). */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * El color de texto que se lee mejor sobre este fondo.
 *
 * Solo dos opciones a propósito: el blanco y la tinta de la aplicación.
 * Calcular un tono intermedio daría contrastes a medias y además haría
 * que cada pastilla tuviera su propio gris, que se ve sucio.
 */
export function textoSobre(fondo: string): string {
  return contraste(fondo, BLANCO) >= contraste(fondo, TINTA) ? BLANCO : TINTA;
}

/**
 * ¿Se lee bien? Las pautas piden 4,5 para texto normal y 3 para texto
 * grande o en negrita. La pastilla del calendario es pequeña y en
 * negrita, así que se exige 4 como umbral de aviso: no bloquea nada, se
 * usa para ADVERTIR en Configuración de que un color elegido va a
 * costar de leer.
 */
export const CONTRASTE_MINIMO = 4;

export function seLee(fondo: string): boolean {
  return contraste(fondo, textoSobre(fondo)) >= CONTRASTE_MINIMO;
}
