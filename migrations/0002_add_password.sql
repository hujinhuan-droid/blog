-- AI Agent Blog · 账号密码登录
-- 为 users 表增加密码哈希列（PBKDF2，不存明文）
-- 执行：wrangler d1 migrations apply ai-agent-blog --local / --remote

ALTER TABLE users ADD COLUMN password_hash TEXT;
