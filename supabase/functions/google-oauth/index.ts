/**
 * METALPLAFER360 · Conectar Google Drive (OAuth 2.0)
 *
 * POR QUÉ ESTA FUNCIÓN
 * Una cuenta de servicio de Google no tiene almacenamiento propio, así
 * que no puede guardar archivos en «Mi unidad» de una cuenta Gmail
 * personal. La empresa autoriza su propia cuenta una vez, y a partir de
 * ahí las copias se suben con ese permiso, también las de las 02:00.
 *
 * DÓNDE ESTÁN LAS CREDENCIALES
 * El identificador y el secreto del cliente de Google son secretos de
 * Supabase (Deno.env). El permiso duradero que devuelve Google se guarda
 * en la bóveda. NADA de esto pasa jamás por el navegador: el código de
 * Google se canjea aquí, en el servidor.
 *
 * Publicar:
 *   supabase functions deploy google-oauth --no-verify-jwt
 *
 * Va sin comprobación de sesión A PROPÓSITO, porque la vuelta de Google
 * llega sin ninguna: quien la hace es el navegador de la persona después
 * de aceptar en Google. La autorización la comprueba este código:
 *   · «start» exige una sesión de administración activa;
 *   · «callback» exige un «state» de un solo uso que creó ese «start».
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

/**
 * Solo se pide «drive.file»: deja crear y manejar los archivos de la
 * propia aplicación, y NADA más del Drive de la empresa. Es el permiso
 * más pequeño que sirve, y al no ser sensible permite publicar la
 * aplicación sin que Google tenga que auditarla, que es lo que hace que
 * el permiso no caduque a los 7 días.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
].join(' ');

const CARPETA_POR_DEFECTO = 'METALPLAFER360 · Copias de seguridad';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });

const fail = (message: string, status = 400) => json({ ok: false, message }, status);

/** Una página sencilla para la vuelta de Google, en castellano. */
function pagina(titulo: string, mensaje: string, ok: boolean) {
  return new Response(
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
         background:#EEF1F4; color:#14243A; padding:24px; }
  .caja { background:#fff; border:1px solid #D7DEE6; border-radius:12px;
          padding:32px 28px; max-width:420px; text-align:center;
          box-shadow:0 1px 3px rgba(20,36,58,.08); }
  .marca { font-weight:700; letter-spacing:.02em; font-size:14px; color:#5B6778; margin-bottom:18px; }
  .marca b { color:#14243A; } .marca span { color:#F2B705; }
  .icono { width:48px; height:48px; border-radius:50%; margin:0 auto 16px;
           display:grid; place-items:center; font-size:24px; color:#fff;
           background:${ok ? '#2E7D5B' : '#B4442F'}; }
  h1 { font-size:18px; margin:0 0 8px; }
  p { margin:0; color:#5B6778; font-size:14px; line-height:1.55; }
</style></head><body>
  <div class="caja">
    <div class="marca"><b>Metalplafer</b><span>360</span></div>
    <div class="icono">${ok ? '✓' : '!'}</div>
    <h1>${titulo}</h1>
    <p>${mensaje}</p>
  </div>
</body></html>`,
    { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(request.url);
  const esCallback = url.pathname.endsWith('/callback');

  const projectUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');

  if (!projectUrl || !serviceKey || !anonKey) {
    return esCallback
      ? pagina('No se ha podido conectar', 'Faltan las variables de entorno de Supabase.', false)
      : fail('Faltan las variables de entorno de Supabase en la función.', 500);
  }
  if (!clientId || !clientSecret) {
    const texto = 'Falta configurar la conexión con Google. Añade GOOGLE_OAUTH_CLIENT_ID y '
      + 'GOOGLE_OAUTH_CLIENT_SECRET a los secretos de Supabase (está explicado en la guía).';
    return esCallback ? pagina('No se ha podido conectar', texto, false) : fail(texto, 400);
  }

  const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false } });
  const redirectUri = `${projectUrl}/functions/v1/google-oauth/callback`;

  // ================================================================
  // LA VUELTA DE GOOGLE
  // ================================================================
  if (esCallback) {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errorGoogle = url.searchParams.get('error');

    if (errorGoogle) {
      return pagina('Autorización cancelada',
        'No se ha concedido el permiso, así que Google Drive sigue sin conectar. '
        + 'Puedes volver a intentarlo desde Configuración → Copias de seguridad.', false);
    }
    if (!code || !state) {
      return pagina('Enlace incompleto', 'Vuelve a empezar desde la aplicación.', false);
    }

    // El «state» tiene que existir y se gasta: así nadie puede reutilizar
    // esta dirección ni colar una autorización que no empezó aquí.
    const { data: fila } = await admin
      .from('google_oauth_state').select('state, created_by').eq('state', state).maybeSingle();

    if (!fila) {
      return pagina('Esta autorización ya no vale',
        'Ha caducado o ya se había usado. Vuelve a pulsar «Conectar Google Drive» '
        + 'en Configuración → Copias de seguridad.', false);
    }
    await admin.from('google_oauth_state').delete().eq('state', state);

    try {
      // ---- Se canjea el código AQUÍ, nunca en el navegador ----
      const respuesta = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!respuesta.ok) {
        throw new Error('Google no ha aceptado la autorización. Revisa que la dirección de '
          + 'retorno del cliente OAuth sea exactamente la de la guía.');
      }

      const datos = await respuesta.json() as {
        access_token?: string; refresh_token?: string;
      };

      if (!datos.refresh_token) {
        throw new Error('Google no ha devuelto un permiso duradero. Entra en '
          + 'myaccount.google.com/permissions, quita el acceso de METALPLAFER360 '
          + 'y vuelve a conectar.');
      }
      if (!datos.access_token) throw new Error('Google no ha devuelto ningún acceso.');

      // ---- Con qué cuenta se ha autorizado ----
      let cuenta: string | null = null;
      try {
        const info = await fetch(USERINFO_URL, {
          headers: { Authorization: `Bearer ${datos.access_token}` },
        });
        if (info.ok) cuenta = (await info.json() as { email?: string }).email ?? null;
      } catch { /* el correo es solo informativo */ }

      // ---- La carpeta de destino ----
      // Con el permiso «drive.file» la aplicación solo alcanza lo que ella
      // misma crea, así que crea su carpeta en «Mi unidad». Si ya la creó
      // en una conexión anterior, la reutiliza.
      const { data: ajustes } = await admin
        .from('app_settings').select('backup').eq('id', 1).maybeSingle();
      const nombreCarpeta =
        (ajustes?.backup as { folder?: string } | null)?.folder?.trim() || CARPETA_POR_DEFECTO;

      const carpeta = await asegurarCarpeta(datos.access_token, nombreCarpeta);

      // ---- Se guarda el permiso duradero en la bóveda ----
      const { error: errorToken } = await admin.rpc('drive_put_token', {
        p_refresh: datos.refresh_token,
      });
      if (errorToken) throw new Error('No se ha podido guardar el permiso de forma segura.');

      await admin.rpc('drive_mark_connected', {
        p_email: cuenta,
        p_folder_id: carpeta.id,
        p_folder_name: carpeta.name,
        p_actor: fila.created_by,
      });

      return pagina('Google Drive conectado',
        `Las copias se guardarán en «${carpeta.name}»`
        + `${cuenta ? ` de ${cuenta}` : ''}. Ya puedes cerrar esta ventana y volver a la aplicación.`,
        true);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'Error desconocido';
      await admin.rpc('drive_mark_error', { p_error: mensaje });
      return pagina('No se ha podido conectar', mensaje, false);
    }
  }

  // ================================================================
  // DESDE LA APLICACIÓN  ·  solo administración
  // ================================================================
  if (request.method !== 'POST') return fail('Método no permitido', 405);

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return fail('Hace falta iniciar sesión.', 401);

  const asUser = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: me } = await asUser.auth.getUser();
  if (!me?.user) return fail('Hace falta iniciar sesión.', 401);

  const { data: perfil } = await asUser
    .from('profiles').select('role, active').eq('id', me.user.id).maybeSingle();
  if (!perfil || perfil.role !== 'admin' || !perfil.active) {
    return fail('No tienes permisos para realizar esta acción.', 403);
  }

  let cuerpo: Record<string, string>;
  try { cuerpo = await request.json(); } catch { cuerpo = {}; }

  // ---------------- Empezar la autorización ----------------
  if (cuerpo.action === 'start' || !cuerpo.action) {
    const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');

    // Se limpian las autorizaciones a medias de más de una hora.
    await admin.from('google_oauth_state')
      .delete().lt('created_at', new Date(Date.now() - 3600_000).toISOString());

    const { error } = await admin.from('google_oauth_state')
      .insert({ state, created_by: me.user.id });
    if (error) return fail('No se ha podido preparar la autorización.', 500);

    const destino = new URL(AUTH_URL);
    destino.searchParams.set('client_id', clientId);
    destino.searchParams.set('redirect_uri', redirectUri);
    destino.searchParams.set('response_type', 'code');
    destino.searchParams.set('scope', SCOPES);
    // «offline» + «consent» son los que hacen que Google entregue el
    // permiso duradero, que es lo que permite la copia de las 02:00.
    destino.searchParams.set('access_type', 'offline');
    destino.searchParams.set('prompt', 'consent');
    destino.searchParams.set('include_granted_scopes', 'true');
    destino.searchParams.set('state', state);

    return json({ ok: true, url: destino.toString() });
  }

  // ---------------- Desconectar ----------------
  if (cuerpo.action === 'disconnect') {
    const { error } = await admin.rpc('drive_disconnect', { p_actor: me.user.id });
    if (error) return fail('No se ha podido desconectar Google Drive.', 500);
    return json({ ok: true });
  }

  return fail('Acción desconocida.');
});

/**
 * Busca la carpeta de las copias y, si no existe, la crea en «Mi unidad».
 * Como la crea la propia aplicación, puede escribir dentro de ella para
 * siempre aunque el permiso sea el más restringido.
 */
async function asegurarCarpeta(accessToken: string, nombre: string) {
  const cabeceras = { Authorization: `Bearer ${accessToken}` };

  const consulta = new URL(FILES_URL);
  consulta.searchParams.set(
    'q',
    `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${nombre.replace(/'/g, "\\'")}'`,
  );
  consulta.searchParams.set('fields', 'files(id,name)');
  consulta.searchParams.set('pageSize', '10');

  const encontrada = await fetch(consulta, { headers: cabeceras });
  if (encontrada.ok) {
    const { files } = await encontrada.json() as { files?: { id: string; name: string }[] };
    if (files?.length) return files[0];
  }

  const creada = await fetch(`${FILES_URL}?fields=id,name`, {
    method: 'POST',
    headers: { ...cabeceras, 'content-type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder' }),
  });

  if (!creada.ok) {
    throw new Error('No se ha podido crear la carpeta de las copias en Google Drive.');
  }
  return await creada.json() as { id: string; name: string };
}
