# METALPLAFER360

Aplicación web interna para la gestión operativa de **Metalplafer** (carpintería
metálica, Sabadell): fichas, proyectos, órdenes de trabajo, material, horas,
documentos e historial.

> **Estado: PROYECTO FINALIZADO · las 7 fases completadas.**
> Fase 1: base técnica (acceso, roles, permisos, base de datos, almacenamiento,
> diseño y navegación). Fase 2: clientes, contactos y fichas (presupuestos,
> visitas y avisos). Fase 3: proyectos, fases y subestados, documentos e
> historial. Fase 4: órdenes de trabajo y área móvil del trabajador —horas,
> fotografías, firma, revisión y validación—. Fase 5: material pendiente con
> avisos del taller, calendario con arrastre, notificaciones internas y
> seguimiento de cobros. Fase 6: panel de inicio configurable, informes con
> exportación a Excel y PDF, copias de seguridad a Google Drive, restauración
> total o por apartados, configuración de la empresa y aplicación instalable
> en el móvil. Fase 7: auditoría final de seguridad, base de datos, interfaz y
> rendimiento, con los fallos encontrados corregidos y cubiertos por pruebas,
> datos de ejemplo y manual en PDF. Todos los apartados del menú están construidos.

---

## 1. Qué hay construido

| Área | Estado |
|---|---|
| Acceso con usuario y contraseña (Supabase Auth) | ✅ Funcionando |
| Sesión que se mantiene iniciada | ✅ Funcionando |
| Roles de administración y trabajador | ✅ Funcionando |
| Permisos reales en la base de datos (RLS) | ✅ Funcionando |
| Base de datos PostgreSQL con historial | ✅ Funcionando |
| Almacenamiento privado de archivos | ✅ Creado y protegido |
| Menú de administración (12 secciones) | ✅ Navegación completa |
| Menú del trabajador (5 secciones, móvil) | ✅ Navegación completa |
| Sistema de diseño e identidad visual | ✅ Funcionando |
| Dashboard con datos reales | ✅ Funcionando |
| Clientes: empresas, particulares y contactos | ✅ Funcionando |
| Sugerencia de clientes parecidos | ✅ Funcionando |
| Archivar y desactivar clientes (nunca se borran) | ✅ Funcionando |
| Fichas: presupuestos, visitas y avisos | ✅ Funcionando |
| Numeración anual PRES / VIS / AVI | ✅ Funcionando |
| Documentos y fotografías de las fichas | ✅ Funcionando |
| Comentarios e historial de cada ficha | ✅ Funcionando |
| Proyectos con código PROY anual | ✅ Funcionando |
| Conversión de presupuesto aceptado en proyecto | ✅ Funcionando |
| Cinco fases con varios subestados simultáneos | ✅ Funcionando |
| «Sin montaje»: de Fabricación a Facturación | ✅ Funcionando |
| Finalización siempre a mano, nunca automática | ✅ Funcionando |
| Documentos del proyecto con papelera | ✅ Funcionando |
| Órdenes de trabajo con código OT anual | ✅ Funcionando |
| Fabricación y montaje, solo con fecha | ✅ Funcionando |
| Varios trabajadores por orden, sin responsable principal | ✅ Funcionando |
| Área del trabajador pensada para el móvil | ✅ Funcionando |
| Hoy, próximas y alertas en su pantalla de inicio | ✅ Funcionando |
| «Trabajo realizado» separado de la descripción original | ✅ Funcionando |
| Horas reales con decimales, por persona | ✅ Funcionando |
| Fotografías desde la cámara o la galería | ✅ Funcionando |
| Firma del cliente con el dedo | ✅ Funcionando |
| Revisión: validar o devolver con motivo | ✅ Funcionando |
| Avisos internos (sin correos electrónicos) | ✅ Funcionando |
| Material pendiente con proveedor, fechas y recibido | ✅ Funcionando |
| Proveedor con sugerencias de los ya utilizados | ✅ Funcionando |
| Aviso de material retrasado (una vez al día) | ✅ Funcionando |
| El taller comunica; administración revisa y decide | ✅ Funcionando |
| Calendario de mes, semana, día y agenda | ✅ Funcionando |
| Colores por tipo de trabajo, nunca por persona | ✅ Funcionando |
| Arrastrar una orden para cambiarle la fecha | ✅ Funcionando |
| Filtro por trabajador y calendario propio en el móvil | ✅ Funcionando |
| Campana de avisos internos (sin correos) | ✅ Funcionando |
| Facturación: total − cobrado = pendiente | ✅ Funcionando |
| Cobros parciales con estado automático | ✅ Funcionando |
| Panel de inicio con tarjetas configurables por persona | ✅ Funcionando |
| Periodos: semana, mes, trimestre, año y otras fechas | ✅ Funcionando |
| Informes de proyectos, horas y material | ✅ Funcionando |
| Exportación a Excel con formato profesional | ✅ Funcionando |
| Exportación a PDF con formato profesional | ✅ Funcionando |
| Copia de seguridad manual («GENERAR BACKUP AHORA») | ✅ Funcionando |
| Copia automática diaria a las 02:00 en Google Drive | ✅ Funcionando |
| Se guardan 30 días de copias (configurable) | ✅ Funcionando |
| Restauración completa o por apartados, con aviso y confirmación | ✅ Funcionando |
| Alta de trabajadores y cambio de contraseña | ✅ Funcionando |
| Configuración: empresa, numeración, copias y almacenamiento | ✅ Funcionando |
| Aplicación instalable en el móvil (PWA) | ✅ Funcionando |
| Papelera de documentos, con recuperación | ✅ Funcionando |
| Datos de ejemplo y «Limpiar datos demo» | ✅ Funcionando |
| Publicación automática en GitHub Pages | ✅ Preparada |

---

## 2. Cómo ponerla en marcha

La guía completa, escrita paso a paso y sin dar nada por supuesto, está en:

**[`docs/PUESTA-EN-MARCHA.md`](docs/PUESTA-EN-MARCHA.md)** — guía paso a paso

Y en PDF, pensado para imprimir y para quien no programa:

**[`docs/manual/METALPLAFER360-Manual.pdf`](docs/manual/METALPLAFER360-Manual.pdf)**

Resumen de los pasos:

1. Crear una cuenta y un proyecto en [supabase.com](https://supabase.com).
2. Ejecutar los archivos de `supabase/sql/` **en orden** en el editor SQL de Supabase.
3. Crear el primer usuario (será automáticamente el administrador).
4. Copiar las dos claves de Supabase a las variables de GitHub.
5. Activar GitHub Pages. La aplicación se publica sola.

---

## 3. Arquitectura

```
Navegador (React)  ──►  Supabase
                          ├── Auth ........ usuarios y contraseñas
                          ├── PostgreSQL .. datos + permisos (RLS) + historial
                          ├── Storage ..... documentos, fotos y vídeos (privado)
                          └── Functions ... alta de trabajadores y copia a Drive
                                            (aquí, y solo aquí, viven las claves)
                                                        │
                                                        └──►  Google Drive
                                                              (copias de seguridad)
```

El navegador nunca habla con Google ni maneja ninguna credencial. Cuando
administración pulsa «Subir a Google Drive», la aplicación se lo pide a un
programa que corre dentro de Supabase; ese programa es el único que conoce la
cuenta de Google. La copia que se descarga al ordenador no necesita nada de
eso: la genera el propio navegador con los datos que la base de datos le
permite leer.

**La seguridad no está en la pantalla, está en la base de datos.** Cada consulta
pasa por las políticas de *Row Level Security*: aunque alguien manipule la
aplicación desde el navegador o escriba una dirección a mano, PostgreSQL no le
devuelve ni un solo dato que no le corresponda. Ocultar botones es solo
comodidad visual; el candado real está en el servidor.

### Decisiones y por qué

| Decisión | Motivo |
|---|---|
| **React + TypeScript + Vite** | Estándar, estable, rápido de construir y fácil de mantener. TypeScript avisa de los errores antes de publicar. |
| **Supabase** | Aporta base de datos, usuarios y archivos en un solo servicio, con permisos a nivel de fila. Evita tener que programar y mantener un servidor propio. |
| **Sin secretos en el navegador** | La clave pública (`anon`) solo sirve para identificarse; todo lo sensible lo decide la base de datos. La clave `service_role` nunca sale del servidor. |
| **CSS propio con variables** | Identidad visual específica, sin la estética de plantilla genérica y sin dependencias que envejezcan. |
| **Rutas con `#`** | GitHub Pages sirve archivos estáticos: así funcionan los enlaces directos y recargar la página sin configurar nada. |
| **El primer usuario es el administrador** | Evita que nadie pueda concederse permisos al registrarse. El resto nacen como trabajadores. |

---

## 4. Estructura del proyecto

```
metalplafer360/
├─ src/
│  ├─ auth/              Sesión, roles y control de acceso a las rutas
│  ├─ components/ui/     Piezas reutilizables (avisos, paneles, marca)
│  ├─ config/            Variables de entorno y definición de los menús
│  ├─ hooks/             Utilidades de React (carga de datos, conexión)
│  ├─ layouts/           Estructura de administración y de trabajador
│  ├─ lib/               Supabase, fechas y números en español, errores
│  ├─ pages/             Pantallas (administración y trabajador)
│  ├─ services/          Consultas a Supabase, agrupadas por módulo
│  ├─ styles/            Sistema de diseño (colores, tipografía, componentes)
│  └─ types/             Tipos que reflejan las tablas de la base de datos
├─ supabase/
│  ├─ sql/               TODO el SQL que hay que ejecutar en Supabase
│  └─ functions/         Programas que corren DENTRO de Supabase (ahí viven
│                        las credenciales; nunca en la aplicación ni en GitHub)
├─ tests/
│  ├─ sql/               Pruebas de permisos contra PostgreSQL real
│  ├─ unit/              Fechas, números, Excel, PDF, ZIP y fugas de credenciales
│  └─ e2e/               Pruebas en un navegador real (escritorio y móvil)
├─ public/
│  ├─ brand/             ← aquí van los logos oficiales de Metalplafer
│  └─ icons/             Iconos de la aplicación instalable
├─ docs/
│  ├─ PUESTA-EN-MARCHA.md  Guía paso a paso
│  └─ manual/              Manual en PDF para quien no programa
└─ .github/workflows/    Publicación automática
```

---

## 5. Logos de Metalplafer

Copia los archivos oficiales en `public/brand/` con estos nombres exactos:

```
public/brand/logo-azul.png     → para fondos claros
public/brand/logo-blanco.png   → para fondos oscuros
```

Aparecerán automáticamente en la pantalla de acceso, el menú lateral y la
cabecera del móvil. Mientras no estén, se muestra el nombre en texto como
marcador provisional. **El logo no se redibuja ni se modifica en ningún caso.**

---

## 6. Trabajar en local (opcional)

Solo hace falta si quieres ver los cambios en tu ordenador antes de publicarlos.

```bash
npm install                 # instalar (una sola vez)
cp .env.example .env        # y rellenar las dos claves de Supabase
npm run dev                 # abre http://localhost:5173
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca la aplicación en tu ordenador |
| `npm run build` | Construye la versión que se publica |
| `npm run typecheck` | Busca errores de programación |
| `npm test` | Pruebas de fechas, números y mensajes |
| `npm run test:sql` | Pruebas de permisos contra PostgreSQL |
| `npm run test:e2e` | Prueba la aplicación en un navegador real |
| `npm run test:nav` | Prueba el acceso, los roles y la navegación |
| `npm run test:fase2` | Prueba el recorrido de clientes y fichas |
| `npm run test:fase3` | Prueba el recorrido de proyectos |
| `npm run test:fase4` | Prueba las órdenes y el móvil del trabajador |
| `npm run test:fase5` | Prueba material, calendario y facturación |
| `npm run test:fase6` | Prueba panel, informes, copias, restauración y PWA |
| `npm run test:fase7` | Recorrido completo de principio a fin, seguridad y datos demo |
| `npm run test:all` | Todo lo anterior, de una vez |

Las pruebas de navegador necesitan Chromium la primera vez:
`npx playwright install chromium`. Las de permisos (`test:sql`) necesitan
PostgreSQL 16 instalado en el ordenador. Ninguna hace falta para usar o
publicar la aplicación.

---

## 7. Variables de entorno

Se explican en [`.env.example`](.env.example). Son tres y ninguna es secreta:

| Variable | Para qué sirve |
|---|---|
| `VITE_SUPABASE_URL` | Dirección de tu proyecto de Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública de acceso (la seguridad la aplica RLS) |
| `VITE_LOGIN_DOMAIN` | Dominio interno para entrar solo con el usuario (`juan` → `juan@metalplafer.com`). No se envía ningún correo. |

> ⚠️ La clave **`service_role`** de Supabase, las credenciales de Google y
> cualquier contraseña **no se ponen nunca** en este proyecto ni en GitHub.
> Viven solo dentro de Supabase, como secretos de las funciones del servidor
> (`supabase/functions/`). La aplicación que se publica no las ve jamás, y hay
> una prueba automática que recorre todo el repositorio para asegurarlo
> (`npm test`, apartado «seguridad del repositorio»).

---

## 8. Base de datos

Archivos en `supabase/sql/`, pensados para ejecutarse **en este orden**:

| Archivo | Contenido |
|---|---|
| `01_schema.sql` | Tablas, índices y tipos |
| `02_functions.sql` | Alta automática de perfiles, numeración anual, historial |
| `03_security.sql` | Permisos y políticas RLS |
| `04_storage.sql` | Contenedor privado de archivos y sus políticas |
| `05_verificacion.sql` | Consultas de comprobación y tareas habituales |
| `06_schema_clientes_fichas.sql` | Clientes, contactos, fichas, documentos y comentarios |
| `07_funciones_clientes_fichas.sql` | Códigos por tipo, estados, sugerencias e historial |
| `08_seguridad_clientes_fichas.sql` | Permisos de clientes y fichas |
| `09_schema_proyectos.sql` | Proyectos, subestados y documentos de proyecto |
| `10_funciones_proyectos.sql` | Fases, conversión de presupuestos y finalización |
| `11_seguridad_proyectos.sql` | Permisos de proyectos |
| `12_schema_ordenes.sql` | Órdenes de trabajo, partes de cada trabajador y avisos |
| `13_funciones_ordenes.sql` | Estados de las órdenes, revisión, devolución y notificaciones |
| `14_seguridad_ordenes.sql` | Permisos de las órdenes y del área del trabajador |
| `15_schema_material.sql` | Material pendiente, avisos del taller y cobros |
| `16_funciones_material.sql` | Proveedores, retrasos, calendario y cálculo de cobros |
| `17_seguridad_material.sql` | Permisos de material y facturación |
| `18_schema_informes.sql` | Registro de copias de seguridad y uso del almacenamiento |
| `19_funciones_informes.sql` | Panel de inicio, informes, copias y restauración |
| `20_seguridad_informes.sql` | Permisos de informes, copias y restauración |
| `21_backup_automatico.sql` | Copia diaria a las 02:00 (opcional, solo en Supabase) |
| `22_correcciones_auditoria.sql` | Correcciones de la auditoría final: seguridad, integridad e índices |
| `23_datos_demo.sql` | Datos de ejemplo y su limpieza (opcional) |

Tablas creadas hasta ahora:

- **`profiles`** — quién es cada persona y qué rol tiene.
- **`app_settings`** — datos de empresa y límites.
- **`code_counters`** — numeración anual segura (`PRES-2026-001`).
- **`audit_log`** — historial de acciones. No se puede modificar ni borrar.
- **`clients`** y **`client_contacts`** — clientes y sus personas de contacto.
- **`fichas`** — presupuestos, visitas y avisos.
- **`projects`** — proyectos, con su fase y su estado de facturación.
- **`project_substatuses`** — varios subestados a la vez por proyecto.
- **`work_orders`** — órdenes de fabricación y montaje (`OT-2026-001`).
- **`work_order_workers`** — el parte de cada trabajador: qué hizo y cuántas horas.
- **`notifications`** — avisos internos. Nunca se envía ningún correo electrónico.
- **`materials`** — material pendiente. Sin precio, sin número de pedido y sin solicitante.
- **`material_requests`** — lo que comunica el taller. Nunca se convierte solo en material.
- **`payments`** — cobros parciales. Sin número de factura.
- **`documents`** — archivos de fichas, proyectos y órdenes, con papelera.
- **`comments`** — comentarios de texto de fichas, proyectos y órdenes.
- **`backups`** — qué copia se hizo, cuándo, con cuántas filas y dónde quedó.

Los datos son accesibles y modificables directamente desde el editor SQL de
Supabase: la aplicación no es el único camino para trabajar con ellos.

---

## 9. Seguridad

La seguridad **no está en la pantalla**: está en la base de datos. Cada consulta pasa
por las políticas de *Row Level Security* de PostgreSQL, que deciden qué puede ver y
tocar cada persona según quién ha iniciado sesión. Ocultar botones es comodidad visual;
el candado real está en el servidor.

| Quién | Qué alcanza |
|---|---|
| Administración | Todo |
| Trabajador | Solo sus órdenes, los proyectos y clientes de esas órdenes, sus horas, sus avisos y su historial |
| Trabajador | **Nunca**: informes, configuración, facturación, cobros, copias de seguridad, numeración ni datos de otros compañeros |

Lo que la auditoría final dejó cerrado:

- **Nadie con sesión puede vaciar una tabla.** `TRUNCATE` se salta las políticas RLS,
  así que está revocado en todas las tablas y vigilado además con disparadores en el
  historial y en los documentos.
- **El historial es inmutable**, también frente a la clave de servidor.
- **Borrar a una persona en Supabase se rechaza** si tiene horas apuntadas: a la gente
  se la desactiva, no se la borra.
- **Los códigos no se pueden reescribir** una vez emitidos: identifican el expediente en
  presupuestos y facturas de papel.
- **El único borrado abierto** a la aplicación es vaciar la papelera de documentos, y
  pasa por una política que exige ser administración y que el archivo ya esté dentro.
- **Ninguna credencial vive en el repositorio.** Las claves de Google y la clave
  `service_role` solo existen como secretos dentro de Supabase, y hay una prueba
  automática que recorre todo el proyecto buscando fugas.

---

## 10. Mantenimiento

- **Actualizar la aplicación**: subir los cambios a la rama principal de GitHub.
  Se construye y publica sola en un par de minutos.
- **Cambiar el rol de alguien o desactivar a un usuario**: consultas preparadas
  en `supabase/sql/05_verificacion.sql`.
- **Cambiar colores o tipografía**: `src/styles/tokens.css`.
- **Cambiar los textos de los menús**: `src/config/navigation.ts`.
- **Datos de ejemplo**: Configuración → Aplicación → «Poner datos de ejemplo».
  «Limpiar datos demo» borra exactamente lo de ejemplo y nada más.
- **Copia de seguridad a mano**: Configuración → Copias de seguridad →
  «GENERAR BACKUP AHORA». Se descarga un ZIP con un CSV por tabla.
- **Comprobar que la copia automática se hace**: consulta 25 de
  `supabase/sql/05_verificacion.sql`.
- **Restaurar**: Configuración → Copias de seguridad → «Elegir archivo de
  copia». Se puede restaurar todo o solo algunos apartados. Nunca borra nada:
  lo que coincide se actualiza y lo que falta se añade. Queda en el historial.
