import { ADMIN, WORKER, buildApp, createDb, launchBrowser, serveApp, signIn, stubSupabase }
  from './fake-supabase.mjs';
const PORT = 4197;
buildApp();
const server = await serveApp(PORT);
const db = createDb();
const admin = { ...ADMIN, preferences: {} };
const worker = { ...WORKER };
const people = [admin, worker];
const b = await launchBrowser();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' });
await stubSupabase(ctx, { db, getUser: () => admin, people });
const p = await ctx.newPage();
await signIn(p, PORT, 'salvi');
// Se ponen los datos de ejemplo desde la propia aplicación
await p.goto(`http://localhost:${PORT}/#/admin/configuracion`, { waitUntil: 'networkidle' });
await p.waitForTimeout(700);
await p.locator('.tabs button:has-text("Aplicación")').click();
await p.waitForTimeout(700);
await p.locator('button:has-text("Poner datos de ejemplo")').click();
await p.waitForTimeout(1500);
const pantallas = [
  ['clientes', '#/admin/clientes'], ['fichas', '#/admin/fichas'],
  ['proyectos', '#/admin/proyectos'], ['ordenes', '#/admin/ordenes'],
  ['material', '#/admin/material'], ['calendario', '#/admin/calendario'],
  ['facturacion', '#/admin/facturacion'], ['trabajadores', '#/admin/trabajadores'],
];
for (const [nombre, ruta] of pantallas) {
  await p.goto(`http://localhost:${PORT}/${ruta}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1100);
  await p.screenshot({ path: `tests/capturas/rev-${nombre}.png`, fullPage: true });
}
const movil = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true });
await stubSupabase(movil, { db, getUser: () => worker, people });
const m = await movil.newPage();
await signIn(m, PORT, 'juan');
await m.waitForTimeout(1200);
await m.screenshot({ path: 'tests/capturas/rev-movil-inicio.png', fullPage: true });
await b.close(); server.close();
console.log('capturas listas');
