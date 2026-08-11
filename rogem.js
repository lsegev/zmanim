'use strict';

// עמוד רוג'ום: אוסף של רעיונות תורניים קצרים, כרטיס לכל רעיון.
//
// הנתונים מגיעים מ-Firestore דרך ה-REST API (ראה firebase-config.js), כדי
// שרעיון חדש שנכתב בדף הניהול יופיע מיד ובלי פריסה מחדש. אחרי כל טעינה
// מוצלחת נשמר עותק ב-localStorage, וכך העמוד ממשיך לעבוד גם בלי רשת.

const READ_KEY = 'rogem:read';
const CACHE_KEY = 'rogem:cache';
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

// הרעיונות מגיעים מ-Firestore דרך ה-REST API, בלי SDK: האוסף פתוח לקריאה,
// ולכן די ב-fetch רגיל. חבילת ה-SDK שוקלת כחצי מגהבייט - יותר מכל שאר
// האפליקציה יחד - וזה מחיר לא סביר לעמוד שרק מציג כמה פסקאות. דף הניהול,
// שבו באמת צריך התחברות, הוא היחיד שטוען אותה.
//
// cache: 'no-store' מבטיח שרעיון חדש יופיע מיד ולא ייתפס במטמון ביניים.
function fetchIdeasFromFirestore() {
  return fetch(IDEAS_REST_URL, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(data => {
      // אוסף ריק מוחזר בלי המפתח documents כלל.
      const docs = (data && Array.isArray(data.documents)) ? data.documents : [];
      return docs
        .map(doc => ideaFromFields(doc.name.split('/').pop(), doc.fields))
        .filter(idea => idea !== null);
    });
}

// המטמון המקומי הוא מה שמאפשר לעמוד לעבוד גם בלי רשת, אחרי ביקור אחד
// מוצלח. הוא נשמר אחרי כל טעינה מוצלחת ונקרא רק כשהרשת נכשלה.
function cacheIdeas(ideas) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(ideas));
  } catch (error) {
    // אין מקום או שהאחסון חסום - לא נורא, פשוט לא יהיה גיבוי אופליין.
  }
}

function readCachedIdeas() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function loadIdeas() {
  return fetchIdeasFromFirestore()
    .then(ideas => {
      cacheIdeas(ideas);
      return ideas;
    })
    .catch(error => {
      // בלי רשת נופלים למטמון. אם גם הוא ריק - אין מה להציג, והשגיאה
      // ממשיכה הלאה כדי שתוצג הודעה ולא מסך ריק.
      const cached = readCachedIdeas();
      if (cached.length === 0) throw error;
      return cached;
    })
    .then(all => {
      const today = startOfToday();
      return all
        .filter(isValidIdea)
        .filter(idea => isPublished(idea, today))
        // מהחדש לישן: הרעיון החדש ביותר ראשון.
        .sort((a, b) => parseIdeaDate(b.date) - parseIdeaDate(a.date));
    });
}

// ---------- רינדור ----------

// הטקסט מגיע ממסד הנתונים, אך הוא מוזרק כטקסט בלבד (createTextNode
// ו-textContent) ולעולם לא כ-HTML, כך שגם תו כמו < אינו יכול להפוך לתגית.
//
// שני סימונים נתמכים בתוך פסקה:
//   "ציטוט"   - גרשיים (ישרים או מסולסלים) הופכים ל-<q>
//   *הדגשה*   - כוכביות הופכות ל-<strong>
//
// כוכבית בודדת שאינה עוטפת טקסט נשארת כפי שהיא, כדי שמי שכותב כוכבית
// רגילה בטקסט לא יקבל התנהגות מפתיעה.
// כל צורות הגרשיים שמקלדת עברית עשויה להפיק, כולל ההחלפה האוטומטית של
// iOS שהופכת " לגרשיים מסולסלים - ובעברית דווקא לצורה „…” (הפותח למטה).
// בלי הצורה הזו ציטוט שנכתב בנייד פשוט לא זוהה.
//
//   "…"   U+0022 - גרשיים ישרים
//   “…”   U+201C/U+201D - מסולסלים אנגליים
//   „…”   U+201E/U+201D - מסולסלים עבריים
//   «…»   U+00AB/U+00BB - מרכאות זווית
//
// הגרשיים העבריים ״ (U+05F4) אינם נתמכים בכוונה: אותו תו משמש בעברית
// לראשי תיבות (תנ״ך, ד״ר, צה״ל), ואי אפשר להבחין בינו לבין ציטוט בלי
// לנחש. משפט כמו "ד״ר וגם תנ״ך" היה נקרא כציטוט שמתחיל באמצע מילה
// ומסתיים באמצע מילה אחרת. מי שרוצה ציטוט ישתמש בגרשיים רגילים.
const QUOTE_PATTERN = /"([^"]+)"|[“„]([^”]+)”|«([^»]+)»/g;
const BOLD_PATTERN = /\*([^*\n]+)\*/g;

// הדגשה בלבד, ללא ציטוטים. משמש גם לתוכן שבתוך <q>, ולכן הוא מופרד:
// ציטוט בתוך ציטוט אינו נתמך ואינו נחוץ, אבל הדגשה בתוך ציטוט כן - פסוק
// שמצטטים בדרך כלל רוצים להדגיש בתוכו מילה או שתיים.
function appendWithBold(parent, text) {
  BOLD_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match;

  while ((match = BOLD_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const strong = document.createElement('strong');
    strong.textContent = match[1];
    parent.appendChild(strong);
    lastIndex = BOLD_PATTERN.lastIndex;
  }

  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function renderParagraph(text) {
  const p = document.createElement('p');
  QUOTE_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match;

  // קודם מפרקים לפי ציטוטים, ואז מחפשים הדגשה בכל קטע בנפרד - גם בתוך
  // הציטוט וגם מחוצה לו. סריקה שטוחה אחת הייתה מחמיצה הדגשה בתוך ציטוט,
  // כי תוכן ה-<q> נכתב כטקסט ולא נסרק שוב.
  while ((match = QUOTE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      appendWithBold(p, text.slice(lastIndex, match.index));
    }

    // רק אחת מקבוצות הלכידה מתמלאת, לפי סוג הגרשיים שנמצא בפועל.
    const inner = match.slice(1).find(group => group !== undefined);
    const quote = document.createElement('q');
    appendWithBold(quote, inner);
    p.appendChild(quote);

    lastIndex = QUOTE_PATTERN.lastIndex;
  }

  if (lastIndex < text.length) {
    appendWithBold(p, text.slice(lastIndex));
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

  // החצים עוקבים אחר המיקום הפיזי של הכרטיסים: החדש ביותר משמאל, ולכן
  // חץ ימינה מתקדם אל הישנים וחץ שמאלה חוזר אל החדשים.
  document.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') {
      goTo(state.index + 1);
    } else if (event.key === 'ArrowLeft') {
      goTo(state.index - 1);
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

// דף הניהול (admin.html) טוען את הקובץ הזה כדי להשתמש ב-buildCard ובעזרי
// התאריך - כך התצוגה המקדימה שם היא הכרטיס האמיתי ולא חיקוי שיוכל להיסחף.
// באותו דף אין תפריט ואין #rogem-viewport, ולכן האתחול מדלג.
if (document.getElementById('rogem-viewport')) {
  initMenu();
  initRogem();
}
