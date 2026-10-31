-- =====================================================================
-- METALPLAFER360 · PASAR A LA FASE NUEVA LOS QUE YA ESPERABAN VISITA
--
-- ⚠️  ESTE ARCHIVO SÍ MUEVE PROYECTOS. ES OPCIONAL. LÉELO ANTES.
--
-- El archivo 68 crea la fase «Pendiente de visita técnica» sin tocar
-- nada. Este se ocupa de los proyectos que YA estaban esperando una
-- visita apuntada como subestado de «En preparación», y hace dos cosas:
--
--   1) los pasa a la fase nueva y les quita ese subestado;
--   2) retira «Pendiente visita técnica» de la lista de subestados de
--      «En preparación», para que no queden dos sitios donde apuntar lo
--      mismo;
--   3) y pone al día los datos de ejemplo, que si no dejan de cargarse
--      (sección 5, con el porqué).
--
--
-- POR QUÉ ES UN ARCHIVO APARTE, Y POR QUÉ PUEDES NO EJECUTARLO
--
-- Dos razones, y las dos importan:
--
-- · LA TÉCNICA · PostgreSQL no deja usar un valor nuevo de un enumerado
--   en la misma transacción en que se añade, y el editor de Supabase
--   ejecuta cada script como una transacción. Así que esto NO PODÍA ir
--   dentro del 68 aunque quisiéramos.
--
-- · LA DECISIÓN · mover proyectos es alterar datos reales, y eso lo
--   decides tú. Si prefieres dejar los que hay como están e ir pasando
--   a la fase nueva a mano los que vengan, NO EJECUTES ESTE ARCHIVO:
--   con el 68 basta y la fase funciona igual.
--
--
-- LO QUE PASA SI EJECUTAS EL 68 Y NO ESTE · DÍCHOLO CLARO
--
-- La pantalla deja de ofrecer «Pendiente visita técnica» como subestado
-- de preparación en cuanto se publica esta versión, porque ahora es una
-- fase. Los proyectos que YA lo tuvieran marcado:
--
--   · lo conservan en la base de datos, no se pierde nada;
--   · lo siguen enseñando con su nombre de siempre, porque la pantalla
--     sabe leer los subestados retirados (SUBSTATUSES_RETIRADOS, en
--     «constants.ts»);
--   · pero NO se puede volver a marcar ni desmarcar desde la pantalla.
--
-- Mira cuántos hay antes de decidir:
--
--   select p.code, p.name from public.projects p
--     join public.project_substatuses s on s.project_id = p.id
--    where s.substatus = 'pendiente_visita_tecnica' and p.archived_at is null;
--
-- Si no sale ninguno, este archivo no tiene nada que mover y da igual
-- ejecutarlo o no. Si salen varios, lo razonable es ejecutarlo.
--
--
-- A QUIÉN TOCA, EXACTAMENTE
--
-- Solo a los proyectos que cumplen LAS DOS condiciones:
--
--   · están en fase «preparacion», y
--   · tienen el subestado «pendiente_visita_tecnica».
--
-- Un proyecto en preparación con otros subestados NO se mueve. Uno en
-- fabricación, montaje, facturación o finalizado NO se toca. Y un
-- proyecto archivado tampoco: lo que está archivado se queda como
-- estaba.
--
--
-- SI UN PROYECTO TENÍA VARIOS SUBESTADOS A LA VEZ
--
-- Pasa, porque se pueden marcar varios. Un proyecto con «Pendiente
-- visita técnica» Y «Pendiente planos» se mueve a la fase nueva y
-- PIERDE los dos subestados, porque los subestados son de cada fase y
-- la fase nueva no tiene ninguno.
--
-- Esto es una pérdida de información real y por eso se dice aquí en vez
-- de esconderla: queda anotada en el historial de cada proyecto, con
-- los subestados que tenía antes. Si prefieres que esos no se muevan,
-- no ejecutes este archivo y pásalos tú a mano.
--
--
-- EL HISTORIAL
--
-- El apunte automático diría «Sistema cambió la fase» sin explicar por
-- qué, así que se silencia y se escribe uno a mano por proyecto que
-- dice lo que de verdad pasó y de dónde venía. Quien abra ese proyecto
-- dentro de un año entenderá el salto.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO: la segunda vez no
-- encuentra nada que mover y no escribe ningún apunte.
--
-- EJECUTAR DESPUÉS DEL 68, Y EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) NO SEGUIR SI FALTA EL 68
--
-- Sin la fase nueva esto fallaría a mitad con un error del motor que no
-- explica nada. Mejor decirlo en castellano y parar antes de empezar.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'project_phase' and e.enumlabel = 'pendiente_visita_tecnica') then
    raise exception 'Falta la fase «pendiente_visita_tecnica». Ejecuta antes el archivo 68_fase_visita_tecnica.sql.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1) EL APUNTE EN EL HISTORIAL, ANTES DE MOVER NADA
--
-- Se escribe primero porque necesita leer los subestados que el proyecto
-- tiene AHORA: después de moverlo ya no estarían.
-- ---------------------------------------------------------------------
insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                              entity_code, summary, details, is_demo)
select null,
       'Sistema',
       'cambiar_fase',
       'projects',
       p.id,
       p.code,
       'El proyecto ' || p.code || ' pasa de «En preparación» a «Pendiente de visita técnica»'
         || ' porque estaba marcado como pendiente de visita técnica.',
       jsonb_build_object(
         'migracion',  '69_migrar_visita_tecnica',
         'fase_antes', 'preparacion',
         'fase_ahora', 'pendiente_visita_tecnica',
         'subestados_que_tenia',
           (select jsonb_agg(s.substatus order by s.substatus)
              from public.project_substatuses s
             where s.project_id = p.id and s.phase = 'preparacion')),
       p.is_demo
  from public.projects p
 where p.phase = 'preparacion'
   and p.archived_at is null
   and exists (select 1 from public.project_substatuses s
                where s.project_id = p.id
                  and s.phase = 'preparacion'
                  and s.substatus = 'pendiente_visita_tecnica');


-- ---------------------------------------------------------------------
-- 2) MOVER LOS PROYECTOS
--
-- Se silencia el apunte automático: el bueno ya está escrito arriba.
-- ---------------------------------------------------------------------
select set_config('app.skip_audit', 'on', true);

update public.projects p
   set phase = 'pendiente_visita_tecnica',
       updated_at = now()
 where p.phase = 'preparacion'
   and p.archived_at is null
   and exists (select 1 from public.project_substatuses s
                where s.project_id = p.id
                  and s.phase = 'preparacion'
                  and s.substatus = 'pendiente_visita_tecnica');

-- Los subestados son de cada fase, y la fase nueva no tiene ninguno.
-- Esto es lo mismo que hace «change_project_phase» al cambiar de fase.
delete from public.project_substatuses s
 where s.phase = 'preparacion'
   and exists (select 1 from public.projects p
                where p.id = s.project_id
                  and p.phase = 'pendiente_visita_tecnica');

select set_config('app.skip_audit', 'off', true);


-- ---------------------------------------------------------------------
-- 3) QUE NO QUEDEN DOS SITIOS PARA DECIR LO MISMO
--
-- La MISMA función del archivo 51 —su definición viva— sin
-- «pendiente_visita_tecnica» en la rama de preparación. Lo demás queda
-- letra por letra como estaba.
--
-- Va DESPUÉS de borrar las filas a propósito: la restricción
-- «substatus_valid» de «project_substatuses» llama a esta función, y
-- cambiarla antes dejaría filas que incumplen su propia restricción.
-- ---------------------------------------------------------------------
create or replace function public.valid_substatus(p_phase public.project_phase, p_sub text)
returns boolean language sql immutable as $$
  select case p_phase
    when 'preparacion' then p_sub in
      ('pendiente_planos', 'pendiente_material', 'por_empezar')
    when 'fabricacion' then p_sub in
      ('en_fabricacion', 'falta_material', 'lacado_zincado', 'por_finalizar')
    when 'montaje' then p_sub in
      ('pendiente_montaje', 'en_montaje', 'falta_material',
       'por_finalizar_montaje', 'pendiente_rematar')
    else false
  end;
$$;


-- ---------------------------------------------------------------------
-- 4) POR SI QUEDÓ ALGUNO SUELTO
--
-- Un proyecto ARCHIVADO con ese subestado no se ha movido —y no debe
-- moverse—, pero su fila de subestado ahora incumpliría la función de
-- arriba si alguien lo desarchiva y la toca. Se limpia solo esa fila,
-- sin cambiar la fase del proyecto ni sacarlo del archivo.
-- ---------------------------------------------------------------------
delete from public.project_substatuses
 where phase = 'preparacion' and substatus = 'pendiente_visita_tecnica';


-- ---------------------------------------------------------------------
-- 5) LOS DATOS DE EJEMPLO, QUE SI NO DEJAN DE CARGARSE
--
-- «seed_demo» metía uno de sus ocho proyectos en preparación con el
-- subestado «pendiente_visita_tecnica». En cuanto la función de arriba
-- deja de admitirlo, la restricción «substatus_valid» rechaza esa fila
-- y «Cargar datos de ejemplo» FALLA ENTERO.
--
-- No es una suposición: lo encontró la batería de pruebas de SQL al
-- instalar todo desde cero, con el error
-- «new row for relation "project_substatuses" violates check constraint».
--
-- El arreglo es el que pide el propio cambio: ese proyecto ya no lleva
-- un subestado que diga que espera visita, sino que ESTÁ en la fase que
-- lo dice. Así el ejemplo enseña la fase nueva en cuanto se carga.
--
-- Es la MISMA función del archivo 38 —su definición viva— con dos
-- cambios y ni uno más, comprobados con «diff»:
--
--   · el octavo proyecto nace en «pendiente_visita_tecnica» en vez de
--     en «preparacion»;
--   · desaparece su fila de subestado.
--
-- Esto no toca ninguna fila: cambia lo que hará el ejemplo la próxima
-- vez que alguien lo cargue.
-- ---------------------------------------------------------------------
create or replace function public.seed_demo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  hoy date := public.today_madrid();
  anio int := extract(year from public.today_madrid())::int;
  v_cols text; v_vals text;
  v_client uuid; v_project uuid; v_order uuid; v_worker uuid; v_ficha uuid;
  v_clients uuid[] := '{}'; v_projects uuid[] := '{}'; v_workers uuid[] := '{}';
  v_admins uuid[] := '{}';   -- migración 38: para las visitas
  v_orders uuid[] := '{}';
  i int; j int; r record; v_n int;
  v_resumen jsonb;
begin
  perform public.assert_admin();

  if exists (select 1 from public.clients where is_demo) then
    raise exception 'Los datos de ejemplo ya están puestos. Si quieres volver a '
                    'empezar, usa antes «Limpiar datos demo».' using errcode = '22023';
  end if;

  -- El historial de cada fila lo escribe su disparador; para el ejemplo
  -- sería ruido, así que se silencia y luego se deja una sola anotación.
  perform set_config('app.skip_audit', 'on', true);

  -- =================================================================
  -- 1) SEIS TRABAJADORES
  --
  -- Se crean como usuarios de verdad para que puedan aparecer en las
  -- órdenes y en los informes. Nacen SIN contraseña: si quieres entrar
  -- como uno de ellos, pónsela desde Configuración → Trabajadores.
  --
  -- El insert se arma mirando qué columnas tiene «auth.users» en esta
  -- instalación, porque Supabase tiene muchas más que un PostgreSQL
  -- pelado y no todas existen siempre.
  -- =================================================================
  for r in
    select * from (values
      ('Montse Grau Roca',    'demo.montse',  '600 111 001', 'admin'),
      ('Jordi Pujol Camps',   'demo.jordi',   '600 111 002', 'worker'),
      ('Marc Soler Vidal',    'demo.marc',    '600 111 003', 'worker'),
      ('Iván Ruiz Delgado',   'demo.ivan',    '600 111 004', 'worker'),
      ('Toni Bosch Prat',     'demo.toni',    '600 111 005', 'worker'),
      ('Nuria Cano Mesa',     'demo.nuria',   '600 111 006', 'worker')
    ) as p(nombre, usuario, telefono, rol)
  loop
    -- Los usuarios del ejemplo llevan el prefijo «demo.» para que no
    -- puedan chocar nunca con una persona de verdad.
    if exists (select 1 from public.profiles where username = r.usuario) then
      continue;
    end if;

    v_worker := gen_random_uuid();

    select string_agg(quote_ident(c), ', '),
           string_agg(case c
             when 'id'                 then quote_literal(v_worker) || '::uuid'
             when 'email'              then quote_literal(r.usuario || '@demo.metalplafer')
             when 'raw_user_meta_data' then quote_literal(jsonb_build_object(
                                              'username', r.usuario,
                                              'full_name', r.nombre,
                                              'phone', r.telefono,
                                              'is_demo', true)::text) || '::jsonb'
             when 'raw_app_meta_data'  then quote_literal('{"provider":"email"}') || '::jsonb'
             when 'aud'                then quote_literal('authenticated')
             when 'role'               then quote_literal('authenticated')
             when 'instance_id'        then quote_literal('00000000-0000-0000-0000-000000000000') || '::uuid'
             when 'email_confirmed_at' then 'now()'
             when 'created_at'         then 'now()'
             when 'updated_at'         then 'now()'
             end, ', ')
      into v_cols, v_vals
      from unnest(array['id', 'email', 'raw_user_meta_data', 'raw_app_meta_data',
                        'aud', 'role', 'instance_id', 'email_confirmed_at',
                        'created_at', 'updated_at']) c
     where exists (select 1 from information_schema.columns
                    where table_schema = 'auth' and table_name = 'users' and column_name = c);

    execute format('insert into auth.users (%s) values (%s)', v_cols, v_vals);

    -- El disparador de alta ya ha creado el perfil: se marca y se ajusta.
    update public.profiles
       set is_demo = true, role = r.rol::public.user_role,
           full_name = r.nombre, phone = r.telefono
     where id = v_worker;

    if r.rol = 'worker' then
      v_workers := v_workers || v_worker;
    elsif r.rol = 'admin' then
      v_admins := v_admins || v_worker;   -- migración 38
    end if;
  end loop;

  -- =================================================================
  -- 2) DIEZ CLIENTES
  -- =================================================================
  for r in
    select * from (values
      ('empresa',    'García Construcciones SL',    'B99000001', '937 201 145', 'Carrer de la Indústria, 12', 'Sabadell',    '08202'),
      ('empresa',    'Promocions Vallès SA',        'A99000002', '937 202 233', 'Avinguda Barberà, 88',       'Sabadell',    '08203'),
      ('empresa',    'Reformes Integrals Bages',    'B99000003', '938 745 012', 'Carrer Nou, 3',              'Manresa',     '08241'),
      ('empresa',    'Comunitat Propietaris Rambla','H99000004', '937 203 909', 'Rambla, 45',                 'Sabadell',    '08201'),
      ('empresa',    'Tallers Metàl·lics Ripoll',   'B99000005', '937 204 777', 'Polígon Can Roqueta, nau 8', 'Sabadell',    '08202'),
      ('particular', 'Marta Ferrer Puig',           null,        '620 334 551', 'Passeig Plaça Major, 8',     'Sabadell',    '08201'),
      ('particular', 'Albert Casas Tomàs',          '99000007P', '619 887 442', 'Carrer Sant Antoni, 21',     'Terrassa',    '08221'),
      ('particular', 'Rosa Miralles Font',          null,        '638 112 903', 'Carrer del Sol, 4',          'Castellar',   '08211'),
      ('particular', 'Xavier Oliva Serra',          '99000009R', '655 220 118', 'Avinguda Onze de Setembre, 60', 'Sabadell', '08208'),
      ('particular', 'Dolors Vila Ametller',        null,        '677 909 314', 'Carrer Major, 2',            'Sant Quirze', '08192')
    ) as c(tipo, nombre, cif, tel, dir, ciudad, cp)
  loop
    begin
      insert into public.clients (kind, name, tax_id, phone, address, city, postal_code, is_demo, created_at)
      values (r.tipo::public.client_kind, r.nombre, r.cif, r.tel, r.dir, r.ciudad, r.cp, true,
              now() - (random() * 180 || ' days')::interval)
      returning id into v_client;
    exception when unique_violation then
      -- Los CIF del ejemplo son inventados (99.000.00x), pero si alguno
      -- coincidiera con un cliente real, el ejemplo entra sin CIF.
      insert into public.clients (kind, name, tax_id, phone, address, city, postal_code, is_demo, created_at)
      values (r.tipo::public.client_kind, r.nombre, null, r.tel, r.dir, r.ciudad, r.cp, true,
              now() - (random() * 180 || ' days')::interval)
      returning id into v_client;
    end;
    v_clients := v_clients || v_client;
  end loop;

  -- Un par de personas de contacto en los clientes de empresa
  insert into public.client_contacts (client_id, name, role, phone, is_demo)
  values (v_clients[1], 'Pere García',  'Jefe de obra',  '600 445 112', true),
         (v_clients[2], 'Laia Serrat',  'Administración','600 445 113', true),
         (v_clients[4], 'Joan Rovira',  'Presidente',    '600 445 114', true);

  -- =================================================================
  -- 3) QUINCE FICHAS · presupuestos, visitas y avisos
  -- =================================================================
  for r in
    select * from (values
      ('presupuesto','Barandilla escalera comunitaria', 'aceptado',    1,  6400.00, -95),
      ('presupuesto','Puerta corredera para nave',      'aceptado',    2, 12800.00, -88),
      ('presupuesto','Reja ventana cocina',             'aceptado',    6,  1200.00, -70),
      ('presupuesto','Estructura porche de acero',      'aceptado',    7,  8900.00, -62),
      ('presupuesto','Cerramiento terraza',             'enviado',     9,  4350.00, -21),
      ('presupuesto','Pasamanos de acero inoxidable',   'enviado',     3,  2100.00, -14),
      ('presupuesto','Vallado perimetral 40 m',         'por_revisar', 5, 15200.00,  -9),
      ('presupuesto','Escalera de caracol',             'avanzado',    8,  5600.00,  -6),
      ('presupuesto','Marquesina entrada',              'pendiente',  10,  3300.00,  -3),
      ('presupuesto','Puerta de garaje basculante',     'por_asignar',10,  2750.00,  -1),
      ('visita',     'Medir hueco de escalera',         'realizada',   1,  null,    -40),
      ('visita',     'Ver estado del vallado',          'asignada',    5,  null,     -2),
      ('aviso',      'Puerta de garaje que no cierra',  'cerrado',     4,  null,    -55),
      ('aviso',      'Cierre que no ajusta',            'en_curso',    6,  null,     -4),
      ('aviso',      'Bisagra suelta en la reja',       'por_asignar', 8,  null,      0)
    ) as f(tipo, titulo, estado, cliente, importe, dias)
  loop
    insert into public.fichas (type, client_id, title, status, amount, assigned_to,
                               scheduled_date, address, phone, is_demo, created_at)
    select r.tipo::public.ficha_type, v_clients[r.cliente], r.titulo, r.estado,
           r.importe,
           -- Migración 38 · UNA VISITA ES DE ADMINISTRACIÓN. Antes el
           -- ejemplo se la daba a un trabajador, y eso ya no se permite.
           case when r.estado = 'por_asignar' then null
                when r.tipo = 'visita' then
                  v_admins[1 + (r.cliente % greatest(array_length(v_admins, 1), 1))]
                else v_workers[1 + (r.cliente % greatest(array_length(v_workers, 1), 1))] end,
           case when r.tipo = 'presupuesto' then null else hoy + r.dias + 3 end,
           c.address, c.phone, true, now() + (r.dias || ' days')::interval
      from public.clients c where c.id = v_clients[r.cliente];
  end loop;

  -- =================================================================
  -- 4) OCHO PROYECTOS · repartidos por todas las fases
  -- =================================================================
  for r in
    select * from (values
      ('Barandilla escalera comunitaria','Barandilla de acero para escalera de 4 plantas.','4 tramos · 3,20 m','Negro forja', 1, 6400.00, 40, 16,'finalizado',  'cobrado',        -95),
      ('Puerta corredera para nave',     'Puerta corredera motorizada de 5 × 3 m.',        '5,00 × 3,00 m',   'Galvanizado',  2,12800.00, 72, 24,'facturacion', 'cobrado_parcial',-88),
      ('Reja ventana cocina',            'Reja fija con barrotes cada 12 cm.',             '1,20 × 0,90 m',   'Gris RAL 7016',6, 1200.00,  8,  2,'finalizado',  'cobrado',        -70),
      ('Estructura porche de acero',     'Estructura y cubierta de chapa.',                '6,00 × 3,50 m',   'Imprimación',  7, 8900.00, 56, 32,'montaje',     'pendiente_cobro',-62),
      ('Cerramiento terraza',            'Cerramiento con perfilería y vidrio.',           '4,50 m lineales', 'Blanco',       9, 4350.00, 24, 12,'fabricacion', 'por_facturar',   -30),
      ('Pasamanos de acero inoxidable',  'Pasamanos AISI 304 pulido.',                     '12 m lineales',   'Inox pulido',  3, 2100.00, 16,  6,'fabricacion', 'por_facturar',   -18),
      ('Vallado perimetral',             'Vallado de 40 m con puerta peatonal.',           '40 m',            'Verde RAL 6005',5,15200.00, 88, 40,'preparacion','por_facturar',   -10),
      ('Escalera de caracol',            'Escalera de caracol de dos plantas.',            'Ø 1,60 m',        'Negro forja',  8, 5600.00, 48, 20,'pendiente_visita_tecnica','por_facturar', -5)
    ) as p(nombre, descripcion, medidas, acabado, cliente, importe, hfab, hmont, fase, cobro, dias)
  loop
    insert into public.projects (client_id, name, description, measures, finish, location, address,
                                 budget_amount, budget_hours_fab, budget_hours_mont,
                                 phase, billing_status, finished_at, is_demo, created_at)
    select v_clients[r.cliente], r.nombre, r.descripcion, r.medidas, r.acabado,
           'Obra de ' || c.name, c.address,
           r.importe, r.hfab, r.hmont,
           r.fase::public.project_phase, r.cobro::public.billing_status,
           case when r.fase = 'finalizado' then now() + ((r.dias + 60) || ' days')::interval end,
           true, now() + (r.dias || ' days')::interval
      from public.clients c where c.id = v_clients[r.cliente]
    returning id into v_project;
    v_projects := v_projects || v_project;
  end loop;

  -- Subestados en los proyectos que están en marcha
  insert into public.project_substatuses (project_id, phase, substatus, is_demo)
  values (v_projects[4], 'montaje',     'en_montaje',        true),
         (v_projects[5], 'fabricacion', 'en_fabricacion',    true),
         (v_projects[6], 'fabricacion', 'falta_material',    true),
         (v_projects[7], 'preparacion', 'pendiente_planos',  true);

  -- =================================================================
  -- 5) VEINTE ÓRDENES DE TRABAJO, con sus partes y sus horas
  -- =================================================================
  for r in
    select * from (values
      (1,'fabricacion','Cortar pletina y soldar los cuatro tramos.',      24,'validada',  -80, 2),
      (1,'montaje',    'Colocar la barandilla y anclar a la escalera.',   16,'validada',  -72, 2),
      (2,'fabricacion','Fabricar bastidor y guías.',                      40,'validada',  -60, 3),
      (2,'fabricacion','Montar el motor y probar el recorrido.',          16,'validada',  -52, 2),
      (2,'montaje',    'Instalar en la nave y ajustar finales de carrera.',24,'validada', -40, 3),
      (3,'fabricacion','Cortar barrotes y soldar el marco.',               8,'validada',  -65, 1),
      (3,'montaje',    'Colocar la reja con tacos químicos.',              2,'validada',  -58, 1),
      (4,'fabricacion','Preparar pilares y vigas del porche.',            32,'validada',  -45, 3),
      (4,'fabricacion','Imprimación y acabado de la estructura.',         16,'validada',  -30, 2),
      (4,'montaje',    'Montaje de la estructura en obra.',               24,'realizada',  -2, 3),
      (4,'montaje',    'Colocar la chapa de cubierta.',                    8,'pendiente',   3, 2),
      (5,'fabricacion','Cortar perfilería del cerramiento.',              12,'validada',  -12, 2),
      (5,'fabricacion','Preparar los marcos para el vidrio.',             12,'en_curso',    0, 2),
      (5,'montaje',    'Montar el cerramiento en la terraza.',            12,'pendiente',   5, 2),
      (6,'fabricacion','Cortar y pulir el pasamanos.',                    10,'devuelta',   -3, 1),
      (6,'fabricacion','Soldar soportes intermedios.',                     6,'pendiente',   2, 1),
      (6,'montaje',    'Colocar el pasamanos en la escalera.',             6,'pendiente',   7, 2),
      (7,'fabricacion','Cortar los postes del vallado.',                  40,'pendiente',   4, 3),
      (7,'montaje',    'Replanteo y hormigonado de postes.',              24,'pendiente',   9, 3),
      (8,'fabricacion','Trazar y cortar los peldaños.',                   24,'pendiente',   6, 2)
    ) as o(proyecto, tipo, descripcion, horas, estado, dias, personas)
  loop
    insert into public.work_orders (project_id, type, description, planned_hours,
                                    scheduled_date, status, submitted_at, validated_at, validated_by,
                                    returned_at, return_reason, is_demo, created_at)
    values (v_projects[r.proyecto], r.tipo::public.order_type, r.descripcion, r.horas,
            hoy + r.dias, r.estado::public.order_status,
            case when r.estado in ('realizada', 'validada')
                 then now() + (r.dias || ' days')::interval end,
            case when r.estado = 'validada' then now() + ((r.dias + 1) || ' days')::interval end,
            case when r.estado = 'validada' then (select id from public.profiles
                                                   where role = 'admin' and is_demo limit 1) end,
            case when r.estado = 'devuelta' then now() - interval '2 days' end,
            case when r.estado = 'devuelta'
                 then 'Faltan las fotografías del pulido y las horas no cuadran con el parte.' end,
            true, now() + ((r.dias - 5) || ' days')::interval)
    returning id into v_order;
    v_orders := v_orders || v_order;

    -- El parte de cada persona asignada
    for j in 1 .. least(r.personas, array_length(v_workers, 1)) loop
      insert into public.work_order_workers (order_id, worker_id, work_done, hours, submitted_at, is_demo)
      values (v_order,
              v_workers[1 + ((r.proyecto + j) % array_length(v_workers, 1))],
              case when r.estado in ('realizada', 'validada')
                   then r.descripcion || ' Terminado sin incidencias.'
                   when r.estado = 'en_curso' then 'Empezado esta mañana.'
                   when r.estado = 'devuelta' then 'Pulido terminado.'
                   end,
              case when r.estado in ('realizada', 'validada')
                   then round((r.horas::numeric / r.personas) * (0.85 + random() * 0.3)::numeric, 1)
                   when r.estado = 'en_curso' then 3.5
                   when r.estado = 'devuelta' then 9
                   end,
              case when r.estado in ('realizada', 'validada')
                   then now() + (r.dias || ' days')::interval end,
              true)
      on conflict (order_id, worker_id) do nothing;
    end loop;
  end loop;

  -- =================================================================
  -- 6) MATERIAL PENDIENTE (y lo que ya llegó)
  -- =================================================================
  for r in
    select * from (values
      (5,'Perfil aluminio 60×40',      24,'Aluminis Vallès',     -20, -8, true),
      (5,'Vidrio laminar 6+6',          6,'Vidres Sabadell',     -18, -2, true),
      (6,'Tubo inox 40 mm AISI 304',   12,'Inoxidables Terrassa',-15,  2, false),
      (6,'Soportes de pasamanos',      18,'Ferretería Sabadell', -12, -4, false),
      (7,'Poste galvanizado 2,5 m',    22,'Aceros Vallès',        -8,  6, false),
      (7,'Malla electrosoldada',       40,'Aceros Vallès',        -8,  6, false),
      (8,'Pletina 40×8 mm',            30,'Aceros Vallès',        -5,  9, false),
      (8,'Peldaño chapa lagrimada',    16,'Aceros Vallès',        -5, 11, false),
      (4,'Chapa grecada cubierta',     28,'Cobertes Bages',      -10, -1, false),
      (4,'Tornillería autoperforante',200,'Ferretería Sabadell', -10, -6, true),
      (2,'Motor puerta corredera',      1,'Automatismes Vallès', -50,-42, true),
      (3,'Tacos químicos',             12,'Ferretería Sabadell', -60,-55, true)
    ) as m(proyecto, nombre, unidades, proveedor, pedido, previsto, recibido)
  loop
    insert into public.materials (project_id, name, units, supplier, ordered_on, expected_on,
                                  received, notes, is_demo, created_at)
    values (v_projects[r.proyecto], r.nombre, r.unidades, r.proveedor,
            hoy + r.pedido, hoy + r.previsto, r.recibido,
            case when not r.recibido and hoy + r.previsto < hoy
                 then 'El proveedor avisó de que va con retraso.' end,
            true, now() + (r.pedido || ' days')::interval);
  end loop;

  -- Un aviso del taller pendiente de revisar por administración
  insert into public.material_requests (worker_id, order_id, project_id, body, status, is_demo)
  values (v_workers[1], v_orders[13], v_projects[5],
          'Faltan 3 bisagras para terminar los marcos.', 'pendiente', true);

  -- =================================================================
  -- 7) COBROS
  -- =================================================================
  insert into public.payments (project_id, amount, paid_on, notes, is_demo)
  values (v_projects[1], 3200.00, hoy - 70, 'Anticipo del 50 %',  true),
         (v_projects[1], 3200.00, hoy - 30, 'Resto a la entrega', true),
         (v_projects[2], 6400.00, hoy - 45, 'Anticipo del 50 %',  true),
         (v_projects[3], 1200.00, hoy - 55, 'Pago único',         true);

  -- =================================================================
  -- 8) DOCUMENTOS
  --
  -- Son la FICHA del archivo, no el archivo: el ejemplo no sube nada al
  -- almacenamiento. Aparecen en los listados y en el historial, pero al
  -- intentar descargarlos la aplicación dirá que no los encuentra.
  -- =================================================================
  insert into public.documents (project_id, bucket, storage_path, file_name, category,
                                size_bytes, mime_type, is_demo)
  values (v_projects[1], 'documentos', 'demo/proyectos/1/plano-barandilla.pdf',
          'Plano barandilla.pdf', 'documento', 284_512, 'application/pdf', true),
         (v_projects[2], 'documentos', 'demo/proyectos/2/plano-puerta.pdf',
          'Plano puerta corredera.pdf', 'documento', 612_804, 'application/pdf', true),
         (v_projects[2], 'documentos', 'demo/proyectos/2/ficha-motor.pdf',
          'Ficha técnica del motor.pdf', 'documento', 1_204_331, 'application/pdf', true),
         (v_projects[4], 'documentos', 'demo/proyectos/4/calculo-estructura.pdf',
          'Cálculo de la estructura.pdf', 'documento', 903_117, 'application/pdf', true),
         (v_projects[5], 'documentos', 'demo/proyectos/5/medidas-terraza.pdf',
          'Medidas de la terraza.pdf', 'documento', 156_922, 'application/pdf', true),
         (v_projects[7], 'documentos', 'demo/proyectos/7/replanteo-vallado.pdf',
          'Replanteo del vallado.pdf', 'documento', 421_006, 'application/pdf', true);

  -- =================================================================
  -- 9) Una sola anotación en el historial
  -- =================================================================
  perform set_config('app.skip_audit', 'off', true);

  select jsonb_build_object(
    'clientes',   (select count(*) from public.clients         where is_demo),
    'fichas',     (select count(*) from public.fichas          where is_demo),
    'proyectos',  (select count(*) from public.projects        where is_demo),
    'trabajadores',(select count(*) from public.profiles       where is_demo),
    'ordenes',    (select count(*) from public.work_orders     where is_demo),
    'materiales', (select count(*) from public.materials       where is_demo),
    'documentos', (select count(*) from public.documents       where is_demo),
    'cobros',     (select count(*) from public.payments        where is_demo)
  ) into v_resumen;

  perform public.log_event('datos_demo', 'app_settings',
    public.actor_name() || ' puso los datos de ejemplo', v_resumen);

  return v_resumen;
end $$;

-- Los permisos de siempre, tal cual estaban en el archivo 23.
revoke all    on function public.seed_demo() from public, anon;
grant execute on function public.seed_demo() to authenticated;

-- ---------------------------------------------------------------------
-- 9) ASIGNAR UN PARTE A UN PROYECTO · ahora sabe de los avisos
--
-- Administración puede coger un parte suelto y ponerle un proyecto. Un
-- parte de un AVISO no es un parte suelto: ya tiene dueño. Si se le
-- pusiera además un proyecto, el parte colgaría de dos sitios.
--
-- La restricción del punto 6 ya lo impide, pero el mensaje que da una
-- restricción no lo entiende nadie. Aquí se dice en castellano y con el
-- código del aviso delante. Es el MISMO cuerpo del archivo 27 con esa
-- comprobación añadida; no se quita ni se cambia nada más.
-- ---------------------------------------------------------------------
create or replace function public.assign_report_to_project(p_report uuid, p_project uuid)
returns public.work_reports language plpgsql security definer set search_path = public as $$
declare r public.work_reports; v_project public.projects;
begin
  perform public.assert_admin();

  select * into r from public.work_reports where id = p_report for update;
  if not found then
    raise exception 'No se encuentra el parte de trabajo' using errcode = 'P0002';
  end if;

  -- Un parte de un AVISO DE CLIENTE ya tiene dueño. Ponerle además un
  -- proyecto dejaría el parte colgando de dos sitios, y sus horas se
  -- podrían contar dos veces. Se dice POR QUÉ, en lugar de dejar que
  -- salte la restricción con un mensaje que nadie entiende.
  if p_project is not null and r.ficha_id is not null then
    raise exception 'El parte % es del aviso %, así que no se le puede poner un proyecto. '
                    'Las horas de un aviso van al aviso.',
                    r.code, (select code from public.fichas where id = r.ficha_id)
      using errcode = '22023';
  end if;

  if p_project is not null then
    select * into v_project from public.projects where id = p_project;
    if not found then
      raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
    end if;
  end if;

  update public.work_reports
     set project_id  = p_project,
         assigned_at = case when p_project is null then null else now() end,
         assigned_by = case when p_project is null then null else auth.uid() end,
         updated_at  = now()
   where id = p_report
  returning * into r;

  return r;
end $$;

-- Los permisos de siempre, tal cual estaban en el archivo 28.
grant  execute on function public.assign_report_to_project(uuid, uuid) to authenticated;
revoke execute on function public.assign_report_to_project(uuid, uuid) from anon, public;


-- ---------------------------------------------------------------------
-- 6) COMPROBAR QUE QUEDÓ BIEN
-- ---------------------------------------------------------------------
-- Cuántos han pasado a la fase nueva:
-- select code, name from public.projects
--  where phase = 'pendiente_visita_tecnica' and archived_at is null order by code;
--
-- No debe quedar NI UNO con el subestado antiguo:
-- select count(*) from public.project_substatuses
--  where substatus = 'pendiente_visita_tecnica';
--
-- Y el reparto por fases, para ver que nadie más se ha movido:
-- select phase, count(*) from public.projects
--  where archived_at is null group by phase order by phase;
