-- =====================================================================
-- METALPLAFER360 · VISITAS TÉCNICAS VINCULADAS
--
-- MEJORA 2 · Poder asignar una visita técnica desde un presupuesto o un
-- proyecto, verla desde allí y, sobre todo, VER SUS PLANOS Y SUS FOTOS
-- sin tener que ir a buscar la visita en el listado de fichas.
--
--
-- LO QUE HAY HOY
--
-- Una visita técnica NO es una tabla aparte: es una ficha de tipo
-- «visita», con su código VIS-AAAA-###, su estado («por_asignar»,
-- «asignada», «realizada», «cancelada»), su fecha y hora, su
-- responsable y sus documentos. Está terminada y se usa. Lo que no
-- existe es ninguna relación entre una visita y el presupuesto o el
-- proyecto por el que se hizo: se mira cada tabla que apunta a «fichas»
-- y no hay nada que las una.
--
-- Así que hace falta esa relación, y nada más. No se crea una segunda
-- ficha de visita, ni un formulario nuevo, ni una tabla paralela: la
-- pantalla reutiliza la ficha que ya existe.
--
--
-- DOS COLUMNAS, NO UNA TABLA DE ENLACE
--
-- Una visita se hace POR UNA COSA: por un presupuesto que hay que
-- medir, o por un proyecto que está en marcha. No por quince a la vez.
-- Siendo así, una tabla de enlace añadiría una tabla, sus permisos y
-- sus índices para guardar lo mismo que dos columnas.
--
-- Y son dos columnas y no una porque el destino puede ser una ficha o un
-- proyecto, que son dos tablas distintas. Es exactamente el patrón de
-- «documents», que apunta a ficha, proyecto, orden, parte u obra con una
-- columna para cada una y una restricción que obliga a que sea UNA. Se
-- copia ese patrón en lugar de inventar otro.
--
-- Al revés —varias visitas para el mismo presupuesto— sí se puede, y es
-- lo normal: se mide, se vuelve a medir, se va a comprobar un detalle.
--
--
-- QUÉ SE PUEDE COMPROBAR CON UNA RESTRICCIÓN Y QUÉ NO
--
-- Se comprueba con «check», porque solo mira la propia fila:
--
--   · que no haya dos destinos a la vez;
--   · que solo las VISITAS tengan destino (un presupuesto no se
--     «vincula» a otro presupuesto);
--   · que una visita no se vincule a sí misma.
--
-- NO se puede comprobar con «check» que la ficha de destino no sea otra
-- visita: eso exige mirar OTRA fila, y un «check» no puede. Lo comprueba
-- la función «link_visit», que es por donde pasa la aplicación. Queda
-- dicho aquí para que nadie lo busque en la restricción.
--
--
-- LOS DOCUMENTOS: LA MISMA VISTA, MÁS RAMAS
--
-- «related_documents» (archivo 57) ya enseña en un proyecto los archivos
-- de su presupuesto. Ahora enseña también:
--
--   · en un proyecto, los de las visitas vinculadas AL PROYECTO;
--   · en un proyecto, los de las visitas vinculadas A SU PRESUPUESTO de
--     origen. Esto es lo que se pedía: si se vinculó una visita al
--     presupuesto y después el presupuesto se convirtió, los planos de
--     esa visita siguen estando a mano desde el proyecto, sin copiarlos
--     y sin cambiar la relación, que sigue siendo con la visita;
--   · en un presupuesto o un aviso, los de sus visitas vinculadas.
--
-- Ni un archivo se duplica: la vista los mira donde están. Y «no mostrar
-- documentos de visitas no relacionadas» sale solo, porque la única
-- manera de entrar en la vista es por una de esas relaciones.
--
-- Las columnas son LAS MISMAS y en el mismo orden que en el archivo 57:
-- «create or replace view» solo deja añadir columnas al final.
--
--
-- PERMISOS: NO CAMBIAN
--
-- Comprobado contra el catálogo, no supuesto: las políticas de «fichas»
-- son «is_admin()» para leer y para escribir, y la de «projects» es
-- «is_admin()» para leer. Las visitas, los presupuestos y los proyectos
-- son cosa de administración, así que todo esto lo es también. Las
-- vistas nuevas son «security_invoker = true»: se ejecutan con los
-- permisos de quien pregunta y no conceden nada.
--
-- MIGRACIÓN ESTRUCTURAL: dos columnas que pueden ir vacías, tres
-- restricciones, dos índices, dos vistas y dos funciones. Las fichas que
-- ya existen quedan con las columnas vacías y cumplen las tres
-- restricciones, así que no se reescribe ni una fila.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) POR QUÉ SE HIZO LA VISITA
-- ---------------------------------------------------------------------
alter table public.fichas
  add column if not exists linked_ficha_id uuid references public.fichas(id) on delete set null;

alter table public.fichas
  add column if not exists linked_project_id uuid references public.projects(id) on delete set null;

comment on column public.fichas.linked_ficha_id is
  'El presupuesto o aviso por el que se hace esta visita técnica. Solo en fichas de tipo «visita».';
comment on column public.fichas.linked_project_id is
  'El proyecto por el que se hace esta visita técnica. Solo en fichas de tipo «visita».';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fichas_linked_one') then
    alter table public.fichas add constraint fichas_linked_one
      check (num_nonnulls(linked_ficha_id, linked_project_id) <= 1);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fichas_linked_solo_visitas') then
    alter table public.fichas add constraint fichas_linked_solo_visitas
      check (type = 'visita' or num_nonnulls(linked_ficha_id, linked_project_id) = 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fichas_linked_no_self') then
    alter table public.fichas add constraint fichas_linked_no_self
      check (linked_ficha_id is null or linked_ficha_id <> id);
  end if;
end $$;

comment on constraint fichas_linked_one on public.fichas is
  'Una visita se hace por UNA cosa: un presupuesto o aviso, o un proyecto. No por las dos.';

-- Se busca siempre en la misma dirección: «¿qué visitas tiene este
-- presupuesto?».
--
-- SIN «where», aunque la mayoría de las fichas no sean visitas y vayan a
-- indexar un valor vacío. La aplicación tiene una comprobación que
-- exige que TODA columna de clave foránea tenga un índice NO parcial
-- (archivo de pruebas 70, «Toda columna de clave foránea tiene su
-- índice»), y tiene razón: el índice no es solo para buscar las visitas
-- de un presupuesto, también es el que usa PostgreSQL para resolver el
-- «on delete set null» cuando se borra la ficha o el proyecto de
-- destino. Un índice parcial se escribió primero y la comprobación lo
-- cazó.
create index if not exists fichas_linked_ficha_idx
  on public.fichas (linked_ficha_id);
create index if not exists fichas_linked_project_idx
  on public.fichas (linked_project_id);


-- ---------------------------------------------------------------------
-- 2) VINCULAR UNA VISITA
--
-- Pasa por aquí y no por un «update» directo porque hay dos cosas que
-- una restricción no puede hacer:
--
--   · comprobar que el destino no es otra visita, que exige mirar otra
--     fila;
--   · dejarlo escrito en el historial con palabras que se entiendan. El
--     historial automático diría «cambió la ficha VIS-2026-003» y no
--     diría a qué se vinculó, que es lo único que interesa.
--
-- Con los dos destinos en blanco DESVINCULA, que es la manera de
-- arreglar una asignación equivocada. No borra la visita ni sus
-- archivos: solo deja de colgar de ahí.
-- ---------------------------------------------------------------------
create or replace function public.link_visit(
  p_visit uuid, p_ficha uuid default null, p_project uuid default null)
returns public.fichas language plpgsql security definer set search_path = public as $$
declare v public.fichas; v_destino text; v_tipo public.ficha_type; r public.fichas;
begin
  perform public.assert_admin();

  select * into v from public.fichas where id = p_visit for update;
  if not found then
    raise exception 'No se encuentra la visita' using errcode = 'P0002';
  end if;
  if v.type <> 'visita' then
    raise exception 'Solo las visitas técnicas se pueden vincular a un presupuesto o a un proyecto'
      using errcode = '22023';
  end if;
  if p_ficha is not null and p_project is not null then
    raise exception 'Una visita se vincula a un presupuesto o a un proyecto, no a los dos'
      using errcode = '22023';
  end if;

  -- El destino, si lo hay, tiene que existir. Y si es una ficha, no
  -- puede ser otra visita: una visita de una visita no significa nada.
  if p_ficha is not null then
    select type into v_tipo from public.fichas where id = p_ficha;
    if v_tipo is null then
      raise exception 'No se encuentra el presupuesto o el aviso al que vincular la visita'
        using errcode = 'P0002';
    end if;
    if v_tipo = 'visita' then
      raise exception 'Una visita técnica no se vincula a otra visita' using errcode = '22023';
    end if;
    select code into v_destino from public.fichas where id = p_ficha;
  elsif p_project is not null then
    select code into v_destino from public.projects where id = p_project;
    if v_destino is null then
      raise exception 'No se encuentra el proyecto al que vincular la visita'
        using errcode = 'P0002';
    end if;
  end if;

  -- Ya está vinculada ahí: no se toca nada y no se ensucia el
  -- historial. Es lo mismo que hace «set_ficha_client» en el archivo 52.
  if v.linked_ficha_id is not distinct from p_ficha
     and v.linked_project_id is not distinct from p_project then
    return v;
  end if;

  -- El historial se escribe a mano, con el mismo patrón del archivo 52:
  -- se silencia el apunte automático —que diría «cambió la ficha
  -- VIS-2026-003» sin decir a qué— y se pone uno que se entiende.
  perform set_config('app.skip_audit', 'on', true);
  update public.fichas
     set linked_ficha_id = p_ficha, linked_project_id = p_project, updated_at = now()
   where id = p_visit
  returning * into r;
  perform set_config('app.skip_audit', 'off', true);

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(),
          case when v_destino is null then 'desvincular_visita' else 'vincular_visita' end,
          'fichas', r.id, r.code,
          case when v_destino is null
               then public.actor_name() || ' desvinculó la visita técnica ' || r.code
               else public.actor_name() || ' vinculó la visita técnica ' || r.code
                    || ' a ' || v_destino end,
          jsonb_build_object('ficha', p_ficha, 'project', p_project), r.is_demo);

  return r;
end $$;

comment on function public.link_visit(uuid, uuid, uuid) is
  'Vincula una visita técnica a un presupuesto, a un aviso o a un proyecto. Con los dos destinos en blanco, la desvincula. No duplica ni mueve ningún archivo.';

grant  execute on function public.link_visit(uuid, uuid, uuid) to authenticated;
revoke execute on function public.link_visit(uuid, uuid, uuid) from anon, public;


-- ---------------------------------------------------------------------
-- 3) LAS VISITAS QUE SE VEN DESDE UN PRESUPUESTO O UN PROYECTO
--
-- Con lo que la pantalla necesita para listarlas sin más consultas: su
-- estado, su fecha, su responsable y cuántos archivos tiene. El
-- «archivos» se cuenta aquí porque sin él la pantalla no puede decir si
-- merece la pena abrir la visita.
--
-- Un proyecto ve TAMBIÉN las visitas de su presupuesto de origen, y
-- «heredada» dice cuáles son esas: son visitas que se hicieron antes de
-- que el proyecto existiera.
-- ---------------------------------------------------------------------
create or replace view public.linked_visits with (security_invoker = true) as
  -- Vinculadas directamente a una ficha. «para_tipo» sale del TIPO de
  -- esa ficha, no de un literal: una visita se puede vincular a un
  -- presupuesto o a un aviso, y la pantalla del aviso pregunta por
  -- «aviso». Poner «presupuesto» a secas dejaría la lista del aviso
  -- vacía sin que nada fallara.
  select case when o.type = 'aviso' then 'aviso' else 'presupuesto' end as para_tipo,
         o.id                as para_id,
         false               as heredada,
         v.id, v.code, v.status, v.title, v.scheduled_date, v.scheduled_time,
         v.assigned_to, pf.full_name as assigned_name, v.created_at,
         (select count(*) from public.documents d
           where d.ficha_id = v.id and d.deleted_at is null) as archivos
    from public.fichas v
    join public.fichas o on o.id = v.linked_ficha_id
    left join public.profiles pf on pf.id = v.assigned_to
   where v.type = 'visita'
  union all
  -- Vinculadas directamente a un proyecto.
  select 'proyecto'::text, v.linked_project_id, false,
         v.id, v.code, v.status, v.title, v.scheduled_date, v.scheduled_time,
         v.assigned_to, pf.full_name, v.created_at,
         (select count(*) from public.documents d
           where d.ficha_id = v.id and d.deleted_at is null)
    from public.fichas v
    left join public.profiles pf on pf.id = v.assigned_to
   where v.type = 'visita' and v.linked_project_id is not null
  union all
  -- HEREDADAS: vinculadas al presupuesto del que nació el proyecto.
  select 'proyecto'::text, p.id, true,
         v.id, v.code, v.status, v.title, v.scheduled_date, v.scheduled_time,
         v.assigned_to, pf.full_name, v.created_at,
         (select count(*) from public.documents d
           where d.ficha_id = v.id and d.deleted_at is null)
    from public.projects p
    join public.fichas v on v.linked_ficha_id = p.source_ficha_id and v.type = 'visita'
    left join public.profiles pf on pf.id = v.assigned_to;

comment on view public.linked_visits is
  'Las visitas técnicas que se ven desde un presupuesto, un aviso o un proyecto. «heredada» marca las que se vincularon al presupuesto del que nació el proyecto.';

grant select on public.linked_visits to authenticated, service_role;
revoke all   on public.linked_visits from anon;


-- ---------------------------------------------------------------------
-- 4) LOS ARCHIVOS, AHORA TAMBIÉN DE LAS VISITAS
--
-- MISMAS COLUMNAS que en el archivo 57, en el mismo orden. Lo único que
-- cambia es que hay más maneras de entrar.
-- ---------------------------------------------------------------------
create or replace view public.related_documents with (security_invoker = true) as
  -- 1) Lo que un PROYECTO hereda de su presupuesto de origen.
  select 'proyecto'::text                         as para_tipo,
         p.id                                     as para_id,
         'presupuesto'::text                      as origen_tipo,
         f.id                                     as origen_id,
         f.code                                   as origen_code,
         coalesce(f.scheduled_date, f.created_at::date) as origen_fecha,
         d.id,
         d.bucket,
         d.storage_path,
         d.file_name,
         d.mime_type,
         d.size_bytes,
         d.category,
         d.scope,
         d.uploaded_by,
         pf.full_name                             as uploader_name,
         d.created_at
    from public.projects p
    join public.fichas f    on f.id = p.source_ficha_id
    join public.documents d on d.ficha_id = f.id and d.deleted_at is null
    left join public.profiles pf on pf.id = d.uploaded_by

  union all
  -- 2) Lo que un PROYECTO ve de las visitas vinculadas a él.
  select 'proyecto'::text, p.id,
         'visita'::text, v.id, v.code,
         coalesce(v.scheduled_date, v.created_at::date),
         d.id, d.bucket, d.storage_path, d.file_name, d.mime_type, d.size_bytes,
         d.category, d.scope, d.uploaded_by, pf.full_name, d.created_at
    from public.projects p
    join public.fichas v    on v.linked_project_id = p.id and v.type = 'visita'
    join public.documents d on d.ficha_id = v.id and d.deleted_at is null
    left join public.profiles pf on pf.id = d.uploaded_by

  union all
  -- 3) Y de las visitas que se vincularon a su PRESUPUESTO de origen.
  --
  -- Es el caso que se pidió expresamente: se vincula la visita al
  -- presupuesto, el presupuesto se convierte en proyecto y los planos de
  -- la visita tienen que seguir estando a mano desde el proyecto.
  select 'proyecto'::text, p.id,
         'visita'::text, v.id, v.code,
         coalesce(v.scheduled_date, v.created_at::date),
         d.id, d.bucket, d.storage_path, d.file_name, d.mime_type, d.size_bytes,
         d.category, d.scope, d.uploaded_by, pf.full_name, d.created_at
    from public.projects p
    join public.fichas v    on v.linked_ficha_id = p.source_ficha_id and v.type = 'visita'
    join public.documents d on d.ficha_id = v.id and d.deleted_at is null
    left join public.profiles pf on pf.id = d.uploaded_by

  union all
  -- 4) Lo que un PRESUPUESTO o un AVISO ve de sus visitas vinculadas.
  select case when o.type = 'aviso' then 'aviso' else 'presupuesto' end,
         o.id,
         'visita'::text, v.id, v.code,
         coalesce(v.scheduled_date, v.created_at::date),
         d.id, d.bucket, d.storage_path, d.file_name, d.mime_type, d.size_bytes,
         d.category, d.scope, d.uploaded_by, pf.full_name, d.created_at
    from public.fichas o
    join public.fichas v    on v.linked_ficha_id = o.id and v.type = 'visita'
    join public.documents d on d.ficha_id = v.id and d.deleted_at is null
    left join public.profiles pf on pf.id = d.uploaded_by;

comment on view public.related_documents is
  'Los archivos que una ficha o un proyecto VE sin ser suyos: los del presupuesto del que nació y los de las visitas técnicas vinculadas. No se copia ningún archivo; «origen_tipo» y «origen_code» dicen de dónde viene cada uno. Se ejecuta con los permisos de quien pregunta.';

grant select on public.related_documents to authenticated, service_role;
revoke all   on public.related_documents from anon;
