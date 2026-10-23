-- =====================================================================
-- METALPLAFER360 · MATERIAL PREPARADO Y CARGADO
--
-- MEJORA 3 · Administración y los operarios necesitan marcar, en el
-- propio proyecto, qué material está ya preparado y cargado para
-- llevárselo a la obra. Y necesitan NO poder marcar lo que todavía está
-- de camino, porque entonces la lista no sirve para nada.
--
--
-- EL COMENTARIO DEL MATERIAL NO HACE FALTA TOCARLO
--
-- El encargo decía: «no asumas que el comentario debe guardarse en una
-- columna nueva; comprueba si existe ya un campo adecuado». Existe:
-- «materials.notes», desde el archivo 15. Y se guarda bien —el servicio
-- lo manda al crear y al editar, y la pantalla de Material lo enseña—,
-- así que NO se añade ninguna columna y NO se cambia nada de la base de
-- datos por esto.
--
-- El fallo estaba en una sola pantalla: el panel «Material» del detalle
-- del proyecto pintaba unidades, nombre, proveedor, fecha prevista y
-- estado, y no pintaba «notes». Quien anotaba un material de almacén
-- desde allí escribía el comentario, volvía al proyecto y no lo veía. Se
-- arregla en la pantalla, que es donde está el fallo.
--
--
-- UNA COLUMNA, Y LA REGLA EN LA BASE DE DATOS
--
-- «prepared» por defecto en falso: nada de lo que ya existe se da por
-- preparado. Añadir una columna con valor por defecto en PostgreSQL 11 y
-- posteriores es un cambio de catálogo, no de datos: no se reescribe ni
-- una fila.
--
-- Y la regla de cuándo se puede marcar NO se queda solo en la pantalla.
-- El encargo lo pide con estas palabras: «no basta con ocultar el botón:
-- el estado debe validarse de forma coherente en la lógica de
-- aplicación y, si el modelo de permisos lo permite, en el backend». La
-- validación más fuerte que admite esta tabla es una restricción
-- «check», que mira la propia fila y no se puede saltar ni desde
-- PostgREST ni desde la consola:
--
--   se puede preparar si es de almacén, o si está recibido.
--
-- Lo que la restricción NO puede hacer es decidir qué pasa cuando
-- alguien desmarca «recibido» de algo ya preparado: ahí rechazaría la
-- corrección con un error que no explica nada. Eso lo resuelve el
-- disparador, limpiando la marca. Las dos piezas se reparten el trabajo:
-- la restricción impide el estado imposible, el disparador deshace el
-- que se queda a medias.
--
--
-- LO QUE ESTO NO ES
--
-- No es inventario. No hay existencias, no hay movimientos, no se
-- descuenta nada de ningún sitio y no se crea ninguna tabla «para más
-- adelante». Marcar preparado tampoco toca «received» ni el pedido al
-- proveedor: son tres cosas distintas y se quedan distintas.
--
-- Tampoco se guarda quién lo marcó ni cuándo, por lo mismo que
-- «received» no lo guarda (archivo 15): eso ya queda en el historial
-- general de la aplicación, que registra cada cambio con su autor.
--
-- MIGRACIÓN ESTRUCTURAL: una columna con valor por defecto, una
-- restricción y el disparador que ya existía con una regla más. Todas
-- las filas actuales cumplen la restricción, porque nacen sin preparar.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) PREPARADO Y CARGADO
-- ---------------------------------------------------------------------
alter table public.materials
  add column if not exists prepared boolean not null default false;

comment on column public.materials.prepared is
  'Si el material está preparado y cargado para llevarlo a la obra. No es inventario: no descuenta existencias ni cambia el estado del pedido.';


-- ---------------------------------------------------------------------
-- 2) SOLO SE PREPARA LO QUE ESTÁ EN EL TALLER
--
-- Las dos condiciones del encargo, dichas en una línea:
--
--   · el material procede del almacén y no hay que pedírselo a nadie;
--   · o se pidió y consta como recibido.
--
-- Si está pedido y pendiente de recepción, no se puede marcar. Y no es
-- «el botón sale apagado»: es que la base de datos no lo admite.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'materials_preparado_valido') then
    alter table public.materials
      add constraint materials_preparado_valido
      check (not prepared or origin = 'almacen' or received);
  end if;
end $$;

comment on constraint materials_preparado_valido on public.materials is
  'Solo se prepara lo que está en el taller: el material de almacén, o el pedido que ya ha llegado. Lo que está de camino, no.';


-- ---------------------------------------------------------------------
-- 3) SI DEJA DE ESTAR RECIBIDO, DEJA DE ESTAR PREPARADO
--
-- El MISMO disparador del archivo 16, letra por letra, con una regla
-- añadida al final. Se ha generado a partir de esa definición —que es la
-- única que hay: ningún archivo posterior lo redefine— y se ha
-- comprobado con «diff» que lo único que cambia es la regla nueva.
--
-- La rama del INSERT sale antes y no se toca: un material que NACIERA
-- marcado como preparado sin estar disponible es un error de
-- programación, no una corrección de nadie, y ahí tiene que saltar la
-- restricción.
-- ---------------------------------------------------------------------
create or replace function public.trg_materials_before() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;

  if TG_OP = 'INSERT' then
    new.late_notified_on := null;
    return new;
  end if;

  if new.received and not old.received then
    -- Recibido: deja de estar pendiente y deja de avisar.
    new.late_notified_on := null;
  end if;

  if new.expected_on is distinct from old.expected_on then
    new.late_notified_on := null;
  end if;

  -- MEJORA 3 · SI DEJA DE ESTAR DISPONIBLE, DEJA DE ESTAR PREPARADO.
  --
  -- Lo que se puede preparar es lo que está en el taller: lo de almacén,
  -- o lo que se pidió y YA LLEGÓ.
  --
  -- Aquí hay DOS situaciones distintas que no se pueden tratar igual, y
  -- la diferencia está en cómo estaba el material ANTES:
  --
  --   · ESTABA preparado y ahora deja de estar disponible. Es lo que
  --     pasa cuando alguien desmarca «recibido» porque se equivocó al
  --     marcarlo: una corrección legítima y frecuente. Si se rechazara,
  --     la persona no podría deshacer su error, y encima con un mensaje
  --     que no explica nada. Así que se limpia la marca y la corrección
  --     entra;
  --
  --   · NO estaba preparado y se intenta marcar algo que está de camino.
  --     Eso es justo lo que el encargo prohíbe, y NO se arregla en
  --     silencio: se deja pasar hasta la restricción
  --     «materials_preparado_valido», que lo rechaza con un error. Si se
  --     limpiara aquí, quien llamara a la API recibiría un «correcto»
  --     habiendo pasado por alto su petición, que es peor que un error.
  --
  -- La primera versión de esto limpiaba la marca en los dos casos, y la
  -- prueba «El que está de camino NO se puede marcar» lo cazó: esperaba
  -- el error 23514 y la escritura pasaba sin más.
  --
  -- La flecha va SOLO en este sentido: preparar o despreparar no toca
  -- nunca «received» ni el pedido al proveedor.
  if old.prepared and new.prepared and not (new.origin = 'almacen' or new.received) then
    new.prepared := false;
  end if;

  return new;
end $$;

-- El disparador no se vuelve a crear: sigue siendo el mismo, apuntando a
-- la misma función, que es lo que se ha reemplazado.


-- ---------------------------------------------------------------------
-- 4) BUSCAR LO QUE FALTA POR PREPARAR
--
-- La pantalla del proyecto pregunta «¿qué queda por cargar?», así que el
-- índice es por proyecto y por la marca, dejando fuera lo archivado.
-- ---------------------------------------------------------------------
create index if not exists materials_prepared_idx
  on public.materials (project_id, prepared) where archived_at is null;


-- ---------------------------------------------------------------------
-- 5) LOS CONTADORES DEL PROYECTO CUENTAN TAMBIÉN LO PREPARADO
--
-- «project_materials» es lo que la ficha del proyecto enseña arriba. Sin
-- esto habría que contar las filas en el navegador, que es justo lo que
-- esta vista existe para evitar.
--
-- Generada a partir de la DEFINICIÓN VIVA, que es la del archivo 15 (se
-- comprobó: ningún archivo posterior la redefine, y se leyó también de
-- la base de datos con «pg_get_viewdef»). Lo único que cambia es que se
-- añaden DOS columnas AL FINAL, que es lo único que «create or replace
-- view» permite. Las tres de siempre se quedan donde estaban.
--
-- El cuerpo NO se toca en nada más. En particular se conserva
-- «security_invoker = true» y se conserva el que NO haya filtro por
-- «project_id is not null»: el material de taller forma un grupo con
-- «project_id» vacío, y quitarlo ahora cambiaría lo que devuelve la
-- vista a quien ya la consulta.
-- ---------------------------------------------------------------------
create or replace view public.project_materials with (security_invoker = true) as
  select m.project_id,
         count(*)                                                  as total,
         count(*) filter (where not m.received)                    as pendientes,
         count(*) filter (where not m.received
                            and m.expected_on < public.today_madrid()) as retrasados,
         -- MEJORA 3 · Lo que ya está cargado, y lo que se puede cargar
         -- pero todavía no lo está.
         count(*) filter (where m.prepared)                        as preparados,
         count(*) filter (where not m.prepared
                            and (m.origin = 'almacen' or m.received)) as por_preparar
    from public.materials m
   where m.archived_at is null
   group by m.project_id;

comment on view public.project_materials is
  'Contadores de material de cada proyecto: total, pendientes de llegar, retrasados, preparados y los que ya se pueden preparar.';
