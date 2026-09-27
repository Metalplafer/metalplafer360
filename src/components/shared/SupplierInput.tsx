import { useEffect, useRef, useState } from 'react';
import { suggestSuppliers } from '@/services/materials';
import { useDebounce } from '@/hooks/useDebounce';

/**
 * Proveedor: se escribe libremente, y mientras se escribe la aplicación
 * propone los que ya se han utilizado. Nunca obliga a elegir uno.
 */
export function SupplierInput({ id, value, onChange }: {
  id: string; value: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<{ supplier: string; veces: number }[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const query = useDebounce(value, 250);

  useEffect(() => {
    let alive = true;
    suggestSuppliers(query)
      .then((rows) => { if (alive) setOptions(rows); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const shown = options.filter((o) => o.supplier.toLowerCase() !== value.trim().toLowerCase());

  return (
    <div className="suggest" ref={box}>
      <input
        id={id}
        className="input"
        value={value}
        autoComplete="off"
        placeholder="Escribe el proveedor"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && shown.length > 0 && (
        <div className="suggest-box" role="listbox" aria-label="Proveedores ya utilizados">
          <div className="title">Proveedores ya utilizados</div>
          {shown.slice(0, 6).map((o) => (
            <button key={o.supplier} type="button"
                    onClick={() => { onChange(o.supplier); setOpen(false); }}>
              <strong>{o.supplier}</strong>
              <small>{o.veces === 1 ? '1 vez' : `${o.veces} veces`}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
