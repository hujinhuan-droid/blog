import type { Context, Next } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 60 seconds
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

export interface RateLimitOptions {
  /** Max requests within the window */
  maxRequests: number;
  /** Window in seconds */
  windowSeconds: number;
  /** Key prefix to namespace different limits */
  keyPrefix?: string;
}

/**
 * Simple in-memory rate limiter for Cloudflare Workers.
 * Uses IP-based keys; in production, consider using KV/D1 for persistence.
 */
export function rateLimiter(options: RateLimitOptions) {
  const { maxRequests, windowSeconds, keyPrefix = "rl" } = options;
  const windowMs = windowSeconds * 1000;

  return async (c: Context, next: Next) => {
    cleanup();

    // Use CF-Connecting-IP header first (set by Cloudflare), fallback to X-Forwarded-For
    const clientIp =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
      "127.0.0.1";

    const key = `${keyPrefix}:${clientIp}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.res = new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: `Too many requests. Please try again in ${retryAfter} seconds.`,
            retryAfter,
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
          },
        },
      );
      return;
    }

    await next();
  };
}

/**
 * Pre-configured rate limiters for different route types
 */
export const RateLimits = {
  /** Auth endpoints (login, OAuth): 10 req/min */
  auth: () => rateLimiter({ maxRequests: 10, windowSeconds: 60, keyPrefix: "rl:auth" }),
  /** Write operations (comments, profile updates): 30 req/min */
  write: () => rateLimiter({ maxRequests: 30, windowSeconds: 60, keyPrefix: "rl:write" }),
  /** Read operations (feeds, search): 120 req/min */
  read: () => rateLimiter({ maxRequests: 120, windowSeconds: 60, keyPrefix: "rl:read" }),
  /** Strict: 5 req/min for sensitive endpoints */
  strict: () => rateLimiter({ maxRequests: 5, windowSeconds: 60, keyPrefix: "rl:strict" }),
};
