'use strict';

// הגדרות הפרויקט ב-Firebase, משותפות לדף הניהול ולעמוד הציבורי.
//
// הערכים כאן אינם סוד: apiKey של Firebase מזהה את הפרויקט בלבד ואינו
// מעניק שום הרשאה. האבטחה נשענת כולה על firestore.rules (שנאכפים בשרת
// של Google) ועל רשימת ה-Authorized Domains בקונסולה. כך זה מתועד גם
// אצל Google, ולכן הבלוק הזה מופיע בקוד המקור של כל אתר Firebase.
//
// measurementId ו-Analytics הושמטו במכוון: היישומון אינו מודד תנועה ואינו
// מתקין SDK מעקב - ראה את סעיף הפרטיות ב-about.html.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBpdD8_OhK-U3jrmKK7JiVk2IOODL-9mDk',
  authDomain: 'mil-time.firebaseapp.com',
  projectId: 'mil-time',
  storageBucket: 'mil-time.firebasestorage.app',
  messagingSenderId: '862081837607',
  appId: '1:862081837607:web:c89bd0bfa2ea3c489b7c02'
};

// כתובת ה-REST של אוסף הרעיונות. העמוד הציבורי משתמש בה במקום ב-SDK:
// חבילת ה-SDK שוקלת כחצי מגהבייט, וזה יותר מכל שאר האפליקציה יחד - הרבה
// מדי בשביל עמוד שרק קורא כמה רשומות. האוסף פתוח לקריאה, ולכן די ב-fetch.
const IDEAS_REST_URL =
  'https://firestore.googleapis.com/v1/projects/' + FIREBASE_CONFIG.projectId +
  '/databases/(default)/documents/ideas';

// המרת מסמך Firestore למבנה הרעיון שהאפליקציה עובדת איתו.
//
// ב-REST כל שדה עטוף בתיאור טיפוס ({stringValue: "..."}), ולכן צריך לפרוק
// אותו. מזהה המסמך משמש כ-id: הוא יציב לאורך חיי המסמך, ולכן ממשיך לשמש
// כמפתח לזיכרון "מה כבר נקרא" ב-localStorage.
//
// משותף ל-rogem.js (שמקבל תשובת REST) ול-admin.js (שמקבל מסמך מה-SDK),
// ולכן הוא מקבל את השדות ואת המזהה בנפרד.
function ideaFromFields(id, fields) {
  if (!fields) return null;

  const text = key => {
    const field = fields[key];
    return field && typeof field.stringValue === 'string' ? field.stringValue : '';
  };

  const hebrewField = fields.hebrewDate;
  const hebrewDate = hebrewField && typeof hebrewField.stringValue === 'string'
    ? hebrewField.stringValue
    : null;

  return {
    id: id,
    title: text('title'),
    body: text('body'),
    date: text('date'),
    hebrewDate: hebrewDate
  };
}
