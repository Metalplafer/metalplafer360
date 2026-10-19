-- =====================================================================
-- METALPLAFER360 · IMPORTAR LOS CLIENTES DE HOLDED
--
-- Lo que importa aquí:
--   · que el informe previo NO cambie ni una fila;
--   · que detecte los repetidos por CIF aunque esté escrito de otra
--     manera (B-6123... / b6123...), que es como llegan de verdad;
--   · que detecte los repetidos por NOMBRE cuando no hay CIF, aunque
--     lleve «S.L.», acentos o comas;
--   · que detecte dos líneas repetidas DENTRO del propio CSV;
--   · que avise de los parecidos sin dar por hecho que son el mismo;
--   · que NO sobrescriba ningún cliente que ya exista;
--   · que ejecutarlo DOS VECES no duplique nada;
--   · que no se cree nada sin nombre.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== HOLDED · PREPARACIÓN'

reset role; select test.as_server();

-- Dos clientes que YA están en METALPLAFER360, con datos puestos a mano
-- que no se deben pisar.
insert into public.clients (name, tax_id, kind, phone, city)
values ('Talleres Ribera SL', 'B-99887766', 'empresa', '937 000 111', 'Terrassa');
select test.put('hl_ribera', (select id from public.clients where tax_id = 'B-99887766'));

insert into public.clients (name, kind, phone)
values ('Construccions Moles i Fills, S.L.', 'empresa', '937 000 222');
select test.put('hl_moles',
  (select id from public.clients where name = 'Construccions Moles i Fills, S.L.'));

select test.setnote('hl_antes', (select count(*)::text from public.clients));
select test.setnote('hl_tel_ribera',
  (select phone from public.clients where id = test.id('hl_ribera')));

-- LA EXPORTACIÓN. Cada línea está puesta para provocar un caso distinto.
insert into public.holded_import (name, tax_id, phone, email, address, city, postal_code, kind, notes)
values
  -- 1 · nueva, completa y con CIF de empresa
  ('Metalls del Vallès SA', 'A08123456', '937 111 222', 'info@metallsvalles.cat',
   'Polígon Can Roqueta, 14', 'Sabadell', '08202', 'empresa', 'Cliente histórico'),
  -- 2 · nueva, particular, sin casi nada
  ('Rosa Martí Pons', '46123456Z', null, null, null, null, null, null, null),
  -- 3 · YA ESTÁ, y el CIF viene escrito de otra manera
  ('Talleres Ribera, S.L.', 'b 99887766', '600 999 888', 'otro@correo.cat',
   'Otra dirección', 'Otra ciudad', '08224', 'empresa', 'Datos distintos de Holded'),
  -- 4 · YA ESTÁ por nombre, sin CIF, y escrito de otra manera
  ('CONSTRUCCIONS MOLES I FILLS SL', null, '600 111 000', null, null, null, null, null, null),
  -- 5 y 6 · la misma empresa dos veces en el propio CSV
  ('Fusteria Camps i Germans SL', 'B12345670', '937 222 333', null, null, 'Sabadell', null, null, null),
  ('Fusteria Camps i Germans, S.L.', 'b-1234 5670', '937 222 334', null, null, null, null, null, null),
  -- 7 · sin nombre: no se puede crear
  (null, 'B55555555', '937 333 444', null, null, null, null, null, null),
  (' ', 'B66666666', null, null, null, null, null, null, null),
  -- 8 · se PARECE a «Talleres Ribera SL» pero no es: tiene su propio CIF
  ('Talleres Ribera Hermanos SL', 'B77665544', '937 444 555', null, null, 'Terrassa', null, null, null),
  -- 9 · sin CIF y con nombre que no está: se crea, pero se avisa
  ('Serralleria El Pont', null, null, null, null, null, null, null, null),
  -- 10 · el tipo lo dice el CIF, porque el CSV no lo trae
  ('Jordi Soler Mas', '39876543X', '600 222 333', null, null, 'Sabadell', null, null, null);


\echo '== HOLDED · EL VEREDICTO DE CADA LÍNEA'

select test.ok('hl_plan', 'Una empresa nueva con CIF se va a crear',
  (select veredicto = 'crear' and kind = 'empresa'
     from public.holded_plan where name = 'Metalls del Vallès SA'));

select test.ok('hl_plan', 'Y se queda con su teléfono, su correo y su población',
  (select phone = '937 111 222' and email = 'info@metallsvalles.cat' and city = 'Sabadell'
     from public.holded_plan where name = 'Metalls del Vallès SA'));

select test.ok('hl_plan', 'Un CIF que empieza por número es de un particular',
  (select kind = 'particular' and kind_supuesto
     from public.holded_plan where name = 'Rosa Martí Pons'));

select test.ok('hl_plan', 'Y uno que empieza por letra, de una empresa',
  (select kind = 'empresa' from public.holded_plan where name = 'Jordi Soler Mas') is not true
  and (select kind = 'particular' from public.holded_plan where name = 'Jordi Soler Mas'));

-- EL CASO QUE DE VERDAD IMPORTA: el mismo CIF escrito de otra manera.
select test.ok('hl_plan', 'Un CIF ya existente se detecta aunque venga con espacios y minúsculas',
  (select veredicto = 'ya_existe_por_cif' and choca_cif = test.id('hl_ribera')
     from public.holded_plan where name = 'Talleres Ribera, S.L.'));

select test.ok('hl_plan', 'Un nombre ya existente se detecta aunque cambien las comas y «S.L.»',
  (select veredicto = 'ya_existe_por_nombre' and choca_nombre = test.id('hl_moles')
     from public.holded_plan where name = 'CONSTRUCCIONS MOLES I FILLS SL'));

select test.ok('hl_plan', 'De dos líneas repetidas en el CSV se queda una',
  (select count(*) = 1 from public.holded_plan
    where name_norm = 'fusteria camps i germans sl' and veredicto = 'crear')
  and (select count(*) = 1 from public.holded_plan
        where name_norm = 'fusteria camps i germans sl' and veredicto = 'repetida_en_csv'));

select test.ok('hl_plan', 'Y la repetida apunta a la línea que la repite',
  (select repetida_en_csv is not null from public.holded_plan
    where veredicto = 'repetida_en_csv'));

select test.ok('hl_plan', 'Sin nombre no se crea nada, ni con el nombre en blanco',
  (select count(*) = 2 from public.holded_plan where veredicto = 'sin_nombre'));

select test.ok('hl_plan', 'Uno que se parece pero tiene su propio CIF SÍ se crea',
  (select veredicto = 'crear' from public.holded_plan
    where name = 'Talleres Ribera Hermanos SL'));

select test.ok('hl_plan', 'Uno sin CIF y con nombre nuevo se crea, marcado como tal',
  (select veredicto = 'crear_sin_cif' and incompleto like '%sin CIF%'
     from public.holded_plan where name = 'Serralleria El Pont'));

select test.ok('hl_plan', 'Y se dice qué le falta a cada uno, sin impedir crearlo',
  (select incompleto like '%sin teléfono%' and incompleto like '%sin correo%'
     from public.holded_plan where name = 'Rosa Martí Pons'));


\echo '== HOLDED · EL INFORME NO CAMBIA NADA'

select test.setnote('hl_informe', (
  select count(*)::text from public.holded_simulate()));

select test.ok('hl_informe', 'El informe dice algo',
  test.note('hl_informe')::int > 10, test.note('hl_informe'));

select test.ok('hl_informe', 'Y NO ha creado ni un cliente: solo informa',
  (select count(*)::text from public.clients) = test.note('hl_antes'),
  (select count(*)::text from public.clients) || ' vs ' || test.note('hl_antes'));

-- Cinco con CIF: Metalls, Rosa, Fusteria, Ribera Hermanos y Jordi. De
-- las once líneas, una repite a otra del propio CSV, dos ya están y dos
-- no tienen nombre.
select test.ok('hl_informe', 'Dice cuántos se van a crear',
  (select cuantas = 5 from public.holded_simulate()
    where bloque = 'RESUMEN' and detalle like 'Se van a CREAR (con CIF)%'));

select test.ok('hl_informe', 'Y cuántos sin CIF, que son los de repasar',
  (select cuantas = 1 from public.holded_simulate()
    where bloque = 'RESUMEN' and detalle like 'Se van a CREAR (sin CIF%'));

select test.ok('hl_informe', 'Avisa de los que ya están por CIF, con el nombre del de aquí',
  exists (select 1 from public.holded_simulate()
           where bloque = 'YA EXISTE POR CIF' and detalle like '%Talleres Ribera%'));

select test.ok('hl_informe', 'Y de los parecidos, diciendo que se van a crear de todas formas',
  exists (select 1 from public.holded_simulate()
           where bloque = 'DUDOSO · SE PARECE A UNO QUE YA ESTÁ'
             and detalle like '%Talleres Ribera Hermanos%'));

select test.ok('hl_informe', 'Avisa de que uno no tiene CIF, y de los dos sin nombre',
  exists (select 1 from public.holded_simulate()
           where bloque = 'DUDOSO · DATOS INCOMPLETOS' and detalle like '%El Pont%')
  and (select count(*) = 2 from public.holded_simulate() where bloque = 'SIN NOMBRE'));


\echo '== HOLDED · LA IMPORTACIÓN'

select test.setnote('hl_creados', (
  select cuantos::text from public.holded_import_run() where resultado = 'Clientes creados'));

select test.ok('hl_import', 'Crea los 6 que había anunciado: 5 con CIF y 1 sin él',
  test.note('hl_creados') = '6', test.note('hl_creados'));

select test.ok('hl_import', 'Y el total de clientes sube exactamente en 6',
  (select count(*) from public.clients) = test.note('hl_antes')::int + 6,
  (select count(*)::text from public.clients));

select test.ok('hl_import', 'El cliente nuevo queda con todos sus datos',
  (select tax_id = 'A08123456' and phone = '937 111 222' and city = 'Sabadell'
      and kind = 'empresa' and not is_demo and archived_at is null
     from public.clients where name = 'Metalls del Vallès SA'));

select test.ok('hl_import', 'Y queda dicho de dónde salió',
  (select notes like '%Importado de Holded.%'
     from public.clients where name = 'Metalls del Vallès SA'));

select test.ok('hl_import', 'Y conserva lo que ya traía en las notas',
  (select notes like '%Cliente histórico%'
     from public.clients where name = 'Metalls del Vallès SA'));

-- LO QUE NO HA TOCADO.
select test.ok('hl_import', 'NO ha pisado el teléfono del cliente que ya estaba',
  (select phone from public.clients where id = test.id('hl_ribera'))
    = test.note('hl_tel_ribera'),
  (select phone from public.clients where id = test.id('hl_ribera')));

select test.ok('hl_import', 'Ni le ha cambiado el nombre ni la población',
  (select name = 'Talleres Ribera SL' and city = 'Terrassa'
     from public.clients where id = test.id('hl_ribera')));

select test.ok('hl_import', 'Ni ha duplicado el que ya estaba por nombre',
  (select count(*) = 1 from public.clients
    where public.norm_client_name(name) = 'construccions moles i fills sl'));

select test.ok('hl_import', 'De la empresa repetida en el CSV hay UNA, no dos',
  (select count(*) = 1 from public.clients
    where public.norm_client_name(name) = 'fusteria camps i germans sl'));

select test.ok('hl_import', 'No se ha creado nada sin nombre',
  (select count(*) = 0 from public.clients
    where tax_id in ('B55555555', 'B66666666')));

-- El recuento tiene que ser el de ANTES de importar: uno saltado por CIF
-- y uno por nombre. Si se contara después, los recién creados se
-- contarían como «ya existentes» y el historial diría una cosa falsa.
select test.ok('hl_import', 'Queda UNA anotación en el historial, con el recuento de ANTES',
  exists (select 1 from public.audit_log
           where action = 'importar_clientes' and entity_type = 'clients'
             and summary like '%6 creados%'
             and (details ->> 'creados')::int = 6
             and (details ->> 'creados_previstos')::int = 6
             and (details ->> 'lineas')::int = 11
             and (details ->> 'saltados_por_cif')::int = 1
             and (details ->> 'saltados_por_nombre')::int = 1
             and (details ->> 'repetidos_en_csv')::int = 1
             and (details ->> 'sin_nombre')::int = 2));

-- UNA anotación, no una por cliente. Se mira por los NOMBRES de los
-- importados, no por la hora: la batería entera corre en el mismo
-- segundo y otros archivos también crean clientes.
select test.ok('hl_import', 'Y no una por cliente: su historial se ha silenciado',
  (select count(*) = 0 from public.audit_log
    where action = 'insert' and entity_type = 'clients'
      and (summary like '%Metalls del Vallès%'
        or summary like '%Serralleria El Pont%'
        or summary like '%Jordi Soler Mas%')));


\echo '== HOLDED · EJECUTARLO DOS VECES NO DUPLICA NADA'

select test.setnote('hl_otra', (
  select cuantos::text from public.holded_import_run() where resultado = 'Clientes creados'));

select test.ok('hl_doble', 'La segunda pasada no crea NI UNO',
  test.note('hl_otra') = '0', test.note('hl_otra'));

select test.ok('hl_doble', 'Y el total de clientes no se mueve',
  (select count(*) from public.clients) = test.note('hl_antes')::int + 6,
  (select count(*)::text from public.clients));

select test.ok('hl_doble', 'Ahora el informe dice que todos esos ya están',
  (select cuantas = 0 from public.holded_simulate()
    where bloque = 'RESUMEN' and detalle like 'Se van a CREAR (con CIF)%'));


\echo '== HOLDED · NADIE MÁS QUE EL SERVIDOR TOCA ESTO'

set role authenticated; select test.as_user(test.id('salvi'));

select test.err('hl_permisos', 'Ni administración lee la tabla de paso desde la aplicación',
  $$select count(*) from public.holded_import$$, '42501');

select test.err('hl_permisos', 'Ni ejecuta el informe',
  $$select count(*) from public.holded_simulate()$$, '42501');

select test.err('hl_permisos', 'Ni la importación',
  $$select count(*) from public.holded_import_run()$$, '42501');

reset role; select test.as_user(test.id('juan'));
set role authenticated;

select test.err('hl_permisos', 'Y un trabajador, menos todavía',
  $$select count(*) from public.holded_import$$, '42501');

-- Se retira la tabla de paso, que es lo que dice el procedimiento: esto
-- no se queda en la aplicación.
reset role; select test.as_server();
drop view if exists public.holded_plan;
drop table if exists public.holded_import;

select test.ok('hl_permisos', 'Al terminar, la tabla de paso se puede retirar sin dejar rastro',
  not exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = 'holded_import')
  and not exists (select 1 from information_schema.views
                   where table_schema = 'public' and table_name = 'holded_plan'));

select test.ok('hl_permisos', 'Y los clientes importados siguen ahí',
  (select count(*) = 6 from public.clients where notes like '%Importado de Holded.%'));
