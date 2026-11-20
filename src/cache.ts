/// <reference types="@cloudflare/workers-types" />
// Workers Cache 边缘缓存层：缓存「确定性公开响应」（feed / sitemap / robots / 爬虫 SSR），
// 把读多写少的动态响应挡在 D1 查询之前，降低 TTFB 与数据库读压力。
//
// 设计约束（不可违反）：
// 1) 只缓存与用户态无关、且内容完全由文章内容+设置决定的响应；
//    注入了 __INITIAL__ / 用户态的 SPA 文档绝不缓存（R17 首屏数据内联依赖实时性）。
// 2) 任何缓存异常都静默降级为直接计算（Cache API 在部分本地环境不可用）。
// 3) 发布/更新/删除文章后必须 purge（由 worker 发布联动调用 purgeEdgeCache）。

const CACHE_NAME = "blog-edge-v1";

function enabled(): CacheStorage | null {
  try {
    return typeof caches !== "undefined" && (caches as any).default ? (caches as CacheStorage) : null;
  } catch {
    return null;
  }
}

/** 缓存中已知的动态 key（用于发布后精确失效）；集中登记避免遗漏。 */
export const DYNAMIC_KEYS = ["/feed.xml", "/sitemap.xml", "/robots.txt"] as const;

/**
 * 读缓存；未命中则调用 producer 计算并写入。
 * - req：原始请求（仅用其 URL origin 构造 key）
 * - key：以 / 开头的路径（可含查询串），作为缓存身份
 * - ttlSeconds：写入响应的 max-age（Cache API 依此判定新鲜度）
 * - producer：真正生成响应的函数（命中时不调用）
 * - varyUA：是否按爬虫/真人区分缓存（SSR 页需要，公开 feed 不需要）
 */
export async function cachedResponse(
  req: Request,
  key: string,
  ttlSeconds: number,
  producer: () => Promise<Response> | Response,
  varyUA = false
): Promise<Response> {
  const cs = enabled();
  if (!cs) return await producer();
  try {
    const origin = new URL(req.url).origin;
    const cacheKey = new Request(origin + key, { method: "GET" });
    // varyUA：给爬虫缓存加固定标记头，确保与真人 SPA 缓存互不串用
    if (varyUA) cacheKey.headers.set("X-Blog-Vary", "crawler");
    const cache = await cs.open(CACHE_NAME);
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    const resp = await producer();
    if (resp && resp.status === 200 && ttlSeconds > 0) {
      // 写一份副本进缓存，原响应原样返回（避免 clone 影响 body 消费）
      const stored = resp.clone();
      const h = new Headers(stored.headers);
      h.set("Cache-Control", `public, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 6}`);
      const toStore = new Response(stored.body, { status: stored.status, statusText: stored.statusText, headers: h });
      await cache.put(cacheKey, toStore).catch(() => {});
    }
    return resp;
  } catch {
    return await producer();
  }
}

/** 失效指定 key（best-effort）。 */
async function deleteKey(origin: string, key: string): Promise<void> {
  const cs = enabled();
  if (!cs) return;
  try {
    const cache = await cs.open(CACHE_NAME);
    await cache.delete(new Request(origin + key, { method: "GET" }));
    // 同时删带爬虫标记头的变体
    const varyReq = new Request(origin + key, { method: "GET" });
    varyReq.headers.set("X-Blog-Vary", "crawler");
    await cache.delete(varyReq);
  } catch {}
}

/**
 * 文章发布/更新/删除后调用：清空动态响应缓存。
 * 文章列表变化会影响 feed / sitemap / 爬虫首页与相关标签页，故全部失效。
 */
export async function purgeEdgeCache(req: Request): Promise<void> {
  const cs = enabled();
  if (!cs) return;
  try {
    const origin = new URL(req.url).origin;
    // 公开的固定 key
    for (const k of DYNAMIC_KEYS) await deleteKey(origin, k);
    // 爬虫 SSR 变体：用前缀匹配删除命中项（首页 + 所有文章页）
    const cache = await cs.open(CACHE_NAME);
    const keys = await cache.keys();
    await Promise.all(
      keys
        .filter((r) => {
          const p = new URL(r.url).pathname;
          return p === "/" || p.startsWith("/post/") || p.startsWith("/tag/");
        })
        .map((r) => cache.delete(r).catch(() => {}))
    );
  } catch {}
}
