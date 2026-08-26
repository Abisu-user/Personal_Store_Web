/* Personal Vault PWA shell cache.
 *
 * Private pages and every API response are deliberately excluded.  The
 * service worker only keeps static application resources so that an
 * authenticated user's records never end up in the Cache Storage API.
 */
const CACHE_NAME = "personal-vault-shell-v1";
const BOOTSTRAP_ASSETS = ["/manifest.webmanifest", "/icon.svg", "/apple-icon"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(BOOTSTRAP_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("personal-vault-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || request.mode === "navigate") return;
  const cacheableDestination = ["script", "style", "font", "image", "manifest"].includes(request.destination);
  if (!cacheableDestination) return;

  event.respondWith(caches.match(request).then(async (cached) => {
    if (cached) return cached;
    const response = await fetch(request);
    const cacheControl = response.headers.get("Cache-Control") || "";
    if (response.ok && response.type === "basic" && !cacheControl.includes("no-store")) {
      const cache = await caches.open(CACHE_NAME);
      void cache.put(request, response.clone());
    }
    return response;
  }));
});
