import type { BundledTheme } from "shiki";
import {
	blendForContrast,
	mixRgb as mixThemeRgb,
	rgbBgAnsi,
	rgbFgAnsi,
	rgbToHex,
	terminalDefaultColors,
	themeAppearance,
	themeTokenRgb,
	type Rgb,
	type ShikiThemeRegistration,
} from "./themes/theme-colors.ts";

export type DiffColors = { fgAdd: string; fgDel: string; fgCtx: string };

export interface DiffPreset {
	name: string;
	description: string;
	shikiTheme?: string;
	bgAdd?: string;
	bgDel?: string;
	bgAddHighlight?: string;
	bgDelHighlight?: string;
	bgGutterAdd?: string;
	bgGutterDel?: string;
	bgEmpty?: string;
	fgAdd?: string;
	fgDel?: string;
	fgDim?: string;
	fgLnum?: string;
	fgRule?: string;
	fgStripe?: string;
	fgSafeMuted?: string;
}

export interface ThemePaletteDependencies {
	readSettings(): { diffTheme?: string; diffColors?: Record<string, string>; themeAdaptive?: boolean };
	themeAdaptiveEnabled(): boolean;
	transparentBg: string;
	transparentReset: string;
	resetClaudeChrome(): void;
	getBorderColor(): string;
	setToolStatusSuccess(value: string): void;
	setToolStatusError(value: string): void;
	setToolStatusPending(value: string): void;
	getToolStatusSuccess(): string;
	getToolStatusError(): string;
	getToolStatusPending(): string;
	applyToolBranchColor(theme?: any): void;
	syncOutlineChromeFromBranch(theme?: any): void;
	applyToolBackgroundMode(theme?: any): void;
	bumpToolBranchVisualEpoch(): void;
	syncDiffShikiTheme(theme?: any): void;
	toolBackgroundMode(): "default" | "transparent" | "outlines";
}

export interface ThemePalette {
	dReset: string;
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
	fgSafeMuted: string;
	divider: string;
	defaultColors: DiffColors;
	diffTheme: BundledTheme | ShikiThemeRegistration;
	diffOnLightBg: boolean;
	autoDerivePending: boolean;
	hasExplicitBgConfig: boolean;
	applyThemePaletteIfNeeded(theme: any): void;
	applyDiffPalette(): void;
	autoDeriveBgFromTheme(theme: any): void;
	resetThemePalette(): void;
	resolveDiffColors(theme?: any): DiffColors;
	normalizeShikiContrast(ansi: string): string;
	hasExplicitShikiTheme(): boolean;
	setAutoDerivePending(value: boolean): void;
	setDiffOnLightBackground(theme: any): void;
	invalidateThemePaletteCache(): void;
	currentThemePaletteFingerprint(): string | undefined;
	themePaletteFingerprint(theme: any): string;
	isLightThemeBackground(theme: any): boolean;
}

export function safeFgAnsi(theme: any, key: string): string | null {
	try {
		const ansi = theme?.getFgAnsi?.(key);
		return typeof ansi === "string" && ansi.length > 0 ? ansi : null;
	} catch {
		return null;
	}
}

export function safeBgAnsi(theme: any, key: string): string | null {
	try {
		const ansi = theme?.getBgAnsi?.(key);
		return typeof ansi === "string" && ansi.length > 0 ? ansi : null;
	} catch {
		return null;
	}
}

const CUBE_VALUES = [0, 95, 135, 175, 215, 255];

function xterm256ToRgb(index: number): Rgb | null {
	if (!Number.isInteger(index) || index < 0 || index > 255) return null;
	if (index < 16) {
		const basic: Array<[number, number, number]> = [
			[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
			[0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
			[128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0],
			[0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
		];
		const [r, g, b] = basic[index];
		return { r, g, b };
	}
	if (index < 232) {
		const i = index - 16;
		return {
			r: CUBE_VALUES[Math.floor(i / 36) % 6],
			g: CUBE_VALUES[Math.floor(i / 6) % 6],
			b: CUBE_VALUES[i % 6],
		};
	}
	const level = 8 + (index - 232) * 10;
	return { r: level, g: level, b: level };
}

export function parseAnsiRgb(ansi: string): Rgb | null {
	if (!ansi) return null;
	const esc = "\u001b";
	const tc = ansi.match(new RegExp(`${esc}\\[(?:38|48);2;(\\d+);(\\d+);(\\d+)m`));
	if (tc) return { r: +tc[1], g: +tc[2], b: +tc[3] };
	const idx = ansi.match(new RegExp(`${esc}\\[(?:38|48);5;(\\d+)m`));
	if (idx) return xterm256ToRgb(+idx[1]);
	return null;
}

export function hexToBgAnsi(hex: string): string {
	if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "";
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `\x1b[48;2;${r};${g};${b}m`;
}

export function hexToFgAnsi(hex: string): string {
	if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "";
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `\x1b[38;2;${r};${g};${b}m`;
}

export const DIFF_PRESETS: Record<string, DiffPreset> = {
	default: {
		name: "default", description: "Original pi-diff colors",
		bgAdd: "#162620", bgDel: "#2d1919", bgAddHighlight: "#234b32", bgDelHighlight: "#502323",
		bgGutterAdd: "#12201a", bgGutterDel: "#261616", bgEmpty: "#121212",
		fgDim: "#505050", fgLnum: "#646464", fgRule: "#323232", fgStripe: "#282828", fgSafeMuted: "#8b949e",
	},
	midnight: {
		name: "midnight", description: "Subtle tints for black backgrounds",
		bgAdd: "#0d1a12", bgDel: "#1a0d0d", bgAddHighlight: "#1a3825", bgDelHighlight: "#381a1a",
		bgGutterAdd: "#091208", bgGutterDel: "#120908", bgEmpty: "#080808",
		fgDim: "#404040", fgLnum: "#505050", fgRule: "#282828", fgStripe: "#1e1e1e", fgSafeMuted: "#8b949e",
	},
	neon: {
		name: "neon", description: "Higher contrast backgrounds",
		bgAdd: "#1a3320", bgDel: "#331a16", bgAddHighlight: "#2d5c3a", bgDelHighlight: "#5c2d2d",
		bgGutterAdd: "#142818", bgGutterDel: "#28120e", bgEmpty: "#141414",
		fgDim: "#606060", fgLnum: "#787878", fgRule: "#404040", fgStripe: "#303030", fgSafeMuted: "#9da5ae",
	},
};

export function createThemePalette(deps: ThemePaletteDependencies): ThemePalette {
	let dReset = "\x1b[0m";
	let bgAdd = "\x1b[49m";
	let bgDel = "\x1b[49m";
	let bgAddWord = "\x1b[49m";
	let bgDelWord = "\x1b[49m";
	let bgGutterAdd = "\x1b[49m";
	let bgGutterDel = "\x1b[49m";
	let bgEmpty = "\x1b[49m";
	let bgBase = "\x1b[49m";
	let fgAdd = "\x1b[38;2;100;180;120m";
	let fgDel = "\x1b[38;2;200;100;100m";
	let fgDim = "\x1b[38;2;80;80;80m";
	let fgLineNumber = "\x1b[38;2;100;100;100m";
	let fgRule = "\x1b[38;2;50;50;50m";
	let fgStripe = "\x1b[38;2;40;40;40m";
	let fgSafeMuted = "\x1b[38;2;139;148;158m";
	let divider = `${fgRule}│${dReset}`;
	let defaultColors: DiffColors = { fgAdd, fgDel, fgCtx: fgDim };
	let diffTheme: BundledTheme | ShikiThemeRegistration =
		(process.env.DIFF_THEME as BundledTheme | undefined) ?? "github-dark";
	let diffOnLightBg = false;
	let autoDerivePending = true;
	let hasExplicitBgConfig = false;
	let cacheTheme: unknown = null;
	let cacheName: string | null = null;
	let cacheFingerprint: string | null = null;
	let lastSeenTheme: unknown = null;
	const explicitFgFields = new Set<"fgAdd" | "fgDel" | "fgDim" | "fgLnum" | "fgRule" | "fgStripe" | "fgSafeMuted">();

	const claudeDefaults = {
		fgDim: "\x1b[38;2;80;80;80m", fgLnum: "\x1b[38;2;100;100;100m",
		fgRule: "\x1b[38;2;50;50;50m", fgStripe: "\x1b[38;2;40;40;40m",
		fgSafeMuted: "\x1b[38;2;139;148;158m", fgAdd: "\x1b[38;2;100;180;120m",
		fgDel: "\x1b[38;2;200;100;100m",
		toolStatusSuccess: "\x1b[32m", toolStatusError: "\x1b[31m", toolStatusPending: "\x1b[90m",
	};

	function themeFgRgb(theme: any, key: string): Rgb | null {
		const ansi = safeFgAnsi(theme, key);
		return ansi ? parseAnsiRgb(ansi) : null;
	}
	function themeBgRgb(theme: any, key: string): Rgb | null {
		const ansi = safeBgAnsi(theme, key);
		return ansi ? parseAnsiRgb(ansi) : null;
	}
	function isLightThemeBackground(theme: any): boolean {
		const appearance = themeAppearance(theme);
		if (appearance) return appearance === "light";
		const panel = themeBgRgb(theme, "toolSuccessBg") || themeBgRgb(theme, "userMessageBg") || themeBgRgb(theme, "selectedBg");
		if (panel) {
			const lum = 0.2126 * panel.r + 0.7152 * panel.g + 0.0722 * panel.b;
			return lum > 165;
		}
		const fg = themeFgRgb(theme, "text") || themeFgRgb(theme, "fg");
		if (fg) {
			const lum = 0.2126 * fg.r + 0.7152 * fg.g + 0.0722 * fg.b;
			return lum < 95;
		}
		return false;
	}
	function themePaletteFingerprint(theme: any): string {
		const keys = ["success", "error", "borderMuted", "accent", "muted", "toolDiffAdded", "toolDiffRemoved", "syntaxKeyword", "syntaxString"] as const;
		const defaults = terminalDefaultColors(theme);
		const terminal = defaults ? `${rgbToHex(defaults.background)}${rgbToHex(defaults.foreground)}` : "";
		return [...keys.map((k) => safeFgAnsi(theme, k) ?? ""), themeAppearance(theme) ?? "", terminal].join("\u001f");
	}
	function currentThemePaletteFingerprint(): string | undefined {
		return lastSeenTheme ? themePaletteFingerprint(lastSeenTheme) : undefined;
	}
	function invalidateThemePaletteCache(): void {
		cacheTheme = null; cacheName = null; cacheFingerprint = null;
	}

	function mixBg(base: Rgb, accent: Rgb, intensity: number): string {
		const r = Math.round(base.r + (accent.r - base.r) * intensity);
		const g = Math.round(base.g + (accent.g - base.g) * intensity);
		const b = Math.round(base.b + (accent.b - base.b) * intensity);
		return `\x1b[48;2;${r};${g};${b}m`;
	}
	function diffSurfaceRgb(theme: any): Rgb | null {
		if (deps.toolBackgroundMode() === "default") {
			const panel = themeTokenRgb(theme, "toolSuccessBg");
			if (panel) return panel;
		}
		return terminalDefaultColors(theme)?.background ?? null;
	}
	const DIFF_TINT = {
		dark: { line: { add: 0.2, del: 0.17 }, word: { add: 0.36, del: 0.32 }, gutter: { add: 0.12, del: 0.1 } },
		light: { line: { add: 0.16, del: 0.13 }, word: { add: 0.3, del: 0.26 }, gutter: { add: 0.1, del: 0.08 } },
	} as const;
	function deriveDiffPaletteFromThemeColors(theme: any): boolean {
		const add = themeTokenRgb(theme, "toolDiffAdded");
		const del = themeTokenRgb(theme, "toolDiffRemoved");
		const surface = diffSurfaceRgb(theme);
		if (!add || !del || !surface) return false;
		const tint = DIFF_TINT[isLightThemeBackground(theme) ? "light" : "dark"];
		const bg = (color: Rgb, amount: number) => rgbBgAnsi(theme, mixThemeRgb(surface, color, amount));
		fgAdd = rgbFgAnsi(theme, add);
		fgDel = rgbFgAnsi(theme, del);
		bgAdd = bg(add, tint.line.add);
		bgDel = bg(del, tint.line.del);
		bgAddWord = bg(add, tint.word.add);
		bgDelWord = bg(del, tint.word.del);
		bgGutterAdd = bg(add, tint.gutter.add);
		bgGutterDel = bg(del, tint.gutter.del);
		return true;
	}
	function autoDeriveBgFromTheme(theme: any): void {
		const useTheme = deps.themeAdaptiveEnabled() && theme;
		const onLight = useTheme && isLightThemeBackground(theme);
		diffOnLightBg = !!onLight;
		if (useTheme && deriveDiffPaletteFromThemeColors(theme)) {
			bgEmpty = deps.transparentBg;
			bgBase = deps.transparentBg;
			dReset = deps.transparentReset;
			divider = `${fgRule}│${dReset}`;
			defaultColors = { fgAdd, fgDel, fgCtx: fgDim };
			return;
		}
		const universalAdd = { r: 110, g: 210, b: 130 };
		const universalDel = { r: 225, g: 110, b: 110 };
		const addFgRgb = (useTheme && themeFgRgb(theme, "toolDiffAdded")) || universalAdd;
		const delFgRgb = (useTheme && themeFgRgb(theme, "toolDiffRemoved")) || universalDel;
		const base = (useTheme && themeBgRgb(theme, "toolSuccessBg")) ||
			(useTheme && themeBgRgb(theme, "userMessageBg")) ||
			(onLight ? { r: 232, g: 233, b: 236 } : { r: 32, g: 35, b: 42 });
		const addTint = mixThemeRgb(addFgRgb, { r: 84, g: 190, b: 118 }, 0.35);
		const delTint = mixThemeRgb(delFgRgb, { r: 232, g: 95, b: 122 }, 0.65);
		fgAdd = `\x1b[38;2;${Math.round(addFgRgb.r)};${Math.round(addFgRgb.g)};${Math.round(addFgRgb.b)}m`;
		fgDel = `\x1b[38;2;${Math.round(delFgRgb.r)};${Math.round(delFgRgb.g)};${Math.round(delFgRgb.b)}m`;
		bgAdd = mixBg(base, addTint, 0.24);
		bgDel = mixBg(base, delTint, 0.12);
		bgAddWord = mixBg(base, addTint, 0.44);
		bgDelWord = mixBg(base, delTint, 0.26);
		bgGutterAdd = mixBg(base, addTint, 0.14);
		bgGutterDel = mixBg(base, delTint, 0.08);
		bgEmpty = deps.transparentBg;
		bgBase = deps.transparentBg;
		dReset = deps.transparentReset;
		divider = `${fgRule}│${dReset}`;
		defaultColors = { fgAdd, fgDel, fgCtx: fgDim };
	}

	function resetThemePalette(): void {
		deps.resetClaudeChrome();
		deps.setToolStatusSuccess(claudeDefaults.toolStatusSuccess);
		deps.setToolStatusError(claudeDefaults.toolStatusError);
		deps.setToolStatusPending(claudeDefaults.toolStatusPending);
		if (!explicitFgFields.has("fgDim")) fgDim = claudeDefaults.fgDim;
		if (!explicitFgFields.has("fgLnum")) fgLineNumber = claudeDefaults.fgLnum;
		if (!explicitFgFields.has("fgRule")) fgRule = claudeDefaults.fgRule;
		if (!explicitFgFields.has("fgStripe")) fgStripe = claudeDefaults.fgStripe;
		if (!explicitFgFields.has("fgSafeMuted")) fgSafeMuted = claudeDefaults.fgSafeMuted;
		if (!explicitFgFields.has("fgAdd")) fgAdd = claudeDefaults.fgAdd;
		if (!explicitFgFields.has("fgDel")) fgDel = claudeDefaults.fgDel;
		divider = `${fgRule}│${dReset}`;
		defaultColors = { fgAdd, fgDel, fgCtx: fgDim };
	}

	function applyThemePaletteIfNeeded(theme: any): void {
		if (!theme) return;
		lastSeenTheme = theme;
		if (!deps.themeAdaptiveEnabled()) {
			deps.applyToolBranchColor(theme);
			deps.syncOutlineChromeFromBranch(theme);
			return;
		}
		const themeName = typeof theme?.name === "string" ? theme.name : "";
		const fingerprint = themePaletteFingerprint(theme);
		if (cacheTheme === theme && cacheName === themeName && cacheFingerprint === fingerprint) {
			deps.applyToolBranchColor(theme);
			deps.syncOutlineChromeFromBranch(theme);
			return;
		}
		const paletteChanged = cacheName !== themeName || cacheFingerprint !== fingerprint;
		if (paletteChanged) {
			deps.bumpToolBranchVisualEpoch();
			deps.applyToolBackgroundMode(theme);
		}
		cacheTheme = theme; cacheName = themeName; cacheFingerprint = fingerprint;
		const borderMuted = safeFgAnsi(theme, "borderMuted");
		const muted = safeFgAnsi(theme, "muted");
		const dim = safeFgAnsi(theme, "dim") ?? muted;
		deps.applyToolBranchColor(theme);
		const chromeFg = deps.getBorderColor();
		deps.setToolStatusSuccess(safeFgAnsi(theme, "success") ?? deps.getToolStatusSuccess());
		deps.setToolStatusError(safeFgAnsi(theme, "error") ?? deps.getToolStatusError());
		const thinking = safeFgAnsi(theme, "thinkingText");
		deps.setToolStatusPending(dim ?? muted ?? thinking ?? deps.getToolStatusPending());
		if (!explicitFgFields.has("fgDim") && muted) fgDim = muted;
		if (!explicitFgFields.has("fgLnum") && muted) fgLineNumber = muted;
		const ruleChrome = chromeFg ?? borderMuted;
		if (!explicitFgFields.has("fgRule") && ruleChrome) fgRule = ruleChrome;
		if (!explicitFgFields.has("fgStripe") && ruleChrome) fgStripe = ruleChrome;
		if (!explicitFgFields.has("fgSafeMuted") && muted) fgSafeMuted = muted;
		divider = `${fgRule}│${dReset}`;
		if (!hasExplicitBgConfig) {
			autoDeriveBgFromTheme(theme);
			autoDerivePending = false;
		} else if (deps.themeAdaptiveEnabled()) {
			diffOnLightBg = isLightThemeBackground(theme);
		}
		deps.syncDiffShikiTheme(theme);
	}

	function applyDiffPalette(): void {
		const settings = deps.readSettings();
		const config = { diffTheme: settings.diffTheme, diffColors: settings.diffColors };
		hasExplicitBgConfig = false;
		const preset = config.diffTheme ? DIFF_PRESETS[config.diffTheme] : null;
		if (preset) hasExplicitBgConfig = true;
		const overrides = config.diffColors ?? {};
		if (Object.keys(overrides).length > 0) hasExplicitBgConfig = true;
		explicitFgFields.clear();
		const applyBg = (key: string, presetValue: string | undefined, set: (value: string) => void) => {
			const hex = overrides[key] ?? presetValue;
			if (!hex) return;
			const ansi = hexToBgAnsi(hex);
			if (ansi) set(ansi);
		};
		const applyFg = (key: "fgAdd" | "fgDel" | "fgDim" | "fgLnum" | "fgRule" | "fgStripe" | "fgSafeMuted", presetValue: string | undefined, set: (value: string) => void) => {
			const hex = overrides[key] ?? presetValue;
			if (!hex) return;
			const ansi = hexToFgAnsi(hex);
			if (!ansi) return;
			set(ansi); explicitFgFields.add(key);
		};
		applyBg("bgAdd", preset?.bgAdd, (v) => { bgAdd = v; });
		applyBg("bgDel", preset?.bgDel, (v) => { bgDel = v; });
		applyBg("bgAddHighlight", preset?.bgAddHighlight, (v) => { bgAddWord = v; });
		applyBg("bgDelHighlight", preset?.bgDelHighlight, (v) => { bgDelWord = v; });
		applyBg("bgGutterAdd", preset?.bgGutterAdd, (v) => { bgGutterAdd = v; });
		applyBg("bgGutterDel", preset?.bgGutterDel, (v) => { bgGutterDel = v; });
		applyBg("bgEmpty", preset?.bgEmpty, (v) => { bgEmpty = v; });
		applyFg("fgAdd", preset?.fgAdd, (v) => { fgAdd = v; });
		applyFg("fgDel", preset?.fgDel, (v) => { fgDel = v; });
		applyFg("fgDim", preset?.fgDim, (v) => { fgDim = v; });
		applyFg("fgLnum", preset?.fgLnum, (v) => { fgLineNumber = v; });
		applyFg("fgRule", preset?.fgRule, (v) => { fgRule = v; });
		applyFg("fgStripe", preset?.fgStripe, (v) => { fgStripe = v; });
		applyFg("fgSafeMuted", preset?.fgSafeMuted, (v) => { fgSafeMuted = v; });
		const shiki = overrides.shikiTheme ?? preset?.shikiTheme;
		if (shiki) diffTheme = shiki as BundledTheme;
		divider = `${fgRule}│${dReset}`;
		defaultColors = { fgAdd, fgDel, fgCtx: fgDim };
		autoDerivePending = !hasExplicitBgConfig;
	}
	function resolveDiffColors(theme?: any): DiffColors {
		applyThemePaletteIfNeeded(theme);
		if (autoDerivePending && theme?.getFgAnsi) {
			autoDeriveBgFromTheme(theme);
			autoDerivePending = false;
		}
		return defaultColors;
	}
	function hasExplicitShikiTheme(): boolean {
		if (process.env.DIFF_THEME) return true;
		const settings = deps.readSettings();
		return Boolean(settings.diffTheme || settings.diffColors?.shikiTheme);
	}
	function normalizeShikiContrast(ansi: string): string {
		const darkFgThreshold = diffOnLightBg ? 140 : 72;
		return ansi.replace(/\x1b\[([0-9;]*)m/g, (seq, params: string) => {
			if (params === "30" || params === "90" || params === "38;5;0" || params === "38;5;8") return fgSafeMuted;
			if (!params.startsWith("38;2;")) return seq;
			const parts = params.split(";").map(Number);
			if (parts.length !== 5 || parts.some((n) => !Number.isFinite(n))) return seq;
			const [, , r, g, b] = parts;
			const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			if (diffOnLightBg) return luminance < darkFgThreshold ? seq : fgSafeMuted;
			return luminance < darkFgThreshold ? fgSafeMuted : seq;
		});
	}

	const palette = {} as ThemePalette;
	Object.defineProperties(palette, {
		dReset: { get: () => dReset },
		bgAdd: { get: () => bgAdd }, bgDel: { get: () => bgDel },
		bgAddWord: { get: () => bgAddWord }, bgDelWord: { get: () => bgDelWord },
		bgGutterAdd: { get: () => bgGutterAdd }, bgGutterDel: { get: () => bgGutterDel },
		bgEmpty: { get: () => bgEmpty }, bgBase: { get: () => bgBase },
		fgAdd: { get: () => fgAdd }, fgDel: { get: () => fgDel }, fgDim: { get: () => fgDim },
		fgLineNumber: { get: () => fgLineNumber }, fgRule: { get: () => fgRule },
		fgStripe: { get: () => fgStripe }, fgSafeMuted: { get: () => fgSafeMuted },
		divider: { get: () => divider }, defaultColors: { get: () => defaultColors },
		diffTheme: { get: () => diffTheme }, diffOnLightBg: { get: () => diffOnLightBg },
		autoDerivePending: { get: () => autoDerivePending }, hasExplicitBgConfig: { get: () => hasExplicitBgConfig },
	});
	Object.assign(palette, {
		applyThemePaletteIfNeeded, applyDiffPalette, autoDeriveBgFromTheme, resetThemePalette,
		resolveDiffColors, normalizeShikiContrast, hasExplicitShikiTheme, invalidateThemePaletteCache,
		currentThemePaletteFingerprint, themePaletteFingerprint, isLightThemeBackground,
		setAutoDerivePending: (value: boolean) => { autoDerivePending = value; },
		setDiffOnLightBackground: (theme: any) => { diffOnLightBg = isLightThemeBackground(theme); },
	});
	return palette;
}
