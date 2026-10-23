import { describe, expect, it } from 'vitest';
import {
  parseVincular, rutaDestino, vincularParam,
} from '../../src/lib/vinculos';

/**
 * MEJORA 2 · A QUÉ SE VINCULA UNA VISITA TÉCNICA.
 *
 * Lo que llega por la dirección lo puede escribir cualquiera, así que lo
 * que importa aquí es que un texto raro NO se cuele y que el formulario
 * siga funcionando como si no hubiera nada: una visita sin vincular es
 * un fastidio, pero una llamada con basura dentro es otra cosa.
 */
describe('a qué se vincula una visita técnica', () => {
  it('lee los tres destinos que existen', () => {
    expect(parseVincular('proyecto:abc123')).toEqual({ tipo: 'proyecto', id: 'abc123' });
    expect(parseVincular('presupuesto:abc123')).toEqual({ tipo: 'presupuesto', id: 'abc123' });
    expect(parseVincular('aviso:abc123')).toEqual({ tipo: 'aviso', id: 'abc123' });
  });

  it('acepta un identificador de Supabase', () => {
    const uuid = '7b1c3f2a-4d5e-4a7b-8c9d-0e1f2a3b4c5d';
    expect(parseVincular(`proyecto:${uuid}`)).toEqual({ tipo: 'proyecto', id: uuid });
  });

  it('no se traga lo que no es un destino', () => {
    expect(parseVincular('cliente:abc123')).toBeNull();
    expect(parseVincular('PROYECTO:abc123')).toBeNull();
    expect(parseVincular('abc123')).toBeNull();
    expect(parseVincular('proyecto')).toBeNull();
    expect(parseVincular('proyecto:')).toBeNull();
  });

  it('ni nada que venga vacío', () => {
    expect(parseVincular(null)).toBeNull();
    expect(parseVincular(undefined)).toBeNull();
    expect(parseVincular('')).toBeNull();
  });

  /**
   * Un identificador con caracteres raros se descarta: va a acabar en
   * una llamada a la base de datos y en una dirección del navegador.
   */
  it('descarta identificadores con caracteres raros', () => {
    expect(parseVincular('proyecto:../../admin')).toBeNull();
    expect(parseVincular('proyecto:abc 123')).toBeNull();
    expect(parseVincular("proyecto:' or 1=1--")).toBeNull();
    expect(parseVincular('proyecto:<script>')).toBeNull();
    expect(parseVincular(`proyecto:${'x'.repeat(65)}`)).toBeNull();
  });

  it('y descarta un destino con dos puntos de más', () => {
    expect(parseVincular('proyecto:abc:123')).toBeNull();
  });

  it('escribe y vuelve a leer lo mismo', () => {
    const v = { tipo: 'presupuesto' as const, id: 'f-9' };
    expect(parseVincular(vincularParam(v.tipo, v.id))).toEqual(v);
  });

  it('lleva de vuelta al sitio del que se salió', () => {
    expect(rutaDestino({ tipo: 'proyecto', id: 'p1' })).toBe('/admin/proyectos/p1');
    expect(rutaDestino({ tipo: 'presupuesto', id: 'f1' })).toBe('/admin/fichas/f1');
    // Un aviso también es una ficha: misma pantalla.
    expect(rutaDestino({ tipo: 'aviso', id: 'a1' })).toBe('/admin/fichas/a1');
  });
});
