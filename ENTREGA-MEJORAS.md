# METALPLAFER360 · Entrega de las cinco mejoras

Nada de lo que hay aquí se ha ejecutado contra tu Supabase, ni se ha
publicado, ni se ha subido a GitHub. Lo apruebas tú y lo aplicas una
sola vez siguiendo el apartado 3.

---

## 1 · Estado de cada mejora

| | Mejora | Estado |
|---|---|---|
| 1 | Panel e informes de horas coherentes (**opción A**) | **Implementada** |
| 2 | Horas presupuestadas separadas de las reales | **Implementada** |
| 3 | Avisos asignables a uno o varios trabajadores | **Implementada** |
| 4 | Las visitas, exclusivas de administración | **Implementada**, con una comprobación que te toca a ti (apartado 8) |
| 5 | Partes de trabajo compartidos | **Implementada** |
| 6 | Importación única de clientes de Holded | **Preparada y probada. NO ejecutada**: espera tu exportación real y tu aprobación del mapeo |
| 7 | Indicador de almacenamiento | **Implementada**. Falta que escribas la capacidad contratada (apartado 7) |

Ninguna quedó bloqueada.

**Lo que NO he hecho, porque lo pediste así:**

- No he añadido ninguna relación entre avisos y proyectos.
- No he creado ninguna pantalla permanente para Holded.
- No he cambiado el plan de Supabase ni he activado nada de pago.
- No he tocado ninguna fila existente: ni partes, ni horas, ni estados,
  ni fechas, ni visitas. No hay que volver a validar nada.
- No he desactivado ni relajado ninguna política de permisos.

---

## 2 · Archivos nuevos y modificados

### SQL · nuevos (son las migraciones)

```
supabase/sql/38_avisos_asignables.sql
supabase/sql/39_partes_compartidos.sql
supabase/sql/40_importar_holded.sql
supabase/sql/41_cuota_almacenamiento.sql
```

### Frontend · nuevos

```
src/pages/worker/AvisoDetail.tsx        El aviso de cliente en el móvil
```

### Frontend · modificados

```
src/App.tsx                             La ruta del aviso del trabajador
src/config/constants.ts                 WORKER_CALENDAR_KINDS
src/config/navigation.ts                «Proyectos» pasa a «Trabajos»
src/pages/admin/CalendarPage.tsx        Categorías según quién mira
src/pages/admin/Dashboard.tsx           «Trabajos validados»
src/pages/admin/FichaDetail.tsx         Equipo del aviso · visitas solo a administración
src/pages/admin/FichaForm.tsx           Visitas solo a administración al crear
src/pages/admin/ReportDetail.tsx        El reparto del parte y el total del trabajo
src/pages/admin/ReportsPage.tsx         «Órdenes» pasa a «Trabajos»
src/pages/admin/SettingsPage.tsx        Capacidad declarada y barras de espacio
src/pages/worker/MyProjects.tsx         «Mis trabajos»: proyectos y avisos
src/pages/worker/ReportDetail.tsx       Origen del parte y «¿con quién lo has hecho?»
src/services/fichas.ts                  Equipo del aviso
src/services/partes.ts                  Avisos, partes compartidos, candidatos
src/services/reports.ts                 Tipos de los informes
src/services/settings.ts                Resumen y capacidad de almacenamiento
src/styles/components.css               Color de las barras según el nivel
src/types/db.ts                         Tipos nuevos
```

### Pruebas · nuevas

```
tests/sql/90_tests_avisos.sql            48 comprobaciones
tests/sql/91_tests_horas.sql             62
tests/sql/92_tests_holded.sql            40
tests/sql/93_tests_almacenamiento.sql    41
tests/e2e/avisos.mjs                     43 en navegador real
tests/e2e/compartidos.mjs                37 en navegador real
```

### Pruebas · modificadas

```
tests/sql/20_tests_fase2.sql       La visita pasa a administración
tests/sql/84_tests_bloque5.sql     Un trabajador ya no tiene visitas
tests/e2e/fake-supabase.mjs        El simulador aprende lo nuevo
tests/e2e/fase2.mjs                +2 · una visita no se ofrece a un trabajador
tests/e2e/fase6.mjs                +16 · el indicador de almacenamiento
tests/e2e/bloque1.mjs              El selector del parte cambió de nombre
tests/e2e/bloque4.mjs              La pestaña pasa a «Trabajos»
tests/e2e/bloque5.mjs              Ídem, y los avisos salen en el listado
tests/e2e/navegacion.mjs           Ídem
tests/e2e/qa-final.mjs             Ídem
package.json                       test:avisos y test:compartidos
```

**Cuatro de esas pruebas modificadas lo están porque la aplicación cambió
a propósito**, no para que dejaran de molestar: donde antes un trabajador
tenía una visita, ahora tiene un aviso, y donde el menú decía
«Proyectos» ahora dice «Trabajos». Ninguna comprobación se ha eliminado;
el total sube de 2.102 a 2.391.

---

## 3 · Cómo aplicarlo · UNA sola vez y en este orden

Antes de empezar, el apartado 8 tiene **una consulta de solo lectura que
conviene ejecutar primero**.

### Paso 1 · Las migraciones, en el editor SQL de Supabase

Cada archivo se ejecuta **completo, de una vez**, no a trozos. Es
importante: dentro de cada uno hay funciones que se sustituyen, y
PostgreSQL solo garantiza que no quede ningún instante sin función si
todo va en la misma transacción. El editor SQL de Supabase ya lo hace
así.

| Orden | Archivo | Qué hace |
|---|---|---|
| 1 | `38_avisos_asignables.sql` | Avisos para varios trabajadores · visitas solo de administración |
| 2 | `39_partes_compartidos.sql` | Partes compartidos · horas coherentes en panel e informes |
| 3 | `41_cuota_almacenamiento.sql` | Capacidad declarada del almacenamiento |

**El 40 (Holded) NO se ejecuta todavía.** Va cuando me pases la
exportación y apruebes el mapeo (apartado 6).

Los tres se pueden ejecutar varias veces sin hacer daño.

### Paso 2 · Comprobar antes de publicar

En el editor SQL, después de aplicar las tres:

```sql
-- Las cuatro cosas nuevas existen
select count(*) = 4 as todo_en_su_sitio
  from (values ('ficha_workers'), ('work_report_workers')) t(n)
  full join (values ('worker_avisos'), ('report_team')) v(n) on false
 where to_regclass('public.' || coalesce(t.n, v.n)) is not null;

-- Y ningún parte ha cambiado de horas ni de estado
select status, count(*), sum(hours) from public.work_reports group by status order by 1;
```

Esa última consulta conviene **ejecutarla antes y después** y comparar:
tienen que salir las mismas cifras. Si cambian, para y me lo dices.

### Paso 3 · Publicar el frontend

Con el mecanismo que ya existe: GitHub Actions. El frontend nuevo
**necesita** las migraciones aplicadas; si se publica antes, la pantalla
del parte pedirá cosas que todavía no existen.

### Paso 4 · Escribir la capacidad del almacenamiento

Configuración → Almacenamiento. Está explicado en el apartado 7.

---

## 4 · Los partes compartidos y el cálculo de las horas

### El modelo, y por qué así

Dos personas montan una barandilla. Antes, cada una rellenaba su parte,
con su descripción y sus fotografías del mismo trabajo. Ahora el trabajo
es **uno**: un parte, un tipo de actividad, una descripción y un solo
juego de fotografías. Lo que es de cada una son **sus horas**.

Cómo se guarda:

- El **autor** sigue donde ha estado siempre: `work_reports.worker_id`,
  con sus horas en `work_reports.hours`.
- Los **demás** van en la tabla nueva `work_report_workers`, cada uno con
  sus horas.

**El autor NO cabe en la tabla de los demás, y es la decisión importante
de todo esto.** Hay un disparador que lo rechaza. Con eso, contar sus
horas dos veces no es improbable: es imposible. No hay nada que mantener
sincronizado ni ninguna regla que recordar. Y `work_reports.hours` no
cambia de significado: sigue siendo «las horas de quien rellenó el
parte», que es lo que dice su comentario y lo que esperan las pantallas
de hoy.

En el ejemplo que me diste: 3 h de A + 3 h de B = **un parte**, 3 h para
A, 3 h para B y **6 horas-persona** de trabajo.

### Con quién se puede compartir

Solo con quien está asignado **al mismo proyecto o al mismo aviso** del
parte. La comprobación la hace la función `save_report_workers`, no la
pantalla: manipular la petición a mano no sirve de nada. El selector y el
guardado usan **la misma** lista (`report_candidates`), así que no pueden
decir cosas distintas.

Un parte **suelto** (sin proyecto y sin aviso) no se puede compartir: no
hay ningún grupo del que elegir. La pantalla lo dice y explica qué hacer.

### Quién puede ver qué

| | Leer el parte y sus fotografías | Editar el parte · subir archivos | Cambiar el reparto |
|---|---|---|---|
| Autor | Sí | Sí | Sí |
| Quien estuvo en el trabajo | Sí | **No** | **No** |
| Quien no estuvo | **No** | No | No |
| Administración | Sí | Sí | Sí |

Para no ampliar de golpe permisos que nadie pidió ampliar, `owns_report`
—que es la que gobierna la **escritura**— **no se ha tocado**. Lo que se
añade es una función nueva, `can_read_report`, y solo se cambia en las
políticas de **lectura**. Así queda a la vista qué se amplió y qué no.

Quien estuvo en el trabajo **sí puede escribir comentarios** en ese
parte: es el mismo trabajo y tiene que poder contestarle a
administración. Si prefieres que tampoco, es una línea: dímelo.

### De dónde salen las horas, ahora

Todo sale de **una sola vista**, `hours_worked`, y solo cuenta lo
**validado**:

1. el autor de cada parte validado;
2. los que le acompañaron, cada uno con sus horas;
3. las órdenes de trabajo validadas, mientras sigan existiendo.

De ahí beben `project_hours`, `project_reports`, la ficha del proyecto,
el panel y los dos informes de horas. **Una sola verdad para todos.**

### LAS CIFRAS DEL PANEL Y DE LOS INFORMES VAN A SUBIR

Es lo único de esta entrega que verás distinto de un día para otro, y no
es un error.

El panel y los informes «Horas por trabajador» y «Horas por proyecto»
sumaban **solo las órdenes de trabajo**. Desde que los partes son la vía
normal, esas cifras llevaban tiempo saliendo cortas, y «Horas por
proyecto» ni siquiera enseñaba los proyectos que no tenían ninguna orden.
Ahora los tres leen de `hours_worked`.

Lo que vas a notar:

- el panel y los informes suben, **con las horas que ya estaban
  registradas** en los partes y no se estaban contando;
- en «Horas por proyecto» aparecen proyectos que antes no salían;
- la columna «Órdenes» pasa a llamarse **«Trabajos»**, y el panel dice
  «Trabajos validados» en lugar de «Órdenes validadas». Contaban
  órdenes; con los partes dentro, ese nombre habría dejado de ser verdad,
  y un nombre que miente es peor que un nombre nuevo.

Las horas **presupuestadas** no se mueven (apartado 5). Lo que cambia es
lo **realizado**, que ahora está completo.

---

## 5 · Horas presupuestadas y horas reales

Son dos cosas distintas y no se mezclan en ningún sitio.

| | Presupuestadas | Reales |
|---|---|---|
| Dónde viven | `projects.budget_hours_fab` y `budget_hours_mont` | Los partes y las órdenes, reunidos en `hours_worked` |
| Quién las pone | Administración, al presupuestar | Cada trabajador, en su parte |
| Para qué | Planificar, presupuestar, facturar | Saber qué se ha trabajado de verdad |
| Cuándo cuentan | Desde que se escriben | Solo cuando administración **valida** |

**Nada de lo que haga un trabajador cambia las presupuestadas.** Hay una
prueba que lo comprueba de la manera más directa posible: toma nota de
las horas previstas, registra y valida horas reales, y vuelve a mirar las
previstas. Y el banco de mutaciones lo confirma al revés: si cruzo las
dos capacidades a propósito, la prueba salta.

Las tres cifras se pueden ver juntas:

- en la ficha del proyecto: «Fabricación prevista» / «Fabricación
  realizada», y lo mismo para montaje;
- en «Horas por proyecto»: `previstas`, `total` y `desvio`, que es
  reales menos previstas.

El desvío puede ser a favor o en contra. Es un dato, no un error, y no
dispara ninguna alerta.

**Las horas de un aviso** (`fichas.hours`) siguen siendo lo que eran: un
campo que rellena administración para facturar el aviso. No entran en
`hours_worked` y no se mezclan con las horas reales de los partes. Si
algún día quieres que un aviso compare lo previsto con lo trabajado, es
otro encargo y hay que decidirlo antes.

---

## 6 · Importación de Holded

Está en `supabase/sql/40_importar_holded.sql`, **preparada y probada pero
sin ejecutar**. Son cuatro pasos y ninguno cambia nada hasta el tercero.

### El CSV que espero

Holded exporta los contactos con las cabeceras en inglés o en castellano
según el idioma de la cuenta. El mapeo:

| Holded | → | `clients` | |
|---|---|---|---|
| `name` / `nombre` | → | `name` | **obligatorio** |
| `vatnumber` / `cif` / `nif` | → | `tax_id` | puede ir vacío |
| `phone` / `telefono` | → | `phone` | |
| `email` / `correo` | → | `email` | |
| `address` / `direccion` | → | `address` | |
| `city` / `ciudad` | → | `city` | |
| `postalcode` / `cp` | → | `postal_code` | |
| `type` / `tipo` | → | `kind` | `empresa` o `particular` |
| `notes` / `notas` | → | `notes` | |

Las columnas que no estén en esa lista se ignoran sin dar error: en
Holded hay muchas más.

Si el CSV no dice el tipo, lo decide el CIF: letra inicial → empresa,
número inicial → particular. Cuando es una suposición nuestra, sale en el
informe para que lo repases.

### Los cuatro pasos

1. **Cargar.** En Supabase: Table Editor → `holded_import` → Insert →
   Import data from CSV. La tabla de paso es todo texto a propósito, para
   que no falle ninguna fila por el formato de un número o una fecha.
2. **Mirar el informe.** `select * from public.holded_simulate();` **No
   cambia ni una fila.** Dice cuántos se crearían, cuáles se saltarían y
   por qué, con el nombre del cliente de aquí con el que choca cada uno.
3. **Importar.** `select * from public.holded_import_run();` Crea
   exactamente lo que el informe ha anunciado.
4. **Retirar la tabla de paso.** Los `drop` están al final del archivo.
   No se queda nada en la aplicación.

### Cómo detecta los repetidos

- **Por CIF normalizado**, que es la comprobación fiable: `B-99887766`,
  `b 99887766` y `B99887766` son el mismo. Usa exactamente la misma
  expresión que el índice único de la tabla, así que lo que el informe
  llame repetido es lo mismo que la base de datos rechazaría.
- **Por nombre normalizado**, para los que no tienen CIF: sin acentos,
  sin signos y sin dobles espacios. `Construccions Moles i Fills, S.L.` y
  `CONSTRUCCIONS MOLES I FILLS SL` son el mismo.
- **Dentro del propio CSV**: dos líneas con el mismo CIF o el mismo
  nombre se quedan en una, y se dice cuál repite a cuál.
- **Los parecidos** se señalan aparte, por similitud de nombre, y **se
  crean de todas formas**: «Talleres Ribera SL» y «Talleres Ribera
  Hermanos SL» son dos empresas distintas y no me corresponde decidir
  que son la misma. Salen en el informe para que los mires tú.

Al normalizar el nombre, **el punto y la coma no valen lo mismo**: el
punto es una marca de abreviatura y no separa palabras (`S.L.` → `sl`),
mientras que la coma, el guion y la barra sí (`Metalls-Vallès` → `metalls
valles`). Lo descubrió una prueba: metiéndolo todo en el mismo saco,
`Moles i Fills, S.L.` quedaba en `... s l` y no reconocía a `MOLES I
FILLS SL`.

### Lo que no hace

- **No sobrescribe ningún cliente que ya exista.** Si el CIF ya está, esa
  línea se salta y el informe lo dice. Si en Holded hay un teléfono
  mejor, se cambia a mano: un volcado automático podría pisar un dato que
  alguien corrigió aquí a conciencia.
- No borra ni archiva nada. No inventa columnas.
- **Ejecutarlo dos veces no duplica nada.** En la segunda pasada esos
  clientes ya existen, y además el índice único lo impediría igual. Está
  probado: la segunda pasada crea cero.
- La forma jurídica **no** se quita al comparar: `Talleres Ribera SL` y
  `Talleres Ribera` se quedan distintos a propósito. Quitarla haría que
  un cliente nuevo pareciera uno que ya está, y lo que esto decide es
  justamente a quién NO crear.

**Mándame la exportación real y te digo si el mapeo encaja antes de
ejecutar nada.**

---

## 7 · Almacenamiento · lo confirmado y lo que falta

### Lo que la aplicación mide de verdad

- **Archivos registrados**: la suma de `documents`, con la papelera
  aparte.
- **Archivos que hay de verdad en el contenedor**: medido sobre
  `storage.objects`. Esto es nuevo y sirve para algo concreto: si alguna
  vez se subió un archivo y su ficha se perdió, seguía ocupando y no
  aparecía por ningún lado. Ahora se ve la diferencia y se dice de qué
  lado está.
- **Base de datos**: `pg_database_size`. Medida de verdad.
- **Copias de seguridad**: la suma de `backups`. **Ocupan en Google
  Drive, no en Supabase**, así que van aparte y **no** entran en la
  cuota. Sumarlas daría un porcentaje falso.

### Lo que falta, y por qué te lo tengo que preguntar

**La capacidad contratada no se puede consultar desde la base de datos.**
El límite del plan vive en la facturación de Supabase: no hay tabla ni
función que lo diga. Así que **no me he inventado ninguna cifra**.
Mientras no la escribas, la pantalla dice «sin declarar», no pinta
ninguna barra y explica dónde mirarlo.

Lo que tienes que hacer una vez:

1. Panel de Supabase → tu proyecto → **Settings → Usage**.
2. Apunta los dos límites de tu plan: el de **Storage** (archivos) y el
   de **Database** (base de datos), en MB.
3. METALPLAFER360 → Configuración → Almacenamiento → escríbelos, pon en
   la nota de dónde salen y guarda.

Queda fechado y en el historial: dentro de seis meses se sabrá quién lo
declaró y cuándo, que es justo lo que hace falta para no fiarse de una
cifra vieja. Si cambias de plan, se vuelve a escribir. Y si deja de
fiarte el dato, se puede dejar en blanco: **sin declarar es mejor que una
cifra que nadie ha comprobado**.

No he mirado tus límites reales y no los pongo aquí de memoria: las
cifras de los planes de Supabase cambian y lo que yo recuerde puede estar
desfasado. Mira la pantalla de Usage, que es la que manda.

### Los avisos

| Ocupado | Qué pasa |
|---|---|
| menos del 70 % | nada |
| del 70 al 90 % | aviso naranja: no es urgente, vaciar la papelera es lo que más recupera |
| 90 % o más | aviso rojo: vaciar la papelera y, si no basta, hablar con quien lleva la cuenta |

Los umbrales están en **un solo sitio** (`quota_level`, en la base de
datos) y la pantalla pregunta ahí. El color nunca va solo: al lado hay
siempre la cifra.

La papelera sale aparte porque es **el espacio más fácil de recuperar**:
lo que está ahí ya no se ve en la aplicación pero sigue ocupando.

---

## 8 · Pruebas, riesgos y lo que te toca a ti

### Lo que se ha ejecutado

| Dónde | Qué | Resultado |
|---|---|---|
| **PostgreSQL 16 de verdad** | `npm run test:sql` · el SQL completo instalado desde cero y 1.214 comprobaciones | **1.214 / 1.214** |
| **Navegador real** (Chromium, Supabase simulado) | 18 baterías, 1.113 comprobaciones | **1.113 / 1.113** |
| Unitarias | `npm test` | **64 / 64** |
| Tipos | `npm run typecheck` | sin errores |
| Compilación | `npm run build` | correcta |
| Publicación | `npm run test:publicacion` | **10 / 10** |

**2.391 comprobaciones en total.** Antes de esta entrega eran **2.102**:
1.023 en PostgreSQL, 1.015 en navegador y las 64 unitarias. Es decir,
**289 comprobaciones nuevas** y ninguna eliminada.

### Y lo que de verdad dice si sirven: el banco de mutaciones

Una prueba que no falla nunca no prueba nada. Así que he roto el código a
propósito, **77 veces**, una cosa cada vez, y he comprobado que cada
rotura la caza una prueba concreta:

| Qué se rompió | Mutaciones | Cazadas |
|---|---|---|
| Avisos asignables y visitas (SQL) | 10 | 10 |
| Avisos asignables y visitas (pantalla) | 10 | 10 |
| Partes compartidos y horas (SQL) | 18 | 18 |
| Partes compartidos (pantalla) | 10 | 10 |
| Importación de Holded | 13 | 13 |
| Almacenamiento (SQL + pantalla) | 16 | 16 |

Entre las cosas que rompí a propósito: quitar el `assert_admin`, olvidar
el camino nuevo de permisos, dejar que un parte cuelgue de un proyecto y
de un aviso a la vez, devolver las visitas al calendario del trabajador,
contar al autor dos veces, abrir la tabla de equipos a cualquiera,
inventarse una capacidad de almacenamiento, y hacer que el panel vuelva a
contar solo las órdenes.

**Cuatro pruebas no servían y las reescribí**, porque el banco las delató:

- una decía «Juan tiene 3 horas o más», y Juan ya tenía horas de órdenes,
  así que pasaba igual aunque el informe se olvidara de los partes. Ahora
  exige una **igualdad** contra la fuente única, fila por fila;
- otra comprobaba que la **clase CSS** estuviera puesta en la barra de
  espacio. Una clase sin estilo detrás no pinta nada: ahora comprueba el
  **color** que calcula el navegador;
- otra contaba las anotaciones del historial «de este último minuto», y
  la batería entera corre en el mismo segundo. Ahora se acota por los
  nombres de los clientes importados;
- y una vigilaba un camino que ninguna prueba podía recorrer: lo quité en
  lugar de dejarlo de adorno.

### Lo que no he podido probar, y lo digo

- **Nada de esto se ha ejecutado contra tu Supabase.** Todo está probado
  contra un PostgreSQL 16 instalado desde cero con el mismo SQL, pero el
  tuyo tiene datos reales y yo no los he visto.
- Las pruebas de navegador usan un **Supabase simulado**, no el tuyo. Las
  reglas de permisos se prueban contra PostgreSQL de verdad, que es donde
  viven; el simulador sirve para la pantalla.
- La importación de Holded está probada con un CSV que me he inventado
  para provocar cada caso. Con tu exportación real puede aparecer algo
  que no he previsto, y por eso el paso 2 es mirar el informe.
- El tamaño real de tu contenedor de Supabase Storage no lo he medido:
  la función lo mide en ejecución, pero yo no la he ejecutado ahí.

### DOS COSAS QUE TE TOCAN A TI

**1 · Las visitas asignadas a trabajadores normales.**

Me pediste que te avisara antes de tocar nada. No puedo consultar tu
Supabase, así que ejecuta esto, que es de **solo lectura**:

```sql
select f.code,
       f.status,
       f.scheduled_date as fecha,
       f.title          as trabajo,
       p.full_name      as asignada_a,
       p.role           as rol
  from public.fichas f
  join public.profiles p on p.id = f.assigned_to
 where f.type = 'visita'
   and p.role <> 'admin'
 order by f.scheduled_date nulls last;
```

- **Si no devuelve nada**: aplica las migraciones tal cual.
- **Si devuelve filas**: dímelo y las vemos una por una. **No las voy a
  reasignar yo.** La regla nueva **no las toca**: solo rechaza
  asignaciones nuevas, su trabajador las seguirá viendo y se podrán
  seguir editando. Lo único que cambia es que **no se le pintarán en el
  calendario**, porque eso es lo que pediste.

**2 · La capacidad del almacenamiento**, apartado 7.

### Riesgos, en orden de importancia

1. **Las cifras del panel y de los informes van a subir** el día que
   apliques la 39. Es el trabajo que ya estaba registrado y no se
   contaba. Si alguien lleva un seguimiento mensual, avísale antes: va a
   ver un salto.
2. **Cada archivo SQL hay que ejecutarlo completo.** Dentro hay funciones
   que se sustituyen (se borran y se crean). En una sola transacción no
   queda ningún instante sin función; a trozos, sí.
3. **El frontend necesita las migraciones aplicadas.** Si se publica
   antes, la pantalla del parte pedirá cosas que no existen todavía.
4. **`seed_demo()` se ha corregido dentro de la 38.** Repartía sus dos
   visitas de ejemplo entre trabajadores normales y, con la regla nueva,
   habría empezado a fallar. Ahora van a un perfil de administración. Son
   tres líneas añadidas y ninguna quitada, verificado con un diff línea
   por línea. **No he reescrito el archivo 23**, que es histórico y me
   pediste no volver a ejecutar: por eso el arreglo viaja en la 38.
5. **Un cliente que Holded trae sin CIF y con un nombre parecido a uno de
   aquí se saltará.** El informe lo dice con nombre y apellidos; mira esa
   lista antes de dar la importación por buena.

### Dos fallos que habría metido yo, y que cazaron las pruebas

Te los cuento porque explican por qué las migraciones están escritas como
están.

**Añadir un argumento a una función NO la sustituye: crea una segunda.** Y
entonces la llamada de siempre encaja en las dos, PostgREST contesta
`PGRST203` y **el guardado de partes se rompe en producción**. Lo cazó el
PostgreSQL real. Por eso la 38 borra la anterior y crea la nueva en el
mismo archivo, y por eso hay que ejecutarlo completo.

**Reescribir una función de memoria se desvía.** Rehice
`save_work_report` a mano y se me colaron cuatro diferencias, todas
malas: una **borraba el proyecto del parte** cada vez que se guardaba sin
reenviarlo, otra destruía el motivo del rechazo, otra se llevaba por
delante el aviso a administración, y la cuarta cambiaba un código de
error. Las cazaron pruebas que ya existían. Desde entonces, cada función
que había que tocar la he **generado del original** con el cambio mínimo
y lo he verificado con un diff. Lo mismo con `seed_demo` y con las tres
políticas de permisos: esas las copié primero de la versión equivocada
—la del archivo 28, que es vieja— y **los documentos administrativos
volvieron a verse**. Lo cazaron tres pruebas, y ahora están copiadas de
donde están vigentes (29, 31 y 33).
