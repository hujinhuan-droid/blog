/// <reference types="@cloudflare/workers-types" />

// 公开接口的浏览器缓存头：仅匿名访问时加，管理员永远是实时数据。
// 目的是让「再次访问 / 返回上一页」直接命中本地缓存，不再等一次 2s 的冷启动。
export function json(data: any, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

export function anonCache(user: unknown, maxAge: number): Record<string, string> {
  return user ? {} : { "cache-control": `public, max-age=${maxAge}` };
}

export function isAdmin(user: { role: string } | null): boolean {
  return !!user && user.role === "admin";
}

export async function readJson(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// 对外安全的文章卡片字段（去掉 embedding 等大字段）
export function cardOf(p: any): any {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    cover: p.cover,
    tags: p.tags,
    visibility: p.visibility,
    status: p.status,
    views: p.views || 0,
    comment_count: p.comment_count || 0,
    created_at: p.created_at,
    // 定时发布管理页需要判断「排队中」，只回传时间戳本身（几十字节）
    scheduled_at: p.scheduled_at ?? null,
    // 列表首屏需要「阅读时长」但不含正文：只回传正文字符数（几十字节）
    content_length: String(p.content || "").length,
  };
}

// 站点级 safe HTML 转义（供 SSR / 文档注入复用）
export function escHtmlS(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// 判断请求是否来自爬虫 / 社交抓取（需要服务端预渲染，而非纯客户端 SPA）
export function isCrawler(ua: string): boolean {
  const s = (ua || "").toLowerCase();
  return /(bot|spider|crawl|slurp|baiduspider|googlebot|bingbot|yandex|sogou|360spider|bytespider|duckduckbot|teoma|facebookexternalhit|twitterbot|discordbot|whatsapp|telegrambot|pinterest|linkedinbot|embedly|quora link|showyoubot|outbrain|pocket|slackbot|vkshare|w3c_validator|redditbot|applebot|semrush|ahrefs|mj12|dotbot|dataprovider|netcraft|rogerbot|developers\.google\.com)/.test(s);
}

// 把站内相对路径补成绝对 URL（OG / Twitter / JSON-LD 必须绝对地址）
export function absUrl(u: string | undefined, base: string): string {
  const v = String(u || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return base + (v.startsWith("/") ? v : "/" + v);
}

// 访问明细：设备 / 来源归类。只存归类与来源域名，不存完整 UA 与 IP。
export function classifyDevice(ua: string): string {
  const u = (ua || "").toLowerCase();
  if (/bot|spider|crawler|slurp|facebookexternalhit|headless|curl|wget/.test(u)) return "bot";
  if (/ipad|tablet|kindle|silk|playbook/.test(u)) return "tablet";
  if (/mobile|iphone|ipod|android|windows phone|opera mini/.test(u)) return "mobile";
  return "desktop";
}
export function classifySource(ref: string, selfHost: string): { source: string; referer: string } {
  if (!ref) return { source: "direct", referer: "" };
  try {
    const h = new URL(ref).hostname.toLowerCase();
    if (!h || h === selfHost || h.endsWith("." + selfHost) || selfHost.endsWith("." + h)) {
      return { source: "direct", referer: "" };
    }
    const SEARCH = ["google.", "bing.", "baidu.", "sogou.", "duckduckgo", "yandex.", "so.com", "360.cn", "sm.cn", "ecosia", "naver.", "toutiao."];
    const SOCIAL = ["weibo.", "zhihu.", "twitter.", "x.com", "t.co", "facebook.", "linkedin.", "weixin.", "wechat.", "qq.com", "douyin.", "xiaohongshu.", "bilibili.", "reddit.", "telegram.", "juejin.", "csdn."];
    let source = "external";
    if (SEARCH.some((k) => h.includes(k))) source = "search";
    else if (SOCIAL.some((k) => h === k || h.endsWith("." + k) || h.includes(k))) source = "social";
    return { source, referer: h };
  } catch {
    return { source: "direct", referer: "" };
  }
}
export async function visitorHash(seed: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
    return Array.from(new Uint8Array(buf).slice(0, 8)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

// 根据 settings.cache_ttl 生成 Cache-Control：0 或空 → no-store；>0 → public, max-age=秒
export function cacheControlHeader(settings: Record<string, string>): string {
  const ttl = parseInt(settings.cache_ttl || "", 10);
  if (Number.isFinite(ttl) && ttl > 0) return `public, max-age=${ttl}`;
  return "no-store";
}

// 通用安全响应头：作用于 Worker 直出的 HTML / 图片 / 静态资源
export function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
  };
}

// 按扩展名给静态资源（Workers Assets 直出）定缓存策略
// 脚本/样式：随部署更新，1 天 + 后台刷新；图片/字体：基本不可变，7 天 + 更长后台刷新
export function assetCacheControl(pathname: string): string {
  const ext = (pathname.split(".").pop() || "").toLowerCase();
  if (ext === "js" || ext === "mjs" || ext === "css") {
    return "public, max-age=86400, stale-while-revalidate=604800";
  }
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "ico", "avif", "woff2", "woff", "ttf", "otf", "json"].includes(ext)) {
    return "public, max-age=604800, stale-while-revalidate=2592000";
  }
  return "public, max-age=3600";
}

// 解析「每行 标签|URL」格式，过滤非法协议
export function parseLinkLines(raw: string | undefined): { label: string; url: string }[] {
  return String(raw || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("|");
      if (i < 0) return null;
      const label = l.slice(0, i).trim();
      const url = l.slice(i + 1).trim();
      if (!label || !url || !/^(https?:\/\/|mailto:|\/|#)/i.test(url)) return null;
      return { label, url };
    })
    .filter(Boolean) as { label: string; url: string }[];
}

export function fmtDateS(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// XML 转义（RSS / sitemap）
export function escXml(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
