'use client';

import { useEffect } from 'react';
import { BASE_PATH } from '@/lib/appUrl';
import { watchInstallPrompt } from '@/lib/installPrompt';
import { registerServiceWorker } from '@/lib/pwa';

/**
 * Starts what makes the app installable: catches the browser's install offer and registers the service worker.
 * Renders nothing. The service worker is left out of development, where it would only get in the way of reloads.
 */
export default function PwaRegister() {
  useEffect(() => {
    watchInstallPrompt(window);
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;

    const register = () => {
      void registerServiceWorker(navigator.serviceWorker, BASE_PATH);
    };
    if (document.readyState === 'complete') {
      register();
      return;
    }
    // After the page has loaded, so that it does not compete with the page itself.
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
