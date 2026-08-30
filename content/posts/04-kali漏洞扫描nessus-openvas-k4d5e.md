---
title: 漏洞扫描实战：Nessus 与 OpenVAS 完全指南
slug: kali漏洞扫描nessus-openvas-k4d5e
date: 2026-08-30
visibility: public
tags: Kali Linux, 漏洞扫描, Nessus, OpenVAS, 教程
---

# 漏洞扫描实战：Nessus 与 OpenVAS 完全指南

信息收集之后，下一步就是漏洞扫描。漏洞扫描器可以自动化地检测目标系统中的已知漏洞，大幅提升渗透测试效率。本文介绍两大主流扫描器：Nessus 和 OpenVAS。

## 一、漏洞扫描器是什么

漏洞扫描器通过比对漏洞数据库，自动检测目标系统的安全缺陷：

| 类型 | 工作方式 | 代表工具 |
|------|---------|---------|
| 网络扫描器 | 发送网络包探测 | Nessus、OpenVAS |
| Web 扫描器 | 模拟 HTTP 请求 | Burp Suite、OWASP ZAP |
| 代码扫描器 | 分析源代码 | SonarQube、Bandit |

## 二、Nessus 安装与使用

Nessus 是全球最流行的漏洞扫描器，家庭版免费（最多扫 16 个 IP）。

### 1. 安装 Nessus

```bash
# 下载 Nessus（从官网获取 deb 包）
# https://www.tenable.com/products/nessus/nessus-essentials

# 安装
sudo dpkg -i Nessus-*.deb

# 启动服务
sudo systemctl start nessusd
sudo systemctl enable nessusd

# 访问 Web 界面
# https://127.0.0.1:8834/
```

### 2. 初始化配置

1. 浏览器访问 `https://127.0.0.1:8834/`
2. 选择 "Nessus Essentials"（免费版）
3. 输入注册邮箱获取激活码
4. 等待插件编译（首次约 10-30 分钟）

### 3. 创建扫描任务

```
1. 点击 New Scan
2. 选择扫描模板：
   - Basic Network Scan：基础网络扫描
   - Advanced Scan：自定义扫描
   - Web Application Tests：Web 应用扫描
   - Internal PCI Network Scan：合规扫描
3. 填写目标 IP/网段
4. 配置认证（可选，有凭据扫描更准确）
5. 启动扫描
```

### 4. Nessus 扫描模板详解

| 模板 | 用途 | 适用场景 |
|------|------|---------|
| Basic Network Scan | 基础漏洞扫描 | 快速评估 |
| Advanced Scan | 完全自定义 | 精确扫描 |
| Web Application Tests | Web 漏洞 | Web 渗透 |
| Credentialed Patch Audit | 带凭据补丁审计 | 内网扫描 |
| Malware Scan | 恶意软件检测 | 主机检测 |
| Compliance Audit | 合规审计 | 合规检查 |

### 5. 查看与导出报告

```
扫描完成后：
1. 点击扫描结果查看漏洞列表
2. 按 Severity 排序：Critical > High > Medium > Low > Info
3. 点击每个漏洞查看详情：
   - 描述
   - 修复建议
   - CVE 编号
   - CVSS 评分
4. 导出报告：Export → PDF / HTML / CSV
```

## 三、OpenVAS 安装与使用

OpenVAS（现称 Greenbone）是开源漏洞扫描器，功能对标 Nessus，完全免费。

### 1. 安装 OpenVAS

```bash
# Kali 中安装
sudo apt update
sudo apt install -y openvas

# 初始化（首次运行需要较长时间）
sudo gvm-setup

# 启动
sudo gvm-start

# 检查状态
sudo gvm-check-setup
```

### 2. 访问 Web 界面

```bash
# 默认地址
https://127.0.0.1:9392/

# 默认账号
# 用户名：admin
# 密码：admin（或初始化时设置的密码）
```

### 3. 创建扫描任务

```
1. Configuration → Targets：添加扫描目标
2. Scans → Tasks：创建新任务
3. 选择扫描配置：
   - Full and fast：全面快速（最常用）
   - Full and very deep：全面深度
   - System Discovery：系统发现
4. 启动扫描
```

### 4. OpenVAS 扫描配置

| 配置 | 特点 | 耗时 |
|------|------|------|
| Full and fast | 全面且快速 | 1-2 小时 |
| Full and very deep | 最全面 | 4-8 小时 |
| Full and very deep ultimate | 极限扫描 | 8+ 小时 |
| System Discovery | 仅发现 | 15-30 分钟 |

## 四、Nessus vs OpenVAS 对比

| 特性 | Nessus | OpenVAS |
|------|--------|---------|
| 价格 | 免费版16IP | 完全免费 |
| 易用性 | 优秀 | 良好 |
| 扫描速度 | 快 | 中等 |
| 漏洞库 | 最全 | 很全 |
| 报告质量 | 专业 | 良好 |
| 资源占用 | 中等 | 较高 |
| 社区支持 | 商业+社区 | 开源社区 |

**建议**：个人学习用 Nessus Essentials，企业/大量扫描用 OpenVAS。

## 五、扫描结果分析

### 漏洞严重等级

```
Critical（9-10分）  → 立即修复，可直接被利用
High（7-8.9分）     → 优先修复，可能被利用
Medium（4-6.9分）   → 计划修复
Low（0.1-3.9分）    → 评估后决定
Info（0分）         → 信息记录，无需修复
```

### 关键关注点

1. **可远程利用的 Critical/High 漏洞**：最高优先级
2. **已知 Exploit 的漏洞**：检查 Exploit-DB 是否有公开利用
3. **弱密码/空密码**：立即修复
4. **过期的软件版本**：检查是否有已知漏洞

### 验证漏洞

```bash
# 搜索漏洞利用
searchsploit "Apache 2.4.49"

# 查看 CVE 详情
searchsploit -x 12345

# 使用 Metasploit 验证
msfconsole
msf> search name:target
msf> use exploit/...
msf> set RHOSTS 192.168.1.100
msf> check  # 验证漏洞是否存在（不利用）
```

## 六、实战流程

### 内网漏洞扫描完整流程

```bash
# 1. Nmap 快速发现存活主机和开放端口
nmap -sn 192.168.1.0/24
nmap -sS -sV --top-ports 1000 192.168.1.0/24

# 2. Nessus 扫描高风险目标
# 创建 Basic Network Scan，目标设为关键 IP

# 3. OpenVAS 深度扫描
# 对关键服务器使用 Full and fast

# 4. 针对性验证
# 用 Metasploit check 验证关键漏洞
# 用 searchsploit 搜索公开 Exploit

# 5. 生成报告
# Nessus: Export PDF
# OpenVAS: 导出 XML/HTML
```

## 七、常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| Nessus 插件编译慢 | 首次需要编译 | 等待 10-30 分钟 |
| OpenVAS 启动失败 | 资源不足 | 至少 4GB 内存 |
| 扫描结果不准确 | 未配置认证 | 添加 SSH/SMB 凭据 |
| 扫描时间太长 | 深度扫描 | 用快速模板 |
| OpenVAS 数据库错误 | 初始化不完整 | 重新 gvm-setup |

## 安全提醒

> 漏洞扫描会产生大量网络流量，可能影响目标系统正常运行。在扫描生产环境前，务必获得授权，并选择合适的时间窗口（如维护窗口期）。

## 小结

- Nessus 易用性好，适合快速评估；OpenVAS 免费，适合大规模扫描
- 带凭据扫描（Authenticated Scan）准确率远高于无凭据扫描
- 扫描结果需要验证，不是所有漏洞都能直接利用
- 按 Critical → High → Medium 优先级修复

> 下一篇我们将学习 Metasploit 框架，将扫描发现的漏洞转化为实际的渗透成果。
