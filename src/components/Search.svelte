<script lang="ts">
import Icon from "@components/IconSvelte.svelte";
import { url } from "@utils/url-utils.ts";

interface SearchResult {
	title: string;
	description: string;
	link: string;
	score: number;
	hitCount: number;
	snippet: string;
	published: string;
}

interface PostData {
	title: string;
	description: string;
	content: string;
	link: string;
	published: string;
}

let keyword = "";
let result: SearchResult[] = [];
let isSearching = false;
let sortAsc = false;
let allPosts: PostData[] = [];
let isComposingDesktop = false;
let isComposingMobile = false;

const searchTypes = [
	{ id: "title", label: "标题" },
	{ id: "description", label: "简介" },
	{ id: "content", label: "正文" },
	{ id: "link", label: "路径" },
];
let selectedTypes: string[] = [];
let isMultiSelect = false;

const toggleType = (typeId: string) => {
	if (isMultiSelect) {
		if (selectedTypes.includes(typeId)) {
			selectedTypes = selectedTypes.filter((t) => t !== typeId);
		} else {
			selectedTypes = [...selectedTypes, typeId];
		}
	} else if (selectedTypes.includes(typeId) && selectedTypes.length === 1) {
		selectedTypes = [];
	} else {
		selectedTypes = [typeId];
	}
};

const closePanel = () => {
	if (typeof document === "undefined") return;
	const panel = document.getElementById("search-panel");
	panel?.classList.add("float-panel-closed");
};

const openPanel = () => {
	if (typeof document === "undefined") return;
	const panel = document.getElementById("search-panel");
	panel?.classList.remove("float-panel-closed");
};

const reopenPanelIfHasQuery = (): void => {
	if (keyword || result.length > 0) {
		openPanel();
	}
};

const setPanelVisibility = (show: boolean): void => {
	if (typeof document === "undefined") return;
	const panel = document.getElementById("search-panel");
	if (!panel) return;

	if (show) {
		panel.classList.remove("float-panel-closed");
	} else {
		panel.classList.add("float-panel-closed");
	}
};

const removeSpaces = (value: string) => value.replace(/\s+/g, "");

const sanitizeKeyword = () => {
	keyword = removeSpaces(keyword);
};

// Fetch posts from search.json
async function fetchPosts(): Promise<PostData[]> {
	try {
		const response = await fetch("/search.json", { cache: "no-store" });
		if (!response.ok) {
			throw new Error("Failed to fetch posts");
		}
		return (await response.json()) as PostData[];
	} catch (e) {
		console.error("Failed to fetch posts:", e);
		return [];
	}
}

// Highlight keyword in text
function highlightKeyword(text: string, keyword: string): string {
	if (!text || !keyword) return text;
	const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const regex = new RegExp(escapedKeyword, "gi");
	return text.replace(regex, '<mark class="hl">$&</mark>');
}

// Frontend search function
function searchPosts(
	posts: PostData[],
	keyword: string,
	types: string[],
): SearchResult[] {
	if (!keyword || posts.length === 0) return [];

	const searchTypes =
		types.length > 0 ? types : ["title", "description", "content", "link"];
	const keywordLower = keyword.toLowerCase();
	const results: SearchResult[] = [];

	for (const post of posts) {
		let totalScore = 0;
		let totalHits = 0;
		let matchedSnippet = "";
		let matchedTitle = "";
		let matchedInTitle = false;

		for (const type of searchTypes) {
			const field = post[type as keyof PostData];
			if (!field) continue;

			const fieldLower = field.toLowerCase();
			const hits = (
				fieldLower.match(
					new RegExp(keywordLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
				) || []
			).length;

			if (hits > 0) {
				totalHits += hits;
				const typeScore =
					type === "title"
						? 10
						: type === "description"
							? 5
							: type === "link"
								? 3
								: 1;
				totalScore += hits * typeScore;

				if (type === "title") {
					matchedTitle = highlightKeyword(post.title, keyword);
					matchedInTitle = true;
				}

				if (type === "content" || type === "description") {
					const index = fieldLower.indexOf(keywordLower);
					if (index !== -1) {
						const start = Math.max(0, index - 40);
						const end = Math.min(field.length, index + keyword.length + 40);
						let snippet = field.slice(start, end);
						if (start > 0) snippet = "..." + snippet;
						if (end < field.length) snippet = snippet + "...";
						snippet = highlightKeyword(snippet, keyword);
						if (!matchedSnippet) matchedSnippet = snippet;
					}
				}
			}
		}

		if (totalHits > 0) {
			results.push({
				title: matchedInTitle ? matchedTitle : post.title,
				description: post.description,
				link: post.link,
				score: totalScore,
				hitCount: totalHits,
				snippet:
					matchedSnippet ||
					highlightKeyword(post.description.slice(0, 100), keyword),
				published: post.published || "",
			});
		}
	}

	return [...results].sort((a, b) => {
		if (sortAsc) {
			return new Date(a.published) < new Date(b.published) ? -1 : 1;
		}
		return new Date(a.published) > new Date(b.published) ? -1 : 1;
	});
}

// Fetch and search
async function fetchAndSearch(keyword: string, types: string[]): Promise<void> {
	if (!keyword) {
		result = [];
		setPanelVisibility(false);
		return;
	}

	isSearching = true;
	openPanel();

	const posts = await fetchPosts();
	allPosts = posts;
	result = searchPosts(posts, keyword, types);
	setPanelVisibility(true);
	isSearching = false;
}

$: {
	if (isComposingDesktop || isComposingMobile) {
		openPanel();
	} else if (keyword) {
		void fetchAndSearch(keyword, selectedTypes);
	} else {
		result = [];
		setPanelVisibility(false);
	}
}

$: if (allPosts.length > 0 && keyword && sortAsc !== undefined) {
	result = searchPosts(allPosts, keyword, selectedTypes);
}
</script>

<!-- search bar for desktop view -->
<div id="search-bar" class="hidden min-[1066px]:flex transition-all items-center h-11 mr-2 rounded-lg
      bg-white/5 hover:bg-white/10 focus-within:bg-white/10
">
    <Icon icon="material-symbols:search" class="absolute text-[1.25rem] pointer-events-none ml-3 transition my-auto text-white/30"></Icon>
    <input aria-label="搜索文章" placeholder="搜索" bind:value={keyword} on:focus={() => { void reopenPanelIfHasQuery(); }}
           on:input={sanitizeKeyword}
           on:compositionstart={() => { isComposingDesktop = true; }}
           on:compositionend={() => { isComposingDesktop = false; sanitizeKeyword(); }}
           class="transition-all pl-10 text-sm bg-transparent outline-0
         h-full w-40 active:w-60 focus:w-60 text-white/50"
    >
</div>

<!-- search bar for phone/tablet view -->
<div id="search-bar-mobile" class="relative flex h-11 flex-1 items-center rounded-lg bg-white/5 transition hover:bg-white/10 focus-within:bg-white/10 min-[1066px]:hidden">
    <Icon icon="material-symbols:search" class="pointer-events-none absolute ml-3 text-[1.25rem] text-white/30 transition"></Icon>
    <input aria-label="搜索文章" placeholder="搜索" bind:value={keyword} on:focus={() => { void openPanel(); }}
           on:input={sanitizeKeyword}
           on:compositionstart={() => { isComposingMobile = true; }}
           on:compositionend={() => { isComposingMobile = false; sanitizeKeyword(); }}
           class="h-full w-full rounded-lg bg-transparent pl-10 pr-3 text-sm text-white/50 outline-0"
    >
</div>

<!-- search panel -->
<div id="search-panel" class="float-panel float-panel-closed search-panel absolute z-50 md:w-[30rem]
top-20 left-4 md:left-[unset] right-4 shadow-none rounded-2xl p-2">

    <!-- search bar inside panel for phone/tablet -->
    <div id="search-bar-inside" class="hidden relative min-[1066px]:hidden transition-all items-center h-11 rounded-xl
      bg-white/5 hover:bg-white/10 focus-within:bg-white/10
  ">
        <Icon icon="material-symbols:search" class="absolute text-[1.25rem] pointer-events-none ml-3 transition my-auto text-white/30"></Icon>
        <input placeholder="搜索" bind:value={keyword} on:focus={() => { void reopenPanelIfHasQuery(); }}
               on:input={sanitizeKeyword}
               on:compositionstart={() => { isComposingMobile = true; }}
               on:compositionend={() => { isComposingMobile = false; sanitizeKeyword(); }}
               class="pl-10 absolute inset-0 text-sm bg-transparent outline-0
               focus:w-60 text-white/50"
        >
    </div>

    <!-- search types -->
    <div class="flex flex-wrap gap-2 px-3 py-2 border-b border-white/5 items-center">
        <button 
            class="px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1 {isMultiSelect ? 'bg-[var(--primary)] text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}"
            on:click={() => {
                isMultiSelect = !isMultiSelect;
                if (!isMultiSelect && selectedTypes.length > 1) {
                    selectedTypes = [selectedTypes[0]];
                }
            }}
        >
            <Icon icon={isMultiSelect ? "material-symbols:check-box" : "material-symbols:check-box-outline-blank"} class="text-sm" />
            多选
        </button>
        <div class="w-[1px] h-3 bg-white/10 mx-1"></div>
        {#each searchTypes as type}
            <button 
                class="px-2 py-1 text-xs rounded-md transition-all {selectedTypes.includes(type.id) ? 'bg-[var(--primary)] text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}"
                on:click={() => toggleType(type.id)}
            >
                {type.label}
            </button>
        {/each}
    </div>

    {#if keyword}
        <!-- search results header -->
        {#if result.length > 0}
            <div class="flex items-center justify-between text-xs text-white/40 px-3 py-2 border-b border-white/5">
                <span>{result.length} 条搜索结果</span>
                <button
                    class="px-2 py-1 rounded-md transition-all bg-white/5 text-white/50 hover:bg-white/10 flex items-center gap-1"
                    on:click={() => { sortAsc = !sortAsc; }}
                    title={sortAsc ? "按最新排序" : "按最旧排序"}
                >
                    <Icon icon={sortAsc ? "material-symbols:arrow-upward" : "material-symbols:arrow-downward"} class="text-sm" />
                    {sortAsc ? "最旧优先" : "最新优先"}
                </button>
            </div>
        {/if}

        <!-- search results -->
        {#each result as item (item.link)}
            <a href={url(`/posts/${item.link}/`)} on:click={closePanel}
               class="transition group block
           rounded-xl text-lg px-3 py-2 hover:bg-[var(--btn-plain-bg-hover)] active:bg-[var(--btn-plain-bg-active)]">
                <div class="transition text-90 font-bold group-hover:text-[var(--primary)]">
                    <span class="inline">{@html item.title}</span>
                </div>
                <div class="transition text-xs text-white/50 mb-1 font-mono">
                    /posts/{item.link}
                    <span class="ml-2 text-[var(--primary)]">命中 {item.hitCount} 次</span>
                </div>
                <div class="transition text-sm text-50">
                    {@html item.snippet}
                </div>
            </a>
        {/each}

        {#if result.length === 0}
            <div class="text-sm text-white/50 px-3 py-4">
                无搜索结果
            </div>
        {/if}
    {/if}
</div>

<style>
  :global(.hl) {
    color: var(--primary);
  }
  :global(.hl.no-wrap) {
    white-space: nowrap;
    display: inline-block;
  }
  input:focus {
    outline: 0;
  }
  .search-panel {
    background-color: var(--float-panel-bg-opaque);
    max-height: calc(100vh - 100px);
    overflow-y: auto;
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE and Edge */
  }

  .search-panel::-webkit-scrollbar {
    display: none; /* Chrome, Safari and Opera */
  }

  .search-panel :global(mark) {
    color: var(--primary);
    background: none;
  }
</style>
