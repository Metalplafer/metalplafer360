-- =====================================================================
-- METALPLAFER360 · MENCIONAR A ALGUIEN CON @
--
-- Lo que importa aquí:
--   · que mencionar a alguien le AVISE, y que el aviso lo escriba el
--     servidor al guardar el comentario, no la pantalla;
--   · que un comentario CON menciones NO avise además a todo el mundo,
--     que es lo que haría el aviso inútil;
--   · que un comentario SIN menciones se comporte exactamente como
--     antes: eso es lo que no se puede romper;
--   · que solo se pueda mencionar a quien PUEDE VER el comentario, y que
--     lo compruebe la base de datos y no la lista que enseña la
--     pantalla;
--   · que nadie se mencione a sí mismo ni se avise de lo que acaba de
--     escribir;
--   · que el texto del comentario se quede tal cual, con su «@Nombre»
--     legible dentro.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== MENCIONES · EL TERRENO'

reset role; select test.as_server();

-- Un proyecto con Juan dentro y Pedro FUERA. Pedro es el que no debe
-- poder ser mencionado ahí, y es lo que hace que la prueba signifique
-- algo.
with p as (insert into public.projects
             (client_id, name, description, budget_hours_fab, budget_hours_mont)
           values (test.id('cli_laura'), 'Proyecto de las menciones',
                   'Para probar el @.', 10, 5)
           returning id)
select test.put('mn_proy', (select id from p));

set role authenticated; select test.as_user(test.id('salvi'));
select public.assign_project_workers(test.id('mn_proy'), array[test.id('juan')]::uuid[]);

select test.ok('mn_terreno', 'Juan está en el proyecto y Pedro no',
  (select count(*) = 1 and bool_and(worker_id = test.id('juan'))
     from public.project_workers where project_id = test.id('mn_proy')));


\echo '== MENCIONES · UN COMENTARIO SIN MENCIONES SE COMPORTA COMO ANTES'

-- Esto es lo que no se puede romper: el camino de siempre.
reset role; select test.as_server();
delete from public.notifications where user_id = test.id('juan');
set role authenticated; select test.as_user(test.id('salvi'));

select test.put('mn_normal', (public.post_comment(
  'Comentario de los de siempre, sin mencionar a nadie.',
  null, test.id('mn_proy'))).id);

select test.ok('mn_normal', 'El comentario se guarda',
  (select body = 'Comentario de los de siempre, sin mencionar a nadie.'
     from public.comments where id = test.id('mn_normal')));

select test.ok('mn_normal', 'Con su autor',
  (select author_id = test.id('salvi') from public.comments where id = test.id('mn_normal')));

select test.ok('mn_normal', 'Y no guarda ninguna mención',
  (select count(*) = 0 from public.comment_mentions
    where comment_id = test.id('mn_normal')));

-- EL AVISO DE SIEMPRE: a los asignados al proyecto.
--
-- Se mira DESDE EL SERVIDOR porque los avisos son de cada uno: la
-- política de «notifications» solo deja ver los propios, así que un
-- administrador no ve los de Juan ni siendo administrador.
reset role; select test.as_server();
select test.ok('mn_normal', 'Y avisa a los asignados al proyecto, como antes',
  (select count(*) = 1 from public.notifications
    where user_id = test.id('juan') and kind = 'comentario'
      and title like 'Comentario en PROY%'),
  (select coalesce(string_agg(title, ' | '), 'NINGUNO')
     from public.notifications where user_id = test.id('juan')));
set role authenticated; select test.as_user(test.id('salvi'));


\echo '== MENCIONES · MENCIONAR A ALGUIEN LE AVISA'

reset role; select test.as_server();
delete from public.notifications where user_id in (test.id('juan'), test.id('salvi'));
set role authenticated; select test.as_user(test.id('salvi'));

select test.put('mn_con', (public.post_comment(
  '@Juan Ortega ¿puedes mirar las medidas del tramo de arriba?',
  null, test.id('mn_proy'), null, null, null, null,
  array[test.id('juan')]::uuid[])).id);

select test.ok('mn_aviso', 'La mención se guarda',
  (select count(*) = 1 and bool_and(user_id = test.id('juan'))
     from public.comment_mentions where comment_id = test.id('mn_con')));

-- EL TEXTO NO SE TOCA: el «@Nombre Apellido» se queda legible dentro.
select test.ok('mn_aviso', 'El texto conserva el «@Nombre Apellido» tal cual',
  (select body = '@Juan Ortega ¿puedes mirar las medidas del tramo de arriba?'
     from public.comments where id = test.id('mn_con')),
  (select body from public.comments where id = test.id('mn_con')));

reset role; select test.as_server();

select test.ok('mn_aviso', 'Al mencionado le llega un aviso que dice quién le ha mencionado',
  (select count(*) = 1 from public.notifications
    where user_id = test.id('juan') and kind = 'comentario'
      and title like '%te ha mencionado%'),
  (select coalesce(string_agg(title, ' | '), 'NINGUNO')
     from public.notifications where user_id = test.id('juan')));

select test.ok('mn_aviso', 'Y el aviso dice quién y dónde',
  (select bool_and(title like 'Salvi te ha mencionado en PROY-%')
     from public.notifications
    where user_id = test.id('juan') and title like '%te ha mencionado%'),
  (select string_agg(title, ' | ') from public.notifications
    where user_id = test.id('juan') and title like '%te ha mencionado%'));

select test.ok('mn_aviso', 'Y el cuerpo del aviso lleva el comentario',
  (select bool_and(body like '%medidas del tramo de arriba%') from public.notifications
    where user_id = test.id('juan') and title like '%te ha mencionado%'),
  (select string_agg(coalesce(body, 'SIN CUERPO'), ' | ') from public.notifications
    where user_id = test.id('juan') and title like '%te ha mencionado%'));

-- LA COMPROBACIÓN QUE HACE ÚTIL EL AVISO: no se manda ADEMÁS el aviso
-- general. Si llegaran los dos, el de la mención se perdería entre el
-- ruido y la gente dejaría de mirarlos.
select test.ok('mn_aviso', 'Y NO le llega además el aviso general del comentario',
  (select count(*) = 1 from public.notifications where user_id = test.id('juan')),
  (select string_agg(title, ' | ') from public.notifications where user_id = test.id('juan')));

-- Quien escribe no se avisa a sí mismo.
select test.ok('mn_aviso', 'Quien escribe no recibe aviso de su propio comentario',
  (select count(*) = 0 from public.notifications where user_id = test.id('salvi')),
  (select coalesce(string_agg(title, ' | '), 'NINGUNO')
     from public.notifications where user_id = test.id('salvi')));

set role authenticated; select test.as_user(test.id('salvi'));


\echo '== MENCIONES · A QUIÉN SE PUEDE MENCIONAR'

select test.ok('mn_quien', 'La lista de candidatos trae a quien está en el proyecto',
  (select count(*) > 0 from public.comment_mention_candidates(null, test.id('mn_proy'))
    where id = test.id('juan')),
  (select string_agg(full_name, ', ')
     from public.comment_mention_candidates(null, test.id('mn_proy'))));

select test.ok('mn_quien', 'Pero NO a un trabajador que no está en el proyecto',
  (select count(*) = 0 from public.comment_mention_candidates(null, test.id('mn_proy'))
    where id = test.id('pedro')),
  (select string_agg(full_name, ', ')
     from public.comment_mention_candidates(null, test.id('mn_proy'))));

select test.ok('mn_quien', 'Ni a uno mismo',
  (select count(*) = 0 from public.comment_mention_candidates(null, test.id('mn_proy'))
    where id = test.id('salvi')));

-- Y LO QUE DE VERDAD PROTEGE: que no depende de la lista que enseña la
-- pantalla. Aunque se pida a mano, la base de datos se niega.
select test.err('mn_quien', 'Mencionar a quien no puede ver el comentario se rechaza',
  format($$select public.post_comment('@Pedro Navarro mira esto', null, %L,
                                      null, null, null, null, array[%L]::uuid[])$$,
         test.id('mn_proy'), test.id('pedro')), '42501');

select test.ok('mn_quien', 'Y ese comentario no se guarda a medias',
  (select count(*) = 0 from public.comments
    where project_id = test.id('mn_proy') and body like '%Pedro Navarro%'));

reset role; select test.as_server();
-- Pedro tiene avisos de otras pruebas; lo que NO puede tener es uno de
-- mención, porque el comentario que lo mencionaba fue rechazado.
select test.ok('mn_quien', 'Ni le llega ningún aviso de mención a quien no tocaba',
  (select count(*) = 0 from public.notifications
    where user_id = test.id('pedro') and title like '%te ha mencionado%'),
  (select coalesce(string_agg(title, ' | '), 'NINGUNO')
     from public.notifications where user_id = test.id('pedro')));
set role authenticated; select test.as_user(test.id('salvi'));

select test.err('mn_quien', 'Mencionar a alguien inventado tampoco',
  format($$select public.post_comment('Hola', null, %L,
                                      null, null, null, null, array[%L]::uuid[])$$,
         test.id('mn_proy'), '00000000-0000-0000-0000-000000000009'), '42501');


\echo '== MENCIONES · UN TRABAJADOR MENCIONA'

set role authenticated; select test.as_user(test.id('juan'));

reset role; select test.as_server();
delete from public.notifications where user_id = test.id('salvi');
set role authenticated; select test.as_user(test.id('juan'));

select test.ok('mn_juan', 'Un trabajador ve a quién puede mencionar en SU proyecto',
  (select count(*) > 0 from public.comment_mention_candidates(null, test.id('mn_proy'))),
  (select string_agg(full_name, ', ')
     from public.comment_mention_candidates(null, test.id('mn_proy'))));

-- Y la administración está en la lista, que es a quien se le pregunta.
-- Se comprueba desde Juan porque desde la propia administración no
-- saldría: nadie se menciona a sí mismo.
select test.ok('mn_juan', 'Y la administración está entre quienes puede mencionar',
  (select count(*) > 0 from public.comment_mention_candidates(null, test.id('mn_proy'))
    where role = 'admin'),
  (select string_agg(full_name||'/'||role::text, ', ')
     from public.comment_mention_candidates(null, test.id('mn_proy'))));

-- Y NO sale un compañero que no está en el proyecto.
select test.ok('mn_juan', 'Pero no un compañero que no está en el proyecto',
  (select count(*) = 0 from public.comment_mention_candidates(null, test.id('mn_proy'))
    where id = test.id('pedro')),
  (select string_agg(full_name, ', ')
     from public.comment_mention_candidates(null, test.id('mn_proy'))));

select test.put('mn_dejuan', (public.post_comment(
  '@Salvi Plaza las medidas no cuadran con el plano.',
  null, test.id('mn_proy'), null, null, null, null,
  array[test.id('salvi')]::uuid[])).id);

select test.ok('mn_juan', 'Y puede mencionar a administración',
  (select count(*) = 1 from public.comment_mentions
    where comment_id = test.id('mn_dejuan') and user_id = test.id('salvi')));

reset role; select test.as_server();
select test.ok('mn_juan', 'Que recibe el aviso de la mención',
  (select count(*) = 1 from public.notifications
    where user_id = test.id('salvi') and title like 'Juan Ortega te ha mencionado en PROY-%'),
  (select coalesce(string_agg(title, ' | '), 'NINGUNO')
     from public.notifications where user_id = test.id('salvi')));
set role authenticated; select test.as_user(test.id('juan'));

-- Y NO puede comentar donde no está asignado.
reset role; select test.as_server();
with p as (insert into public.projects
             (client_id, name, budget_hours_fab, budget_hours_mont)
           values (test.id('cli_laura'), 'Proyecto ajeno a Juan', 4, 2)
           returning id)
select test.put('mn_ajeno', (select id from p));
set role authenticated; select test.as_user(test.id('juan'));

select test.err('mn_juan', 'No puede comentar en un proyecto que no es suyo',
  format($$select public.post_comment('Me cuelo', null, %L)$$, test.id('mn_ajeno')), '42501');

select test.ok('mn_juan', 'Y no recibe ningún nombre para mencionar ahí',
  (select count(*) = 0 from public.comment_mention_candidates(null, test.id('mn_ajeno'))),
  (select string_agg(full_name, ', ')
     from public.comment_mention_candidates(null, test.id('mn_ajeno'))));

-- LAS MENCIONES DE UN COMENTARIO QUE NO LE TOCA.
--
-- Hace falta un comentario que Juan NO pueda leer, y con una mención
-- dentro. Se escribe en el proyecto ajeno, mencionando a Montse, que
-- tampoco está en el proyecto de Juan.
reset role; select test.as_server();
select set_config('app.restoring', 'on', false);
with c as (insert into public.comments (project_id, author_id, body)
           values (test.id('mn_ajeno'), test.id('salvi'), '@Montse Grau Roca mira esto.')
           returning id)
select test.put('mn_oculto', (select id from c));
insert into public.comment_mentions (comment_id, user_id)
values (test.id('mn_oculto'), test.id('montse'));
select set_config('app.restoring', '', false);

set role authenticated; select test.as_user(test.id('juan'));

select test.ok('mn_juan', 'Ni ve las menciones de un comentario que no puede leer',
  (select count(*) = 0 from public.comment_mentions
    where comment_id = test.id('mn_oculto')),
  (select count(*)::text from public.comment_mentions
    where comment_id = test.id('mn_oculto')));

-- Y la que lo hace valer: la mención EXISTE, así que si la política se
-- relajara la vería.
reset role; select test.as_server();
select test.ok('mn_juan', 'Y esa mención existe de verdad, vista desde el servidor',
  (select count(*) = 1 from public.comment_mentions
    where comment_id = test.id('mn_oculto')));

-- Pero el mencionado SÍ la ve, que es lo que necesita para saber que le
-- han llamado.
set role authenticated; select test.as_user(test.id('montse'));
select test.ok('mn_juan', 'El mencionado sí ve su propia mención',
  (select count(*) = 1 from public.comment_mentions
    where comment_id = test.id('mn_oculto') and user_id = test.id('montse')));

set role authenticated; select test.as_user(test.id('juan'));


-- UNA OBRA ES SOLO DE ADMINISTRACIÓN, y por el camino nuevo también.
-- La regla de «can_comment_on» repite la de la política de inserción,
-- donde las obras no aparecen: así que solo pasa por «is_admin()».
--
-- Se crea una obra PROPIA: las de otros archivos de prueba se borran por
-- el camino, y apoyarse en ellas hace que la prueba falle por el motivo
-- equivocado. Ya pasó aquí mismo.
set role authenticated; select test.as_user(test.id('salvi'));
select test.put('mn_obra_sitio', (select id from public.save_work(
  null, 'Obra de las menciones', test.id('cli_laura'),
  'Carrer Nou, 3', 'Para probar quién puede comentar en una obra.', null)));

set role authenticated; select test.as_user(test.id('juan'));
select test.err('mn_juan', 'Y no puede comentar en una obra: eso es de administración',
  format($$select public.post_comment('Hola', null, null, null, null, %L)$$,
         test.id('mn_obra_sitio')), '42501');

select test.ok('mn_juan', 'Ni recibe nombres para mencionar en una obra',
  (select count(*) = 0 from public.comment_mention_candidates(
                            null, null, null, null, test.id('mn_obra_sitio'))));

set role authenticated; select test.as_user(test.id('salvi'));
select test.put('mn_obra', (public.post_comment(
  'Comentario de administración en la obra.',
  null, null, null, null, test.id('mn_obra_sitio'))).id);

select test.ok('mn_juan', 'Pero administración sí, y queda colgado de la obra',
  (select work_id = test.id('mn_obra_sitio') from public.comments where id = test.id('mn_obra')));

set role authenticated; select test.as_user(test.id('juan'));


\echo '== MENCIONES · UN COMENTARIO CUELGA DE UNA SOLA COSA'

set role authenticated; select test.as_user(test.id('salvi'));

select test.err('mn_forma', 'Un comentario sin nada de lo que colgar se rechaza',
  $$select public.post_comment('Suelto')$$, '22023');

select test.err('mn_forma', 'Y uno que cuelga de dos cosas a la vez, también',
  format($$select public.post_comment('De dos sitios', %L, %L)$$,
         test.id('aud_pres'), test.id('mn_proy')), '22023');

select test.err('mn_forma', 'Un comentario en blanco no se guarda',
  format($$select public.post_comment('   ', null, %L)$$, test.id('mn_proy')), '22023');

select test.err('mn_forma', 'Ni uno de más de 4.000 caracteres',
  format($$select public.post_comment(%L, null, %L)$$,
         repeat('x', 4001), test.id('mn_proy')), '22023');


\echo '== MENCIONES · NO SE ESCRIBEN A MANO'

select test.err('mn_mano', 'Nadie inserta menciones saltándose la función',
  format($$insert into public.comment_mentions (comment_id, user_id) values (%L, %L)$$,
         test.id('mn_normal'), test.id('pedro')), '42501');

select test.err('mn_mano', 'Ni las borra',
  format($$delete from public.comment_mentions where comment_id = %L$$,
         test.id('mn_con')), '42501');

select test.ok('mn_mano', 'El público anónimo no alcanza la tabla',
  not has_table_privilege('anon', 'public.comment_mentions', 'SELECT'));


\echo '== MENCIONES · EL AVISO DE LAS MENCIONES NO SE QUEDA PEGADO'

-- «post_comment» marca la transacción para que el disparador no avise a
-- todo el mundo, y lo SUELTA al terminar. Si no lo soltara, un segundo
-- comentario escrito en la misma transacción se quedaría sin avisar a
-- nadie, y nadie entendería por qué.
reset role; select test.as_server();
delete from public.notifications where user_id = test.id('juan');
set role authenticated; select test.as_user(test.id('salvi'));

begin;
select public.post_comment('@Juan Ortega el primero, con mención.',
  null, test.id('mn_proy'), null, null, null, null, array[test.id('juan')]::uuid[]);
insert into public.comments (project_id, author_id, body)
values (test.id('mn_proy'), test.id('salvi'), 'El segundo, sin mencionar a nadie.');
commit;

reset role; select test.as_server();
select test.ok('mn_suelta', 'Tras un comentario con menciones, el siguiente vuelve a avisar',
  (select count(*) = 1 from public.notifications
    where user_id = test.id('juan') and title like 'Comentario en PROY%'),
  (select coalesce(string_agg(title, ' | '), 'NINGUNO')
     from public.notifications where user_id = test.id('juan')));

select test.ok('mn_suelta', 'Y el de la mención también ha llegado',
  (select count(*) = 1 from public.notifications
    where user_id = test.id('juan') and title like '%te ha mencionado%'),
  (select coalesce(string_agg(title, ' | '), 'NINGUNO')
     from public.notifications where user_id = test.id('juan')));

set role authenticated; select test.as_user(test.id('salvi'));


\echo '== MENCIONES · LO QUE YA HABÍA SIGUE EN PIE'

-- El camino viejo —insertar el comentario directamente— sigue
-- funcionando, porque hay pantallas y pruebas que lo usan.
insert into public.comments (project_id, author_id, body)
values (test.id('mn_proy'), test.id('salvi'), 'Por el camino de siempre.');

select test.ok('mn_intacto', 'Insertar un comentario directamente sigue funcionando',
  (select count(*) = 1 from public.comments
    where project_id = test.id('mn_proy') and body = 'Por el camino de siempre.'));

reset role; select test.as_server();
select test.ok('mn_intacto', 'Y el disparador de siempre sigue avisando',
  (select count(*) > 0 from public.notifications
    where user_id = test.id('juan') and title like 'Comentario en PROY%'),
  (select coalesce(string_agg(title, ' | '), 'NINGUNO')
     from public.notifications where user_id = test.id('juan')));

reset role; select test.as_server();
