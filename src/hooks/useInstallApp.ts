import { useEffect, useState, useSyncExternalStore } from 'react';
import { InstallMode, installMode, isInAppBrowser, isIos } from '@/lib/pwa';
import { getInstallPrompt, getInstalled, showInstallPrompt, subscribeInstallPrompt, watchInstallPrompt } from '@/lib/installPrompt';

/** What the "Install app" button should do here (see installMode in lib/pwa.ts), and how to start the installation. */
export function useInstallApp(): { mode: InstallMode; install: typeof showInstallPrompt } {
  const offer = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt, () => null);
  const installedNow = useSyncExternalStore(subscribeInstallPrompt, getInstalled, () => false);
  const [env, setEnv] = useState({ standalone: false, ios: false, inApp: false });

  useEffect(() => {
    watchInstallPrompt(window);
    const ua = navigator.userAgent || '';
    setEnv({
      standalone:
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
      ios: isIos(ua, navigator.platform, navigator.maxTouchPoints),
      inApp: isInAppBrowser(ua),
    });
  }, []);

  return {
    mode: installMode({ ...env, standalone: env.standalone || installedNow, hasPrompt: offer !== null }),
    install: showInstallPrompt,
  };
}
