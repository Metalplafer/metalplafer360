-- =====================================================================
-- METALPLAFER360 · EL COLOR DE CADA OBRA
--
-- MEJORA 1 · Una obra agrupa varios proyectos, y en el listado de
-- proyectos no hay forma rápida de ver cuáles son de la misma obra: hay
-- que leer la columna de la obra fila por fila. Con un color en la
-- pastilla del código —«PROY-2026-014»— se ve de un vistazo.
--
--
-- UNA COLUMNA, Y LA MISMA REGLA QUE YA SE USA PARA EL CALENDARIO
--
-- El proyecto ya tiene una manera de guardar colores: «#rrggbb» en
-- minúsculas o mayúsculas, validado con la misma expresión que usa
-- «valid_calendar_colors» (archivo 60). Aquí se repite esa regla en vez
-- de inventar otra, para que el selector del navegador y la base de
-- datos sigan hablando del mismo formato.
--
-- NULO significa «sin color», y es lo que tienen todas las obras de hoy:
-- la pastilla se queda con el estilo neutro de siempre. No se reparten
-- colores automáticamente —sería inventarse una decisión de alguien— y
-- no se migra ni una fila.
--
--
-- POR QUÉ NO VA EN «app_settings» COMO LOS DEL CALENDARIO
--
-- Los del calendario son SIETE, fijos, uno por categoría, y por eso
-- caben en un jsonb de la configuración. Los de las obras son uno por
-- obra, y las obras se crean y se archivan constantemente: guardarlos en
-- la configuración obligaría a limpiar a mano las entradas de las obras
-- que ya no están. En su tabla se borra solo con la obra.
--
--
-- QUIÉN PUEDE CAMBIARLO
--
-- Nadie nuevo. La tabla «works» ya es de administración —«works_update»
-- con «is_admin()», archivo 31— y una columna más no cambia eso. No se
-- toca ninguna política.
--
-- MIGRACIÓN ESTRUCTURAL: una columna que nace vacía y una restricción.
-- Ni una fila modificada.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) EL COLOR
-- ---------------------------------------------------------------------
alter table public.works
  add column if not exists color text;

comment on column public.works.color is
  'Color de la obra en «#rrggbb», para identificar sus proyectos de un vistazo. Vacío = sin color, y entonces la pastilla se ve como siempre.';


-- ---------------------------------------------------------------------
-- 2) QUE SEA UN COLOR DE VERDAD
--
-- Sin esto, cualquier texto entraría en la columna y acabaría en un
-- «style» del navegador, que es la puerta por la que se cuelan cosas que
-- no son colores. La expresión es la misma del archivo 60.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'works_color_valido') then
    alter table public.works
      add constraint works_color_valido
      check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;

comment on constraint works_color_valido on public.works is
  'El color de una obra es «#rrggbb» o nada. Ni nombres de color, ni rgb(), ni texto suelto.';


-- ---------------------------------------------------------------------
-- 3) PONERLE COLOR A UNA OBRA
--
-- Una función propia, y NO un parámetro más en «save_work», por dos
-- razones:
--
--   · «save_work» tiene hoy seis parámetros y la llama el formulario de
--     alta. Añadirle uno más no es «create or replace»: en PostgreSQL
--     una lista de parámetros distinta crea una función NUEVA, y las dos
--     convivirían dejando ambigua cualquier llamada con seis argumentos;
--
--   · es el patrón que ya sigue esta tabla. El periodo del calendario de
--     la obra tiene «set_work_dates» (archivo 34) y el proyecto tiene
--     «set_project_work», cada uno con su función pequeña. Esto es lo
--     mismo.
--
-- Acepta NULO para quitar el color y dejar la pastilla como estaba.
-- ---------------------------------------------------------------------
create or replace function public.set_work_color(p_work uuid, p_color text default null)
returns public.works language plpgsql security definer set search_path = public as $$
declare w public.works; v_antes text; v_color text;
begin
  perform public.assert_admin();

  -- Se admite lo que escribe una persona —con espacios, en mayúsculas—
  -- y se guarda siempre igual: en minúsculas y sin espacios. Así dos
  -- obras con el mismo color se guardan con el mismo texto.
  v_color := nullif(lower(trim(coalesce(p_color, ''))), '');

  if v_color is not null and v_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'El color de una obra se escribe como «#rrggbb», por ejemplo «#2e7d5b»'
      using errcode = '22023';
  end if;

  select * into w from public.works where id = p_work for update;
  if not found then
    raise exception 'No se encuentra la obra' using errcode = 'P0002';
  end if;

  v_antes := w.color;

  -- Si no cambia nada, no se escribe: así no queda una línea en el
  -- historial de la obra cada vez que alguien abre el selector y lo
  -- cierra sin tocarlo.
  if v_antes is not distinct from v_color then
    return w;
  end if;

  update public.works
     set color = v_color, updated_at = now()
   where id = p_work
  returning * into w;

  -- AQUÍ NO SE LLAMA A «log_event» A PROPÓSITO. La tabla «works» tiene
  -- su propio disparador de auditoría —«zz_audit», archivo 31, línea
  -- 716— que registra cada «update» con su autor y el detalle de lo que
  -- cambió. Escribirlo también a mano dejaría DOS líneas por cada cambio
  -- de color en el historial de la obra.
  return w;
end $$;

comment on function public.set_work_color(uuid, text) is
  'Pone o quita el color de una obra. Solo administración. Nulo o vacío deja la obra sin color.';

grant  execute on function public.set_work_color(uuid, text) to authenticated;
revoke execute on function public.set_work_color(uuid, text) from anon, public;


-- ---------------------------------------------------------------------
-- 4) COMPROBAR QUE QUEDÓ BIEN
-- ---------------------------------------------------------------------
-- select code, name, coalesce(color, '—') as color from public.works order by code;
