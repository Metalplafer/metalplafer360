-- =====================================================================
-- METALPLAFER360 · MATERIAL DE TALLER (SIN PROYECTO)
--
-- Lo que importa aquí:
--
--   · que se pueda anotar material SIN proyecto, y que siga pudiéndose
--     anotar con proyecto como siempre;
--   · que NINGÚN material de los que ya existen se haya quedado sin
--     proyecto por aplicar la migración;
--   · que no exista ningún proyecto inventado para colgarlo de ahí;
--   · que una petición que llega sin proyecto se pueda aceptar como
--     material de taller, y que si la petición SÍ trae proyecto manda el
--     de la petición;
--   · que el material de taller sea de ADMINISTRACIÓN: un trabajador no
--     lo ve, ni en la tabla ni en el calendario;
--   · que un trabajador siga viendo EXACTAMENTE el material de sus
--     proyectos en el calendario, y no el de los demás. Es lo que podía
--     haberse roto al cambiar el «join» por un «left join»;
--   · que el material de taller que se retrase AVISE, con «Taller» donde
--     los demás llevan el código del proyecto;
--   · que salga en el informe de material;
--   · y que el historial diga «en el taller» y no «en un proyecto».
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== TALLER · LA COLUMNA Y LOS DATOS DE ANTES'

reset role; select test.as_server();

select test.ok('mt_columna', 'El proyecto del material ya puede faltar',
  (select is_nullable = 'YES' from information_schema.columns
    where table_schema = 'public' and table_name = 'materials' and column_name = 'project_id'));

-- LO QUE NO HA PASADO: nadie ha PERDIDO su proyecto.
--
-- Dicho de una manera que no dependa de lo que hayan creado los archivos
-- anteriores: todo material sin proyecto tiene que haber NACIDO así, y
-- eso se ve en su propia línea de historial, la del alta. Si la
-- migración —o un disparador— hubiera vaciado el proyecto de algo que lo
-- tenía, su línea de alta nombraría un proyecto y esta comprobación
-- fallaría.
select test.ok('mt_columna', 'Todo el material sin proyecto nació así: ninguno ha perdido el suyo',
  not exists (
    select 1 from public.materials m
     where m.project_id is null
       and not exists (select 1 from public.audit_log a
                        where a.entity_type = 'materials' and a.entity_id = m.id
                          and a.action = 'insert' and a.summary like '%en el taller%')),
  (select string_agg(m.name, ' | ') from public.materials m
    where m.project_id is null
      and not exists (select 1 from public.audit_log a
                       where a.entity_type = 'materials' and a.entity_id = m.id
                         and a.action = 'insert' and a.summary like '%en el taller%')));

-- Y no hay ningún proyecto de mentira para colgar los consumibles.
select test.ok('mt_columna', 'No se ha creado ningún proyecto «Taller» ni «Varios»',
  (select count(*) = 0 from public.projects
    where lower(name) in ('taller', 'varios', 'general', 'consumibles')
       or lower(name) like '%consumible%'),
  (select string_agg(code || ' · ' || name, ' | ') from public.projects
    where lower(name) in ('taller', 'varios', 'general', 'consumibles')));

-- La política de RLS no se toca: sigue siendo la de siempre, y es la que
-- deja el material de taller en manos de administración.
select test.ok('mt_columna', 'La política de lectura del material sigue siendo la de siempre',
  (select qual like '%is_admin()%' and qual like '%worker_can_see_project(project_id)%'
     from pg_policies where tablename = 'materials' and policyname = 'materials_select'),
  (select qual from pg_policies where tablename = 'materials' and policyname = 'materials_select'));

select test.ok('mt_columna', 'Y un proyecto que no se puede ver sigue dando «falso», no «nada»',
  public.worker_can_see_project(null) = false);


\echo '== TALLER · ANOTAR MATERIAL SIN PROYECTO'

set role authenticated; select test.as_user(test.id('salvi'));

-- Un proyecto en el que Juan NO está: su material no es asunto suyo.
with p as (
  insert into public.projects (client_id, name, budget_amount, phase)
  values (test.id('cli_laura'), 'Escalera metálica del almacén', 4200, 'fabricacion')
  returning id)
select test.put('mt_proy_ajeno', (select id from p));

with m as (
  insert into public.materials (project_id, name, units, supplier, expected_on)
  values (test.id('mt_proy_ajeno'), 'Tubo 40×40 ajeno', 8, 'Aceros del Vallès',
          public.today_madrid() - 2)
  returning id)
select test.put('mt_mat_ajeno', (select id from m));

-- Y el material de taller: lo que la mejora viene a permitir.
with m as (
  insert into public.materials (project_id, name, units, supplier, expected_on)
  values (null, 'Discos de corte 125 mm', 50, 'Aceros del Vallès', public.today_madrid() - 3)
  returning id)
select test.put('mt_taller', (select id from m));

select test.ok('mt_alta', 'Se anota material sin proyecto',
  (select project_id is null and units = 50 and name = 'Discos de corte 125 mm'
     from public.materials where id = test.id('mt_taller')));

select test.ok('mt_alta', 'Y el material con proyecto se sigue anotando igual',
  (select project_id = test.id('mt_proy_ajeno')
     from public.materials where id = test.id('mt_mat_ajeno')));

select test.ok('mt_alta', 'El historial dice que es del taller, no «de un proyecto»',
  exists (select 1 from public.audit_log
           where entity_type = 'materials'
             and summary like '%anotó material pendiente%Discos de corte 125 mm%en el taller%'),
  (select summary from public.audit_log
    where entity_type = 'materials' order by id desc limit 1));

select test.ok('mt_alta', 'Y el del proyecto sigue diciendo su código',
  exists (select 1 from public.audit_log
           where entity_type = 'materials'
             and summary like '%Tubo 40×40 ajeno%en ' ||
                 (select code from public.projects where id = test.id('mt_proy_ajeno')) || '%'));

-- Marcar recibido también lo cuenta bien.
update public.materials set received = true where id = test.id('mt_taller');
select test.ok('mt_alta', 'Al recibirlo, el historial tampoco se inventa un proyecto',
  exists (select 1 from public.audit_log
           where summary like '%marcó como recibido «Discos de corte 125 mm» de el taller%'),
  (select summary from public.audit_log
    where summary like '%Discos de corte 125 mm%' order by id desc limit 1));
update public.materials set received = false where id = test.id('mt_taller');


\echo '== TALLER · ACEPTAR UNA PETICIÓN QUE NO TRAE PROYECTO'

-- Esto es lo que se cortaba antes: la petición ya podía llegar sin
-- proyecto, pero aceptarla era imposible.
select test.put('mt_pet', (public.submit_material_need(null, 'Hacen falta electrodos del 2,5')).id);

select test.ok('mt_aceptar', 'La petición nace sin proyecto, como ya hacía',
  (select project_id is null and status = 'pendiente'
     from public.material_requests where id = test.id('mt_pet')));

select test.put('mt_mat_pet',
  (public.accept_material_request(test.id('mt_pet'), 'Electrodos 2,5 mm', 5)).id);

select test.ok('mt_aceptar', 'Se acepta y el material queda sin proyecto',
  (select project_id is null and name = 'Electrodos 2,5 mm' and units = 5
     from public.materials where id = test.id('mt_mat_pet')));

select test.ok('mt_aceptar', 'La petición queda aceptada y atada a su material',
  (select status = 'aceptada' and material_id = test.id('mt_mat_pet')
          and reviewed_at is not null and project_id is null
     from public.material_requests where id = test.id('mt_pet')));

-- Si la petición SÍ trae proyecto, manda el de la petición: no se puede
-- aceptar como consumible algo que se pidió para un trabajo.
select test.put('mt_pet2',
  (public.submit_material_need(test.id('mt_proy_ajeno'), 'Faltan tornillos M8')).id);
select test.put('mt_mat_pet2',
  (public.accept_material_request(test.id('mt_pet2'), 'Tornillos M8', 100)).id);

select test.ok('mt_aceptar', 'Una petición con proyecto se acepta con SU proyecto',
  (select project_id = test.id('mt_proy_ajeno')
     from public.materials where id = test.id('mt_mat_pet2')));

select test.err('mt_aceptar', 'Y un proyecto que no existe se sigue rechazando',
  format($$select public.accept_material_request(
             (public.submit_material_need(null, 'Algo')).id, 'Algo',
             null, null, null, null, null, '00000000-0000-0000-0000-000000000000')$$),
  'P0002');


\echo '== TALLER · ES DE ADMINISTRACIÓN'

set role authenticated; select test.as_user(test.id('juan'));

select test.ok('mt_juan', 'Un trabajador no ve el material de taller en la tabla',
  (select count(*) = 0 from public.materials where project_id is null),
  (select string_agg(name, ' | ') from public.materials where project_id is null));

select test.ok('mt_juan', 'Ni en el calendario',
  (select count(*) = 0 from public.v_calendar
    where kind = 'material' and title = 'Discos de corte 125 mm'));

-- LO QUE PODÍA HABERSE ROTO con el «left join»: que el calendario le
-- empezara a enseñar el material de proyectos que no son suyos.
select test.ok('mt_juan', 'No ve el material del proyecto en el que no está',
  (select count(*) = 0 from public.v_calendar
    where kind = 'material' and title = 'Tubo 40×40 ajeno'));

-- Y lo que NO puede haberse perdido: el material de SUS proyectos.
select test.ok('mt_juan', 'Ve en el calendario exactamente el material de sus proyectos',
  (select coalesce(array_agg(id order by id), '{}'::uuid[])
     from public.v_calendar where kind = 'material')
  = (select coalesce(array_agg(m.id order by m.id), '{}'::uuid[])
       from public.materials m
      where m.archived_at is null and m.expected_on is not null
        and m.project_id is not null and public.worker_can_see_project(m.project_id)),
  (select count(*)::text || ' filas de material en su calendario'
     from public.v_calendar where kind = 'material'));

-- Y esa lista no está vacía: si lo estuviera, la comprobación de arriba
-- no estaría comprobando nada.
select test.ok('mt_juan', 'Y esa lista no está vacía, para que la comprobación valga',
  (select count(*) > 0 from public.v_calendar where kind = 'material'),
  (select count(*)::text from public.v_calendar where kind = 'material'));

select test.err('mt_juan', 'Un trabajador tampoco puede anotar material de taller',
  $$insert into public.materials (project_id, name) values (null, 'Lo que sea')$$, '42501');


\echo '== TALLER · EL CALENDARIO DE ADMINISTRACIÓN SÍ LO ENSEÑA'

select test.as_user(test.id('salvi'));

select test.ok('mt_calendario', 'Administración ve el material de taller en el calendario',
  (select count(*) = 1 from public.v_calendar
    where kind = 'material' and title = 'Discos de corte 125 mm'));

select test.ok('mt_calendario', 'Sin código de proyecto, porque no tiene',
  (select project_id is null and project_code is null and client_name is null
     from public.v_calendar where kind = 'material' and title = 'Discos de corte 125 mm'));

select test.ok('mt_calendario', 'Y el material con proyecto sigue trayendo su código y su cliente',
  (select project_code = (select code from public.projects where id = test.id('mt_proy_ajeno'))
     from public.v_calendar where kind = 'material' and title = 'Tubo 40×40 ajeno'));

-- POR QUÉ ESTA COMPROBACIÓN ES RARA, Y POR QUÉ HACE FALTA.
--
-- La condición de permisos que lleva la rama del material es una SEGUNDA
-- cerradura. Hoy «v_calendar» se ejecuta con los permisos de quien
-- pregunta, así que las políticas de «materials» ya filtran solas:
-- quitar la condición no rompería nada HOY, y por eso las
-- comprobaciones de arriba no la distinguen. Se vio rompiéndola a
-- propósito: ninguna prueba se enteró.
--
-- Pero «planned_spans», en el mismo archivo 32, es «security_invoker =
-- false» justo porque tuvo que dejar de depender de eso. El día que
-- «v_calendar» cambie igual, la ÚNICA cerradura que quedará es esta
-- condición. Y sin ella el calendario enseñaría a cada trabajador el
-- material de los proyectos que no son suyos.
--
-- Para comprobar la condición SOLA hay que preguntar sin sesión, que es
-- cuando las políticas no filtran. Entonces la vista no debe devolver ni
-- una fila de material. Comprobado: sin la condición devuelve las 7.
reset role; select test.as_server();
select test.ok('mt_calendario',
  'La rama del material filtra por su cuenta, sin depender de las políticas',
  (select count(*) = 0 from public.v_calendar where kind = 'material'),
  (select count(*)::text || ' filas de material sin sesión'
     from public.v_calendar where kind = 'material'));

set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('mt_calendario', 'Los contadores por proyecto no cuentan el de taller',
  (select coalesce(sum(total), 0) = 0 from public.project_materials
    where project_id is null and false)
  and not exists (select 1 from public.project_materials pm
                   join public.materials m on m.project_id = pm.project_id
                  where m.id = test.id('mt_taller')));


\echo '== TALLER · AVISA SI SE RETRASA, Y SALE EN LOS INFORMES'

-- Era un agujero de verdad: con el «join» de antes, el material de
-- taller retrasado no habría avisado a nadie.
update public.materials set late_notified_on = null
 where id in (test.id('mt_taller'), test.id('mt_mat_ajeno'));

select test.ok('mt_avisos', 'El aviso de retrasos recorre también el material de taller',
  public.notify_late_materials() >= 2);

reset role; select test.as_server();
select test.ok('mt_avisos', 'Y el aviso pone «Taller» donde los demás llevan el proyecto',
  exists (select 1 from public.notifications
           where kind = 'material_retrasado'
             and body like 'Discos de corte 125 mm · Taller · estaba previsto%'),
  (select body from public.notifications
    where kind = 'material_retrasado' and body like '%Discos de corte%' limit 1));

select test.ok('mt_avisos', 'El material de un proyecto sigue avisando con su código',
  exists (select 1 from public.notifications
           where kind = 'material_retrasado'
             and body like 'Tubo 40×40 ajeno · ' ||
                 (select code from public.projects where id = test.id('mt_proy_ajeno')) || '%'));

set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('mt_informe', 'El informe de material incluye el de taller, con «Taller»',
  exists (select 1 from public.report_materials(
                        public.today_madrid() - 30, public.today_madrid())
           where material = 'Discos de corte 125 mm' and proyecto = 'Taller'
             and dias_retraso = 3));

select test.ok('mt_informe', 'Y sigue trayendo el de los proyectos con su código',
  exists (select 1 from public.report_materials(
                        public.today_madrid() - 30, public.today_madrid())
           where material = 'Tubo 40×40 ajeno'
             and proyecto = (select code from public.projects
                              where id = test.id('mt_proy_ajeno'))));

select test.ok('mt_informe', 'El informe por proveedor cuenta los dos juntos',
  (select pedidos >= 2 from public.report_suppliers(
                              public.today_madrid() - 30, public.today_madrid())
    where proveedor = 'Aceros del Vallès'));

reset role; select test.as_server();
