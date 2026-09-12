---
title: API 安全测试：从文档挖掘到越权检测
slug: kali-4-api安全测试-9i0j1
date: 2026-09-12
visibility: public
tags: [Kali Linux, API安全, REST, 越权, 渗透测试]
category: Web安全
---

# API 安全测试：从文档挖掘到越权检测

> 现在的 Web 应用大多是"前后端分离 + API 驱动"。**API 安全测试**已成为 Web 渗透的核心。本文从 API 文档挖掘、鉴权测试到越权检测，讲透 REST API 的测试方法。

## 一、API 基础

### 常见 API 类型

```
REST API（JSON/XML）
GraphQL（单一端点）
SOAP（XML 复杂）
gRPC（二进制）
```

### API 安全测试点

```
- 鉴权（AuthN）：Token/密钥
- 授权（AuthZ）：越权
- 注入：SQLi / NoSQLi / SSRF
- 逻辑：重复支付/积分操纵
- 滥用：爆破/限流缺失
```

## 二、发现 API 面

### 1. 从抓包找

```bash
# Burp 拦截 + 历史流量
# 找：/api/、/v1/、/graphql、/internal
```

### 2. 从文档挖

```bash
# 常见文档路径
/api/swagger.json
/api/swagger-ui.html
/api/docs
/api/v1/openapi.json
```

```bash
curl http://target/api/swagger.json | jq .
# 导出全部 API 端点清单
```

### 3. 从 JS 源码找

```bash
# 前端 JS 里找 API 路径
grep -rE "/api/[a-z0-9/]+" app.js
# 工具：JSFinder
```

## 三、API 鉴权测试

### 无认证（最危险）

```bash
# 直接请求受保护接口，未带 Token
curl http://target/api/v1/users
# 返回 200 + 数据 → 未授权！
```

### Token 失效测试

- 过期 Token 是否可用
- JWT 篡改（改 payload、改算法 alg=none）
- Refresh Token 是否可无限续期

```bash
# JWT 伪造
jwt_tool <token> -T -S hs256 -p "secret"
# 弱密钥爆破
```

## 四、越权测试（IDOR）

```
核心：替换资源 ID，看是否越权
GET /api/v1/order?id=1001
→ 改成 1002，能否看到他人订单？
```

### 测试流程

```bash
1. 登录 A、B 两个账号
2. A 拿 Token → 访问 B 的资源 ID
3. 若返回 B 的数据 → 水平越权
4. 测试垂直越权（普通用户调管理员接口）
```

## 五、其他 API 漏洞

| 漏洞 | 测试方法 |
|------|---------|
| SQL 注入 | 参数加 '，观察报错 |
| SSRF | url/image_url 参数 |
| 限流缺失 | 无限爆破登录/注册 |
| 批量操作 | 一次返回大量数据 |
| 敏感信息 | 响应含密码哈希/密钥 |
| 逻辑漏洞 | 负数金额、重复兑换 |

## 六、Kali API 测试工具

| 工具 | 用途 |
|------|------|
| Burp Suite | 抓包/重放 |
| Postman / Bruno | 接口调试 |
| Arjun | 参数发现 |
| kiterunner | API 路由扫描 |
| nuclei | API 漏洞模板 |

```bash
# arjun 找隐藏参数
arjun -u http://target/api/v1/login
```

## 七、API 安全基线

```
1. 鉴权：一律要求 Token/密钥
2. 授权：RBAC 细化 + 资源所有权校验
3. 限流：登录/下单等敏感接口限流
4. 日志：审计所有 API 访问
5. 文档：Swagger 不对外暴露
6. 响应：不泄露内部堆栈/哈希
```

## 安全合规

> API 测试注意数据隐私：涉及用户数据时只做**最小验证**，不复制敏感数据。

## 小结

- API 是新一代 Web 的主要攻击面
- 文档挖掘（swagger）效率最高
- 越权（IDOR）是 API 最高频漏洞
- 无认证 + 弱 Token + 无限流是三大红旗
- 测试中注意数据最小化与合规

> 下一篇：物理安全与硬件攻击——BadUSB 与 HID 渗透。