// Values from Task 1 (Firebase Console → Project settings → Your apps → Web app).
export const firebaseConfig = {
  apiKey: "AIzaSyCVPFNJS4hawy6v9OcX7OSKmA8abpfNUFU",
  authDomain: "bnei-yehuda-squad-planner.firebaseapp.com",
  projectId: "bnei-yehuda-squad-planner",
  storageBucket: "bnei-yehuda-squad-planner.firebasestorage.app",
  messagingSenderId: "187443762433",
  appId: "1:187443762433:web:d1236804fb36a1aa757700",
};

// The fixed identity behind the shared "password" login screen.
// This is public (visible in this file) by design — see the design spec's
// security section. It is not a secret; the password is.
export const SHARED_LOGIN_EMAIL = "club@bnei-yehuda-squad-planner.internal";
