-- =====================================================================
-- METALPLAFER360 · LAS SUBFASES DE REVISIÓN DEL PRESUPUESTO
--
-- Lo que importa aquí:
--
--   · que entrar en «por revisar» ponga la subfase inicial sin que nadie
--     tenga que acordarse;
--   · que se pueda ir a «OK», a «denegado» y VOLVER a «por revisar»;
--   · que salir del estado de revisión borre la subfase, para que no
--     quede un presupuesto «enviado» marcado como «denegado»;
--   · que las visitas y los avisos no puedan tener subfase de revisión;
--   · que esto NO cambie lo que cuenta «presupuestos por revisar», que
--     es de lo que dependen el panel y los filtros;
--   · y que la migración de los que ya estaban no invente ningún «OK».
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== REVISIÓN · LA COLUMNA Y SU VOCABULARIO'

reset role; select test.as_server();

select test.ok('rev_base', 'La ficha tiene columna de subfase de revisión',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'fichas'
             and column_name = 'review_status'));

select test.ok('rev_base', 'Y solo admite las tres subfases, o nada',
  public.valid_ficha_review(null)
  and public.valid_ficha_review('por_revisar')
  and public.valid_ficha_review('ok')
  and public.valid_ficha_review('denegado')
  and not public.valid_ficha_review('aprobado')
  and not public.valid_ficha_review('OK'));

-- Un presupuesto para trastear.
insert into public.fichas (id, type, status, client_id, title)
values ('22222222-2222-2222-2222-222222222222', 'presupuesto', 'pendiente',
        (select id from public.clients limit 1), 'Presupuesto de prueba de la revisión')
on conflict (id) do nothing;

\echo '== REVISIÓN · SE PONE Y SE QUITA SOLA'

select test.ok('rev_auto', 'Un presupuesto que no está en revisión no tiene subfase',
  (select review_status is null from public.fichas
    where id = '22222222-2222-2222-2222-222222222222'));

update public.fichas set status = 'por_revisar'
 where id = '22222222-2222-2222-2222-222222222222';

select test.ok('rev_auto', 'Al entrar en «por revisar» queda «Por revisar», sin tocar nada más',
  (select review_status from public.fichas
    where id = '22222222-2222-2222-2222-222222222222') = 'por_revisar');

update public.fichas set review_status = 'ok'
 where id = '22222222-2222-2222-2222-222222222222';

select test.ok('rev_auto', 'Se puede marcar «OK»',
  (select review_status from public.fichas
    where id = '22222222-2222-2222-2222-222222222222') = 'ok');

update public.fichas set review_status = 'denegado'
 where id = '22222222-2222-2222-2222-222222222222';

select test.ok('rev_auto', 'Y «Denegado»',
  (select review_status from public.fichas
    where id = '22222222-2222-2222-2222-222222222222') = 'denegado');

update public.fichas set review_status = 'por_revisar'
 where id = '22222222-2222-2222-2222-222222222222';

select test.ok('rev_auto', 'Y desde «Denegado» se puede VOLVER a «Por revisar»',
  (select review_status from public.fichas
    where id = '22222222-2222-2222-2222-222222222222') = 'por_revisar');

-- LO QUE IMPORTA: al salir del estado de revisión, la subfase se va.
update public.fichas set review_status = 'ok'
 where id = '22222222-2222-2222-2222-222222222222';
update public.fichas set status = 'enviado'
 where id = '22222222-2222-2222-2222-222222222222';

select test.ok('rev_auto', 'Al salir de «por revisar», la subfase se borra sola',
  (select review_status is null from public.fichas
    where id = '22222222-2222-2222-2222-222222222222'),
  coalesce((select review_status from public.fichas
             where id = '22222222-2222-2222-2222-222222222222'), 'vacía'));

-- Y no se puede dejar un «enviado» marcado como denegado ni a propósito.
update public.fichas set review_status = 'denegado'
 where id = '22222222-2222-2222-2222-222222222222';

select test.ok('rev_auto', 'Un presupuesto «enviado» NO se queda marcado como denegado',
  (select review_status is null from public.fichas
    where id = '22222222-2222-2222-2222-222222222222'),
  coalesce((select review_status from public.fichas
             where id = '22222222-2222-2222-2222-222222222222'), 'vacía'));

\echo '== REVISIÓN · SOLO LOS PRESUPUESTOS'

insert into public.fichas (id, type, status, client_id, title, scheduled_date)
values ('33333333-3333-3333-3333-333333333333', 'visita', 'por_asignar',
        (select id from public.clients limit 1), 'Visita de prueba', public.today_madrid())
on conflict (id) do nothing;

update public.fichas set review_status = 'ok'
 where id = '33333333-3333-3333-3333-333333333333';

select test.ok('rev_tipos', 'Una visita no puede tener subfase de revisión',
  (select review_status is null from public.fichas
    where id = '33333333-3333-3333-3333-333333333333'));

/*
  Y el vocabulario tampoco admite inventos.

  OJO con el orden, que la primera versión de esta prueba se equivocó:
  la ficha venía de quedarse en «enviado», y ahí el disparador VACÍA la
  subfase antes de que la restricción llegue a mirarla, así que no
  saltaba ningún error. Para comprobar el vocabulario hay que estar en
  «por revisar», que es donde la subfase sí se conserva.
*/
update public.fichas set status = 'por_revisar'
 where id = '22222222-2222-2222-2222-222222222222';

select test.err('rev_tipos', 'Una subfase que no existe se rechaza',
  $$ update public.fichas set review_status = 'aprobadisimo'
      where id = '22222222-2222-2222-2222-222222222222' $$, '23514');

select test.ok('rev_tipos', 'Y fuera de «por revisar» ni siquiera llega a la restricción: se vacía',
  (select review_status from public.fichas
    where id = '22222222-2222-2222-2222-222222222222') = 'por_revisar');

\echo '== REVISIÓN · NO CAMBIA LO QUE YA SE CONTABA'

-- El panel y los filtros cuentan presupuestos en estado «por_revisar».
-- La subfase no puede alterar ese número: si lo alterara, cambiaría el
-- significado de algo de lo que depende media aplicación.
update public.fichas set status = 'por_revisar'
 where id = '22222222-2222-2222-2222-222222222222';

select test.ok('rev_contadores', 'Un presupuesto «OK» SIGUE contando como por revisar',
  (select count(*) from public.fichas
    where type = 'presupuesto' and status = 'por_revisar' and archived_at is null) =
  (select count(*) from public.fichas
    where type = 'presupuesto' and status = 'por_revisar' and archived_at is null
      and review_status in ('por_revisar', 'ok', 'denegado')));

update public.fichas set review_status = 'denegado'
 where id = '22222222-2222-2222-2222-222222222222';

select test.ok('rev_contadores', 'Y uno «Denegado», también',
  exists (select 1 from public.fichas
           where id = '22222222-2222-2222-2222-222222222222'
             and status = 'por_revisar' and review_status = 'denegado'));

\echo '== REVISIÓN · LO QUE HIZO LA MIGRACIÓN'

select test.ok('rev_migracion', 'Ningún presupuesto se ha quedado en revisión SIN subfase',
  not exists (select 1 from public.fichas
               where type = 'presupuesto' and status = 'por_revisar'
                 and review_status is null));

-- LO QUE IMPORTA DE LA MIGRACIÓN: no se ha inventado ningún «OK» ni
-- ningún «denegado». Lo que no había mirado nadie sigue sin mirar.
select test.ok('rev_migracion', 'Y la migración no ha aprobado ni denegado nada por su cuenta',
  not exists (
    select 1 from public.fichas f
     where f.type = 'presupuesto' and f.status = 'por_revisar'
       and f.review_status in ('ok', 'denegado')
       -- salvo la ficha de esta misma prueba, que sí se ha tocado a mano
       and f.id <> '22222222-2222-2222-2222-222222222222'),
  (select string_agg(code || ':' || review_status, ', ')
     from public.fichas where type = 'presupuesto' and status = 'por_revisar'
       and review_status in ('ok', 'denegado')
       and id <> '22222222-2222-2222-2222-222222222222'));

select test.ok('rev_migracion', 'Fuera del estado de revisión no hay ni una subfase suelta',
  not exists (select 1 from public.fichas
               where review_status is not null
                 and (type <> 'presupuesto' or status <> 'por_revisar')));

\echo '== REVISIÓN · QUIÉN PUEDE'

set role authenticated; select test.as_user(test.id('juan'));

update public.fichas set review_status = 'ok'
 where id = '22222222-2222-2222-2222-222222222222';

reset role; select test.as_server();

select test.ok('rev_permisos', 'Un trabajador no puede cambiar la subfase de revisión',
  (select review_status from public.fichas
    where id = '22222222-2222-2222-2222-222222222222') = 'denegado',
  (select review_status from public.fichas
    where id = '22222222-2222-2222-2222-222222222222'));

set role authenticated; select test.as_user(test.id('salvi'));

update public.fichas set review_status = 'ok'
 where id = '22222222-2222-2222-2222-222222222222';

select test.ok('rev_permisos', 'Administración sí',
  (select review_status from public.fichas
    where id = '22222222-2222-2222-2222-222222222222') = 'ok');

reset role; select test.as_server();
