# Puesta en marcha de METALPLAFER360

Esta guía está escrita para alguien que **no es programador**. Se explica qué
hacer, dónde hacerlo, qué botón pulsar y qué copiar y pegar.

Tiempo aproximado: **30–40 minutos** (más otros 20 si quieres las copias
automáticas en Google Drive, que es el apartado 15 y se puede dejar para otro
día). No hace falta instalar nada en el
ordenador: todo se hace desde el navegador.

Necesitas:

- Una cuenta de correo.
- La cuenta de GitHub donde está el repositorio.

---

## Índice

1. [Crear la cuenta de Supabase](#1-crear-la-cuenta-de-supabase)
2. [Crear el proyecto](#2-crear-el-proyecto)
3. [Crear la base de datos](#3-crear-la-base-de-datos)
4. [Comprobar que ha ido bien](#4-comprobar-que-ha-ido-bien)
5. [Desactivar los registros públicos](#5-desactivar-los-registros-públicos)
6. [Crear el primer usuario: el administrador](#6-crear-el-primer-usuario-el-administrador)
7. [Crear un trabajador de prueba](#7-crear-un-trabajador-de-prueba)
8. [Copiar las claves a GitHub](#8-copiar-las-claves-a-github)
9. [Publicar la aplicación](#9-publicar-la-aplicación)
10. [Entrar por primera vez](#10-entrar-por-primera-vez)
11. [Instalar la aplicación en el móvil](#11-instalar-la-aplicación-en-el-móvil)
12. [Añadir los logos de Metalplafer](#12-añadir-los-logos-de-metalplafer)
13. [Primeros pasos con la aplicación](#13-primeros-pasos-con-la-aplicación)
14. [Si algo no funciona](#14-si-algo-no-funciona)
15. [Copias de seguridad en Google Drive (opcional)](#15-copias-de-seguridad-en-google-drive-opcional)
16. [Dar de alta trabajadores desde la aplicación (opcional)](#16-dar-de-alta-trabajadores-desde-la-aplicación-opcional)
17. [Restaurar una copia de seguridad](#17-restaurar-una-copia-de-seguridad)

---

## 1. Crear la cuenta de Supabase

Supabase es el servicio donde vivirán los datos de la empresa.

1. Entra en **https://supabase.com**.
2. Pulsa **Start your project** (arriba a la derecha).
3. Pulsa **Continue with GitHub** y autoriza el acceso.
   (Así usas la cuenta que ya tienes y no hay que recordar otra contraseña.)

> El plan gratuito es suficiente para empezar. Si en el futuro hicieran falta
> más archivos o más espacio, se puede ampliar sin rehacer nada.

---

## 2. Crear el proyecto

1. Pulsa **New project**.
2. Rellena:
   - **Name**: `metalplafer360`
   - **Database Password**: pulsa **Generate a password** y, muy importante,
     **guarda esa contraseña en un sitio seguro** (gestor de contraseñas o papel
     en un cajón). Es la contraseña de la base de datos y no se puede recuperar.
   - **Region**: `West EU (Ireland)` o `Central EU (Frankfurt)` — las más
     cercanas a España, para que la aplicación vaya rápida.
3. Pulsa **Create new project**.
4. Espera 2 o 3 minutos mientras se prepara.

---

## 3. Crear la base de datos

Vas a ejecutar diecinueve archivos, **en orden**. Cada uno crea una parte.

1. En el menú de la izquierda, pulsa **SQL Editor** (icono de hoja con `>_`).
2. Pulsa **New query**.
3. Abre en GitHub el archivo `supabase/sql/01_schema.sql`, pulsa el botón de
   **copiar** (icono de dos hojas, arriba a la derecha del archivo) y **pégalo**
   en la ventana negra de Supabase.
4. Pulsa **Run** (abajo a la derecha, o `Ctrl + Enter`).
5. Debe aparecer abajo **Success. No rows returned**.
6. Borra el contenido de la ventana y **repite los pasos 3 a 5** con cada uno
   de estos archivos, en este orden exacto:

   | Orden | Archivo | Qué crea |
   |---|---|---|
   | 1.º | `supabase/sql/01_schema.sql` | Las tablas base |
   | 2.º | `supabase/sql/02_functions.sql` | El alta automática de usuarios, la numeración y el historial |
   | 3.º | `supabase/sql/03_security.sql` | Los permisos |
   | 4.º | `supabase/sql/04_storage.sql` | El almacén de archivos |
   | 5.º | `supabase/sql/06_schema_clientes_fichas.sql` | Clientes, contactos y fichas |
   | 6.º | `supabase/sql/07_funciones_clientes_fichas.sql` | Códigos, estados y sugerencias de clientes |
   | 7.º | `supabase/sql/08_seguridad_clientes_fichas.sql` | Permisos de clientes y fichas |
   | 8.º | `supabase/sql/09_schema_proyectos.sql` | Proyectos y subestados |
   | 9.º | `supabase/sql/10_funciones_proyectos.sql` | Fases, conversión de presupuestos y finalización |
   | 10.º | `supabase/sql/11_seguridad_proyectos.sql` | Permisos de proyectos |
   | 11.º | `supabase/sql/12_schema_ordenes.sql` | Órdenes de trabajo, partes y avisos internos |
   | 12.º | `supabase/sql/13_funciones_ordenes.sql` | Estados de las órdenes, revisión y notificaciones |
   | 13.º | `supabase/sql/14_seguridad_ordenes.sql` | Permisos de las órdenes y del móvil del trabajador |
   | 14.º | `supabase/sql/15_schema_material.sql` | Material pendiente, avisos del taller y cobros |
   | 15.º | `supabase/sql/16_funciones_material.sql` | Proveedores, retrasos, calendario y cálculo de cobros |
   | 16.º | `supabase/sql/17_seguridad_material.sql` | Permisos de material y facturación |
   | 17.º | `supabase/sql/18_schema_informes.sql` | El registro de copias y el uso del almacenamiento |
   | 18.º | `supabase/sql/19_funciones_informes.sql` | El panel de inicio, los informes, las copias y la restauración |
   | 19.º | `supabase/sql/20_seguridad_informes.sql` | Permisos de informes y copias de seguridad |

   > El archivo `05_verificacion.sql` **no hace falta ejecutarlo**: son
   > consultas de apoyo para comprobar cosas o cambiar un rol más adelante.
   >
   > El archivo `21_backup_automatico.sql` tampoco se ejecuta ahora: es el que
   > programa la copia diaria a Google Drive, y se explica en el
   > [apartado 15](#15-copias-de-seguridad-en-google-drive-opcional). Sin él,
   > la copia que se descarga a mano funciona igual.

> **Si sale un aviso amarillo que empieza por `NOTICE:`**, no pasa nada: es
> informativo. Solo es un problema si aparece en rojo la palabra **ERROR**.

---

## 4. Comprobar que ha ido bien

1. En **SQL Editor**, pulsa **New query**.
2. Copia y pega **solo este trozo** y pulsa **Run**:

```sql
select 'Tablas creadas' as comprobacion,
       case when count(*) = 18 then 'CORRECTO' else 'FALTAN TABLAS' end as resultado
  from pg_tables where schemaname = 'public'
   and tablename in ('profiles', 'app_settings', 'code_counters', 'audit_log',
                     'clients', 'client_contacts', 'fichas', 'documents', 'comments',
                     'projects', 'project_substatuses',
                     'work_orders', 'work_order_workers', 'notifications',
                     'materials', 'material_requests', 'payments', 'backups')
union all
select 'Seguridad RLS activada',
       case when bool_and(rowsecurity) then 'CORRECTO' else 'HAY TABLAS SIN PROTEGER' end
  from pg_tables where schemaname = 'public'
union all
select 'Contenedor de archivos',
       case when exists (select 1 from storage.buckets where id = 'documentos' and not public)
            then 'CORRECTO' else 'FALTA' end
union all
select 'Panel, informes y copias',
       case when count(*) = 11 then 'CORRECTO' else 'FALTAN FUNCIONES' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('dashboard_summary', 'report_projects', 'report_projects_by_phase',
                     'report_hours_by_worker', 'report_hours_by_project',
                     'report_materials', 'report_suppliers',
                     'start_backup', 'finish_backup', 'restore_data', 'restore_table');
```

Las cuatro filas deben decir **CORRECTO**.

---

## 5. Desactivar los registros públicos

Esto evita que nadie de fuera pueda crearse una cuenta.

1. Menú izquierdo → **Authentication**.
2. Pestaña **Sign In / Providers** → **Email**.
3. **Desactiva** la opción **Allow new users to sign up**.
4. **Desactiva** también **Confirm email** (no se envían correos: las cuentas
   las crea administración).
5. Pulsa **Save**.

---

## 6. Crear el primer usuario: el administrador

> El **primer** usuario que se cree será automáticamente el **administrador**.
> Los siguientes nacerán como trabajadores. Así nadie puede darse permisos.

1. Menú izquierdo → **Authentication** → **Users**.
2. Pulsa **Add user** → **Create new user**.
3. Rellena:
   - **Email**: `salvi@metalplafer.com`
     *(no es un correo real; es el identificador para entrar como `salvi`)*
   - **Password**: la contraseña que quieras usar, **mínimo 8 caracteres**.
   - Activa **Auto Confirm User**. ← importante, si no, no podrás entrar.
4. Pulsa **Create user**.

**Poner el nombre que se verá en la aplicación:**

5. Ve a **SQL Editor** → **New query**, pega esto (cambiando el nombre si hace
   falta) y pulsa **Run**:

```sql
update public.profiles
   set full_name = 'Salvi'
 where username = 'salvi';
```

6. Comprueba que está todo bien:

```sql
select full_name as nombre, username as usuario, role as rol, active as activo
  from public.profiles;
```

Debe aparecer una fila con **rol = admin**.

---

## 7. Crear un trabajador de prueba

Para comprobar que los permisos funcionan de verdad.

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. **Email**: `juan@metalplafer.com` · **Password**: la que quieras (8+) ·
   **Auto Confirm User** activado.
3. Pulsa **Create user**.
4. En **SQL Editor**, ponle el nombre:

```sql
update public.profiles set full_name = 'Juan Ortega' where username = 'juan';
```

Este usuario nace ya como **trabajador**, no hay que hacer nada más.

---

## 8. Copiar las claves a GitHub

### 8.1 Coger las claves en Supabase

1. Menú izquierdo → **Project Settings** (rueda dentada) → **Data API**.
2. Copia el valor de **Project URL**.
   Es algo así: `https://abcdefghijk.supabase.co`
3. Ve a **Project Settings** → **API Keys**.
4. Copia la clave **`anon` / `public`**. Es un texto muy largo.

> La clave `anon` es **pública a propósito**: solo sirve para identificar al
> proyecto. Quien la tenga no puede ver ningún dato, porque los permisos los
> decide la base de datos usuario por usuario.
>
> ⚠️ En la misma pantalla hay una clave **`service_role`**. **Esa no se copia
> nunca a GitHub ni a ningún sitio.** Es la llave maestra.

### 8.2 Pegarlas en GitHub

1. Abre tu repositorio en GitHub.
2. Pestaña **Settings** (arriba) → menú izquierdo **Secrets and variables** →
   **Actions**.
3. Pulsa la pestaña **Variables** (no «Secrets»).
4. Pulsa **New repository variable** y crea estas, una a una:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | la dirección del paso 8.1.2 |
   | `VITE_SUPABASE_ANON_KEY` | la clave larga del paso 8.1.4 |
   | `VITE_LOGIN_DOMAIN` | `metalplafer.com` |

---

## 9. Publicar la aplicación

1. En tu repositorio: **Settings** → menú izquierdo **Pages**.
2. En **Source**, elige **GitHub Actions**.
3. Ve a la pestaña **Actions** (arriba).
4. Si no hay ninguna publicación en marcha, pulsa **Publicar METALPLAFER360**
   (izquierda) → **Run workflow** → **Run workflow**.
5. Espera 2 o 3 minutos. Cuando aparezca una marca verde ✅, ya está publicada.
6. La dirección es:
   `https://<tu-usuario>.github.io/<nombre-del-repositorio>/`
   También aparece en **Settings → Pages**.

---

## 10. Entrar por primera vez

1. Abre la dirección de la aplicación.
2. **Usuario**: `salvi` · **Contraseña**: la que pusiste en el paso 6.
3. Pulsa **Entrar**.

Deberías ver el panel de administración con el menú de 12 secciones.

**Comprueba también el acceso del trabajador:**

4. Pulsa **Cerrar sesión**.
5. Entra con `juan` y su contraseña.
6. Verás la pantalla del trabajador, con su barra de 5 botones abajo.
7. Prueba a escribir a mano en la barra de direcciones, después de la `#`,
   la ruta `/admin`. **Te devolverá a la pantalla del trabajador**: los permisos
   funcionan.

---

## 11. Instalar la aplicación en el móvil

**Android (Chrome)**
1. Abre la dirección de la aplicación.
2. Menú de tres puntos → **Añadir a pantalla de inicio** → **Instalar**.

**iPhone (Safari)**
1. Abre la dirección de la aplicación.
2. Botón **Compartir** (el cuadrado con la flecha).
3. **Añadir a pantalla de inicio** → **Añadir**.

Queda con su icono, como una aplicación más.
Necesita conexión a Internet para funcionar.

---

## 12. Añadir los logos de Metalplafer

1. En GitHub, entra en la carpeta `public/brand/`.
2. Pulsa **Add file** → **Upload files**.
3. Sube los dos archivos con estos nombres **exactos**:
   - `logo-azul.png`
   - `logo-blanco.png`
4. Pulsa **Commit changes**.

En un par de minutos la aplicación se actualiza sola y los logos aparecen en la
pantalla de acceso, en el menú y en el móvil.

---

## 13. Primeros pasos con la aplicación

**Dar de alta un cliente**
1. Menú **Clientes** → **Nuevo cliente**.
2. Elige **Empresa** o **Particular**, pon el nombre y lo que sepas.
   El CIF/NIF no es obligatorio.
3. Dentro de su ficha puedes añadir **contactos** (por ejemplo, el gerente y
   la persona de administración) y escribirles por WhatsApp.

**Crear un presupuesto, una visita o un aviso**
1. Menú **Fichas** → botón **Nuevo presupuesto** (o cambia de pestaña para
   crear una visita o un aviso).
2. Empieza a escribir el nombre del cliente: si ya existe, la aplicación te
   preguntará **«¿Es alguno de estos clientes?»**. Al elegirlo se rellenan sus
   datos generales. Si es nuevo, sigue escribiendo y se creará al guardar.
3. Rellena el asunto y la descripción y pulsa **Crear**.
4. La ficha recibe su código (`PRES-2026-001`) y nace en **«Por asignar»**.
   En cuanto elijas responsable pasa al estado siguiente.

**Crear un proyecto**
1. Cuando un presupuesto llega a **«Presupuesto aceptado»**, en su pantalla
   aparece el botón **Convertir en proyecto**: hereda cliente, importe y
   dirección, y el presupuesto se conserva tal cual.
2. También puedes crear uno desde cero en **Proyectos → Nuevo proyecto**.
3. Dentro del proyecto verás la línea de las cinco fases. Pulsa una para
   avanzar; siempre se pide confirmación.
4. En cada fase puedes marcar **varios subestados a la vez** (por ejemplo,
   pendiente de planos y pendiente de material).
5. Si el trabajo no lleva montaje, marca **«Sin montaje»** y de Fabricación
   pasará directamente a Facturación.
6. Un proyecto **nunca se finaliza solo**: cuando esté cobrado, la aplicación
   lo sugiere y tú pulsas **Finalizar proyecto**.

**Mandar trabajo al taller o a la obra: las órdenes**
1. Menú **Órdenes de trabajo** → **Nueva orden** (o el botón **Nueva orden**
   dentro del propio proyecto).
2. Elige el proyecto, si es de **Fabricación** o de **Montaje**, la **fecha**
   y escribe el **trabajo a realizar**. La orden lleva solo fecha: el horario
   real lo decide el taller.
3. Marca a **todos los trabajadores** que vayan. No hay responsable principal:
   cada uno apunta sus propias horas.
4. La orden recibe su código (`OT-2026-001`) y nace **Pendiente**.

**Lo que ve el trabajador en el móvil**
1. Entra con su usuario y aterriza en **Inicio**: lo de hoy, lo que viene y
   lo que requiere su atención.
2. Abre la orden del día y escribe el **trabajo realizado** (la descripción de
   administración no se puede tocar), apunta sus **horas** con decimales
   (7,5 son siete horas y media), añade **fotografías** desde la cámara o la
   galería y recoge la **firma del cliente** con el dedo.
3. Pulsa **Enviar a revisión**. Cuando todos los asignados lo hayan enviado,
   la orden pasa a **«Realizada · pendiente de revisión»**.
4. Las órdenes de días futuros las puede **consultar**, pero no rellenar hasta
   su fecha. No existe ningún botón de «iniciar orden» ni se guardan horas de
   entrada y salida.

**Revisar una orden**
1. En **Órdenes de trabajo**, la pestaña **Pendientes de revisión** lleva la
   cuenta. También llega un aviso a la campana de arriba a la derecha.
2. Revisa las horas de cada persona y las fotografías, y pulsa **Validar** o
   **Devolver**.
3. Para devolver hay que escribir el **motivo**: el trabajador lo verá en su
   móvil y queda guardado como comentario y en el historial. La orden vuelve a
   abrirse para que la corrija.

**Anotar material que falta**
1. Menú **Material pendiente** → **Nuevo material**.
2. Elige el proyecto, escribe qué falta y cuántas unidades. Al escribir el
   **proveedor**, la aplicación propone los que ya has utilizado; también
   puedes escribir uno nuevo.
3. Pon la **fecha de pedido** y la **fecha prevista de llegada**. Si esa
   fecha se pasa y el material sigue sin llegar, salta un aviso en la campana.
4. Cuando llegue, marca la casilla **Recibido**. No se pide nada más: quién
   lo marcó y cuándo queda en el historial.
5. No se guarda ni el precio, ni el número de pedido, ni quién lo pidió.

**Lo que comunica el taller**
1. Desde el móvil, en cualquiera de sus órdenes, el trabajador puede pulsar
   **«Avisar de que falta material»** y escribir, por ejemplo, «Faltan 3 bisagras».
2. Eso **no crea material**: entra en **Material pendiente → Avisos del taller**,
   con su contador, y tú decides.
3. **Anotar como material** abre el formulario con lo que él escribió, para que
   pongas proveedor y fechas. **Descartar** permite explicar por qué (por ejemplo,
   «ya está pedido»), y el trabajador lo ve en su móvil.

**El calendario**
1. Menú **Calendario**. Cuatro vistas: **mes, semana, día y agenda**.
2. Los colores son por **tipo de trabajo**: fabricación, montaje, material,
   visita y aviso. Pulsa un color de la leyenda para ocultar o mostrar ese tipo.
3. **Arrastra una orden** a otro día para cambiarle la fecha. El cambio queda
   en el historial y **no se avisa automáticamente al trabajador**: eso se habla
   como se ha hablado siempre.
4. El desplegable **Trabajador** deja ver el calendario de una sola persona.
5. Cada trabajador tiene su propio calendario en el móvil, solo con lo suyo y
   sin poder arrastrar nada.

**Seguir los cobros**
1. Menú **Facturación**. El **total** de cada proyecto es su presupuesto.
2. Pulsa **Cobro** para apuntar lo que se va cobrando (por ejemplo, 2.000 € de
   anticipo). El **pendiente se calcula solo**: total − cobrado.
3. El estado cambia solo: en cuanto hay algo cobrado pasa a **Cobrado
   parcialmente**, y cuando se cubre el total, a **Cobrado**.
4. No se guarda el número de factura: esto es seguimiento interno, no sustituye
   al programa de facturación de la empresa.

**Seguir una ficha**
- En su pantalla puedes cambiar el estado, subir fotografías y documentos,
  escribir comentarios y ver el historial de todo lo ocurrido.
- Nada se borra: las fichas y los clientes se **archivan**, y los documentos
  eliminados van a la **papelera**.

---

## 14. Si algo no funciona

| Qué ves | Qué significa | Qué hacer |
|---|---|---|
| «Falta conectar la aplicación con Supabase» | Las variables de GitHub están vacías o mal escritas | Revisa el paso 8. Deben estar en **Variables**, no en «Secrets». Después, **Actions** → **Run workflow** otra vez. |
| «Usuario o contraseña incorrectos» | El usuario no existe o la contraseña no es esa | Revisa en **Authentication → Users**. Puedes cambiar la contraseña con **⋯ → Reset password**. |
| «Tu usuario no tiene perfil» | El usuario se creó antes de ejecutar el SQL | Bórralo en **Authentication → Users** y créalo otra vez. |
| «Tu usuario está desactivado» | Alguien lo desactivó | En **SQL Editor**: `update public.profiles set active = true where username = 'juan';` |
| «Ya existe un cliente con este CIF/NIF» | Ese CIF ya está en otro cliente | Búscalo en **Clientes**; quizá esté archivado (filtro «Archivados»). |
| El trabajador no ve ninguna orden | No se le ha asignado ninguna, o son de días futuros | En **Órdenes de trabajo → Editar**, marca su casilla. Las futuras se ven, pero no se rellenan hasta su fecha. |
| «Esta orden es del … : todavía no se puede rellenar» | Es de un día posterior a hoy | Es lo correcto: se podrá rellenar ese mismo día. |
| «El estado de la orden se cambia con los botones de revisión» | Se intentó cambiar el estado a mano en la base de datos | Usa **Validar** o **Devolver** en la pantalla de la orden. |
| El aviso de material retrasado no aparece | Ya se avisó hoy de ese material | Solo se avisa una vez al día de cada material. Vuelve a aparecer mañana si sigue sin llegar. |
| Un material no se puede borrar | Nada se borra en la aplicación | Usa el botón de **archivar**: desaparece del listado y conserva su historial. |
| El pendiente de cobro no cuadra | El total sale del presupuesto del proyecto | Corrige el presupuesto en **Proyectos → Editar**; el pendiente se recalcula solo. |
| Entra pero se queda en blanco | La publicación está a medias | **Actions** → mira si hay una marca roja ✗ y vuelve a lanzar **Run workflow**. |
| Error 404 al abrir la dirección | GitHub Pages todavía no está activo | **Settings → Pages** → Source debe ser **GitHub Actions**. |
| «No se ha podido conectar con el servidor» | Sin Internet, o el proyecto de Supabase está en pausa | Comprueba la conexión. Supabase pausa los proyectos gratuitos sin uso: entra en supabase.com y pulsa **Restore project**. |
| «Falta configurar Google Drive» al subir una copia | No están puestos los secretos de Google | Repasa el [paso 15.3](#153-guardar-los-secretos-en-supabase). El botón **GENERAR BACKUP AHORA** funciona igual sin esto. |
| «No se ha podido hablar con el servidor de copias» | Los dos programas del servidor no están publicados | Repasa el [paso 15.4](#154-publicar-los-dos-programas-del-servidor). |
| «Google no ha dado acceso» | La clave privada está mal copiada, o la carpeta no está compartida con la cuenta de servicio | Revisa los pasos [15.2](#152-crear-la-carpeta-en-google-drive-y-compartirla) y [15.3](#153-guardar-los-secretos-en-supabase). La clave se copia entera, con los `\n`. |
| La copia automática no se hace de madrugada | No se ejecutó el archivo 21, o faltan los secretos de la bóveda | Repasa el [paso 15.5](#155-programar-la-copia-diaria) y ejecuta la consulta 25 de `05_verificacion.sql`. |
| «Este archivo no es una copia de seguridad de METALPLAFER360» | Se eligió otro ZIP | Elige el archivo que empieza por `metalplafer360-`. |
| Al restaurar, un trabajador no reaparece | Restaurar nunca crea accesos nuevos | Dale de alta otra vez en **Trabajadores** (apartado 16); sus datos antiguos siguen ahí. |
| El Excel se ve todo en una columna | Excel está configurado en inglés | Abre Excel → **Datos → Desde texto/CSV** y elige el punto y coma como separador. Los informes en `.xlsx` no tienen este problema. |
| El botón de Excel o PDF está gris | Los informes todavía se están cargando | Espera un par de segundos a que aparezcan las tablas. |

**Consultas útiles** (SQL Editor): están todas preparadas y explicadas en el
archivo `supabase/sql/05_verificacion.sql` — ver quién puede entrar, cambiar un
rol, desactivar a alguien o consultar el historial.

---

## 15. Copias de seguridad en Google Drive (opcional)

**Esto se puede dejar para otro día.** Sin hacer nada de este apartado, la
aplicación ya hace copias: en **Configuración → Copias de seguridad** tienes el
botón **GENERAR BACKUP AHORA**, que descarga un ZIP a tu ordenador con todos los
datos. Lo que se configura aquí es que esa copia se haga **sola, todos los días
a las 02:00, y se guarde en Google Drive**.

> ### Lo primero, por seguridad
>
> En este apartado vas a manejar un archivo con una **clave privada de Google**.
> Esa clave **no se pega nunca** en el repositorio de GitHub, ni en el código, ni
> en ningún archivo del proyecto. Solo se pega en la pantalla de secretos de
> Supabase, que es un sitio privado. Si alguna vez tienes dudas sobre si algo es
> un secreto: si parece una contraseña o una clave larguísima, lo es.

### 15.1 Crear la cuenta de servicio en Google

Una «cuenta de servicio» es un usuario de Google que no es una persona: es el
programa que sube las copias.

1. Entra en [console.cloud.google.com](https://console.cloud.google.com) con la
   cuenta de Google de la empresa.
2. Arriba a la izquierda, despliega el selector de proyectos y pulsa
   **New project** (Proyecto nuevo). Llámalo `metalplafer360` y pulsa **Create**.
3. Espera a que el proyecto quede seleccionado (aparece arriba su nombre).
4. En el buscador de arriba escribe **Google Drive API** y ábrela. Pulsa
   **Enable** (Habilitar).
5. En el buscador escribe **Service accounts** (Cuentas de servicio) y ábrelo.
6. Pulsa **Create service account**:
   - *Service account name*: `copias-metalplafer360`
   - Pulsa **Create and continue**, luego **Done** (los pasos de permisos se
     dejan vacíos).
7. Ya aparece en la lista. **Copia su dirección de correo**, que es algo como
   `copias-metalplafer360@metalplafer360.iam.gserviceaccount.com`. La necesitas
   dos veces: guárdala en un bloc de notas.
8. Pulsa sobre ella → pestaña **Keys** (Claves) → **Add key** → **Create new
   key** → formato **JSON** → **Create**.
9. Se descarga un archivo `.json` a tu ordenador. **Ese archivo es la llave de
   la caja fuerte**: no lo subas a ningún sitio y bórralo cuando termines este
   apartado.

### 15.2 Crear la carpeta en Google Drive y compartirla

1. Entra en [drive.google.com](https://drive.google.com) con la cuenta de la
   empresa.
2. Crea una carpeta llamada **METALPLAFER360 · Copias de seguridad**.
3. Ábrela, pulsa el botón **Compartir**.
4. Pega la **dirección de la cuenta de servicio** del paso 15.1.7, dale permiso
   de **Editor** y pulsa **Enviar**. (Si avisa de que no es una dirección de
   correo normal, acéptalo igualmente.)
5. Con la carpeta abierta, mira la dirección del navegador. Al final hay un
   código largo:
   `https://drive.google.com/drive/folders/`**`1a2B3c4D5e6F7g8H9i`**
   Copia ese código: es el **identificador de la carpeta**.

### 15.3 Guardar los secretos en Supabase

1. Abre tu proyecto en [supabase.com](https://supabase.com).
2. Menú de la izquierda → **Edge Functions** → pestaña **Secrets**
   (en algunas versiones: **Project Settings → Edge Functions → Secrets**).
3. Añade estos secretos, uno a uno, con **Add new secret**:

   | Nombre | Valor |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | La dirección de la cuenta de servicio (paso 15.1.7) |
   | `GOOGLE_PRIVATE_KEY` | El valor de `private_key` del archivo `.json` (ver abajo) |
   | `GOOGLE_DRIVE_FOLDER_ID` | El identificador de la carpeta (paso 15.2.5) |
   | `BACKUP_CRON_SECRET` | Una frase larga que te inventes, por ejemplo `copias-metalplafer-2026-xyz` |

   **Cómo sacar `GOOGLE_PRIVATE_KEY`:** abre el archivo `.json` descargado con
   el Bloc de notas. Busca la línea que empieza por `"private_key":` y copia
   **todo lo que hay entre las comillas**, empezando por `-----BEGIN PRIVATE
   KEY-----` y terminando en `-----END PRIVATE KEY-----\n`. Se copia tal cual,
   con los `\n` incluidos: la aplicación ya sabe interpretarlos.

4. Cuando termines, **borra el archivo `.json` de tu ordenador** (y de la
   papelera).

### 15.4 Publicar los dos programas del servidor

Estos programas son los únicos que conocen las claves. Para publicarlos hace
falta instalar la herramienta de Supabase **una sola vez**:

1. Instala [Node.js](https://nodejs.org) si no lo tienes (botón grande «LTS»).
2. Abre la **Terminal** (en Windows: *Símbolo del sistema*) en la carpeta del
   proyecto descargado de GitHub y escribe, una línea cada vez:

```bash
npm install -g supabase
supabase login
supabase link --project-ref TU-REFERENCIA-DE-PROYECTO
supabase functions deploy admin-users
supabase functions deploy backup-drive
```

   La **referencia del proyecto** es el trozo de la dirección de Supabase entre
   `https://` y `.supabase.co` (lo ves en **Project Settings → General →
   Reference ID**).

> Si prefieres no instalar nada: sin estos dos programas, la aplicación sigue
> funcionando entera. Solo dejan de estar disponibles el botón «Subir a Google
> Drive», la copia automática y el alta de trabajadores desde la aplicación
> (los trabajadores se pueden seguir creando a mano en Supabase, como en el
> [apartado 7](#7-crear-un-trabajador-de-prueba)).

### 15.5 Programar la copia diaria

1. En Supabase, menú de la izquierda → **SQL Editor** → **New query**.
2. Pega esto, **cambiando las dos frases** por la dirección de tu proyecto y por
   el mismo `BACKUP_CRON_SECRET` que pusiste en el paso 15.3, y pulsa **Run**:

```sql
select vault.create_secret('https://TU-REFERENCIA.supabase.co', 'm360_project_url');
select vault.create_secret('copias-metalplafer-2026-xyz',       'm360_backup_secret');
```

3. Borra la ventana, pega el contenido de
   `supabase/sql/21_backup_automatico.sql` y pulsa **Run**. Abajo debe aparecer
   un aviso que dice *«Copia automática programada: todos los días a las 02:00
   (hora de Madrid)»*.

### 15.6 Comprobar que funciona

1. Entra en la aplicación como administración.
2. **Configuración → Copias de seguridad → Subir a Google Drive**.
3. En unos segundos debe aparecer una fila nueva en la tabla «Copias hechas»,
   con destino **Google Drive** y estado **Completada**, y el nombre del archivo
   es un enlace que lo abre en Drive.
4. Mira la carpeta de Drive: el ZIP debe estar ahí.

A partir de ese momento, la copia se hace sola cada madrugada. Para comprobar
semanas después que se sigue haciendo, ejecuta la consulta 25 de
`supabase/sql/05_verificacion.sql`.

> **¿Cuánto se guarda?** 30 días, y se puede cambiar en **Configuración →
> Copias de seguridad → Días que se conservan**. Las copias automáticas más
> antiguas se borran solas de Drive; las que te descargues tú no se tocan.

> **¿Qué hay dentro del ZIP?** Un archivo CSV por cada tabla (se abren con
> Excel), un `metadatos.json` con la información necesaria para restaurar, y un
> índice con la referencia de cada foto, vídeo o documento subido. **Las fotos y
> los vídeos no se convierten en CSV**: siguen guardados en Supabase y en el ZIP
> va su ruta.

---

## 16. Dar de alta trabajadores desde la aplicación (opcional)

Si has hecho el [paso 15.4](#154-publicar-los-dos-programas-del-servidor), ya no
hace falta crear a nadie a mano en Supabase:

1. Entra como administración → **Trabajadores** → **Nuevo trabajador**.
2. Escribe el nombre, el usuario (`juan`) y una contraseña.
3. La persona entra con ese usuario y esa contraseña. Nace como **trabajador**;
   para darle permisos de administración, usa el selector de su fila.
4. Para cambiarle la contraseña si la olvida: botón **Contraseña** de su fila.

Nadie se borra nunca: se **desactiva**, y deja de poder entrar conservando todo
su historial.

---

## 17. Restaurar una copia de seguridad

Solo hace falta si se ha perdido o estropeado información.

1. Entra como administración → **Configuración → Copias de seguridad**.
2. **Antes de nada, pulsa «GENERAR BACKUP AHORA»** para tener una copia del
   estado actual, por si acaso.
3. Baja hasta **Restaurar una copia** y pulsa **Elegir archivo de copia**.
   Selecciona el ZIP (el que descargaste o el que te bajes de Google Drive).
4. La aplicación te dice de cuándo es la copia y cuántos registros trae.
5. Marca **qué apartados** quieres restaurar. Puedes traerte solo los clientes,
   solo los proyectos, o todo.
6. Pulsa **Restaurar lo marcado** y confirma en la ventana que aparece.

> ⚠️ **Esta operación puede modificar información actual.** Los datos de la
> copia se vuelcan sobre los de ahora: lo que coincide se actualiza y lo que
> falta se añade. **No se borra nada**, pero lo que se sobrescriba no vuelve.
>
> Restaurar **no crea usuarios nuevos**: si en la copia hay una persona que ya
> no existe en el acceso, sus datos no se recrean. Se le vuelve a dar de alta
> como en el apartado 16.

Toda restauración queda registrada en el historial, con quién la hizo y qué
apartados tocó.

---

## Qué viene después

Ya funciona todo el menú: el acceso y los permisos, los clientes, las fichas
(presupuestos, visitas y avisos), los proyectos con sus fases, las órdenes de
trabajo con el área móvil del trabajador (horas, fotografías, firma, revisión y
validación), el material pendiente con los avisos del taller, el calendario, el
seguimiento de cobros, el panel de inicio, los informes con Excel y PDF, las
copias de seguridad y la configuración.

Para actualizar cuando llegue una fase nueva: subir los archivos a GitHub y
ejecutar en Supabase únicamente los archivos SQL nuevos.
