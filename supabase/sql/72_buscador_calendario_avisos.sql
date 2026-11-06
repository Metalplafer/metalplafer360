-- =====================================================================
-- METALPLAFER360 · PACK 3 · BUSCADOR, CALENDARIO Y NOTIFICACIONES
--
-- Tres cosas, y cada una con el cambio más pequeño que la resuelve:
--
--   · MEJORA 1 · un buscador de administración que encuentre proyectos,
--     avisos y presupuestos por lo que sea, incluido el nombre del
--     cliente;
--   · MEJORA 2 · organizar fabricación y montaje desde el calendario,
--     reutilizando la planificación que YA tiene el proyecto;
--   · MEJORA 3 · que una notificación lleve al elemento que la generó.
--
--
-- LO QUE **NO** HACE FALTA INVENTAR, Y ES CASI TODA LA MEJORA 2
--
-- Antes de escribir nada se leyó qué hay. La planificación de
-- fabricación y montaje EXISTE desde el archivo 30, y está donde tiene
-- que estar: en el propio proyecto.
--
--   · «projects.fab_start / fab_end» y «mont_start / mont_end» guardan
--     el periodo de cada fase. Así que una asignación hecha desde el
--     calendario YA queda vinculada al proyecto: no es una anotación
--     suelta, es el mismo dato que el proyecto enseña en su ficha;
--   · «set_phase_dates» (archivo 34) ya pone y quita esos periodos,
--     solo para administración, y marca la fase como puesta a mano para
--     que el cálculo automático no la pise;
--   · y el calendario YA pinta esos tramos en todos sus días, con color
--     propio para fabricación y para montaje (archivo 56).
--
-- Por eso aquí no se crea ninguna tabla de eventos. Crearla habría sido
-- duplicar la planificación y tener dos sitios donde mirar las fechas
-- de un proyecto, que es justo lo que se pidió evitar.
--
-- UN TRAMO POR FASE, Y ESTÁ DECIDIDO ASÍ. La estructura guarda un
-- periodo de fabricación y uno de montaje por proyecto. Partir la
-- fabricación en dos tramos separados exigiría una tabla nueva y migrar
-- lo que hay; se preguntó expresamente y se confirmó que no hace falta.
-- Volver a asignar MUEVE el tramo, no añade otro.
--
-- MIGRACIÓN ESTRUCTURAL: cuatro columnas, dos funciones reemplazadas,
-- dos funciones nuevas y dos índices. NI UNA FILA EXISTENTE SE MODIFICA
-- NI SE BORRA.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) MEJORA 2 · LA OBSERVACIÓN DE CADA TRAMO
--
-- «projects.observations» ya existía, pero es del proyecto entero:
-- escribir ahí la nota de la fabricación la mezclaría con todo lo demás
-- y la pisaría la del montaje. Se preguntó y se decidió: una columna
-- por tramo, que es lo mínimo que distingue las dos cosas.
--
-- Nacen vacías. Ningún proyecto cambia.
-- ---------------------------------------------------------------------
alter table public.projects
  add column if not exists fab_note  text,
  add column if not exists mont_note text;

alter table public.projects drop constraint if exists projects_fab_note_len;
alter table public.projects add constraint projects_fab_note_len
  check (length(coalesce(fab_note, '')) <= 500);
alter table public.projects drop constraint if exists projects_mont_note_len;
alter table public.projects add constraint projects_mont_note_len
  check (length(coalesce(mont_note, '')) <= 500);

comment on column public.projects.fab_note is
  'Observación del tramo de FABRICACIÓN, la que se escribe desde el calendario. No es «observations», que es del proyecto entero.';
comment on column public.projects.mont_note is
  'Observación del tramo de MONTAJE. Se borra sola al quitar las fechas del tramo.';


-- ---------------------------------------------------------------------
-- 2) MEJORA 2 · «set_phase_dates» APRENDE LA OBSERVACIÓN
--
-- La MISMA función del archivo 34 —su definición viva— con la nota
-- añadida. Se comprobó con «diff» que cambian CUATRO sitios y ni uno
-- más: la firma, y las dos ramas que ponen y quitan las fechas.
--
-- POR QUÉ SE TIRA LA ANTERIOR EN VEZ DE DEJAR LAS DOS. Un parámetro más
-- con valor por omisión no reemplaza la función: crea una SEGUNDA con
-- otra firma. Entonces una llamada con cuatro argumentos encajaría en
-- las dos y PostgreSQL la rechazaría por ambigua, rompiendo el
-- calendario y las pruebas que ya existen. Así que se retira la de
-- cuatro y queda solo la de cinco, que sigue admitiendo las llamadas de
-- cuatro argumentos por el valor por omisión.
--
-- Quitar las fechas del tramo BORRA su nota, y es a propósito: una
-- observación sobre un montaje que ya no está planificado no le sirve a
-- nadie y confundiría al siguiente que lo planifique.
-- ---------------------------------------------------------------------
drop function if exists public.set_phase_dates(uuid, text, date, date);

create or replace function public.set_phase_dates(
  p_project uuid, p_phase text, p_start date, p_end date default null,
  p_note text default null)
returns public.projects language plpgsql security definer set search_path = public as $$
declare
  p public.projects;
  v_end date; v_dias int;
  v_antes_start date; v_antes_end date;
begin
  perform public.assert_admin();

  if p_phase not in ('fabricacion', 'montaje') then
    raise exception 'Fase desconocida: %', p_phase using errcode = '22023';
  end if;

  select * into p from public.projects where id = p_project for update;
  if not found then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;

  if p_phase = 'fabricacion' then
    v_antes_start := p.fab_start; v_antes_end := p.fab_end;
  else
    v_antes_start := p.mont_start; v_antes_end := p.mont_end;
  end if;

  -- Una fecha imposible sí se rechaza. No es una comprobación de
  -- disponibilidad: es que el final no puede ir antes del inicio.
  if p_start is not null and p_end is not null and p_end < p_start then
    raise exception 'El final no puede ser anterior al inicio' using errcode = '22023';
  end if;

  if p_start is null then
    -- Se quita la fecha y la fase vuelve al cálculo automático.
    if p_phase = 'fabricacion' then
      update public.projects
         set fab_start = null, fab_end = null, fab_manual = false,
             fab_note = null, updated_at = now()
       where id = p_project;
    else
      update public.projects
         set mont_start = null, mont_end = null, mont_manual = false,
             mont_note = null, updated_at = now()
       where id = p_project;
    end if;
  else
    -- Si no dan final, se calcula con la duración de siempre.
    if p_end is null then
      v_dias := greatest(public.plan_days(
        case when p_phase = 'fabricacion' then p.budget_hours_fab else p.budget_hours_mont end,
        case when p_phase = 'fabricacion' then p.fab_workers      else p.mont_workers      end), 1);
      v_end := public.working_span_end(p_start, v_dias);
    else
      v_end := p_end;
    end if;

    if p_phase = 'fabricacion' then
      update public.projects
         set fab_start = p_start, fab_end = v_end, fab_manual = true,
             fab_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now()
       where id = p_project;
    else
      update public.projects
         set mont_start = p_start, mont_end = v_end, mont_manual = true,
             mont_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now()
       where id = p_project;
    end if;
  end if;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'editar_fechas', 'projects', p.id, p.code,
          public.actor_name() || ' cambió a mano las fechas de ' ||
          case p_phase when 'fabricacion' then 'la fabricación' else 'el montaje' end ||
          ' de ' || p.code || ': ' ||
          coalesce(to_char(v_antes_start, 'DD/MM/YYYY'), 'sin fecha') ||
          case when v_antes_end is not null and v_antes_end <> v_antes_start
               then ' → ' || to_char(v_antes_end, 'DD/MM/YYYY') else '' end ||
          ' ⟶ ' ||
          coalesce(to_char(p_start, 'DD/MM/YYYY'), 'sin fecha') ||
          case when v_end is not null and v_end <> p_start
               then ' → ' || to_char(v_end, 'DD/MM/YYYY') else '' end,
          jsonb_build_object('fase', p_phase,
                             'antes_inicio', v_antes_start, 'antes_fin', v_antes_end,
                             'inicio', p_start, 'fin', v_end,
                             'a_mano', p_start is not null),
          p.is_demo);

  select * into p from public.projects where id = p_project;
  return p;
end $$;


comment on function public.set_phase_dates(uuid, text, date, date, text) is
  'Pone o quita a mano el periodo de fabricación o montaje de un proyecto, con su observación. NO comprueba disponibilidad.';

grant  execute on function public.set_phase_dates(uuid, text, date, date, text) to authenticated;
revoke execute on function public.set_phase_dates(uuid, text, date, date, text) from anon, public;


-- ---------------------------------------------------------------------
-- 3) MEJORA 2 · MOVER UN TRAMO DE UN PROYECTO A OTRO
--
-- Cambiar el proyecto de una asignación es quitar las fechas de uno y
-- ponerlas en otro. Hecho en dos llamadas desde la pantalla, un fallo a
-- medio camino deja el tramo sin asignar a nadie y nadie se entera.
-- Aquí ocurre dentro de una sola operación: o se mueve, o no se toca
-- nada.
--
-- Se apoya en «set_phase_dates», que es quien sabe las reglas, en vez
-- de repetirlas. Así no pueden desajustarse.
-- ---------------------------------------------------------------------
create or replace function public.move_phase_dates(
  p_from uuid, p_to uuid, p_phase text,
  p_start date, p_end date default null, p_note text default null)
returns public.projects language plpgsql security definer set search_path = public as $$
declare p public.projects;
begin
  perform public.assert_admin();

  if p_phase not in ('fabricacion', 'montaje') then
    raise exception 'Fase desconocida: %', p_phase using errcode = '22023';
  end if;
  if p_to is null then
    raise exception 'Di a qué proyecto se mueve el tramo' using errcode = '22023';
  end if;

  -- Si no cambia de proyecto, esto es una edición normal y ya está.
  if p_from is not null and p_from <> p_to then
    perform public.set_phase_dates(p_from, p_phase, null, null, null);
  end if;

  p := public.set_phase_dates(p_to, p_phase, p_start, p_end, p_note);
  return p;
end $$;

comment on function public.move_phase_dates(uuid, uuid, text, date, date, text) is
  'Mueve un tramo de fabricación o montaje de un proyecto a otro en una sola operación: no puede quedar a medias.';

grant  execute on function public.move_phase_dates(uuid, uuid, text, date, date, text) to authenticated;
revoke execute on function public.move_phase_dates(uuid, uuid, text, date, date, text) from anon, public;


-- ---------------------------------------------------------------------
-- 4) MEJORA 3 · UNA NOTIFICACIÓN QUE SABE A DÓNDE LLEVA
--
-- Hoy «notifications» solo sabe apuntar a dos sitios:
--
--   · «order_id» · a una orden de trabajo, un módulo RETIRADO en la
--     fase 4. Por eso la campana no enseña ningún enlace: su propio
--     código lo dice, «llevaban a la pantalla de la orden, que ya no
--     existe»;
--   · «report_id» · a un parte, añadido en el archivo 26.
--
-- Faltan los dos destinos que se piden: el presupuesto o aviso, y el
-- proyecto. Se añaden con el MISMO patrón con el que se añadió
-- «report_id»: una columna con clave ajena por destino.
--
-- POR QUÉ ASÍ Y NO CON UN «tipo + id» GENÉRICO. Un par genérico aguanta
-- cualquier destino futuro, pero no tiene integridad: si el elemento se
-- borra, la notificación se queda apuntando a un fantasma y hay que
-- comprobarlo a mano cada vez. Con clave ajena, «on delete cascade» se
-- lleva la notificación cuando se va su elemento, que es exactamente el
-- requisito de «si el elemento ya no existe, no provocar errores»: no
-- hay enlace roto porque no hay notificación.
--
-- Columnas nuevas, vacías. Las notificaciones que ya existen se quedan
-- como están y siguen funcionando: las de parte con su «report_id», y
-- las que no apuntan a nada —las de material— sin enlace, igual que hoy.
-- ---------------------------------------------------------------------
alter table public.notifications
  add column if not exists ficha_id   uuid references public.fichas(id)   on delete cascade,
  add column if not exists project_id uuid references public.projects(id) on delete cascade;

comment on column public.notifications.ficha_id is
  'El presupuesto, la visita o el aviso que generó este aviso. Se borra la ficha → se borra la notificación, así no hay enlaces rotos.';
comment on column public.notifications.project_id is
  'El proyecto que generó este aviso.';

-- Toda clave ajena con su índice, que es regla de la casa y la
-- comprueba la prueba «indices» del archivo 70_tests_fase7.
create index if not exists notifications_ficha_idx   on public.notifications (ficha_id);
create index if not exists notifications_project_idx on public.notifications (project_id);


-- ---------------------------------------------------------------------
-- 5) MEJORA 1 · EL BUSCADOR DE ADMINISTRACIÓN
--
-- POR QUÉ UNA FUNCIÓN Y NO TRES CONSULTAS DESDE LA PANTALLA.
--
-- Lo que se pide es buscar por el nombre del CLIENTE y que salgan sus
-- proyectos, sus presupuestos y sus avisos. Eso cruza tablas: el nombre
-- no está en el proyecto, está en «clients». Desde el navegador serían
-- tres consultas con sus cruces, tres viajes, y la ordenación por
-- relevancia hecha a mano mezclando las tres listas.
--
-- Aquí es un viaje, el cruce lo hace la base de datos y la relevancia
-- sale ordenada. Y, sobre todo, la puerta se cierra en el servidor:
-- «assert_admin()» está DENTRO, así que un trabajador no saca nada ni
-- llamándola directamente desde la API. Esconder el buscador en la
-- pantalla no habría protegido nada.
--
-- SOBRE «security definer»: sí, se salta las políticas de fila. Por eso
-- lo primero que hace es comprobar que quien pregunta es
-- administración, que es quien ya puede ver todos los proyectos, todos
-- los presupuestos y todos los avisos. No se enseña nada que esa
-- persona no pudiera abrir por su cuenta.
--
-- LA RELEVANCIA, de más a menos:
--
--   100 · el código exacto («PROY-2026-001»);
--    90 · el código empieza por lo escrito;
--    70 · el nombre o título empieza por lo escrito;
--    50 · el nombre o título lo contiene;
--    30 · lo contiene el cliente, la dirección o la descripción.
--
-- SIN DUPLICADOS por construcción: cada proyecto y cada ficha salen de
-- UNA fila, con todas las condiciones en un «or». Un proyecto que
-- coincida por nombre y por cliente aparece una vez, con la puntuación
-- más alta de las dos.
--
-- Lo archivado no sale: se busca para trabajar, no para arqueología.
-- ---------------------------------------------------------------------
create or replace function public.search_admin(p_text text, p_limit int default 20)
returns table (
  tipo      text,
  id        uuid,
  code      text,
  titulo    text,
  cliente   text,
  estado    text,
  extra     text,
  fecha     date,
  relevancia int
) language plpgsql security definer set search_path = public as $$
declare v text; v_like text;
begin
  perform public.assert_admin();

  v := lower(trim(coalesce(p_text, '')));
  -- Con menos de dos letras no se busca: devolvería media base de datos
  -- y tardaría en hacerlo.
  if length(v) < 2 then return; end if;
  v_like := '%' || v || '%';

  return query
  with encontrados as (
    -- LOS PROYECTOS
    select 'proyecto'::text as tipo,
           p.id,
           p.code,
           p.name                      as titulo,
           c.name                      as cliente,
           public.label_es(p.phase::text) as estado,
           coalesce(p.address, '')     as extra,
           coalesce(p.fab_start, p.mont_start, p.created_at::date) as fecha,
           greatest(
             case when lower(p.code) = v then 100 else 0 end,
             case when lower(p.code) like v || '%' then 90 else 0 end,
             case when lower(p.name) like v || '%' then 70 else 0 end,
             case when lower(p.name) like v_like then 50 else 0 end,
             case when lower(coalesce(c.name, '')) like v_like then 30 else 0 end,
             case when lower(coalesce(p.address, '')) like v_like then 30 else 0 end,
             case when lower(coalesce(p.description, '')) like v_like then 30 else 0 end
           ) as relevancia
      from public.projects p
      left join public.clients c on c.id = p.client_id
     where p.archived_at is null

    union all

    -- LOS PRESUPUESTOS Y LOS AVISOS. Las visitas quedan fuera a
    -- propósito: se pidieron tres tipos de resultado y son esos.
    select case when f.type = 'aviso' then 'aviso' else 'presupuesto' end,
           f.id,
           f.code,
           coalesce(nullif(trim(f.title), ''), left(coalesce(f.description, ''), 60)),
           c.name,
           public.label_es(f.status),
           coalesce(f.address, ''),
           coalesce(f.scheduled_date, f.created_at::date),
           greatest(
             case when lower(f.code) = v then 100 else 0 end,
             case when lower(f.code) like v || '%' then 90 else 0 end,
             case when lower(coalesce(f.title, '')) like v || '%' then 70 else 0 end,
             case when lower(coalesce(f.title, '')) like v_like then 50 else 0 end,
             case when lower(coalesce(c.name, '')) like v_like then 30 else 0 end,
             case when lower(coalesce(f.address, '')) like v_like then 30 else 0 end,
             case when lower(coalesce(f.description, '')) like v_like then 30 else 0 end
           )
      from public.fichas f
      left join public.clients c on c.id = f.client_id
     where f.archived_at is null
       and f.type in ('presupuesto', 'aviso')
  )
  select e.tipo, e.id, e.code, e.titulo, e.cliente, e.estado, e.extra, e.fecha, e.relevancia
    from encontrados e
   where e.relevancia > 0
   order by e.relevancia desc, e.fecha desc nulls last, e.code
   limit greatest(least(coalesce(p_limit, 20), 50), 1);
end $$;

comment on function public.search_admin(text, int) is
  'Buscador de administración: proyectos, presupuestos y avisos por código, nombre, cliente, dirección o descripción. Solo administración, y se comprueba aquí dentro.';

grant  execute on function public.search_admin(text, int) to authenticated;
revoke execute on function public.search_admin(text, int) from anon, public;


-- ---------------------------------------------------------------------
-- 6) COMPROBAR QUE QUEDÓ BIEN
-- ---------------------------------------------------------------------
-- El buscador, con el nombre de un cliente tuyo:
-- select tipo, code, titulo, cliente, relevancia from public.search_admin('soler');
--
-- Las columnas nuevas del tramo (deben salir las dos):
-- select column_name from information_schema.columns
--  where table_name = 'projects' and column_name in ('fab_note', 'mont_note');
--
-- Que solo queda UNA «set_phase_dates», la de cinco argumentos:
-- select pg_get_function_identity_arguments(oid) from pg_proc
--  where proname = 'set_phase_dates';
--
-- Y los destinos de las notificaciones:
-- select column_name from information_schema.columns
--  where table_name = 'notifications' and column_name like '%_id';


-- ---------------------------------------------------------------------
-- 4 bis) MEJORA 3 · EL AVISO DE MATERIAL RETRASADO YA SABE SU PROYECTO
--
-- Este aviso NOMBRA el proyecto en su texto —«… · PROY-2026-007 · …»—
-- pero no lo enlazaba, así que había que ir a buscarlo a mano. Con la
-- columna nueva, al pulsarlo se abre el proyecto.
--
-- Es la MISMA función del archivo 53 con tres líneas añadidas,
-- comprobadas con «diff»: el proyecto sale del cursor y entra en la
-- notificación. No cambia a quién se avisa, ni cuándo, ni el texto.
--
-- El material de taller no tiene proyecto: ahí la columna se queda en
-- nulo y el aviso sigue sin enlace, como hoy. No es un caso raro que
-- haya que tratar: es una clave ajena vacía.
-- ---------------------------------------------------------------------
create or replace function public.notify_late_materials()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer := 0; m record;
begin
  if not public.is_admin() then return 0; end if;

  for m in
    select mm.id, mm.name, mm.expected_on, mm.supplier,
           coalesce(p.code, 'Taller') as project_code,
           mm.project_id
      from public.materials mm
      left join public.projects p on p.id = mm.project_id
     where mm.archived_at is null
       and not mm.received
       and mm.expected_on is not null
       and mm.expected_on < public.today_madrid()
       and (mm.late_notified_on is null or mm.late_notified_on < public.today_madrid())
     for update of mm
  loop
    insert into public.notifications (user_id, kind, title, body, project_id)
    select pr.id, 'material_retrasado', 'Material retrasado',
           m.name || ' · ' || m.project_code ||
           ' · estaba previsto para el ' || to_char(m.expected_on, 'DD/MM/YYYY') ||
           coalesce(' (' || m.supplier || ')', ''),
           m.project_id
      from public.profiles pr where pr.role = 'admin' and pr.active;

    update public.materials set late_notified_on = public.today_madrid() where id = m.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;
