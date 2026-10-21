-- =====================================================================
-- METALPLAFER360 · SUBESTADOS DE MONTAJE Y EL ANTICIPO COMO COBRO
--
--   M3 · dos subestados nuevos en la fase de montaje.
--   M4 · poder registrar el anticipo o la paga y señal como cobro.
--
-- MIGRACIÓN ESTRUCTURAL. Redefine tres funciones que ya existían, añade
-- una columna, un índice, una función y amplía una vista. NO borra ni
-- modifica NINGÚN registro existente, ni cambia el estado o el subestado
-- de ningún proyecto, ni toca un solo importe.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- =====================================================================
-- M3 · DOS SUBESTADOS NUEVOS EN MONTAJE
--
-- «Pendiente de montaje» va PRIMERO y «Pendiente de rematar» va ÚLTIMO,
-- que es el recorrido real del trabajo: algo que espera para montarse, y
-- algo ya montado al que le faltan remates.
--
-- Los tres subestados que ya había se quedan como estaban y en el mismo
-- orden entre ellos. Ningún proyecto cambia de subestado: esto solo
-- amplía lo que se PUEDE elegir.
--
--
-- POR QUÉ ESTO FUNCIONA SIN TOCAR LA RESTRICCIÓN
--
-- «project_substatuses» tiene un CHECK —«substatus_valid»— que llama a
-- «valid_substatus». La función es «immutable», así que PostgreSQL deja
-- redefinirla y el CHECK empieza a aceptar los valores nuevos SIN
-- revalidar la tabla y sin tocar una sola fila.
--
-- Esto no es teoría: se comprobó contra PostgreSQL 16 de verdad en la
-- entrega anterior, al añadir «Lacado-Zincado». Y se sigue rechazando un
-- subestado inventado, que es la otra mitad de lo que importa.
-- ---------------------------------------------------------------------
create or replace function public.valid_substatus(p_phase public.project_phase, p_sub text)
returns boolean language sql immutable as $$
  select case p_phase
    when 'preparacion' then p_sub in
      ('pendiente_visita_tecnica', 'pendiente_planos', 'pendiente_material', 'por_empezar')
    when 'fabricacion' then p_sub in
      ('en_fabricacion', 'falta_material', 'lacado_zincado', 'por_finalizar')
    when 'montaje' then p_sub in
      ('pendiente_montaje', 'en_montaje', 'falta_material',
       'por_finalizar_montaje', 'pendiente_rematar')
    else false
  end;
$$;

-- ---------------------------------------------------------------------
-- LAS ETIQUETAS EN CASTELLANO
--
-- Generada a partir de la del archivo 42 con TRES añadidos. Dos son los
-- subestados nuevos. El tercero corrige un descuido de la entrega
-- anterior: «lacado_zincado» se añadió al catálogo pero NO aquí, así que
-- «label_es» devolvía la clave en crudo y el historial escribía
-- «lacado_zincado» en lugar de «Lacado-Zincado». Comprobado contra la
-- base de datos antes de corregirlo.
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
    when 'lacado_zincado'           then 'Lacado-Zincado'
    when 'pendiente_montaje'        then 'Pendiente de montaje'
    when 'en_montaje'               then 'En montaje'
    when 'por_finalizar_montaje'    then 'Por finalizar montaje'
    when 'pendiente_rematar'        then 'Pendiente de rematar'
    -- Estados de facturación
    when 'por_facturar'    then 'Por facturar'
    when 'pendiente_cobro' then 'Pendiente de cobro'
    when 'cobrado_parcial' then 'Cobrado parcialmente'
    when 'cobrado'         then 'Cobrado'
  end, p);
$$;


-- =====================================================================
-- M4 · EL ANTICIPO Y LA PAGA Y SEÑAL, EN EL TOTAL COBRADO
--
--
-- QUÉ PASA HOY, Y POR QUÉ NO BASTA CON SUMAR
--
-- «projects.advance_amount» es una CIFRA PREVISTA: lo que se acordó
-- cobrar al encargar el trabajo. No hay ningún sitio donde conste si se
-- ha recibido.
--
-- El dinero cobrado de verdad vive en «payments», y solo ahí: la vista
-- «project_billing» y «recompute_billing» suman los cobros no anulados.
-- Toda fila de «payments» es dinero RECIBIDO —«paid_on» es obligatorio y
-- no existe un estado «pendiente»—.
--
-- Así que sumar «advance_amount» al total cobrado haría dos cosas malas:
--
--   a) contaría como cobrado un importe que puede estar solo previsto;
--   b) y lo contaría DOS VECES en los proyectos donde ya se apuntó el
--      anticipo como cobro, que es lo que la aplicación invita a hacer
--      hoy (el marcador del campo de notas dice «Anticipo,
--      transferencia…»).
--
--
-- QUÉ SE HACE EN SU LUGAR
--
-- El anticipo se apunta como lo que es: un cobro en «payments», con una
-- marca que dice que ESE cobro es el anticipo. Entonces:
--
--   · la fuente de verdad sigue siendo «payments», y sigue siendo una;
--   · «cobrado» se calcula exactamente igual que antes;
--   · el importe cobrado como anticipo es un SUBCONJUNTO de esa misma
--     suma —el mismo «sum», con un filtro más—, así que es imposible por
--     construcción que se cuente dos veces;
--   · y solo cuenta cuando alguien dice que se ha recibido.
--
-- Si ese cobro se anula luego, deja de contar en los dos sitios a la
-- vez, sin que nadie tenga que acordarse de nada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LA MARCA
--
-- Una marca, NO un importe. El dinero sigue estando en «amount» y en
-- ningún otro sitio: esto solo dice de qué cobro estamos hablando.
--
-- «default false» y «not null»: los cobros que ya existen quedan como
-- cobros normales, que es lo que son. No se reinterpreta ni se convierte
-- nada: si alguno era en realidad un anticipo, lo marcará quien lo sepa.
-- ---------------------------------------------------------------------
alter table public.payments
  add column if not exists is_advance boolean not null default false;

comment on column public.payments.is_advance is
  'Este cobro es el anticipo o la paga y señal del proyecto. No guarda importes: el dinero está en «amount».';


-- ---------------------------------------------------------------------
-- 2) UN SOLO ANTICIPO POR PROYECTO, Y LO GARANTIZA LA BASE DE DATOS
--
-- La comprobación dentro de la función explica el problema con palabras;
-- este índice lo hace IMPOSIBLE, que no es lo mismo. Es la regla
-- financiera más importante de esta mejora —no sumar dos veces un
-- anticipo— y no debe depender de que todo el mundo pase por la función.
--
-- Al anular un cobro sale del índice, así que si fue un error se puede
-- anular y volver a registrar.
-- ---------------------------------------------------------------------
create unique index if not exists payments_advance_unique
  on public.payments (project_id) where is_advance and voided_at is null;


-- ---------------------------------------------------------------------
-- 3) REGISTRAR EL ANTICIPO
--
-- Reutiliza «register_payment», la función de siempre: el cobro se
-- apunta igual que cualquier otro, recalcula el estado de cobro y queda
-- en el historial. Aquí no hay un camino paralelo, solo uno más corto.
--
-- El importe por defecto es el anticipo previsto del proyecto, pero se
-- puede indicar otro: a veces se cobra una señal distinta de la que se
-- había anotado, y la aplicación tiene que poder contar lo que pasó de
-- verdad, no lo que estaba previsto.
-- ---------------------------------------------------------------------
create or replace function public.register_advance_payment(
  p_project uuid, p_amount numeric default null,
  p_paid_on date default null, p_notes text default null)
returns public.payments
language plpgsql security definer set search_path = public as $$
declare pr public.projects; v_amount numeric; pay public.payments;
begin
  perform public.assert_admin();

  select * into pr from public.projects where id = p_project;
  if not found then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;

  -- Se distingue a propósito: «no hay nada anotado» y «me has dado un
  -- importe que no vale» son dos problemas distintos, y quien lo lee
  -- tiene que saber cuál de los dos le ha pasado.
  if p_amount is not null then
    v_amount := round(p_amount::numeric, 2);
    if v_amount <= 0 then
      raise exception 'El importe del anticipo tiene que ser mayor que cero.'
        using errcode = '22023';
    end if;
  else
    v_amount := round(coalesce(pr.advance_amount, 0)::numeric, 2);
    if v_amount <= 0 then
      raise exception 'Este proyecto no tiene anticipo anotado. Escribe el importe en el proyecto, '
                      'o indícalo al registrar el cobro.'
        using errcode = '22023';
    end if;
  end if;

  -- NO DOS VECES. El índice de arriba lo impediría igual, pero con un
  -- error de PostgreSQL en crudo; esto lo dice con palabras.
  if exists (select 1 from public.payments
              where project_id = p_project and is_advance and voided_at is null) then
    raise exception 'El anticipo de este proyecto ya está registrado como cobro.'
      using errcode = '22023';
  end if;

  pay := public.register_payment(p_project, v_amount, p_paid_on,
           coalesce(nullif(btrim(coalesce(p_notes, '')), ''), 'Anticipo / paga y señal'));

  -- El cobro ya consta en el historial con su importe y su fecha. Esto
  -- solo lo marca, y no merece una segunda línea que diría «modificó un
  -- cobro» sin explicar nada. Mismo recurso que usa «delete_payment».
  perform set_config('app.skip_audit', 'on', true);
  update public.payments set is_advance = true where id = pay.id returning * into pay;
  perform set_config('app.skip_audit', 'off', true);

  return pay;
end $$;

comment on function public.register_advance_payment(uuid, numeric, date, text) is
  'Apunta el anticipo o la paga y señal del proyecto como un cobro más, en «payments», marcado como anticipo.';

revoke all    on function public.register_advance_payment(uuid, numeric, date, text) from public, anon;
grant  execute on function public.register_advance_payment(uuid, numeric, date, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4) LA VISTA DE COBROS, CON EL ANTICIPO A LA VISTA
--
-- Generada a partir de la del archivo 22 AÑADIENDO dos columnas al
-- final. Las cinco de antes conservan nombre, tipo y orden, que es lo
-- que PostgreSQL exige para reemplazar una vista y lo que hace que nada
-- de lo que ya la lee se entere del cambio.
--
--   · «anticipo»         · el importe PREVISTO del proyecto;
--   · «anticipo_cobrado» · cuánto de eso se ha recibido de verdad.
--
-- «anticipo_cobrado» sale del MISMO «sum» que «cobrado», con un filtro
-- más. Por eso no puede contradecirlo ni sumarse aparte: es una parte de
-- él. Y «cobrado» sigue calculándose exactamente como antes.
-- ---------------------------------------------------------------------
create or replace view public.project_billing with (security_invoker = true) as
  select p.id                                                             as project_id,
         coalesce(p.budget_amount, 0)                                     as total,
         coalesce(sum(pay.amount) filter (where pay.voided_at is null), 0) as cobrado,
         greatest(coalesce(p.budget_amount, 0)
                  - coalesce(sum(pay.amount) filter (where pay.voided_at is null), 0), 0) as pendiente,
         count(pay.id) filter (where pay.voided_at is null)                as cobros,
         coalesce(p.advance_amount, 0)                                     as anticipo,
         coalesce(sum(pay.amount) filter (where pay.voided_at is null and pay.is_advance), 0)
                                                                           as anticipo_cobrado
    from public.projects p
    left join public.payments pay on pay.project_id = p.id
   group by p.id, p.budget_amount, p.advance_amount;

comment on view public.project_billing is
  'Total, cobrado y pendiente de cada proyecto, más el anticipo previsto y cuánto de él se ha cobrado. El cobrado sale solo de «payments».';
