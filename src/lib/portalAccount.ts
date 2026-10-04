// Client side of "one account": the duxtur.org (portal) account that a Duxtur Edu account belongs to.
// The server part lives in duxtur-portal: /api/edu-auth/session (sign in with the portal session) and
// /api/edu-auth/link (link and unlink). Edu is mounted at duxtur.org/edu, so the portal's session cookie reaches
// those endpoints on the same origin; on any other host there is no portal session to use.

import { DUXTUR_HOSTS, resolveAuthBase } from '@/lib/telegramAuth';

/** Edu uid that the portal generates for a portal account that never had an Edu account: dx_<portal user id>. */
export const GENERATED_UID_PREFIX = 'dx_';

export type PortalSession =
  | { signedIn: false }
  | { signedIn: true; name: string; email: string; image: string; eduUid: string | null };

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
