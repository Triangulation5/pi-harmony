import type { Theme } from "@earendil-works/pi-coding-agent";
import { formatBashDuration } from "./command.ts";

export interface RtkRewriteRecord {
	original: string;
	rewritten: string;
	notice: string;
}

export interface BashPresentationDependencies {
	safeInvalidate(ctx: any): void;
	unrefTimer(timer: ReturnType<typeof setTimeout>): unknown;
	applyThemePaletteIfNeeded(theme: Theme | undefined): void;
	getBorderColor(): string;
	transparentReset: string;
}

export interface BashPresentation {
	syncBashDuration(ctx: any, isPartial?: boolean): void;
	clearAllBashDurationContexts(): void;
	bashDurationText(ctx: any): string | undefined;
	preserveBashPreview(ctx: any): void;
	clearPreservedBashPreviews(): void;
	shouldPreserveBashPreview(ctx: any): boolean;
	ensureRtkRewriteForContext(ctx: any, args: any): RtkRewriteRecord | undefined;
	formatRtkRewriteDetails(record: RtkRewriteRecord, theme: Theme): string;
	patchUiNotifications(ui: any): void;
	trackRtkOriginalBashCommand(toolCallId: unknown, args: unknown): void;
	forgetRtkBashCommand(toolCallId: unknown): void;
	clearRtkRewriteState(): void;
}

const BASH_STARTED_AT_KEY = "_bashStartedAtMs";
const BASH_ENDED_AT_KEY = "_bashEndedAtMs";
const UI_NOTIFY_PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-ui-notifications-v2");

export function createBashPresentation(
	getDependencies: () => BashPresentationDependencies,
): BashPresentation {
	const bashDurationContexts = new Map<any, { invalidate: () => void }>();
	let bashDurationTimer: ReturnType<typeof setTimeout> | null = null;
	const originalBashCommands = new Map<string, string>();
	const rewritesByToolId = new Map<string, RtkRewriteRecord>();
	const pendingRewrites: RtkRewriteRecord[] = [];
	const pendingRewriteLimit = 20;
	const preservedBashPreviews = new Set<string>();
	const previewInvalidators = new Map<string, () => void>();

	function scheduleBashDurationTick(): void {
		if (bashDurationTimer || bashDurationContexts.size === 0) return;
		bashDurationTimer = setTimeout(() => {
			bashDurationTimer = null;
			for (const entry of bashDurationContexts.values()) {
				try { entry.invalidate(); } catch { /* noop */ }
			}
			scheduleBashDurationTick();
		}, 1_000);
		getDependencies().unrefTimer(bashDurationTimer);
	}

	function registerBashDurationContext(ctx: any): void {
		const key = ctx?.state ?? ctx;
		if (!key) return;
		const invalidate = typeof ctx?.invalidate === "function"
			? () => getDependencies().safeInvalidate(ctx)
			: () => {};
		bashDurationContexts.set(key, { invalidate });
		scheduleBashDurationTick();
	}

	function clearBashDurationContext(ctx: any): void {
		const key = ctx?.state ?? ctx;
		if (key) bashDurationContexts.delete(key);
		if (bashDurationTimer && bashDurationContexts.size === 0) {
			clearTimeout(bashDurationTimer);
			bashDurationTimer = null;
		}
	}

	function clearAllBashDurationContexts(): void {
		bashDurationContexts.clear();
		if (bashDurationTimer) {
			clearTimeout(bashDurationTimer);
			bashDurationTimer = null;
		}
	}

	function syncBashDuration(ctx: any, isPartial = true): void {
		const state = ctx?.state;
		if (!state) return;
		if (state._toolStatus === "pending" && typeof state[BASH_STARTED_AT_KEY] !== "number") {
			state[BASH_STARTED_AT_KEY] = Date.now();
			delete state[BASH_ENDED_AT_KEY];
		}
		const startedAt = state[BASH_STARTED_AT_KEY];
		if (typeof startedAt !== "number") return;
		if (!isPartial || ctx?.isError) {
			if (typeof state[BASH_ENDED_AT_KEY] !== "number") state[BASH_ENDED_AT_KEY] = Date.now();
			clearBashDurationContext(ctx);
			return;
		}
		registerBashDurationContext(ctx);
	}

	function bashDurationText(ctx: any): string | undefined {
		const startedAt = ctx?.state?.[BASH_STARTED_AT_KEY];
		if (typeof startedAt !== "number") return undefined;
		const endedAt = ctx?.state?.[BASH_ENDED_AT_KEY];
		return formatBashDuration((typeof endedAt === "number" ? endedAt : Date.now()) - startedAt);
	}

	function preserveBashPreview(ctx: any): void {
		const toolCallId = typeof ctx?.toolCallId === "string" ? ctx.toolCallId : undefined;
		if (!toolCallId) return;
		preservedBashPreviews.add(toolCallId);
		if (typeof ctx?.invalidate === "function") {
			previewInvalidators.set(toolCallId, () => getDependencies().safeInvalidate(ctx));
		}
	}

	function clearPreservedBashPreviews(): void {
		if (preservedBashPreviews.size === 0) return;
		const invalidators = [...preservedBashPreviews]
			.map((toolCallId) => previewInvalidators.get(toolCallId))
			.filter((invalidate): invalidate is () => void => typeof invalidate === "function");
		preservedBashPreviews.clear();
		previewInvalidators.clear();
		for (const invalidate of invalidators) {
			try { invalidate(); } catch { /* noop */ }
		}
	}

	function shouldPreserveBashPreview(ctx: any): boolean {
		return typeof ctx?.toolCallId === "string" && preservedBashPreviews.has(ctx.toolCallId);
	}

	function normalizeRtkCommandPreview(command: string): string {
		return command.replace(/\s+/g, " ").trim();
	}

	function rtkPreviewMatches(command: string, preview: string): boolean {
		const normalized = normalizeRtkCommandPreview(command);
		const normalizedPreview = normalizeRtkCommandPreview(preview);
		if (!normalized || !normalizedPreview) return false;
		if (normalized === normalizedPreview) return true;
		if (normalizedPreview.endsWith("...")) {
			return normalized.startsWith(normalizedPreview.slice(0, -1));
		}
		return normalized.startsWith(normalizedPreview) || normalizedPreview.startsWith(normalized);
	}

	function parseRtkRewriteNotice(message: string): RtkRewriteRecord | undefined {
		const match = message.match(/^RTK rewrite:\s*(.*?)\s*->\s*(.+)$/s);
		if (!match) return undefined;
		const original = match[1]?.trim() ?? "";
		const rewritten = match[2]?.trim() ?? "";
		if (!original || !rewritten) return undefined;
		return { original, rewritten, notice: message };
	}

	function rememberPendingRtkRewrite(record: RtkRewriteRecord): void {
		pendingRewrites.push(record);
		while (pendingRewrites.length > pendingRewriteLimit) pendingRewrites.shift();
	}

	function findRtkRewriteToolId(record: RtkRewriteRecord): string | undefined {
		const entries = [...originalBashCommands.entries()].reverse();
		return entries.find(([, command]) => rtkPreviewMatches(command, record.original))?.[0];
	}

	function rememberRtkRewrite(record: RtkRewriteRecord): void {
		const toolCallId = findRtkRewriteToolId(record);
		if (toolCallId) {
			rewritesByToolId.set(toolCallId, record);
			return;
		}
		rememberPendingRtkRewrite(record);
	}

	function takePendingRtkRewrite(
		originalCommand: string | undefined,
		currentCommand: string | undefined,
	): RtkRewriteRecord | undefined {
		const index = pendingRewrites.findIndex((record) => {
			return (!!originalCommand && rtkPreviewMatches(originalCommand, record.original))
				|| (!!currentCommand && (rtkPreviewMatches(currentCommand, record.rewritten) || rtkPreviewMatches(currentCommand, record.original)));
		});
		if (index === -1) return undefined;
		const [record] = pendingRewrites.splice(index, 1);
		return record;
	}

	function ensureRtkRewriteForContext(ctx: any, args: any): RtkRewriteRecord | undefined {
		if (ctx?.state?._rtkRewriteRecord) return ctx.state._rtkRewriteRecord as RtkRewriteRecord;
		const toolCallId = typeof ctx?.toolCallId === "string" ? ctx.toolCallId : undefined;
		const currentCommand = typeof args?.command === "string" ? args.command : undefined;
		const originalCommand = toolCallId ? originalBashCommands.get(toolCallId) : undefined;
		if (!toolCallId) return undefined;

		let record = rewritesByToolId.get(toolCallId);
		if (!record) {
			record = takePendingRtkRewrite(originalCommand, currentCommand);
			if (record) rewritesByToolId.set(toolCallId, record);
		}
		if (!record && originalCommand && currentCommand && normalizeRtkCommandPreview(originalCommand) !== normalizeRtkCommandPreview(currentCommand)) {
			record = {
				original: originalCommand,
				rewritten: currentCommand,
				notice: `RTK rewrite: ${originalCommand} -> ${currentCommand}`,
			};
			rewritesByToolId.set(toolCallId, record);
		}
		if (record && ctx?.state) ctx.state._rtkRewriteRecord = record;
		return record;
	}

	function formatRtkRewriteDetails(record: RtkRewriteRecord, theme: Theme): string {
		return [
			theme.fg("muted", "RTK rewrite"),
			`${theme.fg("muted", "original :")} ${theme.fg("dim", record.original)}`,
			`${theme.fg("muted", "rewritten:")} ${theme.fg("dim", record.rewritten)}`,
		].join("\n");
	}

	function patchUiNotifications(ui: any): void {
		if (!ui || ui[UI_NOTIFY_PATCH_FLAG]) return;
		const originalNotify = ui.notify;
		if (typeof originalNotify !== "function") return;
		ui.notify = function patchedUiNotify(message: string, type?: "info" | "warning" | "error") {
			if (typeof message === "string") {
				const rewrite = parseRtkRewriteNotice(message);
				if (rewrite) {
					rememberRtkRewrite(rewrite);
					return;
				}
				if (message === "💾 Memory auto-reviewed and updated") {
					const dependencies = getDependencies();
					dependencies.applyThemePaletteIfNeeded(ui.theme);
					message = `${dependencies.getBorderColor()}✻ Memory auto-reviewed and updated${dependencies.transparentReset}`;
				}
			}
			return originalNotify.call(this, message, type);
		};
		ui[UI_NOTIFY_PATCH_FLAG] = true;
	}

	function trackRtkOriginalBashCommand(toolCallId: unknown, args: unknown): void {
		if (typeof toolCallId !== "string") return;
		const command = (args as any)?.command;
		if (typeof command === "string" && command.trim()) originalBashCommands.set(toolCallId, command);
	}

	function forgetRtkBashCommand(toolCallId: unknown): void {
		if (typeof toolCallId !== "string") return;
		originalBashCommands.delete(toolCallId);
		rewritesByToolId.delete(toolCallId);
	}

	function clearRtkRewriteState(): void {
		originalBashCommands.clear();
		rewritesByToolId.clear();
		pendingRewrites.length = 0;
		clearPreservedBashPreviews();
	}

	return {
		syncBashDuration,
		clearAllBashDurationContexts,
		bashDurationText,
		preserveBashPreview,
		clearPreservedBashPreviews,
		shouldPreserveBashPreview,
		ensureRtkRewriteForContext,
		formatRtkRewriteDetails,
		patchUiNotifications,
		trackRtkOriginalBashCommand,
		forgetRtkBashCommand,
		clearRtkRewriteState,
	};
}
