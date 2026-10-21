/**
 * EL REPARTO DE LAS PASTILLAS DEL CALENDARIO.
 *
 * Aquí no hay pantalla: solo las cuentas. Están aparte a propósito,
 * porque es donde se esconden los fallos de un calendario —el tramo que
 * se corta mal al cambiar de semana, el que desaparece al cruzar de mes,
 * los dos que se pisan— y así se pueden probar una por una sin abrir un
 * navegador.
 *
 * La idea es la de cualquier calendario mensual: cada semana es una fila
 * de siete columnas, y un tramo que la cruza es UNA barra que ocupa
 * varias columnas. Si el tramo sigue en la semana siguiente, se corta y
 * continúa allí, marcado para que se vea que no se ha acabado.
 */

/** Un día en formato ISO, que es como vienen de la base de datos. */
export type Dia = string;

export interface Tramo {
  /** Identifica el tramo de forma única dentro del calendario. */
  uid: string;
  starts: Dia;
  ends: Dia;
}

export interface Segmento<T extends Tramo> {
  item: T;
  /** Columna donde empieza dentro de la semana, de 0 a 6. */
  col: number;
  /** Cuántas columnas ocupa, de 1 a 7. */
  span: number;
  /** Carril (fila de pastillas) dentro de la semana, empezando en 0. */
  lane: number;
  /** El tramo venía de la semana anterior. */
  continuaAntes: boolean;
  /** El tramo sigue en la semana siguiente. */
  continuaDespues: boolean;
}

const MS_DIA = 86_400_000;

/** Los días que van de una fecha a otra. Negativo si la segunda es anterior. */
export function diasEntre(desde: Dia, hasta: Dia): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_DIA);
}

/** El día que cae N días después. */
export function masDias(dia: Dia, n: number): Dia {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + n * MS_DIA).toISOString().slice(0, 10);
}

/** Si un tramo toca un día concreto. */
export function cubre(t: Tramo, dia: Dia): boolean {
  return t.starts <= dia && t.ends >= dia;
}

/**
 * REPARTIR LOS TRAMOS DE UNA SEMANA EN CARRILES.
 *
 * Devuelve, para cada tramo que toque la semana, en qué columna empieza,
 * cuántas ocupa y en qué carril va, de forma que dos pastillas del mismo
 * carril nunca se pisen.
 *
 * El orden importa y es el de un calendario: primero lo que empieza
 * antes y, a igualdad, lo que dura más. Así las barras largas quedan
 * arriba y las cortas se acomodan debajo, que es como se lee bien. A
 * igualdad de las dos cosas manda el identificador, para que el reparto
 * sea SIEMPRE el mismo y las pastillas no bailen al repintar.
 */
export function repartirSemana<T extends Tramo>(
  tramos: T[], lunes: Dia, dias = 7,
): Segmento<T>[] {
  const domingo = masDias(lunes, dias - 1);

  const enLaSemana = tramos
    .filter((t) => t.starts <= domingo && t.ends >= lunes)
    .map((t) => {
      const desde = Math.max(0, diasEntre(lunes, t.starts));
      const hasta = Math.min(dias - 1, diasEntre(lunes, t.ends));
      return {
        item: t,
        col: desde,
        span: Math.max(1, hasta - desde + 1),
        continuaAntes: t.starts < lunes,
        continuaDespues: t.ends > domingo,
      };
    })
    .sort((a, b) => (
      a.col - b.col
      || b.span - a.span
      || (a.item.uid < b.item.uid ? -1 : a.item.uid > b.item.uid ? 1 : 0)
    ));

  // Carriles: cada uno guarda hasta qué columna está ocupado.
  const ocupadoHasta: number[] = [];
  return enLaSemana.map((s) => {
    let lane = 0;
    while (ocupadoHasta[lane] !== undefined && ocupadoHasta[lane] >= s.col) lane += 1;
    ocupadoHasta[lane] = s.col + s.span - 1;
    return { ...s, lane };
  });
}

/**
 * Las semanas de la rejilla mensual: seis filas que empiezan en lunes.
 *
 * Son siempre seis para que la rejilla no cambie de alto al pasar de
 * mes, que es lo que hace que la pantalla pegue saltos.
 */
export function semanasDeLaRejilla(primerLunes: Dia, semanas = 6): Dia[] {
  return Array.from({ length: semanas }, (_, i) => masDias(primerLunes, i * 7));
}

/**
 * CUÁNTOS TRAMOS SE QUEDAN ESCONDIDOS EN CADA DÍA.
 *
 * Cuando una semana tiene más pastillas de las que caben, las de los
 * carriles de abajo no se pintan y en su lugar se dice cuántas hay. Se
 * cuenta POR DÍA, porque un tramo escondido que cruza tres días tiene
 * que contar en los tres: si no, un día saldría «+1» y el de al lado
 * nada, con el mismo evento detrás.
 */
export function escondidosPorDia<T extends Tramo>(
  segmentos: Segmento<T>[], lunes: Dia, carrilesVisibles: number, dias = 7,
): Map<Dia, number> {
  const cuenta = new Map<Dia, number>();
  segmentos
    .filter((s) => s.lane >= carrilesVisibles)
    .forEach((s) => {
      for (let i = s.col; i < Math.min(s.col + s.span, dias); i += 1) {
        const dia = masDias(lunes, i);
        cuenta.set(dia, (cuenta.get(dia) ?? 0) + 1);
      }
    });
  return cuenta;
}
