'use strict';

// עמוד אודות הוא סטטי: אין בו מיקום, טיימרים או מצפן, ולכן הוא אינו טוען
// את script.js. app-init.js כבר קבע את מחלקת הערכה על <html> לפני הצביעה,
// וכאן נותר רק ליישר אחריו את צבע סרגל המערכת - שאחרת היה נשאר על ערך
// ברירת המחדל הבהיר גם בערכה כהה.
(function () {
  const THEME_COLORS = { day: '#cdeefd', night: '#0f2027' };
  const meta = document.getElementById('theme-color-meta');
  if (!meta) return;

  const theme = document.documentElement.classList.contains('night') ? 'night' : 'day';
  meta.setAttribute('content', THEME_COLORS[theme]);
}());

initMenu();
