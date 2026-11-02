-- =====================================================================
-- METALPLAFER360 · GESTIONES INTERNAS · EL TABLERO
--
-- Las gestiones administrativas de Metalplafer viven hoy en Trello:
-- listas como RRHH, TAREAS o MULTAS con sus tarjetas dentro. Esto trae
-- ese tablero a METALPLAFER360, con los usuarios, los permisos y el
-- calendario que ya existen.
--
--
-- TRES TABLAS, Y NI UNA MÁS
--
--   · «internal_lists»      · las columnas del tablero (RRHH, MULTAS…);
--   · «internal_tasks»      · las tarjetas;
--   · «internal_task_items» · el checklist de cada tarjeta.
--
-- No se toca ninguna tabla existente. Ni una columna, ni una función,
-- ni una política. Lo único que mira hacia fuera es una clave ajena a
-- «calendar_notes», y apunta de aquí hacia allí, nunca al revés: el
-- calendario no se entera de que esto existe.
--
--
-- EL CALENDARIO SE REUTILIZA TAL CUAL · ESTO ES LO IMPORTANTE
--
-- Los eventos sueltos del calendario —la categoría «Otros»— ya existen:
-- son filas de «calendar_notes», las crea «save_calendar_note» (archivo
-- 30) y el calendario las pinta en su rama «otro» (archivo 56).
--
-- Una tarea no crea un segundo tipo de evento: guarda EL IDENTIFICADOR
-- de una nota normal. Y la función de aquí no escribe en
-- «calendar_notes»: LLAMA a «save_calendar_note», la misma que usa el
-- formulario del calendario. Consecuencias, que son justo lo que se
-- pedía:
--
--   · el evento sale en el calendario general sin tocar la vista;
--   · editarlo desde la tarea NO crea otro, porque se le pasa el id que
--     ya tenía y la función de siempre hace un «update»;
--   · los eventos manuales de siempre siguen funcionando igual, porque
--     no se les ha cambiado nada;
--   · y si alguien borra el evento DESDE EL CALENDARIO, la tarea no se
--     queda apuntando a un fantasma: «on delete set null» la deja sin
--     evento y en paz. Sin referencias rotas y sin un disparador que lo
--     vigile.
--
-- Archivar una tarea NO borra su evento, por lo mismo: son dos cosas
-- distintas y nadie ha pedido que se borre.
--
--
-- POR QUÉ NO LLEVAN «is_demo»
--
-- El resto de tablas lo llevan porque los datos de ejemplo las llenan.
-- Estas no: el tablero nace vacío a propósito, porque las listas las
-- decide administración y no tiene sentido inventarle un RRHH que no
-- ha pedido. Sin filas de ejemplo no hay nada que limpiar, así que la
-- columna sobraría y «clear_demo» (archivo 31) no se toca.
--
--
-- POR QUÉ NO LLEVAN HISTORIAL
--
-- «trg_audit» sabe redactar lo que pasa en las tablas que conoce. Para
-- estas habría que enseñárselo, y lo que contaría —«marcó una casilla
-- del checklist»— es ruido. El histórico que sí se pidió es otro: las
-- tareas ARCHIVADAS, que se conservan enteras con su checklist. Eso se
-- resuelve con una columna, no con un registro de auditoría.
--
-- MIGRACIÓN ESTRUCTURAL: tres tablas nuevas, sus índices, sus políticas
-- y cinco funciones. NI UNA FILA EXISTENTE SE TOCA.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LAS LISTAS DEL TABLERO
--
-- Sin categorías predefinidas: las crea administración con el nombre
-- que quiera. El tablero nace vacío.
-- ---------------------------------------------------------------------
create table if not exists public.internal_lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 60),
  /** El orden en el que salen, de izquierda a derecha. */
  position   int  not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.internal_lists is
  'Gestiones internas · las columnas del tablero. Las crea administración con el nombre que quiera.';

create index if not exists internal_lists_position_idx
  on public.internal_lists (position, created_at);
-- Toda clave ajena con su índice, que es otra regla de la casa y la
-- comprueba la prueba «indices» del archivo 70_tests_fase7. Los índices
-- PARCIALES no le valen, y con razón: no sirven para el borrado en
-- cascada ni para las comprobaciones de la clave.
create index if not exists internal_lists_created_by_idx
  on public.internal_lists (created_by);

drop trigger if exists touch_updated_at on public.internal_lists;
create trigger touch_updated_at before update on public.internal_lists
  for each row execute function public.trg_touch_updated_at();


-- ---------------------------------------------------------------------
-- 2) LAS TAREAS
--
-- «done» y «archived_at» son DOS COSAS DISTINTAS, y se pidió
-- expresamente que no se confundieran:
--
--   · done = está hecha, pero sigue en su lista, a la vista, y se puede
--     desmarcar;
--   · archived_at = ya no estorba en el tablero, pero NO se ha borrado
--     nada: sigue aquí entera, con su checklist y con su estado.
--
-- Por eso una tarea archivada puede estar hecha o sin hacer, y las dos
-- se recuperan igual.
-- ---------------------------------------------------------------------
create table if not exists public.internal_tasks (
  id          uuid primary key default gen_random_uuid(),

  /**
   * «restrict» y no «cascade»: borrar una lista NO puede llevarse por
   * delante sus tarjetas. La función «delete_internal_list» lo impide
   * antes y con un mensaje en castellano; esto es la red de seguridad
   * por si alguien borra a mano desde Supabase.
   */
  list_id     uuid not null references public.internal_lists(id) on delete restrict,

  title       text not null check (length(trim(title)) between 1 and 200),
  notes       text check (length(coalesce(notes, '')) <= 4000),

  done        boolean not null default false,
  done_at     timestamptz,

  /** El orden dentro de su lista, de arriba abajo. */
  position    int not null default 0,

  /** Fuera del tablero, pero conservada entera. */
  archived_at timestamptz,

  /**
   * EL EVENTO DEL CALENDARIO, si lo tiene. Es una nota normal de
   * «calendar_notes», de las de la categoría «Otros».
   *
   * «on delete set null» es la pieza clave: si el evento se borra desde
   * el calendario, la tarea se queda sin evento y nada se rompe.
   */
  calendar_note_id uuid references public.calendar_notes(id) on delete set null,

  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Si está hecha, consta cuándo. Si no, no consta nada. Así no puede
  -- quedar una fecha de realización en una tarea sin hacer.
  constraint internal_tasks_done_coherente check ((done_at is not null) = done)
);

comment on table public.internal_tasks is
  'Gestiones internas · las tarjetas del tablero. «done» es estar hecha; «archived_at» es estar fuera del tablero. No es lo mismo.';

comment on column public.internal_tasks.calendar_note_id is
  'El evento de «Otros» asociado, si lo tiene. Se borra el evento desde el calendario → esto queda en nulo, sin romper nada.';

-- Sin «where»: además de pintar el tablero, este índice es el que la
-- clave ajena «list_id» necesita.
create index if not exists internal_tasks_tablero_idx
  on public.internal_tasks (list_id, position);
create index if not exists internal_tasks_evento_idx
  on public.internal_tasks (calendar_note_id);
create index if not exists internal_tasks_created_by_idx
  on public.internal_tasks (created_by);
-- Este sí es parcial, y puede serlo: no cubre ninguna clave ajena. Solo
-- sirve a la pantalla de archivadas, que son pocas y se piden por fecha.
create index if not exists internal_tasks_archivadas_idx
  on public.internal_tasks (archived_at desc) where archived_at is not null;

drop trigger if exists touch_updated_at on public.internal_tasks;
create trigger touch_updated_at before update on public.internal_tasks
  for each row execute function public.trg_touch_updated_at();


-- ---------------------------------------------------------------------
-- 3) EL CHECKLIST DE CADA TAREA
--
-- Aquí sí «cascade»: un elemento del checklist no existe sin su tarea.
-- No es lo mismo que una tarjeta dentro de una lista, que sí tiene vida
-- propia y por eso se protege con «restrict» arriba.
-- ---------------------------------------------------------------------
create table if not exists public.internal_task_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.internal_tasks(id) on delete cascade,
  text       text not null check (length(trim(text)) between 1 and 200),
  done       boolean not null default false,
  position   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.internal_task_items is
  'Gestiones internas · el checklist de una tarjeta. Pertenece a su tarea y solo a ella.';

create index if not exists internal_task_items_task_idx
  on public.internal_task_items (task_id, position);

drop trigger if exists touch_updated_at on public.internal_task_items;
create trigger touch_updated_at before update on public.internal_task_items
  for each row execute function public.trg_touch_updated_at();


-- ---------------------------------------------------------------------
-- 4) QUIÉN PUEDE · SOLO ADMINISTRACIÓN
--
-- Mismo patrón que «project_substatuses» (archivo 11): una política
-- «for all» con «is_admin()» a los dos lados. Un trabajador no ve ni
-- una fila y no puede escribir ninguna, ni desde la pantalla ni
-- llamando a la API por su cuenta.
--
-- Y SE LE QUITA TODO A «anon», que no es por si acaso: Supabase concede
-- por omisión cada tabla nueva a «anon», «authenticated» y
-- «service_role». El archivo 03 revocó lo de «anon» en bloque, pero eso
-- solo alcanzó a las tablas que existían entonces. Sin esta línea, una
-- consulta sin sesión devolvería una lista vacía en lugar de un «no
-- tienes permiso», y la diferencia importa el día que alguien añada una
-- política nueva sin mirar quién tiene concedida la tabla.
-- ---------------------------------------------------------------------
alter table public.internal_lists      enable row level security;
alter table public.internal_tasks      enable row level security;
alter table public.internal_task_items enable row level security;

grant all on public.internal_lists, public.internal_tasks, public.internal_task_items
  to service_role;

/*
 * SIN «DELETE», Y LO ENCONTRÓ UNA PRUEBA.
 *
 * La primera versión de este archivo concedía «delete» a las tres
 * tablas, por comodidad. La prueba «borrados» del archivo
 * 70_tests_fase7 falló enseguida: METALPLAFER360 mantiene una regla que
 * no sabía que existía y que es buena, «el único borrado que queda
 * abierto es el de la papelera», es decir, SOLO «documents».
 *
 * Así que se respeta. Lo poco que de verdad hace falta borrar —una
 * lista vacía, un elemento del checklist— se hace con funciones que
 * comprueban antes lo que hay que comprobar. Las tarjetas no se borran
 * nunca: se archivan.
 */
grant select, insert, update
  on public.internal_lists, public.internal_tasks, public.internal_task_items
  to authenticated;
revoke delete, truncate
  on public.internal_lists, public.internal_tasks, public.internal_task_items
  from authenticated;
revoke all on public.internal_lists, public.internal_tasks, public.internal_task_items
  from anon;

drop policy if exists internal_lists_admin on public.internal_lists;
create policy internal_lists_admin on public.internal_lists for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists internal_tasks_admin on public.internal_tasks;
create policy internal_tasks_admin on public.internal_tasks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists internal_task_items_admin on public.internal_task_items;
create policy internal_task_items_admin on public.internal_task_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------
-- 5) BORRAR UNA LISTA · CON LAS TAREAS A SALVO
--
-- «Nunca se deben eliminar tareas accidentalmente», decía el encargo. La
-- regla es la más simple que cumple eso: una lista se borra cuando está
-- VACÍA, y vacía quiere decir sin tarjetas, ni activas ni archivadas.
--
-- Para vaciarla hay un camino y se dice en el propio error: mover las
-- tarjetas a otra lista. Mover no pierde nada; borrar en cascada, sí.
--
-- Las archivadas cuentan igual que las activas, y es a propósito: si no
-- contaran, borrar una lista se llevaría por delante el histórico que
-- justo se pidió conservar.
-- ---------------------------------------------------------------------
create or replace function public.delete_internal_list(p_list uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_activas int; v_archivadas int; v_nombre text;
begin
  perform public.assert_admin();

  select name into v_nombre from public.internal_lists where id = p_list;
  if v_nombre is null then
    raise exception 'No se encuentra la lista' using errcode = 'P0002';
  end if;

  select count(*) filter (where archived_at is null),
         count(*) filter (where archived_at is not null)
    into v_activas, v_archivadas
    from public.internal_tasks where list_id = p_list;

  if v_activas + v_archivadas > 0 then
    raise exception 'La lista «%» todavía tiene % tarjeta(s)%. Muévelas a otra lista antes de borrarla.',
      v_nombre,
      v_activas + v_archivadas,
      case when v_archivadas > 0
           then ' (' || v_archivadas || ' archivada(s))' else '' end
      using errcode = '22023';
  end if;

  delete from public.internal_lists where id = p_list;
end $$;

comment on function public.delete_internal_list(uuid) is
  'Borra una lista del tablero, solo si está vacía. Las tarjetas archivadas cuentan: son el histórico.';

grant  execute on function public.delete_internal_list(uuid) to authenticated;
revoke execute on function public.delete_internal_list(uuid) from anon, public;


-- ---------------------------------------------------------------------
-- 5 bis) QUITAR UN ELEMENTO DEL CHECKLIST
--
-- Borrar un elemento del checklist sí se pidió, y es lo único que de
-- verdad se borra en todo el módulo. Va por función porque las tablas
-- no tienen «delete» concedido, por lo explicado arriba.
--
-- Comprueba que el elemento existe para no devolver un silencio cuando
-- alguien pide borrar algo que ya no está.
-- ---------------------------------------------------------------------
create or replace function public.delete_internal_task_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();

  delete from public.internal_task_items where id = p_item;
  if not found then
    raise exception 'No se encuentra el elemento del checklist' using errcode = 'P0002';
  end if;
end $$;

comment on function public.delete_internal_task_item(uuid) is
  'Quita un elemento del checklist de una tarjeta. Lo único que se borra de verdad en Gestiones internas.';

grant  execute on function public.delete_internal_task_item(uuid) to authenticated;
revoke execute on function public.delete_internal_task_item(uuid) from anon, public;


-- ---------------------------------------------------------------------
-- 6) MOVER UNA TAREA · DE LISTA Y DE SITIO
--
-- Una función y no un «update» suelto porque mover es DOS cosas a la
-- vez: cambiar de lista y colocarse en una posición. Hechas por
-- separado, un fallo a medio camino deja dos tarjetas en el mismo sitio
-- o una lista con los números descolocados.
--
-- Se renumera de diez en diez para que la siguiente inserción tenga
-- hueco sin tocar a las vecinas.
-- ---------------------------------------------------------------------
create or replace function public.move_internal_task(
  p_task uuid, p_list uuid default null, p_position int default null)
returns public.internal_tasks language plpgsql security definer set search_path = public as $$
declare t public.internal_tasks; v_origen uuid; v_destino uuid;
begin
  perform public.assert_admin();

  select * into t from public.internal_tasks where id = p_task for update;
  if not found then
    raise exception 'No se encuentra la tarea' using errcode = 'P0002';
  end if;
  if t.archived_at is not null then
    raise exception 'La tarea está archivada. Recupérala antes de moverla.' using errcode = '22023';
  end if;

  v_origen  := t.list_id;
  v_destino := coalesce(p_list, t.list_id);

  if not exists (select 1 from public.internal_lists where id = v_destino) then
    raise exception 'No se encuentra la lista de destino' using errcode = 'P0002';
  end if;

  -- Se coloca en el hueco pedido. Media posición hacia arriba para que
  -- caiga ANTES de la que hoy ocupa ese número; la renumeración de
  -- abajo lo deja en enteros otra vez.
  update public.internal_tasks
     set list_id = v_destino,
         position = coalesce(p_position, 0) * 10 - 5,
         updated_at = now()
   where id = p_task;

  -- Y las dos listas quedan numeradas de diez en diez, sin huecos raros.
  with ordenadas as (
    select id, row_number() over (order by position, updated_at) * 10 as n
      from public.internal_tasks
     where list_id = v_destino and archived_at is null)
  update public.internal_tasks x set position = o.n
    from ordenadas o where o.id = x.id and x.position is distinct from o.n;

  if v_origen <> v_destino then
    with ordenadas as (
      select id, row_number() over (order by position, updated_at) * 10 as n
        from public.internal_tasks
       where list_id = v_origen and archived_at is null)
    update public.internal_tasks x set position = o.n
      from ordenadas o where o.id = x.id and x.position is distinct from o.n;
  end if;

  select * into t from public.internal_tasks where id = p_task;
  return t;
end $$;

comment on function public.move_internal_task(uuid, uuid, int) is
  'Mueve una tarjeta de lista y de posición a la vez, y renumera las listas afectadas.';

grant  execute on function public.move_internal_task(uuid, uuid, int) to authenticated;
revoke execute on function public.move_internal_task(uuid, uuid, int) from anon, public;


-- ---------------------------------------------------------------------
-- 7) ARCHIVAR Y RECUPERAR
--
-- Archivar NO borra: pone una fecha. Toda la tarjeta sigue ahí, con su
-- checklist, con su estado de realización y con su evento.
--
-- Recuperar admite una lista de destino, porque puede que la de origen
-- ya no sirva. Si no se dice ninguna, vuelve a la suya.
-- ---------------------------------------------------------------------
create or replace function public.archive_internal_task(p_task uuid)
returns public.internal_tasks language plpgsql security definer set search_path = public as $$
declare t public.internal_tasks;
begin
  perform public.assert_admin();

  update public.internal_tasks
     set archived_at = now(), updated_at = now()
   where id = p_task and archived_at is null
  returning * into t;

  if not found then
    -- O no existe, o ya estaba archivada. Lo segundo no es un error:
    -- archivar dos veces deja lo mismo que archivar una.
    select * into t from public.internal_tasks where id = p_task;
    if not found then
      raise exception 'No se encuentra la tarea' using errcode = 'P0002';
    end if;
  end if;

  return t;
end $$;

create or replace function public.restore_internal_task(
  p_task uuid, p_list uuid default null)
returns public.internal_tasks language plpgsql security definer set search_path = public as $$
declare t public.internal_tasks; v_destino uuid; v_max int;
begin
  perform public.assert_admin();

  select * into t from public.internal_tasks where id = p_task for update;
  if not found then
    raise exception 'No se encuentra la tarea' using errcode = 'P0002';
  end if;

  v_destino := coalesce(p_list, t.list_id);
  if not exists (select 1 from public.internal_lists where id = v_destino) then
    raise exception 'No se encuentra la lista a la que devolver la tarea' using errcode = 'P0002';
  end if;

  -- Vuelve al final de su lista: es lo menos intrusivo que se puede
  -- hacer con un tablero que alguien ha ordenado a mano.
  select coalesce(max(position), 0) + 10 into v_max
    from public.internal_tasks
   where list_id = v_destino and archived_at is null;

  update public.internal_tasks
     set archived_at = null, list_id = v_destino, position = v_max, updated_at = now()
   where id = p_task
  returning * into t;

  return t;
end $$;

comment on function public.restore_internal_task(uuid, uuid) is
  'Devuelve una tarjeta archivada al tablero, a su lista o a otra si se indica. Conserva su estado y su checklist.';

grant  execute on function public.archive_internal_task(uuid)       to authenticated;
grant  execute on function public.restore_internal_task(uuid, uuid) to authenticated;
revoke execute on function public.archive_internal_task(uuid)       from anon, public;
revoke execute on function public.restore_internal_task(uuid, uuid) from anon, public;


-- ---------------------------------------------------------------------
-- 8) EL EVENTO DEL CALENDARIO · REUTILIZANDO EL DE SIEMPRE
--
-- Esta función NO escribe en «calendar_notes». Llama a
-- «save_calendar_note», que es la misma que usa el formulario del
-- calendario desde el archivo 30.
--
-- Y le pasa el id que la tarea ya tenía. Ahí está la garantía de que
-- editar no duplica: con id, «save_calendar_note» hace «update»; sin
-- id, «insert». La tarea solo guarda a cuál apunta.
--
-- Con «p_day» en nulo se SUELTA el evento: la tarea deja de tener uno y
-- la nota se queda en el calendario. Se eligió no borrarla porque un
-- evento puede haberse compartido o haberse mirado ya; quitarlo del
-- calendario es una decisión del calendario, y allí está el botón.
-- ---------------------------------------------------------------------
create or replace function public.set_internal_task_event(
  p_task uuid, p_day date default null, p_title text default null,
  p_detail text default null)
returns public.internal_tasks language plpgsql security definer set search_path = public as $$
declare t public.internal_tasks; n public.calendar_notes;
begin
  perform public.assert_admin();

  select * into t from public.internal_tasks where id = p_task for update;
  if not found then
    raise exception 'No se encuentra la tarea' using errcode = 'P0002';
  end if;

  if p_day is null then
    update public.internal_tasks set calendar_note_id = null, updated_at = now()
     where id = p_task returning * into t;
    return t;
  end if;

  -- La misma función de siempre. Si la tarea ya tenía evento, se le
  -- pasa su id y se actualiza; si no, nace uno.
  n := public.save_calendar_note(
         t.calendar_note_id,
         p_day,
         coalesce(nullif(trim(coalesce(p_title, '')), ''), t.title),
         p_detail,
         null);

  update public.internal_tasks
     set calendar_note_id = n.id, updated_at = now()
   where id = p_task
  returning * into t;

  return t;
end $$;

comment on function public.set_internal_task_event(uuid, date, text, text) is
  'Crea o actualiza el evento «Otros» de una tarjeta llamando a save_calendar_note. Con la fecha en nulo, la tarjeta se queda sin evento y el evento sigue en el calendario.';

grant  execute on function public.set_internal_task_event(uuid, date, text, text) to authenticated;
revoke execute on function public.set_internal_task_event(uuid, date, text, text) from anon, public;


-- ---------------------------------------------------------------------
-- 9) EL TABLERO, DE UNA SOLA CONSULTA
--
-- La pantalla necesita: las listas, sus tarjetas, y de cada tarjeta
-- cuánto checklist lleva hecho y si tiene evento. Pedirlo por separado
-- serían tres viajes y un parpadeo.
--
-- «security_invoker» para que la vista obedezca las políticas de quien
-- pregunta, como todas las demás vistas de la aplicación.
-- ---------------------------------------------------------------------
create or replace view public.internal_board with (security_invoker = true) as
  select t.id,
         t.list_id,
         l.name                                   as list_name,
         l.position                               as list_position,
         t.title,
         t.notes,
         t.done,
         t.done_at,
         t.position,
         t.archived_at,
         t.calendar_note_id,
         n.day                                    as event_day,
         n.title                                  as event_title,
         coalesce(i.total, 0)                     as checklist_total,
         coalesce(i.hechos, 0)                    as checklist_hechos,
         t.created_at,
         t.updated_at
    from public.internal_tasks t
    join public.internal_lists l on l.id = t.list_id
    left join public.calendar_notes n on n.id = t.calendar_note_id
    left join lateral (
      select count(*) as total, count(*) filter (where done) as hechos
        from public.internal_task_items it where it.task_id = t.id) i on true;

comment on view public.internal_board is
  'Gestiones internas · las tarjetas con su lista, su progreso de checklist y su evento. Una sola consulta para pintar el tablero.';

grant select on public.internal_board to authenticated, service_role;
revoke all   on public.internal_board from anon;


-- ---------------------------------------------------------------------
-- 10) COMPROBAR QUE QUEDÓ BIEN
-- ---------------------------------------------------------------------
-- Las tres tablas y la vista:
-- select table_name from information_schema.tables
--  where table_schema = 'public' and table_name like 'internal_%';
--
-- El tablero nace vacío, que es lo esperado:
-- select count(*) as listas from public.internal_lists;
--
-- Y que nadie sin sesión las tiene concedidas:
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_name = 'internal_tasks' and grantee = 'anon';
--  (no debe devolver ni una fila)
