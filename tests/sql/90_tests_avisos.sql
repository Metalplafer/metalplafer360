-- =====================================================================
-- METALPLAFER360 · AVISOS PARA VARIOS TRABAJADORES
--                  Y LAS VISITAS, SOLO PARA ADMINISTRACIÓN
--
-- Lo que importa aquí:
--   · que un aviso se pueda repartir entre VARIOS trabajadores;
--   · que las asignaciones de ANTES («assigned_to») sigan valiendo, sin
--     migrar ni una fila;
--   · que desde un aviso asignado se pueda rellenar un parte, con sus
--     horas reales y sus fotografías;
--   · que una VISITA no se pueda dar a un trabajador normal POR NINGÚN
--     camino: ni creándola, ni asignándola después, ni por la función
--     de equipos, ni escribiendo a pelo en la tabla;
--   · que una visita que YA estuviera asignada se pueda seguir
--     guardando, porque la regla mira la asignación, no el resto;
--   · que nadie vea el aviso de otro, y que el equipo de un aviso solo
--     lo vean administración y los del propio aviso;
--   · que las horas presupuestadas NO se toquen al registrar horas
--     reales.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== AVISOS · PREPARACIÓN'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

-- Un aviso nuevo, de administración, como se crean de verdad.
with a as (insert into public.fichas (type, client_id, title, description, address,
                                      phone, scheduled_date, scheduled_time)
           values ('aviso', test.id('cli_laura'), 'Persiana metálica atascada',
                   'No sube del todo. Hay que mirar el eje.',
                   'Carrer de Sant Pau, 14', '644555666',
                   public.today_madrid(), '08:30') returning id)
select test.put('av_aviso', (select id from a));

-- Y una VISITA, que es lo que no se puede repartir.
with v as (insert into public.fichas (type, client_id, title, address, scheduled_date)
           values ('visita', test.id('cli_laura'), 'Medir el hueco del montacargas',
                   'Carrer de Sant Pau, 14', public.today_madrid() + 2) returning id)
select test.put('av_visita', (select id from v));

-- Un segundo aviso que es SOLO de Pedro: sirve para comprobar que Juan no
-- se asoma a lo que no es suyo.
with o as (insert into public.fichas (type, client_id, title, phone)
           values ('aviso', test.id('cli_laura'), 'Reja suelta en el patio',
                   '644555667') returning id)
select test.put('av_otro', (select id from o));
select public.assign_ficha_workers(test.id('av_otro'), array[test.id('pedro')]::uuid[]);

-- Y un proyecto de Juan con horas PRESUPUESTADAS, para comprobar que
-- registrar horas reales no se las come.
with p as (insert into public.projects (client_id, name, budget_amount,
                                        budget_hours_fab, budget_hours_mont)
           values (test.id('cli_laura'), 'Proyecto de las horas previstas',
                   9000, 30, 20) returning id)
select test.put('av_proy', (select id from p));
select public.assign_project_workers(test.id('av_proy'), array[test.id('juan')]::uuid[]);


\echo '== AVISOS · UN AVISO PARA VARIOS TRABAJADORES'

select public.assign_ficha_workers(test.id('av_aviso'),
  array[test.id('juan'), test.id('pedro')]::uuid[]);

select test.ok('av_equipo', 'Un aviso se reparte entre dos trabajadores',
  (select count(*) = 2 from public.ficha_workers where ficha_id = test.id('av_aviso')));

select test.ok('av_equipo', 'Y quedan los dos que se han pedido, no otros',
  (select bool_and(worker_id in (test.id('juan'), test.id('pedro')))
     from public.ficha_workers where ficha_id = test.id('av_aviso')));

select test.ok('av_equipo', 'Queda anotado quién lo ha repartido y cuándo',
  (select bool_and(assigned_by = test.id('salvi') and assigned_at is not null)
     from public.ficha_workers where ficha_id = test.id('av_aviso')));

-- Se mira desde el servidor: la campana de cada uno es suya y
-- administración no la lee (eso ya lo vigilan las pruebas de permisos).
-- Y se mira por el CÓDIGO de este aviso, porque la preparación ya ha
-- avisado a Pedro del suyo: contar todos los «aviso_asignado» mediría
-- otra cosa.
reset role; select test.as_server();
select test.setnote('av_codigo',
  (select code from public.fichas where id = test.id('av_aviso')));

select test.ok('av_equipo', 'Cada uno recibe su aviso en la campana',
  (select count(*) = 2 from public.notifications
    where kind = 'aviso_asignado'
      and user_id in (test.id('juan'), test.id('pedro'))
      and body like test.note('av_codigo') || '%'));
set role authenticated; select test.as_user(test.id('salvi'));

-- Mandar la lista entera es lo que decide el equipo, igual que en los
-- proyectos: quitar a uno es mandarla sin él.
select public.assign_ficha_workers(test.id('av_aviso'), array[test.id('juan')]::uuid[]);

select test.ok('av_equipo', 'Mandando la lista sin Pedro, Pedro sale del aviso',
  (select count(*) = 1 and bool_and(worker_id = test.id('juan'))
     from public.ficha_workers where ficha_id = test.id('av_aviso')));

-- Y volver a ponerlo no duplica ni vuelve a avisar a quien ya estaba.
select public.assign_ficha_workers(test.id('av_aviso'),
  array[test.id('juan'), test.id('pedro')]::uuid[]);

select test.ok('av_equipo', 'Y volver a ponerlo no duplica la fila',
  (select count(*) = 2 from public.ficha_workers where ficha_id = test.id('av_aviso')));

reset role; select test.as_server();
select test.ok('av_equipo', 'A Juan, que no se ha movido, no se le vuelve a avisar',
  (select count(*) = 1 from public.notifications
    where kind = 'aviso_asignado' and user_id = test.id('juan')
      and body like test.note('av_codigo') || '%'));
set role authenticated; select test.as_user(test.id('salvi'));

select test.err('av_equipo', 'No se puede repartir entre quien no existe',
  format($$select public.assign_ficha_workers(%L, array[%L]::uuid[])$$,
         test.id('av_aviso'), '00000000-0000-0000-0000-000000000009'), '22023');

select test.err('av_equipo', 'Ni asignar una ficha que no existe',
  format($$select public.assign_ficha_workers(%L, array[%L]::uuid[])$$,
         '00000000-0000-0000-0000-000000000009', test.id('juan')), 'P0002');


\echo '== AVISOS · LAS ASIGNACIONES DE ANTES SIGUEN VALIENDO'

-- «avi1» es el aviso de la fase 2, asignado a Juan por el camino de
-- siempre («assigned_to») y SIN ninguna fila en la tabla nueva. Tiene que
-- seguir funcionando exactamente igual: es el requisito de compatibilidad.
select test.ok('av_viejo', 'El aviso de antes no tiene filas en la tabla nueva',
  (select count(*) = 0 from public.ficha_workers where ficha_id = test.id('avi1')));

reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.ok('av_viejo', 'Y Juan lo sigue viendo, por «assigned_to» de siempre',
  exists (select 1 from public.worker_fichas where id = test.id('avi1')));

select test.ok('av_viejo', 'La función de acceso le sigue diciendo sí',
  public.worker_has_ficha(test.id('avi1')));

select test.ok('av_nuevo', 'Y el aviso nuevo le llega por el camino nuevo',
  public.worker_has_ficha(test.id('av_aviso')));

select test.ok('av_nuevo', 'Que es el que le pone el aviso en su listado',
  exists (select 1 from public.worker_avisos where id = test.id('av_aviso')));

select test.ok('av_nuevo', 'Con el cliente, el trabajo, la dirección y el teléfono',
  (select client_name is not null and title = 'Persiana metálica atascada'
      and address like '%Sant Pau%' and phone = '644555666'
     from public.worker_avisos where id = test.id('av_aviso')));

select test.ok('av_nuevo', 'Y «worker_avisos» no tiene columna de importe',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'worker_avisos'
                 and column_name = 'amount'));

reset role; set role authenticated; select test.as_user(test.id('pedro'));

select test.ok('av_nuevo', 'Pedro, que también está, lo ve igual',
  exists (select 1 from public.worker_avisos where id = test.id('av_aviso')));

select test.ok('av_nuevo', 'Pero NO ve el aviso de Juan, en el que no está',
  not exists (select 1 from public.worker_avisos where id = test.id('avi1')));


\echo '== AVISOS · UN PARTE DESDE UN AVISO ASIGNADO'

reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.put('av_parte', (select id from public.save_work_report(
  null, null, 'montaje', public.today_madrid(),
  'Desmontado el eje y cambiado el rodamiento.', 3.5, false, true,
  test.id('av_aviso'))));

select test.ok('av_parte', 'Juan rellena un parte desde su aviso',
  (select ficha_id = test.id('av_aviso') and worker_id = test.id('juan')
     from public.work_reports where id = test.id('av_parte')));

select test.ok('av_parte', 'Con su tipo de trabajo, sus horas reales y su descripción',
  (select work_type = 'montaje' and hours = 3.5 and status = 'enviado'
      and work_done like 'Desmontado el eje%'
     from public.work_reports where id = test.id('av_parte')));

select test.ok('av_parte', 'Y sin proyecto, porque el trabajo es de un aviso',
  (select project_id is null from public.work_reports where id = test.id('av_parte')));

-- Las evidencias cuelgan del parte, igual que en un proyecto.
insert into public.documents (report_id, storage_path, file_name, mime_type, size_bytes,
                              category, scope, uploaded_by)
values (test.id('av_parte'), 'reports/' || test.id('av_parte') || '/persiana.jpg',
        'persiana.jpg', 'image/jpeg', 3000, 'foto', 'tecnica', test.id('juan'));

select test.ok('av_parte', 'Y puede subirle una fotografía al parte del aviso',
  exists (select 1 from public.documents where report_id = test.id('av_parte')));

select test.err('av_parte', 'No puede rellenar un parte de un aviso que no es suyo',
  format($$select public.save_work_report(null, null, 'montaje', null, 'Nada', 1,
                                          false, false, %L)$$, test.id('av_otro')), '42501');

select test.err('av_parte', 'Ni de un aviso que no existe',
  format($$select public.save_work_report(null, null, 'montaje', null, 'Nada', 1,
                                          false, false, %L)$$,
         '00000000-0000-0000-0000-000000000009'), 'P0002');

select test.err('av_parte', 'Un parte es de un proyecto o de un aviso, no de los dos',
  format($$select public.save_work_report(null, %L, 'montaje', null, 'Nada', 1,
                                          false, false, %L)$$,
         test.id('av_proy'), test.id('av_aviso')), '22023');

select test.err('av_parte', 'Y un trabajador no escribe en la tabla de equipos a pelo',
  format($$insert into public.ficha_workers (ficha_id, worker_id)
           values (%L, %L)$$, test.id('av_aviso'), test.id('pedro')), '42501');

select test.err('av_parte', 'Ni reparte avisos llamando a la función de administración',
  format($$select public.assign_ficha_workers(%L, array[%L]::uuid[])$$,
         test.id('av_aviso'), test.id('juan')), '42501');


\echo '== AVISOS · GUARDAR UN PARTE NO TOCA LAS HORAS PRESUPUESTADAS'

-- Es la regla de negocio: las horas presupuestadas las pone
-- administración y las horas reales salen de los partes. Ni se mezclan
-- ni las unas sobrescriben a las otras.
reset role; select test.as_server();
select test.setnote('av_previstas', (select (previstas_fab + previstas_mont)::text
                                       from public.project_hours
                                      where project_id = test.id('av_proy')));

reset role; set role authenticated; select test.as_user(test.id('juan'));
select public.save_work_report(null, test.id('av_proy'), 'fabricacion',
  public.today_madrid(), 'Horas reales que no tocan el presupuesto.', 2, false, true);

reset role; select test.as_server();
select test.ok('av_horas', 'Registrar horas reales NO cambia las presupuestadas',
  (select (previstas_fab + previstas_mont)::text = test.note('av_previstas')
     from public.project_hours where project_id = test.id('av_proy')));


\echo '== VISITAS · SOLO ADMINISTRACIÓN'

reset role; set role authenticated; select test.as_user(test.id('salvi'));

-- Por los CUATRO caminos por los que se podría colar.
select test.err('av_visita', 'Una visita no se asigna a un trabajador normal',
  format($$update public.fichas set assigned_to = %L where id = %L$$,
         test.id('juan'), test.id('av_visita')), '22023');

select test.err('av_visita', 'Ni naciendo ya asignada a un trabajador',
  format($$insert into public.fichas (type, client_id, title, assigned_to)
           values ('visita', %L, 'Visita colada', %L)$$,
         test.id('cli_laura'), test.id('juan')), '22023');

select test.err('av_visita', 'Ni por la función de equipos, que es solo para avisos',
  format($$select public.assign_ficha_workers(%L, array[%L]::uuid[])$$,
         test.id('av_visita'), test.id('juan')), '22023');

select test.ok('av_visita', 'Y la visita se queda sin asignar, no a medias',
  (select assigned_to is null and status = 'por_asignar'
     from public.fichas where id = test.id('av_visita')));

-- Lo que SÍ se puede: dársela a administración.
update public.fichas set assigned_to = test.id('salvi') where id = test.id('av_visita');
select test.ok('av_visita', 'A administración sí se le asigna, y pasa a «Asignada»',
  (select assigned_to = test.id('salvi') and status = 'asignada'
     from public.fichas where id = test.id('av_visita')));

-- Y una visita ya asignada se sigue pudiendo guardar: la regla mira SOLO
-- la asignación, no el resto de los campos.
update public.fichas set description = 'Llevar el metro largo.'
 where id = test.id('av_visita');
select test.ok('av_visita', 'Una visita ya asignada se sigue pudiendo editar',
  (select description = 'Llevar el metro largo.'
     from public.fichas where id = test.id('av_visita')));

select test.err('av_visita', 'Pero no se le puede cambiar el responsable a un trabajador',
  format($$update public.fichas set assigned_to = %L where id = %L$$,
         test.id('juan'), test.id('av_visita')), '22023');

reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.ok('av_visita', 'Un trabajador no ve ninguna visita en su listado',
  not exists (select 1 from public.worker_fichas where type = 'visita'));

select test.ok('av_visita', 'Ni le deja entrar la función de acceso',
  not public.worker_has_ficha(test.id('av_visita')));


\echo '== VISITAS · LAS QUE YA ESTUVIERAN ASIGNADAS NO SE TOCAN'

-- Si en producción hubiera una visita asignada a un trabajador, la regla
-- NO la cambia ni la borra. Se comprueba de verdad: se cuela una por el
-- mismo portillo que usa la restauración de una copia de seguridad, que
-- es el único sitio donde el disparador se aparta.
reset role; select test.as_server();
select set_config('app.restoring', 'on', false);
with v as (insert into public.fichas (type, client_id, title, assigned_to, status)
           values ('visita', test.id('cli_laura'), 'Visita antigua de Juan',
                   test.id('juan'), 'asignada') returning id)
select test.put('av_vieja', (select id from v));
select set_config('app.restoring', '', false);

select test.ok('av_vieja', 'Una visita que ya estaba asignada sigue asignada',
  (select assigned_to = test.id('juan') and status = 'asignada'
     from public.fichas where id = test.id('av_vieja')));

set role authenticated; select test.as_user(test.id('juan'));
select test.ok('av_vieja', 'Y su trabajador la sigue viendo: no se le cierra la puerta',
  public.worker_has_ficha(test.id('av_vieja')));

reset role; set role authenticated; select test.as_user(test.id('salvi'));
update public.fichas set description = 'Se mantiene tal cual.'
 where id = test.id('av_vieja');
select test.ok('av_vieja', 'Administración la puede seguir guardando sin reasignarla',
  (select description = 'Se mantiene tal cual.' and assigned_to = test.id('juan')
     from public.fichas where id = test.id('av_vieja')));


\echo '== AVISOS · EL EQUIPO DE UN AVISO, QUIÉN LO VE'

reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.ok('av_ver', 'Juan ve con quién comparte su aviso',
  (select count(*) >= 2 from public.ficha_team where ficha_id = test.id('av_aviso')));

select test.ok('av_ver', 'Con el nombre y el rol, sin teléfono ni correo',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'ficha_team'
                 and column_name in ('phone', 'email', 'username')));

select test.ok('av_ver', 'Pero no ve el equipo de un aviso en el que no está',
  not exists (select 1 from public.ficha_team where ficha_id = test.id('av_otro')));

-- Y lo mismo preguntando a la TABLA, no a la vista. Esto es lo que
-- importa de verdad: la vista filtra, pero si alguien se salta la vista y
-- consulta «ficha_workers» a pelo, la política de la tabla tiene que
-- pararlo igual. Sin esta comprobación, abrir la política de par en par
-- no lo notaría nadie (lo dijo el banco de mutaciones).
select test.ok('av_ver', 'Y preguntando a la tabla a pelo, tampoco',
  not exists (select 1 from public.ficha_workers where ficha_id = test.id('av_otro')));

select test.ok('av_ver', 'De la tabla solo le llegan las filas de sus avisos',
  (select bool_and(ficha_id = test.id('av_aviso')) from public.ficha_workers));

reset role; select test.as_server();

\echo '== AVISOS · UN PARTE DE UN AVISO NO SE ASIGNA A UN PROYECTO'

-- Administración puede coger un parte suelto y ponerle proyecto. Un parte
-- de un aviso NO es suelto: ya tiene dueño, y ponerle además un proyecto
-- lo dejaría colgando de dos sitios y sus horas se podrían contar dos
-- veces. Tiene que negarse, y con un mensaje que se entienda.
reset role; set role authenticated; select test.as_user(test.id('salvi'));

select test.err('av_parte', 'Un parte de un aviso no se puede asignar a un proyecto',
  format($$select public.assign_report_to_project(%L, %L)$$,
         test.id('av_parte'), test.id('av_proy')), '22023');

select test.ok('av_parte', 'Y el parte se queda en su aviso, sin tocar',
  (select ficha_id = test.id('av_aviso') and project_id is null
     from public.work_reports where id = test.id('av_parte')));

-- Y un parte SUELTO se sigue pudiendo asignar, que es lo que no hay que romper.
reset role; set role authenticated; select test.as_user(test.id('juan'));
select test.put('av_suelto', (select id from public.save_work_report(
  null, null, 'fabricacion', public.today_madrid(), 'Faena suelta de taller.',
  2, false, true)));

reset role; set role authenticated; select test.as_user(test.id('salvi'));
select public.assign_report_to_project(test.id('av_suelto'), test.id('av_proy'));
select test.ok('av_parte', 'Un parte suelto sí se asigna a un proyecto, como siempre',
  (select project_id = test.id('av_proy') and ficha_id is null
     from public.work_reports where id = test.id('av_suelto')));

reset role; select test.as_server();
