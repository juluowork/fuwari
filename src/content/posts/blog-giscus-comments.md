---
title: 静态博客接评论：Giscus 的配置、主题联动与三个坑
published: 2026-10-24 20:00:00 +08:00
updated: 2026-10-24 20:00:00 +08:00
description: 静态博客没有后端，评论只能挂第三方。这篇记录 Giscus 的完整接入：六个配置字段各自的作用、用自定义 CSS 做暗色联动的原理、不靠肉眼验证评论是否真的加载的方法，以及仓库迁移、改 slug、iframe 布局跳动三个坑。
tags:
  - 建站
  - Astro
  - 安全
image: ""
pinned: false
lang: ""
draft: false
---

静态博客没有后端，评论只能挂在别人身上。我选的是 [Giscus](https://giscus.app)：把评论存进 GitHub Discussions，访客用 GitHub 账号登录发言。

选它的理由只有两条，但都很硬：

1. **不用自己存任何用户数据** —— 没有邮箱、没有昵称、没有密码，登录和身份全在 GitHub 那边；
2. **数据是你的** —— 评论就是仓库里的 Discussion，随时可以导出、迁移，甚至换一个前端重新渲染。

## 六个字段，各有各的用处

```ts
export const giscusConfig: GiscusConfig = {
    enable: true,
    repo: "juluowork/giscus",          // 评论存在哪个仓库
    repoId: "R_kgDOPdSugg",            // GraphQL node id（不是仓库名）
    category: "Announcements",         // 存到哪个 Discussion 分类
    categoryId: "DIC_kwDOPdSugs4CuINO",// 分类的 node id
    mapping: "pathname",               // 页面与 thread 的对应规则
    lang: "zh-CN",
    theme: `https://${customDomain}/css/giscus.css`,
};
```

两个 `id` 最容易填错：`repo` 和 `category` 只是给人看的，真正的依据是 `repoId` / `categoryId`（GitHub GraphQL 的 node id）。填错的表现是"评论区加载出来了，但一直转圈 / 报 repo not found"。

`mapping: "pathname"` 意味着**一个 URL 路径对应一个 thread**。这一条后面会变成坑。

## 主题联动：iframe 拿不到父页面的样式

评论区是 iframe，**它里面的 CSS 与你的站点完全隔离**。所以"自动跟随亮/暗色"不能靠继承，只能靠传参。

Giscus 支持 `theme` 传一个**样式表 URL**，它会把这个 CSS 注入到 iframe 内部。于是我把主题色、背景色、字体都写进自己站点的 `/css/giscus.css`，再让 iframe 指向它：

```css
/* public/css/giscus.css 的一部分 */
main { --color-canvas-default: transparent; }
.gsc-comment-box { border-radius: 0; }
```

这样做的好处是：**换主题不用改 Giscus 配置**，因为样式文件本身就在你的仓库里。代价是改样式之后要让访客刷新（iframe 的 CSS 会被浏览器缓存）。

## 怎么验证「评论真的加载了」

「页面上有个框」不等于评论能用。我用的验证方法是量高度 + 看 iframe 参数：

```js
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(6000);
const iframe = document.querySelector("iframe[src*='giscus']");
console.log(iframe.src);                          // 检查 origin / theme 参数
console.log(iframe.getBoundingClientRect().height); // 初始 150，加载完 372
```

实测结果：

- 初始占位高度 **150px**（脚本还没跑完）；
- 滚到底、等 6 秒后 iframe 长到 **372px**，说明评论 UI 真的渲染了；
- iframe 的 `src` 里带着 `origin=https://blog.peroe.cn/posts/xxx/#giscus-container` 与 `theme=https://blog.peroe.cn/css/giscus.css`。

![评论区实测：表情、评论数、编辑器与 GitHub 登录按钮都正常](/assets/images/posts/blog-giscus-comments/01-comments.webp)

这个"看高度"的方法很笨，但比截图肉眼看更可靠 —— 因为**加载失败时 iframe 停在 150px**，肉眼看起来只是"评论区有点矮"。

![iframe 检查输出：src 参数正确、高度从 150 长到 372](/assets/images/posts/blog-giscus-comments/02-iframe.webp)

## 三个坑

**1. 仓库迁到组织之后，必须重装 Giscus App。**

我把评论仓库从个人账号迁到了 `juluowork` 组织，结果评论区一片空白。原因是 Giscus 的 GitHub App 授权是**按账号**的：个人账号装过的授权，不会覆盖组织下的仓库。重新到 <https://github.com/apps/giscus> 选组织安装即可，`repoId` / `categoryId` 都不用改。

**2. 改 slug 等于换了一个 thread。**

`mapping: "pathname"` 用路径做键。我把一篇文章的 slug 从 `xxx` 改成 `yyy`，评论就"消失"了 —— 其实是新路径对应了一个新的 Discussion，旧评论还在旧 thread 里。**如果文章已经有人评论，改 slug 前先想想这条**；实在要改，可以在旧 thread 留一条指向新地址的说明。

**3. iframe 是异步加载的，会给页面带来布局跳动。**

评论脚本在页面底部注入 iframe，高度从 0 涨到几百像素 —— 如果它上面还有内容，整块会被顶下去（和[上次那个 CLS](/posts/blog-home-performance/) 同源）。解决办法是给容器一个 `min-height`，或者让脚本在滚动到附近时才加载。

## 小结

Giscus 的接入成本很低（填六个字段、贴一段脚本），但有三件事值得在接入时就定下来：

1. **评论仓库的归属**：放在组织下比个人账号更稳，但要记得重装 App；
2. **mapping 规则**：`pathname` 最直观，但要接受"改 slug = 换 thread"；
3. **验证方式**：量 iframe 高度、看 src 参数，比截图看一眼可靠。

顺带说一句：这个站的评论数据（0 条）在 `juluowork/giscus` 仓库的 Discussions 里，如果要迁移或备份，直接导出就是 Markdown。

评论是本站第三个「把访客交给别人」的地方，完整清单在[第三方请求审计](/posts/blog-third-party-audit/)。
