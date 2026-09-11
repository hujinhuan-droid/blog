---
title: OSINT 开源情报进阶：GitHub 与暗网情报收集
slug: kali-3-osint进阶情报收集-r7s8t
date: 2026-09-30
visibility: public
tags: Kali Linux, OSINT, 情报收集, GitHub, 暗网, 侦察, 教程
---

# OSINT 开源情报进阶：GitHub 与暗网情报收集

> 渗透测试的第一步永远是**情报**。上集讲了被动侦察的基础，这一篇升级到**OSINT 进阶**：从 GitHub 代码泄露、员工信息挖掘，到暗网情报与反侦察，教你像调查记者一样收集信息。

## 一、GitHub 情报：企业代码泄露挖掘

程序员喜欢把一切推到 GitHub，包括不该放的密钥。

### GitHub 高级搜索语法

```
# 搜索代码中的敏感关键字（在用户/组织范围内）
"password" "secret_key" org:目标公司
"api_key" lang:python org:目标公司
filename:.env org:目标公司

# 搜索提交历史中的密钥（更隐蔽）
# 使用 gitleaks 扫描仓库历史
gitleaks --repo https://github.com/company/repo

# GitHub 搜索组合
in:file .env
in:path config  password
```

### 工具

```bash
# 开源情报工具（Kali 自带部分）
reconspider
theHarvester -d target.com -b github

# 批量扫描组织所有仓库的泄露
gitdorker -q org:公司 密码 -tf tokens.txt
```

## 二、邮箱与信息关联

### 收集邮箱

```bash
# 搜索关联邮箱
theharvester -d target.com -b google,github
```

### 邮箱漏洞利用（只需验证存在性）

```bash
# 利用邮箱验证（SMTP 指纹）确认有效性
```

## 三、社交媒体与人物画像

| 平台 | 信息 |
|------|------|
| LinkedIn | 员工结构、邮箱格式、技术栈 |
| 微博/知乎 | 生活习惯、公司内幕 |
| GitHub | 技术栈、个人代码、密钥 |
| 企业招 | 技术栈、内部系统名 |

### 工具

```bash
# 社交搜索
sherlock <用户名>     # 全平台账号存在性
social-analyzer        # 社交情报
```

## 四、暗网与泄露数据情报

### 数据泄露监控

- **Have I Been Pwned**：邮箱是否在泄露库
- **Dehashed**：聚合泄露数据库（付费）
- **Hunter.io**：企业邮箱模式

### 暗网入口

> 访问暗网需要 Tor 网络，且注意法律风险——**只用于防御监控，不用于攻击**。

```bash
# Tor 网络
tor
# 通过 .onion 站点访问（需 Tor 浏览器）
```

常见暗网情报用途：

- 监测自家员工/公司数据是否泄露
- 监测钓鱼活动、C2 情报
- 监测泄露的凭据

## 五、OSINT 自动化

```bash
# 组合工具
thehive/cortex（情报平台）

# 单点工具
hunter
shodan # 设备指纹
censys
```

## 六、反侦察：如何保护自己

- 使用分离的测试账号
- 从社工库（黑市）数据看（仅用于了解）
- 保护好自己身份：测试时用专用 VPN / Tor

## 七、OSINT 合规边界

- 公开信息可用
- 数据库泄露信息不可用于非法行为
- 不碰受保护个人信息（法律红线：公民个人信息保护法）

## 小结

- GitHub 是代码泄露的重灾区：gitleaks + 搜索语法
- 邮箱、社交媒体、泄露库构成完整情报链
- 情报的最终目的是评估攻击面，而不是偷取个人隐私
- 反侦查意识是情报工作者的基本素养

> 下一篇：数字取证实战——Autopsy 与事件还原。