import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readMergedSettings } from "../../settings/store.ts";
import { renderShimmerText } from "./shimmer-text.ts";
import { createSpinnerTextAnimator, type SpinnerTextAnimator } from "./spinner-animation.ts";
import type { SpawnScheduler } from "./spin-dots.ts";
import {
	contentBlockLength,
	describeToolActivity,
	formatCount,
	formatDuration,
	messageOutputTokens,
} from "./spinner-activity.ts";
import { pickVerb } from "./spinner-verbs.ts";
import {
	getTipEligibilityOverride,
	pickRandomTip,
	shouldShowSpinnerTip,
	SPINNER_TIP_MIN_ELAPSED_MS,
	SPINNER_TIP_OCCASIONAL_CHANCE,
} from "./spinner-tips.ts";
import {
	applyThemeColors,
	getClaudeOrange,
	getStatusDim,
	getTipDim,
	readSpinnerSettings,
	RESET,
} from "./spinner-settings.ts";
import { unrefTimer } from "./spinner-loader.ts";

export function easeTokenCount(shown: number, target: number, elapsedMs: number): number {
	const gap = target - shown;
	if (gap === 0) return target;
	const eased = Math.abs(gap) * (1 - Math.exp(-Math.max(0, elapsedMs) / 150));
	const step = Math.max(1, Math.round(eased));
	return step >= Math.abs(gap) ? target : shown + Math.sign(gap) * step;
}

export interface SpinnerRuntime {
	pi: ExtensionAPI;
	agentStartTime: number;
	turnStartTime: number;
	turnActive: boolean;
	activeTurnId: number;
	thoughtForSetAt: number;
	activeCtx: { ui: any; hasUI: boolean } | null;
	runningTools: Map<string, { name: string; args: unknown }>;
	thinkingStatus: "thinking" | number | null;
	setTurn(values: {
		turnStartTime?: number;
		turnActive?: boolean;
		activeTurnId?: number;
		activeCtx?: { ui: any; hasUI: boolean };
		currentVerb?: string;
		tipEligible?: boolean;
	}): void;
	setThinking(status: "thinking" | number | null, startTime?: number): void;
	getCurrentTipState(): { tipTurnEligible: boolean; currentTip: string; currentTipPickedAt: number };
	addRunOutputTokens(value: number): void;
	setCompletionTimer(callback: () => void, ms: number): void;
	getCompletionTimer(): ReturnType<typeof setTimeout> | null;
	setCurrentTip(tip: string, pickedAt: number): void;
	clearTip(): void;
	setLastWorkingMessage(value: string | null): void;
	getStreamedBlockLength(index: number): number;
	setToolActive(active: boolean): void;
	beginRun(now?: number): void;
	outputTokenCount(): number;
	setStreamedBlockLength(index: number, length: number): void;
	resetStreamed(): void;
	resetShownTokens(): void;
	syncWorkingMessage(force?: boolean): void;
	rescheduleRefreshLoop(): void;
	animateTokens(): void;
	startTextAnimator(): void;
	stopTextAnimator(): void;
	clearDisplay(): void;
	onThinkingEnd(): void;
	clearCompletionTimer(): void;
	clearThoughtStatusTimer(): void;
	restoreDefaultWorkingMessage(): void;
	startRefreshLoop(): void;
	stopRefreshLoop(): void;
	scheduleThoughtStatusClear(): void;
}

export function createSpinnerRuntime(pi: ExtensionAPI): SpinnerRuntime {
	let agentStartTime = 0;
	let turnStartTime = 0;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let shownTokens = 0;
	let tokenFrameTimer: ReturnType<typeof setTimeout> | null = null;
	let completionTimer: ReturnType<typeof setTimeout> | null = null;
	let thoughtStatusTimer: ReturnType<typeof setTimeout> | null = null;
	let currentVerb = "";
	let currentTip = "";
	let currentTipPickedAt = 0;
	let tipTurnEligible = false;
	let textAnimator: SpinnerTextAnimator | null = null;
	let spinnerShimmerUntil = 0;
	let spinnerShimmerStartedAt = 0;
	let spinnerShimmerSeed = 0;
	let spinnerShimmerDelay: (() => void) | null = null;
	let spinnerShimmerFrame: (() => void) | null = null;
	let runOutputTokens = 0;
	let streamedChars = 0;
	let streamedBlockLengths: number[] = [];
	let thinkingStatus: "thinking" | number | null = null;
	let thinkingStartTime = 0;
	let thoughtForSetAt = 0;
	let activeTurnId = 0;
	let turnActive = false;
	let lastWorkingMessage: string | null = null;
	let activeCtx: { ui: any; hasUI: boolean } | null = null;
	const runningTools = new Map<string, { name: string; args: unknown }>();

	function getEffortSuffix(): string {
		try {
			const level = pi.getThinkingLevel();
			return !level || level === "off" ? "" : ` with ${level} effort`;
		} catch { return ""; }
	}

	function statusText(text: string): string {
		return `${getStatusDim()}${text}${RESET}`;
	}

	function getSpinnerVerbColor(fadeAmount: number): string {
		const amount = Math.max(0, Math.min(1, fadeAmount));
		if (amount === 0) return getClaudeOrange();
		const source = getClaudeOrange().match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/);
		const target = getStatusDim().match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/);
		if (!source || !target) return `\x1b[2m${getClaudeOrange()}`;
		const mix = (i: number) => Math.round(Number(source[i + 1]) * (1 - amount) + Number(target[i + 1]) * amount);
		return `\x1b[38;2;${mix(0)};${mix(1)};${mix(2)}m`;
	}

	function buildWorkingMessage(): string {
		const elapsed = Date.now() - (agentStartTime || turnStartTime);
		const statusParts: string[] = [];
		if (thinkingStatus === "thinking") statusParts.push(`thinking${getEffortSuffix()}`);
		else if (typeof thinkingStatus === "number") statusParts.push(`thought for ${Math.max(1, Math.round(thinkingStatus / 1000))}s`);
		if (shownTokens > 0) statusParts.push(`↓ ${formatCount(shownTokens)} tokens`);
		if (elapsed > 30_000 || thinkingStatus !== null || shownTokens > 0) statusParts.push(formatDuration(elapsed));
		const running = [...runningTools.values()];
		const latest = running[running.length - 1];
		const verb = latest
			? `${describeToolActivity(latest.name, latest.args)}${running.length > 1 ? ` (+${running.length - 1} more)` : ""}`
			: textAnimator ? textAnimator.displayedText() : currentVerb;
		const settings = readSpinnerSettings();
		const dotsSuffix = settings.dotsDisabled ? " " : textAnimator?.dotsSuffix() ?? "...";
		const verbFade = latest ? 0 : textAnimator?.fadeAmount() ?? 0;
		const now = Date.now();
		const shimmering = !latest && spinnerShimmerUntil > now && !textAnimator?.isAnimating();
		const intensity = Math.min(1, (spinnerShimmerUntil - now) / 750);
		const shimmerSettings = shimmering ? readSpinnerSettings() : undefined;
		let message = shimmering
			? `${renderShimmerText(verb, getClaudeOrange(), spinnerShimmerSeed, false, now, {
				direction: shimmerSettings?.shimmerDirection,
				color: shimmerSettings?.shimmerColor,
				style: shimmerSettings?.shimmerStyle,
				elapsedMs: now - spinnerShimmerStartedAt,
				intensity: shimmerSettings?.shimmerStyle === "flash" ? 1 : intensity,
			})}${getClaudeOrange()}${dotsSuffix}${RESET}`
			: `${getSpinnerVerbColor(verbFade)}${verb}${dotsSuffix}${RESET}`;
		if (statusParts.length > 0) message += statusText(`${settings.dotsDisabled ? "" : " "}(${statusParts.join(" · ")})`);
		if (shouldShowSpinnerTip({ tipsEnabled: settings.tips, elapsedMs: elapsed, isEligible: tipTurnEligible })) {
			if (!currentTip) {
				currentTip = pickRandomTip(undefined, pi);
				currentTipPickedAt = now;
			} else if (now - currentTipPickedAt >= 20_000) {
				currentTip = pickRandomTip(currentTip, pi);
				currentTipPickedAt = now;
			}
			if (currentTip) message += `\n  ${getTipDim()}└ Tip: ${currentTip}${RESET}`;
		}
		return message;
	}

	function outputTokenCount(): number { return runOutputTokens + Math.round(streamedChars / 4); }
	function resetStreamed(): void { streamedBlockLengths = []; streamedChars = 0; }
	function setStreamedBlockLength(index: number, length: number): void {
		const previous = streamedBlockLengths[index] ?? 0;
		streamedBlockLengths[index] = Math.max(0, length);
		streamedChars = Math.max(0, streamedChars + streamedBlockLengths[index] - previous);
	}
	function stopTokenAnimation(): void {
		if (tokenFrameTimer) { clearTimeout(tokenFrameTimer); tokenFrameTimer = null; }
	}
	function resetShownTokens(): void { stopTokenAnimation(); shownTokens = 0; }
	function beginRun(now = Date.now()): void {
		if (agentStartTime) return;
		agentStartTime = now;
		runOutputTokens = 0;
		resetStreamed();
		resetShownTokens();
		const override = getTipEligibilityOverride();
		tipTurnEligible = override !== null ? override : Math.random() < SPINNER_TIP_OCCASIONAL_CHANCE;
		currentTip = "";
		currentTipPickedAt = 0;
	}

	function animateTokens(): void {
		if (tokenFrameTimer || !turnActive || shownTokens === outputTokenCount()) return;
		const scheduledAt = Date.now();
		tokenFrameTimer = setTimeout(() => {
			tokenFrameTimer = null;
			shownTokens = easeTokenCount(shownTokens, outputTokenCount(), Date.now() - scheduledAt);
			syncWorkingMessage();
			animateTokens();
		}, 125);
		unrefTimer(tokenFrameTimer);
	}

	function syncWorkingMessage(force = false): void {
		try { if (!activeCtx?.hasUI) return; } catch { return; }
		applyThemeColors(activeCtx.ui?.theme);
		const settings = readSpinnerSettings();
		textAnimator?.setDotsVisible(!settings.dotsDisabled);
		textAnimator?.setDotsEnabled(settings.animatedDots);
		const next = buildWorkingMessage();
		if (!force && next === lastWorkingMessage) return;
		lastWorkingMessage = next;
		try { activeCtx.ui.setWorkingMessage(next); } catch { /* noop */ }
	}

	function restoreDefaultWorkingMessage(): void {
		lastWorkingMessage = null;
		try { if (!activeCtx?.hasUI) return; } catch { return; }
		try { activeCtx.ui.setWorkingMessage(); } catch { /* noop */ }
	}

	function getWorkingMessageIntervalMs(): number {
		const elapsed = Date.now() - (agentStartTime || turnStartTime);
		const count = outputTokenCount();
		if (tipTurnEligible && elapsed < SPINNER_TIP_MIN_ELAPSED_MS) {
			return Math.max(250, Math.min(1000, SPINNER_TIP_MIN_ELAPSED_MS - elapsed + 1));
		}
		if (thinkingStatus === null && count === 0 && elapsed <= 30_000) {
			return Math.max(250, Math.min(1000, 30_000 - elapsed + 1));
		}
		return Math.max(250, 1000 - (elapsed % 1000));
	}

	function scheduleRefreshTick(): void {
		if (!turnActive || refreshTimer) return;
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			syncWorkingMessage();
			scheduleRefreshTick();
		}, getWorkingMessageIntervalMs());
		unrefTimer(refreshTimer);
	}

	function stopRefreshLoop(): void {
		if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
		stopTokenAnimation();
	}
	function startRefreshLoop(): void {
		stopRefreshLoop();
		syncWorkingMessage(true);
		scheduleRefreshTick();
		animateTokens();
	}
	function rescheduleRefreshLoop(): void {
		if (!turnActive) return;
		stopRefreshLoop();
		scheduleRefreshTick();
		animateTokens();
	}
	function clearCompletionTimer(): void {
		if (completionTimer) { clearTimeout(completionTimer); completionTimer = null; }
	}

	const scheduleAnimation: SpawnScheduler = (delay, fire) => {
		const timer = setTimeout(fire, delay);
		unrefTimer(timer);
		return () => clearTimeout(timer);
	};

	function scheduleSpinnerShimmer(delayMs?: number): void {
		if (!turnActive || !textAnimator || spinnerShimmerDelay || spinnerShimmerFrame) return;
		const delay = delayMs ?? 22_000 + Math.random() * 16_000;
		spinnerShimmerDelay = scheduleAnimation(delay, () => {
			spinnerShimmerDelay = null;
			if (!turnActive || !textAnimator) return;
			if (runningTools.size > 0 || textAnimator.isAnimating()) {
				scheduleSpinnerShimmer(3000);
				return;
			}
			spinnerShimmerSeed = Math.floor(Math.random() * 4000);
			spinnerShimmerStartedAt = Date.now();
			spinnerShimmerUntil = spinnerShimmerStartedAt + 4200;
			syncWorkingMessage(true);
			scheduleSpinnerShimmerFrame();
		});
	}

	function scheduleSpinnerShimmerFrame(): void {
		if (!turnActive || !textAnimator || !spinnerShimmerUntil || spinnerShimmerFrame) return;
		spinnerShimmerFrame = scheduleAnimation(100, () => {
			spinnerShimmerFrame = null;
			if (!turnActive || !textAnimator) { spinnerShimmerUntil = 0; return; }
			if (Date.now() >= spinnerShimmerUntil || runningTools.size > 0 || textAnimator.isAnimating()) {
				spinnerShimmerUntil = 0;
				syncWorkingMessage(true);
				scheduleSpinnerShimmer();
				return;
			}
			syncWorkingMessage();
			scheduleSpinnerShimmerFrame();
		});
	}
	function stopSpinnerShimmer(): void {
		spinnerShimmerDelay?.();
		spinnerShimmerDelay = null;
		spinnerShimmerFrame?.();
		spinnerShimmerFrame = null;
		spinnerShimmerUntil = 0;
		spinnerShimmerStartedAt = 0;
	}
	function startTextAnimator(): void {
		stopTextAnimator();
		const settings = readSpinnerSettings();
		textAnimator = createSpinnerTextAnimator({
			schedule: scheduleAnimation,
			pickVerb,
			animatedDots: settings.animatedDots,
			dotsVisible: !settings.dotsDisabled,
			onChange: () => { if (turnActive) syncWorkingMessage(); },
		});
		textAnimator.setToolActive(runningTools.size > 0);
		textAnimator.start(currentVerb);
		scheduleSpinnerShimmer();
	}
	function stopTextAnimator(): void {
		stopSpinnerShimmer();
		if (!textAnimator) return;
		textAnimator.stop();
		textAnimator = null;
	}

	function clearThoughtStatusTimer(): void {
		if (thoughtStatusTimer) { clearTimeout(thoughtStatusTimer); thoughtStatusTimer = null; }
	}
	function scheduleThoughtStatusClear(): void {
		clearThoughtStatusTimer();
		if (typeof thinkingStatus !== "number") return;
		const remaining = 3500 - (Date.now() - thoughtForSetAt);
		if (remaining <= 0) {
			thinkingStatus = null;
			if (turnActive) syncWorkingMessage(true);
			else if (!completionTimer) restoreDefaultWorkingMessage();
			return;
		}
		thoughtStatusTimer = setTimeout(() => {
			thoughtStatusTimer = null;
			if (typeof thinkingStatus !== "number") return;
			if (Date.now() - thoughtForSetAt < 3500) { scheduleThoughtStatusClear(); return; }
			thinkingStatus = null;
			if (turnActive) syncWorkingMessage(true);
			else if (!completionTimer) restoreDefaultWorkingMessage();
		}, remaining);
		unrefTimer(thoughtStatusTimer);
	}
	function clearDisplay(): void {
		stopRefreshLoop();
		clearCompletionTimer();
		clearThoughtStatusTimer();
		stopTextAnimator();
		agentStartTime = 0;
		turnStartTime = 0;
		thinkingStatus = null;
		thoughtForSetAt = 0;
		runOutputTokens = 0;
		resetStreamed();
		resetShownTokens();
		restoreDefaultWorkingMessage();
	}
	function onThinkingEnd(): void {
		if (thinkingStatus !== "thinking") return;
		const duration = Date.now() - thinkingStartTime;
		if (duration < 100) { thinkingStatus = null; clearThoughtStatusTimer(); return; }
		thinkingStatus = duration;
		thoughtForSetAt = Date.now();
		scheduleThoughtStatusClear();
	}

	const runtime: SpinnerRuntime = {
		pi,
		get agentStartTime() { return agentStartTime; },
		set agentStartTime(value) { agentStartTime = value; },
		get turnStartTime() { return turnStartTime; },
		set turnStartTime(value) { turnStartTime = value; },
		get turnActive() { return turnActive; },
		set turnActive(value) { turnActive = value; },
		get activeTurnId() { return activeTurnId; },
		set activeTurnId(value) { activeTurnId = value; },
		get activeCtx() { return activeCtx; },
		set activeCtx(value) { activeCtx = value; },
		get runningTools() { return runningTools; },
		get thinkingStatus() { return thinkingStatus; },
		set thinkingStatus(value) { thinkingStatus = value; },
		get thoughtForSetAt() { return thoughtForSetAt; },
		setTurn(values) {
			if (values.turnStartTime !== undefined) turnStartTime = values.turnStartTime;
			if (values.turnActive !== undefined) turnActive = values.turnActive;
			if (values.activeTurnId !== undefined) activeTurnId = values.activeTurnId;
			if (values.activeCtx !== undefined) activeCtx = values.activeCtx;
			if (values.currentVerb !== undefined) currentVerb = values.currentVerb;
			if (values.tipEligible !== undefined) tipTurnEligible = values.tipEligible;
		},
		setThinking(status, startTime) {
			thinkingStatus = status;
			if (startTime !== undefined) thinkingStartTime = startTime;
		},
		getCurrentTipState() { return { tipTurnEligible, currentTip, currentTipPickedAt }; },
		addRunOutputTokens(value) { runOutputTokens += value; },
		setCompletionTimer(callback, ms) {
			clearCompletionTimer();
			completionTimer = setTimeout(() => { completionTimer = null; callback(); }, ms);
			unrefTimer(completionTimer);
		},
		getCompletionTimer() { return completionTimer; },
		setCurrentTip(tip, pickedAt) { currentTip = tip; currentTipPickedAt = pickedAt; },
		clearTip() { tipTurnEligible = false; currentTip = ""; currentTipPickedAt = 0; },
		setLastWorkingMessage(value) { lastWorkingMessage = value; },
		getStreamedBlockLength(index) { return streamedBlockLengths[index] ?? 0; },
		setToolActive(active) { textAnimator?.setToolActive(active); },
		beginRun,
		outputTokenCount,
		setStreamedBlockLength,
		resetStreamed,
		resetShownTokens,
		syncWorkingMessage,
		rescheduleRefreshLoop,
		animateTokens,
		startTextAnimator,
		stopTextAnimator,
		clearDisplay,
		onThinkingEnd,
		clearCompletionTimer,
		clearThoughtStatusTimer,
		restoreDefaultWorkingMessage,
		startRefreshLoop,
		stopRefreshLoop,
		scheduleThoughtStatusClear,
	};

	return runtime;
}
