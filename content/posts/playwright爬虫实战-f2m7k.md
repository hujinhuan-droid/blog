---
title: Playwright 爬虫实战：抓取 JavaScript 动态网页
slug: playwright爬虫实战-f2m7k
date: 2026-08-27
visibility: public
tags: Python, Playwright, 爬虫, 数据采集
---

# Playwright 爬虫实战：抓取 JavaScript 动态网页

你用 `requests` 抓一个现代网站，返回的却是一堆空壳 HTML——因为内容是用 JavaScript 在浏览器里渲染出来的。传统爬虫看不到浏览器看到的东西。**2026 年，Playwright 已经成为动态网页抓取的首选工具**，它直接驱动真实浏览器（Chromium/Firefox/WebKit），把 JS 跑完后再给你完整 DOM。

> 合规声明：爬虫请遵守目标站点的 `robots.txt` 与服务条款，控制访问频率，只抓公开数据，必要时先获得授权。技术是中性的，用法要合法。

## 安装

```bash
pip install playwright pandas
playwright install chromium
```

## 最小可用示例

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://example.com/products")
    page.wait_for_selector(".product-card")   # 等真实内容出现
    cards = page.locator(".product-card")
    for i in range(cards.count()):
        card = cards.nth(i)
        print(card.locator("h2").inner_text(), card.locator(".price").inner_text())
    browser.close()
```

注意 `wait_for_selector`——它等元素真正渲染出来，而不是盲目 `sleep(5)`。这是 90% 爬虫稳定性的关键。

## 等待策略（最重要的一课）

| 策略 | 用法 | 何时用 |
|------|------|--------|
| 等具体元素 | `wait_for_selector(".x")` | 最稳，首选 |
| 等初始 DOM | `goto(url, wait_until="domcontentloaded")` | 页面脚本未跑完前 |
| 等网络静默 | `wait_until="networkidle"` | 谨慎用，长连接页面会卡 |
| 等自定义条件 | `wait_for_function("document.querySelectorAll('.x').length > 20")` | 等"至少 N 条"再读 |

> 反模式：用 `time.sleep(5)` 猜时长。在你电脑上能跑，到 CI 或高负载下就崩。

## 处理分页与无限滚动

无限滚动本质是"滚到底 → 等新内容渲染 → 再读"的循环：

```python
def scroll_until_stable(page, selector, max_rounds=30):
    seen = 0
    for _ in range(max_rounds):
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1500)
        count = page.locator(selector).count()
        if count == seen:
            break
        seen = count
    return seen
```

"加载更多"按钮则用点击循环：点之前记数量，点之后等数量增长，消失就停。

## 导出为 CSV / JSON

```python
import csv, json
# 抓取后存成结构化记录
with open("products.json", "w", encoding="utf-8") as f:
    json.dump(products, f, ensure_ascii=False, indent=2)
```

## 反封锁的基本卫生

- 设置合理的 `user_agent` 和视口，模拟正常浏览器。
- 控制速率，别把对方服务器打挂。
- 优先找 JSON 接口（Network 面板里看 XHR/fetch），能直接调就别硬驱浏览器。
- 必要时加延迟、重试、`try/except`，别让一次异常中断整批。

## 工具选型速查

- **静态 HTML** → `requests` + `BeautifulSoup`
- **大型爬虫图** → `Scrapy`（JS 路由处配 Playwright）
- **客户端渲染的 SPA / 动态内容** → `Playwright`（本篇主角）

一句话：Playwright 不是"更牛的爬虫"，而是"当浏览器本身就是数据通路时"的唯一正确工具。等真实条件、用 locator 取数、按需处理分页，你的爬虫会比"快而脆"的方案活得更久。
