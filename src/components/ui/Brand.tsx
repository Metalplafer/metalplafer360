import { useState } from 'react';

/**
 * LOGO CORPORATIVO DE METALPLAFER.
 *
 * Coloca los archivos oficiales en la carpeta public/brand/:
 *   public/brand/logo-azul.png    → para fondos claros
 *   public/brand/logo-blanco.png  → para fondos oscuros
 *
 * Mientras no estén, se muestra el nombre en texto como marcador
 * provisional. El logo no se redibuja ni se sustituye por otro.
 */
export function Logo({ variant, height = 26 }: { variant: 'azul' | 'blanco'; height?: number }) {
  const [missing, setMissing] = useState(false);
  const color = variant === 'blanco' ? '#FFFFFF' : '#1D4F91';

  if (!missing) {
    return (
      <img
        src={`${import.meta.env.BASE_URL}brand/logo-${variant}.png`}
        alt="Metalplafer"
        style={{ height, width: 'auto' }}
        onError={() => setMissing(true)}
      />
    );
  }
  return (
    <span
      aria-label="Metalplafer"
      style={{
        fontFamily: 'var(--font)', fontWeight: 600, fontSize: height * 0.62,
        letterSpacing: '.02em', color, lineHeight: 1,
      }}
    >
      Metalplafer
    </span>
  );
}

/**
 * Isotipo propio de METALPLAFER360 (placa metálica con «360»).
 * Complementa al logo corporativo: se usa en el favicon, en el icono de
 * la aplicación instalada y junto al nombre. No lo sustituye.
 */
export function Isotype({ size = 34, light }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden role="presentation">
      <rect x="2" y="2" width="60" height="60" rx="10" fill={light ? '#1D4F91' : '#14243A'} />
      <circle cx="10.5" cy="10.5" r="2.3" fill="#9FB0C4" />
      <circle cx="53.5" cy="10.5" r="2.3" fill="#9FB0C4" />
      <circle cx="10.5" cy="53.5" r="2.3" fill="#9FB0C4" />
      <circle cx="53.5" cy="53.5" r="2.3" fill="#9FB0C4" />
      <circle cx="32" cy="32" r="19" fill="none" stroke="#F2B705" strokeWidth="3.4"
              strokeLinecap="round" strokeDasharray="89 30" transform="rotate(-58 32 32)" />
      <text x="32" y="39.5" textAnchor="middle" fontFamily="Barlow Condensed, Arial Narrow, sans-serif"
            fontWeight="700" fontSize="21" fill="#FFFFFF">360</text>
    </svg>
  );
}

/** Logo corporativo + «360», la firma de la aplicación. */
export function AppMark({ onDark }: { onDark?: boolean }) {
  return (
    <span className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
      <Isotype size={32} light={!onDark} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <Logo variant={onDark ? 'blanco' : 'azul'} height={18} />
        <span style={{
          fontFamily: 'var(--font-cond)', fontWeight: 600, fontSize: 13,
          letterSpacing: '.18em', color: onDark ? '#F2B705' : '#5B6778',
        }}>360</span>
      </span>
    </span>
  );
}
