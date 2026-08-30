---
title: Nmap 深度指南：从端口扫描到漏洞发现
slug: kali-nmap深度指南-k3c4d
date: 2026-08-30
visibility: public
tags: Kali Linux, Nmap, 端口扫描, 渗透测试, 教程
---

# Nmap 深度指南：从端口扫描到漏洞发现

Nmap（Network Mapper）是渗透测试中最经典的工具，没有之一。从简单的端口扫描到漏洞利用，Nmap 几乎能做一切。本文从基础用法讲到高级技巧，帮你彻底掌握这个神器。

## 一、Nmap 基础

### 最基本的扫描

```bash
# 扫描单个 IP
nmap 192.168.1.100

# 扫描一个网段
nmap 192.168.1.0/24

# 扫描多个 IP
nmap 192.168.1.100 192.168.1.101 192.168.1.102

# 扫描范围
nmap 192.168.1.100-200

# 从文件读取目标
nmap -iL targets.txt
```

### 端口指定

```bash
# 扫描指定端口
nmap -p 80 192.168.1.100
nmap -p 80,443,22 192.168.1.100

# 扫描端口范围
nmap -p 1-1000 192.168.1.100

# 全端口扫描（65535 个端口）
nmap -p- 192.168.1.100

# 最常用的 1000 个端口（默认）
nmap 192.168.1.100

# 只扫 TCP 快速端口
nmap -F 192.168.1.100
```

## 二、扫描类型详解

### 1. SYN 半开扫描（最常用）

```bash
nmap -sS 192.168.1.100
```

- 只发送 SYN 包，不完成三次握手
- 速度快，隐蔽性好
- 需要 root 权限

### 2. TCP 全连接扫描

```bash
nmap -sT 192.168.1.100
```

- 完成完整三次握手
- 不需要 root 权限
- 但会被目标日志记录

### 3. UDP 扫描

```bash
nmap -sU 192.168.1.100
```

- UDP 扫描速度慢（UDP 无连接，需等待超时）
- 可发现 DNS(53)、SNMP(161)、DHCP(67/68) 等服务
- 建议加 `--version-intensity 0` 加速

### 4. 扫描类型速查表

| 参数 | 名称 | 优势 | 劣势 |
|------|------|------|------|
| -sS | SYN 扫描 | 快速隐蔽 | 需 root |
| -sT | TCP 全连接 | 兼容性好 | 易被发现 |
| -sU | UDP 扫描 | 发现 UDP 服务 | 速度慢 |
| -sA | ACK 扫描 | 检测防火墙 | 只判断过滤状态 |
| -sN | Null 扫描 | 绕过简单防火墙 | 不是所有系统都有效 |
| -sF | FIN 扫描 | 同上 | 同上 |
| -sX | Xmas 扫描 | 同上 | 同上 |

## 三、服务与版本探测

### 基础版本探测

```bash
# 探测服务版本
nmap -sV 192.168.1.100

# 指定版本探测强度（0-9）
nmap -sV --version-intensity 5 192.168.1.100

# 全部探测（版本+脚本+OS+traceroute）
nmap -A 192.168.1.100
```

### 操作系统识别

```bash
nmap -O 192.168.1.100

# 更激进的 OS 猜测
nmap -O --osscan-guess 192.168.1.100
```

### NSE 脚本引擎

Nmap 的 NSE 脚本是最强大的功能之一，预装 600+ 脚本：

```bash
# 列出所有脚本
ls /usr/share/nmap/scripts/

# 使用默认脚本（最常用）
nmap -sC 192.168.1.100

# 使用特定脚本
nmap --script vuln 192.168.1.100
nmap --script smb-enum-shares 192.168.1.100
nmap --script http-title 192.168.1.100

# 脚本分类
nmap --script "default" 192.168.1.100        # 默认脚本
nmap --script "vuln" 192.168.1.100           # 漏洞检测
nmap --script "exploit" 192.168.1.100        # 漏洞利用
nmap --script "auth" 192.168.1.100           # 认证检测
nmap --script "brute" 192.168.1.100         # 暴力破解
nmap --script "discovery" 192.168.1.100     # 信息发现
```

## 四、常用 NSE 脚本实战

### 1. SMB 枚举

```bash
# 枚举 SMB 共享
nmap --script smb-enum-shares -p 445 192.168.1.100

# 枚举 SMB 用户
nmap --script smb-enum-users -p 445 192.168.1.100

# 检测 SMB 漏洞（如永恒之蓝）
nmap --script smb-vuln* -p 445 192.168.1.100
```

### 2. HTTP 枚举

```bash
# 获取 HTTP 标题
nmap --script http-title -p 80 192.168.1.100

# 枚举 HTTP 方法
nmap --script http-methods -p 80 192.168.1.100

# 检测 HTTP 指纹
nmap --script http-fingerprint -p 80 192.168.1.100

# 枚举 Web 目录
nmap --script http-enum -p 80 192.168.1.100
```

### 3. MySQL 枚举

```bash
# 检测 MySQL 空密码
nmap --script mysql-empty-password -p 3306 192.168.1.100

# 枚举 MySQL 信息
nmap --script mysql-info -p 3306 192.168.1.100
```

### 4. SNMP 枚举

```bash
# 枚举 SNMP 信息
nmap --script snmp-info -p 161 192.168.1.100

# 枚举系统信息
nmap --script snmp-system-info -p 161 192.168.1.100
```

## 五、性能调优

### 时序模板

```bash
nmap -T0 192.168.1.100  # Paranoid（极慢，极度隐蔽）
nmap -T1 192.168.1.100  # Sneaky（很慢）
nmap -T2 192.168.1.100  # Polite（慢）
nmap -T3 192.168.1.100  # Normal（默认）
nmap -T4 192.168.1.100  # Aggressive（快，最常用）
nmap -T5 192.168.1.100  # Insane（极快，可能丢包）
```

### 并发控制

```bash
# 最大并行扫描
nmap --max-parallelism 100 192.168.1.100

# 最小延迟
nmap --min-rate 1000 192.168.1.100

# 超时设置
nmap --host-timeout 30m 192.168.1.100
```

## 六、输出与报告

```bash
# 标准输出
nmap -oN scan.txt 192.168.1.100

# XML 格式（可导入其他工具）
nmap -oX scan.xml 192.168.1.100

# Grep 格式
nmap -oG scan.gnmap 192.168.1.100

# 全部格式
nmap -oA scan_all 192.168.1.100
```

## 七、实战场景组合

### 场景 1：全面信息收集

```bash
nmap -sS -sV -O -sC -p- -T4 -oA full_scan 192.168.1.100
```

### 场景 2：快速发现存活主机

```bash
# Ping 扫描发现存活主机
nmap -sn 192.168.1.0/24

# 不使用 Ping，直接端口探测
nmap -Pn -p 80,443,22 192.168.1.0/24
```

### 场景 3：漏洞快速扫描

```bash
nmap -sV --script vuln -p- 192.168.1.100
```

### 场景 4：绕过防火墙

```bash
# 分片包扫描
nmap -sS -f -p 80 192.168.1.100

# 伪造源 IP（诱饵扫描）
nmap -sS -D RND:10 -p 80 192.168.1.100

# 使用特定源端口
nmap -sS --source-port 53 -p 80 192.168.1.100
```

## 八、常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 扫描太慢 | 全端口+慢速 | 用 -T4 或 --top-ports |
| 结果不准 | 防火墙过滤 | 加 -Pn 跳过 Ping |
| 权限不足 | 非 root | 用 sudo 或 -sT |
| UDP 扫描超时 | 正常现象 | 加 --version-intensity 0 |
| NSE 脚本报错 | 依赖缺失 | apt install nmap-scripts |

## 安全提醒

> 端口扫描是主动行为，会被防火墙和 IDS 记录。在生产环境中扫描务必获得书面授权。本文所有命令仅在授权测试环境中使用。

## 小结

- `-sS -sV -p- -T4` 是最实用的扫描组合
- NSE 脚本让 Nmap 从"扫描器"升级为"渗透测试框架"
- `-A` 参数一键执行全部探测，适合详细分析
- 输出用 `-oA` 保存全格式，方便后续处理

> 下一篇我们将进入漏洞扫描世界，学习使用 Nessus、OpenVAS 等专业漏洞扫描工具。
