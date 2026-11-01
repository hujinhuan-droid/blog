// 将 .gen_covers/<postId>/ 下生成的封面 PNG 转 WebP、上传 R2、回填 post.cover。
// 可重复运行：已处理（写入 .done）的目录会跳过；只处理尚未 .done 的数字目录。
// 用法：node scripts/fill_buddy_covers.mjs [--ids 5,6,7,8,9]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";

const BASE = "https://hujinhuan.cc.cd";
const BUCKET = "ai-agent-blog-images";
const GEN = path.resolve(".gen_covers");
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;

const args = process.argv.slice(2);
const idsArg = (args.indexOf("--ids") >= 0 && args[args.indexOf("--ids") + 1]) || "";
const forceIds = idsArg ? idsArg.split(",").map((s) => s.trim()).filter(Boolean) : null;

function sharpMod() { return import("sharp"); }

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: process.env.BLOG_PWD || "12345678" }),
  });
  const sc = res.headers.get("set-cookie");
  if (!sc) throw new Error("登录失败");
  const m = sc.match(/sid=[^;]+/);
  return m ? m[0] : sc;
}

async function main() {
  if (!CF_TOKEN || !CF_ACCOUNT) throw new Error("缺少 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID");
  const dirs = fs.readdirSync(GEN).filter((d) => /^\d+$/.test(d));
  const todo = forceIds ? dirs.filter((d) => forceIds.includes(d)) : dirs.filter((d) => !fs.existsSync(path.join(GEN, d, ".done")));
  console.log(`待处理目录：${todo.length} 个 -> ${todo.join(",")}`);
  const mod = await sharpMod();
  const sharp = (mod && mod.default) ? mod.default : mod;
  const cookie = await login();
  let ok = 0, fail = 0;
  for (const id of todo) {
    const dir = path.join(GEN, id);
    const pngs = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png") && f !== "tmp_4.png");
    if (!pngs.length) { console.log(`#${id} 无 png，跳过`); continue; }
    const src = path.join(dir, pngs[0]);
    const webp = path.join(dir, "cover.webp");
    try {
      await sharp(src).webp({ quality: 82 }).toFile(webp);
    } catch (e) { console.log(`#${id} 转换失败`, e.message); fail++; continue; }
    const key = crypto.randomUUID();
    const objKey = `covers/${key}.webp`;
    try {
      execFileSync("npx", ["wrangler", "r2", "object", "put", `${BUCKET}/${objKey}`, "--file", webp, "--content-type", "image/webp"],
        { env: { ...process.env, CLOUDFLARE_API_TOKEN: CF_TOKEN, CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT }, stdio: "pipe", shell: true });
    } catch (e) { console.log(`#${id} 上传失败`, String(e.message || e).slice(0, 200)); fail++; continue; }
    const up = await fetch(`${BASE}/api/posts/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ cover: `/api/files/${objKey}` }),
    });
    if (up.ok) { fs.writeFileSync(path.join(dir, ".done"), "ok"); ok++; console.log(`#${id} OK -> /api/files/${objKey}`); }
    else { console.log(`#${id} 回填失败`, up.status); fail++; }
  }
  console.log(`\n完成：成功 ${ok}，失败 ${fail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
