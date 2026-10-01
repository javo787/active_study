// Client side of "Sign in with Telegram". The server part lives in duxtur-portal
// (/api/edu-auth/telegram/start and /check) and hands back a Firebase custom token.

const AUTH_BASE = (process.env.NEXT_PUBLIC_EDU_AUTH_BASE_URL || 'https://duxtur.org').replace(/\/$/, '');
const STORAGE_KEY = 'tg_login_session_v1';
const POLL_INTERVAL_MS = 2000;

export interface TelegramLoginSession {
  token: string;
  pollSecret: string;
  botUrl: string;
  expiresAt: number; // epoch ms
}

export class TelegramLoginError extends Error {
  constructor(public code: 'expired' | 'cancelled' | 'failed', message: string) {
    super(message);
  }
}

function saveSession(session: TelegramLoginSession) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private mode etc.: login still works, it just cannot resume after a reload.
  }
}

export function clearTelegramSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** A login started earlier in this tab (e.g. before the browser reloaded while the user was in Telegram). */
export function loadTelegramSession(): TelegramLoginSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as TelegramLoginSession;
    if (!s.token || !s.pollSecret || !s.botUrl || s.expiresAt <= Date.now()) {
      clearTelegramSession();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export async function startTelegramLogin(): Promise<TelegramLoginSession> {
  const res = await fetch(`${AUTH_BASE}/api/edu-auth/telegram/start`, { method: 'POST' });
  if (!res.ok) throw new TelegramLoginError('failed', 'Could not start Telegram sign-in');
  const data = await res.json();
  const session: TelegramLoginSession = {
    token: data.token,
    pollSecret: data.pollSecret,
    botUrl: data.botUrl,
    expiresAt: Date.now() + (data.expiresInSec ?? 300) * 1000,
  };
  saveSession(session);
  return session;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new TelegramLoginError('cancelled', 'Cancelled'));
    });
  });

/** Polls until the user confirms in Telegram. Resolves with a Firebase custom token. */
export async function waitForTelegramLogin(
  session: TelegramLoginSession,
  signal?: AbortSignal
): Promise<string> {
  while (Date.now() < session.expiresAt) {
    if (signal?.aborted) throw new TelegramLoginError('cancelled', 'Cancelled');
    try {
      const res = await fetch(`${AUTH_BASE}/api/edu-auth/telegram/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: session.token, pollSecret: session.pollSecret }),
        signal,
      });
      if (res.status === 404) {
        clearTelegramSession();
        throw new TelegramLoginError('expired', 'The sign-in link expired');
      }
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'approved' && data.customToken) {
          clearTelegramSession();
          return data.customToken as string;
        }
      }
      // 429 / 5xx / pending: keep polling.
    } catch (err) {
      if (err instanceof TelegramLoginError) throw err;
      if (signal?.aborted) throw new TelegramLoginError('cancelled', 'Cancelled');
      // Network hiccup (weak connection): keep trying until the login expires.
    }
    await sleep(POLL_INTERVAL_MS, signal);
  }
  clearTelegramSession();
  throw new TelegramLoginError('expired', 'The sign-in link expired');
}
