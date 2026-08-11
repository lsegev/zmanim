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

function formatCivilDate(date) {
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
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

function formatDateTime(date) {
  if (!date) return '--';
  // weekday קצר ('יום ה׳' ולא 'יום חמישי') כדי שהערך לא יתפרש לשלוש שורות
  // בכרטיס - יש כאן גם תאריך וגם שעה, בשונה מכרטיסי הזמנים הרגילים.
  return date.toLocaleString('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
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

function renderMolad(weekStart, weekEnd) {
  const section = document.getElementById('molad-section');

  const relevant = getDistinctMoladsForWeek(weekStart, weekEnd)
    .find(c => c.molad >= weekStart && c.molad < weekEnd);

  if (!relevant) {
    section.hidden = true;
    return;
  }

  document.getElementById('molad-month-name').textContent = relevant.month;
  document.getElementById('molad-time').textContent = formatDateTime(relevant.molad);
  section.hidden = false;
}

// חלון ברכת הלבנה מוצג אם יש חפיפה בין השבוע הנוכחי לבין הטווח שבין תחילת
// הזמן (ספרדים, הכי מוקדם) לסוף הזמן - בודקים את כל החודשים הרלוונטיים
// לשבוע (ראו getDistinctMoladsForWeek) ומציגים את הראשון שחופף.
function renderBirkatHalevana(weekStart, weekEnd) {
  const section = document.getElementById('birkat-halevana-section');

  const candidateMolads = getDistinctMoladsForWeek(weekStart, weekEnd);
  const window_ = candidateMolads
    .map(c => JewishCalendar.getBirkatHalevanaWindowForMolad(c.molad))
    .find(w => w && w.end >= weekStart && w.sephardicStart < weekEnd);

  if (!window_) {
    section.hidden = true;
    return;
  }

  document.getElementById('bh-start-sephardic').textContent = formatDateTime(window_.sephardicStart);
  document.getElementById('bh-start-ashkenazic').textContent = formatDateTime(window_.ashkenazicStart);
  document.getElementById('bh-end').textContent = formatDateTime(window_.end);
  section.hidden = false;
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

function renderWeekRange(weekStart, weekEnd) {
  const lastDay = new Date(weekEnd);
  lastDay.setDate(lastDay.getDate() - 1);
  const label = document.getElementById('week-range');
  label.textContent = 'השבוע: ' + formatCivilDate(weekStart) + ' – ' + formatCivilDate(lastDay)
    + ' (' + formatHebrewWeekRange(weekStart, lastDay) + ')';
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
