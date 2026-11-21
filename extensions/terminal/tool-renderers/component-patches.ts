import type { Theme } from "@earendil-works/pi-coding-agent";
import type { TuiMouseEvent } from "../fullscreen-mouse.ts";
import type { ApplyPatchRenderer } from "../tools/apply-patch-preview.ts";
import type { ToolCallRendererDependencies } from "./tool-calls.ts";
import type { ToolResultRendererDependencies } from "./tool-results.ts";

type ToolStatus = "pending" | "success" | "error" | "idle";

export interface ToolExecutionComponentPatchDependencies {
	prototype: object;
	componentParentKey: symbol;
	clearToolRenderCache(value: unknown): void;
	brightenRenderedLine(line: string): string;
	stripAnsi(value: string): string;
	isPrimaryClick(event: TuiMouseEvent): boolean;
	claimClickHover(owner: object, clear: () => void): void;
	requestComponentRender(component: any): void;
	toggleExpandedComponent(component: any, event?: TuiMouseEvent): boolean;
	toggleGroupedTools(group: any, tools: any[], event?: TuiMouseEvent): { handled: true } | undefined;
	syncToolCallStatus(ctx: any): void;
	getTextContent(result: any): string;
	collectNonEmptyLines(text: string, tailLimit?: number): { lines: string[]; total: number };
	applyPatchRenderer(): ApplyPatchRenderer | undefined;
	shouldUseGenericToolRenderer(toolName: unknown): boolean;
	renderGenericToolCall(
		toolName: string,
		args: any,
		theme: Theme,
		ctx: any,
		deps: ToolCallRendererDependencies,
	): any;
	toolCallRendererDependencies: ToolCallRendererDependencies;
	renderGenericToolResult(
		toolName: string,
		result: any,
		options: any,
		theme: Theme,
		ctx: any,
		deps: ToolResultRendererDependencies,
	): any;
	toolResultRendererDependencies: ToolResultRendererDependencies;
	shortPath(cwd: string, path: string): string;
	sanitizeToolResultForDisplay(result: any): any;
	stripTransientMagicContextTags(value: string): string;
}

const TOOL_CACHE_PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-tool-cache-invalidation");
const TOOL_MOUSE_PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-tool-fullscreen-mouse");
const TOOL_EXECUTION_PATCH_FLAG = Symbol.for("pi-claude-style-tools:patched-tool-execution");
const TOOL_HOVER_KEY = Symbol.for("pi-claude-style-tools:tool-hover");
const TOOL_MOUSE_EVENT_KEY = Symbol.for("pi-claude-style-tools:tool-mouse-event");
const TOOL_UPDATE_DISPLAY_ACTIVE = Symbol("pi-claude-style-tools:update-display-active");
const TOOL_UPDATE_DISPLAY_RERUN = Symbol("pi-claude-style-tools:update-display-rerun");

export function setToolHover(component: any, hovered: boolean, clearToolRenderCache: (value: unknown) => void): boolean {
	if (component[TOOL_HOVER_KEY] === hovered) return false;
	component[TOOL_HOVER_KEY] = hovered;
	clearToolRenderCache(component);
	return true;
}

export function createToolExecutionComponentPatches(deps: ToolExecutionComponentPatchDependencies) {
	const proto = deps.prototype as any;

	function toggleToolRowByClick(tool: any, event: TuiMouseEvent): { handled: true } | undefined {
		const group = tool[deps.componentParentKey];
		if (group?.constructor?.name === "ToolGroupComponent") {
			return deps.toggleGroupedTools(group, Array.isArray(group.tools) ? group.tools : [tool], event);
		}
		if (!deps.toggleExpandedComponent(tool, event)) return undefined;
		deps.requestComponentRender(tool);
		return { handled: true };
	}

	function syncLiveToolRenderState(component: any): void {
		const state = component?.rendererState;
		if (!state || typeof state !== "object") return;
		const ctxLike = {
			state,
			isPartial: component?.isPartial === true,
			executionStarted: component?.executionStarted === true,
			isError: component?.result?.isError === true,
		};
		deps.syncToolCallStatus(ctxLike);
		if (component?.isPartial === true && component?.result) {
			const raw = deps.getTextContent(component.result).replace(/\r\n/g, "\n").trimEnd();
			state._liveLineCount = deps.collectNonEmptyLines(raw, 0).total;
		} else if (component?.isPartial !== true) {
			delete state._liveLineCount;
			if (component?.toolName === "edit" && component.result && (!ctxLike.isError || component.result.role === "toolResult")) {
				state._editResult = component.result.details ?? {};
			}
		}
	}

	return {
		patchToolFullscreenMouse(): void {
			if (proto[TOOL_MOUSE_PATCH_FLAG]) return;
			const originalHandleMouse = proto.handleMouse;
			if (typeof originalHandleMouse !== "function") return;
			const originalRender = proto.render;
			proto.render = function patchedToolHoverRender(width: number) {
				const lines = originalRender.call(this, width);
				if (this[TOOL_HOVER_KEY] !== true || !Array.isArray(lines)) return lines;
				const titleIndex = lines.findIndex((line: string) => {
					const plain = deps.stripAnsi(line);
					return plain.trim().length > 0 && !/^\s*[╭╰─│]+\s*$/.test(plain);
				});
				if (titleIndex < 0) return lines;
				const rendered = lines.slice();
				rendered[titleIndex] = deps.brightenRenderedLine(rendered[titleIndex]);
				return rendered;
			};
			const originalCreateResultRegion = proto.createResultRegion;
			if (typeof originalCreateResultRegion === "function") {
				proto.createResultRegion = function patchedCreateResultRegion(this: any, component: unknown) {
					const region = originalCreateResultRegion.call(this, component);
					if (region && typeof region.onMouse === "function") {
						const tool = this;
						region.onMouse = (event: TuiMouseEvent) => {
							if (event.type !== "click" || event.button !== "left") return undefined;
							if (!deps.isPrimaryClick(event) || !tool.result) return undefined;
							return toggleToolRowByClick(tool, tool[TOOL_MOUSE_EVENT_KEY] ?? event);
						};
					}
					return region;
				};
			}
			proto.handleMouse = function patchedToolHandleMouse(event: TuiMouseEvent) {
				this[TOOL_MOUSE_EVENT_KEY] = event;
				if (event.type === "move") {
					deps.claimClickHover(this, () => {
						if (setToolHover(this, false, deps.clearToolRenderCache)) deps.requestComponentRender(this);
					});
					return setToolHover(this, true, deps.clearToolRenderCache) ? { handled: true, render: true } : undefined;
				}
				const result = originalHandleMouse.call(this, event);
				if (result) return result;
				if (!deps.isPrimaryClick(event) || !this.result) return undefined;
				return toggleToolRowByClick(this, event);
			};
			proto[TOOL_MOUSE_PATCH_FLAG] = true;
		},

		patchToolRenderCacheInvalidation(): void {
			if (proto[TOOL_CACHE_PATCH_FLAG]) return;
			const methods = [
				"updateDisplay",
				"updateArgs",
				"markExecutionStarted",
				"setArgsComplete",
				"updateResult",
				"setExpanded",
				"setShowImages",
				"setImageWidthCells",
				"invalidate",
			];
			for (const method of methods) {
				const original = proto[method];
				if (typeof original !== "function") continue;
				const run = function patchedToolMutation(this: any, ...args: any[]) {
					deps.clearToolRenderCache(this);
					if (method === "updateDisplay" || method === "updateResult" || method === "invalidate") {
						syncLiveToolRenderState(this);
					}
					const result = original.apply(this, args);
					deps.clearToolRenderCache(this);
					return result;
				};
				proto[method] = method !== "updateDisplay" ? run : function patchedToolUpdateDisplay(this: any, ...args: any[]) {
					if (this[TOOL_UPDATE_DISPLAY_ACTIVE]) {
						this[TOOL_UPDATE_DISPLAY_RERUN] = true;
						return undefined;
					}
					this[TOOL_UPDATE_DISPLAY_ACTIVE] = true;
					try {
						let result = run.apply(this, args);
						if (this[TOOL_UPDATE_DISPLAY_RERUN]) {
							this[TOOL_UPDATE_DISPLAY_RERUN] = false;
							result = run.apply(this, args);
						}
						return result;
					} finally {
						this[TOOL_UPDATE_DISPLAY_ACTIVE] = false;
						this[TOOL_UPDATE_DISPLAY_RERUN] = false;
					}
				};
			}
			proto[TOOL_CACHE_PATCH_FLAG] = true;
		},

		patchToolExecutionRenderers(): void {
			if (proto[TOOL_EXECUTION_PATCH_FLAG]) return;
			const applyPatchRenderer = deps.applyPatchRenderer();
			if (!applyPatchRenderer) return;
			const originalHasRendererDefinition = proto.hasRendererDefinition;
			const originalGetCallRenderer = proto.getCallRenderer;
			const originalGetResultRenderer = proto.getResultRenderer;
			if (typeof originalHasRendererDefinition === "function") {
				proto.hasRendererDefinition = function patchedHasRendererDefinition() {
					return originalHasRendererDefinition.call(this) || deps.shouldUseGenericToolRenderer(this?.toolName);
				};
			}
			proto.getCallRenderer = function patchedGetCallRenderer() {
				const toolName = typeof this?.toolName === "string" ? this.toolName : "";
				if (toolName === "apply_patch") {
					return (args: any, theme: Theme, ctx: any) =>
						applyPatchRenderer.renderApplyPatchCall(args, theme, ctx, (path: string) => deps.shortPath(ctx.cwd ?? process.cwd(), path));
				}
				if (deps.shouldUseGenericToolRenderer(toolName)) {
					return (args: any, theme: Theme, ctx: any) =>
						deps.renderGenericToolCall(toolName, args, theme, ctx, deps.toolCallRendererDependencies);
				}
				return typeof originalGetCallRenderer === "function" ? originalGetCallRenderer.call(this) : undefined;
			};
			proto.getResultRenderer = function patchedGetResultRenderer() {
				const toolName = typeof this?.toolName === "string" ? this.toolName : "";
				let renderer: any;
				if (toolName === "apply_patch") {
					renderer = (result: any, options: any, theme: Theme, ctx: any) =>
						applyPatchRenderer.renderApplyPatchResult({ content: result.content, details: result.details }, options.isPartial, theme, ctx);
				} else if (deps.shouldUseGenericToolRenderer(toolName)) {
					renderer = (result: any, options: any, theme: Theme, ctx: any) =>
						deps.renderGenericToolResult(toolName, result, options, theme, ctx, deps.toolResultRendererDependencies);
				} else {
					renderer = typeof originalGetResultRenderer === "function" ? originalGetResultRenderer.call(this) : undefined;
				}
				if (typeof renderer !== "function") return renderer;
				return (result: any, options: any, theme: Theme, ctx: any) =>
					renderer(deps.sanitizeToolResultForDisplay(result), options, theme, ctx);
			};
			const originalFormatToolExecution = proto.formatToolExecution;
			if (typeof originalFormatToolExecution === "function") {
				proto.formatToolExecution = function patchedFormatToolExecution(this: any, ...args: any[]) {
					const formatted = originalFormatToolExecution.apply(this, args);
					return typeof formatted === "string" ? deps.stripTransientMagicContextTags(formatted) : formatted;
				};
			}
			proto[TOOL_EXECUTION_PATCH_FLAG] = true;
		},
	};
}
