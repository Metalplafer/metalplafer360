-- =====================================================================
-- METALPLAFER360 · PRUEBAS DE MATERIAL, CALENDARIO Y COBROS (FASE 5)
--
-- Continúa sobre los datos de las fases anteriores:
--   salvi → administración · juan, pedro, montse → trabajadores
--   proy1 → proyecto en Fabricación, presupuesto 2.400 €
--   ot_fab → orden validada de proy1 (juan y pedro)
--   ot_futura → orden de montaje de proy1 dentro de una semana (juan)
--   ot_ajena → orden de otro proyecto, que juan no ve
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
reset role;
select test.as_server();

create or replace function test.notifs_kind(p_kind text, p_user uuid default null)
returns bigint language sql security definer set search_path = public as $$
  select count(*) from public.notifications
   where kind::text = p_kind and (p_user is null or user_id = p_user) $$;
grant execute on all functions in schema test to anon, authenticated, service_role;

set role authenticated; select test.as_user(test.id('salvi'));


\echo '== MATERIAL PENDIENTE'
with x as (
  insert into public.materials (project_id, name, units, supplier, ordered_on, expected_on, notes)
  values (test.id('proy1'), 'Pletina 40×8 mm', 12, 'Aceros Vallès',
          public.today_madrid() - 5, public.today_madrid() + 3,
          'Cortada a 3 metros.')
  returning id, received, late_notified_on)
select test.put('mat1', id),
       test.ok('material', 'El material nace pendiente de recibir', not received),
       test.ok('material', 'Y sin ningún aviso de retraso emitido', late_notified_on is null)
  from x;

select test.ok('material', 'Guarda material, unidades, proveedor y las dos fechas',
  (select name = 'Pletina 40×8 mm' and units = 12 and supplier = 'Aceros Vallès'
      and ordered_on = public.today_madrid() - 5
      and expected_on = public.today_madrid() + 3
     from public.materials where id = test.id('mat1')));

select test.ok('material', 'NO se guarda el precio',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'materials'
                 and column_name in ('price', 'amount', 'cost', 'importe', 'precio')));

select test.ok('material', 'NO se guarda el número de pedido',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'materials'
                 and column_name in ('order_number', 'purchase_order', 'numero_pedido')));

select test.ok('material', 'NO se guarda la persona solicitante',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'materials'
                 and column_name in ('requested_by', 'created_by', 'solicitante', 'requester')));

select test.ok('material', 'Al marcar recibido no se guarda ni fecha ni usuario',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'materials'
                 and column_name in ('received_at', 'received_by', 'received_on')));

select test.err('material', 'Un material sin nombre se rechaza',
  $$insert into public.materials (project_id, name) values (test.id('proy1'), '  ')$$, '23514');

select test.err('material', 'Las unidades tienen que ser mayores que cero',
  $$insert into public.materials (project_id, name, units)
    values (test.id('proy1'), 'Tornillos', 0)$$, '23514');

-- Material ya retrasado, para los avisos
with x as (
  insert into public.materials (project_id, name, units, supplier, ordered_on, expected_on)
  values (test.id('proy1'), 'Bisagras inoxidables', 6, 'Ferretería Sabadell',
          public.today_madrid() - 20, public.today_madrid() - 4)
  returning id)
select test.put('mat_tarde', id) from x;

select test.ok('material', 'El proyecto sabe cuánto material tiene pendiente y retrasado',
  (select total = 2 and pendientes = 2 and retrasados = 1
     from public.project_materials where project_id = test.id('proy1')));


\echo '== PROVEEDORES CON SUGERENCIAS'
select test.ok('proveedores', 'Sugiere los proveedores ya utilizados',
  (select count(*) = 2 from public.suggest_suppliers('')));

select test.ok('proveedores', 'Busca sin acentos ni mayúsculas',
  (select supplier = 'Aceros Vallès' from public.suggest_suppliers('aceros valles')));

select test.ok('proveedores', 'No inventa proveedores que no existen',
  (select count(*) = 0 from public.suggest_suppliers('Suministros Inexistentes')));

-- El proveedor es texto libre: se puede escribir uno nuevo
with x as (
  insert into public.materials (project_id, name, units, supplier)
  values (test.id('proy1'), 'Imprimación gris', 2, 'Pinturas Grau')
  returning id)
select test.put('mat_nuevo', id) from x;
select test.ok('proveedores', 'Un proveedor nuevo se escribe libremente y pasa a las sugerencias',
  (select count(*) = 3 from public.suggest_suppliers('')));


\echo '== MARCAR RECIBIDO'
update public.materials set received = true where id = test.id('mat_nuevo');
select test.ok('recibido', 'El material queda marcado como recibido',
  (select received from public.materials where id = test.id('mat_nuevo')));

select test.ok('recibido', 'Deja de contar como pendiente',
  (select pendientes = 2 from public.project_materials where project_id = test.id('proy1')));

select test.ok('recibido', 'El historial dice quién lo marcó y cuándo, sin guardarlo en el material',
  exists (select 1 from public.audit_log
           where summary like '%marcó como recibido «Imprimación gris»%'));

update public.materials set received = false where id = test.id('mat_nuevo');
select test.ok('recibido', 'Se puede volver a dejar pendiente si se marcó por error',
  (select not received from public.materials where id = test.id('mat_nuevo')));


\echo '== AVISO DE MATERIAL RETRASADO'
select test.ok('retrasos', 'Avisa una vez del material retrasado',
  public.notify_late_materials() = 1);

select test.ok('retrasos', 'El aviso llega a administración',
  test.notifs_kind('material_retrasado', test.id('salvi')) = 1);

select test.ok('retrasos', 'No repite el aviso el mismo día',
  public.notify_late_materials() = 0);

select test.ok('retrasos', 'El aviso dice qué material y para cuándo estaba previsto',
  exists (select 1 from public.notifications
           where kind = 'material_retrasado' and body like 'Bisagras inoxidables%previsto para el%'));

update public.materials set received = true where id = test.id('mat_tarde');
select test.ok('retrasos', 'Recibido, deja de estar retrasado',
  (select retrasados = 0 from public.project_materials where project_id = test.id('proy1')));
update public.materials set received = false where id = test.id('mat_tarde');


\echo '== LO QUE COMUNICA EL TRABAJADOR'
select test.as_user(test.id('juan'));

select test.ok('solicitudes', 'El trabajador ve el material de su proyecto',
  (select count(*) = 3 from public.materials));

select test.err('solicitudes', 'Pero no puede crear material él mismo',
  $$insert into public.materials (project_id, name, units)
    values (test.id('proy1'), 'Inventado', 1)$$, '42501');

update public.materials set received = true where id = test.id('mat1');
reset role; set role authenticated; select test.as_user(test.id('salvi'));
select test.ok('solicitudes', 'Ni marcarlo como recibido por su cuenta',
  (select not received from public.materials where id = test.id('mat1')));

select test.as_user(test.id('juan'));
select test.put('sol1', (public.submit_material_request(test.id('ot_futura'), 'Faltan 3 bisagras')).id);

select test.ok('solicitudes', 'La comunicación queda pendiente de revisar',
  (select status = 'pendiente' and body = 'Faltan 3 bisagras' and worker_id = test.id('juan')
     from public.material_requests where id = test.id('sol1')));

select test.ok('solicitudes', 'NO se crea material automáticamente',
  (select count(*) = 3 from public.materials));

select test.err('solicitudes', 'No puede comunicar en una orden que no es suya',
  $$select public.submit_material_request(test.id('ot_ajena'), 'Cotilleando')$$, '42501');

select test.err('solicitudes', 'Una comunicación vacía se rechaza',
  $$select public.submit_material_request(test.id('ot_futura'), '   ')$$, '22023');

select test.err('solicitudes', 'No puede aceptar su propia comunicación',
  $$select public.accept_material_request(test.id('sol1'), 'Bisagras', 3)$$, '42501');

select test.err('solicitudes', 'Ni descartarla',
  $$select public.discard_material_request(test.id('sol1'), 'nada')$$, '42501');

reset role; set role authenticated; select test.as_user(test.id('salvi'));
select test.ok('solicitudes', 'Administración recibe el aviso',
  test.notifs_kind('material_solicitado', test.id('salvi')) = 1);

select test.ok('solicitudes', 'Administración ve la comunicación pendiente',
  (select count(*) = 1 from public.material_requests where status = 'pendiente'));

-- Aceptar: ahora sí se crea el material, con los datos que pone administración
select test.put('mat_de_sol', (public.accept_material_request(
  test.id('sol1'), 'Bisagras inox 40 mm', 3, 'Ferretería Sabadell',
  public.today_madrid(), public.today_madrid() + 2, 'Para el montaje')).id);

select test.ok('solicitudes', 'Al aceptarla se crea el material pendiente',
  (select name = 'Bisagras inox 40 mm' and units = 3 and supplier = 'Ferretería Sabadell'
      and not received
     from public.materials where id = test.id('mat_de_sol')));

select test.ok('solicitudes', 'La comunicación queda aceptada y enlazada con su material',
  (select status = 'aceptada' and material_id = test.id('mat_de_sol')
      and reviewed_by = test.id('salvi') and reviewed_at is not null
     from public.material_requests where id = test.id('sol1')));

select test.ok('solicitudes', 'El material heredó el proyecto y la orden del aviso',
  (select project_id = test.id('proy1') and order_id = test.id('ot_futura')
     from public.materials where id = test.id('mat_de_sol')));

select test.err('solicitudes', 'Una comunicación ya revisada no se revisa dos veces',
  $$select public.accept_material_request(test.id('sol1'), 'Otra vez', 1)$$, '22023');

-- Descartar otra
select test.as_user(test.id('juan'));
select test.put('sol2', (public.submit_material_request(test.id('ot_futura'), 'Creo que falta pintura')).id);
reset role; set role authenticated; select test.as_user(test.id('salvi'));
select public.discard_material_request(test.id('sol2'), 'La pintura ya está en el taller.');

select test.ok('solicitudes', 'Una comunicación se puede descartar con su motivo',
  (select status = 'descartada' and review_note like 'La pintura ya está%'
     from public.material_requests where id = test.id('sol2')));

select test.ok('solicitudes', 'Descartarla no crea material',
  (select count(*) = 4 from public.materials));

select test.ok('solicitudes', 'El trabajador recibe la respuesta',
  test.notifs_kind('material_solicitado', test.id('juan')) = 2);

select test.as_user(test.id('juan'));
select test.ok('solicitudes', 'El trabajador solo ve sus propias comunicaciones',
  (select count(*) = 2 and bool_and(worker_id = test.id('juan')) from public.material_requests));


\echo '== CALENDARIO'
reset role; set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('calendario', 'El calendario reúne órdenes, material, visitas y avisos',
  (select count(distinct kind) >= 3 from public.v_calendar));

select test.ok('calendario', 'Cada evento lleva su tipo, que es lo que da el color',
  (select bool_and(kind in ('fabricacion', 'montaje', 'material', 'visita', 'aviso'))
     from public.v_calendar));

select test.ok('calendario', 'El color NO depende del trabajador',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'v_calendar'
                 and column_name in ('color', 'worker_color', 'colour')));

select test.ok('calendario', 'Cada evento sabe a quién está asignado, para poder filtrar',
  exists (select 1 from public.v_calendar
           where kind = 'montaje' and test.id('juan') = any(assigned)));

select test.ok('calendario', 'El material aparece en su fecha prevista',
  exists (select 1 from public.v_calendar
           where kind = 'material' and title = 'Bisagras inox 40 mm'
             and date = public.today_madrid() + 2));

select test.ok('calendario', 'Solo se pueden arrastrar las órdenes de trabajo',
  (select bool_and(movable = (kind in ('fabricacion', 'montaje'))) from public.v_calendar));

-- Arrastrar una orden = cambiar su fecha
select test.setnote('avisos_antes', (
  select count(*)::text from public.notifications where order_id = test.id('ot_futura')));

update public.work_orders
   set scheduled_date = public.today_madrid() + 10
 where id = test.id('ot_futura');

select test.ok('calendario', 'Arrastrar una orden le cambia la fecha',
  (select scheduled_date = public.today_madrid() + 10
     from public.work_orders where id = test.id('ot_futura')));

select test.ok('calendario', 'Cambiar la fecha NO avisa a nadie',
  (select count(*)::text from public.notifications where order_id = test.id('ot_futura'))
    = test.note('avisos_antes'));

select test.ok('calendario', 'Pero sí queda en el historial',
  exists (select 1 from public.audit_log where summary like '%cambió la fecha de la orden%'));

select test.as_user(test.id('juan'));
select test.ok('calendario', 'El trabajador solo ve en el calendario lo suyo',
  (select bool_and(kind <> 'fabricacion' or code is not null) and count(*) > 0
     from public.v_calendar));

select test.ok('calendario', 'Y nunca una orden de otro proyecto',
  not exists (select 1 from public.v_calendar
               where kind in ('fabricacion', 'montaje')
                 and id = test.id('ot_ajena')));


\echo '== FACTURACIÓN Y COBROS PARCIALES'
reset role; set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('facturacion', 'El proyecto empieza sin nada cobrado',
  (select total = 2400 and cobrado = 0 and pendiente = 2400
     from public.project_billing where project_id = test.id('proy1')));

select test.put('cobro1', (public.register_payment(test.id('proy1'), 2000, null, 'Anticipo')).id);

select test.ok('facturacion', 'Total 2.400 − cobrado 2.000 = pendiente 400',
  (select cobrado = 2000 and pendiente = 400 and cobros = 1
     from public.project_billing where project_id = test.id('proy1')));

select test.ok('facturacion', 'El estado pasa solo a Cobrado parcialmente',
  (select billing_status = 'cobrado_parcial' from public.projects where id = test.id('proy1')));

select test.err('facturacion', 'Un cobro de cero no se admite',
  $$select public.register_payment(test.id('proy1'), 0)$$, '22023');

select test.err('facturacion', 'Ni un cobro negativo',
  $$select public.register_payment(test.id('proy1'), -100)$$, '22023');

select test.ok('facturacion', 'NO se guarda el número de factura',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'payments'
                 and column_name in ('invoice', 'invoice_number', 'numero_factura', 'factura')));

select test.put('cobro2', (public.register_payment(test.id('proy1'), 400, null, 'Resto')).id);

select test.ok('facturacion', 'Al cobrarlo todo el estado pasa solo a Cobrado',
  (select billing_status = 'cobrado' from public.projects where id = test.id('proy1')));

select test.ok('facturacion', 'Y no queda nada pendiente',
  (select pendiente = 0 and cobros = 2
     from public.project_billing where project_id = test.id('proy1')));

select public.delete_payment(test.id('cobro2'));
select test.ok('facturacion', 'Si se quita un cobro, vuelve a estar cobrado parcialmente',
  (select billing_status = 'cobrado_parcial' from public.projects where id = test.id('proy1'))
  and (select pendiente = 400 from public.project_billing where project_id = test.id('proy1')));

select test.ok('facturacion', 'El historial guarda los cobros apuntados y anulados',
  exists (select 1 from public.audit_log where summary like '%apuntó un cobro de 2.000,00 €%')
  and exists (select 1 from public.audit_log where summary like '%anuló un cobro de 400,00 €%'));

-- Cambiar el importe del proyecto recalcula el estado
update public.projects set budget_amount = 2000 where id = test.id('proy1');
select test.ok('facturacion', 'Si baja el presupuesto y ya estaba cobrado, pasa a Cobrado',
  (select billing_status = 'cobrado' from public.projects where id = test.id('proy1')));
update public.projects set budget_amount = 2400 where id = test.id('proy1');


\echo '== PERMISOS DE FASE 5'
select test.as_user(test.id('juan'));

select test.ok('permisos_f5', 'Un trabajador no ve ni un cobro',
  (select count(*) = 0 from public.payments));

select test.err('permisos_f5', 'No puede apuntar cobros',
  $$select public.register_payment(test.id('proy1'), 100)$$, '42501');

select test.err('permisos_f5', 'Ni quitarlos',
  $$select public.delete_payment(test.id('cobro1'))$$, '42501');

select test.ok('permisos_f5', 'No puede escribir directamente en las comunicaciones',
  not has_table_privilege('authenticated', 'public.material_requests', 'insert'));

select test.ok('permisos_f5', 'Ni en los cobros',
  not has_table_privilege('authenticated', 'public.payments', 'insert'));

select test.ok('permisos_f5', 'El material no se borra: se archiva',
  not has_table_privilege('authenticated', 'public.materials', 'delete'));

select test.ok('permisos_f5', 'Avisar de material retrasado no hace nada si no eres administración',
  public.notify_late_materials() = 0);

reset role; set role anon; select test.as_anon();
select test.err('permisos_f5', 'Sin sesión no se ve el material',
  'select * from public.materials', '42501');
select test.err('permisos_f5', 'Sin sesión no se ven los cobros',
  'select * from public.payments', '42501');
select test.err('permisos_f5', 'Sin sesión no se ve el calendario',
  'select * from public.v_calendar', '42501');
select test.err('permisos_f5', 'Sin sesión no se puede apuntar un cobro',
  $$select public.register_payment(test.id('proy1'), 100)$$, '42501');

reset role;
