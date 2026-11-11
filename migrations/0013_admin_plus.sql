-- 0013_admin_plus.sql
-- 后台增强：文章版本历史 / 搜索分析 / 标签别名 / 文章置顶
-- 说明：本迁移与 worker 内的 ensureExtras() 幂等兜底保持一致，
--       任一环节重复执行都不会报错（IF NOT EXISTS / 已存在则跳过）。

-- ── 文章版本历史 ────────────────────────────────────────────────────────────
-- 每次更新正文或标题前，把「更新前」的完整快照写入本表，支持查看与回滚。
-- 每篇文章只保留最近 30 个版本（由写入方裁剪），避免 D1 体积无限增长。
CREATE TABLE IF NOT EXISTS post_revisions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL DEFAULT '',
  excerpt    TEXT    NOT NULL DEFAULT '',
  tags       TEXT    NOT NULL DEFAULT '[]',
  status     TEXT,
  actor      TEXT,
  note       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rev_post ON post_revisions (post_id, created_at DESC);

-- ── 站内搜索日志 ────────────────────────────────────────────────────────────
-- 记录每次搜索的关键词与命中数，用于「读者在找什么 / 哪些词搜不到」分析。
-- 命中 0 的词最有价值：说明内容缺口。
CREATE TABLE IF NOT EXISTS search_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword    TEXT    NOT NULL,
  hits       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_kw ON search_log (keyword, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_time ON search_log (created_at DESC);

-- ── 标签别名 ────────────────────────────────────────────────────────────────
-- 标签重命名/合并后，旧名作为别名保留，前台访问旧标签能跳到新标签。
CREATE TABLE IF NOT EXISTS tag_aliases (
  alias      TEXT PRIMARY KEY,
  target     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
