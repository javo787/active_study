import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// public/sw.js is a plain script, not a module: it is run here the way a browser runs it, with a fake worker scope.
const SOURCE = readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf8');
const ORIGIN = 'https://duxtur.org';

type Handler = (event: unknown) => void;

/** What the network gives for a file of the same site: a Response of type "basic" (a hand-made Response is "default"). */
function fromNetwork(body: string, status = 200): Response {
  const response = new Response(body, { status });
  Object.defineProperty(response, 'type', { value: 'basic' });
  return response;
}

function startWorker(scope: string, language = 'en') {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, Response>>();
  const network = vi.fn<(request: Request) => Promise<Response>>();
  const cacheOf = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name)!;
    return {
      match: async (request: Request) => entries.get(request.url)?.clone(),
      put: async (request: Request, response: Response) => void entries.set(request.url, response),
      keys: async () => Array.from(entries.keys()).map(url => new Request(url)),
      delete: async (request: Request) => entries.delete(request.url),
    };
  };
  const clients = { claim: vi.fn().mockResolvedValue(undefined) };
  const self: Record<string, unknown> = {
    registration: { scope: `${ORIGIN}${scope}` },
    location: new URL(`${ORIGIN}${scope.replace(/\/$/, '')}/sw.js`),
    navigator: { language },
    clients,
    skipWaiting: vi.fn(),
    addEventListener: (type: string, handler: Handler) => void (handlers[type] = handler),
  };
  const sandbox = {
    self,
    caches: {
      open: async (name: string) => cacheOf(name),
      keys: async () => Array.from(store.keys()),
      delete: async (name: string) => store.delete(name),
    },
    fetch: (request: Request) => network(request),
    URL,
    Response,
    Promise,
    String,
  };
  vm.runInNewContext(SOURCE, sandbox);

  /** Sends a request through the worker; resolves to the response it gave, or null when it left the request alone. */
  async function request(path: string, init: { mode?: string; method?: string } = {}): Promise<Response | null> {
    const url = path.startsWith('http') ? path : `${ORIGIN}${path}`;
    const req = { url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' } as unknown as Request;
    let answer: Promise<Response> | null = null;
    handlers.fetch({ request: req, respondWith: (promise: Promise<Response>) => void (answer = promise) });
    return answer;
  }
  return { handlers, store, network, request, self, clients };
}

describe('service worker', () => {
  it('takes over at once, without waiting for the old tabs to close', async () => {
    const worker = startWorker('/edu');
    worker.handlers.install({});
    expect(worker.self.skipWaiting).toHaveBeenCalled();
    let done: Promise<unknown> | undefined;
    worker.handlers.activate({ waitUntil: (promise: Promise<unknown>) => void (done = promise) });
    await done;
    expect(worker.clients.claim).toHaveBeenCalled();
  });

  it('activation removes old caches of this app and leaves other apps caches alone', async () => {
    const worker = startWorker('/edu');
    worker.store.set('edu-static-v0', new Map());
    worker.store.set('edu-static-v1', new Map());
    worker.store.set('portal-cache', new Map());
    let done: Promise<unknown> | undefined;
    worker.handlers.activate({ waitUntil: (promise: Promise<unknown>) => void (done = promise) });
    await done;
    expect(Array.from(worker.store.keys()).sort()).toEqual(['edu-static-v1', 'portal-cache']);
  });

  it('shows the offline page instead of a browser error when a page cannot load', async () => {
    const worker = startWorker('/edu');
    worker.network.mockRejectedValue(new TypeError('Failed to fetch'));
    for (const path of ['/edu', '/edu/dashboard/student', '/edu/exam?id=1']) {
      const response = await worker.request(path, { mode: 'navigate' });
      expect(response).not.toBeNull();
      expect(response!.status).toBe(200);
      expect(response!.headers.get('content-type')).toContain('text/html');
      expect(response!.headers.get('cache-control')).toBe('no-store');
      expect(await response!.text()).toContain('You are offline');
    }
  });

  it('passes a page through unchanged when the network works (never serves a stored page)', async () => {
    const worker = startWorker('/edu');
    const live = new Response('<html>live</html>');
    worker.network.mockResolvedValue(live);
    const response = await worker.request('/edu/exam', { mode: 'navigate' });
    expect(response).toBe(live);
    expect(worker.store.size).toBe(0);
  });

  it('writes the offline page in the language of the device', async () => {
    for (const [language, text] of [['ru-RU', 'Нет подключения к интернету'], ['tg-TJ', 'Пайвастшавӣ ба интернет нест'], ['de', 'You are offline']] as const) {
      const worker = startWorker('/edu', language);
      worker.network.mockRejectedValue(new TypeError('offline'));
      const response = await worker.request('/edu', { mode: 'navigate' });
      expect(await response!.text()).toContain(text);
    }
  });

  it('keeps build files: the second request does not touch the network', async () => {
    const worker = startWorker('/edu');
    worker.network.mockImplementation(async () => fromNetwork('js'));
    const path = '/edu/_next/static/chunks/main-abc.js';
    const first = await worker.request(path);
    expect(await first!.text()).toBe('js');
    await new Promise(resolve => setTimeout(resolve, 0));
    const second = await worker.request(path);
    expect(await second!.text()).toBe('js');
    expect(worker.network).toHaveBeenCalledTimes(1);
  });

  it('does not keep failed answers', async () => {
    const worker = startWorker('/edu');
    worker.network.mockImplementation(async () => fromNetwork('missing', 404));
    const path = '/edu/_next/static/chunks/gone.js';
    await worker.request(path);
    await new Promise(resolve => setTimeout(resolve, 0));
    await worker.request(path);
    expect(worker.network).toHaveBeenCalledTimes(2);
  });

  it('leaves everything else to the browser', async () => {
    const worker = startWorker('/edu');
    const ignored: Array<[string, { mode?: string; method?: string }?]> = [
      ['/edu/auth-bridge', { mode: 'navigate' }],
      ['/edu/__/auth/handler', { mode: 'navigate' }],
      ['/edu/api/anything'],
      ['/edu/icons/icon-192.png'],
      ['/edu/exam', { method: 'POST' }],
      ['/edu/_next/static/chunks/a.js', { method: 'POST' }],
      ['/dashboard', { mode: 'navigate' }],
      ['/educational', { mode: 'navigate' }],
      ['https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel'],
      ['https://apis.google.com/js/api.js'],
      // Same path, other site: not ours even though the path looks like ours.
      ['https://cdn.example.com/edu/_next/static/chunks/a.js'],
      ['https://other.example.com/edu', { mode: 'navigate' }],
    ];
    for (const [path, init] of ignored) expect(await worker.request(path, init), path).toBeNull();
    expect(worker.network).not.toHaveBeenCalled();
  });

  it('works at the root too (standalone build)', async () => {
    const worker = startWorker('/');
    worker.network.mockRejectedValue(new TypeError('offline'));
    expect(await worker.request('/dashboard/student', { mode: 'navigate' })).not.toBeNull();
    expect(await worker.request('/auth-bridge', { mode: 'navigate' })).toBeNull();
    expect(await worker.request('/__/auth/handler', { mode: 'navigate' })).toBeNull();
  });

  it('keeps at most 150 build files, dropping the oldest', async () => {
    const worker = startWorker('/edu');
    worker.network.mockImplementation(async () => fromNetwork('x'));
    for (let i = 0; i < 155; i++) {
      await worker.request(`/edu/_next/static/chunks/c${i}.js`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await new Promise(resolve => setTimeout(resolve, 5));
    const kept = worker.store.get('edu-static-v1')!;
    expect(kept.size).toBe(150);
    expect(kept.has(`${ORIGIN}/edu/_next/static/chunks/c0.js`)).toBe(false);
    expect(kept.has(`${ORIGIN}/edu/_next/static/chunks/c154.js`)).toBe(true);
  });
});
