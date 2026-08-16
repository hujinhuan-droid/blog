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
  getSettings,
  setSettings,
  listComments,
  createComment,
  listTags,
  parseTags,
  getMeta,
  incMeta,
  getReactionCounts,
  toggleReaction,
  getTotalViews,
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

function json(data: any, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
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

// ---------------- 路由 ----------------

function escXml(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// RSS Feed（公开）：最近 50 篇公开文章
async function handleFeed(env: Env): Promise<Response> {
  const posts = await listPosts(env.DB, { admin: false });
  const base = (env.APP_URL || "").replace(/\/$/, "");
  const items = posts
    .slice(0, 50)
    .map((p: any) => {
      const link = `${base}/#/post/${encodeURIComponent(p.slug)}`;
      const desc = (p.excerpt || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    <title>AI Agent Blog</title>
    <link>${base}/</link>
    <description>AI Agent 博客</description>
    <language>zh-CN</language>
${items}
  </channel>
</rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}

// 站点地图（公开）
async function handleSitemap(env: Env): Promise<Response> {
  const posts = await listPosts(env.DB, { admin: false });
  const base = (env.APP_URL || "").replace(/\/$/, "");
  const urls = posts
    .map((p: any) => `  <url><loc>${base}/#/post/${encodeURIComponent(p.slug)}</loc><lastmod>${new Date(p.updated_at).toISOString()}</lastmod></url>`)
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
    ]) {
      if (body[k] !== undefined && body[k] !== null) clean[k] = String(body[k]);
    }
    await setSettings(env.DB, clean);
    return json({ ok: true });
  }

  // 文章列表
  if (method === "GET" && seg.length === 2 && seg[1] === "posts") {
    const url = new URL(req.url);
    const visibility = url.searchParams.get("visibility") || undefined;
    const rows = await listPosts(env.DB, { admin: isAdmin(user), visibility });
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
      return row ? json(row) : json({ error: "文章不存在" }, 404);
    }
    if (method === "DELETE") {
      if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
      const ok = await deletePost(env.DB, id);
      return ok ? json({ ok: true }) : json({ error: "文章不存在" }, 404);
    }
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
      const u = await passwordLogin(env, body.username, body.password);
      if (!u) return json({ error: "账号或密码错误" }, 401);
      const s = await startSession(env, u);
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
      `极简扁平插画风格的中文养生博客封面，主题：「${title}」，相关标签：${tags}。柔和自然色调，水墨与植物元素，大量留白，无文字，适合作为文章头图。`;
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
    const listed = await env.BUCKET.list({ limit: 1000 });
    const items = (listed.objects || [])
      .map((o: any) => ({ key: o.key, url: `/api/files/${o.key}`, size: o.size, uploaded: o.uploaded ? o.uploaded.getTime() : null }))
      .sort((a: any, b: any) => (b.uploaded || 0) - (a.uploaded || 0));
    return json({ items });
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

  // 读取文章评论（公开）
  if (method === "GET" && seg.length === 2 && seg[1] === "comments") {
    const url = new URL(req.url);
    const slug = url.searchParams.get("post");
    if (!slug) {
      // 管理员可在不下钻时获取全部评论（用于看板「评论」卡片下钻）
      if (!isAdmin(user)) return json({ error: "需要 post 参数或管理员权限" }, 400);
      const rows = (await env.DB.prepare("SELECT * FROM comments ORDER BY created_at DESC").all()) as any;
      return json(rows.results || []);
    }
    const rows = await listComments(env.DB, slug);
    return json(rows);
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
    const row = await createComment(env.DB, { post_slug: slug, author, email, content, parent_id });
    return json(row, 201);
  }

  // 删除评论（管理员）
  if (method === "DELETE" && seg.length === 3 && seg[1] === "comments") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const id = Number(seg[2]);
    if (!id) return json({ error: "缺少评论 id" }, 400);
    await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  return json({ error: "Not Found" }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean); // ['api', ...] 或 []

    // 站点地图与 RSS（公开）
    if (path[0] === "sitemap.xml") return await handleSitemap(env);
    if (path[0] === "feed.xml") return await handleFeed(env);

    if (path[0] === "api") {
      // 兜底建表（幂等）：确保每日访问量表存在，避免迁移未 apply 时统计接口失败
      try {
        await env.DB.exec("CREATE TABLE IF NOT EXISTS views_daily (day TEXT PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0)");
      } catch {}
      try {
        return await handleApi(req, env, path, req.method);
      } catch (e: any) {
        return json({ error: e.message || "服务器错误" }, 500);
      }
    }

    // 非 API 请求：交给静态资源（SPA 回退由 wrangler.toml 的 not_found_handling 处理）
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
