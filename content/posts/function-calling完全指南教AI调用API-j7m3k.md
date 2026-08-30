---
title: Function Calling 完全指南：教 AI 学会调用外部 API
slug: function-calling完全指南教AI调用API-j7m3k
date: 2026-08-30
visibility: public
tags: AI智能体, Function Calling, API, 教程
---

# Function Calling 完全指南：教 AI 学会调用外部 API

大模型本身只能"说话"，不能"做事"。Function Calling（函数调用）就是给它装上"手脚"——你说"帮我查下北京天气"，它自动调用天气 API，再把结果整理给你。

## Function Calling 是什么

普通对话：
```
你：今天北京天气怎么样？
AI：我无法获取实时天气信息。（只能"说"，不能"做"）
```

Function Calling：
```
你：今天北京天气怎么样？
AI：[调用 get_weather("北京")] → 拿到数据 → "北京今天 32°C，晴， suited for outdoor activities"
```

核心流程：

```
用户提问 → 模型判断需要调用函数 → 返回函数名+参数 → 你的代码执行函数 → 
把结果返回给模型 → 模型基于结果生成回答
```

## 实战 1：基础用法——查天气

```python
import json
from openai import OpenAI

client = OpenAI()

# 1. 定义函数 schema（告诉 AI 有什么工具可用）
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "查询指定城市的天气",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名，如：北京"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"], "description": "温度单位"}
            },
            "required": ["city"]
        }
    }
}]

# 2. 真正的函数实现
def get_weather(city: str, unit: str = "celsius") -> dict:
    """实际调用天气 API"""
    # 这里用模拟数据，实际对接天气 API
    weather_data = {
        "北京": {"temp": 32, "condition": "晴", "humidity": 45},
        "上海": {"temp": 35, "condition": "多云", "humidity": 70},
    }
    city_name = city.replace("市", "")
    if city_name in weather_data:
        data = weather_data[city_name]
        if unit == "fahrenheit":
            data["temp"] = data["temp"] * 9 / 5 + 32
        return data
    return {"error": f"暂不支持查询{city}的天气"}

# 3. 对话流程
messages = [{"role": "user", "content": "今天北京和上海哪个更热？"}]

# 第一轮：AI 决定调用函数
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=messages,
    tools=tools
)

message = resp.choices[0].message
messages.append(message)

# AI 可能要调用多次函数
while message.tool_calls:
    for tool_call in message.tool_calls:
        func_name = tool_call.function.name
        func_args = json.loads(tool_call.function.arguments)
        print(f"调用函数: {func_name}({func_args})")

        # 执行函数
        result = get_weather(**func_args)
        print(f"返回结果: {result}")

        # 把结果返回给 AI
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps(result, ensure_ascii=False)
        })

    # 下一轮：AI 看了结果后决定继续调用还是回答
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        tools=tools
    )
    message = resp.choices[0].message
    messages.append(message)

# 最终回答
print(f"\nAI 回答: {message.content}")
```

### 运行效果

```
调用函数: get_weather({'city': '北京', 'unit': 'celsius'})
返回结果: {'temp': 32, 'condition': '晴', 'humidity': 45}
调用函数: get_weather({'city': '上海', 'unit': 'celsius'})
返回结果: {'temp': 35, 'condition': '多云', 'humidity': 70}

AI 回答: 上海更热。上海当前气温 35°C（多云），北京 32°C（晴），上海比北京高 3°C。
```

## 实战 2：多函数协作——订单查询系统

```python
tools = [
    {
        "type": "function",
        "function": {
            "name": "query_order",
            "description": "根据订单号查询订单状态",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string", "description": "订单编号"}
                },
                "required": ["order_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_logistics",
            "description": "查询物流轨迹",
            "parameters": {
                "type": "object",
                "properties": {
                    "tracking_no": {"type": "string", "description": "物流单号"}
                },
                "required": ["tracking_no"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "apply_refund",
            "description": "申请退款",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string", "description": "订单编号"},
                    "reason": {"type": "string", "description": "退款原因"}
                },
                "required": ["order_id", "reason"]
            }
        }
    }
]

# 函数实现
def query_order(order_id):
    return {"order_id": order_id, "status": "已发货", "tracking_no": "SF1234567", "amount": 299.00}

def query_logistics(tracking_no):
    return {"tracking_no": tracking_no, "status": "运输中", "location": "北京转运中心", "eta": "明天送达"}

def apply_refund(order_id, reason):
    return {"order_id": order_id, "refund_status": "已提交", "refund_id": "R20260830001"}

FUNCTION_MAP = {
    "query_order": query_order,
    "query_logistics": query_logistics,
    "apply_refund": apply_refund,
}

# 对话循环
messages = [
    {"role": "system", "content": "你是客服助手，帮用户查询订单和物流，处理退款。"},
    {"role": "user", "content": "帮我查下订单 DD20260829001 到哪了，如果快到了我想退款"}
]

for _ in range(5):  # 最多循环5轮
    resp = client.chat.completions.create(
        model="gpt-4o-mini", messages=messages, tools=tools
    )
    msg = resp.choices[0].message
    messages.append(msg)
    
    if not msg.tool_calls:
        print(f"客服: {msg.content}")
        break
    
    for tc in msg.tool_calls:
        fn = tc.function.name
        args = json.loads(tc.function.arguments)
        print(f"[系统] 调用 {fn}({args})")
        result = FUNCTION_MAP[fn](**args)
        print(f"[系统] 返回: {result}")
        messages.append({
            "role": "tool", "tool_call_id": tc.id,
            "content": json.dumps(result, ensure_ascii=False)
        })
```

### 运行效果

```
[系统] 调用 query_order({'order_id': 'DD20260829001'})
[系统] 返回: {'order_id': 'DD20260829001', 'status': '已发货', 'tracking_no': 'SF1234567', ...}
[系统] 调用 query_logistics({'tracking_no': 'SF1234567'})
[系统] 返回: {'tracking_no': 'SF1234567', 'status': '运输中', 'location': '北京转运中心', 'eta': '明天送达'}
客服: 您的订单 DD20260829001 已发货，物流单号 SF1234567，目前在北京转运中心，预计明天送达。您提到想退款，请问退款原因是什么？
```

## 最佳实践

**1. description 写详细**

```python
# 差：AI 不知道什么时候该用
"description": "查询数据"

# 好：AI 知道什么场景调用、查什么数据
"description": "根据员工姓名或工号查询员工信息，包括部门、职位、入职日期。用于用户询问同事信息的场景。"
```

**2. 用 enum 限制参数范围**

```python
"status": {"type": "string", "enum": ["pending", "shipped", "delivered", "returned"]}
```

**3. 加参数校验防止注入**

```python
def get_weather(city, unit="celsius"):
    # 白名单校验
    if not isinstance(city, str) or len(city) > 20:
        return {"error": "无效的城市名"}
    if unit not in ["celsius", "fahrenheit"]:
        return {"error": "无效的温度单位"}
    # ... 实际逻辑
```

**4. 控制函数数量**

| 函数数量 | 效果 |
|----------|------|
| 1-5 个 | AI 准确选择 |
| 6-15 个 | 偶尔选错，需优化 description |
| 15+ 个 | 建议分组，按场景动态加载 |

> Function Calling 是 Agent 的核心能力。理解了"定义 → 调用 → 执行 → 回传"这四步，你就掌握了让 AI 从"会说"变成"会做"的关键。
