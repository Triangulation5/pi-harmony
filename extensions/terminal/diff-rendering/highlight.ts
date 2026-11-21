import { extname } from "node:path";
import type { BundledLanguage } from "shiki";
import { getDiffRenderingDependencies } from "./types.ts";
import { MAX_RENDER_LINES } from "./types.ts";

const D = getDiffRenderingDependencies;
export const MAX_HL_CHARS = 32_000;
const CACHE_LIMIT = 16;
const EXT_LANG: Record<string, BundledLanguage> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	mjs: "javascript",
	cjs: "javascript",
	py: "python",
	rb: "ruby",
	rs: "rust",
	go: "go",
	java: "java",
	c: "c",
	cpp: "cpp",
	h: "c",
	hpp: "cpp",
	cs: "csharp",
	swift: "swift",
	kt: "kotlin",
	kts: "kotlin",
	html: "html",
	css: "css",
	scss: "scss",
	json: "json",
	yaml: "yaml",
	yml: "yaml",
	toml: "toml",
	md: "markdown",
	sql: "sql",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	lua: "lua",
	php: "php",
	dart: "dart",
	xml: "xml",
	graphql: "graphql",
	svelte: "svelte",
	vue: "vue",
};

export function lang(filePath: string): BundledLanguage | undefined {
	return EXT_LANG[extname(filePath).slice(1).toLowerCase()];
}

const hlCache = new Map<string, string[]>();

export function clearHighlightCache(): void {
	hlCache.clear();
}

function touchCache(key: string, value: string[]): string[] {
	hlCache.delete(key);
	hlCache.set(key, value);
	while (hlCache.size > CACHE_LIMIT) {
		const first = hlCache.keys().next().value;
		if (first === undefined) break;
		hlCache.delete(first);
	}
	return value;
}

function hasExplicitShikiTheme(): boolean {
	return D().hasExplicitShikiTheme();
}

export async function hlBlock(code: string, language: BundledLanguage | undefined): Promise<string[]> {
	if (!code) return [""];
	if (!language || code.length > MAX_HL_CHARS) return code.split("\n");
	if (!hasExplicitShikiTheme()) {
		const key = `pi\0${language}\0${code}`;
		const hit = hlCache.get(key);
		if (hit) return touchCache(key, hit);
		try {
			const out = D().highlightCode(code, language);
			if (Array.isArray(out) && out.length > 0) {
				return touchCache(key, out);
			}
		} catch {
			// fall back to plain lines below
		}
		return code.split("\n");
	}
	const diffTheme = D().getShikiTheme();
	const key = `${D().getThemeName(diffTheme)}\0${language}\0${code}`;
	const hit = hlCache.get(key);
	if (hit) return touchCache(key, hit);
	try {
		const raw = await D().codeToAnsi(code, language, diffTheme as any);
		// Themes generated from pi already meet pi's contrast rules for this background;
		// only bundled themes need their too-dark / too-light colors muted.
		const ansi = typeof diffTheme === "string" ? D().normalizeShikiContrast(raw) : raw;
		const out = (ansi.endsWith("\n") ? ansi.slice(0, -1) : ansi).split("\n");
		return touchCache(key, out);
	} catch {
		return code.split("\n");
	}
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, mapItem: (item: T, index: number) => Promise<R>): Promise<R[]> {
	const safeLimit = Math.max(1, Math.min(items.length || 1, Math.floor(limit)));
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	await Promise.all(Array.from({ length: safeLimit }, async () => {
		while (true) {
			const index = nextIndex++;
			if (index >= items.length) return;
			results[index] = await mapItem(items[index], index);
		}
	}));
	return results;
}

