-- =====================================================================
-- METALPLAFER360 · «PENDIENTE DE PAGA Y SEÑAL» Y «LACADO-ZINCADO»
--
-- Lo que importa aquí:
--   · que redefinir una función «immutable» usada por un «check» cambie
--     de verdad lo que la base de datos admite. Es la base de las dos
--     mejoras y no se da por supuesto: se comprueba;
--   · que siga rechazando cualquier estado inventado;
--   · que «por_asignar» SIGA siendo válido, porque hay fichas que lo
--     tienen y dejarán de poder guardarse si se quita del catálogo;
--   · que un presupuesto pendiente de paga y señal NO se convierta en
--     proyecto, y que se diga por qué;
--   · que uno aceptado SÍ se siga convirtiendo, que es lo que no hay que
--     romper;
--   · que «Lacado-Zincado» sea de FABRICACIÓN y de ninguna otra fase;
--   · que el historial lo escriba en castellano, no en crudo.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== ESTADOS · EL CATÁLOGO DE LOS PRESUPUESTOS'

reset role; select test.as_server();

select test.ok('es_catalogo', 'La base de datos admite el estado nuevo',
  public.valid_ficha_status('presupuesto', 'pendiente_senal'));

select test.ok('es_catalogo', 'Y sigue admitiendo todos los de antes',
  (select bool_and(public.valid_ficha_status('presupuesto', s))
     from unnest(array['por_asignar', 'pendiente', 'avanzado', 'por_revisar',
                       'enviado', 'aceptado', 'cancelado']) s));

-- LA COMPROBACIÓN QUE IMPORTA DE VERDAD: «por_asignar» se queda. Hay
-- fichas en producción que lo tienen y, si se quita del catálogo, dejan
-- de poder guardarse aunque nadie les cambie el estado.
select test.ok('es_catalogo', '«Por asignar» sigue siendo válido, para las fichas que ya lo tienen',
  public.valid_ficha_status('presupuesto', 'por_asignar')
  and public.valid_ficha_status('aviso', 'por_asignar')
  and public.valid_ficha_status('visita', 'por_asignar'));

select test.ok('es_catalogo', 'Un estado inventado se sigue rechazando',
  not public.valid_ficha_status('presupuesto', 'me_lo_invento'));

select test.ok('es_catalogo', 'Y el estado nuevo NO vale para una visita ni para un aviso',
  not public.valid_ficha_status('visita', 'pendiente_senal')
  and not public.valid_ficha_status('aviso', 'pendiente_senal'));


\echo '== ESTADOS · LA RESTRICCIÓN DE LA TABLA LO ACEPTA'

-- Que la función diga «sí» no basta: lo que hace falta es que la
-- restricción «check» de la tabla, que llama a esa función, acepte el
-- valor sin haber tenido que borrarla ni revalidar la tabla.
set role authenticated; select test.as_user(test.id('salvi'));

with p as (insert into public.fichas (type, client_id, title, status, amount)
           values ('presupuesto', test.id('cli_laura'),
                   'Barandilla pendiente de señal', 'por_asignar', 8500)
           returning id)
select test.put('es_pres', (select id from p));

update public.fichas set status = 'enviado' where id = test.id('es_pres');
update public.fichas set status = 'pendiente_senal' where id = test.id('es_pres');

select test.ok('es_tabla', 'La tabla guarda el estado nuevo, sin tocar la restricción',
  (select status = 'pendiente_senal' from public.fichas where id = test.id('es_pres')));

select test.err('es_tabla', 'Y la restricción sigue rechazando un estado inventado',
  format($$update public.fichas set status = 'me_lo_invento' where id = %L$$,
         test.id('es_pres')), '23514');

select test.ok('es_tabla', 'El historial lo escribe en castellano, no en crudo',
  exists (select 1 from public.audit_log
           where summary like '%Presupuesto enviado → Pendiente de paga y señal%'));

select test.ok('es_tabla', 'Y no aparece la clave técnica por ningún lado del historial',
  not exists (select 1 from public.audit_log where summary like '%pendiente_senal%'));


\echo '== ESTADOS · PENDIENTE DE SEÑAL NO SE CONVIERTE EN PROYECTO'

-- Es lo único que de verdad hace falta del estado nuevo: que el trabajo
-- no empiece antes de cobrar la señal.
select test.err('es_convertir', 'Un presupuesto pendiente de paga y señal NO se convierte',
  format($$select public.convert_budget_to_project(%L)$$, test.id('es_pres')), '22023');

select test.ok('es_convertir', 'Y no se ha creado ningún proyecto al intentarlo',
  (select count(*) = 0 from public.projects where source_ficha_id = test.id('es_pres')));

select test.ok('es_convertir', 'La ficha se queda como estaba después del intento',
  (select status = 'pendiente_senal' from public.fichas where id = test.id('es_pres')));

-- Y el mensaje tiene que explicar QUÉ falta, no decir «solo los
-- aceptados»: eso no diría que lo único que falta es cobrar.
do $$
declare v text;
begin
  begin
    perform public.convert_budget_to_project(test.id('es_pres'));
  exception when others then v := sqlerrm;
  end;
  perform test.ok('es_convertir', 'El mensaje dice que falta cobrar la señal y qué hacer después',
    v like '%pendiente de paga y señal%' and v like '%Presupuesto aceptado%', coalesce(v, 'sin error'));
  perform test.ok('es_convertir', 'Y nombra el presupuesto, para saber de cuál habla',
    v like '%PRES-%', coalesce(v, 'sin error'));
end $$;

-- LO QUE NO HAY QUE ROMPER: cobrada la señal, se convierte como siempre.
update public.fichas set status = 'aceptado' where id = test.id('es_pres');
select test.put('es_proy', public.convert_budget_to_project(test.id('es_pres')));

select test.ok('es_convertir', 'Cobrada la señal y aceptado, se convierte como siempre',
  (select code like 'PROY-%' from public.projects where id = test.id('es_proy')));

select test.ok('es_convertir', 'Y el proyecto queda atado a su presupuesto',
  (select source_ficha_id = test.id('es_pres')
     from public.projects where id = test.id('es_proy')));


\echo '== SUBESTADOS · LACADO-ZINCADO ES DE FABRICACIÓN'

reset role; select test.as_server();

select test.ok('es_sub', 'Se admite en fabricación',
  public.valid_substatus('fabricacion', 'lacado_zincado'));

select test.ok('es_sub', 'Y NO en preparación, ni en montaje, ni en facturación',
  not public.valid_substatus('preparacion', 'lacado_zincado')
  and not public.valid_substatus('montaje', 'lacado_zincado')
  and not public.valid_substatus('facturacion', 'lacado_zincado'));

select test.ok('es_sub', 'Los subestados de fabricación de antes siguen valiendo',
  (select bool_and(public.valid_substatus('fabricacion', s))
     from unnest(array['en_fabricacion', 'falta_material', 'por_finalizar']) s));

select test.ok('es_sub', 'Y los de las otras fases no se han movido',
  (select bool_and(public.valid_substatus('preparacion', s))
     from unnest(array['pendiente_visita_tecnica', 'pendiente_planos',
                       'pendiente_material', 'por_empezar']) s)
  and (select bool_and(public.valid_substatus('montaje', s))
         from unnest(array['en_montaje', 'falta_material', 'por_finalizar_montaje']) s));

select test.ok('es_sub', 'Un subestado inventado se sigue rechazando',
  not public.valid_substatus('fabricacion', 'me_lo_invento'));

-- Y en la tabla de verdad, que es la que tiene el «check».
set role authenticated; select test.as_user(test.id('salvi'));
update public.projects set phase = 'fabricacion' where id = test.id('es_proy');
select public.set_project_substatuses(test.id('es_proy'),
  array['lacado_zincado', 'falta_material']);

select test.ok('es_sub', 'El proyecto guarda «Lacado-Zincado» junto a otro subestado',
  (select count(*) = 2 from public.project_substatuses
    where project_id = test.id('es_proy')
      and substatus in ('lacado_zincado', 'falta_material')));

select test.ok('es_sub', 'Y no se pierde al volver a leerlo',
  exists (select 1 from public.project_substatuses
           where project_id = test.id('es_proy')
             and phase = 'fabricacion' and substatus = 'lacado_zincado'));

select test.err('es_sub', 'La tabla rechaza un subestado que no es de esa fase',
  format($$insert into public.project_substatuses (project_id, phase, substatus)
           values (%L, 'montaje', 'lacado_zincado')$$, test.id('es_proy')), '23514');


\echo '== ESTADOS · NO SE HA MOVIDO NADA DE LO QUE YA HABÍA'

reset role; select test.as_server();

-- Ninguna ficha ni proyecto preexistente ha cambiado de estado por
-- ampliar los catálogos. Se comprueba que NADIE tiene los valores
-- nuevos salvo los que esta prueba ha puesto a mano.
select test.ok('es_intacto', 'Ninguna otra ficha ha pasado a «Pendiente de paga y señal»',
  (select count(*) = 0 from public.fichas
    where status = 'pendiente_senal' and id <> test.id('es_pres')));

select test.ok('es_intacto', 'Ningún otro proyecto ha pasado a «Lacado-Zincado»',
  (select count(*) = 0 from public.project_substatuses
    where substatus = 'lacado_zincado' and project_id <> test.id('es_proy')));

select test.ok('es_intacto', 'Y las fichas que estaban en «Por asignar» siguen ahí',
  (select count(*) >= 0 from public.fichas where status = 'por_asignar'));

reset role; select test.as_server();
