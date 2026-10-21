-- =====================================================================
-- METALPLAFER360 · SUBESTADOS DE MONTAJE Y EL ANTICIPO COMO COBRO
--
-- Lo que importa aquí:
--
--   M3 · que los dos subestados nuevos entren en MONTAJE y en ninguna
--        otra fase, que los tres de antes sigan valiendo, que la
--        restricción siga rechazando un inventado, y que NINGÚN proyecto
--        se haya movido de subestado por aplicar la migración;
--
--   M4 · que un anticipo PREVISTO no cuente como cobrado;
--      · que al registrarlo cuente UNA vez y solo una;
--      · que no se pueda registrar dos veces, ni por la función ni por
--        debajo de ella;
--      · que lo cobrado como anticipo sea siempre una PARTE de lo
--        cobrado, nunca algo que se le sume aparte;
--      · que anularlo lo quite de los dos sitios a la vez y no borre
--        nada;
--      · que los importes presupuestados no se toquen nunca;
--      · y que la vista de cobros conserve sus cinco columnas de
--        siempre, con el mismo nombre, tipo y orden, para no romper nada
--        de lo que ya la lee.
--
-- Este archivo se ejecuta el ÚLTIMO de la batería.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== MONTAJE · EL CATÁLOGO DE SUBESTADOS'

reset role; select test.as_server();

-- Primero, lo que NO ha pasado: la migración no mueve a nadie.
select test.ok('mon_sub', 'Ningún proyecto existente tiene ya los subestados nuevos',
  (select count(*) = 0 from public.project_substatuses
    where substatus in ('pendiente_montaje', 'pendiente_rematar')),
  (select string_agg(project_id::text || ' · ' || substatus, ' | ')
     from public.project_substatuses
    where substatus in ('pendiente_montaje', 'pendiente_rematar')));

select test.ok('mon_sub', 'La base de datos admite los dos subestados nuevos en montaje',
  public.valid_substatus('montaje', 'pendiente_montaje')
  and public.valid_substatus('montaje', 'pendiente_rematar'));

select test.ok('mon_sub', 'Y los tres de montaje de antes siguen valiendo',
  (select bool_and(public.valid_substatus('montaje', s))
     from unnest(array['en_montaje', 'falta_material', 'por_finalizar_montaje']) s));

-- Son de MONTAJE. Si colaran en otra fase, la pantalla ofrecería una
-- cosa y la base de datos aceptaría otra.
select test.ok('mon_sub', 'Pendiente de montaje es solo de montaje',
  not public.valid_substatus('preparacion', 'pendiente_montaje')
  and not public.valid_substatus('fabricacion', 'pendiente_montaje')
  and not public.valid_substatus('facturacion', 'pendiente_montaje')
  and not public.valid_substatus('finalizado', 'pendiente_montaje'));

select test.ok('mon_sub', 'Pendiente de rematar es solo de montaje',
  not public.valid_substatus('preparacion', 'pendiente_rematar')
  and not public.valid_substatus('fabricacion', 'pendiente_rematar')
  and not public.valid_substatus('facturacion', 'pendiente_rematar')
  and not public.valid_substatus('finalizado', 'pendiente_rematar'));

select test.ok('mon_sub', 'Y los de las otras fases no se han movido',
  (select bool_and(public.valid_substatus('preparacion', s))
     from unnest(array['pendiente_visita_tecnica', 'pendiente_planos',
                       'pendiente_material', 'por_empezar']) s)
  and (select bool_and(public.valid_substatus('fabricacion', s))
         from unnest(array['en_fabricacion', 'falta_material',
                           'lacado_zincado', 'por_finalizar']) s));

select test.ok('mon_sub', 'Un subestado de montaje inventado se sigue rechazando',
  not public.valid_substatus('montaje', 'pendiente_de_lo_que_sea'));


\echo '== MONTAJE · LA TABLA DE VERDAD, QUE ES LA QUE TIENE EL «CHECK»'

set role authenticated; select test.as_user(test.id('salvi'));

-- Un proyecto propio para no tocar la contabilidad de los demás.
with p as (
  insert into public.projects (client_id, name, budget_amount, advance_amount, phase)
  values (test.id('cli_laura'), 'Barandilla escalera interior', 5000, 1500, 'montaje')
  returning id)
select test.put('ant_proy', (select id from p));

select public.set_project_substatuses(test.id('ant_proy'),
  array['pendiente_montaje', 'pendiente_rematar']);

select test.ok('mon_tabla', 'Los dos subestados nuevos se guardan de verdad',
  (select count(*) = 2 from public.project_substatuses
    where project_id = test.id('ant_proy')
      and substatus in ('pendiente_montaje', 'pendiente_rematar')
      and phase = 'montaje'));

-- La restricción sigue en pie: esto es lo que podía haberse roto al
-- redefinir una función «immutable» que usa un «check».
reset role; select test.as_server();
select test.err('mon_tabla', 'Y la restricción rechaza un subestado inventado',
  format($$insert into public.project_substatuses (project_id, phase, substatus)
           values (%L, 'montaje', 'pendiente_de_lo_que_sea')$$, test.id('ant_proy')), '23514');

select test.err('mon_tabla', 'Pendiente de montaje tampoco entra en fabricación',
  format($$insert into public.project_substatuses (project_id, phase, substatus)
           values (%L, 'fabricacion', 'pendiente_montaje')$$, test.id('ant_proy')), '23514');

-- Y por el camino de la aplicación, que avisa en castellano.
set role authenticated; select test.as_user(test.id('salvi'));
select test.errlike('mon_tabla', 'Por la aplicación, el aviso dice el subestado y la fase en castellano',
  format($$select public.set_project_substatuses(%L, array['lacado_zincado'])$$,
         test.id('ant_proy')),
  '22023', '%Lacado-Zincado%Montaje%');


\echo '== MONTAJE · EL HISTORIAL, EN CASTELLANO'

select test.ok('mon_hist', 'El historial escribe «Pendiente de montaje», no la clave',
  exists (select 1 from public.audit_log
           where entity_type = 'project_substatuses'
             and summary like '%añadió el subestado «Pendiente de montaje»%'));

select test.ok('mon_hist', 'Y «Pendiente de rematar» igual',
  exists (select 1 from public.audit_log
           where entity_type = 'project_substatuses'
             and summary like '%añadió el subestado «Pendiente de rematar»%'));

select test.ok('mon_hist', 'Y las claves técnicas no aparecen por ningún lado',
  not exists (select 1 from public.audit_log
               where summary like '%pendiente_montaje%'
                  or summary like '%pendiente_rematar%'));

-- Hueco de la entrega anterior: «lacado_zincado» estaba en el catálogo
-- pero NO en las etiquetas, así que el historial lo escribía en crudo.
select test.ok('mon_hist', 'Lacado-Zincado también tiene su etiqueta, que antes faltaba',
  public.label_es('lacado_zincado') = 'Lacado-Zincado');

select test.ok('mon_hist', 'Las etiquetas de los dos subestados nuevos',
  public.label_es('pendiente_montaje') = 'Pendiente de montaje'
  and public.label_es('pendiente_rematar') = 'Pendiente de rematar');


\echo '== ANTICIPO · PREVISTO NO ES COBRADO'

-- LA REGLA QUE IMPORTA. El anticipo del proyecto son 1.500 € acordados;
-- mientras nadie diga que han llegado, el total cobrado es cero.
select test.ok('ant_cobro', 'El anticipo previsto se ve, pero NO cuenta como cobrado',
  (select anticipo = 1500 and anticipo_cobrado = 0 and cobrado = 0 and pendiente = 5000
     from public.project_billing where project_id = test.id('ant_proy')),
  (select format('anticipo=%s cobrado_ant=%s cobrado=%s pendiente=%s',
                 anticipo, anticipo_cobrado, cobrado, pendiente)
     from public.project_billing where project_id = test.id('ant_proy')));

select test.ok('ant_cobro', 'Y el estado de facturación no se ha movido solo',
  (select billing_status = 'por_facturar' from public.projects where id = test.id('ant_proy')));


\echo '== ANTICIPO · REGISTRARLO LO CUENTA UNA VEZ'

select test.put('ant_pago',
  (public.register_advance_payment(test.id('ant_proy'))).id);

select test.ok('ant_cobro', 'Se apunta por el importe previsto y queda marcado como anticipo',
  (select amount = 1500 and is_advance and voided_at is null
     from public.payments where id = test.id('ant_pago')));

select test.ok('ant_cobro', 'Con fecha de hoy y una nota que se entiende',
  (select paid_on = public.today_madrid() and notes = 'Anticipo / paga y señal'
     from public.payments where id = test.id('ant_pago')));

-- NO DOS VECES: 1.500 cobrados, no 3.000.
select test.ok('ant_cobro', 'El total cobrado sube UNA vez, no dos',
  (select cobrado = 1500 and pendiente = 3500 and cobros = 1
     from public.project_billing where project_id = test.id('ant_proy')),
  (select format('cobrado=%s pendiente=%s cobros=%s', cobrado, pendiente, cobros)
     from public.project_billing where project_id = test.id('ant_proy')));

select test.ok('ant_cobro', 'Y lo cobrado como anticipo es esa misma parte',
  (select anticipo = 1500 and anticipo_cobrado = 1500
     from public.project_billing where project_id = test.id('ant_proy')));

select test.ok('ant_cobro', 'El estado de facturación se recalcula como con cualquier cobro',
  (select billing_status = 'cobrado_parcial'
     from public.projects where id = test.id('ant_proy')));

select test.ok('ant_cobro', 'Y el cobro queda en el historial con su importe y su proyecto',
  exists (select 1 from public.audit_log
           where entity_type = 'payments'
             and summary like '%1.500,00 €%'
             and summary like '%' ||
                 (select code from public.projects where id = test.id('ant_proy')) || '%'));


\echo '== ANTICIPO · NO SE PUEDE REGISTRAR DOS VECES'

select test.errlike('ant_dup', 'La segunda vez se niega, y lo dice con palabras',
  format($$select public.register_advance_payment(%L)$$, test.id('ant_proy')),
  '22023', '%ya está registrado%');

select test.ok('ant_dup', 'Y no ha apuntado nada al intentarlo',
  (select cobrado = 1500 and cobros = 1
     from public.project_billing where project_id = test.id('ant_proy')));

-- Y POR DEBAJO DE LA FUNCIÓN TAMPOCO. Esta es la garantía de verdad:
-- la regla no depende de que todo el mundo pase por la función.
reset role; select test.as_server();

select test.err('ant_dup', 'Ni insertando a mano un segundo anticipo',
  format($$insert into public.payments (project_id, amount, is_advance)
           values (%L, 50, true)$$, test.id('ant_proy')), '23505');

-- (marcar como anticipo un cobro que ya existía se comprueba más abajo,
--  cuando este proyecto tiene además un cobro normal)


\echo '== ANTICIPO · CONVIVE CON LOS DEMÁS COBROS'

set role authenticated; select test.as_user(test.id('salvi'));
select test.put('ant_pago2',
  (public.register_payment(test.id('ant_proy'), 1000, null, 'Transferencia')).id);

select test.ok('ant_mix', 'Un cobro normal se suma al anticipo sin mezclarse',
  (select cobrado = 2500 and pendiente = 2500 and cobros = 2 and anticipo_cobrado = 1500
     from public.project_billing where project_id = test.id('ant_proy')),
  (select format('cobrado=%s anticipo_cobrado=%s', cobrado, anticipo_cobrado)
     from public.project_billing where project_id = test.id('ant_proy')));

reset role; select test.as_server();
select test.err('ant_mix', 'Y ese cobro normal no se puede marcar también como anticipo',
  format($$update public.payments set is_advance = true where id = %L$$,
         test.id('ant_pago2')), '23505');


\echo '== ANTICIPO · ANULARLO LO QUITA DE LOS DOS SITIOS'

set role authenticated; select test.as_user(test.id('salvi'));
select public.delete_payment(test.id('ant_pago'));

select test.ok('ant_anular', 'Anulado, deja de contar en el total y en el anticipo a la vez',
  (select cobrado = 1000 and anticipo_cobrado = 0 and cobros = 1
     from public.project_billing where project_id = test.id('ant_proy')),
  (select format('cobrado=%s anticipo_cobrado=%s cobros=%s', cobrado, anticipo_cobrado, cobros)
     from public.project_billing where project_id = test.id('ant_proy')));

select test.ok('ant_anular', 'Pero el cobro NO se borra: sigue a la vista, anulado',
  (select voided_at is not null and amount = 1500 and is_advance
     from public.payments where id = test.id('ant_pago')));

select test.ok('ant_anular', 'Y el anticipo previsto del proyecto sigue intacto',
  (select advance_amount = 1500 and budget_amount = 5000
     from public.projects where id = test.id('ant_proy')));

-- Si fue un error, se puede volver a registrar. Y con otro importe,
-- porque a veces la señal que se cobra no es la que se había acordado.
select test.put('ant_pago3',
  (public.register_advance_payment(test.id('ant_proy'), 800)).id);

select test.ok('ant_anular', 'Anulado el anterior, se puede registrar otro con su importe real',
  (select amount = 800 and is_advance from public.payments where id = test.id('ant_pago3')));

select test.ok('ant_anular', 'El previsto no se toca: se ve lo acordado y lo cobrado',
  (select anticipo = 1500 and anticipo_cobrado = 800 and cobrado = 1800
     from public.project_billing where project_id = test.id('ant_proy')),
  (select format('anticipo=%s cobrado_ant=%s cobrado=%s', anticipo, anticipo_cobrado, cobrado)
     from public.project_billing where project_id = test.id('ant_proy')));

select test.ok('ant_anular', 'Y los dos anticipos quedan, uno anulado y otro no',
  (select count(*) = 2 and count(*) filter (where voided_at is null) = 1
     from public.payments where project_id = test.id('ant_proy') and is_advance));


\echo '== ANTICIPO · LO QUE NO SE PUEDE HACER'

-- Un proyecto sin anticipo anotado: la señal no se inventa.
with p as (
  insert into public.projects (client_id, name, budget_amount)
  values (test.id('cli_laura'), 'Puerta corredera taller', 900)
  returning id)
select test.put('ant_sin_prev', (select id from p));

select test.errlike('ant_no', 'Un proyecto sin anticipo previsto no deja registrar uno a ciegas',
  format($$select public.register_advance_payment(%L)$$, test.id('ant_sin_prev')),
  '22023', '%no tiene anticipo anotado%');

select test.ok('ant_no', 'Pero con un importe explícito sí, porque la señal existió',
  (select amount = 300 and is_advance
     from public.register_advance_payment(test.id('ant_sin_prev'), 300)));

select test.errlike('ant_no', 'Un importe negativo se rechaza diciendo que es el importe',
  format($$select public.register_advance_payment(%L, -100)$$, test.id('ant_sin_prev')),
  '22023', '%mayor que cero%');

select test.errlike('ant_no', 'Y un cero igual',
  format($$select public.register_advance_payment(%L, 0)$$, test.id('ant_sin_prev')),
  '22023', '%mayor que cero%');

select test.err('ant_no', 'Y un proyecto que no existe',
  $$select public.register_advance_payment('00000000-0000-0000-0000-000000000000')$$, 'P0002');

-- Un trabajador no apunta cobros. Es dinero.
select test.as_user(test.id('juan'));
select test.err('ant_no', 'Un trabajador no puede registrar el anticipo',
  format($$select public.register_advance_payment(%L)$$, test.id('ant_proy')), '42501');

select test.as_user(test.id('salvi'));


\echo '== ANTICIPO · LAS CUENTAS CUADRAN EN TODA LA BASE'

reset role; select test.as_server();

-- Invariantes sobre TODOS los proyectos, no solo los de esta prueba.
select test.ok('ant_cuentas', 'Lo cobrado como anticipo nunca pasa de lo cobrado',
  (select bool_and(anticipo_cobrado <= cobrado) from public.project_billing),
  (select string_agg(project_id::text, ' | ') from public.project_billing
    where anticipo_cobrado > cobrado));

select test.ok('ant_cuentas', 'El pendiente sigue siendo total − cobrado, sin bajar de cero',
  (select bool_and(pendiente = greatest(total - cobrado, 0)) from public.project_billing),
  (select string_agg(format('%s: %s ≠ %s', project_id, pendiente, greatest(total - cobrado, 0)), ' | ')
     from public.project_billing where pendiente <> greatest(total - cobrado, 0)));

select test.ok('ant_cuentas', 'Y el cobrado es exactamente la suma de los cobros no anulados',
  (select bool_and(b.cobrado = coalesce(s.suma, 0))
     from public.project_billing b
     left join (select project_id, sum(amount) as suma from public.payments
                 where voided_at is null group by project_id) s
            on s.project_id = b.project_id));

-- Nada de lo que ya estaba se ha convertido en anticipo por su cuenta.
select test.ok('ant_cuentas', 'Los únicos anticipos marcados son los de esta prueba',
  (select count(*) = 3 from public.payments where is_advance),
  (select string_agg(project_id::text || ' · ' || amount::text, ' | ')
     from public.payments where is_advance));

select test.ok('ant_cuentas', 'Y ningún otro proyecto tiene cobrado como anticipo',
  (select count(*) = 0 from public.project_billing
    where anticipo_cobrado > 0
      and project_id not in (test.id('ant_proy'), test.id('ant_sin_prev'))));


\echo '== ANTICIPO · LA VISTA NO ROMPE LO QUE YA LA LEÍA'

-- Si una columna cambiara de nombre, de tipo o de sitio, dejaría de
-- funcionar la pantalla de Facturación sin que ninguna otra prueba se
-- enterara.
select test.ok('ant_vista', 'Las cinco columnas de siempre conservan nombre, tipo y orden',
  (select array_agg(column_name || ':' || data_type order by ordinal_position)
          = array['project_id:uuid', 'total:numeric', 'cobrado:numeric',
                  'pendiente:numeric', 'cobros:bigint']
     from information_schema.columns
    where table_schema = 'public' and table_name = 'project_billing'
      and ordinal_position <= 5),
  (select string_agg(column_name || ':' || data_type, ', ' order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'project_billing'));

select test.ok('ant_vista', 'Y las dos nuevas van después, con su tipo',
  (select array_agg(column_name || ':' || data_type order by ordinal_position)
          = array['anticipo:numeric', 'anticipo_cobrado:numeric']
     from information_schema.columns
    where table_schema = 'public' and table_name = 'project_billing'
      and ordinal_position > 5));

select test.ok('ant_vista', 'La vista sigue respetando los permisos de quien pregunta',
  (select reloptions @> array['security_invoker=true']
     from pg_class where relname = 'project_billing'));

-- El índice que lo garantiza, con su condición exacta.
select test.ok('ant_vista', 'El índice de un solo anticipo vivo por proyecto está puesto',
  exists (select 1 from pg_indexes
           where indexname = 'payments_advance_unique'
             and indexdef like '%UNIQUE%(project_id)%is_advance AND (voided_at IS NULL)%'),
  (select indexdef from pg_indexes where indexname = 'payments_advance_unique'));

select test.ok('ant_vista', 'La marca es obligatoria y nace en «no»',
  (select is_nullable = 'NO' and column_default = 'false'
     from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'is_advance'));

-- Un trabajador no ve los cobros: la columna nueva no abre una rendija.
set role authenticated; select test.as_user(test.id('juan'));
select test.ok('ant_vista', 'Un trabajador no ve los cobros de un proyecto que no es suyo',
  (select count(*) = 0 from public.payments where project_id = test.id('ant_proy')));

reset role; select test.as_server();
