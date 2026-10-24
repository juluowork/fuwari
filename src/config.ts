import type {
	AnalyticsConfig,
	CookieConsentConfig,
	GitHubEditConfig,
	GiscusConfig,
	ImageFallbackConfig,
	LicenseConfig,
	LinkCardApiConfig,
	NavBarConfig,
	OneDriveConfig,
	ProfileConfig,
	RandomImageConfig,
	SiteConfig,
	SiteVerificationConfig,
	UmamiConfig,
	ViewCounterConfig,
} from "./types/config";
import { LinkPreset } from "./types/config";

// 根域名：自建服务的子域都挂在它下面（p./t./icon./nat./img. 等）
// 2026-10-06 换域：juluo.work → peroe.cn（旧域保留并 301 到新域，见 AGENTS.md §16）
const rootDomain = "peroe.cn";

// 博客使用二级域名，根域留给官网（想换成 www 就改这一行）
const blogSubdomain = "blog";
const customDomain = `${blogSubdomain}.${rootDomain}`;

// 个人 QQ（头像与联系入口都由它推导，换号只需改这一处）
const qqNumber = "1576586736";
// 头像已本地化：原来直接引用 q2.qlogo.cn（URL 里带着 QQ 号，每个访客都能看到），
// 而且原图 106.8KB。现在构建期取回并按 140/320/640 三档压成 WebP 放进 public/assets/avatar/，
// 既不暴露 QQ 号，也不再向第三方发请求。
const qqAvatar = "/assets/avatar/avatar-640.webp";
// favicon 用同一张图的小尺寸版本：spec=0 是原图（实测 106.8KB），而浏览器会积极请求 favicon，
// 等于每个访客白下 100KB；spec=140 只有 6.2KB，缩到 16/32px 依然清晰。
const qqAvatarSmall = "/assets/avatar/avatar-140.webp";

// 联系邮箱：**写死**，不要跟着 rootDomain 变 ——
// peroe.cn 没有 MX 记录（邮箱在 juluo.work 上，route1-3.mx.cloudflare.net），
// 写成 juluo@peroe.cn 会收不到信。
const contactEmail = "juluo@juluo.work";

export const siteConfig: SiteConfig = {
	customDomain,
	rootDomain,
	title: "peroe 的博客",
	subtitle: "juluo",
	description:
		"peroe 的个人博客，记录技术折腾、开发笔记与生活碎片，欢迎来玩。",

	keywords: [
		"peroe",
		"peroe 的博客",
		"juluo",
		"peroe.cn",
		"个人博客",
		"技术博客",
		"Blog",
	],
	lang: "zh_CN", // 'en', 'zh_CN', 'zh_TW', 'ja', 'ko', 'es', 'th'
	themeColor: {
		hue: 255, // Default hue for the theme color, from 0 to 360. e.g. red: 0, teal: 200, cyan: 250, pink: 345
		fixed: true, // Hide the theme color picker for visitors
	},
	banner: {
		enable: false,
		src: "", // 放自己的图后填 '/xxx.avif'（public 目录）或完整 URL

		position: "center", // Equivalent to object-position, only supports 'top', 'center', 'bottom'. 'center' by default
		credit: {
			enable: false, // Display the credit text of the banner image
			text: "", // Credit text to be displayed

			url: "", // (Optional) URL link to the original artwork or artist's page
		},
	},
	background: {
		enable: false, // Enable background image
		src: "", // Background image URL (supports HTTPS)
		position: "center", // Background position: 'top', 'center', 'bottom'
		size: "cover", // Background size: 'cover', 'contain', 'auto'
		repeat: "no-repeat", // Background repeat: 'no-repeat', 'repeat', 'repeat-x', 'repeat-y'
		attachment: "fixed", // Background attachment: 'fixed', 'scroll', 'local'
		opacity: 1, // Background opacity (0-1)
	},
	toc: {
		enable: true, // Display the table of contents on the right side of the post
		depth: 2, // Maximum heading depth to show in the table, from 1 to 3
	},
	favicon: [
		// Leave this array empty to use the default favicon
		{
			src: qqAvatarSmall, // Path of the favicon, relative to the /public directory
			//   sizes: '32x32',              // (Optional) Size of the favicon, set only if you have favicons of different sizes
		},
	],
	server: [],
};

export const navBarConfig: NavBarConfig = {
	links: [
		LinkPreset.Home,
		LinkPreset.Archive,
		{
			name: "友链",
			url: "/friends/",
			external: false,
			icon: "material-symbols:group-outline-rounded",
		},
		{
			name: "赞助",
			url: "/sponsors/",
			external: false,
			icon: "material-symbols:volunteer-activism-outline-rounded",
		},
		{
			name: "工具",
			url: "/tools/",
			external: false,
			icon: "material-symbols:build-outline-rounded",
		},
		{
			name: "标签",
			url: "/tags/",
			external: false,
			icon: "material-symbols:label-outline-rounded",
		},
		{
			name: "统计",
			url: `https://cloud.umami.is/analytics/us/share/${"JqAx99f9Wf6jWaGl"}`,
			external: true,
			icon: "material-symbols:table-chart",
		},
	],
};

export const profileConfig: ProfileConfig = {
	avatar: qqAvatar, // Relative to the /src directory. Relative to the /public directory if it starts with '/'
	name: "peroe",
	bio: "记录折腾与生活。",
	links: [
		{
			name: "QQ",
			icon: "simple-icons:qq",
			url: `https://wpa.qq.com/msgrd?v=3&uin=${qqNumber}&site=qq&menu=yes`,
		},
		{
			name: "GitHub",
			icon: "simple-icons:github",
			url: "https://github.com/juluogo",
		},
		{
			name: "Email",
			icon: "material-symbols:mail-outline-rounded",
			url: `mailto:${contactEmail}`,
		},
	],
};

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const imageFallbackConfig: ImageFallbackConfig = {
	enable: false,
	originalDomain: `https://p.${rootDomain}`,
	fallbackDomain: `https://p.${rootDomain}`,
};

// Umami 统计（Umami Cloud 美国区）
// 后台：https://cloud.umami.is
// 分享页：https://cloud.umami.is/analytics/us/share/JqAx99f9Wf6jWaGl
// 官方追踪代码：
//   <script defer src="https://cloud.umami.is/script.js" data-website-id="842d980c-5e11-4834-a2a8-5daaa285ce66"></script>
// consentLevel 三种取值：
//   "none"                → 直出上面的官方代码，不接 Cookie 同意（始终统计，默认，行为与官方一致）
//   "strictly-necessary"  → 归入「严格必要」类，横幅加载后立即执行
//   "tracking"            → 归入「跟踪」类，用户同意后才加载（以后加了 GA 之类的选这个）
export const umamiConfig: UmamiConfig = {
	enable: true,
	baseUrl: "https://cloud.umami.is",
	shareId: "JqAx99f9Wf6jWaGl",
	websiteId: "842d980c-5e11-4834-a2a8-5daaa285ce66",
	timezone: "Asia/Shanghai",
	consentLevel: "none",
	// 分享数据的只读网关：浏览量读取端优先从这里取数（分享页自己就在打这个域）
	// 美国区 = gateway-us.umami.is；换区时打开自己的分享页，看它请求的是哪个域
	shareApiBase: "https://gateway-us.umami.is",
};

// 文章/页面浏览量：优先读 Umami（它从建站起就在记，数据是连续的），
// 自建 Worker + D1（t.peroe.cn）作为兜底——Umami 接口失败或查不到这个路径时才会用到。
export const viewCounterConfig: ViewCounterConfig = {
	enable: true,
	endpoint: "https://t.peroe.cn",
	preferUmami: true,
};

// 第三方统计：GA4 与 Clarity
//   GA4 后台：https://analytics.google.com → 管理 → 数据流 → 衡量 ID（G- 开头）
//   Clarity 后台：https://clarity.microsoft.com → 项目 → 设置 → 项目 ID
// consentLevel：
//   "none"（当前）—— 页面一打开就加载，和 Umami、自建计数一致；用户在横幅里点「拒绝」后
//                    立即下发停用信号（GA 的 ga-disable、Clarity 的 consent(false)）停止采集。
//   "tracking"    —— 恢复成「同意后才加载」（type="text/plain" + data-cookie-consent="tracking"）。
// 留空某个 ID 就不加载对应的那一个；想全关就把 enable 改成 false。
export const analyticsConfig: AnalyticsConfig = {
	enable: true,
	gaMeasurementId: "G-C3WKKH0NPV",
	clarityProjectId: "yt84gx96hg",
	consentLevel: "none",
};

// 随机图 API：使用现成的静态随机图服务（图片全在边缘节点，不占本站请求额度）
// 接口形态：/ri/h/{n}.webp 横屏、/ri/v/{n}.webp 竖屏；max 为 0 时会尝试读 /count.json
// 若该服务不可用，可换回自建方案：services/random-pic（git 历史里仍保留）
export const randomImageConfig: RandomImageConfig = {
	enable: true,
	baseUrl: "https://pic.060730.xyz",
	max: 979, // 实测 /ri/h/{n}.webp 的最大 n
	maxVertical: 3596, // 实测 /ri/v/{n}.webp 的最大 n
};

// 链接卡片（::url{}）的元数据 API：自建 Worker 部署在 icon.peroe.cn（代码见 services/link-card）
export const linkCardApiConfig: LinkCardApiConfig = {
	enable: true,
	baseUrl: "https://icon.peroe.cn",
};

// Cookie 同意（TermsFeed 免费版）：站点名与隐私政策地址会显示在横幅里
export const cookieConsentConfig: CookieConsentConfig = {
	enable: true,
	siteName: "peroe 的博客",
	privacyPolicyUrl: `https://${customDomain}/privacy/`,
	// ⚠️ TermsFeed 的语言码是「小写 + 下划线」：繁体中文是 `zh_tw`，不是 `zh-TW`。
	// 写错不会报错，只会静默 fallback 成英文横幅（`isSupportedLanguage()` 判定不支持 → userLang="en"）。
	// 可选值见库里的语言表（en / zh_tw / tr / oc …），改动后务必在浏览器里看一眼文案。
	language: "zh_tw",
};

// Giscus 评论：仓库需开启 Discussions，并在仓库上安装 GitHub App https://github.com/apps/giscus
export const giscusConfig: GiscusConfig = {
	enable: true,
	repo: "juluowork/giscus",
	repoId: "R_kgDOPdSugg",
	category: "Announcements",
	categoryId: "DIC_kwDOPdSugs4CuINO",
	mapping: "pathname",
	lang: "zh-CN",
	theme: `https://${customDomain}/css/giscus.css`,
};

// 搜索引擎站长验证：填了就会在 <head> 输出对应 meta 标签
export const siteVerificationConfig: SiteVerificationConfig = {
	bing: "91E5B16A2CD2E86042B923AF197EC312",
	google: "",
	baidu: "",
};

// OneDrive / 对象存储文件索引（工具页的 OneDrive 标签页）：自建后填写
export const oneDriveConfig: OneDriveConfig = {
	enable: false,
	apiBase: `https://e3.${rootDomain}/api/`,
};

export const gitHubEditConfig: GitHubEditConfig = {
	enable: true,
	baseUrl: "https://github.com/juluowork/fuwari/blob/main/src/content/posts",
};

// todoConfig removed from here
