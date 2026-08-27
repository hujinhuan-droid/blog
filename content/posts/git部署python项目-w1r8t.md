---
title: Git + 部署：让你的 Python 项目"上得了线"
slug: git部署python项目-w1r8t
date: 2026-08-27
visibility: public
tags: Python, Git, 部署, Docker, 运维
---

# Git + 部署：让你的 Python 项目"上得了线"

很多初学者卡在最后一步：**项目在本机能跑，一到别人机器或服务器就废**。2026 年的现实是——"只能在本机运行的项目等于没做完"。学会 Git 协作和部署，你立刻和一大波新手拉开差距。

## 第一部分：Git，团队协作的入场券

雇主不会因为你"代码写得好"就原谅你不会 Git。起码要会这几样：

```bash
git init                 # 初始化仓库
git add .               # 暂存改动
git commit -m "完成登录功能"   # 提交
git branch feature-x    # 开分支
git checkout feature-x
git merge feature-x     # 合并
git push origin main    # 推到远程
```

**处理冲突**是必经之路：当两人改了同一处，Git 会标出冲突区，你手动选留哪段，再 `add` + `commit` 即可。别怕，冲突不是错误，是协作的正常信号。

> 早期就练协作习惯，能形成明显优势。很多人的第一份工作，Git 比 Python 本身还难——这很正常，练就完了。

## 第二部分：为什么项目"跑不起来"

常见原因就几个：

1. **依赖没固定**：`pip freeze > requirements.txt` 没做，别人装不到同版本。
2. **环境变量硬编码**：数据库密码写死在代码里，换环境就崩。
3. **只在 Windows 测过**：路径分隔符、换行符在 Linux 上出问题。
4. **没容器化**："在我电脑上是好的"——经典名言。

## 第三部分：用 requirements.txt 锁定依赖

```bash
pip freeze > requirements.txt
```

部署时：

```bash
pip install -r requirements.txt
```

## 第四部分：用 .env 管理配置

```python
import os
from dotenv import load_dotenv
load_dotenv()
DB_URL = os.getenv("DATABASE_URL")   # 不写死在代码里
```

`.env` 自己留着，加进 `.gitignore`，绝不上传仓库。

## 第五部分：Docker，让"环境一致"成为现实

一个最小 `Dockerfile`：

```dockerfile
FROM python:3.14-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

构建并运行：

```bash
docker build -t myapp .
docker run -p 8000:8000 myapp
```

现在哪怕换到任何装了 Docker 的机器，跑起来都一模一样——"在我电脑上是好的"从此成为历史。

## 第六部分：部署到云（别只跑笔记本）

你不需要成为云工程师，只要证明"项目能在别处运行"：

- **PaaS 平台**（如 Cloudflare Workers / 各类云函数）：连仓库即部署，适合 Web 服务。
- **容器托管**：把上面的镜像推上去，自动扩缩容。
- **传统 VPS**：SSH 上去 `git pull` + `docker compose up`。

关键是：你的项目得能读环境变量、能处理外部请求、崩了有日志——这些都是"生产就绪"的基本功。

## 一条最小可行路径

1. 写完功能 → `git commit` + `git push`
2. `pip freeze > requirements.txt`
3. 加 `.env` + `.gitignore`
4. 写 `Dockerfile`
5. 本地 `docker build/run` 验证
6. 推到云平台

## 给新手的真心话

部署不是"高级阶段才学"的东西，而是**越早碰越省事**。第一次配环境花两小时，第二次十分钟，第三次闭眼搞定。等你在面试里说"我把项目部署上线了，这是链接"，分量远胜过"我做过一个计算器"。

下一站，把这一套和前面的 FastAPI / Pandas / AI API 串起来——一个会自己抓数据、会分析、会用 AI 总结、还能在线访问的小系统，就是一份有说服力的作品集。
