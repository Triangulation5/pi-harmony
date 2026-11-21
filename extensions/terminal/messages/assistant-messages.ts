import {
	AssistantMessageComponent,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { Spacer, Text } from "@earendil-works/pi-tui";
import type { MarkdownOptions } from "../../markdown/math.ts";

export interface AssistantMessagePatchDependencies {
	patchFlag: symbol;
	renderPatchFlag: symbol;
	componentParentKey: symbol;
	workedStartKey: string | symbol;
	workedDurationByMessage: Map<any, number>;
	getThinkingMode: () => "full" | "live" | "latest";
	isLiveThinkingMessage: (component: any, message: any) => boolean;
	messageHasThinkingContent: (message: any) => boolean;
	hidesSupersededThinking: (component: any, message: any) => boolean;
	stripTransientMagicContextTags: (text: string) => string;
	visitMarkdownDescendants: (root: unknown, visit: (markdown: any) => void) => void;
	isMarkdownComponent: (component: any) => boolean;
	applyTerminalCopyZones: (lines: string[]) => string[];
	messageRenderCacheHit: (component: any, width: number) => string[] | null | undefined;
	storeMessageRenderCache: (component: any, width: number, lines: string[]) => string[];
	clearMessageRenderCache: (component: any) => void;
	replaceHiddenThinkingPlaceholders: (container: any, message: any) => void;
	hiddenThinkingLabelEnabled: () => boolean;
	workedMetadataForMessage: (message: any) => any;
	workedDurationText: (duration: number, sessionTotal: number | undefined, turns: number) => string;
	hasWorkedDurationLine: (message: any) => boolean;
	getSessionStartMs: () => number | undefined;
	getUserTurnCount: () => number;
	maybeMergeConsecutiveThinkingMessages: (parent: any) => void;
	DottedParagraph: new (text: string, theme: any, options?: MarkdownOptions) => any;
	ThinkingParagraph: new (text: string, theme: any, style?: any, options?: MarkdownOptions) => any;
}

export function patchAssistantMessages(deps: AssistantMessagePatchDependencies): void {
	const proto = AssistantMessageComponent.prototype as any;
	if (proto[deps.patchFlag]) return;
	const originalRender = proto.render;
	if (typeof originalRender === "function" && !proto[deps.renderPatchFlag]) {
		proto.render = function patchedAssistantMessageRender(width: number) {
			const cached = deps.messageRenderCacheHit(this, width);
			if (cached) return cached;
			deps.visitMarkdownDescendants(this, (child) => {
				if (typeof child.text === "string") {
					const stripped = deps.stripTransientMagicContextTags(child.text);
					if (stripped !== child.text) { child.text = stripped; child.invalidate?.(); }
				}
			});
			const lines = originalRender.call(this, width);
			if (!Array.isArray(lines) || lines.length === 0) return lines;
			if (this.hasToolCalls) return deps.storeMessageRenderCache(this, width, lines);
			return deps.storeMessageRenderCache(this, width, deps.applyTerminalCopyZones(lines));
		};
		proto[deps.renderPatchFlag] = true;
	}
	const originalUpdateContent = proto.updateContent;
	const renderContent = function patchedUpdateContent(this: any, message: any, isStreaming?: boolean) {
		deps.clearMessageRenderCache(this);
		if (!(this as any)[deps.workedStartKey]) (this as any)[deps.workedStartKey] = Date.now();
		if (!message || !Array.isArray(message.content)) {
			return originalUpdateContent.call(this, message, isStreaming);
		}
		const liveMode = deps.getThinkingMode() !== "full";
		const thinkingCollapsed = !!this.hideThinkingBlock;
		const override = this.thinkingVisibilityOverrides?.get?.(0);
		const showLiveThinking = liveMode && thinkingCollapsed && override !== true
			&& deps.isLiveThinkingMessage(this, message);
		const hideThinking = override ?? (thinkingCollapsed && !showLiveThinking);
		if (hideThinking && deps.messageHasThinkingContent(message) && deps.hiddenThinkingLabelEnabled()) {
			this.hiddenThinkingLabel = "Thinking...";
		}
		if (showLiveThinking) this.hideThinkingBlock = false;
		try {
			originalUpdateContent.call(this, message, isStreaming);
		} finally {
			if (showLiveThinking) this.hideThinkingBlock = true;
		}
		const container = this.contentContainer;
		if (!container?.children) return;
		if (hideThinking && deps.messageHasThinkingContent(message)) {
			deps.replaceHiddenThinkingPlaceholders(container, message);
		}
		const mdTheme = this.markdownTheme;
		for (let i = container.children.length - 1; i >= 0; i--) {
			const child = container.children[i];
			const inner = child?.child ?? child;
			if (!deps.isMarkdownComponent(inner)) continue;
			const text = inner.text;
			if (!text) continue;
			const options = inner.options as MarkdownOptions;
			const isThinking = !!inner.defaultTextStyle?.italic;
			const replacement = isThinking
				? new deps.ThinkingParagraph(text, mdTheme, inner.defaultTextStyle, options)
				: new deps.DottedParagraph(text, mdTheme, options);
			if (child?.child !== undefined) child.child = replacement;
			else container.children[i] = replacement;
		}
		const workedMetadata = deps.workedMetadataForMessage(message);
		const explicitDuration = workedMetadata?.duration;
		const workedDuration = typeof explicitDuration === "number" ? explicitDuration : undefined;
		const workedSessionTotal = typeof workedMetadata?.sessionTotal === "number"
			? workedMetadata.sessionTotal
			: typeof deps.getSessionStartMs() === "number"
				? Date.now() - (deps.getSessionStartMs() as number)
				: undefined;
		const workedTurns = typeof workedMetadata?.turns === "number" ? workedMetadata.turns : deps.getUserTurnCount();
		const hasAssistantText = message.content.some((block: any) => block?.type === "text"
			&& typeof block.text === "string" && block.text.trim());
		if (typeof workedDuration === "number" && message.stopReason === "stop"
			&& hasAssistantText && !deps.hasWorkedDurationLine(message)) {
			container.children.push(new Spacer(1),
				new Text(deps.workedDurationText(workedDuration, workedSessionTotal, workedTurns), 1, 0));
		}
		if (this[deps.componentParentKey]) {
			deps.maybeMergeConsecutiveThinkingMessages(this[deps.componentParentKey]);
		}
	};
	proto.updateContent = function patchedUpdateContentSuperseded(this: any, message: any, isStreaming?: boolean) {
		if (!deps.hidesSupersededThinking(this, message)) return renderContent.call(this, message, isStreaming);
		const withoutThinking = { ...message, content: message.content.filter((block: any) => block?.type !== "thinking") };
		const worked = deps.workedDurationByMessage.get(message);
		if (worked) deps.workedDurationByMessage.set(withoutThinking, worked);
		try {
			return renderContent.call(this, withoutThinking, isStreaming);
		} finally {
			this.lastMessage = message;
		}
	};
	proto[deps.patchFlag] = true;
}
