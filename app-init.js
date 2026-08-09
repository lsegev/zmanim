'use strict';

// רישום ה-Service Worker וניהול העדכונים.
// הקובץ חיצוני (ולא inline) כדי לאפשר Content-Security-Policy ללא 'unsafe-inline'.
(function () {
  if (!('serviceWorker' in navigator)) return;

  // האם הדף כבר נשלט על ידי Service Worker בזמן הטעינה. אם לא, ה-controllerchange
  // הראשון נובע מ-clients.claim() של התקנה ראשונה - ואסור לרענן בגללו.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  function showUpdateBanner(registration) {
    const banner = document.getElementById('update-banner');
    const button = document.getElementById('update-button');
    if (!banner || !button) return;

    banner.hidden = false;
    button.addEventListener('click', () => {
      button.disabled = true;
      if (registration.waiting) {
        // ה-Service Worker החדש ייכנס לתוקף, וה-controllerchange ירענן את הדף פעם אחת.
        registration.waiting.postMessage({ action: 'skipWaiting' });
      } else {
        window.location.reload();
      }
    }, { once: true });
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(registration => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdateBanner(registration);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(registration);
            }
          });
        });
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}());
