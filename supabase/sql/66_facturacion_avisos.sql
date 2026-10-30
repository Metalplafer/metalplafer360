-- =====================================================================
-- METALPLAFER360 · TERMINAR UN AVISO CON O SIN FACTURA
--
-- MEJORA 7 · Hoy un aviso se marca «Realizado» y ahí se acaba todo. Pero
-- no todos los avisos se facturan: unos se cobran y otros son una
-- atención al cliente. Al no distinguirlos, los que sí había que cobrar
-- se pierden de vista.
--
-- A partir de ahora, al terminar un aviso hay que decir cuál de las dos
-- cosas es:
--
--   · REALIZADO, PENDIENTE DE FACTURAR → queda a la espera, sale en el
--     panel, y cuando se factura se marca con un clic;
--   · REALIZADO Y FINALIZADO → no se factura y no sale en ningún sitio
--     esperando a nadie.
--
--
-- QUÉ SIGNIFICA AQUÍ «FACTURAR», Y QUÉ NO
--
-- Hay que decirlo claro porque el encargo avisa de ello: METALPLAFER360
-- **no emite ninguna factura** ni habla con ningún programa de
-- contabilidad. La facturación que existe hoy en la aplicación es la de
-- los PROYECTOS —«projects.billing_status», los cobros, «recompute_billing»—
-- y es otra cosa: lleva importes y pagos.
--
-- Un aviso no tiene importe, así que marcarlo como facturado NO suma
-- dinero a ningún sitio y NO aparece en los totales de la pantalla de
-- Facturación. Lo único que hace es dejar constancia, dentro de
-- METALPLAFER360, de que ese trabajo ya se ha facturado, para que deje
-- de salir en la lista de lo que falta por facturar. Decir otra cosa
-- sería mentir sobre lo que hace el tic.
--
--
-- POR QUÉ NO SE INVENTAN ESTADOS NUEVOS
--
-- Los avisos ya tienen «realizado» y «cerrado», y encajan sin forzar
-- nada:
--
--   · «realizado» = el trabajo está hecho y queda algo por hacer con él
--     (facturarlo);
--   · «cerrado»   = no queda nada por hacer.
--
-- Así, todo lo que hoy filtra o cuenta por esos dos estados sigue
-- contando lo mismo. Lo nuevo es una columna que dice cuál de las dos
-- situaciones de facturación es, y un control que mueve las dos cosas a
-- la vez para que no puedan quedar en desacuerdo.
--
--
-- LOS AVISOS DE ANTES NO SE TOCAN
--
-- Un aviso ya realizado o cerrado se queda SIN situación de facturación,
-- que significa «esto se cerró antes de que existiera esta pregunta».
-- No se convierten en «pendientes de facturar»: nadie sabe cuáles se
-- facturaron y cuáles no, y llenar el panel de trabajo inventado sería
-- peor que no tener la lista. El panel solo cuenta los que alguien ha
-- marcado a propósito.
--
-- MIGRACIÓN ESTRUCTURAL: una columna que nace vacía, una función nueva y
-- el disparador que ya existía con una regla más. Ni una fila tocada.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) EL VOCABULARIO
-- ---------------------------------------------------------------------
create or replace function public.valid_aviso_billing(p_state text)
returns boolean language sql immutable as $$
  select p_state is null or p_state in ('pendiente', 'facturado', 'sin_facturacion');
$$;

comment on function public.valid_aviso_billing(text) is
  'Situación de facturación de un aviso terminado. Nulo = todavía no se ha terminado, o se terminó antes de que existiera esta pregunta.';


-- ---------------------------------------------------------------------
-- 2) LA COLUMNA
-- ---------------------------------------------------------------------
alter table public.fichas
  add column if not exists billing_state text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fichas_billing_valido') then
    alter table public.fichas
      add constraint fichas_billing_valido check (public.valid_aviso_billing(billing_state));
  end if;
end $$;

comment on column public.fichas.billing_state is
  'Solo avisos terminados: pendiente de facturar, facturado, o terminado sin facturación. NO suma importes: METALPLAFER360 no emite facturas.';

create index if not exists fichas_por_facturar_idx
  on public.fichas (billing_state) where billing_state = 'pendiente';


-- ---------------------------------------------------------------------
-- 3) QUE NO PUEDA QUEDAR EN DESACUERDO CON EL ESTADO
--
-- El MISMO disparador del archivo 65 —que a su vez venía del 43— con un
-- bloque más al final. Se ha generado a partir de esa definición viva.
--
-- La regla es una sola: si el aviso NO está terminado, no tiene
-- situación de facturación. Así, reabrir un aviso cerrado deja de
-- contarlo como pendiente de facturar sin que nadie tenga que acordarse.
-- ---------------------------------------------------------------------
create or replace function public.trg_fichas_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rol text;
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;

  -- EL ESTADO INICIAL DEPENDE DEL TIPO (archivo 43).
  if TG_OP = 'INSERT' then
    new.status := case new.type
                    when 'visita' then 'por_asignar'
                    else               'pendiente' end;
  end if;

  -- LAS VISITAS, SOLO PARA ADMINISTRACIÓN.
  if new.type = 'visita' and new.assigned_to is not null
     and (TG_OP = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    select role into v_rol from public.profiles where id = new.assigned_to;
    if v_rol is distinct from 'admin' then
      raise exception 'Una visita solo se puede asignar a administración. Si el trabajo lo tiene que hacer un trabajador, créalo como aviso.'
        using errcode = '22023';
    end if;
  end if;

  -- Al poner responsable, la ficha deja de estar «Por asignar».
  if new.status = 'por_asignar' and new.assigned_to is not null
     and (TG_OP = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    new.status := case new.type
                    when 'presupuesto' then 'pendiente'
                    when 'visita'      then 'asignada'
                    else                    'asignado' end;
  end if;

  -- MEJORA 3 · LA SUBFASE DE REVISIÓN SE PONE Y SE QUITA SOLA.
  if new.type = 'presupuesto' and new.status = 'por_revisar' then
    if new.review_status is null then
      new.review_status := 'por_revisar';
    end if;
  else
    new.review_status := null;
  end if;

  -- MEJORA 7 · LA SITUACIÓN DE FACTURACIÓN ES DE LOS AVISOS TERMINADOS.
  --
  -- Si no es un aviso, o el aviso no está terminado, no hay situación de
  -- facturación que valga. Lo importante de esta regla es lo que impide:
  -- que un aviso que se REABRE —porque había que volver— siga contando
  -- como pendiente de facturar en el panel.
  if new.type <> 'aviso' or new.status not in ('realizado', 'cerrado') then
    new.billing_state := null;
  end if;

  return new;
end $$;

drop trigger if exists fichas_before on public.fichas;
create trigger fichas_before before insert or update on public.fichas
  for each row execute function public.trg_fichas_before();


-- ---------------------------------------------------------------------
-- 4) TERMINAR UN AVISO, Y MARCARLO FACTURADO
--
-- Una función y no un «update» suelto, porque el estado y la situación
-- de facturación tienen que moverse A LA VEZ. Si se dejara a la pantalla
-- mandar los dos campos por separado, un fallo a medio camino dejaría un
-- aviso «cerrado» que sigue contando como pendiente de facturar.
--
-- Las cuatro situaciones que admite, y lo que hace cada una:
--
--   · «pendiente»        → realizado, y queda esperando factura;
--   · «sin_facturacion»  → cerrado, no se factura y no espera a nadie;
--   · «facturado»        → cerrado y ya facturado. SOLO desde
--                          «pendiente»: marcar como facturado algo que
--                          nadie dijo que hubiera que facturar es la
--                          doble contabilización que hay que evitar;
--   · nulo               → deshace la decisión y devuelve el aviso a
--                          «en curso», para el caso de haberse
--                          equivocado de aviso.
--
-- Y DESMARCAR UNA FACTURA: se hace volviendo a «pendiente». El aviso
-- regresa a «realizado» y vuelve a salir en el panel, que es lo que se
-- quiere cuando la factura se anula o se emitió por error. No se borra
-- nada del historial: el cambio queda registrado como todos.
-- ---------------------------------------------------------------------
create or replace function public.set_aviso_billing(p_ficha uuid, p_state text default null)
returns public.fichas language plpgsql security definer set search_path = public as $$
declare f public.fichas;
begin
  perform public.assert_admin();

  if not public.valid_aviso_billing(p_state) then
    raise exception 'Esa situación de facturación no existe' using errcode = '22023';
  end if;

  select * into f from public.fichas where id = p_ficha for update;
  if not found then
    raise exception 'No se encuentra el aviso' using errcode = 'P0002';
  end if;

  if f.type <> 'aviso' then
    raise exception 'Esto solo vale para los avisos: un presupuesto o una visita se facturan por su proyecto'
      using errcode = '22023';
  end if;

  if f.archived_at is not null then
    raise exception 'El aviso está archivado' using errcode = '22023';
  end if;

  -- La única transición que se vigila: no se factura lo que nadie ha
  -- dicho que hubiera que facturar.
  if p_state = 'facturado' and coalesce(f.billing_state, '') <> 'pendiente' then
    raise exception 'Solo se puede marcar como facturado un aviso que estuviera pendiente de facturar'
      using errcode = '22023';
  end if;

  update public.fichas
     set status = case p_state
                    when 'pendiente'       then 'realizado'
                    when 'sin_facturacion' then 'cerrado'
                    when 'facturado'       then 'cerrado'
                    else                        'en_curso'
                  end,
         billing_state = p_state,
         updated_at = now()
   where id = p_ficha
  returning * into f;

  return f;
end $$;

comment on function public.set_aviso_billing(uuid, text) is
  'Termina un aviso diciendo si queda pendiente de facturar o no, y lo marca facturado. Mueve el estado y la situación a la vez para que no queden en desacuerdo.';

grant  execute on function public.set_aviso_billing(uuid, text) to authenticated;
revoke execute on function public.set_aviso_billing(uuid, text) from anon, public;


-- ---------------------------------------------------------------------
-- 5) COMPROBAR QUE QUEDÓ BIEN
-- ---------------------------------------------------------------------
-- select status, coalesce(billing_state, '—') as facturacion, count(*)
--   from public.fichas where type = 'aviso'
--  group by status, billing_state order by status;
--
-- Lo que el panel contará como pendiente de facturar:
-- select count(*) from public.fichas
--  where type = 'aviso' and billing_state = 'pendiente' and archived_at is null;
