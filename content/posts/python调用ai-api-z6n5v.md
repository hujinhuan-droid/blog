---
title: Python 调用 AI API：提示词、流式输出与成本控制
slug: python调用ai-api-z6n5v
date: 2026-08-27
visibility: public
tags: Python, AI API, 提示词工程, LLM
---

# Python 调用 AI API：提示词、流式输出与成本控制

2026 年招聘里最被低估、却最值钱的一项 Python 技能，是**把 AI 接进产品和流程**。很多人误以为"得懂深度学习才能用 AI"，其实企业真正要的是：会发提示词、会收响应、会管成本、会评输出。

下面用 OpenAI 兼容接口演示（Anthropic、Gemini 思路一致），覆盖最常用的几个模式。

## 最小可运行：一次对话

```python
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI()

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "你是一个简洁的中文助手。"},
        {"role": "user", "content": "用一句话解释什么是向量数据库。"},
    ],
)
print(resp.choices[0].message.content)
```

> 永远把 key 放 `.env`，用 `load_dotenv()` 读，别硬编码进脚本——这是基本安全素养。

## 结构化输出：让 AI 返回 JSON

很多场景下你要的不是"一段话"，而是能直接进数据库的结构化字段：

```python
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    response_format={"type": "json_object"},
    messages=[
        {"role": "system", "content": "只返回 JSON，字段：title, tags[], summary"},
        {"role": "user", "content": "为这篇 Python 教程生成元数据。"},
    ],
)
import json
data = json.loads(resp.choices[0].message.content)
```

## 流式输出：像打字机一样逐步显示

用户体验关键——别让用户等半天看到一个"大块头"：

```python
stream = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "写一首关于代码的短诗。"}],
    stream=True,
)
for chunk in stream:
    delta = chunk.choices[0].delta.content or ""
    print(delta, end="", flush=True)
```

## 多轮记忆：维护 messages 列表

Agent 的"记忆"本质上就是把历史 messages 不断 append 再原样传回去：

```python
messages = [{"role": "system", "content": "你是客服助手。"}]
def chat(user_text):
    messages.append({"role": "user", "content": user_text})
    resp = client.chat.completions.create(model="gpt-4o-mini", messages=messages)
    reply = resp.choices[0].message.content
    messages.append({"role": "assistant", "content": reply})
    return reply
```

## 调用工具（function calling）

让模型决定"要不要调你的函数"，是做 Agent 的核心：

```python
tools = [{
    "type": "function",
    "function": {
        "name": "calculate",
        "description": "计算数学表达式",
        "parameters": {"type": "object",
                       "properties": {"expr": {"type": "string"}},
                       "required": ["expr"]},
    },
}]
resp = client.chat.completions.create(model="gpt-4o-mini", messages=messages, tools=tools)
# 若 resp.choices[0].message.tool_calls 非空，就执行对应函数并把结果回传
```

## 成本控制（别等到账单吓一跳）

1. **选对模型**：日常任务用小模型（`gpt-4o-mini` / `claude-haiku`），成本可低一个量级。
2. **设上限**：`max_tokens` 限制单次输出长度。
3. **缓存系统提示**：重复的系统提示可走 prompt caching，降单价。
4. **批处理**：大批量离线任务用 Batch API，通常有折扣。
5. **监控**：记录每次 token 用量，异常早预警。

```python
usage = resp.usage
print(usage.prompt_tokens, usage.completion_tokens, usage.total_tokens)
```

## 评估输出（别只信"它说完了"）

- 对结构化结果做 schema 校验（Pydantic）。
- 关键场景加人工复核或规则兜底。
- 记录失败样例，持续迭代提示词。

## 小结

会调 AI API 不神秘：发消息、收回复、用流式提升体验、用工具扩展能力、用计量控成本。把这套跑顺，你就握住了 2026 年最实用的 Python 技能之一——这也正是做 AI Agent、AI 网页工具、自动化工作流的共同底座。
