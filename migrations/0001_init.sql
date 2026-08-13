-- AI Agent Blog · D1 初始化
-- 执行：wrangler d1 migrations apply ai-agent-blog --local  (本地)
--       wrangler d1 migrations apply ai-agent-blog --remote (线上)

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id  TEXT UNIQUE,
  username   TEXT NOT NULL,
  avatar     TEXT,
  email      TEXT,
  role       TEXT NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT UNIQUE NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',          -- Markdown 正文
  excerpt    TEXT NOT NULL DEFAULT '',
  cover      TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',    -- 'public' | 'private'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  author_id  INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_created ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts (slug);

-- 初始化一篇示例文章，方便首次打开就有内容
INSERT INTO posts (slug, title, content, excerpt, visibility, created_at, updated_at)
SELECT 'welcome', '欢迎使用 AI Agent 博客', '# 欢迎 👋

这是用 **Cloudflare** 全家桶重写的博客平台 MVP：

- Pages + Workers 提供前后端
- D1 (SQLite) 存储文章
- R2 存储图片
- GitHub OAuth 登录，第一个注册用户自动成为管理员

在右上角登录后，进入 *管理后台* 即可撰写新文章。',
       '用 Cloudflare 全家桶重写的博客平台 MVP，支持 Markdown 与图形化管理后台。',
       'public',
       strftime('%s','now') * 1000,
       strftime('%s','now') * 1000
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE slug = 'welcome');
