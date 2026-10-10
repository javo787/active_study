/*
 * Service worker of Duxtur Edu. It does two small things and nothing else:
 *
 *  1. When a page cannot be loaded because there is no connection, it shows a short "you are offline" page instead of
 *     the browser's error page. The page is built here, so it needs nothing from the network.
 *  2. It keeps the build files of the app (/_next/static/..., their names change with every build) so that the next
 *     visit starts faster.
 *
 * It does not store pages, answers, accounts or anything from Firebase: exam data always comes from the network, and a
 * stale page of an exam must never be shown. The sign-in helper (/auth-bridge), /__/ and other sites are left alone.
 *
 * It works under any base path: the base ("/edu" under duxtur.org, "" standalone) is taken from the scope the page
 * registered it with.
 */
'use strict';

var STATIC_CACHE = 'edu-static-v1';
var MAX_STATIC_ENTRIES = 150;
var BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');

var OFFLINE_TEXT = {
  en: { title: 'You are offline', text: 'Reconnect to the internet and try again.', button: 'Try again' },
  ru: { title: 'Нет подключения к интернету', text: 'Подключитесь к интернету и попробуйте снова.', button: 'Повторить' },
  tj: { title: 'Пайвастшавӣ ба интернет нест', text: 'Ба интернет пайваст шавед ва бори дигар кӯшиш кунед.', button: 'Бори дигар' },
};

function offlineLanguage() {
  var language = String((self.navigator && self.navigator.language) || 'en').toLowerCase();
  if (language.indexOf('ru') === 0) return 'ru';
  if (language.indexOf('tg') === 0) return 'tj';
  return 'en';
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function offlinePage() {
  var language = offlineLanguage();
  var words = OFFLINE_TEXT[language];
  var html =
    '<!doctype html><html lang="' + (language === 'tj' ? 'tg' : language) + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0f172a">' +
    '<title>Duxtur Edu</title><style>' +
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#0f172a;text-align:center}' +
    'main{max-width:340px}h1{font-size:1.4rem;margin:0 0 .5rem}p{margin:0 0 1.5rem;color:#475569;line-height:1.5}' +
    'a{display:block;padding:14px 16px;border-radius:8px;background:#2563eb;color:#fff;font-weight:600;text-decoration:none}' +
    '</style></head><body><main><h1>' + escapeHtml(words.title) + '</h1><p>' + escapeHtml(words.text) + '</p>' +
    '<a href="">' + escapeHtml(words.button) + '</a></main>' +
    '<script>addEventListener("online",function(){location.reload()})</script></body></html>';
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** 'navigation' (a page), 'static' (a build file) or 'ignore' (not ours: the browser does what it always did). */
function classify(request) {
  if (request.method !== 'GET') return 'ignore';
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return 'ignore';
  if (url.pathname !== BASE && url.pathname.indexOf(BASE + '/') !== 0) return 'ignore';
  var path = url.pathname.slice(BASE.length) || '/';
  if (path.indexOf('/__/') === 0 || path === '/auth-bridge' || path.indexOf('/api/') === 0) return 'ignore';
  if (request.mode === 'navigate') return 'navigation';
  if (path.indexOf('/_next/static/') === 0) return 'static';
  return 'ignore';
}

function trim(cache) {
  return cache.keys().then(function (keys) {
    var extra = keys.length - MAX_STATIC_ENTRIES;
    var removals = [];
    for (var i = 0; i < extra; i++) removals.push(cache.delete(keys[i]));
    return Promise.all(removals);
  });
}

function cacheFirst(request) {
  return caches.open(STATIC_CACHE).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        if (response.ok && response.type === 'basic') {
          cache.put(request, response.clone()).then(function () { return trim(cache); }).catch(function () {});
        }
        return response;
      });
    });
  });
}

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(
          names
            .filter(function (name) { return name.indexOf('edu-') === 0 && name !== STATIC_CACHE; })
            .map(function (name) { return caches.delete(name); }),
        );
      })
      .then(function () { return self.clients.claim(); }),
  );
});

self.addEventListener('fetch', function (event) {
  var kind = classify(event.request);
  if (kind === 'navigation') {
    event.respondWith(fetch(event.request).catch(function () { return offlinePage(); }));
  } else if (kind === 'static') {
    event.respondWith(cacheFirst(event.request));
  }
});
