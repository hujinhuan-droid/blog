// 真实浏览器性能审计（仅本地调试用）
//   · 复用同一个已预热的热 Chrome 实例（消除渲染进程冷启动的 ~2.7s 固定开销）
//   · 每次采样前清浏览器缓存 + 强制 cacheDisabled + 屏蔽 SW 注册，保证「冷缓存」且不受 SW 污染
//   · 导航前注入 PerformanceObserver（buffered），采集 FCP / LCP / CLS / 长任务
//   · 采集 Resource Timing 瀑布（体积、耗时、请求数）
//   · A/B 对照：--prepare 生成「优化前」页面，与当前版在同一环境对比
//
// 用法（Git Bash 注意：cases 路径不要带前导 /，否则会被 MSYS 转成 Windows 路径）：
//   node tools/perf-audit.mjs --prepare
//   node tools/perf-audit.mjs --noproxy 1 --base http://127.0.0.1:8788 \
//     --cases "new=_perf-new.html#/,old=_perf-old.html#/" --runs 3 --out perf.json
//   node tools/perf-audit.mjs --cleanup
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const VARIANTS = ["public/_perf-new.html", "public/_perf-old.html"];

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? (process.argv[i + 1] ?? "") : def;
}
const has = (name) => process.argv.includes("--" + name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 生成 / 清理 A/B 对照页面 -------------------------------------------------
if (has("prepare") || has("cleanup")) {
  for (const f of VARIANTS) {
    const p = path.join(ROOT, f);
    if (has("cleanup") && fs.existsSync(p)) { fs.unlinkSync(p); console.log("已删除 " + f); }
  }
  if (has("prepare")) {
    const src = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
    fs.writeFileSync(path.join(ROOT, VARIANTS[0]), src, "utf8");
    // 「优化前」：移除所有 preload；图标换回全量 lucide；补回同步 highlight + admin
    const old = src
      .replace(/[ \t]*<link rel="preload"[^>]*\/>\r?\n?/g, "")
      .replace('<script src="/js/icons.js"></script>', '<script src="/vendor/lucide/lucide.min.js"></script>')
      .replace(
        '<script src="/js/markdown.js"></script>',
        '<script src="/vendor/highlightjs/highlight.min.js"></script>\n' +
        '    <script src="/js/markdown.js"></script>\n' +
        '    <script src="/js/admin.js"></script>'
      );
    fs.writeFileSync(path.join(ROOT, VARIANTS[1]), old, "utf8");
    console.log("已生成 " + VARIANTS.join(" , "));
  }
  process.exit(0);
}

// ---- 导航前注入的探针（最早执行） ---------------------------------------------
const PROBE = `(function () {
  // 测量用：屏蔽 Service Worker 注册，避免 SW 缓存污染后续采样
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.register) {
      navigator.serviceWorker.register = function () { return Promise.resolve({}); };
    }
  } catch (e) {}
  var P = window.__PERF__ = { lcp: 0, lcpEl: "", cls: 0, shifts: [], longTasks: [] };
  function observe(type, cb) { try { new PerformanceObserver(function (l) { l.getEntries().forEach(cb); }).observe({ type: type, buffered: true }); } catch (e) {} }
  observe("largest-contentful-paint", function (e) {
    P.lcp = e.startTime;
    P.lcpEl = e.element ? e.element.tagName.toLowerCase() +
      (e.element.className && typeof e.element.className === "string" ? "." + e.element.className.trim().split(/\\s+/).join(".") : "") +
      (e.element.id ? "#" + e.element.id : "") : (e.url || "");
  });
  observe("layout-shift", function (e) {
    if (e.hadRecentInput) return;
    P.cls += e.value;
    var src = [];
    try {
      (e.sources || []).slice(0, 6).forEach(function (s) {
        var n = s.node;
        var tag = n && n.nodeName ? n.nodeName.toLowerCase() : "?";
        var id = n && n.id ? "#" + n.id : "";
        var cls = n && typeof n.className === "string" && n.className.trim()
          ? "." + n.className.trim().split(/\\s+/).slice(0, 2).join(".") : "";
        src.push({
          el: tag + id + cls,
          from: s.previousRect ? Math.round(s.previousRect.y) + "/" + Math.round(s.previousRect.height) : "",
          to: s.currentRect ? Math.round(s.currentRect.y) + "/" + Math.round(s.currentRect.height) : ""
        });
      });
    } catch (x) {}
    P.shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), src: src });
  });
  observe("longtask", function (e) { P.longTasks.push(Math.round(e.duration)); });
})();`;

// ---- settle 后取回的完整指标 -------------------------------------------------
const COLLECT = `(function () {
  var P = window.__PERF__ || {};
  var nav = performance.getEntriesByType("navigation")[0] || {};
  var fcp = (performance.getEntriesByName("first-contentful-paint")[0] || {}).startTime || 0;
  var res = performance.getEntriesByType("resource").map(function (e) {
    return {
      name: e.name.replace(/^https?:\\/\\/[^/]+/, ""),
      type: e.initiatorType,
      dur: Math.round(e.duration),
      start: Math.round(e.startTime),
      end: Math.round(e.responseEnd),
      transfer: e.transferSize || 0,
      decoded: e.decodedBodySize || 0
    };
  });
  var js = res.filter(function (r) { return /\\.js(\\?|$)/.test(r.name); });
  return {
    fcp: Math.round(fcp),
    lcp: Math.round(P.lcp || 0),
    lcpEl: P.lcpEl || "",
    cls: +(P.cls || 0).toFixed(4),
    shifts: P.shifts || [],
    longTasks: P.longTasks || [],
    ttfb: Math.round(nav.responseStart || 0),
    dcl: Math.round(nav.domContentLoadedEventEnd || 0),
    load: Math.round(nav.loadEventEnd || 0),
    phases: {
      dns: Math.round((nav.domainLookupEnd || 0) - (nav.domainLookupStart || 0)),
      connect: Math.round((nav.connectEnd || 0) - (nav.connectStart || 0)),
      request: Math.round((nav.responseStart || 0) - (nav.requestStart || 0)),
      response: Math.round((nav.responseEnd || 0) - (nav.responseStart || 0)),
      domParse: Math.round((nav.domContentLoadedEventEnd || 0) - (nav.responseEnd || 0))
    },
    requestCount: res.length,
    jsCount: js.length,
    jsBytes: js.reduce(function (a, b) { return a + b.decoded; }, 0),
    jsTransfer: js.reduce(function (a, b) { return a + b.transfer; }, 0),
    totalBytes: res.reduce(function (a, b) { return a + b.decoded; }, 0),
    resources: res
  };
})()`;

const BASE = arg("base", "http://127.0.0.1:8788").replace(/\/$/, "");
const RUNS = Number(arg("runs", 3));
const SETTLE = Number(arg("settle", 4000));
const OUT = arg("out", "");
const W = Number(arg("w", 1440));
const H = Number(arg("h", 1000));
const cases = arg("cases", "").split(",").filter(Boolean).map((s) => {
  const i = s.indexOf("=");
  return { name: s.slice(0, i), path: s.slice(i + 1) };
});
if (!cases.length) {
  console.error("缺少 --cases，格式：name=path#/,name=path#/");
  process.exit(1);
}
// Git Bash(MSYS) 会把以 / 开头的参数值转成 Windows 路径，导致 URL 被污染；检测并明确报错
for (const c of cases) {
  if (/[A-Za-z]:[\\/]/.test(c.path) || c.path.includes("Program Files")) {
    console.error("路径被 MSYS 自动转换污染: " + c.path + "\n请去掉前导 / 传参，或设置 MSYS2_ARG_CONV_EXCL=*");
    process.exit(1);
  }
}

// ---- 单个热 Chrome 实例，复用 page 多次导航 -----------------------------------
const PORT = 9500 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--no-first-run", "--no-default-browser-check",
  ...(arg("insecure", "") ? ["--ignore-certificate-errors"] : []),
  ...(arg("noproxy", "") ? ["--no-proxy-server"] : []),
  `--remote-debugging-port=${PORT}`,
  `--window-size=${W},${H}`,
  "--user-data-dir=" + (process.env.TEMP || "/tmp") + "/perf-audit-" + Date.now() + "-" + PORT,
  "about:blank",
], { stdio: "ignore" });

let ws, msgId = 0;
const pending = new Map();
let errors = [];
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("timeout: " + method)); } }, 60000);
  });
}
const getJSON = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

const all = [];
try {
  let targets = null;
  for (let i = 0; i < 120; i++) { // Windows 上 Chrome 偶发启动偏慢，放宽到 30s
    try { targets = await getJSON("/json/list"); if (targets && targets.length) break; } catch {}
    await sleep(250);
  }
  if (!targets || !targets.length) throw new Error("Chrome 未就绪");
  const page = targets.find((t) => t.type === "page") || targets[0];
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === "Runtime.exceptionThrown") {
      errors.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || "").split("\n")[0]);
    }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });

  // 预热服务端 + Chrome 渲染进程（丢弃这次结果，消除冷启动固定开销）
  try { await fetch(BASE + "/"); await fetch(BASE + "/api/posts"); } catch {}
  await send("Page.navigate", { url: BASE + "/" });
  await sleep(SETTLE);

  // 交错执行（run 外层、case 内层）：让 A/B 各组承受相同的环境漂移，配合中位数抵消噪声
  for (let i = 1; i <= RUNS; i++) {
    for (const c of cases) {
      const url = BASE + (c.path.startsWith("/") ? c.path : "/" + c.path);
      let m = null, lastErr = null;
      for (let attempt = 1; attempt <= 2 && !m; attempt++) {
        try {
          errors = [];
          await send("Network.clearBrowserCache");
          await send("Network.setCacheDisabled", { cacheDisabled: true });
          // 先卸载当前文档：同一页面只改 hash 时 Chrome 不会重新加载，navigation timing 不会重置
          await send("Page.navigate", { url: "about:blank" });
          await sleep(120);
          await send("Page.navigate", { url });
          await sleep(SETTLE);
          const r = await send("Runtime.evaluate", { expression: COLLECT, returnByValue: true, awaitPromise: true });
          if (r.exceptionDetails) throw new Error("采集失败: " + (r.exceptionDetails.text || ""));
          m = { ...r.result.value, errors: [...errors] };
        } catch (e) { lastErr = e; await sleep(400); }
      }
      if (!m) { console.error(`[${c.name} #${i}] 失败: ${lastErr?.message} | url=${url}`); continue; }
      all.push({ case: c.name, run: i, url, ...m });
      console.log(`[${c.name} #${i}] FCP ${m.fcp}ms | LCP ${m.lcp}ms | CLS ${m.cls} | TTFB ${m.ttfb}ms | DCL ${m.dcl}ms | 解析 ${m.phases.domParse}ms | JS ${m.jsCount}个/${(m.jsBytes / 1024).toFixed(1)}KB | 请求 ${m.requestCount} | 长任务 ${m.longTasks.length} | 异常 ${m.errors.length}`);
    }
  }

  const summary = {};
  for (const c of cases) {
    const rows = all.filter((r) => r.case === c.name);
    if (!rows.length) continue;
    const pick = (k) => Math.round(median(rows.map((r) => r[k])));
    summary[c.name] = {
      runs: rows.length,
      fcp: pick("fcp"), lcp: pick("lcp"), cls: +median(rows.map((r) => r.cls)).toFixed(4),
      ttfb: pick("ttfb"), dcl: pick("dcl"), load: pick("load"),
      domParse: Math.round(median(rows.map((r) => r.phases.domParse))),
      jsCount: pick("jsCount"), jsBytes: pick("jsBytes"), jsTransfer: pick("jsTransfer"),
      requestCount: pick("requestCount"), totalBytes: pick("totalBytes"),
      longTasks: Math.round(median(rows.map((r) => r.longTasks.length))),
      longTaskMs: Math.round(median(rows.map((r) => r.longTasks.reduce((a, b) => a + b, 0)))),
      lcpEl: rows[0].lcpEl,
      shifts: rows[0].shifts,
      errors: rows.reduce((a, r) => a + r.errors.length, 0),
      resources: rows[0].resources,
    };
  }

  console.log("\n===== 汇总（各指标中位数） =====");
  console.log("case".padEnd(14) + "FCP".padStart(8) + "LCP".padStart(8) + "CLS".padStart(9) + "TTFB".padStart(8) + "DCL".padStart(8) + "解析".padStart(8) + "JS数".padStart(7) + "JS体积".padStart(11) + "请求".padStart(7) + "长任务ms".padStart(11));
  for (const [k, s] of Object.entries(summary)) {
    console.log(k.padEnd(14) + String(s.fcp).padStart(8) + String(s.lcp).padStart(8) + String(s.cls).padStart(9) +
      String(s.ttfb).padStart(8) + String(s.dcl).padStart(8) + String(s.domParse).padStart(8) +
      String(s.jsCount).padStart(7) + ((s.jsBytes / 1024).toFixed(1) + "KB").padStart(11) +
      String(s.requestCount).padStart(7) + String(s.longTaskMs).padStart(11));
  }

  if (OUT) {
    fs.writeFileSync(path.resolve(OUT), JSON.stringify({
      meta: { base: BASE, runs: RUNS, settle: SETTLE, viewport: [W, H], coldCache: true, hotChrome: true, swDisabled: true },
      runs: all, summary,
    }, null, 2), "utf8");
    console.log("\n已写入 " + OUT);
  }
} catch (e) {
  console.error("失败:", e.message);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
}
