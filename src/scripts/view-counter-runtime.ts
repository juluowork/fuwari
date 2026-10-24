// 浏览量的统一读取端：**优先 Umami**（只读的分享接口），自建 Worker + D1 只做兜底。
//
// 两个数据源：
//   1. Umami Cloud（umamiConfig.shareApiBase + shareId，不需要任何密钥）
//        - 全站：GET /api/websites/{id}/stats?startAt=0&endAt=<now>       -> pageviews（全时段 PV）
//        - 单页：同上再加 &path=eq.%2Fposts%2Fxxx%2F                      -> 该路径的全时段 PV
//        两个必需的请求头：x-umami-share-token（用 /api/share/{shareId} 换，10 分钟有效）
//        和 x-umami-share-context（= shareId；umami 用它判断「token 确实用在分享上下文里」，
//        少一个就是 401）。这套接口没有公开文档，参数是照着分享页抓包对出来的。
//   2. 自建（viewCounterConfig.endpoint）：POST /batch，请求体是 pathname 数组
//        —— 只在 Umami 整体不可用、或某些路径没取到数字时发，用来补缺口（不做加法，避免重复计数）。
//
// 页面侧只需要登记要显示什么：
//   __VIEWS_QUEUE__  = 文章 slug 列表（PostMeta 渲染几张卡片就有几个）
//   __VIEWS_PATHS__  = 任意页面路径（ViewsCounter，如 /cover/、/files/）
// 数字拿到后：填 DOM + 广播 post-views-loaded 事件给排序脚本。
import { umamiConfig, viewCounterConfig } from "../config";

const SITE_VIEWS_EVENT = "site-views-loaded";
const POST_VIEWS_EVENT = "post-views-loaded";
const SITE_PATHNAME = "/";

/** Umami 分享 token 的有效期是 10 分钟，缓存 8 分钟留余量 */
const TOKEN_CACHE_KEY = "umami-share-token-v1";
const TOKEN_TTL_MS = 8 * 60 * 1000;
/** 单个请求的超时：Umami 慢过这个数就走兜底 */
const REQUEST_TIMEOUT_MS = 6000;

type ViewsMap = Record<string, number>;

type UmamiContext = {
	token: string;
	websiteId: string;
	exp: number;
};

type PathRequest = {
	pathname: string;
	id: string;
	suffix: string;
};

function getSelfHostedEndpoint(): string {
	if (!viewCounterConfig.enable) return "";
	return String(viewCounterConfig.endpoint ?? "")
		.trim()
		.replace(/\/+$/, "");
}

function getUmamiGateway(): string {
	if (!viewCounterConfig.enable || !viewCounterConfig.preferUmami) return "";
	if (!umamiConfig.enable || !umamiConfig.shareId) return "";
	return String(umamiConfig.shareApiBase ?? "")
		.trim()
		.replace(/\/+$/, "");
}

function collectSlugs(): string[] {
	const pageData = (window as any).__PAGE_POSTS_DATA__;
	const raw: unknown[] =
		Array.isArray(pageData) && pageData.length > 0
			? pageData.map((post: { id?: unknown }) => post?.id)
			: ((window as any).__VIEWS_QUEUE__ ?? []);

	const slugs = raw.filter(
		(slug): slug is string => typeof slug === "string" && slug.length > 0,
	);
	return [...new Set(slugs)];
}

function collectPathRequests(): PathRequest[] {
	const raw: unknown = (window as any).__VIEWS_PATHS__;
	if (!Array.isArray(raw)) return [];

	const requests: PathRequest[] = [];
	for (const item of raw as Partial<PathRequest>[]) {
		if (typeof item?.pathname !== "string" || !item.pathname) continue;
		if (typeof item?.id !== "string" || !item.id) continue;
		requests.push({
			pathname: item.pathname,
			id: item.id,
			suffix: typeof item.suffix === "string" ? item.suffix : "次",
		});
	}
	return requests;
}

function postPathname(slug: string): string {
	return `/posts/${slug}/`;
}

function toViews(value: unknown): number | undefined {
	const num = Number(value);
	return Number.isFinite(num) && num >= 0 ? num : undefined;
}

async function fetchWithTimeout(
	url: string,
	init: RequestInit = {},
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

function readTokenCache(): UmamiContext | null {
	try {
		const raw = sessionStorage.getItem(TOKEN_CACHE_KEY);
		if (!raw) return null;
		const cached = JSON.parse(raw) as UmamiContext;
		if (!cached?.token || !cached.websiteId || Date.now() > cached.exp) {
			return null;
		}
		return cached;
	} catch {
		return null;
	}
}

function writeTokenCache(context: UmamiContext) {
	try {
		sessionStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(context));
	} catch {
		// 无痕模式等写不了就算了，下次重新换 token
	}
}

function clearTokenCache() {
	try {
		sessionStorage.removeItem(TOKEN_CACHE_KEY);
	} catch {
		// ignore
	}
}

async function getUmamiContext(force = false): Promise<UmamiContext | null> {
	const gateway = getUmamiGateway();
	if (!gateway) return null;

	if (!force) {
		const cached = readTokenCache();
		if (cached) return cached;
	}

	try {
		const res = await fetchWithTimeout(
			`${gateway}/api/share/${encodeURIComponent(umamiConfig.shareId)}`,
		);
		if (!res.ok) return null;

		const data = await res.json();
		if (!data?.token || !data?.websiteId) return null;

		const context: UmamiContext = {
			token: String(data.token),
			websiteId: String(data.websiteId),
			exp: Date.now() + TOKEN_TTL_MS,
		};
		writeTokenCache(context);
		return context;
	} catch {
		return null;
	}
}

/** 读某个路径的全时段 PV；pathname 省略时读全站（不按路径过滤） */
async function readUmamiViews(
	context: UmamiContext,
	pathname?: string,
): Promise<number | undefined> {
	const gateway = getUmamiGateway();
	if (!gateway) return undefined;

	const filter = pathname ? `&path=eq.${encodeURIComponent(pathname)}` : "";
	const url = `${gateway}/api/websites/${context.websiteId}/stats?startAt=0&endAt=${Date.now()}${filter}`;

	try {
		const res = await fetchWithTimeout(url, {
			headers: {
				"x-umami-share-token": context.token,
				"x-umami-share-context": umamiConfig.shareId,
			},
		});
		if (res.status === 401) {
			// token 过期：清缓存，让调用方换新的重试
			clearTokenCache();
			return undefined;
		}
		if (!res.ok) return undefined;

		const data = await res.json();
		return toViews(data?.pageviews);
	} catch {
		return undefined;
	}
}

/** 优先数据源：Umami。整体不可用时返回 null */
async function loadFromUmami(
	pathnames: string[],
	onSiteViews?: (views: number) => void,
): Promise<{ site?: number; paths: ViewsMap } | null> {
	const context = await getUmamiContext();
	if (!context) return null;

	const read = async (ctx: UmamiContext) => {
		// 全站的这一次单独接出来：它一回来就先画侧栏，不用等最慢的那篇文章
		const sitePromise = readUmamiViews(ctx).then((views) => {
			if (views !== undefined) onSiteViews?.(views);
			return views;
		});
		const [site, ...paths] = await Promise.all([
			sitePromise,
			...pathnames.map((pathname) => readUmamiViews(ctx, pathname)),
		]);

		const map: ViewsMap = {};
		pathnames.forEach((pathname, index) => {
			const views = paths[index];
			if (views !== undefined) map[pathname] = views;
		});
		return { site, paths: map };
	};

	let result = await read(context);

	// 一个都没读到，多半是 token 刚好过期：换新的再试一次
	if (result.site === undefined && Object.keys(result.paths).length === 0) {
		const fresh = await getUmamiContext(true);
		if (!fresh) return null;
		result = await read(fresh);
		if (result.site === undefined && Object.keys(result.paths).length === 0) {
			return null;
		}
	}

	return result;
}

/** 兜底数据源：自建 Worker + D1 */
async function loadFromSelfHosted(pathnames: string[]): Promise<ViewsMap | null> {
	const endpoint = getSelfHostedEndpoint();
	if (!endpoint || pathnames.length === 0) return null;

	try {
		const res = await fetchWithTimeout(`${endpoint}/batch`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(pathnames),
		});
		if (!res.ok) return null;

		const views: unknown = await res.json();
		if (!Array.isArray(views)) return null;

		const map: ViewsMap = {};
		pathnames.forEach((pathname, index) => {
			const value = toViews(views[index]);
			if (value !== undefined) map[pathname] = value;
		});
		return map;
	} catch {
		return null;
	}
}

function setSiteViews(views: number) {
	(window as any).__SITE_VIEWS__ = views;

	const element = document.getElementById("site-views");
	const wrapper = document.getElementById("site-views-wrapper");
	if (element && wrapper) {
		element.textContent = views.toString();
		wrapper.style.display = "grid";
	}

	window.dispatchEvent(
		new CustomEvent(SITE_VIEWS_EVENT, { detail: { views } }),
	);
}

function setPostViews(slug: string, views: number) {
	const element = document.getElementById(`page-views-${slug}`);
	const wrapper = document.getElementById(`page-views-wrapper-${slug}`);
	if (element && wrapper) {
		element.textContent = `${views} 次`;
		wrapper.style.display = "flex";
	}
}

function setPathViews(request: PathRequest, views: number) {
	const element = document.getElementById(request.id);
	const wrapper = document.getElementById(`${request.id}-wrapper`);
	if (element && wrapper) {
		element.textContent = `${views} ${request.suffix}`;
		wrapper.style.display = "flex";
	}
}

async function loadViews() {
	if (!getSelfHostedEndpoint() && !getUmamiGateway()) return;

	const slugs = collectSlugs();
	const pathRequests = collectPathRequests();
	const paths = [
		...new Set([
			...slugs.map(postPathname),
			...pathRequests.map((item) => item.pathname),
		]),
	];

	// 1. 优先 Umami（侧栏数字一回来就先画）
	const umami = await loadFromUmami(paths, setSiteViews);

	// 2. Umami 没覆盖到的部分（含全站数字）才去问自建接口
	//    ⚠️ 口径提醒：Umami 的「全站」是所有路径的 PV 合计，自建那边的 `/` 只是首页 PV。
	//    所以 Umami 挂掉时侧栏这个数会明显变小（不是算错，是换了口径），这是有意的降级。
	//    ⚠️ 另一个坑：新文章刚发布时 Umami 那条路径**存在但为 0**（不是"没有记录"），
	//    只判断 `undefined` 会让自建侧的已有浏览数被 0 盖住 —— 卡片上一直显示「0 次」。
	//    所以「Umami 为 0」也算缺口，交给自建补。
	const missing = paths.filter((pathname) => {
		const fromUmami = umami?.paths[pathname];
		return fromUmami === undefined || fromUmami === 0;
	});
	const selfHosted =
		umami?.site === undefined || missing.length > 0
			? await loadFromSelfHosted([
					...(umami?.site === undefined ? [SITE_PATHNAME] : []),
					...missing,
				])
			: null;

	// 3. 合并渲染：Umami 优先，自建只补缺口（Umami 的全站数字上面已经画过了）
	if (umami?.site === undefined && selfHosted?.[SITE_PATHNAME] !== undefined) {
		setSiteViews(selfHosted[SITE_PATHNAME]);
	}

	// 3. 合并渲染：Umami 优先，自建只补缺口。
	//    但「Umami 为 0 而自建有数」时用自建的数，否则新文章会一直是 0。
	const all: ViewsMap = { ...(selfHosted ?? {}) };
	for (const [pathname, views] of Object.entries(umami?.paths ?? {})) {
		if (views > 0 || all[pathname] === undefined) all[pathname] = views;
	}

	const posts: ViewsMap = {};
	for (const slug of slugs) {
		const views = all[postPathname(slug)];
		if (views !== undefined) {
			posts[slug] = views;
			setPostViews(slug, views);
		}
	}

	for (const request of pathRequests) {
		const views = all[request.pathname];
		if (views !== undefined) setPathViews(request, views);
	}

	(window as any).__POST_VIEWS__ = posts;
	window.dispatchEvent(
		new CustomEvent(POST_VIEWS_EVENT, { detail: { views: posts } }),
	);
}

if (typeof window !== "undefined") {
	// 本脚本是模块（defer），执行时 DOM 已解析完，PostMeta / ViewsCounter 的登记脚本也已跑过
	void loadViews();
}
