// 从 public/ 中实际使用的 data-lucide 图标名，裁剪 vendor/lucide/lucide.min.js，
// 生成轻量 public/js/icons.js（保持 window.lucide.createIcons() API 兼容）。
// 用法：node tools/gen-icons.mjs   （新增/删除图标后重跑即可）
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const SRC = path.join(PUBLIC, "vendor/lucide/lucide.min.js");
const OUT = path.join(PUBLIC, "js/icons.js");

// 1) 扫描实际使用的图标名（跳过 vendor 全量包与独立的漫剧资源目录）
const SKIP_DIRS = new Set(["vendor", "ai-manju-assets", "node_modules", ".wrangler"]);
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) walk(p, out);
    } else if (/\.(js|html)$/.test(ent.name) && ent.name !== "icons.js") {
      out.push(p);
    }
  }
  return out;
}
const names = new Set();
for (const f of walk(PUBLIC)) {
  for (const m of fs.readFileSync(f, "utf8").matchAll(/data-lucide="([a-z0-9-]+)"/g)) names.add(m[1]);
}
if (!names.size) throw new Error("未扫描到任何 data-lucide 图标，请检查 public/ 目录");

// 2) 以浏览器全局方式加载 UMD，取出完整图标表
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SRC, "utf8"), sandbox);
const ALL = sandbox.lucide;
if (!ALL || typeof ALL !== "object") throw new Error("无法从 lucide.min.js 读取图标表");

// 3) kebab-case -> PascalCase 键名（先精确匹配，再按归一化名兜底，兼容别名）
const pascal = (s) => s.replace(/(^|[-_\s])(\w)/g, (_, _a, b) => b.toUpperCase());
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const byNorm = new Map();
for (const k of Object.keys(ALL)) if (!byNorm.has(norm(k))) byNorm.set(norm(k), k);

const ICONS = {};
const missing = [];
const aliased = [];
let maxNodeParts = 0;
for (const n of [...names].sort()) {
  const exact = pascal(n);
  const key = ALL[exact] ? exact : byNorm.get(norm(n));
  if (!key) { missing.push(n); continue; }
  if (key !== exact) aliased.push(`${n} -> ${key}`);
  ICONS[n] = ALL[key];
  for (const part of ALL[key]) maxNodeParts = Math.max(maxNodeParts, part.length);
}

if (missing.length) {
  console.error("以下图标在完整包中找不到对应定义，请人工确认：", missing.join(", "));
  process.exitCode = 1;
}

const payload = JSON.stringify(ICONS);
const out = `/* 轻量 Lucide 图标子集（自动生成，请勿手改）
   来源：public/vendor/lucide/lucide.min.js (lucide v1.63.0, ISC)
   由 tools/gen-icons.mjs 按 public/ 中实际出现的 data-lucide 名裁剪生成。
   当前收录 ${Object.keys(ICONS).length} 个图标，约 ${(Buffer.byteLength(payload) / 1024).toFixed(1)}KB；
   完整包约 452KB。新增图标后执行：node tools/gen-icons.mjs
   保持 window.lucide.createIcons() API 兼容，业务代码无需改动。 */
(function () {
  "use strict";
  var ICONS = ${payload};
  var BASE = {
    xmlns: "http://www.w3.org/2000/svg", width: "24", height: "24",
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round"
  };
  function esc(v) {
    return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function build(name, el) {
    var node = ICONS[name];
    if (!node) return null;
    var attrs = [];
    var cls = "lucide lucide-" + name;
    if (el && el.attributes) {
      for (var i = 0; i < el.attributes.length; i++) {
        var a = el.attributes[i];
        if (a.name === "data-lucide") continue;
        if (a.name === "class") { cls = a.value + " " + cls; continue; }
        attrs.push([a.name, a.value]);
      }
    }
    for (var k in BASE) attrs.push([k, BASE[k]]);
    attrs.push(["class", cls]);
    var head = "<svg";
    for (var j = 0; j < attrs.length; j++) {
      head += " " + attrs[j][0] + "=\\"" + esc(attrs[j][1]) + "\\"";
    }
    head += ">";
    var body = "";
    for (var x = 0; x < node.length; x++) {
      var t = node[x][0], a2 = node[x][1] || {}, children = node[x][2];
      body += "<" + t;
      for (var p in a2) body += " " + p + "=\\"" + esc(a2[p]) + "\\"";
      if (children && children.length) {
        body += ">";
        for (var c = 0; c < children.length; c++) {
          var ct = children[c][0], ca = children[c][1] || {};
          body += "<" + ct;
          for (var q in ca) body += " " + q + "=\\"" + esc(ca[q]) + "\\"";
          body += "></" + ct + ">";
        }
        body += "</" + t + ">";
      } else {
        body += "></" + t + ">";
      }
    }
    return head + body + "</svg>";
  }
  // 扫描并替换 [data-lucide]（与完整版行为一致：替换后 svg 不再带该属性，不会重复处理）
  function createIcons(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var list = scope.querySelectorAll("[data-lucide]");
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var html = build(el.getAttribute("data-lucide"), el);
      if (!html) continue; // 未收录的图标名保留原元素，不破坏页面
      el.insertAdjacentHTML("beforebegin", html);
      if (el.parentNode) el.parentNode.removeChild(el);
      n++;
    }
    return n;
  }
  window.lucide = { createIcons: createIcons, icons: ICONS };
})();
`;

fs.writeFileSync(OUT, out, "utf8");
console.log(`使用图标: ${names.size} 个 / 匹配: ${Object.keys(ICONS).length} 个`);
if (aliased.length) console.log("别名映射:", aliased.join(", "));
console.log(`iconNode 最大段数: ${maxNodeParts}（>2 表示含嵌套子节点，已支持）`);
console.log(`完整包: ${(fs.statSync(SRC).size / 1024).toFixed(1)}KB -> icons.js: ${(fs.statSync(OUT).size / 1024).toFixed(1)}KB`);
console.log("已写入:", OUT);
