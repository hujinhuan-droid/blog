// Service Worker：缓存静态资源，支持离线访问与 SPA 回退
const CACHE = "ai-agent-blog-v18";
// 只预缓存首屏真正必需的资源（均为 tools/build-assets.mjs 产出的 .min.*）。
// admin.min.js（后台）与 highlight.min.js（代码块）改为按需加载，
// 首次用到时由下方 fetch 的「缓存优先 + 后台更新」逻辑自动纳入缓存，不再随首屏下载。
// lucide.min.js 全量包已由轻量子集 /js/icons.min.js 取代，不再被页面引用。
const ASSETS = [
  "/", "/index.html",
  "/css/style.min.css", "/css/depth.min.css",
  "/js/icons.min.js", "/js/app.min.js", "/js/markdown.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;       // 跨域（R2 图片等）走网络
  if (url.pathname.startsWith("/api/")) return;      // API 走网络

  // 页面导航：网络优先，离线时回退到缓存首页（SPA）
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/")));
    return;
  }

  // 静态资源：缓存优先，后台更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
