// 轻量 Markdown 渲染器（零依赖，覆盖常用语法）
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

function renderMarkdown(src) {
  if (!src) return "";
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let i = 0;
  let para = [];

  function flushPara() {
    if (para.length) {
      html += `<p>${inlineMd(para.join(" "))}</p>\n`;
      para = [];
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (/^```/.test(line)) {
      flushPara();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过结束 ```
      html += `<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>\n`;
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = h[1].length;
      html += `<h${level}>${inlineMd(h[2])}</h${level}>\n`;
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
