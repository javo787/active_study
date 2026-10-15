// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initTestI18n } from '@/test/i18n';
import InstallApp from './InstallApp';
import { resetInstallPrompt, watchInstallPrompt } from '@/lib/installPrompt';

initTestI18n();

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function environment(ua: string, standalone = false) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query.includes('standalone'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function browserOffer() {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
  return event;
}

describe('InstallApp', () => {
  beforeEach(() => {
    resetInstallPrompt();
    watchInstallPrompt(window);
  });
  afterEach(() => cleanup());

  it('shows nothing where installing is not possible', () => {
    environment(CHROME);
    const { container } = render(<InstallApp />);
    expect(container.innerHTML).toBe('');
  });

  it('shows a button once the browser offers installation, and the button opens the browser dialog', async () => {
    environment(CHROME);
    render(<InstallApp />);
    expect(screen.queryByRole('button')).toBeNull();
    const offer = browserOffer();
    act(() => {
      window.dispatchEvent(offer);
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Install the app' }));
    expect(offer.prompt).toHaveBeenCalledTimes(1);
    // The offer is used up: the button goes away instead of doing nothing the second time.
    expect(screen.queryByRole('button', { name: 'Install the app' })).toBeNull();
  });

  it('a button placed later still finds an offer that came earlier', async () => {
    environment(CHROME);
    act(() => {
      window.dispatchEvent(browserOffer());
    });
    render(<InstallApp />);
    expect(await screen.findByRole('button', { name: 'Install the app' })).toBeTruthy();
  });

  it('on iPhone it shows the steps in a dialog that closes with the button and with Escape', async () => {
    environment(IPHONE);
    render(<InstallApp />);
    await userEvent.click(await screen.findByRole('button', { name: 'Install the app' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Add to Home Screen');
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Install the app' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows nothing inside the installed app', async () => {
    environment(IPHONE, true);
    const { container } = render(<InstallApp />);
    await act(async () => {});
    expect(container.innerHTML).toBe('');
  });

  it('shows nothing after the app has been installed', async () => {
    environment(CHROME);
    render(<InstallApp />);
    act(() => {
      window.dispatchEvent(browserOffer());
    });
    await screen.findByRole('button', { name: 'Install the app' });
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.queryByRole('button')).toBeNull();
  });
});
