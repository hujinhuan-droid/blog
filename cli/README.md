# AI Agent CLI

AI Agent CLI 是一个统一的命令行工具，整合了所有 AI Agent 项目的脚本功能。

## 安装

```bash
# 从项目根目录链接 CLI
bun link cli

# 或者使用 npx
npx ai-agent-cli
```

## 使用方法

### 开发服务器

```bash
# 启动前后端开发服务器
ai-agent dev

# 指定端口
ai-agent dev --port 3000 --backend-port 8080

# 只启动前端
ai-agent dev --client-only

# 只启动后端
ai-agent dev --server-only

# 跳过数据库迁移
ai-agent dev --no-migrate
```

### 部署

```bash
# 部署到生产环境
ai-agent deploy

# 部署到预览环境
ai-agent deploy --preview

# 只部署后端
ai-agent deploy --server

# 只部署前端
ai-agent deploy --client
```

### 数据库操作

```bash
# 运行数据库迁移
ai-agent db migrate
```

### 发布版本

```bash
# 升级补丁版本 (0.1.0 -> 0.1.1)
ai-agent release patch

# 升级次要版本 (0.1.0 -> 0.2.0)
ai-agent release minor

# 升级主要版本 (0.1.0 -> 1.0.0)
ai-agent release major

# 指定具体版本
ai-agent release 1.2.3
```

## 命令参考

| 命令 | 描述 | 选项 |
|------|------|------|
| `ai-agent dev` | 启动开发服务器 | `-p, --port`, `-b, --backend-port`, `--client-only`, `--server-only`, `--no-migrate` |
| `ai-agent deploy` | 部署到 Cloudflare | `--preview`, `--server`, `--client` |
| `ai-agent db migrate` | 运行数据库迁移 | - |
| `ai-agent release` | 创建新版本 | `<version>` |
| `ai-agent --help` | 显示帮助信息 | - |
| `ai-agent --version` | 显示版本号 | - |

## 环境变量

CLI 会读取项目根目录的 `.env.local` 文件获取配置。

## 与原有脚本的对比

| 原脚本 | CLI 命令 |
|--------|----------|
| `bun cli/bin/ai-agent.ts dev` | `ai-agent dev` |
| `bun cli/bin/ai-agent.ts deploy` | `ai-agent deploy` |
| `bun cli/bin/ai-agent.ts db migrate` | `ai-agent db migrate` |
| `bun cli/bin/ai-agent.ts release patch` | `ai-agent release patch` |

## 特点

- ✅ 统一的命令入口
- ✅ 简化的命令行参数
- ✅ 彩色日志输出
- ✅ 更好的错误提示
- ✅ 完整的帮助信息
- ✅ 纯 Bun/TypeScript，无需 Node.js
