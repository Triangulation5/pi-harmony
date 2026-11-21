import type { Theme } from "@earendil-works/pi-coding-agent";
import { genericToolLabel, isMcpToolName, parseNamespacedMcpToolName } from "./tool-names.ts";

export interface ToolRenderContext {
	lastComponent: unknown;
	state: Record<string, any>;
	args?: any;
	cwd?: string;
	argsComplete?: boolean;
	[key: string]: any;
}

export interface ToolCallRendererDependencies {
	getStringArg(args: any, ...keys: string[]): string;
	getStringArrayArg(args: any, ...keys: string[]): string[];
	summarizeText(text: string, max?: number): string;
	summarizeUnknownToolArgs(args: any): string;
	shortPath(cwd: string, path: string): string;
	syncToolCallStatus(ctx: ToolRenderContext): void;
	stableCallSummary(ctx: ToolRenderContext, key: string, build: () => string): string;
	toolHeader(label: string, summary: string, theme: Theme, statusDot: string, trailing: string): string;
	toolStatusDot(ctx: ToolRenderContext, theme: Theme): string;
	liveLineCountTrailing(ctx: ToolRenderContext, theme: Theme): string;
	makeText(last: unknown, text: string): any;
}

const DIRECT_MCP_SUMMARY_KEYS = [
	"description", "subject", "title", "query", "path", "file_path", "url", "command", "name",
	"agent_id", "agentId", "taskId", "task_id", "threadId", "drop", "target", "message", "prompt", "task",
] as const;

function summarizeArgValue(value: unknown): string {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number")) return value.join(", ");
	return "";
}

export function summarizeDirectMcpArgs(args: any, summarizeText: (text: string, max?: number) => string): string {
	if (!args || typeof args !== "object") return "";
	for (const key of DIRECT_MCP_SUMMARY_KEYS) {
		const value = summarizeArgValue(args[key]);
		if (value) return summarizeText(value, 72);
	}
	for (const [key, raw] of Object.entries(args)) {
		const value = summarizeArgValue(raw);
		if (value) return summarizeText(`${key}: ${value}`, 72);
	}
	return "";
}

function summarizeMcpToolCall(name: string, args: any, theme: Theme, deps: ToolCallRendererDependencies): string {
	const direct = parseNamespacedMcpToolName(name);
	if (direct) {
		const detail = summarizeDirectMcpArgs(args, deps.summarizeText);
		return `${direct.server}:${direct.tool}${detail ? ` ${theme.fg("muted", detail)}` : ""}`;
	}
	const tool = deps.getStringArg(args, "tool");
	if (tool) return args?.server ? `${args.server}:${tool}` : tool;
	const connect = deps.getStringArg(args, "connect");
	if (connect) return `connect ${connect}`;
	const search = deps.getStringArg(args, "search", "describe", "server", "action");
	if (search) return deps.summarizeText(search, 72);
	return theme.fg("muted", "status");
}

function summarizeGenericToolCall(
	name: string,
	args: any,
	theme: Theme,
	shortenPath: (path: string) => string,
	deps: ToolCallRendererDependencies,
): string {
	return isMcpToolName(name)
		? summarizeMcpToolCall(name, args, theme, deps)
		: summarizeOpenAiToolCall(name, args, theme, shortenPath, deps);
}

function extractApplyPatchFiles(patchText: string): string[] {
		if (!patchText) return [];
		const files = new Set<string>();
		for (const match of patchText.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) {
			const filePath = match[1]?.trim();
			if (filePath) files.add(filePath);
		}
		return [...files];
}

export function renderGenericToolCall(
	name: string,
	args: any,
	theme: Theme,
	ctx: ToolRenderContext,
	deps: ToolCallRendererDependencies,
): any {
	deps.syncToolCallStatus(ctx);
	ctx.state._openAiPatchFiles = [];
	const shortenPath = (path: string) => deps.shortPath(ctx.cwd ?? process.cwd(), path);
	const summary = deps.stableCallSummary(ctx, "_callSummary", () =>
		summarizeGenericToolCall(name, args, theme, shortenPath, deps),
	);
	return deps.makeText(
		ctx.lastComponent,
		deps.toolHeader(genericToolLabel(name), summary, theme, deps.toolStatusDot(ctx, theme), deps.liveLineCountTrailing(ctx, theme)),
	);
}

export function summarizeOpenAiToolCall(
	name: string,
	args: any,
	theme: Theme,
	shortenPath: (path: string) => string,
	deps: ToolCallRendererDependencies,
): string {
	switch (name) {
		case "apply_patch": {
			const patchText = deps.getStringArg(args, "patchText", "patch_text");
			const files = extractApplyPatchFiles(patchText);
			if (files.length === 0) return theme.fg("muted", "patch");
			if (files.length === 1) return shortenPath(files[0]);
			return `${shortenPath(files[0])} ${theme.fg("muted", `(+${files.length - 1} files)`)}`;
		}
		case "webfetch":
			return deps.getStringArg(args, "url") || theme.fg("muted", "fetch page");
		case "fetch_content": {
			const url = deps.getStringArg(args, "url");
			if (url) return url;
			const urls = deps.getStringArrayArg(args, "urls");
			if (urls.length === 0) return theme.fg("muted", "fetch content");
			if (urls.length === 1) return urls[0];
			return `${urls[0]} ${theme.fg("muted", `(+${urls.length - 1} urls)`)}`;
		}
		case "get_search_content":
			return deps.getStringArg(args, "responseId", "response_id") || theme.fg("muted", "load cached content");
		case "web_search": {
			const query = deps.getStringArg(args, "query");
			if (query) return deps.summarizeText(query, 72);
			const queries = deps.getStringArrayArg(args, "queries");
			if (queries.length === 0) return theme.fg("muted", "search web");
			if (queries.length === 1) return deps.summarizeText(queries[0], 72);
			return `${deps.summarizeText(queries[0], 48)} ${theme.fg("muted", `(+${queries.length - 1} queries)`)}`;
		}
		case "code_search":
			return deps.summarizeText(deps.getStringArg(args, "query") || "search code", 72);
		case "question":
			return deps.summarizeText(deps.getStringArg(args, "question") || "ask user", 72);
		case "questionnaire": {
			const questions = Array.isArray(args?.questions) ? args.questions.length : 0;
			return questions > 0 ? `${questions} questions` : theme.fg("muted", "questionnaire");
		}
		case "context_tag":
			return deps.getStringArg(args, "name") || theme.fg("muted", "save point");
		case "context_log":
			return theme.fg("muted", "history");
		case "context_checkout":
			return deps.getStringArg(args, "target") || theme.fg("muted", "checkout context");
		case "annotate":
			return deps.getStringArg(args, "url") || theme.fg("muted", "current tab");
		case "alpha_search":
			return deps.summarizeText(deps.getStringArg(args, "query") || "search papers", 72);
		case "alpha_get_paper":
		case "alpha_ask_paper":
		case "alpha_annotate_paper":
			return deps.getStringArg(args, "paper") || theme.fg("muted", "paper");
		case "alpha_read_code":
			return deps.getStringArg(args, "githubUrl", "github_url") || theme.fg("muted", "repository");
		case "Skill":
			return deps.getStringArg(args, "name") || theme.fg("muted", "run skill");
		case "EnterPlanMode":
			return theme.fg("muted", "enable read-only planning");
		case "ExitPlanMode":
			return theme.fg("muted", "present plan");
		case "Agent": {
			const description = deps.summarizeText(deps.getStringArg(args, "description", "prompt") || "launch agent", 72);
			const type = deps.getStringArg(args, "subagent_type");
			return type ? `${description} ${theme.fg("muted", `(${type})`)}` : description;
		}
		case "get_subagent_result":
			return deps.getStringArg(args, "agent_id") || theme.fg("muted", "agent result");
		case "steer_subagent":
			return deps.getStringArg(args, "agent_id") || theme.fg("muted", "steer agent");
		case "TaskCreate":
			return deps.summarizeText(deps.getStringArg(args, "subject") || "create task", 72);
		case "TaskList":
			return theme.fg("muted", "task list");
		case "TaskGet":
		case "TaskUpdate":
			return deps.getStringArg(args, "taskId", "task_id") || theme.fg("muted", "task");
		case "TaskOutput":
		case "TaskStop":
			return deps.getStringArg(args, "task_id", "taskId") || theme.fg("muted", "background task");
		case "TaskExecute": {
			const taskIds = deps.getStringArrayArg(args, "task_ids", "taskIds");
			if (taskIds.length === 0) return theme.fg("muted", "start tasks");
			return taskIds.length === 1 ? taskIds[0] : `${taskIds[0]} ${theme.fg("muted", `(+${taskIds.length - 1} tasks)`)}`;
		}
		default:
			return deps.summarizeUnknownToolArgs(args);
	}
}
