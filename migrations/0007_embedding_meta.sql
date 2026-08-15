-- 文章语义搜索向量（JSON 数组字符串，如 [0.01, -0.2, ...]）
ALTER TABLE posts ADD COLUMN embedding TEXT;

-- 轻量计数器（如 AI 调用量）
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v INTEGER NOT NULL DEFAULT 0
);
