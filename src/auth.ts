// 鉴权：GitHub OAuth + 账号密码登录 + 会话 cookie

import { UserRow, DB, createSession, upsertGithubUser } from "./db";

const SESSION_COOKIE = "sid";
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_PEPPER = "ai-agent-blog::login"; // 固定盐，防止相同密码在多处哈希一致

export interface AuthEnv {
  DB: DB;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  APP_URL?: string;
}

export function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = req.headers.get("cookie");
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export function sessionCookie(token: string, maxAge = 60 * 60 * 24 * 30): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export async function currentUser(req: Request, env: AuthEnv): Promise<UserRow | null> {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const s = (await env.DB.prepare("SELECT user_id FROM sessions WHERE token = ?").bind(token).first()) as
    | { user_id: number }
    | null;
  if (!s) return null;
  return (await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(s.user_id).first()) as UserRow | null;
}

/** 生成 GitHub 授权跳转地址；未配置 OAuth 时返回 null（前端改用密码登录） */
export function githubAuthorizeUrl(env: AuthEnv): string | null {
  if (!env.GITHUB_CLIENT_ID || !env.APP_URL) return null;
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.APP_URL.replace(/\/$/, "")}/api/auth/callback`,
    scope: "read:user",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGithubCode(code: string, env: AuthEnv): Promise<UserRow> {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error("GitHub 授权失败：未获取到 access_token");
  const userRes = await fetch("https://api.github.com/user", {
    headers: { authorization: `Bearer ${tokenJson.access_token}`, accept: "application/json" },
  });
  const gh = (await userRes.json()) as {
    id: number;
    login: string;
    avatar_url: string;
    email: string | null;
  };
  return upsertGithubUser(env.DB, {
    github_id: String(gh.id),
    username: gh.login,
    avatar: gh.avatar_url,
    email: gh.email || "",
  });
}

// ---------------- 密码哈希（Web Crypto PBKDF2） ----------------

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** 返回 `pbkdf2$<saltHex>$<hashHex>` */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]),
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(PBKDF2_PEPPER)));
  return `pbkdf2$${toHex(salt)}$${toHex(sig)}`;
}

export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (!stored || !stored.startsWith("pbkdf2$")) return false;
  const [, saltHex, sigHex] = stored.split("$");
  if (!saltHex || !sigHex) return false;
  const salt = fromHex(saltHex);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]),
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(PBKDF2_PEPPER)));
  return toHex(sig) === sigHex;
}

/**
 * 确保存在一个可用「账号密码」登录的管理员账号。
 * 账号 = ADMIN_USERNAME（默认 admin），密码 = ADMIN_PASSWORD。
 * 仅在配置了 ADMIN_PASSWORD 时生效；若账号已存在但缺哈希，则补写哈希。
 */
export async function ensureAdminAccount(env: AuthEnv): Promise<void> {
  const username = (env.ADMIN_USERNAME || "admin").trim();
  const password = (env.ADMIN_PASSWORD || "").trim();
  if (!password) return; // 未配置密码，不创建可登录账号（保持已有账号不变）

  const existing = (await env.DB
    .prepare("SELECT * FROM users WHERE username = ? AND role = 'admin'")
    .bind(username)
    .first()) as (UserRow & { password_hash?: string | null }) | null;

  const hash = await hashPassword(password);
  if (existing) {
    if (!existing.password_hash) {
      await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hash, existing.id).run();
    }
    return;
  }
  await env.DB
    .prepare("INSERT INTO users (username, role, password_hash, created_at) VALUES (?, 'admin', ?, ?)")
    .bind(username, hash, Date.now())
    .run();
}

/** 账号密码登录：校验 username + password，返回管理员用户 */
export async function passwordLogin(env: AuthEnv, username: string, password: string): Promise<UserRow | null> {
  const u = (username || "").trim();
  if (!u || !password) return null;
  const row = (await env.DB
    .prepare("SELECT * FROM users WHERE username = ? AND role = 'admin'")
    .bind(u)
    .first()) as (UserRow & { password_hash?: string | null }) | null;
  if (!row || !row.password_hash) return null;
  const ok = await verifyPassword(row.password_hash, password);
  return ok ? row : null;
}

export interface LoginResult {
  user: UserRow;
  token: string;
  cookie: string;
}

export async function startSession(env: AuthEnv, user: UserRow): Promise<LoginResult> {
  const token = await createSession(env.DB, user.id);
  return { user, token, cookie: sessionCookie(token) };
}
