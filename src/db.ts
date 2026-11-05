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

export async function getOrCreatePasswordAdmin(db: DB, username = "admin"): Promise<UserRow> {
  const existing = (await db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first()) as UserRow | null;
  if (existing) return existing;
  const ts = now();
  await db
    .prepare("INSERT INTO users (username, role, created_at) VALUES (?, 'admin', ?)")
    .bind(username, ts)
    .run();
  return (await db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first()) as UserRow;
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

export async function getUserBySession(db: DB, token: string | undefined): Promise<UserRow | null> {
  if (!token) return null;
  const s = (await db
    .prepare("SELECT user_id FROM sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > ?)")
    .bind(token, now())
    .first()) as { user_id: number } | null;
  if (!s) return null;
  return getUserById(db, s.user_id);
}

export async function deleteSession(db: DB, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
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
