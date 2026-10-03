/**
 * IDENTIDAD VISUAL DE METALPLAFER360.
 *
 * Aquí NO se dibuja nada. Todo sale de los archivos oficiales, tal cual,
 * sin redibujarlos, deformarlos ni recomponerlos con texto o CSS:
 *
 *   public/brand/logo-azul.png    → el logo de Metalplafer, para fondos claros
 *   public/brand/logo-blanco.png  → el logo de Metalplafer, para fondos oscuros
 *   public/icons/icon-192.png     → el icono de la aplicación (el «360»)
 *
 * Si alguna vez cambian los logos, se sustituyen esos archivos y ya está:
 * no hay que tocar este código.
 */

/**
 * El logo de Metalplafer, desde el archivo oficial.
 *
 * «height» es la altura máxima; el ancho se calcula solo. El archivo se
 * muestra lo más grande que quepa en su hueco SIN deformarse nunca,
 * sea cuadrado o muy alargado.
 */
export function Logo({ variant, height = 26 }: { variant: 'azul' | 'blanco'; height?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}brand/logo-${variant}.png`}
      alt="Metalplafer"
      style={{
        width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: height, minWidth: 0,
        objectFit: 'contain', objectPosition: 'left center', display: 'block',
      }}
    />
  );
}

/**
 * El icono de la aplicación (la placa con el «360»), desde el archivo
 * oficial: el mismo que se usa en el favicon y en la aplicación instalada.
 */
export function Isotype({ size = 34 }: { size?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
      alt=""
      aria-hidden
      style={{ width: size, height: size, display: 'block' }}
    />
  );
}

/**
 * La firma de la aplicación en las cabeceras: el logo oficial de
 * Metalplafer y nada más. Sin añadidos de texto.
 */
export function AppMark({ onDark, height = 30 }: { onDark?: boolean; height?: number }) {
  return <Logo variant={onDark ? 'blanco' : 'azul'} height={height} />;
}
