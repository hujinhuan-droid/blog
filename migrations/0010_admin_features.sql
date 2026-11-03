-- 0010 · 后台管理能力增强
-- 回收站（软删除）、审计日志、收录/抓取监控、流量来源统计

-- 1) 回收站：posts 增加 deleted_at（NULL=正常，非 NULL=已进回收站）
ALTER TABLE posts ADD COLUMN deleted_at INTEGER;

-- 2) 审计日志：记录关键操作（登录 / 改密 / 增删改文章 / 设置 / 恢复 / 彻底删除等）
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor      TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT '',
  detail     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);

-- 3) IndexNow 推送日志（收录监控）
CREATE TABLE IF NOT EXISTS indexnow_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  url        TEXT NOT NULL,
  status     INTEGER,
  resp       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_indexnow_created ON indexnow_log (created_at DESC);

-- 4) 流量来源（按天/域名聚合，仅记录外部/搜索引擎引流）
CREATE TABLE IF NOT EXISTS referer_daily (
  day    TEXT NOT NULL,
  domain TEXT NOT NULL,
  cnt    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, domain)
);
