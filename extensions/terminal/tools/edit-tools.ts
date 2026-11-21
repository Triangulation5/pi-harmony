import { readFile as readFileAsync } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExtensionAPI, Theme, EditToolDetails } from "@earendil-works/pi-coding-agent";
import { createEditTool, createWriteTool } from "@earendil-works/pi-coding-agent";

type LocalizedEditDiff = { saved: unknown; diff: any; line: number };

export interface EditToolDependencies {
	cwd: string;
	pi: ExtensionAPI;
	sp(path: string): string;
	writeExistedBefore: Map<string, boolean>;
	editLocalized: Map<string, any>;
	fileExistsForTool(cwd: string, path: string): boolean;
	parseDiff(before: string, after: string): any;
	summarizeDiff(added: number, removed: number): string;
	lang(path: string): any;
	lineCount(text: string): number;
	shouldRevealCallArgs(ctx: any): boolean;
	hasOwnArg(args: any, key: string): boolean;
	getWriteWasNewFile(ctx: any, cwd: string, path: string, reveal: boolean): boolean | undefined;
	stableCallSummary(ctx: any, key: string, build: () => string, reveal?: boolean): string;
	syncToolCallStatus(ctx: any): void;
	toolHeader(label: string, summary: string, theme: Theme, dot: string, trailing: string): string;
	toolStatusDot(ctx: any, theme: Theme): string;
	liveLineCountTrailing(ctx: any, theme: Theme): string;
	makeText(lastComponent: any, text: string): any;
	runningPreviewBlock(result: any, fallback: string, expanded: boolean, theme: Theme, ctx: any): string;
	withBranch(text: string, theme: Theme, ...args: any[]): string;
	clearBlinkTimer(ctx: any): void;
	setToolStatus(ctx: any, status: string): void;
	MAX_RENDER_LINES: number;
	diffCollapsedLimit(): number;
	diffSummaryWithMeta(added: number, removed: number, hunks: number, mode: string): string;
	diffWidthReady(ctx: any): boolean;
	contextDiffWidth(ctx: any): number;
	shouldUseSplit(diff: any, width: number, lines: number): boolean;
	getToolBranchVisualEpoch(): number;
	resolveDiffColors(theme: Theme): any;
	renderSplit(diff: any, language: any, lines: number, colors: any, width: number): Promise<string>;
	renderUnified(diff: any, language: any, lines: number, colors: any, width: number): Promise<string>;
	hashText(text: string): string;
	getCachedParsedDiff(ctx: any, key: string, before: string, after: string): any;
	makeResponsiveDiffText(ctx: any, lastComponent: any, text: string): any;
	withFinalBranchBlock(text: string, theme: Theme): string;
	safeInvalidate(ctx: any): void;
	getEditOperations(args: any): Array<{oldText: string; newText: string}>;
	computeLocalizedEditDiffs(path: string, operations: any[], cwd: string, patch?: string): Promise<any[] | null>;
	summarizeEditOperations(operations: any[]): {diffs: any[]; summary: string; totalLines: number; totalHunks: number};
	countDiffHunks(diff: any): number;
	restoreLocalizedEditDiffs(preview: any, operations: any[]): any[] | null;
	formatLineMeta(line: number, theme: Theme): string;
	getCachedEditOperationSummary(ctx: any, key: string, operations: any[]): {diffs: any[]; summary: string};
	liveBranchDisplay(state: any, theme: Theme): string | undefined;
	renderEditPreviewBody(ctx: any, key: string, theme: Theme, language: any, operations: any[], diffs: any[], lines: number[], summary: string): void;
	getFirstChangedNewLine(diff: any): number;
}

export function registerEditTools(deps: EditToolDependencies): void {
	const { cwd, pi, sp, writeExistedBefore: WRITE_EXISTED_BEFORE, editLocalized: EDIT_LOCALIZED, fileExistsForTool, parseDiff, summarizeDiff, lang, lineCount, shouldRevealCallArgs, hasOwnArg, getWriteWasNewFile, stableCallSummary, syncToolCallStatus, toolHeader, toolStatusDot, liveLineCountTrailing, makeText, runningPreviewBlock, withBranch, clearBlinkTimer, setToolStatus, MAX_RENDER_LINES, diffCollapsedLimit, diffSummaryWithMeta, diffWidthReady, contextDiffWidth, shouldUseSplit, getToolBranchVisualEpoch, resolveDiffColors, renderSplit, renderUnified, hashText, getCachedParsedDiff, makeResponsiveDiffText, withFinalBranchBlock, safeInvalidate, getEditOperations, computeLocalizedEditDiffs, summarizeEditOperations, countDiffHunks, restoreLocalizedEditDiffs, formatLineMeta, getCachedEditOperationSummary, liveBranchDisplay, renderEditPreviewBody, getFirstChangedNewLine } = deps;

		const writeTool = createWriteTool(cwd);
		pi.registerTool({
			name: "write",
			label: "write",
			description: writeTool.description,
			promptSnippet: (writeTool as any).promptSnippet,
			promptGuidelines: (writeTool as any).promptGuidelines,
			parameters: writeTool.parameters,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				const fp = params.path ?? (params as any).file_path ?? "";
				const fullPath = fp ? resolve(cwd, fp) : "";
				const existedBefore = !!fullPath && fileExistsForTool(cwd, fp);
				WRITE_EXISTED_BEFORE.set(toolCallId, existedBefore);
				let old: string | null = null;
				try {
					if (fullPath && existedBefore) old = await readFileAsync(fullPath, "utf-8");
				} catch {
					old = null;
				}
				const result = await (writeTool.execute as (...args: unknown[]) => ReturnType<typeof writeTool.execute>)(toolCallId, params, signal, onUpdate, ctx);
				const content = params.content ?? "";
				if (old !== null && old !== content) {
					const diff = parseDiff(old, content);
					(result as any).details = { _type: "diff", summary: summarizeDiff(diff.added, diff.removed), diff, language: lang(fp) };
				} else if (old === null) {
					(result as any).details = { _type: "new", lines: lineCount(content), filePath: fp };
				} else if (old === content) {
					(result as any).details = { _type: "noChange" };
				}
				return result;
			},
			renderCall(args, theme, ctx) {
				const fp = args?.path ?? (args as any)?.file_path ?? "";
				const revealSummary = shouldRevealCallArgs(ctx) || (!!fp && hasOwnArg(args, "content"));
				syncToolCallStatus(ctx);
				const wasNew = getWriteWasNewFile(ctx, cwd, fp, revealSummary);
				const label = wasNew === true ? "Create" : "Write";
				const summary = stableCallSummary(ctx, "_callSummary", () => {
					const base = sp(fp);
					return shouldRevealCallArgs(ctx) ? `${base} ${theme.fg("muted", `(${lineCount(args.content ?? "")} lines)`)}` : base;
				}, revealSummary);
				const hdr = toolHeader(label, summary, theme, toolStatusDot(ctx, theme), liveLineCountTrailing(ctx, theme));
				return makeText(ctx.lastComponent, hdr);
			},
			renderResult(result, { expanded, isPartial }, theme, ctx) {
				if (isPartial) {
					return makeText(ctx.lastComponent, runningPreviewBlock(result, "", expanded, theme, ctx));
				}
				clearBlinkTimer(ctx);
				setToolStatus(ctx, ctx.isError ? "error" : "success");
				if (typeof ctx?.toolCallId === "string") WRITE_EXISTED_BEFORE.delete(ctx.toolCallId);
				if (ctx.isError) {
					const e =
						result.content
							?.filter((c: any) => c.type === "text")
							.map((c: any) => c.text || "")
							.join("\n") ?? "Error";
					return makeText(ctx.lastComponent, withBranch(theme.fg("error", e), theme));
				}
				const d = (result as any).details;
				if (d?._type === "diff") {
					const previewLines = ctx.expanded ? MAX_RENDER_LINES : diffCollapsedLimit();
					const hunks = d.diff?.lines?.filter((l: any) => l.type === "sep").length + (d.diff?.lines?.length ? 1 : 0);
					if (!diffWidthReady(ctx)) {
						const pendingSummary = diffSummaryWithMeta(d.diff.added, d.diff.removed, hunks, "");
						return makeResponsiveDiffText(ctx, ctx.lastComponent, withFinalBranchBlock(`${pendingSummary}\n${theme.fg("muted", "rendering diff...")}`, theme));
					}
					const diffWidth = contextDiffWidth(ctx);
					const mode = shouldUseSplit(d.diff, diffWidth, previewLines) ? "split" : "unified";
					const richSummary = diffSummaryWithMeta(d.diff.added, d.diff.removed, hunks, mode);
					const key = `wd:${diffWidth}:${d.summary}:${d.diff?.lines?.length ?? 0}:${d.language ?? ""}:${ctx.expanded ? 1 : 0}:${getToolBranchVisualEpoch()}`;
					if (ctx.state._wdk !== key) {
						ctx.state._wdk = key;
						ctx.state._wdt = withFinalBranchBlock(`${richSummary}\n${theme.fg("muted", "rendering diff...")}`, theme);
						const dc = resolveDiffColors(theme);
						renderSplit(d.diff, d.language, previewLines, dc, diffWidth)
							.then((rendered) => {
								if (ctx.state._wdk !== key) return;
								ctx.state._wdt = withFinalBranchBlock(`${richSummary}\n${rendered}`, theme);
								safeInvalidate(ctx);
							})
							.catch(() => {
								if (ctx.state._wdk !== key) return;
								ctx.state._wdt = withBranch(richSummary, theme);
								safeInvalidate(ctx);
							});
					}
					return makeResponsiveDiffText(ctx, ctx.lastComponent, ctx.state._wdt ?? withBranch(richSummary, theme));
				}
				if (d?._type === "noChange") return makeText(ctx.lastComponent, withBranch(theme.fg("muted", "✓ no changes"), theme));
				if (d?._type === "new") {
					const content = typeof ctx.args?.content === "string" ? ctx.args.content : "";
					const lineTotal = typeof d.lines === "number" ? d.lines : lineCount(content);
					const contentHash = hashText(content);
					const syntheticDiff = getCachedParsedDiff(ctx, `nf-diff:${d.filePath}:${contentHash}`, "", content);
					const richSummary = diffSummaryWithMeta(syntheticDiff.added, 0, 1, "new file");
					const previewLines = ctx.expanded ? MAX_RENDER_LINES : diffCollapsedLimit();
					if (!diffWidthReady(ctx)) {
						return makeResponsiveDiffText(ctx, ctx.lastComponent, withFinalBranchBlock(`${richSummary}\n${theme.fg("muted", "rendering diff...")}`, theme));
					}
					const diffWidth = contextDiffWidth(ctx);
					const pk = `nf:${d.filePath}:${contentHash}:${diffWidth}:${ctx.expanded ? 1 : 0}:${getToolBranchVisualEpoch()}`;
					if (ctx.state._nfk !== pk) {
						ctx.state._nfk = pk;
						ctx.state._nft = withFinalBranchBlock(`${richSummary}\n${theme.fg("muted", "rendering diff...")}`, theme);
						const dc = resolveDiffColors(theme);
						renderUnified(syntheticDiff, lang(d.filePath), previewLines, dc, diffWidth)
							.then((rendered) => {
								if (ctx.state._nfk !== pk) return;
								ctx.state._nft = withFinalBranchBlock(`${richSummary}\n${rendered}`, theme);
								safeInvalidate(ctx);
							})
							.catch(() => {
								if (ctx.state._nfk !== pk) return;
								ctx.state._nft = withBranch(`${richSummary} ${theme.fg("muted", `(${lineTotal} lines)`)}`, theme);
								safeInvalidate(ctx);
							});
					}
					return makeResponsiveDiffText(ctx, ctx.lastComponent, ctx.state._nft ?? withBranch(`${richSummary} ${theme.fg("muted", `(${lineTotal} lines)`)}`, theme));
				}
				return makeText(ctx.lastComponent, withBranch(theme.fg("success", "Written"), theme));
			},
		});

		const editTool = createEditTool(cwd);
		// The live preview and execute() share one look at the file, taken before the edit runs: what the row shows live is
		// then exactly what is saved with the result, and so what it shows again after a resume.
		const localizeEditOnce = (toolCallId: string, filePath: string, operations: Array<{ oldText: string; newText: string }>) => {
			let localized = EDIT_LOCALIZED.get(toolCallId);
			if (!localized) EDIT_LOCALIZED.set(toolCallId, localized = computeLocalizedEditDiffs(filePath, operations, cwd));
			return localized;
		};
		pi.registerTool({
			name: "edit",
			label: "edit",
			// Pi's built-in edit draws its own shell (no padding); ours uses the standard one, like
			// every other tool. Without this, older pi falls back to the built-in "self" shell
			// while pi 1.4+ uses "default", so the row shifted by a column between versions.
			renderShell: "default",
			description: editTool.description,
			promptSnippet: (editTool as any).promptSnippet,
			promptGuidelines: (editTool as any).promptGuidelines,
			parameters: editTool.parameters,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				const fp = params.path ?? (params as any).file_path ?? "";
				const operations = getEditOperations(params);
				const localizedDiffs = await localizeEditOnce(toolCallId, fp, operations);
				EDIT_LOCALIZED.delete(toolCallId);
				const result = await (editTool.execute as (...args: unknown[]) => ReturnType<typeof editTool.execute>)(toolCallId, params, signal, onUpdate, ctx);
				if (operations.length === 0) return result;
				const { diffs, summary, totalLines, totalHunks } = summarizeEditOperations(operations);
				const baseDetails = (((result as any).details ?? {}) as Record<string, unknown>);
				// null: the edits could not be located, and the row showed (and keeps showing) the diff without file line numbers.
				const preview = localizedDiffs?.map((entry: any) => entry.saved) ?? null;
				if (operations.length === 1) {
					const localized = localizedDiffs?.[0];
					const editLine = localized?.line ?? (typeof baseDetails.firstChangedLine === "number" ? baseDetails.firstChangedLine : 0);
					const diff = localized?.diff ?? diffs[0];
					(result as any).details = {
						...baseDetails,
						_type: "editInfo",
						summary,
						editLine,
						hunks: countDiffHunks(diff),
						added: diff?.added ?? 0,
						removed: diff?.removed ?? 0,
						preview,
					};
					return result;
				}
				(result as any).details = {
					...baseDetails,
					_type: "multiEditInfo",
					summary,
					editCount: operations.length,
					diffLineCount: totalLines,
					hunks: totalHunks,
					totalAdded: diffs.reduce((sum, diff) => sum + diff.added, 0),
					totalRemoved: diffs.reduce((sum, diff) => sum + diff.removed, 0),
					preview,
				};
				return result;
			},
			renderCall(args, theme, ctx) {
				const fp = args?.path ?? (args as any)?.file_path ?? "";
				const operations = getEditOperations(args);
				const revealSummary = shouldRevealCallArgs(ctx) || (!!fp && hasOwnArg(args, "edits"));
				const summary = stableCallSummary(ctx, "_callSummary", () => shouldRevealCallArgs(ctx) && operations.length > 1 ? `${sp(fp)} ${theme.fg("muted", `(${operations.length} edits)`)}` : sp(fp), revealSummary);
				syncToolCallStatus(ctx);
				const hdr = toolHeader("Edit", summary, theme, toolStatusDot(ctx, theme), liveLineCountTrailing(ctx, theme));
				// History replay never sets argsComplete; a finished edit is drawn from its result instead.
				const finished = ctx.state._editResult as Record<string, unknown> | undefined;
				if (!((ctx.argsComplete || finished) && operations.length > 0)) return makeText(ctx.lastComponent, hdr);
				if (!diffWidthReady(ctx)) {
					const pending = liveBranchDisplay(ctx.state, theme) ?? withBranch(theme.fg("muted", "(rendering...)"), theme, false, true);
					return makeResponsiveDiffText(ctx, ctx.lastComponent, `${hdr}\n${pending}`);
				}
				const diffWidth = contextDiffWidth(ctx);
				const key = `edit:${fp}:${hashText(operations.map((edit) => `${edit.oldText}\u0000${edit.newText}`).join("\u0001"))}:${diffWidth}:${ctx.expanded ? 1 : 0}:${getToolBranchVisualEpoch()}`;
				const { diffs: fallbackDiffs, summary: editSummary } = getCachedEditOperationSummary(ctx, key, operations);
				if (ctx.state._pk !== key) {
					ctx.state._pk = key;
					ctx.state._ptBody = theme.fg("muted", "(rendering...)");
					ctx.state._ptDisplay = withBranch(ctx.state._ptBody, theme, false, true);
					const lg = lang(fp);
					// Located once per row: expanding or resizing must not look in the file again, it no longer holds oldText.
					ctx.state._editLocalized ??= !finished
						? localizeEditOnce(ctx.toolCallId, fp, operations)
						: "preview" in finished
							? Promise.resolve(restoreLocalizedEditDiffs(finished.preview, operations))
							: computeLocalizedEditDiffs(fp, operations, cwd, typeof finished.patch === "string" ? finished.patch : "");
					void (ctx.state._editLocalized as Promise<LocalizedEditDiff[] | null>)
						.then((localizedDiffs) => {
							if (ctx.state._pk !== key) return;
							const diffs = localizedDiffs?.map((entry: any) => entry.diff) ?? fallbackDiffs;
							const lines = localizedDiffs?.map((entry: any) => entry.line) ?? diffs.map((diff: any) => getFirstChangedNewLine(diff));
							renderEditPreviewBody(ctx, key, theme, lg, operations, diffs, lines, editSummary);
						})
						.catch(() => {
							if (ctx.state._pk !== key) return;
							renderEditPreviewBody(ctx, key, theme, lg, operations, fallbackDiffs, fallbackDiffs.map((diff) => getFirstChangedNewLine(diff)), editSummary);
						});
				}
				const body = liveBranchDisplay(ctx.state, theme) ?? (ctx.state._ptDisplay as string | undefined);
				return makeResponsiveDiffText(ctx, ctx.lastComponent, body ? `${hdr}\n${body}` : hdr);
			},
			renderResult(result, { expanded, isPartial }, theme, ctx) {
				if (isPartial) {
					return makeText(ctx.lastComponent, runningPreviewBlock(result, theme.fg("dim", "Editing..."), expanded, theme, ctx));
				}
				clearBlinkTimer(ctx);
				setToolStatus(ctx, ctx.isError ? "error" : "success");
				if (ctx.isError) {
					const e =
						result.content
							?.filter((c: any) => c.type === "text")
							.map((c: any) => c.text || "")
							.join("\n") ?? "Error";
					return makeText(ctx.lastComponent, withBranch(theme.fg("error", e), theme));
				}
				if ((result as any).details?._type === "editInfo") {
					const { editLine, hunks, added, removed } = (result as any).details;
					const loc = formatLineMeta(editLine ?? 0, theme);
					const summary = diffSummaryWithMeta(added ?? 0, removed ?? 0, hunks ?? 0, "");
					return makeText(ctx.lastComponent, withBranch(`${summary}${loc}`, theme));
				}
				if ((result as any).details?._type === "multiEditInfo") {
					const { editCount, diffLineCount, hunks, totalAdded, totalRemoved } = (result as any).details;
					const summary = diffSummaryWithMeta(totalAdded ?? 0, totalRemoved ?? 0, hunks ?? 0, "");
					return makeText(ctx.lastComponent, withBranch(`${editCount} edits ${summary}${typeof diffLineCount === "number" ? ` ${theme.fg("muted", `(${diffLineCount} diff lines)`)}` : ""}`, theme));
				}
				return makeText(ctx.lastComponent, withBranch(theme.fg("success", "Applied"), theme));
			},
		});
}
