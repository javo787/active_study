// Step-by-step diagnostics for "Sign in with Telegram".
//
// Every step writes to the browser console AND to an in-memory + sessionStorage buffer, so the log
// survives a page reload (the browser often reloads while the user is inside Telegram) and can be
// copied from the on-screen panel on a phone, where DevTools are not available.
//
// Secrets are never logged: tokens are reduced to a short prefix, and any field whose name looks
// like a secret is redacted before it is stored.

export type TgLogLevel = 'info' | 'warn' | 'error';

export interface TgLogEntry {
  /** epoch ms */
  t: number;
  /** ms since this attempt started */
  ms: number;
  attempt: string;
  level: TgLogLevel;
  step: string;
  data?: Record<string, unknown>;
}

const STORAGE_KEY = 'tg_login_log_v1';
const MAX_ENTRIES = 300;
const SECRET_KEY_RE = /(token|secret|password|authorization|private_key|apikey)/i;
// Field names that are safe on purpose (already masked by the caller).
const SAFE_KEYS = new Set(['tokenRef']);

let entries: TgLogEntry[] = [];
let attempt = 'boot';
let attemptStartedAt = Date.now();
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        entries = parsed.slice(-MAX_ENTRIES);
        const last = entries[entries.length - 1];
        if (last) {
          attempt = last.attempt;
          attemptStartedAt = last.t - last.ms;
        }
      }
    }
  } catch {
    // Private mode etc.: keep going with the in-memory buffer only.
  }
}

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth > 3) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map(v => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    // Booleans and numbers cannot carry a secret (e.g. { hasPollSecret: true }): only strings and objects are hidden.
    const harmless = typeof v === 'boolean' || typeof v === 'number' || v === null || v === undefined;
    out[k] = SECRET_KEY_RE.test(k) && !SAFE_KEYS.has(k) && !harmless ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

/** First 6 chars of a token, enough to match a client log line to a server log line. */
export function tokenRef(token: unknown): string | null {
  return typeof token === 'string' && token ? `${token.slice(0, 6)}…` : null;
}

export function describeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return {
      name: err.name,
      message: err.message,
      ...(typeof code === 'string' ? { code } : {}),
      stack: err.stack?.split('\n').slice(0, 4).join(' | '),
    };
  }
  return { message: String(err) };
}

/** Starts a new login attempt: a fresh id so lines from different tries are easy to tell apart. */
export function tgNewAttempt(): string {
  load();
  attempt = Math.random().toString(16).slice(2, 8);
  attemptStartedAt = Date.now();
  return attempt;
}

export function tgLog(level: TgLogLevel, step: string, data?: Record<string, unknown>) {
  load();
  const now = Date.now();
  const entry: TgLogEntry = {
    t: now,
    ms: now - attemptStartedAt,
    attempt,
    level,
    step,
    data: data ? (redact(data) as Record<string, unknown>) : undefined,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  persist();

  const prefix = `[tg-login ${attempt} +${entry.ms}ms] ${step}`;
  if (entry.data) console[level](prefix, entry.data);
  else console[level](prefix);

  listeners.forEach(fn => fn());
}

export function tgGetLog(): TgLogEntry[] {
  load();
  return entries;
}

export function tgClearLog() {
  entries = [];
  persist();
  listeners.forEach(fn => fn());
}

export function tgSubscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function tgFormatLog(): string {
  load();
  const header = [
    `Active Study / Telegram login diagnostics`,
    `time: ${new Date().toISOString()}`,
    `page: ${typeof location !== 'undefined' ? location.href : ''}`,
    `ua: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
    '',
  ];
  const lines = entries.map(e => {
    const time = new Date(e.t).toISOString().slice(11, 23);
    const data = e.data ? ` ${JSON.stringify(e.data)}` : '';
    return `${time} [${e.attempt} +${e.ms}ms] ${e.level.toUpperCase()} ${e.step}${data}`;
  });
  return [...header, ...lines].join('\n');
}

let cspWatching = false;

/**
 * duxtur.org/edu runs under its own Content-Security-Policy. When it blocks a request (a fetch to the
 * API, the Firebase sign-in call, a script) the browser only prints a console message and fetch()
 * fails with a bare "Failed to fetch": record the violation itself so the cause is in the log.
 */
export function tgWatchCsp() {
  if (cspWatching || typeof document === 'undefined') return;
  cspWatching = true;
  document.addEventListener('securitypolicyviolation', e => {
    tgLog('error', 'csp:violation', {
      blockedURI: e.blockedURI,
      violatedDirective: e.violatedDirective,
      effectiveDirective: e.effectiveDirective,
      disposition: e.disposition,
      sourceFile: e.sourceFile || null,
      line: e.lineNumber || null,
      meaning: 'the page Content-Security-Policy blocked this request: add its host to the matching directive in duxtur-portal src/lib/edu-csp.ts',
    });
  });
}
