-- 0012 登录失败锁定（设置页 ⑬）
-- 按「IP:用户名」统计密码错误次数，超限后写入 locked_until；登录成功删除记录。
-- 使用 IF NOT EXISTS，便于在迁移状态不同步时重复执行。
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER
);
