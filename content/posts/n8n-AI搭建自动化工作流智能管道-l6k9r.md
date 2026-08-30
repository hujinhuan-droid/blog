---
title: 用 n8n + AI 搭建自动化工作流：连接 200+ 应用的智能管道
slug: n8n-AI搭建自动化工作流智能管道-l6k9r
date: 2026-08-30
visibility: public
tags: AI智能体, n8n, 自动化, 工作流, 教程
---

# 用 n8n + AI 搭建自动化工作流：连接 200+ 应用的智能管道

Zapier 很好用但贵，Make 功能强但学习曲线陡。n8n 是开源替代——自部署、免费、支持 200+ 应用集成，还能嵌入 AI 节点。这篇带你搭 3 个实战工作流。

## n8n 是什么

n8n 是一个开源的自动化工作流工具，核心思路是**节点编排**：

```
触发器节点 → 处理节点 → AI 节点 → 输出节点
```

每个节点做一件事，像管道一样串起来。你不需要写代码，拖拽配置就行。

| 特性 | n8n | Zapier | Make |
|------|-----|--------|------|
| 开源自部署 | 是 | 否 | 否 |
| 免费额度 | 无限（自部署） | 100次/月 | 1000次/月 |
| AI 节点 | 原生支持 | 有限 | 有限 |
| 自定义代码 | 支持 | 有限 | 支持 |
| 部署方式 | Docker / npm | 云端 | 云端 |

## 部署

### Docker 一行启动

```bash
docker run -d --name n8n \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n
```

访问 `http://服务器IP:5678`，设置管理员账号即可使用。

## 实战 1：AI 邮件自动分类 + 通知

**场景**：收到邮件 → AI 判断优先级 → 紧急的发飞书通知，普通的存到 Google Sheets。

### 工作流编排

```
[IMAP 邮件触发器] → [AI 分类节点] → [IF 条件分支]
  ├─ 紧急 → [飞书消息节点] → 发通知
  └─ 普通 → [Google Sheets 节点] → 记录
```

### 配置步骤

**节点 1：IMAP 邮件触发器**
```
协议：IMAP
服务器：imap.qq.com
端口：993
认证：邮箱地址 + 授权码
轮询间隔：5 分钟
```

**节点 2：AI 分类（OpenAI 节点）**
```
模型：gpt-4o-mini
系统提示词：你是邮件分类助手。根据邮件主题和内容，返回 JSON：
{"priority": "urgent|normal|low", "category": "...", "summary": "..."}
```
输入变量绑定：`{{ $json.subject }}` 和 `{{ $json.text }}`

**节点 3：IF 条件分支**
```
条件：{{ $json.priority }} == "urgent"
```

**节点 4a：飞书通知**
```
Webhook URL：你的飞书机器人 Webhook
消息内容：紧急邮件：{{ $json.subject }}\n摘要：{{ $json.summary }}
```

**节点 4b：Google Sheets**
```
操作：追加行
表格：邮件分类表
字段映射：日期、发件人、主题、分类、优先级、摘要
```

## 实战 2：AI 内容审核管道

**场景**：用户提交内容 → AI 检测违规 → 通过则发布，不通过则通知管理员。

### 工作流编排

```
[Webhook 触发器] → [AI 审核节点] → [IF 分支]
  ├─ 通过 → [数据库写入] → [返回成功]
  └─ 不通过 → [通知管理员] → [返回拒绝原因]
```

### AI 审核节点配置

```
模型：gpt-4o-mini
系统提示词：
你是内容审核员。检查用户提交的内容是否包含：
1. 政治敏感内容
2. 色情暴力内容
3. 广告 spam
4. 人身攻击
返回 JSON：{"approved": true/false, "reason": "...", "risk_level": "low/medium/high"}

用户内容：{{ $json.content }}
```

## 实战 3：智能日报生成器

**场景**：定时从多个数据源拉取数据 → AI 生成日报 → 发送到企业微信群。

### 工作流编排

```
[Cron 定时触发器] 每天 9:00
  → [HTTP Request] 拉取 GitHub Commits
  → [HTTP Request] 拉取 Jira 任务
  → [HTTP Request] 拉取系统监控数据
  → [Merge] 合并数据
  → [AI 节点] 生成日报
  → [企业微信 Webhook] 发送
```

### AI 日报节点配置

```
模型：gpt-4o-mini
系统提示词：
你是项目日报生成器。根据以下数据生成日报，格式：

# 项目日报 {{ 日期 }}

## 今日进展
- （从 commits 和任务中提取关键进展）

## 风险与问题
- （从监控数据中识别异常）

## 明日计划
- （基于未完成任务给出建议）

数据：
- 代码提交：{{ $json.commits }}
- 任务状态：{{ $json.tasks }}
- 监控告警：{{ $json.alerts }}
```

## 进阶：自定义代码节点

当内置节点不够用时，用 Code 节点写 JavaScript：

```javascript
// Code 节点：处理数据格式转换
const items = $input.all();

const results = items.map(item => {
  const raw = item.json;
  return {
    title: raw.subject || raw.title || "无标题",
    date: new Date(raw.date).toISOString().split('T')[0],
    status: raw.priority > 3 ? "紧急" : "普通",
    summary: raw.text ? raw.text.substring(0, 100) + "..." : ""
  };
});

return results;
```

## 成本对比

| 场景 | Zapier 月费 | n8n（自部署） |
|------|------------|---------------|
| 5000 次操作/月 | $29-49 | $0（服务器费） |
| 30000 次操作/月 | $99-149 | $0 |
| AI 调用（1000次） | $0.01/次额外 | 按 API 成本 |
| 服务器成本 | — | ~$5/月（2GB VPS） |

## 常见问题

| 问题 | 解决 |
|------|------|
| Webhook 收不到数据 | 检查服务器是否有公网 IP / 反向代理配置 |
| AI 节点超时 | 设 timeout=60s，或用流式输出 |
| 数据节点格式不匹配 | 用 Code 节点做格式转换 |
| 工作流执行不稳定 | 加重试节点（Retry on Fail） |
| 凭据安全 | 用 n8n Credentials 管理，不硬编码 |

## 部署清单

```
□ 服务器：2GB RAM + 20GB SSD（最低配置）
□ Docker 安装
□ n8n 容器启动 + 数据卷持久化
□ 反向代理（Nginx）+ HTTPS 证书
□ 配置各应用凭据（邮件、飞书、Google等）
□ 告警通知（n8n 执行失败时通知管理员）
□ 定期备份 /home/node/.n8n 目录
```

> n8n 的核心价值不在"连接了多少应用"，而在"低成本把重复工作变成自动管道"。先用一个最简工作流跑通全链路，再逐步加节点。自动化不是一步到位的，是一个"发现问题→自动化→发现新问题"的循环。
