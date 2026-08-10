'use strict';

// קביעת ערכת הנושא לפני הצביעה הראשונה של הדף.
// הקובץ נטען ב-head, ולכן <body> עדיין לא קיים - מכאן שמחלקת הערכה יושבת
// על <html>. בלי זה היה הבזק לבן בכל טעינה בלילה.
//
// prefers-color-scheme משמש כניחוש ההתחלתי בלבד: ברגע שמתקבל המיקום,
// הערכה נקבעת לפי הזריחה והשקיעה בפועל - נתון מדויק יותר מהעדפת המערכת.
(function () {
  var THEME_KEY = 'zmanim:theme';
  var preference = null;

  try {
    preference = localStorage.getItem(THEME_KEY);
  } catch (error) {
    // localStorage עשוי להיות חסום (מצב פרטי) - נופלים לברירת המחדל.
  }

  var theme;
  if (preference === 'day' || preference === 'night') {
    theme = preference;
  } else {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'night' : 'day';
  }

  document.documentElement.classList.remove('day', 'night');
  document.documentElement.classList.add(theme);
}());

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
