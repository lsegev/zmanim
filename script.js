function updateCurrentTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  document.getElementById('current-time').textContent = timeString;
}

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(handleLocation, tryIPFallback);
} else {
  tryIPFallback();
}

function tryIPFallback() {
  console.log('מנסה לקבל מיקום מ-IP...');
  fetch("https://ipapi.co/json/")
    .then(res => res.json())
    .then(data => {
      console.log('מיקום מ-IP:', data);
      const position = {
        coords: {
          latitude: data.latitude,
          longitude: data.longitude
        }
      };
      handleLocation(position);
    })
    .catch(error => {
      console.log('שגיאה בקבלת מיקום מ-IP:', error);
      // מיקום ברירת מחדל - ירושלים
      const defaultPosition = {
        coords: {
          latitude: 31.7683,
          longitude: 35.2137
        }
      };
      handleLocation(defaultPosition);
    });
}

function handleLocation(position) {
  const { latitude, longitude } = position.coords;
  window.latitude = latitude;
  window.longitude = longitude;
  const now = new Date();

  const times = SunCalc.getTimes(now, latitude, longitude);
  const prevDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const prevTimes = SunCalc.getTimes(prevDay, latitude, longitude);
  const nextTimes = SunCalc.getTimes(nextDay, latitude, longitude);

  window.sunTimes = times;
  displaySunTimes(now, times.sunrise, times.sunset);
  displayZmanitTime(now, times.sunrise, times.sunset, prevTimes.sunset, nextTimes.sunrise);
}

function handleError(error) {
  console.log('שגיאה בקבלת מיקום:', error);
  // נסה לקבל מיקום מ-IP
  tryIPFallback();
}

function displaySunTimes(now, sunrise, sunset) {
  const sunriseStr = sunrise.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const sunsetStr = sunset.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  const isDay = now >= sunrise && now < sunset;

  const html = isDay
    ? `זריחה: ${sunriseStr}<br>שקיעה: ${sunsetStr}`
    : `שקיעה: ${sunsetStr}<br>זריחה: ${sunriseStr}`;

  document.getElementById('sun-times').innerHTML = html;
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

  const zmanDuration = zmanEnd - zmanStart;
  const zmanitHourMs = zmanDuration / 12;
  const elapsed = now - zmanStart;
  const zmanFloat = elapsed / zmanitHourMs;

  const zmanHours = Math.floor(zmanFloat);
  const zmanMinutes = Math.floor((zmanFloat - zmanHours) * 60);
  const zmanDisplay = `${String(zmanHours).padStart(2, '0')}:${String(zmanMinutes).padStart(2, '0')}`;
  const zmanMinutesLength = Math.round(zmanitHourMs / 60000);
  const icon = zmanType === 'יום' ? '☀️' : '🌙';

  const html = `
    ${zmanDisplay}<br>
    <span class="zman-type"><span class="icon">${icon}</span>${zmanType}</span>
    <span class="zman-length">(משך שעה זמנית: ${zmanMinutesLength} דקות)</span>
  `;

  document.getElementById('custom-time').innerHTML = html;
  applyTheme(zmanType);
}

function applyTheme(zmanType) {
  document.body.classList.remove('day', 'night');
  document.body.classList.add(zmanType === 'יום' ? 'day' : 'night');
}

function gematria(num) {
  const letters = {
    1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט',
    10: 'י', 20: 'כ', 30: 'ל', 40: 'מ', 50: 'נ', 60: 'ס', 70: 'ע', 80: 'פ', 90: 'צ',
    100: 'ק', 200: 'ר', 300: 'ש', 400: 'ת'
  };
  const special = {15: 'טו', 16: 'טז'};
  if (special[num]) return special[num];
  let result = '';
  const parts = [400,300,200,100,90,80,70,60,50,40,30,20,10,9,8,7,6,5,4,3,2,1];
  for (let i of parts) {
    while (num >= i) {
      result += letters[i];
      num -= i;
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
window.addEventListener('load', updateDateBar);

function initMenu() {
  const menuToggle = document.querySelector('.menu-toggle');
  const menuClose = document.querySelector('.menu-close');
  const sideMenu = document.querySelector('.side-menu');
  const overlay = document.querySelector('.overlay');

  function toggleMenu() {
    sideMenu.classList.toggle('active');
    overlay.classList.toggle('active');
  }

  window.closeMenu = function() {
    sideMenu.classList.remove('active');
    overlay.classList.remove('active');
  }

  menuToggle.addEventListener('click', toggleMenu);
  menuClose.addEventListener('click', toggleMenu);
  overlay.addEventListener('click', toggleMenu);
}

function init() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      position => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        fetchSunTimes(lat, lon).then(sunTimes => {
          window.sunTimes = sunTimes;
          updateCustomTime(sunTimes.sunrise, sunTimes.sunset);
        });
      },
      error => {
        console.error("שגיאה בקבלת מיקום", error);
      }
    );
  } else {
    console.error("מיקום גאוגרפי אינו נתמך בדפדפן.");
  }

  updateDateBar();
  updateCurrentTime();
  startLiveUpdates();
  initMenu();
}

function startLiveUpdates() {
  updateAll();
  setInterval(updateAll, 1000);
}

function updateAll() {
  updateCurrentTime();
  updateDateBar();
  if (window.sunTimes) {
    const now = new Date();
    const prevDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const prevTimes = SunCalc.getTimes(prevDay, window.latitude, window.longitude);
    const nextTimes = SunCalc.getTimes(nextDay, window.latitude, window.longitude);
    displayZmanitTime(now, window.sunTimes.sunrise, window.sunTimes.sunset, prevTimes.sunset, nextTimes.sunrise);
  }
}

function refreshPage() {
  const button = document.querySelector('.refresh-button');
  button.style.transform = 'rotate(360deg)';
  setTimeout(() => {
    window.location.reload();
  }, 500);
}

window.onload = init;
