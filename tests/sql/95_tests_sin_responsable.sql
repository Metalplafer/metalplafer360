-- =====================================================================
-- METALPLAFER360 · PRESUPUESTOS Y AVISOS SIN RESPONSABLE
--
-- Lo que importa aquí:
--   · que un presupuesto y un aviso NO nazcan ya en «Por asignar»;
--   · que una VISITA siga naciendo ahí, porque no se toca;
--   · que lo que mueve un aviso a «Asignado» sea repartirlo entre
--     operarios, y que NO lo haga retroceder si ya está en curso;
--   · que una ficha ANTIGUA en «Por asignar» siga funcionando: se puede
--     guardar, y si se le pone responsable avanza como antes;
--   · que el aviso del panel cuente solo las visitas, porque si contara
--     las tres clases se quedaría encendido para siempre;
--   · que la regla de las visitas del archivo 38 siga en pie.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== SIN RESPONSABLE · DÓNDE NACE CADA FICHA'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

with x as (insert into public.fichas (type, client_id, title, amount)
           values ('presupuesto', test.id('cli_laura'), 'Presupuesto sin responsable', 3200)
           returning id, status)
select test.put('sr_pres', (select id from x)),
       test.ok('sr_nace', 'Un presupuesto nace en «Pendiente», no en «Por asignar»',
         (select status = 'pendiente' from x));

with x as (insert into public.fichas (type, client_id, title)
           values ('aviso', test.id('cli_laura'), 'Aviso sin responsable')
           returning id, status)
select test.put('sr_aviso', (select id from x)),
       test.ok('sr_nace', 'Y un aviso también',
         (select status = 'pendiente' from x));

-- LAS VISITAS NO SE TOCAN.
with x as (insert into public.fichas (type, title, address)
           values ('visita', 'Visita sin asignar', 'Carrer Nou, 3')
           returning id, status)
select test.put('sr_visita', (select id from x)),
       test.ok('sr_nace', 'Una VISITA sigue naciendo en «Por asignar»',
         (select status = 'por_asignar' from x));

-- Y el disparador sigue mandando sobre lo que venga en el insert.
with x as (insert into public.fichas (type, client_id, title, status)
           values ('presupuesto', test.id('cli_laura'), 'Con estado pedido', 'aceptado')
           returning id, status)
select test.put('sr_pedido', (select id from x)),
       test.ok('sr_nace', 'Pedir un estado al crear no sirve: lo decide el disparador',
         (select status = 'pendiente' from x));


\echo '== SIN RESPONSABLE · QUÉ MUEVE UN AVISO A «ASIGNADO»'

select test.ok('sr_aviso', 'Recién creado, el aviso no tiene equipo',
  (select count(*) = 0 from public.ficha_workers where ficha_id = test.id('sr_aviso')));

select public.assign_ficha_workers(test.id('sr_aviso'), array[test.id('juan')]::uuid[]);

select test.ok('sr_aviso', 'Repartirlo entre operarios lo pone «Asignado»',
  (select status = 'asignado' from public.fichas where id = test.id('sr_aviso')));

select test.ok('sr_aviso', 'Y sin tocar el responsable administrativo, que sigue vacío',
  (select assigned_to is null from public.fichas where id = test.id('sr_aviso')));

-- LO QUE NO PUEDE PASAR: que cambiar el equipo haga RETROCEDER un aviso
-- que ya está en marcha. Sería perder el estado real del trabajo.
update public.fichas set status = 'en_curso' where id = test.id('sr_aviso');
select public.assign_ficha_workers(test.id('sr_aviso'),
  array[test.id('juan'), test.id('pedro')]::uuid[]);

select test.ok('sr_aviso', 'Un aviso EN CURSO no retrocede al cambiar el equipo',
  (select status = 'en_curso' from public.fichas where id = test.id('sr_aviso')));

update public.fichas set status = 'cerrado' where id = test.id('sr_aviso');
select public.assign_ficha_workers(test.id('sr_aviso'), array[test.id('pedro')]::uuid[]);
select test.ok('sr_aviso', 'Ni uno CERRADO',
  (select status = 'cerrado' from public.fichas where id = test.id('sr_aviso')));

-- Y vaciar el equipo tampoco mueve el estado: quitar a la gente de un
-- trabajo hecho no lo deshace.
select public.assign_ficha_workers(test.id('sr_aviso'), '{}'::uuid[]);
select test.ok('sr_aviso', 'Vaciar el equipo no cambia el estado del aviso',
  (select status = 'cerrado' from public.fichas where id = test.id('sr_aviso')));


\echo '== SIN RESPONSABLE · LAS VISITAS SIGUEN COMO ESTABAN'

update public.fichas set assigned_to = test.id('salvi') where id = test.id('sr_visita');
select test.ok('sr_visita', 'Al poner quién la hace, la visita pasa a «Asignada»',
  (select status = 'asignada' from public.fichas where id = test.id('sr_visita')));

-- La regla del archivo 38 no se ha caído por el camino.
select test.err('sr_visita', 'Y una visita sigue sin poder darse a un trabajador',
  format($$update public.fichas set assigned_to = %L where id = %L$$,
         test.id('juan'), test.id('sr_visita')), '22023');


\echo '== SIN RESPONSABLE · LAS FICHAS ANTIGUAS SIGUEN FUNCIONANDO'

-- Así son las que hay en producción: en «Por asignar» porque nacieron
-- antes del cambio. Lo que NO puede pasar es que dejen de poder
-- guardarse.
reset role; select test.as_server();
select set_config('app.restoring', 'on', false);
with v as (insert into public.fichas (type, client_id, title, status, amount)
           values ('presupuesto', test.id('cli_laura'), 'Presupuesto heredado',
                   'por_asignar', 1800) returning id)
select test.put('sr_viejo', (select id from v));
with v as (insert into public.fichas (type, client_id, title, status)
           values ('aviso', test.id('cli_laura'), 'Aviso heredado', 'por_asignar')
           returning id)
select test.put('sr_viejo_aviso', (select id from v));
-- Y uno MÁS que se queda quieto en «Por asignar» hasta el final: es lo
-- que hace que la cifra del panel signifique algo. Sin él, la
-- comprobación de abajo pasaría por no haber ninguna ficha que contar.
with v as (insert into public.fichas (type, client_id, title, status, amount)
           values ('presupuesto', test.id('cli_laura'), 'Heredado que no se toca',
                   'por_asignar', 900) returning id)
select test.put('sr_quieto', (select id from v));
select set_config('app.restoring', '', false);

select test.ok('sr_viejo', 'Una ficha heredada conserva su estado «Por asignar»',
  (select status = 'por_asignar' from public.fichas where id = test.id('sr_viejo')));

set role authenticated; select test.as_user(test.id('salvi'));

-- LA COMPROBACIÓN IMPORTANTE: se la puede seguir guardando. Si se
-- hubiera quitado «por_asignar» del catálogo, esto fallaría aunque nadie
-- le cambiara el estado.
update public.fichas set description = 'Se puede seguir editando.'
 where id = test.id('sr_viejo');
select test.ok('sr_viejo', 'Y se la puede seguir editando sin que salte la restricción',
  (select description = 'Se puede seguir editando.'
     from public.fichas where id = test.id('sr_viejo')));

-- Y si alguien le pone responsable, avanza como antes.
update public.fichas set assigned_to = test.id('salvi') where id = test.id('sr_viejo');
select test.ok('sr_viejo', 'Al ponerle responsable avanza a «Pendiente», como antes',
  (select status = 'pendiente' from public.fichas where id = test.id('sr_viejo')));

update public.fichas set assigned_to = test.id('juan') where id = test.id('sr_viejo_aviso');
select test.ok('sr_viejo', 'Y un aviso heredado avanza a «Asignado»',
  (select status = 'asignado' from public.fichas where id = test.id('sr_viejo_aviso')));

select test.ok('sr_viejo', 'El historial sigue sabiendo traducir «Por asignar»',
  public.label_es('por_asignar') = 'Por asignar');


\echo '== SIN RESPONSABLE · LOS AVISOS DEL PANEL'

select test.setnote('sr_panel',
  public.dashboard_summary(public.today_madrid() - 400, public.today_madrid())::text);

select test.ok('sr_panel', 'El aviso de «por asignar» cuenta SOLO las visitas',
  (test.note('sr_panel')::jsonb -> 'alertas' ->> 'fichas_por_asignar')::int
    = (select count(*) from public.fichas
        where archived_at is null and type = 'visita' and status = 'por_asignar'),
  test.note('sr_panel')::jsonb -> 'alertas' #>> '{}');

-- Y la prueba que lo hace valer: hay fichas que NO son visitas en «Por
-- asignar», así que si contara las tres clases la cifra sería otra.
select test.ok('sr_panel', 'Y hay fichas que no son visitas en ese estado, así que la cifra importa',
  (select count(*) > 0 from public.fichas
    where archived_at is null and type <> 'visita' and status = 'por_asignar'),
  (select string_agg(code, ', ') from public.fichas
    where archived_at is null and type <> 'visita' and status = 'por_asignar'));

select test.ok('sr_panel', 'La ficha heredada que nadie ha tocado sigue en «Por asignar»',
  (select status = 'por_asignar' from public.fichas where id = test.id('sr_quieto')));

select test.ok('sr_panel', 'El panel avisa de los presupuestos pendientes de paga y señal',
  (test.note('sr_panel')::jsonb -> 'alertas') ? 'presupuestos_pendientes_senal');

update public.fichas set status = 'enviado' where id = test.id('sr_pres');
update public.fichas set status = 'pendiente_senal' where id = test.id('sr_pres');
select test.setnote('sr_panel2',
  public.dashboard_summary(public.today_madrid() - 400, public.today_madrid())::text);

select test.ok('sr_panel', 'Y la cifra sube al dejar uno pendiente de señal',
  (test.note('sr_panel2')::jsonb -> 'alertas' ->> 'presupuestos_pendientes_senal')::int
    > (test.note('sr_panel')::jsonb -> 'alertas' ->> 'presupuestos_pendientes_senal')::int,
  test.note('sr_panel2')::jsonb -> 'alertas' ->> 'presupuestos_pendientes_senal');

/*
  Esta prueba comprobaba que el presupuesto pendiente de señal no se
  contara ADEMÁS como «enviado esperando respuesta». Desde la mejora 4
  esa categoría ya no existe: se retiró del panel porque un presupuesto
  enviado espera al cliente, no a nosotros.

  Así que lo que se comprueba ahora es más fuerte: que la categoría ha
  desaparecido del todo. Si alguien la devolviera, esto lo diría.
*/
select test.ok('sr_panel', 'La categoría «enviados esperando respuesta» ya no está en el panel',
  not ((test.note('sr_panel2')::jsonb -> 'alertas') ? 'presupuestos_enviados'),
  test.note('sr_panel2')::jsonb -> 'alertas' ->> 'presupuestos_enviados');

reset role; select test.as_server();
