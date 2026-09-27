/*
 * METALPLAFER360 · Service worker.
 *
 * Su misión es que la aplicación se pueda instalar y que arranque rápido.
 *
 * LA APLICACIÓN NECESITA INTERNET: aquí NO se guarda ningún dato de la
 * empresa. Solo se guardan los archivos del programa (JavaScript, estilos,
 * tipografías e iconos). Es a propósito: en una obra es peor trabajar con
 * datos viejos que no poder entrar.
 */
const VERSION = 'v2';
const CACHE = `m360-app-${VERSION}`;

// Archivos mínimos para que la aplicación abra y enseñe su pantalla.
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// La aplicación puede pedir que se active una versión nueva sin esperar.
self.addEventListener('message', (event) => {
  if (event.data === 'actualizar') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca se guardan en caché las peticiones a Supabase (datos y sesión).
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  // La página: primero la red, para que los cambios lleguen enseguida.
  // Si no hay cobertura, se sirve la última guardada y la propia
  // aplicación avisa de que está sin conexión.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached
          || new Response('<h1>METALPLAFER360</h1><p>Sin conexión a Internet.</p>',
            { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 503 }))),
    );
    return;
  }

  // Archivos del programa: se sirven al momento y se actualizan por detrás.
  const isAsset = /\.(js|css|woff2?|png|svg|webmanifest|ico)$/.test(url.pathname);
  if (!isAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
