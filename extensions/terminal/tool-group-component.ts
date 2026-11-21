import { Container } from "@earendil-works/pi-tui";
import type { MouseLayoutEntry, TuiMouseDispatchResult, TuiMouseEvent } from "./fullscreen-mouse.ts";

export type ToolStatus = "pending" | "success" | "error";

interface ToolGroupDependencies {
	ACTIVE_TOOL_GROUPS: Set<unknown>;
	BRANCH_INDENT: string;
	COMPONENT_PARENT: symbol;
	FG_DIM: string;
	TRANSPARENT_RESET: string;
	readonly TOOL_STATUS_ERROR: string;
	readonly _toolBranchVisualEpoch: number;
	readonly toolBackgroundMode: string;
	applyGroupHover(lines: string[], layout: { children: MouseLayoutEntry[] } | undefined, hoverStart: unknown): string[];
	claimClickHover(owner: object, clear: () => void): void;
	clampLineWidth(line: string, width: number): string;
	countToolStatuses(tools: any[]): Record<ToolStatus, number>;
	currentThemePaletteFingerprint(): string | undefined;
	currentToolBranchAnsi(): string;
	dispatchTarget(component: any, event: TuiMouseEvent, result: any): TuiMouseDispatchResult | undefined;
	forgetClickHover(owner: object): void;
	formatBranchedToolLines(lines: string[], index: number, total: number, width: number, status: ToolStatus): string[];
	formatElapsedSeconds(ms: number): string;
	getCollapsedToolEntryLine(entry: { tools: any[]; name: string; subject: string }, width: number): string;
	getCompactToolLine(tool: any, width: number, groupedLabel?: string, showTrailing?: boolean): string;
	getExpandedToolGroupLines(tool: any, width: number, groupedLabel?: string): string[];
	getGlobalPiTheme(): unknown;
	getGroupHover(group: object): unknown;
	getGroupedToolName(tools: any[]): string | undefined;
	getRepeatedToolSubject(tools: any[], groupedName: string | undefined): string;
	getToolGroupLabel(tools: any[]): string;
	getToolName(tool: any): string;
	getToolStatusForGroup(tool: any): ToolStatus;
	groupSentence(tools: any[], running: boolean): string;
	groupStatusLight(status: ToolStatus): string;
	isPrimaryClick(event: TuiMouseEvent): boolean;
	mouseLayoutTarget(
		layout: { width: number; children: MouseLayoutEntry[] } | undefined,
		event: TuiMouseEvent,
	): MouseLayoutEntry | undefined;
	rememberMouseLayout(component: object, width: number, children: MouseLayoutEntry[]): void;
	requestComponentRender(component: any): void;
	safeFgAnsi(theme: unknown, key: string): string | null;
	setGroupHover(group: any, rowStart: number): boolean;
	setToolHover(component: any, hovered: boolean): boolean;
	stripAnsi(text: string): string;
	toggleGroupedTools(group: any, tools: any[], event?: TuiMouseEvent): { handled: true } | undefined;
	toolOutputDetailHint(theme: any, expanded: boolean, hasMore?: boolean): string;
}

export function createToolGroupComponent(deps: ToolGroupDependencies) {
	return class ToolGroupComponent extends Container {
		private tools: any[] = [];
		expanded = false;
		groupMouseLayout?: { width: number; children: MouseLayoutEntry[] };
		private dirty = true;
		private cachedWidth?: number;
		private cachedEpoch?: number;
		private cachedMode?: string;
		private cachedExpanded?: boolean;
		private cachedBlinkPhase?: boolean;
		private cachedStatusKey?: string;
		private cachedToolCount?: number;
		private cachedLines?: string[];
		private paletteFingerprint?: string;
		private runStartedAt?: number;

		private clearRenderCache(): void {
			this.dirty = true;
			this.cachedWidth = undefined;
			this.cachedEpoch = undefined;
			this.cachedMode = undefined;
			this.cachedExpanded = undefined;
			this.cachedBlinkPhase = undefined;
			this.cachedStatusKey = undefined;
			this.cachedToolCount = undefined;
			this.cachedLines = undefined;
		}

		private statusSnapshot(): { key: string; pending: number; success: number; error: number } {
			const counts = deps.countToolStatuses(this.tools);
			let idBits = "";
			for (let i = 0; i < this.tools.length; i++) {
				const tool = this.tools[i];
				const id = typeof tool?.toolCallId === "string" ? tool.toolCallId : deps.getToolName(tool);
				const flags = (tool?.isPartial === true ? 1 : 0)
					| (tool?.result?.isError ? 2 : 0)
					| (tool?.expanded ? 4 : 0)
					| (tool?.argsComplete ? 8 : 0)
					| (tool?.executionStarted ? 16 : 0);
				idBits += `${id}:${flags},`;
			}
			return {
				key: `${this.tools.length}:${counts.pending}:${counts.success}:${counts.error}:${idBits}`,
				pending: counts.pending,
				success: counts.success,
				error: counts.error,
			};
		}

		addTool(tool: any): void {
			deps.ACTIVE_TOOL_GROUPS.add(this);
			this.tools.push(tool);
			deps.setToolHover(tool, false);
			deps.forgetClickHover(tool);
			tool[deps.COMPONENT_PARENT] = this;
			this.clearRenderCache();
		}

		releaseTools(): any[] {
			const tools = this.tools;
			this.tools = [];
			deps.ACTIVE_TOOL_GROUPS.delete(this);
			this.clearRenderCache();
			return tools;
		}

		setExpanded(expanded: boolean): void {
			if (this.expanded === expanded && this.tools.every((tool) => tool.expanded === expanded)) return;
			this.expanded = expanded;
			for (const tool of this.tools) tool.setExpanded?.(expanded);
			this.clearRenderCache();
		}

		invalidate(): void {
			this.clearRenderCache();
			const palette = deps.currentThemePaletteFingerprint();
			if (palette === undefined || palette === this.paletteFingerprint) return;
			const changed = this.paletteFingerprint !== undefined;
			this.paletteFingerprint = palette;
			if (changed) for (const tool of this.tools) tool?.invalidate?.();
		}

		handleMouse(event: TuiMouseEvent): TuiMouseDispatchResult | undefined {
			const target = deps.mouseLayoutTarget(this.groupMouseLayout, event);
			if (event.type === "move") {
				const header = this.groupMouseLayout?.children.find((entry) => !entry.component);
				const row = target ? (header?.top ?? target.top) : -1;
				deps.claimClickHover(this, () => { if (deps.setGroupHover(this, -1)) deps.requestComponentRender(this); });
				return deps.dispatchTarget(this, event, deps.setGroupHover(this, row) ? { handled: true, render: true } : undefined);
			}
			if (deps.isPrimaryClick(event) && target) {
				return deps.dispatchTarget(this, event, deps.toggleGroupedTools(this, this.tools, event));
			}
			return undefined;
		}

		render(width: number): string[] {
			if (this.tools.length === 0) {
				deps.rememberMouseLayout(this, width, []);
				return [];
			}
			const safeWidth = Number.isFinite(width) ? Math.max(1, Math.floor(width)) : 1;
			if (this.paletteFingerprint === undefined) this.paletteFingerprint = deps.currentThemePaletteFingerprint();
			if (
				!this.dirty
				&& this.cachedLines
				&& this.cachedWidth === safeWidth
				&& this.cachedEpoch === deps._toolBranchVisualEpoch
				&& this.cachedMode === deps.toolBackgroundMode
				&& this.cachedExpanded === this.expanded
			) {
				return deps.applyGroupHover(this.cachedLines, this.groupMouseLayout, deps.getGroupHover(this));
			}

			const status = this.statusSnapshot();
			const canCache = status.pending === 0;
			const groupedName = deps.getGroupedToolName(this.tools);
			const label = deps.getToolGroupLabel(this.tools);
			const overall: ToolStatus = status.error > 0 ? "error" : status.pending > 0 ? "pending" : "success";
			const mouseChildren: MouseLayoutEntry[] = [];
			let mouseY = 0;
			const recordLines = (rowLines: string[], target?: any) => {
				mouseChildren.push({ component: target, height: rowLines.length, top: mouseY });
				mouseY += rowLines.length;
			};
			const pendingTools = this.tools.filter((tool) => deps.getToolStatusForGroup(tool) === "pending");
			const light = deps.groupStatusLight(overall);
			const running = status.pending > 0;
			if (running) this.runStartedAt ??= Date.now();
			else this.runStartedAt = undefined;
			const total = this.tools.length;
			const lines: string[] = [];
			const subject = this.expanded ? "" : deps.getRepeatedToolSubject(this.tools, groupedName);
			const collapseToSingleRow = !this.expanded && !!groupedName && !!subject;
			if (collapseToSingleRow) {
				const entry = { tools: this.tools, name: groupedName, subject };
				const entryLine = deps.getCollapsedToolEntryLine(entry, Math.max(1, safeWidth - 3));
				const row = [deps.clampLineWidth(
					` ${light} ${entryLine}${deps.toolOutputDetailHint(undefined, false, true)}`,
					safeWidth,
				)];
				recordLines(row, undefined);
				lines.push(...row);
			} else {
				const sentence = deps.groupSentence(this.tools, running);
				const elapsed = running && this.runStartedAt !== undefined
					? `${deps.FG_DIM} · ${deps.formatElapsedSeconds(Date.now() - this.runStartedAt)}${deps.TRANSPARENT_RESET}`
					: "";
				const failed = status.error > 0 ? ` ${deps.TOOL_STATUS_ERROR}· ${status.error} failed${deps.TRANSPARENT_RESET}` : "";
				const summary = ` ${light} ${sentence}${running ? "..." : ""}${elapsed}${failed}${deps.toolOutputDetailHint(undefined, this.expanded, true)}`;
				const header = [" ".repeat(safeWidth), deps.clampLineWidth(summary, safeWidth)];
				if (running && !this.expanded) {
					const active = pendingTools[pendingTools.length - 1];
					if (active) {
						const activeLine = deps.stripAnsi(deps.getCompactToolLine(active, Math.max(1, safeWidth - 3), undefined, false))
							.trim()
							.replace(/\s+\(\d+ lines?\)$/, "");
						const dim = deps.safeFgAnsi(deps.getGlobalPiTheme(), "dim") ?? deps.FG_DIM;
						header.push(deps.clampLineWidth(` ${deps.BRANCH_INDENT}${deps.currentToolBranchAnsi()}└${deps.TRANSPARENT_RESET} ${dim}${activeLine}${deps.TRANSPARENT_RESET}`, safeWidth));
					}
				}
				recordLines(header, undefined);
				lines.push(...header);
				const childWidth = Math.max(1, safeWidth - 6 - deps.BRANCH_INDENT.length);
				if (this.expanded) {
					for (let index = 0; index < total; index++) {
						const tool = this.tools[index];
						const branched = deps.formatBranchedToolLines(
							deps.getExpandedToolGroupLines(tool, childWidth, groupedName ? label : undefined),
							index,
							total,
							safeWidth,
							deps.getToolStatusForGroup(tool),
						);
						const row = branched.map((line) => deps.clampLineWidth(line, safeWidth));
						recordLines(row, tool);
						lines.push(...row);
					}
				}
			}
			deps.rememberMouseLayout(this, safeWidth, mouseChildren);

			if (canCache) {
				this.dirty = false;
				this.cachedWidth = safeWidth;
				this.cachedEpoch = deps._toolBranchVisualEpoch;
				this.cachedMode = deps.toolBackgroundMode;
				this.cachedExpanded = this.expanded;
				this.cachedBlinkPhase = true;
				this.cachedStatusKey = status.key;
				this.cachedToolCount = total;
				this.cachedLines = lines;
			} else {
				this.clearRenderCache();
			}
			return deps.applyGroupHover(lines, this.groupMouseLayout, deps.getGroupHover(this));
		}
	};
}
