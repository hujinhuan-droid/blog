---
title: 环境搭建：用 Pygame 自建"打怪拾荒"沙盒游戏
slug: py-pygame打怪拾荒沙盒-2b3c4
date: 2026-09-13
visibility: public
tags: Python, Pygame, 沙盒游戏, 游戏开发, 自动化, 教程
---

# 环境搭建：用 Pygame 自建"打怪拾荒"沙盒游戏

> 要让 AI 学会打怪拾荒，最好先有个"合法靶场"——用 Pygame 自己造一个！本文带你写一个极简的 2D 沙盒游戏：有怪物、有掉落、有背包、有商店。这既是游戏开发练习，也是后续 AI 代理的完美训练场。

## 一、为什么自建沙盒

- **完全合法**：自己的游戏随便自动化
- **可控环境**：怪物位置、掉落概率都能调
- **可观测**：直接读游戏内部状态（比图像识别简单）
- **可扩展**：从简单到复杂，一步步加功能

## 二、安装 Pygame

```bash
pip install pygame
```

## 三、游戏设计

```
窗口：800x600
玩家：WASD 移动，空格攻击
怪物：随机刷新，碰到玩家会扣血
掉落：怪物死亡 → 掉落金币/装备
背包：F 键拾取，最多 10 格
存档：数据存 JSON 文件
```

## 四、核心代码

### 1. 初始化

```python
import pygame, random, json

pygame.init()
W, H = 800, 600
screen = pygame.display.set_mode((W, H))
clock = pygame.time.Clock()

# 颜色
WHITE = (255, 255, 255)
RED = (200, 50, 50)
BLUE = (50, 100, 200)
GOLD = (210, 180, 40)
```

### 2. 玩家与怪物

```python
class Player:
    def __init__(self):
        self.x, self.y = W // 2, H // 2
        self.speed = 4
        self.hp = 100
        self.inventory = []

    def move(self, keys):
        if keys[pygame.K_w]: self.y -= self.speed
        if keys[pygame.K_s]: self.y += self.speed
        if keys[pygame.K_a]: self.x -= self.speed
        if keys[pygame.K_d]: self.x += self.speed
        self.x = max(0, min(W, self.x))
        self.y = max(0, min(H, self.y))

class Monster:
    def __init__(self):
        self.x = random.randint(50, W - 50)
        self.y = random.randint(50, H - 50)
        self.hp = 30
        self.alive = True
```

### 3. 掉落物

```python
class Drop:
    def __init__(self, x, y):
        self.x, self.y = x, y
        self.item = random.choice(["gold_coin", "sword", "shield", "potion"])

    def draw(self):
        pygame.draw.circle(screen, GOLD, (self.x, self.y), 8)
```

### 4. 主循环

```python
player = Player()
monsters = [Monster() for _ in range(5)]
drops = []
running = True

while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_SPACE:   # 攻击
                for m in monsters:
                    if abs(m.x - player.x) < 30 and abs(m.y - player.y) < 30:
                        m.hp -= 15
                        if m.hp <= 0:
                            drops.append(Drop(m.x, m.y))
                            monsters.remove(m)
                            monsters.append(Monster())  # 刷新
            if event.key == pygame.K_f:        # 拾取
                for d in drops[:]:
                    if abs(d.x - player.x) < 25 and abs(d.y - player.y) < 25:
                        player.inventory.append(d.item)
                        drops.remove(d)

    keys = pygame.key.get_pressed()
    player.move(keys)

    screen.fill(WHITE)
    for m in monsters:
        pygame.draw.circle(screen, RED, (m.x, m.y), 15)
    for d in drops:
        d.draw()
    pygame.draw.circle(screen, BLUE, (player.x, player.y), 18)

    # 显示背包
    font = pygame.font.SysFont("simhei", 18)
    text = font.render(f"背包: {player.inventory}", True, (0, 0, 0))
    screen.blit(text, (10, 10))

    pygame.display.flip()
    clock.tick(60)
```

### 5. 存档功能

```python
def save_game(player):
    with open("save.json", "w", encoding="utf-8") as f:
        json.dump({"x": player.x, "y": player.y,
                   "hp": player.hp, "inv": player.inventory}, f)

def load_game():
    try:
        with open("save.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None
```

## 五、如何给 AI 用

给 AI 提供两种接口：

```
1. 图像接口：pygame 画面 → 截图 → 给 AI 看（模拟真实游戏）
2. 状态接口：直接暴露玩家坐标/怪物位置/背包（调试用）

推荐：两个都做，先拿内部状态调通逻辑，再用图像接口实战。
```

## 六、合规说明

> 这是你自己的游戏，怎么做自动化都合法。本系列所有 AI 操作都在这类沙盒或开源单机游戏中进行。

## 小结

- Pygame 200 行内就能搭出打怪拾荒沙盒
- 攻击（空格）、拾取（F）、刷新、掉落、背包、存档全都有
- 给 AI 提供"内部状态 + 截图"双接口
- 自建沙盒是学习游戏 AI 最合法高效的靶场

> 下一篇：视觉感知——用 OpenCV 识别怪物与金色掉落。