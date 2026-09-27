import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Instalación de la aplicación en el móvil o en el escritorio.
 *
 * Android y Chrome avisan con «beforeinstallprompt» y dejan mostrar el
 * diálogo cuando queramos. iPhone no lo permite: allí hay que explicar
 * los dos toques de «Compartir → Añadir a pantalla de inicio».
 */
export function useInstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => { setInstalled(true); setEvent(null); };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if (window.matchMedia?.('(display-mode: standalone)').matches
        || (navigator as { standalone?: boolean }).standalone) {
      setInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const isApple = typeof navigator !== 'undefined'
    && /iPad|iPhone|iPod/.test(navigator.userAgent);

  async function install() {
    if (!event) return false;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setEvent(null);
    return choice.outcome === 'accepted';
  }

  return { canInstall: Boolean(event), installed, isApple, install };
}
