/**
 * EL REPARTO DE LAS PASTILLAS DEL CALENDARIO.
 *
 * Son las cuentas que deciden dónde se pinta cada barra. Se prueban aquí
 * y no en el navegador porque los casos que importan —el tramo que cruza
 * de semana, el que cruza de mes, dos que se pisan— se arman en una
 * línea y se comprueban exactamente.
 */
import { describe, expect, it } from 'vitest';
import {
  cubre, diasEntre, escondidosPorDia, masDias, repartirSemana, semanasDeLaRejilla,
  type Segmento, type Tramo,
} from '@/lib/calendario';
import { CALENDAR_DEFECTO, siguienteSeleccion } from '@/config/constants';

const t = (uid: string, starts: string, ends: string): Tramo => ({ uid, starts, ends });

/** Para leer los resultados de un vistazo. */
const resumen = (ss: Segmento<Tramo>[]) =>
  ss.map((s) => `${s.item.uid}:${s.col}+${s.span}@${s.lane}`
    + `${s.continuaAntes ? '<' : ''}${s.continuaDespues ? '>' : ''}`);

describe('cuentas de días', () => {
  it('los días que van de una fecha a otra', () => {
    expect(diasEntre('2026-11-02', '2026-11-07')).toBe(5);
    expect(diasEntre('2026-11-07', '2026-11-02')).toBe(-5);
    expect(diasEntre('2026-11-02', '2026-11-02')).toBe(0);
  });

  it('cruzando el cambio de mes y el de año', () => {
    expect(diasEntre('2026-10-30', '2026-11-02')).toBe(3);
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3);
    expect(masDias('2026-10-30', 3)).toBe('2026-11-02');
    expect(masDias('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('el cambio de hora no desplaza un día', () => {
    // El último domingo de octubre y el de marzo: si las cuentas se
    // hicieran en hora local, aquí saldría un día de más o de menos.
    expect(diasEntre('2026-10-24', '2026-10-26')).toBe(2);
    expect(masDias('2026-10-24', 2)).toBe('2026-10-26');
    expect(diasEntre('2027-03-27', '2027-03-29')).toBe(2);
    expect(masDias('2027-03-27', 2)).toBe('2027-03-29');
  });

  it('un tramo cubre sus días, y ni uno más', () => {
    const tramo = t('a', '2026-11-04', '2026-11-09');
    expect(cubre(tramo, '2026-11-03')).toBe(false);
    expect(cubre(tramo, '2026-11-04')).toBe(true);
    expect(cubre(tramo, '2026-11-07')).toBe(true);
    expect(cubre(tramo, '2026-11-09')).toBe(true);
    expect(cubre(tramo, '2026-11-10')).toBe(false);
  });
});

describe('una pastilla por tramo, no una por día', () => {
  it('un tramo de seis días es UNA barra de seis columnas', () => {
    // Lunes 2 a sábado 7 de noviembre de 2026, en la semana del lunes 2.
    const ss = repartirSemana([t('m', '2026-11-02', '2026-11-07')], '2026-11-02');
    expect(ss).toHaveLength(1);
    expect(resumen(ss)).toEqual(['m:0+6@0']);
  });

  it('un evento de un día ocupa una sola columna', () => {
    const ss = repartirSemana([t('v', '2026-11-05', '2026-11-05')], '2026-11-02');
    expect(resumen(ss)).toEqual(['v:3+1@0']);
  });

  it('un tramo que no toca la semana no se pinta', () => {
    const ss = repartirSemana([t('x', '2026-11-16', '2026-11-20')], '2026-11-02');
    expect(ss).toEqual([]);
  });
});

describe('tramos que cruzan de semana y de mes', () => {
  it('se corta al final de la semana y se marca que sigue', () => {
    // Del miércoles 4 al lunes 9: la primera semana acaba el domingo 8.
    const ss = repartirSemana([t('m', '2026-11-04', '2026-11-09')], '2026-11-02');
    expect(resumen(ss)).toEqual(['m:2+5@0>']);
  });

  it('y continúa en la semana siguiente, marcado por delante', () => {
    const ss = repartirSemana([t('m', '2026-11-04', '2026-11-09')], '2026-11-09');
    expect(resumen(ss)).toEqual(['m:0+1@0<']);
  });

  it('un tramo que empieza en un mes y acaba en el siguiente se pinta entero', () => {
    // Del 28 de octubre al 3 de noviembre, visto desde la semana del 26
    // de octubre: ocupa de la columna 2 a la 6 y sigue.
    const tramo = t('p', '2026-10-28', '2026-11-03');
    expect(resumen(repartirSemana([tramo], '2026-10-26'))).toEqual(['p:2+5@0>']);
    expect(resumen(repartirSemana([tramo], '2026-11-02'))).toEqual(['p:0+2@0<']);
  });

  it('un tramo que empieza antes y acaba después ocupa la semana entera', () => {
    const ss = repartirSemana([t('larga', '2026-10-20', '2026-12-20')], '2026-11-02');
    expect(resumen(ss)).toEqual(['larga:0+7@0<>']);
  });
});

describe('varias pastillas el mismo día no se pisan', () => {
  it('dos tramos que se solapan van en carriles distintos', () => {
    const ss = repartirSemana([
      t('a', '2026-11-02', '2026-11-04'),
      t('b', '2026-11-03', '2026-11-05'),
    ], '2026-11-02');
    expect(resumen(ss)).toEqual(['a:0+3@0', 'b:1+3@1']);
  });

  it('dos que NO se solapan comparten carril', () => {
    const ss = repartirSemana([
      t('a', '2026-11-02', '2026-11-03'),
      t('b', '2026-11-05', '2026-11-06'),
    ], '2026-11-02');
    expect(resumen(ss)).toEqual(['a:0+2@0', 'b:3+2@0']);
  });

  it('las barras largas quedan arriba y las cortas debajo', () => {
    const ss = repartirSemana([
      t('corta', '2026-11-02', '2026-11-02'),
      t('larga', '2026-11-02', '2026-11-06'),
    ], '2026-11-02');
    expect(resumen(ss)).toEqual(['larga:0+5@0', 'corta:0+1@1']);
  });

  it('el reparto no cambia entre repintados', () => {
    const tramos = [
      t('c', '2026-11-03', '2026-11-03'),
      t('a', '2026-11-03', '2026-11-03'),
      t('b', '2026-11-03', '2026-11-03'),
    ];
    const uno = resumen(repartirSemana(tramos, '2026-11-02'));
    const otro = resumen(repartirSemana([...tramos].reverse(), '2026-11-02'));
    expect(uno).toEqual(otro);
    expect(uno).toEqual(['a:1+1@0', 'b:1+1@1', 'c:1+1@2']);
  });

  it('cada carril se reutiliza en cuanto queda libre', () => {
    const ss = repartirSemana([
      t('a', '2026-11-02', '2026-11-03'),
      t('b', '2026-11-02', '2026-11-03'),
      t('c', '2026-11-04', '2026-11-05'),
    ], '2026-11-02');
    expect(resumen(ss)).toEqual(['a:0+2@0', 'b:0+2@1', 'c:2+2@0']);
  });
});

describe('cuando no caben todas', () => {
  const muchos = [
    t('a', '2026-11-02', '2026-11-06'),
    t('b', '2026-11-02', '2026-11-06'),
    t('c', '2026-11-02', '2026-11-06'),
    t('d', '2026-11-02', '2026-11-06'),
    t('e', '2026-11-04', '2026-11-04'),
  ];

  it('las que sobran se cuentan en cada día que ocupan', () => {
    const ss = repartirSemana(muchos, '2026-11-02');
    const escondidos = escondidosPorDia(ss, '2026-11-02', 3);
    // Sobran «d» (de lunes a viernes) y «e» (solo el miércoles).
    expect(escondidos.get('2026-11-02')).toBe(1);
    expect(escondidos.get('2026-11-04')).toBe(2);
    expect(escondidos.get('2026-11-06')).toBe(1);
    expect(escondidos.get('2026-11-07')).toBeUndefined();
  });

  it('si caben todas no se esconde ninguna', () => {
    const ss = repartirSemana(muchos, '2026-11-02');
    expect([...escondidosPorDia(ss, '2026-11-02', 9).keys()]).toEqual([]);
  });
});

describe('la rejilla del mes', () => {
  it('son seis semanas que empiezan en lunes', () => {
    const semanas = semanasDeLaRejilla('2026-09-28');
    expect(semanas).toHaveLength(6);
    expect(semanas[0]).toBe('2026-09-28');
    expect(semanas[5]).toBe('2026-11-02');
    semanas.forEach((s) => expect(new Date(`${s}T00:00:00Z`).getUTCDay()).toBe(1));
  });
});

describe('qué categorías quedan activas al pulsar', () => {
  it('al abrir el calendario solo están fabricación y montaje', () => {
    expect(CALENDAR_DEFECTO).toEqual(['fabricacion', 'montaje']);
  });

  it('las dos de proyecto pueden estar a la vez', () => {
    expect(siguienteSeleccion(['fabricacion'], 'montaje')).toEqual(['fabricacion', 'montaje']);
    expect(siguienteSeleccion(['montaje'], 'fabricacion')).toEqual(['fabricacion', 'montaje']);
  });

  it('y se pueden quitar una a una', () => {
    expect(siguienteSeleccion(['fabricacion', 'montaje'], 'montaje')).toEqual(['fabricacion']);
    expect(siguienteSeleccion(['fabricacion', 'montaje'], 'fabricacion')).toEqual(['montaje']);
  });

  it('elegir una categoría suelta apaga todas las demás', () => {
    for (const suelta of ['aviso', 'material', 'obra', 'otro', 'visita'] as const) {
      expect(siguienteSeleccion(['fabricacion', 'montaje'], suelta)).toEqual([suelta]);
    }
  });

  it('una categoría suelta sustituye a otra suelta', () => {
    expect(siguienteSeleccion(['aviso'], 'material')).toEqual(['material']);
    expect(siguienteSeleccion(['material'], 'obra')).toEqual(['obra']);
    expect(siguienteSeleccion(['obra'], 'otro')).toEqual(['otro']);
  });

  it('desde una suelta, pulsar fabricación vuelve a proyectos con esa sola', () => {
    expect(siguienteSeleccion(['material'], 'fabricacion')).toEqual(['fabricacion']);
    expect(siguienteSeleccion(['aviso'], 'montaje')).toEqual(['montaje']);
  });

  it('pulsar la suelta que ya estaba activa vuelve a fabricación y montaje', () => {
    expect(siguienteSeleccion(['material'], 'material')).toEqual(['fabricacion', 'montaje']);
    expect(siguienteSeleccion(['obra'], 'obra')).toEqual(['fabricacion', 'montaje']);
  });

  it('nunca se queda el calendario sin ninguna categoría', () => {
    expect(siguienteSeleccion(['fabricacion'], 'fabricacion')).toEqual(['fabricacion']);
    expect(siguienteSeleccion(['montaje'], 'montaje')).toEqual(['montaje']);
  });

  it('el orden es siempre el mismo, se pulse como se pulse', () => {
    expect(siguienteSeleccion(['montaje'], 'fabricacion')).toEqual(['fabricacion', 'montaje']);
    expect(siguienteSeleccion(siguienteSeleccion(['aviso'], 'montaje'), 'fabricacion'))
      .toEqual(['fabricacion', 'montaje']);
  });
});
