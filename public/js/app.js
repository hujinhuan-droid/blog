// 前端路由 + 读者端视图 + 导航 + 站点统计
let CURRENT_USER = null;

// 顶部主导航（与底部站点统计平行对齐）
const MENUS = [
  { label: "文章", hash: "#/" },
  { label: "时间轴", hash: "#/timeline" },
  { label: "动态", hash: "#/feed" },
  { label: "标签", hash: "#/tags" },
  { label: "朋友们", hash: "#/friends" },
  { label: "关于", hash: "#/about" },
];

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

function renderNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = "";
  const menu = el(`<div class="menu"></div>`);
  for (const m of MENUS) {
    menu.appendChild(el(`<a class="menu-link" href="${m.hash}">${m.label}</a>`));
  }
  nav.appendChild(menu);

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
  box.innerHTML =
    `<span>文章 ${count}</span>` +
    `<span>标签 0</span>` +
    `<span>运行 ${days} 天</span>` +
    `<span>访客 —</span>`;
}

async function renderHome() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="empty">加载中…</div>`;
  const res = await api("/posts");
  const posts = await res.json();
  if (!posts.length) {
    app.innerHTML = `<div class="empty">还没有文章，去管理后台写第一篇吧。</div>`;
    return;
  }
  const list = el(`<div class="post-list"></div>`);
  for (const p of posts) {
    const card = el(`
      <article class="post-card">
        <h2><a href="#/post/${p.slug}">${p.title}</a>${
          p.visibility === "private" ? `<span class="badge">私密</span>` : ""
        }</h2>
        <div class="meta">${fmtDate(p.created_at)}</div>
        <div class="excerpt">${p.excerpt || ""}</div>
      </article>`);
    list.appendChild(card);
  }
  app.innerHTML = "";
  app.appendChild(list);
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
    <div class="content">${renderMarkdown(p.content)}</div>`;
  app.innerHTML = "";
  app.appendChild(detail);
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
      html += `<article class="post-card"><h2><a href="#/post/${p.slug}">${p.title}</a></h2><div class="meta">${fmtDate(p.created_at)}</div></article>`;
    }
    html += `</div>`;
  }
  app.innerHTML = html;
}

function renderFeed() {
  const app = document.getElementById("app");
  app.innerHTML = `<h1 class="page-title">动态</h1><div class="empty">还没有动态，去管理后台发点什么吧。</div>`;
}

function renderTags() {
  const app = document.getElementById("app");
  app.innerHTML = `<h1 class="page-title">标签</h1><div class="empty">标签功能即将上线，敬请期待。</div>`;
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
  app.innerHTML = `<div class="post-detail">
    <h1>关于</h1>
    <p>这是一个部署在 Cloudflare 上的博客平台，使用 Pages + Workers + D1 + R2 构建，支持 Markdown 写作与图形化管理后台。</p>
    <p>由 <strong>hujinhuan-droid</strong> 维护。</p>
  </div>`;
}

function route() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/admin")) {
    renderAdmin();
    return;
  }
  if (hash.startsWith("#/post/")) {
    renderPost(hash.slice("#/post/".length));
    return;
  }
  if (hash.startsWith("#/timeline")) return renderTimeline();
  if (hash.startsWith("#/feed")) return renderFeed();
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
  renderSiteStats();
  window.addEventListener("hashchange", route);
  route();
}

init();
