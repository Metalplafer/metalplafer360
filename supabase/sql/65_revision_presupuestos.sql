-- =====================================================================
-- METALPLAFER360 · LAS TRES SUBFASES DE «PRESUPUESTO POR REVISAR»
--
-- MEJORA 3 · Un presupuesto que está «por revisar» puede estar en tres
-- situaciones distintas, y hoy no hay manera de distinguirlas sin abrir
-- la ficha y preguntar a alguien:
--
--   · POR REVISAR  nadie lo ha mirado todavía;
--   · OK           revisado y correcto, listo para enviar;
--   · DENEGADO     revisado y NO sale; hay que rehacerlo.
--
--
-- ESTO NO ES UN ESTADO NUEVO DEL PRESUPUESTO
--
-- Y es la decisión importante de este archivo. Los estados de un
-- presupuesto —«pendiente», «avanzado», «por_revisar», «enviado»,
-- «pendiente_senal», «aceptado», «cancelado»— son por dónde va el
-- trabajo, y de ellos dependen los contadores, el panel y los filtros.
-- Meter «ok» y «denegado» ahí habría cambiado el significado de
-- «por_revisar» para todo lo que ya lo usa.
--
-- Así que es una columna APARTE que solo tiene sentido mientras el
-- presupuesto está en «por_revisar». Quien cuenta presupuestos por
-- revisar sigue contando exactamente lo mismo que contaba ayer.
--
--
-- QUIÉN LA MANTIENE COHERENTE
--
-- El disparador, no una restricción. Una restricción que atara la
-- subfase al estado haría fallar un cambio de estado legítimo —pasar a
-- «enviado» con la subfase puesta— con un error que no explica nada. El
-- disparador la pone al entrar en «por_revisar» y la quita al salir, que
-- es lo que una persona espera que ocurra solo.
--
--
-- QUÉ PASA CON LOS PRESUPUESTOS QUE YA ESTÁN POR REVISAR
--
-- Se les pone «por_revisar», que es «nadie lo ha mirado». NO se les pone
-- «ok» ni «denegado»: no hay en la base de datos ninguna información que
-- permita saber cuáles estaban aprobados, y repartir esa decisión a
-- ciegas sería inventarse el trabajo de otra persona. Los presupuestos
-- en cualquier OTRO estado se quedan sin subfase, que es lo que les
-- corresponde.
--
-- MIGRACIÓN CON DATOS: escribe «por_revisar» en los presupuestos que ya
-- están en ese estado y en ningún otro sitio. Es idempotente: ejecutarla
-- dos veces no cambia nada la segunda vez.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) EL VOCABULARIO
--
-- Como «valid_ficha_status» y «valid_substatus»: una función inmutable
-- que se puede usar dentro de una restricción.
-- ---------------------------------------------------------------------
create or replace function public.valid_ficha_review(p_review text)
returns boolean language sql immutable as $$
  select p_review is null or p_review in ('por_revisar', 'ok', 'denegado');
$$;

comment on function public.valid_ficha_review(text) is
  'Las tres subfases de la revisión de un presupuesto. Nulo = no está en revisión.';


-- ---------------------------------------------------------------------
-- 2) LA COLUMNA
-- ---------------------------------------------------------------------
alter table public.fichas
  add column if not exists review_status text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fichas_review_valido') then
    alter table public.fichas
      add constraint fichas_review_valido check (public.valid_ficha_review(review_status));
  end if;
end $$;

comment on column public.fichas.review_status is
  'Subfase de revisión de un presupuesto: por_revisar, ok o denegado. Solo tiene valor mientras el estado es «por_revisar»; fuera de ahí va vacía.';


-- ---------------------------------------------------------------------
-- 3) QUE SE PONGA Y SE QUITE SOLA
--
-- El MISMO disparador del archivo 43, letra por letra, con un bloque
-- añadido al final. Se ha generado a partir de esa definición, que es la
-- viva: los archivos 07 y 38 lo definieron antes y el 43 es el último.
-- ---------------------------------------------------------------------
create or replace function public.trg_fichas_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rol text;
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;

  -- EL ESTADO INICIAL DEPENDE DEL TIPO (archivo 43).
  --
  -- Antes todo nacía en «Por asignar» porque todo tenía que pasar por
  -- un responsable administrativo. Los presupuestos y los avisos ya no
  -- lo tienen, así que nacen donde empieza su trabajo de verdad.
  --
  -- Las VISITAS siguen igual: las lleva administración y se asignan.
  if TG_OP = 'INSERT' then
    new.status := case new.type
                    when 'visita' then 'por_asignar'
                    else               'pendiente' end;
  end if;

  -- LAS VISITAS, SOLO PARA ADMINISTRACIÓN.
  -- Se comprueba únicamente cuando el responsable se pone o se cambia,
  -- para no estorbar al guardar una visita que ya estaba asignada.
  if new.type = 'visita' and new.assigned_to is not null
     and (TG_OP = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    select role into v_rol from public.profiles where id = new.assigned_to;
    if v_rol is distinct from 'admin' then
      raise exception 'Una visita solo se puede asignar a administración. Si el trabajo lo tiene que hacer un trabajador, créalo como aviso.'
        using errcode = '22023';
    end if;
  end if;

  -- Al poner responsable, la ficha deja de estar «Por asignar».
  -- Con el cambio de arriba esto solo le toca a las VISITAS, pero se
  -- conserva para los tres tipos: hay presupuestos y avisos ANTIGUOS
  -- que siguen en «Por asignar», y si alguien les pone responsable
  -- tienen que avanzar igual que antes.
  if new.status = 'por_asignar' and new.assigned_to is not null
     and (TG_OP = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    new.status := case new.type
                    when 'presupuesto' then 'pendiente'
                    when 'visita'      then 'asignada'
                    else                    'asignado' end;
  end if;

  -- MEJORA 3 · LA SUBFASE DE REVISIÓN SE PONE Y SE QUITA SOLA.
  --
  -- Entrar en «por revisar» significa que nadie lo ha mirado todavía, y
  -- salir de ahí significa que la revisión ya no viene al caso. Las dos
  -- cosas las hace el disparador para que nadie tenga que acordarse:
  --
  --   · si es un presupuesto y queda en «por_revisar» sin subfase, se
  --     le pone «por_revisar». Se respeta la que traiga, que es como
  --     funciona cambiar de «por_revisar» a «ok» o a «denegado»;
  --   · en cualquier otro estado, o en cualquier otro tipo de ficha, la
  --     subfase se vacía.
  --
  -- La segunda regla es también la que impide un estado incoherente:
  -- no hay manera de dejar un presupuesto «enviado» marcado como
  -- «denegado», ni una visita con subfase de revisión.
  if new.type = 'presupuesto' and new.status = 'por_revisar' then
    if new.review_status is null then
      new.review_status := 'por_revisar';
    end if;
  else
    new.review_status := null;
  end if;

  return new;
end $$;

drop trigger if exists fichas_before on public.fichas;
create trigger fichas_before before insert or update on public.fichas
  for each row execute function public.trg_fichas_before();


-- ---------------------------------------------------------------------
-- 4) LOS QUE YA ESTABAN POR REVISAR
--
-- Solo presupuestos, solo los que están en «por_revisar», y solo los que
-- todavía no tienen subfase. Ni uno más.
--
-- Va con «app.skip_audit» porque esto no es el trabajo de nadie: es la
-- migración poniendo al día una columna nueva, y una línea en el
-- historial de cada presupuesto diciendo «cambió review_status» sería
-- ruido que nadie va a querer leer.
--
-- QUÉ PASA SI FALLA: no deja nada a medias. Es un solo UPDATE, así que
-- o entra entero o no entra nada, y se puede volver a ejecutar.
-- ---------------------------------------------------------------------
do $$
declare v_tocados int;
begin
  perform set_config('app.skip_audit', 'on', true);

  update public.fichas
     set review_status = 'por_revisar'
   where type = 'presupuesto'
     and status = 'por_revisar'
     and review_status is null;

  get diagnostics v_tocados = row_count;
  perform set_config('app.skip_audit', 'off', true);

  raise notice 'Presupuestos puestos en «Por revisar»: %. Los demás no se han tocado.', v_tocados;
end $$;


-- ---------------------------------------------------------------------
-- 5) COMPROBAR QUE QUEDÓ BIEN
-- ---------------------------------------------------------------------
-- Los tres repartos, y que nadie fuera de «por_revisar» tiene subfase:
--
-- select status, coalesce(review_status, '—') as subfase, count(*)
--   from public.fichas where type = 'presupuesto'
--  group by status, review_status order by status;
