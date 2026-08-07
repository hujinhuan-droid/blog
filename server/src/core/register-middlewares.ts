import { cors } from "hono/cors";
import { timing } from "hono/timing";
import { createMiddleware } from "hono/factory";
import { authMiddleware, initContainerMiddleware } from "./hono-middleware";
import { csrfSetCookie } from "../utils/csrf";
import type { BlogApp } from "./app-types";

// CORS whitelist: allow localhost origins for development
const allowedOrigins: (string | RegExp)[] = [
  /^https?:\/\/localhost(:\d+)?$/,
];

export function registerMiddlewares(app: BlogApp) {
  // Security headers
  app.use("*", async (c, next) => {
    await next();
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    c.res.headers.set("X-Frame-Options", "DENY");
    c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    c.res.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
  });

  app.use(
    "*",
    cors({
      origin: (origin) => {
        // Allow requests with no origin (curl, server-to-server)
        if (!origin) return origin;
        for (const pattern of allowedOrigins) {
          if (typeof pattern === "string" && pattern === origin) return origin;
          if (pattern instanceof RegExp && pattern.test(origin)) return origin;
        }
        return "";
      },
      allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowHeaders: ["content-type", "authorization", "x-csrf-token"],
      maxAge: 600,
      credentials: true,
    }),
  );

  app.use("*", timing({ totalDescription: "" }));
  app.use("*", createMiddleware(csrfSetCookie()));
  app.use("*", initContainerMiddleware);
  app.use("*", authMiddleware);
}
