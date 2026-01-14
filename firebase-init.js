// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDbFEWKJylJJgNw0KIyFsDxlDKPwJII73o",
  authDomain: "attenza-app.firebaseapp.com",
  projectId: "attenza-app",
  storageBucket: "attenza-app.firebasestorage.app",
  messagingSenderId: "435010148378",
  appId: "1:435010148378:web:e5540806fd0ef90b16d9a3"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
