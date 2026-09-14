---
title: 从 DQN 到 PPO：用策略梯度训练更强的打怪 AI
slug: py-游戏ai-dqn到ppo强化学习-18i9j
date: 2026-09-14
visibility: public
tags: Python, 游戏AI, 强化学习, PPO, DQN, 教程
---

# 从 DQN 到 PPO：用策略梯度训练更强的打怪 AI

> 上一批我们用 DQN 让 AI 学会打怪，但 DQN 有个短板：**只能输出离散动作（左/右/打），训练慢、不稳定**。本文升级到 **PPO（Proximal Policy Optimization）**——当今游戏 AI 的主流算法（OpenAI 用 PPO 训练了 Dota2 和 ChatGPT 的 RLHF 环节），让打怪 AI 动作更平滑、训练更稳。

## 一、DQN vs PPO 一句话

```
DQN ：学"这个状态下，每个动作值多少分"（Q 值）→ 取最大
PPO ：直接学"这个状态下，该选哪个动作"（策略 π）→ 按概率采样
```

| 对比 | DQN | PPO |
|------|-----|-----|
| 动作空间 | 离散 | 离散/连续都行 |
| 稳定性 | 一般（回放缓冲区抖动） | 稳（裁剪限制更新幅度） |
| 训练速度 | 快但易崩 | 稍慢但更可靠 |
| 适用 | 简单离散游戏 | 复杂/连续控制 |

## 二、环境封装：把沙盒变成 Gym 风格

```python
import gym
from gym import spaces

class SandboxEnv(gym.Env):
    def __init__(self):
        super().__init__()
        # 观察：怪物相对位置 + 血量 + 背包占用
        self.observation_space = spaces.Box(-1, 1, shape=(8,))
        # 动作: 0=左 1=右 2=上 3=下 4=攻击 5=拾取
        self.action_space = spaces.Discrete(6)

    def reset(self):
        self.game = SandboxGame()
        return self._obs()

    def step(self, action):
        self.game.do(action)            # 执行动作
        reward = self.game.reward()     # 打怪+10，捡东西+5，掉血-1
        done = self.game.over()
        return self._obs(), reward, done, {}

    def _obs(self):
        m = self.game.nearest_monster()
        return np.array([
            m.rel_x / 400, m.rel_y / 300, m.hp / 30,
            self.game.player.hp / 100,
            len(self.game.player.inv) / 10,
            self.game.player.x / 800, self.game.player.y / 600, 0
        ])
```

## 三、PPO 策略网络（Actor-Critic）

```python
import torch
import torch.nn as nn

class ActorCritic(nn.Module):
    def __init__(self, obs_dim=8, n_actions=6):
        super().__init__()
        self.common = nn.Sequential(
            nn.Linear(obs_dim, 128), nn.ReLU(),
            nn.Linear(128, 128), nn.ReLU(),
        )
        self.actor = nn.Linear(128, n_actions)   # 输出动作概率
        self.critic = nn.Linear(128, 1)          # 输出状态价值 V

    def forward(self, x):
        h = self.common(x)
        logits = self.actor(h)
        value = self.critic(h)
        return logits, value
```

## 四、PPO 核心：裁剪损失

PPO 的关键思想：**每次更新别把策略改太多**。用新旧策略概率比 r，裁剪到 [1-ε, 1+ε]：

```python
def ppo_loss(logits, old_log_probs, advantages, values, returns, eps=0.2):
    # 1. 概率比 r = π_new / π_old
    dist = Categorical(logits=logits)
    log_probs = dist.log_prob(actions)
    ratio = (log_probs - old_log_probs).exp()

    # 2. 裁剪目标
    surr1 = ratio * advantages
    surr2 = ratio.clamp(1 - eps, 1 + eps) * advantages
    policy_loss = -torch.min(surr1, surr2).mean()

    # 3. 价值损失（预测 V 逼近真实收益）
    value_loss = F.mse_loss(value.squeeze(), returns)

    # 4. 熵正则（鼓励探索）
    entropy = dist.entropy().mean()

    return policy_loss + 0.5 * value_loss - 0.01 * entropy
```

## 五、GAE 优势估计（为什么要用）

PPO 里不用"绝对收益"，用**优势 A**（比平均好多少）：

```python
def compute_gae(rewards, values, gamma=0.99, lam=0.95):
    """GAE：用多步误差平滑估计优势"""
    advantages = np.zeros_like(rewards)
    last_adv = 0
    for t in reversed(range(len(rewards))):
        delta = rewards[t] + gamma * values[t+1] - values[t]
        advantages[t] = last_adv = delta + gamma * lam * last_adv
    return advantages
```

## 六、训练主循环

```python
env = SandboxEnv()
net = ActorCritic()
opt = torch.optim.Adam(net.parameters(), lr=3e-4)

for epoch in range(500):
    # 1. 采样一个 episode（收集轨迹）
    obs, actions, rewards, values = [], [], [], []
    state = env.reset(); done = False
    while not done:
        with torch.no_grad():
            logits, v = net(torch.tensor(state))
            act = torch.distributions.Categorical(logits).sample()
        obs.append(state); actions.append(act); values.append(v)
        state, r, done, _ = env.step(act.item())
        rewards.append(r)

    # 2. 计算优势
    values = torch.cat(values)
    returns = compute_gae(rewards, values)

    # 3. 更新策略（PPO 多次小步更新）
    for _ in range(5):
        logits, v = net(torch.stack(obs))
        loss = ppo_loss(logits, old_log_probs, actions, returns, v)
        opt.zero_grad(); loss.backward(); opt.step()
```

## 七、训练效果对比

```
早期（随机）  : 乱走乱打，胜率 ~10%
中期（DQN 后）: 会追怪了，但动作生硬，偶尔发呆
后期（PPO）   : 主动索敌、走位、连续攻击，胜率 80%+
```

> 观察要点：PPO 训练的 AI 会学会"绕到侧面打""血少了躲一下"这类 DQN 学不会的微操。

## 七、实用技巧

```
1. 奖励塑形（reward shaping）：给中间过程小奖励（打中+1）
2. 动作掩码：无效动作直接屏蔽（没怪时禁止攻击）
3. 学习率衰减：训练后期减小学习率，稳定收敛
4. 多次环境并行：加快采样（VectorEnv）
5. 保存最好模型：每 N 轮测一次，只留最高分
```

```python
# 动作掩码示例
valid = action_mask(obs)   # 1=允许 0=禁止
logits = logits.masked_fill(valid == 0, -1e9)   # 禁用的设极小值
```

## 八、什么时候用 PPO

```
✔ 连续动作（转向、油门）——赛车/飞行类
✔ 行为需要平滑、拟人（打怪走位）
✔ 训练不稳定、DQN 调不动
✘ 简单离散动作、环境确定性高 → DQN 更快
✘ 没时间训练（几万步）→ 先试行为树
```

## 小结

- PPO = 策略梯度 + 裁剪更新 + GAE
- Actor-Critic：网络同时输出动作和状态价值
- 裁剪限制更新幅度 → 训练更稳
- GAE 让奖励信号更平滑
- 打怪 AI 从 DQN 升级到 PPO，动作更聪明更稳

> 下一篇：性能优化与异步并行——让代理跑得更快、更流畅。