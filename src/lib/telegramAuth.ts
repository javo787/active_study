// Client side of "Sign in with Telegram". The server part lives in duxtur-portal
// (/api/edu-auth/telegram/start and /check) and hands back a Firebase custom token.
//
// Every step is logged through tgLog (console + copyable panel on the login page).
// Tokens and secrets are never logged in full.

import { describeError, tgLog, tgNewAttempt, tokenRef } from '@/lib/tgLog';

export const DUXTUR_HOSTS = ['duxtur.org', 'www.duxtur.org'];
// Used only when this app runs outside duxtur.org (e.g. its own *.vercel.app host). www is the host that
// actually serves duxtur.org; the bare domain redirects, and a cross-origin POST cannot follow a redirect.
const DEFAULT_REMOTE_AUTH_BASE = 'https://www.duxtur.org';

export interface AuthBase {
  base: string;
  source: string;
}

/**
 * Where the Telegram login API lives.
 *
 * Mounted under duxtur.org/edu the API is on the page's OWN origin, whichever of duxtur.org / www.duxtur.org
 * the visitor is on: same-origin needs no CORS and is allowed by the /edu Content-Security-Policy
 * (connect-src 'self'). Pointing at a fixed host breaks as soon as the visitor is on the other one:
 * a page on https://www.duxtur.org calling https://duxtur.org is cross-origin, so CSP blocks it before
 * any request is sent (nothing shows up in the server logs) and fetch() fails with a bare "Failed to fetch".
 */
export function resolveAuthBase(hostname: string, origin: string, envBase?: string): AuthBase {
  if (DUXTUR_HOSTS.includes(hostname)) return { base: origin, source: 'same-origin (page is on duxtur.org)' };
  if (envBase) return { base: envBase.replace(/\/$/, ''), source: 'NEXT_PUBLIC_EDU_AUTH_BASE_URL' };
  return { base: DEFAULT_REMOTE_AUTH_BASE, source: `default (${DEFAULT_REMOTE_AUTH_BASE})` };
}

function getAuthBase(): AuthBase {
  return resolveAuthBase(window.location.hostname, window.location.origin, process.env.NEXT_PUBLIC_EDU_AUTH_BASE_URL);
}
const STORAGE_KEY = 'tg_login_session_v1';
const POLL_INTERVAL_MS = 2000;
const REQUEST_ID_HEADER = 'x-edu-request-id';
// After this many 5xx answers in a row the server is broken, not slow: stop and say so instead of spinning for minutes.
const MAX_CONSECUTIVE_SERVER_ERRORS = 5;

/**
 * Headers that identify the invocation on the platform side. A 500 without X-Edu-Request-Id means the route
 * crashed before our own error handling ran; x-vercel-id is what to search for in the Vercel runtime logs.
 */
function platformHeaders(res: Response) {
  return {
    vercelId: res.headers.get('x-vercel-id'),
    vercelError: res.headers.get('x-vercel-error'),
    matchedPath: res.headers.get('x-matched-path'),
    server: res.headers.get('server'),
  };
}

export interface TelegramLoginSession {
  token: string;
  pollSecret: string;
  botUrl: string;
  expiresAt: number; // epoch ms
}

export type TelegramLoginErrorCode =
  | 'expired'
  | 'cancelled'
  | 'failed'
  | 'network' // fetch itself failed: offline, CORS/CSP, DNS, blocked
  | 'server' // 5xx or another unexpected HTTP status
  | 'rate_limited' // 429
  | 'bad_response'; // 200 but not the JSON we expect

export interface TelegramLoginErrorDetail {
  status?: number;
  /** Server request id (X-Edu-Request-Id): find the matching line in the Vercel logs. */
  ref?: string | null;
}

export class TelegramLoginError extends Error {
  constructor(
    public code: TelegramLoginErrorCode,
    message: string,
    public detail: TelegramLoginErrorDetail = {}
  ) {
    super(message);
  }
}

/** Human-readable message for the start step, with the server ref so it can be reported. */
export function describeStartError(err: unknown): string {
  if (!(err instanceof TelegramLoginError)) return 'Could not start Telegram sign-in.';
  const ref = err.detail.ref ? ` (ref ${err.detail.ref})` : '';
  switch (err.code) {
    case 'network':
      return `Could not reach the sign-in server. Check your connection.${ref}`;
    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.';
    case 'server':
      return `Telegram sign-in is unavailable right now (error ${err.detail.status ?? '?'})${ref}. Open Diagnostics below.`;
    case 'bad_response':
      return `The sign-in server sent an unexpected answer${ref}. Open Diagnostics below.`;
    default:
      return `Could not start Telegram sign-in.${ref}`;
  }
}

function saveSession(session: TelegramLoginSession) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    tgLog('info', 'session:saved', { tokenRef: tokenRef(session.token), expiresInSec: Math.round((session.expiresAt - Date.now()) / 1000) });
  } catch (err) {
    // Private mode etc.: login still works, it just cannot resume after a reload.
    tgLog('warn', 'session:save-failed (login works, but cannot resume after a reload)', describeError(err));
  }
}

export function clearTelegramSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    tgLog('info', 'session:cleared');
  } catch {}
}

/** A login started earlier in this tab (e.g. before the browser reloaded while the user was in Telegram). */
export function loadTelegramSession(): TelegramLoginSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      tgLog('info', 'session:none-to-resume');
      return null;
    }
    const s = JSON.parse(raw) as TelegramLoginSession;
    if (!s.token || !s.pollSecret || !s.botUrl || s.expiresAt <= Date.now()) {
      tgLog('warn', 'session:stored-but-invalid-or-expired', {
        tokenRef: tokenRef(s.token),
        hasPollSecret: !!s.pollSecret,
        hasBotUrl: !!s.botUrl,
        expiredSecondsAgo: s.expiresAt ? Math.round((Date.now() - s.expiresAt) / 1000) : null,
      });
      clearTelegramSession();
      return null;
    }
    tgLog('info', 'session:resumed-after-reload', {
      tokenRef: tokenRef(s.token),
      expiresInSec: Math.round((s.expiresAt - Date.now()) / 1000),
    });
    return s;
  } catch (err) {
    tgLog('warn', 'session:load-failed', describeError(err));
    return null;
  }
}

function snapshotEnvironment() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const auth = getAuthBase();
  return {
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
    pageOrigin: origin,
    authBase: auth.base,
    authBaseSource: auth.source,
    envAuthBase: process.env.NEXT_PUBLIC_EDU_AUTH_BASE_URL || '(unset)',
    sameOrigin: auth.base === origin,
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || '(none)',
    firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '(unset)',
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    secureContext: typeof window !== 'undefined' ? window.isSecureContext : null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
}

function networkHint(): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'browser reports it is offline';
  const { base } = getAuthBase();
  if (base !== window.location.origin) {
    return `auth base (${base}) is not the page origin (${window.location.origin}): CSP connect-src or CORS probably blocks it`;
  }
  return 'same-origin request failed before any HTTP answer: connectivity/DNS, an ad-blocker or extension, or the server dropped the connection';
}

/** fetch + a log line for the request, the response (status, timing, redirects, request id) or the failure. */
async function loggedFetch(step: string, url: string, init: RequestInit): Promise<Response> {
  const startedAt = performance.now();
  tgLog('info', `${step}:request`, { method: init.method, url });
  try {
    const res = await fetch(url, init);
    tgLog(res.ok ? 'info' : 'warn', `${step}:response`, {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      redirected: res.redirected,
      finalUrl: res.url,
      type: res.type,
      contentType: res.headers.get('content-type'),
      ref: res.headers.get(REQUEST_ID_HEADER),
      ...platformHeaders(res),
      tookMs: Math.round(performance.now() - startedAt),
    });
    return res;
  } catch (err) {
    if (init.signal?.aborted) {
      tgLog('info', `${step}:aborted`, { tookMs: Math.round(performance.now() - startedAt) });
    } else {
      tgLog('error', `${step}:network-error`, {
        ...describeError(err),
        hint: networkHint(),
        tookMs: Math.round(performance.now() - startedAt),
      });
    }
    throw err;
  }
}

async function readBody(step: string, res: Response): Promise<{ json: Record<string, unknown> | null; snippet: string }> {
  let text = '';
  try {
    text = await res.text();
  } catch (err) {
    tgLog('error', `${step}:body-read-failed`, describeError(err));
    return { json: null, snippet: '' };
  }
  const snippet = text.slice(0, 300);
  try {
    const parsed = JSON.parse(text);
    return { json: parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null, snippet };
  } catch {
    tgLog('warn', `${step}:body-not-json`, {
      contentType: res.headers.get('content-type'),
      snippet,
      note: snippet.trim().startsWith('<')
        ? 'got HTML instead of JSON: the request probably hit a page or an error screen, not the API route'
        : undefined,
    });
    return { json: null, snippet };
  }
}

export async function startTelegramLogin(): Promise<TelegramLoginSession> {
  const attempt = tgNewAttempt();
  tgLog('info', 'start:begin', { attempt, ...snapshotEnvironment() });

  const url = `${getAuthBase().base}/api/edu-auth/telegram/start`;
  let res: Response;
  try {
    res = await loggedFetch('start', url, { method: 'POST' });
  } catch (err) {
    throw new TelegramLoginError('network', err instanceof Error ? err.message : 'Network error');
  }

  const ref = res.headers.get(REQUEST_ID_HEADER);
  const { json, snippet } = await readBody('start', res);

  if (!res.ok) {
    const code: TelegramLoginErrorCode = res.status === 429 ? 'rate_limited' : 'server';
    tgLog('error', 'start:failed', {
      status: res.status,
      ref,
      serverError: json?.error ?? null,
      serverRef: json?.ref ?? null,
      bodySnippet: json ? undefined : snippet,
      meaning:
        res.status === 429
          ? 'rate limit on the server (10 starts per minute per IP)'
          : res.status >= 500
            ? 'server error: look up this ref in the Vercel logs (scope edu-tg:start)'
            : 'unexpected HTTP status',
    });
    throw new TelegramLoginError(code, `Start failed with HTTP ${res.status}`, {
      status: res.status,
      ref: ref || (typeof json?.ref === 'string' ? json.ref : null),
    });
  }

  const data = json as { token?: unknown; pollSecret?: unknown; botUrl?: unknown; expiresInSec?: unknown } | null;
  const missing = ['token', 'pollSecret', 'botUrl'].filter(k => typeof data?.[k as 'token'] !== 'string' || !data?.[k as 'token']);
  if (!data || missing.length > 0) {
    tgLog('error', 'start:bad-response', { missingFields: missing, receivedKeys: data ? Object.keys(data) : null, bodySnippet: data ? undefined : snippet });
    throw new TelegramLoginError('bad_response', 'Unexpected start response', { status: res.status, ref });
  }

  const session: TelegramLoginSession = {
    token: data.token as string,
    pollSecret: data.pollSecret as string,
    botUrl: data.botUrl as string,
    expiresAt: Date.now() + (typeof data.expiresInSec === 'number' ? data.expiresInSec : 300) * 1000,
  };

  let botHost: string | null = null;
  let botName: string | null = null;
  try {
    const u = new URL(session.botUrl);
    botHost = u.host;
    botName = u.pathname.replace('/', '');
  } catch {}
  tgLog('info', 'start:ok', {
    tokenRef: tokenRef(session.token),
    botHost,
    botName,
    expiresInSec: data.expiresInSec ?? '(default 300)',
    ref,
  });
  if (botHost !== 't.me') tgLog('warn', 'start:bot-url-unusual', { botUrl: session.botUrl, expected: 'https://t.me/<bot>?start=login_<token>' });

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
  const url = `${getAuthBase().base}/api/edu-auth/telegram/check`;
  const ref0 = tokenRef(session.token);
  tgLog('info', 'poll:begin', { tokenRef: ref0, intervalMs: POLL_INTERVAL_MS, expiresInSec: Math.round((session.expiresAt - Date.now()) / 1000) });

  let polls = 0;
  let lastState = '';
  let consecutiveFailures = 0;
  let serverErrors = 0;

  // Page lifecycle: a reload or a tab switch while the user is in Telegram explains many "it just hangs" cases.
  const onVisibility = () => tgLog('info', `page:visibility-${document.visibilityState}`);
  const onPageHide = () => tgLog('warn', 'page:pagehide (page is being unloaded or frozen)');
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  try {
    while (Date.now() < session.expiresAt) {
      if (signal?.aborted) {
        tgLog('info', 'poll:cancelled');
        throw new TelegramLoginError('cancelled', 'Cancelled');
      }
      polls++;
      // Log the first polls and then every 10th (~20 s); every state change and failure is always logged.
      const verbose = polls <= 3 || polls % 10 === 0;
      const startedAt = performance.now();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: session.token, pollSecret: session.pollSecret }),
          signal,
        });
        const ref = res.headers.get(REQUEST_ID_HEADER);
        const tookMs = Math.round(performance.now() - startedAt);

        if (res.status === 404) {
          tgLog('warn', 'poll:gone (404)', { poll: polls, ref, tokenRef: ref0, meaning: 'server does not know this login: expired, already used, or the token was never stored' });
          clearTelegramSession();
          throw new TelegramLoginError('expired', 'The sign-in link expired', { status: 404, ref });
        }

        if (res.ok) {
          consecutiveFailures = 0;
          serverErrors = 0;
          const { json, snippet } = await readBody('poll', res);
          const state = typeof json?.status === 'string' ? json.status : 'unparsable';
          if (state !== lastState || verbose) {
            tgLog('info', `poll:${state}`, { poll: polls, ref, tookMs, elapsedSec: Math.round((Date.now() - (session.expiresAt - 300000)) / 1000), ...(state === 'unparsable' ? { bodySnippet: snippet } : {}) });
            lastState = state;
          }
          if (json?.status === 'approved' && typeof json.customToken === 'string' && json.customToken) {
            const serverProjectId = typeof json.projectId === 'string' ? json.projectId : null;
            const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null;
            tgLog('info', 'poll:approved-received-custom-token', { poll: polls, ref, serverProjectId, clientProjectId });
            if (serverProjectId && clientProjectId && serverProjectId !== clientProjectId) {
              tgLog('error', 'config:firebase-project-mismatch', {
                serverProjectId,
                clientProjectId,
                meaning: 'the server signs tokens for a different Firebase project than this app uses: signInWithCustomToken will fail (auth/custom-token-mismatch). Fix FIREBASE_SERVICE_ACCOUNT_JSON on Vercel.',
              });
            }
            clearTelegramSession();
            return json.customToken;
          }
          if (json?.status === 'approved') {
            tgLog('error', 'poll:approved-but-no-custom-token', { poll: polls, ref, receivedKeys: json ? Object.keys(json) : null });
          }
        } else {
          consecutiveFailures++;
          const { json, snippet } = await readBody('poll', res);
          if (res.status >= 500) serverErrors++;
          const giveUp = serverErrors >= MAX_CONSECUTIVE_SERVER_ERRORS;
          tgLog(res.status === 429 ? 'warn' : 'error', giveUp ? 'poll:giving-up' : 'poll:http-error (will retry)', {
            poll: polls,
            status: res.status,
            ref,
            ...platformHeaders(res),
            serverError: json?.error ?? null,
            bodySnippet: json ? undefined : snippet,
            consecutiveFailures,
            ...(res.status >= 500 && !ref
              ? { meaning: 'the server answered 500 WITHOUT X-Edu-Request-Id: the /check route crashed before its own error handling (module failed to load or an exception outside the handler). Search the Vercel runtime logs for the x-vercel-id above.' }
              : {}),
          });
          if (giveUp) {
            clearTelegramSession();
            throw new TelegramLoginError('server', `Check failed with HTTP ${res.status} ${serverErrors} times in a row`, {
              status: res.status,
              ref: ref || platformHeaders(res).vercelId,
            });
          }
        }
      } catch (err) {
        if (err instanceof TelegramLoginError) throw err;
        if (signal?.aborted) {
          tgLog('info', 'poll:cancelled');
          throw new TelegramLoginError('cancelled', 'Cancelled');
        }
        // Network hiccup (weak connection): keep trying until the login expires.
        consecutiveFailures++;
        tgLog('warn', 'poll:network-error (will retry)', { poll: polls, consecutiveFailures, ...describeError(err), hint: networkHint() });
      }
      await sleep(POLL_INTERVAL_MS, signal);
    }
    tgLog('warn', 'poll:expired-locally', { polls, meaning: 'the 5-minute window ended without an approval reaching this page' });
    clearTelegramSession();
    throw new TelegramLoginError('expired', 'The sign-in link expired');
  } finally {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
  }
}
