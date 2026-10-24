---
title: 我的博客向陌生人暴露了多少信息
published: 2026-10-24 21:20:00 +08:00
updated: 2026-10-24 21:20:00 +08:00
description: 静态博客没有后端，但公开面比想象的大：证书透明度日志能翻出 13 个子域、DNS 里有 DKIM 与验证记录、页面里带着统计 ID 和联系方式。这篇把三层公开面逐一查清，并修掉了其中一个真正的问题（头像外链 107KB）。
tags:
  - 建站
  - 安全
  - 隐私
image: ""
pinned: false
lang: ""
draft: false
---

写上一篇[第三方请求审计](/posts/blog-third-party-audit/)时我意识到一件事：**「我的站」暴露的不止是页面内容**。任何人只要会 `curl`、会查 DNS、会搜证书日志，就能拼出一张比你想象中完整的地图。

这篇把三层公开面逐一查了一遍，最后修掉了一个真问题。

## 第一层：证书透明度日志

每次给域名签证书，签名记录都会进 CT 日志，而且**永久公开**。查一下 `juluo.work`：

![crt.sh 能翻出 13 个子域，包括早就没用的测试子域](/assets/images/posts/blog-self-audit/01-subdomains.webp)

翻出来 18 个名字，去掉泛域名后是 13 个具体子域：`api`、`dak`、`docker`、`dok`、`git`、`hd`、`ht`、`mail`、`p`、`t`、`blog`、`send`，还有一个 `juluo.juluo.work`。

这些里有一半是**早就删掉的测试子域**（`docker`、`dok`、`dak`、`hd`、`ht`）—— 我从来没主动公开过它们，但它们躺在 CT 日志里，任何人都能查到，并且可以顺手扫一遍。

⚠️ 更要紧的是：扫出来之后**能不能被打**。我给每个名字都 `dig` 了一遍：

```
全部都有解析 —— 都走 *.juluo.work 的通配符，指向优选域名
```

也就是说，扫 `docker.juluo.work/.env` 这种请求**不会得到 NXDOMAIN**，而会打到我的边缘节点上。这解释了 Cloudflare 日志里那些每天几十次的 `/.env`、`/.ssh/id_rsa` 探测（全部 403）。**通配符 DNS 让扫描器把每一个名字都当成活主机。**

## 第二层：DNS 里的"业务指纹"

DNS 是公开数据库。翻一遍 TXT / MX，能看出你用了哪些服务：

| 记录 | 能看出什么 |
| --- | --- |
| `MX juluo.work → route1-3.mx.cloudflare.net` | 邮件走 Cloudflare Email Routing |
| `MX send.juluo.work → feedback-smtp...amazonses.com` | 发信用 Amazon SES |
| `TXT resend._domainkey` / `cf2024-1._domainkey` | 同时接过 Resend 与 Cloudflare 发信 |
| `TXT _dmarc → p=none` | **只监控不拦截**（下一步该收紧） |
| `TXT google-site-verification` / `edgeonereclaim` / `_esaauth` | 接过 Google 站长、腾讯 EdgeOne、阿里 ESA |

这些都不算"泄露"，但它们是**基础设施指纹**：一个熟练的人看完就知道你的邮件怎么发、CDN 用了几家、验证过哪些平台。

## 第三层：页面本身

页面是最容易被忽略的一层 —— 它对外**主动**发出信息。

![页面里能直接读到的标识：QQ 号、统计 ID、外链头像 107KB](/assets/images/posts/blog-self-audit/02-identifiers.webp)

| 项 | 值 | 是否算问题 |
| --- | --- | --- |
| QQ 号 | `wpa.qq.com/msgrd?...&uin=1576586736` | 联系方式，**本来就公开**（我主动放的） |
| GA4 ID | `G-C3WKKH0NPV` | 公开无妨（只能往里灌垃圾数据） |
| Umami 站点 ID | `842d980c-…` | 分享用，本来就公开 |
| **头像** | `q2.qlogo.cn/headimg_dl?...&spec=0` | **有问题** |

前三个是设计如此，最后一个不是。

## 真正要修的那一条：头像

头像的问题是三合一的：

1. **URL 里带着 QQ 号** —— 虽然是联系方式，但"每个访客的浏览器都会主动连腾讯"这件事没写在任何地方；
2. **一张 107 KB** 的图，只为显示 254px；
3. **favicon 复用同一个地址**，所以一次访问要发 1~2 个请求到 `q2.qlogo.cn`。

于是我在构建期把它取回来，压成三档放进仓库：

```bash
# 640 / 320 / 140 三个尺寸，WebP
avatar-640.webp   32.3 KB
avatar-320.webp   14.7 KB
avatar-140.webp    4.6 KB   ← favicon
```

`Profile.astro` 里用 `srcset` 让浏览器按 DPR 自己挑：

```astro
<img src="/assets/avatar/avatar-640.webp"
     srcset="/assets/avatar/avatar-320.webp 1x, /assets/avatar/avatar-640.webp 2x" />
```

改完的实测：

![头像已本地化：src 与 srcset 都指向站内，页面里再无 qlogo 引用](/assets/images/posts/blog-self-audit/03-avatar.webp)

```
线上页面 qlogo 引用: False
头像 src: /assets/avatar/avatar-640.webp
srcset:   /assets/avatar/avatar-320.webp 1x, /assets/avatar/avatar-640.webp 2x
```

**收益：外部请求 0 个、头像 106.8KB → 32.3KB（1x 下 14.7KB）、favicon 4.6KB。** 隐私政策里「头像取自 QQ 头像服务」那句也同步改成了「已本地化」。

## 没改、但建议盯着的两件事

**1. DMARC 还是 `p=none`。** 意思是「收到伪造我域名的邮件只报告、不拦截」。收紧到 `p=quarantine` 能挡掉大部分伪造，但**要先确认自己的发信链路（SES / Resend / Cloudflare）SPF、DKIM 都对齐**，否则会误伤自己的邮件。这条我没动 —— 涉及邮件可达性，得你先确认。

**2. 那 13 个子域要不要清理。** 现在它们全靠通配符"假装存在"。如果其中某个将来真的挂服务（比如 `git.`），记得别留下没人管的记录 —— **子域接管**的典型成因就是"记录还在、服务没了"。

## 一份可复用的自查清单

1. **证书日志**：`crt.sh/?q=%25.<你的域>` 看有哪些名字被记住了（包括你以为删掉的）；
2. **DNS**：`dig TXT/MX` 一遍，看能推出多少业务信息（DMARC 策略尤其要看）；
3. **通配符**：有 `*.` 记录就假设**所有**子域都会被扫，别把"没有服务"当成"没有暴露"；
4. **页面请求**：开 DevTools 数一遍对外请求，每个都问「它必须存在吗」；
5. **页面标识**：统计 ID、联系方式、图片外链，逐项确认是「我主动公开的」还是「顺手带上的」。

## 小结

静态博客的优势是**没有后端数据**，但公开面依然有三层：证书、DNS、页面。

这次审计最值钱的收获不是发现什么惊天漏洞，而是**把「我以为」变成了清单**：QQ 号是主动放的、统计 ID 无所谓、头像外链则完全没必要。少一个外部请求、少 90KB，同时也少一条"每个访客都在替我连腾讯"的暗线。
