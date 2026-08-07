import { z } from "zod";
import type { Context, Next } from "hono";
import { ValidationError } from "../errors";

// ============================================================================
// Validation Middleware
// ============================================================================

export function validateBody<T extends z.ZodType>(schema: T) {
  return async (c: Context, next: Next) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new ValidationError("Invalid JSON body");
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      }));
      throw new ValidationError("Validation failed", details);
    }

    c.set("validatedBody", result.data);
    await next();
  };
}

export function validateQuery<T extends z.ZodType>(schema: T) {
  return async (c: Context, next: Next) => {
    const query = Object.fromEntries(
      Object.entries(c.req.query()).map(([k, v]) => [k, v])
    );

    const result = schema.safeParse(query);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      }));
      throw new ValidationError("Invalid query parameters", details);
    }

    c.set("validatedQuery", result.data);
    await next();
  };
}

// ============================================================================
// Validation Schemas
// ============================================================================

export const authSchemas = {
  login: z.object({
    username: z.string().min(1, "Username is required").max(100),
    password: z.string().min(1, "Password is required").max(500),
  }),
};

export const commentSchemas = {
  create: z.object({
    content: z.string().min(1, "Content is required").max(10000, "Content too long"),
    guestName: z.string().max(100).optional(),
    guestEmail: z.string().email("Invalid email").max(255).optional().or(z.literal("")),
    guestWebsite: z.string().url("Invalid URL").max(500).optional().or(z.literal("")),
  }),
};

export const userSchemas = {
  updateProfile: z.object({
    username: z.string().min(1).max(50).optional(),
    avatar: z.string().url("Invalid avatar URL").max(500).optional(),
  }).refine((data) => data.username || data.avatar, {
    message: "At least one field (username or avatar) is required",
  }),
};

export const feedSchemas = {
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  }),
};
