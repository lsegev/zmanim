'use strict';

// קביעת ערכת הנושא לפני הצביעה הראשונה של הדף.
// הקובץ נטען ב-head, ולכן <body> עדיין לא קיים - מכאן שמחלקת הערכה יושבת
// על <html>. בלי זה היה הבזק לבן בכל טעינה בלילה.
//
// prefers-color-scheme משמש כניחוש ההתחלתי בלבד: ברגע שמתקבל המיקום,
// הערכה נקבעת לפי הזריחה והשקיעה בפועל - נתון מדויק יותר מהעדפת המערכת.
(function () {
  var THEME_KEY = 'zmanim:theme';
  // אותו מפתח שבו script.js שומר את המיקום האחרון. שינוי כאן מחייב שינוי שם.
  var POSITION_KEY = 'zmanim:position';

  function readStored(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      // localStorage עשוי להיות חסום (מצב פרטי) - נופלים לברירת המחדל.
      return null;
    }
  }

  // זריחה ושקיעה מקורבות לקו רוחב/אורך נתונים, בלי SunCalc.
  //
  // דף הבית טוען את מנוע הזמנים המלא, אבל שאר העמודים לא - וקובץ זה רץ
  // ב-head עוד לפני כל ספרייה. לכן יש כאן חישוב שמש עצמאי ומקוצר: הוא
  // משמש רק להחלטה בינארית בין ערכה בהירה לכהה, שבה סטייה של דקה או שתיים
  // חסרת משמעות. הנוסחה היא אלגוריתם השקיעה הסטנדרטי (NOAA/USNO) בקירוב.
  //
  // מחזיר את זווית גובה השמש (במעלות) ברגע הנתון; חיובי = השמש מעל האופק.
  function solarAltitudeDegrees(date, latitude, longitude) {
    var rad = Math.PI / 180;
    // מספר הימים מאז J2000.0.
    var days = date.getTime() / 86400000 - 10957.5;

    // אנומליה ממוצעת של השמש, ואורך אקליפטי.
    var meanAnomaly = (357.5291 + 0.98560028 * days) * rad;
    var center = (1.9148 * Math.sin(meanAnomaly)
      + 0.02 * Math.sin(2 * meanAnomaly)
      + 0.0003 * Math.sin(3 * meanAnomaly)) * rad;
    var eclipticLongitude = meanAnomaly + center + Math.PI + 102.9372 * rad;

    // נטיית השמש.
    var obliquity = 23.4397 * rad;
    var declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));

    // זווית השעה: הזמן הסידרי במקום, פחות העלייה הישרה של השמש.
    var rightAscension = Math.atan2(
      Math.cos(obliquity) * Math.sin(eclipticLongitude),
      Math.cos(eclipticLongitude)
    );
    var siderealTime = (280.16 + 360.9856235 * days) * rad + longitude * rad;
    var hourAngle = siderealTime - rightAscension;

    var lat = latitude * rad;
    var altitude = Math.asin(
      Math.sin(lat) * Math.sin(declination) +
      Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)
    );
    return altitude / rad;
  }

  function automaticTheme() {
    var raw = readStored(POSITION_KEY);
    if (!raw) return null;

    var position;
    try {
      position = JSON.parse(raw);
    } catch (error) {
      return null;
    }
    if (!position ||
        typeof position.latitude !== 'number' ||
        typeof position.longitude !== 'number') {
      return null;
    }

    var altitude = solarAltitudeDegrees(new Date(), position.latitude, position.longitude);
    // אותו גבול שבו דף הבית מחליף בין "יום" ל"לילה": מרכז השמש מתחת לאופק.
    return altitude > -0.833 ? 'day' : 'night';
  }

  var preference = readStored(THEME_KEY);

  var theme;
  if (preference === 'day' || preference === 'night') {
    theme = preference;
  } else {
    // ערכה אוטומטית: לפי השמש במיקום האחרון שנשמר. רק אם אין מיקום שמור
    // (עוד לא נפתח דף הבית, או שהמשתמש סירב) נופלים להעדפת המערכת.
    theme = automaticTheme();
    if (!theme) {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'night' : 'day';
    }
  }

  document.documentElement.classList.remove('day', 'night');
  document.documentElement.classList.add(theme);

  // צבע סרגל המערכת בנייד חייב להתאים לערכה שנבחרה, אחרת בלילה נשאר פס בהיר.
  var meta = document.getElementById('theme-color-meta');
  if (meta) meta.setAttribute('content', theme === 'night' ? '#0f2027' : '#cdeefd');
}());

// רישום ה-Service Worker וניהול העדכונים.
// הקובץ חיצוני (ולא inline) כדי לאפשר Content-Security-Policy ללא 'unsafe-inline'.
(function () {
  if (!('serviceWorker' in navigator)) return;

  // דף הניהול אינו רושם Service Worker: זרימת ההתחברות של Google מסתמכת על
  // נתיבי /__/auth/ ועל הפניות חוזרות, וכל תיווך ביניהם שובר אותה. הדף גם
  // אינו נחוץ offline - הוא ממילא דורש חיבור לשרת כדי לשמור רעיון.
  if (window.location.pathname === '/admin.html') return;

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
