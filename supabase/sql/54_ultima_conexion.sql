-- =====================================================================
-- METALPLAFER360 · LA ÚLTIMA CONEXIÓN DE CADA PERSONA
--
-- N1 · En Trabajadores queremos ver cuándo entró por última vez cada
-- persona, administración incluida.
--
--
-- DE DÓNDE SALE EL DATO, Y POR QUÉ DE AHÍ
--
-- No hace falta inventarse nada ni apuntar nada: Supabase Auth YA guarda
-- la fecha del último inicio de sesión de cada cuenta, en
-- «auth.users.last_sign_in_at», y la actualiza él solo cada vez que
-- alguien entra. Es el dato de verdad, no una aproximación.
--
-- Eso trae dos ventajas que no tendría apuntarlo nosotros:
--
--   · EL HISTORIAL YA ESTÁ. Las conexiones anteriores a esta mejora
--     también se ven, porque llevan ahí desde siempre. Si lo
--     empezáramos a apuntar nosotros hoy, todo el mundo saldría «sin
--     conexión» hasta que volviera a entrar.
--   · NO HAY NADA QUE ESCRIBIR. Ni una columna nueva en «profiles», ni
--     una función que alguien tenga que acordarse de llamar al entrar,
--     ni un registro de sesiones. Si el apunte fallara o se olvidara en
--     algún camino de entrada, la fecha mentiría sin que nadie lo notara.
--
-- «profiles.id» es la misma clave que «auth.users.id» —está así desde el
-- archivo 01, con «references auth.users(id)»—, así que cada persona
-- tiene exactamente una cuenta y no hay que adivinar nada.
--
--
-- POR QUÉ UNA VISTA Y NO UNA FUNCIÓN NI LA CLAVE DE SERVIDOR
--
-- El esquema «auth» no se publica por la API, y el navegador no puede
-- —ni debe— leerlo. Una vista SIN «security_invoker» se ejecuta con los
-- permisos de QUIEN LA CREA (postgres), así que puede leer «auth.users»
-- aunque quien pregunta no pueda. Es el mismo recurso que ya usa
-- «profiles_full».
--
-- Así NO hace falta:
--   · la clave de servidor en el navegador (nunca, por supuesto);
--   · ni tocar las funciones publicadas de Supabase, que se quedan como
--     están y no hay que volver a desplegarlas.
--
-- De «auth.users» se saca UNA columna y nada más. Ni correos, ni
-- contraseñas cifradas, ni tokens: solo la fecha.
--
--
-- QUÉ ES Y QUÉ NO ES «ÚLTIMA CONEXIÓN»
--
-- Es la última vez que la persona INICIÓ SESIÓN. No es la última vez que
-- tocó algo en la aplicación, ni la fecha de alta de su cuenta.
--
-- Consecuencia que conviene saber: quien deja la sesión abierta en el
-- móvil puede estar usando la aplicación a diario y seguir mostrando el
-- día que escribió su contraseña por última vez. Si lo que queréis es
-- «quién está usando esto», hace falta otra cosa (última actividad), y
-- eso sí sería apuntar algo nosotros. Dicho queda; no lo doy por
-- supuesto.
--
-- MIGRACIÓN ESTRUCTURAL: una vista nueva. No crea columnas, no toca
-- ninguna tabla y no modifica ni un dato.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) COMPROBACIÓN PREVIA
--
-- «auth.users.last_sign_in_at» es columna del propio Supabase Auth, no
-- de este proyecto: no está en ninguna migración de aquí y no he podido
-- comprobarla contra vuestra base de datos. Si no estuviera, esto se
-- para aquí con un mensaje que se entiende, en lugar de crear una vista
-- rota que fallaría más tarde y en otro sitio.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'users'
       and column_name = 'last_sign_in_at'
  ) then
    raise exception
      'Esta migración necesita «auth.users.last_sign_in_at», que es la columna que '
      'mantiene Supabase Auth. En esta base de datos no está: no sigas y dímelo, '
      'porque entonces la última conexión hay que sacarla de otro sitio.'
      using errcode = '42703';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1) LA VISTA
--
-- Una fila por persona, con su última conexión. Devuelve NULL cuando esa
-- cuenta todavía no ha entrado nunca: NULL es «no ha entrado», y es
-- distinto de cualquier fecha. No se rellena con la fecha de alta ni con
-- nada parecido.
--
-- Quién ve qué:
--   · administración, todas las filas;
--   · cualquier otra persona, solo la suya.
--
-- Es la misma regla que «profiles_full», escrita igual.
-- ---------------------------------------------------------------------
create or replace view public.user_last_sign_in with (security_barrier = true) as
  select p.id             as user_id,
         u.last_sign_in_at,
         u.created_at     as account_created_at
    from public.profiles p
    join auth.users u on u.id = p.id
   where public.is_admin() or p.id = auth.uid();

comment on view public.user_last_sign_in is
  'Última vez que cada persona INICIÓ SESIÓN, según Supabase Auth. Vacío = no ha entrado nunca. Administración ve a todos; cada cual, lo suyo.';

comment on column public.user_last_sign_in.account_created_at is
  'Cuándo se creó la cuenta de acceso. Va aparte a propósito: NO es una última conexión y la pantalla no la enseña como tal.';

grant  select on public.user_last_sign_in to authenticated, service_role;
revoke all    on public.user_last_sign_in from anon;
