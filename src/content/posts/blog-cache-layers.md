---
title: 三层缓存各自为政：我的静态资源被一行 Cache-Control 拖慢
published: 2026-10-24 20:40:00 +08:00
updated: 2026-10-24 20:40:00 +08:00
description: 浏览器缓存、Cloudflare 边缘缓存、源站响应头三层叠在一起时，谁说了算？抓自己站的真实响应头发现：连内容哈希命名的 CSS/JS 都是 max-age=0，每次访问都要重新验证。附发现过程、Cloudflare 规则写法和免费套餐的坑。
tags:
  - 建站
  - 性能
  - 缓存
image: ""
pinned: false
lang: ""
draft: false
---

缓存这件事最容易产生「我以为」：以为 CDN 会缓存、以为浏览器会记住、以为 max-age 越大越好。真正会发生什么，只能看响应头。

我写了个脚本抓自己站的缓存头，第一遍就发现：**连文件名带内容哈希的 CSS/JS，都被设成了 `max-age=0`。**

![抓包结果：所有资源都是 max-age=0, must-revalidate](/assets/images/posts/blog-cache-layers/01-before.webp)

## 三层缓存，各管一段

一个静态站请求要走三层，每层的依据不同：

| 层 | 依据 | 看什么 |
| --- | --- | --- |
| 浏览器 | `Cache-Control` / `ETag` / `Last-Modified` | 要不要发请求、发条件请求还是全新请求 |
| Cloudflare 边缘 | 自己的缓存规则 + 源站头 | `cf-cache-status: HIT/MISS`、`age` |
| 源站（Worker 静态资源） | 部署时生成的头 | 上面的 `Cache-Control` 就是从这一层出来的 |

关键点：**浏览器和边缘看的是同一行 `Cache-Control`，但它们的判断逻辑不同**。Cloudflare 会把 `max-age=0` 的资源也缓存（`cf-cache-status` 照样 HIT，它靠自己的 TTL 与 revalidate 策略），而浏览器则会老老实实每次都回来问一句。

## 问题：哈希命名的资源也被设成 max-age=0

我的构建产物是这样的：

```
/_astro/MainGridLayout.C94uCSmW.css   ← 文件名里的 hash 就是内容指纹
/_astro/page.DkKPsu5I.js
```

这种命名方式天然支持永久缓存：**内容一变，文件名就变，旧文件永远不会被误用**。合理的头是：

```
Cache-Control: public, max-age=31536000, immutable
```

但实际抓到的全是：

```
Cache-Control: public, max-age=0, must-revalidate
```

这行对 HTML 是对的（内容会变，必须验证），对哈希资源就是浪费：**每次进页面都要回源验证一遍 CSS/JS**，即使它们一年都不会变。

另外还发现：**HTML 页面没有 ETag**（`/`、文章页都没有），意味着连"条件请求省流量"的机会都没有 —— 每次导航都是全新下载。而 `robots.txt`、`sitemap.xml`、CSS、JS 都有 ETag，带 `If-None-Match` 会正确返回 304。

## 修法：给 /_astro/ 单独加一条响应头规则

源站是 Cloudflare Workers 的静态资源模式，我改不了它的默认头。但 Cloudflare 的 **Response Header Transform** 规则可以覆盖：

```
表达式：starts_with(http.request.uri.path, "/_astro/")
动作：  set cache-control = public, max-age=31536000, immutable
```

用 API 一秒钟就能建好：

```bash
curl -X PUT \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/rulesets/phases/http_response_headers_transform/entrypoint" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data-binary @rule.json
```

```json
{
  "rules": [{
    "action": "rewrite",
    "action_parameters": {
      "headers": { "cache-control": { "operation": "set", "value": "public, max-age=31536000, immutable" } }
    },
    "expression": "starts_with(http.request.uri.path, \"/_astro/\")",
    "description": "Astro build assets immutable cache"
  }]
}
```

生效后的实测：

![改后：CSS/JS 变成一年 immutable，HTML 与 robots 保持 max-age=0](/assets/images/posts/blog-cache-layers/02-after.webp)

```
/_astro/*.css  -> cache-control: public, max-age=31536000, immutable
/_astro/*.js   -> cache-control: public, max-age=31536000, immutable
/              -> Cache-Control: public, max-age=0, must-revalidate
/robots.txt    -> Cache-Control: public, max-age=0, must-revalidate
```

HTML 保持 `max-age=0` 是**故意的**：页面内容每天都在变，用 ETag 验证比"缓存十分钟"更安全。

## 两个平台细节（写规则前值得知道）

**1. 免费套餐不能用正则。** 我第一版写的是 `http.request.uri.path matches "^/_astro/"`，直接被拒：

```
not entitled: the use of operator Matches is not allowed,
a Business plan or a WAF Advanced plan is required
```

换成 `starts_with(...)` 就行 —— 对路径前缀判断来说完全够用。

**2. 规则只对「到达边缘的请求」生效。** 如果资源本身被浏览器缓存着（同一个 URL、未过期），请求根本不会到 Cloudflare，规则也就无从生效。所以验证时要么换 URL（构建产物 hash 变了自然会换），要么在 DevTools 里勾"Disable cache"。

![这些页面的 CSS/JS 现在会被浏览器缓存一年，不再每次回源验证](/assets/images/posts/blog-cache-layers/03-site.webp)

## 一套可以照抄的判断表

| 资源 | 建议的 Cache-Control | 原因 |
| --- | --- | --- |
| 哈希命名的构建产物（`/*.abc123.css`） | `public, max-age=31536000, immutable` | 内容变则文件名变，永久缓存安全 |
| HTML | `public, max-age=0, must-revalidate` + ETag | 内容常变，靠 ETag 走 304 |
| 不哈希的图片 | `public, max-age=86400` 以上 | 很少变；换图时改文件名 |
| robots / sitemap / RSS | `max-age=0` 或按更新频率 | 搜索引擎需要拿到最新内容 |

## 小结

缓存不是"设一个数"就完事，而是三层各自判断的结果。这次改动很小（一条规则、两个表达式），但它解释了为什么我的**第二次访问**和第一次一样慢 —— 浏览器从来没记住过那些哈希资源。

验证缓存改动只需要两个动作：**抓两遍响应头**（看 `Cache-Control` 与 `cf-cache-status`）、**发一次条件请求**（看是否 304）。两个都符合预期，才算真的缓存上了。
