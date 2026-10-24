---
title: 静态博客的隐私边界：一次第三方请求审计
published: 2026-10-24 18:35:00 +08:00
updated: 2026-10-24 18:35:00 +08:00
description: 静态博客没有后端，并不意味着访客只跟你的服务器打交道。用脚本审一遍页面请求：首页向 15 个第三方域发出了 30 个请求，其中一个来自模板遗留的 browser-update.org，会把访客 IP 与 UA 交给外部服务。附审计脚本与自查清单。
tags:
  - 建站
  - 安全
  - 隐私
image: ""
pinned: false
lang: ""
draft: false
---

「静态站没有后端，所以没什么隐私问题」——这句话只说对了一半。没有数据库、没有登录、没有人存你的手机号，但**页面本身可以调外部服务**：统计、评论、头像、Cookie 横幅、性能监控……这些多半不是你主动选的，而是跟着模板一起搬进来的。

我写了个脚本把首页与文章页的外部请求全部列出来，结果是：**首页向 15 个第三方域发出了 30 个请求**。

![审计结果：15 个第三方域，其中一个是模板遗留的 browser-update.org](/assets/images/posts/blog-third-party-audit/01-before.webp)

## 怎么审：只看「不是我的域名」

思路很朴素：拦截所有响应，凡是 host 不等于自己域名的，按域聚合并统计。核心代码十几行（Node + Playwright）：

```js
page.on("response", (res) => {
    const u = new URL(res.url());
    if (u.hostname === "blog.peroe.cn") return;   // 自己的域跳过
    reqs.push({
        host: u.hostname,
        type: res.request().resourceType(),        // script / image / xhr / fetch
        len: Number(res.headers()["content-length"] ?? 0),
    });
});

// 等 9 秒：埋点脚本是延后加载的，早扫描会漏掉
await page.waitForTimeout(9000);

// 再按 host 聚合打印：${count}× ${bytes} ${host} [${types}]
```

两个容易漏的地方：

1. **别在 `load` 事件就收工** —— 埋点、懒加载图片、评论组件都可能在 `load` 之后才请求，我这里是等了 9 秒；
2. **`fetch`/`xhr` 也算** —— 最典型的追踪请求（GA 的 `/g/collect`、Umami 的 `/api/send`）都是 fetch，不是脚本。

## 15 个域都是谁

把结果按「谁发起的」分类，其实很清楚：

| 类别 | 域 | 说明 |
| --- | --- | --- |
| 自己的服务 | `t.peroe.cn` | 自建浏览量统计（`tracker.js` + `/send`） |
| 内容必需 | `q2.qlogo.cn` | 侧栏头像（QQ 头像服务） |
| 评论 | `giscus.app` | 文章页才加载，基于 GitHub Discussions |
| Cookie 合规 | `www.termsfeed.com` | 同意横幅脚本 |
| 统计 | `cloud.umami.is` + `gateway-us.umami.is` | Umami 上报 + 共享数据读取 |
| 统计 | `www.googletagmanager.com` + `www.google-analytics.com` | GA4（**177 KB** 的 `gtag.js`） |
| 统计 | `www.clarity.ms` + `scripts.clarity.ms` + `c./i./q.clarity.ms` | Clarity 主脚本与上报 |
| 平台 | `static.cloudflareinsights.com` | Cloudflare Web Analytics（RUM），由 CDN 侧自动注入 |

这些都是我自己开的、知道的。但列表最后一行是：

```
1x  browser-update.org  [script]  /update.min.js      ← 模板遗留
```

**这个我从来没开通过。**

## 意外发现：模板自带的「浏览器过旧」脚本

顺藤摸瓜，它在 `BodyThirdPartyScripts.astro` 里，是一段从上游模板继承下来的代码：

```js
var $buoop = { required: { e: -4, f: -3, o: -3, s: -1, c: -3 }, api: 2024.11, ... };
function $buo_f() {
    var e = document.createElement("script");
    e.src = "//browser-update.org/update.min.js";   // ← 每次访问都会请求它
    document.body.appendChild(e);
}
document.addEventListener("DOMContentLoaded", $buo_f, false);
```

它做的是「如果你的浏览器太旧，就弹一条提示」。听起来无害，代价是：**每个访客打开任何一个页面，都会向 `browser-update.org` 发一个请求**，连带把 IP、User-Agent、Referer 暴露给一个跟本站毫无关系的第三方。

而我这个站本来就需要现代浏览器（用到了 `:has()`、CSS 嵌套、`svh` 单位），旧浏览器打开本来就是「样式崩了」而不是「能看但别扭」——为了一条提示，多一个追踪面，不值。

删掉整块脚本和配套的 `.buorg` 样式（1833 字节），重新扫一遍：

![删除后：外部请求 30 → 29，域 15 → 14，browser-update.org 消失](/assets/images/posts/blog-third-party-audit/02-after.webp)

## 另一个发现：10 个请求只为了显示几个数字

审计里最扎眼的是这行：

```
10x  gateway-us.umami.is  [fetch]  /api/share/...  /api/websites/...
```

首页要显示「全站浏览量」和每篇文章的浏览量，而 Umami 的共享接口**没有批量查询**，只能一条路径一个请求：1 个全站 + 9 篇文章 = 10 个请求。

这是我在 [浏览量那篇](/posts/blog-view-counter/) 里做过的取舍：要连续的历史数字（Umami 从 2025 年就在记），就得接受 N+1 个请求。如果哪天更在意请求数，可以换成 `metrics?type=path` 一次拿全站 Top N —— 但那是 UV 口径，和现在展示的 PV 对不上。

写在这里是想说明：**第三方请求不只是"隐私问题"，也是"你自己设计的成本"**。审计时两种都要看。

## 隐私页现在写什么

删掉一个脚本之后，我把 `/privacy/` 的第三方清单补全了 —— 之前漏写的两个：

- **Cloudflare Web Analytics**：CDN 侧自动注入 `beacon.min.js`，不使用 Cookie，但会上报页面地址、加载耗时、浏览器信息；
- **TermsFeed**：同意横幅的脚本来源，以及它写入的 `cookie_consent_level`。

![隐私政策里的第三方清单：每一类都写明域名与用途](/assets/images/posts/blog-third-party-audit/03-privacy.webp)

原则很简单：**页面上跑了谁的代码，隐私政策里就要有谁**。列出域名比写「我们可能使用第三方服务」有用得多，因为访客可以直接对照自己浏览器的网络面板。

## 一份可以照抄的自查清单

1. **把第三方请求当成待办事项**：新装一个评论/统计/字体服务，就顺手跑一次审计；
2. **区分「我选的」和「模板带的」**：前者写进隐私政策，后者默认删掉再说 —— 需要再装；
3. **注意延迟加载**：等够时间（我用 9 秒）再统计，否则埋点会被漏掉；
4. **连 `fetch` 一起看**：很多追踪走的是 fetch，不是 `<script>`；
5. **头像、字体、图标也是第三方**：它们能看到访客的 IP 与 Referer；
6. **定期复查**：模板升级、插件更新都可能悄悄加回东西。

## 小结

静态博客的隐私优势是**真的**（没有后端、没有数据库、没有账号体系），但它不等于「零第三方」。这次审计最大的收获不是删掉了一个脚本，而是意识到：**你交付的页面是一个请求图，而不是一份 HTML**。那张图里有几个节点，值得你每隔一阵子数一遍。

审计脚本我留在本地工具目录里，以后每次加新服务都跑一次；目前第三方已经从 15 个域降到 14 个，剩下的每一个我都能说清它为什么存在。

第三方里最容易被忽略的是评论系统（见 [Giscus 那篇](/posts/blog-giscus-comments/)）；至于两套统计为什么数字不同，见[两套统计对比](/posts/blog-analytics-compare/)。

顺着「谁在收数据」再往下想一层，就是[我的博客向陌生人暴露了多少信息](/posts/blog-self-audit/)——证书日志、DNS、页面标识三层。
