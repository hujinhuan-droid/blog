// 管理后台（依赖 app.js 中的全局：CURRENT_USER / api / toast / el / fmtDate / renderMarkdown / renderNav）

// 看板下钻用的缓存：文章列表 & 有评论的文章 slug 集合
let DASH_POSTS = [];
let DASH_COMMENTED = null; // null=未加载；Set=已加载的 slug 集合


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
  const app = document.getElementById("app");
  app.innerHTML = `<div class="empty">加载中…</div>`;
  const res = await api("/posts");
  const posts = await res.json();
  DASH_POSTS = Array.isArray(posts) ? posts : [];
  const wrap = el(`<div></div>`);
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
      <div class="stat-chart"><div class="stat-chart-title">近 7 天发布</div><div class="bars">${bars}</div></div>`;
    wrap.appendChild(panel);
    // 统计卡片点击下钻到文章标题列表（走正式路由，保证返回/导航按钮可用）
    panel.querySelectorAll(".stat-card.clickable").forEach((card) => {
      card.onclick = () => {
        location.hash = "#/admin/drill/" + card.getAttribute("data-drill");
      };
    });
  }
  const toolbar = el(`<div class="admin-toolbar"></div>`);
  toolbar.appendChild(el(`<h2 style="margin:0">文章管理（${posts.length}）</h2>`));
  const newBtn = el(`<a class="btn btn-primary" href="#/admin/new">+ 新建文章</a>`);
  toolbar.appendChild(newBtn);
  const reindexBtn = el(`<button class="btn" id="reindex">🧠 重建搜索索引</button>`);
  toolbar.appendChild(reindexBtn);
  const batchBtn = el(`<button class="btn" id="batch-notes" disabled>🤖 批量 AI 备注</button>`);
  toolbar.appendChild(batchBtn);
  const batchTagsBtn = el(`<button class="btn" id="batch-tags" disabled>🏷 批量 AI 分类</button>`);
  toolbar.appendChild(batchTagsBtn);
  toolbar.appendChild(el(`<a class="btn" href="#/admin/settings">⚙ 设置</a>`));
  wrap.appendChild(toolbar);

  if (!posts.length) {
    wrap.appendChild(el(`<div class="empty">还没有文章。</div>`));
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
      <td>${p.title}</td>
      <td>${p.visibility === "private" ? "私密" : "公开"}</td>
      <td>${fmtDate(p.updated_at)}</td>
      <td>
        <a class="btn btn-sm" href="#/post/${encodeURIComponent(p.slug)}">查看</a>
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

  // 批量 AI 备注：勾选单篇 / 多篇小说，服务端依次生成备注并写库
  const selAll = document.getElementById("sel-all");
  const updateBatchBtn = () => {
    const n = app.querySelectorAll(".row-sel:checked").length;
    batchBtn.disabled = n === 0;
    batchBtn.textContent = n ? `🤖 批量 AI 备注(${n})` : "🤖 批量 AI 备注";
    batchTagsBtn.disabled = n === 0;
    batchTagsBtn.textContent = n ? `🏷 批量 AI 分类(${n})` : "🏷 批量 AI 分类";
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
      renderDashboard();
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
      renderDashboard();
    } catch (e) {
      toast("请求异常");
    } finally {
      batchTagsBtn.disabled = false;
      batchTagsBtn.textContent = old;
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

// 看板统计卡片下钻：按类型过滤文章，列出标题，点标题进入编辑
async function openDrill(type) {
  const app = document.getElementById("app");
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
    <label>封面图 URL（可选，可点「🎨 AI 配图」自动生成）</label>
    <input type="text" id="f-cover" value="${post && post.cover ? post.cover.replace(/"/g, "&quot;") : ""}" />
    <label>AI 配图提示词（可选，留空则根据标题+标签自动生成）</label>
    <input type="text" id="f-cover-prompt" placeholder="如：水墨风格的晨练插画" />
    <label>摘要（列表页展示，可点「📋 AI 摘要」自动生成；留空则自动截取正文前 120 字）</label>
    <textarea id="f-excerpt" style="min-height:70px" placeholder="留空则自动截取正文前 120 字">${post && post.excerpt ? post.excerpt : ""}</textarea>
    <label>标签（逗号分隔，用于文章分类；可点「🏷 AI 分类」自动生成）</label>
    <input type="text" id="f-tags" value="${escHtml(initialTags)}" placeholder="如：睡眠, 饮食, 运动" />
    <label>正文（Markdown，支持工具栏、代码高亮、表情、拖拽图片）</label>
    <div class="editor-toolbar" id="editor-toolbar">
      <button type="button" class="fmt-btn" data-act="bold" title="加粗"><b>B</b></button>
      <button type="button" class="fmt-btn" data-act="italic" title="斜体"><i>I</i></button>
      <button type="button" class="fmt-btn" data-act="h" title="标题">H</button>
      <button type="button" class="fmt-btn" data-act="quote" title="引用">❝</button>
      <button type="button" class="fmt-btn" data-act="ul" title="无序列表">•</button>
      <button type="button" class="fmt-btn" data-act="ol" title="有序列表">1.</button>
      <button type="button" class="fmt-btn" data-act="link" title="链接">🔗</button>
      <button type="button" class="fmt-btn" data-act="code" title="行内代码">&lt;/&gt;</button>
      <button type="button" class="fmt-btn" data-act="codeblock" title="代码块">▦</button>
      <button type="button" class="fmt-btn" data-act="hr" title="分割线">―</button>
      <span class="toolbar-sep"></span>
      <button type="button" class="fmt-btn" data-act="emoji" title="插入表情">😊</button>
      <button type="button" class="fmt-btn" data-act="image" title="上传并插入图片">🖼</button>
    </div>
    <div class="editor-grid" id="editor-grid">
      <textarea id="f-content" placeholder="在此用 Markdown 写作…（可直接把图片拖进来）">${post ? post.content : ""}</textarea>
      <div class="editor-preview"><h3>预览</h3><div id="preview"></div></div>
    </div>
    <input type="file" id="f-toolbar-image" accept="image/*" style="display:none" />
    <div class="emoji-picker" id="emoji-picker" style="display:none"></div>
    <div id="ai-block">
      <label>GEMINI AI 辅助</label>
      <div style="display:flex; gap:10px; margin-bottom:10px; flex-wrap:wrap">
        <button class="btn" id="ai-optimize">✨ AI 优化正文</button>
        <button class="btn" id="ai-annotate">📝 AI 生成备注</button>
        <button class="btn" id="ai-summarize">📋 AI 摘要/SEO</button>
        <button class="btn" id="ai-cover">🎨 AI 配图</button>
        <button class="btn" id="ai-moderate">🚫 AI 检查违禁词</button>
        <button class="btn" id="ai-classify">🏷 AI 分类</button>
      </div>
    </div>
    <div id="ai-result" class="ai-result" style="display:none;"></div>
    <label>AI 备注（保存文章时一并存入）</label>
    <textarea id="f-ai-notes" placeholder="点击「AI 生成备注」自动生成，或手动填写">${post && post.ai_notes ? post.ai_notes : ""}</textarea>
    <label>插入图片（上传到 R2）</label>
    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
      <input type="file" id="f-image" accept="image/*" />
      <button class="btn" id="open-media" type="button">🖼 媒体库</button>
    </div>
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
    const s = ta.selectionStart;
    const lineStart = ta.value.slice(0, s).lastIndexOf("\n") + 1;
    ta.value = ta.value.slice(0, lineStart) + prefix + ta.value.slice(lineStart);
    ta.selectionStart = ta.selectionEnd = s + prefix.length;
    ta.focus();
    ta.dispatchEvent(new Event("input"));
  }
  const ACTIONS = {
    bold: () => wrapSelection(ta, "**", "**", "加粗文字"),
    italic: () => wrapSelection(ta, "*", "*", "斜体文字"),
    code: () => wrapSelection(ta, "`", "`", "代码"),
    link: () => wrapSelection(ta, "[", "](https://)", "链接文字"),
    codeblock: () => wrapSelection(ta, "\n```js\n", "\n```\n", "// 在此粘贴代码"),
    h: () => prefixLine(ta, "## "),
    quote: () => prefixLine(ta, "> "),
    ul: () => prefixLine(ta, "- "),
    ol: () => prefixLine(ta, "1. "),
    hr: () => insertAtCursor(ta, "\n---\n"),
  };
  const toolbar = document.getElementById("editor-toolbar");
  if (toolbar) {
    toolbar.querySelectorAll(".fmt-btn").forEach((btn) => {
      btn.onclick = () => {
        const act = btn.dataset.act;
        if (act === "emoji") { toggleEmojiPicker(); return; }
        if (act === "image") { document.getElementById("f-toolbar-image").click(); return; }
        ACTIONS[act] && ACTIONS[act]();
      };
    });
  }

  // 表情选择器
  const EMOJIS = "😀 😁 😂 🤣 😊 😍 🥰 😘 😎 🤔 😅 😉 🙃 😇 🤩 🥳 😴 😭 😡 👍 👎 👏 🙌 💪 🤝 ✌️ 🤞 💡 🔥 ⭐ ✨ 💯 ✅ ❌ ⚠️ 📌 💬 📝 📚 💻 🖥️ ⌨️ 🐛 🚀 ⚙️ 📊 📈 🎯 🏷️ 🖼️ 📷 🔗 ❤️ 🧡 💛 💚 💙 💜 ⏰ 🌟 🍀 🌈 🎉 🤖 🧠 ⚡ 💥".split(" ");
  const picker = document.getElementById("emoji-picker");
  function buildEmojiPicker() {
    if (picker.dataset.built) return;
    picker.innerHTML = EMOJIS.map((e) => `<button type="button" class="emoji-item">${e}</button>`).join("");
    picker.dataset.built = "1";
    picker.querySelectorAll(".emoji-item").forEach((b) => {
      b.onclick = () => { insertAtCursor(ta, b.textContent); picker.style.display = "none"; };
    });
  }
  function toggleEmojiPicker() {
    buildEmojiPicker();
    picker.style.display = picker.style.display === "none" ? "flex" : "none";
  }
  form.addEventListener("click", (ev) => {
    if (picker && picker.style.display !== "none" && !picker.contains(ev.target) && !(ev.target.closest && ev.target.closest('[data-act="emoji"]'))) {
      picker.style.display = "none";
    }
  });

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

  document.getElementById("save").onclick = async () => {
    const payload = {
      title: document.getElementById("f-title").value.trim(),
      content: content.value,
      visibility: document.getElementById("f-visibility").value,
      cover: document.getElementById("f-cover").value.trim() || undefined,
      excerpt: document.getElementById("f-excerpt").value.trim() || undefined,
      ai_notes: aiNotes.value.trim() || undefined,
      tags: document.getElementById("f-tags").value.trim() || undefined,
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
    const d = await res.json().catch(() => ({ items: [] }));
    const items = d.items || [];
    if (!items.length) {
      grid.innerHTML = `<div class="empty">还没有图片，先上传一张吧。</div>`;
      return;
    }
    grid.innerHTML = "";
    for (const it of items) {
      const cell = el(`<div class="media-cell"></div>`);
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

    <fieldset class="set-group">
      <legend>⑧ 健康管理</legend>
      <p class="muted">内容合规与 AI 批处理相关设置。开启后，文章编辑器会出现「AI 检查违禁词」按钮。</p>
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer">
        <input type="checkbox" id="s-moderation_enabled" ${s.moderation_enabled !== "0" ? "checked" : ""} /> 启用 AI 违禁词检测
      </label>
      <label style="margin-top:14px">自定义重点排查词（可选，每行一个 / 逗号分隔）</label>
      <textarea id="s-banned_words" style="min-height:90px" placeholder="如：治愈、根治、包治百病、降血压、抗癌…">${escHtml(s.banned_words || "")}</textarea>
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
      moderation_enabled: document.getElementById("s-moderation_enabled").checked ? "1" : "0",
      banned_words: document.getElementById("s-banned_words").value,
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
