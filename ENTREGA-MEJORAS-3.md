# METALPLAFER360 · BLOQUE DE MEJORAS FUNCIONALES

**Cuatro mejoras: cambiar el cliente, material de taller, dos subestados de
montaje y el anticipo como cobro.**

Código funcional, no una propuesta. Todo está escrito, aplicado contra un
PostgreSQL 16 de verdad y probado. **No he hecho commit, ni push, ni
despliegue**, y **no he ejecutado nada contra tu Supabase**.

---

## 0. Antes de nada: lo que falta en el repositorio

`supabase/sql/40_importar_holded.sql` **no está en el repositorio**. No está en
`.gitignore`: simplemente nunca se subió. Es el único archivo que define
`public.norm_client_name`, y sin ella se corta la instalación de
`45_proveedores.sql` (y con ella se van los permisos y las políticas de los
proveedores).

Para poder ejecutar la batería he escrito un apaño local,
`supabase/sql/40_APANO_LOCAL_NO_ENTREGABLE.sql`, que **no forma parte de esta
entrega** y que no hay que aplicar: contiene solo esa función, y lo dice en su
cabecera. No he reconstruido el archivo 40 de memoria porque sería inventar una
migración.

**Consecuencia concreta en los resultados**: las ~40 comprobaciones de
`tests/sql/92_tests_holded.sql` **no se ejecutan** en mi entorno. Lo pongo en la
sección 6 con las demás.

Sigo necesitando que me pases `supabase/sql/40_importar_holded.sql` de tu copia
local para subirlo al repositorio.

---

## 1. Resumen de lo que se ha hecho

### M1 · Cambiar el cliente de un presupuesto, un aviso o un proyecto

El formulario decía literalmente *«el cliente de una ficha no se cambia una vez
creada»*. Ahora se cambia, eligiendo **uno que ya existe**.

- Reutiliza el buscador de clientes de siempre (`ClientPicker` y
  `suggest_clients`): se escribe el nombre o el CIF y se elige de la lista.
- Se guarda **el identificador** del cliente elegido, nunca su nombre.
- Al editar, el formulario **no ofrece dar de alta un cliente nuevo**. Si el
  cliente bueno todavía no existe, se da de alta en Clientes y se vuelve: así no
  quedan dos registros del mismo cliente.
- Si había una **persona de contacto** del cliente anterior, se suelta: dejarla
  sería enseñar el teléfono de alguien de otra empresa. Lo hace la base de datos,
  no solo la pantalla.
- Se puede **dejar el de antes** con un botón, por si se abre el buscador y uno
  se arrepiente.
- **Sin cascada**: cambiar el cliente del presupuesto no cambia el del proyecto
  que salió de él, ni al revés. La pantalla lo dice.
- El historial lo cuenta con nombres: *«Salvi cambió el cliente de PRES-2026-004:
  Construccions Vallès Nord, S.L.U. → Construcciones Vallès Nord SL. Se quitó la
  persona de contacto, que era del cliente anterior.»*

### M2 · Pedir material que no es de ningún proyecto

Los consumibles del taller (discos, electrodos, guantes) ya no hay que colgarlos
de un proyecto cualquiera.

- **Lo primero que comprobé fue si hacía falta tocar el modelo de datos**, como
  pedías. Resultado: `material_requests.project_id` **ya admitía nulos** —un
  trabajador ya podía pedir material sin decir el proyecto—, pero
  `materials.project_id` era `not null`, y ahí se cortaba. La propia función lo
  decía: *«Esta petición no trae proyecto. Elige a qué proyecto va el material
  antes de aceptarla»*. Se quita **esa** obligación y nada más.
- En el formulario, «sin proyecto» es una **opción que hay que elegir a mano**
  («Sin proyecto · material de taller»). El desplegable no trae ninguna puesta,
  así que el material de un trabajo no puede acabar como consumible por despiste.
- En el listado se ve una etiqueta **«Taller»**, no un hueco.
- Una petición del taller que llega sin proyecto **se puede aceptar tal cual**.
  Si la petición sí trae proyecto, manda el de la petición.
- **No se crea ningún proyecto «Taller» ni «Varios»**, no se convierte ningún
  pedido antiguo y no se asigna ningún proyecto por defecto.

Y lo que de verdad costaba trabajo: **repasar todo lo que daba por supuesto que
el material tiene proyecto**. Está en la sección 3.

### M3 · Dos subestados nuevos en montaje

`Pendiente de montaje` **primero** y `Pendiente de rematar` **último**, que es el
recorrido real: algo que espera para montarse, y algo montado al que le faltan
remates. Los tres de antes se quedan igual y en el mismo orden entre ellos.
Ningún proyecto cambia de subestado.

De paso se corrige un **descuido de la entrega anterior**: `lacado_zincado` se
añadió al catálogo y a la pantalla, pero **no a `label_es`**, así que el
historial escribía `lacado_zincado` en crudo en lugar de «Lacado-Zincado». Lo
comprobé contra la base de datos antes de tocarlo.

### M4 · El anticipo y la paga y señal, en el total cobrado

Esta es la delicada, así que empiezo por lo que **no** he hecho.

`projects.advance_amount` es una **cifra prevista**: lo que se acordó cobrar. No
hay ningún sitio donde conste si se ha recibido. El dinero cobrado de verdad vive
en `payments`, y solo ahí. Así que **sumar `advance_amount` al total cobrado
habría hecho dos cosas malas**:

1. contar como cobrado un importe que puede estar solo previsto;
2. y contarlo **dos veces** en los proyectos donde ya se apuntó el anticipo como
   cobro, que es lo que la aplicación invita a hacer hoy (el marcador del campo
   de notas dice «Anticipo, transferencia…»).

Lo que hace la mejora es darle al anticipo **un camino explícito para
convertirse en cobro**:

- un botón **«Apuntar el anticipo de 1.500,00 €»** en la pantalla de cobros, que
  lo registra en `payments` **reutilizando `register_payment`**, la función de
  siempre;
- el cobro queda **marcado** como anticipo (`payments.is_advance`), así que
  sabemos cuál es;
- **no se puede registrar dos veces**: hay un índice único que solo admite un
  anticipo sin anular por proyecto, y la base de datos lo impide incluso por
  debajo de la función;
- mientras no se apunte, la pantalla dice **«Anticipo · sin cobrar»** y lo
  explica: *previsto no es cobrado*;
- si se anula, **deja de contar en los dos sitios a la vez** y el anticipo vuelve
  a quedar sin cobrar, sin que nadie recalcule nada;
- **la fuente de verdad sigue siendo `payments` y sigue siendo una sola**: lo
  cobrado como anticipo sale del **mismo `sum`** que el total cobrado, con un
  filtro más. Es una **parte** de él, así que es imposible por construcción que
  se sume aparte o se cuente dos veces.

---

## 2. Lista de archivos

### Migraciones SQL · nuevas, **sin ejecutar** contra Supabase

| Archivo | Mejora | Qué hace |
|---|---|---|
| `supabase/sql/51_montaje_y_anticipo.sql` | M3 + M4 | Dos subestados, las etiquetas, `payments.is_advance`, el índice único, `register_advance_payment` y la vista `project_billing` ampliada |
| `supabase/sql/52_cambiar_cliente.sql` | M1 | `set_ficha_client` y `set_project_client` |
| `supabase/sql/53_material_sin_proyecto.sql` | M2 | `materials.project_id` deja de ser obligatorio, y los cinco sitios que lo daban por supuesto |

M3 y M4 van juntas porque ninguna toca datos y comparten el mismo archivo de
estados; M1 y M2 van cada una en el suyo.

### Aplicación

| Archivo | Mejora | Qué cambia |
|---|---|---|
| `src/config/constants.ts` | M3 | Los cinco subestados de montaje, en orden |
| `src/types/db.ts` | M2, M4 | `Material.project_id` puede faltar; `Payment.is_advance`; `ProjectBilling.anticipo` y `anticipo_cobrado` |
| `src/services/billing.ts` | M4 | `registerAdvancePayment()`; el anticipo en `BillingRow` |
| `src/services/fichas.ts` | M1 | `setFichaClient()` |
| `src/services/projects.ts` | M1 | `setProjectClient()` |
| `src/services/materials.ts` | M2 | El proyecto del material puede ir vacío, pero tiene que venir **decidido** |
| `src/components/shared/ClientPicker.tsx` | M1 | Modo «solo elegir entre los que ya existen» |
| `src/components/shared/MaterialModal.tsx` | M2 | La opción «Sin proyecto · material de taller» |
| `src/pages/admin/FichaForm.tsx` | M1 | Cambiar el cliente al editar un presupuesto, una visita o un aviso |
| `src/pages/admin/ProjectForm.tsx` | M1 | Lo mismo en el proyecto, soltando la persona de contacto |
| `src/pages/admin/MaterialsList.tsx` | M2 | Anotar y aceptar material de taller; etiqueta «Taller» |
| `src/pages/admin/BillingPage.tsx` | M4 | El anticipo a la vista, el botón y la marca en la lista de cobros |
| `src/pages/admin/ProjectDetail.tsx` | M4 | En «Cobros», si el anticipo está cobrado o no |

### Pruebas nuevas

| Archivo | Comprobaciones |
|---|---|
| `tests/sql/98_tests_montaje_anticipo.sql` | 52 · M3 y M4 contra PostgreSQL |
| `tests/sql/99_tests_cambiar_cliente.sql` | 32 · M1 |
| `tests/sql/99_tests_material_taller.sql` | 32 · M2 |
| `tests/unit/catalogos.test.ts` | 6 · la pantalla, la base de datos y la Supabase de pruebas, de acuerdo |
| `tests/e2e/mejoras2.mjs` | 52 · las cuatro mejoras en un navegador de verdad |
| `package.json` | el guion `test:mejoras2`, añadido también a `test:all` |

### Pruebas existentes que he tenido que **cambiar** (y por qué)

Las cuatro, por el mismo motivo: **afirmaban lo que la mejora cambia**. Ninguna
se ha desactivado ni relajado; se ha sustituido la afirmación vieja por la nueva,
que comprueba más.

| Archivo | Antes afirmaba | Ahora afirma |
|---|---|---|
| `tests/e2e/fase3.mjs` | «Montaje ofrece sus **tres** subestados» (contándolos) | Los **cinco**, por su nombre y **en orden** |
| `tests/sql/84_tests_bloque5.sql` | «Una petición sin proyecto **no se acepta a ciegas**» (error 22023) | Que se acepta **como material de taller**, y que el formulario es el que obliga a elegir |
| `tests/sql/84_tests_bloque5.sql` | «El material pendiente es **SIEMPRE** de un proyecto» | Que **lo único** que va sin proyecto es el material de taller, y solo cuando se pide así |
| `tests/sql/85_tests_auditoria.sql` | El barrido de referencias huérfanas trataba `materials.project_id` vacío como huérfano | Lleva la misma guarda `is not null` que todas sus columnas vecinas que admiten vacío |

### Pruebas existentes que he **corregido** por fallos propios de las pruebas

| Archivo | Fallo | Arreglo |
|---|---|---|
| `tests/e2e/fake-supabase.mjs` | El historial del subestado escribía la **clave técnica** (`pendiente_montaje`) en lugar de la etiqueta, así que la prueba del navegador decía que todo iba bien mientras la pantalla de verdad habría enseñado la clave | Mapa `SUBSTATUS_ES` y la etiqueta en el apunte, **vigilado** por `tests/unit/catalogos.test.ts` para que no se quede atrás |
| `tests/e2e/fake-supabase.mjs` | `set_project_substatuses` borraba **todos** los subestados y los reinsertaba, así que el historial se llenaba de «añadió» falsos de subestados que ya estaban | Solo quita los que ya no están y solo apunta los nuevos, como la función de verdad |
| `tests/e2e/fake-supabase.mjs` | `project_billing.cobros` contaba también los cobros **anulados** | Como la vista de verdad: solo los no anulados |

---

## 3. Qué cambia en cada capa

### Base de datos

**M3 · los subestados** (`51_montaje_y_anticipo.sql`)

`project_substatuses` tiene un `check` que llama a `valid_substatus`, que es
`immutable`. Redefinirla cambia lo que la restricción acepta **sin revalidar la
tabla y sin tocar una sola fila**. Esto no lo doy por supuesto: se comprobó
contra PostgreSQL 16 en la entrega anterior y las pruebas lo dejan fijado (acepta
los nuevos, **sigue rechazando uno inventado**, y los nuevos no valen en otra
fase).

`label_es` se regenera a partir de la del archivo 42 con **tres líneas añadidas**
(los dos subestados nuevos y el `lacado_zincado` que faltaba). Lo comprobé con un
`diff` contra la original antes de escribirla.

**M4 · el anticipo** (`51_montaje_y_anticipo.sql`)

- `payments.is_advance boolean not null default false`. Es una **marca**, no un
  importe: el dinero sigue estando en `amount` y en ningún otro sitio. Los cobros
  que ya existen quedan como cobros normales, que es lo que son.
- `create unique index payments_advance_unique on payments (project_id) where
  is_advance and voided_at is null`. **Esta es la garantía de verdad**: la regla
  «no sumar dos veces un anticipo» no depende de que todo el mundo pase por la
  función. Comprobado: la base de datos rechaza un segundo anticipo vivo tanto
  insertándolo a mano como marcando otro cobro, **incluso desde el servidor**. Al
  anular el primero, el hueco se libera.
- `register_advance_payment(p_project, p_amount, p_paid_on, p_notes)`: solo
  administración, **reutiliza `register_payment`** (así el cobro recalcula el
  estado de cobro y queda en el historial como cualquier otro) y marca la fila. Se
  distingue entre «este proyecto no tiene anticipo anotado» y «el importe que me
  das no vale», porque son dos problemas distintos.
- `project_billing` se amplía con `anticipo` (el previsto) y `anticipo_cobrado`
  (lo recibido). **Las cinco columnas de antes conservan nombre, tipo y orden** —
  hay una prueba que lo comprueba leyendo el catálogo— para que nada de lo que ya
  lee la vista se entere del cambio.

**M1 · el cliente** (`52_cambiar_cliente.sql`)

Dos funciones, hechas a imagen de `set_project_work` del archivo 31, que ya hace
esto mismo con las obras. La columna `client_id` ya se podía escribir (un
administrador puede actualizar fichas y proyectos); lo que hacía falta meter en la
base de datos son las dos cosas que tienen que pasar **siempre**, no solo cuando
se cambia desde el formulario:

1. que el historial lo cuente con los dos nombres, en lugar de «modificó la ficha
   X» con dos identificadores en crudo en el detalle;
2. que la persona de contacto del cliente anterior **se suelte**.

Además comprueban que el cliente de destino existe y **no está archivado**, y que
un presupuesto o un aviso no se queden sin cliente (una visita sí puede: puede ser
de alguien que todavía no es cliente). Poner el cliente que ya tenía **no escribe
nada** en el historial.

**M2 · el material** (`53_material_sin_proyecto.sql`)

`alter table public.materials alter column project_id drop not null`. **Quitar un
`not null` no cambia ninguna fila**, y es reversible mientras no haya material de
taller.

Lo demás de este archivo es el repaso de **todo lo que daba por supuesto que el
material tiene proyecto**. Cada una de estas cosas habría fallado en silencio:

| Qué | Qué habría pasado | Arreglo |
|---|---|---|
| `trg_audit` (la viva está en el archivo **27**, no en el 16) | El historial diría «anotó material pendiente: … **en un proyecto**», que es mentira | Dice «en el taller». Las demás ramas quedan letra por letra |
| `notify_late_materials` | Hacía `join projects`: el material de taller retrasado **no habría avisado a nadie**, que es justo para lo que sirve esa pantalla | `left join` y «Taller» en el aviso |
| `report_materials` | `join projects`: el de taller **no habría salido en ningún informe** | `left join` y «Taller» en la columna del proyecto |
| `v_calendar` (la viva está en el **32**) | `join worker_projects`: el material de taller con fecha prevista **habría desaparecido del calendario** | `left join` **más una condición que conserva exactamente el filtro de permisos**: un `left join` a secas habría enseñado a cada trabajador el material de proyectos que no son suyos. Hay una prueba para eso |
| `project_materials` | Agrupa por proyecto y se consulta por un proyecto concreto, así que el grupo sin proyecto no estorba | **No se toca** |
| RLS de `materials` | `materials_select` es `is_admin() or worker_can_see_project(project_id)`, y `worker_can_see_project(null)` devuelve **falso** (comprobado) | **No se toca**: el material de taller es de administración, y un trabajador no lo ve |

Las cinco funciones y la vista están **generadas a partir de su definición viva**
—la del último archivo que las define— con un cambio textual mínimo, y he probado
cada una con un `diff` contra la original antes de escribirla. Esto importa: la
definición viva de `trg_audit` está en el archivo 27 y la de `v_calendar` en el
32; haber copiado la del 16 habría hecho retroceder meses de trabajo.

### Servicios (`src/services/`)

- `registerAdvancePayment()` llama a la función nueva; valida el importe antes de
  salir del navegador.
- `setFichaClient()` y `setProjectClient()` van por su propia función y no por un
  `update` suelto, por lo dicho arriba.
- `createMaterial()` ya no exige proyecto, pero **sí exige que venga decidido**:
  `null` es una respuesta, no haberlo puesto no lo es.

### Pantallas

- **Facturación**: el anticipo previsto aparece como una cifra más, con su estado
  («sin cobrar» / «cobrado» / «cobrado 500,00 €»); el botón de apuntarlo solo
  sale si falta; el cobro del anticipo lleva su etiqueta en la lista; y el aviso
  de anular sigue diciendo que el cobro no se borra.
- **Proyecto**: en «Cobros», una línea que dice si el anticipo está cobrado o
  todavía no.
- **Presupuesto / aviso / proyecto**: el panel de cliente pasa de una frase
  («no se cambia») al buscador en modo «solo elegir», con el botón de dejar el de
  antes y el aviso de que no hay cascada. En el proyecto, elegir cliente **suelta
  la persona de contacto** también en el formulario: si no, al guardar se volvería
  a mandar y la pondría otra vez después de que la base de datos la hubiera
  quitado.
- **Material pendiente**: la opción «Sin proyecto · material de taller» en el
  desplegable, con una explicación al elegirla; la etiqueta «Taller» en el
  listado; y al aceptar un aviso del taller, se puede elegir proyecto **o** marcarlo
  como consumible.

---

## 4. Migraciones

Van en **archivos independientes**, numerados detrás de lo que ya hay (el 49 es
el último del repositorio y `pendientes/50_retirar_demo.sql` está ocupado), y
**NO las he ejecutado contra tu Supabase**.

| Archivo | Por qué hace falta |
|---|---|
| `51_montaje_y_anticipo.sql` | **M3**: el catálogo de subestados vive dentro de una función `immutable` a la que llama un `check`; no hay forma de añadir un subestado sin redefinirla. **M4**: hace falta un sitio donde conste **cuál** de los cobros es el anticipo, y un índice que impida que haya dos |
| `52_cambiar_cliente.sql` | El historial legible y el soltar la persona de contacto tienen que pasar **siempre**, no solo cuando se cambia desde el formulario. Con un `update` suelto desde la pantalla, el historial guardaría dos identificadores en crudo y el contacto se quedaría |
| `53_material_sin_proyecto.sql` | `materials.project_id` era `not null`: sin quitarlo no hay manera de anotar un consumible. Y quitarlo obliga a arreglar los cinco sitios que lo daban por supuesto |

Los tres se pueden ejecutar **varias veces sin hacer daño** y hay que ejecutar
cada archivo **completo de una vez**.

**Ninguna de las tres migra datos.** No hay un solo `update`, `delete` o `insert`
sobre filas existentes en ninguna de ellas: solo `create or replace function`,
`create or replace view`, `alter table … add column`, `alter table … drop not
null`, `create index` y `comment`.

---

## 5. ¿Se han modificado datos?

**No. Ni uno.**

- **No he ejecutado nada contra tu Supabase.** Todo lo he probado contra un
  PostgreSQL 16 local que se crea y se tira en cada ejecución de la batería.
- **No he borrado, vaciado, recreado ni sobrescrito ningún registro.**
- **No he cambiado ningún identificador** de ningún registro existente.
- **No he tocado los datos de Holded**, ni los he reimportado. (Ni podría: el
  archivo que los importa no está en el repositorio.)
- **No he creado duplicados** de clientes, proyectos, presupuestos, avisos,
  pedidos ni cobros. M1 reutiliza clientes que ya existen y la batería comprueba
  que el número de clientes **no cambia** al corregir uno.
- **No he modificado datos históricos automáticamente.** Ningún proyecto cambia
  de subestado, ningún cobro cambia de importe, ningún material cambia de
  proyecto y ningún presupuesto cambia de cliente por su cuenta.
- **No he quitado ninguna funcionalidad** que no tuviera que ver con esto.
- **No he hecho commit, ni push, ni despliegue.**

Lo único que las migraciones cambian de la **estructura** es: una columna nueva
con valor por defecto (`payments.is_advance`), un `not null` que se quita
(`materials.project_id`), un índice nuevo, dos funciones nuevas, cinco
redefinidas y una vista ampliada por el final.

---

## 6. Resultados de las pruebas

Ejecutadas de verdad, en este orden. Los números son los que salen por pantalla.

`npm run test:all` termina con **código de salida 0**: typecheck, las pruebas de
unidad, la batería de base de datos y las **20** pruebas de navegador, una
detrás de otra.

### Lo que ha pasado

| Capa | Resultado |
|---|---|
| `npm run typecheck` (TypeScript) | **limpio**, sin un solo error |
| `npm test` (unidad) | **75 / 75** · 5 archivos *(antes 66; +9: las 6 del cruce de catálogos y 3 de los subestados de montaje)* |
| `bash tests/sql/run_all.sh` (PostgreSQL 16 de verdad) | **1444 / 1444** *(antes 1328 en este entorno; **+116 nuevas**)* |
| Navegador · **20** archivos | **1245 / 1245** *(antes 1193 en 19 archivos; +52 de `mejoras2.mjs`)* |

Las 116 comprobaciones nuevas de base de datos, por mejora:

| Mejora | Comprobaciones | Áreas |
|---|---|---|
| M1 · cambiar el cliente | **32** | `cc_juego` 1, `cc_cambio` 7, `cc_hist` 4, `cc_contacto` 2, `cc_cascada` 5, `cc_intacto` 3, `cc_no` 10 |
| M2 · material de taller | **32** | `mt_columna` 5, `mt_alta` 5, `mt_aceptar` 5, `mt_juan` 6, `mt_calendario` 5, `mt_avisos` 3, `mt_informe` 3 |
| M3 · subestados de montaje | **16** | `mon_sub` 7, `mon_tabla` 4, `mon_hist` 5 |
| M4 · anticipos | **36** | `ant_cobro` 8, `ant_dup` 3, `ant_mix` 2, `ant_anular` 6, `ant_no` 6, `ant_cuentas` 5, `ant_vista` 6 |

Y el detalle de los 20 archivos de navegador: smoke 24, navegación 48, fase 2 53,
fase 3 **65**, fase 4 60, fase 5 74, fase 6 140, fase 7 92, bloque 1 45, bloque 2
40, bloque 3 36, bloque 4 68, bloque 5 79, QA final 121, correcciones 90, avisos
45, compartidos 37, publicación 10, mejoras 66, **mejoras 2 · 52**.

### Lo que NO se ha ejecutado, y por qué

| Qué | Cuántas | Por qué |
|---|---|---|
| `tests/sql/92_tests_holded.sql` | ~40 | Falta `supabase/sql/40_importar_holded.sql` en el repositorio (sección 0). El archivo se corta en la primera consulta contra `public.holded_import`, que no existe porque su migración no está. **No tiene nada que ver con este bloque de mejoras**: pasa igual sin mis cambios |
| Cualquier prueba contra tu Supabase | — | No he ejecutado nada contra producción, a propósito |

Esas ~40 no cuentan en el 1444: el archivo se para y sus comprobaciones no se
apuntan. No están «pasando en silencio»: **no se han ejecutado**, y lo digo aquí
porque el total sin esta nota engañaría.

### Banco de mutaciones · 12 de 12 cazadas

No me basta con que las pruebas pasen: he roto cada regla nueva a propósito, una
cada vez, y he ejecutado la batería entera para ver si alguna prueba se enteraba.
Una prueba que no falla cuando rompes lo que vigila no vigila nada.

| # | Mutación | Resultado |
|---|---|---|
| 1 | M4 · un anticipo anulado seguiría contando como cobrado | cazada · `ant_anular` |
| 2 | M4 · el anticipo previsto se sumaría al cobrado (contarlo dos veces) | cazada · `facturacion`, `rev_historial` |
| 3 | M4 · sin la comprobación de «ya está registrado» | cazada · `ant_dup` |
| 4 | M4 · sin el índice que impide dos anticipos vivos | cazada · `ant_dup` |
| 5 | M3 · «Pendiente de rematar» colaría en fabricación | cazada · `mon_sub` |
| 6 | M1 · el contacto del cliente anterior se quedaría puesto | cazada · `cc_cambio` |
| 7 | M1 · se podría mover a un cliente archivado | cazada · `cc_no` |
| 8 | M1 · cambiar el presupuesto arrastraría el proyecto (cascada) | cazada · `cc_cascada` |
| 9 | M2 · el calendario enseñaría material de proyectos ajenos | **sobrevivió al principio** · ver abajo |
| 10 | M2 · el material de taller retrasado no avisaría a nadie | cazada · `mt_avisos` |
| 11 | M2 · el historial diría «en un proyecto» del material de taller | cazada · `mt_columna` |
| 12 | M2 · el informe de material se dejaría fuera el de taller | cazada · `mt_informe` |

Además, tres mutaciones sobre el cruce de catálogos (quitar la etiqueta de
`lacado_zincado`, quitar `pendiente_rematar` de la pantalla y quitarlo de la base
de datos): las tres cazadas por `tests/unit/catalogos.test.ts`.

**La número 9 merece una explicación**, porque es la importante. Quité la
condición de permisos de la rama del material del calendario y **la batería
siguió en 1444/1444**: ninguna prueba se enteró. Fui a ver por qué, y la razón es
que hoy hay **dos cerraduras**: `v_calendar` se ejecuta con los permisos de quien
pregunta, así que las políticas de `materials` ya filtran por su cuenta. Quitar
una deja la otra.

No la quité por eso: `planned_spans`, en el mismo archivo 32, es
`security_invoker = false` precisamente porque tuvo que dejar de depender de las
políticas. El día que `v_calendar` cambie igual, la única cerradura que quedará
es esa condición. Así que **escribí la prueba que la distingue**: leer la vista
*sin sesión* —que es cuando las políticas no filtran— y exigir que no devuelva
ni una fila de material. Con la condición devuelve 0; sin ella, las 7. Con esa
prueba puesta, la mutación 9 **cae**: `mt_calendario`.

Después de cada mutación he comprobado con un `sha256` que el archivo volvía
**idéntico** a como estaba. Los tres quedan íntegros. (Lo compruebo porque en la
ronda anterior se me quedaron dos mutaciones aplicadas sin darme cuenta.)

---

## 7. Riesgos y lo que no he podido comprobar

### Lo que requiere tu Supabase de verdad

1. **Que las tres migraciones se apliquen sobre los datos reales.** Lo he probado
   sobre una base de datos que se construye con los mismos archivos SQL, pero con
   **datos de prueba**. En particular:
   - `alter column project_id drop not null` no puede fallar por datos (quitar una
     obligación nunca la incumple), pero sí tarda un instante en bloquear la
     tabla;
   - el índice único `payments_advance_unique` **se crea sin problema solo si no
     hay ya dos cobros marcados como anticipo**, y no puede haberlos porque la
     columna nace vacía. Riesgo real: ninguno.
2. **Que redefinir `valid_substatus` siga aceptando los subestados que ya existen
   en producción.** Lo comprobé en la entrega anterior sobre PostgreSQL 16 de
   verdad y las pruebas lo fijan, pero el catálogo real de tus proyectos no lo
   puedo leer. Si algún proyecto tuviera un subestado que no esté en el catálogo
   (no debería: hay un `check`), se vería al guardarlo.
3. **Que PostgREST se entere de las funciones nuevas.** Esto es lo único de los
   permisos que no puedo comprobar aquí. Lo demás sí:
   - los `grant execute to authenticated` de las dos funciones **nuevas** están
     escritos igual que los de sus vecinas (`register_payment`,
     `set_project_work`), y la batería comprueba que un trabajador recibe 42501;
   - las cinco funciones **redefinidas** conservan sus permisos, porque `create or
     replace function` no toca la lista de privilegios de una función que ya
     existe. No lo doy por supuesto: la batería llama a cada una de ellas
     **a través del rol `authenticated`** después de redefinirlas
     (`accept_material_request`, `notify_late_materials`, `report_materials`,
     `v_calendar` y, por los disparadores, `trg_audit`). Si alguna hubiera perdido
     el permiso, esas pruebas fallarían con «permission denied».

   Lo que queda fuera: si al llamar a `register_advance_payment`,
   `set_ficha_client` o `set_project_client` la aplicación dijera «function not
   found», es la caché de esquema de PostgREST, que se recarga con
   `notify pgrst, 'reload schema'` o sola al poco rato.
4. **El historial con tus nombres de cliente de verdad.** Las frases las he
   probado con nombres inventados parecidos a los tuyos.

### Riesgos que quiero dejar dichos

- **M1 · un proyecto dentro de una obra.** Si cambias el cliente de un proyecto
  que está en una obra de otro cliente, la aplicación **no te lo impide**, ni
  antes ni ahora: no existe ninguna regla que ate el cliente del proyecto al de su
  obra. No he inventado una, porque sería una regla nueva que no me has pedido.
  La pantalla avisa de que la obra se cambia en su sitio.
- **M1 · el presupuesto y el proyecto quedan desalineados a propósito.** Si
  corriges el cliente del presupuesto, el proyecto que salió de él se queda con el
  cliente anterior hasta que lo cambies también. Es lo que pediste («no cambiar
  automáticamente el cliente de un proyecto al modificar el presupuesto
  relacionado»), pero conviene saberlo: son dos cambios, no uno.
- **M2 · el material de taller no lo ve ningún trabajador.** Es una decisión, no
  un olvido: `worker_can_see_project(null)` es falso, así que las políticas de
  siempre lo dejan en manos de administración. Si quisieras que el taller viera
  sus propios consumibles en el móvil, hay que pedirlo: es otra mejora.
- **M2 · «sin proyecto» en vez de un proyecto equivocado.** El formulario obliga a
  elegir, pero nadie impide elegir mal. Si alguien marca como consumible algo que
  era de un trabajo, se arregla editando el material… salvo que el material ya no
  se puede mover de proyecto desde la pantalla (eso no existía antes y no lo he
  añadido). Dilo si lo quieres.
- **M4 · un anticipo cobrado a medias.** Si se cobró una señal distinta de la
  acordada, el botón apunta el importe que haya escrito en «Importe cobrado», y
  entonces el anticipo queda «cobrado 500,00 €» de los 1.500 previstos. El resto
  se apunta como un cobro normal. No he inventado un segundo anticipo.
- **M4 · los cobros antiguos que eran anticipos.** No he marcado ni uno. No se
  puede saber desde los datos cuál de los cobros antiguos era la paga y señal (la
  nota es texto libre), y marcarlos a ojo sería modificar datos históricos. Si
  quieres marcar alguno a mano, se puede hacer desde la pantalla anulando y
  volviendo a apuntar, o te preparo una consulta para que la revises **tú** antes
  de ejecutarla.
- **Lo que se queda igual a propósito:** `tests/sql/61_payload_real.mjs` sigue
  llamando a `npx esbuild`, que es lo que fallaba en Windows en la otra entrega.
  No lo toco porque no forma parte de este encargo, pero si ejecutas la batería de
  SQL en Windows, ahí te va a fallar.

---

## 8. Cómo aplicarlo y probarlo en tu máquina

### 1) El código

Descomprime el ZIP en la raíz del proyecto, respetando las rutas. No sobrescribe
nada que no esté en la lista de la sección 2.

```
npm install          # solo si hace falta
npm run typecheck
npm test
```

### 2) Las migraciones, en este orden

En el editor SQL de Supabase, **cada archivo completo de una vez**:

```
supabase/sql/51_montaje_y_anticipo.sql
supabase/sql/52_cambiar_cliente.sql
supabase/sql/53_material_sin_proyecto.sql
```

No hace falta pararlo entre archivo y archivo, y se pueden volver a ejecutar sin
hacer daño. **No apliques
`supabase/sql/40_APANO_LOCAL_NO_ENTREGABLE.sql`**: es un apaño mío para poder
correr las pruebas.

### 3) Compruébalo a mano, en cinco minutos

**M3 · subestados**: abre un proyecto en fase de Montaje → tienen que salir cinco
subestados, empezando por «Pendiente de montaje» y acabando por «Pendiente de
rematar». Marca los dos nuevos y mira el historial: tiene que decirlos en
castellano. En Proyectos, el desplegable de subestado tiene que ofrecerlos y
filtrar.

**M4 · anticipo**: coge un proyecto con anticipo anotado → Facturación → botón
«Cobro». Tiene que decir «Anticipo · sin cobrar» y ofrecer «Apuntar el anticipo de
…». Púlsalo: el total cobrado sube **una vez**, el pendiente baja, el cobro sale
con la etiqueta «Anticipo» y el botón desaparece. Anúlalo: vuelve a «sin cobrar» y
el cobro se queda tachado, no se borra.

**M1 · cliente**: edita un presupuesto → panel «Cliente» → «Cambiar» → escribe el
nombre de otro cliente y elígelo de la lista → Guardar. Mira el historial del
presupuesto: tiene que nombrar a los dos clientes. Comprueba que el cliente
anterior sigue en Clientes con todo lo suyo, y que si ese presupuesto ya era un
proyecto, **el proyecto no ha cambiado de cliente**.

**M2 · material de taller**: Material pendiente → «Nuevo material» → en el
desplegable elige «Sin proyecto · material de taller» → ponle nombre y guarda. En
el listado tiene que salir con la etiqueta «Taller». Ponle una fecha prevista
pasada y mira que aparezca en el calendario y en el informe de material. Y en
«Avisos del taller», acepta una petición que llegue sin proyecto marcándola como
material de taller.

### 4) La batería entera

```
npm run test:all
```

Las pruebas de SQL necesitan un PostgreSQL 16 local en el puerto 5433 (lo arranca
el propio guion). Si quieres solo lo nuevo:

```
npm run test:mejoras2        # las cuatro mejoras en un navegador
bash tests/sql/run_all.sh    # la batería de base de datos completa
```

---

## Y para acabar

**No he hecho commit, ni push, ni despliegue. No he ejecutado nada contra tu
Supabase. No he borrado ni modificado ningún dato.**

Lo que necesito de ti, por orden de importancia:

1. **`supabase/sql/40_importar_holded.sql`** de tu carpeta local, para subirlo al
   repositorio (sección 0).
2. Que me digas si el **material de taller** debería verlo el taller en el móvil,
   o si está bien que sea solo de administración.
3. Que me digas si quieres poder **mover un material de un proyecto a otro** (o a
   taller) desde la pantalla, que hoy no se puede.
