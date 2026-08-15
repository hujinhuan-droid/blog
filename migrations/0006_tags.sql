-- 文章标签：在 posts 表增加 tags 列（TEXT，存储 JSON 数组字符串，如 ["睡眠","饮食"]）
-- 已有行默认 '[]'；新文章由 worker 写入规范化后的标签数组。
ALTER TABLE posts ADD COLUMN tags TEXT DEFAULT '[]';
