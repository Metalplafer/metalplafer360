-- =====================================================================
-- METALPLAFER360 · EL PANEL · «REQUIERE TU ATENCIÓN»
--
-- MEJORA 4 · El bloque de avisos del panel enseñaba cosas que no pedían
-- ninguna acción y se dejaba fuera otras que sí. Las seis categorías que
-- hacen falta son:
--
--   1 · visitas por asignar                      ← ya estaba
--   2 · presupuestos pendientes por revisar      ← NUEVA
--   3 · presupuestos pendientes                  ← NUEVA
--   4 · presupuestos pendientes de paga y señal  ← ya estaba
--   5 · material pedido por taller               ← ya estaba («avisos_taller»)
--   6 · avisos pendientes de facturar            ← NUEVA (mejora 7)
--
-- Y se retira «presupuestos enviados esperando respuesta»: ese espera al
-- cliente, no a nosotros.
--
--
-- QUÉ NO SE TOCA, Y POR QUÉ
--
-- Los otros tres avisos del bloque —órdenes atrasadas, órdenes por
-- revisar y material retrasado— SE QUEDAN. El encargo pide que el bloque
-- «incluya» las seis categorías y nombra una sola para quitar; retirar
-- las demás por mi cuenta sería decidir por alguien que no lo ha pedido.
--
-- Y no se toca NADA del resto de la función: ni producción, ni
-- proyectos, ni material, ni el bloque económico. Esta función la
-- redefine el archivo 43, y de ahí se ha copiado entera: lo único que
-- cambia es el bloque «alertas», y se comprobó con «diff» que no hay
-- ninguna otra diferencia.
--
--
-- DE DÓNDE SALE CADA NÚMERO
--
-- De los estados que ya existen, sin inventar ninguna condición:
--
--   · «por revisar» y «pendiente» son estados de presupuesto del archivo
--     42. Un presupuesto está en UNO, así que ninguna fila se cuenta dos
--     veces en categorías incompatibles;
--   · «pendiente de paga y señal» es «pendiente_senal», que ya se
--     contaba;
--   · «material pedido por taller» son las peticiones de material del
--     taller pendientes, que es lo que ya contaba «avisos_taller»;
--   · «avisos pendientes de facturar» sale de la columna que crea el
--     archivo 66.
--
-- LOS PERMISOS NO CAMBIAN: la función sigue empezando por
-- «assert_admin()», así que sigue siendo cosa de administración.
--
-- MIGRACIÓN ESTRUCTURAL: una función reemplazada. Ni una fila tocada.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
--
-- NECESITA EL ARCHIVO 66 EJECUTADO ANTES: usa «fichas.billing_state».
-- =====================================================================


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
      -- MEJORA 4 · LAS TRES QUE FALTABAN, y una que se va.
      --
      -- Se retira «presupuestos_enviados»: un presupuesto enviado está
      -- esperando al CLIENTE, no a nosotros, y tenerlo encendido en «lo
      -- que requiere tu atención» pedía una acción que no existe.
      --
      -- Cada una de las tres cuenta EXACTAMENTE los registros que piden
      -- esa acción, y no se solapan: un presupuesto está en UN estado,
      -- así que no puede salir a la vez como pendiente, por revisar y
      -- pendiente de señal.
      'presupuestos_por_revisar', (select count(*) from public.fichas
                              where archived_at is null and type = 'presupuesto'
                                and status = 'por_revisar'),
      'presupuestos_pendientes', (select count(*) from public.fichas
                              where archived_at is null and type = 'presupuesto'
                                and status = 'pendiente'),
      -- MEJORA 7 · Avisos terminados que esperan factura. SOLO los que
      -- alguien ha marcado a propósito: los avisos cerrados de antes de
      -- esta mejora no tienen situación de facturación y no se cuentan,
      -- para no llenar el panel de trabajo inventado.
      'avisos_por_facturar', (select count(*) from public.fichas
                              where archived_at is null and type = 'aviso'
                                and billing_state = 'pendiente')),

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


-- ---------------------------------------------------------------------
-- COMPROBAR QUE QUEDÓ BIEN
-- ---------------------------------------------------------------------
-- select public.dashboard_summary(
--          date_trunc('month', public.today_madrid())::date,
--          public.today_madrid()) -> 'alertas' as requiere_atencion;
