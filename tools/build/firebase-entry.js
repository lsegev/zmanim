// נקודת כניסה לאריזת ה-SDK של Firebase לקובץ מקומי אחד.
//
// למה בכלל אורזים: ה-CSP של האפליקציה מגדירה script-src 'self', ואנחנו
// רוצים לשמור על כך - בלי סקריפטים מ-CDN חיצוני, בדיוק כמו שנעשה ל-SunCalc.
// מייצאים רק את מה שבאמת בשימוש, כדי ש-esbuild יוכל לעשות tree-shaking
// ולהשאיר את החבילה קטנה.
//
// בנייה מחדש (למשל אחרי עדכון גרסת firebase):
//   npm run vendor:firebase

export { initializeApp } from 'firebase/app';
export {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, onAuthStateChanged
} from 'firebase/auth';
export {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, serverTimestamp
} from 'firebase/firestore';
