const CACHE_NAME = "hozai-qr-order-v1";
const APP_ASSETS = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(async () =>
          (await caches.match("/")) ??
          new Response(
            "<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>オフライン</title><body style=\"font-family:sans-serif;padding:2rem;background:#f4f1ea;color:#16211e\"><h1>オフラインです</h1><p>通信状態を確認して、もう一度開いてください。</p></body></html>",
            { headers: { "content-type": "text/html; charset=utf-8" } },
          ),
        ),
    );
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});
