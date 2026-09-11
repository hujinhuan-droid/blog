---
title: Burp Suite 实战指南：Web 渗透测试的核心武器
slug: kali-burp-suite实战-l1m2n
date: 2026-09-11
visibility: public
tags: Kali Linux, Burp Suite, Web安全, 渗透测试, 代理, 教程
---

# Burp Suite 实战：Web 渗透测试的核心武器

> 如果说 Nmap 是信息收集的瑞士军刀，那么 **Burp Suite 就是 Web 渗透测试的"主炮台"**。几乎所有 Web 漏洞的发现与验证都离不开它。本文从零开始，带你掌握 Burp Suite 的核心功能与实战流程。

## 一、Burp Suite 是什么

Burp Suite 是 PortSwigger 公司出品的 Web 应用安全测试工具，集**拦截代理、扫描、爆破、重放、解码**于一体。

| 版本 | 说明 |
|------|------|
| Community（社区版） | 免费，Kali 自带，核心功能可用 |
| Professional（专业版） | 商业版，含主动扫描 |
| Enterprise（企业版） | 自动化扫描平台 |

## 二、环境搭建：浏览器 + 代理

### 配置浏览器代理

```
1. 启动 Burp Suite（Kali 终端输入 burpsuite）
2. 默认代理监听 127.0.0.1:8080
3. 浏览器设置代理 → 127.0.0.1:8080
4. 安装 CA 证书（访问 http://burp 下载，用于解密 HTTPS）
```

### 验证代理生效

```
访问 http://burp 或任意网站
Burp 的 HTTP History 里能看到所有请求
```

## 三、核心模块逐个击破

### 1. Proxy（代理/拦截）

```
- Intercept 标签：抓包/改包
- HTTP History：查看所有历史流量
- WebSocket History：WebSocket 流量
- Options：监听端口、证书配置
```

实战示例：修改请求

```
1. 打开拦截（Intercept is on）
2. 浏览器提交表单
3. Burp 拦截到请求 → 修改参数值
4. 点击 Forward 放行 → 服务器收到修改后的数据
```

### 2. Repeater（重放器）

- 手动修改并重发请求
- 常用于**手工验证漏洞**（SQLi、越权、逻辑漏洞）

```
1. 在 HTTP History 找到目标请求 → 右键 Send to Repeater
2. 修改参数，如：id=1' OR '1'='1
3. 点击 Send，观察响应变化
```

### 3. Intruder（暴力破解/模糊测试）

四类攻击模式：

| 模式 | 用途 |
|------|------|
| Sniper | 单参数逐个爆破 |
| Battering ram | 多参数用同一字典 |
| Pitchfork | 多参数用不同字典（同步） |
| Cluster bomb | 多参数用不同字典（笛卡尔积） |

实战：登录爆破

```
1. 拦截登录请求 → Send to Intruder
2. 标记密码参数为 Payload position
3. Payloads 加载弱密码字典
4. 启动攻击，观察长度/状态码差异
```

### 4. Decoder / Comparer

- **Decoder**：URL/Base64/Hex 编解码、哈希
- **Comparer**：对比两个响应（找爆破成功的差异）

### 5. Extender（扩展）

- BApp Store 安装扩展
- 常用扩展：Turbo Intruder、403 Bypasser、Hackvertor

## 四、实战流程：用 Burp 发现 SQL 注入

```
1. 拦截搜索请求 → 发现参数 keyword
2. 先用 Repeater 手工验证
   keyword=1'       → 报错？
   keyword=1' or '1'='1 → 返回全部数据？
3. 再用 sqlmap + Burp 流量
   sqlmap -u "http://target/search?keyword=1" --proxy=http://127.0.0.1:8080
4. 确认注入点后验证数据库类型
```

## 五、常见技巧

```
- 目标网站可跳过 HTTPS 证书校验失败：在 Proxy Options 里导入 CA
- 扫描目录：配合 dirsearch/gobuster，请求走 Burp 代理
- 抓取移动端流量：手机 WiFi 代理指向电脑 8080
- 拦截 WebSocket：Proxy 支持 WebSocket 拦截
```

## 安全合规

> Burp Suite 只用于**已授权**的 Web 应用测试。对他人网站进行扫描、爆破属于违法行为。

## 小结

- Burp 四大核心：Proxy（拦截）、Repeater（重放）、Intruder（爆破）、Decoder（编解码）
- 先抓包看流量，再重放验证漏洞，最后爆破扩大战果
- 与 sqlmap、dirsearch、nikto 配合使用效果更佳
- 移动端、WebSocket、扩展插件是进阶方向

> 下一篇：逆向工程与二进制分析——用 Ghidra 读懂程序的秘密。