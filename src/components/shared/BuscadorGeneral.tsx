import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/Layout';
import { buscar, rutaDelResultado } from '@/services/buscador';
import { toUserMessage } from '@/lib/errors';
import type { SearchHit } from '@/types/db';

const ETIQUETA: Record<SearchHit['tipo'], string> = {
  proyecto: 'Proyecto',
  presupuesto: 'Presupuesto',
  aviso: 'Aviso',
};

const TONO: Record<SearchHit['tipo'], 'blue' | 'steel' | 'red'> = {
  proyecto: 'blue',
  presupuesto: 'steel',
  aviso: 'red',
};

/**
 * EL BUSCADOR DE ADMINISTRACIÓN · arriba, siempre a mano.
 *
 * Busca en TODA la base de datos a la que llega administración, no en
 * lo que haya cargado la pantalla. Escribe el nombre de un cliente y
 * salen sus proyectos, sus presupuestos y sus avisos, porque el cruce
 * lo hace la base de datos.
 *
 * NO SE CONSULTA EN CADA TECLA. Hay 250 ms de espera desde la última:
 * escribir «comunidad» son nueve pulsaciones y una sola consulta. Y si
 * una respuesta llega tarde, se descarta: sin eso, teclear deprisa
 * acaba enseñando los resultados de una búsqueda que ya no es la que
 * hay escrita.
 *
 * Se cierra con Escape, pulsando fuera o con la equis.
 */
export function BuscadorGeneral() {
  const [texto, setTexto] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // El número de la última búsqueda pedida. Sirve para tirar las
  // respuestas que lleguen fuera de orden.
  const turno = useRef(0);

  useEffect(() => {
    const t = texto.trim();
    if (t.length < 2) { setHits([]); setBuscando(false); setError(null); return undefined; }

    setBuscando(true);
    const mio = ++turno.current;
    const espera = setTimeout(() => {
      buscar(t)
        .then((r) => { if (mio === turno.current) { setHits(r); setError(null); } })
        .catch((e) => { if (mio === turno.current) { setHits([]); setError(toUserMessage(e)); } })
        .finally(() => { if (mio === turno.current) setBuscando(false); });
    }, 250);

    return () => clearTimeout(espera);
  }, [texto]);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  function limpiar() {
    setTexto('');
    setHits([]);
    setError(null);
    setAbierto(false);
  }

  function ir(h: SearchHit) {
    limpiar();
    navigate(rutaDelResultado(h));
  }

  const corto = texto.trim().length > 0 && texto.trim().length < 2;
  const hayPanel = abierto && texto.trim().length > 0;

  return (
    <div className="buscador" ref={caja}>
      <label className="buscador-caja">
        <Search size={16} aria-hidden />
        <input
          type="search"
          className="buscador-input"
          placeholder="Buscar proyecto, presupuesto, aviso o cliente…"
          aria-label="Buscar en METALPLAFER360"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
        />
        {texto && (
          <button type="button" className="buscador-limpiar" onClick={limpiar}
                  aria-label="Limpiar la búsqueda"><X size={14} /></button>
        )}
      </label>

      {hayPanel && (
        <div className="buscador-panel" role="dialog" aria-label="Resultados de la búsqueda">
          {corto ? (
            <p className="buscador-nada">Escribe al menos dos letras.</p>
          ) : error ? (
            <p className="buscador-nada">{error}</p>
          ) : buscando ? (
            <p className="buscador-nada">
              <Loader2 size={14} className="girando" aria-hidden /> Buscando…
            </p>
          ) : !hits.length ? (
            <p className="buscador-nada">
              No hay nada que coincida con «{texto.trim()}».
            </p>
          ) : (
            <ul className="buscador-lista">
              {hits.map((h) => (
                <li key={`${h.tipo}-${h.id}`}>
                  <button type="button" onClick={() => ir(h)}>
                    <span className="buscador-fila">
                      <Badge tone={TONO[h.tipo]} plain>{ETIQUETA[h.tipo]}</Badge>
                      <strong>{h.code}</strong>
                      <span className="buscador-titulo">{h.titulo || '—'}</span>
                    </span>
                    <span className="buscador-pie">
                      {h.cliente && <span>{h.cliente}</span>}
                      {h.estado && <span>· {h.estado}</span>}
                      {h.extra && <span>· {h.extra}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
