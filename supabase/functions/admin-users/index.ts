/**
 * METALPLAFER360 · Alta de trabajadores y cambio de contraseña.
 *
 * Esto NO se puede hacer desde el navegador: hace falta la clave
 * «service_role» de Supabase, que jamás sale del servidor ni se sube a
 * GitHub. Aquí vive dentro de Supabase, como variable de entorno.
 *
 * Antes de tocar nada se comprueba, contra la base de datos, que quien lo
 * pide es un administrador activo. No se mira el token: se mira el perfil.
 *
 * Publicar:  supabase functions deploy admin-users
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });

const fail = (message: string, status = 400) => json({ ok: false, message }, status);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return fail('Método no permitido', 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const loginDomain = Deno.env.get('LOGIN_DOMAIN') ?? 'metalplafer.com';

  if (!url || !serviceKey || !anonKey) {
    return fail('Faltan las variables de entorno de Supabase en la función.', 500);
  }

  // ---------- ¿Quién lo pide? ----------
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return fail('Hace falta iniciar sesión.', 401);

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: me } = await asUser.auth.getUser();
  if (!me?.user) return fail('Hace falta iniciar sesión.', 401);

  const { data: profile } = await asUser
    .from('profiles').select('role, active, full_name').eq('id', me.user.id).maybeSingle();

  if (!profile || profile.role !== 'admin' || !profile.active) {
    return fail('No tienes permisos para realizar esta acción.', 403);
  }

  // ---------- Qué quiere hacer ----------
  let body: Record<string, string>;
  try { body = await request.json(); } catch { return fail('Petición no válida.'); }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  if (body.action === 'create') {
    const username = (body.username ?? '').trim().toLowerCase();
    const fullName = (body.full_name ?? '').trim();
    const password = body.password ?? '';

    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      return fail('El usuario solo puede tener letras, números, puntos o guiones (mínimo 3).');
    }
    if (!fullName) return fail('Escribe el nombre de la persona.');
    if (password.length < 8) return fail('La contraseña debe tener al menos 8 caracteres.');

    const { data: existing } = await admin
      .from('profiles').select('id').eq('username', username).maybeSingle();
    if (existing) return fail(`Ya existe un usuario llamado «${username}».`);

    const { data: created, error } = await admin.auth.admin.createUser({
      email: `${username}@${loginDomain}`,
      password,
      email_confirm: true,
      user_metadata: { username, full_name: fullName, phone: body.phone ?? null },
    });

    if (error || !created?.user) {
      return fail(`No se ha podido crear el usuario: ${error?.message ?? 'error desconocido'}`);
    }

    // El perfil lo crea el disparador de la base de datos. Aquí solo se
    // completa el teléfono, y el rol se deja como trabajador: los permisos
    // de administración se dan después, a mano, desde la aplicación.
    if (body.phone) {
      await admin.from('profiles').update({ phone: body.phone }).eq('id', created.user.id);
    }

    await admin.rpc('log_event', {
      p_action: 'alta_usuario',
      p_entity_type: 'profiles',
      p_summary: `${profile.full_name} dio de alta al trabajador ${fullName} (${username})`,
      p_details: { username },
      p_actor: me.user.id,
    });

    return json({ ok: true, id: created.user.id, username });
  }

  if (body.action === 'password') {
    const id = body.id ?? '';
    const password = body.password ?? '';
    if (!id) return fail('Falta indicar de quién es la contraseña.');
    if (password.length < 8) return fail('La contraseña debe tener al menos 8 caracteres.');

    const { data: target } = await admin
      .from('profiles').select('full_name').eq('id', id).maybeSingle();
    if (!target) return fail('No se encuentra esa persona.');

    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return fail(`No se ha podido cambiar la contraseña: ${error.message}`);

    await admin.rpc('log_event', {
      p_action: 'cambio_contrasena',
      p_entity_type: 'profiles',
      p_summary: `${profile.full_name} cambió la contraseña de ${target.full_name}`,
      p_details: {},
      p_actor: me.user.id,
    });

    return json({ ok: true });
  }

  return fail('Acción desconocida.');
});
