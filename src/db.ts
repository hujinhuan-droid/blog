// D1 数据访问层 —— 文章 / 用户 / 会话 / 互动

export interface PostRow {
  id: number;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  cover: string | null;
  visibility: string;
  status: string; // 'published' | 'draft'
  scheduled_at: number | null;
  views: number;
  ai_notes: string | null;
  tags: string | null;
  embedding: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  author_id: number | null;
}

/** 将 posts.tags（JSON 数组字符串，或逗号分隔兜底）解析为标签数组 */
export function parseTags(t: string | null | undefined): string[] {
  if (!t) return [];
  try {
    const a = JSON.parse(t);
    if (Array.isArray(a)) return a.map((x) => String(x).trim()).filter(Boolean);
  } catch {}
  return String(t)
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** 将标签数组规范化（去重、去空、去首尾空格）为 JSON 数组字符串后存储 */
export function stringifyTags(arr: string[]): string {
  const clean = Array.from(
    new Set(
      arr
        .flatMap((x) => String(x).split(/[,，]/))
        .map((x) => x.trim())
        .filter(Boolean)
    )
  );
  return JSON.stringify(clean);
}

export interface UserRow {
  id: number;
  github_id: string | null;
  username: string;
  avatar: string | null;
  email: string | null;
  role: string;
  password_hash: string | null;
  created_at: number;
}

export type DB = D1Database;

export function now(): number {
  return Date.now();
}

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^\w一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const clean = base || "post";
  return `${clean}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 列表：非管理员只能看 public + 已发布 + 未到定时时间的文章；管理员可见全部（可再按 visibility 过滤）。
 *  回收站：opts.trash=true（仅管理员）只列出已软删文章；否则默认排除已软删（deleted_at IS NOT NULL）。 */
export async function listPosts(
  db: DB,
  opts: { admin?: boolean; visibility?: string; trash?: boolean } = {}
): Promise<PostRow[]> {
  const where: string[] = [];
  const params: any[] = [];
  if (opts.trash) {
    where.push("deleted_at IS NOT NULL");
  } else {
    where.push("deleted_at IS NULL");
    if (!opts.admin) {
      where.push("visibility = ?");
      params.push("public");
      where.push("status = ?");
      params.push("published");
      where.push("(scheduled_at IS NULL OR scheduled_at <= ?)");
      params.push(now());
    } else if (opts.visibility) {
      where.push("visibility = ?");
      params.push(opts.visibility);
    }
  }
  const sql =
    "SELECT posts.*, COALESCE(c.cnt, 0) AS comment_count " +
    "FROM posts " +
    "LEFT JOIN (SELECT post_slug, COUNT(*) AS cnt FROM comments GROUP BY post_slug) c ON c.post_slug = posts.slug " +
    (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY " + (opts.trash ? "deleted_at DESC" : "created_at DESC");
  const r = await db.prepare(sql).bind(...params).all();
  return (r.results as unknown as PostRow[]) || [];
}

export async function getPostBySlug(
  db: DB,
  slug: string,
  opts: { admin?: boolean; trash?: boolean } = {}
): Promise<PostRow | null> {
  const row = (await db
    .prepare("SELECT * FROM posts WHERE slug = ?")
    .bind(slug)
    .first()) as PostRow | null;
  if (!row) return null;
  // 已进回收站：非管理员一律不可见；管理员仅在显式 trash 时才可访问
  if (row.deleted_at) {
    if (!opts.admin) return null;
    if (!opts.trash) return null;
  }
  if (!opts.admin) {
    if (row.visibility !== "public") return null;
    if (row.status && row.status !== "published") return null;
    if (row.scheduled_at && row.scheduled_at > now()) return null;
  }
  return row;
}

export async function getPostById(
  db: DB,
  id: number,
  opts: { admin?: boolean; trash?: boolean } = {}
): Promise<PostRow | null> {
  const row = (await db
    .prepare("SELECT * FROM posts WHERE id = ?")
    .bind(id)
    .first()) as PostRow | null;
  if (!row) return null;
  if (row.deleted_at) {
    if (!opts.admin) return null;
    if (!opts.trash) return null;
  }
  if (!opts.admin) {
    if (row.visibility !== "public") return null;
    if (row.status && row.status !== "published") return null;
    if (row.scheduled_at && row.scheduled_at > now()) return null;
  }
  return row;
}

/** 软删除（进回收站） */
export async function softDeletePost(db: DB, id: number): Promise<boolean> {
  const r = await db
    .prepare("UPDATE posts SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
    .bind(now(), now(), id)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}

/** 从回收站恢复 */
export async function restorePost(db: DB, id: number): Promise<boolean> {
  const r = await db
    .prepare("UPDATE posts SET deleted_at = NULL, updated_at = ? WHERE id = ?")
    .bind(now(), id)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}

/** 彻底删除（从回收站清除） */
export async function purgePost(db: DB, id: number): Promise<boolean> {
  const r = await db.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
  return (r.meta?.changes ?? 0) > 0;
}

/** 回收站列表（管理员） */
export async function listTrash(db: DB): Promise<PostRow[]> {
  return listPosts(db, { admin: true, trash: true });
}

export async function createPost(
  db: DB,
  data: {
    title: string;
    content: string;
    excerpt?: string;
    cover?: string;
    visibility?: string;
    status?: string;
    scheduled_at?: number | null;
    author_id?: number | null;
    ai_notes?: string;
    tags?: string;
    embedding?: number[] | string;
  }
): Promise<PostRow> {
  const slug = slugify(data.title);
  const ts = now();
  const excerpt = (data.excerpt || data.content.replace(/[#>*`\-\s]/g, "").slice(0, 120)).trim();
  const visibility = data.visibility || "public";
  const status = data.status || "published";
  const scheduled_at = data.scheduled_at != null ? data.scheduled_at : null;
  const cover = data.cover || null;
  const ai_notes = data.ai_notes ?? null;
  const tags = data.tags ? stringifyTags(parseTags(data.tags)) : "[]";
  const embedding = data.embedding ? (Array.isArray(data.embedding) ? JSON.stringify(data.embedding) : String(data.embedding)) : null;
  await db
    .prepare(
      "INSERT INTO posts (slug, title, content, excerpt, cover, visibility, status, scheduled_at, ai_notes, tags, embedding, created_at, updated_at, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(slug, data.title, data.content, excerpt, cover, visibility, status, scheduled_at, ai_notes, tags, embedding, ts, ts, data.author_id ?? null)
    .run();
  return (await getPostBySlug(db, slug, { admin: true }))!;
}

export async function updatePost(
  db: DB,
  id: number,
  data: {
    title?: string;
    content?: string;
    excerpt?: string;
    cover?: string;
    visibility?: string;
    status?: string;
    scheduled_at?: number | null;
    ai_notes?: string;
    tags?: string;
    embedding?: number[] | string;
  }
): Promise<PostRow | null> {
  const existing = (await db.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first()) as PostRow | null;
  if (!existing) return null;
  const title = data.title ?? existing.title;
  const content = data.content ?? existing.content;
  const excerpt =
    data.excerpt ??
    (content.replace(/[#>*`\-\s]/g, "").slice(0, 120)).trim();
  const cover = data.cover !== undefined ? data.cover : existing.cover;
  const visibility = data.visibility ?? existing.visibility;
  const status = data.status ?? existing.status;
  const scheduled_at = data.scheduled_at !== undefined ? data.scheduled_at : existing.scheduled_at;
  const ai_notes = data.ai_notes !== undefined ? data.ai_notes : existing.ai_notes;
  const tags = data.tags !== undefined ? stringifyTags(parseTags(data.tags)) : existing.tags;
  const embedding = data.embedding !== undefined
    ? (Array.isArray(data.embedding) ? JSON.stringify(data.embedding) : String(data.embedding))
    : existing.embedding;
  const ts = now();
  await db
    .prepare(
      "UPDATE posts SET title = ?, content = ?, excerpt = ?, cover = ?, visibility = ?, status = ?, scheduled_at = ?, ai_notes = ?, tags = ?, embedding = ?, updated_at = ? WHERE id = ?"
    )
    .bind(title, content, excerpt, cover, visibility, status, scheduled_at, ai_notes, tags, embedding, ts, id)
    .run();
  return (await getPostById(db, id, { admin: true }))!;
}

/** 统计所有文章（公开/全部）的标签及其出现次数，用于标签页云 */
export async function listTags(
  db: DB,
  opts: { admin?: boolean } = {}
): Promise<{ tag: string; count: number }[]> {
  const posts = await listPosts(db, { admin: !!opts.admin });
  const counter: Record<string, number> = {};
  for (const p of posts) {
    for (const t of parseTags(p.tags)) {
      counter[t] = (counter[t] || 0) + 1;
    }
  }
  return Object.entries(counter)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export async function deletePost(db: DB, id: number): Promise<boolean> {
  const r = await db.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
  return (r.meta?.changes ?? 0) > 0;
}

// ---------------- 用户 / 会话 ----------------

export async function upsertGithubUser(
  db: DB,
  profile: { github_id: string; username: string; avatar: string; email: string }
): Promise<UserRow> {
  const existing = (await db
    .prepare("SELECT * FROM users WHERE github_id = ?")
    .bind(profile.github_id)
    .first()) as UserRow | null;
  if (existing) {
    await db
      .prepare("UPDATE users SET username = ?, avatar = ?, email = ? WHERE id = ?")
      .bind(profile.username, profile.avatar, profile.email, existing.id)
      .run();
    return (await db.prepare("SELECT * FROM users WHERE id = ?").bind(existing.id).first()) as UserRow;
  }
  // 第一个注册用户自动成为管理员
  const count = ((await db.prepare("SELECT COUNT(*) c FROM users").first()) as any).c;
  const role = count === 0 ? "admin" : "member";
  const ts = now();
  await db
    .prepare(
      "INSERT INTO users (github_id, username, avatar, email, role, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(profile.github_id, profile.username, profile.avatar, profile.email, role, ts)
    .run();
  return (await db.prepare("SELECT * FROM users WHERE github_id = ?").bind(profile.github_id).first()) as UserRow;
}

export async function getUserById(db: DB, id: number): Promise<UserRow | null> {
  return (await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first()) as UserRow | null;
}

export async function createSession(db: DB, userId: number, expiresAt?: number): Promise<string> {
  const token = crypto.randomUUID();
  await db
    .prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(token, userId, now(), expiresAt ?? null)
    .run();
  return token;
}

// ---------------- 站点设置（键值对） ----------------

// 允许通过接口写入的设置键（白名单，避免任意键污染）
export const SETTING_KEYS = [
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
  "notify_email",
  "webhooks",
  // —— 高级自定义（D 组） ——
  "custom_css",
  "maintenance_mode",
  "maintenance_text",
  "rss_title",
  "rss_count",
  "rss_full",
  "cache_ttl",
  "session_ttl",
  // —— 品牌与合规（A 组） ——
  "site_logo",
  "social_links",
  "beian_icp",
  "beian_gongan",
  "privacy_url",
  "friend_links",
  // —— 登录安全（失败锁定） ——
  "login_lock_enabled",
  "login_max_attempts",
  "login_lock_minutes",
  // —— SEO 与站长工具（B 组） ——
  "og_image",
  "sitemap_enabled",
  "extra_head",
  "stats_code",
  "motion_level",
  // —— 文章页作者名片（C 组） ——
  "author_name",
  "author_bio",
  "author_avatar",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export async function getSettings(db: DB): Promise<Record<string, string>> {
  const r = await db.prepare("SELECT key, value FROM settings").all();
  const out: Record<string, string> = {};
  for (const row of ((r.results as any[]) || []) as { key: string; value: string }[]) {
    out[row.key] = row.value;
  }
  return out;
}

export async function setSettings(db: DB, values: Record<string, string>): Promise<void> {
  for (const [k, v] of Object.entries(values)) {
    if (!SETTING_KEYS.includes(k as SettingKey)) continue;
    await db
      .prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .bind(k, v)
      .run();
  }
}

// 轻量计数器（如 AI 调用量统计）
export async function getMeta(db: DB, k: string): Promise<number> {
  const r = (await db.prepare("SELECT v FROM meta WHERE k = ?").bind(k).first()) as { v: number } | null;
  return r ? Number(r.v) || 0 : 0;
}

export async function incMeta(db: DB, k: string, by = 1): Promise<void> {
  await db
    .prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = v + ?")
    .bind(k, by, by)
    .run();
}

// 站点总阅读量（看板用）
export async function getTotalViews(db: DB): Promise<number> {
  const r = (await db.prepare("SELECT COALESCE(SUM(views),0) v FROM posts WHERE deleted_at IS NULL").first()) as { v: number } | null;
  return r ? Number(r.v) || 0 : 0;
}

// ---------------- 审计日志 ----------------

export async function logAudit(
  db: DB,
  data: { actor?: string | null; action: string; target?: string; detail?: string }
): Promise<void> {
  try {
    await db
      .prepare("INSERT INTO audit_log (actor, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(data.actor || "system", data.action, data.target || "", data.detail || "", now())
      .run();
  } catch {
    // 审计失败不应阻断主流程
  }
}

export async function listAudit(db: DB, limit = 200): Promise<any[]> {
  const r = await db
    .prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?")
    .bind(limit)
    .all();
  return (r.results as any[]) || [];
}

// ---------------- 数据分析 ----------------

/** 热门文章 TOP n（按阅读量，排除回收站） */
export async function getPopularPosts(db: DB, n = 10): Promise<any[]> {
  const r = await db
    .prepare("SELECT id, slug, title, cover, views FROM posts WHERE deleted_at IS NULL AND status = 'published' ORDER BY views DESC LIMIT ?")
    .bind(n)
    .all();
  return (r.results as any[]) || [];
}

/** 流量来源（按天/域名聚合，最近 days 天） */
export async function getRefererStats(db: DB, days = 30): Promise<{ domain: string; cnt: number }[]> {
  const day = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const r = await db
    .prepare(
      "SELECT domain, SUM(cnt) AS cnt FROM referer_daily WHERE day >= ? GROUP BY domain ORDER BY cnt DESC LIMIT 50"
    )
    .bind(day)
    .all();
  return (r.results as any[]) || [];
}

export async function recordReferer(db: DB, domain: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  await db
    .prepare(
      "INSERT INTO referer_daily (day, domain, cnt) VALUES (?, ?, 1) ON CONFLICT(day, domain) DO UPDATE SET cnt = cnt + 1"
    )
    .bind(day, domain)
    .run();
}

/** IndexNow 推送日志 */
export async function logIndexNow(db: DB, url: string, status: number, resp: string): Promise<void> {
  try {
    await db
      .prepare("INSERT INTO indexnow_log (url, status, resp, created_at) VALUES (?, ?, ?, ?)")
      .bind(url, status, String(resp).slice(0, 500), now())
      .run();
  } catch {}
}

export async function listIndexNowLog(db: DB, limit = 100): Promise<any[]> {
  const r = await db.prepare("SELECT * FROM indexnow_log ORDER BY created_at DESC LIMIT ?").bind(limit).all();
  return (r.results as any[]) || [];
}

// ---------------- 评论（支持嵌套） ----------------

export interface CommentRow {
  id: number;
  post_slug: string;
  author: string;
  email: string | null;
  content: string;
  parent_id: number;
  status: string;
  created_at: number;
}

export async function listComments(
  db: DB,
  postSlug: string,
  opts: { status?: string } = {}
): Promise<CommentRow[]> {
  let sql = "SELECT * FROM comments WHERE post_slug = ?";
  const params: any[] = [postSlug];
  if (opts.status) {
    sql += " AND status = ?";
    params.push(opts.status);
  }
  sql += " ORDER BY created_at ASC";
  const r = await db.prepare(sql).bind(...params).all();
  return (r.results as unknown as CommentRow[]) || [];
}

export async function listCommentsByStatus(
  db: DB,
  status: string
): Promise<(CommentRow & { post_title?: string })[]> {
  const r = await db
    .prepare(
      "SELECT c.*, p.title AS post_title FROM comments c LEFT JOIN posts p ON p.slug = c.post_slug WHERE c.status = ? ORDER BY c.created_at DESC"
    )
    .bind(status)
    .all();
  return (r.results as any[]) || [];
}

export async function setCommentStatus(db: DB, id: number, status: string): Promise<boolean> {
  const r = await db.prepare("UPDATE comments SET status = ? WHERE id = ?").bind(status, id).run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function createComment(
  db: DB,
  data: { post_slug: string; author: string; email?: string | null; content: string; parent_id?: number; status?: string }
): Promise<CommentRow> {
  const ts = now();
  const parent_id = data.parent_id || 0;
  const status = data.status || "approved";
  await db
    .prepare("INSERT INTO comments (post_slug, author, email, content, parent_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(data.post_slug, data.author, data.email || null, data.content, parent_id, status, ts)
    .run();
  return (await db
    .prepare("SELECT * FROM comments WHERE post_slug = ? ORDER BY created_at DESC LIMIT 1")
    .bind(data.post_slug)
    .first()) as CommentRow;
}

// ---------------- 点赞 / 收藏 ----------------

export interface ReactionCounts {
  likes: number;
  favorites: number;
}

export async function getReactionCounts(db: DB, postId: number): Promise<ReactionCounts> {
  const r = await db
    .prepare("SELECT kind, COUNT(*) c FROM reactions WHERE post_id = ? GROUP BY kind")
    .bind(postId)
    .all();
  const out: ReactionCounts = { likes: 0, favorites: 0 };
  for (const row of (r.results as any[]) || []) {
    if (row.kind === "like") out.likes = Number(row.c) || 0;
    else if (row.kind === "favorite") out.favorites = Number(row.c) || 0;
  }
  return out;
}

// 切换点赞/收藏：已点则取消，未点则插入。返回最新计数与本用户是否已点（acted）
export async function toggleReaction(
  db: DB,
  postId: number,
  kind: string,
  userKey: string
): Promise<ReactionCounts & { acted: boolean }> {
  const existing = await db
    .prepare("SELECT id FROM reactions WHERE post_id = ? AND kind = ? AND user_key = ?")
    .bind(postId, kind, userKey)
    .first();
  if (existing) {
    await db
      .prepare("DELETE FROM reactions WHERE post_id = ? AND kind = ? AND user_key = ?")
      .bind(postId, kind, userKey)
      .run();
  } else {
    await db
      .prepare("INSERT INTO reactions (post_id, kind, user_key, created_at) VALUES (?, ?, ?, ?)")
      .bind(postId, kind, userKey, now())
      .run();
  }
  const counts = await getReactionCounts(db, postId);
  return { ...counts, acted: !existing };
}

/* ============================================================================
   v3.1 后台增强：文章版本历史 / 站内搜索分析 / 标签管理
   ----------------------------------------------------------------------------
   这三块都只在管理侧使用，不改动任何前台读取路径的行为。
   所有新表由 migrations/0013_admin_plus.sql 创建，worker 侧另有幂等兜底。
   ========================================================================== */

// ── 文章版本历史 ────────────────────────────────────────────────────────────

export interface RevisionRow {
  id: number;
  post_id: number;
  title: string;
  content: string;
  excerpt: string;
  tags: string;
  status: string | null;
  actor: string | null;
  note: string | null;
  created_at: number;
}

/** 每篇文章保留的版本上限：超出后删最老的，防止 D1 体积失控 */
const REVISION_KEEP = 30;
/** 同一篇文章两次快照的最小间隔（毫秒）：连续自动保存不刷屏。
    注意：全站时间戳统一用毫秒（与 db.now() / posts.scheduled_at 一致）。 */
const REVISION_MIN_GAP = 90 * 1000;

/**
 * 为「更新前」的文章状态留一份快照。
 * 调用时机：updatePost 真正改动 title/content 之前。
 * 内容与上一版完全相同则跳过，避免重复快照。
 */
export async function snapshotRevision(
  db: DB,
  postId: number,
  actor: string,
  note = "",
  force = false
): Promise<boolean> {
  const row = (await db.prepare("SELECT * FROM posts WHERE id = ?").bind(postId).first()) as PostRow | null;
  if (!row) return false;

  const last = (await db
    .prepare("SELECT title, content, created_at FROM post_revisions WHERE post_id = ? ORDER BY id DESC LIMIT 1")
    .bind(postId)
    .first()) as { title: string; content: string; created_at: number } | null;

  const ts = Date.now();
  if (last && last.title === row.title && last.content === row.content) return false;
  // force：回滚等关键动作必须留档，不受间隔合并影响
  if (!force && last && ts - Number(last.created_at) < REVISION_MIN_GAP) {
    // 间隔太近但内容确有变化：覆盖上一版，而不是堆一串近似版本
    await db
      .prepare("UPDATE post_revisions SET title = ?, content = ?, excerpt = ?, tags = ?, status = ?, actor = ?, note = ?, created_at = ? WHERE post_id = ? AND id = (SELECT id FROM post_revisions WHERE post_id = ? ORDER BY id DESC LIMIT 1)")
      .bind(row.title, row.content, row.excerpt, row.tags || "[]", row.status, actor, note, ts, postId, postId)
      .run();
    return true;
  }

  await db
    .prepare(
      "INSERT INTO post_revisions (post_id, title, content, excerpt, tags, status, actor, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(postId, row.title, row.content, row.excerpt, row.tags || "[]", row.status, actor, note, ts)
    .run();

  // 裁剪：只留最近 REVISION_KEEP 条
  await db
    .prepare(
      "DELETE FROM post_revisions WHERE post_id = ? AND id NOT IN (SELECT id FROM post_revisions WHERE post_id = ? ORDER BY id DESC LIMIT ?)"
    )
    .bind(postId, postId, REVISION_KEEP)
    .run();
  return true;
}

/** 版本列表（不含 content，只带长度与摘要，列表页轻量） */
export async function listRevisions(
  db: DB,
  postId: number
): Promise<Array<Omit<RevisionRow, "content"> & { content_length: number }>> {
  const { results } = await db
    .prepare(
      "SELECT id, post_id, title, excerpt, tags, status, actor, note, created_at, LENGTH(content) AS content_length FROM post_revisions WHERE post_id = ? ORDER BY id DESC LIMIT ?"
    )
    .bind(postId, REVISION_KEEP)
    .all();
  return (results || []) as any;
}

export async function getRevision(db: DB, postId: number, revId: number): Promise<RevisionRow | null> {
  return ((await db
    .prepare("SELECT * FROM post_revisions WHERE id = ? AND post_id = ?")
    .bind(revId, postId)
    .first()) as RevisionRow) || null;
}

/**
 * 回滚到指定版本：先把「当前状态」存成新版本（回滚本身可再撤销），再写回。
 * 返回回滚后的文章行。
 */
export async function restoreRevision(
  db: DB,
  postId: number,
  revId: number,
  actor: string
): Promise<{ ok: boolean; msg: string; post?: PostRow }> {
  const rev = await getRevision(db, postId, revId);
  if (!rev) return { ok: false, msg: "版本不存在" };
  const cur = (await db.prepare("SELECT * FROM posts WHERE id = ?").bind(postId).first()) as PostRow | null;
  if (!cur) return { ok: false, msg: "文章不存在" };

  // 回滚前留档，保证「回滚」这个动作也能被回滚
  await snapshotRevision(db, postId, actor, `回滚到 #${revId} 之前`, true);

  const ts = Date.now();
  await db
    .prepare("UPDATE posts SET title = ?, content = ?, excerpt = ?, tags = ?, updated_at = ? WHERE id = ?")
    .bind(rev.title, rev.content, rev.excerpt, rev.tags || "[]", ts, postId)
    .run();
  const post = (await getPostById(db, postId, { admin: true })) || undefined;
  return { ok: true, msg: `已回滚到 ${new Date(Number(rev.created_at)).toLocaleString("zh-CN")} 的版本`, post };
}

// ── 站内搜索分析 ────────────────────────────────────────────────────────────

/** 记录一次搜索。空关键词不记；同一关键词 10 秒内合并计数，避免连打多次刷量。 */
export async function logSearch(db: DB, keyword: string, hits: number): Promise<void> {
  const kw = String(keyword || "").trim().slice(0, 60);
  if (!kw) return;
  const ts = Date.now();
  try {
    const last = (await db
      .prepare("SELECT id, created_at FROM search_log WHERE keyword = ? ORDER BY id DESC LIMIT 1")
      .bind(kw)
      .first()) as { id: number; created_at: number } | null;
    if (last && ts - Number(last.created_at) < 10000) {
      await db.prepare("UPDATE search_log SET hits = ?, created_at = ? WHERE id = ?").bind(hits, ts, last.id).run();
      return;
    }
    await db.prepare("INSERT INTO search_log (keyword, hits, created_at) VALUES (?, ?, ?)").bind(kw, hits, ts).run();
  } catch {
    // 日志失败绝不影响搜索本身
  }
}

export interface SearchStat {
  keyword: string;
  count: number;
  last_at: number;
  empty: boolean;
}

/** 搜索统计：Top 关键词、零结果词、总量与近 7 日趋势 */
export async function getSearchStats(db: DB, days = 30): Promise<{
  total: number;
  unique: number;
  emptyRate: number;
  top: SearchStat[];
  empty: SearchStat[];
  daily: Array<{ day: string; count: number }>;
}> {
  const since = Date.now() - days * 86400000;
  const { results } = await db
    .prepare(
      `SELECT keyword, COUNT(*) AS count, MAX(created_at) AS last_at,
              SUM(CASE WHEN hits = 0 THEN 1 ELSE 0 END) AS empty_hits
       FROM search_log WHERE created_at >= ? GROUP BY keyword
       ORDER BY count DESC LIMIT 60`
    )
    .bind(since)
    .all();
  const rows = (results || []) as any[];
  const toStat = (r: any): SearchStat => ({
    keyword: r.keyword,
    count: Number(r.count) || 0,
    last_at: Number(r.last_at) || 0,
    empty: (Number(r.empty_hits) || 0) * 2 >= (Number(r.count) || 1),
  });
  const all = rows.map(toStat);
  const total = all.reduce((s, x) => s + x.count, 0);
  const emptyCount = rows.reduce((s, r) => s + (Number(r.empty_hits) || 0), 0);

  const { results: dailyRows } = await db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS count
       FROM search_log WHERE created_at >= ? GROUP BY day ORDER BY day`
    )
    .bind(Date.now() - 7 * 86400000)
    .all();

  return {
    total,
    unique: all.length,
    emptyRate: total ? Math.round((emptyCount / total) * 100) : 0,
    top: all.slice(0, 15),
    empty: all.filter((x) => x.empty).sort((a, b) => b.count - a.count).slice(0, 15),
    // 补齐最近 7 天（缺失的天记 0），否则柱状图在只有一两天数据时会只剩孤零零一根
    daily: (() => {
      const map = new Map<string, number>();
      for (const r of (dailyRows || []) as any[]) map.set(String(r.day), Number(r.count) || 0);
      const out: Array<{ day: string; count: number }> = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        out.push({ day: key, count: map.get(key) || 0 });
      }
      return out;
    })(),
  };
}

// ── 标签管理（重命名 / 合并 / 删除）────────────────────────────────────────

/** 带文章数的标签清单（管理侧） */
export async function listTagStats(db: DB): Promise<{ tag: string; count: number }[]> {
  return listTags(db, { admin: true });
}

/**
 * 批量改写所有文章的标签。
 * mapper 收到当前标签数组，返回新数组；为空则整条跳过（不写库）。
 * 返回被改动的文章数。逐条串行更新，避免 D1 batch 的语句数上限。
 */
async function rewriteTags(db: DB, mapper: (arr: string[]) => string[] | null): Promise<number> {
  const { results } = await db.prepare("SELECT id, tags FROM posts WHERE deleted_at IS NULL").all();
  let changed = 0;
  for (const row of (results || []) as any[]) {
    const before = parseTags(row.tags);
    const after = mapper(before.slice());
    if (!after) continue;
    if (after.length === before.length && after.every((x, i) => x === before[i])) continue;
    await db.prepare("UPDATE posts SET tags = ? WHERE id = ?").bind(stringifyTags(after), row.id).run();
    changed++;
  }
  return changed;
}

/** 重命名标签：所有使用旧名的文章改为新名；同名冲突自动去重；旧名写入别名表 */
export async function renameTag(db: DB, from: string, to: string): Promise<{ ok: boolean; msg: string; changed: number }> {
  const a = String(from || "").trim();
  const b = String(to || "").trim();
  if (!a || !b) return { ok: false, msg: "标签名不能为空", changed: 0 };
  if (a === b) return { ok: false, msg: "新旧标签相同", changed: 0 };
  const changed = await rewriteTags(db, (arr) => {
    if (!arr.includes(a)) return null;
    const out = arr.map((x) => (x === a ? b : x));
    return Array.from(new Set(out));
  });
  if (changed === 0) return { ok: false, msg: `没有文章使用「${a}」`, changed: 0 };
  await db
    .prepare("INSERT INTO tag_aliases (alias, target, created_at) VALUES (?, ?, ?) ON CONFLICT(alias) DO UPDATE SET target = excluded.target")
    .bind(a, b, Date.now())
    .run();
  return { ok: true, msg: `「${a}」已重命名为「${b}」，影响 ${changed} 篇文章`, changed };
}

/** 合并多个标签到一个目标标签 */
export async function mergeTags(db: DB, fromList: string[], to: string): Promise<{ ok: boolean; msg: string; changed: number }> {
  const target = String(to || "").trim();
  const sources = Array.from(new Set((fromList || []).map((x) => String(x).trim()).filter((x) => x && x !== target)));
  if (!target) return { ok: false, msg: "目标标签不能为空", changed: 0 };
  if (!sources.length) return { ok: false, msg: "请选择至少一个要合并的标签", changed: 0 };
  const changed = await rewriteTags(db, (arr) => {
    if (!arr.some((x) => sources.includes(x))) return null;
    const out = arr.map((x) => (sources.includes(x) ? target : x));
    return Array.from(new Set(out));
  });
  const ts = Date.now();
  for (const s of sources) {
    await db
      .prepare("INSERT INTO tag_aliases (alias, target, created_at) VALUES (?, ?, ?) ON CONFLICT(alias) DO UPDATE SET target = excluded.target")
      .bind(s, target, ts)
      .run();
  }
  return { ok: true, msg: `已把 ${sources.length} 个标签合并到「${target}」，影响 ${changed} 篇文章`, changed };
}

/** 删除标签：从所有文章中移除，不改动文章其它内容 */
export async function deleteTag(db: DB, name: string): Promise<{ ok: boolean; msg: string; changed: number }> {
  const a = String(name || "").trim();
  if (!a) return { ok: false, msg: "标签名不能为空", changed: 0 };
  const changed = await rewriteTags(db, (arr) => (arr.includes(a) ? arr.filter((x) => x !== a) : null));
  if (changed === 0) return { ok: false, msg: `没有文章使用「${a}」`, changed: 0 };
  await db.prepare("DELETE FROM tag_aliases WHERE alias = ?").bind(a).run();
  return { ok: true, msg: `已删除标签「${a}」，影响 ${changed} 篇文章`, changed };
}

// ───────────────────────── 访问趋势分析 ─────────────────────────
export interface TrafficOptions {
  days?: number;
  device?: string;
  source?: string;
  slug?: string;
}

export interface TrafficResult {
  days: number;
  from: string;
  legacy: boolean; // 明细表尚无数据时，趋势回退到 views_daily 汇总
  total: number;   // 筛选后的 PV
  unique: number;  // 筛选后的 UV
  peak: number;    // 单日最高 PV
  avg: number;     // 日均 PV（按所选时间范围）
  activeDays: number; // 有访问的天数
  series: Array<{ day: string; pv: number; uv: number }>;
  devices: Array<{ name: string; cnt: number }>;
  sources: Array<{ name: string; cnt: number }>;
  landing: Array<{ slug: string; title: string; cnt: number }>;
  options: {
    devices: string[];
    sources: string[];
    slugs: Array<{ slug: string; title: string }>;
  };
}

/**
 * 按天 + 设备 + 来源 + 落地页聚合访问明细。
 * 所有筛选值走参数绑定，避免 SQL 注入；分布统计忽略「自身维度」的筛选，
 * 这样选中某设备后仍能看到完整的设备占比，方便直接切换。
 */
export async function getTrafficStats(db: DB, opts: TrafficOptions = {}): Promise<TrafficResult> {
  const allowed = [7, 30, 90, 365];
  const days = allowed.includes(Number(opts.days)) ? Number(opts.days) : 30;
  const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const device = String(opts.device || "").trim();
  const source = String(opts.source || "").trim();
  const slug = String(opts.slug || "").trim();

  const base: any[] = [from];
  const build = (skip: "" | "device" | "source" | "slug" = "", alias = "") => {
    const p = alias ? alias + "." : "";
    const w = [`${p}day >= ?`];
    const a: any[] = [...base];
    if (device && skip !== "device") { w.push(`${p}device = ?`); a.push(device); }
    if (source && skip !== "source") { w.push(`${p}source = ?`); a.push(source); }
    if (slug && skip !== "slug") { w.push(`${p}slug = ?`); a.push(slug); }
    return { sql: w.join(" AND "), args: a };
  };

  const empty = (): TrafficResult => ({
    days, from, legacy: false, total: 0, unique: 0, peak: 0, avg: 0, activeDays: 0,
    series: [], devices: [], sources: [], landing: [],
    options: { devices: [], sources: [], slugs: [] },
  });

  let out: TrafficResult;
  try {
    const anyRow = (await db.prepare("SELECT COUNT(*) AS n FROM visit_log WHERE day >= ?").bind(from).first()) as any;
    if (!Number(anyRow?.n)) {
      // 新埋点上线前的历史汇总数据（只有按天总量，没有维度）
      out = empty();
      out.legacy = true;
      const { results: legacyRows } = await db
        .prepare("SELECT day, views FROM views_daily WHERE day >= ? ORDER BY day")
        .bind(from).all();
      const legacyMap = new Map<string, number>();
      for (const r of (legacyRows || []) as any[]) legacyMap.set(String(r.day), Number(r.views) || 0);
      out.series = fillDays(days).map((d) => ({ day: d, pv: legacyMap.get(d) || 0, uv: 0 }));
      out.total = out.series.reduce((s, x) => s + x.pv, 0);
      out.peak = Math.max(0, ...out.series.map((x) => x.pv));
      out.avg = Math.round(out.total / days);
      out.activeDays = out.series.filter((x) => x.pv > 0).length;
      return out;
    }

    const main = build();
    const sum = (await db
      .prepare(`SELECT COUNT(*) AS pv, COUNT(DISTINCT NULLIF(visitor,'')) AS uv FROM visit_log WHERE ${main.sql}`)
      .bind(...main.args).first()) as any;

    const { results: dayRows } = await db
      .prepare(`SELECT day, COUNT(*) AS pv, COUNT(DISTINCT NULLIF(visitor,'')) AS uv FROM visit_log WHERE ${main.sql} GROUP BY day ORDER BY day`)
      .bind(...main.args).all();
    const dayMap = new Map<string, { pv: number; uv: number }>();
    for (const r of (dayRows || []) as any[]) {
      dayMap.set(String(r.day), { pv: Number(r.pv) || 0, uv: Number(r.uv) || 0 });
    }
    const series = fillDays(days).map((d) => ({ day: d, ...(dayMap.get(d) || { pv: 0, uv: 0 }) }));

    const dist = async (col: "device" | "source", skip: "device" | "source") => {
      const q = build(skip);
      const { results } = await db
        .prepare(`SELECT ${col} AS name, COUNT(*) AS cnt FROM visit_log WHERE ${q.sql} GROUP BY ${col} ORDER BY cnt DESC LIMIT 12`)
        .bind(...q.args).all();
      return ((results || []) as any[]).map((r) => ({ name: String(r.name || "unknown"), cnt: Number(r.cnt) || 0 }));
    };

    const qLanding = build("slug", "v");
    const { results: landRows } = await db
      .prepare(`SELECT v.slug AS slug, COALESCE(p.title, v.slug) AS title, COUNT(*) AS cnt
                FROM visit_log v LEFT JOIN posts p ON p.slug = v.slug
                WHERE ${qLanding.sql} AND v.slug <> '' GROUP BY v.slug ORDER BY cnt DESC LIMIT 12`)
      .bind(...qLanding.args).all();

    // 筛选项：只受时间范围影响，不受当前其它筛选影响
    const { results: optDev } = await db.prepare("SELECT DISTINCT device FROM visit_log WHERE day >= ?").bind(from).all();
    const { results: optSrc } = await db.prepare("SELECT DISTINCT source FROM visit_log WHERE day >= ?").bind(from).all();
    const { results: optSlug } = await db
      .prepare(`SELECT v.slug AS slug, COALESCE(p.title, v.slug) AS title, COUNT(*) AS cnt
                FROM visit_log v LEFT JOIN posts p ON p.slug = v.slug
                WHERE v.day >= ? AND v.slug <> '' GROUP BY v.slug ORDER BY cnt DESC LIMIT 100`)
      .bind(from).all();

    const total = Number(sum?.pv) || 0;
    out = {
      days, from, legacy: false,
      total,
      unique: Number(sum?.uv) || 0,
      peak: Math.max(0, ...series.map((x) => x.pv)),
      avg: Math.round(total / days),
      activeDays: series.filter((x) => x.pv > 0).length,
      series,
      devices: await dist("device", "device"),
      sources: await dist("source", "source"),
      landing: ((landRows || []) as any[]).map((r) => ({
        slug: String(r.slug || ""), title: String(r.title || r.slug || ""), cnt: Number(r.cnt) || 0,
      })),
      options: {
        devices: ((optDev || []) as any[]).map((r) => String(r.device || "")).filter(Boolean),
        sources: ((optSrc || []) as any[]).map((r) => String(r.source || "")).filter(Boolean),
        slugs: ((optSlug || []) as any[]).map((r) => ({ slug: String(r.slug || ""), title: String(r.title || "") })),
      },
    };
    return out;
  } catch {
    // 表缺失等异常时降级为空数据，不影响后台其它页面
    return empty();
  }
}

function fillDays(days: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) out.push(new Date(now - i * 86400000).toISOString().slice(0, 10));
  return out;
}

/**
 * 相邻文章：按发布时间轴取前后各一篇（只对匿名可见的已发布文章生效）。
 * prev = 更早发布的一篇，next = 更晚发布的一篇；created_at 相同用 id 兜底排序，避免同秒文章互相跳过。
 */
export async function getNeighbors(db: DB, slug: string): Promise<{
  prev: { slug: string; title: string; cover: string | null; tags: string | null; created_at: number } | null;
  next: { slug: string; title: string; cover: string | null; tags: string | null; created_at: number } | null;
}> {
  const cur = await getPostBySlug(db, slug, { admin: false });
  const none = { prev: null, next: null };
  if (!cur) return none;
  const cols = "id, slug, title, cover, tags, created_at";
  const visible = `deleted_at IS NULL AND visibility = 'public' AND status = 'published'
    AND (scheduled_at IS NULL OR scheduled_at <= ?)`;
  try {
    const older = await db.prepare(
      `SELECT ${cols} FROM posts WHERE ${visible}
        AND (created_at < ? OR (created_at = ? AND id < ?))
       ORDER BY created_at DESC, id DESC LIMIT 1`
    ).bind(now(), cur.created_at, cur.created_at, cur.id).first();
    const newer = await db.prepare(
      `SELECT ${cols} FROM posts WHERE ${visible}
        AND (created_at > ? OR (created_at = ? AND id > ?))
       ORDER BY created_at ASC, id ASC LIMIT 1`
    ).bind(now(), cur.created_at, cur.created_at, cur.id).first();
    const slim = (r: any) => r ? ({
      slug: String(r.slug), title: String(r.title), cover: r.cover || null,
      tags: r.tags || null, created_at: Number(r.created_at) || 0,
    }) : null;
    return { prev: slim(older), next: slim(newer) };
  } catch {
    return none;
  }
}
