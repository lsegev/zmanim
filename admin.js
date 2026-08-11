// דף הניהול של רוג'ום: הוספה, עריכה ומחיקה של רעיונות.
//
// מודול (type="module") כי הוא מייבא את ה-SDK הארוז מ-vendor/firebase.js.
// זה הדף היחיד שטוען את החבילה הכבדה הזו; העמוד הציבורי קורא דרך REST.
//
// חשוב: כל בדיקת הרשאה כאן היא חיווי למשתמש בלבד. מה שבאמת מגן הוא
// firestore.rules בשרת - גם מי שיערוך את הקוד הזה בדפדפן לא יצליח לכתוב.

import {
  initializeApp, getAuth, GoogleAuthProvider, signInWithPopup, signOut,
  onAuthStateChanged, getFirestore, collection, doc, addDoc, updateDoc,
  deleteDoc, getDocs, query, orderBy, serverTimestamp
} from './vendor/firebase.js';

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

// רשימת המורשים כאן היא לחיווי בלבד, והיא חייבת להישאר תואמת לרשימה
// ב-firestore.rules. הכתיבה נחסמת בשרת בכל מקרה.
const EDITORS = ['elsegev@gmail.com'];

const MAX_TITLE_LEN = 40;
const MAX_BODY_LEN = 600;

const els = {
  gate: document.getElementById('gate'),
  gateStatus: document.getElementById('gate-status'),
  gateActions: document.getElementById('gate-actions'),
  denied: document.getElementById('denied'),
  deniedText: document.getElementById('denied-text'),
  app: document.getElementById('app'),
  userEmail: document.getElementById('user-email'),
  formHeading: document.getElementById('form-heading'),
  title: document.getElementById('title'),
  date: document.getElementById('date'),
  body: document.getElementById('body'),
  titleCounter: document.getElementById('title-counter'),
  bodyCounter: document.getElementById('body-counter'),
  schedule: document.getElementById('schedule'),
  save: document.getElementById('save'),
  cancelEdit: document.getElementById('cancel-edit'),
  status: document.getElementById('status'),
  preview: document.getElementById('preview'),
  list: document.getElementById('list'),
  listEmpty: document.getElementById('list-empty'),
  count: document.getElementById('count')
};

// editingId ריק = הטופס במצב "רעיון חדש"; אחרת הוא מזהה המסמך הנערך.
let editingId = null;
let ideas = [];

// ---------- עזרים ----------

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function setStatus(message, kind) {
  els.status.textContent = message;
  els.status.classList.toggle('error', kind === 'error');
  els.status.classList.toggle('success', kind === 'success');
}

// ---------- טופס ----------

function currentDraft() {
  return {
    title: els.title.value.trim(),
    body: els.body.value.trim(),
    date: els.date.value || todayIso(),
    hebrewDate: null
  };
}

function updateCounters() {
  const titleLen = els.title.value.trim().length;
  const bodyLen = els.body.value.trim().length;

  els.titleCounter.textContent = `${titleLen} / ${MAX_TITLE_LEN}`;
  els.titleCounter.classList.toggle('over', titleLen > MAX_TITLE_LEN);

  els.bodyCounter.textContent = `${bodyLen} / ${MAX_BODY_LEN}`;
  els.bodyCounter.classList.toggle('over', bodyLen > MAX_BODY_LEN);
}

// רעיון בתאריך עתידי לא יופיע בעמוד הציבורי עד שיגיע יומו. הסימון מפורש
// כדי שלא ייווצר הרושם שהשמירה נכשלה.
function daysUntil(dateValue) {
  const parts = dateValue.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

function updateSchedule() {
  const value = els.date.value;
  if (!value) {
    els.schedule.textContent = '';
    return;
  }
  const days = daysUntil(value);
  if (days === 1) {
    els.schedule.textContent = 'יפורסם מחר — עד אז לא יוצג בעמוד.';
  } else if (days > 1) {
    els.schedule.textContent = `יפורסם בעוד ${days} ימים — עד אז לא יוצג בעמוד.`;
  } else if (days === 0) {
    els.schedule.textContent = 'יפורסם היום.';
  } else {
    els.schedule.textContent = '';
  }
}

// buildCard מגיע מ-rogem.js, ולכן התצוגה כאן היא הכרטיס האמיתי של העמוד
// ולא חיקוי שלו שיוכל להיסחף ממנו.
function updatePreview() {
  const draft = currentDraft();
  els.preview.textContent = '';
  els.preview.appendChild(buildCard({
    id: 'preview',
    title: draft.title || 'שם הרעיון',
    date: draft.date,
    hebrewDate: null,
    body: draft.body || 'גוף הרעיון יופיע כאן.'
  }));
}

function refreshForm() {
  updateCounters();
  updateSchedule();
  updatePreview();
}

function resetForm() {
  editingId = null;
  els.title.value = '';
  els.body.value = '';
  els.date.value = todayIso();
  els.formHeading.textContent = 'רעיון חדש';
  els.save.textContent = 'הוספת הרעיון';
  els.cancelEdit.hidden = true;
  refreshForm();
}

function startEditing(idea) {
  editingId = idea.id;
  els.title.value = idea.title;
  els.body.value = idea.body;
  els.date.value = idea.date;
  els.formHeading.textContent = 'עריכת רעיון';
  els.save.textContent = 'שמירת השינויים';
  els.cancelEdit.hidden = false;
  refreshForm();
  setStatus('');
  els.title.focus();
  els.formHeading.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function validate(draft) {
  const problems = [];
  if (!draft.title) problems.push('חסר שם לרעיון');
  if (!draft.body) problems.push('גוף הרעיון ריק');
  if (draft.title.length > MAX_TITLE_LEN) problems.push(`השם ארוך מ-${MAX_TITLE_LEN} תווים`);
  if (draft.body.length > MAX_BODY_LEN) problems.push(`הגוף ארוך מ-${MAX_BODY_LEN} תווים`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) problems.push('תאריך לא תקין');
  return problems;
}

// ---------- שמירה ----------

function save() {
  const draft = currentDraft();
  const problems = validate(draft);
  if (problems.length) {
    setStatus(problems.join(' · '), 'error');
    return;
  }

  els.save.disabled = true;
  setStatus('שומר…');

  const payload = {
    title: draft.title,
    body: draft.body,
    date: draft.date,
    hebrewDate: draft.hebrewDate,
    updatedAt: serverTimestamp(),
    authorEmail: auth.currentUser ? auth.currentUser.email : ''
  };

  const action = editingId
    ? updateDoc(doc(db, 'ideas', editingId), payload)
    : addDoc(collection(db, 'ideas'), Object.assign({ createdAt: serverTimestamp() }, payload));

  const wasEditing = !!editingId;

  action
    .then(() => {
      resetForm();
      setStatus(wasEditing ? 'הרעיון עודכן.' : 'הרעיון נוסף.', 'success');
      return loadList();
    })
    .catch(error => {
      setStatus(describeError(error), 'error');
    })
    .finally(() => {
      els.save.disabled = false;
    });
}

function remove(idea) {
  if (!window.confirm(`למחוק את "${idea.title}"? הפעולה אינה הפיכה.`)) return;

  setStatus('מוחק…');
  deleteDoc(doc(db, 'ideas', idea.id))
    .then(() => {
      // אם נמחק הרעיון שנערך כרגע, הטופס חייב לחזור למצב "חדש" - אחרת
      // שמירה הבאה תנסה לעדכן מסמך שכבר אינו קיים.
      if (editingId === idea.id) resetForm();
      setStatus('הרעיון נמחק.', 'success');
      return loadList();
    })
    .catch(error => setStatus(describeError(error), 'error'));
}

// הודעות שגיאה בעברית ובשפה של המשתמש, במקום קודי Firebase גולמיים.
function describeError(error) {
  const code = error && error.code ? error.code : '';
  if (code === 'permission-denied') {
    return 'השרת דחה את הפעולה: לחשבון הזה אין הרשאת עריכה.';
  }
  if (code === 'unavailable' || code === 'failed-precondition') {
    return 'אין חיבור לשרת. כדאי לנסות שוב בעוד רגע.';
  }
  return 'הפעולה נכשלה' + (code ? ` (${code})` : '') + '.';
}

// ---------- הרשימה ----------

function loadList() {
  return getDocs(query(collection(db, 'ideas'), orderBy('date', 'desc')))
    .then(snapshot => {
      ideas = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || '',
          body: data.body || '',
          date: data.date || '',
          hebrewDate: data.hebrewDate || null
        };
      });
      renderList();
    })
    .catch(error => setStatus(describeError(error), 'error'));
}

function renderList() {
  els.list.textContent = '';
  els.count.textContent = ideas.length ? `(${ideas.length})` : '';
  els.listEmpty.hidden = ideas.length > 0;

  ideas.forEach(idea => {
    const item = document.createElement('li');
    item.className = 'admin-item';

    const main = document.createElement('div');
    main.className = 'admin-item-main';

    const dateLine = document.createElement('p');
    dateLine.className = 'admin-item-date';
    // getFormattedHebrewDate מגיע מ-hebrew-date.js, המשותף לכל העמודים.
    const parsed = parseIdeaDate(idea.date);
    dateLine.textContent = parsed ? getFormattedHebrewDate(parsed) : idea.date;

    // רעיון מתוזמן עדיין אינו גלוי לציבור, ולכן הוא מסומן במפורש.
    if (daysUntil(idea.date) > 0) {
      const badge = document.createElement('span');
      badge.className = 'admin-badge';
      badge.textContent = 'מתוזמן';
      dateLine.appendChild(badge);
    }

    const title = document.createElement('p');
    title.className = 'admin-item-title';
    title.textContent = idea.title;

    const excerpt = document.createElement('p');
    excerpt.className = 'admin-item-excerpt';
    excerpt.textContent = idea.body.length > 90
      ? idea.body.slice(0, 90).replace(/\s+\S*$/, '') + '…'
      : idea.body;

    main.append(dateLine, title, excerpt);

    const actions = document.createElement('div');
    actions.className = 'admin-item-actions';

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-button admin-icon-button';
    edit.setAttribute('aria-label', `עריכת ${idea.title}`);
    edit.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-pencil" /></svg>';
    edit.addEventListener('click', () => startEditing(idea));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-button admin-icon-button danger';
    del.setAttribute('aria-label', `מחיקת ${idea.title}`);
    del.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-trash" /></svg>';
    del.addEventListener('click', () => remove(idea));

    actions.append(edit, del);
    item.append(main, actions);
    els.list.appendChild(item);
  });
}

// ---------- אימות ----------

function showGate(message, canSignIn) {
  els.gate.hidden = false;
  els.denied.hidden = true;
  els.app.hidden = true;
  els.gateStatus.textContent = message;
  els.gateActions.hidden = !canSignIn;
}

function showDenied(email) {
  els.gate.hidden = true;
  els.denied.hidden = false;
  els.app.hidden = true;
  els.deniedText.textContent = `החשבון ${email} אינו מורשה לערוך את רוג'ום.`;
}

function showApp(email) {
  els.gate.hidden = true;
  els.denied.hidden = true;
  els.app.hidden = false;
  els.userEmail.textContent = email;
}

function initAuth() {
  document.getElementById('sign-in').addEventListener('click', () => {
    els.gateStatus.textContent = 'נפתח חלון התחברות…';
    signInWithPopup(auth, new GoogleAuthProvider())
      .catch(error => {
        const code = error && error.code ? error.code : '';
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          showGate('ההתחברות בוטלה.', true);
        } else if (code === 'auth/popup-blocked') {
          showGate('הדפדפן חסם את חלון ההתחברות. יש לאפשר חלונות קופצים לאתר.', true);
        } else {
          showGate('ההתחברות נכשלה' + (code ? ` (${code})` : '') + '.', true);
        }
      });
  });

  const doSignOut = () => signOut(auth);
  document.getElementById('sign-out').addEventListener('click', doSignOut);
  document.getElementById('sign-out-denied').addEventListener('click', doSignOut);

  onAuthStateChanged(auth, user => {
    if (!user) {
      showGate('כדי לערוך את רוג\'ום צריך להתחבר.', true);
      return;
    }
    // הבדיקה כאן היא חיווי בלבד; האכיפה האמיתית ב-firestore.rules.
    if (!user.emailVerified || !EDITORS.includes(user.email)) {
      showDenied(user.email || 'לא ידוע');
      return;
    }
    showApp(user.email);
    resetForm();
    loadList();
  });
}

// ---------- אתחול ----------

['input', 'change'].forEach(event => {
  els.title.addEventListener(event, refreshForm);
  els.body.addEventListener(event, refreshForm);
  els.date.addEventListener(event, refreshForm);
});

els.save.addEventListener('click', save);
els.cancelEdit.addEventListener('click', () => {
  resetForm();
  setStatus('העריכה בוטלה.');
});

els.date.value = todayIso();
initAuth();
