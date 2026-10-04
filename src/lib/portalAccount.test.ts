import { describe, it, expect, vi } from 'vitest';
import {
  PortalAccountError,
  PortalDeps,
  fetchPortalSession,
  linkPortalAccount,
  linkState,
  portalErrorKey,
  requestPortalCustomToken,
  signInMethod,
  unlinkPortalAccount,
} from './portalAccount';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function deps(impl: (url: string, init: RequestInit) => Promise<Response>, onDuxtur = true): PortalDeps & { fetch: ReturnType<typeof vi.fn> } {
  const fetch = vi.fn(impl as never);
  return { fetch: fetch as never, base: 'https://duxtur.org', onDuxtur } as PortalDeps & { fetch: ReturnType<typeof vi.fn> };
}

describe('linkState', () => {
  const signedIn = (eduUid: string | null) => ({ signedIn: true as const, name: 'A', email: 'a@b.c', image: '', eduUid });

  it('covers the four situations', () => {
    expect(linkState({ signedIn: false }, 'tg_1')).toBe('not_signed_in');
    expect(linkState(signedIn('tg_1'), 'tg_1')).toBe('linked_here');
    expect(linkState(signedIn(null), 'tg_1')).toBe('linkable');
    expect(linkState(signedIn('tg_2'), 'tg_1')).toBe('linked_elsewhere');
  });
});

describe('fetchPortalSession', () => {
  it('reads who is signed in on duxtur.org, sending the cookie of the same origin', async () => {
    const d = deps(async () => json({ signedIn: true, name: 'Dr. Rahimov', email: 'r@mail.org', image: 'i.png', eduUid: 'tg_5' }));
    expect(await fetchPortalSession(d)).toEqual({ signedIn: true, name: 'Dr. Rahimov', email: 'r@mail.org', image: 'i.png', eduUid: 'tg_5' });
    const [url, init] = d.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://duxtur.org/api/edu-auth/session');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
  });

  it('treats a missing Edu link as null', async () => {
    const d = deps(async () => json({ signedIn: true, name: 'A', email: '', image: '', eduUid: null }));
    expect(await fetchPortalSession(d)).toMatchObject({ signedIn: true, eduUid: null });
  });

  it('is signed out when the portal says so', async () => {
    expect(await fetchPortalSession(deps(async () => json({ signedIn: false })))).toEqual({ signedIn: false });
  });

  it('never asks the portal from a host other than duxtur.org', async () => {
    const d = deps(async () => json({ signedIn: true }), false);
    expect(await fetchPortalSession(d)).toEqual({ signedIn: false });
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('never throws: offline, portal errors and garbage all mean "no portal session"', async () => {
    expect(await fetchPortalSession(deps(async () => { throw new TypeError('Failed to fetch'); }))).toEqual({ signedIn: false });
    expect(await fetchPortalSession(deps(async () => json({ error: 'Server error' }, 500)))).toEqual({ signedIn: false });
    expect(await fetchPortalSession(deps(async () => new Response('<html>', { status: 200 })))).toEqual({ signedIn: false });
  });
});

describe('requestPortalCustomToken', () => {
  it('posts to the session endpoint and returns the token', async () => {
    const d = deps(async () => json({ customToken: 'jwt.jwt.jwt', eduUid: 'dx_1' }));
    expect(await requestPortalCustomToken(d)).toBe('jwt.jwt.jwt');
    const [url, init] = d.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://duxtur.org/api/edu-auth/session');
    expect(init.method).toBe('POST');
  });

  it('explains a signed-out portal with a code the screen can translate', async () => {
    const d = deps(async () => json({ error: 'Not signed in on duxtur.org', code: 'not_signed_in', ref: 'r1' }, 401));
    await expect(requestPortalCustomToken(d)).rejects.toMatchObject({ code: 'not_signed_in', ref: 'r1' });
  });

  it('classifies network failures, rate limits, server errors and bad answers', async () => {
    await expect(requestPortalCustomToken(deps(async () => { throw new TypeError('x'); }))).rejects.toMatchObject({ code: 'network' });
    await expect(requestPortalCustomToken(deps(async () => json({ error: 'Too many requests' }, 429)))).rejects.toMatchObject({ code: 'rate_limited' });
    await expect(requestPortalCustomToken(deps(async () => json({ error: 'Server error', ref: 'abc' }, 500)))).rejects.toMatchObject({ code: 'server', ref: 'abc' });
    await expect(requestPortalCustomToken(deps(async () => json({ nothing: true })))).rejects.toMatchObject({ code: 'bad_response' });
    await expect(requestPortalCustomToken(deps(async () => new Response('oops', { status: 200 })))).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('does not trust an error code it does not know', async () => {
    await expect(requestPortalCustomToken(deps(async () => json({ code: '<script>', error: 'x' }, 400)))).rejects.toMatchObject({ code: 'server' });
  });
});

describe('linkPortalAccount and unlinkPortalAccount', () => {
  it('sends the Firebase ID token in the body, not in the URL', async () => {
    const d = deps(async () => json({ linked: true }));
    await linkPortalAccount('id.token.value', d);
    const [url, init] = d.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://duxtur.org/api/edu-auth/link');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ idToken: 'id.token.value' });
  });

  it.each(['edu_uid_taken', 'portal_already_linked', 'invalid_id_token', 'not_signed_in'])('surfaces the refusal %s', async code => {
    const d = deps(async () => json({ error: 'nope', code }, 409));
    await expect(linkPortalAccount('t', d)).rejects.toBeInstanceOf(PortalAccountError);
    await expect(linkPortalAccount('t', d)).rejects.toMatchObject({ code });
  });

  it('unlinks with DELETE', async () => {
    const d = deps(async () => json({ unlinked: true }));
    await unlinkPortalAccount(d);
    expect((d.fetch.mock.calls[0] as [string, RequestInit])[1].method).toBe('DELETE');
  });
});

describe('portalErrorKey', () => {
  it('uses the error code, and "server" for anything else', () => {
    expect(portalErrorKey(new PortalAccountError('edu_uid_taken', 'x'))).toBe('edu_uid_taken');
    expect(portalErrorKey(new Error('boom'))).toBe('server');
    expect(portalErrorKey(undefined)).toBe('server');
  });
});

describe('signInMethod', () => {
  it('recognises how the Edu account signs in', () => {
    expect(signInMethod('tg_123', [], 'telegram')).toBe('telegram');
    expect(signInMethod('tg_123', [])).toBe('telegram');
    expect(signInMethod('dx_abc', [], 'duxtur')).toBe('duxtur');
    expect(signInMethod('dx_abc', [])).toBe('duxtur');
    expect(signInMethod('Xyz123', ['google.com'])).toBe('google');
    expect(signInMethod('Xyz123', [])).toBe('unknown');
  });

  it('shows a Telegram account that signs in through duxtur.org as duxtur.org', () => {
    expect(signInMethod('tg_123', [], 'duxtur')).toBe('duxtur');
  });
});
