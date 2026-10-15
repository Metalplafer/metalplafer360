-- =====================================================================
-- METALPLAFER360 · AVISOS ASIGNABLES A VARIOS TRABAJADORES
--                  Y PARTES DE TRABAJO SOBRE UN AVISO
--
-- De qué «aviso» se habla aquí: el AVISO DE CLIENTE, que es una fila de
-- «fichas» con type = 'aviso' (AVI-2026-xxx). NO son los avisos internos
-- («notifications», la campana) ni los avisos de material
-- («material_requests», que cuelgan del proyecto). Son tres cosas
-- distintas y ninguna de las otras dos se toca en este archivo.
--
--
-- TODO LO DE AQUÍ ES ADITIVO. No se borra, no se reasigna y no se
-- modifica ninguna fila existente:
--
--   · «fichas.assigned_to» se queda como está y sigue valiendo. Las
--     asignaciones de hoy siguen funcionando sin migrar ni un dato.
--   · se añade «ficha_workers» para los avisos con VARIOS trabajadores,
--     calcada de «project_workers», que es el modelo que ya existe.
--   · «worker_has_ficha» pasa a mirar los DOS caminos. Es una ampliación:
--     quien entraba antes sigue entrando.
--   · «work_reports» gana «ficha_id», que puede ir en blanco. La columna
--     «project_id» ya era opcional (hay partes sueltos), así que el
--     patrón de un parte sin proyecto ya existía.
--
-- LAS VISITAS SON DE ADMINISTRACIÓN. Se añade una regla que impide
-- asignar una VISITA a un trabajador normal, de aquí en adelante. NO se
-- toca ninguna visita ya asignada: si hubiera alguna, la regla la deja
-- en paz y hay que decidir qué hacer con ella aparte. Está explicado
-- más abajo, en el punto 5.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) UN TIPO DE NOTIFICACIÓN MÁS
--
-- Igual que se hizo con «proyecto_asignado» en el archivo 26. Hace falta
-- para poder avisar a quien se le asigna un aviso. Un valor nuevo de un
-- enumerado no se puede USAR en la misma transacción en la que se añade,
-- pero aquí solo se DEFINEN funciones, así que no hay problema: para
-- cuando alguien llame a «assign_ficha_workers» ya estará confirmado.
--
-- Las notificaciones llevan su propio título y texto, así que añadir un
-- tipo no obliga a tocar nada en la interfaz.
-- ---------------------------------------------------------------------
alter type public.notification_kind add value if not exists 'aviso_asignado';


-- ---------------------------------------------------------------------
-- 1) LOS TRABAJADORES DE UN AVISO
--
-- Misma forma que «project_workers», para que todo lo que ya sabe
-- trabajar con asignaciones no tenga que aprender nada nuevo.
-- ---------------------------------------------------------------------
create table if not exists public.ficha_workers (
  ficha_id    uuid not null references public.fichas(id) on delete cascade,
  worker_id   uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  is_demo     boolean not null default false,
  primary key (ficha_id, worker_id)
);

comment on table public.ficha_workers is
  'Quién trabaja en un aviso. Convive con «fichas.assigned_to», que sigue siendo el responsable y no se toca.';

-- «ficha_id» ya va indexada por la clave primaria, que empieza por ella.
-- Las otras dos claves foráneas necesitan la suya: hay una prueba que
-- exige que NINGUNA clave foránea se quede sin índice, porque sin él
-- borrar la fila referenciada obliga a recorrer la tabla entera.
create index if not exists ficha_workers_worker_idx      on public.ficha_workers (worker_id);
create index if not exists ficha_workers_assigned_by_idx on public.ficha_workers (assigned_by);


-- ---------------------------------------------------------------------
-- 2) QUIÉN ENTRA EN UN AVISO · se AMPLÍA, no se sustituye
--
-- Antes: ser el responsable («assigned_to»).
-- Ahora: ser el responsable O estar en «ficha_workers».
--
-- Se mantiene todo lo demás igual, incluido que el perfil tenga que
-- estar ACTIVO y que la ficha no esté archivada. Esta función gobierna
-- los documentos, los comentarios, el almacenamiento y la vista
-- «worker_fichas», así que ampliarla amplía todo eso de una vez.
--
-- Se conserva «visita» en los tipos: si hoy hubiera una visita asignada
-- a alguien, seguiría viéndola. Quitarla aquí le cerraría el acceso a
-- un trabajo que tiene entre manos, y eso es decisión de administración,
-- no de una migración.
-- ---------------------------------------------------------------------
create or replace function public.worker_has_ficha(p_ficha uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    -- Camino de siempre: es el responsable de la ficha.
    select 1
      from public.fichas f
      join public.profiles pr on pr.id = f.assigned_to and pr.active
     where f.id = p_ficha
       and f.assigned_to = auth.uid()
       and f.type in ('visita', 'aviso')
       and f.archived_at is null)
  or exists (
    -- Camino nuevo: está entre los trabajadores del aviso.
    select 1
      from public.ficha_workers fw
      join public.fichas f    on f.id = fw.ficha_id
      join public.profiles pr on pr.id = fw.worker_id and pr.active
     where fw.ficha_id = p_ficha
       and fw.worker_id = auth.uid()
       and f.type in ('visita', 'aviso')
       and f.archived_at is null);
$$;

comment on function public.worker_has_ficha(uuid) is
  'Si quien pregunta llega a esta ficha: por ser su responsable o por estar entre sus trabajadores.';


-- ---------------------------------------------------------------------
-- 3) ASIGNAR UN AVISO A VARIOS TRABAJADORES
--
-- Calcada de «assign_project_workers»: se manda la lista COMPLETA, se
-- comprueba que todos existen y están activos, se avisa solo a quien
-- entra nuevo y se devuelve el equipo resultante.
--
-- Solo para AVISOS. Una visita no se asigna por aquí (ver el punto 5).
-- ---------------------------------------------------------------------
create or replace function public.assign_ficha_workers(p_ficha uuid, p_workers uuid[])
returns setof public.profiles language plpgsql security definer set search_path = public as $$
declare
  f public.fichas;
  v_ids uuid[] := coalesce(p_workers, '{}');
  v_nuevos uuid[];
  w uuid;
begin
  perform public.assert_admin();

  select * into f from public.fichas where id = p_ficha;
  if not found then
    raise exception 'No se encuentra el aviso' using errcode = 'P0002';
  end if;

  if f.type <> 'aviso' then
    raise exception 'Solo se pueden asignar trabajadores a un aviso. Las visitas y los presupuestos los lleva administración.'
      using errcode = '22023';
  end if;

  if exists (select 1 from unnest(v_ids) u(id)
              where not exists (select 1 from public.profiles pr
                                 where pr.id = u.id and pr.active)) then
    raise exception 'Alguna de las personas no existe o está desactivada' using errcode = '22023';
  end if;

  -- Quién entra nuevo, para avisarle solo a él.
  select coalesce(array_agg(u.id), '{}') into v_nuevos
    from unnest(v_ids) u(id)
   where not exists (select 1 from public.ficha_workers fw
                      where fw.ficha_id = p_ficha and fw.worker_id = u.id);

  delete from public.ficha_workers
   where ficha_id = p_ficha and worker_id <> all(v_ids);

  insert into public.ficha_workers (ficha_id, worker_id, assigned_by, is_demo)
  select p_ficha, u.id, auth.uid(), f.is_demo
    from unnest(v_ids) u(id)
  on conflict (ficha_id, worker_id) do nothing;

  foreach w in array v_nuevos loop
    perform public.notify_user(w, 'aviso_asignado', 'Aviso asignado',
      f.code || coalesce(' · ' || nullif(trim(f.title), ''), ''), null);
  end loop;

  return query
    select pr.* from public.profiles pr
     where pr.id = any(v_ids)
     order by pr.full_name;
end $$;

comment on function public.assign_ficha_workers(uuid, uuid[]) is
  'Pone el equipo de un aviso. Se manda la lista completa, como en los proyectos. Solo administración y solo avisos.';

grant execute on function public.assign_ficha_workers(uuid, uuid[]) to authenticated;
revoke execute on function public.assign_ficha_workers(uuid, uuid[]) from anon, public;


-- ---------------------------------------------------------------------
-- 4) EL EQUIPO DE UN AVISO, PARA LAS PANTALLAS
--
-- Igual que «project_team»: el nombre y el rol, sin datos personales.
-- Se añade el responsable para que la pantalla lo vea todo junto.
-- ---------------------------------------------------------------------
create or replace view public.ficha_team with (security_barrier = true) as
  select fw.ficha_id,
         fw.worker_id,
         pr.full_name,
         pr.role,
         fw.assigned_at,
         false as es_responsable
    from public.ficha_workers fw
    join public.profiles pr on pr.id = fw.worker_id
   where public.is_admin() or public.worker_has_ficha(fw.ficha_id)
  union all
  select f.id, f.assigned_to, pr.full_name, pr.role, f.updated_at, true
    from public.fichas f
    join public.profiles pr on pr.id = f.assigned_to
   where f.assigned_to is not null
     and (public.is_admin() or public.worker_has_ficha(f.id));

comment on view public.ficha_team is
  'Quién va en un aviso: su responsable y sus trabajadores. Sin teléfono ni correo.';

grant select on public.ficha_team to authenticated, service_role;
revoke all on public.ficha_team from anon;

grant select on public.ficha_workers to authenticated, service_role;
grant all    on public.ficha_workers to service_role;
revoke all   on public.ficha_workers from anon;

alter table public.ficha_workers enable row level security;

drop policy if exists ficha_workers_select on public.ficha_workers;
create policy ficha_workers_select on public.ficha_workers for select to authenticated
  using (public.is_admin() or public.worker_has_ficha(ficha_id));

-- No se escriben directamente: se escriben con «assign_ficha_workers»,
-- que comprueba las reglas. Igual que «project_workers».
revoke insert, update, delete, truncate on public.ficha_workers from authenticated;

comment on policy ficha_workers_select on public.ficha_workers is
  'El equipo de un aviso lo ve administración y quien está en ese aviso.';


-- ---------------------------------------------------------------------
-- 5) LAS VISITAS NO SE ASIGNAN A UN TRABAJADOR NORMAL
--
-- Decisión de administración: las visitas las gestiona administración y,
-- si se asignan, se asignan a un perfil de administración.
--
-- Se mete en el disparador que YA existía («trg_fichas_before»), que es
-- donde se deciden los estados de una ficha, en lugar de añadir otro.
-- Se conserva íntegro lo que hacía y se le añade la comprobación.
--
-- IMPORTANTE · QUÉ NO HACE ESTO:
--   · no toca ninguna visita ya asignada;
--   · no reasigna nada;
--   · no borra nada.
-- Solo impide asignaciones NUEVAS. Si hoy existiera alguna visita
-- asignada a un trabajador normal, se queda tal cual y hay que decidir
-- qué hacer con ella; la consulta para saberlo está en las
-- instrucciones de entrega.
--
-- Y como la regla solo mira la asignación, una visita ya asignada se
-- puede seguir guardando (cambiarle la fecha, el texto…): solo se
-- rechaza si se INTENTA PONER o CAMBIAR el responsable a alguien que no
-- es de administración.
-- ---------------------------------------------------------------------
create or replace function public.trg_fichas_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rol text;
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;

  if TG_OP = 'INSERT' then
    new.status := 'por_asignar';
  end if;

  -- LAS VISITAS, SOLO PARA ADMINISTRACIÓN.
  -- Se comprueba únicamente cuando el responsable se pone o se cambia,
  -- para no estorbar al guardar una visita que ya estaba asignada.
  if new.type = 'visita' and new.assigned_to is not null
     and (TG_OP = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    select role into v_rol from public.profiles where id = new.assigned_to;
    if v_rol is distinct from 'admin' then
      raise exception 'Una visita solo se puede asignar a administración. Si el trabajo lo tiene que hacer un trabajador, créalo como aviso.'
        using errcode = '22023';
    end if;
  end if;

  if new.status = 'por_asignar' and new.assigned_to is not null
     and (TG_OP = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    new.status := case new.type
                    when 'presupuesto' then 'pendiente'
                    when 'visita'      then 'asignada'
                    else                    'asignado' end;
  end if;

  return new;
end $$;

drop trigger if exists fichas_before on public.fichas;
create trigger fichas_before before insert or update on public.fichas
  for each row execute function public.trg_fichas_before();


-- ---------------------------------------------------------------------
-- 6) UN PARTE DE TRABAJO SOBRE UN AVISO
--
-- Una columna más en «work_reports», que puede ir en blanco. No se
-- añade ninguna relación entre avisos y proyectos: se decidió
-- expresamente dejar el modelo como está.
--
-- Un parte tiene como mucho UN dueño: un proyecto o un aviso. También
-- puede no tener ninguno, que es el «parte suelto» que ya existía y que
-- administración asigna después a un proyecto.
-- ---------------------------------------------------------------------
alter table public.work_reports add column if not exists ficha_id uuid
  references public.fichas(id) on delete set null;

comment on column public.work_reports.ficha_id is
  'El aviso sobre el que se ha trabajado, si el parte es de un aviso. En blanco si es de un proyecto o si va suelto.';

create index if not exists work_reports_ficha_idx on public.work_reports (ficha_id);

-- Un parte no puede ser de un proyecto Y de un aviso a la vez. Se añade
-- como NOT VALID a propósito: así la restricción vale para todo lo que
-- se escriba de ahora en adelante y NO se comprueban las filas que ya
-- existen (que, por construcción, tienen ficha_id en blanco y cumplen).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'work_reports_un_solo_dueno') then
    alter table public.work_reports add constraint work_reports_un_solo_dueno
      check (project_id is null or ficha_id is null) not valid;
  end if;
end $$;


/**
 * GUARDAR UN PARTE · ahora también sobre un aviso.
 *
 * Se añade «p_ficha» al final, con valor por omisión, para que todas las
 * llamadas que ya existen sigan funcionando exactamente igual: las ocho
 * que manda la aplicación hoy valen tal cual.
 *
 * ¿POR QUÉ SE BORRA LA FUNCIÓN ANTERIOR EN LUGAR DE DEJARLA?
 * Porque añadir un argumento NO reemplaza la función: crea una SEGUNDA
 * con el mismo nombre. Y entonces una llamada con los ocho argumentos de
 * siempre encaja en las dos, así que PostgreSQL ya no sabe cuál quiere
 * («function is not unique») y PostgREST contesta PGRST203. La aplicación
 * manda exactamente esos ocho argumentos con nombre desde
 * «src/services/partes.ts», así que dejar las dos ROMPERÍA el guardado de
 * partes en producción. Está comprobado contra PostgreSQL 16 de verdad.
 *
 * El borrado y el alta van en el mismo archivo y PostgreSQL ejecuta las
 * definiciones dentro de la transacción del script, así que no hay ningún
 * instante en el que la función no exista: hay que ejecutar este archivo
 * COMPLETO de una vez, no a trozos.
 *
 * No se toca ningún parte: esto cambia una función, no datos.
 *
 * La comprobación del aviso es la misma que ya se hacía con el proyecto:
 * tiene que ser uno al que quien escribe tenga acceso de verdad.
 */
drop function if exists public.save_work_report(
  uuid, uuid, public.order_type, date, text, numeric, boolean, boolean);

create or replace function public.save_work_report(
  p_report        uuid    default null,
  p_project       uuid    default null,
  p_work_type     public.order_type default 'fabricacion',
  p_work_date     date    default null,
  p_work_done     text    default null,
  p_hours         numeric default null,
  p_needs_material boolean default false,
  p_submit        boolean default false,
  p_ficha         uuid    default null)
returns public.work_reports language plpgsql security definer set search_path = public as $$
declare
  r public.work_reports;
  v_hours numeric := case when p_hours is null then null else round(p_hours::numeric, 2) end;
  v_done  text    := nullif(trim(coalesce(p_work_done, '')), '');
  v_date  date    := coalesce(p_work_date, public.today_madrid());
  v_estado public.report_status;
begin
  if auth.uid() is null then
    raise exception 'Hace falta tener la sesión iniciada' using errcode = '42501';
  end if;

  if v_hours is not null and (v_hours <= 0 or v_hours > 24) then
    raise exception 'Las horas deben estar entre 0 y 24' using errcode = '22023';
  end if;

  if v_date > public.today_madrid() then
    raise exception 'No se puede rellenar un parte de un día que todavía no ha llegado'
      using errcode = '22023';
  end if;

  if p_project is not null and p_ficha is not null then
    raise exception 'Un parte es de un proyecto o de un aviso, no de los dos'
      using errcode = '22023';
  end if;

  -- El proyecto, si se indica, tiene que ser uno al que se tenga acceso.
  if p_project is not null and not (public.is_admin() or public.worker_can_see_project(p_project)) then
    raise exception 'Ese proyecto no está asignado a ti' using errcode = '42501';
  end if;

  -- Y el aviso, lo mismo: con la función que ya decide quién entra.
  if p_ficha is not null then
    if not exists (select 1 from public.fichas
                    where id = p_ficha and type = 'aviso' and archived_at is null) then
      raise exception 'No se encuentra el aviso' using errcode = 'P0002';
    end if;
    if not (public.is_admin() or public.worker_has_ficha(p_ficha)) then
      raise exception 'Ese aviso no está asignado a ti' using errcode = '42501';
    end if;
  end if;

  if p_submit then
    if v_done is null then
      raise exception 'Escribe qué trabajo has hecho antes de enviar el parte' using errcode = '22023';
    end if;
    if v_hours is null or v_hours <= 0 then
      raise exception 'Indica las horas que has trabajado antes de enviar el parte' using errcode = '22023';
    end if;
  end if;

  v_estado := case when p_submit then 'enviado'::public.report_status
                   else 'borrador'::public.report_status end;

  -- ---------------- Parte nuevo ----------------
  if p_report is null then
    insert into public.work_reports
      (code, worker_id, project_id, ficha_id, work_type, work_date, work_done, hours,
       needs_material, status, submitted_at, is_demo)
    values (public.next_code('PT'), auth.uid(), p_project, p_ficha, p_work_type, v_date,
            v_done, v_hours, coalesce(p_needs_material, false), v_estado,
            case when p_submit then now() else null end,
            coalesce((select is_demo from public.profiles where id = auth.uid()), false))
    returning * into r;

  -- ---------------- Parte que ya existía ----------------
  else
    select * into r from public.work_reports where id = p_report for update;
    if not found then
      raise exception 'No se encuentra el parte de trabajo' using errcode = 'P0002';
    end if;

    if r.worker_id <> auth.uid() then
      raise exception 'Ese parte no es tuyo' using errcode = '42501';
    end if;

    if r.status = 'validado' then
      raise exception 'El parte ya está validado: no se puede modificar' using errcode = '22023';
    end if;

    update public.work_reports
       set project_id     = case when p_ficha is not null then null
                                 else coalesce(p_project, project_id) end,
           ficha_id       = case when p_project is not null then null
                                 else coalesce(p_ficha, ficha_id) end,
           work_type      = p_work_type,
           work_date      = v_date,
           work_done      = v_done,
           hours          = v_hours,
           needs_material = coalesce(p_needs_material, false),
           status         = v_estado,
           submitted_at   = case when p_submit then now() else null end,
           -- Al corregir y reenviar, el rechazo anterior deja de aplicar.
           rejected_at    = case when p_submit then null else rejected_at end,
           reject_reason  = case when p_submit then null else reject_reason end,
           updated_at     = now()
     where id = p_report
    returning * into r;
  end if;

  if p_submit then
    perform public.notify_admins_report('parte_enviado', 'Parte pendiente de validación',
      public.actor_name() || ' ha enviado el parte ' || r.code ||
      ' (' || public.fmt_hours(r.hours) || ')', r.id);
  end if;

  return r;
end $$;

comment on function public.save_work_report(uuid, uuid, public.order_type, date, text, numeric, boolean, boolean, uuid) is
  'Guarda o envía un parte. Puede colgar de un proyecto, de un aviso o de nada. Las horas son SIEMPRE horas reales trabajadas.';

grant execute on function public.save_work_report(
  uuid, uuid, public.order_type, date, text, numeric, boolean, boolean, uuid) to authenticated;
revoke execute on function public.save_work_report(
  uuid, uuid, public.order_type, date, text, numeric, boolean, boolean, uuid) from anon, public;


-- ---------------------------------------------------------------------
-- 7) LOS AVISOS DEL TRABAJADOR, PARA SU LISTADO DE TRABAJOS
--
-- «worker_fichas» ya le daba sus fichas sin el importe, y ahora incluye
-- también los avisos en los que está por «ficha_workers», porque esa
-- vista se filtra con «worker_has_ficha», que es lo que se ha ampliado
-- arriba. No hay que rehacerla.
--
-- Lo que falta es una vista ordenada para la pantalla, equivalente a
-- «worker_projects.proximo»: lo que toca antes, primero.
-- ---------------------------------------------------------------------
create or replace view public.worker_avisos with (security_barrier = true) as
  select f.id,
         f.code,
         f.status,
         f.title,
         f.description,
         f.address,
         f.phone,
         f.scheduled_date,
         f.scheduled_time,
         f.client_id,
         c.name as client_name,
         f.assigned_to,
         (select count(*) from public.work_reports r
           where r.ficha_id = f.id and r.worker_id = auth.uid()) as mis_partes,
         f.created_at,
         f.updated_at
    from public.fichas f
    left join public.clients c on c.id = f.client_id
   where f.type = 'aviso'
     and f.archived_at is null
     and (public.is_admin() or public.worker_has_ficha(f.id));

comment on view public.worker_avisos is
  'Los avisos que tiene asignados quien pregunta, SIN el importe. Es el equivalente de «worker_projects» para los avisos.';

grant select on public.worker_avisos to authenticated, service_role;
revoke all on public.worker_avisos from anon;


-- ---------------------------------------------------------------------
-- 8) LOS DATOS DE EJEMPLO DEJAN DE DAR VISITAS A LOS TRABAJADORES
--
-- «seed_demo()» creaba dos visitas de ejemplo y las repartía entre los
-- trabajadores, porque su lista de candidatos («v_workers») solo recoge
-- los perfiles con rol «worker». Con la regla del punto 5, esa función
-- fallaría, y cargar los datos de ejemplo es algo que hoy FUNCIONA. Así
-- que se vuelve a definir aquí con un único arreglo: las visitas de
-- ejemplo se asignan a un perfil de ADMINISTRACIÓN.
--
-- Se redefine entera porque PostgreSQL no permite parchear un trozo de
-- una función. Es el MISMO cuerpo que el del archivo 23, línea por
-- línea, con tres añadidos y ni una línea quitada ni movida:
--
--   · «v_admins», una lista para los perfiles de administración;
--   · se llena al crear las personas del ejemplo;
--   · el reparto de las fichas manda las visitas a esa lista.
--
-- No se reescribe el archivo 23 porque es histórico y porque hay
-- instrucción expresa de no volver a ejecutarlo: el arreglo tiene que
-- llegar a producción por aquí.
--
-- Si el ejemplo no tuviera ningún perfil de administración, la visita se
-- quedaría SIN asignar (y por tanto «por_asignar»), que es lo correcto;
-- no falla.
-- ---------------------------------------------------------------------
create or replace function public.seed_demo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  hoy date := public.today_madrid();
  anio int := extract(year from public.today_madrid())::int;
  v_cols text; v_vals text;
  v_client uuid; v_project uuid; v_order uuid; v_worker uuid; v_ficha uuid;
  v_clients uuid[] := '{}'; v_projects uuid[] := '{}'; v_workers uuid[] := '{}';
  v_admins uuid[] := '{}';   -- migración 38: para las visitas
  v_orders uuid[] := '{}';
  i int; j int; r record; v_n int;
  v_resumen jsonb;
begin
  perform public.assert_admin();

  if exists (select 1 from public.clients where is_demo) then
    raise exception 'Los datos de ejemplo ya están puestos. Si quieres volver a '
                    'empezar, usa antes «Limpiar datos demo».' using errcode = '22023';
  end if;

  -- El historial de cada fila lo escribe su disparador; para el ejemplo
  -- sería ruido, así que se silencia y luego se deja una sola anotación.
  perform set_config('app.skip_audit', 'on', true);

  -- =================================================================
  -- 1) SEIS TRABAJADORES
  --
  -- Se crean como usuarios de verdad para que puedan aparecer en las
  -- órdenes y en los informes. Nacen SIN contraseña: si quieres entrar
  -- como uno de ellos, pónsela desde Configuración → Trabajadores.
  --
  -- El insert se arma mirando qué columnas tiene «auth.users» en esta
  -- instalación, porque Supabase tiene muchas más que un PostgreSQL
  -- pelado y no todas existen siempre.
  -- =================================================================
  for r in
    select * from (values
      ('Montse Grau Roca',    'demo.montse',  '600 111 001', 'admin'),
      ('Jordi Pujol Camps',   'demo.jordi',   '600 111 002', 'worker'),
      ('Marc Soler Vidal',    'demo.marc',    '600 111 003', 'worker'),
      ('Iván Ruiz Delgado',   'demo.ivan',    '600 111 004', 'worker'),
      ('Toni Bosch Prat',     'demo.toni',    '600 111 005', 'worker'),
      ('Nuria Cano Mesa',     'demo.nuria',   '600 111 006', 'worker')
    ) as p(nombre, usuario, telefono, rol)
  loop
    -- Los usuarios del ejemplo llevan el prefijo «demo.» para que no
    -- puedan chocar nunca con una persona de verdad.
    if exists (select 1 from public.profiles where username = r.usuario) then
      continue;
    end if;

    v_worker := gen_random_uuid();

    select string_agg(quote_ident(c), ', '),
           string_agg(case c
             when 'id'                 then quote_literal(v_worker) || '::uuid'
             when 'email'              then quote_literal(r.usuario || '@demo.metalplafer')
             when 'raw_user_meta_data' then quote_literal(jsonb_build_object(
                                              'username', r.usuario,
                                              'full_name', r.nombre,
                                              'phone', r.telefono,
                                              'is_demo', true)::text) || '::jsonb'
             when 'raw_app_meta_data'  then quote_literal('{"provider":"email"}') || '::jsonb'
             when 'aud'                then quote_literal('authenticated')
             when 'role'               then quote_literal('authenticated')
             when 'instance_id'        then quote_literal('00000000-0000-0000-0000-000000000000') || '::uuid'
             when 'email_confirmed_at' then 'now()'
             when 'created_at'         then 'now()'
             when 'updated_at'         then 'now()'
             end, ', ')
      into v_cols, v_vals
      from unnest(array['id', 'email', 'raw_user_meta_data', 'raw_app_meta_data',
                        'aud', 'role', 'instance_id', 'email_confirmed_at',
                        'created_at', 'updated_at']) c
     where exists (select 1 from information_schema.columns
                    where table_schema = 'auth' and table_name = 'users' and column_name = c);

    execute format('insert into auth.users (%s) values (%s)', v_cols, v_vals);

    -- El disparador de alta ya ha creado el perfil: se marca y se ajusta.
    update public.profiles
       set is_demo = true, role = r.rol::public.user_role,
           full_name = r.nombre, phone = r.telefono
     where id = v_worker;

    if r.rol = 'worker' then
      v_workers := v_workers || v_worker;
    elsif r.rol = 'admin' then
      v_admins := v_admins || v_worker;   -- migración 38
    end if;
  end loop;

  -- =================================================================
  -- 2) DIEZ CLIENTES
  -- =================================================================
  for r in
    select * from (values
      ('empresa',    'García Construcciones SL',    'B99000001', '937 201 145', 'Carrer de la Indústria, 12', 'Sabadell',    '08202'),
      ('empresa',    'Promocions Vallès SA',        'A99000002', '937 202 233', 'Avinguda Barberà, 88',       'Sabadell',    '08203'),
      ('empresa',    'Reformes Integrals Bages',    'B99000003', '938 745 012', 'Carrer Nou, 3',              'Manresa',     '08241'),
      ('empresa',    'Comunitat Propietaris Rambla','H99000004', '937 203 909', 'Rambla, 45',                 'Sabadell',    '08201'),
      ('empresa',    'Tallers Metàl·lics Ripoll',   'B99000005', '937 204 777', 'Polígon Can Roqueta, nau 8', 'Sabadell',    '08202'),
      ('particular', 'Marta Ferrer Puig',           null,        '620 334 551', 'Passeig Plaça Major, 8',     'Sabadell',    '08201'),
      ('particular', 'Albert Casas Tomàs',          '99000007P', '619 887 442', 'Carrer Sant Antoni, 21',     'Terrassa',    '08221'),
      ('particular', 'Rosa Miralles Font',          null,        '638 112 903', 'Carrer del Sol, 4',          'Castellar',   '08211'),
      ('particular', 'Xavier Oliva Serra',          '99000009R', '655 220 118', 'Avinguda Onze de Setembre, 60', 'Sabadell', '08208'),
      ('particular', 'Dolors Vila Ametller',        null,        '677 909 314', 'Carrer Major, 2',            'Sant Quirze', '08192')
    ) as c(tipo, nombre, cif, tel, dir, ciudad, cp)
  loop
    begin
      insert into public.clients (kind, name, tax_id, phone, address, city, postal_code, is_demo, created_at)
      values (r.tipo::public.client_kind, r.nombre, r.cif, r.tel, r.dir, r.ciudad, r.cp, true,
              now() - (random() * 180 || ' days')::interval)
      returning id into v_client;
    exception when unique_violation then
      -- Los CIF del ejemplo son inventados (99.000.00x), pero si alguno
      -- coincidiera con un cliente real, el ejemplo entra sin CIF.
      insert into public.clients (kind, name, tax_id, phone, address, city, postal_code, is_demo, created_at)
      values (r.tipo::public.client_kind, r.nombre, null, r.tel, r.dir, r.ciudad, r.cp, true,
              now() - (random() * 180 || ' days')::interval)
      returning id into v_client;
    end;
    v_clients := v_clients || v_client;
  end loop;

  -- Un par de personas de contacto en los clientes de empresa
  insert into public.client_contacts (client_id, name, role, phone, is_demo)
  values (v_clients[1], 'Pere García',  'Jefe de obra',  '600 445 112', true),
         (v_clients[2], 'Laia Serrat',  'Administración','600 445 113', true),
         (v_clients[4], 'Joan Rovira',  'Presidente',    '600 445 114', true);

  -- =================================================================
  -- 3) QUINCE FICHAS · presupuestos, visitas y avisos
  -- =================================================================
  for r in
    select * from (values
      ('presupuesto','Barandilla escalera comunitaria', 'aceptado',    1,  6400.00, -95),
      ('presupuesto','Puerta corredera para nave',      'aceptado',    2, 12800.00, -88),
      ('presupuesto','Reja ventana cocina',             'aceptado',    6,  1200.00, -70),
      ('presupuesto','Estructura porche de acero',      'aceptado',    7,  8900.00, -62),
      ('presupuesto','Cerramiento terraza',             'enviado',     9,  4350.00, -21),
      ('presupuesto','Pasamanos de acero inoxidable',   'enviado',     3,  2100.00, -14),
      ('presupuesto','Vallado perimetral 40 m',         'por_revisar', 5, 15200.00,  -9),
      ('presupuesto','Escalera de caracol',             'avanzado',    8,  5600.00,  -6),
      ('presupuesto','Marquesina entrada',              'pendiente',  10,  3300.00,  -3),
      ('presupuesto','Puerta de garaje basculante',     'por_asignar',10,  2750.00,  -1),
      ('visita',     'Medir hueco de escalera',         'realizada',   1,  null,    -40),
      ('visita',     'Ver estado del vallado',          'asignada',    5,  null,     -2),
      ('aviso',      'Puerta de garaje que no cierra',  'cerrado',     4,  null,    -55),
      ('aviso',      'Cierre que no ajusta',            'en_curso',    6,  null,     -4),
      ('aviso',      'Bisagra suelta en la reja',       'por_asignar', 8,  null,      0)
    ) as f(tipo, titulo, estado, cliente, importe, dias)
  loop
    insert into public.fichas (type, client_id, title, status, amount, assigned_to,
                               scheduled_date, address, phone, is_demo, created_at)
    select r.tipo::public.ficha_type, v_clients[r.cliente], r.titulo, r.estado,
           r.importe,
           -- Migración 38 · UNA VISITA ES DE ADMINISTRACIÓN. Antes el
           -- ejemplo se la daba a un trabajador, y eso ya no se permite.
           case when r.estado = 'por_asignar' then null
                when r.tipo = 'visita' then
                  v_admins[1 + (r.cliente % greatest(array_length(v_admins, 1), 1))]
                else v_workers[1 + (r.cliente % greatest(array_length(v_workers, 1), 1))] end,
           case when r.tipo = 'presupuesto' then null else hoy + r.dias + 3 end,
           c.address, c.phone, true, now() + (r.dias || ' days')::interval
      from public.clients c where c.id = v_clients[r.cliente];
  end loop;

  -- =================================================================
  -- 4) OCHO PROYECTOS · repartidos por todas las fases
  -- =================================================================
  for r in
    select * from (values
      ('Barandilla escalera comunitaria','Barandilla de acero para escalera de 4 plantas.','4 tramos · 3,20 m','Negro forja', 1, 6400.00, 40, 16,'finalizado',  'cobrado',        -95),
      ('Puerta corredera para nave',     'Puerta corredera motorizada de 5 × 3 m.',        '5,00 × 3,00 m',   'Galvanizado',  2,12800.00, 72, 24,'facturacion', 'cobrado_parcial',-88),
      ('Reja ventana cocina',            'Reja fija con barrotes cada 12 cm.',             '1,20 × 0,90 m',   'Gris RAL 7016',6, 1200.00,  8,  2,'finalizado',  'cobrado',        -70),
      ('Estructura porche de acero',     'Estructura y cubierta de chapa.',                '6,00 × 3,50 m',   'Imprimación',  7, 8900.00, 56, 32,'montaje',     'pendiente_cobro',-62),
      ('Cerramiento terraza',            'Cerramiento con perfilería y vidrio.',           '4,50 m lineales', 'Blanco',       9, 4350.00, 24, 12,'fabricacion', 'por_facturar',   -30),
      ('Pasamanos de acero inoxidable',  'Pasamanos AISI 304 pulido.',                     '12 m lineales',   'Inox pulido',  3, 2100.00, 16,  6,'fabricacion', 'por_facturar',   -18),
      ('Vallado perimetral',             'Vallado de 40 m con puerta peatonal.',           '40 m',            'Verde RAL 6005',5,15200.00, 88, 40,'preparacion','por_facturar',   -10),
      ('Escalera de caracol',            'Escalera de caracol de dos plantas.',            'Ø 1,60 m',        'Negro forja',  8, 5600.00, 48, 20,'preparacion','por_facturar',    -5)
    ) as p(nombre, descripcion, medidas, acabado, cliente, importe, hfab, hmont, fase, cobro, dias)
  loop
    insert into public.projects (client_id, name, description, measures, finish, location, address,
                                 budget_amount, budget_hours_fab, budget_hours_mont,
                                 phase, billing_status, finished_at, is_demo, created_at)
    select v_clients[r.cliente], r.nombre, r.descripcion, r.medidas, r.acabado,
           'Obra de ' || c.name, c.address,
           r.importe, r.hfab, r.hmont,
           r.fase::public.project_phase, r.cobro::public.billing_status,
           case when r.fase = 'finalizado' then now() + ((r.dias + 60) || ' days')::interval end,
           true, now() + (r.dias || ' days')::interval
      from public.clients c where c.id = v_clients[r.cliente]
    returning id into v_project;
    v_projects := v_projects || v_project;
  end loop;

  -- Subestados en los proyectos que están en marcha
  insert into public.project_substatuses (project_id, phase, substatus, is_demo)
  values (v_projects[4], 'montaje',     'en_montaje',        true),
         (v_projects[5], 'fabricacion', 'en_fabricacion',    true),
         (v_projects[6], 'fabricacion', 'falta_material',    true),
         (v_projects[7], 'preparacion', 'pendiente_planos',  true),
         (v_projects[8], 'preparacion', 'pendiente_visita_tecnica', true);

  -- =================================================================
  -- 5) VEINTE ÓRDENES DE TRABAJO, con sus partes y sus horas
  -- =================================================================
  for r in
    select * from (values
      (1,'fabricacion','Cortar pletina y soldar los cuatro tramos.',      24,'validada',  -80, 2),
      (1,'montaje',    'Colocar la barandilla y anclar a la escalera.',   16,'validada',  -72, 2),
      (2,'fabricacion','Fabricar bastidor y guías.',                      40,'validada',  -60, 3),
      (2,'fabricacion','Montar el motor y probar el recorrido.',          16,'validada',  -52, 2),
      (2,'montaje',    'Instalar en la nave y ajustar finales de carrera.',24,'validada', -40, 3),
      (3,'fabricacion','Cortar barrotes y soldar el marco.',               8,'validada',  -65, 1),
      (3,'montaje',    'Colocar la reja con tacos químicos.',              2,'validada',  -58, 1),
      (4,'fabricacion','Preparar pilares y vigas del porche.',            32,'validada',  -45, 3),
      (4,'fabricacion','Imprimación y acabado de la estructura.',         16,'validada',  -30, 2),
      (4,'montaje',    'Montaje de la estructura en obra.',               24,'realizada',  -2, 3),
      (4,'montaje',    'Colocar la chapa de cubierta.',                    8,'pendiente',   3, 2),
      (5,'fabricacion','Cortar perfilería del cerramiento.',              12,'validada',  -12, 2),
      (5,'fabricacion','Preparar los marcos para el vidrio.',             12,'en_curso',    0, 2),
      (5,'montaje',    'Montar el cerramiento en la terraza.',            12,'pendiente',   5, 2),
      (6,'fabricacion','Cortar y pulir el pasamanos.',                    10,'devuelta',   -3, 1),
      (6,'fabricacion','Soldar soportes intermedios.',                     6,'pendiente',   2, 1),
      (6,'montaje',    'Colocar el pasamanos en la escalera.',             6,'pendiente',   7, 2),
      (7,'fabricacion','Cortar los postes del vallado.',                  40,'pendiente',   4, 3),
      (7,'montaje',    'Replanteo y hormigonado de postes.',              24,'pendiente',   9, 3),
      (8,'fabricacion','Trazar y cortar los peldaños.',                   24,'pendiente',   6, 2)
    ) as o(proyecto, tipo, descripcion, horas, estado, dias, personas)
  loop
    insert into public.work_orders (project_id, type, description, planned_hours,
                                    scheduled_date, status, submitted_at, validated_at, validated_by,
                                    returned_at, return_reason, is_demo, created_at)
    values (v_projects[r.proyecto], r.tipo::public.order_type, r.descripcion, r.horas,
            hoy + r.dias, r.estado::public.order_status,
            case when r.estado in ('realizada', 'validada')
                 then now() + (r.dias || ' days')::interval end,
            case when r.estado = 'validada' then now() + ((r.dias + 1) || ' days')::interval end,
            case when r.estado = 'validada' then (select id from public.profiles
                                                   where role = 'admin' and is_demo limit 1) end,
            case when r.estado = 'devuelta' then now() - interval '2 days' end,
            case when r.estado = 'devuelta'
                 then 'Faltan las fotografías del pulido y las horas no cuadran con el parte.' end,
            true, now() + ((r.dias - 5) || ' days')::interval)
    returning id into v_order;
    v_orders := v_orders || v_order;

    -- El parte de cada persona asignada
    for j in 1 .. least(r.personas, array_length(v_workers, 1)) loop
      insert into public.work_order_workers (order_id, worker_id, work_done, hours, submitted_at, is_demo)
      values (v_order,
              v_workers[1 + ((r.proyecto + j) % array_length(v_workers, 1))],
              case when r.estado in ('realizada', 'validada')
                   then r.descripcion || ' Terminado sin incidencias.'
                   when r.estado = 'en_curso' then 'Empezado esta mañana.'
                   when r.estado = 'devuelta' then 'Pulido terminado.'
                   end,
              case when r.estado in ('realizada', 'validada')
                   then round((r.horas::numeric / r.personas) * (0.85 + random() * 0.3)::numeric, 1)
                   when r.estado = 'en_curso' then 3.5
                   when r.estado = 'devuelta' then 9
                   end,
              case when r.estado in ('realizada', 'validada')
                   then now() + (r.dias || ' days')::interval end,
              true)
      on conflict (order_id, worker_id) do nothing;
    end loop;
  end loop;

  -- =================================================================
  -- 6) MATERIAL PENDIENTE (y lo que ya llegó)
  -- =================================================================
  for r in
    select * from (values
      (5,'Perfil aluminio 60×40',      24,'Aluminis Vallès',     -20, -8, true),
      (5,'Vidrio laminar 6+6',          6,'Vidres Sabadell',     -18, -2, true),
      (6,'Tubo inox 40 mm AISI 304',   12,'Inoxidables Terrassa',-15,  2, false),
      (6,'Soportes de pasamanos',      18,'Ferretería Sabadell', -12, -4, false),
      (7,'Poste galvanizado 2,5 m',    22,'Aceros Vallès',        -8,  6, false),
      (7,'Malla electrosoldada',       40,'Aceros Vallès',        -8,  6, false),
      (8,'Pletina 40×8 mm',            30,'Aceros Vallès',        -5,  9, false),
      (8,'Peldaño chapa lagrimada',    16,'Aceros Vallès',        -5, 11, false),
      (4,'Chapa grecada cubierta',     28,'Cobertes Bages',      -10, -1, false),
      (4,'Tornillería autoperforante',200,'Ferretería Sabadell', -10, -6, true),
      (2,'Motor puerta corredera',      1,'Automatismes Vallès', -50,-42, true),
      (3,'Tacos químicos',             12,'Ferretería Sabadell', -60,-55, true)
    ) as m(proyecto, nombre, unidades, proveedor, pedido, previsto, recibido)
  loop
    insert into public.materials (project_id, name, units, supplier, ordered_on, expected_on,
                                  received, notes, is_demo, created_at)
    values (v_projects[r.proyecto], r.nombre, r.unidades, r.proveedor,
            hoy + r.pedido, hoy + r.previsto, r.recibido,
            case when not r.recibido and hoy + r.previsto < hoy
                 then 'El proveedor avisó de que va con retraso.' end,
            true, now() + (r.pedido || ' days')::interval);
  end loop;

  -- Un aviso del taller pendiente de revisar por administración
  insert into public.material_requests (worker_id, order_id, project_id, body, status, is_demo)
  values (v_workers[1], v_orders[13], v_projects[5],
          'Faltan 3 bisagras para terminar los marcos.', 'pendiente', true);

  -- =================================================================
  -- 7) COBROS
  -- =================================================================
  insert into public.payments (project_id, amount, paid_on, notes, is_demo)
  values (v_projects[1], 3200.00, hoy - 70, 'Anticipo del 50 %',  true),
         (v_projects[1], 3200.00, hoy - 30, 'Resto a la entrega', true),
         (v_projects[2], 6400.00, hoy - 45, 'Anticipo del 50 %',  true),
         (v_projects[3], 1200.00, hoy - 55, 'Pago único',         true);

  -- =================================================================
  -- 8) DOCUMENTOS
  --
  -- Son la FICHA del archivo, no el archivo: el ejemplo no sube nada al
  -- almacenamiento. Aparecen en los listados y en el historial, pero al
  -- intentar descargarlos la aplicación dirá que no los encuentra.
  -- =================================================================
  insert into public.documents (project_id, bucket, storage_path, file_name, category,
                                size_bytes, mime_type, is_demo)
  values (v_projects[1], 'documentos', 'demo/proyectos/1/plano-barandilla.pdf',
          'Plano barandilla.pdf', 'documento', 284_512, 'application/pdf', true),
         (v_projects[2], 'documentos', 'demo/proyectos/2/plano-puerta.pdf',
          'Plano puerta corredera.pdf', 'documento', 612_804, 'application/pdf', true),
         (v_projects[2], 'documentos', 'demo/proyectos/2/ficha-motor.pdf',
          'Ficha técnica del motor.pdf', 'documento', 1_204_331, 'application/pdf', true),
         (v_projects[4], 'documentos', 'demo/proyectos/4/calculo-estructura.pdf',
          'Cálculo de la estructura.pdf', 'documento', 903_117, 'application/pdf', true),
         (v_projects[5], 'documentos', 'demo/proyectos/5/medidas-terraza.pdf',
          'Medidas de la terraza.pdf', 'documento', 156_922, 'application/pdf', true),
         (v_projects[7], 'documentos', 'demo/proyectos/7/replanteo-vallado.pdf',
          'Replanteo del vallado.pdf', 'documento', 421_006, 'application/pdf', true);

  -- =================================================================
  -- 9) Una sola anotación en el historial
  -- =================================================================
  perform set_config('app.skip_audit', 'off', true);

  select jsonb_build_object(
    'clientes',   (select count(*) from public.clients         where is_demo),
    'fichas',     (select count(*) from public.fichas          where is_demo),
    'proyectos',  (select count(*) from public.projects        where is_demo),
    'trabajadores',(select count(*) from public.profiles       where is_demo),
    'ordenes',    (select count(*) from public.work_orders     where is_demo),
    'materiales', (select count(*) from public.materials       where is_demo),
    'documentos', (select count(*) from public.documents       where is_demo),
    'cobros',     (select count(*) from public.payments        where is_demo)
  ) into v_resumen;

  perform public.log_event('datos_demo', 'app_settings',
    public.actor_name() || ' puso los datos de ejemplo', v_resumen);

  return v_resumen;
end $$;

-- Los permisos de siempre, tal cual estaban en el archivo 23.
revoke all    on function public.seed_demo() from public, anon;
grant execute on function public.seed_demo() to authenticated;

-- ---------------------------------------------------------------------
-- 9) ASIGNAR UN PARTE A UN PROYECTO · ahora sabe de los avisos
--
-- Administración puede coger un parte suelto y ponerle un proyecto. Un
-- parte de un AVISO no es un parte suelto: ya tiene dueño. Si se le
-- pusiera además un proyecto, el parte colgaría de dos sitios.
--
-- La restricción del punto 6 ya lo impide, pero el mensaje que da una
-- restricción no lo entiende nadie. Aquí se dice en castellano y con el
-- código del aviso delante. Es el MISMO cuerpo del archivo 27 con esa
-- comprobación añadida; no se quita ni se cambia nada más.
-- ---------------------------------------------------------------------
create or replace function public.assign_report_to_project(p_report uuid, p_project uuid)
returns public.work_reports language plpgsql security definer set search_path = public as $$
declare r public.work_reports; v_project public.projects;
begin
  perform public.assert_admin();

  select * into r from public.work_reports where id = p_report for update;
  if not found then
    raise exception 'No se encuentra el parte de trabajo' using errcode = 'P0002';
  end if;

  -- Un parte de un AVISO DE CLIENTE ya tiene dueño. Ponerle además un
  -- proyecto dejaría el parte colgando de dos sitios, y sus horas se
  -- podrían contar dos veces. Se dice POR QUÉ, en lugar de dejar que
  -- salte la restricción con un mensaje que nadie entiende.
  if p_project is not null and r.ficha_id is not null then
    raise exception 'El parte % es del aviso %, así que no se le puede poner un proyecto. '
                    'Las horas de un aviso van al aviso.',
                    r.code, (select code from public.fichas where id = r.ficha_id)
      using errcode = '22023';
  end if;

  if p_project is not null then
    select * into v_project from public.projects where id = p_project;
    if not found then
      raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
    end if;
  end if;

  update public.work_reports
     set project_id  = p_project,
         assigned_at = case when p_project is null then null else now() end,
         assigned_by = case when p_project is null then null else auth.uid() end,
         updated_at  = now()
   where id = p_report
  returning * into r;

  return r;
end $$;

-- Los permisos de siempre, tal cual estaban en el archivo 28.
grant  execute on function public.assign_report_to_project(uuid, uuid) to authenticated;
revoke execute on function public.assign_report_to_project(uuid, uuid) from anon, public;
