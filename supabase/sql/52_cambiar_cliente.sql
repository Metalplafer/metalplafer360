-- =====================================================================
-- METALPLAFER360 · CAMBIAR EL CLIENTE DE UN PRESUPUESTO, UN AVISO O UN
-- PROYECTO
--
-- M1 · Pasa: se crea un presupuesto y se elige el cliente equivocado
-- —dos empresas con nombres parecidos, o el contacto del cliente nuevo
-- al que se le abre un presupuesto antes de darlo de alta bien—. Hasta
-- ahora el formulario decía «el cliente de una ficha no se cambia una
-- vez creada», así que la única salida era crear el presupuesto otra vez
-- a mano y archivar el anterior: dos registros, el código gastado, y el
-- trabajo repetido.
--
--
-- POR QUÉ HACE FALTA SQL, Y NO SOLO PANTALLA
--
-- La columna «client_id» ya se podía escribir: un administrador puede
-- actualizar fichas y proyectos, y la pantalla simplemente no lo
-- ofrecía. Pero cambiar el cliente a pelo deja DOS cosas mal:
--
--   1) EL HISTORIAL. El apunte automático diría «modificó la ficha
--      PRES-2026-004» y guardaría los dos identificadores en crudo.
--      Quién era el cliente antes y quién es ahora es justo lo que
--      alguien querrá saber dentro de seis meses.
--
--   2) LA PERSONA DE CONTACTO. «contact_id» apunta a un contacto de un
--      cliente concreto. Si cambia el cliente y el contacto se queda, el
--      presupuesto enseña el teléfono de alguien de OTRA empresa. La
--      base de datos no lo impide: hay que quitarlo.
--
-- Las dos cosas tienen que pasar SIEMPRE, no solo cuando se cambia desde
-- el formulario. Por eso van aquí dentro y no en la pantalla.
--
--
-- QUÉ NO HACE, A PROPÓSITO
--
--   · NO crea ningún cliente. El cliente nuevo se da de alta en
--     Clientes, como siempre, y aquí solo se elige uno que ya existe.
--   · NO toca el cliente anterior: ni lo borra, ni lo desactiva, ni le
--     cambia nada. Sigue con el resto de su actividad.
--   · NO arrastra nada más. El presupuesto, el aviso o el proyecto
--     conserva su código, su estado, sus importes, sus fechas, su
--     responsable, sus documentos, sus comentarios, sus órdenes, su
--     material y sus cobros.
--   · NO cambia el cliente de los registros relacionados. Si un
--     presupuesto ya se convirtió en proyecto, el proyecto se queda como
--     está y hay que cambiarlo aparte. Hacerlo en cascada movería
--     órdenes de trabajo y cobros de cliente sin que nadie lo pidiera.
--
-- MIGRACIÓN ESTRUCTURAL: dos funciones nuevas. No cambia ninguna tabla,
-- ninguna columna y ningún dato.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) EL CLIENTE DE UN PRESUPUESTO, UNA VISITA O UN AVISO
--
-- Hecha a imagen de «set_project_work» del archivo 31, que es la que ya
-- hace esto mismo con las obras: comprueba, cambia una sola columna y
-- escribe en el historial una frase que se entiende.
-- ---------------------------------------------------------------------
create or replace function public.set_ficha_client(p_ficha uuid, p_client uuid)
returns public.fichas language plpgsql security definer set search_path = public as $$
declare
  f public.fichas;
  v_antes text; v_ahora text;
  v_quitar_contacto boolean := false;
begin
  perform public.assert_admin();

  select * into f from public.fichas where id = p_ficha for update;
  if not found then
    raise exception 'No se encuentra la ficha' using errcode = 'P0002';
  end if;

  -- Una visita puede no tener cliente todavía; un presupuesto y un aviso
  -- no. Es la misma regla que el formulario, dicha donde no se puede
  -- saltar.
  if p_client is null and f.type <> 'visita' then
    raise exception 'Un presupuesto o un aviso necesita siempre un cliente.'
      using errcode = '22023';
  end if;

  if p_client is not null then
    select name into v_ahora from public.clients where id = p_client and archived_at is null;
    if v_ahora is null then
      if exists (select 1 from public.clients where id = p_client) then
        raise exception 'Ese cliente está archivado. Recupéralo antes de usarlo.'
          using errcode = '22023';
      end if;
      raise exception 'No se encuentra el cliente' using errcode = 'P0002';
    end if;
  end if;

  -- Ya es ese: no se toca nada y no se ensucia el historial.
  if f.client_id is not distinct from p_client then return f; end if;

  select name into v_antes from public.clients where id = f.client_id;

  -- La persona de contacto es de un cliente concreto. Si no es del
  -- cliente nuevo, se quita: dejarla sería enseñar el teléfono de
  -- alguien de otra empresa.
  v_quitar_contacto := f.contact_id is not null and not exists (
    select 1 from public.client_contacts c
     where c.id = f.contact_id and c.client_id = p_client);

  perform set_config('app.skip_audit', 'on', true);
  update public.fichas
     set client_id = p_client,
         contact_id = case when v_quitar_contacto then null else contact_id end,
         updated_at = now()
   where id = p_ficha;
  perform set_config('app.skip_audit', 'off', true);

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'cambio_cliente', 'fichas', f.id, f.code,
          public.actor_name() || ' cambió el cliente de ' || f.code || ': ' ||
          coalesce(v_antes, 'sin cliente') || ' → ' || coalesce(v_ahora, 'sin cliente') ||
          case when v_quitar_contacto
               then '. Se quitó la persona de contacto, que era del cliente anterior.'
               else '' end,
          jsonb_build_object('antes', f.client_id, 'despues', p_client,
                             'contacto_quitado', v_quitar_contacto), f.is_demo);

  select * into f from public.fichas where id = p_ficha;
  return f;
end $$;

comment on function public.set_ficha_client(uuid, uuid) is
  'Cambia el cliente de un presupuesto, una visita o un aviso. Quita el contacto si era del cliente anterior y lo deja escrito en el historial.';

revoke all     on function public.set_ficha_client(uuid, uuid) from public, anon;
grant  execute on function public.set_ficha_client(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 2) EL CLIENTE DE UN PROYECTO
--
-- Lo mismo, con dos diferencias: un proyecto SIEMPRE tiene cliente, y si
-- viene de un presupuesto el presupuesto NO se toca, que es lo que se
-- pide expresamente.
-- ---------------------------------------------------------------------
create or replace function public.set_project_client(p_project uuid, p_client uuid)
returns public.projects language plpgsql security definer set search_path = public as $$
declare
  p public.projects;
  v_antes text; v_ahora text;
  v_quitar_contacto boolean := false;
begin
  perform public.assert_admin();

  select * into p from public.projects where id = p_project for update;
  if not found then
    raise exception 'No se encuentra el proyecto' using errcode = 'P0002';
  end if;

  if p_client is null then
    raise exception 'Un proyecto necesita siempre un cliente.' using errcode = '22023';
  end if;

  select name into v_ahora from public.clients where id = p_client and archived_at is null;
  if v_ahora is null then
    if exists (select 1 from public.clients where id = p_client) then
      raise exception 'Ese cliente está archivado. Recupéralo antes de usarlo.'
        using errcode = '22023';
    end if;
    raise exception 'No se encuentra el cliente' using errcode = 'P0002';
  end if;

  if p.client_id is not distinct from p_client then return p; end if;

  select name into v_antes from public.clients where id = p.client_id;

  v_quitar_contacto := p.contact_id is not null and not exists (
    select 1 from public.client_contacts c
     where c.id = p.contact_id and c.client_id = p_client);

  perform set_config('app.skip_audit', 'on', true);
  update public.projects
     set client_id = p_client,
         contact_id = case when v_quitar_contacto then null else contact_id end,
         updated_at = now()
   where id = p_project;
  perform set_config('app.skip_audit', 'off', true);

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'cambio_cliente', 'projects', p.id, p.code,
          public.actor_name() || ' cambió el cliente de ' || p.code || ': ' ||
          coalesce(v_antes, 'sin cliente') || ' → ' || v_ahora ||
          case when v_quitar_contacto
               then '. Se quitó la persona de contacto, que era del cliente anterior.'
               else '' end,
          jsonb_build_object('antes', p.client_id, 'despues', p_client,
                             'contacto_quitado', v_quitar_contacto), p.is_demo);

  select * into p from public.projects where id = p_project;
  return p;
end $$;

comment on function public.set_project_client(uuid, uuid) is
  'Cambia el cliente de un proyecto. No toca el presupuesto del que venga, ni el cliente anterior.';

revoke all     on function public.set_project_client(uuid, uuid) from public, anon;
grant  execute on function public.set_project_client(uuid, uuid) to authenticated;
