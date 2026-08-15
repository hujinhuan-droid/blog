// 一键从 content/posts/*.md 恢复/同步文章到线上博客（D1）
// 用法：
//   node scripts/restore-posts.mjs                 # 不存在则创建，已存在则跳过
//   node scripts/restore-posts.mjs --force         # 已存在也按 md 内容更新
//   node scripts/restore-posts.mjs --base https://xxx --user admin --pass xxx
//
// 匹配策略：优先按 frontmatter 的 slug 匹配线上文章；否则按 title 匹配；都不中则新建。
// 注意：新建文章时 slug 由后端按标题自动生成（带随机后缀），与 md 文件名中的 slug 可能不同，
//       这是正常的——本工具保证“内容一致、不重复”，而非 slug 完全一致。

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BLOG_BASE || "https://hujinhuan.cc.cd";
const USER = process.env.BLOG_USER || "admin";
const PASS = process.env.BLOG_PASS || "12345678";
const POSTS_DIR = join(process.cwd(), "content", "posts");
const FORCE = process.argv.includes("--force");

// ---- 解析简单 frontmatter（key: value，值允许用引号包裹）----
function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { meta: {}, body: text };
  }
  const meta = {};
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "---") {
      i++;
      break;
    }
    const m = line.match(/^([A-Za-z_]+)\s*:\s*(.*)$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      meta[m[1]] = v;
    }
  }
  return { meta, body: lines.slice(i).join("\n").replace(/^\n+/, "").replace(/\s+$/, "") };
}

async function login() {
  const r = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!r.ok) throw new Error("登录失败: " + (await r.text()));
  const cookie = r.headers.get("set-cookie");
  if (!cookie) throw new Error("未获取到登录 cookie");
  return cookie;
}

(async () => {
  const cookie = await login();
  console.log("✓ 已登录");

  // 拉取线上现有文章，建立 slug / title -> id 映射
  const list = await fetch(BASE + "/api/posts", { headers: { cookie } }).then((r) => r.json());
  const bySlug = new Map();
  const byTitle = new Map();
  for (const p of list) {
    if (p.slug) bySlug.set(p.slug, p.id);
    if (p.title) byTitle.set(p.title.trim(), p.id);
  }
  console.log(`线上已有 ${list.length} 篇`);

  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  console.log(`本地 md 文件 ${files.length} 个\n`);

  let created = 0,
    updated = 0,
    skipped = 0,
    failed = 0;

  for (const f of files) {
    const { meta, body } = parseFrontmatter(readFileSync(join(POSTS_DIR, f), "utf8"));
    const title = (meta.title || "").trim();
    if (!title) {
      console.log(`✗ 跳过（无标题）: ${f}`);
      failed++;
      continue;
    }
    const visibility = meta.visibility === "private" ? "private" : "public";
    const payload = { title, content: body, visibility };

    const existingId = meta.slug ? bySlug.get(meta.slug) : undefined;
    const id = existingId ?? byTitle.get(title);

    if (id && !FORCE) {
      console.log(`· 已存在，跳过: ${title}`);
      skipped++;
      continue;
    }

    if (id && FORCE) {
      const r = await fetch(BASE + "/api/posts/" + id, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        console.log(`↻ 已更新: ${title}`);
        updated++;
      } else {
        console.log(`✗ 更新失败: ${title} -> ${await r.text()}`);
        failed++;
      }
      continue;
    }

    const r = await fetch(BASE + "/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      const j = await r.json();
      console.log(`+ 已创建: ${title} (slug: ${j.slug})`);
      created++;
    } else {
      console.log(`✗ 创建失败: ${title} -> ${await r.text()}`);
      failed++;
    }
  }

  console.log(`\n完成：新建 ${created} / 更新 ${updated} / 跳过 ${skipped} / 失败 ${failed}`);
})().catch((e) => {
  console.error("运行出错:", e.message);
  process.exit(1);
});
