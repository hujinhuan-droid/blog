// 基于 Chrome DevTools Protocol 的截图工具：可执行一段 JS 再截图，
// 用来验证「点击后才出现」的交互界面（弹层、切换状态等）。仅本地调试用。
//
// 用法：
//   node tools/cdp-shot.mjs --url http://127.0.0.1:8788/#/admin/scheduled --out shot.png
//   node tools/cdp-shot.mjs --url ... --js "document.getElementById('open-revisions').click()" --wait 1500
import { spawn } from "node:child_process";
import fs from "node:fs";

const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9400 + Math.floor(Math.random() * 400);

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const URL_ = arg("url");
const OUT = arg("out", "shot.png");
const JS = arg("js", "");
const WAIT = Number(arg("wait", 1200));
const W = Number(arg("w", 1440));
const H = Number(arg("h", 1000));

if (!URL_) {
  console.error("缺少 --url");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  return res.json();
}

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${PORT}`,
  `--window-size=${W},${H}`,
  "--user-data-dir=" + (process.env.TEMP || "/tmp") + "/cdp-shot-" + Date.now(),
  "about:blank",
], { stdio: "ignore" });

let ws;
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("timeout: " + method));
      }
    }, 60000);
  });
}

try {
  // 等 Chrome 起来
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await getJSON("/json/list");
      if (targets && targets.length) break;
    } catch {}
    await sleep(250);
  }
  if (!targets || !targets.length) throw new Error("Chrome 未就绪");

  const page = targets.find((t) => t.type === "page") || targets[0];
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const consoleLines = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails || {};
      consoleLines.push("[异常] " + (d.exception?.description || d.text || "").split("\n").slice(0, 4).join(" | "));
    }
    if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) {
      consoleLines.push("[" + m.params.type + "] " + (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
    }
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: W, height: H, deviceScaleFactor: 1, mobile: false,
  });

  await send("Page.navigate", { url: URL_ });
  // 等 SPA 首次渲染 + 接口返回（线上接口冷启动可能 1~3s，串行数个请求时更久）
  await sleep(Number(arg("settle", 3000)));

  if (JS) {
    const r = await send("Runtime.evaluate", { expression: JS, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) console.error("JS 执行出错:", JSON.stringify(r.exceptionDetails.text || r.exceptionDetails));
    if (r.result && r.result.value !== undefined) console.log("JS 返回:", JSON.stringify(r.result.value));
    await sleep(WAIT);
  }

  // 可选：真实移动鼠标到指定坐标（用于验证 :hover 伪类相关的视觉效果）
  const mouseArg = arg("mouse", "");
  if (mouseArg) {
    const [mx, my] = mouseArg.split(",").map(Number);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx, y: my, buttons: 0 });
    await sleep(700);
  }

  if (consoleLines.length) console.log("控制台:\n" + consoleLines.join("\n"));

  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("已写入 " + OUT);
} catch (e) {
  console.error("失败:", e.message);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
}
