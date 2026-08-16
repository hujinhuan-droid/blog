-- 每日访问量统计（用于概览页「当天访问量 / 全部访问量」）
CREATE TABLE IF NOT EXISTS views_daily (
  day TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0
);
