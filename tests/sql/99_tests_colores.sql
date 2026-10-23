-- =====================================================================
-- METALPLAFER360 · LOS COLORES DEL CALENDARIO
--
-- Lo que importa aquí:
--
--   · que se guarden donde los ve TODO EL MUNDO, y no en cada navegador;
--   · que un trabajador los reciba igual que administración, porque el
--     calendario es el mismo;
--   · que no se pueda guardar un color inventado ni una categoría que no
--     existe, y que eso lo impida la BASE DE DATOS;
--   · que vaciarlos devuelva los de siempre;
--   · que solo administración los cambie;
--   · y que al cambiarlos no se toque nada más de la configuración.
-- =====================================================================

\set ON_ERROR_STOP on

\echo '== COLORES · DE ENTRADA, LOS DE SIEMPRE'

reset role; select test.as_server();

select test.ok('col_guardar', 'La configuración nace sin ningún color cambiado',
  (select calendar_colors = '{}'::jsonb from public.app_settings where id = 1),
  (select calendar_colors::text from public.app_settings where id = 1));

select test.ok('col_guardar', 'Y la columna es obligatoria, con el objeto vacío por defecto',
  (select is_nullable = 'NO' and column_default like '%{}%'
     from information_schema.columns
    where table_schema = 'public' and table_name = 'app_settings'
      and column_name = 'calendar_colors'),
  (select coalesce(column_default, 'sin valor por defecto') from information_schema.columns
    where table_schema = 'public' and table_name = 'app_settings'
      and column_name = 'calendar_colors'));


\echo '== COLORES · GUARDARLOS'

set role authenticated; select test.as_user(test.id('salvi'));

select test.setnote('col_empresa_antes',
  (select company ->> 'name' from public.app_settings where id = 1));
select test.setnote('col_mb_antes',
  (select max_file_mb::text from public.app_settings where id = 1));

select public.set_calendar_colors(
  '{"fabricacion": "#112233", "material": "#FFD400"}'::jsonb);

select test.ok('col_guardar', 'Se guardan los dos colores cambiados',
  (select calendar_colors ->> 'fabricacion' = '#112233'
      and calendar_colors ->> 'material' = '#FFD400'
     from public.app_settings where id = 1),
  (select calendar_colors::text from public.app_settings where id = 1));

select test.ok('col_guardar', 'Y SOLO esos: lo que no se cambia no se guarda',
  (select count(*) = 2 from jsonb_each(
     (select calendar_colors from public.app_settings where id = 1))),
  (select calendar_colors::text from public.app_settings where id = 1));

select test.ok('col_guardar', 'No se ha tocado nada más de la configuración',
  (select company ->> 'name' from public.app_settings where id = 1)
    = test.note('col_empresa_antes')
  and (select max_file_mb::text from public.app_settings where id = 1)
    = test.note('col_mb_antes'));

select test.ok('col_guardar', 'El historial lo apunta',
  exists (select 1 from public.audit_log
           where action = 'colores_calendario'
             and summary like '%cambió los colores del calendario%'),
  (select summary from public.audit_log
    where action = 'colores_calendario' order by id desc limit 1));

-- Mandar el conjunto completo SUSTITUYE: así se quita un color.
select public.set_calendar_colors('{"fabricacion": "#112233"}'::jsonb);
select test.ok('col_guardar', 'Mandar uno menos lo quita',
  (select calendar_colors = '{"fabricacion": "#112233"}'::jsonb
     from public.app_settings where id = 1),
  (select calendar_colors::text from public.app_settings where id = 1));

select public.set_calendar_colors('{}'::jsonb);
select test.ok('col_guardar', 'Y vaciarlos devuelve los de siempre',
  (select calendar_colors = '{}'::jsonb from public.app_settings where id = 1));


\echo '== COLORES · LO QUE NO SE ADMITE'

select test.err('col_reglas', 'Un color que no es un color se rechaza',
  $$select public.set_calendar_colors('{"fabricacion": "rojo"}'::jsonb)$$, '22023');

select test.err('col_reglas', 'Ni medio escrito',
  $$select public.set_calendar_colors('{"fabricacion": "#12345"}'::jsonb)$$, '22023');

select test.err('col_reglas', 'Ni en otro formato',
  $$select public.set_calendar_colors('{"fabricacion": "rgb(1,2,3)"}'::jsonb)$$, '22023');

select test.err('col_reglas', 'Una categoría que no existe se rechaza',
  $$select public.set_calendar_colors('{"inventada": "#112233"}'::jsonb)$$, '22023');

select test.err('col_reglas', 'Y lo que no es un objeto, también',
  $$select public.set_calendar_colors('"#112233"'::jsonb)$$, '22023');

-- LA SEGUNDA CERRADURA: sin pasar por la función tampoco. La política de
-- «app_settings» deja escribir a administración, así que sin esta
-- restricción un «update» a pelo podría dejar basura en la columna.
select test.err('col_reglas', 'La base de datos no admite basura ni en un «update» directo',
  $$update public.app_settings set calendar_colors = '{"fabricacion": "azul"}'::jsonb
     where id = 1$$, '23514');

select test.err('col_reglas', 'Ni una categoría inventada en un «update» directo',
  $$update public.app_settings set calendar_colors = '{"nocategoria": "#112233"}'::jsonb
     where id = 1$$, '23514');

select test.ok('col_reglas', 'Tras los intentos, la columna sigue limpia',
  (select calendar_colors = '{}'::jsonb from public.app_settings where id = 1),
  (select calendar_colors::text from public.app_settings where id = 1));

-- Las siete categorías del calendario y ni una más. Si alguien añade una
-- categoría al calendario y se olvida de esta función, esto lo caza.
select test.ok('col_reglas', 'Se admiten las siete categorías del calendario',
  (select bool_and(public.valid_calendar_colors(jsonb_build_object(k, '#112233')))
     from (values ('obra'), ('fabricacion'), ('montaje'), ('material'),
                  ('visita'), ('aviso'), ('otro')) as t(k)));

select test.ok('col_reglas', 'Y las categorías admitidas son exactamente las que da «v_calendar»',
  (select coalesce(array_agg(distinct kind::text order by kind::text), '{}')
     from public.v_calendar) <@ array['obra', 'fabricacion', 'montaje', 'material',
                                      'visita', 'aviso', 'otro'],
  (select string_agg(distinct kind::text, ', ') from public.v_calendar));


\echo '== COLORES · LOS VE TODO EL MUNDO'

select public.set_calendar_colors('{"montaje": "#00AA55"}'::jsonb);

select test.ok('col_compartido', 'Administración los recibe al entrar',
  (public.client_config() -> 'calendar_colors' ->> 'montaje') = '#00AA55',
  public.client_config()::text);

-- LA COMPROBACIÓN QUE IMPORTA: el trabajador ve LO MISMO. Si esto
-- fallara, el calendario del taller tendría otros colores que el de
-- administración y nadie entendería de qué color habla el otro.
set role authenticated; select test.as_user(test.id('juan'));

select test.ok('col_compartido', 'Y el trabajador recibe exactamente los mismos',
  (public.client_config() -> 'calendar_colors' ->> 'montaje') = '#00AA55',
  public.client_config()::text);

-- Y lo recibe SIN poder leer la tabla: la política «app_settings_select»
-- es «is_admin()», y por eso existe «client_config», que es una función
-- que se ejecuta como su dueño y devuelve solo lo imprescindible. Si
-- alguien «arreglara» esto abriendo la tabla a los trabajadores, estaría
-- dándoles también los datos fiscales y la configuración de copias.
select test.ok('col_compartido', 'Sin poder leer la tabla: se la da la función, no la política',
  (select count(*) = 0 from public.app_settings),
  (select count(*)::text from public.app_settings));

select test.ok('col_compartido', 'Y lo que recibe trae también lo de antes',
  (public.client_config() ? 'max_file_mb')
  and (public.client_config() ? 'company_name'),
  public.client_config()::text);


\echo '== COLORES · LOS PERMISOS'

select test.err('col_permisos', 'Un trabajador no cambia los colores',
  $$select public.set_calendar_colors('{"montaje": "#000000"}'::jsonb)$$, '42501');

-- Se comprueba DESDE EL SERVIDOR porque un trabajador no puede leer la
-- tabla: preguntándolo con su sesión no vendría ninguna fila y la
-- comprobación pasaría sin comprobar nada.
reset role; select test.as_server();
select test.ok('col_permisos', 'Y no ha cambiado nada al intentarlo',
  (select calendar_colors ->> 'montaje' = '#00AA55'
     from public.app_settings where id = 1),
  (select calendar_colors::text from public.app_settings where id = 1));
set role authenticated; select test.as_user(test.id('juan'));

-- Escribir en la tabla no da error: la política no le deja ver ninguna
-- fila que actualizar, así que su «update» no cambia nada. Es como se
-- comportan las demás escrituras de la aplicación.
update public.app_settings set calendar_colors = '{}'::jsonb where id = 1;

reset role; select test.as_server();
select test.ok('col_permisos', 'Ni escribiendo en la tabla directamente cambia nada',
  (select calendar_colors ->> 'montaje' = '#00AA55'
     from public.app_settings where id = 1),
  (select calendar_colors::text from public.app_settings where id = 1));
set role authenticated; select test.as_user(test.id('juan'));

set role anon; select test.as_anon();

select test.err('col_permisos', 'Sin sesión no se pueden cambiar',
  $$select public.set_calendar_colors('{}'::jsonb)$$, '42501');

-- Y sin sesión no se llega ni a preguntar: «client_config» no está
-- concedida a «anon». La función tiene además su propia comprobación
-- («is_active_user»), pero el permiso salta antes.
select test.err('col_permisos', 'Sin sesión no se puede ni pedir la configuración del cliente',
  'select public.client_config()', '42501');

reset role; select test.as_server();
-- Se dejan como estaban para no condicionar otras pruebas.
update public.app_settings set calendar_colors = '{}'::jsonb where id = 1;
