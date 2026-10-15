-- =====================================================================
-- METALPLAFER360 · PARTES COMPARTIDOS Y COHERENCIA DE HORAS
--
-- Lo que importa aquí:
--   · que un parte compartido sea UN trabajo con las horas de CADA UNO,
--     y que sumen horas-persona sin contar a nadie dos veces;
--   · que el AUTOR no pueda acabar contado dos veces por ningún camino:
--     ni añadiéndose él, ni escribiendo en la tabla a mano;
--   · que solo se pueda compartir con quien está asignado al MISMO
--     proyecto o al MISMO aviso, y que eso lo decida el BACKEND;
--   · que quien estuvo en el trabajo pueda LEER el parte, sus
--     fotografías y sus comentarios, y que quien no estuvo NO pueda;
--   · que ampliar la lectura NO haya ampliado la escritura: editar el
--     parte y subirle archivos sigue siendo del autor;
--   · que las HORAS PRESUPUESTADAS no se muevan por registrar horas
--     reales, y que el desvío sea la diferencia;
--   · que el PANEL y los dos INFORMES cuenten los partes, que es lo que
--     no hacían, y que cuadren con «project_hours» y con la ficha del
--     proyecto;
--   · que los partes individuales de siempre sigan contando igual.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== HORAS · PREPARACIÓN'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

-- Un proyecto CON HORAS PRESUPUESTADAS y SIN NINGUNA ORDEN DE TRABAJO.
-- Lo segundo es a propósito: con el cálculo anterior, un proyecto así no
-- aparecía siquiera en «Horas por proyecto».
with p as (insert into public.projects (client_id, name, budget_amount,
                                        budget_hours_fab, budget_hours_mont)
           values (test.id('cli_laura'), 'Barandilla de las horas', 12000, 20, 10)
           returning id)
select test.put('h_proy', (select id from p));
select public.assign_project_workers(test.id('h_proy'),
  array[test.id('juan'), test.id('pedro')]::uuid[]);

select test.ok('h_base', 'El proyecto de la prueba no tiene ninguna orden de trabajo',
  (select count(*) = 0 from public.work_orders where project_id = test.id('h_proy')));

select test.setnote('h_previstas', (select (previstas_fab + previstas_mont)::text
                                      from public.project_hours
                                     where project_id = test.id('h_proy')));
select test.ok('h_base', 'Y sus horas previstas son las que puso administración: 30',
  test.note('h_previstas') = '30.00' or test.note('h_previstas') = '30',
  test.note('h_previstas'));


\echo '== HORAS · UN PARTE COMPARTIDO ES UN TRABAJO CON LAS HORAS DE CADA UNO'

reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.put('h_parte', (select id from public.save_work_report(
  null, test.id('h_proy'), 'montaje', public.today_madrid(),
  'Montaje de los tres tramos. Fuimos Pedro y yo.', 3, false, true)));

-- Juan comparte el trabajo con Pedro, que está en el mismo proyecto.
select public.save_report_workers(test.id('h_parte'),
  jsonb_build_array(jsonb_build_object('worker_id', test.id('pedro'), 'hours', 3)));

select test.ok('h_compartido', 'Sigue habiendo UN solo parte, no dos',
  (select count(*) = 1 from public.work_reports where project_id = test.id('h_proy')));

select test.ok('h_compartido', 'Con una sola descripción y un solo tipo de trabajo',
  (select work_type = 'montaje' and work_done like 'Montaje de los tres tramos%'
     from public.work_reports where id = test.id('h_parte')));

select test.ok('h_compartido', 'Las horas del autor siguen en el parte: 3',
  (select hours = 3 from public.work_reports where id = test.id('h_parte')));

select test.ok('h_compartido', 'Y las de Pedro, aparte y suyas: 3',
  (select hours = 3 from public.work_report_workers
    where report_id = test.id('h_parte') and worker_id = test.id('pedro')));

select test.ok('h_compartido', 'El equipo del parte sale con el autor marcado',
  (select count(*) = 2 and count(*) filter (where es_autor) = 1
     from public.report_team where report_id = test.id('h_parte')));


\echo '== HORAS · EL AUTOR NO SE PUEDE CONTAR DOS VECES'

select test.err('h_doble', 'El autor no se puede añadir a sí mismo como acompañante',
  format($$select public.save_report_workers(%L,
            jsonb_build_array(jsonb_build_object('worker_id', %L, 'hours', 3)))$$,
         test.id('h_parte'), test.id('juan')), '22023');

-- Y por si alguien se salta la función: la tabla tampoco lo admite.
reset role; select test.as_server();
select test.err('h_doble', 'Ni escribiendo en la tabla a pelo, que es lo que lo hace imposible',
  format($$insert into public.work_report_workers (report_id, worker_id, hours)
           values (%L, %L, 3)$$, test.id('h_parte'), test.id('juan')), '23505');

-- Que cada uno cuente UNA sola vez se comprueba abajo, en cuanto el
-- parte está validado: antes de validar «hours_worked» está vacío a
-- propósito, así que ahí no se mediría nada.


\echo '== HORAS · NO CUENTAN HASTA QUE SE VALIDAN'

select test.ok('h_validar', 'Enviado y sin validar, el trabajo compartido no cuenta nada',
  (select count(*) = 0 from public.hours_worked where source_id = test.id('h_parte')));

set role authenticated; select test.as_user(test.id('salvi'));
select public.validate_work_report(test.id('h_parte'));

select test.ok('h_validar', 'Al validarlo cuentan las dos personas',
  (select count(*) = 2 from public.hours_worked where source_id = test.id('h_parte')));

select test.ok('h_validar', 'Y suman 6 horas-persona: 3 de Juan y 3 de Pedro',
  (select sum(hours) = 6 from public.hours_worked where source_id = test.id('h_parte')));

select test.ok('h_doble', 'Juan aparece UNA sola vez, con sus 3 horas',
  (select count(*) = 1 and sum(hours) = 3 from public.hours_worked
    where source_id = test.id('h_parte') and worker_id = test.id('juan')));

select test.ok('h_doble', 'Y Pedro una sola vez, con las suyas',
  (select count(*) = 1 and sum(hours) = 3 from public.hours_worked
    where source_id = test.id('h_parte') and worker_id = test.id('pedro')));

select test.ok('h_validar', 'Las 6 llegan al proyecto como horas realizadas',
  (select realizadas_mont = 6 and realizadas_total = 6
     from public.project_hours where project_id = test.id('h_proy')));

select test.ok('h_validar', 'Y el resumen de partes del proyecto cuenta las 6, no solo las 3 del autor',
  (select horas_validadas = 6 and total = 1 and validados = 1
     from public.project_reports where project_id = test.id('h_proy')));

select test.ok('h_validar', 'Las dos pantallas dicen lo mismo: no hay dos verdades',
  (select h.realizadas_total = r.horas_validadas
     from public.project_hours h
     join public.project_reports r on r.project_id = h.project_id
    where h.project_id = test.id('h_proy')));

-- Y validado, el reparto queda cerrado: sus horas ya cuentan como hechas.
select test.err('h_validar', 'Un parte validado ya no cambia con quién se hizo',
  format($$select public.save_report_workers(%L, '[]'::jsonb)$$,
         test.id('h_parte')), '42501');


\echo '== HORAS · PRESUPUESTADAS Y REALES NO SE MEZCLAN'

reset role; select test.as_server();
select test.ok('h_presu', 'Registrar 6 horas reales NO ha tocado las 30 presupuestadas',
  (select (previstas_fab + previstas_mont)::text = test.note('h_previstas')
     from public.project_hours where project_id = test.id('h_proy')));

select test.ok('h_presu', 'Las previstas siguen siendo las de administración: 20 y 10',
  (select previstas_fab = 20 and previstas_mont = 10
     from public.project_hours where project_id = test.id('h_proy')));

select test.ok('h_presu', 'Y se pueden mirar las tres cifras: previstas, reales y la diferencia',
  (select previstas_total = 30 and realizadas_total = 6 and previstas_total - realizadas_total = 24
     from public.project_hours where project_id = test.id('h_proy')));


\echo '== HORAS · SOLO SE COMPARTE CON QUIEN ESTÁ EN EL MISMO TRABAJO'

-- Un tercero que NO está en el proyecto. Se crea por «auth.users», que
-- es por donde nacen las personas de verdad: el disparador de alta le
-- hace el perfil. En «profiles» no se escribe a mano, y hace bien en no
-- dejar.
reset role; select test.as_server();
insert into auth.users (email, raw_user_meta_data)
values ('ajeno@metalplafer.com', '{"full_name":"Ajeno Del Todo","username":"ajeno"}');
select test.put('h_ajeno',
  (select id from auth.users where email = 'ajeno@metalplafer.com'));

select test.ok('h_quien', 'El tercero existe, es trabajador y no está en el proyecto',
  (select pr.role = 'worker' and pr.active from public.profiles pr
    where pr.id = test.id('h_ajeno'))
  and not exists (select 1 from public.project_workers
                   where project_id = test.id('h_proy')
                     and worker_id = test.id('h_ajeno')));

set role authenticated; select test.as_user(test.id('juan'));

select test.put('h_parte2', (select id from public.save_work_report(
  null, test.id('h_proy'), 'fabricacion', public.today_madrid(),
  'Corte y preparación de los tramos.', 4, false, false)));

select test.ok('h_quien', 'La lista de candidatos trae a los del proyecto y no al autor',
  (select count(*) = 1 and bool_and(id = test.id('pedro'))
     from public.report_candidates(test.id('h_parte2'))));

select test.err('h_quien', 'No se puede compartir con quien no está asignado al trabajo',
  format($$select public.save_report_workers(%L,
            jsonb_build_array(jsonb_build_object('worker_id', %L, 'hours', 2)))$$,
         test.id('h_parte2'), test.id('h_ajeno')), '42501');

select test.ok('h_quien', 'Y no se ha colado ninguna fila al intentarlo',
  (select count(*) = 0 from public.work_report_workers
    where report_id = test.id('h_parte2')));

select test.err('h_quien', 'Ni con alguien que no existe',
  format($$select public.save_report_workers(%L,
            jsonb_build_array(jsonb_build_object('worker_id', %L, 'hours', 2)))$$,
         test.id('h_parte2'), '00000000-0000-0000-0000-000000000009'), '22023');

-- Un parte SUELTO no tiene grupo del que elegir.
select test.put('h_suelto', (select id from public.save_work_report(
  null, null, 'fabricacion', public.today_madrid(), 'Faena suelta.', 2, false, false)));

select test.err('h_quien', 'Un parte sin proyecto ni aviso todavía no se puede compartir',
  format($$select public.save_report_workers(%L,
            jsonb_build_array(jsonb_build_object('worker_id', %L, 'hours', 2)))$$,
         test.id('h_suelto'), test.id('pedro')), '22023');

-- Y el parte de un AVISO se comparte con los del aviso. «av_aviso» lo
-- tienen Juan y Pedro desde el archivo 90.
select test.ok('h_quien', 'En un parte de aviso, los candidatos son los del aviso',
  (select count(*) = 1 and bool_and(id = test.id('pedro'))
     from public.report_candidates(test.id('av_parte'))));

select test.err('h_quien', 'Y tampoco entra ahí quien no está en el aviso',
  format($$select public.save_report_workers(%L,
            jsonb_build_array(jsonb_build_object('worker_id', %L, 'hours', 1)))$$,
         test.id('av_parte'), test.id('h_ajeno')), '42501');

-- Quitar a alguien es mandar la lista sin él.
select public.save_report_workers(test.id('h_parte2'),
  jsonb_build_array(jsonb_build_object('worker_id', test.id('pedro'), 'hours', 2)));
select test.ok('h_quien', 'Compartir con quien sí está funciona',
  (select count(*) = 1 from public.work_report_workers where report_id = test.id('h_parte2')));

select public.save_report_workers(test.id('h_parte2'), '[]'::jsonb);
select test.ok('h_quien', 'Y mandando la lista vacía el parte vuelve a ser individual',
  (select count(*) = 0 from public.work_report_workers where report_id = test.id('h_parte2')));

-- Se deja compartido para las pruebas de permisos de abajo.
select public.save_report_workers(test.id('h_parte2'),
  jsonb_build_array(jsonb_build_object('worker_id', test.id('pedro'), 'hours', 2)));


\echo '== HORAS · QUIEN ESTUVO EN EL TRABAJO LO PUEDE LEER'

-- Juan le pone una fotografía y un comentario al parte.
insert into public.documents (report_id, storage_path, file_name, mime_type, size_bytes,
                              category, scope, uploaded_by)
values (test.id('h_parte2'), 'reports/' || test.id('h_parte2') || '/tramo.jpg',
        'tramo.jpg', 'image/jpeg', 2500, 'foto', 'tecnica', test.id('juan'));
insert into public.comments (report_id, author_id, body)
values (test.id('h_parte2'), test.id('juan'), 'El tramo del medio venía torcido de fábrica.');

reset role; set role authenticated; select test.as_user(test.id('pedro'));

select test.ok('h_leer', 'Pedro, que estuvo en el trabajo, ve el parte',
  exists (select 1 from public.work_reports where id = test.id('h_parte2')));
select test.ok('h_leer', 'Y la fotografía del trabajo',
  exists (select 1 from public.documents where report_id = test.id('h_parte2')));
select test.ok('h_leer', 'Y el comentario',
  exists (select 1 from public.comments where report_id = test.id('h_parte2')));
select test.ok('h_leer', 'Y puede descargar el archivo del almacén',
  public.storage_can_read('reports/' || test.id('h_parte2') || '/tramo.jpg'));
select test.ok('h_leer', 'Y ve quién puso cuántas horas en ese trabajo',
  (select count(*) = 2 from public.report_team where report_id = test.id('h_parte2')));

-- LO QUE NO SE HA AMPLIADO: escribir.
select test.err('h_leer', 'Pero NO puede cambiar el parte: eso sigue siendo del autor',
  format($$select public.save_work_report(%L, null, 'fabricacion', null, 'Lo cambio yo', 1,
                                          false, false)$$, test.id('h_parte2')), '42501');

select test.err('h_leer', 'Ni subirle una fotografía',
  format($$insert into public.documents (report_id, storage_path, file_name, mime_type,
                                         size_bytes, category, scope, uploaded_by)
           values (%L, 'reports/x/cuela.jpg', 'cuela.jpg', 'image/jpeg', 10,
                   'foto', 'tecnica', %L)$$,
         test.id('h_parte2'), test.id('pedro')), '42501');

select test.err('h_leer', 'Ni repartir el parte de otro',
  format($$select public.save_report_workers(%L, '[]'::jsonb)$$,
         test.id('h_parte2')), '42501');

-- Y quien NO estuvo, no entra por ningún lado.
reset role; set role authenticated; select test.as_user(test.id('h_ajeno'));

select test.ok('h_leer', 'Quien no estuvo en el trabajo NO ve el parte',
  not exists (select 1 from public.work_reports where id = test.id('h_parte2')));
select test.ok('h_leer', 'Ni su fotografía',
  not exists (select 1 from public.documents where report_id = test.id('h_parte2')));
select test.ok('h_leer', 'Ni su comentario',
  not exists (select 1 from public.comments where report_id = test.id('h_parte2')));
select test.ok('h_leer', 'Ni se le firma el enlace del archivo',
  not public.storage_can_read('reports/' || test.id('h_parte2') || '/tramo.jpg'));
select test.ok('h_leer', 'Ni ve quién estuvo',
  (select count(*) = 0 from public.report_team where report_id = test.id('h_parte2')));


\echo '== HORAS · EL PANEL Y LOS INFORMES CUENTAN LOS PARTES'

reset role; set role authenticated; select test.as_user(test.id('salvi'));
select test.setnote('h_panel',
  public.dashboard_summary(public.today_madrid(), public.today_madrid())::text);

select test.ok('h_panel', 'El panel cuenta las horas de los partes, que antes no contaba',
  (test.note('h_panel')::jsonb -> 'produccion' ->> 'horas_totales')::numeric >= 6,
  test.note('h_panel')::jsonb -> 'produccion' #>> '{}');

select test.ok('h_panel', 'Y las reparte bien entre fabricación y montaje',
  (test.note('h_panel')::jsonb -> 'produccion' ->> 'horas_montaje')::numeric >= 6);

select test.ok('h_panel', 'Cuenta trabajos, no solo órdenes',
  (test.note('h_panel')::jsonb -> 'produccion' ->> 'trabajos_validados')::int >= 1);

select test.ok('h_panel', 'Y las personas con horas incluyen a los dos del parte compartido',
  (test.note('h_panel')::jsonb -> 'produccion' ->> 'trabajadores')::int >= 2);

-- HORAS POR TRABAJADOR
select test.ok('h_informe', 'Juan sale con sus 3 horas del parte compartido',
  (select total >= 3 from public.report_hours_by_worker(
            public.today_madrid(), public.today_madrid())
    where trabajador like 'Juan%'));

select test.ok('h_informe', 'Y Pedro con las suyas, por separado',
  (select total >= 3 from public.report_hours_by_worker(
            public.today_madrid(), public.today_madrid())
    where trabajador like 'Pedro%'));

select test.ok('h_informe', 'El total de cada uno es fabricación más montaje',
  (select bool_and(total = fabricacion + montaje)
     from public.report_hours_by_worker(public.today_madrid(), public.today_madrid())));

-- LA COMPROBACIÓN QUE DE VERDAD VIGILA ESTE INFORME.
--
-- Decir «Juan sale con 3 horas o más» no servía: Juan ya tenía horas de
-- órdenes, así que la comprobación pasaba igual aunque el informe se
-- olvidara de los partes. Lo cazó el banco de mutaciones.
--
-- Lo que se exige ahora es una IGUALDAD, fila por fila, contra
-- «hours_worked», que es la fuente única. Si el informe cuenta de menos
-- (o de más), aquí no cuadra. El «full join» es a propósito: así también
-- salta si al informe le falta una persona entera o le sobra una.
select test.ok('h_informe', 'Las horas del informe son EXACTAMENTE las de la fuente única',
  not exists (
    select 1
      from (select pr.full_name, sum(h.hours) as horas
              from public.hours_worked h
              join public.profiles pr on pr.id = h.worker_id
             where h.work_date = public.today_madrid()
             group by pr.full_name) fuente
      full join public.report_hours_by_worker(
                  public.today_madrid(), public.today_madrid()) i
             on i.trabajador = fuente.full_name
     where coalesce(i.total, -1) <> coalesce(fuente.horas, -1)
        or i.trabajador is null or fuente.full_name is null));

-- Y lo mismo repartido por tipo de trabajo, para que no cuadre el total
-- por casualidad mientras fabricación y montaje están cruzados.
select test.ok('h_informe', 'Y también cuadran fabricación y montaje por separado',
  not exists (
    select 1
      from (select pr.full_name,
                   coalesce(sum(h.hours) filter (where h.work_type = 'fabricacion'), 0) as fab,
                   coalesce(sum(h.hours) filter (where h.work_type = 'montaje'), 0) as mont
              from public.hours_worked h
              join public.profiles pr on pr.id = h.worker_id
             where h.work_date = public.today_madrid()
             group by pr.full_name) fuente
      join public.report_hours_by_worker(
             public.today_madrid(), public.today_madrid()) i
        on i.trabajador = fuente.full_name
     where i.fabricacion <> fuente.fab or i.montaje <> fuente.mont));

-- HORAS POR PROYECTO · aquí estaba el agujero gordo: un proyecto sin
-- ninguna orden de trabajo no aparecía.
select test.ok('h_informe', 'Un proyecto SIN órdenes y CON partes ya aparece en el informe',
  (select count(*) = 1 from public.report_hours_by_project(
            public.today_madrid(), public.today_madrid())
    where code = (select code from public.projects where id = test.id('h_proy'))));

select test.ok('h_informe', 'Con sus horas previstas, sus reales y el desvío',
  (select previstas = 30 and total = 6 and desvio = -24
     from public.report_hours_by_project(public.today_madrid(), public.today_madrid())
    where code = (select code from public.projects where id = test.id('h_proy'))));

select test.ok('h_informe', 'Y lo que dice el informe cuadra con la ficha del proyecto',
  (select i.total = h.realizadas_total
     from public.report_hours_by_project(public.today_madrid(), public.today_madrid()) i
     join public.projects p on p.code = i.code
     join public.project_hours h on h.project_id = p.id
    where p.id = test.id('h_proy')));

select test.ok('h_informe', 'El desvío sigue siendo reales menos previstas, en todas las filas',
  (select bool_and(desvio = total - previstas)
     from public.report_hours_by_project(public.today_madrid(), public.today_madrid())));


\echo '== HORAS · LOS PARTES INDIVIDUALES DE SIEMPRE NO CAMBIAN'

-- «parte_juan» viene del archivo 80 y no tiene ningún acompañante: tiene
-- que seguir contando exactamente sus propias horas y nada más.
reset role; select test.as_server();

select test.ok('h_viejo', 'Un parte individual de antes no tiene acompañantes',
  (select count(*) = 0 from public.work_report_workers
    where report_id = test.id('parte_juan')));

select test.ok('h_viejo', 'Y cuenta UNA vez, con las horas que tiene el parte',
  (select count(*) = 1 and sum(h.hours) = (select r.hours from public.work_reports r
                                            where r.id = test.id('parte_juan'))
     from public.hours_worked h where h.source_id = test.id('parte_juan')));

select test.ok('h_viejo', 'Nadie ha tocado sus horas, su estado ni su fecha al migrar',
  (select status = 'validado' and hours is not null
     from public.work_reports where id = test.id('parte_juan')));

-- Y las horas de las ÓRDENES siguen contando, que es lo que no hay que romper.
select test.ok('h_viejo', 'Las horas de las órdenes de trabajo siguen contando igual',
  (select count(*) > 0 from public.hours_worked where origen = 'orden'));

select test.ok('h_viejo', 'Y «hours_worked» distingue de dónde viene cada hora',
  (select count(distinct origen) = 2 from public.hours_worked));

reset role; select test.as_server();
