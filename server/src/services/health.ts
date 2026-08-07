import { Hono } from "hono";
import type { AppContext } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";

export function HealthService(): Hono {
  const app = new Hono();

  // GET /health - Basic liveness check
  app.get("/", async (c: AppContext) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Date.now(),
    });
  });

  // GET /health/ready - Readiness check (DB, cache, auth)
  app.get("/ready", async (c: AppContext) => {
    const db = c.get("db");
    const jwt = c.get("jwt");
    const env = c.env;

    const checks: Record<string, boolean> = {};

    // Database check
    await profileAsync(c, "health_db", async () => {
      try {
        await db.query.feeds.findFirst();
        checks.database = true;
      } catch {
        checks.database = false;
      }
    });

    // JWT check
    checks.jwt = !!jwt;

    // Auth providers
    checks.githubOAuth = !!(env.BLOG_GITHUB_CLIENT_ID && env.BLOG_GITHUB_CLIENT_SECRET);
    checks.passwordAuth = !!(env.ADMIN_USERNAME && env.ADMIN_PASSWORD);

    const allHealthy = Object.values(checks).every((v) => v);

    return c.json(
      {
        status: allHealthy ? "ready" : "degraded",
        checks,
        timestamp: new Date().toISOString(),
      },
      allHealthy ? 200 : 503,
    );
  });

  return app;
}
