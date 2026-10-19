import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Field, Panel } from '@/components/ui/Layout';
import type { ProjectProductDraft } from '@/types/db';

export const emptyProduct: ProjectProductDraft = {
  name: '', description: '', measures: '', finish: '',
};

/** Un bloque está vacío si no se ha escrito NADA en él. */
export function productoVacio(p: ProjectProductDraft) {
  return !p.name.trim() && !p.description.trim() && !p.measures.trim() && !p.finish.trim();
}

/**
 * LOS PRODUCTOS DE UN PROYECTO.
 *
 * Un proyecto puede ser varias piezas: una barandilla de escalera Y dos
 * rejas, cada cosa con sus medidas y su acabado. Antes todo eso se metía
 * a la fuerza en un mismo campo de texto.
 *
 * Dos reglas que no son un capricho de la pantalla:
 *
 *   · SIEMPRE queda al menos un producto. No se puede borrar el último,
 *     porque un proyecto sin ningún producto no se sabe qué es. La base
 *     de datos también se niega, así que no depende de que este botón
 *     esté escondido.
 *   · EL PRIMERO es el que se copia al proyecto, y por eso el orden
 *     importa: el móvil del trabajador y los informes leen por las
 *     columnas del proyecto. Se dice en la pantalla para que nadie
 *     reordene sin saber qué cambia.
 */
export function ProductBlocks({ products, onChange }: {
  products: ProjectProductDraft[];
  onChange: (next: ProjectProductDraft[]) => void;
}) {
  const set = (i: number, patch: Partial<ProjectProductDraft>) =>
    onChange(products.map((p, n) => (n === i ? { ...p, ...patch } : p)));

  const quitar = (i: number) => onChange(products.filter((_, n) => n !== i));

  const mover = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= products.length) return;
    const next = [...products];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const varios = products.length > 1;

  return (
    <div className="stack">
      {products.map((p, i) => (
        <Panel
          key={i}
          title={<>
            {varios ? `Producto ${i + 1}` : 'Producto'}
            {varios && i === 0 && (
              <small className="faint" style={{ marginLeft: 8, fontWeight: 400 }}>
                es el que ve el trabajador en su móvil
              </small>
            )}
          </>}
          actions={varios ? <>
            <button type="button" className="btn btn-ghost icon-btn"
                    onClick={() => mover(i, -1)} disabled={i === 0}
                    aria-label={`Subir el producto ${i + 1}`}><ChevronUp /></button>
            <button type="button" className="btn btn-ghost icon-btn"
                    onClick={() => mover(i, 1)} disabled={i === products.length - 1}
                    aria-label={`Bajar el producto ${i + 1}`}><ChevronDown /></button>
            <button type="button" className="btn btn-ghost icon-btn"
                    onClick={() => quitar(i)}
                    aria-label={`Quitar el producto ${i + 1}`}><Trash2 /></button>
          </> : undefined}
        >
          <div className="form-grid">
            <Field label="Qué es" htmlFor={`pp-name-${i}`} span
                   hint="Por ejemplo: barandilla de escalera, reja de ventana…">
              <input id={`pp-name-${i}`} className="input" value={p.name}
                     onChange={(e) => set(i, { name: e.target.value })} />
            </Field>

            <Field label="Descripción" htmlFor={`pp-desc-${i}`} span>
              <textarea id={`pp-desc-${i}`} className="textarea" rows={2} value={p.description}
                        onChange={(e) => set(i, { description: e.target.value })} />
            </Field>

            <Field label="Medidas" htmlFor={`pp-measures-${i}`}
                   hint="Por ejemplo: 6,00 × 4,50 m o 4 ud · 1,20 × 1,40 m">
              <input id={`pp-measures-${i}`} className="input" value={p.measures}
                     onChange={(e) => set(i, { measures: e.target.value })} />
            </Field>

            <Field label="Acabado" htmlFor={`pp-finish-${i}`}
                 hint="Por ejemplo: galvanizado + lacado RAL 7016">
            <input id={`pp-finish-${i}`} className="input" value={p.finish}
                   onChange={(e) => set(i, { finish: e.target.value })} />
            </Field>
          </div>
        </Panel>
      ))}

      <div className="row">
        <button type="button" className="btn"
                onClick={() => onChange([...products, { ...emptyProduct }])}>
          <Plus />Añadir otro producto
        </button>
      </div>

      <p className="hint" style={{ margin: 0 }}>
        El presupuesto, las horas previstas y la dirección son del proyecto entero,
        no de cada producto.
      </p>
    </div>
  );
}
