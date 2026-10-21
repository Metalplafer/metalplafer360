/**
 * LA PANTALLA Y LA BASE DE DATOS, DE ACUERDO.
 *
 * Los subestados viven en DOS sitios: en «src/config/constants.ts», que
 * es lo que la pantalla ofrece, y dentro de «valid_substatus», que es lo
 * que la base de datos admite. Si se separan, la aplicación ofrece una
 * casilla que al guardarse revienta con un error de PostgreSQL en crudo,
 * y nadie se entera hasta que le pasa a alguien trabajando.
 *
 * Y las etiquetas viven en otros dos: en el mismo «constants.ts» y
 * dentro de «label_es», que es la que escribe el historial.
 *
 * Esta prueba no comprueba un caso concreto: LEE EL SQL de verdad, saca
 * los catálogos y exige que coincidan. Está escrita porque ya pasó:
 * «Lacado-Zincado» se añadió al catálogo de la base de datos y a la
 * pantalla, pero NO a «label_es», así que el historial escribía
 * «lacado_zincado» en crudo. Esto lo habría cazado el mismo día.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PHASES, SUBSTATUSES } from '@/config/constants';

const SQL = fileURLToPath(new URL('../../supabase/sql/', import.meta.url));

/**
 * El SQL de la aplicación, en el orden en que se instala.
 *
 * Importa el ORDEN: una función se redefine varias veces a lo largo de
 * las migraciones y la que queda viva es la del ÚLTIMO archivo. Mirar
 * cualquier otra sería comprobar una definición que ya no existe.
 */
function archivosSql(): string[] {
  return readdirSync(SQL)
    .filter((n) => /^[0-9][0-9]_.*\.sql$/.test(n) && !n.startsWith('05_'))
    .sort();
}

/** El cuerpo de la ÚLTIMA definición de una función. */
function ultimaDefinicion(nombre: string): string {
  let cuerpo: string | null = null;
  let donde = '';

  for (const archivo of archivosSql()) {
    const texto = readFileSync(join(SQL, archivo), 'utf8');
    const inicio = texto.lastIndexOf(`create or replace function public.${nombre}(`);
    if (inicio < 0) continue;
    const fin = texto.indexOf('$$;', inicio);
    if (fin < 0) throw new Error(`No encuentro el final de ${nombre} en ${archivo}`);
    cuerpo = texto.slice(inicio, fin);
    donde = archivo;
  }

  if (!cuerpo) throw new Error(`No encuentro ninguna definición de ${nombre} en supabase/sql`);
  // Deja constancia de dónde se leyó: si mañana alguien añade una
  // migración, esta prueba mira la nueva sin que haya que tocarla.
  expect(donde, `${nombre} se lee de ${donde}`).toMatch(/^[0-9][0-9]_/);
  return cuerpo;
}

/** Los subestados que la base de datos admite en cada fase. */
function subestadosDelSql(): Record<string, string[]> {
  const cuerpo = ultimaDefinicion('valid_substatus');
  const salida: Record<string, string[]> = {};

  for (const rama of cuerpo.matchAll(/when '([a-z_]+)' then p_sub in\s*\(([^)]*)\)/g)) {
    salida[rama[1]] = [...rama[2].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  }

  expect(Object.keys(salida).length, 'ramas encontradas en valid_substatus').toBeGreaterThan(0);
  return salida;
}

/** Las etiquetas en castellano que escribe el historial. */
function etiquetasDelSql(): Record<string, string> {
  const cuerpo = ultimaDefinicion('label_es');
  const salida: Record<string, string> = {};
  for (const par of cuerpo.matchAll(/when '([a-z_]+)'\s*then\s*'((?:[^']|'')*)'/g)) {
    salida[par[1]] = par[2].replace(/''/g, "'");
  }
  expect(Object.keys(salida).length, 'etiquetas encontradas en label_es').toBeGreaterThan(20);
  return salida;
}

describe('los subestados de la pantalla son los que admite la base de datos', () => {
  const sql = subestadosDelSql();

  it('cada fase ofrece exactamente lo que la base de datos acepta', () => {
    for (const fase of PHASES) {
      const pantalla = (SUBSTATUSES[fase] ?? []).map((s) => s.key).sort();
      const base = (sql[fase] ?? []).slice().sort();
      expect(pantalla, `fase ${fase}`).toEqual(base);
    }
  });

  it('y no hay ninguna fase con subestados en la base que la pantalla no ofrezca', () => {
    for (const fase of Object.keys(sql)) {
      expect(PHASES, `la base admite subestados de «${fase}»`).toContain(fase);
    }
  });

  it('un subestado de una fase no se cuela en otra', () => {
    // «falta_material» sí está en dos fases a propósito: el material
    // puede faltar fabricando y montando. El resto, no.
    const veces = new Map<string, number>();
    for (const fase of PHASES) {
      for (const s of SUBSTATUSES[fase] ?? []) veces.set(s.key, (veces.get(s.key) ?? 0) + 1);
    }
    const repetidos = [...veces].filter(([, n]) => n > 1).map(([k]) => k);
    expect(repetidos).toEqual(['falta_material']);
  });
});

describe('el historial escribe en castellano lo mismo que enseña la pantalla', () => {
  const etiquetas = etiquetasDelSql();

  it('todos los subestados tienen su etiqueta, y es la misma', () => {
    // Esta es la que faltaba con «Lacado-Zincado»: la clave estaba en el
    // catálogo pero no aquí, así que el historial la escribía en crudo.
    for (const fase of PHASES) {
      for (const s of SUBSTATUSES[fase] ?? []) {
        expect(etiquetas[s.key], `etiqueta de ${s.key} en label_es`).toBe(s.label);
      }
    }
  });

  it('y la Supabase de pruebas escribe las mismas etiquetas', () => {
    // Hay una TERCERA copia: la de «tests/e2e/fake-supabase.mjs», que es
    // la que escribe el historial en las pruebas de navegador. Si se
    // queda atrás, esas pruebas dicen que todo va bien mientras la
    // pantalla de verdad enseña la clave técnica en crudo. Pasó: el
    // historial del subestado se escribía sin traducir.
    const fake = readFileSync(
      fileURLToPath(new URL('../e2e/fake-supabase.mjs', import.meta.url)), 'utf8');
    const bloque = fake.slice(fake.indexOf('const SUBSTATUS_ES = {'));
    const mapa: Record<string, string> = {};
    for (const par of bloque.slice(0, bloque.indexOf('};')).matchAll(/([a-z_]+): '([^']+)'/g)) {
      mapa[par[1]] = par[2];
    }

    expect(Object.keys(mapa).length, 'etiquetas en la Supabase de pruebas').toBeGreaterThan(10);
    for (const fase of PHASES) {
      for (const s of SUBSTATUSES[fase] ?? []) {
        expect(mapa[s.key], `etiqueta de ${s.key} en fake-supabase.mjs`).toBe(s.label);
      }
    }
  });

  it('y las fases también', () => {
    const esperado: Record<string, string> = {
      preparacion: 'En preparación', fabricacion: 'Fabricación', montaje: 'Montaje',
      facturacion: 'Facturación', finalizado: 'Finalizado',
    };
    for (const fase of PHASES) expect(etiquetas[fase]).toBe(esperado[fase]);
  });
});
