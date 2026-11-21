// Veri katmanı: Firebase (giriş + Firestore) ya da ayar yoksa demo modu (localStorage).
import { firebaseConfig } from "./firebase-config.js";

export const COLLECTIONS = ["items", "projects", "types", "goals", "settings"];
const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const clean = (o) => JSON.parse(JSON.stringify(o)); // undefined alanları atar

export async function initStore({ onData, onAuth, onSync }) {
  if (!firebaseConfig.apiKey) return demoStore({ onData, onAuth, onSync });
  return firebaseStore({ onData, onAuth, onSync });
}

/* ---------------- Demo modu ---------------- */
function demoStore({ onData, onAuth, onSync }) {
  const KEY = "planmasasi-demo";
  let data = {};
  try { data = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { data = {}; }
  COLLECTIONS.forEach((c) => (data[c] = data[c] || {}));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} };
  const api = {
    mode: "demo",
    user: { email: "demo" },
    async put(col, id, value) {
      if (value === null) delete data[col][id]; else data[col][id] = clean(value);
      save(); onData(col, { ...data[col] }, { fromCache: false, pending: false });
    },
    async signIn() {}, async signOut() {}, async resetPassword() {}, async changePassword() {},
  };
  setTimeout(() => {
    onAuth(api.user);
    COLLECTIONS.forEach((c) => onData(c, { ...data[c] }, { fromCache: false, pending: false }));
    onSync("demo");
  }, 0);
  return api;
}

/* ---------------- Firebase ---------------- */
async function firebaseStore({ onData, onAuth, onSync }) {
  const [{ initializeApp }, authMod, fsMod] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js"),
  ]);
  const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
    updatePassword, EmailAuthProvider, reauthenticateWithCredential } = authMod;
  const { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, doc, setDoc, deleteDoc, onSnapshot } = fsMod;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  let uid = null;
  let unsubs = [];
  const pending = {};

  const updateSync = () => {
    if (!navigator.onLine) return onSync("offline");
    onSync(Object.values(pending).some(Boolean) ? "saving" : "synced");
  };
  window.addEventListener("online", updateSync);
  window.addEventListener("offline", updateSync);

  const api = {
    mode: "firebase",
    user: null,
    async put(col, id, value) {
      if (!uid) throw new Error("Giriş yapılmamış");
      const ref = doc(db, "users", uid, col, id);
      if (value === null) await deleteDoc(ref); else await setDoc(ref, clean(value));
    },
    async signIn(email, password) { await signInWithEmailAndPassword(auth, email, password); },
    async signOut() { await signOut(auth); },
    async resetPassword(email) { await sendPasswordResetEmail(auth, email); },
    async changePassword(current, next) {
      const u = auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
      await updatePassword(u, next);
    },
  };

  onAuthStateChanged(auth, (user) => {
    unsubs.forEach((u) => u()); unsubs = [];
    uid = user ? user.uid : null;
    api.user = user ? { email: user.email } : null;
    onAuth(api.user);
    if (!user) return;
    COLLECTIONS.forEach((c) => {
      const un = onSnapshot(
        collection(db, "users", uid, c),
        { includeMetadataChanges: true },
        (snap) => {
          const out = {};
          snap.docs.forEach((d) => (out[d.id] = d.data()));
          pending[c] = snap.metadata.hasPendingWrites;
          onData(c, out, { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });
          updateSync();
        },
        (err) => { console.error(err); onSync("error", err); }
      );
      unsubs.push(un);
    });
  });
  return api;
}
