import type { ToolStatus } from "../tool-group-component.ts";

export type ToolStatusAnimation = "blink" | "breathe";

export interface ToolGroupStatusDependencies {
	getToolStatusForGroup(tool: any): ToolStatus;
	toolDisplayName(name: string): string;
	readonly TOOL_STATUS_SUCCESS: string;
	readonly TOOL_STATUS_ERROR: string;
	readonly TOOL_STATUS_PENDING: string;
	readonly TRANSPARENT_RESET: string;
	readonly blinkPhaseIndex: number;
	readonly toolStatusAnimation: ToolStatusAnimation;
	paintStatusDot(colorAnsi: string): string;
	paintPendingBreatheDot(colorAnsi?: string): string;
}

export function createToolGroupStatusFormatting(deps: ToolGroupStatusDependencies) {
	function countToolStatuses(tools: any[]): Record<ToolStatus, number> {
		return tools.reduce((counts, tool) => {
			counts[deps.getToolStatusForGroup(tool)]++;
			return counts;
		}, { pending: 0, success: 0, error: 0 } as Record<ToolStatus, number>);
	}

	function statusText(status: ToolStatus, count: number): string {
		const label = status === "success" ? "done" : status === "error" ? "failed" : "running";
		const color = status === "success"
			? deps.TOOL_STATUS_SUCCESS
			: status === "error" ? deps.TOOL_STATUS_ERROR : deps.TOOL_STATUS_PENDING;
		return `${color}${count}${deps.TRANSPARENT_RESET} ${label}`;
	}

	function formatToolGroupCounts(tools: any[]): string {
		const counts = countToolStatuses(tools);
		const parts: string[] = [];
		if (counts.pending) parts.push(statusText("pending", counts.pending));
		if (counts.success) parts.push(statusText("success", counts.success));
		if (counts.error) parts.push(statusText("error", counts.error));
		return parts.join(`${deps.TRANSPARENT_RESET} • `);
	}

	function getToolName(tool: any): string {
		return typeof tool?.toolName === "string" && tool.toolName ? tool.toolName : "tool";
	}

	function getGroupedToolName(tools: any[]): string | undefined {
		const first = getToolName(tools[0]);
		return tools.every((tool) => getToolName(tool) === first) ? first : undefined;
	}

	function getToolGroupLabel(tools: any[]): string {
		const sameName = getGroupedToolName(tools);
		return sameName ? deps.toolDisplayName(sameName) : "Multiple Tools";
	}

	function getToolGroupOverallStatus(tools: any[]): ToolStatus {
		const counts = countToolStatuses(tools);
		if (counts.error > 0) return "error";
		if (counts.pending > 0) return "pending";
		return "success";
	}

	function groupStatusLight(status: ToolStatus): string {
		const color = status === "success"
			? deps.TOOL_STATUS_SUCCESS
			: status === "error" ? deps.TOOL_STATUS_ERROR : deps.TOOL_STATUS_PENDING;
		if (status === "pending") {
			return deps.toolStatusAnimation === "blink"
				? (deps.blinkPhaseIndex % 2 === 0 ? deps.paintStatusDot(deps.TOOL_STATUS_SUCCESS) : " ")
				: deps.paintPendingBreatheDot(deps.TOOL_STATUS_SUCCESS);
		}
		return deps.paintStatusDot(color);
	}

	const verbs: Record<string, [string, string, string, string]> = {
		read: ["read", "reading", "file", "files"],
		bash: ["ran", "running", "shell command", "shell commands"],
		grep: ["searched", "searching", "pattern", "patterns"],
		find: ["searched", "searching", "pattern", "patterns"],
		ls: ["listed", "listing", "directory", "directories"],
		Agent: ["launched", "launching", "agent", "agents"],
	};
	const verbKey: Record<string, string> = { find: "grep" };

	function groupSentence(tools: any[], running: boolean): string {
		const counts = new Map<string, number>();
		const called = new Map<string, number>();
		for (const tool of tools) {
			const name = getToolName(tool);
			if (verbs[name]) {
				const key = verbKey[name] ?? name;
				counts.set(key, (counts.get(key) ?? 0) + 1);
			} else {
				if (!counts.has("call")) counts.set("call", 0);
				const label = deps.toolDisplayName(name);
				called.set(label, (called.get(label) ?? 0) + 1);
			}
		}
		const parts = [...counts].map(([key, count]) => {
			if (key === "call") {
				const names = [...called].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join(", ");
				return `${running ? "calling" : "called"} ${names}`;
			}
			const [done, active, one, many] = verbs[key];
			return `${running ? active : done} ${count} ${count === 1 ? one : many}`;
		});
		const text = parts.join(", ");
		return text.charAt(0).toUpperCase() + text.slice(1);
	}

	function formatElapsedSeconds(ms: number): string {
		const secs = Math.max(0, Math.round(ms / 1000));
		return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
	}

	return {
		countToolStatuses,
		formatElapsedSeconds,
		formatToolGroupCounts,
		getGroupedToolName,
		getToolGroupLabel,
		getToolGroupOverallStatus,
		getToolName,
		groupSentence,
		groupStatusLight,
	};
}

