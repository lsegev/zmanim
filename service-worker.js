const CACHE_NAME = 'zmanim-v0.1.4';
const ASSETS_TO_CACHE = [
  '/',
  'index.html',
  'style.css',
  'script.js',
  'hebrew-date.min.js',
  'manifest.json',
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