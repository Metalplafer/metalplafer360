-- =====================================================================
-- METALPLAFER360 · 23 · DATOS DE EJEMPLO
--
-- Rellena la aplicación con un taller inventado para poder aprender a
-- usarla, enseñarla o hacer pruebas sin miedo: 10 clientes, 15 fichas,
-- 8 proyectos, 6 trabajadores, 20 órdenes, material y documentos.
--
-- TODO lo que se crea aquí queda marcado con «is_demo». El botón
-- «Limpiar datos demo» de Configuración borra exactamente eso y NADA
-- más: lo que haya creado la empresa de verdad no se toca.
--
-- Las fechas se calculan a partir de hoy, así que el ejemplo siempre
-- parece reciente, se ejecute cuando se ejecute.
--
-- Este archivo NO hace falta para trabajar. Si la empresa ya está
-- usando la aplicación con datos reales, puede no ejecutarlo nunca.
-- =====================================================================


-- ---------------------------------------------------------------------
-- CREAR LOS DATOS DE EJEMPLO
-- ---------------------------------------------------------------------
create or replace function public.seed_demo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  hoy date := public.today_madrid();
  anio int := extract(year from public.today_madrid())::int;
  v_cols text; v_vals text;
  v_client uuid; v_project uuid; v_order uuid; v_worker uuid; v_ficha uuid;
  v_clients uuid[] := '{}'; v_projects uuid[] := '{}'; v_workers uuid[] := '{}';
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
           case when r.estado = 'por_asignar' then null
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
      ('Escalera de caracol',            'Escalera de caracol de dos plantas.',            'Ø 1,60 m',        'Negro forja',  8, 5600.00, 48, 20,'preparacion','por_facturar',    -5)
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
         (v_projects[7], 'preparacion', 'pendiente_planos',  true),
         (v_projects[8], 'preparacion', 'pendiente_visita_tecnica', true);

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


-- ---------------------------------------------------------------------
-- LIMPIAR LOS DATOS DE EJEMPLO
--
-- Borra EXACTAMENTE las filas marcadas como ejemplo y nada más. Se
-- recorren las tablas de la más dependiente a la menos, para no dejar
-- referencias colgando.
-- ---------------------------------------------------------------------
create or replace function public.clear_demo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t text; v_n int; v_borradas jsonb := '{}'::jsonb; v_total int := 0;
  v_users uuid[];
begin
  perform public.assert_admin();

  -- El historial de cada borrado sería ruido: se deja una sola anotación.
  perform set_config('app.skip_audit', 'on', true);

  foreach t in array array[
    'comments', 'documents', 'payments', 'material_requests', 'materials',
    'work_order_workers', 'work_orders', 'project_substatuses', 'projects',
    'fichas', 'client_contacts', 'clients', 'notifications', 'audit_log'
  ] loop
    execute format('delete from public.%I where is_demo', t);
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_borradas := v_borradas || jsonb_build_object(t, v_n);
      v_total := v_total + v_n;
    end if;
  end loop;

  -- Los trabajadores de ejemplo, al final: ya no les queda trabajo atado.
  select array_agg(id) into v_users from public.profiles where is_demo;
  if v_users is not null then
    delete from auth.users where id = any(v_users);
    -- Si la instalación no borra el perfil en cascada, se quita a mano.
    delete from public.profiles where id = any(v_users);
    v_borradas := v_borradas || jsonb_build_object('profiles', array_length(v_users, 1));
    v_total := v_total + array_length(v_users, 1);
  end if;

  perform set_config('app.skip_audit', 'off', true);

  perform public.log_event('limpiar_demo', 'app_settings',
    public.actor_name() || ' limpió los datos de ejemplo (' || v_total || ' registros)',
    jsonb_build_object('borradas', v_borradas, 'total', v_total));

  return jsonb_build_object('borradas', v_borradas, 'total', v_total);
end $$;


-- ---------------------------------------------------------------------
-- ¿Hay datos de ejemplo puestos ahora mismo?
-- ---------------------------------------------------------------------
create or replace function public.demo_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'hay_datos', exists (select 1 from public.clients where is_demo),
    'clientes',   (select count(*) from public.clients      where is_demo),
    'fichas',     (select count(*) from public.fichas       where is_demo),
    'proyectos',  (select count(*) from public.projects     where is_demo),
    'trabajadores',(select count(*) from public.profiles    where is_demo),
    'ordenes',    (select count(*) from public.work_orders  where is_demo),
    'materiales', (select count(*) from public.materials    where is_demo),
    'documentos', (select count(*) from public.documents    where is_demo),
    'cobros',     (select count(*) from public.payments     where is_demo)
  ) where public.is_admin();
$$;


-- ---------------------------------------------------------------------
-- PERMISOS · solo administración
-- ---------------------------------------------------------------------
revoke all on function public.seed_demo()   from public, anon;
revoke all on function public.clear_demo()  from public, anon;
revoke all on function public.demo_status() from public, anon;
grant execute on function public.seed_demo()   to authenticated;
grant execute on function public.clear_demo()  to authenticated;
grant execute on function public.demo_status() to authenticated;
