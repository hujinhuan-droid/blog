// 站点体检（真实 Chrome / CDP，只读，不改站点）
//   对每个页面收集：控制台异常、失败请求 / 4xx-5xx、破损图片、水平溢出元素、
//   可访问性缺项（无 alt 图、无标签按钮/链接、h1 数量）、SEO 基本项。
//   桌面 + 移动两种视口各跑一遍，便于发现窄屏布局问题。
//
// 用法：
//   node tools/site-audit.mjs --base http://127.0.0.1:8788 --noproxy 1
//   node tools/site-audit.mjs --base https://hujinhuan.cc.cd --insecure 1 --out audit-live.json
//   node tools/site-audit.mjs --base ... --mobile-only 1
//   node tools/site-audit.mjs --base ... --mobile-only 1 --only-posts 1 --posts 10
//     （批量巡检前 N 篇文章，统计横向溢出；--expr / --expr-file 可在渲染后跑自定义探针）
//   node tools/site-audit.mjs --base ... --routes "#/timeline,#/feed,#/tags,#/friends,#/about" --only-routes 1
//     （巡检任意 hash 路由；注意 MSYS 会把以 / 开头的参数值转成 Windows 路径，写成 #/xxx 由工具补 /）
//   node tools/site-audit.mjs --base ... --only-posts 1 --posts 40 --offset 40
//     （--offset 分批巡检全量文章，避免单次运行过长）
import { spawn } from "node:child_process";
import fs from "node:fs";

const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9600 + Math.floor(Math.random() * 300);
function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? (process.argv[i + 1] ?? "") : def;
}
const has = (n) => process.argv.includes("--" + n);
const BASE = arg("base", "http://127.0.0.1:8788").replace(/\/$/, "");
const SETTLE = Number(arg("settle", has("insecure") ? 4000 : 1800));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 页面内探针：返回结构化结果，不修改 DOM
const PROBE = `(() => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const txt = (el) => (el.textContent || "").trim();
  const imgs = q("img");
  const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0)
    .map((i) => (i.currentSrc || i.src || "").slice(0, 160));
  const noAlt = imgs.filter((i) => !i.hasAttribute("alt")).length;
  const noDim = imgs.filter((i) => !i.getAttribute("width") && !i.getAttribute("height") &&
    !i.style.width && !i.style.aspectRatio).length;
  const btns = q("button");
  const badBtns = btns.filter((b) => !txt(b) && !b.getAttribute("aria-label") && !b.title);
  const btnNoLabel = badBtns.length;
  const links = q("a[href]");
  const badLinks = links.filter((a) => !txt(a) && !a.getAttribute("aria-label") &&
    !a.querySelector("img[alt]:not([alt='']),svg[aria-label]"));
  const linkNoLabel = badLinks.length;
  const badImgs = imgs.filter((i) => !i.hasAttribute("alt"));
  // 移动端可点区域（WCAG 2.5.8 建议 >= 24px，Apple HIG 建议 44px）；只记录，判定留给人工
  const tapSmall = q("a[href],button,input,select,textarea").filter((elx) => {
    const s = getComputedStyle(elx), r = elx.getBoundingClientRect();
    if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
    return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24);
  });
  const brief = (elx) => ({
    tag: elx.tagName.toLowerCase(),
    cls: (typeof elx.className === "string" ? elx.className : "").slice(0, 50),
    id: elx.id || "",
    w: Math.round(elx.getBoundingClientRect().width),
    h: Math.round(elx.getBoundingClientRect().height),
    html: (elx.outerHTML || "").slice(0, 150),
  });
  const inputsNoLabel = q("input,textarea,select").filter((el) => {
    if (el.type === "hidden" || el.type === "submit" || el.type === "button") return false;
    return !el.getAttribute("aria-label") && !el.getAttribute("placeholder") &&
      !el.closest("label") && !(el.id && document.querySelector('label[for="' + el.id + '"]'));
  }).length;
  const overflowRoot = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  const docSW = document.documentElement.scrollWidth, bodySW = document.body.scrollWidth;
  // 不预先过滤：装饰层也会记录，但从 sw/cw 与祖先链可判断是否真实撑宽文档
  const spill = q("body *").filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && (r.right > innerWidth + 2 || r.left < -2);
  }).slice(0, 15).map((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === "string" ? el.className : "").slice(0, 60),
      left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
      sw: el.scrollWidth, cw: el.clientWidth, ovx: s.overflowX, pos: s.position,
      parent: el.parentElement ? el.parentElement.tagName.toLowerCase() + "." +
        (typeof el.parentElement.className === "string" ? el.parentElement.className : "").slice(0, 40) : "",
    };
  });
  // 对最宽的真实溢出元素，输出逐层祖先的盒子/溢出属性，直接定位是谁没裁剪
  let chain = [];
  const real = q("body *").filter((el) => {
    const r = el.getBoundingClientRect();
    return !el.closest(".bg-fx") && r.width > 4 && r.height > 4 && r.right > innerWidth + 2;
  }).sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
  for (let el = real, i = 0; el && i < 9; el = el.parentElement, i++) {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    chain.push({
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === "string" ? el.className : "").slice(0, 50),
      right: Math.round(r.right), w: Math.round(r.width),
      sw: el.scrollWidth, cw: el.clientWidth,
      ovx: s.overflowX, ws: s.whiteSpace, disp: s.display, pos: s.position,
      minW: s.minWidth, maxW: s.maxWidth, width: s.width,
    });
  }
  // 真正贡献文档宽度的元素：排除已被 overflow!=visible 祖先裁剪的内容
  const clipped = (el) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      if (getComputedStyle(p).overflowX !== "visible") return true;
      p = p.parentElement;
    }
    return false;
  };
  const wide = q(".post-detail .content *").filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && r.right > innerWidth + 2 && !clipped(el);
  }).slice(0, 12).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === "string" ? el.className : "").slice(0, 50),
      left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
      text: (el.textContent || "").trim().slice(0, 40),
    };
  });
  const kids = q(".post-detail .content > *").map((el) => ({
    tag: el.tagName.toLowerCase(),
    cls: (typeof el.className === "string" ? el.className : "").slice(0, 40),
    sw: el.scrollWidth, cw: el.clientWidth,
    right: Math.round(el.getBoundingClientRect().right),
    text: (el.textContent || "").trim().slice(0, 180),
    html: (el.innerHTML || "").slice(0, 180),
  })).filter((x) => x.sw > x.cw + 5 || x.right > innerWidth + 2).slice(0, 12);
  const meta = (n) => (document.querySelector('meta[name="' + n + '"]') || {}).content || "";
  const ld = q('script[type="application/ld+json"]').map((s) => {
    try { return JSON.parse(s.textContent)["@type"] || "(no type)"; } catch { return "INVALID_JSON"; }
  });
  return {
    url: location.href,
    title: document.title,
    h1: q("h1").map(txt),
    desc: meta("description").slice(0, 120),
    canonical: (document.querySelector("link[rel=canonical]") || {}).href || "",
    ogTitle: (document.querySelector('meta[property="og:title"]') || {}).content || "",
    jsonLd: ld,
    appTextLen: (document.getElementById("app") || { textContent: "" }).textContent.trim().length,
    imgTotal: imgs.length, imgNoAlt: noAlt, imgNoDim: noDim, brokenImgs: broken,
    btnTotal: btns.length, btnNoLabel, linkTotal: links.length, linkNoLabel, inputsNoLabel,
    badBtns: badBtns.slice(0, 8).map(brief),
    badLinks: badLinks.slice(0, 8).map(brief),
    noAltSrcs: badImgs.slice(0, 8).map((i) => (i.currentSrc || i.src || "").slice(0, 140)),
    tapSmall: tapSmall.length, tapSmallList: tapSmall.slice(0, 8).map(brief),
    overflowRoot, docSW, bodySW, spill, overflowChain: chain, wide, contentKids: kids,
    fonts: document.fonts ? document.fonts.status : "n/a",
    sw: !!navigator.serviceWorker?.controller,
  };
})()`;

async function main() {
  // 取一篇真实文章和一个真实标签（本地 D1 只有少量文章，线上数据更全）
  let slug = "", tag = "", postList = [];
  const postCount = Math.max(1, Math.min(200, Number(arg("posts", 1))));
  const postOffset = Math.max(0, Number(arg("offset", 0)));
  try {
    // 一次取全量再切片：保证 --offset 分批对应同一份稳定顺序，不必依赖服务端分页
    const res = await fetch(BASE + "/api/posts?limit=1000");
    const posts = await res.json();
    postList = (Array.isArray(posts) ? posts : []).filter((p) => p && p.slug)
      .slice(postOffset, postOffset + postCount);
    if (Array.isArray(posts) && posts.length) {
      slug = posts[0].slug || "";
      tag = (posts[0].tags || []).find?.((t) => typeof t === "string") || "";
      if (!tag) {
        const tagsRes = await fetch(BASE + "/api/tags").catch(() => null);
        if (tagsRes?.ok) {
          const ts = await tagsRes.json();
          const arr = Array.isArray(ts) ? ts : ts.tags || [];
          tag = typeof arr[0] === "string" ? arr[0] : (arr[0]?.name || "");
        }
      }
    }
  } catch (e) { console.error("[warn] 取文章列表失败: " + e.message); }

  // --slugs a,b,c 指定要巡检的文章（逗号分隔），用于复测特定内容
  const slugsArg = arg("slugs", "");
  if (slugsArg) postList = slugsArg.split(",").filter(Boolean).map((s) => ({ slug: s }));
  // 自定义 hash 路由：写成 "#/timeline,#/about"，工具补前导 /（避免 MSYS 路径转换）
  const routesArg = arg("routes", "");
  const extraRoutes = routesArg ? routesArg.split(",").filter(Boolean).map((p) => {
    let raw = p.startsWith("/") ? p : "/" + p;
    // Git Bash(MSYS) 偶尔把逗号列表的第一项 "/#/xxx" 转成 "/#C:/Program Files/..."，
    // 规整回首页并记录，避免把被污染的 URL 当成真实路由得出错误结论。
    if (/#[A-Za-z]:[\\/]/i.test(raw) || /Program Files|PortableGit/i.test(raw)) {
      console.warn("[warn] 路由参数被 MSYS 路径转换污染，已规整为首页: " + raw.slice(0, 80));
      raw = "/#/";
    }
    return { name: "路由:" + decodeURIComponent(raw).slice(0, 32), path: raw, settle: SETTLE, isRoute: true };
  }) : [];
  let cases = [
    { name: "首页", path: "/#/", settle: SETTLE },
    ...postList.map((p, i) => ({
      name: "文章页" + (postCount > 1 ? i + 1 + postOffset : ""),
      slug: p.slug,
      path: "/#/post/" + encodeURIComponent(p.slug),
      settle: SETTLE + 800,
    })),
    ...(tag ? [{ name: "标签页", path: "/#/tag/" + encodeURIComponent(tag), settle: SETTLE }] : []),
    ...extraRoutes,
    { name: "后台入口", path: "/#/admin", settle: SETTLE + 600 },
  ];
  if (has("only-posts")) cases = cases.filter((c) => c.slug);
  if (has("only-routes")) cases = extraRoutes;
  const viewports = has("mobile-only")
    ? [{ name: "mobile", w: 375, h: 812 }]
    : [{ name: "desktop", w: 1440, h: 900 }, { name: "mobile", w: 375, h: 812 }];

  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--hide-scrollbars", `--remote-debugging-port=${PORT}`,
    ...(has("insecure") ? ["--ignore-certificate-errors"] : []),
    ...(has("noproxy") ? ["--no-proxy-server"] : []),
    "--user-data-dir=" + (process.env.TEMP || "/tmp") + "/site-audit-" + Date.now(),
    "about:blank",
  ], { stdio: "ignore" });

  let ws, msgId = 0;
  const pending = new Map();
  const send = (method, params = {}) => {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      // 自定义探针（--expr-file）可能包含多次 SPA 路由切换与轮询，线上经代理时耗时较长，
      // 单独放宽 Runtime.evaluate 的超时，避免误判为失败并丢掉整批结果。
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("timeout " + method)); } },
        method === "Runtime.evaluate" ? 90000 : 30000);
    });
  };
  let bucket = { errors: [], http: [], failed: [] };
  const clearBucket = () => { bucket = { errors: [], http: [], failed: [] }; };

  const results = [];
  const writeOut = () => {
    const out = arg("out", "");
    const payload = JSON.stringify({ base: BASE, slug, tag, results }, null, 2);
    if (out) { fs.writeFileSync(out, payload, "utf8"); console.log("\n已写入 " + out); }
    else console.log("\n" + payload);
  };
  try {
    let targets = null;
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        targets = await r.json();
        if (targets?.length) break;
      } catch {}
      await sleep(250);
    }
    if (!targets?.length) throw new Error("Chrome 未就绪");
    const page = targets.find((t) => t.type === "page") || targets[0];
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails || {};
        bucket.errors.push("[exception] " + (d.exception?.description || d.text || "").split("\n").slice(0, 3).join(" | "));
      }
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
        bucket.errors.push("[console] " + (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 240));
      }
      if (m.method === "Network.responseReceived" && m.params.response?.status >= 400) {
        bucket.http.push(m.params.response.status + " " + m.params.response.url.slice(0, 160));
      }
      if (m.method === "Network.loadingFailed" && !m.params.canceled) {
        bucket.failed.push((m.params.errorText || "") + " " + (m.params.type || ""));
      }
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      }
    };
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Log.enable");

    for (const vp of viewports) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.name === "mobile",
      });
      for (const c of cases) {
        clearBucket();
        try {
          await send("Page.navigate", { url: "about:blank" });
          await sleep(120);
          await send("Page.navigate", { url: BASE + c.path });
        } catch (e) {
          // 线上经代理偶发导航卡死：记录后继续下一个 case，不丢已采集的数据
          console.warn(`[${vp.name}] ${c.name} 导航失败: ${e.message}`);
          results.push({ viewport: vp.name, page: c.name, url: c.path, slug: c.slug || "", navError: e.message });
          continue;
        }
        await sleep(c.settle);
        // 线上经代理时接口可能远慢于 settle：轮询等待 #app 真正渲染出内容，避免测到空壳
        for (let i = 0; i < 24; i++) {
          const w = await send("Runtime.evaluate", {
            expression: "(() => { const a = document.getElementById('app'); return a ? a.textContent.trim().length : -1; })()",
            returnByValue: true,
          });
          if ((w.result?.value ?? -1) >= 200) break;
          await sleep(500);
        }
        const r = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true, awaitPromise: true });
        const data = r.exceptionDetails ? { error: String(r.exceptionDetails.text) } : r.result.value;
        // 可选：--expr '<js>' 在渲染完成后额外跑一段自定义探针，结果放在 extra
        let extra;
        const exprFile = arg("expr-file", "");
        const EXPR = exprFile ? fs.readFileSync(exprFile, "utf8") : arg("expr", "");
        if (EXPR) {
          const e = await send("Runtime.evaluate", { expression: EXPR, returnByValue: true, awaitPromise: true });
          extra = e.exceptionDetails ? { error: String(e.exceptionDetails.text) } : e.result.value;
        }
        results.push({
          viewport: vp.name, page: c.name, url: c.path, slug: c.slug || "",
          probe: data, extra,
          errors: [...new Set(bucket.errors)].slice(0, 12),
          httpErrors: [...new Set(bucket.http)].slice(0, 12),
          netFailures: [...new Set(bucket.failed)].slice(0, 12),
        });
        console.log(`[${vp.name}] ${c.name}: appText=${data?.appTextLen ?? "?"} ` +
          `err=${bucket.errors.length} http4xx=${bucket.http.length} brokenImg=${data?.brokenImgs?.length ?? "?"} ` +
          `overflow=${data?.overflowRoot ?? "?"}`);
      }
    }
    writeOut();
  } catch (e) {
    console.error("失败:", e.message);
    writeOut();
    process.exitCode = 1;
  } finally {
    try { ws?.close(); } catch {}
    chrome.kill();
  }
}
main();
