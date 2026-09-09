---
title: Wireshark 协议分析与流量取证：从数据包还原真相
slug: kali-wireshark协议分析流量取证-g7h8i
date: 2026-08-30
visibility: public
tags: Kali Linux, Wireshark, 流量分析, 取证, tcpdump, 教程
---

# Wireshark 协议分析与流量取证：从数据包还原真相

> Wireshark 是全球最流行的网络协议分析器，是网络排障、安全分析、流量取证的必备工具。本文从基础抓包到协议分析、密码还原、流量取证，带你吃透 Wireshark。

## 一、Wireshark 基础

### 安装与启动

```bash
# Kali 自带，若无
sudo apt install wireshark

# 启动
sudo wireshark
# 抓包需要 root 权限
```

### 抓包界面

```
网卡选择 → 开始抓包 → 停止 → 过滤分析

列：
No.  Time  Source  Destination  Protocol  Length  Info
```

## 二、捕获过滤（抓包时过滤）

```bash
# 只抓某主机
host 192.168.1.100

# 只抓某端口
port 80
port 443

# 组合
host 192.168.1.100 and port 80
not port 53

# 网段
net 192.168.1.0/24
```

## 三、显示过滤（分析时过滤）

```bash
# 协议过滤
http
https
dns
tcp
udp
arp
icmp

# IP 过滤
ip.src == 192.168.1.100
ip.dst == 192.168.1.1

# 端口过滤
tcp.port == 80
tcp.dstport == 443

# 内容过滤
http.request.method == "POST"
http.request.method == "GET"
http.response.code == 200
tcp.flags.syn == 1
```

## 四、协议分析与密码还原

### 1. 还原 HTTP 登录密码

```
1. 抓包
2. 显示过滤：http.request.method == "POST"
3. 找到包含 login / password 的请求
4. 右键 → Follow HTTP Stream（跟踪流）
5. 在 POST 数据中找到明文账号密码
```

### 2. 还原 FTP / Telnet 密码

```bash
# FTP
tcp.port == 21
# 找 USER / PASS 命令，明文

# Telnet
tcp.port == 23
# 键盘输入也是明文
```

### 3. 还原 IMAP / SMTP

```bash
# 邮件协议：tcp.port == 143 or 110 or 25
# USER / PASS 也是明文（旧协议）
```

### 4. 解密 HTTPS（需密钥）

```
# 方法1：通过 SSLKEYLOGFILE 导出浏览器密钥
# 方法2：使用私钥 + 服务器证书（需解密点）

# Wireshark → 编辑 → 首选项 → Protocols → TLS → (Pre)-Master-Secret log filename
# 填入浏览器导出的密钥日志文件
```

## 五、流量取证实战

### 场景：分析恶意软件流量

```
1. 先看 DNS 查询：dns.flags.response == 1
   异常域名（C2、dga 算法域名）
2. 看 HTTP 请求：http.request
   可疑下载（.exe / .dll）
3. 看 TLS：tls.handshake
   识别 TLS 指纹、SNI
4. 导出对象（文件）
   File → Export Objects → HTTP
   提取可执行文件做哈希分析
```

### 场景：登录凭证暴力破解分析

```
过滤 tcp.port == 80
看是否大量 POST /login
看响应码 401 持续出现 → 爆破行为
```

### 场景：时间分析

```
Wireshark 支持统计：
Statistics → 协议层级
Statistics → 对话
Statistics → 端点
```

## 六、tcpdump 命令行抓包

```bash
# 基本
tcpdump -i eth0
tcpdump -i eth0 -n  # 不解析域名
tcpdump -i eth0 -A  # 显示 ASCII（便于看明文）

# 过滤
tcpdump host 192.168.1.100
tcpdump port 80
tcpdump port 443 and host 192.168.1.100

# 保存为文件
tcpdump -i eth0 -w capture.pcap

# 读取
tcpdump -r capture.pcap
```

## 七、常见协议抓包要点

| 协议 | 端口 | 关注点 |
|------|------|--------|
| HTTP | 80 | 明文请求、密码、Cookie |
| HTTPS | 443 | TLS 指纹、SNI、证书 |
| FTP | 21 | USER/PASS 明文 |
| Telnet | 23 | 明文 |
| SMTP | 25/465 | 邮件内容 |
| DNS | 53 | 域名、DNS 隧道 |
| SMB | 445 | 共享枚举 |
| SSH | 22 | 流量加密但可分析加密前 |

## 八、安全与合规

- 抓包可能涉及隐私数据，仅限授权环境
- 抓包工具本身合法，用途决定性质
- 企业内网抓包需获得授权

## 小结

- Wireshark = 抓包 + 过滤 + 分析 + 取证
- 明文协议（HTTP/FTP/Telnet）可直接还原密码
- HTTPS 需密钥才能解密，但仍可分析 TLS 元数据
- tcpdump 适合命令行与远程抓包
- 流量取证是应急响应的核心环节

> 下一篇：Kali 下的密码学与加密解密实战。