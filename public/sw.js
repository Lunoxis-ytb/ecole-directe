const CACHE_NAME = "edmm-v18";
const STATIC_ASSETS = [
  "/",
  "/css/style.css",
  "/js/api.js",
  "/js/app.js",
  "/js/grades.js",
  "/js/homework.js",
  "/js/schedule.js",
  "/js/viescolaire.js",
  "/js/messages.js",
  "/js/bulletin.js",
  "/js/teacher.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Installation : mettre en cache les fichiers statiques
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activation : supprimer les anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch avec timeout pour les API
function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
    fetch(request).then((res) => {
      clearTimeout(timer);
      resolve(res);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Auth et gate : toujours reseau
  if (url.pathname === "/auth" || url.pathname === "/gate") {
    event.respondWith(fetch(event.request));
    return;
  }

  // API POST requests : toujours reseau direct (pas de cache possible pour POST)
  if (url.pathname.startsWith("/api/") && event.request.method === "POST") {
    return; // Laisser le navigateur gerer normalement
  }

  // API GET requests : network-first avec timeout 15s + fallback cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetchWithTimeout(event.request.clone(), 15000)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) =>
            cached || new Response(JSON.stringify({ error: "Hors ligne" }), {
              headers: { "Content-Type": "application/json" },
            })
          )
        )
    );
    return;
  }

  // Navigation : network-first avec fallback cache pour offline
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // Fichiers statiques : cache-first, fallback reseau
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
