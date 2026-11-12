-- 访问明细日志：支撑后台「访问趋势」按来源 / 设备 / 落地页筛选
-- 每次文章页阅读上报一条；visitor 为 IP+UA 的哈希，仅用于 UV 去重，不存原始 IP / UA。
CREATE TABLE IF NOT EXISTS visit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  ts INTEGER NOT NULL,
  slug TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT 'desktop',
  source TEXT NOT NULL DEFAULT 'direct',
  referer TEXT NOT NULL DEFAULT '',
  visitor TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_visit_day ON visit_log (day);
CREATE INDEX IF NOT EXISTS idx_visit_ts ON visit_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_visit_slug ON visit_log (slug, day);
