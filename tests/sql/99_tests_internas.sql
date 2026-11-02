-- =====================================================================
-- METALPLAFER360 · GESTIONES INTERNAS
--
-- Lo que importa aquí:
--
--   · que esto sea de ADMINISTRACIÓN y de nadie más, y que un
--     trabajador no vea ni una fila aunque llame a la API por su cuenta;
--   · que las listas se creen, se renombren y NO se puedan borrar con
--     tarjetas dentro, ni activas ni archivadas;
--   · que una tarjeta se mueva de lista y se quede movida;
--   · que «hecha» y «archivada» sean DOS COSAS DISTINTAS;
--   · que archivar no borre nada y se pueda deshacer, incluso a otra
--     lista;
--   · que el checklist cuente lo que tiene que contar;
--   · que el evento del calendario sea un evento NORMAL de «Otros», que
--     salga en el calendario de todos, y que editarlo NO cree un
--     segundo;
--   · y que los eventos manuales de siempre sigan funcionando igual.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== INTERNAS · LAS TABLAS Y QUIÉN LAS TIENE CONCEDIDAS'

reset role; select test.as_server();

select test.ok('int_base', 'Las tres tablas del tablero existen',
  (select count(*) = 3 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('internal_lists', 'internal_tasks', 'internal_task_items')));

-- Sin esto, una consulta sin sesión devolvería una lista vacía en lugar
-- de un «no tienes permiso», y la diferencia importa.
select test.ok('int_base', 'Y a «anon» no se le ha concedido ninguna',
  not exists (select 1 from information_schema.role_table_grants
               where grantee = 'anon' and table_schema = 'public'
                 and table_name like 'internal_%'),
  (select coalesce(string_agg(distinct table_name, ', '), '(ninguna)')
     from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and table_name like 'internal_%'));

-- La regla de la casa: el único borrado abierto es el de la papelera.
select test.ok('int_base', 'Ninguna tabla nueva abre el borrado directo',
  not exists (select 1 from information_schema.role_table_grants
               where grantee = 'authenticated' and table_schema = 'public'
                 and table_name like 'internal_%' and privilege_type = 'DELETE'));

\echo '== INTERNAS · LAS LISTAS'

set role authenticated; select test.as_user(test.id('salvi'));

insert into public.internal_lists (id, name, position)
values ('a1111111-1111-1111-1111-111111111111', 'RRHH', 10),
       ('a2222222-2222-2222-2222-222222222222', 'MULTAS', 20)
on conflict (id) do nothing;

select test.ok('int_listas', 'Administración crea listas con el nombre que quiera',
  (select count(*) >= 2 from public.internal_lists));

update public.internal_lists set name = 'RECURSOS HUMANOS'
 where id = 'a1111111-1111-1111-1111-111111111111';

select test.ok('int_listas', 'Y las renombra',
  (select name from public.internal_lists
    where id = 'a1111111-1111-1111-1111-111111111111') = 'RECURSOS HUMANOS');

select test.err('int_listas', 'Una lista sin nombre no entra',
  $$ insert into public.internal_lists (name) values ('   ') $$, '23514');

-- Una lista vacía sí se puede borrar.
insert into public.internal_lists (id, name, position)
values ('a3333333-3333-3333-3333-333333333333', 'DE PRUEBA', 30)
on conflict (id) do nothing;
select public.delete_internal_list('a3333333-3333-3333-3333-333333333333');

select test.ok('int_listas', 'Una lista vacía se borra sin más',
  not exists (select 1 from public.internal_lists
               where id = 'a3333333-3333-3333-3333-333333333333'));

\echo '== INTERNAS · LAS TARJETAS'

insert into public.internal_tasks (id, list_id, title, position)
values ('b1111111-1111-1111-1111-111111111111',
        'a1111111-1111-1111-1111-111111111111', 'PEDIR ROPA', 10),
       ('b2222222-2222-2222-2222-222222222222',
        'a1111111-1111-1111-1111-111111111111', 'PAGO ASEPEYO', 20)
on conflict (id) do nothing;

select test.ok('int_tarjetas', 'Se crean tarjetas en una lista',
  (select count(*) = 2 from public.internal_tasks
    where list_id = 'a1111111-1111-1111-1111-111111111111'));

update public.internal_tasks set notes = 'Tallas: 2 M y 1 L'
 where id = 'b1111111-1111-1111-1111-111111111111';

select test.ok('int_tarjetas', 'Y se editan',
  (select notes from public.internal_tasks
    where id = 'b1111111-1111-1111-1111-111111111111') like '%2 M y 1 L%');

-- LO QUE IMPORTA: una lista con tarjetas NO se borra.
select test.err('int_tarjetas', 'Una lista con tarjetas dentro NO se puede borrar',
  $$ select public.delete_internal_list('a1111111-1111-1111-1111-111111111111') $$, '22023');

select test.ok('int_tarjetas', 'Y el intento no se ha llevado ninguna por delante',
  (select count(*) = 2 from public.internal_tasks
    where list_id = 'a1111111-1111-1111-1111-111111111111'));

\echo '== INTERNAS · MOVER DE LISTA'

select public.move_internal_task('b2222222-2222-2222-2222-222222222222',
                                 'a2222222-2222-2222-2222-222222222222');

select test.ok('int_mover', 'Una tarjeta se mueve a otra lista y se queda movida',
  (select list_id from public.internal_tasks
    where id = 'b2222222-2222-2222-2222-222222222222')
  = 'a2222222-2222-2222-2222-222222222222');

select test.err('int_mover', 'No se mueve a una lista que no existe',
  $$ select public.move_internal_task('b2222222-2222-2222-2222-222222222222',
       'a9999999-9999-9999-9999-999999999999') $$, 'P0002');

\echo '== INTERNAS · HECHA NO ES ARCHIVADA'

update public.internal_tasks set done = true, done_at = now()
 where id = 'b1111111-1111-1111-1111-111111111111';

select test.ok('int_hecha', 'Marcar como realizada NO la saca del tablero',
  (select done and archived_at is null from public.internal_tasks
    where id = 'b1111111-1111-1111-1111-111111111111'));

update public.internal_tasks set done = false, done_at = null
 where id = 'b1111111-1111-1111-1111-111111111111';

select test.ok('int_hecha', 'Y se puede desmarcar',
  (select not done and done_at is null from public.internal_tasks
    where id = 'b1111111-1111-1111-1111-111111111111'));

-- La base de datos no deja que el estado y la fecha se contradigan.
select test.err('int_hecha', 'Una tarjeta sin hacer no puede tener fecha de realización',
  $$ update public.internal_tasks set done_at = now()
      where id = 'b1111111-1111-1111-1111-111111111111' $$, '23514');

\echo '== INTERNAS · EL CHECKLIST'

insert into public.internal_task_items (id, task_id, text, position)
values ('c1111111-1111-1111-1111-111111111111',
        'b1111111-1111-1111-1111-111111111111', 'Pedir tallas', 10),
       ('c2222222-2222-2222-2222-222222222222',
        'b1111111-1111-1111-1111-111111111111', 'Confirmar pedido', 20)
on conflict (id) do nothing;

update public.internal_task_items set done = true
 where id = 'c1111111-1111-1111-1111-111111111111';

select test.ok('int_check', 'El tablero cuenta el progreso del checklist',
  (select checklist_hechos = 1 and checklist_total = 2 from public.internal_board
    where id = 'b1111111-1111-1111-1111-111111111111'),
  (select checklist_hechos || ' de ' || checklist_total from public.internal_board
    where id = 'b1111111-1111-1111-1111-111111111111'));

update public.internal_task_items set done = false
 where id = 'c1111111-1111-1111-1111-111111111111';

select test.ok('int_check', 'Y se puede desmarcar',
  (select checklist_hechos = 0 from public.internal_board
    where id = 'b1111111-1111-1111-1111-111111111111'));

select public.delete_internal_task_item('c2222222-2222-2222-2222-222222222222');

select test.ok('int_check', 'Un elemento del checklist se puede quitar',
  (select checklist_total = 1 from public.internal_board
    where id = 'b1111111-1111-1111-1111-111111111111'));

select test.err('int_check', 'Quitar algo que ya no está lo dice, no calla',
  $$ select public.delete_internal_task_item('c2222222-2222-2222-2222-222222222222') $$, 'P0002');

\echo '== INTERNAS · ARCHIVAR Y RECUPERAR'

select public.archive_internal_task('b1111111-1111-1111-1111-111111111111');

select test.ok('int_archivo', 'Archivar la saca del tablero',
  (select archived_at is not null from public.internal_tasks
    where id = 'b1111111-1111-1111-1111-111111111111'));

-- LO QUE IMPORTA: no se ha borrado nada. Ni la tarjeta ni su checklist.
select test.ok('int_archivo', 'Pero NO borra nada: la tarjeta y su checklist siguen enteros',
  (select count(*) = 1 from public.internal_tasks
    where id = 'b1111111-1111-1111-1111-111111111111')
  and (select count(*) = 1 from public.internal_task_items
        where task_id = 'b1111111-1111-1111-1111-111111111111'));

select test.ok('int_archivo', 'Y se sabe de qué lista venía',
  (select list_name from public.internal_board
    where id = 'b1111111-1111-1111-1111-111111111111') = 'RECURSOS HUMANOS');

-- Y tampoco deja borrar la lista: las archivadas son el histórico.
select test.err('int_archivo', 'Una lista con tarjetas ARCHIVADAS tampoco se borra',
  $$ select public.delete_internal_list('a1111111-1111-1111-1111-111111111111') $$, '22023');

-- Se devuelve a OTRA lista, que es lo que hace falta si la suya ya no sirve.
select public.restore_internal_task('b1111111-1111-1111-1111-111111111111',
                                    'a2222222-2222-2222-2222-222222222222');

select test.ok('int_archivo', 'Se recupera, y se puede elegir a qué lista vuelve',
  (select archived_at is null and list_id = 'a2222222-2222-2222-2222-222222222222'
     from public.internal_tasks where id = 'b1111111-1111-1111-1111-111111111111'));

select test.ok('int_archivo', 'Y vuelve con su checklist intacto',
  (select checklist_total = 1 from public.internal_board
    where id = 'b1111111-1111-1111-1111-111111111111'));

select test.err('int_archivo', 'Una tarjeta archivada no se mueve: primero se recupera',
  $$ select public.archive_internal_task('b2222222-2222-2222-2222-222222222222');
     select public.move_internal_task('b2222222-2222-2222-2222-222222222222',
       'a1111111-1111-1111-1111-111111111111') $$, '22023');

select public.restore_internal_task('b2222222-2222-2222-2222-222222222222');

\echo '== INTERNAS · EL EVENTO DEL CALENDARIO'

/*
  ESTO ES LO DELICADO DEL MÓDULO.

  Una tarjeta no inventa un tipo de evento: guarda el identificador de
  una nota normal de «calendar_notes», de las de «Otros». Se comprueba
  que el evento acaba EN EL CALENDARIO DE VERDAD, el que mira todo el
  mundo, y sobre todo que editarlo no crea un segundo.
*/
select test.setnote('int_notas_antes',
  (select count(*)::text from public.calendar_notes));

select public.set_internal_task_event('b1111111-1111-1111-1111-111111111111',
  public.today_madrid(), 'Recoger la ropa', 'En el almacén');

select test.ok('int_evento', 'La tarjeta queda con su evento',
  (select calendar_note_id is not null from public.internal_tasks
    where id = 'b1111111-1111-1111-1111-111111111111'));

select test.ok('int_evento', 'Y es un evento de «Otros», no un invento nuevo',
  exists (select 1 from public.v_calendar v
           join public.internal_tasks t on t.calendar_note_id = v.id
          where t.id = 'b1111111-1111-1111-1111-111111111111'
            and v.kind = 'otro' and v.title = 'Recoger la ropa'),
  (select coalesce(string_agg(v.kind || ':' || v.title, ', '), '(no sale)')
     from public.v_calendar v
     join public.internal_tasks t on t.calendar_note_id = v.id
    where t.id = 'b1111111-1111-1111-1111-111111111111'));

-- LO QUE IMPORTA: editar NO duplica.
select public.set_internal_task_event('b1111111-1111-1111-1111-111111111111',
  public.today_madrid() + 1, 'Recoger la ropa (cambio de día)', null);

select test.ok('int_evento', 'Editarlo NO crea un segundo evento',
  (select count(*)::text from public.calendar_notes)
  = (test.note('int_notas_antes')::int + 1)::text,
  (select count(*)::text || ' notas, antes había ' || test.note('int_notas_antes')
     from public.calendar_notes));

select test.ok('int_evento', 'Y el que hay se ha actualizado',
  exists (select 1 from public.calendar_notes n
           join public.internal_tasks t on t.calendar_note_id = n.id
          where t.id = 'b1111111-1111-1111-1111-111111111111'
            and n.title like '%cambio de día%' and n.day = public.today_madrid() + 1));

-- Archivar NO se lleva el evento por delante.
select public.archive_internal_task('b1111111-1111-1111-1111-111111111111');
select test.ok('int_evento', 'Archivar la tarjeta NO borra su evento del calendario',
  exists (select 1 from public.calendar_notes n
           join public.internal_tasks t on t.calendar_note_id = n.id
          where t.id = 'b1111111-1111-1111-1111-111111111111'));
select public.restore_internal_task('b1111111-1111-1111-1111-111111111111');

/*
  Y SI ALGUIEN BORRA EL EVENTO DESDE EL CALENDARIO.

  Es el caso que deja referencias rotas en cuanto te descuidas. Aquí no
  hace falta vigilarlo con un disparador: la clave ajena lleva
  «on delete set null», así que la tarjeta se queda sin evento y ya.
*/
select public.delete_calendar_note(
  (select calendar_note_id from public.internal_tasks
    where id = 'b1111111-1111-1111-1111-111111111111'));

select test.ok('int_evento', 'Borrar el evento desde el calendario no rompe la tarjeta',
  (select calendar_note_id is null from public.internal_tasks
    where id = 'b1111111-1111-1111-1111-111111111111'));

select test.ok('int_evento', 'Y la tarjeta sigue ahí, entera',
  (select title from public.internal_tasks
    where id = 'b1111111-1111-1111-1111-111111111111') = 'PEDIR ROPA');

-- Soltar el evento sin borrarlo del calendario.
select public.set_internal_task_event('b1111111-1111-1111-1111-111111111111',
  public.today_madrid(), 'Otra vez', null);
select test.setnote('int_nota_suelta',
  (select calendar_note_id::text from public.internal_tasks
    where id = 'b1111111-1111-1111-1111-111111111111'));
select public.set_internal_task_event('b1111111-1111-1111-1111-111111111111', null);

select test.ok('int_evento', 'Quitar el evento de la tarjeta lo deja en el calendario',
  (select calendar_note_id is null from public.internal_tasks
    where id = 'b1111111-1111-1111-1111-111111111111')
  and exists (select 1 from public.calendar_notes
               where id = test.note('int_nota_suelta')::uuid));

-- Y LOS EVENTOS MANUALES DE SIEMPRE, QUE NO SE HAN TOCADO.
select test.setnote('int_manual',
  (public.save_calendar_note(null, public.today_madrid(), 'Reunión de los lunes', null, null)).id::text);

select test.ok('int_evento', 'Los eventos manuales de siempre siguen funcionando igual',
  exists (select 1 from public.v_calendar
           where id = test.note('int_manual')::uuid and kind = 'otro'
             and title = 'Reunión de los lunes'));

select test.ok('int_evento', 'Y no se han convertido en tarjetas de nada',
  not exists (select 1 from public.internal_tasks
               where calendar_note_id = test.note('int_manual')::uuid));

\echo '== INTERNAS · QUIÉN PUEDE'

set role authenticated; select test.as_user(test.id('juan'));

-- Las políticas no dan error: ESCONDEN. Un trabajador ve cero filas.
select test.ok('int_permisos', 'Un trabajador no ve ni una lista',
  (select count(*) = 0 from public.internal_lists),
  (select count(*)::text from public.internal_lists));

select test.ok('int_permisos', 'Ni una tarjeta',
  (select count(*) = 0 from public.internal_tasks));

select test.ok('int_permisos', 'Ni el tablero',
  (select count(*) = 0 from public.internal_board));

select test.err('int_permisos', 'Ni puede crear listas',
  $$ insert into public.internal_lists (name) values ('MÍA') $$, '42501');

select test.err('int_permisos', 'Ni mover tarjetas',
  $$ select public.move_internal_task('b1111111-1111-1111-1111-111111111111',
       'a2222222-2222-2222-2222-222222222222') $$, '42501');

select test.err('int_permisos', 'Ni archivarlas',
  $$ select public.archive_internal_task('b1111111-1111-1111-1111-111111111111') $$, '42501');

select test.err('int_permisos', 'Ni ponerles fecha en el calendario de todos',
  $$ select public.set_internal_task_event('b1111111-1111-1111-1111-111111111111',
       public.today_madrid()) $$, '42501');

reset role; set role anon;
select test.err('int_permisos', 'Y sin sesión, nada de nada',
  'select count(*) from public.internal_tasks', '42501');

reset role; select test.as_server();

-- Y se comprueba desde fuera que el trabajador no cambió nada.
select test.ok('int_permisos', 'Después de todos esos intentos, el tablero está como estaba',
  (select count(*) = 2 from public.internal_lists)
  and (select count(*) = 2 from public.internal_tasks where archived_at is null),
  (select (select count(*) from public.internal_lists)::text || ' listas · '
       || (select count(*) from public.internal_tasks where archived_at is null)::text
       || ' tarjetas'));
