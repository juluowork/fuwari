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
