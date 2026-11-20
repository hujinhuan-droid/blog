-- 0015 后台增强：TOTP 两步验证 + 登录挑战
-- 仅在管理员用户行上扩展；GitHub OAuth 视为第二因子，不强制 TOTP。
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_backups TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS login_2fa_challenges (
  challenge TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_2fa_exp ON login_2fa_challenges (expires_at);
