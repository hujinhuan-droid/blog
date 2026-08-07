// Hono context types for AI Agent server
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { Context as HonoContext } from "hono";

export type DB = DrizzleD1Database<typeof import("../db/schema")>;

export interface JwtPayload {
    id: number;
    username: string;
    permission?: number;
    [key: string]: unknown;
}

export interface JWTUtils {
    sign(payload: Record<string, unknown>): Promise<string>;
    verify(token: string): Promise<JwtPayload | null>;
}

export interface OAuth2Utils {
    generateState(): string;
    createRedirectUrl(state: string, provider: string): string;
    authorize(provider: string, code: string): Promise<{ accessToken: string } | null>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CacheImpl {
    get(key: string): Promise<unknown | null>;
    set(key: string, value: unknown, save?: boolean): Promise<void>;
    delete(key: string, save?: boolean): Promise<void>;
    deletePrefix(prefix: string): Promise<void>;
    getOrSet<T>(key: string, factory: () => Promise<T>): Promise<T>;
    getOrDefault<T>(key: string, defaultValue: T): Promise<T>;
    getBySuffix(suffix: string): Promise<unknown[]>;
    all(): Promise<Map<string, unknown>>;
    save(): Promise<void>;
    clear(): Promise<void>;
}

export interface Variables {
    db: DB;
    cache: CacheImpl;
    serverConfig: CacheImpl;
    clientConfig: CacheImpl;
    jwt: JWTUtils;
    oauth2?: OAuth2Utils;
    uid?: number;
    admin: boolean;
    username?: string;
    env: Env;
    validatedBody?: unknown;
    validatedQuery?: unknown;
}

export type AppContext = HonoContext<{
    Bindings: Env;
    Variables: Variables;
}>;
