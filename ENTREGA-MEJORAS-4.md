# METALPLAFER360 · CONEXIONES, MATERIAL DE ALMACÉN Y CALENDARIO

Tres mejoras, sobre la versión que me has pasado (`73e6be0`, con el bloque
anterior ya publicado). Código funcional, probado contra un PostgreSQL 16 de
verdad y en un navegador de verdad.

**No he hecho commit, ni push, ni despliegue**, y **no he ejecutado nada contra
tu Supabase**.

---

## 0. Dos cosas de tu copia, antes de nada

**1. Ya me has pasado el archivo que faltaba.** `supabase/sql/40_importar_holded.sql`
(442 líneas) está en tu carpeta, pero **sin confirmar en git** (sale como `??`).
Súbelo: es el único archivo que define `norm_client_name`, y sin él la
instalación se corta en el 45.

**Con él, la batería de base de datos corre entera por primera vez.** Las ~40
comprobaciones de Holded que llevaban dos entregas sin ejecutarse pasan todas:
`hl_plan` 12, `hl_import` 12, `hl_informe` 7, `hl_permisos` 6, `hl_doble` 3. Ese
era el único motivo.

**2. Tu `node_modules` viene de Windows.** Trae `@esbuild/win32-x64`, que aquí no
puede ejecutarse, así que he reinstalado dependencias para Linux. No toca
`package.json` ni `package-lock.json`, y en tu máquina no cambia nada.

---

## 1. Resumen de las tres mejoras

### N1 · La última conexión de cada persona

En **Trabajadores** hay una columna nueva, **«Última conexión»**, con la fecha y
la hora de la última vez que cada persona entró. Los administradores también
salen. Quien no ha entrado nunca pone **«Nunca ha entrado»**, no una fecha
inventada.

Lo importante es de dónde sale el dato: **no hay que apuntar nada**. Supabase
Auth ya guarda `auth.users.last_sign_in_at` y la actualiza él solo en cada
entrada. Eso trae dos cosas que no tendría apuntarlo nosotros: **el histórico ya
está** (se ven las conexiones anteriores a esta mejora) y **no hay ningún apunte
que pueda fallar u olvidarse** en algún camino de entrada.

### N2 · Material que ya tenemos en el almacén

En el formulario de material hay una pregunta nueva: **«¿De dónde sale?»**, con
dos respuestas: *Hay que pedirlo* (lo de siempre) y *Ya lo tenemos en el
almacén*. Al elegir la segunda **desaparecen el proveedor y las fechas de
pedido**, porque no se le ha pedido a nadie, y el material queda anotado en el
proyecto.

Está separado de verdad del material pendiente de comprar: **pestaña propia**,
distintivo en el listado y en la ficha del proyecto, fuera de «Pendiente» y de
«Retrasado», fuera de los avisos de material que no llega, y con su origen a la
vista en el informe de material. **No genera ningún pedido, no exige proveedor y
no toca ninguna existencia**, porque todavía no hay inventario.

### N3 · El calendario

Tres cosas:

- **Fabricación y montaje al abrir**, con colores distintos. Las demás
  categorías —avisos, material, obras, notas y visitas— se encienden de una en
  una y apagan a las demás.
- **Un tramo de varios días es UNA barra continua** que recorre los días, cruza
  de semana y cruza de mes, en lugar de una pastilla por día con el mismo
  nombre repetido.
- **Arrastrar ya no encoge el tramo.** Era un fallo de verdad, y lo cuento en el
  punto 7.

---

## 2. Archivos

### Migraciones SQL · nuevas, **sin ejecutar**

| Archivo | Mejora |
|---|---|
| `supabase/sql/54_ultima_conexion.sql` | N1 · la vista `user_last_sign_in` |
| `supabase/sql/55_material_almacen.sql` | N2 · `materials.origin`, sus dos reglas y los informes |
| `supabase/sql/56_calendario_tramos.sql` | N3 · `moved_span_end`, `move_project_phase` corregida y la vista `v_calendar_spans` |

### Aplicación

| Archivo | Mejora | Qué cambia |
|---|---|---|
| `src/lib/calendario.ts` | N3 | **Nuevo.** Las cuentas del reparto de barras en carriles |
| `src/components/shared/CalendarWeek.tsx` | N3 | **Nuevo.** Una semana con sus barras continuas |
| `src/pages/admin/CalendarPage.tsx` | N3 | Lee tramos, pinta semanas, aplica la regla de categorías y deshace el arrastre si falla |
| `src/config/constants.ts` | N3 | `CALENDAR_DEFECTO` y `siguienteSeleccion` |
| `src/styles/components.css` | N3 | Las dos capas de la semana: casillas debajo, barras encima |
| `src/pages/admin/WorkersPage.tsx` | N1 | La columna «Última conexión» |
| `src/services/settings.ts` | N1 | `listLastSignIns()` |
| `src/components/shared/MaterialModal.tsx` | N2 | «¿De dónde sale?» y los campos que dependen de la respuesta |
| `src/pages/admin/MaterialsList.tsx` | N2 | Pestaña «De almacén», distintivo y envío del origen |
| `src/pages/admin/ProjectDetail.tsx` | N2 | El material de almacén, distinguido en la ficha |
| `src/services/materials.ts` | N2 | El origen en el filtro, en el alta y en la edición |
| `src/pages/admin/ReportsPage.tsx` | N2 | La columna «Origen» en el informe de material, en pantalla y al exportar |
| `src/services/reports.ts` | N2 | El origen en la fila del informe |
| `src/services/calendar.ts` | N3 | `listCalendarSpans()` y `spanUid()`; se retiran `listCalendar()` y `eventUid()`, que se quedaban sin usar |
| `src/types/db.ts` | N1, N2, N3 | `UserLastSignIn`, `MaterialOrigin`, `CalendarSpan` |
| `package.json` | — | El guion `test:mejoras3`, añadido también a `test:all` |

### Pruebas nuevas

| Archivo | Comprobaciones |
|---|---|
| `tests/sql/99_tests_ultima_conexion.sql` | 16 · N1 |
| `tests/sql/99_tests_material_almacen.sql` | 25 · N2 |
| `tests/sql/99_tests_calendario.sql` | 27 · N3 |
| `tests/unit/calendario.test.ts` | 28 · las cuentas de las barras y la regla de categorías |
| `tests/e2e/mejoras3.mjs` | 46 · las tres mejoras en un navegador |
| `tests/sql/00_mock_supabase.sql` | `auth.users` gana `last_sign_in_at`, como en Supabase |
| `tests/e2e/fake-supabase.mjs` | La vista de conexiones, la de tramos, el origen del material y el arrastre que conserva la duración |

### Pruebas existentes que he tenido que **cambiar**

Ninguna se ha desactivado ni relajado. Todas afirmaban algo que la mejora cambia
a propósito, y la versión nueva comprueba **la regla nueva**, que en los cuatro
primeros casos es más exigente que la vieja.

| Archivo | Antes afirmaba | Ahora afirma |
|---|---|---|
| `tests/e2e/bloque3.mjs` | «Un tramo de 2 días ocupa **2 casillas**» (contando pastillas) | Que es **UNA barra** cuyo `grid-column` ocupa **2 columnas** |
| `tests/e2e/correcciones.mjs` | «El tramo de 3 días ocupa 3 casillas» y se arrastraba **el día 3** sobre el día 1 | Que es una barra de 3 columnas, que al soltarla en otro día se mueve de verdad **y conserva sus tres días** |
| `tests/e2e/qa-final.mjs` | «Un tramo de 2 días ocupa más de una casilla» (3 pastillas) | Dos barras —una por fase— y la de fabricación con 2 columnas |
| `tests/e2e/bloque4.mjs` | La obra salía nada más abrir el calendario | Que al abrir está **apagada**, que al encenderla entra, que es **una barra continua** y que al apagarla se va |
| `tests/e2e/fase5.mjs` | Material visible al abrir; pulsar «Material» lo **apagaba** | Que al abrir no está; que al encenderlo se ve **solo** material; y que al volver a pulsarlo se vuelve a fabricación y montaje |
| `tests/e2e/fase7.mjs` | El material salía al abrir el calendario | Que sale al encender su categoría |

El motivo es siempre el mismo y está dicho en el propio archivo, encima de cada
comprobación: **el calendario ya no abre con todo encendido**, y **un tramo ya no
es una pastilla por día**.

---

## 3. Qué cambia en cada capa

### Base de datos

- **`user_last_sign_in`** (N1): una vista con tres columnas —quién, su última
  entrada y cuándo se creó su cuenta—. Sin `security_invoker`, que es lo que le
  permite leer `auth.users` aunque quien pregunta no pueda; dentro, la misma
  regla que `profiles_full`: administración ve a todos, cada cual se ve a sí
  mismo.
- **`materials.origin`** (N2): texto con `check` en `('pedido', 'almacen')`, por
  defecto `pedido`. Más una segunda regla: el material de almacén **no puede
  llevar fecha de pedido ni fecha prevista**. Y `report_materials` gana una
  columna de origen; `report_suppliers` deja de contar lo que no se compró.
- **`moved_span_end`** y **`move_project_phase`** (N3): la corrección del
  arrastre, explicada en el punto 7.
- **`v_calendar_spans`** (N3): lo mismo que `v_calendar`, pero una fila por
  tramo. `v_calendar` **se queda como está**: sus pruebas siguen valiendo y lo
  que haya que mirar día a día se sigue mirando ahí.

### Servicios y tipos

`listLastSignIns()` trae las conexiones en **una sola consulta** para toda la
pantalla. `listCalendarSpans()` pide por **solapamiento** (`starts <= hasta` y
`ends >= desde`), que es lo que hace falta cuando una fila ya no es un día: un
tramo que empezó el mes pasado y sigue dentro de lo que se mira tiene que salir.
`createMaterial` y `updateMaterial` normalizan el material de almacén —sin
proveedor, sin fechas, disponible— antes de que viaje nada que la base de datos
vaya a rechazar.

### Pantallas

La de **Trabajadores** gana una columna y nada más: mismos filtros, mismas
acciones. La de **Material** gana una pregunta, una pestaña y un distintivo, y
el **informe de material** una columna de origen —en pantalla y al exportar—. La
del **Calendario** está rehecha por dentro: ahora cada semana es una capa de
casillas con una capa de barras encima.

Dos detalles que salieron al repasar y que cierran la mejora 2:

- la casilla **«Recibido»** no se enseña en el material del almacén. Es la
  casilla de un pedido —dice si ha llegado—; en lo que ya tenemos no significa
  nada, y desmarcarla lo habría hecho contar como pendiente en los contadores
  del proyecto;
- la tabla del informe que se ve **en pantalla** está escrita a mano, aparte de
  la que se exporta. La columna de origen había que ponerla en las dos: si no,
  el dato salía en el Excel y no en la pantalla.

Y uno del calendario: `listCalendar()` y `eventUid()` se quedaron sin usar al
pasar la pantalla a tramos, así que se retiran. La vista `v_calendar` **sigue en
la base de datos** y con sus pruebas —es la que deja comprobar que las dos
maneras de leer el calendario cuentan lo mismo—, pero la aplicación ya no la
lee: pedir seis filas para dibujar una sola barra no tenía sentido.

---

## 4. Migraciones

Van en **archivos independientes**, numerados detrás del 53, y **no las he
ejecutado contra tu Supabase**.

| Archivo | Por qué hace falta |
|---|---|
| `54_ultima_conexion.sql` | El esquema `auth` no se publica por la API: el navegador no puede leerlo. Una vista con los permisos de quien la crea es la forma de dar **una** columna sin abrir nada más, y sin meter la clave de servidor en la aplicación |
| `55_material_almacen.sql` | No había ninguna forma de distinguir «hay que comprarlo» de «ya lo tenemos»: ni `received`, ni `supplier`, ni `order_id` lo dicen. Sin esa distinción, el material del almacén aparecería como pendiente de comprar |
| `56_calendario_tramos.sql` | El arrastre recalculaba la duración con las horas: es un fallo y se corrige donde está. Y el calendario necesita los tramos enteros, que la vista de siempre no da |

Los tres se pueden ejecutar **varias veces sin hacer daño** y hay que ejecutar
cada archivo **completo de una vez**. **Ninguno migra datos**: no hay un solo
`update`, `delete` ni `insert` sobre filas existentes.

La 54 empieza con una **comprobación previa**: si `auth.users.last_sign_in_at` no
existiera en tu base de datos, se para con un mensaje que lo explica en lugar de
crear una vista rota.

---

## 5. Cómo se obtiene y se actualiza la última conexión

**De dónde sale.** De `auth.users.last_sign_in_at`, la columna que mantiene
Supabase Auth. `profiles.id` es la misma clave que `auth.users.id` —lo pone el
archivo 01, con `references auth.users(id)`—, así que cada persona tiene
exactamente una cuenta y no hay que adivinar la correspondencia.

**Cómo llega al navegador.** Por la vista `user_last_sign_in`. Una vista sin
`security_invoker` se ejecuta con los permisos de quien la creó, así que puede
leer `auth.users` aunque la sesión que pregunta no pueda —y sigue sin poder: la
batería comprueba que `select ... from auth.users` le da **42501** tanto a un
trabajador como a una sesión anónima—. De `auth.users` sale **una sola columna**:
ni correos, ni contraseñas cifradas, ni tokens.

**Cómo se actualiza.** Sola. La escribe Supabase Auth en cada inicio de sesión.
Nosotros **no escribimos nada**: no hay columna nueva en `profiles`, ni función
que llamar al entrar, ni registro de sesiones. La batería lo comprueba a la
contra: después de una entrada nueva, `profiles.updated_at` **no ha cambiado**.

**Qué pasa con las conexiones de antes.** Están. Como el dato lo lleva guardando
Supabase desde siempre, se ve la última entrada de cada persona aunque sea
anterior a esta mejora. No hay ningún periodo en blanco.

**La limitación, dicha claramente.** Es la última vez que alguien **inició
sesión**, no la última vez que usó la aplicación. Quien deja la sesión abierta en
el móvil puede estar entrando a diario y seguir mostrando el día que escribió su
contraseña por última vez. Si lo que quieres saber es **quién está usando
esto**, eso es «última actividad» y sí habría que apuntarlo nosotros: dímelo y lo
vemos, pero no lo he dado por supuesto.

---

## 6. Cómo se distingue el material de almacén del pendiente de pedir

**Lo primero: comprobar si el modelo ya lo distinguía.** No lo hacía.
`received` dice si ha llegado, no de dónde sale; `supplier` puede estar vacío en
los dos casos; `order_id` ata el material a una orden de trabajo, que es otra
cosa. Hacía falta decirlo expresamente, y por eso está `origin`.

**Dónde se nota la diferencia:**

| Sitio | Material para pedir | Material de almacén |
|---|---|---|
| Formulario | Proveedor y fechas de pedido | **No se enseñan**: no se le ha pedido a nadie |
| Pestañas de Material | Pendiente / Retrasado / Recibido | **«De almacén»**, la suya |
| Listado | Su proveedor y su estado | Distintivo **«De almacén»** |
| Ficha del proyecto | «Sin proveedor» si no lo tiene | **«Lo teníamos en el almacén»** |
| Avisos de material que no llega | Avisa al pasarse la fecha | **Nunca**: no tiene fecha prevista, y la base de datos no deja ponérsela |
| Informe de material | Origen «Pedido» | Origen **«De almacén»** |
| Informe por proveedor | Cuenta | **No cuenta**: no se le compró a nadie |

La regla que lo sostiene es la segunda restricción: **el material de almacén no
puede llevar fecha de pedido ni fecha prevista**. Como «Retrasado» y el aviso de
material miran `expected_on`, eso basta para que no pueda colarse por ninguno de
los dos, sin tocar ni una consulta más.

**Y lo que NO se ha hecho**, que es la otra mitad del encargo: ni una tabla de
inventario, ni existencias, ni movimientos, ni descuentos de stock, ni catálogo
de referencias. La batería lo comprueba: no hay ninguna tabla ni función cuyo
nombre hable de stock o inventario, y los disparadores de `materials` siguen
siendo exactamente los tres de siempre.

**Cómo queda preparado para el inventario.** El material de almacén es una fila
de `materials` como las demás. Cuando exista el catálogo, bastará con **añadir**
una columna que apunte a la referencia: las filas de hoy se quedarán con esa
columna vacía y seguirán siendo válidas. El **nombre** del material no se usa
como identificador de nada —la batería comprueba que dos materiales pueden
llamarse igual—, porque es texto que escribe una persona y la referencia del
futuro catálogo será otra cosa.

---

## 7. Los periodos del calendario y la duración al arrastrar

### Cómo se representa un periodo

Un proyecto tiene **dos periodos independientes**: `fab_start`/`fab_end` y
`mont_start`/`mont_end`. La vista de siempre, `v_calendar`, los desplegaba en
**una fila por día** —por eso se pintaban seis pastillas con el mismo nombre—. La
vista nueva, `v_calendar_spans`, devuelve **una fila por tramo**, con su
principio y su final. Lo que dura un solo día (una visita, un aviso, material,
una nota) viene con principio y final iguales, así que la pantalla no necesita
dos caminos.

La pantalla reparte esos tramos **por semanas**: para cada semana calcula en qué
columna empieza cada barra, cuántas ocupa y en qué carril va, de forma que dos
barras nunca se pisen. Lo que cruza de semana se corta y continúa en la
siguiente, marcado con `◂` y `▸`; lo que cruza de mes, igual. Si una semana tiene
más barras de las que caben, las de abajo se resumen en **«+N más»** en cada día
que ocupan. Todo eso son cuentas puras, están en `src/lib/calendario.ts` y se
prueban una por una sin abrir un navegador.

### El fallo del arrastre, y la corrección

`move_project_phase` **no movía el tramo: lo volvía a calcular**:

```sql
v_dias := greatest(plan_days(budget_hours_mont, mont_workers), 1);
v_end  := working_span_end(p_start, v_dias);
```

Y `plan_days` es *horas ÷ gente ÷ 8*. Con 16 horas y una persona salen **2 días**,
hubiera la fecha de final que hubiera puesta a mano. Por eso un montaje de seis
días, de lunes a sábado, al arrastrarlo se quedaba en dos.

**Las horas no son la duración**: son el trabajo que hay dentro. Seis días con 16
horas es una obra con desplazamientos o jornadas cortas, y esa decisión la toma
quien planifica.

**La regla nueva**: el tramo conserva su **longitud en días de calendario**.

```
final nuevo = inicio nuevo + (final viejo − inicio viejo)
```

Tu ejemplo, comprobado contra PostgreSQL: lunes 2 → sábado 7 son seis días;
soltado en **miércoles 4**, queda del 4 al **lunes 9**. Seis días.

**Por qué en días de calendario y no en laborables.** Un tramo de lunes a sábado
ya incluye el sábado. Si se contaran días laborables, ese mismo tramo se
estiraría o se encogería al cruzar un fin de semana y el final cambiaría sin que
nadie lo hubiera tocado. Es una decisión de negocio y por eso la digo: **si
prefieres que se cuenten laborables, se cambia en una línea** (`moved_span_end`),
pero entonces tu ejemplo acabaría el martes 10 en vez del lunes 9.

**Lo que no cambia al arrastrar**: las horas presupuestadas y las registradas no
se tocan; la otra fase se queda donde está; mover a mano sigue fijando la fase; y
una fase que **todavía no tiene fechas** se sigue estimando con las horas, que es
lo único de lo que se dispone.

**Y si el guardado falla**: la barra se pinta en el día nuevo mientras se guarda
—para que se vea que ha ido donde se soltó— y, si la base de datos no lo acepta,
**vuelve a donde estaba** y se avisa del error. Lo que no puede pasar es que la
pantalla enseñe una fecha que no está guardada: una fecha de taller que alguien
dé por buena manda a una persona a una obra el día que no toca.

---

## 8. Resultados de las pruebas

`npm run test:all` termina con **código de salida 0**: typecheck, las pruebas de
unidad, la batería de base de datos y las **21** pruebas de navegador, una
detrás de otra. Más `npm run build`, que compila sin avisos.

### Lo que ha pasado

| Capa | Resultado |
|---|---|
| `npm run typecheck` (TypeScript) | **limpio** |
| `npm run build` (producción) | **compila** |
| `npm test` (unidad) | **103 / 103** · 6 archivos *(antes 75; **+28**)* |
| `bash tests/sql/run_all.sh` (PostgreSQL 16 de verdad) | **1552 / 1552** *(antes 1484; **+68**)* |
| Navegador · **21** archivos | **1296 / 1296** *(antes 1245 en 20 archivos; +46 de `mejoras3.mjs`, y 5 más en los que he actualizado)* |

Las 68 comprobaciones nuevas de base de datos, por mejora:

| Mejora | Comprobaciones | Áreas |
|---|---|---|
| N1 · última conexión | **16** | `uc_vista` 2, `uc_admin` 6, `uc_entrar` 3, `uc_permisos` 5 |
| N2 · material de almacén | **25** | `alm_antes` 3, `alm_alta` 6, `alm_mezcla` 4, `alm_reglas` 5, `alm_informe` 5, `alm_stock` 2 |
| N3 · calendario | **27** | `cal_mover` 9, `cal_fases` 2, `cal_estimar` 4, `cal_vista` 7, `cal_permisos` 5 |

Y las de navegador: `mejoras3.mjs` **46** (8 de la última conexión, 13 del
material de almacén y 25 del calendario). El resto de los 20 archivos que ya
había siguen en verde: smoke 24, navegación 48, fase 2 53, fase 3 65, fase 4 60,
fase 5 76, fase 6 140, fase 7 92, bloque 1 45, bloque 2 40, bloque 3 36, bloque 4
70, bloque 5 79, QA final 121, correcciones 91, avisos 45, compartidos 37,
publicación 10, mejoras 66, mejoras 2 52.

### Lo que NO se ha ejecutado

**Nada.** Por primera vez en tres entregas, la batería corre entera: con
`40_importar_holded.sql` en su sitio, las ~40 comprobaciones de Holded que se
quedaban fuera ya se ejecutan y pasan. No hay ningún archivo que se pare a medias
ni ninguna comprobación que no se haya ejecutado.

Lo único que sigue sin poder comprobarse aquí es lo que necesita **tu** Supabase,
y va en el punto 9.

### Banco de mutaciones · 12 de 12 cazadas

He roto cada regla nueva a propósito, una cada vez, y he ejecutado la batería
entera para ver si alguna prueba se enteraba.

| # | Mutación | Resultado |
|---|---|---|
| 1 | N1 · la fecha de alta se colaría como última conexión | cazada · `uc_admin` |
| 2 | N1 · cualquiera vería las conexiones de todo el mundo | cazada · `uc_permisos` |
| 3 | N2 · el material de almacén podría llevar fecha prevista | cazada · `alm_reglas` |
| 4 | N2 · el informe por proveedor contaría lo que no se compró | **sobrevivió** · ver abajo |
| 5 | N2 · un origen inventado se aceptaría | cazada · `alm_reglas` |
| 6 | N3 · el arrastre volvería a calcular la duración con las horas | cazada · `cal_mover` |
| 7 | N3 · la duración se contaría en días laborables | cazada · `cal_mover` |
| 8 | N3 · mover una fase movería también la otra | cazada · `cal_fases` |
| 9 | N3 · el calendario enseñaría material de proyectos ajenos | **sobrevivió** · ver abajo |
| 10 | N3 · la barra no se cortaría al acabar la semana | cazada · 3 pruebas de unidad |
| 11 | N3 · dos barras que se solapan se pisarían | cazada · 5 pruebas de unidad |
| 12 | N3 · las categorías sueltas dejarían de excluirse | cazada · 3 pruebas de unidad |

**Las dos que sobrevivieron, y qué he hecho.** Las dos eran pruebas MÍAS que no
vigilaban lo que decían vigilar:

- **La 4** comprobaba que el informe por proveedor no cuenta el material del
  almacén… pero todo el material de almacén de la prueba estaba **sin
  proveedor**, así que la comprobación pasaba sola. Ahora la prueba anota
  material de almacén **con** proveedor —la base de datos lo admite: a veces se
  sabe de dónde salió aunque no se esté comprando— y exige que los pedidos de ese
  proveedor **no cambien**. Con eso, la mutación cae.
- **La 9** es la misma lección de la ronda anterior: la condición de permisos de
  la rama del material es una **segunda cerradura**, y hoy las políticas de
  `materials` ya filtran solas, así que quitarla no rompía nada. No la he quitado
  —el día que esta vista pase a ejecutarse con permisos propios, como ya le pasó
  a `planned_spans`, será lo único que impida que cada trabajador vea el material
  de los demás—, sino que he escrito la prueba que la distingue: leer la vista
  **sin sesión**, que es cuando las políticas no filtran, y exigir que no
  devuelva ni una fila. Con eso, la mutación cae.

Después de cada mutación he comprobado con un `sha256` que el archivo volvía
**idéntico** a como estaba. Los tres quedan íntegros.

---

## 9. Riesgos y lo que hay que comprobar en tu Supabase

1. **`auth.users.last_sign_in_at` no lo he podido ver en tu base de datos.** Es
   columna del propio Supabase Auth y no aparece en ninguna migración de este
   proyecto, así que la he reproducido en el entorno de pruebas. Por eso la
   migración 54 **comprueba que existe antes de crear nada** y se para con un
   mensaje claro si no estuviera. Riesgo real: bajo; si falla, falla al aplicarla
   y no en producción.
2. **El dueño de la vista.** `user_last_sign_in` funciona porque se ejecuta con
   los permisos de quien la crea. Si la ejecutas en el editor SQL de Supabase
   —como las demás—, la crea `postgres` y puede leer `auth.users`. Si la
   ejecutaras con otro usuario sin acceso a `auth`, la vista daría error al
   leerla. Aplícala como las anteriores y no hay nada que hacer.
3. **Que PostgREST se entere de la vista nueva.** Si al abrir Trabajadores dijera
   que no encuentra `user_last_sign_in`, es la caché de esquema: se recarga con
   `notify pgrst, 'reload schema'` o sola al poco rato. Las columnas y los
   permisos ya están comprobados en la batería.
4. **Los tramos que ya existen en producción.** La corrección del arrastre
   conserva la longitud de lo que haya guardado. Si algún proyecto tuviera un
   final **anterior** a su inicio (no debería), `moved_span_end` cae en la rama de
   la estimación por horas, que es el comportamiento de antes. No se rompe nada,
   pero conviene saberlo.
5. **Rendimiento del calendario.** `v_calendar_spans` devuelve menos filas que
   `v_calendar` (una por tramo en vez de una por día), así que no es un riesgo
   nuevo. Lo que no puedo medir aquí es con tres años de proyectos reales
   detrás.
6. **Las VISITAS siguen siendo una categoría.** Tu lista de categorías nombraba
   avisos, material, obras y notas, pero el calendario tiene además **visitas**,
   que son otra cosa (las lleva administración) y ya se podían ver. No las he
   quitado —sería retirar algo que funciona— y las he dejado como una categoría
   suelta más, con el mismo comportamiento que las otras. Por eso la leyenda
   tiene siete y no seis. Si prefieres que desaparezcan del calendario, dímelo.
7. **El calendario del trabajador usa la misma regla de categorías.** No lo
   pedías, pero es la misma pantalla: abre con lo suyo —fabricación, montaje y
   sus avisos— y, si pulsa una categoría, se aplica la regla nueva. Sus pruebas
   siguen en verde. Si quieres que al trabajador se le deje el comportamiento de
   antes, es una línea.
8. **El material de almacén no lo ve ningún trabajador**, igual que el resto del
   material de administración. Si quisieras que el taller viera lo que hay
   anotado en sus proyectos, es otra mejora: dilo.
9. **Lo que sigue sin poder hacerse** y no he añadido porque no estaba pedido:
   mover un material de un proyecto a otro desde la pantalla.
10. **`tests/sql/61_payload_real.mjs` sigue llamando a `npx esbuild`**, que es lo
   que fallaba en Windows. No lo toco porque no es de este encargo, pero si
   ejecutas la batería de SQL en Windows, ahí te va a fallar.

---

## 10. Cómo incorporarlo en tu copia de Windows y publicarlo

### 1) El código

Descomprime el ZIP en la raíz del proyecto, respetando las rutas. Son **32
archivos** de código y pruebas —3 migraciones, 16 de aplicación y 13 de pruebas y
configuración— más este documento.

```
npm install
npm run typecheck
npm test
npm run build
```

### 2) Las migraciones, en este orden

En el editor SQL de Supabase, **cada archivo completo de una vez**:

```
supabase/sql/54_ultima_conexion.sql
supabase/sql/55_material_almacen.sql
supabase/sql/56_calendario_tramos.sql
```

Se pueden volver a ejecutar sin hacer daño. La 54 se para sola si le falta lo que
necesita.

### 3) Compruébalo a mano, en cinco minutos

**N1**: Trabajadores → tiene que salir «Última conexión» con tu fecha y tu hora,
y «Nunca ha entrado» en quien no haya entrado todavía.

**N2**: Material pendiente → «Nuevo material» → «Ya lo tenemos en el almacén» →
desaparecen proveedor y fechas → elige proyecto, nombre y unidades → Guardar.
Tiene que salir en la pestaña «De almacén», **no** en «Pendiente», y verse en la
ficha del proyecto.

**N3**: Calendario → solo fabricación y montaje encendidos, con colores
distintos. Enciende «Material»: se apaga todo lo demás. Vuelve a pulsarlo: se
vuelve a fabricación y montaje. Coge un proyecto con varios días de montaje: una
sola barra. Arrástrala a otro día: **sigue durando lo mismo**.

### 4) La batería entera

```
npm run test:all
```

Las pruebas de SQL necesitan un PostgreSQL 16 local en el puerto 5433 (lo arranca
el propio guion). Si quieres solo lo nuevo:

```
npm run test:mejoras3
bash tests/sql/run_all.sh
```

### 5) Publicarlo, cuando lo tengas visto

Yo **no he tocado git**. Cuando quieras publicarlo, desde tu copia:

```
git add supabase/sql/40_importar_holded.sql      # el que falta en el repositorio
git add -A
git commit -m "feat: ultima conexion, material de almacen y calendario por tramos"
git push
```

El despliegue a `360.metalplafer.com` lo hace solo el flujo de GitHub Actions al
llegar a `main`, como siempre. **Aplica las tres migraciones antes de publicar**:
la pantalla de Trabajadores y la de Material esperan lo que crean.

---

**No he hecho commit, ni push, ni despliegue. No he ejecutado nada contra tu
Supabase. No he borrado ni modificado ningún dato.**
