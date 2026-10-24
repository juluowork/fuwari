---
title: 我的博客响应头缺了什么：Cloudflare _headers 补课记
published: 2026-10-05 21:35:00 +08:00
description: 用 securityheaders.com 体检博客，结果是 F：六个安全头全缺。这篇记录实测现状，讲清每个头的作用与副作用，并给出 Cloudflare Workers 静态资源用 public/_headers 补头的方案。
tags:
  - 安全
  - Cloudflare
  - 运维
pinned: false
draft: false
---

博客迁到 Cloudflare Workers 之后，我一直只关心两件事：能不能打开、快不快。直到有人看了我的站说了一句「你这响应头挺干净的」——干净有时候不是夸奖。去 `securityheaders.com` 跑了一遍，评分直接是 **F**。

这篇文章把体检结果、六个缺失的头分别管什么、以及我准备怎么补，一次讲完。

> [!NOTE]
> 站点环境：Astro 静态站，部署在 Cloudflare Worker `peroe-blog`（静态资源模式，免费套餐，没买 Argo / Pro），域名 `blog.juluo.work`，构建由 Workers Builds 从 GitHub 仓库拉 main 分支跑 `pnpm update-diff && pnpm astro build --force`。
> 所有检测数据都是 **2026-10-05 晚本机实测**。**本文发布时这些响应头还没有应用**，所以文中只有 before 的真实数据；after 部分给的是方案和验证方法，需要照步骤做完自己复检。

## 为什么静态站最容易漏掉这一环

静态站很容易让人产生一种错觉：我只是一堆 HTML 和图片，没有数据库、没有登录、没有后端逻辑，能有什么安全问题？

问题在于，**安全响应头管的从来不是服务器，而是浏览器**。服务器已经正确返回了内容，浏览器接下来怎么解释这些内容、允不允许别人嵌套、要不要带着 Referer 跑去外站——这些决定权在响应头手里，而 Cloudflare 不会替你写。

三条常见路线，我对比过：

1. **Cloudflare 控制台的 Transform Rules**（Modify Response Header）。不用改代码，点点鼠标就行。但配置只活在控制台里，不进仓库、不能 review、换账号就没了；免费套餐的动态规则条数也紧张。
2. **在 Worker 里包一层 fetch，手动 `headers.set()`**。最灵活，但对一个纯静态站来说，为了加几个响应头把整个静态资源链路接管一遍并不划算。
3. **在静态资源目录放一个 `_headers` 纯文本文件**。跟仓库走、跟构建走、可 diff、可回滚，Workers 静态资源原生支持。

我选第 3 条，理由很简单：这个站的部署方式是「push 到 main → Cloudflare 构建 → wrangler deploy」，配置也应该在这个链路里，而不是散落在控制台。

## 实测：securityheaders.com 给了 F

直接看结果：

![securityheaders.com 对 https://blog.juluo.work 的完整报告，评级 F，六个安全头全部缺失](/assets/images/posts/security-headers-audit/01-securityheaders-grade-f.webp)

报告时间是 05 Oct 2026 13:10:38 UTC，扫的是 `https://blog.juluo.work/`。六个红叉分别是：

| 缺失的头 | 报告里的建议值 |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Content-Security-Policy` | 按站点内容自行声明 |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` / `strict-origin-when-cross-origin` |
| `Permissions-Policy` | 按需关闭不用的浏览器特性 |

报告底部还有一块 **Upcoming Headers**，列着 `Cross-Origin-Embedder-Policy`、`Cross-Origin-Opener-Policy`、`Cross-Origin-Resource-Policy` 三个头。它们目前不计入扣分，我也没打算上：COEP / COOP 一开严格模式，站外图片和第三方 iframe 很容易一起挂掉，收益（启用 `SharedArrayBuffer` 之类）个人博客用不上。

再用 curl 自己确认一遍，毕竟第三方工具的结论我得自己复现：

![在本机 PowerShell 里用 curl 查看 blog.juluo.work 的真实响应头，并用 Select-String 统计安全头命中数为 0](/assets/images/posts/security-headers-audit/02-curl-response-headers.webp)

真实输出里跟安全相关的头命中数是 **0**。响应里确实有一堆头，但仔细看全是 Cloudflare 自己的东西：

- `Server: cloudflare`、`CF-RAY: ...`、`CF-Cache-Status: HIT` —— 这是「谁在处理请求」，不是安全策略。
- `Nel` / `Report-To` —— 网络错误上报（Network Error Logging），属于**可观测性**头。它们让浏览器把网络故障上报给 Cloudflare，跟「防不防 XSS / 点击劫持」没有半点关系。
- `Cache-Control: public, max-age=0, must-revalidate` —— 这是 Workers 静态资源的默认缓存策略，跟安全无关（后面还会用到它）。
- `alt-svc: h3=":443"` —— 告诉浏览器可以走 HTTP/3。

所以「响应头列表很长」这件事本身很有欺骗性。

另外我顺手测了一下明文 HTTP：

```powershell
curl.exe -s -o NUL -w "final_code=%{http_code} redirects=%{num_redirects} url=%{url_effective}`n" -L --noproxy "*" http://blog.juluo.work/
# final_code=200 redirects=0 url=http://blog.juluo.work/
```

`redirects=0`，明文 HTTP 直接返回 200，站点**没有强制跳转 HTTPS**。这一条在后面的 HSTS 部分很关键。

## 逐个头过一遍：作用、副作用、我的取舍

### Strict-Transport-Security（HSTS）：最容易误伤的一个

HSTS 的作用是告诉浏览器「这个域以后只准走 HTTPS」，浏览器会把这个策略缓存下来，在有效期内把所有 `http://` 请求在本地就改写成 `https://`。它挡的是降级攻击和 Cookie 劫持——一个中间人可以篡改明文 HTTP 响应里的跳转，把你按回 HTTP，而 HSTS 让浏览器压根不发那次明文请求。

但 HSTS 有个前提常被忽略：**它只管「以后的访问」，不管「第一次访问」**。第一次访问如果还是明文，攻击者照样有机会。所以 HSTS 必须和「强制跳转」配合用——先让服务器 301 到 HTTPS，再加 HSTS 头。我现在的状态正好是两样都缺，去 `hstspreload.org` 查 `juluo.work` 的结果很直白：

![hstspreload.org 查询 juluo.work 的结果：未进入预加载列表，两条错误分别是缺少 HSTS 头和 HTTP 不跳转 HTTPS](/assets/images/posts/security-headers-audit/03-hsts-preload-status.webp)

两条错误：`No HSTS header`，以及 `HTTP does not redirect to HTTPS`。这跟我上面 curl 测到的 `redirects=0` 完全对得上。

副作用和坑：

- **`includeSubDomains` 是一个「域级」承诺**。给 `blog.juluo.work` 加，覆盖的是 `blog.juluo.work` 及其子域，我这边没有别的子域，安全。但如果直接给裸域 `juluo.work` 加 `includeSubDomains`，那么 `t.juluo.work`（自建统计）、`icon.juluo.work`（链接卡片）必须都能正常走 HTTPS，否则会一起被打死——而且是浏览器缓存级别的打死，你改回来用户也进不去。
- **`preload` 千万不要随手加**。一旦提交进 Chrome 的预加载列表，撤销要走 removal form 并等好几个月；而且预加载是硬失败：证书一过期，浏览器直接报错，没有「继续访问」的按钮。`hstspreload.org` 页面自己也写着 Preloading Should Be Opt-In，还专门劝项目维护者别默认给用户开。
- **`max-age` 分级爬**。官方建议 300 秒 → 86400 秒 → 31536000 秒这样往上加，每一级观察一阵。我打算先在 `_headers` 里写 `max-age=300` 跑一天，确认没有意外再改大。

我的结论：HSTS 该上，但顺序是「先在 Cloudflare 开 Always Use HTTPS（SSL/TLS → Edge Certificates）→ 观察一天 → 再加 `max-age=300` 的 HSTS → 稳定后爬到一年」。`preload` 暂时不碰。

### Content-Security-Policy：唯一需要认真做功课的

CSP 是这六个头里最强大的，也是最容易把站点搞坏的。它用一组指令限定页面能加载哪些来源的脚本、样式、图片、iframe，是 XSS 的最后一道防线——就算某天引用的第三方脚本被投毒，浏览器也会拒绝执行不在白名单里的东西。

我为什么不直接抄一份「满分 CSP」？因为 **Astro 生成的页面里有大量内联脚本**。我数了一下自己的文章页，内联 `<script>` 有 21 个（主题切换、代码高亮、评论加载、统计初始化都是内联的）。这意味着 `script-src 'self'` 一加下去，页面立刻半死。

摆在面前的是两条路：

- 加 `'unsafe-inline'`：页面能跑，但 CSP 对 XSS 的防护基本归零，等于花钱买了个装饰品。
- 上 nonce / hash：静态站的页面是构建期生成的，nonce 需要运行时注入，得改成 Worker 渲染或者加构建插件，为一个响应头重构整站，不划算。

所以我选**分期**：第一期只上「结构性」指令，这几条不涉及内联脚本，几乎零误伤：

```txt
Content-Security-Policy-Report-Only: default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'
```

`object-src 'none'` 挡 `<object>`/`<embed>` 注入，`base-uri 'self'` 挡 `<base>` 标签劫持，`frame-ancestors 'self'` 挡 iframe 嵌套。先用 `Report-Only` 跑一周，在浏览器 Console 里看有没有误报，确认干净了再换成强制模式、再逐步往 `script-src` / `connect-src` 收紧。

顺便记一下我扒自己页面得到的外域清单，将来收紧 CSP 时要用：`cloud.umami.is`（Umami 统计脚本 + `<link rel="preconnect">`）、`giscus.app`（评论 iframe 和 `client.js`）、`t.juluo.work`（自建浏览量接口）、`q2.qlogo.cn`（头像）、`cdn.jsdelivr.net` 等。也就是说真要写全量 CSP，`connect-src` 里必须有 `t.juluo.work`，`frame-src` 里必须有 `giscus.app`，`img-src` 得放开 `https:`（随机图和链接卡片封面来自站外）。这类清单只能从自己页面里扒，抄别人的一定漏。

### X-Frame-Options：和 CSP 重复，但还得留

作用是禁止别人用 `<iframe>` 把你的站嵌进去做点击劫持——把博客套在一个透明层下面，诱导用户点「发布」「删除」之类的按钮。我的站没有这类操作按钮，风险不高，但成本也接近零。

`SAMEORIGIN`（允许同源嵌套）比 `DENY` 温和一点，留了余量。副作用是：如果你哪天想在自己的另一个域上 iframe 这个博客，会被自己挡住。

需要注意它和 CSP 的 `frame-ancestors` 是**功能重叠**的：现代浏览器以 `frame-ancestors` 为准，`X-Frame-Options` 主要是给老浏览器兜底。两个都写不冲突，但值必须一致（都 `SAMEORIGIN`），否则一个说允许一个说禁止，排查起来很折磨。

### X-Content-Type-Options：六个里最没争议的一个

只有 `nosniff` 一个合法值。作用是禁止浏览器「嗅探」内容类型：如果一个 `.txt` 文件里写着 HTML，浏览器不应该把它当 HTML 执行，而应该老老实实按服务器给的 `Content-Type` 处理。挡的是利用 MIME 嗅探的上传型 XSS。

它唯一的「副作用」场景是：**如果你服务器把 Content-Type 配错了，以前靠嗅探还能歪打正着跑起来，加了 nosniff 之后会直接白屏**（比如 `.js` 被标成 `text/plain`，浏览器直接拒绝执行）。

我实测过自己的静态资源，Cloudflare 是按扩展名给的，`/_astro/fancybox.DJVvVWuI.css` 返回 `text/css`，`Layout.astro_astro_type_script_index_0_lang.DYXp3ISy.js` 返回 `text/javascript`，都是对的，所以这个头我加得毫无心理负担。

### Referrer-Policy：把默认行为写死

它控制页面跳转到外站（以及加载外站资源）时，`Referer` 里带多少信息。不写的话，现在的浏览器默认已经是 `strict-origin-when-cross-origin`：同源带完整路径，跨域只带域名。

那我为什么还要显式写一遍？两个理由：一是把行为**钉死**，不依赖浏览器默认值会不会变；二是防止被别的层（CDN 规则、第三方脚本）覆盖掉。代价是：如果你靠 `document.referrer` 做站外来源分析，跨域场景只能拿到 origin，拿不到具体路径——不过默认值本来也是这样，所以这个头基本是零成本的。

### Permissions-Policy：关掉用不到的浏览器能力

用一个头批量关掉定位、麦克风、摄像头、支付、USB 这些 API：

```txt
Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()
```

空括号 `()` 表示「谁都不允许」，是最严格的写法。副作用很直接：**关掉之后你自己的页面也用不了**。如果哪天想在文章里嵌一个需要定位的演示，就得回来改这个头。所以我只关了我百分百确定用不到的几项，没有照抄那种几十项的清单。它也不像 `nosniff` 那样零成本，属于「想清楚再关」。

## 方案：一个 public/_headers 文件

最终要写进仓库的就是这个文件：

![准备写入 public/_headers 的内容，分两阶段：先上五个基本无副作用的安全头，CSP 先用 Report-Only 跑一周](/assets/images/posts/security-headers-audit/04-headers-file.webp)

```txt
# public/_headers —— Cloudflare Workers 静态资源的自定义响应头
# Astro 构建时 public/ 会原样复制到 dist/，Workers 解析这个文件并改写响应头
# （文件本身不会被当作静态资源下发，站点里看不到它）

# 第 1 阶段：先上 5 个基本没有副作用的安全头
/*
  Strict-Transport-Security: max-age=300; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()
  X-Frame-Options: SAMEORIGIN

# 第 2 阶段：CSP 先用 Report-Only 跑一周，确认没有误伤再转正
/*
  Content-Security-Policy-Report-Only: default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'

# 顺手的收益：_astro/ 下的产物文件名带内容哈希，可以放心 immutable
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
```

几个设计说明：

**为什么放 `public/`。** `wrangler.jsonc` 里是 `assets.directory = ./dist`，而 Astro 会把 `public/` 下的文件原样复制进 `dist/`，所以 `dist/_headers` 正好落在静态资源根目录。部署链路一个字都不用改，`npx wrangler deploy` 会把它一起带上去。

**HSTS 先写 300 秒。** 这就是上面说的分级爬坡，验证没问题再改成 `31536000`。

**`/_astro/*` 那条不是安全头，是顺手捡的收益。** 现在我的资源全是 `Cache-Control: public, max-age=0, must-revalidate`，虽然带 `ETag` 不会重复下载内容，但每次导航仍要走一次条件请求。实测 `MainGridLayout.BQV2WkRb.css` 有 288727 字节（约 282 KB），文件名里带内容哈希（`BQV2WkRb`）意味着内容一变文件名就变，可以放心 `immutable`。

**别把这条件加到 HTML 上。** HTML 保持默认的 `max-age=0, must-revalidate`，否则发新文章读者看不到。

> [!WARNING]
> `_headers` 只对**静态资源响应**生效，对 Worker 代码生成的响应**无效**。我另外两个服务——`t.juluo.work`（自建统计 Worker + D1）和 `icon.juluo.work`（链接卡片 Worker）——都是脚本模式，响应是代码里 `new Response()` 出来的，`_headers` 管不到它们，只能在 Worker 里手动 `headers.set()`。这一点官方文档写得很明确，别以为放个文件就全站生效了。

规则本身的几个细节（我对着官方文档核过）：

- 一个块 = 第一行是路径模式（`/`、`/path/*`，也支持写完整 URL），下面缩进的行是 `名字: 值`。
- 一个文件最多 100 条规则，每行含空格在内上限 2000 字符。
- 多个块命中同一个请求时，头会**合并**；同一个头被写了两次，值用逗号拼接。
- 想**删掉**某个头（默认头或者更宽规则加上的），用 `! 头名` 的写法。
- 匹配支持 `*` 通配（整个模式只能有一个）和 `:placeholder`，匹配到的值可以在头值里用 `:splat` / `:placeholder` 引用。

## 怎么验证

下面几步我没法替你跑（文件还没提交上去），只能给出 after 的验证方法：

```bash
# 1. 看完整响应头，预期多出 5 个新头
curl -sI https://blog.juluo.work/

# 2. 只筛安全头，预期有输出（现在是空）
curl -sI https://blog.juluo.work/ \
  | grep -iE 'strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy'

# 3. 确认 HTTP 是否跳转（先在 Cloudflare 开 Always Use HTTPS）
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://blog.juluo.work/

# 4. 复检评分
#    https://securityheaders.com/?q=https%3A%2F%2Fblog.juluo.work&followRedirects=on
```

第 2 步在我本地现在**是空输出**，第 3 步现在返回 `200`（`redirects=0`）。做完之后这两步应该分别变成「有输出」和 `301`。Windows 上没有 `grep`，我是用 PowerShell 的 `Select-String` 做的等价统计（就是前面第二张截图里那条命令，结果是 `0`）。

## 踩坑与注意事项

- **坑 1：以为上了 Cloudflare 就有安全头。** Cloudflare 免费套餐默认只加 `Nel`、`Report-To`、`Server`、`CF-RAY`、`alt-svc` 这些它自己的头，六个安全头一个都不加。这些是「可观测性头」和「传输协商头」，不是「安全头」，别被响应头列表的长度骗了。
- **坑 2：securityheaders.com 到底扫的是 HTTP 还是 HTTPS。** 我第一次直接在输入框填了域名，它按 `http://blog.juluo.work/` 扫的（报告里 Site 那一行会写出来）。后面加上 `followRedirects=on`、并且显式写 `https://`，报告才是你真正想要的那份。两次结果的评级都是 F，但缺的头数量不一样（HTTP 那份是 5 个，HTTPS 那份是 6 个，多了 HSTS），很容易看错。
- **坑 3（差点踩）：`includeSubDomains` 之前先数一遍子域。** 我在 `blog.juluo.work` 上写是安全的；但如果图省事直接给裸域 `juluo.work` 写 `includeSubDomains`，而某个子域还跑在 HTTP 上，那就是浏览器缓存级别的打死，改回来也进不去。
- **坑 4：CSP 不能直接上强制模式。** 静态站的页面是构建期生成的一大坨内联脚本，`script-src 'self'` 下去评论区和统计会立刻全灭。必须 `Report-Only` 先跑，看 Console 报错清单。
- **坑 5：`immutable` 别加错地方。** 只给带内容哈希的 `/_astro/*`，HTML 保持默认。加错到 HTML 上读者会一直看到旧页面，而且因为自己浏览器强刷而不复现，特别难排查。

## 小结

- **现状（实测）**：六个安全头全缺，`securityheaders.com` 给 F，`http://blog.juluo.work/` 明文返回 200 不跳转，`juluo.work` 不在 HSTS 预加载列表里。
- **值得马上补的四个**：`X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`、`Permissions-Policy`。几乎是纯收益，副作用可以忽略。
- **HSTS 要配合强制跳转一起上**，`max-age` 从 300 秒分级爬，`preload` 现阶段别碰。
- **CSP 是唯一需要认真做功课的**：先用 `Report-Only` + 结构性指令，等内联脚本清理干净了再收紧。
- **Cloudflare Workers 静态资源站，`public/_headers` 是成本最低、最可回滚的做法**：跟仓库走、跟构建走、能 diff 能 review。但它只管静态资源，Worker 生成的响应还得在代码里加。

本文发布时站点还没有应用这些头，after 数据都是方案说明而不是实测结果。照上面四条命令复检即可。

配合 HTTPS 配置的 [SSL Labs 评分](/posts/ssllabs-https-grade/)一起看，安全审计的两块就齐了。
