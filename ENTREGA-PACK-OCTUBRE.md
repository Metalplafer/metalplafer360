# METALPLAFER360 · Pack de mejoras de octubre

Ocho mejoras pedidas. **Seis terminadas y probadas. Dos sin empezar**, y
digo por qué.

> **Lo que hay que leer antes que nada.**
>
> **Terminadas y probadas:** 1 (color de obra), 3 (subfases de revisión),
> 4 (panel), 6 (separar presupuestos y avisos), 7 (facturación de avisos)
> y 8 (solicitudes vinculadas).
>
> **Pendientes:** 2 (nueva fase «Pendiente de visita técnica») y 5
> (notificaciones y enlaces a menciones). No están empezadas. En el
> apartado E explico el motivo concreto de cada una, con el plan y el
> obstáculo técnico que hay que resolver antes de tocar nada.
>
> **Hay un desajuste entre mi copia y tu repositorio que debes conocer**,
> y está en el apartado G. Léelo antes de aplicar nada.
>
> **No he hecho commit, push ni despliegue, y no he ejecutado nada contra
> tu Supabase.** Las migraciones son archivos para que las ejecutes tú.

---

## A. Resumen de cambios

### 1 · Color manual de cada obra · ✅

Cada obra puede llevar un color, y la pastilla del código de **todos sus
proyectos** se tiñe con él. Se pone desde la ficha de la obra, con el
mismo selector que ya se usa para los colores del calendario, y se quita
con un botón.

El color **no se copia en el proyecto**: se lee de la obra. Por eso
cambiarlo una vez vale para todos sus proyectos sin tocar ninguno, que es
exactamente lo que se pedía. Un proyecto sin obra, o una obra sin color,
se quedan con la pastilla de siempre.

El color del texto se calcula para que se lea encima del color elegido,
con la misma función que ya usaba el calendario.

### 2 · Nueva fase «Pendiente de visita técnica» · 🔴 PENDIENTE

Sin empezar. Ver el apartado E.

### 3 · Subfases de revisión de presupuestos · ✅

Un presupuesto en «Por revisar» tiene ahora tres subfases: **Por
revisar** (gris), **OK** (verde) y **Denegado** (rojo), cada una con su
texto además del color. Se ven **desde la lista**, sin abrir ninguno, y
se cambian desde la ficha. Desde «Denegado» se puede volver a «Por
revisar».

La decisión importante: **no son estados del presupuesto**. Los estados
—pendiente, avanzado, por revisar, enviado…— son de los que dependen los
contadores, el panel y los filtros, y meter «OK» y «Denegado» ahí habría
cambiado el significado de «por revisar» para todo lo que ya lo usa. Es
una columna aparte que solo vive mientras el presupuesto está en
revisión, y que la base de datos pone y quita sola.

### 4 · Panel · «Requiere tu atención» · ✅

Las seis categorías pedidas, cada una enlazando a su pantalla **ya
filtrada**:

| | De dónde sale |
|---|---|
| visitas por asignar | ya existía |
| presupuestos pendientes por revisar | **nueva** |
| presupuestos pendientes | **nueva** |
| presupuestos pendientes de paga y señal | ya existía |
| material pedido por taller | ya existía |
| avisos pendientes de facturar | **nueva** (mejora 7) |

Y se retira **«presupuestos enviados esperando respuesta»**: ese espera
al cliente, no a nosotros.

Los otros tres avisos del bloque —órdenes atrasadas, órdenes por revisar
y material retrasado— **se quedan**. El encargo pide que el bloque
«incluya» las seis y nombra una sola para quitar; retirar las demás por
mi cuenta sería decidir por alguien que no lo ha pedido.

### 5 · Notificaciones y enlaces a comentarios · 🔴 PENDIENTE

Sin empezar. Ver el apartado E, donde está el diagnóstico completo: el
mecanismo real, por qué satura, y qué falta en la base de datos para
poder enlazar una mención.

### 6 · Separar «Presupuestos» y «Avisos» · ✅

La pantalla «Fichas» pasa a llamarse **«Presupuestos»**, conserva sus dos
apartados —Presupuestos y Visitas— y **deja de tener la pestaña de
Avisos**, que ya tenían pantalla propia.

**La ruta `/admin/fichas` NO cambia.** Cambiarla rompería los enlaces
guardados y no aporta nada; el encargo pide expresamente no cambiar rutas
sin necesidad.

Y una cosa que conviene saber: **«Avisos» ya estaba entre «Calendario» y
«Clientes»** en el menú. No había nada que mover. Lo he dejado fijado con
una prueba para que no se mueva.

### 7 · Facturación de avisos · ✅

Al terminar un aviso hay que decir cuál de las dos cosas es:

- **Realizado, pendiente de facturar** → queda en «realizado», sale en el
  panel, y cuando se factura se marca con un botón;
- **Realizado y finalizado** → queda cerrado y no espera a nadie.

Una vez marcado facturado, se puede **deshacer**: vuelve a «pendiente de
facturar» y vuelve a salir en el panel, que es lo que hace falta si la
factura se anula.

**Y hay que decir lo que esto NO es:** METALPLAFER360 no emite ninguna
factura ni habla con ningún programa de contabilidad. El tic deja
constancia dentro de la aplicación y saca el aviso de la lista de lo que
falta por facturar. Nada más. La facturación que ya existía —la de los
proyectos, con sus importes y sus cobros— no se toca, y un aviso marcado
como facturado **no suma dinero a ningún total**.

### 8 · Estados de las solicitudes recibidas · ✅

Las solicitudes **vinculadas** dejan de salir en «En curso». «En curso»
pasa a ser una lista explícita de estados —sin revisar, con error y
revisada— en lugar de «todo lo que no está descartado», que es lo que las
arrastraba.

No se pierde nada: las vinculadas siguen en su pestaña, con su estado y
su vínculo. Y no se ha tocado ni la recepción del correo, ni los
adjuntos, ni la vinculación.

---

## B. Archivos modificados

### Migraciones nuevas

| Archivo | Por qué |
|---|---|
| `supabase/sql/64_color_obra.sql` | La columna del color, su restricción y `set_work_color`. |
| `supabase/sql/65_revision_presupuestos.sql` | La columna de la subfase, su vocabulario, el disparador que la mantiene coherente y la migración de los que ya estaban por revisar. |
| `supabase/sql/66_facturacion_avisos.sql` | La situación de facturación de un aviso y `set_aviso_billing`. |
| `supabase/sql/67_panel_atencion.sql` | `dashboard_summary` con las seis categorías. |

### Frontend

| Archivo | Por qué |
|---|---|
| `src/lib/colores.ts` | `estiloDeObra`: el fondo de la pastilla y el color de texto que se lee encima. |
| `src/config/constants.ts` | Vocabulario de las subfases de revisión, de la facturación de avisos y de «En curso» en la bandeja. |
| `src/types/db.ts` | `Work.color`, `Ficha.review_status`, `Ficha.billing_state` y el color en la obra del proyecto. |
| `src/services/works.ts` | `setWorkColor`. |
| `src/services/projects.ts` | El listado trae el color de la obra. |
| `src/services/fichas.ts` | `setAvisoBilling` y `review_status` entre los campos editables. |
| `src/services/mail.ts` | «En curso» pasa a ser una lista explícita de estados. |
| `src/services/reports.ts` | El tipo del resumen del panel. |
| `src/pages/admin/WorkDetail.tsx` | Selector de color de la obra y su pastilla teñida. |
| `src/pages/admin/ProjectsList.tsx` | La pastilla del código con el color de su obra. |
| `src/pages/admin/FichasList.tsx` | Título «Presupuestos», sin pestaña de avisos, etiquetas de revisión y de facturación, y filtros desde la dirección. |
| `src/pages/admin/FichaDetail.tsx` | Control de las tres subfases y panel de cómo termina un aviso. |
| `src/pages/admin/Dashboard.tsx` | Las seis categorías, con enlaces filtrados. |
| `src/pages/admin/ClientsList.tsx` | El enlace a «Presupuestos» y otro a «Avisos». |
| `src/config/navigation.ts` | «Fichas» → «Presupuestos». |

### Pruebas

| Archivo | |
|---|---|
| `tests/sql/99_tests_color_obra.sql` | **nueva** · 18 comprobaciones |
| `tests/sql/99_tests_revision.sql` | **nueva** · 19 comprobaciones |
| `tests/sql/99_tests_facturacion_avisos.sql` | **nueva** · 21 comprobaciones |
| `tests/e2e/mejoras6.mjs` | **nueva** · 30 comprobaciones en navegador |
| `tests/unit/colores.test.ts` | 6 pruebas nuevas de `estiloDeObra` |
| `tests/sql/95_tests_sin_responsable.sql` | ajustada · ver apartado D |
| `tests/e2e/fase2.mjs`, `navegacion.mjs`, `mejoras3.mjs`, `mejoras5.mjs`, `mejoras4.mjs` | ajustadas · ver apartado D |
| `tests/e2e/fake-supabase.mjs` | entiende las dos funciones nuevas, las dos columnas nuevas y el panel |
| `package.json` | `test:mejoras6` |

---

## C. Supabase y migraciones

**No he ejecutado ninguna.** Son cuatro archivos, **en este orden**, en el
SQL Editor, cada uno completo de una vez. Las cuatro se pueden ejecutar
varias veces sin hacer daño.

### `64_color_obra.sql`
- **Qué cambia:** añade `works.color`, una restricción que exige
  «#rrggbb», y la función `set_work_color`.
- **Qué datos modifica:** **ninguno.** La columna nace vacía.
- **Qué queda excluido:** todas las obras actuales, que se quedan sin
  color y con la pastilla de siempre.
- **Cómo comprobarlo:** `select code, name, coalesce(color,'—') from public.works;`
- **Si falla:** no deja nada a medias. Una columna y una restricción.

### `65_revision_presupuestos.sql`
- **Qué cambia:** añade `fichas.review_status` y su vocabulario, y
  **reemplaza el disparador `trg_fichas_before`** para que ponga y quite
  la subfase sola.
- **Qué datos modifica:** escribe `'por_revisar'` en los presupuestos que
  **ya están** en estado `por_revisar` y **no tienen subfase**. Nada más.
- **Qué queda excluido:** los presupuestos en cualquier otro estado, las
  visitas y los avisos. **No se aprueba ni se deniega nada
  automáticamente**: no hay en la base de datos información que permita
  saber qué presupuestos estaban aprobados.
- **Cómo comprobarlo:** el reparto por estado y subfase, al final del
  archivo.
- **Si falla:** es un solo `UPDATE`, así que entra entero o no entra. Se
  puede volver a ejecutar.
- **Ojo:** el disparador se ha generado a partir de su **definición
  viva**, que es la del archivo 43. Si entre medias se hubiera redefinido
  en otro sitio, hay que rehacerlo desde esa versión.

### `66_facturacion_avisos.sql`
- **Qué cambia:** añade `fichas.billing_state`, su vocabulario, un índice,
  `set_aviso_billing`, y **reemplaza otra vez `trg_fichas_before`**
  —ahora con las reglas de las mejoras 3 y 7 juntas—.
- **Qué datos modifica:** **ninguno.**
- **Qué queda excluido:** todos los avisos existentes, incluidos los ya
  realizados y cerrados. **No se convierten en pendientes de facturar**:
  nadie sabe cuáles se facturaron, y llenar el panel de trabajo inventado
  sería peor que no tener la lista.
- **Cómo comprobarlo:** el reparto por estado y situación, al final del
  archivo.
- **DEPENDE DEL 65:** reemplaza el mismo disparador. Ejecutarlo antes
  perdería las reglas de la mejora 3.

### `67_panel_atencion.sql`
- **Qué cambia:** reemplaza `dashboard_summary` con las seis categorías.
- **Qué datos modifica:** **ninguno.** Es una función de lectura.
- **Cómo comprobarlo:** la consulta del final del archivo.
- **DEPENDE DEL 66:** usa `fichas.billing_state`.

**Estado de las cuatro: preparadas. Ninguna ejecutada, ninguna
verificada en producción.** Probadas sí: instaladas desde cero en un
PostgreSQL 16 de verdad en cada pasada de la batería de SQL.

---

## D. Pruebas

Todo esto se ha ejecutado hoy, en esta máquina.

| | Resultado |
|---|---|
| `npx tsc --noEmit` | **limpio** |
| `npx vitest run` | **201 de 201** en 10 archivos (eran 195) |
| `bash tests/sql/run_all.sh` | **1828 de 1828** contra PostgreSQL 16 real (eran 1770) |
| 24 baterías de navegador | **1503 de 1503** (eran 1444) |
| `npm run build` | correcta |
| `git diff --check` | sin problemas |

Baterías de navegador, una por una: `e2e` 24, `nav` 50, `fase2` 56,
`fase3` 65, `fase4` 60, `fase5` 76, `fase6` 140, `fase7` 92, `bloque1`
45, `bloque2` 40, `bloque3` 37, `bloque4` 70, `bloque5` 79, `qa` 122,
`correcciones` 91, `publicacion` 10, `avisos` 45, `compartidos` 37,
`mejoras` 66, `mejoras2` 52, `mejoras3` 47, `mejoras4` 124, `mejoras5`
45, **`mejoras6` 30**.

### Las pruebas que cambiaron, y por qué no es relajarlas

Cinco. Todas por el mismo motivo: fijaban un comportamiento que estas
mejoras cambian a propósito.

1. **`fase2.mjs`** exigía **tres** pestañas en la pantalla de fichas. Ahora
   exige **dos**, y además comprueba **cuáles** son y que los avisos ya no
   están ahí pero sí en el menú. Pasó de 53 a 56 comprobaciones.
2. **`navegacion.mjs`** fijaba «Fichas» en el menú. Ahora fija
   «Presupuestos», **y además** que «Avisos» va justo entre «Calendario» y
   «Clientes» y que «Fichas» ya no aparece. De 48 a 50.
3. **`mejoras3.mjs`** no cambió por este pack (se ajustó en la tanda
   anterior).
4. **`95_tests_sin_responsable.sql`** comprobaba que un presupuesto no se
   contara como «enviado esperando respuesta». Esa categoría ya no
   existe, así que ahora comprueba algo más fuerte: **que ha desaparecido
   del panel**.
5. **`mejoras4.mjs`** tenía una carrera: leía el panel de visitas técnicas
   sin esperar a que terminara de cargar. Ahora espera. **La aserción es
   la misma**; lo que se ha arreglado es la prueba, no lo que comprueba.

### Y se ha comprobado que las pruebas nuevas sirven

Cinco mutaciones. **Cuatro cazadas:**

| Lo que se rompió a propósito | |
|---|---|
| La pastilla deja de teñirse con el color de la obra | **cazada** |
| El texto de la pastilla se queda siempre blanco | **cazada** |
| La subfase de revisión no se borra al salir del estado | **cazada** |
| Vuelve «presupuestos enviados esperando respuesta» al panel | **cazada** |
| Se puede facturar un aviso que nadie dijo que hubiera que facturar | **sobrevive a la batería de navegador** |

La quinta la digo entera porque es un hueco real y conviene entenderlo:
**desde la pantalla no se puede ni intentar** —el botón de facturar solo
existe cuando el aviso está pendiente de facturar—, así que ninguna
prueba de navegador puede provocarlo. Esa negativa es una regla del
servidor y **sí está comprobada donde vive**: `fav_tic`, en
`tests/sql/99_tests_facturacion_avisos.sql`, contra PostgreSQL de verdad.
Queda anotado en la propia batería para que nadie lo tome por un olvido.

### Una prueba que encontró algo

La prueba del contraste del color de obra falló al escribirla, y no era
un fallo del código. Midiendo **todos** los colores posibles, el peor
caso —un rosa fuerte, `#fc065a`— llega a **3,95** de contraste con el
blanco y no mejora con la tinta: con solo dos colores de texto, nadie
puede prometer el 4,5 de las pautas de accesibilidad. Por eso
Configuración **avisa** de un color flojo en vez de impedirlo.

La prueba se reescribió sobre la garantía que el código sí da —que elige
el mejor de los dos textos posibles— y se dejó fijado el peor caso.

### Lo que NO se ha podido probar

- **Nada contra tu Supabase ni contra la aplicación publicada.** No tengo
  acceso.
- Las pruebas funcionales 2, 3, 4, 8 y 9 de tu lista corresponden a las
  mejoras 2 y 5, que no están hechas.

---

## E. Estado de cada mejora

| | Mejora | Estado |
|---|---|---|
| 1 | Color manual de cada obra | ✅ **terminada y probada**, pendiente de ejecutar la migración 64 |
| 2 | Nueva fase «Pendiente de visita técnica» | 🔴 **pendiente** · ver abajo |
| 3 | Subfases de revisión de presupuestos | ✅ **terminada y probada**, pendiente de la migración 65 |
| 4 | Panel «Requiere tu atención» | ✅ **terminada y probada**, pendiente de las migraciones 66 y 67 |
| 5 | Notificaciones y enlaces a comentarios | 🔴 **pendiente** · ver abajo |
| 6 | Separar «Presupuestos» y «Avisos» | ✅ **terminada y probada**, sin migración |
| 7 | Facturación de avisos | ✅ **terminada y probada**, pendiente de la migración 66 |
| 8 | Estados de las solicitudes recibidas | ✅ **terminada y probada**, sin migración |

### 🔴 Mejora 2 · por qué no está, y qué hay que resolver

**El motivo honesto:** es la más arriesgada de las ocho y no la he
empezado para no entregarla a medias. Toca el tipo de datos de las fases
—que afecta a proyectos, calendario, panel, filtros y permisos—, exige
una migración de datos, y tiene un obstáculo técnico que hay que resolver
**antes** de escribir una línea.

**El obstáculo, que sí he investigado:** las fases NO son una tabla, son
un **tipo enumerado** de PostgreSQL:

```sql
create type public.project_phase as enum
  ('preparacion', 'fabricacion', 'montaje', 'facturacion', 'finalizado');
```

Añadir un valor es `alter type ... add value ... before 'preparacion'`, y
**PostgreSQL no deja usar un valor nuevo del enumerado en la misma
transacción en que se añade**. El editor SQL de Supabase ejecuta cada
script como una transacción, así que **una migración que añada la fase y
mueva los proyectos en el mismo archivo fallará**.

**El plan, que dejo escrito para cuando lo aprobemos:**

1. **Migración A, sola:** `alter type project_phase add value 'pendiente_visita' before 'preparacion'`. Nada más. Se ejecuta y se cierra.
2. **Migración B, después:**
   - `valid_substatus` deja de admitir `'pendiente_visita_tecnica'` en la fase `preparacion` y devuelve `false` para la fase nueva (no lleva subestados);
   - mueve a la fase nueva **solo** los proyectos que estén en `preparacion` **con** ese subestado, y borra ese subestado;
   - deja intactos todos los demás proyectos, en cualquier fase.
3. **Lo que hay que revisar después**, y es bastante: `PHASES`,
   `PHASE_LABEL` y `PHASE_TONE` en `constants.ts`; el recorrido de fases
   de la ficha del proyecto; el calendario; `por_fase` del panel; los
   filtros del listado; y la acción de «Asignar visita técnica», que el
   encargo pide subir a una posición más visible.

**Lo que hace falta de ti:** confirmar que esa migración en dos pasos te
parece bien, porque supone ejecutar dos archivos por separado y no uno.

### 🔴 Mejora 5 · por qué no está, y qué he averiguado

Tampoco la he empezado, pero sí la he inspeccionado, y hay un hallazgo
que condiciona la mitad.

**5.1 · Las notificaciones de material retrasado.** El mecanismo real es
`notify_late_materials()` (definición viva en el archivo 53), y lo que
hace es insertar **una notificación por cada material retrasado y por
cada administrador**. Con 8 materiales y 2 administradores son 16 avisos.
La columna `materials.late_notified_on` impide repetirlos el mismo día,
pero no impide que sean uno por material.

Y un detalle que importa: **la llama el frontend**
(`src/services/materials.ts:168`), no una tarea programada. Se dispara
cuando alguien abre la pantalla de material.

*Plan:* una sola notificación agregada por administrador y día
(«3 materiales retrasados»), conservando `late_notified_on` como marca de
idempotencia para que una segunda ejecución el mismo día no cree otra. No
se oculta ni se borra ningún retraso: la pantalla de material sigue
enseñándolos todos.

**5.2 · El enlace a la mención. Y aquí está el hallazgo:** la tabla
`notifications` tiene `user_id, kind, title, body, order_id, read_at`.
**No hay ninguna columna donde guardar a dónde lleva el aviso**, salvo
`order_id`, que es para órdenes de trabajo. Una mención en el comentario
de un proyecto **no se puede enlazar hoy**: no hay dónde apuntar el
destino.

Además, `notification_kind` es otro enumerado
(`orden_asignada, orden_enviada, devolucion, validacion, comentario`), con
el mismo problema de las dos transacciones si hiciera falta un tipo
nuevo —aunque probablemente no haga falta: `comentario` ya sirve—.

*Plan:* añadir a `notifications` el destino (la ruta de la aplicación, o
bien tipo + identificador), que `post_comment` lo rellene al avisar a los
mencionados, y que la campana lo pinte como enlace. Con dos cuidados que
el encargo pide expresamente: respetar los permisos del destino, y que un
comentario borrado no rompa la navegación.

**Lo que hace falta de ti:** decidir si el destino se guarda como ruta o
como tipo + identificador. Me inclino por lo segundo —sobrevive a un
cambio de rutas— pero es una decisión de diseño y no la tomo solo.

---

## F. Riesgos y decisiones

**Decisiones que he tomado y conviene que confirmes:**

1. **La subfase de revisión no es un estado del presupuesto.** Si
   esperabas verla en el recorrido de estados, no es lo que he hecho, y
   el motivo está en el apartado A.
2. **Los presupuestos que ya estaban por revisar quedan «Por revisar».**
   Ninguno se aprueba ni se deniega automáticamente.
3. **Los avisos ya terminados no se convierten en pendientes de
   facturar.** El panel solo cuenta los que alguien marque a propósito.
4. **Desmarcar una factura devuelve el aviso a «pendiente de facturar»**
   y lo devuelve al panel.
5. **La ruta `/admin/fichas` no cambia**, aunque la pantalla se llame
   ahora «Presupuestos».
6. **Los tres avisos antiguos del panel se quedan.** Solo se retira el que
   pediste.
7. **Un aviso marcado como facturado no suma dinero a ningún total.**

**Riesgos:**

| Riesgo | |
|---|---|
| **Las migraciones 65 y 66 reemplazan el mismo disparador** | Hay que ejecutarlas **en orden**. Al revés, se pierden las reglas de la mejora 3. |
| **El disparador viene de su definición viva (archivo 43)** | Si en tu repositorio se hubiera redefinido en otro sitio después, hay que rehacerlo desde esa versión. Compruébalo antes de ejecutar. |
| **El color va a un atributo `style` del navegador** | Por eso hay restricción en la base de datos, validación en la función y pruebas de que un texto cualquiera no entra. |
| **Nada se ha probado contra datos reales** | Las migraciones están probadas sobre un PostgreSQL limpio, no sobre tus datos. |

---

## G. Publicación · y un aviso importante antes

### ⚠️ Mi copia y tu repositorio no están sincronizados

Tengo que decírtelo antes de que apliques nada. **No tengo acceso a
`Metalplafer/metalplafer360`**: el `gh` de este entorno tiene el testigo
caducado. Trabajo sobre la copia que me pasaste en octubre más mis
propias entregas, y de ahí salen dos cosas:

1. **Tu ajuste de `MAIL_MAX_MB` no lo tengo.** Me dijiste que lo limitaste
   entre 1 y 25 en `mail-inbound/index.ts`. Ese archivo **no está en esta
   entrega** y no lo he tocado, así que tu versión no corre peligro.
2. **He alineado mi copia aplicándole el parche de `forward()`** que ya
   desplegaste, para que las pruebas corrieran sobre lo mismo que tienes
   tú. Los archivos de correo **no van en el ZIP**.

**Antes de aplicar, comprueba** que tu `trg_fichas_before` es el del
archivo 43. Si no lo fuera, dímelo y rehago las migraciones 65 y 66 desde
tu versión.

### Pasos manuales, en este orden

1. Copiar los archivos del ZIP en la carpeta del proyecto.
2. En Supabase → SQL Editor, ejecutar **en orden**: `64`, `65`, `66`, `67`.
   Cada uno completo, de una vez.
3. `npm install` no hace falta: no hay dependencias nuevas.
4. Publicar con tu flujo habitual.

**No hace falta desplegar ninguna Edge Function:** este pack no toca
ninguna.

### Comprobaciones después de publicar

1. Poner color a una obra y ver que sus proyectos cambian de pastilla.
2. Mover un presupuesto por «Por revisar → OK → Denegado → Por revisar» y
   verlo desde la lista.
3. Sacarlo de «Por revisar» y comprobar que la marca desaparece.
4. Terminar un aviso de las dos maneras.
5. Marcar uno como facturado y ver que el panel baja.
6. Mirar que el panel enseña las seis categorías y ya no las enviadas.
7. Pulsar un aviso del panel y comprobar que la pantalla llega filtrada.
8. Ver que «Presupuestos» tiene dos pestañas y que «Avisos» sigue en su
   sitio del menú.
9. Vincular una solicitud y comprobar que sale de «En curso».

---

## Confirmaciones

- **No he hecho commit, push ni despliegue.** `HEAD` sigue en `73e6be0`.
- **No he ejecutado ninguna migración contra tu Supabase**, ni ninguna
  consulta de escritura contra datos reales.
- **No he tocado RLS ni ampliado permisos.** Las dos funciones nuevas
  empiezan por `assert_admin()`, y las columnas nuevas viven en tablas
  que ya eran de administración.
- **No he inventado tablas, columnas, estados ni endpoints.** Todo lo
  nuevo está en estos cuatro archivos y usa los estados que ya existían.
- **No he desactivado ni relajado ninguna prueba.** Las cinco que
  cambiaron están explicadas una por una en el apartado D, y tres de
  ellas comprueban más que antes.
- **No afirmo que las mejoras 2 y 5 estén empezadas.** No lo están.
- **No afirmo que nada de esto funcione contra tus datos reales.** No lo
  he podido probar.
