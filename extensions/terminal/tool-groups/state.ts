export interface ToolGroupingStateDependencies {
	ToolExecutionComponent: { prototype: any };
	ToolGroupComponent: new () => any;
	readonly BASH_FILE_EDIT_PATCH_FLAG: symbol;
	readonly COMPONENT_PARENT: symbol;
	detectBashFileEdit(command: string): unknown;
	getToolName(tool: any): string;
	isIgnorableToolSeparator(value: unknown): boolean;
	isToolGroupingEnabled(): boolean;
	maybeMergeConsecutiveThinkingMessages(parent: any): void;
	requestToolRender(tool: any): void;
}

export const ACTIVE_TOOL_GROUPS = new Set<any>();

export function createToolGroupingState(deps: ToolGroupingStateDependencies) {
	const NON_GROUPABLE_TOOL_NAMES = new Set(["edit", "write", "apply_patch"]);

	function isToolGroupComponent(value: unknown): boolean {
		return value instanceof deps.ToolGroupComponent;
	}

	function isBashFileEditTool(tool: any): boolean {
		if (deps.getToolName(tool) !== "bash") return false;
		const command = tool?.args?.command;
		return typeof command === "string" && !!deps.detectBashFileEdit(command);
	}

	function isGroupableTool(value: unknown): boolean {
		return value instanceof (deps.ToolExecutionComponent as any)
			&& !NON_GROUPABLE_TOOL_NAMES.has(deps.getToolName(value))
			&& !isBashFileEditTool(value);
	}

	function ejectToolFromGroup(tool: any): void {
		const group = tool?.[deps.COMPONENT_PARENT];
		if (!isToolGroupComponent(group)) return;
		const parent = group[deps.COMPONENT_PARENT];
		const children = parent?.children;
		if (!Array.isArray(children)) return;
		const groupIndex = children.indexOf(group);
		if (groupIndex === -1) return;
		const expanded = group.expanded === true;
		const tools = group.releaseTools() as any[];
		const at = tools.indexOf(tool);
		if (at === -1) return;
		const piece = (members: any[]): any[] => {
			if (members.length === 0) return [];
			if (members.length === 1) {
				members[0][deps.COMPONENT_PARENT] = parent;
				return members;
			}
			const next = new deps.ToolGroupComponent();
			next.expanded = expanded;
			for (const member of members) next.addTool(member);
			next[deps.COMPONENT_PARENT] = parent;
			return [next];
		};
		tool[deps.COMPONENT_PARENT] = parent;
		children.splice(groupIndex, 1, ...piece(tools.slice(0, at)), tool, ...piece(tools.slice(at + 1)));
		try {
			deps.requestToolRender(tool);
		} catch { /* noop */ }
	}

	function patchBashFileEditGrouping(): void {
		const proto = deps.ToolExecutionComponent.prototype;
		if (proto[deps.BASH_FILE_EDIT_PATCH_FLAG]) return;
		for (const method of ["setArgsComplete", "markExecutionStarted"]) {
			const original = proto[method];
			if (typeof original !== "function") continue;
			proto[method] = function patchedBashFileEditGrouping(this: any, ...args: any[]) {
				const out = original.apply(this, args);
				if (isBashFileEditTool(this)) ejectToolFromGroup(this);
				return out;
			};
		}
		proto[deps.BASH_FILE_EDIT_PATCH_FLAG] = true;
	}

	function ungroupActiveToolGroups(): void {
		for (const group of [...ACTIVE_TOOL_GROUPS]) {
			const parent = group?.[deps.COMPONENT_PARENT];
			const children = parent?.children;
			if (!Array.isArray(children)) {
				ACTIVE_TOOL_GROUPS.delete(group);
				continue;
			}
			const index = children.indexOf(group);
			if (index === -1) {
				ACTIVE_TOOL_GROUPS.delete(group);
				continue;
			}
			const tools = group.releaseTools();
			for (const tool of tools) tool[deps.COMPONENT_PARENT] = parent;
			children.splice(index, 1, ...tools);
		}
	}

	function findPreviousToolSibling(children: any[], startIndex: number): { child: any; index: number } | undefined {
		for (let index = startIndex; index >= 0; index--) {
			const child = children[index];
			if (deps.isIgnorableToolSeparator(child)) continue;
			return { child, index };
		}
		return undefined;
	}

	function maybeGroupToolComponent(parent: any, component: any): void {
		if (!deps.isToolGroupingEnabled() || !isGroupableTool(component) || isToolGroupComponent(parent)) return;
		const children = parent?.children;
		if (!Array.isArray(children)) return;
		const index = children.indexOf(component);
		if (index <= 0) return;
		const previousEntry = findPreviousToolSibling(children, index - 1);
		if (!previousEntry) return;
		const previous = previousEntry.child;
		if (isToolGroupComponent(previous)) {
			children.splice(index, 1);
			previous.addTool(component);
			deps.maybeMergeConsecutiveThinkingMessages(parent);
			return;
		}
		if (isGroupableTool(previous)) {
			const group = new deps.ToolGroupComponent();
			group.expanded = previous.expanded === true || component.expanded === true;
			group.addTool(previous);
			group.addTool(component);
			group[deps.COMPONENT_PARENT] = parent;
			children[previousEntry.index] = group;
			children.splice(index, 1);
			deps.maybeMergeConsecutiveThinkingMessages(parent);
		}
	}

	return {
		ACTIVE_TOOL_GROUPS,
		ejectToolFromGroup,
		findPreviousToolSibling,
		isBashFileEditTool,
		isGroupableTool,
		isToolGroupComponent,
		maybeGroupToolComponent,
		patchBashFileEditGrouping,
		ungroupActiveToolGroups,
	};
}

