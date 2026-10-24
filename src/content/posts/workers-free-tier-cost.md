---
title: Workers 免费额度够不够：算一笔真实账
published: 2026-10-05 22:20:00 +08:00
description: 「Workers 免费套餐每天 10 万次请求」这句话对静态站几乎无效——静态资源请求根本不参与计数。我把官方计费口径拆开，再抓包统计自己博客每次访问的真实请求构成，算出免费额度能撑多少 PV、什么情况下会先撞墙。
tags:
  - Cloudflare
  - 成本
  - 运维
pinned: false
draft: false
---

「Cloudflare Workers 免费套餐每天 10 万次请求」——这句话几乎每篇介绍 Cloudflare 的文章都会写一遍。但它对一个静态博客来说几乎是无效信息：**静态资源请求压根不参与这个计数**。

真正决定你能撑多少 PV 的，不是总请求数，而是**每次访问里有多少请求会落到 Worker 脚本上**。这篇文章不搬文档，只做两件事：把免费额度的口径拆清楚，然后用我自己博客的实测数据算一遍。

> [!NOTE]
> 前提：本站是 Astro 静态站，部署在 Cloudflare Worker `peroe-blog`（纯静态资源模式，`wrangler.jsonc` 里只有 `assets.directory` 和自定义域，没有 `main`、没有 `run_worker_first`），Cloudflare 免费套餐，没买 Argo 或 Pro。账号下还跑着另外两个 Worker：`cf-umami`（t.juluo.work，浏览量统计 + D1）和 `link-card`（icon.juluo.work）。本文所有数字来自公开计费规则 + 本机实测，我没有登录 Cloudflare 后台看计量数据（那需要账号权限，也看不到历史曲线）。

## 免费额度的口径：三个数字，只有一个跟静态站有关

先看官方定价页给免费套餐列的三项：

![Cloudflare Workers 定价页：免费套餐每天 10 万次请求、时长不计费、每次调用 10 毫秒 CPU；脚注 3 明确写着静态资源请求免费且不限量](/assets/images/posts/workers-free-tier-cost/01-cloudflare-workers-pricing-free-row.webp)

表格下面那几个小脚注才是真正的规则，比表格本身重要得多：

- **脚注 3：`Requests to static assets are free and unlimited.`** —— 静态资源请求免费且不限量。
- **脚注 1：Cloudflare 不为你 Worker 发出的子请求（subrequests）计费。**
- 定价页开头还有一句：Workers 不额外收流量（egress）和带宽（throughput）费用。

也就是说，「每天 10 万次」这个额度只对**会调用到 Worker 脚本的入站请求**生效。对纯静态站来说：HTML、CSS、JS、图片、甚至自定义 404 页面，全部走静态资源路径，一次都不计。

Static Assets 自己的 Billing 页把这条讲得更直白：

![Cloudflare Static Assets 的 Billing and Limitations 页：请求要么命中静态资源、要么调用 Worker 脚本，前者免费不限量；并警告用了 run_worker_first 之后超限会直接返回 429](/assets/images/posts/workers-free-tier-cost/02-cloudflare-static-assets-billing.webp)

请求要么命中静态资源、要么调用 Worker 脚本，只有后者按 Workers 定价计费；连「存储资产」都不额外收钱。另外还有两条跟套餐无关的平台限制要注意：**每个 Worker 版本最多 20000 个文件、单文件最大 25 MiB**——把图片全塞进仓库的话，这两条会比请求数更早成为约束。

还有一点常被忽略：10 万/天是**账号级**额度，不是每个 Worker 分一份。我账号下三个 Worker 共用同一个池子。

> [!WARNING]
> 这里有个容易翻车的例外：一旦用了 `run_worker_first`（让 Worker 脚本优先处理请求），匹配到的请求就**一定**会进脚本、一定计费；免费额度用完之后，这些请求直接返回 `429 Too Many Requests`，**不会退回静态资源**。所以「静态站随便跑」成立的前提，是你的配置里没有 `run_worker_first`。

## 我的站一次访问产生多少请求

口径清楚了，接下来是数数。我用 Chrome + Playwright 记录冷缓存加载过程中的全部网络请求（每次都用全新的浏览器 profile，避免本地缓存干扰），分别测了首页和一篇带评论区的文章页：

![Chrome + Playwright 抓包实测：首页 62 个请求里发往自己站点的 29 个都不经过 Worker 脚本，唯一计费的是发往 t.juluo.work 的那 1 个 /batch](/assets/images/posts/workers-free-tier-cost/04-requests-per-pageview-table.webp)

| 指标 | 首页 | 文章页 |
| --- | --- | --- |
| 总请求数 | 62 | 90 |
| 发往 blog.juluo.work | 29 | 32 |
| 发往 t.juluo.work（自建统计） | 1 | 1 |
| 传输体积 | 1153.7 KB | 1513.9 KB |

拆开看：

1. **发往自己站点的 29 个请求里，没有一个是 Worker 脚本调用**：1 个 HTML、2 个 CSS、18 个 JS，其余是页面加载后 `astro:prefetch` 预取的链接请求（RSS、归档、友链、站点地图这些）。它们全部命中静态资源，按上面的规则不计费，带宽也不计费。
2. **真正计费的只有 1 个请求**：`POST https://t.juluo.work/batch`。这是主题自带的浏览量排序脚本，首页和文章页各调一次，用来一次性拉回全站和各篇文章的阅读数。
3. **剩下的一大半请求发去了别人家的域名**：首页 32 个、文章页 57 个。图标走 `api.iconify.design`（一次首页 22 个、文章页 28 个 SVG，全站最「话痨」的一环），评论区走 `giscus.app`（文章页 17 个请求），统计走 `cloud.umami.is`，还有 QQ 头像、Cookie 同意横幅、浏览器升级提示。这些跟我的额度无关——**花的是别人家的钱**。

所以对**我这个站**来说，结论很干净：**一次浏览 = 1 个 Workers 请求**。

## 那 10 万/天能撑多少 PV

一个除法：`100000 ÷ 1 = 100000 PV/天`，约每月 300 万 PV。

这个量级对个人博客是什么概念？本站上线到现在，自建统计里的浏览量还是 `0`（下一节会讲为什么）。哪怕按「一天一千 PV」这种对个人博客已经算热闹的量来算，也只用到额度的 1%。

但这里有个更重要的推论：**先撞墙的不是博客本体，是统计服务**。博客本体跑在静态资源模式上，理论上请求数无限；而 t.juluo.work 每被浏览一次就消耗一个额度。真到额度见底那天，博客还能照常打开，只是浏览量数字不动了——这其实是个挺健康的失效模式。

再往后才是 D1 的账。D1 免费套餐是「每天 500 万行读、10 万行写、5 GB 存储」，跟 Workers 请求数是两套独立池子。如果 `POST /send` 每次写入 1 行，那 10 万行写/天对应的正好也是 10 万 PV/天，两块额度会一起见底。真正需要盯的是**行读**：官方对「行读」的定义是「查询扫描了多少行」，全表扫描时表里有多少行就算多少行。如果 `/batch` 随着文章变多退化成扫描，表越大、每次浏览消耗的行读越多，天花板就会从 10 万 PV 一路往下掉。这一条我在外部看不到计量数字（要登录后台看 D1 的 Row Metrics），所以只能当提醒，不当结论。

## 什么情况下会撞墙

把「什么时候免费额度不够用」列成一张判断表，比背数字有用：

| 你往站里加了什么 | 每 PV 计费请求 | 理论上限 |
| --- | --- | --- |
| 现在这样（纯静态 + 统计 `/batch`） | 1 | 10 万 PV/天 |
| 真正接上 `tracker.js` 上报（每 PV 多 1 次 `POST /send`） | 2 | 5 万 PV/天 |
| 再加上 `tracker.js` 不吃缓存（`/send` + `tracker.js`） | 3 | 3.3 万 PV/天 |
| 开 `run_worker_first`，静态请求也进脚本 | +30 左右 | 3 千 PV/天 |
| 加 SSR 页面 / 实时接口 | 每个动态请求 1 个 | 看动态请求占比 |

最后两行是重点：**静态站之所以「不花钱」，不是因为请求少，而是因为请求走对了路径**。一旦引入 SSR、搜索接口、点赞、动态 OG 图这类东西，数字会立刻变得敏感。

另外两个限制跟容量无关，但会先把你卡住，值得单独记住：

- **CPU 时间 10 毫秒/次调用**。注意 CPU 时间只算真正在跑的代码，等 D1、等上游 `fetch` 的 I/O 等待不算——所以「查一次数据库」通常不等于「烧掉 CPU」。真正吃 CPU 的是密码学运算、大 JSON 序列化、图片处理这一类。
- **超限之后的行为**，官方在限制页写得很清楚：

![Cloudflare Workers 限制页 Daily requests 段落：免费套餐每天 10 万次请求、UTC 零点重置，超出返回 Error 1027，路由分 Fail open 与 Fail closed 两种行为](/assets/images/posts/workers-free-tier-cost/05-cloudflare-daily-limit-1027.webp)

免费套餐的 10 万/天按 UTC 零点重置，超出后返回 `Error 1027`；路由配成 Fail open 会绕过 Worker（当作没配 Worker 处理），Fail closed 则直接返回 1027 错误页。对静态站来说这是好消息：静态资源那条路根本不经过这个判断。

## 我踩到的坑

### 1. 统计接口返回的全是 0

我用 curl 直接问自建统计服务：

![本机 curl 实测：/share 与 /batch 返回的浏览量全是 0，以及 blog.juluo.work 上 282 KB CSS 的响应头和 If-None-Match 重发结果](/assets/images/posts/workers-free-tier-cost/03-umami-share-batch-curl.webp)

```bash
# 单个路径查询
curl -s "https://t.juluo.work/share?pathname=/"

# 批量查询（正文是裸数组，不是对象）
curl -s -X POST "https://t.juluo.work/batch" \
  -H "Content-Type: application/json" \
  --data-binary '["/","/archive/"]'
```

`GET /share?pathname=/` 返回 `{"pathname":"/","views":0}`，`POST /batch` 返回 `[0,0]`，换七八个路径全都是 0。一开始我以为 D1 挂了，查下来是另一回事：**接口是好的，只是没人往里写**。站点前台引的是 Umami Cloud 的 `script.js`，自建的 `tracker.js` 没有被任何页面引用——这套自建统计目前「只有读、没有写」，读接口还跑得挺勤。

> [!TIP]
> 踩这个坑的时候顺手发现：`/batch` 的请求体是**裸 JSON 数组**（`["/","/archive/"]`），不是 `{"pathnames":[...]}`。用对象去请求会返回 `{"ok":false,"error":"expected_array"}`——错误码其实直说了要数组，但如果你像我一样先写成 `{"pathnames":[...]}`，还是得愣一下才反应过来。

这个坑跟计费直接相关，也是我最想吐槽的一点：**我现在每次浏览都在白花一个请求额度**——首页那个 `/batch` 吭哧读半天，读出来全是 0。修法很简单（把 `tracker.js` 引到 Layout 里），但我打算先留着：一是现在没什么读者不值得上报，二是想先观察 D1 行读的增长曲线，等有真实流量了再接。

### 2. 用 `curl -I` 探活会误判

`curl -I https://t.juluo.work/tracker.js`（HEAD 请求）返回 **404**，而换成 `curl -s -D - -o NUL`（GET）返回 **200**。这个 Worker 只处理 GET，HEAD 直接落到 404 分支。我差点据此判断「tracker.js 不存在」，实际上它好好地在那儿：`Content-Length: 801`、`Cache-Control: public, max-age=3600`。**探活请用 GET。**

### 3. 282 KB 的 CSS 每次都会重发一遍

`/_astro/MainGridLayout.*.css` 有 **288727 字节**（282 KB），响应头是 `Cache-Control: public, max-age=0, must-revalidate`。我拿着 ETag 用 `If-None-Match` 再请求一次，返回的仍然是 `200 OK` + 完整的 288727 字节，**没有 304**。

从计费角度看这无所谓——静态请求和带宽都免费，多传几次 Cloudflare 也不会多收一分钱。但对国内读者来说，每次站内跳转都要重新拉一遍 282 KB 的 CSS，体验损耗是实打实的。真要优化，方向是给 `_astro/*` 加长缓存（Assets 支持 `_headers` 文件），而不是去省请求数——**在免费额度这件事上，带宽和静态请求是最不该被优化的东西**。

## 小结

- 「每天 10 万次请求」这个口径对静态站基本无效：静态资源请求免费且不限量，带宽也不计费。要数的只有**落到 Worker 脚本上的请求**。
- 实测本站：首页 62 个请求、文章页 90 个，其中计费的都只有 1 个（自建统计的 `/batch`）。理论上限 10 万 PV/天，而且先见底的是统计服务，不是博客本体。
- 判断自己的站会不会撞墙，一个式子就够：`PV 上限 ≈ 100000 ÷ 每 PV 落到 Worker 的请求数`，分子还要被账号下其它 Worker 分掉。
- 最容易翻车的不是流量涨了，而是你往静态站里塞了动态的东西：`run_worker_first`、SSR、实时接口。摸清请求路径，比记住额度数字有用得多。
- 免费额度之外，先卡住我的更可能是「每个版本 2 万个文件」和「单文件 25 MiB」这两条静态资源平台限制——这一点等配图多起来再单独验证。

额度之外，另一个常被低谷的成本是流量：[三层缓存](/posts/blog-cache-layers/)里把哈希资源改成永久缓存，就是为了少发请求。
