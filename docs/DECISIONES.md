# METALPLAFER360 · Decisiones de arquitectura

Este archivo existe para que, dentro de seis meses, nadie tenga que
adivinar **por qué** algo está hecho así. Se añade un apartado por cada
cambio que toque la estructura o una regla de negocio.

---

## BLOQUE 1 · Proyectos, trabajadores y partes de trabajo

Archivos SQL: `26_schema_partes.sql`, `27_funciones_partes.sql`,
`28_seguridad_partes.sql`.

### 1. El acceso del trabajador va por el PROYECTO, no por la orden

**Antes:** un trabajador llegaba a un proyecto porque tenía una orden de
ese proyecto.

**Ahora:** se le asigna al proyecto (tabla `project_workers`) y eso es lo
que le abre la puerta.

**Cómo se hizo sin romper nada:** ya existía la función
`worker_can_see_project(uuid)`, y de ella colgaban los permisos de
documentos, comentarios, subestados y almacenamiento. Se le cambió el
cuerpo y nada más: todo lo que dependía de ella siguió funcionando sin
tocarse. La función admite **las dos vías** —asignación directa y orden
viva— para no romper lo que ya estaba en marcha mientras las órdenes
sigan existiendo.

### 2. El dinero del proyecto se cerró de verdad

**El problema, medido, no supuesto:** haciéndose pasar por un trabajador
contra una base de datos real, `select name, budget_amount, advance_amount
from projects` devolvía `Rejas ventanas planta baja | 2400.00 | 800.00`.
La pantalla no lo enseñaba, pero **RLS filtra filas, no columnas**, y
`grant select on projects to authenticated` concede todas las columnas.
Con una petición hecha a mano salía el dinero.

**La corrección:** `projects` pasa a ser de administración
(`projects_select ... using (public.is_admin())`) y el trabajador entra
por la vista `worker_projects`, que **no tiene** `budget_amount`,
`advance_amount` ni `billing_status`. No es que se le oculten: no existen
ahí.

**Por qué una vista y no permisos por columna:** administración y
trabajadores son el mismo rol de base de datos (`authenticated`).
Quitarle la columna al rol se la quitaría también a administración.

**Efecto secundario que se arregló solo:** `project_billing` se ejecuta
con los permisos de quien pregunta, así que al cerrarle `projects` al
trabajador dejó de devolverle también la facturación.

**Consecuencia para el frontend:** la pantalla del trabajador y la de la
orden piden el proyecto a `worker_projects`, no incrustado en la orden.

### 3. Los partes son tabla nueva; las órdenes siguen existiendo

**Por qué no se reaprovechó `work_orders`:** un parte es de **una** sola
persona y puede **no tener proyecto**. `work_orders.project_id` es `NOT
NULL` y la usan el calendario, la facturación y los informes. Cambiarla
habría roto cuatro pantallas.

**Qué se reutilizó de verdad:** el tipo `order_type` (fabricación /
montaje, sin inventar nada), `projects.budget_hours_*`, el patrón
`num_nonnulls(...) = 1` de `documents` y `comments`, las notificaciones,
`next_code('PT')`, el historial `trg_audit`, el `SignaturePad`, la cámara
del móvil y el aviso de falta de material.

**Las órdenes se retirarán cuando se rehaga el calendario (BLOQUE 3).**
Hasta entonces se llega a ellas desde los accesos rápidos del inicio del
trabajador.

### 4. Las horas solo cuentan cuando se validan

**Antes** se sumaban en cuanto el trabajador las enviaba: el panel y los
informes sumaban `work_order_workers.hours` sin mirar el estado.

**Ahora** existe la vista `hours_worked`, que reúne las dos procedencias
—partes y órdenes— aplicando a las dos la misma regla: solo lo validado.
`project_hours` enseña previstas contra realizadas. Cuando se retiren las
órdenes basta con borrar la segunda mitad de `hours_worked`.

### 5. Comentario dirigido a una persona

Una columna, `comments.target_worker_id`. **Lo leen todos** los que tienen
acceso (no es un mensaje privado); lo único que cambia es que el aviso le
llega **solo a esa persona**. No se montó un sistema de permisos aparte
porque no hacía falta.

### 6. «Falta material» desde un parte

Entra por la **misma** tabla (`material_requests`) y aparece en la
**misma** pantalla de Material pendiente. No hay un segundo sistema de
avisos. Requiere que el parte tenga proyecto, porque el aviso va siempre
contra un proyecto; si todavía no lo tiene, queda la marca
`needs_material` y administración lo ve al asignarlo.

### 7. Pruebas antiguas que se actualizaron (no se desactivaron)

- `40_tests_fase4.sql` · «Ve el proyecto de su orden» daba por bueno que
  el trabajador leyera `projects`, que es justo la fuga que se cerró.
  Ahora comprueba que **no** la lee y que **sí** ve su trabajo por
  `worker_projects`.
- La misma idea en la prueba de archivar una orden.
- `fase4.mjs` y `navegacion.mjs` · la barra inferior del móvil cambió a
  Inicio · Proyectos · Mis partes · Calendario · Perfil.

### 8. Pendiente, a propósito

- Retirar las órdenes de trabajo: **BLOQUE 3**, con el calendario.
- Que los informes y el panel usen `hours_worked`: hoy siguen leyendo las
  órdenes directamente. La vista ya está puesta para el cambio.
- Borrado real de trabajadores, avisos, presupuestos y proyectos:
  **BLOQUE 6**. Choca con el diseño actual («aquí no se borra nada», el
  historial inmutable y las claves foráneas `restrict`), y hace falta
  decidir antes qué pasa con el historial de quien se borra.


---

## BLOQUE 2 · Documentación, visor móvil y borrado real

Archivo SQL: `29_documentacion_borrado.sql`.

### 1. Dos categorías, y dos ejes distintos

`documents.category` ya existía y dice **qué es** el archivo (documento,
foto, vídeo, firma). La categoría que se pedía dice **quién puede verlo**.
Son cosas distintas, así que es una columna nueva, `documents.scope`
(`tecnica` / `administrativa`), y no un cambio de la anterior. No hay
sistema configurable: solo esas dos.

### 2. La separación la imponen la base de datos y el almacén

- `documents_select` solo devuelve al trabajador lo `tecnica`.
- `documents_insert` le obliga a que lo que suba sea `tecnica`: no puede
  colocar nada en la carpeta de administración.
- `storage_can_read` mira también la categoría. **Esto es lo que de
  verdad cierra el acceso**: Supabase llama a esa función antes de firmar
  el enlace de un archivo. Sin enlace no hay URL, ni descarga, ni forma
  de llegar al archivo.

Comprobado en pruebas con el usuario puesto: el trabajador recibe 0 filas
administrativas y `storage_can_read` devuelve `false` para la factura y
`true` para el plano del mismo proyecto.

**Riesgo conocido:** un enlace ya firmado sigue valiendo hasta una hora.
Si se mueve un documento a administrativa, quien tuviera el enlace abierto
puede verlo hasta que caduque. Es inherente a los enlaces firmados; se
puede reducir bajando su duración en `signedUrl`.

### 3. Mover de categoría sin tocar el archivo

`move_document_scope(uuid, doc_scope)`: cambia la columna, nada más. El
archivo no se descarga ni se vuelve a subir.

La anotación se escribe **directamente en `audit_log` con el código del
proyecto**, no con `log_event`, porque `log_event` no guarda
`entity_code` y la pantalla del proyecto filtra su historial por ese
código: sin él, el movimiento quedaría anotado donde nadie lo busca.

### 4. Visor de fotos y vídeos

Antes, «ver» hacía `window.open` del enlace firmado, que en el móvil
acaba muchas veces en una descarga. Ahora hay un visor dentro de la
aplicación (`MediaViewer`): imagen a pantalla completa que se amplía al
tocarla, vídeo con `controls` y `playsInline`, cierre con X, Escape o
tocando fuera, y paso entre archivos con flechas o deslizando el dedo.
Lo que no es foto ni vídeo (un PDF) se sigue descargando, que es lo
esperable.

### 5. Borrado real, con dos cosas protegidas

Se puede eliminar de verdad trabajadores, fichas y proyectos. La función
se niega solo cuando destruiría algo que no se puede reconstruir:

| Entidad | Se niega cuando | Por qué |
|---|---|---|
| Trabajador | Tiene partes, órdenes o avisos de material | Es el registro de producción; borrarlo cambiaría las horas de los proyectos y los informes |
| Ficha | De ella salió un proyecto | Es el origen documental de ese proyecto |
| Proyecto | Tiene cobros u horas validadas | Es dinero cobrado y producción real |

En esos casos el mensaje **dice qué hay** («12 partes, 40 h validadas»)
en lugar de un «no se puede» a secas, y propone archivar o desactivar.

Archivar y eliminar conviven a propósito: son cosas distintas y las dos
hacen falta.

### 6. Dos defectos que aparecieron al probar

- **`23503` tapaba el motivo.** El mismo problema que ya se corrigió con
  el `42501`: ese código lo usan PostgreSQL (en inglés) y nosotros (en
  castellano, explicando qué pasa). Se tapaban los dos. Ahora solo se
  sustituye el de PostgreSQL.
- **El historial no se refrescaba** al mover un documento de categoría:
  había que recargar la página para verlo. `DocumentsPanel` avisa ahora a
  la pantalla que lo contiene.

### 7. Archivos del almacén

Al eliminar una ficha o un proyecto, sus documentos se van en cascada
pero **los archivos del almacén no**: se quedarían huérfanos ocupando
espacio. Se retiran desde la aplicación antes de llamar al borrado, que
es la vía soportada por Supabase.


---

## BLOQUE 3 · Calendario y planificación automática

Archivo SQL: `30_calendario_planificacion.sql`.

### 1. Las fechas pasan del pedido al proyecto

**Antes:** el calendario pintaba `work_orders.scheduled_date`, **una fecha
suelta sin duración**. Con eso no se puede planificar nada.

**Ahora:** la planificación vive en `projects`: `fab_start`/`fab_end`,
`mont_start`/`mont_end`, más `fab_workers`/`mont_workers` (por defecto 2)
y `fab_manual`/`mont_manual`.

### 2. La vista despliega los tramos en días

`v_calendar` convierte cada tramo en **una fila por día laborable**
(`generate_series` + `is_working_day`). Gracias a eso, las cuatro vistas
que ya existían (día, semana, mes, agenda) y el arrastrar y soltar
**siguen funcionando sin tocarlas**, y cada día sabe que es «Día 1 de 2».

Los sábados, domingos y festivos **no se pintan** dentro de un tramo,
salvo que lo haya colocado una persona a mano: si lo ha puesto en sábado,
por algo será.

### 3. La duración

    días = techo( horas previstas ÷ trabajadores ÷ 8 )

Las horas previstas son **del equipo**, no de una persona. 32 h con 2
personas son 2 días; con 1 persona, 4.

### 4. El margen entre proyectos

`app_settings.gap_days` son los **días laborables LIBRES** que se dejan:

| Valor | El siguiente empieza |
|---|---|
| 0 | El día laborable siguiente, sin dejar ninguno libre |
| 0,5 | Igual que 0 |
| 1 | Dejando 1 día libre (acaba lunes → empieza miércoles) |
| 2 | Dejando 2 días libres |

**Sobre el 0,5:** planificando por días completos, medio día libre no
existe, y se redondea hacia abajo. «Empezar el mismo día que acaba el
anterior» tampoco vale como interpretación, porque eso sería un solape y
lo automático no solapa nunca. Para medias jornadas de verdad habría que
planificar por horas, que es otro problema.

Cambiar el margen **no replanifica nada**: vale de ahí en adelante. Mover
solo lo que ya está colocado sería una sorpresa desagradable para quien
tenga el taller organizado.

### 5. El algoritmo

`find_free_slot(fase, días, desde, excepto)`: se coloca el tramo en el
primer día laborable, se mira si pisa algo ya colocado en **esa misma
agenda** (fabricación y montaje son dos recursos distintos), y si pisa,
se salta al final de eso más el margen y se vuelve a mirar. Para en
cuanto cabe. Tiene tope de vueltas para no quedarse colgado.

El montaje se planifica **siempre detrás** de la fabricación, con el
mismo margen.

### 6. Lo manual manda

`move_project_phase` marca la fase como `manual = true`. A partir de ahí:

- la planificación automática **no la toca nunca**;
- pero sí la **esquiva** al colocar otras, para no solapar por su cuenta;
- a mano vale todo: fines de semana, festivos y solapes. Es a propósito;
- `release_project_phase` la devuelve al cálculo automático a propósito.

Comprobado en pruebas: dos proyectos solapados a mano el mismo día siguen
solapados después de volver a planificar los dos.

### 7. Lo que se añadió sin complicar nada

- `non_working_days`: festivos y días que el taller no abre. Los ve todo
  el mundo (el trabajador necesita saberlo); los cambia administración.
- `calendar_notes`: los «Otros», eventos sueltos del calendario. Una
  tabla con día, título y detalle. Nada más.

### 8. Dos cosas que se corrigieron por el camino

- **El instalador de pruebas solo llegaba al archivo 29.** Su patrón era
  `0[1-46-9]_` y `[12][0-9]_`, así que el 30 no se instalaba y las
  pruebas pasaban sin probarlo. Ahora coge todos los numerados.
- **El calendario perdía a quien estuviera asignado por orden.** Al
  pasar `assigned` a leer `project_workers`, quien solo estuviera
  asignado a una orden desaparecía y no podía filtrar por lo suyo. La
  vista une ahora las dos procedencias, igual que ya hace
  `worker_can_see_project`.

### 9. Pruebas antiguas actualizadas

`fase5.mjs` y `fase7.mjs` daban por bueno que el calendario pintara
órdenes. Ahora pintan la planificación del proyecto, así que se
actualizaron: en `fase7` se comprueba además algo que antes no se
miraba, que **un proyecto sin horas previstas no se planifica solo** (no
se inventa una duración).

---

## BLOQUE 4 · Obras

Archivo SQL: `31_obras.sql`.

### 1. La obra agrupa, no sustituye

**La decisión de fondo:** una obra es un **contenedor**, no una capa
nueva por la que haya que pasar. `projects.work_id` es una columna
opcional (`null` = proyecto suelto). Todo lo que ya funcionaba —fases,
subestados, partes, documentos, material, cobros, planificación— **sigue
funcionando igual** tanto si el proyecto está en una obra como si no.

Por eso el borrado de la obra es `on delete set null`: si se elimina la
obra, **los proyectos se quedan sueltos**. No se pierde trabajo, ni
horas, ni documentos, ni dinero cobrado. Lo contrario habría convertido
un cambio de organización en un riesgo de pérdida de datos.

### 2. Las cuentas: tres cifras y ninguna más

    total de proyectos  +  costes extras  =  total estimado
    facturado           =  suma de lo marcado proyecto a proyecto
    pendiente           =  total estimado − facturado

La vista `work_summary` las calcula y no guarda nada: así no hay dos
sitios con el mismo número y la posibilidad de que discrepen.

`work_extras` es la tabla de los extras: concepto, importe y notas.
Transporte, grúa, trabajos añadidos. Lo que no merece un proyecto propio
pero hay que cobrar.

### 3. La facturación es manual, y usa el estado que ya existía

No hay integración con Holded ni con nada: la marca administración.
`set_project_invoiced(proyecto, sí/no, importe, fecha)` escribe
`invoiced_amount` e `invoiced_on` en el proyecto.

**Decisión importante:** si se marca como facturado y el proyecto seguía
en `por_facturar`, pasa a `pendiente_cobro`, que es el estado de cobro
que **ya existía**. No se ha creado un segundo sistema de facturación en
paralelo al que ya había; se ha enganchado al existente. Si el proyecto
ya estaba en otro estado de cobro (cobrado parcial, cobrado), no se
toca: ese dato viene de los cobros reales y manda él.

Si no se dice importe, se factura lo presupuestado, y se puede corregir
después: la factura no siempre coincide con el presupuesto.

### 4. La obra en el calendario, sin fechas propias

La obra **no tiene fechas suyas**. En `v_calendar` entra como un tipo
más (`kind = 'obra'`) que va de la primera fecha planificada de sus
proyectos a la última, tomadas de `work_summary`.

Dos consecuencias buscadas:

- no hay dos sitios con fechas que puedan contradecirse;
- la obra **no se arrastra** (`movable = false`): lo que se mueve son los
  proyectos, y la obra se ajusta sola. Arrastrar la obra habría obligado
  a decidir qué le pasa a cada proyecto de dentro, y ninguna respuesta
  es evidente.

Una obra archivada desaparece del calendario; sus proyectos siguen.

### 5. El dinero de la obra es de administración, en la base de datos

`works` y `work_extras` tienen RLS con política **solo administración**.
`work_summary` es `security_invoker`, así que se ejecuta con los permisos
de quien pregunta y lee `projects`, que ya era de administración desde el
BLOQUE 1.

Comprobado impersonando a un trabajador en PostgreSQL: **0 filas** en
`works`, en `work_extras`, en `work_summary` y en las filas de obra de
`v_calendar`. No es que la pantalla lo esconda: la base de datos no lo
devuelve.

El trabajador sigue entrando a su proyecto por `worker_projects`, que no
tiene ninguna columna de dinero —y tampoco tiene `work_id`, para que la
obra no sea ni un dato suelto del que tirar.

### 6. No se borra lo que tiene dinero dentro

`delete_work` **se niega** (`23503`) si algún proyecto de la obra está
marcado como facturado, y dice el importe. Lo que se borra son los
extras y los comentarios de la obra; los proyectos quedan sueltos.
Para quitarla de en medio sin borrar nada está `archive_work`.

Misma regla que el BLOQUE 2: lo que representa dinero o trabajo hecho no
se va de un clic.

### 7. El historial se escribe en los dos sitios

Meter o sacar un proyecto, facturarlo, añadir o cambiar un extra: cada
acción escribe **dos** entradas en `audit_log`, una con el código del
proyecto y otra con el de la obra. Es a propósito: el panel de historial
filtra por `entity_code`, y quien está mirando la obra quiere leer «qué
proyectos entraron y cuándo» sin salir de ahí.

Esto obliga a insertar directamente en `audit_log` en lugar de usar
`log_event`, que no rellena `entity_code` (misma razón que en el
BLOQUE 2 con `move_document_scope`).

### 8. Lo que cambió fuera de la obra

- `comments` gana `work_id`, y su restricción `comments_one_owner` pasa a
  comprobar cinco columnas: un comentario cuelga de **una sola** cosa.
- `projects` gana `work_id`, `invoiced_amount` e `invoiced_on`.
- El menú de administración pasa de 13 a 14 secciones: **Obras** entra
  delante de Proyectos, porque es su contenedor.
- La leyenda del calendario pasa de 6 a 7 tipos. Las pruebas que contaban
  6 se han actualizado, no desactivado.

---

## BLOQUE 5 · El día a día del trabajador

Archivo SQL: `32_trabajador_avisos_material.sql`.

### 1. Un fallo que venía del BLOQUE 1: el calendario del trabajador estaba vacío de trabajo

Antes de tocar nada se comprobó contra la base de datos qué veía un
trabajador en su calendario. El resultado:

| Tipo | Filas que veía Juan |
|---|---|
| Avisos | 2 |
| Visitas | 1 |
| Otros | 2 |
| **Fabricación** | **0** |
| **Montaje** | **0** |
| **Material** | **0** |

Y eso con **4 proyectos suyos visibles y 4 materiales visibles**.

**La causa.** En el BLOQUE 1 se cerró `projects` a administración, que es
lo correcto: ahí están el importe y la paga y señal. Pero el calendario
llegaba a esos datos por vistas `security_invoker`, que se ejecutan con
los permisos de quien pregunta:

- `planned_spans` leía `public.projects` → cero tramos para un trabajador;
- la rama de material hacía `join public.projects` → la fila desaparecía;
- la de notas, lo mismo, con el código del proyecto en blanco.

Nadie lo notó porque **las pruebas de navegador usan un Supabase de
mentira** que modela la visibilidad con sus propias reglas y sí le
devolvía los proyectos asignados. La prueba pasaba; la aplicación de
verdad, no. Es el motivo por el que las reglas de permisos se prueban
contra PostgreSQL de verdad y no solo en el navegador.

**La solución** es la del BLOQUE 1: no leer tablas de administración
desde una vista que se ejecuta como el usuario, sino leer vistas que
filtran ellas mismas y no llevan dinero. `planned_spans` pasa a
`security_barrier` con su propio filtro (`is_admin() or
worker_can_see_project`) y trae el nombre del cliente, para que
`v_calendar` no tenga que volver a `projects`. Las ramas de material y
de notas leen `worker_projects`.

Después del arreglo, el mismo trabajador ve fabricación (2), montaje (1)
y material (4) — y sigue leyendo **cero filas** de `projects`.

### 2. El importe de una ficha tampoco debía llegarle

`fichas` guarda `amount`, y **RLS filtra filas, no columnas**: un
trabajador asignado a un aviso leía la fila entera, importe incluido. No
se notaba porque los avisos nunca habían tenido importe. En el momento
en que un aviso se factura, es una fuga.

Se cierra igual que `projects`: la tabla pasa a ser de administración y
el trabajador entra por **`worker_fichas`**, escrita a propósito sin la
columna del dinero. Ve exactamente las mismas fichas que antes —las
visitas y avisos que tiene asignados— con el trabajo, el teléfono, el
correo y las horas. El importe no.

Las dos pruebas que daban por bueno lo anterior se han **actualizado**,
no desactivado: ahora exigen que no lea ni una fila de `fichas` y que
las vea por la vista.

### 3. Avisos de taller: la pantalla que ya existía, con dos campos más

Un trabajo de mostrador —cortar una pieza, plegarla, un apaño— es un
**aviso**, con su `AVI-2026-001`, su cliente, su documentación, su
historial y sus seis estados de siempre. No se ha creado ninguna tabla
ni ninguna pantalla paralela.

Lo que le faltaba para poder facturarlo eran dos datos, y son dos
columnas: `fichas.email` y `fichas.hours`. El importe ya existía
(`amount`); lo único que pasaba es que el formulario solo lo mostraba
para los presupuestos, y ahora también para los avisos.

**Lo que no se ha cambiado:** un aviso sigue necesitando cliente
(`fichas_client_required`). Para facturar hace falta a quién, así que el
dato es necesario; y darlo de alta no estorba, porque el buscador de
cliente del propio formulario crea uno nuevo con solo el nombre. Un
aviso sigue sin poder convertirse en proyecto.

### 4. Pedir material sin esperar a nada

Ya existía `material_requests` con su revisión (aceptar → se crea el
material pendiente; descartar → se explica por qué). El problema era la
puerta de entrada: solo se podía abrir desde una **orden**
(`submit_material_request`) o desde un **parte**
(`submit_material_request_report`). Había que esperar a tener uno.

Se añade `submit_material_need(proyecto, texto)`, con el proyecto
**opcional**, y `material_requests.project_id` deja de ser obligatorio:
hay material que es de taller, y quien ve el hueco en la estantería no
siempre sabe para qué proyecto es. La petición entra en la **misma
lista** y pasa por la **misma revisión**. No hay un segundo sistema.

Lo puede usar cualquiera, trabajador o administración, que es lo que
pedía el encargo. Cuando la abre administración queda en la misma lista
de revisión: es un poco circular, pero es mejor que tener dos caminos
distintos para la misma cosa.

**Una consecuencia que había que resolver:** el material pendiente
siempre es de un proyecto (de ahí cuelgan el calendario y el listado por
proyecto, y así seguirá). Si la petición llega sin proyecto,
`accept_material_request` se niega y pide que administración diga a cuál
va. La función se recreó con un parámetro más en lugar de añadir una
sobrecarga, para que no queden dos funciones con el mismo nombre y la
llamada no sea ambigua.

### 5. «Parte sin proyecto», y un fallo que apareció al hacerlo

Técnicamente ya se podía (entrando en `/t/partes/nuevo` sin proyecto),
pero no había ninguna opción que lo dijera. Ahora:

- hay un botón **«Parte sin proyecto»** en el inicio y en «Mis partes»,
  que abre **el mismo formulario** y explica qué es;
- el proyecto se elige **dentro del formulario**, con «Sin proyecto»
  como opción de verdad, de modo que también se puede rectificar;
- administración lo asigna después, que ya existía.

Al añadir el selector apareció un fallo: `/t/partes/:id` y
`/t/partes/nuevo` son **la misma ruta**, así que React reaprovecha la
pantalla y el `useState` se queda con lo del parte anterior. Abrir un
parte nuevo desde otro arrastraba su proyecto y sus horas. Lo cazó la
prueba del BLOQUE 1. El formulario se vacía ahora explícitamente cuando
el parte es nuevo.

### 6. Los proyectos del trabajador, ordenados por lo que toca antes

`worker_projects` no traía fechas, así que no había con qué ordenar. Se
le añaden las de planificación y `proximo` (la primera fecha que le
afecta, para ordenar sin hacer cuentas en el móvil). Son **fechas, no
dinero**: la vista sigue sin importe, sin paga y señal y sin
facturación. Los que no tienen fecha van al final: no se sabe cuándo
son, no pueden adelantar a lo que sí.

### 7. Dos cosas que se corrigieron por el camino, en las pruebas

- **Una prueba que fallaba los fines de semana.** `fase5.mjs` planificaba
  la fabricación en `today()`, y un tramo que cae en sábado o domingo no
  se pinta (BLOQUE 3). La prueba pasaba de lunes a viernes y fallaba
  sábado y domingo. Ahora usa `diaLaborable()`, que es el laborable más
  cercano hacia atrás.
- **El Supabase de mentira no ordenaba.** Ignoraba el `order` de
  PostgREST, así que una prueba de orden pasaba sola. Se le ha añadido
  `applyOrder`, con nulos al final como en la base de datos. Se comprobó
  quitando el orden del código: antes la prueba seguía en verde, ahora
  falla.

---

## REVISIÓN TRANSVERSAL · lo que encontró y cómo se cerró

Archivo SQL: `33_revision_permisos.sql`. Pruebas: `tests/sql/85_tests_auditoria.sql`.

### Cómo se hizo la revisión

No repasando una lista escrita a mano, sino **preguntándole al catálogo
de PostgreSQL** qué alcanza de verdad un trabajador:

1. qué relaciones tienen permiso de lectura para `authenticated` (46);
2. cuáles de ellas tienen columnas de dinero o datos personales;
3. cuántas filas le devuelve cada una **impersonando a un trabajador**;
4. qué funciones puede ejecutar sin que su cuerpo compruebe nada.

Tres de esas preguntas se han quedado escritas como pruebas que recorren
el catálogo. Si mañana alguien añade una tabla con un importe y se la
deja alcanzable, fallan solas; no hay que acordarse de nada.

### Lo que estaba bien

- **Ninguna fuga económica.** La barrida del catálogo da cero: ni importe
  de proyecto, ni paga y señal, ni cobros, ni facturación, ni obras, ni
  costes extras, ni importe de ficha. Las dieciséis relaciones con
  columnas de dinero devuelven **cero filas** a un trabajador.
- **No hay escalada de privilegios.** Un trabajador puede escribir en su
  propia fila de `profiles`, pero el disparador
  `trg_profiles_protect_columns` le devuelve `role`, `active`,
  `username`, `email` e `is_demo` a lo que estaban. Comprobado
  intentándolo: la orden no da error y el rol sigue siendo `worker`.
- **Documentación administrativa.** El trabajador no recibe ni la fila ni
  la firma del almacén.
- **Partes.** El ciclo completo aguanta: crea, edita mientras está
  pendiente, administración rechaza con motivo, él corrige y reenvía,
  administración valida, y entonces —y solo entonces— las horas cuentan
  en el proyecto. Validado, ni por la función ni escribiendo en la tabla.
- **Borrado sin huérfanos.** Se monta un juego completo (obra, proyecto,
  extra, equipo, documentos, comentarios, material, presupuesto, aviso),
  se borra de arriba abajo y una consulta repasa **catorce** columnas que
  referencian a otra tabla: no queda ni una colgando.
- **Calendario.** Lo automático no solapa y respeta el margen; a mano sí
  se solapa y se queda; replanificar no deshace lo manual; los festivos
  y los fines de semana se respetan; todo queda en el historial.

### Lo que no estaba bien · 1) El teléfono y el correo de los compañeros

**Lo mismo que en los BLOQUES 1 y 5: RLS filtra filas, no columnas.**

Desde el BLOQUE 1, la política de `profiles` le devuelve al trabajador la
fila de quien comparte proyecto u orden con él, y hace falta: así sabe
con quién trabaja. Pero en esa fila van también el **teléfono**, el
**correo**, el **usuario de acceso** y las **preferencias**.

Comprobado: Juan leía el teléfono y el correo de Pedro, y las
preferencias de administración.

**Aquí no servía el truco de las vistas.** Los nombres de los compañeros
se leen por relación desde los comentarios, los partes, los documentos y
los equipos de las órdenes; cerrar la tabla los habría dejado en blanco
en media aplicación. Se usa lo que PostgreSQL tiene para esto
exactamente: **permisos por columna**.

    revoke select on public.profiles from authenticated;
    grant select (id, full_name, role, active, is_demo, created_at, updated_at)
      on public.profiles to authenticated;

El nombre y el rol siguen siendo legibles —es lo que la aplicación
necesita para escribir «lo subió Juan»—, y los cuatro datos personales
se leen por `profiles_full`, que devuelve el propio perfil a cada uno y
todos a administración.

**Dos efectos que había que resolver, y que se resolvieron:**

- `select *` sobre `profiles` deja de funcionar. Los tres sitios que lo
  hacían (el arranque de sesión, el listado de personas y los cambios de
  rol/estado/nombre) leen ahora por `profiles_full`.
- **La copia de seguridad habría salido incompleta sin avisar**, porque
  recorre las tablas con `select *`. Ahora lee `profiles` por la vista, y
  hay una prueba que abre el ZIP y comprueba que `profiles.csv` sigue
  trayendo `phone`, `email`, `username` y `preferences` con sus valores.

La función `admin-users` **no se ha tocado**: usa la clave de servidor,
que no pasa por los permisos de `authenticated`.

### Lo que no estaba bien · 2) «order_caption»

Era `security definer` y no comprobaba nada, así que devolvía el código,
el tipo, la fecha y **el nombre del proyecto** de cualquier orden,
incluidas las que no eran del trabajador — mientras la tabla,
correctamente, le devolvía cero filas. Es una función interna que solo
usan los avisos y que el frontend no llama: se deja de conceder a quien
tiene sesión, como las demás internas.

### Lo que no estaba bien · 3) Un usuario desactivado seguía viendo cosas

Al desactivar a alguien deja de entrar y deja de ver sus proyectos y sus
fichas. Pero las políticas de `non_working_days` y `calendar_notes` eran
literalmente `true`: cualquiera con sesión las leía, activo o no.
Comprobado: un trabajador desactivado seguía recibiendo tres filas del
calendario. Se mantiene la decisión del BLOQUE 3 —los festivos y los
eventos del taller los ve todo el mundo— y se le añade lo que faltaba:
estar activo.

### Lo que no estaba bien · 4) Un archivo del almacén sin su fila

`storage_can_read` descartaba lo administrativo y la papelera mirando la
fila de `documents` de esa ruta. Un archivo que quedara en el almacén
**sin** su fila (una subida a medias) no tenía nada que descartar, y se
servía si la carpeta era de un proyecto suyo. Se le ha dado la vuelta:
para leer un archivo tiene que **existir** su fila, no estar en la
papelera y no ser administrativa. Lo que no está registrado no se sirve.

### Una decisión que se revisó y se deja como está

A un trabajador con **cualquier** petición de material (incluso
descartada) no se le puede eliminar: `delete_worker` se niega y dice que
lo desactive. Desde el BLOQUE 5 cualquiera puede pedir material, así que
el caso es más probable que antes. Se deja así a propósito: la regla de
la aplicación es que **a las personas no se les borra, se las
desactiva**, y una petición es un rastro de trabajo. El mensaje ya lo
explica y ofrece la salida correcta.

### Dos cosas sobre las pruebas

- `test.ok` tiene ahora una variante con **dato de diagnóstico** que solo
  sale si la comprobación falla. Las barridas del catálogo lo necesitan:
  sin eso, un fallo dice «hay una fuga» y no dice dónde. Ahora dice
  `profiles.username, profiles.email, profiles.phone`.
- Cada arreglo se ha comprobado **mutando el código**: devolviendo el
  permiso de columna, volviendo a conceder `order_caption`, quitando la
  exigencia de que el archivo esté registrado y quitando el esquive de la
  planificación. Las cuatro mutaciones hacen fallar pruebas. La del
  archivo huérfano **no fallaba ninguna** la primera vez: faltaba la
  prueba, y se añadió.

---

## QA ANTES DE PRODUCCIÓN

Prueba: `tests/e2e/qa-final.mjs` (`npm run test:qa`).

No prueba funcionalidades sueltas: hace **el recorrido entero, en orden
y arrastrando el estado**, con tres navegadores a la vez —administración
en un portátil, Juan en un móvil, Pedro en otro— porque los fallos de
aislamiento solo salen cuando hay dos trabajadores de verdad. Deja
capturas en `tests/capturas/` para poder **mirar** las pantallas.

### Lo que encontró y se corrigió

**1. «NaN día(s)» en la planificación.** Al crear un proyecto, si
`fab_workers` llegaba vacío, la pantalla hacía `horas ÷ undefined ÷ 8` y
pintaba `NaN`. En producción no puede pasar (la columna es `not null
default 2`), pero sí en una instalación a la que le falte el archivo 30.
El fallo real era del Supabase de mentira, que no aplicaba los valores
por defecto de la tabla; se ha corregido para que se comporte como
PostgreSQL. Es un ejemplo de lo que pasa cuando el doble de pruebas es
más permisivo que la base de datos de verdad.

**2. Las fotos y la firma no existían hasta guardar, y no se decía.**
Cuelgan del parte, así que no pueden existir antes que él. Pero el
trabajador abría el parte, buscaba la cámara y no estaba. Ahora un parte
nuevo lo dice: «Guarda el parte y podrás añadirle fotografías, la firma
del cliente, avisar de material y escribir comentarios».

**3. Un aviso desfasado.** En un parte sin proyecto se leía «Para avisar
de material hace falta que el parte tenga proyecto». Desde el BLOQUE 5
eso ya no es verdad: hay «Solicitar material» en el inicio, que funciona
sin proyecto. El texto ahora manda ahí.

**4. La fila del proyecto se estrujaba en 320 px.** En el inicio del
trabajador, «código · nombre · fechas» en una línea partía el código en
dos («PROY-2026-» / «001»). Lo introdujo el BLOQUE 5 al meter la fecha
en esa lista. La fecha baja ahora a su propia línea.

### Lo que se comprobó y estaba bien

Los catorce flujos del encargo, de principio a fin: creación del
proyecto con equipo, horas y personas por fase; el trabajador viendo
solo lo suyo; el parte con fotos, vídeo, firma, material y comentarios;
validación y bloqueo; rechazo y corrección; parte sin proyecto asignado
después; material sin parte; documentación técnica sí y administrativa
no; duración 32 h → 2 días y 16 h → 1 día; festivos, fines de semana,
cambio manual y su historial; la obra con sus cuentas; el aviso de
taller; los borrados con sus confirmaciones; y el móvil a 320 px.

**Dos capas independientes en la documentación administrativa.** Se
comprobó mutando el servidor para que devolviera los documentos
administrativos al trabajador: la pantalla **siguió sin enseñarlos**,
porque `DocumentsPanel` filtra también por su cuenta. Lo que sí cazó la
mutación fue la comprobación por API. Las dos capas son deliberadas y
conviene mantenerlas.
