---
title: 27 篇文章的站内搜索：81 KB 索引与一次 304
published: 2026-10-24 23:40:00 +08:00
updated: 2026-10-24 23:40:00 +08:00
description: 静态站没有后端，站内搜索只能在构建期做索引、在浏览器里做匹配。这篇记录现在这套方案的实现与实测（索引 81 KB、首搜 422 ms），顺手修掉「每次搜索都重新下载索引」的问题，并说清它在多少篇文章之后会撑不住。
tags:
  - 建站
  - 性能
  - 搜索
image: ""
pinned: false
lang: ""
draft: false
---

静态站没有后端，所以站内搜索必须想在前面：**索引在构建期生成，匹配在浏览器里做**。

这个博客的方案很朴素：一个 `search.json` + 前端子串匹配。27 篇文章跑下来够用，但拆开量一遍才发现，里面藏着一个"每次搜索都重新下载索引"的问题。

## 方案长什么样

![搜索索引的真身：26 条记录，字段是 title / description / content / link / published](/assets/images/posts/blog-site-search/02-index.webp)

构建期把每篇文章的标题、描述、正文和链接写成一个大 JSON：

```json
[
  { "title": "…", "description": "…", "content": "…", "link": "/posts/…", "published": "…" }
]
```

前端打开搜索面板时 `fetch("/search.json")`，然后在内存里对每个字段做 `indexOf`：

```js
for (const post of posts) {
  for (const field of [post.title, post.description, post.content]) {
    const index = fieldLower.indexOf(keywordLower);
    if (index !== -1) { /* 截取命中位置前后 40 字的摘要 */ }
  }
}
```

![实现与实测：索引 81 KB、首搜 422 ms、条件请求 304](/assets/images/posts/blog-site-search/01-how.webp)

实测（本地 Chrome，首访）：

| 指标 | 值 |
| --- | --- |
| 索引体积 | 193 KB（UTF-8）/ **81 KB（字符数）** |
| 条目 | 26 篇（加密文章不进索引） |
| 首次 fetch | 422 ms（含下载） |
| 再次 fetch（默认缓存） | 226 ms |

## 修掉的那个问题：`no-store`

打开搜索面板的代码原本是：

```js
await fetch("/search.json", { cache: "no-store" });
```

`no-store` 的意思是**永远不要用缓存**——于是每次打开搜索都重新下载 81 KB。对桌面宽带无所谓，对移动网络就是每次多几十 KB。

服务端给这个文件的是 `cache-control: public, max-age=0, must-revalidate` + ETag，也就是**允许缓存但每次要验证**。所以只要别写 `no-store`，浏览器就会带 `If-None-Match` 走条件请求：

```
GET /search.json
If-None-Match: W/"39bf20e5ce2f5db47093048c0770cc81"
→ HTTP 304 Not Modified（几百字节）
```

改成 `cache: "default"` 之后，第二次以后的搜索只花一次往返，不再传那 81 KB。

> 踩坑提示：`force-cache` 在这里**不能**用——索引文件名没有内容哈希，强缓存会读到发文章之前的旧索引。`default` + 服务端 ETag 才是正确组合。

## 这套方案的天花板

![线性扫描与中文不分词带来的两个限制](/assets/images/posts/blog-site-search/03-limits.webp)

**1. 线性扫描的代价随篇数增长。**

26 篇时遍历 26 次，用户感觉不到。但索引是**全量下载**的——200 篇时大概 600 KB，每次搜索（哪怕只是第一次）都要传完才能搜。

**2. 中文没有分词，只有子串匹配。**

- 「性能优化」→ 能命中（四个字连写）
- 「性能」「优化」→ 也能命中（子串）
- 「性能 优化」（中间带空格）→ **命中不到**

这不算 bug，但要知道它的边界：这套搜索本质是「整段文本包含关键词」，不是「按词检索」。

**什么时候该换**：文章超过 100 篇，或者需要词权重、高亮、拼音搜索。那时候该上 Pagefind（构建期生成倒排索引 + 分片加载）或 MiniSearch（前端建倒排索引）。**现在 27 篇、81 KB、首搜 422 ms，不值得换。**

## 一个取舍：索引里要不要放全文

现在 `content` 字段放了正文，所以：

- 好处：能搜到正文里的细节（比如某篇文章里提到的 `cache-control`）；
- 代价：索引随文章数线性变胖。

折中方案是只索引标题 + 描述 + 前 N 字。但那样会丢掉「搜正文」的能力，而技术博客里最常搜的恰恰是术语——所以我保留了全文，把「索引会不会太大」留给篇数增长时再决定。

## 小结

站内搜索不是"接个库"就完事，三个决定要先想清楚：

1. **索引在哪生成**：静态站只能在构建期（浏览器里建索引太慢）；
2. **怎么匹配**：子串匹配足够简单，但要知道它不懂分词；
3. **怎么缓存**：索引是大文件，`no-store` 会让每次搜索都重下——用 `default` + ETag 走 304。

三条都记下来之后，这套 60 行的方案就能一直用到文章上百篇。

顺带一提，这套「构建期生成索引、浏览器里匹配」的思路，和[构建产物与访客成本](/posts/blog-build-size/)里讲的按需加载是同一个道理：能不进关键路径的，就别进。
