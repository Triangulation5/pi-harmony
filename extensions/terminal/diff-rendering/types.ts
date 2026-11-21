import type { BundledLanguage, BundledTheme } from "shiki";

export interface DiffLine {
	type: "add" | "del" | "ctx" | "sep";
	oldNum: number | null;
	newNum: number | null;
	content: string;
}

export interface ParsedDiff {
	lines: DiffLine[];
	added: number;
	removed: number;
	chars: number;
}

export interface DiffColors {
	fgAdd: string;
	fgDel: string;
	fgCtx: string;
}

export interface DiffPalette {
	reset: string;
	bold: string;
	dim: string;
	bgAdd: string;
	bgDel: string;
	bgAddWord: string;
	bgDelWord: string;
	bgGutterAdd: string;
	bgGutterDel: string;
	bgEmpty: string;
	bgBase: string;
	fgAdd: string;
	fgDel: string;
	fgDim: string;
	fgLineNumber: string;
	fgRule: string;
	fgStripe: string;
	divider: string;
	fgSafeMuted: string;
	defaultColors: DiffColors;
}

export interface DiffRenderSettings {
	diffLayout?: "auto" | "split" | "unified";
	diffTheme?: string;
	diffColors?: Record<string, string>;
}

export interface DiffApi {
	structuredPatch: typeof import("diff").structuredPatch;
	diffWords: typeof import("diff").diffWords;
}

export interface DiffRenderingDependencies {
	getDiff: () => DiffApi;
	getSettings: () => DiffRenderSettings;
	getPalette: () => DiffPalette;
	getShikiTheme: () => BundledTheme | object;
	hasExplicitShikiTheme: () => boolean;
	getThemeName: (theme: BundledTheme | object) => string;
	highlightCode: (code: string, language: BundledLanguage) => string[];
	codeToAnsi: (code: string, language: BundledLanguage, theme: BundledTheme | object) => Promise<string>;
	normalizeShikiContrast: (ansi: string) => string;
	keyHint: (binding: string, description: string) => string;
	visibleWidth: (text: string) => number;
	truncateToWidth: (text: string, width: number, ellipsis?: string) => string;
	getBranchIndent: () => string;
}

let dependencies: DiffRenderingDependencies | undefined;

export function configureDiffRendering(deps: DiffRenderingDependencies): void {
	dependencies = deps;
}

export function getDiffRenderingDependencies(): DiffRenderingDependencies {
	if (!dependencies) throw new Error("Diff rendering dependencies have not been configured");
	return dependencies;
}

export const MAX_PREVIEW_LINES = 60;
export const MAX_RENDER_LINES = 150;
export const DIFF_RENDER_CONCURRENCY = 2;
