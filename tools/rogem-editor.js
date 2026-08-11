'use strict';

// עורך רוג'ום - כלי מקומי בלבד. ראה את ההערה בראש rogem-editor.html.

// MAX_TITLE ו-MAX_BODY מוגדרים כבר ב-rogem.js, שנטען לפני הקובץ הזה -
// הגדרה חוזרת שלהם כאן הייתה שגיאת redeclaration שמפילה את כל העורך.

// הקובץ הקיים, אם נטען. משמש לכפתור "העתקת הקובץ המלא".
let currentFile = null;

const els = {
  title: document.getElementById('title'),
  date: document.getElementById('date'),
  body: document.getElementById('body'),
  titleCounter: document.getElementById('title-counter'),
  bodyCounter: document.getElementById('body-counter'),
  schedule: document.getElementById('schedule'),
  preview: document.getElementById('preview'),
  output: document.getElementById('output'),
  status: document.getElementById('status')
};

// ---------- עזרים ----------

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// מזהה יציב הנגזר מהתאריך ומהכותרת. הוא המפתח לזיכרון "מה כבר נקרא",
// ולכן אין לשנות אותו אחרי שרעיון פורסם.
function slugify(title) {
  const map = {
    'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
    'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm',
    'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p', 'ף': 'p',
    'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r', 'ש': 'sh', 'ת': 't'
  };

  return title
    .trim()
    .split('')
    .map(ch => {
      if (map[ch]) return map[ch];
      if (/[a-zA-Z0-9]/.test(ch)) return ch.toLowerCase();
      if (/\s/.test(ch)) return '-';
      return '';
    })
    .join('')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function setStatus(message, isError) {
  els.status.textContent = message;
  els.status.classList.toggle('error', !!isError);
}

function copyToClipboard(text) {
  // clipboard API אינו זמין ב-file://, ולכן יש נפילה חזרה לבחירת הטקסט.
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  els.output.select();
  return Promise.reject(new Error('no-clipboard'));
}

// ---------- הרעיון הנוכחי ----------

function currentIdea() {
  const date = els.date.value || todayIso();
  const title = els.title.value.trim();

  return {
    id: `${date}-${slugify(title) || 'idea'}`,
    title: title,
    date: date,
    hebrewDate: null,
    body: els.body.value.trim()
  };
}

// ---------- תצוגה מקדימה ----------

function updatePreview() {
  const idea = currentIdea();
  els.preview.textContent = '';

  // buildCard מגיע מ-rogem.js, כך שהתצוגה כאן היא הכרטיס האמיתי.
  els.preview.appendChild(buildCard({
    id: idea.id,
    title: idea.title || 'שם הרעיון',
    date: idea.date,
    hebrewDate: null,
    body: idea.body || 'גוף הרעיון יופיע כאן.'
  }));
}

function updateCounters() {
  const titleLen = els.title.value.trim().length;
  const bodyLen = els.body.value.trim().length;

  els.titleCounter.textContent = `${titleLen} / ${MAX_TITLE}`;
  els.titleCounter.classList.toggle('over', titleLen > MAX_TITLE);

  els.bodyCounter.textContent = `${bodyLen} / ${MAX_BODY}`;
  els.bodyCounter.classList.toggle('over', bodyLen > MAX_BODY);
}

// רעיון עתידי לא יוצג באפליקציה עד שיגיע יומו - ולכן הסימון כאן מפורש,
// כדי שלא ייווצר הרושם שהדחיפה נכשלה.
function updateSchedule() {
  const value = els.date.value;
  if (!value) {
    els.schedule.textContent = '';
    return;
  }

  const parts = value.split('-').map(Number);
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target - today) / 86400000);

  if (days > 0) {
    els.schedule.textContent = days === 1
      ? 'יפורסם מחר — עד אז לא יוצג באפליקציה.'
      : `יפורסם בעוד ${days} ימים — עד אז לא יוצג באפליקציה.`;
  } else if (days === 0) {
    els.schedule.textContent = 'יפורסם היום.';
  } else {
    els.schedule.textContent = '';
  }
}

function refresh() {
  updateCounters();
  updateSchedule();
  updatePreview();
}

// ---------- ולידציה ----------

function validate(idea) {
  const problems = [];
  if (!idea.title) problems.push('חסר שם לרעיון');
  if (!idea.body) problems.push('גוף הרעיון ריק');
  if (idea.title.length > MAX_TITLE) problems.push(`השם ארוך מ-${MAX_TITLE} תווים`);
  if (idea.body.length > MAX_BODY) problems.push(`הגוף ארוך מ-${MAX_BODY} תווים`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(idea.date)) problems.push('תאריך לא תקין');
  return problems;
}

// ---------- פעולות ----------

function copyEntry() {
  const idea = currentIdea();
  const problems = validate(idea);
  if (problems.length) {
    setStatus(problems.join(' · '), true);
    return;
  }

  const json = JSON.stringify(idea, null, 6);
  els.output.value = json;
  copyToClipboard(json)
    .then(() => setStatus('הרשומה הועתקה. אפשר להדביק אותה בראש מערך ideas.'))
    .catch(() => setStatus('העתקה אוטומטית נחסמה - הטקסט מסומן למטה, אפשר להעתיק ידנית.', true));
}

function copyFullFile() {
  const idea = currentIdea();
  const problems = validate(idea);
  if (problems.length) {
    setStatus(problems.join(' · '), true);
    return;
  }

  if (!currentFile) {
    setStatus('הקובץ הקיים לא נטען. לוחצים "טעינת rogem.json" קודם.', true);
    return;
  }

  // בדיקת מזהה כפול: שני רעיונות עם אותו id היו מבלבלים את זיכרון הקריאה.
  if (currentFile.ideas.some(existing => existing.id === idea.id)) {
    setStatus(`כבר קיים רעיון עם המזהה ${idea.id} - כדאי לשנות מעט את השם.`, true);
    return;
  }

  const merged = {
    version: currentFile.version || 1,
    ideas: [idea].concat(currentFile.ideas)
  };

  const json = JSON.stringify(merged, null, 2) + '\n';
  els.output.value = json;
  copyToClipboard(json)
    .then(() => setStatus(`הקובץ המלא הועתק (${merged.ideas.length} רעיונות). מדביקים ל-rogem.json ושומרים.`))
    .catch(() => setStatus('העתקה אוטומטית נחסמה - הטקסט מסומן למטה, אפשר להעתיק ידנית.', true));
}

function loadExistingFile() {
  fetch('../rogem.json', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(data => {
      currentFile = {
        version: data.version || 1,
        ideas: Array.isArray(data.ideas) ? data.ideas : []
      };
      setStatus(`נטענו ${currentFile.ideas.length} רעיונות מהקובץ הקיים.`);
    })
    .catch(() => {
      // ב-file:// הדפדפן חוסם fetch מקומי; אז מדביקים ידנית.
      const pasted = prompt('לא ניתן לקרוא את rogem.json מהדפדפן (פתיחה מ-file://).\nאפשר להדביק כאן את תוכן הקובץ הקיים:');
      if (!pasted) {
        setStatus('הטעינה בוטלה.', true);
        return;
      }
      try {
        const data = JSON.parse(pasted);
        currentFile = {
          version: data.version || 1,
          ideas: Array.isArray(data.ideas) ? data.ideas : []
        };
        setStatus(`נטענו ${currentFile.ideas.length} רעיונות מהטקסט שהודבק.`);
      } catch (error) {
        setStatus('הטקסט שהודבק אינו JSON תקין.', true);
      }
    });
}

function toggleTheme() {
  const root = document.documentElement;
  const isNight = root.classList.contains('night');
  root.classList.remove('day', 'night');
  root.classList.add(isNight ? 'day' : 'night');
}

// ---------- אתחול ----------

els.date.value = todayIso();
['input', 'change'].forEach(event => {
  els.title.addEventListener(event, refresh);
  els.body.addEventListener(event, refresh);
  els.date.addEventListener(event, refresh);
});

document.getElementById('copy-entry').addEventListener('click', copyEntry);
document.getElementById('copy-file').addEventListener('click', copyFullFile);
document.getElementById('load-file').addEventListener('click', loadExistingFile);
document.getElementById('toggle-theme').addEventListener('click', toggleTheme);

refresh();
// טעינה אוטומטית כשמריצים משרת מקומי; ב-file:// היא תיכשל בשקט והמשתמש
// ילחץ על הכפתור כשירצה.
fetch('../rogem.json', { cache: 'no-store' })
  .then(response => response.ok ? response.json() : null)
  .then(data => {
    if (!data) return;
    currentFile = { version: data.version || 1, ideas: data.ideas || [] };
  })
  .catch(() => {});
