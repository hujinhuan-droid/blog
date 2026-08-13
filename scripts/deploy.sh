#!/usr/bin/env bash
# AI Agent Blog —— Cloudflare 一键部署脚本
# 用法：在项根目录执行  bash scripts/deploy.sh
set +e

echo "=============================================="
echo " AI Agent Blog · Cloudflare 部署"
echo "=============================================="

echo "[1/6] 安装依赖 (wrangler) ..."
npm install
if [ $? -ne 0 ]; then echo "❌ npm install 失败，请检查网络/Node 版本"; exit 1; fi

echo "[2/6] Cloudflare 登录（将打开浏览器，请授权）..."
npx wrangler login
if [ $? -ne 0 ]; then echo "❌ wrangler login 失败"; exit 1; fi

echo "[3/6] 创建 R2 图床桶 ai-agent-blog-images ..."
npx wrangler r2 bucket create ai-agent-blog-images

echo "[4/6] 创建 D1 数据库 ai-agent-blog 并写入 id ..."
OUT=$(npx wrangler d1 create ai-agent-blog 2>&1)
echo "$OUT"
ID=$(echo "$OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
if [ -n "$ID" ]; then
  sed -i.bak "s/REPLACE_WITH_YOUR_D1_ID/$ID/" wrangler.toml
  rm -f wrangler.toml.bak
  echo "✅ 已写入 database_id = $ID 到 wrangler.toml"
else
  echo "⚠️ 未能自动解析 D1 id，请手动把上面输出的 id 填进 wrangler.toml 的 database_id 字段"
fi

echo "[5/6] 初始化线上 D1（建表 + 示例文章）..."
npx wrangler d1 migrations apply ai-agent-blog --remote
if [ $? -ne 0 ]; then echo "❌ D1 迁移失败"; exit 1; fi

echo "[6/6] 部署 Worker + 静态前端 ..."
npm run deploy
if [ $? -ne 0 ]; then echo "❌ 部署失败"; exit 1; fi

echo "=============================================="
echo "✅ 部署完成！"
echo " 读者端 / 管理后台：你的 Worker 域名（如 https://ai-agent-blog.<sub>.workers.dev）"
echo " 管理后台入口：右上角「登录」"
echo "=============================================="
echo
echo "可选：配置管理员登录方式"
echo "  • 密码登录（本地/调试）： npx wrangler secret put ADMIN_PASSWORD  然后登录页选「密码登录」"
echo "  • GitHub OAuth（正式）："
echo "      1) github.com/settings/developers 新建 OAuth App，回调填 <你的域名>/api/auth/callback"
echo "      2) npx wrangler secret put GITHUB_CLIENT_ID"
echo "      3) npx wrangler secret put GITHUB_CLIENT_SECRET"
echo "      4) 把 wrangler.toml 的 APP_URL 改成你的域名，再 npm run deploy"
echo "    第一个用 GitHub 登录的用户自动成为管理员。"
