---
title: 渗透测试靶场实战：DVWA、Vulhub、HackTheBox 通关指南
slug: kali渗透测试靶场实战-dvwa-vulhub-i9j0k
date: 2026-08-30
visibility: public
tags: Kali Linux, 靶场, DVWA, Vulhub, HackTheBox, 渗透测试, 教程
---

# 渗透测试靶场实战：DVWA、Vulhub、HackTheBox 通关指南

> 纸上得来终觉浅，绝知此事要躬行。安全技术最好的练习场是**靶场**——一个合法、安全、可重复的环境。本文介绍 DVWA、Vulhub、HackTheBox 三大靶场的搭建与实战通关技巧。

## 一、为什么必须刷靶场

- 安全学习必须有**合法**环境，靶场完全合规
- 靶场模拟真实漏洞，练手效率高
- 覆盖 Web、系统、内网、二进制等多个方向
- 很多公司面试直接问"你刷过哪些靶场"

## 二、DVWA（Web 漏洞练习平台）

### DVWA 简介

Damn Vulnerable Web Application，最著名的 Web 漏洞练习靶场，包含 SQLi、XSS、文件上传、命令注入等 10 余类漏洞。

### 搭建 DVWA

```bash
# 需要 LAMP：Apache + MySQL + PHP
sudo apt install apache2 mysql-server php libapache2-mod-php

# 下载 DVWA
git clone https://github.com/danmi/DVWA.git /var/www/html/DVWA

# 配置数据库
sudo mysql -u root -e "create database dvwa;"
sudo mysql -u root -e "grant all on dvwa.* to 'dvwa'@'localhost' identified by 'p@ssw0rd';"

# 修改配置
cp /var/www/html/DVWA/config/config.inc.php.dist config.inc.php
# 修改 $DB_PASSWORD 为 p@ssw0rd

# 启动服务
sudo systemctl start apache2 mysql

# 访问
http://localhost/DVWA/setup.php
# 点击 Create/Reset Database

# 登录（默认）
admin / password
```

### DVWA 难度等级

```
Low    : 未加防护，直接演示漏洞原理
Medium : 部分过滤
High   : 大部分过滤
Impossible : 完全防御（作为对照）
```

### DVWA 常用漏洞实战

#### SQL 注入（Low）

```sql
-- 输入框
1' OR 1=1 -- -
-- 联合查询
' UNION SELECT user, password FROM users-- -
```

#### XSS

```html
<!-- 反射型 -->
<script>alert(1)</script>

<!-- 存储型（留言板） -->
<img src=x onerror=alert(document.cookie)>
```

#### 命令注入

```
127.0.0.1; ls
127.0.0.1 && whoami
127.0.0.1 | id
```

## 三、Vulhub（漏洞环境集合）

### Vulhub 简介

Vulhub 基于 Docker 一键搭建的漏洞靶场集合，涵盖大量 CVE 漏洞环境。

### 搭建 Vulhub

```bash
# 安装 docker
sudo apt install docker.io docker-compose

# 拉取 Vulhub
git clone https://github.com/vulhub/vulhub.git
cd vulhub

# 进入某个漏洞环境
cd thinkphp/5.0.23-rce

# 启动
docker-compose up -d

# 访问 http://127.0.0.1:8080 即可测试

# 用完清理
docker-compose down
```

### 经典漏洞环境

| 环境 | 漏洞 | 实战 |
|------|------|------|
| ThinkPHP 5.0.23 | RCE | 远程命令执行 |
| Apache Log4j2 | JNDI RCE | 2021 Log4shell |
| Struts2 S2-045 | RCE | 命令执行 |
| PHP 反序列化 | 反序列化 | 深度利用 |
| Redis 未授权 | 未授权访问 | 写 WebShell |

## 四、HackTheBox（在线实战）

### 简介

HackTheBox（HTB）是国际知名在线渗透测试平台，提供真实机器环境（Windows/Linux）与靶场，通关即可获得点数。

### 使用流程

```
1. 注册 → 用 OpenVPN 连接
2. 选择靶机（如 Apolo、Lame...）
3. 对靶机进行渗透
4. 得到 flag 后提交计分
```

### 典型 HTB 靶机思路

```
1. Nmap 扫描端口与服务
2. 识别版本 → 搜索 CVE
3. 利用漏洞拿初始 shell
4. 信息收集 → 提权到 root
5. 拿到 root flag
```

## 五、其他靶场推荐

| 靶场 | 类型 | 说明 |
|------|------|------|
| WebGoat | Web | OWASP 官方 |
| bWAPP | Web | 100+漏洞 |
| Sqli-Labs | SQLi | 60 关 SQL 注入专项 |
| XSS-Labs | XSS | XSS 专项 |
| 红日靶场 | 内网 | 内网渗透实战 |
| VulnHub | 综合 | 下载 VM 打穿 |

## 六、刷靶场方法论

```
1. 从 DVWA（Web 基础）开始，全部漏洞走一遍
2. 上 Vulhub 刷真实 CVE 环境
3. 再刷 HTB（企业级环境）
4. 内网：红日靶场 / 内网靶场
5. 复盘：每个漏洞的根因 + 修复方式

时间分配：基础 30% → 专项 40% → 综合 30%
```

## 七、安全合规

> 靶场练习是合法合规的方式。不要对未授权的真实系统做测试。

## 小结

- DVWA 最适合新手理解 Web 漏洞
- Vulhub 用 Docker 一键还原真实 CVE 环境
- HackTheBox 让靶场真实化（线上）
- 刷靶场是技能提升最高效的路径
- 从基础到真实环境循序渐进

> 下一篇：蓝队防守与应急响应——从发现入侵到溯源反制。