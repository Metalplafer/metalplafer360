# METALPLAFER360 · Entrega de las ocho mejoras

**Nada de esto se ha ejecutado contra tu Supabase, ni se ha publicado, ni
se ha subido a GitHub.** No hay commits, ni push, ni despliegue. Lo
apruebas tú y lo aplicas siguiendo el apartado 6.

**No se ha modificado ni borrado ningún registro existente.** Las cinco
migraciones estructurales (42 a 46) solo crean tablas, vistas y
funciones, y amplían otras que ya existían: **ejecutarlas no cambia ni
una fila**.

De las cuatro de datos, **las tres primeras (47, 48 y 49) tampoco cambian
nada al ejecutarlas**: solo dejan preparadas unas funciones que hay que
llamar a mano, y eso queda a tu decisión. **La cuarta (50) sí cambia
algo** —borra tres funciones del servidor—, y por eso vive en otra
carpeta y la explico aparte.

---

## 0 · En qué orden van los documentos

Ya hay tres documentos de entrega en el repositorio, y el orden importa
porque cada uno aplica unos archivos SQL que cuentan con los anteriores:

| | Documento | Archivos SQL | Estado |
|---|---|---|---|
| 1.º | `APLICAR.md` | 34 a 37 | aplicado |
| 2.º | `ENTREGA-MEJORAS.md` | 38 a 41 | **pendiente** |
| 3.º | `ENTREGA-MEJORAS-2.md` · este | 42 a 50 | pendiente |

**Si todavía no has aplicado el 38 al 41, empieza por ahí.** Las
migraciones de este documento cuentan con ellas: por ejemplo, el archivo
43 parte del disparador de fichas que redefine el 38, y el 45 usa la
función de normalización de nombres que crea el 40.

---

## 1 · Estado de cada mejora

| | Mejora | Estado |
|---|---|---|
| M1 | Estado «Pendiente de paga y señal» | **Implementada** |
| M2 | Quitar el responsable de presupuestos y avisos | **Implementada** |
| M3 | Varios productos por proyecto | **Implementada** |
| M4 | Subestado «Lacado-Zincado» | **Implementada** |
| M5 | Filtrar proyectos por subestado | **Implementada** |
| M6 | Proveedores y materiales por proveedor | **Implementada** |
| M7 | Menciones con @ y notificaciones | **Implementada** |
| M8 | Retirar las funcionalidades de datos demo | **Implementada** en la aplicación. Las funciones del servidor se retiran con el archivo 50, **pendiente de tu aprobación** |

Ninguna quedó bloqueada. Hay **tres decisiones tuyas pendientes** en el
apartado 9, y ninguna impide usar lo entregado.

### Lo que NO he hecho

- **No he tocado ni un registro.** Ni estados, ni asignaciones, ni
  importes, ni fechas, ni horas, ni comentarios, ni históricos.
- **No he borrado las columnas `is_demo`.** Siguen en las 20 tablas donde
  estaban, con su valor. Son el único sitio donde queda constancia de qué
  se creó como ejemplo, y eso no se recupera después.
- **No he desactivado ni relajado ninguna política de permisos.** Las
  tablas nuevas nacen con RLS activado y con las mismas reglas que las
  que ya había.
- **No he puesto ninguna clave ni secreto** en el frontend ni en ningún
  archivo del repositorio.
- **No he ejecutado la importación de Holded** ni las migraciones 38 a 41
  de la entrega anterior. Siguen pendientes y van **antes** que estas.
- **No he sobrescrito ningún archivo SQL existente.** Los números 42 a 50
  estaban libres: el último del repositorio era el 41.

---

## 2 · Qué cambia en la pantalla, mejora por mejora

### M1 · «Pendiente de paga y señal»

Un presupuesto que el cliente ya ha aceptado pero cuya paga y señal
todavía no está cobrada tiene ahora su propio estado, entre «enviado» y
«aceptado».

Lo importante es lo que **no** se puede hacer desde ahí: **no se puede
convertir en proyecto**. Y no es que el botón esté escondido: la base de
datos lo rechaza con un mensaje que explica qué hacer («cuando la
cobréis, pasadlo a "Presupuesto aceptado"»). Así el trabajo no empieza
antes de que entre el dinero, aunque alguien se despiste.

### M2 · Presupuestos y avisos sin responsable

Un presupuesto y un aviso **ya no piden responsable administrativo**: el
selector ha desaparecido de su formulario y de su ficha. Nacen
directamente en «Pendiente», donde empieza su trabajo de verdad, en lugar
de en «Por asignar».

- Lo que mueve un **aviso** a «Asignado» es **repartirlo entre
  operarios**, que es lo que de verdad significa que está asignado.
- Las **visitas no se tocan**: las lleva administración, siguen naciendo
  «Por asignar» y siguen sin poder darse a un trabajador normal.
- El aviso del panel pasa a contar **solo las visitas** sin asignar. Si
  siguiera contando las tres clases, se quedaría encendido para siempre
  por presupuestos antiguos que ya nadie va a asignar.
- **Las fichas antiguas que están en «Por asignar» siguen funcionando**:
  se pueden editar, y si alguien les pone responsable avanzan como antes.
  No hay que tocarlas. Si las quieres mover, el archivo 49 lo hace.

### M3 · Varios productos en un proyecto

Un proyecto puede ser varias piezas: una barandilla de escalera **y** dos
rejas, cada cosa con sus medidas y su acabado. Antes todo eso se metía a
la fuerza en el mismo campo de texto.

- En el formulario hay bloques de producto, con «Añadir otro producto»,
  flechas para ordenarlos y papelera para quitarlos. **No se puede quitar
  el último.**
- **El primero es el que ve el trabajador en su móvil**, y la pantalla lo
  dice, porque reordenar cambia eso.
- Lo que sigue siendo del proyecto entero: el nombre, el presupuesto, las
  horas previstas, la ubicación y la dirección.
- **Los proyectos de hoy no cambian nada.** Un proyecto sin productos
  guardados enseña lo que ya tenía, marcado como heredado. Al editarlo se
  puede separar en piezas. Migrarlos es opcional (archivo 47).
- En el móvil, el trabajador ve **todas** las piezas, no solo la primera.
- **Un proyecto nuevo se sigue pudiendo crear sin rellenar productos**,
  como antes: a veces solo se sabe el nombre del trabajo.

### M4 · «Lacado-Zincado»

Un subestado más en la fase de Fabricación, entre «Falta material» y «Por
finalizar». Nada más, y nada menos.

### M5 · Filtrar proyectos por subestado

En el listado de proyectos hay un selector de subestado. Responde a la
pregunta de todos los días: **¿qué hay esperando material?** Antes había
que abrir los proyectos uno a uno.

- Si hay una fase elegida, ofrece solo los subestados de esa fase.
- «Falta material» existe en Fabricación **y** en Montaje: se ofrece una
  sola vez, diciendo que es de las dos, y el filtro encuentra las dos.
- Al cambiar de fase, un subestado que la fase nueva no tiene **se
  suelta**. Si se quedara puesto, la lista saldría recortada por un
  filtro invisible y nadie sabría por qué.
- Cuando no hay ninguno, lo dice con el nombre del subestado: «Ningún
  proyecto está en "Lacado-Zincado"». Que no haya ninguno también es una
  respuesta.

### M6 · Proveedores

Hay una sección nueva, **Proveedores**, entre «Material pendiente» y
«Calendario». Antes el proveedor de un material era texto libre, así que
el mismo proveedor aparecía escrito de cuatro maneras y no había dónde
guardar su teléfono.

- **No se pueden dar de alta dos veces.** «Aceros Vallès, S.L.» y «ACEROS
  VALLES SL» son el mismo: al intentarlo, la aplicación usa el que ya hay
  y lo dice, en lugar de fingir que ha creado uno nuevo. Lo garantiza un
  índice único en la base de datos, no la pantalla.
- **No se borran: se dan de baja.** Un proveedor desaparecido dejaría
  materiales apuntando al vacío y el histórico de compras sin
  explicación. De baja deja de proponerse, y lo que ya se le compró sigue
  en su sitio.
- Al pedir material, el selector propone **los proveedores habituales de
  ese material**; si no tiene ninguno, los más usados. Y **se sigue
  pudiendo escribir uno a mano**, que es lo de siempre: hay proveedores de
  los que solo se sabe el nombre, y a veces se compra a uno de paso.
- El listado global de material tiene **filtro por proveedor**, con los
  proveedores dados de alta y, aparte, los nombres que solo están
  escritos a mano. Así no se esconde ningún material mientras no estén
  todos vinculados.
- **Un trabajador no ve los proveedores.** Ahí hay teléfonos, correos y
  condiciones de compra. No es que no le salga el menú: las políticas de
  la base de datos le devuelven la lista vacía y las funciones le dan un
  error de permisos. Lo que sí sigue viendo, igual que antes, es el
  material de su proyecto con el nombre del proveedor en texto.

### M7 · Menciones con @

En cualquier caja de comentarios, escribiendo `@` se ofrece a quién
avisar. Al elegirlo se escribe su nombre dentro del texto —`@Juan
Ortega`—, el texto se queda legible, y el mencionado recibe un aviso que
dice **quién** le ha mencionado y **dónde**.

- **El aviso lo escribe el servidor**, al guardar el comentario. No
  depende de que el navegador de quien escribe siga abierto.
- **Solo se puede mencionar a quien ya puede ver el comentario**: la
  administración y quien esté asignado a ese proyecto, aviso, orden o
  parte. Y no lo decide la pantalla: la base de datos rechaza cualquier
  otro, así que manipular la petición a mano no sirve de nada. Mencionar
  a alguien que no puede ver el comentario le avisaría de algo que no
  podría abrir, y le filtraría de paso que ese proyecto existe.
- **Un comentario con menciones avisa solo a los mencionados.** Si
  avisara además a todo el equipo, el aviso de la mención se perdería
  entre el ruido. Es la misma idea que ya había para los comentarios
  dirigidos a una persona.
- **Un comentario sin menciones se comporta exactamente como antes.**

### M8 · Fuera los datos de ejemplo

En Configuración → Aplicación ya no hay «Datos de ejemplo». La aplicación
está en uso con datos reales, y un botón que siembra un taller inventado
en la base de datos de verdad es un accidente esperando a pasar.

- Se ha retirado el apartado, los dos botones y el archivo
  `src/services/demo.ts`.
- **Las columnas `is_demo` NO se han tocado.**
- Las funciones del servidor (`seed_demo`, `clear_demo`, `demo_status`)
  **siguen existiendo** hasta que ejecutes el archivo 50. Mientras tanto
  se pueden llamar desde Supabase si hiciera falta limpiar algo; lo que ya
  no hay es un botón para llamarlas sin querer.

---

## 3 · Archivos nuevos y modificados

Van todos en el ZIP **con sus rutas originales**, así que se extrae
encima de tu carpeta del proyecto y cada archivo cae en su sitio. Son
**57**, y he comprobado que el contenido del ZIP coincide byte a byte con
lo que he probado. No lleva ninguna clave, ningún token ni ningún dato
personal: lo he escaneado.

### SQL · nuevos · estructurales (no cambian ningún registro)

```
supabase/sql/42_estados_presupuesto.sql     M1 + M4
supabase/sql/43_fichas_sin_responsable.sql  M2
supabase/sql/44_productos_proyecto.sql      M3
supabase/sql/45_proveedores.sql             M6
supabase/sql/46_menciones.sql               M7
```

### SQL · nuevos · de datos · PENDIENTES DE TU APROBACIÓN

Ejecutar estos archivos **no cambia nada**: solo definen funciones que hay
que llamar a mano.

```
supabase/sql/47_datos_productos.sql           productos de los proyectos de hoy
supabase/sql/48_datos_proveedores.sql         proveedores escritos a mano
supabase/sql/49_datos_por_asignar.sql         fichas antiguas de «Por asignar»
supabase/sql/pendientes/50_retirar_demo.sql   retirar las funciones de demo
```

**El 50 está en otra carpeta a propósito.** Los otros tres solo definen
funciones, así que la batería de pruebas los instala y queda demostrado
que compilan. El 50 **borra** tres funciones: si estuviera en la misma
carpeta, cada vez que se ejecutan las pruebas se borrarían, y las pruebas
que las comprueban dejarían de poder hacerlo. Vive en
`supabase/sql/pendientes/`, donde nada lo ejecuta por su cuenta.

### Frontend · nuevos

```
src/pages/admin/SuppliersPage.tsx           pantalla de proveedores
src/services/suppliers.ts
src/components/shared/SupplierPicker.tsx    el proveedor de un material
src/components/shared/ProductBlocks.tsx     los productos de un proyecto
```

### Frontend · modificados

```
src/App.tsx                                 ruta de proveedores
src/config/navigation.ts                    sección de proveedores
src/config/constants.ts                     pendiente_senal, lacado_zincado
src/types/db.ts                             Supplier, ProjectProduct, MentionCandidate
src/services/fichas.ts                      el contador cuenta solo visitas
src/services/reports.ts                     presupuestos_pendientes_senal
src/services/projects.ts                    productos y filtro por subestado
src/services/materials.ts                   supplier_id y filtro por proveedor
src/services/comments.ts                    post_comment y candidatos a mención
src/pages/admin/Dashboard.tsx               los dos avisos nuevos
src/pages/admin/FichasList.tsx              el subtítulo ya no promete «Por asignar»
src/pages/admin/FichaForm.tsx               responsable solo en visitas
src/pages/admin/FichaDetail.tsx             pendiente_senal y responsable solo en visitas
src/pages/admin/ProjectForm.tsx             bloques de producto
src/pages/admin/ProjectDetail.tsx           panel «Qué se fabrica»
src/pages/admin/ProjectsList.tsx            filtro por subestado
src/pages/admin/MaterialsList.tsx           proveedor de la lista y filtro
src/pages/admin/SettingsPage.tsx            fuera el apartado de datos de ejemplo
src/pages/worker/ProjectDetail.tsx          todas las piezas del proyecto
src/components/shared/MaterialModal.tsx     selector de proveedor
src/components/shared/CommentsPanel.tsx     menciones con @
```

### Frontend · retirados

```
src/services/demo.ts                        M8
src/components/shared/SupplierInput.tsx     sustituido por SupplierPicker
```

### Pruebas · nuevas

```
tests/sql/94_tests_estados.sql              M1 + M4   · 27 comprobaciones
tests/sql/95_tests_sin_responsable.sql      M2        · 23
tests/sql/96_tests_proveedores.sql          M6        · 57
tests/sql/97_tests_menciones.sql            M7        · 43
tests/e2e/mejoras.mjs                       M1/M3/M5/M6/M7 en navegador real · 66
```

### Pruebas · modificadas (adaptadas a la realidad nueva, sin rebajarlas)

```
tests/sql/10_tests.sql          + ayudante test.errlike (comprueba el mensaje, no solo el código)
tests/sql/20_tests_fase2.sql    el presupuesto nace «Pendiente»; la visita sigue «Por asignar»
tests/sql/30_tests_fase3.sql    etiqueta corregida
tests/sql/84_tests_bloque5.sql  el aviso nace «Pendiente»
tests/sql/90_tests_avisos.sql   ficha heredada propia
tests/unit/format.test.ts       + pendiente_senal y lacado_zincado · 66 en total
tests/e2e/fase3.mjs             campos de producto; 4 subestados de fabricación
tests/e2e/fase7.mjs             los datos de ejemplo se han retirado
tests/e2e/navegacion.mjs        14 secciones; «visitas por asignar»
tests/e2e/qa-final.mjs          campos de producto
tests/e2e/fase2.mjs             el presupuesto nace «Pendiente»; «Por asignar» ya no se ofrece
tests/e2e/fase5.mjs             día laborable hacia delante (fallaba en fin de semana)
tests/e2e/fase6.mjs             el panel avisa de las VISITAS por asignar, no de las fichas
tests/e2e/bloque5.mjs          el aviso nace «Pendiente» y se asigna repartiéndolo
tests/e2e/avisos.mjs           cambiar de tipo no arrastra el responsable; día laborable hacia delante
tests/e2e/fake-supabase.mjs     tablas, vistas y funciones nuevas + el hueco de M2
```

**Sobre el falso Supabase, y esto conviene saberlo:** al adaptar las
pruebas encontré que **nunca se había actualizado a M2**. Tenía DOS
huecos, y los dos los descubrieron pruebas nuevas al fallar:

1. Seguía haciendo nacer los presupuestos y los avisos en «Por asignar».
   La capa de navegador llevaba comprobando el comportamiento ANTIGUO.
2. Su panel seguía contando las tres clases de ficha en el aviso de «por
   asignar», en lugar de solo las visitas.

Los he corregido para que imiten la regla de verdad, y he añadido también
el paso a «Asignado» al repartir un aviso entre operarios y el aviso de
los presupuestos pendientes de paga y señal.

Esto importa más allá de esta entrega: significa que **la capa de
navegador puede quedarse desfasada sin que nada avise**, porque imita a
Supabase a mano. Las reglas de verdad siempre se comprueban contra
PostgreSQL (los archivos de `tests/sql`), y el navegador comprueba la
PANTALLA. Si alguna vez las dos capas dicen cosas distintas, la que
manda es la de PostgreSQL.

---

## 4 · Informe de datos

### Lo que se ha tocado de tus datos: nada

No tengo acceso a tu Supabase y no he ejecutado nada contra él.

Y **ejecutar los archivos 42 a 46 no cambia ni una fila**. Conviene
explicar bien por qué, porque si buscas la palabra `update` en esos
archivos **vas a encontrarla**, y quiero que sepas qué estás viendo:

```powershell
Select-String -Path "supabase\sql\4[2-6]_*.sql" -Pattern "^\s*(update|delete|truncate)\s"
```

Eso devuelve **siete líneas**, y todas están **dentro del cuerpo de una
función**: son las instrucciones que la función ejecutará cuando la
aplicación la llame, no algo que pase al instalar el archivo. Por
ejemplo, `delete from public.project_products` está dentro de
`save_project_products`, que es lo que corre cuando administración guarda
los productos de un proyecto desde la pantalla.

La comprobación que de verdad responde a la pregunta es esta, en Supabase
y **antes** de aplicar nada, para tener los números de partida:

```sql
select 'fichas' as tabla, count(*)::text as filas, max(updated_at)::text as ultimo_cambio
  from public.fichas
union all select 'proyectos', count(*)::text, max(updated_at)::text from public.projects
union all select 'materiales', count(*)::text, max(updated_at)::text from public.materials
union all select 'partes de trabajo', count(*)::text, max(updated_at)::text from public.work_reports
union all select 'comentarios', count(*)::text, max(created_at)::text from public.comments;
```

Ejecútalo antes y después de aplicar los archivos 42 a 46. **Las cinco
cifras y las cinco fechas tienen que salir idénticas.** Si alguna cambia,
para y dímelo.

### Lo que las migraciones de datos tocarían, si las apruebas

| Archivo | Qué escribe | Qué NO toca |
|---|---|---|
| **47** | Crea una fila en `project_products` por cada proyecto que tenga descripción, medidas o acabado y todavía no tenga productos | Ninguna columna de `projects`. Ningún proyecto que ya tenga productos |
| **48** | Crea filas en `suppliers`, y pone `materials.supplier_id` donde estaba vacío | La columna `materials.supplier` (el nombre en texto). Los vínculos que ya existieran |
| **49** | Cambia `fichas.status` de `por_asignar` a `pendiente` o `asignado`, solo en presupuestos y avisos sin archivar | Las visitas. El responsable, el equipo, las fechas, los importes, los comentarios y el histórico |
| **50** | Borra tres funciones | Las columnas `is_demo` (las 31 que hay). Ningún registro |

Las tres primeras **no escriben nada al ejecutar el archivo**: solo
definen funciones. Hay que llamarlas a mano, y cada una tiene su
simulación para ver antes lo que haría.

### Cuántos registros habría en juego

**No lo sé, y no me lo voy a inventar.** Depende de tus datos, y no los
he visto. Para saberlo, ejecuta esto en Supabase cuando hayas aplicado
los archivos 42 a 49. No cambia nada:

```sql
select 'proyectos que recibirían un producto' as que,
       count(*)::text as cuantos
  from public.projects p
 where not exists (select 1 from public.project_products x where x.project_id = p.id)
   and coalesce(nullif(btrim(coalesce(p.description, '')), ''),
                nullif(btrim(coalesce(p.measures, '')), ''),
                nullif(btrim(coalesce(p.finish, '')), '')) is not null
union all
select 'proveedores distintos que se darían de alta',
       count(distinct public.norm_client_name(supplier))::text
  from public.materials
 where nullif(btrim(coalesce(supplier, '')), '') is not null
union all
select 'materiales que se atarían a un proveedor',
       count(*)::text from public.materials
 where supplier_id is null and nullif(btrim(coalesce(supplier, '')), '') is not null
union all
select 'presupuestos y avisos que se moverían de «Por asignar»',
       count(*)::text from public.fichas
 where status = 'por_asignar' and archived_at is null
   and type in ('presupuesto', 'aviso')
union all
select 'visitas en «Por asignar» que NO se tocarían',
       count(*)::text from public.fichas
 where status = 'por_asignar' and type = 'visita'
union all
select 'registros marcados como datos de ejemplo',
       (select count(*) from public.clients where is_demo)::text || ' clientes, '
    || (select count(*) from public.projects where is_demo)::text || ' proyectos, '
    || (select count(*) from public.fichas where is_demo)::text || ' fichas';
```

Si me pasas el resultado, te digo con números qué recomiendo en cada
decisión del apartado 9.

---

## 5 · Qué he probado, y qué no

**Esto es importante y lo digo tal cual: no doy por buena ninguna prueba
que no haya ejecutado.** Para que no haya duda, cada cosa va en una de
estas cuatro casillas:

| Casilla | Qué hay aquí |
|---|---|
| **Ejecutada y correcta** | Todo lo de la tabla de abajo y los cinco bancos de mutaciones |
| **Ejecutada y falla** | **Nada.** No queda ninguna prueba en rojo |
| **No he podido ejecutarla** | El filtrado de tablas relacionadas de PostgREST (punto 2 de más abajo), y por eso M5 está montado de otra manera |
| **Necesita tu Supabase o tu mano** | Aplicar el SQL, publicar, las migraciones de datos sobre tus registros, y el repaso de diez minutos del apartado 8 |

### Ejecutadas y correctas

| Capa | Resultado |
|---|---|
| PostgreSQL 16 real, con todo el SQL instalado desde cero | **1.368 de 1.368** |
| Pruebas unitarias (vitest) | **66 de 66** |
| Navegador real contra un Supabase simulado · 19 archivos | **1.193 de 1.193** |
| · de los cuales, los de estas ocho mejoras (`mejoras.mjs`) | **66 de 66** |
| `tsc --noEmit` y `npm run build` | sin errores |

Es decir: **`npm run test:all` termina con éxito**, las 21 etapas, sin
una sola comprobación en rojo. Y es una única ejecución limpia, con nada
más corriendo: por qué insisto en eso está más abajo.

### Rompiendo el código a propósito

Una prueba que no falla cuando el código está roto no prueba nada. Por
cada mejora he roto su regla y he comprobado que alguna prueba se cae:

| Banco | Mutaciones | Cazadas |
|---|---|---|
| M1 + M4 · archivo 42 | 7 | **7** |
| M2 · archivo 43 | 8 | **8** |
| M6 · archivo 45 | 19 | **19** |
| M7 · archivo 46 | 15 | **14** · ver abajo |
| Frontend · M3, M5, M6, M7 | 21 | **20** · ver abajo |
| **Total** | **70** | **68** |

Y después de cada banco compruebo, para **las 70**, que el texto original
sigue en su sitio exactamente una vez. Un banco interrumpido puede dejar
una mutación puesta, y ya me ha pasado dos veces (lo cuento más abajo).

**Las dos que sobreviven, y por qué no son un agujero:**

1. *«Las menciones se pueden escribir a mano»* (quitar el `revoke` de
   `comment_mentions`). Sobrevive porque el permiso de escritura **nunca
   se concedió**: el `revoke` es una red de seguridad redundante. Con o
   sin él, la inserción a mano se rechaza, y hay una prueba que lo
   comprueba. Lo dejo puesto por coherencia con el resto de los archivos.

2. *«El proyecto deja de quedarse con los datos del primer producto»*.
   Sobrevive porque `save_project_products` vuelve a copiarlos
   inmediatamente después, así que el resultado final es el mismo. Esa
   línea es una red de seguridad **para el caso en que falle el segundo
   paso**: así el proyecto queda con los datos del primer producto en
   lugar de en blanco. No se puede provocar ese fallo desde el navegador,
   así que no hay prueba que la distinga. La dejo, y digo por qué.

### Un fallo de verdad, encontrado al revisar el trabajo ya hecho

No todo lo encontró el banco de mutaciones. Esto salió releyendo el panel
de comentarios cuando ya estaba terminado:

El buscador del `@` miraba hasta el **final del texto** en lugar de hasta
donde está el cursor. Escribir `@Jua` al final del comentario funcionaba,
pero **mencionar a alguien en medio de una frase ya escrita no ofrecía a
nadie**, porque el resto de la frase no coincide con ningún nombre. Y si
se llegaba a elegir, se comía lo que hubiera detrás.

Corregido, con la prueba en navegador que lo habría cazado —escribir una
frase, poner el cursor en medio, escribir `@Juan`, elegir y comprobar que
lo de después sigue ahí— y dos mutaciones más en el banco para que no
vuelva a entrar sin que salte nada.

### Lo que el banco de mutaciones encontró en mis propias pruebas

Lo cuento porque cambia la confianza que merecen:

- Una prueba de proveedores comprobaba el **código** de error pero no el
  **mensaje**, así que no distinguía el aviso en castellano del error
  crudo de PostgreSQL. Añadí el ayudante `test.errlike` y la reforcé.
- Una prueba de menciones era **tautológica** (`count(*) >= 0` siempre es
  cierto). Reescrita con un comentario que Juan no puede leer.
- Dos pruebas del filtro por subestado pasaban porque en el juego de
  pruebas **solo había un proyecto**: filtrar o no daba lo mismo. Añadí un
  segundo proyecto sin ese subestado y un tercero en otra fase.
- Una prueba de proveedores no comprobaba que el **vínculo** se guardara,
  solo el texto.
- Una prueba mía de precedencia de operadores (`A and B or C`) contaba
  avisos de cualquier usuario.
- Una **validación de la migración 48** culpaba a la migración de un
  vínculo que no había hecho ella: un material cuyo proveedor se había
  elegido antes a mano, con un texto distinto del nombre del proveedor.
  Eso es una decisión legítima de quien lo eligió, no un fallo. Ahora la
  comprobación estricta solo mira lo que ató la migración, y el caso
  legítimo se cuenta aparte como informativo.
- **Tres** pruebas de calendario **fallaban los sábados y los domingos**,
  y no por nada que hubiera cambiado: la agenda del trabajador va de hoy
  en adelante y el día laborable del juego de pruebas se calculaba hacia
  atrás, así que en fin de semana caía en el viernes pasado y lo
  programado no salía. Añadí un ayudante que lo calcula hacia delante.
  Lo encontré porque hoy es domingo; en día laborable no habría salido, y
  habría seguido fallando un fin de semana de cada dos.
- El **informe de `productos_deshacer()`** mentía en un caso: al guardar
  los productos de un proyecto desde la pantalla, las filas se borran y
  se vuelven a insertar, así que sus identificadores cambian. El informe
  decía entonces «0 conservados», dando a entender que no había nada que
  conservar, cuando era justo lo contrario. Ahora las cuenta aparte como
  «rehechos» y lo dice. Lo he probado: aplicar, editar un proyecto a
  mano, deshacer → **4 borrados, 1 rehecho, y la pieza puesta a mano
  sigue ahí**.
- Y al corregir ese informe salió otra: cambiar las columnas que devuelve
  una función hace que `create or replace` falle con «cannot change
  return type», así que el archivo **dejaba de poder reejecutarse**. Las
  tres migraciones de datos sueltan ahora cada función antes de crearla.
- Una comprobación de `bloque5.mjs` **fallaba de vez en cuando**, no
  siempre: daba por hecho que 1,1 segundos bastaban para que la pantalla
  de material estuviera pintada, y `count()` no espera a nada. Falló una
  vez, pasó a la siguiente sin tocar nada, y eso es peor que un fallo
  fijo porque enseña a desconfiar de las pruebas. Ahora espera a que la
  pantalla esté visible.

### Un error mío en el proceso, y cómo lo cacé

Lancé una segunda ejecución del banco de mutaciones **sin comprobar que
la anterior había terminado**. Dos bancos a la vez mutan los mismos
archivos y chocan de puerto, así que sus resultados eran basura —cinco
«mutaciones cazadas» lo estaban por un `Unhandled 'error' event`, no por
ninguna prueba— y, peor, **dos mutaciones quedaron puestas en el
código**:

- una en el panel de comentarios, que escondía el aviso de a quién se va
  a avisar;
- y otra en el servicio, que devolvía **todos los perfiles** en lugar de
  los candidatos que autoriza el servidor. Esa habría sido un agujero: la
  pantalla habría ofrecido mencionar a cualquiera.

Lo detecté porque la prueba base falló al rearrancar («ofrece a Ana
Ferrer», que no está en ese proyecto). En lugar de seguir buscando a ojo,
escribí una comprobación mecánica: para **cada una de las 70 mutaciones
de los seis bancos**, que el texto original esté en su sitio exactamente
una vez. **70 de 70 limpias.** Los números de este documento son de una
única ejecución limpia, con nada más corriendo.

Lo cuento porque explica por qué insisto en verificar la integridad
después de cada banco: es la segunda vez que un banco interrumpido deja
una mutación puesta, y la primera vez también lo cacé por una prueba que
falló, no por mirar el código.

### Lo que NO he podido probar, y te toca a ti

1. **Nada se ha ejecutado contra tu Supabase.** Todo lo de arriba es
   PostgreSQL 16 local con el mismo SQL instalado desde cero. El esquema
   real puede tener diferencias que yo no veo.
2. **El filtrado de tablas relacionadas de PostREST no se puede
   comprobar aquí.** Por eso el filtro por subestado (M5) usa **dos
   consultas** en lugar de una: primero qué proyectos tienen ese
   subestado y después esos proyectos. Es un viaje más y a cambio se sabe
   exactamente qué devuelve.
3. **El aviso general de un comentario sin menciones** no está imitado en
   el Supabase simulado del navegador —nunca lo estuvo—, así que ese
   camino se prueba **solo** contra PostgreSQL de verdad
   (`97_tests_menciones.sql`), donde sí se comprueban las dos cosas: que
   un comentario sin menciones sigue avisando a los asignados y que uno
   con menciones avisa solo a los mencionados.
4. **Las migraciones de datos no se han aplicado a tus datos reales**,
   porque no los tengo. Pero **sí las he ejecutado enteras** contra el
   PostgreSQL de pruebas, con sus 29 proyectos y sus 7 materiales:
   simular → aplicar → validar → **deshacer**, las tres:

   | | Aplicar | Validar | Deshacer |
   |---|---|---|---|
   | 47 · productos | 5 productos creados de 29 proyectos | todos los «debe ser 0» a 0 | 5 borrados, 0 conservados |
   | 48 · proveedores | 4 proveedores, 6 materiales atados | todos a 0 | 6 vínculos soltados, 4 proveedores borrados, ningún texto perdido |
   | 49 · por asignar | 1 ficha movida, 0 visitas tocadas | todos a 0 | 1 devuelta |

   Y el 50 deja las tres funciones retiradas, **31 columnas `is_demo`
   intactas** y ningún registro tocado.

   Aun así, ejecuta la simulación y mira lo que saldría **antes** de
   aplicar nada: tus datos no son estos.

---

## 6 · Cómo aplicarlo, paso a paso

### Antes de empezar

> **Las migraciones 38 a 41 de la entrega anterior siguen sin aplicar.**
> Van **antes** que estas. Si no las has aplicado, hazlo primero,
> siguiendo `APLICAR.md`.

### Paso 1 · Copia de seguridad

En **Supabase → Database → Backups**, comprueba que hay una copia
reciente. Si no, descarga una antes de seguir. Esto no es formulismo: es
lo único que te permite volver atrás si algo no cuadra.

### Paso 2 · El SQL estructural, en orden, uno por uno

En **Supabase → SQL Editor**, abre cada archivo, pégalo **completo** y
ejecútalo. Uno cada vez, y mira que termine sin error antes de pasar al
siguiente:

1. `supabase/sql/42_estados_presupuesto.sql`
2. `supabase/sql/43_fichas_sin_responsable.sql`
3. `supabase/sql/44_productos_proyecto.sql`
4. `supabase/sql/45_proveedores.sql`
5. `supabase/sql/46_menciones.sql`

Los cinco se pueden ejecutar **varias veces sin hacer daño**, así que si
dudas de si uno llegó a terminar, lo vuelves a ejecutar.

**Si alguno da error, PARA.** No sigas con el siguiente y pásame el
mensaje completo. Un archivo a medias es peor que uno sin ejecutar.

### Paso 3 · Comprueba que están

Pega esto en el SQL Editor. Tiene que devolver **siete** filas, todas con
`SÍ`:

```sql
select 'pendiente_senal en el catálogo' as que,
       case when public.valid_ficha_status('presupuesto', 'pendiente_senal')
            then 'SÍ' else 'NO' end as esta
union all
select 'lacado_zincado en fabricación',
       case when public.valid_substatus('fabricacion', 'lacado_zincado')
            then 'SÍ' else 'NO' end
union all
select 'tabla project_products',
       case when exists (select 1 from pg_tables
                          where schemaname = 'public' and tablename = 'project_products')
            then 'SÍ' else 'NO' end
union all
select 'tabla suppliers',
       case when exists (select 1 from pg_tables
                          where schemaname = 'public' and tablename = 'suppliers')
            then 'SÍ' else 'NO' end
union all
select 'tabla comment_mentions',
       case when exists (select 1 from pg_tables
                          where schemaname = 'public' and tablename = 'comment_mentions')
            then 'SÍ' else 'NO' end
union all
select 'función post_comment',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'post_comment')
            then 'SÍ' else 'NO' end
union all
select 'RLS activado en las tablas nuevas',
       case when (select bool_and(rowsecurity) from pg_tables
                   where schemaname = 'public'
                     and tablename in ('project_products', 'suppliers',
                                       'material_suppliers', 'comment_mentions'))
            then 'SÍ' else 'NO' end;
```

Para comprobar que **no se ha cambiado ningún registro**, vuelve a
ejecutar la consulta de recuentos del apartado 4 y compárala con la de
antes: las cifras y las fechas tienen que ser idénticas. Eso lo comprueba
de verdad; una fila que dijera «SÍ» no comprobaría nada.

### Paso 4 · Publicar la aplicación

Esto lo haces tú desde tu ordenador. Son los comandos del apartado 7.

### Paso 5 · Las migraciones de datos · solo si las quieres

Las tres primeras son **opcionales**: sin ellas todo funciona igual,
porque la lectura lleva respaldo. La cuarta retira las funciones de datos
de ejemplo.

Para cada una, el orden es siempre el mismo: **simular, mirar, aplicar,
validar**. Y lee el encabezado del archivo antes.

```sql
-- 47 · los productos de los proyectos de hoy
select * from public.productos_simular();   -- MIRA esto antes de seguir
select * from public.productos_aplicar();
select * from public.productos_validar();   -- los «debe ser 0» tienen que ser 0

-- 48 · los proveedores que ya están escritos a mano
select * from public.proveedores_simular(); -- MIRA la columna «escrito_hoy_asi»
select * from public.proveedores_aplicar();
select * from public.proveedores_validar();

-- 49 · las fichas antiguas en «Por asignar»
select * from public.por_asignar_simular();
select * from public.por_asignar_aplicar();
select * from public.por_asignar_validar();
```

El archivo 50 va aparte, en `supabase/sql/pendientes/`. Léelo entero
antes: **ejecutarlo sí cambia algo** (borra tres funciones) y, al
contrario que los otros tres, **no se deshace con una función**.

Las tres se pueden deshacer: `productos_deshacer()`,
`proveedores_deshacer()`, `por_asignar_deshacer()`. **Y aquí está el
límite honesto de lo que puedo prometer:** se deshace exactamente lo que
hizo la migración, porque cada una apunta en un diario qué ha tocado. Lo
que **no** se deshace es lo que hagáis después. Si al aplicar la 47
editáis los productos de un proyecto, esas filas ya son vuestras y
`productos_deshacer()` no las toca: lo dice en su informe.

El archivo 50 es el único que **no se puede deshacer** ejecutando una
función: para volver a tener `seed_demo` habría que volver a ejecutar los
archivos 23 y 25. Lo dice en su encabezado.

---

## 7 · Los comandos de PowerShell

Desde la carpeta del proyecto en tu ordenador. Si la ruta es distinta de
la que me dijiste, usa la tuya.

```powershell
cd "C:\Users\Joel\Desktop\Metalplafer\2026\METALPLAFER 360\metalplafer360-final"
```

### Comprobar que todo está bien antes de publicar

```powershell
npm install
npm run typecheck
npm test
npm run build
```

`npm run typecheck` y `npm test` tienen que terminar sin errores, y
`npm run build` tiene que decir `built in ...`.

> **`npm run test:sql` y las pruebas de navegador no van a funcionar en
> Windows tal cual**, y no es un fallo tuyo: las de SQL necesitan un
> PostgreSQL 16 local y las de navegador necesitan Chromium descargado por
> Playwright. Las he ejecutado yo aquí y el resultado está en el apartado
> 5. En Windows, con `typecheck`, `test` y `build` tienes bastante para
> publicar con tranquilidad.

### Publicar

```powershell
git status
git add -A
git commit -m "Ocho mejoras: estados, productos, proveedores y menciones"
git push
```

El push dispara GitHub Actions, que es el mecanismo que ya tenías. En
**GitHub → Actions** verás el despliegue; cuando termine en verde, entra
en `https://360.metalplafer.com` y **recarga con Ctrl+F5**.

> **Sobre la dirección:** el encargo que me pasaste cita
> `metalplafer.github.io/metalplafer360/`. Esa ya **no** sirve: la
> publicación está configurada para el dominio propio, donde la
> aplicación vive en la raíz, y en la dirección de github.io pediría sus
> archivos desde una carpeta que no existe y se quedaría en blanco. Eso
> fue justamente el arreglo de la pantalla en blanco de hace unas
> semanas, y está explicado en `.github/workflows/deploy.yml`.
>
> Comprueba siempre en **`360.metalplafer.com`**. Si alguna vez hay que
> volver a publicar en la de github.io, no hay que tocar código: basta
> crear la variable `VITE_BASE_PATH = /metalplafer360/` en
> *Settings → Secrets and variables → Actions → Variables*.

> Antes de `git add -A`, mira `git status`. Si aparece algún archivo que
> no esperas, dímelo antes de hacer commit.

### Si algo sale mal después de publicar

```powershell
git log --oneline -5
git revert HEAD
git push
```

Eso deja la aplicación como estaba. **Las migraciones de SQL no se
deshacen con esto**: siguen aplicadas, y no pasa nada, porque las cinco
estructurales **funcionan también con la versión anterior** de la
aplicación. Añaden tablas, vistas y estados; no quitan ninguna columna ni
ninguna función de las que esa versión usa.

Lo único que notarías con la aplicación antigua y el SQL nuevo puesto:

- un presupuesto nuevo nacería en «Pendiente» en lugar de «Por asignar»,
  y la pantalla antigua seguiría ofreciendo el selector de responsable;
  ponerlo no rompe nada, simplemente no hace falta;
- el aviso del panel contaría solo las visitas, pero la pantalla antigua
  lo seguiría llamando «fichas por asignar», así que la cifra sería
  correcta y la etiqueta, imprecisa.

Nada de eso impide trabajar. Pero si vas a volver atrás **y quedarte
ahí**, dímelo y te preparo la vuelta también del SQL.

---

## 8 · Qué mirar en la aplicación cuando esté publicada

Diez minutos, por este orden:

1. **Un presupuesto nuevo** nace en «Pendiente» y **no** pide
   responsable.
2. Llévalo a «Enviado» y de ahí a «Pendiente de paga y señal». Intenta
   **convertirlo en proyecto**: tiene que negarse y explicar por qué.
3. Pásalo a «Presupuesto aceptado» y conviértelo. Ahora sí.
4. **Un aviso nuevo** nace en «Pendiente». Reparte operarios: pasa a
   «Asignado».
5. **Una visita nueva** sigue naciendo «Por asignar» y sigue pidiendo
   responsable de administración.
6. Abre un **proyecto antiguo**: en «Qué se fabrica» tiene que salir lo
   que ya tenía, con el aviso de que viene de cuando solo había un
   producto.
7. Edítalo, **añade una segunda pieza** y guarda. Mira que el móvil de un
   trabajador asignado vea las dos.
8. En **Proyectos**, filtra por «Falta material»: tienen que salir solo
   los que lo tengan marcado, y si no hay ninguno tiene que decirlo con
   el nombre del subestado en lugar de un «no hay proyectos» a secas.
   Cambia de fase a Montaje y mira que el filtro no se quede puesto con
   un subestado que esa fase no tiene.
9. En **Proveedores**, da de alta uno y prueba a crearlo otra vez
   escrito de otra manera: tiene que decirte que ya estaba.
10. En un comentario, escribe `@` y menciona a alguien. Comprueba que le
    llega el aviso y que **no** se ofrece a nadie que no esté en ese
    proyecto.

Si algo de esto no se comporta así, pásame qué paso y qué viste.

---

## 9 · Decisiones que te toca tomar

### 1 · ¿Migramos los datos antiguos, o los dejamos como están?

Las tres primeras migraciones de datos son opcionales. Lo que cambia:

| | Si NO la ejecutas | Si la ejecutas |
|---|---|---|
| **47 · productos** | Los proyectos antiguos siguen enseñando lo que tenían, con un aviso de que vienen de cuando solo había un producto | Ese aviso desaparece. Nada más |
| **48 · proveedores** | El material antiguo sigue enseñando su proveedor en texto. El filtro por proveedor los ofrece aparte | Los proveedores quedan dados de alta con su teléfono, y el filtro y los habituales funcionan sobre todo el histórico |
| **49 · por asignar** | Los presupuestos y avisos antiguos se quedan en «Por asignar». Funcionan, pero conviven dos formas de estar pendiente | Pasan a «Pendiente», como los nuevos |

**Mi recomendación:** ejecuta la **48**, que es la que aporta de verdad
(el filtro por proveedor sobre el histórico). Las otras dos son cosmética
y puedes dejarlas para más adelante. Las tres se pueden deshacer.

### 2 · ¿Retiramos ya las funciones de datos de ejemplo?

El botón ya no está. La pregunta es si quitamos también las funciones del
servidor (archivo 50).

- **A favor de quitarlas:** nadie puede llamarlas por error desde
  Supabase, y `clear_demo` **borra registros**.
- **A favor de dejarlas:** si queda algún dato de ejemplo mezclado con
  los vuestros, `clear_demo` es la forma limpia de quitarlo.

**Mi recomendación:** ejecuta primero esto para ver si queda algo:

```sql
select * from public.demo_status();
```

Si dice que no hay datos de ejemplo, ejecuta el archivo 50 y se acabó. Si
dice que sí, decide antes qué hacer con ellos. **Ojo: `clear_demo` borra
registros, así que no la ejecutes sin mirar primero lo que se llevaría.**

### 3 · ¿Los proveedores que agrupa la 48 son de verdad el mismo?

La simulación de la 48 tiene una columna, `escrito_hoy_asi`, con las
formas distintas en que está escrito cada proveedor. Si agrupa dos que
vosotros consideráis **distintos** —dos delegaciones, por ejemplo—,
**dímelo antes de aplicarla**. Corregirlo después se puede, pero es más
limpio no mezclarlos.

---

## 10 · Lo que sigue pendiente de antes

Esto no es de esta entrega, pero conviene no perderlo de vista:

- **Las migraciones 38 a 41** de la entrega anterior **siguen sin
  aplicar**. Van antes que estas.
- **La importación de clientes de Holded** está preparada y probada,
  pero **no ejecutada**: espera tu exportación real.
- **La capacidad de almacenamiento contratada** sigue sin escribir, así
  que el indicador no puede decir qué porcentaje lleváis usado.
