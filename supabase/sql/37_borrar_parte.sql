-- =====================================================================
-- METALPLAFER360 · ELIMINAR UN PARTE DE TRABAJO
--
-- Para los partes creados por error o durante las pruebas, sin tener que
-- entrar en Supabase. Se hace con una función, como todo lo que escribe
-- en «work_reports»: la tabla tiene retirados los permisos de insertar,
-- modificar y borrar para quien tiene sesión, y eso NO se toca.
--
--
-- LO QUE SE VA CON EL PARTE, Y LO QUE NO
--
-- Tres cosas cuelgan del parte con «on delete cascade», así que la base
-- de datos se las lleva ella sola:
--
--   · sus DOCUMENTOS (las fotografías, los vídeos y la firma del
--     cliente). Son del parte y de nadie más: no tendría sentido
--     conservar la firma de un parte que ya no existe.
--   · sus COMENTARIOS, incluidos los que escribió administración al
--     rechazarlo.
--   · sus AVISOS internos.
--
-- Lo que NO se toca, y conviene tenerlo claro:
--
--   · los AVISOS DE MATERIAL. «material_requests» cuelga del PROYECTO,
--     no del parte: no tiene ninguna columna que apunte aquí. Un aviso
--     de material que se levantó desde un parte SOBREVIVE al borrado del
--     parte, y así debe ser: el material sigue faltando.
--   · los demás partes, el proyecto, el cliente y las asignaciones.
--   · el HISTORIAL. Queda una anotación con el registro completo del
--     parte dentro, así que lo borrado se puede consultar después.
--   · los ARCHIVOS DEL ALMACÉN. La base de datos borra las filas de
--     «documents», pero no puede tocar Supabase Storage. De eso se
--     encarga la aplicación, que recoge las rutas ANTES de llamar aquí y
--     las retira después, igual que ya hace al eliminar un proyecto.
--
--
-- UN PARTE VALIDADO NO SE BORRA
--
-- «hours_worked» —las horas que cuentan como trabajo realizado— sale de
-- los partes con estado «validado». Borrar uno validado bajaría en
-- silencio las horas realizadas de un proyecto, que es un dato de
-- producción, no un apunte cualquiera.
--
-- Así que se rechaza, con el mismo criterio que «delete_project» aplica
-- a los cobros y a las horas ya validadas. Y se dice qué hacer: hay que
-- RECHAZARLO primero, que se hace en la misma pantalla y con un clic
-- («reject_work_report» admite rechazar un parte validado). Al
-- rechazarlo deja de contar, y entonces ya se puede eliminar.
--
-- No es una excepción para «partes de prueba»: la regla es la misma para
-- todos y mira el estado del parte, no quién lo dice.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- =====================================================================

create or replace function public.delete_work_report(p_report uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.work_reports;
  v_trabajador text;
  v_proyecto   text;
  v_docs int; v_firmas int; v_comentarios int; v_avisos int;
begin
  perform public.assert_admin();

  select * into r from public.work_reports where id = p_report for update;
  if not found then
    raise exception 'No se encuentra el parte de trabajo' using errcode = 'P0002';
  end if;

  -- Un parte validado son horas de producción. Primero se rechaza.
  if r.status = 'validado' then
    raise exception
      'No se puede eliminar % porque está validado y sus % cuentan como trabajo realizado. Recházalo primero: así dejan de contar y después podrás eliminarlo.',
      r.code, public.fmt_hours(r.hours) using errcode = '23503';
  end if;

  select full_name into v_trabajador from public.profiles where id = r.worker_id;
  select code      into v_proyecto   from public.projects where id = r.project_id;

  select count(*) into v_docs        from public.documents where report_id = p_report;
  select count(*) into v_firmas      from public.documents
   where report_id = p_report and category = 'firma';
  select count(*) into v_comentarios from public.comments  where report_id = p_report;
  select count(*) into v_avisos      from public.notifications where report_id = p_report;

  -- Se silencia el registro automático para escribir UNA anotación con
  -- todo: si no, el borrado en cascada dejaría una línea por cada
  -- fotografía y por cada comentario, y el historial no se entendería.
  perform set_config('app.skip_audit', 'on', true);
  delete from public.work_reports where id = p_report;
  perform set_config('app.skip_audit', 'off', true);

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id,
                                entity_code, summary, details, is_demo)
  values (auth.uid(), public.actor_name(), 'eliminar_parte', 'work_reports', r.id, r.code,
          public.actor_name() || ' eliminó el parte ' || r.code ||
          coalesce(' de ' || v_trabajador, '') ||
          case when r.hours is not null then ' (' || public.fmt_hours(r.hours) || ')' else '' end ||
          coalesce(' del proyecto ' || v_proyecto, ' (sin proyecto)') ||
          -- «report_status_es», no «label_es»: el genérico traduce
          -- «enviado» como «Presupuesto enviado», que aquí no pega.
          ', en estado ' || public.report_status_es(r.status) ||
          case when v_docs + v_comentarios > 0
               then '. Se fueron con él ' || v_docs || ' archivo(s) y ' ||
                    v_comentarios || ' comentario(s)'
               else '' end,
          jsonb_build_object('registro', to_jsonb(r),
                             'documentos', v_docs, 'firmas', v_firmas,
                             'comentarios', v_comentarios, 'avisos', v_avisos,
                             'proyecto', v_proyecto, 'trabajador', v_trabajador),
          r.is_demo);

  return jsonb_build_object('ok', true, 'code', r.code,
                            'documentos', v_docs, 'firmas', v_firmas,
                            'comentarios', v_comentarios, 'avisos', v_avisos,
                            'proyecto', v_proyecto);
end $$;

comment on function public.delete_work_report(uuid) is
  'Elimina un parte de trabajo con sus archivos, comentarios y avisos. Solo administración, y nunca uno validado: ese hay que rechazarlo primero.';

grant execute on function public.delete_work_report(uuid) to authenticated;
revoke execute on function public.delete_work_report(uuid) from anon, public;
