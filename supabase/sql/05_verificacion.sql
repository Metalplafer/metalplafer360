-- =====================================================================
-- METALPLAFER360 · 05 · COMPROBACIÓN Y TAREAS HABITUALES
--
-- Este archivo NO hace falta para que la aplicación funcione.
-- Son consultas de apoyo: ejecútalas en Supabase > SQL Editor cuando
-- quieras comprobar que todo está bien o cambiar el rol de alguien.
-- Ejecuta cada bloque por separado (selecciona el texto y pulsa Run).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) ¿Está todo instalado? Debe responder «CORRECTO» en las 8 filas.
-- ---------------------------------------------------------------------
select 'Tablas creadas' as comprobacion,
       case when count(*) = 18 then 'CORRECTO' else 'FALTAN TABLAS (' || count(*) || ' de 18)' end as resultado
  from pg_tables where schemaname = 'public'
   and tablename in ('profiles', 'app_settings', 'code_counters', 'audit_log',
                     'clients', 'client_contacts', 'fichas', 'documents', 'comments',
                     'projects', 'project_substatuses',
                     'work_orders', 'work_order_workers', 'notifications',
                     'materials', 'material_requests', 'payments', 'backups')
union all
select 'Seguridad RLS activada',
       case when bool_and(rowsecurity) then 'CORRECTO' else 'HAY TABLAS SIN PROTEGER' end
  from pg_tables where schemaname = 'public'
union all
select 'Políticas de acceso',
       case when count(*) >= 36 then 'CORRECTO' else 'FALTAN POLÍTICAS (' || count(*) || ')' end
  from pg_policies where schemaname = 'public'
union all
select 'Contenedor de archivos',
       case when exists (select 1 from storage.buckets where id = 'documentos' and not public)
            then 'CORRECTO' else 'FALTA EL BUCKET «documentos»' end
union all
select 'Alta automática de perfiles',
       case when exists (select 1 from pg_trigger where tgname = 'on_auth_user_created')
            then 'CORRECTO' else 'FALTA EL TRIGGER' end
union all
-- Panel de inicio, informes y copias (archivos 18, 19 y 20)
select 'Panel e informes',
       case when count(*) = 7 then 'CORRECTO'
            else 'FALTAN FUNCIONES DE INFORMES (' || count(*) || ' de 7)' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('dashboard_summary', 'report_projects', 'report_projects_by_phase',
                     'report_hours_by_worker', 'report_hours_by_project',
                     'report_materials', 'report_suppliers')
union all
select 'Copias y restauración',
       case when count(*) = 4 then 'CORRECTO'
            else 'FALTAN FUNCIONES DE COPIAS (' || count(*) || ' de 4)' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('start_backup', 'finish_backup', 'restore_data', 'restore_table')
union all
select 'Nadie puede restaurar por su cuenta',
       case when not has_function_privilege('authenticated', 'public.restore_table(text, jsonb)', 'execute')
            then 'CORRECTO' else 'PELIGRO: restore_table ESTÁ ABIERTA' end;


-- ---------------------------------------------------------------------
-- 1b) ¿Está programada la copia automática? (solo si ejecutaste el 21)
--     Si responde 0 filas, la copia automática no está puesta en marcha:
--     la copia manual desde la aplicación sigue funcionando igual.
-- ---------------------------------------------------------------------
-- select jobname as tarea, schedule as cuando, active as activa
--   from cron.job where jobname = 'm360-backup-diario';

-- Cómo han ido las últimas ejecuciones automáticas:
-- select status, return_message, start_time
--   from cron.job_run_details order by start_time desc limit 10;


-- ---------------------------------------------------------------------
-- 2) ¿Quién puede entrar en la aplicación?
-- ---------------------------------------------------------------------
select p.full_name    as nombre,
       p.username     as usuario,
       case p.role when 'admin' then 'Administración' else 'Trabajador' end as rol,
       case when p.active then 'Activo' else 'Desactivado' end as estado,
       to_char(p.created_at at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') as creado
  from public.profiles p
 order by p.role, p.full_name;


-- ---------------------------------------------------------------------
-- 3) CONVERTIR A UN USUARIO EN ADMINISTRADOR
--    Cambia 'salvi' por el nombre de usuario correspondiente y pulsa Run.
-- ---------------------------------------------------------------------
-- update public.profiles set role = 'admin' where username = 'salvi';


-- ---------------------------------------------------------------------
-- 4) CONVERTIR A UN USUARIO EN TRABAJADOR
-- ---------------------------------------------------------------------
-- update public.profiles set role = 'worker' where username = 'juan';


-- ---------------------------------------------------------------------
-- 5) DESACTIVAR / REACTIVAR A UNA PERSONA (no se borra: se desactiva)
-- ---------------------------------------------------------------------
-- update public.profiles set active = false where username = 'juan';
-- update public.profiles set active = true  where username = 'juan';


-- ---------------------------------------------------------------------
-- 6) CORREGIR EL NOMBRE VISIBLE DE UNA PERSONA
-- ---------------------------------------------------------------------
-- update public.profiles set full_name = 'Juan Ortega' where username = 'juan';


-- ---------------------------------------------------------------------
-- 7) Historial de acciones (lo más reciente primero)
-- ---------------------------------------------------------------------
select to_char(occurred_at at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI:SS') as cuando,
       summary as accion
  from public.audit_log
 order by occurred_at desc
 limit 50;


-- ---------------------------------------------------------------------
-- 8) Datos de la empresa y límites (Configuración)
-- ---------------------------------------------------------------------
select company ->> 'name' as empresa,
       max_file_mb        as "MB máximos por archivo",
       backup_retention_days as "días de backup guardados"
  from public.app_settings where id = 1;

-- Para cambiar el nombre de la empresa o el CIF:
-- update public.app_settings
--    set company = company || jsonb_build_object('name', 'METALPLAFER S.L.', 'tax_id', 'B72768310')
--  where id = 1;


-- ---------------------------------------------------------------------
-- 9) Fichas abiertas por tipo (lo que queda pendiente)
-- ---------------------------------------------------------------------
select case type when 'presupuesto' then 'Presupuestos'
                 when 'visita'      then 'Visitas'
                 else                    'Avisos' end as tipo,
       count(*) as abiertas
  from public.fichas
 where archived_at is null
   and status not in ('aceptado', 'cancelado', 'realizada', 'cancelada', 'realizado', 'cerrado')
 group by type;


-- ---------------------------------------------------------------------
-- 10) Numeración: por dónde va cada serie
-- ---------------------------------------------------------------------
select prefix as serie, year as anio, last_value as ultimo_numero
  from public.code_counters
 order by year desc, prefix;


-- ---------------------------------------------------------------------
-- 11) Clientes con más actividad
-- ---------------------------------------------------------------------
select c.name as cliente,
       a.budgets as presupuestos, a.visits as visitas, a.notices as avisos,
       to_char(a.last_activity at time zone 'Europe/Madrid', 'DD/MM/YYYY') as ultima_ficha
  from public.clients c
  join public.client_activity a on a.client_id = c.id
 where c.archived_at is null
 order by (a.budgets + a.visits + a.notices) desc, c.name
 limit 20;


-- ---------------------------------------------------------------------
-- 12) PAPELERA: documentos eliminados que se pueden recuperar
-- ---------------------------------------------------------------------
select d.file_name as archivo, f.code as ficha,
       to_char(d.deleted_at at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') as eliminado
  from public.documents d
  left join public.fichas f on f.id = d.ficha_id
 where d.deleted_at is not null
 order by d.deleted_at desc;

-- Para recuperar uno concreto (copia su identificador de la consulta anterior):
-- select public.restore_document('PEGA-AQUI-EL-ID');


-- ---------------------------------------------------------------------
-- 13) Proyectos en curso, con su fase y sus subestados
-- ---------------------------------------------------------------------
select p.code as proyecto, c.name as cliente,
       public.label_es(p.phase::text) as fase,
       coalesce(string_agg(public.label_es(s.substatus), ', ' order by s.substatus), '—') as subestados,
       public.fmt_eur(p.budget_amount) as presupuesto
  from public.projects p
  join public.clients c on c.id = p.client_id
  left join public.project_substatuses s on s.project_id = p.id and s.phase = p.phase
 where p.archived_at is null and p.phase <> 'finalizado'
 group by p.id, c.name
 order by p.code;


-- ---------------------------------------------------------------------
-- 14) Proyectos listos para finalizar (cobrados pero sin cerrar)
-- ---------------------------------------------------------------------
select code as proyecto, name as nombre, message as sugerencia
  from public.v_phase_suggestions;

-- Para finalizar uno (se hace normalmente con el botón de la aplicación):
-- select public.finalize_project('PEGA-AQUI-EL-ID-DEL-PROYECTO');


-- ---------------------------------------------------------------------
-- 15) ÓRDENES DE TRABAJO abiertas, con quién va y cómo va
-- ---------------------------------------------------------------------
select o.code                                   as orden,
       public.order_type_es(o.type)             as tipo,
       to_char(o.scheduled_date, 'DD/MM/YYYY')  as fecha,
       p.code                                   as proyecto,
       public.order_status_es(o.status)         as estado,
       coalesce(string_agg(pr.full_name, ', ' order by pr.full_name), 'sin asignar') as trabajadores,
       public.fmt_hours(o.planned_hours)        as previstas,
       public.fmt_hours(coalesce(sum(w.hours), 0)) as reales
  from public.work_orders o
  join public.projects p on p.id = o.project_id
  left join public.work_order_workers w on w.order_id = o.id
  left join public.profiles pr on pr.id = w.worker_id
 where o.archived_at is null
   and o.status <> 'validada'
 group by o.id, p.code
 order by o.scheduled_date, o.code;


-- ---------------------------------------------------------------------
-- 16) ÓRDENES PENDIENTES DE REVISIÓN (lo que espera a administración)
-- ---------------------------------------------------------------------
select o.code as orden,
       to_char(o.submitted_at at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') as enviada,
       p.code as proyecto,
       public.fmt_hours(h.horas_reales) as horas_reales,
       h.trabajadores
  from public.work_orders o
  join public.projects p on p.id = o.project_id
  left join public.order_hours h on h.order_id = o.id
 where o.archived_at is null and o.status = 'realizada'
 order by o.submitted_at;


-- ---------------------------------------------------------------------
-- 17) HORAS POR TRABAJADOR (del mes en curso)
-- ---------------------------------------------------------------------
select pr.full_name as trabajador,
       public.fmt_hours(sum(w.hours) filter (where o.type = 'fabricacion')) as fabricacion,
       public.fmt_hours(sum(w.hours) filter (where o.type = 'montaje'))     as montaje,
       public.fmt_hours(sum(w.hours))                                       as total
  from public.work_order_workers w
  join public.work_orders o on o.id = w.order_id
  join public.profiles pr    on pr.id = w.worker_id
 where o.archived_at is null
   and date_trunc('month', o.scheduled_date) = date_trunc('month', public.today_madrid())
 group by pr.full_name
 order by sum(w.hours) desc nulls last;


-- ---------------------------------------------------------------------
-- 18) ÓRDENES DEVUELTAS Y SU MOTIVO
-- ---------------------------------------------------------------------
select o.code as orden,
       to_char(o.returned_at at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') as devuelta,
       o.return_reason as motivo
  from public.work_orders o
 where o.status = 'devuelta'
 order by o.returned_at desc;


-- ---------------------------------------------------------------------
-- 19) MATERIAL PENDIENTE, con lo que llega tarde primero
-- ---------------------------------------------------------------------
select m.name                                   as material,
       public.fmt_units(m.units)                as unidades,
       coalesce(m.supplier, '—')                as proveedor,
       p.code                                   as proyecto,
       to_char(m.ordered_on,  'DD/MM/YYYY')     as pedido,
       to_char(m.expected_on, 'DD/MM/YYYY')     as previsto,
       case when m.expected_on < public.today_madrid() then 'RETRASADO' else '' end as aviso
  from public.materials m
  join public.projects p on p.id = m.project_id
 where m.archived_at is null and not m.received
 order by m.expected_on nulls last, p.code;


-- ---------------------------------------------------------------------
-- 20) PROVEEDORES MÁS UTILIZADOS
-- ---------------------------------------------------------------------
select supplier as proveedor, count(*) as veces,
       count(*) filter (where not received) as pendientes
  from public.materials
 where supplier is not null and archived_at is null
 group by supplier
 order by count(*) desc, supplier;


-- ---------------------------------------------------------------------
-- 21) AVISOS DE MATERIAL DEL TALLER PENDIENTES DE REVISAR
-- ---------------------------------------------------------------------
select pr.full_name as trabajador,
       r.body       as comunicado,
       coalesce(o.code, p.code) as donde,
       to_char(r.created_at at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') as cuando
  from public.material_requests r
  join public.profiles pr on pr.id = r.worker_id
  join public.projects p  on p.id = r.project_id
  left join public.work_orders o on o.id = r.order_id
 where r.status = 'pendiente'
 order by r.created_at;


-- ---------------------------------------------------------------------
-- 22) FACTURACIÓN: total, cobrado y pendiente de cada proyecto
-- ---------------------------------------------------------------------
select p.code                                   as proyecto,
       c.name                                   as cliente,
       public.label_es(p.billing_status::text)   as estado,
       public.fmt_eur(b.total)                  as total,
       public.fmt_eur(b.cobrado)                as cobrado,
       public.fmt_eur(b.pendiente)              as pendiente
  from public.projects p
  join public.clients c        on c.id = p.client_id
  join public.project_billing b on b.project_id = p.id
 where p.archived_at is null and p.billing_status <> 'cobrado'
 order by b.pendiente desc;


-- ---------------------------------------------------------------------
-- 23) COBROS APUNTADOS
-- ---------------------------------------------------------------------
select p.code as proyecto,
       public.fmt_eur(pay.amount) as importe,
       to_char(pay.paid_on, 'DD/MM/YYYY') as fecha,
       coalesce(pay.notes, '') as nota
  from public.payments pay
  join public.projects p on p.id = pay.project_id
 order by pay.paid_on desc;


-- ---------------------------------------------------------------------
-- 24) COPIAS DE SEGURIDAD HECHAS (lo mismo que se ve en Configuración)
-- ---------------------------------------------------------------------
select to_char(started_at at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') as cuando,
       case kind when 'manual' then 'Manual' else 'Automática' end as tipo,
       case destination when 'drive' then 'Google Drive' else 'Descarga' end as destino,
       coalesce(file_name, '—')                                    as archivo,
       case when size_bytes is null then '—'
            else round(size_bytes / 1024.0)::text || ' KB' end     as tamano,
       case status when 'completado' then 'Completada'
                   when 'error'      then 'ERROR: ' || coalesce(error, '')
                   else                   'En curso' end           as estado
  from public.backups
 order by started_at desc
 limit 30;


-- ---------------------------------------------------------------------
-- 25) ¿Se está haciendo la copia todos los días?
--     Si la última automática es de hace más de un día, algo falla:
--     revisa el archivo 21 y los secretos de la función en Supabase.
-- ---------------------------------------------------------------------
select case when max(started_at) is null then 'NUNCA se ha hecho una copia automática'
            when max(started_at) > now() - interval '36 hours' then 'CORRECTO: al día'
            else 'ATENCIÓN: la última fue el '
                 || to_char(max(started_at) at time zone 'Europe/Madrid', 'DD/MM/YYYY') end as copia_automatica
  from public.backups
 where kind = 'automatico' and status = 'completado';


-- ---------------------------------------------------------------------
-- 26) AJUSTES DE LA COPIA (aquí NO hay ninguna credencial de Google:
--     esas viven solo en los secretos de Supabase)
-- ---------------------------------------------------------------------
select coalesce((backup ->> 'enabled')::boolean, true) as automatica_activada,
       coalesce((backup ->> 'hour')::int, 2)           as hora,
       backup ->> 'folder'                             as carpeta_drive,
       backup_retention_days                           as dias_que_se_guardan
  from public.app_settings where id = 1;


-- ---------------------------------------------------------------------
-- 27) EL PANEL DE INICIO, en una sola consulta (este mes)
-- ---------------------------------------------------------------------
select public.dashboard_summary(date_trunc('month', public.today_madrid())::date,
                                public.today_madrid()) as panel;


-- ---------------------------------------------------------------------
-- 28) CUÁNTO OCUPAN LOS ARCHIVOS
-- ---------------------------------------------------------------------
select tipo,
       archivos,
       round(bytes / 1048576.0, 1)          as mb,
       en_papelera,
       round(bytes_papelera / 1048576.0, 1) as mb_en_papelera
  from public.storage_usage
 order by tipo;


-- ---------------------------------------------------------------------
-- 29) QUIÉN HA RESTAURADO UNA COPIA (queda siempre registrado)
-- ---------------------------------------------------------------------
select to_char(occurred_at at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') as cuando,
       actor_name as quien, summary as que_hizo, details as detalle
  from public.audit_log
 where action in ('restauracion', 'backup')
 order by occurred_at desc
 limit 20;
