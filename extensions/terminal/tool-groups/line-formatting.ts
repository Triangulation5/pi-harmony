import type { ToolStatus } from "../tool-group-component.ts";

export interface CollapsedToolEntry {
	tools: any[];
	name: string;
	subject: string;
}

export interface ToolGroupLineDependencies {
	readonly BRANCH_INDENT: string;
	readonly TRANSPARENT_RESET: string;
	readonly TRAILING_MARK: string;
	readonly WRAP_MARK: string;
	readonly CLIP_MARK: string;
	readonly fgDim: string;
	buildBashCommandPresentation(command: string): { headline: string };
	clampLineWidth(line: string, width: number): string;
	countToolStatuses(tools: any[]): Record<ToolStatus, number>;
	currentToolBranchAnsi(): string;
	formatToolGroupCounts(tools: any[]): string;
	getToolName(tool: any): string;
	getToolStatusForGroup(tool: any): ToolStatus;
	groupStatusLight(status: ToolStatus): string;
	isTerminalImageLine(line: string): boolean;
	parseNamespacedMcpToolName(name: string): unknown;
	shortPath(cwd: string, path: string): string;
	stripAnsi(text: string): string;
	summarizeDirectMcpArgs(args: any, summarizeText: (text: string, maxLength?: number) => string): string;
	summarizeText(text: string, maxLength?: number): string;
	summarizeUnknownToolArgs(args: any): string;
	toolDisplayName(name: string): string;
	trimRenderedBlankLines(lines: string[]): string[];
	truncateToWidth(text: string, width: number, ellipsis?: string, pad?: boolean): string;
	visibleWidth(text: string): number;
}

export function toolRowPad(firstLine: string): number {
	const lead = /^[ ●•·]*/.exec(firstLine.replace(/\x1b\[[0-9;]*m/g, ""))?.[0].length ?? 0;
	return Math.max(0, lead - 2);
}

export function createToolGroupLineFormatting(deps: ToolGroupLineDependencies) {
	function getRepeatedToolSubject(tools: any[], groupedName: string | undefined): string {
		if (!groupedName || tools.length === 0) return "";
		if (groupedName === "read") {
			const paths = tools.map((tool) => String(tool?.args?.path ?? ""));
			if (paths[0] && paths.every((path) => path === paths[0])) {
				return deps.shortPath(process.cwd(), paths[0]);
			}
		}
		const summaries = tools.map(getToolArgSummary);
		return summaries[0] && summaries.every((summary) => summary === summaries[0])
			? summaries[0]
			: "";
	}

	function escapeRegex(text: string): string {
		return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	function stripGroupedToolLabel(line: string, label: string | undefined): string {
		if (!label) return line;
		const ansi = "(?:\\x1b\\[[0-9;]*m)*";
		const pattern = new RegExp(`^(${ansi})${escapeRegex(label)}(${ansi})\\s+`);
		return line.replace(pattern, "$1$2");
	}

	function isChromeOnlyLine(line: string): boolean {
		const plain = deps.stripAnsi(line).trim();
		return plain.length === 0 || /^[─━╭╮╰╯┌┐└┘│├┤┬┴┼\s]+$/.test(plain);
	}

	function stripToolChrome(lines: string[]): string[] {
		return deps.trimRenderedBlankLines(lines).filter((line) => !isChromeOnlyLine(line));
	}

	function stripLeadingToolStatus(line: string): string {
		return line.replace(
			/^((?:\x1b\[[0-9;]*m|[ \t]|[├└│─])*)(?:\x1b\[[0-9;]*m)*(?:[●○✗■⬤•·]| )(?:\x1b\[[0-9;]*m)*\s+/,
			"$1",
		);
	}

	function trimAnsiLeftBy(text: string, count: number): string {
		let current = text;
		for (let i = 0; i < count; i++) {
			const next = current.replace(/^((?:\x1b\[[0-9;]*m)*) /, "$1");
			if (next === current) break;
			current = next;
		}
		return current;
	}

	function trimAnsiLeft(text: string): string {
		let current = text;
		while (true) {
			const next = current.replace(/^((?:\x1b\[[0-9;]*m)*)[ \t]+/, "$1");
			if (next === current) return current;
			current = next;
		}
	}

	function removeGroupedToolPrefix(line: string, groupedLabel?: string): string {
		return trimAnsiLeft(stripGroupedToolLabel(trimAnsiLeft(stripLeadingToolStatus(line)), groupedLabel));
	}

	function tintGroupedToolLine(line: string): string {
		return trimAnsiLeft(line);
	}

	function getToolArgSummary(tool: any): string {
		const args = tool?.args ?? {};
		const name = deps.getToolName(tool);
		if (name === "read") {
			let value = deps.shortPath(process.cwd(), args.path ?? "");
			const parts: string[] = [];
			if (args.offset) parts.push(`offset=${args.offset}`);
			if (args.limit) parts.push(`limit=${args.limit}`);
			if (parts.length > 0) value += ` (${parts.join(", ")})`;
			return value;
		}
		if (name === "bash") return deps.buildBashCommandPresentation(args.command ?? "").headline;
		if (name === "grep" || name === "find") {
			return `"${deps.summarizeText(args.pattern ?? "", 40)}"${args.path ? ` in ${args.path}` : ""}`;
		}
		if (name === "ls") return deps.shortPath(process.cwd(), args.path ?? ".");
		if (deps.parseNamespacedMcpToolName(name)) return deps.summarizeDirectMcpArgs(args, deps.summarizeText);
		return deps.summarizeUnknownToolArgs(args);
	}

	function getToolCallLine(tool: any): string {
		const value = tool?.callRendererComponent?.value;
		if (typeof value === "string" && value.trim()) {
			const line = value.split("\n").find((candidate) => deps.stripAnsi(candidate).trim()) ?? value;
			return line.replaceAll(deps.WRAP_MARK, "").replaceAll(deps.CLIP_MARK, "");
		}
		const summary = getToolArgSummary(tool);
		const label = deps.toolDisplayName(deps.getToolName(tool));
		return `${label}${summary ? ` ${summary}` : ""}`;
	}

	function alignTrailingMarkedLine(line: string, width: number): string {
		const markerIndex = line.indexOf(deps.TRAILING_MARK);
		if (markerIndex === -1) return deps.clampLineWidth(line, width);
		const safeWidth = Math.max(1, width);
		const left = line.slice(0, markerIndex);
		const right = line.slice(markerIndex + deps.TRAILING_MARK.length);
		const rightWidth = deps.visibleWidth(right);
		if (rightWidth >= safeWidth) return deps.truncateToWidth(right, safeWidth, "", false);
		const leftBudget = Math.max(0, safeWidth - rightWidth - 2);
		const clippedLeft = leftBudget > 0 ? deps.truncateToWidth(left, leftBudget, "...", false) : "";
		const gap = Math.max(1, safeWidth - deps.visibleWidth(clippedLeft) - rightWidth);
		return `${clippedLeft}${" ".repeat(gap)}${right}`;
	}

	function getCompactToolLine(tool: any, width: number, groupedLabel?: string, showTrailing = true): string {
		let content = removeGroupedToolPrefix(getToolCallLine(tool), groupedLabel);
		if (!showTrailing) content = content.split(deps.TRAILING_MARK, 1)[0] ?? content;
		return alignTrailingMarkedLine(content || deps.getToolName(tool), width);
	}

	function stripReadRangeFromToolLine(line: string): string {
		return line.replace(
			/\s+(?:\x1b\[[0-9;]*m)*\((?:offset|limit)=\d+(?:,\s*(?:offset|limit)=\d+)*\)(?=(?:\x1b\[[0-9;]*m)*$)/,
			"",
		);
	}

	function getCollapsedToolEntryLine(entry: CollapsedToolEntry, width: number, groupedLabel?: string): string {
		if (entry.tools.length === 1) return getCompactToolLine(entry.tools[0], width, groupedLabel);
		const counts = deps.countToolStatuses(entry.tools);
		const attentionCounts = counts.pending > 0 || counts.error > 0
			? ` • ${deps.formatToolGroupCounts(entry.tools)}`
			: "";
		const suffix = ` ${deps.fgDim}×${entry.tools.length}${deps.TRANSPARENT_RESET}${attentionCounts}`;
		const firstLine = getCompactToolLine(entry.tools[0], Math.max(1, width - deps.visibleWidth(suffix)), groupedLabel, false);
		const sharedLine = entry.name === "read" ? stripReadRangeFromToolLine(firstLine) : firstLine;
		return deps.clampLineWidth(`${sharedLine}${suffix}`, width);
	}

	function getExpandedToolGroupLines(tool: any, width: number, groupedLabel?: string): string[] {
		const rendered = stripToolChrome(tool.render(Math.max(1, width)));
		const childPad = toolRowPad(rendered[0] ?? "");
		const lines = rendered.map((line, index) =>
			index === 0 ? tintGroupedToolLine(removeGroupedToolPrefix(line, groupedLabel)) : trimAnsiLeftBy(line, childPad),
		);
		return lines.length > 0
			? lines
			: [`${deps.fgDim}${String(tool?.toolName ?? "tool")}${deps.TRANSPARENT_RESET}`];
	}

	function branchPrefix(index: number, total: number): string {
		const branch = index === total - 1 ? "└" : "├";
		const rule = deps.currentToolBranchAnsi();
		return ` ${deps.BRANCH_INDENT}${rule}${branch}${deps.TRANSPARENT_RESET} `;
	}

	function branchContinuation(index: number, total: number): string {
		const rule = deps.currentToolBranchAnsi();
		return index === total - 1 ? `   ${deps.BRANCH_INDENT}` : ` ${deps.BRANCH_INDENT}${rule}│${deps.TRANSPARENT_RESET} `;
	}

	function formatBranchedToolLines(lines: string[], index: number, total: number, width: number, status: ToolStatus): string[] {
		const output: string[] = [];
		const content = lines.filter((line) => deps.isTerminalImageLine(line) || deps.stripAnsi(line).trim().length > 0);
		const safeContent = content.length > 0 ? content : [""];
		const light = deps.groupStatusLight(status);
		for (let lineIndex = 0; lineIndex < safeContent.length; lineIndex++) {
			const line = safeContent[lineIndex];
			if (deps.isTerminalImageLine(line)) {
				output.push(line);
				continue;
			}
			const body = lineIndex === 0 ? removeGroupedToolPrefix(line) : line;
			const prefix = lineIndex === 0 ? `${branchPrefix(index, total)}${light} ` : branchContinuation(index, total);
			output.push(deps.clampLineWidth(`${prefix}${body}`, width));
		}
		return output;
	}

	return {
		formatBranchedToolLines,
		getCollapsedToolEntryLine,
		getCompactToolLine,
		getExpandedToolGroupLines,
		getRepeatedToolSubject,
	};
}

