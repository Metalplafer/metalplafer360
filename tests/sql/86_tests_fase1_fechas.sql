-- =====================================================================
-- METALPLAFER360 · FASE 1 · EDITAR LAS FECHAS A MANO
--
-- Lo que importa aquí:
--   · que se pueda escribir el inicio y el final de una fase y se
--     guarden TAL CUAL;
--   · que NO se compruebe disponibilidad: dos proyectos pueden ocupar
--     exactamente los mismos días y los dos se guardan. Esto se pidió
--     expresamente y es fácil que una «mejora» futura lo rompa;
--   · que tocar la fabricación no toque el montaje, y al revés;
--   · que la obra pueda tener su propio periodo y que, en blanco, vuelva
--     a seguir a sus proyectos;
--   · que un trabajador no pueda llamar a ninguna de las dos funciones.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== FASE 1 · LAS FECHAS DE UNA FASE DEL PROYECTO'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

-- 24 h de fabricación con 1 persona = 3 días. 8 h de montaje = 1 día.
with a as (insert into public.projects
             (client_id, name, budget_amount, budget_hours_fab, budget_hours_mont,
              fab_workers, mont_workers)
           values (test.id('cli_laura'), 'Escalera metálica del patio', 5400, 24, 8, 1, 1)
           returning id)
select test.put('f1_p1', (select id from a));

-- EL MONTAJE SE PONE PRIMERO, A PROPÓSITO.
--
-- Para poder afirmar que escribir la fabricación no lo toca, el montaje
-- tiene que tener ya una fecha que perder. Comprobar que «sigue en
-- blanco» cuando nunca se escribió no comprueba nada: esa versión de la
-- prueba no se enteraba de que la fabricación borrase el montaje.
select public.set_phase_dates(test.id('f1_p1'), 'montaje',
                              date '2027-03-15', date '2027-03-16');

select test.ok('f1_fechas', 'El montaje se escribe por su lado',
  (select mont_start = date '2027-03-15' and mont_end = date '2027-03-16' and mont_manual
     from public.projects where id = test.id('f1_p1')));

select public.set_phase_dates(test.id('f1_p1'), 'fabricacion',
                              date '2027-03-01', date '2027-03-05');

select test.ok('f1_fechas', 'El inicio y el final se guardan tal como se escriben',
  (select fab_start = date '2027-03-01' and fab_end = date '2027-03-05'
     from public.projects where id = test.id('f1_p1')));

select test.ok('f1_fechas', 'Y la fase queda fijada a mano',
  (select fab_manual from public.projects where id = test.id('f1_p1')));

select test.ok('f1_fechas', 'Escribir la fabricación NO toca el montaje',
  (select mont_start = date '2027-03-15' and mont_end = date '2027-03-16'
     from public.projects where id = test.id('f1_p1')),
  (select format('el montaje ha quedado %s → %s', mont_start, mont_end)
     from public.projects where id = test.id('f1_p1')));

-- Sin final: se calcula con la duración de siempre (24 h ÷ 1 ÷ 8 = 3 días).
select public.set_phase_dates(test.id('f1_p1'), 'fabricacion', date '2027-03-08', null);

select test.ok('f1_fechas', 'Si no se da final, se calcula con las horas y la gente',
  (select fab_start = date '2027-03-08'
      and fab_end = public.working_span_end(date '2027-03-08', 3)
     from public.projects where id = test.id('f1_p1')),
  (select fab_end::text from public.projects where id = test.id('f1_p1')));

-- Y al revés: ahora se mueve el montaje y la fabricación no se entera.
select public.set_phase_dates(test.id('f1_p1'), 'montaje',
                              date '2027-03-22', date '2027-03-22');

select test.ok('f1_fechas', 'Y escribir el montaje NO toca la fabricación',
  (select fab_start = date '2027-03-08'
      and fab_end = public.working_span_end(date '2027-03-08', 3)
      and mont_start = date '2027-03-22'
     from public.projects where id = test.id('f1_p1')),
  (select format('la fabricación ha quedado %s → %s', fab_start, fab_end)
     from public.projects where id = test.id('f1_p1')));


\echo '== FASE 1 · NO SE COMPRUEBA DISPONIBILIDAD (se pidió así)'

-- Un segundo proyecto EXACTAMENTE en los mismos días que el primero.
-- Esto tiene que poder guardarse sin queja alguna.
with b as (insert into public.projects
             (client_id, name, budget_amount, budget_hours_fab, fab_workers)
           values (test.id('cli_laura'), 'Reja del almacén', 900, 8, 1)
           returning id)
select test.put('f1_p2', (select id from b));

select public.set_phase_dates(test.id('f1_p2'), 'fabricacion',
                              date '2027-03-08', date '2027-03-10');

select test.ok('f1_solape', 'Dos proyectos pueden ocupar los MISMOS días',
  (select fab_start = date '2027-03-08' and fab_end = date '2027-03-10'
     from public.projects where id = test.id('f1_p2')));

select test.ok('f1_solape', 'Y el primero se queda donde estaba',
  (select fab_start = date '2027-03-08'
     from public.projects where id = test.id('f1_p1')));

-- Tampoco se mira si cae en sábado, domingo o festivo: si se escribe a
-- mano es porque se quiere.
select public.set_non_working_day(date '2027-03-19', 'Puente');
select public.set_phase_dates(test.id('f1_p2'), 'fabricacion',
                              date '2027-03-19', date '2027-03-21');

select test.ok('f1_solape', 'Se puede colocar a mano en un festivo o un fin de semana',
  (select fab_start = date '2027-03-19' and fab_end = date '2027-03-21'
     from public.projects where id = test.id('f1_p2')));


\echo '== FASE 1 · LO QUE SÍ SE RECHAZA'

select test.err('f1_limites', 'Un final anterior al inicio no se guarda',
  format($$select public.set_phase_dates(%L, 'fabricacion',
                                        date '2027-04-10', date '2027-04-01')$$,
         test.id('f1_p1')), '22023');

select test.err('f1_limites', 'Una fase que no existe no se guarda',
  format($$select public.set_phase_dates(%L, 'pintura', date '2027-04-01')$$,
         test.id('f1_p1')), '22023');

select test.err('f1_limites', 'Un proyecto que no existe no se guarda',
  $$select public.set_phase_dates('00000000-0000-4000-8000-000000000000',
                                  'fabricacion', date '2027-04-01')$$, 'P0002');

select test.ok('f1_limites', 'Y después del rechazo las fechas siguen intactas',
  (select fab_start = date '2027-03-08'
     from public.projects where id = test.id('f1_p1')));


\echo '== FASE 1 · QUITAR LA FECHA DEVUELVE LA FASE AL CÁLCULO AUTOMÁTICO'

select public.set_phase_dates(test.id('f1_p1'), 'montaje', null, null);

select test.ok('f1_quitar', 'Dejar el inicio en blanco borra las dos fechas',
  (select mont_start is null and mont_end is null
     from public.projects where id = test.id('f1_p1')));

select test.ok('f1_quitar', 'Y suelta la fase, para que «Buscar hueco» la coloque',
  (select not mont_manual from public.projects where id = test.id('f1_p1')));

select test.ok('f1_quitar', 'Sin tocar la fabricación',
  (select fab_start = date '2027-03-08' and fab_manual
     from public.projects where id = test.id('f1_p1')));


\echo '== FASE 1 · EL HISTORIAL'

select test.ok('f1_historial', 'Cada cambio de fechas queda en el historial del proyecto',
  (select count(*) from public.audit_log
    where action = 'editar_fechas' and entity_type = 'projects'
      and entity_id = test.id('f1_p1')) >= 4);

select test.ok('f1_historial', 'Y dice quién, qué fase y de qué fecha a qué fecha',
  exists (select 1 from public.audit_log
           where action = 'editar_fechas' and entity_id = test.id('f1_p1')
             and summary like '%la fabricación%'
             and summary like '%01/03/2027%'));


\echo '== FASE 1 · UN TRABAJADOR NO TOCA NINGUNA FECHA'

reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.err('f1_permisos', 'El trabajador no puede escribir las fechas de una fase',
  format($$select public.set_phase_dates(%L, 'fabricacion', date '2027-05-01')$$,
         test.id('f1_p1')), '42501');

select test.err('f1_permisos', 'Ni quitarlas',
  format($$select public.set_phase_dates(%L, 'fabricacion', null)$$,
         test.id('f1_p1')), '42501');


\echo '== FASE 1 · EL PERIODO DE LA OBRA'

reset role; set role authenticated; select test.as_user(test.id('salvi'));

select test.put('f1_obra', (select id from public.save_work(
  null, 'Nave industrial Can Roqueta', test.id('cli_laura'),
  'Camí de Can Roqueta, 4', 'Obra de prueba de fechas.', null)));

select public.set_project_work(test.id('f1_p1'), test.id('f1_obra'));

-- Sin fechas propias, la obra sigue a sus proyectos: eso es lo de antes
-- y tiene que seguir funcionando igual.
select test.ok('f1_obra', 'Sin fechas propias, la obra sigue a sus proyectos',
  (select desde = date '2027-03-08' from public.work_summary
    where work_id = test.id('f1_obra')),
  (select desde::text from public.work_summary where work_id = test.id('f1_obra')));

select public.set_work_dates(test.id('f1_obra'), date '2027-02-01', date '2027-04-30');

select test.ok('f1_obra', 'Con fechas propias, mandan las de la obra',
  (select desde = date '2027-02-01' and hasta = date '2027-04-30'
     from public.work_summary where work_id = test.id('f1_obra')));

select test.ok('f1_obra', 'Y se guardan en la obra, no en los proyectos',
  (select cal_start = date '2027-02-01' and cal_end = date '2027-04-30'
     from public.works where id = test.id('f1_obra'))
  and (select fab_start = date '2027-03-08'
         from public.projects where id = test.id('f1_p1')));

select test.ok('f1_obra', 'El calendario muestra la obra en su periodo propio',
  exists (select 1 from public.v_calendar
           where kind = 'obra' and id = test.id('f1_obra')
             and date = date '2027-02-01')
  and exists (select 1 from public.v_calendar
               where kind = 'obra' and id = test.id('f1_obra')
                 and date = date '2027-04-30'));

select test.err('f1_obra', 'Un final anterior al inicio no se guarda',
  format($$select public.set_work_dates(%L, date '2027-05-01', date '2027-04-01')$$,
         test.id('f1_obra')), '22023');

select test.err('f1_obra', 'Y una sola de las dos fechas tampoco',
  format($$select public.set_work_dates(%L, date '2027-05-01', null)$$,
         test.id('f1_obra')), '22023');

select test.ok('f1_obra', 'Después del rechazo el periodo sigue intacto',
  (select cal_start = date '2027-02-01' from public.works where id = test.id('f1_obra')));

-- Las dos en blanco: la obra vuelve a seguir a sus proyectos.
select public.set_work_dates(test.id('f1_obra'), null, null);

select test.ok('f1_obra', 'Dejando las dos en blanco vuelve a seguir a sus proyectos',
  (select cal_start is null and cal_end is null
     from public.works where id = test.id('f1_obra'))
  and (select desde = date '2027-03-08' from public.work_summary
        where work_id = test.id('f1_obra')));

select test.ok('f1_obra', 'Y queda en el historial de la obra',
  (select count(*) from public.audit_log
    where action = 'editar_fechas' and entity_type = 'works'
      and entity_id = test.id('f1_obra')) = 2);


\echo '== FASE 1 · UN TRABAJADOR NO TOCA EL PERIODO DE LA OBRA'

reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.err('f1_permisos', 'El trabajador no puede poner el periodo de una obra',
  format($$select public.set_work_dates(%L, date '2027-01-01', date '2027-12-31')$$,
         test.id('f1_obra')), '42501');

select test.ok('f1_permisos', 'Y sigue sin ver ni una fila de las cuentas de la obra',
  (select count(*) from public.work_summary) = 0);

reset role; select test.as_server();
