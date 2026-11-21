import {
	CustomEditor,
	CustomMessageComponent,
	UserMessageComponent,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { Markdown, Text, visibleWidth } from "@earendil-works/pi-tui";

export interface MessageRenderPatchDependencies {
	customMessagePatchFlag: symbol;
	userMessagePatchFlag: symbol;
	promptEditorPatchFlag: symbol;
	transparentReset: string;
	syncToolBackgroundMode: () => void;
	messageRenderCacheHit: (component: any, width: number) => string[] | null;
	storeMessageRenderCache: (component: any, width: number, lines: string[]) => string[];
	clearMessageRenderCache: (component: any) => void;
	stripTransientMagicContextTags: (text: string) => string;
	visitMarkdownDescendants: (root: unknown, visit: (markdown: any) => void) => void;
	isSubagentNotificationMessage: (message: unknown) => boolean;
	renderSubagentNotificationLines: (details: any, expanded: boolean, width: number, theme: Theme) => string[];
	formatSubagentNotification: (lines: string[], width: number) => string[];
	frameToolLikeLines: (lines: string[], width: number) => string[];
	normalizeLeadingCheckGlyph: (line: string) => string;
	getGlobalPiTheme: () => any;
	stripAnsi: (text: string) => string;
	stripOsc133Zones: (line: string) => string;
	copySkip: (text: string) => string;
	clampLineWidth: (line: string, width: number) => string;
	applyTerminalCopyZones: (lines: string[]) => string[];
	makeMarkdownLinksCopySafe: (markdown: InstanceType<typeof Markdown>) => void;
	claudeUiEnabled: () => boolean;
	chromeAnsi: (theme: any, kind: "outline") => string;
	themeTokenRgb: (theme: any, token: string) => { r: number; g: number; b: number } | null | undefined;
	terminalDefaultColors: (theme: any) => { background?: { r: number; g: number; b: number } } | null | undefined;
	rgbToHex: (rgb: { r: number; g: number; b: number }) => string;
	rgbBgAnsi: (theme: any, rgb: { r: number; g: number; b: number }) => string;
	thinkingSummaryStyledText: (body: string, hovered?: boolean) => string;
	padRenderedLineToWidth: (line: string, width: number) => string;
	hiddenThinkingSummaryForMessage: (message: any, component?: any) => string;
	isTextComponent: (value: unknown) => value is InstanceType<typeof Text>;
}

export function createMessageRenderPatches(deps: MessageRenderPatchDependencies) {
	class HiddenThinkingSummary {
		private body: string;
		private hovered = false;
		private cachedWidth?: number;
		private cachedHovered?: boolean;
		private cachedLines?: string[];

		constructor(body: string) {
			this.body = deps.stripAnsi(body).trim();
		}

		setSummary(summaryText: string): void {
			const body = deps.stripAnsi(summaryText).trim();
			if (this.body === body) return;
			this.body = body;
			this.invalidate();
		}

		setHovered(hovered: boolean): void {
			if (this.hovered === hovered) return;
			this.hovered = hovered;
			this.invalidate();
		}

		invalidate(): void {
			this.cachedWidth = undefined;
			this.cachedHovered = undefined;
			this.cachedLines = undefined;
		}

		render(width: number): string[] {
			if (this.cachedLines && this.cachedWidth === width && this.cachedHovered === this.hovered) return this.cachedLines;
			const safeWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
			if (safeWidth <= 0) {
				this.cachedWidth = width;
				this.cachedHovered = this.hovered;
				this.cachedLines = [""];
				return this.cachedLines;
			}
			const bodyLine = deps.thinkingSummaryStyledText(this.body, this.hovered);
			const line = deps.padRenderedLineToWidth(`   ${bodyLine}`, safeWidth);
			this.cachedWidth = width;
			this.cachedHovered = this.hovered;
			this.cachedLines = [line];
			return this.cachedLines;
		}
	}

	function isHiddenThinkingPlaceholderText(child: unknown): child is InstanceType<typeof Text> {
		if (!deps.isTextComponent(child)) return false;
		const plain = deps.stripAnsi(String((child as any).text ?? "")).trim();
		if (/^[✻∴]\s*Thinking/i.test(plain)) return true;
		if (/^[✻∴]\s*Thought for/i.test(plain)) return true;
		if (/^Thought for\b/i.test(plain)) return true;
		if (/^Thinking\.\.\.$/i.test(plain)) return true;
		return /^Thinking:?\s*$/i.test(plain);
	}

	function replaceHiddenThinkingPlaceholders(container: { children?: any[] }, message: any): void {
		if (!container?.children) return;
		const summary = deps.hiddenThinkingSummaryForMessage(message);
		let firstReplaced = false;
		for (let i = 0; i < container.children.length; i++) {
			const child = container.children[i];
			const inner = (child as any)?.child ?? child;
			if (inner instanceof HiddenThinkingSummary || (inner as any)?.constructor?.name === "HiddenThinkingSummary") {
				if (!firstReplaced) {
					inner.setSummary(summary);
					firstReplaced = true;
				} else {
					container.children.splice(i, 1);
					i--;
				}
				continue;
			}
			if (isHiddenThinkingPlaceholderText(inner)) {
				if (!firstReplaced) {
					const summaryComp = new HiddenThinkingSummary(summary);
					if ((child as any)?.child !== undefined) (child as any).child = summaryComp;
					else container.children[i] = summaryComp;
					firstReplaced = true;
				} else {
					container.children.splice(i, 1);
					i--;
				}
			}
		}
	}

	function stripBackgroundAnsi(text: string): string {
		return text.replace(/\x1b\[([0-9;]*)m/g, (match, paramsText: string) => {
			const params = paramsText === "" ? ["0"] : paramsText.split(";");
			const kept: string[] = [];
			for (let i = 0; i < params.length; i++) {
				const code = Number(params[i] || "0");
				if (code === 48) {
					const mode = Number(params[i + 1] || "0");
					i += mode === 2 ? 4 : mode === 5 ? 2 : 0;
					continue;
				}
				if (code === 49 || (code >= 40 && code <= 47) || (code >= 100 && code <= 107)) continue;
				kept.push(params[i]);
			}
			return kept.length === 0 ? "" : `\x1b[${kept.join(";")}m`;
		});
	}

	function trimAnsiRight(text: string): string {
		let trimmed = text;
		while (true) {
			const next = trimmed.replace(/[ \t]+((?:\x1b\[[0-9;]*m)*)$/g, "$1");
			if (next === trimmed) return trimmed;
			trimmed = next;
		}
	}

	function cleanUserMessageLine(line: string): string {
		return `${deps.transparentReset}${trimAnsiRight(stripBackgroundAnsi(deps.stripOsc133Zones(line)))}${deps.transparentReset}`;
	}

	const USER_PROMPT_MARK = "❯";
	const USER_MESSAGE_PAD = 3;

	function userMessageBandAnsi(theme?: any): string {
		const t = theme ?? deps.getGlobalPiTheme();
		const band = deps.themeTokenRgb(t, "userMessageBg");
		const terminal = deps.terminalDefaultColors(t)?.background;
		if (!band || (terminal && deps.rgbToHex(band) === deps.rgbToHex(terminal as any))) return "";
		return deps.rgbBgAnsi(t, band);
	}

	function markUserPromptLine(line: string, copyMarked = false): string {
		const mark = `${deps.chromeAnsi(deps.getGlobalPiTheme(), "outline")}${USER_PROMPT_MARK}\x1b[39m`;
		return line.replace(/^((?:\x1b\[[0-9;]*m)*) {3}/, (_match, esc: string) => (
			copyMarked ? `${esc}${deps.copySkip(` ${mark} `)}` : `${esc} ${mark} `
		));
	}

	function copySkipUserPad(line: string): string {
		return line.replace(/^((?:\x1b\[[0-9;]*m)*) {3}/, (_match, esc: string) => `${esc}${deps.copySkip("   ")}`);
	}

	function withUserBand(line: string, width: number, band: string): string {
		const content = deps.clampLineWidth(line, width);
		if (!band) return content;
		const pad = " ".repeat(Math.max(0, width - visibleWidth(content)));
		return `${band}${content.replace(/\x1b\[0?m|\x1b\[49m/g, (reset) => reset + band)}${pad}${deps.transparentReset}`;
	}

	function patchCustomMessageRender(): void {
		const proto = CustomMessageComponent.prototype as any;
		if (proto[deps.customMessagePatchFlag]) return;
		const originalRender = proto.render;
		if (typeof originalRender !== "function") return;
		proto.render = function patchedCustomMessageRender(width: number) {
			deps.syncToolBackgroundMode();
			const cached = deps.messageRenderCacheHit(this, width);
			if (cached) return cached;
			deps.visitMarkdownDescendants(this, (child) => {
				const markdownAny = child as any;
				if (typeof markdownAny.text === "string") {
					const stripped = deps.stripTransientMagicContextTags(markdownAny.text);
					if (stripped !== markdownAny.text) {
						markdownAny.text = stripped;
						child.invalidate?.();
					}
				}
			});
			const lines = originalRender.call(this, width);
			if (!Array.isArray(lines)) return lines;
			const details = (this?.message as any)?.details;
			const result = deps.isSubagentNotificationMessage(this?.message)
				? details && typeof details === "object" && typeof details.description === "string"
					? deps.frameToolLikeLines(deps.renderSubagentNotificationLines(details, this._expanded === true, Math.max(1, width), deps.getGlobalPiTheme()), width)
					: deps.formatSubagentNotification(lines, width)
				: lines.map(deps.normalizeLeadingCheckGlyph);
			return deps.storeMessageRenderCache(this, width, result);
		};
		const originalRebuild = proto.rebuild;
		if (typeof originalRebuild === "function") {
			proto.rebuild = function patchedCustomMessageRebuild(...args: any[]) {
				deps.clearMessageRenderCache(this);
				return originalRebuild.apply(this, args);
			};
		}
		proto[deps.customMessagePatchFlag] = true;
	}

	function patchUserMessageRender(): void {
		const proto = UserMessageComponent.prototype as any;
		if (proto[deps.userMessagePatchFlag]) return;
		const originalRender = proto.render;
		if (typeof originalRender !== "function") return;
		const originalRebuild = proto.rebuild;
		if (typeof originalRebuild === "function") {
			proto.rebuild = function patchedUserMessageRebuild(this: any, ...args: any[]) {
				this.outputPad = Math.max(this.outputPad ?? 1, USER_MESSAGE_PAD);
				deps.clearMessageRenderCache(this);
				return originalRebuild.apply(this, args);
			};
		}
		proto.render = function patchedUserMessageRender(width: number) {
			if (!deps.claudeUiEnabled()) return originalRender.call(this, width);
			const cached = deps.messageRenderCacheHit(this, width);
			if (cached) return cached;
			if ((this.outputPad ?? 1) < USER_MESSAGE_PAD) this.rebuild?.();
			deps.visitMarkdownDescendants(this, (child) => {
				const markdownAny = child as any;
				if (typeof markdownAny.text === "string") {
					const stripped = deps.stripTransientMagicContextTags(markdownAny.text);
					if (stripped !== markdownAny.text) {
						markdownAny.text = stripped;
						child.invalidate?.();
					}
				}
				deps.makeMarkdownLinksCopySafe(child);
				if (markdownAny.defaultTextStyle?.bgColor) {
					markdownAny.defaultTextStyle.bgColor = undefined;
					child.invalidate?.();
				}
			});
			const safeWidth = Math.max(1, width);
			const padded = typeof this.rebuild === "function" && "outputPad" in this;
			const lines = originalRender.call(this, padded ? safeWidth : Math.max(1, safeWidth - 2));
			if (!Array.isArray(lines) || lines.length === 0) return lines;
			let body = (lines.length > 2 ? lines.slice(1, -1) : lines).map(cleanUserMessageLine);
			if (!padded) body = body.map((line) => line.replace(/^((?:\x1b\[[0-9;]*m)*)/, "$1  "));
			const band = userMessageBandAnsi();
			body = body.map((line, index) => (index === 0 ? markUserPromptLine(line, true) : copySkipUserPad(line)));
			const rendered = body.map((line) => withUserBand(line, safeWidth, band));
			return deps.storeMessageRenderCache(this, width, deps.applyTerminalCopyZones(rendered));
		};
		proto[deps.userMessagePatchFlag] = true;
	}

	function installPromptMarkerEditor(ctx: any): void {
		if (!deps.claudeUiEnabled()) return;
		const ui = ctx?.ui;
		if (typeof ui?.setEditorComponent !== "function" || typeof ui?.getEditorComponent !== "function") return;
		const previous = ui.getEditorComponent();
		if (previous?.[deps.promptEditorPatchFlag]) return;
		const factory: any = (tui: any, theme: any, keybindings: any) => {
			const editor: any = previous?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings);
			if (typeof editor?.render !== "function") return editor;
			const render = editor.render.bind(editor);
			editor.render = (width: number) => {
				if ((editor.paddingX ?? 0) !== USER_MESSAGE_PAD) editor.paddingX = USER_MESSAGE_PAD;
				const lines: string[] = render(width);
				if (Array.isArray(lines) && lines.length > 1) lines[1] = markUserPromptLine(lines[1]);
				return lines;
			};
			return editor;
		};
		factory[deps.promptEditorPatchFlag] = true;
		try {
			ui.setEditorComponent(factory);
		} catch { /* not interactive */ }
	}

	return { patchCustomMessageRender, patchUserMessageRender, installPromptMarkerEditor, replaceHiddenThinkingPlaceholders };
}
