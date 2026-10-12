-- =====================================================================
-- METALPLAFER360 · PRUEBAS DEL BLOQUE 3 · PLANIFICACIÓN
--
-- Son los diez casos del encargo, uno por uno, con fechas fijas para que
-- el resultado sea siempre el mismo se ejecute el día que se ejecute.
--
-- Octubre de 2026, para situarse:
--   L 12 · M 13 · X 14 · J 15 · V 16 · S 17 · D 18
--   L 19 · M 20 · X 21 · J 22 · V 23 · S 24 · D 25 · L 26
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== BLOQUE 3 · DURACIÓN SEGÚN HORAS Y TRABAJADORES'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

-- 1, 2 y 3 del encargo.
select test.ok('b3_duracion', '32 h de fabricación con 2 trabajadores son 2 días',
  public.plan_days(32, 2) = 2);

select test.ok('b3_duracion', '32 h de fabricación con 1 trabajador son 4 días',
  public.plan_days(32, 1) = 4);

select test.ok('b3_duracion', '16 h de montaje con 2 trabajadores es 1 día',
  public.plan_days(16, 2) = 1);

select test.ok('b3_duracion', 'Lo que sobra cuenta como un día entero: 20 h entre 2 son 2 días',
  public.plan_days(20, 2) = 2);

select test.ok('b3_duracion', 'Sin horas previstas no hay nada que planificar',
  public.plan_days(0, 2) = 0);

select test.ok('b3_duracion', 'Las horas son del equipo: con el doble de gente, la mitad de días',
  public.plan_days(32, 4) = 1);


\echo '== BLOQUE 3 · FINES DE SEMANA Y FESTIVOS'

-- 4 del encargo.
select test.ok('b3_dias', 'El sábado no se trabaja',  not public.is_working_day(date '2026-10-17'));
select test.ok('b3_dias', 'El domingo tampoco',       not public.is_working_day(date '2026-10-18'));
select test.ok('b3_dias', 'El lunes sí',                  public.is_working_day(date '2026-10-19'));

select test.ok('b3_dias', 'Un tramo de 3 días que empieza el viernes acaba el martes',
  public.working_span_end(date '2026-10-16', 3) = date '2026-10-20');

-- 5 del encargo.
select public.set_non_working_day(date '2026-10-20', 'Festivo de prueba');

select test.ok('b3_dias', 'Un festivo deja de ser laborable',
  not public.is_working_day(date '2026-10-20'));

select test.ok('b3_dias', 'Y el tramo se alarga para saltárselo: ahora acaba el miércoles',
  public.working_span_end(date '2026-10-16', 3) = date '2026-10-21');

select test.ok('b3_dias', 'Los festivos los ve también el trabajador (tiene que saberlo)',
  exists (select 1 from public.non_working_days where day = date '2026-10-20'));

select public.clear_non_working_day(date '2026-10-20');
select test.ok('b3_dias', 'Al quitarlo, vuelve a ser laborable',
  public.is_working_day(date '2026-10-20'));

set role authenticated; select test.as_user(test.id('juan'));
select test.err('b3_dias', 'Un trabajador no puede marcar festivos',
  $$select public.set_non_working_day(date '2026-12-25', 'a ver')$$, '42501');


\echo '== BLOQUE 3 · EL EJEMPLO DEL ENCARGO, CON MARGEN DE 1 DÍA'

set role authenticated; select test.as_user(test.id('salvi'));

-- Agenda limpia: estas pruebas no dependen de lo que hayan dejado otras.
reset role; select test.as_server();
update public.projects
   set fab_start = null, fab_end = null, mont_start = null, mont_end = null,
       fab_manual = false, mont_manual = false, autoplan = false;
update public.app_settings set gap_days = 1 where id = 1;

set role authenticated; select test.as_user(test.id('salvi'));

with a as (
  insert into public.projects (client_id, name, budget_hours_fab, budget_hours_mont)
  values (test.id('cli_laura'), 'Planificación · proyecto A', 16, 0) returning id)
select test.put('b3_a', (select id from a));

with b as (
  insert into public.projects (client_id, name, budget_hours_fab, budget_hours_mont)
  values (test.id('cli_laura'), 'Planificación · proyecto B', 32, 16) returning id)
select test.put('b3_b', (select id from b));

-- A ocupa el lunes 19/10 (16 h entre 2 = 1 día).
select public.move_project_phase(test.id('b3_a'), 'fabricacion', date '2026-10-19');

select test.ok('b3_gap', 'El proyecto A ocupa solo el lunes 19',
  (select fab_start = date '2026-10-19' and fab_end = date '2026-10-19'
     from public.projects where id = test.id('b3_a')));

-- 7 del encargo: con margen 1, B no puede empezar el martes 20.
select public.plan_project(test.id('b3_b'), 'ambas', date '2026-10-19');

select test.ok('b3_gap', 'Con margen de 1 día, B NO empieza el martes 20',
  (select fab_start <> date '2026-10-20' from public.projects where id = test.id('b3_b')));

select test.ok('b3_gap', 'Empieza el miércoles 21, como dice el encargo',
  (select fab_start = date '2026-10-21' from public.projects where id = test.id('b3_b')));

select test.ok('b3_gap', 'Y como son 32 h entre 2, acaba el jueves 22',
  (select fab_end = date '2026-10-22' from public.projects where id = test.id('b3_b')));

-- 7 (segunda parte): el montaje va detrás, con el mismo margen.
select test.ok('b3_gap', 'El montaje se planifica solo, detrás de la fabricación',
  (select mont_start = date '2026-10-26' and mont_end = date '2026-10-26'
     from public.projects where id = test.id('b3_b')));

select test.ok('b3_gap', 'Dejando libre el viernes 23, que es el día de margen',
  not exists (select 1 from public.planned_spans
               where project_id = test.id('b3_b')
                 and starts <= date '2026-10-23' and ends >= date '2026-10-23'));

-- 6 del encargo: con margen 0, pegado al anterior (pero sin solapar).
update public.app_settings set gap_days = 0 where id = 1;
reset role; select test.as_server();
update public.projects set fab_start = null, fab_end = null, mont_start = null, mont_end = null
 where id = test.id('b3_b');
set role authenticated; select test.as_user(test.id('salvi'));

select public.plan_project(test.id('b3_b'), 'fabricacion', date '2026-10-19');

select test.ok('b3_gap', 'Con margen 0 empieza el día laborable siguiente: martes 20',
  (select fab_start = date '2026-10-20' from public.projects where id = test.id('b3_b')));

select test.ok('b3_gap', 'Margen 0 NO quiere decir solapar: lo automático nunca solapa',
  (select fab_start > (select fab_end from public.projects where id = test.id('b3_a'))
     from public.projects where id = test.id('b3_b')));

-- Margen de 2 días.
update public.app_settings set gap_days = 2 where id = 1;
reset role; select test.as_server();
update public.projects set fab_start = null, fab_end = null where id = test.id('b3_b');
set role authenticated; select test.as_user(test.id('salvi'));
select public.plan_project(test.id('b3_b'), 'fabricacion', date '2026-10-19');

select test.ok('b3_gap', 'Con margen de 2 días libres, empieza el jueves 22',
  (select fab_start = date '2026-10-22' from public.projects where id = test.id('b3_b')));

update public.app_settings set gap_days = 1 where id = 1;


\echo '== BLOQUE 3 · LO AUTOMÁTICO NO SOLAPA; LO MANUAL MANDA'

reset role; select test.as_server();
update public.projects set fab_start = null, fab_end = null, mont_start = null, mont_end = null,
       fab_manual = false, mont_manual = false where id = test.id('b3_b');
set role authenticated; select test.as_user(test.id('salvi'));
select public.plan_project(test.id('b3_b'), 'fabricacion', date '2026-10-19');

select test.ok('b3_solape', 'Dos proyectos planificados solos NO se pisan',
  not exists (
    select 1 from public.planned_spans x join public.planned_spans y
      on x.phase = y.phase and x.project_id < y.project_id
     where x.project_id in (test.id('b3_a'), test.id('b3_b'))
       and y.project_id in (test.id('b3_a'), test.id('b3_b'))
       and x.starts <= y.ends and x.ends >= y.starts));

-- 8 del encargo: mover a mano.
select public.move_project_phase(test.id('b3_b'), 'fabricacion', date '2026-11-02');

select test.ok('b3_manual', 'Administración mueve una fase a la fecha que quiera',
  (select fab_start = date '2026-11-02' from public.projects where id = test.id('b3_b')));

select test.ok('b3_manual', 'Y queda marcado como puesto a mano',
  (select fab_manual from public.projects where id = test.id('b3_b')));

-- 9 del encargo: dos proyectos solapados a mano, a propósito.
select public.move_project_phase(test.id('b3_a'), 'fabricacion', date '2026-11-02');

select test.ok('b3_manual', 'A mano SÍ se pueden solapar dos proyectos',
  (select count(*) from public.planned_spans
    where phase = 'fabricacion'
      and starts <= date '2026-11-02' and ends >= date '2026-11-02') = 2);

-- 10 del encargo: lo automático no deshace la decisión.
select public.plan_project(test.id('b3_a'), 'ambas', date '2026-10-12');
select public.plan_project(test.id('b3_b'), 'ambas', date '2026-10-12');

select test.ok('b3_manual', 'Volver a planificar NO deshace el solape puesto a mano',
  (select count(*) from public.planned_spans
    where phase = 'fabricacion'
      and starts <= date '2026-11-02' and ends >= date '2026-11-02') = 2);

select test.ok('b3_manual', 'Las dos fases siguen donde las dejó la persona',
  (select fab_start = date '2026-11-02' from public.projects where id = test.id('b3_a'))
  and (select fab_start = date '2026-11-02' from public.projects where id = test.id('b3_b')));

-- Y se puede devolver al cálculo automático a propósito.
select public.release_project_phase(test.id('b3_a'), 'fabricacion');

select test.ok('b3_manual', 'Se puede devolver una fase al cálculo automático',
  (select not fab_manual from public.projects where id = test.id('b3_a')));

select test.ok('b3_manual', 'Y entonces sí se recoloca sin pisar a nadie',
  not exists (
    select 1 from public.planned_spans x join public.planned_spans y
      on x.phase = y.phase and x.project_id < y.project_id
     where x.project_id in (test.id('b3_a'), test.id('b3_b'))
       and y.project_id in (test.id('b3_a'), test.id('b3_b'))
       and x.starts <= y.ends and x.ends >= y.starts));


\echo '== BLOQUE 3 · TRABAJADORES POR PROYECTO'

set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('b3_equipo', 'Por defecto van 2 en fabricación y 2 en montaje',
  (select fab_workers = 2 and mont_workers = 2
     from public.projects where id = test.id('b3_b')));

select public.move_project_phase(test.id('b3_b'), 'fabricacion', date '2026-11-02');
select public.set_phase_workers(test.id('b3_b'), 'fabricacion', 1);

select test.ok('b3_equipo', 'Con 1 solo trabajador, las 32 h pasan de 2 días a 4',
  (select fab_end - fab_start = 5 or fab_end = public.working_span_end(fab_start, 4)
     from public.projects where id = test.id('b3_b')));

select test.err('b3_equipo', 'No se admite un número de trabajadores imposible',
  format($$select public.set_phase_workers(%L, 'fabricacion', 0)$$, test.id('b3_b')), '22023');

set role authenticated; select test.as_user(test.id('juan'));
select test.err('b3_equipo', 'Un trabajador no cambia la planificación',
  format($$select public.move_project_phase(%L, 'fabricacion', current_date)$$,
         test.id('b3_b')), '42501');
select test.err('b3_equipo', 'Ni planifica',
  format($$select public.plan_project(%L)$$, test.id('b3_b')), '42501');


\echo '== BLOQUE 3 · EL CALENDARIO'

set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('b3_calendario', 'Un tramo de varios días sale como un día por fila',
  (select count(*) from public.v_calendar
    where kind = 'fabricacion' and project_id = test.id('b3_b')) >= 4);

select test.ok('b3_calendario', 'Y cada día dice cuál es del total',
  exists (select 1 from public.v_calendar
           where kind = 'fabricacion' and project_id = test.id('b3_b')
             and detail like 'Día 1 de %'));

select test.ok('b3_calendario', 'La fabricación del calendario sale de la planificación, no de las órdenes',
  not exists (
    select 1 from public.v_calendar v
     where v.kind in ('fabricacion', 'montaje')
       and not exists (select 1 from public.planned_spans s
                        where s.project_id = v.project_id and s.phase = v.kind)));

-- «Otros».
select test.put('b3_nota', (select id from public.save_calendar_note(
  null, date '2026-10-21', 'Revisión de la plegadora', 'Viene el técnico por la mañana')));

select test.ok('b3_calendario', 'Administración crea un evento «Otro» desde el calendario',
  exists (select 1 from public.v_calendar
           where kind = 'otro' and title = 'Revisión de la plegadora'
             and date = date '2026-10-21'));

select test.ok('b3_calendario', 'Los «Otros» se pueden mover',
  (select movable from public.v_calendar where kind = 'otro' and id = test.id('b3_nota')));

select test.err('b3_calendario', 'Un evento sin texto no se guarda',
  $$select public.save_calendar_note(null, current_date, '   ')$$, '22023');

select test.ok('b3_calendario', 'Siguen estando material, visitas y avisos',
  (select count(distinct kind) from public.v_calendar
    where kind in ('material', 'visita', 'aviso')) >= 1);

set role authenticated; select test.as_user(test.id('juan'));
select test.err('b3_calendario', 'Un trabajador no crea eventos en el calendario',
  $$select public.save_calendar_note(null, current_date, 'mío')$$, '42501');

select test.ok('b3_calendario', 'El trabajador ve el calendario, pero solo lo suyo',
  not exists (
    select 1 from public.v_calendar v
     where v.kind in ('fabricacion', 'montaje')
       and not public.worker_can_see_project(v.project_id)));


\echo '== BLOQUE 3 · HISTORIAL'

reset role; select test.as_server();

select test.ok('b3_historial', 'Mover a mano queda anotado con el antes y el después',
  exists (select 1 from public.audit_log
           where action = 'mover_fecha' and summary like '%movió a mano%→%'));

select test.ok('b3_historial', 'Y dice de qué fase se trata',
  exists (select 1 from public.audit_log
           where action = 'mover_fecha'
             and (summary like '%la fabricación%' or summary like '%el montaje%')));

select test.ok('b3_historial', 'La anotación va al historial DEL PROYECTO',
  exists (select 1 from public.audit_log a
           join public.projects p on p.code = a.entity_code
          where a.action = 'mover_fecha' and p.id = test.id('b3_b')));

select test.ok('b3_historial', 'Planificar automáticamente también se anota',
  exists (select 1 from public.audit_log
           where action = 'planificar' and summary like '%planificó%'));

select test.ok('b3_historial', 'Y se guarda con qué margen se hizo',
  exists (select 1 from public.audit_log
           where action = 'planificar' and details ? 'margen_dias'));
