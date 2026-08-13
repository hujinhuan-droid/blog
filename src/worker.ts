/// <reference types="@cloudflare/workers-types" />
import {
  AuthEnv,
  currentUser,
  githubAuthorizeUrl,
  exchangeGithubCode,
  passwordLogin,
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
} from "./db";

interface Env extends AuthEnv {
  DB: DB;
  BUCKET: R2Bucket;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
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

// ---------------- 路由 ----------------

async function handleApi(req: Request, env: Env, path: string[], method: string): Promise<Response> {
  const user = await currentUser(req, env);
  const seg = path; // ['api', ...]

  // 健康检查
  if (method === "GET" && seg.length === 2 && seg[1] === "health") {
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
    const row = await getPostBySlug(env.DB, seg[2], { admin: isAdmin(user) });
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
    // 密码登录（本地调试）
    if (body.password) {
      const u = await passwordLogin(env, body.password);
      if (!u) return json({ error: "密码错误或未配置 ADMIN_PASSWORD" }, 401);
      const s = await startSession(env, u);
      return json({ user: s.user }, 200, { "set-cookie": s.cookie });
    }
    // GitHub OAuth 跳转
    const url = githubAuthorizeUrl(env);
    if (!url) return json({ error: "未配置 GitHub OAuth，请使用密码登录或配置 GITHUB_CLIENT_ID" }, 400);
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

  // 读取 R2 图片
  if (method === "GET" && seg.length >= 3 && seg[1] === "files") {
    const key = seg.slice(2).join("/");
    const obj = await env.BUCKET.get(key);
    if (!obj) return json({ error: "文件不存在" }, 404);
    return new Response(obj.body, {
      headers: { "content-type": obj.httpMetadata?.contentType || "application/octet-stream" },
    });
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
