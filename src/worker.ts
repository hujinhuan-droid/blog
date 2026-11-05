/// <reference types="@cloudflare/workers-types" />
import {
  AuthEnv,
  currentUser,
  githubAuthorizeUrl,
  exchangeGithubCode,
  passwordLogin,
  ensureAdminAccount,
  changePassword,
  startSession,
  clearSessionCookie,
  parseCookies,
  sessionCookie,
} from "./auth";
import {
  DB,
  listPosts,
  getPostBySlug,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  softDeletePost,
  restorePost,
  purgePost,
  listTrash,
  getSettings,
  setSettings,
  listComments,
  listCommentsByStatus,
  setCommentStatus,
  createComment,
  listTags,
  parseTags,
  getMeta,
  incMeta,
  getReactionCounts,
  toggleReaction,
  getTotalViews,
  logAudit,
  listAudit,
  getPopularPosts,
  getRefererStats,
  recordReferer,
  logIndexNow,
  listIndexNowLog,
} from "./db";

interface Env extends AuthEnv {
  DB: DB;
  BUCKET: R2Bucket;
  AI: any;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  GEMINI_API_KEY?: string;
  GEMINI_BASE_URL?: string;
  DEEPSEEK_API_KEY?: string;
}

// ── 站点与 IndexNow 配置 ──
const SITE_HOST = "hujinhuan.cc.cd";
const INDEXNOW_KEY = "55cd7fd5fe894eac639af63f0f305d49";

// IndexNow：文章发布/更新为公开时，主动通知 Bing/Naver/Yandex 等搜索引擎。
// 密钥文件公开放置在站点根：/${INDEXNOW_KEY}.txt（已在 public/ 中部署）。
async function submitIndexNow(env: Env, urls: string[]): Promise<void> {
  if (!urls || !urls.length || !INDEXNOW_KEY) return;
  const body = JSON.stringify({
    host: SITE_HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${SITE_HOST}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  });
  try {
    const resp = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    // 记录推送日志（收录监控）
    try {
      await logIndexNow(env.DB, urls[0], resp.status, resp.status === 200 ? "accepted" : await resp.text().catch(() => ""));
    } catch {}
  } catch (e: any) {
    // 推送失败不影响发布；可稍后通过脚本补推
    try {
      await logIndexNow(env.DB, urls[0], 0, "network error: " + (e?.message || ""));
    } catch {}
  }
}

// 发布联动 Webhook：文章发布/更新为公开时，按设置中的 webhooks 列表逐个回调（best-effort，不阻塞发布）。
async function fireWebhooks(env: Env, post: any): Promise<void> {
  let hooks: any[] = [];
  try {
    const s = await getSettings(env.DB);
    if (s.webhooks) hooks = JSON.parse(s.webhooks);
  } catch {}
  if (!Array.isArray(hooks) || !hooks.length) return;
  const payload = JSON.stringify({
    event: "post_published",
    post: { id: post.id, slug: post.slug, title: post.title, excerpt: post.excerpt, cover: post.cover, url: `https://${SITE_HOST}/post/${post.slug}` },
  });
  const targets = hooks.filter((h) => h && h.url && (!h.events || h.events.includes("publish")));
  await Promise.all(
    targets.map((h) =>
      fetch(h.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      })
        .then(() => logAudit(env.DB, { action: "webhook_fire", target: h.url, detail: "post_published ok" }))
        .catch((e: any) => logAudit(env.DB, { action: "webhook_fire", target: h.url, detail: "err: " + (e?.message || "") }))
    )
  );
}

function json(data: any, status = 200, extra: Record<string, string> = {}): Response {  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

function isAdmin(user: { role: string } | null): boolean {
  return !!user && user.role === "admin";
}

async function readJson(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// ---------------- Gemini AI ----------------
const GEMINI_MODEL = "gemini-flash-latest";

type AiAction = "optimize" | "annotate" | "moderate" | "classify" | "summarize";

const AI_PROMPTS: Record<AiAction, string> = {
  optimize:
    "你是一位专业的中文技术博客编辑。请优化下面的 Markdown 文章：让表达更清晰、结构更合理、用词更准确，保持原意与原有 Markdown 格式（标题、列表、代码块、引用等）不变。只返回优化后的全文，不要任何额外解释、前后缀或代码围栏。",
  annotate:
    "你是一位资深的中文编辑与审稿人。请针对下面的 Markdown 文章，给出面向作者的「备注 / 审稿意见」，用中文分点列出：\n1) 文章优点；\n2) 可改进之处（结构、逻辑、事实、语气、错别字等）；\n3) 具体修改建议。\n不要改写全文，只给评语与建议，使用 Markdown 格式。",
  classify:
    "你是中文内容分类助手。请根据下面的文章标题与正文，提炼 1–5 个最能概括文章主题的中文标签，要求：\n" +
    "1) 每个标签 2–6 个汉字；\n" +
    "2) 使用通用、可复用的分类词（如：睡眠、饮食、运动、情志、节气、穴位、养生常识、误区辟谣、食疗、功法）；\n" +
    "3) 覆盖文章主要主题，避免过细或重复。\n" +
    "只返回一个 JSON 数组（不要任何额外解释或代码围栏），例如 [\"睡眠\",\"情志\",\"养生常识\"]。",
  summarize:
    "你是中文内容运营助手。请为下面的文章生成用于列表展示与搜索引擎优化（SEO）的元数据，严格只返回如下 JSON（不要任何额外解释、前后缀或代码围栏）：\n" +
    "{\"excerpt\":\"80–140 字的中文摘要，概括文章核心观点，适合作为列表页简介\",\"seo_description\":\"120 字以内的 SEO 描述，自然流畅、包含核心关键词\",\"seo_keywords\":\"6–10 个中文关键词，用中文逗号分隔\"}\n" +
    "示例：{\"excerpt\":\"本文介绍...\",\"seo_description\":\"...\",\"seo_keywords\":\"睡眠, 养生, 作息\"}",
  moderate:
    "你是中文养生/健康类内容的合规审核助手。请审查下面文章，识别「违禁词 / 违规表述」，重点包括：\n" +
    "1) 夸大或绝对化疗效的词（如 治愈、根治、包治百病、百分百、保证、无副作用、最佳、第一）；\n" +
    "2) 涉及疾病治疗/诊断的违规断言（如 治疗糖尿病、降血压、抗癌、防血栓）；\n" +
    "3) 虚假或误导性承诺（如 三天见效、无效退款、永不复发、立竿见影）；\n" +
    "4) 违反广告法的极限词（国家级、独家、顶级、最有效）；\n" +
    "5) 医疗建议替代（如 不吃药、停针停药、代替医生）。\n" +
    "请用 JSON 返回，结构：{\"clean\": true/false, \"items\": [{\"word\":\"违禁词\",\"context\":\"包含该词的原文句子(最多 40 字)\",\"reason\":\"为何违规\",\"suggestion\":\"修改建议\"}]}。\n" +
    "若没有发现任何违禁词，返回 {\"clean\": true, \"items\": []}。只返回 JSON，不要任何额外解释或代码围栏。",
};

async function callGemini(
  env: Env,
  action: AiAction,
  title: string,
  content: string,
  model = GEMINI_MODEL,
  extra?: string
): Promise<string> {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error("服务端未配置 GEMINI_API_KEY，请在 Cloudflare 设置该 secret");
  const system = AI_PROMPTS[action] + (extra ? "\n\n" + extra : "");
  const userText = `标题：${title || "(无标题)"}\n\n正文：\n${content}`;
  const base = (env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const url = `${base}/v1beta/models/${model}:generateContent?key=${key}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: system + "\n\n" + userText }] }],
    generationConfig: {
      temperature: action === "optimize" ? 0.4 : action === "moderate" ? 0.2 : action === "classify" ? 0.3 : 0.6,
      maxOutputTokens: action === "optimize" ? 4096 : action === "classify" ? 256 : 2048,
    },
  });
  // 503/429 为临时高负载或限流，自动重试（指数退避），最多 3 次
  let lastErr = "Gemini 调用失败";
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    if (resp.ok) {
      const data = (await resp.json()) as any;
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p: any) => p.text || "").join("").trim();
      if (!text) throw new Error("Gemini 返回内容为空");
      try { await incMeta(env.DB, "ai_usage_count"); } catch {}
      return text;
    }
    const t = await resp.text().catch(() => "");
    // 配额型 429（"exceeded your current quota"）：重试无效，直接给出清晰中文提示，避免无意义等待
    if (resp.status === 429 && /quota/i.test(t)) {
      throw new Error(
        "Gemini API 配额已用完（HTTP 429）。当前 key 的免费额度已耗尽：请到 Google AI Studio 开启计费以提升额度，或等待每日额度重置后再试。后端地址：https://aistudio.google.com/apikey"
      );
    }
    lastErr = `Gemini API ${resp.status}: ${t.slice(0, 300)}`;
    // 503 高负载 / 限流型 429：短暂退避后自动重试（最多 3 次）
    if ((resp.status === 503 || resp.status === 429) && attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(lastErr);
  }
  throw new Error(lastErr);
}

// 从模型返回文本中稳健提取 JSON 数组（兼容代码围栏 ```json、前后多余文字、纯数组）
function extractJsonArray(text: string): string[] {
  if (!text) return [];
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    const a = JSON.parse(s);
    if (Array.isArray(a)) return a.map((x) => String(x).trim()).filter(Boolean);
  } catch {}
  return [];
}

// 用 Workers AI 生成文本向量（语义搜索 / 相关文章），返回 number[] 或 null
async function embedText(env: Env, text: string): Promise<number[] | null> {
  if (!env.AI) return null;
  try {
    const out: any = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: String(text || "").slice(0, 8000) });
    // 返回结构：{ data: [ number[] ], shape, pooling, usage }，data[0] 即为向量
    const emb: any = (out && Array.isArray(out.data) && Array.isArray(out.data[0]) && out.data[0].length)
      ? out.data[0]
      : (out && Array.isArray(out.embedding) ? out.embedding : null);
    if (Array.isArray(emb)) return emb as number[];
  } catch {}
  return null;
}

// 用 Workers AI FLUX 生成封面图，上传 R2，返回可访问 URL
async function genCoverImage(env: Env, prompt: string): Promise<string> {
  if (!env.AI) throw new Error("未配置 Workers AI 绑定（ai），无法生成配图");
  const out: any = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", { prompt: String(prompt || "").slice(0, 1000) });
  let b64 = (out && (out.image || (out.data && out.data.image))) || "";
  if (typeof b64 !== "string") b64 = "";
  if (b64.startsWith("data:")) b64 = b64.slice(b64.indexOf(",") + 1);
  if (!b64) throw new Error("图像模型未返回图片");
  const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const key = `covers/${crypto.randomUUID()}.png`;
  await env.BUCKET.put(key, binary, { httpMetadata: { contentType: "image/png" } });
  return `/api/files/${key}`;
}

// 根据标题/标签推断封面画风：养生健康类走水墨植物风，技术/编程/AI 类走科技插画风，
// 默认走中性极简插画风。避免给技术文章套上「养生」封面。
const HEALTH_KEYWORDS = ["养生", "健康", "中医", "食疗", "睡眠", "气血", "穴位", "茶", "粥", "调理", "祛湿", "养肝", "护眼", "减脂", "脾胃", "润肺", "养生茶", "艾灸", "推拿"];
function buildCoverPrompt(title: string, tags: string): string {
  const text = `${title} ${tags}`;
  const isHealth = HEALTH_KEYWORDS.some((k) => text.includes(k));
  if (isHealth) {
    return `极简扁平插画风格的中文养生健康博客封面，主题：「${title}」，相关标签：${tags}。柔和自然色调，水墨与植物元素，大量留白，无文字，适合作为文章头图。`;
  }
  return `极简科技扁平插画风格的中文技术博客封面，主题：「${title}」，相关标签：${tags}。深蓝紫渐变与几何线条、代码与电路板元素，现代感，大量留白，无文字，适合作为文章头图。`;
}

// 用 Workers AI 文本模型生成文本（写作用途，独立于 Gemini 配额）
async function callWorkersText(env: Env, system: string, userText: string): Promise<string> {
  if (!env.AI) throw new Error("未配置 Workers AI 绑定（ai），无法使用 AI 写作助手");
  const model = "@cf/meta/llama-3.1-8b-instruct-fast";
  const out: any = await env.AI.run(model, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
    max_tokens: 1200,
    temperature: 0.7,
  });
  let gen = "";
  if (typeof out === "string") gen = out;
  else if (out && out.response) gen = out.response;
  else if (out && out.result && typeof out.result.response === "string") gen = out.result.response;
  else if (out && typeof out.result === "string") gen = out.result;
  else if (out && out.text) gen = out.text;
  return (gen || "").trim();
}

// 用 DeepSeek 文本模型生成文本（聊天补全 API）。优先于 Workers AI，失败自动回退。
async function callDeepSeek(env: Env, system: string, userText: string, apiKey?: string): Promise<string> {
  const key = apiKey || env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("未配置 DEEPSEEK_API_KEY 密钥");
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
      max_tokens: 1200,
      temperature: 0.7,
      stream: false,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    let msg = `DeepSeek 调用失败 (HTTP ${resp.status})`;
    if (resp.status === 402 || /insufficient balance/i.test(t)) msg += "：账户余额不足，请到 https://platform.deepseek.com 充值后重试";
    else if (resp.status === 429) msg += "：触发限流（速率/额度），请稍后重试";
    else msg += "：" + t.slice(0, 200);
    throw new Error(msg);
  }
  const data: any = await resp.json().catch(() => ({}));
  const gen = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  return (gen || "").trim();
}

// 用 Gemini 文本模型做聊天式生成（与 callDeepSeek 同签名 system/userText），
// 供 /ai/write、/ai/translate、/ai/ask 在服务商切换为 gemini 时复用。
async function callGeminiChat(env: Env, system: string, userText: string, apiKey?: string, base?: string): Promise<string> {
  const key = apiKey || env.GEMINI_API_KEY;
  if (!key) throw new Error("服务端未配置 GEMINI_API_KEY，请在 Cloudflare 设置该 secret");
  const baseUrl = (base || env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const model = "gemini-flash-latest";
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${key}`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
  });
  const resp = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    if (resp.status === 429 && /quota/i.test(t)) {
      throw new Error("Gemini API 配额已用完（HTTP 429）。请到 Google AI Studio 开启计费或等待每日额度重置：https://aistudio.google.com/apikey");
    }
    throw new Error(`Gemini API ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data: any = await resp.json().catch(() => ({}));
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: any) => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini 返回内容为空");
  return text;
}

// 从设置/环境变量解析某服务商的 Key 列表（支持多 Key：换行或逗号分隔）。
// DB 中保存的 Key 优先，其次回退到 Cloudflare secret（环境变量），两者共存。
function resolveAiKeys(env: Env, provider: string, settings: Record<string, string>): string[] {
  const confKey = provider === "deepseek" ? "deepseek_api_key" : "gemini_api_key";
  const dbVal = (settings[confKey] || "").toString().trim();
  const dbKeys = dbVal ? dbVal.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean) : [];
  const envVal = provider === "deepseek" ? (env.DEEPSEEK_API_KEY || "") : (env.GEMINI_API_KEY || "");
  const envKeys = envVal ? envVal.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean) : [];
  return [...dbKeys, ...envKeys];
}

// 多 Key 轮询计数器（模块级，按请求递增，分散到不同 Key 上以避开单 Key 限流）
let aiKeyRR = 0;
function pickAiKey(keys: string[]): string {
  const k = keys[aiKeyRR % keys.length];
  aiKeyRR = (aiKeyRR + 1) % Math.max(keys.length, 1);
  return k;
}

// 统一文本生成入口：按后台设置 ai_provider 选择服务商（gemini / deepseek / workers 自动）。
// - 支持多 Key 共存：解析出该服务商的全部 Key 后轮询调用，单个 Key 失败自动切下一个；
// - 全部 Key 失败或未配置任何 Key 时，回退 Workers AI（最后兜底）。
// 注意：语义检索用的 embedding 仍走 Workers AI（bge），DeepSeek/Gemini 都不提供向量接口。
async function callAI(env: Env, system: string, userText: string): Promise<string> {
  let settings: Record<string, string> = {};
  try {
    settings = await getSettings(env.DB);
  } catch {}
  const provider = (settings.ai_provider || "deepseek").toString();

  if (provider === "workers") {
    return await callWorkersText(env, system, userText);
  }

  const isDs = provider === "deepseek";
  const keys = resolveAiKeys(env, provider, settings);
  const geminiBase = (settings.gemini_base_url || "").toString().trim();

  if (keys.length === 0) {
    console.error(`[AI] ${provider} 未配置任何 Key，回退 Workers AI`);
    return await callWorkersText(env, system, userText);
  }

  let lastErr = "";
  for (let i = 0; i < keys.length; i++) {
    const k = pickAiKey(keys);
    try {
      if (isDs) return await callDeepSeek(env, system, userText, k);
      return await callGeminiChat(env, system, userText, k, geminiBase);
    } catch (e: any) {
      lastErr = (e && e.message) || "未知错误";
      console.error(`[AI] ${provider} key#${i + 1}/${keys.length} 失败，尝试下一个：`, lastErr);
    }
  }
  console.error(`[AI] ${provider} 全部 Key 均失败，回退 Workers AI：`, lastErr);
  return await callWorkersText(env, system, userText);
}

// 余弦相似度
function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// 对外安全的文章卡片字段（去掉 embedding 等大字段）
function cardOf(p: any): any {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    cover: p.cover,
    tags: p.tags,
    visibility: p.visibility,
    status: p.status,
    views: p.views || 0,
    comment_count: p.comment_count || 0,
    created_at: p.created_at,
  };
}

// ---------------- SEO 预渲染（针对爬虫 / 社交抓取） ----------------
// 轻量 Markdown → HTML（服务端渲染用，对齐前端 markdown.js 的子集，供爬虫与分享卡片抓取正文）
function escHtmlS(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function inlineMdS(text: string): string {
  let s = escHtmlS(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => `<img alt="${alt}" src="${url}" />`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) => `<a href="${url}" target="_blank" rel="noopener">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return s;
}
function renderMarkdownSsr(src: string): string {
  if (!src) return "";
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let i = 0;
  let para: string[] = [];
  function flushPara() {
    if (para.length) { html += `<p>${inlineMdS(para.join(" "))}</p>\n`; para = []; }
  }
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flushPara();
      const langMatch = line.match(/^```\s*([\w+#.-]*)/);
      const lang = langMatch && langMatch[1] ? langMatch[1] : "";
      const buf: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      const cls = lang ? ` class="language-${lang}"` : "";
      html += `<pre><code${cls}>${escHtmlS(buf.join("\n"))}</code></pre>\n`;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])) {
      flushPara();
      const splitRow = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((s) => s.trim());
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      let t = '<div class="table-wrap"><table>';
      t += "<thead><tr>" + header.map((h) => `<th>${inlineMdS(h)}</th>`).join("") + "</tr></thead>";
      t += "<tbody>" + rows.map((r) => "<tr>" + r.map((c) => `<td>${inlineMdS(c)}</td>`).join("") + "</tr>").join("") + "</tbody>";
      t += "</table></div>\n";
      html += t; continue;
    }
    if (/^\[TOC\]$/i.test(line.trim())) { flushPara(); i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushPara(); const level = h[1].length; html += `<h${level}>${inlineMdS(h[2])}</h${level}>\n`; i++; continue; }
    if (/^---+$/.test(line.trim())) { flushPara(); html += "<hr/>\n"; i++; continue; }
    if (/^>\s?/.test(line)) {
      flushPara(); const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      html += `<blockquote>${inlineMdS(buf.join(" "))}</blockquote>\n`; continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara(); const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(`<li>${inlineMdS(lines[i].replace(/^[-*]\s+/, ""))}</li>`); i++; }
      html += `<ul>${items.join("")}</ul>\n`; continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flushPara(); const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(`<li>${inlineMdS(lines[i].replace(/^\d+\.\s+/, ""))}</li>`); i++; }
      html += `<ol>${items.join("")}</ol>\n`; continue;
    }
    if (line.trim() === "") { flushPara(); i++; continue; }
    para.push(line.trim()); i++;
  }
  flushPara();
  return html;
}

// 判断请求是否来自爬虫 / 社交抓取（需要服务端预渲染，而非纯客户端 SPA）
function isCrawler(ua: string): boolean {
  const s = (ua || "").toLowerCase();
  return /(bot|spider|crawl|slurp|baiduspider|googlebot|bingbot|yandex|sogou|360spider|bytespider|duckduckbot|teoma|facebookexternalhit|twitterbot|discordbot|whatsapp|telegrambot|pinterest|linkedinbot|embedly|quora link|showyoubot|outbrain|pocket|slackbot|vkshare|w3c_validator|redditbot|applebot|semrush|ahrefs|mj12|dotbot|dataprovider|netcraft|rogerbot|developers\.google\.com)/.test(s);
}

// 根据 settings.cache_ttl 生成 Cache-Control：0 或空 → no-store；>0 → public, max-age=秒
function cacheControlHeader(settings: Record<string, string>): string {
  const ttl = parseInt(settings.cache_ttl || "", 10);
  if (Number.isFinite(ttl) && ttl > 0) return `public, max-age=${ttl}`;
  return "no-store";
}

// 解析「每行 标签|URL」格式，过滤非法协议
function parseLinkLines(raw: string | undefined): { label: string; url: string }[] {
  return String(raw || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("|");
      if (i < 0) return null;
      const label = l.slice(0, i).trim();
      const url = l.slice(i + 1).trim();
      if (!label || !url || !/^(https?:\/\/|mailto:|\/|#)/i.test(url)) return null;
      return { label, url };
    })
    .filter(Boolean) as { label: string; url: string }[];
}

// 生成品牌/合规 HTML（Logo + 社交链接 + 备案号 + 隐私政策/友链），供预渲染页复用
function brandingHtml(settings: Record<string, string>, siteTitle: string): { brand: string; footer: string } {
  const logo = String(settings.site_logo || "").trim();
  const brand = logo
    ? `<img src="${escHtmlS(logo)}" alt="" class="brand-logo" /><span>${escHtmlS(siteTitle)}</span>`
    : escHtmlS(siteTitle);
  const parts: string[] = [];
  const social = parseLinkLines(settings.social_links);
  if (social.length) {
    parts.push(`<div class="branding-row social-links">${social.map((x) => `<a class="social-link" href="${escHtmlS(x.url)}" target="_blank" rel="noopener">${escHtmlS(x.label)}</a>`).join("")}</div>`);
  }
  const legal: string[] = [];
  const privacy = String(settings.privacy_url || "").trim();
  if (privacy && /^(https?:\/\/|\/|#)/i.test(privacy)) {
    legal.push(`<a href="${escHtmlS(privacy)}" target="_blank" rel="noopener">隐私政策</a>`);
  }
  const friends = parseLinkLines(settings.friend_links);
  if (friends.length) {
    legal.push(`<span class="friend-links">友链：${friends.map((x) => `<a href="${escHtmlS(x.url)}" target="_blank" rel="noopener">${escHtmlS(x.label)}</a>`).join(" · ")}</span>`);
  }
  const icp = String(settings.beian_icp || "").trim();
  if (icp) legal.push(`<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">${escHtmlS(icp)}</a>`);
  const gongan = String(settings.beian_gongan || "").trim();
  if (gongan) legal.push(`<a href="https://www.beian.gov.cn/" target="_blank" rel="noopener">${escHtmlS(gongan)}</a>`);
  if (legal.length) parts.push(`<div class="branding-row legal-links">${legal.join(" · ")}</div>`);
  return { brand, footer: parts.length ? `<div class="site-branding">${parts.join("")}</div>` : "" };
}

function fmtDateS(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 通用 HTML 文档骨架（含站点级 OG / Twitter / 样式，供预渲染页复用）
function htmlDoc(opts: { title: string; description: string; head: string; body: string; base: string; image?: string; customCss?: string; brand?: string; footerExtra?: string }): string {
  const { title, description, head, body } = opts;
  const ogImage = opts.image
    ? `<meta property="og:image" content="${escHtmlS(opts.image)}" />
<meta name="twitter:image" content="${escHtmlS(opts.image)}" />`
    : "";
  const customCss = opts.customCss
    ? `<style data-custom-css>\n${opts.customCss}\n</style>`
    : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtmlS(title)}</title>
<meta name="description" content="${escHtmlS(description)}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escHtmlS(title)}" />
<meta property="og:description" content="${escHtmlS(description)}" />
<meta property="og:url" content="${escHtmlS(opts.base + "/")}" />
<meta property="og:site_name" content="${escHtmlS(title)}" />
${ogImage}
<meta name="twitter:card" content="summary_large_image" />
<link rel="stylesheet" href="/css/style.css" />
${customCss}
${head}
</head>
<body>
<header class="topbar"><div class="wrap"><a class="brand" href="/">${opts.brand || escHtmlS(title)}</a></div></header>
<main class="container">
${body}
</main>
<footer class="footer"><div class="wrap"><div class="copyright">© ${escHtmlS(title)} · Powered by Cloudflare</div>${opts.footerExtra || ""}</div></footer>
</body>
</html>`;
}

// 维护模式页面（公开访客可见；含内嵌管理员登录框，保证站长仍能进入后台）
function maintenancePage(settings: Record<string, string>, base: string): string {
  const title = settings.site_title || "AI Agent 博客";
  const text = settings.maintenance_text || "网站正在维护中，请稍后再访问。";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>维护中 - ${escHtmlS(title)}</title>
<meta name="robots" content="noindex" />
<style data-custom-css>
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.main-box{max-width:420px;width:90%;background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.main-box h1{margin:0 0 8px;font-size:22px}
.main-box p{color:#94a3b8;margin:0 0 24px;line-height:1.6}
.login{display:none;margin-top:8px;text-align:left}
.login input{width:100%;box-sizing:border-box;margin:6px 0;padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0}
.login button{width:100%;margin-top:8px;padding:10px;border:0;border-radius:8px;background:#3b82f6;color:#fff;cursor:pointer;font-size:14px}
.toggle{margin-top:18px;font-size:13px;color:#64748b;cursor:pointer;text-decoration:underline}
#msg{margin-top:10px;font-size:13px;min-height:18px}
</style>
</head>
<body>
<div class="main-box">
  <h1>🛠️ 维护中</h1>
  <p>${escHtmlS(text)}</p>
  <div class="toggle" id="toggle">管理员登录</div>
  <div class="login" id="login">
    <input id="u" placeholder="用户名" autocomplete="username" />
    <input id="p" type="password" placeholder="密码" autocomplete="current-password" />
    <button id="go">登录</button>
    <div id="msg"></div>
  </div>
</div>
<script>
document.getElementById('toggle').onclick=function(){var l=document.getElementById('login');l.style.display=l.style.display==='block'?'none':'block';};
document.getElementById('go').onclick=async function(){
  var u=document.getElementById('u').value.trim(),p=document.getElementById('p').value,m=document.getElementById('msg');
  if(!u||!p){m.style.color='#f87171';m.textContent='请输入用户名和密码';return;}
  m.style.color='#94a3b8';m.textContent='登录中…';
  try{
    var r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    var d=await r.json().catch(function(){return{};});
    if(r.ok){m.style.color='#4ade80';m.textContent='登录成功，正在刷新…';setTimeout(function(){location.reload();},600);}
    else{m.style.color='#f87171';m.textContent=d.error||'登录失败';}
  }catch(e){m.style.color='#f87171';m.textContent='网络错误';}
};
</script>
</body>
</html>`;
}

async function prerenderHome(env: Env, req: Request): Promise<Response> {
  let settings: Record<string, string> = {};
  try { settings = await getSettings(env.DB); } catch {}
  const base = (env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const title = settings.seo_title || settings.site_title || "AI Agent 博客";
  const description = settings.seo_description || settings.about_content || "记录 AI Agent 的探索、实践与思考";
  const posts = await listPosts(env.DB, { admin: false });
  const tagSet = new Set<string>();
  for (const p of posts) (parseTags(p.tags) as string[]).forEach((t) => t && tagSet.add(t));
  const days = posts.length
    ? Math.max(1, Math.floor((Date.now() - Math.min(...posts.map((p) => p.created_at))) / 86400000) + 1)
    : 1;
  const cards = posts
    .slice(0, 20)
    .map((p) => `<article class="post-card">
  <div class="post-card-head"><div class="post-head-body">
    <h2><a href="/post/${encodeURIComponent(p.slug)}">${escHtmlS(p.title)}</a></h2>
    <div class="post-submeta"><span class="post-date">${fmtDateS(p.created_at)}</span></div>
  </div></div>
  <div class="excerpt">${escHtmlS(p.excerpt || "")}</div>
</article>`)
    .join("\n");
  const head = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: title,
    url: base + "/",
    description,
  })}</script>`;
  const body = `<section class="hero"><div class="hero-inner">
  <p class="hero-eyebrow">欢迎来到</p>
  <h1 class="hero-title">${escHtmlS(title)}</h1>
  <p class="hero-sub">${escHtmlS(description)}</p>
  <div class="hero-stats"><span><b>${posts.length}</b> 篇文章</span> · <span><b>${tagSet.size}</b> 个标签</span> · <span><b>${days}</b> 天运行</span></div>
</div></section>
<div class="post-list">${cards}</div>`;
  const branding = brandingHtml(settings, settings.site_title || "AI Agent 博客");
  return new Response(htmlDoc({ title, description, head, body, base, image: base + "/og-default.png", customCss: settings.custom_css, brand: branding.brand, footerExtra: branding.footer }), {
    headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": cacheControlHeader(settings) },
  });
}

async function prerenderPost(env: Env, slug: string, req: Request): Promise<Response> {
  let settings: Record<string, string> = {};
  try { settings = await getSettings(env.DB); } catch {}
  const base = (env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const row = await getPostBySlug(env.DB, slug, { admin: false });
  if (!row) {
    return new Response(
      `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><title>页面不存在</title><meta name="robots" content="noindex"/></head><body><main class="container"><h1>页面不存在</h1><p><a href="/">返回首页</a></p></main></body></html>`,
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
  const siteTitle = settings.site_title || "AI Agent 博客";
  const title = `${row.title} - ${siteTitle}`;
  const description = (row.excerpt || "").slice(0, 200) || siteTitle;
  const content = renderMarkdownSsr(row.content || "");
  const cover = row.cover || (base + "/og-default.png");
  const head = `<meta property="og:type" content="article" />
<meta property="og:title" content="${escHtmlS(row.title)}" />
<meta property="og:description" content="${escHtmlS(description)}" />
<meta property="og:url" content="${escHtmlS(base + "/post/" + encodeURIComponent(row.slug))}" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: row.title,
    description,
    datePublished: new Date(row.created_at).toISOString(),
    dateModified: new Date(row.updated_at).toISOString(),
    image: cover,
    author: { "@type": "Person", name: "hujinhuan-droid" },
    publisher: { "@type": "Organization", name: siteTitle },
    mainEntityOfPage: base + "/post/" + encodeURIComponent(row.slug),
  })}</script>`;
  const body = `<div class="post-detail">
  <h1>${escHtmlS(row.title)}</h1>
  <div class="meta">${fmtDateS(row.created_at)}</div>
  <div class="content">${content}</div>
</div>`;
  const branding = brandingHtml(settings, siteTitle);
  return new Response(htmlDoc({ title, description, head, body, base, image: cover, customCss: settings.custom_css, brand: branding.brand, footerExtra: branding.footer }), {
    headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": cacheControlHeader(settings) },
  });
}

function robotsTxt(req: Request): Response {
  const base = (req.url ? new URL(req.url).origin : "").replace(/\/$/, "");
  const txt = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nSitemap: ${base}/sitemap.xml\n`;
  return new Response(txt, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

// ---------------- 路由 ----------------

function escXml(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// RSS Feed（公开）：最近 50 篇公开文章
async function handleFeed(env: Env, req: Request): Promise<Response> {
  let settings: Record<string, string> = {};
  try { settings = await getSettings(env.DB); } catch {}
  const posts = await listPosts(env.DB, { admin: false });
  const base = (env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  // RSS 配置（设置页 ⑪）：标题默认站点名；条目数默认 50；rss_full=1 时输出全文而非摘要
  const feedTitle = settings.rss_title || settings.site_title || "AI Agent Blog";
  const feedDesc = settings.seo_description || settings.about_content || "AI Agent 博客";
  const count = Math.max(1, Math.min(200, parseInt(settings.rss_count || "", 10) || 50));
  const full = settings.rss_full === "1";
  const items = posts
    .slice(0, count)
    .map((p: any) => {
      const link = `${base}/post/${encodeURIComponent(p.slug)}`;
      const excerpt = (p.excerpt || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const body = (p.content || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const desc = full ? body : excerpt;
      return `    <item>
      <title>${escXml(p.title)}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <pubDate>${new Date(p.created_at).toUTCString()}</pubDate>
      <description>${desc}</description>
    </item>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escXml(feedTitle)}</title>
    <link>${base}/</link>
    <description>${escXml(feedDesc)}</description>
    <language>zh-CN</language>
${items}
  </channel>
</rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}

// 站点地图（公开）
async function handleSitemap(env: Env, req: Request): Promise<Response> {
  const posts = await listPosts(env.DB, { admin: false });
  const base = (env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const urls = posts
    .map((p: any) => `  <url><loc>${base}/post/${encodeURIComponent(p.slug)}</loc><lastmod>${new Date(p.updated_at).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
  <url><loc>${base}/</loc></url>
</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
}

async function handleApi(req: Request, env: Env, path: string[], method: string): Promise<Response> {
  const user = await currentUser(req, env);
  const seg = path; // ['api', ...]

  // 健康检查
  if (method === "GET" && seg.length === 2 && seg[1] === "health") {
    return json({ ok: true });
  }

  // 站点设置（公开读取，供读者端渲染）
  if (method === "GET" && seg.length === 2 && seg[1] === "settings") {
    return json(await getSettings(env.DB));
  }

  // 标签云（公开读取；管理员可见全部文章标签，读者仅公开）
  if (method === "GET" && seg.length === 2 && seg[1] === "tags") {
    return json(await listTags(env.DB, { admin: isAdmin(user) }));
  }

  // 站点设置（管理员写入，白名单校验）
  if (method === "PUT" && seg.length === 2 && seg[1] === "settings") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "无效数据" }, 400);
    }
    const clean: Record<string, string> = {};
    for (const k of [
      "site_title",
      "site_subtitle",
      "footer_text",
      "nav",
      "theme_primary",
      "theme_preset",
      "theme_dark",
      "ai_model",
      "ai_provider",
      "ai_enabled",
      "deepseek_api_key",
      "gemini_api_key",
      "gemini_base_url",
      "about_content",
      "comments_enabled",
      "posts_per_page",
      "seo_title",
      "seo_description",
      "seo_keywords",
      "moderation_enabled",
      "banned_words",
      "custom_css",
      "maintenance_mode",
      "maintenance_text",
      "rss_title",
      "rss_count",
      "rss_full",
      "cache_ttl",
      "session_ttl",
      "site_logo",
      "social_links",
      "beian_icp",
      "beian_gongan",
      "privacy_url",
      "friend_links",
      "login_lock_enabled",
      "login_max_attempts",
      "login_lock_minutes",
    ]) {
      if (body[k] !== undefined && body[k] !== null) clean[k] = String(body[k]);
    }
    await setSettings(env.DB, clean);
    await logAudit(env.DB, { actor: user ? user.username : "admin", action: "settings_update", target: Object.keys(clean).join(",") });
    return json({ ok: true });
  }

  // 文章列表
  if (method === "GET" && seg.length === 2 && seg[1] === "posts") {
    const url = new URL(req.url);
    const visibility = url.searchParams.get("visibility") || undefined;
    const trash = url.searchParams.get("trash") === "1";
    // 回收站列表仅管理员可见，防止软删除文章被匿名枚举
    if (trash && !isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const rows = await listPosts(env.DB, { admin: isAdmin(user), visibility, trash });
    // summary=1：只返回卡片字段（剔除 content / embedding 等大字段），列表首屏流量下降 90%+
    if (url.searchParams.has("summary")) {
      return json(rows.map(cardOf));
    }
    return json(rows);
  }

  // 文章详情（按 slug）
  if (method === "GET" && seg.length === 3 && seg[1] === "posts") {
    // Cloudflare Workers 的 url.pathname 不会自动对百分号编码的段解码，
    // 中文 slug 经 encodeURIComponent 后是 %E5%...，需在此 decode 才能匹配库里的中文 slug
    const slug = decodeURIComponent(seg[2]);
    const row = await getPostBySlug(env.DB, slug, { admin: isAdmin(user) });
    return row ? json(row) : json({ error: "文章不存在" }, 404);
  }

  // 新建文章（管理员）
  if (method === "POST" && seg.length === 2 && seg[1] === "posts") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    if (!body.title) return json({ error: "标题不能为空" }, 400);
    const emb = await embedText(env, (body.title || "") + "\n" + (body.content || ""));
    const row = await createPost(env.DB, {
      title: body.title,
      content: body.content || "",
      excerpt: body.excerpt,
      cover: body.cover,
      visibility: body.visibility,
      status: body.status,
      scheduled_at: body.scheduled_at ?? null,
      author_id: user!.id,
      tags: body.tags,
      embedding: emb || undefined,
    });
    if ((body.status || "draft") === "published" && (row as any)?.slug) {
      await submitIndexNow(env, [`https://${SITE_HOST}/post/${(row as any).slug}`]);
      await fireWebhooks(env, row);
    }
    await logAudit(env.DB, { actor: user!.username, action: "post_create", target: `#${(row as any).id} ${(row as any).title}`, detail: body.status || "draft" });
    return json(row, 201);
  }

  // 更新 / 删除（管理员，按 id）
  if (seg.length === 3 && seg[1] === "posts") {
    const id = Number(seg[2]);
    if (!Number.isInteger(id)) return json({ error: "无效 id" }, 400);
    if (method === "PUT") {
      if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
      const body = await readJson(req);
      const existing = await getPostById(env.DB, id, { admin: true });
      if (!existing) return json({ error: "文章不存在" }, 404);
      const emb = await embedText(env, (body.title ?? existing.title) + "\n" + (body.content ?? existing.content));
      const row = await updatePost(env.DB, id, {
        title: body.title,
        content: body.content,
        excerpt: body.excerpt,
        cover: body.cover,
        visibility: body.visibility,
        status: body.status,
        scheduled_at: body.scheduled_at ?? null,
        ai_notes: body.ai_notes,
        tags: body.tags,
        embedding: emb || undefined,
      });
      if (row && row.status === "published") {
        await submitIndexNow(env, [`https://${SITE_HOST}/post/${row.slug}`]);
        await fireWebhooks(env, row);
      }
      await logAudit(env.DB, { actor: user!.username, action: "post_update", target: `#${id} ${row?.title || ""}` });
      return row ? json(row) : json({ error: "文章不存在" }, 404);
    }
    if (method === "DELETE") {
      if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
      const existing = await getPostById(env.DB, id, { admin: true });
      if (!existing) return json({ error: "文章不存在" }, 404);
      const ok = await softDeletePost(env.DB, id);
      await logAudit(env.DB, { actor: user!.username, action: "post_delete", target: `#${id} ${existing.title}`, detail: "移入回收站" });
      return ok ? json({ ok: true }) : json({ error: "文章不存在" }, 404);
    }
  }

  // 回收站：恢复 / 彻底删除（管理员，路径式）
  if (seg.length === 4 && seg[1] === "posts") {
    const id = Number(seg[2]);
    if (!Number.isInteger(id)) return json({ error: "无效 id" }, 400);
    if (seg[3] === "restore" && method === "POST") {
      if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
      const existing = await getPostById(env.DB, id, { admin: true, trash: true });
      if (!existing) return json({ error: "文章不存在" }, 404);
      await restorePost(env.DB, id);
      await logAudit(env.DB, { actor: user!.username, action: "post_restore", target: `#${id} ${existing.title}` });
      return json({ ok: true });
    }
    if (seg[3] === "purge" && method === "DELETE") {
      if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
      const existing = await getPostById(env.DB, id, { admin: true, trash: true });
      if (!existing) return json({ error: "文章不存在" }, 404);
      await purgePost(env.DB, id);
      await logAudit(env.DB, { actor: user!.username, action: "post_purge", target: `#${id} ${existing.title}` });
      return json({ ok: true });
    }
  }

  // 文章批量操作（管理员）：delete(进回收站) / publish / draft / private / purge(彻底删)
  if (method === "POST" && seg.length === 3 && seg[1] === "posts" && seg[2] === "bulk") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    const ids = Array.isArray(body.ids) ? body.ids.map((x: any) => Number(x)).filter((x: number) => x) : [];
    const action = body.action;
    if (!ids.length || !["delete", "publish", "draft", "private", "purge"].includes(action)) {
      return json({ error: "参数无效" }, 400);
    }
    let n = 0;
    for (const id of ids) {
      const ex = await getPostById(env.DB, id, { admin: true });
      if (!ex) continue;
      if (action === "delete") {
        if (await softDeletePost(env.DB, id)) n++;
      } else if (action === "purge") {
        if (await purgePost(env.DB, id)) n++;
      } else {
        const newStatus = action === "publish" ? "published" : action === "draft" ? "draft" : "private";
        const vis = action === "private" ? "private" : ex.visibility;
        const row = await updatePost(env.DB, id, { status: newStatus, visibility: vis });
        if (row) {
          n++;
          if (row.status === "published") {
            await submitIndexNow(env, [`https://${SITE_HOST}/post/${row.slug}`]);
            await fireWebhooks(env, row);
          }
        }
      }
    }
    await logAudit(env.DB, { actor: user!.username, action: "post_bulk", target: action, detail: `${n} 篇` });
    return json({ ok: true, count: n });
  }

  // 鉴权：登录入口（GET = GitHub 跳转；POST = 密码登录）
  if (method === "GET" && seg.length === 3 && seg[1] === "auth" && seg[2] === "login") {
    const url = githubAuthorizeUrl(env);
    if (!url) return json({ error: "未配置 GitHub OAuth，请使用密码登录" }, 400);
    return new Response(null, { status: 302, headers: { location: url } });
  }

  if (method === "POST" && seg.length === 3 && seg[1] === "auth" && seg[2] === "login") {
    const body = await readJson(req);
    // 账号密码登录（主路径）
    if (body.username && body.password) {
      await ensureAdminAccount(env);
      // —— 登录失败锁定（可配置，默认关闭；表缺失时安全降级为不锁定） ——
      let lockOn = false, maxAttempts = 5, lockMinutes = 15, key = "";
      try {
        const ls = await getSettings(env.DB);
        lockOn = ls.login_lock_enabled === "1";
        maxAttempts = Math.max(1, parseInt(ls.login_max_attempts || "", 10) || 5);
        lockMinutes = Math.max(1, parseInt(ls.login_lock_minutes || "", 10) || 15);
      } catch {}
      if (lockOn) {
        try {
          const ip = req.headers.get("CF-Connecting-IP") || "unknown";
          key = ip + ":" + String(body.username || "").trim().slice(0, 64);
          const rec = (await env.DB.prepare("SELECT attempts, locked_until FROM login_attempts WHERE key = ?").bind(key).first()) as { attempts: number; locked_until: number | null } | null;
          if (rec?.locked_until && rec.locked_until > Date.now()) {
            return json({ error: `尝试次数过多，请 ${Math.ceil((rec.locked_until - Date.now()) / 60000)} 分钟后再试` }, 429);
          }
        } catch {}
      }
      const u = await passwordLogin(env, body.username, body.password);
      if (!u) {
        if (lockOn && key) {
          try {
            const rec = (await env.DB.prepare("SELECT attempts, locked_until FROM login_attempts WHERE key = ?").bind(key).first()) as { attempts: number; locked_until: number | null } | null;
            const attempts = rec && (!rec.locked_until || rec.locked_until <= Date.now()) ? (rec.attempts || 0) + 1 : 1;
            await env.DB.prepare("INSERT INTO login_attempts (key, attempts, locked_until) VALUES (?, ?, NULL) ON CONFLICT(key) DO UPDATE SET attempts = excluded.attempts, locked_until = NULL").bind(key, attempts).run();
            if (attempts >= maxAttempts) {
              await env.DB.prepare("UPDATE login_attempts SET locked_until = ? WHERE key = ?").bind(Date.now() + lockMinutes * 60000, key).run();
              return json({ error: `密码错误次数过多，已锁定 ${lockMinutes} 分钟` }, 429);
            }
            return json({ error: `账号或密码错误（还可尝试 ${maxAttempts - attempts} 次）` }, 401);
          } catch {}
        }
        return json({ error: "账号或密码错误" }, 401);
      }
      if (lockOn && key) {
        try { await env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run(); } catch {}
      }
      const s = await startSession(env, u);
      await logAudit(env.DB, { actor: u.username, action: "login", target: "password" });
      return json({ user: s.user }, 200, { "set-cookie": s.cookie });
    }
    // GitHub OAuth 跳转（兜底）
    const url = githubAuthorizeUrl(env);
    if (!url) return json({ error: "未配置 GitHub OAuth，请使用账号密码登录" }, 400);
    return new Response(null, { status: 302, headers: { location: url } });
  }

  // GitHub OAuth 回调
  if (method === "GET" && seg.length === 3 && seg[1] === "auth" && seg[2] === "callback") {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    if (!code) return json({ error: "缺少 code" }, 400);
    try {
      const u = await exchangeGithubCode(code, env);
      const s = await startSession(env, u);
      return new Response(null, {
        status: 302,
        headers: { location: "/#/admin", "set-cookie": s.cookie },
      });
    } catch (e: any) {
      return json({ error: e.message || "GitHub 登录失败" }, 400);
    }
  }

  // 当前用户
  if (method === "GET" && seg.length === 3 && seg[1] === "auth" && seg[2] === "me") {
    return json({ user: user ? { id: user.id, username: user.username, avatar: user.avatar, role: user.role } : null });
  }

  // 登出
  if (method === "POST" && seg.length === 3 && seg[1] === "auth" && seg[2] === "logout") {
    const token = parseCookies(req)["sid"];
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  }

  // 修改密码（需管理员登录）
  if (method === "POST" && seg.length === 3 && seg[1] === "auth" && seg[2] === "change-password") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    const res = await changePassword(env, user!.id, body.current_password || "", body.new_password || "");
    if (res === "wrong") return json({ error: "当前密码不正确" }, 400);
    if (res === "weak") return json({ error: "新密码至少 6 位" }, 400);
    await logAudit(env.DB, { actor: user!.username, action: "change_password" });
    return json({ ok: true });
  }

  // 图片上传（管理员）→ R2，返回可访问路径
  if (method === "POST" && seg.length === 2 && seg[1] === "upload") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    if (!body.data || !body.name) return json({ error: "缺少数据" }, 400);
    const key = `images/${Date.now()}-${body.name.replace(/[^\w.\-]/g, "_")}`;
    const binary = Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0));
    await env.BUCKET.put(key, binary, { httpMetadata: { contentType: body.type || "image/png" } });
    return json({ url: `/api/files/${key}` }, 201);
  }

  // GEMINI AI：优化 / 备注 / 违禁词检测（管理员）
  if (method === "POST" && seg.length === 3 && seg[1] === "ai" && seg[2] === "process") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    const action: AiAction =
      body.action === "annotate"
        ? "annotate"
        : body.action === "moderate"
        ? "moderate"
        : body.action === "classify"
        ? "classify"
        : body.action === "summarize"
        ? "summarize"
        : "optimize";
    const title = (body.title || "").toString();
    const content = (body.content || "").toString();
    const model = (body.model || GEMINI_MODEL).toString();
    if (!content.trim()) return json({ error: "正文不能为空" }, 400);
    // 违禁词检测：把作者在「健康管理」里自定义的排查词作为额外指令注入
    let extra: string | undefined;
    if (action === "moderate") {
      const settings = await getSettings(env.DB);
      if (settings.banned_words && settings.banned_words.trim()) {
        extra = `作者自定义重点排查词（出现即标注）：\n${settings.banned_words.trim()}`;
      }
    }
    try {
      const result = await callGemini(env, action, title, content, model, extra);
      // 分类：解析模型返回的 JSON 数组，直接返回标签列表
      if (action === "classify") {
        const tags = extractJsonArray(result);
        if (!tags.length) return json({ error: "AI 未返回有效标签" }, 502);
        return json({ tags });
      }
      // 摘要/SEO：解析模型返回的 JSON，返回 excerpt / seo_description / seo_keywords
      if (action === "summarize") {
        let data: any = null;
        try { data = JSON.parse(result); } catch {}
        if (data && data.excerpt) {
          return json({ excerpt: data.excerpt, seo_description: data.seo_description || "", seo_keywords: data.seo_keywords || "" });
        }
        return json({ excerpt: result, seo_description: "", seo_keywords: "" });
      }
      return json({ result });
    } catch (e: any) {
      return json({ error: e.message || "AI 调用失败" }, 502);
    }
  }

  // 批量 AI 备注（管理员）：对多篇文章依次生成 AI 备注并写库，避免前端串行多次调用
  if (method === "POST" && seg.length === 3 && seg[1] === "ai" && seg[2] === "batch-notes") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    const ids: number[] = Array.isArray(body.ids)
      ? body.ids.map((x: any) => Number(x)).filter((x: number) => Number.isInteger(x) && x > 0)
      : [];
    if (!ids.length) return json({ error: "未选择文章" }, 400);
    if (ids.length > 30) return json({ error: "单次最多处理 30 篇" }, 400);
    const settings = await getSettings(env.DB);
    const model = (settings.ai_model || GEMINI_MODEL).toString();
    const results: any[] = [];
    for (const id of ids) {
      const post = await getPostById(env.DB, id, { admin: true });
      if (!post) {
        results.push({ id, ok: false, error: "文章不存在" });
        continue;
      }
      if (!post.content || !post.content.trim()) {
        results.push({ id, ok: false, error: "正文为空" });
        continue;
      }
      try {
        const notes = await callGemini(env, "annotate", post.title, post.content, model);
        await updatePost(env.DB, id, { ai_notes: notes });
        results.push({ id, ok: true, title: post.title });
      } catch (e: any) {
        results.push({ id, ok: false, error: e.message || "AI 调用失败" });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    return json({ ok: okCount, total: results.length, results });
  }

  // 批量 AI 分类（管理员）：对多篇文章依次生成标签并写库，避免前端串行多次调用
  if (method === "POST" && seg.length === 3 && seg[1] === "ai" && seg[2] === "batch-tags") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    const ids: number[] = Array.isArray(body.ids)
      ? body.ids.map((x: any) => Number(x)).filter((x: number) => Number.isInteger(x) && x > 0)
      : [];
    if (!ids.length) return json({ error: "未选择文章" }, 400);
    if (ids.length > 30) return json({ error: "单次最多处理 30 篇" }, 400);
    const settings = await getSettings(env.DB);
    const model = (settings.ai_model || GEMINI_MODEL).toString();
    const results: any[] = [];
    for (const id of ids) {
      const post = await getPostById(env.DB, id, { admin: true });
      if (!post) {
        results.push({ id, ok: false, error: "文章不存在" });
        continue;
      }
      if (!post.content || !post.content.trim()) {
        results.push({ id, ok: false, error: "正文为空" });
        continue;
      }
      try {
        const raw = await callGemini(env, "classify", post.title, post.content, model);
        const tags = extractJsonArray(raw);
        if (!tags.length) {
          results.push({ id, ok: false, error: "AI 未返回有效标签" });
          continue;
        }
        await updatePost(env.DB, id, { tags: JSON.stringify(tags) });
        results.push({ id, ok: true, title: post.title, tags });
      } catch (e: any) {
        results.push({ id, ok: false, error: e.message || "AI 调用失败" });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    return json({ ok: okCount, total: results.length, results });
  }

  // 单篇 AI 配图（管理员）：Workers AI FLUX 生成封面 → R2 → 返回 URL
  if (method === "POST" && seg.length === 3 && seg[1] === "ai" && seg[2] === "cover") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    const title = (body.title || "").toString();
    const tags = Array.isArray(body.tags) ? body.tags.join("、") : (body.tags || "").toString();
    const prompt =
      (body.prompt && body.prompt.trim()) ||
      buildCoverPrompt(title, tags);
    try {
      const url = await genCoverImage(env, prompt);
      return json({ url });
    } catch (e: any) {
      return json({ error: e.message || "配图生成失败" }, 502);
    }
  }

  // AI 写作助手（管理员）：用 Workers AI 文本模型做 续写/扩写/缩写/润色/换语气/按指令
  if (method === "POST" && seg.length === 3 && seg[1] === "ai" && seg[2] === "compose") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    const task = (body.task || "continue").toString();
    const text = (body.text || "").toString();
    const instruction = (body.instruction || "").toString();
    if (task !== "instruction" && !text.trim()) return json({ error: "请提供正文内容" }, 400);
    if (task === "instruction" && !instruction.trim()) return json({ error: "请填写写作指令" }, 400);
    const prompts: Record<string, string> = {
      continue: "你是中文写作助手。请基于下面的正文，自然地续写后续内容（1–2 段），保持原文风格与 Markdown 格式，只返回续写部分，不要重复原文，不要任何额外解释或前后缀。",
      expand: "你是中文写作助手。请在不改变原意的前提下，把下面这段内容扩写得更充实（补充细节、例子、解释），保持 Markdown 格式，只返回扩写后的全文，不要任何额外解释。",
      shorten: "你是中文写作助手。请把下面这段内容精简压缩，保留核心信息与 Markdown 格式，只返回精简后的内容，不要任何额外解释。",
      polish: "你是中文写作助手与编辑。请润色下面这段内容，让表达更流畅、准确、专业，修正错别字与语病，保持原意与 Markdown 格式，只返回润色后的全文，不要任何额外解释。",
      tone: "你是中文写作助手。请把下面这段内容改写为更生动、有感染力的口语化语气（适合博客/自媒体），保持原意与 Markdown 格式，只返回改写后的全文，不要任何额外解释。",
      instruction: `请按以下要求处理正文：${instruction}\n只返回处理后的结果，保持 Markdown 格式，不要任何额外解释或前后缀。`,
    };
    const sys = prompts[task] || prompts.continue;
    const userText = task === "instruction" ? text : `标题：${(body.title || "(无标题)")}\n\n正文：\n${text}`;
    try {
      const gen = await callAI(env, sys, userText);
      if (!gen) return json({ error: "AI 未返回内容" }, 502);
      return json({ result: gen });
    } catch (e: any) {
      return json({ error: e.message || "AI 调用失败" }, 502);
    }
  }

  // 批量重建语义搜索向量（管理员）：为全部文章生成 embedding 写库
  if (method === "POST" && seg.length === 3 && seg[1] === "ai" && seg[2] === "embed-all") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const posts = await listPosts(env.DB, { admin: true });
    let ok = 0, fail = 0;
    for (const p of posts) {
      try {
        const emb = await embedText(env, (p.title || "") + "\n" + (p.content || ""));
        if (emb) {
          await updatePost(env.DB, p.id, { embedding: JSON.stringify(emb) });
          ok++;
        } else fail++;
      } catch {
        fail++;
      }
    }
    return json({ ok, fail, total: posts.length });
  }

  // 阅读量上报（公开）
  if (method === "POST" && seg.length === 2 && seg[1] === "view") {
    const body = await readJson(req);
    const slug = (body.slug || "").toString().trim();
    if (!slug) return json({ error: "缺少 slug" }, 400);
    await env.DB.prepare("UPDATE posts SET views = views + 1 WHERE slug = ? AND visibility = 'public'").bind(slug).run();
    // 同步累加每日访问量（兜底：表不存在时忽略）
    try {
      const day = new Date().toISOString().slice(0, 10);
      await env.DB.prepare("INSERT INTO views_daily (day, views) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET views = views + 1").bind(day).run();
    } catch {}
    const r = (await env.DB.prepare("SELECT views FROM posts WHERE slug = ?").bind(slug).first()) as any;
    return json({ views: r ? Number(r.views) || 0 : 0 });
  }

  // 点赞 / 收藏计数与切换
  if (method === "GET" && seg.length === 2 && seg[1] === "reactions") {
    const slug = new URL(req.url).searchParams.get("slug") || "";
    if (!slug) return json({ error: "缺少 slug" }, 400);
    const post = await getPostBySlug(env.DB, slug, { admin: false });
    if (!post) return json({ error: "文章不存在" }, 404);
    return json(await getReactionCounts(env.DB, post.id));
  }
  if (method === "POST" && seg.length === 2 && seg[1] === "reactions") {
    const body = await readJson(req);
    const slug = (body.slug || "").toString().trim();
    const kind = body.kind === "favorite" ? "favorite" : "like";
    const userKey = (body.user_key || "").toString().trim();
    if (!slug || !userKey) return json({ error: "缺少参数" }, 400);
    const post = await getPostBySlug(env.DB, slug, { admin: false });
    if (!post) return json({ error: "文章不存在" }, 404);
    return json(await toggleReaction(env.DB, post.id, kind, userKey));
  }

  // 正文多语翻译（管理员）
  if (method === "POST" && seg.length === 3 && seg[1] === "ai" && seg[2] === "translate") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    const text = (body.text || "").toString();
    const target = body.target === "en" ? "en" : body.target === "zht" ? "zht" : "zh";
    if (!text.trim()) return json({ error: "正文不能为空" }, 400);
    const langName = target === "en" ? "English" : target === "zht" ? "繁體中文" : "简体中文";
    const sys = `你是一位专业翻译。请将下面的 Markdown 文章正文翻译成${langName}。保持所有 Markdown 格式与占位符不变，只翻译自然语言内容。只返回翻译后的全文，不要任何额外解释或前后缀。`;
    try {
      const gen = await callAI(env, sys, text);
      if (!gen) return json({ error: "翻译失败" }, 502);
      return json({ text: gen });
    } catch (e: any) {
      return json({ error: e.message || "翻译失败" }, 502);
    }
  }

  // 站内问答（公开）：检索相关文章 + Workers AI 生成中文回答并附引用
  if (method === "POST" && seg.length === 3 && seg[1] === "ai" && seg[2] === "ask") {
    const body = await readJson(req);
    const question = (body.question || "").toString().trim();
    if (!question) return json({ error: "请输入问题" }, 400);
    const all = await listPosts(env.DB, { admin: false });
    const qEmb = await embedText(env, question);
    const top = all
      .map((p: any) => {
        let emb: number[] | null = null;
        try { emb = p.embedding ? JSON.parse(p.embedding) : null; } catch {}
        const ql = question.toLowerCase();
        const kw = ((p.title || "") + " " + (p.content || "")).toLowerCase().includes(ql) ? 0.5 : 0;
        const vec = emb && qEmb ? cosine(qEmb, emb) : 0;
        return { p, score: emb && qEmb ? Math.max(kw, 0.4 + 0.6 * vec) : kw };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    const ctx = top.map((x: any, i: number) => `【文章${i + 1}】${x.p.title}\n${(x.p.content || "").slice(0, 1500)}`).join("\n\n");
    const refs = top.map((x: any) => ({ title: x.p.title, slug: x.p.slug }));
    const sys = `你是本博客的站内问答助手。请仅基于下面提供的「站内文章资料」回答用户问题，用简体中文、条理清晰地作答；若资料不足以回答，请坦诚说明「站内暂无相关内容」，不要编造。可在末尾列出引用的文章标题。`;
    const userText = `用户问题：${question}\n\n站内文章资料：\n${ctx || "（无）"}`;
    try {
      const answer = await callAI(env, sys, userText);
      return json({ answer: answer || "（暂无回答）", refs });
    } catch (e: any) {
      return json({ error: e.message || "问答失败" }, 502);
    }
  }

  // AI 连通性自检（管理员）：逐个检测 workers / deepseek / gemini 是否可用，并返回失败原因
  if (method === "POST" && seg.length === 3 && seg[1] === "ai" && seg[2] === "test") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const settings = await getSettings(env.DB);
    const pingSys = "你是连通性测试机器人，只需回复一个单词 ok。";
    const ping = "ping";
    async function testWorkers(): Promise<{ ok: boolean; msg: string }> {
      if (!env.AI) return { ok: false, msg: "未绑定 Workers AI（ai 绑定缺失，请检查 wrangler.toml 的 [ai] 配置 binding = \"AI\"）" };
      try {
        const out: any = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
          messages: [
            { role: "system", content: pingSys },
            { role: "user", content: ping },
          ],
          max_tokens: 50,
        });
        let r = "";
        if (typeof out === "string") r = out;
        else if (out && out.response) r = out.response;
        else if (out && out.result && typeof out.result.response === "string") r = out.result.response;
        else if (out && typeof out.result === "string") r = out.result;
        else if (out && out.text) r = out.text;
        if (r && r.trim()) return { ok: true, msg: "连接正常（@cf/meta/llama-3.1-8b-instruct-fast）" };
        return { ok: false, msg: "返回内容为空，原始响应：" + JSON.stringify(out).slice(0, 180) };
      } catch (e: any) {
        const raw = (e && e.message ? e.message : String(e)) || "";
        let reason = "调用失败";
        if (/429/i.test(raw) || /rate.?limit/i.test(raw)) reason = "触发限流（免费额度 10000 神经元/天已用尽或瞬时速率超限，通常次日 UTC 0 点恢复）";
        else if (/model/i.test(raw) || /not found/i.test(raw) || /unavailable/i.test(raw)) reason = "模型不可用（该区域可能未部署此模型）";
        else if (/binding/i.test(raw) || (/ai/i.test(raw) && /undefined/i.test(raw))) reason = "绑定缺失";
        return { ok: false, msg: reason + "：" + raw.slice(0, 220) };
      }
    }
    async function testDeepSeek(): Promise<{ ok: boolean; msg: string }> {
      const keys = resolveAiKeys(env, "deepseek", settings);
      if (keys.length === 0)
        return { ok: false, msg: "未配置 DeepSeek Key（请在后台填写，或配置 DEEPSEEK_API_KEY 环境变量 secret）" };
      try {
        const r = await callDeepSeek(env, pingSys, ping, keys[0]);
        return { ok: !!r, msg: r ? `连接正常（用第 1/${keys.length} 个 Key）` : "返回内容为空" };
      } catch (e: any) {
        return { ok: false, msg: "调用失败：" + (e && e.message ? e.message : String(e)) };
      }
    }
    async function testGemini(): Promise<{ ok: boolean; msg: string }> {
      const keys = resolveAiKeys(env, "gemini", settings);
      if (keys.length === 0)
        return { ok: false, msg: "未配置 Gemini Key（请在后台填写，或配置 GEMINI_API_KEY 环境变量 secret）" };
      const base = (settings.gemini_base_url || "").toString().trim();
      try {
        const r = await callGeminiChat(env, pingSys, ping, keys[0], base);
        return { ok: !!r, msg: r ? `连接正常（用第 1/${keys.length} 个 Key）` : "返回内容为空" };
      } catch (e: any) {
        return { ok: false, msg: "调用失败：" + (e && e.message ? e.message : String(e)) };
      }
    }
    const [workers, deepseek, gemini] = await Promise.all([testWorkers(), testDeepSeek(), testGemini()]);
    return json({ workers, deepseek, gemini });
  }

  // 数据看板统计（管理员）
  if (method === "GET" && seg.length === 2 && seg[1] === "stats") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const posts = await listPosts(env.DB, { admin: true });
    const total = posts.length;
    const publicCount = posts.filter((p) => p.visibility === "public").length;
    const cRow = (await env.DB.prepare("SELECT COUNT(*) c FROM comments").first()) as any;
    const comments = cRow ? Number(cRow.c) || 0 : 0;
    const tagList = await listTags(env.DB, { admin: true });
    const aiUsage = await getMeta(env.DB, "ai_usage_count");
    const totalViews = await getTotalViews(env.DB);
    let todayViews = 0;
    try {
      const day = new Date().toISOString().slice(0, 10);
      const tv = (await env.DB.prepare("SELECT views v FROM views_daily WHERE day = ?").bind(day).first()) as any;
      if (tv) todayViews = Number(tv.v) || 0;
    } catch {}
    const since = Date.now() - 7 * 86400000;
    const rows = (await env.DB
      .prepare("SELECT DATE(created_at/1000,'unixepoch') d, COUNT(*) c FROM posts WHERE created_at >= ? GROUP BY d ORDER BY d")
      .bind(since)
      .all()) as any;
    const byDay: Record<string, number> = {};
    for (const r of rows.results || []) byDay[r.d] = r.c;
    const recent7: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      recent7.push({ date: key, count: byDay[key] || 0 });
    }
    return json({ total, public: publicCount, private: total - publicCount, comments, tags: tagList.length, aiUsage, totalViews, todayViews, recent7 });
  }

  // 语义搜索（公开）：向量检索 + 关键词兜底
  if (method === "GET" && seg.length === 2 && seg[1] === "search") {
    const q = new URL(req.url).searchParams.get("q") || "";
    const query = q.trim();
    if (!query) return json({ results: [] });
    const all = await listPosts(env.DB, { admin: false });
    const qEmb = await embedText(env, query);
    const ql = query.toLowerCase();
    const results = all
      .map((p: any) => {
        const kwMatch = ((p.title || "") + " " + (p.content || "") + " " + (p.tags || "")).toLowerCase().includes(ql) ? 0.6 : 0;
        let emb: number[] | null = null;
        try { emb = p.embedding ? JSON.parse(p.embedding) : null; } catch {}
        const vec = emb && qEmb ? cosine(qEmb, emb) : 0;
        const score = emb && qEmb ? Math.max(kwMatch, 0.4 + 0.6 * vec) : kwMatch;
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((x) => cardOf(x.p));
    return json({ results });
  }

  // 相关文章（公开）：基于当前文章向量，返回 top3
  if (method === "GET" && seg.length === 2 && seg[1] === "related") {
    const slug = new URL(req.url).searchParams.get("slug") || "";
    if (!slug) return json({ results: [] });
    const cur = await getPostBySlug(env.DB, decodeURIComponent(slug), { admin: false });
    if (!cur) return json({ results: [] });
    const all = await listPosts(env.DB, { admin: false });
    let curEmb: number[] | null = null;
    try { curEmb = cur.embedding ? JSON.parse(cur.embedding) : null; } catch {}
    let scored: { p: any; score: number }[];
    if (curEmb) {
      scored = all
        .filter((p: any) => p.slug !== cur.slug)
        .map((p: any) => {
          let emb: number[] | null = null;
          try { emb = p.embedding ? JSON.parse(p.embedding) : null; } catch {}
          return { p, score: emb ? cosine(curEmb!, emb) : 0 };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    } else {
      const curTags = parseTags(cur.tags);
      scored = all
        .filter((p: any) => p.slug !== cur.slug)
        .map((p: any) => ({ p, score: curTags.filter((t: string) => parseTags(p.tags).includes(t)).length }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    }
    return json({ results: scored.map((x) => cardOf(x.p)) });
  }

  // 媒体库（管理员）：列出 / 删除 R2 对象
  if (method === "GET" && seg.length === 2 && seg[1] === "media") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const url = new URL(req.url);
    const prefix = url.searchParams.get("prefix") || "";
    const cursor = url.searchParams.get("cursor") || undefined;
    const listed = await env.BUCKET.list({ prefix, cursor, limit: 200 });
    const referenced = new Set<string>();
    const allPosts = (await env.DB.prepare("SELECT content, cover, excerpt FROM posts").all()).results as any[];
    const re = /\/api\/files\/([^\s"'<>)+?]+)/g;
    for (const p of allPosts) {
      for (const field of [p.content, p.cover, p.excerpt]) {
        if (!field) continue;
        let m: RegExpExecArray | null;
        while ((m = re.exec(field))) referenced.add(m[1]);
      }
    }
    const objects = (listed.objects || [])
      .map((o: any) => ({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded ? new Date(o.uploaded).getTime() : null,
        url: `/api/files/${o.key}`,
        orphan: !referenced.has(o.key),
      }))
      .sort((a: any, b: any) => (b.uploaded || 0) - (a.uploaded || 0));
    const totalSize = (listed.objects || []).reduce((s: number, o: any) => s + (o.size || 0), 0);
    return json({ objects, truncated: !!listed.truncated, cursor: (listed as any).cursor || null, totalSize });
  }
  if (method === "DELETE" && seg.length === 2 && seg[1] === "media") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    if (!body.key) return json({ error: "缺少 key" }, 400);
    await env.BUCKET.delete(body.key);
    return json({ ok: true });
  }

  // 读取 R2 图片
  if (method === "GET" && seg.length >= 3 && seg[1] === "files") {
    const key = seg.slice(2).join("/");
    const obj = await env.BUCKET.get(key);
    if (!obj) return json({ error: "文件不存在" }, 404);
    return new Response(obj.body, {
      headers: { "content-type": obj.httpMetadata?.contentType || "application/octet-stream" },
    });
  }

  // 读取文章评论（公开）；管理员可用 ?status=pending 拉取待审核、?status=approved 已通过
  if (method === "GET" && seg.length === 2 && seg[1] === "comments") {
    const url = new URL(req.url);
    const slug = url.searchParams.get("post");
    const status = url.searchParams.get("status");
    if (!slug) {
      // 管理员：不下钻时按 status 获取评论（用于审核队列 / 看板下钻）
      if (!isAdmin(user)) return json({ error: "需要 post 参数或管理员权限" }, 400);
      if (status) {
        return json(await listCommentsByStatus(env.DB, status));
      }
      const rows = (await env.DB.prepare("SELECT * FROM comments ORDER BY created_at DESC").all()) as any;
      return json(rows.results || []);
    }
    const rows = await listComments(env.DB, slug, { status: status || undefined });
    return json(rows);
  }

  // 评论批量操作（管理员）：approve / delete
  if (method === "POST" && seg.length === 3 && seg[1] === "comments" && seg[2] === "bulk") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    const ids = Array.isArray(body.ids) ? body.ids.map((x: any) => Number(x)).filter((x: number) => x) : [];
    const action = body.action;
    if (!ids.length || (action !== "approve" && action !== "delete")) {
      return json({ error: "参数无效" }, 400);
    }
    let n = 0;
    for (const id of ids) {
      if (action === "approve") {
        if (await setCommentStatus(env.DB, id, "approved")) n++;
      } else {
        const r = await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
        if ((r.meta?.changes ?? 0) > 0) n++;
      }
    }
    await logAudit(env.DB, { actor: user!.username, action: "comment_bulk", target: action, detail: `${n} 条` });
    return json({ ok: true, count: n });
  }

  // 提交评论（公开；含蜜罐字段防机器人；支持 parent_id 嵌套回复）
  if (method === "POST" && seg.length === 2 && seg[1] === "comments") {
    const body = await readJson(req);
    // 蜜罐：隐藏字段被填写说明是机器人，静默成功但不存储
    if (body.hp) return json({ ok: true });
    const slug = (body.post_slug || "").toString().trim();
    const author = (body.author || "").toString().trim();
    const content = (body.content || "").toString().trim();
    const email = body.email ? String(body.email).toString().trim() : null;
    const parent_id = Number(body.parent_id) || 0;
    if (!slug || !author || !content) return json({ error: "请填写昵称和评论内容" }, 400);
    if (author.length > 40 || content.length > 1000) return json({ error: "内容过长" }, 400);
    const post = await getPostBySlug(env.DB, slug);
    if (!post) return json({ error: "文章不存在" }, 404);
    // 审核开关：开启时新评论先进入「待审核」，避免不当内容直接公开
    const settings = await getSettings(env.DB);
    const moderated = settings.moderation_enabled !== "0";
    const row = await createComment(env.DB, {
      post_slug: slug,
      author,
      email,
      content,
      parent_id,
      status: moderated ? "pending" : "approved",
    });
    return json({ ...row, pending: moderated }, 201);
  }

  // 删除评论（管理员）
  if (method === "DELETE" && seg.length === 3 && seg[1] === "comments") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const id = Number(seg[2]);
    if (!id) return json({ error: "缺少评论 id" }, 400);
    await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  // 审计日志（管理员）
  if (method === "GET" && seg.length === 2 && seg[1] === "audit") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    return json(await listAudit(env.DB, 300));
  }

  // 数据备份导出（管理员）：导出全部文章（含回收站）、评论、设置
  if (method === "GET" && seg.length === 3 && seg[1] === "backup" && seg[2] === "export") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const posts = (await env.DB.prepare("SELECT * FROM posts ORDER BY id ASC").all()).results as any[];
    const comments = (await env.DB.prepare("SELECT * FROM comments ORDER BY id ASC").all()).results as any[];
    const settings = await getSettings(env.DB);
    const audit = await listAudit(env.DB, 500);
    return json({
      type: "ai-agent-blog-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      posts,
      comments,
      settings,
      audit,
    });
  }

  // 数据备份导入（管理员）：合并/更新（不会删除备份中不存在的记录）
  if (method === "POST" && seg.length === 3 && seg[1] === "backup" && seg[2] === "import") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    if (!body || body.type !== "ai-agent-blog-backup") return json({ error: "备份文件格式不正确" }, 400);
    let nPosts = 0, nComments = 0, nSettings = 0;
    if (Array.isArray(body.posts)) {
      for (const p of body.posts) {
        const existing = await env.DB.prepare("SELECT id FROM posts WHERE id = ?").bind(p.id).first();
        if (existing) {
          await env.DB.prepare(
            "UPDATE posts SET slug=?, title=?, content=?, excerpt=?, cover=?, visibility=?, status=?, scheduled_at=?, ai_notes=?, tags=?, embedding=?, created_at=?, updated_at=?, deleted_at=? WHERE id=?"
          ).bind(p.slug, p.title, p.content, p.excerpt, p.cover, p.visibility, p.status, p.scheduled_at, p.ai_notes, p.tags, p.embedding, p.created_at, p.updated_at, p.deleted_at ?? null, p.id).run();
        } else {
          await env.DB.prepare(
            "INSERT INTO posts (id, slug, title, content, excerpt, cover, visibility, status, scheduled_at, ai_notes, tags, embedding, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
          ).bind(p.id, p.slug, p.title, p.content, p.excerpt, p.cover, p.visibility, p.status, p.scheduled_at, p.ai_notes, p.tags, p.embedding, p.created_at, p.updated_at, p.deleted_at ?? null).run();
        }
        nPosts++;
      }
    }
    if (Array.isArray(body.comments)) {
      for (const c of body.comments) {
        const existing = await env.DB.prepare("SELECT id FROM comments WHERE id = ?").bind(c.id).first();
        if (existing) {
          await env.DB.prepare("UPDATE comments SET post_slug=?, author=?, email=?, content=?, parent_id=?, status=?, created_at=? WHERE id=?")
            .bind(c.post_slug, c.author, c.email, c.content, c.parent_id, c.status, c.created_at, c.id).run();
        } else {
          await env.DB.prepare("INSERT INTO comments (id, post_slug, author, email, content, parent_id, status, created_at) VALUES (?,?,?,?,?,?,?,?)")
            .bind(c.id, c.post_slug, c.author, c.email, c.content, c.parent_id, c.status, c.created_at).run();
        }
        nComments++;
      }
    }
    if (body.settings && typeof body.settings === "object") {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(body.settings)) clean[k] = String(v);
      await setSettings(env.DB, clean);
      nSettings = Object.keys(clean).length;
    }
    await logAudit(env.DB, { actor: user!.username, action: "backup_import", target: `posts=${nPosts},comments=${nComments},settings=${nSettings}` });
    return json({ ok: true, posts: nPosts, comments: nComments, settings: nSettings });
  }

  // 数据分析（管理员）：热门文章 / 流量来源 / IndexNow 日志 / 概览计数
  if (method === "GET" && seg.length === 2 && seg[1] === "analytics") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const popular = await getPopularPosts(env.DB, 10);
    const referers = await getRefererStats(env.DB, 30);
    const indexnow = await listIndexNowLog(env.DB, 50);
    const idxRow = (await env.DB.prepare("SELECT COUNT(*) c FROM indexnow_log").first()) as any;
    const refRow = (await env.DB.prepare("SELECT COALESCE(SUM(cnt),0) c FROM referer_daily").first()) as any;
    return json({
      popular,
      referers,
      indexnow,
      indexnowTotal: idxRow ? Number(idxRow.c) || 0 : 0,
      refererTotal: refRow ? Number(refRow.c) || 0 : 0,
    });
  }

  // 媒体库：列出 R2 对象 + 孤儿检测（实现见上方 GET /api/media，已统一）

  // 媒体库：批量删除（管理员）
  if (method === "POST" && seg.length === 3 && seg[1] === "media" && seg[2] === "delete") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    const keys = Array.isArray(body.keys) ? body.keys.map((x: any) => String(x)).filter(Boolean) : [];
    if (!keys.length) return json({ error: "请选择文件" }, 400);
    let n = 0;
    for (const k of keys) {
      await env.BUCKET.delete(k);
      n++;
    }
    await logAudit(env.DB, { actor: user!.username, action: "media_delete", target: `${n} 个文件` });
    return json({ ok: true, count: n });
  }

  // 媒体库：清理孤儿文件（未被任何文章引用）
  if (method === "POST" && seg.length === 3 && seg[1] === "media" && seg[2] === "cleanup") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    // 复用上面的引用收集 + 列表逻辑
    const referenced = new Set<string>();
    const allPosts = (await env.DB.prepare("SELECT content, cover, excerpt FROM posts").all()).results as any[];
    const re = /\/api\/files\/([^\s"'<>)+?]+)/g;
    for (const p of allPosts) {
      for (const field of [p.content, p.cover, p.excerpt]) {
        if (!field) continue;
        let m: RegExpExecArray | null;
        while ((m = re.exec(field))) referenced.add(m[1]);
      }
    }
    let cursor: string | undefined;
    let n = 0;
    do {
      const listed = await env.BUCKET.list({ cursor, limit: 500 });
      for (const o of listed.objects || []) {
        if (!referenced.has(o.key)) {
          await env.BUCKET.delete(o.key);
          n++;
        }
      }
      cursor = listed.truncated ? listed.cursor || undefined : undefined;
    } while (cursor);
    await logAudit(env.DB, { actor: user!.username, action: "media_cleanup", target: `${n} 个孤儿` });
    return json({ ok: true, count: n });
  }

  return json({ error: "Not Found" }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean); // ['api', ...] 或 []

    // 站点地图与 RSS（公开）
    if (path[0] === "robots.txt") return robotsTxt(req);
    if (path[0] === "sitemap.xml") return await handleSitemap(env, req);
    if (path[0] === "feed.xml") return await handleFeed(env, req);

    if (path[0] === "api") {
      // 兜底建表（幂等）：确保每日访问量表 / 登录失败锁定表存在，避免迁移未 apply 时接口失败
      try {
        await env.DB.exec("CREATE TABLE IF NOT EXISTS views_daily (day TEXT PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0)");
      } catch {}
      try {
        await env.DB.exec("CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER)");
      } catch {}
      try {
        return await handleApi(req, env, path, req.method);
      } catch (e: any) {
        return json({ error: e.message || "服务器错误" }, 500);
      }
    }

    // 维护模式：非管理员访问内容页（爬虫与真人一致） → 返回维护页（含管理员登录框）
    const user = await currentUser(req, env);
    let docSettings: Record<string, string> = {};
    try { docSettings = await getSettings(env.DB); } catch {}
    if (docSettings.maintenance_mode === "1" && !user) {
      const base = (env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
      return new Response(maintenancePage(docSettings, base), {
        headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    // 爬虫 / 社交抓取：对内容路由返回服务端预渲染（含 title / 描述 / OG / JSON-LD / 正文），提升 SEO 与分享卡片
    if (isCrawler(req.headers.get("user-agent") || "")) {
      if (path.length === 0) return await prerenderHome(env, req);
      if (path[0] === "post" && path.length === 2) return await prerenderPost(env, decodeURIComponent(path[1]), req);
    }

    // 非 API 请求：交给静态资源（SPA 回退由 wrangler.toml 的 not_found_handling 处理）
    const assetResp = await env.ASSETS.fetch(req);
    // 对「文档型」SPA 路由（末段无文件扩展名，如 /、/post/xxx、/tag/xxx）禁用边缘缓存，
    // 确保每次都回到 Worker：爬虫 UA 才能拿到预渲染 HTML，而不是被缓存的 SPA 空壳误导搜索引擎。
    // 真实静态资源（/css、/js、/vendor、图片等带扩展名）不受影响，照常边缘缓存。
    const lastSeg = path[path.length - 1] || "";
    const isDocRoute = !/\.[a-z0-9]+$/i.test(lastSeg);
    if (isDocRoute) {
      // 流量来源采集：仅记录来自外部/搜索引擎的访问（同站内部跳转不计），按天+域名聚合，写入 referer_daily
      try {
        const ref = req.headers.get("referer");
        if (ref) {
          const refHost = new URL(ref).host.toLowerCase();
          const selfHost = new URL(req.url).host.toLowerCase();
          if (refHost && refHost !== selfHost && !refHost.endsWith("." + selfHost) && !selfHost.endsWith("." + refHost)) {
            await recordReferer(env.DB, refHost);
          }
        }
      } catch {}
      const h = new Headers(assetResp.headers);
      h.set("Cache-Control", "no-store");
      // 注入自定义 CSS（设置页 ⑪ 高级自定义）：在 </head> 前插入，作用于前端 SPA 整站
      const customCss = docSettings.custom_css || "";
      if (customCss) {
        const txt = await assetResp.text();
        const injected = txt.replace("</head>", `<style data-custom-css>\n${customCss}\n</style>\n</head>`);
        return new Response(injected, { status: assetResp.status, headers: h });
      }
      return new Response(assetResp.body, { status: assetResp.status, headers: h });
    }
    return assetResp;
  },
} satisfies ExportedHandler<Env>;
