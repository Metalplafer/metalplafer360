-- =====================================================================
-- METALPLAFER360 · LOS PRESUPUESTOS Y LOS AVISOS DEJAN DE TENER
--                  RESPONSABLE ADMINISTRATIVO
--
--
-- QUÉ CAMBIA
--
-- Un presupuesto ya no se le «asigna» a nadie: lo prepara quien lo
-- prepare y eso es gestión interna, no un dato de la ficha. Un aviso
-- tampoco: lo que importa es qué OPERARIOS van a hacer el trabajo, y eso
-- ya se lleva aparte desde el archivo 38.
--
-- Así que ninguno de los dos nace ya en «Por asignar»:
--
--   presupuesto  →  nace en «Presupuesto pendiente»
--   aviso        →  nace en «Pendiente»
--   visita       →  SIGUE naciendo en «Por asignar» (no se toca)
--
-- LAS VISITAS NO SE TOCAN. Las lleva administración, se asignan a un
-- perfil de administración y su flujo se queda exactamente igual.
--
--
-- «POR ASIGNAR» SIGUE SIENDO UN ESTADO VÁLIDO · esto es importante
--
-- Dejar de PRODUCIR un estado y dejar de ADMITIRLO son dos cosas
-- distintas, y aquí solo se hace la primera.
--
-- Hay fichas que están en «Por asignar» ahora mismo. Si se quitara del
-- catálogo, esas fichas quedarían en falta con su propia restricción y
-- dejarían de poder guardarse aunque nadie les cambiara el estado. Se
-- comprobó rompiéndolo a propósito: quitar «por_asignar» hace fallar
-- NUEVE áreas de pruebas distintas.
--
-- Por eso el catálogo (archivo 42) lo mantiene, la traducción al
-- castellano lo mantiene, y la pantalla sigue sabiendo pintarlo. Lo
-- único que cambia es que ninguna ficha nueva entra ahí.
--
-- Esas fichas antiguas se quedan donde están. Si se quiere moverlas a
-- «Pendiente», eso es una migración de DATOS y va aparte, en el archivo
-- 49, pendiente de aprobación.
--
--
-- UNA DECISIÓN QUE HE TOMADO, Y SE PUEDE DESHACER EN UNA LÍNEA
--
-- Al quitar el responsable del aviso, «Asignado» se quedaba sin nadie
-- que lo pusiera: administración tendría que marcarlo a mano cada vez.
-- Así que ahora lo pone REPARTIR EL AVISO entre operarios, que es donde
-- ocurre la asignación de verdad.
--
-- No es una regla nueva: es la misma de siempre (asignar → «Asignado»)
-- movida al sitio donde ahora se asigna. Y solo avanza desde «Pendiente»
-- o «Por asignar»: un aviso en curso o cerrado NO retrocede por cambiar
-- el equipo.
--
--
-- MIGRACIÓN ESTRUCTURAL. No crea ni borra tablas ni columnas, y NO
-- cambia el estado de ninguna ficha existente.
--
-- «fichas.assigned_to» NO se retira: las visitas la siguen usando y los
-- presupuestos y avisos antiguos conservan su valor histórico.
--
-- DEPENDE DE: el archivo 38 (de ahí salen el disparador y la función de
-- reparto que aquí se amplían) y el 42 (el estado nuevo del panel).
-- APLICAR DESPUÉS DE LOS DOS.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) EL ESTADO INICIAL DE UNA FICHA, SEGÚN SU TIPO
--
-- El MISMO cuerpo del archivo 38 con dos cambios: el estado inicial
-- depende del tipo, y queda dicho por qué se conserva la transición de
-- «Por asignar» aunque ya solo le toque a las visitas.
--
-- La regla de las VISITAS del archivo 38 se queda intacta.
-- ---------------------------------------------------------------------
create or replace function public.trg_fichas_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rol text;
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;

  -- EL ESTADO INICIAL DEPENDE DEL TIPO (archivo 43).
  --
  -- Antes todo nacía en «Por asignar» porque todo tenía que pasar por
  -- un responsable administrativo. Los presupuestos y los avisos ya no
  -- lo tienen, así que nacen donde empieza su trabajo de verdad.
  --
  -- Las VISITAS siguen igual: las lleva administración y se asignan.
  if TG_OP = 'INSERT' then
    new.status := case new.type
                    when 'visita' then 'por_asignar'
                    else               'pendiente' end;
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

  -- Al poner responsable, la ficha deja de estar «Por asignar».
  -- Con el cambio de arriba esto solo le toca a las VISITAS, pero se
  -- conserva para los tres tipos: hay presupuestos y avisos ANTIGUOS
  -- que siguen en «Por asignar», y si alguien les pone responsable
  -- tienen que avanzar igual que antes.
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
-- 2) REPARTIR UN AVISO LO PONE «ASIGNADO»
--
-- El MISMO cuerpo del archivo 38 con ese paso añadido justo antes de
-- devolver el equipo.
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

  -- REPARTIR EL AVISO ES LO QUE AHORA LO PONE «ASIGNADO».
  --
  -- Antes lo hacía elegir responsable administrativo. Al quitar ese
  -- responsable (archivo 43), «Asignado» se quedaba sin nadie que lo
  -- pusiera y administración tendría que marcarlo a mano cada vez. Esto
  -- no es una regla nueva: es la MISMA de antes, movida al sitio donde
  -- ahora se asigna de verdad.
  --
  -- Solo avanza desde los estados de «todavía no ha empezado»: un aviso
  -- en curso, realizado o cerrado NO retrocede por cambiar el equipo.
  if array_length(v_ids, 1) > 0 and f.status in ('por_asignar', 'pendiente') then
    update public.fichas set status = 'asignado', updated_at = now()
     where id = p_ficha;
  end if;

  return query
    select pr.* from public.profiles pr
     where pr.id = any(v_ids)
     order by pr.full_name;
end $$;
-- Los permisos de siempre, tal cual estaban en el archivo 38.
grant  execute on function public.assign_ficha_workers(uuid, uuid[]) to authenticated;
revoke execute on function public.assign_ficha_workers(uuid, uuid[]) from anon, public;


-- ---------------------------------------------------------------------
-- 3) LOS INDICADORES DEL PANEL
--
-- Dos cambios, y los dos hacen falta para que el panel siga diciendo la
-- verdad después de lo de arriba:
--
--   · «fichas por asignar» pasa a contar SOLO LAS VISITAS. Si siguiera
--     contando las tres clases, ese aviso se quedaría encendido para
--     siempre por presupuestos antiguos que ya nadie va a asignar.
--   · se añade «presupuestos pendientes de paga y señal», que es lo que
--     más fácil se queda olvidado: el cliente ya dijo sí, así que no
--     sale en «enviados esperando respuesta», y todavía no es un
--     proyecto, así que no sale por ningún otro lado.
--
-- Es el MISMO cuerpo del archivo 39: ningún otro bloque del panel se
-- toca.
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
      -- Solo las VISITAS: desde el archivo 43 son las únicas que nacen
      -- «Por asignar». Contar las tres clases dejaría el aviso encendido
      -- para siempre por presupuestos antiguos que ya no se asignan.
      'fichas_por_asignar', (select count(*) from public.fichas
                              where archived_at is null and type = 'visita'
                                and status = 'por_asignar'),
      -- Un presupuesto aceptado por el cliente y SIN cobrar la señal es
      -- lo que más fácil se queda olvidado: no está en «enviado»
      -- esperando respuesta, y tampoco es un proyecto todavía.
      'presupuestos_pendientes_senal', (select count(*) from public.fichas
                              where archived_at is null and type = 'presupuesto'
                                and status = 'pendiente_senal'),
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
-- Los permisos de siempre, tal cual estaban en el archivo 20.
grant  execute on function public.dashboard_summary(date, date) to authenticated;
revoke execute on function public.dashboard_summary(date, date) from anon, public;
