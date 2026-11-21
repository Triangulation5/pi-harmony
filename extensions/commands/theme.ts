export interface ThemeCommandDependencies {
	readSettings: () => any;
	writeSettingsKey: (key: string, value: unknown) => void;
	activeThemeName: (ctx: any) => string | undefined | null;
	terminalThemeEnabled: () => boolean;
	SYSTEM_THEME_NAME: string;
	applyTerminalTheme: (ctx: any, options: any) => boolean;
	restorePreviousTheme: (ctx: any) => string | null | undefined;
	requestTerminalColorScheme: () => void;
	themeAdaptiveEnabled: () => boolean;
	bustSpinnerSettingsCache: () => void;
	invalidateThemePaletteCache: () => void;
	setAutoDerivePending: (value: boolean) => void;
	applyThemePaletteIfNeeded: (theme: unknown) => void;
	resetThemePalette: () => void;
	chromeAnsi: (theme: unknown, key: any) => string | null;
	safeFgAnsi: (theme: unknown, key: string) => string | null;
}

export function registerThemeCommand(pi: any, deps: ThemeCommandDependencies): void {
	const { readSettings, writeSettingsKey, activeThemeName, terminalThemeEnabled, SYSTEM_THEME_NAME, applyTerminalTheme, restorePreviousTheme, requestTerminalColorScheme, themeAdaptiveEnabled, bustSpinnerSettingsCache, invalidateThemePaletteCache, setAutoDerivePending, applyThemePaletteIfNeeded, resetThemePalette, chromeAnsi, safeFgAnsi } = deps;
	
	// /theme command — toggle pi-theme-adaptive coloring at runtime, and
	// /theme terminal — make pi's theme follow the terminal's palette.
	const THEME_MODES = ["on", "off", "toggle", "status", "terminal"] as const;
	const TERMINAL_MODES = ["on", "off", "toggle", "status"] as const;
	const handleTerminalTheme = (arg: string, ctx: any): void => {
		const current = terminalThemeEnabled();
		if (!arg || arg === "status") {
			if (!ctx.hasUI) return;
			const name = activeThemeName(ctx.ui) ?? "unknown";
			const previous = readSettings().terminalThemePrevious;
			const isDefault = readSettings().terminalTheme === undefined;
			ctx.ui.notify([
				`Terminal colors: ${current ? "on" : "off"}${isDefault ? " (default)" : ""} (pi theme "${name}")`,
				current && previous ? `  /theme terminal off restores "${previous}"` : "",
				current && name !== SYSTEM_THEME_NAME ? "  pi is not using the system theme right now; /theme terminal on switches it back" : "",
			].filter(Boolean).join("\n"), "info");
			return;
		}
		let next: boolean;
		if (arg === "on") next = true;
		else if (arg === "off") next = false;
		else if (arg === "toggle") next = !current;
		else {
			if (ctx.hasUI) ctx.ui.notify(`Usage: /theme terminal ${TERMINAL_MODES.join("|")}`, "error");
			return;
		}
		if (next) {
			const prior = readSettings().terminalTheme;
			writeSettingsKey("terminalTheme", true);
			if (!applyTerminalTheme(ctx, { announce: false, reportUnavailable: true })) {
				writeSettingsKey("terminalTheme", prior);
				return;
			}
			requestTerminalColorScheme();
			if (ctx.hasUI) ctx.ui.notify("Terminal colors: on — pi's theme now follows the terminal (Ghostty, Rex, ...)", "info");
		} else {
			// Explicit false: unset means on (the default).
			writeSettingsKey("terminalTheme", false);
			const restored = restorePreviousTheme(ctx);
			if (ctx.hasUI) {
				ctx.ui.notify(restored
					? `Terminal colors: off — restored theme "${restored}"`
					: "Terminal colors: off — pick a theme with /settings", "info");
			}
		}
	};
	pi.registerCommand("theme", {
		description: "Match Pi Harmony's colors to the active Pi theme or terminal palette",
		getArgumentCompletions(prefix: string) {
			if (prefix.startsWith("terminal ")) {
				const second = prefix.slice("terminal ".length);
				return TERMINAL_MODES
					.filter((m) => m.startsWith(second))
					.map((m) => ({
						value: `terminal ${m}`,
						label: m,
						description:
							m === "on" ? "Use pi's system theme, built from the terminal's palette, and re-read it on focus"
							: m === "off" ? "Go back to the theme you had before"
							: m === "toggle" ? "Flip between on and off"
							: "Show whether pi follows the terminal's colors",
					}));
			}
			return THEME_MODES
				.filter((m) => m.startsWith(prefix))
				.map((m) => ({
					value: m,
					label: m,
					description:
						m === "on" ? "Derive borders, branch rules, dim text and diff tints from the active pi theme (default)"
						: m === "off" ? "Keep the fixed Claude-style palette regardless of theme"
						: m === "toggle" ? "Flip between on and off"
						: m === "terminal" ? "Make pi's theme follow the terminal's colors (Ghostty, Rex, ...)"
						: "Show the current setting and a preview of the derived colors",
				}));
		},
		async handler(args: string, ctx: any) {
			const raw = args.trim().toLowerCase();
			if (raw === "terminal" || raw.startsWith("terminal ")) {
				handleTerminalTheme(raw.slice("terminal".length).trim(), ctx);
				return;
			}
			const current = themeAdaptiveEnabled();
	
			if (!raw || raw === "status") {
				if (!ctx.hasUI) return;
				const theme = ctx.ui.theme as any;
				const themeName = theme?.name ?? "unknown";
				const state = current ? "on" : "off";
				const terminalLine = `terminal colors: ${terminalThemeEnabled() ? "on" : "off"} (/theme terminal on|off)`;
				if (raw === "status" && current) {
					const settings = readSettings();
					const verbKey = settings.spinnerVerbColor || "borderAccent";
					const statusKey = settings.spinnerStatusColor || "muted";
					const verbAnsi = safeFgAnsi(theme, verbKey) ?? safeFgAnsi(theme, "accent");
					const statusAnsi = safeFgAnsi(theme, statusKey) ?? safeFgAnsi(theme, "muted");
					// Print a short preview of what we derived.
					const preview = [
						`outlines    : ${chromeAnsi(theme, "outline")}╭─ User ──\x1b[39m (user box, code fences)`,
						`connectors  : ${chromeAnsi(theme, "branch")}├ └ │\x1b[39m (faint, fixed contrast on the terminal background)`,
						`muted text  : ${safeFgAnsi(theme, "muted") ? `${safeFgAnsi(theme, "muted")}example dim text\x1b[39m` : "(unchanged)"}`,
						`diff add    : ${safeFgAnsi(theme, "toolDiffAdded") ? `${safeFgAnsi(theme, "toolDiffAdded")}+ added line\x1b[39m` : "(unchanged)"}`,
						`diff del    : ${safeFgAnsi(theme, "toolDiffRemoved") ? `${safeFgAnsi(theme, "toolDiffRemoved")}- removed line\x1b[39m` : "(unchanged)"}`,
						`spinner verb: ${verbAnsi ? `${verbAnsi}Cooking...\x1b[39m` : "(unchanged)"} (key: ${verbKey})`,
						`spinner stat: ${statusAnsi ? `${statusAnsi}(thinking · ↓ 10 tokens · 2s)\x1b[39m` : "(unchanged)"} (key: ${statusKey})`,
					].join("\n  ");
					ctx.ui.notify(`Theme adaptive: ${state} (theme "${themeName}")\n  ${terminalLine}\n  ${preview}`, "info");
				} else {
					ctx.ui.notify(`Theme adaptive: ${state} (theme "${themeName}")\n  ${terminalLine}`, "info");
				}
				return;
			}
	
			let next: boolean;
			if (raw === "on") next = true;
			else if (raw === "off") next = false;
			else if (raw === "toggle") next = !current;
			else {
				if (ctx.hasUI) ctx.ui.notify(`Unknown option "${raw}". Options: ${THEME_MODES.join(", ")}`, "error");
				return;
			}
	
			writeSettingsKey("themeAdaptive", next);
			bustSpinnerSettingsCache();
			// Invalidate caches so the next render re-derives from the active
			// theme (or falls back to the fixed Claude palette).
			invalidateThemePaletteCache();
			setAutoDerivePending(true);
			if (next) {
				if (ctx.hasUI) applyThemePaletteIfNeeded(ctx.ui.theme);
			} else {
				resetThemePalette();
			}
			if (ctx.hasUI) {
				const label = next ? "on — colors follow pi theme" : "off — fixed Claude palette";
				ctx.ui.notify(`Theme adaptive: ${label}`, "info");
			}
		},
	});
}
