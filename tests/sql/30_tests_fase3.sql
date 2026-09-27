-- =====================================================================
-- METALPLAFER360 · PRUEBAS DE PROYECTOS (FASE 3)
--
-- Continúa sobre los datos de 10_tests.sql y 20_tests_fase2.sql:
--   salvi → administración · juan y pedro → trabajadores
--   pres1 → presupuesto aceptado de García Construcciones SL
--   pres2 → presupuesto cancelado y archivado
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
reset role;
select test.as_server();

create table if not exists test.notes (k text primary key, v text);
grant all on test.notes to anon, authenticated, service_role;
create or replace function test.note(p text) returns text language sql stable as $$
  select v from test.notes where k = p $$;
create or replace function test.setnote(p text, val text) returns text language sql as $$
  insert into test.notes values (p, val) on conflict (k) do update set v = excluded.v returning v $$;
grant execute on all functions in schema test to anon, authenticated, service_role;

set role authenticated; select test.as_user(test.id('salvi'));


\echo '== CREAR PROYECTO'
with x as (
  insert into public.projects (client_id, name, description, measures, finish, location,
                               address, observations, budget_amount, advance_amount,
                               budget_hours_fab, budget_hours_mont)
  values (test.id('cli_laura'), 'Rejas ventanas planta baja',
          'Rejas fijas de pletina con barrotes cuadrados.', '4 ud · 1,20 × 1,40 m',
          'Negro forja', 'Fachada principal',
          'Carrer de Calders, 9 · Castellar del Vallès',
          'El cliente pide no taladrar la piedra del zócalo.',
          2400, 800, 18, 6)
  returning id, code, phase, billing_status)
select test.put('proy1', id), test.setnote('proy1_code', code),
       test.ok('proyectos', 'El código sigue el formato PROY-AAAA-###',
         code ~ ('^PROY-' || extract(year from public.today_madrid())::int || '-[0-9]{3}$')),
       test.ok('proyectos', 'Un proyecto nuevo empieza En preparación y Por facturar',
         phase = 'preparacion' and billing_status = 'por_facturar')
  from x;

select test.ok('proyectos', 'Guarda producto, medidas, acabado, ubicación y observaciones',
  (select name = 'Rejas ventanas planta baja' and measures = '4 ud · 1,20 × 1,40 m'
      and finish = 'Negro forja' and location = 'Fachada principal'
      and observations like '%no taladrar%'
     from public.projects where id = test.id('proy1')));

select test.ok('proyectos', 'Guarda presupuesto, anticipo y horas de fabricación y montaje',
  (select budget_amount = 2400 and advance_amount = 800
      and budget_hours_fab = 18 and budget_hours_mont = 6
     from public.projects where id = test.id('proy1')));

select test.ok('proyectos', 'La dirección del proyecto es distinta de la del cliente',
  (select p.address = 'Carrer de Calders, 9 · Castellar del Vallès'
      and p.address is distinct from c.address
     from public.projects p join public.clients c on c.id = p.client_id
    where p.id = test.id('proy1')));

select test.err('proyectos', 'Un proyecto sin cliente se rechaza',
  $$insert into public.projects (name) values ('Sin cliente')$$, '23502');

select test.err('proyectos', 'Un proyecto sin nombre se rechaza',
  $$insert into public.projects (client_id, name) values (test.id('cli_laura'), '  ')$$, '23514');

-- Segundo proyecto: la numeración avanza de uno en uno
with x as (
  insert into public.projects (client_id, name)
  values (test.id('cli_garcia'), 'Puertas cortafuegos almacén')
  returning id, code)
select test.put('proy_sin_montaje', id),
       test.ok('proyectos', 'La numeración avanza correlativamente',
         split_part(code, '-', 3)::int = split_part(test.note('proy1_code'), '-', 3)::int + 1)
  from x;


\echo '== CONVERTIR UN PRESUPUESTO ACEPTADO'
select test.err('conversion', 'Un presupuesto cancelado no se convierte',
  $$select public.convert_budget_to_project(test.id('pres2'))$$, '22023');

select test.err('conversion', 'Una visita no se convierte en proyecto',
  $$select public.convert_budget_to_project(test.id('vis1'))$$, 'P0002');

select test.err('conversion', 'Un aviso no se convierte en proyecto',
  $$select public.convert_budget_to_project(test.id('avi1'))$$, 'P0002');

select test.put('proy_conv', public.convert_budget_to_project(test.id('pres1')));

select test.ok('conversion', 'El proyecto hereda cliente, importe y dirección del presupuesto',
  (select p.client_id = f.client_id and p.budget_amount = f.amount
      and p.address is not distinct from f.address and p.name = f.title
     from public.projects p join public.fichas f on f.id = p.source_ficha_id
    where p.id = test.id('proy_conv')));

select test.ok('conversion', 'Queda constancia de qué presupuesto lo originó',
  (select source_ficha_id = test.id('pres1') from public.projects where id = test.id('proy_conv')));

select test.err('conversion', 'El mismo presupuesto no se convierte dos veces',
  $$select public.convert_budget_to_project(test.id('pres1'))$$, '23505');

select test.ok('conversion', 'El historial menciona el presupuesto de origen',
  exists (select 1 from public.audit_log where summary like '%creó el proyecto PROY-%desde el presupuesto PRES-%'));


\echo '== SUBESTADOS SIMULTÁNEOS'
select public.set_project_substatuses(test.id('proy1'),
  array['pendiente_planos', 'pendiente_material']);

select test.ok('subestados', 'Un proyecto puede tener varios subestados a la vez',
  (select count(*) = 2 from public.project_substatuses where project_id = test.id('proy1')));

select public.set_project_substatuses(test.id('proy1'),
  array['pendiente_visita_tecnica', 'pendiente_planos', 'pendiente_material', 'por_empezar']);
select test.ok('subestados', 'Pueden estar los cuatro de En preparación',
  (select count(*) = 4 from public.project_substatuses where project_id = test.id('proy1')));

select public.set_project_substatuses(test.id('proy1'), array['pendiente_planos']);
select test.ok('subestados', 'Se pueden quitar los que ya no apliquen',
  (select count(*) = 1 and bool_and(substatus = 'pendiente_planos')
     from public.project_substatuses where project_id = test.id('proy1')));

select test.err('subestados', 'Un subestado de otra fase se rechaza',
  $$select public.set_project_substatuses(test.id('proy1'), array['en_montaje'])$$, '22023');

select test.err('subestados', 'Un subestado inventado se rechaza',
  $$select public.set_project_substatuses(test.id('proy1'), array['pausado'])$$, '22023');

select test.err('subestados', 'No se pueden colar subestados saltándose la comprobación',
  $$insert into public.project_substatuses (project_id, phase, substatus)
    values (test.id('proy1'), 'preparacion', 'cancelado')$$, '23514');

select test.ok('subestados', 'El historial recoge el subestado en castellano',
  exists (select 1 from public.audit_log where summary like '%añadió el subestado «Pendiente planos»%'));


\echo '== FASES'
select public.change_project_phase(test.id('proy1'), 'fabricacion');
select test.ok('fases', 'De En preparación se pasa a Fabricación',
  (select phase = 'fabricacion' from public.projects where id = test.id('proy1')));

select test.ok('fases', 'Al cambiar de fase se limpian los subestados de la anterior',
  (select count(*) = 0 from public.project_substatuses where project_id = test.id('proy1')));

select public.set_project_substatuses(test.id('proy1'), array['en_fabricacion', 'falta_material']);
select test.ok('fases', 'Fabricación admite sus propios subestados simultáneos',
  (select count(*) = 2 from public.project_substatuses where project_id = test.id('proy1')));

select test.err('fases', 'De Fabricación no se salta a Facturación sin «Sin montaje»',
  $$select public.change_project_phase(test.id('proy1'), 'facturacion')$$, '22023');

select public.change_project_phase(test.id('proy1'), 'montaje');
select test.ok('fases', 'De Fabricación se pasa a Montaje',
  (select phase = 'montaje' from public.projects where id = test.id('proy1')));

select public.set_project_substatuses(test.id('proy1'), array['en_montaje', 'por_finalizar_montaje']);
select test.ok('fases', 'Montaje admite sus propios subestados',
  (select count(*) = 2 from public.project_substatuses where project_id = test.id('proy1')));

select public.change_project_phase(test.id('proy1'), 'facturacion');
select test.ok('fases', 'De Montaje se pasa a Facturación',
  (select phase = 'facturacion' from public.projects where id = test.id('proy1')));

select test.ok('fases', 'Facturación no tiene subestados',
  (select count(*) = 0 from public.project_substatuses where project_id = test.id('proy1')));

select test.err('fases', 'A «Finalizado» no se llega cambiando de fase',
  $$select public.change_project_phase(test.id('proy1'), 'finalizado')$$, '22023');

select test.ok('fases', 'El historial explica el cambio de fase en castellano',
  exists (select 1 from public.audit_log
           where summary like '%cambió el proyecto PROY-%de Fabricación → Montaje'));


\echo '== SIN MONTAJE'
update public.projects set no_assembly = true where id = test.id('proy_sin_montaje');
select public.change_project_phase(test.id('proy_sin_montaje'), 'fabricacion');

select test.err('sin_montaje', 'Un proyecto «Sin montaje» no puede pasar a Montaje',
  $$select public.change_project_phase(test.id('proy_sin_montaje'), 'montaje')$$, '22023');

select public.change_project_phase(test.id('proy_sin_montaje'), 'facturacion');
select test.ok('sin_montaje', 'De Fabricación pasa directamente a Facturación',
  (select phase = 'facturacion' from public.projects where id = test.id('proy_sin_montaje')));

select test.ok('sin_montaje', 'El historial deja constancia de la marca',
  exists (select 1 from public.audit_log where summary like '%marcó «Sin montaje» en PROY-%'));


\echo '== FACTURACIÓN Y FINALIZACIÓN'
select test.err('finalizar', 'No se finaliza un proyecto que no está cobrado',
  $$select public.finalize_project(test.id('proy1'))$$, '22023');

select public.set_billing_status(test.id('proy1'), 'pendiente_cobro');
select public.set_billing_status(test.id('proy1'), 'cobrado_parcial');
select test.ok('finalizar', 'Los estados de facturación se recorren uno a uno',
  (select billing_status = 'cobrado_parcial' from public.projects where id = test.id('proy1')));

select public.set_billing_status(test.id('proy1'), 'cobrado');
select test.ok('finalizar', 'Estar cobrado NO finaliza el proyecto solo',
  (select phase = 'facturacion' and finished_at is null
     from public.projects where id = test.id('proy1')));

select test.ok('finalizar', 'El sistema lo sugiere, pero no lo hace por su cuenta',
  exists (select 1 from public.v_phase_suggestions
           where project_id = test.id('proy1') and suggested_phase = 'finalizado'));

select public.finalize_project(test.id('proy1'));
select test.ok('finalizar', 'Al pulsar «Finalizar proyecto» queda finalizado y con fecha',
  (select phase = 'finalizado' and finished_at is not null
     from public.projects where id = test.id('proy1')));

select test.ok('finalizar', 'Ya no aparece como sugerencia',
  not exists (select 1 from public.v_phase_suggestions where project_id = test.id('proy1')));

select test.ok('finalizar', 'El historial registra quién lo finalizó',
  exists (select 1 from public.audit_log where summary like 'Salvi finalizó el proyecto PROY-%'));

select public.reopen_project(test.id('proy1'));
select test.ok('finalizar', 'Un proyecto cerrado por error se puede reabrir',
  (select phase = 'facturacion' and finished_at is null
     from public.projects where id = test.id('proy1')));
select public.finalize_project(test.id('proy1'));


\echo '== DOCUMENTOS DEL PROYECTO'
insert into storage.objects (bucket_id, name)
values ('documentos', 'projects/' || test.id('proy_conv') || '/plano-taller.pdf');

with x as (
  insert into public.documents (project_id, storage_path, file_name, mime_type, size_bytes, category, uploaded_by)
  values (test.id('proy_conv'), 'projects/' || test.id('proy_conv') || '/plano-taller.pdf',
          'Plano de taller.pdf', 'application/pdf', 1200000, 'documento', test.id('salvi'))
  returning id)
select test.put('doc_proy', id) from x;

insert into public.documents (project_id, storage_path, file_name, mime_type, size_bytes, category, uploaded_by)
values (test.id('proy_conv'), 'projects/' || test.id('proy_conv') || '/foto-medicion.jpg',
        'Foto medición.jpg', 'image/jpeg', 900000, 'foto', test.id('salvi')),
       (test.id('proy_conv'), 'projects/' || test.id('proy_conv') || '/montaje.mp4',
        'Montaje.mp4', 'video/mp4', 40000000, 'video', test.id('salvi')),
       (test.id('proy_conv'), 'projects/' || test.id('proy_conv') || '/presupuesto.xlsx',
        'Presupuesto.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        60000, 'documento', test.id('salvi'));

select test.ok('documentos', 'PDF, fotos, vídeos y hojas de cálculo conviven en una única lista',
  (select count(*) = 4 and count(distinct category) = 3
     from public.documents where project_id = test.id('proy_conv')));

select test.err('documentos', 'Un archivo más grande que el límite configurado se rechaza',
  $$insert into public.documents (project_id, storage_path, file_name, size_bytes)
    values (test.id('proy_conv'), 'projects/x/enorme.mp4', 'enorme.mp4', 104857601)$$, '22023');

select test.err('documentos', 'Un documento no puede ser de una ficha y de un proyecto a la vez',
  $$insert into public.documents (project_id, ficha_id, storage_path, file_name, size_bytes)
    values (test.id('proy_conv'), test.id('avi1'), 'projects/x/y.pdf', 'y.pdf', 10)$$, '23514');

-- Papelera
delete from public.documents where id = test.id('doc_proy');
select test.ok('papelera', 'No se puede borrar un documento sin pasar por la papelera',
  exists (select 1 from public.documents where id = test.id('doc_proy')));

select public.trash_document(test.id('doc_proy'));
select test.ok('papelera', 'Enviar a la papelera no borra el archivo',
  (select deleted_at is not null and deleted_by = test.id('salvi')
     from public.documents where id = test.id('doc_proy')));

select test.ok('papelera', 'El documento en papelera desaparece de la lista del proyecto',
  (select count(*) = 3 from public.documents
    where project_id = test.id('proy_conv') and deleted_at is null));

select public.restore_document(test.id('doc_proy'));
select test.ok('papelera', 'Se puede recuperar de la papelera',
  (select deleted_at is null from public.documents where id = test.id('doc_proy')));

select public.trash_document(test.id('doc_proy'));
delete from public.documents where id = test.id('doc_proy');
select test.ok('papelera', 'Desde la papelera sí se elimina definitivamente',
  not exists (select 1 from public.documents where id = test.id('doc_proy')));

select test.ok('documentos', 'El historial dice a qué proyecto se subió cada archivo',
  exists (select 1 from public.audit_log where summary like '%subió un documento «Plano de taller.pdf» a PROY-%'));

-- Comentarios
insert into public.comments (project_id, author_id, body)
values (test.id('proy_conv'), test.id('salvi'), 'Confirmado el acabado con el cliente: negro microtexturado.');
select test.ok('comentarios', 'Se puede comentar en un proyecto',
  (select count(*) = 1 from public.comments where project_id = test.id('proy_conv')));

select test.err('comentarios', 'Un comentario no puede ser de una ficha y de un proyecto a la vez',
  $$insert into public.comments (project_id, ficha_id, author_id, body)
    values (test.id('proy_conv'), test.id('avi1'), test.id('salvi'), 'x')$$, '23514');


\echo '== ARCHIVAR Y HISTORIAL'
select test.err('proyectos', 'Un proyecto no se borra físicamente',
  $$delete from public.projects where id = test.id('proy_sin_montaje')$$, '42501');

update public.projects set archived_at = now() where id = test.id('proy_sin_montaje');
select test.ok('proyectos', 'Un proyecto se archiva y conserva su historial',
  (select archived_at is not null from public.projects where id = test.id('proy_sin_montaje'))
  and exists (select 1 from public.audit_log where summary like '%archivó el proyecto PROY-%'));

select test.err('proyectos', 'Un proyecto archivado no cambia de fase',
  $$select public.change_project_phase(test.id('proy_sin_montaje'), 'montaje')$$, '22023');

select test.err('historial', 'El historial no se puede modificar',
  $$update public.audit_log set summary = 'manipulado' where entity_type = 'projects'$$, '42501');

select test.err('historial', 'El historial no se puede borrar',
  $$delete from public.audit_log where entity_type = 'projects'$$, '42501');

select test.ok('historial', 'Cada apunte guarda quién, qué, cuándo y sobre qué',
  (select bool_and(actor_id is not null and actor_name = 'Salvi'
               and action in ('insert', 'update', 'delete')
               and entity_type = 'projects' and entity_code is not null
               and occurred_at is not null)
     from public.audit_log where entity_type = 'projects'));


\echo '== RESUMEN POR CLIENTE'
select test.ok('cliente', 'La ficha del cliente cuenta sus proyectos en curso y finalizados',
  (select total = 1 and finalizados = 1 and en_curso = 0
     from public.client_projects where client_id = test.id('cli_laura')));


\echo '== PERMISOS'
select test.as_user(test.id('juan'));
select test.ok('permisos', 'Un trabajador no ve ningún proyecto',
  (select count(*) = 0 from public.projects));
select test.ok('permisos', 'Ni los subestados',
  (select count(*) = 0 from public.project_substatuses));
select test.ok('permisos', 'Ni los documentos de los proyectos',
  (select count(*) = 0 from public.documents where project_id is not null));
select test.ok('permisos', 'Ni los comentarios de los proyectos',
  (select count(*) = 0 from public.comments where project_id is not null));
select test.ok('permisos', 'Sigue viendo los documentos de sus propias fichas',
  (select count(*) >= 0 from public.documents where ficha_id is not null));

select test.err('permisos', 'No puede crear proyectos',
  $$insert into public.projects (client_id, name) values (test.id('cli_laura'), 'Falso')$$, '42501');
select test.err('permisos', 'No puede cambiar la fase de un proyecto',
  $$select public.change_project_phase(test.id('proy_conv'), 'montaje')$$, '42501');
select test.err('permisos', 'No puede poner subestados',
  $$select public.set_project_substatuses(test.id('proy_conv'), array['por_empezar'])$$, '42501');
select test.err('permisos', 'No puede finalizar un proyecto',
  $$select public.finalize_project(test.id('proy1'))$$, '42501');
select test.err('permisos', 'No puede convertir presupuestos en proyectos',
  $$select public.convert_budget_to_project(test.id('pres1'))$$, '42501');
select test.err('permisos', 'No puede cambiar el estado de facturación',
  $$select public.set_billing_status(test.id('proy1'), 'cobrado')$$, '42501');

update public.projects set name = 'HACKEADO' where id = test.id('proy_conv');
reset role; set role authenticated; select test.as_user(test.id('salvi'));
select test.ok('permisos', 'Aunque lo intente, no modifica los datos del proyecto',
  (select name <> 'HACKEADO' from public.projects where id = test.id('proy_conv')));

reset role; set role anon; select test.as_anon();
select test.err('permisos', 'Sin sesión no se pueden leer los proyectos',
  'select * from public.projects', '42501');
select test.err('permisos', 'Sin sesión no se puede finalizar nada',
  $$select public.finalize_project(test.id('proy1'))$$, '42501');
reset role;
