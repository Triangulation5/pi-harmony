import { basename, dirname, resolve } from "node:path";
import type { ExtensionAPI, Theme, GrepToolDetails, ReadToolDetails } from "@earendil-works/pi-coding-agent";
import { createFindTool, createGrepTool, createLsTool, createReadTool } from "@earendil-works/pi-coding-agent";

export interface ReadSearchToolDependencies {
	cwd: string;
	pi: ExtensionAPI;
	sp(path: string): string;
	syncToolCallStatus(ctx: any): void;
	stableCallSummary(ctx: any, key: string, build: () => string, reveal?: boolean): string;
	toolHeader(label: string, summary: string, theme: Theme, dot: string, trailing: string): string;
	toolStatusDot(ctx: any, theme: Theme): string;
	liveLineCountTrailing(ctx: any, theme: Theme): string;
	makeText(lastComponent: any, text: string): any;
	runningPreviewBlock(result: any, fallback: string, expanded: boolean, theme: Theme, ctx: any): string;
	clearBlinkTimer(ctx: any): void;
	setToolStatus(ctx: any, status: string): void;
	getFirstImageBlock(result: any): any;
	renderReadImageResult(result: any, expanded: boolean, theme: Theme, ctx: any, deps: any): any;
	toolResultRendererDependencies: any;
	withBranch(text: string, theme: Theme): string;
	buildPreviewText(lines: string[], plain: boolean, theme: Theme, limit: number, total: number, styleLine: (line: string) => string): string;
	previewLimit(): number;
	toolOutputDetailHint(theme: Theme, expanded: boolean): string;
	summarizeText(text: string, limit: number): string;
	fileIcon(path: string): string;
	dirIcon(): string;
	getFgRule(): string;
	getDReset(): string;
}

export function registerReadSearchTools(deps: ReadSearchToolDependencies): void {
	const { cwd, pi, sp, syncToolCallStatus, stableCallSummary, toolHeader, toolStatusDot, liveLineCountTrailing, makeText, runningPreviewBlock, clearBlinkTimer, setToolStatus, getFirstImageBlock, renderReadImageResult, toolResultRendererDependencies, withBranch, buildPreviewText, previewLimit, toolOutputDetailHint, summarizeText, fileIcon, dirIcon, getFgRule, getDReset } = deps;

			const readTool = createReadTool(cwd);
		pi.registerTool({
			name: "read",
			label: "read",
			description: readTool.description,
			promptSnippet: (readTool as any).promptSnippet,
			promptGuidelines: (readTool as any).promptGuidelines,
			parameters: readTool.parameters,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				// Pi's typings for this tool lag its runtime, which reads ctx.cwd/model; forward ctx anyway.
				return (readTool.execute as (...args: unknown[]) => ReturnType<typeof readTool.execute>)(toolCallId, params, signal, onUpdate, ctx);
			},
			renderCall(args, theme, ctx) {
				syncToolCallStatus(ctx);
				// SKILL.md reads: render as [skill] block matching /skill:name style
				const rawPath = String(args?.path ?? "");
				const absPath = resolve(ctx.cwd ?? cwd, rawPath);
				if (basename(absPath) === "SKILL.md") {
					const skillName = basename(dirname(absPath)) || "SKILL.md";
					const line =
						theme.fg("customMessageLabel", `\x1b[1m[skill]\x1b[22m `) +
						theme.fg("customMessageText", skillName);
					return makeText(ctx.lastComponent, `${toolStatusDot(ctx, theme)}${line}${liveLineCountTrailing(ctx, theme)}`);
				}
				const summary = stableCallSummary(ctx, "_callSummary", () => {
					let value = sp(args.path ?? "");
					if (args.offset || args.limit) {
						const parts: string[] = [];
						if (args.offset) parts.push(`offset=${args.offset}`);
						if (args.limit) parts.push(`limit=${args.limit}`);
						value += ` ${theme.fg("muted", `(${parts.join(", ")})`)}`;
					}
					return value;
				});
				return makeText(
					ctx.lastComponent,
					toolHeader("Read", summary, theme, toolStatusDot(ctx, theme), liveLineCountTrailing(ctx, theme)),
				);
			},
			renderResult(result, { expanded, isPartial }, theme, ctx) {
				if (isPartial) {
					return makeText(ctx.lastComponent, runningPreviewBlock(result, theme.fg("dim", "Reading..."), expanded, theme, ctx));
				}
				clearBlinkTimer(ctx);
				setToolStatus(ctx, ctx.isError ? "error" : "success");
				if (getFirstImageBlock(result)) return renderReadImageResult(result, expanded, theme, ctx, toolResultRendererDependencies);
				const details = result.details as ReadToolDetails | undefined;
				const content = result.content.find((block: any) => block?.type === "text");
				if (content?.type !== "text") return makeText(ctx.lastComponent, withBranch(theme.fg("error", "No text content"), theme));
				// A failed read (missing file, permission) said "1 lines loaded"; show the error instead.
				if (ctx.isError) {
					const message = content.text.trim().split("\n");
					return makeText(ctx.lastComponent, withBranch(theme.fg("error", expanded ? message.join("\n") : message[0] ?? "Error"), theme));
				}
				const lines = content.text.split("\n");
				let text = theme.fg("muted", `${lines.length} lines loaded`);
				if (details?.truncation?.truncated) text += theme.fg("warning", " (truncated)");
				if (!expanded) return makeText(ctx.lastComponent, withBranch(`${text}${toolOutputDetailHint(theme, expanded)}`, theme));
				text += `\n${buildPreviewText(lines, false, theme, previewLimit(), lines.length, (line: string) => theme.fg("dim", line || " "))}`;
				return makeText(ctx.lastComponent, withBranch(text, theme));
			},
		});

		const grepTool = createGrepTool(cwd);
		pi.registerTool({
			name: "grep",
			label: "grep",
			description: grepTool.description,
			promptSnippet: (grepTool as any).promptSnippet,
			promptGuidelines: (grepTool as any).promptGuidelines,
			parameters: grepTool.parameters,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				// Pi's typings for this tool lag its runtime, which reads ctx.cwd; forward ctx anyway.
				return (grepTool.execute as (...args: unknown[]) => ReturnType<typeof grepTool.execute>)(toolCallId, params, signal, onUpdate, ctx);
			},
			renderCall(args, theme, ctx) {
				syncToolCallStatus(ctx);
				const summary = stableCallSummary(ctx, "_callSummary", () => {
					let value = `\"${summarizeText(args.pattern, 40)}\"`;
					if (args.path) value += ` in ${args.path}`;
					return value;
				});
				return makeText(
					ctx.lastComponent,
					toolHeader("Grep", summary, theme, toolStatusDot(ctx, theme), liveLineCountTrailing(ctx, theme)),
				);
			},
			renderResult(result, { expanded, isPartial }, theme, ctx) {
				if (isPartial) {
					return makeText(ctx.lastComponent, runningPreviewBlock(result, theme.fg("dim", "Searching..."), expanded, theme, ctx));
				}
				clearBlinkTimer(ctx);
				setToolStatus(ctx, ctx.isError ? "error" : "success");
				const details = result.details as GrepToolDetails | undefined;
				const matches = (result.content[0]?.type === "text" ? result.content[0].text : "")
					.split("\n")
					.filter((line: string) => line.trim().length > 0);
				if (matches.length === 0) return makeText(ctx.lastComponent, withBranch(theme.fg("muted", "no matches"), theme));
				let text = theme.fg("muted", `${matches.length} matches`);
				if (details?.truncation?.truncated) text += theme.fg("warning", " (truncated)");
				if (!expanded) return makeText(ctx.lastComponent, withBranch(`${text}${toolOutputDetailHint(theme, expanded)}`, theme));
				text += `\n${buildPreviewText(matches, false, theme, previewLimit(), matches.length, (line: string) => theme.fg("dim", line))}`;
				return makeText(ctx.lastComponent, withBranch(text, theme));
			},
		});

		const findTool = createFindTool(cwd);
		pi.registerTool({
			name: "find",
			label: "find",
			description: findTool.description,
			promptSnippet: (findTool as any).promptSnippet,
			promptGuidelines: (findTool as any).promptGuidelines,
			parameters: findTool.parameters,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				return (findTool.execute as (...args: unknown[]) => ReturnType<typeof findTool.execute>)(toolCallId, params, signal, onUpdate, ctx);
			},
			renderCall(args, theme, ctx) {
				syncToolCallStatus(ctx);
				const summary = stableCallSummary(ctx, "_callSummary", () => {
					let value = `\"${summarizeText(args.pattern, 40)}\"`;
					if (args.path) value += ` in ${args.path}`;
					return value;
				});
				return makeText(
					ctx.lastComponent,
					toolHeader("Find", summary, theme, toolStatusDot(ctx, theme), liveLineCountTrailing(ctx, theme)),
				);
			},
			renderResult(result, { expanded, isPartial }, theme, ctx) {
				if (isPartial) {
					return makeText(ctx.lastComponent, runningPreviewBlock(result, theme.fg("dim", "Finding..."), expanded, theme, ctx));
				}
				clearBlinkTimer(ctx);
				setToolStatus(ctx, ctx.isError ? "error" : "success");
				const items = (result.content[0]?.type === "text" ? result.content[0].text : "")
					.split("\n")
					.filter((line: string) => line.trim().length > 0);
				if (items.length === 0) return makeText(ctx.lastComponent, withBranch(theme.fg("muted", "no files found"), theme));
				let text = theme.fg("muted", `${items.length} files`);
				if (!expanded) return makeText(ctx.lastComponent, withBranch(`${text}${toolOutputDetailHint(theme, expanded)}`, theme));
				// Expanded: grouped find results with icons
				const maxShow = previewLimit();
				const shown = items.slice(0, maxShow);
				const findLines: string[] = [];
				for (let i = 0; i < shown.length; i++) {
					const item = shown[i].trim();
					const icon = fileIcon(item);
					findLines.push(`  ${icon}${theme.fg("dim", item)}`);
				}
				const remaining = items.length - shown.length;
				if (remaining > 0) {
					findLines.push(`  ${theme.fg("muted", `... ${remaining} more files`)}`);
				}
				text += `\n${findLines.join('\n')}`;
				return makeText(ctx.lastComponent, withBranch(text, theme));
			},
		});

		const lsTool = createLsTool(cwd);
		pi.registerTool({
			name: "ls",
			label: "ls",
			description: lsTool.description,
			promptSnippet: (lsTool as any).promptSnippet,
			promptGuidelines: (lsTool as any).promptGuidelines,
			parameters: lsTool.parameters,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				return (lsTool.execute as (...args: unknown[]) => ReturnType<typeof lsTool.execute>)(toolCallId, params, signal, onUpdate, ctx);
			},
			renderCall(args, theme, ctx) {
				syncToolCallStatus(ctx);
				const summary = stableCallSummary(ctx, "_callSummary", () => sp(args.path ?? "."));
				return makeText(
					ctx.lastComponent,
					toolHeader("List", summary, theme, toolStatusDot(ctx, theme), liveLineCountTrailing(ctx, theme)),
				);
			},
			renderResult(result, { expanded, isPartial }, theme, ctx) {
				if (isPartial) {
					return makeText(ctx.lastComponent, runningPreviewBlock(result, theme.fg("dim", "Listing..."), expanded, theme, ctx));
				}
				clearBlinkTimer(ctx);
				setToolStatus(ctx, ctx.isError ? "error" : "success");
				const items = (result.content[0]?.type === "text" ? result.content[0].text : "")
					.split("\n")
					.filter((line: string) => line.trim().length > 0);
				if (items.length === 0) return makeText(ctx.lastComponent, withBranch(theme.fg("muted", "empty directory"), theme));
				let text = theme.fg("muted", `${items.length} entries`);
				if (!expanded) return makeText(ctx.lastComponent, withBranch(`${text}${toolOutputDetailHint(theme, expanded)}`, theme));
				// Expanded: tree-view with icons
				const maxShow = previewLimit();
				const shown = items.slice(0, maxShow);
				const treeLines: string[] = [];
				for (let i = 0; i < shown.length; i++) {
					const item = shown[i];
					const isDir = item.endsWith("/");
					const isLast = i === shown.length - 1 && items.length <= maxShow;
					const prefix = isLast ? `${getFgRule()}\u2514\u2500\u2500${getDReset()} ` : `${getFgRule()}\u251c\u2500\u2500${getDReset()} `;
					const icon = isDir ? dirIcon() : fileIcon(item);
					const name = isDir ? theme.fg("accent", theme.bold(item)) : theme.fg("dim", item);
					treeLines.push(`${prefix}${icon}${name}`);
				}
				const remaining = items.length - shown.length;
				if (remaining > 0) {
					treeLines.push(`${getFgRule()}\u2514\u2500\u2500${getDReset()} ${theme.fg("muted", `\u2026 ${remaining} more entries`)}`);
				}
				text += `\n${treeLines.join('\n')}`;
				return makeText(ctx.lastComponent, withBranch(text, theme));
			},
		});
}
