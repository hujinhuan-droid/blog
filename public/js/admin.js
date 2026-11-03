// 管理后台（依赖 app.js 中的全局：CURRENT_USER / api / toast / el / fmtDate / renderMarkdown / renderNav）

// 看板下钻用的缓存：文章列表 & 有评论的文章 slug 集合
let DASH_POSTS = [];
let DASH_COMMENTED = null; // null=未加载；Set=已加载的 slug 集合


// 后台内容容器（侧边栏布局下为 #admin-main，登录态外退化为 #app）
function adminMain() {
  return document.getElementById("admin-main") || document.getElementById("app");
}

// 构建后台外壳：左侧分类导航 + 右侧内容区，并把前台顶栏/页脚交给 admin-mode 隐藏
function buildAdminShell() {
  const app = document.getElementById("app");
  if (app.querySelector(".admin-shell")) return;
  const u = CURRENT_USER || {};
  const uname = escHtml(u.username || "admin");
  app.innerHTML = `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <div class="admin-brand" id="adminBrand">
          <span class="admin-logo"><i data-lucide="bot"></i></span>
          <div class="admin-brand-txt">
            <div class="admin-brand-name">AI Agent</div>
            <div class="admin-brand-sub">管理后台</div>
          </div>
          <span class="caret brand-caret">▾</span>
          <div class="admin-brand-menu" id="adminBrandMenu" role="menu">
            <button type="button" class="admin-menu-item" id="btnChangePw2"><i data-lucide="key-round"></i> 修改密码</button>
            <button type="button" class="admin-menu-item danger" id="btnLogout2"><i data-lucide="log-out"></i> 登出</button>
          </div>
        </div>
        <nav class="admin-nav">
          <a class="admin-nav-item" href="#/admin" data-nav="overview"><span class="ico"><i data-lucide="layout-dashboard"></i></span><span>概览</span></a>
          <a class="admin-nav-item" href="#/admin/posts" data-nav="posts"><span class="ico"><i data-lucide="file-text"></i></span><span>文章</span></a>
          <a class="admin-nav-item" href="#/admin/comments" data-nav="comments"><span class="ico"><i data-lucide="message-square"></i></span><span>评论审核</span></a>
          <a class="admin-nav-item" href="#/admin/media" data-nav="media"><span class="ico"><i data-lucide="images"></i></span><span>媒体库</span></a>
          <a class="admin-nav-item" href="#/admin/trash" data-nav="trash"><span class="ico"><i data-lucide="trash-2"></i></span><span>回收站</span></a>
          <a class="admin-nav-item" href="#/admin/analytics" data-nav="analytics"><span class="ico"><i data-lucide="bar-chart-2"></i></span><span>数据分析</span></a>
          <a class="admin-nav-item" href="#/admin/audit" data-nav="audit"><span class="ico"><i data-lucide="shield"></i></span><span>审计日志</span></a>
          <a class="admin-nav-item" href="#/admin/settings" data-nav="settings"><span class="ico"><i data-lucide="settings"></i></span><span>设置</span></a>
        </nav>
        <div class="admin-side-foot">
          <button type="button" class="admin-user" id="adminUserBtn" aria-haspopup="true" aria-expanded="false">
            <span class="admin-ava">${uname.slice(0, 1).toUpperCase()}</span>
            <div class="admin-user-txt">
              <div class="admin-un">${uname}</div>
              <div class="admin-role">管理员</div>
            </div>
            <span class="caret">▾</span>
          </button>
          <div class="admin-user-menu" id="adminUserMenu" role="menu">
            <button type="button" class="admin-menu-item" id="btnChangePw"><i data-lucide="key-round"></i> 修改密码</button>
            <button type="button" class="admin-menu-item danger" id="btnLogout"><i data-lucide="log-out"></i> 登出</button>
          </div>
        </div>
      </aside>
      <div class="admin-content">
        <header class="admin-topbar">
          <span class="admin-top-title" id="admin-top-title">概览</span>
          <a class="admin-home-btn" href="#/" title="返回网站首页"><i data-lucide="home"></i> 返回首页</a>
        </header>
        <div class="admin-main" id="admin-main"></div>
      </div>
    </div>`;
  bindAdminUserMenu();
}

// 绑定侧边栏左下角「管理员」按钮：下拉展示「修改密码 / 登出」，点击外部自动收起
function bindAdminUserMenu() {
  const btn = document.getElementById("adminUserBtn");
  const menu = document.getElementById("adminUserMenu");
  if (!btn || !menu) return;
  if (btn.dataset.bound) return; // 仅绑定一次
  btn.dataset.bound = "1";

  const toggle = (open) => {
    const isOpen = open ?? !menu.classList.contains("open");
    menu.classList.toggle("open", isOpen);
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      toggle(false);
    }
  });

  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout)
    btnLogout.onclick = async () => {
      toggle(false);
      await api("/auth/logout", { method: "POST" });
      CURRENT_USER = null;
      renderNav();
      location.hash = "#/";
    };

  const btnChangePw = document.getElementById("btnChangePw");
  if (btnChangePw) btnChangePw.onclick = () => {
    toggle(false);
    openChangePwModal();
  };

  // 手机端：顶部品牌区「AI Agent 管理后台」点击展开下拉（修改密码 / 登出）
  const brandBtn = document.getElementById("adminBrand");
  const brandMenu = document.getElementById("adminBrandMenu");
  if (brandBtn && brandMenu && !brandBtn.dataset.bound) {
    brandBtn.dataset.bound = "1";
    const toggleBrand = (open) => {
      const isOpen = open ?? !brandMenu.classList.contains("open");
      brandMenu.classList.toggle("open", isOpen);
      brandBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    };
    brandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleBrand();
    });
    document.addEventListener("click", (e) => {
      if (!brandMenu.contains(e.target) && !brandBtn.contains(e.target)) toggleBrand(false);
    });
    const bLogout2 = document.getElementById("btnLogout2");
    if (bLogout2) bLogout2.onclick = async () => {
      toggleBrand(false);
      await api("/auth/logout", { method: "POST" });
      CURRENT_USER = null;
      renderNav();
      location.hash = "#/";
    };
    const bCpw2 = document.getElementById("btnChangePw2");
    if (bCpw2) bCpw2.onclick = () => {
      toggleBrand(false);
      openChangePwModal();
    };
  }
}

// 修改密码弹窗
function openChangePwModal() {
  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  ov.innerHTML = `
    <div class="modal sm">
      <div class="modal-head">修改密码</div>
      <label>当前密码</label>
      <input type="password" id="cpw-current" autocomplete="current-password" />
      <label>新密码（至少 6 位）</label>
      <input type="password" id="cpw-new" autocomplete="new-password" />
      <label>确认新密码</label>
      <input type="password" id="cpw-confirm" autocomplete="new-password" />
      <div class="modal-err" id="cpw-err"></div>
      <div class="modal-actions">
        <button class="btn" id="cpw-cancel">取消</button>
        <button class="btn btn-primary" id="cpw-submit">保存</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener("click", (e) => {
    if (e.target === ov) close();
  });
  ov.querySelector("#cpw-cancel").onclick = close;
  ov.querySelector("#cpw-submit").onclick = async () => {
    const cur = ov.querySelector("#cpw-current").value || "";
    const npw = ov.querySelector("#cpw-new").value || "";
    const conf = ov.querySelector("#cpw-confirm").value || "";
    const errEl = ov.querySelector("#cpw-err");
    errEl.textContent = "";
    if (npw.length < 6) {
      errEl.textContent = "新密码至少 6 位";
      return;
    }
    if (npw !== conf) {
      errEl.textContent = "两次输入的新密码不一致";
      return;
    }
    const submitBtn = ov.querySelector("#cpw-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "保存中…";
    try {
      const res = await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: cur, new_password: npw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errEl.textContent = data.error || "修改失败";
        submitBtn.disabled = false;
        submitBtn.textContent = "保存";
        return;
      }
      toast("密码已修改");
      close();
    } catch (e) {
      errEl.textContent = "网络错误，请重试";
      submitBtn.disabled = false;
      submitBtn.textContent = "保存";
    }
  };
}

// 根据当前 hash 高亮侧边栏对应项，并更新顶部面包屑
function setAdminActive() {
  const hash = location.hash || "#/admin";
  const map = [
    [/^#\/admin\/(edit|new)/, "posts"],
    [/^#\/admin\/posts/, "posts"],
    [/^#\/admin\/drill/, "posts"],
    [/^#\/admin\/comments/, "comments"],
    [/^#\/admin\/trash/, "trash"],
    [/^#\/admin\/analytics/, "analytics"],
    [/^#\/admin\/audit/, "audit"],
    [/^#\/admin\/media/, "media"],
    [/^#\/admin\/settings/, "settings"],
    [/^#\/admin(\/)?$/, "overview"],
  ];
  let active = "overview";
  for (const [re, name] of map) {
    if (re.test(hash)) {
      active = name;
      break;
    }
  }
  document.querySelectorAll(".admin-nav-item").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("data-nav") === active);
  });
  const titleEl = document.getElementById("admin-top-title");
  if (titleEl) {
    let crumb = "概览";
    if (/^#\/admin\/edit\//.test(hash)) crumb = "编辑文章";
    else if (/^#\/admin\/new/.test(hash)) crumb = "新建文章";
    else if (/^#\/admin\/posts/.test(hash)) crumb = "文章";
    else if (/^#\/admin\/drill/.test(hash)) crumb = "文章列表";
    else if (/^#\/admin\/comments/.test(hash)) crumb = "评论审核";
    else if (/^#\/admin\/trash/.test(hash)) crumb = "回收站";
    else if (/^#\/admin\/analytics/.test(hash)) crumb = "数据分析";
    else if (/^#\/admin\/audit/.test(hash)) crumb = "审计日志";
    else if (/^#\/admin\/media/.test(hash)) crumb = "媒体库";
    else if (/^#\/admin\/settings/.test(hash)) crumb = "设置";
    titleEl.textContent = crumb;
  }
}

// 设置后台顶栏标题
function setTitle(t) {
  const elx = document.getElementById("admin-top-title");
  if (elx) elx.textContent = t;
}

function renderAdmin() {
  if (!CURRENT_USER || CURRENT_USER.role !== "admin") {
    document.body.classList.remove("admin-mode");
    renderLogin();
    return;
  }
  document.body.classList.add("admin-mode");
  buildAdminShell();
  setAdminActive();
  const hash = location.hash;
  if (hash.startsWith("#/admin/edit/")) {
    renderEditor(decodeURIComponent(hash.slice("#/admin/edit/".length)));
    return;
  }
  if (hash.startsWith("#/admin/new")) {
    renderEditor(null);
    return;
  }
  if (hash.startsWith("#/admin/settings")) {
    renderSettings();
    return;
  }
  if (hash.startsWith("#/admin/media")) {
    renderMediaPage();
    return;
  }
  if (hash.startsWith("#/admin/posts")) {
    renderPostsTable();
    return;
  }
  if (hash.startsWith("#/admin/comments")) {
    renderCommentsModeration();
    return;
  }
  if (hash.startsWith("#/admin/trash")) {
    renderTrash();
    return;
  }
  if (hash.startsWith("#/admin/analytics")) {
    renderAnalytics();
    return;
  }
  if (hash.startsWith("#/admin/audit")) {
    renderAudit();
    return;
  }
  if (hash.startsWith("#/admin/drill/")) {
    openDrill(decodeURIComponent(hash.slice("#/admin/drill/".length)) || "all");
    return;
  }
  renderDashboard();
}

function renderLogin() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="login-card form">
      <h2>管理员登录</h2>
      <p class="muted">使用账号密码进入后台管理</p>
      <label>账号</label>
      <input type="text" id="uname" placeholder="admin" autocomplete="username" />
      <label>密码</label>
      <input type="password" id="pw" placeholder="密码" autocomplete="current-password" />
      <button class="btn btn-primary" id="pwLogin" style="margin-top:14px;width:100%">登录</button>
      <div class="divider">— 或 —</div>
      <a class="btn" href="/api/auth/login">使用 GitHub 登录</a>
    </div>`;
  const doLogin = async () => {
    const uname = (document.getElementById("uname").value || "").trim();
    const pw = (document.getElementById("pw").value || "").trim();
    if (!uname || !pw) {
      toast("请输入账号和密码");
      return;
    }
    const btn = document.getElementById("pwLogin");
    btn.disabled = true;
    btn.textContent = "登录中…";
    try {
      const res = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: uname, password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || "登录失败");
        return;
      }
      CURRENT_USER = data.user;
      renderNav();
      renderAdmin();
    } catch (e) {
      toast("登录请求失败：请检查网络，或改用备用域名 ai-agent-blog.hujinhuan.workers.dev 再试");
    } finally {
      btn.disabled = false;
      btn.textContent = "登录";
    }
  };
  document.getElementById("pwLogin").onclick = doLogin;
  app.querySelectorAll("#uname, #pw").forEach((inp) =>
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doLogin();
    })
  );
}

async function renderDashboard() {
  const app = adminMain();
  app.innerHTML = `<div class="empty">加载中…</div>`;
  const res = await api("/posts");
  const posts = await res.json();
  DASH_POSTS = Array.isArray(posts) ? posts : [];
  const wrap = el(`<div class="dash"></div>`);
  const head = el(`<div class="dash-head"></div>`);
  head.innerHTML = `<div>
      <h1 class="dash-title">概览</h1>
      <p class="dash-sub">站点内容总览与最近动态</p>
    </div>
    <a class="btn btn-primary" href="#/admin/new">＋ 新建文章</a>`;
  wrap.appendChild(head);
  // 数据看板
  let stats = null;
  try {
    const sr = await api("/stats");
    if (sr.ok) stats = await sr.json();
  } catch {}
  if (stats) {
    const maxc = Math.max(1, ...stats.recent7.map((d) => d.count));
    const bars = stats.recent7
      .map((d) => `<div class="bar" title="${d.date}: ${d.count} 篇" style="height:${Math.round((d.count / maxc) * 60) + 4}px"><span>${d.count}</span></div>`)
      .join("");
    const panel = el(`<div class="stats-panel"></div>`);
    panel.innerHTML = `
      <div class="stat-card clickable" data-drill="all" title="点击查看全部文章"><div class="stat-num">${stats.total}</div><div class="stat-lbl">文章</div></div>
      <div class="stat-card clickable" data-drill="public" title="点击查看公开文章"><div class="stat-num">${stats.public}</div><div class="stat-lbl">公开</div></div>
      <div class="stat-card clickable" data-drill="private" title="点击查看私密文章"><div class="stat-num">${stats.private}</div><div class="stat-lbl">私密</div></div>
      <div class="stat-card clickable" data-drill="comments" title="点击查看有评论的文章"><div class="stat-num">${stats.comments}</div><div class="stat-lbl">评论</div></div>
      <div class="stat-card clickable" data-drill="tags" title="点击查看已打标签的文章"><div class="stat-num">${stats.tags}</div><div class="stat-lbl">标签</div></div>
      <div class="stat-card clickable" data-drill="ai" title="点击查看使用过 AI 的文章"><div class="stat-num">${stats.aiUsage}</div><div class="stat-lbl">AI 调用</div></div>
      <div class="stat-card"><div class="stat-num">${stats.todayViews || 0}</div><div class="stat-lbl">当天访问量</div></div>
      <div class="stat-card"><div class="stat-num">${stats.totalViews || 0}</div><div class="stat-lbl">全部访问量</div></div>
      <div class="stat-chart"><div class="stat-chart-title">近 7 天发布</div><div class="bars">${bars}</div></div>`;
    wrap.appendChild(panel);
    // 统计卡片点击下钻到文章标题列表（走正式路由，保证返回/导航按钮可用）
    panel.querySelectorAll(".stat-card.clickable").forEach((card) => {
      card.onclick = () => {
        location.hash = "#/admin/drill/" + card.getAttribute("data-drill");
      };
    });
  }
  // 最近文章
  const recent = DASH_POSTS.slice()
    .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
    .slice(0, 5);
  const sec = el(`<div class="dash-section"></div>`);
  sec.innerHTML = `<div class="dash-section-head"><h2>最近文章</h2><a class="link-more" href="#/admin/posts">查看全部 →</a></div>`;
  if (!recent.length) {
    sec.appendChild(el(`<div class="empty">还没有文章，点右上角「＋ 新建文章」开始吧。</div>`));
  } else {
    const list = el(`<div class="mini-list"></div>`);
    for (const p of recent) {
      const row = el(`<a class="mini-item" href="#/admin/edit/${encodeURIComponent(p.slug)}"></a>`);
      const tg = parseTags(p.tags);
      row.innerHTML = `<div class="mini-main">
          <div class="mini-title">${escHtml(p.title)}</div>
          <div class="mini-sub">${p.visibility === "private" ? "私密" : "公开"}${tg.length ? " · " + tg.slice(0, 3).join("、") : ""} · ${fmtDate(p.updated_at)}</div>
        </div>
        <span class="mini-go"><i data-lucide="pencil"></i></span>`;
      list.appendChild(row);
    }
    sec.appendChild(list);
  }
  wrap.appendChild(sec);

  app.innerHTML = "";
  app.appendChild(wrap);
}

// 文章管理：列表 + 勾选批量 AI + 重建索引
async function renderPostsTable() {
  const app = adminMain();
  app.innerHTML = `<div class="empty">加载中…</div>`;
  const res = await api("/posts");
  const posts = await res.json();
  DASH_POSTS = Array.isArray(posts) ? posts : [];
  const wrap = el(`<div class="dash"></div>`);

  const head = el(`<div class="dash-head"></div>`);
  head.innerHTML = `<div>
      <h1 class="dash-title">文章管理</h1>
      <p class="dash-sub">共 ${posts.length} 篇 · 勾选后可批量 AI 处理</p>
    </div>
    <a class="btn btn-primary" href="#/admin/new">＋ 新建文章</a>`;
  wrap.appendChild(head);

  const tbar = el(`<div class="posts-toolbar"></div>`);
  tbar.innerHTML = `
    <button class="btn" id="reindex"><i data-lucide="brain"></i> 重建搜索索引</button>
    <button class="btn" id="batch-notes" disabled><i data-lucide="bot"></i> 批量 AI 备注</button>
    <button class="btn" id="batch-tags" disabled><i data-lucide="tags"></i> 批量 AI 分类</button>
    <div class="bulk-bar" id="bulkBar" style="display:none">
      <span class="bulk-info">已选 <b id="bulkCount">0</b> 篇：</span>
      <button class="btn btn-sm" data-act="publish">发布</button>
      <button class="btn btn-sm" data-act="draft">转草稿</button>
      <button class="btn btn-sm" data-act="private">转私密</button>
      <button class="btn btn-sm btn-warn" data-act="delete">进回收站</button>
      <button class="btn btn-sm btn-danger" data-act="purge">彻底删除</button>
    </div>`;
  wrap.appendChild(tbar);

  if (!posts.length) {
    wrap.appendChild(el(`<div class="empty">还没有文章。<a href="#/admin/new">新建一篇</a>。</div>`));
    app.innerHTML = "";
    app.appendChild(wrap);
    return;
  }

  const table = el(`<table class="admin-table"></table>`);
  table.innerHTML = `<thead><tr><th style="width:36px"><input type="checkbox" id="sel-all" /></th><th>标题</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>`;
  const tbody = el(`<tbody></tbody>`);
  for (const p of posts) {
    const tr = el(`<tr></tr>`);
    tr.innerHTML = `
      <td><input type="checkbox" class="row-sel" data-id="${p.id}" /></td>
      <td class="cell-title">${escHtml(p.title)}</td>
      <td><span class="badge ${p.visibility === "private" ? "badge-lock" : "badge-public"}">${p.visibility === "private" ? "私密" : "公开"}</span></td>
      <td>${fmtDate(p.updated_at)}</td>
      <td class="cell-ops">
        <a class="btn btn-sm" href="#/post/${encodeURIComponent(p.slug)}">查看</a>
        <a class="btn btn-sm" href="#/admin/edit/${encodeURIComponent(p.slug)}">编辑</a>
        <button class="btn btn-sm btn-danger" data-id="${p.id}">删除</button>
      </td>`;
    tr.querySelector(".btn-danger").onclick = async () => {
      if (!confirm(`确定将《${p.title}》移入回收站？可在回收站恢复。`)) return;
      const r = await api("/posts/" + p.id, { method: "DELETE" });
      if (r.ok) {
        toast("已移入回收站");
        renderPostsTable();
      } else toast("操作失败");
    };
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  app.innerHTML = "";
  app.appendChild(wrap);

  const batchBtn = document.getElementById("batch-notes");
  const batchTagsBtn = document.getElementById("batch-tags");
  const reindexBtn = document.getElementById("reindex");
  const selAll = document.getElementById("sel-all");
  const updateBatchBtn = () => {
    const n = app.querySelectorAll(".row-sel:checked").length;
    batchBtn.disabled = n === 0;
    batchBtn.innerHTML = n ? `<i data-lucide="bot"></i> 批量 AI 备注(${n})` : `<i data-lucide="bot"></i> 批量 AI 备注`;
    batchTagsBtn.disabled = n === 0;
    batchTagsBtn.innerHTML = n ? `<i data-lucide="tags"></i> 批量 AI 分类(${n})` : `<i data-lucide="tags"></i> 批量 AI 分类`;
    const bar = document.getElementById("bulkBar");
    if (bar) {
      bar.style.display = n ? "inline-flex" : "none";
      const c = document.getElementById("bulkCount");
      if (c) c.textContent = n;
    }
  };
  if (selAll)
    selAll.onchange = () => {
      app.querySelectorAll(".row-sel").forEach((cb) => (cb.checked = selAll.checked));
      updateBatchBtn();
    };
  app.querySelectorAll(".row-sel").forEach((cb) => (cb.onchange = updateBatchBtn));
  batchBtn.onclick = async () => {
    const ids = [...app.querySelectorAll(".row-sel:checked")].map((cb) => Number(cb.dataset.id));
    if (!ids.length) return;
    batchBtn.disabled = true;
    const old = batchBtn.textContent;
    batchBtn.textContent = "处理中…";
    try {
      const res = await api("/ai/batch-notes", { method: "POST", body: JSON.stringify({ ids }) });
      const r = await res.json().catch(() => ({}));
      if (res.ok) toast(`批量完成：${r.ok} 成功 / ${r.total - r.ok} 失败`);
      else toast(r.error || "批量失败");
      renderPostsTable();
    } catch (e) {
      toast("请求异常");
    } finally {
      batchBtn.disabled = false;
      batchBtn.textContent = old;
    }
  };
  batchTagsBtn.onclick = async () => {
    const ids = [...app.querySelectorAll(".row-sel:checked")].map((cb) => Number(cb.dataset.id));
    if (!ids.length) return;
    batchTagsBtn.disabled = true;
    const old = batchTagsBtn.textContent;
    batchTagsBtn.textContent = "分类中…";
    try {
      const res = await api("/ai/batch-tags", { method: "POST", body: JSON.stringify({ ids }) });
      const r = await res.json().catch(() => ({}));
      if (res.ok) toast(`批量分类完成：${r.ok} 成功 / ${r.total - r.ok} 失败`);
      else toast(r.error || "批量分类失败");
      renderPostsTable();
    } catch (e) {
      toast("请求异常");
    } finally {
      batchTagsBtn.disabled = false;
      batchTagsBtn.textContent = old;
    }
  };
  const bulkBar = document.getElementById("bulkBar");
  if (bulkBar)
    bulkBar.onclick = async (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      const ids = [...app.querySelectorAll(".row-sel:checked")].map((cb) => Number(cb.dataset.id));
      if (!ids.length) return;
      const labels = { publish: "发布", draft: "转草稿", private: "转私密", delete: "移入回收站", purge: "彻底删除" };
      if (!confirm(`确定对选中的 ${ids.length} 篇文章执行「${labels[act]}」？` + (act === "purge" ? "（彻底删除不可恢复）" : ""))) return;
      btn.disabled = true;
      try {
        const res = await api("/posts/bulk", { method: "POST", body: JSON.stringify({ ids, action: act }) });
        const r = await res.json().catch(() => ({}));
        if (res.ok) toast(`已${labels[act]} ${r.count} 篇`);
        else toast(r.error || "操作失败");
        renderPostsTable();
      } catch {
        toast("请求异常");
      } finally {
        btn.disabled = false;
      }
    };
  reindexBtn.onclick = async () => {
    reindexBtn.disabled = true;
    const old = reindexBtn.textContent;
    reindexBtn.textContent = "重建中…";
    try {
      const r = await api("/ai/embed-all", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (r.ok) toast(`搜索索引已重建：${d.ok} 成功 / ${d.fail} 失败`);
      else toast(d.error || "重建失败");
    } catch {
      toast("请求异常");
    } finally {
      reindexBtn.disabled = false;
      reindexBtn.textContent = old;
    }
  };
}

// 媒体库整页（增强：统计 / 批量删 / 孤儿清理 / 大图预览）
async function renderMediaPage() {
  const app = adminMain();
  app.innerHTML = `<div class="empty">加载中…</div>`;
  const wrap = el(`<div class="dash"></div>`);
  wrap.innerHTML = `<div class="dash-head"><div>
      <h1 class="dash-title">媒体库</h1>
      <p class="dash-sub">管理已上传到 R2 的图片（含孤儿检测与批量清理）</p>
    </div></div>`;
  const tool = el(`<div class="media-toolbar"></div>`);
  tool.innerHTML = `
    <input type="file" id="media-file" accept="image/*" multiple />
    <button class="btn btn-primary" id="media-upload">上传</button>
    <span class="muted" id="media-stats">统计中…</span>
    <span style="flex:1"></span>
    <button class="btn" id="media-clean-orphans">清理孤儿文件</button>
    <button class="btn btn-danger" id="media-bulk-del" disabled>批量删除选中</button>`;
  wrap.appendChild(tool);
  const grid = el(`<div class="media-grid" id="media-grid"></div>`);
  wrap.appendChild(grid);
  app.innerHTML = "";
  app.appendChild(wrap);

  let selected = new Set();

  const fmtSize = (b) => {
    if (!b && b !== 0) return "-";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / 1024 / 1024).toFixed(2) + " MB";
  };

  const load = async () => {
    grid.innerHTML = `<div class="empty">加载中…</div>`;
    const res = await api("/media");
    const d = await res.json().catch(() => ({ objects: [] }));
    const items = d.objects || [];
    selected = new Set();
    const orphans = items.filter((x) => x.orphan).length;
    const stats = document.getElementById("media-stats");
    if (stats) stats.textContent = `共 ${items.length} 个文件 · 占用 ${fmtSize(d.totalSize)} · 孤儿 ${orphans} 个`;
    const bulkBtn = document.getElementById("media-bulk-del");
    if (bulkBtn) bulkBtn.disabled = true;
    if (!items.length) {
      grid.innerHTML = `<div class="empty">还没有图片，先上传一张吧。</div>`;
      return;
    }
    grid.innerHTML = "";
    for (const it of items) {
      const cell = el(`<div class="media-cell ${it.orphan ? "media-orphan" : ""}"></div>`);
      const fname = String(it.key || it.url || "").split("/").pop();
      const sizeStr = fmtSize(it.size);
      cell.innerHTML = `
        <label class="media-check"><input type="checkbox" data-key="${escHtml(it.key)}" /></label>
        <img src="${it.url}" alt="" loading="lazy" />
        <div class="media-meta" title="${escHtml(fname)}">${escHtml(fname)}</div>
        <div class="media-sub">${sizeStr}${it.orphan ? " · <span class='warn'>孤儿</span>" : ""}</div>
        <div class="media-actions">
          <button class="btn btn-sm" data-act="copy">链接</button>
          <button class="btn btn-sm" data-act="preview">预览</button>
          <button class="btn btn-sm btn-danger" data-act="del">删除</button>
        </div>`;
      cell.querySelector("img").onclick = () => previewImage(it.url, fname);
      cell.querySelector('[data-act="preview"]').onclick = () => previewImage(it.url, fname);
      cell.querySelector('[data-act="copy"]').onclick = async () => {
        try {
          await navigator.clipboard.writeText(it.url);
          toast("链接已复制");
        } catch {
          toast(it.url);
        }
      };
      cell.querySelector('[data-act="del"]').onclick = async () => {
        if (!confirm("确定删除该图片？")) return;
        const r = await api("/media", { method: "DELETE", body: JSON.stringify({ key: it.key }) });
        if (r.ok) load();
        else toast("删除失败");
      };
      const cb = cell.querySelector("input[type=checkbox]");
      cb.onchange = () => {
        if (cb.checked) selected.add(it.key);
        else selected.delete(it.key);
        const b = document.getElementById("media-bulk-del");
        if (b) b.disabled = selected.size === 0;
      };
      grid.appendChild(cell);
    }
  };

  document.getElementById("media-bulk-del").onclick = async () => {
    if (!selected.size) return;
    if (!confirm(`确定批量删除选中的 ${selected.size} 个文件？此操作不可恢复。`)) return;
    const r = await api("/media/delete", {
      method: "POST",
      body: JSON.stringify({ keys: Array.from(selected) }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { toast(`已删除 ${d.count || selected.size} 个文件`); load(); }
    else toast(d.error || "批量删除失败");
  };

  document.getElementById("media-clean-orphans").onclick = async () => {
    if (!confirm("将删除所有未被任何文章引用的图片（孤儿文件），不可恢复。继续？")) return;
    const r = await api("/media/cleanup", { method: "POST", body: "{}" });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { toast(`已清理 ${d.count || 0} 个孤儿文件`); load(); }
    else toast(d.error || "清理失败");
  };

  document.getElementById("media-upload").onclick = async () => {
    const input = document.getElementById("media-file");
    const files = Array.from(input.files || []);
    if (!files.length) return toast("请选择文件");
    let ok = 0;
    for (const f of files) {
      const data = await fileToBase64(f);
      const r = await api("/upload", { method: "POST", body: JSON.stringify({ name: f.name, type: f.type, data }) });
      if (r.ok) ok++; else toast("上传失败：" + f.name);
    }
    toast(`已上传 ${ok}/${files.length}`);
    input.value = "";
    load();
  };
  load();
}

// 大图预览
function previewImage(url, name) {
  const ov = el(`<div class="img-preview-overlay"></div>`);
  ov.innerHTML = `<img src="${url}" alt="" /><div class="img-name">${escHtml(name || "")}</div>`;
  ov.onclick = () => ov.remove();
  document.body.appendChild(ov);
}

// 看板统计卡片下钻：按类型过滤文章，列出标题，点标题进入编辑
async function openDrill(type) {
  const app = adminMain();
  // 若直接访问下钻路由（如刷新），确保文章列表已加载
  if (!DASH_POSTS.length) {
    try {
      const pr = await api("/posts");
      const arr = pr.ok ? await pr.json() : [];
      DASH_POSTS = Array.isArray(arr) ? arr : [];
    } catch {
      DASH_POSTS = [];
    }
  }
  const TITLES = {
    all: "全部文章",
    public: "公开文章",
    private: "私密文章",
    comments: "有评论的文章",
    tags: "已打标签的文章",
    ai: "使用过 AI 的文章",
  };
  let list = DASH_POSTS.slice();
  if (type === "public") list = list.filter((p) => p.visibility === "public");
  else if (type === "private") list = list.filter((p) => p.visibility !== "public");
  else if (type === "tags") list = list.filter((p) => parseTags(p.tags).length > 0);
  else if (type === "ai") list = list.filter((p) => p.ai_notes && String(p.ai_notes).trim());
  else if (type === "comments") {
    app.innerHTML = `<div class="empty">加载中…</div>`;
    if (!DASH_COMMENTED) {
      try {
        const cr = await api("/comments");
        const arr = cr.ok ? await cr.json() : [];
        DASH_COMMENTED = new Set((Array.isArray(arr) ? arr : []).map((c) => c.post_slug).filter(Boolean));
      } catch {
        DASH_COMMENTED = new Set();
      }
    }
    list = list.filter((p) => DASH_COMMENTED.has(p.slug));
  }
  // 按更新时间倒序
  list.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));

  const wrap = el(`<div></div>`);
  const head = el(`<div class="admin-toolbar"></div>`);
  head.appendChild(el(`<a class="btn" href="#/admin">← 返回看板</a>`));
  head.appendChild(el(`<h2 style="margin:0">${TITLES[type] || "文章"}（${list.length}）</h2>`));
  wrap.appendChild(head);

  if (!list.length) {
    wrap.appendChild(el(`<div class="empty">没有符合条件的文章。</div>`));
    app.innerHTML = "";
    app.appendChild(wrap);
    return;
  }

  const ul = el(`<div class="drill-list"></div>`);
  for (const p of list) {
    const row = el(`<a class="drill-item" href="#/admin/edit/${encodeURIComponent(p.slug)}"></a>`);
    const sub = [];
    sub.push(p.visibility === "private" ? "私密" : "公开");
    const tg = parseTags(p.tags);
    if (tg.length) sub.push("标签：" + tg.slice(0, 3).join("、"));
    if (type === "ai" && p.ai_notes) sub.push("已生成 AI 备注");
    row.innerHTML = `<span class="drill-title">${p.title}</span><span class="drill-sub">${sub.join(" · ")} · ${fmtDate(p.updated_at)}</span>`;
    ul.appendChild(row);
  }
  wrap.appendChild(ul);
  app.innerHTML = "";
  app.appendChild(wrap);
}

async function renderEditor(slug) {
  const app = adminMain();
  let post = null;
  if (slug) {
    app.innerHTML = `<div class="empty">加载中…</div>`;
    const res = await api("/posts/" + encodeURIComponent(slug));
    if (res.ok) post = await res.json();
    else {
      app.innerHTML = `<div class="empty">文章不存在。</div>`;
      return;
    }
  }

  // 读取设置：决定是否显示 AI 按钮、使用哪个模型、是否启用违禁词检测
  let aiEnabled = true;
  let aiModel = "gemini-flash-latest";
  let moderationEnabled = true;
  try {
    const ss = await (await api("/settings")).json();
    if (ss && typeof ss === "object") {
      aiEnabled = ss.ai_enabled !== "0";
      if (ss.ai_model) aiModel = ss.ai_model;
      moderationEnabled = ss.moderation_enabled !== "0";
    }
  } catch {}

  const form = el(`<div class="form"></div>`);
  // 已有文章的标签初始化为「逗号分隔」文本，便于编辑
  let initialTags = "";
  if (post && post.tags) {
    try {
      const arr = JSON.parse(post.tags);
      initialTags = Array.isArray(arr) ? arr.join(", ") : String(arr || "");
    } catch {
      initialTags = "";
    }
  }
  form.innerHTML = `
    <h2>${slug ? "编辑文章" : "新建文章"}</h2>
    <label>标题</label>
    <input type="text" id="f-title" value="${post ? post.title.replace(/"/g, "&quot;") : ""}" />
    <label>可见性</label>
    <select id="f-visibility">
      <option value="public" ${post && post.visibility === "public" ? "selected" : ""}>公开</option>
      <option value="private" ${post && post.visibility === "private" ? "selected" : ""}>仅自己可见</option>
    </select>
    <label>发布状态</label>
    <select id="f-status">
      <option value="published" ${!post || post.status !== "draft" ? "selected" : ""}>立即发布</option>
      <option value="draft" ${post && post.status === "draft" ? "selected" : ""}>存为草稿</option>
    </select>
    <label>定时发布（可选，留空则按上面状态；设置时间后到点自动公开）</label>
    <input type="datetime-local" id="f-scheduled" value="${post && post.scheduled_at ? toLocalInput(post.scheduled_at) : ""}" />
    <label>封面图 URL（可选，可点「AI 配图」自动生成）</label>
    <input type="text" id="f-cover" value="${post && post.cover ? post.cover.replace(/"/g, "&quot;") : ""}" />
    <label>AI 配图提示词（可选，留空则根据标题+标签自动生成）</label>
    <input type="text" id="f-cover-prompt" placeholder="如：水墨风格的晨练插画" />
    <label>摘要（列表页展示，可点「📋 AI 摘要」自动生成；留空则自动截取正文前 120 字）</label>
    <textarea id="f-excerpt" style="min-height:70px" placeholder="留空则自动截取正文前 120 字">${post && post.excerpt ? post.excerpt : ""}</textarea>
    <label>标签（逗号分隔，用于文章分类；可点「AI 分类」自动生成）</label>
    <input type="text" id="f-tags" value="${escHtml(initialTags)}" placeholder="如：睡眠, 饮食, 运动" />
    <label>正文（Markdown，支持工具栏、代码高亮、表情、拖拽图片）</label>
    <div class="editor-toolbar" id="editor-toolbar">
      <button type="button" class="fmt-btn" data-act="bold" title="加粗"><span class="fmt-ico"><b>B</b></span><span class="fmt-label">加粗</span></button>
      <button type="button" class="fmt-btn" data-act="italic" title="斜体"><span class="fmt-ico"><i>I</i></span><span class="fmt-label">斜体</span></button>
      <button type="button" class="fmt-btn" data-act="strike" title="删除线"><span class="fmt-ico"><s>S</s></span><span class="fmt-label">删除线</span></button>
      <div class="fmt-dropdown">
        <button type="button" class="fmt-btn" data-act="h" title="标题"><span class="fmt-ico">H</span><span class="fmt-label">标题</span></button>
        <div class="fmt-menu popover" id="h-menu">
          <button type="button" class="fmt-menu-item" data-h="1">H1 一级标题</button>
          <button type="button" class="fmt-menu-item" data-h="2">H2 二级标题</button>
          <button type="button" class="fmt-menu-item" data-h="3">H3 三级标题</button>
          <button type="button" class="fmt-menu-item" data-h="4">H4 四级标题</button>
        </div>
      </div>
      <button type="button" class="fmt-btn" data-act="quote" title="引用"><span class="fmt-ico"><i data-lucide="quote"></i></span><span class="fmt-label">引用</span></button>
      <button type="button" class="fmt-btn" data-act="ul" title="无序列表"><span class="fmt-ico"><i data-lucide="list"></i></span><span class="fmt-label">列表</span></button>
      <button type="button" class="fmt-btn" data-act="ol" title="有序列表"><span class="fmt-ico"><i data-lucide="list-ordered"></i></span><span class="fmt-label">有序</span></button>
      <button type="button" class="fmt-btn" data-act="task" title="任务列表"><span class="fmt-ico"><i data-lucide="square-check"></i></span><span class="fmt-label">任务</span></button>
      <button type="button" class="fmt-btn" data-act="link" title="链接"><span class="fmt-ico"><i data-lucide="link"></i></span><span class="fmt-label">链接</span></button>
      <button type="button" class="fmt-btn" data-act="code" title="行内代码"><span class="fmt-ico"><i data-lucide="code"></i></span><span class="fmt-label">代码</span></button>
      <button type="button" class="fmt-btn" data-act="codeblock" title="代码块"><span class="fmt-ico"><i data-lucide="square-code"></i></span><span class="fmt-label">代码块</span></button>
      <button type="button" class="fmt-btn" data-act="table" title="表格"><span class="fmt-ico"><i data-lucide="table"></i></span><span class="fmt-label">表格</span></button>
      <button type="button" class="fmt-btn" data-act="hr" title="分割线"><span class="fmt-ico"><i data-lucide="minus"></i></span><span class="fmt-label">分割线</span></button>
      <button type="button" class="fmt-btn" data-act="toc" title="目录"><span class="fmt-ico"><i data-lucide="list"></i></span><span class="fmt-label">目录</span></button>
      <span class="toolbar-sep"></span>
      <button type="button" class="fmt-btn" data-act="emoji" title="插入表情"><span class="fmt-ico"><i data-lucide="smile"></i></span><span class="fmt-label">表情</span></button>
      <button type="button" class="fmt-btn" data-act="image" title="上传并插入图片"><span class="fmt-ico"><i data-lucide="image"></i></span><span class="fmt-label">图片</span></button>
      <button type="button" class="fmt-btn" data-act="aiwrite" title="AI 写作助手"><span class="fmt-ico"><i data-lucide="bot"></i></span><span class="fmt-label">AI</span></button>
    </div>
    <div class="editor-grid" id="editor-grid">
      <textarea id="f-content" placeholder="在此用 Markdown 写作…（可直接把图片拖进来）">${post ? post.content : ""}</textarea>
      <div class="editor-preview"><h3>预览</h3><div id="preview"></div></div>
    </div>
    <input type="file" id="f-toolbar-image" accept="image/*" style="display:none" />
    <div class="emoji-picker popover" id="emoji-picker"></div>
    <div class="ai-compose popover" id="ai-compose"></div>
    <div id="ai-block">
      <label>GEMINI AI 辅助</label>
      <div style="display:flex; gap:10px; margin-bottom:10px; flex-wrap:wrap">
        <button class="btn" id="ai-optimize"><i data-lucide="sparkles"></i> AI 优化正文</button>
        <button class="btn" id="ai-annotate"><i data-lucide="notebook-pen"></i> AI 生成备注</button>
        <button class="btn" id="ai-summarize"><i data-lucide="clipboard-list"></i> AI 摘要/SEO</button>
        <button class="btn" id="ai-cover"><i data-lucide="palette"></i> AI 配图</button>
        <button class="btn" id="ai-moderate"><i data-lucide="shield-alert"></i> AI 检查违禁词</button>
        <button class="btn" id="ai-classify"><i data-lucide="tags"></i> AI 分类</button>
        <button class="btn" id="ai-translate-en"><i data-lucide="languages"></i> 译英</button>
        <button class="btn" id="ai-translate-zht"><i data-lucide="languages"></i> 译繁</button>
      </div>
    </div>
    <div id="ai-result" class="ai-result" style="display:none;"></div>
    <label>AI 备注（保存文章时一并存入）</label>
    <textarea id="f-ai-notes" placeholder="点击「AI 生成备注」自动生成，或手动填写">${post && post.ai_notes ? post.ai_notes : ""}</textarea>
    <label>插入图片（上传到 R2）</label>
    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
      <input type="file" id="f-image" accept="image/*" />
      <button class="btn" id="open-media" type="button"><i data-lucide="image"></i> 媒体库</button>
    </div>
    <div style="margin-top:18px; display:flex; gap:10px;">
      <button class="btn btn-primary" id="save">保存</button>
      <button class="btn" id="precheck" type="button"><i data-lucide="shield-check"></i> 发布前 AI 检查</button>
      <a class="btn" href="#/admin/posts">取消</a>
    </div>
    <div class="seo-check" id="seoCheck" style="margin-top:14px"></div>
    <div id="precheckResult" class="muted" style="margin-top:8px"></div>
    ${slug ? `<div id="comment-admin" class="comment-admin"></div>` : ""}`;
  app.innerHTML = "";
  app.appendChild(form);

  // 评论管理：仅编辑已有文章时，拉取其评论并支持删除
  if (slug) {
    const loadCommentAdmin = async () => {
      const box = document.getElementById("comment-admin");
      if (!box) return;
      box.innerHTML = `<h2 style="margin-top:22px">评论管理</h2><div id="comment-admin-list"><div class="empty">加载中…</div></div>`;
      const list = document.getElementById("comment-admin-list");
      try {
        const res = await api("/comments?post=" + encodeURIComponent(slug));
        const cs = await res.json();
        if (!Array.isArray(cs) || !cs.length) { list.innerHTML = '<div class="empty">这篇文章还没有评论。</div>'; return; }
        list.innerHTML = cs.map((c) => `
          <div class="comment-admin-item">
            <div class="ca-head"><span class="ca-author">${escHtml(c.author)}</span><span class="ca-date">${fmtDate(c.created_at)}</span></div>
            <div class="ca-body">${escHtml(c.content)}</div>
            <button class="btn btn-sm btn-danger ca-del" data-cid="${c.id}">删除</button>
          </div>`).join("");
        list.querySelectorAll(".ca-del").forEach((btn) => {
          btn.onclick = async () => {
            if (!confirm("确定删除这条评论？")) return;
            const r = await api("/comments/" + btn.dataset.cid, { method: "DELETE" });
            if (r.ok) { toast("评论已删除"); loadCommentAdmin(); }
            else toast("删除失败");
          };
        });
      } catch { list.innerHTML = '<div class="empty">评论加载失败</div>'; }
    };
    loadCommentAdmin();
  }

  // 设置中关闭了 AI 助手则隐藏编辑器里的 AI 区块
  if (!aiEnabled) {
    const blk = document.getElementById("ai-block");
    if (blk) blk.style.display = "none";
  }
  // 未启用违禁词检测则隐藏对应按钮（AI 总开关关闭时整块已隐藏）
  if (aiEnabled && !moderationEnabled) {
    const mBtn = document.getElementById("ai-moderate");
    if (mBtn) mBtn.style.display = "none";
  }

  const content = document.getElementById("f-content");
  const preview = document.getElementById("preview");
  const updatePreview = () => { preview.innerHTML = renderMarkdown(content.value); window.highlightCode(preview); };
  content.addEventListener("input", updatePreview);
  updatePreview();

  // ---- 正文增强：工具栏 / 表情 / 图片拖拽上传 ----
  const ta = content;

  function insertAtCursor(ta, text) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    ta.selectionStart = ta.selectionEnd = s + text.length;
    ta.focus();
    ta.dispatchEvent(new Event("input"));
  }
  function wrapSelection(ta, before, after, placeholder) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || placeholder || "";
    ta.value = ta.value.slice(0, s) + before + sel + after + ta.value.slice(e);
    const start = s + before.length;
    ta.selectionStart = start;
    ta.selectionEnd = start + sel.length;
    ta.focus();
    ta.dispatchEvent(new Event("input"));
  }
  function prefixLine(ta, prefix) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const val = ta.value;
    const start = val.slice(0, s).lastIndexOf("\n") + 1;
    // 选区结束不在行尾时，把整行都纳入（含结尾换行前的部分）
    let end = e;
    if (e < val.length && val.slice(e, e + 1) !== "\n") end = val.indexOf("\n", e);
    if (end === -1) end = val.length;
    const block = val.slice(start, end);
    const newBlock = block.split("\n").map((ln) => prefix + ln).join("\n");
    ta.value = val.slice(0, start) + newBlock + val.slice(end);
    ta.selectionStart = start;
    ta.selectionEnd = start + newBlock.length;
    ta.focus();
    ta.dispatchEvent(new Event("input"));
  }
  function applyHeading(level) {
    prefixLine(ta, "#".repeat(level) + " ");
  }
  const ACTIONS = {
    bold: () => wrapSelection(ta, "**", "**", "加粗文字"),
    italic: () => wrapSelection(ta, "*", "*", "斜体文字"),
    strike: () => wrapSelection(ta, "~~", "~~", "删除线文字"),
    code: () => wrapSelection(ta, "`", "`", "代码"),
    link: () => wrapSelection(ta, "[", "](https://)", "链接文字"),
    codeblock: () => wrapSelection(ta, "\n```js\n", "\n```\n", "// 在此粘贴代码"),
    table: () => insertAtCursor(ta, "\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 单元格 | 单元格 | 单元格 |\n| 单元格 | 单元格 | 单元格 |\n"),
    toc: () => insertAtCursor(ta, "\n[TOC]\n"),
    h: () => prefixLine(ta, "## "),
    quote: () => prefixLine(ta, "> "),
    ul: () => prefixLine(ta, "- "),
    ol: () => prefixLine(ta, "1. "),
    task: () => prefixLine(ta, "- [ ] "),
    hr: () => insertAtCursor(ta, "\n---\n"),
  };
  const toolbar = document.getElementById("editor-toolbar");
  // ---- 统一锚定弹层（微信风格：在触发按钮原位弹出，带小箭头）----
  function closeAllPopovers() {
    ["emoji-picker", "ai-compose", "h-menu"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove("open");
    });
  }
  function placePopover(panel, anchor) {
    panel.classList.add("open");
    const pw = panel.offsetWidth, ph = panel.offsetHeight;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let top = r.bottom + 10;
    let arrowDir = "up";
    if (top + ph > vh - 8) { top = r.top - ph - 10; arrowDir = "down"; }
    if (top < 8) top = 8;
    let left = r.left;
    if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
    if (left < 8) left = 8;
    panel.style.position = "fixed";
    panel.style.top = top + "px";
    panel.style.left = left + "px";
    const arrowLeft = Math.min(Math.max(r.left + r.width / 2 - left, 16), Math.max(pw - 16, 16));
    panel.style.setProperty("--arrow-left", arrowLeft + "px");
    panel.dataset.arrow = arrowDir;
  }
  function togglePopover(id, anchorAct) {
    const panel = document.getElementById(id);
    const anchor = toolbar.querySelector('[data-act="' + anchorAct + '"]');
    if (!panel || !anchor) return;
    const willOpen = !panel.classList.contains("open");
    closeAllPopovers();
    if (willOpen) placePopover(panel, anchor);
  }
  if (toolbar) {
    toolbar.querySelectorAll(".fmt-btn").forEach((btn) => {
      btn.onclick = () => {
        const act = btn.dataset.act;
        if (act === "emoji") { toggleEmojiPicker(); return; }
        if (act === "image") { document.getElementById("f-toolbar-image").click(); return; }
        if (act === "aiwrite") { toggleAiCompose(); return; }
        if (act === "h") { togglePopover("h-menu", "h"); return; }
        ACTIONS[act] && ACTIONS[act]();
      };
    });
    // 标题下拉菜单项
    const hMenu = document.getElementById("h-menu");
    if (hMenu) {
      hMenu.querySelectorAll(".fmt-menu-item").forEach((mi) => {
        mi.onclick = () => {
          applyHeading(Number(mi.dataset.h));
          closeAllPopovers();
        };
      });
    }
  }

  // 表情选择器（分类）
  const EMOJI_CATS = {
    "笑脸": "😀 😁 😂 🤣 😊 😍 🥰 😘 😎 🤔 😅 😉 🙃 😇 🤩 🥳 😴 😭 😡 🤯 😱 🤤 🥺 😏 😶 😐 😬 🙄 😪 🤗 😋 😜 🤓 😈 👿 💀 ☠️ 🤡",
    "手势": "👍 👎 👏 🙌 💪 🤝 ✌️ 🤞 🤟 🤙 👌 👈 👉 ☝️ ✋ 🖐️ 🖖 🫶 🙏 👋 🤘 🤛 🤜 👊",
    "人物": "🧑 👩 👨 👧 👦 👵 👴 👶 🧑‍💻 🧑‍🔬 🧑‍🎨 🧑‍🚀 🦸 🦹 🧙 🧚 🧛 🧜 🧝 👮 💂 🎅",
    "动物": "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🦄 🐝 🦋 🐢 🐙 🦖 🐠 🐬 🦔",
    "自然": "🌟 ⭐ 🌈 🍀 🌿 🌸 🌺 🍁 🌊 🔥 💧 ⚡ ☀️ 🌙 ☁️ ❄️ 🌍 🌕 🌑 💫 🌱 🍃 🌻",
    "食物": "🍎 🍊 🍋 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🍔 🍟 🍕 🌮 🍜 🍣 🍰 🍩 🍪 ☕ 🍵 🍺 🍻 🍷 🥤 🍦",
    "科技": "💡 💻 🖥️ ⌨️ 🖱️ 💾 💿 🔧 🔨 ⚙️ 📱 📷 📹 🎮 🕹️ 🤖 🛰️ 🚀 🔋 🔌 🖨️ 📡 💽",
    "符号": "✅ ❌ ⚠️ ❓ ❗ ➡️ ⬅️ ⬆️ ⬇️ 🔄 🔁 🔗 📌 📍 💯 💢 💥 🆗 🆕 🔔 📝 📚 📊 📈 📉 💬 💭 🏷️ 🔖",
    "活动": "🎉 🎊 🎁 🏆 🥇 🎯 🎲 ⚽ 🏀 🏈 ⛳ 🎸 🎤 🎧 🎬 🎨 🧩 ♟️ 🏅 🎺 🎻",
    "更多": "😺 🐳 🦋 🌵 🍄 🌶️ 🧄 🥑 🍿 🧋 🥨 🍫 🎈 🎂 🪐 ☄️ 🔭 🧠 📣 📢 🔕 🔒 🔑 🛡️ 🌩️ 💎 🏔️ 🌋 🏝️ 🚗 ✈️ ⏰ 📅 💰 🤑 🎇 🚩 🌠 🎀 🧸",
  };
  const picker = document.getElementById("emoji-picker");
  function buildEmojiPicker() {
    if (picker.dataset.built) return;
    const cats = Object.keys(EMOJI_CATS);
    const tabs = cats.map((c, idx) => `<button type="button" class="emoji-tab${idx === 0 ? " active" : ""}" data-cat="${c}">${c}</button>`).join("");
    picker.innerHTML = `<div class="emoji-tabs">${tabs}</div><div class="emoji-grid"></div>`;
    picker.dataset.built = "1";
    const grid = picker.querySelector(".emoji-grid");
    const renderCat = (cat) => {
      grid.innerHTML = EMOJI_CATS[cat].split(" ").map((e) => `<button type="button" class="emoji-item" data-emoji="${e}">${e}</button>`).join("");
      grid.querySelectorAll(".emoji-item").forEach((b) => {
        b.onclick = () => { insertAtCursor(ta, b.dataset.emoji || b.textContent); };
      });
    };
    renderCat(cats[0]);
    picker.querySelectorAll(".emoji-tab").forEach((t) => {
      t.onclick = () => {
        picker.querySelectorAll(".emoji-tab").forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        renderCat(t.dataset.cat);
      };
    });
  }
  function toggleEmojiPicker() {
    buildEmojiPicker();
    togglePopover("emoji-picker", "emoji");
  }
  // AI 写作助手面板
  const composeEl = document.getElementById("ai-compose");
  function buildAiCompose() {
    if (composeEl.dataset.built) return;
    composeEl.innerHTML = `
      <div class="ai-compose-row">
        <select id="ai-task" class="ai-compose-sel">
          <option value="continue">✍️ 续写</option>
          <option value="expand">扩写</option>
          <option value="shorten">✂️ 缩写</option>
          <option value="polish">✨ 润色</option>
          <option value="tone">🗣️ 换语气</option>
          <option value="instruction">按指令</option>
        </select>
        <button type="button" class="btn btn-primary" id="ai-gen">生成</button>
      </div>
      <textarea id="ai-instr" class="ai-compose-instr" placeholder="选「按指令」时填写，例如：把这段改成悬念开头"></textarea>
      <div id="ai-compose-out" class="ai-compose-out"></div>`;
    composeEl.dataset.built = "1";
    const sel = composeEl.querySelector("#ai-task");
    const instr = composeEl.querySelector("#ai-instr");
    const out = composeEl.querySelector("#ai-compose-out");
    const genBtn = composeEl.querySelector("#ai-gen");
    sel.onchange = () => { instr.style.display = sel.value === "instruction" ? "block" : "none"; };
    genBtn.onclick = async () => {
      const task = sel.value;
      const s = ta.selectionStart, e = ta.selectionEnd;
      const selText = ta.value.slice(s, e);
      const text = selText || ta.value;
      if (!text.trim() && task !== "instruction") { out.textContent = "请先选中正文，或确保编辑器有内容。"; return; }
      const titleEl = document.getElementById("f-title");
      genBtn.disabled = true; genBtn.textContent = "生成中…"; out.textContent = "";
      try {
        const r = await api("/ai/compose", { method: "POST", body: JSON.stringify({ task, text, instruction: instr.value, title: titleEl ? titleEl.value : "" }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { out.textContent = "❌ " + (d.error || "生成失败"); }
        else {
          const result = d.result || "";
          if (task === "continue") {
            insertAtCursor(ta, result);
          } else if (selText) {
            ta.value = ta.value.slice(0, s) + result + ta.value.slice(e);
            ta.selectionStart = ta.selectionEnd = s + result.length;
            ta.focus(); ta.dispatchEvent(new Event("input"));
          } else {
            ta.value = result;
            ta.focus(); ta.dispatchEvent(new Event("input"));
          }
          out.innerHTML = `<div class="ai-compose-head">✅ 已插入正文</div><pre class="ai-compose-preview"></pre>`;
          out.querySelector("pre").textContent = result;
        }
      } catch (err) { out.textContent = "❌ 请求失败：" + err.message; }
      finally { genBtn.disabled = false; genBtn.textContent = "生成"; }
    };
  }
  function toggleAiCompose() {
    buildAiCompose();
    togglePopover("ai-compose", "aiwrite");
  }
  // 点击弹层外部 / 滚动 / 缩放时关闭（微信风格：弹层脱离按钮即收起）
  function onPopoverOutside(ev) {
    const t = ev.target;
    if (t && t.closest && (t.closest(".popover") || t.closest('[data-act="emoji"],[data-act="aiwrite"],[data-act="h"]'))) return;
    closeAllPopovers();
  }
  if (!window.__popoverDocBound) {
    document.addEventListener("click", onPopoverOutside);
    window.__popoverDocBound = true;
  }
  if (!window.__popoverScrollBound) {
    const close = () => closeAllPopovers();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.__popoverScrollBound = true;
  }

  // 工具栏图片上传
  const toolbarImg = document.getElementById("f-toolbar-image");
  if (toolbarImg) {
    toolbarImg.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await uploadAndInsert(ta, file);
      toolbarImg.value = "";
    };
  }

  // 图片拖拽上传到正文（拖到编辑区任意位置）
  const grid = document.getElementById("editor-grid");
  if (grid) {
    ["dragenter", "dragover"].forEach((ev) =>
      grid.addEventListener(ev, (e) => { e.preventDefault(); grid.classList.add("dropzone-active"); })
    );
    ["dragleave", "drop"].forEach((ev) =>
      grid.addEventListener(ev, (e) => {
        e.preventDefault();
        if (ev === "dragleave" && e.relatedTarget && grid.contains(e.relatedTarget)) return;
        grid.classList.remove("dropzone-active");
      })
    );
    grid.addEventListener("drop", async (e) => {
      const files = [...(e.dataTransfer ? e.dataTransfer.files : [])].filter((f) => f.type.startsWith("image/"));
      for (const f of files) await uploadAndInsert(ta, f);
    });
  }

  async function uploadAndInsert(ta, file) {
    toast("上传中…");
    const data = await fileToBase64(file);
    const res = await api("/upload", { method: "POST", body: JSON.stringify({ name: file.name, type: file.type, data }) });
    const r = await res.json().catch(() => ({}));
    if (res.ok) {
      insertAtCursor(ta, `\n![${file.name}](${r.url})\n`);
      toast("图片已插入");
    } else toast(r.error || "上传失败");
  }

  // 图片上传
  document.getElementById("f-image").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = await fileToBase64(file);
    const res = await api("/upload", {
      method: "POST",
      body: JSON.stringify({ name: file.name, type: file.type, data }),
    });
    const r = await res.json().catch(() => ({}));
    if (res.ok) {
      content.value += `\n![${file.name}](${r.url})\n`;
      updatePreview();
      toast("图片已插入");
    } else toast(r.error || "上传失败");
  };

  // GEMINI AI：优化 / 备注
  const aiResult = document.getElementById("ai-result");
  const aiNotes = document.getElementById("f-ai-notes");
  const aiCall = async (action) => {
    const c = content.value;
    if (!c.trim()) {
      toast("正文为空，无法使用 AI");
      return;
    }
    const btn = action === "optimize" ? document.getElementById("ai-optimize") : document.getElementById("ai-annotate");
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "处理中…";
    try {
      const res = await api("/ai/process", {
        method: "POST",
        body: JSON.stringify({ action, title: document.getElementById("f-title").value, content: c, model: aiModel }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(r.error || "AI 调用失败");
        return;
      }
      if (action === "optimize") {
        aiResult.style.display = "block";
        aiResult.innerHTML = `<div class="ai-result-head">✨ AI 优化结果（预览，点「应用到正文」替换）</div><pre id="ai-out"></pre>
          <div style="display:flex;gap:10px;margin-top:8px;">
            <button class="btn btn-primary" id="ai-apply">应用到正文</button>
            <button class="btn" id="ai-copy">复制</button>
          </div>`;
        document.getElementById("ai-out").textContent = r.result;
        document.getElementById("ai-apply").onclick = () => {
          content.value = r.result;
          updatePreview();
          aiResult.style.display = "none";
          toast("已应用到正文");
        };
        document.getElementById("ai-copy").onclick = () => {
          navigator.clipboard.writeText(r.result).then(() => toast("已复制"));
        };
      } else {
        aiNotes.value = r.result;
        aiResult.style.display = "block";
        aiResult.innerHTML = `<div class="ai-result-head">📝 AI 备注已生成，已填入下方文本框（保存即存入）</div><pre id="ai-out"></pre>`;
        document.getElementById("ai-out").textContent = r.result;
        toast("备注已生成");
      }
    } catch (e) {
      toast("请求异常");
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  };
  document.getElementById("ai-optimize").onclick = () => aiCall("optimize");
  document.getElementById("ai-annotate").onclick = () => aiCall("annotate");

  // AI 分类：调用 classify 动作，返回标签数组并填入标签输入框
  const classifyBtn = document.getElementById("ai-classify");
  if (classifyBtn) {
    classifyBtn.onclick = async () => {
      const c = content.value;
      if (!c.trim()) {
        toast("正文为空，无法分类");
        return;
      }
      const oldText = classifyBtn.textContent;
      classifyBtn.disabled = true;
      classifyBtn.textContent = "分类中…";
      try {
        const res = await api("/ai/process", {
          method: "POST",
          body: JSON.stringify({ action: "classify", title: document.getElementById("f-title").value, content: c, model: aiModel }),
        });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(r.error || "AI 调用失败");
          return;
        }
        const tagsArr = Array.isArray(r.tags) ? r.tags : [];
        document.getElementById("f-tags").value = tagsArr.join(", ");
        toast("已生成标签：" + (tagsArr.join("、") || "（无）"));
      } catch (e) {
        toast("请求异常");
      } finally {
        classifyBtn.disabled = false;
        classifyBtn.textContent = oldText;
      }
    };
  }

  // AI 摘要/SEO：调用 summarize 动作，填充摘要文本框并提示 SEO 信息
  const summarizeBtn = document.getElementById("ai-summarize");
  if (summarizeBtn) {
    summarizeBtn.onclick = async () => {
      const c = content.value;
      if (!c.trim()) {
        toast("正文为空，无法生成摘要");
        return;
      }
      const oldText = summarizeBtn.textContent;
      summarizeBtn.disabled = true;
      summarizeBtn.textContent = "生成中…";
      try {
        const res = await api("/ai/process", {
          method: "POST",
          body: JSON.stringify({ action: "summarize", title: document.getElementById("f-title").value, content: c, model: aiModel }),
        });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(r.error || "生成失败");
          return;
        }
        if (r.excerpt) document.getElementById("f-excerpt").value = r.excerpt;
        aiResult.style.display = "block";
        aiResult.innerHTML = `<div class="ai-result-head">📋 AI 摘要已生成，已填入摘要框${
          r.seo_keywords ? `；建议 SEO 关键词：${escHtml(r.seo_keywords)}` : ""
        }</div>`;
        toast("摘要已生成");
      } catch (e) {
        toast("请求异常");
      } finally {
        summarizeBtn.disabled = false;
        summarizeBtn.textContent = oldText;
      }
    };
  }

  // AI 配图：调用 FLUX 生成封面，写入 R2 后填入封面 URL
  const coverBtn = document.getElementById("ai-cover");
  if (coverBtn) {
    coverBtn.onclick = async () => {
      const oldText = coverBtn.textContent;
      coverBtn.disabled = true;
      coverBtn.textContent = "生成中…";
      try {
        const tagsVal = document.getElementById("f-tags").value.trim();
        const promptVal = document.getElementById("f-cover-prompt").value.trim();
        const res = await api("/ai/cover", {
          method: "POST",
          body: JSON.stringify({ title: document.getElementById("f-title").value, tags: tagsVal, prompt: promptVal }),
        });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(r.error || "配图失败");
          return;
        }
        document.getElementById("f-cover").value = r.url;
        aiResult.style.display = "block";
        aiResult.innerHTML = `<div class="ai-result-head">🎨 配图已生成</div><img src="${r.url}" alt="cover" style="max-width:240px;border-radius:8px;margin-top:8px" />`;
        toast("配图已生成并填入封面");
      } catch (e) {
        toast("请求异常");
      } finally {
        coverBtn.disabled = false;
        coverBtn.textContent = oldText;
      }
    };
  }

  // 媒体库：列出 / 上传 / 插入 / 删除 R2 图片
  const mediaBtn = document.getElementById("open-media");
  if (mediaBtn) {
    mediaBtn.onclick = () => openMediaLibrary(content);
  }

  // 违禁词检测：调用 AI moderate 动作，解析返回的 JSON 渲染疑似违禁词列表
  const moderateBtn = document.getElementById("ai-moderate");
  if (moderateBtn) {
    moderateBtn.onclick = async () => {
      const c = content.value;
      if (!c.trim()) {
        toast("正文为空，无法检测");
        return;
      }
      const oldText = moderateBtn.textContent;
      moderateBtn.disabled = true;
      moderateBtn.textContent = "检测中…";
      try {
        const res = await api("/ai/process", {
          method: "POST",
          body: JSON.stringify({ action: "moderate", title: document.getElementById("f-title").value, content: c, model: aiModel }),
        });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(r.error || "检测失败");
          return;
        }
        let data = null;
        try {
          data = JSON.parse(r.result);
        } catch {
          data = null;
        }
        aiResult.style.display = "block";
        if (data && data.clean) {
          aiResult.innerHTML = `<div class="ai-result-head ok">✅ 未检测到明显违禁词</div>`;
        } else if (data && Array.isArray(data.items) && data.items.length) {
          const items = data.items
            .map(
              (it) => `<li>
                <b>${escHtml(it.word || "")}</b> <span class="muted">（${escHtml(it.reason || "")}）</span>
                <div class="ctx">上下文：${escHtml(it.context || "")}</div>
                <div class="sug">建议：${escHtml(it.suggestion || "")}</div>
              </li>`
            )
            .join("");
          aiResult.innerHTML = `<div class="ai-result-head warn">🚫 检测到 ${data.items.length} 处疑似违禁词</div><ul class="mod-list">${items}</ul>`;
        } else {
          aiResult.innerHTML = `<div class="ai-result-head">AI 返回：</div><pre id="ai-out"></pre>`;
          const pre = document.getElementById("ai-out");
          if (pre) pre.textContent = r.result;
        }
      } catch (e) {
        toast("请求异常");
      } finally {
        moderateBtn.disabled = false;
        moderateBtn.textContent = oldText;
      }
    };
  }

  // AI 翻译正文：调 Workers AI 翻译全文并替换
  const bindTranslateButton = (target) => {
    const btn = document.getElementById(target === "en" ? "ai-translate-en" : "ai-translate-zht");
    if (!btn) return;
    btn.onclick = async () => {
      const c = content.value;
      if (!c.trim()) { toast("正文为空，无法翻译"); return; }
      const old = btn.textContent;
      btn.disabled = true; btn.textContent = "翻译中…";
      try {
        const res = await api("/ai/translate", { method: "POST", body: JSON.stringify({ text: c, target }) });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) { toast(r.error || "翻译失败"); return; }
        content.value = r.text || c;
        updatePreview();
        toast("已翻译为正文");
      } catch { toast("请求异常"); }
      finally { btn.disabled = false; btn.textContent = old; }
    };
  };
  bindTranslateButton("en");
  bindTranslateButton("zht");

  document.getElementById("save").onclick = async () => {
    const scheduledRaw = document.getElementById("f-scheduled").value;
    const scheduled_at = scheduledRaw ? new Date(scheduledRaw).getTime() : null;
    const payload = {
      title: document.getElementById("f-title").value.trim(),
      content: content.value,
      visibility: document.getElementById("f-visibility").value,
      status: document.getElementById("f-status").value,
      scheduled_at: scheduled_at,
      cover: document.getElementById("f-cover").value.trim() || undefined,
      excerpt: document.getElementById("f-excerpt").value.trim() || undefined,
      ai_notes: aiNotes.value.trim() || undefined,
      tags: document.getElementById("f-tags").value.trim() || undefined,
    };
    if (!payload.title) return toast("标题不能为空");
    const opt = { method: post ? "PUT" : "POST", body: JSON.stringify(payload) };
    const res = post ? await api("/posts/" + post.id, opt) : await api("/posts", opt);
    if (res.ok) {
      // 保存成功：清除自动草稿
      try { localStorage.removeItem(draftKey); } catch {}
      toast("已保存");
      location.hash = "#/admin/posts";
    } else {
      const r = await res.json().catch(() => ({}));
      toast(r.error || "保存失败");
    }
  };

  // ── SEO 实时体检 + 草稿自动保存 + 发布前 AI 检查 ──
  const draftKey = "draft:" + (slug || "new");
  const seoBox = document.getElementById("seoCheck");
  function runSeoCheck() {
    if (!seoBox) return;
    const title = (document.getElementById("f-title").value || "").trim();
    const excerpt = (document.getElementById("f-excerpt").value || "").trim();
    const cover = (document.getElementById("f-cover").value || "").trim();
    const tags = (document.getElementById("f-tags").value || "").trim();
    const status = document.getElementById("f-status").value;
    const titleLen = [...title].length;
    const checks = [
      { ok: titleLen >= 10 && titleLen <= 60, label: `标题长度合适（${titleLen} 字，建议 10–60）` },
      { ok: !!excerpt, label: "已填写摘要（利于列表与 SEO）" },
      { ok: !!cover, label: "已设置封面图（利于分享卡片）" },
      { ok: !!tags, label: "已添加标签（利于归档与推荐）" },
    ];
    seoBox.innerHTML = `<div class="seo-title">SEO 实时体检 ${status === "published" ? "（发布前建议全部通过）" : ""}</div>` +
      checks.map((c) => `<div class="seo-item ${c.ok ? "ok" : "warn"}">${c.ok ? "✓" : "⚠"} ${c.label}</div>`).join("");
  }
  ["f-title", "f-excerpt", "f-cover", "f-tags", "f-status"].forEach((id) => {
    const elx = document.getElementById(id);
    if (elx) elx.addEventListener("input", runSeoCheck);
    if (elx) elx.addEventListener("change", runSeoCheck);
  });
  runSeoCheck();

  // 草稿自动保存（每 8 秒，仅当内容非空）
  const autosaveTimer = setInterval(() => {
    try {
      const t = (document.getElementById("f-title").value || "").trim();
      const ct = (content && content.value) || "";
      if (!t && !ct) return;
      localStorage.setItem(draftKey, JSON.stringify({
        title: document.getElementById("f-title").value,
        content: ct,
        visibility: document.getElementById("f-visibility").value,
        status: document.getElementById("f-status").value,
        scheduled: document.getElementById("f-scheduled").value,
        cover: document.getElementById("f-cover").value,
        excerpt: document.getElementById("f-excerpt").value,
        tags: document.getElementById("f-tags").value,
        ts: Date.now(),
      }));
    } catch {}
  }, 8000);
  window.addEventListener("hashchange", () => clearInterval(autosaveTimer), { once: true });

  // 打开时若存在本地草稿，提示恢复
  try {
    const raw = localStorage.getItem(draftKey);
    if (raw) {
      const d = JSON.parse(raw);
      const banner = el(`<div class="draft-banner">检测到本地未提交草稿（${new Date(d.ts).toLocaleString()}），<button class="btn btn-sm" id="draft-restore">恢复</button> <button class="btn btn-sm" id="draft-discard">丢弃</button></div>`);
      seoBox.parentNode.insertBefore(banner, seoBox);
      banner.querySelector("#draft-restore").onclick = () => {
        document.getElementById("f-title").value = d.title || "";
        if (content) content.value = d.content || "";
        document.getElementById("f-visibility").value = d.visibility || "public";
        document.getElementById("f-status").value = d.status || "published";
        document.getElementById("f-scheduled").value = d.scheduled || "";
        document.getElementById("f-cover").value = d.cover || "";
        document.getElementById("f-excerpt").value = d.excerpt || "";
        document.getElementById("f-tags").value = d.tags || "";
        runSeoCheck();
        toast("已恢复本地草稿");
        banner.remove();
      };
      banner.querySelector("#draft-discard").onclick = () => {
        localStorage.removeItem(draftKey);
        banner.remove();
      };
    }
  } catch {}

  // 发布前 AI 检查（违禁词 / 错别字预检）
  const precheckBtn = document.getElementById("precheck");
  const precheckRes = document.getElementById("precheckResult");
  if (precheckBtn)
    precheckBtn.onclick = async () => {
      const title = (document.getElementById("f-title").value || "").trim();
      const ct = (content && content.value) || "";
      if (!ct && !title) return toast("请先填写标题或正文");
      precheckBtn.disabled = true;
      const old = precheckBtn.textContent;
      precheckBtn.textContent = "检查中…";
      try {
        const res = await api("/ai/process", { method: "POST", body: JSON.stringify({ action: "moderate", title, content: ct }) });
        const r = await res.json().catch(() => ({}));
        if (res.ok) {
          const flagged = r.result && r.result.flagged ? r.result.flagged : [];
          if (flagged.length) precheckRes.innerHTML = `⚠ 发现可能需留意的词：${flagged.map((w) => `<b>${escHtml(w)}</b>`).join("、")}`;
          else precheckRes.textContent = "✓ 未发现明显违禁词/风险表述。";
        } else precheckRes.textContent = r.error || "检查失败";
      } catch { precheckRes.textContent = "请求异常"; }
      finally { precheckBtn.disabled = false; precheckBtn.textContent = old; }
    };
}

function toLocalInput(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 媒体库弹窗：上传 / 列表 / 插入正文 / 设为封面 / 删除
function openMediaLibrary(content) {
  const app = document.getElementById("app");
  const overlay = el(`<div class="modal-overlay"></div>`);
  const modal = el(`<div class="modal media-modal"></div>`);
  modal.innerHTML = `
    <div class="modal-head"><h3>媒体库</h3><button class="btn btn-sm" id="media-close">✕</button></div>
    <div class="modal-body">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <input type="file" id="media-file" accept="image/*" />
        <button class="btn btn-primary" id="media-upload">上传</button>
      </div>
      <div class="media-grid" id="media-grid"><div class="empty">加载中…</div></div>
    </div>`;
  overlay.appendChild(modal);
  app.appendChild(overlay);
  const close = () => overlay.remove();
  modal.querySelector("#media-close").onclick = close;
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  const grid = modal.querySelector("#media-grid");
  const load = async () => {
    grid.innerHTML = `<div class="empty">加载中…</div>`;
    const res = await api("/media");
    const d = await res.json().catch(() => ({ objects: [] }));
    const items = d.objects || [];
    if (!items.length) {
      grid.innerHTML = `<div class="empty">还没有图片，先上传一张吧。</div>`;
      return;
    }
    grid.innerHTML = "";
    for (const it of items) {
      const cell = el(`<div class="media-cell ${it.orphan ? "media-orphan" : ""}"></div>`);
      cell.innerHTML = `
        <img src="${it.url}" alt="" loading="lazy" />
        <div class="media-actions">
          <button class="btn btn-sm" data-act="insert">插入</button>
          <button class="btn btn-sm" data-act="cover">封面</button>
          <button class="btn btn-sm btn-danger" data-act="del">删除</button>
        </div>`;
      cell.querySelector('[data-act="insert"]').onclick = () => {
        content.value += `\n![image](${it.url})\n`;
        content.dispatchEvent(new Event("input"));
        toast("已插入正文");
      };
      cell.querySelector('[data-act="cover"]').onclick = () => {
        const cov = document.getElementById("f-cover");
        if (cov) cov.value = it.url;
        toast("已设为封面");
      };
      cell.querySelector('[data-act="del"]').onclick = async () => {
        if (!confirm("确定删除该图片？")) return;
        const r = await api("/media", { method: "DELETE", body: JSON.stringify({ key: it.key }) });
        if (r.ok) load();
        else toast("删除失败");
      };
      grid.appendChild(cell);
    }
  };
  modal.querySelector("#media-upload").onclick = async () => {
    const f = modal.querySelector("#media-file").files[0];
    if (!f) return toast("请选择文件");
    const data = await fileToBase64(f);
    const r = await api("/upload", { method: "POST", body: JSON.stringify({ name: f.name, type: f.type, data }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      toast("已上传");
      load();
    } else toast(d.error || "上传失败");
  };
  load();
}

// ---------------- 站点设置 ----------------

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const SETTINGS_DEFAULT_MENUS = [
  { label: "文章", hash: "#/" },
  { label: "时间轴", hash: "#/timeline" },
  { label: "动态", hash: "#/feed" },
  { label: "标签", hash: "#/tags" },
  { label: "朋友们", hash: "#/friends" },
  { label: "关于", hash: "#/about" },
];

function navToText(jsonStr) {
  let arr = SETTINGS_DEFAULT_MENUS;
  if (jsonStr) {
    try {
      const p = JSON.parse(jsonStr);
      if (Array.isArray(p) && p.length) arr = p;
    } catch {}
  }
  return arr.map((m) => `${m.label}|${m.hash}`).join("\n");
}

function textToNav(text) {
  const arr = [];
  for (const line of String(text || "").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf("|");
    if (i < 0) continue;
    const label = t.slice(0, i).trim();
    const hash = t.slice(i + 1).trim();
    if (label && hash) arr.push({ label, hash });
  }
  return arr.length ? arr : SETTINGS_DEFAULT_MENUS;
}

function colorVal(hex) {
  if (!hex) return "#2563eb";
  return hex.startsWith("#") ? hex : "#" + hex;
}

async function renderSettings() {
  const app = adminMain();
  app.innerHTML = `<div class="empty">加载中…</div>`;
  let s = {};
  try {
    s = await (await api("/settings")).json();
  } catch {}

  const form = el(`<div class="form settings-form"></div>`);
  form.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <h2 style="margin:0">站点设置</h2>
    </div>

    <fieldset class="set-group">
      <legend>① 站点信息</legend>
      <label>站点名称</label>
      <input type="text" id="s-site_title" value="${escHtml(s.site_title || "")}" placeholder="AI Agent Blog" />
      <label>站点副标题 / 简介</label>
      <input type="text" id="s-site_subtitle" value="${escHtml(s.site_subtitle || "")}" placeholder="记录 AI 与工程实践" />
      <label>页脚版权文案</label>
      <input type="text" id="s-footer_text" value="${escHtml(s.footer_text || "")}" placeholder="© AI Agent Blog · Powered by Cloudflare" />
    </fieldset>

    <fieldset class="set-group">
      <legend>② 导航菜单</legend>
      <p class="muted">每行一个菜单，格式：标签|链接（链接以 #/ 开头）。</p>
      <textarea id="s-nav" style="min-height:140px">${escHtml(navToText(s.nav))}</textarea>
    </fieldset>

    <fieldset class="set-group">
      <legend>③ 外观主题</legend>
      <label>主题预设</label>
      <p class="muted">选择一套整体配色风格（点选即时预览整站效果）。</p>
      <div class="theme-grid" id="theme-grid"></div>
      <input type="hidden" id="s-theme_preset" value="${escHtml(s.theme_preset || "default")}" />
      <label>主色调（自定义，覆盖预设主色）</label>
      <div style="display:flex;gap:10px;align-items:center">
        <input type="color" id="s-theme_primary" value="${colorVal(s.theme_primary)}" />
        <span id="s-theme_primary_txt" class="muted">${escHtml(s.theme_primary || "#2563eb")}</span>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer">
        <input type="checkbox" id="s-theme_dark" ${s.theme_dark === "1" ? "checked" : ""} /> 启用深色模式
      </label>
    </fieldset>

    <fieldset class="set-group">
      <legend>④ AI 助手</legend>
      <label>AI 服务商（写作 / 翻译 / 问答使用的文本模型）</label>
      <select id="s-ai_provider">
        <option value="deepseek" ${(s.ai_provider || "deepseek") === "deepseek" ? "selected" : ""}>DeepSeek（deepseek-chat）</option>
        <option value="gemini" ${(s.ai_provider || "deepseek") === "gemini" ? "selected" : ""}>Gemini（gemini-flash-latest）</option>
        <option value="workers" ${(s.ai_provider || "deepseek") === "workers" ? "selected" : ""}>Workers AI（自动回退 llama-3.1-8b）</option>
      </select>
      <label style="margin-top:12px">默认模型</label>
      <input type="text" id="s-ai_model" value="${escHtml(s.ai_model || "deepseek-chat")}" placeholder="deepseek-chat" />
      <p class="set-hint" id="ai-model-hint"></p>

      <label style="margin-top:14px">DeepSeek API Key（每行一个，可填多个，自动轮询 / 故障切换）</label>
      <textarea id="s-deepseek_api_key" class="key-input" placeholder="sk-...&#10;sk-...（多个换行分隔，全部共存）">${escHtml(s.deepseek_api_key || "")}</textarea>
      <p class="set-hint" id="ds-key-hint"></p>

      <label style="margin-top:14px">Gemini API Key（每行一个，可填多个，自动轮询 / 故障切换）</label>
      <textarea id="s-gemini_api_key" class="key-input" placeholder="AIza...&#10;AIza...（多个换行分隔，全部共存）">${escHtml(s.gemini_api_key || "")}</textarea>
      <p class="set-hint" id="gem-key-hint"></p>

      <label style="margin-top:14px">Gemini Base URL（可选，留空用官方默认）</label>
      <input type="text" id="s-gemini_base_url" value="${escHtml(s.gemini_base_url || "")}" placeholder="https://generativelanguage.googleapis.com" />

      <label style="display:flex;align-items:center;gap:8px;margin-top:14px;cursor:pointer">
        <input type="checkbox" id="s-ai_enabled" ${s.ai_enabled !== "0" ? "checked" : ""} /> 在编辑器中显示 AI 按钮
      </label>
      <button type="button" class="btn" id="ai-test-btn" style="margin-top:16px"><i data-lucide="plug-zap"></i> 检测连通性</button>
      <div id="ai-test-result" style="margin-top:10px"></div>
    </fieldset>

    <fieldset class="set-group">
      <legend>⑤ 关于页内容</legend>
      <label>关于页正文（支持 Markdown）</label>
      <textarea id="s-about_content" style="min-height:160px">${escHtml(s.about_content || "")}</textarea>
    </fieldset>

    <fieldset class="set-group">
      <legend>⑥ 阅读与互动</legend>
      <label>每页文章数（首页列表分页，1–100）</label>
      <input type="number" id="s-posts_per_page" min="1" max="100" value="${escHtml(s.posts_per_page || "10")}" />
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer">
        <input type="checkbox" id="s-comments_enabled" ${s.comments_enabled !== "0" ? "checked" : ""} /> 在文章底部开启读者评论
      </label>
    </fieldset>

    <fieldset class="set-group">
      <legend>⑦ SEO 优化</legend>
      <label>SEO 标题（留空则使用站点名称）</label>
      <input type="text" id="s-seo_title" value="${escHtml(s.seo_title || "")}" placeholder="AI Agent Blog" />
      <label>SEO 描述（用于搜索引擎结果摘要）</label>
      <textarea id="s-seo_description" style="min-height:80px" placeholder="一句话介绍你的博客…">${escHtml(s.seo_description || "")}</textarea>
      <label>SEO 关键词（逗号分隔）</label>
      <input type="text" id="s-seo_keywords" value="${escHtml(s.seo_keywords || "")}" placeholder="AI, 博客, Cloudflare, 工程实践" />
    </fieldset>

    <fieldset class="set-group">
      <legend>⑧ 健康管理</legend>
      <p class="muted">内容合规与 AI 批处理相关设置。开启后，文章编辑器会出现「AI 检查违禁词」按钮。</p>
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer">
        <input type="checkbox" id="s-moderation_enabled" ${s.moderation_enabled !== "0" ? "checked" : ""} /> 启用 AI 违禁词检测
      </label>
      <label style="margin-top:14px">自定义重点排查词（可选，每行一个 / 逗号分隔）</label>
      <textarea id="s-banned_words" style="min-height:90px" placeholder="如：治愈、根治、包治百病、降血压、抗癌…">${escHtml(s.banned_words || "")}</textarea>
    </fieldset>

    <fieldset class="set-group">
      <legend>⑨ 数据备份与恢复</legend>
      <p class="muted">一键导出全部文章（含回收站）、评论、设置为 JSON 文件；导入时按 id 合并更新，不会删除已有数据。</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
        <button type="button" class="btn" id="btn-backup-export"><i data-lucide="download"></i> 导出备份</button>
        <label class="btn" style="cursor:pointer">导入备份<input type="file" id="btn-backup-import" accept="application/json" style="display:none" /></label>
      </div>
      <div id="backup-msg" class="muted" style="margin-top:8px"></div>
    </fieldset>

    <fieldset class="set-group">
      <legend>⑩ 发布联动（Webhook）</legend>
      <p class="muted">文章发布/更新为公开时，自动向以下地址 POST 通知（用于自行接入微信/Telegram/Discord 等）。每行一个 URL。</p>
      <textarea id="s-webhooks" style="min-height:90px" placeholder="https://your-webhook.example.com/notify&#10;https://discord.com/api/webhooks/...">${escHtml(((s.webhooks && JSON.parse(s.webhooks || "[]")) || []).join("\n"))}</textarea>
      <div style="margin-top:10px"><button type="button" class="btn" id="btn-webhook-test"><i data-lucide="plug-zap"></i> 测试发送</button> <span id="webhook-msg" class="muted"></span></div>
    </fieldset>

    <div style="margin-top:18px;display:flex;gap:10px;align-items:center">
      <button class="btn btn-primary" id="save-settings">保存设置</button>
      <span id="settings-msg" class="muted"></span>
    </div>`;
  app.innerHTML = "";
  app.appendChild(form);

  // —— AI 服务商切换：默认模型随服务商自动更新；API Key 脱敏显示 ——
  const PROVIDER_MODEL = { deepseek: "deepseek-chat", gemini: "gemini-flash-latest", workers: "llama-3.1-8b" };
  const provSel = document.getElementById("s-ai_provider");
  const modelInput = document.getElementById("s-ai_model");
  const modelHint = document.getElementById("ai-model-hint");
  function syncModelHint() {
    const p = provSel.value;
    modelHint.textContent =
      "推荐模型：" + (PROVIDER_MODEL[p] || "—") +
      (p === "workers" ? "（Workers AI 固定使用该模型，本字段不生效）" : "（切换服务商时自动填入，也可手动自定义）");
  }
  provSel.addEventListener("change", () => {
    const cur = modelInput.value.trim();
    // 仅当模型为空、或当前值正好是某个服务商的默认模型时，才自动切换为新服务商的默认模型（避免覆盖用户自定义）
    if (!cur || Object.values(PROVIDER_MODEL).includes(cur)) {
      modelInput.value = PROVIDER_MODEL[provSel.value] || "";
    }
    syncModelHint();
  });
  syncModelHint();

  function maskKey(k) {
    k = (k || "").trim();
    if (!k) return "";
    if (k.length <= 10) return k.slice(0, 2) + "••••" + k.slice(-2);
    return k.slice(0, 6) + "••••" + k.slice(-4);
  }
  function renderKeyHint(elId, rawVal) {
    const el = document.getElementById(elId);
    if (!el) return;
    const arr = (rawVal || "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    if (arr.length === 0) {
      el.textContent = "（未配置：将使用 Cloudflare 环境变量 secret，若也没有则回退 Workers AI）";
      return;
    }
    el.textContent = `已保存 ${arr.length} 个 Key：` + arr.map(maskKey).join("、");
  }
  renderKeyHint("ds-key-hint", s.deepseek_api_key || "");
  renderKeyHint("gem-key-hint", s.gemini_api_key || "");
  document.getElementById("s-deepseek_api_key").addEventListener("input", (e) => renderKeyHint("ds-key-hint", e.target.value));
  document.getElementById("s-gemini_api_key").addEventListener("input", (e) => renderKeyHint("gem-key-hint", e.target.value));

  // 检测连通性：逐个探测 workers / deepseek / gemini，显示是否可用及失败原因
  const testBtn = document.getElementById("ai-test-btn");
  const testRes = document.getElementById("ai-test-result");
  testBtn.onclick = async () => {
    testBtn.disabled = true;
    testRes.innerHTML = '<p class="set-hint">检测中…</p>';
    try {
      const r = await api("/ai/test", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        testRes.innerHTML = `<p class="set-hint" style="color:#e5484d">${escHtml(d.error || "检测失败")}</p>`;
        return;
      }
      const rows = [
        ["Workers AI", d.workers],
        ["DeepSeek", d.deepseek],
        ["Gemini", d.gemini],
      ];
      testRes.innerHTML = rows
        .map(([name, st]) => {
          const ok = st && st.ok;
          const icon = ok ? "✅" : "❌";
          const color = ok ? "var(--primary)" : "#e5484d";
          return `<div class="ai-probe"><span style="color:${color}">${icon}</span><b style="margin:0 6px">${name}</b><span class="set-hint" style="margin:0;color:${color}">${escHtml(st ? st.msg : "未知")}</span></div>`;
        })
        .join("");
    } catch (e) {
      testRes.innerHTML = `<p class="set-hint" style="color:#e5484d">请求异常：${escHtml(e && e.message ? e.message : String(e))}</p>`;
    } finally {
      testBtn.disabled = false;
    }
  };

  const colorInput = document.getElementById("s-theme_primary");
  colorInput.oninput = () => {
    document.getElementById("s-theme_primary_txt").textContent = colorInput.value;
  };

  // 主题预设色卡选择器（即时预览）
  const THEMES = [
    { id: "default", name: "默认主题", primary: "#2563eb", accent2: "#8b5cf6" },
    { id: "poster", name: "海报风格", primary: "#ec3750", accent2: "#ff7a45" },
    { id: "forest", name: "森野", primary: "#16a34a", accent2: "#0ea5e9" },
    { id: "violet", name: "紫调", primary: "#8b5cf6", accent2: "#ec4899" },
    { id: "ocean", name: "海洋", primary: "#0891b2", accent2: "#22d3ee" },
    { id: "amber", name: "暖阳", primary: "#f59e0b", accent2: "#ef4444" },
  ];
  const themeHidden = document.getElementById("s-theme_preset");
  const grid = document.getElementById("theme-grid");
  function paintThemeGrid() {
    const cur = themeHidden.value || "default";
    grid.innerHTML = THEMES.map(
      (t) =>
        `<button type="button" class="theme-swatch${t.id === cur ? " active" : ""}" data-theme="${t.id}" title="${t.name}">
          <span class="sw" style="background:linear-gradient(135deg,${t.primary},${t.accent2})"></span>
          <span class="sw-name">${t.name}</span>
        </button>`
    ).join("");
  }
  paintThemeGrid();
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".theme-swatch");
    if (!btn) return;
    themeHidden.value = btn.dataset.theme;
    paintThemeGrid();
    if (window.applyThemePreset) window.applyThemePreset(btn.dataset.theme); // 实时预览
  });

  document.getElementById("save-settings").onclick = async () => {
    const payload = {
      site_title: document.getElementById("s-site_title").value.trim(),
      site_subtitle: document.getElementById("s-site_subtitle").value.trim(),
      footer_text: document.getElementById("s-footer_text").value.trim(),
      nav: JSON.stringify(textToNav(document.getElementById("s-nav").value)),
      theme_primary: document.getElementById("s-theme_primary").value,
      theme_preset: document.getElementById("s-theme_preset").value || "default",
      theme_dark: document.getElementById("s-theme_dark").checked ? "1" : "0",
      ai_model: document.getElementById("s-ai_model").value.trim() || "deepseek-chat",
      ai_provider: document.getElementById("s-ai_provider").value || "deepseek",
      ai_enabled: document.getElementById("s-ai_enabled").checked ? "1" : "0",
      deepseek_api_key: document.getElementById("s-deepseek_api_key").value.trim(),
      gemini_api_key: document.getElementById("s-gemini_api_key").value.trim(),
      gemini_base_url: document.getElementById("s-gemini_base_url").value.trim(),
      about_content: document.getElementById("s-about_content").value,
      posts_per_page: document.getElementById("s-posts_per_page").value.trim() || "10",
      comments_enabled: document.getElementById("s-comments_enabled").checked ? "1" : "0",
      seo_title: document.getElementById("s-seo_title").value.trim(),
      seo_description: document.getElementById("s-seo_description").value.trim(),
      seo_keywords: document.getElementById("s-seo_keywords").value.trim(),
      moderation_enabled: document.getElementById("s-moderation_enabled").checked ? "1" : "0",
      banned_words: document.getElementById("s-banned_words").value,
      webhooks: JSON.stringify(
        document.getElementById("s-webhooks").value.split("\n").map((x) => x.trim()).filter(Boolean)
      ),
    };
    const res = await api("/settings", { method: "PUT", body: JSON.stringify(payload) });
    const r = await res.json().catch(() => ({}));
    const msg = document.getElementById("settings-msg");
    if (res.ok) {
      msg.textContent = "已保存 ✓";
      // 实时应用到当前页面
      applySettings(payload);
      toast("设置已保存");
    } else {
      msg.textContent = r.error || "保存失败";
    }
  };

  // 数据备份：导出
  const btnExport = document.getElementById("btn-backup-export");
  const backupMsg = document.getElementById("backup-msg");
  if (btnExport)
    btnExport.onclick = async () => {
      btnExport.disabled = true;
      backupMsg.textContent = "正在导出…";
      try {
        const d = await (await api("/backup/export")).json();
        const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `blog-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        backupMsg.textContent = `已导出：${d.posts.length} 篇文章 / ${d.comments.length} 条评论`;
      } catch {
        backupMsg.textContent = "导出失败";
      } finally {
        btnExport.disabled = false;
      }
    };
  // 数据备份：导入
  const btnImport = document.getElementById("btn-backup-import");
  if (btnImport)
    btnImport.onchange = async () => {
      const file = btnImport.files && btnImport.files[0];
      if (!file) return;
      if (!confirm("导入将按 id 合并更新现有数据，不会删除已有文章/评论。确定继续？")) return;
      backupMsg.textContent = "正在导入…";
      try {
        const text = await file.text();
        const res = await api("/backup/import", { method: "POST", body: text });
        const r = await res.json().catch(() => ({}));
        if (res.ok) backupMsg.textContent = `导入完成：文章 ${r.posts} / 评论 ${r.comments} / 设置 ${r.settings}`;
        else backupMsg.textContent = r.error || "导入失败";
      } catch {
        backupMsg.textContent = "导入失败";
      }
      btnImport.value = "";
    };
  // 发布联动 Webhook 测试
  const btnWhTest = document.getElementById("btn-webhook-test");
  const whMsg = document.getElementById("webhook-msg");
  if (btnWhTest)
    btnWhTest.onclick = async () => {
      const urls = document.getElementById("s-webhooks").value.split("\n").map((x) => x.trim()).filter(Boolean);
      if (!urls.length) {
        whMsg.textContent = "请先填写至少一个 Webhook URL";
        return;
      }
      btnWhTest.disabled = true;
      whMsg.textContent = "发送中…";
      try {
        let ok = 0, fail = 0;
        await Promise.all(
          urls.map((u) =>
            fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "test", post: { title: "测试文章" } }) })
              .then(() => ok++)
              .catch(() => fail++)
          )
        );
        whMsg.textContent = `结果：成功 ${ok} / 失败 ${fail}`;
      } finally {
        btnWhTest.disabled = false;
      }
    };
}

// ───────────────────────── 评论审核队列 ─────────────────────────
async function renderCommentsModeration() {
  const app = adminMain();
  setTitle("评论审核");
  app.innerHTML = `<div class="empty">加载中…</div>`;
  let moderationOn = true;
  try {
    const s = await (await api("/settings")).json();
    moderationOn = s.moderation_enabled !== "0";
  } catch {}
  const wrap = el(`<div class="dash"></div>`);
  const head = el(`<div class="dash-head"></div>`);
  head.innerHTML = `<div><h1 class="dash-title">评论审核</h1>
    <p class="dash-sub">${moderationOn ? "已开启审核：新评论需通过后才会公开" : "未开启审核（新评论直接公开）"}</p></div>
    <div class="bulk-bar">
      <button class="btn btn-sm" id="cm-all-approve">全部通过</button>
      <button class="btn btn-sm btn-danger" id="cm-all-delete">全部删除</button>
    </div>`;
  wrap.appendChild(head);

  const list = el(`<div class="comment-mod-list"></div>`);
  wrap.appendChild(list);
  app.innerHTML = "";
  app.appendChild(wrap);

  const load = async () => {
    const res = await api("/comments?status=pending");
    const cs = await res.json();
    if (!Array.isArray(cs) || !cs.length) {
      list.innerHTML = `<div class="empty">暂无待审核评论 🎉</div>`;
      const a = document.getElementById("cm-all-approve");
      const d = document.getElementById("cm-all-delete");
      if (a) a.style.display = "none";
      if (d) d.style.display = "none";
      return;
    }
    list.innerHTML = "";
    for (const c of cs) {
      const item = el(`<div class="comment-mod-item" data-id="${c.id}">
        <div class="cm-meta"><b>${escHtml(c.author)}</b> · 评《${escHtml(c.post_title || c.post_slug)}》 · ${fmtDate(c.created_at)}</div>
        <div class="cm-content">${escHtml(c.content)}</div>
        <div class="cm-ops">
          <button class="btn btn-sm btn-primary" data-act="approve">通过</button>
          <button class="btn btn-sm btn-danger" data-act="delete">删除</button>
        </div></div>`);
      item.querySelector('[data-act="approve"]').onclick = async () => {
        await api("/comments/bulk", { method: "POST", body: JSON.stringify({ ids: [c.id], action: "approve" }) });
        load();
      };
      item.querySelector('[data-act="delete"]').onclick = async () => {
        if (!confirm("确定删除这条评论？")) return;
        await api("/comments/bulk", { method: "POST", body: JSON.stringify({ ids: [c.id], action: "delete" }) });
        load();
      };
      list.appendChild(item);
    }
  };
  await load();

  const aa = document.getElementById("cm-all-approve");
  const ad = document.getElementById("cm-all-delete");
  if (aa) aa.onclick = async () => {
    const res = await api("/comments?status=pending");
    const cs = await res.json();
    const ids = (cs || []).map((c) => c.id);
    if (!ids.length) return;
    await api("/comments/bulk", { method: "POST", body: JSON.stringify({ ids, action: "approve" }) });
    toast(`已通过 ${ids.length} 条`);
    load();
  };
  if (ad) ad.onclick = async () => {
    if (!confirm("确定删除全部待审核评论？")) return;
    const res = await api("/comments?status=pending");
    const cs = await res.json();
    const ids = (cs || []).map((c) => c.id);
    if (!ids.length) return;
    await api("/comments/bulk", { method: "POST", body: JSON.stringify({ ids, action: "delete" }) });
    toast(`已删除 ${ids.length} 条`);
    load();
  };
}

// ───────────────────────── 回收站 ─────────────────────────
async function renderTrash() {
  const app = adminMain();
  setTitle("回收站");
  app.innerHTML = `<div class="empty">加载中…</div>`;
  const res = await api("/posts?trash=1&summary=1");
  const posts = await res.json();
  const wrap = el(`<div class="dash"></div>`);
  const head = el(`<div class="dash-head"></div>`);
  head.innerHTML = `<div><h1 class="dash-title">回收站</h1>
    <p class="dash-sub">共 ${Array.isArray(posts) ? posts.length : 0} 篇已删除 · 可恢复或彻底删除</p></div>
    <div class="bulk-bar">
      <button class="btn btn-sm btn-primary" id="trash-restore-all">全部恢复</button>
      <button class="btn btn-sm btn-danger" id="trash-purge-all">全部彻底删除</button>
    </div>`;
  wrap.appendChild(head);

  if (!Array.isArray(posts) || !posts.length) {
    wrap.appendChild(el(`<div class="empty">回收站是空的。</div>`));
    app.innerHTML = "";
    app.appendChild(wrap);
    return;
  }
  const table = el(`<table class="admin-table"></table>`);
  table.innerHTML = `<thead><tr><th style="width:36px"><input type="checkbox" id="trash-sel-all" /></th><th>标题</th><th>删除时间</th><th>操作</th></tr></thead>`;
  const tbody = el(`<tbody></tbody>`);
  for (const p of posts) {
    const tr = el(`<tr></tr>`);
    tr.innerHTML = `
      <td><input type="checkbox" class="trash-sel" data-id="${p.id}" /></td>
      <td class="cell-title">${escHtml(p.title)}</td>
      <td>${fmtDate(p.deleted_at)}</td>
      <td class="cell-ops">
        <button class="btn btn-sm btn-primary" data-act="restore" data-id="${p.id}">恢复</button>
        <button class="btn btn-sm btn-danger" data-act="purge" data-id="${p.id}">彻底删除</button>
      </td>`;
    tr.querySelector('[data-act="restore"]').onclick = async () => {
      await api("/posts/" + p.id + "/restore", { method: "POST" });
      toast("已恢复");
      renderTrash();
    };
    tr.querySelector('[data-act="purge"]').onclick = async () => {
      if (!confirm(`彻底删除《${p.title}》？不可恢复！`)) return;
      await api("/posts/" + p.id + "/purge", { method: "DELETE" });
      toast("已彻底删除");
      renderTrash();
    };
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  app.innerHTML = "";
  app.appendChild(wrap);

  const selAll = document.getElementById("trash-sel-all");
  if (selAll) selAll.onchange = () => app.querySelectorAll(".trash-sel").forEach((cb) => (cb.checked = selAll.checked));
  const restoreAll = document.getElementById("trash-restore-all");
  const purgeAll = document.getElementById("trash-purge-all");
  const ids = () => [...document.querySelectorAll(".trash-sel:checked")].map((cb) => Number(cb.dataset.id));
  if (restoreAll) restoreAll.onclick = async () => {
    const sel = ids();
    const target = sel.length ? sel : (posts || []).map((p) => p.id);
    if (!sel.length && !confirm("确定恢复回收站全部文章？")) return;
    for (const id of target) await api("/posts/" + id + "/restore", { method: "POST" });
    toast("已恢复");
    renderTrash();
  };
  if (purgeAll) purgeAll.onclick = async () => {
    if (!confirm("确定彻底删除所选/全部文章？不可恢复！")) return;
    const sel = ids();
    const target = sel.length ? sel : (posts || []).map((p) => p.id);
    for (const id of target) await api("/posts/" + id + "/purge", { method: "DELETE" });
    toast("已彻底删除");
    renderTrash();
  };
}

// ───────────────────────── 数据分析 ─────────────────────────
async function renderAnalytics() {
  const app = adminMain();
  setTitle("数据分析");
  app.innerHTML = `<div class="empty">加载中…</div>`;
  const data = await (await api("/analytics")).json();
  const wrap = el(`<div class="dash"></div>`);
  wrap.innerHTML = `<div class="dash-head"><div><h1 class="dash-title">数据分析</h1>
    <p class="dash-sub">热门文章 · 流量来源 · 收录推送</p></div></div>`;

  const popular = data.popular || [];
  const referers = data.referers || [];
  const indexnow = data.indexnow || [];

  const sec1 = el(`<div class="analytic-card"></div>`);
  sec1.innerHTML = `<h2>🔥 热门文章 TOP ${popular.length || 10}</h2>` + (popular.length
    ? `<ol class="rank-list">${popular.map((p) => `<li><a href="#/post/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a><span class="rank-views">${p.views} 阅读</span></li>`).join("")}</ol>`
    : `<div class="empty">暂无数据</div>`);
  wrap.appendChild(sec1);

  const sec2 = el(`<div class="analytic-card"></div>`);
  sec2.innerHTML = `<h2>🌐 流量来源（近 30 天，共 ${data.refererTotal || 0} 次外链访问）</h2>` + (referers.length
    ? `<ol class="rank-list">${referers.slice(0, 20).map((r) => `<li><span>${escHtml(r.domain)}</span><span class="rank-views">${r.cnt}</span></li>`).join("")}</ol>`
    : `<div class="empty">暂无外部来源（多为直接访问或未统计）</div>`);
  wrap.appendChild(sec2);

  const sec3 = el(`<div class="analytic-card"></div>`);
  sec3.innerHTML = `<h2>🔎 收录推送（IndexNow，共 ${data.indexnowTotal || 0} 次）</h2>
    <p class="muted">文章发布/更新时自动通知 Bing/Naver/Yandex；下方为最近推送记录。</p>` +
    (indexnow.length
      ? `<table class="admin-table"><thead><tr><th>时间</th><th>状态</th><th>URL</th><th>响应</th></tr></thead><tbody>${indexnow
          .slice(0, 30)
          .map((r) => `<tr><td>${fmtDate(r.created_at)}</td><td><span class="badge ${r.status === 200 ? "badge-public" : "badge-lock"}">${r.status || "网络错误"}</span></td><td>${escHtml(r.url)}</td><td class="muted">${escHtml((r.resp || "").slice(0, 60))}</td></tr>`)
          .join("")}</tbody></table>`
      : `<div class="empty">暂无推送记录</div>`);
  wrap.appendChild(sec3);

  app.innerHTML = "";
  app.appendChild(wrap);
}

// ───────────────────────── 审计日志 ─────────────────────────
const AUDIT_LABELS = {
  login: "登录", change_password: "修改密码", post_create: "新建文章", post_update: "更新文章",
  post_delete: "移入回收站", post_restore: "恢复文章", post_purge: "彻底删除文章",
  post_bulk: "批量操作文章", comment_bulk: "批量操作评论", settings_update: "修改设置",
  backup_import: "导入备份", media_delete: "删除媒体", media_cleanup: "清理孤儿媒体",
  webhook_fire: "触发 Webhook",
};
async function renderAudit() {
  const app = adminMain();
  setTitle("审计日志");
  app.innerHTML = `<div class="empty">加载中…</div>`;
  const logs = await (await api("/audit")).json();
  const wrap = el(`<div class="dash"></div>`);
  wrap.innerHTML = `<div class="dash-head"><div><h1 class="dash-title">审计日志</h1>
    <p class="dash-sub">关键操作留痕（最近 ${Array.isArray(logs) ? logs.length : 0} 条）</p></div></div>`;
  const table = el(`<table class="admin-table"></table>`);
  table.innerHTML = `<thead><tr><th>时间</th><th>操作者</th><th>操作</th><th>对象</th><th>详情</th></tr></thead>`;
  const tbody = el(`<tbody></tbody>`);
  if (Array.isArray(logs) && logs.length) {
    for (const l of logs) {
      const tr = el(`<tr></tr>`);
      tr.innerHTML = `<td>${fmtDate(l.created_at)}</td><td>${escHtml(l.actor || "")}</td>
        <td><span class="badge">${AUDIT_LABELS[l.action] || l.action}</span></td>
        <td>${escHtml(l.target || "")}</td><td class="muted">${escHtml(l.detail || "")}</td>`;
      tbody.appendChild(tr);
    }
  } else {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">暂无记录</td></tr>`;
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  app.innerHTML = "";
  app.appendChild(wrap);
}
