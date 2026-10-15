-- =====================================================================
-- METALPLAFER360 · CUÁNTO ESPACIO QUEDA
--
-- Lo que importa aquí:
--   · que SIN cuota declarada no se invente ninguna capacidad: ni
--     porcentaje, ni barra, ni «queda tanto»;
--   · que al declararla salga el porcentaje y el aviso que toca, y que
--     los umbrales sean los que dice la documentación (70 % y 90 %);
--   · que los archivos, la base de datos y las copias vayan SEPARADOS,
--     y que las copias queden fuera de la cuota de Supabase porque
--     ocupan en Drive;
--   · que se vea la diferencia entre lo que la aplicación cree que hay y
--     lo que hay DE VERDAD en el contenedor;
--   · que esto sea solo de administración, aunque se pida a mano;
--   · que quede en el historial quién declaró la cuota y cuándo.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== ALMACÉN · SIN CUOTA DECLARADA NO SE INVENTA NADA'

reset role; select test.as_server();
update public.app_settings
   set storage_quota_mb = null, db_quota_mb = null,
       quota_checked_on = null, quota_note = null
 where id = 1;

set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('al_sin', 'El resumen trae sus cinco conceptos, separados',
  (select count(*) = 5 from public.storage_summary()));

select test.ok('al_sin', 'Están los archivos, la base de datos y las copias, cada uno aparte',
  (select count(*) = 3 from public.storage_summary()
    where concepto in ('Archivos', 'Base de datos', 'Copias de seguridad')));

select test.ok('al_sin', 'Sin declarar, los archivos NO tienen capacidad ni porcentaje',
  (select cuota_bytes is null and porcentaje is null and libre_bytes is null
      and nivel = 'sin_cuota'
     from public.storage_summary() where concepto = 'Archivos'));

select test.ok('al_sin', 'Y la base de datos tampoco',
  (select cuota_bytes is null and porcentaje is null and nivel = 'sin_cuota'
     from public.storage_summary() where concepto = 'Base de datos'));

select test.ok('al_sin', 'Pero lo OCUPADO sí se sabe: eso se mide, no se declara',
  (select usado_bytes is not null and medido
     from public.storage_summary() where concepto = 'Archivos'));

select test.ok('al_sin', 'El tamaño de la base de datos se mide de verdad y es mayor que cero',
  (select usado_bytes > 0 and medido
     from public.storage_summary() where concepto = 'Base de datos'));

select test.ok('al_sin', 'Las copias dicen que ocupan en Drive, fuera de la cuota de Supabase',
  (select cuota_bytes is null and detalle like '%Drive%'
     from public.storage_summary() where concepto = 'Copias de seguridad'));


\echo '== ALMACÉN · LOS UMBRALES SON LOS QUE SE DOCUMENTAN'

select test.ok('al_umbral', 'Por debajo del 70 % no se avisa',
  public.quota_level(69, 100) = 'bien');
select test.ok('al_umbral', 'Al 70 % se avisa',
  public.quota_level(70, 100) = 'atencion');
select test.ok('al_umbral', 'Hasta el 89 % sigue siendo aviso',
  public.quota_level(89, 100) = 'atencion');
select test.ok('al_umbral', 'Al 90 % pasa a crítico',
  public.quota_level(90, 100) = 'critico');
select test.ok('al_umbral', 'Y lleno, también',
  public.quota_level(100, 100) = 'critico');
select test.ok('al_umbral', 'Sin capacidad declarada no hay nivel que dar',
  public.quota_level(500, null) = 'sin_cuota');


\echo '== ALMACÉN · AL DECLARARLA, SALE EL PORCENTAJE'

select test.setnote('al_usado', (
  select usado_bytes::text from public.storage_summary() where concepto = 'Archivos'));

-- Se declara una capacidad pequeña a propósito, para que el porcentaje
-- sea comprobable: 1 MB.
select public.save_storage_quota(1, 500, 'Plan comprobado en la factura de Supabase.');

select test.ok('al_con', 'Queda guardada la capacidad de los archivos y de la base de datos',
  (select storage_quota_mb = 1 and db_quota_mb = 500 from public.app_settings where id = 1));

select test.ok('al_con', 'Y la fecha en que se comprobó, para saber si está vieja',
  (select quota_checked_on = public.today_madrid() from public.app_settings where id = 1));

select test.ok('al_con', 'Y la nota de dónde salió',
  (select quota_note like '%factura de Supabase%' from public.app_settings where id = 1));

select test.ok('al_con', 'Ahora los archivos tienen capacidad, porcentaje y espacio libre',
  (select cuota_bytes = 1048576 and porcentaje is not null and libre_bytes is not null
     from public.storage_summary() where concepto = 'Archivos'));

select test.ok('al_con', 'El porcentaje es lo ocupado entre lo que cabe',
  (select porcentaje = round(test.note('al_usado')::numeric * 100 / 1048576, 1)
     from public.storage_summary() where concepto = 'Archivos'),
  (select porcentaje::text from public.storage_summary() where concepto = 'Archivos'));

select test.ok('al_con', 'Lo libre es lo que cabe menos lo ocupado, y nunca negativo',
  (select libre_bytes = greatest(1048576 - usado_bytes, 0) and libre_bytes >= 0
     from public.storage_summary() where concepto = 'Archivos'));

select test.ok('al_con', 'La base de datos lleva su propia capacidad, no la de los archivos',
  (select cuota_bytes = 500::bigint * 1024 * 1024
     from public.storage_summary() where concepto = 'Base de datos'));

select test.ok('al_con', 'Y las copias siguen sin capacidad: no ocupan en Supabase',
  (select cuota_bytes is null
     from public.storage_summary() where concepto = 'Copias de seguridad'));

-- Con una capacidad tan pequeña, lo que haya ya pasa del 90 %.
select test.ok('al_con', 'Si lo ocupado pasa del 90 % de lo que cabe, el aviso es crítico',
  (select nivel = 'critico' from public.storage_summary()
    where concepto = 'Archivos' and usado_bytes >= 1048576 * 0.9)
  or (select usado_bytes < 1048576 * 0.9 from public.storage_summary()
       where concepto = 'Archivos'));


\echo '== ALMACÉN · LO REGISTRADO Y LO QUE HAY DE VERDAD'

-- Las DOS direcciones en que pueden no cuadrar, cada una por su lado.
--
-- En esta batería, las pruebas registran fichas en «documents» sin subir
-- ningún archivo de verdad, así que de partida la aplicación cuenta MÁS
-- que el contenedor. Es el caso «una ficha quedó sin archivo».
set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('al_huerfano', 'El contenedor se mide de verdad, no por las fichas',
  (select medido from public.storage_summary()
    where concepto = 'Medido en el contenedor'));

select test.ok('al_huerfano', 'Si la aplicación cuenta más que el contenedor, se dice',
  (select detalle like '%La aplicación cuenta%más%'
     from public.storage_summary() where concepto = 'Medido en el contenedor'),
  (select detalle from public.storage_summary() where concepto = 'Medido en el contenedor'));

-- Y AHORA LA OTRA DIRECCIÓN: un archivo en el contenedor SIN su ficha,
-- que es lo que pasa cuando una subida se queda a medias. Hasta ahora
-- ese archivo no aparecía por ningún lado y seguía ocupando.
--
-- Se le pone un tamaño mayor que todo lo registrado, para que la
-- diferencia cambie de signo y se vea el otro mensaje.
reset role; select test.as_server();
select test.setnote('al_registrado', (
  select coalesce(sum(size_bytes), 0)::text from public.documents));
insert into storage.objects (bucket_id, name, metadata)
values ('documentos', 'reports/huerfano/perdido.jpg',
        jsonb_build_object('size', test.note('al_registrado')::bigint + 1048576));

set role authenticated; select test.as_user(test.id('salvi'));

select test.ok('al_huerfano', 'Y si hay más en el contenedor que en la aplicación, también',
  (select detalle like '%más en el contenedor%'
     from public.storage_summary() where concepto = 'Medido en el contenedor'),
  (select detalle from public.storage_summary() where concepto = 'Medido en el contenedor'));

select test.ok('al_huerfano', 'Diciendo cuánto, para saber si merece la pena mirarlo',
  (select detalle like '%kB%' or detalle like '%MB%' or detalle like '%bytes%'
     from public.storage_summary() where concepto = 'Medido en el contenedor'),
  (select detalle from public.storage_summary() where concepto = 'Medido en el contenedor'));

select test.ok('al_huerfano', 'Y el huérfano cuenta en lo ocupado del contenedor',
  (select usado_bytes > test.note('al_registrado')::bigint
     from public.storage_summary() where concepto = 'Medido en el contenedor'));

reset role; select test.as_server();
delete from storage.objects where name = 'reports/huerfano/perdido.jpg';
set role authenticated; select test.as_user(test.id('salvi'));


\echo '== ALMACÉN · LA PAPELERA SE CUENTA, Y SE DICE QUE SE PUEDE RECUPERAR'

select test.ok('al_papelera', 'La papelera sale aparte, dentro de los archivos',
  (select count(*) = 1 from public.storage_summary()
    where concepto = 'De eso, en la papelera'));

select test.ok('al_papelera', 'Y se dice que es el espacio más fácil de recuperar',
  (select detalle like '%más fácil de recuperar%'
     from public.storage_summary() where concepto = 'De eso, en la papelera'));

select test.ok('al_papelera', 'Los archivos cuentan también lo que está en la papelera',
  (select a.usado_bytes >= p.usado_bytes
     from public.storage_summary() a, public.storage_summary() p
    where a.concepto = 'Archivos' and p.concepto = 'De eso, en la papelera'));


\echo '== ALMACÉN · RETIRAR LA CUOTA'

select public.save_storage_quota(null, null, null);

select test.ok('al_retirar', 'Se puede retirar la capacidad declarada',
  (select storage_quota_mb is null and db_quota_mb is null
     from public.app_settings where id = 1));

select test.ok('al_retirar', 'Y se borra la fecha: ya no hay nada que fechar',
  (select quota_checked_on is null from public.app_settings where id = 1));

select test.ok('al_retirar', 'El resumen vuelve a decir que no hay capacidad declarada',
  (select nivel = 'sin_cuota' and porcentaje is null
     from public.storage_summary() where concepto = 'Archivos'));

select test.err('al_retirar', 'Una capacidad de cero no vale: o hay cifra o no hay',
  $$select public.save_storage_quota(0, 100, null)$$, '22023');

select test.err('al_retirar', 'Ni negativa',
  $$select public.save_storage_quota(100, -5, null)$$, '22023');


\echo '== ALMACÉN · ESTO ES DE ADMINISTRACIÓN'

select test.ok('al_historial', 'Queda en el historial quién declaró la capacidad y cuándo',
  exists (select 1 from public.audit_log
           where action = 'cuota_almacenamiento' and entity_type = 'app_settings'
             and summary like '%declaró la capacidad%'
             and (details ->> 'storage_quota_mb')::int = 1));

select test.ok('al_historial', 'Y también cuando se retira',
  exists (select 1 from public.audit_log
           where action = 'cuota_almacenamiento'
             and summary like '%retiró la capacidad%'));

reset role; set role authenticated; select test.as_user(test.id('juan'));

select test.err('al_permisos', 'Un trabajador no saca el resumen del almacenamiento',
  $$select count(*) from public.storage_summary()$$, '42501');

select test.err('al_permisos', 'Ni declara ninguna capacidad',
  $$select public.save_storage_quota(999, 999, 'me lo invento')$$, '42501');

select test.ok('al_permisos', 'Ni lee los ajustes para enterarse por su cuenta',
  (select count(*) = 0 from public.app_settings));

-- Y escribiendo a pelo en la tabla. Ojo: esto NO da error. RLS no
-- rechaza la escritura, simplemente no le entrega la fila, así que el
-- «update» dice que ha ido bien y no ha cambiado nada. Por eso lo que se
-- comprueba es el RESULTADO, desde el servidor, y no que salte un error:
-- dar por bueno un error que no existe habría dejado el agujero abierto.
update public.app_settings set storage_quota_mb = 999999 where id = 1;

reset role; select test.as_server();
select test.ok('al_permisos', 'Si la escribe a pelo, el «update» no cambia nada',
  (select storage_quota_mb is null from public.app_settings where id = 1),
  (select coalesce(storage_quota_mb::text, 'sin declarar')
     from public.app_settings where id = 1));
