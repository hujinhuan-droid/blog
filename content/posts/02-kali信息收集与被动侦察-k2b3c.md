---
title: 信息收集与被动侦察：渗透测试的第一步
slug: kali信息收集与被动侦察-k2b3c
date: 2026-08-30
visibility: public
tags: Kali Linux, 信息收集, 侦察, 渗透测试, 教程
---

# 信息收集与被动侦察：渗透测试的第一步

"知己知彼，百战不殆。"渗透测试的第一步永远是信息收集。你掌握的目标信息越多，找到突破口的概率就越大。本文介绍 Kali Linux 下最常用的信息收集工具和实战流程。

## 一、主动侦察 vs 被动侦察

| 类型 | 特点 | 工具 | 风险 |
|------|------|------|------|
| 被动侦察 | 不直接接触目标 | Google、WHOIS、DNS | 几乎为零 |
| 主动侦察 | 直接与目标交互 | Nmap、Masscan | 可能被发现 |

**原则**：先被动后主动，先收集再行动。

## 二、被动侦察工具

### 1. Google Hacking（Google Dork）

利用搜索引擎高级语法快速发现敏感信息：

```
# 查找目标站点的敏感文件
site:example.com filetype:pdf
site:example.com filetype:xlsx
site:example.com intitle:"index of"

# 查找登录页面
site:example.com inurl:admin
site:example.com inurl:login

# 查找暴露的配置文件
site:example.com filetype:env
site:example.com filetype:conf
```

**实战**：用 Google Dork 找到一个暴露的 `.env` 文件，里面包含数据库密码——这在真实测试中经常发生。

### 2. WHOIS 查询

```bash
# 查询域名注册信息
whois example.com

# 关键信息：
# - 注册人姓名/邮箱（社会工程学线索）
# - DNS 服务器
# - 注册时间/过期时间
```

### 3. DNS 信息收集

```bash
# 查询 DNS 记录
dig example.com any
dig example.com mx
dig example.com txt

# DNS 区域传送（如果配置不当）
dig axfr @ns1.example.com example.com

# 使用 dnsenum 自动收集
dnsenum example.com

# 使用 fierce 快速扫描子域
fierce -dns example.com
```

### 4. 子域名发现

```bash
# 使用 Sublist3r
sublist3r -d example.com

# 使用 amass（更强大）
amass enum -d example.com

# 使用 assetfinder
assetfinder example.com
```

### 5. 网络空间搜索引擎

利用公开的网络空间搜索引擎，无需直接接触目标：

| 平台 | 特点 |
|------|------|
| Shodan | 搜索互联网连接设备 |
| Censys | 扫描全网 IP 和证书 |
| Fofa | 国内常用，中文友好 |
| ZoomEye | 国内平台，覆盖广 |

```bash
# Shodan 命令行
shodan search "apache"
shodan host 8.8.8.8
shodan search "org:'Target Org'"
```

## 三、主动侦察工具

### 1. Nmap 端口扫描

Nmap 是渗透测试中最核心的工具之一，功能极其强大：

```bash
# 基础扫描（最常用的 1000 个端口）
nmap 192.168.1.100

# 全端口扫描
nmap -p- 192.168.1.100

# 服务版本探测
nmap -sV 192.168.1.100

# 操作系统探测
nmap -O 192.168.1.100

# 综合扫描（最常用组合）
nmap -sS -sV -O -p- -A 192.168.1.100

# 快速扫描（适合大范围）
nmap -sS -T4 --top-ports 1000 192.168.1.0/24

# 防火墙绕过
nmap -sS -f -f 192.168.1.100  # 分片包
nmap -sS -D RND:10 192.168.1.100  # 伪造源IP
```

### Nmap 扫描类型速查

| 参数 | 类型 | 说明 |
|------|------|------|
| -sS | SYN 扫描 | 最常用，速度快，较隐蔽 |
| -sT | TCP 全连接 | 最可靠，但会被记录 |
| -sU | UDP 扫描 | 速度慢，但发现 DNS/SNMP 等 |
| -sA | ACK 扫描 | 检测防火墙规则 |
| -sN/-sF/-sX | Null/Fin/Xmas | 绕过简单防火墙 |

### 2. Masscan 大规模快速扫描

```bash
# 全端口极速扫描
masscan -p1-65535 192.168.1.100 --rate=10000

# 扫描整个网段的指定端口
masscan -p80,443,22 192.168.1.0/24 --rate=1000
```

### 3. 服务指纹识别

```bash
# 识别 Web 服务
whatweb http://example.com

# CMS 识别
cmsmap -u http://example.com
wpscan --url http://example.com  # WordPress 专用

# 指纹识别
nmap -sV -sC 192.168.1.100
```

## 四、实战流程示例

假设授权测试目标为 `target.com`，完整信息收集流程：

```
第 1 步：被动收集
  - WHOIS 查询域名注册信息
  - Google Dork 搜索敏感文件
  - Shodan 查找开放端口和服务

第 2 步：子域名收集
  - sublist3r -d target.com
  - amass enum -d target.com
  - 整理子域名列表

第 3 步：DNS 分析
  - dig target.com any
  - 查找内部 DNS 服务器

第 4 步：端口扫描
  - nmap -sS -sV -p- target.com
  - 记录所有开放端口和版本

第 5 步：服务识别
  - 对每个端口运行对应工具
  - Web → whatweb/cmsmap
  - SMB → enum4linux
  - SNMP → snmpwalk
```

## 五、信息整理与报告

收集到的信息需要分类整理：

```bash
# 使用 CherryTree 记录（Kali 预装）
cherrytree

# 或使用 Markdown 记录
# 建议结构：
# - 域名信息
# - IP 地址列表
# - 开放端口表
# - 服务版本表
# - 潜在攻击面
```

## 六、常见踩坑

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| Nmap 扫描太慢 | 默认全端口 + 慢速 | 用 -T4 加速，或 --top-ports |
| 子域名工具无结果 | 需 API key | 注册免费 API 配置 |
| Shodan 搜索受限 | 免费额度 | 注册账户获取免费配额 |
| 扫描被防火墙拦截 | 目标有防护 | 尝试分片包、慢速扫描 |

## 安全提醒

> 信息收集是渗透测试中最耗时的阶段，也是最重要的阶段。优秀的信息收集可以让你在后续阶段事半功倍。请务必确保所有扫描行为都在授权范围内进行。

## 小结

- 先被动后主动，先 Google Dork 再 Nmap
- 子域名是重要攻击面，务必全面收集
- Nmap -sS -sV -p- 是最实用的扫描组合
- 把所有发现记录下来，后续阶段会反复用到

> 下一篇我们将深入 Nmap 的使用，从基础到高级技巧，让你的端口扫描更加精准高效。
