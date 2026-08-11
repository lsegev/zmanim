'use strict';

// עמוד רוג'ום: אוסף של רעיונות תורניים קצרים, כרטיס לכל רעיון.
// הנתונים מגיעים מ-rogem.json שנפרס יחד עם היישומון - אין שרת ואין בסיס
// נתונים, בדיוק כמו שאר האפליקציה.

const READ_KEY = 'rogem:read';
const MAX_BODY = 600;
const MAX_TITLE = 40;

// כמה זמן כרטיס צריך להיות גלוי לפני שהוא נחשב "נקרא". גלילה מהירה על פני
// כמה כרטיסים לא אמורה לסמן את כולם.
const READ_DELAY_MS = 1500;

const state = {
  ideas: [],
  index: 0,
  // נדלק בזמן גלילה יזומה, כדי שמאזין הגלילה לא יילחם בה. ראה goTo().
  scrolling: false,
  scrollingTimer: null
};

// ---------- זיכרון "מה כבר נקרא" ----------
// localStorage עשוי להיות חסום (מצב פרטי), ולכן כל גישה עטופה. הדף עובד
// גם בלי זיכרון - הוא פשוט ייפתח תמיד ברעיון החדש ביותר.

function loadReadIds() {
  try {
    const raw = localStorage.getItem(READ_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveReadIds(ids) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(ids));
  } catch (error) {
    // אין זיכרון - לא נורא, ההתנהגות פשוט לא תישמר בין ביקורים.
  }
}

function markAsRead(id) {
  const ids = loadReadIds();
  if (ids.includes(id)) return;
  ids.push(id);
  saveReadIds(ids);
  updateAllReadNotice();
}

// מזהים של רעיונות שכבר אינם בקובץ מסוננים, אחרת הרשימה תופחת בלי גבול
// ותשמור לנצח מזהים של רעיונות שנמחקו.
function pruneReadIds(ideas) {
  const existing = new Set(ideas.map(idea => idea.id));
  const kept = loadReadIds().filter(id => existing.has(id));
  saveReadIds(kept);
  return kept;
}

// ---------- טעינה וסינון ----------

// רעיון עם תאריך עתידי אינו מוצג כלל - זה מאפשר לכתוב רעיונות מראש,
// לדחוף אותם ב-deploy אחד, ולתת לכל אחד לצוץ מעצמו ביום שלו.
//
// הגבול הוא חצות אזרחי ולא צאת הכוכבים, בשונה מפס התאריך בדף הבית: צאת
// הכוכבים דורש את מיקום המשתמש, ורוג'ום אינו זקוק למיקום לשום דבר אחר.
// הפרסום הוא פעולה עורכית, לא הלכתית.
function isPublished(idea, today) {
  const date = parseIdeaDate(idea.date);
  return date !== null && date <= today;
}

// פירוק ידני ולא new Date(string): מחרוזת 'YYYY-MM-DD' מתפרשת ב-UTC לפי
// התקן, ולכן באזורי זמן שממזרח לגריניץ' היא הייתה נקראת כיום הקודם.
function parseIdeaDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  // דוחה תאריכים שאינם קיימים (למשל 2026-02-31, ש-Date היה "מגלגל" למרץ).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isValidIdea(idea) {
  return idea
    && typeof idea.id === 'string' && idea.id.trim() !== ''
    && typeof idea.title === 'string' && idea.title.trim() !== ''
    && typeof idea.body === 'string' && idea.body.trim() !== ''
    && parseIdeaDate(idea.date) !== null;
}

function loadIdeas() {
  // cache: 'no-store' מבטיח שרעיון חדש יופיע מיד: ה-Service Worker מגיש
  // נכסים לפי stale-while-revalidate, ובלי זה הביקור הראשון אחרי פרסום היה
  // מציג את הגרסה הישנה של הקובץ. אם אין רשת - נופלים למטמון, כך שהדף
  // ממשיך לעבוד גם offline.
  return fetch('rogem.json', { cache: 'no-store' })
    .catch(() => fetch('rogem.json'))
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(data => {
      const all = (data && Array.isArray(data.ideas)) ? data.ideas : [];
      const today = startOfToday();

      return all
        .filter(isValidIdea)
        .filter(idea => isPublished(idea, today))
        // מהחדש לישן: הרעיון החדש ביותר ראשון.
        .sort((a, b) => parseIdeaDate(b.date) - parseIdeaDate(a.date));
    });
}

// ---------- רינדור ----------

// הטקסט מגיע מקובץ שהבעלים כותב, אך הוא מוזרק כטקסט בלבד (createTextNode
// ו-textContent) ולעולם לא כ-HTML, כך שגם תו כמו < אינו יכול להפוך לתגית.
//
// גרשיים עבריים בגוף הטקסט הופכים ל-<q> ומקבלים עיצוב נבדל, כדי שאפשר
// יהיה לשלב ציטוט בתוך פסקה בלי מבנה נוסף בקובץ.
function renderParagraph(text) {
  const p = document.createElement('p');
  const pattern = /“([^”]+)”|"([^"]+)"/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      p.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const quote = document.createElement('q');
    quote.textContent = match[1] || match[2];
    p.appendChild(quote);
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    p.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  return p;
}

// hebrewDate ריק = לחשב מהתאריך הלועזי. מחרוזת = דריסה ידנית, למשל לרעיון
// שהוכן מראש ורוצים לכתוב לו ניסוח משלו.
function hebrewLabelFor(idea) {
  if (typeof idea.hebrewDate === 'string' && idea.hebrewDate.trim() !== '') {
    return idea.hebrewDate.trim();
  }
  const date = parseIdeaDate(idea.date);
  return date ? getFormattedHebrewDate(date) : '';
}

// משותף לעמוד ולעורך המקומי, כדי שהתצוגה המקדימה בעורך תהיה הכרטיס האמיתי
// ולא חיקוי שלו שיוכל להיסחף.
function buildCard(idea) {
  const card = document.createElement('article');
  card.className = 'rogem-card';
  card.dataset.id = idea.id;

  const date = document.createElement('p');
  date.className = 'rogem-date';
  date.textContent = hebrewLabelFor(idea);
  card.appendChild(date);

  const title = document.createElement('h2');
  title.className = 'rogem-title';
  title.textContent = idea.title;
  card.appendChild(title);

  const body = document.createElement('div');
  body.className = 'rogem-body';
  // שורה ריקה כפולה = פסקה חדשה.
  idea.body.split(/\n\s*\n/).forEach(chunk => {
    const text = chunk.trim();
    if (text) body.appendChild(renderParagraph(text));
  });
  card.appendChild(body);

  return card;
}

function renderDots(count) {
  const dots = document.getElementById('rogem-dots');
  dots.textContent = '';
  // נקודת מיקום לכל כרטיס. תפקידן ויזואלי בלבד - הניווט הנגיש הוא הכפתורים
  // משני הצדדים והגלילה עצמה, ולכן הן מוסתרות מקוראי מסך.
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('span');
    dot.className = 'rogem-dot';
    dots.appendChild(dot);
  }
  dots.setAttribute('aria-hidden', 'true');
}

function updateDots() {
  const dots = document.querySelectorAll('.rogem-dot');
  dots.forEach((dot, i) => dot.classList.toggle('current', i === state.index));
}

function updateNavButtons() {
  const prev = document.getElementById('rogem-prev');
  const next = document.getElementById('rogem-next');
  prev.disabled = state.index === 0;
  next.disabled = state.index >= state.ideas.length - 1;
}

function updateAllReadNotice() {
  const notice = document.getElementById('rogem-allread');
  if (!notice || state.ideas.length === 0) return;
  const read = loadReadIds();
  notice.hidden = !state.ideas.every(idea => read.includes(idea.id));
}

// ---------- ניווט ----------

function goTo(index, behavior) {
  const clamped = Math.max(0, Math.min(index, state.ideas.length - 1));
  const viewport = document.getElementById('rogem-viewport');
  const card = viewport.querySelectorAll('.rogem-card')[clamped];
  if (!card) return;

  state.index = clamped;

  // חוסם את מאזין הגלילה למשך האנימציה, כדי שלא יקרא מיקום ביניים
  // ויכתוב אינדקס שגוי על המצב שנקבע כאן.
  state.scrolling = true;
  clearTimeout(state.scrollingTimer);
  state.scrollingTimer = setTimeout(() => { state.scrolling = false; }, 500);

  // הגלילה מחושבת מהפרש המיקומים בפועל ולא מנוסחה על scrollLeft: ב-RTL
  // הדפדפנים חלוקים בציר המספרי של scrollLeft (חיובי, שלילי או הפוך),
  // אך ההפרש בין מיקום הכרטיס למיקום המכל נכון בכולם.
  //
  // scrollIntoView לא שימש כאן משתי סיבות: הוא גורר גם את הדף עצמו
  // כשהכרטיס גבוה מהמסך, ובחלק מהדפדפנים הוא אינו גולל מכל פנימי כלל.
  const delta = card.getBoundingClientRect().left - viewport.getBoundingClientRect().left;
  viewport.scrollTo({
    left: viewport.scrollLeft + delta,
    behavior: behavior || 'smooth'
  });

  updateDots();
  updateNavButtons();
}

function initNavigation() {
  document.getElementById('rogem-prev')
    .addEventListener('click', () => goTo(state.index - 1));
  document.getElementById('rogem-next')
    .addEventListener('click', () => goTo(state.index + 1));

  // בעברית החץ שמצביע ימינה מוביל אל מה שקודם בסדר הקריאה - כלומר אל
  // הרעיון החדש יותר, שיושב ראשון ברשימה.
  document.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') {
      goTo(state.index - 1);
    } else if (event.key === 'ArrowLeft') {
      goTo(state.index + 1);
    }
  });

  // גלילה ידנית (החלקה) מעדכנת את המצב בחזרה, אחרת הנקודות והכפתורים
  // היו מציגים כרטיס אחר ממה שרואים.
  const viewport = document.getElementById('rogem-viewport');
  let scrollTimer = null;
  viewport.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      // גלילה יזומה (כפתור/מקלדת) כבר עדכנה את המצב; קריאה חוזרת ממנה
      // הייתה קוראת מיקום ביניים באמצע האנימציה ומקלקלת את האינדקס.
      if (state.scrolling) return;

      const cards = Array.from(viewport.querySelectorAll('.rogem-card'));
      if (cards.length === 0) return;

      // הכרטיס שמרכזו הקרוב ביותר למרכז החלון הוא הנוכחי. getBoundingClientRect
      // מודד מול חלון התצוגה בפועל, ולכן הוא חף מהבדלי ציר scrollLeft ב-RTL.
      const viewportCenter = viewport.getBoundingClientRect().left + viewport.getBoundingClientRect().width / 2;
      let closest = 0;
      let minDistance = Infinity;
      cards.forEach((card, i) => {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - viewportCenter);
        if (distance < minDistance) {
          minDistance = distance;
          closest = i;
        }
      });

      state.index = closest;
      updateDots();
      updateNavButtons();
    }, 100);
  });
}

// כרטיס נחשב "נקרא" רק אחרי שהיה גלוי ברציפות, כדי שגלילה מהירה על פני
// האוסף לא תסמן את כולו כנקרא.
function initReadTracking() {
  if (!('IntersectionObserver' in window)) return;

  const timers = new Map();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const id = entry.target.dataset.id;
      if (entry.isIntersecting) {
        if (!timers.has(id)) {
          timers.set(id, setTimeout(() => {
            markAsRead(id);
            timers.delete(id);
          }, READ_DELAY_MS));
        }
      } else if (timers.has(id)) {
        clearTimeout(timers.get(id));
        timers.delete(id);
      }
    });
  }, { threshold: 0.6 });

  document.querySelectorAll('.rogem-card').forEach(card => observer.observe(card));
}

// ---------- אתחול ----------

function showStatus(message) {
  const status = document.getElementById('rogem-status');
  status.hidden = false;
  status.textContent = message;
}

// כרטיס הפתיחה: הרעיון החדש ביותר שעדיין לא נקרא. אם הכל נקרא - החדש
// ביותר בכלל, עם חיווי. כך אין מסך ריק ואין קריסה כשמסיימים את האוסף.
function firstUnreadIndex(ideas) {
  const read = loadReadIds();
  const index = ideas.findIndex(idea => !read.includes(idea.id));
  return index === -1 ? 0 : index;
}

function render(ideas) {
  state.ideas = ideas;

  const status = document.getElementById('rogem-status');
  const viewport = document.getElementById('rogem-viewport');
  const controls = document.getElementById('rogem-controls');
  const track = document.getElementById('rogem-track');

  if (ideas.length === 0) {
    showStatus('עוד לא נוספו רעיונות. בקרוב תימצא כאן האבן הראשונה.');
    return;
  }

  status.hidden = true;
  viewport.hidden = false;
  ideas.forEach(idea => track.appendChild(buildCard(idea)));

  // כרטיס בודד: אין בין מה לנווט, ולכן החצים והנקודות מיותרים.
  if (ideas.length > 1) {
    controls.hidden = false;
    renderDots(ideas.length);
  }

  pruneReadIds(ideas);
  state.index = firstUnreadIndex(ideas);
  updateDots();
  updateNavButtons();
  updateAllReadNotice();

  initNavigation();
  initReadTracking();

  // קפיצה מיידית לכרטיס הפתיחה, בלי אנימציה - אנימציה בטעינה הראשונה
  // הייתה נראית כמו תקלה. requestAnimationFrame מבטיח שהפריסה כבר חושבה.
  requestAnimationFrame(() => goTo(state.index, 'auto'));
}

function initRogem() {
  loadIdeas()
    .then(render)
    .catch(() => {
      showStatus('לא הצלחנו לטעון את הרעיונות. אפשר לנסות שוב מאוחר יותר.');
    });
}

// העורך המקומי (tools/rogem-editor.html) טוען את הקובץ הזה כדי להשתמש
// ב-buildCard - כך התצוגה המקדימה בעורך היא הכרטיס האמיתי ולא חיקוי שיוכל
// להיסחף. שם אין תפריט ואין #rogem-viewport, ולכן האתחול מדלג.
if (document.getElementById('rogem-viewport')) {
  initMenu();
  initRogem();
}
