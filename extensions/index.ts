import { existsSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

import type {
	BashToolDetails,
	EditToolDetails,
	ExtensionAPI,
	GrepToolDetails,
	ReadToolDetails,
	Theme,
} from "@earendil-works/pi-coding-agent";
import {
	AssistantMessageComponent,
	CustomMessageComponent,
	ToolExecutionComponent,
	UserMessageComponent,
	keyHint,
	keyText,
	rawKeyHint,
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
	highlightCode,
} from "@earendil-works/pi-coding-agent";
import {
	Box,
	Container,
	deleteAllKittyImages,
	getCapabilities,
	getImageDimensions,
	imageFallback,
	Markdown,
	ProcessTerminal,
	Spacer,
	Text,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import * as PiTui from "@earendil-works/pi-tui";
import { createRequire } from "node:module";
import { homedir } from "node:os";

import type { BundledLanguage, BundledTheme } from "shiki";

import {
	buildBashCommandPresentation,
	buildBashPreview,
	describeBashSource,
} from "./bash/command.ts";
import {
	createBashPresentation,
} from "./bash/presentation.ts";
import {
	BASH_INTENT_MODES,
	cleanIntentLabel,
	configureLocalIntents,
	localIntentFor,
	normalizeBashIntentMode,
	requestLocalIntent,
	watchLocalIntent,
	type BashIntentMode,
} from "./bash/intent.ts";
import {
	detectBashFileEdit,
	readBashEditSnapshot,
	resolveBashEditPath,
	snapshotBashFileEdit,
	type BashFileEdit,
} from "./bash/file-edit.ts";
import { registerToolsCommand, handleHeaderCommand as registerHeaderCommand, type ToolsCommandDependencies } from "./commands/tools.ts";
import { registerThemeCommand, type ThemeCommandDependencies } from "./commands/theme.ts";
import { registerSpinnerCommand, type SpinnerCommandDependencies } from "./commands/spinner.ts";

import { getUserSettingsPath } from "./settings/path.ts";
import { invalidateSettings, readMergedSettings, writeSettingsKey } from "./settings/store.ts";
import {
	blendForContrast,
	mixRgb as mixThemeRgb,
	rgbBgAnsi,
	rgbFgAnsi,
	rgbToHex,
	shikiThemeFromPiTheme,
	terminalDefaultColors,
	themeAppearance,
	themeTokenRgb,
	type ShikiThemeRegistration,
} from "./terminal/themes/theme-colors.ts";
import {
	activeThemeName,
	requestTerminalColorScheme,
	startFocusResync,
	SYSTEM_THEME_NAME,
	systemThemeAvailable,
} from "./terminal/themes/terminal-theme.ts";
import {
	createThemePalette,
	parseAnsiRgb,
	safeFgAnsi,
	safeBgAnsi,
	type ThemePalette,
} from "./terminal/theme-palette.ts";
import {
	buildParagraphSegments,
	renderMathBlock,
	type MarkdownOptions,
	type MarkdownThemeLike,
	type ParagraphSegment,
} from "./markdown/math.ts";
import {
	applyClickSlop,
	claimClickHover,
	dispatchMouseWithClickFixes,
	dispatchTarget,
	forgetClickHover,
	getGroupHover,
	keepClickedRowInPlace,
	mouseLayoutTarget,
	patchFullscreenHoverExit,
	patchScrollViewReveal,
	pressInsideScrollView,
	requestComponentRender,
	revealScrollTop,
	setGroupHover,
	toggleExpandedComponent,
	toggleGroupedTools,
	type MouseLayoutEntry,
	type TuiMouseDispatchResult,
	type TuiMouseEvent,
} from "./terminal/fullscreen-mouse.ts";
import { createToolGroupComponent, type ToolStatus } from "./terminal/tool-group-component.ts";
import { createToolGroupStatusFormatting } from "./terminal/tool-groups/status-formatting.ts";
import { createToolGroupLineFormatting, toolRowPad } from "./terminal/tool-groups/line-formatting.ts";
import { ACTIVE_TOOL_GROUPS, createToolGroupingState } from "./terminal/tool-groups/state.ts";
import { createToolExecutionComponentPatches, setToolHover } from "./terminal/tool-renderers/component-patches.ts";
import { dirIcon, fileIcon } from "./terminal/file-icons.ts";
import {
	COPY_DROP_LINE,
	COPY_MARK_PREFIX,
	createCopyFormatting,
	OSC133_ZONE_END,
	OSC133_ZONE_FINAL,
	OSC133_ZONE_START,
} from "./terminal/copy-formatting.ts";
import {
	renderGenericToolCall,
	summarizeDirectMcpArgs,
	summarizeOpenAiToolCall,
	type ToolCallRendererDependencies,
} from "./terminal/tool-renderers/tool-calls.ts";
import {
	getFirstImageBlock,
	renderGenericToolResult,
	renderMcpToolResult,
	renderOpenAiToolResult,
	renderReadImageResult,
	type ToolResultRendererDependencies,
} from "./terminal/tool-renderers/tool-results.ts";
import {
	humanizeToolName,
	isMcpToolCandidate,
	isOpenAiToolCandidate,
	parseNamespacedMcpToolName,
	shouldUseGenericToolRenderer,
	toolDisplayName,
} from "./terminal/tool-renderers/tool-names.ts";
import {
	clearHighlightCache,
	configureDiffRendering,
	contextDiffWidth,
	DIFF_RENDER_CONCURRENCY,
	diffSummaryWithMeta,
	getCachedParsedDiff,
	lang,
	mapWithConcurrency,
	MAX_PREVIEW_LINES,
	MAX_RENDER_LINES,
	parseDiff,
	renderSplit,
	renderUnified,
	shouldUseSplit,
	summarizeDiff,
} from "./terminal/diff-rendering/index.ts";
import type { DiffColors, DiffLine, ParsedDiff } from "./terminal/diff-rendering/types.ts";
import { registerReadSearchTools } from "./terminal/tools/read-search-tools.ts";
import { registerBashTool } from "./terminal/tools/bash-tool.ts";
import { registerEditTools } from "./terminal/tools/edit-tools.ts";
import {
	countDiffHunks,
	createApplyPatchRenderer,
	formatLineMeta,
	type ApplyPatchRenderer,
} from "./terminal/tools/apply-patch-preview.ts";
import {
	createEditPreview,
	type LocalizedEditDiff,
} from "./terminal/tools/edit-preview.ts";
import { createConversationThinking, ADD_SEQUENCE_KEY, SUPERSEDED_ASSISTANT_KEY } from "./terminal/messages/conversation-thinking.ts";
import { createMessageParagraphClasses } from "./terminal/messages/paragraphs.ts";
import { createMessageRenderPatches, type MessageRenderPatchDependencies } from "./terminal/messages/render-patches.ts";
import { patchAssistantMessages as patchExtractedAssistantMessages } from "./terminal/messages/assistant-messages.ts";
import { patchGlobalContainerBorders } from "./terminal/messages/container-borders.ts";
import { createThinkingLabels } from "./terminal/messages/thinking-labels.ts";

export {
	applyClickSlop,
	dispatchMouseWithClickFixes,
	pressInsideScrollView,
	revealScrollTop,
} from "./terminal/fullscreen-mouse.ts";

// `diff` is only needed once a diff is actually rendered, so load it on first use
// instead of at extension load. The proxy keeps every `Diff.fn(...)` call site as is.
type DiffModule = typeof import("diff");
const nodeRequire = createRequire(import.meta.url);
let loadedDiff: DiffModule | undefined;
const Diff: DiffModule = new Proxy({} as DiffModule, {
	get: (_target, key) => (loadedDiff ??= nodeRequire("diff") as DiffModule)[key as keyof DiffModule],
});

// Pi 0.85+ fullscreen mouse types. The 0.79 peer typings do not export them yet.
const RESET = "\x1b[0m";
const TRANSPARENT_BG = "\x1b[49m";
const TRANSPARENT_RESET = `${RESET}${TRANSPARENT_BG}`;

// User/code box borders and thinking/thought text use the outline chrome color, branch
// connectors ├└│ the fainter branch color (see chromeAnsi / syncOutlineChromeFromBranch).
let BORDER_COLOR = "\x1b[38;5;238m";
let CODE_BLOCK_LANG_FG = "\x1b[38;2;95;95;95m";
const CHROME_ITALIC = "\x1b[3m";
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const ANSI_PRESENT_RE = /\x1b\[[0-9;]*m/;

const PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-container-render");
const TOOL_RENDER_CACHE = Symbol.for("pi-claude-style-tools:tool-render-cache");
const COMPONENT_PARENT = Symbol.for("pi-claude-style-tools:component-parent");
const BASH_FILE_EDIT_PATCH_FLAG = Symbol.for("pi-claude-style-tools:bash-file-edit-grouping");
const PARENT_TRACKING_PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-parent-tracking");
const TOOL_IMAGE_EXPAND_PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-read-image-expansion");
const CUSTOM_MESSAGE_PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-custom-message-render");
const USER_MESSAGE_PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-user-message-render");
const WRAP_MARK = "\uE000";
const CLIP_MARK = "\uE001";
const TRAILING_MARK = "  · ";
const KITTY_IMAGE_PREFIX = "\x1b_G";
const ITERM2_IMAGE_PREFIX = "\x1b]1337;File=";
const {
	applyTerminalCopyZones,
	isCodeBoxChromeLine,
	padRenderedLineToWidth,
	removeCopySkipped,
	sanitizeRenderedTextBlockLines,
	stripAnsi,
	stripCopyMarks,
	copySkip,
} = createCopyFormatting(() => ({
	borderColor: BORDER_COLOR,
	codeBlockLanguageFg: CODE_BLOCK_LANG_FG,
	chromeItalic: CHROME_ITALIC,
	reset: RESET,
	transparentReset: TRANSPARENT_RESET,
}));

let toolBackgroundMode: "default" | "transparent" | "outlines" = "transparent";

interface SettingsFile {
	toolBackground?: "default" | "transparent" | "outlines" | "border";
	readOutputMode?: "hidden" | "summary" | "preview";
	searchOutputMode?: "hidden" | "count" | "preview";
	mcpOutputMode?: "hidden" | "summary" | "preview";
	previewLines?: number;
	expandedPreviewMaxLines?: number;
	extraExpandedPreviewMaxLines?: number;
	extraToolOutputExpanded?: boolean;
	groupToolCalls?: boolean;
	toolStatusAnimation?: "blink" | "breathe";
	bashOutputMode?: "opencode" | "summary" | "preview";
	/**
	 * Short purpose labels on bash rows. `model` (default): the model writes them as an
	 * extra bash argument (changes the bash tool and the model's instructions; `true` means this);
	 * `local`: a local model writes them without changing anything the model sees. Uses Apple's
	 * on-device model on supported Macs, otherwise an OpenAI-compatible local endpoint.
	 * Applied when the extension loads (pi start or /reload).
	 */
	bashIntent?: boolean | "off" | "model" | "local";
	bashCollapsedLines?: number;
	/** Verbatim script lines shown while bash is running or after failure. Defaults to 8. */
	bashCommandPreviewLines?: number;
	/** Show a small live output preview while tools are still running. Defaults to true. */
	liveToolPreview?: boolean;
	/** Number of live output lines to show while collapsed. Defaults to 5. */
	liveToolPreviewLines?: number;
	showTruncationHints?: boolean;
	diffCollapsedLines?: number;
	/** Diff layout: "auto" (default) picks split only when it fits cleanly; "split" and "unified" force one layout. */
	diffLayout?: "auto" | "split" | "unified";
	diffTheme?: string;
	diffColors?: Record<string, string>;
	/**
	 * When true (default), derive borders, dim text, branch rules, and diff
	 * accents from the active pi theme via `theme.getFgAnsi`/`getBgAnsi`.
	 * Explicit `diffTheme` / `diffColors` always win over theme-derived
	 * defaults so users keep full control.
	 */
	themeAdaptive?: boolean;
	/**
	 * On by default (pi >= 1.4): pi uses its built-in `system` theme, which takes
	 * every color from the terminal's own palette (Ghostty, Rex, ...), and
	 * re-reads that palette when the terminal regains focus so same-kind theme
	 * switches (dark to dark) are picked up too. Set to false, or run
	 * `/theme terminal off`, to keep the theme chosen in pi's /settings.
	 */
	terminalTheme?: boolean;
	/** Pi theme that was active before `terminalTheme` was turned on; restored when it is turned off. */
	terminalThemePrevious?: string;
	/**
	 * Theme color key used for the spinner verb (e.g. "Cooking..."). Defaults
	 * to "borderAccent". Useful when the active theme's accent is overloaded for
	 * borders, headings, or bash mode and the verb should pop differently.
	 * Valid keys are any of the pi theme `ThemeColor` names (e.g. accent,
	 * borderAccent, success, warning, mdHeading, thinkingMedium, bashMode).
	 */
	spinnerVerbColor?: string;
	/**
	 * Theme color key used for the spinner status suffix (the parenthesized
	 * "(thinking · ↓ 10 tokens · 2s)" trailer). Defaults to "muted".
	 */
	spinnerStatusColor?: string;
	/** Animate the spinner's trailing dots. Off by default. */
	spinnerAnimatedDots?: boolean;
	/** Hide the spinner's dot suffix entirely. */
	spinnerDotsDisabled?: boolean;
	/** Display helpful tips under the spinner during thinking. Defaults to true. */
	spinnerTips?: boolean;
	/** Spinner glyph speed: slow, medium (default), or fast. */
	spinnerSpeed?: "slow" | "medium" | "fast";
	/** Spinner glyph animation: the default glyph cycle, breathing stars, or orbiting circles. */
	spinnerStyle?: "asterisk" | "breathing" | "orbit";
	/** Direction of spinner and collapsed-thinking shimmer. */
	spinnerShimmerDirection?: "left-to-right" | "right-to-left";
	/** Spinner-text shimmer animation: traveling sweep or double flash. */
	spinnerShimmerStyle?: "sweep" | "flash" | "sparkle";
	/** Optional #RGB/#RRGGBB highlight color for spinner and thinking shimmer. */
	spinnerShimmerColor?: string;
	/**
	 * Thinking display mode. `live` (default): only the currently-streaming
	 * thinking is expanded; finished thinking collapses to a one-line
	 * `Thought for Xs` row (Ctrl+O still expands it). `full`: thinking always
	 * renders expanded, like stock pi. `latest`: like `live`, but only the latest
	 * assistant message keeps its thinking; earlier ones drop it entirely, and the
	 * tool rows they separated merge into one group.
	 */
	thinkingMode?: "live" | "full" | "latest";
	/** Show `∴ Thinking:` above expanded thinking blocks. Off by default. */
	thinkingLabel?: boolean;
	/**
	 * Show or hide startup header resource information ([Skills], [Prompts], [Extensions], [Context]).
	 * When false (or quietStartup: "header"), suppresses this listing while preserving the logo/version header.
	 */
	headerDetails?: boolean;
	/**
	 * Pi native quiet startup setting: false (default), "header" (keep logo/hints, hide resource details),
	 * or true (hide both logo and details).
	 */
	quietStartup?: boolean | "header";
	/** Play the startup animation on a fresh interactive session (boolean or style name). */
	startupAnimation?: boolean | string;
	/** Enable Claude Code UI styling (❯ prompt marker, custom spinner, tool chrome). Defaults to true. */
	claudeUi?: boolean;
}

function claudeUiEnabled(): boolean {
	return readSettings().claudeUi !== false;
}

// Stale-while-revalidate: cold read is sync, later reads never block on disk (see settings-store.ts).
function readSettings(): SettingsFile {
	return readMergedSettings() as SettingsFile;
}

const LOADED_RESOURCES_CONTAINER_FLAG = Symbol.for("pi-harmony:loaded-resources-container");
let _headerDetailsOverride: boolean | null = null;
let _knownLoadedResourcesContainer: any = null;

function headerDetailsEnabled(): boolean {
	if (_headerDetailsOverride !== null) return _headerDetailsOverride;
	const settings = readSettings();
	if (settings.headerDetails !== undefined) {
		return settings.headerDetails !== false;
	}
	if (settings.quietStartup !== undefined) {
		return settings.quietStartup === false;
	}
	return true;
}

function isResourceSectionLine(line: string): boolean {
	const plain = stripAnsi(line).trim();
	return plain === "[Skills]"
		|| plain === "[Prompts]"
		|| plain === "[Extensions]"
		|| plain === "[Context]"
		|| plain === "[Skill warnings]"
		|| plain === "[Prompt conflicts]"
		|| plain === "[Extension issues]"
		|| plain === "[Theme conflicts]";
}

function isLoadedResourcesContainer(container: any): boolean {
	if (!container || !Array.isArray(container.children) || container.children.length === 0) return false;
	if (container[LOADED_RESOURCES_CONTAINER_FLAG] !== undefined) {
		return container[LOADED_RESOURCES_CONTAINER_FLAG];
	}
	for (const child of container.children) {
		if (!child || typeof child.render !== "function") continue;
		if (
			isToolGroupComponent(child)
			|| isAssistantMessageComponent(child)
			|| isToolExecutionLike(child)
			|| child instanceof UserMessageComponent
		) {
			continue;
		}
		try {
			const lines = child.render(80);
			if (Array.isArray(lines) && lines.length > 0 && isResourceSectionLine(lines[0])) {
				container[LOADED_RESOURCES_CONTAINER_FLAG] = true;
				_knownLoadedResourcesContainer = container;
				return true;
			}
		} catch { /* ignore */ }
	}
	container[LOADED_RESOURCES_CONTAINER_FLAG] = false;
	return false;
}

function createToolsCommandDependencies(): ToolsCommandDependencies {
	return {
		readSettings, readMergedSettings, writeSettingsKey, rawKeyHint,
		headerDetailsEnabled, setHeaderDetailsOverride: (value) => { _headerDetailsOverride = value; },
		getKnownLoadedResourcesContainer: () => _knownLoadedResourcesContainer,
		toolGroupingEnabled, setToolGroupingEnabled, ungroupActiveToolGroups,
		toolStatusAnimation, handleToolActivityCommand, getThinkingMode, thinkingLabelEnabled,
		applyThinkingModeToChats: conversationThinking.applyThinkingModeToChats,
		requestChatRender: conversationThinking.requestChatRender,
		getBashIntentMode: () => "model",
		normalizeBashIntentMode, getExtraToolOutputExpanded: () => extraToolOutputExpanded,
		setExtraToolDetailMode, claudeUiEnabled, getToolBackgroundMode: () => toolBackgroundMode,
		setToolBackgroundMode: (value) => { toolBackgroundMode = value; },
		setToolBackgroundOverride: (value) => { toolBackgroundOverride = value; },
		applyToolBackgroundMode,
	};
}

async function handleHeaderCommand(arg: string | undefined, ctx: any): Promise<void> {
	await registerHeaderCommand(arg, ctx, createToolsCommandDependencies());
}

// Cross-extension bust signal for spinner.ts — it watches this counter on
// globalThis and invalidates its settings cache when it changes. Lets
// /spinner edits take effect on the next 250ms spinner tick instead of
// waiting for the file-stat TTL.
const SPINNER_BUST_KEY = Symbol.for("pi-claude-style-tools:spinner-settings-bust");
function bustSpinnerSettingsCache(): void {
	const current = ((globalThis as any)[SPINNER_BUST_KEY] as number | undefined) ?? 0;
	(globalThis as any)[SPINNER_BUST_KEY] = current + 1;
}

let toolBackgroundOverride: "default" | "transparent" | "outlines" | null = null;

function syncToolBackgroundMode(): void {
	if (toolBackgroundOverride) {
		toolBackgroundMode = toolBackgroundOverride;
		return;
	}
	const settings = readSettings();
	// Backward compat: "border" was renamed to "outlines"
	const raw = settings.toolBackground === "border" ? "outlines" : settings.toolBackground;
	toolBackgroundMode = raw ?? "transparent";
}

function setThemeBg(theme: unknown, key: string, value: string): void {
	const themeAny = theme as any;
	// pi >= 1.4 keeps background escapes in `bgAnsi`; older versions in `bgColors`.
	if (themeAny.bgAnsi instanceof Map) {
		themeAny.bgAnsi.set(key, value);
	} else if (themeAny.bgColors instanceof Map) {
		themeAny.bgColors.set(key, value);
	} else if (themeAny.bgColors && typeof themeAny.bgColors === "object") {
		themeAny.bgColors[key] = value;
	}
}

const PI_GLOBAL_THEME_KEY = Symbol.for("@earendil-works/pi-coding-agent:theme");

function getGlobalPiTheme(): unknown {
	return (globalThis as any)[PI_GLOBAL_THEME_KEY];
}

/** Pi's ToolExecutionComponent reads `theme` from globalThis — keep it in sync with ctx.ui.theme. */
function applyToolBackgroundMode(theme: unknown): void {
	if (!claudeUiEnabled()) return;
	syncToolBackgroundMode();
	const targets = new Set<unknown>();
	if (theme) targets.add(theme);
	const globalTheme = getGlobalPiTheme();
	if (globalTheme) targets.add(globalTheme);
	for (const t of targets) {
		setThemeBg(t, "userMessageBg", TRANSPARENT_BG);
		if (toolBackgroundMode === "default") continue;
		setThemeBg(t, "toolPendingBg", TRANSPARENT_BG);
		setThemeBg(t, "toolSuccessBg", TRANSPARENT_BG);
		setThemeBg(t, "toolErrorBg", TRANSPARENT_BG);
	}
}

function isBlankLine(text: string): boolean {
	return stripAnsi(text).trim().length === 0;
}

function borderLine(width: number): string {
	return `${BORDER_COLOR}${"─".repeat(Math.max(1, width))}${TRANSPARENT_RESET}`;
}

function terminalColumnCeiling(): number {
	const cols = typeof process !== "undefined" ? process.stdout?.columns : undefined;
	return Number.isFinite(cols) && (cols as number) > 0 ? (cols as number) : 0;
}

function clampLineWidth(line: string, width: number): string {
	if (width <= 0) return "";
	// Hard ceiling: never emit a line wider than the real terminal. pi sometimes
	// hands renderers a width wider than stdout.columns (e.g. content later placed
	// in a narrower side panel), which trips pi's render width-assertion crash.
	const ceiling = Math.min(width, terminalColumnCeiling() || width);
	if (ceiling <= 0) return "";
	return visibleWidth(line) > ceiling ? truncateToWidth(line, ceiling) : line;
}

function isToolExecutionLike(value: unknown): value is { toolName: string; toolCallId: string } {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return typeof candidate.toolName === "string" && typeof candidate.toolCallId === "string";
}

function isTerminalImageLine(line: string): boolean {
	return line.includes(KITTY_IMAGE_PREFIX) || line.includes(ITERM2_IMAGE_PREFIX);
}

function normalizeLeadingCheckGlyph(line: string): string {
	return line.replace(/^((?:\x1b\[[0-9;]*m|[ \t]|[├└│─])*)[✓✔]((?:\x1b\[[0-9;]*m)*)(?=\s)/, "$1●$2");
}

function stripOuterBackgroundAnsi(line: string): string {
	return line
		.replace(/^\x1b\[(?:49|4[0-7]|10[0-7]|48;5;\d+|48;2;\d+;\d+;\d+)m/, "")
		.replace(/\x1b\[49m$/, "");
}

function firstImageBlockStart(lines: string[]): number {
	const imageLineIndex = lines.findIndex(isTerminalImageLine);
	if (imageLineIndex === -1) return -1;
	let start = imageLineIndex;
	while (start > 0 && isBlankLine(lines[start - 1])) start--;
	return start;
}

function splitRenderedImageBlock(lines: string[]): { textLines: string[]; imageLines: string[] } {
	const imageStart = firstImageBlockStart(lines);
	if (imageStart === -1) return { textLines: lines, imageLines: [] };
	const textLines = lines.slice(0, imageStart);
	while (textLines.length > 0 && isBlankLine(textLines[textLines.length - 1])) textLines.pop();
	return { textLines, imageLines: lines.slice(imageStart) };
}

function toolGroupingEnabled(): boolean {
	return readSettings().groupToolCalls !== false;
}

type ToolStatusAnimation = "blink" | "breathe";
const TOOL_STATUS_ANIMATIONS: readonly ToolStatusAnimation[] = ["blink", "breathe"];

function toolStatusAnimation(): ToolStatusAnimation {
	return readSettings().toolStatusAnimation === "blink" ? "blink" : "breathe";
}

function handleToolActivityCommand(raw: string | undefined, ctx: any): void {
	const mode = raw?.trim().toLowerCase() || "status";
	if (mode === "status") {
		if (ctx.hasUI) ctx.ui.notify(`Tool activity: ${toolStatusAnimation()}`, "info");
		return;
	}
	if (!(TOOL_STATUS_ANIMATIONS as readonly string[]).includes(mode)) {
		if (ctx.hasUI) ctx.ui.notify(`Usage: /tools activity ${TOOL_STATUS_ANIMATIONS.join("|")}|status`, "error");
		return;
	}
	const next = mode as ToolStatusAnimation;
	writeSettingsKey("toolStatusAnimation", next);
	for (const entry of _blinkContexts.values()) {
		try { entry.invalidate(); } catch { /* tool may have ended */ }
	}
	for (const group of ACTIVE_TOOL_GROUPS) group.invalidate();
	ctx.ui?.requestRender?.();
	if (ctx.hasUI) ctx.ui.notify(`Tool activity: ${next}`, "info");
}

function setToolGroupingEnabled(enabled: boolean): void {
	writeSettingsKey("groupToolCalls", enabled);
}

type ThinkingMode = "live" | "full" | "latest";
const THINKING_MODES = ["live", "full", "latest"] as const;

function getThinkingMode(): ThinkingMode {
	return getMode(readSettings().thinkingMode, THINKING_MODES, "live");
}

function thinkingLabelEnabled(): boolean {
	return readSettings().thinkingLabel === true;
}

function isAssistantThinkingComplete(comp: any, message: any): boolean {
	if (!message || message.role !== "assistant") return false;
	if (thinkingLabels.getThinkingDurationMetadata(message) !== undefined) return true;
	if (thinkingLabels.hasThinkingActiveMetadata(message)) return false;
	// Providers keep stopReason "pending" for the whole stream ("deferred" while
	// a deferred call is unresolved); both are in-flight sentinels, never
	// completion signals. Without this, live-thinking detection would depend on
	// THINKING_ACTIVE_KEY being stamped before the UI renders the same event.
	if (message.stopReason === "pending" || message.stopReason === "deferred") return false;
	// Some OpenAI-compatible proxies send `finish_reason: "stop"` on empty
	// chunks before (and between) reasoning and content, so pi-ai sets a final
	// stopReason while the stream is still running. Mid-stream, stopReason is
	// not a completion signal; fall through to the block structure instead.
	if (!thinkingLabels.isAssistantMessageStreaming(message) && typeof message.stopReason === "string" && message.stopReason.length > 0) return true;
	if (Array.isArray(message.content)) {
		let sawThinking = false;
		for (const block of message.content) {
			if (block?.type === "thinking" && typeof block.thinking === "string" && block.thinking.trim()) {
				sawThinking = true;
			} else if (sawThinking && (
				(block?.type === "text" && typeof block.text === "string" && block.text.trim()) ||
				block?.type === "toolCall"
			)) {
				return true;
			}
		}
		if (sawThinking) return false;
	}
	return true;
}

function isLiveThinkingMessage(comp: any, message: any): boolean {
	if (!message || message.role !== "assistant") return false;
	if (isAssistantThinkingComplete(comp, message)) return false;
	if (thinkingLabels.hasThinkingActiveMetadata(message)) return true;
	if (Array.isArray(message.content)) {
		return message.content.some((b: any) => b?.type === "thinking" && typeof b?.thinking === "string" && b.thinking.trim());
	}
	return false;
}

function getToolStatusForGroup(tool: any): ToolStatus {
	if (tool?.result?.isError) return "error";
	if (tool?.result && tool?.isPartial !== true) return "success";
	// Only in-flight tools that actually started this agent run count as pending.
	// History rows reconstructed without a matching toolResult stay isPartial=true
	// forever; treating them as pending made interrupted tools blink again on resume.
	if (tool?.isPartial === true && tool?.executionStarted === true && thinkingLabels.isAgentWorkActive()) {
		return "pending";
	}
	return "success";
}

let TOOL_STATUS_SUCCESS = "\x1b[32m";
let TOOL_STATUS_ERROR = "\x1b[31m";
let TOOL_STATUS_PENDING = "\x1b[90m";

function resetClaudeChrome(): void {
	BORDER_COLOR = "\x1b[38;5;238m";
	WORKED_LINE_FG = "\x1b[38;2;140;140;140m";
	CODE_BLOCK_LANG_FG = "\x1b[38;2;95;95;95m";
	applyToolBranchColor();
}

function themeAdaptiveEnabled(): boolean {
	return readSettings().themeAdaptive !== false;
}

const themePalette: ThemePalette = createThemePalette({
	readSettings,
	themeAdaptiveEnabled,
	transparentBg: TRANSPARENT_BG,
	transparentReset: TRANSPARENT_RESET,
	resetClaudeChrome,
	getBorderColor: () => BORDER_COLOR,
	setToolStatusSuccess: (value) => { TOOL_STATUS_SUCCESS = value; },
	setToolStatusError: (value) => { TOOL_STATUS_ERROR = value; },
	setToolStatusPending: (value) => { TOOL_STATUS_PENDING = value; },
	getToolStatusSuccess: () => TOOL_STATUS_SUCCESS,
	getToolStatusError: () => TOOL_STATUS_ERROR,
	getToolStatusPending: () => TOOL_STATUS_PENDING,
	applyToolBranchColor,
	syncOutlineChromeFromBranch,
	applyToolBackgroundMode,
	bumpToolBranchVisualEpoch,
	syncDiffShikiTheme: (theme) => {
		if (!themePalette.hasExplicitShikiTheme()) themePalette.setDiffOnLightBackground(theme);
	},
	toolBackgroundMode: () => toolBackgroundMode,
});

const bashPresentation = createBashPresentation(() => ({
	safeInvalidate,
	unrefTimer,
	applyThemePaletteIfNeeded: (theme) => themePalette.applyThemePaletteIfNeeded(theme),
	getBorderColor: () => BORDER_COLOR,
	transparentReset: TRANSPARENT_RESET,
}));

const thinkingLabels = createThinkingLabels({
	applyThemePaletteIfNeeded: (theme) => themePalette.applyThemePaletteIfNeeded(theme),
});

// Pending tools breathe through single-cell glyphs instead of flashing fully on/off.
const STATUS_DOT_FILLED = "●";
const STATUS_DOT_BOLD = "\x1b[1m";
// Single-cell glyphs only (⬤ is often double-width and walks the baseline).
// Optical sizes share the same cell so the center stays put while breathing:
// big ● → medium • → small · → invisible → small · → medium •
const PENDING_BREATHE_GLYPHS = ["●", "•", "·", " ", "·", "•"] as const;
const PENDING_BREATHE_LEN = PENDING_BREATHE_GLYPHS.length;

function paintStatusDot(colorAnsi: string): string {
	return `${colorAnsi}${STATUS_DOT_BOLD}${STATUS_DOT_FILLED}${TRANSPARENT_RESET}`;
}

function themeStatusDot(theme: Theme, colorKey: "success" | "error" | "dim" | "muted"): string {
	// theme.fg may not preserve nested SGR cleanly — color the glyph string itself.
	return theme.fg(colorKey, `${STATUS_DOT_BOLD}${STATUS_DOT_FILLED}`);
}

function pendingBreatheGlyphRaw(): string {
	// Always exactly one display cell — matches ordinary tool dots, keeps titles aligned.
	return PENDING_BREATHE_GLYPHS[_globalBlinkPhaseIndex % PENDING_BREATHE_LEN];
}

function paintPendingBreatheDot(colorAnsi: string = TOOL_STATUS_SUCCESS): string {
	const glyph = pendingBreatheGlyphRaw();
	if (glyph === " ") return " ";
	// Bold only on the largest frame so weight changes without shifting the cell.
	const bold = glyph === "●" ? STATUS_DOT_BOLD : "";
	return `${colorAnsi}${bold}${glyph}${TRANSPARENT_RESET}`;
}

function pendingBreatheDot(theme: Theme): string {
	const glyph = pendingBreatheGlyphRaw();
	if (glyph === " ") return " ";
	const bold = glyph === "●" ? STATUS_DOT_BOLD : "";
	return theme.fg("success", `${bold}${glyph}`);
}

const toolGroupStatusFormatting = createToolGroupStatusFormatting({
	getToolStatusForGroup,
	toolDisplayName,
	get TOOL_STATUS_SUCCESS() { return TOOL_STATUS_SUCCESS; },
	get TOOL_STATUS_ERROR() { return TOOL_STATUS_ERROR; },
	get TOOL_STATUS_PENDING() { return TOOL_STATUS_PENDING; },
	TRANSPARENT_RESET,
	get blinkPhaseIndex() { return _globalBlinkPhaseIndex; },
	get toolStatusAnimation() { return toolStatusAnimation(); },
	paintStatusDot,
	paintPendingBreatheDot,
});
const {
	countToolStatuses,
	formatElapsedSeconds,
	formatToolGroupCounts,
	getGroupedToolName,
	getToolGroupLabel,
	getToolGroupOverallStatus,
	getToolName,
	groupSentence,
	groupStatusLight,
} = toolGroupStatusFormatting;

/**
 * Summary for a tool without its own case: its most telling string argument, or the
 * first one it has. Empty when there is none; never the tool's name, which the row
 * already shows as its label ("Ctx Reduce Ctx Reduce").
 */
function summarizeUnknownToolArgs(args: any): string {
	const known = getStringArg(args, "path", "file_path", "url", "query", "name", "subject", "tool", "description", "prompt");
	return known ? summarizeText(known, 72) : summarizeDirectMcpArgs(args, summarizeText);
}

function alignTrailingMarkedLine(line: string, width: number): string {
	const markerIndex = line.indexOf(TRAILING_MARK);
	if (markerIndex === -1) return clampLineWidth(line, width);
	const safeWidth = Math.max(1, width);
	const left = line.slice(0, markerIndex);
	const right = line.slice(markerIndex + TRAILING_MARK.length);
	const rightWidth = visibleWidth(right);
	if (rightWidth >= safeWidth) return truncateToWidth(right, safeWidth, "", false);
	const leftBudget = Math.max(0, safeWidth - rightWidth - 2);
	const clippedLeft = leftBudget > 0 ? truncateToWidth(left, leftBudget, "...", false) : "";
	const gap = Math.max(1, safeWidth - visibleWidth(clippedLeft) - rightWidth);
	return `${clippedLeft}${" ".repeat(gap)}${right}`;
}

export { toolRowPad };

const toolGroupLineFormatting = createToolGroupLineFormatting({
	get BRANCH_INDENT() { return BRANCH_INDENT; },
	TRANSPARENT_RESET,
	TRAILING_MARK,
	WRAP_MARK,
	CLIP_MARK,
	get fgDim() { return themePalette.fgDim; },
	buildBashCommandPresentation,
	clampLineWidth,
	countToolStatuses,
	currentToolBranchAnsi,
	formatToolGroupCounts,
	getToolName,
	getToolStatusForGroup,
	groupStatusLight,
	isTerminalImageLine,
	parseNamespacedMcpToolName,
	shortPath,
	stripAnsi,
	summarizeDirectMcpArgs,
	summarizeText,
	summarizeUnknownToolArgs,
	toolDisplayName,
	trimRenderedBlankLines,
	truncateToWidth,
	visibleWidth,
});
const {
	formatBranchedToolLines,
	getCollapsedToolEntryLine,
	getCompactToolLine,
	getExpandedToolGroupLines,
	getRepeatedToolSubject,
} = toolGroupLineFormatting;

const ToolGroupComponent = createToolGroupComponent({
	ACTIVE_TOOL_GROUPS,
	COMPONENT_PARENT,
	TRANSPARENT_RESET,
	get TOOL_STATUS_ERROR() { return TOOL_STATUS_ERROR; },
	get BRANCH_INDENT() { return BRANCH_INDENT; },
	get FG_DIM() { return themePalette.fgDim; },
	get _toolBranchVisualEpoch() { return _toolBranchVisualEpoch; },
	get toolBackgroundMode() { return toolBackgroundMode; },
	applyGroupHover,
	claimClickHover,
	clampLineWidth,
	countToolStatuses,
	currentThemePaletteFingerprint: themePalette.currentThemePaletteFingerprint,
	currentToolBranchAnsi,
	dispatchTarget,
	forgetClickHover,
	formatBranchedToolLines,
	formatElapsedSeconds,
	getCollapsedToolEntryLine,
	getCompactToolLine,
	getExpandedToolGroupLines,
	getGlobalPiTheme,
	getGroupHover,
	getGroupedToolName,
	getRepeatedToolSubject,
	getToolGroupLabel,
	getToolName,
	getToolStatusForGroup,
	groupSentence,
	groupStatusLight,
	isPrimaryClick,
	mouseLayoutTarget,
	rememberMouseLayout,
	requestComponentRender,
	safeFgAnsi,
	setGroupHover,
	setToolHover: (component, hovered) => setToolHover(component, hovered, clearToolRenderCache),
	stripAnsi,
	toggleGroupedTools,
	toolOutputDetailHint,
});

const toolGroupingState = createToolGroupingState({
	ToolExecutionComponent,
	ToolGroupComponent,
	BASH_FILE_EDIT_PATCH_FLAG,
	COMPONENT_PARENT,
	detectBashFileEdit,
	getToolName,
	isIgnorableToolSeparator,
	isToolGroupingEnabled: toolGroupingEnabled,
	maybeMergeConsecutiveThinkingMessages: (parent) => conversationThinking.maybeMergeConsecutiveThinkingMessages(parent),
	requestToolRender: (tool) => tool.ui?.requestRender?.(),
});
const {
	ejectToolFromGroup,
	findPreviousToolSibling,
	isBashFileEditTool,
	isGroupableTool,
	isToolGroupComponent,
	maybeGroupToolComponent,
	patchBashFileEditGrouping,
	ungroupActiveToolGroups,
} = toolGroupingState;

function applyGroupHover(lines: string[], layout: { children: MouseLayoutEntry[] } | undefined, hoverStart: unknown): string[] {
	if (typeof hoverStart !== "number" || hoverStart < 0 || !layout) return lines;
	const entry = layout.children.find((candidate) => candidate.top === hoverStart);
	if (!entry) return lines;
	const rendered = lines.slice();
	// A group's header is a blank line, its sentence, and (while running) the call in progress.
	const line = entry.top + (entry.component ? 0 : Math.min(1, Math.max(0, entry.height - 1)));
	if (line < rendered.length) rendered[line] = brightenRenderedLine(rendered[line]);
	return rendered;
}

function isSpacerComponent(value: unknown): value is InstanceType<typeof Spacer> {
	return value instanceof Spacer || (value as any)?.constructor?.name === "Spacer";
}

function isTextComponent(value: unknown): value is InstanceType<typeof Text> {
	return value instanceof Text || (value as any)?.constructor?.name === "Text";
}

function isMarkdownComponent(value: unknown): value is InstanceType<typeof Markdown> {
	return value instanceof Markdown || (value as any)?.constructor?.name === "Markdown";
}

function isIgnorableToolSeparator(value: unknown): boolean {
	if (isSpacerComponent(value)) return true;
	if (value instanceof AssistantMessageComponent || (value as any)?.constructor?.name === "AssistantMessageComponent") {
		// Empty assistant framing stays ignorable so it never splits tool groups.
		// A rendered thinking row ("Thought for Xs" / live thinking) is a visible
		// boundary: tool calls that follow it must start a new group instead of
		// silently joining the batch that ran before the thought.
		const contentChildren = (value as any).contentContainer?.children;
		if (!Array.isArray(contentChildren) || contentChildren.length === 0) return true;
		return contentChildren.every((child: any) => isSpacerComponent(child));
	}
	return false;
}

function isAssistantMessageComponent(value: unknown): boolean {
	return conversationThinking.isAssistantMessageComponent(value);
}

function patchContainerParentTracking(): void {
	const proto = Container.prototype as any;
	if (proto[PARENT_TRACKING_PATCH_FLAG]) return;
	const originalAddChild = proto.addChild;
	const originalRemoveChild = proto.removeChild;
	const originalClear = proto.clear;
	proto.addChild = function patchedAddChild(component: any) {
		const result = originalAddChild.call(this, component);
		if (component && typeof component === "object") {
			component[COMPONENT_PARENT] = this;
			conversationThinking.assignAddSequence(component);
		}
		if (
			this[LOADED_RESOURCES_CONTAINER_FLAG] !== true
			&& component
			&& typeof component.render === "function"
			&& !isToolGroupComponent(component)
			&& !isAssistantMessageComponent(component)
			&& !isToolExecutionLike(component)
			&& !(component instanceof UserMessageComponent)
		) {
			try {
				const lines = component.render(80);
				if (Array.isArray(lines) && lines.length > 0 && isResourceSectionLine(lines[0])) {
					this[LOADED_RESOURCES_CONTAINER_FLAG] = true;
					_knownLoadedResourcesContainer = this;
				}
			} catch { /* ignore */ }
		}
		maybeGroupToolComponent(this, component);
		conversationThinking.maybeMergeConsecutiveThinkingMessages(this);
		if (isAssistantMessageComponent(component)) conversationThinking.supersedeEarlierAssistantMessages(this, component);
		return result;
	};
	proto.removeChild = function patchedRemoveChild(component: any) {
		const result = originalRemoveChild.call(this, component);
		if (component && typeof component === "object" && component[COMPONENT_PARENT] === this) delete component[COMPONENT_PARENT];
		return result;
	};
	proto.clear = function patchedClear() {
		for (const child of this.children ?? []) {
			if (child && typeof child === "object" && child[COMPONENT_PARENT] === this) delete child[COMPONENT_PARENT];
		}
		return originalClear.call(this);
	};
	proto[PARENT_TRACKING_PATCH_FLAG] = true;
}

function formatTodoOverlayLines(lines: string[], width: number): string[] {
	// Hot path: nearly every Container.render hits this. Bail without regex work
	// unless any line actually mentions "Todos".
	let maybeTodo = false;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes("Todos")) {
			maybeTodo = true;
			break;
		}
	}
	if (!maybeTodo) return lines;

	let firstContent: string | undefined;
	for (let i = 0; i < lines.length; i++) {
		const plain = stripAnsi(lines[i]).trim();
		if (!plain) continue;
		firstContent = plain;
		break;
	}
	if (!firstContent || !/^[●○]\s+Todos\s+—/.test(firstContent)) return lines;
	return lines.map((line) => {
		const plain = stripAnsi(line);
		if (/^[●○]\s+Todos\s+—/.test(plain)) return clampLineWidth(` ${line}`, width);
		// Magic Context emits `├─` / `└─` or bare `├` / `└`; strip any arm to bare tee/corner.
		if (!/^[├└]─?\s+[✓○◐✗●⬤•]\s/.test(plain) && !/^[├└]─?\s+/.test(plain)) return line;
		const withoutTodoHash = line.replace(/#(?=[A-Za-z0-9_-]+)/, "");
		const bare = withoutTodoHash.replace(/([├└])─/, "$1");
		const colored = bare.replace(/[├└]/, (branch) => `${currentToolBranchAnsi()}${branch}${TRANSPARENT_RESET}`);
		return clampLineWidth(` ${BRANCH_INDENT}${colored}`, width);
	});
}

function summarizeText(text: string, max = 60): string {
	const oneLine = text.replace(/\n/g, " ").trim();
	if (oneLine.length <= max) return oneLine;
	return `${oneLine.slice(0, Math.max(0, max - 3))}...`;
}

function hashText(text: string): string {
	let hash = 2166136261;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

let extraToolOutputExpanded = false;

function syncExtraToolDetailMode(): void {
	extraToolOutputExpanded = readSettings().extraToolOutputExpanded === true;
}

function setExtraToolDetailMode(enabled: boolean): void {
	extraToolOutputExpanded = enabled;
	writeSettingsKey("extraToolOutputExpanded", enabled);
}

function configuredKeyHint(binding: Parameters<typeof keyText>[0], fallbackKey: string, description: string): string {
	try {
		if (keyText(binding).trim()) return keyHint(binding, description);
	} catch { /* fall back below */ }
	return rawKeyHint(fallbackKey, description);
}

function deepExpandKeyHint(): string {
	return rawKeyHint("ctrl+shift+o", extraToolOutputExpanded ? "less detail" : "more detail");
}

/** " • ctrl+shift+o more detail", for text that is already in parentheses. */
function deepExpandHint(): string {
	return ` • ${deepExpandKeyHint()}`;
}

function detailHintParts(expanded: boolean, hasMore: boolean): string[] {
	if (!expanded) return [configuredKeyHint("app.tools.expand", "ctrl+o", "to toggle")];
	const parts = [configuredKeyHint("app.tools.expand", "ctrl+o", "to collapse")];
	if (hasMore || extraToolOutputExpanded) parts.push(deepExpandKeyHint());
	return parts;
}

/** " (ctrl+o to toggle)", or " (ctrl+o to collapse • ctrl+shift+o more detail)" when expanded. */
function toolOutputDetailHint(_theme: Theme, expanded: boolean, hasMore = false): string {
	const dim = safeFgAnsi(getGlobalPiTheme(), "dim") ?? themePalette.fgDim;
	const paren = (glyph: string) => `${dim}${glyph}\x1b[39m`;
	return ` ${paren("(")}${detailHintParts(expanded, hasMore).join(paren(" • "))}${paren(")")}`;
}

/** " • ctrl+o to toggle", for text that is already in parentheses ("... (12 more lines • ...)"). */
function inlineDetailHint(expanded: boolean, hasMore = false): string {
	return detailHintParts(expanded, hasMore).map((part) => ` • ${part}`).join("");
}

function clearStateKeys(state: Record<string, unknown> | undefined, ...keys: string[]): void {
	if (!state) return;
	for (const key of keys) {
		delete state[key];
	}
}

const RENDER_CACHE_LRU_LIMIT = 48;
const toolRenderCacheLru = new Set<object>();
const messageRenderCacheLru = new Set<object>();

function touchComponentRenderLru(lru: Set<object>, component: object, cacheKey: symbol): void {
	lru.delete(component);
	lru.add(component);
	while (lru.size > RENDER_CACHE_LRU_LIMIT) {
		const oldest = lru.values().next().value;
		if (!oldest) break;
		lru.delete(oldest);
		delete (oldest as any)[cacheKey];
	}
}

function storeToolRenderCache(
	component: any,
	width: number,
	lines: string[],
	mouseLayout: unknown,
	branchCache: { branchKey: string; branchEpoch: number },
): string[] {
	if (component && typeof component === "object") {
		component[TOOL_RENDER_CACHE] = { width, mode: toolBackgroundMode, lines, mouseLayout, ...branchCache };
		touchComponentRenderLru(toolRenderCacheLru, component, TOOL_RENDER_CACHE);
	}
	return lines;
}

function clearToolRenderCache(value: unknown): void {
	if (!value || typeof value !== "object") return;
	toolRenderCacheLru.delete(value);
	delete (value as any)[TOOL_RENDER_CACHE];
	// If this tool lives inside a ToolGroupComponent, drop the group's memo so
	// settled headers/counts/child lines can't go stale after a child update.
	// Only the parent group is touched — we do NOT cascade invalidate siblings.
	const parent = (value as any)[COMPONENT_PARENT];
	if (isToolGroupComponent(parent)) parent.invalidate();
}

/** Fullscreen hit-testing reads the layout recorded by the last render. */
function rememberMouseLayout(component: object, width: number, children: MouseLayoutEntry[]): void {
	const layout = { width, children };
	if (component instanceof ToolGroupComponent) component.groupMouseLayout = layout;
	(component as { mouseLayout?: { width: number; children: MouseLayoutEntry[] } }).mouseLayout = layout;
}

/**
 * A single left click. The second click of a double-click is left to pi (word selection):
 * pi reports it as another click, and toggling on it undid the first one.
 */
function isPrimaryClick(event: TuiMouseEvent): boolean {
	return event.type === "click" && event.button === "left" && (event.clickCount ?? 1) === 1;
}

/**
 * The fullscreen transcript follows its end: while you are at the bottom, anything that grows
 * keeps the bottom pinned, so a row expanded by a click slid up and away from the mouse (and
 * the next click hit whatever moved under it). Before expanding, stop following, so the row
 * stays put and the new lines open below it. Once the new height is laid out (patched
 * ScrollView.updateLayout below), scroll down just enough to show them, never past the row's
 * header. Collapsing needs nothing: the position is kept, and the transcript follows its end
 * again once it is back at the bottom.
 */
const FULLSCREEN_COPY_PATCH_FLAG = Symbol.for("pi-claude-style-tools:fullscreen-copy-skips-chrome");

interface SelectedRow {
	line: string;
	start: number;
	end: number;
}

/** Selection text rebuilt from the rows Pi selected, minus COPY_SKIP spans and COPY_DROP rows. */
function selectionTextWithoutChrome(rows: SelectedRow[]): string | undefined {
	const slice = (PiTui as any).sliceByColumn;
	const strip = (PiTui as any).stripTerminalSequences;
	if (typeof slice !== "function" || typeof strip !== "function") return undefined;
	const lines: string[] = [];
	for (const { line, start, end } of rows) {
		if (line.includes(COPY_DROP_LINE)) continue;
		const selected = slice(line, start, Math.max(0, end - start), true);
		lines.push(strip(removeCopySkipped(selected)).trimEnd());
	}
	return lines.join("\n");
}

// Fullscreen owns mouse selection and builds the copied text from rendered rows, so
// box borders and gutters would land on the clipboard. Pi asks getSelectionColumns for
// each selected row in order; record those rows while Pi builds its text, then rebuild it
// without the marked decoration. Rows without markers come out exactly as Pi made them.
function patchFullscreenCopySkipsChrome(): void {
	const proto = (PiTui as any).TuiAltScreen?.prototype;
	if (
		!proto
		|| proto[FULLSCREEN_COPY_PATCH_FLAG]
		|| typeof proto.getActiveSelectionText !== "function"
		|| typeof proto.getSelectionColumns !== "function"
	) return;
	const originalText = proto.getActiveSelectionText;
	proto.getActiveSelectionText = function patchedActiveSelectionText(this: any) {
		const rows: SelectedRow[] = [];
		const ownColumns = Object.prototype.hasOwnProperty.call(this, "getSelectionColumns");
		const columnsOf = this.getSelectionColumns;
		this.getSelectionColumns = function recordSelectedRow(this: any, line: unknown, ...rest: unknown[]) {
			const columns = columnsOf.call(this, line, ...rest);
			rows.push({ line: typeof line === "string" ? line : "", start: columns?.start ?? 0, end: columns?.end ?? 0 });
			return columns;
		};
		let text: string | undefined;
		try {
			text = originalText.call(this);
		} finally {
			if (ownColumns) this.getSelectionColumns = columnsOf;
			else delete this.getSelectionColumns;
		}
		if (typeof text !== "string" || !rows.some((row) => row.line.includes(COPY_MARK_PREFIX))) return text;
		// Only rebuild when the recorded rows are the ones Pi joined; otherwise keep Pi's text.
		if (rows.length !== text.split("\n").length) return text;
		const cleaned = selectionTextWithoutChrome(rows);
		// A selection of nothing but decoration copies what is on screen.
		return cleaned && cleaned.trim() ? cleaned : text;
	};
	proto[FULLSCREEN_COPY_PATCH_FLAG] = true;
}

function unrefTimer(timer: ReturnType<typeof setTimeout> | null | undefined): void {
	(timer as any)?.unref?.();
}

function safeInvalidate(ctx: any): void {
	try {
		if (typeof ctx?.invalidate === "function") ctx.invalidate();
	} catch {
		// Tool render contexts may outlive their row during reload/session switches.
	}
}

const ASSISTANT_PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-assistant-message");
const ASSISTANT_RENDER_PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-assistant-message-render");
const ASSISTANT_MOUSE_PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-assistant-fullscreen-mouse");

// Rendered-output cache for assistant/user/custom message components.
// Keyed by (width, branch visual epoch, tool background mode). The epoch changes on
// theme and /theme rebinds; the mode is included because subagent
// (custom-message) framing follows `toolBackgroundMode` via frameToolLikeLines. This avoids
// re-running the per-line ANSI stripping (applyTerminalCopyZones, normalizeLeadingCheckGlyph,
// border boxing) on every scroll/expand re-render — the dominant CPU cost on long chats,
// scaling linearly with chat length.
// Correctness:
//  - UserMessageComponent content is immutable after construction, so output is deterministic
//    given (width, epoch, mode).
//  - AssistantMessageComponent rebuilds children only via updateContent(), which clears the cache.
//  - CustomMessageComponent rebuilds children only via rebuild(), which clears the cache.
// The returned arrays are only ever spread-copied by Container.render (never mutated in place),
// so sharing the cached array reference across renders is safe.
const MESSAGE_RENDER_CACHE = Symbol.for("pi-claude-style-tools:message-render-cache");

function messageRenderCacheHit(thisArg: any, width: number): string[] | null {
	const cache = thisArg?.[MESSAGE_RENDER_CACHE];
	if (
		cache
		&& cache.width === width
		&& cache.epoch === _toolBranchVisualEpoch
		&& cache.mode === toolBackgroundMode
		&& Array.isArray(cache.lines)
	) {
		touchComponentRenderLru(messageRenderCacheLru, thisArg, MESSAGE_RENDER_CACHE);
		return cache.lines;
	}
	return null;
}

function storeMessageRenderCache(thisArg: any, width: number, lines: string[]): string[] {
	if (thisArg && typeof thisArg === "object") {
		thisArg[MESSAGE_RENDER_CACHE] = {
			width,
			epoch: _toolBranchVisualEpoch,
			mode: toolBackgroundMode,
			lines,
		};
		touchComponentRenderLru(messageRenderCacheLru, thisArg, MESSAGE_RENDER_CACHE);
	}
	return lines;
}

function clearMessageRenderCache(thisArg: any): void {
	if (thisArg && typeof thisArg === "object") {
		messageRenderCacheLru.delete(thisArg);
		thisArg[MESSAGE_RENDER_CACHE] = undefined;
	}
}
const WORKED_DURATION_MARKER = "Turn took";

const conversationThinking = createConversationThinking({
	AssistantMessageComponent,
	ToolGroupComponent,
	getThinkingMode,
	thinkingDurationKey: thinkingLabels.THINKING_DURATION_KEY,
	toolGroupingEnabled,
	getMessageThinkingDurationMs,
	hasThinkingActiveMetadata: thinkingLabels.hasThinkingActiveMetadata,
	isSpacerComponent,
	isToolGroupComponent,
	isGroupableTool,
	isIgnorableToolSeparator,
	findPreviousToolSibling,
	messageHasThinkingContent,
	componentParentKey: COMPONENT_PARENT,
	maybeGroupToolComponent,
});

const messageParagraphClasses = createMessageParagraphClasses({
	copySafeMarkdownTheme,
	stripTransientMagicContextTags,
	sanitizeRenderedTextBlockLines,
	isCodeBoxChromeLine,
	normalizeLeadingCheckGlyph,
	copySkip,
	clampLineWidth,
	stripAnsi,
	stripThinkingPresentationArtifacts,
	thinkingLabelEnabled,
	workedLineFg: () => WORKED_LINE_FG,
	branchVisualEpoch: () => _toolBranchVisualEpoch,
	brightenRenderedLine,
});
const DottedParagraph = messageParagraphClasses.DottedParagraph;
const ThinkingParagraph = messageParagraphClasses.ThinkingParagraph;

const PROMPT_EDITOR_FLAG = Symbol.for("pi-claude-style-tools:prompt-marker-editor");
let messageRenderPatches: ReturnType<typeof createMessageRenderPatches> | undefined;

function getMessageRenderPatches(): ReturnType<typeof createMessageRenderPatches> {
	if (messageRenderPatches) return messageRenderPatches;
	messageRenderPatches = createMessageRenderPatches({
		customMessagePatchFlag: CUSTOM_MESSAGE_PATCH_FLAG,
		userMessagePatchFlag: USER_MESSAGE_PATCH_FLAG,
		promptEditorPatchFlag: PROMPT_EDITOR_FLAG,
		transparentReset: TRANSPARENT_BG,
		syncToolBackgroundMode,
		messageRenderCacheHit,
		storeMessageRenderCache,
		clearMessageRenderCache,
		stripTransientMagicContextTags,
		visitMarkdownDescendants,
		isSubagentNotificationMessage,
		renderSubagentNotificationLines,
		formatSubagentNotification,
		frameToolLikeLines,
		normalizeLeadingCheckGlyph,
		getGlobalPiTheme,
		stripAnsi,
		stripOsc133Zones,
		copySkip,
		clampLineWidth,
		applyTerminalCopyZones,
		makeMarkdownLinksCopySafe,
		claudeUiEnabled,
		chromeAnsi,
		themeTokenRgb,
		terminalDefaultColors,
		rgbToHex,
		rgbBgAnsi,
		thinkingSummaryStyledText,
		padRenderedLineToWidth,
		hiddenThinkingSummaryForMessage,
		isTextComponent,
	} satisfies MessageRenderPatchDependencies);
	return messageRenderPatches;
}

function patchCustomMessageRender(): void {
	getMessageRenderPatches().patchCustomMessageRender();
}

function patchUserMessageRender(): void {
	getMessageRenderPatches().patchUserMessageRender();
}

function installPromptMarkerEditor(ctx: any): void {
	getMessageRenderPatches().installPromptMarkerEditor(ctx);
}

function patchAssistantMessages(): void {
	patchExtractedAssistantMessages({
		patchFlag: ASSISTANT_PATCH_FLAG,
		renderPatchFlag: ASSISTANT_RENDER_PATCH_FLAG,
		componentParentKey: COMPONENT_PARENT,
		workedStartKey: thinkingLabels.WORKED_START_KEY,
		workedDurationByMessage: thinkingLabels.workedDurationByMessage as unknown as Map<any, number>,
		getThinkingMode,
		isLiveThinkingMessage,
		messageHasThinkingContent,
		hidesSupersededThinking: conversationThinking.hidesSupersededThinking,
		stripTransientMagicContextTags,
		visitMarkdownDescendants,
		isMarkdownComponent,
		applyTerminalCopyZones,
		messageRenderCacheHit,
		storeMessageRenderCache,
		clearMessageRenderCache,
		replaceHiddenThinkingPlaceholders: getMessageRenderPatches().replaceHiddenThinkingPlaceholders,
		hiddenThinkingLabelEnabled: () => true,
		workedMetadataForMessage: thinkingLabels.workedMetadataForMessage,
		workedDurationText,
		hasWorkedDurationLine,
		getSessionStartMs: thinkingLabels.getSessionStartMs,
		getUserTurnCount: thinkingLabels.getUserTurnCount,
		maybeMergeConsecutiveThinkingMessages: conversationThinking.maybeMergeConsecutiveThinkingMessages,
		DottedParagraph,
		ThinkingParagraph,
	});
}

function patchGlobalToolBorders(): void {
	patchGlobalContainerBorders({
		patchFlag: PATCH_FLAG,
		renderCacheKey: TOOL_RENDER_CACHE,
		loadedResourcesFlag: LOADED_RESOURCES_CONTAINER_FLAG,
		isLoadedResourcesContainer,
		headerDetailsEnabled,
		isToolExecutionLike,
		toolBranchRenderCacheKey,
		toolBranchVisualEpoch: () => _toolBranchVisualEpoch,
		getToolBackgroundMode: () => toolBackgroundMode,
		touchComponentRenderLru: (component) => touchComponentRenderLru(toolRenderCacheLru, component, TOOL_RENDER_CACHE),
		storeToolRenderCache,
		formatTodoOverlayLines,
		isBlankLine,
		splitRenderedImageBlock,
		normalizeLeadingCheckGlyph,
		stripOuterBackgroundAnsi,
		clampLineWidth,
		borderLine,
	});
}

// WORKED_LINE_FG is theme-derived (from "muted") when themeAdaptive is on.
let WORKED_LINE_FG = "\x1b[38;2;140;140;140m";

function formatWorkedDuration(ms: number): string {
	const safeMs = Math.max(0, Number.isFinite(ms) ? ms : 0);
	if (safeMs < 60_000) {
		return `${Math.max(0, Math.floor(safeMs / 1000))}s`;
	}
	let days = Math.floor(safeMs / 86_400_000);
	let hours = Math.floor((safeMs % 86_400_000) / 3_600_000);
	let minutes = Math.floor((safeMs % 3_600_000) / 60_000);
	let seconds = Math.round((safeMs % 60_000) / 1000);
	if (seconds === 60) {
		seconds = 0;
		minutes++;
	}
	if (minutes === 60) {
		minutes = 0;
		hours++;
	}
	if (hours === 24) {
		hours = 0;
		days++;
	}
	if (days > 0) return `${days}d ${hours}h ${minutes}m`;
	if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
	return `${minutes}m ${seconds}s`;
}

function formatThoughtDuration(ms: number): string {
	const safeMs = Math.max(0, Number.isFinite(ms) ? ms : 0);
	if (safeMs < 60_000) return `${Math.max(1, Math.round(safeMs / 1000))}s`;
	return formatWorkedDuration(safeMs);
}

/** Session-total duration: seconds are always shown; minutes and hours are
 *  added only once the session has actually lasted that long.
 *  e.g. 45s, 12m 30s, 1h 12m 30s. */
function formatSessionTotal(ms: number): string {
	const safeMs = Math.max(0, Number.isFinite(ms) ? ms : 0);
	const totalSeconds = Math.floor(safeMs / 1000);
	const seconds = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const minutes = totalMinutes % 60;
	const hours = Math.floor(totalMinutes / 60);
	if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
	if (totalMinutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

function pluralizeTurns(n: number): string {
	return `${n} turn${n === 1 ? "" : "s"}`;
}

function thinkingSummaryStyledText(body: string, hovered = false): string {
	const color = hovered ? brightenAnsi(WORKED_LINE_FG) : WORKED_LINE_FG;
	return `${color}${body}${RESET}`;
}

/** Brighten an existing color without changing its hue. */
function brightenAnsi(baseAnsi: string): string {
	const rgb = parseAnsiRgb(baseAnsi);
	if (!rgb) return "\x1b[97m";
	const maximum = Math.max(rgb.r, rgb.g, rgb.b);
	if (maximum === 0) return baseAnsi;
	const scale = Math.min(1.12, 255 / maximum);
	const lift = (channel: number) => Math.round(channel * scale);
	return `\x1b[38;2;${lift(rgb.r)};${lift(rgb.g)};${lift(rgb.b)}m`;
}

function brightenRenderedLine(line: string): string {
	return line.replace(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g, (_match, r, g, b) => brightenAnsi(`\x1b[38;2;${r};${g};${b}m`));
}

function thinkingActiveSummaryText(): string {
	return thinkingSummaryStyledText("Thinking...");
}

function thoughtDurationSummaryText(ms: number): string {
	return thinkingSummaryStyledText(`Thought for ${formatThoughtDuration(ms)}`);
}

function getMessageThinkingDurationMs(message: any): number {
	const stored = thinkingLabels.getThinkingDurationMetadata(message);
	if (stored !== undefined) return stored;
	let totalChars = 0;
	if (Array.isArray(message?.content)) {
		for (const block of message.content) {
			if (block?.type === "thinking" && typeof block.thinking === "string") {
				totalChars += block.thinking.length;
			}
		}
	}
	return Math.max(1000, Math.round((totalChars / 150) * 1000));
}

function hiddenThinkingSummaryForMessage(message: any, comp?: any): string {
	if (message && !isAssistantThinkingComplete(comp, message) && isLiveThinkingMessage(comp, message)) {
		return thinkingActiveSummaryText();
	}
	const durationMs = getMessageThinkingDurationMs(message);
	return thoughtDurationSummaryText(durationMs);
}

function assistantMessageThinkingComplete(this: any, message: any): boolean {
	return isAssistantThinkingComplete(this, message);
}

function messageHasThinkingContent(message: any): boolean {
	return Array.isArray(message?.content)
		&& message.content.some((block: any) => block?.type === "thinking" && typeof block.thinking === "string" && block.thinking.trim());
}

function workedDurationText(ms: number, sessionTotalMs?: number, turns?: number): string {
	let text = `${WORKED_LINE_FG}✻ Turn took ${formatWorkedDuration(ms)}`;
	if (typeof sessionTotalMs === "number" && typeof turns === "number" && turns > 0) {
		text += ` (Total time ${formatSessionTotal(sessionTotalMs)} · ${pluralizeTurns(turns)})`;
	}
	return `${text}${RESET}`;
}

function isWorkedDurationLine(line: string): boolean {
	return line.includes(WORKED_DURATION_MARKER) && /^✻ Turn took [^\r\n]+$/.test(stripAnsi(line).trim());
}

function stripWorkedDurationLine(text: string): string {
	if (!text.includes(WORKED_DURATION_MARKER)) return text;
	return text
		.split(/\r?\n/)
		.filter((line) => !isWorkedDurationLine(line))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n");
}

function hasWorkedDurationLine(message: any): boolean {
	if (!Array.isArray(message?.content)) return false;
	return message.content.some((block: any) => {
		if (block?.type !== "text" || typeof block.text !== "string" || !block.text.includes(WORKED_DURATION_MARKER)) return false;
		return block.text.split(/\r?\n/).some(isWorkedDurationLine);
	});
}

const COPY_SAFE_MARKDOWN_LINKS_FLAG = Symbol.for("pi-claude-style-tools:copy-safe-markdown-links");

/** Unordered list marker: monochrome ◉ (fisheye) instead of "- " (thinking blocks skip this). */
function assistantListBulletMarker(marker: string): string {
	if (marker.startsWith("- ")) return `◉ ${marker.slice(2)}`;
	return marker;
}

function copySafeMarkdownTheme(theme: MarkdownThemeLike): MarkdownThemeLike {
	const listBullet = theme.listBullet;
	return {
		...theme,
		link: (text: string) => stripAnsi(text),
		linkUrl: (text: string) => stripAnsi(text),
		listBullet: listBullet
			? (marker: string) => listBullet(assistantListBulletMarker(marker))
			: (marker: string) => assistantListBulletMarker(marker),
	};
}

function makeMarkdownLinksCopySafe(markdown: InstanceType<typeof Markdown>): void {
	const markdownAny = markdown as any;
	if (markdownAny[COPY_SAFE_MARKDOWN_LINKS_FLAG] || !markdownAny.theme) return;
	markdownAny.theme = copySafeMarkdownTheme(markdownAny.theme);
	markdownAny[COPY_SAFE_MARKDOWN_LINKS_FLAG] = true;
	markdown.invalidate?.();
}

// Magic Context prefixes live assistant text with §N§ while the response is
// streaming and removes that metadata on message_end. Keep the transient tag
// out of the display without mutating the message used by context management.
const MAGIC_CONTEXT_TAG_LINE_PREFIX = /(^|\r?\n)[ \t]*(?:§\d+§[ \t]*)+/g;

function stripTransientMagicContextTags(text: string): string {
	return text.replace(MAGIC_CONTEXT_TAG_LINE_PREFIX, "$1");
}

// Tool results can carry transient Magic Context tags too (live-prefixed output
// chunks). Renderers must see sanitized text WITHOUT mutating this.result — the
// result object is the stored message used by context management. Clone blocks
// only when a tag is actually present so the common path stays zero-cost.
function sanitizeToolResultForDisplay(result: any): any {
	if (!result || !Array.isArray(result.content)) return result;
	let changed = false;
	const content = result.content.map((block: any) => {
		if (block && typeof block.text === "string") {
			const stripped = stripTransientMagicContextTags(block.text);
			if (stripped !== block.text) {
				changed = true;
				return { ...block, text: stripped };
			}
		}
		return block;
	});
	return changed ? { ...result, content } : result;
}

// Last-resort display scrubber at the terminal writer choke point. Every
// rendered frame — every component, overlay, preview, and search hit — exits
// through ProcessTerminal.write, so stripping complete §N§ tokens there covers
// any surface the targeted strips above can't reach, including mid-sentence
// tag references replayed from old tool output on resume. Display only:
// storage, LLM context, copy/paste sources, and ANSI sequences are untouched
// (tags are plain characters; escape sequences never contain them).
const MAGIC_CONTEXT_TAG_TOKEN = /§\d+§/g;
const TERMINAL_SCRUB_PATCH_FLAG = Symbol.for("pi-claude-style-tools:terminal-write-tag-scrub");

function patchTerminalWriteTagScrubber(): void {
	const proto = (ProcessTerminal as any)?.prototype;
	if (!proto || proto[TERMINAL_SCRUB_PATCH_FLAG]) return;
	const originalWrite = proto.write;
	if (typeof originalWrite !== "function") return;
	proto.write = function patchedTerminalWrite(this: any, data: any, ...rest: any[]) {
		if (typeof data === "string") {
			if (data.includes("§")) data = data.replace(MAGIC_CONTEXT_TAG_TOKEN, "");
			// Copy markers are for Pi's own selection; the terminal never needs them.
			data = stripCopyMarks(data);
		}
		return originalWrite.call(this, data, ...rest);
	};
	proto[TERMINAL_SCRUB_PATCH_FLAG] = true;
}

// Code spans and fenced blocks are literal Markdown source. Math preprocessing
// must never touch delimiters inside them: `$$` is the shell PID and `\[ ... \]
// appears in grep/ripgrep class regexes. Inline formatting splits on this
// expression before transforming; display-math block scanning below reuses it
// so a math candidate opening inside code is skipped in favor of real prose.
function trimRenderedBlankLines(lines: string[]): string[] {
	let start = 0;
	while (start < lines.length && isBlankLine(lines[start])) start++;
	let end = lines.length - 1;
	while (end >= start && isBlankLine(lines[end])) end--;
	return start <= end ? lines.slice(start, end + 1) : [];
}

// ---------------------------------------------------------------------------
// pi-subagents (@tintinweb/pi-subagents): Agent rows, completion notices and the live
// "Agents" widget, drawn with the same dots, connectors and indentation as tool rows.
// ---------------------------------------------------------------------------

function branchGlyph(glyph: "├" | "└" | "│"): string {
	return `${currentToolBranchAnsi()}${glyph}${TRANSPARENT_RESET}`;
}

function formatAgentTokens(tokens: unknown): string {
	if (typeof tokens === "string") return tokens.trim();
	if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens <= 0) return "";
	return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k tokens` : `${tokens} tokens`;
}

/** "3 turns · 4 tool uses · 28.5k tokens · 5s" from pi-subagents' details. */
function agentStatsText(details: any, durationMs?: number): string {
	const parts: string[] = [];
	if (typeof details?.modelName === "string" && details.modelName) parts.push(details.modelName);
	const turns = Number(details?.turnCount);
	if (Number.isFinite(turns) && turns > 1) parts.push(`${turns} turns`);
	const toolUses = Number(details?.toolUses);
	if (Number.isFinite(toolUses) && toolUses > 0) parts.push(`${toolUses} tool use${toolUses === 1 ? "" : "s"}`);
	const tokens = formatAgentTokens(details?.tokens ?? details?.totalTokens);
	if (tokens) parts.push(tokens);
	const ms = Number(durationMs ?? details?.durationMs);
	if (Number.isFinite(ms) && ms > 0) parts.push(formatWorkedDuration(ms));
	return parts.join(" · ");
}

/** Result rows for pi-subagents' Agent tool, or undefined to use the generic rendering. */
function renderAgentToolResult(result: any, expanded: boolean, isPartial: boolean, theme: Theme, ctx: any): Text | undefined {
	const details = result?.details;
	const status = typeof details?.status === "string" ? details.status : undefined;
	if (!status || ctx.isError) return undefined;
	const stats = agentStatsText(details);
	const statsSuffix = stats ? theme.fg("muted", ` · ${stats}`) : "";
	if (isPartial || status === "running" || status === "queued") {
		const activity = typeof details.activity === "string" && details.activity ? details.activity : "thinking...";
		return makeText(ctx.lastComponent, withBranch(`${theme.fg("dim", activity)}${statsSuffix}`, theme));
	}
	clearBlinkTimer(ctx);
	if (status === "background") {
		setToolStatus(ctx, "success");
		const id = typeof details.agentId === "string" ? theme.fg("muted", ` (${details.agentId})`) : "";
		return makeText(ctx.lastComponent, withBranch(`${theme.fg("dim", "Running in background")}${id}`, theme));
	}
	if (status === "completed" || status === "steered") {
		setToolStatus(ctx, "success");
		const label = status === "steered" ? theme.fg("warning", "Wrapped up (turn limit)") : theme.fg("success", "Done");
		const text = getTextContent(result).trim();
		if (!expanded || !text) {
			return makeText(ctx.lastComponent, withBranch(`${label}${statsSuffix}${text ? toolOutputDetailHint(theme, expanded) : ""}`, theme));
		}
		const lines = text.split("\n");
		const preview = buildPreviewText(lines, true, theme, previewLimit(), lines.length, (line) => theme.fg("dim", line || " "));
		return makeText(ctx.lastComponent, withBranch(`${label}${statsSuffix}\n${preview}`, theme));
	}
	if (status === "stopped") {
		setToolStatus(ctx, "success");
		return makeText(ctx.lastComponent, withBranch(`${theme.fg("muted", "Stopped")}${statsSuffix}`, theme));
	}
	setToolStatus(ctx, "error");
	const reason = status === "aborted" ? "Aborted (max turns exceeded)" : `Error: ${details.error ?? "unknown"}`;
	return makeText(ctx.lastComponent, withBranch(`${theme.fg("error", reason)}${statsSuffix}`, theme));
}

/** A finished background agent's notice, drawn like a finished tool row. */
function renderSubagentNotificationLines(details: any, expanded: boolean, width: number, theme: Theme): string[] {
	const agents = [details, ...(Array.isArray(details?.others) ? details.others : [])].filter((agent) => agent && typeof agent === "object");
	const blocks: string[][] = [];
	for (const agent of agents) {
		const status = String(agent.status ?? "completed");
		const failed = status === "error" || status === "stopped" || status === "aborted";
		const dot = paintStatusDot(failed ? TOOL_STATUS_ERROR : TOOL_STATUS_SUCCESS);
		const statusLabel = status === "steered" ? "completed (turn limit)" : status;
		const header = ` ${dot} ${theme.fg("toolTitle", theme.bold("Agent"))} ${theme.fg("accent", String(agent.description ?? "agent"))} ${theme.fg(failed ? "error" : "muted", statusLabel)}`;
		const body: string[] = [];
		const stats = agentStatsText(agent);
		if (stats) body.push(theme.fg("dim", stats));
		const preview = String(agent.resultPreview ?? "").trim();
		if (preview) {
			const previewLines = preview.split("\n");
			const shown = expanded ? previewLines.slice(0, 30) : [previewLines[0] ?? ""];
			for (const line of shown) body.push(theme.fg("dim", line || " "));
		}
		if (expanded && typeof agent.outputFile === "string" && agent.outputFile) {
			body.push(theme.fg("muted", `transcript: ${agent.outputFile}`));
		}
		const lines = [header];
		body.forEach((line, index) => lines.push(` ${BRANCH_INDENT}${branchGlyph(index === body.length - 1 ? "└" : "├")} ${line}`));
		blocks.push(lines.map((line) => clampLineWidth(line, width)));
	}
	return blocks.flatMap((block, index) => (index === 0 ? block : ["", ...block]));
}

const AGENT_WIDGET_PATCH_FLAG = Symbol.for("pi-claude-style-tools:agent-widget-restyle");
const ANSI_PREFIX = "((?:\\x1b\\[[0-9;]*m)*)";
const AGENT_WIDGET_HEADING_RE = new RegExp(`^${ANSI_PREFIX}([●○])${ANSI_PREFIX}\\s+${ANSI_PREFIX}Agents`);
const AGENT_WIDGET_ITEM_RE = new RegExp(`^${ANSI_PREFIX}([├└])─${ANSI_PREFIX} (.*)$`);
const AGENT_WIDGET_ACTIVITY_RE = new RegExp(`^${ANSI_PREFIX}(│| )  ${ANSI_PREFIX}(?:${ANSI_PREFIX})?\\s*⎿\\s+(.*)$`);

/**
 * pi-subagents' "Agents" widget lines, re-indented to match tool rows. Running agents keep
 * pi-subagents' own spinner: it advances on pi-subagents' timer, which keeps running after the
 * turn ends, while our tool-row animation only advances while a tool row is busy.
 */
// A finished agent's status glyph (✓ done, ✗ error or aborted, ■ stopped) becomes the ● that
// tool rows use, keeping pi-subagents' color for it (green, red, dim).
const AGENT_WIDGET_STATUS_GLYPH_RE = /^((?:\x1b\[[0-9;]*m)*)[✓✔✗■]((?:\x1b\[[0-9;]*m)*)(?=\s)/;

function restyleAgentWidgetLines(lines: string[], width: number): string[] {
	if (!Array.isArray(lines)) return lines;
	return lines.map((raw) => {
		if (typeof raw !== "string") return raw;
		// A widget line is one terminal row. pi-subagents puts the start of an agent's error
		// in its row, and errors can span lines ("...exhausted for codex\n\nCredential issues").
		const line = raw.includes("\n") ? raw.replace(/[ \t]*\r?\n[\s]*/g, " ") : raw;
		const heading = AGENT_WIDGET_HEADING_RE.exec(line);
		if (heading) return clampLineWidth(` ${paintStatusDot(TOOL_STATUS_SUCCESS)} Agents`, width);
		const item = AGENT_WIDGET_ITEM_RE.exec(line);
		if (item) {
			const rest = item[4].replace(AGENT_WIDGET_STATUS_GLYPH_RE, `$1${STATUS_DOT_BOLD}●$2`);
			return clampLineWidth(` ${BRANCH_INDENT}${branchGlyph(item[2] as "├" | "└")} ${rest}`, width);
		}
		const activity = AGENT_WIDGET_ACTIVITY_RE.exec(line);
		if (activity) {
			const bar = activity[2] === "│" ? branchGlyph("│") : " ";
			const dim = safeFgAnsi(getGlobalPiTheme(), "dim") ?? themePalette.fgDim;
			return clampLineWidth(` ${BRANCH_INDENT}${bar}   ${dim}${stripAnsi(activity[5])}${TRANSPARENT_RESET}`, width);
		}
		return line;
	});
}

function patchAgentWidget(ui: any): void {
	if (!ui || ui[AGENT_WIDGET_PATCH_FLAG] || typeof ui.setWidget !== "function") return;
	const original = ui.setWidget;
	ui.setWidget = function patchedSetWidget(this: any, key: string, content: any, options?: any) {
		if (key === "agents" && typeof content === "function") {
			const factory = content;
			content = (tui: any, theme: any) => {
				const component = factory(tui, theme);
				if (component && typeof component.render === "function") {
					const render = component.render.bind(component);
					component.render = (width: number) => restyleAgentWidgetLines(render(width), width);
				}
				return component;
			};
		}
		return original.call(this, key, content, options);
	};
	ui[AGENT_WIDGET_PATCH_FLAG] = true;
}

function isSubagentNotificationMessage(message: unknown): boolean {
	const candidate = message as Record<string, unknown> | undefined;
	return candidate?.customType === "subagent-notification";
}

function isSubagentHeaderLine(line: string): boolean {
	return /^[✓✔✗■●]\s+/.test(stripAnsi(line).trimStart());
}

function isSubagentDetailLine(line: string): boolean {
	const plain = stripAnsi(line).trimStart();
	return plain.startsWith("⎿")
		|| plain.startsWith("transcript:")
		|| plain === "No output."
		|| /^(?:Done|Wrapped up|Stopped|Error:|Aborted)\b/.test(plain);
}

function cleanSubagentDetailLine(line: string): string {
	const markerIndex = line.indexOf("⎿");
	if (markerIndex !== -1) {
		const prefixAnsi = (line.slice(0, markerIndex).match(ANSI_RE) ?? []).join("");
		return `${prefixAnsi}${line.slice(markerIndex + 1).replace(/^\s+/, "")}`;
	}
	return line
		.replace(/^((?:\x1b\[[0-9;]*m)*)\s{2}/, "$1")
		.replace(/^\s{2}/, "");
}

function formatSubagentNotificationGroup(lines: string[]): string[] {
	if (lines.length === 0) return [];
	const header = normalizeLeadingCheckGlyph(lines[0]);
	const rest = lines.slice(1);
	const detailStart = rest.findIndex(isSubagentDetailLine);
	if (detailStart === -1) {
		return [header, ...rest];
	}

	const metadata = rest.slice(0, detailStart);
	const detailLines = rest.slice(detailStart).map(cleanSubagentDetailLine).filter((line) => stripAnsi(line).trim().length > 0);
	const formattedDetails = withFinalBranchBlock(detailLines.join("\n"), undefined as any).split("\n").filter((line) => line.length > 0);
	return [header, ...metadata, ...formattedDetails];
}

function splitSubagentNotificationGroups(lines: string[]): string[][] {
	const groups: string[][] = [];
	let current: string[] = [];
	for (const line of lines) {
		if (isSubagentHeaderLine(line) && current.length > 0) {
			groups.push(current);
			current = [line];
		} else {
			current.push(line);
		}
	}
	if (current.length > 0) groups.push(current);
	return groups;
}

function frameToolLikeLines(lines: string[], width: number): string[] {
	syncToolBackgroundMode();
	const safeWidth = Math.max(1, width);
	const core = trimRenderedBlankLines(lines).map((line) => clampLineWidth(line, safeWidth));
	if (core.length === 0 || toolBackgroundMode === "default") return core;
	const spacerLine = " ".repeat(safeWidth);
	if (toolBackgroundMode === "outlines") {
		return [spacerLine, borderLine(safeWidth), ...core, borderLine(safeWidth)];
	}
	return [spacerLine, ...core];
}

function formatSubagentNotification(lines: string[], width: number): string[] {
	const core = trimRenderedBlankLines(lines).map(normalizeLeadingCheckGlyph);
	if (core.length === 0) return lines;
	const formatted = splitSubagentNotificationGroups(core).flatMap((group, index) => {
		const groupLines = formatSubagentNotificationGroup(group);
		return index === 0 ? groupLines : ["", ...groupLines];
	});
	const indented = formatted.map((line) => (line ? ` ${line}` : line));
	return frameToolLikeLines(indented, width);
}

function stripOsc133Zones(line: string): string {
	return line
		.replace(OSC133_ZONE_START, "")
		.replace(OSC133_ZONE_END, "")
		.replace(OSC133_ZONE_FINAL, "");
}

function visitMarkdownDescendants(root: unknown, visit: (md: InstanceType<typeof Markdown>) => void): void {
	if (!root || typeof root !== "object") return;
	const node = root as { children?: unknown[] };
	for (const child of node.children ?? []) {
		if (isMarkdownComponent(child)) visit(child);
		else visitMarkdownDescendants(child, visit);
	}
}

const THINKING_HOVER_KEY = Symbol.for("pi-claude-style-tools:thinking-hover");

function thinkingVisualChild(child: any): any {
	const inner = child?.child ?? child;
	if (
		inner instanceof ThinkingParagraph
		|| inner?.constructor?.name === "HiddenThinkingSummary"
		|| inner?.constructor?.name === "ThinkingParagraph"
	) return inner;
	return undefined;
}

function thinkingLayout(component: any, width: number): Array<{ component: any; height: number }> {
	const container = component?.contentContainer;
	const children = Array.isArray(container?.children) ? container.children : [];
	if (container?.mouseLayout?.width === width) return container.mouseLayout.children;
	return children.map((child: any) => ({ component: child, height: child.render(width).length }));
}

function thinkingRowAt(component: any, event: TuiMouseEvent): any {
	let childY = 0;
	for (const entry of thinkingLayout(component, event.width)) {
		if (event.y >= childY && event.y < childY + entry.height) return thinkingVisualChild(entry.component);
		childY += entry.height;
	}
	return undefined;
}

function setThinkingHover(component: any, hovered: any): boolean {
	const previous = component[THINKING_HOVER_KEY];
	if (previous === hovered) return false;
	previous?.setHovered?.(false);
	if (hovered) hovered.setHovered(true);
	component[THINKING_HOVER_KEY] = hovered;
	clearMessageRenderCache(component);
	return true;
}

function patchAssistantFullscreenMouse(): void {
	const proto = AssistantMessageComponent.prototype as any;
	if (proto[ASSISTANT_MOUSE_PATCH_FLAG]) return;
	const originalHandleMouse = proto.handleMouse;
	proto.handleMouse = function patchedAssistantHandleMouse(event: TuiMouseEvent) {
		const hovered = thinkingRowAt(this, event);
		if (event.type === "move" && hovered) {
			claimClickHover(this, () => { if (setThinkingHover(this, undefined)) requestComponentRender(this); });
		}
		const hoverChanged = event.type === "move" ? setThinkingHover(this, hovered) : false;
		if (event.type === "move") return hoverChanged ? { handled: true, render: true } : undefined;
		// Claim the row before Pi's MouseRegion. Its handler restores the italic
		// "Thinking..." label while a block is streaming.
		if (isPrimaryClick(event) && hovered && this.lastMessage) {
			const overrides = this.thinkingVisibilityOverrides instanceof Map
				? this.thinkingVisibilityOverrides
				: new Map();
			this.thinkingVisibilityOverrides = overrides;
			const expanding = hovered instanceof ThinkingParagraph;
			keepClickedRowInPlace(undefined, expanding, this, event);
			overrides.set(0, expanding);
			this.updateContent(this.lastMessage);
			return { handled: true };
		}
		return typeof originalHandleMouse === "function" ? originalHandleMouse.call(this, event) : undefined;
	};
	proto[ASSISTANT_MOUSE_PATCH_FLAG] = true;
}

const TOOL_BG_PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-tool-bg-sync");

function patchToolExecutionBackgroundSync(): void {
	const proto = ToolExecutionComponent.prototype as any;
	if (proto[TOOL_BG_PATCH_FLAG]) return;
	const originalUpdateDisplay = proto.updateDisplay;
	if (typeof originalUpdateDisplay !== "function") return;
	proto.updateDisplay = function patchedToolBackgroundSync(this: any) {
		syncToolBackgroundMode();
		applyToolBackgroundMode(getGlobalPiTheme());
		return originalUpdateDisplay.apply(this, arguments as any);
	};
	proto[TOOL_BG_PATCH_FLAG] = true;
}

function deleteRenderedKittyImages(component: any): void {
	if (!process.stdout.isTTY || getCapabilities().images !== "kitty" || !Array.isArray(component.imageComponents) || component.imageComponents.length === 0) return;
	try { process.stdout.write(deleteAllKittyImages()); } catch { /* noop */ }
}

function removeImageChildren(component: any): void {
	deleteRenderedKittyImages(component);
	const children = [
		...(Array.isArray(component.imageComponents) ? component.imageComponents : []),
		...(Array.isArray(component.imageSpacers) ? component.imageSpacers : []),
	];
	for (const child of children) {
		try { component.removeChild?.(child); } catch { /* noop */ }
	}
	component.imageComponents = [];
	// Pi reuses image components by matching imageSources; clear both caches.
	component.imageSources = [];
	component.imageSpacers = [];
}

function patchReadImageExpansion(): void {
	const proto = ToolExecutionComponent.prototype as any;
	if (proto[TOOL_IMAGE_EXPAND_PATCH_FLAG]) return;
	const originalUpdateDisplay = proto.updateDisplay;
	if (typeof originalUpdateDisplay !== "function") return;
	proto.updateDisplay = function patchedReadImageUpdateDisplay(...args: any[]) {
		const result = originalUpdateDisplay.apply(this, args);
		const hasImage = Array.isArray(this.result?.content) && this.result.content.some((block: any) => block?.type === "image");
		if (this.toolName === "read" && hasImage && this.expanded !== true) {
			removeImageChildren(this);
			clearToolRenderCache(this);
		}
		return result;
	};
	proto[TOOL_IMAGE_EXPAND_PATCH_FLAG] = true;
}

function shortPath(cwd: string, filePath: string): string {
	if (!filePath) return "";
	const rel = relative(cwd, filePath);
	if (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) return rel || ".";
	const homeRelative = relative(homedir(), filePath);
	if (homeRelative === ".." || homeRelative.startsWith(`..${sep}`) || isAbsolute(homeRelative)) return filePath;
	return homeRelative ? `~${sep}${homeRelative}` : "~";
}

// ---------------------------------------------------------------------------
// Status dot — flickers green/gray while pending
// ---------------------------------------------------------------------------

function isBlinkOn(): boolean {
	return Math.floor(Date.now() / 500) % 2 === 0;
}

/** `summaryColor`: accent for literal values (commands, paths), text for plain-English labels. */
function toolHeader(tool: string, summary: string, theme: Theme, prefix = "", trailing = "", summaryColor: "accent" | "text" = "accent"): string {
	themePalette.applyThemePaletteIfNeeded(theme);
	const label = theme.fg("toolTitle", theme.bold(tool));
	const body = summary
		? `${label} ${WRAP_MARK}${theme.fg(summaryColor, summary)}`
		: label;
	return trailing ? `${prefix}${body}${trailing}` : `${prefix}${body}`;
}

function liveLineCountTrailing(ctx: any, theme: Theme): string {
	if (ctx?.isPartial !== true) return "";
	const count = ctx?.state?._liveLineCount;
	if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return "";
	return ` ${theme.fg("muted", `(${lineCountLabel(count)})`)}`;
}

function bashHeaderTrailing(ctx: any, theme: Theme): string {
	const parts: string[] = [];
	if (ctx?.isPartial === true) {
		const count = ctx?.state?._liveLineCount;
		if (typeof count === "number" && Number.isFinite(count) && count > 0) parts.push(lineCountLabel(count));
	}
	const duration = bashPresentation.bashDurationText(ctx);
	if (duration) parts.push(duration);
	return parts.length > 0 ? `${TRAILING_MARK}${theme.fg("muted", parts.join(" · "))}` : "";
}

function setToolStatus(ctx: any, status: "pending" | "success" | "error" | "idle"): void {
	if (ctx?.state) ctx.state._toolStatus = status;
}

function syncToolCallStatus(ctx: any): void {
	if (ctx?.isPartial) {
		// Blink only for tools that actually started in the current agent run.
		// History rebuilds (resume, compaction, /tree) leave unmatched tool calls
		// with isPartial=true forever and never set executionStarted — those must
		// render settled, not keep a pending blink alive across sessions.
		const agentLive = thinkingLabels.isAgentWorkActive();
		const started = ctx?.executionStarted === true;
		if (agentLive && started) {
			setToolStatus(ctx, "pending");
			return;
		}
		if (agentLive && !started) {
			// Args still streaming before tool_execution_start — static, no blink.
			setToolStatus(ctx, "idle");
			clearBlinkTimer(ctx);
			return;
		}
		setToolStatus(ctx, "success");
		clearBlinkTimer(ctx);
		return;
	}
	setToolStatus(ctx, ctx.isError ? "error" : "success");
	clearBlinkTimer(ctx);
}

function shouldRevealCallArgs(ctx: any): boolean {
	if (ctx?.argsComplete === true || ctx?.executionStarted === true) return true;
	const args = ctx?.args;
	if (!args || typeof args !== "object") return false;
	return Object.keys(args).some((key) => args[key] !== undefined && args[key] !== null && args[key] !== "");
}

function stableCallSummary(ctx: any, key: string, build: () => string, reveal = shouldRevealCallArgs(ctx)): string {
	const state = ctx?.state;
	const cached = state?.[key];
	const completeKey = `${key}Complete`;
	if (!reveal) return typeof cached === "string" ? cached : "";
	if (ctx?.argsComplete === true && state?.[completeKey] === true && typeof cached === "string") return cached;
	if (!shouldRevealCallArgs(ctx) && typeof cached === "string" && cached) return cached;
	const summary = build();
	if (state) {
		state[key] = summary;
		if (ctx?.argsComplete === true) state[completeKey] = true;
		else delete state[completeKey];
	}
	return summary;
}

function hasOwnArg(args: any, key: string): boolean {
	return !!args && Object.prototype.hasOwnProperty.call(args, key);
}

function fileExistsForTool(cwd: string, filePath: string): boolean {
	if (!filePath) return false;
	try {
		return existsSync(resolve(cwd, filePath));
	} catch {
		return false;
	}
}

const WRITE_EXISTED_BEFORE = new Map<string, boolean>();
const EDIT_LOCALIZED = new Map<string, Promise<LocalizedEditDiff[] | null>>();

function getWriteWasNewFile(ctx: any, cwd: string, filePath: string, reveal = shouldRevealCallArgs(ctx)): boolean | undefined {
	if (typeof ctx?.state?._writeWasNewFile === "boolean") return ctx.state._writeWasNewFile;
	if (!filePath || !reveal) return undefined;
	const existedBefore = typeof ctx?.toolCallId === "string" ? WRITE_EXISTED_BEFORE.get(ctx.toolCallId) : undefined;
	const wasNew = existedBefore === undefined ? !fileExistsForTool(cwd, filePath) : !existedBefore;
	if (ctx?.state) ctx.state._writeWasNewFile = wasNew;
	return wasNew;
}

function toolStatusDot(ctx: any, theme: Theme): string {
	const status = ctx.state?._toolStatus as "pending" | "success" | "error" | "idle" | undefined;
	if (status === "success") return `${themeStatusDot(theme, "success")} `;
	if (status === "error") return `${themeStatusDot(theme, "error")} `;
	if (status === "idle") return `${themeStatusDot(theme, "dim")} `;
	return `${blinkDot(ctx, theme)} `;
}

// ---------------------------------------------------------------------------
// Branch connector — visual tree from header to output
// ---------------------------------------------------------------------------

// Connectors hang under the first letter of the tool's label, two columns in from its ●
// (`● Edit stats.py` / `  └ +1 -1 at line 4`), like Claude Code and pi-polish.
const BRANCH_INDENT = "  ";

function branchIndent(text: string, continued = false, theme?: Theme): string {
	const rule = currentToolBranchAnsi(theme);
	// Align under bare `├ `/`└ ` (│ + one space, or two spaces when closed).
	const prefix = continued ? `${rule}│${TRANSPARENT_RESET} ` : "  ";
	return `${BRANCH_INDENT}${prefix}${WRAP_MARK}${text}`;
}

function branchLead(text: string, continued = false, theme?: Theme): string {
	const rule = currentToolBranchAnsi(theme);
	// Bare tee/corner only — no horizontal ─ arm.
	return `${BRANCH_INDENT}${rule}${continued ? "├" : "└"}${TRANSPARENT_RESET} ${WRAP_MARK}${text}`;
}

// SGR parameters that set a foreground color: 30–37, 39, 90–97, 38;5;n, 38;2;r;g;b.
function stripForegroundAnsi(text: string): string {
	return text.replace(/\x1b\[([0-9;]*)m/g, (match, paramsText: string) => {
		if (paramsText === "") return match;
		const params = paramsText.split(";");
		const kept: string[] = [];
		for (let i = 0; i < params.length; i++) {
			const code = Number(params[i] || "0");
			if (code === 38) {
				const mode = Number(params[i + 1] || "0");
				i += mode === 2 ? 4 : mode === 5 ? 2 : 1;
				continue;
			}
			if ((code >= 30 && code <= 37) || code === 39 || (code >= 90 && code <= 97)) continue;
			kept.push(params[i]);
		}
		return kept.length === 0 ? "" : `\x1b[${kept.join(";")}m`;
	});
}

/**
 * The status line under a tool's label ("Done (3 lines)", "2 matches", "+1 -1 at line 4")
 * in the theme's dim color, as pi-polish draws it. Errors keep their red.
 */
function toneStatusLine(text: string, theme?: Theme): string {
	const t = (theme ?? getGlobalPiTheme()) as any;
	const dim = safeFgAnsi(t, "dim");
	if (!dim || !text.trim()) return text;
	const error = safeFgAnsi(t, "error");
	if ((error && text.includes(error)) || text.includes(TOOL_STATUS_ERROR)) return text;
	const body = stripForegroundAnsi(text).replace(/\x1b\[0?m/g, (reset) => `${reset}${dim}`);
	return `${dim}${body}\x1b[39m`;
}

/** `tone`: the first line is a status line (dim); pass false when it is content (a command, a path). */
function withBranch(content: string, theme: Theme, _isError = false, continued = false, tone = true): string {
	if (!content || !content.trim()) return "";
	const lines = content.split("\n");
	const first = tone ? toneStatusLine(lines[0] ?? "", theme) : lines[0] ?? "";
	if (lines.length === 1) return branchLead(first, continued, theme);
	const rest = lines.slice(1).map((line) => branchIndent(line, continued, theme));
	return `${branchLead(first, continued, theme)}\n${rest.join("\n")}`;
}

function withClippedBranch(content: string, theme: Theme, continued = false, tone = true): string {
	return withBranch(content, theme, false, continued, tone).replaceAll(WRAP_MARK, CLIP_MARK);
}

function withFinalBranchBlock(content: string, theme: Theme, isError = false, tone = true): string {
	if (!content || !content.trim()) return "";
	const lines = content.split("\n");
	const first = tone ? toneStatusLine(lines[0] ?? "", theme) : lines[0] ?? "";
	if (lines.length === 1) return branchLead(first, false, theme);
	const middle = lines.slice(1, -1).map((line) => branchIndent(line, true, theme));
	const last = lines[lines.length - 1] ?? "";
	return [branchLead(first, true, theme), ...middle, branchLead(last, false, theme)].join("\n");
}

// ---------------------------------------------------------------------------
// Blink timer for partial (running) states
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Global blink timer — single timer invalidates all active contexts
// ---------------------------------------------------------------------------

const MAX_BLINKING_TOOLS = 5;
const BLINK_INTERVAL_MS = 500;
// Safety net ONLY for leaked entries after the agent has stopped. Quiet
// long-running tools (sleep, sparse builds, waiting on network) legitimately
// emit no tool_execution_update for minutes — treating that silence as "stale"
// is what made their ● freeze mid-run.
const BLINK_STALE_TIMEOUT_MS = 15000;
let _lastBlinkActivity = 0;

function markBlinkActivity(): void {
	_lastBlinkActivity = Date.now();
}

type BlinkEntry = { key: any; order: number; invalidate: () => void };

const _blinkContexts = new Map<any, BlinkEntry>();
let _globalBlinkTimer: ReturnType<typeof setTimeout> | null = null;
let _blinkOrder = 0;
// Shared phase for all pending tools, mapped onto a 6-step size breath cycle.
let _globalBlinkPhaseIndex = 0;

function getBlinkIntervalMs(): number {
	return BLINK_INTERVAL_MS;
}

function getBlinkKey(ctx: any): any {
	return ctx?.state ?? ctx;
}

function getBlinkingEntries(): BlinkEntry[] {
	return [..._blinkContexts.values()]
		.sort((a, b) => b.order - a.order)
		.slice(0, MAX_BLINKING_TOOLS);
}

function updateBlinkActiveStates(): void {
	const activeSet = new Set(getBlinkingEntries().map((entry) => entry.key));
	for (const entry of _blinkContexts.values()) {
		const active = activeSet.has(entry.key);
		if (entry.key?._blinkActive !== active) {
			entry.key._blinkActive = active;
			try { entry.invalidate(); } catch { /* noop */ }
		}
	}
}

function _clearAllBlinkContexts(): void {
	for (const entry of _blinkContexts.values()) {
		try { entry.key._blinkActive = false; } catch { /* noop */ }
	}
	_blinkContexts.clear();
	if (_globalBlinkTimer) {
		clearTimeout(_globalBlinkTimer);
		_globalBlinkTimer = null;
	}
	updateBlinkActiveStates();
}

function _scheduleGlobalBlinkTimer(): void {
	if (_globalBlinkTimer) return;
	const intervalMs = getBlinkIntervalMs();
	if (_blinkContexts.size === 0) return;
	_globalBlinkTimer = setTimeout(() => {
		_globalBlinkTimer = null;
		if (_blinkContexts.size === 0) {
			updateBlinkActiveStates();
			return;
		}
		// While an agent run is live, quiet tools are still in flight — keep blinking.
		// Heartbeat here so sparse/no-output commands never look "stale".
		if (thinkingLabels.isAgentWorkActive()) {
			markBlinkActivity();
		} else if (_lastBlinkActivity && Date.now() - _lastBlinkActivity > BLINK_STALE_TIMEOUT_MS) {
			// Agent already finished; leftover entries are leaks. Stop the re-render storm.
			_clearAllBlinkContexts();
			return;
		}
		_globalBlinkPhaseIndex = (_globalBlinkPhaseIndex + 1) % PENDING_BREATHE_LEN;
		for (const entry of getBlinkingEntries()) {
			try { entry.invalidate(); } catch { /* noop */ }
		}
		_scheduleGlobalBlinkTimer();
	}, intervalMs);
	unrefTimer(_globalBlinkTimer);
}

function _stopGlobalBlinkTimerIfEmpty(): void {
	if (_globalBlinkTimer && _blinkContexts.size === 0) {
		clearTimeout(_globalBlinkTimer);
		_globalBlinkTimer = null;
	}
}

function setupBlinkTimer(ctx: any): void {
	const key = getBlinkKey(ctx);
	if (!key) return;
	const invalidate = typeof ctx?.invalidate === "function" ? () => safeInvalidate(ctx) : () => {};
	const existing = _blinkContexts.get(key);
	if (existing) {
		// Already tracked — refresh invalidate + ensure the global timer is alive.
		// If a prior watchdog/pass stopped the timer without removing this entry
		// (or the timer simply died), a quiet long-running tool would otherwise
		// stay registered forever with a frozen ●.
		existing.invalidate = invalidate;
		markBlinkActivity();
		_scheduleGlobalBlinkTimer();
		return;
	}
	_blinkContexts.set(key, { key, order: ++_blinkOrder, invalidate });
	key._blinkActive = false;
	markBlinkActivity();
	updateBlinkActiveStates();
	_stopGlobalBlinkTimerIfEmpty();
	_scheduleGlobalBlinkTimer();
}

function clearBlinkTimer(ctx: any): void {
	const key = getBlinkKey(ctx);
	if (!key) return;
	_blinkContexts.delete(key);
	key._blinkActive = false;
	updateBlinkActiveStates();
	_stopGlobalBlinkTimerIfEmpty();
	_scheduleGlobalBlinkTimer();
}

function pendingToolChromeColor(theme: Theme): "dim" | "muted" | "thinkingText" {
	if (!themeAdaptiveEnabled()) return "muted";
	return "dim";
}

function blinkDot(ctx: any, theme: Theme): string {
	// Only true in-flight tools arm the blink timer. Idle partials (args still
	// streaming, or history rows left isPartial without a result) stay static.
	if (ctx?.state?._toolStatus !== "pending") {
		return themeStatusDot(theme, "dim");
	}
	setupBlinkTimer(ctx);
	const key = getBlinkKey(ctx);
	if (key?._blinkActive !== true) return " ";
	if (toolStatusAnimation() === "blink") {
		return _globalBlinkPhaseIndex % 2 === 0 ? themeStatusDot(theme, "success") : " ";
	}
	return pendingBreatheDot(theme);
}

function lineCount(text: string): number {
	if (!text) return 0;
	return text.split("\n").length;
}

function padToWidth(line: string, width: number): string {
	const safeWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
	const clipped = clampLineWidth(line, safeWidth);
	const padding = Math.max(0, safeWidth - visibleWidth(clipped));
	return `${clipped}${" ".repeat(padding)}`;
}

function markedContinuationPrefix(prefix: string): string {
	const plain = stripAnsi(prefix);
	// Match bare leads (`├ `/`└ `/`│ `) and legacy armed forms (`├─ `/`└─ `/`│  `).
	const branchMatch = /^(\s*)(│  |│ |├─ |└─ |├ |└ )/.exec(plain);
	if (branchMatch) {
		const indent = branchMatch[1];
		// The last branch (└) has nothing below it: its wrapped lines continue under blank space.
		if (branchMatch[2].startsWith("└")) return `${indent}${" ".repeat(visibleWidth(branchMatch[2]))}`;
		// Keep the same structure width as the lead glyph so wraps stay aligned.
		const pad = Math.max(0, visibleWidth(branchMatch[2]) - 1);
		return `${indent}${currentToolBranchAnsi()}│${TRANSPARENT_RESET}${" ".repeat(pad)}`;
	}
	return " ".repeat(visibleWidth(prefix));
}

function wrapMarkedLine(line: string, width: number): string[] {
	const clipIndex = line.indexOf(CLIP_MARK);
	if (clipIndex !== -1) {
		const prefix = line.slice(0, clipIndex);
		const body = line.slice(clipIndex + CLIP_MARK.length);
		if (body.includes(TRAILING_MARK)) return [alignTrailingMarkedLine(`${prefix}${body}`, width)];
		const bodyWidth = Math.max(1, width - visibleWidth(prefix));
		if (visibleWidth(body) <= bodyWidth) return [`${prefix}${body}`];
		const hint = "...";
		return [`${prefix}${truncateToWidth(body, Math.max(0, bodyWidth - visibleWidth(hint)), "", false)}${hint}`];
	}
	const markerIndex = line.indexOf(WRAP_MARK);
	if (markerIndex === -1) return wrapTextWithAnsi(line, width);
	const prefix = line.slice(0, markerIndex);
	const body = line.slice(markerIndex + WRAP_MARK.length);
	const prefixWidth = visibleWidth(prefix);
	const bodyWidth = Math.max(1, width - prefixWidth);
	const wrapped = wrapTextWithAnsi(body, bodyWidth);
	const continuation = markedContinuationPrefix(prefix);
	return wrapped.map((part, index) => (index === 0 ? `${prefix}${part}` : `${continuation}${part}`));
}

class ToolText extends Text {
	private value = "";
	private toolCachedValue?: string;
	private toolCachedWidth?: number;
	private toolCachedLines?: string[];
	private observedWidth?: number;
	private pendingObservedWidth?: number;
	getObservedWidth(): number | undefined {
		return this.observedWidth;
	}
	private widthObserver?: (width: number) => void;
	private widthObserverScheduled = false;

	constructor(text = "") {
		super("", 0, 0);
		this.value = text;
	}

	setText(text: string): void {
		if (this.value === text) return;
		this.value = text;
		this.invalidate();
	}

	setWidthObserver(observer?: (width: number) => void): void {
		this.widthObserver = observer;
		if (!observer) this.pendingObservedWidth = undefined;
	}

	private observeWidth(width: number): void {
		if (this.observedWidth === width) return;
		this.observedWidth = width;
		if (!this.widthObserver) return;
		this.pendingObservedWidth = width;
		if (this.widthObserverScheduled) return;
		this.widthObserverScheduled = true;
		queueMicrotask(() => {
			this.widthObserverScheduled = false;
			const observed = this.pendingObservedWidth;
			this.pendingObservedWidth = undefined;
			if (observed !== undefined) this.widthObserver?.(observed);
		});
	}

	invalidate(): void {
		this.toolCachedValue = undefined;
		this.toolCachedWidth = undefined;
		this.toolCachedLines = undefined;
	}

	render(width: number): string[] {
		this.observeWidth(width);
		const branchKey = toolBranchRenderCacheKey();
		if (
			this.toolCachedLines
			&& this.toolCachedValue === this.value
			&& this.toolCachedWidth === width
			&& (this as any)._toolBranchCacheKey === branchKey
			&& (this as any)._toolBranchCacheEpoch === _toolBranchVisualEpoch
		) return this.toolCachedLines;
		if (!this.value || this.value.trim() === "") {
			this.toolCachedValue = this.value;
			this.toolCachedWidth = width;
			this.toolCachedLines = [];
			return this.toolCachedLines;
		}
		const contentWidth = Math.max(1, width);
		const lines = this.value.replace(/\t/g, "   ").split("\n");
		const rendered = lines
			.flatMap((line) => wrapMarkedLine(line, contentWidth))
			.map((line) => padToWidth(line, width));
		this.toolCachedValue = this.value;
		this.toolCachedWidth = width;
		this.toolCachedLines = rendered;
		(this as any)._toolBranchCacheKey = branchKey;
		(this as any)._toolBranchCacheEpoch = _toolBranchVisualEpoch;
		return rendered;
	}
}

function makeText(last: unknown, text: string): Text {
	const component = last instanceof ToolText ? last : new ToolText();
	component.setWidthObserver();
	component.setText(text);
	return component;
}

function makeResponsiveDiffText(ctx: any, last: unknown, text: string): Text {
	const component = makeText(last, text) as ToolText;
	component.setWidthObserver((width) => {
		if (ctx.state?._diffComponentWidth === width) return;
		if (ctx.state) ctx.state._diffComponentWidth = width;
		safeInvalidate(ctx);
	});
	return component;
}

function diffWidthReady(ctx: any): boolean {
	if (typeof ctx.state?._diffComponentWidth === "number") return true;
	const seen = ctx.lastComponent instanceof ToolText ? ctx.lastComponent.getObservedWidth() : undefined;
	if (seen === undefined || !ctx.state) return false;
	ctx.state._diffComponentWidth = seen;
	return true;
}

function previewLimit(): number {
	const value = readSettings().previewLines;
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 8;
}

function expandedPreviewLimit(): number {
	const settings = readSettings();
	const key = extraToolOutputExpanded ? "extraExpandedPreviewMaxLines" : "expandedPreviewMaxLines";
	const value = settings[key];
	const fallback = extraToolOutputExpanded ? 12000 : 4000;
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function bashCollapsedLimit(): number {
	const value = readSettings().bashCollapsedLines;
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 10;
}

function bashOutputMode(): "opencode" | "summary" | "preview" {
	return getMode(readSettings().bashOutputMode, ["opencode", "summary", "preview"] as const, "opencode");
}

// Off by default: the header already names the command, and repeating a long script under
// it while it runs made the transcript busy. Ctrl+O still shows the whole command.
function bashCommandPreviewLimit(): number {
	const value = readSettings().bashCommandPreviewLines;
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function renderBashCommandBlock(
	command: string,
	expanded: boolean,
	theme: Theme,
): string {
	const presentation = buildBashCommandPresentation(command);
	const limit = bashCommandPreviewLimit();
	if (!expanded && (limit === 0 || presentation.sourceLineCount < 2)) return "";
	const sourceLimit = expandedPreviewLimit();
	const lines = expanded ? presentation.sourceLines.slice(0, sourceLimit) : buildBashPreview(presentation.sourceLines, limit);
	if (lines.length === 0) return "";
	if (expanded && presentation.sourceLines.length > sourceLimit) {
		lines.push(`... ${presentation.sourceLines.length - sourceLimit} more command lines`);
	}
	const body = lines.map((line) => theme.fg("accent", line || " ")).join("\n");
	// The command itself, not a status line: keep its color.
	return expanded ? withBranch(body, theme, false, true, false) : withClippedBranch(body, theme, true, false);
}

// Off by default: a running row is its header, blinking dot and line count, like pi-polish.
// `liveToolPreview: true` shows the latest output lines under it (and keeps bash's tail after).
function liveToolPreviewEnabled(): boolean {
	return readSettings().liveToolPreview === true;
}

function liveToolPreviewLimit(): number {
	const value = readSettings().liveToolPreviewLines;
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 5;
}

function diffCollapsedLimit(): number {
	const value = readSettings().diffCollapsedLines;
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 24;
}

function collapsedPreviewCount(expanded: boolean, fallback: number): number {
	return expanded ? expandedPreviewLimit() : fallback;
}

function buildPreviewText(
	lines: string[],
	expanded: boolean,
	theme: Theme,
	fallbackCollapsed = 8,
	totalLineCount = lines.length,
	styleLine?: (line: string) => string,
): string {
	if (lines.length === 0 && totalLineCount === 0) return theme.fg("muted", "(no output)");
	const maxLines = collapsedPreviewCount(expanded, fallbackCollapsed);
	// Only style/join the lines we will actually display. Callers used to map
	// theme.fg over the entire output array first, which scaled with full tool
	// output even when only 8–10 lines were shown.
	const limit = Math.min(lines.length, maxLines);
	let text = "";
	for (let i = 0; i < limit; i++) {
		const line = styleLine ? styleLine(lines[i]) : lines[i];
		text += i === 0 ? line : `\n${line}`;
	}
	const remaining = Math.max(0, totalLineCount - limit);
	if (remaining > 0) {
		text += `${text ? "\n" : ""}${theme.fg("muted", `... (${remaining} more lines${inlineDetailHint(expanded, true)})`)}`;
	}
	if (expanded && totalLineCount > maxLines) {
		text += `\n${theme.fg("warning", `(display capped at ${maxLines} lines${deepExpandHint()})`)}`;
	}
	return text;
}

// ---------------------------------------------------------------------------
// terminalTheme: pi follows the terminal's own palette (Ghostty, Rex, ...).
// ---------------------------------------------------------------------------

/** On by default; `terminalTheme: false` (or `/theme terminal off`) turns it off. */
function terminalThemeEnabled(): boolean {
	return readSettings().terminalTheme !== false;
}

/** `pi --use-theme <name>` picks the theme for this run. */
function themeChosenOnCommandLine(): boolean {
	return process.argv.some((arg) => arg === "--use-theme" || arg.startsWith("--use-theme="));
}

/** Pi's saved `theme` setting (may be a "light/dark" pair), from the cached settings store. */
function readPiThemeSetting(): string | undefined {
	const theme = (readSettings() as { theme?: unknown }).theme;
	return typeof theme === "string" && theme ? theme : undefined;
}

/**
 * Switch pi to its terminal-palette theme and keep it in sync. Returns false if unavailable.
 * `reportUnavailable` is off for the default-on startup path, so older pi versions stay quiet.
 */
function applyTerminalTheme(ctx: any, options: { announce: boolean; reportUnavailable: boolean }): boolean {
	if (!ctx?.hasUI) return false;
	if (!systemThemeAvailable(ctx.ui)) {
		if (options.reportUnavailable) {
			ctx.ui.notify("Terminal colors need pi's built-in `system` theme (pi 1.4 or newer).", "error");
		}
		return false;
	}
	const current = activeThemeName(ctx.ui);
	if (current !== SYSTEM_THEME_NAME) {
		// Remember what to go back to; a "light/dark" pair is kept as the pair.
		const previous = readPiThemeSetting() ?? current;
		if (previous && previous !== SYSTEM_THEME_NAME) writeSettingsKey("terminalThemePrevious", previous);
		const result = ctx.ui.setTheme(SYSTEM_THEME_NAME);
		if (!result?.success) {
			ctx.ui.notify(`Could not switch to the terminal theme: ${result?.error ?? "unknown error"}`, "error");
			return false;
		}
		if (options.announce) {
			// Pi renders a resumed session's transcript right after session_start; post the
			// notice on the next tick so it lands below that history instead of above it.
			const message = `Theme follows the terminal's colors (was "${previous ?? current}"). /theme terminal off switches back and keeps it.`;
			unrefTimer(setTimeout(() => {
				try {
					ctx.ui.notify(message, "info");
				} catch { /* session replaced in the meantime */ }
			}, 0));
		}
	}
	startFocusResync(ctx.ui, terminalThemeEnabled);
	return true;
}

/** Turn terminalTheme off and restore the theme that was active before it. */
function restorePreviousTheme(ctx: any): string | undefined {
	const previous = readSettings().terminalThemePrevious;
	writeSettingsKey("terminalThemePrevious", undefined);
	if (!ctx?.hasUI || !previous || activeThemeName(ctx.ui) !== SYSTEM_THEME_NAME) return undefined;
	let name = previous;
	if (previous.includes("/")) {
		// ctx.ui.setTheme takes one theme name; pick the pair member for the current appearance.
		const [light, dark] = previous.split("/");
		name = themeAppearance(ctx.ui.theme) === "light" ? light : dark;
	}
	const result = ctx.ui.setTheme(name);
	return result?.success ? name : undefined;
}

let codeToAnsiLoader: Promise<any> | null = null;

async function codeToAnsiLazy(
	code: string,
	language: BundledLanguage,
	theme: BundledTheme | ShikiThemeRegistration,
): Promise<string> {
	if (!codeToAnsiLoader) {
		codeToAnsiLoader = import("@shikijs/cli").then(
			(mod) => mod.codeToANSI,
			(err) => {
				codeToAnsiLoader = null;
				throw err;
			},
		);
	}
	const codeToAnsi = await codeToAnsiLoader;
	return codeToAnsi(code, language, theme);
}

const D_BOLD = "\x1b[1m";
const D_DIM = "\x1b[2m";
// Branch connectors (├ └ │) and outline chrome (user box, code fences, thinking rule) are neutral
// marks drawn at a fixed contrast against the terminal background: the background blended toward
// the terminal's text color until it reaches 2:1 for connectors (rgb 72 on a #161616 terminal) and
// 5.1:1 for outlines (rgb ~136). That keeps connectors faint but visible on dark, light, and tinted
// themes alike, with nothing to configure. When pi does not report the terminal's colors (pi < 1.4),
// the same contrasts are taken against plain black or white, per the theme's appearance.
type ChromeKind = "branch" | "outline";
const CHROME_CONTRAST: Record<ChromeKind, number> = { branch: 2.0, outline: 5.1 };
const DARK_FALLBACK_GRAY: Record<ChromeKind, number> = { branch: 72, outline: 136 };
const WHITE_RGB = { r: 255, g: 255, b: 255 };
const BLACK_RGB = { r: 0, g: 0, b: 0 };

function toolBranchRgbAnsi(gray: number): string {
	const g = Math.max(0, Math.min(255, Math.round(gray)));
	return `\x1b[38;2;${g};${g};${g}m`;
}

// Connectors resolve their color on every rendered row, so keep the solved blends.
const _chromeAnsiCache = new Map<string, string>();

/** Chrome color for `kind` on the current terminal background. */
function chromeAnsi(theme: any, kind: ChromeKind): string {
	const defaults = theme ? terminalDefaultColors(theme) : null;
	const light = !defaults && !!theme && themePalette.isLightThemeBackground(theme);
	const mode = typeof theme?.getColorMode === "function" ? theme.getColorMode() : "truecolor";
	const key = defaults
		? `${kind}|${rgbToHex(defaults.background)}|${rgbToHex(defaults.foreground)}|${mode}`
		: `${kind}|${light ? "light" : "dark"}|${mode}`;
	let ansi = _chromeAnsiCache.get(key);
	if (!ansi) {
		const contrast = CHROME_CONTRAST[kind];
		const gray = DARK_FALLBACK_GRAY[kind];
		const rgb = defaults
			? blendForContrast(defaults.background, defaults.foreground, contrast)
			: light
				? blendForContrast(WHITE_RGB, BLACK_RGB, contrast)
				: { r: gray, g: gray, b: gray };
		if (_chromeAnsiCache.size > 32) _chromeAnsiCache.clear();
		ansi = rgbFgAnsi(theme, rgb);
		_chromeAnsiCache.set(key, ansi);
	}
	return ansi;
}

function toolBranchRenderCacheKey(): string {
	// The escape itself, not stripAnsi(TOOL_RULE) (which is always ""), so a new color is a new key.
	return TOOL_RULE;
}

let _toolBranchVisualEpoch = 0;

function bumpToolBranchVisualEpoch(): void {
	_toolBranchVisualEpoch++;
}

/** Last theme seen, for call sites that draw connectors without a theme at hand. */
let _toolBranchThemeHint: any;

/** ├ └ │ color for the current terminal background (resolved on every use, not a stale global). */
function currentToolBranchAnsi(theme?: any): string {
	return chromeAnsi(theme ?? _toolBranchThemeHint, "branch");
}

/** User box, code fences, thinking/thought: the outline chrome color (stronger than connectors). */
function syncOutlineChromeFromBranch(theme?: any): void {
	const outline = chromeAnsi(theme ?? _toolBranchThemeHint, "outline");
	const prevBorder = BORDER_COLOR;
	BORDER_COLOR = outline;
	WORKED_LINE_FG = outline;
	CODE_BLOCK_LANG_FG = outline;
	if (outline !== prevBorder) bumpToolBranchVisualEpoch();
}

function applyToolBranchColor(theme?: any): void {
	if (theme) _toolBranchThemeHint = theme;
	const prev = TOOL_RULE;
	TOOL_RULE = currentToolBranchAnsi(theme);
	if (TOOL_RULE !== prev) bumpToolBranchVisualEpoch();
	syncOutlineChromeFromBranch(theme);
}

/** Strip baked ├/└/│ prefixes (short or long arm) so branch color can be reapplied. */
function stripBranchMarkupLine(line: string): string {
	let plain = stripAnsi(line);
	plain = plain.replace(/^\s*[├└]─?\s*/, "");
	plain = plain.replace(/^\s*│\s{0,2}/, "");
	return plain;
}

function stripBranchMarkupBlock(text: string): string {
	return text
		.split("\n")
		.map((line) => (stripAnsi(line).trim() ? stripBranchMarkupLine(line) : line))
		.join("\n");
}

function liveBranchDisplay(state: Record<string, unknown> | undefined, theme: Theme): string | undefined {
	if (!state || typeof state !== "object") return undefined;
	const body = state._ptBody;
	if (typeof body === "string" && body.trim() && !body.includes("(rendering")) {
		return withBranch(body, theme, false, true);
	}
	const display = state._ptDisplay;
	if (typeof display === "string" && display.trim()) {
		return withBranch(stripBranchMarkupBlock(display), theme, false, true);
	}
	return undefined;
}

function refreshToolBranchDisplaysInState(state: Record<string, unknown> | undefined, theme: Theme): void {
	if (!state || typeof state !== "object") return;
	const body = state._ptBody;
	if (typeof body === "string" && body.trim() && !body.includes("(rendering")) {
		state._ptDisplay = withBranch(body, theme, false, true);
		return;
	}
	const display = state._ptDisplay;
	if (typeof display === "string" && display.trim()) {
		const stripped = stripBranchMarkupBlock(display);
		state._ptDisplay = withBranch(stripped, theme, false, true);
	}
}

function refreshAllToolBranchVisuals(ctx: any): void {
	invalidateSettings();
	syncToolBackgroundMode();
	themePalette.invalidateThemePaletteCache();
	applyToolBackgroundMode(ctx?.ui?.theme);
	applyToolBranchColor(ctx?.ui?.theme);
	bumpToolBranchVisualEpoch(); // always bust ToolText + container caches
	// Tool rows recompute branch markup on next render (liveBranchDisplay + cache bust).
	if (ctx?.hasUI) {
		try {
			ctx.ui.setToolsExpanded(ctx.ui.getToolsExpanded());
			ctx.ui.invalidate?.();
			ctx.ui.requestRender?.();
		} catch { /* noop */ }
	}
}

/** Re-derive borders, branches, diffs, and spinner keys from the active pi theme (no cross-extension deps). */
function rebindUiChromeToTheme(ctx: any): void {
	if (!ctx?.hasUI) return;
	invalidateSettings();
	syncToolBackgroundMode();
	const theme = ctx.ui?.theme;
	themePalette.invalidateThemePaletteCache();
	clearHighlightCache();
	themePalette.applyDiffPalette();
	bustSpinnerSettingsCache();
	applyToolBackgroundMode(theme);
	themePalette.applyThemePaletteIfNeeded(theme);
	syncDiffShikiTheme(theme);
	if (themeAdaptiveEnabled() && theme?.getFgAnsi && !themePalette.hasExplicitBgConfig) {
		themePalette.autoDeriveBgFromTheme(theme);
		themePalette.setAutoDerivePending(false);
	}
	bumpToolBranchVisualEpoch();
	refreshAllToolBranchVisuals(ctx);
}

function scheduleDeferredChromeRebind(ctx: any, delayMs = 0): void {
	const timer = setTimeout(() => {
		try {
			rebindUiChromeToTheme(ctx);
		} catch { /* noop */ }
	}, delayMs);
	unrefTimer(timer);
}

let TOOL_RULE = toolBranchRgbAnsi(DARK_FALLBACK_GRAY.branch);

function syncDiffShikiTheme(theme: any): void {
	if (themePalette.hasExplicitShikiTheme()) return;
	themePalette.setDiffOnLightBackground(theme);
}

function diffThemeName(theme: BundledTheme | ShikiThemeRegistration): string {
	return typeof theme === "string" ? theme : theme.name;
}

configureDiffRendering({
	getDiff: () => Diff as unknown as import("./terminal/diff-rendering/types.ts").DiffApi,
	getSettings: () => readSettings(),
	getPalette: () => ({
		reset: themePalette.dReset, bold: D_BOLD, dim: D_DIM,
		bgAdd: themePalette.bgAdd, bgDel: themePalette.bgDel, bgAddWord: themePalette.bgAddWord, bgDelWord: themePalette.bgDelWord,
		bgGutterAdd: themePalette.bgGutterAdd, bgGutterDel: themePalette.bgGutterDel, bgEmpty: themePalette.bgEmpty, bgBase: themePalette.bgBase,
		fgAdd: themePalette.fgAdd, fgDel: themePalette.fgDel, fgDim: themePalette.fgDim, fgLineNumber: themePalette.fgLineNumber, fgRule: themePalette.fgRule,
		fgStripe: themePalette.fgStripe, divider: themePalette.divider, fgSafeMuted: themePalette.fgSafeMuted, defaultColors: themePalette.defaultColors,
	}),
	getShikiTheme: () => themePalette.diffTheme,
	hasExplicitShikiTheme: () => themePalette.hasExplicitShikiTheme(),
	getThemeName: (theme) => diffThemeName(theme as BundledTheme | ShikiThemeRegistration),
	highlightCode: (code, language) => highlightCode(code, language),
	codeToAnsi: (code, language, theme) => codeToAnsiLazy(code, language, theme as BundledTheme | ShikiThemeRegistration),
	normalizeShikiContrast: (ansi) => themePalette.normalizeShikiContrast(ansi),
	keyHint: (binding, description) => keyHint(binding as any, description),
	visibleWidth: (text) => visibleWidth(text),
	truncateToWidth: (text, width, ellipsis) => truncateToWidth(text, width, ellipsis),
	getBranchIndent: () => BRANCH_INDENT,
});

function getEditOperations(input: any): Array<{ oldText: string; newText: string }> {
	if (Array.isArray(input?.edits)) {
		return input.edits
			.map((edit: any) => ({
				oldText: typeof edit?.oldText === "string" ? edit.oldText : typeof edit?.old_text === "string" ? edit.old_text : "",
				newText: typeof edit?.newText === "string" ? edit.newText : typeof edit?.new_text === "string" ? edit.new_text : "",
			}))
			.filter((edit: { oldText: string; newText: string }) => edit.oldText && edit.oldText !== edit.newText);
	}
	const oldText = typeof input?.oldText === "string" ? input.oldText : typeof input?.old_text === "string" ? input.old_text : "";
	const newText = typeof input?.newText === "string" ? input.newText : typeof input?.new_text === "string" ? input.new_text : "";
	return oldText && oldText !== newText ? [{ oldText, newText }] : [];
}

function summarizeEditOperations(operations: Array<{ oldText: string; newText: string }>) {
	const diffs = operations.map((edit) => parseDiff(edit.oldText, edit.newText));
	const totalAdded = diffs.reduce((sum, diff) => sum + diff.added, 0);
	const totalRemoved = diffs.reduce((sum, diff) => sum + diff.removed, 0);
	const totalLines = diffs.reduce((sum, diff) => sum + diff.lines.length, 0);
	const totalHunks = diffs.reduce((sum, diff) => sum + diff.lines.filter((l) => l.type === "sep").length + (diff.lines.length ? 1 : 0), 0);
	return { diffs, totalAdded, totalRemoved, totalLines, totalHunks, summary: summarizeDiff(totalAdded, totalRemoved) };
}

type EditOperationSummary = ReturnType<typeof summarizeEditOperations>;

function getCachedEditOperationSummary(ctx: any, key: string, operations: Array<{ oldText: string; newText: string }>): EditOperationSummary {
	if (ctx.state?._editSummaryKey === key && ctx.state._editSummary) {
		return ctx.state._editSummary as EditOperationSummary;
	}
	const summary = summarizeEditOperations(operations);
	if (ctx.state) {
		ctx.state._editSummaryKey = key;
		ctx.state._editSummary = summary;
	}
	return summary;
}

function stripThinkingPresentationArtifacts(text: string): string {
	if (!ANSI_PRESENT_RE.test(text) && !/^\s*thinking:\s*/i.test(text)) return text;
	let current = ANSI_PRESENT_RE.test(text) ? text.replace(ANSI_RE, "") : text;
	while (true) {
		const next = current.replace(/^(?:thinking:\s*)+/i, "").trimStart();
		if (next === current) return current;
		current = next;
	}
}

function getMode<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const toolCallRendererDependencies: ToolCallRendererDependencies = {
	getStringArg,
	getStringArrayArg,
	summarizeText,
	summarizeUnknownToolArgs,
	shortPath,
	syncToolCallStatus,
	stableCallSummary,
	toolHeader,
	toolStatusDot,
	liveLineCountTrailing,
	makeText,
};

const toolResultRendererDependencies: ToolResultRendererDependencies = {
	makeText,
	runningPreviewBlock,
	clearBlinkTimer,
	setToolStatus,
	readSettings,
	buildPreviewText,
	previewLimit,
	withBranch,
	toolOutputDetailHint,
	getTextContent,
	renderAgentToolResult,
	getCapabilities,
	getImageDimensions: (data, mimeType) => getImageDimensions(data, mimeType),
	imageFallback: (mimeType, dimensions, filename) => imageFallback(mimeType, dimensions as any, filename),
	getStringArg,
	shortPath,
};

let applyPatchRenderer: ApplyPatchRenderer;

function getTextContent(result: any): string {
	if (!Array.isArray(result?.content)) return "";
	return result.content
		.filter((block: any) => block?.type === "text" && typeof block.text === "string")
		.map((block: any) => block.text)
		.join("\n");
}

function collectNonEmptyLines(text: string, tailLimit?: number): { lines: string[]; total: number } {
	const keepTail = typeof tailLimit === "number" && Number.isFinite(tailLimit);
	const limit = keepTail ? Math.max(0, Math.floor(tailLimit)) : 0;
	const lines: string[] = [];
	let total = 0;
	let start = 0;
	while (start <= text.length) {
		const newline = text.indexOf("\n", start);
		const end = newline === -1 ? text.length : newline;
		const line = text.slice(start, end);
		if (line.trim().length > 0) {
			total++;
			if (!keepTail) {
				lines.push(line);
			} else if (limit > 0) {
				if (lines.length === limit) lines.shift();
				lines.push(line);
			}
		}
		if (newline === -1) break;
		start = newline + 1;
	}
	return { lines, total };
}

function lineCountLabel(count: number): string {
	return `${count} line${count === 1 ? "" : "s"}`;
}

function runningPreviewBlock(
	result: any,
	_statusText: string,
	expanded: boolean,
	theme: Theme,
	ctx: any,
	options: { lines?: string[]; totalLineCount?: number; styleLine?: (line: string) => string; tail?: boolean } = {},
): string {
	// Keep the header status dot blinking while partial output streams. Call/result
	// renderers share rendererState, so setupBlinkTimer here re-arms the same key
	// the call header uses — but only when this tool actually started executing.
	syncToolCallStatus(ctx);
	if (ctx?.state?._toolStatus === "pending") setupBlinkTimer(ctx);
	else clearBlinkTimer(ctx);

	const limit = liveToolPreviewLimit();
	let lines: string[];
	let totalLineCount: number;
	if (options.lines) {
		lines = options.lines;
		totalLineCount = options.totalLineCount ?? lines.length;
	} else {
		// Single-pass collect; when collapsed only keep the preview window.
		const raw = getTextContent(result).replace(/\r\n/g, "\n").trimEnd();
		const collected = collectNonEmptyLines(raw, expanded ? undefined : limit);
		lines = collected.lines;
		totalLineCount = collected.total;
	}
	// Line count lives on the tool heading (via liveLineCountTrailing); keep it in
	// renderer state so the next renderCall pass can pick it up.
	if (ctx?.state) ctx.state._liveLineCount = totalLineCount;

	if (!liveToolPreviewEnabled() || limit <= 0 || totalLineCount === 0) {
		// No status row — the blinking ● on the header is the only running indicator.
		return "";
	}

	const styleLine = options.styleLine ?? ((line: string) => theme.fg("dim", line || " "));
	// Prefer pre-collected tail lines; otherwise only take what the preview needs.
	const previewSource = options.tail && !expanded
		? (lines.length > limit ? lines.slice(-limit) : lines)
		: lines;
	// For tail previews the "earlier lines" prefix owns the remaining count — pass
	// previewSource.length so buildPreviewText doesn't also append "more lines".
	const previewTotal = options.tail && !expanded ? previewSource.length : totalLineCount;
	let preview = buildPreviewText(previewSource, expanded, theme, limit, previewTotal, styleLine);
	if (options.tail && !expanded && totalLineCount > previewSource.length) {
		preview = `${theme.fg("muted", `... (${totalLineCount - previewSource.length} earlier lines${inlineDetailHint(expanded, true)})`)}\n${preview}`;
	}
	return withBranch(preview, theme);
}

function buildPersistentBashPreview(lines: string[], theme: Theme): string {
	const limit = liveToolPreviewLimit();
	if (!liveToolPreviewEnabled() || limit <= 0 || lines.length === 0) return "";
	const start = Math.max(0, lines.length - limit);
	let preview = "";
	for (let i = start; i < lines.length; i++) {
		const styled = theme.fg("dim", lines[i]);
		preview += i === start ? styled : `\n${styled}`;
	}
	const earlier = start;
	if (earlier > 0) {
		preview = `${theme.fg("muted", `... (${earlier} earlier lines)`)}\n${preview}`;
	}
	return preview;
}

function getStringArg(args: any, ...keys: string[]): string {
	for (const key of keys) {
		const value = args?.[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return "";
}

function getStringArrayArg(args: any, ...keys: string[]): string[] {
	for (const key of keys) {
		const value = args?.[key];
		if (!Array.isArray(value)) continue;
		const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
		if (items.length > 0) return items;
	}
	return [];
}


// ===========================================================================
// Bash commands that only change files (sed -i, heredocs, ...), drawn as edit/write rows
// ===========================================================================

interface BashFileEditRecord {
	/** Path as written in the command. */
	path: string;
	created: boolean;
	diff: ParsedDiff;
	language?: BundledLanguage;
}

async function collectBashFileEdits(cwd: string, edit: BashFileEdit, before: Map<string, string | null | undefined>): Promise<BashFileEditRecord[]> {
	const results = await Promise.all(
		edit.paths.map(async (path): Promise<BashFileEditRecord | null> => {
			const previous = before.get(path);
			if (previous === undefined) return null;
			const full = resolveBashEditPath(cwd, edit, path);
			const current = await readBashEditSnapshot(full);
			if (typeof current !== "string" || previous === current) return null;
			return { path, created: previous === null, diff: parseDiff(previous ?? "", current), language: lang(full) };
		}),
	);
	return results.filter((r): r is BashFileEditRecord => r !== null);
}

function bashFileEditHeader(edit: BashFileEdit, records: BashFileEditRecord[] | undefined, theme: Theme, cwd: string, sp: (path: string) => string, prefix: string, trailing: string): string {
	themePalette.applyThemePaletteIfNeeded(theme);
	const created = edit.kind === "write" && !!records?.length && records.every((record) => record.created);
	const label = edit.kind === "edit" ? "Edit" : created ? "Create" : "Write";
	const first = sp(resolveBashEditPath(cwd, edit, edit.paths[0]));
	const more = edit.paths.length > 1 ? ` ${theme.fg("muted", `(+${edit.paths.length - 1} files)`)}` : "";
	return `${prefix}${theme.fg("toolTitle", theme.bold(label))} ${theme.fg("muted", `(${edit.via})`)} ${WRAP_MARK}${theme.fg("accent", first)}${more}${trailing}`;
}

/** The diff block for one changed file, rendered asynchronously like write's; "" until known. */
function bashFileEditDiffBlock(record: BashFileEditRecord, index: number, theme: Theme, ctx: any): string {
	const diff = record.diff;
	const previewLines = ctx.expanded ? MAX_RENDER_LINES : diffCollapsedLimit();
	const hunks = diff.lines.filter((line) => line.type === "sep").length + (diff.lines.length ? 1 : 0);
	const width = contextDiffWidth(ctx);
	const mode = record.created ? "new file" : shouldUseSplit(diff, width, previewLines) ? "split" : "unified";
	const summary = diffSummaryWithMeta(diff.added, diff.removed, hunks, mode);
	const key = `bfe:${index}:${record.path}:${width}:${diff.added}:${diff.removed}:${diff.lines.length}:${ctx.expanded ? 1 : 0}:${_toolBranchVisualEpoch}`;
	const keys = (ctx.state._bfeKeys ??= []) as string[];
	const blocks = (ctx.state._bfeBlocks ??= []) as string[];
	if (keys[index] !== key) {
		keys[index] = key;
		blocks[index] = `${summary}\n${theme.fg("muted", "rendering diff...")}`;
		const dc = themePalette.resolveDiffColors(theme);
		const render = mode === "split" ? renderSplit(diff, record.language, previewLines, dc, width) : renderUnified(diff, record.language, previewLines, dc, width);
		render
			.then((rendered) => {
				if (keys[index] !== key) return;
				blocks[index] = `${summary}\n${rendered}`;
				safeInvalidate(ctx);
			})
			.catch(() => {
				if (keys[index] !== key) return;
				blocks[index] = summary;
				safeInvalidate(ctx);
			});
	}
	return blocks[index];
}

/** Result body for a bash file edit, or undefined to fall back to the ordinary bash rendering. */
function renderBashFileEditResult(edit: BashFileEdit, records: BashFileEditRecord[] | undefined, theme: Theme, ctx: any, sp: (path: string) => string): Text | undefined {
	if (records === undefined) {
		// Rows from before diffs were recorded: a heredoc or echo still says what it wrote.
		if (edit.content === undefined || edit.kind !== "write") return undefined;
		const diff = getCachedParsedDiff(ctx, `bfe-content:${hashText(edit.content)}`, "", edit.content);
		records = [{ path: edit.paths[0], created: true, diff, language: lang(edit.paths[0]) }];
	}
	if (records.length === 0) return makeText(ctx.lastComponent, withBranch(theme.fg("muted", "✓ no changes"), theme));
	if (!diffWidthReady(ctx)) {
		return makeResponsiveDiffText(ctx, ctx.lastComponent, withFinalBranchBlock(theme.fg("muted", "rendering diff..."), theme));
	}
	const blocks = records.map((record, index) => {
		const block = bashFileEditDiffBlock(record, index, theme, ctx);
		return records!.length > 1 ? `${theme.fg("accent", sp(resolveBashEditPath(ctx.cwd ?? process.cwd(), edit, record.path)))}\n${block}` : block;
	});
	// With several files the first line is a path, not a status line.
	return makeResponsiveDiffText(ctx, ctx.lastComponent, withFinalBranchBlock(blocks.join("\n"), theme, false, records.length === 1));
}

// ===========================================================================
// Extension
// ===========================================================================

export default async function (pi: ExtensionAPI) {
	if (readMergedSettings().todoEnabled === true) {
		const { default: todoExt } = await import("../packages/rpiv-todo/index.ts");
		todoExt(pi);
	}
	const editPreview = createEditPreview({
		readFile: readFileAsync,
		resolvePath: resolve,
		getDiff: () => Diff,
		parseDiff,
		summarizeDiff,
		MAX_PREVIEW_LINES,
		MAX_RENDER_LINES,
		DIFF_RENDER_CONCURRENCY,
		contextDiffWidth,
		resolveDiffColors: (theme) => themePalette.resolveDiffColors(theme),
		renderSplit,
		mapWithConcurrency,
		formatLineMeta,
		withBranch,
		toolOutputDetailHint,
		safeInvalidate,
	});
	if (claudeUiEnabled()) {
		applyPatchRenderer = createApplyPatchRenderer({
			normalizeToLf: editPreview.normalizeToLf,
			parseDiff,
			summarizeDiff,
			lang,
			summarizeOpenAiToolCall,
			toolCallRendererDependencies,
			getStringArg,
			getTextContent,
			hashText,
			shortPath,
			syncToolCallStatus,
			stableCallSummary,
			toolHeader,
			toolStatusDot,
			liveLineCountTrailing,
			makeText,
			runningPreviewBlock,
			withBranch,
			clearBlinkTimer,
			setToolStatus,
			MAX_RENDER_LINES,
			MAX_PREVIEW_LINES,
			DIFF_RENDER_CONCURRENCY,
			diffSummaryWithMeta,
			diffWidthReady,
			contextDiffWidth,
			getToolBranchVisualEpoch: () => _toolBranchVisualEpoch,
			resolveDiffColors: (theme) => themePalette.resolveDiffColors(theme),
			renderSplit,
			mapWithConcurrency,
			makeResponsiveDiffText,
			toolOutputDetailHint,
			safeInvalidate,
			getBorderColor: () => BORDER_COLOR,
			getTransparentReset: () => TRANSPARENT_RESET,
		});
		const toolComponentPatches = createToolExecutionComponentPatches({
			prototype: ToolExecutionComponent.prototype,
			componentParentKey: COMPONENT_PARENT,
			clearToolRenderCache,
			brightenRenderedLine,
			stripAnsi,
			isPrimaryClick,
			claimClickHover,
			requestComponentRender,
			toggleExpandedComponent,
			toggleGroupedTools,
			syncToolCallStatus,
			getTextContent,
			collectNonEmptyLines,
			applyPatchRenderer: () => applyPatchRenderer,
			shouldUseGenericToolRenderer,
			renderGenericToolCall,
			toolCallRendererDependencies,
			renderGenericToolResult,
			toolResultRendererDependencies,
			shortPath,
			sanitizeToolResultForDisplay,
			stripTransientMagicContextTags,
		});
		patchTerminalWriteTagScrubber();
		patchToolExecutionBackgroundSync();
		toolComponentPatches.patchToolRenderCacheInvalidation();
		patchReadImageExpansion();
		patchFullscreenHoverExit();
		patchFullscreenCopySkipsChrome();
		patchScrollViewReveal();
		toolComponentPatches.patchToolFullscreenMouse();
		patchContainerParentTracking();
		patchGlobalToolBorders();
		patchCustomMessageRender();
		patchUserMessageRender();
		patchAssistantMessages();
		patchAssistantFullscreenMouse();
		toolComponentPatches.patchToolExecutionRenderers();
		patchBashFileEditGrouping();
		themePalette.applyDiffPalette();
		thinkingLabels.register(pi);
		syncExtraToolDetailMode();
	}

	const toggleExtraToolDetail = (ctx: any): void => {
		setExtraToolDetailMode(!extraToolOutputExpanded);
		if (ctx.hasUI) {
			ctx.ui.setToolsExpanded(ctx.ui.getToolsExpanded());
			ctx.ui.notify(`Extra tool detail: ${extraToolOutputExpanded ? "on" : "off"}`, "info");
		}
	};

	pi.registerShortcut("ctrl+shift+o", {
		description: "Toggle extra tool output detail",
		handler: async (ctx) => {
			toggleExtraToolDetail(ctx);
		},
	});

	const toolsDependencies: ToolsCommandDependencies = {
		readSettings,
		readMergedSettings,
		writeSettingsKey,
		rawKeyHint,
		headerDetailsEnabled,
		setHeaderDetailsOverride: (value) => { _headerDetailsOverride = value; },
		getKnownLoadedResourcesContainer: () => _knownLoadedResourcesContainer,
		toolGroupingEnabled,
		setToolGroupingEnabled,
		ungroupActiveToolGroups,
		toolStatusAnimation,
		handleToolActivityCommand,
		getThinkingMode,
		thinkingLabelEnabled,
		applyThinkingModeToChats: conversationThinking.applyThinkingModeToChats,
		requestChatRender: conversationThinking.requestChatRender,
		getBashIntentMode: () => bashIntentMode,
		normalizeBashIntentMode,
		getExtraToolOutputExpanded: () => extraToolOutputExpanded,
		setExtraToolDetailMode,
		claudeUiEnabled,
		getToolBackgroundMode: () => toolBackgroundMode,
		setToolBackgroundMode: (value) => { toolBackgroundMode = value; },
		setToolBackgroundOverride: (value) => { toolBackgroundOverride = value; },
		applyToolBackgroundMode,
	};

	registerToolsCommand(pi, toolsDependencies);

	const themeDependencies: ThemeCommandDependencies = {
		readSettings,
		writeSettingsKey,
		activeThemeName,
		terminalThemeEnabled,
		SYSTEM_THEME_NAME,
		applyTerminalTheme,
		restorePreviousTheme,
		requestTerminalColorScheme,
		themeAdaptiveEnabled,
		bustSpinnerSettingsCache,
		invalidateThemePaletteCache: themePalette.invalidateThemePaletteCache,
		setAutoDerivePending: (value) => { themePalette.setAutoDerivePending(value); },
		applyThemePaletteIfNeeded: themePalette.applyThemePaletteIfNeeded,
		resetThemePalette: themePalette.resetThemePalette,
		chromeAnsi,
		safeFgAnsi,
	};

	registerThemeCommand(pi, themeDependencies);

	const spinnerDependencies: SpinnerCommandDependencies = {
		readSettings,
		writeSettingsKey,
		safeFgAnsi,
		bustSpinnerSettingsCache,
	};

	registerSpinnerCommand(pi, spinnerDependencies);

	let unsubscribeExtraToolDetailInput: (() => void) | undefined;

	pi.on("session_start", async (event, ctx) => {
		bashPresentation.clearRtkRewriteState();
		if (!ctx.hasUI) return;

		// When running inside tmux, ensure modifyOtherKeys mode 2 is requested so extended
		// keys (Ctrl+Shift+O, Shift+Alt+Enter, Shift+Enter) are forwarded without being stripped.
		if (Boolean(process.env.TMUX || process.env.TERM?.startsWith("tmux") || process.env.TERM?.startsWith("screen"))) {
			try {
				if (process.stdout.isTTY) process.stdout.write("\x1b[>4;2m");
			} catch {}
		}

		unsubscribeExtraToolDetailInput?.();
		unsubscribeExtraToolDetailInput = undefined;
		if (typeof ctx.ui?.onTerminalInput === "function") {
			unsubscribeExtraToolDetailInput = ctx.ui.onTerminalInput((data: string) => {
				// Handle Ctrl+Shift+O across tmux and legacy VT escape formats
				if (
					data === "\x1b[111;6u" ||
					data === "\x1b[111;6:1u" ||
					data === "\x1b[79;6u" ||
					data === "\x1b[79;6:1u" ||
					data === "\x1b[27;6;111~" ||
					data === "\x1b[27;6;79~" ||
					data === "\x1b\x0f"
				) {
					toggleExtraToolDetail(ctx);
					return { consume: true };
				}
				return undefined;
			});
		}

		if (claudeUiEnabled()) {
			intentNoticeUi = ctx.ui;
			bashPresentation.patchUiNotifications(ctx.ui);
			patchAgentWidget(ctx.ui);
			installPromptMarkerEditor(ctx);
			// terminalTheme (on by default): switch to, and stay on, the theme built from the
			// terminal's palette. `pi --use-theme <name>` still wins for that run.
			if (terminalThemeEnabled() && !(themeChosenOnCommandLine() && activeThemeName(ctx.ui) !== SYSTEM_THEME_NAME)) {
				applyTerminalTheme(ctx, { announce: true, reportUnavailable: readSettings().terminalTheme === true });
			}
			// Session switch (/resume, /new) can leave tool chrome from the previous
			// theme; rebind from ctx.ui.theme (other extensions may setTheme in the
			// same tick — deferred passes pick up the final theme without coupling).
			rebindUiChromeToTheme(ctx);
			scheduleDeferredChromeRebind(ctx, 0);
			const reason = (event as { reason?: string })?.reason;
			if (reason === "resume" || reason === "new" || reason === "fork") {
				scheduleDeferredChromeRebind(ctx, 48);
				// Chat history rebuild can run after session_start; re-sync transparent tool bgs.
				scheduleDeferredChromeRebind(ctx, 120);
			}
		}
		if (
			(event as { reason?: string })?.reason === "startup"
			&& ctx.mode === "tui"
			&& ctx.hasUI
		) {
			const { getStartupStyle, playStartupAnimation } = await import("./terminal/animations/startup-animation.ts");
			if (getStartupStyle() !== "off") {
				await playStartupAnimation(event, ctx);
			}
		}
	});

	pi.on("turn_start", async (_event, ctx) => {
		if (!ctx.hasUI || !claudeUiEnabled()) return;
		bashPresentation.patchUiNotifications(ctx.ui);
		patchAgentWidget(ctx.ui);
		applyToolBackgroundMode(ctx.ui.theme);
		themePalette.applyThemePaletteIfNeeded(ctx.ui.theme);
	});

	// Runs on every streamed token: bail out as soon as the (rare) work is known to be
	// done, and test for non-whitespace with an early-exit regex instead of trimming
	// (copying) the whole growing message text on each delta.
	let bashPreviewsClearedForMessage = false;
	pi.on("message_start", async () => { bashPreviewsClearedForMessage = false; });
	pi.on("message_update", async (event) => {
		if (bashPreviewsClearedForMessage) return;
		const content = (event as any)?.message?.content;
		if (!Array.isArray(content)) return;
		for (const block of content) {
			if (block?.type === "text" && typeof block.text === "string" && /\S/.test(block.text)) {
				bashPreviewsClearedForMessage = true;
				bashPresentation.clearPreservedBashPreviews();
				return;
			}
		}
	});

	pi.on("tool_execution_start", async (event) => {
		bashPresentation.clearPreservedBashPreviews();
		const toolName = (event as any)?.toolName;
		if (toolName !== "bash") return;
		bashPresentation.trackRtkOriginalBashCommand((event as any)?.toolCallId, (event as any)?.args);
	});

	let intentNoticeUi: any;
	const notifyIntentProblem = (message: string): void => {
		try {
			intentNoticeUi?.notify?.(message, "warning");
		} catch { /* session ended */ }
	};
	// Read once per load: "model" changes the bash tool and the model's instructions, which are
	// fixed when the tool registers, so every mode switch applies on the next start or /reload.
	const bashIntentMode: BashIntentMode = normalizeBashIntentMode(readSettings().bashIntent ?? "model");

	if (claudeUiEnabled()) {
		const cwd = process.cwd();
		const sp = (path: string) => shortPath(cwd, path);

		registerReadSearchTools({
			cwd, pi, sp, syncToolCallStatus, stableCallSummary, toolHeader, toolStatusDot, liveLineCountTrailing, makeText, runningPreviewBlock, clearBlinkTimer, setToolStatus, getFirstImageBlock, renderReadImageResult, toolResultRendererDependencies, withBranch, buildPreviewText, previewLimit, toolOutputDetailHint, summarizeText, fileIcon, dirIcon, getFgRule: () => themePalette.fgRule, getDReset: () => themePalette.dReset,
		});
		registerBashTool({
			cwd, pi, bashIntentMode, notifyIntentProblem, collectBashFileEdits, ensureRtkRewriteForContext: bashPresentation.ensureRtkRewriteForContext, renderBashCommandBlock, bashHeaderTrailing, bashFileEditHeader, renderBashFileEditResult, shortPath, syncToolCallStatus, syncBashDuration: bashPresentation.syncBashDuration, stableCallSummary, toolHeader, toolStatusDot, makeText, runningPreviewBlock, withBranch, clearBlinkTimer, setToolStatus, safeInvalidate, unrefTimer, preserveBashPreview: bashPresentation.preserveBashPreview, shouldPreserveBashPreview: bashPresentation.shouldPreserveBashPreview, buildPersistentBashPreview, collectNonEmptyLines, liveToolPreviewEnabled, liveToolPreviewLimit, bashOutputMode, bashCollapsedLimit, buildPreviewText, toolOutputDetailHint, formatRtkRewriteDetails: bashPresentation.formatRtkRewriteDetails, WRAP_MARK, CLIP_MARK,
		});
		registerEditTools({
			cwd, pi, sp, writeExistedBefore: WRITE_EXISTED_BEFORE, editLocalized: EDIT_LOCALIZED, fileExistsForTool, parseDiff, summarizeDiff, lang, lineCount, shouldRevealCallArgs, hasOwnArg, getWriteWasNewFile, stableCallSummary, syncToolCallStatus, toolHeader, toolStatusDot, liveLineCountTrailing, makeText, runningPreviewBlock, withBranch, clearBlinkTimer, setToolStatus, MAX_RENDER_LINES, diffCollapsedLimit, diffSummaryWithMeta, diffWidthReady, contextDiffWidth, shouldUseSplit, getToolBranchVisualEpoch: () => _toolBranchVisualEpoch, resolveDiffColors: themePalette.resolveDiffColors, renderSplit, renderUnified, hashText, getCachedParsedDiff, makeResponsiveDiffText, withFinalBranchBlock, safeInvalidate, getEditOperations, computeLocalizedEditDiffs: editPreview.computeLocalizedEditDiffs, summarizeEditOperations, countDiffHunks, restoreLocalizedEditDiffs: editPreview.restoreLocalizedEditDiffs, formatLineMeta, getCachedEditOperationSummary, liveBranchDisplay, renderEditPreviewBody: editPreview.renderEditPreviewBody, getFirstChangedNewLine: editPreview.getFirstChangedNewLine,
		});

	const wrappedOpenAiTools = new Set<string>();
	const registerOpenAiToolOverrides = (): void => {
		let allTools: unknown[] = [];
		try {
			allTools = typeof (pi as any).getAllTools === "function" ? (pi as any).getAllTools() : [];
		} catch {
			allTools = [];
		}
		for (const tool of allTools) {
			if (!isOpenAiToolCandidate(tool)) continue;
			const record = tool as Record<string, unknown>;
			const name = typeof record.name === "string" ? record.name : "";
			if (!name || wrappedOpenAiTools.has(name)) continue;
			const execute = typeof record.execute === "function" ? (record.execute as any) : null;
			if (!execute) continue;
			const rawLabel = typeof record.label === "string" ? record.label.trim() : "";
			const label = rawLabel && rawLabel !== name && !rawLabel.includes("_") ? rawLabel : humanizeToolName(name);
			const description = typeof record.description === "string" ? record.description : label;
			(pi as any).registerTool({
				name,
				label,
				description,
				parameters: record.parameters,
				prepareArguments: typeof record.prepareArguments === "function" ? record.prepareArguments : undefined,
				async execute(toolCallId: string, params: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
					return await Promise.resolve(execute(toolCallId, params, signal, onUpdate, ctx));
				},
				renderCall(args: any, theme: Theme, ctx: any) {
					if (name === "apply_patch") return applyPatchRenderer.renderApplyPatchCall(args, theme, ctx, sp);
					syncToolCallStatus(ctx);
					ctx.state._openAiPatchFiles = [];
					const summary = stableCallSummary(ctx, "_callSummary", () => summarizeOpenAiToolCall(name, args, theme, sp, toolCallRendererDependencies));
					return makeText(
						ctx.lastComponent,
						toolHeader(label, summary, theme, toolStatusDot(ctx, theme), liveLineCountTrailing(ctx, theme)),
					);
				},
				renderResult(result: any, { expanded, isPartial }: any, theme: Theme, ctx: any) {
					if (name === "apply_patch") return applyPatchRenderer.renderApplyPatchResult(result, isPartial, theme, ctx);
					return renderOpenAiToolResult(name, result, expanded, isPartial, theme, ctx, toolResultRendererDependencies);
				},
			});
			wrappedOpenAiTools.add(name);
		}
	};

	const wrappedMcpTools = new Set<string>();
	const registerMcpToolOverrides = (): void => {
		let allTools: unknown[] = [];
		try {
			allTools = typeof (pi as any).getAllTools === "function" ? (pi as any).getAllTools() : [];
		} catch {
			allTools = [];
		}
		for (const tool of allTools) {
			if (!isMcpToolCandidate(tool)) continue;
			const record = tool as Record<string, unknown>;
			const name = typeof record.name === "string" ? record.name : "";
			if (!name || wrappedMcpTools.has(name)) continue;
			const execute = typeof record.execute === "function" ? (record.execute as any) : null;
			if (!execute) continue;
			const label = typeof record.label === "string" ? record.label : name === "mcp" ? "MCP" : `MCP ${name}`;
			const description = typeof record.description === "string" ? record.description : "MCP tool";
			(pi as any).registerTool({
				name,
				label,
				description,
				parameters: record.parameters,
				prepareArguments: typeof record.prepareArguments === "function" ? record.prepareArguments : undefined,
				async execute(toolCallId: string, params: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
					return await Promise.resolve(execute(toolCallId, params, signal, onUpdate, ctx));
				},
				renderCall(args: any, theme: Theme, ctx: any) {
					return renderGenericToolCall(name, args, theme, ctx, toolCallRendererDependencies);
				},
				renderResult(result: any, { expanded, isPartial }: any, theme: Theme, ctx: any) {
					return renderMcpToolResult(result, expanded, isPartial, theme, ctx, toolResultRendererDependencies);
				},
			});
			wrappedMcpTools.add(name);
		}
	};

	pi.on("session_start", async () => {
		registerOpenAiToolOverrides();
		registerMcpToolOverrides();
	});
	pi.on("before_agent_start", async () => {
		registerOpenAiToolOverrides();
		registerMcpToolOverrides();
	});

	// Streaming activity keeps the blink timer alive. Do NOT clear blink contexts
	// on turn_end — a turn ends when the assistant message finishes, BEFORE its
	// tools run. agent_end / agent_settled are the real "work finished" signals.
	pi.on("turn_start", async () => { markBlinkActivity(); });
	pi.on("message_start", async () => { markBlinkActivity(); });
	pi.on("message_update", async () => { markBlinkActivity(); });
	pi.on("tool_execution_start", async () => { markBlinkActivity(); });
	// Partial tool output is the main long-running signal (bash streams for minutes).
	pi.on("tool_execution_update", async () => { markBlinkActivity(); });
	pi.on("tool_execution_end", async () => { markBlinkActivity(); });
	// agent_end fires when a low-level run finishes (tools for that assistant message
	// are done). thinkingLabels.register clears the live work marker on the same
	// event; defer so we only wipe blink state once the work marker is gone.
	// Do not use agent_settled here — older peer types don't include it, and the
	// live-agent heartbeat already keeps quiet long tools blinking until agent_end.
	pi.on("agent_end", async () => {
		queueMicrotask(() => {
			if (thinkingLabels.isAgentWorkActive()) {
				markBlinkActivity();
				return;
			}
			_clearAllBlinkContexts();
		});
	});
	// Session rebuild (resume/reload/fork) must not leave history partials blinking.
	pi.on("session_start", async () => {
		_clearAllBlinkContexts();
		conversationThinking.pruneChatContainers();
		for (const group of ACTIVE_TOOL_GROUPS) {
			if (!group || group.hasPendingTools?.() === false) {
				ACTIVE_TOOL_GROUPS.delete(group);
			}
		}
	});
	}
	pi.on("session_shutdown", async () => {
		unsubscribeExtraToolDetailInput?.();
		unsubscribeExtraToolDetailInput = undefined;
		_clearAllBlinkContexts();
		bashPresentation.clearAllBashDurationContexts();
		bashPresentation.clearRtkRewriteState();
		WRITE_EXISTED_BEFORE.clear();
		EDIT_LOCALIZED.clear();
		conversationThinking.clearChatContainers();
		ACTIVE_TOOL_GROUPS.clear();
		toolRenderCacheLru.clear();
		messageRenderCacheLru.clear();
		clearHighlightCache();
		themePalette.invalidateThemePaletteCache();
		bumpToolBranchVisualEpoch();
		_headerDetailsOverride = null;
		_knownLoadedResourcesContainer = null;
	});
}

// Test-only escape hatch: this package is a default-export extension and the
// export surface Pi consumes must stay minimal. Regression tests for math
// preprocessing reach these internals through this namespace instead of
// widening the public export (see scripts/math-preprocess.test.ts).
export const __mathPreprocessInternals = {
	buildParagraphSegments,
};

export const __headerToggleInternals = {
	headerDetailsEnabled,
	setHeaderDetailsOverride: (v: boolean | null) => { _headerDetailsOverride = v; },
	isResourceSectionLine,
	isLoadedResourcesContainer,
	handleHeaderCommand,
	initContainerPatches: () => {
		patchContainerParentTracking();
		patchGlobalToolBorders();
	},
	LOADED_RESOURCES_CONTAINER_FLAG,
};

export const __toolStatusAnimationInternals = {
	toolStatusAnimation,
	handleToolActivityCommand,
};
