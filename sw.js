/* =============================================================================
 *  ЦПСО EdPalm — service worker
 *  Нужен, чтобы приложение можно было установить на рабочий стол (PWA)
 *  и чтобы оно открывалось офлайн. Кэширует основные файлы.
 * ========================================================================== */

const CACHE = 'edpalm-legal-v8';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css?v=8',
  './js/data.js?v=8',
  './js/app.js?v=8',
  './manifest.json',
  './assets/emblem.svg',
  './assets/app-icon.svg',
  './assets/denied.svg',
  './assets/eureka.svg',
  './assets/owl.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first для своих файлов, сеть для остального
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).catch(() => caches.match('./index.html')))
  );
});
