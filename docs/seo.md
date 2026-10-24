# 站内 SEO 维护手册

> 对应文章：[博客 SEO 自我体检](/posts/blog-seo-self-audit/)
> 体检脚本：`C:\Users\juluo\.dsh-tools\shots\seo-audit.py`（不进仓库，只在本机）

## 一、先跑体检，再改东西

```powershell
# 仓库根目录
pnpm astro build              # 体检扫的是 dist/，必须先构建
$py = "C:\Users\juluo\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
& $py "C:\Users\juluo\.dsh-tools\shots\seo-audit.py"            # 全站
& $py "...\seo-audit.py" posts/blog-view-counter                # 只看某页
```

输出是一张表（页面 / 标题字数 / 描述字数 / h1 数 / h2 数 / 图 / 字数 / 内链 / 结构化数据）+ 问题清单。

**注意**：`dist/` 不会自动清理，历史上删掉的页面会残留（例如曾存在的 `/t/`）。
做全站体检前先 `Remove-Item dist -Recurse -Force` 再构建，否则会扫到幽灵页面。

## 二、当前基线（2026-10-24 起）

| 项 | 约定 |
| --- | --- |
| 标题 | 12~48 字；文章标题 ≤ 40 字（`title` 会自动拼上 ` - peroe 的博客`） |
| 描述 | 60~160 字，**每页不同**；文章写在 frontmatter，静态页写在 `<MainGridLayout description="...">` |
| h1 | **每页恰好 1 个** |
| 分享图 | 全站兜底 `/og-default.png`（1200×630）；文章有 `image` 时优先用它 |
| 结构化数据 | 文章 = `BlogPosting` + `BreadcrumbList`；首页 = `WebSite`；其余页面至少 `BreadcrumbList` |
| 正文字数 | 工具页/文章页 ≥ 300 字（纯 JS 渲染的页面爬虫看到的是空壳） |

## 三、几个必须记住的实现细节

1. **文章标题是 `<h1 id="post-title">`**
   `src/pages/posts/[...slug].astro` 里那个元素既要当 h1，又被 `post-inline-diff.ts`（行内 diff）和
   Pagefind（搜索权重）按 `#post-title` 依赖 —— **可以换标签，不能换 id**。

2. **列表页的 h1 用 `heading` 属性**
   首页、`/2/`、`/archive/` 没有可见标题，传 `heading` 给 `MainGridLayout`，它会输出
   `<h1 class="sr-only">`。**已经有可见 h1 的页面（`PageCardHeader` 里的）不要再传**，否则两个 h1。

3. **`MainGridLayout` 内部已经包含 `Layout`**
   不要在外面再套一层 `<Layout>` —— 会输出两份 `<head>`、两个 `<title>`。404 页踩过。
   排查方法：体检表里某页 `description` 数字不对劲，就去产物里数 `<head>` 的个数。

4. **`og:image` 一定有值**
   `Layout.astro` 里 `resolvedOgImage = ogImage || "/og-default.png"`，默认图重新生成用
   `C:\Users\juluo\.dsh-tools\shots\make-og-default.py`（Pillow + 微软雅黑，1200×630）。

5. **XML 产物要按 schema 校验**
   well-formed ≠ 符合 XSD。sitemap 的元素顺序必须是 `loc → lastmod → changefreq → priority`，
   写错不会被任何本地工具发现，只有 Google 报「无法读取此站点地图」。
   校验脚本：`_xsd-check.py`（用官方 `sitemap.xsd` + lxml）。

## 四、写文章时的 SEO 自检（发布前逐条过）

- [ ] `title` ≤ 40 字，且能独立说明这篇解决什么问题（不要"杂谈""记录一下"）
- [ ] `description` 60~120 字，概括全文结论（不是目录）
- [ ] `tags` 2~4 个，**优先复用已有标签**（`建站` / `Astro` / `安全` / `Cloudflare` / `运维` …）
- [ ] `published` / `updated` 都带 `+08:00`
- [ ] 至少 2 张图，其中 ≥1 张真实截图；命名 `01-xxx.webp` 按出现顺序；引用走 `/assets/images/posts/<slug>/`
- [ ] 正文 1200~3500 字，有「为什么这么做」和「踩过什么坑」
- [ ] 站内互链 ≥1 条（`/posts/<slug>/`），把新文章接进已有内容网络
- [ ] 发布后再跑一次体检，确认新页 0 问题
- [ ] 发布后到 GSC「网址检查」→ 请求编入索引（sitemap 会自动更新，但主动提交更快）

## 五、已知待办（低优先级）

- 工具页缺 `WebApplication` / `SoftwareApplication` 结构化数据（`/tools/*`）
- 两篇早期演示文章（`hello-world`、`demo-private-note`）描述偏短（40 / 49 字）
- `/tools/` 与 6 个工具页可再补 200~400 字实质说明（部分仍偏薄）
- `sitemap-1.xml` 是排查 sitemap 问题时留的备用路径，用不上了可以删
