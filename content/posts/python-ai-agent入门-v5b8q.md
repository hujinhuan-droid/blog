---
title: 用 Python 构建你的第一个 AI Agent：从"会聊天"到"会办事"
slug: python-ai-agent入门-v5b8q
date: 2026-08-27
visibility: public
tags: Python, AI Agent, LangChain, 智能体
---

# 用 Python 构建你的第一个 AI Agent：从"会聊天"到"会办事"

2026 年软件开发最热的关键词，毫无疑问是 **AI Agent（智能体）**。和只会回答问题的聊天机器人不同，Agent 能推理、能规划、能调用工具去"做事"——搜网页、跑代码、调 API、连起来多步执行。

好消息是：一个能用的 Agent，**不到 100 行 Python 就能搭出来**。

## 什么是 Agent？

一个 Agent 程序通常做四件事：

1. 接收目标（不是简单问句，而是一个"要完成的事"）
2. 用大模型推理"怎么做"
3. 调用工具/API/函数去行动
4. 观察结果、调整，循环直到目标达成

> 本质区别：聊天机器人只"说"，Agent 会"做"。把 LLM 变成 Agent 的，是一个循环：**决策 → 行动 → 观察 → 再决策**。所有框架（LangChain、CrewAI、LangGraph）都是这个循环的精致版。

## 最简版：先让它"会说话"

```python
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI()

def simple_agent(user_message):
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "你是一个有用的助手。"},
            {"role": "user", "content": user_message},
        ],
    )
    return resp.choices[0].message.content

print(simple_agent("你好，你能做什么？"))
```

这还只是聊天机器人——能说，但记不住、也做不了事。

## 加上记忆（多轮上下文）

```python
class Agent:
    def __init__(self):
        self.messages = [{"role": "system", "content": "你是一个有用的助手。"}]

    def chat(self, user_message):
        self.messages.append({"role": "user", "content": user_message})
        resp = client.chat.completions.create(model="gpt-4o-mini", messages=self.messages)
        reply = resp.choices[0].message.content
        self.messages.append({"role": "assistant", "content": reply})
        return reply

a = Agent()
print(a.chat("我叫小明。"))
print(a.chat("我刚说我叫什么？"))  # 它记住了
```

## 给它一个工具（这才是 Agent 的关键）

大模型算数不靠谱（它预测文本，不是真计算）。给个计算器工具就稳了：

```python
def calculator(expression):
    """安全求值数学表达式。"""
    try:
        return str(eval(expression, {"__builtins__": {}}))
    except Exception as e:
        return f"错误: {e}"
```

工具，就是 Agent 能调用、去跟真实世界打交道的函数——搜网页、读文件、查数据库、发邮件，都是工具。

## 用 LangChain 快速搭一个研究助手

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.prompts import ChatPromptTemplate

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
tools = [DuckDuckGoSearchRun()]
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个研究助手，用搜索工具找准确、最新的信息。"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])
agent = create_tool_calling_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
print(executor.invoke({"input": "2026 年最火的 Python AI 框架有哪些？"})["output"])
```

`verbose=True` 会打印 Agent 每一步在想什么——非常适合学习。

## 2026 三大主流框架怎么选

- **LangGraph**：把 Agent 逻辑画成"节点 + 边"的流程图，支持循环、分支、人工介入，工程化首选。
- **CrewAI**：按角色组队（研究员 / 写手 / 分析师），多智能体协作，GitHub 星标超 5 万。
- **OpenAI Agents SDK**：轻量、原生支持"智能体交接"（ triage 路由到专家），适合做生产。

## 新手避坑

- 工具描述要写清楚（别说 `search`，要说"搜索网页最新信息，输入应为具体查询"）。
- 工具先给 3~5 个，太多反而让 Agent 迷糊。
- 设 `max_iterations` 防死循环。
- 用 try/except 包住执行，别让一次报错崩掉整个 Agent。

## 成本提醒

用 `gpt-4o-mini` 或 `claude-haiku` 这种小模型，完整测试 50~100 次通常不到 2 美元。学习阶段，两块钱预算足矣；也可以用 Ollama 跑本地模型，免费。

Agent 不是高不可攀的黑科技。今天下午，你就能用不到 100 行 Python 做出一个会自己搜资料、会算账、会记事的"小员工"。
