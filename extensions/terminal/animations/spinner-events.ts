import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SpinnerRuntime } from "./spinner-runtime.ts";
import { applyThemeColors, RESET, getStatusDim } from "./spinner-settings.ts";
import { formatDuration, messageOutputTokens, contentBlockLength } from "./spinner-activity.ts";
import { getTipEligibilityOverride, SPINNER_TIP_OCCASIONAL_CHANCE } from "./spinner-tips.ts";
import { pickVerb } from "./spinner-verbs.ts";
import { herdrEnabled, isRootSession, markIdle, markWorking, reportSession, publishState, setRootSession, updateSessionRef } from "./spinner-herdr.ts";
import { unrefTimer } from "./spinner-loader.ts";

export function registerSpinnerEvents(pi: ExtensionAPI, runtime: SpinnerRuntime): void {
	pi.on("session_start", async (event, ctx) => {
		if (!herdrEnabled() || ctx?.hasUI !== true) return;
		setRootSession(true);
		updateSessionRef(ctx);
		const working = ctx?.isIdle?.() === false;
		void reportSession((event as any)?.reason).catch(() => {}).then(() => publishState(working ? "working" : "idle", true));
	});

	pi.on("before_agent_start", async () => runtime.beginRun());
	pi.on("agent_start", async (_event, ctx) => {
		runtime.beginRun();
		markWorking(ctx);
	});

	pi.on("turn_start", async (_event, ctx) => {
		runtime.activeTurnId++;
		runtime.turnActive = true;
		runtime.activeCtx = ctx;
		applyThemeColors(ctx.ui?.theme);
		runtime.turnStartTime = Date.now();
		runtime.beginRun(runtime.turnStartTime);
		runtime.setTurn({
			turnStartTime: runtime.turnStartTime,
			turnActive: true,
			activeTurnId: runtime.activeTurnId,
			activeCtx: ctx,
			currentVerb: pickVerb(),
		});
		const override = getTipEligibilityOverride();
		runtime.setTurn({
			tipEligible: override !== null
				? override
				: (!runtime.agentStartTime || runtime.activeTurnId === 1)
					? Math.random() < SPINNER_TIP_OCCASIONAL_CHANCE
					: runtime.getCurrentTipState().tipTurnEligible,
		});
		runtime.setCurrentTip("", 0);
		runtime.startTextAnimator();
		runtime.resetStreamed();
		runtime.clearCompletionTimer();
		if (typeof runtime.thinkingStatus !== "number" || Date.now() - runtime.thoughtForSetAt >= 3500) {
			runtime.setThinking(null);
			runtime.clearThoughtStatusTimer();
		} else runtime.scheduleThoughtStatusClear();
		runtime.startRefreshLoop();
		markWorking(ctx);
	});

	pi.on("message_update", async (event, ctx) => {
		runtime.activeCtx = ctx;
		applyThemeColors(ctx.ui?.theme);
		const evt = event.assistantMessageEvent;
		let statusChanged = false;
		const previous = runtime.outputTokenCount();
		if (evt.type === "start") runtime.resetStreamed();
		else if (evt.type === "text_start" || evt.type === "thinking_start" || evt.type === "toolcall_start") {
			runtime.setStreamedBlockLength(evt.contentIndex, 0);
		} else if (evt.type === "text_delta" || evt.type === "thinking_delta" || evt.type === "toolcall_delta") {
			const old = runtime.getStreamedBlockLength(evt.contentIndex);
			runtime.setStreamedBlockLength(evt.contentIndex, old + (typeof evt.delta === "string" ? evt.delta.length : 0));
		} else if (evt.type === "text_end" || evt.type === "thinking_end") {
			runtime.setStreamedBlockLength(evt.contentIndex, typeof evt.content === "string" ? evt.content.length : 0);
		} else if (evt.type === "toolcall_end") {
			runtime.setStreamedBlockLength(evt.contentIndex, contentBlockLength({ type: "toolCall", arguments: evt.toolCall?.arguments }));
		}
		if (evt.type === "thinking_start") {
			runtime.clearThoughtStatusTimer();
			runtime.setThinking("thinking", Date.now());
			statusChanged = true;
		}
		if (evt.type === "thinking_end") {
			runtime.onThinkingEnd();
			statusChanged = true;
		}
		if (statusChanged) {
			runtime.syncWorkingMessage(true);
			runtime.rescheduleRefreshLoop();
			runtime.animateTokens();
			const timer = setTimeout(() => runtime.syncWorkingMessage(true), 0);
			unrefTimer(timer);
			return;
		}
		if (previous === 0 && runtime.outputTokenCount() > 0) runtime.rescheduleRefreshLoop();
		runtime.animateTokens();
	});

	pi.on("message_end", async (event: any) => {
		if (event?.message?.role !== "assistant") return;
		runtime.addRunOutputTokens(messageOutputTokens(event.message));
		runtime.resetStreamed();
		if (runtime.turnActive) runtime.syncWorkingMessage();
		runtime.animateTokens();
	});

	pi.on("tool_execution_start", async (event: any, ctx) => {
		if (typeof event?.toolCallId !== "string") return;
		runtime.activeCtx = ctx;
		runtime.runningTools.set(event.toolCallId, { name: String(event.toolName ?? ""), args: event.args });
		runtime.setToolActive(true);
		if (runtime.turnActive) runtime.syncWorkingMessage(true);
	});
	pi.on("tool_execution_end", async (event: any, ctx) => {
		if (typeof event?.toolCallId !== "string" || !runtime.runningTools.delete(event.toolCallId)) return;
		runtime.activeCtx = ctx;
		if (runtime.runningTools.size === 0) runtime.setToolActive(false);
		if (runtime.turnActive) runtime.syncWorkingMessage(true);
	});

	pi.on("turn_end", async (_event, ctx) => {
		runtime.turnActive = false;
		runtime.clearTip();
		runtime.activeCtx = ctx;
		applyThemeColors(ctx.ui?.theme);
		const turnId = runtime.activeTurnId;
		const elapsed = Date.now() - (runtime.agentStartTime || runtime.turnStartTime);
		runtime.stopRefreshLoop();
		runtime.clearCompletionTimer();
		runtime.stopTextAnimator();
		if (typeof runtime.thinkingStatus === "number" && runtime.thoughtForSetAt && Date.now() - runtime.thoughtForSetAt >= 3500) {
			runtime.setThinking(null);
			runtime.clearThoughtStatusTimer();
		}
		try {
			if (runtime.activeCtx?.hasUI) {
				const message = `${getStatusDim()}✻ Turn took ${formatDuration(elapsed)}${RESET}`;
				runtime.setLastWorkingMessage(message);
				try { runtime.activeCtx.ui.setWorkingMessage(message); } catch { /* noop */ }
				runtime.setCompletionTimer(() => {
					if (runtime.activeTurnId !== turnId) return;
					runtime.restoreDefaultWorkingMessage();
				}, 2500);
			} else if (typeof runtime.thinkingStatus !== "number") runtime.restoreDefaultWorkingMessage();
		} catch { return; }
		runtime.resetStreamed();
	});

	pi.on("agent_end", async () => {
		runtime.turnActive = false;
		runtime.agentStartTime = 0;
		runtime.clearTip();
		runtime.runningTools.clear();
		if (runtime.getCompletionTimer()) return;
		runtime.clearDisplay();
	});

	(pi as ExtensionAPI & {
		on(event: "agent_settled", handler: (event: unknown, ctx: any) => void | Promise<void>): void;
	}).on("agent_settled", async (_event, ctx) => {
		if (!isRootSession() || !herdrEnabled()) return;
		if (ctx?.isIdle?.() !== true) return;
		markIdle(ctx);
	});

	pi.on("session_shutdown", async () => {
		runtime.turnActive = false;
		runtime.runningTools.clear();
		runtime.clearDisplay();
		markIdle(undefined, true);
		setRootSession(false);
		runtime.activeCtx = null;
	});
}
