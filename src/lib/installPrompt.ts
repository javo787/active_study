/**
 * The browser's "install this app" offer (the beforeinstallprompt event). It arrives once, whenever the browser decides,
 * so it is caught as soon as the app starts and kept here until a button asks for it; a button that appears later (on
 * another page, after sign-in) still finds it.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * Runs in the page head, before the app's scripts: if the browser makes its offer before the app has started, the offer
 * is kept on the window and picked up by watchInstallPrompt.
 */
export const EARLY_CAPTURE_SCRIPT =
  "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__eduInstallOffer=e;});";

type WindowWithEarlyOffer = Window & { __eduInstallOffer?: BeforeInstallPromptEvent };

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let watching: { win: Window; stop: () => void } | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

/** Starts listening (once per window; calling it again does nothing). */
export function watchInstallPrompt(win: Window): void {
  if (watching?.win === win) return;
  watching?.stop();
  const onOffer = (event: Event) => {
    // Keep the browser from showing its own bar; the app offers the button where it fits.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  };
  const onInstalled = () => {
    deferred = null;
    installed = true;
    emit();
  };
  win.addEventListener('beforeinstallprompt', onOffer);
  win.addEventListener('appinstalled', onInstalled);
  const early = (win as WindowWithEarlyOffer).__eduInstallOffer;
  if (early) {
    deferred = early;
    delete (win as WindowWithEarlyOffer).__eduInstallOffer;
    emit();
  }
  watching = {
    win,
    stop: () => {
      win.removeEventListener('beforeinstallprompt', onOffer);
      win.removeEventListener('appinstalled', onInstalled);
    },
  };
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getInstallPrompt = () => deferred;
export const getInstalled = () => installed;

/** Opens the browser's install dialog. The offer can be used once; the browser may make a new one later. */
export async function showInstallPrompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const offer = deferred;
  if (!offer) return 'unavailable';
  deferred = null;
  emit();
  try {
    await offer.prompt();
    return (await offer.userChoice).outcome;
  } catch {
    return 'dismissed';
  }
}

/** For tests: forget everything, also the listeners on the window. */
export function resetInstallPrompt(): void {
  deferred = null;
  installed = false;
  watching?.stop();
  watching = null;
  listeners.clear();
}
