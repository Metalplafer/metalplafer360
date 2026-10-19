-- =====================================================================
-- METALPLAFER360 · RETIRAR LAS FUNCIONES DE DATOS DE EJEMPLO
--
--
-- QUÉ RETIRA, Y QUÉ NO
--
-- RETIRA tres funciones del servidor:
--
--   · «seed_demo»    · sembraba un taller inventado;
--   · «clear_demo»   · borraba lo sembrado;
--   · «demo_status»  · contaba cuánto había.
--
-- NO RETIRA, Y NO TOCA:
--
--   · las columnas «is_demo» de las tablas. Ninguna. Siguen con su
--     valor. Son el único sitio donde queda constancia de qué se creó
--     como ejemplo, y eso no se recupera después;
--   · ningún registro. Ni los marcados como ejemplo ni los demás. Este
--     archivo NO BORRA DATOS.
--
--
-- POR QUÉ SE RETIRAN
--
-- La aplicación ya está en uso con datos reales. «seed_demo» siembra un
-- taller inventado en la base de datos de verdad, y «clear_demo» BORRA
-- REGISTROS. Con el botón ya retirado de la pantalla, dejar las funciones
-- en el servidor es dejar dos cosas peligrosas a mano de quien entre en
-- Supabase.
--
--
-- ANTES DE EJECUTARLO · comprueba si queda algo de ejemplo
--
-- Esto no cambia nada y conviene mirarlo primero:
--
--   select * from public.demo_status();
--
-- Si dice que SÍ hay datos de ejemplo, decide antes qué hacer con ellos:
-- después de ejecutar este archivo ya no tendrás «clear_demo» para
-- quitarlos de golpe. Y si decides usarla, mira primero lo que se
-- llevaría, porque BORRA REGISTROS.
--
--
-- ESTO NO SE DESHACE CON UNA FUNCIÓN · y no te voy a decir que sí
--
-- Las otras migraciones de datos (47, 48 y 49) traen su «deshacer»
-- porque apuntan en un diario qué han tocado. Aquí no hay nada que
-- apuntar: se borran tres funciones.
--
-- Para volver a tenerlas habría que volver a ejecutar los archivos que
-- las definen, que son el 23 y el 25 del repositorio. Y OJO con eso: el
-- 23 es «23_datos_demo.sql», que además de definir las funciones puede
-- sembrar datos. Si algún día hiciera falta recuperarlas, extrae solo
-- los bloques «create or replace function» y no ejecutes el archivo
-- entero sobre datos reales.
--
--
-- EJECUTAR ESTE ARCHIVO SÍ CAMBIA ALGO (borra tres funciones), al
-- contrario que los archivos 47, 48 y 49. Por eso va aparte y por eso
-- está pendiente de tu aprobación.
--
--
-- POR QUÉ ESTE ARCHIVO NO ESTÁ EN «supabase/sql» CON LOS DEMÁS
--
-- Porque la batería de pruebas instala automáticamente TODO lo que haya
-- en esa carpeta con nombre numerado. Si este archivo estuviera ahí, cada
-- vez que se ejecutan las pruebas se borrarían «seed_demo», «clear_demo»
-- y «demo_status», y las pruebas que las comprueban dejarían de poder
-- hacerlo.
--
-- Los archivos 47, 48 y 49 sí están ahí porque ejecutarlos NO cambia
-- nada: solo definen funciones. Este borra, así que vive aparte, en
-- «supabase/sql/pendientes/», donde nada lo ejecuta por su cuenta.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LA FOTO DE ANTES · para que quede constancia
--
-- Se deja escrito en el histórico qué había en el momento de retirarlas.
-- Si algún día alguien pregunta «¿había datos de ejemplo cuando se quitó
-- esto?», la respuesta está aquí y no en la memoria de nadie.
-- ---------------------------------------------------------------------
do $$
declare v_resumen text;
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'demo_status') then
    begin
      select public.demo_status()::text into v_resumen;
    exception when others then
      v_resumen := 'no se pudo leer: ' || sqlerrm;
    end;
  else
    v_resumen := 'la función ya no existía';
  end if;

  insert into public.audit_log
    (occurred_at, actor_id, actor_name, action, entity_type, entity_id,
     entity_code, summary, details)
  values (now(), null, 'Migración 50', 'update', 'app_settings', null, null,
          'Se retiraron las funciones de datos de ejemplo (seed_demo, clear_demo, '
          || 'demo_status). Las columnas is_demo NO se tocaron.',
          jsonb_build_object('estado_al_retirar', v_resumen));
end $$;


-- ---------------------------------------------------------------------
-- 2) RETIRAR LAS FUNCIONES
--
-- Con la firma exacta, para no borrar por error otra cosa que se llame
-- parecido. Si alguna ya no existe, «if exists» lo deja pasar.
-- ---------------------------------------------------------------------
drop function if exists public.seed_demo();
drop function if exists public.clear_demo();
drop function if exists public.demo_status();


-- ---------------------------------------------------------------------
-- 3) COMPROBAR
--
-- Las tres primeras filas tienen que decir «retirada». Las dos últimas
-- son las que de verdad importan: que NO se ha tocado nada.
-- ---------------------------------------------------------------------
select 'seed_demo' as funcion,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'seed_demo')
            then 'TODAVÍA EXISTE' else 'retirada' end as estado
union all
select 'clear_demo',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'clear_demo')
            then 'TODAVÍA EXISTE' else 'retirada' end
union all
select 'demo_status',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'demo_status')
            then 'TODAVÍA EXISTE' else 'retirada' end
union all
select 'columnas is_demo que siguen en su sitio',
       count(*)::text
  from information_schema.columns
 where table_schema = 'public' and column_name = 'is_demo'
union all
select 'registros marcados como ejemplo que quedan (no se han tocado)',
       (select count(*) from public.clients  where is_demo)::text || ' clientes, '
    || (select count(*) from public.projects where is_demo)::text || ' proyectos, '
    || (select count(*) from public.fichas   where is_demo)::text || ' fichas';


-- ---------------------------------------------------------------------
-- SI ALGÚN DÍA QUEDA UN DATO DE EJEMPLO SUELTO
--
-- Ya no hay «clear_demo», así que se quita a mano y de uno en uno, que
-- es más lento y mucho más difícil de hacer mal. Por ejemplo, para ver
-- qué hay antes de tocar nada:
--
--   select code, name, is_demo from public.projects where is_demo;
--   select code, title, is_demo from public.fichas   where is_demo;
--
-- Y para quitar uno concreto, desde la propia aplicación, que es donde
-- las comprobaciones de integridad están puestas: la papelera de
-- proyectos, el borrado de fichas y el de partes. Desde Supabase a pelo
-- se pueden romper relaciones que la aplicación respeta.
-- ---------------------------------------------------------------------
