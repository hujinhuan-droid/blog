-- AI Agent Blog · 评论表（供「评论开关」设置使用）
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_slug  TEXT NOT NULL,
  author     TEXT NOT NULL,
  email      TEXT,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'approved'
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_slug, created_at);
