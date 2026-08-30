---
title: Multi-Agent 多智能体协作：用 CrewAI 搭建自动写作团队
slug: multi-agent多智能体协作crewai-q8t3f
date: 2026-08-30
visibility: public
tags: AI智能体, CrewAI, Multi-Agent, 教程
---

# Multi-Agent 多智能体协作：用 CrewAI 搭建自动写作团队

一个 Agent 干一件事，但很多任务需要团队协作——有人调研、有人写作、有人审稿。CrewAI 就是让你像组团队一样编排多个 Agent，各司其职，协同完成复杂任务。

## 单 Agent vs 多 Agent

| 场景 | 单 Agent | 多 Agent |
|------|----------|----------|
| 查天气 | 够用 | 没必要 |
| 写一篇深度文章 | 能写但容易跑偏 | 调研→写作→审稿，质量更高 |
| 做市场分析报告 | 容易遗漏维度 | 数据收集→分析→撰写→审核，更全面 |

核心区别：单 Agent 是"一个人干所有事"，多 Agent 是"专业分工，各干擅长的"。

## CrewAI 核心概念

```
Crew（团队）= Agents（成员）+ Tasks（任务）+ Process（协作流程）
```

- **Agent**：一个有角色、目标、工具的 AI 成员
- **Task**：分配给 Agent 的具体任务
- **Crew**：把 Agent 和 Task 编排在一起，按顺序执行

## 实战：搭建"内容创作团队"

我们要搭一个三人团队：调研员收集资料、 writer 写文章、编辑审稿修改。

### 环境准备

```bash
pip install crewai crewai-tools
```

### 完整代码

```python
from crewai import Agent, Task, Crew, Process
from crewai_tools import SerperDevTool

# 搜索工具（需要 Serper API Key，免费额度 2500 次）
search_tool = SerperDevTool()

# 1. 定义三个 Agent（团队成员）

researcher = Agent(
    role="行业调研员",
    goal="搜集指定主题的最新资料、数据和案例，整理成调研报告",
    backstory="""你是一位资深行业分析师，擅长快速收集和整理信息。
    你总能找到最新的数据和真实的案例来支撑观点。""",
    tools=[search_tool],
    verbose=True
)

writer = Agent(
    role="内容创作者",
    goal="基于调研报告，撰写一篇 2000 字的深度文章",
    backstory="""你是一位经验丰富的科技专栏作家，擅长把复杂的技术概念
    用通俗的语言讲清楚。你的文章结构清晰、案例丰富、有观点有态度。""",
    verbose=True
)

editor = Agent(
    role="内容编辑",
    goal="审校文章，修正错误，优化结构，确保质量",
    backstory="""你是一位严谨的内容编辑，对错别字、逻辑漏洞、数据错误
    零容忍。你不只挑毛病，还会给出具体修改建议。""",
    verbose=True
)

# 2. 定义三个 Task（任务）

research_task = Task(
    description="""
    对以下主题进行调研：{topic}
    
    要求：
    1. 搜索该主题的最新行业动态和关键数据
    2. 找到 3-5 个真实案例
    3. 整理成调研报告，包含：
       - 行业现状概述
       - 关键数据（带来源）
       - 案例分析
       - 趋势判断
    """,
    agent=researcher,
    expected_output="一份详细的调研报告（Markdown 格式）"
)

writing_task = Task(
    description="""
    基于调研员的报告，撰写一篇深度文章。
    
    要求：
    1. 字数 1500-2500 字
    2. 标题吸引人但不标题党
    3. 开头用具体场景或数据切入
    4. 正文分 3-4 个小节，每节有小标题
    5. 引用调研报告中的数据和案例
    6. 结尾给出明确观点和建议
    """,
    agent=writer,
    expected_output="一篇完整的深度文章（Markdown 格式）",
    context=[research_task]  # 依赖调研任务的输出
)

editing_task = Task(
    description="""
    审校文章，检查并修正：
    1. 错别字和语法错误
    2. 数据引用是否准确
    3. 逻辑是否连贯
    4. 结构是否合理
    5. 给出修改说明
    最终输出修改后的完整文章。
    """,
    agent=editor,
    expected_output="审校后的最终版文章（Markdown 格式）",
    context=[writing_task]  # 依赖写作任务的输出
)

# 3. 组建团队并执行

crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, writing_task, editing_task],
    process=Process.sequential,  # 按顺序执行：调研 → 写作 → 审稿
    verbose=True
)

# 4. 启动任务
result = crew.kickoff(inputs={"topic": "2026年 AI Agent 在企业中的应用现状"})

print("=" * 60)
print("最终文章：")
print("=" * 60)
print(result)
```

### 运行过程

```
[调研员] 正在搜索 "2026年 AI Agent 企业应用"...
[调研员] 找到 15 篇相关资料，整理调研报告中...
[调研员] 调研报告完成

[创作者] 阅读调研报告，构思文章结构...
[创作者] 撰写文章中...
[创作者] 文章初稿完成（1850字）

[编辑] 审校文章中...
[编辑] 发现 2 处数据引用需修正，1 处逻辑存在跳跃
[编辑] 修改完成，输出最终版（1920字）

============================================================
最终文章：
# AI Agent 在企业中：从"试点"到"标配"的 2026
...（完整文章内容）
============================================================
```

## 进阶用法

### 1. 并行任务：让调研员和数据分析师同时工作

```python
from crewai import Task

# 两个调研任务可以并行
market_research = Task(
    description="调研市场趋势",
    agent=researcher,
    expected_output="市场趋势报告"
)

competitor_research = Task(
    description="调研竞品动态",
    agent=researcher,
    expected_output="竞品分析报告"
)

# 写作任务依赖两个调研结果
writing_task = Task(
    description="整合两份报告写文章",
    agent=writer,
    context=[market_research, competitor_research],
    expected_output="完整文章"
)
```

### 2. 自定义工具：让 Agent 能查数据库

```python
from crewai.tools import tool
import sqlite3

@tool("查询销售数据")
def query_sales(region: str, month: str) -> str:
    """查询指定区域和月份的销售数据"""
    conn = sqlite3.connect("sales.db")
    cursor = conn.execute(
        "SELECT product, amount FROM sales WHERE region=? AND month=?",
        (region, month)
    )
    results = cursor.fetchall()
    conn.close()
    return str(results)

analyst = Agent(
    role="销售分析师",
    goal="分析销售数据，发现趋势和异常",
    backstory="你是数据分析专家，擅长从数据中发现商业洞察。",
    tools=[query_sales],
)
```

### 3. 人机协作：关键步骤暂停等人确认

```python
from crewai import Task

review_task = Task(
    description="审核文章是否满足发布标准",
    agent=editor,
    expected_output="审核结果",
    human_input=True  # 开启人工确认：Agent 完成后会暂停等待人工反馈
)
```

## 成本估算

| 任务 | Agent 交互次数 | Token 消耗 | 费用 |
|------|---------------|-----------|------|
| 调研 | 3-5 轮搜索+总结 | ~8000 | ~0.08 元 |
| 写作 | 2-3 轮修改 | ~6000 | ~0.06 元 |
| 审稿 | 1-2 轮 | ~4000 | ~0.04 元 |
| **单次完整流程** | | ~18000 | ~0.18 元 |

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Agent 反复搜索不收敛 | goal 太模糊 | 给 Task 加明确的 expected_output |
| 输出太短/太长 | 没限制字数 | 在 description 里写明字数范围 |
| Agent 之间"打架" | 角色定义重叠 | 确保每个 Agent 职责边界清晰 |
| 执行很慢 | 串行流程太长 | 把独立任务改为并行 |

> 多 Agent 不是"Agent 越多越好"，而是"分工越清晰越好"。三个角色分明的 Agent，效果往往好过十个角色模糊的 Agent。像带团队一样带 Agent——先想清谁干什么，再开始干。
