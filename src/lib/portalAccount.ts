// Client side of "one account": the duxtur.org (portal) account that a Duxtur Edu account belongs to.
// The server part lives in duxtur-portal: /api/edu-auth/session (sign in with the portal session) and
// /api/edu-auth/link (link and unlink). Edu is mounted at duxtur.org/edu, so the portal's session cookie reaches
// those endpoints on the same origin; on any other host there is no portal session to use.

import { DUXTUR_HOSTS, resolveAuthBase } from '@/lib/telegramAuth';

/** Edu uid that the portal generates for a portal account that never had an Edu account: dx_<portal user id>. */
export const GENERATED_UID_PREFIX = 'dx_';

/** Status of a person's doctor profile on duxtur.org. Articles are written by approved doctors only. */
export type DoctorStatus = 'pending' | 'approved' | 'rejected';

export type PortalSession =
  | { signedIn: false }
  | {
      signedIn: true;
      name: string;
      email: string;
      image: string;
      eduUid: string | null;
      /** Portal role of the account ("patient" when the portal says nothing). */
      role: string;
      /** The doctor profile of this account, or null when there is none. */
      doctor: { status: DoctorStatus } | null;
    };

/**
 * How the portal account of this browser relates to the Edu account that is signed in right now:
 * - not_signed_in: no portal session here;
 * - linked_here: the portal account is linked to this very Edu account;
 * - linkable: the portal account has no Edu account yet, so this one can be linked;
 * - linked_elsewhere: the portal account already belongs to a different Edu account.
 */
export type PortalLinkState = 'not_signed_in' | 'linked_here' | 'linkable' | 'linked_elsewhere';

export function linkState(portal: PortalSession, eduUid: string): PortalLinkState {
  if (!portal.signedIn) return 'not_signed_in';
  if (portal.eduUid === eduUid) return 'linked_here';
  return portal.eduUid ? 'linked_elsewhere' : 'linkable';
}

export type PortalErrorCode =
  | 'not_signed_in'
  | 'bad_origin'
  | 'invalid_id_token'
  | 'edu_uid_taken'
  | 'portal_already_linked'
  | 'invalid_uid'
  | 'cannot_unlink'
  | 'not_found'
  | 'rate_limited'
  | 'network'
  | 'server'
  | 'bad_response';

const KNOWN_CODES: PortalErrorCode[] = [
  'not_signed_in', 'bad_origin', 'invalid_id_token', 'edu_uid_taken', 'portal_already_linked', 'invalid_uid', 'cannot_unlink', 'not_found',
];

export class PortalAccountError extends Error {
  constructor(public code: PortalErrorCode, message: string, public ref: string | null = null) {
    super(message);
    this.name = 'PortalAccountError';
  }
}

/** Where the portal API lives: the page's own origin on duxtur.org (see resolveAuthBase). */
export interface PortalDeps {
  fetch: typeof fetch;
  base: string;
  onDuxtur: boolean;
}

function defaultDeps(): PortalDeps {
  const { hostname, origin } = window.location;
  return {
    fetch: (input, init) => fetch(input, init),
    base: resolveAuthBase(hostname, origin, process.env.NEXT_PUBLIC_EDU_AUTH_BASE_URL).base,
    onDuxtur: DUXTUR_HOSTS.includes(hostname),
  };
}

const TIMEOUT_MS = 8000;

async function call(deps: PortalDeps, path: string, init: RequestInit): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await deps.fetch(`${deps.base}${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PortalAccountError('network', 'Could not reach duxtur.org.');
  }

  let body: Record<string, unknown> | null = null;
  try {
    const parsed = await res.json();
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    // handled below
  }

  const ref = typeof body?.ref === 'string' ? body.ref : res.headers.get('x-edu-request-id');
  if (!res.ok) {
    const code = body?.code;
    if (typeof code === 'string' && (KNOWN_CODES as string[]).includes(code)) {
      throw new PortalAccountError(code as PortalErrorCode, String(body?.error ?? code), ref);
    }
    if (res.status === 429) throw new PortalAccountError('rate_limited', 'Too many attempts.', ref);
    throw new PortalAccountError('server', `duxtur.org answered ${res.status}.`, ref);
  }
  if (!body) throw new PortalAccountError('bad_response', 'duxtur.org sent an unexpected answer.', ref);
  return body;
}

/**
 * A status this app does not know (the portal added one) counts as "pending": the safe reading, because it
 * never opens the article tools to someone who may not be approved. An older portal that sends no `doctor` at
 * all gives null, which the Articles page reads as "no doctor profile".
 */
function parseDoctor(value: unknown): { status: DoctorStatus } | null {
  if (!value || typeof value !== 'object') return null;
  const status = (value as { status?: unknown }).status;
  if (status === 'approved' || status === 'rejected') return { status };
  return typeof status === 'string' && status ? { status: 'pending' } : null;
}

/**
 * Who is signed in to duxtur.org in this browser. Never throws: anything that goes wrong (not on duxtur.org,
 * offline, portal down) means "no portal session", and the page simply does not offer the portal.
 */
export async function fetchPortalSession(deps?: PortalDeps): Promise<PortalSession> {
  try {
    const d = deps ?? defaultDeps();
    if (!d.onDuxtur) return { signedIn: false };
    const body = await call(d, '/api/edu-auth/session', { method: 'GET' });
    if (body.signedIn !== true) return { signedIn: false };
    return {
      signedIn: true,
      name: typeof body.name === 'string' ? body.name : '',
      email: typeof body.email === 'string' ? body.email : '',
      image: typeof body.image === 'string' ? body.image : '',
      eduUid: typeof body.eduUid === 'string' && body.eduUid ? body.eduUid : null,
      role: typeof body.role === 'string' && body.role ? body.role : 'patient',
      doctor: parseDoctor(body.doctor),
    };
  } catch {
    return { signedIn: false };
  }
}

/** A Firebase custom token for the Edu account of the portal account that is signed in. */
export async function requestPortalCustomToken(deps?: PortalDeps): Promise<string> {
  const body = await call(deps ?? defaultDeps(), '/api/edu-auth/session', { method: 'POST' });
  if (typeof body.customToken !== 'string' || !body.customToken) {
    throw new PortalAccountError('bad_response', 'duxtur.org sent an unexpected answer.');
  }
  return body.customToken;
}

/** Links the Edu account that owns `idToken` to the portal account that is signed in. */
export async function linkPortalAccount(idToken: string, deps?: PortalDeps): Promise<void> {
  await call(deps ?? defaultDeps(), '/api/edu-auth/link', { method: 'POST', body: JSON.stringify({ idToken }) });
}

export async function unlinkPortalAccount(deps?: PortalDeps): Promise<void> {
  await call(deps ?? defaultDeps(), '/api/edu-auth/link', { method: 'DELETE' });
}

/** i18n key (under "account.errors") that explains a failure to the person. */
export function portalErrorKey(err: unknown): string {
  return err instanceof PortalAccountError ? err.code : 'server';
}

export type SignInMethod = 'telegram' | 'google' | 'duxtur' | 'unknown';

/** Which sign-in the Edu account in this session was made with. */
export function signInMethod(uid: string, providerIds: string[], claimProvider?: unknown): SignInMethod {
  if (claimProvider === 'duxtur' || uid.startsWith(GENERATED_UID_PREFIX)) return 'duxtur';
  if (uid.startsWith('tg_') || claimProvider === 'telegram') return 'telegram';
  if (providerIds.includes('google.com')) return 'google';
  return 'unknown';
}

/** What the Articles page can offer this person. */
export type ArticleAccess = 'not_signed_in' | 'no_profile' | 'pending' | 'rejected' | 'approved';

export function articleAccess(portal: PortalSession): ArticleAccess {
  if (!portal.signedIn) return 'not_signed_in';
  if (!portal.doctor) return 'no_profile';
  return portal.doctor.status;
}

/** Portal locales are ru/uz/tg/kk/ky; Edu has ru/en/tj. Tajik maps to tg, everything else to the portal default. */
export function portalLocale(lang: string | undefined): 'ru' | 'tg' {
  return lang?.toLowerCase().startsWith('tj') || lang?.toLowerCase().startsWith('tg') ? 'tg' : 'ru';
}

/** Path of a duxtur.org page in the person's language: portalPath('tj', '/admin?tab=write') -> /tg/admin?tab=write. */
export function portalPath(lang: string | undefined, path: string): string {
  return `/${portalLocale(lang)}${path}`;
}

/**
 * Sign-in with e-mail is the portal's: its sign-up page sends a link to the address and, with next=/edu, brings the
 * person back here, where "Continue as ..." signs them in. Only meaningful on duxtur.org (the session is shared there).
 */
export function emailSignInPath(lang: string | undefined): string {
  return portalPath(lang, '/signup?next=/edu');
}

/** An article of the signed-in doctor, as /api/doctor/articles lists it. */
export interface DoctorArticle {
  slug: string;
  title: string;
  published: boolean;
  views: number;
  createdAt: string | null;
}

type RawTitle = Record<string, unknown> | string | undefined | null;

function articleTitle(raw: RawTitle, lang: string | undefined): string {
  if (typeof raw === 'string') return raw;
  if (!raw || typeof raw !== 'object') return '';
  const order = portalLocale(lang) === 'tg' ? ['tg', 'ru', 'uz', 'kk', 'ky'] : ['ru', 'tg', 'uz', 'kk', 'ky'];
  for (const key of order) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

/** Pure part of fetchDoctorArticles, so the odd shapes of old data are tested without a network. */
export function parseDoctorArticles(body: unknown, lang: string | undefined): DoctorArticle[] {
  if (!Array.isArray(body)) return [];
  const result: DoctorArticle[] = [];
  for (const item of body) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    if (typeof a.slug !== 'string' || !a.slug) continue;
    result.push({
      slug: a.slug,
      title: articleTitle(a.title as RawTitle, lang),
      published: a.isVerified === true,
      views: typeof a.views === 'number' && Number.isFinite(a.views) ? a.views : 0,
      createdAt: typeof a.createdAt === 'string' ? a.createdAt : null,
    });
  }
  return result;
}

/**
 * The articles of the approved doctor behind the portal session. This endpoint answers with a bare array (or
 * 401/403/404 with another body), so it does not go through call(): any non-array answer is a failure.
 */
export async function fetchDoctorArticles(lang: string | undefined, deps?: PortalDeps): Promise<DoctorArticle[]> {
  const d = deps ?? defaultDeps();
  let res: Response;
  try {
    res = await d.fetch(`${d.base}/api/doctor/articles`, { credentials: 'same-origin', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new PortalAccountError('network', 'Could not reach duxtur.org.');
  }
  if (res.status === 401) throw new PortalAccountError('not_signed_in', 'Not signed in on duxtur.org.');
  if (!res.ok) throw new PortalAccountError('server', `duxtur.org answered ${res.status}.`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new PortalAccountError('bad_response', 'duxtur.org sent an unexpected answer.');
  }
  if (!Array.isArray(body)) throw new PortalAccountError('bad_response', 'duxtur.org sent an unexpected answer.');
  return parseDoctorArticles(body, lang);
}

const TJ_MONTHS = ['янв.', 'фев.', 'март', 'апр.', 'май', 'июн', 'июл', 'авг.', 'сен.', 'окт.', 'ноя.', 'дек.'];

/**
 * "14 сен. 2026". Russian and English come from Intl; Tajik is spelled out here because browsers ship no Tajik
 * date data and would silently answer in English.
 */
export function formatArticleDate(iso: string | null, lang: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (portalLocale(lang) === 'tg') return `${date.getDate()} ${TJ_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const locale = lang?.toLowerCase().startsWith('en') ? 'en' : 'ru';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/** 1284 -> "1 284" (no-break space), the same in every language of the app. */
export function formatCount(value: number): string {
  return String(Math.max(0, Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}
