-- =====================================================================
-- METALPLAFER360 · EL COLOR DE CADA CATEGORÍA DEL CALENDARIO
--
-- MEJORA 4.2 · Poder elegir en Configuración el color de cada tipo de
-- evento, y que lo vean TODOS: si cada navegador se guardara el suyo,
-- dos personas hablando por teléfono sobre «lo verde de la semana que
-- viene» estarían mirando dos cosas distintas.
--
--
-- DÓNDE SE GUARDA: DONDE YA SE GUARDA LO COMPARTIDO
--
-- Se mira primero cómo guarda hoy la aplicación sus ajustes, que es lo
-- que se pidió, y hay DOS sitios con dos propósitos distintos:
--
--   · «profiles.preferences» (jsonb) · las preferencias DE CADA
--     PERSONA, que se escriben con «set_preferences». Ahí no van: el
--     color tiene que ser el mismo para todos;
--   · «app_settings» · la fila única (id = 1) con los ajustes de la
--     empresa: los datos fiscales, el tamaño máximo de archivo, la
--     configuración de copias, las cuotas de almacenamiento. Ahí sí.
--
-- Y se sigue el patrón que ya usan «backup» (archivo 18) y las cuotas
-- (archivo 41): una columna jsonb con valor por defecto, su función para
-- escribirla y nada más. No hace falta una tabla de colores: son siete
-- valores que se leen juntos y se escriben juntos.
--
-- Nada de «localStorage»: el encargo lo dice expresamente, y además la
-- aplicación ya tiene dónde.
--
--
-- POR QUÉ UN OBJETO VACÍO POR DEFECTO Y NO LOS SIETE COLORES ESCRITOS
--
-- Porque entonces habría DOS fuentes para el color de siempre: esta
-- columna y los tokens del diseño. El día que se cambiara la paleta, las
-- instalaciones viejas se quedarían con los colores antiguos escritos en
-- la base de datos sin que nadie se enterara.
--
-- Vacío significa «los de siempre». La pantalla solo guarda aquí lo que
-- alguien ha cambiado a mano, y quitar un color es borrar su clave.
--
--
-- LO QUE SE ADMITE, COMPROBADO POR LA BASE DE DATOS
--
-- Las claves tienen que ser categorías que EXISTEN, y los valores,
-- colores de verdad en formato «#rrggbb». No se comprueba solo en la
-- pantalla: una restricción «check» con una función inmutable, que es
-- como la aplicación comprueba ya los estados de las fichas
-- («valid_ficha_status», archivo 06) y los subestados de los proyectos
-- («valid_substatus», archivo 09).
--
-- LAS CATEGORÍAS SON LAS QUE HAY, no una lista inventada: son las siete
-- que devuelve «v_calendar» en su columna «kind» (archivos 30, 31 y 32):
-- obra, fabricacion, montaje, material, visita, aviso y otro. No se crea
-- ninguna categoría nueva.
--
-- MIGRACIÓN ESTRUCTURAL: una columna jsonb con valor por defecto, una
-- función inmutable, una restricción, una función para escribir y una
-- columna más en lo que el navegador recibe al entrar. Ninguna fila se
-- reescribe: la que existe se queda con el objeto vacío, que es lo que
-- significa «los colores de siempre».
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) QUÉ COLORES SON ADMISIBLES
--
-- Inmutable porque la usa una restricción «check»: PostgreSQL solo
-- admite ahí funciones inmutables, y además así se puede cambiar lo que
-- la restricción acepta con un «create or replace» sin tener que
-- revalidar la tabla entera.
--
-- Un objeto vacío es válido: es lo que significa «los de siempre».
-- ---------------------------------------------------------------------
create or replace function public.valid_calendar_colors(p jsonb)
returns boolean language sql immutable as $$
  select p is null
      or (jsonb_typeof(p) = 'object'
          and not exists (
            select 1 from jsonb_each_text(p) as e(k, v)
             where e.k not in ('obra', 'fabricacion', 'montaje', 'material',
                               'visita', 'aviso', 'otro')
                or e.v !~ '^#[0-9a-fA-F]{6}$'));
$$;

comment on function public.valid_calendar_colors(jsonb) is
  'Las claves son categorías del calendario que existen y los valores colores «#rrggbb». El objeto vacío vale: significa «los colores de siempre».';


-- ---------------------------------------------------------------------
-- 2) LA COLUMNA
-- ---------------------------------------------------------------------
alter table public.app_settings
  add column if not exists calendar_colors jsonb not null default '{}'::jsonb;

comment on column public.app_settings.calendar_colors is
  'El color elegido para cada categoría del calendario, compartido por toda la empresa. Solo contiene los que se han cambiado a mano; lo que falta son los colores de siempre.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_settings_colores_validos') then
    alter table public.app_settings
      add constraint app_settings_colores_validos
      check (public.valid_calendar_colors(calendar_colors));
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 3) GUARDARLOS
--
-- Se manda el conjunto COMPLETO de los que están cambiados, no un
-- parche: así quitar un color es mandarlo sin esa clave, y no hace falta
-- inventar una manera de decir «borra esta». Es lo contrario que
-- «set_preferences», que fusiona, y es a propósito: las preferencias de
-- una persona se van añadiendo, y esto es una paleta que se edita
-- entera en una pantalla.
--
-- Las claves que llegan vacías o con un color igual al de siempre las
-- quita la PANTALLA antes de mandarlas; aquí se acepta lo que cumpla la
-- restricción, que es lo que de verdad protege la columna.
-- ---------------------------------------------------------------------
create or replace function public.set_calendar_colors(p_colors jsonb)
returns public.app_settings language plpgsql security definer set search_path = public as $$
declare s public.app_settings;
begin
  perform public.assert_admin();

  if not public.valid_calendar_colors(p_colors) then
    raise exception 'Los colores del calendario tienen que ser «#rrggbb» y de una categoría que exista'
      using errcode = '22023';
  end if;

  update public.app_settings
     set calendar_colors = coalesce(p_colors, '{}'::jsonb), updated_at = now()
   where id = 1
  returning * into s;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'colores_calendario', 'app_settings', null, null,
          public.actor_name() || ' cambió los colores del calendario',
          jsonb_build_object('colores', coalesce(p_colors, '{}'::jsonb)), false);

  return s;
end $$;

comment on function public.set_calendar_colors(jsonb) is
  'Guarda los colores del calendario para toda la empresa. Se manda el conjunto completo de los cambiados; mandarlo vacío vuelve a los de siempre.';

grant  execute on function public.set_calendar_colors(jsonb) to authenticated;
revoke execute on function public.set_calendar_colors(jsonb) from anon, public;


-- ---------------------------------------------------------------------
-- 4) QUE LLEGUEN AL NAVEGADOR AL ENTRAR
--
-- «client_config» es lo que la aplicación pide una vez al iniciar
-- sesión, y de ahí sale ya el tamaño máximo de archivo y el nombre de la
-- empresa. Los colores van por el mismo sitio: los necesitan el
-- calendario de administración Y el del trabajador, y así no hay una
-- segunda consulta ni cada pantalla pidiéndolos por su cuenta.
--
-- Es la MISMA función del archivo 02 con una clave más en el objeto.
-- «app_settings» ya se puede leer con la sesión iniciada, así que esto
-- no concede ningún acceso nuevo: solo evita el viaje.
-- ---------------------------------------------------------------------
create or replace function public.client_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_active_user()
              then jsonb_build_object('max_file_mb', s.max_file_mb,
                                      'company_name', s.company ->> 'name',
                                      'calendar_colors', s.calendar_colors)
              else '{}'::jsonb end
    from public.app_settings s where s.id = 1;
$$;

comment on function public.client_config() is
  'Lo que el navegador necesita saber al entrar: tamaño máximo de archivo, nombre de la empresa y los colores del calendario.';
