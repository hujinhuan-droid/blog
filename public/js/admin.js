// 管理后台（依赖 app.js 中的全局：CURRENT_USER / api / toast / el / fmtDate / renderMarkdown / renderNav）

function renderAdmin() {
  const hash = location.hash;
  if (!CURRENT_USER || CURRENT_USER.role !== "admin") {
    renderLogin();
    return;
  }
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
  };
  document.getElementById("pwLogin").onclick = doLogin;
  app.querySelectorAll("#uname, #pw").forEach((inp) =>
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doLogin();
    })
  );
}

async function renderDashboard() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="empty">加载中…</div>`;
  const res = await api("/posts");
  const posts = await res.json();
  const wrap = el(`<div></div>`);
  const toolbar = el(`<div class="admin-toolbar"></div>`);
  toolbar.appendChild(el(`<h2 style="margin:0">文章管理（${posts.length}）</h2>`));
  const newBtn = el(`<a class="btn btn-primary" href="#/admin/new">+ 新建文章</a>`);
  toolbar.appendChild(newBtn);
  toolbar.appendChild(el(`<a class="btn" href="#/admin/settings">⚙ 设置</a>`));
  wrap.appendChild(toolbar);

  if (!posts.length) {
    wrap.appendChild(el(`<div class="empty">还没有文章。</div>`));
    app.innerHTML = "";
    app.appendChild(wrap);
    return;
  }

  const table = el(`<table class="admin-table"></table>`);
  table.innerHTML = `<thead><tr><th>标题</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>`;
  const tbody = el(`<tbody></tbody>`);
  for (const p of posts) {
    const tr = el(`<tr></tr>`);
    tr.innerHTML = `
      <td>${p.title}</td>
      <td>${p.visibility === "private" ? "私密" : "公开"}</td>
      <td>${fmtDate(p.updated_at)}</td>
      <td>
        <a class="btn btn-sm" href="#/post/${p.slug}">查看</a>
        <a class="btn btn-sm" href="#/admin/edit/${encodeURIComponent(p.slug)}">编辑</a>
        <button class="btn btn-sm btn-danger" data-id="${p.id}">删除</button>
      </td>`;
    tr.querySelector(".btn-danger").onclick = async (e) => {
      if (!confirm(`确定删除《${p.title}》？`)) return;
      const r = await api("/posts/" + p.id, { method: "DELETE" });
      if (r.ok) {
        toast("已删除");
        renderDashboard();
      } else toast("删除失败");
    };
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  app.innerHTML = "";
  app.appendChild(wrap);
}

async function renderEditor(slug) {
  const app = document.getElementById("app");
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

  // 读取设置：决定是否显示 AI 按钮、使用哪个模型
  let aiEnabled = true;
  let aiModel = "gemini-flash-latest";
  try {
    const ss = await (await api("/settings")).json();
    if (ss && typeof ss === "object") {
      aiEnabled = ss.ai_enabled !== "0";
      if (ss.ai_model) aiModel = ss.ai_model;
    }
  } catch {}

  const form = el(`<div class="form"></div>`);
  form.innerHTML = `
    <h2>${slug ? "编辑文章" : "新建文章"}</h2>
    <label>标题</label>
    <input type="text" id="f-title" value="${post ? post.title.replace(/"/g, "&quot;") : ""}" />
    <label>可见性</label>
    <select id="f-visibility">
      <option value="public" ${post && post.visibility === "public" ? "selected" : ""}>公开</option>
      <option value="private" ${post && post.visibility === "private" ? "selected" : ""}>仅自己可见</option>
    </select>
    <label>封面图 URL（可选）</label>
    <input type="text" id="f-cover" value="${post && post.cover ? post.cover.replace(/"/g, "&quot;") : ""}" />
    <label>正文（Markdown，支持实时预览）</label>
    <div class="editor-grid">
      <textarea id="f-content" placeholder="在此用 Markdown 写作…">${post ? post.content : ""}</textarea>
      <div class="editor-preview"><h3>预览</h3><div id="preview"></div></div>
    </div>
    <div id="ai-block">
      <label>GEMINI AI 辅助</label>
      <div style="display:flex; gap:10px; margin-bottom:10px;">
        <button class="btn" id="ai-optimize">✨ AI 优化正文</button>
        <button class="btn" id="ai-annotate">📝 AI 生成备注</button>
      </div>
    </div>
    <div id="ai-result" class="ai-result" style="display:none;"></div>
    <label>AI 备注（保存文章时一并存入）</label>
    <textarea id="f-ai-notes" placeholder="点击「AI 生成备注」自动生成，或手动填写">${post && post.ai_notes ? post.ai_notes : ""}</textarea>
    <label>插入图片（上传到 R2）</label>
    <input type="file" id="f-image" accept="image/*" />
    <div style="margin-top:18px; display:flex; gap:10px;">
      <button class="btn btn-primary" id="save">保存</button>
      <a class="btn" href="#/admin">取消</a>
    </div>`;
  app.innerHTML = "";
  app.appendChild(form);

  // 设置中关闭了 AI 助手则隐藏编辑器里的 AI 区块
  if (!aiEnabled) {
    const blk = document.getElementById("ai-block");
    if (blk) blk.style.display = "none";
  }

  const content = document.getElementById("f-content");
  const preview = document.getElementById("preview");
  const updatePreview = () => (preview.innerHTML = renderMarkdown(content.value));
  content.addEventListener("input", updatePreview);
  updatePreview();

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

  document.getElementById("save").onclick = async () => {
    const payload = {
      title: document.getElementById("f-title").value.trim(),
      content: content.value,
      visibility: document.getElementById("f-visibility").value,
      cover: document.getElementById("f-cover").value.trim() || undefined,
      ai_notes: aiNotes.value.trim() || undefined,
    };
    if (!payload.title) return toast("标题不能为空");
    const opt = { method: post ? "PUT" : "POST", body: JSON.stringify(payload) };
    const res = post ? await api("/posts/" + post.id, opt) : await api("/posts", opt);
    if (res.ok) {
      toast("已保存");
      location.hash = "#/admin";
    } else {
      const r = await res.json().catch(() => ({}));
      toast(r.error || "保存失败");
    }
  };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------- 站点设置 ----------------

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const DEFAULT_MENUS = [
  { label: "文章", hash: "#/" },
  { label: "时间轴", hash: "#/timeline" },
  { label: "动态", hash: "#/feed" },
  { label: "标签", hash: "#/tags" },
  { label: "朋友们", hash: "#/friends" },
  { label: "关于", hash: "#/about" },
];

function navToText(jsonStr) {
  let arr = DEFAULT_MENUS;
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
  return arr.length ? arr : DEFAULT_MENUS;
}

function colorVal(hex) {
  if (!hex) return "#2563eb";
  return hex.startsWith("#") ? hex : "#" + hex;
}

async function renderSettings() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="empty">加载中…</div>`;
  let s = {};
  try {
    s = await (await api("/settings")).json();
  } catch {}

  const form = el(`<div class="form settings-form"></div>`);
  form.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <h2 style="margin:0">站点设置</h2>
      <a class="btn" href="#/admin">← 返回文章管理</a>
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
      <label>主色调</label>
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
      <label>默认模型</label>
      <input type="text" id="s-ai_model" value="${escHtml(s.ai_model || "gemini-flash-latest")}" placeholder="gemini-flash-latest" />
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer">
        <input type="checkbox" id="s-ai_enabled" ${s.ai_enabled !== "0" ? "checked" : ""} /> 在编辑器中显示 AI 按钮
      </label>
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

    <div style="margin-top:18px;display:flex;gap:10px;align-items:center">
      <button class="btn btn-primary" id="save-settings">保存设置</button>
      <span id="settings-msg" class="muted"></span>
    </div>`;
  app.innerHTML = "";
  app.appendChild(form);

  const colorInput = document.getElementById("s-theme_primary");
  colorInput.oninput = () => {
    document.getElementById("s-theme_primary_txt").textContent = colorInput.value;
  };

  document.getElementById("save-settings").onclick = async () => {
    const payload = {
      site_title: document.getElementById("s-site_title").value.trim(),
      site_subtitle: document.getElementById("s-site_subtitle").value.trim(),
      footer_text: document.getElementById("s-footer_text").value.trim(),
      nav: JSON.stringify(textToNav(document.getElementById("s-nav").value)),
      theme_primary: document.getElementById("s-theme_primary").value,
      theme_dark: document.getElementById("s-theme_dark").checked ? "1" : "0",
      ai_model: document.getElementById("s-ai_model").value.trim() || "gemini-flash-latest",
      ai_enabled: document.getElementById("s-ai_enabled").checked ? "1" : "0",
      about_content: document.getElementById("s-about_content").value,
      posts_per_page: document.getElementById("s-posts_per_page").value.trim() || "10",
      comments_enabled: document.getElementById("s-comments_enabled").checked ? "1" : "0",
      seo_title: document.getElementById("s-seo_title").value.trim(),
      seo_description: document.getElementById("s-seo_description").value.trim(),
      seo_keywords: document.getElementById("s-seo_keywords").value.trim(),
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
}
