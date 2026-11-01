import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  collection,
  getDocs,
  increment,
} from "firebase/firestore";

// Keys come from the .env file (see .env.example). Nothing is hard-coded, so each deployment points at its own Firebase project.
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** False until the three required keys are in .env; main.jsx then shows a setup screen instead of the site. */
export const firebaseConfigured = !!(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);

const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;

export { signInWithEmailAndPassword, signOut, onAuthStateChanged };

const ROOT = "digitalEntertainment";

/* ---------- Single small document (settings only) ---------- */
export async function loadDoc(key, fallback) {
  try {
    const snap = await getDoc(doc(db, ROOT, key));
    if (snap.exists()) return snap.data().value;
    return fallback;
  } catch (e) {
    console.error("Firebase load error", e);
    return fallback;
  }
}

export async function saveDoc(key, value) {
  try {
    await setDoc(doc(db, ROOT, key), { value });
    return true;
  } catch (e) {
    console.error("Firebase save error", e);
    return false;
  }
}

export function watchDoc(key, callback) {
  return onSnapshot(doc(db, ROOT, key), (snap) => {
    if (snap.exists()) callback(snap.data().value);
  });
}

/* ---------- Collections: each item (game / payment method) gets its own document ---------- */
export async function loadCollection(name, fallback) {
  try {
    const snap = await getDocs(collection(db, ROOT + "_" + name));
    if (snap.empty) return fallback;
    return snap.docs.map((d) => d.data());
  } catch (e) {
    console.error("Firebase collection load error", e);
    return fallback;
  }
}

export async function saveItem(name, item) {
  try {
    await setDoc(doc(db, ROOT + "_" + name, item.id), item);
    return true;
  } catch (e) {
    console.error("Firebase item save error", e);
    return false;
  }
}

export async function deleteItem(name, id) {
  try {
    await deleteDoc(doc(db, ROOT + "_" + name, id));
    return true;
  } catch (e) {
    console.error("Firebase item delete error", e);
    return false;
  }
}

export function watchCollection(name, callback) {
  return onSnapshot(collection(db, ROOT + "_" + name), (snap) => {
    callback(snap.docs.map((d) => d.data()));
  });
}

/* ---------- Analytics counters (site visits, per-game download clicks) ---------- */
export async function incrementCounter(key) {
  try {
    await setDoc(doc(db, ROOT + "_stats", key), { count: increment(1) }, { merge: true });
    return true;
  } catch (e) {
    console.error("Firebase counter error", e);
    return false;
  }
}

export function watchCounters(callback) {
  return onSnapshot(collection(db, ROOT + "_stats"), (snap) => {
    const stats = {};
    snap.docs.forEach((d) => {
      stats[d.id] = d.data().count || 0;
    });
    callback(stats);
  });
}