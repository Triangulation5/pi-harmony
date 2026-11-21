import { readMergedSettings, invalidateSettings } from "../../settings/store.ts";
import { rgbFgAnsi, type Rgb } from "../themes/theme-colors.ts";
import type { ShimmerStyle } from "./shimmer-text.ts";

export type SpinnerSpeed = "slow" | "medium" | "fast";
export type SpinnerStyle = "asterisk" | "breathing" | "orbit";
export type ShimmerDirection = "left-to-right" | "right-to-left";

export interface SpinnerSettings {
	adaptive: boolean;
	verbColor: string;
	statusColor: string;
	animatedDots: boolean;
	dotsDisabled: boolean;
	tips: boolean;
	speed: SpinnerSpeed;
	style: SpinnerStyle;
	shimmerDirection: ShimmerDirection;
	shimmerStyle: ShimmerStyle;
	shimmerColor?: string;
}

export const DEFAULT_CLAUDE_ORANGE = "\x1b[38;2;215;119;87m";
export const DEFAULT_STATUS_DIM = "\x1b[38;2;153;153;153m";
export const RESET = "\x1b[0m";
export const RAW_ANSI_RE = /\x1b\[[0-9;]*m/;

const SPINNER_SETTINGS_TTL_MS = 1_000;
const SPINNER_BUST_KEY = Symbol.for("pi-claude-style-tools:spinner-settings-bust");
let cache: { value: SpinnerSettings; expires: number } | null = null;
let lastBust = 0;

export function readSpinnerSettings(): SpinnerSettings {
	const now = Date.now();
	const bust = ((globalThis as any)[SPINNER_BUST_KEY] as number | undefined) ?? 0;
	if (bust !== lastBust) {
		lastBust = bust;
		cache = null;
		invalidateSettings();
	}
	if (cache && cache.expires > now) return cache.value;

	let adaptive = true;
	let animatedDots = false;
	let dotsDisabled = false;
	let tips = true;
	let speed: SpinnerSpeed = "medium";
	let style: SpinnerStyle = "asterisk";
	let shimmerDirection: ShimmerDirection = "left-to-right";
	let shimmerStyle: ShimmerStyle = "sweep";
	let shimmerColor: string | undefined;
	let verbColor = "borderAccent";
	let statusColor = "muted";
	const raw = readMergedSettings();
	if (raw.themeAdaptive === false) adaptive = false;
	if (typeof raw.spinnerVerbColor === "string" && raw.spinnerVerbColor.length > 0) verbColor = raw.spinnerVerbColor;
	if (typeof raw.spinnerStatusColor === "string" && raw.spinnerStatusColor.length > 0) statusColor = raw.spinnerStatusColor;
	if (typeof raw.spinnerAnimatedDots === "boolean") animatedDots = raw.spinnerAnimatedDots;
	if (typeof raw.spinnerDotsDisabled === "boolean") dotsDisabled = raw.spinnerDotsDisabled;
	if (typeof raw.spinnerTips === "boolean") tips = raw.spinnerTips;
	if (raw.spinnerSpeed === "slow" || raw.spinnerSpeed === "medium" || raw.spinnerSpeed === "fast") speed = raw.spinnerSpeed;
	if (raw.spinnerStyle === "asterisk" || raw.spinnerStyle === "breathing" || raw.spinnerStyle === "orbit") style = raw.spinnerStyle;
	if (raw.spinnerShimmerDirection === "left-to-right" || raw.spinnerShimmerDirection === "right-to-left") shimmerDirection = raw.spinnerShimmerDirection;
	if (raw.spinnerShimmerStyle === "sweep" || raw.spinnerShimmerStyle === "flash" || raw.spinnerShimmerStyle === "sparkle") shimmerStyle = raw.spinnerShimmerStyle;
	if (typeof raw.spinnerShimmerColor === "string") shimmerColor = raw.spinnerShimmerColor;

	const value = { adaptive, verbColor, statusColor, animatedDots, dotsDisabled, tips, speed, style, shimmerDirection, shimmerStyle, shimmerColor };
	cache = { value, expires: now + SPINNER_SETTINGS_TTL_MS };
	return value;
}

let claudeOrange = DEFAULT_CLAUDE_ORANGE;
let statusDim = DEFAULT_STATUS_DIM;
let tipDim = DEFAULT_STATUS_DIM;
let lastAdaptive: boolean | null = null;
let lastVerbKey: string | null = null;
let lastStatusKey: string | null = null;
let lastThemeName: string | null = null;

export function getClaudeOrange(): string { return claudeOrange; }
export function getStatusDim(): string { return statusDim; }
export function getTipDim(): string { return tipDim; }

function hexToRgb(key: string): Rgb | null {
	const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(key.trim());
	if (!match) return null;
	let hex = match[1];
	if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
	const n = Number.parseInt(hex, 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function resolveThemeColor(theme: any, key: string, fallbackKey: string): string | null {
	if (!theme) return null;
	const hex = hexToRgb(key);
	if (hex) return rgbFgAnsi(theme, hex);
	if (typeof theme.getFgAnsi !== "function") return null;
	try {
		const value = theme.getFgAnsi(key);
		if (typeof value === "string" && value.length > 0) return value;
	} catch { /* ignore */ }
	if (fallbackKey !== key) {
		try {
			const value = theme.getFgAnsi(fallbackKey);
			if (typeof value === "string" && value.length > 0) return value;
		} catch { /* ignore */ }
	}
	return null;
}

export function applyThemeColors(theme: any): void {
	const { adaptive, verbColor, statusColor } = readSpinnerSettings();
	const themeName = typeof theme?.name === "string" ? theme.name : null;
	const effectiveVerb = themeName === "vague" && verbColor === "borderAccent" ? "#bb9dbd" : verbColor;
	const changed = lastAdaptive !== adaptive || lastVerbKey !== effectiveVerb || lastStatusKey !== statusColor || lastThemeName !== themeName;
	if (changed) {
		lastAdaptive = adaptive;
		lastVerbKey = effectiveVerb;
		lastStatusKey = statusColor;
		lastThemeName = themeName;
		if (!adaptive) {
			claudeOrange = DEFAULT_CLAUDE_ORANGE;
			statusDim = DEFAULT_STATUS_DIM;
			tipDim = DEFAULT_STATUS_DIM;
		}
	}
	if (!theme || !adaptive) return;
	const verb = resolveThemeColor(theme, effectiveVerb, "accent");
	if (verb) claudeOrange = verb;
	const status = resolveThemeColor(theme, statusColor, "muted");
	if (status) statusDim = status;
	const tip = resolveThemeColor(theme, "dim", "muted");
	if (tip) tipDim = tip;
}
