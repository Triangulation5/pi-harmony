import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";

export const THINKING_DURATION_KEY = "_piClaudeStyleThinkingDurationMs";
export const THINKING_ACTIVE_KEY = "_piClaudeStyleThinkingActive";
export const WORKED_DURATION_KEY = "_piClaudeStyleWorkedDurationMs";
export const WORKED_START_KEY = "_piClaudeStyleWorkedStartMs";
export const WORKED_SESSION_TOTAL_KEY = "_piClaudeStyleWorkedSessionTotalMs";
export const WORKED_TURNS_KEY = "_piClaudeStyleWorkedTurns";

const MAX_REASONABLE_THINKING_DURATION_MS = 24 * 60 * 60 * 1000;

export interface ThinkingLabelDependencies {
	applyThemePaletteIfNeeded: (theme: Theme) => void;
}

export interface ThinkingLabelState {
	THINKING_DURATION_KEY: typeof THINKING_DURATION_KEY;
	WORKED_START_KEY: typeof WORKED_START_KEY;
	workedDurationByMessage: WeakMap<object, { duration: number; sessionTotal?: number; turns?: number }>;
	getThinkingDurationMetadata: (message: any) => number | undefined;
	hasThinkingActiveMetadata: (message: any) => boolean;
	isAssistantMessageStreaming: (message: any) => boolean;
	workedMetadataForMessage: (message: any) => { duration: number; sessionTotal?: number; turns?: number } | undefined;
	getSessionStartMs: () => number | undefined;
	getUserTurnCount: () => number;
	isAgentWorkActive: () => boolean;
	register: (pi: ExtensionAPI) => void;
}

export function createThinkingLabels(deps: ThinkingLabelDependencies): ThinkingLabelState {
	let thinkingBlockStartMs = 0;
	let thinkingBlockInFlight = false;
	let currentAgentWorkStartMs: number | undefined;
	let currentAssistantMessageStartMs: number | undefined;
	let sessionStartMs: number | undefined;
	let userTurnCount = 0;

	const thinkingDurationByMessage = new WeakMap<object, number>();
	const thinkingActiveMessages = new WeakSet<object>();
	const streamingAssistantContents = new WeakSet<object>();
	const workedStartByMessage = new WeakMap<object, number>();
	const workedDurationByMessage = new WeakMap<object, { duration: number; sessionTotal?: number; turns?: number }>();

	function thinkingStateKey(message: object): object {
		const content = (message as any).content;
		return Array.isArray(content) ? content : message;
	}

	function getThinkingDurationMetadata(message: any): number | undefined {
		if (!message || typeof message !== "object") return undefined;
		const stored = thinkingDurationByMessage.get(thinkingStateKey(message)) ?? message[THINKING_DURATION_KEY];
		return typeof stored === "number"
			&& Number.isFinite(stored)
			&& stored > 0
			&& stored <= MAX_REASONABLE_THINKING_DURATION_MS
			? stored
			: undefined;
	}

	function hasThinkingActiveMetadata(message: any): boolean {
		return !!message
			&& typeof message === "object"
			&& (thinkingActiveMessages.has(thinkingStateKey(message)) || message[THINKING_ACTIVE_KEY] === true);
	}

	function isAssistantMessageStreaming(message: any): boolean {
		return !!message && typeof message === "object" && streamingAssistantContents.has(thinkingStateKey(message));
	}

	function workedMetadataForMessage(message: any): { duration: number; sessionTotal?: number; turns?: number } | undefined {
		if (!message || typeof message !== "object") return undefined;
		const metadata = workedDurationByMessage.get(message);
		if (metadata) return metadata;
		const duration = message[WORKED_DURATION_KEY];
		if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) return undefined;
		const sessionTotal = message[WORKED_SESSION_TOTAL_KEY];
		const turns = message[WORKED_TURNS_KEY];
		return {
			duration,
			sessionTotal: typeof sessionTotal === "number" ? sessionTotal : undefined,
			turns: typeof turns === "number" ? turns : undefined,
		};
	}

	function trackThinkingBlockEvents(event: any, ctx?: any): void {
		const evt = event?.assistantMessageEvent;
		const message = event?.message;
		if (!evt || typeof evt.type !== "string") return;
		function refreshThinkingChrome(): void {
			try {
				ctx?.ui?.invalidate?.();
				ctx?.ui?.requestRender?.();
			} catch { /* noop */ }
			setTimeout(() => {
				try {
					ctx?.ui?.invalidate?.();
					ctx?.ui?.requestRender?.();
				} catch { /* noop */ }
			}, 0);
		}

		if (evt.type === "thinking_start") {
			thinkingBlockInFlight = true;
			thinkingBlockStartMs = Date.now();
			if (message?.role === "assistant") {
				thinkingActiveMessages.add(thinkingStateKey(message));
				thinkingDurationByMessage.delete(thinkingStateKey(message));
			}
			refreshThinkingChrome();
			return;
		}
		if (evt.type === "thinking_end") {
			thinkingBlockInFlight = false;
			const duration = thinkingBlockStartMs > 0
				? Math.max(0, Date.now() - thinkingBlockStartMs)
				: undefined;
			if (message?.role === "assistant") thinkingActiveMessages.delete(thinkingStateKey(message));
			if (typeof duration === "number" && duration <= MAX_REASONABLE_THINKING_DURATION_MS && message?.role === "assistant") {
				thinkingDurationByMessage.set(thinkingStateKey(message), duration);
			}
			thinkingBlockStartMs = 0;
			refreshThinkingChrome();
			return;
		}
		if (hasThinkingActiveMetadata(message) || thinkingBlockInFlight) {
			if (evt.type === "text_start" || evt.type === "text_delta" || evt.type === "toolcall_start" || evt.type === "toolcall_end") {
				thinkingBlockInFlight = false;
				const duration = thinkingBlockStartMs > 0 ? Math.max(0, Date.now() - thinkingBlockStartMs) : undefined;
				if (message?.role === "assistant") thinkingActiveMessages.delete(thinkingStateKey(message));
				if (typeof duration === "number" && duration <= MAX_REASONABLE_THINKING_DURATION_MS && message?.role === "assistant") {
					thinkingDurationByMessage.set(thinkingStateKey(message), duration);
				}
				thinkingBlockStartMs = 0;
				refreshThinkingChrome();
			}
		}
	}

	function register(pi: ExtensionAPI): void {
		const patchMessage = (event: any, theme?: Theme) => {
			if (theme) deps.applyThemePaletteIfNeeded(theme);
			const message = event?.message;
			if (!message || message.role !== "assistant" || !Array.isArray(message.content)) return;
		};
		pi.on("before_agent_start", async () => {
			if (currentAgentWorkStartMs === undefined) currentAgentWorkStartMs = Date.now();
			if (sessionStartMs === undefined) sessionStartMs = Date.now();
			currentAssistantMessageStartMs = undefined;
		});
		pi.on("agent_start", async () => {
			if (currentAgentWorkStartMs === undefined) currentAgentWorkStartMs = Date.now();
			if (sessionStartMs === undefined) sessionStartMs = Date.now();
			currentAssistantMessageStartMs = undefined;
		});
		pi.on("message_start", async (event: any) => {
			const message = event?.message;
			if (message?.role === "user" && currentAgentWorkStartMs === undefined) currentAgentWorkStartMs = Date.now();
			if (message?.role === "assistant") {
				currentAssistantMessageStartMs = Date.now();
				workedStartByMessage.set(message, currentAssistantMessageStartMs);
				thinkingBlockInFlight = false;
				thinkingBlockStartMs = 0;
				thinkingActiveMessages.delete(thinkingStateKey(message));
				streamingAssistantContents.add(thinkingStateKey(message));
			}
		});
		pi.on("message_update", async (event, ctx) => {
			trackThinkingBlockEvents(event, ctx);
			patchMessage(event, ctx.ui?.theme);
		});
		pi.on("message_end", async (event, ctx) => {
			const message = (event as any)?.message;
			if (message?.role === "assistant") {
				thinkingBlockInFlight = false;
				thinkingActiveMessages.delete(thinkingStateKey(message));
				streamingAssistantContents.delete(thinkingStateKey(message));
				if (getThinkingDurationMetadata(message) === undefined && thinkingBlockStartMs > 0) {
					const duration = Math.max(0, Date.now() - thinkingBlockStartMs);
					if (duration <= MAX_REASONABLE_THINKING_DURATION_MS) thinkingDurationByMessage.set(thinkingStateKey(message), duration);
				}
				thinkingBlockStartMs = 0;
				const started = typeof currentAgentWorkStartMs === "number"
					? currentAgentWorkStartMs
					: workedStartByMessage.get(message)
						?? (typeof (message as any)[WORKED_START_KEY] === "number" ? (message as any)[WORKED_START_KEY] : currentAssistantMessageStartMs);
				const isFinalAssistantMessage = message.stopReason === "stop";
				if (started !== undefined && isFinalAssistantMessage) {
					const durationMs = Date.now() - started;
					const sessionTotalMs = typeof sessionStartMs === "number" ? Date.now() - sessionStartMs : undefined;
					const turns = userTurnCount > 0 ? userTurnCount : undefined;
					workedDurationByMessage.set(message, { duration: durationMs, sessionTotal: sessionTotalMs, turns });
				}
				currentAssistantMessageStartMs = undefined;
			}
			patchMessage(event, ctx.ui?.theme);
			try {
				(ctx as any)?.ui?.invalidate?.();
				(ctx as any)?.ui?.requestRender?.();
			} catch { /* noop */ }
		});
		pi.on("agent_end", async () => {
			currentAgentWorkStartMs = undefined;
			currentAssistantMessageStartMs = undefined;
		});
		pi.on("session_start", async () => {
			currentAgentWorkStartMs = undefined;
			currentAssistantMessageStartMs = undefined;
			sessionStartMs = undefined;
			userTurnCount = 0;
		});
		pi.on("context", async (event) => {
			const messages = (event as any)?.messages;
			if (!Array.isArray(messages)) return;
			let earliest: number | undefined;
			let userCount = 0;
			for (const msg of messages) {
				if (!msg) continue;
				if (msg.role === "user") userCount++;
				if (typeof msg.timestamp === "number" && Number.isFinite(msg.timestamp)) {
					if (earliest === undefined || msg.timestamp < earliest) earliest = msg.timestamp;
				}
			}
			if (earliest !== undefined) {
				sessionStartMs = sessionStartMs === undefined ? earliest : Math.min(sessionStartMs, earliest);
			}
			if (userCount > userTurnCount) userTurnCount = userCount;
		});
	}

	return {
		THINKING_DURATION_KEY,
		WORKED_START_KEY,
		workedDurationByMessage,
		getThinkingDurationMetadata,
		hasThinkingActiveMetadata,
		isAssistantMessageStreaming,
		workedMetadataForMessage,
		getSessionStartMs: () => sessionStartMs,
		getUserTurnCount: () => userTurnCount,
		isAgentWorkActive: () => currentAgentWorkStartMs !== undefined,
		register,
	};
}
