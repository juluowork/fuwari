---
title: 首屏从 392KB 砍到 59KB，FCP 从 7.4 秒到 2.1 秒
published: 2026-10-24 17:45:00 +08:00
updated: 2026-10-24 17:45:00 +08:00
description: 用 CDP 模拟中端手机实测博客首页：GA4 与 Clarity 挤在关键路径、头像和 favicon 直接加载 107KB 原图、312KB 关键 CSS 拖慢首屏。四处改动后传输 392KB→59KB，FCP 7.4s→2.1s，长任务 13→2 个。
tags:
  - 建站
  - Astro
  - 性能
image: ""
pinned: false
lang: ""
draft: false
---

上一轮做完 [SEO 自我体检](/posts/blog-seo-self-audit/)，顺手用同样的思路量了一次首屏：**FCP 7.4 秒、LCP 43 秒、CLS 0.5**，而且 LCP 元素居然是 Cookie 横幅的文案 —— 说明打开页面那几秒里，浏览器的注意力全被别的请求抢走了。

> [!NOTE]
> 测量方式：Playwright 驱动本机 Chrome，用 CDP 把网络限到 **1.6Mbps / 150ms RTT**、CPU 降速 **4×**（大致相当于一台中端安卓机在 4G 上的体感），再用 `PerformanceObserver` 采集 FCP / LCP / CLS / 长任务。
> 所有数字都是同一脚本、同一参数、改动前后各跑两遍的结果。

## 别只看分数，要看「谁在抢首屏」

Lighthouse 会给一个总分，但它不会告诉你 LCP 元素是 Cookie 横幅。我更关心两个问题：**首屏到底在等什么**、**谁把主线程占住了**。所以脚本除了打指标，还记录每次请求的字节数与资源类型，以及 LCP 到底落在哪个元素上。

第一次跑出来是这样：

![改造前：FCP 7.4 秒，LCP 落在 Cookie 横幅上，单页 392KB / 76 个请求](/assets/images/posts/blog-home-performance/01-before.webp)

拆开看，问题有四层：

| 现象 | 证据 |
| --- | --- |
| 埋点脚本抢跑 | `gtag.js` 单个 **177.1KB**，Clarity 还要再拉一坨；两者都在首屏阶段就开始下 |
| 头像和 favicon 用原图 | `q2.qlogo.cn` 的 `spec=0` 原图 **106.8KB**，被下载了两次（头像 + favicon） |
| 关键 CSS 过大 | 首页要下 311.8KB 的 `MainGridLayout.css`（里面混进了 KaTeX 与 Prism 的样式） |
| 结果 | 长任务 10~13 个 / 1.7~2.1 秒；LCP 被晚到的 Cookie 横幅顶替 |

## 改动一：埋点延后到空闲时段

统计脚本对首屏没有任何价值，但它默认和页面同时开始加载。我把 GA4 与 Clarity 都挪到 `window.load` 之后的 `requestIdleCallback` 里再动态注入：

```js
var loadAnalytics = function () {
    if (window.__trackingDenied) return;   // 访客拒绝过就一个字节都不下载

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID);
    var g = document.createElement("script");
    g.async = true;
    g.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(g);
};

var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1200); };
if (document.readyState === "complete") idle(loadAnalytics);
else window.addEventListener("load", function () { idle(loadAnalytics); }, { once: true });
```

这段改动的关键是**不能改变行为语义**：

- 统计口径不变 —— pageview 只是晚一两秒上报；
- 「默认开启、拒绝即停用」不变 —— 加载前再查一次 `__trackingDenied`，拒绝过的访客**一个埋点请求都不会发**（我专门用 `cookie_consent_level.tracking=false` 跑了一遍：0 个请求、`ga-disable` 为 true、Clarity 未被注入）；
- 用户中途点「同意」也不需要特判 —— 那时 `__trackingDenied` 是 false，延迟加载自然会执行。

## 改动二：头像按 DPR 取图

头像在侧栏里显示宽度最多 280px，但 `<img src>` 指向的是 `spec=0`（QQ 头像的原图），实测 106.8KB。qlogo 支持用 `spec` 指定尺寸，我实测了三档：

| spec | 实际体积 |
| --- | --- |
| `spec=0`（原图） | 106.8 KB |
| `spec=640` | 52.8 KB |
| `spec=140` | **6.2 KB** |

于是给它加 `srcset`，让浏览器自己挑：

```astro
const avatarSrcSet = config.avatar.includes("spec=0")
	? `${config.avatar.replace("spec=0", "spec=140")} 1x, ${config.avatar.replace("spec=0", "spec=640")} 2x`
	: undefined;
```

再加 `fetchpriority="low"`（头像不该和正文抢优先级）。`width` / `height` 本来就有，所以不会引入新的布局偏移。

## 改动三：favicon 顺手换成小图

排查时发现 `spec=0` 那张 106.8KB 的图被请求了**两次**：一次是头像，一次是 favicon —— 而 favicon 在模板里直接复用了同一个 URL。浏览器对 favicon 的请求很积极，等于每来一个访客就白下 100KB。

改成 `spec=140`（6.2KB），缩到 16px / 32px 完全够用。

## 改动四：把 KaTeX 与 Prism 赶出全站关键 CSS

311.8KB 的关键 CSS 是这么来的：`Layout.astro` 里全局 import 了 `katex.min.css`、`prism-tomorrow.css` 和自定义的 `prism-custom.css`。可公式与代码块**只出现在文章里**，首页并不需要。

把这三个 import 从 `Layout.astro` 挪到 `src/pages/posts/[...slug].astro`，首页 CSS 从 **311.8KB 降到 282KB**，文章页依旧完整（多出 32.4KB 的 katex/prism chunk，按需加载）。

```diff
-// Layout.astro（全站）
-import "prismjs/themes/prism-tomorrow.css";
-import "katex/dist/katex.min.css";
-import "../styles/prism-custom.css";

+// src/pages/posts/[...slug].astro（只有文章页）
+import "katex/dist/katex.min.css";
+import "prismjs/themes/prism-tomorrow.css";
+import "../../styles/prism-custom.css";
```

## 效果

![改造后：FCP/LCP 2.1~2.8 秒，单页 59KB / 41 个请求，长任务只剩 2~3 个](/assets/images/posts/blog-home-performance/02-after.webp)

| 指标 | 改造前 | 改造后 | 变化 |
| --- | --- | --- | --- |
| FCP | 3708 / 7400 ms | **2132 / 2772 ms** | 约快 3 倍 |
| LCP | 24080 / 43372 ms | **2132 / 2772 ms** | 从「被横幅顶替」变成头像 |
| 长任务 | 10~13 个 / 1686~2121 ms | **2~3 个 / 134~204 ms** | 主线程压力降一个数量级 |
| 头像 + favicon | 215 KB | **59 KB** | 少下 156KB |
| 关键 CSS | 311.8 KB | **282 KB** | 少 30KB |

![手机宽度下的首页：侧栏头像与列表都在，视觉上没有任何变化](/assets/images/posts/blog-home-performance/03-home-mobile.webp)

## 还没解决的：CLS 0.43

诚实说，**布局偏移没修好**。改造后 CLS 从 0.50~0.70 降到 0.43，但仍然远高于 0.1 的「良好」线。

我做了个对照实验：把 JS 整个关掉，内容区高度依然会从 2507px 变到 1256px —— 说明这不是脚本改 DOM 造成的，而是**样式表来得太晚**：在 1.6Mbps 下，282KB 的关键 CSS 要一秒多才到，浏览器先用"无样式"的盒子排了一遍版，等 CSS 到了再重排，侧栏就被整体推动了 300~500px。

也就是说，只要关键 CSS 还有 282KB，慢网下的 CLS 就压不下去。下一步有三条路，我还没动手：

1. **裁 Tailwind 体积**：282KB 里绝大部分是工具类，得查清为什么打出来这么多（正常博客站点 30~50KB 就够）；
2. **内联首屏关键 CSS**：Astro 支持 `build.inlineStylesheets`，但阈值默认很小，需要自己拆；
3. **延迟非关键样式**：把 `fancybox.css`（32.4KB）这类只在点开图片时才用的样式改成 `media="print"` + `onload` 切换。

这几条都有把样式改坏的风险，所以这轮先停在"能稳定复现、收益明确"的四个改动上。

## 小结

这次最值钱的不是那 4 个改动，而是**测量脚本**：同一套参数，改完再跑一遍，数字会诚实告诉你哪一步有效。

如果你也想量一次自己的站，记住三件事：

1. 一定要**同时降网速和降 CPU**，只降一个会得出误导性结论；
2. 记录每个请求的**字节数和类型**，比看总分有用得多；
3. 盯住 **LCP 元素是谁** —— 如果它是个 Cookie 横幅或侧栏卡片，说明真正的内容根本没排上队。

下一轮我打算先啃掉那 282KB 的 CSS，把这个 0.43 的 CLS 压到 0.1 以下，再回来更新这篇文章的数据。
