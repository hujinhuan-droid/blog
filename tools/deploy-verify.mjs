// 授权恢复后的一键「部署 + 线上回归」。
//   node tools/deploy-verify.mjs                 检查授权 → 部署 → 线上核对 → 真机抽检
//   node tools/deploy-verify.mjs --skip-audit   跳过耗时较长的真机抽检
//
// 背景：Wrangler OAuth refresh token 被撤销后，本地部署必须由账号持有者在浏览器完成一次
// `npx wrangler login`。授权恢复后无需再手工逐项 curl，本脚本把部署与全部回归一次跑完。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = "https://hujinhuan.cc.cd";
const has = (n) => process.argv.includes("--" + n);
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " · " + detail : ""}`);
};
const run = (cmd, timeout = 600000) => {
  console.log("\n$ " + cmd);
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: "utf8", timeout });
  if (r.stdout) process.stdout.write(r.stdout.slice(-6000));
  if (r.stderr && r.status !== 0) process.stderr.write(r.stderr.slice(-2000));
  return r;
};
const get = async (p, headers = {}) => {
  const u = LIVE + p + (p.includes("?") ? "&" : "?") + "cb=" + Date.now();
  const r = await fetch(u, { headers });
  return { status: r.status, headers: r.headers, text: await r.text() };
};

async function main() {
  // 1) 授权
  const who = run("npx wrangler whoami", 180000);
  if (who.status !== 0) {
    console.error("\n授权未恢复：请先在 PowerShell 执行 `cd C:\\Users\\hujin\\blog; npx wrangler login`，");
    console.error("在浏览器中完成授权后重新运行本脚本（或 npm run deploy:verify）。");
    process.exit(2);
  }

  // 2) 部署（npm run deploy 内已包含静态资源构建）
  const dep = run("npm run deploy");
  if (dep.status !== 0) { console.error("\n部署失败，停止回归。"); process.exit(3); }
  const deployId = /Deployment ID:\s*([a-zA-Z0-9-]+)/i.exec(dep.stdout || "")?.[1] || "";
  check("npm run deploy", true, deployId ? "Deployment ID " + deployId : "已部署");

  // 3) 线上静态资源与文档核对
  const localSw = fs.readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
  const swVer = /const CACHE\s*=\s*"([^"]+)"/.exec(localSw)?.[1] || "";
  const sw = await get("/sw.js");
  check("SW 版本一致", sw.status === 200 && sw.text.includes(swVer), swVer);

  const home = await get("/");
  check("首页 property OG", home.status === 200 &&
    /property="og:title"/.test(home.text) && /property="og:image"/.test(home.text) &&
    /property="og:url"/.test(home.text));
  check("首页 canonical", /rel="canonical" href="https:\/\/hujinhuan\.cc\.cd\/"/.test(home.text));

  const css = await get("/css/style.min.css");
  check("CSS 含 CLS/溢出修复", css.status === 200 &&
    css.text.includes("calc(100dvh - 150px)") && css.text.includes("overflow-wrap:anywhere"));
  check("静态资源响应头", /max-age=/.test(css.headers.get("cache-control") || "") &&
    css.headers.get("x-content-type-options") === "nosniff");

  const feed = await get("/feed.xml");
  const sitemap = await get("/sitemap.xml");
  check("RSS / sitemap", feed.status === 200 && feed.text.includes("<rss") &&
    sitemap.status === 200 && sitemap.text.includes("<urlset"));

  // 4) 爬虫预渲染（SSR）仍完整
  let slug = "";
  try {
    const posts = await (await fetch(LIVE + "/api/posts?limit=1")).json();
    slug = Array.isArray(posts) && posts[0]?.slug ? posts[0].slug : "";
  } catch {}
  if (slug) {
    const ssr = await get("/post/" + encodeURIComponent(slug), { "User-Agent": "Googlebot" });
    check("SSR 文章页 JSON-LD", ssr.status === 200 &&
      ssr.text.includes("BlogPosting") && ssr.text.includes("BreadcrumbList"));
  }

  // 5) 真机抽检：线上前 10 篇文章 + 静态路由（默认执行，--skip-audit 可跳过）
  if (!has("skip-audit")) {
    const out = path.join(ROOT, "audit-deploy-verify.json");
    const audit = run(`node tools/site-audit.mjs --base ${LIVE} --insecure 1 --mobile-only 1 ` +
      `--only-posts 1 --posts 10 --out ${path.basename(out)}`, 600000);
    let bad = -1, total = 0;
    try {
      const d = JSON.parse(fs.readFileSync(out, "utf8"));
      total = d.results?.length || 0;
      bad = (d.results || []).filter((r) => (r.probe?.overflowRoot || 0) > 0 ||
        (r.errors || []).length || (r.httpErrors || []).length || !r.probe?.appTextLen).length;
    } catch {}
    check("线上移动端抽检", audit.status === 0 && bad === 0 && total > 0,
      `${total} 篇 / 异常 ${bad}`);
    if (fs.existsSync(out)) fs.unlinkSync(out);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n===== 汇总：${checks.length - failed.length}/${checks.length} 通过 =====`);
  for (const c of failed) console.log("  FAIL " + c.name + (c.detail ? " · " + c.detail : ""));
  console.log("结果 JSON:\n" + JSON.stringify({ live: LIVE, deployId, checks }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error("失败:", e.message); process.exit(1); });
