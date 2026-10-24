# peroe 的博客

基于 [Fuwari](https://github.com/saicaca/fuwari) 二次开发的个人技术博客。

- 站点：<https://blog.peroe.cn>（2026-10-06 从 `blog.juluo.work` 迁来；旧域保留做 301 跳转与备用入口）
- 仓库：<https://github.com/juluowork/fuwari>
- 部署：Cloudflare Workers 静态资源模式，由 Cloudflare 从本仓库 `main` 分支构建
- 写作规范：[`docs/writing-guide.md`](docs/writing-guide.md) ｜ 选题规划：[`docs/topic-plan.md`](docs/topic-plan.md) ｜ [SEO 维护手册](docs/seo.md) ｜ 服务清单：[`docs/cloudflare-services.md`](docs/cloudflare-services.md)

> 本仓库做过个性化改造：移除论坛模块、清空原作者文章、接入自建访问统计、Giscus 评论、
> 单篇文章密码保护、Bing 站长验证，并清理了原作者的推广跳转与失效服务。
> 二次开发前建议具备一定 Astro / 前端工程经验。

## ✨ 核心能力

- 静态站点（Astro 6）+ 响应式布局、深色主题与主题色切换
- Markdown / MDX 内容发布与增强渲染（KaTeX 公式、Mermaid、代码高亮、GitHub 风格提示块、剧透、链接卡片）
- 文章「更新记录」：由 git 提交历史自动生成修改时间线（`pnpm update-diff`）
- 每篇文章的浏览量：自建读数接口 + 前端批量读取
- 站内搜索：构建期生成 JSON 索引 + 前端模糊匹配
- **单篇文章密码保护**：构建期 AES-256-GCM 加密正文，浏览器端 WebCrypto 解密（明文不入库）
- 多模块页面：归档、友链、赞助、画廊、封面生成、文件索引、工具页
- SEO 与分发：RSS、Sitemap、Robots、结构化数据、搜索引擎站长验证
- 维护脚本：新建文章、锁定加密文章、图片清理与命名规范化、文章变更历史、链接检查

## 🛠️ 技术栈

- **框架**：Astro 6.x
- **交互**：Svelte 5（沿用传统语法）
- **样式**：Tailwind CSS + Stylus
- **内容处理**：Remark / Rehype 扩展链路（`src/plugins/`）
- **包管理**：pnpm ｜ **代码规范**：Biome ｜ **部署**：Cloudflare Workers（静态资源）

## 🚀 快速开始

```bash
pnpm install       # 安装依赖
pnpm update-diff   # 首次必须先跑：生成 src/json/git-history.json（缺失会导致构建失败）
pnpm dev           # 本地开发（http://localhost:4321）
pnpm build         # 构建静态站点到 dist/
pnpm preview       # 预览构建产物
pnpm type-check    # 类型检查（当前基线：0 错误）
```

> 大批量增删文章后，请用 `pnpm astro build --force` 绕过 Astro 的内容缓存，否则会输出旧内容。

## 📌 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm preview` | 开发 / 构建 / 预览 |
| `pnpm type-check` | TypeScript 类型检查 |
| `pnpm new-post <slug>` | 新建文章（生成 `src/content/posts/<slug>.md`） |
| `pnpm lock-post <slug>` | **把明文文章加密**：渲染 → 加密 → 写密文 → 原文换成仅含 frontmatter 的 stub |
| `pnpm update-diff` | 生成文章变更历史（构建前置） |
| `pnpm clean` | 清理未引用图片 |
| `pnpm del-space` | 规范图片命名并更新引用 |
| `pnpm check-links` | 检查友链可达性 |
| `pnpm ai-summary` | 生成 AI 摘要（需要 `GEMINI_API_KEY`） |
| `pnpm cdnify` | 把图片引用改为 CDN 地址 |

## 📁 项目结构

### 内容放在哪（最常问的问题）

| 想找什么 | 路径 | 说明 |
| --- | --- | --- |
| **文章源文件（Markdown）** | `src/content/posts/<slug>.md` | **文章正文只存在这里**。YAML frontmatter 写元数据，文件名即 URL |
| **文章配图** | `public/assets/images/posts/<slug>/` | 与文章同名的目录，图片命名 `01-xxx.webp`；正文用绝对路径引用 |
| 站点公告 | `src/content/spec/announcement.md` | 默认关闭 |
| 友链 / 赞助 / 课表 | `src/data/friends/`、`src/data/sponsors/`、`src/data/timetable/` | JSON，各目录内有 README 说明格式 |
| 加密文章的**密文** | `src/data/encrypted/<slug>.json` | 随仓库提交 |
| 加密文章的**明文** | `private/posts/<slug>.md` | **只在本地，已 gitignore，绝不提交** |
| **构建产物** | `dist/` | `pnpm build` 生成，**不进仓库** |

**从 Markdown 到网页的映射**：

```text
src/content/posts/hello-world.md              ← 你写的 Markdown
        │  pnpm build（Astro 内容集合 + Remark/Rehype 管线）
        ▼
dist/posts/hello-world/index.html             ← 生成的静态网页（部署时上传的就是 dist/）
        │  路由
        ▼
https://blog.peroe.cn/posts/hello-world/    ← 线上地址
```

图片放在 `public/` 下会**原样复制**到产物根目录，所以：
`public/assets/images/posts/hello-world/01-a.webp` → 线上 `/assets/images/posts/hello-world/01-a.webp`，
正文里就写 `![说明](/assets/images/posts/hello-world/01-a.webp)`。

### 完整目录树

```text
.
├── src/
│   ├── config.ts               # ⭐ 全站配置唯一入口（站点信息、导航、统计、评论、各服务开关）
│   ├── content/
│   │   ├── posts/              # ⭐ 文章源文件（Markdown），文件名即 slug
│   │   ├── spec/               # 公告等特殊页面内容
│   │   └── config.ts → content.config.ts  # 内容集合的 schema（frontmatter 字段在这里定义）
│   ├── pages/                  # 路由：每个文件对应一个 URL
│   │   ├── [...page].astro     # 首页与分页
│   │   ├── posts/[...slug].astro  # 文章详情页
│   │   ├── archive/ tools/     # 归档、工具页
│   │   ├── rss.xml.ts search.json.ts sitemap.xml.ts robots.txt.ts posts.json.ts  # 构建期生成的接口文件
│   │   └── friends.astro sponsors.astro privacy.astro
│   ├── components/             # 组件（Astro + Svelte）
│   │   ├── widget/             # 侧栏与文章内小部件（TOC、浏览量、密码解锁 PasswordGate.svelte…）
│   │   ├── misc/               # Markdown 渲染、图片包装、链接提交说明…
│   │   ├── layout/ control/    # 布局与交互控件
│   │   └── timetable/          # 课表相关组件
│   ├── layouts/                # 页面骨架（Layout.astro 负责 <head>、主题、脚本注入）
│   ├── plugins/                # Remark / Rehype 插件（提示块、代码块、链接卡片、剧透、摘要、阅读时长…）
│   ├── scripts/                # 浏览器端运行时脚本（代码高亮、灯箱、列表排序、浏览量读取、行内 diff）
│   ├── utils/                  # 工具函数（内容排序、日期、加密载荷、可见性过滤、TOC…）
│   ├── data/                   # 数据文件：友链 / 赞助 / 课表 / 加密文章密文
│   ├── styles/                 # 全局样式与主题变量
│   ├── types/                  # 配置与数据的类型定义
│   ├── constants/              # 常量（分页大小等）
│   └── json/git-history.json   # ⚙️ 生成物（pnpm update-diff 产出，已 gitignore）
├── public/                     # 原样复制到产物根目录的静态资源
│   ├── assets/images/posts/    # ⭐ 文章配图（按文章 slug 分目录）
│   ├── css/ favicon/ files/ sponsors/
│   └── BingSiteAuth.xml        # 搜索引擎站长验证文件
├── scripts/                    # Node 维护脚本
│   ├── new-post.js             # pnpm new-post
│   ├── lock-post.mjs           # pnpm lock-post（加密文章，见 docs/writing-guide.md）
│   ├── update-diff.js          # pnpm update-diff（生成文章变更历史）
│   ├── clean-unused-images.js  del-space.js  cdnify-images.js  check-links.js  imgf.js
│   └── utils/                  # 脚本公用工具
├── services/                   # 随仓库维护的独立 Cloudflare Worker
│   └── link-card/              # 链接卡片元数据抓取（icon.peroe.cn）
├── docs/                       # 项目文档
│   ├── writing-guide.md        # 写作规范（frontmatter、结构、配图、截图工具）
│   ├── seo.md                  # SEO 维护手册（体检脚本、基线阈值、实现细节、发布自检）
│   ├── topic-plan.md           # 选题规划（60 个选题 / 12 个方向）
│   ├── cloudflare-services.md  # 自建服务与域名清单
│   └── workers-deploy.md       # 部署方式
├── private/                    # 🔒 加密文章的明文（本地专用，已 gitignore，绝不提交）
├── .github/workflows/          # auto-pr、check-links 等工作流（部署已交给 Cloudflare）
├── astro.config.mjs            # 构建配置与 Markdown 管线
├── wrangler.jsonc              # Cloudflare Worker 配置（静态资源配置 + 自定义域）
├── .nvmrc                      # Node 版本（Cloudflare 构建镜像据此选版本）
├── .gitignore  biome.json  tsconfig.json  tailwind.config.cjs  postcss.config.mjs  svelte.config.js
└── package.json
```

### 约定：这些东西不能进仓库

| 类别 | 例子 | 处理方式 |
| --- | --- | --- |
| 构建产物 | `dist/`、`node_modules/`、`.astro/`、`.wrangler/` | 已 gitignore |
| 编辑器与本地状态 | `.obsidian/`、`.vscode/` | 已 gitignore（配置留在本机即可） |
| 加密文章的明文与密码 | `private/` | 已 gitignore，**明文和密码绝不提交** |
| 调试用的一次性文件 | `verify-*.py`、`spike-*.astro`、`tmp/`、`*.log`、`*.tmp`、`*.bak` | 已 gitignore，用完即删 |
| 密钥与令牌 | `.env`、任何含 token 的脚本 | 走环境变量或仓库 Secrets |

## ⚙️ 配置指南

主要配置入口是 [`src/config.ts`](src/config.ts)：站点标题/描述/关键词/主题色、头像与联系方式、
导航菜单、Banner、统计（Umami Cloud + 自建读数接口）、评论（Giscus）、Cookie 同意、
随机图 API、链接卡片 API、文章浏览量、站长验证等开关都在这里。

内容字段（frontmatter）的 schema 定义在 [`src/content.config.ts`](src/content.config.ts)：
`title` / `published` / `updated` / `description` / `tags` / `image` / `pinned` / `draft` / `lang`，
加密文章另有 `encrypted` / `passwordHint`。**`published` 必须带 `+08:00`**，否则会被当成 UTC 显示成次日。

## 🌐 部署

产物是纯静态文件，由 **Cloudflare Workers（静态资源模式）** 托管：

- 仓库 `wrangler.jsonc` 声明 `assets.directory = ./dist` 与自定义域 `blog.peroe.cn`
- Cloudflare 侧 Build command：`pnpm update-diff && pnpm astro build --force`；Deploy command：`npx wrangler deploy`
- 推送 `main` 分支即自动构建部署；本地也可 `pnpm update-diff && pnpm astro build --force && npx wrangler deploy`

详见 [`docs/workers-deploy.md`](docs/workers-deploy.md)。

## 📄 许可证

[MIT License](LICENSE)

## 🙏 致谢

- 上游模板：[saicaca/fuwari](https://github.com/saicaca/fuwari)
- 定制版参考：[afoim/fuwari](https://github.com/afoim/fuwari)
