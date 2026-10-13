import { Check, X } from 'lucide-react';

/**
 * DOS FECHAS, PARA ESCRIBIRLAS A MANO.
 *
 * Lo usan la ficha del proyecto (fabricación y montaje) y la ficha de la
 * obra (su periodo del calendario). Es solo la pantalla: quién guarda y
 * con qué reglas lo decide cada una.
 *
 * Se usa el selector de fecha del propio sistema («input type=date»), que
 * en el móvil abre el calendario nativo y ya entiende el formato de
 * España sin tener que programar nada.
 *
 * A PROPÓSITO NO SE COMPRUEBA DISPONIBILIDAD y no se pone «min» en el
 * inicio: se pidió que se pudiera guardar la fecha que se quiera, aunque
 * se solape con otro proyecto o caiga en festivo. Lo único que se impide
 * es un final anterior al inicio, que no es una regla de taller sino una
 * fecha imposible.
 */
export function RangoFechas({
  id, desde, hasta, onDesde, onHasta, onGuardar, onCancelar,
  guardando, etiquetaDesde = 'Desde', etiquetaHasta = 'Hasta', ayuda,
}: {
  id: string;
  desde: string;
  hasta: string;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
  onGuardar: () => void;
  onCancelar: () => void;
  guardando?: boolean;
  etiquetaDesde?: string;
  etiquetaHasta?: string;
  ayuda?: React.ReactNode;
}) {
  // Un final anterior al inicio no se deja enviar: se avisa aquí mismo
  // para no tener que ir al servidor a por el error. La base de datos lo
  // vuelve a comprobar de todas formas.
  const alReves = Boolean(desde && hasta && hasta < desde);

  return (
    <div className="stack" style={{ gap: 10, marginTop: 10 }}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor={`${id}-desde`}>{etiquetaDesde}</label>
          <input id={`${id}-desde`} className="input" type="date" value={desde}
                 disabled={guardando}
                 onChange={(e) => onDesde(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor={`${id}-hasta`}>{etiquetaHasta}</label>
          <input id={`${id}-hasta`} className="input" type="date" value={hasta}
                 disabled={guardando}
                 min={desde || undefined}
                 aria-invalid={alReves || undefined}
                 aria-describedby={alReves ? `${id}-error` : undefined}
                 onChange={(e) => onHasta(e.target.value)} />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary btn-sm" disabled={guardando || alReves}
                  onClick={onGuardar}>
            <Check />Guardar fechas
          </button>
          <button className="btn btn-sm" disabled={guardando} onClick={onCancelar}>
            <X />Cancelar
          </button>
        </div>
      </div>

      {alReves && (
        <p id={`${id}-error`} className="error-text" style={{ margin: 0 }} role="alert">
          El final no puede ser anterior al inicio.
        </p>
      )}
      {ayuda && <p className="hint" style={{ margin: 0 }}>{ayuda}</p>}
    </div>
  );
}
