---
title: Astro 静态站的三个隐形约定：CSS 是全局的
published: 2026-10-24 19:40:00 +08:00
updated: 2026-10-24 19:40:00 +08:00
description: Astro 的默认行为大多很合理，但有三条不写在报错里的约定：script 默认被打包成模块、CSS import 默认对全站生效、dist 目录从不清理。每一条我都在这两周踩过，附判断命令与修法。
tags:
  - 建站
  - Astro
  - 性能
image: ""
pinned: false
lang: ""
draft: false
---

用 Astro 写静态站很省心，但它的默认行为里有三条**不写在报错里、也不写在文档首页**的约定。这三条我都在这两周里踩过，代价分别是：一个整站不跑、多下 200KB 关键 CSS、以及一次错误的性能/SEO 结论。

## 约定一：`<script>` 默认不是你想的那种 script

我在接 Cookie 同意横幅时写了这样一段：

```astro
---
import { cookieConsentConfig } from "@/config";
---
<script>
  // 以为会原样输出到页面里
  cc.run({ website_name: cookieConsentConfig.websiteName });
</script>
```

结果浏览器报 `cookieConsentConfig is not defined`，横幅整条不出现。

原因：Astro 会把**没有 `is:inline` 的 `<script>` 当成模块打包**（`type="module"`，走 Vite 的模块图）。打包后它运行在独立作用域里，**拿不到 frontmatter 的变量**。想让它和 frontmatter 共享数据，要么用 `is:inline` 让它原样输出，要么用 `define:vars` 显式注入：

```astro
<script is:inline define:vars={{ cookieConsentConfig }}>
  cc.run({ website_name: cookieConsentConfig.websiteName });
</script>
```

同一个坑在 JSON-LD 上还有变体：结构化数据必须用 `set:html` 输出，不能用 `{JSON.stringify(x)}`，否则引号会被转义成 `&quot;`，搜索引擎读到一段坏 JSON。

![修好之后，Cookie 横幅正常出现，并且读得到 frontmatter 里的站点名](/assets/images/posts/blog-astro-traps/02-banner.webp)

**自检**：`grep -c "is:inline" dist/index.html` —— 如果一个都没有，说明你站点里所有 inline 脚本都变成了模块，任何"页面里的小脚本"都会失效。

## 约定二：CSS import 默认是全局的

这条最贵。

我在布局里 import 了公式与代码高亮的样式：

```astro
// src/layouts/Layout.astro —— 每个页面都会经过这里
import "katex/dist/katex.min.css";
import "prismjs/themes/prism-tomorrow.css";
```

看起来很自然：文章页要公式、要代码块。但 Astro 会把**布局链上的 CSS 合并进一份全站关键 CSS**，于是首页、归档、工具页统统要多下这份样式 —— 而首页连一个公式都没有。

更糟的是，这份关键 CSS 里还有上游模板遗留的**编辑器样式**（`@import "@toast-ui/editor/dist/toastui-editor.css"`）：项目里根本没人 import 那个编辑器的 JS，也没有任何 `.toastui-editor-*` 的 DOM，但它的样式一直在被打包。

按选择器前缀统计，311.8 KB 的关键 CSS 是这么构成的：

![按选择器前缀统计关键 CSS：编辑器样式占了 160KB](/assets/images/posts/blog-astro-traps/01-css-scope.webp)

修法两条：把只在文章页用的样式**移到文章页**，把模板遗留的死 `@import` 删掉。结果首页关键 CSS 从 **311.8 KB 降到 104 KB**，文章页看不出任何差别。

**自检**：打开构建产物里的 HTML，数一下 `<link rel="stylesheet">` 与它们的体积，再问一句「这个页面真的用得到这些样式吗」。工具页、首页、文章页的 CSS 才应该不同。

## 约定三：`dist/` 从不清空

我为 SEO 体检写了个脚本，扫 `dist/**/*.html`。某次扫出来 28 个页面，其中一个是 `/t/`：

```
/t/   - canonical 指向 https://i.juluo.work/
      - 缺 description / 缺 h1 / 缺 JSON-LD
```

但线上访问它明明 404。原因是：**`dist/` 在两次构建之间不会被清理**，`/t/` 是几天前删掉的页面残留的产物。我的审计脚本于是给了一份「本地有问题、线上不存在」的结论。

![幽灵页面：本地 dist 里还在，线上早就 404](/assets/images/posts/blog-astro-traps/03-ghost.webp)

Cloudflare 从干净仓库构建，所以线上是对的；但**本地做任何基于产物的分析（审计、体积统计、性能测试）之前，都该先删 `dist/`**。

**自检**：`ls dist/*/index.html` 对着 `src/pages` 数一遍；更省事的做法是每次分析前跑一次 `rm -rf dist && pnpm astro build`。

## 附带的第四个坑：0 不等于「没有数据」

这个坑不是 Astro 的，但同样隐形，而且就在这一轮被截图暴露出来：新发布的文章卡片上显示「0 次」，而自建统计里明明已经有浏览记录。

原因在合并逻辑：

```ts
// 之前：只有 Umami 返回 undefined 才认为"缺口"
const missing = paths.filter((p) => umami?.paths[p] === undefined);
// ...
const all = { ...selfHosted, ...umami };   // umami 的 0 会盖掉自建的正数
```

Umami 对**新路径返回的是「存在但为 0」**，不是「没有这条记录」。于是自建侧的数被当成"已经由 Umami 覆盖"，永远显示 0。修法是把 `0` 也当作缺口，并在合并时让自建的正数优先：

```ts
const missing = paths.filter((p) => {
    const v = umami?.paths[p];
    return v === undefined || v === 0;      // 0 也算缺口
});

const all = { ...(selfHosted ?? {}) };
for (const [p, v] of Object.entries(umami?.paths ?? {})) {
    if (v > 0 || all[p] === undefined) all[p] = v;   // 0 不覆盖已有的正数
}
```

教训：**「查不到」和「查到了 0」是两件事**。API 用 0 表示"没有数据"时，任何"缺省才补"的兜底逻辑都会失效。

## 三条约定合起来的一句话

Astro 把「布局、样式、脚本、产物」都当成可优化的整体来管，所以它的默认值是**为产物服务**的，不是为「你以为的作用域」服务的。判断方法很简单：

1. **脚本**：产物里的 `<script>` 有没有 `type="module"`？
2. **样式**：产物里每个页面引用的 CSS 是不是同一份、多大？
3. **产物**：你分析的是不是一次干净构建的结果？

这三问都答得出来，Astro 的「隐形约定」就不隐形了。

同一条「作用域」思路也解释了[缓存那篇](/posts/blog-cache-layers/)的结论：内容哈希命名的资源应当永久缓存。
