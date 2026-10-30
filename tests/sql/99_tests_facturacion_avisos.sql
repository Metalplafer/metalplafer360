-- =====================================================================
-- METALPLAFER360 · TERMINAR UN AVISO CON O SIN FACTURA
--
-- Lo que importa aquí:
--
--   · que se pueda terminar de las dos maneras, y que cada una deje el
--     aviso en el estado que le corresponde;
--   · que NO se pueda marcar como facturado algo que nadie dijo que
--     hubiera que facturar, que es la doble contabilización a evitar;
--   · que reabrir un aviso lo saque de la lista de pendientes de
--     facturar, sin que nadie tenga que acordarse;
--   · que un presupuesto o una visita no puedan usar esto;
--   · que los avisos de antes NO se conviertan en pendientes de facturar;
--   · y que el panel cuente exactamente los que esperan factura.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== FACTURACIÓN DE AVISOS · LA COLUMNA'

reset role; select test.as_server();

select test.ok('fav_base', 'El aviso tiene dónde guardar su situación de facturación',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'fichas'
             and column_name = 'billing_state'));

select test.ok('fav_base', 'Y solo admite las tres situaciones, o nada',
  public.valid_aviso_billing(null)
  and public.valid_aviso_billing('pendiente')
  and public.valid_aviso_billing('facturado')
  and public.valid_aviso_billing('sin_facturacion')
  and not public.valid_aviso_billing('cobrado'));

-- LO QUE IMPORTA DE LA MIGRACIÓN: los avisos que ya existían no se han
-- convertido en pendientes de facturar. Nadie sabe cuáles se facturaron.
select test.ok('fav_base', 'Ningún aviso antiguo se ha quedado esperando factura por su cuenta',
  not exists (select 1 from public.fichas
               where type = 'aviso' and billing_state is not null),
  (select count(*)::text from public.fichas
    where type = 'aviso' and billing_state is not null));

insert into public.fichas (id, type, status, client_id, title)
values ('44444444-4444-4444-4444-444444444444', 'aviso', 'pendiente',
        (select id from public.clients limit 1), 'Aviso de prueba de la facturación')
on conflict (id) do nothing;

\echo '== FACTURACIÓN DE AVISOS · LAS DOS MANERAS DE TERMINAR'

set role authenticated; select test.as_user(test.id('salvi'));

select public.set_aviso_billing('44444444-4444-4444-4444-444444444444', 'pendiente');

select test.ok('fav_terminar', 'Terminarlo pendiente de facturar lo deja en «realizado»',
  (select status = 'realizado' and billing_state = 'pendiente'
     from public.fichas where id = '44444444-4444-4444-4444-444444444444'),
  (select status || ' · ' || coalesce(billing_state, 'sin situación')
     from public.fichas where id = '44444444-4444-4444-4444-444444444444'));

select public.set_aviso_billing('44444444-4444-4444-4444-444444444444', 'sin_facturacion');

select test.ok('fav_terminar', 'Terminarlo sin factura lo deja CERRADO',
  (select status = 'cerrado' and billing_state = 'sin_facturacion'
     from public.fichas where id = '44444444-4444-4444-4444-444444444444'));

select test.ok('fav_terminar', 'Y así NO sale esperando factura',
  (select count(*) from public.fichas
    where type = 'aviso' and billing_state = 'pendiente') = 0);

\echo '== FACTURACIÓN DE AVISOS · EL TIC'

-- Desde «sin facturación» no se puede saltar a facturado: nadie dijo que
-- hubiera que facturarlo.
select test.err('fav_tic', 'No se factura lo que se dio por finalizado sin factura',
  $$ select public.set_aviso_billing('44444444-4444-4444-4444-444444444444', 'facturado') $$,
  '22023');

select public.set_aviso_billing('44444444-4444-4444-4444-444444444444', 'pendiente');
select public.set_aviso_billing('44444444-4444-4444-4444-444444444444', 'facturado');

select test.ok('fav_tic', 'Desde «pendiente» sí se marca facturado, y queda cerrado',
  (select status = 'cerrado' and billing_state = 'facturado'
     from public.fichas where id = '44444444-4444-4444-4444-444444444444'));

select test.ok('fav_tic', 'Y deja de contarse como pendiente de facturar',
  (select count(*) from public.fichas
    where type = 'aviso' and billing_state = 'pendiente') = 0);

-- Desmarcar: vuelve a «pendiente» y vuelve a salir en el panel. Es el
-- comportamiento elegido para cuando se anula una factura.
select public.set_aviso_billing('44444444-4444-4444-4444-444444444444', 'pendiente');

select test.ok('fav_tic', 'Desmarcar la factura lo devuelve a «realizado» y a la lista',
  (select status = 'realizado' and billing_state = 'pendiente'
     from public.fichas where id = '44444444-4444-4444-4444-444444444444'));

\echo '== FACTURACIÓN DE AVISOS · REABRIR'

-- LO QUE IMPORTA: si hay que volver a la obra, el aviso deja de esperar
-- factura solo. Si no, el panel pediría facturar algo sin terminar.
update public.fichas set status = 'en_curso'
 where id = '44444444-4444-4444-4444-444444444444';

select test.ok('fav_reabrir', 'Reabrir un aviso le quita la situación de facturación',
  (select billing_state is null from public.fichas
    where id = '44444444-4444-4444-4444-444444444444'),
  coalesce((select billing_state from public.fichas
             where id = '44444444-4444-4444-4444-444444444444'), 'vacía'));

select test.ok('fav_reabrir', 'Y el panel ya no lo cuenta',
  (select count(*) from public.fichas
    where type = 'aviso' and billing_state = 'pendiente') = 0);

\echo '== FACTURACIÓN DE AVISOS · SOLO AVISOS, Y SOLO ADMINISTRACIÓN'

/*
  Un presupuesto no se termina por aquí.

  OJO: el presupuesto se crea EN ESTE ARCHIVO y no se da por hecho que
  exista. Los archivos de prueba se ejecutan por orden alfabético, y
  «99_tests_facturacion_avisos» va antes que «99_tests_revision»: al
  apoyarse en la ficha del otro archivo, la primera versión de esta
  prueba recibía «no se encuentra el aviso» en vez de la negativa que
  venía a comprobar.
*/
reset role; select test.as_server();
insert into public.fichas (id, type, status, client_id, title)
values ('55555555-5555-5555-5555-555555555555', 'presupuesto', 'pendiente',
        (select id from public.clients limit 1), 'Presupuesto que no se factura por aquí')
on conflict (id) do nothing;
set role authenticated; select test.as_user(test.id('salvi'));

select test.err('fav_reglas', 'Un presupuesto no se termina por aquí',
  $$ select public.set_aviso_billing('55555555-5555-5555-5555-555555555555', 'pendiente') $$,
  '22023');

select test.err('fav_reglas', 'Ni una situación inventada',
  $$ select public.set_aviso_billing('44444444-4444-4444-4444-444444444444', 'cobradísimo') $$,
  '22023');

-- Y escribiendo a mano tampoco entra una situación en una visita.
-- La visita también se crea aquí, por lo mismo que el presupuesto.
reset role; select test.as_server();
insert into public.fichas (id, type, status, client_id, title, scheduled_date)
values ('66666666-6666-6666-6666-666666666666', 'visita', 'por_asignar',
        (select id from public.clients limit 1), 'Visita que no se factura',
        public.today_madrid())
on conflict (id) do nothing;

update public.fichas set billing_state = 'pendiente'
 where id = '66666666-6666-6666-6666-666666666666';

select test.ok('fav_reglas', 'Una visita no puede quedar pendiente de facturar',
  (select billing_state is null from public.fichas
    where id = '66666666-6666-6666-6666-666666666666'));

set role authenticated; select test.as_user(test.id('juan'));

select test.err('fav_permisos', 'Un trabajador no termina avisos por aquí',
  $$ select public.set_aviso_billing('44444444-4444-4444-4444-444444444444', 'pendiente') $$,
  '42501');

reset role; set role anon;
select test.err('fav_permisos', 'Y sin sesión, menos',
  $$ select public.set_aviso_billing('44444444-4444-4444-4444-444444444444', 'pendiente') $$,
  '42501');

\echo '== EL PANEL CUENTA LO QUE DEBE'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

select public.set_aviso_billing('44444444-4444-4444-4444-444444444444', 'pendiente');

select test.ok('fav_panel', 'El panel cuenta el aviso que espera factura',
  ((public.dashboard_summary(public.today_madrid() - 30, public.today_madrid())
    -> 'alertas' ->> 'avisos_por_facturar')::int) = 1,
  (public.dashboard_summary(public.today_madrid() - 30, public.today_madrid())
    -> 'alertas')::text);

select public.set_aviso_billing('44444444-4444-4444-4444-444444444444', 'facturado');

select test.ok('fav_panel', 'Y al facturarlo deja de contarlo',
  ((public.dashboard_summary(public.today_madrid() - 30, public.today_madrid())
    -> 'alertas' ->> 'avisos_por_facturar')::int) = 0);

-- MEJORA 4 · Las seis categorías están, y la que sobraba se ha ido.
select test.ok('fav_panel', 'El panel trae las seis categorías pedidas',
  (select bool_and((public.dashboard_summary(public.today_madrid() - 30, public.today_madrid())
                    -> 'alertas') ? k)
     from unnest(array['fichas_por_asignar', 'presupuestos_por_revisar',
                       'presupuestos_pendientes', 'presupuestos_pendientes_senal',
                       'avisos_taller', 'avisos_por_facturar']) k),
  (public.dashboard_summary(public.today_madrid() - 30, public.today_madrid())
    -> 'alertas')::text);

select test.ok('fav_panel', 'Y ya NO trae «presupuestos enviados esperando respuesta»',
  not ((public.dashboard_summary(public.today_madrid() - 30, public.today_madrid())
        -> 'alertas') ? 'presupuestos_enviados'));

reset role; select test.as_server();
