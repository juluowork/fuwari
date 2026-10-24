---
title: 构建产物 16 MB，访客每次只下 28 KB
published: 2026-10-24 23:20:00 +08:00
updated: 2026-10-24 23:20:00 +08:00
description: 统计 dist 目录发现 16 MB、313 个文件，其中 1.6 MB 的 Mermaid 图表引擎从来没被下载过。这篇把「部署体积」与「访客成本」分清：什么进了关键路径、什么按需加载、什么可以被缓存一年。
tags:
  - 性能
  - 建站
  - 工程实践
image: ""
pinned: false
lang: ""
draft: false
---

跑完性能体检后我一直有两套数字，但从来没把它们放在一起看：

- **部署体积**：`dist` 目录 16.04 MB、313 个文件；
- **访客成本**：首页实际传输 **27.9 KB**（brotli 压缩后）。

差 570 倍。这篇就把这个差距拆开——**哪些体积是真的，哪些是错觉**。

## dist 里到底装了什么

![dist 构成：HTML 37%、WebP 31%、JS 21%](/assets/images/posts/blog-build-size/01-dist.webp)

| 类型 | 文件数 | 体积 | 占比 |
| --- | --- | --- | --- |
| HTML | 57 | 5.95 MB | 37.1% |
| WebP 配图 | 91 | 4.91 MB | 30.6% |
| **JS** | **88** | **3.31 MB** | **20.6%** |
| 字体 | 59 | 1.02 MB | 6.4% |
| XML（sitemap / rss） | 4 | 0.37 MB | 2.3% |
| JSON / CSS / SVG | 8 | 0.47 MB | 4.7% |

最扎眼的是 JS 那 88 个文件、3.31 MB。而最大的六个文件里有四个是**图表引擎**：

```
585.3 KB  _astro/mermaid.core.js
481.0 KB  _astro/wardley.js
431.4 KB  _astro/cytoscape.esm.js
253.4 KB  _astro/katex.js
```

**Mermaid 全家桶 1.6 MB。** 而这个站目前**一张 Mermaid 图表都没有**。

## 但访客从没下载过这 1.6 MB

因为它是**动态 import** 的：

```js
let mermaidLoader: Promise<any> | null = null;
const loadMermaid = async () => {
  if (!mermaidLoader) {
    mermaidLoader = import("mermaid").then((mod) => mod.default);
  }
  return mermaidLoader;
};
```

只有当页面里真的出现 ` ```mermaid ` 代码块时才会调用它。于是这 1.6 MB 变成了**永远不会被请求的部署体积**——它在 `dist/` 里占位，但不进任何人的关键路径。

![部署体积 16 MB，单次访问 28 KB](/assets/images/posts/blog-build-size/03-wire.webp)

实测传输量：

| 页面 | 传输（brotli） |
| --- | --- |
| 首页 `/` | **27.9 KB** |
| 文章页 `/posts/blog-view-counter/` | **47.5 KB** |

## 三个让差距变大的机制

**1. 压缩：130 KB → 28 KB。**
HTML 平均每页 104 KB（未压缩），Cloudflare 默认开 brotli，压到 25~30 KB。这是最容易忽略的一半——**看 `dist` 的体积永远会高估 4~5 倍**。

**2. 按需加载：1.6 MB 永不下载。**
除了 Mermaid，KaTeX（数学公式）也是同一个模式。这类"可能用得上"的依赖放动态 import，代价从「每个访客」变成「零」。

**3. 长缓存：第二次访问不再请求。**
构建产物文件名带内容哈希，`/_astro/` 下全部是：

```
cache-control: public, max-age=31536000, immutable
```

（这条是[三层缓存那篇](/posts/blog-cache-layers/)改的，之前所有资源都是 `max-age=0`。）

三个机制叠起来，才有了「16 MB 部署、28 KB 首访、几乎零次访」。

## 顺手修掉的一个小浪费

拆 HTML 时发现每页 40 KB 是**内联脚本**（44 个 `<script>`），其中最大的那块里塞着我写的解释性注释——`is:inline` 的脚本会被原样输出，**注释也算字节**。

改法是把长注释搬到文档、脚本里只留一行结论：

| | 改前 | 改后 |
| --- | --- | --- |
| 首页 HTML | 134 KB | 132.9 KB |
| 内联脚本合计 | 40.0 KB | 39.5 KB |

省下 509 字节/页。数字很小，但它说明一件事：**`is:inline` 的脚本要当成"发给用户的源码"来写**，注释不是免费的。

（真正的大头在别处：40 KB 内联脚本里，最大的一块 6 KB 是 Cookie 横幅的引导代码——这也是它成为 LCP 元素的原因之一，见[和横幅抢 LCP](/posts/blog-banner-lcp/)。）

## 该看哪个数字

我的结论是：**看三个，而不是一个**。

| 数字 | 看什么 | 什么时候看 |
| --- | --- | --- |
| 部署体积 | 部署限制（Cloudflare 单 Worker 2 万文件 / 单文件 25 MiB） | 加依赖时 |
| 首访传输 | 真实的首屏成本 | 优化性能时 |
| 二次访问 | 缓存是否生效 | 改缓存策略时 |

只看第一个会去删没用的依赖（比如把 Mermaid 删了），但收益是 0——因为它本来就没被下载。只看第二个会忽略部署限制。**三者一起看，才知道该动哪里。**

![每个页面的静态产物都是同一套模板，压缩后 25~30 KB](/assets/images/posts/blog-build-size/02-page.webp)

## 小结

- **部署体积 ≠ 访客成本**，中间有压缩、按需加载、缓存三道闸；
- 动态 import 的依赖要算「永远不下载」，不要为了 `dist` 好看去删它；
- 内联脚本属于源码分发，注释也算字节；
- 判断优化优先级时，先量一次「首页压缩后到底多少 KB」——那才是用户付出的代价。
