-- =====================================================================
-- METALPLAFER360 · DOS ESTADOS NUEVOS
--
--   · PRESUPUESTOS · «Pendiente de paga y señal», entre «enviado» y
--     «aceptado». El cliente ya ha dicho sí, pero todavía no ha pagado,
--     así que el trabajo NO puede empezar: no se convierte en proyecto.
--   · FABRICACIÓN · el subestado «Lacado-Zincado».
--
-- MIGRACIÓN ESTRUCTURAL. No crea ni borra ninguna tabla: solo amplía
-- cuatro funciones. NO cambia el estado de ningún presupuesto ni de
-- ningún proyecto existente.
--
--
-- POR QUÉ ESTO FUNCIONA SIN TOCAR NINGUNA RESTRICCIÓN
--
-- Los dos catálogos viven dentro de funciones «immutable» a las que
-- llaman sendas restricciones «check»:
--
--   fichas.fichas_status_valid            → valid_ficha_status(type, status)
--   project_substatuses.substatus_valid   → valid_substatus(phase, substatus)
--
-- Redefinir la función cambia lo que la restricción acepta, sin tener
-- que borrarla ni revalidar la tabla. Eso PODÍA no funcionar, así que se
-- comprobó contra PostgreSQL 16 antes de escribir este archivo: con la
-- función redefinida, la base de datos acepta el valor nuevo y sigue
-- rechazando uno inventado. Las pruebas del archivo 94 lo dejan fijado.
--
-- Hace falta redefinir también «label_es», que es la que traduce los
-- estados en el historial: sin ella, el historial escribiría
-- «pendiente_senal» en crudo.
--
--
-- «POR ASIGNAR» NO SE QUITA DE AQUÍ, y es a propósito
--
-- El archivo 43 lo saca del flujo de los presupuestos y de los avisos,
-- pero el catálogo lo sigue admitiendo: hay fichas que lo tienen, y
-- quitarlo las dejaría en falta con su propia restricción en cuanto
-- alguien las guardara. Dejar de PRODUCIR un estado y dejar de
-- ADMITIRLO son dos cosas distintas.
--
-- DEPENDENCIAS: ninguna nueva. Conviene aplicarlo después de la 38 y la
-- 39 para no dejar la numeración a medias, pero no las necesita.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) EL CATÁLOGO DE ESTADOS DE FICHA
--
-- Es el MISMO cuerpo del archivo 06 con el estado nuevo añadido.
-- ---------------------------------------------------------------------
create or replace function public.valid_ficha_status(p_type public.ficha_type, p_status text)
returns boolean language sql immutable as $$
  select case p_type
    when 'presupuesto' then p_status in
      -- «por_asignar» SE QUEDA aunque los presupuestos ya no nazcan ahí:
      -- hay fichas que lo tienen y quitarlo las dejaría en falta con su
      -- propia restricción en cuanto alguien las tocara.
      ('por_asignar', 'pendiente', 'avanzado', 'por_revisar', 'enviado',
       'pendiente_senal', 'aceptado', 'cancelado')
    when 'visita' then p_status in
      ('por_asignar', 'asignada', 'realizada', 'cancelada')
    when 'aviso' then p_status in
      ('por_asignar', 'pendiente', 'asignado', 'en_curso', 'realizado', 'cerrado')
  end;
$$;

-- ---------------------------------------------------------------------
-- 2) EL CATÁLOGO DE SUBESTADOS
--
-- El MISMO cuerpo del archivo 09 con «Lacado-Zincado» dentro de
-- fabricación. Va entre «falta_material» y «por_finalizar» porque es el
-- orden en que ocurre el trabajo.
-- ---------------------------------------------------------------------
create or replace function public.valid_substatus(p_phase public.project_phase, p_sub text)
returns boolean language sql immutable as $$
  select case p_phase
    when 'preparacion' then p_sub in
      ('pendiente_visita_tecnica', 'pendiente_planos', 'pendiente_material', 'por_empezar')
    when 'fabricacion' then p_sub in
      ('en_fabricacion', 'falta_material', 'lacado_zincado', 'por_finalizar')
    when 'montaje' then p_sub in
      ('en_montaje', 'falta_material', 'por_finalizar_montaje')
    else false
  end;
$$;

-- ---------------------------------------------------------------------
-- 3) LA TRADUCCIÓN PARA EL HISTORIAL
--
-- El MISMO cuerpo del archivo 10 con una línea más. Sin esto, el
-- historial diría «cambió la ficha PRES-2026-004 · Presupuesto enviado →
-- pendiente_senal», con el valor en crudo.
-- ---------------------------------------------------------------------
create or replace function public.label_es(p text) returns text
language sql immutable as $$
  select coalesce(case p
    -- Fichas · presupuestos
    when 'por_asignar' then 'Por asignar'
    when 'pendiente'   then 'Pendiente'
    when 'avanzado'    then 'Presupuesto avanzado'
    when 'por_revisar' then 'Presupuesto por revisar'
    when 'enviado'     then 'Presupuesto enviado'
    when 'pendiente_senal' then 'Pendiente de paga y señal'
    when 'aceptado'    then 'Presupuesto aceptado'
    when 'cancelado'   then 'Presupuesto cancelado'
    -- Fichas · visitas
    when 'asignada'    then 'Asignada'
    when 'realizada'   then 'Realizada'
    when 'cancelada'   then 'Cancelada'
    -- Fichas · avisos
    when 'asignado'    then 'Asignado'
    when 'en_curso'    then 'En curso'
    when 'realizado'   then 'Realizado'
    when 'cerrado'     then 'Cerrado'
    -- Tipos de ficha
    when 'presupuesto' then 'presupuesto'
    when 'visita'      then 'visita'
    when 'aviso'       then 'aviso'
    -- Fases del proyecto
    when 'preparacion' then 'En preparación'
    when 'fabricacion' then 'Fabricación'
    when 'montaje'     then 'Montaje'
    when 'facturacion' then 'Facturación'
    when 'finalizado'  then 'Finalizado'
    -- Subestados
    when 'pendiente_visita_tecnica' then 'Pendiente visita técnica'
    when 'pendiente_planos'         then 'Pendiente planos'
    when 'pendiente_material'       then 'Pendiente material'
    when 'por_empezar'              then 'Por empezar'
    when 'en_fabricacion'           then 'En fabricación'
    when 'falta_material'           then 'Falta material'
    when 'por_finalizar'            then 'Por finalizar'
    when 'en_montaje'               then 'En montaje'
    when 'por_finalizar_montaje'    then 'Por finalizar montaje'
    -- Estados de facturación
    when 'por_facturar'    then 'Por facturar'
    when 'pendiente_cobro' then 'Pendiente de cobro'
    when 'cobrado_parcial' then 'Cobrado parcialmente'
    when 'cobrado'         then 'Cobrado'
  end, p);
$$;

-- ---------------------------------------------------------------------
-- 4) UN PRESUPUESTO PENDIENTE DE PAGA Y SEÑAL NO SE CONVIERTE
--
-- Es lo que de verdad hace falta del estado nuevo: que el trabajo no
-- empiece antes de cobrar la señal.
--
-- El MISMO cuerpo del archivo 10 con una comprobación añadida ANTES de
-- la que ya había. Se pone antes para poder decir POR QUÉ no se puede
-- convertir: el mensaje genérico («solo los aceptados») no explicaría
-- que falta cobrar, que es lo único que falta.
--
-- La comprobación que ya existía se queda intacta: un presupuesto en
-- cualquier otro estado sigue rechazándose como siempre.
-- ---------------------------------------------------------------------
create or replace function public.convert_budget_to_project(p_ficha uuid, p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare f public.fichas; v_id uuid; v_code text;
begin
  perform public.assert_admin();

  select * into f from public.fichas where id = p_ficha for update;
  if not found or f.type <> 'presupuesto' then
    raise exception 'No se encuentra el presupuesto' using errcode = 'P0002';
  end if;

  -- Un presupuesto en «Pendiente de paga y señal» está aceptado por el
  -- cliente pero NO cobrado, así que todavía no es un proyecto. Se dice
  -- con esas palabras, que es lo que hace falta entender.
  if f.status = 'pendiente_senal' then
    raise exception 'El presupuesto % está pendiente de paga y señal. Cuando la cobréis, '
                    'pasadlo a «Presupuesto aceptado» y entonces se podrá convertir en proyecto.',
                    f.code
      using errcode = '22023';
  end if;

  if f.status <> 'aceptado' then
    raise exception 'Solo los presupuestos aceptados pueden convertirse en proyecto'
      using errcode = '22023';
  end if;

  select code into v_code from public.projects where source_ficha_id = p_ficha;
  if v_code is not null then
    raise exception 'Este presupuesto ya se convirtió en el proyecto %', v_code
      using errcode = '23505';
  end if;

  insert into public.projects (client_id, contact_id, source_ficha_id, name, description,
                               address, budget_amount, created_by, is_demo)
  values (f.client_id, f.contact_id, f.id,
          coalesce(nullif(trim(p_name), ''), nullif(trim(f.title), ''), 'Proyecto de ' || f.code),
          f.description, f.address, f.amount, auth.uid(), f.is_demo)
  returning id into v_id;

  return v_id;
end $$;
-- Los permisos de siempre, tal cual estaban en el archivo 11.
grant  execute on function public.convert_budget_to_project(uuid, text) to authenticated;
revoke execute on function public.convert_budget_to_project(uuid, text) from anon, public;
