'use strict';

// המרת תאריך עברי וגימטריה, משותף לדף הבית ולעמוד רוג'ום.
// הופרד מ-script.js מאותו נימוק שבגללו הופרד menu.js: עמוד רוג'ום צריך רק
// להציג תאריך עברי, ואין סיבה שיטען בשבילו את כל מנוע הזמנים (איתור מיקום,
// טיימרים, מצפן) - וגם כדי שלא ייווצר עותק שני של לוגיקת הגימטריה שיוכל
// להיסחף מהמקור.

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

  // סימון מספר בעברית: גרשיים לפני האות האחרונה כשיש כמה אותיות (כ"ו),
  // וגרש אחרי אות בודדת (ל׳). בלי הגרש הבודד נראה "ל באב" כמו מילה קטועה
  // ולא כמו תאריך.
  if (result.length > 1) {
    return result.slice(0, -1) + '"' + result.slice(-1);
  }
  if (result.length === 1) {
    return result + '׳';
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
