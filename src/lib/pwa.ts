/**
 * Duxtur Edu as an installable app (PWA): what the manifest says, whether to offer "install", how the service worker is
 * registered. No browser objects are used directly here so that it can be tested; the callers pass what they have.
 *
 * Under duxtur.org the app lives at /edu (NEXT_PUBLIC_BASE_PATH=/edu); the standalone build lives at the root.
 * The scope has NO trailing slash on purpose: the portal redirects /edu/ to /edu, so a scope of "/edu/" would not
 * contain the page the installed app opens. A scope without the slash contains /edu and everything below it.
 */

export type ManifestIcon = { src: string; sizes: string; type: string; purpose: 'any' | 'maskable' };

export interface WebManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  background_color: string;
  theme_color: string;
  categories: string[];
  icons: ManifestIcon[];
}

/** Bump when an icon file changes: the portal serves PNGs as immutable for a year, so the address has to change. */
const ICON_VERSION = '1';

/** "/edu" for the build mounted under duxtur.org, "/" for the standalone one. */
export function appScope(base: string): string {
  return base || '/';
}

export function buildManifest(base: string): WebManifest {
  const scope = appScope(base);
  const icon = (file: string, size: number, purpose: ManifestIcon['purpose']): ManifestIcon => ({
    src: `${base}/icons/${file}?v=${ICON_VERSION}`,
    sizes: `${size}x${size}`,
    type: 'image/png',
    purpose,
  });
  return {
    id: scope,
    name: 'Duxtur Edu',
    short_name: 'Duxtur Edu',
    description: 'Online exams and practice tests for medical students and teachers.',
    start_url: scope,
    scope,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f172a',
    categories: ['education', 'medical'],
    icons: [icon('icon-192.png', 192, 'any'), icon('icon-512.png', 512, 'any'), icon('icon-maskable-512.png', 512, 'maskable')],
  };
}

/** Address of the manifest file (written by app/manifest.webmanifest/route.ts), with the base path. */
export function manifestPath(base: string): string {
  return `${base}/manifest.webmanifest`;
}

/** Address of the apple-touch-icon (iOS reads it from the page, not from the manifest). */
export function appleIconPath(base: string): string {
  return `${base}/icons/apple-touch-icon.png?v=${ICON_VERSION}`;
}

export type InstallMode = 'hidden' | 'prompt' | 'ios';

/**
 * What to show next to "install":
 *  - nothing when the app is already open as an installed app, or in a browser inside another app (Telegram,
 *    Instagram, ...) which cannot install anything;
 *  - a button that opens the browser's own install dialog, when the browser offered one (Chrome, Edge, Samsung);
 *  - steps for "Add to Home Screen" on iPhone and iPad, where there is no such dialog;
 *  - nothing elsewhere (for example Firefox on a computer), rather than a button that does nothing.
 */
export function installMode(state: { standalone: boolean; hasPrompt: boolean; ios: boolean; inApp: boolean }): InstallMode {
  if (state.standalone || state.inApp) return 'hidden';
  if (state.hasPrompt) return 'prompt';
  if (state.ios) return 'ios';
  return 'hidden';
}

/** iPhone, iPad (also an iPad that says it is a Mac), iPod. */
export function isIos(ua: string, platform = '', maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

/** A browser built into another app, where "install" does not exist. */
export function isInAppBrowser(ua: string): boolean {
  const iosInApp = /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(ua);
  const androidInApp = /wv\)/i.test(ua);
  const otherInApp = /FBAN|FBAV|Instagram|Snapchat|MicroMessenger|Line\/|Telegram/i.test(ua);
  return iosInApp || androidInApp || otherInApp;
}

/**
 * Registers the service worker. The wider scope (the page /edu itself, not only /edu/...) needs the header
 * `Service-Worker-Allowed: /edu` on the script, which the portal adds; without it the browser refuses, and the
 * narrower scope is used so that the pages below /edu still work offline-aware. Never throws.
 */
export async function registerServiceWorker(
  container: Pick<ServiceWorkerContainer, 'register'> | undefined,
  base: string,
): Promise<ServiceWorkerRegistration | null> {
  if (!container) return null;
  const scopes = base ? [base, `${base}/`] : ['/'];
  let failure: unknown;
  for (const scope of scopes) {
    try {
      return await container.register(`${base}/sw.js`, { scope });
    } catch (error) {
      failure = error;
    }
  }
  console.warn('Service worker was not registered:', failure);
  return null;
}
