// 静态资源构建：把 public/ 下的源码 CSS/JS 压缩成 *.min.css / *.min.js
//
// 约定：源码保留原路径（便于维护与 git diff），页面统一引用 .min.* 产物。
//   node tools/build-assets.mjs        # 重新生成全部产物
//   npm run assets                     # 同上
//   npm run deploy / npm run dev       # 已内置本步骤，避免部署陈旧产物
//
// 注意：public/js/icons.js 由 tools/gen-icons.mjs 生成；若重跑过 gen-icons.mjs，
//       必须随后重跑本脚本，否则 icons.min.js 会落后于源码。
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "public");

// 顺序与首屏加载顺序无关，仅用于输出报告
const FILES = [
  ["css/style.css", "css"],
  ["css/depth.css", "css"],
  ["js/icons.js", "js"],
  ["js/markdown.js", "js"],
  ["js/app.js", "js"],
  ["js/admin.js", "js"],
];

// charset: utf8 关键 —— esbuild 默认把中文转成 \uXXXX 转义序列，反而让文件变大。
// target 保持 esnext：不降级语法（可选链等原样保留），产物最小。
const OPTS = { minify: true, charset: "utf8", legalComments: "none", target: "esnext" };

const br = (buf) =>
  zlib.brotliCompressSync(buf, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
const kb = (n) => (n / 1024).toFixed(1).padStart(6) + " KB";

let rawBefore = 0, rawAfter = 0, brBefore = 0, brAfter = 0;
const rows = [];

for (const [rel, loader] of FILES) {
  const srcPath = path.join(PUB, rel);
  const src = fs.readFileSync(srcPath);
  const { code } = await transform(src.toString("utf8"), { ...OPTS, loader });
  const outBuf = Buffer.from(code, "utf8");
  const outRel = rel.replace(/\.(css|js)$/, ".min.$1");
  fs.writeFileSync(path.join(PUB, outRel), outBuf);

  const a = src.length, b = outBuf.length, ab = br(src), bb = br(outBuf);
  rawBefore += a; rawAfter += b; brBefore += ab; brAfter += bb;
  rows.push({ rel, outRel, a, b, ab, bb });
}

for (const r of rows) {
  console.log(
    `${r.rel.padEnd(20)} raw ${kb(r.a)} → ${kb(r.b)}   br ${kb(r.ab)} → ${kb(r.bb)}   -${((1 - r.bb / r.ab) * 100).toFixed(1)}%`
  );
}
console.log(
  `\n合计 (6 文件)   raw ${kb(rawBefore)} → ${kb(rawAfter)}   ` +
  `Brotli 传输 ${kb(brBefore)} → ${kb(brAfter)}   省 ${kb(brBefore - brAfter)} / ${((1 - brAfter / brBefore) * 100).toFixed(1)}%`
);

// 首屏实际下载（排除按需加载的 admin.js）
const first = rows.filter((r) => !r.rel.includes("admin.js"));
const fBefore = first.reduce((s, r) => s + r.ab, 0);
const fAfter = first.reduce((s, r) => s + r.bb, 0);
console.log(
  `首屏 (5 文件)   Brotli ${kb(fBefore)} → ${kb(fAfter)}   ` +
  `省 ${kb(fBefore - fAfter)} / ${((1 - fAfter / fBefore) * 100).toFixed(1)}%`
);
