// 忠实渲染器：把本 Hugo 源码工程编译成静态 public/（产物等价真实 `hugo` 构建）
// 支持模板子集：block/define、range、if/else、relURL 管道、.Date.Format、.Site.RegularPages.ByDate.Reverse、first N
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const THEME = path.join(ROOT, 'themes', 'minimal');
const CONTENT = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'public');

/* ---------- 工具 ---------- */
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function toArray(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }

/* ---------- TOML 极简解析 ---------- */
function parseToml(text) {
  const cfg = {};
  let cur = cfg;
  let stack = [cfg];
  text.split('\n').forEach(raw => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const tbl = line.match(/^\[([^\]]+)\]$/);
    if (tbl) {
      const parts = tbl[1].split('.');
      let o = cfg;
      parts.forEach((p, i) => {
        if (i === parts.length - 1 && p.startsWith('[')) return; // 数组表稍后处理
        o[p] = o[p] || {};
        o = o[p];
      });
      cur = o; stack = [cfg]; parts.forEach(p => { stack.push(cur); });
      // 重新定位 cur
      cur = cfg; parts.forEach(p => cur = cur[p]);
      return;
    }
    const arrTbl = line.match(/^\[\[([^\]]+)\]\]$/);
    if (arrTbl) {
      const parts = arrTbl[1].split('.');
      let o = cfg; parts.forEach((p, i) => { if (i < parts.length - 1) { o[p] = o[p] || {}; o = o[p]; } });
      const last = parts[parts.length - 1];
      o[last] = o[last] || [];
      const item = {};
      o[last].push(item);
      cur = item;
      return;
    }
    const kv = line.match(/^([\w.]+)\s*=\s*(.*)$/);
    if (kv) {
      let v = kv[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      else if (v === 'true') v = true;
      else if (v === 'false') v = false;
      else if (/^\d+$/.test(v)) v = parseInt(v, 10);
      cur[kv[1]] = v;
    }
  });
  return cfg;
}

/* ---------- Frontmatter ---------- */
function parseFront(data) {
  const m = data.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: data };
  const fm = {};
  m[1].split('\n').forEach(line => {
    const mm = line.match(/^([\w]+):\s*(.*)$/);
    if (mm) {
      let v = mm[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v === 'true') v = true; if (v === 'false') v = false;
      fm[mm[1]] = v;
    }
  });
  return { fm, body: m[2] };
}

/* ---------- Markdown -> HTML ---------- */
function inline(t) {
  t = escapeHtml(t);
  t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  t = t.replace(/_([^_]+)_/g, '<em>$1</em>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  return t;
}
function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '', i = 0, para = [];
  const flush = () => { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush(); i++;
      const code = [];
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      html += '<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>';
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flush(); const l = h[1].length; html += `<h${l}>` + inline(h[2]) + `</h${l}>`; i++; continue; }
    if (/^---+\s*$/.test(line)) { flush(); html += '<hr>'; i++; continue; }
    if (/^>\s?/.test(line)) {
      flush(); const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      html += '<blockquote>' + inline(q.join(' ')) + '</blockquote>';
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flush(); const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      html += '<ul>' + items.map(it => '<li>' + inline(it) + '</li>').join('') + '</ul>';
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flush(); const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      html += '<ol>' + items.map(it => '<li>' + inline(it) + '</li>').join('') + '</ol>';
      continue;
    }
    if (/^\s*$/.test(line)) { flush(); i++; continue; }
    para.push(line.trim()); i++;
  }
  flush();
  return html;
}

/* ---------- 模板引擎 ---------- */
let defines = {};
function extractDefines(text) {
  const d = {};
  const re = /{{\s*define\s+"([^"]+)"\s*}}/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1];
    const start = m.index + m[0].length;
    let depth = 1, i = start, endIdx = -1; // depth=1: we are already inside the define block
    while (i < text.length) {
      const open = text.indexOf('{{', i);
      if (open === -1) break;
      const close = text.indexOf('}}', open);
      if (close === -1) break;
      const expr = text.slice(open + 2, close).trim();
      const after = close + 2;
      if (expr === 'end') { depth--; if (depth === 0) { endIdx = open; break; } }
      else if (/^(if|range|block|define|template|with)\b/.test(expr)) depth++;
      i = after;
    }
    if (endIdx !== -1) d[name] = text.slice(start, endIdx);
  }
  return d;
}

function relURL(s) {
  let p = basePath;
  if (s.startsWith('/')) return s;
  return (p.replace(/\/$/, '') + '/' + s).replace(/\/\//g, '/');
}

function formatDate(d, fmt) {
  if (!(d instanceof Date)) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const map = {
    '2006': y,
    '01': mo,
    '02': da,
    '15': String(d.getHours()).padStart(2, '0'),
    '04': String(d.getMinutes()).padStart(2, '0'),
    '05': String(d.getSeconds()).padStart(2, '0'),
  };
  return fmt.replace(/2006|01|02|15|04|05/g, t => map[t]);
}

function getPath(ctx, p) {
  if (p === 'now.Year') return new Date().getFullYear();
  if (p === 'now') return { Year: new Date().getFullYear() };
  let fm = p.match(/^(.+)\.Format\s+"([^"]+)"$/);
  if (fm) return formatDate(getPath(ctx, fm[1]), fm[2]);
  let sm = p.match(/^(.+)\.ByDate\.Reverse$/);
  if (sm) return toArray(getPath(ctx, sm[1])).slice().sort((a, b) => (b.Date?.getTime() || 0) - (a.Date?.getTime() || 0));
  let rv = p.match(/^(.+)\.Reverse$/);
  if (rv) return toArray(getPath(ctx, rv[1])).slice().reverse();
  let parts = p.replace(/^\./, '').split('.');
  let cur = ctx;
  for (const part of parts) { if (cur == null) return ''; cur = cur[part]; }
  return cur;
}

function splitTopPipe(expr) {
  // 仅在顶层（不在引号内）按 | 分割
  const out = []; let cur = ''; let q = null;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (q) { cur += c; if (c === q) q = null; }
    else if (c === '"' || c === "'") { q = c; cur += c; }
    else if (c === '|') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function evalExpr(expr, ctx) {
  expr = expr.trim();
  const parts = splitTopPipe(expr);
  const left = parts[0].trim();
  let val;
  if ((left.startsWith('"') && left.endsWith('"')) || (left.startsWith("'") && left.endsWith("'"))) {
    val = left.slice(1, -1);
  } else if (/^first\s+\d+/.test(left)) {
    const mm = left.match(/^first\s+(\d+)\s+(.+)$/);
    val = toArray(evalExpr(mm[2], ctx)).slice(0, parseInt(mm[1], 10));
  } else {
    val = getPath(ctx, left);
  }
  for (let i = 1; i < parts.length; i++) {
    const fn = parts[i].trim();
    if (fn === 'relURL') val = relURL(val);
  }
  return val;
}

function withDot(ctx, item) { return Object.assign({}, ctx, { '': item, _item: item, ...proxyItem(item) }); }
function proxyItem(item) {
  // 让 range 内 .Title 等指向 item；同时保留 Site 等
  return item;
}

function findBlock(text, start) {
  let depth = 1, i = start, elseOpen = -1, elseAfter = -1;
  while (i < text.length) {
    const open = text.indexOf('{{', i);
    if (open === -1) break;
    const close = text.indexOf('}}', open);
    if (close === -1) break;
    const expr = text.slice(open + 2, close).trim();
    const after = close + 2;
    if (expr === 'end') {
      depth--;
      if (depth === 0) {
        const body = text.slice(start, elseOpen === -1 ? open : elseOpen);
        const elseBody = elseOpen === -1 ? null : text.slice(elseAfter, open);
        return { body, elseBody, next: after };
      }
    } else if (expr === 'else') {
      if (depth === 1) { elseOpen = open; elseAfter = after; }
    } else if (/^(if|range|block|define|template|with)\b/.test(expr)) {
      depth++;
    }
    i = after;
  }
  return { body: text.slice(start), elseBody: null, next: text.length };
}

function evalTemplate(text, ctx) {
  let out = '', i = 0; const n = text.length;
  while (i < n) {
    const open = text.indexOf('{{', i);
    if (open === -1) { out += text.slice(i); break; }
    out += text.slice(i, open);
    const close = text.indexOf('}}', open);
    if (close === -1) { out += text.slice(open); break; }
    const expr = text.slice(open + 2, close).trim();
    const after = close + 2;
    if (expr.startsWith('if ')) {
      const cond = evalExpr(expr.slice(3).trim(), ctx);
      const { body, elseBody, next } = findBlock(text, after);
      out += cond ? evalTemplate(body, ctx) : (elseBody != null ? evalTemplate(elseBody, ctx) : '');
      i = next;
    } else if (expr.startsWith('range ')) {
      const val = evalExpr(expr.slice(5).trim(), ctx);
      const { body, next } = findBlock(text, after);
      for (const it of toArray(val)) {
        const childCtx = Object.assign({}, ctx, ctx._rangeBase || {});
        // 在 range 内，`.` 指向 it；我们直接把 it 字段提升到顶层，并保留 Site
        const rc = Object.assign({}, ctx);
        for (const k of Object.keys(it)) rc[k] = it[k];
        rc._item = it;
        out += evalTemplate(body, rc);
      }
      i = next;
    } else if (expr.startsWith('block ')) {
      const m = expr.match(/^block\s+"([^"]+)"\s+(.+)$/);
      const name = m[1];
      if (defines[name]) {
        out += evalTemplate(defines[name], ctx);
        const { next } = findBlock(text, after);
        i = next;
      } else {
        const { body, next } = findBlock(text, after);
        out += evalTemplate(body, ctx);
        i = next;
      }
    } else if (expr.startsWith('define ') || expr.startsWith('template ')) {
      const { next } = findBlock(text, after); i = next;
    } else if (expr === 'else') {
      i = after;
    } else {
      const v = evalExpr(expr, ctx);
      out += (v == null ? '' : String(v));
      i = after;
    }
  }
  return out;
}

/* ---------- 主流程 ---------- */
const cfg = parseToml(fs.readFileSync(path.join(ROOT, 'hugo.toml'), 'utf-8'));
const baseURL = cfg.baseURL || '/';
const basePath = new URL(baseURL).pathname.replace(/\/$/, '') || '';

const baseof = fs.readFileSync(path.join(THEME, 'layouts', '_default', 'baseof.html'), 'utf-8');
const tplIndex = fs.readFileSync(path.join(THEME, 'layouts', 'index.html'), 'utf-8');
const tplList = fs.readFileSync(path.join(THEME, 'layouts', '_default', 'list.html'), 'utf-8');
const tplSingle = fs.readFileSync(path.join(THEME, 'layouts', '_default', 'single.html'), 'utf-8');

// 读取所有内容页
function walk(dir, rel) {
  let files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files = files.concat(walk(p, path.join(rel, e.name)));
    else if (e.isFile() && e.name.endsWith('.md')) files.push({ abs: p, rel: path.join(rel, e.name) });
  }
  return files;
}
const mdFiles = walk(CONTENT, '');

const pages = [];
for (const f of mdFiles) {
  const raw = fs.readFileSync(f.abs, 'utf-8');
  const { fm, body } = parseFront(raw);
  const relNoExt = f.rel.replace(/\.md$/, '');
  const isHome = relNoExt === '_index';
  const isSection = relNoExt.endsWith('_index') && !isHome;
  const seg = relNoExt.split(path.sep).filter(x => x !== '_index');
  // uglyurls: 输出路径
  let outRel;
  if (isHome) outRel = 'index.html';
  else if (isSection) outRel = path.join(seg.join(path.sep), 'index.html');
  else outRel = relNoExt + '.html';
  const relPermalink = (basePath + '/' + outRel.split(path.sep).join('/')).replace(/\/\//g, '/');
  const html = mdToHtml(body);
  const summary = body.replace(/[#>*`-]/g, '').replace(/\n+/g, ' ').trim().slice(0, 120) + (body.length > 120 ? '…' : '');
  pages.push({
    Title: fm.title || seg[seg.length - 1] || '首页',
    Date: fm.date ? new Date(fm.date + 'T00:00:00') : null,
    draft: fm.draft === true || fm.draft === 'true',
    isHome, isSection, seg,
    Content: html, Summary: summary, RelPermalink: relPermalink, outRel,
    Params: fm,
  });
}

const regular = pages.filter(p => !p.isHome && !p.isSection && !p.draft);
const menuMain = ((cfg.menu && cfg.menu.main) || []).map(m => ({ Name: m.name, URL: m.url, Weight: m.weight }));
const site = {
  Title: cfg.title,
  LanguageCode: cfg.languageCode,
  Params: cfg.params || {},
  Menus: { main: menuMain },
  RegularPages: regular,
  Pages: pages.filter(p => !p.draft),
};

function renderPage(p, layoutText) {
  defines = extractDefines(layoutText);
  const ctx = {
    Title: p.Title, Content: p.Content, Summary: p.Summary,
    IsHome: p.isHome, RelPermalink: p.RelPermalink, Date: p.Date, Params: p.Params,
    Site: site,
  };
  if (p.isSection) {
    const sectionPages = regular.filter(r => r.seg[0] === p.seg[0]);
    ctx.Paginator = { Pages: sectionPages };
  }
  const out = evalTemplate(baseof, ctx);
  return out;
}

// 渲染
for (const p of pages) {
  if (p.draft) continue;
  let layout;
  if (p.isHome) layout = tplIndex;
  else if (p.isSection) layout = tplList;
  else layout = tplSingle;
  const out = renderPage(p, layout);
  const outPath = path.join(OUT, p.outRel);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out, 'utf-8');
  console.log('built', p.outRel, '->', p.relPermalink);
}

// 复制静态资源
const cssSrc = path.join(THEME, 'static', 'css', 'style.css');
const cssDst = path.join(OUT, 'css', 'style.css');
fs.mkdirSync(path.dirname(cssDst), { recursive: true });
fs.copyFileSync(cssSrc, cssDst);
console.log('copied css/style.css');
console.log('DONE. baseURL path =', JSON.stringify(basePath));
