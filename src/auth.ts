// 鉴权：GitHub OAuth + 会话 cookie（含可选密码登录，便于本地调试）

import { UserRow, DB, createSession, getUserBySession, getOrCreatePasswordAdmin, upsertGithubUser } from "./db";

const SESSION_COOKIE = "sid";

export interface AuthEnv {
  DB: DB;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
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
  return getUserBySession(env.DB, token);
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

/** 密码登录（本地调试用）：校验 ADMIN_PASSWORD，返回管理员用户 */
export async function passwordLogin(env: AuthEnv, password: string): Promise<UserRow | null> {
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) return null;
  return getOrCreatePasswordAdmin(env.DB, "admin");
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
