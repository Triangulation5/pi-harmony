const CORE_TOOL_OVERRIDES = new Set(["read", "bash", "grep", "find", "ls", "write", "edit"]);
const CUSTOM_RENDERER_TOOLS = new Set(["todo", "ask_user_question"]);

const OPENAI_STYLE_TOOL_NAMES = new Set([
	"apply_patch",
	"webfetch",
	"question",
	"questionnaire",
	"context_tag",
	"context_log",
	"context_checkout",
	"annotate",
	"web_search",
	"code_search",
	"fetch_content",
	"get_search_content",
	"alpha_search",
	"alpha_get_paper",
	"alpha_ask_paper",
	"alpha_annotate_paper",
	"alpha_list_annotations",
	"alpha_read_code",
	"Skill",
	"EnterPlanMode",
	"ExitPlanMode",
	"Agent",
	"get_subagent_result",
	"steer_subagent",
	"TaskCreate",
	"TaskList",
	"TaskGet",
	"TaskUpdate",
	"TaskOutput",
	"TaskStop",
	"TaskExecute",
	"ctx_search",
	"ctx_memory",
	"ctx_note",
	"ctx_expand",
	"ctx_reduce",
	"todowrite",
]);

export function isMcpToolCandidate(tool: unknown): boolean {
	const rec = tool as Record<string, unknown> | undefined;
	const name = typeof rec?.name === "string" ? rec.name : "";
	const description = typeof rec?.description === "string" ? rec.description : "";
	return name === "mcp" || /\bmcp\b/i.test(description);
}

export function isOpenAiToolCandidate(tool: unknown): boolean {
	const rec = tool as Record<string, unknown> | undefined;
	const name = typeof rec?.name === "string" ? rec.name : "";
	if (!name || CORE_TOOL_OVERRIDES.has(name) || isMcpToolCandidate(tool)) return false;
	return OPENAI_STYLE_TOOL_NAMES.has(name);
}

export function humanizeToolName(name: string): string {
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isMcpToolName(name: string): boolean {
	return name === "mcp" || /^mcp[_:-]/i.test(name) || /[_:-]mcp[_:-]/i.test(name);
}

export function parseNamespacedMcpToolName(name: string): { server: string; tool: string } | undefined {
	const match = /^mcp__(.+?)__(.+)$/.exec(name);
	return match ? { server: match[1], tool: match[2] } : undefined;
}

export function toolDisplayName(name: string): string {
	const direct = parseNamespacedMcpToolName(name);
	return humanizeToolName(direct ? direct.tool : name);
}

export function shouldUseGenericToolRenderer(name: unknown): boolean {
	return typeof name === "string" && name.length > 0 && !CORE_TOOL_OVERRIDES.has(name) && !CUSTOM_RENDERER_TOOLS.has(name);
}

export function genericToolLabel(name: string): string {
	return isMcpToolName(name) ? "MCP" : humanizeToolName(name);
}
