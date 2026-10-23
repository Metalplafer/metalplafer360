import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BLANCO, CONTRASTE_MINIMO, TINTA, contraste, esHex, luminancia, normalizaHex, seLee, textoSobre,
} from '../../src/lib/colores';
import { CALENDAR_COLOR, CALENDAR_KINDS, coloresCalendario } from '../../src/config/constants';

/**
 * MEJORA 4 · COLORES QUE SE PUEDEN LEER.
 *
 * La pastilla del calendario se pinta entera del color de su categoría,
 * y ese color lo elige una persona en Configuración. Por eso el color
 * del texto se calcula: lo que aquí se comprueba es que el cálculo
 * acierta con colores de verdad, incluidos los que más se parecen entre
 * el blanco y el negro, que son donde se equivocaría.
 */
describe('el color del texto sobre un fondo', () => {
  it('sobre los colores de serie del calendario, siempre se lee', () => {
    CALENDAR_KINDS.forEach((k) => {
      const fondo = CALENDAR_COLOR[k];
      expect(seLee(fondo), `${k} (${fondo}) no se lee`).toBe(true);
      expect(contraste(fondo, textoSobre(fondo))).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    });
  });

  it('pone texto blanco sobre un fondo oscuro', () => {
    expect(textoSobre('#14243a')).toBe(BLANCO);
    expect(textoSobre('#000000')).toBe(BLANCO);
    expect(textoSobre('#1d4f91')).toBe(BLANCO);
  });

  it('y texto oscuro sobre un fondo claro', () => {
    expect(textoSobre('#ffffff')).toBe(TINTA);
    expect(textoSobre('#f2b705')).toBe(TINTA);   // el amarillo de señalización
    expect(textoSobre('#e8eff8')).toBe(TINTA);
  });

  /**
   * El caso que de verdad importa: un amarillo fuerte. Con texto blanco
   * fijo —que es lo que hacía la hoja de estilos— no se lee, y es
   * justamente un color que alguien va a elegir.
   */
  it('con un amarillo, el blanco NO valdría y lo sabe', () => {
    const amarillo = '#ffd400';
    expect(contraste(amarillo, BLANCO)).toBeLessThan(CONTRASTE_MINIMO);
    expect(textoSobre(amarillo)).toBe(TINTA);
    expect(seLee(amarillo)).toBe(true);
  });

  it('el contraste es simétrico y vale 1 contra uno mismo', () => {
    expect(contraste('#123456', '#123456')).toBeCloseTo(1, 5);
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contraste('#1d4f91', '#ffffff')).toBeCloseTo(contraste('#ffffff', '#1d4f91'), 10);
  });

  it('la luminancia va de 0 (negro) a 1 (blanco)', () => {
    expect(luminancia('#000000')).toBeCloseTo(0, 5);
    expect(luminancia('#ffffff')).toBeCloseTo(1, 5);
    // El verde pesa más que el azul para el ojo: no es la media de los
    // canales, y de eso depende todo lo anterior.
    expect(luminancia('#00ff00')).toBeGreaterThan(luminancia('#0000ff'));
  });

  /**
   * El peor color posible es el que está a la misma distancia del blanco
   * y de la tinta: ahí ninguna de las dos opciones llega al umbral. Se
   * buscó midiendo, no a ojo: el gris medio «#808080» da 3,95 contra el
   * blanco y 3,96 contra la tinta.
   *
   * Y queda dicho que el gris «#767676» —el que se cita siempre como el
   * límite sobre blanco— SÍ pasa aquí (4,54 con texto blanco): el umbral
   * no es un adorno, está medido contra las dos opciones.
   */
  it('avisa de un color que no se va a leer bien ni con blanco ni con tinta', () => {
    expect(seLee('#808080')).toBe(false);
    expect(seLee('#767676')).toBe(true);
    expect(seLee('#000000')).toBe(true);
    expect(seLee('#ffffff')).toBe(true);
  });
});

describe('leer un color escrito a mano', () => {
  it('acepta «#rrggbb» y lo deja en minúsculas', () => {
    expect(normalizaHex('#AABBCC')).toBe('#aabbcc');
    expect(normalizaHex('  #1d4f91  ')).toBe('#1d4f91');
    expect(esHex('#AABBCC')).toBe(true);
  });

  it('expande la forma corta «#abc»', () => {
    expect(normalizaHex('#abc')).toBe('#aabbcc');
    expect(normalizaHex('#FFF')).toBe('#ffffff');
  });

  it('y rechaza lo que no es un color', () => {
    ['rojo', '#12345', '#1234567', 'rgb(1,2,3)', '', '#gggggg', '1d4f91'].forEach((v) => {
      expect(normalizaHex(v), v).toBeNull();
      expect(esHex(v), v).toBe(false);
    });
  });
});

describe('los colores que de verdad se pintan', () => {
  it('sin nada elegido, son los de serie', () => {
    expect(coloresCalendario(null)).toEqual(CALENDAR_COLOR);
    expect(coloresCalendario({})).toEqual(CALENDAR_COLOR);
  });

  it('lo elegido sustituye solo a su categoría', () => {
    const c = coloresCalendario({ fabricacion: '#ff0000' });
    expect(c.fabricacion).toBe('#ff0000');
    expect(c.montaje).toBe(CALENDAR_COLOR.montaje);
  });

  it('se ignora lo que no es un color o no es una categoría', () => {
    const c = coloresCalendario({
      fabricacion: 'rojo', montaje: '#0f0', inventada: '#123456',
    } as Record<string, string>);
    expect(c.fabricacion).toBe(CALENDAR_COLOR.fabricacion);
    expect(c.montaje).toBe('#00ff00');
    expect(Object.keys(c).sort()).toEqual([...CALENDAR_KINDS].sort());
  });
});

/**
 * LA PALETA ESTÁ ESCRITA DOS VECES: en «tokens.css», que es de donde la
 * toman los estilos de toda la aplicación, y en «CALENDAR_COLOR», que es
 * de donde la toma el cálculo del contraste. Hace falta que esté en los
 * dos sitios —el navegador no deja mirar dentro de un «var()» sin pedir
 * el estilo calculado de un elemento—, y entonces hace falta esto: una
 * prueba que lea el archivo y compruebe que no se han separado.
 */
describe('la paleta de los tokens y la del código no se separan', () => {
  const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

  it('cada categoría tiene su variable --ev-* con el mismo valor', () => {
    CALENDAR_KINDS.forEach((k) => {
      const m = css.match(new RegExp(`--ev-${k}:\\s*(#[0-9a-fA-F]{3,6})`));
      expect(m, `falta --ev-${k} en tokens.css`).not.toBeNull();
      expect(normalizaHex(m![1]), `--ev-${k}`).toBe(normalizaHex(CALENDAR_COLOR[k]));
    });
  });
});
