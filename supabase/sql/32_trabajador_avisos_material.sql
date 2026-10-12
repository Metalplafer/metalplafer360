-- =====================================================================
-- METALPLAFER360 · BLOQUE 5
-- El día a día del trabajador, y los avisos de taller que se facturan.
--
-- Lo que hace este archivo, y lo que NO hace:
--
--   1) AVISOS DE TALLER. Se usa el sistema de avisos que YA existe
--      (fichas de tipo «aviso», con su código AVI-, sus seis estados,
--      su cliente, su teléfono, su documentación y su historial).
--      No se crea ninguna tabla ni ninguna pantalla paralela.
--      Solo le faltaban dos datos para poder facturar un trabajo de
--      mostrador: el correo electrónico y las horas dedicadas.
--
--   2) EL IMPORTE DE UNA FICHA DEJA DE LLEGARLE AL TRABAJADOR.
--      «fichas» tiene la columna «amount». RLS filtra FILAS, no
--      columnas: el trabajador asignado a un aviso leía la fila
--      entera, importe incluido. Hasta ahora no se rellenaba en los
--      avisos, así que no se notaba; en cuanto se factura un aviso,
--      sería una fuga. Se cierra como en el BLOQUE 1: la tabla pasa a
--      ser de administración y el trabajador entra por una vista sin
--      dinero.
--
--   3) PEDIR MATERIAL SIN ESPERAR A NADA. Ya existía
--      «material_requests» con su revisión; lo único que faltaba era
--      poder abrir una petición sin orden y sin parte. Se reutiliza la
--      MISMA tabla y el MISMO circuito de aceptar/descartar. No hay un
--      segundo sistema de material.
--
--   4) LA PLANIFICACIÓN LLEGA AL TRABAJADOR. «worker_projects» no
--      traía fechas, así que sus proyectos no se podían ordenar por
--      lo que toca antes. Son fechas, no dinero: se añaden.
-- =====================================================================

\set ON_ERROR_STOP on


-- ---------------------------------------------------------------------
-- 1) LOS DOS DATOS QUE LE FALTABAN AL AVISO
--
-- Nada más. Los demás campos que hacen falta para facturar un trabajo
-- de mostrador ya estaban: cliente, asunto, descripción, dirección,
-- teléfono, fecha y hora previstas, responsable e importe.
-- ---------------------------------------------------------------------
alter table public.fichas
  add column if not exists email text,
  add column if not exists hours numeric(6,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fichas_hours_valid') then
    alter table public.fichas add constraint fichas_hours_valid
      check (hours is null or (hours > 0 and hours <= 999));
  end if;
end $$;

comment on column public.fichas.email is
  'Correo de contacto del aviso. Para facturar un trabajo de mostrador, no para enviar nada: la aplicación no manda correos.';
comment on column public.fichas.hours is
  'Horas dedicadas al aviso. Las usa administración para facturarlo.';


-- ---------------------------------------------------------------------
-- 2) EL TRABAJADOR VE SUS VISITAS Y SUS AVISOS, PERO NO EL IMPORTE
--
-- Misma idea que «worker_projects» en el BLOQUE 1: la vista se escribe
-- a propósito SIN la columna del dinero. Lleva «security_barrier» para
-- que el planificador no pueda colar una función del usuario antes del
-- filtro, y el filtro es el mismo «worker_has_ficha» que ya decidía
-- quién entra.
-- ---------------------------------------------------------------------
create or replace view public.worker_fichas with (security_barrier = true) as
  select f.id,
         f.code,
         f.type,
         f.status,
         f.title,
         f.description,
         f.address,
         f.phone,
         f.email,
         f.hours,
         f.scheduled_date,
         f.scheduled_time,
         f.assigned_to,
         f.client_id,
         c.name as client_name,
         f.archived_at,
         f.created_at,
         f.updated_at
    from public.fichas f
    left join public.clients c on c.id = f.client_id
   where public.is_admin() or public.worker_has_ficha(f.id);

comment on view public.worker_fichas is
  'La visita o el aviso tal como los ve un trabajador: sin el importe. El dinero es de administración.';


-- ---------------------------------------------------------------------
-- 3) PEDIR MATERIAL SIN ORDEN Y SIN PARTE
--
-- La petición podía existir solo colgando de una orden o de un parte, y
-- exigía proyecto. Pero quien ve que falta material no siempre sabe
-- para qué proyecto es (puede ser material de taller), y no tiene por
-- qué esperar a rellenar un parte para decirlo.
-- ---------------------------------------------------------------------
alter table public.material_requests alter column project_id drop not null;

comment on column public.material_requests.project_id is
  'El proyecto, si se sabe. Puede quedar vacío: hay material que es de taller o que todavía no se sabe a qué proyecto va.';

-- El índice por proyecto deja de tener sentido con filas sin proyecto.
create index if not exists requests_sin_proyecto_idx on public.material_requests (created_at)
  where project_id is null and status = 'pendiente';


/**
 * SOLICITAR MATERIAL · cualquiera, en cualquier momento.
 *
 * Entra en la MISMA lista que lo que llega desde una orden o un parte, y
 * pasa por la MISMA revisión. El proyecto es opcional; si se indica, el
 * trabajador tiene que tener acceso a ese proyecto (administración, a
 * cualquiera).
 */
create or replace function public.submit_material_need(
  p_project uuid default null, p_body text default null)
returns public.material_requests
language plpgsql security definer set search_path = public as $$
declare
  r public.material_requests;
  p public.projects;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_demo boolean := false;
  v_donde text := '';
begin
  if auth.uid() is null then
    raise exception 'No tienes permisos para realizar esta acción' using errcode = '42501';
  end if;
  if not public.is_active_user() then
    raise exception 'No tienes permisos para realizar esta acción' using errcode = '42501';
  end if;
  if v_body is null then
    raise exception 'Escribe qué material falta' using errcode = '22023';
  end if;

  if p_project is not null then
    select * into p from public.projects where id = p_project;
    if not found then
      raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
    end if;
    if not (public.is_admin() or public.worker_can_see_project(p_project)) then
      raise exception 'Este proyecto no está asignado a ti' using errcode = '42501';
    end if;
    v_demo := p.is_demo;
    v_donde := ' · ' || p.code;
  end if;

  insert into public.material_requests (project_id, order_id, worker_id, body, is_demo)
  values (p_project, null, auth.uid(), v_body, v_demo)
  returning * into r;

  -- Avisa a administración, igual que las demás. Si quien la abre ES
  -- administración, «notify_admins» no se avisa a sí misma (notify_user
  -- descarta al propio actor), así que no se recibe un aviso de uno
  -- mismo: simplemente queda en la lista de revisión.
  perform public.notify_admins('material_solicitado', 'Falta material',
    public.actor_name() || v_donde || ': ' || left(v_body, 160), null);

  return r;
end $$;


/**
 * ACEPTAR una petición. Cambia respecto a antes: ahora puede llegar sin
 * proyecto, y el material pendiente SIEMPRE es de un proyecto (así lo
 * era y así sigue siendo: de ahí cuelgan el calendario y el listado por
 * proyecto). Si la petición no trae proyecto, administración dice a cuál
 * va al aceptarla.
 *
 * Se borra y se vuelve a crear en lugar de añadir una sobrecarga, para
 * que no queden dos funciones con el mismo nombre y la llamada no sea
 * ambigua.
 */
drop function if exists public.accept_material_request(uuid, text, numeric, text, date, date, text);

create or replace function public.accept_material_request(
  p_request uuid, p_name text, p_units numeric default null,
  p_supplier text default null, p_ordered_on date default null,
  p_expected_on date default null, p_notes text default null,
  p_project uuid default null)
returns public.materials
language plpgsql security definer set search_path = public as $$
declare
  r public.material_requests;
  m public.materials;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_project uuid;
begin
  perform public.assert_admin();

  select * into r from public.material_requests where id = p_request for update;
  if not found then raise exception 'No se encuentra la comunicación' using errcode = 'P0002'; end if;
  if r.status <> 'pendiente' then
    raise exception 'Esta comunicación ya está revisada' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'Escribe el nombre del material' using errcode = '22023';
  end if;

  -- El proyecto: el de la petición, o el que diga administración ahora.
  v_project := coalesce(r.project_id, p_project);
  if v_project is null then
    raise exception
      'Esta petición no trae proyecto. Elige a qué proyecto va el material antes de aceptarla'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.projects where id = v_project) then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;

  insert into public.materials (project_id, order_id, name, units, supplier,
                                ordered_on, expected_on, notes, is_demo)
  values (v_project, r.order_id, v_name, p_units, nullif(trim(coalesce(p_supplier, '')), ''),
          p_ordered_on, p_expected_on, nullif(trim(coalesce(p_notes, '')), ''), r.is_demo)
  returning * into m;

  update public.material_requests
     set status = 'aceptada', reviewed_at = now(), reviewed_by = auth.uid(),
         material_id = m.id, project_id = v_project
   where id = p_request;

  perform public.notify_user(r.worker_id, 'material_solicitado',
    'Material anotado', 'Se ha añadido «' || v_name || '» al material pendiente.', r.order_id);

  return m;
end $$;


-- ---------------------------------------------------------------------
-- 3 bis) EL CALENDARIO DEL TRABAJADOR ESTABA VACÍO DE TRABAJO
--
-- Esto es un FALLO que venía del BLOQUE 1 y que no se había visto.
--
-- Al cerrar «projects» a administración (que es lo correcto: ahí está el
-- importe), se vaciaron de rebote las filas del calendario que leían esa
-- tabla. «planned_spans» es «security_invoker», así que para un
-- trabajador devolvía CERO tramos, y las ramas de material y de notas
-- hacían «join public.projects», que para él no devuelve nada.
--
-- Comprobado contra la base de datos antes de tocar nada: Juan, con 4
-- proyectos suyos visibles y 4 materiales visibles, veía en su
-- calendario solo avisos, visitas y «otros». Ni fabricación, ni
-- montaje, ni material. Justo lo que el encargo pide que vea.
--
-- La causa es siempre la misma: una vista que se ejecuta con los
-- permisos de quien pregunta y lee una tabla que es de administración.
-- La solución es la del BLOQUE 1: leer por las vistas que filtran ellas
-- mismas y no llevan dinero («worker_projects», «worker_fichas»).
-- ---------------------------------------------------------------------

/**
 * Los tramos planificados. Pasa a filtrar por su cuenta, igual que
 * «worker_projects»: administración ve todos, y un trabajador los de
 * los proyectos en los que está. No lleva ninguna columna de dinero.
 *
 * «client_name» se añade al final para que «v_calendar» no tenga que
 * volver a «projects» solo por el nombre del cliente.
 */
create or replace view public.planned_spans
  with (security_barrier = true, security_invoker = false) as
  select p.id as project_id, p.code, p.name, 'fabricacion'::text as phase,
         p.fab_start as starts, p.fab_end as ends, p.fab_manual as manual,
         c.name as client_name
    from public.projects p
    left join public.clients c on c.id = p.client_id
   where p.archived_at is null and p.fab_start is not null
     and (public.is_admin() or public.worker_can_see_project(p.id))
  union all
  select p.id, p.code, p.name, 'montaje', p.mont_start, p.mont_end, p.mont_manual,
         c.name
    from public.projects p
    left join public.clients c on c.id = p.client_id
   where p.archived_at is null and p.mont_start is not null
     and (public.is_admin() or public.worker_can_see_project(p.id));

comment on view public.planned_spans is
  'Los tramos planificados. Filtra por su cuenta: administración todos, el trabajador los suyos. Sin dinero.';


/**
 * EL CALENDARIO. Mismas filas que en el BLOQUE 4; lo que cambia es de
 * dónde se leen, para que el trabajador vuelva a ver su trabajo:
 *
 *   · fabricación y montaje → «planned_spans», que ya filtra y trae el
 *     cliente (antes volvía a «projects» y se quedaba sin filas);
 *   · material y notas      → «worker_projects» en lugar de «projects»;
 *   · visitas y avisos      → «worker_fichas», que no lleva el importe;
 *   · obras                 → «works», que es de administración y punto.
 */
create or replace view public.v_calendar with (security_invoker = true) as
  select s.phase                              as kind,
         s.project_id                         as id,
         s.code,
         s.name                               as title,
         case when s.ends > s.starts
              then 'Día ' || d.n || ' de ' || (s.ends - s.starts + 1)
              else null end                   as detail,
         d.day                                as date,
         case when s.manual then 'Colocado a mano' else 'Planificado' end as status,
         s.project_id,
         s.code                               as project_code,
         s.client_name,
         coalesce((select array_agg(distinct w)
                     from (
                       select pw.worker_id as w from public.project_workers pw
                        where pw.project_id = s.project_id
                       union
                       select ow.worker_id from public.work_order_workers ow
                        join public.work_orders o on o.id = ow.order_id
                        where o.project_id = s.project_id and o.archived_at is null
                          and o.type::text = s.phase
                     ) q), '{}'::uuid[]) as assigned,
         true                                 as movable
    from public.planned_spans s
    cross join lateral (
      select g::date as day, row_number() over (order by g) as n
        from generate_series(s.starts, s.ends, interval '1 day') g
       where s.manual or public.is_working_day(g::date)
    ) d

  union all

  select 'material', m.id, null, m.name, m.notes, m.expected_on,
         case when m.received then 'Recibido' else 'Pendiente' end,
         m.project_id, wp.code, wp.client_name, '{}'::uuid[], false
    from public.materials m
    join public.worker_projects wp on wp.id = m.project_id
   where m.archived_at is null and m.expected_on is not null

  union all

  select f.type::text, f.id, f.code,
         coalesce(nullif(trim(f.title), ''), left(coalesce(f.description, ''), 60)),
         f.address, f.scheduled_date, public.label_es(f.status),
         null, null, f.client_name,
         case when f.assigned_to is null then '{}'::uuid[] else array[f.assigned_to] end,
         false
    from public.worker_fichas f
   where f.archived_at is null
     and f.scheduled_date is not null
     and f.type in ('visita', 'aviso')

  union all

  select 'otro', n.id, null, n.title, n.detail, n.day, 'Evento',
         n.project_id, wp.code, wp.client_name, '{}'::uuid[], true
    from public.calendar_notes n
    left join public.worker_projects wp on wp.id = n.project_id

  union all

  -- LA OBRA: de la primera fecha planificada de sus proyectos a la
  -- última. No se puede arrastrar: lo que se mueve son los proyectos.
  select 'obra', w.id, w.code, w.name,
         s.proyectos || ' proyecto(s)',
         g::date,
         'Obra',
         null, w.code,
         c.name,
         '{}'::uuid[],
         false
    from public.works w
    left join public.clients c on c.id = w.client_id
    join public.work_summary s on s.work_id = w.id
    cross join lateral generate_series(s.desde, s.hasta, interval '1 day') g
   where w.archived_at is null
     and s.desde is not null and s.hasta is not null
     and public.is_working_day(g::date);


-- ---------------------------------------------------------------------
-- 4) LA PLANIFICACIÓN, EN LOS PROYECTOS DEL TRABAJADOR
--
-- Para que pueda ordenar sus proyectos por lo que toca antes y ver en
-- la ficha del proyecto qué días le han puesto. Son FECHAS, no dinero:
-- la vista sigue sin importe, sin paga y señal y sin facturación.
--
-- «proximo» es la primera fecha que le afecta, para ordenar sin que el
-- móvil tenga que hacer cuentas.
-- ---------------------------------------------------------------------
create or replace view public.worker_projects with (security_barrier = true) as
  select p.id,
         p.code,
         p.name,
         p.description,
         p.measures,
         p.finish,
         p.location,
         p.address,
         p.observations,
         p.phase,
         p.no_assembly,
         p.budget_hours_fab,
         p.budget_hours_mont,
         p.client_id,
         c.name as client_name,
         p.archived_at,
         p.finished_at,
         p.created_at,
         p.updated_at,
         -- Las columnas nuevas van al final a propósito: «create or
         -- replace view» no permite reordenar ni renombrar las que ya
         -- existían, y así no hay que borrar la vista para cambiarla.
         p.fab_start,
         p.fab_end,
         p.mont_start,
         p.mont_end,
         p.fab_workers,
         p.mont_workers,
         least(p.fab_start, p.mont_start) as proximo
    from public.projects p
    left join public.clients c on c.id = p.client_id
   where public.is_admin() or public.worker_can_see_project(p.id);

comment on view public.worker_projects is
  'El proyecto tal como lo ve un trabajador: con sus fechas planificadas, y sin importe, sin paga y señal y sin facturación.';


-- ---------------------------------------------------------------------
-- 5) PERMISOS
--
-- «fichas» pasa a ser de administración, como «projects» en el BLOQUE 1.
-- El trabajador entra por «worker_fichas», que no tiene el importe. No
-- es que la pantalla lo esconda: la tabla no le devuelve ni una fila.
-- ---------------------------------------------------------------------
grant select on public.worker_fichas to authenticated, service_role;

grant execute on function public.submit_material_need(uuid, text) to authenticated;
revoke execute on function public.submit_material_need(uuid, text) from anon, public;

grant execute on function
  public.accept_material_request(uuid, text, numeric, text, date, date, text, uuid)
  to authenticated;
revoke execute on function
  public.accept_material_request(uuid, text, numeric, text, date, date, text, uuid)
  from anon, public;

revoke all on public.worker_fichas from anon;

drop policy if exists fichas_select on public.fichas;
create policy fichas_select on public.fichas for select to authenticated
  using (public.is_admin());

comment on policy fichas_select on public.fichas is
  'Solo administración. Aquí está el importe, y RLS filtra filas y no columnas: el trabajador entra por «worker_fichas».';
