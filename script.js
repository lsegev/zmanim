'use strict';

// מיקום ברירת מחדל - ירושלים (בשימוש כשאין הרשאת מיקום ואין זיהוי לפי IP)
const DEFAULT_POSITION = { latitude: 31.7683, longitude: 35.2137 };

// אבן השתייה שבהר הבית - נקודת היעד לחישוב כיוון התפילה.
// לפי שולחן ערוך או"ח צ"ד א', היעד הוא מקום המקדש ובית קודשי הקודשים, ולא
// הכותל המערבי (שהוא הקיר התומך המערבי של ההר, כ-140 מ' ממערב לנקודה הזו).
// מחוץ לירושלים ההפרש בין שתי הנקודות זניח - כשליש מעלה מבית אל וכ-0.14
// מעלות מתל אביב - אך בתוך ירושלים הוא מגיע לכמה מעלות ואז הוא כן משמעותי.
const FOUNDATION_STONE_POSITION = { latitude: 31.778040, longitude: 35.235400 };

// מזהי הקוביות ההלכתיות המבוססות על שעה זמנית (לצורך ניקוי בזמן שאין זריחה/שקיעה)
const DAILY_ZMAN_IDS = [
  'alot-hashachar', 'misheyakir', 'sof-zman-shema', 'sof-zman-tefila',
  'chatzot-day', 'mincha-gedola', 'plag-hamincha',
  'tzeit-hakochavim', 'tzeit-rabbeinu-tam', 'chatzot-night'
];

// דקות קבועות אחרי השקיעה לצאת הכוכבים לפי מנהג ישראל הרווח.
// זו הכרעה הלכתית ולא נתון אסטרונומי - יש נוהגים ב-13.5, 20 או 24 דקות.
const TZEIT_MINUTES_AFTER_SUNSET = 18;

// שמות הזמנים לסרגל "הזמן הבא". הנץ והשקיעה אינם קוביות זמן, ולכן הם
// מזוהים במפתחות נפרדים שממופים לקוביית "זריחה ושקיעה".
const ZMAN_LABELS = {
  'alot-hashachar': 'עלות השחר',
  'misheyakir': 'משיכיר',
  'sof-zman-shema': 'סוף זמן ק"ש',
  'sof-zman-tefila': 'סוף זמן תפילה',
  'chatzot-day': 'חצות היום',
  'mincha-gedola': 'מנחה גדולה',
  'plag-hamincha': 'פלג המנחה',
  'tzeit-hakochavim': 'צאת הכוכבים',
  'tzeit-rabbeinu-tam': 'צאת הכוכבים (ר"ת)',
  'chatzot-night': 'חצות הלילה',
  'sunrise': 'הנץ החמה',
  'sunset': 'שקיעה'
};

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

// כיוון המכשיר האמיתי (מעלות מצפון, בכיוון השעון) - null כל עוד לא הופעל מצפן חי
// או שהדפדפן לא מספק חיישן כיוון מהימן.
let deviceHeading = null;

const SVG_NS = 'http://www.w3.org/2000/svg';

// אייקון מתוך מאגר הסמלים שב-index.html. חייב createElementNS - אלמנטי SVG
// שנוצרים עם createElement רגיל מקבלים namespace של HTML ולא נרנדרים.
function createIcon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');

  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', '#' + name);

  svg.appendChild(use);
  return svg;
}

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

// שם היישוב נוגע לכל הזמנים בעמוד ולכן הוא מוצג בפס התאריך, ולא בתוך
// כותרת של קוביה בודדת שאיבדה בגללו את התווית שלה.
function setCityTitle(city) {
  const container = document.getElementById('location-name');
  const text = document.getElementById('location-name-text');
  if (!container || !text) return;

  // שם היישוב מגיע ממקור חיצוני הניתן לעריכה (OpenStreetMap), ולכן הוא
  // מוזרק כטקסט בלבד ולעולם לא כ-HTML.
  text.textContent = city;
  container.hidden = false;
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
  const sunTimes = document.getElementById('sun-times');
  sunTimes.textContent = '';
  const message = document.createElement('span');
  message.className = 'sun-unavailable';
  message.textContent = 'אין זריחה או שקיעה במיקום זה היום';
  sunTimes.appendChild(message);

  const container = document.getElementById('custom-time');
  container.textContent = '';
  const valueEl = document.createElement('span');
  valueEl.className = 'zmanit-value num';
  valueEl.textContent = '--:--';
  container.appendChild(valueEl);

  DAILY_ZMAN_IDS.forEach(id => displayZmanCard(id, null, new Date()));
  clearNextZman();
}

// שורת "תווית קטנה + ערך גדול", כדי שהשעה תהיה האלמנט הדומיננטי ולא
// המילה שלפניה.
function buildSunRow(label, value) {
  const row = document.createElement('div');
  row.className = 'sun-row';

  const labelEl = document.createElement('span');
  labelEl.className = 'sun-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'sun-value num';
  valueEl.textContent = value;

  row.appendChild(labelEl);
  row.appendChild(valueEl);
  return row;
}

function displaySunTimes(now, sunrise, sunset) {
  const sunriseStr = formatHM(sunrise);
  const sunsetStr = formatHM(sunset);

  const isDay = now >= sunrise && now < sunset;
  const first = isDay ? ['זריחה', sunriseStr] : ['שקיעה', sunsetStr];
  const second = isDay ? ['שקיעה', sunsetStr] : ['זריחה', sunriseStr];

  const container = document.getElementById('sun-times');
  container.textContent = '';
  container.appendChild(buildSunRow(first[0], first[1]));
  container.appendChild(buildSunRow(second[0], second[1]));
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
  const iconName = zmanType === 'יום' ? 'i-sun' : 'i-moon';

  const container = document.getElementById('custom-time');
  container.textContent = '';

  const valueEl = document.createElement('span');
  valueEl.className = 'zmanit-value num';
  valueEl.textContent = zmanDisplay;
  container.appendChild(valueEl);

  const typeEl = document.createElement('span');
  typeEl.className = 'zman-type';
  typeEl.appendChild(createIcon(iconName));
  typeEl.appendChild(document.createTextNode(zmanType));

  const lengthEl = document.createElement('span');
  lengthEl.className = 'zman-length';
  lengthEl.textContent = `(משך שעה זמנית: ${zmanMinutesLength} דקות)`;

  container.appendChild(typeEl);
  container.appendChild(lengthEl);

  applyTheme(zmanType);
}

// ============================================================
// ערכת נושא
// ------------------------------------------------------------
// שלושה מצבים: אוטומטי (לפי הזריחה והשקיעה במיקום בפועל), בהיר וכהה.
// ההעדפה נשמרת מקומית. עד שמתקבל המיקום נשארת הערכה ש-app-init.js קבע
// לפי prefers-color-scheme.
// ============================================================
const THEME_KEY = 'zmanim:theme';
const THEME_MODES = ['auto', 'day', 'night'];

const THEME_UI = {
  auto: { icon: 'i-theme-auto', label: 'אוטומטית (לפי השעה)' },
  day: { icon: 'i-sun', label: 'בהירה' },
  night: { icon: 'i-moon', label: 'כהה' }
};

// צבע סרגל המערכת בדפדפני מובייל - חייב להתאים לראש הגרדיאנט של הערכה.
const THEME_COLORS = { day: '#cdeefd', night: '#0f2027' };

const themeState = {
  preference: 'auto',
  // הערכה הנגזרת מהשמש. null כל עוד לא התקבל מיקום.
  automatic: null
};

function readThemePreference() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return THEME_MODES.indexOf(stored) === -1 ? 'auto' : stored;
  } catch (error) {
    return 'auto';
  }
}

function writeThemePreference(preference) {
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch (error) {
    // localStorage עשוי להיות חסום - ההעדפה פשוט לא תישמר בין הפעלות.
  }
}

function resolvedTheme() {
  if (themeState.preference !== 'auto') return themeState.preference;
  if (themeState.automatic !== null) return themeState.automatic;
  // עדיין אין מיקום: משאירים את מה ש-app-init.js קבע, בלי הבהוב מיותר.
  return document.documentElement.classList.contains('night') ? 'night' : 'day';
}

function renderTheme() {
  const theme = resolvedTheme();
  const root = document.documentElement;

  root.classList.remove('day', 'night');
  root.classList.add(theme);

  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);

  const button = document.getElementById('theme-button');
  const iconUse = document.getElementById('theme-icon');
  if (button && iconUse) {
    const ui = THEME_UI[themeState.preference];
    iconUse.setAttribute('href', '#' + ui.icon);
    button.setAttribute('aria-label', `ערכת נושא: ${ui.label}. לחצו להחלפה`);
    button.setAttribute('title', `ערכת נושא: ${ui.label}`);
  }
}

function applyTheme(zmanType) {
  themeState.automatic = zmanType === 'יום' ? 'day' : 'night';
  renderTheme();
}

function initThemeButton() {
  themeState.preference = readThemePreference();
  renderTheme();

  const button = document.getElementById('theme-button');
  if (!button) return;

  button.addEventListener('click', () => {
    const nextIndex = (THEME_MODES.indexOf(themeState.preference) + 1) % THEME_MODES.length;
    themeState.preference = THEME_MODES[nextIndex];
    writeThemePreference(themeState.preference);
    renderTheme();
  });
}

function formatHM(date) {
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

// מציג זמן בקוביית זמן בודדת, ומסמן קוביות שהזמן שלהן כבר עבר היום (class 'past').
function displayZmanCard(id, date, now) {
  const valueEl = document.getElementById(id);
  if (!valueEl) return;
  const card = valueEl.closest('.zman-card');

  if (!isValidDate(date)) {
    valueEl.textContent = '--:--';
    if (card) card.classList.remove('past');
    return;
  }

  valueEl.textContent = formatHM(date);
  if (card) card.classList.toggle('past', now >= date);
}

// זמנים הלכתיים המבוססים על שעה זמנית של היום (שיטת הגר"א - זריחה עד שקיעה),
// בהתאם לחישוב הקיים ל"שעה זמנית" ביום. עלות השחר ומשיכיר מחושבים ב"דקות זמניות"
// (יחסיות לאורך היום), לא בדקות קבועות - 72 דקות זמניות = 72/60 = 1.2 שעות זמניות
// ("שעה וחמישית"), ושוות לדקות קבועות רק בשוויון יום ולילה (equinox).
function computeDailyZmanim(sunrise, sunset) {
  if (!isValidDate(sunrise) || !isValidDate(sunset) || sunset <= sunrise) return null;

  const shaaZmanitMs = (sunset - sunrise) / 12;

  return {
    alotHashachar: new Date(sunrise.getTime() - 1.2 * shaaZmanitMs),
    misheyakir: new Date(sunrise.getTime() - (5 / 6) * shaaZmanitMs),
    sofZmanShema: new Date(sunrise.getTime() + 3 * shaaZmanitMs),
    sofZmanTefila: new Date(sunrise.getTime() + 4 * shaaZmanitMs),
    minchaGedola: new Date(sunrise.getTime() + 6.5 * shaaZmanitMs),
    plagHamincha: new Date(sunrise.getTime() + 10.75 * shaaZmanitMs),
    // צאת הכוכבים בדקות קבועות אחרי השקיעה (מנהג ישראל), ולעומתו שיטת
    // רבנו תם - 72 דקות זמניות, בבואה מדויקת של עלות השחר שלמעלה.
    tzeitHakochavim: new Date(sunset.getTime() + TZEIT_MINUTES_AFTER_SUNSET * 60000),
    tzeitRabbeinuTam: new Date(sunset.getTime() + 1.2 * shaaZmanitMs)
  };
}

// חצות הלילה (nadir) של SunCalc לתאריך נתון תמיד נופל 12 שעות לפני הצהריים
// האסטרונומיים של אותו תאריך לועזי - כלומר "היום" מקבל את חצות הלילה שכבר עבר
// בבוקרו, לא את זה של הלילה הקרוב. לכן בוחרים, מתוך אתמול/היום/מחר, את הערך
// הקרוב ביותר לזמן הנוכחי - זהו תמיד חצות הלילה הרלוונטי בפועל.
function pickClosestDate(now, candidates) {
  return candidates.filter(isValidDate).reduce(
    (best, candidate) => (best === null || Math.abs(candidate - now) < Math.abs(best - now)) ? candidate : best,
    null
  );
}

function displayDailyZmanim(now, times, prevTimes, nextTimes) {
  const daily = computeDailyZmanim(times.sunrise, times.sunset);
  const chatzotNight = pickClosestDate(now, [prevTimes.nadir, times.nadir, nextTimes.nadir]);

  if (!daily) {
    DAILY_ZMAN_IDS.forEach(id => displayZmanCard(id, null, now));
    clearNextZman();
    return;
  }

  const cardZmanim = [
    ['alot-hashachar', daily.alotHashachar],
    ['misheyakir', daily.misheyakir],
    ['sof-zman-shema', daily.sofZmanShema],
    ['sof-zman-tefila', daily.sofZmanTefila],
    ['chatzot-day', times.solarNoon],
    ['mincha-gedola', daily.minchaGedola],
    ['plag-hamincha', daily.plagHamincha],
    ['tzeit-hakochavim', daily.tzeitHakochavim],
    ['tzeit-rabbeinu-tam', daily.tzeitRabbeinuTam],
    ['chatzot-night', chatzotNight]
  ];

  cardZmanim.forEach(([id, date]) => displayZmanCard(id, date, now));

  // הנץ והשקיעה נכללים במועמדים לזמן הבא אף שאין להם קוביה משלהם -
  // הם הזמנים המשמעותיים ביותר בחלקי היום שבהם אין זמן הלכתי קרוב יותר.
  updateNextZman(now, cardZmanim.concat([
    ['sunrise', times.sunrise],
    ['sunset', times.sunset]
  ]));
}

// ============================================================
// "הזמן הבא"
// ============================================================

// הכרטיס שיש להדגיש עבור מפתח נתון. הנץ ושקיעה ממופים לקוביית
// "זריחה ושקיעה", שהיא המקום שבו הם באמת מוצגים.
function nextZmanTarget(key) {
  if (key === 'sunrise' || key === 'sunset') {
    return document.querySelector('.time-box.left');
  }
  const valueEl = document.getElementById(key);
  return valueEl ? valueEl.closest('.zman-card') : null;
}

function highlightNextZman(key) {
  document.querySelectorAll('.next').forEach(el => el.classList.remove('next'));
  const target = key === null ? null : nextZmanTarget(key);
  if (target) target.classList.add('next');
}

function formatCountdown(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return 'עוד פחות מדקה';

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  // "דקה" אחת נאמרת בלי המספר ובלי מקף ("שעה ודקה"), בשונה מריבוי ("שעה ו-12 דקות").
  const minutesText = minutes === 1 ? 'דקה' : `${minutes} דקות`;

  if (hours === 0) return `בעוד ${minutesText}`;

  const hoursText = hours === 1 ? 'שעה' : (hours === 2 ? 'שעתיים' : `${hours} שעות`);
  if (minutes === 0) return `בעוד ${hoursText}`;
  return `בעוד ${hoursText} ${minutes === 1 ? 'ודקה' : 'ו-' + minutesText}`;
}

function clearNextZman() {
  const section = document.getElementById('next-zman');
  if (section) section.hidden = true;
  highlightNextZman(null);
}

function updateNextZman(now, candidates) {
  const section = document.getElementById('next-zman');
  if (!section) return;

  let bestKey = null;
  let bestDate = null;

  for (const [key, date] of candidates) {
    if (!isValidDate(date) || date <= now) continue;
    if (bestDate === null || date < bestDate) {
      bestKey = key;
      bestDate = date;
    }
  }

  if (bestKey === null) {
    clearNextZman();
    return;
  }

  section.hidden = false;
  document.getElementById('next-zman-name').textContent = ZMAN_LABELS[bestKey] || '';
  document.getElementById('next-zman-time').textContent = formatHM(bestDate);
  document.getElementById('next-zman-countdown').textContent = formatCountdown(bestDate - now);
  highlightNextZman(bestKey);
}

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

// זווית (bearing) גיאוגרפית ראשונית ממיקום נתון למקום המקדש, על פני מעגל גדול (great circle).
function getTempleMountBearing(latitude, longitude) {
  const phi1 = toRad(latitude);
  const phi2 = toRad(FOUNDATION_STONE_POSITION.latitude);
  const deltaLambda = toRad(FOUNDATION_STONE_POSITION.longitude - longitude);

  const theta = Math.atan2(
    Math.sin(deltaLambda) * Math.cos(phi2),
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)
  );

  return (toDeg(theta) + 360) % 360;
}

// מרחק זוויתי שמתחתיו נחשב שהמכשיר כבר מכוון למקום המקדש.
const COMPASS_ALIGNED_DEGREES = 5;

// מסובבים את החץ כך שיצביע תמיד לכיוון מקום המקדש: אם יש כיוון מכשיר חי (ממצפן/מגנטומטר),
// מפצים על הסיבוב של המכשיר עצמו; אחרת מציגים את הזווית הגיאוגרפית הסטטית בלבד.
function updateCompassNeedle() {
  const arrow = document.getElementById('compass-arrow');
  if (!arrow || state.latitude === null || state.longitude === null) return;

  const bearing = getTempleMountBearing(state.latitude, state.longitude);
  const rotation = deviceHeading === null ? bearing : (bearing - deviceHeading + 360) % 360;
  arrow.style.transform = `rotate(${rotation}deg)`;

  updateCompassReadout(bearing);
}

// המספר הגדול בכרטיס הוא האזימוט למקום המקדש - נתון קבוע למיקום נתון, שאינו
// משתנה כשמסובבים את המכשיר (וכך צריך להיות: זה הערך שמצמידים למצפן
// פיזי). לכן במצפן החי נדרשת קריאה נפרדת שכן מתעדכנת: כמה לסובב ולאן.
function updateCompassReadout(bearing) {
  const readout = document.getElementById('compass-live-readout');
  const compass = document.querySelector('.compass');
  if (!readout) return;

  if (deviceHeading === null) {
    readout.hidden = true;
    if (compass) compass.classList.remove('aligned');
    return;
  }

  // ההפרש הקצר ביותר בטווח -180..180: חיובי = לסובב עם כיוון השעון (ימינה).
  const delta = ((bearing - deviceHeading + 540) % 360) - 180;
  const aligned = Math.abs(delta) <= COMPASS_ALIGNED_DEGREES;

  readout.hidden = false;
  readout.classList.toggle('aligned', aligned);
  if (compass) compass.classList.toggle('aligned', aligned);

  readout.textContent = aligned
    ? 'אתם פונים לכיוון מקום המקדש'
    : `סובבו ${Math.round(Math.abs(delta))}° ${delta > 0 ? 'ימינה' : 'שמאלה'}`;
}

function displayCompassCard(latitude, longitude) {
  const degreesEl = document.getElementById('compass-degrees');
  if (!degreesEl) return;

  const bearing = getTempleMountBearing(latitude, longitude);
  degreesEl.textContent = `${bearing.toFixed(1)}°`;
  updateCompassNeedle();
}

function supportsDeviceOrientation() {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

// ב-iOS (Safari) requestPermission חייב להיקרא ישירות בתגובה למחוות משתמש (לחיצה),
// ולכן אי אפשר להפעיל את המצפן החי אוטומטית בטעינת הדף.
function needsOrientationPermission() {
  return supportsDeviceOrientation() && typeof DeviceOrientationEvent.requestPermission === 'function';
}

function setCompassStatus(text) {
  const statusEl = document.getElementById('compass-live-status');
  if (statusEl) statusEl.textContent = text;
}

function handleOrientationEvent(event) {
  let heading = null;

  if (typeof event.webkitCompassHeading === 'number' && !Number.isNaN(event.webkitCompassHeading)) {
    // iOS Safari: כיוון מצפן מגנטי אמיתי, כבר מחושב יחסית לצפון.
    heading = event.webkitCompassHeading;
  } else if (event.absolute && typeof event.alpha === 'number') {
    // Android/Chrome: alpha=0 פונה צפון, וגדל נגד כיוון השעון - לכן הופכים.
    heading = 360 - event.alpha;
  } else {
    // אין נתון כיוון מהימן ביחס לצפון אמיתי (לדוגמה alpha יחסי בלבד) - מתעלמים.
    return;
  }

  deviceHeading = ((heading % 360) + 360) % 360;
  updateCompassNeedle();
}

function startLiveCompass() {
  window.addEventListener('deviceorientationabsolute', handleOrientationEvent);
  window.addEventListener('deviceorientation', handleOrientationEvent);

  setCompassStatus('מצפן חי פעיל');
  const hint = document.getElementById('compass-hint');
  if (hint) hint.textContent = 'החץ עוקב אחרי כיוון המכשיר בזמן אמת - סובבו את הטלפון עד שהחץ יצביע כלפי מעלה';
  const button = document.getElementById('compass-live-toggle');
  if (button) button.hidden = true;
}

function initCompassLiveToggle() {
  const button = document.getElementById('compass-live-toggle');
  if (!button) return;

  if (!supportsDeviceOrientation()) {
    button.hidden = true;
    return;
  }

  button.addEventListener('click', () => {
    if (needsOrientationPermission()) {
      DeviceOrientationEvent.requestPermission()
        .then(response => {
          if (response === 'granted') {
            startLiveCompass();
          } else {
            setCompassStatus('ההרשאה לחיישן הכיוון נדחתה - מוצג כיוון גיאוגרפי בלבד');
          }
        })
        .catch(() => {
          setCompassStatus('לא ניתן להפעיל את חיישן הכיוון במכשיר הזה');
        });
    } else {
      startLiveCompass();
    }
  });
}

// העומר משתנה בשקיעה ולא בחצות - ה-Intl Hebrew calendar מחשב תאריך עברי לפי חצות
// אזרחי, ולכן אחרי השקיעה מתקדמים ליום הלועזי הבא כדי לקבל את היום העברי ההלכתי הנכון.
function getEffectiveOmerDate(now, todaySunset) {
  if (isValidDate(todaySunset) && now >= todaySunset) {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
  return now;
}

function getOmerDay(now, todaySunset) {
  const effectiveDate = getEffectiveOmerDate(now, todaySunset);
  const { day, month } = getHebrewDateParts(effectiveDate);

  // startsWith כדי לצמצם רגישות לשינויי כתיב בין מנועי Intl (למשל "סיון"/"סיוון").
  if (month.startsWith('ניס') && day >= 16) return day - 15;
  if (month.startsWith('איי')) return day + 15;
  if (month.startsWith('סיו') && day <= 5) return day + 44;
  return null;
}

function displayOmerCard(now, todaySunset) {
  const section = document.getElementById('omer-section');
  const countEl = document.getElementById('omer-count');
  const detailEl = document.getElementById('omer-detail');
  if (!section || !countEl) return;

  const omerDay = getOmerDay(now, todaySunset);
  if (omerDay === null) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  countEl.textContent = `היום ${gematria(omerDay)} בעומר`;

  if (detailEl) {
    const weeks = Math.floor((omerDay - 1) / 7);
    const days = (omerDay - 1) % 7;
    detailEl.textContent = weeks > 0
      ? `${gematria(weeks)} שבוע${weeks > 1 ? 'ות' : ''}${days > 0 ? ' ו' + gematria(days) + ' ימים' : ''}`
      : '';
  }
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

function getHebrewDateParts(date) {
  const formatter = new Intl.DateTimeFormat('he-u-ca-hebrew', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const parts = formatter.formatToParts(date);
  return {
    day: parseInt(parts.find(p => p.type === 'day').value),
    month: parts.find(p => p.type === 'month').value,
    year: parseInt(parts.find(p => p.type === 'year').value)
  };
}

function getFormattedHebrewDate(date) {
  const { day, month, year } = getHebrewDateParts(date);
  return `${gematria(day)} ב${month} ${gematria(year % 1000)}`;
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
  document.getElementById('date-bar-text').textContent = `${gregorian} | ${hebrew}`;
}

function initMenu() {
  const menuToggle = document.getElementById('menu-toggle');
  const menuClose = document.querySelector('.menu-close');
  const sideMenu = document.getElementById('side-menu');
  const overlay = document.querySelector('.overlay');

  function setMenuOpen(open) {
    sideMenu.classList.toggle('active', open);
    overlay.classList.toggle('active', open);

    sideMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuToggle.setAttribute('aria-label', open ? 'סגירת התפריט' : 'פתיחת התפריט');

    // החזרת המיקוד: בפתיחה לכפתור הסגירה, ובסגירה לכפתור שממנו נפתח
    // התפריט - אחרת משתמש מקלדת "מאבד" את מקומו בדף.
    if (open) {
      menuClose.focus();
    } else if (document.activeElement && sideMenu.contains(document.activeElement)) {
      menuToggle.focus();
    }
  }

  menuToggle.addEventListener('click', () => setMenuOpen(!sideMenu.classList.contains('active')));
  menuClose.addEventListener('click', () => setMenuOpen(false));
  overlay.addEventListener('click', () => setMenuOpen(false));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sideMenu.classList.contains('active')) {
      setMenuOpen(false);
    }
  });

  document.querySelector('.menu-item.active a').addEventListener('click', event => {
    event.preventDefault();
    setMenuOpen(false);
  });
}

function initRefreshButton() {
  const button = document.querySelector('.refresh-button');
  button.addEventListener('click', () => {
    button.disabled = true;

    // מנקים את כל מטמוני ה-Service Worker לפני הרענון, כדי שהכפתור תמיד יביא
    // גרסה טרייה של כל הקבצים - גם script.js/style.css, שמוגשים כרגיל לפי
    // stale-while-revalidate ובלי ניקוי היו מתעדכנים בפועל רק ברענון שני.
    const clearCaches = 'caches' in window
      ? caches.keys().then(names => Promise.all(names.map(name => caches.delete(name))))
      : Promise.resolve();

    clearCaches
      .catch(() => {})
      .then(() => {
        setTimeout(() => window.location.reload(), 500);
      });
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

  displayCompassCard(state.latitude, state.longitude);
  displayOmerCard(now, times.sunset);

  if (!hasSunEvents(times)) {
    showSunUnavailable();
    return;
  }

  displaySunTimes(now, times.sunrise, times.sunset);
  displayZmanitTime(now, times.sunrise, times.sunset, prevTimes.sunset, nextTimes.sunrise);
  displayDailyZmanim(now, times, prevTimes, nextTimes);
}

function init() {
  updateDateBar();
  updateCurrentTime();
  startLiveUpdates();
  initThemeButton();
  initMenu();
  initRefreshButton();
  initCompassLiveToggle();
  requestLocation();
}

window.addEventListener('load', init);
