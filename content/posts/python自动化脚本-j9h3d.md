---
title: Python 自动化脚本：把重复劳动交给代码
slug: python自动化脚本-j9h3d
date: 2026-08-27
visibility: public
tags: Python, 自动化, 脚本, 效率
---

# Python 自动化脚本：把重复劳动交给代码

很多人以为"写自动化脚本不算真开发"，结果白白花时间手工做重复活。事实是：能省时间的脚本，ROI 最容易量化，很多企业专门招做工作流自动化的工程师。

下面这几个场景，几乎人人都遇到过，用 Python 几十行就能解决。

## 场景一：批量重命名文件

下载了一堆 `photo (1).jpg`、`photo (2).jpg`？一键规整：

```python
import os

folder = "./photos"
for i, fname in enumerate(os.listdir(folder), 1):
    ext = os.path.splitext(fname)[1]
    new_name = f"img_{i:03d}{ext}"
    os.rename(os.path.join(folder, fname), os.path.join(folder, new_name))
```

## 场景二：自动整理桌面（按扩展名归档）

桌面乱成"垃圾场"？按类型归到不同文件夹：

```python
import os, shutil

desktop = os.path.expanduser("~/Desktop")
targets = {".pdf": "PDF", ".jpg": "图片", ".docx": "文档", ".mp4": "视频"}

for f in os.listdir(desktop):
    ext = os.path.splitext(f)[1].lower()
    if ext in targets:
        dst = os.path.join(desktop, targets[ext])
        os.makedirs(dst, exist_ok=True)
        shutil.move(os.path.join(desktop, f), os.path.join(dst, f))
```

## 场景三：处理 Excel / 报表

财务、运营每天都要做的汇总，Pandas 一行顶一百次手工：

```python
import pandas as pd

df = pd.read_excel("8月销售.xlsx")
summary = df.groupby("城市")["销售额"].sum().sort_values(ascending=False)
summary.to_excel("城市销售汇总.xlsx")
```

## 场景四：定时发邮件 / 报告

结合 `smtplib` 和计划任务，每天自动把报表发到邮箱：

```python
import smtplib
from email.mime.text import MIMEText

msg = MIMEText("今日数据已更新，详见附件。")
msg["Subject"], msg["From"], msg["To"] = "日报", "me@x.com", "boss@x.com"
with smtplib.SMTP("smtp.x.com") as s:
    s.login("me@x.com", "密码")
    s.send_message(msg)
```

> 配合系统的定时任务（Windows 任务计划 / Linux crontab），脚本就能"自己跑"，你只管看结果。

## 场景五：抓取内部数据

内部系统没有导出按钮？用 `requests` + 简单解析把数据抓出来（注意：只抓你有权限的内部数据，遵守公司规定）：

```python
import requests
r = requests.get("https://内网/api/orders", timeout=10)
r.raise_for_status()
orders = r.json()
```

## 自动化的正确心态

- **先问"这活儿我一个月做几次"**：每周都做的，值得写脚本；只做一次的手工也行。
- **脚本也要能读**：变量名清楚、关键步骤加注释，三个月后的你才看得懂。
- **小步快跑**：先写一个能跑的版本，再慢慢加错误处理、日志记录。
- **别忽视边界情况**：文件不存在、网络超时、编码错误——加 `try/except` 比事后救火强。

## 进阶：用 AI 给脚本加"脑子"

2026 年最划算的组合，是给自动化脚本接上大模型 API——比如自动把抓来的数据总结成一段人话、自动分类邮件、自动生成日报摘要。具体怎么接，看我另一篇《Python 调用 AI API》。

把重复劳动交给代码，把脑子留给真正要决策的事。这，才是 Python 自动化的精髓。
