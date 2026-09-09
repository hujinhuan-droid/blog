---
title: Kali 下的密码学实战：加密、解密与哈希破解
slug: kali密码学实战加密解密-h8i9j
date: 2026-08-30
visibility: public
tags: Kali Linux, 密码学, 加密解密, OpenSSL, 哈希, 教程
---

# Kali 下的密码学实战：加密、解密与哈希

> 密码学是网络安全的地基。Kali Linux 自带强大的加密解密工具链（OpenSSL、Hashcat、John、GPG 等）。本文带你从对称加密、非对称加密到哈希算法，掌握 Kali 环境下的密码学实战技能。

## 一、密码学基础概念

| 类型 | 特点 | 工具 |
|------|------|------|
| 对称加密 | 同一密钥加解密 | AES、DES、3DES |
| 非对称加密 | 公钥/私钥对 | RSA、ECC |
| 哈希 | 不可逆，用于校验 | MD5、SHA-1、SHA-256 |
| 数字签名 | 完整性 + 不可抵赖 | RSA 签名、DSA |

## 二、OpenSSL 实战

### 1. 对称加密（AES）

```bash
# 加密
openssl enc -aes-256-cbc -salt -in file.txt -out file.enc -k 密码

# 解密
openssl enc -d -aes-256-cbc -in file.enc -out file.txt -k 密码

# 指定迭代（更安全）
openssl enc -aes-256-cbc -salt -iter 10000 -in file.txt -out file.enc
```

### 2. 非对称加密（RSA）

```bash
# 生成 RSA 密钥对
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048
# 提取公钥
openssl rsa -in private.pem -pubout -out public.pem

# 用公钥加密（数据量小的消息）
echo "秘密信息" | openssl pkeyutl -encrypt -pubin -inkey public.pem -out enc.bin
# 用私钥解密
openssl pkeyutl -decrypt -inkey private.pem -in enc.bin
```

### 3. 数字签名

```bash
# 签名
openssl dgst -sha256 -sign private.pem -out file.sig file.txt
# 验证
openssl dgst -sha256 -verify public.pem -signature file.sig file.txt
```

### 4. 哈希计算

```bash
# MD5
md5sum file.txt
# SHA1
sha1sum file.txt
# SHA256
sha256sum file.txt

# OpenSSL 也可以
openssl dgst -md5 file.txt
openssl dgst -sha256 file.txt
```

## 三、哈希破解（回顾 + 进阶）

### 识别哈希类型

```bash
hashid '5f4dcc3b5aa765d61d8327deb882cf99'  # MD5 (123456)
hashid '$2y$10$QSaPTsF3n.'                  # bcrypt
```

### Hashcat 实战

```bash
# MD5 字典破解
hashcat -m 0 -a 0 hash.txt rockyou.txt

# SHA1
hashcat -m 100 -a 0 hash.txt rockyou.txt

# bcrypt（慢，需 GPU）
hashcat -m 3200 -a 0 hash.txt rockyou.txt

# NTLM
hashcat -m 1000 -a 0 hash.txt rockyou.txt

# 掩码暴力
hashcat -m 0 -a 3 hash.txt ?d?d?d?d?d?d

# 规则
hashcat -m 0 -a 0 hash.txt rockyou.txt -r best64.rule
```

### John the Ripper

```bash
# 破解 /etc/shadow
unshadow /etc/passwd /etc/shadow > hash.txt
john hash.txt --wordlist=rockyou.txt
john --show hash.txt
```

## 四、GPG（GNU 隐私保护）

```bash
# 生成密钥对
gpg --gen-key

# 加密文件
gpg -e -r 邮箱@example.com file.txt

# 解密
gpg -d file.txt.gpg

# 签名
gpg -a --sign file.txt

# 验证
gpg --verify file.txt.gpg
```

## 五、密码学在渗透测试中的应用

### 1. 分析弱加密

```bash
# 检测加密算法安全性
# 弱：DES、3DES（K=56）、MD5、SHA1（已破）
# 强：AES-256、SHA256、RSA-2048+

# 检查 TLS 配置
sslyze --regular example.com
openssl s_client -connect example.com:443 -tls1_2
```

### 2. 数据库 / Web 密码破解

```bash
# 网站数据库的密码哈希
# 如 MySQL 的 *SHA1(SHA1(pass))，用 hashcat -m 3300
hashcat -m 3300 hash.txt rockyou.txt

# WordPress 密码（phpass）
hashcat -m 400 hash.txt rockyou.txt
```

### 3. 邮件加密检查

```bash
# 检查邮件证书 / 签名
openssl pkcs12 -in mail.p12 -info -nodes
```

## 六、防御：密码学安全最佳实践

- 使用强算法：AES-256 / SHA-256 / RSA-2048 / ECC
- 不要用 MD5 / SHA1 做安全用途
- 密码加盐（salt）防彩虹表
- 用 bcrypt / Argon2 做密码哈希（内置盐+迭代）
- 密钥管理：私钥永远不共享、使用硬件钥匙

## 安全提醒

> 密码学工具是双刃剑。加密可保护数据，也可用于隐藏恶意数据。请合理合法使用，仅用于安全学习、防御加固与授权测试。

## 小结

- OpenSSL 一把梭：加密/解密/签名/哈希全能
- Hashcat 破解哈希的速度与 GPU 相关
- GPG 适合日常文件加密
- 密码学防御：强算法 + 加盐 + 迭代 + 密钥安全
- 掌握密码学，是理解攻防的基础

> 下一篇：渗透测试靶场实战——DVWA、Vulhub、HackTheBox 通关指南。