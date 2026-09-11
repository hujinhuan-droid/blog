---
title: 数字取证实战：Autopsy 与事件还原
slug: kali-3数字取证-autopsy-s8t9u
date: 2026-09-30
visibility: public
tags: Kali Linux, 数字取证, Autopsy, 电子证据, 事件还原, 教程
---

# 数字取证实战：Autopsy 与事件还原

> 当系统被入侵或出现违规事件，**数字取证**（Digital Forensics）就是还原真相的手段。本文用 Kali 自带的全套取证工具，带你走一遍完整的取证流程：镜像、分析、还原事件时间线。

## 一、取证的基本原则

```
1. 不改变原始证据（只读挂载/写保护）
2. 先固定证据（哈希验证完整性）
3. 记录整个取证过程（证据链）
4. 使用经过验证的工具
```

### 关键：先做镜像再分析

```bash
# 对磁盘做原始镜像（写到取证设备）
dd if=/dev/sda of=/mnt/evidence/sda.img bs=4M

# 计算哈希（证明未改动）
sha256sum /mnt/evidence/sda.img
```

## 二、Kali 取证工具

| 工具 | 用途 |
|------|------|
| Autopsy | 主取证 GUI（时间线/关键字） |
| Sleuth Kit | Autopsy 的命令行底层 |
| dd | 磁盘镜像 |
| strings / file | 初筛 |
| exiftool | 元数据 |
| volatility | 内存取证 |

## 三、Autopsy 实战

### 1. 启动

```bash
# Kali 自带
autopsy
# 浏览器打开 http://localhost:9999
```

### 2. 新建案件

```
New Case → 名称、路径
→ Add Data Source → 选择镜像文件
→ 分析 → 自动提取时间线、文件系统、哈希库
```

### 3. 常用取证操作

```bash
# 文件浏览：看删除文件（恢复）
# 关键字搜索：搜密码、IP、恶意关键字
# 时间线：还原事件顺序
# 哈希集：匹配已知恶意哈希（哈希数据库）
# 邮件/网页历史：还原活动
```

## 四、事件还原：构造时间线

```
案例：服务器被入侵

1. 获取磁盘镜像
2. Autopsy 打开 → 时间线视图
3. 关注：/tmp 下新文件、异常进程启动时间
4. 关键字搜索攻击特征（反弹 shell、wget 下载）
5. 定位关键文件 → 导出 → 关联 IP

产出：
- 攻击者何时进入
- 用了什么工具
- 留下了什么
- 数据是否被窃取
```

### 关键目录

```
/var/log            # 系统日志
/tmp /var/tmp       # 临时目录（恶意文件高发）
/var/spool/cron     # 计划任务持久化
~/.bash_history     # 命令历史
~/.ssh/authorized_keys  # 后门公钥
```

## 五、内存取证（进阶）

```bash
# 内存镜像（需内核模块）
# volatility3（内存取证）
vol3 -f memory.mem windows.info
vol3 -f memory.mem windows.netstat
vol3 -f memory.mem windows.pslist
vol3 -f memory.mem windows.cmdline
```

> 内存里藏着进程、网络连接、密钥、甚至未加密的密码。

## 六、取证报告

标准报告结构：

```
案件概要
证据清单（镜像、哈希）
时间线
分析发现
结论（行为还原）
法律建议
```

## 七、合规要点

- 取证必须保证证据完整性（哈希 + 链路）
- 个人隐私保护：只提取案件相关
- 提供材料的合法性：需执法授权

## 小结

- 取证第一原则：不改变原数据，先镜像、哈希
- Autopsy 是最常用的图形化取证工具
- 时间线还原是取证的"核心叙事"
- 内存取证是高级手段（进程、密钥）
- 证据链的合法性决定法律效力

> 下一篇：IoT 与嵌入式设备安全测试。