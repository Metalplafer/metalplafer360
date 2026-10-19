import { useEffect, useRef, useState } from 'react';
import { Check, Star } from 'lucide-react';
import { suppliersForMaterial } from '@/services/suppliers';
import { suggestSuppliers } from '@/services/materials';
import { useDebounce } from '@/hooks/useDebounce';
import type { SupplierSuggestion } from '@/types/db';

/**
 * EL PROVEEDOR DE UN MATERIAL.
 *
 * Sustituye al campo de texto suelto de antes, pero NO obliga a elegir de
 * la lista, y eso es a propósito:
 *
 *   · si se elige uno de la lista, se guarda el vínculo («supplier_id») y
 *     además su nombre en el texto, que es la columna que leen los
 *     informes de siempre;
 *   · si se escribe a mano, se guarda solo el texto, exactamente como
 *     funcionaba antes. Hay proveedores de los que solo se sabe el
 *     nombre, y a veces se compra a uno de paso.
 *
 * Lo que propone depende del material que se esté pidiendo: primero los
 * proveedores HABITUALES de ese material, y si no tiene ninguno, los más
 * usados. Mientras no haya proveedores dados de alta, cae en la
 * sugerencia de texto de siempre, así que la pantalla sigue siendo útil
 * desde el primer día y no hace falta migrar nada para usarla.
 */
export function SupplierPicker({ id, materialName, value, supplierId, onChange }: {
  id: string;
  /** El material que se está pidiendo. Decide qué proveedores se proponen. */
  materialName: string;
  /** El nombre del proveedor en texto. Es lo que se guarda siempre. */
  value: string;
  /** El proveedor de la lista, si se ha elegido uno. */
  supplierId: string | null;
  onChange: (next: { supplier: string; supplier_id: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SupplierSuggestion[]>([]);
  /** Los nombres ya escritos a mano, para cuando no haya proveedores dados de alta. */
  const [textos, setTextos] = useState<{ supplier: string; veces: number }[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const material = useDebounce(materialName, 300);
  const escrito = useDebounce(value, 250);

  useEffect(() => {
    let alive = true;
    suppliersForMaterial(material || '')
      .then((rows) => { if (alive) setOptions(rows); })
      .catch(() => { if (alive) setOptions([]); });
    return () => { alive = false; };
  }, [material]);

  // El respaldo de siempre: los nombres ya escritos a mano.
  useEffect(() => {
    let alive = true;
    suggestSuppliers(escrito)
      .then((rows) => { if (alive) setTextos(rows); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [escrito]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const buscado = value.trim().toLowerCase();
  const deLista = options.filter((o) => !buscado || o.name.toLowerCase().includes(buscado));
  const habituales = deLista.filter((o) => o.habitual);
  const otros = deLista.filter((o) => !o.habitual);

  // Los textos a mano solo se proponen si no están ya en la lista: si el
  // proveedor está dado de alta, es mejor elegirlo que repetir el texto.
  const nombresDeLista = new Set(options.map((o) => o.name.toLowerCase()));
  const soloTexto = textos.filter((o) =>
    !nombresDeLista.has(o.supplier.toLowerCase())
    && o.supplier.toLowerCase() !== buscado);

  const hayAlgo = habituales.length + otros.length + soloTexto.length > 0;

  function elegir(o: SupplierSuggestion) {
    onChange({ supplier: o.name, supplier_id: o.id });
    setOpen(false);
  }

  return (
    <div className="suggest" ref={box}>
      <input
        id={id}
        className="input"
        value={value}
        autoComplete="off"
        placeholder="Elige un proveedor o escríbelo"
        onChange={(e) => {
          // Al escribir a mano se suelta el vínculo con la lista: el
          // texto y el proveedor elegido no pueden decir cosas distintas.
          onChange({ supplier: e.target.value, supplier_id: null });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {supplierId && (
        <small className="faint" style={{ display: 'block', marginTop: 4 }}>
          <Check size={13} aria-hidden /> De la lista de proveedores
        </small>
      )}
      {open && hayAlgo && (
        <div className="suggest-box" role="listbox" aria-label="Proveedores">
          {habituales.length > 0 && (
            <>
              <div className="title">
                {material.trim()
                  ? `Habituales de «${material.trim()}»`
                  : 'Proveedores habituales'}
              </div>
              {habituales.slice(0, 6).map((o) => (
                <button key={o.id} type="button" onClick={() => elegir(o)}>
                  <strong><Star size={13} aria-hidden /> {o.name}</strong>
                  <small>{o.phone ?? 'sin teléfono'}</small>
                </button>
              ))}
            </>
          )}
          {otros.length > 0 && (
            <>
              <div className="title">Proveedores</div>
              {otros.slice(0, 6).map((o) => (
                <button key={o.id} type="button" onClick={() => elegir(o)}>
                  <strong>{o.name}</strong>
                  <small>{o.veces === 1 ? '1 material' : `${o.veces} materiales`}</small>
                </button>
              ))}
            </>
          )}
          {soloTexto.length > 0 && (
            <>
              <div className="title">Escritos a mano anteriormente</div>
              {soloTexto.slice(0, 4).map((o) => (
                <button key={o.supplier} type="button"
                        onClick={() => {
                          onChange({ supplier: o.supplier, supplier_id: null });
                          setOpen(false);
                        }}>
                  <strong>{o.supplier}</strong>
                  <small>{o.veces === 1 ? '1 vez' : `${o.veces} veces`}</small>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
