---
title: LangChain 入门：用 50 行代码造一个会查资料的 AI 助手
slug: langchain入门50行代码造助手-w8n2r
date: 2026-08-30
visibility: public
tags: AI智能体, LangChain, Python, 教程
---

# LangChain 入门：用 50 行代码造一个会查料的 AI 助手

如果说 Coze 是"零代码搭积木"，那 LangChain 就是"用代码搭积木"——灵活性更高，能干的事更多。这篇带你从零开始，50 行 Python 代码造一个能联网搜索、自动总结的 AI 助手。

## LangChain 是什么

LangChain 是目前最流行的 AI 应用开发框架，核心思路是**链式组装**：

```
用户提问 → 搜索引擎查资料 → 大模型总结 → 返回答案
```

每一步都是一个独立模块，像链条一样串起来。你不需要手写搜索调用、上下文管理、结果格式化这些胶水代码——框架全包了。

## 环境准备

```bash
# Python 3.10+
pip install langchain langchain-openai langchain-community duckduckgo-search
```

需要一个 OpenAI API Key（也可以用其他模型替代）。设置环境变量：

```bash
export OPENAI_API_KEY="sk-your-key-here"
```

## 完整代码：会查资料的 AI 助手

```python
from langchain_openai import ChatOpenAI
from langchain_community.tools import DuckDuckGoSearchRun
from langchain.agents import create_react_agent, AgentExecutor
from langchain import hub

# 1. 初始化大模型（大脑）
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# 2. 初始化搜索工具（手脚）
search = DuckDuckGoSearchRun()
tools = [search]

# 3. 获取 ReAct 提示词模板（思维框架）
prompt = hub.pull("hwchase17/react")

# 4. 创建 Agent
agent = create_react_agent(llm, tools, prompt)

# 5. 创建执行器
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 6. 提问
question = "2026 年新能源汽车销量排行榜前十是谁？"
result = agent_executor.invoke({"input": question})
print(result["output"])
```

运行后你会看到 Agent 的完整思考过程：

```
> Entering new AgentExecutor chain...
Thought: 我需要搜索 2026 年新能源汽车销量数据
Action: duckduckgo_search
Action Input: 2026 新能源汽车销量排行榜
Observation: [搜索结果摘要...]
Thought: 我拿到了数据，现在来整理答案
Final Answer: 2026 年新能源汽车销量前十品牌为...
```

## 它是怎么工作的：ReAct 模式

Agent 用的叫 **ReAct（Reasoning + Acting）** 模式，循环执行：

```
Thought（思考）：我该干什么？
Action（行动）：调用工具
Observation（观察）：看工具返回了什么
Thought（再思考）：信息够了吗？不够就继续
Final Answer（最终回答）：够了，输出答案
```

这和人解决问题的思路一样：先想，再做，看结果，再调整。

## 进阶：加一个"读网页"工具

搜索只能拿到摘要，想读完整内容，加个网页读取工具：

```python
from langchain_community.tools import tool
import requests
from bs4 import BeautifulSoup

@tool
def read_webpage(url: str) -> str:
    """读取网页内容并返回纯文本"""
    resp = requests.get(url, timeout=10)
    soup = BeautifulSoup(resp.content, "html.parser")
    # 去掉脚本和样式
    for tag in soup(["script", "style"]): tag.decompose()
    return soup.get_text()[:3000]  # 截断避免太长

tools = [search, read_webpage]
agent = create_react_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 现在它可以搜索 → 选一篇 → 读全文 → 总结
result = agent_executor.invoke({"input": "解释一下什么是 RAG 技术"})
```

## 实用技巧

**1. 控制成本：用 cheaper 模型做简单任务**

```python
# 搜索用便宜模型，总结用强模型
search_llm = ChatOpenAI(model="gpt-4o-mini")
summarize_llm = ChatOpenAI(model="gpt-4o")
```

**2. 加记忆：让 Agent 记住上下文**

```python
from langchain.memory import ConversationBufferMemory
memory = ConversationBufferMemory(memory_key="chat_history")
agent_executor = AgentExecutor(
    agent=agent, tools=tools, memory=memory, verbose=True
)
```

**3. 限制迭代次数：防止无限循环**

```python
agent_executor = AgentExecutor(
    agent=agent, tools=tools, max_iterations=5
)
```

## 常见坑

| 坑 | 原因 | 解决 |
|----|------|------|
| Agent 不调用工具 | 提示词不明确 | 在 Prompt 里写清"请使用搜索工具" |
| 卡死不输出 | 迭代次数太多 | 设 `max_iterations=5` |
| 输出格式混乱 | 模型没按格式返回 | 用 `output_parser` 规范输出 |
| 搜索结果全是英文 | DuckDuckGo 默认英文 | 改用百度搜索工具 |

> LangChain 的核心不是代码量，而是"链式思维"——把复杂任务拆成可组合的步骤。50 行能跑通一个 Agent，但真正理解每条链的工作原理，才是从"调包侠"到"架构师"的分水岭。
