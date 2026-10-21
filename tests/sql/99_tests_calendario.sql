-- =====================================================================
-- METALPLAFER360 · EL CALENDARIO POR TRAMOS Y EL ARRASTRE
--
-- Lo que importa aquí:
--
--   · que arrastrar un tramo CONSERVE su duración. Es el fallo que se
--     venía a corregir: un montaje de seis días se quedaba en dos;
--   · que las horas presupuestadas y las registradas NO se toquen al
--     mover nada;
--   · que mover la fabricación no mueva el montaje, ni al revés;
--   · que una fase que todavía no tiene fechas se siga estimando con las
--     horas, que es lo único que hay;
--   · que la vista por tramos devuelva UNA fila por periodo, y que diga
--     lo mismo que la de siempre;
--   · que los permisos no cambien: un trabajador ve lo suyo y nada más.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== CALENDARIO · ARRASTRAR CONSERVA LA DURACIÓN'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

with p as (
  insert into public.projects (client_id, name, budget_amount, phase,
                               budget_hours_fab, budget_hours_mont,
                               fab_workers, mont_workers)
  values (test.id('cli_laura'), 'Barandilla del paseo', 9000, 'fabricacion',
          16, 16, 1, 1)
  returning id)
select test.put('cal_proy', (select id from p));

-- SEIS DÍAS a mano, de lunes a sábado. Con 16 horas y una persona, la
-- estimación automática serían DOS días: justo la diferencia que hacía
-- que el tramo se encogiera al arrastrarlo.
select public.set_phase_dates(test.id('cal_proy'), 'montaje',
                              date '2026-11-02', date '2026-11-07');

select test.ok('cal_mover', 'El montaje queda de lunes a sábado: seis días',
  (select mont_start = date '2026-11-02' and mont_end = date '2026-11-07'
     from public.projects where id = test.id('cal_proy')));

select test.ok('cal_mover', 'Y la estimación por horas serían solo dos, que es el problema',
  public.plan_days(16, 1) = 2);

-- LA COMPROBACIÓN QUE IMPORTA.
select public.move_project_phase(test.id('cal_proy'), 'montaje', date '2026-11-04');

select test.ok('cal_mover', 'Soltado en miércoles, sigue durando SEIS días',
  (select mont_start = date '2026-11-04' and mont_end = date '2026-11-09'
     from public.projects where id = test.id('cal_proy')),
  (select format('%s → %s (%s días)', mont_start, mont_end, mont_end - mont_start + 1)
     from public.projects where id = test.id('cal_proy')));

select test.ok('cal_mover', 'Y acaba el lunes siguiente, como dice el ejemplo',
  (select extract(isodow from mont_end) = 1
     from public.projects where id = test.id('cal_proy')));

select test.ok('cal_mover', 'Las horas presupuestadas no se tocan',
  (select budget_hours_mont = 16 and budget_hours_fab = 16
          and mont_workers = 1 and fab_workers = 1
     from public.projects where id = test.id('cal_proy')));

select test.ok('cal_mover', 'La fabricación se queda donde estaba: sin fechas',
  (select fab_start is null and fab_end is null
     from public.projects where id = test.id('cal_proy')));

select test.ok('cal_mover', 'El montaje queda fijado a mano',
  (select mont_manual from public.projects where id = test.id('cal_proy')));

select test.ok('cal_mover', 'Y el historial cuenta el movimiento con las dos fechas',
  exists (select 1 from public.audit_log
           where action = 'mover_fecha'
             and entity_code = (select code from public.projects where id = test.id('cal_proy'))
             and summary like '%02/11/2026 → 04/11/2026%'
             and summary like '%hasta el 09/11/2026%'),
  (select summary from public.audit_log
    where action = 'mover_fecha' order by id desc limit 1));

-- Moverlo otra vez conserva los seis días: no se van perdiendo por el
-- camino a cada arrastre.
select public.move_project_phase(test.id('cal_proy'), 'montaje', date '2026-11-16');
select test.ok('cal_mover', 'Moverlo otra vez sigue conservando los seis días',
  (select mont_end - mont_start = 5
     from public.projects where id = test.id('cal_proy')),
  (select format('%s → %s', mont_start, mont_end)
     from public.projects where id = test.id('cal_proy')));


\echo '== CALENDARIO · CADA FASE SE MUEVE SOLA'

select public.set_phase_dates(test.id('cal_proy'), 'fabricacion',
                              date '2026-11-02', date '2026-11-05');
select public.move_project_phase(test.id('cal_proy'), 'fabricacion', date '2026-11-10');

select test.ok('cal_fases', 'Mover la fabricación conserva SUS días',
  (select fab_start = date '2026-11-10' and fab_end = date '2026-11-13'
     from public.projects where id = test.id('cal_proy')),
  (select format('%s → %s', fab_start, fab_end)
     from public.projects where id = test.id('cal_proy')));

select test.ok('cal_fases', 'Y NO toca el montaje',
  (select mont_start = date '2026-11-16' and mont_end = date '2026-11-21'
     from public.projects where id = test.id('cal_proy')),
  (select format('%s → %s', mont_start, mont_end)
     from public.projects where id = test.id('cal_proy')));


\echo '== CALENDARIO · UNA FASE SIN FECHAS SE SIGUE ESTIMANDO'

with p as (
  insert into public.projects (client_id, name, budget_amount, phase,
                               budget_hours_fab, fab_workers)
  values (test.id('cli_laura'), 'Reja sin planificar', 1200, 'preparacion', 24, 1)
  returning id)
select test.put('cal_nuevo', (select id from p));

select public.move_project_phase(test.id('cal_nuevo'), 'fabricacion', date '2026-11-02');

select test.ok('cal_estimar', 'Sin fechas previas, la duración sale de las horas, como antes',
  (select fab_start = date '2026-11-02'
          and fab_end = public.working_span_end(date '2026-11-02', public.plan_days(24, 1))
     from public.projects where id = test.id('cal_nuevo')),
  (select format('%s → %s, estimados %s días', fab_start, fab_end, public.plan_days(24, 1))
     from public.projects where id = test.id('cal_nuevo')));

-- Y la función que lo decide, por su cuenta.
select test.ok('cal_estimar', 'La regla, dicha sola: conserva la longitud cuando la hay',
  public.moved_span_end(date '2026-11-02', date '2026-11-07', date '2026-11-04', 16, 1)
    = date '2026-11-09');

select test.ok('cal_estimar', 'Un tramo de un solo día sigue siendo de un día',
  public.moved_span_end(date '2026-11-02', date '2026-11-02', date '2026-11-05', 16, 1)
    = date '2026-11-05');

select test.ok('cal_estimar', 'Y sin fechas anteriores, estima',
  public.moved_span_end(null, null, date '2026-11-02', 24, 1)
    = public.working_span_end(date '2026-11-02', 3));


\echo '== CALENDARIO · LA VISTA POR TRAMOS'

select test.ok('cal_vista', 'Un tramo de varios días es UNA fila, no una por día',
  (select count(*) = 1 from public.v_calendar_spans
    where kind = 'montaje' and id = test.id('cal_proy')));

select test.ok('cal_vista', 'Con su principio y su final',
  (select starts = date '2026-11-16' and ends = date '2026-11-21'
     from public.v_calendar_spans
    where kind = 'montaje' and id = test.id('cal_proy')),
  (select format('%s → %s', starts, ends) from public.v_calendar_spans
    where kind = 'montaje' and id = test.id('cal_proy')));

select test.ok('cal_vista', 'La misma vista de siempre lo sigue dando por días',
  (select count(*) = 6 from public.v_calendar
    where kind = 'montaje' and id = test.id('cal_proy')),
  (select count(*)::text from public.v_calendar
    where kind = 'montaje' and id = test.id('cal_proy')));

select test.ok('cal_vista', 'Las dos fases del mismo proyecto son dos tramos distintos',
  (select count(*) = 2 from public.v_calendar_spans
    where id = test.id('cal_proy') and kind in ('fabricacion', 'montaje')));

-- Lo que dura un día viene con principio y final iguales: así la
-- pantalla no necesita dos caminos.
select test.ok('cal_vista', 'Lo de un solo día trae principio y final iguales',
  (select bool_and(starts = ends) from public.v_calendar_spans
    where kind in ('visita', 'aviso', 'material', 'otro')),
  (select string_agg(kind || ' ' || starts || '→' || ends, ' | ')
     from public.v_calendar_spans
    where kind in ('visita', 'aviso', 'material', 'otro') and starts <> ends));

-- Y LO QUE NO PUEDE CAMBIAR: que las dos vistas cuenten lo mismo.
select test.ok('cal_vista', 'Todo día que enseña la vista de siempre cae dentro de su tramo',
  not exists (
    select 1 from public.v_calendar c
     join public.v_calendar_spans s on s.kind = c.kind and s.id = c.id
    where c.date < s.starts or c.date > s.ends),
  (select string_agg(c.kind || ' ' || c.date, ' | ')
     from public.v_calendar c
     join public.v_calendar_spans s on s.kind = c.kind and s.id = c.id
    where c.date < s.starts or c.date > s.ends));

select test.ok('cal_vista', 'Y no hay tramos de más ni de menos',
  (select count(distinct (kind, id)) from public.v_calendar_spans)
    = (select count(distinct (kind, id)) from public.v_calendar),
  format('tramos %s · dia a dia %s',
         (select count(distinct (kind, id)) from public.v_calendar_spans),
         (select count(distinct (kind, id)) from public.v_calendar)));


\echo '== CALENDARIO · LOS PERMISOS NO CAMBIAN'

select test.as_user(test.id('juan'));

select test.ok('cal_permisos', 'Un trabajador ve en los tramos exactamente lo que ve día a día',
  (select coalesce(array_agg(distinct kind::text order by kind::text), '{}')
     from public.v_calendar_spans)
  = (select coalesce(array_agg(distinct kind::text order by kind::text), '{}')
       from public.v_calendar),
  (select string_agg(distinct kind::text, ', ') from public.v_calendar_spans));

select test.ok('cal_permisos', 'No ve el proyecto en el que no está',
  (select count(*) = 0 from public.v_calendar_spans where id = test.id('cal_proy')));

-- LA SEGUNDA CERRADURA, otra vez.
--
-- La rama del material de la vista por tramos lleva su propia condición
-- de permisos. Hoy no se nota —«v_calendar_spans» se ejecuta con los
-- permisos de quien pregunta, así que las políticas de «materials» ya
-- filtran—, y por eso quitarla no hacía fallar ninguna prueba: se
-- comprobó rompiéndola a propósito.
--
-- Pero «planned_spans», en el archivo 32, es «security_invoker = false»
-- justo porque tuvo que dejar de depender de las políticas. El día que
-- esta vista cambie igual, esa condición será lo único que impida que
-- cada trabajador vea el material de los proyectos que no son suyos.
--
-- Se comprueba SIN SESIÓN, que es cuando las políticas no filtran: la
-- vista no debe devolver ni una fila de material.
reset role; select test.as_server();
select test.ok('cal_permisos',
  'La rama del material filtra por su cuenta, sin depender de las políticas',
  (select count(*) = 0 from public.v_calendar_spans where kind = 'material'),
  (select count(*)::text || ' filas de material sin sesión'
     from public.v_calendar_spans where kind = 'material'));

set role authenticated; select test.as_user(test.id('juan'));

select test.err('cal_permisos', 'Y no puede mover nada',
  format($$select public.move_project_phase(%L, 'montaje', current_date)$$,
         test.id('cal_proy')), '42501');

set role anon; select test.as_anon();
select test.err('cal_permisos', 'Sin sesión no se ve el calendario',
  'select count(*) from public.v_calendar_spans', '42501');

reset role; select test.as_server();
