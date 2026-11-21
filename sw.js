// Uygulamanın internetsiz de açılması için dosyaları önbelleğe alır.
// Güncelleme yayınlarken aşağıdaki sürüm numarasını bir artır.
const CACHE = "planmasasi-v1";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./store.js", "./firebase-config.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const cacheable = sameOrigin || url.href.startsWith("https://www.gstatic.com/firebasejs/") || url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
  if (!cacheable) return; // Firebase veri trafiğine dokunma
  // Önce önbellekten aç, arka planda yenisini al
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: sameOrigin });
    const net = fetch(req).then((res) => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === "navigate") return cache.match("./index.html");
    return new Response("", { status: 504 });
  }));
});
