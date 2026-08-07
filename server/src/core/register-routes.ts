import type { BlogApp } from "./app-types";
import { RateLimits } from "../utils/rate-limiter";
import { csrfProtection } from "../utils/csrf";
import { PasswordAuthService } from "../services/auth";
import { CommentService } from "../services/comments";
import { ConfigService } from "../services/config";
import { FaviconService } from "../services/favicon";
import { FeedService, SearchService, WordPressService } from "../services/feed";
import { FriendService } from "../services/friends";
import { MomentsService } from "../services/moments";
import { RSSService } from "../services/rss";
import { BlobService, StorageService } from "../services/storage";
import { StatsService } from "../services/stats";
import { TagService } from "../services/tag";
import { UserService } from "../services/user";
import { HealthService } from "../services/health";

export function registerRoutes(app: BlogApp) {
  app.get("/", (c) => c.text("Hi"));

  // Rate-limit write-heavy endpoints (apply BEFORE route registration)
  app.use("/auth/*", RateLimits.auth());
  app.use("/comment/*", RateLimits.write());
  app.use("/user/*", RateLimits.write());
  app.use("/feed/*", RateLimits.read());

  // CSRF protection for state-changing endpoints
  app.use("/auth/*", csrfProtection());
  app.use("/comment/*", csrfProtection());
  app.use("/user/profile", csrfProtection());

  app.route("/feed", FeedService());
  app.route("/search", SearchService());
  app.route("/wp", WordPressService());
  app.route("/tag", TagService());
  app.route("/comment", CommentService());
  app.route("/storage", StorageService());
  app.route("/blob", BlobService());
  app.route("/friend", FriendService());
  app.route("/moments", MomentsService());
  app.route("/user", UserService());
  app.route("/auth", PasswordAuthService());
  app.route("/config", ConfigService());
  app.route("/", RSSService());
  app.route("/favicon", FaviconService());
  app.route("/favicon.ico", FaviconService());
  app.route("/health", HealthService());
  app.route("/stats", StatsService());
}
