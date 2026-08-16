-- 草稿 / 定时发布 / 阅读量 / 点赞收藏 / 评论嵌套
-- 执行：wrangler d1 migrations apply ai-agent-blog --remote

ALTER TABLE posts ADD COLUMN status TEXT NOT NULL DEFAULT 'published';   -- 'published' | 'draft'
ALTER TABLE posts ADD COLUMN scheduled_at INTEGER;                         -- 定时发布时间（毫秒），NULL 表示不定时
ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0;             -- 阅读量

CREATE TABLE IF NOT EXISTS reactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL,
  kind       TEXT NOT NULL,            -- 'like' | 'favorite'
  user_key   TEXT NOT NULL,            -- 登录用户 id 或匿名标识
  created_at INTEGER NOT NULL,
  UNIQUE(post_id, kind, user_key)
);

ALTER TABLE comments ADD COLUMN parent_id INTEGER NOT NULL DEFAULT 0;     -- 0 = 顶层评论

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_reactions_post ON reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
