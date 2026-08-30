---
title: AI 智能体自动化办公：让 Agent 帮你处理 Excel 和邮件
slug: AI智能体自动化办公excel邮件-p5q8x
date: 2026-08-30
visibility: public
tags: AI智能体, 自动化办公, Excel, 邮件, 教程
---

# AI 智能体自动化办公：让 Agent 帮你处理 Excel 和邮件

每周一早上打开电脑：20 封未读邮件、3 个 Excel 要整理、2 份周报要交——这种重复劳动，恰恰是 AI Agent 最擅长接手的场景。这篇教你用 Python + AI 搭两个实用办公自动化工具。

## 案例 1：AI 邮件分类助手

**场景**：每天收到几十封邮件，手动分类太慢。让 AI 自动读取邮件内容，按类型分拣。

### 环境准备

```bash
pip install openai python-imap-tools pandas
```

### 完整代码

```python
import imaplib
from imap_tools import MailBox, AND
from openai import OpenAI
import json
from datetime import datetime

client = OpenAI()

def classify_email(subject: str, body: str) -> dict:
    """用 AI 给邮件分类"""
    prompt = f"""请对这封邮件分类，返回 JSON 格式：
邮件主题：{subject}
邮件内容（前500字）：{body[:500]}

分类规则：
- urgent: 需要立即处理的紧急事项
- meeting: 会议邀请或日程变更
- report: 需要提交的报告或数据
- invoice: 发票或财务相关
- spam: 广告或无关邮件
- normal: 普通日常邮件

只返回 JSON：{{"category": "...", "summary": "一句话摘要", "priority": "high/medium/low"}}"""

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    return json.loads(resp.choices[0].message.content)

def process_inbox(email_addr: str, password: str, imap_server: str):
    """读取收件箱并分类"""
    results = []
    with MailBox(imap_server).login(email_addr, password) as mailbox:
        for msg in mailbox.fetch(AND(seen=False), limit=20):
            info = classify_email(msg.subject, msg.text)
            results.append({
                "time": msg.date.strftime("%Y-%m-%d %H:%M"),
                "from": msg.from_,
                "subject": msg.subject,
                **info
            })
            print(f"[{info['category']}] {msg.subject}")

    # 导出为 Excel
    import pandas as pd
    df = pd.DataFrame(results)
    filename = f"邮件分类_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    df.to_excel(filename, index=False)
    print(f"\n分类完成，共 {len(results)} 封，已保存到 {filename}")

# 运行
process_inbox(
    email_addr="your_email@qq.com",
    password="your_auth_code",  # 邮箱授权码，不是登录密码
    imap_server="imap.qq.com"
)
```

### 运行效果

```
[urgent] 【请确认】明天项目评审会议时间变更
[report] 本周销售数据周报 - 请查收
[invoice] 8月发票已开具，请查收
[spam] 限时优惠！企业套餐低至3折
[meeting] 团队周会邀请 - 周二 10:00

分类完成，共 20 封，已保存到 邮件分类_20260830_0900.xlsx
```

## 案例 2：Excel 智能分析助手

**场景**：你有一份销售数据 Excel，想让 AI 自动分析并生成报告。

### 完整代码

```python
import pandas as pd
from openai import OpenAI

client = OpenAI()

def analyze_excel(file_path: str, question: str = "") -> str:
    """读取 Excel 并让 AI 分析"""
    df = pd.read_excel(file_path)

    # 自动生成数据摘要
    summary = {
        "行数": len(df),
        "列名": list(df.columns),
        "数据类型": df.dtypes.astype(str).to_dict(),
        "数值列统计": df.describe().to_dict(),
        "前5行示例": df.head().to_dict(orient="records"),
    }

    import json
    data_context = json.dumps(summary, ensure_ascii=False, default=str)

    if not question:
        question = "请全面分析这份数据，给出关键发现和建议"

    prompt = f"""你是数据分析师。以下是 Excel 数据的摘要：
{data_context}

问题：{question}

请给出：
1. 数据概览（行数、列数、数据类型）
2. 核心指标分析（均值、最大最小值、趋势）
3. 3-5 条关键发现
4. 2-3 条可执行建议
用 Markdown 格式输出。"""

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )
    return resp.choices[0].message.content

# 用法 1：自动分析
report = analyze_excel("销售数据.xlsx")
print(report)

# 用法 2：带问题分析
report = analyze_excel("销售数据.xlsx", "哪个区域销量最高？有没有异常值？")
print(report)
```

### 运行效果

```
# 销售数据分析报告

## 数据概览
- 总记录数：1,200 条
- 字段：日期、区域、产品、销量、金额
- 时间范围：2026-01 至 2026-08

## 核心指标
- 总销售额：¥4,580,000
- 月均销售额：¥572,500
- 最高单笔：¥85,000（华东区，7月）

## 关键发现
1. 华东区贡献了 42% 的销售额，远超其他区域
2. 6-7 月销量突增 35%，可能与促销活动相关
3. 产品 C 在西南区持续低迷，连续 3 个月低于均值

## 建议
1. 加大华东区资源投入，复制成功模式到华北
2. 排查西南区产品 C 问题，考虑调价或换品
3. 建立 6-7 月促销效果模型，优化下一次活动
```

## 进阶：把两个工具串成一个工作流

```python
def morning_routine():
    """每天早上一键完成：收邮件 → 分类 → 分析附件 Excel → 生成日报"""
    # 1. 收邮件并分类
    emails = process_inbox(...)

    # 2. 找出带附件的报表邮件
    report_emails = [e for e in emails if e["category"] == "report"]

    # 3. 下载附件并分析
    for email in report_emails:
        excel_path = download_attachment(email)
        analysis = analyze_excel(excel_path, "总结关键数据")

        # 4. 汇总到日报
        with open(f"日报_{today}.md", "a") as f:
            f.write(f"## {email['subject']}\n{analysis}\n\n")

    print("日报生成完成！")

# 设成 Windows 定时任务，每天 9:00 自动执行
```

## 成本估算

| 操作 | Token 消耗 | 费用（GPT-4o-mini） |
|------|-----------|-------------------|
| 分类 1 封邮件 | ~300 token | ~0.0003 元 |
| 分析 1 个 Excel | ~2000 token | ~0.002 元 |
| 每天处理 20 邮件 + 3 个 Excel | ~12000 token | ~0.012 元 |

> 办公自动化不是要消灭你的工作，而是消灭工作中"无聊的那一半"。把分类、整理、汇总交给 Agent，把判断、决策、沟通留给自己——这才是智能体在办公场景的正确用法。
