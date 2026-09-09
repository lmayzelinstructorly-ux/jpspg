const CACHE = "jpspg-shell-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api")
  )
    return;
  if (url.pathname.startsWith("/assets/"))
    event.respondWith(
      caches.open(CACHE).then(
        async (cache) =>
          (await cache.match(event.request)) ||
          fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }),
      ),
    );
});
