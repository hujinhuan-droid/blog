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
    <label>GEMINI AI 辅助</label>
    <div style="display:flex; gap:10px; margin-bottom:10px;">
      <button class="btn" id="ai-optimize">✨ AI 优化正文</button>
      <button class="btn" id="ai-annotate">📝 AI 生成备注</button>
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
        body: JSON.stringify({ action, title: document.getElementById("f-title").value, content: c }),
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
