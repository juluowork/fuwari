const SELECTOR = ".custom-md img, #post-cover img";

// fancybox 的 JS 与 32.4KB CSS 只有「页面上有可放大的图片」时才需要 ——
// 首页、归档、工具页都没有，之前却是全站加载：Layout 里的这段脚本把 @fancyapps/ui
// 静态 import 进来，于是每个页面都吃一份样式。改成按需动态 import：
// 页面里没有匹配的图片就直接返回，Vite 会把 fancybox 拆成独立 chunk，只有文章页才下载。
async function initFancybox(): Promise<void> {
	if (!document.querySelector(SELECTOR)) return;
	const { bindFancybox, cleanupFancybox } = await import("@utils/fancybox");
	cleanupFancybox();
	bindFancybox(SELECTOR);
}

// 初始加载（不阻塞首屏：失败也不影响正文）
void initFancybox();

// 加密文章解锁后正文图片是运行时注入的，需要重新绑定一次
window.addEventListener("fuwari:images-injected", () => {
	void initFancybox();
});

window.addEventListener("keydown", (e) => {
	if (e.key !== "Escape") return;
});

export {};
