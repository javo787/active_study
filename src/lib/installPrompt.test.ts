// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EARLY_CAPTURE_SCRIPT, getInstallPrompt, getInstalled, resetInstallPrompt, showInstallPrompt, subscribeInstallPrompt, watchInstallPrompt } from './installPrompt';

function offer(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return event;
}

describe('install prompt store', () => {
  beforeEach(() => resetInstallPrompt());
  afterEach(() => resetInstallPrompt());

  it('catches the browser offer, keeps the browser from showing its own bar, and tells subscribers', () => {
    const listener = vi.fn();
    subscribeInstallPrompt(listener);
    watchInstallPrompt(window);
    const event = offer();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(getInstallPrompt()).toBe(event);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('listens once however many times it is started', () => {
    const listener = vi.fn();
    subscribeInstallPrompt(listener);
    watchInstallPrompt(window);
    watchInstallPrompt(window);
    window.dispatchEvent(offer());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('opens the dialog once and reports the choice', async () => {
    watchInstallPrompt(window);
    const event = offer('dismissed');
    window.dispatchEvent(event);
    expect(await showInstallPrompt()).toBe('dismissed');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(getInstallPrompt()).toBeNull();
    expect(await showInstallPrompt()).toBe('unavailable');
  });

  it('a refused dialog counts as dismissed, not as an error', async () => {
    watchInstallPrompt(window);
    const event = offer();
    (event.prompt as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not allowed'));
    window.dispatchEvent(event);
    expect(await showInstallPrompt()).toBe('dismissed');
  });

  it('after installation the offer is gone and the app counts as installed', () => {
    watchInstallPrompt(window);
    window.dispatchEvent(offer());
    window.dispatchEvent(new Event('appinstalled'));
    expect(getInstallPrompt()).toBeNull();
    expect(getInstalled()).toBe(true);
  });

  it('a subscriber can stop listening', () => {
    const listener = vi.fn();
    const stop = subscribeInstallPrompt(listener);
    stop();
    watchInstallPrompt(window);
    window.dispatchEvent(offer());
    expect(listener).not.toHaveBeenCalled();
  });

  it('finds an offer that came before the app started (kept by the script in the page head)', () => {
    new Function(EARLY_CAPTURE_SCRIPT).call(window);
    const event = offer();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const listener = vi.fn();
    subscribeInstallPrompt(listener);
    watchInstallPrompt(window);
    expect(getInstallPrompt()).toBe(event);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((window as unknown as { __eduInstallOffer?: unknown }).__eduInstallOffer).toBeUndefined();
  });
});
