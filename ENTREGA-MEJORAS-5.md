# METALPLAFER360 · Entrega de las seis mejoras funcionales

Conversión de presupuestos, visitas técnicas vinculadas, material
preparado, calendario, usabilidad móvil y la nueva bandeja de entrada de
solicitudes por correo.

> **Lo que hay que leer antes que nada, en cuatro líneas.**
>
> Cinco mejoras están **terminadas y probadas**. La sexta —la bandeja de
> correo— tiene **la aplicación entera terminada y probada**, pero la
> recepción de correo **no está operativa**: no existe
> `peticiones@metalplafer.com`, no hay cuenta de proveedor y no se ha
> recibido ningún correo real. Lo que falta está en
> `docs/CORREO-PETICIONES.md`, paso a paso.
>
> **No he hecho commit, push, publicación ni despliegue, y no he
> ejecutado nada contra tu Supabase.** Las migraciones son archivos para
> que las ejecutes tú.

---

## Índice

1. [Qué hay que hacer para aplicarlo](#1-qué-hay-que-hacer-para-aplicarlo)
2. [Resultados de las pruebas](#2-resultados-de-las-pruebas)
3. [Clasificación: terminado, pendiente de configuración, pendiente, opcional](#3-clasificación)
4. [Qué se ha hecho, mejora por mejora](#4-qué-se-ha-hecho-mejora-por-mejora)
5. [Archivos creados, modificados y eliminados](#5-archivos-creados-modificados-y-eliminados)
6. [Decisiones técnicas y por qué](#6-decisiones-técnicas-y-por-qué)
7. [Limitaciones y lo que no he podido verificar](#7-limitaciones-y-lo-que-no-he-podido-verificar)
8. [Cómo comprobar cada mejora a mano](#8-cómo-comprobar-cada-mejora-a-mano)
9. [Lo que queda para más adelante](#9-lo-que-queda-para-más-adelante)

---

## 1. Qué hay que hacer para aplicarlo

### Paso 1 · Copiar los archivos

El ZIP trae **todo lo que cambia respecto a tu último commit**
(`73e6be0`), incluida la tanda anterior (N1–N3) por si no la habías
dejado en el repositorio. Si ya la tenías, los archivos son los mismos y
no pasa nada por sobrescribirlos.

**No incluyo `supabase/sql/40_importar_holded.sql`**: es tuyo y no lo
he tocado.

```bash
cd /ruta/a/metalplafer360
unzip -o METALPLAFER360-mejoras-1-6.zip
npm install     # solo si no lo has hecho desde la tanda anterior
```

### Paso 2 · Ejecutar las migraciones, en orden

En Supabase → **SQL Editor**, **cada archivo completo de una vez**:

| Orden | Archivo | Qué hace | Seguro de repetir |
|---|---|---|---|
| 1 | `57_conversion_documentos.sql` | La vista de archivos heredados | Sí |
| 2 | `58_visitas_vinculadas.sql` | Visitas ligadas a presupuestos y proyectos | Sí |
| 3 | `59_material_preparado.sql` | «Preparado / cargado» | Sí |
| 4 | `60_colores_calendario.sql` | Colores del calendario compartidos | Sí |
| 5 | `61_bandeja_solicitudes.sql` | La bandeja de entrada | Sí |

Si todavía no has ejecutado las de la tanda anterior (`54`, `55`, `56`),
van **antes** que estas.

Las cinco son seguras de ejecutar más de una vez y **ninguna reescribe
datos existentes**: añaden columnas con valor por defecto, restricciones
que las filas actuales ya cumplen, índices, vistas y funciones.

> **Lo único que hay que mirar al ejecutarlas:** `59` y `61` redefinen
> cosas que ya existían (el disparador de material y la restricción de
> dueño de los documentos). Están generadas a partir de la definición
> viva, con la diferencia mínima, y lo digo dentro de cada archivo.

### Paso 3 · Comprobar que ha ido bien

```sql
-- Las cinco migraciones, de una mirada
select
  (select count(*) from information_schema.views
    where table_name in ('related_documents', 'linked_visits'))            as vistas_nuevas,
  (select count(*) from information_schema.columns
    where table_name = 'fichas' and column_name like 'linked%')            as fichas_linked,
  (select count(*) from information_schema.columns
    where table_name = 'materials' and column_name = 'prepared')           as material_prepared,
  (select count(*) from information_schema.columns
    where table_name = 'app_settings' and column_name = 'calendar_colors') as colores,
  (select count(*) from information_schema.tables
    where table_name = 'mail_requests')                                    as bandeja;
-- Esperado: 2 | 2 | 1 | 1 | 1
```

### Paso 4 · Publicar

La aplicación funciona entera con esto. **La bandeja de solicitudes
estará vacía** hasta que se configure el correo: eso va aparte, en
`docs/CORREO-PETICIONES.md`, y no bloquea nada de lo demás.

---

## 2. Resultados de las pruebas

Comandos ejecutados y lo que han dado. Todo contra un **PostgreSQL 16 de
verdad** y un **navegador de verdad** (Chromium), no simulaciones.

| Comando | Resultado |
|---|---|
| `npm run typecheck` | **Sin errores** |
| `npm test` (unitarias) | **155 de 155**, en 9 archivos |
| `npm run build` | **Compila** |
| `npm run test:sql` | **1749 de 1749** contra PostgreSQL 16 |
| Las 24 baterías de navegador | **1444 de 1444**, en 23 archivos |

Las cifras de arriba son de **una sola pasada completa**, no sumadas de
ejecuciones distintas. El desglose del navegador:

| Batería | | Batería | |
|---|---|---|---|
| `smoke` | 24/24 | `bloque3` | 37/37 |
| `navegacion` | 48/48 | `bloque4` | 70/70 |
| `fase2` | 53/53 | `bloque5` | 79/79 |
| `fase3` | 65/65 | `qa-final` | 122/122 |
| `fase4` | 60/60 | `correcciones` | 91/91 |
| `fase5` | 76/76 | `publicacion` | 10/10 |
| `fase6` | 140/140 | `avisos` | 45/45 |
| `fase7` | 92/92 | `compartidos` | 37/37 |
| `bloque1` | 45/45 | `mejoras` | 66/66 |
| `bloque2` | 40/40 | `mejoras2` | 52/52 |
| | | `mejoras3` | 46/46 |
| | | **`mejoras4`** | **104/104** ← mejoras 1 a 5 |
| | | **`mejoras5`** | **42/42** ← mejora 6 |

Y las comprobaciones nuevas de base de datos, por área:

| Área | | Área | |
|---|---|---|---|
| Conversión de presupuestos | 29 | Colores del calendario | 27 |
| Visitas vinculadas | 40 | Bandeja de solicitudes | 70 |
| Material preparado | 31 | | |

**Las 1749 comprobaciones de SQL se ejecutan contra un PostgreSQL 16 de
verdad**, instalando los 60 archivos del esquema desde cero en una base
de datos que se crea y se borra en cada pasada, y con los roles reales de
Supabase (`anon`, `authenticated`, `service_role`): los permisos no se
simulan, se comprueban.

### Y una cosa más: se ha comprobado que las pruebas sirven

Una prueba que pasa no demuestra nada si también pasaría estando el
código roto. Así que **se han roto las reglas nuevas a propósito, una por
una, para ver si alguna prueba se enteraba**. Se llama prueba de
mutación, y es lo que distingue una batería que vigila de una que
acompaña.

**Dieciséis mutaciones. Las dieciséis cazadas.** Ocho en la base de datos
—cada una se ejecutó contra la batería de SQL completa— y ocho en el
código, cada una contra sus pruebas.

En la base de datos:

| Lo que se rompió a propósito | | Quién se enteró |
|---|---|---|
| Se quita la restricción que impide preparar lo que no ha llegado | **cazada** | «El que está de camino NO se puede marcar» |
| Recibir el mismo correo dos veces crea dos solicitudes | **cazada** | la clave única de `provider_message_id` |
| La tabla de la bandeja se queda concedida a `anon` | **cazada** | «Sin sesión no se ve la bandeja» |
| Un archivo puede ser de una solicitud **y** de un proyecto | **cazada** | `documents_one_owner`, en las pruebas de la fase 3 |
| El presupuesto deja de ver los archivos del correo | **cazada** | «El presupuesto ve los archivos que mandó el cliente» |
| Se admite cualquier color en la configuración del calendario | **cazada** | «Un color que no es un color se rechaza» |
| Una visita se puede vincular a otra visita | **cazada** | «Una visita no se vincula a otra visita» |
| La vista de archivos heredados pasa a `security_barrier` (deja de respetar los permisos de quien pregunta) | **cazada** | «Un trabajador asignado al proyecto no ve…» |

Y en el código:

| Lo que se rompió a propósito | | Quién se enteró |
|---|---|---|
| Los filtros del calendario vuelven a ser excluyentes | **cazada** | «se puede encender material SIN apagar fabricación ni montaje» |
| El texto de la pastilla, siempre blanco | **cazada** | «y texto oscuro sobre un fondo claro» |
| La paleta del código se separa de los *tokens* | **cazada** | la prueba que lee `tokens.css` y compara variable por variable |
| El remitente de un reenvío se da por bueno sin comprobarlo | **cazada** | «si parece reenviado y no hay remitente dentro, lo deja pendiente de revisión» |
| El nombre del adjunto se guarda tal como llega | **cazada** | «quita rutas: un adjunto no elige dónde se guarda» |
| Se admite cualquier adjunto, sea lo que sea | **cazada** | «rechaza un ejecutable» |
| La firma del proveedor se compara con `===` | **cazada** | «acepta la firma en mayúsculas o con espacios, que es como a veces llega» |
| `proyecto:../../admin` se acepta como destino | **cazada** | «descarta identificadores con caracteres raros» |

Ninguna mutación sobrevivió: no hay en este paquete ninguna regla nueva
que se pueda romper sin que una prueba lo diga.

Después de cada mutación el archivo se restauró y **se verificó con
`sha256` que había quedado byte a byte como estaba** —la comprobación va
dentro del guion, de modo que si una restauración fallara la tanda se
detendría—. Al terminar las dieciséis se compararon además los ocho
archivos tocados contra las copias del ZIP, una a una, con `cmp`: los
ocho idénticos.

### Lo que encontraron las pruebas y se corrigió

Cinco fallos, todos cazados por una prueba y no por una revisión a ojo:

1. **El disparador se tragaba un intento prohibido.** La primera versión
   de «Preparado / cargado» limpiaba la marca siempre que el material no
   estuviera disponible, así que marcar algo que está de camino se
   «arreglaba» en silencio y quien llamara a la API recibía un
   «correcto». Lo cazó la prueba que esperaba el error `23514`. Ahora se
   distingue por el estado anterior: si estaba preparado, se limpia (es
   una corrección legítima); si no, la restricción lo rechaza.

2. **Un índice parcial rompía una regla de la casa.** Las columnas nuevas
   de `fichas` llevaban índices con `where ... is not null`, y la
   aplicación exige que toda clave foránea tenga un índice **no**
   parcial —tiene razón: es el que usa PostgreSQL para resolver el
   `on delete set null`—. Lo cazó la comprobación «Toda columna de clave
   foránea tiene su índice» del archivo de pruebas 70.

3. **La paleta en mayúsculas daba siete colores cambiados sin tocar
   nada.** El selector de color del navegador devuelve minúsculas, y la
   comparación con el color de serie se hacía sobre el texto. Lo cazó
   «De entrada están los colores de siempre».

4. **Una tabla nueva nace concedida a `anon`.** Supabase tiene *default
   privileges* que conceden todo sobre cada tabla nueva a la clave
   pública del navegador, y el revoke del archivo 03 solo alcanzó a las
   tablas que existían entonces. Lo cazó «Sin sesión no se ve la
   bandeja», que esperaba un `42501` y recibía cero filas. Ahora se
   revoca explícitamente.

5. **Dos fallos del propio banco de pruebas** (ver apartado 7): uno que
   se llevaba por delante los resultados de una batería entera, y una
   comprobación que solo fallaba los viernes.

### Sobre `40_importar_holded.sql`

**No lo he ejecutado contra tu Supabase ni contra nada que sea tuyo.**

Lo que sí hace la batería de pruebas local es instalarlo en una base de
datos **vacía y desechable** que se crea y se borra en cada ejecución,
porque el archivo solo **define** la tabla de paso y las funciones
`holded_simulate()` y `holded_import_run()` —no importa nada por sí
solo— y hay pruebas (`92_tests_holded.sql`) que comprueban esas
funciones con sus propios datos inventados. La importación de verdad no
se repite ni se toca.

---

## 3. Clasificación

### ✅ Terminado y probado

| Mejora | Qué incluye |
|---|---|
| **1 · Conversión sin pérdidas** | Los archivos del presupuesto se ven desde el proyecto, se abren y se descargan, sin copiarse; enlace al presupuesto de origen; segundo intento controlado; errores parciales sin dejar nada a medias. **Los proyectos convertidos hace meses lo ganan sin migrar datos.** |
| **2 · Visitas técnicas** | Botón «Asignar visita técnica» en presupuesto y proyecto; vincular una visita existente; lista con estado, fecha, responsable y nº de archivos; documentos accesibles con «Procede de la visita técnica del [fecha]»; navegación en los dos sentidos; quitar una asignación equivocada. |
| **3 · Material** | El comentario se ve y se corrige en el proyecto; «Cargado» con la regla en la base de datos; contadores; persistencia; permisos. |
| **4 · Calendario** | Pastilla entera del color de su categoría con el texto calculado para que se lea; colores configurables, **compartidos** y persistentes; filtros múltiples de verdad. |
| **5 · Móvil** | Historial al final en el móvil sin tocar el escritorio; calendario sin solapamientos **comprobado midiendo píxeles** y sin barra horizontal. |
| **6 · Bandeja (la aplicación)** | Tabla, permisos, funciones, bandeja, detalle, revisión manual, conversión a presupuesto/visita/aviso con el formulario de siempre, trazabilidad y archivos compartidos. |

### 🟡 Implementado, pendiente de configuración externa

| Qué | Qué falta | Dónde está explicado |
|---|---|---|
| **Recepción de correo** | Crear `peticiones@metalplafer.com` en IONOS, abrir la cuenta del proveedor, un registro MX en un subdominio, publicar la función con `--no-verify-jwt`, guardar dos secretos y crear la ruta en el proveedor. | `docs/CORREO-PETICIONES.md`, apartados 5 y 6 |
| **Las siete pruebas de recepción** | No se pueden hacer sin la dirección. La que decide es un correo real con una foto y un PDF. | `docs/CORREO-PETICIONES.md`, apartado 8 |

**La función de recepción está escrita y sus partes delicadas —la firma,
la detección de reenvíos, los nombres de archivo, los tamaños— tienen 30
pruebas unitarias.** Lo que no está probado es el camino completo con un
correo que haya viajado por internet.

### 🔴 Pendiente

| Qué | Por qué |
|---|---|
| **Que los operarios marquen «Cargado»** | `materials_update` es `is_admin()` y el proyecto del trabajador no lista el material. Hacen falta una función con permiso propio y una pantalla. **No he ampliado permisos por iniciativa propia**: te lo dejo propuesto en el apartado 9. |
| **Las capturas del calendario móvil** | El encargo decía que se adjuntarían y no venían. He trabajado sobre la causa encontrada en el código y la he probado midiendo; **no he mirado ninguna captura** y no digo lo contrario. |
| **Los precios del proveedor de correo** | No he podido abrir la página de tarifas de Mailgun desde donde trabajo. Hay que confirmarlo al registrarse. |

### 🟢 Opcional

- Heredar también **los comentarios** del presupuesto en el proyecto
  (hoy se llega a ellos con un clic, por el enlace «Procede de»).
- Ver y marcar el material desde la pantalla del trabajador.
- Que el aviso de la navegación lleve el **número de solicitudes sin
  revisar** (la consulta ya existe: `countPendingMailRequests`).
- Clasificación automática de las solicitudes con IA: **expresamente
  fuera del alcance** y no se ha hecho nada en esa dirección.

---

## 4. Qué se ha hecho, mejora por mejora

### Mejora 1 · Conversión de presupuesto a proyecto

**El diagnóstico primero**, porque cambia lo que había que arreglar. Se
revisó tabla por tabla lo que apunta a `fichas`, y la conversión **sí**
copiaba cliente, contacto, importe, dirección y descripción, y **sí**
tenía bloqueado el doble intento. Lo único que se quedaba atrás eran
**los archivos y los comentarios**.

Y no podían viajar: `documents_one_owner` obliga a que cada archivo tenga
un solo dueño, así que moverlos habría vaciado el presupuesto y copiarlos
habría duplicado cada vídeo en el almacén.

**Solución:** la vista `related_documents`, que los mira donde están y
dice de dónde viene cada uno. Es el patrón que ya usaba `work_documents`
para enseñar en una obra los archivos de sus proyectos.

Además, el proyecto ahora enseña **«Procede de PRES-AAAA-###»** con
enlace: el dato existía y no se veía en ninguna pantalla.

### Mejora 2 · Visitas técnicas vinculadas

Una visita técnica ya era una ficha de tipo `visita`, con su código, su
estado y sus archivos. Lo que no existía era la relación con el
presupuesto o el proyecto por el que se hacía. Se añade con dos columnas
en `fichas` y una función, `link_visit`.

Desde un presupuesto o un proyecto se puede **crear** una visita nueva ya
vinculada —con la ficha de visita de siempre— o **vincular una que ya
existe**, para cuando se apuntó antes de que hubiera presupuesto.

Y lo que se pidió expresamente: si la visita se vinculó al
**presupuesto** y después el presupuesto se convirtió en proyecto, desde
el proyecto se siguen viendo sus planos, marcados «Del presupuesto».

### Mejora 3 · Material

**El comentario no se guardaba mal.** `materials.notes` existe desde el
archivo 15 y el servicio lo escribe bien; se ve en la pantalla de
Material. El fallo estaba en que **el panel «Material» del detalle del
proyecto no lo pintaba**, que es justo donde lo buscabas. Ahora se ve y
se corrige ahí mismo, con el formulario de siempre.

**«Cargado»** es una columna nueva con la regla en una restricción de la
base de datos: solo material de almacén o pedido **y recibido**. La
pantalla apaga la casilla y dice por qué, pero la negativa de verdad está
en la base de datos. Y si alguien desmarca «recibido» de algo ya
preparado, la marca se limpia sola en lugar de rechazar la corrección.

### Mejora 4 · Calendario

La pastilla se pinta **entera** del color de su categoría, y **el color
del texto se calcula** a partir del fondo con la fórmula de contraste de
WCAG: con un amarillo hace falta texto oscuro y con un azul marino,
blanco. Si estuviera fijo, la mitad de las paletas posibles quedarían
ilegibles.

Los colores se eligen en **Configuración → Planificación**, se guardan en
`app_settings` y **los ve todo el mundo**, incluidos los trabajadores en
su calendario. Nada en el almacenamiento del navegador.

Y los filtros ya **no son excluyentes**: cada categoría se enciende y se
apaga sola, se pueden tener todas a la vez, y apagarlas todas se permite
—el calendario lo explica y ofrece volver con un botón— en lugar de que
la última pulsación no haga nada.

### Mejora 5 · Usabilidad móvil

El **historial** baja al final de la página en el móvil sin mover el
panel en el código y sin tocar el escritorio.

El **solapamiento del calendario** tenía una causa concreta: el alto de
la semana lo calculaba el código con el número 22 escrito a mano,
mientras en el móvil los carriles miden 16-17 px. Ahora el alto lo decide
el CSS a partir de las mismas medidas, y se comprueba **midiendo en
píxeles** que ninguna pastilla se cruza con otra ni se sale de su semana.

### Mejora 6 · Bandeja de entrada de solicitudes

Cada correo entra como **ficha provisional editable**. La pantalla lo dice
en todo momento: no es un presupuesto, ni una visita, ni un aviso.

- Los **adjuntos son archivos normales**, con una columna de dueño más en
  `documents`: misma papelera, misma cuota, mismos permisos, y cuando la
  solicitud se convierte se ven desde el presupuesto **sin copiarse**.
- Un **reenvío** distingue quién lo mandó de quién lo reenvió; cuando no
  se puede saber, **lo pide en lugar de inventarlo**.
- Si un **adjunto falla**, el correo se queda, marcado «Con error» y
  diciendo qué pasó.
- El **mismo correo recibido dos veces no crea dos solicitudes.**
- La **conversión es manual**: se elige el destino y se usa el formulario
  de siempre. La ficha provisional no se borra nunca.

---

## 5. Archivos creados, modificados y eliminados

**Eliminados: ninguno.**

### Migraciones (nuevas, para ejecutar a mano)

```
supabase/sql/57_conversion_documentos.sql
supabase/sql/58_visitas_vinculadas.sql
supabase/sql/59_material_preparado.sql
supabase/sql/60_colores_calendario.sql
supabase/sql/61_bandeja_solicitudes.sql
```

### Servidor (nuevo)

```
supabase/functions/mail-inbound/index.ts      · recibe el correo del proveedor
supabase/functions/_shared/correo.ts          · firma, reenvíos, nombres, tamaños
```

### Frontend nuevo

```
src/lib/colores.ts                            · contraste y colores legibles
src/lib/vinculos.ts                           · a qué se vincula una visita o una ficha
src/services/mail.ts                          · la bandeja
src/components/shared/RelatedDocsPanel.tsx    · «Documentos de origen»
src/components/shared/VisitasPanel.tsx        · visitas técnicas vinculadas
src/pages/admin/InboxList.tsx                 · la bandeja
src/pages/admin/InboxDetail.tsx               · una solicitud
```

### Frontend modificado

```
src/App.tsx                     · rutas de la bandeja
src/auth/AuthProvider.tsx       · los colores del calendario llegan con la sesión
src/config/constants.ts         · paleta, filtros múltiples, estados de solicitud
src/config/navigation.ts        · «Solicitudes» en el menú
src/pages/admin/CalendarPage.tsx  · colores y filtros múltiples
src/pages/admin/FichaDetail.tsx   · visitas, documentos de origen, origen de una visita
src/pages/admin/FichaForm.tsx     · crear vinculada a una visita o a una solicitud
src/pages/admin/ProjectDetail.tsx · origen, visitas, documentos, material, historial móvil
src/pages/admin/SettingsPage.tsx  · sección de colores del calendario
src/components/shared/CalendarWeek.tsx · alto por CSS y color de la pastilla
src/components/shared/HistoryPanel.tsx · marca para bajarlo en el móvil
src/services/documents.ts       · archivos heredados y dueño «solicitud»
src/services/fichas.ts          · vincular visitas
src/services/materials.ts       · «preparado» y su regla
src/services/settings.ts        · guardar los colores
src/types/db.ts                 · los tipos de todo lo anterior
src/styles/base.css             · historial al final en el móvil
src/styles/components.css       · pastilla coloreada, calendario móvil, colores, correo
```

### Pruebas nuevas

```
tests/sql/99_tests_conversion.sql     · 29 comprobaciones
tests/sql/99_tests_visitas.sql        · 40
tests/sql/99_tests_preparado.sql      · 31
tests/sql/99_tests_colores.sql        · 27
tests/sql/99_tests_solicitudes.sql    · 70
tests/unit/vinculos.test.ts           · 8
tests/unit/colores.test.ts            · 14
tests/unit/correo.test.ts             · 30
tests/e2e/mejoras4.mjs                · 104 (mejoras 1 a 5)
tests/e2e/mejoras5.mjs                · 42  (mejora 6)
```

### Pruebas modificadas

```
tests/e2e/fake-supabase.mjs   · la bandeja, los colores, lo heredado, «preparado»
                                y DOS arreglos del propio banco de pruebas
tests/e2e/navegacion.mjs      · el menú tiene una sección más
tests/e2e/bloque3.mjs         · comprobación que fallaba los viernes
tests/e2e/fase5.mjs           · los filtros ya no son excluyentes
tests/e2e/mejoras3.mjs        · idem
tests/unit/calendario.test.ts · las pruebas de la regla antigua, sustituidas
tests/sql/00_mock_supabase.sql
package.json                  · dos baterías nuevas en «test:all»
```

### Documentación

```
docs/CORREO-PETICIONES.md     · NUEVO · el proveedor de correo, paso a paso
docs/DECISIONES.md            · veinte decisiones de esta tanda
README.md                     · la guía nueva, en el índice y en el árbol
ENTREGA-MEJORAS-5.md          · este documento
```

---

## 6. Decisiones técnicas y por qué

Las veinte están razonadas en `docs/DECISIONES.md`. Las que más conviene
que conozcas:

1. **Los archivos heredados son una vista, no copias.** Moverlos vaciaría
   el presupuesto; copiarlos duplicaría cada vídeo en el almacén.

2. **Lo heredado es de solo lectura donde se ve.** Se abre y se descarga,
   no se borra: el archivo es de la visita o del presupuesto.

3. **No he ampliado ningún permiso.** La vista de archivos heredados es
   `security_invoker`: se ejecuta con los permisos de quien pregunta y no
   concede nada. Como `projects_select` es `is_admin()`, a un trabajador
   le devuelve cero filas siempre.

4. **Una visita se vincula con dos columnas**, siguiendo el patrón de
   `documents`, y no con una tabla de enlace: una visita se hace por una
   cosa.

5. **Crear y vincular son dos pasos.** Meter el alta de fichas dentro de
   una función de base de datos obligaría a reescribirla ahí, que es lo
   que se pidió no hacer. Si el segundo paso falla, se dice y la ficha no
   se pierde.

6. **El comentario del material no necesitaba columna nueva.** Lo decía
   el encargo y era verdad.

7. **La restricción y el disparador se reparten el trabajo** en
   «Cargado»: la restricción impide el estado imposible, el disparador
   deshace el que se queda a medias.

8. **El color del texto se calcula**, porque el fondo lo elige una
   persona.

9. **Los colores viven en `app_settings`**, que es donde vive lo
   compartido, y llegan al navegador con `client_config`, que ya se pide
   una vez al entrar. Nada en `localStorage`.

10. **Apagar todas las categorías se permite**, y se explica.

11. **El alto de la semana del calendario lo decide el CSS**, no el
    código: era la causa del solapamiento en el móvil.

12. **El historial baja con `display: contents`**, sin tocar el
    escritorio.

13. **Una solicitud tiene un destino**, porque el proceso real es una
    cadena y la trazabilidad llega al final sin muchos a muchos.

14. **Los adjuntos del correo son `documents`**, no un segundo sistema de
    archivos.

15. **Primero el correo, después los adjuntos.** Si un adjunto falla, la
    petición del cliente no se pierde.

16. **Las funciones de recepción son solo para el servidor**
    (`service_role`), como las del token de Google Drive. Si estuvieran
    abiertas a `authenticated`, cualquiera con sesión podría fabricar
    correos que parecieran de un cliente.

17. **El proveedor de correo recomendado manda los adjuntos por enlace**,
    no dentro del aviso: Supabase no documenta cuánto puede pesar una
    petición a una función, y el diseño que mete las fotos dentro es el
    que un día falla con el correo de un cliente.

18. **El cuerpo del correo se enseña como texto, no como HTML.** Pintar
    el HTML que manda alguien de fuera dentro de la aplicación es dejarle
    meter su código en la pantalla. El original se conserva.

19. **Los registros de la función no llevan datos de nadie**: solo el
    código de la solicitud y qué ha fallado.

20. **Sugerir el cliente no es clasificar.** Si el remitente coincide con
    un cliente, se apunta como sugerencia y la solicitud se queda
    pendiente de revisión manual.

---

## 7. Limitaciones y lo que no he podido verificar

### No tengo acceso a nada tuyo

- **No he ejecutado nada contra tu Supabase.** Todo el SQL está probado
  contra un PostgreSQL 16 local que se crea y se borra en cada
  ejecución.
- **No he hecho commit, push, publicación ni despliegue.** `HEAD` sigue
  en `73e6be0` y no he creado ninguna rama.
- **No he tocado `40_importar_holded.sql`** ni la importación de Holded.

### No me enviaste código nuevo con este encargo

El encargo decía «no presupongas que el código es igual al de una versión
anterior», y tiene razón, pero **con este encargo no venía ninguna copia
del proyecto**: solo el documento de instrucciones. He trabajado sobre tu
`73e6be0` más mi entrega N1–N3, que es lo último que tengo.

**Si tu repositorio tiene algo que yo no haya visto, hay que mirar los
archivos del apartado 5 antes de sobrescribirlos.** Los que más riesgo
tienen son `src/config/constants.ts`, `src/types/db.ts` y
`src/pages/admin/ProjectDetail.tsx`, que son los que han cambiado más.

### No tengo las capturas del calendario móvil

El encargo decía que se adjuntarían capturas de la visualización actual y
una referencia de Google Calendar. **No venían.** He trabajado sobre la
causa que encontré en el código y la he comprobado midiendo píxeles a
390 px de ancho. **No he mirado ninguna imagen y no digo que lo haya
hecho.**

### Del proveedor de correo

- **Los precios**: no he podido abrir la página de tarifas de Mailgun.
- **Si IONOS admite reenviar a una dirección externa**: su documentación
  describe el producto «Reenvío de correo» con un campo de destino y no
  dice que tenga que ser suyo, pero no lo he comprobado con una cuenta.
- **El tamaño máximo de una petición a una función de Supabase**: no está
  documentado. Por eso el diseño no manda los adjuntos dentro del aviso.
- **Nada de la recepción real**: no hay dirección, no hay cuenta y no ha
  llegado ningún correo.

### Dos fallos del propio banco de pruebas

Los encontré ejecutando la regresión y los he corregido, porque estaban
tapando resultados:

1. **El servidor de archivos de las pruebas mataba el proceso.**
   Escribía la cabecera `200` y después leía el archivo; si la lectura
   fallaba o el navegador se cerraba a mitad, el `catch` intentaba
   responder un 404 sobre una respuesta ya empezada y eso tumba el
   proceso. **Pasaba al final de varias baterías: las comprobaciones
   salían bien y el total no se imprimía.** Ahora lee antes de escribir.

2. **Una comprobación que solo fallaba los viernes.** `bloque3.mjs`
   exigía que un tramo de dos días ocupara «2 columnas», pero los días se
   planifican en LABORABLES y se pintan en días de CALENDARIO: empezando
   un viernes, esos dos días laborables son viernes y lunes y la barra
   ocupa tres columnas. Ahora el número se calcula de las fechas del
   proyecto.

**Ninguno de los dos lo introdujo esta entrega**, y lo digo porque el
encargo pedía distinguir los fallos preexistentes.

---

## 8. Cómo comprobar cada mejora a mano

### Mejora 1 · Conversión sin pérdidas

1. Coge un presupuesto, súbele **dos fotos y un PDF** y escribe un
   comentario.
2. Pásalo a «Presupuesto aceptado» y pulsa **Convertir en proyecto**.
3. En el proyecto: arriba, **«Procede de PRES-…»** con enlace; y el panel
   **«Documentos de origen»** con los tres archivos, diciendo que
   proceden del presupuesto. **Ábrelos y descárgalos.**
4. Vuelve al presupuesto: sus archivos y su comentario siguen ahí.
5. En Supabase: `select count(*) from documents where project_id = '<id>'`
   → **0**. No se ha copiado nada.
6. **El regalo:** entra en un proyecto convertido hace meses cuyo
   presupuesto tuviera archivos. Ahora los ve.

### Mejora 2 · Visitas técnicas

1. En un presupuesto, **«Asignar visita técnica»**. Se abre la ficha de
   visita de siempre, con la dirección puesta y diciendo a qué se
   vinculará.
2. Guárdala: vuelve al presupuesto, con la visita listada con su estado y
   su fecha.
3. Súbele un plano **a la visita**. En el presupuesto aparece en
   «Documentos de origen» con **«Procede de la visita técnica del
   [fecha]»**.
4. Convierte el presupuesto en proyecto: la visita sale marcada **«Del
   presupuesto»** y su plano se sigue viendo.
5. Entra en la visita: arriba, **«Visita técnica de PRES-…»** con enlace.

### Mejora 3 · Material

1. En **Material**, anota material **de almacén** en un proyecto con un
   comentario («Estantería 3, pasillo B»).
2. Entra en el proyecto: **el comentario se ve**, debajo del material.
3. Pulsa el lápiz, cámbialo, guarda: se ve el cambio sin salir.
4. Marca **«Cargado»** en el de almacén: se marca.
5. Mira un material **pedido y sin recibir**: la casilla está **apagada**
   y al pasar por encima dice por qué.
6. Marca «recibido» en ese: la casilla se enciende. Márcala, y después
   **desmarca «recibido»**: la marca de cargado se quita sola.
7. Recarga la página: todo sigue como lo dejaste.

### Mejora 4 · Calendario

1. Abre el calendario: **Fabricación y Montaje** encendidos, pastillas
   **enteras de color**.
2. Pulsa **Material**: se enciende **sin apagar** las otras dos. Enciende
   más. Apaga una: las demás no se mueven.
3. Apágalas todas: el calendario lo explica y ofrece volver.
4. **Configuración → Planificación → Colores del calendario**: pon
   Fabricación en amarillo. Mira la muestra: **el texto se pone oscuro**.
   Guarda.
5. Vuelve al calendario: las pastillas de fabricación son amarillas con
   texto oscuro.
6. **Entra con otro usuario** (o desde otro navegador): **los mismos
   colores**. No es una preferencia local.

### Mejora 5 · Móvil

1. En el móvil, abre un proyecto: **el historial está al final**, después
   de material y cobros.
2. En escritorio, el mismo proyecto: el historial sigue en su columna.
3. En el móvil, el calendario con **todas las categorías encendidas**:
   nada montado encima de nada, y **no se puede desplazar de lado**.
4. Toca un día: se abre la vista de día, con los títulos legibles.

### Mejora 6 · Bandeja

Hasta que el correo esté configurado, la bandeja estará vacía. Lo que sí
se puede comprobar ya:

1. **Solicitudes** sale en el menú y la pantalla carga.
2. Entra como trabajador y escribe la dirección a mano: **no entra**.

Y cuando el correo funcione, las siete pruebas del apartado 8 de
`docs/CORREO-PETICIONES.md`.

---

## 9. Lo que queda para más adelante

### Que los operarios marquen «Cargado» (si lo quieres)

Hoy es de administración, por las razones del apartado 3. Si lo quieres
para los operarios, hacen falta **dos cosas y una decisión tuya**:

1. Una función con su propio permiso —no abrir `materials` a los
   trabajadores, que les dejaría cambiar proveedor, fechas y recepción—:

   ```sql
   create or replace function public.set_material_prepared(p_material uuid, p_prepared boolean)
   returns public.materials language plpgsql security definer set search_path = public as $$
   declare m public.materials;
   begin
     select * into m from public.materials where id = p_material;
     if not found then
       raise exception 'No se encuentra el material' using errcode = 'P0002';
     end if;
     -- Administración, o un trabajador asignado a ESE proyecto.
     if not (public.is_admin()
             or (m.project_id is not null and public.worker_can_see_project(m.project_id))) then
       raise exception 'No tienes permisos para realizar esta acción' using errcode = '42501';
     end if;
     update public.materials set prepared = p_prepared where id = p_material returning * into m;
     return m;
   end $$;
   ```

2. Una lista de material en la pantalla del proyecto del trabajador, que
   hoy no existe.

**No lo he hecho** porque amplía permisos y añade una pantalla que nadie
pidió. Si lo quieres, dilo y lo hago con sus pruebas.

### El número de solicitudes sin revisar en el menú

La consulta ya existe (`countPendingMailRequests`). Falta decidir dónde
se pinta: al lado de «Solicitudes» en el menú, o en el panel de inicio.

### Lo que el encargo dejó fuera a propósito

- **Clasificación automática con IA.** No se ha hecho nada.
- **Inventario y descuento de existencias.** «Cargado» no descuenta nada
  y no se ha creado ninguna tabla de inventario.

---

## Confirmaciones

- **No he hecho commit, push, publicación ni despliegue.** `HEAD` sigue
  en `73e6be0`, sin commits nuevos y sin ramas nuevas.
- **No he ejecutado ninguna migración contra tu Supabase**, ni ninguna
  consulta de escritura contra datos reales.
- **No he ejecutado `40_importar_holded.sql`** contra nada que sea tuyo.
- **No he desactivado ni relajado ninguna prueba.** Las de la regla
  antigua de los filtros se **sustituyeron** por las de la regla nueva, y
  está dicho dónde.
- **No hay secretos ni credenciales** en el código, en el ZIP ni en
  ninguna variable `VITE_*`.
- **No afirmo que la recepción de correo funcione.** No funciona todavía:
  falta la configuración del apartado 3.
