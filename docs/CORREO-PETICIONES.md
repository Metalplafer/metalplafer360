# Correo de peticiones · `peticiones@metalplafer.com`

Cómo se conecta el correo de peticiones con la bandeja de entrada de
METALPLAFER360, qué hay que configurar y quién configura cada cosa.

> **Lo primero, y lo más importante de este documento.**
>
> La recepción de correo **todavía no está operativa**. El código está
> escrito y probado con correos de prueba, pero `peticiones@metalplafer.com`
> no existe, no hay ninguna cuenta de proveedor abierta y no se ha
> recibido ni un correo de verdad.
>
> No se dará por operativa hasta haber hecho **la prueba 3 del apartado
> 8**: un correo real, con una foto y un PDF, que aparezca en la bandeja
> con sus archivos abribles. Hasta entonces, la sección «Solicitudes» de
> la aplicación funciona —se puede revisar, editar y convertir— pero
> estará vacía porque nada la alimenta.

---

## Índice

1. [Qué hace falta y por qué](#1-qué-hace-falta-y-por-qué)
2. [Las dos maneras de hacerlo, comparadas](#2-las-dos-maneras-de-hacerlo-comparadas)
3. [La solución recomendada](#3-la-solución-recomendada)
4. [Lo que cuesta](#4-lo-que-cuesta)
5. [Qué hace administración en IONOS](#5-qué-hace-administración-en-ionos)
6. [Qué hace Joel: proveedor, DNS y secretos](#6-qué-hace-joel-proveedor-dns-y-secretos)
7. [Qué hay ya en el código](#7-qué-hay-ya-en-el-código)
8. [Las pruebas que faltan](#8-las-pruebas-que-faltan)
9. [Si algo no funciona](#9-si-algo-no-funciona)
10. [Lo que no se ha podido verificar](#10-lo-que-no-se-ha-podido-verificar)

---

## 1. Qué hace falta y por qué

Los clientes mandan por correo lo que necesitan: un texto, fotos de la
obra, un plano en PDF, a veces un vídeo. Hoy administración lee ese
correo y vuelve a escribirlo a mano en la aplicación.

Lo que se quiere es que **cada correo entre solo en la aplicación** como
una ficha provisional, con sus archivos, y que administración solo tenga
que revisarla y decidir si es un presupuesto, una visita o un aviso.

Para eso hacen falta tres cosas:

1. **Una dirección** a la que escriban los clientes:
   `peticiones@metalplafer.com`.
2. **Algo que lea esa dirección** y le pase cada mensaje a
   METALPLAFER360.
3. **Un sitio en la aplicación** donde aparezcan. Esto ya está hecho: es
   la sección «Solicitudes».

Este documento es sobre el punto 2, que es el único que necesita
configuración fuera de la aplicación.

---

## 2. Las dos maneras de hacerlo, comparadas

El encargo pedía evaluar dos caminos y recomendar uno. Son estos.

### Camino A · Que la aplicación lea el buzón por IMAP

Se crea el buzón en IONOS y un proceso del servidor se conecta cada
cierto tiempo, mira si hay correos nuevos, los descarga, los interpreta
y los guarda.

**A favor**

- No hace falta ningún tercero: el correo no sale de IONOS y de
  Supabase.
- Sin coste nuevo: el buzón de IONOS ya está pagado con el dominio.
- La dirección es exactamente `peticiones@metalplafer.com`, sin
  reenvíos ni subdominios.

**En contra, y esto es lo que decide**

- **No hay ningún proceso encendido todo el rato.** Las funciones de
  servidor de Supabase se ejecutan cuando alguien las llama y se apagan;
  no pueden quedarse conectadas al buzón esperando. Habría que
  programarlas para que miren el buzón cada pocos minutos. Se puede
  —METALPLAFER360 ya programa así la copia de seguridad de las 02:00,
  con `pg_cron` y `pg_net`—, pero significa que un correo tarda en
  aparecer lo que tarde el siguiente repaso.
- **Habría que escribir el lector de correo a mano.** Un correo no es un
  texto: es un formato con partes anidadas, con los adjuntos
  codificados, con los acentos del asunto codificados aparte y con el
  mensaje original metido dentro cuando es un reenvío. En el entorno de
  las funciones de Supabase (Deno) no hay una librería madura para esto,
  así que el que lo interpretara sería código nuestro. **Un fallo ahí es
  una petición de un cliente que se pierde o que llega ilegible**, y no
  se nota hasta que alguien pregunta por un presupuesto que nadie hizo.
- **Los límites de la función juegan en contra.** Documentados por
  Supabase: 256 MB de memoria y **2 segundos de CPU** por petición.
  Descodificar un adjunto de 25 MB y, además, interpretar el correo
  entero cabe muy justo en 2 segundos de CPU.
- **La contraseña del buzón es una llave grande.** Guardarla como
  secreto del servidor da acceso a LEER y BORRAR todo el buzón. Si
  alguna vez se filtra, se filtra el buzón.
- Y hay que llevar la cuenta de qué correos ya se han procesado, marcar
  los leídos y no perder ninguno si el repaso falla a medias.

### Camino B · Un proveedor de recepción que avise a la aplicación

Se crea la dirección en IONOS y se **reenvía** a un proveedor
especializado. El proveedor recibe el correo, lo interpreta y llama a una
función de METALPLAFER360 con los datos ya ordenados.

**A favor**

- **El correo lo interpreta quien se dedica a eso.** Los adjuntos, los
  acentos, las partes anidadas y los reenvíos llegan ya separados.
- **Los adjuntos no viajan dentro del aviso.** El proveedor los guarda y
  manda un enlace a cada uno; la función de METALPLAFER360 se los baja
  de uno en uno y los sube al almacén. Así el aviso es pequeño y la
  memoria de la función no se llena, que es exactamente el problema que
  tendría la otra manera.
- **Reintenta solo.** Si la función no responde —porque Supabase estaba
  reiniciando, por ejemplo—, el proveedor vuelve a intentarlo. No se
  pierde el correo.
- **Avisa en el momento**: el correo aparece en la bandeja en segundos,
  no en el siguiente repaso.
- **La llave es pequeña**: una clave de firma que solo sirve para
  comprobar que el aviso viene de él. No da acceso a ningún buzón.
- Trae de serie el resultado de SPF, DKIM y DMARC, que es información
  útil para saber si un correo es de quien dice ser.

**En contra**

- **Cuesta dinero** (ver apartado 4).
- **Un tercero ve los correos** mientras los procesa. Se mitiga eligiendo
  un proveedor con servidores en la Unión Europea.
- Hace falta **un reenvío en IONOS** y **un registro DNS en un
  subdominio**. Son dos cosas, se hacen una vez, y están explicadas paso
  a paso más abajo.

---

## 3. La solución recomendada

> **Recomendación: el camino B, con Mailgun en su región europea.**

Concretamente:

```
El cliente escribe a            peticiones@metalplafer.com
                                        │  (buzón de reenvío en IONOS)
                                        ▼
IONOS lo reenvía a              peticiones@correo.metalplafer.com
                                        │  (subdominio con MX en Mailgun)
                                        ▼
Mailgun lo recibe, lo guarda y llama a
                                supabase.co/functions/v1/mail-inbound
                                        │  (firma comprobada)
                                        ▼
La función crea la solicitud, se baja los adjuntos
y los sube al almacén de Supabase
                                        ▼
Aparece en METALPLAFER360 → Solicitudes
```

**Por qué Mailgun y no otro:**

- Tiene una opción (`store()` con aviso) que **guarda el mensaje y manda
  solo un aviso con los enlaces de los adjuntos**. Es la que evita el
  problema del tamaño: Supabase no documenta cuánto puede pesar una
  petición a una función, y hay casos de fallos con pocos megas, así que
  el diseño que manda las fotos dentro del aviso es un diseño que un día
  falla con el correo de un cliente. Postmark, por ejemplo, manda los
  adjuntos **dentro** del aviso (hasta 35 MB) y **no los guarda para
  después**, así que con él no hay manera de evitarlo.
- Permite **reenviar a una dirección suya** en lugar de obligar a mover
  el correo de toda la empresa.
- Firma los avisos con HMAC-SHA256, que es lo que la función comprueba.
- Tiene **región europea**, que para los datos de clientes españoles es
  lo que corresponde.

**Lo importante de este montaje, en una frase: el correo de la empresa no
se toca.** El registro MX de `metalplafer.com` —el que decide dónde llega
el correo de todos— **se queda exactamente como está, en IONOS**. Lo
único que se añade es un registro en un subdominio nuevo,
`correo.metalplafer.com`, que hoy no existe y que no usa nadie. Si algo
va mal, se borra ese registro y todo vuelve a estar como antes.

### Alternativas que se han considerado y descartado

| Opción | Por qué no |
|---|---|
| **Postmark** | Manda los adjuntos dentro del aviso y no los guarda para recogerlos después. Con fotos y vídeos, es el diseño que falla. |
| **CloudMailin** | Su plan gratuito admite mensajes de **512 KB**: una sola foto de móvil ya no cabe. El plan que admite 10 MB cuesta más que la recomendación. |
| **SendGrid** | Su recepción obliga a apuntar el MX de un dominio; no admite que le reenvíes a una dirección suya. |
| **Cloudflare Email Routing + Worker** | Es **gratis** y técnicamente válido, pero entrega el correo **en bruto**: volveríamos a tener que interpretar el formato del correo nosotros, que es el riesgo que se quería evitar. Además obliga a llevar el DNS del subdominio a Cloudflare. Queda apuntada como la opción a mirar si el coste llega a ser un problema. |
| **Leer el buzón por IMAP** | El camino A del apartado anterior. |

---

## 4. Lo que cuesta

**Esto hay que confirmarlo al abrir la cuenta, y lo digo claramente: los
precios de estos servicios cambian y no he podido abrir la página de
tarifas de Mailgun desde donde he trabajado.** Lo que sé:

- Mailgun tiene un plan de entrada de pago que en 2026 estaba **en torno
  a 35 $/mes** según un comparador externo. No es un dato de la web de
  Mailgun y **hay que verificarlo**.
- Mailgun ha tenido históricamente un nivel gratuito y uno de pago por
  uso. **Para el volumen de Metalplafer —unas decenas de correos al
  mes— puede que el gratuito o el de pago por uso basten.** Es lo
  primero que hay que preguntar o mirar al registrarse.
- IONOS: el reenvío de correo **no cuesta nada aparte**; va con el
  dominio.
- Supabase: la función y el almacenamiento ya están contratados. Los
  adjuntos ocupan sitio en el almacén, que es lo que mide la pantalla de
  Configuración → Almacenamiento.

**Antes de pagar nada**, en Mailgun se puede hacer todo el montaje y
probarlo: lo que hay que comprobar es si el volumen de Metalplafer entra
en el nivel sin coste.

---

## 5. Qué hace administración en IONOS

Dos cosas, por este orden. No hace falta saber nada técnico.

### Paso 1 · Crear la dirección de peticiones

1. Entrar en [ionos.es](https://www.ionos.es) con la cuenta de la
   empresa.
2. **Mis productos → Email y Office** y elegir el paquete de
   `metalplafer.com`.
3. En **Cartera**, al lado de **Reenvío de correo** (*Email Forward*),
   pulsar **Crear**.
4. En **Email**, escribir `peticiones` y elegir el dominio
   `metalplafer.com` en el desplegable.
5. En **Reenviar correos a**, escribir la dirección que te dé Joel. Será
   algo así:

   ```
   peticiones@correo.metalplafer.com
   ```

6. **Guardar**.

> Se crea un **reenvío**, no un buzón. Eso es a propósito: no hay que
> entrar a leerlo, no acumula correo y no tiene contraseña que se pueda
> perder. Lo que llegue se va directo a la aplicación.

### Paso 2 · Decir a los clientes la dirección nueva

Cuando la prueba del apartado 8 esté hecha y Joel confirme que funciona:

- Poner `peticiones@metalplafer.com` en la web, en el pie de los
  correos y en los presupuestos.
- Y lo que más va a usarse al principio: **reenviar a esa dirección** los
  correos que lleguen a `info@` pidiendo cosas. La aplicación distingue
  un reenvío y busca dentro quién lo mandó originalmente; cuando no lo
  encuentra, lo pide en la pantalla en lugar de inventárselo.

---

## 6. Qué hace Joel: proveedor, DNS y secretos

### Paso 1 · Abrir la cuenta en Mailgun

1. Registrarse en [mailgun.com](https://www.mailgun.com).
2. **Elegir la región EU** al crear la cuenta. Esto no se puede cambiar
   después sin volver a empezar.
3. Confirmar en qué plan entra el volumen previsto (apartado 4).

### Paso 2 · Añadir el subdominio

1. En Mailgun: **Sending → Domains → Add New Domain**.
2. Escribir **`correo.metalplafer.com`**. Un subdominio, no el dominio
   de la empresa.
3. Mailgun dará una lista de registros DNS. **De esa lista hace falta
   solo el MX** (dos registros, `mxa.eu.mailgun.org` y
   `mxb.eu.mailgun.org`, o los que indique). Los de envío (SPF, DKIM) no
   hacen falta para recibir, y añadirlos no estorba.

### Paso 3 · Crear el registro DNS en IONOS

En IONOS → **Dominios y SSL** → `metalplafer.com` → **DNS**:

| Tipo | Nombre | Valor | Prioridad |
|------|--------|-------|-----------|
| MX | `correo` | `mxa.eu.mailgun.org` | 10 |
| MX | `correo` | `mxb.eu.mailgun.org` | 10 |

> **Lo que NO hay que tocar, bajo ningún concepto:** los registros MX
> que no tienen nombre o que tienen `@`. Esos son el correo de toda la
> empresa. Si se cambian, deja de llegar el correo a todo el mundo.
> Aquí solo se añaden registros con el nombre `correo`.

Tarda entre unos minutos y un par de horas en funcionar. En Mailgun, el
dominio pasa a verde cuando ya puede recibir.

### Paso 4 · Publicar la función

Desde la carpeta del proyecto, con el Supabase CLI conectado:

```bash
supabase functions deploy mail-inbound --no-verify-jwt
```

> **El `--no-verify-jwt` es imprescindible.** Mailgun no tiene sesión en
> METALPLAFER360 y no puede firmar un token de Supabase. Sin esa opción,
> Supabase rechaza la llamada antes de que la función se ejecute y **los
> correos no entran nunca, sin ningún error visible**. Lo que autentica
> la llamada es la firma de Mailgun, que la función comprueba antes de
> tocar nada.

### Paso 5 · Guardar los secretos

En Supabase → **Edge Functions → Secrets** (o con el CLI):

| Secreto | De dónde se saca |
|---|---|
| `MAIL_SIGNING_KEY` | Mailgun → **Settings → API security → HTTP webhook signing key**. **No es la clave de la API.** |
| `MAIL_API_KEY` | Mailgun → **Settings → API keys**. Sirve para descargar los adjuntos. |
| `MAIL_MAX_MB` | Opcional. Tamaño máximo por adjunto. Si no se pone, 25. |

```bash
supabase secrets set MAIL_SIGNING_KEY="..." MAIL_API_KEY="..."
```

> **Estas claves no van nunca en el repositorio, ni en un archivo
> `.env` que se suba, ni en ninguna variable que empiece por `VITE_`.**
> Todo lo que empieza por `VITE_` se empaqueta dentro de la aplicación y
> cualquiera que abra la web puede leerlo. Los secretos de arriba viven
> solo en Supabase, donde los lee la función del servidor.

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` las pone Supabase sola: no
hay que crearlas.

### Paso 6 · Crear la ruta en Mailgun

1. En Mailgun: **Receiving → Create Route**.
2. **Expression type**: `Match Recipient`.
3. **Recipient**: `peticiones@correo.metalplafer.com`
4. **Actions**: marcar **`Store and notify`** y poner la dirección de la
   función:

   ```
   https://<id-del-proyecto>.supabase.co/functions/v1/mail-inbound
   ```

   (El `<id-del-proyecto>` es el mismo que sale en la URL de Supabase.)
5. **No** marcar `Forward`: no hace falta reenviarlo a ningún sitio más.
6. Guardar.

> Se usa **`Store and notify`** y no `Forward` a propósito: así Mailgun
> guarda el mensaje y manda un aviso pequeño con los enlaces de los
> adjuntos, y la función se los baja de uno en uno. Con la otra opción,
> las fotos viajarían dentro del aviso y un correo con tres fotos de
> móvil podría pasarse del tamaño que acepta la función.

---

## 7. Qué hay ya en el código

Todo esto está escrito y probado, y no necesita configuración:

| Qué | Dónde |
|---|---|
| La función que recibe el aviso del proveedor | `supabase/functions/mail-inbound/index.ts` |
| Lo que hay que averiguar de un correo (firma, reenvíos, nombres de archivo, tamaños) | `supabase/functions/_shared/correo.ts` |
| La tabla de solicitudes, sus permisos y sus funciones | `supabase/sql/61_bandeja_solicitudes.sql` |
| La bandeja y el detalle de una solicitud | `src/pages/admin/InboxList.tsx`, `src/pages/admin/InboxDetail.tsx` |
| Las pruebas de las reglas, contra PostgreSQL de verdad | `tests/sql/99_tests_solicitudes.sql` |
| Las pruebas de la firma y de los reenvíos | `tests/unit/correo.test.ts` |
| Las pruebas de la pantalla | `tests/e2e/mejoras5.mjs` |

**Cambiar de proveedor** más adelante es cambiar **una función**:
`leeDelProveedor`, en `mail-inbound/index.ts`. Todo lo que sabe cómo
viene el aviso de Mailgun está ahí dentro, en unas cuarenta líneas. El
resto —la firma, los reenvíos, los adjuntos, la base de datos— no
depende del proveedor.

---

## 8. Las pruebas que faltan

Ninguna de estas se ha podido hacer, porque hacen falta la dirección y la
cuenta del proveedor. **Hasta que la 3 esté hecha, la recepción no está
operativa.**

### Prueba 1 · El reenvío de IONOS llega a Mailgun

1. Con el MX ya en verde en Mailgun y el reenvío creado en IONOS,
   mandar un correo cualquiera a `peticiones@metalplafer.com` desde un
   móvil.
2. En Mailgun → **Sending → Logs**, tiene que aparecer el mensaje como
   recibido.

**Si no aparece:** el problema está entre IONOS y Mailgun (el reenvío o
el MX), no en la aplicación.

### Prueba 2 · Mailgun llama a la función y la firma cuadra

1. En Supabase → **Edge Functions → mail-inbound → Logs**, tiene que
   haber una llamada.
2. Si pone `firma no válida`, el secreto `MAIL_SIGNING_KEY` no es el que
   corresponde: hay que copiar **la clave de firma de webhooks**, no la
   de la API.
3. Si no hay ninguna llamada y en Mailgun el aviso sale como fallido con
   un 401, la función se publicó **sin** `--no-verify-jwt`.

### Prueba 3 · LA QUE DECIDE · un correo real con adjuntos

1. Mandar a `peticiones@metalplafer.com`, **desde un correo que no sea
   de la empresa**, un mensaje con:
   - un texto de varias líneas,
   - **una foto hecha con el móvil** (3-8 MB es lo normal),
   - **un PDF**.
2. Entrar en METALPLAFER360 → **Solicitudes**.

Tiene que aparecer la solicitud y hay que comprobar, una por una:

- [ ] Sale con su código `SOL-AAAA-###` y «Sin revisar».
- [ ] El remitente es el del cliente, no el de la empresa.
- [ ] El asunto y el cuerpo están completos, con sus acentos.
- [ ] **Los dos archivos aparecen y se pueden abrir y descargar.**
- [ ] La foto se ve como foto (con su miniatura), no como un documento.
- [ ] No aparece marcada «Con error».

### Prueba 4 · Un reenvío de administración

1. Que administración **reenvíe** a `peticiones@metalplafer.com` un
   correo que le haya llegado de un cliente.
2. En la solicitud tiene que verse **quién lo mandó originalmente** y
   **quién lo reenvió**, por separado.
3. Si no se ha podido averiguar el original, la solicitud tiene que
   decirlo y pedirlo. **Lo que no puede hacer es poner a administración
   como cliente.**

### Prueba 5 · Un correo repetido no se duplica

En Mailgun → **Logs**, buscar el mensaje de la prueba 3 y pulsar
**Retry** en el aviso. En la bandeja **no** puede aparecer una segunda
solicitud, y los archivos no pueden duplicarse.

### Prueba 6 · Un adjunto demasiado grande

1. Mandar un correo con un vídeo de más de 25 MB.
2. La solicitud tiene que aparecer **igualmente**, con el cuerpo y el
   remitente, marcada **«Con error»** y diciendo qué archivo no se pudo
   guardar y por qué.
3. Lo que no puede pasar es que el correo no aparezca.

### Prueba 7 · Convertirla

Convertir la solicitud de la prueba 3 en un presupuesto y comprobar que,
en la ficha del presupuesto, aparece el panel **«Documentos de origen»**
con la foto y el PDF, diciendo que los mandó el cliente por correo.

---

## 9. Si algo no funciona

| Lo que pasa | Dónde mirar |
|---|---|
| No llega nada a la bandeja | Prueba 1 y 2 de arriba, en ese orden. El problema casi siempre está antes de la aplicación. |
| En los registros de la función: `firma no válida` | El secreto `MAIL_SIGNING_KEY` no es la clave de firma de webhooks. |
| En los registros: `Función mal configurada` | Falta algún secreto. |
| Mailgun dice 401 y la función no se entera | Se publicó sin `--no-verify-jwt`. |
| La solicitud aparece sin adjuntos y «Con error» | Lo dice el propio aviso de la solicitud: tamaño, tipo no admitido o fallo al descargar. Si es `el proveedor devolvió 401`, falta o está mal `MAIL_API_KEY`. |
| Llegan correos basura | Descartarlos desde la bandeja: no se borran y no molestan. Si se vuelve un problema, en Mailgun se pueden filtrar por remitente antes de que lleguen. |

Los registros de la función **no guardan el contenido de los correos**:
solo el código de la solicitud y qué ha fallado. Eso es a propósito.

---

## 10. Lo que no se ha podido verificar

Para que quede dicho antes de que alguien se lleve una sorpresa:

- **Los precios de Mailgun.** No he podido abrir su página de tarifas
  desde el entorno en el que he trabajado. El dato del apartado 4 es de
  un comparador externo y hay que confirmarlo al registrarse.
- **Si IONOS admite reenviar a una dirección de fuera.** Su documentación
  describe el producto «Reenvío de correo» con un campo para la
  dirección de destino y no dice que tenga que ser de IONOS —es para lo
  que existe—, pero no lo he podido comprobar con una cuenta real. Es la
  primera cosa que se verá al hacer la prueba 1.
- **El tamaño máximo que acepta una función de Supabase.** No está
  documentado. Por eso el diseño elegido no manda los adjuntos dentro
  del aviso: así el límite, sea el que sea, no se alcanza.
- **El tamaño máximo de un mensaje en Mailgun.** No lo he podido
  confirmar. Lo dirá la prueba 6.
- **Nada de la recepción real**: no hay dirección, no hay cuenta y no se
  ha recibido ningún correo. Todo lo que está probado lo está con
  correos de prueba contra una base de datos PostgreSQL de verdad y con
  la pantalla abierta en un navegador de verdad, pero **no con un correo
  que haya viajado por internet**.
