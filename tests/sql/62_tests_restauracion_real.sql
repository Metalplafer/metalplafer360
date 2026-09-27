-- =====================================================================
-- METALPLAFER360 · RESTAURAR UNA COPIA DE VERDAD
--
-- El payload de estas pruebas NO está escrito a mano: lo genera
-- 61_payload_real.mjs pasando unas filas por el mismo código que crea el
-- ZIP de la copia y volviéndolo a leer. Al leer un CSV todo vuelve como
-- texto, así que aquí se comprueba que la base de datos convierte bien
-- «false» en falso, «12345.67» en un importe y una casilla vacía en nada.
-- =====================================================================

\set ON_ERROR_STOP on
\i :payload_real

set role authenticated;
select test.as_user(test.id('salvi'));

select test.setnote('resultado_real',
  public.restore_data(test.note('payload_real')::jsonb,
                      array['clientes', 'proyectos', 'ordenes', 'historial'])::text);

select test.ok('restauracion_real', 'Se restaura una copia tal y como sale del ZIP',
  (test.note('resultado_real')::jsonb ->> 'total')::int = 4);

select test.ok('restauracion_real', 'El texto «false» del CSV vuelve a ser un booleano',
  (select no_assembly = false from public.projects
    where id = '00000000-0000-4000-8000-0000000000a2'));

select test.ok('restauracion_real', 'El importe vuelve a ser un número, con sus decimales',
  (select budget_amount = 12345.67 from public.projects
    where id = '00000000-0000-4000-8000-0000000000a2'));

select test.ok('restauracion_real', 'Las horas presupuestadas vuelven como números',
  (select budget_hours_fab = 40 and budget_hours_mont = 16 from public.projects
    where id = '00000000-0000-4000-8000-0000000000a2'));

select test.ok('restauracion_real', 'Las casillas vacías vuelven vacías, no como texto',
  (select finished_at is null and archived_at is null and advance_amount is null
     from public.projects where id = '00000000-0000-4000-8000-0000000000a2'));

select test.ok('restauracion_real', 'Las fechas con hora se recuperan tal cual',
  (select created_at = '2026-09-01T09:00:00+00:00'::timestamptz from public.clients
    where id = '00000000-0000-4000-8000-0000000000a1'));

select test.ok('restauracion_real', 'Y las fechas sueltas también',
  (select scheduled_date = '2026-09-02'::date from public.work_orders
    where id = '00000000-0000-4000-8000-0000000000a3'));

-- Lo que más se rompe al pasar por un CSV: los puntos y coma, las comillas
-- y los saltos de línea dentro de un texto.
select test.ok('restauracion_real', 'Un texto con punto y coma, comillas y saltos de línea llega entero',
  (select description = 'Con un punto y coma; y un salto' || chr(10) || 'de línea, a ver qué pasa.'
     from public.projects where id = '00000000-0000-4000-8000-0000000000a2'));

select test.ok('restauracion_real', 'Y los acentos y la eñe no se estropean',
  (select name = 'Cerrajería del Vallès, S.L.' from public.clients
    where id = '00000000-0000-4000-8000-0000000000a1'));

select test.ok('restauracion_real', 'Las columnas jsonb vuelven a ser jsonb, no texto',
  (select details ->> 'origen' = 'prueba' and (details ->> 'filas')::int = 3
     from public.audit_log where id = 900001));

select test.ok('restauracion_real', 'Respeta las relaciones: la orden encuentra su proyecto',
  (select count(*) = 1 from public.work_orders o
     join public.projects p on p.id = o.project_id
    where o.id = '00000000-0000-4000-8000-0000000000a3'));

-- Una copia abierta y vuelta a guardar con Excel puede dejar casillas
-- vacías donde antes no había nada. No debe reventar con un error raro.
select test.ok('restauracion_real', 'Una copia retocada con Excel no rompe la restauración',
  (public.restore_data(jsonb_build_object('projects', jsonb_build_array(jsonb_build_object(
      'id', '00000000-0000-4000-8000-0000000000a2',
      'code', 'PROY-9999-801',
      'client_id', '00000000-0000-4000-8000-0000000000a1',
      'name', 'Escalera metálica "El Molí"',
      'phase', 'fabricacion', 'billing_status', 'pendiente_cobro',
      'no_assembly', '', 'budget_amount', '', 'finished_at', '',
      'created_at', '2026-09-01T09:00:00+00:00', 'updated_at', '2026-09-01T09:00:00+00:00'))),
    array['proyectos']) ->> 'total')::int = 1);

-- Una casilla vacía retocada con Excel no debe BORRAR un dato bueno:
-- se ignora y el valor se queda como estaba.
select test.ok('restauracion_real', 'Y una casilla vacía no borra el dato que ya había',
  (select budget_amount = 12345.67 from public.projects
    where id = '00000000-0000-4000-8000-0000000000a2'));

reset role;
