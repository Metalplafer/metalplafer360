-- =====================================================================
-- METALPLAFER360 · VISITAS TÉCNICAS VINCULADAS
--
-- Lo que importa aquí:
--
--   · que una visita se pueda vincular a un presupuesto, a un aviso o a
--     un proyecto, y que se vea desde allí con su estado y su fecha;
--   · que sus planos y sus fotos se vean desde el presupuesto y desde el
--     proyecto, SIN COPIAR NI UN ARCHIVO, diciendo de qué visita vienen;
--   · que si la visita se vinculó al PRESUPUESTO y después el
--     presupuesto se convirtió en proyecto, desde el proyecto se siga
--     llegando a esos archivos;
--   · que NO se vean los archivos de visitas que no tienen nada que ver;
--   · que una visita no se pueda vincular a otra visita, ni a dos sitios
--     a la vez, ni a sí misma;
--   · que desvincular no borre nada;
--   · que las visitas de antes sigan funcionando igual;
--   · y que los permisos no cambien.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== VISITAS · VINCULAR A UN PRESUPUESTO'

reset role; select test.as_server();
set role authenticated; select test.as_user(test.id('salvi'));

-- Un presupuesto que necesita que alguien vaya a medir.
with f as (
  insert into public.fichas (type, client_id, title, amount)
  values ('presupuesto', test.id('cli_garcia'), 'Cerramiento de terraza', 5200)
  returning id)
select test.put('vv_pres', (select id from f));
update public.fichas set status = 'aceptado' where id = test.id('vv_pres');

-- La visita, con la ficha de visita DE SIEMPRE: mismo tipo, mismos
-- campos, misma numeración. No hay una segunda clase de visita.
with f as (
  insert into public.fichas (type, client_id, title, address,
                             scheduled_date, scheduled_time, assigned_to)
  -- El responsable de una visita es de administración: la aplicación no
  -- deja asignarla a un trabajador («si el trabajo lo tiene que hacer un
  -- trabajador, créalo como aviso»). Se respeta esa regla tal cual.
  values ('visita', test.id('cli_garcia'), 'Medir la terraza',
          'Avinguda de Barberà, 70 · Sabadell',
          date '2026-11-10', time '09:30', test.id('salvi'))
  returning id)
select test.put('vv_visita', (select id from f));
update public.fichas set status = 'asignada' where id = test.id('vv_visita');

select test.ok('vis_enlace', 'La visita nace sin vincular a nada',
  (select linked_ficha_id is null and linked_project_id is null
     from public.fichas where id = test.id('vv_visita')));

select public.link_visit(test.id('vv_visita'), test.id('vv_pres'), null);

select test.ok('vis_enlace', 'Queda vinculada al presupuesto',
  (select linked_ficha_id = test.id('vv_pres') and linked_project_id is null
     from public.fichas where id = test.id('vv_visita')));

select test.ok('vis_enlace', 'Y se ve desde el presupuesto con su estado, su fecha y su responsable',
  (select status = 'asignada' and scheduled_date = date '2026-11-10'
      and scheduled_time = time '09:30'
      and assigned_name = (select full_name from public.profiles where id = test.id('salvi'))
      and code like 'VIS-%' and not heredada
     from public.linked_visits
    where para_tipo = 'presupuesto' and para_id = test.id('vv_pres')),
  (select format('%s · %s · %s · %s', code, status, scheduled_date, assigned_name)
     from public.linked_visits
    where para_tipo = 'presupuesto' and para_id = test.id('vv_pres')));

select test.ok('vis_enlace', 'El historial lo cuenta con palabras',
  exists (select 1 from public.audit_log
           where action = 'vincular_visita'
             and entity_code = (select code from public.fichas where id = test.id('vv_visita'))
             and summary like '%vinculó la visita técnica VIS-%a PRES-%'),
  (select summary from public.audit_log
    where action = 'vincular_visita' order by id desc limit 1));

-- Volver a vincularla al mismo sitio no añade otro apunte al historial.
select test.setnote('vv_apuntes',
  (select count(*)::text from public.audit_log where action = 'vincular_visita'));
select public.link_visit(test.id('vv_visita'), test.id('vv_pres'), null);
select test.ok('vis_enlace', 'Vincularla otra vez al mismo sitio no repite el apunte',
  (select count(*)::text from public.audit_log where action = 'vincular_visita')
    = test.note('vv_apuntes'));

-- Varias visitas para el mismo presupuesto: es lo normal.
with f as (
  insert into public.fichas (type, client_id, title, scheduled_date)
  values ('visita', test.id('cli_garcia'), 'Segunda medición', date '2026-11-17')
  returning id)
select test.put('vv_visita2', (select id from f));
select public.link_visit(test.id('vv_visita2'), test.id('vv_pres'), null);

select test.ok('vis_enlace', 'Un presupuesto puede tener varias visitas',
  (select count(*) = 2 from public.linked_visits
    where para_tipo = 'presupuesto' and para_id = test.id('vv_pres')));


\echo '== VISITAS · LOS ARCHIVOS SE VEN DESDE EL PRESUPUESTO'

insert into public.documents (ficha_id, storage_path, file_name, size_bytes,
                              category, uploaded_by, scope)
values (test.id('vv_visita'),
        'fichas/' || test.id('vv_visita') || '/plano-terraza.pdf',
        'plano-terraza.pdf', 30720, 'documento', test.id('salvi'), 'tecnica'),
       (test.id('vv_visita'),
        'fichas/' || test.id('vv_visita') || '/terraza-1.jpg',
        'terraza-1.jpg', 640000, 'foto', test.id('salvi'), 'tecnica');

select test.setnote('vv_docs_total',
  (select count(*)::text from public.documents));

select test.ok('vis_archivos', 'Los archivos de la visita se ven desde el presupuesto',
  (select count(*) = 2 from public.related_documents
    where para_tipo = 'presupuesto' and para_id = test.id('vv_pres')),
  (select coalesce(string_agg(file_name, ', '), '(ninguno)') from public.related_documents
    where para_tipo = 'presupuesto' and para_id = test.id('vv_pres')));

select test.ok('vis_archivos', 'Diciendo que proceden de la visita técnica y de qué fecha',
  (select bool_and(origen_tipo = 'visita'
                   and origen_id = test.id('vv_visita')
                   and origen_fecha = date '2026-11-10'
                   and origen_code like 'VIS-%')
     from public.related_documents
    where para_tipo = 'presupuesto' and para_id = test.id('vv_pres')));

select test.ok('vis_archivos', 'La visita cuenta cuántos archivos tiene',
  (select archivos = 2 from public.linked_visits
    where para_tipo = 'presupuesto' and para_id = test.id('vv_pres')
      and id = test.id('vv_visita')),
  (select archivos::text from public.linked_visits
    where para_tipo = 'presupuesto' and para_id = test.id('vv_pres')
      and id = test.id('vv_visita')));

select test.ok('vis_archivos', 'Y siguen siendo de la visita: no se ha copiado ninguno',
  (select count(*) = 2 from public.documents where ficha_id = test.id('vv_visita'))
  and (select count(*) = 0 from public.documents where ficha_id = test.id('vv_pres')));

select test.ok('vis_archivos', 'No se ha creado ni una fila más en toda la tabla',
  (select count(*)::text from public.documents) = test.note('vv_docs_total'));

-- LO QUE NO TIENE QUE PASAR: ver los papeles de una visita ajena.
with f as (
  insert into public.fichas (type, client_id, title, scheduled_date)
  values ('visita', test.id('cli_laura'), 'Visita de otro cliente', date '2026-11-12')
  returning id)
select test.put('vv_ajena', (select id from f));

insert into public.documents (ficha_id, storage_path, file_name, size_bytes,
                              category, uploaded_by, scope)
values (test.id('vv_ajena'),
        'fichas/' || test.id('vv_ajena') || '/privado.pdf',
        'privado.pdf', 1024, 'documento', test.id('salvi'), 'tecnica');

select test.ok('vis_archivos', 'Los archivos de una visita sin vincular no se ven en ningún sitio',
  not exists (select 1 from public.related_documents where file_name = 'privado.pdf'));

select public.link_visit(test.id('vv_ajena'), test.id('pres1'), null);

select test.ok('vis_archivos', 'Y vinculada a otro presupuesto, solo se ve en ESE',
  (select count(*) = 1 from public.related_documents
    where file_name = 'privado.pdf' and para_id = test.id('pres1'))
  and not exists (select 1 from public.related_documents
                   where file_name = 'privado.pdf' and para_id = test.id('vv_pres')));


\echo '== VISITAS · AL CONVERTIR EL PRESUPUESTO, LA VISITA SIGUE A MANO'

-- Es el caso que se pidió expresamente: la visita se vinculó al
-- PRESUPUESTO, y después el presupuesto se convirtió en proyecto.
select test.put('vv_proy', public.convert_budget_to_project(test.id('vv_pres')));

select test.ok('vis_herencia', 'El proyecto ve la visita de su presupuesto, marcada como heredada',
  (select heredada and code like 'VIS-%' from public.linked_visits
    where para_tipo = 'proyecto' and para_id = test.id('vv_proy')
      and id = test.id('vv_visita')));

select test.ok('vis_herencia', 'Y ve las dos visitas del presupuesto',
  (select count(*) = 2 from public.linked_visits
    where para_tipo = 'proyecto' and para_id = test.id('vv_proy')));

select test.ok('vis_herencia', 'Los planos de la visita se abren desde el proyecto',
  (select count(*) = 2 from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('vv_proy')
      and origen_tipo = 'visita'),
  (select coalesce(string_agg(file_name || ' (' || origen_tipo || ')', ', '), '(ninguno)')
     from public.related_documents
    where para_tipo = 'proyecto' and para_id = test.id('vv_proy')));

select test.ok('vis_herencia', 'Sin dejar de verse desde el presupuesto',
  (select count(*) = 2 from public.related_documents
    where para_tipo = 'presupuesto' and para_id = test.id('vv_pres')
      and origen_tipo = 'visita'));

select test.ok('vis_herencia', 'Y la relación sigue siendo con la visita, no con el proyecto',
  (select linked_ficha_id = test.id('vv_pres') and linked_project_id is null
     from public.fichas where id = test.id('vv_visita')));

-- Una visita vinculada DIRECTAMENTE al proyecto: el otro camino.
with f as (
  insert into public.fichas (type, client_id, title, scheduled_date)
  values ('visita', test.id('cli_garcia'), 'Comprobar el replanteo en obra', date '2026-12-01')
  returning id)
select test.put('vv_visita3', (select id from f));
select public.link_visit(test.id('vv_visita3'), null, test.id('vv_proy'));

insert into public.documents (ficha_id, storage_path, file_name, size_bytes,
                              category, uploaded_by, scope)
values (test.id('vv_visita3'),
        'fichas/' || test.id('vv_visita3') || '/replanteo.jpg',
        'replanteo.jpg', 500000, 'foto', test.id('salvi'), 'tecnica');

select test.ok('vis_herencia', 'La visita del proyecto NO sale como heredada',
  (select not heredada from public.linked_visits
    where para_tipo = 'proyecto' and para_id = test.id('vv_proy')
      and id = test.id('vv_visita3')));

select test.ok('vis_herencia', 'Y su foto también se ve desde el proyecto',
  exists (select 1 from public.related_documents
           where para_tipo = 'proyecto' and para_id = test.id('vv_proy')
             and file_name = 'replanteo.jpg'));

select test.ok('vis_herencia', 'Pero no desde el presupuesto: es del proyecto, no de antes',
  not exists (select 1 from public.related_documents
               where para_tipo = 'presupuesto' and para_id = test.id('vv_pres')
                 and file_name = 'replanteo.jpg'));


\echo '== VISITAS · LO QUE NO SE ADMITE'

select test.err('vis_reglas', 'Un presupuesto no se vincula como si fuera una visita',
  format($$select public.link_visit(%L, %L, null)$$,
         test.id('vv_pres'), test.id('pres1')), '22023');

select test.err('vis_reglas', 'Una visita no se vincula a otra visita',
  format($$select public.link_visit(%L, %L, null)$$,
         test.id('vv_visita3'), test.id('vv_visita')), '22023');

select test.err('vis_reglas', 'Ni a un presupuesto Y un proyecto a la vez',
  format($$select public.link_visit(%L, %L, %L)$$,
         test.id('vv_visita3'), test.id('vv_pres'), test.id('vv_proy')), '22023');

select test.err('vis_reglas', 'Ni a un destino que no existe',
  format($$select public.link_visit(%L, null, %L)$$,
         test.id('vv_visita3'), gen_random_uuid()), 'P0002');

-- Y la base de datos tampoco lo admite a pelo, sin pasar por la función.
select test.err('vis_reglas', 'La base de datos no deja vincular una visita a sí misma',
  format($$update public.fichas set linked_ficha_id = %L where id = %L$$,
         test.id('vv_visita'), test.id('vv_visita')), '23514');

select test.err('vis_reglas', 'Ni dar destino a algo que no es una visita',
  format($$update public.fichas set linked_project_id = %L where id = %L$$,
         test.id('vv_proy'), test.id('vv_pres')), '23514');

select test.err('vis_reglas', 'Ni poner los dos destinos a la vez',
  format($$update public.fichas set linked_ficha_id = %L, linked_project_id = %L where id = %L$$,
         test.id('vv_pres'), test.id('vv_proy'), test.id('vv_visita3')), '23514');


\echo '== VISITAS · DESVINCULAR NO BORRA NADA'

select public.link_visit(test.id('vv_visita3'), null, null);

select test.ok('vis_reglas', 'Desvinculada, deja de verse desde el proyecto',
  not exists (select 1 from public.linked_visits
               where para_tipo = 'proyecto' and para_id = test.id('vv_proy')
                 and id = test.id('vv_visita3')));

select test.ok('vis_reglas', 'Y su foto tampoco se ve ya desde allí',
  not exists (select 1 from public.related_documents
               where para_tipo = 'proyecto' and para_id = test.id('vv_proy')
                 and file_name = 'replanteo.jpg'));

select test.ok('vis_reglas', 'Pero la visita sigue existiendo con su archivo',
  (select count(*) = 1 from public.fichas where id = test.id('vv_visita3'))
  and (select count(*) = 1 from public.documents
        where ficha_id = test.id('vv_visita3') and deleted_at is null));

select test.ok('vis_reglas', 'Y el historial dice que se desvinculó',
  exists (select 1 from public.audit_log
           where action = 'desvincular_visita'
             and summary like '%desvinculó la visita técnica VIS-%'));


\echo '== VISITAS · LAS DE ANTES SIGUEN IGUAL'

select test.ok('vis_antiguas', 'Las visitas que ya existían no están vinculadas a nada',
  (select linked_ficha_id is null and linked_project_id is null
     from public.fichas where id = test.id('vis1')));

select test.ok('vis_antiguas', 'Y no aparecen en ninguna de las dos vistas',
  not exists (select 1 from public.linked_visits where id = test.id('vis1')));

select test.ok('vis_antiguas', 'Se siguen pudiendo editar como siempre',
  (select status from public.fichas where id = test.id('vis1')) is not null);

select public.link_visit(test.id('vis1'), test.id('vv_pres'), null);
select test.ok('vis_antiguas', 'Y ahora se pueden vincular sin tocar nada más',
  (select linked_ficha_id = test.id('vv_pres')
     from public.fichas where id = test.id('vis1')));


\echo '== VISITAS · LOS PERMISOS'

set role authenticated; select test.as_user(test.id('juan'));

select test.err('vis_permisos', 'Un trabajador no vincula visitas',
  format($$select public.link_visit(%L, %L, null)$$,
         test.id('vv_visita'), test.id('vv_pres')), '42501');

select test.ok('vis_permisos', 'Y no ve las visitas vinculadas: las fichas son de administración',
  (select count(*) = 0 from public.linked_visits),
  (select count(*)::text from public.linked_visits));

set role anon; select test.as_anon();
select test.err('vis_permisos', 'Sin sesión no se ven las visitas vinculadas',
  'select count(*) from public.linked_visits', '42501');

select test.err('vis_permisos', 'Ni se puede vincular nada',
  format($$select public.link_visit(%L, %L, null)$$,
         test.id('vv_visita'), test.id('vv_pres')), '42501');

reset role; select test.as_server();
