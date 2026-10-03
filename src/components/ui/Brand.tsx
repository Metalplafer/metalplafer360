/**
 * IDENTIDAD VISUAL DE METALPLAFER360.
 *
 * Aquí NO se dibuja nada. Todo sale de los archivos oficiales, tal cual,
 * sin redibujarlos, deformarlos ni recomponerlos con texto, SVG o CSS:
 *
 *   public/brand/logo-azul.png    → el logo de Metalplafer, para fondos claros
 *   public/brand/logo-blanco.png  → el logo de Metalplafer, para fondos oscuros
 *   public/icons/icon-192.png     → el icono de la aplicación (el «360»)
 *
 * Si alguna vez cambian, se sustituyen esos archivos y ya está: no hay
 * que tocar este código.
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
        flex: '0 1 auto',
      }}
    />
  );
}

/**
 * El icono de la aplicación: la placa con el «360», desde el archivo
 * oficial, el mismo que se usa en la pestaña del navegador y en la
 * aplicación instalada. Es una imagen, no un dibujo.
 */
export function AppIcon({ size = 34 }: { size?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
      alt=""
      aria-hidden
      style={{ width: size, height: size, flex: 'none', display: 'block' }}
    />
  );
}

/**
 * La firma de la aplicación en las cabeceras.
 *
 * Sin «icon», solo el logo de Metalplafer. Con «icon», el icono del 360
 * delante y el logo detrás, en la misma línea:
 *
 *     [360]  [logotipo de Metalplafer]
 *
 * Son dos archivos, uno al lado del otro. No hay ningún texto, ni
 * ningún «360» suelto: el 360 que se ve es el del propio icono.
 *
 * Si el hueco es estrecho, lo que se reduce es el logo (manteniendo su
 * proporción); el icono conserva su tamaño por ser cuadrado y pequeño.
 */
export function AppMark({ onDark, height = 30, icon, gap = 10 }:
{ onDark?: boolean; height?: number; icon?: number; gap?: number }) {
  const logo = <Logo variant={onDark ? 'blanco' : 'azul'} height={height} />;
  if (!icon) return logo;

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap, minWidth: 0, flex: '0 1 auto' }}>
      <AppIcon size={icon} />
      {logo}
    </span>
  );
}
