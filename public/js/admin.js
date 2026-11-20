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
  // 后台独立主题：与前台 data-theme 解耦，只作用于 body.admin-mode
  document.documentElement.dataset.adminTheme = "violet";
  try {
    if (localStorage.getItem("admin-collapsed") === "1") document.body.classList.add("admin-collapsed");
  } catch {}
  app.innerHTML = `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <div class="admin-brand" id="adminBrand">
          <span class="admin-logo"><i data-lucide="bot"></i></span>
          <div class="admin-brand-txt">
            <div class="admin-brand-name">AI Agent</div>
            <div class="admin-brand-sub">管理后台</div>
          </div>
          <button type="button" class="admin-collapse-btn" id="adminCollapseBtn" title="收起侧栏"><i data-lucide="panel-left-close"></i></button>
          <span class="caret brand-caret">▾</span>
          <div class="admin-brand-menu" id="adminBrandMenu" role="menu">
            <button type="button" class="admin-menu-item" id="btnChangePw2"><i data-lucide="key-round"></i> 修改密码</button>
            <button type="button" class="admin-menu-item danger" id="btnLogout2"><i data-lucide="log-out"></i> 登出</button>
          </div>
        </div>
        <nav class="admin-nav">
          <div class="admin-nav-group">
            <div class="admin-nav-label">内容</div>
            <a class="admin-nav-item" href="#/admin" data-nav="overview"><span class="ico"><i data-lucide="layout-dashboard"></i></span><span>概览</span></a>
            <a class="admin-nav-item" href="#/admin/posts" data-nav="posts"><span class="ico"><i data-lucide="file-text"></i></span><span>文章</span></a>
            <a class="admin-nav-item" href="#/admin/media" data-nav="media"><span class="ico"><i data-lucide="images"></i></span><span>媒体库</span></a>
            <a class="admin-nav-item" href="#/admin/trash" data-nav="trash"><span class="ico"><i data-lucide="trash-2"></i></span><span>回收站</span></a>
          </div>
          <div class="admin-nav-group">
            <div class="admin-nav-label">运营</div>
            <a class="admin-nav-item" href="#/admin/comments" data-nav="comments"><span class="ico"><i data-lucide="message-square"></i></span><span>评论审核</span></a>
            <a class="admin-nav-item" href="#/admin/traffic" data-nav="traffic"><span class="ico"><i data-lucide="bar-chart-2"></i></span><span>流量中心</span></a>
            <a class="admin-nav-item" href="#/admin/tags" data-nav="tags"><span class="ico"><i data-lucide="tags"></i></span><span>标签管理</span></a>
            <a class="admin-nav-item" href="#/admin/scheduled" data-nav="scheduled"><span class="ico"><i data-lucide="calendar-clock"></i></span><span>定时发布</span></a>
            <a class="admin-nav-item" href="#/admin/insights" data-nav="insights"><span class="ico"><i data-lucide="scan-search"></i></span><span>SEO 体检</span></a>
            <a class="admin-nav-item" href="#/admin/enrich" data-nav="enrich"><span class="ico"><i data-lucide="wand-sparkles"></i></span><span>AI 补全</span></a>
            <a class="admin-nav-item" href="#/admin/preflight" data-nav="preflight"><span class="ico"><i data-lucide="shield-check"></i></span><span>发布预检</span></a>
          </div>
          <div class="admin-nav-group">
            <div class="admin-nav-label">系统</div>
            <a class="admin-nav-item" href="#/admin/audit" data-nav="audit"><span class="ico"><i data-lucide="shield"></i></span><span>审计日志</span></a>
            <a class="admin-nav-item" href="#/admin/system" data-nav="system"><span class="ico"><i data-lucide="activity"></i></span><span>系统状态</span></a>
            <a class="admin-nav-item" href="#/admin/ops" data-nav="ops"><span class="ico"><i data-lucide="gauge"></i></span><span>运维面板</span></a>
            <a class="admin-nav-item" href="#/admin/2fa" data-nav="2fa"><span class="ico"><i data-lucide="key-round"></i></span><span>两步验证</span></a>
            <a class="admin-nav-item" href="#/admin/settings" data-nav="settings"><span class="ico"><i data-lucide="settings"></i></span><span>设置</span></a>
          </div>
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
          <button type="button" class="admin-cmd-trigger" id="adminCmdBtn"><i data-lucide="search"></i><span>搜索文章、标签或执行操作…</span><kbd>Ctrl K</kbd></button>
          <a class="admin-home-btn" href="#/" title="返回网站首页"><i data-lucide="home"></i> 返回首页</a>
        </header>
        <div class="admin-main" id="admin-main"></div>
      </div>
    </div>`;
  bindAdminUserMenu();
  bindAdminShellExtras();
}

// 侧栏折叠 + 全局命令面板入口
function bindAdminShellExtras() {
  const btn = document.getElementById("adminCollapseBtn");
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = "1";
    btn.onclick = () => {
      const collapsed = document.body.classList.toggle("admin-collapsed");
      try { localStorage.setItem("admin-collapsed", collapsed ? "1" : "0"); } catch {}
      btn.title = collapsed ? "展开侧栏" : "收起侧栏";
    };
  }
  const cmdBtn = document.getElementById("adminCmdBtn");
  if (cmdBtn) cmdBtn.onclick = openCommandPalette;
  if (!window.__adminCmdBound) {
    window.__adminCmdBound = true;
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key || "").toLowerCase() === "k" && document.body.classList.contains("admin-mode")) {
        e.preventDefault();
        openCommandPalette();
      }
    });
  }
}

// 命令面板：搜索文章/标签 + 快速跳转；数据按需加载并缓存于本次会话
let CMD_CACHE = null;
async function openCommandPalette() {
  if (document.querySelector(".cmd-overlay")) return;
  const ov = el(`<div class="cmd-overlay"><div class="cmd-panel">
    <div class="cmd-input-wrap"><i data-lucide="search"></i><input id="cmdInput" type="text" placeholder="搜索文章、标签或输入操作…" autocomplete="off" /><kbd>ESC</kbd></div>
    <div class="cmd-results" id="cmdResults"><div class="cmd-hint">正在索引…</div></div>
  </div></div>`);
  document.body.appendChild(ov);
  try { window.lucide && window.lucide.createIcons({ root: ov }); } catch {}
  const input = ov.querySelector("#cmdInput");
  const results = ov.querySelector("#cmdResults");
  let active = 0, items = [];

  const actions = [
    { kind: "action", label: "新建文章", hint: "写文章", run: () => { location.hash = "#/admin/new"; } },
    { kind: "action", label: "SEO 体检", hint: "全站扫描", run: () => { location.hash = "#/admin/insights"; } },
    { kind: "action", label: "AI 补全元数据", hint: "批量生成摘要与标签", run: () => { location.hash = "#/admin/enrich"; } },
    { kind: "action", label: "发布前预检", hint: "死链/敏感词检查", run: () => { location.hash = "#/admin/preflight"; } },
    { kind: "action", label: "运维面板", hint: "缓存与向量", run: () => { location.hash = "#/admin/ops"; } },
    { kind: "action", label: "定时发布", hint: "内容日历", run: () => { location.hash = "#/admin/scheduled"; } },
    { kind: "action", label: "流量中心", hint: "数据分析", run: () => { location.hash = "#/admin/traffic"; } },
    { kind: "action", label: "设置", hint: "站点配置", run: () => { location.hash = "#/admin/settings"; } },
  ];

  if (!CMD_CACHE) {
    CMD_CACHE = { posts: [], tags: [] };
    try {
      const r = await api("/posts?summary=1");
      if (r.ok) {
        const d = await r.json();
        CMD_CACHE.posts = Array.isArray(d) ? d : (d.posts || []);
      }
    } catch {}
    try {
      const r = await api("/tags");
      if (r.ok) {
        const d = await r.json();
        CMD_CACHE.tags = Array.isArray(d) ? d : (d.tags || []);
      }
    } catch {}
  }

  const paint = () => {
    const q = (input.value || "").trim().toLowerCase();
    items = [];
    if (!q) {
      items.push(...actions.slice(0, 5));
    } else {
      for (const a of actions) if ((a.label + a.hint).toLowerCase().includes(q)) items.push(a);
      for (const p of CMD_CACHE.posts) {
        if ((String(p.title || "") + String(p.slug || "")).toLowerCase().includes(q)) {
          items.push({ kind: "post", label: String(p.title || p.slug), hint: "编辑文章", post: p,
            run: () => { location.hash = "#/admin/edit/" + encodeURIComponent(p.slug); } });
        }
      }
      for (const t of CMD_CACHE.tags) {
        const name = typeof t === "string" ? t : String(t.name || t.tag || "");
        if (name && name.toLowerCase().includes(q)) {
          items.push({ kind: "tag", label: name, hint: "查看标签文章",
            run: () => { location.hash = "#/tag/" + encodeURIComponent(name); } });
        }
      }
    }
    items = items.slice(0, 12);
    active = Math.min(active, Math.max(0, items.length - 1));
    if (!items.length) {
      results.innerHTML = `<div class="cmd-hint">没有匹配结果</div>`;
      return;
    }
    results.innerHTML = items.map((it, i) => `
      <button type="button" class="cmd-item ${i === active ? "active" : ""}" data-i="${i}">
        <span class="cmd-kind">${it.kind === "post" ? "文章" : it.kind === "tag" ? "标签" : "操作"}</span>
        <span class="cmd-label">${escHtml(it.label)}</span>
        <span class="cmd-hint">${escHtml(it.hint || "")}</span>
      </button>`).join("");
    results.querySelectorAll(".cmd-item").forEach((b) => {
      b.onclick = () => choose(Number(b.dataset.i));
      b.onmouseenter = () => { active = Number(b.dataset.i); paintActive(); };
    });
  };
  const paintActive = () => results.querySelectorAll(".cmd-item").forEach((b, i) => b.classList.toggle("active", i === active));
  const choose = (i) => {
    const it = items[i];
    if (!it) return;
    ov.remove();
    document.removeEventListener("keydown", onKey, true);
    it.run();
  };
  const onKey = (e) => {
    if (e.key === "Escape") { ov.remove(); document.removeEventListener("keydown", onKey, true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paintActive(); }
    if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); paintActive(); }
    if (e.key === "Enter") { e.preventDefault(); choose(active); }
  };
  document.addEventListener("keydown", onKey, true);
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
  input.addEventListener("input", () => { active = 0; paint(); });
  paint();
  input.focus();
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
    [/^#\/admin\/(traffic|analytics|search)/, "traffic"],
    [/^#\/admin\/tags/, "tags"],
    [/^#\/admin\/scheduled/, "scheduled"],
    [/^#\/admin\/system/, "system"],
    [/^#\/admin\/audit/, "audit"],
    [/^#\/admin\/media/, "media"],
    [/^#\/admin\/insights/, "insights"],
    [/^#\/admin\/enrich/, "enrich"],
    [/^#\/admin\/preflight/, "preflight"],
    [/^#\/admin\/ops/, "ops"],
    [/^#\/admin\/2fa/, "2fa"],
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
    else if (/^#\/admin\/(traffic|analytics|search)/.test(hash)) crumb = "流量中心";
    else if (/^#\/admin\/tags/.test(hash)) crumb = "标签管理";
    else if (/^#\/admin\/scheduled/.test(hash)) crumb = "定时发布";
    else if (/^#\/admin\/system/.test(hash)) crumb = "系统状态";
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

// 后台路由切换套用 View Transitions（首屏无 admin-mode，不套动画避免闪一下）
function renderAdmin() {
  try {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.body.classList.contains("admin-mode") && typeof document.startViewTransition === "function" && !reduce) {
      document.startViewTransition(() => { renderAdminInner(); });
      return;
    }
  } catch {}
  renderAdminInner();
}

function renderAdminInner() {
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
  if (hash.startsWith("#/admin/traffic")) {
    const tab = hash.slice("#/admin/traffic".length).replace(/^\//, "").split(/[?#]/)[0];
    renderTrafficCenter(tab || "trend");
    return;
  }
  // 旧书签 / 外链兼容：静默改写地址后直接渲染，避免二次跳转留下一瞬空白
  if (hash.startsWith("#/admin/analytics")) {
    try { history.replaceState(null, "", "#/admin/traffic"); } catch {}
    renderTrafficCenter("trend");
    return;
  }
  if (hash.startsWith("#/admin/audit")) {
    renderAudit();
    return;
  }
  if (hash.startsWith("#/admin/search")) {
    try { history.replaceState(null, "", "#/admin/traffic/search"); } catch {}
    renderTrafficCenter("search");
    return;
  }
  if (hash.startsWith("#/admin/tags")) {
    renderTagManager();
    return;
  }
  if (hash.startsWith("#/admin/scheduled")) {
    renderScheduled();
    return;
  }
  if (hash.startsWith("#/admin/system")) {
    renderSystemStatus();
    return;
  }
  if (hash.startsWith("#/admin/insights")) {
    renderInsights();
    return;
  }
  if (hash.startsWith("#/admin/enrich")) {
    renderEnrich();
    return;
  }
  if (hash.startsWith("#/admin/preflight")) {
    renderPreflight();
    return;
  }
  if (hash.startsWith("#/admin/ops")) {
    renderOps();
    return;
  }
  if (hash.startsWith("#/admin/2fa")) {
    render2FA();
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
      if (data.need2fa) {
        const step = el(`<div class="login-card form">
          <h2>两步验证</h2>
          <p class="muted">密码正确，请输入验证器动态码或备用码</p>
          <label>动态码 / 备用码</label>
          <input type="text" id="twoFaLoginCode" placeholder="6 位动态码或备用码" autocomplete="one-time-code" />
          <button class="btn btn-primary" id="twoFaLoginBtn" style="margin-top:14px;width:100%">验证并进入</button>
          <button class="btn" id="twoFaBack" style="margin-top:8px;width:100%">返回</button>
        </div>`);
        app.innerHTML = "";
        app.appendChild(step);
        const submit2fa = async () => {
          const code = (document.getElementById("twoFaLoginCode").value || "").trim();
          if (!code) { toast("请输入验证码"); return; }
          const b = document.getElementById("twoFaLoginBtn");
          b.disabled = true; b.textContent = "验证中…";
          try {
            const rr = await api("/auth/login/2fa", { method: "POST", body: JSON.stringify({ challenge: data.challenge, code }) });
            const jj = await rr.json().catch(() => ({}));
            if (!rr.ok) { toast(jj.error || "验证失败"); return; }
            CURRENT_USER = jj.user;
            renderNav();
            renderAdmin();
          } catch { toast("验证请求失败"); }
          finally { if (b.isConnected) { b.disabled = false; b.textContent = "验证并进入"; } }
        };
        step.querySelector("#twoFaLoginBtn").onclick = submit2fa;
        step.querySelector("#twoFaBack").onclick = renderLogin;
        step.querySelector("#twoFaLoginCode").addEventListener("keydown", (e) => { if (e.key === "Enter") submit2fa(); });
        step.querySelector("#twoFaLoginCode").focus();
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

// 统一加载骨架与空状态（后台质感：不用裸「加载中」打断视觉）
function adminSkeleton(rows = 4) {
  return `<div class="skeleton-wrap"><div class="sk sk-title"></div>
    <div class="sk-grid">${Array.from({ length: 4 }, () => '<div class="sk sk-card"></div>').join("")}</div>
    ${Array.from({ length: rows }, () => '<div class="sk sk-row"></div>').join("")}</div>`;
}
function adminEmpty(icon, title, desc, actionHtml = "") {
  return `<div class="empty-state"><div class="empty-ico"><i data-lucide="${escHtml(icon || "file-text")}"></i></div>
    <div class="empty-title">${escHtml(title || "暂无数据")}</div>
    <div class="empty-desc">${escHtml(desc || "")}</div>${actionHtml}</div>`;
}

// 纯 SVG 迷你趋势（无第三方图表库；数值全为整数，避免 NaN 路径）
function sparkline(values, w = 88, h = 26) {
  const a = (Array.isArray(values) ? values : []).map((n) => Number(n) || 0);
  if (!a.length) return "";
  const max = Math.max(1, ...a), min = Math.min(...a);
  const span = Math.max(1, max - min);
  const pts = a.map((v, i) => {
    const x = a.length === 1 ? w / 2 : (i / (a.length - 1)) * (w - 4) + 2;
    const y = h - 3 - ((v - min) / span) * (h - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

async function renderDashboard() {
  const app = adminMain();
  app.innerHTML = adminSkeleton();
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
    const counts = stats.recent7.map((d) => Number(d.count) || 0);
    const sum7 = counts.reduce((s, n) => s + n, 0);
    const panel = el(`<div class="stats-panel"></div>`);
    panel.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card clickable" data-drill="all"><div class="kpi-top"><span class="kpi-label">文章总数</span><span class="kpi-ico"><i data-lucide="file-text"></i></span></div><div class="kpi-num">${stats.total}</div><div class="kpi-foot"><span>近 7 天 ${sum7} 篇</span>${sparkline(counts)}</div></div>
        <div class="kpi-card clickable" data-drill="public"><div class="kpi-top"><span class="kpi-label">公开文章</span><span class="kpi-ico"><i data-lucide="globe"></i></span></div><div class="kpi-num">${stats.public}</div><div class="kpi-foot"><span>占总数 ${stats.total ? Math.round((stats.public / stats.total) * 100) : 0}%</span>${sparkline(counts)}</div></div>
        <div class="kpi-card clickable" data-drill="comments"><div class="kpi-top"><span class="kpi-label">评论互动</span><span class="kpi-ico"><i data-lucide="message-square"></i></span></div><div class="kpi-num">${stats.comments}</div><div class="kpi-foot"><span>有评论的文章</span>${sparkline(counts)}</div></div>
        <div class="kpi-card"><div class="kpi-top"><span class="kpi-label">今日访问</span><span class="kpi-ico"><i data-lucide="eye"></i></span></div><div class="kpi-num">${stats.todayViews || 0}</div><div class="kpi-foot"><span>累计 ${stats.totalViews || 0}</span>${sparkline(counts)}</div></div>
      </div>
      <div class="stat-mini-row">
        <div class="stat-mini clickable" data-drill="private">私密 <b>${stats.private}</b></div>
        <div class="stat-mini clickable" data-drill="tags">已打标签 <b>${stats.tags}</b></div>
        <div class="stat-mini clickable" data-drill="ai">AI 调用 <b>${stats.aiUsage}</b></div>
        <div class="stat-mini"><a href="#/admin/insights">SEO 体检 <b>去扫描 →</b></a></div>
      </div>
      <div class="stat-chart"><div class="stat-chart-title">近 7 天发布</div><div class="bars">${bars}</div></div>`;
    wrap.appendChild(panel);
    try { window.lucide && window.lucide.createIcons({ root: wrap }); } catch {}
    // 统计卡片点击下钻到文章标题列表（走正式路由，保证返回/导航按钮可用）
    panel.querySelectorAll("[data-drill].clickable").forEach((card) => {
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
  app.innerHTML = adminSkeleton();
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
  app.innerHTML = adminSkeleton();
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
    app.innerHTML = adminSkeleton();
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
    app.innerHTML = adminSkeleton();
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
      ${slug ? `<button class="btn" id="open-revisions" type="button"><i data-lucide="history"></i> 历史版本</button>` : ""}
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

  // 历史版本：打开版本面板（仅已有文章）
  const revBtn = document.getElementById("open-revisions");
  if (revBtn && post) {
    revBtn.onclick = () => openRevisionPanel(post, () => renderEditor(slug));
  }

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
  app.innerHTML = adminSkeleton();
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
      <label style="margin-top:14px">默认分享图（og:image，建议 1200×630；留空用内置图）</label>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input type="text" id="s-og_image" value="${escHtml(s.og_image || "")}" placeholder="/api/files/images/xxx.png 或 https://..." style="flex:1;min-width:240px" />
        <label class="btn btn-sm" style="cursor:pointer">上传<input type="file" id="og-upload" accept="image/*" style="display:none" /></label>
      </div>
      <div id="og-preview" style="margin-top:8px">${s.og_image ? `<img src="${escHtml(s.og_image)}" style="max-height:70px;border-radius:8px;border:1px solid var(--border)" />` : `<span class="muted">未设置，使用 /og-default.png</span>`}</div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:14px;cursor:pointer">
        <input type="checkbox" id="s-sitemap_enabled" ${s.sitemap_enabled !== "0" ? "checked" : ""} /> 生成 sitemap.xml（关闭后 robots.txt 也不再声明站点地图）
      </label>
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

    <fieldset class="set-group">
      <legend>⑪ 高级自定义</legend>

      <label>自定义 CSS（注入全站 &lt;head&gt;，用于微调主题/布局，无需改源码）</label>
      <textarea id="s-custom_css" style="min-height:120px;font-family:monospace" placeholder=":root{--primary:#ff6600}\n.post-card{border-radius:16px}">${escHtml(s.custom_css || "")}</textarea>

      <label style="display:flex;align-items:center;gap:8px;margin-top:16px;cursor:pointer">
        <input type="checkbox" id="s-maintenance_mode" ${s.maintenance_mode === "1" ? "checked" : ""} /> 开启维护模式（访客看到「网站维护中」页，仅管理员可正常访问）
      </label>
      <label style="margin-top:12px">维护页提示文案</label>
      <input type="text" id="s-maintenance_text" value="${escHtml(s.maintenance_text || "")}" placeholder="网站正在维护中，请稍后再访问。" />

      <label style="margin-top:16px">RSS 标题（留空用站点名称）</label>
      <input type="text" id="s-rss_title" value="${escHtml(s.rss_title || "")}" placeholder="AI Agent Blog" />
      <label style="margin-top:12px">RSS 条目数（默认 50，上限 200）</label>
      <input type="number" id="s-rss_count" min="1" max="200" value="${escHtml(s.rss_count || "50")}" />
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer">
        <input type="checkbox" id="s-rss_full" ${s.rss_full === "1" ? "checked" : ""} /> RSS 输出全文（而非摘要）
      </label>

      <label style="margin-top:16px">页面缓存时长（秒，0 = 不缓存 / no-store；建议 0 以保证内容即时更新）</label>
      <input type="number" id="s-cache_ttl" min="0" max="86400" value="${escHtml(s.cache_ttl || "0")}" />

      <label style="margin-top:16px">登录会话有效期（天，默认 30；过期后需重新登录）</label>
      <input type="number" id="s-session_ttl" min="1" max="365" value="${escHtml(s.session_ttl || "30")}" />

      <label style="margin-top:16px">动效强度（3D 倾斜 / 视差 / 进场动画）</label>
      <select id="s-motion_level">
        <option value="auto" ${(s.motion_level || "auto") === "auto" ? "selected" : ""}>跟随系统（推荐）</option>
        <option value="full" ${s.motion_level === "full" ? "selected" : ""}>强制开启（系统关闭动画时也启用 3D）</option>
        <option value="off" ${s.motion_level === "off" ? "selected" : ""}>全部关闭（省电 / 低端设备）</option>
      </select>
      <p class="muted" style="margin-top:6px">若你的系统开启了「减少动画」，选择「强制开启」才能看到卡片倾斜与封面视差。</p>

      <label style="margin-top:16px">自定义 &lt;head&gt; 内容（meta 验证标签 / 预连接 / 额外脚本，直接插入页面 head）</label>
      <textarea id="s-extra_head" style="min-height:90px;font-family:monospace" placeholder='<meta name="google-site-verification" content="..." />'>${escHtml(s.extra_head || "")}</textarea>

      <label style="margin-top:16px">站长统计代码（百度统计 / GA / Umami 等，插入页面底部并执行）</label>
      <textarea id="s-stats_code" style="min-height:110px;font-family:monospace" placeholder="<script>var _hmt = _hmt || []; ...</script>">${escHtml(s.stats_code || "")}</textarea>
    </fieldset>

    <fieldset class="set-group">
      <legend>⑫ 品牌与合规</legend>
      <label>站点 Logo（显示在顶栏品牌名旁，建议正方形透明 PNG）</label>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input type="text" id="s-site_logo" value="${escHtml(s.site_logo || "")}" placeholder="/api/files/images/xxx.png 或 https://..." style="flex:1;min-width:220px" />
        <input type="file" id="s-logo-file" accept="image/*" style="display:none" />
        <button type="button" class="btn" id="btn-logo-upload"><i data-lucide="upload"></i> 上传</button>
      </div>
      <div id="logo-preview" style="margin-top:8px">${s.site_logo ? `<img src="${escHtml(s.site_logo)}" style="max-height:48px;max-width:120px;border-radius:8px" />` : `<span class="muted">未设置</span>`}</div>

      <label style="margin-top:16px">社交链接（每行一个，格式：标签|URL）</label>
      <textarea id="s-social_links" style="min-height:90px" placeholder="GitHub|https://github.com/hujinhuan-droid&#10;知乎|https://www.zhihu.com/people/xxx&#10;邮箱|mailto:me@example.com">${escHtml(s.social_links || "")}</textarea>

      <label style="margin-top:14px">ICP 备案号</label>
      <input type="text" id="s-beian_icp" value="${escHtml(s.beian_icp || "")}" placeholder="京ICP备12345678号" />

      <label style="margin-top:12px">公安备案号</label>
      <input type="text" id="s-beian_gongan" value="${escHtml(s.beian_gongan || "")}" placeholder="京公网安备 11010502030123号" />

      <label style="margin-top:12px">隐私政策页 URL</label>
      <input type="text" id="s-privacy_url" value="${escHtml(s.privacy_url || "")}" placeholder="https://... 或 /#/about" />

      <label style="margin-top:12px">友链（每行一个，格式：标签|URL）</label>
      <textarea id="s-friend_links" style="min-height:80px" placeholder="某某的博客|https://example.com">${escHtml(s.friend_links || "")}</textarea>
    </fieldset>

    <fieldset class="set-group">
      <legend>⑬ 登录安全（失败锁定）</legend>
      <p class="muted">按「IP + 用户名」统计密码错误次数，超限后临时锁定登录，防止暴力破解。</p>
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer">
        <input type="checkbox" id="s-login_lock_enabled" ${s.login_lock_enabled === "1" ? "checked" : ""} /> 启用登录失败锁定
      </label>
      <label style="margin-top:14px">最大失败次数（达到后锁定，默认 5）</label>
      <input type="number" id="s-login_max_attempts" min="1" max="50" value="${escHtml(s.login_max_attempts || "5")}" />
      <label style="margin-top:12px">锁定时长（分钟，默认 15）</label>
      <input type="number" id="s-login_lock_minutes" min="1" max="1440" value="${escHtml(s.login_lock_minutes || "15")}" />
      <p class="set-hint">关闭时不生效；开启后登录成功会立即清零计数。</p>
    </fieldset>

    <fieldset class="set-group">
      <legend>⑭ 作者名片</legend>
      <p class="muted">显示在文章页右侧栏（小屏显示在正文末尾）。留空时自动回退到站点名称、站点 Logo 与关于页内容。</p>
      <label style="margin-top:12px">显示名称</label>
      <input type="text" id="s-author_name" value="${escHtml(s.author_name || "")}" placeholder="留空则使用站点名称" />
      <label style="margin-top:12px">一句话简介</label>
      <input type="text" id="s-author_bio" value="${escHtml(s.author_bio || "")}" placeholder="记录 AI Agent 的探索、实践与思考" />
      <label style="margin-top:12px">头像地址</label>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="text" id="s-author_avatar" value="${escHtml(s.author_avatar || "")}" placeholder="/api/files/images/avatar.png 或 https://..." style="flex:1;min-width:200px" />
        <label class="btn btn-sm" style="cursor:pointer">上传<input type="file" id="author-avatar-upload" accept="image/*" style="display:none" /></label>
      </div>
      <p class="set-hint">建议使用正方形图片；未设置时使用站点 Logo，都没有则自动生成文字头像。</p>
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

  // 站点 Logo 上传（复用 /api/upload → R2），填入 URL 后仍需点「保存设置」
  const btnLogoUpload = document.getElementById("btn-logo-upload");
  if (btnLogoUpload) btnLogoUpload.onclick = async () => {
    const f = document.getElementById("s-logo-file").files[0];
    if (!f) return toast("请先选择图片");
    btnLogoUpload.disabled = true;
    try {
      const data = await fileToBase64(f);
      const r = await api("/upload", { method: "POST", body: JSON.stringify({ name: f.name, type: f.type, data }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) {
        document.getElementById("s-site_logo").value = d.url;
        document.getElementById("logo-preview").innerHTML = `<img src="${escHtml(d.url)}" style="max-height:48px;max-width:120px;border-radius:8px" />`;
        toast("Logo 已上传，记得点保存设置");
      } else toast(d.error || "上传失败");
    } catch (e) {
      toast("上传失败");
    } finally {
      btnLogoUpload.disabled = false;
    }
  };

  // 默认分享图上传（同上，复用 /api/upload），填入 URL 后仍需点「保存设置」
  const ogInput = document.getElementById("og-upload");
  if (ogInput) ogInput.onchange = async () => {
    const f = ogInput.files[0];
    if (!f) return;
    try {
      const data = await fileToBase64(f);
      const r = await api("/upload", { method: "POST", body: JSON.stringify({ name: f.name, type: f.type, data }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) {
        document.getElementById("s-og_image").value = d.url;
        document.getElementById("og-preview").innerHTML = `<img src="${escHtml(d.url)}" style="max-height:70px;border-radius:8px;border:1px solid var(--border)" />`;
        toast("分享图已上传，记得点保存设置");
      } else toast(d.error || "上传失败");
    } catch {
      toast("上传失败");
    }
  };

  // 作者头像上传（同上），填入 URL 后仍需点「保存设置」
  const avatarInput = document.getElementById("author-avatar-upload");
  if (avatarInput) avatarInput.onchange = async () => {
    const f = avatarInput.files[0];
    if (!f) return;
    try {
      const data = await fileToBase64(f);
      const r = await api("/upload", { method: "POST", body: JSON.stringify({ name: f.name, type: f.type, data }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) {
        document.getElementById("s-author_avatar").value = d.url;
        toast("头像已上传，记得点保存设置");
      } else toast(d.error || "上传失败");
    } catch {
      toast("上传失败");
    }
  };

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
      custom_css: document.getElementById("s-custom_css").value,
      maintenance_mode: document.getElementById("s-maintenance_mode").checked ? "1" : "0",
      maintenance_text: document.getElementById("s-maintenance_text").value.trim(),
      rss_title: document.getElementById("s-rss_title").value.trim(),
      rss_count: document.getElementById("s-rss_count").value.trim() || "50",
      rss_full: document.getElementById("s-rss_full").checked ? "1" : "0",
      cache_ttl: document.getElementById("s-cache_ttl").value.trim() || "0",
      session_ttl: document.getElementById("s-session_ttl").value.trim() || "30",
      site_logo: document.getElementById("s-site_logo").value.trim(),
      social_links: document.getElementById("s-social_links").value,
      beian_icp: document.getElementById("s-beian_icp").value.trim(),
      beian_gongan: document.getElementById("s-beian_gongan").value.trim(),
      privacy_url: document.getElementById("s-privacy_url").value.trim(),
      friend_links: document.getElementById("s-friend_links").value,
      login_lock_enabled: document.getElementById("s-login_lock_enabled").checked ? "1" : "0",
      login_max_attempts: document.getElementById("s-login_max_attempts").value.trim() || "5",
      login_lock_minutes: document.getElementById("s-login_lock_minutes").value.trim() || "15",
      og_image: document.getElementById("s-og_image").value.trim(),
      sitemap_enabled: document.getElementById("s-sitemap_enabled").checked ? "1" : "0",
      extra_head: document.getElementById("s-extra_head").value,
      stats_code: document.getElementById("s-stats_code").value,
      motion_level: document.getElementById("s-motion_level").value || "auto",
      author_name: document.getElementById("s-author_name").value.trim(),
      author_bio: document.getElementById("s-author_bio").value.trim(),
      author_avatar: document.getElementById("s-author_avatar").value.trim(),
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
  app.innerHTML = adminSkeleton();
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
  app.innerHTML = adminSkeleton();
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
const DEVICE_LABEL = { desktop: "桌面端", mobile: "手机", tablet: "平板", bot: "爬虫 / 机器人", unknown: "未知" };
const SOURCE_LABEL = { direct: "直接访问", search: "搜索引擎", social: "社交媒体", external: "外部链接", unknown: "未知" };
const TRAFFIC_STATE = { days: 30, device: "", source: "", slug: "" };
let TRAFFIC_DATA = null;

/** 拉取流量数据；full=true 时连筛选工具条一起重绘（选项依赖时间范围） */
async function refreshTraffic(box, full) {
  const q = new URLSearchParams({ days: String(TRAFFIC_STATE.days) });
  if (TRAFFIC_STATE.device) q.set("device", TRAFFIC_STATE.device);
  if (TRAFFIC_STATE.source) q.set("source", TRAFFIC_STATE.source);
  if (TRAFFIC_STATE.slug) q.set("slug", TRAFFIC_STATE.slug);
  let d = null;
  try {
    const r = await api("/admin/traffic?" + q.toString());
    if (r.ok) d = await r.json();
  } catch {}
  TRAFFIC_DATA = d;
  if (full || !box.querySelector("#tf-body")) drawTrafficPanel(box);
  else drawTrafficBody(box.querySelector("#tf-body"));
}

function tfOptions(arr, cur, allLabel, labelFn) {
  return `<option value="">${allLabel}</option>` + (arr || [])
    .map((v) => {
      const value = typeof v === "string" ? v : v.slug;
      const text = labelFn ? labelFn(v) : value;
      return `<option value="${escHtml(value)}"${String(value) === String(cur) ? " selected" : ""}>${escHtml(text)}</option>`;
    }).join("");
}

function drawTrafficPanel(box) {
  const d = TRAFFIC_DATA;
  if (!d) {
    box.innerHTML = `<section class="plus-card"><h2 class="plus-h2">访问趋势</h2><div class="empty">加载失败，请刷新重试</div></section>`;
    return;
  }
  const s = TRAFFIC_STATE;
  const opts = d.options || { devices: [], sources: [], slugs: [] };
  box.innerHTML = `
    <section class="plus-card tf-card">
      <div class="tf-head">
        <div><h2 class="plus-h2">访问趋势</h2><p class="muted">按设备 / 来源 / 落地页筛选，PV 为文章页阅读上报，UV 按访客哈希去重</p></div>
        <div class="tf-toolbar">
          <select id="tf-days" class="plus-input" aria-label="时间范围">
            ${[7, 30, 90, 365].map((n) => `<option value="${n}"${s.days === n ? " selected" : ""}>近 ${n} 天</option>`).join("")}
          </select>
          <select id="tf-device" class="plus-input" aria-label="设备">${tfOptions(opts.devices, s.device, "全部设备", (v) => DEVICE_LABEL[v] || v)}</select>
          <select id="tf-source" class="plus-input" aria-label="来源">${tfOptions(opts.sources, s.source, "全部来源", (v) => SOURCE_LABEL[v] || v)}</select>
          <select id="tf-slug" class="plus-input" aria-label="落地页">${tfOptions(opts.slugs, s.slug, "全部文章", (v) => (v.title || v.slug || "").slice(0, 28))}</select>
          <button type="button" class="btn btn-sm" id="tf-reset">重置</button>
        </div>
      </div>
      <div id="tf-body"></div>
    </section>`;

  ["tf-days", "tf-device", "tf-source", "tf-slug"].forEach((id) => {
    const sel = box.querySelector("#" + id);
    if (!sel) return;
    sel.onchange = () => {
      const v = sel.value;
      if (id === "tf-days") TRAFFIC_STATE.days = Number(v) || 30;
      else if (id === "tf-device") TRAFFIC_STATE.device = v;
      else if (id === "tf-source") TRAFFIC_STATE.source = v;
      else TRAFFIC_STATE.slug = v;
      refreshTraffic(box, id === "tf-days");
    };
  });
  const reset = box.querySelector("#tf-reset");
  if (reset) reset.onclick = () => {
    Object.assign(TRAFFIC_STATE, { days: 30, device: "", source: "", slug: "" });
    refreshTraffic(box, true);
  };
  drawTrafficBody(box.querySelector("#tf-body"));
}

function tfDist(title, rows, labelFn, onPick) {
  const max = Math.max(1, ...(rows || []).map((x) => Number(x.cnt) || 0));
  const body = rows && rows.length
    ? (rows).map((x) => {
        const pct = Math.round(((Number(x.cnt) || 0) / max) * 100);
        const key = onPick ? ` data-pick="${escHtml(x.slug)}"` : "";
        const label = labelFn(x);
        return `<div class="tf-row"${key} title="${escHtml(label)}：${x.cnt} 次">
          <span class="tf-label">${escHtml(label)}</span>
          <span class="tf-track"><i style="width:${pct}%"></i></span>
          <b>${x.cnt}</b>
        </div>`;
      }).join("")
    : plusEmpty("暂无数据");
  return `<div class="tf-dist"><h3>${title}</h3>${body}</div>`;
}

function drawTrafficBody(body) {
  const d = TRAFFIC_DATA;
  if (!d || !body) return;
  const series = d.series || [];
  const maxPv = Math.max(1, ...series.map((x) => Number(x.pv) || 0));
  const step = d.days <= 14 ? 2 : d.days <= 60 ? 5 : 15;
  const bars = series.map((x, i) => {
    const pv = Number(x.pv) || 0;
    const h = pv > 0 ? Math.max(4, Math.round((pv / maxPv) * 100)) : 0;
    return `<div class="ss-bar${pv ? "" : " is-zero"}" title="${escHtml(x.day)}：${pv} 次浏览 · ${x.uv} 位访客">
      <span class="ss-bar-val">${d.days <= 30 && pv > 0 ? pv : ""}</span>
      <i style="height:${h}%"></i>
      <b>${i % step === 0 || i === series.length - 1 ? escHtml(x.day.slice(5)) : ""}</b>
    </div>`;
  }).join("");

  body.innerHTML = `
    ${d.legacy ? `<p class="plus-note">当前展示的是上线前的按天汇总数据，暂无设备 / 来源 / 落地页维度；新的访问明细会在读者打开文章后逐步积累。</p>` : ""}
    <div class="plus-stats">
      <div class="plus-stat"><b>${d.total || 0}</b><span>浏览量 PV</span></div>
      <div class="plus-stat"><b>${d.unique || 0}</b><span>独立访客 UV</span></div>
      <div class="plus-stat"><b>${d.activeDays || 0}</b><span>有访问天数</span></div>
      <div class="plus-stat"><b>${d.peak || 0}</b><span>单日峰值</span></div>
    </div>
    <h3 class="tf-h3">每日浏览趋势${d.days > 30 ? "（可横向滚动）" : ""}</h3>
    <div class="tf-chart"><div class="ss-chart" style="${d.days > 30 ? `min-width:${d.days * 15}px` : ""}">${bars}</div></div>
    <div class="tf-grid">
      ${tfDist("设备分布", d.devices, (x) => DEVICE_LABEL[x.name] || x.name)}
      ${tfDist("来源分布", d.sources, (x) => SOURCE_LABEL[x.name] || x.name)}
      ${tfDist("落地页 TOP 12", d.landing, (x) => (x.title || x.slug || "").slice(0, 24), true)}
    </div>`;

  body.querySelectorAll("[data-pick]").forEach((row) => {
    row.style.cursor = "pointer";
    row.onclick = () => {
      TRAFFIC_STATE.slug = row.dataset.pick;
      const card = body.closest(".tf-card");
      const box = card && card.parentElement;
      if (box) refreshTraffic(box, true);
    };
  });
}

/* ── 流量中心：访问趋势 / 搜索洞察 / 内容与收录 ─────────────────────── */
const TRAFFIC_TABS = [
  { key: "trend", label: "访问趋势", hash: "#/admin/traffic" },
  { key: "search", label: "搜索洞察", hash: "#/admin/traffic/search" },
  { key: "content", label: "内容与收录", hash: "#/admin/traffic/content" },
];
const SEARCH_STATE = { days: 30 };

function trafficQuery() {
  const q = new URLSearchParams({ days: String(TRAFFIC_STATE.days) });
  if (TRAFFIC_STATE.device) q.set("device", TRAFFIC_STATE.device);
  if (TRAFFIC_STATE.source) q.set("source", TRAFFIC_STATE.source);
  if (TRAFFIC_STATE.slug) q.set("slug", TRAFFIC_STATE.slug);
  return q.toString();
}

function drawSearchBody(d, days) {
  if (!d) return `<div class="empty">搜索数据加载失败，请刷新重试</div>`;
  const daily = d.daily || [];
  const maxDaily = Math.max(1, ...daily.map((x) => Number(x.count) || 0));
  const bars = daily.length
    ? daily.map((x) => {
        const c = Number(x.count) || 0;
        const h = c > 0 ? Math.max(4, Math.round((c / maxDaily) * 100)) : 0;
        return `<div class="ss-bar${c ? "" : " is-zero"}" title="${escHtml(x.day)}：${c} 次">
          <span class="ss-bar-val">${c || ""}</span><i style="height:${h}%"></i>
          <b>${escHtml(String(x.day || "").slice(5))}</b>
        </div>`;
      }).join("")
    : plusEmpty("最近 7 天没有搜索记录");
  const rows = (arr, kind) => (arr && arr.length
    ? `<ol class="plus-rank">${arr.map((x) => `<li>
        <span class="plus-kw">${escHtml(x.keyword)}</span>
        <span class="plus-kw-meta">${x.count} 次 · ${fmtDate(x.last_at)}</span>
        ${kind === "empty" ? `<span class="plus-badge warn">无结果</span>` : ""}
      </li>`).join("")}</ol>`
    : plusEmpty(kind === "empty" ? "没有「搜不到」的词，覆盖情况良好" : "还没有搜索记录"));
  return `
    <div class="tfc-search-toolbar">
      <span class="muted">统计范围</span>
      <select id="tfc-search-days" class="plus-input" aria-label="搜索统计时间范围">
        ${[7, 30, 90].map((n) => `<option value="${n}"${days === n ? " selected" : ""}>近 ${n} 天</option>`).join("")}
      </select>
      <span class="muted">按日曲线固定展示最近 7 天</span>
    </div>
    <div class="plus-stats">
      <div class="plus-stat"><b>${d.total || 0}</b><span>${days} 天搜索次数</span></div>
      <div class="plus-stat"><b>${d.unique || 0}</b><span>独立关键词</span></div>
      <div class="plus-stat ${d.emptyRate >= 30 ? "is-warn" : ""}"><b>${d.emptyRate || 0}%</b><span>零结果占比</span></div>
    </div>
    <section class="plus-card"><h2 class="plus-h2">近 7 日搜索量</h2><div class="ss-chart">${bars}</div></section>
    <div class="plus-grid2">
      <section class="plus-card"><h2 class="plus-h2">热搜关键词</h2>${rows(d.top, "top")}</section>
      <section class="plus-card"><h2 class="plus-h2">搜了但没有结果</h2>
        <p class="plus-note">这些是读者的真实需求缺口，适合作为下一批选题。</p>${rows(d.empty, "empty")}</section>
    </div>`;
}

/** 切换搜索统计范围时只重绘搜索面板，不影响其它两个分段 */
async function refreshSearchPanel(box, days) {
  SEARCH_STATE.days = days;
  let d = null;
  try {
    const r = await api("/admin/search-stats?days=" + days);
    if (r.ok) d = await r.json();
  } catch {}
  if (!box.isConnected) return;
  box.innerHTML = drawSearchBody(d, days);
  const sel = box.querySelector("#tfc-search-days");
  if (sel) sel.onchange = () => refreshSearchPanel(box, Number(sel.value) || 30);
}

function drawContentBody(data) {
  const popular = data.popular || [];
  const referers = data.referers || [];
  const indexnow = data.indexnow || [];
  return `
    <div class="analytic-card"><h2>热门文章 TOP ${popular.length || 10}</h2>${popular.length
      ? `<ol class="rank-list">${popular.map((p) => `<li><a href="#/post/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a><span class="rank-views">${p.views} 阅读</span></li>`).join("")}</ol>`
      : `<div class="empty">暂无数据</div>`}</div>
    <div class="analytic-card"><h2>流量来源（近 30 天，共 ${data.refererTotal || 0} 次外链访问）</h2>${referers.length
      ? `<ol class="rank-list">${referers.slice(0, 20).map((r) => `<li><span>${escHtml(r.domain)}</span><span class="rank-views">${r.cnt}</span></li>`).join("")}</ol>`
      : `<div class="empty">暂无外部来源（多为直接访问或未统计）</div>`}</div>
    <div class="analytic-card"><h2>收录推送（IndexNow，共 ${data.indexnowTotal || 0} 次）</h2>
      <p class="muted">文章发布/更新时自动通知 Bing/Naver/Yandex；下方为最近推送记录。</p>
      ${indexnow.length
        ? `<table class="admin-table"><thead><tr><th>时间</th><th>状态</th><th>URL</th><th>响应</th></tr></thead><tbody>${indexnow.slice(0, 30).map((r) => `<tr><td>${fmtDate(r.created_at)}</td><td><span class="badge ${r.status === 200 ? "badge-public" : "badge-lock"}">${r.status || "网络错误"}</span></td><td>${escHtml(r.url)}</td><td class="muted">${escHtml((r.resp || "").slice(0, 60))}</td></tr>`).join("")}</tbody></table>`
        : `<div class="empty">暂无推送记录</div>`}
    </div>`;
}

/** 三个接口并行拉取；切换分段只改显示，不重复请求 */
async function renderTrafficCenter(tab) {
  const app = adminMain();
  setTitle("流量中心");
  const active = TRAFFIC_TABS.some((x) => x.key === tab) ? tab : "trend";
  app.innerHTML = adminSkeleton();
  const [tRes, sRes, aRes] = await Promise.all([
    api("/admin/traffic?" + trafficQuery()),
    api("/admin/search-stats?days=" + SEARCH_STATE.days),
    api("/analytics"),
  ]);
  TRAFFIC_DATA = tRes.ok ? await tRes.json() : null;
  const searchData = sRes.ok ? await sRes.json() : null;
  const analyticsData = aRes.ok ? await aRes.json() : {};

  const wrap = el(`<div class="dash tf-center"></div>`);
  wrap.innerHTML = `
    <div class="dash-head"><div><h1 class="dash-title">流量中心</h1>
      <p class="dash-sub">访问趋势 · 搜索洞察 · 热门内容 · 收录推送，一个页面看全</p></div></div>
    <div class="tfc-tabs" role="tablist">
      ${TRAFFIC_TABS.map((x) => `<button type="button" class="tfc-tab" data-tab="${x.key}" role="tab" aria-selected="false">${x.label}</button>`).join("")}
    </div>
    <div class="tfc-panel" id="tfc-trend"></div>
    <div class="tfc-panel" id="tfc-search" hidden></div>
    <div class="tfc-panel" id="tfc-content" hidden></div>`;
  app.innerHTML = "";
  app.appendChild(wrap);

  const panels = {
    trend: wrap.querySelector("#tfc-trend"),
    search: wrap.querySelector("#tfc-search"),
    content: wrap.querySelector("#tfc-content"),
  };
  const activate = (key) => {
    wrap.querySelectorAll(".tfc-tab").forEach((b) => {
      const on = b.dataset.tab === key;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    Object.entries(panels).forEach(([k, node]) => { if (node) node.hidden = k !== key; });
    const t = TRAFFIC_TABS.find((x) => x.key === key);
    // replaceState 只改地址、不触发 hashchange，避免切 tab 时整页重载
    if (t && location.hash !== t.hash) {
      try { history.replaceState(null, "", t.hash); } catch { location.hash = t.hash; }
    }
    setTitle("流量中心");
  };
  wrap.querySelectorAll(".tfc-tab").forEach((b) => { b.onclick = () => activate(b.dataset.tab); });

  drawTrafficPanel(panels.trend);
  panels.search.innerHTML = drawSearchBody(searchData, SEARCH_STATE.days);
  const sel = panels.search.querySelector("#tfc-search-days");
  if (sel) sel.onchange = () => refreshSearchPanel(panels.search, Number(sel.value) || 30);
  panels.content.innerHTML = drawContentBody(analyticsData);
  activate(active);
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
  app.innerHTML = adminSkeleton();
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

/* ============================================================================
   v3.1 新增后台页面：搜索分析 / 标签管理 / 定时发布 / 系统状态
   约定：四个页面都不做任何破坏性操作，删除类动作一律二次确认。
   ========================================================================== */

// 统一的「页头 + 内容」外壳，避免每页重复写骨架
function plusShell(title, sub, bodyHtml) {
  const wrap = el(`<div class="dash"></div>`);
  wrap.innerHTML = `<div class="dash-head"><div><h1 class="dash-title">${escHtml(title)}</h1>
    <p class="dash-sub">${escHtml(sub)}</p></div><div class="dash-actions" id="plusActions"></div></div>${bodyHtml}`;
  return wrap;
}

// 空状态 / 加载状态的统一写法
function plusEmpty(text) {
  return `<div class="plus-empty">${escHtml(text)}</div>`;
}

/* ── 标签管理 ───────────────────────────────────────────────────────────── */
let TAG_LIST = [];
let TAG_SELECTED = new Set();

async function renderTagManager() {
  const app = adminMain();
  setTitle("标签管理");
  app.innerHTML = adminSkeleton();

  let list = [];
  try {
    const res = await api("/admin/tags");
    if (res.ok) {
      const j = await res.json();
      list = (j.tags || []).map((x) => ({ tag: x.tag || x.name, count: Number(x.count) || 0 }));
    }
  } catch {}
  TAG_LIST = list;
  TAG_SELECTED = new Set();

  const body = `
    <section class="plus-card">
      <div class="plus-toolbar">
        <input type="search" id="tagFilter" class="plus-input" placeholder="筛选标签…" />
        <input type="text" id="tagTarget" class="plus-input" placeholder="合并/重命名为…" />
        <button type="button" class="btn btn-sm btn-primary" id="tagMergeBtn" disabled>合并选中项</button>
        <span class="plus-note" id="tagCount"></span>
      </div>
      <div id="tagTable"></div>
    </section>`;

  const wrap = plusShell("标签管理", "重命名、合并或删除标签：会同步改写所有相关文章，不是只改显示名", body);
  app.innerHTML = "";
  app.appendChild(wrap);

  const filterEl = document.getElementById("tagFilter");
  const targetEl = document.getElementById("tagTarget");
  const mergeBtn = document.getElementById("tagMergeBtn");
  const countEl = document.getElementById("tagCount");

  const paint = () => {
    const kw = (filterEl.value || "").trim().toLowerCase();
    const shown = TAG_LIST.filter((x) => !kw || String(x.tag).toLowerCase().includes(kw));
    countEl.textContent = `${TAG_LIST.length} 个标签 · 显示 ${shown.length} 个`;
    mergeBtn.disabled = TAG_SELECTED.size < 1 || !(targetEl.value || "").trim();

    const box = document.getElementById("tagTable");
    if (!shown.length) {
      box.innerHTML = plusEmpty("没有匹配的标签");
      return;
    }
    box.innerHTML = `
      <table class="admin-table plus-tags">
        <thead><tr><th style="width:44px"></th><th>标签</th><th style="width:110px">文章数</th><th style="width:220px">操作</th></tr></thead>
        <tbody>${shown
          .map(
            (x) => `<tr>
              <td><input type="checkbox" class="tag-pick" data-tag="${escHtml(x.tag)}" ${TAG_SELECTED.has(x.tag) ? "checked" : ""} /></td>
              <td><span class="plus-tag-pill">${escHtml(x.tag)}</span></td>
              <td>${x.count}</td>
              <td class="plus-row-actions">
                <button type="button" class="btn btn-sm tag-rename" data-tag="${escHtml(x.tag)}">重命名</button>
                <button type="button" class="btn btn-sm tag-del" data-tag="${escHtml(x.tag)}">删除</button>
              </td>
            </tr>`
          )
          .join("")}</tbody>
      </table>`;

    box.querySelectorAll(".tag-pick").forEach((cb) => {
      cb.onchange = () => {
        const name = cb.getAttribute("data-tag");
        if (cb.checked) TAG_SELECTED.add(name);
        else TAG_SELECTED.delete(name);
        mergeBtn.disabled = TAG_SELECTED.size < 1 || !(targetEl.value || "").trim();
        mergeBtn.textContent = TAG_SELECTED.size ? `合并 ${TAG_SELECTED.size} 个到目标` : "合并选中项";
      };
    });

    box.querySelectorAll(".tag-rename").forEach((b) => {
      b.onclick = async () => {
        const from = b.getAttribute("data-tag");
        const to = (prompt(`把「${from}」重命名为：`, from) || "").trim();
        if (!to || to === from) return;
        await runTagAction({ action: "rename", from, to }, `「${from}」→「${to}」`);
      };
    });

    box.querySelectorAll(".tag-del").forEach((b) => {
      b.onclick = async () => {
        const name = b.getAttribute("data-tag");
        if (!confirm(`删除标签「${name}」？\n\n它会从所有文章上移除，文章本身不受影响。此操作不可撤销。`)) return;
        await runTagAction({ action: "delete", name }, `删除「${name}」`);
      };
    });
  };

  const runTagAction = async (payload, label) => {
    const res = await api("/admin/tags", { method: "POST", body: JSON.stringify(payload) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.ok) {
      toast(j.msg || `${label} 完成`);
      renderTagManager();
    } else {
      toast(j.msg || j.error || "操作失败");
    }
  };

  filterEl.oninput = paint;
  targetEl.oninput = paint;
  mergeBtn.onclick = async () => {
    const to = (targetEl.value || "").trim();
    const from = [...TAG_SELECTED].filter((x) => x !== to);
    if (!to || !from.length) return;
    if (!confirm(`把 ${from.length} 个标签合并到「${to}」？\n\n${from.join("、")}\n\n所有相关文章会改用「${to}」。`)) return;
    await runTagAction({ action: "merge", from, to }, `合并到「${to}」`);
  };

  paint();
}

/* ── 定时发布 ───────────────────────────────────────────────────────────── */
function fmtTimeLeft(ts) {
  const diff = Number(ts) - Date.now();
  if (!Number.isFinite(diff)) return "";
  if (diff <= 0) return "已到时间，前台已可见";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)} 天 ${h % 24} 小时后`;
  if (h >= 1) return `${h} 小时 ${m} 分钟后`;
  return `${Math.max(1, m)} 分钟后`;
}

async function renderScheduled() {
  const app = adminMain();
  setTitle("定时发布");
  app.innerHTML = adminSkeleton();

  let posts = [];
  try {
    const res = await api("/posts?summary=1");
    if (res.ok) posts = await res.json();
  } catch {}

  const now = Date.now();
  const pending = (posts || [])
    .filter((p) => p.scheduled_at && Number(p.scheduled_at) > now)
    .sort((a, b) => Number(a.scheduled_at) - Number(b.scheduled_at));

  const body = pending.length
    ? `<section class="plus-card">
        <table class="admin-table">
          <thead><tr><th class="plus-td-left">标题</th><th style="width:150px">预定时间</th><th style="width:150px">倒计时</th><th style="width:290px">操作</th></tr></thead>
          <tbody>${pending
            .map(
              (p) => `<tr>
                <td class="plus-td-left"><a href="#/admin/edit/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a></td>
                <td>${escHtml(fmtDate(Number(p.scheduled_at)))}</td>
                <td class="plus-muted">${escHtml(fmtTimeLeft(p.scheduled_at))}</td>
                <td class="plus-row-actions">
                  <button type="button" class="btn btn-sm btn-primary sched-now" data-id="${p.id}">立即发布</button>
                  <button type="button" class="btn btn-sm sched-edit" data-id="${p.id}" data-at="${p.scheduled_at}">改时间</button>
                  <button type="button" class="btn btn-sm sched-cancel" data-id="${p.id}">取消定时</button>
                </td>
              </tr>`
            )
            .join("")}</tbody>
        </table>
      </section>`
    : `<section class="plus-card">${plusEmpty("当前没有排队中的定时文章。在编辑器里设置「定时发布」后，会出现在这里。")}</section>`;

  const wrap = plusShell(
    "定时发布",
    "到点后前台自动可见（无需等待任何任务）；月历里可直接把文章拖到另一天",
    `<div class="cal-toolbar">
      <div class="cal-nav"><button type="button" class="btn btn-sm" id="calPrev">‹ 上月</button><b id="calTitle"></b><button type="button" class="btn btn-sm" id="calNext">下月 ›</button></div>
      <div class="cal-views"><button type="button" class="cal-tab active" data-view="calendar">月历</button><button type="button" class="cal-tab" data-view="list">列表</button></div>
    </div>
    <section class="plus-card" id="calBox"></section>
    <div id="schedList" style="display:none;margin-top:18px">${body}</div>`
  );
  app.innerHTML = "";
  app.appendChild(wrap);

  const patch = async (id, payload, okMsg) => {
    const res = await api("/posts/" + id, { method: "PUT", body: JSON.stringify(payload) });
    if (res.ok) {
      toast(okMsg);
      renderScheduled();
    } else {
      const j = await res.json().catch(() => ({}));
      toast(j.error || "操作失败");
    }
  };

  // 月历：按本地时区绘制，拖拽文章到另一天即改 scheduled_at（保留原小时分钟）
  let calCursor = new Date();
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
  const calBox = wrap.querySelector("#calBox");
  const byDay = new Map();
  for (const p of pending) {
    const d = new Date(Number(p.scheduled_at));
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(p);
  }
  const paintCal = () => {
    const y = calCursor.getFullYear(), m = calCursor.getMonth();
    wrap.querySelector("#calTitle").textContent = `${y} 年 ${m + 1} 月`;
    const first = new Date(y, m, 1);
    const start = (first.getDay() + 6) % 7; // 周一开头
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < start; i++) cells.push(`<div class="cal-cell out"></div>`);
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const list = byDay.get(key) || [];
      const isToday = new Date().toDateString() === new Date(y, m, d).toDateString();
      cells.push(`<div class="cal-cell ${isToday ? "today" : ""}" data-date="${key}">
        <div class="cal-day">${d}</div>
        ${list.map((p) => `<a class="cal-chip" draggable="true" data-id="${p.id}" href="#/admin/edit/${encodeURIComponent(p.slug)}" title="${escHtml(p.title)}">${escHtml(String(p.title).slice(0, 12))}</a>`).join("")}
      </div>`);
    }
    calBox.innerHTML = `<div class="cal-grid">${["一", "二", "三", "四", "五", "六", "日"].map((w) => `<div class="cal-head">${w}</div>`).join("")}${cells.join("")}</div>`;
    calBox.querySelectorAll(".cal-chip").forEach((chip) => {
      chip.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", chip.dataset.id);
        e.dataTransfer.effectAllowed = "move";
      });
    });
    calBox.querySelectorAll(".cal-cell[data-date]").forEach((cell) => {
      cell.addEventListener("dragover", (e) => { e.preventDefault(); cell.classList.add("dragover"); });
      cell.addEventListener("dragleave", () => cell.classList.remove("dragover"));
      cell.addEventListener("drop", (e) => {
        e.preventDefault();
        cell.classList.remove("dragover");
        const id = Number(e.dataTransfer.getData("text/plain"));
        const p = (posts || []).find((x) => Number(x.id) === id);
        if (!p) return;
        const old = new Date(Number(p.scheduled_at));
        const [yy, mm, dd] = cell.dataset.date.split("-").map(Number);
        const next = new Date(yy, mm - 1, dd, old.getHours(), old.getMinutes(), 0, 0).getTime();
        if (next === Number(p.scheduled_at)) return;
        if (confirm(`把「${p.title}」改到 ${cell.dataset.date} ${String(old.getHours()).padStart(2, "0")}:${String(old.getMinutes()).padStart(2, "0")}？`)) {
          patch(id, { scheduled_at: next }, "排期已更新");
        }
      });
    });
  };
  paintCal();
  wrap.querySelector("#calPrev").onclick = () => { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1); paintCal(); };
  wrap.querySelector("#calNext").onclick = () => { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1); paintCal(); };
  wrap.querySelectorAll(".cal-tab").forEach((tab) => {
    tab.onclick = () => {
      wrap.querySelectorAll(".cal-tab").forEach((t) => t.classList.toggle("active", t === tab));
      const isCal = tab.dataset.view === "calendar";
      calBox.style.display = isCal ? "" : "none";
      wrap.querySelector("#schedList").style.display = isCal ? "none" : "";
    };
  });

  wrap.querySelectorAll(".sched-now").forEach((b) => {
    b.onclick = () => patch(b.dataset.id, { status: "published", scheduled_at: null }, "已立即发布");
  });
  wrap.querySelectorAll(".sched-cancel").forEach((b) => {
    b.onclick = () => {
      if (!confirm("取消定时？文章会退回草稿状态，不会删除内容。")) return;
      patch(b.dataset.id, { status: "draft", scheduled_at: null }, "已取消定时，退回草稿");
    };
  });
  wrap.querySelectorAll(".sched-edit").forEach((b) => {
    b.onclick = () => {
      const cur = new Date(Number(b.dataset.at));
      const local = new Date(cur.getTime() - cur.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const v = prompt("新的发布时间（本地时间，格式 2026-11-20T09:30）", local);
      if (!v) return;
      const ts = new Date(v).getTime();
      if (!Number.isFinite(ts)) { toast("时间格式不正确"); return; }
      patch(b.dataset.id, { scheduled_at: ts }, "时间已更新");
    };
  });
}

/* ── 系统状态 ───────────────────────────────────────────────────────────── */
const TABLE_LABELS = {
  posts: "文章",
  comments: "评论",
  users: "用户",
  sessions: "登录会话",
  audit_log: "审计日志",
  search_log: "搜索记录",
  post_revisions: "文章版本",
  tag_aliases: "标签别名",
  login_attempts: "登录尝试",
  referer_daily: "来源统计",
};

function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + " B";
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + " KB";
  if (v < 1024 * 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + " MB";
  return (v / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

async function renderSystemStatus() {
  const app = adminMain();
  setTitle("系统状态");
  app.innerHTML = adminSkeleton();

  let d = null;
  try {
    const res = await api("/admin/system");
    if (res.ok) d = await res.json();
  } catch {}
  if (!d) {
    app.innerHTML = `<div class="empty">加载失败，请刷新重试</div>`;
    return;
  }

  const tables = Object.entries(d.tables || {});
  const rowHtml = tables
    .map(([k, v]) => {
      const label = TABLE_LABELS[k] || k;
      const val = Number(v) < 0 ? `<span class="plus-badge warn">未创建</span>` : `<b>${v}</b>`;
      return `<tr><td>${escHtml(label)}</td><td class="plus-code">${escHtml(k)}</td><td>${val}</td></tr>`;
    })
    .join("");

  const cfg = d.config || {};
  const cfgRow = (k, v) =>
    `<div class="plus-kv"><span>${escHtml(k)}</span><b>${escHtml(String(v))}</b></div>`;

  const body = `
    <div class="plus-stats">
      <div class="plus-stat"><b>${(d.tables || {}).posts ?? 0}</b><span>文章总数</span></div>
      <div class="plus-stat"><b>${(d.r2 || {}).objects ?? 0}</b><span>R2 文件</span></div>
      <div class="plus-stat"><b>${fmtBytes((d.r2 || {}).bytes)}</b><span>R2 已用容量</span></div>
      <div class="plus-stat"><b>${(d.tables || {}).post_revisions ?? 0}</b><span>版本快照</span></div>
    </div>
    <div class="plus-grid2">
      <section class="plus-card">
        <h2 class="plus-h2">数据表</h2>
        <table class="admin-table"><thead><tr><th>用途</th><th>表名</th><th style="width:100px">行数</th></tr></thead><tbody>${rowHtml}</tbody></table>
        <p class="plus-note">「未创建」表示该功能尚未使用过，首次使用时会自动建表。</p>
      </section>
      <section class="plus-card">
        <h2 class="plus-h2">当前配置</h2>
        ${cfgRow("缓存 TTL", cfg.cache_ttl || "默认")}
        ${cfgRow("维护模式", cfg.maintenance_mode ? "开启" : "关闭")}
        ${cfgRow("评论", cfg.comments_enabled ? "开启" : "关闭")}
        ${cfgRow("会话有效期", cfg.session_ttl || "默认")}
        ${cfgRow("主题预设", cfg.theme || "default")}
        ${cfgRow("RSS 条数", cfg.rss_count || "默认")}
        <h2 class="plus-h2" style="margin-top:22px">存储用量${d.r2 && d.r2.truncated ? "（仅统计前 1000 个对象）" : ""}</h2>
        ${cfgRow("对象数", (d.r2 || {}).objects ?? 0)}
        ${cfgRow("总大小", fmtBytes((d.r2 || {}).bytes))}
      </section>
    </div>`;

  const wrap = plusShell("系统状态", "各功能的数据量、存储用量与关键开关 —— 出问题时先看这一页", body);
  app.innerHTML = "";
  app.appendChild(wrap);

  const refresh = el(`<button type="button" class="btn btn-sm">刷新</button>`);
  refresh.onclick = () => renderSystemStatus();
  const box = wrap.querySelector("#plusActions");
  if (box) box.appendChild(refresh);
}

/* ── 历史版本面板 ─────────────────────────────────────────────────────────
   每次保存正文/标题改动，服务端会把「改动前」的内容存一份快照（最多 30 版）。
   这里提供：列表 → 单版预览 → 一键回滚（回滚前当前内容也会被存为新版本）。
   ──────────────────────────────────────────────────────────────────────── */
async function openRevisionPanel(post, afterRestore) {
  const overlay = el(`<div class="modal-overlay"></div>`);
  const modal = el(`<div class="modal rev-modal"></div>`);
  modal.innerHTML = `
    <div class="modal-head">
      <b>历史版本 · ${escHtml(post.title)}</b>
      <button type="button" class="btn btn-sm" id="revClose">关闭</button>
    </div>
    <div class="modal-body" id="revBody"><div class="empty">加载中…</div></div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  const body = modal.querySelector("#revBody");
  const close = () => overlay.remove();
  modal.querySelector("#revClose").onclick = close;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });

  let list = [];
  try {
    const res = await api(`/posts/${post.id}/revisions`);
    const j = await res.json().catch(() => ({}));
    list = j.revisions || [];
  } catch {}

  const renderList = () => {
    if (!list.length) {
      body.innerHTML = `<div class="plus-empty" style="margin:10px 0">还没有历史版本。<br />
        每次在编辑器里改正文或标题后保存，系统会自动留存改动前的那一版（每篇最多 30 版）。</div>`;
      return;
    }
    body.innerHTML = `
      <p class="plus-note" style="margin:0 0 12px">共 ${list.length} 个版本，越靠上越新。点任意一条查看全文并回滚。</p>
      <div class="rev-list">${list
        .map(
          (r, i) => `<button type="button" class="rev-item" data-rid="${r.id}">
            <span class="rev-time">${escHtml(fmtDate(Number(r.created_at)))}</span>
            <span class="rev-title">${escHtml(r.title || "(无标题)")}</span>
            <span class="rev-meta">${(Number(r.content_length) || 0).toLocaleString()} 字符 · ${escHtml(r.actor || "未知")}${i === 0 ? " · 最近" : ""}</span>
          </button>`
        )
        .join("")}</div>`;
    body.querySelectorAll(".rev-item").forEach((b) => {
      b.onclick = () => showRevision(Number(b.dataset.rid));
    });
  };

  const showRevision = async (rid) => {
    body.innerHTML = `<div class="empty">加载中…</div>`;
    let rev = null;
    try {
      const res = await api(`/posts/${post.id}/revisions/${rid}`);
      if (res.ok) rev = await res.json();
    } catch {}
    if (!rev) {
      body.innerHTML = `<div class="empty">版本加载失败</div>`;
      return;
    }
    body.innerHTML = `
      <div class="rev-preview-head">
        <button type="button" class="btn btn-sm" id="revBack">← 返回列表</button>
        <span class="plus-note">${escHtml(fmtDate(Number(rev.created_at)))} · ${escHtml(rev.actor || "未知")}</span>
        <button type="button" class="btn btn-sm btn-primary" id="revRestore">回滚到此版本</button>
      </div>
      <h3 class="rev-h3">${escHtml(rev.title || "")}</h3>
      <pre class="rev-pre">${escHtml(String(rev.content || "").slice(0, 6000))}${
        String(rev.content || "").length > 6000 ? "\n\n…（仅预览前 6000 字符，回滚会恢复完整内容）" : ""
      }</pre>`;
    body.querySelector("#revBack").onclick = renderList;
    body.querySelector("#revRestore").onclick = async () => {
      if (!confirm(`回滚到 ${fmtDate(Number(rev.created_at))} 的版本？\n\n当前内容会先被存成一个新版本，所以这次回滚本身也能撤销。\n编辑器里尚未保存的改动会丢失。`)) return;
      const res = await api(`/posts/${post.id}/revisions/${rid}/restore`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        toast(j.msg || "已回滚");
        close();
        if (afterRestore) afterRestore();
      } else {
        toast(j.msg || j.error || "回滚失败");
      }
    };
  };

  renderList();
}

/* ── 全站 SEO 体检 ─────────────────────────────────────────────────────── */
async function renderInsights() {
  const app = adminMain();
  setTitle("SEO 体检");
  app.innerHTML = adminSkeleton(6);
  let d = null;
  try {
    const r = await api("/admin/insights");
    if (r.ok) d = await r.json();
    else { const j = await r.json().catch(() => ({})); toast(j.error || "扫描失败"); }
  } catch { toast("扫描请求失败"); }
  if (!d) { app.innerHTML = adminEmpty("shield-alert", "扫描失败", "请稍后重试"); return; }

  const wrap = plusShell("全站 SEO 体检", `已扫描 ${d.total} 篇文章 · ${new Date(d.scannedAt).toLocaleString()}`,
    `<div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-top"><span class="kpi-label">已扫描</span></div><div class="kpi-num">${d.total}</div><div class="kpi-foot">全部未删除文章</div></div>
      <div class="kpi-card"><div class="kpi-top"><span class="kpi-label">待优化</span></div><div class="kpi-num">${d.affected}</div><div class="kpi-foot">至少命中一项问题</div></div>
      <div class="kpi-card"><div class="kpi-top"><span class="kpi-label">严重</span></div><div class="kpi-num">${d.counter.critical || 0}</div><div class="kpi-foot">重复标题 / 缺 slug</div></div>
      <div class="kpi-card"><div class="kpi-top"><span class="kpi-label">警告</span></div><div class="kpi-num">${d.counter.warning || 0}</div><div class="kpi-foot">摘要 / 封面 / 字数</div></div>
    </div>
    <div id="insightList" style="margin-top:18px"></div>`);
  app.innerHTML = "";
  app.appendChild(wrap);
  const list = wrap.querySelector("#insightList");

  if (!d.issues || !d.issues.length) {
    list.innerHTML = adminEmpty("square-check", "全部通过", "没有发现需要优化的项，保持得很好。",
      `<div style="margin-top:16px"><a class="btn btn-primary" href="#/admin/posts">查看文章</a></div>`);
  } else {
    list.innerHTML = d.issues.map((it) => `
      <section class="insight-card">
        <div class="insight-head">
          <div><div class="insight-title">${escHtml(it.title || "未命名")}</div>
            <div class="insight-slug">/${escHtml(it.slug || "")} · ${escHtml(it.status || "")}</div></div>
          <a class="btn btn-sm" href="#/admin/edit/${encodeURIComponent(it.slug || "")}">去编辑 →</a>
        </div>
        <div class="insight-items">${it.items.map((x) => `
          <span class="issue-chip ${escHtml(x.level)}">${escHtml(x.label)}</span>`).join("")}</div>
      </section>`).join("");
  }
  try { window.lucide && window.lucide.createIcons({ root: wrap }); } catch {}
}

/* ── AI 批量补全元数据（只出建议，人工确认后写入） ───────────────────── */
async function renderEnrich() {
  const app = adminMain();
  setTitle("AI 补全");
  app.innerHTML = adminSkeleton(5);
  let posts = [];
  try {
    const r = await api("/posts?summary=1");
    if (r.ok) { const d = await r.json(); posts = Array.isArray(d) ? d : (d.posts || []); }
  } catch {}
  const candidates = posts.filter((p) => !String(p.excerpt || "").trim() || !(p.tags || []).length || (Array.isArray(p.tags) && !p.tags.length));
  const pool = candidates.length ? candidates : posts;

  const wrap = plusShell("AI 批量补全元数据", "为缺少摘要或标签的文章生成建议 —— 生成后逐条确认，点「应用选中」才会写入数据库",
    `<section class="plus-card">
      <div class="enrich-toolbar">
        <div><b>${pool.length}</b> 篇候选${candidates.length ? "（缺摘要/标签）" : "（全部文章均已完整，可重新生成）"}</div>
        <div class="enrich-actions">
          <button type="button" class="btn btn-sm" id="enrichAll">全选</button>
          <button type="button" class="btn btn-sm" id="enrichNone">全不选</button>
          <button type="button" class="btn btn-primary" id="enrichGen"><i data-lucide="wand-sparkles"></i> 生成建议</button>
        </div>
      </div>
      <div class="enrich-list" id="enrichList">${pool.slice(0, 60).map((p) => `
        <label class="enrich-row"><input type="checkbox" class="enrich-sel" value="${p.id}" />
          <span class="enrich-name">${escHtml(p.title || p.slug)}</span>
          <span class="enrich-flag">${!String(p.excerpt || "").trim() ? "缺摘要" : ""}${!(p.tags || []).length ? " 缺标签" : ""}</span>
        </label>`).join("")}</div>
      <div class="muted" style="margin-top:10px">单次最多处理 20 篇。生成结果只展示，不会自动覆盖现有内容。</div>
    </section>
    <div id="enrichResult" style="margin-top:18px"></div>`);
  app.innerHTML = "";
  app.appendChild(wrap);
  try { window.lucide && window.lucide.createIcons({ root: wrap }); } catch {}

  const sels = () => [...wrap.querySelectorAll(".enrich-sel:checked")].map((x) => Number(x.value));
  wrap.querySelector("#enrichAll").onclick = () => wrap.querySelectorAll(".enrich-sel").forEach((x, i) => { x.checked = i < 20; });
  wrap.querySelector("#enrichNone").onclick = () => wrap.querySelectorAll(".enrich-sel").forEach((x) => { x.checked = false; });
  const result = wrap.querySelector("#enrichResult");

  wrap.querySelector("#enrichGen").onclick = async () => {
    const ids = sels();
    if (!ids.length) { toast("请先勾选文章"); return; }
    const btn = wrap.querySelector("#enrichGen");
    btn.disabled = true; btn.textContent = "生成中…";
    result.innerHTML = adminSkeleton(3);
    try {
      const r = await api("/admin/enrich", { method: "POST", body: JSON.stringify({ ids }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || "生成失败"); result.innerHTML = ""; return; }
      if (!j.suggestions || !j.suggestions.length) {
        const why = (j.failures && j.failures[0]) || "AI 未返回有效结果";
        result.innerHTML = adminEmpty("bot", "没有生成建议", `${why} —— 请到「设置 → AI 模型」检查服务商与密钥配置。`);
        return;
      }
      result.innerHTML = `
        <section class="plus-card">
          <div class="enrich-toolbar"><div><b>${j.suggestions.length}</b> 条建议待确认</div>
            <button type="button" class="btn btn-primary" id="enrichApply"><i data-lucide="check"></i> 应用选中</button></div>
          ${j.suggestions.map((s, i) => `
            <div class="suggest-card">
              <label class="suggest-head"><input type="checkbox" class="sug-sel" data-i="${i}" checked />
                <b>${escHtml(s.title)}</b></label>
              <div class="suggest-field"><span>新摘要</span><textarea class="sug-excerpt" data-i="${i}" rows="2">${escHtml(s.excerpt || "")}</textarea></div>
              <div class="suggest-field"><span>新标签</span><input class="sug-tags" data-i="${i}" value="${escHtml((s.tags || []).join(", "))}" /></div>
            </div>`).join("")}
        </section>`;
      try { window.lucide && window.lucide.createIcons({ root: result }); } catch {}
      result.querySelector("#enrichApply").onclick = async () => {
        const items = [...result.querySelectorAll(".sug-sel:checked")].map((cb) => {
          const i = Number(cb.dataset.i);
          const tags = (result.querySelector(`.sug-tags[data-i="${i}"]`).value || "").split(/[,，]/).map((x) => x.trim()).filter(Boolean);
          return { id: j.suggestions[i].id, excerpt: result.querySelector(`.sug-excerpt[data-i="${i}"]`).value, tags };
        });
        if (!items.length) { toast("请先勾选要应用的建议"); return; }
        if (!confirm(`确认把 ${items.length} 篇的摘要与标签更新为上方内容？此操作会覆盖原值。`)) return;
        const res = await api("/admin/enrich/apply", { method: "POST", body: JSON.stringify({ items }) });
        const rr = await res.json().catch(() => ({}));
        if (res.ok) { toast(`已更新 ${rr.count} 篇`); renderEnrich(); }
        else toast(rr.error || "应用失败");
      };
    } catch { toast("生成请求失败"); result.innerHTML = ""; }
    finally { btn.disabled = false; btn.textContent = "生成建议"; }
  };
}

/* ── 发布前全量预检 ───────────────────────────────────────────────────── */
async function renderPreflight() {
  const app = adminMain();
  setTitle("发布预检");
  app.innerHTML = adminSkeleton(4);
  let posts = [];
  try {
    const r = await api("/posts?summary=1");
    if (r.ok) { const d = await r.json(); posts = Array.isArray(d) ? d : (d.posts || []); }
  } catch {}
  const wrap = plusShell("发布前全量预检", "一次检查标题、摘要、封面、正文字数、图片 alt、站内死链与敏感词",
    `<section class="plus-card">
      <div class="enrich-toolbar">
        <select id="pfPost" class="pf-select"><option value="">选择一篇文章…</option>
          ${posts.map((p) => `<option value="${p.id}">${escHtml(p.title || p.slug)}</option>`).join("")}
        </select>
        <button type="button" class="btn btn-primary" id="pfRun"><i data-lucide="shield-check"></i> 开始预检</button>
      </div>
    </section>
    <div id="pfResult" style="margin-top:18px"></div>`);
  app.innerHTML = "";
  app.appendChild(wrap);
  try { window.lucide && window.lucide.createIcons({ root: wrap }); } catch {}
  const result = wrap.querySelector("#pfResult");
  wrap.querySelector("#pfRun").onclick = async () => {
    const id = Number(wrap.querySelector("#pfPost").value);
    if (!id) { toast("请先选择文章"); return; }
    const btn = wrap.querySelector("#pfRun");
    btn.disabled = true; btn.textContent = "检查中…";
    result.innerHTML = adminSkeleton(4);
    try {
      const r = await api("/admin/preflight", { method: "POST", body: JSON.stringify({ id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || "预检失败"); result.innerHTML = ""; return; }
      const good = j.checks.filter((c) => c.ok).length;
      result.innerHTML = `
        <section class="plus-card">
          <div class="pf-score ${j.ok ? "pass" : "fail"}">
            <div class="pf-score-num">${j.score}<small>分</small></div>
            <div><div class="pf-score-title">${escHtml(j.title || "")}</div>
              <div class="muted">${good}/${j.checks.length} 项通过 · ${j.ok ? "可以发布" : "建议先修复未通过项"}</div></div>
          </div>
          <div class="pf-checks">${j.checks.map((c) => `
            <div class="pf-check ${c.ok ? "ok" : "bad"}">
              <span class="pf-mark">${c.ok ? "✓" : "!"}</span>
              <span class="pf-label">${escHtml(c.label)}</span>
              <span class="pf-detail">${escHtml(c.detail || "")}</span>
            </div>`).join("")}</div>
          <div style="margin-top:14px"><a class="btn btn-sm" href="#/admin/edit/${encodeURIComponent(j.slug || "")}">前往编辑 →</a></div>
        </section>`;
    } catch { toast("预检请求失败"); result.innerHTML = ""; }
    finally { btn.disabled = false; btn.textContent = "开始预检"; }
  };
}

/* ── 缓存 / 向量运维面板 ───────────────────────────────────────────────── */
async function renderOps() {
  const app = adminMain();
  setTitle("运维面板");
  app.innerHTML = adminSkeleton(5);
  let d = null;
  try {
    const r = await api("/admin/ops");
    if (r.ok) d = await r.json();
    else { const j = await r.json().catch(() => ({})); toast(j.error || "加载失败"); }
  } catch {}
  if (!d) { app.innerHTML = adminEmpty("activity", "加载失败", "请稍后重试"); return; }
  const hitRate = d.cache.hits + d.cache.misses ? Math.round((d.cache.hits / (d.cache.hits + d.cache.misses)) * 100) : 0;
  const vTotal = d.vectorRuntime.queries || 0;
  const vRate = vTotal ? Math.round((d.vectorRuntime.hits / vTotal) * 100) : 0;
  const keys = Object.entries(d.cache.byKey || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const wrap = plusShell("运维面板", "边缘缓存与向量索引的实时状态 · 数据为当前 Worker 实例（非全站聚合）",
    `<div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-top"><span class="kpi-label">缓存命中率</span><span class="kpi-ico"><i data-lucide="zap"></i></span></div><div class="kpi-num">${hitRate}%</div><div class="kpi-foot">${d.cache.hits} 命中 / ${d.cache.misses} 未命中</div></div>
      <div class="kpi-card"><div class="kpi-top"><span class="kpi-label">向量索引</span><span class="kpi-ico"><i data-lucide="box"></i></span></div><div class="kpi-num">${d.vector.count}</div><div class="kpi-foot">${d.vector.available ? `${d.vector.dimensions} 维 · ${escHtml(d.vector.metric || "")}` : "未配置索引"}</div></div>
      <div class="kpi-card"><div class="kpi-top"><span class="kpi-label">向量覆盖率</span><span class="kpi-ico"><i data-lucide="database"></i></span></div><div class="kpi-num">${d.coverage.percent}%</div><div class="kpi-foot">${d.coverage.embedded}/${d.coverage.total} 篇已生成</div></div>
      <div class="kpi-card"><div class="kpi-top"><span class="kpi-label">语义检索命中</span><span class="kpi-ico"><i data-lucide="scan-search"></i></span></div><div class="kpi-num">${vRate}%</div><div class="kpi-foot">${d.vectorRuntime.hits}/${vTotal} 次 · 回退 ${d.vectorRuntime.fallbacks}</div></div>
    </div>
    <section class="plus-card" style="margin-top:18px">
      <div class="enrich-toolbar"><div><b>缓存管理</b> <span class="muted">已主动清除 ${d.cache.purges} 次</span></div>
        <div class="enrich-actions">
          <input type="text" id="opsKey" class="ops-key" placeholder="/feed.xml（留空=全部）" />
          <button type="button" class="btn btn-sm" id="opsPurgeKey">清除指定</button>
          <button type="button" class="btn btn-sm btn-primary" id="opsPurgeAll"><i data-lucide="trash-2"></i> 清除全部</button>
          <button type="button" class="btn btn-sm" id="opsBackfill">回填向量</button>
        </div>
      </div>
      <div class="ops-keys">${keys.length ? keys.map(([k, n]) => `<div><code>${escHtml(k)}</code><b>${n}</b></div>`).join("") : `<div class="muted">暂无缓存访问记录</div>`}</div>
    </section>`);
  app.innerHTML = "";
  app.appendChild(wrap);
  try { window.lucide && window.lucide.createIcons({ root: wrap }); } catch {}

  const purge = async (key) => {
    if (!confirm(key ? `清除缓存 ${key}？` : "清除全部动态缓存（feed / sitemap / 爬虫页面）？")) return;
    const r = await api("/admin/ops/purge", { method: "POST", body: JSON.stringify({ key }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { toast("缓存已清除"); renderOps(); }
    else toast(j.error || "清除失败");
  };
  wrap.querySelector("#opsPurgeAll").onclick = () => purge("");
  wrap.querySelector("#opsPurgeKey").onclick = () => {
    const k = (wrap.querySelector("#opsKey").value || "").trim();
    if (!k) { toast("请输入要清除的路径"); return; }
    purge(k);
  };
  wrap.querySelector("#opsBackfill").onclick = async () => {
    if (!confirm("为所有文章补建向量索引？已存在的会被覆盖，耗时可能较长。")) return;
    const r = await api("/ai/vector-backfill", { method: "POST", body: "{}" });
    const j = await r.json().catch(() => ({}));
    toast(r.ok ? `已处理 ${j.count ?? j.updated ?? 0} 篇` : (j.error || "回填失败"));
    renderOps();
  };
}

/* ── 两步验证设置 ─────────────────────────────────────────────────────── */
async function render2FA() {
  const app = adminMain();
  setTitle("两步验证");
  app.innerHTML = adminSkeleton(3);
  let st = { enabled: false, backups: 0 };
  try {
    const r = await api("/auth/2fa");
    if (r.ok) st = await r.json();
  } catch {}
  const wrap = plusShell("两步验证", "密码之外再加一层动态码；GitHub OAuth 登录本身视为第二因子，不强制 TOTP", `<div id="twoFaBody"></div>`);
  app.innerHTML = "";
  app.appendChild(wrap);
  const body = wrap.querySelector("#twoFaBody");
  const paint = (extra = "") => {
    body.innerHTML = `
      <section class="plus-card">
        <div class="twofa-state ${st.enabled ? "on" : "off"}">
          <span class="twofa-dot"></span>
          <div><b>${st.enabled ? "已启用" : "未启用"}</b><div class="muted">${st.enabled ? `剩余备用码 ${st.backups} 个` : "启用后，密码登录需额外输入验证器动态码"}</div></div>
        </div>
        ${st.enabled ? `
          <div class="twofa-field"><label>关闭验证</label><input type="password" id="twoFaPw" placeholder="当前密码" />
            <input type="text" id="twoFaCode" placeholder="动态码或备用码" /></div>
          <div style="margin-top:12px"><button type="button" class="btn" id="twoFaDisable">关闭两步验证</button></div>
        ` : `<div style="margin-top:12px"><button type="button" class="btn btn-primary" id="twoFaStart"><i data-lucide="key-round"></i> 开始设置</button></div>`}
      </section>${extra}`;
    try { window.lucide && window.lucide.createIcons({ root: body }); } catch {}
    const start = body.querySelector("#twoFaStart");
    if (start) start.onclick = async () => {
      const r = await api("/auth/2fa/setup", { method: "POST", body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || "生成密钥失败"); return; }
      const extra = `
        <section class="plus-card twofa-setup" style="margin-top:16px">
          <b>1. 用验证器 App 添加密钥</b>
          <div class="twofa-secret">${escHtml(j.secret)}</div>
          <div class="muted">在 Google Authenticator / 1Password / Microsoft Authenticator 中手动输入上面的密钥（SHA1 / 6 位 / 30 秒）。</div>
          <div class="twofa-uri">${escHtml(j.uri)} <button type="button" class="btn btn-sm" id="twoFaCopy">复制链接</button></div>
          <b style="display:block;margin-top:18px">2. 保存备用码（仅显示这一次）</b>
          <div class="twofa-codes">${(j.backupCodes || []).map((c) => `<code>${escHtml(c)}</code>`).join("")}</div>
          <b style="display:block;margin-top:18px">3. 输入动态码确认启用</b>
          <div class="twofa-field"><input type="text" id="twoFaEnableCode" placeholder="6 位动态码" maxlength="6" />
            <button type="button" class="btn btn-primary" id="twoFaEnable">确认启用</button></div>
        </section>`;
      paint(extra);
      body.querySelector("#twoFaCopy").onclick = () => {
        try { navigator.clipboard.writeText(j.uri); toast("链接已复制"); } catch { toast("复制失败，请手动选择"); }
      };
      body.querySelector("#twoFaEnable").onclick = async () => {
        const code = (body.querySelector("#twoFaEnableCode").value || "").trim();
        if (!/^\d{6}$/.test(code)) { toast("请输入 6 位动态码"); return; }
        const rr = await api("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code, backupCodes: j.backupCodes }) });
        const jj = await rr.json().catch(() => ({}));
        if (rr.ok) { toast("两步验证已启用"); st = { enabled: true, backups: jj.backups }; paint(); }
        else toast(jj.error || "启用失败");
      };
    };
    const disable = body.querySelector("#twoFaDisable");
    if (disable) disable.onclick = async () => {
      const password = (body.querySelector("#twoFaPw").value || "").trim();
      const code = (body.querySelector("#twoFaCode").value || "").trim();
      if (!password || !code) { toast("请填写密码和动态码"); return; }
      if (!confirm("关闭后，密码登录将不再要求动态码。确定吗？")) return;
      const r = await api("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ password, code }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { toast("已关闭两步验证"); st = { enabled: false, backups: 0 }; paint(); }
      else toast(j.error || "关闭失败");
    };
  };
  paint();
}
