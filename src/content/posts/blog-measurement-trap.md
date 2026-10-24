---
title: 我的性能测试骗了我：把第三方全拦掉再测
published: 2026-10-24 21:40:00 +08:00
updated: 2026-10-24 21:40:00 +08:00
description: 一个多月来我的脚本一直显示 LCP 1.9 秒，直到跑了一次 Lighthouse——同一个页面 LCP 12.4 秒。差异不在工具，而在我脚本的启动参数里那行 host-resolver-rules：它把所有第三方域名都解析成了 NOTFOUND。附三个数据源的对比与修复过程。
tags:
  - 性能
  - 建站
  - 观测
image: ""
pinned: false
lang: ""
draft: false
---

> [!WARNING]
> 这篇是我自己的「打脸记录」：前面几篇性能文章里的数字，是在一个**没有第三方脚本**的平行世界里测出来的。真实场景要慢得多。

## 起因

为了写上一篇的对比，我跑了一次 Lighthouse：

```
Lighthouse 12.8 (mobile)
  得分: 47     FCP 5.5s     LCP 12.4s     TBT 490ms
```

可我自己的脚本一直在报 LCP **1.9 秒**。差 6 倍，必须查清楚。

## 三个"测量"，三个世界

![同一页面三个数据源：1.9s / 12.4s / 12.1s](/assets/images/posts/blog-measurement-trap/01-three.webp)

| 数据源 | FCP | LCP | TBT | 请求 / 传输 |
| --- | --- | --- | --- | --- |
| 我的 CDP 脚本 | 1.4s | **1.9s** | 117ms | 41 / 59KB |
| Lighthouse simulate | 5.5s | **12.4s** | 490ms | 83 / 1039KB |
| Lighthouse devtools | 3.5s | **12.1s** | 1850ms | 83 / 1039KB |

请求数差一倍、传输差 17 倍。答案藏在我脚本的启动参数里：

```js
args: ["--no-proxy-server",
       "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE blog.peroe.cn , EXCLUDE q2.qlogo.cn"]
```

这两行本来是**为了绕开本机代理**（用 CDP 限速时，代理会让连接超时）。副作用是：所有不在白名单里的域名都被解析成 `NOTFOUND` —— **GA4、Clarity、Cookie 横幅、Umami、Giscus 全军覆没**。

说白了，我这个脚本测的是「**如果这个站没有第三方脚本，它有多快**」。那当然快。

## Lighthouse 说 LCP 是谁

更进一步，Lighthouse 直接告诉我们 LCP 元素是哪个：

![LCP 元素是 Cookie 横幅的文案，12 秒才出现](/assets/images/posts/blog-measurement-trap/02-lcp.webp)

```
LCP 元素: <p class="cc-nb-text" id="termsfeed-com---nb-text">
```

不是文章标题，不是卡片，是**Cookie 横幅的说明文字**。

时间线是：`TTFB 1.76s` → `DOMContentLoaded` → `window.load` → 横幅脚本（66 KB）异步插入 → 解析执行 → 渲染出那块大文本，**大约 12 秒**。

而 **LCP 会一直记录到「用户首次交互」为止**，所以这个晚出现的大块，直接把 LCP 顶到了 12 秒。

## 修了什么

最直接的一刀：**别让横幅排在最后**。它原来等 `window.load` 才加载，我改成 `DOMContentLoaded` 就加载（脚本本身仍是 `async`）：

```js
// 改前
window.addEventListener("load", load, { once: true });
// 改后
document.addEventListener("DOMContentLoaded", load, { once: true });
```

实测（Lighthouse devtools 模式）：

| | 改前（线上） | 改后（本地构建） |
| --- | --- | --- |
| 性能分 | 37 | **49** |
| FCP | 3.5s | **1.6s** |
| LCP | 12.1s | **7.2s** |
| LCP 元素 | 横幅文案 | 仍是横幅文案 |

## 还没解决的：横幅仍然是最大的元素

7.2 秒仍然远超 2.5 秒的「良好」线，而且 LCP 元素没变 —— 只要那块说明文字是页面上最大的元素、又是最晚出现的，它就会一直是 LCP。

两条路，都需要权衡：

1. **把横幅做小**：限制文字块宽度/行数（它现在是 351px 高的大块），让正文成为最大元素。风险是同意说明变得不明显。
2. **换掉 TermsFeed**：自建一个 2KB 的同意条。66KB 的第三方脚本 + 4 倍 CPU，只为了弹一条 Cookie 提示，性价比很低。**风险是合规**：条款文案、偏好中心、与 GA4/Clarity 的联动都要自己实现。

我倾向第二条，但它动的是合规相关的部分，**需要你确认后再做**。

## 三条教训

**1. 测量脚本的"隐含条件"必须写下来。** 我那行 `host-resolver-rules` 是三个月前为了修代理超时加的，早就忘了。它悄悄改变了被测对象。现在我在脚本头部固定写一行注释：*「本模式会阻断所有第三方域名，只用于隔离自有资源的性能」*。

**2. 换一个工具复核。** 同一个站点、同一台机器，Lighthouse 和我的脚本差 6 倍 —— **不是谁错了，是测的东西不同**。两个数字都有价值，但必须知道各自的前提。

**3. 永远看 LCP 元素是谁。** 数字只是结果，「谁成为了 LCP」才是病因。这次如果不是 Lighthouse 告诉我那是 Cookie 横幅，我可能会去优化图片和字体。

![首页现在的样子：横幅更早出现，LCP 从 12 秒降到 7 秒](/assets/images/posts/blog-measurement-trap/03-banner.webp)

## 小结

这轮的收获不是"优化了 5 秒"，而是**发现自己的测量方法在骗自己**。前面几篇里那些好看的数字（FCP 1.4s / LCP 1.9s / 41 个请求）都是真的，但含义是「排除第三方之后」——等于给站点做了一次「断网测试」。

真实场景的数字是：**LCP 7.2s（横幅修好后）、TBT 1.5s、83 个请求 / 1MB**。接下来的工作很清楚：把第三方从关键路径上撤下来，而不是继续优化我自己的 CSS。

同类的测量陷阱还有一次：[和 Cookie 横幅抢 LCP](/posts/blog-banner-lcp/)里那三次尝试，有两招其实没用。
