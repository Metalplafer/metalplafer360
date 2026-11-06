-- =====================================================================
-- METALPLAFER360 · PACK 3 · BUSCADOR, CALENDARIO Y NOTIFICACIONES
--
-- Lo que importa aquí:
--
--   · MEJORA 1 · que el buscador encuentre por código, por nombre
--     parcial y POR EL NOMBRE DEL CLIENTE, que es lo que no podía hacer
--     ningún listado; que no devuelva duplicados; y que un trabajador
--     no saque nada aunque llame a la función directamente;
--   · MEJORA 2 · que planificar escriba en el PROYECTO, que admita
--     periodos de varios días, que la observación se guarde y se borre
--     con las fechas, y que mover un tramo de un proyecto a otro no
--     pueda quedarse a medias;
--   · MEJORA 3 · que el aviso de material retrasado lleve su proyecto,
--     y que borrar el elemento no deje un enlace roto.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== PACK 3 · EL BUSCADOR'

reset role; select test.as_server();

-- Un cliente con nombre reconocible y cosas suyas de los tres tipos.
insert into public.clients (id, kind, name, active)
values ('a9999999-9999-9999-9999-999999999999', 'empresa', 'Comunidad Calle Mayor 25', true)
on conflict (id) do nothing;

insert into public.projects (id, code, client_id, name, phase)
values ('b9999999-9999-9999-9999-999999999999', 'PROY-BUSCA-001',
        'a9999999-9999-9999-9999-999999999999', 'Barandilla de la escalera P3X', 'preparacion')
on conflict (id) do nothing;

insert into public.fichas (id, type, status, client_id, title)
values ('c9999999-9999-9999-9999-999999999999', 'presupuesto', 'pendiente',
        'a9999999-9999-9999-9999-999999999999', 'Presupuesto de la barandilla'),
       ('c8888888-8888-8888-8888-888888888888', 'aviso', 'pendiente',
        'a9999999-9999-9999-9999-999999999999', 'La puerta no cierra')
on conflict (id) do nothing;

set role authenticated; select test.as_user(test.id('salvi'));

/*
  LO QUE NINGÚN LISTADO PODÍA HACER: buscar por el nombre del cliente y
  que salgan sus proyectos, sus presupuestos y sus avisos. El nombre no
  está en ninguna de esas tablas, está en «clients».
*/
select test.ok('p3_buscar', 'Buscando el cliente salen sus tres tipos de cosas',
  (select count(distinct tipo) = 3 from public.search_admin('calle mayor')),
  (select coalesce(string_agg(distinct tipo, ', '), '(nada)')
     from public.search_admin('calle mayor')));

select test.ok('p3_buscar', 'Y salen las tres, no una de cada tipo por casualidad',
  (select count(*) >= 3 from public.search_admin('calle mayor')));

/*
  Por parte del nombre del proyecto.

  Se busca un trozo POCO COMÚN del nombre, no «barandilla»: el juego de
  datos de ejemplo tiene quince barandillas y la de esta prueba no
  entraba en las veinte primeras. La prueba falló por eso y no porque
  el buscador no encontrara: cambiarle el límite habría tapado el
  problema en vez de hacerla determinista.
*/
-- Se comprueba por IDENTIFICADOR y no por código: el código se lo pone
-- un disparador al insertar, así que el «PROY-BUSCA-001» de arriba
-- nunca llega a la tabla. Lo descubrió esta misma prueba.
select test.ok('p3_buscar', 'Encuentra por parte del nombre del proyecto',
  exists (select 1 from public.search_admin('escalera p3x')
           where tipo = 'proyecto' and id = 'b9999999-9999-9999-9999-999999999999'),
  (select coalesce(string_agg(code, ', '), '(nada)')
     from public.search_admin('escalera p3x')));

-- Y una palabra corriente devuelve muchas cosas, que es lo normal.
select test.ok('p3_buscar', 'Una palabra corriente devuelve varios resultados',
  (select count(*) > 5 from public.search_admin('barandilla')),
  (select count(*)::text from public.search_admin('barandilla')));

-- Por código exacto, y ese tiene que salir el primero.
-- Por código exacto, cogiendo el que de verdad le tocó.
select test.setnote('p3_code',
  (select code from public.projects where id = 'b9999999-9999-9999-9999-999999999999'));

select test.ok('p3_buscar', 'El código exacto sale el primero de todos',
  (select code from public.search_admin(test.note('p3_code')) limit 1) = test.note('p3_code'),
  (select coalesce(string_agg(code, ' | '), '(nada)')
     from public.search_admin(test.note('p3_code'))));

-- LO QUE IMPORTA: sin duplicados. Este proyecto encaja por nombre Y por
-- cliente a la vez; tiene que salir UNA vez.
select test.ok('p3_buscar', 'Un proyecto que encaja por dos motivos sale UNA vez',
  (select count(*) = 1 from public.search_admin('escalera p3x')
    where tipo = 'proyecto' and id = 'b9999999-9999-9999-9999-999999999999'),
  (select count(*)::text from public.search_admin('escalera p3x')
    where id = 'b9999999-9999-9999-9999-999999999999'));

select test.ok('p3_buscar', 'Sin coincidencias devuelve vacío, no un error',
  (select count(*) = 0 from public.search_admin('zzzqwertynoexiste')));

select test.ok('p3_buscar', 'Con una sola letra no busca: devolvería media base de datos',
  (select count(*) = 0 from public.search_admin('a')));

-- Lo archivado no sale: se busca para trabajar.
reset role; select test.as_server();
update public.fichas set archived_at = now()
 where id = 'c8888888-8888-8888-8888-888888888888';
set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('p3_buscar', 'Lo archivado no aparece',
  not exists (select 1 from public.search_admin('calle mayor')
               where id = 'c8888888-8888-8888-8888-888888888888'));

reset role; select test.as_server();
update public.fichas set archived_at = null
 where id = 'c8888888-8888-8888-8888-888888888888';

\echo '== PACK 3 · EL BUSCADOR ES SOLO DE ADMINISTRACIÓN'

/*
  Y SE COMPRUEBA LLAMANDO A LA FUNCIÓN, no mirando la pantalla.
  Esconder la caja de búsqueda no protege nada: lo que protege es que
  la función se niegue.
*/
set role authenticated; select test.as_user(test.id('juan'));

select test.err('p3_permisos', 'Un trabajador no puede usar el buscador',
  $$ select * from public.search_admin('calle mayor') $$, '42501');

reset role; set role anon;
select test.err('p3_permisos', 'Y sin sesión, menos',
  $$ select * from public.search_admin('calle mayor') $$, '42501');

\echo '== PACK 3 · PLANIFICAR DESDE EL CALENDARIO'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

-- LO QUE IMPORTA: esto NO crea un evento. Escribe en el proyecto.
select public.set_phase_dates('b9999999-9999-9999-9999-999999999999', 'fabricacion',
  date '2027-01-11', date '2027-01-14', 'Llevar la plantilla nueva');

select test.ok('p3_plan', 'Planificar escribe el periodo EN EL PROYECTO',
  (select fab_start = date '2027-01-11' and fab_end = date '2027-01-14'
     from public.projects where id = 'b9999999-9999-9999-9999-999999999999'),
  (select fab_start::text || ' → ' || fab_end::text
     from public.projects where id = 'b9999999-9999-9999-9999-999999999999'));

select test.ok('p3_plan', 'Y queda marcado como puesto a mano, para que el cálculo no lo pise',
  (select fab_manual from public.projects
    where id = 'b9999999-9999-9999-9999-999999999999'));

select test.ok('p3_plan', 'La observación del tramo se guarda',
  (select fab_note from public.projects
    where id = 'b9999999-9999-9999-9999-999999999999') = 'Llevar la plantilla nueva');

-- Y no se ha mezclado con las observaciones del proyecto entero.
select test.ok('p3_plan', 'Sin mezclarse con las observaciones del proyecto',
  (select observations is null from public.projects
    where id = 'b9999999-9999-9999-9999-999999999999'));

-- EL PERIODO SALE EN TODOS SUS DÍAS, que es lo que se pidió ver.
select test.ok('p3_plan', 'El calendario lo pinta en los CUATRO días del periodo',
  (select count(*) = 4 from public.v_calendar
    where id = 'b9999999-9999-9999-9999-999999999999' and kind = 'fabricacion'),
  (select count(*)::text from public.v_calendar
    where id = 'b9999999-9999-9999-9999-999999999999' and kind = 'fabricacion'));

-- El montaje es otro tramo y no se pisa con la fabricación.
select public.set_phase_dates('b9999999-9999-9999-9999-999999999999', 'montaje',
  date '2027-01-18', date '2027-01-19', 'Avisar al portero');

select test.ok('p3_plan', 'Fabricación y montaje conviven, cada uno con su nota',
  (select fab_note = 'Llevar la plantilla nueva' and mont_note = 'Avisar al portero'
     from public.projects where id = 'b9999999-9999-9999-9999-999999999999'));

select test.err('p3_plan', 'El final no puede ir antes del inicio',
  $$ select public.set_phase_dates('b9999999-9999-9999-9999-999999999999', 'fabricacion',
       date '2027-02-10', date '2027-02-01') $$, '22023');

\echo '== PACK 3 · MOVER UN TRAMO DE UN PROYECTO A OTRO'

reset role; select test.as_server();
insert into public.projects (id, code, client_id, name, phase)
values ('b8888888-8888-8888-8888-888888888888', 'PROY-BUSCA-002',
        'a9999999-9999-9999-9999-999999999999', 'Puerta de Barcelona', 'preparacion')
on conflict (id) do nothing;
set role authenticated; select test.as_user(test.id('salvi'));

select public.move_phase_dates('b9999999-9999-9999-9999-999999999999',
  'b8888888-8888-8888-8888-888888888888', 'fabricacion',
  date '2027-01-11', date '2027-01-14', 'Llevar la plantilla nueva');

select test.ok('p3_mover', 'El tramo llega al proyecto de destino',
  (select fab_start = date '2027-01-11' and fab_note = 'Llevar la plantilla nueva'
     from public.projects where id = 'b8888888-8888-8888-8888-888888888888'));

-- LO QUE IMPORTA: y se ha ido del de origen. En una sola operación.
select test.ok('p3_mover', 'Y se ha ido del de origen, sin quedarse en los dos',
  (select fab_start is null and fab_note is null and not fab_manual
     from public.projects where id = 'b9999999-9999-9999-9999-999999999999'),
  (select coalesce(fab_start::text, 'sin fecha')
     from public.projects where id = 'b9999999-9999-9999-9999-999999999999'));

select test.ok('p3_mover', 'El montaje del de origen no se ha tocado',
  (select mont_start = date '2027-01-18' from public.projects
    where id = 'b9999999-9999-9999-9999-999999999999'));

select test.err('p3_mover', 'No se mueve a un proyecto que no existe',
  $$ select public.move_phase_dates('b8888888-8888-8888-8888-888888888888',
       'b7777777-7777-7777-7777-777777777777', 'fabricacion', date '2027-03-01') $$, 'P0002');

select test.ok('p3_mover', 'Y el intento fallido no ha movido nada',
  (select fab_start = date '2027-01-11' from public.projects
    where id = 'b8888888-8888-8888-8888-888888888888'));

-- Quitar las fechas se lleva la nota del tramo: una observación sobre un
-- montaje que ya no está planificado no le sirve a nadie.
select public.set_phase_dates('b9999999-9999-9999-9999-999999999999', 'montaje', null, null);

select test.ok('p3_plan', 'Quitar las fechas borra la observación del tramo',
  (select mont_start is null and mont_note is null from public.projects
    where id = 'b9999999-9999-9999-9999-999999999999'));

\echo '== PACK 3 · PLANIFICAR ES DE ADMINISTRACIÓN'

set role authenticated; select test.as_user(test.id('juan'));

select test.err('p3_permisos', 'Un trabajador no planifica fabricación',
  $$ select public.set_phase_dates('b9999999-9999-9999-9999-999999999999', 'fabricacion',
       date '2027-05-03') $$, '42501');

select test.err('p3_permisos', 'Ni mueve tramos de un proyecto a otro',
  $$ select public.move_phase_dates('b8888888-8888-8888-8888-888888888888',
       'b9999999-9999-9999-9999-999999999999', 'fabricacion', date '2027-05-03') $$, '42501');

reset role; select test.as_server();
select test.ok('p3_permisos', 'Y después de intentarlo, nada se ha movido',
  (select fab_start = date '2027-01-11' from public.projects
    where id = 'b8888888-8888-8888-8888-888888888888'));

\echo '== PACK 3 · LAS NOTIFICACIONES SABEN A DÓNDE LLEVAN'

select test.ok('p3_avisos', 'Una notificación puede apuntar a una ficha y a un proyecto',
  (select count(*) = 2 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications'
      and column_name in ('ficha_id', 'project_id')));

-- Toda clave ajena con su índice, que es regla de la casa.
select test.ok('p3_avisos', 'Y las dos claves ajenas tienen su índice',
  (select count(*) = 2 from pg_indexes
    where tablename = 'notifications'
      and indexname in ('notifications_ficha_idx', 'notifications_project_idx')));

/*
  EL AVISO DE MATERIAL RETRASADO YA LLEVA SU PROYECTO.

  Nombraba el proyecto en el texto pero no lo enlazaba. Se comprueba
  sobre un material de verdad, llamando a la función que los crea.
*/
reset role; select test.as_server();

insert into public.materials (id, project_id, name, expected_on, received, is_demo)
values ('d9999999-9999-9999-9999-999999999999', 'b9999999-9999-9999-9999-999999999999',
        'Perfil de 40x40', public.today_madrid() - 3, false, false)
on conflict (id) do nothing;

set role authenticated; select test.as_user(test.id('salvi'));
select public.notify_late_materials();

select test.ok('p3_avisos', 'El aviso de material retrasado lleva su proyecto',
  exists (select 1 from public.notifications
           where kind = 'material_retrasado'
             and project_id = 'b9999999-9999-9999-9999-999999999999'),
  (select coalesce(string_agg(coalesce(project_id::text, 'sin proyecto'), ', '), '(ningún aviso)')
     from public.notifications where kind = 'material_retrasado'));

select test.ok('p3_avisos', 'Y sigue diciendo lo mismo que decía',
  exists (select 1 from public.notifications
           where kind = 'material_retrasado' and body like '%Perfil de 40x40%'));

/*
  Y SI EL ELEMENTO SE BORRA, NO QUEDA UN ENLACE ROTO.

  Es el requisito de «si ya no existe, no provocar errores». No hace
  falta comprobarlo a mano en la pantalla: la clave ajena se lleva la
  notificación con su elemento.
*/
select test.setnote('p3_avisos_antes',
  (select count(*)::text from public.notifications
    where project_id = 'b9999999-9999-9999-9999-999999999999'));

reset role; select test.as_server();
delete from public.materials where id = 'd9999999-9999-9999-9999-999999999999';
delete from public.projects where id = 'b9999999-9999-9999-9999-999999999999';

select test.ok('p3_avisos', 'Al borrar el proyecto, su aviso se va con él: sin enlaces rotos',
  (select count(*) = 0 from public.notifications
    where project_id = 'b9999999-9999-9999-9999-999999999999'),
  'antes había ' || test.note('p3_avisos_antes'));

reset role; select test.as_server();
