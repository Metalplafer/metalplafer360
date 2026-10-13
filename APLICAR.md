# METALPLAFER360 · Cómo aplicar este conjunto de cambios

Fases 1 a 4 del encargo de correcciones, en un solo paquete. Se publica
**una sola vez**, al final.

Nada de lo que hay aquí se ha ejecutado contra tu Supabase ni se ha
publicado. No hay commits ni despliegues.

---

## 1 · Los scripts SQL, en este orden

Son **tres**, y van en orden porque el 36 cuenta con las columnas que
añade el 35 y con la vista que rehace el 34.

| Orden | Archivo | Qué hace |
|---|---|---|
| 1.º | `supabase/sql/34_fechas_a_mano.sql` | Editar a mano las fechas de fabricación y montaje, y el periodo propio de una obra. |
| 2.º | `supabase/sql/35_archivos_trabajador.sql` | Que el trabajador pueda subir archivos a sus proyectos y quitar solo los suyos. |
| 3.º | `supabase/sql/36_clientes_obras_costes.sql` | Pantalla de clientes con su resumen económico, costes extra facturables y documentación de obras. |

**Antes de pegar cada uno:** quita la línea

```
\set ON_ERROR_STOP on
```

Es una instrucción de `psql` y el editor SQL de Supabase no la entiende.
Es la única línea que hay que tocar, y está al principio de cada
archivo.

Los tres son **idempotentes**: se pueden ejecutar varias veces sin hacer
daño.

### No dependen de los scripts 32 y 33

Si todavía tienes pendientes `32_trabajador_avisos_material.sql` y
`33_revision_permisos.sql`, **estos tres se pueden aplicar igualmente**.
Está comprobado: se instalaron sobre una base con los scripts 01 a 31
solamente, sin el 32 ni el 33, y los tres funcionan y crean todos sus
objetos.

El orden entre unos y otros da igual. Si aplicas también el 32 y el 33,
hazlo como se dijo en su momento (el 33 tiene un corte en dos partes
para no dejar la aplicación publicada sin permisos durante un rato).

---

## 2 · Comprobación previa: ¿hay órdenes de trabajo abiertas?

**Esto hay que mirarlo ANTES de publicar.** La FASE 4 retira la sección
«Órdenes de trabajo» del perfil de administrador, incluidas sus
direcciones. Las órdenes **no se borran** y siguen viéndose como
histórico en la ficha de su proyecto, pero administración ya no tendrá
una pantalla para **validar o devolver** una orden.

Si queda alguna orden enviada y sin validar, ciérrala antes. Para
saberlo, ejecuta esta consulta (solo lee, no cambia nada):

```sql
select code,
       status,
       scheduled_date,
       submitted_at
  from public.work_orders
 where archived_at is null
   and status in ('pendiente', 'en_curso', 'realizada', 'devuelta')
 order by scheduled_date;
```

- **Cero filas** → adelante, no hay nada pendiente.
- **Alguna fila con `status = 'realizada'`** → es una orden esperando
  que la valides. Valídala o devuélvela **antes** de publicar.
- **`pendiente` / `en_curso` / `devuelta`** → son del trabajador. Puede
  terminarlas: su parte de la aplicación sigue funcionando igual. Lo que
  no podrás hacer después es validarlas desde administración.

Si prefieres no cerrarlas ahora, dímelo y dejo una pantalla de revisión
mínima, solo para las órdenes que ya existen.

---

## 3 · Publicar el frontend

Una sola vez, después del SQL:

```bash
npm install          # no hay dependencias nuevas, pero no estorba
npm run typecheck
npm test
npm run build
```

Y publicar `dist/` como lo haces siempre.

**El orden importa:** primero el SQL, después el frontend. Las pantallas
nuevas llaman a funciones y vistas que crean estos tres scripts; si se
publica antes, la ficha de proyecto, la de obra y la de clientes darían
error hasta que se ejecutara el SQL.

Al contrario no pasa nada: aplicar el SQL y publicar más tarde deja la
aplicación funcionando como hasta ahora.

---

## 4 · Qué comprobar a mano, ya en producción

Con el administrador:

1. **Calendario.** En un proyecto con fabricación **y** montaje
   planificados, arrastra la fabricación a otro día y comprueba que el
   montaje **no se mueve**. Después al revés. Y arrastra el **día 3** de
   un tramo de varios días: tiene que moverse.
2. **Fechas a mano.** En la ficha del proyecto, «Editar fechas» en cada
   fase. Guarda, recarga la página y comprueba que se mantienen.
3. **Obra.** Pon un periodo propio, míralo en el calendario, y después
   déjalo en blanco para que vuelva a seguir a sus proyectos.
4. **Comentarios.** Escribe uno en un proyecto. Era lo que daba «error
   inesperado».
5. **Clientes.** Abre la pestaña: tiene que cargar y mostrar las cuatro
   columnas económicas. Cuadra las cifras de un cliente que conozcas
   bien contra lo que tengas apuntado.
6. **Costes extra.** Crea uno escribiendo el importe **letra a letra**:
   el cursor ya no debe saltar. Márcalo como facturado y comprueba que
   suma al facturado de la obra.
7. **Documentación de la obra.** Sube un archivo a la obra y comprueba
   que también se ven los de sus proyectos, con su etiqueta de origen.
8. **Proyecto desde una obra.** «Nuevo proyecto» desde la ficha de la
   obra: el cliente tiene que venir relleno, y al guardar **no** debe
   aparecer un cliente duplicado en la lista de clientes.
9. **Menú.** «Órdenes de trabajo» ya no está.

Con el móvil de un trabajador:

10. **Subir archivos** a un proyecto suyo: fotos, vídeos y documentos.
11. **Quitar** uno suyo: se puede. En uno de otra persona **no debe
    salir** el botón de la papelera.
12. **Vídeos del parte:** sube un vídeo a un parte y reprodúcelo. Era lo
    que no funcionaba.
13. Que **no** aparezca nada administrativo ni ningún importe.

---

## 5 · Lo que no se ha tocado

- Ninguna tabla ni registro se ha borrado.
- No se ha desactivado ningún RLS ni ninguna política para resolver nada.
- Las órdenes de trabajo siguen en la base de datos.
- La zona del trabajador para órdenes sigue funcionando, para que una
  orden a medias se pueda terminar.
- `admin-users` no se ha modificado.
- Ningún secreto, clave ni credencial entra en el repositorio ni en el
  frontend.
