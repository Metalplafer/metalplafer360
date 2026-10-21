-- =====================================================================
-- METALPLAFER360 · CORREGIR EL CLIENTE DE UNA FICHA O DE UN PROYECTO
--
-- Lo que importa aquí:
--
--   · que el cliente se cambie de verdad, y que se guarde el
--     IDENTIFICADOR del cliente elegido, no su nombre;
--   · que NO se cree ningún cliente por el camino;
--   · que al cliente anterior no le pase NADA: ni se borra, ni se
--     archiva, ni se desactiva, ni pierde su actividad;
--   · que no se toque ninguna OTRA ficha ni proyecto del cliente
--     anterior, aunque compartan cliente;
--   · que NO haya cascada: cambiar el presupuesto no cambia el proyecto
--     que salió de él, ni al revés;
--   · que la persona de contacto se quite si era del cliente anterior, y
--     se CONSERVE si resulta que es del nuevo;
--   · que el presupuesto conserve todo lo demás: código, estado,
--     importe, fechas, responsable, documentos y comentarios;
--   · que el historial lo cuente con los dos nombres, no con dos
--     identificadores en crudo;
--   · y que un trabajador no pueda hacerlo.
--
-- Este archivo se ejecuta después del 98.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== CAMBIAR CLIENTE · EL JUEGO DE PRUEBAS'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

-- Dos clientes que se parecen: es justo el error que se quiere corregir.
with c as (
  insert into public.clients (kind, name, tax_id, phone, city)
  values ('empresa', 'Construcciones Vallès Nord SL', 'B60000001', '937 00 00 01', 'Sabadell')
  returning id)
select test.put('cc_bueno', (select id from c));

with c as (
  insert into public.clients (kind, name, tax_id, phone, city)
  values ('empresa', 'Construccions Vallès Nord, S.L.U.', 'B60000002', '937 00 00 02', 'Terrassa')
  returning id)
select test.put('cc_malo', (select id from c));

-- Un contacto de CADA uno: así se puede comprobar que el del cliente
-- equivocado se suelta y el del bueno se queda.
with k as (
  insert into public.client_contacts (client_id, name, phone, role)
  values (test.id('cc_malo'), 'Jordi del cliente equivocado', '600000001', 'Jefe de obra')
  returning id)
select test.put('cc_contacto_malo', (select id from k));

with k as (
  insert into public.client_contacts (client_id, name, phone, role)
  values (test.id('cc_bueno'), 'Marta del cliente bueno', '600000002', 'Administración')
  returning id)
select test.put('cc_contacto_bueno', (select id from k));

-- El presupuesto que se abrió al cliente equivocado.
with f as (
  insert into public.fichas (type, client_id, contact_id, title, description, amount, status)
  values ('presupuesto', test.id('cc_malo'), test.id('cc_contacto_malo'),
          'Barandilla del rellano', 'Dos tramos.', 3400, 'enviado')
  returning id)
select test.put('cc_pres', (select id from f));
-- El estado inicial lo pone la base de datos según el tipo (archivo 43),
-- así que para tenerlo «enviado» se cambia después, como en el 94.
update public.fichas set status = 'enviado' where id = test.id('cc_pres');

-- Y OTRO presupuesto del mismo cliente equivocado, que NO se toca. Es lo
-- que hace que la prueba signifique algo: con uno solo, «no se toca lo
-- demás» no se estaría comprobando.
with f as (
  insert into public.fichas (type, client_id, title, description, amount, status)
  values ('presupuesto', test.id('cc_malo'), 'Puerta del garaje', 'Una hoja.', 1200, 'pendiente')
  returning id)
select test.put('cc_otro_pres', (select id from f));

select test.ok('cc_juego', 'El presupuesto nace con el cliente equivocado y su contacto',
  (select client_id = test.id('cc_malo') and contact_id = test.id('cc_contacto_malo')
     from public.fichas where id = test.id('cc_pres')));

-- Cuántos clientes hay ANTES: ninguna corrección puede crear uno.
select test.setnote('cc_clientes', (select count(*)::text from public.clients));


\echo '== CAMBIAR CLIENTE · LA CORRECCIÓN'

select public.set_ficha_client(test.id('cc_pres'), test.id('cc_bueno'));

select test.ok('cc_cambio', 'El presupuesto queda con el identificador del cliente elegido',
  (select client_id = test.id('cc_bueno') from public.fichas where id = test.id('cc_pres')),
  (select client_id::text from public.fichas where id = test.id('cc_pres')));

select test.ok('cc_cambio', 'Y se suelta la persona de contacto, que era del otro cliente',
  (select contact_id is null from public.fichas where id = test.id('cc_pres')));

-- LO QUE NO SE TOCA.
select test.ok('cc_cambio', 'El presupuesto conserva código, estado, importe y asunto',
  (select code like 'PRES-%' and status = 'enviado' and amount = 3400
          and title = 'Barandilla del rellano' and description = 'Dos tramos.'
     from public.fichas where id = test.id('cc_pres')));

select test.ok('cc_cambio', 'El cliente anterior sigue ahí, entero y sin archivar',
  (select name = 'Construccions Vallès Nord, S.L.U.' and tax_id = 'B60000002'
          and phone = '937 00 00 02' and active and archived_at is null
     from public.clients where id = test.id('cc_malo')));

select test.ok('cc_cambio', 'Su contacto tampoco se borra',
  (select name = 'Jordi del cliente equivocado' and client_id = test.id('cc_malo')
     from public.client_contacts where id = test.id('cc_contacto_malo')));

select test.ok('cc_cambio', 'Y no se ha creado ningún cliente nuevo',
  (select count(*) from public.clients) = test.note('cc_clientes')::bigint,
  format('antes %s, ahora %s', test.note('cc_clientes'),
         (select count(*) from public.clients)));

select test.ok('cc_cambio', 'El OTRO presupuesto del cliente equivocado se queda como estaba',
  (select client_id = test.id('cc_malo') and status = 'pendiente' and amount = 1200
     from public.fichas where id = test.id('cc_otro_pres')));


\echo '== CAMBIAR CLIENTE · EL HISTORIAL LO CUENTA CON NOMBRES'

select test.ok('cc_hist', 'El historial dice de quién a quién, no dos identificadores',
  exists (select 1 from public.audit_log
           where entity_type = 'fichas' and action = 'cambio_cliente'
             and summary like '%cambió el cliente de ' ||
                 (select code from public.fichas where id = test.id('cc_pres')) || '%'
             and summary like '%Construccions Vallès Nord, S.L.U. → Construcciones Vallès Nord SL%'),
  (select summary from public.audit_log where action = 'cambio_cliente' order by id desc limit 1));

select test.ok('cc_hist', 'Y avisa de que se ha quitado el contacto',
  exists (select 1 from public.audit_log
           where action = 'cambio_cliente'
             and summary like '%Se quitó la persona de contacto%'));

select test.ok('cc_hist', 'No queda ningún identificador en bruto en la frase',
  not exists (select 1 from public.audit_log
               where action = 'cambio_cliente'
                 and summary like '%' || test.id('cc_bueno')::text || '%'));

-- Pero los dos identificadores SÍ quedan en el detalle, que es lo que
-- hace falta para reconstruir qué pasó.
select test.ok('cc_hist', 'El detalle guarda los dos identificadores',
  exists (select 1 from public.audit_log
           where action = 'cambio_cliente'
             and details ->> 'antes' = test.id('cc_malo')::text
             and details ->> 'despues' = test.id('cc_bueno')::text
             and (details ->> 'contacto_quitado')::boolean));


\echo '== CAMBIAR CLIENTE · UN CONTACTO DEL CLIENTE NUEVO SE CONSERVA'

update public.fichas set contact_id = test.id('cc_contacto_bueno')
 where id = test.id('cc_pres');

-- Se devuelve al cliente equivocado y se vuelve a traer: el contacto es
-- del bueno, así que a la vuelta tiene que seguir puesto.
select public.set_ficha_client(test.id('cc_pres'), test.id('cc_malo'));
select test.ok('cc_contacto', 'Al cambiar al otro cliente, el contacto que no es suyo se suelta',
  (select contact_id is null from public.fichas where id = test.id('cc_pres')));

update public.fichas set contact_id = test.id('cc_contacto_malo')
 where id = test.id('cc_pres');
select public.set_ficha_client(test.id('cc_pres'), test.id('cc_bueno'));

update public.fichas set contact_id = test.id('cc_contacto_bueno')
 where id = test.id('cc_pres');
select public.set_ficha_client(test.id('cc_pres'), test.id('cc_bueno'));
select test.ok('cc_contacto', 'Y si ya era del cliente al que se cambia, se conserva',
  (select contact_id = test.id('cc_contacto_bueno')
     from public.fichas where id = test.id('cc_pres')));


\echo '== CAMBIAR CLIENTE · SIN CASCADA'

-- El presupuesto se convierte en proyecto, que es cuando el error de
-- cliente duele de verdad.
update public.fichas set status = 'aceptado' where id = test.id('cc_pres');
select test.put('cc_proy', public.convert_budget_to_project(test.id('cc_pres')));

select test.ok('cc_cascada', 'El proyecto nace con el cliente del presupuesto',
  (select client_id = test.id('cc_bueno') from public.projects where id = test.id('cc_proy')));

-- Cambiar el del PRESUPUESTO no mueve el del PROYECTO.
select public.set_ficha_client(test.id('cc_pres'), test.id('cc_malo'));

select test.ok('cc_cascada', 'Cambiar el cliente del presupuesto NO cambia el del proyecto',
  (select client_id = test.id('cc_bueno') from public.projects where id = test.id('cc_proy')),
  (select client_id::text from public.projects where id = test.id('cc_proy')));

-- Y al revés tampoco.
select public.set_project_client(test.id('cc_proy'), test.id('cc_malo'));
select test.ok('cc_cascada', 'Y cambiar el del proyecto NO cambia el del presupuesto',
  (select client_id = test.id('cc_malo') from public.projects where id = test.id('cc_proy'))
  and (select client_id = test.id('cc_malo') from public.fichas where id = test.id('cc_pres')));

-- Se deja el proyecto en el cliente bueno para lo que viene.
select public.set_project_client(test.id('cc_proy'), test.id('cc_bueno'));
select test.ok('cc_cascada', 'El proyecto conserva su código y su presupuesto de origen',
  (select code like 'PROY-%' and source_ficha_id = test.id('cc_pres') and budget_amount = 3400
     from public.projects where id = test.id('cc_proy')));

select test.ok('cc_cascada', 'Y el historial del proyecto también lo cuenta con nombres',
  exists (select 1 from public.audit_log
           where entity_type = 'projects' and action = 'cambio_cliente'
             and entity_code = (select code from public.projects where id = test.id('cc_proy'))
             and summary like '%→ Construcciones Vallès Nord SL%'));


\echo '== CAMBIAR CLIENTE · LO QUE DEL PROYECTO NO SE TOCA'

-- Un proyecto con cobros, material y una orden: cambiar el cliente no
-- puede moverle nada de eso.
select test.put('cc_pago', (public.register_payment(test.id('cc_proy'), 1000)).id);

insert into public.materials (project_id, name, units, supplier)
values (test.id('cc_proy'), 'Pletina 40×8', 12, 'Aceros del Vallès');

select public.set_project_client(test.id('cc_proy'), test.id('cc_malo'));

select test.ok('cc_intacto', 'El cobro sigue en el proyecto, con su importe',
  (select project_id = test.id('cc_proy') and amount = 1000 and voided_at is null
     from public.payments where id = test.id('cc_pago')));

select test.ok('cc_intacto', 'El material sigue en el proyecto',
  (select count(*) = 1 from public.materials
    where project_id = test.id('cc_proy') and name = 'Pletina 40×8'));

select test.ok('cc_intacto', 'Y las cuentas del proyecto no se mueven',
  (select total = 3400 and cobrado = 1000 and pendiente = 2400
     from public.project_billing where project_id = test.id('cc_proy')),
  (select format('total=%s cobrado=%s pendiente=%s', total, cobrado, pendiente)
     from public.project_billing where project_id = test.id('cc_proy')));


\echo '== CAMBIAR CLIENTE · LO QUE NO SE PUEDE HACER'

-- El mismo cliente: no se toca nada y NO se escribe en el historial.
select test.setnote('cc_hist',
  (select count(*)::text from public.audit_log where action = 'cambio_cliente'));

select public.set_project_client(test.id('cc_proy'), test.id('cc_malo'));

select test.ok('cc_no', 'Poner el cliente que ya tenía no escribe nada en el historial',
  (select count(*) from public.audit_log where action = 'cambio_cliente')
    = test.note('cc_hist')::bigint,
  format('antes %s, ahora %s', test.note('cc_hist'),
         (select count(*) from public.audit_log where action = 'cambio_cliente')));

select test.err('cc_no', 'Un cliente que no existe se rechaza',
  format($$select public.set_ficha_client(%L, '00000000-0000-0000-0000-000000000000')$$,
         test.id('cc_pres')), 'P0002');

select test.err('cc_no', 'Una ficha que no existe, también',
  format($$select public.set_ficha_client('00000000-0000-0000-0000-000000000000', %L)$$,
         test.id('cc_bueno')), 'P0002');

select test.errlike('cc_no', 'Un presupuesto no se puede quedar sin cliente',
  format($$select public.set_ficha_client(%L, null)$$, test.id('cc_pres')),
  '22023', '%necesita siempre un cliente%');

select test.errlike('cc_no', 'Ni un proyecto',
  format($$select public.set_project_client(%L, null)$$, test.id('cc_proy')),
  '22023', '%necesita siempre un cliente%');

-- Un cliente archivado no se puede elegir: estaría eligiendo algo que la
-- pantalla de clientes ya no ofrece.
update public.clients set archived_at = now() where id = test.id('cc_bueno');
select test.errlike('cc_no', 'Un cliente archivado se rechaza, y se dice qué hacer',
  format($$select public.set_ficha_client(%L, %L)$$, test.id('cc_pres'), test.id('cc_bueno')),
  '22023', '%archivado%');
update public.clients set archived_at = null where id = test.id('cc_bueno');

-- Una VISITA sí puede quedarse sin cliente: puede ser de alguien que
-- todavía no lo es.
with f as (
  insert into public.fichas (type, client_id, title, description)
  values ('visita', test.id('cc_malo'), 'Ver la obra', 'Primera visita.')
  returning id)
select test.put('cc_visita', (select id from f));

select public.set_ficha_client(test.id('cc_visita'), null);
select test.ok('cc_no', 'Una visita sí se puede quedar sin cliente',
  (select client_id is null from public.fichas where id = test.id('cc_visita')));

-- Un trabajador no corrige clientes. Es información de administración.
select test.as_user(test.id('juan'));
select test.err('cc_no', 'Un trabajador no puede cambiar el cliente de una ficha',
  format($$select public.set_ficha_client(%L, %L)$$, test.id('cc_pres'), test.id('cc_bueno')),
  '42501');
select test.err('cc_no', 'Ni el de un proyecto',
  format($$select public.set_project_client(%L, %L)$$, test.id('cc_proy'), test.id('cc_bueno')),
  '42501');

select test.as_user(test.id('salvi'));
select test.ok('cc_no', 'Y después del intento el cliente sigue siendo el que era',
  (select client_id = test.id('cc_malo') from public.projects where id = test.id('cc_proy')));

reset role; select test.as_server();
