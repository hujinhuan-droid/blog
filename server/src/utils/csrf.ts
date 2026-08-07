import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { ForbiddenError } from "../errors";

/**
 * CSRF protection middleware.
 * Generates a CSRF token cookie and requires it in the X-CSRF-Token header
 * for state-changing requests (POST, PUT, PATCH, DELETE).
 * Uses double-submit cookie pattern.
 */
export function csrfProtection() {
  return async (c: Context, next: Next) => {
    // Only check state-changing methods
    const method = c.req.method.toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      await next();
      return;
    }

    // Get or generate CSRF token
    const tokenCookie = getCookie(c, "csrf_token");
    let csrfToken = tokenCookie;

    if (!csrfToken) {
      // Generate new token for the first request
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      csrfToken = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      setCookie(c, "csrf_token", csrfToken, {
        path: "/",
        httpOnly: false, // Must be readable by JS
        secure: true,
        sameSite: "Strict",
        maxAge: 86400, // 24 hours
      });
    }

    // Verify token from header
    const headerToken = c.req.header("X-CSRF-Token");
    if (!csrfToken || headerToken !== csrfToken) {
      throw new ForbiddenError(
        "CSRF token validation failed. Include X-CSRF-Token header from csrf_token cookie."
      );
    }

    await next();
  };
}

/**
 * Lightweight CSRF for read-only endpoints that only sets the cookie.
 */
export function csrfSetCookie() {
  return async (c: Context, next: Next) => {
    const existingToken = getCookie(c, "csrf_token");
    if (!existingToken) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const csrfToken = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      setCookie(c, "csrf_token", csrfToken, {
        path: "/",
        httpOnly: false,
        secure: true,
        sameSite: "Strict",
        maxAge: 86400,
      });
    }
    await next();
  };
}
