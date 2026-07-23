---
title: "Hugo 是什么"
date: 2026-07-22
draft: false
---

之前我们 fork 的 `hujinhuan-droid/hugo` 其实是 **Hugo 框架本身的源码**，并不是用 Hugo 搭的网站。

要做一个真正的站点，需要：

1. `hugo new site mysite` 生成骨架
2. 放一个主题（或自己写布局）
3. 在 `content/` 里写 Markdown
4. `hugo` 构建出 `public/`
5. 把 `public/` 部署出去

本站点就是这样来的。
