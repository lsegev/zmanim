'use strict';

// מיקום ברירת מחדל - ירושלים (בשימוש כשאין הרשאת מיקום ואין זיהוי לפי IP)
const DEFAULT_POSITION = { latitude: 31.7683, longitude: 35.2137 };

// דיוק המיקום שנשלח לשירותי הגאוקודינג החיצוניים.
// 3 ספרות אחרי הנקודה = כ-100 מטר, מספיק כדי לזהות יישוב בלי לחשוף מיקום מדויק.
const GEOCODE_PRECISION = 3;

// תוקף המטמון של שם היישוב. שמות יישובים כמעט לא משתנים, ומטמון ארוך
// מצמצם משמעותית את מספר הפניות ל-Nominatim (בהתאם למדיניות השימוש של OSM).
const CITY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CITY_CACHE_PREFIX = 'zmanim:city:';

// מצב האפליקציה
const state = {
  latitude: null,
  longitude: null,
  // המטמון של זמני השמש מפתחו הוא התאריך + המיקום, כך שהוא מתרענן
  // אוטומטית בחצות ואינו "נתקע" על התמונה שהתקבלה בטעינת הדף.
  sunTimesCache: new Map()
};

function updateCurrentTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  document.getElementById('current-time').textContent = timeString;
}

function requestLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      position => handleLocation(position.coords.latitude, position.coords.longitude),
      error => {
        console.log('שגיאה בקבלת מיקום מהדפדפן:', error && error.message);
        tryIPFallback();
      },
      { timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  } else {
    tryIPFallback();
  }
}

function isValidCoordinate(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

function tryIPFallback() {
  console.log('מנסה לקבל מיקום מ-IP...');
  fetch('https://ipapi.co/json/')
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      // ipapi.co מחזיר שגיאות (כולל חריגה ממכסה) כ-JSON תקין עם error:true,
      // ולכן חובה לאמת את התוכן ולא להסתמך על ה-catch בלבד.
      if (!data || data.error) throw new Error(data && data.reason ? data.reason : 'תשובה לא תקינה');
      const latitude = Number(data.latitude);
      const longitude = Number(data.longitude);
      if (!isValidCoordinate(latitude, longitude)) throw new Error('קואורדינטות לא תקינות');
      handleLocation(latitude, longitude);
    })
    .catch(error => {
      console.log('שגיאה בקבלת מיקום מ-IP:', error && error.message);
      handleLocation(DEFAULT_POSITION.latitude, DEFAULT_POSITION.longitude);
    });
}

function handleLocation(latitude, longitude) {
  if (!isValidCoordinate(latitude, longitude)) {
    console.log('התקבלו קואורדינטות לא תקינות, נעשה שימוש בברירת המחדל');
    latitude = DEFAULT_POSITION.latitude;
    longitude = DEFAULT_POSITION.longitude;
  }

  state.latitude = latitude;
  state.longitude = longitude;
  state.sunTimesCache.clear();

  updateAll();
  updateCityName(latitude, longitude);
}

function setCityTitle(city) {
  // שם היישוב מגיע ממקור חיצוני הניתן לעריכה (OpenStreetMap), ולכן הוא
  // מוזרק כטקסט בלבד ולעולם לא כ-HTML.
  const title = document.getElementById('sun-times-title');
  title.textContent = '';

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = '📍';

  title.appendChild(icon);
  title.appendChild(document.createTextNode(city));
}

function roundCoordinate(value) {
  return Number(value.toFixed(GEOCODE_PRECISION));
}

function cityCacheKey(latitude, longitude) {
  return CITY_CACHE_PREFIX + roundCoordinate(latitude) + ',' + roundCoordinate(longitude);
}

function readCachedCity(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.city !== 'string' || Date.now() - entry.ts > CITY_CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.city;
  } catch (error) {
    return null;
  }
}

function writeCachedCity(key, city) {
  try {
    localStorage.setItem(key, JSON.stringify({ city: city, ts: Date.now() }));
  } catch (error) {
    // localStorage עשוי להיות חסום (מצב פרטי / הגבלת נפח) - זו אינה שגיאה קריטית.
  }
}

function updateCityName(latitude, longitude) {
  const key = cityCacheKey(latitude, longitude);
  const cached = readCachedCity(key);
  if (cached) {
    setCityTitle(cached);
    return;
  }

  const lat = roundCoordinate(latitude);
  const lon = roundCoordinate(longitude);

  // Nominatim (OSM) מדויק יותר מ-BigDataCloud עבור יישובים קטנים,
  // כולל בשטחי יהודה ושומרון שלא תמיד מקבלים שם עיר נכון ב-BigDataCloud.
  fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=he&zoom=16`)
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      const address = (data && data.address) || {};
      const city = address.city || address.town || address.municipality
        || address.village || address.hamlet;
      if (typeof city === 'string' && city.trim()) {
        const name = city.trim();
        writeCachedCity(key, name);
        setCityTitle(name);
      } else {
        updateCityNameFallback(lat, lon, key);
      }
    })
    .catch(error => {
      console.log('שגיאה בקבלת שם העיר מ-Nominatim:', error && error.message);
      updateCityNameFallback(lat, lon, key);
    });
}

function updateCityNameFallback(lat, lon, key) {
  fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=he`)
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      const city = data && (data.city || data.locality || data.principalSubdivision);
      if (typeof city === 'string' && city.trim()) {
        const name = city.trim();
        writeCachedCity(key, name);
        setCityTitle(name);
      }
    })
    .catch(error => {
      console.log('שגיאה בקבלת שם העיר:', error && error.message);
    });
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

// SunCalc מחזיר Invalid Date בקווי רוחב קוטביים שבהם אין זריחה או שקיעה ביום נתון.
function hasSunEvents(times) {
  return !!times && isValidDate(times.sunrise) && isValidDate(times.sunset);
}

function getSunTimes(date, latitude, longitude) {
  const key = date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
  let times = state.sunTimesCache.get(key);
  if (!times) {
    times = SunCalc.getTimes(date, latitude, longitude);
    state.sunTimesCache.set(key, times);
    // שומרים חלון קטן בלבד (אתמול/היום/מחר) כדי שהמטמון לא יגדל ללא גבול.
    if (state.sunTimesCache.size > 8) {
      state.sunTimesCache.delete(state.sunTimesCache.keys().next().value);
    }
  }
  return times;
}

function showSunUnavailable() {
  document.getElementById('sun-times').textContent = 'אין זריחה או שקיעה במיקום זה היום';
  document.getElementById('custom-time').textContent = '--:--';
}

function displaySunTimes(now, sunrise, sunset) {
  const sunriseStr = sunrise.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const sunsetStr = sunset.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  const isDay = now >= sunrise && now < sunset;
  const first = isDay ? `זריחה: ${sunriseStr}` : `שקיעה: ${sunsetStr}`;
  const second = isDay ? `שקיעה: ${sunsetStr}` : `זריחה: ${sunriseStr}`;

  const container = document.getElementById('sun-times');
  container.textContent = first;
  container.appendChild(document.createElement('br'));
  container.appendChild(document.createTextNode(second));
}

function displayZmanitTime(now, todaySunrise, todaySunset, prevSunset, nextSunrise) {
  let zmanType, zmanStart, zmanEnd;

  if (now >= todaySunrise && now < todaySunset) {
    zmanType = 'יום';
    zmanStart = todaySunrise;
    zmanEnd = todaySunset;
  } else {
    zmanType = 'לילה';
    if (now < todaySunrise) {
      zmanStart = prevSunset;
      zmanEnd = todaySunrise;
    } else {
      zmanStart = todaySunset;
      zmanEnd = nextSunrise;
    }
  }

  if (!isValidDate(zmanStart) || !isValidDate(zmanEnd) || zmanEnd <= zmanStart) {
    showSunUnavailable();
    return;
  }

  const zmanDuration = zmanEnd - zmanStart;
  const zmanitHourMs = zmanDuration / 12;
  const elapsed = now - zmanStart;
  const zmanFloat = elapsed / zmanitHourMs;

  const zmanHours = Math.floor(zmanFloat);
  const zmanMinutes = Math.floor((zmanFloat - zmanHours) * 60);
  const zmanDisplay = `${String(zmanHours).padStart(2, '0')}:${String(zmanMinutes).padStart(2, '0')}`;
  const zmanMinutesLength = Math.round(zmanitHourMs / 60000);
  const icon = zmanType === 'יום' ? '☀️' : '🌙';

  const container = document.getElementById('custom-time');
  container.textContent = zmanDisplay;
  container.appendChild(document.createElement('br'));

  const typeEl = document.createElement('span');
  typeEl.className = 'zman-type';
  const iconEl = document.createElement('span');
  iconEl.className = 'icon';
  iconEl.textContent = icon;
  typeEl.appendChild(iconEl);
  typeEl.appendChild(document.createTextNode(zmanType));

  const lengthEl = document.createElement('span');
  lengthEl.className = 'zman-length';
  lengthEl.textContent = `(משך שעה זמנית: ${zmanMinutesLength} דקות)`;

  container.appendChild(typeEl);
  container.appendChild(lengthEl);

  applyTheme(zmanType);
}

function applyTheme(zmanType) {
  document.body.classList.remove('day', 'night');
  document.body.classList.add(zmanType === 'יום' ? 'day' : 'night');
}

function gematria(num) {
  const hundreds = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק']];
  const tens = [[90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י']];
  const ones = [[9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];

  let remaining = Math.floor(num);
  let result = '';

  for (const [value, letter] of hundreds) {
    while (remaining >= value) {
      result += letter;
      remaining -= value;
    }
  }

  // טו/טז במקום יה/יו - גם כשהם השארית של מספר גדול יותר (למשל תתט"ו = 815).
  if (remaining === 15 || remaining === 16) {
    result += remaining === 15 ? 'טו' : 'טז';
    remaining = 0;
  }

  for (const [value, letter] of tens.concat(ones)) {
    while (remaining >= value) {
      result += letter;
      remaining -= value;
    }
  }

  if (result.length > 1) {
    result = result.slice(0, -1) + '"' + result.slice(-1);
  }
  return result;
}

function getFormattedHebrewDate(date) {
  const formatter = new Intl.DateTimeFormat('he-u-ca-hebrew', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const parts = formatter.formatToParts(date);
  const day = parseInt(parts.find(p => p.type === 'day').value);
  const monthName = parts.find(p => p.type === 'month').value;
  const year = parseInt(parts.find(p => p.type === 'year').value);
  return `${gematria(day)} ב${monthName} ${gematria(year % 1000)}`;
}

function updateDateBar() {
  const now = new Date();
  const gregorian = now.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const hebrew = getFormattedHebrewDate(now);
  document.getElementById('date-bar').textContent = `${gregorian} | ${hebrew}`;
}

function initMenu() {
  const menuToggle = document.querySelector('.menu-toggle');
  const menuClose = document.querySelector('.menu-close');
  const sideMenu = document.querySelector('.side-menu');
  const overlay = document.querySelector('.overlay');

  function toggleMenu() {
    sideMenu.classList.toggle('active');
    overlay.classList.toggle('active');
  }

  function closeMenu() {
    sideMenu.classList.remove('active');
    overlay.classList.remove('active');
  }

  menuToggle.addEventListener('click', toggleMenu);
  menuClose.addEventListener('click', toggleMenu);
  overlay.addEventListener('click', toggleMenu);

  document.querySelector('.menu-item.active a').addEventListener('click', event => {
    event.preventDefault();
    closeMenu();
  });

  // דפים שטרם נבנו - מונעים ניווט לקישור שבור עד שהם יעלו לאוויר.
  document.querySelectorAll('.menu-item.soon a').forEach(link => {
    link.addEventListener('click', event => event.preventDefault());
  });
}

function initRefreshButton() {
  const button = document.querySelector('.refresh-button');
  button.addEventListener('click', () => {
    button.style.transform = 'rotate(360deg)';
    setTimeout(() => window.location.reload(), 500);
  });
}

function startLiveUpdates() {
  updateAll();
  setInterval(updateAll, 1000);
}

function updateAll() {
  updateCurrentTime();
  updateDateBar();

  if (state.latitude === null || state.longitude === null) return;

  // כל הזמנים מחושבים מחדש מהתאריך הנוכחי, כך שהמעבר לתאריך חדש בחצות
  // מתעדכן גם באפליקציה שנשארה פתוחה כל הלילה.
  const now = new Date();
  const prevDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const times = getSunTimes(now, state.latitude, state.longitude);
  const prevTimes = getSunTimes(prevDay, state.latitude, state.longitude);
  const nextTimes = getSunTimes(nextDay, state.latitude, state.longitude);

  if (!hasSunEvents(times)) {
    showSunUnavailable();
    return;
  }

  displaySunTimes(now, times.sunrise, times.sunset);
  displayZmanitTime(now, times.sunrise, times.sunset, prevTimes.sunset, nextTimes.sunrise);
}

function init() {
  updateDateBar();
  updateCurrentTime();
  startLiveUpdates();
  initMenu();
  initRefreshButton();
  requestLocation();
}

window.addEventListener('load', init);
