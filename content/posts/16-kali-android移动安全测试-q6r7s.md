---
title: Android 移动应用渗透测试：从抓包到反编译
slug: kali-android移动安全测试-q6r7s
date: 2026-09-30
visibility: public
tags: Kali Linux, Android安全, 移动安全, 反编译, Frida, 渗透测试, 教程
---

# Android 移动应用渗透测试：从抓包到反编译

> 移动应用已经成为企业业务的核心入口，也是攻击面最大的入口之一。本文手把手带你完成 Android 应用的完整安全测试流程：环境搭建、抓包、静态分析、动态调试与常见漏洞。

## 一、测试环境搭建

### 基础组件

```
Kali（攻击机）
├── Android SDK（adb / apktool）
├── Frida（动态插桩）
├── Burp Suite（抓包）
└── 目标：Android 模拟器或真机（root 最佳）
```

### adb 连接设备

```bash
adb devices                  # 查看设备
adb shell                    # 进入 shell
adb push 文件.apk /data/local/tmp/
adb install test.apk         # 安装
```

## 二、静态分析

### 1. 反编译 APK

```bash
# 反编译到 smali 代码（可读）
apktool d app.apk -o app_src

# 查看清单文件（找出口组件、权限）
cat app_src/AndroidManifest.xml

# Java 层反编译（还原 Java 代码）
jadx app.apk -d decompiled/
```

### 2. 关键审计点

| 审计点 | 危险信号 |
|--------|---------|
| 权限申请 | 滥用 RECORD_AUDIO / READ_SMS 等 |
| exported 组件 | 外部可调用 Activity/Service |
| WebView | addJavascriptInterface + allowFileAccess |
| 硬编码密钥 | 在代码/字符串中出现 Secret/Key |
| 不安全传输 | http:// 明文流量 |

### 3. 快速搜索硬编码

```bash
grep -rniE "password|secret|api_key|token" decompiled/
strings app.apk | grep -i key
```

## 三、动态测试

### 1. 抓包（HTTP/HTTPS）

```bash
# 方法一：Burp + 模拟器代理
# 模拟器设置 → WiFi → 代理 → 127.0.0.1:8080

# 方法二：证书注入（默认不信任自签 CA）
# 将 Burp CA 证书 push 到系统证书目录
adb push burp_ca.der /data/local/tmp
# 需 root 或 Android 7+ 系统分区可写
```

> 安卓 7+ 默认只信任系统 CA，多数应用还需要**绕过 SSL Pinning**。

### 2. 绕过证书固定（SSL Pinning）

```bash
# Frida 一键 bypass
frida -U -f com.example.app -l bypass.js

# 常用模块：objection
objection --gadget com.example.app explore
   android sslpinning disable
```

### 3. Frida 动态 Hook

```javascript
// hook 函数返回值
Java.perform(function () {
    var Cipher = Java.use("javax.crypto.Cipher");
    Cipher.doFinal.overload('[B').implementation = function(data) {
        console.log("doFinal called: " + Java.use("java.util.Arrays").toString(data));
        return this.doFinal(data);
    };
});
```

## 四、常见漏洞与测试

| 漏洞 | 测试方法 |
|------|---------|
| 不安全存储 | 检查 SharedPreferences / 数据库是否明文 |
| 组件暴露 | 直接 adb am start 启动非导出 Activity |
| 明文流量 | 抓包找 http:// |
| 弱加密 | 检查是否硬编码 AES key |
| 越权接口 | 修改请求参数测试 |
| 深层链接漏洞 | 伪造 intent / URL scheme |

### 测试组件暴露示例

```bash
# 启动其他应用组件
adb shell am start -n com.example.app/.SecretActivity
```

## 五、Kali 移动安全工具

| 工具 | 用途 |
|------|------|
| apktool | 反编译/打包 |
| jadx | Java 反编译 |
| Frida | 动态插桩 |
| objection | 移动端测试框架 |
| mobsf | 自动化安全扫描（静态+动态） |
| Drozer | Android 攻击框架 |
| Ghidra | 原生 .so 分析 |

## 安全合规

> 移动应用测试必须获得应用所有者的授权。破解 App 的签名校验、绕过付费验证等行为违法。

## 小结

- 移动安全 = 静态分析（反编译）+ 动态分析（抓包/Hook）
- apktool + jadx + Frida + Burp 是核心四件套
- 证书固定绕过是动态测试的第一道坎
- 硬编码密钥与组件暴露是最常见漏洞
- 关注数据安全：明文传输、弱存储、日志泄露

> 下一篇：OSINT 开源情报进阶——GitHub 泄露与暗网情报。