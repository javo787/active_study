import { describe, it, expect, vi } from 'vitest';
import {
  PortalAccountError,
  PortalDeps,
  DoctorStatus,
  PortalSession,
  articleAccess,
  fetchDoctorArticles,
  fetchPortalSession,
  formatArticleDate,
  formatCount,
  linkPortalAccount,
  linkState,
  parseDoctorArticles,
  portalErrorKey,
  portalLocale,
  portalPath,
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
  const signedIn = (eduUid: string | null) => ({ signedIn: true as const, name: 'A', email: 'a@b.c', image: '', eduUid, role: 'patient', doctor: null });

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
    expect(await fetchPortalSession(d)).toEqual({
      signedIn: true, name: 'Dr. Rahimov', email: 'r@mail.org', image: 'i.png', eduUid: 'tg_5', role: 'patient', doctor: null,
    });
    const [url, init] = d.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://duxtur.org/api/edu-auth/session');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
  });

  it('treats a missing Edu link as null', async () => {
    const d = deps(async () => json({ signedIn: true, name: 'A', email: '', image: '', eduUid: null }));
    expect(await fetchPortalSession(d)).toMatchObject({ signedIn: true, eduUid: null });
  });

  it('reads the role and the doctor profile status', async () => {
    const answer = (doctor: unknown) => deps(async () => json({ signedIn: true, name: 'Dr', email: 'd@x.tj', image: '', eduUid: null, role: 'doctor', doctor }));
    expect(await fetchPortalSession(answer({ status: 'approved' }))).toMatchObject({ role: 'doctor', doctor: { status: 'approved' } });
    expect(await fetchPortalSession(answer({ status: 'rejected' }))).toMatchObject({ doctor: { status: 'rejected' } });
    expect(await fetchPortalSession(answer({ status: 'pending' }))).toMatchObject({ doctor: { status: 'pending' } });
    expect(await fetchPortalSession(answer(null))).toMatchObject({ doctor: null });
  });

  it('reads a status it does not know as pending, never as approved', async () => {
    const d = deps(async () => json({ signedIn: true, role: 'doctor', doctor: { status: 'suspended' } }));
    expect(await fetchPortalSession(d)).toMatchObject({ doctor: { status: 'pending' } });
  });

  it('reads an older portal answer without role and doctor as a patient with no doctor profile', async () => {
    const d = deps(async () => json({ signedIn: true, name: 'A', email: '', image: '', eduUid: null }));
    expect(await fetchPortalSession(d)).toMatchObject({ role: 'patient', doctor: null });
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

describe('articleAccess', () => {
  const person = (doctor: { status: DoctorStatus } | null): PortalSession =>
    ({ signedIn: true, name: 'A', email: '', image: '', eduUid: null, role: 'doctor', doctor });

  it('opens the tools only to an approved doctor', () => {
    expect(articleAccess({ signedIn: false })).toBe('not_signed_in');
    expect(articleAccess(person(null))).toBe('no_profile');
    expect(articleAccess(person({ status: 'pending' }))).toBe('pending');
    expect(articleAccess(person({ status: 'rejected' }))).toBe('rejected');
    expect(articleAccess(person({ status: 'approved' }))).toBe('approved');
  });
});

describe('portal links', () => {
  it('maps the Edu language to a portal language', () => {
    expect(portalLocale('tj')).toBe('tg');
    expect(portalLocale('tj-TJ')).toBe('tg');
    expect(portalLocale('ru')).toBe('ru');
    expect(portalLocale('en')).toBe('ru');
    expect(portalLocale(undefined)).toBe('ru');
  });

  it('puts the portal language in front of the path', () => {
    expect(portalPath('tj', '/admin?tab=write')).toBe('/tg/admin?tab=write');
    expect(portalPath('en', '/register')).toBe('/ru/register');
  });
});

describe('parseDoctorArticles', () => {
  it('reads published and waiting articles with a title in the best available language', () => {
    const list = parseDoctorArticles(
      [
        { slug: 'a', title: { ru: 'Гипертония', tg: 'Фишори баланд' }, isVerified: true, views: 12, createdAt: '2026-09-01T00:00:00.000Z' },
        { slug: 'b', title: { uz: 'Faqat uz' }, isVerified: false },
        { slug: 'c', title: 'Plain string', isVerified: false, views: 'many' },
      ],
      'ru'
    );
    expect(list).toEqual([
      { slug: 'a', title: 'Гипертония', published: true, views: 12, createdAt: '2026-09-01T00:00:00.000Z' },
      { slug: 'b', title: 'Faqat uz', published: false, views: 0, createdAt: null },
      { slug: 'c', title: 'Plain string', published: false, views: 0, createdAt: null },
    ]);
    expect(parseDoctorArticles([{ slug: 'a', title: { ru: 'Гипертония', tg: 'Фишори баланд' } }], 'tj')[0].title).toBe('Фишори баланд');
  });

  it('skips entries without a slug and survives garbage', () => {
    expect(parseDoctorArticles([null, 3, { title: 'x' }, { slug: '' }], 'ru')).toEqual([]);
    expect(parseDoctorArticles({ error: 'nope' }, 'ru')).toEqual([]);
  });
});

describe('fetchDoctorArticles', () => {
  it('reads the list with the cookie of the same origin', async () => {
    const d = deps(async () => json([{ slug: 'a', title: { ru: 'T' }, isVerified: true, views: 3 }]));
    expect(await fetchDoctorArticles('ru', d)).toMatchObject([{ slug: 'a', title: 'T', published: true, views: 3 }]);
    const [url, init] = d.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://duxtur.org/api/doctor/articles');
    expect(init.credentials).toBe('same-origin');
  });

  it('says "not signed in" on 401 and "server" on any other failure', async () => {
    await expect(fetchDoctorArticles('ru', deps(async () => json(null, 401)))).rejects.toMatchObject({ code: 'not_signed_in' });
    await expect(fetchDoctorArticles('ru', deps(async () => json({ error: 'Doctor not approved' }, 403)))).rejects.toMatchObject({ code: 'server' });
    await expect(fetchDoctorArticles('ru', deps(async () => json([], 404)))).rejects.toMatchObject({ code: 'server' });
  });

  it('does not take an object for a list', async () => {
    await expect(fetchDoctorArticles('ru', deps(async () => json({ ok: true })))).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('reports a network failure as such', async () => {
    await expect(fetchDoctorArticles('ru', deps(async () => { throw new TypeError('Failed to fetch'); }))).rejects.toMatchObject({ code: 'network' });
  });
});

describe('formatArticleDate', () => {
  const iso = '2026-09-14T12:00:00.000Z';

  it('writes Tajik dates itself instead of letting the browser answer in English', () => {
    expect(formatArticleDate(iso, 'tj')).toBe('14 сен. 2026');
    expect(formatArticleDate('2026-03-05T12:00:00.000Z', 'tj')).toBe('5 март 2026');
  });

  it('uses Intl for Russian and English', () => {
    expect(formatArticleDate(iso, 'ru')).toMatch(/14 сент/);
    expect(formatArticleDate(iso, 'en')).toMatch(/Sep 14, 2026/);
  });

  it('is empty for a missing or broken date', () => {
    expect(formatArticleDate(null, 'ru')).toBe('');
    expect(formatArticleDate('not a date', 'tj')).toBe('');
  });
});

describe('formatCount', () => {
  it('groups thousands and never shows nonsense', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1284)).toBe('1\u00a0284');
    expect(formatCount(1234567)).toBe('1\u00a0234\u00a0567');
    expect(formatCount(-5)).toBe('0');
    expect(formatCount(12.9)).toBe('12');
  });
});
