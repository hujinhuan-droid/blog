/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./worker";
import { listPosts, getPostBySlug, getSettings, parseTags } from "./db";
import { getRelatedPosts } from "./ai";
import { escHtmlS, absUrl, fmtDateS, cacheControlHeader, securityHeaders, parseLinkLines, escXml } from "./util";

// 轻量 Markdown → HTML（服务端渲染用，对齐前端 markdown.js 的子集，供爬虫与分享卡片抓取正文）
function inlineMdS(text: string): string {
  let s = escHtmlS(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => `<img alt="${alt}" src="${url}" loading="lazy" decoding="async" />`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) => `<a href="${url}" target="_blank" rel="noopener">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return s;
}
function renderMarkdownSsr(src: string): string {
  if (!src) return "";
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let i = 0;
  let para: string[] = [];
  function flushPara() {
    if (para.length) { html += `<p>${inlineMdS(para.join(" "))}</p>\n`; para = []; }
  }
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flushPara();
      const langMatch = line.match(/^```\s*([\w+#.-]*)/);
      const lang = langMatch && langMatch[1] ? langMatch[1] : "";
      const buf: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      const cls = lang ? ` class="language-${lang}"` : "";
      html += `<pre><code${cls}>${escHtmlS(buf.join("\n"))}</code></pre>\n`;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])) {
      flushPara();
      const splitRow = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((s) => s.trim());
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      let t = '<div class="table-wrap"><table>';
      t += "<thead><tr>" + header.map((h) => `<th>${inlineMdS(h)}</th>`).join("") + "</tr></thead>";
      t += "<tbody>" + rows.map((r) => "<tr>" + r.map((c) => `<td>${inlineMdS(c)}</td>`).join("") + "</tr>").join("") + "</tbody>";
      t += "</table></div>\n";
      html += t; continue;
    }
    if (/^\[TOC\]$/i.test(line.trim())) { flushPara(); i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushPara(); const level = h[1].length; html += `<h${level}>${inlineMdS(h[2])}</h${level}>\n`; i++; continue; }
    if (/^---+$/.test(line.trim())) { flushPara(); html += "<hr/>\n"; i++; continue; }
    if (/^>\s?/.test(line)) {
      flushPara(); const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      html += `<blockquote>${inlineMdS(buf.join(" "))}</blockquote>\n`; continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara(); const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(`<li>${inlineMdS(lines[i].replace(/^[-*]\s+/, ""))}</li>`); i++; }
      html += `<ul>${items.join("")}</ul>\n`; continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flushPara(); const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(`<li>${inlineMdS(lines[i].replace(/^\d+\.\s+/, ""))}</li>`); i++; }
      html += `<ol>${items.join("")}</ol>\n`; continue;
    }
    if (line.trim() === "") { flushPara(); i++; continue; }
    para.push(line.trim()); i++;
  }
  flushPara();
  return html;
}

// 生成品牌/合规 HTML（Logo + 社交链接 + 备案号 + 隐私政策/友链），供预渲染页复用
function brandingHtml(settings: Record<string, string>, siteTitle: string): { brand: string; footer: string } {
  const logo = String(settings.site_logo || "").trim();
  const brand = logo
    ? `<img src="${escHtmlS(logo)}" alt="" class="brand-logo" /><span>${escHtmlS(siteTitle)}</span>`
    : escHtmlS(siteTitle);
  const parts: string[] = [];
  const social = parseLinkLines(settings.social_links);
  if (social.length) {
    parts.push(`<div class="branding-row social-links">${social.map((x) => `<a class="social-link" href="${escHtmlS(x.url)}" target="_blank" rel="noopener">${escHtmlS(x.label)}</a>`).join("")}</div>`);
  }
  const legal: string[] = [];
  const privacy = String(settings.privacy_url || "").trim();
  if (privacy && /^(https?:\/\/|\/|#)/i.test(privacy)) {
    legal.push(`<a href="${escHtmlS(privacy)}" target="_blank" rel="noopener">隐私政策</a>`);
  }
  const friends = parseLinkLines(settings.friend_links);
  if (friends.length) {
    legal.push(`<span class="friend-links">友链：${friends.map((x) => `<a href="${escHtmlS(x.url)}" target="_blank" rel="noopener">${escHtmlS(x.label)}</a>`).join(" · ")}</span>`);
  }
  const icp = String(settings.beian_icp || "").trim();
  if (icp) legal.push(`<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">${escHtmlS(icp)}</a>`);
  const gongan = String(settings.beian_gongan || "").trim();
  if (gongan) legal.push(`<a href="https://www.beian.gov.cn/" target="_blank" rel="noopener">${escHtmlS(gongan)}</a>`);
  if (legal.length) parts.push(`<div class="branding-row legal-links">${legal.join(" · ")}</div>`);
  return { brand, footer: parts.length ? `<div class="site-branding">${parts.join("")}</div>` : "" };
}

// 通用 HTML 文档骨架（含站点级 OG / Twitter / 样式，供预渲染页复用）
function htmlDoc(opts: { title: string; description: string; head: string; body: string; base: string; image?: string; customCss?: string; brand?: string; footerExtra?: string; extraHead?: string; stats?: string; canonical?: string; ogType?: string; rssTitle?: string }): string {
  const { title, description, head, body } = opts;
  const canonical = opts.canonical || opts.base + "/";
  const ogType = opts.ogType || "website";
  const rssTitle = opts.rssTitle || title;
  const ogImage = opts.image
    ? `<meta property="og:image" content="${escHtmlS(opts.image)}" />
<meta name="twitter:image" content="${escHtmlS(opts.image)}" />`
    : "";
  const customCss = opts.customCss
    ? `<style data-custom-css>\n${opts.customCss}\n</style>`
    : "";
  // 自定义 head（站长可加 meta / 预连接 / 第三方验证标签）与统计数据（仅在管理员保存后注入）
  const extraHead = opts.extraHead ? `\n${opts.extraHead}\n` : "";
  const stats = opts.stats ? `${opts.stats}\n` : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtmlS(title)}</title>
<meta name="description" content="${escHtmlS(description)}" />
<link rel="canonical" href="${escHtmlS(canonical)}" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="alternate" type="application/rss+xml" title="${escHtmlS(rssTitle)} RSS" href="/feed.xml" />
<meta property="og:type" content="${escHtmlS(ogType)}" />
<meta property="og:title" content="${escHtmlS(title)}" />
<meta property="og:description" content="${escHtmlS(description)}" />
<meta property="og:url" content="${escHtmlS(canonical)}" />
<meta property="og:site_name" content="${escHtmlS(title)}" />
${ogImage}
<meta name="twitter:card" content="summary_large_image" />
<link rel="stylesheet" href="/css/style.min.css" />
<link rel="stylesheet" href="/css/depth.min.css" />
${customCss}
${head}${extraHead}
</head>
<body>
<div class="bg-fx" aria-hidden="true"><span class="bg-glow"></span><span class="bg-grid"></span></div>
<header class="topbar"><div class="wrap"><a class="brand" href="/">${opts.brand || escHtmlS(title)}</a></div></header>
<main class="container">
${body}
</main>
<footer class="footer"><div class="wrap"><div class="copyright">© ${escHtmlS(title)} · Powered by Cloudflare</div>${opts.footerExtra || ""}</div></footer>
${stats}</body>
</html>`;
}

// 维护模式页面（公开访客可见；含内嵌管理员登录框，保证站长仍能进入后台）
export function maintenancePage(settings: Record<string, string>): string {
  const title = settings.site_title || "AI Agent 博客";
  const text = settings.maintenance_text || "网站正在维护中，请稍后再访问。";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>维护中 - ${escHtmlS(title)}</title>
<meta name="robots" content="noindex" />
<style data-custom-css>
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.main-box{max-width:420px;width:90%;background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.main-box h1{margin:0 0 8px;font-size:22px}
.main-box p{color:#94a3b8;margin:0 0 24px;line-height:1.6}
.login{display:none;margin-top:8px;text-align:left}
.login input{width:100%;box-sizing:border-box;margin:6px 0;padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0}
.login button{width:100%;margin-top:8px;padding:10px;border:0;border-radius:8px;background:#3b82f6;color:#fff;cursor:pointer;font-size:14px}
.toggle{margin-top:18px;font-size:13px;color:#64748b;cursor:pointer;text-decoration:underline}
#msg{margin-top:10px;font-size:13px;min-height:18px}
</style>
</head>
<body>
<div class="main-box">
  <h1>🛠️ 维护中</h1>
  <p>${escHtmlS(text)}</p>
  <div class="toggle" id="toggle">管理员登录</div>
  <div class="login" id="login">
    <input id="u" placeholder="用户名" autocomplete="username" />
    <input id="p" type="password" placeholder="密码" autocomplete="current-password" />
    <button id="go">登录</button>
    <div id="msg"></div>
  </div>
</div>
<script>
document.getElementById('toggle').onclick=function(){var l=document.getElementById('login');l.style.display=l.style.display==='block'?'none':'block';};
document.getElementById('go').onclick=async function(){
  var u=document.getElementById('u').value.trim(),p=document.getElementById('p').value,m=document.getElementById('msg');
  if(!u||!p){m.style.color='#f87171';m.textContent='请输入用户名和密码';return;}
  m.style.color='#94a3b8';m.textContent='登录中…';
  try{
    var r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    var d=await r.json().catch(function(){return{};});
    if(r.ok){m.style.color='#4ade80';m.textContent='登录成功，正在刷新…';setTimeout(function(){location.reload();},600);}
    else{m.style.color='#f87171';m.textContent=d.error||'登录失败';}
  }catch(e){m.style.color='#f87171';m.textContent='网络错误';}
};
</script>
</body>
</html>`;
}

export async function prerenderHome(env: Env, req: Request): Promise<Response> {
  let settings: Record<string, string> = {};
  try { settings = await getSettings(env.DB); } catch {}
  const base = (env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const title = settings.seo_title || settings.site_title || "AI Agent 博客";
  const description = settings.seo_description || settings.about_content || "记录 AI Agent 的探索、实践与思考";
  const posts = await listPosts(env.DB, { admin: false });
  const tagSet = new Set<string>();
  for (const p of posts) (parseTags(p.tags) as string[]).forEach((t) => t && tagSet.add(t));
  const days = posts.length
    ? Math.max(1, Math.floor((Date.now() - Math.min(...posts.map((p) => p.created_at))) / 86400000) + 1)
    : 1;
  const cards = posts
    .slice(0, 20)
    .map((p) => `<article class="post-card">
  <div class="post-submeta"><span class="post-date">${fmtDateS(p.created_at)}</span></div>
  <h2><a href="/post/${encodeURIComponent(p.slug)}">${escHtmlS(p.title)}</a></h2>
  <p class="excerpt">${escHtmlS(p.excerpt || "")}</p>
</article>`)
    .join("\n");
  const head = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: title,
    url: base + "/",
    description,
  })}</script>`;
  const body = `<section class="hero"><div class="hero-inner">
  <p class="hero-eyebrow">欢迎来到</p>
  <h1 class="hero-title">${escHtmlS(title)}</h1>
  <p class="hero-sub">${escHtmlS(description)}</p>
  <div class="hero-stats"><span><b>${posts.length}</b> 篇文章</span> · <span><b>${tagSet.size}</b> 个标签</span> · <span><b>${days}</b> 天运行</span></div>
</div></section>
<div class="post-list">${cards}</div>`;
  const branding = brandingHtml(settings, settings.site_title || "AI Agent 博客");
  const ogImage = absUrl(settings.og_image, base) || base + "/og-default.png";
  return new Response(htmlDoc({ title, description, head, body, base, image: ogImage, canonical: base + "/", ogType: "website", rssTitle: settings.site_title || "AI Agent 博客", customCss: settings.custom_css, brand: branding.brand, footerExtra: branding.footer, extraHead: settings.extra_head || "", stats: settings.stats_code || "" }), {
    headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": cacheControlHeader(settings), ...securityHeaders() },
  });
}

export async function prerenderPost(env: Env, slug: string, req: Request): Promise<Response> {
  let settings: Record<string, string> = {};
  try { settings = await getSettings(env.DB); } catch {}
  const base = (env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const row = await getPostBySlug(env.DB, slug, { admin: false });
  if (!row) {
    return new Response(
      `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><title>页面不存在</title><meta name="robots" content="noindex"/></head><body><main class="container"><h1>页面不存在</h1><p><a href="/">返回首页</a></p></main></body></html>`,
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
  const siteTitle = settings.site_title || "AI Agent 博客";
  const title = `${row.title} - ${siteTitle}`;
  const description = (row.excerpt || "").slice(0, 200) || siteTitle;
  const content = renderMarkdownSsr(row.content || "");
  const cover = absUrl(row.cover, base) || absUrl(settings.og_image, base) || base + "/og-default.png";
  const firstTag = (parseTags(row.tags)[0]) || "";
  const bcCrumbs = [{ name: "首页", url: base + "/" }];
  if (firstTag) bcCrumbs.push({ name: firstTag, url: base + "/tag/" + encodeURIComponent(firstTag) });
  bcCrumbs.push({ name: row.title, url: base + "/post/" + encodeURIComponent(row.slug) });
  const breadcrumbLd = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: bcCrumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
  })}</script>`;
  const head = `<meta property="og:title" content="${escHtmlS(row.title)}" />
<meta property="og:description" content="${escHtmlS(description)}" />
<meta property="article:published_time" content="${new Date(row.created_at).toISOString()}" />
<meta property="article:modified_time" content="${new Date(row.updated_at).toISOString()}" />
<meta property="article:author" content="${escHtmlS(settings.author_name || "hujinhuan-droid")}" />
<meta property="article:section" content="${escHtmlS((parseTags(row.tags)[0]) || "博客")}" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: row.title,
    description,
    datePublished: new Date(row.created_at).toISOString(),
    dateModified: new Date(row.updated_at).toISOString(),
    image: cover,
    author: { "@type": "Person", name: settings.author_name || "hujinhuan-droid" },
    publisher: { "@type": "Organization", name: siteTitle },
    mainEntityOfPage: base + "/post/" + encodeURIComponent(row.slug),
  })}</script>` + breadcrumbLd;
  // 预渲染页（爬虫 / 社交抓取）同样展示封面，保证无 JS 时也有完整视觉
  const coverFig = row.cover
    ? `<figure class="article-cover"><img src="${escHtmlS(absUrl(row.cover, base))}" alt="${escHtmlS(row.title)}" loading="eager" fetchpriority="high" decoding="async" /></figure>`
    : "";
  // 预渲染页（供爬虫 / 无 JS 抓取）同样展示语义相关文章：补全内部链接、提升抓取深度与内链权重
  let relatedHtml = "";
  try {
    const rel = await getRelatedPosts(env.DB, slug, 3);
    if (rel.length) {
      relatedHtml =
        `<section class="related" aria-label="相关文章">\n` +
        `  <h2 class="related-title">相关文章</h2>\n` +
        `  <ul class="related-list">\n` +
        rel.map((r) => `    <li><a class="related-item" href="/post/${encodeURIComponent(r.slug)}">${escHtmlS(r.title)}</a></li>`).join("\n") +
        `\n  </ul>\n</section>`;
    }
  } catch {}
  const body = `<div class="post-detail">
  <div class="article-stage">
    <div class="article-head">
      <div class="post-submeta"><span class="post-date">${fmtDateS(row.created_at)}</span></div>
      <h1>${escHtmlS(row.title)}</h1>
    </div>
    ${coverFig}
    <div class="content">${content}</div>
  </div>
  ${relatedHtml}
</div>`;
  const branding = brandingHtml(settings, siteTitle);
  return new Response(htmlDoc({ title, description, head, body, base, image: cover, canonical: base + "/post/" + encodeURIComponent(row.slug), ogType: "article", rssTitle: siteTitle, customCss: settings.custom_css, brand: branding.brand, footerExtra: branding.footer, extraHead: settings.extra_head || "", stats: settings.stats_code || "" }), {
    headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": cacheControlHeader(settings), ...securityHeaders() },
  });
}

// 标签归档页（公开，仅爬虫命中）：列出该标签下的全部文章，提供可爬取的标签落地页
export async function prerenderTag(env: Env, tag: string, req: Request): Promise<Response> {
  let settings: Record<string, string> = {};
  try { settings = await getSettings(env.DB); } catch {}
  const base = (env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const siteTitle = settings.site_title || "AI Agent 博客";
  const all = await listPosts(env.DB, { admin: false });
  const posts = all.filter((p: any) => (parseTags(p.tags) || []).includes(tag));
  const title = `${tag} - ${siteTitle}`;
  const description = `浏览「${tag}」分类下的全部文章，共 ${posts.length} 篇`;
  const tagUrl = base + "/tag/" + encodeURIComponent(tag);
  const head = `<meta property="og:title" content="${escHtmlS(title)}" />
<meta property="og:description" content="${escHtmlS(description)}" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: title,
  description,
  url: tagUrl,
  isPartOf: { "@type": "WebSite", name: siteTitle, url: base + "/" },
})}</script>`;
  const items = posts
    .map((p: any) => `<li><a href="/post/${encodeURIComponent(p.slug)}">${escHtmlS(p.title)}</a><span class="post-date">${fmtDateS(p.created_at)}</span></li>`)
    .join("\n");
  const body = `<main class="container tag-archive">
  <nav class="crumbs"><a href="/">首页</a> › <span>${escHtmlS(tag)}</span></nav>
  <h1>${escHtmlS(tag)}</h1>
  <p class="lead">${escHtmlS(description)}</p>
  <ul class="post-items">
${items || '    <li class="empty">该分类下暂无文章</li>'}
  </ul>
</main>`;
  const branding = brandingHtml(settings, siteTitle);
  return new Response(htmlDoc({ title, description, head, body, base, image: absUrl(settings.og_image, base) || base + "/og-default.png", canonical: tagUrl, ogType: "website", rssTitle: siteTitle, customCss: settings.custom_css, brand: branding.brand, footerExtra: branding.footer, extraHead: settings.extra_head || "", stats: settings.stats_code || "" }), {
    headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": cacheControlHeader(settings), ...securityHeaders() },
  });
}

export async function robotsTxt(env: Env, req: Request): Promise<Response> {
  let settings: Record<string, string> = {};
  try { settings = await getSettings(env.DB); } catch {}
  const base = (req.url ? new URL(req.url).origin : "").replace(/\/$/, "");
  // Sitemap 关闭时不再向爬虫宣告地址，避免 404 影响抓取评估
  const sitemapLine = settings.sitemap_enabled === "0" ? "" : `Sitemap: ${base}/sitemap.xml\n`;
  const txt = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n${sitemapLine}`;
  return new Response(txt, {
    headers: { "content-type": "text/plain; charset=utf-8", "Cache-Control": cacheControlHeader(settings) },
  });
}

// RSS Feed（公开）：最近 50 篇公开文章
export async function handleFeed(env: Env, req: Request): Promise<Response> {
  let settings: Record<string, string> = {};
  try { settings = await getSettings(env.DB); } catch {}
  const posts = await listPosts(env.DB, { admin: false });
  const base = (env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const feedUrl = `${base}/feed.xml`;
  // RSS 配置（设置页 ⑪）：标题默认站点名；条目数默认 50；rss_full=1 时输出全文而非摘要
  const feedTitle = settings.rss_title || settings.site_title || "AI Agent Blog";
  const feedDesc = settings.seo_description || settings.about_content || "AI Agent 博客";
  const count = Math.max(1, Math.min(200, parseInt(settings.rss_count || "", 10) || 50));
  const full = settings.rss_full === "1";
  const channelImage = absUrl(settings.og_image, base) || `${base}/og-default.png`;
  const items = posts
    .slice(0, count)
    .map((p: any) => {
      const link = `${base}/post/${encodeURIComponent(p.slug)}`;
      const cover = absUrl(p.cover, base) || `${base}/og-default.png`;
      const rawDesc = full ? (p.content || "") : (p.excerpt || "");
      const desc = escXml(rawDesc);
      const cats = (parseTags(p.tags) as string[])
        .map((t) => `      <category>${escXml(t)}</category>`)
        .join("\n");
      return `    <item>
      <title>${escXml(p.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(p.created_at).toUTCString()}</pubDate>
      <description>${desc}</description>
      <image>${escXml(cover)}</image>
      <media:thumbnail url="${escXml(cover)}" />
${cats}
    </item>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escXml(feedTitle)}</title>
    <link>${base}/</link>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
    <description>${escXml(feedDesc)}</description>
    <language>zh-CN</language>
    <image>
      <url>${channelImage}</url>
      <title>${escXml(feedTitle)}</title>
      <link>${base}/</link>
    </image>
${items}
  </channel>
</rss>`;
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
      ...securityHeaders(),
    },
  });
}

// 站点地图（公开）
export async function handleSitemap(env: Env, req: Request): Promise<Response> {
  let settings: Record<string, string> = {};
  try { settings = await getSettings(env.DB); } catch {}
  if (settings.sitemap_enabled === "0") {
    return new Response("sitemap disabled", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const posts = await listPosts(env.DB, { admin: false });
  const base = (env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const urls = posts
    .map((p: any) => `  <url><loc>${base}/post/${encodeURIComponent(p.slug)}</loc><lastmod>${new Date(p.updated_at).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`)
    .join("\n");
  const tagSet = new Set<string>();
  for (const p of posts as any[]) (parseTags(p.tags) || []).forEach((t: string) => t && tagSet.add(t));
  const tagUrls = [...tagSet]
    .map((t) => `  <url><loc>${base}/tag/${encodeURIComponent(t)}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
${tagUrls}
  <url><loc>${base}/</loc></url>
</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
}
