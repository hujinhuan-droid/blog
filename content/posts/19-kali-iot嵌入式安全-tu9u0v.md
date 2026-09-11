---
title: IoT 与嵌入式设备安全测试：从固件到硬件
slug: kali-3-iot嵌入式安全测试-t9u0v
date: 2026-09-30
visibility: public
tags: Kali Linux, IoT, 嵌入式安全, 固件分析, 硬件安全, 渗透测试, 教程
---

# IoT 与嵌入式设备安全测试：从固件到硬件

> 家里的摄像头、智能门锁、路由器…… **IoT 设备**无处不在，但安全性却常常形同虚设。本文从固件提取、binwalk 分析到串口调试、硬件接口攻击，带你完整认识 IoT 设备的安全测试。

## 一、IoT 设备攻击面

```
设备层
├─ 固件（固件镜像/认证逻辑）
├─ 硬件接口（UART/SPI/JTAG）
├─ 无线（WiFi/BT/Zigbee）
├─ Web 管理后台（弱口令/命令注入）
└─ 云服务（设备云 API）
```

## 二、固件分析

### 1. 获取固件

- 厂商官网下载
- 设备拆机（SPI Flash 读取）
- 固件升级包抓包

### 2. 解包分析

```bash
# 固件类型识别
binwalk 固件.bin

# 提取文件系统（squashfs 等）
binwalk -Me 固件.bin

# 查看文件系统内内容
ls extracted/
# 通常会得到 Linux 文件系统（squashfs）
# 重点找：
#  - /etc/passwd、shadow（密码）
#  - 配置文件（Wi-Fi 密码、私钥）
#  - 硬编码令牌
```

### 3. 固件常见问题

| 问题 | 说明 |
|------|------|
| 默认口令 | admin/admin |
| 硬编码后门 | 内置 telnet 账号 |
| 老版本组件 | OpenSSL 漏洞 |
| 不安全加密 | 硬编码密钥 |

## 三、固件模拟运行

```bash
# 用 QEMU 模拟运行固件
qemu-system-arm -M virt -kernel vmlinuz ... 
# 或使用 FirmAE（自动化模拟框架）
```

> 模拟运行后可在宿主机上直接扫描漏洞。

## 四、硬件接口攻击

### UART（串口）调试

```
设备拆机 → 找到 UART 焊盘/排针
用 USB-TTL 线连接：
  TX → RX
  RX → TX
  GND → GND

配置 115200 波特率：
  minicom -D /dev/ttyUSB0 -b 115200
拿到 shell（很多设备默认 root 无密码）
```

### SPI Flash 读取

```bash
# 用编程器（如 CH341A）读取 Flash
flashrom -p ch341a_spi -r firmware.bin
```

## 五、无线攻击（IoT 场景）

```bash
# 识别蓝牙设备
hcitool scan

# 扫描 Zigbee/Z-Wave 网络
# 用专用无线电工具（如 HackRF）

# 分析 MQTT（IoT 常用协议）明文
# tshark 抓包过滤 mqtt
tshark -i eth0 -f "tcp port 1883" -V
```

## 六、Web 管理后台渗透

设备管理页通常使用轻量 Web 服务器，常见漏洞：

```
默认口令（admin/admin）
命令注入（ping 参数）
未授权访问（.git/配置泄露）
固件升级接口（上传恶意固件）
```

```bash
# 扫描设备 Web 服务
nikto -h http://192.168.1.1
```

## 七、工具速查

| 工具 | 用途 |
|------|------|
| binwalk | 固件提取 |
| QEMU | 固件模拟 |
| GDB | 硬件调试 |
| UART 工具 | 串口调试 |
| mmlsn | 蓝牙攻击框架 |
| mbt | MQTT 测试 |
| medusa | 路由器爆破 |

## 八、防御加固

- 默认口令强制修改
- 固件签名校验（防篡改）
- 禁用 UART 后门（/只用于生产）
- 固件升级机制安全
- MQTT 走 TLS + 认证

## 安全合规

> IoT 测试需要设备**所有权或授权**。对别人家的路由器、智能家居进行攻击违法。测试在实验室环境进行。

## 小结

- IoT 安全 = 固件分析 + 硬件调试 + 无线 + Web
- binwalk 是固件分析的起点
- UART 是硬件攻击最实用的入口
- 默认口令与硬编码后门是最常见问题
- 智能设备的攻击面远大于想象

> 下一篇：渗透测试方法论——从 PTES 到报告撰写。