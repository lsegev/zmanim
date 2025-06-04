const CACHE_NAME = 'zmanim-v0.1.3';
const ASSETS_TO_CACHE = [
  '/',
  'index.html',
  'style.css',
  'script.js',
  'hebrew-date.min.js',
  'manifest.json',
  'icons/icon-72x72.png',
  'icons/icon-96x96.png',
  'icons/icon-128x128.png',
  'icons/icon-144x144.png',
  'icons/icon-152x152.png',
  'icons/icon-192x192.png',
  'icons/icon-384x384.png',
  'icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  console.log('installing new service worker:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('activating new service worker:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  console.log('fetching:', event.request.url);
  event.respondWith(
    caches.match(event.request).then(resp => {
      return resp || fetch(event.request);
    })
  );
});

self.addEventListener('message', event => {
  console.log('message received:', event.data);
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});