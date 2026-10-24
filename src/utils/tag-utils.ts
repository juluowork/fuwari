/**
 * 标签工具：统计标签、生成标签页路径。
 *
 * 只有被 ≥ MIN_TAG_POSTS 篇文章使用的标签才生成落地页并渲染成链接 ——
 * 单篇标签的聚合页属于薄内容，对 SEO 是负分。
 */
import type { CollectionEntry } from "astro:content";

export const MIN_TAG_POSTS = 2;

export function tagPath(tag: string): string {
	return `/tags/${encodeURIComponent(tag)}/`;
}

export function collectTagCounts(posts: CollectionEntry<"posts">[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const post of posts) {
		for (const tag of post.data.tags ?? []) {
			const key = String(tag);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	return counts;
}

/** 可生成落地页的标签（按文章数降序） */
export function qualifiedTags(counts: Map<string, number>): [string, number][] {
	return [...counts.entries()]
		.filter(([, n]) => n >= MIN_TAG_POSTS)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
}

/**
 * 标签导语：每个标签一句「这个主题下大致写了什么」。
 * 自动生成的描述只说明"有几篇"，导语要说明"为什么值得看这一组"。
 * 改文案只动这张表；表里没有的标签回退到通用说明。
 */
export const TAG_INTROS: Record<string, string> = {
	建站: "从零搭一个能长期维护的静态站：Astro 的内容与布局、Cloudflare Workers 的部署与分发、构建产物、SEO 与可访问性。踩过的坑和量出来的数字都在这组文章里。",
	Astro: "框架层面的具体机制：内容集合缓存、布局链与作用域、CSS 打包边界、`is:inline` 与 `define:vars`、`getStaticPaths` 的匹配规则。适合已经在用 Astro、开始改模板的人。",
	性能: "用 CDP 限速与 Lighthouse 实测出来的结论：关键 CSS 与首屏、图片格式与体积、缓存分层、埋点脚本对 LCP 的影响。既有有效改动，也有「做了没用」的记录。",
	安全: "从响应头与 TLS 评分，到子域、DNS、证书日志构成的公开面审计；也包括「给单篇文章上密码」这种静态站的安全边界实践。",
	运维: "日常维护要用的东西：免费额度怎么算、缓存规则怎么设、统计数字怎么对账，以及部署与构建流程中的隐性约定。",
	Cloudflare: "Workers 静态资源、D1、缓存与响应头规则、免费套餐的边界。每篇都基于这个站的真实配置与实测数据，不是官网文档的转述。",
	统计: "两套统计并存时的口径问题：Umami 与自建 D1 在同一时间窗内的差异、广告拦截器的影响、以及「0 不等于没有数据」这类实现陷阱。",
	观测: "测量方法本身值得怀疑：限速参数、第三方屏蔽、Lab 与 Field 的差别。这几篇记录的都是「我的测量骗了我」以及怎么发现的。",
	工程实践: "把重复的事固化成流程：配图流水线、构建与验证步骤、可复现的命令。目标是每次结果一致，而不是每次重新想一遍。",
	SEO: "搜索引擎视角的技术活：标题与描述的长度、canonical 与结构化数据、内链密度、站点地图与标签聚合页。每一条都能用脚本复现与复查。",
	隐私: "静态博客不等于没有第三方：请求审计、公开面（证书日志/DNS/页面标识）、以及把头像这类资源本地化的取舍。",
};

export function tagIntro(tag: string): string | null {
	return TAG_INTROS[tag] ?? null;
}
