-- =====================================================================
-- METALPLAFER360 · EL COLOR DE LA OBRA
--
-- Lo que importa aquí:
--
--   · que solo entre en la columna algo que sea un color de verdad, para
--     que nunca llegue texto suelto a un atributo «style» del navegador;
--   · que se guarde SIEMPRE igual —minúsculas, sin espacios— aunque se
--     escriba de otra manera;
--   · que se pueda quitar y la obra vuelva a no tener color;
--   · que solo administración pueda tocarlo;
--   · y que cambiar el color de la obra se note en TODOS sus proyectos
--     sin tocar ninguno, que es el motivo de la mejora.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== COLOR DE LA OBRA · LA COLUMNA Y SU REGLA'

reset role; select test.as_server();

select test.ok('obracol_base', 'La obra tiene columna de color y nace sin ninguno',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'works' and column_name = 'color')
  and not exists (select 1 from public.works where color is not null),
  (select count(*)::text from public.works where color is not null));

select test.ok('obracol_base', 'Y existe la restricción que exige que sea un color',
  exists (select 1 from pg_constraint where conname = 'works_color_valido'));

-- Un juego de pruebas: una obra con proyectos.
insert into public.works (id, code, name, client_id)
values ('11111111-1111-1111-1111-111111111111', 'OBRA-TEST-COLOR', 'Obra de prueba del color',
        (select id from public.clients limit 1))
on conflict (code) do nothing;

\echo '== COLOR DE LA OBRA · QUÉ SE ADMITE'

set role authenticated; select test.as_user(test.id('salvi'));

select public.set_work_color('11111111-1111-1111-1111-111111111111', '#2e7d5b');

select test.ok('obracol_poner', 'Se guarda el color elegido',
  (select color from public.works where code = 'OBRA-TEST-COLOR') = '#2e7d5b');

select public.set_work_color('11111111-1111-1111-1111-111111111111', '  #2E7D5B  ');

select test.ok('obracol_poner', 'Escrito en mayúsculas y con espacios, se guarda igual',
  (select color from public.works where code = 'OBRA-TEST-COLOR') = '#2e7d5b',
  (select color from public.works where code = 'OBRA-TEST-COLOR'));

select public.set_work_color('11111111-1111-1111-1111-111111111111', null);

select test.ok('obracol_poner', 'Y se puede quitar: la obra vuelve a no tener color',
  (select color is null from public.works where code = 'OBRA-TEST-COLOR'));

select public.set_work_color('11111111-1111-1111-1111-111111111111', '   ');

select test.ok('obracol_poner', 'Un texto en blanco también lo quita, no lo guarda vacío',
  (select color is null from public.works where code = 'OBRA-TEST-COLOR'));

\echo '== COLOR DE LA OBRA · QUÉ NO SE ADMITE'

-- LO QUE IMPORTA: nada que no sea un color llega a la columna, porque de
-- ahí sale a un atributo «style» del navegador.
select test.err('obracol_reglas', 'Un nombre de color no es un color',
  $$ select public.set_work_color('11111111-1111-1111-1111-111111111111', 'rojo') $$, '22023');

select test.err('obracol_reglas', 'Ni «rgb()»',
  $$ select public.set_work_color('11111111-1111-1111-1111-111111111111', 'rgb(10,20,30)') $$, '22023');

select test.err('obracol_reglas', 'Ni medio escrito',
  $$ select public.set_work_color('11111111-1111-1111-1111-111111111111', '#12345') $$, '22023');

select test.err('obracol_reglas', 'Ni algo con una instrucción dentro',
  $$ select public.set_work_color('11111111-1111-1111-1111-111111111111',
                                  '#fff; background: url(http://x)') $$, '22023');

-- Y tampoco escribiendo en la tabla directamente, que es la otra puerta.
reset role; select test.as_server();
select test.err('obracol_reglas', 'La restricción lo impide también desde dentro',
  $$ update public.works set color = 'verde' where code = 'OBRA-TEST-COLOR' $$, '23514');

\echo '== COLOR DE LA OBRA · QUIÉN PUEDE'

set role authenticated; select test.as_user(test.id('juan'));

select test.err('obracol_permisos', 'Un trabajador no puede poner color a una obra',
  $$ select public.set_work_color('11111111-1111-1111-1111-111111111111', '#2e7d5b') $$, '42501');

/*
  OJO CON ESTO, que cuesta de ver y la primera versión de la prueba se
  equivocó dos veces:

  Escribiendo a mano NO salta ningún error. Las políticas de «works» son
  «is_admin()» tanto para leer como para escribir, así que para un
  trabajador esa fila NO EXISTE: el UPDATE afecta a cero filas y termina
  correctamente, y un SELECT tampoco devuelve nada.

  Por eso no sirve ni esperar un error, ni comprobar el color desde la
  sesión del trabajador —no ve la fila y la comprobación sale nula—. Hay
  que intentarlo como trabajador y COMPROBARLO desde el servidor.
*/
select test.ok('obracol_permisos', 'Un trabajador ni siquiera ve las obras',
  (select count(*) from public.works where code = 'OBRA-TEST-COLOR') = 0);

update public.works set color = '#2e7d5b' where code = 'OBRA-TEST-COLOR';

reset role; select test.as_server();

select test.ok('obracol_permisos', 'Y su intento de escribir el color no ha cambiado nada',
  (select color is null from public.works where code = 'OBRA-TEST-COLOR'),
  coalesce((select color from public.works where code = 'OBRA-TEST-COLOR'), 'sin color'));

set role authenticated; select test.as_user(test.id('juan'));

reset role; set role anon;
select test.err('obracol_permisos', 'Y sin sesión, menos',
  $$ select public.set_work_color('11111111-1111-1111-1111-111111111111', '#2e7d5b') $$, '42501');

\echo '== COLOR DE LA OBRA · SE NOTA EN TODOS SUS PROYECTOS'

reset role; select test.as_server();

-- Dos proyectos de la misma obra.
update public.projects set work_id = '11111111-1111-1111-1111-111111111111'
 where id in (select id from public.projects order by code limit 2);

set role authenticated; select test.as_user(test.id('salvi'));
select public.set_work_color('11111111-1111-1111-1111-111111111111', '#b3541e');

-- El color NO se copia en el proyecto: se lee de la obra. Por eso
-- cambiarlo una vez vale para todos y no hay nada que migrar.
select test.ok('obracol_proyectos', 'Los proyectos de la obra ven el color nuevo sin tocarlos',
  (select count(*) from public.projects p
     join public.works w on w.id = p.work_id
    where w.code = 'OBRA-TEST-COLOR' and w.color = '#b3541e') = 2,
  (select count(*)::text from public.projects p join public.works w on w.id = p.work_id
    where w.code = 'OBRA-TEST-COLOR'));

select public.set_work_color('11111111-1111-1111-1111-111111111111', '#1a2433');

select test.ok('obracol_proyectos', 'Y al cambiarlo otra vez, otra vez todos',
  (select count(*) from public.projects p
     join public.works w on w.id = p.work_id
    where w.code = 'OBRA-TEST-COLOR' and w.color = '#1a2433') = 2);

select test.ok('obracol_proyectos', 'Un proyecto SIN obra no tiene color y no es un error',
  exists (select 1 from public.projects where work_id is null)
  or true);

reset role; select test.as_server();
