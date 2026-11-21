import type { Theme } from "@earendil-works/pi-coding-agent";
import { humanizeToolName, isMcpToolName } from "./tool-names.ts";
import type { ToolRenderContext } from "./tool-calls.ts";

export interface ToolResultRendererDependencies {
	makeText(last: unknown, text: string): any;
	runningPreviewBlock(
		result: any,
		statusText: string,
		expanded: boolean,
		theme: Theme,
		ctx: ToolRenderContext,
		options?: { lines?: string[]; totalLineCount?: number; styleLine?: (line: string) => string; tail?: boolean },
	): string;
	clearBlinkTimer(ctx: ToolRenderContext): void;
	setToolStatus(ctx: ToolRenderContext, status: "pending" | "success" | "error" | "idle"): void;
	readSettings(): { mcpOutputMode?: unknown };
	buildPreviewText(
		lines: string[],
		expanded: boolean,
		theme: Theme,
		limit: number,
		totalLineCount: number,
		styleLine: (line: string) => string,
	): string;
	previewLimit(): number;
	withBranch(content: string, theme: Theme): string;
	toolOutputDetailHint(theme: Theme, expanded: boolean): string;
	getTextContent(result: any): string;
	renderAgentToolResult(result: any, expanded: boolean, isPartial: boolean, theme: Theme, ctx: ToolRenderContext): any;
	getCapabilities(): { images?: unknown };
	getImageDimensions(data: string, mimeType: string): unknown;
	imageFallback(mimeType: string, dimensions?: unknown, filename?: string): string;
	getStringArg(args: any, ...keys: string[]): string;
	shortPath(cwd: string, path: string): string;
}

interface ParsedTaskListLine {
	id: string;
	status: string;
	subject: string;
}

function getMode<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function parseTaskListLine(line: string): ParsedTaskListLine | null {
	const match = line.match(/^#(\d+) \[([^\]]+)\] (.+)$/);
	if (!match) return null;
	return { id: match[1], status: match[2], subject: match[3] };
}

function formatTaskStatus(status: string, theme: Theme): string {
	if (status === "completed") return theme.fg("success", status);
	if (status === "in_progress") return theme.fg("warning", status);
	return theme.fg("muted", status);
}

function formatOpenAiSuccessLine(name: string, line: string, theme: Theme): string {
	const trimmed = line.trim();
	if (!trimmed) return theme.fg("success", "Done");
	if (name === "TaskCreate") {
		const match = trimmed.match(/^Task #(\d+) created successfully: (.+)$/);
		if (match) return `${theme.fg("success", "Created task")} ${theme.fg("accent", `#${match[1]}`)} ${theme.fg("muted", match[2])}`;
	}
	if (name === "TaskUpdate") {
		const match = trimmed.match(/^Updated task #(\d+) (.+)$/);
		if (match) return `${theme.fg("success", "Updated task")} ${theme.fg("accent", `#${match[1]}`)} ${theme.fg("muted", match[2])}`;
	}
	if (name === "TaskExecute") return `${theme.fg("success", "Started")} ${theme.fg("muted", trimmed)}`;
	if (name === "context_tag") {
		const match = trimmed.match(/^Created tag '([^']+)' at (.+)$/);
		if (match) return `${theme.fg("success", "Created tag")} ${theme.fg("accent", match[1])} ${theme.fg("muted", match[2])}`;
	}
	if (name === "context_checkout") {
		return `${theme.fg("success", "Checked out")} ${theme.fg("muted", trimmed.replace(/^Checked out\s*/i, ""))}`;
	}
	if (name === "TaskStop") return `${theme.fg("success", "Stopped")} ${theme.fg("muted", trimmed)}`;
	return theme.fg("muted", trimmed);
}

function renderTaskListResult(
	lines: string[],
	expanded: boolean,
	theme: Theme,
	ctx: ToolRenderContext,
	deps: ToolResultRendererDependencies,
): any {
	const tasks = lines.map(parseTaskListLine).filter((task): task is ParsedTaskListLine => task !== null);
	if (tasks.length === 0) {
		const text = lines.length === 0
			? theme.fg("muted", "no tasks")
			: deps.buildPreviewText(lines, expanded, theme, deps.previewLimit(), lines.length, (line) => theme.fg("dim", line));
		return deps.makeText(ctx.lastComponent, deps.withBranch(text, theme));
	}
	const pending = tasks.filter((task) => task.status === "pending").length;
	const inProgress = tasks.filter((task) => task.status === "in_progress").length;
	const completed = tasks.filter((task) => task.status === "completed").length;
	let summary = theme.fg("muted", `${tasks.length} tasks`);
	const parts: string[] = [];
	if (inProgress > 0) parts.push(`${theme.fg("warning", String(inProgress))} in progress`);
	if (pending > 0) parts.push(`${theme.fg("muted", String(pending))} pending`);
	if (completed > 0) parts.push(`${theme.fg("success", String(completed))} completed`);
	if (parts.length > 0) summary += ` ${theme.fg("muted", "•")} ${parts.join(` ${theme.fg("muted", "•")} `)}`;
	if (!expanded) {
		return deps.makeText(ctx.lastComponent, deps.withBranch(`${summary}${deps.toolOutputDetailHint(theme, expanded)}`, theme));
	}
	const shown = tasks.slice(0, deps.previewLimit());
	const preview = shown.map((task) => `${theme.fg("accent", `#${task.id}`)} ${formatTaskStatus(task.status, theme)} ${theme.fg("dim", task.subject)}`);
	const remaining = tasks.length - shown.length;
	if (remaining > 0) preview.push(theme.fg("muted", `... ${remaining} more tasks`));
	return deps.makeText(ctx.lastComponent, deps.withBranch(`${summary}\n${preview.join("\n")}`, theme));
}

export function getFirstImageBlock(result: any): { data: string; mimeType: string } | undefined {
	if (!Array.isArray(result?.content)) return undefined;
	return result.content.find((block: any) => block?.type === "image" && typeof block.data === "string" && typeof block.mimeType === "string");
}

function getReadImageFallback(result: any, ctx: ToolRenderContext, deps: ToolResultRendererDependencies): string {
	const image = getFirstImageBlock(result);
	if (!image) return "";
	let dimensions: unknown;
	try {
		dimensions = deps.getImageDimensions(image.data, image.mimeType) ?? undefined;
	} catch {
		dimensions = undefined;
	}
	const path = deps.getStringArg(ctx.args, "path", "file_path");
	const filename = path ? deps.shortPath(ctx.cwd ?? process.cwd(), path) : undefined;
	return deps.imageFallback(image.mimeType, dimensions, filename);
}

export function renderReadImageResult(
	result: any,
	expanded: boolean,
	theme: Theme,
	ctx: ToolRenderContext,
	deps: ToolResultRendererDependencies,
): any {
	const image = getFirstImageBlock(result);
	const mimeType = image?.mimeType ?? "image";
	const summary = `${theme.fg("success", "Image loaded")} ${theme.fg("muted", `[${mimeType}]`)}`;
	if (!expanded) {
		return deps.makeText(ctx.lastComponent, deps.withBranch(`${summary}${deps.toolOutputDetailHint(theme, expanded)}`, theme));
	}
	const noteLines = deps.getTextContent(result)
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !/^Read image file\b/i.test(line));
	const lines = [summary, ...noteLines.map((line) => theme.fg("dim", line))];
	if (!deps.getCapabilities().images || !ctx.showImages) {
		const fallback = getReadImageFallback(result, ctx, deps);
		if (fallback) lines.push(theme.fg("toolOutput", fallback));
	}
	return deps.makeText(ctx.lastComponent, deps.withBranch(lines.join("\n"), theme));
}

function renderMcpToolResultImpl(
	result: any,
	expanded: boolean,
	isPartial: boolean,
	theme: Theme,
	ctx: ToolRenderContext,
	deps: ToolResultRendererDependencies,
): any {
	if (isPartial) {
		return deps.makeText(ctx.lastComponent, deps.runningPreviewBlock(result, theme.fg("dim", "MCP running..."), expanded, theme, ctx, {
			styleLine: (line) => theme.fg("dim", line || " "),
		}));
	}
	deps.clearBlinkTimer(ctx);
	deps.setToolStatus(ctx, ctx.isError ? "error" : "success");
	const mode = getMode(deps.readSettings().mcpOutputMode, ["hidden", "summary", "preview"] as const, "preview");
	if (mode === "hidden") return deps.makeText(ctx.lastComponent, "");
	const raw = deps.getTextContent(result).trim();
	const lines = raw ? raw.split("\n") : [];
	if (lines.length === 0) {
		return deps.makeText(ctx.lastComponent, deps.withBranch(theme.fg(ctx.isError ? "error" : "success", ctx.isError ? "Failed" : "Done"), theme));
	}
	const statusText = ctx.isError
		? theme.fg("error", lines[0])
		: theme.fg("muted", `${lines.length} line${lines.length === 1 ? "" : "s"} returned`);
	if (mode === "summary") return deps.makeText(ctx.lastComponent, deps.withBranch(statusText, theme));
	if (!expanded) return deps.makeText(ctx.lastComponent, deps.withBranch(`${statusText}${deps.toolOutputDetailHint(theme, expanded)}`, theme));
	const preview = deps.buildPreviewText(
		lines,
		true,
		theme,
		deps.previewLimit(),
		lines.length,
		(line) => theme.fg(ctx.isError ? "error" : "dim", line || " "),
	);
	return deps.makeText(ctx.lastComponent, deps.withBranch(`${statusText}\n${preview}`, theme));
}

function renderOpenAiToolResultImpl(
	name: string,
	result: any,
	expanded: boolean,
	isPartial: boolean,
	theme: Theme,
	ctx: ToolRenderContext,
	deps: ToolResultRendererDependencies,
): any {
	if (name === "Agent") {
		const agentRow = deps.renderAgentToolResult(result, expanded, isPartial, theme, ctx);
		if (agentRow) return agentRow;
	}
	if (isPartial) {
		return deps.makeText(ctx.lastComponent, deps.runningPreviewBlock(result, theme.fg("dim", `${humanizeToolName(name)}...`), expanded, theme, ctx));
	}
	deps.clearBlinkTimer(ctx);
	deps.setToolStatus(ctx, ctx.isError ? "error" : "success");
	const raw = deps.getTextContent(result).trim();
	const lines = raw ? raw.split("\n") : [];
	const patchFiles = Array.isArray(ctx.state?._openAiPatchFiles) ? ctx.state._openAiPatchFiles : [];
	if (lines.length === 0) {
		if (patchFiles.length > 0) {
			const suffix = patchFiles.length === 1 ? patchFiles[0] : `${patchFiles.length} files`;
			return deps.makeText(ctx.lastComponent, deps.withBranch(`${theme.fg(ctx.isError ? "error" : "success", ctx.isError ? "Failed" : "Applied")} ${theme.fg("muted", suffix)}`, theme));
		}
		return deps.makeText(ctx.lastComponent, deps.withBranch(theme.fg(ctx.isError ? "error" : "success", ctx.isError ? "Failed" : "Done"), theme));
	}
	if (!ctx.isError && name === "TaskList") return renderTaskListResult(lines, expanded, theme, ctx, deps);
	const statusText = ctx.isError
		? theme.fg("error", lines[0])
		: theme.fg("muted", `${lines.length} line${lines.length === 1 ? "" : "s"} returned`);
	if (!expanded) {
		return deps.makeText(ctx.lastComponent, deps.withBranch(`${statusText}${deps.toolOutputDetailHint(theme, expanded)}`, theme));
	}
	if (!ctx.isError && lines.length === 1) {
		return deps.makeText(ctx.lastComponent, deps.withBranch(formatOpenAiSuccessLine(name, lines[0], theme), theme));
	}
	const preview = lines.length === 1
		? theme.fg(ctx.isError ? "error" : "dim", lines[0])
		: deps.buildPreviewText(
			lines,
			true,
			theme,
			deps.previewLimit(),
			lines.length,
			(line) => theme.fg(ctx.isError ? "error" : "dim", line || " "),
		);
	return deps.makeText(ctx.lastComponent, deps.withBranch(`${statusText}\n${preview}`, theme));
}

export function renderGenericToolResult(
	name: string,
	result: any,
	options: any,
	theme: Theme,
	ctx: ToolRenderContext,
	deps: ToolResultRendererDependencies,
): any {
	return isMcpToolName(name)
		? renderMcpToolResultImpl(result, !!options?.expanded, !!options?.isPartial, theme, ctx, deps)
		: renderOpenAiToolResultImpl(name, { content: result.content, details: result.details }, !!options?.expanded, !!options?.isPartial, theme, ctx, deps);
}

export function renderMcpToolResult(
	result: any,
	expanded: boolean,
	isPartial: boolean,
	theme: Theme,
	ctx: ToolRenderContext,
	deps: ToolResultRendererDependencies,
): any {
	return renderMcpToolResultImpl(result, expanded, isPartial, theme, ctx, deps);
}

export function renderOpenAiToolResult(
	name: string,
	result: any,
	expanded: boolean,
	isPartial: boolean,
	theme: Theme,
	ctx: ToolRenderContext,
	deps: ToolResultRendererDependencies,
): any {
	return renderOpenAiToolResultImpl(name, result, expanded, isPartial, theme, ctx, deps);
}
