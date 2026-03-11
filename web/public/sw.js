// Sui Dev Hub - Service Worker
// オフラインキャッシュ + パフォーマンス向上

const CACHE_NAME = "sui-dev-hub-v1";
const STATIC_ASSETS = ["/", "/create", "/about"];

// インストール時に静的アセットをキャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first戦略（APIやページ）、Cache-first（静的アセット）
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // APIリクエストはキャッシュしない
  if (url.pathname.startsWith("/api/")) return;

  // 静的アセット（JS/CSS/SVG）はCache-first
  if (request.destination === "script" || request.destination === "style" || request.destination === "image") {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      }))
    );
    return;
  }

  // ページはNetwork-first（オフライン時にキャッシュから返す）
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
