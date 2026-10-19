-- =====================================================================
-- METALPLAFER360 · MENCIONAR A ALGUIEN EN UN COMENTARIO CON @
--
--
-- EL PROBLEMA
--
-- Hoy un comentario en un proyecto avisa a TODOS los asignados, y uno
-- escrito por un trabajador avisa a TODA la administración. Si lo que
-- quieres es preguntarle algo a una persona concreta, no hay manera de
-- decirlo: o avisas a todos o no avisas a nadie.
--
--
-- CÓMO SE MONTA, Y POR QUÉ ASÍ
--
-- El TEXTO del comentario se queda tal cual, con el «@Nombre Apellido»
-- escrito dentro. Es legible en las copias de seguridad, en los
-- informes y en cualquier sitio que lea la columna, y no hay que
-- descifrar códigos para entenderlo.
--
-- El VÍNCULO con la persona vive aparte, en «comment_mentions». Así se
-- sabe exactamente a quién hay que avisar sin tener que adivinarlo
-- interpretando el texto, que es lo que fallaría en cuanto dos personas
-- se llamaran parecido.
--
-- EL AVISO LO ESCRIBE EL SERVIDOR. No depende de que el navegador de
-- quien escribe siga abierto, ni de que la pantalla haga nada: lo hace
-- la base de datos al guardar el comentario.
--
--
-- A QUIÉN SE PUEDE MENCIONAR · esto es lo importante
--
-- No a cualquiera. Solo a quien ya puede VER ese comentario: la
-- administración y los trabajadores asignados a ese proyecto, aviso,
-- orden o parte. Y no lo decide la pantalla escondiendo nombres: lo
-- comprueba la base de datos al guardar, así que manipular la petición
-- a mano no sirve de nada.
--
-- Mencionar a alguien que no puede ver el comentario le mandaría un
-- aviso de algo que luego no podría abrir, y le filtraría de paso que
-- ese proyecto existe.
--
--
-- MIGRACIÓN ESTRUCTURAL. Crea una tabla y tres funciones, y amplía el
-- disparador de avisos de los comentarios. NO borra ni modifica ningún
-- registro existente, y los comentarios de hoy siguen funcionando
-- exactamente igual: sin menciones, el camino es el de siempre.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) A QUIÉN SE MENCIONA EN CADA COMENTARIO
-- ---------------------------------------------------------------------
create table if not exists public.comment_mentions (
  comment_id  uuid not null references public.comments(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);

comment on table public.comment_mentions is
  'A quién se ha mencionado en cada comentario. El texto del comentario conserva el «@Nombre Apellido» legible; esto es el vínculo con la persona.';

create index if not exists comment_mentions_user_idx
  on public.comment_mentions (user_id, created_at desc);


-- ---------------------------------------------------------------------
-- 2) A QUIÉN SE PUEDE MENCIONAR
--
-- La administración y quien esté asignado a ese proyecto, aviso, orden o
-- parte. Es la MISMA regla que decide quién puede leer el comentario,
-- porque mencionar a quien no puede leerlo sería avisarle de algo que no
-- va a poder abrir.
--
-- Devuelve la lista vacía a quien no tenga nada que ver con ese sitio,
-- así que tampoco sirve para enumerar a la plantilla.
-- ---------------------------------------------------------------------
create or replace function public.comment_mention_candidates(
  p_ficha   uuid default null,
  p_project uuid default null,
  p_order   uuid default null,
  p_report  uuid default null,
  p_work    uuid default null)
returns table (id uuid, full_name text, role public.user_role)
language plpgsql stable security definer set search_path = public as $$
begin
  -- Quien no puede comentar ahí, no recibe ningún nombre.
  if not public.can_comment_on(p_ficha, p_project, p_order, p_report, p_work) then
    return;
  end if;

  return query
    select p.id, p.full_name, p.role
      from public.profiles p
     where p.active
       and p.id <> auth.uid()
       and (
         -- La administración siempre: es a quien se le pregunta.
         p.role = 'admin'
         -- Y los trabajadores que ya pueden ver ese sitio.
         or (p_project is not null and exists (
               select 1 from public.project_workers pw
                where pw.project_id = p_project and pw.worker_id = p.id))
         or (p_ficha is not null and exists (
               select 1 from public.ficha_workers fw
                where fw.ficha_id = p_ficha and fw.worker_id = p.id))
         or (p_ficha is not null and exists (
               select 1 from public.fichas f
                where f.id = p_ficha and f.assigned_to = p.id))
         or (p_order is not null and exists (
               select 1 from public.work_order_workers ow
                where ow.order_id = p_order and ow.worker_id = p.id))
         -- En un parte: su autor y quien estuvo en el trabajo.
         or (p_report is not null and exists (
               select 1 from public.work_reports r
                where r.id = p_report and r.worker_id = p.id))
         or (p_report is not null and exists (
               select 1 from public.work_report_workers rw
                where rw.report_id = p_report and rw.worker_id = p.id))
       )
     order by (p.role = 'admin') desc, p.full_name;
end $$;

comment on function public.comment_mention_candidates(uuid, uuid, uuid, uuid, uuid) is
  'A quién se puede mencionar en un comentario: administración y quien está asignado a ese sitio. Lo comprueba el servidor, no la pantalla.';


-- ---------------------------------------------------------------------
-- 3) ¿PUEDE ESTA PERSONA COMENTAR AQUÍ?
--
-- Es la MISMA condición que la política «comments_insert» del archivo
-- 39. Se saca a una función para que «post_comment» y la lista de
-- candidatos usen exactamente la misma regla y no se puedan separar con
-- el tiempo.
-- ---------------------------------------------------------------------
create or replace function public.can_comment_on(
  p_ficha   uuid default null,
  p_project uuid default null,
  p_order   uuid default null,
  p_report  uuid default null,
  p_work    uuid default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (p_ficha   is not null and public.worker_has_ficha(p_ficha))
      or (p_project is not null and public.worker_can_see_project(p_project))
      or (p_order   is not null and public.worker_has_order(p_order))
      or (p_report  is not null and public.can_read_report(p_report));
$$;

comment on function public.can_comment_on(uuid, uuid, uuid, uuid, uuid) is
  'La misma regla que la política de inserción de comentarios. Una obra solo la comenta administración.';


-- ---------------------------------------------------------------------
-- 4) EL DISPARADOR DE AVISOS, AMPLIADO
--
-- Generado a partir del original del archivo 27 con UN solo añadido:
-- cuando el comentario lleva menciones, aquí no se avisa a nadie, porque
-- de los mencionados se encarga «post_comment» en cuanto los guarda.
--
-- Todo lo demás —los avisos de los partes, de los proyectos, de las
-- órdenes y de los comentarios dirigidos a una persona— sigue palabra
-- por palabra como estaba.
-- ---------------------------------------------------------------------
create or replace function public.trg_comments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_body text; v_donde text;
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;

  -- SI EL COMENTARIO LLEVA MENCIONES, avisa solo a los mencionados.
  --
  -- Es la misma idea que ya había para «target_worker_id»: cuando un
  -- comentario va dirigido a alguien, no se avisa a todo el mundo. De
  -- los mencionados se encarga «post_comment» en cuanto los guarda, que
  -- es cuando ya se sabe quiénes son.
  --
  -- «app.mentions» lo pone «post_comment», que es una función del
  -- servidor. NO lo puede poner la aplicación: si pudiera, cualquiera
  -- silenciaría los avisos de sus comentarios.
  if coalesce(current_setting('app.mentions', true), '') <> '' then return new; end if;

  v_body := public.actor_name() || ': ' || left(new.body, 160);

  -- Dirigido a una persona concreta: solo ella recibe el aviso.
  if new.target_worker_id is not null then
    if new.target_worker_id <> auth.uid() then
      select coalesce(
        (select code from public.projects    where id = new.project_id),
        (select code from public.work_reports where id = new.report_id),
        (select code from public.work_orders  where id = new.order_id),
        (select code from public.fichas       where id = new.ficha_id))
        into v_donde;
      if new.report_id is not null then
        perform public.notify_user_report(new.target_worker_id, 'comentario',
          'Comentario para ti en ' || coalesce(v_donde, 'un proyecto'), v_body, new.report_id);
      else
        perform public.notify_user(new.target_worker_id, 'comentario',
          'Comentario para ti en ' || coalesce(v_donde, 'un proyecto'), v_body, new.order_id);
      end if;
    end if;
    return new;
  end if;

  -- Comentario en un PARTE.
  if new.report_id is not null then
    v_title := 'Comentario en ' ||
      coalesce((select code from public.work_reports where id = new.report_id), 'un parte');
    if public.is_admin() then
      perform public.notify_user_report(
        (select worker_id from public.work_reports where id = new.report_id),
        'comentario', v_title, v_body, new.report_id);
    else
      perform public.notify_admins_report('comentario', v_title, v_body, new.report_id);
    end if;
    return new;
  end if;

  -- Comentario en un PROYECTO: a todos los asignados menos a quien escribe.
  if new.project_id is not null then
    v_title := 'Comentario en ' ||
      coalesce((select code from public.projects where id = new.project_id), 'un proyecto');
    if public.is_admin() then
      perform public.notify_user(pw.worker_id, 'comentario', v_title, v_body, null)
        from public.project_workers pw
       where pw.project_id = new.project_id and pw.worker_id <> auth.uid();
    else
      perform public.notify_admins('comentario', v_title, v_body, null);
    end if;
    return new;
  end if;

  -- Comentario en una ORDEN: como hasta ahora.
  if new.order_id is not null then
    v_title := 'Comentario en ' ||
      coalesce((select code from public.work_orders where id = new.order_id), 'una orden');
    if public.is_admin() then
      perform public.notify_order_workers(new.order_id, 'comentario', v_title, v_body);
    else
      perform public.notify_admins('comentario', v_title, v_body, new.order_id);
    end if;
  end if;

  return new;
end $$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments
  for each row execute function public.trg_comments_notify();


-- ---------------------------------------------------------------------
-- 5) GUARDAR UN COMENTARIO, CON O SIN MENCIONES
--
-- Es el camino por el que pasa la aplicación a partir de ahora. Un
-- comentario SIN menciones se comporta exactamente como antes.
--
-- Por qué una función y no dos inserciones desde la pantalla: porque las
-- menciones tienen que guardarse en el MISMO momento que el comentario.
-- Si fueran dos viajes y el segundo fallara, quedaría un comentario que
-- menciona a alguien en el texto y no avisa a nadie.
-- ---------------------------------------------------------------------
create or replace function public.post_comment(
  p_body          text,
  p_ficha         uuid default null,
  p_project       uuid default null,
  p_order         uuid default null,
  p_report        uuid default null,
  p_work          uuid default null,
  p_target_worker uuid default null,
  p_mentions      uuid[] default '{}')
returns public.comments
language plpgsql security definer set search_path = public as $$
declare
  c public.comments;
  v_texto text := nullif(btrim(coalesce(p_body, '')), '');
  v_ids uuid[];
  v_donde text;
  v_titulo text;
  v_uno uuid;
begin
  if v_texto is null then
    raise exception 'Escribe un comentario antes de enviarlo' using errcode = '22023';
  end if;
  if length(v_texto) > 4000 then
    raise exception 'El comentario es demasiado largo (máximo 4.000 caracteres)'
      using errcode = '22023';
  end if;

  -- Tiene que colgar de algo, y de UNA sola cosa.
  if (case when p_ficha   is not null then 1 else 0 end
    + case when p_project is not null then 1 else 0 end
    + case when p_order   is not null then 1 else 0 end
    + case when p_report  is not null then 1 else 0 end
    + case when p_work    is not null then 1 else 0 end) <> 1 then
    raise exception 'Un comentario cuelga de una sola cosa' using errcode = '22023';
  end if;

  -- EL PERMISO. La función es «security definer», así que las políticas
  -- de la tabla no se aplican aquí y hay que comprobarlo a mano. Se usa
  -- la misma función que la lista de candidatos, que a su vez repite la
  -- condición de la política «comments_insert».
  if not public.can_comment_on(p_ficha, p_project, p_order, p_report, p_work) then
    raise exception 'No tienes permisos para comentar aquí' using errcode = '42501';
  end if;

  -- LAS MENCIONES: solo a quien puede ver el comentario. Mencionar a
  -- otro le avisaría de algo que no podría abrir.
  select coalesce(array_agg(distinct u.id), '{}') into v_ids
    from unnest(coalesce(p_mentions, '{}')) u(id)
   where u.id is not null and u.id <> auth.uid();

  if array_length(v_ids, 1) > 0 and exists (
    select 1 from unnest(v_ids) u(id)
     where not exists (
       select 1 from public.comment_mention_candidates(
                      p_ficha, p_project, p_order, p_report, p_work) k
        where k.id = u.id)) then
    raise exception 'Solo puedes mencionar a quien puede ver este comentario'
      using errcode = '42501';
  end if;

  -- Se avisa al disparador de que este comentario lleva menciones, para
  -- que no avise además a todo el mundo. Es «true»: vale solo para esta
  -- transacción y no se queda pegado a la conexión.
  perform set_config('app.mentions',
    case when array_length(v_ids, 1) > 0 then array_to_string(v_ids, ',') else '' end,
    true);

  insert into public.comments
    (ficha_id, project_id, order_id, report_id, work_id, author_id, body, target_worker_id)
  values (p_ficha, p_project, p_order, p_report, p_work, auth.uid(), v_texto, p_target_worker)
  returning * into c;

  if array_length(v_ids, 1) > 0 then
    insert into public.comment_mentions (comment_id, user_id)
    select c.id, u.id from unnest(v_ids) u(id)
    on conflict do nothing;

    select coalesce(
      (select code from public.projects      where id = p_project),
      (select code from public.work_reports  where id = p_report),
      (select code from public.work_orders   where id = p_order),
      (select code from public.fichas        where id = p_ficha),
      (select code from public.works         where id = p_work))
      into v_donde;

    v_titulo := public.actor_name() || ' te ha mencionado'
                || coalesce(' en ' || v_donde, '');

    foreach v_uno in array v_ids loop
      if p_report is not null then
        perform public.notify_user_report(v_uno, 'comentario', v_titulo,
                                          left(v_texto, 160), p_report);
      else
        perform public.notify_user(v_uno, 'comentario', v_titulo, left(v_texto, 160), p_order);
      end if;
    end loop;
  end if;

  -- Se suelta, para no afectar a nada que venga después en la misma
  -- transacción.
  perform set_config('app.mentions', '', true);
  return c;
end $$;

comment on function public.post_comment(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid[]) is
  'Guarda un comentario y, si menciona a alguien, lo guarda y le avisa. Solo se puede mencionar a quien puede ver el comentario.';


-- ---------------------------------------------------------------------
-- 6) PERMISOS
--
-- Las menciones las ve quien ve el comentario, por la misma regla. No se
-- escriben a mano: se escriben con «post_comment», que comprueba a quién
-- se puede mencionar.
-- ---------------------------------------------------------------------
grant select on public.comment_mentions to authenticated, service_role;
grant all    on public.comment_mentions to service_role;
revoke all   on public.comment_mentions from anon;

alter table public.comment_mentions enable row level security;

drop policy if exists comment_mentions_select on public.comment_mentions;
create policy comment_mentions_select on public.comment_mentions for select to authenticated
  using (
    public.is_admin()
    or user_id = auth.uid()
    or exists (
      select 1 from public.comments c
       where c.id = comment_id
         and (
           (c.ficha_id   is not null and public.worker_has_ficha(c.ficha_id))
           or (c.project_id is not null and public.worker_can_see_project(c.project_id))
           or (c.order_id   is not null and public.worker_has_order(c.order_id))
           or (c.report_id  is not null and public.can_read_report(c.report_id))))
  );

comment on policy comment_mentions_select on public.comment_mentions is
  'Las menciones las ve quien ve el comentario, y siempre el mencionado.';

revoke insert, update, delete, truncate on public.comment_mentions from authenticated;

grant  execute on function public.post_comment(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid[]),
                           public.comment_mention_candidates(uuid, uuid, uuid, uuid, uuid),
                           public.can_comment_on(uuid, uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.post_comment(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid[]),
                           public.comment_mention_candidates(uuid, uuid, uuid, uuid, uuid),
                           public.can_comment_on(uuid, uuid, uuid, uuid, uuid) from anon, public;
