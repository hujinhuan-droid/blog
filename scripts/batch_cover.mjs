// 批量补 AI 封面：为 cover 为空的已发布文章生成 Workers AI 封面并回填。
// 可续跑：每次只处理当前 cover 为空的文章，已补过的不重复。
// 用法：
//   node scripts/batch_cover.mjs                 # 全部（缺封面的已发布文章）
//   node scripts/batch_cover.mjs --limit 5       # 只处理前 5 篇（试跑）
//   node scripts/batch_cover.mjs --delay 2000    # 每篇间隔 2s（限流更保守）
//   node scripts/batch_cover.mjs --dry           # 只列出待处理，不真正生成
// 密码可用环境变量 BLOG_PWD 覆盖，默认 12345678
import process from "node:process";

const BASE = "https://hujinhuan.cc.cd";
const USER = "admin";
const PASS = process.env.BLOG_PWD || "12345678";

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const LIMIT = Number(getArg("--limit", "0")) || 0;
const DELAY = Number(getArg("--delay", "1500")) || 1500;
const DRY = args.includes("--dry");

const HEALTH = ["养生","健康","中医","食疗","睡眠","气血","穴位","茶","粥","调理","祛湿","养肝","护眼","减脂","脾胃","润肺","艾灸","推拿"];
function buildPrompt(title, tags) {
  const text = `${title} ${tags}`;
  const isHealth = HEALTH.some((k) => text.includes(k));
  if (isHealth)
    return `极简扁平插画风格的中文养生健康博客封面，主题：「${title}」，相关标签：${tags}。柔和自然色调，水墨与植物元素，大量留白，无文字，适合作为文章头图。`;
  return `极简科技扁平插画风格的中文技术博客封面，主题：「${title}」，相关标签：${tags}。深蓝紫渐变与几何线条、代码与电路板元素，现代感，大量留白，无文字，适合作为文章头图。`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const sc = res.headers.get("set-cookie");
  if (!sc) throw new Error("登录失败：" + (await res.text()).slice(0, 200));
  const m = sc.match(/sid=[^;]+/);
  return m ? m[0] : sc;
}

async function main() {
  const cookie = await login();
  console.log("登录成功，开始拉取文章列表…");
  const postsRes = await fetch(`${BASE}/api/posts?summary=1&limit=1000`, { headers: { cookie } });
  const posts = await postsRes.json();
  if (!Array.isArray(posts)) throw new Error("文章列表解析失败：" + JSON.stringify(posts).slice(0, 200));
  const todo = posts.filter((p) => !p.cover && p.status === "published");
  console.log(`文章总数 ${posts.length}，待补封面 ${todo.length} 篇`);
  const list = LIMIT > 0 ? todo.slice(0, LIMIT) : todo;
  if (DRY) {
    list.slice(0, 20).forEach((p) => console.log(`  #${p.id} ${p.title}`));
    if (list.length > 20) console.log(`  …共 ${list.length} 篇`);
    return;
  }

  let ok = 0;
  const failed = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const tagsArr = (() => { try { return JSON.parse(p.tags || "[]"); } catch { return []; } })();
    const prompt = buildPrompt(p.title, tagsArr.join("、"));
    process.stdout.write(`[${i + 1}/${list.length}] #${p.id} ${p.title.slice(0, 22)} … `);
    let url = null;
    for (let attempt = 1; attempt <= 3 && !url; attempt++) {
      try {
        const r = await fetch(`${BASE}/api/ai/cover`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ title: p.title, tags: p.tags, prompt }),
        });
        const j = await r.json();
        if (j.url) url = j.url;
        else throw new Error(j.error || "no url");
      } catch (e) {
        if (attempt < 3) { await sleep(2000); } else console.log("ERR", e.message);
      }
    }
    if (!url) { failed.push(p.id); continue; }
    const up = await fetch(`${BASE}/api/posts/${p.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ cover: url }),
    });
    if (up.ok) { ok++; console.log("OK"); }
    else { failed.push(p.id); console.log("回填失败", up.status); }
    await sleep(DELAY);
  }
  console.log(`\n完成：成功 ${ok} 篇，失败 ${failed.length} 篇`);
  if (failed.length) console.log("失败 id：", failed.join(","));
}

main().catch((e) => { console.error(e); process.exit(1); });
