// 前端路由 + 读者端视图 + 导航 + 站点统计
let CURRENT_USER = null;

// 顶部主导航（可被站点设置中的自定义菜单覆盖）
let MENUS = [
  { label: "文章", hash: "#/" },
  { label: "时间轴", hash: "#/timeline" },
  { label: "动态", hash: "#/feed" },
  { label: "标签", hash: "#/tags" },
  { label: "朋友们", hash: "#/friends" },
  { label: "关于", hash: "#/about" },
];

// 站点设置（由 /api/settings 填充，供各页面读取）
let SITE_SETTINGS = {};
let SITE_ABOUT = "";
let PER_PAGE = 10;            // 首页每页文章数（设置可调）
let COMMENTS_ENABLED = true;  // 评论开关（设置可调）

function darken(hex, f) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r}, ${g}, ${b})`;
}

// 应用站点设置到页面（站点名 / 页脚 / 导航 / 主题色 / 深色模式 / 关于页 / SEO / 阅读偏好）
function applySettings(s) {
  if (!s || typeof s !== "object") return;
  SITE_SETTINGS = s;
  if (s.site_title) {
    const b = document.querySelector(".brand");
    if (b) b.textContent = s.site_title;
  }
  if (s.footer_text) {
    const c = document.querySelector(".copyright");
    if (c) c.textContent = s.footer_text;
  }
  if (s.nav) {
    try {
      const arr = JSON.parse(s.nav);
      if (Array.isArray(arr) && arr.length) {
        MENUS = arr
          .filter((x) => x && x.label && x.hash)
          .map((x) => ({ label: String(x.label), hash: String(x.hash) }));
        renderNav();
      }
    } catch {}
  }
  if (s.theme_primary) {
    const c = String(s.theme_primary).trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(c)) {
      const hex = c.startsWith("#") ? c : "#" + c;
      document.documentElement.style.setProperty("--primary", hex);
      document.documentElement.style.setProperty("--primary-dark", darken(hex, 0.8));
    }
  }
  if (s.theme_dark === "1") document.body.classList.add("dark");
  else document.body.classList.remove("dark");
  // 阅读偏好
  if (s.posts_per_page) {
    const n = parseInt(s.posts_per_page, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 100) PER_PAGE = n;
  }
  COMMENTS_ENABLED = s.comments_enabled !== "0";
  SITE_ABOUT = s.about_content || "";
  // SEO
  applySeo(s);
}

function api(path, opts) {
  return fetch("/api" + path, Object.assign({ headers: { "content-type": "application/json" } }, opts));
}

function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 渲染 AI 备注区块：文章有 ai_notes 时才显示。
// mini=true 用于首页卡片的紧凑版（限制高度 + 渐隐）
function aiNotesHtml(notes, mini) {
  if (!notes || !notes.trim()) return "";
  return `
    <section class="ai-notes${mini ? " ai-notes-mini" : ""}">
      <div class="ai-notes-head">🤖 AI 备注</div>
      <div class="ai-notes-body">${renderMarkdown(notes)}</div>
    </section>`;
}

// 将 posts.tags（JSON 数组字符串或逗号分隔）解析为标签数组
function parseTags(t) {
  if (!t) return [];
  try {
    const a = JSON.parse(t);
    if (Array.isArray(a)) return a.map((x) => String(x).trim()).filter(Boolean);
  } catch {}
  return String(t)
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// 渲染文章标签区块（标签可点击进入 #/tags/<name> 筛选）
function tagsHtml(p) {
  const tags = parseTags(p && p.tags);
  if (!tags.length) return "";
  const chips = tags
    .map((t) => `<a class="tag" href="#/tags/${encodeURIComponent(t)}">${escHtml(t)}</a>`)
    .join("");
  return `<div class="tags">${chips}</div>`;
}

// 写入 / 更新 <head> 中的 meta 标签（SEO 用）
function setMeta(name, content) {
  if (!content) return;
  let m = document.head.querySelector(`meta[name="${name}"]`);
  if (!m) {
    m = document.createElement("meta");
    m.setAttribute("name", name);
    document.head.appendChild(m);
  }
  m.setAttribute("content", content);
}

// 应用 SEO 设置：标题（seo_title 优先于 site_title）、描述、关键词、OG 标签
function applySeo(s) {
  const title = s.seo_title || s.site_title || document.title;
  if (title) {
    document.title = title;
    setMeta("og:title", title);
  }
  if (s.seo_description) {
    setMeta("description", s.seo_description);
    setMeta("og:description", s.seo_description);
  }
  if (s.seo_keywords) setMeta("keywords", s.seo_keywords);
}

function renderNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = "";
  const menu = el(`<div class="menu"></div>`);
  for (const m of MENUS) {
    const link = el(`<a class="menu-link" href="${m.hash}">${m.label}</a>`);
    // 手机端点菜单项后自动收起下拉
    link.onclick = () => document.querySelector(".topbar")?.classList.remove("open");
    menu.appendChild(link);
  }
  nav.appendChild(menu);

  // 站内搜索框
  const search = el(`<div class="nav-search"><input id="nav-search" type="search" placeholder="搜索文章…" aria-label="搜索" /></div>`);
  const searchInput = search.querySelector("input");
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = searchInput.value.trim();
      if (q) location.hash = "#/search?q=" + encodeURIComponent(q);
    }
  });
  nav.appendChild(search);

  const right = el(`<div class="nav-right"></div>`);
  if (CURRENT_USER) {
    const u = CURRENT_USER;
    if (u.role === "admin") {
      right.appendChild(el(`<a class="btn btn-sm" href="#/admin">管理后台</a>`));
    }
    right.appendChild(
      el(`<span class="user">${u.avatar ? `<img class="avatar" src="${u.avatar}"/>` : ""}${u.username}</span>`)
    );
    const logout = el(`<button class="btn btn-sm">退出</button>`);
    logout.onclick = async () => {
      await api("/auth/logout", { method: "POST" });
      CURRENT_USER = null;
      renderNav();
      location.hash = "#/";
    };
    right.appendChild(logout);
  } else {
    right.appendChild(el(`<a class="btn btn-sm btn-primary" href="#/admin">登录</a>`));
  }
  nav.appendChild(right);
}

// 底部站点统计（与顶栏共用 .wrap 容器，实现平行对齐）
async function renderSiteStats() {
  const box = document.getElementById("site-stats");
  if (!box) return;
  let count = 0;
  try {
    const r = await api("/posts");
    const p = await r.json();
    count = Array.isArray(p) ? p.length : 0;
  } catch {}
  const started = Date.parse("2026-08-13");
  const days = Math.max(1, Math.floor((Date.now() - started) / 86400000) + 1);
  let tagCount = 0;
  try {
    const t = await (await api("/tags")).json();
    tagCount = Array.isArray(t) ? t.length : 0;
  } catch {}
  box.innerHTML =
    `<span>文章 ${count}</span>` +
    `<span>标签 ${tagCount}</span>` +
    `<span>运行 ${days} 天</span>` +
    `<span>访客 —</span>`;
}

// 首页文章缓存 + 当前页码（用于客户端分页，避免每次切换都重新拉取）
let homeAll = [];
let homePage = 1;

async function renderHome() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="empty">加载中…</div>`;
  if (!homeAll.length) {
    const res = await api("/posts");
    homeAll = await res.json();
  }
  if (!homeAll.length) {
    app.innerHTML = `<div class="empty">还没有文章，去管理后台写第一篇吧。</div>`;
    return;
  }
  const total = homeAll.length;
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  if (homePage > pageCount) homePage = pageCount;
  const start = (homePage - 1) * PER_PAGE;
  const slice = homeAll.slice(start, start + PER_PAGE);

  const list = el(`<div class="post-list"></div>`);
  for (const p of slice) {
    const card = el(`
      <article class="post-card">
        <h2><a href="#/post/${encodeURIComponent(p.slug)}">${p.title}</a>${
          p.visibility === "private" ? `<span class="badge">私密</span>` : ""
        }</h2>
        <div class="meta">${fmtDate(p.created_at)}</div>
        <div class="excerpt">${p.excerpt || ""}</div>
        ${aiNotesHtml(p.ai_notes, true)}
        ${tagsHtml(p)}
      </article>`);
    // 整张卡片可点击：点标题链接时由链接自身处理，点卡片其它位置则跳转文章
    card.style.cursor = "pointer";
    card.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      location.hash = "#/post/" + encodeURIComponent(p.slug);
    });
    list.appendChild(card);
  }
  app.innerHTML = "";
  app.appendChild(list);

  // 分页控件
  if (pageCount > 1) {
    const pager = el(`<div class="pager"></div>`);
    pager.innerHTML = `
      <button class="btn btn-sm" id="pg-prev" ${homePage <= 1 ? "disabled" : ""}>← 上一页</button>
      <span class="muted">第 ${homePage} / ${pageCount} 页</span>
      <button class="btn btn-sm" id="pg-next" ${homePage >= pageCount ? "disabled" : ""}>下一页 →</button>`;
    app.appendChild(pager);
    const prev = document.getElementById("pg-prev");
    const next = document.getElementById("pg-next");
    if (prev) prev.onclick = () => { homePage--; renderHome(); window.scrollTo(0, 0); };
    if (next) next.onclick = () => { homePage++; renderHome(); window.scrollTo(0, 0); };
  }
}

async function renderPost(slug) {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="empty">加载中…</div>`;
  const res = await api("/posts/" + encodeURIComponent(slug));
  if (res.status === 404) {
    app.innerHTML = `<div class="empty">文章不存在或无权访问。</div>`;
    return;
  }
  const p = await res.json();
  const detail = el(`<div class="post-detail"></div>`);
  detail.innerHTML = `
    <h1>${p.title}</h1>
    <div class="meta">${fmtDate(p.created_at)}${
      p.visibility === "private" ? " · 私密" : ""
    }</div>
    <div class="content">${renderMarkdown(p.content)}</div>
    ${aiNotesHtml(p.ai_notes)}
    ${tagsHtml(p)}`;
  app.innerHTML = "";
  app.appendChild(detail);
  window.highlightCode(detail);
  loadRelated(p.slug);
  attachComments(p.slug);
}

// 文章底部「相关文章」：调用 /api/related（向量相似度 top3，无向量时按标签兜底）
function loadRelated(slug) {
  const app = document.getElementById("app");
  const box = el(`<section class="related"></section>`);
  box.innerHTML = `<h2 class="related-title">相关文章</h2><div class="related-list"><div class="empty">加载中…</div></div>`;
  app.appendChild(box);
  const list = box.querySelector(".related-list");
  api("/related?slug=" + encodeURIComponent(slug))
    .then((r) => r.json())
    .then((d) => {
      const rs = d.results || [];
      if (!rs.length) {
        list.innerHTML = `<div class="empty">暂无相关推荐。</div>`;
        return;
      }
      list.innerHTML = rs
        .map((p) => `<a class="related-item" href="#/post/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a>`)
        .join("");
    })
    .catch(() => {
      list.innerHTML = `<div class="empty">相关推荐加载失败</div>`;
    });
}

// 文章底部评论区（受 comments_enabled 开关控制）
function attachComments(slug) {
  if (COMMENTS_ENABLED !== true) return;
  const app = document.getElementById("app");

  const box = el(`<section class="comments"></section>`);
  box.innerHTML = `
    <h2 class="comments-title">评论</h2>
    <div id="comment-list" class="comment-list"><div class="empty">加载中…</div></div>`;
  app.appendChild(box);
  loadComments(slug);

  const form = el(`<form class="comment-form" id="comment-form"></form>`);
  form.innerHTML = `
    <h3>发表评论</h3>
    <input type="text" id="c-author" placeholder="昵称（必填）" maxlength="40" />
    <input type="email" id="c-email" placeholder="邮箱（选填，不会公开）" maxlength="80" />
    <textarea id="c-content" placeholder="说点什么…（必填）" maxlength="1000"></textarea>
    <input type="text" id="c-hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
    <div style="display:flex;gap:10px;align-items:center">
      <button class="btn btn-primary" type="submit">提交评论</button>
      <span id="c-msg" class="muted"></span>
    </div>`;
  app.appendChild(form);

  const hp = document.getElementById("c-hp");
  hp.style.position = "absolute";
  hp.style.left = "-9999px";
  hp.style.width = "1px";
  hp.style.height = "1px";

  form.onsubmit = async (e) => {
    e.preventDefault();
    const author = document.getElementById("c-author").value.trim();
    const content = document.getElementById("c-content").value.trim();
    const email = document.getElementById("c-email").value.trim();
    const msg = document.getElementById("c-msg");
    // 蜜罐命中：静默成功，不存储
    if (hp.value) { msg.textContent = "提交成功"; form.reset(); return; }
    if (!author || !content) { msg.textContent = "请填写昵称和评论内容"; return; }
    const res = await api("/comments", {
      method: "POST",
      body: JSON.stringify({ post_slug: slug, author, email, content, hp: hp.value }),
    });
    const r = await res.json().catch(() => ({}));
    if (res.ok) {
      msg.textContent = "评论已发布";
      form.reset();
      loadComments(slug);
    } else {
      msg.textContent = r.error || "提交失败";
    }
  };
}

async function loadComments(slug) {
  const list = document.getElementById("comment-list");
  if (!list) return;
  try {
    const res = await api("/comments?post=" + encodeURIComponent(slug));
    const cs = await res.json();
    if (!Array.isArray(cs) || !cs.length) {
      list.innerHTML = `<div class="empty">还没有评论，来抢沙发吧。</div>`;
      return;
    }
    let html = "";
    for (const c of cs) {
      html += `<div class="comment-item">
        <div class="comment-head"><span class="comment-author">${escHtml(c.author)}</span><span class="comment-date">${fmtDate(c.created_at)}</span></div>
        <div class="comment-body">${escHtml(c.content)}</div>
      </div>`;
    }
    list.innerHTML = html;
  } catch {
    list.innerHTML = `<div class="empty">评论加载失败</div>`;
  }
}

async function renderTimeline() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="empty">加载中…</div>`;
  const posts = await (await api("/posts")).json();
  if (!posts.length) {
    app.innerHTML = `<h1 class="page-title">时间轴</h1><div class="empty">暂无文章</div>`;
    return;
  }
  const groups = {};
  for (const p of posts) {
    const y = new Date(p.created_at).getFullYear();
    (groups[y] = groups[y] || []).push(p);
  }
  const years = Object.keys(groups).sort((a, b) => b - a);
  let html = `<h1 class="page-title">时间轴</h1>`;
  for (const y of years) {
    html += `<h2 class="year">${y}</h2><div class="post-list">`;
    for (const p of groups[y]) {
      html += `<article class="post-card"><h2><a href="#/post/${encodeURIComponent(p.slug)}">${p.title}</a></h2><div class="meta">${fmtDate(p.created_at)}</div>${tagsHtml(p)}</article>`;
    }
    html += `</div>`;
  }
  app.innerHTML = html;
  // 时间轴卡片整张可点击进入文章
  app.querySelectorAll(".post-card").forEach((card) => {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const a = card.querySelector("a");
      if (a) location.hash = a.getAttribute("href");
    });
  });
}

function renderFeed() {
  const app = document.getElementById("app");
  app.innerHTML = `<h1 class="page-title">动态</h1><div class="empty">还没有动态，去管理后台发点什么吧。</div>`;
}

// 搜索结果页：调用 /api/search（语义 + 关键词兜底），展示匹配文章
async function renderSearch() {
  const app = document.getElementById("app");
  const m = (location.hash || "").match(/^#\/search\?q=(.+)$/);
  const q = m ? decodeURIComponent(m[1]) : "";
  app.innerHTML = `<h1 class="page-title">搜索</h1><div class="empty">加载中…</div>`;
  if (!q) {
    app.innerHTML = `<h1 class="page-title">搜索</h1><div class="empty">请输入关键词。</div>`;
    return;
  }
  let results = [];
  try {
    const r = await api("/search?q=" + encodeURIComponent(q));
    const d = await r.json();
    results = d.results || [];
  } catch {}
  let html = `<h1 class="page-title">搜索：“${escHtml(q)}” <a class="btn btn-sm" href="#/" style="margin-left:10px">← 返回</a></h1>`;
  if (!results.length) {
    html += `<div class="empty">没有找到相关文章。</div>`;
    app.innerHTML = html;
    return;
  }
  html += `<div class="post-list">`;
  for (const p of results) {
    html += `<article class="post-card"><h2><a href="#/post/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a></h2><div class="meta">${fmtDate(p.created_at)}</div><div class="excerpt">${escHtml(p.excerpt || "")}</div>${tagsHtml(p)}</article>`;
  }
  html += `</div>`;
  app.innerHTML = html;
  app.querySelectorAll(".post-card").forEach((card) => {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const a = card.querySelector("a");
      if (a) location.hash = a.getAttribute("href");
    });
  });
}

function renderTags() {
  const hash = location.hash || "#/";
  const m = hash.match(/^#\/tags\/(.+)$/);
  if (m) {
    renderTagPosts(decodeURIComponent(m[1]));
    return;
  }
  renderTagCloud();
}

// 标签云：列出全部标签及文章数，点击进入该标签下的文章列表
async function renderTagCloud() {
  const app = document.getElementById("app");
  app.innerHTML = `<h1 class="page-title">标签</h1><div class="empty">加载中…</div>`;
  try {
    const cloud = await (await api("/tags")).json();
    if (!Array.isArray(cloud) || !cloud.length) {
      app.innerHTML = `<h1 class="page-title">标签</h1><div class="empty">还没有标签，去文章编辑器加标签或用「🏷 AI 分类」吧。</div>`;
      return;
    }
    let html = `<h1 class="page-title">标签</h1><div class="tag-cloud">`;
    for (const t of cloud) {
      html += `<a class="tag-chip" href="#/tags/${encodeURIComponent(t.tag)}">${escHtml(t.tag)} <span class="tag-count">${t.count}</span></a>`;
    }
    html += `</div>`;
    app.innerHTML = html;
  } catch {
    app.innerHTML = `<h1 class="page-title">标签</h1><div class="empty">标签加载失败</div>`;
  }
}

// 某标签下的文章列表
async function renderTagPosts(tag) {
  const app = document.getElementById("app");
  app.innerHTML = `<h1 class="page-title">标签</h1><div class="empty">加载中…</div>`;
  let posts = [];
  try {
    posts = await (await api("/posts")).json();
  } catch {
    app.innerHTML = `<h1 class="page-title">标签：${escHtml(tag)}</h1><div class="empty">文章加载失败</div>`;
    return;
  }
  const filtered = (Array.isArray(posts) ? posts : []).filter((p) => parseTags(p.tags).includes(tag));
  let html = `<h1 class="page-title">标签：${escHtml(tag)} <a class="btn btn-sm" href="#/tags" style="margin-left:10px">← 全部标签</a></h1>`;
  if (!filtered.length) {
    html += `<div class="empty">该标签下还没有文章。</div>`;
    app.innerHTML = html;
    return;
  }
  html += `<div class="post-list">`;
  for (const p of filtered) {
    html += `<article class="post-card"><h2><a href="#/post/${encodeURIComponent(p.slug)}">${p.title}</a></h2><div class="meta">${fmtDate(p.created_at)}</div><div class="excerpt">${p.excerpt || ""}</div>${tagsHtml(p)}</article>`;
  }
  html += `</div>`;
  app.innerHTML = html;
  app.querySelectorAll(".post-card").forEach((card) => {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const a = card.querySelector("a");
      if (a) location.hash = a.getAttribute("href");
    });
  });
}

function renderFriends() {
  const app = document.getElementById("app");
  const friends = [
    { name: "WorkBuddy", url: "https://www.workbuddy.cn" },
  ];
  let html = `<h1 class="page-title">朋友们</h1><div class="friend-list">`;
  for (const f of friends) {
    html += `<a class="friend" href="${f.url}" target="_blank" rel="noopener">${f.name}</a>`;
  }
  html += `</div>`;
  app.innerHTML = html;
}

function renderAbout() {
  const app = document.getElementById("app");
  const about =
    SITE_ABOUT ||
    "这是一个部署在 Cloudflare 上的博客平台，使用 Pages + Workers + D1 + R2 构建，支持 Markdown 写作与图形化管理后台。\n\n由 **hujinhuan-droid** 维护。";
  app.innerHTML = `<div class="post-detail">
    <h1>关于</h1>
    <div class="content">${renderMarkdown(about)}</div>
  </div>`;
  window.highlightCode(app);
}

// 手机端汉堡菜单开关
function bindNavToggle() {
  const toggle = document.getElementById("navToggle");
  if (!toggle) return;
  toggle.onclick = () => document.querySelector(".topbar")?.classList.toggle("open");
}

function route() {
  // 路径式入口（/login、/admin）重定向到哈希路由，避免用户直接输入地址时只看到首页
  const path = location.pathname;
  if (path === "/login" || path === "/admin") {
    location.replace("/#/admin");
    return;
  }
  const hash = location.hash || "#/";
  if (!hash.startsWith("#/admin")) document.body.classList.remove("admin-mode");
  if (hash.startsWith("#/admin")) {
    renderAdmin();
    return;
  }
  if (hash.startsWith("#/post/")) {
    renderPost(decodeURIComponent(hash.slice("#/post/".length)));
    return;
  }
  if (hash.startsWith("#/timeline")) return renderTimeline();
  if (hash.startsWith("#/feed")) return renderFeed();
  if (hash.startsWith("#/search")) return renderSearch();
  if (hash.startsWith("#/tags")) return renderTags();
  if (hash.startsWith("#/friends")) return renderFriends();
  if (hash.startsWith("#/about")) return renderAbout();
  renderHome();
}

async function init() {
  try {
    const res = await api("/auth/me");
    const data = await res.json();
    CURRENT_USER = data.user || null;
  } catch {
    CURRENT_USER = null;
  }
  renderNav();
  bindNavToggle();
  renderSiteStats();
  // 拉取站点设置并应用到页面
  try {
    const sr = await api("/settings");
    const sd = await sr.json();
    if (sd && typeof sd === "object") applySettings(sd);
  } catch {}
  window.addEventListener("hashchange", () => {
    document.querySelector(".topbar")?.classList.remove("open");
    route();
  });
  route();
}

init();
