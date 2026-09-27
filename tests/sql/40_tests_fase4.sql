-- =====================================================================
-- METALPLAFER360 · PRUEBAS DE ÓRDENES DE TRABAJO (FASE 4)
--
-- Continúa sobre los datos de las fases anteriores:
--   salvi → administración
--   juan, pedro, montse → trabajadores
--   proy1, proy_conv, proy_sin_montaje → proyectos
--
-- Se comprueba lo que NO debe poder hacerse aunque se manipule la
-- petición: la seguridad está en la base de datos, no en los botones.
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
reset role;
select test.as_server();

-- Los tres trabajadores de las pruebas deben estar activos.
update public.profiles set active = true where id in (test.id('juan'), test.id('pedro'), test.id('montse'));

-- Ayuda para contar avisos internos sin depender de quién los mira.
-- (Que cada persona solo vea los suyos se comprueba aparte, con RLS real.)
create or replace function test.notifs(p_order uuid, p_kind text default null,
                                       p_user uuid default null)
returns bigint language sql security definer set search_path = public as $$
  select count(*) from public.notifications
   where order_id = p_order
     and (p_kind is null or kind::text = p_kind)
     and (p_user is null or user_id = p_user) $$;

create or replace function test.unread(p_user uuid) returns bigint
language sql security definer set search_path = public as $$
  select count(*) from public.notifications where user_id = p_user and read_at is null $$;
grant execute on all functions in schema test to anon, authenticated, service_role;

set role authenticated; select test.as_user(test.id('salvi'));


\echo '== CREAR ÓRDENES'
with x as (
  insert into public.work_orders (project_id, type, scheduled_date, description,
                                  planned_hours, admin_notes)
  values (test.id('proy1'), 'fabricacion', public.today_madrid(),
          'Cortar pletina, soldar marcos y preparar barrotes de las 4 rejas.',
          18, 'El material llegó ayer.')
  returning id, code, status, submitted_at)
select test.put('ot_fab', id), test.setnote('ot_fab_code', code),
       test.ok('ordenes', 'El código sigue el formato OT-AAAA-###',
         code ~ ('^OT-' || extract(year from public.today_madrid())::int || '-[0-9]{3}$')),
       test.ok('ordenes', 'Una orden nueva nace Pendiente y sin enviar',
         status = 'pendiente' and submitted_at is null)
  from x;

select test.ok('ordenes', 'La orden guarda tipo, fecha, trabajo a realizar y horas previstas',
  (select type = 'fabricacion' and scheduled_date = public.today_madrid()
      and description like 'Cortar pletina%' and planned_hours = 18
     from public.work_orders where id = test.id('ot_fab')));

select test.ok('ordenes', 'La orden solo lleva fecha: no hay hora prevista de inicio ni de fin',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'work_orders'
                 and column_name in ('scheduled_time', 'start_time', 'end_time',
                                     'started_at', 'finished_at')));

select test.err('ordenes', 'Una orden sin trabajo a realizar se rechaza',
  $$insert into public.work_orders (project_id, type, scheduled_date, description)
    values (test.id('proy1'), 'montaje', public.today_madrid(), '   ')$$, '23514');

select test.err('ordenes', 'Una orden sin fecha se rechaza',
  $$insert into public.work_orders (project_id, type, description)
    values (test.id('proy1'), 'montaje', 'Sin fecha')$$, '23502');

select test.err('ordenes', 'Una orden sin proyecto se rechaza',
  $$insert into public.work_orders (type, scheduled_date, description)
    values ('montaje', public.today_madrid(), 'Sin proyecto')$$, '23502');

-- Orden futura del mismo proyecto (montaje dentro de una semana)
with x as (
  insert into public.work_orders (project_id, type, scheduled_date, description, planned_hours)
  values (test.id('proy1'), 'montaje', public.today_madrid() + 7,
          'Montar las 4 rejas con tacos químicos.', 6)
  returning id, code)
select test.put('ot_futura', id),
       test.ok('ordenes', 'La numeración avanza correlativamente',
         split_part(code, '-', 3)::int = split_part(test.note('ot_fab_code'), '-', 3)::int + 1)
  from x;

-- Orden de otro proyecto, que juan NO verá nunca
with x as (
  insert into public.work_orders (project_id, type, scheduled_date, description)
  values (test.id('proy_conv'), 'fabricacion', public.today_madrid(), 'Orden ajena a Juan.')
  returning id)
select test.put('ot_ajena', id) from x;

-- Aunque la petición pida nacer «validada», la base de datos la corrige.
with x as (
  insert into public.work_orders (project_id, type, scheduled_date, description, status, validated_at)
  values (test.id('proy1'), 'montaje', public.today_madrid(), 'Trampa', 'validada', now())
  returning id, status, validated_at)
select test.put('ot_trampa', id),
       test.ok('ordenes', 'Una orden creada como «validada» nace igualmente Pendiente',
         status = 'pendiente' and validated_at is null)
  from x;
update public.work_orders set archived_at = now() where id = test.id('ot_trampa');


\echo '== ASIGNAR TRABAJADORES'
select public.assign_order_workers(test.id('ot_fab'),
  array[test.id('juan'), test.id('pedro'), test.id('montse')]);

select test.ok('asignacion', 'Una orden puede tener varios trabajadores',
  (select count(*) = 3 from public.work_order_workers where order_id = test.id('ot_fab')));

select test.ok('asignacion', 'No existe responsable principal: todos están al mismo nivel',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'work_orders'
                 and column_name in ('responsible_id', 'main_worker_id', 'leader_id')));

select test.ok('asignacion', 'Las horas previstas son de la orden, no de cada trabajador',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'work_order_workers'
                 and column_name = 'planned_hours'));

select test.ok('asignacion', 'Cada trabajador asignado recibe un aviso interno',
  test.notifs(test.id('ot_fab'), 'orden_asignada') = 3);

-- Quitar a montse (todavía no ha hecho nada)
select public.assign_order_workers(test.id('ot_fab'), array[test.id('juan'), test.id('pedro')]);
select test.ok('asignacion', 'Se puede quitar a quien no ha registrado trabajo',
  (select count(*) = 2 from public.work_order_workers where order_id = test.id('ot_fab')));

select test.err('asignacion', 'No se puede asignar a alguien que no existe',
  $$select public.assign_order_workers(test.id('ot_fab'),
      array[test.id('juan'), '00000000-0000-0000-0000-000000000001'::uuid])$$, '22023');

select public.assign_order_workers(test.id('ot_futura'), array[test.id('juan')]);


\echo '== EL TRABAJADOR SOLO VE LO SUYO'
select test.as_user(test.id('juan'));

select test.ok('trabajador', 'Ve las dos órdenes que tiene asignadas',
  (select count(*) = 2 from public.work_orders));

select test.ok('trabajador', 'No ve la orden de otro proyecto',
  not exists (select 1 from public.work_orders where id = test.id('ot_ajena')));

select test.ok('trabajador', 'Ve el proyecto de su orden',
  (select count(*) = 1 and bool_and(id = test.id('proy1')) from public.projects));

select test.ok('trabajador', 'Ve al cliente de ese proyecto y a ningún otro',
  (select count(*) = 1 from public.clients));

select test.ok('trabajador', 'Sigue sin ver presupuestos ajenos',
  not exists (select 1 from public.fichas where type = 'presupuesto'));

select test.ok('trabajador', 'No ve el parte de sus compañeros',
  (select count(*) = 2 and bool_and(worker_id = test.id('juan'))
     from public.work_order_workers));

select test.ok('trabajador', 'Sí ve el nombre de los compañeros de su orden',
  (select count(*) = 2 from public.order_team where order_id = test.id('ot_fab')));

select test.ok('trabajador', 'No ve el equipo de una orden ajena',
  (select count(*) = 0 from public.order_team where order_id = test.id('ot_ajena')));

select test.ok('trabajador', 'Ve el perfil de su compañero de orden',
  exists (select 1 from public.profiles where id = test.id('pedro')));

select test.err('trabajador', 'No puede crear órdenes',
  $$insert into public.work_orders (project_id, type, scheduled_date, description)
    values (test.id('proy1'), 'montaje', public.today_madrid(), 'Inventada')$$, '42501');

update public.work_orders set description = 'HACKEADO', planned_hours = 1
 where id = test.id('ot_fab');
reset role; set role authenticated; select test.as_user(test.id('salvi'));
select test.ok('trabajador', 'No puede modificar el trabajo a realizar de la orden',
  (select description like 'Cortar pletina%' and planned_hours = 18
     from public.work_orders where id = test.id('ot_fab')));


\echo '== UNA ORDEN FUTURA SE CONSULTA, PERO NO SE TOCA'
select test.as_user(test.id('juan'));

select test.ok('futuras', 'Puede consultar una orden de la semana que viene',
  exists (select 1 from public.work_orders where id = test.id('ot_futura')));

select test.ok('futuras', 'Pero la base de datos no le deja trabajar en ella',
  not public.worker_can_edit_order(test.id('ot_futura')));

select test.err('futuras', 'No puede rellenar el parte antes de la fecha',
  $$select public.save_order_part(test.id('ot_futura'), 'Adelantando trabajo', 3)$$, '22023');

select test.ok('futuras', 'Tampoco puede subir fotografías a una orden futura',
  not public.storage_can_upload('orders/' || test.id('ot_futura') || '/foto.jpg'));

select test.err('futuras', 'Ni guardar un documento de una orden futura',
  $$insert into public.documents (order_id, storage_path, file_name, size_bytes, category, uploaded_by)
    values (test.id('ot_futura'), 'orders/futura/x.jpg', 'x.jpg', 10, 'foto', test.id('juan'))$$, '42501');

select test.ok('futuras', 'La orden de hoy sí se puede trabajar',
  public.worker_can_edit_order(test.id('ot_fab')));


\echo '== PARTE DE TRABAJO: SIN BOTÓN DE INICIAR'
select test.ok('parte', 'No existe ningún «iniciar orden» que guarde la hora de inicio',
  not exists (select 1 from pg_proc where proname in ('start_order', 'iniciar_orden', 'begin_order')));

select public.save_order_part(test.id('ot_fab'), 'Cortada la pletina de las cuatro rejas.', 3.5);

select test.ok('parte', 'Al guardar el parte la orden pasa sola a En curso',
  (select status = 'en_curso' from public.work_orders where id = test.id('ot_fab')));

select test.ok('parte', 'Las horas admiten decimales (7,5 = siete horas y media)',
  (select hours = 3.5 from public.work_order_workers
    where order_id = test.id('ot_fab') and worker_id = test.id('juan')));

select test.err('parte', 'Más de 24 horas en una orden se rechaza',
  $$select public.save_order_part(test.id('ot_fab'), 'Jornada imposible', 30)$$, '22023');

select test.err('parte', 'No se puede enviar sin escribir el trabajo realizado',
  $$select public.save_order_part(test.id('ot_fab'), '   ', 7.5, true)$$, '22023');

select test.err('parte', 'No se puede enviar sin horas',
  $$select public.save_order_part(test.id('ot_fab'), 'Hecho todo', 0, true)$$, '22023');

select test.err('parte', 'No se puede rellenar el parte de una orden ajena',
  $$select public.save_order_part(test.id('ot_ajena'), 'No es mía', 2)$$, '42501');

select test.ok('parte', 'El trabajo realizado se guarda aparte del trabajo a realizar',
  (select w.work_done like 'Cortada la pletina%' and o.description like 'Cortar pletina%'
     from public.work_order_workers w join public.work_orders o on o.id = w.order_id
    where w.order_id = test.id('ot_fab') and w.worker_id = test.id('juan')));

-- Juan envía su parte; Pedro todavía no
select public.save_order_part(test.id('ot_fab'),
  'Cortada la pletina, soldados los cuatro marcos.', 7.5, true);

select test.ok('parte', 'Con un parte enviado y otro pendiente la orden sigue En curso',
  (select status = 'en_curso' from public.work_orders where id = test.id('ot_fab')));

select test.err('parte', 'El estado no se puede forzar desde una petición manual',
  $$select public.validate_order(test.id('ot_fab'))$$, '42501');


\echo '== FOTOGRAFÍAS, FIRMA Y COMENTARIOS'
select test.ok('archivos', 'Puede subir a la carpeta de su orden',
  public.storage_can_upload('orders/' || test.id('ot_fab') || '/foto-1.jpg'));

select test.ok('archivos', 'No puede subir a la carpeta de una orden ajena',
  not public.storage_can_upload('orders/' || test.id('ot_ajena') || '/foto-1.jpg'));

select test.ok('archivos', 'No puede subir a las carpetas administrativas',
  not public.storage_can_upload('fichas/' || test.id('vis1') || '/x.pdf')
  and not public.storage_can_upload('projects/' || test.id('proy1') || '/planos.pdf'));

with x as (
  insert into public.documents (order_id, storage_path, file_name, mime_type,
                                size_bytes, category, uploaded_by)
  values (test.id('ot_fab'), 'orders/' || test.id('ot_fab') || '/foto-1.jpg',
          'foto-1.jpg', 'image/jpeg', 240000, 'foto', test.id('juan'))
  returning id)
select test.put('doc_foto', id) from x;

select test.ok('archivos', 'La fotografía queda guardada en la orden',
  (select count(*) = 1 from public.documents
    where order_id = test.id('ot_fab') and category = 'foto' and deleted_at is null));

insert into public.documents (order_id, storage_path, file_name, mime_type,
                              size_bytes, category, uploaded_by)
values (test.id('ot_fab'), 'orders/' || test.id('ot_fab') || '/firma.png',
        'firma.png', 'image/png', 18000, 'firma', test.id('juan'));

select test.ok('archivos', 'La firma del cliente se guarda como un archivo más',
  (select count(*) = 1 from public.documents
    where order_id = test.id('ot_fab') and category = 'firma'));

select test.err('archivos', 'No puede subir documentos administrativos a su orden',
  $$insert into public.documents (order_id, storage_path, file_name, size_bytes, category, uploaded_by)
    values (test.id('ot_fab'), 'orders/x/contrato.pdf', 'contrato.pdf', 100, 'documento', test.id('juan'))$$,
  '42501');

select test.err('archivos', 'No puede subir nada a nombre de otra persona',
  $$insert into public.documents (order_id, storage_path, file_name, size_bytes, category, uploaded_by)
    values (test.id('ot_fab'), 'orders/y/foto.jpg', 'foto.jpg', 100, 'foto', test.id('pedro'))$$,
  '42501');

select public.trash_document(test.id('doc_foto'));
select test.ok('archivos', 'Puede retirar una fotografía suya mientras la orden siga abierta',
  not exists (select 1 from public.documents where id = test.id('doc_foto')));

select test.err('archivos', 'No puede retirar un documento del proyecto',
  $$select public.trash_document(test.id('doc_proy'))$$, 'P0002');

insert into public.comments (order_id, author_id, body)
values (test.id('ot_fab'), test.id('juan'), 'Falta un taco; lo compro mañana.');

select test.ok('comentarios', 'Puede comentar en su orden',
  (select count(*) = 1 from public.comments where order_id = test.id('ot_fab')));

select test.err('comentarios', 'No puede comentar en una orden ajena',
  $$insert into public.comments (order_id, author_id, body)
    values (test.id('ot_ajena'), test.id('juan'), 'Cotilleando')$$, '42501');

select test.ok('comentarios', 'El comentario del trabajador avisa a administración',
  test.notifs(test.id('ot_fab'), 'comentario', test.id('salvi')) = 1
  and test.notifs(test.id('ot_fab'), 'comentario', test.id('juan')) = 0);


\echo '== PENDIENTE DE REVISIÓN'
select test.as_user(test.id('pedro'));
select public.save_order_part(test.id('ot_fab'), 'Preparados los barrotes cuadrados.', 6, true);

select test.ok('revision', 'Con todos los partes enviados la orden queda pendiente de revisión',
  (select status = 'realizada' and submitted_at is not null
     from public.work_orders where id = test.id('ot_fab')));

select test.ok('revision', 'El estado se lee en castellano como «Realizada · pendiente de revisión»',
  public.order_status_es('realizada') = 'Realizada · pendiente de revisión');

select test.ok('revision', 'Cada trabajador ve sus propias horas y solo las suyas',
  (select count(*) = 1 and sum(hours) = 6 from public.work_order_workers
    where order_id = test.id('ot_fab')));

select test.err('revision', 'Enviada la orden, el trabajador ya no puede modificarla',
  $$select public.save_order_part(test.id('ot_fab'), 'Cambio de última hora', 8)$$, '22023');

select test.ok('revision', 'Tampoco puede subir más fotografías',
  not public.storage_can_upload('orders/' || test.id('ot_fab') || '/tarde.jpg'));

select test.err('revision', 'Un trabajador no puede validar su propia orden',
  $$select public.validate_order(test.id('ot_fab'))$$, '42501');

select test.err('revision', 'Ni devolverla',
  $$select public.return_order(test.id('ot_fab'), 'me lo invento')$$, '42501');


\echo '== DEVOLUCIÓN CON MOTIVO'
reset role; set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('devolucion', 'Administración ve la orden pendiente de revisión con sus partes',
  (select count(*) = 2 from public.work_order_workers where order_id = test.id('ot_fab')));

select test.ok('devolucion', 'Administración suma las horas reales de toda la orden',
  (select horas_reales = 13.5 and trabajadores = 2 and partes_enviados = 2
     from public.order_hours where order_id = test.id('ot_fab')));

select test.ok('devolucion', 'La fotografía que retiró el trabajador está en la papelera',
  (select deleted_at is not null and deleted_by = test.id('juan')
     from public.documents where id = test.id('doc_foto')));

select test.err('devolucion', 'Una devolución sin motivo se rechaza',
  $$select public.return_order(test.id('ot_fab'), '   ')$$, '22023');

select public.return_order(test.id('ot_fab'), 'Faltan las fotografías de los marcos soldados.');

select test.ok('devolucion', 'La orden queda Devuelta con su motivo',
  (select status = 'devuelta' and return_reason like 'Faltan las fotografías%'
      and returned_at is not null
     from public.work_orders where id = test.id('ot_fab')));

select test.ok('devolucion', 'El motivo queda también como comentario',
  exists (select 1 from public.comments
           where order_id = test.id('ot_fab') and body like 'Orden devuelta. Motivo:%'));

select test.ok('devolucion', 'Los trabajadores reciben el aviso de la devolución',
  test.notifs(test.id('ot_fab'), 'devolucion') = 2);

select test.ok('devolucion', 'Los partes vuelven a estar abiertos',
  (select count(*) = 0 from public.work_order_workers
    where order_id = test.id('ot_fab') and submitted_at is not null));

select test.ok('devolucion', 'Una orden devuelta no se puede quedar sin motivo escrito',
  (select length(trim(return_reason)) > 0 from public.work_orders where id = test.id('ot_fab')));

-- El trabajador corrige: la orden vuelve a En curso
select test.as_user(test.id('juan'));
select test.ok('devolucion', 'Devuelta, el trabajador puede volver a trabajar en ella',
  public.worker_can_edit_order(test.id('ot_fab')));

select public.save_order_part(test.id('ot_fab'),
  'Cortada la pletina, soldados los marcos. Añadidas las fotografías.', 8, true);

select test.ok('devolucion', 'Con un parte pendiente la orden vuelve a En curso',
  (select status = 'en_curso' from public.work_orders where id = test.id('ot_fab')));

select test.as_user(test.id('pedro'));
select public.save_order_part(test.id('ot_fab'), 'Barrotes preparados y repasados.', 6, true);

select test.ok('devolucion', 'Reenviada por todos, vuelve a pendiente de revisión',
  (select status = 'realizada' from public.work_orders where id = test.id('ot_fab')));


\echo '== VALIDACIÓN'
reset role; set role authenticated; select test.as_user(test.id('salvi'));

select public.validate_order(test.id('ot_fab'));

select test.ok('validacion', 'La orden queda Validada con fecha y responsable',
  (select status = 'validada' and validated_at is not null and validated_by = test.id('salvi')
     from public.work_orders where id = test.id('ot_fab')));

select test.ok('validacion', 'Los trabajadores reciben el aviso de validación',
  test.notifs(test.id('ot_fab'), 'validacion') = 2);

select test.err('validacion', 'Una orden ya validada no se valida dos veces',
  $$select public.validate_order(test.id('ot_fab'))$$, '22023');

select test.err('validacion', 'Una orden pendiente no se puede validar',
  $$select public.validate_order(test.id('ot_futura'))$$, '22023');

select test.as_user(test.id('juan'));
select test.ok('validacion', 'Validada, el trabajador ya no puede tocarla',
  not public.worker_can_edit_order(test.id('ot_fab')));
select test.err('validacion', 'Ni rellenar el parte',
  $$select public.save_order_part(test.id('ot_fab'), 'Tarde', 1)$$, '22023');


\echo '== AVISOS INTERNOS'
select test.ok('avisos', 'Cada persona ve únicamente sus propios avisos',
  (select bool_and(user_id = test.id('juan')) from public.notifications));

select test.ok('avisos', 'Juan tiene avisos de asignación, devolución y validación',
  (select count(distinct kind) >= 3 from public.notifications));

select test.ok('avisos', 'Marcar como leídos solo afecta a los suyos',
  public.mark_notifications_read() > 0);

select test.ok('avisos', 'Después no le queda ninguno sin leer',
  (select count(*) = 0 from public.notifications where read_at is null));

reset role; set role authenticated; select test.as_user(test.id('salvi'));
select test.ok('avisos', 'Los avisos de los demás siguen sin leer',
  test.unread(test.id('pedro')) > 0 and test.unread(test.id('juan')) = 0);

select test.ok('avisos', 'No se envía ningún correo electrónico: los avisos son internos',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'notifications'
                 and column_name in ('email', 'sent_at', 'email_sent')));


\echo '== NO SE PUEDE FALSEAR EL ESTADO'
select test.err('seguridad_ot', 'Administración tampoco cambia el estado a mano',
  $$update public.work_orders set status = 'pendiente' where id = test.id('ot_fab')$$, '42501');

select test.err('seguridad_ot', 'Ni marcar una orden como validada por la puerta de atrás',
  $$update public.work_orders set validated_at = now() where id = test.id('ot_futura')$$, '42501');

select test.err('seguridad_ot', 'No se puede quitar a quien ya ha registrado trabajo',
  $$select public.assign_order_workers(test.id('ot_fab'), array[test.id('juan')])$$, '22023');

select test.ok('seguridad_ot', 'Las órdenes no se borran: se archivan',
  not has_table_privilege('authenticated', 'public.work_orders', 'delete'));

select test.ok('seguridad_ot', 'Los partes no se escriben directamente en la tabla',
  not has_table_privilege('authenticated', 'public.work_order_workers', 'insert')
  and not has_table_privilege('authenticated', 'public.work_order_workers', 'update'));

select test.ok('seguridad_ot', 'Los avisos no se escriben directamente en la tabla',
  not has_table_privilege('authenticated', 'public.notifications', 'insert')
  and not has_table_privilege('authenticated', 'public.notifications', 'update'));

reset role; set role anon; select test.as_anon();
select test.err('seguridad_ot', 'Sin sesión no se pueden leer las órdenes',
  'select * from public.work_orders', '42501');
select test.err('seguridad_ot', 'Sin sesión no se pueden leer los avisos',
  'select * from public.notifications', '42501');
select test.err('seguridad_ot', 'Sin sesión no se puede validar nada',
  $$select public.validate_order(test.id('ot_fab'))$$, '42501');
select test.err('seguridad_ot', 'Sin sesión no se puede rellenar un parte',
  $$select public.save_order_part(test.id('ot_fab'), 'x', 1)$$, '42501');


\echo '== HISTORIAL Y SUGERENCIAS'
reset role; set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('historial_ot', 'El historial registra la creación de la orden',
  exists (select 1 from public.audit_log
           where entity_code = test.note('ot_fab_code') and summary like '%creó la orden de fabricación%'));

select test.ok('historial_ot', 'Registra el envío del parte con sus horas',
  exists (select 1 from public.audit_log where summary like '%envió su parte de la orden%7,5 h%'));

select test.ok('historial_ot', 'Registra la devolución con el motivo',
  exists (select 1 from public.audit_log
           where summary like '%devolvió la orden%Motivo: Faltan las fotografías%'));

select test.ok('historial_ot', 'Registra la validación',
  exists (select 1 from public.audit_log where summary like '%validó la orden%'));

select test.ok('historial_ot', 'Las horas se escriben a la española',
  public.fmt_hours(7.5) = '7,5 h' and public.fmt_hours(8) = '8 h' and public.fmt_hours(10) = '10 h');

-- El proyecto proy1 está en preparación: se pasa a fabricación para ver la sugerencia
select public.change_project_phase(test.id('proy1'), 'fabricacion');
select test.ok('sugerencias_ot', 'Con la fabricación validada se sugiere pasar a Montaje',
  exists (select 1 from public.v_phase_suggestions
           where project_id = test.id('proy1') and suggested_phase = 'montaje'
             and message like '%órdenes de fabricación están validadas%'));

select test.ok('sugerencias_ot', 'El resumen de órdenes del proyecto cuenta las validadas',
  (select total = 2 and validadas = 1 and horas_previstas = 24
     from public.project_orders where project_id = test.id('proy1')));

select test.ok('sugerencias_ot', 'La sugerencia solo sugiere: la fase no ha cambiado sola',
  (select phase = 'fabricacion' from public.projects where id = test.id('proy1')));


\echo '== ARCHIVAR UNA ORDEN'
update public.work_orders set archived_at = now() where id = test.id('ot_futura');

select test.as_user(test.id('juan'));
select test.ok('archivar_ot', 'Una orden archivada desaparece para el trabajador',
  not exists (select 1 from public.work_orders where id = test.id('ot_futura')));
select test.ok('archivar_ot', 'Y deja de contar como proyecto visible si era la única',
  exists (select 1 from public.projects where id = test.id('proy1')));

reset role; set role authenticated; select test.as_user(test.id('salvi'));
select test.ok('archivar_ot', 'Administración la sigue viendo archivada',
  exists (select 1 from public.work_orders where id = test.id('ot_futura') and archived_at is not null));
update public.work_orders set archived_at = null where id = test.id('ot_futura');

reset role;
