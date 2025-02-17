// public/service-worker.js
const CACHE_NAME = "propiedades-cache-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/static/js/main.chunk.js",
  "/static/js/0.chunk.js",
  "/static/js/bundle.js",
  "/static/css/main.chunk.css",
  "/icon-192x192.png",
  "/icon-512x512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log("Cache abierto");
        return cache.addAll(ASSETS);
      })
      .catch((error) => {
        console.error("Error al abrir el cache:", error);
      })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Si el recurso está en el cache, devolverlo
        if (response) {
          return response;
        }

        // Si no está en el cache, hacer la solicitud a la red
        return fetch(event.request)
          .then((networkResponse) => {
            // Si la respuesta es válida, guardarla en el cache
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
              return networkResponse;
            }

            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          })
          .catch(() => {
            // Si la red falla, devolver una página de fallback (opcional)
            return caches.match("/offline.html"); // Asegúrate de tener un archivo offline.html
          });
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Eliminando cache antiguo:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});