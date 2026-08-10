const CACHE_NAME = 'zmanim-v0.5.0';

// נתיבים יחסיים בלבד: הם נפתרים מול scope של ה-Service Worker (למשל /zmanim/),
// ולכן עובדים גם כשהאתר מתפרסם בתת-נתיב כמו GitHub Pages.
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'offline.html',
  'style.css',
  'script.js',
  'app-init.js',
  'vendor/suncalc.js',
  'manifest.json',
  'icon.png'
];

const OFFLINE_URL = 'offline.html';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // cache.addAll הוא "הכל או כלום": כשל בודד (למשל 404) מפיל את כל ההתקנה
      // ומשאיר את האפליקציה בלי תמיכה offline. לכן כל נכס נשמר בנפרד.
      Promise.all(ASSETS_TO_CACHE.map(asset =>
        cache.add(asset).catch(err => {
          console.log('failed to cache asset:', asset, err);
        })
      ))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// ניווטים: רשת קודם, כדי שגרסה חדשה של הדף תגיע למשתמש מיד ולא רק אחרי
// החלפת CACHE_NAME. אם אין רשת - מגישים את הדף מהמטמון, ולבסוף את offline.html.
function handleNavigate(request) {
  return fetch(request)
    .then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('index.html', copy));
      return response;
    })
    .catch(() =>
      caches.match('index.html')
        .then(cached => cached || caches.match(OFFLINE_URL))
        .then(cached => cached || new Response('אין חיבור לאינטרנט', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        }))
    );
}

// נכסים סטטיים: מגישים מהמטמון לתגובה מיידית, ומרעננים ברקע (stale-while-revalidate)
// כך שתיקוני אבטחה מגיעים למשתמשים מותקנים בטעינה הבאה.
function handleAsset(request) {
  return caches.match(request).then(cached => {
    const network = fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => cached);

    return cached || network;
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  // בקשות לשירותים חיצוניים (גאוקודינג, זיהוי לפי IP) עוברות ישירות לרשת
  // ואינן נשמרות במטמון - מדובר בנתוני מיקום.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    return;
  }

  event.respondWith(handleAsset(request));
});

self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
