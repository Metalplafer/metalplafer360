# PACK 3 · Buscador, calendario y notificaciones

Tres mejoras. Esto es todo lo que tienes que hacer tú, en orden.

> **Antes de nada:**
>
> 1. **No he ejecutado nada en tu Supabase, ni he publicado en GitHub, ni
>    he hecho commit.** La migración es un archivo para que la ejecutes.
> 2. **He trabajado sobre el ZIP que me mandaste el 5 de noviembre.** Lo
>    comparé archivo por archivo con mi copia del Pack 2: era
>    **idéntico**, así que partes de ahí sin conflictos.
> 3. **Hay dos baterías de pruebas que fallan y no son de este pack.**
>    Apartado 9, con la demostración.

---

## 1. Lo que cambia, y lo que NO hizo falta inventar

| Mejora | Dónde se resuelve | Migración |
|---|---|---|
| 1 · Buscador general | 1 función SQL + 1 componente | 72 |
| 2 · Planificar desde el calendario | **se reutiliza lo que ya existía** | 72 |
| 3 · Notificaciones que llevan a su elemento | 2 columnas + 1 componente | 72 |

**Una sola migración, la 72.** No toca ni una fila existente.

### La mejora 2 ya estaba hecha casi entera

Antes de escribir nada se leyó qué hay. La planificación de fabricación
y montaje **existe desde el archivo 30**, y está donde tiene que estar:
en el propio proyecto.

- `projects.fab_start` / `fab_end` y `mont_start` / `mont_end` guardan el
  periodo de cada fase. Así que una asignación hecha desde el calendario
  **ya queda vinculada al proyecto**: no es una anotación suelta, es el
  mismo dato que el proyecto enseña en su ficha.
- `set_phase_dates` (archivo 34) ya ponía y quitaba esos periodos, solo
  para administración, marcando la fase como puesta a mano.
- Y el calendario **ya pintaba esos tramos en todos sus días**, con color
  propio para cada tipo (archivo 56).

Por eso **no se ha creado ninguna tabla de eventos**. Crearla habría
duplicado la planificación y dejado las fechas de un proyecto en dos
sitios, que es justo lo que pediste evitar.

---

## 2. Archivos

### Nuevos

| Archivo | Qué es |
|---|---|
| `supabase/sql/72_buscador_calendario_avisos.sql` | La migración. **La ejecutas tú.** |
| `src/services/buscador.ts` | La llamada al buscador y a dónde lleva cada resultado. |
| `src/components/shared/BuscadorGeneral.tsx` | La caja de búsqueda y su panel de resultados. |
| `src/components/shared/PlanificarModal.tsx` | La ventana de planificar fabricación o montaje. |
| `src/lib/avisos.ts` | A dónde lleva cada notificación. |
| `tests/sql/99_tests_pack3.sql` | 32 comprobaciones de SQL. |
| `tests/e2e/pack3.mjs` | 30 comprobaciones en navegador. |
| `INSTRUCCIONES-INSTALACION.md` | Esto. |

### Modificados

| Archivo | Qué cambia |
|---|---|
| `src/layouts/AdminLayout.tsx` | Monta el buscador en la barra de arriba. |
| `src/components/ui/NotificationsBell.tsx` | Las notificaciones con destino son pulsables. |
| `src/components/shared/CalendarWeek.tsx` | El «+» de cada día. |
| `src/pages/admin/CalendarPage.tsx` | Abre la ventana de planificar; pulsar un tramo manual lo edita. |
| `src/pages/admin/ProjectDetail.tsx` | Enseña la observación del tramo. |
| `src/services/calendar.ts` | `set_phase_dates` con nota, y `movePhaseDates`. |
| `src/types/db.ts` | Tipos del buscador, notas de tramo y destinos de notificación. |
| `src/styles/components.css` | Estilos del buscador, del «+» y del aviso pulsable. |
| `tests/e2e/fake-supabase.mjs` | La Supabase de pruebas entiende lo nuevo. |
| `package.json` | `test:pack3`, añadido a `test:all`. |
| `README.md`, `docs/DECISIONES.md` | Documentación. |

**Lo que NO se ha tocado:** las funciones de correo (las tuyas, con el
límite de `MAIL_MAX_MB`), Gestiones internas, los partes, los documentos,
y ninguna política RLS existente.

---

## 3. Resumen de los cambios en Supabase

### Tablas y columnas

| Tabla | Columna | Tipo | Para qué |
|---|---|---|---|
| `projects` | `fab_note` | `text` (≤500) | Observación del tramo de fabricación |
| `projects` | `mont_note` | `text` (≤500) | Observación del tramo de montaje |
| `notifications` | `ficha_id` | `uuid` → `fichas` | A qué presupuesto o aviso lleva |
| `notifications` | `project_id` | `uuid` → `projects` | A qué proyecto lleva |

Las cuatro **nacen vacías**. Ninguna fila existente cambia.

### Restricciones e índices

| Nombre | Qué hace |
|---|---|
| `projects_fab_note_len` / `projects_mont_note_len` | Tope de 500 caracteres |
| `notifications_ficha_idx` / `notifications_project_idx` | Índice por clave ajena (regla de la casa) |

### Funciones

| Función | Estado | Qué hace |
|---|---|---|
| `search_admin(text, int)` | **Nueva** | El buscador. Admin-only, comprobado dentro. |
| `move_phase_dates(uuid, uuid, text, date, date, text)` | **Nueva** | Mueve un tramo entre proyectos, atómico. |
| `set_phase_dates(uuid, text, date, date, text)` | **Reemplazada** | La de siempre más la nota del tramo. |
| `notify_late_materials()` | **Reemplazada** | Igual que antes, pero el aviso lleva su proyecto. |

### ⚠️ `set_phase_dates` se TIRA y se vuelve a crear

Un parámetro más con valor por omisión **no reemplaza** una función:
crea una segunda con otra firma. Entonces una llamada con cuatro
argumentos encajaría en las dos y PostgreSQL la rechazaría por ambigua,
rompiendo el calendario. Por eso la migración hace
`drop function ... (uuid, text, date, date)` antes de crear la de cinco.

La de cinco **sigue admitiendo las llamadas de cuatro argumentos**, así
que nada que ya existiera deja de funcionar. Se comprobó: las pruebas de
SQL la llaman con cuatro y siguen pasando.

### Políticas RLS

**Ninguna se modifica, ninguna se desactiva.** La protección del buscador
no es una política: es `assert_admin()` dentro de la función, que es lo
que impide que un trabajador la use aunque llame a la API directamente.

`search_admin` es `security definer`, así que se salta las políticas de
fila. Por eso lo primero que hace es comprobar que quien pregunta es
administración, que es quien ya puede ver todos los proyectos, todos los
presupuestos y todos los avisos. **No enseña nada que esa persona no
pudiera abrir por su cuenta.**

### Storage

**Sin cambios.** Este pack no toca archivos.

---

## 4. La migración · ejecutarla

En Supabase → SQL Editor, pega
**`72_buscador_calendario_avisos.sql` entero** y ejecútalo de una vez.
Se puede ejecutar varias veces sin hacer daño.

### Consultas de comprobación

```sql
-- 1) Las dos columnas del tramo (deben salir las dos):
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'projects'
   and column_name in ('fab_note', 'mont_note');

-- 2) Que solo queda UNA «set_phase_dates», la de cinco argumentos:
select pg_get_function_identity_arguments(oid) as argumentos
  from pg_proc where proname = 'set_phase_dates';
--    debe devolver UNA fila, acabada en «, text»

-- 3) Los destinos de las notificaciones:
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'notifications'
   and column_name in ('ficha_id', 'project_id');

-- 4) Sus índices:
select indexname from pg_indexes where tablename = 'notifications'
   and indexname in ('notifications_ficha_idx', 'notifications_project_idx');

-- 5) EL BUSCADOR, con el nombre de un cliente tuyo de verdad:
select tipo, code, titulo, cliente, estado, relevancia
  from public.search_admin('soler')   -- cámbialo por uno tuyo
 order by relevancia desc;

-- 6) Y que no se ha concedido nada nuevo a «anon» (sin filas):
select grantee, privilege_type from information_schema.role_table_grants
 where table_name in ('projects', 'notifications') and grantee = 'anon';
```

### Si algo falla

Todo es `create or replace` y `add column if not exists`. Vuelve a
ejecutarla entera: no duplica nada.

Para deshacerla:

```sql
-- Las notas del tramo (borra las que se hayan escrito):
alter table public.projects drop column if exists fab_note;
alter table public.projects drop column if exists mont_note;

-- Los destinos de las notificaciones:
alter table public.notifications drop column if exists ficha_id;
alter table public.notifications drop column if exists project_id;

-- El buscador y el movimiento de tramos:
drop function if exists public.search_admin(text, int);
drop function if exists public.move_phase_dates(uuid, uuid, text, date, date, text);

-- Y «set_phase_dates» vuelve a su versión de cuatro argumentos:
drop function if exists public.set_phase_dates(uuid, text, date, date, text);
```
…y después **vuelve a ejecutar los archivos 34 y 53**, que contienen las
versiones anteriores de `set_phase_dates` y `notify_late_materials`.

---

## 5. Comandos de PowerShell

Desde la carpeta del proyecto:

```powershell
# Comprobaciones
npm run typecheck
npm test
npm run test:sql
npm run test:pack3          # este pack, en navegador
npm run build

# Todo de una vez (tarda)
npm run test:all
```

Si `npm run test:sql` no arranca porque falta PostgreSQL local, sáltalo:
las comprobaciones de SQL las he ejecutado yo y están en el apartado 8.

---

## 6. Comandos de git

**No los he ejecutado.** Quedan escritos para cuando revises el código.

```powershell
git checkout main
git pull

git checkout -b pack3-buscador-calendario-avisos

git add supabase/sql/72_buscador_calendario_avisos.sql
git add src/services/buscador.ts src/lib/avisos.ts
git add src/components/shared/BuscadorGeneral.tsx
git add src/components/shared/PlanificarModal.tsx
git add src/components/shared/CalendarWeek.tsx
git add src/components/ui/NotificationsBell.tsx
git add src/layouts/AdminLayout.tsx
git add src/pages/admin/CalendarPage.tsx src/pages/admin/ProjectDetail.tsx
git add src/services/calendar.ts src/types/db.ts src/styles/components.css
git add tests/sql/99_tests_pack3.sql tests/e2e/pack3.mjs tests/e2e/fake-supabase.mjs
git add package.json README.md docs/DECISIONES.md INSTRUCCIONES-INSTALACION.md

git commit -m "Pack 3: buscador general, planificar desde el calendario y notificaciones con destino"

git push -u origin pack3-buscador-calendario-avisos
```

**Ejecuta la migración ANTES de publicar la web.** El frontend cuenta con
la columna `fab_note` y con la función `search_admin`: sin ellas, el
buscador da error y planificar no guarda la observación.

---

## 7. Cómo probar cada mejora

### Mejora 1 · el buscador

1. Entra como administración: la caja está **arriba**.
2. Escribe el nombre de un cliente: salen sus **proyectos, presupuestos
   y avisos**, cada uno con su etiqueta de tipo.
3. Escribe parte del nombre de un proyecto: lo encuentra.
4. Escribe un código completo (`PROY-2026-007`): sale **el primero**.
5. Escribe algo que no existe: lo dice con claridad.
6. Escribe una sola letra: pide al menos dos (y no consulta).
7. Pulsa un resultado de cada tipo: abre el elemento correcto.
8. La equis limpia la caja.
9. **Entra con un trabajador: no debe ver el buscador.**
10. Para probar la protección de verdad, desde la consola del navegador
    con su sesión:
    `await supabase.rpc('search_admin', { p_text: 'soler' })`
    debe devolver **42501**, no una lista.

### Mejora 2 · planificar desde el calendario

11. En el calendario, pasa por encima de un día: aparece un **`+`**.
12. Púlsalo: se abre la ventana con **ese día ya puesto** como inicio.
13. Elige **Fabricación**, busca un proyecto, pon fin tres días después
    y escribe una observación. Guarda.
14. El tramo aparece **en los cuatro días**, con el color de fabricación.
15. Haz lo mismo con **Montaje** en otro proyecto: color distinto.
16. **Entra en el proyecto**: las fechas están en «Planificación», con
    «Fijado a mano» y con tu observación debajo.
17. Vuelve al calendario y **pulsa el tramo**: se abre para editarlo.
18. Cambia las fechas y guarda. Comprueba en el proyecto.
19. Cambia el **proyecto** en esa misma ventana y guarda: el tramo se va
    del primero y aparece en el segundo. Compruébalo en los dos.
20. Pulsa **Quitar**: el proyecto vuelve a no tener fechas y la
    observación desaparece con ellas.
21. **Recarga la página**: todo sigue donde estaba.
22. Si eliges un proyecto que **ya tenía** ese tramo en otras fechas, te
    avisa de que lo va a **mover**, no a duplicar.
23. **Entra con un trabajador**: en su calendario no hay ningún `+`.

### Mejora 3 · notificaciones

24. Abre la campana: los avisos con destino se ven como enlaces.
25. Pulsa uno de **parte de trabajo**: abre ese parte.
26. Pulsa uno de **material retrasado**: abre su proyecto.
27. Comprueba que **un aviso ya leído también se puede pulsar**.
28. Comprueba que **pulsar NO lo marca como leído**: el contador no baja.
    «Marcar leídos» sigue siendo el único que lo hace.
29. Un aviso antiguo de **orden de trabajo** no es pulsable, a propósito:
    ese módulo se retiró y su pantalla no existe.
30. El contador y la campana funcionan igual que siempre.

---

## 8. Pruebas ejecutadas y resultados reales

Todo el 05/11/2026, en el entorno de desarrollo.

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | **limpio** |
| `npx vitest run` | **201 de 201** |
| `bash tests/sql/run_all.sh` | **1976 de 1976** contra PostgreSQL 16 real (eran 1944; **32 nuevas**) |
| `npm run test:pack3` | **30 de 30** |
| 28 baterías de navegador | **1534 comprobaciones · 26 baterías verdes** |
| `npm run build` | correcta |

### Las comprobaciones nuevas de SQL, por grupo

| Grupo | | Qué fija |
|---|---|---|
| `p3_buscar` | 9 | Encuentra por cliente, por nombre parcial y por código; sin duplicados; lo archivado no sale |
| `p3_permisos` | 5 | Ni trabajador ni anónimo usan el buscador ni planifican |
| `p3_plan` | 8 | Escribe en el proyecto; periodo de varios días; la nota se guarda y se borra con las fechas |
| `p3_mover` | 5 | El tramo llega al destino y **se va del origen**; un fallo no mueve nada |
| `p3_avisos` | 5 | Las columnas y sus índices; el material retrasado lleva su proyecto; borrar el elemento no deja enlace roto |

### Y se comprobó que las pruebas muerden

Cinco mutaciones, **las cinco cazadas**:

| Lo que se rompió a propósito | Quién lo cazó |
|---|---|
| Todas las notificaciones a una pantalla genérica | `pack3.mjs`, 3 comprobaciones |
| El buscador deja de mirar el nombre del cliente | SQL · `p3_buscar` |
| Mover un tramo lo deja en los **dos** proyectos | SQL · `p3_mover` |
| El buscador deja de comprobar quién pregunta | SQL · `p3_permisos` |
| La nota del tramo no se borra con las fechas | SQL · `p3_plan` |

### Una prueba me corrigió a mí

Puse el código `PROY-BUSCA-001` a un proyecto de prueba y la prueba
falló. La base de datos se lo había cambiado a `PROY-2026-059`: **hay un
disparador que asigna el código al insertar**. La prueba ahora comprueba
por identificador, que es lo estable.

### NO comprobado · dicho expresamente

- **Nada contra tu Supabase real ni contra la web publicada.**
- **La migración no se ha ejecutado**: solo instalada desde cero en un
  PostgreSQL de pruebas.
- **El buscador no se ha medido con tus datos reales.** Con los de
  ejemplo responde al momento; con miles de proyectos habría que mirar
  si hace falta un índice de texto. No lo he añadido porque añadirlo «por
  si acaso» es inventar un problema.
- **No se ha probado en un móvil de verdad**, solo a 390 px de ancho.

---

## 9. Dos baterías que fallan y NO son de este pack

`bloque3` y `bloque4` fallan. **No los he roto yo, y está demostrado**:
extraje el código del último commit —sin nada de lo mío— y falla igual.

Es aritmética de fechas dentro de las propias pruebas. Cogen «el primer
lunes del mes que viene» como fecha de trabajo, pero el calendario que
enseñan es el del mes actual, que son seis semanas:

```
hoy 05/11/2026 · la rejilla va del 26/10 al 06/12 (casillas 0 a 41)
el primer lunes del mes que viene es el 07/12 → casilla 42
```

Una casilla fuera. En `bloque3` el bloque del arrastre **se salta entero
en silencio** y falla la comprobación siguiente; en `bloque4` la obra se
coloca fuera de lo que se ve.

**No los he tocado**, porque pediste no sobrescribir archivos ajenos al
pack. La corrección es una línea en cada uno: en vez del primer lunes del
mes que viene, **el lunes de la tercera semana de la propia rejilla**
(`mondayOf(startOfMonth(HOY)) + 14 días`). Siempre es lunes, siempre cae
en la casilla 14 y nunca se sale; lo comprobé con cinco fechas repartidas
por el año.

Dímelo y lo arreglo.

---

## 10. Estado de cada mejora

| | Estado |
|---|---|
| 1 · Buscador general | **Implementado y probado en desarrollo** |
| 2 · Planificar desde el calendario | **Implementado y probado en desarrollo** |
| 3 · Notificaciones con destino | **Implementado y probado en desarrollo** |
| Migración 72 | **PENDIENTE DE EJECUTAR** en Supabase |
| Comprobación con datos reales | **PENDIENTE** |
| Comprobación en la web publicada | **PENDIENTE** |

---

## 11. Lo que este pack NO hace

- **El buscador no busca visitas técnicas.** Pediste tres tipos de
  resultado —proyectos, avisos y presupuestos— y son esos. Añadirlas es
  una línea si las quieres.
- **Tampoco busca clientes, obras, materiales ni partes** como resultado.
  El cliente es por lo que se busca, no lo que sale.
- **No hay notificaciones nuevas.** Se enlazan las que ya existían; no se
  ha inventado ninguna de presupuesto ni de aviso, porque hoy no las
  genera nada y decidiste no crearlas.
- **Un proyecto sigue teniendo un solo tramo por fase.** Volver a
  asignar lo mueve. Partirlo en dos exigiría una tabla nueva, y
  decidiste que no hace falta.
- **El calendario no comprueba disponibilidad.** Puedes planificar dos
  proyectos a la vez en los mismos días: la función de siempre tampoco
  lo comprobaba, y cambiarlo no era de este pack.
- **Los tramos que coloca el cálculo automático no se editan desde el
  calendario**: pulsarlos lleva al proyecto. Solo se abre la ventana en
  los que ya estaban puestos a mano, para no mezclar sin querer lo
  automático con lo manual.
