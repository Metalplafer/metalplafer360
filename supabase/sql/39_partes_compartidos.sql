-- =====================================================================
-- METALPLAFER360 · PARTES COMPARTIDOS
--                  Y LAS HORAS, CUADRANDO EN TODAS LAS PANTALLAS
--
--
-- EL PROBLEMA QUE RESUELVE
--
-- Dos personas van juntas a montar una barandilla. Hoy cada una tiene que
-- rellenar su propio parte, con su propia descripción y sus propias
-- fotografías del mismo trabajo. Queda duplicado y cuesta revisarlo.
--
-- Ahora el trabajo es UNO: un parte, un tipo de actividad, una
-- descripción y un solo juego de fotografías, vídeos y documentos. Lo que
-- es de cada persona son SUS HORAS.
--
--
-- CÓMO SE GUARDA · y por qué así
--
-- La tabla nueva «work_report_workers» guarda a LOS DEMÁS, no al autor.
-- El autor sigue donde ha estado siempre: en «work_reports.worker_id»
-- con sus horas en «work_reports.hours».
--
-- Se podría haber metido a todo el mundo en la tabla nueva, autor
-- incluido. No se ha hecho, y es la decisión importante de este archivo:
--
--   · «work_reports.hours» NO cambia de significado. Sigue siendo «las
--     horas de quien rellenó el parte», que es lo que dice su comentario
--     y lo que esperan los informes y las pantallas de hoy.
--   · LA DOBLE CONTABILIZACIÓN SE VUELVE IMPOSIBLE, no improbable. Si el
--     autor pudiera estar en los dos sitios, sus horas se contarían dos
--     veces en cuanto alguien se despistara. Aquí hay una restricción que
--     lo RECHAZA: el autor no cabe en la tabla de los demás. No hay que
--     mantener nada sincronizado ni recordar ninguna regla.
--   · Los partes de siempre no se enteran: no tienen ninguna fila en la
--     tabla nueva, así que se siguen calculando exactamente igual.
--
-- Total de horas-persona de un trabajo = las del autor + las de los
-- demás. En el ejemplo del encargo: 3 h de A + 3 h de B = 6 horas-persona
-- en un único parte.
--
--
-- QUIÉN PUEDE ENTRAR EN UN PARTE COMPARTIDO
--
-- Solo se puede compartir con quien está asignado AL MISMO proyecto o AL
-- MISMO aviso del parte. No es una comprobación de la pantalla: la hace
-- la función, de manera que manipular la petición a mano no sirve de
-- nada.
--
-- Un parte SUELTO (sin proyecto y sin aviso) no se puede compartir: no
-- hay ningún grupo del que elegir. Se dice, en lugar de dejar pasar a
-- cualquiera.
--
--
-- HORAS PRESUPUESTADAS Y HORAS REALES · no se tocan entre ellas
--
-- Son dos cosas distintas y este archivo NO las mezcla:
--
--   · PRESUPUESTADAS · «projects.budget_hours_fab» y
--     «budget_hours_mont». Las pone administración, sirven para planificar
--     y facturar, y NADA de lo que haga un trabajador las cambia.
--   · REALES · las de los partes (y, mientras existan, las de las
--     órdenes). Salen todas de la vista «hours_worked» y solo cuentan
--     cuando administración VALIDA.
--
-- La diferencia entre las dos es el desvío, y es un dato, no un error.
--
--
-- LO QUE SE CORRIGE DE PASO · y por qué las cifras van a cambiar
--
-- El panel y los dos informes de horas sumaban SOLO las órdenes de
-- trabajo. Desde que los partes son la vía normal, esas cifras llevaban
-- tiempo saliendo cortas, y «Horas por proyecto» ni siquiera enseñaba los
-- proyectos que no tenían ninguna orden. Ahora los tres leen de
-- «hours_worked», que es la misma fuente que ya usaban «project_hours» y
-- la ficha del proyecto. Así todo cuadra entre sí.
--
-- ESTO HARÁ SUBIR LAS CIFRAS DEL PANEL Y DE LOS INFORMES. No es un
-- error: es el trabajo que ya estaba registrado y no se estaba contando.
-- Está explicado en las instrucciones de entrega.
--
--
-- TODO ES ADITIVO. No se borra, no se reasigna y no se modifica ninguna
-- fila existente. Ningún parte de los que ya hay cambia de horas, de
-- estado ni de fecha, y no hay que volver a validar nada.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
--
-- HAY QUE EJECUTARLO COMPLETO DE UNA VEZ, no a trozos: dos funciones se
-- sustituyen (se borran y se vuelven a crear) porque cambia lo que
-- devuelven, y dentro de una sola transacción eso no deja ningún instante
-- sin función.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LOS DEMÁS QUE ESTUVIERON EN EL TRABAJO
-- ---------------------------------------------------------------------
create table if not exists public.work_report_workers (
  report_id uuid not null references public.work_reports(id) on delete cascade,
  worker_id uuid not null references public.profiles(id)     on delete cascade,
  hours     numeric(6,2) not null check (hours > 0 and hours <= 24),
  added_at  timestamptz not null default now(),
  added_by  uuid references public.profiles(id) on delete set null,
  is_demo   boolean not null default false,
  primary key (report_id, worker_id)
);

comment on table public.work_report_workers is
  'Los DEMÁS que estuvieron en el trabajo de un parte, cada uno con SUS horas. El autor NO está aquí: está en «work_reports».';
comment on column public.work_report_workers.hours is
  'Las horas reales de esta persona en este trabajo. No son las del autor ni las del parte entero.';

-- Las claves foráneas, con su índice. Hay una prueba que lo exige: sin
-- índice, borrar la fila referenciada recorre la tabla entera.
create index if not exists work_report_workers_worker_idx   on public.work_report_workers (worker_id);
create index if not exists work_report_workers_added_by_idx on public.work_report_workers (added_by);


/**
 * EL AUTOR NO CABE AQUÍ.
 *
 * Es LA regla que hace imposible contar sus horas dos veces. Se
 * comprueba con un disparador y no con un CHECK porque hace falta mirar
 * otra tabla («work_reports.worker_id»), y un CHECK solo puede mirar su
 * propia fila.
 */
create or replace function public.trg_report_worker_no_autor() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_autor uuid;
begin
  select worker_id into v_autor from public.work_reports where id = new.report_id;
  if v_autor = new.worker_id then
    raise exception 'Quien rellena el parte ya cuenta con sus propias horas: no se añade otra vez como acompañante.'
      using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists report_worker_no_autor on public.work_report_workers;
create trigger report_worker_no_autor before insert or update on public.work_report_workers
  for each row execute function public.trg_report_worker_no_autor();


-- ---------------------------------------------------------------------
-- 2) QUIÉN PUEDE LEER UN PARTE
--
-- «owns_report» NO se toca: sigue significando «soy quien lo rellenó», y
-- es lo que gobierna quién puede EDITAR el parte y subirle evidencias.
-- Cambiarle el significado habría ampliado de golpe permisos de
-- escritura que nadie ha pedido ampliar.
--
-- Lo que se añade es una función NUEVA para la LECTURA. Así queda a la
-- vista qué se ha ampliado y qué no.
-- ---------------------------------------------------------------------

/** ¿Estuve yo en el trabajo de este parte, como acompañante? */
create or replace function public.report_participant(p_report uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.work_report_workers w
      join public.profiles pr on pr.id = w.worker_id and pr.active
     where w.report_id = p_report and w.worker_id = auth.uid());
$$;

/**
 * ¿Puedo LEER este parte y lo que cuelga de él?
 * Sí si lo rellené yo o si estuve en ese trabajo. Editarlo es otra cosa.
 */
create or replace function public.can_read_report(p_report uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.owns_report(p_report) or public.report_participant(p_report);
$$;

comment on function public.can_read_report(uuid) is
  'Quién puede LEER un parte y sus archivos: su autor y los que estuvieron en ese trabajo. Para editarlo sigue valiendo «owns_report».';

grant execute on function
  public.report_participant(uuid), public.can_read_report(uuid) to authenticated;
revoke execute on function
  public.report_participant(uuid), public.can_read_report(uuid) from anon, public;


-- ---------------------------------------------------------------------
-- 3) CON QUIÉN SE PUEDE COMPARTIR
--
-- Solo con quien está asignado al MISMO proyecto o al MISMO aviso del
-- parte. La misma función la usan la pantalla (para pintar el selector) y
-- la función que guarda (para comprobarlo de verdad), así que no pueden
-- decir cosas distintas.
-- ---------------------------------------------------------------------
create or replace function public.report_candidates(p_report uuid)
returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select pr.*
    from public.work_reports r
    join public.profiles pr on pr.active and pr.id <> r.worker_id
   where r.id = p_report
     and (public.is_admin() or r.worker_id = auth.uid())
     and (
       -- Del mismo proyecto.
       (r.project_id is not null and exists (
          select 1 from public.project_workers pw
           where pw.project_id = r.project_id and pw.worker_id = pr.id))
       -- O del mismo aviso: su responsable o su equipo.
       or (r.ficha_id is not null and (
            exists (select 1 from public.ficha_workers fw
                     where fw.ficha_id = r.ficha_id and fw.worker_id = pr.id)
            or exists (select 1 from public.fichas f
                        where f.id = r.ficha_id and f.assigned_to = pr.id)))
     )
   order by pr.full_name;
$$;

comment on function public.report_candidates(uuid) is
  'Con quién se puede compartir un parte: los asignados al mismo proyecto o al mismo aviso. La pantalla y el guardado usan ESTA lista.';

grant execute on function public.report_candidates(uuid) to authenticated;
revoke execute on function public.report_candidates(uuid) from anon, public;


/**
 * GUARDAR CON QUIÉN SE HIZO EL TRABAJO.
 *
 * Se manda la lista COMPLETA, como en los proyectos y en los avisos:
 * quitar a alguien es volver a mandarla sin él. Mandar una lista vacía
 * deja el parte individual otra vez.
 *
 * «p_participantes» es una lista de objetos:
 *   [{"worker_id": "…", "hours": 3.5}, …]
 *
 * Las horas de cada uno son LAS SUYAS. Las del autor no se tocan desde
 * aquí: están en el parte y se cambian en el parte.
 */
create or replace function public.save_report_workers(p_report uuid, p_participantes jsonb)
returns setof public.work_report_workers
language plpgsql security definer set search_path = public as $$
declare
  r public.work_reports;
  v_ids uuid[];
  v_malo text;
begin
  select * into r from public.work_reports where id = p_report for update;
  if not found then
    raise exception 'No se encuentra el parte de trabajo' using errcode = 'P0002';
  end if;

  -- Lo reparte quien lo rellenó. Administración también, para poder
  -- arreglar un parte mal compartido sin pedírselo al trabajador.
  if not (public.is_admin() or r.worker_id = auth.uid()) then
    raise exception 'Ese parte no es tuyo' using errcode = '42501';
  end if;

  if r.status = 'validado' then
    raise exception 'El parte % ya está validado: sus horas cuentan como trabajo realizado y no se puede cambiar con quién se hizo. Recházalo primero.', r.code
      using errcode = '42501';
  end if;

  -- Un parte suelto no tiene grupo del que elegir.
  if r.project_id is null and r.ficha_id is null
     and jsonb_array_length(coalesce(p_participantes, '[]'::jsonb)) > 0 then
    raise exception 'Este parte todavía no tiene proyecto ni aviso, así que no hay con quién compartirlo. Pídele a administración que lo asigne y después repártelo.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg((x ->> 'worker_id')::uuid), '{}') into v_ids
    from jsonb_array_elements(coalesce(p_participantes, '[]'::jsonb)) x;

  -- El autor ya cuenta con sus horas: no se añade a sí mismo.
  if r.worker_id = any(v_ids) then
    raise exception 'Tus horas ya están en el parte: no te añadas a ti mismo como acompañante.'
      using errcode = '22023';
  end if;

  -- TODOS tienen que estar en el mismo proyecto o en el mismo aviso. Se
  -- comprueba aquí, no en la pantalla: así no sirve de nada manipular la
  -- petición a mano.
  select string_agg(pr.full_name, ', ') into v_malo
    from unnest(v_ids) u(id)
    join public.profiles pr on pr.id = u.id
   where not exists (select 1 from public.report_candidates(p_report) c where c.id = u.id);
  if v_malo is not null then
    raise exception 'No se puede compartir el parte con %: no está asignado al mismo trabajo.', v_malo
      using errcode = '42501';
  end if;
  -- Y si el identificador no es ni de una persona activa, también se dice.
  if exists (select 1 from unnest(v_ids) u(id)
              where not exists (select 1 from public.profiles pr
                                 where pr.id = u.id and pr.active)) then
    raise exception 'Alguna de las personas no existe o está desactivada' using errcode = '22023';
  end if;

  delete from public.work_report_workers
   where report_id = p_report and worker_id <> all(v_ids);

  insert into public.work_report_workers (report_id, worker_id, hours, added_by, is_demo)
  select p_report, (x ->> 'worker_id')::uuid, round((x ->> 'hours')::numeric, 2),
         auth.uid(), r.is_demo
    from jsonb_array_elements(coalesce(p_participantes, '[]'::jsonb)) x
  on conflict (report_id, worker_id) do update
    set hours = excluded.hours, added_by = excluded.added_by, added_at = now();

  return query
    select w.* from public.work_report_workers w
     where w.report_id = p_report
     order by w.added_at;
end $$;

comment on function public.save_report_workers(uuid, jsonb) is
  'Pone con quién se hizo el trabajo de un parte, cada uno con sus horas. Se manda la lista completa; vacía lo deja individual.';

grant execute on function public.save_report_workers(uuid, jsonb) to authenticated;
revoke execute on function public.save_report_workers(uuid, jsonb) from anon, public;


-- ---------------------------------------------------------------------
-- 4) EL EQUIPO DE UN PARTE, PARA LAS PANTALLAS
--
-- El autor y los acompañantes en una sola lista, cada uno con sus horas,
-- y el total de horas-persona del trabajo a la vista.
-- ---------------------------------------------------------------------
create or replace view public.report_team with (security_barrier = true) as
  select r.id as report_id, r.worker_id, pr.full_name, r.hours,
         true as es_autor, r.created_at as added_at
    from public.work_reports r
    join public.profiles pr on pr.id = r.worker_id
   where public.is_admin() or public.can_read_report(r.id)
  union all
  select w.report_id, w.worker_id, pr.full_name, w.hours, false, w.added_at
    from public.work_report_workers w
    join public.profiles pr on pr.id = w.worker_id
   where public.is_admin() or public.can_read_report(w.report_id);

comment on view public.report_team is
  'Quién estuvo en el trabajo de un parte y cuántas horas puso cada uno. El autor va marcado.';

grant select on public.report_team to authenticated, service_role;
revoke all on public.report_team from anon;

grant select on public.work_report_workers to authenticated, service_role;
grant all    on public.work_report_workers to service_role;
revoke all   on public.work_report_workers from anon;

alter table public.work_report_workers enable row level security;

drop policy if exists report_workers_select on public.work_report_workers;
create policy report_workers_select on public.work_report_workers for select to authenticated
  using (public.is_admin() or public.can_read_report(report_id));

comment on policy report_workers_select on public.work_report_workers is
  'Quién estuvo en un trabajo lo ven administración, el autor del parte y los que estuvieron en él.';

-- No se escribe a pelo: se escribe con «save_report_workers», que es la
-- que comprueba que todos están asignados al mismo trabajo.
revoke insert, update, delete, truncate on public.work_report_workers from authenticated;


-- ---------------------------------------------------------------------
-- 5) LOS PERMISOS DE LECTURA, AMPLIADOS SOLO A LOS PARTICIPANTES
--
-- Se cambia «owns_report» por «can_read_report» en las políticas de
-- LECTURA, y en la de escribir un comentario: quien estuvo en el trabajo
-- tiene que poder contestar a administración sobre ese mismo trabajo.
--
-- LO QUE NO SE AMPLÍA, a propósito:
--   · editar el parte y subirle fotografías sigue siendo del AUTOR
--     («worker_can_edit_report», que no se toca);
--   · un parte en el que no estuviste sigue siendo invisible.
-- ---------------------------------------------------------------------
drop policy if exists reports_select on public.work_reports;
create policy reports_select on public.work_reports for select to authenticated
  using (public.is_admin() or worker_id = auth.uid() or public.report_participant(id));

comment on policy reports_select on public.work_reports is
  'Cada uno ve sus partes y los partes en los que estuvo. Administración los ve todos.';

-- Las TRES definiciones que se tocan aquí se han copiado de donde están
-- VIGENTES, no del archivo 28: «documents_select» la endureció el
-- archivo 29 con «scope = 'tecnica'» y «storage_can_read» la rehízo el
-- archivo 33 exigiendo que el archivo esté registrado y no sea
-- administrativo. Copiarlas del 28 habría DESHECHO las dos cosas y los
-- documentos administrativos habrían vuelto a verse. Lo cazaron tres
-- pruebas que ya existían; queda dicho aquí para que no se repita.
-- El único cambio en cada una es «owns_report» → «can_read_report».

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (
    public.is_admin()
    or (deleted_at is null
        and scope = 'tecnica'
        and (
          (ficha_id   is not null and public.worker_has_ficha(ficha_id))
       or (project_id is not null and public.worker_can_see_project(project_id))
       or (order_id   is not null and public.worker_has_order(order_id))
       or (report_id  is not null and public.can_read_report(report_id))))
  );

-- Los comentarios de una obra: solo administración.
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (
    public.is_admin()
    or (ficha_id   is not null and public.worker_has_ficha(ficha_id))
    or (project_id is not null and public.worker_can_see_project(project_id))
    or (order_id   is not null and public.worker_has_order(order_id))
    or (report_id  is not null and public.can_read_report(report_id))
  );

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and (public.is_admin()
      or (ficha_id   is not null and public.worker_has_ficha(ficha_id))
      or (project_id is not null and public.worker_can_see_project(project_id))
      or (order_id   is not null and public.worker_has_order(order_id))
      or (report_id  is not null and public.can_read_report(report_id)))
  );

-- Y los archivos del almacén, por la misma regla. Esto es lo que impide
-- de verdad la descarga: sin «true» aquí, Supabase no firma el enlace.
create or replace function public.storage_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (
        case split_part(p_name, '/', 1)
          when 'fichas'   then public.worker_has_ficha(public.try_uuid(split_part(p_name, '/', 2)))
          when 'projects' then public.worker_can_see_project(public.try_uuid(split_part(p_name, '/', 2)))
          when 'orders'   then public.worker_has_order(public.try_uuid(split_part(p_name, '/', 2)))
          when 'reports'  then public.can_read_report(public.try_uuid(split_part(p_name, '/', 2)))
          else false
        end
        -- Tiene que estar registrado, fuera de la papelera y no ser
        -- administrativo. Un archivo huérfano en el almacén no se sirve.
        and exists (
          select 1 from public.documents d
           where d.storage_path = p_name
             and d.deleted_at is null
             and d.scope <> 'administrativa')
      );
$$;


-- ---------------------------------------------------------------------
-- 6) LAS HORAS REALES · una sola fuente para todo
--
-- Se añade el tramo de los acompañantes y una columna «ficha_id» al
-- final, para poder saber si las horas vinieron de un aviso.
--
-- Las columnas de siempre conservan su nombre, su tipo y su orden: lo
-- único que se hace es AÑADIR una al final, que es lo que PostgreSQL
-- permite al redefinir una vista.
-- ---------------------------------------------------------------------
create or replace view public.hours_worked with (security_invoker = true) as
  -- 1) EL AUTOR del parte. Exactamente igual que antes.
  select r.id as source_id, 'parte'::text as origen, r.worker_id, r.project_id,
         r.work_type, r.work_date, r.hours, r.ficha_id
    from public.work_reports r
   where r.status = 'validado' and r.hours is not null
  union all
  -- 2) LOS DEMÁS que estuvieron en ese mismo trabajo. Cada uno con SUS
  --    horas. El autor no puede estar aquí (lo impide el disparador del
  --    punto 1), así que nadie se cuenta dos veces.
  select r.id, 'parte', w.worker_id, r.project_id,
         r.work_type, r.work_date, w.hours, r.ficha_id
    from public.work_reports r
    join public.work_report_workers w on w.report_id = r.id
   where r.status = 'validado'
  union all
  -- 3) LAS ÓRDENES, mientras sigan existiendo.
  select o.id, 'orden', w.worker_id, o.project_id,
         o.type, o.scheduled_date, w.hours, null::uuid
    from public.work_orders o
    join public.work_order_workers w on w.order_id = o.id
   where o.status = 'validada' and o.archived_at is null and w.hours is not null;

comment on view public.hours_worked is
  'LAS HORAS REALMENTE TRABAJADAS, de una sola fuente: el autor del parte, sus acompañantes y las órdenes. Solo lo VALIDADO. No tiene nada que ver con las horas presupuestadas.';


/**
 * LOS PARTES DE UN PROYECTO · las horas validadas incluyen a todos.
 *
 * Antes sumaba solo «work_reports.hours», que son las del autor. En un
 * parte compartido eso se quedaba corto: faltaban las de los
 * acompañantes. Las columnas no cambian; cambia de dónde sale la última.
 */
create or replace view public.project_reports with (security_invoker = true) as
  select r.project_id, count(*) as total,
         count(*) filter (where r.status = 'enviado')   as por_validar,
         count(*) filter (where r.status = 'validado')  as validados,
         count(*) filter (where r.status = 'rechazado') as rechazados,
         coalesce(sum(r.hours) filter (where r.status = 'validado'), 0)
         + coalesce((select sum(w.hours)
                       from public.work_report_workers w
                       join public.work_reports r2 on r2.id = w.report_id
                      where r2.project_id = r.project_id
                        and r2.status = 'validado'), 0) as horas_validadas
    from public.work_reports r
   where r.project_id is not null
   group by r.project_id;

comment on view public.project_reports is
  'Cuántos partes tiene un proyecto y en qué estado, con las horas VALIDADAS de todos los que estuvieron.';


-- ---------------------------------------------------------------------
-- 7) EL PANEL Y LOS INFORMES, LEYENDO DE LA MISMA FUENTE
--
-- Esto es la «opción A»: que el panel, los informes, la ficha del
-- proyecto y «project_hours» cuenten LO MISMO.
--
-- Hasta aquí, el panel y los dos informes de horas sumaban SOLO las
-- órdenes de trabajo. Los partes no entraban, y «Horas por proyecto» ni
-- siquiera enseñaba los proyectos que no tenían ninguna orden. Ahora los
-- tres leen de «hours_worked».
--
-- LAS CIFRAS VAN A SUBIR. Es el trabajo que ya estaba registrado en los
-- partes y que no se estaba contando. Las horas PRESUPUESTADAS no se
-- tocan: siguen saliendo de «projects.budget_hours_*», que las pone
-- administración, y la diferencia entre unas y otras es el desvío.
--
-- Es el MISMO cuerpo del archivo 19 con el bloque de producción
-- cambiado; no se toca ningún otro bloque del panel.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_summary(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_today date := public.today_madrid();
begin
  perform public.assert_admin();

  select jsonb_build_object(

    'periodo', jsonb_build_object('desde', p_from, 'hasta', p_to),

    -- PRODUCCIÓN: lo que se ha trabajado en el periodo.
    --
    -- Migración 39 · Antes esto sumaba SOLO las órdenes de trabajo, así
    -- que desde que los partes son la vía normal venía saliendo corto.
    -- Ahora lee de «hours_worked», que es la misma fuente que usan la
    -- ficha del proyecto y «project_hours»: una sola verdad para todos.
    --
    -- Son HORAS REALES y solo las VALIDADAS. Las presupuestadas son otra
    -- cosa y no se mezclan aquí.
    --
    -- «trabajos_validados» cuenta los trabajos con horas en el periodo
    -- (partes y órdenes). Antes se llamaba «ordenes_validadas» y contaba
    -- solo órdenes; el nombre decía una cosa y la cifra significaba otra
    -- en cuanto apareció un parte.
    'produccion', (
      select jsonb_build_object(
        'horas_fabricacion',   coalesce(sum(h.hours) filter (where h.work_type = 'fabricacion'), 0),
        'horas_montaje',       coalesce(sum(h.hours) filter (where h.work_type = 'montaje'), 0),
        'horas_totales',       coalesce(sum(h.hours), 0),
        'trabajos_validados',  count(distinct (h.origen, h.source_id)),
        'trabajadores',        count(distinct h.worker_id))
        from public.hours_worked h
       where h.work_date between p_from and p_to),

    -- PROYECTOS
    'proyectos', (
      select jsonb_build_object(
        'activos',     count(*) filter (where archived_at is null and phase <> 'finalizado'),
        'creados',     count(*) filter (where created_at::date between p_from and p_to),
        'finalizados', count(*) filter (where finished_at::date between p_from and p_to),
        'dias_medio',  coalesce(round(avg(extract(epoch from (finished_at - created_at)) / 86400)
                                      filter (where finished_at::date between p_from and p_to))::int, 0),
        'por_fase',    (select jsonb_object_agg(phase, n) from (
                          select phase::text as phase, count(*) as n
                            from public.projects where archived_at is null and phase <> 'finalizado'
                           group by phase) f))
        from public.projects),

    -- ÓRDENES DE TRABAJO
    'ordenes', (
      select jsonb_build_object(
        'hoy',        count(*) filter (where scheduled_date = v_today),
        'pendientes', count(*) filter (where status = 'pendiente'),
        'en_curso',   count(*) filter (where status = 'en_curso'),
        'por_revisar', count(*) filter (where status = 'realizada'),
        'devueltas',  count(*) filter (where status = 'devuelta'))
        from public.work_orders where archived_at is null),

    -- MATERIAL
    'material', (
      select jsonb_build_object(
        'pendientes', count(*) filter (where not received),
        'retrasados', count(*) filter (where not received and expected_on < v_today),
        'recibidos',  count(*) filter (where received and updated_at::date between p_from and p_to))
        from public.materials where archived_at is null),

    -- ALERTAS (sin ninguna de exceso de horas)
    'alertas', jsonb_build_object(
      'ordenes_atrasadas', (select count(*) from public.work_orders
                             where archived_at is null and scheduled_date < v_today
                               and status in ('pendiente', 'en_curso', 'devuelta')),
      'ordenes_por_revisar', (select count(*) from public.work_orders
                               where archived_at is null and status = 'realizada'),
      'material_retrasado', (select count(*) from public.materials
                              where archived_at is null and not received and expected_on < v_today),
      'avisos_taller',     (select count(*) from public.material_requests where status = 'pendiente'),
      'fichas_por_asignar', (select count(*) from public.fichas
                              where archived_at is null and status = 'por_asignar'),
      'presupuestos_enviados', (select count(*) from public.fichas
                                 where archived_at is null and type = 'presupuesto' and status = 'enviado')),

    -- ECONÓMICO
    'economico', (
      select jsonb_build_object(
        'presupuestado', coalesce(sum(b.total), 0),
        'cobrado',       coalesce(sum(b.cobrado), 0),
        'pendiente',     coalesce(sum(b.pendiente), 0),
        'por_facturar',  coalesce(sum(b.total) filter (where p.billing_status = 'por_facturar'), 0))
        from public.projects p
        join public.project_billing b on b.project_id = p.id
       where p.archived_at is null),

    'cobrado_periodo', (select coalesce(sum(amount), 0) from public.payments
                         where paid_on between p_from and p_to)

  ) into v;

  return v;
end $$;

-- ---------------------------------------------------------------------
-- INFORMES · PROYECTOS
-- ---------------------------------------------------------------------
create or replace function public.report_projects(p_from date, p_to date)
returns table (
  code text, name text, cliente text, fase text, estado_cobro text,
  creado date, finalizado date, dias integer,
  presupuesto numeric, cobrado numeric, pendiente numeric,
  horas_previstas numeric, horas_reales numeric
)
language sql stable security definer set search_path = public as $$
  select p.code, p.name, c.name,
         public.label_es(p.phase::text),
         public.label_es(p.billing_status::text),
         p.created_at::date,
         p.finished_at::date,
         case when p.finished_at is null then null
              else (p.finished_at::date - p.created_at::date) end,
         coalesce(b.total, 0), coalesce(b.cobrado, 0), coalesce(b.pendiente, 0),
         p.budget_hours_fab + p.budget_hours_mont,
         coalesce((select sum(w.hours) from public.work_orders o
                     join public.work_order_workers w on w.order_id = o.id
                    where o.project_id = p.id and o.archived_at is null), 0)
    from public.projects p
    join public.clients c on c.id = p.client_id
    left join public.project_billing b on b.project_id = p.id
   where public.is_admin()
     and p.archived_at is null
     and (p.created_at::date between p_from and p_to
          or p.finished_at::date between p_from and p_to
          or (p.finished_at is null and p.created_at::date <= p_to))
   order by p.code desc;
$$;

-- Los permisos de siempre, tal cual estaban en el archivo 20.
grant  execute on function public.dashboard_summary(date, date) to authenticated;
revoke execute on function public.dashboard_summary(date, date) from anon, public;


/**
 * HORAS POR TRABAJADOR.
 *
 * Se SUSTITUYE (borrar y crear) porque cambia una columna de nombre:
 * «ordenes» pasa a «trabajos». Contaba órdenes, y con los partes dentro
 * esa palabra habría dejado de ser verdad. Un nombre que miente es peor
 * que un nombre nuevo. Dentro de la transacción del archivo no hay
 * ningún instante sin función.
 *
 * Son HORAS REALES: las del autor de cada parte, las de quienes le
 * acompañaron y las de las órdenes. Solo lo VALIDADO.
 *
 * Incluye las horas de los AVISOS DE CLIENTE: son horas que esa persona
 * ha trabajado, aunque no cuelguen de ningún proyecto.
 */
drop function if exists public.report_hours_by_worker(date, date);

create or replace function public.report_hours_by_worker(p_from date, p_to date)
returns table (trabajador text, fabricacion numeric, montaje numeric, total numeric, trabajos bigint)
language sql stable security definer set search_path = public as $$
  select pr.full_name,
         coalesce(sum(h.hours) filter (where h.work_type = 'fabricacion'), 0),
         coalesce(sum(h.hours) filter (where h.work_type = 'montaje'), 0),
         coalesce(sum(h.hours), 0),
         -- Un trabajo es un parte o una orden. Se cuenta por su
         -- procedencia y su identificador juntos, porque un parte y una
         -- orden podrían llegar a compartir identificador.
         count(distinct (h.origen, h.source_id))
    from public.hours_worked h
    join public.profiles pr on pr.id = h.worker_id
   where public.is_admin()
     and h.work_date between p_from and p_to
   group by pr.full_name
   order by coalesce(sum(h.hours), 0) desc, pr.full_name;
$$;

grant  execute on function public.report_hours_by_worker(date, date) to authenticated;
revoke execute on function public.report_hours_by_worker(date, date) from anon, public;


/**
 * HORAS POR PROYECTO · previstas, reales y desvío.
 *
 * Aquí se ven las dos cosas una al lado de la otra, que es lo que hacía
 * falta:
 *   · PREVISTAS · las que puso administración al presupuestar. Salen de
 *     «projects.budget_hours_fab + budget_hours_mont» y NADA de lo que
 *     haga un trabajador las cambia.
 *   · REALES · las trabajadas de verdad, de «hours_worked».
 *   · DESVÍO · reales menos previstas. Puede ser a favor o en contra.
 *
 * Los partes de un AVISO no salen aquí, y es correcto: no son trabajo de
 * ningún proyecto. Las horas de un aviso las lleva administración en el
 * propio aviso para facturarlo.
 *
 * La firma no cambia, así que basta con redefinirla.
 */
create or replace function public.report_hours_by_project(p_from date, p_to date)
returns table (
  code text, name text, cliente text,
  previstas numeric, fabricacion numeric, montaje numeric, total numeric, desvio numeric
)
language sql stable security definer set search_path = public as $$
  select p.code, p.name, c.name,
         p.budget_hours_fab + p.budget_hours_mont,
         coalesce(sum(h.hours) filter (where h.work_type = 'fabricacion'), 0),
         coalesce(sum(h.hours) filter (where h.work_type = 'montaje'), 0),
         coalesce(sum(h.hours), 0),
         coalesce(sum(h.hours), 0) - (p.budget_hours_fab + p.budget_hours_mont)
    from public.projects p
    join public.clients c on c.id = p.client_id
    -- Antes esto entraba por «work_orders», así que un proyecto con
    -- partes y sin ninguna orden no aparecía siquiera. Ahora entra por
    -- las horas, de donde vengan.
    join public.hours_worked h on h.project_id = p.id
                              and h.work_date between p_from and p_to
   where public.is_admin()
   group by p.id, c.name
   order by coalesce(sum(h.hours), 0) desc, p.code;
$$;

grant  execute on function public.report_hours_by_project(date, date) to authenticated;
revoke execute on function public.report_hours_by_project(date, date) from anon, public;
