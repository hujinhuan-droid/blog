---
title: Pandas 数据分析入门：从读表到出图，一条龙
slug: pandas数据分析入门-d3q9x
date: 2026-08-27
visibility: public
tags: Python, Pandas, 数据分析, 可视化
---

# Pandas 数据分析入门：从读表到出图，一条龙

不管你是运营、财务、科研还是想转行的程序员，**数据分析几乎都是 Python 最先用武之地的地方**。而 Pandas，就是这件事的事实标准。它让你用几行代码完成"读表 → 清洗 → 统计 → 出图"的完整链路，不用在 Excel 里手动拖拽到怀疑人生。

## 读数据：一行就进来

```python
import pandas as pd

df = pd.read_csv("销售.csv")          # CSV
# df = pd.read_excel("销售.xlsx")     # Excel
# df = pd.read_json("数据.json")      # JSON
print(df.shape)        # (行数, 列数)
print(df.head())       # 看前 5 行
```

## 看一眼：快速了解数据

```python
df.info()        # 每列类型、非空数量
df.describe()    # 数值列的统计（均值、最值、分位）
df.isna().sum()  # 每列缺失值数量
```

## 选取与过滤

```python
df["销售额"]                    # 取一列
df[df["城市"] == "北京"]        # 条件过滤
df.loc[df["销售额"] > 1000]     # 同理，更显式
df.sort_values("销售额", ascending=False)  # 排序
```

## 分组聚合（数据分析的灵魂）

"按城市汇总销售额"——Excel 里要透视表，Pandas 一行：

```python
city_summary = df.groupby("城市")["销售额"].agg(["sum", "mean", "count"])
print(city_summary.sort_values("sum", ascending=False))
```

多个维度也不怕：

```python
df.groupby(["城市", "品类"])["销售额"].sum()
```

## 清洗：别让脏数据毁了结论

```python
df.dropna(subset=["销售额"])          # 丢弃关键列缺失的行
df = df.drop_duplicates()             # 去重
df["日期"] = pd.to_datetime(df["日期"])  # 转日期类型
df["销售额"] = df["销售额"].fillna(df["销售额"].mean())  # 缺失值填均值
```

## 合并表（像 SQL 的 join）

```python
result = pd.merge(订单表, 客户表, on="客户ID", how="left")
```

## 出图：让结论看得见

Pandas 直接调用 matplotlib，一行出图：

```python
import matplotlib.pyplot as plt

city_summary["sum"].plot(kind="bar", figsize=(8, 4))
plt.title("各城市销售额")
plt.tight_layout()
plt.savefig("城市销售.png")
plt.show()
```

若是时间序列，还能直接画趋势线：

```python
df.set_index("日期")["销售额"].resample("M").sum().plot()
```

## 一个完整小例子

```python
import pandas as pd

df = pd.read_csv("销售.csv")
clean = df.dropna(subset=["销售额"]).copy()
clean["日期"] = pd.to_datetime(clean["日期"])
monthly = clean.set_index("日期")["销售额"].resample("M").sum()

print("月均销售额：", round(monthly.mean(), 2))
print("峰值月份：", monthly.idxmax())
```

## 新手避坑

- **链式赋值警告**：`df[df.x>0]["y"]=1` 可能不生效，用 `df.loc[df.x>0, "y"] = 1`。
- **inplace 谨慎用**：`dropna(inplace=True)` 会改写原表，调试时容易乱，建议赋值给新变量。
- **大数据用类型优化**：类别列转 `category`、数值用更小 dtype，内存能省很多。
- **别在循环里逐行改**：用向量化（`df["新列"] = 表达式`），比 for 循环快几十倍。

## 学到哪算够？

日常 80% 的数据分析，就是上面这些：`read_*` → `head/info/describe` → 过滤/分组 → 清洗 → 合并 → 出图。把这八板斧练熟，你已经超过绝大多数"只会 Excel 拖拽"的同事。再往前，就是接 FastAPI 做成数据 API、接机器学习做预测——那又是另一条进阶路了。
