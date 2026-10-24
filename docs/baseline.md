# 站点基线报告（2026-10-24）

> 这份文件是**当前状态的快照**：站点规模、SEO / 可访问性 / 性能的实测基线、抓取与收录状态、
> 以及「怎么复跑这些检查」。每轮维护后更新数字即可，不需要重写判断标准（判据见 `seo.md`）。

## 一、站点规模

| 项 | 值 |
| --- | --- |
| 文章 | **26 篇**（含 1 篇加密演示 `demo-private-note`） |
| 标签 | 20 个（其中 11 个 ≥2 篇，建了落地页） |
| 构建页面 | 56 个 `index.html` |
| 可收录 URL（sitemap） | **45 条**（首页 + 9 个静态页 + 26 篇文章 + 11 个标签页） |
| RSS 条目 | 25 条（加密文章不进 feed） |
| 文章配图 | 88 张 WebP / 4.86 MB |
| `dist` 体积 | 16.04 MB |

## 二、SEO 基线

| 检查 | 结果 |
| --- | --- |
| 标题长度（12~48 字） | 全部合规 |
| 描述（唯一、60~160 字） | 全部合规 |
| canonical 指向自身 | 全部合规（中文路径按解码后比较） |
| h1 数量 = 1 | 全部合规（列表页用 `sr-only`） |
| `og:image` | 全站有（默认图 `/og-default.png` 1200×630） |
| 结构化数据 | 文章 `BlogPosting + BreadcrumbList`、标签页 `CollectionPage + ItemList`、工具页 `WebApplication`、`/domain/` `ItemList` |
| 内链 | 45 条手工（1.7 条/篇）+ 每页 3 条自动「相关文章」 |
| 孤岛（0 入链） | 1 篇：《关于本站》—— 置顶枢纽，链出 4 篇 |
| 只进不出（0 出链） | 0 篇 |

**体检结论：0 项实质问题。** 仅 `/2/` `/3/` `/4/`（分页）与 `/404` 缺 JSON-LD，这两类页面本就不需要。

## 三、可访问性基线

| 检查 | 结果 |
| --- | --- |
| `<html lang>` | `zh-CN` |
| 重复 id | 0（曾全站重复 `id="sidebar"`，已改为 `sidebar-inner`） |
| 图片 alt | 0 处缺失 |
| 可聚焦元素无障碍名称 | 全部有（3 个搜索框已补 `aria-label="搜索文章"`） |
| 对比度 | 0 处不达标（正文 ≥4.5:1、大字 ≥3:1） |
| 键盘焦点 | `:focus-visible` 主题色 2px 描边（默认 `rgb(16,16,16)` 在深色背景不可见，已覆盖） |
| `prefers-reduced-motion` | 已支持 |

## 四、性能基线（Lighthouse 12，移动端，devtools 节流）

| 指标 | 值 | Google「良好」 |
| --- | --- | --- |
| 性能分 | 50 | ≥ 90 |
| FCP | 1.5 s | < 1.8 s ✅ |
| LCP | **7.4 s** | < 2.5 s ❌ |
| TBT | 1390 ms | < 200 ms ❌ |
| CLS | 0.000 | < 0.1 ✅ |

**已知瓶颈：LCP 元素是 Cookie 横幅的文案块。**

- 横幅脚本是第三方 66 KB（`www.termsfeed.com`），在 1.6 Mbps + 4× CPU 下约 7 秒才渲染出那块文本；
- LCP 会一直记到用户首次交互，所以「最后出现的大块」会顶替正文成为 LCP；
- 已做的缓解：加载时机 `window.load` → `DOMContentLoaded`、体积压缩 −75%（360×490 → 320×137）、`preload` 脚本；
- **未做（需站长决定）**：换掉 TermsFeed，自建约 2 KB 的同意条。涉及条款文案、偏好中心、与 GA4/Clarity 的联动，属合规实现。

另注：TBT 1390 ms 主要来自 `gtag.js`（177 KB，542 ms 阻塞）与页面自身脚本。

## 五、抓取与收录状态

| 项 | 状态 |
| --- | --- |
| 旧域 301 | `juluo.work` / `www.juluo.work` / `blog.juluo.work` 三条全部 301 到新域对应路径 ✅ |
| sitemap / robots | 45 条；`robots.txt` 含 `Sitemap:` 声明 ✅ |
| RSS | 25 条，按发布时间倒序 ✅ |
| **IndexNow** | 已接入并推送（全量 45 条 → HTTP 202；增量 → HTTP 200）。Bing / Yandex / Seznam 即时来抓 |
| **Google** | ⏳ 近 3 天 Cloudflare 日志里搜索引擎 bot 仅 21 次命中，Googlebot 尚未大规模抓新域文章页 |

**迁移到 `peroe.cn` 等于重新累积索引**，技术侧（canonical / sitemap / robots / RSS / 301）已全部就绪。
唯一还缺的一步是**站长在 Search Console 里加域并提交 sitemap**（需要 DNS TXT 验证，Agent 无法代做）。
加完之后可用 Cloudflare 日志核对 Googlebot 的抓取路径与频率。

## 六、怎么复跑

```powershell
# 1. 干净构建（必须先删 dist，否则会扫到上一次的残留页面）
Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue
pnpm astro build --force

# 2. SEO 体检（八项判据，逐页列表）
python C:\Users\juluo\.dsh-tools\shots\seo-audit.py

# 3. 内链审计（入链/出链/孤岛）
python C:\Users\juluo\.dsh-tools\shots\link-audit.py

# 4. 可访问性体检（需要本地 Chrome）
node C:\Users\juluo\.dsh-tools\shots\a11y-audit.mjs

# 5. 性能（真实节流；注意 --noproxy 会屏蔽第三方，只用于隔离自有资源）
node C:\Users\juluo\.dsh-tools\shots\perf-home.mjs https://blog.peroe.cn/ --cpu 4 --runs 2 --noproxy

# 6. 发布后推 IndexNow
node C:\Users\juluo\.dsh-tools\shots\indexnow.mjs --new 3
```

## 七、待办清单

| 优先级 | 项 | 谁来做 |
| --- | --- | --- |
| 高 | GSC 加域（`peroe.cn` DNS TXT）+ 提交 sitemap | **站长** |
| 高 | 是否换掉 TermsFeed 横幅（唯一能把 LCP 压进 2.5 s 的动作） | **站长决定** |
| 中 | DMARC 由 `p=none` 收紧到 `p=quarantine`（需先确认 SES / Resend / Cloudflare 三条发信链路的 SPF、DKIM 对齐） | 站长确认后 Agent 可改 |
| 中 | 横幅文案是繁体中文（库只提供 `zh_tw`） | 换自建横幅时一并解决 |
| 低 | `crt.sh` 里可见 13 个历史子域（`git` / `docker` / `dak` 等），建议清理或确认无悬挂记录 | 站长 |
| 低 | 剩余可选优化：`fancybox.css`（32.4 KB）从共享 chunk 摘出 | Agent |

## 八、这 27 轮做过的关键修复（回溯用）

1. **SEO**：全站 h1 = 0 → 28 页补 h1；28 页缺 `og:image` → 默认图兜底；描述重复/过短 → 逐页独立描述；sitemap 的 XSD 顺序错 → 修正（Google 曾报「无法读取」）；404 双 `<head>` → 去掉嵌套布局；RSS 置顶文抢首位 → 改按时间倒序。
2. **内链**：0.6 条/篇、12 篇孤岛 → 手工 1.7 条/篇 + 自动「相关文章」+ 11 个标签落地页。
3. **性能**：埋点延后到空闲、头像本地化（107 KB → 32 KB）、关键 CSS 282 → 104 KB（删掉 160 KB 编辑器死代码）、哈希资源一年 `immutable`、Cookie 横幅提前 + 压缩。
4. **隐私**：移除模板遗留的 `browser-update.org`；第三方域 15 → 14；隐私政策补全第三方清单。
5. **可访问性**：重复 id、缺失无障碍名称、不可见焦点环。
6. **工程**：IndexNow 接入；体检脚本修正三次误报（第三方屏蔽、URL 编码、alpha 合成）。
