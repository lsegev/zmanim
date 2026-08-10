<div dir="rtl" style="text-align: right;">

# פרומפטים לייצור האייקון במחוללי AI

מסמך עזר לייצור וריאציות של אייקון **מיל** בכלים חיצוניים.
הגרסה הרשמית מיוצרת ב-`tools/make-icon.mjs`; הכלים כאן נועדו לחקירת כיוונים.

## הכלל החשוב: אל תבקש מ-AI לכתוב XVIII

אף מחולל תמונות לא מייצר ספרות רומיות אמינות — הוא יחזיר `XVIIII`, `XVll`
או ג'יבריש. **תייצר את האבן בלי כיתוב, ואז תוסיף את הספרה בוקטור.**

איזה כלי לאיזו מטרה:

| כלי | למה הוא טוב | מגבלה |
|---|---|---|
| **Recraft** | מייצא **SVG וקטורי אמיתי** — הכי מתאים לאייקון | סגנון קצת גנרי |
| **Ideogram** | הכי טוב בעולם בכיתוב קריא | ראסטר בלבד |
| **Midjourney** | האסתטיקה הכי יפה | הכי גרוע בטקסט |
| **DALL·E / Gemini** | הכי טוב בדיאלוג ותיקונים | פחות שליטה בסגנון |

---

## 1. הפרומפט הראשי — האבן בלי כיתוב

מתאים לכל הכלים. זה הפרומפט שמשחזר את העיצוב הנוכחי:

```
Flat vector app icon, square. An ancient Roman cylindrical milestone column
of pale sandstone with a rounded top, standing on a square stone base in the
Judean desert. A low golden sun sits on the horizon behind and to the left,
casting a long soft shadow from the column across the sand to the right.
Deep indigo sky above fading through warm amber at the horizon. Limited
palette: sandstone beige, golden amber, deep navy blue. Clean geometric
shapes, smooth gradients, centered composition, no outlines, minimal detail.
```

**Midjourney:** הוסף `--ar 1:1 --style raw --no text, letters, numbers, words, watermark, people`

**Recraft:** בחר style `Vector Illustration` ואז ייצא SVG.

## 2. וריאציה שטוחה — לקריאות בגדלים קטנים

```
Minimal flat app icon, square, no gradients. A pale cream Roman milestone
column with a rounded top, centered, silhouetted against a large flat amber
circle representing the sun, on a deep navy background. A darker navy band
at the bottom for the ground. Bold simple geometry, high contrast,
two-color palette plus cream, no texture, no text.
```

## 3. וריאציה ערב — צללית מוארת מאחור

```
App icon, square. Dark silhouette of a Roman milestone column with a rounded
top, backlit by a large setting sun directly behind it. Warm rim light
tracing the edges of the stone. Sky gradient from deep night indigo at the
top through violet to glowing amber at the horizon. Dramatic, serene,
minimal, flat vector style, no text.
```

## 4. פרומפט להוספת הספרה (Ideogram בלבד)

רק אם אתה מתעקש לקבל את הכיתוב מה-AI:

```
The Roman numeral "XVIII" carved deeply into pale sandstone, chiseled
serif capitals, sharp incised edges, soft directional shadow inside the
carving, straight-on view, flat lighting
```

⚠️ תבדוק תו-תו שיצאו בדיוק חמישה סימנים: X-V-I-I-I.

---

## אחרי הייצור — צ'קליסט

1. **ריבוע מדויק 512×512** — לא 1024×1024 חתוך, לא 1:1 מקורב
2. **בדיקת 48px** — תקטין ל-48 ותסתכל. אם האבן מתמזגת עם הרקע, תגדיל אותה
   ותחזק ניגודיות. זה הגודל שרוב המשתמשים באמת יראו
3. **safe zone ל-maskable** — אנדרואיד חותך לעיגול ברדיוס 40% מהמרכז. כל מה
   שחשוב חייב להיות בתוך העיגול הזה. תייצר גרסה שנייה שבה הציור מוקטן ל-78%
4. **בלי שקיפות** — הרקע חייב להיות אטום מקצה לקצה
5. **בלי טקסט קטן** — שם האפליקציה לא הולך על האייקון

## החזרה לוקטור

אם קיבלת ראסטר ואתה רוצה קובץ נקי:

- **Illustrator** → `Image Trace` → `Low Fidelity Photo` → `Expand`
- **Inkscape** → `Path > Trace Bitmap` → `Multiple scans: Colors` → 6-8 צבעים
- **[SVGcode](https://svgco.de)** — חינמי בדפדפן

ואז תדביק את הצורות לתוך `make-icon.mjs` כדי לקבל את כל הגדלים והגרסה
ה-maskable אוטומטית:

```bash
npm install sharp
node tools/make-icon.mjs --variant sundial --out .
```

</div>
