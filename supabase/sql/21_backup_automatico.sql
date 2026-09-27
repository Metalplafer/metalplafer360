-- =====================================================================
-- METALPLAFER360 · 21 · COPIA DE SEGURIDAD AUTOMÁTICA (FASE 6)
--
-- Programa la copia diaria a las 02:00 (hora de Madrid) llamando a la
-- función «backup-drive» publicada en Supabase.
--
-- IMPORTANTE SOBRE LOS SECRETOS
-- -----------------------------
-- En este archivo NO hay ninguna clave. El secreto que autoriza la
-- llamada se guarda en la bóveda de Supabase (Vault) ejecutando UNA VEZ,
-- a mano, en el editor SQL:
--
--     select vault.create_secret('invéntate-aquí-una-frase-larga',
--                                'm360_backup_secret');
--
-- Ese mismo valor se pone como secreto de la función:
--     supabase secrets set BACKUP_CRON_SECRET="la-misma-frase"
--
-- Este archivo se ejecuta SOLO en Supabase, no hace falta para que la
-- aplicación funcione. Sin él, la copia manual sigue funcionando.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Extensiones necesarias (en Supabase ya están disponibles)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron no está disponible: la copia automática no se programará.';
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
exception when others then
  raise notice 'No se han podido preparar pg_cron/pg_net: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 2) La llamada diaria
--
-- pg_cron trabaja en UTC. En España la hora cambia dos veces al año, así
-- que se programa a las 00:00 y a la 01:00 UTC y la propia función
-- comprueba que en Madrid sean las 2 de la madrugada. Así la copia se
-- hace a las 02:00 tanto en invierno como en verano, y solo una vez.
-- ---------------------------------------------------------------------
create or replace function public.run_daily_backup() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_secret text;
  v_enabled boolean;
  v_hour int;
begin
  select coalesce((backup ->> 'enabled')::boolean, true),
         coalesce((backup ->> 'hour')::int, 2)
    into v_enabled, v_hour
    from public.app_settings where id = 1;

  if not coalesce(v_enabled, true) then return; end if;

  -- Solo a la hora configurada, en hora de Madrid.
  if extract(hour from (now() at time zone 'Europe/Madrid'))::int <> coalesce(v_hour, 2) then
    return;
  end if;

  -- La dirección del proyecto y el secreto salen de la bóveda de Supabase.
  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'm360_project_url';
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'm360_backup_secret';
  exception when others then
    raise notice 'No se puede leer la bóveda: %', sqlerrm;
    return;
  end;

  if v_url is null or v_secret is null then
    raise notice 'Faltan los secretos m360_project_url o m360_backup_secret en la bóveda.';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/backup-drive',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-backup-secret', v_secret),
    body := '{}'::jsonb);
end $$;

revoke execute on function public.run_daily_backup() from anon, authenticated, public;

-- ---------------------------------------------------------------------
-- 3) Programación
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'Sin pg_cron: ejecuta este archivo en Supabase para programar la copia.';
    return;
  end if;

  perform cron.unschedule('m360-backup-diario')
    where exists (select 1 from cron.job where jobname = 'm360-backup-diario');

  perform cron.schedule('m360-backup-diario', '0 0,1 * * *',
                        'select public.run_daily_backup()');

  raise notice 'Copia automática programada: todos los días a las 02:00 (hora de Madrid).';
exception when others then
  raise notice 'No se ha podido programar la copia automática: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 4) Comprobar que quedó programada
-- ---------------------------------------------------------------------
-- select jobname, schedule, active from cron.job where jobname = 'm360-backup-diario';
-- select * from cron.job_run_details order by start_time desc limit 10;
