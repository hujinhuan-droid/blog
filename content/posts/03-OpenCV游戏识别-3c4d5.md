---
title: 视觉感知：用 OpenCV 识别怪物与金色掉落物
slug: py-opencv-游戏视觉识别-3c4d5
date: 2026-09-13
visibility: public
tags: Python, OpenCV, 图像识别, 游戏AI, 目标检测, 教程
---

# 视觉感知：用 OpenCV 识别怪物与金色掉落物

> AI 代理的"眼睛"靠什么？**OpenCV**。本文讲透游戏画面里的三类感知：颜色识别（找掉落）、轮廓识别（找怪物）、模板匹配（找固定 UI 元素），并给出可直接用的代码。

## 一、感知在代理中的位置

```
截屏 (mss) → 图像处理 (OpenCV) → 目标列表 (坐标/类型) → 决策
```

三个核心任务：

| 任务 | 方法 | 例子 |
|------|------|------|
| 找"金色掉落" | 颜色阈值 | 金币/装备 |
| 找"怪物" | 轮廓/颜色 + 模板 | 红色圆形怪 |
| 找"固定按钮" | 模板匹配 | 攻击/出售按钮 |

## 二、环境准备

```bash
pip install opencv-python numpy mss pillow
```

## 三、颜色识别：找金色掉落

```python
import cv2
import numpy as np
import mss

def find_gold(screenshot):
    """在画面中寻找金色物体，返回中心坐标列表"""
    hsv = cv2.cvtColor(screenshot, cv2.COLOR_BGR2HSV)

    # 金色的 HSV 范围（H 20~40）
    lower = np.array([15, 100, 100])
    upper = np.array([45, 255, 255])
    mask = cv2.inRange(hsv, lower, upper)

    # 找轮廓
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                   cv2.CHAIN_APPROX_SIMPLE)

    targets = []
    for c in contours:
        area = cv2.contourArea(c)
        if area > 20:  # 过滤噪点
            M = cv2.moments(c)
            if M["m00"]:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
                targets.append((cx, cy))
    return targets
```

## 三、轮廓识别（找怪物）

怪物通常颜色固定（如红色），用阈值 + 轮廓定位：

```python
def find_monsters(screenshot):
    hsv = cv2.cvtColor(screenshot, cv2.COLOR_BGR2HSV)
    # 红色范围（HSV 红色在两个区间）
    mask1 = cv2.inRange(hsv, (0, 120, 120), (10, 255, 255))
    mask2 = cv2.inRange(hsv, (170, 120, 120), (180, 255, 255))
    mask = mask1 | mask2

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                   cv2.CHAIN_APPROX_SIMPLE)
    monsters = []
    for c in contours:
        if cv2.contourArea(c) > 100:   # 过滤小噪点
            (x, y), r = cv2.minEnclosingCircle(c)
            monsters.append((int(x), int(y), int(r)))
    return monsters  # [(x, y, 半径), ...]
```

## 3. 模板匹配（找固定按钮/图标）

```python
def find_template(screenshot, template_path, threshold=0.8):
    template = cv2.imread(template_path)
    th, tw = template.shape[:2]

    result = cv2.matchTemplate(screenshot, template, cv2.TM_CCOEFF_NORMED)
    loc = np.where(result >= threshold)

    points = []
    for pt in zip(*loc[::-1]):
        points.append((pt[0] + tw // 2, pt[1] + th // 2))
    return points  # 模板中心坐标
```

> 用法：先截图保存"攻击按钮.png""出售按钮.png"，然后实时匹配。

## 四、组合成一个感知模块

```python
class Vision:
    def __init__(self, sct):
        self.sct = sct

    def grab(self):
        return np.array(self.sct.grab(self.sct.monitors[1]))

    def observe(self):
        frame = self.grab()
        return {
            "gold": find_gold(frame),
            "monsters": find_monsters(frame),
            "sell_btn": find_template(frame, "btn_sell.png"),
        }
```

## 五、调试技巧

```python
# 显示识别结果（画框标注）
for (cx, cy) in gold:
    cv2.circle(frame, (cx, cy), 10, (0, 255, 0), 2)
cv2.imshow("vision", frame)
cv2.waitKey(1)
```

> 强烈建议：先把识别框画出来肉眼看一遍，确认识别准确，再进决策循环。

## 六、性能与踩坑

| 问题 | 解法 |
|------|------|
| 截屏太慢 | mss 比 PIL 快很多，必要时降分辨率 |
| 颜色受光照影响 | 用 HSV 而非 RGB |
| 误识别 | 加面积/位置过滤 + 模板阈值调高 |
| 窗口缩放 | 统一用固定窗口大小（如 800x600） |

## 合规说明

> 图像识别不读写游戏内存，是最"温和"的感知方式。但仍只用于开源/单机/自建游戏。

## 小结

- 金色掉落 → HSV 颜色范围 + 轮廓
- 怪物 → 固定颜色阈值 + 最小外接圆
- 固定按钮 → 模板匹配
- 感知模块统一输出"目标坐标列表"
- 调试时把识别框画出来看，最直观

> 下一篇：屏幕读取——mss 高速截图与目标定位。