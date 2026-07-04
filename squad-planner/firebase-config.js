// Values from Task 1 (Firebase Console → Project settings → Your apps → Web app).
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID",
};

// The fixed identity behind the shared "password" login screen.
// This is public (visible in this file) by design — see the design spec's
// security section. It is not a secret; the password is.
export const SHARED_LOGIN_EMAIL = "club@bnei-yehuda-squad-planner.internal";
