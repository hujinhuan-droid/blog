/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./worker";
import { DB, incMeta, getSettings, listPosts, getPostBySlug, parseTags } from "./db";

// ---------------- Gemini AI ----------------
export const GEMINI_MODEL = "gemini-flash-latest";

export type AiAction = "optimize" | "annotate" | "moderate" | "classify" | "summarize";

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
export function extractJsonArray(text: string): string[] {
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
export async function embedText(env: Env, text: string): Promise<number[] | null> {
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
export async function genCoverImage(env: Env, prompt: string): Promise<string> {
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
export function buildCoverPrompt(title: string, tags: string): string {
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
export async function callAI(env: Env, system: string, userText: string): Promise<string> {
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

// ---------------- Vectorize 向量索引（语义检索加速层）----------------
// 设计原则：D1 embedding 列仍是主存储；Vectorize 只是加速副本，任何异常都静默回退到 JS cosine。
// 索引 id 用 slug（稳定、可读、便于与 D1 行关联），metadata 存 title/tags 供查询直接回包。
const VECTOR_META = { title: "", tags: "", cover: "" };

/** 把单篇文章向量写入/更新到 Vectorize；失败返回 false（不影响主流程）。 */
export async function upsertVector(env: Env, slug: string, embedding: number[], meta?: { title?: string; tags?: string; cover?: string }): Promise<boolean> {
  const idx = env.VECTORIZE;
  if (!idx || !Array.isArray(embedding) || embedding.length !== 768 || !slug) return false;
  try {
    await idx.upsert([{
      id: slug,
      values: embedding,
      metadata: {
        title: String(meta?.title ?? VECTOR_META.title),
        tags: String(meta?.tags ?? VECTOR_META.tags),
        cover: String(meta?.cover ?? VECTOR_META.cover),
      } as Record<string, string>,
    }]);
    return true;
  } catch {
    return false;
  }
}

/** 从 Vectorize 检索与给定向量最相似的 slug 列表；失败或无索引返回 null（触发回退）。 */
export async function queryVectors(
  env: Env,
  embedding: number[],
  topK = 8
): Promise<Array<{ slug: string; score: number; metadata?: Record<string, unknown> }> | null> {
  const idx = env.VECTORIZE;
  if (!idx || !Array.isArray(embedding) || embedding.length !== 768) return null;
  try {
    const res = await idx.query(embedding, { topK: Math.max(1, Math.min(50, topK)), returnMetadata: true });
    const matches = (res && (res as any).matches) || [];
    return matches
      .filter((m: any) => m && m.id)
      .map((m: any) => ({ slug: String(m.id), score: Number(m.score) || 0, metadata: m.metadata }));
  } catch {
    return null;
  }
}

/** 解析 D1 中的 embedding 字符串为 number[]；非 768 维视为无效。 */
export function parseEmbedding(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) && a.length === 768 ? (a as number[]) : null;
  } catch {
    return null;
  }
}

// 余弦相似度
export function cosine(a: number[], b: number[]): number {
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

/**
 * 语义相关文章（服务端 / SSR 复用，与 /api/related 对齐）：
 * 基于当前文章向量 cosine 取 topN；若当前文章或候选文章无向量，则回退到标签重合度打分。
 * - 不需要 env.AI：向量已全部落库（embedding 列），仅做内存余弦计算；
 * - 优雅降级：当前文章无向量时按标签兜底，保证总能返回若干相关项。
 */
export async function getRelatedPosts(
  db: DB,
  slug: string,
  n = 3
): Promise<Array<{ slug: string; title: string; cover: string | null; tags: string | null; score: number }>> {
  const cur = await getPostBySlug(db, slug, { admin: false });
  if (!cur) return [];
  const all = await listPosts(db, { admin: false });
  const parseEmb = (s: string | null): number[] | null => {
    if (!s) return null;
    try {
      const a = JSON.parse(s);
      return Array.isArray(a) ? (a as number[]) : null;
    } catch {
      return null;
    }
  };
  const curEmb = parseEmb(cur.embedding);
  const candidates = all.filter((p: any) => p.slug !== cur.slug);
  let scored: Array<{ p: any; score: number }>;
  if (curEmb) {
    scored = candidates
      .map((p: any) => {
        const e = parseEmb(p.embedding);
        return { p, score: e ? cosine(curEmb, e) : 0 };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  } else {
    const curTags = parseTags(cur.tags);
    scored = candidates
      .map((p: any) => ({
        p,
        score: curTags.filter((t: string) => parseTags(p.tags).includes(t)).length,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  }
  return scored.map((x) => ({
    slug: String(x.p.slug),
    title: String(x.p.title),
    cover: x.p.cover || null,
    tags: x.p.tags || null,
    score: x.score,
  }));
}

export { callGemini };
