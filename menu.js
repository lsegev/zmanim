'use strict';

// התפריט הצדדי, משותף לכל עמודי היישומון.
// הופרד מ-script.js כדי שעמוד אודות לא ייאלץ לטעון את כל מנוע הזמנים
// (איתור מיקום, טיימרים, מצפן) רק כדי לפתוח תפריט - וכדי שלא תיווצר
// עותק שני של אותה לוגיקה שיוכל להיסחף מהמקור.
function initMenu() {
  const menuToggle = document.getElementById('menu-toggle');
  const menuClose = document.querySelector('.menu-close');
  const sideMenu = document.getElementById('side-menu');
  const overlay = document.querySelector('.overlay');

  if (!menuToggle || !menuClose || !sideMenu || !overlay) return;

  function setMenuOpen(open) {
    sideMenu.classList.toggle('active', open);
    overlay.classList.toggle('active', open);

    sideMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuToggle.setAttribute('aria-label', open ? 'סגירת התפריט' : 'פתיחת התפריט');

    // החזרת המיקוד: בפתיחה לכפתור הסגירה, ובסגירה לכפתור שממנו נפתח
    // התפריט - אחרת משתמש מקלדת "מאבד" את מקומו בדף.
    if (open) {
      menuClose.focus();
    } else if (document.activeElement && sideMenu.contains(document.activeElement)) {
      menuToggle.focus();
    }
  }

  menuToggle.addEventListener('click', () => setMenuOpen(!sideMenu.classList.contains('active')));
  menuClose.addEventListener('click', () => setMenuOpen(false));
  overlay.addEventListener('click', () => setMenuOpen(false));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sideMenu.classList.contains('active')) {
      setMenuOpen(false);
    }
  });

  // קישור לעמוד הנוכחי רק סוגר את התפריט במקום לטעון מחדש את הדף.
  // הבדיקה היא על aria-current ולא על מחלקה, כך שהיא נכונה בכל עמוד
  // ואינה קורסת בעמוד שבו אין פריט מסומן.
  const currentPageLink = document.querySelector('.menu-item a[aria-current="page"]');
  if (currentPageLink) {
    currentPageLink.addEventListener('click', event => {
      event.preventDefault();
      setMenuOpen(false);
    });
  }
}
