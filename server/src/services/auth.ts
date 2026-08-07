import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext, Variables } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { setJWTCookie } from "../core/hono-middleware";
import { users } from "../db/schema";
import {
    BadRequestError,
    ForbiddenError,
    InternalServerError,
} from "../errors";
import { authSchemas, validateBody } from "../utils/validation";

// Generate a cryptographically secure random salt
function generateSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Hash password with salt using SHA-256
async function hashPassword(password: string, salt: string = ""): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  // Store as "salt:hash" for verification
  if (salt) return `${salt}:${hash}`;
  return hash;
}

// Verify password against stored hash (supports both salted and unsalted)
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // New format: "salt:hash"
  const parts = storedHash.split(":");
  if (parts.length === 2) {
    const [salt, _hash] = parts;
    return (await hashPassword(password, salt)) === storedHash;
  }
  // Legacy unsalted SHA-256
  return (await hashPassword(password)) === storedHash;
}

export function PasswordAuthService(): Hono<{
        Bindings: Env;
        Variables: Variables;
    }> {
    const app = new Hono<{
        Bindings: Env;
        Variables: Variables;
    }>();
    // Login with username and password
    app.post("/login", validateBody(authSchemas.login), async (c: AppContext) => {
        const jwt = c.get('jwt');
        const db = c.get('db');
        const env = c.env;
        const { username, password } = c.get('validatedBody') as { username: string; password: string };

        // Check if admin credentials are configured
        const adminUsername = env.ADMIN_USERNAME;
        const adminPassword = env.ADMIN_PASSWORD;

        if (!adminUsername || !adminPassword) {
            throw new BadRequestError('Admin credentials not configured');
        }

        // Check if this is the admin login
        if (username === adminUsername) {
            // Verify against configured admin password (plain-text comparison first,
            // then salted hash for the persisted user record)
            if (password !== adminPassword) {
                throw new ForbiddenError('Invalid credentials');
            }

            // Find or create admin user
            let user = await profileAsync(c, 'auth_admin_lookup', () => db.query.users.findFirst({ 
                where: eq(users.openid, "admin") 
            }));

            if (!user) {
                // Create admin user with salted password
                const salt = await profileAsync(c, 'auth_admin_salt', () => Promise.resolve(generateSalt()));
                const saltedHash = await profileAsync(c, 'auth_admin_hash', () => hashPassword(adminPassword, salt));

                const result = await profileAsync(c, 'auth_admin_insert', () => db.insert(users).values({
                    username: adminUsername,
                    openid: "admin",
                    avatar: "",
                    permission: 1,
                    password: saltedHash,
                }).returning({ insertedId: users.id }));

                if (!result || result.length === 0) {
                    throw new InternalServerError('Failed to create admin user');
                }

                user = await profileAsync(c, 'auth_admin_reload', () => db.query.users.findFirst({ 
                    where: eq(users.id, result[0].insertedId) 
                }));
            }

            if (!user) {
                throw new InternalServerError('Failed to get admin user');
            }

            // Verify stored password and update if admin password changed
            const passwordValid = await profileAsync(c, 'auth_admin_verify', () => verifyPassword(adminPassword, user.password ?? ""));
            if (!passwordValid) {
                const salt = await profileAsync(c, 'auth_admin_salt_update', () => Promise.resolve(generateSalt()));
                const newSaltedHash = await profileAsync(c, 'auth_admin_hash_update', () => hashPassword(adminPassword, salt));
                await profileAsync(c, 'auth_admin_sync', () => db.update(users)
                    .set({ password: newSaltedHash, username: adminUsername })
                    .where(eq(users.id, user.id)));
            }

            // Generate JWT token
            const token = await profileAsync(c, 'auth_admin_token', () => jwt.sign({ id: user.id, username: user.username }));

            // Set JWT cookie using Hono helper
            setJWTCookie(c, token);

            return c.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    avatar: user.avatar,
                    permission: user.permission === 1,
                }
            });
        }

        // Regular user login (if we want to support multiple users with passwords in the future)
        const user = await profileAsync(c, 'auth_user_lookup', () => db.query.users.findFirst({ 
            where: eq(users.username, username) 
        }));

        if (!user || !user.password) {
            throw new ForbiddenError('Invalid credentials');
        }

        const passwordValid = await profileAsync(c, 'auth_user_verify', () => verifyPassword(password, user.password ?? ""));
        if (!passwordValid) {
            throw new ForbiddenError('Invalid credentials');
        }

        // Generate JWT token
        const token = await profileAsync(c, 'auth_user_token', () => jwt.sign({ id: user.id, username: user.username }));

        // Set JWT cookie using Hono helper
        setJWTCookie(c, token);

        return c.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                avatar: user.avatar,
                permission: user.permission === 1,
            }
        });
    });

    // Check if password login is available
    app.get("/status", async (c: AppContext) => {
        const env = c.env;
        
        return c.json({
            github: !!(env.BLOG_GITHUB_CLIENT_ID && env.BLOG_GITHUB_CLIENT_SECRET),
            password: !!(env.ADMIN_USERNAME && env.ADMIN_PASSWORD),
        });
    });

    return app;
}
