-- =====================================================================
-- METALPLAFER360 · PROVEEDORES
--
-- Lo que importa aquí:
--   · que un proveedor no se pueda dar de alta dos veces aunque se
--     escriba con otra puntuación o con acentos;
--   · que NO se borren, se desactiven, y que los materiales que ya les
--     apuntan sigan en pie;
--   · que un material pueda tener varios proveedores habituales y que la
--     lista se mande completa, como en el resto de la aplicación;
--   · que un trabajador NO vea los proveedores, ni por la tabla, ni por
--     la vista, ni por las funciones. Ahí hay teléfonos y condiciones de
--     compra, que es información de administración;
--   · que el material en texto de siempre siga leyéndose igual, porque
--     hay datos reales que solo tienen eso.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== PROVEEDORES · DARLOS DE ALTA SIN DUPLICAR'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

select test.put('pv_aceros',
  (public.save_supplier(null, 'Aceros Vallès, S.L.', '937 11 22 33',
                        'Compras@AcerosValles.com', 'Entrega en 48 h')).id);

select test.ok('pv_alta', 'Se guarda el proveedor con su teléfono',
  (select name = 'Aceros Vallès, S.L.' and phone = '937 11 22 33'
     from public.suppliers where id = test.id('pv_aceros')));

select test.ok('pv_alta', 'El correo se guarda en minúsculas',
  (select email = 'compras@acerosvalles.com'
     from public.suppliers where id = test.id('pv_aceros')),
  (select email from public.suppliers where id = test.id('pv_aceros')));

select test.ok('pv_alta', 'Nace activo',
  (select active from public.suppliers where id = test.id('pv_aceros')));

-- LA COMPROBACIÓN QUE IMPORTA: el mismo proveedor escrito de otra
-- manera no crea un segundo registro.
select test.put('pv_otra_vez',
  (public.save_supplier(null, 'ACEROS VALLES SL')).id);

select test.ok('pv_dup', 'Escrito de otra manera, devuelve el que ya existe',
  test.id('pv_otra_vez') = test.id('pv_aceros'));

select test.ok('pv_dup', 'Y no deja un segundo proveedor en la lista',
  (select count(*) = 1 from public.suppliers
    where name_norm = public.norm_client_name('Aceros Valles SL')),
  (select string_agg(name, ' | ') from public.suppliers
    where name_norm = public.norm_client_name('Aceros Valles SL')));

select test.ok('pv_dup', 'Ni le pisa los datos al que ya estaba',
  (select phone = '937 11 22 33' and notes = 'Entrega en 48 h'
     from public.suppliers where id = test.id('pv_aceros')));

-- Y el índice está de verdad: por debajo de la función tampoco se cuela.
reset role; select test.as_server();
select test.err('pv_dup', 'Ni por debajo de la función: la base de datos lo rechaza',
  $$insert into public.suppliers (name) values ('aceros   valles   s.l.')$$, '23505');
set role authenticated; select test.as_user(test.id('salvi'));

select test.err('pv_alta', 'Sin nombre no se guarda',
  $$select public.save_supplier(null, '   ')$$, '22023');

select test.put('pv_tornillos', (public.save_supplier(null, 'Tornillería del Vallès')).id);
select test.put('pv_pinturas',  (public.save_supplier(null, 'Pinturas Industriales Sabadell')).id);

-- Corregir uno existente sí cambia sus datos.
select public.save_supplier(test.id('pv_tornillos'), 'Tornillería del Vallès', '937 44 55 66');
select test.ok('pv_alta', 'Corregir un proveedor le cambia el teléfono',
  (select phone = '937 44 55 66' from public.suppliers where id = test.id('pv_tornillos')));

-- Pero no se le puede poner el nombre de otro que ya existe.
--
-- Y se comprueba el MENSAJE, no solo el código: si se quitara la
-- comprobación de la función saltaría el índice único, que da el mismo
-- 23505 pero con el texto crudo de PostgreSQL. La persona tiene que
-- leer de QUIÉN es ese nombre. Esto lo encontró el banco de mutaciones.
select test.errlike('pv_dup', 'Y no se le puede poner el nombre de otro proveedor',
  format($$select public.save_supplier(%L, 'Aceros Valles SL')$$, test.id('pv_tornillos')),
  '23505', '%Ya existe otro proveedor que se llama igual%Aceros Vall%');

select test.ok('pv_alta', 'Que falle no le cambia el nombre al proveedor',
  (select name = 'Tornillería del Vallès'
     from public.suppliers where id = test.id('pv_tornillos')));

-- RENOMBRARLO ACTUALIZA SU NOMBRE COMPARABLE.
--
-- Si no se actualizara, el nombre guardado y el comparable dirían cosas
-- distintas, y a partir de ahí se podría dar de alta un duplicado del
-- nombre nuevo sin que el índice se enterara. Es un fallo que no daría
-- ninguna señal hasta que apareciera el duplicado.
select public.save_supplier(test.id('pv_tornillos'), 'Tornillos y Fijaciones Grau, S.L.');

select test.ok('pv_alta', 'Renombrarlo actualiza su nombre comparable',
  (select name_norm = public.norm_client_name('Tornillos y Fijaciones Grau, S.L.')
     from public.suppliers where id = test.id('pv_tornillos')),
  (select name_norm from public.suppliers where id = test.id('pv_tornillos')));

select test.ok('pv_alta', 'Y ya no responde al nombre viejo',
  (select count(*) = 0 from public.suppliers
    where name_norm = public.norm_client_name('Tornillería del Vallès')));

-- Y la consecuencia que importa: el nombre nuevo tampoco se puede
-- duplicar.
select test.put('pv_mismo_grau',
  (public.save_supplier(null, 'TORNILLOS Y FIJACIONES GRAU SL')).id);
select test.ok('pv_alta', 'El nombre nuevo tampoco se puede dar de alta dos veces',
  test.id('pv_mismo_grau') = test.id('pv_tornillos'));

-- Se le devuelve su nombre, para no cambiar lo que esperan las pruebas
-- siguientes.
select public.save_supplier(test.id('pv_tornillos'), 'Tornillería del Vallès', '937 44 55 66');


\echo '== PROVEEDORES · NO SE BORRAN, SE DESACTIVAN'

select public.set_supplier_active(test.id('pv_pinturas'), false);
select test.ok('pv_baja', 'Desactivar un proveedor lo deja inactivo',
  (select not active from public.suppliers where id = test.id('pv_pinturas')));

select test.ok('pv_baja', 'Pero el proveedor sigue existiendo',
  (select count(*) = 1 from public.suppliers where id = test.id('pv_pinturas')));

select public.set_supplier_active(test.id('pv_pinturas'), true);
select test.ok('pv_baja', 'Y se puede reactivar',
  (select active from public.suppliers where id = test.id('pv_pinturas')));

select test.err('pv_baja', 'Desactivar uno que no existe avisa',
  format($$select public.set_supplier_active(%L, false)$$,
         '00000000-0000-0000-0000-000000000009'), 'P0002');

-- NADIE borra proveedores a mano desde la aplicación.
select test.err('pv_baja', 'Un administrador no puede borrar proveedores desde la tabla',
  format($$delete from public.suppliers where id = %L$$, test.id('pv_pinturas')), '42501');

select test.err('pv_baja', 'Ni insertarlos saltándose la función',
  $$insert into public.suppliers (name) values ('Por la puerta de atrás')$$, '42501');

select test.err('pv_baja', 'Ni cambiarlos a mano',
  $$update public.suppliers set phone = '000' where true$$, '42501');


\echo '== PROVEEDORES · EL MATERIAL DE UN PROYECTO'

-- Un material real, con su proveedor en texto como está en producción.
reset role; select test.as_server();
with m as (insert into public.materials (project_id, name, supplier, units)
           values (test.id('proy1'), 'Tubo 30x30 e2', 'Aceros Valles', 12)
           returning id)
select test.put('pv_mat', (select id from m));
set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('pv_texto', 'El material que solo tiene el proveedor en texto se lee igual',
  (select supplier_name = 'Aceros Valles' and solo_texto
     from public.material_supplier_view where material_id = test.id('pv_mat')));

update public.materials set supplier_id = test.id('pv_aceros') where id = test.id('pv_mat');

select test.ok('pv_texto', 'Al elegirlo de la lista, la vista da el nombre del proveedor',
  (select supplier_name = 'Aceros Vallès, S.L.' and not solo_texto
     and supplier_phone = '937 11 22 33'
     from public.material_supplier_view where material_id = test.id('pv_mat')));

select test.ok('pv_texto', 'Y la columna de texto no se ha perdido',
  (select supplier = 'Aceros Valles' from public.materials where id = test.id('pv_mat')));


\echo '== PROVEEDORES · LOS HABITUALES DE UN MATERIAL'

select test.ok('pv_hab', 'Recién creado, el material no tiene habituales',
  (select count(*) = 0 from public.material_suppliers
    where material_norm = public.norm_client_name('Tubo 30x30 e2')));

select public.save_material_suppliers('Tubo 30x30 e2',
  array[test.id('pv_aceros'), test.id('pv_tornillos')]::uuid[]);

select test.ok('pv_hab', 'Un material puede tener varios proveedores habituales',
  (select count(*) = 2 from public.material_suppliers
    where material_norm = public.norm_client_name('Tubo 30x30 e2')));

-- El mismo material escrito de otra manera es el mismo material.
select test.ok('pv_hab', 'Escrito de otra manera, son los mismos habituales',
  (select count(*) = 2 from public.material_suppliers
    where material_norm = public.norm_client_name('TUBO 30X30 E2')));

select test.ok('pv_hab', 'Y los proponen a quien pregunte por ese material',
  (select count(*) = 2 and bool_and(habitual)
     from public.suppliers_for_material('tubo 30x30 e2')),
  (select string_agg(name||'/'||habitual::text, ', ')
     from public.suppliers_for_material('tubo 30x30 e2')));

-- LA LISTA SE MANDA COMPLETA: quitar a uno es volver a mandarla sin él.
select public.save_material_suppliers('Tubo 30x30 e2', array[test.id('pv_aceros')]::uuid[]);

select test.ok('pv_hab', 'Mandar la lista sin uno lo quita',
  (select count(*) = 1 and bool_and(supplier_id = test.id('pv_aceros'))
     from public.material_suppliers
    where material_norm = public.norm_client_name('Tubo 30x30 e2')));

select public.save_material_suppliers('Tubo 30x30 e2', '{}'::uuid[]);
select test.ok('pv_hab', 'Y mandarla vacía los quita todos',
  (select count(*) = 0 from public.material_suppliers
    where material_norm = public.norm_client_name('Tubo 30x30 e2')));

select test.err('pv_hab', 'Un proveedor inventado no se ata a un material',
  format($$select public.save_material_suppliers('Tubo 30x30 e2', array[%L]::uuid[])$$,
         '00000000-0000-0000-0000-000000000009'), '22023');

-- Uno que se queda de baja hasta el final, para que la comprobación de
-- abajo signifique algo. Los otros se reactivan por el camino.
select test.put('pv_cerrado', (public.save_supplier(null, 'Suministros Cerrados')).id);
select public.set_supplier_active(test.id('pv_cerrado'), false);

select test.ok('pv_hab', 'Y ese proveedor está de baja de verdad',
  (select not active from public.suppliers where id = test.id('pv_cerrado')));

select test.err('pv_hab', 'Ni uno desactivado',
  format($$select public.save_material_suppliers('Perfil L 40', array[%L]::uuid[])$$,
         test.id('pv_cerrado')), '22023');

select test.err('pv_hab', 'Sin nombre de material tampoco',
  format($$select public.save_material_suppliers('  ', array[%L]::uuid[])$$,
         test.id('pv_aceros')), '22023');

-- LO QUE NO PUEDE PASAR: que desactivar un proveedor deje bloqueada la
-- lista de los materiales que ya lo tenían. La pantalla manda la lista
-- completa, así que el guardado fallaría entero y no se podría ni añadir
-- otro proveedor ni quitar el desactivado.
select public.save_material_suppliers('Perfil L 40',
  array[test.id('pv_aceros'), test.id('pv_tornillos')]::uuid[]);
select public.set_supplier_active(test.id('pv_tornillos'), false);

select public.save_material_suppliers('Perfil L 40',
  array[test.id('pv_aceros'), test.id('pv_tornillos'), test.id('pv_pinturas')]::uuid[]);

select test.ok('pv_hab', 'Un habitual que se desactivó no bloquea la lista de su material',
  (select count(*) = 3 from public.material_suppliers
    where material_norm = public.norm_client_name('Perfil L 40')),
  (select string_agg(s.name||'/'||s.active::text, ', ')
     from public.material_suppliers ms join public.suppliers s on s.id = ms.supplier_id
    where ms.material_norm = public.norm_client_name('Perfil L 40')));

-- Y se le puede quitar, que es lo que se querrá hacer.
select public.save_material_suppliers('Perfil L 40',
  array[test.id('pv_aceros'), test.id('pv_pinturas')]::uuid[]);
select test.ok('pv_hab', 'Y se le puede quitar de la lista',
  (select count(*) = 2 and not bool_or(supplier_id = test.id('pv_tornillos'))
     from public.material_suppliers
    where material_norm = public.norm_client_name('Perfil L 40')));

-- Pero uno desactivado que NO era habitual sigue sin poder entrar.
select test.err('pv_hab', 'Uno desactivado que no era habitual sigue sin poder entrar',
  format($$select public.save_material_suppliers('Chapa 2 mm', array[%L]::uuid[])$$,
         test.id('pv_tornillos')), '22023');

select public.set_supplier_active(test.id('pv_tornillos'), true);


\echo '== PROVEEDORES · QUÉ SE PROPONE CUANDO EL MATERIAL NO TIENE NINGUNO'

select test.ok('pv_sug', 'Un material sin habituales recibe propuestas de todos modos',
  (select count(*) > 0 from public.suppliers_for_material('Material que nadie ha usado')));

select test.ok('pv_sug', 'Y van marcadas como NO habituales',
  (select bool_and(not habitual)
     from public.suppliers_for_material('Material que nadie ha usado')));

select test.ok('pv_sug', 'Los desactivados no se proponen',
  (select count(*) = 0 from public.suppliers_for_material('Material que nadie ha usado')
    where id = test.id('pv_cerrado')),
  (select string_agg(name, ', ')
     from public.suppliers_for_material('Material que nadie ha usado')));

-- Y la que lo hace valer: los activos SÍ salen, así que la de arriba no
-- pasa por venir la lista vacía.
select test.ok('pv_sug', 'Y los activos sí',
  (select count(*) > 0 from public.suppliers_for_material('Material que nadie ha usado')
    where id = test.id('pv_aceros')));

-- Cuando el material SÍ tiene habituales, se proponen solo esos: el
-- resto sería ruido.
select test.ok('pv_sug', 'Si el material tiene habituales, solo se proponen esos',
  (select count(*) = 2 and bool_and(habitual)
     from public.suppliers_for_material('Perfil L 40')),
  (select string_agg(name||'/'||habitual::text, ', ')
     from public.suppliers_for_material('Perfil L 40')));


\echo '== PROVEEDORES · UN TRABAJADOR NO LOS VE'

set role authenticated; select test.as_user(test.id('juan'));

select test.ok('pv_juan', 'Un trabajador no ve ningún proveedor',
  (select count(*) = 0 from public.suppliers),
  (select count(*)::text from public.suppliers));

select test.ok('pv_juan', 'Ni qué proveedores sirven cada material',
  (select count(*) = 0 from public.material_suppliers));

-- NI POR LA VISTA. Es «security_invoker», así que el trabajador ve el
-- material de su proyecto pero el proveedor le llega en blanco.
select test.ok('pv_juan', 'Ve el material de su proyecto, pero sin el teléfono del proveedor',
  (select supplier_phone is null
     from public.material_supplier_view where material_id = test.id('pv_mat')),
  (select coalesce(supplier_phone, 'NULO')
     from public.material_supplier_view where material_id = test.id('pv_mat')));

-- Y el nombre que le llega es el de TEXTO, el que ya veía antes de todo
-- esto. No el de la ficha del proveedor.
select test.ok('pv_juan', 'Y el nombre que ve es el de texto, el de siempre',
  (select supplier_name = 'Aceros Valles'
     from public.material_supplier_view where material_id = test.id('pv_mat')),
  (select coalesce(supplier_name, 'NULO')
     from public.material_supplier_view where material_id = test.id('pv_mat')));

-- NI POR LAS FUNCIONES, que son «security definer» y por tanto el sitio
-- donde un olvido se convierte en una fuga.
select test.ok('pv_juan', 'Ni preguntando por los proveedores de un material',
  (select count(*) = 0 from public.suppliers_for_material('Perfil L 40')),
  (select string_agg(name, ', ') from public.suppliers_for_material('Perfil L 40')));

select test.err('pv_juan', 'Ni puede dar de alta un proveedor',
  $$select public.save_supplier(null, 'El proveedor de Juan')$$, '42501');

select test.err('pv_juan', 'Ni desactivar uno',
  format($$select public.set_supplier_active(%L, false)$$, test.id('pv_aceros')), '42501');

select test.err('pv_juan', 'Ni atar proveedores a un material',
  format($$select public.save_material_suppliers('Tubo 30x30 e2', array[%L]::uuid[])$$,
         test.id('pv_aceros')), '42501');

-- Y lo que sí seguía haciendo, lo sigue haciendo: ver el material de su
-- proyecto. Si esto fallara, habríamos roto algo que funcionaba.
select test.ok('pv_juan', 'Pero sigue viendo el material de su proyecto',
  (select count(*) > 0 from public.materials where project_id = test.id('proy1')));

reset role; select test.as_server();

select test.ok('pv_juan', 'El trabajador no tiene permiso de escritura sobre proveedores',
  not has_table_privilege('authenticated', 'public.suppliers', 'INSERT')
  and not has_table_privilege('authenticated', 'public.suppliers', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.suppliers', 'DELETE'));

select test.ok('pv_juan', 'Y el público anónimo no alcanza ni la tabla ni la vista',
  not has_table_privilege('anon', 'public.suppliers', 'SELECT')
  and not has_table_privilege('anon', 'public.material_supplier_view', 'SELECT'));


\echo '== PROVEEDORES · LO QUE YA HABÍA SIGUE EN PIE'

-- Desactivar o tocar proveedores no puede arrastrarse los materiales.
select test.ok('pv_intacto', 'El material sigue atado a su proyecto y a su proveedor',
  (select project_id = test.id('proy1') and supplier_id = test.id('pv_aceros')
     from public.materials where id = test.id('pv_mat')));

select test.ok('pv_intacto', 'La columna de texto de los proveedores sigue existiendo',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'materials'
             and column_name = 'supplier'));

-- Si se borra un proveedor desde el servidor, el material NO se va con
-- él: se queda sin proveedor de la lista pero conserva el texto.
select test.put('pv_fugaz', (public.save_supplier(null, 'Proveedor de un día')).id);
update public.materials set supplier_id = test.id('pv_fugaz') where id = test.id('pv_mat');
delete from public.suppliers where id = test.id('pv_fugaz');

select test.ok('pv_intacto', 'Borrar un proveedor no se lleva el material por delante',
  (select count(*) = 1 from public.materials where id = test.id('pv_mat')));

select test.ok('pv_intacto', 'El material se queda sin proveedor de la lista, pero con su texto',
  (select supplier_id is null and supplier = 'Aceros Valles'
     from public.materials where id = test.id('pv_mat')));

update public.materials set supplier_id = test.id('pv_aceros') where id = test.id('pv_mat');

reset role; select test.as_server();
