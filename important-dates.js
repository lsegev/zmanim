'use strict';

// עמוד "תאריכים חשובים השבוע": סורק את שבעת ימי השבוע הנוכחי (ראשון עד שבת,
// לפי השעון האזרחי) ומאתר אילו מהם הם ראש חודש, חג, צום או יום ישראלי -
// ומציג לצידם את מולד החודש הנוכחי וחלון ברכת הלבנה, אם הם רלוונטים לשבוע.
//
// "השבוע" מוגדר לפי השעון האזרחי (ראשון-שבת) ולא לפי גבול היממה ההלכתי:
// בשונה מזמני היום בדף הבית, כאן אין תלות במיקום המשתמש (אין זריחה/שקיעה
// מעורבות), ואין סיבה שלא להשתמש בהגדרת השבוע הפשוטה והצפויה.

const CATEGORY_LABELS = {
  holiday: 'חג',
  fast: 'צום',
  israeli: 'יום ישראלי'
};

const CATEGORY_ICONS = {
  holiday: 'i-calendar',
  fast: 'i-calendar',
  israeli: 'i-flag'
};

function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - result.getDay());
  return result;
}

// יום בשבוע קצר ('יום ה׳') ותאריך עברי בגימטריה ('ל' באב') בנפרד - בלי
// תאריך לועזי ובלי שנה: השנה חוזרת על עצמה בכל הכרטיסים באותו שבוע ורק
// מוסיפה רעש. השניים מוחזרים כשדות נפרדים כדי שהתצוגה תוכל לשים כל אחד
// בשורה משלו במקום מחרוזת אחת שנשברת באמצע.
function formatHebrewWeekdayDate(date) {
  return {
    weekday: date.toLocaleDateString('he-IL', { weekday: 'short' }),
    hebrewDate: (function () {
      const { day, month } = getHebrewDateParts(date);
      return gematria(day) + ' ב' + month;
    }())
  };
}

// זמן בתוך היממה, בשעון ישראל. כל התאריכים בעמוד עבריים, אבל השעה עצמה
// נשארת מספרית - אין לה ניסוח עברי מקובל.
function formatTimeOfDay(date) {
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem'
  });
}

// תאריך עברי מלא לרגע נתון: יום בשבוע, תאריך עברי בגימטריה, ושעה.
// אין כאן תאריך לועזי בכלל - כל העמוד מדבר בלוח העברי.
//
// התאריך העברי נגזר מהיום האזרחי בישראל שבו חל הרגע, ולא מאזור הזמן של
// המשתמש: מולד או תחילת זמן הם רגעים בשעון ישראל, ובנייד בחו"ל התאריך היה
// יכול לזוז ביום.
function formatHebrewDateTime(date) {
  if (!date) return null;
  const israelDay = israelCivilDate(date);
  const { day, month } = getHebrewDateParts(israelDay);
  return {
    weekday: date.toLocaleDateString('he-IL', { weekday: 'short', timeZone: 'Asia/Jerusalem' }),
    hebrewDate: gematria(day) + ' ב' + month,
    time: formatTimeOfDay(date)
  };
}

// חצות היום האזרחי בישראל שבו חל instant - נקודה בטוחה לגזירת התאריך העברי
// בלי תלות באזור הזמן של המכשיר.
function israelCivilDate(instant) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(instant);
  const get = type => Number(parts.find(p => p.type === type).value);
  return new Date(get('year'), get('month') - 1, get('day'), 12);
}

function buildDateCard(entry) {
  const card = document.createElement('div');
  card.className = 'zman-card important-date-card';

  const heading = document.createElement('h4');
  const icon = document.createElement('svg');
  icon.setAttribute('class', 'icon');
  icon.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + entry.icon);
  icon.appendChild(use);
  heading.appendChild(icon);
  heading.appendChild(document.createTextNode(entry.title));
  card.appendChild(heading);

  const value = document.createElement('div');
  value.className = 'zman-value-datetime';
  const weekdayLine = document.createElement('span');
  weekdayLine.textContent = entry.dateLabel.weekday;
  const dateLine = document.createElement('span');
  dateLine.textContent = entry.dateLabel.hebrewDate;
  value.appendChild(weekdayLine);
  value.appendChild(document.createElement('br'));
  value.appendChild(dateLine);
  card.appendChild(value);

  if (entry.note) {
    const note = document.createElement('span');
    note.className = 'zman-note';
    note.textContent = entry.note;
    card.appendChild(note);
  }

  return card;
}

// אוסף את כל האירועים (ראש חודש, חגים/צומות/ימים ישראליים) שחלים בשבעת ימי
// השבוע החל מ-weekStart, ומאחד כפילויות (למשל שני ימי ראש חודש רצופים,
// או יום הקדיש הכללי שחל באותו יום כמו עשרה בטבת) לרשומה אחת לכל יום.
function collectWeekEntries(weekStart) {
  const entries = [];

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    const dateLabel = formatHebrewWeekdayDate(day);

    const roshChodesh = JewishCalendar.getRoshChodeshInfo(day);
    if (roshChodesh) {
      entries.push({
        title: 'ראש חודש ' + roshChodesh.month,
        icon: 'i-calendar',
        dateLabel,
        note: roshChodesh.isFirstOfTwo ? 'יום ראשון משני ימי ראש חודש' : null,
        sortDay: i
      });
    }

    const fixedMatches = JewishCalendar.getFixedDatesFor(day);
    for (const match of fixedMatches) {
      entries.push({
        title: match.dayLabel,
        icon: CATEGORY_ICONS[match.category] || 'i-calendar',
        dateLabel,
        note: CATEGORY_LABELS[match.category] || null,
        sortDay: i
      });
    }
  }

  return entries;
}

function renderWeekEntries(entries) {
  const container = document.getElementById('important-dates-list');
  const emptyNote = document.getElementById('important-dates-empty');

  // מסיר כרטיסים קודמים בלי לגעת בהודעת "אין תאריכים", שנשארת ראשונה ב-DOM.
  container.querySelectorAll('.important-date-card').forEach(el => el.remove());

  if (entries.length === 0) {
    emptyNote.hidden = false;
    return;
  }

  emptyNote.hidden = true;
  const grid = document.createElement('div');
  grid.className = 'zman-grid';
  for (const entry of entries) {
    grid.appendChild(buildDateCard(entry));
  }
  container.appendChild(grid);
}

// אוסף את כל מולדות החודשים העבריים השונים שנוגעים לשבוע, כל אחד יחד עם
// שם החודש שהוא שייך אליו.
//
// נבדק כל אחד משבעת ימי השבוע, ולא רק ראשון ושבת: מולד קודם לראש החודש שלו
// בכיומיים, ולכן הוא יכול לחול בשבוע שבו אף אחד מהימים אינו שייך עדיין
// לחודש הנכנס. דגימה של הקצוות בלבד החמיצה כך שלושה מולדות ב-2027 (אדר א׳,
// תמוז וכסלו) - החודש פשוט נפתח אחרי מוצאי השבת. לכן נבדק גם החודש שאחרי
// זה של היום האחרון, שהמולד שלו הוא המועמד האחרון שיכול ליפול בשבוע.
//
// שם החודש נלקח מהתאריך האזרחי ששימש למציאת המולד ולא מהרגע האזרחי של המולד
// עצמו: מולד יכול לחול בפועל בעוד היום הקודם עדיין יום ל' בחודש הקודם לפי
// הלוח (למשל מולד אלול שחל בעוד אנחנו עדיין ב-ל' באב) - re-derive מהמולד
// היה מחזיר בטעות את שם החודש הקודם.
function getDistinctMoladsForWeek(weekStart, weekEnd) {
  const candidates = [];

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    candidates.push({ anchor: day, molad: JewishCalendar.getCurrentMonthMolad(day) });
  }

  // החודש הבא: המולד שלו קודם לראש החודש, ולכן הוא עשוי לחול כבר השבוע
  // גם כשאף יום בשבוע אינו שייך אליו עדיין. נעגנים ביום שאחרי סוף השבוע
  // שכבר בוודאות בחודש הבא (ראש חודש לכל היותר יומיים אחרי סוף השבוע).
  const lastDay = new Date(weekEnd.getTime() - 86400000);
  for (const daysAhead of [1, 2, 3]) {
    const ahead = new Date(lastDay);
    ahead.setDate(ahead.getDate() + daysAhead);
    candidates.push({ anchor: ahead, molad: JewishCalendar.getCurrentMonthMolad(ahead) });
  }

  const seen = new Set();
  return candidates
    .filter(c => c.molad)
    .filter(c => {
      const key = c.molad.getTime();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(c => ({ molad: c.molad, month: JewishCalendar.getHebrewDateParts(c.anchor).month }));
}

// כותב תאריך עברי + שעה לתוך אלמנט ערך, בשלוש שורות (יום בשבוע / תאריך
// עברי / שעה) - באותה צורה שבה בנויים כרטיסי ראש חודש.
function fillHebrewDateTime(element, date) {
  const label = formatHebrewDateTime(date);
  element.textContent = '';
  const lines = [label.weekday, label.hebrewDate, label.time];
  lines.forEach((line, i) => {
    if (i > 0) element.appendChild(document.createElement('br'));
    const span = document.createElement('span');
    span.textContent = line;
    element.appendChild(span);
  });
}

function renderMolad(weekStart, weekEnd) {
  const section = document.getElementById('molad-section');

  const relevant = getDistinctMoladsForWeek(weekStart, weekEnd)
    .find(c => c.molad >= weekStart && c.molad < weekEnd);

  if (!relevant) {
    section.hidden = true;
    return;
  }

  document.getElementById('molad-month-name').textContent = relevant.month;
  fillHebrewDateTime(document.getElementById('molad-time'), relevant.molad);
  section.hidden = false;
}

// כל אחד משלושת זמני ברכת הלבנה מוצג רק אם הוא עצמו חל השבוע.
//
// קודם הוצג החלון כולו ברגע שהיה חפיפה כלשהי עם השבוע, וכך "סוף הזמן" של
// עוד שבועיים או "תחילת הזמן" של השבוע הבא הופיעו ככרטיס - מידע שאינו נוגע
// לשבוע הנוכחי ורק מבלבל. עכשיו כרטיס שאינו חל השבוע פשוט מוסתר, ואם אף
// אחד מהשלושה אינו חל - הסעיף כולו נעלם.
function renderBirkatHalevana(weekStart, weekEnd) {
  const section = document.getElementById('birkat-halevana-section');

  const inWeek = date => date >= weekStart && date < weekEnd;

  // כל המולדות הרלוונטיים לשבוע, לא רק הראשון: תחילת הזמן של חודש אחד
  // וסוף הזמן של החודש הקודם יכולים ליפול באותו שבוע.
  const windows = getDistinctMoladsForWeek(weekStart, weekEnd)
    .map(c => JewishCalendar.getBirkatHalevanaWindowForMolad(c.molad))
    .filter(w => w);

  const rows = [
    { id: 'bh-row-sephardic', valueId: 'bh-start-sephardic', pick: w => w.sephardicStart },
    { id: 'bh-row-ashkenazic', valueId: 'bh-start-ashkenazic', pick: w => w.ashkenazicStart },
    { id: 'bh-row-end', valueId: 'bh-end', pick: w => w.end }
  ];

  let anyShown = false;
  for (const row of rows) {
    const match = windows.map(row.pick).find(inWeek);
    const card = document.getElementById(row.id);
    if (match) {
      fillHebrewDateTime(document.getElementById(row.valueId), match);
      card.hidden = false;
      anyShown = true;
    } else {
      card.hidden = true;
    }
  }

  section.hidden = !anyShown;
}

// טווח התאריך העברי של השבוע, בגימטריה. אם השבוע כולו בתוך אותו חודש עברי
// מוצג החודש פעם אחת בלבד ('כ"ו–ב' באלול'); אם הוא חוצה ראש חודש מוצג החודש
// גם בתחילת הטווח וגם בסופו ('ל' באב – ו' באלול'), כדי שלא יראה כאילו כל
// השבוע באותו חודש.
function formatHebrewWeekRange(startDate, endDate) {
  const start = getHebrewDateParts(startDate);
  const end = getHebrewDateParts(endDate);

  if (start.month === end.month) {
    return gematria(start.day) + '–' + gematria(end.day) + ' ב' + start.month;
  }
  return gematria(start.day) + ' ב' + start.month + ' – ' + gematria(end.day) + ' ב' + end.month;
}

// כותרת השבוע בתאריך עברי בלבד, בלי הטווח הלועזי שהיה כאן קודם: כל שאר
// העמוד מדבר בלוח העברי, והתאריך הלועזי רק הכפיל את אותו מידע.
function renderWeekRange(weekStart, weekEnd) {
  const lastDay = new Date(weekEnd);
  lastDay.setDate(lastDay.getDate() - 1);
  const label = document.getElementById('week-range');
  label.textContent = 'השבוע: ' + formatHebrewWeekRange(weekStart, lastDay);
}

function init() {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  renderWeekRange(weekStart, weekEnd);
  renderWeekEntries(collectWeekEntries(weekStart));
  renderMolad(weekStart, weekEnd);
  renderBirkatHalevana(weekStart, weekEnd);
}

initMenu();
init();
