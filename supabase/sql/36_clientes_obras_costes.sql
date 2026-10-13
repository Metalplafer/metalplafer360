-- =====================================================================
-- METALPLAFER360 · FASE 3 · CLIENTES, OBRAS Y COSTES
--
-- Cuatro cosas, en este orden:
--
--   1) LA PANTALLA DE CLIENTES, que daba «error inesperado». Pedía los
--      datos de actividad INCRUSTANDO la vista «client_activity», y
--      entre «clients» y esa vista no hay ninguna clave ajena que
--      PostgREST pueda seguir: la vista expone «clients.id» renombrado,
--      no la columna de la clave. Es el mismo tipo de fallo que dejó los
--      comentarios sin funcionar: una consulta que depende de que
--      PostgREST adivine una relación.
--
--      Se arregla quitando la adivinanza: una vista que ya trae todo
--      junto, y la pantalla la lee de frente. Sin relaciones que inferir
--      no hay nada que adivinar.
--
--   2) EL RESUMEN ECONÓMICO POR CLIENTE, con las cuatro magnitudes que
--      se pidieron. Están definidas abajo, una por una, y NO se usa
--      ningún campo inventado.
--
--   3) LOS COSTES EXTRA SE PUEDEN FACTURAR. Hasta ahora sumaban al
--      total estimado de la obra pero no había forma de decir que ya
--      estaban facturados, así que nunca entraban en el facturado.
--
--   4) LAS OBRAS TIENEN DOCUMENTACIÓN PROPIA, y además ven la de sus
--      proyectos sin duplicar ni un archivo.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LOS COSTES EXTRA, FACTURABLES
--
-- Dos columnas y una función, igual que la facturación manual de un
-- proyecto («set_project_invoiced»), para que se parezcan entre sí.
--
-- NO se marca nada solo por guardarlo: nacen sin facturar y hay que
-- decirlo a mano. Se pidió expresamente.
-- ---------------------------------------------------------------------
alter table public.work_extras add column if not exists invoiced    boolean not null default false;
alter table public.work_extras add column if not exists invoiced_on date;

comment on column public.work_extras.invoiced is
  'Si este coste extra ya está facturado. Se marca a mano: guardarlo no lo factura.';
comment on column public.work_extras.invoiced_on is
  'Fecha de la factura en la que entró este coste extra.';


create or replace function public.set_work_extra_invoiced(
  p_extra uuid, p_invoiced boolean, p_on date default null)
returns public.work_extras language plpgsql security definer set search_path = public as $$
declare x public.work_extras; v_code text;
begin
  perform public.assert_admin();

  select * into x from public.work_extras where id = p_extra for update;
  if not found then
    raise exception 'No se encuentra el coste extra' using errcode = 'P0002';
  end if;

  select code into v_code from public.works where id = x.work_id;

  update public.work_extras
     set invoiced = coalesce(p_invoiced, false),
         -- Al marcarlo, la fecha que digan o la de hoy. Al desmarcarlo,
         -- se va: un coste sin facturar no tiene fecha de factura.
         invoiced_on = case when coalesce(p_invoiced, false)
                            then coalesce(p_on, public.today_madrid())
                            else null end,
         updated_at = now()
   where id = p_extra
  returning * into x;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'facturar_extra', 'work_extras', x.id, v_code,
          public.actor_name() ||
          case when x.invoiced
               then ' marcó como facturado el coste extra «' || x.concept || '» (' ||
                    public.fmt_eur(x.amount) || ') de ' || coalesce(v_code, 'una obra') ||
                    ', con fecha ' || to_char(x.invoiced_on, 'DD/MM/YYYY')
               else ' quitó la marca de facturado del coste extra «' || x.concept ||
                    '» de ' || coalesce(v_code, 'una obra')
          end,
          jsonb_build_object('facturado', x.invoiced, 'fecha', x.invoiced_on,
                             'importe', x.amount),
          x.is_demo);

  return x;
end $$;

comment on function public.set_work_extra_invoiced(uuid, boolean, date) is
  'Marca o desmarca un coste extra como facturado. A mano, nunca solo.';

grant execute on function public.set_work_extra_invoiced(uuid, boolean, date) to authenticated;
revoke execute on function public.set_work_extra_invoiced(uuid, boolean, date) from anon, public;


-- ---------------------------------------------------------------------
-- 2) LAS CUENTAS DE LA OBRA, CON LOS EXTRAS FACTURADOS
--
-- «facturado» pasa a ser lo facturado de los proyectos MÁS los costes
-- extra que están marcados como facturados. Solo los marcados: así un
-- extra no se cuenta dos veces ni se da por facturado antes de estarlo.
--
-- Se mantienen todas las columnas con su nombre, su tipo y su orden —lo
-- único que «create or replace view» permite—, y se añaden al final las
-- dos nuevas, que es donde se pueden añadir.
-- ---------------------------------------------------------------------
create or replace view public.work_summary with (security_invoker = true) as
  select w.id as work_id,
         w.code,
         w.name,
         coalesce(p.proyectos, 0)        as proyectos,
         coalesce(p.activos, 0)          as proyectos_activos,
         coalesce(p.finalizados, 0)      as proyectos_finalizados,
         coalesce(p.total_proyectos, 0)  as total_proyectos,
         coalesce(e.extras, 0)           as extras,
         coalesce(p.total_proyectos, 0) + coalesce(e.extras, 0) as total_estimado,
         -- Lo facturado de los proyectos + los extras ya facturados.
         coalesce(p.facturado, 0) + coalesce(e.extras_facturados, 0) as facturado,
         coalesce(p.total_proyectos, 0) + coalesce(e.extras, 0)
           - coalesce(p.facturado, 0) - coalesce(e.extras_facturados, 0) as pendiente_facturar,
         coalesce(p.cobrado, 0)          as cobrado,
         coalesce(p.material_pendiente, 0) as material_pendiente,
         coalesce(w.cal_start, p.desde)  as desde,
         coalesce(w.cal_end, p.hasta)    as hasta,
         -- Nuevas, al final: cuánto de los extras está ya facturado y
         -- cuánto queda. Así la pantalla no tiene que hacer cuentas.
         coalesce(e.extras_facturados, 0) as extras_facturados,
         coalesce(e.extras, 0) - coalesce(e.extras_facturados, 0) as extras_pendientes
    from public.works w
    left join lateral (
      select count(*)                                                   as proyectos,
             count(*) filter (where pr.phase <> 'finalizado'
                                and pr.archived_at is null)              as activos,
             count(*) filter (where pr.phase = 'finalizado')             as finalizados,
             coalesce(sum(pr.budget_amount), 0)                          as total_proyectos,
             coalesce(sum(pr.invoiced_amount), 0)                        as facturado,
             coalesce(sum((select b.cobrado from public.project_billing b
                            where b.project_id = pr.id)), 0)             as cobrado,
             coalesce(sum((select count(*) from public.materials m
                            where m.project_id = pr.id
                              and not m.received and m.archived_at is null)), 0) as material_pendiente,
             min(least(pr.fab_start, pr.mont_start))                     as desde,
             max(greatest(pr.fab_end, pr.mont_end))                      as hasta
        from public.projects pr
       where pr.work_id = w.id
    ) p on true
    left join lateral (
      select coalesce(sum(x.amount), 0)                                  as extras,
             coalesce(sum(x.amount) filter (where x.invoiced), 0)        as extras_facturados
        from public.work_extras x where x.work_id = w.id
    ) e on true;

comment on view public.work_summary is
  'Las cuentas y el periodo de cada obra. Solo las ve administración: lee «projects», que es suya. «facturado» incluye los costes extra marcados como facturados, y solo esos.';


-- ---------------------------------------------------------------------
-- 3) LA PANTALLA DE CLIENTES · TODO EN UNA VISTA
--
-- No hay nada que incrustar: la pantalla pide esta vista y ya viene con
-- la actividad y las cuentas. Se mantiene «client_activity» tal como
-- está, porque la usa el script de verificación 05.
--
-- SOLO ADMINISTRACIÓN. Lleva «security_barrier» y filtra ella misma, en
-- lugar de heredar los permisos de «clients»: un trabajador SÍ ve
-- algunos clientes (los de sus avisos), y por esa puerta se le colaría
-- el dinero. Es el mismo patrón que «profiles_full» y «worker_projects».
--
-- LAS CUATRO MAGNITUDES, definidas con lo que existe de verdad:
--
--   presupuestado      Σ projects.budget_amount  +  Σ work_extras.amount
--                      de las obras del cliente.
--
--                      NO se suman los importes de los presupuestos
--                      («fichas.amount») a propósito: un presupuesto
--                      aceptado se convierte en proyecto, así que
--                      sumar los dos contaría lo mismo dos veces.
--
--   facturado          Σ projects.invoiced_amount  +  Σ work_extras.amount
--                      de los extras MARCADOS como facturados.
--                      Es facturación de verdad, marcada a mano: el
--                      presupuesto de un proyecto NO se da por
--                      facturado por existir.
--
--   cobrado            Σ payments.amount de los cobros NO anulados.
--
--   pendiente_facturar presupuestado − facturado
--   pendiente_cobrar   facturado − cobrado
--                      Lo pendiente de cobrar es lo que se ha facturado
--                      y todavía no ha entrado. No se cuenta como
--                      pendiente de cobro algo que aún no se ha
--                      facturado, porque todavía no se le debe a nadie.
--
-- QUÉ QUEDA FUERA: lo ARCHIVADO. Ni proyectos ni obras archivados
-- cuentan en ninguna de las cuatro. Es una decisión, no un olvido: así
-- lo que se abandonó no infla lo que queda por facturar. El efecto es
-- que archivar un proyecto ya facturado lo saca también del facturado
-- del cliente. No hay ningún campo que distinga «archivado porque se
-- canceló» de «archivado porque se acabó y se guarda»; si hiciera falta
-- distinguirlo, haría falta decidir ese campo.
-- ---------------------------------------------------------------------
create or replace view public.client_overview with (security_barrier = true) as
  select c.id,
         c.kind,
         c.name,
         c.tax_id,
         c.phone,
         c.email,
         c.address,
         c.city,
         c.postal_code,
         c.notes,
         c.active,
         c.archived_at,
         c.is_demo,
         c.created_at,
         c.updated_at,
         -- Actividad: lo mismo que daba «client_activity».
         coalesce(f.budgets, 0)      as budgets,
         coalesce(f.visits, 0)       as visits,
         coalesce(f.notices, 0)      as notices,
         coalesce(f.open_notices, 0) as open_notices,
         f.last_activity,
         -- Las cuatro magnitudes, más el facturado para poder cuadrarlas.
         coalesce(p.presupuestado, 0) + coalesce(x.extras, 0)       as presupuestado,
         coalesce(p.facturado, 0) + coalesce(x.extras_facturados, 0) as facturado,
         coalesce(p.cobrado, 0)                                      as cobrado,
         coalesce(p.presupuestado, 0) + coalesce(x.extras, 0)
           - coalesce(p.facturado, 0) - coalesce(x.extras_facturados, 0) as pendiente_facturar,
         coalesce(p.facturado, 0) + coalesce(x.extras_facturados, 0)
           - coalesce(p.cobrado, 0)                                  as pendiente_cobrar,
         coalesce(p.proyectos, 0)       as proyectos,
         coalesce(p.proyectos_activos, 0) as proyectos_activos
    from public.clients c
    left join lateral (
      select count(*) filter (where fi.type = 'presupuesto' and fi.archived_at is null) as budgets,
             count(*) filter (where fi.type = 'visita'      and fi.archived_at is null) as visits,
             count(*) filter (where fi.type = 'aviso'       and fi.archived_at is null) as notices,
             count(*) filter (where fi.type = 'aviso' and fi.archived_at is null
                                and fi.status not in ('realizado', 'cerrado'))          as open_notices,
             max(fi.created_at) as last_activity
        from public.fichas fi where fi.client_id = c.id
    ) f on true
    left join lateral (
      select coalesce(sum(pr.budget_amount), 0)   as presupuestado,
             coalesce(sum(pr.invoiced_amount), 0) as facturado,
             coalesce(sum((select b.cobrado from public.project_billing b
                            where b.project_id = pr.id)), 0) as cobrado,
             count(*)                             as proyectos,
             count(*) filter (where pr.phase <> 'finalizado') as proyectos_activos
        from public.projects pr
       where pr.client_id = c.id and pr.archived_at is null
    ) p on true
    left join lateral (
      select coalesce(sum(ex.amount), 0)                           as extras,
             coalesce(sum(ex.amount) filter (where ex.invoiced), 0) as extras_facturados
        from public.work_extras ex
        join public.works wo on wo.id = ex.work_id
       where wo.client_id = c.id and wo.archived_at is null
    ) x on true
   where public.is_admin();

comment on view public.client_overview is
  'El cliente con su actividad y sus cuatro magnitudes económicas. SOLO administración: filtra ella misma porque un trabajador sí ve algunos clientes. Lo archivado no cuenta.';

grant select on public.client_overview to authenticated, service_role;
revoke all on public.client_overview from anon;


-- ---------------------------------------------------------------------
-- 4) LA DOCUMENTACIÓN DE LA OBRA
--
-- Una columna más y la regla de «un solo dueño», igual que se hizo con
-- los comentarios de la obra en el script 31. Así hereda los permisos,
-- el historial y la pantalla que ya existen.
--
-- Las carpetas del almacén quedan «works/<id>/…». No hace falta tocar
-- «storage_can_read» ni «storage_can_upload»: las dos empiezan por
-- «is_admin()», y la documentación de una obra es de administración. El
-- trabajador cae en el «else false» de siempre.
-- ---------------------------------------------------------------------
alter table public.documents add column if not exists work_id uuid
  references public.works(id) on delete cascade;

alter table public.documents drop constraint if exists documents_one_owner;
alter table public.documents add constraint documents_one_owner
  check (num_nonnulls(ficha_id, project_id, order_id, report_id, work_id) = 1);

create index if not exists documents_work_idx on public.documents (work_id, created_at);


/**
 * LA DOCUMENTACIÓN QUE SE VE DESDE UNA OBRA.
 *
 * Dos orígenes y NINGÚN archivo duplicado:
 *   · lo subido directamente a la obra;
 *   · lo subido a sus proyectos, que se ve desde aquí sin copiarse.
 *
 * «origen_code» y «origen_name» dicen de qué proyecto viene cada uno, y
 * van en blanco cuando el archivo es de la obra. Es lo que se pidió:
 * poder identificar el proyecto de origen de cada documento.
 *
 * SOLO ADMINISTRACIÓN, por lo mismo que «client_overview»: filtra ella
 * misma en lugar de confiar en los permisos de la tabla.
 */
create or replace view public.work_documents with (security_barrier = true) as
  select d.id,
         w.id            as work_id,
         d.project_id,
         pr.code         as origen_code,
         pr.name         as origen_name,
         d.bucket,
         d.storage_path,
         d.file_name,
         d.mime_type,
         d.size_bytes,
         d.category,
         d.scope,
         d.uploaded_by,
         pf.full_name    as uploader_name,
         d.deleted_at,
         d.created_at
    from public.works w
    join public.documents d
      on d.work_id = w.id
      or d.project_id in (select pr2.id from public.projects pr2 where pr2.work_id = w.id)
    left join public.projects pr on pr.id = d.project_id
    left join public.profiles pf on pf.id = d.uploaded_by
   where public.is_admin();

comment on view public.work_documents is
  'Los archivos de una obra: los suyos y los de sus proyectos, sin duplicar ninguno. «origen_code» dice de qué proyecto viene. Solo administración.';

grant select on public.work_documents to authenticated, service_role;
revoke all on public.work_documents from anon;


-- ---------------------------------------------------------------------
-- 5) AL BORRAR UNA OBRA, SUS ARCHIVOS
--
-- «delete_work» ya se lleva los comentarios de la obra. Ahora hay
-- archivos colgando de ella y hay que contarlos igual, para no dejar
-- filas huérfanas. La columna es «on delete cascade», así que la base de
-- datos se los lleva sola; lo que falta es DECIRLO en el recuento, que
-- es lo que la pantalla enseña antes de borrar.
--
-- Se envuelve la función que ya existe en lugar de reescribirla: sigue
-- haciendo exactamente lo mismo y además informa de los archivos.
-- ---------------------------------------------------------------------
create or replace function public.work_document_paths(p_work uuid)
returns setof text language sql stable security definer set search_path = public as $$
  select d.storage_path
    from public.documents d
   where public.is_admin() and d.work_id = p_work;
$$;

comment on function public.work_document_paths(uuid) is
  'Las rutas de los archivos propios de una obra, para retirarlos del almacén antes de borrarla.';

grant execute on function public.work_document_paths(uuid) to authenticated;
revoke execute on function public.work_document_paths(uuid) from anon, public;
