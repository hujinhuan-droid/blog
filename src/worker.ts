/// <reference types="@cloudflare/workers-types" />
import {
  AuthEnv,
  currentUser,
  githubAuthorizeUrl,
  exchangeGithubCode,
  passwordLogin,
  ensureAdminAccount,
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
} from "./db";

interface Env extends AuthEnv {
  DB: DB;
  BUCKET: R2Bucket;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  GEMINI_API_KEY?: string;
  GEMINI_BASE_URL?: string;
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

type AiAction = "optimize" | "annotate" | "moderate";

const AI_PROMPTS: Record<AiAction, string> = {
  optimize:
    "你是一位专业的中文技术博客编辑。请优化下面的 Markdown 文章：让表达更清晰、结构更合理、用词更准确，保持原意与原有 Markdown 格式（标题、列表、代码块、引用等）不变。只返回优化后的全文，不要任何额外解释、前后缀或代码围栏。",
  annotate:
    "你是一位资深的中文编辑与审稿人。请针对下面的 Markdown 文章，给出面向作者的「备注 / 审稿意见」，用中文分点列出：\n1) 文章优点；\n2) 可改进之处（结构、逻辑、事实、语气、错别字等）；\n3) 具体修改建议。\n不要改写全文，只给评语与建议，使用 Markdown 格式。",
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
      temperature: action === "optimize" ? 0.4 : action === "moderate" ? 0.2 : 0.6,
      maxOutputTokens: action === "optimize" ? 4096 : 2048,
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
      return text;
    }
    const t = await resp.text().catch(() => "");
    lastErr = `Gemini API ${resp.status}: ${t.slice(0, 300)}`;
    if ((resp.status === 503 || resp.status === 429) && attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(lastErr);
  }
  throw new Error(lastErr);
}

// ---------------- 路由 ----------------

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
      "theme_dark",
      "ai_model",
      "ai_enabled",
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
    const row = await createPost(env.DB, {
      title: body.title,
      content: body.content || "",
      excerpt: body.excerpt,
      cover: body.cover,
      visibility: body.visibility,
      author_id: user!.id,
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
      const row = await updatePost(env.DB, id, body);
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
      body.action === "annotate" ? "annotate" : body.action === "moderate" ? "moderate" : "optimize";
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
    if (!slug) return json({ error: "缺少 post 参数" }, 400);
    const rows = await listComments(env.DB, slug);
    return json(rows);
  }

  // 提交评论（公开；含蜜罐字段防机器人）
  if (method === "POST" && seg.length === 2 && seg[1] === "comments") {
    const body = await readJson(req);
    // 蜜罐：隐藏字段被填写说明是机器人，静默成功但不存储
    if (body.hp) return json({ ok: true });
    const slug = (body.post_slug || "").toString().trim();
    const author = (body.author || "").toString().trim();
    const content = (body.content || "").toString().trim();
    const email = body.email ? String(body.email).toString().trim() : null;
    if (!slug || !author || !content) return json({ error: "请填写昵称和评论内容" }, 400);
    if (author.length > 40 || content.length > 1000) return json({ error: "内容过长" }, 400);
    const post = await getPostBySlug(env.DB, slug);
    if (!post) return json({ error: "文章不存在" }, 404);
    const row = await createComment(env.DB, { post_slug: slug, author, email, content });
    return json(row, 201);
  }

  return json({ error: "Not Found" }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean); // ['api', ...] 或 []

    if (path[0] === "api") {
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
