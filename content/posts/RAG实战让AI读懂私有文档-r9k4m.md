---
title: RAG 实战：让 AI 读懂你的私有文档再回答问题
slug: RAG实战让AI读懂私有文档-r9k4m
date: 2026-08-30
visibility: public
tags: AI智能体, RAG, 知识库, 教程
---

# RAG 实战：让 AI 读懂你的私有文档再回答问题

大模型很强，但它不知道你公司的内部制度、你自己整理的笔记、你客户的历史合同。RAG（检索增强生成）就是解决这个问题的——先从你的私有文档里找到相关内容，再让 AI 基于这些内容回答。

## RAG 是什么：一个比喻

想象你请了一个实习生（大模型），他很聪明但刚来，不了解公司。你给他一个文件柜（知识库），每次问问题时，他先去文件柜里翻资料，找到相关文件后再回答你。

```
用户提问 → 从文档库检索相关段落 → 把段落塞进 Prompt → AI 基于段落回答
```

## 完整实战：搭一个"企业制度问答机器人"

### 环境准备

```bash
pip install langchain langchain-openai langchain-community faiss-cpu pypdf
```

### 第 1 步：把文档变成向量存进知识库

```python
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
import os

# 1. 加载文档（支持 PDF、TXT、Markdown）
docs = []
for file in ["公司制度手册.pdf", "员工须知.txt", "报销流程.md"]:
    if file.endswith(".pdf"):
        loader = PyPDFLoader(file)
    else:
        loader = TextLoader(file, encoding="utf-8")
    docs.extend(loader.load())

print(f"共加载 {len(docs)} 个文档片段")

# 2. 切分文档（大文档拆成小块，便于精准检索）
splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,      # 每块约 500 字
    chunk_overlap=50,    # 块之间重叠 50 字，避免切断语义
    separators=["\n\n", "\n", "。", "，", " "]
)
chunks = splitter.split_documents(docs)
print(f"切分为 {len(chunks)} 个知识块")

# 3. 生成向量并存入向量数据库
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vectorstore = FAISS.from_documents(chunks, embeddings)

# 保存到本地，下次直接加载
vectorstore.save_local("knowledge_base")
print("知识库构建完成！")
```

### 第 2 步：基于知识库问答

```python
from langchain_openai import ChatOpenAI
from langchain.chains import RetrievalQA

# 加载知识库
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vectorstore = FAISS.load_local("knowledge_base", embeddings, allow_dangerous_deserialization=True)

# 创建问答链
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=vectorstore.as_retriever(search_kwargs={"k": 3}),  # 每次取最相关的3段
    return_source_documents=True
)

# 提问
question = "出差住宿报销标准是多少？"
result = qa_chain.invoke({"query": question})

print("回答:", result["result"])
print("\n参考来源:")
for doc in result["source_documents"]:
    print(f"  - {doc.metadata.get('source', '未知')} 第{doc.metadata.get('page', '?')}页")
```

### 运行效果

```
回答: 根据公司制度手册第3章第2节，出差住宿报销标准为：
- 一线城市：≤500元/晚
- 二线城市：≤400元/晚
- 三线及以下：≤300元/晚
超出部分需提前申请审批。

参考来源:
  - 公司制度手册.pdf 第12页
  - 报销流程.md 第1页
```

## 进阶：提升检索质量

### 技巧 1：用混合检索（关键词 + 向量）

```python
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever

# BM25 关键词检索
bm25 = BM25Retriever.from_documents(chunks)
bm25.k = 3

# 向量检索
faiss = vectorstore.as_retriever(search_kwargs={"k": 3})

# 混合：两者各占 50%
ensemble = EnsembleRetriever(
    retrievers=[bm25, faiss],
    weights=[0.5, 0.5]
)

qa_chain = RetrievalQA.from_chain_type(
    llm=llm, chain_type="stuff", retriever=ensemble,
    return_source_documents=True
)
```

### 技巧 2：用问题改写提升命中率

```python
from langchain.retrievers.multi_query import MultiQueryRetriever

# 把一个问题改写成多个角度的问题，分别检索
multi_retriever = MultiQueryRetriever.from_llm(
    retriever=vectorstore.as_retriever(),
    llm=llm
)
# 用户问"怎么报销" → 自动改写为"报销流程""费用报销步骤""差旅报销"等
```

### 技巧 3：引用检测——防止 AI 编造

```python
prompt_template = """请仅根据以下参考文档回答问题。如果文档中没有相关信息，请说"根据现有资料无法回答"。

参考文档：
{context}

问题：{question}

回答格式：先给出答案，再标注引用来源（文档名+页码）。"""

from langchain.prompts import PromptTemplate
PROMPT = PromptTemplate(template=prompt_template, input_variables=["context", "question"])
qa_chain = RetrievalQA.from_chain_type(
    llm=llm, chain_type="stuff", retriever=vectorstore.as_retriever(),
    chain_type_kwargs={"prompt": PROMPT}
)
```

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 回答不沾边 | chunk 太大或太小 | 调整 chunk_size（300-800） |
| 找不到文档 | 向量检索不准 | 加 BM25 混合检索 |
| AI 编造内容 | 没限制"仅基于文档回答" | 加引用检测 Prompt |
| 文档太长报错 | 超出模型上下文 | 减小 k 值（取 2-3 段） |
| PDF 表格丢失 | PDF 解析不支持表格 | 用表格提取工具预处理 |

## 成本估算

| 操作 | 费用 |
|------|------|
| 构建 100 页文档知识库 | ~0.5 元（embedding） |
| 每次问答 | ~0.002 元 |
| 每天 100 次问答 | ~0.2 元/天 |

> RAG 的本质不是"教 AI 学会你的知识"，而是"给 AI 一本参考书让它翻着答"。理解了这一点，你就掌握了企业知识库建设的核心思路。
