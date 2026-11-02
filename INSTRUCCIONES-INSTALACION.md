# GESTIONES INTERNAS · Instalación

El tablero que sustituye al Trello interno. Esto es lo que tienes que
hacer tú, en orden.

> **Antes de nada, tres cosas que debes saber:**
>
> 1. **No he ejecutado nada en tu Supabase, ni he publicado nada, ni he
>    hecho commit.** La migración es un archivo para que la ejecutes tú.
> 2. **No he podido leer tu repositorio de GitHub**: el testigo de `gh`
>    de este entorno está caducado. He trabajado sobre la copia que me
>    diste. Lee la comprobación previa de abajo.
> 3. **Nada de esto se ha probado contra tus datos reales.** Lo que sí
>    se ha probado está en el apartado «Qué se ha comprobado».

---

## 1. Comprobación previa · 2 minutos

Mi copia tiene el pack de octubre y las migraciones 68 y 69. Antes de
aplicar nada, mira en tu repositorio que existan:

```
supabase/sql/67_panel_atencion.sql
supabase/sql/68_fase_visita_tecnica.sql
supabase/sql/69_migrar_visita_tecnica.sql
```

**Si la 68 y la 69 todavía no están ejecutadas en Supabase, no pasa
nada**: Gestiones internas no depende de ellas. Pero el ZIP incluye
archivos que sí las suponen aplicadas en el código (la fase de visita
técnica), así que revisa el diff antes de sobrescribir.

Y una comprobación que sí importa para este módulo:

```sql
-- Tiene que devolver una fila. Es la función que reutiliza el módulo.
select proname from pg_proc where proname = 'save_calendar_note';
```

Si no devuelve nada, falta el archivo 30 y hay que mirarlo antes de
seguir.

---

## 2. Archivos del ZIP

### Nuevos · se añaden

| Archivo | Qué es |
|---|---|
| `supabase/sql/70_gestiones_internas.sql` | La migración. **La ejecutas tú.** |
| `src/pages/admin/InternasPage.tsx` | El tablero y el repositorio de archivadas. |
| `src/components/shared/InternalTaskModal.tsx` | La tarjeta abierta. |
| `src/services/internas.ts` | Las consultas a Supabase. |
| `tests/sql/99_tests_internas.sql` | 46 comprobaciones de SQL. |
| `tests/e2e/internas.mjs` | 42 comprobaciones en navegador. |
| `INSTRUCCIONES-INSTALACION.md` | Esto. |

### Modificados · se sustituyen

| Archivo | Qué cambia |
|---|---|
| `src/config/navigation.ts` | La entrada del menú, entre Informes y Configuración. |
| `src/App.tsx` | La ruta `/admin/internas`. |
| `src/types/db.ts` | Los tipos del módulo, añadidos al final. |
| `src/styles/components.css` | Los estilos del tablero, añadidos al final. |
| `tests/e2e/fake-supabase.mjs` | La Supabase de pruebas entiende el módulo. |
| `package.json` | `test:internas`, y se añade a `test:all`. |
| `README.md`, `docs/DECISIONES.md` | Documentación. |

**Ningún archivo existente pierde nada**: en `db.ts` y `components.css`
el contenido va al final, y en `navigation.ts` y `App.tsx` es una línea
en medio. Revisa el diff igualmente.

---

## 3. La migración SQL · un solo archivo

En Supabase → SQL Editor, pega **`70_gestiones_internas.sql` entero** y
ejecútalo de una vez.

- **Qué crea:** tres tablas (`internal_lists`, `internal_tasks`,
  `internal_task_items`), una vista (`internal_board`), seis funciones y
  sus políticas.
- **Qué datos modifica:** **ninguno.** No toca ni una fila de nada que ya
  existiera. El tablero nace vacío a propósito.
- **Qué tablas existentes modifica:** **ninguna.** Ni una columna.
- **Políticas RLS:** solo las tres tablas nuevas, todas
  `using (is_admin()) with check (is_admin())`. **No se modifica ni se
  desactiva ninguna política existente.**
- **Se puede ejecutar varias veces** sin hacer daño.

### Comprobar que entró bien

```sql
-- Las tres tablas y la vista:
select table_name from information_schema.tables
 where table_schema = 'public' and table_name like 'internal_%';

-- El tablero nace vacío, que es lo esperado:
select count(*) as listas from public.internal_lists;

-- Y que a «anon» no se le ha concedido nada (no debe devolver filas):
select grantee, privilege_type from information_schema.role_table_grants
 where table_name like 'internal_%' and grantee = 'anon';
```

### Si algo falla

Es un solo archivo y todo lo que hace es `create ... if not exists`. Si
se corta a mitad, vuelve a ejecutarlo entero: no duplica nada.

Para deshacerlo del todo (solo si hace falta, y **borra el tablero**):

```sql
drop view if exists public.internal_board;
drop table if exists public.internal_task_items;
drop table if exists public.internal_tasks;
drop table if exists public.internal_lists;
```

---

## 4. Publicar la aplicación

1. Copia los archivos del ZIP sobre tu copia del repositorio.
2. `npm install` **no hace falta**: no hay dependencias nuevas. El
   arrastrar y soltar usa el del propio navegador, el mismo que ya usa
   el calendario.
3. `npm run typecheck && npm test && npm run build` para ver que tu
   copia queda bien.
4. Commit y push como hagas siempre.

**Ejecuta la migración ANTES de publicar la aplicación.** Si publicas
antes, la pantalla saldrá en el menú y dará error al abrirla.

---

## 5. Qué comprobar cuando esté arriba

1. En el menú, **«Gestiones internas» entre Informes y Configuración**.
2. Entrar: el tablero está vacío y ofrece crear la primera lista.
3. Crear **RRHH** y **MULTAS**.
4. Crear una tarjeta en RRHH y otra en MULTAS.
5. **Marcar una como realizada** y ver que **se queda en su lista**,
   tachada. Desmarcarla.
6. Abrir una tarjeta, escribir notas y **añadir tres elementos al
   checklist**. Marcar uno. Cerrar y ver **1/3 en la tarjeta del
   tablero**.
7. **Arrastrar** una tarjeta de RRHH a MULTAS. Recargar: sigue en MULTAS.
8. En el móvil, abrir la tarjeta y moverla con el desplegable **«Lista»**
   (arrastrar con el dedo no funciona, y es así en todos los navegadores).
9. Abrir una tarjeta → **«Añadir al calendario»** con la fecha de hoy.
10. Ir a **Calendario** y comprobar que el evento aparece.
11. Volver a la tarjeta, cambiar el detalle y **«Actualizar el evento»**.
    Volver al calendario: **tiene que haber UNO, no dos**.
12. Crear un evento manual en el calendario como siempre: sigue
    funcionando.
13. **Borrar desde el calendario** el evento de la tarjeta. Volver a la
    tarjeta: sigue ahí, sin evento y sin romperse.
14. **Archivar** una tarjeta → desaparece del tablero.
15. **«Tareas archivadas»** → está, con su lista, su estado y su
    checklist.
16. **Devolverla a otra lista** → vuelve al tablero con su checklist.
17. Intentar **borrar una lista con tarjetas** → se niega y explica que
    hay que moverlas.
18. Vaciarla y borrarla → ahora sí.
19. **Entrar con un trabajador**: no ve «Gestiones internas» en el menú.
20. Con ese trabajador, escribir `#/admin/internas` a mano → lo devuelve
    a su zona.

---

## 6. Qué pruebas ejecutar

```bash
npm run typecheck
npm test                 # unitarias
npm run test:sql         # SQL contra PostgreSQL local
npm run test:internas    # el módulo nuevo, en navegador
npm run test:all         # todo
```

---

## 7. Qué se ha comprobado, y qué no

### Comprobado

- **1904 de 1904** pruebas de SQL contra un PostgreSQL 16 de verdad,
  **46 de ellas nuevas** y de este módulo.
- **42 de 42** comprobaciones en navegador del módulo nuevo, pulsando lo
  que pulsa una persona.
- **201 de 201** pruebas unitarias y `typecheck` limpio.
- **Cinco mutaciones**, las cinco cazadas: permitir borrar una lista con
  tarjetas, duplicar el evento al editarlo, quitar el `on delete set
  null` de la clave ajena, enseñar las archivadas en el tablero y
  confundir «realizada» con «archivada».

### Un fallo que me encontré y que NO es de este módulo

Al pasar la regresión completa, **`bloque3` y `bloque4` fallaron**. No
los he roto yo, y lo he demostrado: extraje el código **tal como está
en el último commit** —sin el pack de octubre, sin la fase de visita
técnica y sin Gestiones internas— y **falla exactamente igual, hoy**.

La causa es aritmética de fechas en las propias pruebas. Las dos cogen
«el primer lunes del mes que viene» como fecha de trabajo, pero el
calendario que enseñan es el del mes ACTUAL, que son seis semanas:

```
hoy 01/11/2026 · la rejilla va del 26/10 al 06/12 (casillas 0 a 41)
el primer lunes del mes que viene es el 07/12 → casilla 42
```

Justo una casilla fuera. En `bloque3` eso hace que el bloque del
arrastre **se salte entero en silencio**, y falla la comprobación
siguiente, que esperaba el proyecto ya fijado a mano. En `bloque4`, la
obra se coloca fuera de lo que se ve y no aparece.

**No lo he tocado**, porque me pediste no modificar archivos ajenos a
esta funcionalidad. La corrección es una línea en cada archivo: en vez
del primer lunes del mes que viene, usar **el lunes de la tercera
semana de la propia rejilla** (`mondayOf(startOfMonth(HOY)) + 14 días`).
Siempre es lunes, siempre cae en la casilla 14 y nunca se sale; lo he
comprobado con cinco fechas repartidas por el año.

Dímelo y lo arreglo.

### NO comprobado · dicho expresamente

- **Nada contra tu Supabase ni contra la aplicación publicada.**
- **La migración no se ha ejecutado**: solo se ha instalado desde cero en
  un PostgreSQL de pruebas.
- **El arrastrar y soltar no está probado en navegador**: las pruebas
  mueven la tarjeta con el desplegable, que es el camino que funciona en
  todas partes. El arrastre hay que probarlo a mano (punto 7 de arriba).
- **No se ha probado en un móvil de verdad**, solo a 390 px de ancho.

---

## 8. Lo que este módulo NO hace

Para que no haya sorpresas:

- **No hay fechas de vencimiento ni avisos.** Una tarjeta tiene fecha si
  se le pone un evento en el calendario, y entonces el aviso es el
  calendario.
- **No hay personas asignadas a una tarjeta.** Todo el módulo es de
  administración, así que no habría a quién asignar.
- **No hay adjuntos en las tarjetas.** No se pidió, y habría que decidir
  antes cómo entran en la cuota de almacenamiento.
- **No se reordenan las listas arrastrando.** Se crean en orden y se
  quedan. La función del servidor admite reordenar tarjetas dentro de su
  lista, pero la pantalla hoy solo mueve entre listas.
- **Las tarjetas archivadas no se borran nunca.** No hay botón para
  ello, a propósito.

Si alguna de estas hace falta, dímelo y la preparo.
