import type { ExtensionAPI, Theme, BashToolDetails } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import type { BashIntentMode } from "../../bash/intent.ts";
import { cleanIntentLabel, configureLocalIntents, localIntentFor, requestLocalIntent, watchLocalIntent } from "../../bash/intent.ts";
import { detectBashFileEdit, snapshotBashFileEdit } from "../../bash/file-edit.ts";
import { buildBashCommandPresentation, describeBashSource } from "../../bash/command.ts";
import type { RtkRewriteRecord } from "../../bash/presentation.ts";

type BashFileEditRecord = {
	path: string;
	existed: boolean;
	before: string | null;
	after: string | null;
	diff?: any;
};

export interface BashToolDependencies {
	cwd: string;
	pi: ExtensionAPI;
	bashIntentMode: BashIntentMode;
	notifyIntentProblem(message: string): void;
	collectBashFileEdits(cwd: string, edit: any, before: any): Promise<any[]>;
	ensureRtkRewriteForContext(ctx: any, args: any): RtkRewriteRecord | undefined;
	renderBashCommandBlock(command: string, expanded: boolean, theme: Theme): string;
	bashHeaderTrailing(ctx: any, theme: Theme): string;
	bashFileEditHeader(edit: any, records: any, theme: Theme, cwd: string, short: (path: string) => string, dot: string, suffix: string): string;
	renderBashFileEditResult(edit: any, records: any, theme: Theme, ctx: any, short: (path: string) => string): any;
	shortPath(cwd: string, path: string): string;
	syncToolCallStatus(ctx: any): void;
	syncBashDuration(ctx: any, isPartial?: boolean): void;
	stableCallSummary(ctx: any, key: string, build: () => string): string;
	toolHeader(label: string, summary: string, theme: Theme, dot: string, trailing: string, color?: string): string;
	toolStatusDot(ctx: any, theme: Theme): string;
	makeText(lastComponent: any, text: string): any;
	runningPreviewBlock(result: any, fallback: string, expanded: boolean, theme: Theme, ctx: any, options?: any): string;
	withBranch(text: string, theme: Theme): string;
	clearBlinkTimer(ctx: any): void;
	setToolStatus(ctx: any, status: string): void;
	safeInvalidate(ctx: any): void;
	unrefTimer(timer: any): any;
	preserveBashPreview(ctx: any): void;
	shouldPreserveBashPreview(ctx: any): boolean;
	buildPersistentBashPreview(lines: string[], theme: Theme): string;
	collectNonEmptyLines(text: string, limit?: number): {lines: string[]; total: number};
	liveToolPreviewEnabled(): boolean;
	liveToolPreviewLimit(): number;
	bashOutputMode(): string;
	bashCollapsedLimit(): number;
	buildPreviewText(lines: string[], plain: boolean, theme: Theme, limit: number, total: number, styleLine: (line: string) => string): string;
	toolOutputDetailHint(theme: Theme, expanded: boolean): string;
	WRAP_MARK: string;
	CLIP_MARK: string;
	formatRtkRewriteDetails(rewrite: RtkRewriteRecord, theme: Theme): string;
}

export function registerBashTool(deps: BashToolDependencies): void {
	const { cwd, pi, bashIntentMode, notifyIntentProblem, collectBashFileEdits, ensureRtkRewriteForContext, renderBashCommandBlock, bashHeaderTrailing, bashFileEditHeader, renderBashFileEditResult, shortPath, syncToolCallStatus, syncBashDuration, stableCallSummary, toolHeader, toolStatusDot, makeText, runningPreviewBlock, withBranch, clearBlinkTimer, setToolStatus, safeInvalidate, unrefTimer, preserveBashPreview, shouldPreserveBashPreview, buildPersistentBashPreview, collectNonEmptyLines, liveToolPreviewEnabled, liveToolPreviewLimit, bashOutputMode, bashCollapsedLimit, buildPreviewText, toolOutputDetailHint, formatRtkRewriteDetails, WRAP_MARK, CLIP_MARK } = deps;

		const bashTool = createBashTool(cwd);
		const bashIntentEnabled = bashIntentMode === "model";
		configureLocalIntents(bashIntentMode === "local", (message) => notifyIntentProblem(message));
		/** The label for a bash row, from the model's argument or the local model's cache, or "". */
		const bashIntentLabel = (args: any, ctx: any): string => {
			if (bashIntentMode === "model") return cleanIntentLabel(args?.displaySummary);
			if (bashIntentMode !== "local") return "";
			const command = typeof args?.command === "string" ? args.command : "";
			const label = localIntentFor(command);
			if (label) return label;
			if (ctx?.executionStarted === true) watchLocalIntent(command, () => safeInvalidate(ctx));
			return "";
		};
		const bashParameters = {
			...bashTool.parameters,
			properties: {
				...bashTool.parameters.properties,
				displaySummary: {
					type: "string",
					description: "Concise user-facing purpose for this command, in the user's current language. Do not include credentials, secrets, or command output.",
				},
			},
			required: [...(bashTool.parameters.required ?? []), "displaySummary"],
		} as unknown as typeof bashTool.parameters;
		const bashIntentGuidelines = bashIntentEnabled
			? [
				...((bashTool as any).promptGuidelines ?? []),
				"When calling bash, include displaySummary: a concise user-facing purpose in the user's current language. Do not include credentials, secrets, or command output.",
			]
			: (bashTool as any).promptGuidelines;

		pi.registerTool({
			name: "bash",
			label: "bash",
			description: bashTool.description,
			promptSnippet: (bashTool as any).promptSnippet,
			promptGuidelines: bashIntentGuidelines,
			parameters: bashIntentEnabled ? bashParameters : bashTool.parameters,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				const { displaySummary: _displaySummary, ...bashParams } = params as typeof params & { displaySummary?: string };
				// A command that only changes files: look at them before and after, so the row
				// can show a diff like an edit/write row. The command itself runs unchanged.
				const fileEdit = detectBashFileEdit(typeof bashParams.command === "string" ? bashParams.command : "");
				// Local labels are asked for only here, when a command really runs, never on redraws.
				if (bashIntentMode === "local" && typeof bashParams.command === "string") requestLocalIntent(bashParams.command);
				const before = fileEdit ? await snapshotBashFileEdit(cwd, fileEdit) : undefined;
				// Pi's typings lag its runtime, which builds PI_* env vars and cwd from ctx; forward ctx anyway.
				const result = await (bashTool.execute as (...args: unknown[]) => ReturnType<typeof bashTool.execute>)(toolCallId, bashParams, signal, onUpdate, ctx);
				if (fileEdit && before) {
					const details = result.details && typeof result.details === "object" ? result.details : {};
					(result as any).details = { ...details, fileEdits: await collectBashFileEdits(cwd, fileEdit, before) };
				}
				return result;
			},
			renderCall(args, theme, ctx) {
				syncToolCallStatus(ctx);
				syncBashDuration(ctx);
				const rewrite = ensureRtkRewriteForContext(ctx, args);
				const command = typeof args.command === "string" ? args.command : "";
				const fileEdit = ctx.argsComplete === true || ctx.executionStarted === true ? detectBashFileEdit(command) : undefined;
				if (fileEdit) {
					const status = ctx?.state?._toolStatus;
					const showCommand = status === "error" || ctx.expanded === true;
					const commandBlock = showCommand ? renderBashCommandBlock(command, ctx.expanded === true, theme) : "";
					const rowCwd = ctx.cwd ?? cwd;
					const trailing = bashHeaderTrailing(ctx, theme);
					const header = bashFileEditHeader(fileEdit, ctx.state?._bashFileEdits, theme, rowCwd, (path) => shortPath(rowCwd, path), toolStatusDot(ctx, theme), "");
					const label = bashIntentLabel(args, ctx);
					const withIntent = `${header}${label ? theme.fg("text", ` — ${label}`) : ""}${trailing}`;
					return makeText(ctx.lastComponent, commandBlock ? `${withIntent}\n${commandBlock}` : withIntent);
				}
				const presentation = buildBashCommandPresentation(command);
				const summary = stableCallSummary(ctx, "_bashHeadline", () => presentation.headline);
				const rtkBadge = rewrite ? theme.fg("muted", " (RTK)") : "";
				const status = ctx?.state?._toolStatus;
				const showCommand = ctx.argsComplete === true && (status === "pending" || status === "error" || ctx.expanded === true);
				const commandBlock = showCommand ? renderBashCommandBlock(command, ctx.expanded === true, theme) : "";
				// With a label, the row shows it in place of the command; expanding shows the command.
				const label = bashIntentLabel(args, ctx);
				const headerSummary = label || (ctx.expanded === true && commandBlock ? describeBashSource(presentation) : summary);
				const header = toolHeader(
					"Bash",
					`${headerSummary}${rtkBadge}`,
					theme,
					toolStatusDot(ctx, theme),
					bashHeaderTrailing(ctx, theme),
					// A label is a description, not the command: plain text, like the group sentences.
					label ? "text" : "accent",
				).replace(WRAP_MARK, CLIP_MARK);
				return makeText(ctx.lastComponent, commandBlock ? `${header}\n${commandBlock}` : header);
			},
			renderResult(result, { expanded, isPartial }, theme, ctx) {
				syncBashDuration(ctx, isPartial);
				const details = result.details as BashToolDetails | undefined;
				const rewrite = ensureRtkRewriteForContext(ctx, ctx.args);
				const output = result.content[0]?.type === "text" ? result.content[0].text : "";
				const fileEdit = !isPartial && !ctx.isError ? detectBashFileEdit(typeof ctx.args?.command === "string" ? ctx.args.command : "") : undefined;
				if (fileEdit) {
					const records = Array.isArray((details as any)?.fileEdits) ? (details as any).fileEdits as BashFileEditRecord[] : undefined;
					if (ctx.state && ctx.state._bashFileEdits !== records) {
						ctx.state._bashFileEdits = records;
						// The header says Create or Write from these; draw it again (not from inside this render).
						unrefTimer(setTimeout(() => safeInvalidate(ctx), 0));
					}
					const rowCwd = ctx.cwd ?? cwd;
					const body = renderBashFileEditResult(fileEdit, records, theme, ctx, (path) => shortPath(rowCwd, path));
					if (body) {
						clearBlinkTimer(ctx);
						setToolStatus(ctx, "success");
						return body;
					}
				}
				if (isPartial) {
					const preview = collectNonEmptyLines(output, expanded ? undefined : liveToolPreviewLimit());
					const running = runningPreviewBlock(result, "", expanded, theme, ctx, {
						lines: preview.lines,
						totalLineCount: preview.total,
						styleLine: (line: string) => theme.fg("dim", line),
						tail: true,
					});
					const withRewrite = expanded && rewrite
						? [running, withBranch(formatRtkRewriteDetails(rewrite, theme), theme)].filter(Boolean).join("\n")
						: running;
					return makeText(ctx.lastComponent, withRewrite);
				}
				// Collapsed: only keep the live-preview tail (or nothing). Expanded: full list.
				const keepTail = !expanded && liveToolPreviewEnabled() ? liveToolPreviewLimit() : undefined;
				// pi ends a non-zero exit with this line; the label shows the code, so it is not output.
				const exit = ctx.isError ? output.match(/\s*Command exited with code (\d+)\s*$/) : null;
				const nonEmpty = collectNonEmptyLines(exit ? output.slice(0, exit.index) : output, expanded ? undefined : (keepTail ?? 0));
				clearBlinkTimer(ctx);
				setToolStatus(ctx, ctx.isError ? "error" : "success");
				if (nonEmpty.total > 0 && ctx.state?._bashPreviewReleased !== true) {
					preserveBashPreview(ctx);
					if (ctx.state) ctx.state._bashPreviewReleased = true;
				}
				let text = ctx.isError ? theme.fg("error", exit ? `Exit ${exit[1]}` : "Failed") : theme.fg("success", "Done");
				text += theme.fg("muted", ` (${nonEmpty.total} lines)`);
				if (details?.truncation?.truncated) text += theme.fg("warning", " [truncated]");
				const mode = bashOutputMode();
				if (mode === "summary") return makeText(ctx.lastComponent, withBranch(text, theme));
				const persistentPreview = shouldPreserveBashPreview(ctx) ? buildPersistentBashPreview(nonEmpty.lines, theme) : "";
				if (!expanded && mode === "preview") {
					const previewLines = nonEmpty.lines.slice(0, bashCollapsedLimit());
					const preview = previewLines.length > 0
						? buildPreviewText(previewLines, false, theme, bashCollapsedLimit(), nonEmpty.total, (line: string) => theme.fg("dim", line || " "))
						: "";
					const suffix = toolOutputDetailHint(theme, expanded);
					return makeText(ctx.lastComponent, withBranch(`${text}${suffix}${preview ? `\n${preview}` : ""}`, theme));
				}
				if (!expanded && mode === "opencode" && nonEmpty.total > 0) return makeText(ctx.lastComponent, withBranch(`${text}${toolOutputDetailHint(theme, expanded)}`, theme));
				if (!expanded) return makeText(ctx.lastComponent, withBranch(text, theme));
				const collapsed = bashCollapsedLimit();
				if (rewrite) text += `\n${formatRtkRewriteDetails(rewrite, theme)}`;
				text += `\n${buildPreviewText(nonEmpty.lines, false, theme, collapsed, nonEmpty.total, (line: string) => theme.fg("dim", line))}`;
				return makeText(ctx.lastComponent, withBranch(text, theme));
			},
		});
}
