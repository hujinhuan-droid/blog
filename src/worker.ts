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
  snapshotRevision,
  listRevisions,
  getRevision,
  restoreRevision,
  logSearch,
  getSearchStats,
  listTagStats,
  renameTag,
  mergeTags,
  deleteTag,
  getTrafficStats,
  getNeighbors,
} from "./db";
import {
  json, anonCache, isAdmin, readJson, cardOf, escHtmlS, absUrl, isCrawler,
  classifyDevice, classifySource, visitorHash, fmtDateS, cacheControlHeader, securityHeaders, assetCacheControl,
} from "./util";
import {
  prerenderHome, prerenderPost, prerenderTag, robotsTxt, handleFeed, handleSitemap, maintenancePage,
} from "./ssr";
import {
  GEMINI_MODEL, callAI, callGemini, extractJsonArray, embedText, genCoverImage, buildCoverPrompt, cosine,
  upsertVector, queryVectors, parseEmbedding,
  type AiAction,
} from "./ai";
import { cachedResponse, purgeEdgeCache } from "./cache";

interface Env extends AuthEnv {
  DB: DB;
  BUCKET: R2Bucket;
  AI: any;
  VECTORIZE?: VectorizeIndex;
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

async function handleApi(req: Request, env: Env, path: string[], method: string): Promise<Response> {
  const user = await currentUser(req, env);
  const seg = path; // ['api', ...]

  // 健康检查
  if (method === "GET" && seg.length === 2 && seg[1] === "health") {
    return json({ ok: true });
  }

  // 站点设置（公开读取，供读者端渲染）
  if (method === "GET" && seg.length === 2 && seg[1] === "settings") {
    return json(await getSettings(env.DB), 200, anonCache(user, 60));
  }

  // 标签云（公开读取；管理员可见全部文章标签，读者仅公开）
  if (method === "GET" && seg.length === 2 && seg[1] === "tags") {
    return json(await listTags(env.DB, { admin: isAdmin(user) }), 200, anonCache(user, 60));
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
      "og_image",
      "sitemap_enabled",
      "extra_head",
      "stats_code",
      "motion_level",
      // —— 文章页作者名片（C 组） ——
      "author_name",
      "author_bio",
      "author_avatar",
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
      return json(rows.map(cardOf), 200, anonCache(user, 30));
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
    // Vectorize 双写：embedding 已在 D1，索引副本 best-effort（失败静默，回退路径完整）
    if (emb && (row as any)?.slug) {
      await upsertVector(env, (row as any).slug, emb, { title: (row as any).title, tags: (row as any).tags, cover: (row as any).cover });
    }
    if ((body.status || "draft") === "published" && (row as any)?.slug) {
      await submitIndexNow(env, [`https://${SITE_HOST}/post/${(row as any).slug}`]);
      await fireWebhooks(env, row);
    }
    await logAudit(env.DB, { actor: user!.username, action: "post_create", target: `#${(row as any).id} ${(row as any).title}`, detail: body.status || "draft" });
    return json(row, 201);
  }

  // 更新 / 删除（管理员，按 id）
  // 注意：必须排除 bulk，否则 POST /api/posts/bulk 会被下面的 Number("bulk") 判为无效 id
  if (seg.length === 3 && seg[1] === "posts" && seg[2] !== "bulk") {
    const id = Number(seg[2]);
    if (!Number.isInteger(id)) return json({ error: "无效 id" }, 400);
    if (method === "PUT") {
      if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
      const body = await readJson(req);
      const existing = await getPostById(env.DB, id, { admin: true });
      if (!existing) return json({ error: "文章不存在" }, 404);
      // 版本历史：改动正文/标题前，把旧状态存一份（内容相同或 90 秒内重复则自动合并）
      const willEdit = (body.content !== undefined && body.content !== existing.content) ||
        (body.title !== undefined && body.title !== existing.title);
      if (willEdit) {
        try { await snapshotRevision(env.DB, id, user!.username); } catch {}
      }
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
      // Vectorize 双写：仅当本次确实重算了 embedding
      if (emb && row?.slug) {
        await upsertVector(env, row.slug, emb, { title: row.title, tags: row.tags, cover: row.cover });
      }
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

  /* ── 文章版本历史（管理员）─────────────────────────────────────────────
     GET  /api/posts/:id/revisions            版本列表（轻量，不含正文）
     GET  /api/posts/:id/revisions/:rid       单个版本的完整内容
     POST /api/posts/:id/revisions/:rid/restore  回滚到该版本            */
  if (seg.length === 4 && seg[1] === "posts" && seg[3] === "revisions" && method === "GET") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const id = Number(seg[2]);
    if (!Number.isInteger(id)) return json({ error: "无效 id" }, 400);
    return json({ revisions: await listRevisions(env.DB, id) });
  }

  if (seg.length === 5 && seg[1] === "posts" && seg[3] === "revisions" && method === "GET") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const id = Number(seg[2]);
    const rid = Number(seg[4]);
    if (!Number.isInteger(id) || !Number.isInteger(rid)) return json({ error: "无效 id" }, 400);
    const rev = await getRevision(env.DB, id, rid);
    return rev ? json(rev) : json({ error: "版本不存在" }, 404);
  }

  if (seg.length === 6 && seg[1] === "posts" && seg[3] === "revisions" && seg[5] === "restore" && method === "POST") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const id = Number(seg[2]);
    const rid = Number(seg[4]);
    if (!Number.isInteger(id) || !Number.isInteger(rid)) return json({ error: "无效 id" }, 400);
    const r = await restoreRevision(env.DB, id, rid, user!.username);
    if (r.ok && r.post) {
      await submitIndexNow(env, [`https://${SITE_HOST}/post/${r.post.slug}`]);
      await logAudit(env.DB, { actor: user!.username, action: "post_restore_version", target: `#${id} ${r.post.title}`, detail: r.msg });
    }
    return json(r, r.ok ? 200 : 400);
  }

  /* ── 标签管理（管理员）：重命名 / 合并 / 删除 ─────────────────────────
     GET  /api/admin/tags            带文章数的标签清单
     POST /api/admin/tags            { action: rename|merge|delete, ... } */
  if (method === "GET" && seg.length === 3 && seg[1] === "admin" && seg[2] === "tags") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    return json({ tags: await listTagStats(env.DB) });
  }

  if (method === "POST" && seg.length === 3 && seg[1] === "admin" && seg[2] === "tags") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const body = await readJson(req);
    const action = String(body.action || "");
    let r: { ok: boolean; msg: string; changed: number };
    if (action === "rename") r = await renameTag(env.DB, body.from, body.to);
    else if (action === "merge") r = await mergeTags(env.DB, Array.isArray(body.from) ? body.from : [], body.to);
    else if (action === "delete") r = await deleteTag(env.DB, body.name);
    else return json({ error: "未知操作" }, 400);
    if (r.ok) {
      await logAudit(env.DB, { actor: user!.username, action: `tag_${action}`, target: r.msg, detail: `${r.changed} 篇` });
    }
    return json(r, r.ok ? 200 : 400);
  }

  /* ── 站内搜索分析（管理员）────────────────────────────────────────── */
  if (method === "GET" && seg.length === 3 && seg[1] === "admin" && seg[2] === "search-stats") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const days = Math.min(180, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
    try {
      return json(await getSearchStats(env.DB, days));
    } catch {
      // 表还没建（旧库）：返回空统计而不是 500，前端照常显示「暂无数据」
      return json({ total: 0, unique: 0, emptyRate: 0, top: [], empty: [], daily: [] });
    }
  }

  /* ── 访问趋势（管理员）：按天/设备/来源/落地页筛选，空数据回退 views_daily ── */
  if (method === "GET" && seg.length === 3 && seg[1] === "admin" && seg[2] === "traffic") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const q = new URL(req.url).searchParams;
    const data = await getTrafficStats(env.DB, {
      days: Number(q.get("days")) || 30,
      device: q.get("device") || "",
      source: q.get("source") || "",
      slug: q.get("slug") || "",
    });
    return json(data);
  }

  /* ── 系统状态（管理员）：各表行数 / 存储用量 / 关键开关 ─────────────── */
  if (method === "GET" && seg.length === 3 && seg[1] === "admin" && seg[2] === "system") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    const countOf = async (table: string): Promise<number> => {
      try {
        const r = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()) as any;
        return Number(r?.n) || 0;
      } catch { return -1; }
    };
    const names = ["posts", "comments", "users", "sessions", "audit_log", "search_log", "post_revisions", "tag_aliases", "login_attempts", "referer_daily", "views_daily", "visit_log"];
    const tables: Record<string, number> = {};
    for (const t of names) tables[t] = await countOf(t);

    let r2 = { objects: 0, bytes: 0, truncated: false };
    try {
      const list = await env.BUCKET.list({ limit: 1000 });
      r2.objects = list.objects.length;
      r2.bytes = list.objects.reduce((sum, o: any) => sum + (Number(o.size) || 0), 0);
      r2.truncated = !!list.truncated;
    } catch {}

    const st = await getSettings(env.DB);
    return json({
      tables,
      r2,
      config: {
        cache_ttl: st.cache_ttl || "默认",
        maintenance_mode: st.maintenance_mode === "1",
        comments_enabled: st.comments_enabled !== "0",
        session_ttl: st.session_ttl || "默认",
        theme: st.theme_preset || "default",
        rss_count: st.rss_count || "默认",
      },
      now: Date.now(),
    });
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
          // 同步灌入 Vectorize 索引（best-effort）
          await upsertVector(env, p.slug, emb, { title: p.title, tags: p.tags, cover: p.cover });
          ok++;
        } else fail++;
      } catch {
        fail++;
      }
    }
    return json({ ok, fail, total: posts.length });
  }

  // Vectorize 回填（管理员）：把 D1 已有 embedding 灌入向量索引，不重算、零 AI 消耗。
  // 首次绑定索引后调用一次即可；重复调用幂等（upsert 按 slug 覆盖）。
  if (method === "POST" && seg.length === 3 && seg[1] === "ai" && seg[2] === "vector-backfill") {
    if (!isAdmin(user)) return json({ error: "需要管理员权限" }, 401);
    if (!env.VECTORIZE) return json({ error: "未绑定 VECTORIZE 索引" }, 503);
    const posts = await listPosts(env.DB, { admin: true });
    let ok = 0, skipped = 0, fail = 0;
    for (const p of posts) {
      const emb = parseEmbedding(p.embedding);
      if (!emb) { skipped++; continue; }
      const done = await upsertVector(env, p.slug, emb, { title: p.title, tags: p.tags, cover: p.cover });
      if (done) ok++; else fail++;
    }
    return json({ ok, skipped, fail, total: posts.length });
  }

  // 阅读量上报（公开）
  if (method === "POST" && seg.length === 2 && seg[1] === "view") {
    const body = await readJson(req);
    const slug = (body.slug || "").toString().trim();
    if (!slug) return json({ error: "缺少 slug" }, 400);
    await env.DB.prepare("UPDATE posts SET views = views + 1 WHERE slug = ? AND visibility = 'public'").bind(slug).run();
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    // 同步累加每日访问量（兜底：表不存在时忽略）
    try {
      await env.DB.prepare("INSERT INTO views_daily (day, views) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET views = views + 1").bind(day).run();
    } catch {}
    // 访问明细：供后台按来源 / 设备 / 落地页筛选趋势
    try {
      const ua = req.headers.get("user-agent") || "";
      const selfHost = new URL(req.url).hostname.toLowerCase();
      const { source, referer } = classifySource(req.headers.get("referer") || "", selfHost);
      const visitor = await visitorHash((req.headers.get("cf-connecting-ip") || "") + "|" + ua);
      await env.DB
        .prepare("INSERT INTO visit_log (day, ts, slug, path, device, source, referer, visitor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(day, now, slug, String(body.path || "").slice(0, 200), classifyDevice(ua), source, referer, visitor)
        .run();
      // 低频清理：只保留最近 180 天明细，避免 D1 无限增长
      if (Math.random() < 0.01) {
        await env.DB.prepare("DELETE FROM visit_log WHERE day < ?")
          .bind(new Date(now - 180 * 86400000).toISOString().slice(0, 10)).run();
      }
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
        const emb = parseEmbedding(p.embedding);
        const vec = emb && qEmb ? cosine(qEmb, emb) : 0;
        const score = emb && qEmb ? Math.max(kwMatch, 0.4 + 0.6 * vec) : kwMatch;
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((x) => cardOf(x.p));
    // 搜索分析：记录关键词与「字面命中数」。
    // 注意不能记语义结果数——向量检索几乎总能返回近似结果，会把「搜不到」全部掩盖，
    // 而真正有价值的是「没有任何文章字面提到这个词」的内容缺口。
    const literalHits = all.filter((p: any) =>
      ((p.title || "") + " " + (p.content || "") + " " + (p.tags || "")).toLowerCase().includes(ql)
    ).length;
    await logSearch(env.DB, query, literalHits);
    return json({ results });
  }

  // 相邻文章（公开）：按发布时间轴取前/后各一篇，供文末导航使用
  // 用 /api/neighbors?slug= 而非 /api/posts/:slug/neighbors，避免与回收站的四段路由冲突
  if (method === "GET" && seg.length === 2 && seg[1] === "neighbors") {
    const slug = new URL(req.url).searchParams.get("slug") || "";
    if (!slug) return json({ prev: null, next: null });
    return json(await getNeighbors(env.DB, decodeURIComponent(slug)), 200, anonCache(user, 60));
  }

  // 相关文章（公开）：优先走 Vectorize 加速；失败/无结果回退 D1 + JS cosine（行为保持）
  if (method === "GET" && seg.length === 2 && seg[1] === "related") {
    const slug = new URL(req.url).searchParams.get("slug") || "";
    if (!slug) return json({ results: [] });
    const cur = await getPostBySlug(env.DB, decodeURIComponent(slug), { admin: false });
    if (!cur) return json({ results: [] });
    const curEmb = parseEmbedding(cur.embedding);
    // 优先：向量索引检索（近 O(log n)），多取几条以便剔除自身与无效行
    if (curEmb) {
      const hits = await queryVectors(env, curEmb, 8);
      if (hits && hits.length) {
        const bySlug = new Map<string, any>();
        for (const h of hits) if (h.slug !== cur.slug) bySlug.set(h.slug, h.score);
        if (bySlug.size) {
          const all = await listPosts(env.DB, { admin: false });
          const picked = all
            .filter((p: any) => bySlug.has(String(p.slug)))
            .sort((a: any, b: any) => (bySlug.get(String(b.slug)) || 0) - (bySlug.get(String(a.slug)) || 0))
            .slice(0, 3);
          if (picked.length) return json({ results: picked.map((p: any) => cardOf(p)), source: "vectorize" });
        }
      }
    }
    // 回退：原 D1 全表 cosine / 标签兜底逻辑
    const all = await listPosts(env.DB, { admin: false });
    let scored: { p: any; score: number }[];
    if (curEmb) {
      scored = all
        .filter((p: any) => p.slug !== cur.slug)
        .map((p: any) => ({ p, score: (() => { const e = parseEmbedding(p.embedding); return e ? cosine(curEmb, e) : 0; })() }))
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
    return json({ results: scored.map((x) => cardOf(x.p)), source: "fallback" });
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
      headers: {
        "content-type": obj.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        ...securityHeaders(),
      },
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

    // 站点地图与 RSS（公开）：读多写少，走边缘缓存；发布联动会主动失效
    if (path[0] === "robots.txt") return await cachedResponse(req, "/robots.txt", 600, () => robotsTxt(env, req));
    if (path[0] === "sitemap.xml") return await cachedResponse(req, "/sitemap.xml", 300, () => handleSitemap(env, req));
    if (path[0] === "feed.xml") return await cachedResponse(req, url.search ? "/feed.xml" + url.search : "/feed.xml", 300, () => handleFeed(env, req));

    if (path[0] === "api") {
      // 兜底建表（幂等）：确保每日访问量表 / 登录失败锁定表存在，避免迁移未 apply 时接口失败
      try {
        await env.DB.exec("CREATE TABLE IF NOT EXISTS views_daily (day TEXT PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0)");
      } catch {}
      try {
        await env.DB.exec("CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER)");
      } catch {}
      // v3.1 后台增强表：版本历史 / 搜索日志 / 标签别名（与 0013 迁移等价，幂等）
      try {
        await env.DB.exec(
          "CREATE TABLE IF NOT EXISTS post_revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', excerpt TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', status TEXT, actor TEXT, note TEXT, created_at INTEGER NOT NULL);" +
          "CREATE INDEX IF NOT EXISTS idx_rev_post ON post_revisions (post_id, created_at DESC);" +
          "CREATE TABLE IF NOT EXISTS search_log (id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);" +
          "CREATE INDEX IF NOT EXISTS idx_search_kw ON search_log (keyword, created_at DESC);" +
          "CREATE TABLE IF NOT EXISTS tag_aliases (alias TEXT PRIMARY KEY, target TEXT NOT NULL, created_at INTEGER NOT NULL);"
        );
      } catch {}
      // v3.3 访问明细（与 0014 迁移等价，幂等）：支撑后台按设备/来源/落地页筛选趋势
      try {
        await env.DB.exec(
          "CREATE TABLE IF NOT EXISTS visit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, ts INTEGER NOT NULL, slug TEXT NOT NULL DEFAULT '', path TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT 'desktop', source TEXT NOT NULL DEFAULT 'direct', referer TEXT NOT NULL DEFAULT '', visitor TEXT NOT NULL DEFAULT '');" +
          "CREATE INDEX IF NOT EXISTS idx_visit_day ON visit_log (day);" +
          "CREATE INDEX IF NOT EXISTS idx_visit_ts ON visit_log (ts DESC);" +
          "CREATE INDEX IF NOT EXISTS idx_visit_slug ON visit_log (slug, day);"
        );
      } catch {}
      try {
        const resp = await handleApi(req, env, path, req.method);
        // 边缘缓存失效：任何成功的写操作（发布/删除/设置/标签/导入）都可能改变公开内容，
        // 统一 purge feed/sitemap/robots + 爬虫 SSR 缓存。宁可多失效，不可让缓存陈旧。
        if (req.method !== "GET" && resp.status < 400) {
          await purgeEdgeCache(req);
        }
        return resp;
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
        headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...securityHeaders() },
      });
    }

    // 爬虫 / 社交抓取：对内容路由返回服务端预渲染（含 title / 描述 / OG / JSON-LD / 正文），提升 SEO 与分享卡片。
    // 走边缘缓存（varyUA）：SSR 结果只由文章内容+设置决定，发布联动会 purge；缓存命中直接省掉 D1 查询。
    if (isCrawler(req.headers.get("user-agent") || "")) {
      if (path.length === 0) return await cachedResponse(req, "/", 600, () => prerenderHome(env, req), true);
      if (path[0] === "post" && path.length === 2) {
        const slug = decodeURIComponent(path[1]);
        return await cachedResponse(req, "/post/" + encodeURIComponent(slug), 600, () => prerenderPost(env, slug, req), true);
      }
      if (path[0] === "tag" && path.length === 2) {
        const tag = decodeURIComponent(path[1]);
        return await cachedResponse(req, "/tag/" + encodeURIComponent(tag), 600, () => prerenderTag(env, tag, req), true);
      }
    }

    // 非 API 请求：交给静态资源（SPA 回退由 wrangler.toml 的 not_found_handling 处理）
    const assetResp = await env.ASSETS.fetch(req);
    // 对「文档型」SPA 路由（末段无文件扩展名，如 /、/post/xxx、/tag/xxx）禁用边缘缓存，
    // 确保每次都回到 Worker：爬虫 UA 才能拿到预渲染 HTML，而不是被缓存的 SPA 空壳误导搜索引擎。
    // 真实静态资源（/css、/js、/vendor、图片等带扩展名）不受影响，照常边缘缓存。
    const lastSeg = path[path.length - 1] || "";
    // /index.html 也视为文档（SW 会预缓存它），否则离线回退拿到的是没有默认 OG 的旧外壳
    const isDocRoute = !/\.[a-z0-9]+$/i.test(lastSeg) || lastSeg.toLowerCase() === "index.html";
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
      for (const [k, v] of Object.entries(securityHeaders())) h.set(k, v);
      // SPA shell 本身只有 title/canonical，OG 标签由前端 JS 动态生成；但微信 / QQ / 微博等
      // 分享抓取器不执行 JS，必须在文档里直接给一组带绝对地址的默认标签。前端 applySeo /
      // applyPostSeo 会按当前路由更新同一组 property 标签，不会产生重复。
      const base = (env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
      const siteTitle = docSettings.seo_title || docSettings.site_title || "AI Agent Blog";
      const siteDesc = docSettings.seo_description || "记录 AI Agent 的探索、实践与思考";
      const shareImage = absUrl(docSettings.og_image, base) || base + "/og-default.png";
      // 路径式文章 / 标签入口（/post/slug、/tag/name）在未执行 JS 时也应指向自己的规范地址，
      // 而不是笼统归到首页；hash 路由对服务端不可见，仍由前端按路由更新。
      const safeSeg = (v: string) => { try { return encodeURIComponent(decodeURIComponent(v)); } catch { return encodeURIComponent(v); } };
      const canonicalPath =
        path.length === 0 || path[0] === "index.html" ? "/" :
        path[0] === "post" && path.length === 2 ? "/post/" + safeSeg(path[1]) :
        path[0] === "tag" && path.length === 2 ? "/tag/" + safeSeg(path[1]) : "/";
      const canonicalUrl = base + canonicalPath;
      const defaultOg = [
        `<meta name="description" content="${escHtmlS(siteDesc)}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:title" content="${escHtmlS(siteTitle)}" />`,
        `<meta property="og:description" content="${escHtmlS(siteDesc)}" />`,
        `<meta property="og:url" content="${escHtmlS(canonicalUrl)}" />`,
        `<meta property="og:site_name" content="${escHtmlS(docSettings.site_title || siteTitle)}" />`,
        `<meta property="og:image" content="${escHtmlS(shareImage)}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${escHtmlS(siteTitle)}" />`,
        `<meta name="twitter:description" content="${escHtmlS(siteDesc)}" />`,
        `<meta name="twitter:image" content="${escHtmlS(shareImage)}" />`,
      ].join("\n");
      // 首屏数据内联：把真实用户首屏所需的站点设置（及首页文章列表、标签）直接写进 HTML，
      // 前端即可跳过 /api/settings、/api/posts、/api/tags 三次往返、立即渲染（首页 LCP 不再等接口）。
      // 仅真实用户受益（爬虫已在上面返回预渲染页、不执行 JS，无需内联；这里不会执行到）。
      let inlineData = "";
      let preloadImg = "";
      try {
        if (docSettings && Object.keys(docSettings).length) {
          const initData: Record<string, unknown> = { settings: docSettings };
          if (path.length === 0 || path[0] === "index.html") {
            const rows = await listPosts(env.DB, { admin: false });
            initData.posts = rows.map(cardOf);
            // 首篇即首页精选大卡封面，通常是 LCP 元素；提前预加载，与 HTML/CSS 并行下载，压缩首屏绘制时间
            const cover = rows[0] && rows[0].cover;
            if (cover) preloadImg = `<link rel="preload" as="image" href="${escHtmlS(absUrl(cover, base))}" />`;
          }
          // R21 Islands：文章路径直通首屏把正文随文档内联，前端 renderPost 免一次 /api/posts/:slug 往返。
          // 剔除 embedding（768 维大数组）避免 HTML 膨胀；公开可见性由 admin:false 保证。
          if (path[0] === "post" && path.length === 2) {
            try {
              const slugParam = decodeURIComponent(path[1]);
              const postRow = await getPostBySlug(env.DB, slugParam, { admin: false });
              if (postRow) {
                const inlinePost: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(postRow)) if (k !== "embedding") inlinePost[k] = v;
                initData.post = inlinePost;
                if (postRow.cover) preloadImg = `<link rel="preload" as="image" href="${escHtmlS(absUrl(postRow.cover, base))}" />`;
              }
            } catch {}
          }
          initData.tags = await listTags(env.DB);
          inlineData = `<script>window.__INITIAL__=${JSON.stringify(initData).replace(/</g, "\\u003c")}</script>`;
        }
      } catch (e) { inlineData = ""; }
      // 注入自定义 CSS（设置页 ⑪ 高级自定义）：在 </head> 前插入，作用于前端 SPA 整站
      const customCss = docSettings.custom_css || "";
      const styleTag = customCss ? `<style data-custom-css>\n${customCss}\n</style>` : "";
      const txt = await assetResp.text();
      const injected = txt
        .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escHtmlS(siteTitle)}</title>`)
        .replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${escHtmlS(canonicalUrl)}" />`)
        .replace("</head>", `${defaultOg}\n${styleTag}\n${preloadImg}\n${inlineData}\n</head>`);
      // 文档已被改写，原 content-length 失效，交给运行时重算（否则可能被截断）
      h.delete("content-length");
      return new Response(injected, { status: assetResp.status, headers: h });
    }
    // 静态资源（带扩展名：/css、/js、/vendor、图片等）：按类型注入缓存与安全头
    const assetHeaders = new Headers(assetResp.headers);
    assetHeaders.set("Cache-Control", assetCacheControl(new URL(req.url).pathname));
    for (const [k, v] of Object.entries(securityHeaders())) assetHeaders.set(k, v);
    return new Response(assetResp.body, { status: assetResp.status, headers: assetHeaders });
  },
} satisfies ExportedHandler<Env>;

