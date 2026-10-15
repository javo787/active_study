import { describe, expect, it, vi } from 'vitest';
import { appScope, appleIconPath, buildManifest, manifestPath, installMode, isInAppBrowser, isIos, registerServiceWorker } from './pwa';

describe('buildManifest', () => {
  it('under duxtur.org the app lives at /edu, without a trailing slash', () => {
    const manifest = buildManifest('/edu');
    expect(manifest.id).toBe('/edu');
    expect(manifest.start_url).toBe('/edu');
    expect(manifest.scope).toBe('/edu');
    expect(manifest.icons.every(icon => icon.src.startsWith('/edu/icons/'))).toBe(true);
  });

  it('standalone it lives at the root', () => {
    const manifest = buildManifest('');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.icons.every(icon => icon.src.startsWith('/icons/'))).toBe(true);
  });

  it('has what browsers require to offer installation', () => {
    const manifest = buildManifest('/edu');
    expect(manifest.name).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    const sizes = manifest.icons.filter(icon => icon.purpose === 'any').map(icon => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some(icon => icon.purpose === 'maskable')).toBe(true);
  });

  it('versions the icon addresses (the portal serves PNGs as immutable)', () => {
    for (const icon of buildManifest('/edu').icons) expect(icon.src).toMatch(/\.png\?v=\w+$/);
    expect(appleIconPath('/edu')).toMatch(/^\/edu\/icons\/apple-touch-icon\.png\?v=\w+$/);
  });

  it('names the manifest file with the base path', () => {
    expect(manifestPath('/edu')).toBe('/edu/manifest.webmanifest');
    expect(manifestPath('')).toBe('/manifest.webmanifest');
  });

  it('the start page is inside the scope', () => {
    for (const base of ['', '/edu']) {
      const { start_url, scope } = buildManifest(base);
      expect(start_url === scope || start_url.startsWith(scope.replace(/\/?$/, '/'))).toBe(true);
      expect(appScope(base)).toBe(scope);
    }
  });
});

describe('installMode', () => {
  const base = { standalone: false, hasPrompt: false, ios: false, inApp: false };

  it('offers the browser dialog when the browser has one', () => {
    expect(installMode({ ...base, hasPrompt: true })).toBe('prompt');
  });
  it('shows the steps on iPhone and iPad, where there is no dialog', () => {
    expect(installMode({ ...base, ios: true })).toBe('ios');
  });
  it('shows nothing where installing is not possible', () => {
    expect(installMode(base)).toBe('hidden');
  });
  it('shows nothing inside the installed app', () => {
    expect(installMode({ ...base, standalone: true, hasPrompt: true })).toBe('hidden');
    expect(installMode({ ...base, standalone: true, ios: true })).toBe('hidden');
  });
  it('shows nothing inside the browser of another app', () => {
    expect(installMode({ ...base, inApp: true, ios: true })).toBe('hidden');
    expect(installMode({ ...base, inApp: true, hasPrompt: true })).toBe('hidden');
  });
});

describe('device detection', () => {
  const safariIphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const telegramIphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  const chromeAndroid = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const webviewAndroid = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36';
  const instagramAndroid = `${chromeAndroid} Instagram 330.0.0.0`;
  const desktopChrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  it('recognises iPhone, iPad and an iPad that says it is a Mac', () => {
    expect(isIos(safariIphone)).toBe(true);
    expect(isIos('Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)')).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false);
    expect(isIos(chromeAndroid)).toBe(false);
    expect(isIos(desktopChrome, 'Win32', 0)).toBe(false);
  });

  it('recognises browsers inside other apps, and not real browsers', () => {
    expect(isInAppBrowser(telegramIphone)).toBe(true);
    expect(isInAppBrowser(webviewAndroid)).toBe(true);
    expect(isInAppBrowser(instagramAndroid)).toBe(true);
    expect(isInAppBrowser(safariIphone)).toBe(false);
    expect(isInAppBrowser(chromeAndroid)).toBe(false);
    expect(isInAppBrowser(desktopChrome)).toBe(false);
  });
});

describe('registerServiceWorker', () => {
  it('registers the script under the base path with the wide scope first', async () => {
    const registration = { scope: '/edu' } as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registration);
    expect(await registerServiceWorker({ register }, '/edu')).toBe(registration);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/edu/sw.js', { scope: '/edu' });
  });

  it('falls back to the narrower scope when the wide one is refused (no Service-Worker-Allowed header)', async () => {
    const registration = { scope: '/edu/' } as ServiceWorkerRegistration;
    const register = vi.fn().mockRejectedValueOnce(new DOMException('scope not allowed', 'SecurityError')).mockResolvedValueOnce(registration);
    expect(await registerServiceWorker({ register }, '/edu')).toBe(registration);
    expect(register.mock.calls.map(call => call[1].scope)).toEqual(['/edu', '/edu/']);
  });

  it('standalone registers at the root', async () => {
    const register = vi.fn().mockResolvedValue({});
    await registerServiceWorker({ register }, '');
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('never throws: no support, or every attempt refused', async () => {
    expect(await registerServiceWorker(undefined, '/edu')).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const register = vi.fn().mockRejectedValue(new Error('nope'));
    expect(await registerServiceWorker({ register }, '/edu')).toBeNull();
    expect(register).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
