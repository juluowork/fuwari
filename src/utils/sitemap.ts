import type { Dirent } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getCollection } from "astro:content";
import { collectTagCounts, qualifiedTags } from "./tag-utils";

interface SitemapPage {
	url: string;
	priority: number;
	changefreq: string;
	lastmod?: Date;
}

/** 构建期把 src/pages 下的页面文件走一遍，得到「这个站真实存在的静态页面 URL」 */
function collectPageUrls(dir: string, prefix = "/"): string[] {
	const urls: string[] = [];
	let entries: Dirent[] = [];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch (error) {
		console.warn(`[sitemap] 读取 ${dir} 失败，跳过一致性校验：${String(error)}`);
		return urls;
	}

	for (const entry of entries) {
		// 动态路由（[...slug]、[week]）和 404 页面不算
		if (entry.name.includes("[")) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			urls.push(...collectPageUrls(full, `${prefix}${entry.name}/`));
			continue;
		}
		if (!entry.name.endsWith(".astro") || entry.name === "404.astro") continue;
		const base = entry.name.replace(/\.astro$/, "");
		urls.push(base === "index" ? prefix : `${prefix}${base}/`);
	}
	return urls;
}

// 清单里写了不存在的路径 → 构建日志里告警。之前 sitemap 里挂过 /gallery/、/changes/
// 两个 404 的地址，就是靠人工记忆手写清单写歪的，这个校验专门防它复发。
const pageUrls = new Set(collectPageUrls(join(process.cwd(), "src", "pages")));
// 首页是动态路由 [...page].astro（分页第 1 页）渲染的，扫描扫不到，手动登记
pageUrls.add("/");

/**
 * 生成站点地图 XML。`/sitemap.xml` 与备用路径 `/sitemap-1.xml` 共用这一份实现，
 * 保证两边内容永远一致（备用路径是给 Google Search Console 做 A/B 排查用的）。
 */
export async function buildSitemapXml(site: string | URL): Promise<string> {
	// 加密文章不进站点地图（正文不对搜索引擎开放）
	const posts = await getCollection("posts", ({ data }) => {
		return !data.draft && data.encrypted !== true;
	});

	// 只放「读者从导航点得到、值得被收录」的页面；工具页里的生成器（/tools/cover/ 等）
	// 是可交互的小工具、正文很薄，不进站点地图（但 robots.txt 不挡它们，仍可被抓取）。
	const staticPages: SitemapPage[] = [
		{ url: "/", priority: 1.0, changefreq: "daily" },
		{ url: "/archive/", priority: 0.8, changefreq: "weekly" },
		{ url: "/tools/", priority: 0.6, changefreq: "monthly" },
		{ url: "/tools/gallery/", priority: 0.6, changefreq: "monthly" },
		{ url: "/friends/", priority: 0.6, changefreq: "monthly" },
		{ url: "/sponsors/", priority: 0.5, changefreq: "monthly" },
		{ url: "/timetable/", priority: 0.5, changefreq: "monthly" },
		{ url: "/privacy/", priority: 0.3, changefreq: "yearly" },
		{ url: "/tags/", priority: 0.5, changefreq: "weekly" },
	];

	for (const page of staticPages) {
		if (!pageUrls.has(page.url)) {
			console.warn(
				`[sitemap] 清单里的 ${page.url} 在 src/pages 下找不到对应页面，可能是 404 —— 请检查 src/utils/sitemap.ts。` +
					`（本次共识别到 ${pageUrls.size} 个页面：${[...pageUrls].join(" ")}）`,
			);
		}
	}

	const postPages: SitemapPage[] = posts.map((post) => ({
		url: `/posts/${post.id}/`,
		priority: 0.7,
		changefreq: "weekly",
		lastmod: post.data.updated || post.data.published,
	}));

	// 标签落地页：与 /tags/[tag].astro 的生成条件保持一致（≥2 篇文章的标签才建页），
	// 否则 sitemap 里会出现 404 地址。lastmod 取该标签下最新一篇文章的更新时间。
	const tagCounts = collectTagCounts(posts);
	const tagPages: SitemapPage[] = qualifiedTags(tagCounts).map(([tag]) => {
		const tagged = posts.filter((post) => (post.data.tags ?? []).map(String).includes(tag));
		const latest = tagged
			.map((post) => new Date(post.data.updated || post.data.published))
			.sort((a, b) => +b - +a)[0];
		return {
			url: `/tags/${encodeURIComponent(tag)}/`,
			priority: 0.5,
			changefreq: "weekly",
			lastmod: latest,
		};
	});

	const allPages: SitemapPage[] = [...staticPages, ...postPages, ...tagPages];

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
	.map((page) => {
		// ⚠️⚠️ 元素顺序必须严格按官方 XSD 里的 <xsd:sequence>：
		//     loc → lastmod → changefreq → priority
		//     写成「看着更顺」的 loc → priority → changefreq 时，XML 依然 well-formed，
		//     但**不符合 XSD**，Google 会报「无法读取此站点地图」（2026-10-06 踩过：
		//     线上两条 sitemap 全挂，用官方 XSD 校验才定位到；Bing 宽松所以没事）。
		//     自检：node 里跑不了 XSD，用 C:\Users\juluo\.dsh-tools\shots\_xsd-check.py（lxml）。
		const children = [
			`\t<loc>${new URL(page.url, site).href}</loc>`,
			page.lastmod
				? `\t<lastmod>${new Date(page.lastmod).toISOString().split("T")[0]}</lastmod>`
				: "",
			`\t<changefreq>${page.changefreq}</changefreq>`,
			`\t<priority>${page.priority}</priority>`,
		].filter((line) => line !== "");
		return `\t<url>\n${children.join("\n")}\n\t</url>`;
	})
	.join("\n")}
</urlset>`.trim();

	// 构建期兜底自检：确认每条 <url> 的子元素顺序就是 XSD 要求的那个（防以后再被"整理"坏）
	for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
		const order = [...block.matchAll(/<(loc|lastmod|changefreq|priority)>/g)].map((m) => m[1]);
		const expected = ["loc", "lastmod", "changefreq", "priority"].filter((tag) =>
			order.includes(tag),
		);
		if (order.join(",") !== expected.join(",")) {
			console.warn(
				`[sitemap] <url> 子元素顺序不符合官方 XSD：${order.join(" → ")}（应为 ${expected.join(" → ")}）—— Google 会报「无法读取此站点地图」`,
			);
		}
	}

	return xml;
}

export const SITEMAP_HEADERS = {
	"Content-Type": "application/xml; charset=utf-8",
} as const;
