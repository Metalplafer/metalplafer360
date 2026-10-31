-- =====================================================================
-- METALPLAFER360 · LA FASE «PENDIENTE DE VISITA TÉCNICA»
--
-- Hay trabajos que no se pueden preparar todavía porque antes hay que
-- ir a medir, a comprobar o a valorar. Hoy eso se apunta como un
-- SUBESTADO de «En preparación», y el proyecto aparece preparándose
-- cuando en realidad está esperando a que alguien vaya a verlo.
--
-- Esta migración lo convierte en una fase propia, delante de todas las
-- demás, porque es donde está de verdad en el recorrido del trabajo.
--
--
-- ESTE ARCHIVO NO TOCA NI UNA FILA
--
-- Añade un valor al tipo de las fases y pone al día la función que
-- escribe las etiquetas en castellano. Ningún proyecto cambia de fase y
-- ningún subestado se borra. Después de ejecutarlo, METALPLAFER360
-- sigue funcionando exactamente igual que antes: simplemente existe una
-- fase más a la que se puede mover un proyecto a mano.
--
-- La migración de los proyectos que hoy llevan el subestado es OTRO
-- archivo, el 69, y es opcional. Están separados a propósito, y la
-- razón está justo debajo.
--
--
-- POR QUÉ VA SOLO EN SU PROPIO ARCHIVO · ESTO IMPORTA
--
-- Las fases no son una tabla: son un TIPO ENUMERADO de PostgreSQL. Y
-- PostgreSQL no deja usar un valor nuevo de un enumerado dentro de la
-- misma transacción en que se añade:
--
--   ERROR: unsafe use of new value "pendiente_visita_tecnica" of enum type
--
-- El editor SQL de Supabase ejecuta cada script como UNA transacción.
-- Así que un archivo que añadiera la fase y además moviera proyectos a
-- ella fallaría entero, y no por un descuido: es una regla del motor.
--
-- Por eso son dos archivos. Primero este, que se ejecuta y se cierra.
-- Después, si se quiere, el 69.
--
--
-- POR QUÉ DELANTE DE «EN PREPARACIÓN»
--
-- Porque es cuando ocurre. Se visita antes de preparar, no después. Y
-- el orden del enumerado no es decorativo: el informe de proyectos por
-- fase ordena con «array_position(enum_range(...), phase)» (archivo 19),
-- así que colocarla aquí es lo que la hace salir primera en ese informe
-- sin tocarlo.
--
--
-- POR QUÉ SE LLAMA IGUAL QUE EL SUBESTADO
--
-- El subestado se llama «pendiente_visita_tecnica» y «label_es» (archivo
-- 10) ya sabe traducirlo como «Pendiente visita técnica». Usando el
-- mismo nombre, los mensajes de error y las etiquetas del servidor salen
-- bien escritos sin tocar esa función. No hay choque posible: una cosa
-- es un valor del tipo de las fases y la otra un texto en la tabla de
-- subestados; viven en sitios distintos.
--
--
-- LA FASE NUEVA NO LLEVA SUBESTADOS
--
-- Y no hay que hacer nada para conseguirlo: «valid_substatus» (su
-- definición viva está en el archivo 51) termina en «else false», así
-- que cualquier fase que no conozca se queda sin subestados posibles.
-- Se ha comprobado leyendo la función; no se modifica.
--
-- Lo mismo con «change_project_phase» (archivo 10): recibe la fase como
-- el tipo enumerado, y sus únicas reglas hablan de «finalizado», de
-- «montaje» y del salto de fabricación a facturación. Ninguna estorba
-- aquí, así que se puede entrar y salir de la fase nueva sin tocarla.
--
-- MIGRACIÓN ESTRUCTURAL: un valor más en un tipo y una función de
-- etiquetas reemplazada. NI UNA FILA TOCADA.
--
-- SE PUEDE EJECUTAR VARIAS VECES SIN HACER DAÑO.
-- EJECUTAR EL ARCHIVO COMPLETO DE UNA VEZ, Y ÉL SOLO.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) LA FASE NUEVA
--
-- «if not exists» para poder ejecutarlo dos veces. Sin él, el segundo
-- intento dice que el valor ya existe y corta el script.
-- ---------------------------------------------------------------------
alter type public.project_phase
  add value if not exists 'pendiente_visita_tecnica' before 'preparacion';


-- ---------------------------------------------------------------------
-- 2) QUE EL HISTORIAL LA ESCRIBA IGUAL QUE LA PANTALLA
--
-- «label_es» es quien pone en castellano lo que el historial va a
-- contar. La clave «pendiente_visita_tecnica» ya estaba ahí, pero como
-- SUBESTADO y escrita «Pendiente visita técnica», sin el «de».
--
-- Ahora esa misma clave es una FASE, y la pantalla la llama «Pendiente
-- de visita técnica». Si no se tocara, el historial escribiría una cosa
-- y la pantalla otra para lo mismo. Lo encontró una prueba que compara
-- las dos listas, no una revisión a ojo.
--
-- Es la MISMA función del archivo 51 —su definición viva— con esa
-- entrada movida al bloque de las fases y con el «de» puesto. Se
-- comprobó con «diff» que no cambia nada más.
--
-- Esto NO toca ninguna fila: solo cambia cómo se redacta de aquí en
-- adelante. Los apuntes antiguos se quedan como se escribieron.
-- ---------------------------------------------------------------------
create or replace function public.label_es(p text) returns text
language sql immutable as $$
  select coalesce(case p
    -- Fichas · presupuestos
    when 'por_asignar' then 'Por asignar'
    when 'pendiente'   then 'Pendiente'
    when 'avanzado'    then 'Presupuesto avanzado'
    when 'por_revisar' then 'Presupuesto por revisar'
    when 'enviado'     then 'Presupuesto enviado'
    when 'pendiente_senal' then 'Pendiente de paga y señal'
    when 'aceptado'    then 'Presupuesto aceptado'
    when 'cancelado'   then 'Presupuesto cancelado'
    -- Fichas · visitas
    when 'asignada'    then 'Asignada'
    when 'realizada'   then 'Realizada'
    when 'cancelada'   then 'Cancelada'
    -- Fichas · avisos
    when 'asignado'    then 'Asignado'
    when 'en_curso'    then 'En curso'
    when 'realizado'   then 'Realizado'
    when 'cerrado'     then 'Cerrado'
    -- Tipos de ficha
    when 'presupuesto' then 'presupuesto'
    when 'visita'      then 'visita'
    when 'aviso'       then 'aviso'
    -- Fases del proyecto
    when 'pendiente_visita_tecnica' then 'Pendiente de visita técnica'
    when 'preparacion' then 'En preparación'
    when 'fabricacion' then 'Fabricación'
    when 'montaje'     then 'Montaje'
    when 'facturacion' then 'Facturación'
    when 'finalizado'  then 'Finalizado'
    -- Subestados
    when 'pendiente_planos'         then 'Pendiente planos'
    when 'pendiente_material'       then 'Pendiente material'
    when 'por_empezar'              then 'Por empezar'
    when 'en_fabricacion'           then 'En fabricación'
    when 'falta_material'           then 'Falta material'
    when 'por_finalizar'            then 'Por finalizar'
    when 'lacado_zincado'           then 'Lacado-Zincado'
    when 'pendiente_montaje'        then 'Pendiente de montaje'
    when 'en_montaje'               then 'En montaje'
    when 'por_finalizar_montaje'    then 'Por finalizar montaje'
    when 'pendiente_rematar'        then 'Pendiente de rematar'
    -- Estados de facturación
    when 'por_facturar'    then 'Por facturar'
    when 'pendiente_cobro' then 'Pendiente de cobro'
    when 'cobrado_parcial' then 'Cobrado parcialmente'
    when 'cobrado'         then 'Cobrado'
  end, p);
$$;


-- ---------------------------------------------------------------------
-- 3) COMPROBAR QUE QUEDÓ BIEN
--
-- Lo que tiene que salir, en este orden:
--
--   pendiente_visita_tecnica, preparacion, fabricacion, montaje,
--   facturacion, finalizado
-- ---------------------------------------------------------------------
-- select unnest(enum_range(null::public.project_phase))::text as fase;
--
-- Y que no se ha movido ni un proyecto:
-- select phase, count(*) from public.projects
--  where archived_at is null group by phase order by phase;
