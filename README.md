# AI Agent 博客平台（重写版 · MVP）

参照原 `hujinhuan-droid/blog` 的 Cloudflare 架构，从零重写的独立项目。
前端 + 后端 + 图形界面，开箱即跑。

## 架构

| 层 | 技术 |
|----|------|
| 前端 GUI | 原生 HTML/CSS/JS 单页应用（读者端 + 管理后台），无需打包 |
| 后端 | Cloudflare Worker（`src/worker.ts`，手写路由） |
| 数据库 | Cloudflare D1（SQLite） |
| 图床 | Cloudflare R2 |
| 鉴权 | GitHub OAuth（第一个登录用户自动成为管理员），可选密码登录便于本地调试 |

## 目录结构

```
.
├── wrangler.toml          # 部署配置（Pages + Worker + D1 + R2 + assets）
├── package.json
├── migrations/
│   └── 0001_init.sql       # 建表 + 示例文章
├── src/
│   ├── db.ts               # D1 数据访问层
│   ├── auth.ts             # GitHub OAuth + 会话
│   └── worker.ts           # API 路由 + SPA 回退
└── public/                 # 前端 GUI
    ├── index.html
    ├── css/style.css
    └── js/{markdown,app,admin}.js
```

## 本地运行

```bash
npm install                 # 安装 wrangler
npm run migrate:local       # 初始化本地 D1（建表 + 示例文章）
npm run dev                 # 启动，默认 http://localhost:8787
```

打开 http://localhost:8787 即可看到读者端；点右上角「登录」进入管理后台。

### 本地调试管理员（无需 GitHub OAuth）

不配置 GitHub OAuth 也能体验管理员功能：

```bash
wrangler secret put ADMIN_PASSWORD   # 输入一个调试密码
npm run dev
```

登录时选择「密码登录」，输入该密码即可获得管理员身份（会自动创建一个 admin 用户）。

### 启用 GitHub OAuth（线上/正式）

1. 在 https://github.com/settings/developers 新建 OAuth App
   - Homepage URL: 你的域名
   - Authorization callback URL: `https://你的域名/api/auth/callback`
2. 设置密钥：
   ```bash
   wrangler secret put GITHUB_CLIENT_ID
   wrangler secret put GITHUB_CLIENT_SECRET
   ```
3. 改 `wrangler.toml` 里 `APP_URL` 为你的域名，并填好 `database_id`。
4. 第一个用 GitHub 登录的用户自动成为管理员。

## 部署

```bash
wrangler d1 create ai-agent-blog          # 建数据库，拿到 id 填回 wrangler.toml
wrangler r2 bucket create ai-agent-blog-images
npm run migrate:remote                    # 初始化线上 D1
wrangler deploy                           # 部署
```

## 关于「替换旧项目」

本目录是一个全新独立项目。若要用它覆盖 GitHub 上的旧 `blog` 仓库：

```bash
git init
git remote add origin git@github.com:hujinhuan-droid/blog.git
git add -A && git commit -m "rewrite: cloudflare blog MVP"
git push --force origin main             # ⚠️ 会覆盖旧仓库历史，确认无误再执行
```

或直接新建一个仓库推送。
