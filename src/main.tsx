import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/worker.css';

import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);

/*
 * Aplicación instalable (PWA).
 *
 * La aplicación NECESITA conexión a Internet: el service worker solo
 * guarda los archivos del programa, nunca los datos de la empresa.
 *
 * Cuando se publica una versión nueva se aplica sola en cuanto se puede,
 * para que nadie se quede trabajando con una pantalla antigua.
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);

      registration.addEventListener('updatefound', () => {
        const nueva = registration.installing;
        nueva?.addEventListener('statechange', () => {
          if (nueva.state === 'installed' && navigator.serviceWorker.controller) {
            nueva.postMessage('actualizar');
          }
        });
      });

      let recargando = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (recargando) return;
        recargando = true;
        window.location.reload();
      });

      // Se comprueba si hay versión nueva al volver a la aplicación.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => undefined);
      });
    } catch { /* sin service worker la aplicación funciona igual */ }
  });
}
