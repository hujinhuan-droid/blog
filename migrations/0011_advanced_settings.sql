-- 0011 高级自定义（D 组）：会话有效期需要 sessions 表增加过期时间列
-- settings 表为动态 key-value，新设置项（custom_css / maintenance_* / rss_* / cache_ttl / session_ttl）
-- 无需改表结构，直接 INSERT 即可；此处仅补充会话过期时间列。
ALTER TABLE sessions ADD COLUMN expires_at INTEGER;
