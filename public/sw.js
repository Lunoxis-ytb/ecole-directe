const CACHE_NAME = "edmm-v2";
const STATIC_ASSETS = [
  "/",
  "/css/style.css",
  "/js/api.js",
  "/js/app.js",
  "/js/grades.js",
  "/js/homework.js",
  "/js/schedule.js",
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

// Fetch : network-first pour les API, cache-first pour le reste
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Les requetes API passent toujours par le reseau
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: "Hors ligne" }), {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Auth et gate : toujours reseau
  if (url.pathname === "/auth" || url.pathname === "/gate") {
    event.respondWith(fetch(event.request));
    return;
  }

  // Fichiers statiques : cache-first, fallback reseau
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          // Mettre a jour le cache avec la version fraiche
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
