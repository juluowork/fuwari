---
title: 静态站的标签体系：挖出 11 个可收录页面
published: 2026-10-24 22:20:00 +08:00
updated: 2026-10-24 22:20:00 +08:00
description: 23 篇文章、20 个标签，但页面上一个标签都看不到——前端组件把 tags 静默忽略了。这篇记录怎么把标签变成 11 个可收录页面（10 个标签落地页 + 索引），以及中文标签在 Astro 里踩到的三个坑。
tags:
  - 建站
  - SEO
  - Astro
image: ""
pinned: false
lang: ""
draft: false
---

做体检时随手查了一下「标签页在不在」，结果发现两件事：**没有标签页**，而且**文章页上也看不到标签**。

后者更意外：文章页明明写了 `<PostMetadata tags={entry.data.tags} />`，但那个组件里根本没有 `tags` 字段——传进去的参数被静默忽略了。于是 20 个标签只活在 frontmatter 里，对读者和搜索引擎都不存在。

## 先数一遍：哪些标签值得建页

![23 篇文章的标签分布：20 个标签、67 次引用](/assets/images/posts/blog-tags-system/01-stats.webp)

```
建站 18 篇 · Astro 11 篇 · 性能 8 篇 · 安全 6 篇
运维 3 篇 · Cloudflare 3 篇 · 统计 2 篇 · 观测 2 篇 · 工程实践 2 篇 · 隐私 2 篇
以下各 1 篇：缓存 / 图片 / SEO / 搜索 / 公告 / HTTPS / 网络 / 排障 / 测量 / 成本
```

规则很简单：**只给 ≥2 篇文章的标签建落地页**。

单篇标签的聚合页只有一篇文章 + 一句导语，是标准的薄内容——Google 对这类页面没有好感，而它又会让站内多出 10 个"看起来像页面但没内容"的 URL。所以单篇标签只显示在文章底部（纯文本，不带链接），不建页、不进 sitemap。

最终：**10 个标签页 + 1 个索引页 = 11 个新页面**，可收录页面从 30 个涨到 41 个（+37%）。

## 每个标签页长什么样

![标签索引页：10 个标签与各自篇数](/assets/images/posts/blog-tags-system/02-tags.webp)

以 `/tags/Astro/` 为例，一个页面要有四样东西：

1. **独立的 title / description**（不能复用文章页的，也不能所有标签页共用一句）；
2. **单 h1** —— 由布局的 `heading` 属性渲染成 `<h1 class="sr-only">`，可见标题用 h2；
3. **结构化数据** —— `CollectionPage` + `ItemList`，把该标签下的文章作为 `itemListElement`；
4. **内容本身** —— 按时间倒序的文章列表 + 页脚「其他标签」交叉链接。

结构化数据那段值得单独说：标签页的价值是"聚合"，所以用 `CollectionPage`，而不是 `BlogPosting`。`ItemList` 里最多放 20 条，标题直接取文章标题、URL 取绝对地址。

## 描述怎么生成：唯一、且够长

第一版我自动生成的是：

> peroe 的博客中带有「统计」标签的 2 篇文章，按发布时间从新到旧排列。

体检立刻报「description 38 字（建议 60~160）」。而且 10 个标签页都是同一个句式，只有标签名不同——**这是重复内容**。

改成用该标签下最新两篇文章的标题拼摘要：

```
peroe 的博客中带有「Astro」标签的 11 篇文章…… 例如：《Astro 静态站的三个隐形约定：CSS 是全局的》、
《静态站的标签体系：挖出 11 个可收录页面》。每篇都附带实测数据与可复现的命令。
```

结果是每页 100~130 字、彼此唯一，而且自然带上了文章关键词。这也是我后来给「相关文章」组件定描述时用的同一个思路：**让自动生成的文案里带真实内容片段**。

## 三个坑

![三个中文标签相关的坑：URL 编码、canonical 比较、描述长度](/assets/images/posts/blog-tags-system/03-pitfalls.webp)

**坑一：`getStaticPaths` 里不能提前编码。**

```ts
// ❌ 构建直接失败：NoMatchingStaticPathFound: /tags/建站/
params: { tag: encodeURIComponent(tag) }
// ✅ 给原始标签名，Astro 会解码 URL 后再匹配
params: { tag }
```

这是中文标签必踩的一脚：链接里需要 `encodeURIComponent`（浏览器行为），但路由参数不能。

**坑二：审计脚本对中文路径的 canonical 误报。**

`/tags/统计/` 的 canonical 是 `https://blog.peroe.cn/tags/%E7%BB%9F%E8%AE%A1/` —— 两者等价，但我自己的体检脚本是逐字符比较，于是报了 10 条「canonical 指向别处」。改成比较前先 `unquote()` 两边，误报清零。

写体检脚本的人容易犯这个错：**URL 比较必须按语义比，不能按字符串比**。

**坑三：sitemap 是手写清单。**

新页面建好了但 sitemap 里没有——它不会自己出现。我维护的是一份 `staticPages` 清单，得手动补 `/tags/`，再按「≥2 篇」的同一条件生成 10 条标签页条目（`lastmod` 取该标签下最新文章的更新时间）。**建页条件必须和 `getStaticPaths` 完全一致**，否则 sitemap 里会混进 404。

## 顺带修的一件事：文章页显示标签

标签页有了，但读者是从文章页过来的——所以给 `PostMeta` 加了标签渲染：

```astro
{tags.map((tag) =>
  linkableTags.includes(tag)
    ? <a href={`/tags/${encodeURIComponent(tag)}/`}>{tag}</a>   // ≥2 篇：可点
    : <span>{tag}</span>                                        // 单篇：纯文本
)}
```

`linkableTags` 在构建期算好（复用同一份统计），这样单篇标签不会产生 404。

## 小结

标签体系的价值有两层：

- **对读者**：从一篇文章跳到同主题的其他文章；
- **对搜索引擎**：多出 11 个主题聚合页，能吃「Astro 建站」「网站性能优化」这类单篇标题命中不了的词。

判断标准可以总结成三条：

1. **≥2 篇才建页**（薄内容不建）；
2. **描述必须唯一且够长**（拼真实标题，别套模板）；
3. **建页条件在 `getStaticPaths`、sitemap、链接渲染三处保持一致**（否则不是 404 就是孤儿页）。

标签页与站点地图的联动细节，见[博客 SEO 自我体检](/posts/blog-seo-self-audit/)那一篇里的体检清单。
