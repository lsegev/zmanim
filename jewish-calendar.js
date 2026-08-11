'use strict';

// חישובי לוח שנה עברי המשותפים לעמוד "תאריכים חשובים השבוע": מולד, ראש חודש,
// חלון ברכת הלבנה, וטבלת חגים/צומות/ימים ישראליים קבועים.
//
// זיהוי ראש חודש וחגים נשען על Intl.DateTimeFormat('he-u-ca-hebrew') (כמו
// hebrew-date.js) ולא על חישוב עצמאי של אורכי החודשים והשנה המעוברת - ה-ICU
// שבדפדפן כבר פותר את זה נכון, ואין טעם לשכפל אלגוריתם עיבור מורכב וטעון-שגיאות.
//
// מולד וברכת הלבנה כן דורשים חישוב עצמאי: הם תלויים בזמן מדויק בתוך היממה,
// שאין לו ביטוי ב-Intl. החישוב מבוסס על עוגן מאומת (ולא על נוסחת אפוכה עתיקה
// שחושבה ידנית וטעתה בבדיקה) - ראה הערה ליד ANCHOR_MOLAD_UTC.

// ---------- קבועי מולד ----------
// אורך החודש הממוצע (החלק המולד): 29 יום, 12 שעות ו-793 חלקים (1080 חלקים
// לשעה) - קבוע קלאסי המופיע בכל מקורות חישוב הלוח העברי, ומאומת כאן גם עצמאית:
// מחזור המטון של 19 שנה (235 חודשים) יוצא 6939.6896 יום - בדיוק הערך המוכר.
const CHALAKIM_PER_HOUR = 1080;
const CHALAKIM_PER_DAY = 24 * CHALAKIM_PER_HOUR;
const CHALAKIM_PER_MONTH = 765433;
const MS_PER_CHALAKIM = 86400000 / CHALAKIM_PER_DAY;
const MONTH_MS = CHALAKIM_PER_MONTH * MS_PER_CHALAKIM;

// עוגן מאומת: מולד תשרי תשפ"ו הוא יום שני, 22 בספטמבר 2025, בשעה 12:10:23.3
// (בקירוב) לפי שעון ישראל - מוצלב משני מקורות עצמאיים (טבלת מולדות מסורתית
// שמציינת "22 בספטמבר, 18 שעות ו-187 חלקים" ממוצאי שבת, ותוצאת חיפוש נפרדת
// שמצטטת "יום שני 22 בספטמבר, 12:10 (7 חלקים)"). נבחר עוגן מודרני שניתן
// לאימות במקום נוסחת אפוכה עתיקה (מולד תוהו, 3761 לפנה"ס) - חישוב ידני שלה
// כשל בבדיקה (הפרש של יום שלם) בגלל חשבון ימים פרוקטי על פני אלפי שנים.
const ANCHOR_YEAR = 5786;
const ANCHOR_MOLAD_UTC = Date.UTC(2025, 8, 22, 9, 10, 23, 333); // 12:10:23.333 שעון ישראל (UTC+3)

// ---------- שנה מעוברת ----------
// נוסחה מתמטית סטנדרטית ומוכרת (עצמאית מכל ספרייה קניינית): שנה year היא
// מעוברת אם ((7*year + 1) mod 19) < 7 - שקולה למחזור בן 19 שנה עם 7 מעוברות
// במיקומים 3, 6, 8, 11, 14, 17, 19.
function isHebrewLeapYear(year) {
  return (((7 * year) + 1) % 19 + 19) % 19 < 7;
}

// מספר החודשים בין תשרי של fromYear לתשרי של toYear (toYear >= fromYear).
function monthsBetweenTishrei(fromYear, toYear) {
  let months = 0;
  for (let y = fromYear; y < toYear; y++) {
    months += isHebrewLeapYear(y) ? 13 : 12;
  }
  return months;
}

// מולד תשרי של שנה עברית נתונה, כ-Date (UTC).
function moladTishrei(year) {
  const monthsDiff = year >= ANCHOR_YEAR
    ? monthsBetweenTishrei(ANCHOR_YEAR, year)
    : -monthsBetweenTishrei(year, ANCHOR_YEAR);
  return new Date(ANCHOR_MOLAD_UTC + monthsDiff * MONTH_MS);
}

// מולד חודש עברי כלשהו, monthsAfterTishrei חודשים אחרי תשרי של אותה שנה
// (0 = תשרי עצמו, 1 = חשוון/מרחשוון, וכן הלאה).
function moladOfMonth(year, monthsAfterTishrei) {
  return new Date(moladTishrei(year).getTime() + monthsAfterTishrei * MONTH_MS);
}

// ---------- זיהוי החודש העברי הנוכחי דרך Intl, והמרתו למולד ----------

// שמות החודשים אינם מושווים כמחרוזות גולמיות מ-Intl: ICU כותב חלק מהם ביותר
// מצורה אחת (סיוון/סיון, חשוון/חשון, מרחשוון), והגרש באדר א׳/ב׳ יכול להיות
// גרש עברי (U+05F3) או אפוסטרוף רגיל. השוואה ישירה נשברה בעבר בשקט - שם
// שלא הותאם החזיר null, וכל חודש סיוון נשאר בלי מולד ובלי שבועות.
//
// לכן כל שם עובר נרמול לצורה קנונית אחת לפני ההשוואה: מסירים גרשים ורווחים,
// ומכווצים וי"ו כפולה לאחת. 'סיוון' ו-'סיון' נעשים 'סיון', 'אדר א׳' נעשה
// 'אדרא'. הטבלאות והשוואות בקובץ עובדות כולן על הצורה המנורמלת.
function normalizeMonthName(name) {
  return String(name)
    .replace(/[׳'״"\s]/g, '')
    .replace(/וו/g, 'ו');
}

// סדר החודשים העבריים (שנה לא מעוברת). בשנה מעוברת אדר מוחלף בשני חודשים:
// אדר א' ואדר ב'. הערכים נשמרים מנורמלים, כדי שההשוואה תהיה בין שווים.
const MONTH_ORDER_REGULAR = ['תשרי', 'חשוון', 'כסלו', 'טבת', 'שבט', 'אדר', 'ניסן', 'אייר', 'סיוון', 'תמוז', 'אב', 'אלול'].map(normalizeMonthName);
const MONTH_ORDER_LEAP = ['תשרי', 'חשוון', 'כסלו', 'טבת', 'שבט', 'אדר א׳', 'אדר ב׳', 'ניסן', 'אייר', 'סיוון', 'תמוז', 'אב', 'אלול'].map(normalizeMonthName);

function monthsAfterTishreiFor(hebrewYear, hebrewMonthName) {
  const order = isHebrewLeapYear(hebrewYear) ? MONTH_ORDER_LEAP : MONTH_ORDER_REGULAR;
  const index = order.indexOf(normalizeMonthName(hebrewMonthName));
  return index === -1 ? null : index;
}


function hebrewPartsFor(date) {
  return getHebrewDateParts(date);
}

// מולד החודש העברי שבו נמצא civilDate, כ-Date (UTC). מזהה את החודש דרך
// Intl (שכבר פותר נכון עיבור ואורכי חודשים), ומחשב את המולד המדויק שלו.
function getCurrentMonthMolad(civilDate) {
  const { year, month } = hebrewPartsFor(civilDate);
  const monthsAfterTishrei = monthsAfterTishreiFor(year, month);
  if (monthsAfterTishrei === null) return null;
  return moladOfMonth(year, monthsAfterTishrei);
}

// ---------- ראש חודש ----------

// בודק אם civilDate הוא יום ראש חודש (1 בחודש העברי, או ל' בחודש הקודם -
// היום הראשון משני ימי ראש חודש כשהחודש הקודם מלא). בשני המקרים "month"
// המוחזר הוא שם החודש הנכנס (למשל "אלול"), לא החודש שממנו יוצאים - יום ל'
// באב הוא כבר ראש חודש אלול, לא "ראש חודש אב".
function getRoshChodeshInfo(civilDate) {
  const { day, month } = hebrewPartsFor(civilDate);
  if (day === 1) {
    // תשרי הוא ראש השנה ולא "ראש חודש" במובן הרגיל - יש לו רשומה משלו בטבלת החגים.
    if (month === 'תשרי') return null;
    return { day, month, isFirstOfTwo: false };
  }
  if (day === 30) {
    const nextDay = new Date(civilDate.getTime() + 86400000);
    const incomingMonth = hebrewPartsFor(nextDay).month;
    return { day, month: incomingMonth, isFirstOfTwo: true };
  }
  return null;
}

// ---------- ברכת הלבנה ----------
//
// תחילת הזמן, לפי המנהג הרווח:
//   ספרדים  - שבעה ימים מלאים אחרי המולד (השולחן ערוך, על פי הקבלה).
//   אשכנזים - שלושה ימים מלאים (72 שעות) אחרי המולד (הרמ"א והב"ח).
//
// שימו לב שזה הפוך מהאינטואיציה הנפוצה: דווקא הספרדים הם המחמירים כאן.
// (גרסה קודמת של הקובץ החליפה בין השניים.)
//
// סוף הזמן: מחצית הזמן שבין מולד לחודש הבא - מולד + מחצית אורך החודש
// הממוצע, כלומר כ-14 יום 18 שעות ו-22 דקות (שיטת המהרי"ל והרמ"א). יש דעה
// מקילה יותר (המחבר) המתירה עד ט"ו בחודש; כאן ננקטה המחמירה.
const HALF_MONTH_MS = MONTH_MS / 2;
const SEVEN_DAYS_MS = 7 * 86400000;
const THREE_DAYS_MS = 3 * 86400000;

// מברכים בלילה בלבד, ולכן תחילת הזמן מוזזת אל הערב שאחרי חלוף שלושת הימים
// (או שבעת הימים) - הרגע המדויק נופל לרוב באמצע היום, ואז אי אפשר לברך.
// הערב מקורב לשעה קבועה (19:00 שעון ישראל) ולא לשקיעה אמיתית: העמוד הזה
// אינו מבקש את מיקום המשתמש לשום דבר אחר (ראה ההערה בראש important-dates.js),
// וחישוב שקיעה היה גורר את כל מנוע המיקום בשביל שורה אחת. הכרטיס מציין שזו הערכה.
const EVENING_HOUR_ISRAEL = 19;

// שעון ישראל הוא UTC+2 בחורף ו-UTC+3 בקיץ. Intl יודע את המעבר, ולכן ההיסט
// נגזר ממנו ולא מקבוע - אחרת הערב היה זז בשעה חצי שנה בכל שנה.
function israelOffsetHours(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    timeZoneName: 'longOffset'
  }).formatToParts(date);
  const name = parts.find(p => p.type === 'timeZoneName').value; // "GMT+03:00"
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 2;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) + Number(match[3]) / 60);
}

// הערב (19:00 שעון ישראל) של היום האזרחי שבו חל instant, כ-Date.
function eveningAfter(instant) {
  // ההיסט נקרא פעמיים: פעם לפי רגע המולד כדי לדעת באיזה יום אזרחי בישראל
  // הוא חל, ושוב לפי הערב שחושב - כי הערב עצמו עשוי ליפול בצד השני של מעבר
  // שעון קיץ/חורף. בלי הקריאה השנייה, מולד בליל המעבר (למשל מולד כסלו
  // תשצ"א, 26.10.2030 בשעה 22:25) היה מניב 18:00 במקום 19:00.
  const dayOffset = israelOffsetHours(instant);
  const israelLocal = new Date(instant.getTime() + dayOffset * 3600000);

  const eveningOn = (year, month, day, offset) =>
    Date.UTC(year, month, day, EVENING_HOUR_ISRAEL - offset);

  const resolve = (year, month, day) => {
    const firstGuess = eveningOn(year, month, day, dayOffset);
    const actualOffset = israelOffsetHours(new Date(firstGuess));
    return eveningOn(year, month, day, actualOffset);
  };

  const sameDay = resolve(
    israelLocal.getUTCFullYear(),
    israelLocal.getUTCMonth(),
    israelLocal.getUTCDate()
  );
  if (sameDay > instant.getTime()) return new Date(sameDay);

  // מולד שחל אחרי 19:00 - הערב שלו כבר עבר, ולכן ממתינים לערב הבא.
  const nextDay = new Date(israelLocal.getTime() + 86400000);
  return new Date(resolve(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth(),
    nextDay.getUTCDate()
  ));
}

// מקבל מולד שכבר חושב (Date) ולא תאריך אזרחי - בשונה מ-getBirkatHalevanaWindow,
// אינו עובר דרך getCurrentMonthMolad שוב. חשוב כי הרגע האזרחי של מולד מסוים
// לפעמים עדיין שייך, לפי Intl, לחודש העברי הקודם (למשל מולד אלול יכול לחול
// ב-ל' באב) - קריאה חוזרת הייתה מחזירה בטעות את מולד החודש הקודם.
function getBirkatHalevanaWindowForMolad(molad) {
  if (!molad) return null;
  return {
    molad,
    sephardicStart: eveningAfter(new Date(molad.getTime() + SEVEN_DAYS_MS)),
    ashkenazicStart: eveningAfter(new Date(molad.getTime() + THREE_DAYS_MS)),
    end: new Date(molad.getTime() + HALF_MONTH_MS)
  };
}

function getBirkatHalevanaWindow(civilDate) {
  return getBirkatHalevanaWindowForMolad(getCurrentMonthMolad(civilDate));
}

// ---------- טבלת חגים, צומות וימים ישראליים (תאריך עברי קבוע) ----------

const FIXED_DATES = [
  { month: 'תשרי', day: 1, name: 'ראש השנה', category: 'holiday', span: 2 },
  { month: 'תשרי', day: 3, name: 'צום גדליה', category: 'fast' },
  { month: 'תשרי', day: 10, name: 'יום הכיפורים', category: 'holiday' },
  { month: 'תשרי', day: 15, name: 'סוכות', category: 'holiday', span: 7 },
  { month: 'תשרי', day: 21, name: 'הושענא רבה', category: 'holiday' },
  { month: 'תשרי', day: 22, name: 'שמיני עצרת', category: 'holiday' },
  { month: 'תשרי', day: 23, name: 'שמחת תורה', category: 'holiday' },
  { month: 'כסלו', day: 25, name: 'חנוכה', category: 'holiday', span: 8 },
  { month: 'טבת', day: 10, name: 'עשרה בטבת', category: 'fast' },
  { month: 'טבת', day: 10, name: 'יום הקדיש הכללי', category: 'israeli' },
  { month: 'שבט', day: 15, name: "ט\"ו בשבט", category: 'holiday' },
  { month: 'אדר', day: 13, name: 'תענית אסתר', category: 'fast' },
  { month: 'אדר', day: 14, name: 'פורים', category: 'holiday' },
  { month: 'אדר', day: 15, name: 'שושן פורים', category: 'holiday' },
  { month: 'אדר א׳', day: 14, name: 'פורים קטן', category: 'holiday' },
  { month: 'אדר ב׳', day: 13, name: 'תענית אסתר', category: 'fast' },
  { month: 'אדר ב׳', day: 14, name: 'פורים', category: 'holiday' },
  { month: 'אדר ב׳', day: 15, name: 'שושן פורים', category: 'holiday' },
  { month: 'ניסן', day: 15, name: 'פסח', category: 'holiday', span: 7 },
  { month: 'ניסן', day: 27, name: 'יום השואה', category: 'israeli' },
  { month: 'אייר', day: 4, name: 'יום הזיכרון', category: 'israeli' },
  { month: 'אייר', day: 5, name: 'יום העצמאות', category: 'israeli' },
  { month: 'אייר', day: 18, name: "ל\"ג בעומר", category: 'holiday' },
  { month: 'אייר', day: 28, name: 'יום ירושלים', category: 'israeli' },
  { month: 'סיוון', day: 6, name: 'שבועות', category: 'holiday', span: 2 },
  { month: 'תמוז', day: 17, name: 'צום י"ז בתמוז', category: 'fast' },
  { month: 'אב', day: 9, name: "תשעה באב", category: 'fast' },
  { month: 'אב', day: 15, name: "ט\"ו באב", category: 'holiday' }
];

// שמות סידוריים לימות חג: "יום ראשון של...", "יום שני של..." וכן הלאה, עד
// שמונה (אורך החג הארוך ביותר בטבלה - חנוכה).
const ORDINAL_DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'שמיני'];

// המרווח הגדול ביותר שיש לסרוק אחורה כדי למצוא את תחילת החג שהיום שייך אליו.
const MAX_SPAN = FIXED_DATES.reduce((max, entry) => Math.max(max, entry.span || 1), 1);

// מחזיר את כל הרשומות הקבועות שחלות ב-civilDate הנתון. יום עברי בודד יכול
// להתאים ליותר מרשומה אחת (למשל יום הקדיש הכללי חופף לעשרה בטבת, והיום
// השביעי של סוכות חופף להושענא רבה).
//
// חג בן כמה ימים אינו נפרש מראש למספרי ימים (25, 26, ... 32 בכסלו): חודש
// עברי הוא בן 29 או 30 יום, ולכן ימים כאלה פשוט לא היו נמצאים לעולם - כך
// שני הנרות האחרונים של חנוכה, שחלים ב-א׳-ב׳ בטבת, נעלמו בשקט. במקום זאת
// סורקים אחורה מהיום עצמו: לכל היסט אפשרי בודקים אם התאריך האזרחי שקדם לו
// הוא היום הראשון של חג, ואם כן - היום הנוכחי הוא היום ה-offset+1 שלו.
// כך גבול החודש נפתר על ידי Intl, שכבר יודע את אורכי החודשים לאשורם.
function getFixedDatesFor(civilDate) {
  const matches = [];

  for (let offset = 0; offset < MAX_SPAN; offset++) {
    const startDate = new Date(civilDate.getTime() - offset * 86400000);
    const parts = hebrewPartsFor(startDate);
    const startMonth = normalizeMonthName(parts.month);

    for (const entry of FIXED_DATES) {
      const span = entry.span || 1;
      if (offset >= span) continue;
      if (entry.day !== parts.day) continue;
      if (normalizeMonthName(entry.month) !== startMonth) continue;

      matches.push({
        month: entry.month,
        day: entry.day,
        name: entry.name,
        category: entry.category,
        dayLabel: span > 1 ? `יום ${ORDINAL_DAY_NAMES[offset]} של ${entry.name}` : entry.name,
        isFirstDay: offset === 0,
        span
      });
    }
  }

  return matches;
}

// ---------- API ----------

const JewishCalendar = {
  getHebrewDateParts: hebrewPartsFor,
  getRoshChodeshInfo,
  getFixedDatesFor,
  getCurrentMonthMolad,
  getBirkatHalevanaWindow,
  getBirkatHalevanaWindowForMolad,
  isHebrewLeapYear
};
