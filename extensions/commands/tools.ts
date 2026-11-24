export interface ToolsCommandDependencies {
	readSettings: () => any;
	readMergedSettings: () => any;
	writeSettingsKey: (key: string, value: unknown) => void;
	rawKeyHint: (key: string, description: string) => string;
	headerDetailsEnabled: () => boolean;
	setHeaderDetailsOverride: (value: boolean | null) => void;
	getKnownLoadedResourcesContainer: () => any;
	toolGroupingEnabled: () => boolean;
	setToolGroupingEnabled: (enabled: boolean) => void;
	ungroupActiveToolGroups: () => void;
	toolStatusAnimation: () => "blink" | "breathe";
	handleToolActivityCommand: (raw: string | undefined, ctx: any) => void;
	getThinkingMode: () => "live" | "full" | "latest";
	thinkingLabelEnabled: () => boolean;
	applyThinkingModeToChats: () => void;
	requestChatRender: (ctx: any) => void;
	getBashIntentMode: () => any;
	normalizeBashIntentMode: (value: unknown) => any;
	getExtraToolOutputExpanded: () => boolean;
	setExtraToolDetailMode: (enabled: boolean) => void;
	claudeUiEnabled: () => boolean;
	getToolBackgroundMode: () => "default" | "transparent" | "outlines";
	setToolBackgroundMode: (value: "default" | "transparent" | "outlines") => void;
	setToolBackgroundOverride: (value: "default" | "transparent" | "outlines" | null) => void;
	applyToolBackgroundMode: (theme: unknown) => void;
}

import { BASH_INTENT_MODES, type BashIntentMode } from "../bash/intent.ts";

const HEADER_MODES = ["on", "off", "toggle", "status"] as const;
const THINKING_MODES = ["live", "full", "latest"] as const;

export async function handleHeaderCommand(arg: string | undefined, ctx: any, deps: ToolsCommandDependencies): Promise<void> {
	const current = deps.headerDetailsEnabled();
	const raw = (arg || "").trim().toLowerCase();
	if (raw === "status") {
		if (ctx?.hasUI) {
			const settings = deps.readSettings();
			const isDefault = settings.headerDetails === undefined && settings.quietStartup === undefined;
			ctx.ui.notify([
				`Header details: ${current ? "on" : "off"}${isDefault ? " (default)" : ""} (showing [Skills], [Prompts], [Extensions])`,
				"  Use /tools header on|off|toggle to switch",
				"  Pi logo and keybinding hints are preserved when off",
			].join("\n"), "info");
		}
		return;
	}
	let next: boolean;
	if (!raw || raw === "toggle") next = !current;
	else if (raw === "on") next = true;
	else if (raw === "off") next = false;
	else {
		if (ctx?.hasUI) ctx.ui.notify(`Usage: /tools header ${HEADER_MODES.join("|")}`, "error");
		return;
	}
	deps.setHeaderDetailsOverride(next);
	deps.writeSettingsKey("headerDetails", next);
	deps.writeSettingsKey("quietStartup", next ? false : "header");
	if (ctx?.hasUI) {
		const container = deps.getKnownLoadedResourcesContainer();
		if (next && (!container || container.children.length === 0) && typeof ctx.reload === "function") {
			try { await ctx.reload(); } catch { /* ignore */ }
		} else {
			ctx.ui.invalidate?.();
			ctx.ui.requestRender?.();
		}
		ctx.ui.notify(`Header details: ${next ? "on" : "off"}${next ? " — showing [Skills], [Prompts], [Extensions]" : " — hiding [Skills], [Prompts], [Extensions] (logo preserved)"}`, "info");
	}
}

export function registerToolsCommand(pi: any, deps: ToolsCommandDependencies): void {
	const {
		readSettings, readMergedSettings, writeSettingsKey, rawKeyHint,
		headerDetailsEnabled,
		toolGroupingEnabled, setToolGroupingEnabled, ungroupActiveToolGroups,
		toolStatusAnimation, handleToolActivityCommand, getThinkingMode,
		thinkingLabelEnabled, applyThinkingModeToChats, requestChatRender,
		getBashIntentMode, normalizeBashIntentMode, getExtraToolOutputExpanded,
		setExtraToolDetailMode, claudeUiEnabled, getToolBackgroundMode,
		setToolBackgroundMode, setToolBackgroundOverride, applyToolBackgroundMode,
	} = deps;
	// /tools command — control tool chrome, grouping, thinking, and detail level.
	const TOOL_MODES = ["outlines", "transparent", "default"] as const;
	const TOOL_BOOL_MODES = ["on", "off", "toggle", "status"] as const;
	const TOOL_STATUS_ANIMATIONS = ["blink", "breathe"] as const;
	const TOOL_SUBCOMMANDS = [
		...TOOL_MODES,
		"group",
		"activity",
		"detail",
		"thinking",
		"thinking-label",
		"intent",
		"header",
		"startup",
		"claude-ui",
		"todo",
		"status",
	] as const;
	const INTENT_DESCRIPTIONS: Record<string, string> = {
		off: "No labels on bash rows",
		model: "The model writes a short purpose with each bash call (adds a field to the bash tool and a line to its instructions; default)",
		local: "A local model writes the purpose without changing what the model sees (Apple on-device on supported Macs, otherwise a local OpenAI-compatible endpoint)",
		status: "Show the current mode",
	};
	const booleanMode = (raw: string | undefined, current: boolean): boolean | "status" | undefined => {
		const mode = raw || "toggle";
		if (mode === "on") return true;
		if (mode === "off") return false;
		if (mode === "toggle") return !current;
		if (mode === "status") return "status";
		return undefined;
	};
	const notifyToolStatus = (ctx: any): void => {
		if (!ctx.hasUI) return;
		ctx.ui.notify([
			`Tool style: ${getToolBackgroundMode()}`,
			`Tool grouping: ${toolGroupingEnabled() ? "on" : "off"}`,
			`Tool activity: ${toolStatusAnimation()}`,
			`Thinking: ${getThinkingMode()}`,
			`Thinking label: ${thinkingLabelEnabled() ? "on" : "off"}`,
			`Bash labels: ${getBashIntentMode()}`,
			`Extra detail: ${getExtraToolOutputExpanded() ? "on" : "off"} (${rawKeyHint("ctrl+shift+o", "toggle")})`,
			`Header details: ${headerDetailsEnabled() ? "on" : "off"} (/tools header on|off|toggle)`,
			`Startup animation: ${readSettings().startupAnimation ? String(readSettings().startupAnimation === true ? "tetris" : readSettings().startupAnimation) : "off"} (/tools startup on|off|toggle|tetris|matrix|fireworks|wave|retro)`,
			`Claude UI style: ${claudeUiEnabled() ? "on" : "off"} (/tools claude-ui on|off|toggle)`,
			`Todo extension: ${readMergedSettings().todoEnabled === true ? "on" : "off"} (/tools todo on|off|toggle)`,
		].join("\n"), "info");
	};
	pi.registerCommand("tools", {
		description: "Configure tool rows, thinking display, bash labels, and extra output detail",
		getArgumentCompletions(prefix: string) {
			const parts = prefix.trimStart().split(/\s+/);
			const first = parts[0] ?? "";
			if (parts.length <= 1) {
				return TOOL_SUBCOMMANDS
					.filter((m) => m.startsWith(first))
					.map((m) => ({
						value: m,
						label: m,
						description:
							m === "group" ? "Toggle grouped adjacent/concurrent tool rows"
							: m === "activity" ? "Pending tool indicator: smooth breathing or on/off blinking"
							: m === "thinking" ? "Thinking display: live (default), full, or latest"
							: m === "thinking-label" ? "Show a ∴ Thinking: label above expanded thinking"
							: m === "intent" ? "Purpose labels on bash rows: model (default), local, or off"
							: m === "header" ? "Show or hide startup header details ([Skills], [Prompts], [Extensions])"
							: m === "startup" ? "Configure startup animation (on, off, toggle, or style: tetris, matrix, fireworks, wave, retro)"
							: m === "claude-ui" ? "Enable or disable Claude Code UI styling (❯ prompt, spinner, tool chrome)"
							: m === "todo" ? "Enable or disable the todo tool and overlay"
							: m === "detail" ? "Toggle Ctrl+Shift+O extra-detail mode"
							: m === "status" ? "Show tool UI settings"
							: m === "outlines" ? "Horizontal rules around each tool"
							: m === "transparent" ? "No borders or backgrounds (default)"
							: "Pi built-in tool backgrounds",
					}));
			}
			if (first === "header") {
				const second = parts[1] ?? "";
				return HEADER_MODES
					.filter((m) => m.startsWith(second))
					.map((m) => ({
						value: `header ${m}`,
						label: m,
						description: `${m} startup header details ([Skills], [Prompts], [Extensions])`,
					}));
			}
			if (first === "startup") {
				const second = parts[1] ?? "";
				const startupOptions = [
					{ value: "on", desc: "Enable startup animation (default: tetris)" },
					{ value: "off", desc: "Disable startup animation" },
					{ value: "toggle", desc: "Toggle startup animation on/off" },
					{ value: "status", desc: "Show current startup animation setting" },
					{ value: "tetris", desc: "Falling Tetris blocks (default)" },
					{ value: "matrix", desc: "Digital rain reveal" },
					{ value: "fireworks", desc: "Particle burst into logo" },
					{ value: "wave", desc: "Scanline sweep reveal" },
					{ value: "retro", desc: "Glitchy CRT static reveal" },
				];
				return startupOptions
					.filter((o) => o.value.startsWith(second))
					.map((o) => ({
						value: `startup ${o.value}`,
						label: o.value,
						description: o.desc,
					}));
			}
			if (first === "claude-ui") {
				const second = parts[1] ?? "";
				return TOOL_BOOL_MODES
					.filter((m) => m.startsWith(second))
					.map((m) => ({
						value: `claude-ui ${m}`,
						label: m,
						description: `${m} Claude Code UI styling (❯ prompt, spinner, tool chrome)`,
					}));
			}
			if (first === "todo") {
				const second = parts[1] ?? "";
				return TOOL_BOOL_MODES
					.filter((mode) => mode.startsWith(second))
					.map((mode) => ({
						value: `todo ${mode}`,
						label: mode,
						description: mode === "status" ? "Show whether todo tracking is enabled" : `${mode} the todo tool and overlay`,
					}));
			}
			if (first === "activity") {
				const second = parts[1] ?? "";
				return [...TOOL_STATUS_ANIMATIONS, "status"]
					.filter((mode) => mode.startsWith(second))
					.map((mode) => ({
						value: `activity ${mode}`,
						label: mode,
						description: mode === "breathe"
							? "Use the gradual six-step pending indicator (default)"
							: mode === "blink"
								? "Use the classic on/off pending indicator"
								: "Show the current pending indicator style",
					}));
			}
			if (first === "thinking") {
				const second = parts[1] ?? "";
				return [...THINKING_MODES, "status"]
					.filter((m) => m.startsWith(second))
					.map((m) => ({
						value: `thinking ${m}`,
						label: m,
						description:
							m === "live" ? "Only the thinking in progress expands; finished thinking is a Thought for Xs row (default)"
							: m === "full" ? "Thinking always expanded, like stock pi"
							: m === "latest" ? "Like live, but only the latest message keeps its thinking; tool calls around earlier thinking merge"
							: "Show the current mode",
					}));
			}
			if (first === "thinking-label") {
				const second = parts[1] ?? "";
				return TOOL_BOOL_MODES
					.filter((mode) => mode.startsWith(second))
					.map((mode) => ({
						value: `thinking-label ${mode}`,
						label: mode,
						description: mode === "status" ? "Show whether expanded thinking labels are enabled" : "Show or hide the expanded-thinking label",
					}));
			}
			if (first === "intent") {
				const second = parts[1] ?? "";
				return [...BASH_INTENT_MODES, "status"]
					.filter((m) => m.startsWith(second))
					.map((m) => ({ value: `intent ${m}`, label: m, description: INTENT_DESCRIPTIONS[m] }));
			}
			if (first === "group" || first === "detail" || first === "extra") {
				const second = parts[1] ?? "";
				return TOOL_BOOL_MODES
					.filter((m) => m.startsWith(second))
					.map((m) => ({ value: `${first} ${m}`, label: m, description: `${m} ${first}` }));
			}
			return [];
		},
		async handler(args: string, ctx: any) {
			const parts = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
			const sub = parts[0] ?? "";
			if (!sub || sub === "status") {
				notifyToolStatus(ctx);
				return;
			}
	
			if (sub === "group") {
				const next = booleanMode(parts[1], toolGroupingEnabled());
				if (next === undefined) {
					if (ctx.hasUI) ctx.ui.notify(`Usage: /tools group ${TOOL_BOOL_MODES.join("|")}`, "error");
					return;
				}
				if (next === "status") {
					if (ctx.hasUI) ctx.ui.notify(`Tool grouping: ${toolGroupingEnabled() ? "on" : "off"}`, "info");
					return;
				}
				setToolGroupingEnabled(next);
				if (!next) ungroupActiveToolGroups();
				if (ctx.hasUI) {
					ctx.ui.setToolsExpanded(ctx.ui.getToolsExpanded());
					ctx.ui.notify(`Tool grouping: ${next ? "on" : "off"}${next ? " (future adjacent tool rows)" : ""}`, "info");
				}
				return;
			}
	
			if (sub === "activity") {
				handleToolActivityCommand(parts[1], ctx);
				return;
			}
	
			if (sub === "intent") {
				const arg = parts[1] ?? "status";
				const saved = normalizeBashIntentMode(readSettings().bashIntent ?? "model");
				if (arg === "status") {
					const pending = saved !== getBashIntentMode() ? ` Saved: ${saved}, applies after /reload.` : "";
					if (ctx.hasUI) ctx.ui.notify(`Bash labels: ${getBashIntentMode()} (off, model or local).${pending}`, "info");
					return;
				}
				if (!(BASH_INTENT_MODES as readonly string[]).includes(arg)) {
					if (ctx.hasUI) ctx.ui.notify(`Usage: /tools intent ${BASH_INTENT_MODES.join("|")}|status`, "error");
					return;
				}
				const next = arg as BashIntentMode;
				writeSettingsKey("bashIntent", next);
				if (!ctx.hasUI) return;
				if (next === getBashIntentMode()) {
					ctx.ui.notify(`Bash labels: ${next} (already active)`, "info");
				} else {
					ctx.ui.notify(`Bash labels → ${next}. Applies after /reload or on the next start.`, "info");
				}
				return;
			}
	
			if (sub === "thinking") {
				const arg = (parts[1] ?? "status").toLowerCase();
				if (arg === "status" || !arg) {
					if (ctx.hasUI) ctx.ui.notify(`Thinking: ${getThinkingMode()} (live = only streaming thinking expands; full = always expanded; latest = only the latest message keeps its thinking)`, "info");
					return;
				}
				if (!(THINKING_MODES as readonly string[]).includes(arg)) {
					if (ctx.hasUI) ctx.ui.notify(`Usage: /tools thinking ${THINKING_MODES.join("|")}|status`, "error");
					return;
				}
				writeSettingsKey("thinkingMode", arg);
				applyThinkingModeToChats();
				if (ctx.hasUI) {
					ctx.ui.setToolsExpanded(ctx.ui.getToolsExpanded());
					requestChatRender(ctx);
					ctx.ui.notify(`Thinking → ${arg}${
						arg === "live" ? " (only the active thinking expands)"
						: arg === "full" ? " (thinking always expanded)"
						: " (only the latest message keeps its thinking)"
					}`, "info");
				}
				return;
			}
	
			if (sub === "thinking-label") {
				const current = thinkingLabelEnabled();
				const next = booleanMode(parts[1], current);
				if (next === undefined) {
					if (ctx.hasUI) ctx.ui.notify("Usage: /tools thinking-label on|off|toggle|status", "error");
					return;
				}
				if (next === "status") {
					if (ctx.hasUI) ctx.ui.notify(`Expanded thinking label: ${current ? "on" : "off"}`, "info");
					return;
				}
				writeSettingsKey("thinkingLabel", next);
				applyThinkingModeToChats();
				if (ctx.hasUI) {
					requestChatRender(ctx);
					ctx.ui.notify(`Expanded thinking label: ${next ? "on" : "off"}`, "info");
				}
				return;
			}
	
			if (sub === "detail" || sub === "extra") {
				const next = booleanMode(parts[1], getExtraToolOutputExpanded());
				if (next === undefined) {
					if (ctx.hasUI) ctx.ui.notify(`Usage: /tools detail ${TOOL_BOOL_MODES.join("|")}`, "error");
					return;
				}
				if (next === "status") {
					if (ctx.hasUI) ctx.ui.notify(`Extra tool detail: ${getExtraToolOutputExpanded() ? "on" : "off"}`, "info");
					return;
				}
				setExtraToolDetailMode(next);
				if (ctx.hasUI) {
					ctx.ui.setToolsExpanded(ctx.ui.getToolsExpanded());
					ctx.ui.notify(`Extra tool detail: ${getExtraToolOutputExpanded() ? "on" : "off"}`, "info");
				}
				return;
			}
	
			if (sub === "header") {
				await handleHeaderCommand(parts[1], ctx, deps);
				return;
			}
	
			if (sub === "startup") {
				const { STARTUP_STYLES, getStartupStyle } = await import("../terminal/animations/startup-animation.ts");
				const raw = (parts[1] || "toggle").toLowerCase();
				const currentStyle = getStartupStyle();
				const isEnabled = currentStyle !== "off";
	
				if (raw === "status") {
					ctx.ui.notify(
						`Startup animation: ${currentStyle} (/tools startup on|off|toggle|${STARTUP_STYLES.join("|")})`,
						"info",
					);
					return;
				}
				if (raw === "on") {
					writeSettingsKey("startupAnimation", true);
					ctx.ui.notify("Startup animation: on (tetris) (takes effect on the next start)", "info");
					return;
				}
				if (raw === "off") {
					writeSettingsKey("startupAnimation", false);
					ctx.ui.notify("Startup animation: off (takes effect on the next start)", "info");
					return;
				}
				if (raw === "" || raw === "toggle") {
					const next = !isEnabled;
					writeSettingsKey("startupAnimation", next);
					ctx.ui.notify(`Startup animation: ${next ? "on (tetris)" : "off"} (takes effect on the next start)`, "info");
					return;
				}
				if ((STARTUP_STYLES as readonly string[]).includes(raw)) {
					writeSettingsKey("startupAnimation", raw);
					ctx.ui.notify(`Startup animation: ${raw} (takes effect on the next start)`, "info");
					return;
				}
				ctx.ui.notify(`Usage: /tools startup on|off|toggle|status|${STARTUP_STYLES.join("|")}`, "error");
				return;
			}
	
			if (sub === "claude-ui") {
				const current = claudeUiEnabled();
				const next = booleanMode(parts[1], current);
				if (next === "status") {
					ctx.ui.notify(`Claude UI style: ${current ? "on" : "off"} (/tools claude-ui on|off|toggle)`, "info");
					return;
				}
				if (next === undefined) {
					ctx.ui.notify("Usage: /tools claude-ui on|off|toggle|status", "error");
					return;
				}
				writeSettingsKey("claudeUi", next);
				ctx.ui.notify(`Claude UI style: ${next ? "on" : "off"} (takes effect on the next start)`, "info");
				return;
			}
	
			if (sub === "todo") {
				const current = readMergedSettings().todoEnabled === true;
				const next = booleanMode(parts[1], current);
				if (next === "status") {
					if (ctx.hasUI) ctx.ui.notify(`Todo extension: ${current ? "on" : "off"}`, "info");
					return;
				}
				if (next === undefined) {
					if (ctx.hasUI) ctx.ui.notify("Usage: /tools todo on|off|toggle|status", "error");
					return;
				}
				if (next === current) {
					if (ctx.hasUI) ctx.ui.notify(`Todo extension: ${next ? "on" : "off"} (already active)`, "info");
					return;
				}
				writeSettingsKey("todoEnabled", next);
				if (ctx.hasUI) ctx.ui.notify(`Todo extension: ${next ? "on" : "off"} (reloading...)`, "info");
				try {
					await ctx.reload();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					try {
						if (ctx.hasUI) ctx.ui.notify(`Todo setting saved as ${next ? "on" : "off"}, but extension reload failed: ${message}`, "error");
					} catch { /* ctx may already be invalidated */ }
				}
				return;
			}
	
			if (!(TOOL_MODES as readonly string[]).includes(sub)) {
				if (ctx.hasUI) ctx.ui.notify(`Unknown option "${sub}". Try /tools status, /tools thinking live, or /tools group toggle.`, "error");
				return;
			}
			const override = sub as "default" | "transparent" | "outlines";
			setToolBackgroundOverride(override);
			setToolBackgroundMode(override);
			writeSettingsKey("toolBackground", sub);
			if (ctx.hasUI) {
				applyToolBackgroundMode(ctx.ui.theme);
				ctx.ui.notify(`Tool style → ${sub}`, "info");
			}
		},
	});
}
