/* Mandarin The SenLin Way — service worker: works offline once visited.
   Same-origin: network first, cache fallback (so updates arrive immediately, and the last
   good copy serves offline). CDN (fonts, libraries, stroke data): cache first.               */
const VERSION = 'senlin-v3';
const SHELL = ['./', './index.html', './css/senlin.css', './js/config.js', './js/loader.js', './js/engine.js', './js/native.js', './js/app.js', './js/cloud.js', './js/tutor.js', './js/practice.js',
  './js/data/pinyin.js', './js/data/components.js', './js/data/hsk1.js', './js/data/hsk2.js', './js/data/hsk3.js',
  './js/data/grammar.js', './js/data/scenarios.js', './js/data/business.js', './js/data/levelinfo.js', './assets/favicon.svg', './assets/icon-192.png', './manifest.webmanifest', './privacy.html', './terms.html'];
/* HSK 4–6 and recorded audio are cached the first time they are fetched (see the fetch handler). */

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (/\/audio\/.+\.mp3$/.test(url.pathname)) {           // recorded audio never changes: cache first
      e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; })));
      return;
    }
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
  } else if (/jsdelivr|cdnjs|gstatic|googleapis|sentry-cdn/.test(url.host)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; })));
  }
});
