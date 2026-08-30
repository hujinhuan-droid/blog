---
title: Kali Linux 安装与初始配置完全指南
slug: kali-linux安装与初始配置-k1a2b
date: 2026-08-30
visibility: public
tags: Kali Linux, 网络安全, 渗透测试, 教程
---

# Kali Linux 安装与初始配置完全指南

Kali Linux 是全球安全从业者最常用的渗透测试发行版，预装了 600+ 安全工具。本文从零开始，手把手教你安装和配置 Kali Linux，打造一个开箱即用的安全实验环境。

## 一、Kali Linux 是什么

Kali Linux 由 Offensive Security 维护，基于 Debian，专为数字取证和渗透测试设计。它的核心优势：

- **预装 600+ 工具**：Nmap、Metasploit、Burp Suite、Wireshark 等开箱即用
- **滚动更新**：始终保持最新工具版本
- **免费开源**：社区活跃，文档齐全
- **多平台支持**：物理机、虚拟机、树莓派、手机都能跑

## 二、安装方式选择

| 方式 | 适合人群 | 优点 | 缺点 |
|------|---------|------|------|
| 虚拟机（推荐） | 初学者 | 不影响主系统、快照回滚 | 占用资源 |
| 物理机 | 进阶用户 | 性能最佳 | 驱动可能有问题 |
| WSL2 | Windows 用户 | 与 Windows 共存 | 部分工具受限 |
| Docker | 开发者 | 轻量快速 | 无 GUI |

## 三、虚拟机安装（推荐方案）

### 第 1 步：下载必要文件

1. 下载 VirtualBox 或 VMware Workstation Player（免费）
2. 从 Kali 官网下载 ISO 镜像（选 Installer 版本）

### 第 2 步：创建虚拟机

```
内存：至少 2GB（建议 4GB+）
硬盘：至少 20GB（建议 40GB+）
CPU：至少 2 核
网络：NAT 模式（默认）
```

### 第 3 步：安装系统

1. 挂载 ISO，启动虚拟机
2. 选择 "Graphical Install"
3. 语言选英文（避免路径问题）
4. 设置用户名和密码（这就是 root 权限用户）
5. 磁盘分区选 "Guided - use entire disk"
6. 等待安装完成，重启

### 第 4 步：安装后首件事

```bash
# 更新系统（最重要的一步）
sudo apt update && sudo apt full-upgrade -y

# 安装常用工具
sudo apt install -y terminator htop git curl wget unzip

# 重启
sudo reboot
```

## 四、初始配置清单

### 1. 配置 SSH 远程登录

```bash
sudo systemctl enable ssh
sudo systemctl start ssh
sudo systemctl status ssh
```

### 2. 配置静态 IP（方便远程连接）

编辑 `/etc/network/interfaces`：
```
auto eth0
iface eth0 inet static
    address 192.168.1.100/24
    gateway 192.168.1.1
    dns-nameservers 8.8.8.8
```

### 3. 安装中文输入法

```bash
sudo apt install -y fcitx5 fcitx5-chinese-addons
```

## 五、安装增强工具

### 安装 Tor 服务

```bash
sudo apt install -y tor
sudo systemctl start tor
```

### 配置 Metasploit 数据库

```bash
sudo systemctl start postgresql
sudo msfdb init
msfconsole -q
```

## 六、常用快捷操作

| 操作 | 命令 |
|------|------|
| 更新所有工具 | `sudo apt update && sudo apt upgrade -y` |
| 查看已装工具 | `dpkg -l \| grep kali` |
| 启动 Apache | `sudo systemctl start apache2` |
| 查看网络接口 | `ip addr` |
| 查看监听端口 | `ss -tlnp` |

## 七、安全提醒

> **重要**：Kali Linux 是安全测试工具，请仅在授权环境下使用。未经许可扫描、攻击他人系统是违法行为。建议在虚拟机实验环境中学习，或使用 HackTheBox、TryHackMe 等合法靶场练习。

## 小结

- 虚拟机安装是最安全的方式，快照功能让你随时回滚
- 安装后第一步是 `apt update && apt full-upgrade`
- 配置好 SSH 后可以远程操作，提高效率
- 工具按需安装，不必一次装全

> 下一篇我们将学习信息收集与被动侦察，这是渗透测试的第一步——了解你的目标。
