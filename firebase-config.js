import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC-NOyBMF0hhx7CATLFPu4lVX4HBgaweY8",
  authDomain: "vape-shop-2.firebaseapp.com",
  projectId: "vape-shop-2",
  storageBucket: "vape-shop-2.firebasestorage.app",
  messagingSenderId: "702891209672",
  appId: "1:702891209672:web:dc6beec97411f76df9c6fd",
  measurementId: "G-TVH0L3X5XZ"
};

const ADMIN_EMAILS = [
  "fchristian416@gmail.com"
];

let db = null;
let auth = null;
let firebaseReady = false;
try {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  firebaseReady = true;
} catch (error) {
  console.warn("Firebase init failed. Local mode will be used.", error);
}

export { db, auth, firebaseReady, ADMIN_EMAILS };
