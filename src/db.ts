// D1 数据访问层 —— 文章 / 用户 / 会话

export interface PostRow {
  id: number;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  cover: string | null;
  visibility: string;
  ai_notes: string | null;
  tags: string | null;
  created_at: number;
  updated_at: number;
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

/** 列表：非管理员只能看 public；管理员可见全部（可再按 visibility 过滤） */
export async function listPosts(
  db: DB,
  opts: { admin?: boolean; visibility?: string } = {}
): Promise<PostRow[]> {
  const where: string[] = [];
  const params: any[] = [];
  if (!opts.admin) {
    where.push("visibility = ?");
    params.push("public");
  } else if (opts.visibility) {
    where.push("visibility = ?");
    params.push(opts.visibility);
  }
  const sql =
    "SELECT * FROM posts" +
    (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY created_at DESC";
  const r = await db.prepare(sql).bind(...params).all();
  return (r.results as PostRow[]) || [];
}

export async function getPostBySlug(
  db: DB,
  slug: string,
  opts: { admin?: boolean } = {}
): Promise<PostRow | null> {
  const row = (await db
    .prepare("SELECT * FROM posts WHERE slug = ?")
    .bind(slug)
    .first()) as PostRow | null;
  if (!row) return null;
  if (row.visibility !== "public" && !opts.admin) return null;
  return row;
}

export async function getPostById(
  db: DB,
  id: number,
  opts: { admin?: boolean } = {}
): Promise<PostRow | null> {
  const row = (await db
    .prepare("SELECT * FROM posts WHERE id = ?")
    .bind(id)
    .first()) as PostRow | null;
  if (!row) return null;
  if (row.visibility !== "public" && !opts.admin) return null;
  return row;
}

export async function createPost(
  db: DB,
  data: { title: string; content: string; excerpt?: string; cover?: string; visibility?: string; author_id?: number | null; ai_notes?: string; tags?: string }
): Promise<PostRow> {
  const slug = slugify(data.title);
  const ts = now();
  const excerpt = (data.excerpt || data.content.replace(/[#>*`\-\s]/g, "").slice(0, 120)).trim();
  const visibility = data.visibility || "public";
  const cover = data.cover || null;
  const ai_notes = data.ai_notes ?? null;
  const tags = data.tags ? stringifyTags(parseTags(data.tags)) : "[]";
  await db
    .prepare(
      "INSERT INTO posts (slug, title, content, excerpt, cover, visibility, ai_notes, tags, created_at, updated_at, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(slug, data.title, data.content, excerpt, cover, visibility, ai_notes, tags, ts, ts, data.author_id ?? null)
    .run();
  return (await getPostBySlug(db, slug, { admin: true }))!;
}

export async function updatePost(
  db: DB,
  id: number,
  data: { title?: string; content?: string; excerpt?: string; cover?: string; visibility?: string; ai_notes?: string; tags?: string }
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
  const ai_notes = data.ai_notes !== undefined ? data.ai_notes : existing.ai_notes;
  const tags = data.tags !== undefined ? stringifyTags(parseTags(data.tags)) : existing.tags;
  const ts = now();
  await db
    .prepare(
      "UPDATE posts SET title = ?, content = ?, excerpt = ?, cover = ?, visibility = ?, ai_notes = ?, tags = ?, updated_at = ? WHERE id = ?"
    )
    .bind(title, content, excerpt, cover, visibility, ai_notes, tags, ts, id)
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

export async function createSession(db: DB, userId: number): Promise<string> {
  const token = crypto.randomUUID();
  await db
    .prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)")
    .bind(token, userId, now())
    .run();
  return token;
}

export async function getUserBySession(db: DB, token: string | undefined): Promise<UserRow | null> {
  if (!token) return null;
  const s = (await db.prepare("SELECT user_id FROM sessions WHERE token = ?").bind(token).first()) as
    | { user_id: number }
    | null;
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

// ---------------- 评论 ----------------

export interface CommentRow {
  id: number;
  post_slug: string;
  author: string;
  email: string | null;
  content: string;
  created_at: number;
}

export async function listComments(db: DB, postSlug: string): Promise<CommentRow[]> {
  const r = await db
    .prepare("SELECT * FROM comments WHERE post_slug = ? ORDER BY created_at ASC")
    .bind(postSlug)
    .all();
  return (r.results as CommentRow[]) || [];
}

export async function createComment(
  db: DB,
  data: { post_slug: string; author: string; email?: string | null; content: string }
): Promise<CommentRow> {
  const ts = now();
  await db
    .prepare("INSERT INTO comments (post_slug, author, email, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(data.post_slug, data.author, data.email || null, data.content, ts)
    .run();
  return (await db
    .prepare("SELECT * FROM comments WHERE post_slug = ? ORDER BY created_at DESC LIMIT 1")
    .bind(data.post_slug)
    .first()) as CommentRow;
}
