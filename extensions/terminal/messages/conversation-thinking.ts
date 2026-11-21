import type { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";

export const SUPERSEDED_ASSISTANT_KEY = Symbol.for("pi-claude-style-tools:superseded-assistant");
export const ADD_SEQUENCE_KEY = Symbol.for("pi-claude-style-tools:add-seq");

export interface ConversationThinkingDependencies {
	AssistantMessageComponent: typeof AssistantMessageComponent;
	ToolGroupComponent: new () => any;
	getThinkingMode: () => "full" | "live" | "latest";
	thinkingDurationKey: string | symbol;
	toolGroupingEnabled: () => boolean;
	getMessageThinkingDurationMs: (message: any) => number;
	hasThinkingActiveMetadata: (message: any) => boolean;
	isSpacerComponent: (component: any) => boolean;
	isToolGroupComponent: (component: any) => boolean;
	isGroupableTool: (component: any) => boolean;
	isIgnorableToolSeparator: (component: any) => boolean;
	findPreviousToolSibling: (children: any[], index: number) => { child: any; index: number } | undefined;
	messageHasThinkingContent: (message: any) => boolean;
	componentParentKey: symbol;
	maybeGroupToolComponent: (parent: any, component: any) => void;
}

export function createConversationThinking(deps: ConversationThinkingDependencies) {
	const chatContainers = new Set<any>();
	let addSequence = 0;

	function isAssistantMessageComponent(value: unknown): boolean {
		return value instanceof deps.AssistantMessageComponent
			|| (value as any)?.constructor?.name === "AssistantMessageComponent";
	}

	function isThinkingOnlyAssistantComponent(comp: unknown): comp is InstanceType<typeof AssistantMessageComponent> {
		if (!comp || ((comp as any).constructor?.name !== "AssistantMessageComponent"
			&& !(comp instanceof deps.AssistantMessageComponent))) return false;
		const msg = (comp as any).lastMessage;
		if (!msg || msg.role !== "assistant" || !Array.isArray(msg.content)) return false;
		const hasThinking = msg.content.some((c: any) => c?.type === "thinking"
			&& typeof c?.thinking === "string" && c.thinking.trim());
		if (!hasThinking) return false;
		const hasText = msg.content.some((c: any) => c?.type === "text"
			&& typeof c?.text === "string" && c.text.trim());
		if (hasText) return false;
		if (msg.content.some((c: any) => c?.type === "toolCall")) return false;
		if ((comp as any).isStreaming === true || deps.hasThinkingActiveMetadata(msg)) return false;
		return true;
	}

	function maybeMergeConsecutiveThinkingMessages(parent: any): void {
		const children = parent?.children;
		if (!Array.isArray(children) || children.length < 2) return;
		for (let i = 0; i < children.length; i++) {
			const current = children[i];
			if (!isThinkingOnlyAssistantComponent(current)) continue;
			let nextIdx = i + 1;
			while (nextIdx < children.length && deps.isSpacerComponent(children[nextIdx])) nextIdx++;
			if (nextIdx >= children.length) break;
			const nextComp = children[nextIdx];
			if (!isThinkingOnlyAssistantComponent(nextComp)) continue;
			const curMsg = (current as any).lastMessage;
			const nextMsg = (nextComp as any).lastMessage;
			const mergedDuration = deps.getMessageThinkingDurationMs(curMsg)
				+ deps.getMessageThinkingDurationMs(nextMsg);
			const mergedMessage = {
				...curMsg,
				content: [...curMsg.content, ...nextMsg.content.filter((c: any) => c?.type === "thinking")],
				[deps.thinkingDurationKey]: mergedDuration,
			};
			(current as any).updateContent(mergedMessage);
			const removeCount = nextIdx - i;
			children.splice(i + 1, removeCount);
			i--;
		}
	}

	function mergeToolRowsAcross(parent: any, separator: any): void {
		const children = parent?.children;
		if (!deps.toolGroupingEnabled() || !Array.isArray(children)) return;
		const index = children.indexOf(separator);
		if (index < 0 || !deps.isIgnorableToolSeparator(separator)) return;
		const previousEntry = deps.findPreviousToolSibling(children, index - 1);
		let nextIndex = index + 1;
		while (nextIndex < children.length && deps.isIgnorableToolSeparator(children[nextIndex])) nextIndex++;
		if (!previousEntry || nextIndex >= children.length) return;
		const previous = previousEntry.child;
		const next = children[nextIndex];
		const groupable = (value: any) => deps.isToolGroupComponent(value) || deps.isGroupableTool(value);
		if (!groupable(previous) || !groupable(next)) return;
		const incoming: any[] = deps.isToolGroupComponent(next) ? next.releaseTools() : [next];
		let group: any = previous;
		if (!deps.isToolGroupComponent(previous)) {
			group = new deps.ToolGroupComponent();
			group.addTool(previous);
			group[deps.componentParentKey] = parent;
			children[previousEntry.index] = group;
		}
		group.expanded = group.expanded === true || incoming.some((tool) => tool?.expanded === true);
		for (const tool of incoming) group.addTool(tool);
		children.splice(nextIndex, 1);
	}

	function supersedeEarlierAssistantMessages(parent: any, latest: any): void {
		const children = parent?.children;
		if (!Array.isArray(children)) return;
		chatContainers.add(parent);
		const superseded: any[] = [];
		for (let i = children.indexOf(latest) - 1; i >= 0; i--) {
			const child = children[i];
			if (!isAssistantMessageComponent(child)) continue;
			if (child[SUPERSEDED_ASSISTANT_KEY]) break;
			child[SUPERSEDED_ASSISTANT_KEY] = true;
			superseded.push(child);
		}
		if (deps.getThinkingMode() !== "latest") return;
		for (const message of superseded.reverse()) {
			if (!deps.messageHasThinkingContent(message.lastMessage)) continue;
			message.invalidate?.();
			mergeToolRowsAcross(parent, message);
		}
	}

	function hidesSupersededThinking(component: any, message: any): boolean {
		return deps.getThinkingMode() === "latest"
			&& component?.[SUPERSEDED_ASSISTANT_KEY] === true
			&& deps.messageHasThinkingContent(message);
	}

	function applyThinkingModeToChats(): void {
		for (const parent of chatContainers) {
			const children = parent?.children;
			if (!Array.isArray(children)) {
				chatContainers.delete(parent);
				continue;
			}
			const flat: any[] = [];
			for (const child of children) {
				if (!deps.isToolGroupComponent(child)) {
					flat.push(child);
					continue;
				}
				for (const tool of child.releaseTools()) {
					tool[deps.componentParentKey] = parent;
					flat.push(tool);
				}
			}
			let sequence = 0;
			const ordered = flat
				.map((child) => {
					const own = child?.[ADD_SEQUENCE_KEY];
					sequence = typeof own === "number" ? own : sequence + 1e-6;
					return { child, sequence };
				})
				.sort((a, b) => a.sequence - b.sequence)
				.map((entry) => entry.child);
			for (const child of ordered) {
				if (isAssistantMessageComponent(child) && deps.messageHasThinkingContent(child.lastMessage)) child.invalidate?.();
			}
			children.length = 0;
			for (const child of ordered) {
				children.push(child);
				deps.maybeGroupToolComponent(parent, child);
			}
		}
	}

	function requestChatRender(ctx: any): void {
		try {
			if (typeof ctx?.ui?.requestRender === "function") return void ctx.ui.requestRender();
		} catch { /* fall through */ }
		for (const parent of chatContainers) {
			for (const child of parent?.children ?? []) {
				const tools = deps.isToolGroupComponent(child) ? child.tools : [child];
				const ui = tools.find((tool: any) => typeof tool?.ui?.requestRender === "function")?.ui;
				if (ui) return void ui.requestRender();
			}
		}
	}

	function assignAddSequence(component: any): void {
		if (component && typeof component === "object") component[ADD_SEQUENCE_KEY] = ++addSequence;
	}

	return {
		applyThinkingModeToChats,
		assignAddSequence,
		clearChatContainers: () => chatContainers.clear(),
		hidesSupersededThinking,
		isAssistantMessageComponent,
		maybeMergeConsecutiveThinkingMessages,
		pruneChatContainers: () => {
			for (const parent of chatContainers) {
				if (!Array.isArray(parent?.children) || parent.children.length === 0) chatContainers.delete(parent);
			}
		},
		requestChatRender,
		supersedeEarlierAssistantMessages,
	};
}
