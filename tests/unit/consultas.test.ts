/**
 * LAS CONSULTAS QUE PIDEN DATOS RELACIONADOS, VIGILADAS.
 *
 * Cuando una tabla tiene DOS caminos hacia otra, pedir el dato
 * relacionado sin decir por cuÃ¡l de los dos no es ambiguo solo Â«a
 * vecesÂ»: PostgREST se niega siempre, con un PGRST201 en inglÃ©s.
 *
 * Eso es exactamente lo que dejÃ³ los comentarios sin poder crearse. La
 * tabla Â«commentsÂ» tiene dos columnas que apuntan a Â«profilesÂ»:
 *
 *     comments_author_id_fkey         (author_id)
 *     comments_target_worker_id_fkey  (target_worker_id)
 *
 * La segunda la aÃ±adiÃ³ el mÃ³dulo de partes, mucho despuÃ©s de que se
 * escribiera la consulta de los comentarios. Nadie se enterÃ³ porque el
 * error llegaba traducido a Â«Ha ocurrido un error inesperadoÂ».
 *
 * Esta prueba no comprueba un caso concreto: LEE EL ESQUEMA, averigua
 * quÃ© tablas tienen mÃ¡s de un camino hacia otra, y exige que cualquier
 * consulta del frontend que pida esos datos diga por quÃ© clave va. AsÃ­
 * la prÃ³xima columna que alguien aÃ±ada no puede volver a romper una
 * pantalla en silencio.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Todos los archivos de un Ã¡rbol con una de estas extensiones. */
function archivos(dir: string, exts: string[]): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return archivos(join(dir, e.name), exts);
    return exts.some((x) => e.name.endsWith(x)) ? [join(dir, e.name)] : [];
  });
}

/**
 * CUÃNTOS CAMINOS HAY DE CADA TABLA A CADA TABLA.
 *
 * Se lee del SQL de instalaciÃ³n, que es la Ãºnica fuente de verdad que
 * hay aquÃ­ sin una base de datos delante. Se reconocen las dos formas
 * que usa el proyecto: la columna declarada dentro del Â«create tableÂ» y
 * la aÃ±adida despuÃ©s con un Â«alter table â€¦ add column â€¦ referencesÂ».
 */
function caminosDelEsquema() {
  const caminos = new Map<string, Set<string>>();     // 'origen->destino' â†’ columnas
  const apunta = (origen: string, destino: string, columna: string) => {
    const clave = `${origen}->${destino}`;
    if (!caminos.has(clave)) caminos.set(clave, new Set());
    caminos.get(clave)!.add(columna);
  };

  for (const archivo of archivos('supabase/sql', ['.sql'])) {
    const texto = readFileSync(join(ROOT, archivo), 'utf8');
    // Se parte en sentencias y se mira cada una por separado, asÃ­ el
    // Â«origenÂ» nunca se confunde con el de la sentencia anterior.
    for (const sentencia of texto.split(/;\s*$/m)) {
      const limpia = sentencia.replace(/--[^\n]*/g, '');

      const creacion = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(([\s\S]*)/i
        .exec(limpia);
      if (creacion) {
        const [, origen, cuerpo] = creacion;
        for (const linea of cuerpo.split('\n')) {
          const fk = /^\s*(\w+)\b[\s\S]*?references\s+public\.(\w+)/i.exec(linea);
          if (fk) apunta(origen, fk[2], fk[1]);
        }
        continue;
      }

      const alteracion = /alter\s+table\s+public\.(\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)[\s\S]*?references\s+public\.(\w+)/i
        .exec(limpia);
      if (alteracion) apunta(alteracion[1], alteracion[3], alteracion[2]);
    }
  }
  return caminos;
}

/**
 * Las tablas a las que se llega por mÃ¡s de un camino desde alguna otra.
 * Pedirlas sin nombrar la clave es jugÃ¡rsela.
 */
function destinosAmbiguos(caminos: Map<string, Set<string>>) {
  const ambiguos = new Set<string>();
  caminos.forEach((columnas, clave) => {
    if (columnas.size >= 2) ambiguos.add(clave.split('->')[1]);
  });
  return ambiguos;
}

describe('consultas con datos relacionados', () => {
  const caminos = caminosDelEsquema();
  const ambiguos = destinosAmbiguos(caminos);

  it('el esquema se ha leÃ­do de verdad', () => {
    // Si el reconocimiento del SQL dejara de funcionar, la prueba
    // pasarÃ­a sin comprobar nada. Estos dos casos se conocen y tienen
    // que salir: son los que provocaron el fallo y el que ya estaba bien.
    expect([...(caminos.get('comments->profiles') ?? [])].sort())
      .toEqual(['author_id', 'target_worker_id']);
    expect([...(caminos.get('documents->profiles') ?? [])].sort())
      .toEqual(['deleted_by', 'uploaded_by']);
    expect(ambiguos.has('profiles')).toBe(true);
  });

  it('toda consulta que pida una tabla ambigua dice por quÃ© clave va', () => {
    const fallos: string[] = [];

    for (const archivo of archivos('src', ['.ts', '.tsx'])) {
      // Se mira el CÃ“DIGO, no los comentarios: si no, el propio texto que
      // explica este fallo se cuenta como si fuera una consulta. Se
      // sustituyen por espacios para no mover los nÃºmeros de lÃ­nea.
      const texto = readFileSync(join(ROOT, archivo), 'utf8')
        .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (t) => t.replace(/[^\n]/g, ' '));

      // La forma de pedir un dato relacionado es Â«alias:tabla(â€¦)Â», y la
      // de decir por quÃ© clave es Â«alias:tabla!clave(â€¦)Â».
      for (const m of texto.matchAll(/(\w+)\s*:\s*(\w+)(!\w+)?\s*\(/g)) {
        const [, alias, tabla, clave] = m;
        if (!ambiguos.has(tabla) || clave) continue;
        const linea = texto.slice(0, m.index).split('\n').length;
        fallos.push(
          `${archivo}:${linea} Â· Â«${alias}:${tabla}(â€¦)Â» no dice por quÃ© clave. `
          + `A Â«${tabla}Â» se llega por ${[...caminos].filter(([k, v]) =>
            k.endsWith(`->${tabla}`) && v.size >= 2)
            .map(([k, v]) => `${k.split('->')[0]} (${[...v].sort().join(', ')})`)
            .join('; ')}. `
          + `EscrÃ­belo como Â«${alias}:${tabla}!nombre_de_la_clave(â€¦)Â».`,
        );
      }
    }

    expect(fallos).toEqual([]);
  });
});

