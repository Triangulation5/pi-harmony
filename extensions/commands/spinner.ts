export interface SpinnerCommandDependencies {
	readSettings: () => any;
	writeSettingsKey: (key: string, value: unknown) => void;
	safeFgAnsi: (theme: unknown, key: string) => string | null;
	bustSpinnerSettingsCache: () => void;
}

export function registerSpinnerCommand(pi: any, deps: SpinnerCommandDependencies): void {
	const { readSettings, writeSettingsKey, safeFgAnsi, bustSpinnerSettingsCache } = deps;
	
	// /spinner command — spinner colors, style, speed, dots, and shimmer controls.
	const COMMON_COLOR_KEYS: readonly string[] = [
		"accent", "borderAccent", "success", "error", "warning",
		"muted", "dim", "text", "thinkingText",
		"toolTitle", "mdHeading", "mdCode", "mdLink", "mdListBullet",
		"bashMode",
		"thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh",
		"syntaxKeyword", "syntaxFunction", "syntaxString", "syntaxType",
	];
	pi.registerCommand("spinner", {
		description: "Customize spinner colors, animation, speed, and shimmer",
		getArgumentCompletions(prefix: string) {
			const subCommands = ["verb", "status", "dots", "tips", "speed", "style", "shimmer-direction", "shimmer-style", "shimmer-color", "reset", "preview"];
			const parts = prefix.split(/\s+/);
			if (parts.length <= 1) {
				return subCommands
					.filter((c) => c.startsWith(parts[0] ?? ""))
					.map((c) => ({
						value: c,
						label: c,
						description:
							c === "verb" ? "Set the color key used for the spinner verb (e.g. 'Cooking...')"
							: c === "status" ? "Set the color key used for the spinner status suffix"
							: c === "dots" ? "Toggle animated dots after the spinner text"
							: c === "tips" ? "Toggle random tips displayed under the spinner text"
							: c === "speed" ? "Set the spinner glyph speed"
							: c === "style" ? "Choose the default glyph cycle, breathing stars, or orbiting circles"
							: c === "shimmer-direction" ? "Set the shimmer sweep direction"
							: c === "shimmer-style" ? "Choose a sweep, double flash, or fast sparkle on spinner text"
							: c === "shimmer-color" ? "Set the shimmer highlight color"
							: c === "reset" ? "Reset both verb and status to defaults (borderAccent, muted)"
							: "Preview every theme color key with its current sample",
					}));
			}
			if (parts[0]?.toLowerCase() === "dots") {
				const value = (parts[1] ?? "").toLowerCase();
				return ["on", "off", "disabled", "toggle", "status"]
					.filter((mode) => mode.startsWith(value))
					.map((mode) => ({
						value: `dots ${mode}`,
						label: mode,
						description: mode === "disabled" ? "Hide the dot suffix completely"
							: mode === "off" ? "Show a static ... suffix"
							: "Toggle animated dots after the spinner text",
					}));
			}
			if (parts[0]?.toLowerCase() === "tips") {
				const value = (parts[1] ?? "").toLowerCase();
				return ["on", "off", "toggle", "status"]
					.filter((mode) => mode.startsWith(value))
					.map((mode) => ({
						value: `tips ${mode}`,
						label: mode,
						description: mode === "off" ? "Hide tips under the spinner"
							: mode === "on" ? "Show random tips under the spinner"
							: "Toggle tips under the spinner text",
					}));
			}
			if (parts[0]?.toLowerCase() === "speed") {
				const value = (parts[1] ?? "").toLowerCase();
				return ["slow", "medium", "fast", "status"]
					.filter((mode) => mode.startsWith(value))
					.map((mode) => ({ value: `speed ${mode}`, label: mode, description: "Medium is the default spinner speed" }));
			}
			if (parts[0]?.toLowerCase() === "style") {
				const value = (parts[1] ?? "").toLowerCase();
				return ["asterisk", "breathing", "orbit", "status"]
					.filter((mode) => mode.startsWith(value))
					.map((mode) => ({ value: `style ${mode}`, label: mode, description: "Choose the spinner animation style" }));
			}
			if (parts[0]?.toLowerCase() === "shimmer-direction") {
				const value = (parts[1] ?? "").toLowerCase();
				return ["left", "right", "status"]
					.filter((mode) => mode.startsWith(value))
					.map((mode) => ({ value: `shimmer-direction ${mode}`, label: mode, description: "Choose the shimmer sweep direction" }));
			}
			if (parts[0]?.toLowerCase() === "shimmer-style") {
				const value = (parts[1] ?? "").toLowerCase();
				return ["sweep", "flash", "sparkle", "status"]
					.filter((mode) => mode.startsWith(value))
					.map((mode) => ({ value: `shimmer-style ${mode}`, label: mode, description: "Choose the spinner-text shimmer animation" }));
			}
			if (parts[0]?.toLowerCase() === "shimmer-color") {
				const value = (parts[1] ?? "").toLowerCase();
				const options = ["status", "reset"]
					.filter((mode) => mode.startsWith(value))
					.map((mode) => ({ value: `shimmer-color ${mode}`, label: mode, description: "Inspect or reset the shimmer color" }));
				if (!value || value.startsWith("#")) {
					options.push({ value: "shimmer-color #RRGGBB", label: "#RRGGBB", description: "Set a custom shimmer highlight color" });
				}
				return options;
			}
			// Second arg: color key completions for verb/status.
			if (parts[0]?.toLowerCase() === "verb" || parts[0]?.toLowerCase() === "status") {
				const keyPrefix = (parts[1] ?? "").toLowerCase();
				return COMMON_COLOR_KEYS
					.filter((k) => k.toLowerCase().startsWith(keyPrefix))
					.map((k) => ({ value: k, label: k, description: `theme.fg("${k}", ...)` }));
			}
			return [];
		},
		async handler(args: string, ctx: any) {
			const parts = args.trim().split(/\s+/).filter((p) => p.length > 0);
			const sub = (parts[0] ?? "").toLowerCase();
			const theme = ctx.hasUI ? (ctx.ui.theme as any) : null;
			const settings = readSettings();
			const currentVerb = settings.spinnerVerbColor || "borderAccent";
			const currentStatus = settings.spinnerStatusColor || "muted";
			const animatedDots = settings.spinnerAnimatedDots === true;
			const dotsDisabled = settings.spinnerDotsDisabled === true;
			const dotsStatus = dotsDisabled ? "disabled" : animatedDots ? "on" : "off";
			const speed = settings.spinnerSpeed === "slow" || settings.spinnerSpeed === "fast"
				? settings.spinnerSpeed
				: "medium";
			const style = settings.spinnerStyle === "breathing" || settings.spinnerStyle === "orbit"
				? settings.spinnerStyle
				: "asterisk";
			const shimmerDirection = settings.spinnerShimmerDirection === "right-to-left"
				? "right-to-left"
				: "left-to-right";
			const shimmerStyle = settings.spinnerShimmerStyle === "flash" || settings.spinnerShimmerStyle === "sparkle"
				? settings.spinnerShimmerStyle
				: "sweep";
			const shimmerColor = settings.spinnerShimmerColor ?? "default";
	
			if (!sub || sub === "preview") {
				if (!ctx.hasUI) return;
				if (!theme) {
					ctx.ui.notify(`Spinner verb: ${currentVerb}, status: ${currentStatus}, style=${style}, speed=${speed}, dots=${dotsStatus}, tips=${settings.spinnerTips !== false ? "on" : "off"}, shimmer=${shimmerStyle} ${shimmerDirection} ${shimmerColor} (no theme)`, "info");
					return;
				}
				const lines: string[] = [
					`Current: verb=${currentVerb}, status=${currentStatus}, style=${style}, speed=${speed}, dots=${dotsStatus}, tips=${settings.spinnerTips !== false ? "on" : "off"}`,
					`Shimmer: ${shimmerStyle}, ${shimmerDirection}, color=${shimmerColor}`,
					"",
					"Preview of common theme keys (pick one for verb or status):",
				];
				for (const key of COMMON_COLOR_KEYS) {
					const ansi = safeFgAnsi(theme, key);
					const marker = key === currentVerb ? "(verb)" : key === currentStatus ? "(status)" : "";
					const sample = ansi ? `${ansi}Cooking...\x1b[39m` : "(unmapped)";
					lines.push(`  ${key.padEnd(16)} ${sample} ${marker}`);
				}
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}
	
			if (sub === "reset") {
				writeSettingsKey("spinnerVerbColor", undefined);
				writeSettingsKey("spinnerStatusColor", undefined);
				bustSpinnerSettingsCache();
				if (ctx.hasUI) ctx.ui.notify("Spinner colors reset to defaults (verb=borderAccent, status=muted)", "info");
				return;
			}
	
			if (sub === "dots") {
				const mode = (parts[1] ?? "status").toLowerCase();
				if (mode === "status") {
					if (ctx.hasUI) ctx.ui.notify(`Spinner dots: ${dotsStatus}`, "info");
					return;
				}
				if (mode === "disabled") {
					writeSettingsKey("spinnerDotsDisabled", true);
					bustSpinnerSettingsCache();
					if (ctx.hasUI) ctx.ui.notify("Spinner dots → disabled", "info");
					return;
				}
				if (mode !== "on" && mode !== "off" && mode !== "toggle") {
					if (ctx.hasUI) ctx.ui.notify("Usage: /spinner dots on|off|disabled|toggle|status", "error");
					return;
				}
				const enabled = mode === "toggle" ? dotsDisabled || !animatedDots : mode === "on";
				writeSettingsKey("spinnerDotsDisabled", false);
				writeSettingsKey("spinnerAnimatedDots", enabled);
				bustSpinnerSettingsCache();
				if (ctx.hasUI) ctx.ui.notify(`Spinner animated dots → ${enabled ? "on" : "off"}`, "info");
				return;
			}
	
			if (sub === "tips") {
				const mode = (parts[1] ?? "status").toLowerCase();
				const tipsEnabled = settings.spinnerTips !== false;
				if (mode === "status") {
					if (ctx.hasUI) ctx.ui.notify(`Spinner tips: ${tipsEnabled ? "on" : "off"}`, "info");
					return;
				}
				if (mode !== "on" && mode !== "off" && mode !== "toggle") {
					if (ctx.hasUI) ctx.ui.notify("Usage: /spinner tips on|off|toggle|status", "error");
					return;
				}
				const enabled = mode === "toggle" ? !tipsEnabled : mode === "on";
				writeSettingsKey("spinnerTips", enabled);
				bustSpinnerSettingsCache();
				if (ctx.hasUI) ctx.ui.notify(`Spinner tips → ${enabled ? "on" : "off"}`, "info");
				return;
			}
	
			if (sub === "speed") {
				const mode = (parts[1] ?? "status").toLowerCase();
				if (mode === "status") {
					if (ctx.hasUI) ctx.ui.notify(`Spinner speed: ${speed}`, "info");
					return;
				}
				if (mode !== "slow" && mode !== "medium" && mode !== "fast") {
					if (ctx.hasUI) ctx.ui.notify("Usage: /spinner speed slow|medium|fast|status", "error");
					return;
				}
				writeSettingsKey("spinnerSpeed", mode);
				bustSpinnerSettingsCache();
				if (ctx.hasUI) ctx.ui.notify(`Spinner speed → ${mode}`, "info");
				return;
			}
	
			if (sub === "style") {
				const mode = (parts[1] ?? "status").toLowerCase();
				if (mode === "status") {
					if (ctx.hasUI) ctx.ui.notify(`Spinner style: ${style}`, "info");
					return;
				}
				if (mode !== "asterisk" && mode !== "breathing" && mode !== "orbit") {
					if (ctx.hasUI) ctx.ui.notify("Usage: /spinner style asterisk|breathing|orbit|status", "error");
					return;
				}
				writeSettingsKey("spinnerStyle", mode);
				bustSpinnerSettingsCache();
				if (ctx.hasUI) ctx.ui.notify(`Spinner style → ${mode}`, "info");
				return;
			}
	
			if (sub === "shimmer-direction") {
				const mode = (parts[1] ?? "status").toLowerCase();
				if (mode === "status") {
					if (ctx.hasUI) ctx.ui.notify(`Spinner shimmer direction: ${shimmerDirection}`, "info");
					return;
				}
				if (mode !== "left" && mode !== "right") {
					if (ctx.hasUI) ctx.ui.notify("Usage: /spinner shimmer-direction left|right|status", "error");
					return;
				}
				writeSettingsKey("spinnerShimmerDirection", mode === "left" ? "left-to-right" : "right-to-left");
				bustSpinnerSettingsCache();
				if (ctx.hasUI) ctx.ui.notify(`Spinner shimmer direction → ${mode}-to-${mode === "left" ? "right" : "left"}`, "info");
				return;
			}
	
			if (sub === "shimmer-style") {
				const mode = (parts[1] ?? "status").toLowerCase();
				if (mode === "status") {
					if (ctx.hasUI) ctx.ui.notify(`Spinner shimmer style: ${shimmerStyle}`, "info");
					return;
				}
				if (mode !== "sweep" && mode !== "flash" && mode !== "sparkle") {
					if (ctx.hasUI) ctx.ui.notify("Usage: /spinner shimmer-style sweep|flash|sparkle|status", "error");
					return;
				}
				writeSettingsKey("spinnerShimmerStyle", mode);
				bustSpinnerSettingsCache();
				if (ctx.hasUI) ctx.ui.notify(`Spinner shimmer style → ${mode}`, "info");
				return;
			}
	
			if (sub === "shimmer-color") {
				const value = (parts[1] ?? "status").toLowerCase();
				if (value === "status") {
					if (ctx.hasUI) ctx.ui.notify(`Spinner shimmer color: ${shimmerColor}`, "info");
					return;
				}
				if (value === "reset") {
					writeSettingsKey("spinnerShimmerColor", undefined);
					bustSpinnerSettingsCache();
					if (ctx.hasUI) ctx.ui.notify("Spinner shimmer color reset to its derived default", "info");
					return;
				}
				if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
					if (ctx.hasUI) ctx.ui.notify("Usage: /spinner shimmer-color #RGB|#RRGGBB|status|reset", "error");
					return;
				}
				writeSettingsKey("spinnerShimmerColor", value);
				bustSpinnerSettingsCache();
				if (ctx.hasUI) ctx.ui.notify(`Spinner shimmer color → ${value}`, "info");
				return;
			}
	
			if (sub !== "verb" && sub !== "status") {
				if (ctx.hasUI) ctx.ui.notify("Usage: /spinner verb|status <key> | style asterisk|breathing|orbit|status | speed slow|medium|fast|status | dots on|off|disabled|toggle|status | tips on|off|toggle|status | shimmer-direction left|right|status | shimmer-style sweep|flash|sparkle|status | shimmer-color #RRGGBB|status|reset | reset | preview", "error");
				return;
			}
	
			const key = parts[1];
			if (!key) {
				if (ctx.hasUI) ctx.ui.notify("Missing color key. Try /spinner preview to see available keys.", "error");
				return;
			}
	
			// Validate the key resolves to *some* color in the active theme;
			// accept anyway if the user insists so themes with custom keys work.
			const ansi = theme ? safeFgAnsi(theme, key) : null;
			const settingKey = sub === "verb" ? "spinnerVerbColor" : "spinnerStatusColor";
			writeSettingsKey(settingKey, key);
			bustSpinnerSettingsCache();
			if (ctx.hasUI) {
				const sample = ansi ? `${ansi}sample\x1b[39m` : "(key unmapped in current theme)";
				ctx.ui.notify(`Spinner ${sub} → ${key} ${sample}`, "info");
			}
		},
	});
}
