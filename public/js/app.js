// 前端路由 + 读者端视图 + 导航
let CURRENT_USER = null;

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
  if (CURRENT_USER) {
    const u = CURRENT_USER;
    if (u.role === "admin") {
      nav.appendChild(el(`<a class="btn btn-sm" href="#/admin">管理后台</a>`));
    }
    const user = el(
      `<span class="user">${u.avatar ? `<img class="avatar" src="${u.avatar}"/>` : ""}${u.username}</span>`
    );
    nav.appendChild(user);
    const logout = el(`<button class="btn btn-sm">退出</button>`);
    logout.onclick = async () => {
      await api("/auth/logout", { method: "POST" });
      CURRENT_USER = null;
      renderNav();
      location.hash = "#/";
    };
    nav.appendChild(logout);
  } else {
    nav.appendChild(el(`<a class="btn btn-sm btn-primary" href="#/admin">登录</a>`));
  }
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
  window.addEventListener("hashchange", route);
  route();
}

init();
