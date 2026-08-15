-- 文章 AI 备注字段（Gemini 辅助生成的审稿意见/备注）
ALTER TABLE posts ADD COLUMN ai_notes TEXT;
