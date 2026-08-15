// 轻量 Markdown 渲染器（零依赖：表格 + [TOC] 目录 + 代码高亮/行号/折叠钩子）
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function inlineMd(text) {
  let s = escapeHtml(text);
  // 行内代码
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // 图片 ![alt](url)
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => `<img alt="${alt}" src="${url}" />`);
  // 链接 [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) => `<a href="${url}" target="_blank" rel="noopener">${t}</a>`);
  // 粗体
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // 斜体
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return s;
}

function slugify(text, taken) {
  let base = String(text).toLowerCase().replace(/[^\w一-龥]+/g, "-").replace(/^-+|-+$/g, "") || "h";
  let slug = base, n = 1;
  while (taken.has(slug)) { slug = base + "-" + n; n++; }
  return slug;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((s) => s.trim());
}

function renderToc(headings) {
  if (!headings.length) return "";
  let out = '<nav class="toc"><div class="toc-title">📑 目录</div><ul>';
  for (const h of headings) {
    out += `<li class="toc-l${h.level}"><a href="#${h.slug}" onclick="event.preventDefault();scrollToAnchor('${h.slug}')">${inlineMd(h.text)}</a></li>`;
  }
  out += "</ul></nav>\n";
  return out;
}

function renderMarkdown(src) {
  if (!src) return "";
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let i = 0;
  let para = [];

  // 预扫描：收集标题（用于 id 锚点与 [TOC]），跳过代码块内的「伪标题」
  const headings = [];
  const slugTaken = new Set();
  {
    let j = 0;
    while (j < lines.length) {
      if (/^```/.test(lines[j])) { j++; while (j < lines.length && !/^```/.test(lines[j])) j++; j++; continue; }
      const m = lines[j].match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        const text = m[2].trim();
        const slug = slugify(text, slugTaken);
        slugTaken.add(slug);
        headings.push({ idx: j, level: m[1].length, text, slug });
      }
      j++;
    }
  }
  const slugMap = new Map();
  headings.forEach((h) => slugMap.set(h.idx, h.slug));

  function flushPara() {
    if (para.length) {
      html += `<p>${inlineMd(para.join(" "))}</p>\n`;
      para = [];
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // 代码块（保留语言，支持复制 + 折叠 + 高亮 + 行号）
    if (/^```/.test(line)) {
      flushPara();
      const langMatch = line.match(/^```\s*([\w+#.-]*)/);
      const lang = langMatch && langMatch[1] ? langMatch[1] : "";
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过结束 ```
      const cls = lang ? ` class="language-${lang}"` : "";
      const langLabel = lang ? `<span class="code-lang">${lang}</span>` : `<span class="code-lang"></span>`;
      html += `<div class="code-block">` +
        `<div class="code-head">${langLabel}` +
        `<span class="code-tools">` +
        `<button class="code-toggle" type="button" onclick="toggleCodeBlock(this)" title="折叠/展开">▾</button>` +
        `<button class="copy-btn" type="button" onclick="copyCode(this)">复制</button>` +
        `</span></div>` +
        `<pre><code${cls}>${escapeHtml(buf.join("\n"))}</code></pre></div>\n`;
      continue;
    }

    // 表格（GFM）
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])) {
      flushPara();
      const header = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => {
        const t = c.trim();
        if (t.startsWith(":") && t.endsWith(":")) return "center";
        if (t.endsWith(":")) return "right";
        if (t.startsWith(":")) return "left";
        return "";
      });
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      let t = '<div class="table-wrap"><table>';
      t += "<thead><tr>" + header.map((h, idx) => `<th${aligns[idx] ? ` style="text-align:${aligns[idx]}"` : ""}>${inlineMd(h)}</th>`).join("") + "</tr></thead>";
      t += "<tbody>" + rows.map((r) => "<tr>" + r.map((c, idx) => `<td${aligns[idx] ? ` style="text-align:${aligns[idx]}"` : ""}>${inlineMd(c)}</td>`).join("") + "</tr>").join("") + "</tbody>";
      t += "</table></div>\n";
      html += t;
      continue;
    }

    // TOC 占位
    if (/^\[TOC\]$/i.test(line.trim())) {
      flushPara();
      html += renderToc(headings);
      i++;
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = h[1].length;
      const slug = slugMap.get(i) || "";
      html += `<h${level} id="${slug}">${inlineMd(h[2])}</h${level}>\n`;
      i++;
      continue;
    }

    // 分割线
    if (/^---+$/.test(line.trim())) {
      flushPara();
      html += "<hr/>\n";
      i++;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      flushPara();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      html += `<blockquote>${inlineMd(buf.join(" "))}</blockquote>\n`;
      continue;
    }

    // 无序列表
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inlineMd(lines[i].replace(/^[-*]\s+/, ""))}</li>`);
        i++;
      }
      html += `<ul>${items.join("")}</ul>\n`;
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inlineMd(lines[i].replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
      }
      html += `<ol>${items.join("")}</ol>\n`;
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      i++;
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushPara();
  return html;
}

// 代码块复制按钮（复制原始代码，不含行号）
window.copyCode = function (btn) {
  const block = btn.closest(".code-block");
  const code = block && block.querySelector("code");
  if (!code) return;
  const text = code.dataset.raw || code.textContent;
  const ok = () => { btn.textContent = "已复制"; setTimeout(() => (btn.textContent = "复制"), 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(ok).catch(() => fallbackCopy(text, ok));
  } else fallbackCopy(text, ok);
};
function fallbackCopy(text, ok) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); ok(); } catch (e) {}
  document.body.removeChild(ta);
}

// 代码块折叠 / 展开
window.toggleCodeBlock = function (btn) {
  const block = btn.closest(".code-block");
  if (!block) return;
  block.classList.toggle("collapsed");
  btn.textContent = block.classList.contains("collapsed") ? "▸" : "▾";
};

// TOC 锚点跳转（不改变 location.hash，避免与 SPA 路由冲突）
window.scrollToAnchor = function (id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

// 渲染后调用：语法高亮 + 行号（依赖 highlight.js，未加载则仅加行号）
window.highlightCode = function (root) {
  if (!root) return;
  root.querySelectorAll("pre code").forEach((b) => {
    if (window.hljs) {
      try { window.hljs.highlightElement(b); } catch (e) {}
    }
    addLineNumbers(b);
  });
};
function addLineNumbers(codeEl) {
  if (codeEl.dataset.ln) return;
  const original = codeEl.textContent;
  const raw = codeEl.innerHTML.split("\n");
  if (raw.length <= 1) return;
  if (raw[raw.length - 1].trim() === "") raw.pop();
  codeEl.innerHTML = raw
    .map((line, idx) => `<span class="code-line"><span class="ln">${idx + 1}</span><span class="lc">${line || " "}</span></span>`)
    .join("");
  codeEl.dataset.raw = original;
  codeEl.dataset.ln = "1";
  codeEl.classList.add("has-ln");
}
