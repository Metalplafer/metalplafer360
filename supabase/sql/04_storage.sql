-- =====================================================================
-- METALPLAFER360 · 04 · ALMACENAMIENTO DE ARCHIVOS (FASE 1)
--
-- Se crea el contenedor ("bucket") privado donde vivirán documentos,
-- fotografías y vídeos, con el límite de 100 MB por archivo.
--
-- Estructura de carpetas prevista:
--   projects/<id_del_proyecto>/<archivo>
--   orders/<id_de_la_orden>/<archivo>
--   fichas/<id_de_la_ficha>/<archivo>
--
-- En esta fase solo administración accede. El acceso de los trabajadores
-- a las carpetas de SUS órdenes se añadirá junto al módulo de órdenes,
-- ampliando únicamente las dos funciones de abajo.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 104857600)   -- 100 MB
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit;

-- ¿Puede esta persona LEER este archivo?
create or replace function public.storage_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin();
$$;

-- ¿Puede esta persona SUBIR este archivo?
create or replace function public.storage_can_upload(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin();
$$;

grant execute on function public.storage_can_read(text), public.storage_can_upload(text) to authenticated;

drop policy if exists m360_read   on storage.objects;
drop policy if exists m360_insert on storage.objects;
drop policy if exists m360_update on storage.objects;
drop policy if exists m360_delete on storage.objects;

create policy m360_read on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.storage_can_read(name));

create policy m360_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.storage_can_upload(name));

create policy m360_update on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and public.is_admin())
  with check (bucket_id = 'documentos' and public.is_admin());

create policy m360_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.is_admin());
